use anyhow::{bail, Result};
use pire_browser_core::redaction::redact_text;
use serde_json::{json, Map, Value};
use std::io::{self, BufRead, Write};
use std::process::{Command, Output};

const MCP_PROTOCOL_VERSION: &str = "2025-11-25";
const SUPPORTED_PROTOCOL_VERSIONS: &[&str] =
    &["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_NAME: &str = "pire-browser";
const TOOL_LIST_PAGE_SIZE: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpToolsProfile {
    Core,
    Network,
    State,
    Debug,
    Tabs,
    Mobile,
    React,
    All,
    Combined(u16),
}

const PROFILE_CORE: u16 = 1 << 0;
const PROFILE_NETWORK: u16 = 1 << 1;
const PROFILE_STATE: u16 = 1 << 2;
const PROFILE_DEBUG: u16 = 1 << 3;
const PROFILE_TABS: u16 = 1 << 4;
const PROFILE_MOBILE: u16 = 1 << 5;
const PROFILE_REACT: u16 = 1 << 6;
const PROFILE_ALL: u16 = PROFILE_CORE
    | PROFILE_NETWORK
    | PROFILE_STATE
    | PROFILE_DEBUG
    | PROFILE_TABS
    | PROFILE_MOBILE
    | PROFILE_REACT;
const TOOLS_PROFILES_TOOL: &str = "pire_browser_tools_profiles";

impl McpToolsProfile {
    pub fn parse(value: &str) -> Result<Self> {
        let value = value.trim();
        if value.is_empty() {
            bail!("--tools requires a non-empty profile name");
        }
        let mut bits = 0u16;
        let mut count = 0usize;
        for item in value.split(',') {
            let item = item.trim();
            if item.is_empty() {
                bail!("unsupported mcp tools profile list `{value}`");
            }
            count += 1;
            bits |= profile_bits_for_name(item).ok_or_else(|| {
                anyhow::anyhow!(
                    "unsupported mcp tools profile `{item}`; supported profiles are core, network, state, debug, tabs, mobile, react, and all"
                )
            })?;
        }
        if bits == PROFILE_ALL {
            return Ok(Self::All);
        }
        if count == 1 {
            return Ok(match bits {
                PROFILE_CORE => Self::Core,
                PROFILE_NETWORK => Self::Network,
                PROFILE_STATE => Self::State,
                PROFILE_DEBUG => Self::Debug,
                PROFILE_TABS => Self::Tabs,
                PROFILE_MOBILE => Self::Mobile,
                PROFILE_REACT => Self::React,
                _ => Self::Combined(bits),
            });
        }
        Ok(Self::Combined(bits))
    }

    fn bits(self) -> u16 {
        match self {
            Self::Core => PROFILE_CORE,
            Self::Network => PROFILE_NETWORK,
            Self::State => PROFILE_STATE,
            Self::Debug => PROFILE_DEBUG,
            Self::Tabs => PROFILE_TABS,
            Self::Mobile => PROFILE_MOBILE,
            Self::React => PROFILE_REACT,
            Self::All => PROFILE_ALL,
            Self::Combined(bits) => bits,
        }
    }

    fn label(self) -> String {
        if self == Self::All {
            return "all".to_string();
        }
        profile_descriptors()
            .into_iter()
            .filter(|profile| profile.name != "all")
            .filter(|profile| self.bits() & profile.bits != 0)
            .map(|profile| profile.name)
            .collect::<Vec<_>>()
            .join(",")
    }

    fn allows_tool(self, name: &str) -> bool {
        name == TOOLS_PROFILES_TOOL || (self.bits() & tool_profile_bits(name) != 0)
    }
}

fn profile_bits_for_name(name: &str) -> Option<u16> {
    match name {
        "core" => Some(PROFILE_CORE),
        "network" => Some(PROFILE_NETWORK),
        "state" => Some(PROFILE_STATE),
        "debug" => Some(PROFILE_DEBUG),
        "tabs" => Some(PROFILE_TABS),
        "mobile" => Some(PROFILE_MOBILE),
        "react" => Some(PROFILE_REACT),
        "all" => Some(PROFILE_ALL),
        _ => None,
    }
}

struct McpProfileDescriptor {
    name: &'static str,
    bits: u16,
    description: &'static str,
}

fn profile_descriptors() -> Vec<McpProfileDescriptor> {
    vec![
        McpProfileDescriptor {
            name: "core",
            bits: PROFILE_CORE,
            description: "Default inspect-before-act workflow: open, snapshots, semantic find, interactions, waits, navigation helpers, init scripts, reads, screenshots/PDFs, diffs, eval, status, confirmation follow-up, basic tabs, profiles, close, and skill guidance.",
        },
        McpProfileDescriptor {
            name: "network",
            bits: PROFILE_NETWORK,
            description: "Headers, credentials, offline toggle, network request inspection with redacted request/response headers, metadata HAR, and route/unroute controls.",
        },
        McpProfileDescriptor {
            name: "state",
            bits: PROFILE_STATE,
            description: "Cookies, storage, auth helpers, plaintext state files, sessions, profiles, downloads/uploads, clipboard, and skills.",
        },
        McpProfileDescriptor {
            name: "debug",
            bits: PROFILE_DEBUG,
            description: "Lower-level launch and batch diagnostics, doctor/activity diagnostics, console, page errors, JavaScript dialogs, highlight, Firefox trace and recording bundles, best-effort vitals, diffs, status, sessions/profiles, confirmation follow-up, and close.",
        },
        McpProfileDescriptor {
            name: "tabs",
            bits: PROFILE_TABS,
            description: "Back/forward/reload, tab list/new/select/label/close, iframe selection, JavaScript dialogs, windows, and close.",
        },
        McpProfileDescriptor {
            name: "mobile",
            bits: PROFILE_MOBILE,
            description: "Viewport, device preset, geolocation, media/offline settings, keyboard, tap-as-click, swipe-as-scroll, mouse, scroll, and screenshot helpers.",
        },
        McpProfileDescriptor {
            name: "react",
            bits: PROFILE_REACT,
            description: "Best-effort Firefox React Fiber tree and inspect tools, plus Web Vitals. Render profiling and Suspense details require full React DevTools integration and are not implemented yet.",
        },
        McpProfileDescriptor {
            name: "all",
            bits: PROFILE_ALL,
            description: "Every currently implemented pire-browser MCP tool.",
        },
    ]
}

fn tool_profile_bits(name: &str) -> u16 {
    match name {
        TOOLS_PROFILES_TOOL => PROFILE_ALL,
        "pire_browser_tabs_list" | "pire_browser_tab_list" | "pire_browser_tab_new" => {
            PROFILE_CORE | PROFILE_TABS
        }
        "pire_browser_profiles_list" => PROFILE_CORE | PROFILE_STATE | PROFILE_DEBUG,
        "pire_browser_skills_get_core" => PROFILE_CORE | PROFILE_STATE,
        "pire_browser_status" => PROFILE_CORE | PROFILE_DEBUG,
        "pire_browser_launch"
        | "pire_browser_batch"
        | "pire_browser_install"
        | "pire_browser_upgrade" => PROFILE_DEBUG,
        "pire_browser_doctor" | "pire_browser_activity_list" => PROFILE_DEBUG,
        "pire_browser_confirm" | "pire_browser_deny" => PROFILE_CORE | PROFILE_DEBUG,
        "pire_browser_close" => PROFILE_CORE | PROFILE_DEBUG | PROFILE_TABS,
        "pire_browser_diff_snapshot" | "pire_browser_diff_screenshot" | "pire_browser_diff_url" => {
            PROFILE_CORE | PROFILE_DEBUG
        }
        "pire_browser_keyboard_type"
        | "pire_browser_keyboard_insert_text"
        | "pire_browser_key_down"
        | "pire_browser_key_up"
        | "pire_browser_keydown"
        | "pire_browser_keyup"
        | "pire_browser_mouse_move"
        | "pire_browser_mouse_down"
        | "pire_browser_mouse_up"
        | "pire_browser_mouse_wheel"
        | "pire_browser_scroll" => PROFILE_CORE | PROFILE_MOBILE,
        "pire_browser_tap" | "pire_browser_swipe" => PROFILE_CORE | PROFILE_MOBILE,
        "pire_browser_open"
        | "pire_browser_read"
        | "pire_browser_snapshot"
        | "pire_browser_find"
        | "pire_browser_click"
        | "pire_browser_double_click"
        | "pire_browser_dblclick"
        | "pire_browser_fill"
        | "pire_browser_type"
        | "pire_browser_press"
        | "pire_browser_hover"
        | "pire_browser_focus"
        | "pire_browser_select"
        | "pire_browser_check"
        | "pire_browser_uncheck"
        | "pire_browser_scroll_into_view"
        | "pire_browser_drag"
        | "pire_browser_wait"
        | "pire_browser_wait_ms"
        | "pire_browser_wait_for_selector"
        | "pire_browser_wait_for_text"
        | "pire_browser_wait_for_url"
        | "pire_browser_wait_for_load"
        | "pire_browser_wait_for_function"
        | "pire_browser_pdf"
        | "pire_browser_get"
        | "pire_browser_is"
        | "pire_browser_get_url"
        | "pire_browser_get_title"
        | "pire_browser_get_text"
        | "pire_browser_get_html"
        | "pire_browser_get_value"
        | "pire_browser_get_attr"
        | "pire_browser_get_count"
        | "pire_browser_get_box"
        | "pire_browser_get_styles"
        | "pire_browser_is_visible"
        | "pire_browser_is_enabled"
        | "pire_browser_is_checked"
        | "pire_browser_eval" => PROFILE_CORE,
        "pire_browser_screenshot" => PROFILE_CORE | PROFILE_MOBILE,
        "pire_browser_download" | "pire_browser_wait_download" | "pire_browser_upload" => {
            PROFILE_CORE | PROFILE_STATE
        }
        "pire_browser_set_headers" | "pire_browser_set_credentials" => {
            PROFILE_NETWORK | PROFILE_STATE
        }
        "pire_browser_set_offline" => PROFILE_NETWORK | PROFILE_MOBILE,
        "pire_browser_network_requests"
        | "pire_browser_network_request"
        | "pire_browser_network_har_start"
        | "pire_browser_network_har_stop"
        | "pire_browser_network_har_export"
        | "pire_browser_network_route"
        | "pire_browser_network_unroute" => PROFILE_NETWORK,
        "pire_browser_cookies_list"
        | "pire_browser_cookies_set"
        | "pire_browser_cookies_clear"
        | "pire_browser_storage_get"
        | "pire_browser_storage_set"
        | "pire_browser_storage_clear"
        | "pire_browser_auth_save"
        | "pire_browser_auth_login"
        | "pire_browser_auth_list"
        | "pire_browser_auth_show"
        | "pire_browser_auth_delete"
        | "pire_browser_state_save"
        | "pire_browser_state_load"
        | "pire_browser_state_list"
        | "pire_browser_state_show"
        | "pire_browser_state_inspect"
        | "pire_browser_state_rename"
        | "pire_browser_state_clear"
        | "pire_browser_state_clean"
        | "pire_browser_clipboard"
        | "pire_browser_clipboard_read"
        | "pire_browser_clipboard_write"
        | "pire_browser_clipboard_copy"
        | "pire_browser_clipboard_paste" => PROFILE_STATE,
        "pire_browser_session_list"
        | "pire_browser_session_attach"
        | "pire_browser_session_cleanup" => PROFILE_STATE | PROFILE_DEBUG,
        "pire_browser_console"
        | "pire_browser_errors"
        | "pire_browser_highlight"
        | "pire_browser_trace_start"
        | "pire_browser_trace_status"
        | "pire_browser_trace_stop"
        | "pire_browser_record_start"
        | "pire_browser_record_status"
        | "pire_browser_record_stop"
        | "pire_browser_vitals" => PROFILE_DEBUG | PROFILE_REACT,
        "pire_browser_react_tree" | "pire_browser_react_inspect" => PROFILE_REACT,
        "pire_browser_dialog_status"
        | "pire_browser_dialog_accept"
        | "pire_browser_dialog_dismiss" => PROFILE_DEBUG | PROFILE_TABS,
        "pire_browser_tabs_select"
        | "pire_browser_tab_switch"
        | "pire_browser_tabs_close"
        | "pire_browser_tab_close"
        | "pire_browser_tabs_label" => PROFILE_TABS,
        "pire_browser_back"
        | "pire_browser_forward"
        | "pire_browser_reload"
        | "pire_browser_pushstate" => PROFILE_CORE | PROFILE_TABS,
        "pire_browser_frame_select"
        | "pire_browser_frame_switch"
        | "pire_browser_frame_main"
        | "pire_browser_window_new" => PROFILE_TABS,
        "pire_browser_add_init_script" | "pire_browser_remove_init_script" => {
            PROFILE_CORE | PROFILE_DEBUG
        }
        "pire_browser_device"
        | "pire_browser_set_viewport"
        | "pire_browser_set_device"
        | "pire_browser_set_geo"
        | "pire_browser_set_media" => PROFILE_MOBILE,
        _ => 0,
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
        Some("initialize") => {
            id.map(|id| jsonrpc_result(id, initialize_result(value.get("params"))))
        }
        Some("notifications/initialized" | "notifications/cancelled") => None,
        Some("ping") => id.map(|id| jsonrpc_result(id, json!({}))),
        Some("tools/list") => {
            let Some(id) = id else {
                return None;
            };
            let params = value.get("params");
            match tools_list_result(params, profile) {
                Ok(result) => Some(jsonrpc_result(id, result)),
                Err(message) => Some(jsonrpc_error(id, -32602, &message)),
            }
        }
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

fn initialize_result(params: Option<&Value>) -> Value {
    let requested = params
        .and_then(|params| params.get("protocolVersion"))
        .and_then(Value::as_str)
        .unwrap_or(MCP_PROTOCOL_VERSION);
    let protocol_version = if SUPPORTED_PROTOCOL_VERSIONS.contains(&requested) {
        requested
    } else {
        MCP_PROTOCOL_VERSION
    };
    json!({
        "protocolVersion": protocol_version,
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
        "instructions": "Use the smallest MCP tool profile that fits the task. The default core profile covers open, snapshots, semantic find/action tools, reads/checks, waits, back/forward/reload, pushstate, init scripts, screenshots/PDFs/diffs, eval, confirmation follow-up, basic tabs, profile discovery, status, close, and pire_browser_skills_get_core. Use pire_browser_tap only as click-equivalent page interaction, not native touch input. Use pire_browser_swipe only as touch-direction page scroll, not native touch input. Prefer pire_browser_open for normal launch/navigation; add the debug profile and use pire_browser_launch only for lower-level launch diagnostics. Use debug-profile pire_browser_trace_start/status/stop for Firefox QA evidence bundles, not Chrome DevTools performance traces. Use debug-profile pire_browser_record_start/status/stop for screenshot-sequence evidence, not native WebM video or live streaming. Use debug-profile pire_browser_install for explicit native-host setup/repair, pire_browser_upgrade for safe package upgrade, and pire_browser_batch only for short sequences where later steps do not depend on parsing intermediate output. Add profiles such as core,network or core,state when network, cookies/storage/auth/state, debugging, tabs/frames/windows, or mobile/emulation tools are needed. Inspect before acting and refresh refs after page changes."
    })
}

fn tools_list_result(
    params: Option<&Value>,
    profile: McpToolsProfile,
) -> std::result::Result<Value, String> {
    let tools = mcp_tools(profile);
    let start = tool_list_cursor(params, tools.len())?;
    let end = (start + TOOL_LIST_PAGE_SIZE).min(tools.len());
    let mut result = json!({
        "tools": tools[start..end].to_vec()
    });
    if end < tools.len() {
        result["nextCursor"] = json!(end.to_string());
    }
    Ok(result)
}

fn tool_list_cursor(params: Option<&Value>, total: usize) -> std::result::Result<usize, String> {
    let Some(cursor) = params.and_then(|params| params.get("cursor")) else {
        return Ok(0);
    };
    let cursor = cursor
        .as_str()
        .ok_or_else(|| "tools/list cursor must be a string".to_string())?;
    let index = cursor
        .parse::<usize>()
        .map_err(|_| "Invalid tools/list cursor".to_string())?;
    if index > total {
        return Err("Invalid tools/list cursor".to_string());
    }
    Ok(index)
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
    if name == TOOLS_PROFILES_TOOL {
        return Ok(tool_profiles_result(profile));
    }
    if !profile.allows_tool(name) {
        return Err(format!(
            "tool `{name}` is not available in MCP tools profile `{}`; start pire-browser with `mcp --tools all` or combine profiles such as `--tools core,network`",
            profile.label()
        ));
    }
    let args = tool_command_args(name, &arguments, profile)?;
    Ok(run_cli_tool(args))
}

fn run_cli_tool(args: Vec<String>) -> Value {
    let output = match command_output(&args) {
        Ok(output) => output,
        Err(message) => return tool_error_text(message),
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

fn command_output(args: &[String]) -> std::result::Result<Output, String> {
    if is_launcher_command_args(args) {
        return launcher_command_output(args);
    }
    let exe = std::env::current_exe()
        .map_err(|err| format!("failed to resolve pire-browser executable: {err}"))?;
    Command::new(exe)
        .args(args)
        .output()
        .map_err(|err| format!("failed to run pire-browser command: {err}"))
}

fn launcher_command_output(args: &[String]) -> std::result::Result<Output, String> {
    let node_path = std::env::var("PIRE_BROWSER_NODE_PATH").unwrap_or_else(|_| "node".to_string());
    let launcher_path = std::env::var("PIRE_BROWSER_LAUNCHER_PATH").map_err(|_| {
        "pire_browser_upgrade requires the npm/Pi JavaScript launcher; restart MCP with `pire-browser mcp` from the installed package".to_string()
    })?;
    let launcher_args = launcher_args(args);
    Command::new(node_path)
        .arg(launcher_path)
        .args(launcher_args)
        .output()
        .map_err(|err| format!("failed to run pire-browser launcher command: {err}"))
}

fn launcher_args(args: &[String]) -> Vec<String> {
    let mut result = vec!["upgrade".to_string()];
    if args.iter().any(|arg| arg == "--json") {
        result.push("--json".to_string());
    }
    result
}

fn is_launcher_command_args(args: &[String]) -> bool {
    let without_json = args
        .iter()
        .filter(|arg| arg.as_str() != "--json")
        .map(String::as_str)
        .collect::<Vec<_>>();
    without_json == ["upgrade"]
}

fn tool_profiles_result(active: McpToolsProfile) -> Value {
    let profiles = profile_descriptors()
        .into_iter()
        .map(|profile| {
            let count = mcp_tools(McpToolsProfile::Combined(profile.bits)).len();
            json!({
                "name": profile.name,
                "active": active.bits() & profile.bits != 0,
                "toolCount": count,
                "description": profile.description
            })
        })
        .collect::<Vec<_>>();
    let data = json!({
        "active": active.label(),
        "profiles": profiles
    });
    json!({
        "content": [{
            "type": "text",
            "text": format!("pire-browser MCP tool profiles: {}", active.label())
        }],
        "structuredContent": data,
        "isError": false
    })
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
    let mut args = match name {
        "pire_browser_launch" => launch_prefix_args(object)?,
        "pire_browser_install" | "pire_browser_upgrade" => Vec::new(),
        _ => target_args(object)?,
    };
    match (profile, name) {
        (_, "pire_browser_launch") => {
            reject_launch_unsupported_fields(object)?;
            args.push("launch".to_string());
            if let Some(profile) = optional_string(object, "profile")? {
                args.push("--profile".to_string());
                args.push(profile);
            }
            if let Some(url) = optional_string(object, "url")? {
                args.push("--url".to_string());
                args.push(url);
            }
            if let Some(firefox_path) = optional_string(object, "firefoxPath")? {
                args.push("--firefox-path".to_string());
                args.push(firefox_path);
            }
        }
        (_, "pire_browser_batch") => {
            if object.contains_key("extraArgs") {
                return Err(
                    "extraArgs is not supported by pire_browser_batch; use commands entries instead"
                        .to_string(),
                );
            }
            args.push("batch".to_string());
            if optional_bool(object, "bail")? {
                args.push("--bail".to_string());
            }
            args.extend(required_batch_commands(object)?);
        }
        (_, "pire_browser_install") => {
            reject_unsupported_fields(
                object,
                "pire_browser_install",
                &["firefoxPath", "withDeps"],
            )?;
            args.push("install".to_string());
            if optional_bool(object, "withDeps")? {
                args.push("--with-deps".to_string());
            }
            push_optional_flag_value(&mut args, object, "firefoxPath", "--firefox-path")?;
        }
        (_, "pire_browser_upgrade") => {
            reject_unsupported_fields(object, "pire_browser_upgrade", &[])?;
            args.push("upgrade".to_string());
        }
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
            for path in optional_string_array(object, "initScriptPaths")? {
                args.push("--init-script".to_string());
                args.push(path);
            }
            if object.contains_key("headers") {
                args.push("--headers".to_string());
                args.push(required_headers_json(object)?);
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
            if optional_bool(object, "cursorInteractive")? {
                args.push("-C".to_string());
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
        (_, "pire_browser_read") => {
            args.push("read".to_string());
            if let Some(url) = optional_string(object, "url")? {
                args.push(url);
            }
            if optional_bool(object, "raw")? {
                args.push("--raw".to_string());
            }
            if optional_bool(object, "requireMarkdown")? {
                args.push("--require-md".to_string());
            }
            if optional_bool(object, "outline")? {
                args.push("--outline".to_string());
            }
            if let Some(filter) = optional_string(object, "filter")? {
                args.push("--filter".to_string());
                args.push(filter);
            }
            if let Some(llms) = optional_string(object, "llms")? {
                args.push("--llms".to_string());
                args.push(llms);
            }
            if let Some(timeout) = optional_u64(object, "timeoutMs")? {
                args.push("--timeout".to_string());
                args.push(timeout.to_string());
            }
        }
        (_, "pire_browser_find") => {
            push_find_args(&mut args, object)?;
        }
        (_, "pire_browser_click") => {
            args.push("click".to_string());
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_tap") => {
            args.push("tap".to_string());
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_double_click") => {
            args.push("dblclick".to_string());
            args.push(required_string(object, "selector")?);
        }
        (_, "pire_browser_dblclick") => {
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
        (_, "pire_browser_keydown") => {
            args.push("keydown".to_string());
            args.push(required_string(object, "key")?);
        }
        (_, "pire_browser_keyup") => {
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
        (_, "pire_browser_swipe") => {
            args.push("swipe".to_string());
            let direction =
                optional_string(object, "direction")?.unwrap_or_else(|| "up".to_string());
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
        (_, "pire_browser_wait_ms") => {
            args.push("wait".to_string());
            args.push(required_u64(object, "ms")?.to_string());
        }
        (_, "pire_browser_wait_for_selector") => {
            args.push("wait".to_string());
            args.push(required_string(object, "selector")?);
            push_wait_timeout_arg(&mut args, object)?;
        }
        (_, "pire_browser_wait_for_text") => {
            args.push("wait".to_string());
            args.push("--text".to_string());
            args.push(required_string(object, "text")?);
            push_wait_timeout_arg(&mut args, object)?;
        }
        (_, "pire_browser_wait_for_url") => {
            args.push("wait".to_string());
            args.push("--url".to_string());
            args.push(required_string(object, "url")?);
            push_wait_timeout_arg(&mut args, object)?;
        }
        (_, "pire_browser_wait_for_load") => {
            args.push("wait".to_string());
            args.push("--load".to_string());
            let state = required_string(object, "state")?;
            if !matches!(state.as_str(), "load" | "domcontentloaded" | "networkidle") {
                return Err("state must be load, domcontentloaded, or networkidle".to_string());
            }
            args.push(state);
            push_wait_timeout_arg(&mut args, object)?;
        }
        (_, "pire_browser_wait_for_function") => {
            args.push("wait".to_string());
            args.push("--fn".to_string());
            args.push(required_string(object, "expression")?);
            push_wait_timeout_arg(&mut args, object)?;
        }
        (_, "pire_browser_wait") => {
            args.push("wait".to_string());
            let condition_count = [
                "milliseconds",
                "selector",
                "text",
                "url",
                "loadState",
                "function",
            ]
            .iter()
            .filter(|key| object.contains_key(**key))
            .count();
            if condition_count == 0 {
                return Err(
                    "pire_browser_wait requires one of milliseconds, selector, text, url, loadState, or function"
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
            } else if let Some(function) = optional_string(object, "function")? {
                args.push("--fn".to_string());
                args.push(function);
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
        (_, "pire_browser_diff_snapshot") => {
            args.push("diff".to_string());
            args.push("snapshot".to_string());
            if let Some(baseline) = optional_string(object, "baselinePath")? {
                args.push("--baseline".to_string());
                args.push(baseline);
            }
            if let Some(selector) = optional_string(object, "selector")? {
                args.push("--selector".to_string());
                args.push(selector);
            }
            if optional_bool(object, "compact")? {
                args.push("--compact".to_string());
            }
            if optional_bool(object, "urls")? {
                args.push("--urls".to_string());
            }
            if let Some(depth) = optional_u64(object, "depth")? {
                args.push("--depth".to_string());
                args.push(depth.to_string());
            }
        }
        (_, "pire_browser_diff_screenshot") => {
            args.push("diff".to_string());
            args.push("screenshot".to_string());
            args.push("--baseline".to_string());
            args.push(required_string(object, "baselinePath")?);
            if let Some(current) = optional_string(object, "currentPath")? {
                args.push(current);
            }
            if let Some(output) = optional_string(object, "outputPath")? {
                args.push("--output".to_string());
                args.push(output);
            }
            if let Some(threshold) = optional_f64(object, "threshold")? {
                if !(0.0..=1.0).contains(&threshold) {
                    return Err("threshold must be between 0 and 1".to_string());
                }
                args.push("--threshold".to_string());
                args.push(threshold.to_string());
            }
            if optional_bool(object, "full")? {
                args.push("--full".to_string());
            }
        }
        (_, "pire_browser_diff_url") => {
            args.push("diff".to_string());
            args.push("url".to_string());
            args.push(required_string(object, "baselineUrl")?);
            args.push(required_string(object, "currentUrl")?);
            if optional_bool(object, "screenshot")? {
                args.push("--screenshot".to_string());
            }
            if optional_bool(object, "full")? {
                args.push("--full".to_string());
            }
            if let Some(wait_until) = optional_string(object, "waitUntil")? {
                let normalized = match wait_until.as_str() {
                    "load" | "domcontentloaded" | "networkidle" => wait_until,
                    "network-idle" => "networkidle".to_string(),
                    _ => {
                        return Err(
                            "waitUntil must be load, domcontentloaded, or networkidle".to_string()
                        )
                    }
                };
                args.push("--wait-until".to_string());
                args.push(normalized);
            }
            if let Some(selector) = optional_string(object, "selector")? {
                args.push("--selector".to_string());
                args.push(selector);
            }
            if optional_bool(object, "compact")? {
                args.push("--compact".to_string());
            }
            if let Some(depth) = optional_u64(object, "depth")? {
                args.push("--depth".to_string());
                args.push(depth.to_string());
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
        (_, "pire_browser_trace_start") => {
            args.push("trace".to_string());
            args.push("start".to_string());
        }
        (_, "pire_browser_trace_status") => {
            args.push("trace".to_string());
            args.push("status".to_string());
        }
        (_, "pire_browser_trace_stop") => {
            args.push("trace".to_string());
            args.push("stop".to_string());
            if let Some(path) =
                optional_string(object, "path")?.or(optional_string(object, "outputPath")?)
            {
                args.push(path);
            }
        }
        (_, "pire_browser_record_start") => {
            args.push("record".to_string());
            args.push("start".to_string());
            if let Some(interval_ms) = optional_u64(object, "intervalMs")? {
                args.push("--interval-ms".to_string());
                args.push(interval_ms.to_string());
            }
            if let Some(max_frames) = optional_u64(object, "maxFrames")? {
                args.push("--max-frames".to_string());
                args.push(max_frames.to_string());
            }
        }
        (_, "pire_browser_record_status") => {
            args.push("record".to_string());
            args.push("status".to_string());
        }
        (_, "pire_browser_record_stop") => {
            args.push("record".to_string());
            args.push("stop".to_string());
            if let Some(output_dir) =
                optional_string(object, "outputDir")?.or(optional_string(object, "path")?)
            {
                args.push(output_dir);
            }
        }
        (_, "pire_browser_react_tree") => {
            args.push("react".to_string());
            args.push("tree".to_string());
            if let Some(selector) = optional_string(object, "selector")? {
                args.push("--selector".to_string());
                args.push(selector);
            }
            if let Some(depth) = optional_u64(object, "depth")? {
                args.push("--depth".to_string());
                args.push(depth.to_string());
            }
        }
        (_, "pire_browser_react_inspect") => {
            args.push("react".to_string());
            args.push("inspect".to_string());
            args.push(required_string(object, "target")?);
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
        (_, "pire_browser_clipboard_read") => {
            args.push("clipboard".to_string());
            args.push("read".to_string());
        }
        (_, "pire_browser_clipboard_write") => {
            args.push("clipboard".to_string());
            args.push("write".to_string());
            args.push(required_string(object, "text")?);
        }
        (_, "pire_browser_clipboard_copy") => {
            args.push("clipboard".to_string());
            args.push("copy".to_string());
        }
        (_, "pire_browser_clipboard_paste") => {
            args.push("clipboard".to_string());
            args.push("paste".to_string());
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
        (_, "pire_browser_get_text") => {
            push_get_selector_args(&mut args, object, "text")?;
        }
        (_, "pire_browser_get_html") => {
            push_get_selector_args(&mut args, object, "html")?;
        }
        (_, "pire_browser_get_value") => {
            push_get_selector_args(&mut args, object, "value")?;
        }
        (_, "pire_browser_get_attr") => {
            args.push("get".to_string());
            args.push("attr".to_string());
            args.push(required_string(object, "selector")?);
            args.push(required_string(object, "name")?);
        }
        (_, "pire_browser_get_count") => {
            push_get_selector_args(&mut args, object, "count")?;
        }
        (_, "pire_browser_get_box") => {
            push_get_selector_args(&mut args, object, "box")?;
        }
        (_, "pire_browser_get_styles") => {
            push_get_selector_args(&mut args, object, "styles")?;
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
        (_, "pire_browser_get_title") => {
            args.push("get".to_string());
            args.push("title".to_string());
        }
        (_, "pire_browser_is_visible") => {
            push_is_args(&mut args, object, "visible")?;
        }
        (_, "pire_browser_is_enabled") => {
            push_is_args(&mut args, object, "enabled")?;
        }
        (_, "pire_browser_is_checked") => {
            push_is_args(&mut args, object, "checked")?;
        }
        (_, "pire_browser_status") => {
            args.push("status".to_string());
        }
        (_, "pire_browser_doctor") => {
            args.push("doctor".to_string());
            let fix = optional_bool(object, "fix")?;
            if fix {
                args.push("--fix".to_string());
            }
            if !fix && optional_string(object, "firefoxPath")?.is_some() {
                return Err("firefoxPath requires fix=true".to_string());
            }
            push_optional_flag_value(&mut args, object, "firefoxPath", "--firefox-path")?;
        }
        (_, "pire_browser_activity_list") => {
            args.push("activity".to_string());
            args.push("list".to_string());
            if let Some(limit) = optional_u64(object, "limit")? {
                if limit == 0 {
                    return Err("limit must be a positive integer".to_string());
                }
                args.push("--limit".to_string());
                args.push(limit.to_string());
            }
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
        (_, "pire_browser_device") => {
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
            if let Some(curl) = optional_string(object, "curl")? {
                args.push("--curl".to_string());
                args.push(curl);
                if let Some(domain) = optional_string(object, "domain")? {
                    args.push("--domain".to_string());
                    args.push(domain);
                }
            } else {
                args.push(required_string(object, "name")?);
                args.push(required_string(object, "value")?);
            }
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
        (_, "pire_browser_tab_list") => {
            args.push("tab".to_string());
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
        (_, "pire_browser_tab_switch") => {
            args.push("tabs".to_string());
            args.push("select".to_string());
            args.push(required_string(object, "tab")?);
        }
        (_, "pire_browser_tabs_close") => {
            args.push("tabs".to_string());
            args.push("close".to_string());
            if let Some(target) = optional_string(object, "target")? {
                args.push(target);
            }
        }
        (_, "pire_browser_tab_close") => {
            args.push("tabs".to_string());
            args.push("close".to_string());
            if let Some(tab) = optional_string(object, "tab")? {
                args.push(tab);
            }
        }
        (_, "pire_browser_tabs_label") => {
            args.push("tabs".to_string());
            args.push("label".to_string());
            args.push(required_string(object, "target")?);
            args.push(required_string(object, "label")?);
        }
        (_, "pire_browser_back") => {
            args.push("back".to_string());
        }
        (_, "pire_browser_forward") => {
            args.push("forward".to_string());
        }
        (_, "pire_browser_reload") => {
            args.push("reload".to_string());
        }
        (_, "pire_browser_pushstate") => {
            args.push("pushstate".to_string());
            args.push(required_string(object, "url")?);
        }
        (_, "pire_browser_add_init_script") => {
            args.push("addinitscript".to_string());
            args.push(required_string(object, "script")?);
        }
        (_, "pire_browser_remove_init_script") => {
            args.push("removeinitscript".to_string());
            args.push(required_string(object, "identifier")?);
        }
        (_, "pire_browser_frame_select") => {
            args.push("frame".to_string());
            args.push(required_string(object, "target")?);
        }
        (_, "pire_browser_frame_switch") => {
            args.push("frame".to_string());
            args.push(required_string(object, "frame")?);
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
        (_, "pire_browser_confirm") => {
            args.push("confirm".to_string());
            args.push(required_string(object, "confirmationId")?);
        }
        (_, "pire_browser_deny") => {
            args.push("deny".to_string());
            args.push(required_string(object, "confirmationId")?);
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
    if !matches!(
        name,
        "pire_browser_batch" | "pire_browser_install" | "pire_browser_upgrade"
    ) {
        args.extend(optional_string_array(object, "extraArgs")?);
    }
    Ok(args)
}

fn push_wait_timeout_arg(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
) -> std::result::Result<(), String> {
    if let Some(timeout) = optional_u64(object, "waitTimeoutMs")? {
        if timeout == 0 {
            return Err("waitTimeoutMs must be at least 1".to_string());
        }
        args.push("--timeout".to_string());
        args.push(timeout.to_string());
    }
    Ok(())
}

fn push_get_selector_args(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    property: &str,
) -> std::result::Result<(), String> {
    args.push("get".to_string());
    args.push(property.to_string());
    args.push(required_string(object, "selector")?);
    Ok(())
}

fn push_is_args(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    state: &str,
) -> std::result::Result<(), String> {
    args.push("is".to_string());
    args.push(state.to_string());
    args.push(required_string(object, "selector")?);
    Ok(())
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
    if let Some(state_path) = optional_string(object, "statePath")? {
        args.push("--state".to_string());
        args.push(state_path);
    }
    let allowed_domains = optional_string_or_csv_array(object, "allowedDomains")?;
    let no_allowed_domains = optional_bool(object, "noAllowedDomains")?;
    if allowed_domains.is_some() && no_allowed_domains {
        return Err("cannot use allowedDomains and noAllowedDomains together".to_string());
    }
    if let Some(allowed_domains) = allowed_domains {
        args.push("--allowed-domains".to_string());
        args.push(allowed_domains);
    }
    if no_allowed_domains {
        args.push("--no-allowed-domains".to_string());
    }
    push_optional_flag_value(&mut args, object, "actionPolicy", "--action-policy")?;
    push_optional_flag_value(&mut args, object, "confirmActions", "--confirm-actions")?;
    if optional_bool(object, "confirmInteractive")? {
        args.push("--confirm-interactive".to_string());
    }
    if optional_bool(object, "allowFileAccess")? {
        args.push("--allow-file-access".to_string());
    }
    push_optional_flag_value(&mut args, object, "proxy", "--proxy")?;
    push_optional_flag_value(&mut args, object, "proxyBypass", "--proxy-bypass")?;
    if let Some(max_output) = optional_u64(object, "maxOutput")? {
        args.push("--max-output".to_string());
        args.push(max_output.to_string());
    }
    if optional_bool(object, "contentBoundaries")? {
        args.push("--content-boundaries".to_string());
    }
    push_optional_flag_value(&mut args, object, "executablePath", "--executable-path")?;
    Ok(args)
}

fn launch_prefix_args(object: &Map<String, Value>) -> std::result::Result<Vec<String>, String> {
    let mut args = Vec::new();
    let allowed_domains = optional_string_or_csv_array(object, "allowedDomains")?;
    let no_allowed_domains = optional_bool(object, "noAllowedDomains")?;
    if allowed_domains.is_some() && no_allowed_domains {
        return Err("cannot use allowedDomains and noAllowedDomains together".to_string());
    }
    if let Some(allowed_domains) = allowed_domains {
        args.push("--allowed-domains".to_string());
        args.push(allowed_domains);
    }
    if no_allowed_domains {
        args.push("--no-allowed-domains".to_string());
    }
    push_optional_flag_value(&mut args, object, "actionPolicy", "--action-policy")?;
    push_optional_flag_value(&mut args, object, "confirmActions", "--confirm-actions")?;
    if optional_bool(object, "confirmInteractive")? {
        args.push("--confirm-interactive".to_string());
    }
    Ok(args)
}

fn reject_launch_unsupported_fields(
    object: &Map<String, Value>,
) -> std::result::Result<(), String> {
    for key in [
        "session",
        "sessionName",
        "statePath",
        "allowFileAccess",
        "contentBoundaries",
        "maxOutput",
        "proxy",
        "proxyBypass",
        "executablePath",
        "extraArgs",
    ] {
        if object.contains_key(key) {
            return Err(format!("{key} is not supported by pire_browser_launch; use pire_browser_open for normal launch/navigation workflows"));
        }
    }
    Ok(())
}

fn reject_unsupported_fields(
    object: &Map<String, Value>,
    tool_name: &str,
    allowed: &[&str],
) -> std::result::Result<(), String> {
    for key in object.keys() {
        if !allowed.contains(&key.as_str()) {
            return Err(format!("{key} is not supported by {tool_name}"));
        }
    }
    Ok(())
}

fn optional_string_or_csv_array(
    object: &Map<String, Value>,
    key: &str,
) -> std::result::Result<Option<String>, String> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.clone())),
        Some(Value::Array(values)) => {
            let mut strings = Vec::new();
            for value in values {
                let Some(value) = value.as_str() else {
                    return Err(format!("{key} entries must be strings"));
                };
                strings.push(value.to_string());
            }
            Ok(Some(strings.join(",")))
        }
        Some(_) => Err(format!("{key} must be a string or array of strings")),
    }
}

fn required_batch_commands(
    object: &Map<String, Value>,
) -> std::result::Result<Vec<String>, String> {
    let value = object
        .get("commands")
        .ok_or_else(|| "commands is required".to_string())?;
    let Some(items) = value.as_array() else {
        return Err("commands must be an array".to_string());
    };
    if items.is_empty() {
        return Err("commands must contain at least one command".to_string());
    }
    items
        .iter()
        .enumerate()
        .map(batch_command_text_from_value)
        .collect()
}

fn batch_command_text_from_value(
    (index, value): (usize, &Value),
) -> std::result::Result<String, String> {
    if let Some(command) = value.as_str() {
        if command.trim().is_empty() {
            return Err(format!("commands[{index}] cannot be empty"));
        }
        return Ok(command.to_string());
    }
    let Some(parts) = value.as_array() else {
        return Err(format!(
            "commands[{index}] must be a string or array of strings"
        ));
    };
    if parts.is_empty() {
        return Err(format!("commands[{index}] cannot be empty"));
    }
    let mut args = Vec::new();
    for part in parts {
        let Some(text) = part.as_str() else {
            return Err(format!("commands[{index}] entries must be strings"));
        };
        if text.is_empty() {
            return Err(format!("commands[{index}] entries cannot be empty"));
        }
        args.push(text.to_string());
    }
    Ok(args
        .iter()
        .map(|arg| quote_batch_arg(arg))
        .collect::<Vec<_>>()
        .join(" "))
}

fn quote_batch_arg(arg: &str) -> String {
    if arg.is_empty()
        || arg
            .chars()
            .any(|ch| ch.is_whitespace() || matches!(ch, '"' | '\\'))
    {
        return format!("\"{}\"", arg.replace('\\', "\\\\").replace('"', "\\\""));
    }
    arg.to_string()
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
    core_tools()
        .into_iter()
        .filter(|tool| {
            tool.get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| profile.allows_tool(name))
        })
        .collect()
}

fn core_tools() -> Vec<Value> {
    vec![
        tool(
            TOOLS_PROFILES_TOOL,
            "List MCP tool profiles",
            "Describe available pire-browser MCP tool profiles and the active profile selection.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_launch",
            "Launch Firefox",
            "Lower-level launch of managed Firefox. Prefer pire_browser_open for normal launch/navigation workflows.",
            launch_tool_schema(),
            false,
        ),
        tool(
            "pire_browser_batch",
            "Run command batch",
            "Run multiple existing pire-browser browser commands in one invocation. Debug profile only; prefer typed single tools when possible.",
            tool_schema_without_extra_args(
                vec![
                    ("commands", batch_commands_prop()),
                    ("bail", bool_prop("Stop at the first command error.")),
                ],
                &["commands"],
            ),
            false,
        ),
        tool(
            "pire_browser_install",
            "Install or repair native host",
            "Register or repair the Firefox Native Messaging host for the current OS user. Debug profile only; mutates local setup. withDeps accepts agent-browser-style recipes and returns platform dependency guidance without running system package managers.",
            tool_schema_without_common(
                vec![
                    ("firefoxPath", string_prop("Optional Firefox executable path.")),
                    ("withDeps", bool_prop("Accept agent-browser-style --with-deps setup and print platform dependency guidance.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_upgrade",
            "Upgrade package",
            "Run the installed-package upgrade path through the npm/Pi JavaScript launcher. Debug profile only; mutates the package install when safe update rules allow it.",
            tool_schema_without_common(vec![], &[]),
            false,
        ),
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
                    ("headers", headers_prop_with_description("Optional request headers to apply to the target URL origin for this open command. Values may contain secrets.")),
                    ("initScriptPaths", string_array_prop("Local JavaScript files to register as best-effort document-start init scripts for this navigation.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_read",
            "Read page text",
            "Read agent-friendly text. With url, fetch without launching Firefox; without url, read rendered text from the active tab.",
            tool_schema(
                vec![
                    ("url", string_prop("Optional http(s) URL to fetch without launching Firefox.")),
                    ("filter", string_prop("Optional text filter for matching lines.")),
                    ("outline", bool_prop("Return headings instead of full text.")),
                    ("raw", bool_prop("Return raw response body for URL reads.")),
                    ("requireMarkdown", bool_prop("Fail URL reads unless the response is markdown.")),
                    ("llms", string_prop("Optional llms mode for URL reads: index or full.")),
                    ("timeoutMs", number_prop("HTTP read timeout in milliseconds.")),
                ],
                &[],
            ),
            true,
        ),
        tool(
            "pire_browser_snapshot",
            "Inspect page",
            "Return an interactive page snapshot with refs for the active page.",
            tool_schema(
                vec![
                    ("interactive", bool_prop("Include refs. Defaults to true.")),
                    ("compact", bool_prop("Reduce low-value structural noise.")),
                    ("cursorInteractive", bool_prop("Include visible cursor-pointer or inline onclick elements with refs.")),
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
            "pire_browser_tap",
            "Tap",
            "Agent-browser-style tap alias for clicking a ref or selector. This is not native touch input.",
            tool_schema(vec![("selector", string_prop("Ref or selector to tap/click."))], &["selector"]),
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
            "pire_browser_dblclick",
            "Double-click",
            "Agent-browser-style alias for double-clicking a ref or selector.",
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
            "pire_browser_keydown",
            "Key down",
            "Agent-browser-style alias for dispatching a keydown event.",
            tool_schema(vec![("key", string_prop("Key to press down."))], &["key"]),
            false,
        ),
        tool(
            "pire_browser_keyup",
            "Key up",
            "Agent-browser-style alias for dispatching a keyup event.",
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
            "pire_browser_swipe",
            "Swipe",
            "Best-effort mobile swipe alias that maps touch direction to page scroll. This is not native touch input.",
            tool_schema(
                vec![
                    ("direction", string_prop("up, down, left, or right. Defaults to up.")),
                    ("pixels", number_prop("Positive pixel distance. Defaults to 500.")),
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
            "Wait for milliseconds, selector, text, URL pattern, page function condition, or load state.",
            tool_schema(
                vec![
                    ("milliseconds", number_prop("Milliseconds to wait.")),
                    ("selector", string_prop("Selector/ref to wait for.")),
                    ("text", string_prop("Text to wait for.")),
                    ("url", string_prop("URL glob/pattern to wait for.")),
                    ("function", string_prop("Page-world JavaScript predicate expression to wait until truthy.")),
                    ("loadState", string_prop("Load state such as networkidle.")),
                    ("state", string_prop("Element state such as visible or hidden.")),
                    ("timeout", number_prop("Timeout in milliseconds.")),
                ],
                &[],
            ),
            true,
        ),
        tool(
            "pire_browser_wait_ms",
            "Wait milliseconds",
            "Wait for a fixed number of milliseconds.",
            tool_schema(vec![("ms", number_prop("Milliseconds to wait."))], &["ms"]),
            true,
        ),
        tool(
            "pire_browser_wait_for_selector",
            "Wait for selector",
            "Wait for an element selector or ref to appear.",
            wait_tool_schema(
                vec![("selector", string_prop("Selector/ref to wait for."))],
                &["selector"],
            ),
            true,
        ),
        tool(
            "pire_browser_wait_for_text",
            "Wait for text",
            "Wait for text to appear on the page.",
            wait_tool_schema(vec![("text", string_prop("Text to wait for."))], &["text"]),
            true,
        ),
        tool(
            "pire_browser_wait_for_url",
            "Wait for URL",
            "Wait for the current URL to match a glob or pattern.",
            wait_tool_schema(
                vec![("url", string_prop("URL glob/pattern to wait for."))],
                &["url"],
            ),
            true,
        ),
        tool(
            "pire_browser_wait_for_load",
            "Wait for load state",
            "Wait for a page load state.",
            wait_tool_schema(
                vec![(
                    "state",
                    json!({
                        "type": "string",
                        "enum": ["load", "domcontentloaded", "networkidle"],
                        "description": "Load state to wait for."
                    }),
                )],
                &["state"],
            ),
            true,
        ),
        tool(
            "pire_browser_wait_for_function",
            "Wait for function",
            "Wait for a JavaScript expression to become truthy.",
            wait_tool_schema(
                vec![(
                    "expression",
                    string_prop("Page-world JavaScript predicate expression to wait until truthy."),
                )],
                &["expression"],
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
            "pire_browser_diff_snapshot",
            "Diff snapshot",
            "Compare a fresh active-page snapshot to the previous snapshot or to a baseline text file.",
            tool_schema(
                vec![
                    (
                        "baselinePath",
                        string_prop("Optional local text snapshot baseline path."),
                    ),
                    (
                        "selector",
                        string_prop("Optional CSS selector to scope the snapshot."),
                    ),
                    ("compact", bool_prop("Use compact snapshot filtering.")),
                    ("urls", bool_prop("Include href URLs for links.")),
                    ("depth", number_prop("Optional snapshot depth limit.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_diff_screenshot",
            "Diff screenshot",
            "Compare a baseline image to a fresh active-page screenshot or explicit current image path.",
            tool_schema(
                vec![
                    ("baselinePath", string_prop("Baseline image path.")),
                    (
                        "currentPath",
                        string_prop(
                            "Optional current image path. When omitted, captures the active page.",
                        ),
                    ),
                    (
                        "outputPath",
                        string_prop("Optional red pixel-diff output image path."),
                    ),
                    (
                        "threshold",
                        float_prop("Per-channel color threshold from 0 to 1."),
                    ),
                    (
                        "full",
                        bool_prop("Capture full-page screenshot when currentPath is omitted."),
                    ),
                ],
                &["baselinePath"],
            ),
            false,
        ),
        tool(
            "pire_browser_diff_url",
            "Diff URLs",
            "Open two URLs and compare their snapshots, optionally including screenshot pixel comparison.",
            tool_schema(
                vec![
                    (
                        "baselineUrl",
                        string_prop("First URL to capture as the baseline."),
                    ),
                    (
                        "currentUrl",
                        string_prop("Second URL to compare against the baseline."),
                    ),
                    (
                        "screenshot",
                        bool_prop("Also capture screenshots and compare pixels."),
                    ),
                    (
                        "full",
                        bool_prop("Use full-page screenshots when screenshot is true."),
                    ),
                    (
                        "waitUntil",
                        string_prop(
                            "Optional load state: load, domcontentloaded, or networkidle.",
                        ),
                    ),
                    (
                        "selector",
                        string_prop("Optional CSS selector to scope snapshot diffing."),
                    ),
                    ("compact", bool_prop("Use compact snapshot filtering.")),
                    ("depth", number_prop("Optional snapshot depth limit.")),
                ],
                &["baselineUrl", "currentUrl"],
            ),
            false,
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
            "pire_browser_trace_start",
            "Start trace",
            "Start a Firefox QA evidence bundle recording for the active tab.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_trace_status",
            "Trace status",
            "Report whether a Firefox QA evidence bundle recording is active for the current tab.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_trace_stop",
            "Stop trace",
            "Stop a Firefox QA evidence bundle recording and optionally write the JSON bundle to a path.",
            tool_schema(
                vec![
                    ("path", string_prop("Optional output JSON path.")),
                    ("outputPath", string_prop("Compatibility alias for path.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_record_start",
            "Start recording",
            "Start bounded Firefox screenshot-sequence evidence recording for the active tab.",
            tool_schema(
                vec![
                    ("intervalMs", number_prop("Frame interval in milliseconds, from 250 to 10000.")),
                    ("maxFrames", number_prop("Maximum frame count, from 1 to 120.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_record_status",
            "Recording status",
            "Report active screenshot-sequence recording status for the current tab.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_record_stop",
            "Stop recording",
            "Stop screenshot-sequence evidence recording and optionally write frames under an output directory.",
            tool_schema(
                vec![
                    ("outputDir", string_prop("Optional output directory for frame PNGs and recording.json.")),
                    ("path", string_prop("Compatibility alias for outputDir.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_react_tree",
            "React tree",
            "Show the active page's best-effort React component tree from Firefox Fiber data.",
            tool_schema(
                vec![
                    ("selector", string_prop("Optional CSS selector to scope React component discovery.")),
                    ("depth", number_prop("Optional component tree depth limit.")),
                ],
                &[],
            ),
            true,
        ),
        tool(
            "pire_browser_react_inspect",
            "React inspect",
            "Inspect a React component by rN id from react tree, snapshot ref, or CSS selector.",
            tool_schema(vec![("target", string_prop("React rN id, snapshot ref, or CSS selector."))], &["target"]),
            true,
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
            "pire_browser_clipboard_read",
            "Clipboard read",
            "Read clipboard text through the Firefox extension clipboard path.",
            tool_schema(vec![], &[]),
            true,
        ),
        tool(
            "pire_browser_clipboard_write",
            "Clipboard write",
            "Write clipboard text through the Firefox extension clipboard path.",
            tool_schema(vec![("text", string_prop("Text to write."))], &["text"]),
            false,
        ),
        tool(
            "pire_browser_clipboard_copy",
            "Clipboard copy",
            "Copy the active page selection through the Firefox extension clipboard path.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_clipboard_paste",
            "Clipboard paste",
            "Paste clipboard text at the current focused page element.",
            tool_schema(vec![], &[]),
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
            "pire_browser_get_text",
            "Get text",
            "Get visible text from a ref or selector.",
            selector_tool_schema("Ref or selector to read text from."),
            true,
        ),
        tool(
            "pire_browser_get_html",
            "Get HTML",
            "Get innerHTML from a ref or selector.",
            selector_tool_schema("Ref or selector to read HTML from."),
            true,
        ),
        tool(
            "pire_browser_get_value",
            "Get value",
            "Get an input value from a ref or selector.",
            selector_tool_schema("Ref or selector to read value from."),
            true,
        ),
        tool(
            "pire_browser_get_attr",
            "Get attribute",
            "Get an element attribute from a ref or selector.",
            tool_schema(
                vec![
                    ("selector", string_prop("Ref or selector to read from.")),
                    ("name", string_prop("Attribute name.")),
                ],
                &["selector", "name"],
            ),
            true,
        ),
        tool(
            "pire_browser_get_count",
            "Get count",
            "Count matching elements for a selector.",
            selector_tool_schema("Selector to count."),
            true,
        ),
        tool(
            "pire_browser_get_box",
            "Get box",
            "Get the bounding box for a ref or selector.",
            selector_tool_schema("Ref or selector to measure."),
            true,
        ),
        tool(
            "pire_browser_get_styles",
            "Get styles",
            "Get computed styles for a ref or selector.",
            selector_tool_schema("Ref or selector to inspect styles for."),
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
            "pire_browser_is_visible",
            "Is visible",
            "Check whether a ref or selector is visible.",
            selector_tool_schema("Ref or selector to check."),
            true,
        ),
        tool(
            "pire_browser_is_enabled",
            "Is enabled",
            "Check whether a ref or selector is enabled.",
            selector_tool_schema("Ref or selector to check."),
            true,
        ),
        tool(
            "pire_browser_is_checked",
            "Is checked",
            "Check whether a ref or selector is checked.",
            selector_tool_schema("Ref or selector to check."),
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
            "pire_browser_get_title",
            "Get title",
            "Return the current active page title.",
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
            "pire_browser_doctor",
            "Doctor",
            "Run install/session diagnostics; use fix only when the user wants repair.",
            tool_schema(
                vec![
                    ("fix", bool_prop("Run explicit setup repair before reporting follow-up status.")),
                    ("firefoxPath", string_prop("Optional Firefox executable path for repair.")),
                ],
                &[],
            ),
            false,
        ),
        tool(
            "pire_browser_activity_list",
            "Activity list",
            "Return recent redacted pire-browser command activity.",
            tool_schema(
                vec![("limit", number_prop("Maximum activity entries, capped by the CLI."))],
                &[],
            ),
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
            "pire_browser_device",
            "Device preset",
            "Agent-browser-style alias for a best-effort viewport device preset such as iPhone 14, Pixel 7, Galaxy S22, or iPad.",
            tool_schema(vec![("name", string_prop("Device preset name."))], &["name"]),
            false,
        ),
        tool(
            "pire_browser_set_device",
            "Set device preset",
            "Compatibility spelling for pire_browser_device; applies a best-effort viewport preset such as iPhone 14, Pixel 7, Galaxy S22, or iPad.",
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
            "Set or import cookies",
            "Set one cookie for the active tab URL, or import cookies from Copy-as-cURL/JSON/Cookie header text. Values may contain secrets.",
            tool_schema(
                vec![
                    ("name", string_prop("Cookie name for single-cookie set.")),
                    ("value", string_prop("Cookie value for single-cookie set.")),
                    ("curl", string_prop("Copy-as-cURL dump, JSON cookie array, object with cookies array, or bare Cookie header text.")),
                    ("domain", string_prop("Domain or URL to scope imported cookies when no active page URL should be used.")),
                ],
                &[],
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
            "Return metadata and redacted request/response headers for one recorded network request.",
            tool_schema(vec![("requestId", string_prop("Recorded request id."))], &["requestId"]),
            true,
        ),
        tool(
            "pire_browser_network_har_start",
            "Start HAR recording",
            "Start active-tab metadata HAR recording with redacted headers.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_network_har_stop",
            "Stop HAR recording",
            "Stop active-tab metadata HAR recording with redacted headers and optionally write a HAR file.",
            tool_schema(vec![("path", string_prop("Optional output HAR path."))], &[]),
            false,
        ),
        tool(
            "pire_browser_network_har_export",
            "Export HAR",
            "Export currently captured active-tab request metadata and redacted headers as HAR.",
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
            "pire_browser_tab_list",
            "List tabs",
            "Agent-browser-style alias for listing managed Firefox tabs.",
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
            "pire_browser_tab_switch",
            "Switch tab",
            "Agent-browser-style alias for switching to an existing tab by tab id or label.",
            tool_schema(
                vec![("tab", string_prop("Tab id such as t2, or tab label."))],
                &["tab"],
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
            "pire_browser_tab_close",
            "Close tab",
            "Agent-browser-style alias for closing a tab by tab id or label, or the active tab when omitted.",
            tool_schema(vec![("tab", string_prop("Optional tab id or label."))], &[]),
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
            "pire_browser_back",
            "Back",
            "Navigate the active tab back in history.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_forward",
            "Forward",
            "Navigate the active tab forward in history.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_reload",
            "Reload",
            "Reload the active tab and refresh refs afterward.",
            tool_schema(vec![], &[]),
            false,
        ),
        tool(
            "pire_browser_pushstate",
            "Push state",
            "Perform same-origin SPA client-side navigation in the active page.",
            tool_schema(
                vec![("url", string_prop("Same-origin URL or path to push in the active page."))],
                &["url"],
            ),
            false,
        ),
        tool(
            "pire_browser_add_init_script",
            "Add init script",
            "Register a document-start script for future navigations in the managed session.",
            tool_schema(
                vec![("script", string_prop("JavaScript source to register."))],
                &["script"],
            ),
            false,
        ),
        tool(
            "pire_browser_remove_init_script",
            "Remove init script",
            "Remove a runtime init script by identifier returned from add init script.",
            tool_schema(
                vec![("identifier", string_prop("Init script identifier such as init1."))],
                &["identifier"],
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
            "pire_browser_frame_switch",
            "Switch frame",
            "Agent-browser-style alias for scoping snapshots and selector-based actions to an iframe.",
            tool_schema(
                vec![("frame", string_prop("Iframe ref such as @e3, or CSS selector."))],
                &["frame"],
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
            "pire_browser_confirm",
            "Confirm action",
            "Approve a pending confirmation id after the user explicitly approves it.",
            tool_schema(
                vec![("confirmationId", string_prop("Pending confirmation id such as c_1234abcd."))],
                &["confirmationId"],
            ),
            false,
        ),
        tool(
            "pire_browser_deny",
            "Deny action",
            "Deny and consume a pending confirmation id.",
            tool_schema(
                vec![("confirmationId", string_prop("Pending confirmation id such as c_1234abcd."))],
                &["confirmationId"],
            ),
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
        "annotations": tool_annotations(name, read_only)
    })
}

fn tool_annotations(name: &str, read_only: bool) -> Value {
    json!({
        "readOnlyHint": read_only,
        "openWorldHint": is_open_world_tool(name)
    })
}

fn is_open_world_tool(name: &str) -> bool {
    !matches!(
        name,
        TOOLS_PROFILES_TOOL
            | "pire_browser_status"
            | "pire_browser_doctor"
            | "pire_browser_activity_list"
            | "pire_browser_install"
            | "pire_browser_upgrade"
            | "pire_browser_session_list"
            | "pire_browser_session_attach"
            | "pire_browser_session_cleanup"
            | "pire_browser_profiles_list"
            | "pire_browser_skills_get_core"
    )
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

fn tool_schema_without_common(properties: Vec<(&str, Value)>, required: &[&str]) -> Value {
    let mut map = Map::new();
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

fn tool_schema_without_extra_args(properties: Vec<(&str, Value)>, required: &[&str]) -> Value {
    let mut map = common_properties();
    map.remove("extraArgs");
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

fn selector_tool_schema(description: &str) -> Value {
    tool_schema(vec![("selector", string_prop(description))], &["selector"])
}

fn wait_tool_schema(properties: Vec<(&str, Value)>, required: &[&str]) -> Value {
    let mut properties = properties;
    properties.push((
        "waitTimeoutMs",
        json!({
            "type": "integer",
            "minimum": 1,
            "description": "Maximum time for the browser wait condition."
        }),
    ));
    tool_schema(properties, required)
}

fn launch_tool_schema() -> Value {
    tool_schema_without_common(
        vec![
            (
                "profile",
                string_prop("Managed Firefox profile to launch. Defaults to Default."),
            ),
            ("url", string_prop("Optional URL to open at launch.")),
            (
                "firefoxPath",
                string_prop("Optional Firefox executable path for this launch."),
            ),
            (
                "allowedDomains",
                string_or_array_prop(
                    "Comma-separated allowlist or array of domains for the optional launch URL.",
                ),
            ),
            (
                "noAllowedDomains",
                bool_prop("Disable configured domain allowlist checks for the optional launch URL."),
            ),
            (
                "actionPolicy",
                string_prop("Action-policy JSON file path for the optional launch URL."),
            ),
            (
                "confirmActions",
                string_prop(
                    "Comma-separated action classes that require explicit confirmation, such as navigate.",
                ),
            ),
            (
                "confirmInteractive",
                bool_prop("Also require confirmation for interactive page actions."),
            ),
        ],
        &[],
    )
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
        "statePath".to_string(),
        string_prop("Optional state file path to load before this browser command."),
    );
    map.insert(
        "allowFileAccess".to_string(),
        bool_prop("Allow local file:// URL access for this command."),
    );
    map.insert(
        "allowedDomains".to_string(),
        string_or_array_prop(
            "Comma-separated allowlist or array of domains for navigation/network guardrails.",
        ),
    );
    map.insert(
        "noAllowedDomains".to_string(),
        bool_prop("Disable configured domain allowlist checks for this command."),
    );
    map.insert(
        "actionPolicy".to_string(),
        string_prop("Action-policy JSON file path for this command."),
    );
    map.insert(
        "confirmActions".to_string(),
        string_prop("Comma-separated action classes that require explicit confirmation, such as eval,navigate,network."),
    );
    map.insert(
        "confirmInteractive".to_string(),
        bool_prop("Also require confirmation for interactive page actions."),
    );
    map.insert(
        "contentBoundaries".to_string(),
        bool_prop("Mark page-sourced output with content boundaries."),
    );
    map.insert(
        "maxOutput".to_string(),
        number_prop("Maximum emitted browser command text."),
    );
    map.insert(
        "proxy".to_string(),
        string_prop("Firefox proxy URL to apply before browser bridge commands."),
    );
    map.insert(
        "proxyBypass".to_string(),
        string_prop("Comma-separated Firefox proxy bypass list."),
    );
    map.insert(
        "executablePath".to_string(),
        string_prop("Firefox executable path override for auto-launch."),
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
    headers_prop_with_description("Header names to string, number, or boolean values. Empty object clears headers for the active origin.")
}

fn headers_prop_with_description(description: &str) -> Value {
    json!({
        "type": "object",
        "description": description,
        "additionalProperties": {
            "oneOf": [
                { "type": "string" },
                { "type": "number" },
                { "type": "boolean" }
            ]
        }
    })
}

fn string_array_prop(description: &str) -> Value {
    json!({
        "type": "array",
        "items": { "type": "string" },
        "description": description
    })
}

fn string_or_array_prop(description: &str) -> Value {
    json!({
        "oneOf": [
            { "type": "string" },
            {
                "type": "array",
                "items": { "type": "string" }
            }
        ],
        "description": description
    })
}

fn batch_commands_prop() -> Value {
    json!({
        "type": "array",
        "minItems": 1,
        "description": "Commands to run. Each entry may be a command string such as `snapshot -i` or an array of CLI args such as [`snapshot`, `-i`].",
        "items": {
            "oneOf": [
                { "type": "string", "minLength": 1 },
                {
                    "type": "array",
                    "items": { "type": "string", "minLength": 1 },
                    "minItems": 1
                }
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

    fn s(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    fn tool_named<'a>(tools: &'a [Value], name: &str) -> &'a Value {
        tools
            .iter()
            .find(|tool| tool["name"] == name)
            .unwrap_or_else(|| panic!("missing tool {name}"))
    }

    #[test]
    fn initialize_advertises_core_tools_and_version() {
        let result = initialize_result(None);
        assert_eq!(result["protocolVersion"], MCP_PROTOCOL_VERSION);
        assert_eq!(result["serverInfo"]["name"], "pire-browser");
        assert_eq!(result["serverInfo"]["version"], env!("CARGO_PKG_VERSION"));
        assert!(result["capabilities"]["tools"].is_object());
    }

    #[test]
    fn initialize_negotiates_supported_protocol_versions() {
        for version in SUPPORTED_PROTOCOL_VERSIONS {
            let result = initialize_result(Some(&json!({ "protocolVersion": version })));
            assert_eq!(result["protocolVersion"], *version);
        }

        let unsupported = initialize_result(Some(&json!({ "protocolVersion": "2099-01-01" })));
        assert_eq!(unsupported["protocolVersion"], MCP_PROTOCOL_VERSION);

        let missing = initialize_result(Some(&json!({})));
        assert_eq!(missing["protocolVersion"], MCP_PROTOCOL_VERSION);

        let non_string = initialize_result(Some(&json!({ "protocolVersion": 20251125 })));
        assert_eq!(non_string["protocolVersion"], MCP_PROTOCOL_VERSION);
    }

    #[test]
    fn lists_core_tools_with_schemas() {
        let tools = mcp_tools(McpToolsProfile::Core);
        assert!(tools.iter().any(|tool| tool["name"] == TOOLS_PROFILES_TOOL));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_snapshot"));
        assert!(tools.iter().any(|tool| tool["name"] == "pire_browser_read"));
        assert!(tools.iter().any(|tool| tool["name"] == "pire_browser_get"));
        assert!(tools.iter().any(|tool| tool["name"] == "pire_browser_is"));
        for name in [
            "pire_browser_get_text",
            "pire_browser_get_html",
            "pire_browser_get_value",
            "pire_browser_get_attr",
            "pire_browser_get_count",
            "pire_browser_get_box",
            "pire_browser_get_styles",
            "pire_browser_get_url",
            "pire_browser_get_title",
            "pire_browser_is_visible",
            "pire_browser_is_enabled",
            "pire_browser_is_checked",
        ] {
            assert!(tools.iter().any(|tool| tool["name"] == name), "{name}");
        }
        assert!(tools.iter().any(|tool| tool["name"] == "pire_browser_find"));
        assert!(tools.iter().any(|tool| tool["name"] == "pire_browser_tap"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_swipe"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_double_click"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_dblclick"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_hover"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_upload"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_wait_download"));
        for name in [
            "pire_browser_wait_ms",
            "pire_browser_wait_for_selector",
            "pire_browser_wait_for_text",
            "pire_browser_wait_for_url",
            "pire_browser_wait_for_load",
            "pire_browser_wait_for_function",
        ] {
            assert!(tools.iter().any(|tool| tool["name"] == name), "{name}");
        }
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_mouse_move"));
        assert!(tools.iter().any(|tool| tool["name"] == "pire_browser_pdf"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_diff_url"));
        assert!(tools.iter().any(|tool| tool["name"] == "pire_browser_back"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_reload"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_pushstate"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_add_init_script"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_confirm"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_profiles_list"));
        assert!(tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_skills_get_core"));
        assert!(!tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_network_route"));
        assert!(!tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_auth_login"));
        assert!(!tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_window_new"));
        assert!(!tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_clipboard_read"));
        assert!(!tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_doctor"));
        assert!(!tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_launch"));
        assert!(!tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_batch"));
        assert!(!tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_install"));
        assert!(!tools
            .iter()
            .any(|tool| tool["name"] == "pire_browser_upgrade"));
        let snapshot = tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_snapshot")
            .unwrap();
        assert_eq!(snapshot["inputSchema"]["type"], "object");
        assert_eq!(
            snapshot["inputSchema"]["properties"]["extraArgs"]["type"],
            "array"
        );
        let wait = tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_wait")
            .unwrap();
        assert_eq!(
            wait["inputSchema"]["properties"]["function"]["type"],
            "string"
        );
        let wait_for_selector = tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_wait_for_selector")
            .unwrap();
        assert_eq!(wait_for_selector["inputSchema"]["required"][0], "selector");
        assert_eq!(
            wait_for_selector["inputSchema"]["properties"]["waitTimeoutMs"]["minimum"],
            1
        );
        let wait_for_load = tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_wait_for_load")
            .unwrap();
        assert_eq!(
            wait_for_load["inputSchema"]["properties"]["state"]["enum"],
            json!(["load", "domcontentloaded", "networkidle"])
        );
        let open = tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_open")
            .unwrap();
        assert_eq!(
            open["inputSchema"]["properties"]["statePath"]["type"],
            "string"
        );
        assert_eq!(
            open["inputSchema"]["properties"]["allowedDomains"]["oneOf"][1]["type"],
            "array"
        );
        let get_attr = tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_get_attr")
            .unwrap();
        assert_eq!(
            get_attr["inputSchema"]["required"],
            json!(["selector", "name"])
        );
        let is_visible = tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_is_visible")
            .unwrap();
        assert_eq!(is_visible["inputSchema"]["required"], json!(["selector"]));
        assert_eq!(
            open["inputSchema"]["properties"]["headers"]["type"],
            "object"
        );
        assert_eq!(
            open["inputSchema"]["properties"]["initScriptPaths"]["type"],
            "array"
        );
        let debug_tools = mcp_tools(McpToolsProfile::Debug);
        let launch = debug_tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_launch")
            .unwrap();
        assert_eq!(
            launch["inputSchema"]["properties"]["profile"]["type"],
            "string"
        );
        assert!(launch["inputSchema"]["properties"]
            .as_object()
            .unwrap()
            .get("session")
            .is_none());
        assert!(launch["inputSchema"]["properties"]
            .as_object()
            .unwrap()
            .get("extraArgs")
            .is_none());
        let batch = debug_tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_batch")
            .unwrap();
        assert_eq!(
            batch["inputSchema"]["properties"]["commands"]["type"],
            "array"
        );
        assert_eq!(
            batch["inputSchema"]["properties"]["commands"]["items"]["oneOf"][1]["type"],
            "array"
        );
        assert!(batch["inputSchema"]["properties"]
            .as_object()
            .unwrap()
            .get("extraArgs")
            .is_none());
        let install = debug_tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_install")
            .unwrap();
        assert_eq!(
            install["inputSchema"]["properties"]["firefoxPath"]["type"],
            "string"
        );
        assert_eq!(
            install["inputSchema"]["properties"]["withDeps"]["type"],
            "boolean"
        );
        assert!(install["inputSchema"]["properties"]
            .as_object()
            .unwrap()
            .get("session")
            .is_none());
        assert!(install["inputSchema"]["properties"]
            .as_object()
            .unwrap()
            .get("extraArgs")
            .is_none());
        let upgrade = debug_tools
            .iter()
            .find(|tool| tool["name"] == "pire_browser_upgrade")
            .unwrap();
        assert!(upgrade["inputSchema"]["properties"]
            .as_object()
            .unwrap()
            .get("extraArgs")
            .is_none());
        assert!(upgrade["inputSchema"]["properties"]
            .as_object()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn lists_profile_specific_tools() {
        let network = mcp_tools(McpToolsProfile::Network);
        assert!(network
            .iter()
            .any(|tool| tool["name"] == "pire_browser_network_route"));
        assert!(!network
            .iter()
            .any(|tool| tool["name"] == "pire_browser_click"));

        let state = mcp_tools(McpToolsProfile::State);
        assert!(state
            .iter()
            .any(|tool| tool["name"] == "pire_browser_auth_login"));
        assert!(state
            .iter()
            .any(|tool| tool["name"] == "pire_browser_clipboard"));

        let debug = mcp_tools(McpToolsProfile::Debug);
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_launch"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_batch"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_install"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_upgrade"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_doctor"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_activity_list"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_trace_start"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_trace_status"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_trace_stop"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_record_start"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_record_status"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_record_stop"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_session_list"));
        assert!(debug
            .iter()
            .any(|tool| tool["name"] == "pire_browser_confirm"));

        let tabs = mcp_tools(McpToolsProfile::Tabs);
        assert!(tabs
            .iter()
            .any(|tool| tool["name"] == "pire_browser_window_new"));
        assert!(tabs.iter().any(|tool| tool["name"] == "pire_browser_back"));
        assert!(tabs
            .iter()
            .any(|tool| tool["name"] == "pire_browser_dialog_status"));
        assert!(tabs
            .iter()
            .any(|tool| tool["name"] == "pire_browser_tab_new"));
        assert!(tabs
            .iter()
            .any(|tool| tool["name"] == "pire_browser_tab_list"));
        assert!(tabs
            .iter()
            .any(|tool| tool["name"] == "pire_browser_tab_switch"));
        assert!(tabs
            .iter()
            .any(|tool| tool["name"] == "pire_browser_tab_close"));
        assert!(tabs
            .iter()
            .any(|tool| tool["name"] == "pire_browser_frame_switch"));

        let mobile = mcp_tools(McpToolsProfile::Mobile);
        assert!(mobile
            .iter()
            .any(|tool| tool["name"] == "pire_browser_screenshot"));
        assert!(mobile
            .iter()
            .any(|tool| tool["name"] == "pire_browser_device"));
        assert!(mobile.iter().any(|tool| tool["name"] == "pire_browser_tap"));
        assert!(mobile
            .iter()
            .any(|tool| tool["name"] == "pire_browser_swipe"));

        let combined = mcp_tools(McpToolsProfile::parse("core,network").unwrap());
        assert!(combined
            .iter()
            .any(|tool| tool["name"] == "pire_browser_click"));
        assert!(combined
            .iter()
            .any(|tool| tool["name"] == "pire_browser_network_route"));

        let all = mcp_tools(McpToolsProfile::All);
        assert!(all.iter().any(|tool| tool["name"] == "pire_browser_batch"));
        assert!(all
            .iter()
            .any(|tool| tool["name"] == "pire_browser_install"));
        assert!(all
            .iter()
            .any(|tool| tool["name"] == "pire_browser_upgrade"));

        let react = mcp_tools(McpToolsProfile::React);
        assert!(react
            .iter()
            .any(|tool| tool["name"] == "pire_browser_react_tree"));
        assert!(react
            .iter()
            .any(|tool| tool["name"] == "pire_browser_react_inspect"));
        assert!(react
            .iter()
            .any(|tool| tool["name"] == "pire_browser_vitals"));
    }

    #[test]
    fn tool_annotations_mark_local_context_tools_closed_world() {
        let tools = mcp_tools(McpToolsProfile::All);
        let open = tool_named(&tools, "pire_browser_open");
        assert_eq!(open["annotations"]["readOnlyHint"], false);
        assert_eq!(open["annotations"]["openWorldHint"], true);

        let read = tool_named(&tools, "pire_browser_read");
        assert_eq!(read["annotations"]["readOnlyHint"], true);
        assert_eq!(read["annotations"]["openWorldHint"], true);

        let get_text = tool_named(&tools, "pire_browser_get_text");
        assert_eq!(get_text["annotations"]["readOnlyHint"], true);
        assert_eq!(get_text["annotations"]["openWorldHint"], true);

        let is_visible = tool_named(&tools, "pire_browser_is_visible");
        assert_eq!(is_visible["annotations"]["readOnlyHint"], true);
        assert_eq!(is_visible["annotations"]["openWorldHint"], true);

        let clipboard_read = tool_named(&tools, "pire_browser_clipboard_read");
        assert_eq!(clipboard_read["annotations"]["readOnlyHint"], true);
        assert_eq!(clipboard_read["annotations"]["openWorldHint"], true);

        let clipboard_write = tool_named(&tools, "pire_browser_clipboard_write");
        assert_eq!(clipboard_write["annotations"]["readOnlyHint"], false);
        assert_eq!(clipboard_write["annotations"]["openWorldHint"], true);

        let wait_for_selector = tool_named(&tools, "pire_browser_wait_for_selector");
        assert_eq!(wait_for_selector["annotations"]["readOnlyHint"], true);
        assert_eq!(wait_for_selector["annotations"]["openWorldHint"], true);

        let get_url = tool_named(&tools, "pire_browser_get_url");
        assert_eq!(get_url["annotations"]["readOnlyHint"], true);
        assert_eq!(get_url["annotations"]["openWorldHint"], true);

        for name in [
            TOOLS_PROFILES_TOOL,
            "pire_browser_status",
            "pire_browser_doctor",
            "pire_browser_activity_list",
            "pire_browser_install",
            "pire_browser_upgrade",
            "pire_browser_session_list",
            "pire_browser_session_attach",
            "pire_browser_session_cleanup",
            "pire_browser_profiles_list",
            "pire_browser_skills_get_core",
        ] {
            let tool = tool_named(&tools, name);
            assert_eq!(tool["annotations"]["openWorldHint"], false, "{name}");
        }

        assert_eq!(
            tool_named(&tools, "pire_browser_install")["annotations"]["readOnlyHint"],
            false
        );
        assert_eq!(
            tool_named(&tools, "pire_browser_upgrade")["annotations"]["readOnlyHint"],
            false
        );
        assert_eq!(
            tool_named(&tools, "pire_browser_skills_get_core")["annotations"]["readOnlyHint"],
            true
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

        let legacy_init = handle_message(
            r#"{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}"#,
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(legacy_init["id"], 2);
        assert_eq!(legacy_init["result"]["protocolVersion"], "2024-11-05");

        let list = handle_message(
            r#"{"jsonrpc":"2.0","id":"tools","method":"tools/list"}"#,
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(list["id"], "tools");
        assert!(list["result"]["tools"].as_array().unwrap().len() >= 10);
    }

    #[test]
    fn tools_list_paginates_large_profiles_with_string_cursors() {
        let total = mcp_tools(McpToolsProfile::All).len();
        assert!(total > TOOL_LIST_PAGE_SIZE);

        let first = handle_message(
            r#"{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}"#,
            McpToolsProfile::All,
        )
        .unwrap();
        assert_eq!(
            first["result"]["tools"].as_array().unwrap().len(),
            TOOL_LIST_PAGE_SIZE
        );
        assert_eq!(
            first["result"]["nextCursor"],
            TOOL_LIST_PAGE_SIZE.to_string()
        );

        let next_cursor = TOOL_LIST_PAGE_SIZE.to_string();
        let second = handle_message(
            &format!(
                r#"{{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{{"cursor":"{next_cursor}"}}}}"#
            ),
            McpToolsProfile::All,
        )
        .unwrap();
        assert_eq!(
            second["result"]["tools"].as_array().unwrap().len(),
            (total - TOOL_LIST_PAGE_SIZE).min(TOOL_LIST_PAGE_SIZE)
        );
        if total > TOOL_LIST_PAGE_SIZE * 2 {
            assert_eq!(
                second["result"]["nextCursor"],
                (TOOL_LIST_PAGE_SIZE * 2).to_string()
            );
        } else {
            assert!(second["result"].get("nextCursor").is_none());
        }

        let end = handle_message(
            &format!(
                r#"{{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{{"cursor":"{total}"}}}}"#
            ),
            McpToolsProfile::All,
        )
        .unwrap();
        assert_eq!(end["result"]["tools"].as_array().unwrap().len(), 0);
        assert!(end["result"].get("nextCursor").is_none());
    }

    #[test]
    fn tools_list_rejects_invalid_cursors() {
        for (id, cursor) in [
            ("bad_string", json!("not-a-number")),
            ("bad_type", json!(1)),
            (
                "too_large",
                json!((mcp_tools(McpToolsProfile::Core).len() + 1).to_string()),
            ),
        ] {
            let result = handle_value(
                &json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "method": "tools/list",
                    "params": { "cursor": cursor }
                }),
                McpToolsProfile::Core,
            )
            .unwrap();
            assert_eq!(result["id"], id);
            assert_eq!(result["error"]["code"], -32602);
        }
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
    fn rejects_profile_unavailable_tool_calls() {
        let result = handle_message(
            r#"{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"pire_browser_network_route","arguments":{"pattern":"**/api/**"}}}"#,
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(result["id"], 8);
        assert_eq!(result["result"]["isError"], true);
        assert!(result["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("not available in MCP tools profile `core`"));

        let result = handle_message(
            r#"{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"pire_browser_install","arguments":{}}}"#,
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(result["id"], 10);
        assert_eq!(result["result"]["isError"], true);
        assert!(result["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("not available in MCP tools profile `core`"));

        let result = handle_message(
            r#"{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"pire_browser_upgrade","arguments":{}}}"#,
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(result["id"], 11);
        assert_eq!(result["result"]["isError"], true);
        assert!(result["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("not available in MCP tools profile `core`"));

        let result = handle_message(
            r#"{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"pire_browser_batch","arguments":{"commands":["snapshot -i"]}}}"#,
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(result["id"], 9);
        assert_eq!(result["result"]["isError"], true);
        assert!(result["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("not available in MCP tools profile `core`"));
    }

    #[test]
    fn tools_profiles_tool_returns_structured_profile_list() {
        let result = handle_message(
            r#"{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"pire_browser_tools_profiles","arguments":{}}}"#,
            McpToolsProfile::parse("core,network").unwrap(),
        )
        .unwrap();
        assert_eq!(result["id"], 9);
        assert_eq!(result["result"]["isError"], false);
        assert_eq!(
            result["result"]["structuredContent"]["active"],
            "core,network"
        );
        assert!(result["result"]["structuredContent"]["profiles"]
            .as_array()
            .unwrap()
            .iter()
            .any(|profile| profile["name"] == "network" && profile["active"] == true));
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
        let args =
            tool_command_args("pire_browser_launch", &json!({}), McpToolsProfile::Core).unwrap();
        assert_eq!(args, vec!["--json", "launch"]);

        let args = tool_command_args(
            "pire_browser_launch",
            &json!({
                "profile": "Work",
                "url": "https://example.com",
                "firefoxPath": "C:/Firefox/firefox.exe",
                "allowedDomains": ["example.com", "*.example.com"],
                "actionPolicy": "policy.json",
                "confirmActions": "navigate",
                "confirmInteractive": true
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "--allowed-domains",
                "example.com,*.example.com",
                "--action-policy",
                "policy.json",
                "--confirm-actions",
                "navigate",
                "--confirm-interactive",
                "launch",
                "--profile",
                "Work",
                "--url",
                "https://example.com",
                "--firefox-path",
                "C:/Firefox/firefox.exe"
            ]
        );

        let args = tool_command_args(
            "pire_browser_batch",
            &json!({
                "sessionName": "qa",
                "allowedDomains": ["example.com", "*.example.com"],
                "bail": true,
                "commands": [
                    ["open", "https://example.com"],
                    ["snapshot", "-i"],
                    ["screenshot", "result path.png"],
                    "get url"
                ]
            }),
            McpToolsProfile::Debug,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "--session-name",
                "qa",
                "--allowed-domains",
                "example.com,*.example.com",
                "batch",
                "--bail",
                "open https://example.com",
                "snapshot -i",
                "screenshot \"result path.png\"",
                "get url"
            ]
        );

        let args = tool_command_args(
            "pire_browser_install",
            &json!({
                "withDeps": true,
                "firefoxPath": "C:/Program Files/Mozilla Firefox/firefox.exe"
            }),
            McpToolsProfile::Debug,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "install",
                "--with-deps",
                "--firefox-path",
                "C:/Program Files/Mozilla Firefox/firefox.exe"
            ]
        );

        let args =
            tool_command_args("pire_browser_upgrade", &json!({}), McpToolsProfile::Debug).unwrap();
        assert_eq!(args, vec!["--json", "upgrade"]);

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
            "pire_browser_open",
            &json!({
                "sessionName": "qa",
                "statePath": ".pire-state/app.json",
                "allowedDomains": ["example.com", "*.example.com"],
                "actionPolicy": "policy.json",
                "confirmActions": "eval,navigate",
                "confirmInteractive": true,
                "allowFileAccess": true,
                "proxy": "http://proxy.example:8080",
                "proxyBypass": "localhost,*.internal",
                "maxOutput": 50000,
                "contentBoundaries": true,
                "executablePath": "C:/Program Files/Mozilla Firefox/firefox.exe",
                "url": "https://example.com/app",
                "headers": {
                    "X-Preview": "on",
                    "X-Trace": 42,
                    "X-Enabled": true
                },
                "initScriptPaths": ["scripts/bootstrap.js", "scripts/flags.js"]
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "--session-name",
                "qa",
                "--state",
                ".pire-state/app.json",
                "--allowed-domains",
                "example.com,*.example.com",
                "--action-policy",
                "policy.json",
                "--confirm-actions",
                "eval,navigate",
                "--confirm-interactive",
                "--allow-file-access",
                "--proxy",
                "http://proxy.example:8080",
                "--proxy-bypass",
                "localhost,*.internal",
                "--max-output",
                "50000",
                "--content-boundaries",
                "--executable-path",
                "C:/Program Files/Mozilla Firefox/firefox.exe",
                "open",
                "https://example.com/app",
                "--init-script",
                "scripts/bootstrap.js",
                "--init-script",
                "scripts/flags.js",
                "--headers",
                r#"{"X-Enabled":true,"X-Preview":"on","X-Trace":42}"#
            ]
        );

        let args = tool_command_args(
            "pire_browser_read",
            &json!({
                "url": "https://example.com/docs",
                "filter": "auth",
                "outline": true,
                "llms": "index",
                "timeoutMs": 2000
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "read",
                "https://example.com/docs",
                "--outline",
                "--filter",
                "auth",
                "--llms",
                "index",
                "--timeout",
                "2000"
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
                "cursorInteractive": true,
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
                "-C",
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
            "pire_browser_get_text",
            &json!({ "selector": "@e1", "profile": "Work" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "--profile", "Work", "get", "text", "@e1"]
        );

        let args = tool_command_args(
            "pire_browser_get_html",
            &json!({ "selector": "#main" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "get", "html", "#main"]);

        let args = tool_command_args(
            "pire_browser_get_value",
            &json!({ "selector": "#email" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "get", "value", "#email"]);

        let args = tool_command_args(
            "pire_browser_get_attr",
            &json!({ "selector": "@e2", "name": "href" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "get", "attr", "@e2", "href"]);

        let args = tool_command_args(
            "pire_browser_get_count",
            &json!({ "selector": ".item" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "get", "count", ".item"]);

        let args = tool_command_args(
            "pire_browser_get_box",
            &json!({ "selector": "@e3" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "get", "box", "@e3"]);

        let args = tool_command_args(
            "pire_browser_get_styles",
            &json!({ "selector": "#main" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "get", "styles", "#main"]);

        let args =
            tool_command_args("pire_browser_get_title", &json!({}), McpToolsProfile::Core).unwrap();
        assert_eq!(args, vec!["--json", "get", "title"]);

        let args = tool_command_args(
            "pire_browser_is",
            &json!({ "state": "visible", "selector": "#submit" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "is", "visible", "#submit"]);

        let args = tool_command_args(
            "pire_browser_is_visible",
            &json!({ "selector": "#submit" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "is", "visible", "#submit"]);

        let args = tool_command_args(
            "pire_browser_is_enabled",
            &json!({ "selector": "#submit" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "is", "enabled", "#submit"]);

        let args = tool_command_args(
            "pire_browser_is_checked",
            &json!({ "selector": "#terms" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "is", "checked", "#terms"]);

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
            "pire_browser_swipe",
            &json!({ "direction": "up", "pixels": 500, "selector": "#panel" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "swipe", "up", "500", "--selector", "#panel"]
        );

        let args = tool_command_args(
            "pire_browser_tap",
            &json!({ "selector": "@e7" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "tap", "@e7"]);

        let args = tool_command_args(
            "pire_browser_double_click",
            &json!({ "selector": "@e7" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "dblclick", "@e7"]);

        let args = tool_command_args(
            "pire_browser_dblclick",
            &json!({ "selector": "@e7" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "dblclick", "@e7"]);

        let args = tool_command_args(
            "pire_browser_keydown",
            &json!({ "key": "Shift" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "keydown", "Shift"]);

        let args = tool_command_args(
            "pire_browser_keyup",
            &json!({ "key": "Shift" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "keyup", "Shift"]);

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
            "pire_browser_wait_ms",
            &json!({ "ms": 250 }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "wait", "250"]);

        let args = tool_command_args(
            "pire_browser_wait_for_selector",
            &json!({ "selector": "#ready", "waitTimeoutMs": 5000, "profile": "Work" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "--profile",
                "Work",
                "wait",
                "#ready",
                "--timeout",
                "5000"
            ]
        );

        let args = tool_command_args(
            "pire_browser_wait_for_text",
            &json!({ "text": "Saved" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "wait", "--text", "Saved"]);

        let args = tool_command_args(
            "pire_browser_wait_for_url",
            &json!({ "url": "**/dashboard", "waitTimeoutMs": 15000 }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "wait",
                "--url",
                "**/dashboard",
                "--timeout",
                "15000"
            ]
        );

        let args = tool_command_args(
            "pire_browser_wait_for_load",
            &json!({ "state": "networkidle" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "wait", "--load", "networkidle"]);

        let args = tool_command_args(
            "pire_browser_wait_for_function",
            &json!({ "expression": "window.appReady === true" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "wait", "--fn", "window.appReady === true"]
        );

        let args = tool_command_args(
            "pire_browser_wait",
            &json!({ "function": "window.appReady === true", "timeout": 15000 }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "wait",
                "--fn",
                "window.appReady === true",
                "--timeout",
                "15000"
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
            "pire_browser_clipboard_read",
            &json!({}),
            McpToolsProfile::State,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "clipboard", "read"]);

        let args = tool_command_args(
            "pire_browser_clipboard_write",
            &json!({ "text": "hello" }),
            McpToolsProfile::State,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "clipboard", "write", "hello"]);

        let args = tool_command_args(
            "pire_browser_clipboard_copy",
            &json!({}),
            McpToolsProfile::State,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "clipboard", "copy"]);

        let args = tool_command_args(
            "pire_browser_clipboard_paste",
            &json!({}),
            McpToolsProfile::State,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "clipboard", "paste"]);

        let args = tool_command_args(
            "pire_browser_pdf",
            &json!({ "path": "page.pdf", "viewport": true }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "pdf", "page.pdf", "--viewport"]);

        let args = tool_command_args(
            "pire_browser_diff_snapshot",
            &json!({
                "baselinePath": "before.txt",
                "selector": "#main",
                "compact": true,
                "urls": true,
                "depth": 3
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "diff",
                "snapshot",
                "--baseline",
                "before.txt",
                "--selector",
                "#main",
                "--compact",
                "--urls",
                "--depth",
                "3"
            ]
        );

        let args = tool_command_args(
            "pire_browser_diff_screenshot",
            &json!({
                "baselinePath": "before.png",
                "currentPath": "after.png",
                "outputPath": "diff.png",
                "threshold": 0.2,
                "full": true
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "diff",
                "screenshot",
                "--baseline",
                "before.png",
                "after.png",
                "--output",
                "diff.png",
                "--threshold",
                "0.2",
                "--full"
            ]
        );

        let args = tool_command_args(
            "pire_browser_diff_url",
            &json!({
                "baselineUrl": "https://v1.example",
                "currentUrl": "https://v2.example",
                "screenshot": true,
                "full": true,
                "waitUntil": "network-idle",
                "selector": "#main",
                "compact": true,
                "depth": 2
            }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "diff",
                "url",
                "https://v1.example",
                "https://v2.example",
                "--screenshot",
                "--full",
                "--wait-until",
                "networkidle",
                "--selector",
                "#main",
                "--compact",
                "--depth",
                "2"
            ]
        );

        assert!(tool_command_args(
            "pire_browser_diff_screenshot",
            &json!({ "baselinePath": "before.png", "threshold": 1.5 }),
            McpToolsProfile::Core,
        )
        .unwrap_err()
        .contains("threshold must be between 0 and 1"));

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

        let args =
            tool_command_args("pire_browser_trace_start", &json!({}), McpToolsProfile::Debug)
                .unwrap();
        assert_eq!(args, vec!["--json", "trace", "start"]);

        let args =
            tool_command_args("pire_browser_trace_status", &json!({}), McpToolsProfile::Debug)
                .unwrap();
        assert_eq!(args, vec!["--json", "trace", "status"]);

        let args = tool_command_args(
            "pire_browser_trace_stop",
            &json!({ "path": "trace.json" }),
            McpToolsProfile::Debug,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "trace", "stop", "trace.json"]);

        let args = tool_command_args(
            "pire_browser_record_start",
            &json!({ "intervalMs": 500, "maxFrames": 5 }),
            McpToolsProfile::Debug,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "record",
                "start",
                "--interval-ms",
                "500",
                "--max-frames",
                "5"
            ]
        );

        let args =
            tool_command_args("pire_browser_record_status", &json!({}), McpToolsProfile::Debug)
                .unwrap();
        assert_eq!(args, vec!["--json", "record", "status"]);

        let args = tool_command_args(
            "pire_browser_record_stop",
            &json!({ "outputDir": "recording" }),
            McpToolsProfile::Debug,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "record", "stop", "recording"]);

        let args = tool_command_args(
            "pire_browser_react_tree",
            &json!({ "selector": "#root", "depth": 3 }),
            McpToolsProfile::React,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "react", "tree", "--selector", "#root", "--depth", "3"]
        );

        let args = tool_command_args(
            "pire_browser_react_inspect",
            &json!({ "target": "r1" }),
            McpToolsProfile::React,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "react", "inspect", "r1"]);

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
            "pire_browser_device",
            &json!({ "name": "iPhone 14" }),
            McpToolsProfile::Mobile,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "device", "iPhone 14"]);

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
            "pire_browser_cookies_set",
            &json!({ "curl": "Cookie: sid=secret", "domain": "localhost" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "cookies",
                "set",
                "--curl",
                "Cookie: sid=secret",
                "--domain",
                "localhost"
            ]
        );

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

        let args =
            tool_command_args("pire_browser_tab_list", &json!({}), McpToolsProfile::Core).unwrap();
        assert_eq!(args, vec!["--json", "tab", "list"]);

        let args = tool_command_args(
            "pire_browser_tabs_select",
            &json!({ "target": "docs" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "tabs", "select", "docs"]);

        let args = tool_command_args(
            "pire_browser_tab_switch",
            &json!({ "tab": "docs" }),
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
            "pire_browser_tab_close",
            &json!({ "tab": "t2" }),
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

        let args = tool_command_args(
            "pire_browser_frame_switch",
            &json!({ "frame": "@e3" }),
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

        let args =
            tool_command_args("pire_browser_back", &json!({}), McpToolsProfile::Core).unwrap();
        assert_eq!(args, vec!["--json", "back"]);

        let args =
            tool_command_args("pire_browser_forward", &json!({}), McpToolsProfile::Core).unwrap();
        assert_eq!(args, vec!["--json", "forward"]);

        let args =
            tool_command_args("pire_browser_reload", &json!({}), McpToolsProfile::Core).unwrap();
        assert_eq!(args, vec!["--json", "reload"]);

        let args = tool_command_args(
            "pire_browser_pushstate",
            &json!({ "url": "/dashboard" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "pushstate", "/dashboard"]);

        let args = tool_command_args(
            "pire_browser_add_init_script",
            &json!({ "script": "window.__flag = true" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec!["--json", "addinitscript", "window.__flag = true"]
        );

        let args = tool_command_args(
            "pire_browser_remove_init_script",
            &json!({ "identifier": "init1" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "removeinitscript", "init1"]);

        let args = tool_command_args(
            "pire_browser_doctor",
            &json!({ "fix": true, "firefoxPath": "C:/Firefox/firefox.exe" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "--json",
                "doctor",
                "--fix",
                "--firefox-path",
                "C:/Firefox/firefox.exe"
            ]
        );

        let args = tool_command_args(
            "pire_browser_activity_list",
            &json!({ "limit": 5 }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "activity", "list", "--limit", "5"]);

        let args = tool_command_args(
            "pire_browser_confirm",
            &json!({ "confirmationId": "c_1234abcd" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "confirm", "c_1234abcd"]);

        let args = tool_command_args(
            "pire_browser_deny",
            &json!({ "confirmationId": "c_1234abcd" }),
            McpToolsProfile::Core,
        )
        .unwrap();
        assert_eq!(args, vec!["--json", "deny", "c_1234abcd"]);
    }

    #[test]
    fn rejects_invalid_tool_arguments() {
        let error =
            tool_command_args("pire_browser_click", &json!({}), McpToolsProfile::Core).unwrap_err();
        assert!(error.contains("selector is required"));

        let error =
            tool_command_args("pire_browser_tap", &json!({}), McpToolsProfile::Core).unwrap_err();
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
            "pire_browser_wait",
            &json!({ "function": "window.ready", "url": "**/ready" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("only one wait condition"));

        let error = tool_command_args(
            "pire_browser_wait_ms",
            &json!({ "milliseconds": 250 }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("ms is required"));

        let error = tool_command_args(
            "pire_browser_wait_for_load",
            &json!({ "state": "interactive" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("state must be load"));

        let error = tool_command_args(
            "pire_browser_wait_for_text",
            &json!({ "text": "Ready", "waitTimeoutMs": 0 }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("waitTimeoutMs must be at least 1"));

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
            "pire_browser_swipe",
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

        let error = tool_command_args(
            "pire_browser_get_attr",
            &json!({ "selector": "@e2", "attribute": "href" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("name is required"));

        let error = tool_command_args("pire_browser_is_visible", &json!({}), McpToolsProfile::Core)
            .unwrap_err();
        assert!(error.contains("selector is required"));

        let error = tool_command_args(
            "pire_browser_clipboard_write",
            &json!({}),
            McpToolsProfile::State,
        )
        .unwrap_err();
        assert!(error.contains("text is required"));

        let error = tool_command_args(
            "pire_browser_activity_list",
            &json!({ "limit": 0 }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("limit must be a positive integer"));

        let error = tool_command_args(
            "pire_browser_open",
            &json!({ "allowedDomains": "example.com", "noAllowedDomains": true }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("cannot use allowedDomains and noAllowedDomains together"));

        let error = tool_command_args(
            "pire_browser_launch",
            &json!({ "statePath": ".pire-state/app.json" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("statePath is not supported by pire_browser_launch"));

        let error = tool_command_args(
            "pire_browser_launch",
            &json!({ "sessionName": "qa" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("sessionName is not supported by pire_browser_launch"));

        let error = tool_command_args(
            "pire_browser_launch",
            &json!({ "proxy": "http://proxy.example:8080" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("proxy is not supported by pire_browser_launch"));

        let error = tool_command_args(
            "pire_browser_launch",
            &json!({ "executablePath": "C:/Firefox/firefox.exe" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("executablePath is not supported by pire_browser_launch"));

        let error = tool_command_args(
            "pire_browser_launch",
            &json!({ "allowedDomains": "example.com", "noAllowedDomains": true }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("cannot use allowedDomains and noAllowedDomains together"));

        let error = tool_command_args(
            "pire_browser_batch",
            &json!({ "commands": [] }),
            McpToolsProfile::Debug,
        )
        .unwrap_err();
        assert!(error.contains("commands must contain at least one command"));

        let error = tool_command_args("pire_browser_batch", &json!({}), McpToolsProfile::Debug)
            .unwrap_err();
        assert!(error.contains("commands is required"));

        let error = tool_command_args(
            "pire_browser_batch",
            &json!({ "commands": "snapshot -i" }),
            McpToolsProfile::Debug,
        )
        .unwrap_err();
        assert!(error.contains("commands must be an array"));

        let error = tool_command_args(
            "pire_browser_batch",
            &json!({ "commands": [[]] }),
            McpToolsProfile::Debug,
        )
        .unwrap_err();
        assert!(error.contains("commands[0] cannot be empty"));

        let error = tool_command_args(
            "pire_browser_batch",
            &json!({ "commands": [["open", 1]] }),
            McpToolsProfile::Debug,
        )
        .unwrap_err();
        assert!(error.contains("commands[0] entries must be strings"));

        let error = tool_command_args(
            "pire_browser_batch",
            &json!({ "commands": [["open", ""]] }),
            McpToolsProfile::Debug,
        )
        .unwrap_err();
        assert!(error.contains("commands[0] entries cannot be empty"));

        let error = tool_command_args(
            "pire_browser_batch",
            &json!({ "commands": [""] }),
            McpToolsProfile::Debug,
        )
        .unwrap_err();
        assert!(error.contains("commands[0] cannot be empty"));

        let error = tool_command_args(
            "pire_browser_batch",
            &json!({ "commands": ["snapshot -i"], "extraArgs": ["get url"] }),
            McpToolsProfile::Debug,
        )
        .unwrap_err();
        assert!(error.contains("extraArgs is not supported by pire_browser_batch"));

        let error = tool_command_args(
            "pire_browser_install",
            &json!({ "sessionName": "qa" }),
            McpToolsProfile::Debug,
        )
        .unwrap_err();
        assert!(error.contains("sessionName is not supported by pire_browser_install"));

        let error = tool_command_args(
            "pire_browser_install",
            &json!({ "extraArgs": ["--windows"] }),
            McpToolsProfile::Debug,
        )
        .unwrap_err();
        assert!(error.contains("extraArgs is not supported by pire_browser_install"));

        let error = tool_command_args(
            "pire_browser_upgrade",
            &json!({ "extraArgs": ["--force"] }),
            McpToolsProfile::Debug,
        )
        .unwrap_err();
        assert!(error.contains("extraArgs is not supported by pire_browser_upgrade"));

        let error = tool_command_args(
            "pire_browser_upgrade",
            &json!({ "sessionName": "qa" }),
            McpToolsProfile::Debug,
        )
        .unwrap_err();
        assert!(error.contains("sessionName is not supported by pire_browser_upgrade"));

        let error = tool_command_args(
            "pire_browser_doctor",
            &json!({ "firefoxPath": "C:/Firefox/firefox.exe" }),
            McpToolsProfile::Core,
        )
        .unwrap_err();
        assert!(error.contains("firefoxPath requires fix=true"));
    }

    #[test]
    fn detects_only_exact_launcher_upgrade_args() {
        assert!(is_launcher_command_args(&s(&["--json", "upgrade"])));
        assert!(is_launcher_command_args(&s(&["upgrade"])));
        assert_eq!(
            launcher_args(&s(&["--json", "upgrade"])),
            s(&["upgrade", "--json"])
        );
        assert_eq!(launcher_args(&s(&["upgrade"])), s(&["upgrade"]));
        assert!(!is_launcher_command_args(&s(&[
            "--json", "batch", "upgrade"
        ])));
        assert!(!is_launcher_command_args(&s(&[
            "--json",
            "--session-name",
            "qa",
            "batch",
            "upgrade"
        ])));
    }

    #[test]
    fn validates_tools_profile() {
        assert_eq!(
            McpToolsProfile::parse("core").unwrap(),
            McpToolsProfile::Core
        );
        assert_eq!(McpToolsProfile::parse("all").unwrap(), McpToolsProfile::All);
        assert_eq!(
            McpToolsProfile::parse("core,network").unwrap(),
            McpToolsProfile::Combined(PROFILE_CORE | PROFILE_NETWORK)
        );
        assert_eq!(
            McpToolsProfile::parse("mobile").unwrap(),
            McpToolsProfile::Mobile
        );
        assert_eq!(
            McpToolsProfile::parse("react").unwrap(),
            McpToolsProfile::React
        );
        assert!(McpToolsProfile::parse("browserless").is_err());
    }
}
