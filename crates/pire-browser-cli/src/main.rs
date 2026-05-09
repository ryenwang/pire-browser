use anyhow::{bail, Context, Result};
use pire_browser_core::cli::{
    build_command_request, format_cli_result, parse_cli_args, GlobalFlagWarning, LocalCommand,
};
use pire_browser_core::install_status::{
    collect_install_status, install_status_json, install_status_text,
};
use pire_browser_core::ipc::send_pipe_request;
use pire_browser_core::launch::{launch_firefox, launch_result_text, LaunchOptions};
use pire_browser_core::protocol::{RpcRequest, RpcResponse};
use pire_browser_core::session::{
    cleanup_stale_sessions, list_sessions, now_ms, select_session, session_status_text,
};
use pire_browser_core::setup::{setup_result_text, setup_windows};
use serde_json::{json, Value};
use std::collections::BTreeSet;
use uuid::Uuid;

const UNSUPPORTED_ROOTS_JSON: &str =
    include_str!("../../../docs/agent-browser-unsupported-roots.json");

fn main() {
    if let Err(err) = run() {
        eprintln!("{err:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match parse_cli_args(&args)? {
        LocalCommand::Setup {
            windows,
            firefox_path,
        } => {
            if !windows {
                bail!("setup currently supports `pire-browser setup --windows` only");
            }
            let result = setup_windows(firefox_path)?;
            println!("{}", setup_result_text(&result));
        }
        LocalCommand::Status => {
            cleanup_stale_sessions(now_ms())?;
            let sessions = list_sessions()?;
            println!("{}", session_status_text(&sessions));
        }
        LocalCommand::Launch {
            profile,
            url,
            firefox_path,
        } => {
            let result = launch_firefox(LaunchOptions {
                profile,
                url,
                firefox_path,
            })?;
            println!("{}", launch_result_text(&result));
        }
        LocalCommand::InstallStatus { json } => {
            let report = collect_install_status()?;
            if json {
                let value: serde_json::Value =
                    serde_json::from_str(&install_status_json(&report)?)?;
                println!("{}", format_cli_result(&value, true)?);
            } else {
                println!("{}", install_status_text(&report));
            }
        }
        LocalCommand::Remote {
            session,
            json,
            ignored_global_flags,
            args,
        } => {
            if let Some(result) = local_not_available_result(&args, json, &ignored_global_flags)? {
                println!("{result}");
                std::process::exit(exit_code_for_error("NotAvailableError"));
            }
            let request = build_command_request(args.clone());
            let response = match send_to_session(session.as_deref(), &request) {
                Ok(response) => response,
                Err(err) if should_auto_launch_remote(session.as_deref(), &args, &err) => {
                    cleanup_stale_sessions(now_ms())?;
                    let result = launch_firefox(LaunchOptions {
                        profile: "Default".to_string(),
                        url: launch_url_for_remote_args(&args),
                        firefox_path: None,
                    })?;
                    eprintln!("{}", launch_result_text(&result));
                    send_to_session(None, &request)?
                }
                Err(err) => return Err(err),
            };
            if !response.ok {
                let error = response
                    .error
                    .unwrap_or(pire_browser_core::protocol::RpcError {
                        code: "unknown_error".into(),
                        message: "unknown extension error".into(),
                        data: None,
                    });
                if json {
                    let exit_code = exit_code_for_error(&error.code);
                    let warnings = ignored_global_flag_warnings(&ignored_global_flags);
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&json!({
                            "success": false,
                            "error": {
                                "code": error.code,
                                "message": error.message,
                                "data": error.data
                            },
                            "warnings": warnings
                        }))?
                    );
                    std::process::exit(exit_code);
                }
                let err = format!("{}: {}", error.code, error.message);
                eprintln!("{err}");
                std::process::exit(exit_code_for_error(&error.code));
            }
            let mut result = response.result.unwrap_or_else(|| json!({ "text": "ok" }));
            append_ignored_global_flag_warnings(&mut result, &ignored_global_flags);
            println!("{}", format_cli_result(&result, json)?);
        }
    }
    Ok(())
}

fn local_not_available_result(
    args: &[String],
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
) -> Result<Option<String>> {
    let Some(command) = args.first().map(String::as_str) else {
        return Ok(None);
    };
    if !is_documented_not_available_command(command)? {
        return Ok(None);
    }
    let message = format!(
        "This documented agent-browser command is parsed by pire-browser but is not implemented on the Firefox WebExtension backend yet: {command}"
    );
    if json_output {
        let warnings = ignored_global_flag_warnings(ignored_global_flags);
        return Ok(Some(serde_json::to_string_pretty(&json!({
            "success": false,
            "error": {
                "code": "NotAvailableError",
                "message": message,
                "data": {
                    "feature": command,
                    "compatibility": "not_available"
                }
            },
            "warnings": warnings
        }))?));
    }
    Ok(Some(format!("NotAvailableError: {message}")))
}

