use anyhow::{bail, Result};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::protocol::RpcRequest;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GlobalFlagWarning {
    pub flag: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LocalCommand {
    Help {
        topic: Option<String>,
    },
    Setup {
        windows: bool,
        firefox_path: Option<String>,
    },
    Launch {
        profile: String,
        url: Option<String>,
        firefox_path: Option<String>,
    },
    InstallStatus {
        json: bool,
    },
    DoctorFix {
        json: bool,
    },
    Status {
        json: bool,
    },
    Remote {
        session: Option<String>,
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        args: Vec<String>,
    },
}

pub fn parse_cli_args(raw: &[String]) -> Result<LocalCommand> {
    if raw.is_empty() {
        return Ok(LocalCommand::Help { topic: None });
    }
    if raw.first().map(|arg| is_help_flag(arg)).unwrap_or(false) {
        return Ok(LocalCommand::Help { topic: None });
    }
    if raw.first().map(String::as_str) == Some("help") {
        return Ok(LocalCommand::Help {
            topic: raw.get(1).cloned(),
        });
    }

    let mut args = raw.to_vec();
    let mut session = None;
    let mut json_output = false;
    let mut ignored_global_flags = Vec::new();
    const GLOBAL_VALUE_FLAGS: &[&str] = &[
        "--session",
        "--session-name",
        "--profile",
        "--state",
        "--color-scheme",
        "--max-output",
        "--content-boundaries",
        "--allowed-domains",
        "--confirm-actions",
        "--action-policy",
        "--config",
        "--executable-path",
        "--engine",
        "--provider",
        "-p",
        "--model",
    ];
    const GLOBAL_BOOL_FLAGS: &[&str] = &[
        "--json",
        "--headed",
        "--headless",
        "--allow-file-access",
        "--auto-connect",
        "--confirm-interactive",
        "-q",
        "-v",
    ];

    while let Some(first) = args.first().cloned() {
        if GLOBAL_VALUE_FLAGS.contains(&first.as_str()) {
            let flag = args.remove(0);
            let Some(value) = args.first().cloned() else {
                bail!("{flag} requires a value");
            };
            args.remove(0);
            if flag == "--session" || flag == "--session-name" {
                session = Some(value);
            }
            if ignored_with_warning_global_flag(&flag) {
                ignored_global_flags.push(GlobalFlagWarning { flag });
            }
            continue;
        }
        if GLOBAL_BOOL_FLAGS.contains(&first.as_str()) {
            args.remove(0);
            if first == "--json" {
                json_output = true;
            }
            if ignored_with_warning_global_flag(&first) {
                ignored_global_flags.push(GlobalFlagWarning { flag: first });
            }
            continue;
        }
        match first.as_str() {
            "--session" | "--session-name" => {
                args.remove(0);
                let Some(value) = args.first().cloned() else {
                    bail!("{first} requires a value");
                };
                args.remove(0);
                session = Some(value);
            }
            "--json" => {
                args.remove(0);
                json_output = true;
            }
            _ => break,
        }
    }

    let Some(command) = args.first().cloned() else {
        return Ok(LocalCommand::Help { topic: None });
    };

    if command == "help" {
        return Ok(LocalCommand::Help {
            topic: args.get(1).cloned(),
        });
    }

    if args.iter().skip(1).any(|arg| is_help_flag(arg)) {
        return Ok(LocalCommand::Help {
            topic: Some(command),
        });
    }

    if command == "setup" {
        args.remove(0);
        let mut windows = false;
        let mut firefox_path = None;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--windows" => windows = true,
                "--firefox-path" => {
                    i += 1;
                    let Some(path) = args.get(i).cloned() else {
                        bail!("--firefox-path requires a path");
                    };
                    firefox_path = Some(path);
                }
                other => bail!("unsupported setup option: {other}"),
            }
            i += 1;
        }
        return Ok(LocalCommand::Setup {
            windows,
            firefox_path,
        });
    }

    if command == "launch" {
        args.remove(0);
        let mut profile = "Default".to_string();
        let mut url = None;
        let mut firefox_path = None;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--profile" => {
                    i += 1;
                    let Some(value) = args.get(i).cloned() else {
                        bail!("--profile requires a value");
                    };
                    profile = value;
                }
                "--url" => {
                    i += 1;
                    let Some(value) = args.get(i).cloned() else {
                        bail!("--url requires a value");
                    };
                    url = Some(value);
                }
                "--firefox-path" => {
                    i += 1;
                    let Some(path) = args.get(i).cloned() else {
                        bail!("--firefox-path requires a path");
                    };
                    firefox_path = Some(path);
                }
                other => bail!("unsupported launch option: {other}"),
            }
            i += 1;
        }
        return Ok(LocalCommand::Launch {
            profile,
            url,
            firefox_path,
        });
    }

    if command == "install-status" || command == "doctor" {
        let doctorish = command.clone();
        args.remove(0);
        let mut fix = false;
        while let Some(arg) = args.first() {
            match arg.as_str() {
                "--json" => {
                    args.remove(0);
                    json_output = true;
                }
                "--offline" | "--quick" => {
                    args.remove(0);
                }
                "--fix" => {
                    args.remove(0);
                    fix = true;
                }
                other => bail!("unsupported {doctorish} option: {other}"),
            }
        }
        if fix {
            return Ok(LocalCommand::DoctorFix { json: json_output });
        }
        return Ok(LocalCommand::InstallStatus { json: json_output });
    }

    if command == "status" && session.is_none() {
        args.remove(0);
        while let Some(arg) = args.first() {
            match arg.as_str() {
                "--json" => {
                    args.remove(0);
                    json_output = true;
                }
                other => bail!("unsupported status option: {other}"),
            }
        }
        return Ok(LocalCommand::Status { json: json_output });
    }

    if let Some(index) = args.iter().position(|arg| arg == "--json") {
        args.remove(index);
        json_output = true;
    }

    Ok(LocalCommand::Remote {
        session,
        json: json_output,
        ignored_global_flags,
        args,
    })
}

