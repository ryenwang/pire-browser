use std::env;
use std::fs;
use std::path::PathBuf;

use anyhow::Result;
use serde::Serialize;
use serde_json::Value;

use crate::action_policy::{action_policy_text, collect_action_policy, ActionPolicyDiagnostic};
use crate::auth_handoff::{auth_handoff_text, collect_default_auth_handoff, AuthHandoffInfo};
use crate::confirmation_policy::{
    collect_confirmation_policy, confirmation_policy_text, ConfirmationPolicyDiagnostic,
};
use crate::domain_policy::{collect_domain_policy, domain_policy_text, DomainPolicyDiagnostic};
use crate::firefox::{
    discover_firefox, firefox_install_kind, platform_firefox_install_hint,
    sandboxed_firefox_message, FirefoxInstallKind,
};
use crate::launch::{default_profile_status, firefox_startup_policy_status, DEFAULT_PROFILE_NAME};
use crate::protocol::{EXTENSION_ID, NATIVE_HOST_NAME};
use crate::session::{cleanup_stale_sessions, list_sessions, now_ms, SessionInfo};
use crate::setup::{native_manifest_path, sibling_host_path};
use crate::state_policy::{collect_state_policy, state_policy_text, StatePolicyDiagnostic};

#[cfg(windows)]
use winreg::enums::HKEY_CURRENT_USER;
#[cfg(windows)]
use winreg::RegKey;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallStatusReport {
    pub ok: bool,
    pub firefox_path: Option<PathBuf>,
    pub firefox_install_kind: Option<String>,
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
    pub auth_handoff: AuthHandoffInfo,
    pub action_policy: ActionPolicyDiagnostic,
    pub confirmation_policy: ConfirmationPolicyDiagnostic,
    pub domain_policy: DomainPolicyDiagnostic,
    pub state_policy: StatePolicyDiagnostic,
    pub live_sessions: Vec<SessionInfo>,
    pub next_actions: Vec<InstallNextAction>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallNextAction {
    pub code: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

impl InstallNextAction {
    fn new(
        code: impl Into<String>,
        reason: impl Into<String>,
        command: Option<impl Into<String>>,
        note: Option<impl Into<String>>,
    ) -> Self {
        Self {
            code: code.into(),
            reason: reason.into(),
            command: command.map(Into::into),
            note: note.map(Into::into),
        }
    }
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
    let firefox_install_kind = firefox_path
        .as_deref()
        .map(|path| firefox_install_kind(path).as_str().to_string());
    let cli_executable = check_cli_executable();
    let cli_on_path = check_cli_on_path();
    let native_host = check_native_host();
    let native_manifest = check_native_manifest();
    let native_registry = check_native_registry();
    let extension_source = check_extension_source();
    let extension_build = check_extension_build();
    let (default_profile, default_profile_launcher) = check_default_profile();
    let firefox_startup_policy = check_firefox_startup_policy();
    let auth_handoff = collect_default_auth_handoff()?;
    let action_policy = collect_action_policy();
    let confirmation_policy = collect_confirmation_policy();
    let domain_policy = collect_domain_policy();
    let state_policy = collect_state_policy();

    cleanup_stale_sessions(now_ms())?;
    let live_sessions = list_sessions()?;

    let ok = firefox_path.is_some()
        && native_host.ok
        && native_manifest.ok
        && native_registry.ok
        && extension_source.ok
        && extension_build.ok;

    let mut report = InstallStatusReport {
        ok,
        firefox_path,
        firefox_install_kind,
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
        auth_handoff,
        action_policy,
        confirmation_policy,
        domain_policy,
        state_policy,
        live_sessions,
        next_actions: Vec::new(),
    };
    report.next_actions = install_next_actions(&report);
    Ok(report)
}

pub fn install_status_text(report: &InstallStatusReport) -> String {
    let mut lines = Vec::new();
    lines.push(format!(
        "pire-browser install status: {}",
        if report.ok { "ok" } else { "needs attention" }
    ));
    let firefox_message = firefox_install_message(report.firefox_install_kind.as_deref());
    lines.push(format_check(
        "Firefox",
        report
            .firefox_path
            .as_ref()
            .map(|p| p.display().to_string()),
        report.firefox_path.is_some(),
        firefox_message.as_deref(),
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
    lines.push(auth_handoff_text(&report.auth_handoff));
    lines.push(action_policy_text(&report.action_policy));
    lines.push(confirmation_policy_text(&report.confirmation_policy));
    lines.push(domain_policy_text(&report.domain_policy));
    lines.push(state_policy_text(&report.state_policy));
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
    if !report.next_actions.is_empty() {
        lines.push("Next actions:".to_string());
        for action in &report.next_actions {
            lines.push(format!("  - [{}] {}", action.code, action.reason));
            if let Some(command) = &action.command {
                lines.push(format!("    command: {command}"));
            }
            if let Some(note) = &action.note {
                lines.push(format!("    note: {note}"));
            }
        }
    }
    lines.join("\n")
}

fn install_next_actions(report: &InstallStatusReport) -> Vec<InstallNextAction> {
    let mut actions = Vec::new();
    if report.firefox_path.is_none() {
        actions.push(InstallNextAction::new(
            "install_firefox",
            "Firefox was not discovered, so native host setup and browser launch cannot complete.",
            Some("pire-browser install --with-deps"),
            Some(platform_firefox_install_hint()),
        ));
        return actions;
    }

    if !report.native_host.ok {
        actions.push(InstallNextAction::new(
            "build_or_reinstall_native_host",
            "The pire-browser native host binary is missing.",
            Some("cargo build"),
            Some("For npm/Pi installs, reinstall pire-browser with optional dependencies enabled."),
        ));
    }

    if !report.native_manifest.ok || !report.native_registry.ok {
        actions.push(InstallNextAction::new(
            "repair_native_messaging",
            "Firefox Native Messaging registration is missing or mismatched.",
            Some("pire-browser doctor --fix"),
            Some("Use `--firefox-path <path>` if Firefox is installed in a custom location."),
        ));
    }

    if !report.extension_source.ok || !report.extension_build.ok {
        actions.push(InstallNextAction::new(
            "repair_extension_assets",
            "Firefox extension assets are missing or incomplete.",
            Some("npm run build:extension"),
            Some("For npm/Pi installs, reinstall pire-browser if packaged extension files are missing."),
        ));
    }

    if actions.is_empty() && !report.ok {
        actions.push(InstallNextAction::new(
            "run_doctor_fix",
            "Install status still needs attention.",
            Some("pire-browser doctor --fix"),
            Option::<String>::None,
        ));
    }

    actions
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
    #[cfg(windows)]
    {
        let mut names = vec!["pire-browser".to_string()];
        names.insert(0, "pire-browser.exe".to_string());
        names
    }
    #[cfg(not(windows))]
    {
        vec!["pire-browser".to_string()]
    }
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

fn firefox_install_message(kind: Option<&str>) -> Option<String> {
    kind.map(|kind| match kind {
        "snap" => sandboxed_firefox_message(FirefoxInstallKind::Snap)
            .unwrap()
            .to_string(),
        "flatpak" => sandboxed_firefox_message(FirefoxInstallKind::Flatpak)
            .unwrap()
            .to_string(),
        other => format!("install kind: {other}"),
    })
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
        return CheckStatus::fail("Native manifest", Some(path), "run setup");
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
    let actual = PathBuf::from(actual);
    if actual == expected {
        CheckStatus::ok("Native registry", Some(expected), None)
    } else {
        CheckStatus::fail(
            "Native registry",
            Some(actual),
            format!("expected {}", expected.display()),
        )
    }
}

#[cfg(not(windows))]
fn check_native_registry() -> CheckStatus {
    CheckStatus::ok(
        "Native registry",
        None,
        Some("not required on this platform".to_string()),
    )
}

fn check_extension_source() -> CheckStatus {
    let root = extension_dir();
    let path = root.join("manifest.json");
    if path.exists() {
        CheckStatus::ok("Extension source", Some(path), None)
    } else {
        CheckStatus::fail("Extension source", Some(path), "manifest.json is missing")
    }
}

fn check_extension_build() -> CheckStatus {
    let root = extension_dir().join("dist");
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

fn extension_dir() -> PathBuf {
    extension_dir_from_candidates(
        std::env::var_os("PIRE_BROWSER_EXTENSION_DIR").map(PathBuf::from),
        extension_dir_candidates(),
    )
}

fn extension_dir_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("extension"));
    }
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors() {
            candidates.push(ancestor.join("extension"));
        }
    }
    candidates
}

fn extension_dir_from_candidates(
    env_path: Option<PathBuf>,
    candidates: impl IntoIterator<Item = PathBuf>,
) -> PathBuf {
    if let Some(path) = env_path {
        return path;
    }
    candidates
        .into_iter()
        .find(|candidate| candidate.join("manifest.json").exists())
        .unwrap_or_else(|| {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("extension")
        })
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
            firefox_install_kind: None,
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
            auth_handoff: crate::auth_handoff::auth_handoff_from_data_dir(
                &PathBuf::from(r"C:\Users\me\AppData\Local\pire-browser"),
                DEFAULT_PROFILE_NAME,
            ),
            action_policy: crate::action_policy::action_policy_from_env_value(None),
            confirmation_policy: crate::confirmation_policy::confirmation_policy_from_env_values(
                None, None,
            ),
            domain_policy: crate::domain_policy::domain_policy_from_env_value(None),
            state_policy: crate::state_policy::state_policy_from_env_value(None),
            live_sessions: Vec::new(),
            next_actions: Vec::new(),
        };
        let text = install_status_text(&report);
        assert!(text.contains("0 live Firefox session"));
        assert!(text.contains("CLI executable"));
        assert!(text.contains("CLI on PATH"));
        assert!(text.contains("Auth handoff"));
        assert!(text.contains("Action policy"));
        assert!(text.contains("Confirmation policy"));
        assert!(text.contains("Domain policy"));
        assert!(text.contains("State policy"));
    }

    #[test]
    fn missing_firefox_status_includes_next_action() {
        let mut report = InstallStatusReport {
            ok: false,
            firefox_path: None,
            firefox_install_kind: None,
            cli_executable: CheckStatus::ok(
                "CLI executable",
                Some(PathBuf::from("pire-browser")),
                None,
            ),
            cli_on_path: CheckStatus::ok("CLI on PATH", Some(PathBuf::from("pire-browser")), None),
            native_host: CheckStatus::ok(
                "Native host binary",
                Some(PathBuf::from("pire-browser-host")),
                None,
            ),
            native_manifest: CheckStatus::fail("Native manifest", None, "run setup"),
            native_registry: CheckStatus::fail("Native registry", None, "missing"),
            extension_source: CheckStatus::ok(
                "Extension source",
                Some(PathBuf::from("extension/manifest.json")),
                None,
            ),
            extension_build: CheckStatus::ok(
                "Extension build",
                Some(PathBuf::from("extension/dist")),
                None,
            ),
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
            auth_handoff: crate::auth_handoff::auth_handoff_from_data_dir(
                &PathBuf::from("/tmp/pire-browser"),
                DEFAULT_PROFILE_NAME,
            ),
            action_policy: crate::action_policy::action_policy_from_env_value(None),
            confirmation_policy: crate::confirmation_policy::confirmation_policy_from_env_values(
                None, None,
            ),
            domain_policy: crate::domain_policy::domain_policy_from_env_value(None),
            state_policy: crate::state_policy::state_policy_from_env_value(None),
            live_sessions: Vec::new(),
            next_actions: Vec::new(),
        };
        report.next_actions = install_next_actions(&report);

        assert_eq!(report.next_actions.len(), 1);
        assert_eq!(report.next_actions[0].code, "install_firefox");
        assert!(report.next_actions[0]
            .command
            .as_deref()
            .unwrap()
            .contains("--with-deps"));
        let json = install_status_json(&report).unwrap();
        assert!(json.contains("\"nextActions\""));
        assert!(json.contains("\"install_firefox\""));
        let text = install_status_text(&report);
        assert!(text.contains("Next actions:"));
        assert!(text.contains("pire-browser install --with-deps"));
    }

    #[test]
    fn executable_names_include_windows_name_when_applicable() {
        let names = executable_names();
        assert!(names.iter().any(|name| name == "pire-browser"));
        #[cfg(windows)]
        assert!(names.iter().any(|name| name == "pire-browser.exe"));
    }

    #[test]
    fn sandboxed_firefox_status_messages_are_actionable() {
        let snap = firefox_install_message(Some("snap")).unwrap();
        assert!(snap.contains("Snap Firefox detected"));
        assert!(snap.contains("sandbox confinement"));
        assert!(snap.contains("setup --firefox-path"));
        let flatpak = firefox_install_message(Some("flatpak")).unwrap();
        assert!(flatpak.contains("Flatpak Firefox detected"));
        assert!(flatpak.contains("unrestricted Firefox"));
    }

    #[test]
    fn extension_dir_discovers_first_candidate_with_manifest() {
        let root = tempfile::tempdir().unwrap();
        let missing = root.path().join("missing").join("extension");
        let valid = root.path().join("repo").join("extension");
        fs::create_dir_all(&valid).unwrap();
        fs::write(valid.join("manifest.json"), "{}").unwrap();

        let resolved = extension_dir_from_candidates(None, vec![missing, valid.clone()]);
        assert_eq!(resolved, valid);
    }

    #[test]
    fn extension_dir_env_path_is_authoritative() {
        let explicit = PathBuf::from("custom-extension");
        let fallback = PathBuf::from("repo").join("extension");
        let resolved = extension_dir_from_candidates(Some(explicit.clone()), vec![fallback]);
        assert_eq!(resolved, explicit);
    }
}