fn append_ignored_global_flag_warnings(
    result: &mut Value,
    ignored_global_flags: &[GlobalFlagWarning],
) {
    let warnings = ignored_global_flag_warnings(ignored_global_flags);
    if warnings.is_empty() {
        return;
    }
    if !result.is_object() {
        *result = json!({
            "text": result.to_string(),
            "warnings": warnings
        });
        return;
    }
    let existing = result.get_mut("warnings").and_then(Value::as_array_mut);
    if let Some(existing) = existing {
        existing.extend(warnings);
    } else if let Some(object) = result.as_object_mut() {
        object.insert("warnings".to_string(), Value::Array(warnings));
    }
}

fn ignored_global_flag_warnings(ignored_global_flags: &[GlobalFlagWarning]) -> Vec<Value> {
    ignored_global_flags
        .iter()
        .map(|warning| {
            json!({
                "code": "IGNORED_GLOBAL_FLAG",
                "feature": warning.flag,
                "message": format!("{} is accepted for agent-browser CLI compatibility but is not applied to the current Firefox WebExtension session.", warning.flag)
            })
        })
        .collect()
}

fn is_documented_not_available_command(command: &str) -> Result<bool> {
    Ok(unsupported_roots_from_json(UNSUPPORTED_ROOTS_JSON)?.contains(command))
}

fn unsupported_roots_from_json(json_text: &str) -> Result<BTreeSet<String>> {
    let value: Value = serde_json::from_str(json_text).context("invalid unsupported roots json")?;
    let roots = value
        .get("unsupportedRoots")
        .and_then(Value::as_array)
        .context("unsupported roots json must contain unsupportedRoots array")?;
    roots
        .iter()
        .map(|root| {
            root.as_str()
                .map(ToString::to_string)
                .context("unsupportedRoots entries must be strings")
        })
        .collect()
}

fn exit_code_for_error(code: &str) -> i32 {
    match code {
        "TimeoutError" | "timeout" => 124,
        "ElementNotFound" | "not_found" | "ref_stale" | "ambiguous_locator" | "not_enabled" => 44,
        "InvalidArgumentError" | "invalid_args" => 2,
        "NotAvailableError" => 78,
        _ => 1,
    }
}

fn send_to_session(session_id: Option<&str>, request: &RpcRequest) -> Result<RpcResponse> {
    let session = select_session(session_id)?;
    let line = serde_json::to_string(request)?;
    let response = send_pipe_request(&session.pipe_name, &line)
        .with_context(|| format!("failed talking to session {}", session.session_id))?;
    Ok(serde_json::from_str(&response)?)
}

fn can_auto_launch_for_remote_args(args: &[String]) -> bool {
    matches!(
        args.first().map(String::as_str),
        Some(
            "open"
                | "goto"
                | "navigate"
                | "snapshot"
                | "find"
                | "click"
                | "dblclick"
                | "fill"
                | "type"
                | "press"
                | "key"
                | "keyboard"
                | "keydown"
                | "keyup"
                | "hover"
                | "focus"
                | "select"
                | "check"
                | "uncheck"
                | "scroll"
                | "scrollintoview"
                | "wait"
                | "screenshot"
                | "get"
                | "is"
                | "eval"
                | "tab"
                | "tabs"
                | "back"
                | "forward"
                | "reload"
                | "window"
                | "frame"
                | "dialog"
                | "batch"
                | "cookies"
                | "storage"
        )
    )
}

fn launch_url_for_remote_args(args: &[String]) -> Option<String> {
    if args.iter().any(|arg| arg == "--new") {
        return None;
    }
    match args.first().map(String::as_str) {
        Some("open" | "goto" | "navigate") => first_positional_arg(&args[1..], &["--label"]),
        _ => None,
    }
}

fn first_positional_arg(args: &[String], value_flags: &[&str]) -> Option<String> {
    let mut skip_next = false;
    for arg in args {
        if skip_next {
            skip_next = false;
            continue;
        }
        if value_flags.contains(&arg.as_str()) {
            skip_next = true;
            continue;
        }
        if arg.starts_with("--") {
            continue;
        }
        return Some(arg.clone());
    }
    None
}

fn should_auto_launch_remote(session: Option<&str>, args: &[String], err: &anyhow::Error) -> bool {
    session.is_none()
        && can_auto_launch_for_remote_args(args)
        && is_auto_launchable_session_error(err)
}

fn is_auto_launchable_session_error(err: &anyhow::Error) -> bool {
    let details = format!("{err:#}");
    details.contains("extension_disconnected: no live Firefox extension session found")
        || (details.contains("failed talking to session")
            && (details.contains("The system cannot find the file specified")
                || details.contains("os error 2")))
}

