use anyhow::{bail, Result};
use pire_browser_core::redaction::redact_text;
use serde_json::{json, Map, Value};
use std::io::{self, BufRead, Write};
use std::process::Command;

const MCP_PROTOCOL_VERSION: &str = "2025-11-25";
const SERVER_NAME: &str = "pire-browser";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpToolsProfile {
    Core,
}

impl McpToolsProfile {
    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "core" | "all" => Ok(Self::Core),
            other => bail!(
                "unsupported mcp tools profile `{other}`; the current public MCP profile is `core`"
            ),
        }
    }
}

pub fn run_mcp_server(profile: McpToolsProfile) -> Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        match handle_message(&line, profile) {
            Some(response) => {
                writeln!(stdout, "{}", serde_json::to_string(&response)?)?;
                stdout.flush()?;
            }
            None => {}
        }
    }
    Ok(())
}

fn handle_message(line: &str, profile: McpToolsProfile) -> Option<Value> {
    let value = match serde_json::from_str::<Value>(line) {
        Ok(value) => value,
        Err(err) => {
            return Some(jsonrpc_error(
                Value::Null,
                -32700,
                &format!("Parse error: {err}"),
            ));
        }
    };
    handle_value(&value, profile)
}

fn handle_value(value: &Value, profile: McpToolsProfile) -> Option<Value> {
    let id = value.get("id").cloned();
    let method = value.get("method").and_then(Value::as_str);
    let is_notification = id.is_none();

    match method {
        Some("initialize") => id.map(|id| jsonrpc_result(id, initialize_result())),
        Some("notifications/initialized" | "notifications/cancelled") => None,
        Some("ping") => id.map(|id| jsonrpc_result(id, json!({}))),
        Some("tools/list") => id.map(|id| {
            jsonrpc_result(
                id,
                json!({
                    "tools": mcp_tools(profile)
                }),
            )
        }),
        Some("tools/call") => {
            let Some(id) = id else {
                return None;
            };
            let params = value.get("params").cloned().unwrap_or_else(|| json!({}));
            Some(jsonrpc_result(
                id,
                handle_tools_call(&params, profile)
                    .unwrap_or_else(|message| tool_error_text(message)),
            ))
        }
        Some(other) if is_notification => {
            eprintln!("pire-browser mcp: ignored notification `{other}`");
            None
        }
        Some(other) => {
            id.map(|id| jsonrpc_error(id, -32601, &format!("Method not found: {other}")))
        }
        None => Some(jsonrpc_error(
            id.unwrap_or(Value::Null),
            -32600,
            "Invalid Request: missing method",
        )),
    }
}

fn initialize_result() -> Value {
    json!({
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "capabilities": {
            "tools": {
                "listChanged": false
            }
        },
        "serverInfo": {
            "name": SERVER_NAME,
            "title": "pire-browser",
            "version": env!("CARGO_PKG_VERSION")
        },
        "instructions": "Use pire_browser_open, pire_browser_snapshot, semantic find/action tools, pire_browser_get, pire_browser_is, waits, screenshots/PDFs, mouse/debugging tools, settings/emulation, cookies/storage, network/auth/state/session/profile tools, transfers, clipboard, tabs/frames/windows/status, and pire_browser_skills_get_core for Firefox-backed browser automation. Inspect before acting and refresh refs after page changes."
    })
}

fn handle_tools_call(
    params: &Value,
    profile: McpToolsProfile,
) -> std::result::Result<Value, String> {
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| "tools/call params.name is required".to_string())?;
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let args = tool_command_args(name, &arguments, profile)?;
    Ok(run_cli_tool(args))
}

fn run_cli_tool(args: Vec<String>) -> Value {
    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(err) => {
            return tool_error_text(format!("failed to resolve pire-browser executable: {err}"))
        }
    };
    let output = match Command::new(exe).args(args).output() {
        Ok(output) => output,
        Err(err) => return tool_error_text(format!("failed to run pire-browser command: {err}")),
    };
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = redact_text(String::from_utf8_lossy(&output.stderr).trim());
    let text = if stdout.is_empty() && stderr.is_empty() {
        format!(
            "pire-browser exited with status {}",
            exit_status_text(output.status.code())
        )
    } else if stdout.is_empty() {
        stderr.clone()
    } else if stderr.is_empty() {
        stdout.clone()
    } else {
        format!("{stdout}\n\nstderr:\n{stderr}")
    };
    let mut result = json!({
        "content": [{
            "type": "text",
            "text": text
        }],
        "isError": !output.status.success()
    });
    if let Ok(parsed) = serde_json::from_str::<Value>(&stdout) {
        result["structuredContent"] = parsed;
    }
    result
}

