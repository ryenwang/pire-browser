use std::env;
use std::fs;
use std::path::PathBuf;

use anyhow::Result;
use serde::Serialize;
use serde_json::Value;

use crate::firefox::discover_firefox;
use crate::launch::{default_profile_status, firefox_startup_policy_status, DEFAULT_PROFILE_NAME};
use crate::protocol::{EXTENSION_ID, NATIVE_HOST_NAME};
use crate::session::{cleanup_stale_sessions, list_sessions, now_ms, SessionInfo};
use crate::setup::{native_manifest_path, sibling_host_path};

#[cfg(windows)]
use winreg::enums::HKEY_CURRENT_USER;
#[cfg(windows)]
use winreg::RegKey;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallStatusReport {
    pub ok: bool,
    pub firefox_path: Option<PathBuf>,
    pub cli_executable: CheckStatus,
    pub cli_on_path: CheckStatus,
    pub native_host: CheckStatus,
    pub native_manifest: CheckStatus,
    pub native_registry: CheckStatus,
    pub extension_source: CheckStatus,
    pub extension_build: CheckStatus,
    pub default_profile: CheckStatus,
    pub default_profile_launcher: CheckStatus,
    pub firefox_startup_policy: CheckStatus,
    pub live_sessions: Vec<SessionInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckStatus {
    pub ok: bool,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl CheckStatus {
    fn ok(label: impl Into<String>, path: Option<PathBuf>, message: Option<String>) -> Self {
        Self {
            ok: true,
            label: label.into(),
            path,
            message,
        }
    }

    fn fail(label: impl Into<String>, path: Option<PathBuf>, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            label: label.into(),
            path,
            message: Some(message.into()),
        }
    }
}

pub fn collect_install_status() -> Result<InstallStatusReport> {
    let firefox_path = discover_firefox(None);
    let cli_executable = check_cli_executable();
    let cli_on_path = check_cli_on_path();
    let native_host = check_native_host();
    let native_manifest = check_native_manifest();
    let native_registry = check_native_registry();
    let extension_source = check_extension_source();
    let extension_build = check_extension_build();
    let (default_profile, default_profile_launcher) = check_default_profile();
    let firefox_startup_policy = check_firefox_startup_policy();

    cleanup_stale_sessions(now_ms())?;
    let live_sessions = list_sessions()?;

    let ok = firefox_path.is_some()
        && native_host.ok
        && native_manifest.ok
        && native_registry.ok
        && extension_source.ok
        && extension_build.ok;

    Ok(InstallStatusReport {
        ok,
        firefox_path,
        cli_executable,
        cli_on_path,
        native_host,
        native_manifest,
        native_registry,
        extension_source,
        extension_build,
        default_profile,
        default_profile_launcher,
        firefox_startup_policy,
        live_sessions,
    })
}

pub fn install_status_text(report: &InstallStatusReport) -> String {
    let mut lines = Vec::new();
    lines.push(format!(
        "pire-browser install status: {}",
        if report.ok { "ok" } else { "needs attention" }
    ));
    lines.push(format_check(
        "Firefox",
        report
            .firefox_path
            .as_ref()
            .map(|p| p.display().to_string()),
        report.firefox_path.is_some(),
        None,
    ));
    lines.push(format_check_status(&report.cli_executable));
    lines.push(format_check_status(&report.cli_on_path));
    lines.push(format_check_status(&report.native_host));
    lines.push(format_check_status(&report.native_manifest));
    lines.push(format_check_status(&report.native_registry));
    lines.push(format_check_status(&report.extension_source));
    lines.push(format_check_status(&report.extension_build));
    lines.push(format_check_status(&report.default_profile));
    lines.push(format_check_status(&report.default_profile_launcher));
    lines.push(format_check_status(&report.firefox_startup_policy));
    lines.push(format!(
        "{} live Firefox session(s)",
        report.live_sessions.len()
    ));
    for session in &report.live_sessions {
        lines.push(format!(
            "  - {} profile={} extension={} heartbeat={}",
            session.session_id,
            session.profile_id,
            session.extension_version,
            session.last_heartbeat_at
        ));
    }
    lines.join("\n")
}

fn check_cli_executable() -> CheckStatus {
    match env::current_exe() {
        Ok(path) => CheckStatus::ok("CLI executable", Some(path), None),
        Err(err) => CheckStatus::fail("CLI executable", None, err.to_string()),
    }
}

fn check_cli_on_path() -> CheckStatus {
    let path_var = env::var_os("PATH");
    let Some(path_var) = path_var else {
        return CheckStatus::fail(
            "CLI on PATH",
            None,
            "PATH is not set; explicit executable paths still work",
        );
    };
    let candidates = executable_names();
    for dir in env::split_paths(&path_var) {
        for candidate in &candidates {
            let path = dir.join(candidate);
            if path.is_file() {
                return CheckStatus::ok(
                    "CLI on PATH",
                    Some(path),
                    Some("found by PATH lookup".to_string()),
                );
            }
        }
    }
    CheckStatus::fail(
        "CLI on PATH",
        None,
        "pire-browser was not found on PATH; use the explicit binary path or rerun the installer",
    )
}

fn executable_names() -> Vec<String> {
    let mut names = vec!["pire-browser".to_string()];
    #[cfg(windows)]
    {
        names.insert(0, "pire-browser.exe".to_string());
    }
    names
}

pub fn install_status_json(report: &InstallStatusReport) -> Result<String> {
    Ok(serde_json::to_string_pretty(report)?)
}

fn format_check_status(check: &CheckStatus) -> String {
    format_check(
        &check.label,
        check.path.as_ref().map(|p| p.display().to_string()),
        check.ok,
        check.message.as_deref(),
    )
}

fn format_check(label: &str, path: Option<String>, ok: bool, message: Option<&str>) -> String {
    let status = if ok { "ok" } else { "missing" };
    match (path, message) {
        (Some(path), Some(message)) => format!("[{status}] {label}: {path} ({message})"),
        (Some(path), None) => format!("[{status}] {label}: {path}"),
        (None, Some(message)) => format!("[{status}] {label}: {message}"),
        (None, None) => format!("[{status}] {label}"),
    }
}

fn check_native_host() -> CheckStatus {
    match sibling_host_path() {
        Ok(path) if path.exists() => CheckStatus::ok("Native host binary", Some(path), None),
        Ok(path) => CheckStatus::fail("Native host binary", Some(path), "run cargo build"),
        Err(err) => CheckStatus::fail("Native host binary", None, err.to_string()),
    }
}

fn check_native_manifest() -> CheckStatus {
    let Ok(path) = native_manifest_path() else {
        return CheckStatus::fail("Native manifest", None, "could not resolve manifest path");
    };
    let Ok(body) = fs::read_to_string(&path) else {
        return CheckStatus::fail("Native manifest", Some(path), "run setup --windows");
    };
    let Ok(json) = serde_json::from_str::<Value>(&body) else {
        return CheckStatus::fail("Native manifest", Some(path), "manifest is not valid JSON");
    };
    let name_ok = json.get("name").and_then(|v| v.as_str()) == Some(NATIVE_HOST_NAME);
    let allowed_ok = json
        .get("allowed_extensions")
        .and_then(|v| v.as_array())
        .map(|values| values.iter().any(|v| v.as_str() == Some(EXTENSION_ID)))
        .unwrap_or(false);
    let path_ok = json
        .get("path")
        .and_then(|v| v.as_str())
        .map(|p| PathBuf::from(p).exists())
        .unwrap_or(false);
    if name_ok && allowed_ok && path_ok {
        CheckStatus::ok("Native manifest", Some(path), None)
    } else {
        CheckStatus::fail(
            "Native manifest",
            Some(path),
            "manifest exists but does not match expected host/id/path",
        )
    }
}

#[cfg(windows)]
fn check_native_registry() -> CheckStatus {
    let Ok(expected) = native_manifest_path() else {
        return CheckStatus::fail(
            "Native registry",
            None,
            "could not resolve expected manifest path",
        );
    };
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key_path = format!(
        r"Software\Mozilla\NativeMessagingHosts\{}",
        NATIVE_HOST_NAME
    );
    let Ok(key) = hkcu.open_subkey(&key_path) else {
        return CheckStatus::fail(
            "Native registry",
            None,
            format!("HKCU\\{key_path} is missing"),
        );
    };
    let Ok(actual) = key.get_value::<String, _>("") else {
        return CheckStatus::fail("Native registry", None, "default registry value is missing");
    };
    if PathBuf::from(&actual) == expected {
        CheckStatus::ok("Native registry", Some(expected), None)
    } else {
        CheckStatus::fail(
            "Native registry",
            Some(PathBuf::from(actual)),
            format!("expected {}", expected.display()),
        )
    }
}

#[cfg(not(windows))]
fn check_native_registry() -> CheckStatus {
    CheckStatus::fail("Native registry", None, "Windows-only MVP")
}

fn check_extension_source() -> CheckStatus {
    let path = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("extension")
        .join("manifest.json");
    if path.exists() {
        CheckStatus::ok("Extension source", Some(path), None)
    } else {
        CheckStatus::fail("Extension source", Some(path), "manifest.json is missing")
    }
}

fn check_extension_build() -> CheckStatus {
    let root = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("extension")
        .join("dist");
    let required = ["background.js", "content.js", "dialog-shim.js"];
    let missing: Vec<_> = required
        .iter()
        .filter(|file| !root.join(file).exists())
        .copied()
        .collect();
    if missing.is_empty() {
        CheckStatus::ok("Extension build", Some(root), None)
    } else {
        CheckStatus::fail(
            "Extension build",
            Some(root),
            format!(
                "missing {}; run npm --prefix extension run build",
                missing.join(", ")
            ),
        )
    }
}

fn check_default_profile() -> (CheckStatus, CheckStatus) {
    match default_profile_status() {
        Ok((path, metadata, launcher_live)) => {
            let profile = if path.exists() {
                CheckStatus::ok(
                    format!("Managed Firefox profile {DEFAULT_PROFILE_NAME}"),
                    Some(path),
                    None,
                )
            } else {
                CheckStatus::fail(
                    format!("Managed Firefox profile {DEFAULT_PROFILE_NAME}"),
                    Some(path),
                    "not created yet; run pire-browser launch",
                )
            };

            let launcher = match metadata {
                Some(metadata) if launcher_live => CheckStatus::ok(
                    format!("Profile launcher {DEFAULT_PROFILE_NAME}"),
                    None,
                    Some(format!("running pid {}", metadata.launcher_pid)),
                ),
                Some(metadata) => CheckStatus::fail(
                    format!("Profile launcher {DEFAULT_PROFILE_NAME}"),
                    None,
                    format!("last pid {} is not running", metadata.launcher_pid),
                ),
                None => CheckStatus::fail(
                    format!("Profile launcher {DEFAULT_PROFILE_NAME}"),
                    None,
                    "not launched yet",
                ),
            };
            (profile, launcher)
        }
        Err(err) => (
            CheckStatus::fail(
                format!("Managed Firefox profile {DEFAULT_PROFILE_NAME}"),
                None,
                err.to_string(),
            ),
            CheckStatus::fail(
                format!("Profile launcher {DEFAULT_PROFILE_NAME}"),
                None,
                err.to_string(),
            ),
        ),
    }
}

fn check_firefox_startup_policy() -> CheckStatus {
    match firefox_startup_policy_status() {
        Ok(true) => CheckStatus::ok(
            "Firefox startup popup suppression",
            None,
            Some("Terms/Privacy and first-run prompts disabled".to_string()),
        ),
        Ok(false) => CheckStatus::fail(
            "Firefox startup popup suppression",
            None,
            "not set yet; run pire-browser launch",
        ),
        Err(err) => CheckStatus::fail("Firefox startup popup suppression", None, err.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_text_includes_live_session_count() {
        let report = InstallStatusReport {
            ok: false,
            firefox_path: None,
            cli_executable: CheckStatus::ok(
                "CLI executable",
                Some(PathBuf::from("pire-browser.exe")),
                None,
            ),
            cli_on_path: CheckStatus::fail("CLI on PATH", None, "missing"),
            native_host: CheckStatus::fail("Native host binary", None, "missing"),
            native_manifest: CheckStatus::fail("Native manifest", None, "missing"),
            native_registry: CheckStatus::fail("Native registry", None, "missing"),
            extension_source: CheckStatus::fail("Extension source", None, "missing"),
            extension_build: CheckStatus::fail("Extension build", None, "missing"),
            default_profile: CheckStatus::fail("Managed Firefox profile Default", None, "missing"),
            default_profile_launcher: CheckStatus::fail(
                "Profile launcher Default",
                None,
                "missing",
            ),
            firefox_startup_policy: CheckStatus::fail(
                "Firefox startup popup suppression",
                None,
                "missing",
            ),
            live_sessions: Vec::new(),
        };
        let text = install_status_text(&report);
        assert!(text.contains("0 live Firefox session"));
        assert!(text.contains("CLI executable"));
        assert!(text.contains("CLI on PATH"));
    }

    #[test]
    fn executable_names_include_windows_name_when_applicable() {
        let names = executable_names();
        assert!(names.iter().any(|name| name == "pire-browser"));
        #[cfg(windows)]
        assert!(names.iter().any(|name| name == "pire-browser.exe"));
    }
}