fn is_help_flag(arg: &str) -> bool {
    arg == "--help" || arg == "-h"
}

fn ignored_with_warning_global_flag(flag: &str) -> bool {
    matches!(flag, "--headed" | "--headless" | "--color-scheme")
}

pub fn help_text(topic: Option<&str>) -> Option<String> {
    let text = match topic.unwrap_or("").to_ascii_lowercase().as_str() {
        "" => TOP_LEVEL_HELP,
        "status" => STATUS_HELP,
        "doctor" | "install-status" => DOCTOR_HELP,
        "open" | "goto" | "navigate" => OPEN_HELP,
        "snapshot" => SNAPSHOT_HELP,
        "find" => FIND_HELP,
        "click" => CLICK_HELP,
        "fill" => FILL_HELP,
        "wait" => WAIT_HELP,
        "screenshot" => SCREENSHOT_HELP,
        "tabs" | "tab" => TABS_HELP,
        "setup" => SETUP_HELP,
        "launch" => LAUNCH_HELP,
        _ => return None,
    };
    Some(text.trim().to_string())
}

const TOP_LEVEL_HELP: &str = r##"
pire-browser controls the user's Firefox browser through a local WebExtension.

Usage:
  pire-browser <command> [args]
  pire-browser help [topic]
  pire-browser <command> --help

Common commands:
  status [--json]                 Show live Firefox sessions and default target
  doctor [--json] [--offline]     Check setup health and PATH/install hints
  open <url> [--label <name>]      Open a URL, auto-launching Firefox if needed
  snapshot -i                     Inspect the active page and print refs
  click '@e4'                     Click a ref from snapshot/find output
  fill '@e2' "text"               Fill a ref from snapshot/find output
  find label "Email" fill "x@y"   Find by semantic locator and act
  wait --selector "#done"         Wait for page state
  screenshot out.png              Capture the visible viewport
  tabs list                       List tracked tabs

PowerShell note:
  Quote refs such as '@e4' so PowerShell does not treat @ as syntax.
"##;

const STATUS_HELP: &str = r##"
Usage:
  pire-browser status [--json]

Shows live Firefox extension sessions, the session default commands will target,
and the active page when Firefox has reported one.
"##;

const DOCTOR_HELP: &str = r##"
Usage:
  pire-browser doctor [--json] [--offline] [--quick]
  pire-browser install-status [--json]

Checks Firefox discovery, native messaging setup, extension build files, managed
profile state, live sessions, and CLI/PATH advisories. --offline and --quick are
accepted as no-op compatibility flags. --fix is not implemented yet.
"##;

const OPEN_HELP: &str = r##"
Usage:
  pire-browser open <url> [--label <name>] [--new]
  pire-browser goto <url>
  pire-browser navigate <url>