fn exit_status_text(code: Option<i32>) -> String {
    code.map(|code| code.to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

fn tool_error_text(message: String) -> Value {
    json!({
        "content": [{
            "type": "text",
            "text": redact_text(&message)
        }],
        "isError": true
    })
}

fn tool_command_args(
    name: &str,
    arguments: &Value,
    profile: McpToolsProfile,
) -> std::result::Result<Vec<String>, String> {
    let object = arguments
        .as_object()
        .ok_or_else(|| "tool arguments must be an object".to_string())?;
    let mut args = target_args(object)?;
    match (profile, name) {
        (_, "pire_browser_open") => {
            if let Some(color_scheme) = optional_color_scheme(object, "colorScheme")? {
                args.push("--color-scheme".to_string());
                args.push(color_scheme);
            }
            args.push("open".to_string());
            if let Some(url) = optional_string(object, "url")? {
                args.push(url);
            }
            if optional_bool(object, "newTab")? {
                args.push("--new-tab".to_string());
            }
            if let Some(label) = optional_string(object, "label")? {
                args.push("--label".to_string());
                args.push(label);
            }
        }
        (_, "pire_browser_snapshot") => {
            args.push("snapshot".to_string());
            if optional_bool_default(object, "interactive", true)? {
                args.push("-i".to_string());
            }
            if optional_bool(object, "compact")? {
                args.push("-c".to_string());
            }
            if optional_bool(object, "urls")? {
                args.push("-u".to_string());
            }
            if let Some(depth) = optional_u64(object, "depth")? {
                args.push("-d".to_string());
                args.push(depth.to_string());
            }
            if let Some(selector) = optional_string(object, "selector")? {
                args.push("-s".to_string());
                args.push(selector);
            }
        }
        (_, "pire_browser_find") => {
            push_find_args(&mut args, object)?;
        }
        (_, "pire_browser_click") => {
            args.push("click".to_string());
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_double_click") => {
            args.push("dblclick".to_string());
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_fill") => {
            args.push("fill".to_string());
            args.push(required_string(object, "selector")?);
            args.push(required_string(object, "text")?);
        }
        (_, "pire_browser_type") => {
            args.push("type".to_string());
            args.push(required_string(object, "selector")?);
            args.push(required_string(object, "text")?);
        }
        (_, "pire_browser_press") => {
            args.push("press".to_string());
            args.push(required_string(object, "key")?);
        }
        (_, "pire_browser_keyboard_type") => {
            args.push("keyboard".to_string());
            args.push("type".to_string());
            args.push(required_string(object, "text")?);
        }
        (_, "pire_browser_keyboard_insert_text") => {
            args.push("keyboard".to_string());
            args.push("inserttext".to_string());
            args.push(required_string(object, "text")?);
        }
        (_, "pire_browser_key_down") => {
            args.push("keydown".to_string());
            args.push(required_string(object, "key")?);
        }
        (_, "pire_browser_key_up") => {
            args.push("keyup".to_string());
            args.push(required_string(object, "key")?);
        }
        (_, "pire_browser_hover") => {
            args.push("hover".to_string());
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_focus") => {
            args.push("focus".to_string());
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_select") => {
            args.push("select".to_string());
            args.push(required_string(object, "selector")?);
            args.push(required_string(object, "value")?);
        }
        (_, "pire_browser_check") => {
            args.push("check".to_string());
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_uncheck") => {
            args.push("uncheck".to_string());
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_scroll") => {
            args.push("scroll".to_string());
            let direction =
                optional_string(object, "direction")?.unwrap_or_else(|| "down".to_string());
            if !matches!(direction.as_str(), "up" | "down" | "left" | "right") {
                return Err("direction must be up, down, left, or right".to_string());
            }
            args.push(direction);
            if let Some(pixels) = optional_u64(object, "pixels")? {
                args.push(pixels.to_string());
            }
            if let Some(selector) = optional_string(object, "selector")? {
                args.push("--selector".to_string());
                args.push(selector);
            }
        }
        (_, "pire_browser_scroll_into_view") => {
            args.push("scrollintoview".to_string());
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_drag") => {
            args.push("drag".to_string());
            args.push(required_string(object, "source")?);
            args.push(required_string(object, "target")?);
        }
        (_, "pire_browser_mouse_move") => {
            args.push("mouse".to_string());
            args.push("move".to_string());
            args.push(required_u64(object, "x")?.to_string());
            args.push(required_u64(object, "y")?.to_string());
        }
        (_, "pire_browser_mouse_down") => {
            args.push("mouse".to_string());
            args.push("down".to_string());
            if let Some(button) = optional_mouse_button(object)? {
                args.push(button);
            }
        }
        (_, "pire_browser_mouse_up") => {
            args.push("mouse".to_string());
            args.push("up".to_string());
            if let Some(button) = optional_mouse_button(object)? {
                args.push(button);
            }
        }
        (_, "pire_browser_mouse_wheel") => {
            args.push("mouse".to_string());
            args.push("wheel".to_string());
            args.push(required_i64(object, "dy")?.to_string());
            if let Some(dx) = optional_i64(object, "dx")? {
                args.push(dx.to_string());
            }
        }
        (_, "pire_browser_wait") => {
            args.push("wait".to_string());
            let condition_count = ["milliseconds", "selector", "text", "url", "loadState"]
                .iter()
                .filter(|key| object.contains_key(**key))
                .count();
            if condition_count == 0 {
                return Err(
                    "pire_browser_wait requires one of milliseconds, selector, text, url, or loadState"
                        .to_string(),
                );
            }
            if condition_count > 1 {
                return Err(
                    "pire_browser_wait accepts only one wait condition at a time".to_string(),
                );
            }
            if let Some(milliseconds) = optional_u64(object, "milliseconds")? {
                args.push(milliseconds.to_string());
            } else if let Some(selector) = optional_string(object, "selector")? {
                args.push("--selector".to_string());
                args.push(selector);
            } else if let Some(text) = optional_string(object, "text")? {
                args.push("--text".to_string());
                args.push(text);
            } else if let Some(url) = optional_string(object, "url")? {
                args.push("--url".to_string());
                args.push(url);
            } else if let Some(load_state) = optional_string(object, "loadState")? {
                args.push("--load".to_string());
                args.push(load_state);
            }
            if let Some(state) = optional_string(object, "state")? {
                args.push("--state".to_string());
                args.push(state);
            }
            if let Some(timeout) = optional_u64(object, "timeout")? {
                args.push("--timeout".to_string());
                args.push(timeout.to_string());
            }
        }
        (_, "pire_browser_screenshot") => {
            args.push("screenshot".to_string());
            if let Some(path) = optional_string(object, "path")? {
                args.push(path);
            }
            if optional_bool(object, "full")? {
                args.push("--full".to_string());
            }
            if optional_bool(object, "annotate")? {
                args.push("--annotate".to_string());
            }
            if let Some(dir) = optional_string(object, "screenshotDir")? {
                args.push("--screenshot-dir".to_string());
                args.push(dir);
            }
            if let Some(format) = optional_string(object, "format")? {
                args.push("--screenshot-format".to_string());
                args.push(format);
            }
            if let Some(quality) = optional_u64(object, "quality")? {
                args.push("--screenshot-quality".to_string());
                args.push(quality.to_string());
            }
        }
        (_, "pire_browser_pdf") => {
            args.push("pdf".to_string());
            args.push(required_string(object, "path")?);
            if optional_bool(object, "viewport")? {
                args.push("--viewport".to_string());
            }
        }
        (_, "pire_browser_console") => {
            args.push("console".to_string());
            if optional_bool(object, "clear")? {
                args.push("--clear".to_string());
            }
        }
        (_, "pire_browser_errors") => {
            args.push("errors".to_string());
            if optional_bool(object, "clear")? {
                args.push("--clear".to_string());
            }
        }
        (_, "pire_browser_dialog_status") => {
            args.push("dialog".to_string());
            args.push("status".to_string());
        }
        (_, "pire_browser_dialog_accept") => {
            args.push("dialog".to_string());
            args.push("accept".to_string());
            if let Some(text) = optional_string(object, "text")? {
                args.push(text);
            }
        }
        (_, "pire_browser_dialog_dismiss") => {
            args.push("dialog".to_string());
            args.push("dismiss".to_string());
        }
        (_, "pire_browser_highlight") => {
            args.push("highlight".to_string());
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_vitals") => {
            args.push("vitals".to_string());
            if let Some(url) = optional_string(object, "url")? {
                args.push(url);
            }
        }
        (_, "pire_browser_download") => {
            args.push("download".to_string());
            args.push(required_string(object, "selector")?);
            args.push(required_string(object, "path")?);
            if let Some(timeout) = optional_u64(object, "timeout")? {
                args.push("--timeout".to_string());
                args.push(timeout.to_string());
            }
        }
        (_, "pire_browser_wait_download") => {
            args.push("wait".to_string());
            args.push("--download".to_string());
            if let Some(path) = optional_string(object, "path")? {
                args.push(path);
            }
            if let Some(timeout) = optional_u64(object, "timeout")? {
                args.push("--timeout".to_string());
                args.push(timeout.to_string());
            }
        }
        (_, "pire_browser_upload") => {
            args.push("upload".to_string());
            args.push(required_string(object, "selector")?);
            let files = optional_string_array(object, "files")?;
            if files.is_empty() {
                return Err("files must contain at least one path".to_string());
            }
            args.extend(files);
        }
        (_, "pire_browser_clipboard") => {
            args.push("clipboard".to_string());
            let action = required_string(object, "action")?;
            if !matches!(action.as_str(), "read" | "write" | "copy" | "paste") {
                return Err("action must be read, write, copy, or paste".to_string());
            }
            args.push(action.clone());
            if action == "write" {
                args.push(required_string(object, "text")?);
            }
        }
        (_, "pire_browser_get") => {
            let property = required_string(object, "property")?;
            match property.as_str() {
                "title" | "url" => {
                    args.push("get".to_string());
                    args.push(property);
                }
                "text" | "html" | "value" | "count" | "box" | "styles" => {
                    args.push("get".to_string());
                    args.push(property);
                    args.push(required_string(object, "selector")?);
                }
                "attr" => {
                    args.push("get".to_string());
                    args.push(property);
                    args.push(required_string(object, "selector")?);
                    args.push(required_string(object, "attribute")?);
                }
                _ => {
                    return Err(
                        "property must be text, html, value, attr, title, url, count, box, or styles"
                            .to_string(),
                    );
                }
            }
        }
        (_, "pire_browser_is") => {
            let state = required_string(object, "state")?;
            if !matches!(state.as_str(), "visible" | "enabled" | "checked") {
                return Err("state must be visible, enabled, or checked".to_string());
            }
            args.push("is".to_string());
            args.push(state);
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_get_url") => {
            args.push("get".to_string());
            args.push("url".to_string());
        }
        (_, "pire_browser_status") => {
            args.push("status".to_string());
        }
        (_, "pire_browser_set_viewport") => {
            args.push("set".to_string());
            args.push("viewport".to_string());
            args.push(required_u64(object, "width")?.to_string());
            args.push(required_u64(object, "height")?.to_string());
            if let Some(scale) = optional_string_or_number(object, "scale")? {
                args.push(scale);
            }
        }
        (_, "pire_browser_set_device") => {
            args.push("set".to_string());
            args.push("device".to_string());
            args.push(required_string(object, "name")?);
        }
        (_, "pire_browser_set_geo") => {
            args.push("set".to_string());
            args.push("geo".to_string());
            args.push(required_f64(object, "latitude")?.to_string());
            args.push(required_f64(object, "longitude")?.to_string());
        }
        (_, "pire_browser_set_headers") => {
            args.push("set".to_string());
            args.push("headers".to_string());
            args.push(required_headers_json(object)?);
        }
        (_, "pire_browser_set_credentials") => {
            args.push("set".to_string());
            args.push("credentials".to_string());
            args.push(required_string(object, "username")?);
            args.push(required_string(object, "password")?);
        }
        (_, "pire_browser_set_media") => {
            args.push("set".to_string());
            args.push("media".to_string());
            args.push(required_color_scheme(object, "scheme")?);
        }
        (_, "pire_browser_set_offline") => {
            args.push("set".to_string());
            args.push("offline".to_string());
            args.push(
                if optional_bool_default(object, "enabled", true)? {
                    "on"
                } else {
                    "off"
                }
                .to_string(),
            );
        }
        (_, "pire_browser_cookies_list") => {
            args.push("cookies".to_string());
        }
        (_, "pire_browser_cookies_set") => {
            args.push("cookies".to_string());
            args.push("set".to_string());
            args.push(required_string(object, "name")?);
            args.push(required_string(object, "value")?);
        }
        (_, "pire_browser_cookies_clear") => {
            args.push("cookies".to_string());
            args.push("clear".to_string());
        }
        (_, "pire_browser_storage_get") => {
            args.push("storage".to_string());
            args.push(required_storage_area(object)?);
            if let Some(key) = optional_string(object, "key")? {
                args.push(key);
            }
        }
        (_, "pire_browser_storage_set") => {
            args.push("storage".to_string());
            args.push(required_storage_area(object)?);
            args.push("set".to_string());
            args.push(required_string(object, "key")?);
            args.push(required_string(object, "value")?);
        }
        (_, "pire_browser_storage_clear") => {
            args.push("storage".to_string());
            args.push(required_storage_area(object)?);
            args.push("clear".to_string());
        }
        (_, "pire_browser_network_requests") => {
            args.push("network".to_string());
            args.push("requests".to_string());
            if optional_bool(object, "clear")? {
                args.push("--clear".to_string());
            }
            push_optional_flag_value(&mut args, object, "filter", "--filter")?;
            push_optional_flag_value(&mut args, object, "resourceType", "--type")?;
            push_optional_flag_value(&mut args, object, "method", "--method")?;
            push_optional_flag_value(&mut args, object, "status", "--status")?;
        }
        (_, "pire_browser_network_request") => {
            args.push("network".to_string());
            args.push("request".to_string());
            args.push(required_string(object, "requestId")?);
        }
        (_, "pire_browser_network_har_start") => {
            args.push("network".to_string());
            args.push("har".to_string());
            args.push("start".to_string());
        }
        (_, "pire_browser_network_har_stop") => {
            args.push("network".to_string());
            args.push("har".to_string());
            args.push("stop".to_string());
            if let Some(path) = optional_string(object, "path")? {
                args.push(path);
            }
        }
        (_, "pire_browser_network_har_export") => {
            args.push("network".to_string());
            args.push("har".to_string());
            if let Some(path) = optional_string(object, "path")? {
                args.push(path);
            }
            push_optional_flag_value(&mut args, object, "filter", "--filter")?;
        }
        (_, "pire_browser_network_route") => {
            args.push("network".to_string());
            args.push("route".to_string());
            args.push(required_string(object, "pattern")?);
            let abort = optional_bool(object, "abort")?;
            let body = optional_string(object, "body")?;
            if abort && body.is_some() {
                return Err("network route cannot combine abort and body".to_string());
            }
            if abort {
                args.push("--abort".to_string());
            }
            if let Some(body) = body {
                args.push("--body".to_string());
                args.push(body);
            }
            push_optional_flag_value(&mut args, object, "contentType", "--content-type")?;
            push_optional_flag_value(&mut args, object, "resourceType", "--resource-type")?;
        }
        (_, "pire_browser_network_unroute") => {
            args.push("network".to_string());
            args.push("unroute".to_string());
            if let Some(target) = optional_string(object, "target")? {
                args.push(target);
            }
        }
        (_, "pire_browser_auth_save") => {
            args.push("auth".to_string());
            args.push("save".to_string());
            args.push(required_string(object, "name")?);
            args.push("--url".to_string());
            args.push(required_string(object, "url")?);
            args.push("--username".to_string());
            args.push(required_string(object, "username")?);
            args.push("--password".to_string());
            args.push(required_string(object, "password")?);
            if let Some(selector) = optional_string(object, "usernameSelector")? {
                args.push("--username-selector".to_string());
                args.push(selector);
            }
            if let Some(selector) = optional_string(object, "passwordSelector")? {
                args.push("--password-selector".to_string());
                args.push(selector);
            }
            if let Some(selector) = optional_string(object, "submitSelector")? {
                args.push("--submit-selector".to_string());
                args.push(selector);
            }
        }
        (_, "pire_browser_auth_login") => {
            args.push("auth".to_string());
            args.push("login".to_string());
            args.push(required_string(object, "name")?);
        }
        (_, "pire_browser_auth_list") => {
            args.push("auth".to_string());
            args.push("list".to_string());
        }
        (_, "pire_browser_auth_show") => {
            args.push("auth".to_string());
            args.push("show".to_string());
            args.push(required_string(object, "name")?);
        }
        (_, "pire_browser_auth_delete") => {
            args.push("auth".to_string());
            args.push("delete".to_string());
            args.push(required_string(object, "name")?);
        }
        (_, "pire_browser_state_save") => {
            args.push("state".to_string());
            args.push("save".to_string());
            args.push(required_string(object, "path")?);
        }
        (_, "pire_browser_state_load") => {
            args.push("state".to_string());
            args.push("load".to_string());
            let require_inspected = optional_bool(object, "requireInspected")?;
            let no_require_inspected = optional_bool(object, "noRequireInspected")?;
            if require_inspected && no_require_inspected {
                return Err(
                    "cannot use requireInspected and noRequireInspected together".to_string(),
                );
            }
            if require_inspected {
                args.push("--require-inspected".to_string());
            }
            if no_require_inspected {
                args.push("--no-require-inspected".to_string());
            }
            args.push(required_string(object, "path")?);
        }
        (_, "pire_browser_state_list") => {
            args.push("state".to_string());
            args.push("list".to_string());
        }
        (_, "pire_browser_state_show") => {
            args.push("state".to_string());
            args.push("show".to_string());
            args.push(required_string(object, "path")?);
        }
        (_, "pire_browser_state_inspect") => {
            args.push("state".to_string());
            args.push("inspect".to_string());
            if optional_bool(object, "record")? {
                args.push("--record".to_string());
            }
            args.push(required_string(object, "path")?);
        }
        (_, "pire_browser_state_rename") => {
            args.push("state".to_string());
            args.push("rename".to_string());
            args.push(required_string(object, "old")?);
            args.push(required_string(object, "new")?);
        }
        (_, "pire_browser_state_clear") => {
            args.push("state".to_string());
            args.push("clear".to_string());
            let all = optional_bool(object, "all")?;
            let name = optional_string(object, "name")?;
            if all && name.is_some() {
                return Err("state clear cannot combine all and name".to_string());
            }
            if all {
                args.push("--all".to_string());
            } else {
                args.push(name.ok_or_else(|| "state clear requires name or all=true".to_string())?);
            }
        }
        (_, "pire_browser_state_clean") => {
            args.push("state".to_string());
            args.push("clean".to_string());
            args.push("--older-than".to_string());
            args.push(required_u64(object, "olderThanDays")?.to_string());
        }
        (_, "pire_browser_session_list") => {
            args.push("session".to_string());
            args.push("list".to_string());
        }
        (_, "pire_browser_session_attach") => {
            args.push("session".to_string());
            args.push("attach".to_string());
            args.push(required_string(object, "sessionId")?);
        }
        (_, "pire_browser_session_cleanup") => {
            args.push("session".to_string());
            args.push("cleanup".to_string());
        }
        (_, "pire_browser_profiles_list") => {
            args.push("profiles".to_string());
        }
        (_, "pire_browser_tabs_list") => {
            args.push("tabs".to_string());
            args.push("list".to_string());
        }
        (_, "pire_browser_tab_new") => {
            args.push("tab".to_string());
            args.push("new".to_string());
            if let Some(url) = optional_string(object, "url")? {
                args.push(url);
            }
            if let Some(label) = optional_string(object, "label")? {
                args.push("--label".to_string());
                args.push(label);
            }
        }
        (_, "pire_browser_tabs_select") => {
            args.push("tabs".to_string());
            args.push("select".to_string());
            args.push(required_string(object, "target")?);
        }
        (_, "pire_browser_tabs_close") => {
            args.push("tabs".to_string());
            args.push("close".to_string());
            if let Some(target) = optional_string(object, "target")? {
                args.push(target);
            }
        }
        (_, "pire_browser_tabs_label") => {
            args.push("tabs".to_string());
            args.push("label".to_string());
            args.push(required_string(object, "target")?);
            args.push(required_string(object, "label")?);
        }
        (_, "pire_browser_frame_select") => {
            args.push("frame".to_string());
            args.push(required_string(object, "target")?);
        }
        (_, "pire_browser_frame_main") => {
            args.push("frame".to_string());
            args.push("main".to_string());
        }
        (_, "pire_browser_window_new") => {
            args.push("window".to_string());
            args.push("new".to_string());
        }
        (_, "pire_browser_eval") => {
            args.push("eval".to_string());
            args.push(required_string(object, "script")?);
        }
        (_, "pire_browser_close") => {
            args.push("close".to_string());
            if optional_bool(object, "all")? {
                args.push("--all".to_string());
            }
        }
        (_, "pire_browser_skills_get_core") => {
            args.push("skills".to_string());
            args.push("get".to_string());
            args.push("core".to_string());
        }
        (_, other) => return Err(format!("unknown pire-browser MCP tool `{other}`")),
    }
    if !matches!(name, "pire_browser_skills_get_core") {
        args.insert(0, "--json".to_string());
    }
    args.extend(optional_string_array(object, "extraArgs")?);
    Ok(args)
}

fn push_find_args(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
) -> std::result::Result<(), String> {
    args.push("find".to_string());
    let kind = required_string(object, "kind")?;
    match kind.as_str() {
        "role" => {
            args.push(kind);
            args.push(required_string(object, "query")?);
            if let Some(name) = optional_string(object, "name")? {
                args.push("--name".to_string());
                args.push(name);
            }
            push_find_index_and_exact(args, object, true)?;
        }
        "label" | "text" | "placeholder" | "alt" | "title" => {
            args.push(kind);
            args.push(required_string(object, "query")?);
            push_find_index_and_exact(args, object, true)?;
        }
        "testid" => {
            args.push(kind);
            args.push(required_string(object, "query")?);
            push_find_index_and_exact(args, object, false)?;
        }
        "first" | "last" => {
            args.push(kind);
            args.push(required_string(object, "query")?);
            reject_unscoped_find_options(object, &["index", "exact", "name", "nth"])?;
        }
        "nth" => {
            args.push(kind);
            if object.contains_key("nth") && object.contains_key("index") {
                return Err("use nth or index for kind nth, not both".to_string());
            }
            let nth = optional_u64(object, "nth")?
                .or(optional_u64(object, "index")?)
                .ok_or_else(|| "nth is required when kind is nth".to_string())?;
            args.push(nth.to_string());
            args.push(required_string(object, "query")?);
            reject_unscoped_find_options(object, &["exact", "name"])?;
        }
        _ => {
            return Err(
                "kind must be role, label, text, placeholder, alt, title, testid, first, last, or nth"
                    .to_string(),
            );
        }
    }

    if let Some(action) = optional_string(object, "action")? {
        push_find_action(args, object, action)?;
    } else if object.contains_key("value") {
        return Err("value requires an action".to_string());
    }
    Ok(())
}

fn push_find_index_and_exact(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    allow_exact: bool,
) -> std::result::Result<(), String> {
    if let Some(index) = optional_u64(object, "index")? {
        args.push("--index".to_string());
        args.push(index.to_string());
    }
    if optional_bool(object, "exact")? {
        if !allow_exact {
            return Err("exact is only supported for role, label, text, placeholder, alt, and title find locators".to_string());
        }
        args.push("--exact".to_string());
    }
    if object.contains_key("nth") {
        return Err("nth is only supported when kind is nth".to_string());
    }
    Ok(())
}

fn reject_unscoped_find_options(
    object: &Map<String, Value>,
    keys: &[&str],
) -> std::result::Result<(), String> {
    for key in keys {
        if object.contains_key(*key) {
            return Err(format!("{key} is not supported for this find kind"));
        }
    }
    Ok(())
}

fn push_find_action(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    action: String,
) -> std::result::Result<(), String> {
    let needs_value = matches!(action.as_str(), "fill" | "type" | "select" | "attr");
    let allows_no_value = matches!(
        action.as_str(),
        "click"
            | "dblclick"
            | "hover"
            | "focus"
            | "check"
            | "uncheck"
            | "text"
            | "html"
            | "value"
            | "box"
            | "styles"
            | "highlight"
            | "scrollintoview"
    );
    if !needs_value && !allows_no_value {
        return Err("action must be click, dblclick, fill, type, hover, focus, select, check, uncheck, text, html, value, attr, box, styles, highlight, or scrollintoview".to_string());
    }
    let value = optional_string(object, "value")?;
    args.push(action.clone());
    if needs_value {
        args.push(value.ok_or_else(|| format!("value is required when find action is {action}"))?);
    } else if value.is_some() {
        return Err(
            "value is only supported for fill, type, select, and attr find actions".to_string(),
        );
    }
    Ok(())
}

fn push_optional_flag_value(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    key: &str,
    flag: &str,
) -> std::result::Result<(), String> {
    if let Some(value) = optional_string(object, key)? {
        args.push(flag.to_string());
        args.push(value);
    }
    Ok(())
}

fn required_storage_area(object: &Map<String, Value>) -> std::result::Result<String, String> {
    let area = required_string(object, "area")?;
    if !matches!(area.as_str(), "local" | "session") {
        return Err("area must be local or session".to_string());
    }
    Ok(area)
}

fn optional_color_scheme(
    object: &Map<String, Value>,
    key: &str,
) -> std::result::Result<Option<String>, String> {
    optional_string(object, key)?
        .map(validate_color_scheme)
        .transpose()
}

fn required_color_scheme(
    object: &Map<String, Value>,
    key: &str,
) -> std::result::Result<String, String> {
    validate_color_scheme(required_string(object, key)?)
}

fn validate_color_scheme(value: String) -> std::result::Result<String, String> {
    if matches!(value.as_str(), "dark" | "light" | "auto") {
        Ok(value)
    } else {
        Err("color scheme must be dark, light, or auto".to_string())
    }
}

fn optional_string_or_number(
    object: &Map<String, Value>,
    key: &str,
) -> std::result::Result<Option<String>, String> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.clone())),
        Some(Value::Number(value)) => Ok(Some(value.to_string())),
        Some(_) => Err(format!("{key} must be a string or number")),
    }
}