#[allow(dead_code)]
fn host_status_request() -> RpcRequest {
    RpcRequest {
        id: Uuid::new_v4().to_string(),
        method: "host_status".into(),
        params: json!({}),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(values: &[&str]) -> Vec<String> {
        values.iter().map(|v| v.to_string()).collect()
    }

    #[test]
    fn auto_launches_for_browser_control_commands() {
        assert!(can_auto_launch_for_remote_args(&s(&[
            "open",
            "https://example.com"
        ])));
        assert!(can_auto_launch_for_remote_args(&s(&[
            "goto",
            "https://example.com"
        ])));
        assert!(can_auto_launch_for_remote_args(&s(&[
            "navigate",
            "https://example.com"
        ])));
        assert!(can_auto_launch_for_remote_args(&s(&["snapshot", "-i"])));
        assert!(can_auto_launch_for_remote_args(&s(&["tabs", "list"])));
        assert!(!can_auto_launch_for_remote_args(&s(&["close"])));
        assert!(!can_auto_launch_for_remote_args(&s(&["unknown"])));
    }

    #[test]
    fn formats_documented_not_available_text() {
        let result = local_not_available_result(&s(&["stream", "status"]), false, &[])
            .unwrap()
            .unwrap();
        assert!(result.contains("NotAvailableError"));
        assert!(result.contains("not implemented"));
    }

    #[test]
    fn loads_documented_not_available_roots_from_artifact() {
        let roots = unsupported_roots_from_json(UNSUPPORTED_ROOTS_JSON).unwrap();
        assert!(roots.contains("stream"));
        assert!(roots.contains("download"));
        assert!(!roots.contains("open"));
        assert!(!roots.contains("click"));
    }

    #[test]
    fn every_generated_unsupported_root_returns_not_available() {
        for root in unsupported_roots_from_json(UNSUPPORTED_ROOTS_JSON).unwrap() {
            let result = local_not_available_result(&s(&[root.as_str()]), false, &[])
                .unwrap()
                .unwrap();
            assert!(result.contains("NotAvailableError"), "{root}");
            assert_eq!(exit_code_for_error("NotAvailableError"), 78);
        }
    }

    #[test]
    fn supported_roots_are_not_marked_not_available() {
        for root in [
            "open", "goto", "navigate", "click", "fill", "snapshot", "tab", "tabs", "find", "wait",
        ] {
            assert!(local_not_available_result(&s(&[root]), false, &[])
                .unwrap()
                .is_none());
        }
    }

    #[test]
    fn rejects_invalid_unsupported_roots_artifact() {
        assert!(unsupported_roots_from_json("{}").is_err());
        assert!(unsupported_roots_from_json(r#"{"unsupportedRoots":[42]}"#).is_err());
    }

    #[test]
    fn formats_documented_not_available_json() {
        let result = local_not_available_result(&s(&["download", "#link", "out.zip"]), true, &[])
            .unwrap()
            .unwrap();
        assert!(result.contains("\"success\": false"));
        assert!(result.contains("\"NotAvailableError\""));
        assert!(result.contains("\"compatibility\": \"not_available\""));
    }

    #[test]
    fn derives_launch_url_from_open_command() {
        assert_eq!(
            launch_url_for_remote_args(&s(&["open", "https://example.com", "--label", "docs"])),
            Some("https://example.com".to_string())
        );
        assert_eq!(
            launch_url_for_remote_args(&s(&["goto", "https://example.com"])),
            Some("https://example.com".to_string())
        );
        assert_eq!(
            launch_url_for_remote_args(&s(&["navigate", "--label", "docs", "https://example.com"])),
            Some("https://example.com".to_string())
        );
        assert_eq!(launch_url_for_remote_args(&s(&["snapshot"])), None);
        assert_eq!(launch_url_for_remote_args(&s(&["open"])), None);
        assert_eq!(launch_url_for_remote_args(&s(&["open", "--new"])), None);
        assert_eq!(
            launch_url_for_remote_args(&s(&["open", "--new", "https://example.com"])),
            None
        );
    }

    #[test]
    fn treats_missing_session_pipe_as_auto_launchable() {
        let err = anyhow::anyhow!(
            "failed talking to session abc: failed to connect to pire-browser pipe \\\\.\\pipe\\abc: The system cannot find the file specified. (os error 2)"
        );
        assert!(is_auto_launchable_session_error(&err));
        assert!(should_auto_launch_remote(
            None,
            &s(&["open", "https://example.com"]),
            &err
        ));
        assert!(!should_auto_launch_remote(
            Some("named"),
            &s(&["open", "https://example.com"]),
            &err
        ));
        assert!(!should_auto_launch_remote(None, &s(&["close"]), &err));
    }

    #[test]
    fn ignored_global_flags_are_reported_as_json_warnings() {
        let warnings = vec![
            GlobalFlagWarning {
                flag: "--headless".to_string(),
            },
            GlobalFlagWarning {
                flag: "--color-scheme".to_string(),
            },
        ];
        let mut result = json!({ "text": "ok" });
        append_ignored_global_flag_warnings(&mut result, &warnings);
        let formatted = format_cli_result(&result, true).unwrap();
        assert!(formatted.contains("\"IGNORED_GLOBAL_FLAG\""));
        assert!(formatted.contains("\"--headless\""));
        assert!(formatted.contains("\"--color-scheme\""));
    }
}
