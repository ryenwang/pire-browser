use anyhow::{bail, Result};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::protocol::RpcRequest;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LocalCommand {
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
    Status,
    Remote {
        session: Option<String>,
        json: bool,
        args: Vec<String>,
    },
}

pub fn parse_cli_args(raw: &[String]) -> Result<LocalCommand> {
    let mut args = raw.to_vec();
    let mut session = None;
    let mut json_output = false;

    while let Some(first) = args.first().cloned() {
        match first.as_str() {
            "--session" => {
                args.remove(0);
                let Some(value) = args.first().cloned() else {
                    bail!("--session requires a value");
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
        bail!("missing command; try `pire-browser status`");
    };

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

    if command == "install-status" {
        args.remove(0);
        while let Some(arg) = args.first() {
            match arg.as_str() {
                "--json" => {
                    args.remove(0);
                    json_output = true;
                }
                other => bail!("unsupported install-status option: {other}"),
            }
        }
        return Ok(LocalCommand::InstallStatus { json: json_output });
    }

    if command == "status" && session.is_none() {
        return Ok(LocalCommand::Status);
    }

    if let Some(index) = args.iter().position(|arg| arg == "--json") {
        args.remove(index);
        json_output = true;
    }

    Ok(LocalCommand::Remote {
        session,
        json: json_output,
        args,
    })
}

pub fn build_command_request(args: Vec<String>) -> RpcRequest {
    RpcRequest {
        id: Uuid::new_v4().to_string(),
        method: "command".to_string(),
        params: json!({ "args": args }),
    }
}

pub fn format_cli_result(value: &Value, json_output: bool) -> Result<String> {
    if json_output {
        return Ok(serde_json::to_string_pretty(value)?);
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
                args: s(&["snapshot"])
            }
        );
    }

    #[test]
    fn parses_install_status_json() {
        let parsed = parse_cli_args(&s(&["install-status", "--json"])).unwrap();
        assert_eq!(parsed, LocalCommand::InstallStatus { json: true });
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