fn required_headers_json(object: &Map<String, Value>) -> std::result::Result<String, String> {
    let value = object
        .get("headers")
        .ok_or_else(|| "headers is required".to_string())?;
    let Some(headers) = value.as_object() else {
        return Err("headers must be an object".to_string());
    };
    for (name, value) in headers {
        if !matches!(value, Value::String(_) | Value::Number(_) | Value::Bool(_)) {
            return Err(format!(
                "headers.{name} must be a string, number, or boolean"
            ));
        }
    }
    serde_json::to_string(value).map_err(|err| err.to_string())
}

fn target_args(object: &Map<String, Value>) -> std::result::Result<Vec<String>, String> {
    let session = optional_string(object, "session")?;
    let session_name = optional_string(object, "sessionName")?;
    let profile = optional_string(object, "profile")?;
    let count = [&session, &session_name, &profile]
        .iter()
        .filter(|value| value.is_some())
        .count();
    if count > 1 {
        return Err("use only one of session, sessionName, or profile".to_string());
    }
    let mut args = Vec::new();
    if let Some(session) = session {
        args.push("--session".to_string());
        args.push(session);
    } else if let Some(session_name) = session_name {
        args.push("--session-name".to_string());
        args.push(session_name);
    } else if let Some(profile) = profile {
        args.push("--profile".to_string());
        args.push(profile);
    }
    Ok(args)
}

