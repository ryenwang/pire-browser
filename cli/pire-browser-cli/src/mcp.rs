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
        "instructions": "Use pire_browser_open, pire_browser_snapshot, action tools, waits, screenshots, tabs/status, and pire_browser_skills_get_core for Firefox-backed browser automation. Inspect before acting and refresh refs after page changes."
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
        (_, "pire_browser_click") => {
            args.push("click".to_string());
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
        (_, "pire_browser_get_url") => {
            args.push("get".to_string());
            args.push("url".to_string());
        }
        (_, "pire_browser_status") => {
            args.push("status".to_string());
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
            "pire_browser_click",
            "Click",
            "Click a ref or selector from the current page.",
            tool_schema(vec![("selector", string_prop("Ref or selector to click."))], &["selector"]),
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
    }

    #[test]
    fn rejects_invalid_tool_arguments() {
        let error =
            tool_command_args("pire_browser_click", &json!({}), McpToolsProfile::Core).unwrap_err();
        assert!(error.contains("selector is required"));

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