Opens a page in the default session, auto-launching managed Firefox when needed.
"##;

const SNAPSHOT_HELP: &str = r##"
Usage:
  pire-browser snapshot -i
  pire-browser snapshot --json

Prints a compact page snapshot with refs such as @e1. Use quoted refs in
PowerShell, for example: pire-browser click '@e1'.
"##;

const FIND_HELP: &str = r##"
Usage:
  pire-browser find role button --name "Submit"
  pire-browser find label "Email" fill "hello@example.com"
  pire-browser find text "Continue" click

Finds elements by supported selector families and can optionally perform an
action on the single match.
"##;

const CLICK_HELP: &str = r##"
Usage:
  pire-browser click '@e4'
  pire-browser click "#submit"

Clicks a ref or selector. If a ref is stale, rerun snapshot -i or find.
"##;

const FILL_HELP: &str = r##"
Usage:
  pire-browser fill '@e2' "hello"
  pire-browser fill "input[name=email]" "hello@example.com"

Fills a ref or selector. Quote refs in PowerShell, for example '@e2'.
"##;

const WAIT_HELP: &str = r##"
Usage:
  pire-browser wait 1000
  pire-browser wait --selector "#done" --timeout 5000
  pire-browser wait --text "Saved"
  pire-browser wait --url "**/dashboard"
"##;

const SCREENSHOT_HELP: &str = r##"
Usage:
  pire-browser screenshot out.png
  pire-browser screenshot --screenshot-dir screenshots out.png

Captures the visible viewport of the active Firefox tab.
"##;

const TABS_HELP: &str = r##"
Usage:
  pire-browser tabs list
  pire-browser tabs new <url> [--label <name>]
  pire-browser tabs select <tN-or-label>
  pire-browser tabs close <tN-or-label>
  pire-browser tabs label <tN> <label>
"##;

const SETUP_HELP: &str = r##"
Usage:
  pire-browser setup --windows [--firefox-path <path>]

Registers the Firefox Native Messaging host for the current Windows user.
"##;

const LAUNCH_HELP: &str = r##"
Usage:
  pire-browser launch [--profile Default] [--url <url>] [--firefox-path <path>]

Starts the managed Firefox profile and waits for the extension to connect.
"##;

pub fn build_command_request(args: Vec<String>) -> RpcRequest {
    RpcRequest {
        id: Uuid::new_v4().to_string(),
        method: "command".to_string(),
        params: json!({ "args": args }),
    }
}