fn required_string(object: &Map<String, Value>, key: &str) -> std::result::Result<String, String> {
    optional_string(object, key)?.ok_or_else(|| format!("{key} is required"))
}

fn optional_string(
    object: &Map<String, Value>,
    key: &str,
) -> std::result::Result<Option<String>, String> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.clone())),
        Some(_) => Err(format!("{key} must be a string")),
    }
}

fn optional_bool(object: &Map<String, Value>, key: &str) -> std::result::Result<bool, String> {
    optional_bool_default(object, key, false)
}

fn optional_bool_default(
    object: &Map<String, Value>,
    key: &str,
    default: bool,
) -> std::result::Result<bool, String> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(default),
        Some(Value::Bool(value)) => Ok(*value),
        Some(_) => Err(format!("{key} must be a boolean")),
    }
}

fn optional_u64(
    object: &Map<String, Value>,
    key: &str,
) -> std::result::Result<Option<u64>, String> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(value)) => value
            .as_u64()
            .map(Some)
            .ok_or_else(|| format!("{key} must be a non-negative integer")),
        Some(_) => Err(format!("{key} must be a number")),
    }
}

fn required_u64(object: &Map<String, Value>, key: &str) -> std::result::Result<u64, String> {
    optional_u64(object, key)?.ok_or_else(|| format!("{key} is required"))
}

fn optional_f64(
    object: &Map<String, Value>,
    key: &str,
) -> std::result::Result<Option<f64>, String> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(value)) => value
            .as_f64()
            .map(Some)
            .ok_or_else(|| format!("{key} must be a number")),
        Some(_) => Err(format!("{key} must be a number")),
    }
}

fn required_f64(object: &Map<String, Value>, key: &str) -> std::result::Result<f64, String> {
    optional_f64(object, key)?.ok_or_else(|| format!("{key} is required"))
}

fn optional_i64(
    object: &Map<String, Value>,
    key: &str,
) -> std::result::Result<Option<i64>, String> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(value)) => value
            .as_i64()
            .map(Some)
            .ok_or_else(|| format!("{key} must be an integer")),
        Some(_) => Err(format!("{key} must be a number")),
    }
}

fn required_i64(object: &Map<String, Value>, key: &str) -> std::result::Result<i64, String> {
    optional_i64(object, key)?.ok_or_else(|| format!("{key} is required"))
}

fn optional_mouse_button(
    object: &Map<String, Value>,
) -> std::result::Result<Option<String>, String> {
    let button = optional_string(object, "button")?;
    if let Some(button) = &button {
        if !matches!(button.as_str(), "left" | "middle" | "right") {
            return Err("button must be left, middle, or right".to_string());
        }
    }
    Ok(button)
}

fn optional_string_array(
    object: &Map<String, Value>,
    key: &str,
) -> std::result::Result<Vec<String>, String> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(Vec::new()),
        Some(Value::Array(values)) => values
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .map(ToString::to_string)
                    .ok_or_else(|| format!("{key} entries must be strings"))
            })
            .collect(),
        Some(_) => Err(format!("{key} must be an array of strings")),
    }
}

fn mcp_tools(profile: McpToolsProfile) -> Vec<Value> {
    match profile {
        McpToolsProfile::Core => core_tools(),
    }
}