pub fn format_cli_result(value: &Value, json_output: bool) -> Result<String> {
    if json_output {
        let warnings = value
            .get("warnings")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new()));
        return Ok(serde_json::to_string_pretty(&json!({
            "success": true,
            "data": value,
            "warnings": warnings
        }))?);
    }

    if let Some(text) = value.get("text").and_then(|v| v.as_str()) {
        return Ok(text.to_string());
    }

    Ok(serde_json::to_string_pretty(value)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(values: &[&str]) -> Vec<String> {
        values.iter().map(|v| v.to_string()).collect()
    }

    #[test]
    fn parses_setup() {
        let parsed = parse_cli_args(&s(&[
            "setup",
            "--windows",
            "--firefox-path",
            "C:/Firefox/firefox.exe",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Setup {
                windows: true,
                firefox_path: Some("C:/Firefox/firefox.exe".to_string())
            }
        );
    }

    #[test]
    fn parses_empty_args_as_help() {
        assert_eq!(
            parse_cli_args(&[]).unwrap(),
            LocalCommand::Help { topic: None }
        );
        assert_eq!(
            parse_cli_args(&s(&["--help"])).unwrap(),
            LocalCommand::Help { topic: None }
        );
        assert_eq!(
            parse_cli_args(&s(&["help", "status"])).unwrap(),
            LocalCommand::Help {
                topic: Some("status".to_string())
            }
        );
    }

    #[test]
    fn parses_command_help() {
        assert_eq!(
            parse_cli_args(&s(&["open", "--help"])).unwrap(),
            LocalCommand::Help {
                topic: Some("open".to_string())
            }
        );
    }

    #[test]
    fn parses_remote_command_with_session() {
        let parsed = parse_cli_args(&s(&[
            "--session",
            "abc",
            "find",
            "label",
            "Email",
            "fill",
            "x",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                session: Some("abc".to_string()),
                json: false,
                ignored_global_flags: vec![],
                args: s(&["find", "label", "Email", "fill", "x"])
            }
        );
    }

    #[test]
    fn accepts_json_after_command() {
        let parsed = parse_cli_args(&s(&["snapshot", "--json"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                session: None,
                json: true,
                ignored_global_flags: vec![],
                args: s(&["snapshot"])
            }
        );
    }

    #[test]
    fn accepts_agent_browser_global_flags_before_command() {
        let parsed = parse_cli_args(&s(&[
            "--session-name",
            "lemonade",
            "--headed",
            "--color-scheme",
            "dark",
            "snapshot",
            "-i",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                session: Some("lemonade".to_string()),
                json: true,
                ignored_global_flags: vec![
                    GlobalFlagWarning {
                        flag: "--headed".to_string()
                    },
                    GlobalFlagWarning {
                        flag: "--color-scheme".to_string()
                    }
                ],
                args: s(&["snapshot", "-i"])
            }
        );
    }

    #[test]
    fn records_ignored_global_flags_that_need_json_warnings() {
        let parsed = parse_cli_args(&s(&[
            "--headless",
            "--color-scheme",
            "dark",
            "--max-output",
            "1000",
            "get",
            "title",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                session: None,
                json: true,
                ignored_global_flags: vec![
                    GlobalFlagWarning {
                        flag: "--headless".to_string()
                    },
                    GlobalFlagWarning {
                        flag: "--color-scheme".to_string()
                    }
                ],
                args: s(&["get", "title"])
            }
        );
    }

    #[test]
    fn formats_json_success_envelope() {
        let value = json!({ "text": "ok", "warnings": [{"code": "BEST_EFFORT_FIREFOX_GAP"}] });
        let formatted = format_cli_result(&value, true).unwrap();
        assert!(formatted.contains("\"success\": true"));
        assert!(formatted.contains("\"data\""));
        assert!(formatted.contains("\"warnings\""));
    }

    #[test]
    fn parses_install_status_json() {
        let parsed = parse_cli_args(&s(&["install-status", "--json"])).unwrap();
        assert_eq!(parsed, LocalCommand::InstallStatus { json: true });
    }

    #[test]
    fn parses_doctor_as_install_status() {
        let parsed = parse_cli_args(&s(&["doctor", "--json"])).unwrap();
        assert_eq!(parsed, LocalCommand::InstallStatus { json: true });
    }

    #[test]
    fn parses_status_json() {
        let parsed = parse_cli_args(&s(&["status", "--json"])).unwrap();
        assert_eq!(parsed, LocalCommand::Status { json: true });
        let parsed = parse_cli_args(&s(&["--json", "status"])).unwrap();
        assert_eq!(parsed, LocalCommand::Status { json: true });
    }

    #[test]
    fn parses_doctor_noop_flags_and_fix() {
        let parsed = parse_cli_args(&s(&["doctor", "--offline", "--quick", "--json"])).unwrap();
        assert_eq!(parsed, LocalCommand::InstallStatus { json: true });
        let parsed = parse_cli_args(&s(&["doctor", "--fix", "--json"])).unwrap();
        assert_eq!(parsed, LocalCommand::DoctorFix { json: true });
    }

    #[test]
    fn help_text_includes_ref_quoting_guidance() {
        let text = help_text(None).unwrap();
        assert!(text.contains("click '@e4'"));
        assert!(help_text(Some("status")).unwrap().contains("status"));
        assert!(help_text(Some("unknown")).is_none());
    }

    #[test]
    fn parses_launch_with_defaults() {
        let parsed = parse_cli_args(&s(&["launch"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Launch {
                profile: "Default".to_string(),
                url: None,
                firefox_path: None
            }
        );
    }

    #[test]
    fn parses_launch_options() {
        let parsed = parse_cli_args(&s(&[
            "launch",
            "--profile",
            "Default",
            "--url",
            "https://discord.com/login",
            "--firefox-path",
            "C:/Firefox/firefox.exe",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Launch {
                profile: "Default".to_string(),
                url: Some("https://discord.com/login".to_string()),
                firefox_path: Some("C:/Firefox/firefox.exe".to_string())
            }
        );
    }

    #[test]
    fn rejects_unsupported_launch_option() {
        let err = parse_cli_args(&s(&["launch", "--bad"])).unwrap_err();
        assert!(err.to_string().contains("unsupported launch option"));
    }
}