fn core_tools() -> Vec<Value> {
    vec![
        tool(
            "pire_browser_open",
            "Open or launch Firefox",
            "Launch managed Firefox if needed and optionally navigate to a URL.",
            tool_schema(
                vec![
                    ("url", string_prop("URL to open. Omit to just launch or reuse Firefox.")),
                    ("newTab", bool_prop("Open in a new tab.")),
                    ("label", string_prop("Optional stable tab label.")),
                    ("colorScheme", string_prop("Optional page color scheme: dark, light, or auto.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_snapshot",
            "Inspect page",
            "Return an interactive page snapshot with refs for the active page.",
            tool_schema(
                vec![
                    ("interactive", bool_prop("Include refs. Defaults to true.")),
                    ("compact", bool_prop("Reduce low-value structural noise.")),
                    ("urls", bool_prop("Include href URLs for links.")),
                    ("depth", number_prop("Limit snapshot depth.")),
                    ("selector", string_prop("Scope snapshot to a CSS selector.")),
                ],
                &[],
            ),
            true,
        ),
        tool(
            "pire_browser_find",
            "Find by semantic locator",
            "Find elements by role, label, text, placeholder, alt text, title, test id, or selector position; optionally act on the single match.",
            tool_schema(
                vec![
                    (
                        "kind",
                        string_prop(
                            "role, label, text, placeholder, alt, title, testid, first, last, or nth.",
                        ),
                    ),
                    (
                        "query",
                        string_prop(
                            "Role/text/test id/selector value. For nth, this is the selector.",
                        ),
                    ),
                    ("name", string_prop("Accessible name filter for role locators.")),
                    ("exact", bool_prop("Require exact normalized text/name matching.")),
                    (
                        "index",
                        number_prop("Zero-based match index for semantic locators."),
                    ),
                    ("nth", number_prop("Zero-based index when kind is nth.")),
                    (
                        "action",
                        string_prop("Optional action: click, dblclick, fill, type, hover, focus, select, check, uncheck, text, html, value, attr, box, styles, highlight, or scrollintoview."),
                    ),
                    (
                        "value",
                        string_prop("Action value for fill, type, select, or attr."),
                    ),
                ],
                &["kind", "query"],
            ),
            false,
        ),
        tool(
            "pire_browser_click",
            "Click",
            "Click a ref or selector from the current page.",
            tool_schema(vec![("selector", string_prop("Ref or selector to click."))], &["selector"]),
            false,
        ),
        tool(
            "pire_browser_double_click",
            "Double-click",
            "Double-click a ref or selector from the current page.",
            tool_schema(
                vec![("selector", string_prop("Ref or selector to double-click."))],
                &["selector"],
            ),
            false,
        ),
        tool(
            "pire_browser_fill",
            "Fill",
            "Clear and fill a ref or selector.",
            tool_schema(
                vec![
                    ("selector", string_prop("Ref or selector to fill.")),
                    ("text", string_prop("Text value to enter.")),
                ],
                &["selector", "text"],
            ),
            false,
        ),
        tool(
            "pire_browser_type",
            "Type",
            "Type text into a ref or selector without clearing first.",
            tool_schema(
                vec![
                    ("selector", string_prop("Ref or selector to type into.")),
                    ("text", string_prop("Text to type.")),
                ],
                &["selector", "text"],
            ),
            false,
        ),
        tool(
            "pire_browser_press",
            "Press key",
            "Press a keyboard key such as Enter or Tab.",
            tool_schema(vec![("key", string_prop("Key to press."))], &["key"]),
            false,
        ),
        tool(
            "pire_browser_keyboard_type",
            "Type at focus",
            "Type text at the current focused element.",
            tool_schema(vec![("text", string_prop("Text to type at focus."))], &["text"]),
            false,
        ),
        tool(
            "pire_browser_keyboard_insert_text",
            "Insert text at focus",
            "Insert text at the current focused element without key events.",
            tool_schema(
                vec![("text", string_prop("Text to insert at focus."))],
                &["text"],
            ),
            false,
        ),
        tool(
            "pire_browser_key_down",
            "Key down",
            "Dispatch a keydown event for the active page focus.",
            tool_schema(vec![("key", string_prop("Key to press down."))], &["key"]),
            false,
        ),
        tool(
            "pire_browser_key_up",
            "Key up",
            "Dispatch a keyup event for the active page focus.",
            tool_schema(vec![("key", string_prop("Key to release."))], &["key"]),
            false,
        ),
        tool(
            "pire_browser_hover",
            "Hover",
            "Hover a ref or selector using Firefox page-level events.",
            tool_schema(vec![("selector", string_prop("Ref or selector to hover."))], &["selector"]),
            false,
        ),
        tool(
            "pire_browser_focus",
            "Focus",
            "Focus a ref or selector.",
            tool_schema(vec![("selector", string_prop("Ref or selector to focus."))], &["selector"]),
            false,
        ),
        tool(
            "pire_browser_select",
            "Select option",
            "Select an option value or visible text in a dropdown.",
            tool_schema(
                vec![
                    ("selector", string_prop("Ref or selector for the select element.")),
                    ("value", string_prop("Option value or visible text to select.")),
                ],
                &["selector", "value"],
            ),
            false,
        ),
        tool(
            "pire_browser_check",
            "Check",
            "Check a checkbox or radio input.",
            tool_schema(vec![("selector", string_prop("Ref or selector to check."))], &["selector"]),
            false,
        ),
        tool(
            "pire_browser_uncheck",
            "Uncheck",
            "Uncheck a checkbox input.",
            tool_schema(vec![("selector", string_prop("Ref or selector to uncheck."))], &["selector"]),
            false,
        ),
        tool(
            "pire_browser_scroll",
            "Scroll",
            "Scroll the page or a scrollable container.",
            tool_schema(
                vec![
                    ("direction", string_prop("up, down, left, or right. Defaults to down.")),
                    ("pixels", number_prop("Positive pixel distance. Defaults to 900.")),
                    ("selector", string_prop("Optional scroll container selector.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_scroll_into_view",
            "Scroll into view",
            "Scroll a ref or selector into view.",
            tool_schema(
                vec![("selector", string_prop("Ref or selector to scroll into view."))],
                &["selector"],
            ),
            false,
        ),
        tool(
            "pire_browser_drag",
            "Drag",
            "Drag from one ref or selector to another using page-level events.",
            tool_schema(
                vec![
                    ("source", string_prop("Source ref or selector.")),
                    ("target", string_prop("Target ref or selector.")),
                ],
                &["source", "target"],
            ),
            false,
        ),
        tool(
            "pire_browser_mouse_move",
            "Mouse move",
            "Dispatch a page-level mousemove event at viewport coordinates.",
            tool_schema(
                vec![
                    ("x", number_prop("Viewport x coordinate.")),
                    ("y", number_prop("Viewport y coordinate.")),
                ],
                &["x", "y"],
            ),
            false,
        ),
        tool(
            "pire_browser_mouse_down",
            "Mouse down",
            "Dispatch a page-level mouse button down event.",
            tool_schema(
                vec![("button", string_prop("Optional button: left, middle, or right."))],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_mouse_up",
            "Mouse up",
            "Dispatch a page-level mouse button up event.",
            tool_schema(
                vec![("button", string_prop("Optional button: left, middle, or right."))],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_mouse_wheel",
            "Mouse wheel",
            "Dispatch a page-level mouse wheel event.",
            tool_schema(
                vec![
                    ("dy", integer_prop("Vertical wheel delta.")),
                    ("dx", integer_prop("Optional horizontal wheel delta.")),
                ],
                &["dy"],
            ),
            false,
        ),
        tool(
            "pire_browser_wait",
            "Wait",
            "Wait for milliseconds, selector, text, URL pattern, or load state.",
            tool_schema(
                vec![
                    ("milliseconds", number_prop("Milliseconds to wait.")),
                    ("selector", string_prop("Selector/ref to wait for.")),
                    ("text", string_prop("Text to wait for.")),
                    ("url", string_prop("URL glob/pattern to wait for.")),
                    ("loadState", string_prop("Load state such as networkidle.")),
                    ("state", string_prop("Element state such as visible or hidden.")),
                    ("timeout", number_prop("Timeout in milliseconds.")),
                ],
                &[],
            ),
            true,
        ),
        tool(
            "pire_browser_screenshot",
            "Screenshot",
            "Capture screenshot evidence from the active page.",
            tool_schema(
                vec![
                    ("path", string_prop("Optional output path.")),
                    ("full", bool_prop("Capture full page when possible.")),
                    ("annotate", bool_prop("Add numbered visible-element overlays.")),
                    ("screenshotDir", string_prop("Directory for generated screenshot names.")),
                    ("format", string_prop("png or jpeg.")),
                    ("quality", number_prop("JPEG quality.")),
                ],
                &[],
            ),
            true,
        ),
        tool(
            "pire_browser_pdf",
            "PDF evidence",
            "Capture the active page into an image-backed PDF evidence file.",
            tool_schema(
                vec![
                    ("path", string_prop("Output PDF path.")),
                    ("viewport", bool_prop("Capture only the visible viewport.")),
                ],
                &["path"],
            ),
            true,
        ),
        tool(
            "pire_browser_console",
            "Console messages",
            "Show or clear recent page console messages captured by the Firefox extension.",
            tool_schema(vec![("clear", bool_prop("Clear captured console messages."))], &[]),
            false,
        ),
        tool(
            "pire_browser_errors",
            "Page errors",
            "Show or clear recent page errors and unhandled promise rejections.",
            tool_schema(vec![("clear", bool_prop("Clear captured page errors."))], &[]),
            false,
        ),
        tool(
            "pire_browser_dialog_status",
            "Dialog status",
            "Report recently observed JavaScript dialogs.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_dialog_accept",
            "Accept dialog",
            "Configure the next shimmed confirm or prompt to accept, optionally with prompt text.",
            tool_schema(vec![("text", string_prop("Optional prompt text."))], &[]),
            false,
        ),
        tool(
            "pire_browser_dialog_dismiss",
            "Dismiss dialog",
            "Configure the next shimmed confirm or prompt to dismiss.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_highlight",
            "Highlight target",
            "Draw a visible overlay around a ref or selector before screenshot evidence.",
            tool_schema(vec![("selector", string_prop("Ref or selector to highlight."))], &["selector"]),
            false,
        ),
        tool(
            "pire_browser_vitals",
            "Web vitals",
            "Measure best-effort page performance signals from Firefox Performance APIs.",
            tool_schema(vec![("url", string_prop("Optional URL to open before measuring."))], &[]),
            false,
        ),
        tool(
            "pire_browser_download",
            "Download",
            "Click a target to trigger a Firefox download and save it to a path.",
            tool_schema(
                vec![
                    ("selector", string_prop("Ref or selector that triggers the download.")),
                    ("path", string_prop("Output path for the downloaded file.")),
                    ("timeout", number_prop("Timeout in milliseconds.")),
                ],
                &["selector", "path"],
            ),
            false,
        ),
        tool(
            "pire_browser_wait_download",
            "Wait for download",
            "Wait for a recent or new Firefox download and optionally save it to a path.",
            tool_schema(
                vec![
                    ("path", string_prop("Optional output path for the downloaded file.")),
                    ("timeout", number_prop("Timeout in milliseconds.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_upload",
            "Upload",
            "Assign one or more small local files to a file input or associated label.",
            tool_schema(
                vec![
                    ("selector", string_prop("Ref or selector for the upload target.")),
                    (
                        "files",
                        json!({
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Local file paths to upload."
                        }),
                    ),
                ],
                &["selector", "files"],
            ),
            false,
        ),
        tool(
            "pire_browser_clipboard",
            "Clipboard",
            "Read, write, copy, or paste text through the Firefox extension clipboard path.",
            tool_schema(
                vec![
                    ("action", string_prop("read, write, copy, or paste.")),
                    ("text", string_prop("Text to write when action is write.")),
                ],
                &["action"],
            ),
            false,
        ),
        tool(
            "pire_browser_get",
            "Get page or element info",
            "Read text, HTML, value, attribute, title, URL, count, bounding box, or computed styles.",
            tool_schema(
                vec![
                    (
                        "property",
                        string_prop("One of text, html, value, attr, title, url, count, box, or styles."),
                    ),
                    ("selector", string_prop("Ref or selector. Required except for title and url.")),
                    ("attribute", string_prop("Attribute name. Required when property is attr.")),
                ],
                &["property"],
            ),
            true,
        ),
        tool(
            "pire_browser_is",
            "Check element state",
            "Check whether a ref or selector is visible, enabled, or checked.",
            tool_schema(
                vec![
                    ("state", string_prop("One of visible, enabled, or checked.")),
                    ("selector", string_prop("Ref or selector to check.")),
                ],
                &["state", "selector"],
            ),
            true,
        ),
        tool(
            "pire_browser_get_url",
            "Get URL",
            "Return the current active page URL.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_status",
            "Status",
            "Return installed setup and live session status.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_set_viewport",
            "Set viewport",
            "Approximate the active page viewport by resizing the managed Firefox window.",
            tool_schema(
                vec![
                    ("width", number_prop("Requested viewport width in CSS pixels.")),
                    ("height", number_prop("Requested viewport height in CSS pixels.")),
                    ("scale", scalar_prop("Optional requested device scale factor; reported but not enforced by Firefox.")),
                ],
                &["width", "height"],
            ),
            false,
        ),
        tool(
            "pire_browser_set_device",
            "Set device preset",
            "Apply a best-effort viewport preset such as iPhone 14, Pixel 7, Galaxy S22, or iPad.",
            tool_schema(vec![("name", string_prop("Device preset name."))], &["name"]),
            false,
        ),
        tool(
            "pire_browser_set_geo",
            "Set geolocation",
            "Install a best-effort page-level geolocation shim for managed Firefox pages.",
            tool_schema(
                vec![
                    ("latitude", float_prop("Latitude from -90 to 90.")),
                    ("longitude", float_prop("Longitude from -180 to 180.")),
                ],
                &["latitude", "longitude"],
            ),
            false,
        ),
        tool(
            "pire_browser_set_headers",
            "Set request headers",
            "Set or clear extra request headers for the active page origin. Values may contain secrets.",
            tool_schema(vec![("headers", headers_prop())], &["headers"]),
            false,
        ),
        tool(
            "pire_browser_set_credentials",
            "Set HTTP Basic credentials",
            "Set memory-only HTTP Basic credentials for the active page origin. Passwords are not echoed.",
            tool_schema(
                vec![
                    ("username", string_prop("HTTP Basic username.")),
                    ("password", string_prop("HTTP Basic password.")),
                ],
                &["username", "password"],
            ),
            false,
        ),
        tool(
            "pire_browser_set_media",
            "Set media color scheme",
            "Set the managed Firefox content color scheme to dark, light, or auto.",
            tool_schema(vec![("scheme", string_prop("dark, light, or auto."))], &["scheme"]),
            false,
        ),
        tool(
            "pire_browser_set_offline",
            "Set offline mode",
            "Toggle best-effort request blocking for managed Firefox tabs.",
            tool_schema(vec![("enabled", bool_prop("true for offline, false for online."))], &["enabled"]),
            false,
        ),
        tool(
            "pire_browser_cookies_list",
            "List cookies",
            "Return cookies for the active tab URL. Values may contain secrets.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_cookies_set",
            "Set cookie",
            "Set a cookie for the active tab URL.",
            tool_schema(
                vec![
                    ("name", string_prop("Cookie name.")),
                    ("value", string_prop("Cookie value.")),
                ],
                &["name", "value"],
            ),
            false,
        ),
        tool(
            "pire_browser_cookies_clear",
            "Clear cookies",
            "Clear cookies visible to the active tab URL.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_storage_get",
            "Read web storage",
            "Read localStorage or sessionStorage for the active origin. Values may contain secrets.",
            tool_schema(
                vec![
                    ("area", string_prop("Storage area: local or session.")),
                    ("key", string_prop("Optional key; omit to return the full area.")),
                ],
                &["area"],
            ),
            true,
        ),
        tool(
            "pire_browser_storage_set",
            "Set web storage",
            "Set a localStorage or sessionStorage key for the active origin.",
            tool_schema(
                vec![
                    ("area", string_prop("Storage area: local or session.")),
                    ("key", string_prop("Storage key.")),
                    ("value", string_prop("Storage value.")),
                ],
                &["area", "key", "value"],
            ),
            false,
        ),
        tool(
            "pire_browser_storage_clear",
            "Clear web storage",
            "Clear localStorage or sessionStorage for the active origin.",
            tool_schema(
                vec![("area", string_prop("Storage area: local or session."))],
                &["area"],
            ),
            false,
        ),
        tool(
            "pire_browser_network_requests",
            "Network requests",
            "List or clear recent active-tab network requests with optional filters.",
            tool_schema(
                vec![
                    ("clear", bool_prop("Clear the active tab's request log.")),
                    ("filter", string_prop("URL substring or glob filter.")),
                    ("resourceType", string_prop("Resource type filter such as xhr,fetch.")),
                    ("method", string_prop("HTTP method filter such as POST.")),
                    ("status", string_prop("Status filter such as 200, 2xx, or 400-499.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_network_request",
            "Network request detail",
            "Return metadata for one recorded network request.",
            tool_schema(vec![("requestId", string_prop("Recorded request id."))], &["requestId"]),
            true,
        ),
        tool(
            "pire_browser_network_har_start",
            "Start HAR recording",
            "Start active-tab metadata HAR recording.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_network_har_stop",
            "Stop HAR recording",
            "Stop active-tab metadata HAR recording and optionally write a HAR file.",
            tool_schema(vec![("path", string_prop("Optional output HAR path."))], &[]),
            false,
        ),
        tool(
            "pire_browser_network_har_export",
            "Export HAR",
            "Export currently captured active-tab request metadata as HAR.",
            tool_schema(
                vec![
                    ("path", string_prop("Optional output HAR path.")),
                    ("filter", string_prop("URL substring or glob filter.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_network_route",
            "Network route",
            "Register an active-tab route to continue, abort, or mock matching requests.",
            tool_schema(
                vec![
                    ("pattern", string_prop("URL substring or glob pattern.")),
                    ("abort", bool_prop("Abort matching requests.")),
                    ("body", string_prop("Mock response body for matching requests.")),
                    ("contentType", string_prop("Content-Type for mocked body.")),
                    ("resourceType", string_prop("Optional resource type filter.")),
                ],
                &["pattern"],
            ),
            false,
        ),
        tool(
            "pire_browser_network_unroute",
            "Remove network route",
            "Remove active-tab network routes by pattern/route id, or all routes when omitted.",
            tool_schema(vec![("target", string_prop("Optional pattern or route id."))], &[]),
            false,
        ),
        tool(
            "pire_browser_auth_save",
            "Save auth profile",
            "Save a selector-driven auth profile in the managed Firefox profile. Password is sensitive; shell users should prefer auth save --password-stdin.",
            tool_schema(
                vec![
                    ("name", string_prop("Auth profile name.")),
                    ("url", string_prop("Login page URL.")),
                    ("username", string_prop("Username value.")),
                    ("password", string_prop("Password value. Sensitive.")),
                    ("usernameSelector", string_prop("Optional username input CSS selector.")),
                    ("passwordSelector", string_prop("Optional password input CSS selector.")),
                    ("submitSelector", string_prop("Optional submit control CSS selector.")),
                ],
                &["name", "url", "username", "password"],
            ),
            false,
        ),
        tool(
            "pire_browser_auth_login",
            "Run auth login",
            "Open a saved auth profile URL, fill configured selectors, and submit the form.",
            tool_schema(vec![("name", string_prop("Auth profile name."))], &["name"]),
            false,
        ),
        tool(
            "pire_browser_auth_list",
            "List auth profiles",
            "List saved selector-driven auth profiles without printing passwords.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_auth_show",
            "Show auth profile",
            "Show metadata for one saved auth profile without printing the password.",
            tool_schema(vec![("name", string_prop("Auth profile name."))], &["name"]),
            true,
        ),
        tool(
            "pire_browser_auth_delete",
            "Delete auth profile",
            "Delete a saved selector-driven auth profile.",
            tool_schema(vec![("name", string_prop("Auth profile name."))], &["name"]),
            false,
        ),
        tool(
            "pire_browser_state_save",
            "Save state",
            "Save active-origin cookies and Web Storage to a plaintext state file.",
            tool_schema(vec![("path", string_prop("Output state file path or name."))], &["path"]),
            false,
        ),
        tool(
            "pire_browser_state_load",
            "Load state",
            "Load active-origin cookies and Web Storage from a plaintext state file.",
            tool_schema(
                vec![
                    ("path", string_prop("Input state file path or name.")),
                    ("requireInspected", bool_prop("Require a recent local inspect receipt.")),
                    ("noRequireInspected", bool_prop("Bypass inspect receipt requirement.")),
                ],
                &["path"],
            ),
            false,
        ),
        tool(
            "pire_browser_state_list",
            "List states",
            "List saved .pire-state files.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_state_show",
            "Show state summary",
            "Show metadata-only summary for a state file without printing cookie or storage values.",
            tool_schema(vec![("path", string_prop("State file path or name."))], &["path"]),
            true,
        ),
        tool(
            "pire_browser_state_inspect",
            "Inspect state",
            "Inspect state metadata and optionally record a local receipt for guarded loads.",
            tool_schema(
                vec![
                    ("path", string_prop("State file path or name.")),
                    ("record", bool_prop("Record a local inspect receipt.")),
                ],
                &["path"],
            ),
            false,
        ),
        tool(
            "pire_browser_state_rename",
            "Rename state",
            "Rename a .pire-state entry.",
            tool_schema(
                vec![
                    ("old", string_prop("Old state file name.")),
                    ("new", string_prop("New state file name.")),
                ],
                &["old", "new"],
            ),
            false,
        ),
        tool(
            "pire_browser_state_clear",
            "Clear state",
            "Delete one .pire-state entry or all entries.",
            tool_schema(
                vec![
                    ("name", string_prop("State name to delete.")),
                    ("all", bool_prop("Delete all saved states.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_state_clean",
            "Clean old states",
            "Delete .pire-state files older than a number of days.",
            tool_schema(vec![("olderThanDays", number_prop("Age threshold in days."))], &["olderThanDays"]),
            false,
        ),
        tool(
            "pire_browser_session_list",
            "List sessions",
            "List live Firefox extension sessions.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_session_attach",
            "Attach session",
            "Print the CLI target prefix for a live session id.",
            tool_schema(vec![("sessionId", string_prop("Live session id."))], &["sessionId"]),
            true,
        ),
        tool(
            "pire_browser_session_cleanup",
            "Clean stale sessions",
            "Remove stale session files.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_profiles_list",
            "List profiles",
            "List managed Firefox profiles known to pire-browser.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_tabs_list",
            "List tabs",
            "List managed Firefox tabs in the active session.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_tab_new",
            "New tab",
            "Open a new tab, optionally navigating to a URL and assigning a label.",
            tool_schema(
                vec![
                    ("url", string_prop("Optional URL to open in the new tab.")),
                    ("label", string_prop("Optional stable tab label.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_tabs_select",
            "Select tab",
            "Switch to an existing tab by tab id or label.",
            tool_schema(
                vec![("target", string_prop("Tab id such as t2, or tab label."))],
                &["target"],
            ),
            false,
        ),
        tool(
            "pire_browser_tabs_close",
            "Close tab",
            "Close an existing tab by tab id or label, or the active tab when target is omitted.",
            tool_schema(vec![("target", string_prop("Optional tab id or label."))], &[]),
            false,
        ),
        tool(
            "pire_browser_tabs_label",
            "Label tab",
            "Assign or replace a stable label for an existing tab.",
            tool_schema(
                vec![
                    ("target", string_prop("Tab id such as t2.")),
                    ("label", string_prop("Stable tab label.")),
                ],
                &["target", "label"],
            ),
            false,
        ),
        tool(
            "pire_browser_frame_select",
            "Select iframe",
            "Scope snapshots and selector-based actions to an iframe selected by ref or CSS selector.",
            tool_schema(
                vec![("target", string_prop("Iframe ref such as @e3, or CSS selector."))],
                &["target"],
            ),
            false,
        ),
        tool(
            "pire_browser_frame_main",
            "Select main frame",
            "Return snapshots and selector-based actions to the main page frame.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_window_new",
            "New window",
            "Open a separate Firefox window in the active managed session.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_eval",
            "Evaluate JavaScript",
            "Evaluate JavaScript in the active page. Existing action/confirmation policies still apply.",
            tool_schema(vec![("script", string_prop("JavaScript source to evaluate."))], &["script"]),
            false,
        ),
        tool(
            "pire_browser_close",
            "Close session",
            "Close the targeted managed Firefox session.",
            tool_schema(vec![("all", bool_prop("Close all managed Firefox sessions."))], &[]),
            false,
        ),
        tool(
            "pire_browser_skills_get_core",
            "Get core skill",
            "Return version-matched agent guidance for using pire-browser.",
            tool_schema(vec![], &[]),
            true,
        ),
    ]
}

fn tool(name: &str, title: &str, description: &str, input_schema: Value, read_only: bool) -> Value {
    json!({
        "name": name,
        "title": title,
        "description": description,
        "inputSchema": input_schema,
        "annotations": {
            "readOnlyHint": read_only,
            "openWorldHint": true
        }
    })
}

fn tool_schema(properties: Vec<(&str, Value)>, required: &[&str]) -> Value {
    let mut map = common_properties();
    for (key, value) in properties {
        map.insert(key.to_string(), value);
    }
    let mut schema = json!({
        "type": "object",
        "properties": map,
        "additionalProperties": false
    });
    if !required.is_empty() {
        schema["required"] = json!(required);
    }
    schema
}

fn common_properties() -> Map<String, Value> {
    let mut map = Map::new();
    map.insert(
        "session".to_string(),
        string_prop("Existing live session id or named session/profile to target."),
    );
    map.insert(
        "sessionName".to_string(),
        string_prop("Explicit named managed Firefox profile to reuse or launch."),
    );
    map.insert(
        "profile".to_string(),
        string_prop("Managed Firefox profile name or path."),
    );
    map.insert(
        "extraArgs".to_string(),
        json!({
            "type": "array",
            "items": { "type": "string" },
            "description": "Command-specific CLI arguments appended after typed arguments."
        }),
    );
    map
}

fn string_prop(description: &str) -> Value {
    json!({ "type": "string", "description": description })
}

fn bool_prop(description: &str) -> Value {
    json!({ "type": "boolean", "description": description })
}

fn number_prop(description: &str) -> Value {
    json!({ "type": "integer", "minimum": 0, "description": description })
}

fn float_prop(description: &str) -> Value {
    json!({ "type": "number", "description": description })
}

fn scalar_prop(description: &str) -> Value {
    json!({
        "oneOf": [
            { "type": "string" },
            { "type": "number" }
        ],
        "description": description
    })
}

fn headers_prop() -> Value {
    json!({
        "type": "object",
        "description": "Header names to string, number, or boolean values. Empty object clears headers for the active origin.",
        "additionalProperties": {
            "oneOf": [
                { "type": "string" },
                { "type": "number" },
                { "type": "boolean" }
            ]
        }
    })
}

fn integer_prop(description: &str) -> Value {
    json!({ "type": "integer", "description": description })
}

fn jsonrpc_result(id: Value, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}

fn jsonrpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": redact_text(message)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_advertises_core_tools_and_version() {
        let result = initialize_result();
        assert_eq!(result["protocolVersion"], MCP_PROTOCOL_VERSION);
        assert_eq!(result["serverInfo"]["name"], "pire-browser");
        assert_eq!(result["serverInfo"]["version"], env!("CARGO_PKG_VERSION"));
        assert!(result["capabilities"]["tools"].is_object());
    }

    #[test]
    fn lists_core_tools_with_schemas() {
        let tools = mcp_tools(McpToolsProfile::Core);
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_snapshot"));
        assert!(tools.iter().any(|tool| tool["name"] == "pire_browser_get"));
        assert!(tools.iter().any(|tool| tool["name"] == "pire_browser_is"));
        assert!(tools.iter().any(|tool| tool["name"] == "pire_browser_find"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_double_click"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_hover"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_upload"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_wait_download"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_clipboard"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_mouse_move"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_console"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_dialog_status"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_highlight"));
        assert!(tools.iter().any(|tool| tool["name"] == "pire_browser_pdf"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_network_requests"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_set_viewport"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_set_headers"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_cookies_list"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_storage_get"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_network_route"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_state_save"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_auth_login"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_state_load"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_session_list"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_profiles_list"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_tabs_select"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_frame_select"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_window_new"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_skills_get_core"));
        let snapshot = tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_snapshot")
            .unwrap();
        assert_eq!(snapshot["inputSchema"]["type"], "object");
        assert_eq!(
            snapshot["inputSchema"]["properties"]["extraArgs"]["type"],
            "array"
        );
    }

    #[test]
    fn handles_initialize_and_tools_list_requests() {
        let init = handle_message(
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#,
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(init["id"], 1);
        assert_eq!(init["result"]["serverInfo"]["name"], "pire-browser");

        let list = handle_message(
            r#"{"jsonrpc":"2.0","id":"tools","method":"tools/list"}"#,
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(list["id"], "tools");
        assert!(list["result"]["tools"].as_array().unwrap().len() >= 10);
    }

    #[test]
    fn tool_argument_errors_are_tool_results() {
        let result = handle_message(
            r#"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"pire_browser_click","arguments":{}}}"#,
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(result["id"], 7);
        assert!(result.get("error").is_none());
        assert_eq!(result["result"]["isError"], true);
        assert!(result["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("selector is required"));
    }

    #[test]
    fn ignores_notifications() {
        assert!(handle_message(
            r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
            McpToolsProfile::Core,
        )
        .is_none());
    }

    #[test]
    fn maps_tool_arguments_to_cli_args() {
        let args = tool_command_args(
            "pire_browser_open",
            &json!({
                "url": "https://example.com",
                "colorScheme": "dark",
                "label": "docs"
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "--color-scheme",
                "dark",
                "open",
                "https://example.com",
                "--label",
                "docs"
            ]
        );

        let args = tool_command_args(
            "pire_browser_find",
            &json!({
                "kind": "role",
                "query": "button",
                "name": "Submit",
                "exact": true,
                "action": "click"
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "find", "role", "button", "--name", "Submit", "--exact", "click"]
        );

        let args = tool_command_args(
            "pire_browser_find",
            &json!({
                "kind": "label",
                "query": "Email",
                "action": "fill",
                "value": "agent@example.com"
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "find",
                "label",
                "Email",
                "fill",
                "agent@example.com"
            ]
        );

        let args = tool_command_args(
            "pire_browser_find",
            &json!({
                "kind": "nth",
                "query": ".card",
                "nth": 2,
                "action": "hover"
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "find", "nth", "2", ".card", "hover"]);

        let args = tool_command_args(
            "pire_browser_snapshot",
            &json!({
                "sessionName": "review",
                "compact": true,
                "urls": true,
                "selector": "#main",
                "depth": 3
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "--session-name",
                "review",
                "snapshot",
                "-i",
                "-c",
                "-u",
                "-d",
                "3",
                "-s",
                "#main"
            ]
        );

        let args = tool_command_args(
            "pire_browser_get",
            &json!({
                "property": "attr",
                "selector": "@e1",
                "attribute": "href"
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "get", "attr", "@e1", "href"]);

        let args = tool_command_args(
            "pire_browser_get",
            &json!({ "property": "url" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "get", "url"]);

        let args = tool_command_args(
            "pire_browser_is",
            &json!({ "state": "visible", "selector": "#submit" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "is", "visible", "#submit"]);

        let args = tool_command_args(
            "pire_browser_keyboard_type",
            &json!({ "text": "hello" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "keyboard", "type", "hello"]);

        let args = tool_command_args(
            "pire_browser_select",
            &json!({ "selector": "#country", "value": "US" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "select", "#country", "US"]);

        let args = tool_command_args(
            "pire_browser_scroll",
            &json!({ "direction": "down", "pixels": 400, "selector": "#panel" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "scroll", "down", "400", "--selector", "#panel"]
        );

        let args = tool_command_args(
            "pire_browser_double_click",
            &json!({ "selector": "@e7" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "dblclick", "@e7"]);

        let args = tool_command_args(
            "pire_browser_drag",
            &json!({ "source": "@e1", "target": "@e2" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "drag", "@e1", "@e2"]);

        let args = tool_command_args(
            "pire_browser_mouse_move",
            &json!({ "x": 80, "y": 120 }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "mouse", "move", "80", "120"]);

        let args = tool_command_args(
            "pire_browser_mouse_down",
            &json!({ "button": "right" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "mouse", "down", "right"]);

        let args =
            tool_command_args("pire_browser_mouse_up", &json!({}), McpToolsProfile::Core).unwrap();
        assert_eq!(args, vec!["--json", "mouse", "up"]);

        let args = tool_command_args(
            "pire_browser_mouse_wheel",
            &json!({ "dy": -400, "dx": 20 }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "mouse", "wheel", "-400", "20"]);

        let args = tool_command_args(
            "pire_browser_download",
            &json!({ "selector": "@e3", "path": "report.csv", "timeout": 60000 }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "download",
                "@e3",
                "report.csv",
                "--timeout",
                "60000"
            ]
        );

        let args = tool_command_args(
            "pire_browser_wait_download",
            &json!({ "path": "report.csv", "timeout": 60000 }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "wait",
                "--download",
                "report.csv",
                "--timeout",
                "60000"
            ]
        );

        let args = tool_command_args(
            "pire_browser_upload",
            &json!({ "selector": "#file", "files": ["one.txt", "two.txt"] }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "upload", "#file", "one.txt", "two.txt"]
        );

        let args = tool_command_args(
            "pire_browser_clipboard",
            &json!({ "action": "write", "text": "hello" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "clipboard", "write", "hello"]);

        let args = tool_command_args(
            "pire_browser_pdf",
            &json!({ "path": "page.pdf", "viewport": true }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "pdf", "page.pdf", "--viewport"]);

        let args = tool_command_args(
            "pire_browser_console",
            &json!({ "clear": true }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "console", "--clear"]);

        let args =
            tool_command_args("pire_browser_errors", &json!({}), McpToolsProfile::Core).unwrap();
        assert_eq!(args, vec!["--json", "errors"]);

        let args = tool_command_args(
            "pire_browser_dialog_status",
            &json!({}),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "dialog", "status"]);

        let args = tool_command_args(
            "pire_browser_dialog_accept",
            &json!({ "text": "ok" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "dialog", "accept", "ok"]);

        let args = tool_command_args(
            "pire_browser_dialog_dismiss",
            &json!({}),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "dialog", "dismiss"]);

        let args = tool_command_args(
            "pire_browser_highlight",
            &json!({ "selector": "@e4" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "highlight", "@e4"]);

        let args = tool_command_args(
            "pire_browser_vitals",
            &json!({ "url": "https://example.com" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "vitals", "https://example.com"]);

        let args = tool_command_args(
            "pire_browser_set_viewport",
            &json!({ "width": 1280, "height": 720, "scale": 2 }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "set", "viewport", "1280", "720", "2"]);

        let args = tool_command_args(
            "pire_browser_set_device",
            &json!({ "name": "iPhone 14" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "set", "device", "iPhone 14"]);

        let args = tool_command_args(
            "pire_browser_set_geo",
            &json!({ "latitude": 37.7749, "longitude": -122.4194 }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "set", "geo", "37.7749", "-122.4194"]);

        let args = tool_command_args(
            "pire_browser_set_headers",
            &json!({ "headers": { "X-Preview": "on", "X-Trace": 42, "X-Enabled": true } }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args[0..3], ["--json", "set", "headers"]);
        let headers: Value = serde_json::from_str(&args[3]).unwrap();
        assert_eq!(
            headers,
            json!({ "X-Preview": "on", "X-Trace": 42, "X-Enabled": true })
        );

        let args = tool_command_args(
            "pire_browser_set_credentials",
            &json!({ "username": "user", "password": "pass" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "set", "credentials", "user", "pass"]);

        let args = tool_command_args(
            "pire_browser_set_media",
            &json!({ "scheme": "dark" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "set", "media", "dark"]);

        let args = tool_command_args(
            "pire_browser_set_offline",
            &json!({ "enabled": false }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "set", "offline", "off"]);

        let args = tool_command_args(
            "pire_browser_cookies_list",
            &json!({}),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "cookies"]);

        let args = tool_command_args(
            "pire_browser_cookies_set",
            &json!({ "name": "preview", "value": "enabled" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "cookies", "set", "preview", "enabled"]);

        let args = tool_command_args(
            "pire_browser_cookies_clear",
            &json!({}),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "cookies", "clear"]);

        let args = tool_command_args(
            "pire_browser_storage_get",
            &json!({ "area": "local", "key": "feature" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "storage", "local", "feature"]);

        let args = tool_command_args(
            "pire_browser_storage_get",
            &json!({ "area": "session" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "storage", "session"]);

        let args = tool_command_args(
            "pire_browser_storage_set",
            &json!({ "area": "local", "key": "feature", "value": "on" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "storage", "local", "set", "feature", "on"]
        );

        let args = tool_command_args(
            "pire_browser_storage_clear",
            &json!({ "area": "session" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "storage", "session", "clear"]);

        let args = tool_command_args(
            "pire_browser_network_requests",
            &json!({
                "filter": "/api/",
                "resourceType": "xhr,fetch",
                "method": "POST",
                "status": "2xx"
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "network",
                "requests",
                "--filter",
                "/api/",
                "--type",
                "xhr,fetch",
                "--method",
                "POST",
                "--status",
                "2xx"
            ]
        );

        let args = tool_command_args(
            "pire_browser_network_request",
            &json!({ "requestId": "req_123" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "network", "request", "req_123"]);

        let args = tool_command_args(
            "pire_browser_network_har_start",
            &json!({}),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "network", "har", "start"]);

        let args = tool_command_args(
            "pire_browser_network_har_stop",
            &json!({ "path": "network.har" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "network", "har", "stop", "network.har"]
        );

        let args = tool_command_args(
            "pire_browser_network_har_export",
            &json!({ "path": "network.har", "filter": "/api/" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "network",
                "har",
                "network.har",
                "--filter",
                "/api/"
            ]
        );

        let args = tool_command_args(
            "pire_browser_network_route",
            &json!({
                "pattern": "**/api/config**",
                "body": "{\"ready\":true}",
                "contentType": "application/json",
                "resourceType": "xhr"
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "network",
                "route",
                "**/api/config**",
                "--body",
                "{\"ready\":true}",
                "--content-type",
                "application/json",
                "--resource-type",
                "xhr"
            ]
        );

        let args = tool_command_args(
            "pire_browser_network_unroute",
            &json!({ "target": "**/api/config**" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "network", "unroute", "**/api/config**"]
        );

        let args = tool_command_args(
            "pire_browser_auth_save",
            &json!({
                "name": "app",
                "url": "https://example.com/login",
                "username": "agent@example.com",
                "password": "secret",
                "usernameSelector": "#email",
                "passwordSelector": "#password",
                "submitSelector": "button[type=submit]"
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "auth",
                "save",
                "app",
                "--url",
                "https://example.com/login",
                "--username",
                "agent@example.com",
                "--password",
                "secret",
                "--username-selector",
                "#email",
                "--password-selector",
                "#password",
                "--submit-selector",
                "button[type=submit]"
            ]
        );

        let args = tool_command_args(
            "pire_browser_auth_login",
            &json!({ "name": "app" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "auth", "login", "app"]);

        let args =
            tool_command_args("pire_browser_auth_list", &json!({}), McpToolsProfile::Core).unwrap();
        assert_eq!(args, vec!["--json", "auth", "list"]);

        let args = tool_command_args(
            "pire_browser_auth_show",
            &json!({ "name": "app" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "auth", "show", "app"]);

        let args = tool_command_args(
            "pire_browser_auth_delete",
            &json!({ "name": "app" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "auth", "delete", "app"]);

        let args = tool_command_args(
            "pire_browser_state_save",
            &json!({ "sessionName": "work", "path": ".pire-state/app.json" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "--session-name",
                "work",
                "state",
                "save",
                ".pire-state/app.json"
            ]
        );

        let args = tool_command_args(
            "pire_browser_state_load",
            &json!({ "path": ".pire-state/app.json", "requireInspected": true }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "state",
                "load",
                "--require-inspected",
                ".pire-state/app.json"
            ]
        );

        let args = tool_command_args(
            "pire_browser_state_inspect",
            &json!({ "path": ".pire-state/app.json", "record": true }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "state",
                "inspect",
                "--record",
                ".pire-state/app.json"
            ]
        );

        let args = tool_command_args("pire_browser_state_list", &json!({}), McpToolsProfile::Core)
            .unwrap();
        assert_eq!(args, vec!["--json", "state", "list"]);

        let args = tool_command_args(
            "pire_browser_state_show",
            &json!({ "path": "app" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "state", "show", "app"]);

        let args = tool_command_args(
            "pire_browser_state_rename",
            &json!({ "old": "app-old", "new": "app-new" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "state", "rename", "app-old", "app-new"]
        );

        let args = tool_command_args(
            "pire_browser_state_clear",
            &json!({ "all": true }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "state", "clear", "--all"]);

        let args = tool_command_args(
            "pire_browser_state_clean",
            &json!({ "olderThanDays": 14 }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "state", "clean", "--older-than", "14"]);

        let args = tool_command_args(
            "pire_browser_session_attach",
            &json!({ "sessionId": "abc" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "session", "attach", "abc"]);

        let args = tool_command_args(
            "pire_browser_session_list",
            &json!({}),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "session", "list"]);

        let args = tool_command_args(
            "pire_browser_session_cleanup",
            &json!({}),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "session", "cleanup"]);

        let args = tool_command_args(
            "pire_browser_profiles_list",
            &json!({}),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "profiles"]);

        let args = tool_command_args(
            "pire_browser_tab_new",
            &json!({ "url": "https://example.com", "label": "docs" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "tab",
                "new",
                "https://example.com",
                "--label",
                "docs"
            ]
        );

        let args = tool_command_args(
            "pire_browser_tabs_select",
            &json!({ "target": "docs" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "tabs", "select", "docs"]);

        let args = tool_command_args(
            "pire_browser_tabs_close",
            &json!({ "target": "t2" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "tabs", "close", "t2"]);

        let args = tool_command_args(
            "pire_browser_tabs_label",
            &json!({ "target": "t2", "label": "checkout" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "tabs", "label", "t2", "checkout"]);

        let args = tool_command_args(
            "pire_browser_frame_select",
            &json!({ "target": "@e3" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "frame", "@e3"]);

        let args = tool_command_args("pire_browser_frame_main", &json!({}), McpToolsProfile::Core)
            .unwrap();
        assert_eq!(args, vec!["--json", "frame", "main"]);

        let args = tool_command_args("pire_browser_window_new", &json!({}), McpToolsProfile::Core)
            .unwrap();
        assert_eq!(args, vec!["--json", "window", "new"]);
    }

    #[test]
    fn rejects_invalid_tool_arguments() {
        let error =
            tool_command_args("pire_browser_click", &json!({}), McpToolsProfile::Core).unwrap_err();
        assert!(error.contains("selector is required"));

        let error = tool_command_args(
            "pire_browser_find",
            &json!({ "kind": "css", "query": "#submit" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("kind must be"));

        let error = tool_command_args(
            "pire_browser_find",
            &json!({ "kind": "nth", "query": ".card" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("nth is required"));

        let error = tool_command_args(
            "pire_browser_find",
            &json!({ "kind": "label", "query": "Email", "action": "fill" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("value is required"));

        let error = tool_command_args(
            "pire_browser_find",
            &json!({ "kind": "text", "query": "Save", "action": "click", "value": "extra" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("value is only supported"));

        let error = tool_command_args(
            "pire_browser_wait",
            &json!({ "selector": "#done", "text": "Done" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("only one wait condition"));

        let error = tool_command_args(
            "pire_browser_status",
            &json!({ "session": "a", "profile": "b" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("use only one"));

        let error = tool_command_args(
            "pire_browser_get",
            &json!({ "property": "text" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("selector is required"));

        let error = tool_command_args(
            "pire_browser_is",
            &json!({ "state": "selected", "selector": "#item" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("state must be visible"));

        let error = tool_command_args(
            "pire_browser_scroll",
            &json!({ "direction": "sideways" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("direction must be up"));

        let error = tool_command_args(
            "pire_browser_mouse_down",
            &json!({ "button": "primary" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("button must be left"));

        let error = tool_command_args(
            "pire_browser_mouse_wheel",
            &json!({ "dx": 20 }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("dy is required"));

        let error = tool_command_args(
            "pire_browser_open",
            &json!({ "colorScheme": "sepia" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("color scheme must be"));

        let error = tool_command_args(
            "pire_browser_set_headers",
            &json!({ "headers": { "X-Test": ["bad"] } }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("headers.X-Test must be"));

        let error = tool_command_args(
            "pire_browser_set_media",
            &json!({ "scheme": "sepia" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("color scheme must be"));

        let error = tool_command_args(
            "pire_browser_network_route",
            &json!({ "pattern": "*", "abort": true, "body": "nope" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("cannot combine abort and body"));

        let error = tool_command_args(
            "pire_browser_storage_get",
            &json!({ "area": "indexeddb" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("area must be local or session"));

        let error = tool_command_args(
            "pire_browser_state_load",
            &json!({
                "path": ".pire-state/app.json",
                "requireInspected": true,
                "noRequireInspected": true
            }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("cannot use requireInspected"));

        let error = tool_command_args(
            "pire_browser_state_clear",
            &json!({}),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("requires name or all"));

        let error = tool_command_args(
            "pire_browser_state_clear",
            &json!({ "name": "app", "all": true }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("cannot combine all and name"));

        let error = tool_command_args(
            "pire_browser_upload",
            &json!({ "selector": "#file", "files": [] }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("files must contain"));

        let error = tool_command_args(
            "pire_browser_clipboard",
            &json!({ "action": "clear" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("action must be read"));
    }

    #[test]
    fn validates_tools_profile() {
        assert_eq!(
            McpToolsProfile::parse("core").unwrap(),
            McpToolsProfile::Core
        );
        assert_eq!(
            McpToolsProfile::parse("all").unwrap(),
            McpToolsProfile::Core
        );
        assert!(McpToolsProfile::parse("browserless").is_err());
    }
}
