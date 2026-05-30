use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use crate::download::{download_user_js_prefs, ensure_profile_download_dir, sweep_old_downloads};
use crate::firefox::discover_firefox;
use crate::session::{
    cleanup_stale_sessions, data_dir, ensure_runtime_dirs, list_sessions, now_ms, SessionInfo,
};

pub const DEFAULT_PROFILE_NAME: &str = "Default";

#[derive(Debug, Clone)]
pub struct LaunchOptions {
    pub profile: String,
    pub url: Option<String>,
    pub firefox_path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LaunchResult {
    pub reused: bool,
    pub session: SessionInfo,
    pub profile_name: String,
    pub profile_path: PathBuf,
    pub launcher_pid: u32,
    pub log_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherMetadata {
    pub profile_name: String,
    pub profile_path: PathBuf,
    pub firefox_path: PathBuf,
    pub extension_source: PathBuf,
    pub launcher_pid: u32,
    pub started_at: u64,
    pub last_launch_url: Option<String>,
    pub session_id: Option<String>,
    pub profile_id: Option<String>,
}

pub fn launch_firefox(options: LaunchOptions) -> Result<LaunchResult> {
    ensure_windows()?;
    ensure_runtime_dirs()?;
    validate_profile_name(&options.profile)?;
    ensure_firefox_startup_policies_best_effort();

    let root = data_dir()?;
    let profile_path = managed_profile_dir_from_data_dir(&root, &options.profile);
    let metadata_dir = profile_metadata_dir_from_data_dir(&root, &options.profile);
    let launcher_path = launcher_metadata_path_from_data_dir(&root, &options.profile);
    let log_path = metadata_dir.join("web-ext.log");

    fs::create_dir_all(&profile_path)
        .with_context(|| format!("failed to create {}", profile_path.display()))?;
    fs::create_dir_all(&metadata_dir)
        .with_context(|| format!("failed to create {}", metadata_dir.display()))?;
    let download_dir = ensure_profile_download_dir(&root, &options.profile)?;
    let _ = sweep_old_downloads(now_ms());
    write_profile_startup_prefs(&profile_path, &download_dir)?;
    restrict_current_user_dir_best_effort(&profile_path);
    restrict_current_user_dir_best_effort(&metadata_dir);

    cleanup_stale_sessions(now_ms())?;
    if let Some(mut metadata) = read_launcher_metadata(&launcher_path)? {
        if let Some(session) = live_session_for_metadata(&metadata)? {
            if metadata.session_id.as_deref() != Some(session.session_id.as_str()) {
                metadata.session_id = Some(session.session_id.clone());
                metadata.profile_id = Some(session.profile_id.clone());
                let _ = write_launcher_metadata_atomic(&launcher_path, &metadata);
            }
            return Ok(LaunchResult {
                reused: true,
                session,
                profile_name: options.profile,
                profile_path,
                launcher_pid: metadata.launcher_pid,
                log_path,
            });
        }

        if process_is_alive(metadata.launcher_pid) {
            let _ = terminate_process_best_effort(metadata.launcher_pid);
            thread::sleep(Duration::from_millis(250));
        }

        if process_is_alive(metadata.launcher_pid) {
            bail!(
                "profile {} appears to be running under launcher PID {}, but no live pire-browser session was found; close that Firefox/web-ext instance or check {}",
                options.profile,
                metadata.launcher_pid,
                log_path.display()
            );
        }

        let _ = fs::remove_file(&launcher_path);
    }

    let baseline: HashSet<String> = list_sessions()?
        .into_iter()
        .map(|session| session.session_id)
        .collect();
    let firefox_path = discover_firefox(options.firefox_path.clone())
        .context("could not discover Firefox; pass --firefox-path <path>")?;
    let extension_source = discover_extension_source()?;
    let log = open_append(&log_path)?;
    let log_err = log.try_clone()?;

    let mut command = Command::new(npx_command());
    command
        .arg("--yes")
        .arg("web-ext")
        .arg("run")
        .arg("--source-dir")
        .arg(&extension_source)
        .arg("--firefox")
        .arg(&firefox_path)
        .arg("--firefox-profile")
        .arg(&profile_path)
        .arg("--profile-create-if-missing")
        .arg("--keep-profile-changes")
        .arg("--no-input")
        .current_dir(extension_source.parent().unwrap_or_else(|| Path::new(".")))
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err));

    if let Some(url) = &options.url {
        command.arg("--start-url").arg(url);
    }

    hide_window(&mut command);
    let mut child = command.spawn().with_context(|| {
        format!(
            "failed to start web-ext with {}; make sure Node.js/npm are installed",
            npx_command().display()
        )
    })?;
    let launcher_pid = child.id();

    let mut metadata = LauncherMetadata {
        profile_name: options.profile.clone(),
        profile_path: profile_path.clone(),
        firefox_path,
        extension_source,
        launcher_pid,
        started_at: now_ms(),
        last_launch_url: options.url,
        session_id: None,
        profile_id: None,
    };
    write_launcher_metadata_atomic(&launcher_path, &metadata)?;

    let deadline = Instant::now() + Duration::from_secs(60);
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait()? {
            bail!(
                "web-ext exited before pire-browser connected (status: {status}); check {}",
                log_path.display()
            );
        }

        cleanup_stale_sessions(now_ms())?;
        let mut sessions: Vec<_> = list_sessions()?
            .into_iter()
            .filter(|session| !baseline.contains(&session.session_id))
            .collect();
        sessions.sort_by_key(|session| std::cmp::Reverse(session.last_focused_at));

        if let Some(mut session) = sessions.into_iter().next() {
            session.profile_name = Some(options.profile.clone());
            metadata.session_id = Some(session.session_id.clone());
            metadata.profile_id = Some(session.profile_id.clone());
            write_launcher_metadata_atomic(&launcher_path, &metadata)?;
            return Ok(LaunchResult {
                reused: false,
                session,
                profile_name: options.profile,
                profile_path,
                launcher_pid,
                log_path,
            });
        }

        thread::sleep(Duration::from_millis(500));
    }

    bail!(
        "timed out waiting for pire-browser extension session; check {}",
        log_path.display()
    )
}

pub fn launch_result_text(result: &LaunchResult) -> String {
    let action = if result.reused { "reused" } else { "launched" };
    format!(
        "pire-browser {action} Firefox profile {}\nSession: {}\nProfile path: {}\nLauncher PID: {}\nLog: {}",
        result.profile_name,
        result.session.session_id,
        result.profile_path.display(),
        result.launcher_pid,
        result.log_path.display()
    )
}

pub fn default_profile_status() -> Result<(PathBuf, Option<LauncherMetadata>, bool)> {
    let root = data_dir()?;
    let path = managed_profile_dir_from_data_dir(&root, DEFAULT_PROFILE_NAME);
    let metadata = read_launcher_metadata(&launcher_metadata_path_from_data_dir(
        &root,
        DEFAULT_PROFILE_NAME,
    ))?;
    let launcher_live = metadata
        .as_ref()
        .map(|metadata| process_is_alive(metadata.launcher_pid))
        .unwrap_or(false);
    Ok((path, metadata, launcher_live))
}

pub fn firefox_startup_policy_status() -> Result<bool> {
    Ok(firefox_startup_policies_enabled()? || default_profile_startup_prefs_enabled()?)
}

pub fn managed_profile_dir_from_data_dir(root: &Path, profile_name: &str) -> PathBuf {
    root.join("firefox-profiles").join(profile_name)
}

fn profile_metadata_dir_from_data_dir(root: &Path, profile_name: &str) -> PathBuf {
    root.join("profiles").join(profile_name)
}

fn launcher_metadata_path_from_data_dir(root: &Path, profile_name: &str) -> PathBuf {
    profile_metadata_dir_from_data_dir(root, profile_name).join("launcher.json")
}

pub fn validate_profile_name(profile_name: &str) -> Result<()> {
    if profile_name.is_empty() || profile_name.trim() != profile_name {
        bail!("invalid_args: profile name must be non-empty and must not have leading or trailing whitespace");
    }
    if profile_name == "." || profile_name == ".." {
        bail!("invalid_args: profile name must be a simple managed profile name, not a path");
    }
    if !profile_name
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, ' ' | '_' | '-' | '.'))
    {
        bail!("invalid_args: profile name may contain only letters, numbers, internal spaces, `_`, `-`, and `.`");
    }
    Ok(())
}

pub fn live_session_for_profile_name(profile_name: &str) -> Result<Option<SessionInfo>> {
    validate_profile_name(profile_name)?;
    cleanup_stale_sessions(now_ms())?;
    let root = data_dir()?;
    let Some(metadata) =
        read_launcher_metadata(&launcher_metadata_path_from_data_dir(&root, profile_name))?
    else {
        return Ok(None);
    };
    live_session_for_metadata(&metadata)
}

pub fn annotate_session_profile_names(sessions: &mut [SessionInfo]) -> Result<()> {
    annotate_session_profile_names_from_data_dir(&data_dir()?, sessions)
}

fn annotate_session_profile_names_from_data_dir(
    root: &Path,
    sessions: &mut [SessionInfo],
) -> Result<()> {
    let profiles_dir = root.join("profiles");
    if !profiles_dir.exists() {
        return Ok(());
    }

    let mut names_by_session_id = HashMap::new();
    let mut names_by_profile_id = HashMap::new();
    for entry in fs::read_dir(&profiles_dir)? {
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path().join("launcher.json");
        let Ok(Some(metadata)) = read_launcher_metadata(&path) else {
            continue;
        };
        if let Some(session_id) = metadata.session_id.as_deref() {
            names_by_session_id.insert(session_id.to_string(), metadata.profile_name.clone());
        }
        if let Some(profile_id) = metadata.profile_id.as_deref() {
            names_by_profile_id.insert(profile_id.to_string(), metadata.profile_name.clone());
        }
    }

    for session in sessions {
        if let Some(name) = names_by_session_id
            .get(&session.session_id)
            .or_else(|| names_by_profile_id.get(&session.profile_id))
        {
            session.profile_name = Some(name.clone());
        }
    }
    Ok(())
}

fn read_launcher_metadata(path: &Path) -> Result<Option<LauncherMetadata>> {
    if !path.exists() {
        return Ok(None);
    }
    let body =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let metadata = serde_json::from_str(&body)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    Ok(Some(metadata))
}

fn write_launcher_metadata_atomic(path: &Path, metadata: &LauncherMetadata) -> Result<()> {
    fs::create_dir_all(
        path.parent()
            .context("launcher metadata path has no parent")?,
    )?;
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, serde_json::to_vec_pretty(metadata)?)
        .with_context(|| format!("failed to write {}", tmp_path.display()))?;
    fs::rename(&tmp_path, path).with_context(|| format!("failed to publish {}", path.display()))?;
    Ok(())
}

fn live_session_for_metadata(metadata: &LauncherMetadata) -> Result<Option<SessionInfo>> {
    let now = now_ms();
    let sessions: Vec<_> = list_sessions()?
        .into_iter()
        .filter(|session| !session.is_stale(now))
        .collect();

    if let Some(session_id) = metadata.session_id.as_deref() {
        if let Some(mut session) = sessions
            .iter()
            .find(|session| session.session_id == session_id)
            .cloned()
        {
            session.profile_name = Some(metadata.profile_name.clone());
            return Ok(Some(session));
        }
    }

    if let Some(profile_id) = metadata.profile_id.as_deref() {
        if let Some(mut session) = sessions
            .into_iter()
            .find(|session| session.profile_id == profile_id)
        {
            session.profile_name = Some(metadata.profile_name.clone());
            return Ok(Some(session));
        }
    }

    Ok(None)
}

fn discover_extension_source() -> Result<PathBuf> {
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
        .into_iter()
        .find(|candidate| candidate.join("manifest.json").exists())
        .context("could not locate extension source directory; run from the repo or install extension files next to the binary")
}

fn open_append(path: &Path) -> Result<File> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .with_context(|| format!("failed to open {}", path.display()))
}

fn npx_command() -> PathBuf {
    #[cfg(windows)]
    {
        let program_files = PathBuf::from(r"C:\Program Files\nodejs\npx.cmd");
        if program_files.exists() {
            program_files
        } else {
            PathBuf::from("npx.cmd")
        }
    }

    #[cfg(not(windows))]
    {
        PathBuf::from("npx")
    }
}

#[cfg(windows)]
fn ensure_windows() -> Result<()> {
    Ok(())
}

#[cfg(not(windows))]
fn ensure_windows() -> Result<()> {
    bail!("pire-browser launch supports Windows only")
}

#[cfg(windows)]
fn hide_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x08000000);
}

#[cfg(not(windows))]
fn hide_window(_command: &mut Command) {}

#[cfg(windows)]
fn process_is_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut exit_code = 0u32;
        let ok = GetExitCodeProcess(handle, &mut exit_code);
        CloseHandle(handle);
        ok != 0 && exit_code == STILL_ACTIVE as u32
    }
}

#[cfg(not(windows))]
fn process_is_alive(_pid: u32) -> bool {
    false
}

#[cfg(windows)]
fn terminate_process_best_effort(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if handle.is_null() {
            return false;
        }
        let ok = TerminateProcess(handle, 0);
        CloseHandle(handle);
        ok != 0
    }
}

#[cfg(not(windows))]
fn terminate_process_best_effort(_pid: u32) -> bool {
    false
}

fn write_profile_startup_prefs(profile_path: &Path, download_dir: &Path) -> Result<()> {
    const BEGIN: &str = "// BEGIN pire-browser startup prefs";
    const END: &str = "// END pire-browser startup prefs";

    let user_js = profile_path.join("user.js");
    let now = now_ms();
    let block = format!(
        r#"{BEGIN}
user_pref("termsofuse.acceptedVersion", 999);
user_pref("termsofuse.acceptedDate", "{now}");
user_pref("termsofuse.firstAcceptedDate", "{now}");
user_pref("termsofuse.bypassNotification", true);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.shell.checkDefaultBrowser", false);
{}
{END}
"#,
        download_user_js_prefs(download_dir)
    );

    let existing = fs::read_to_string(&user_js).unwrap_or_default();
    let updated = match (existing.find(BEGIN), existing.find(END)) {
        (Some(start), Some(end)) if start < end => {
            let suffix_start = end + END.len();
            format!(
                "{}{}{}",
                &existing[..start],
                block,
                existing
                    .get(suffix_start..)
                    .unwrap_or_default()
                    .trim_start_matches(['\r', '\n'])
            )
        }
        _ if existing.trim().is_empty() => block,
        _ => format!("{}\n{}", existing.trim_end(), block),
    };

    fs::write(&user_js, updated).with_context(|| format!("failed to write {}", user_js.display()))
}

#[cfg(windows)]
fn ensure_firefox_startup_policies_best_effort() {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok((key, _)) = hkcu.create_subkey(r"Software\Policies\Mozilla\Firefox") else {
        return;
    };
    let _ = key.set_value("SkipTermsOfUse", &1u32);
    let _ = key.set_value("OverrideFirstRunPage", &"");
    let _ = key.set_value("DontCheckDefaultBrowser", &1u32);
}

#[cfg(not(windows))]
fn ensure_firefox_startup_policies_best_effort() {}

#[cfg(windows)]
fn firefox_startup_policies_enabled() -> Result<bool> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok(key) = hkcu.open_subkey(r"Software\Policies\Mozilla\Firefox") else {
        return Ok(false);
    };
    let skip_terms = key.get_value::<u32, _>("SkipTermsOfUse").unwrap_or(0) == 1;
    let first_run = key
        .get_value::<String, _>("OverrideFirstRunPage")
        .map(|value| value.is_empty())
        .unwrap_or(false);
    Ok(skip_terms && first_run)
}

#[cfg(not(windows))]
fn firefox_startup_policies_enabled() -> Result<bool> {
    Ok(false)
}

fn default_profile_startup_prefs_enabled() -> Result<bool> {
    let user_js =
        managed_profile_dir_from_data_dir(&data_dir()?, DEFAULT_PROFILE_NAME).join("user.js");
    let Ok(body) = fs::read_to_string(user_js) else {
        return Ok(false);
    };
    Ok(body.contains("termsofuse.acceptedVersion")
        && body.contains("termsofuse.bypassNotification")
        && body.contains("dataSubmissionPolicyBypassNotification"))
}

#[cfg(windows)]
fn restrict_current_user_dir_best_effort(path: &Path) {
    use crate::ipc::current_user_sid_string;

    let Ok(sid) = current_user_sid_string() else {
        return;
    };
    let mut command = Command::new("icacls");
    command
        .arg(path)
        .arg("/inheritance:r")
        .arg("/grant:r")
        .arg(format!("*{sid}:(OI)(CI)F"))
        .arg("*S-1-5-18:(OI)(CI)F")
        .arg("*S-1-5-32-544:(OI)(CI)F")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_window(&mut command);
    let _ = command.status();
}

#[cfg(not(windows))]
fn restrict_current_user_dir_best_effort(_path: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_profile_path_is_under_firefox_profiles() {
        let root = PathBuf::from(r"C:\Users\me\AppData\Local\pire-browser");
        let path = managed_profile_dir_from_data_dir(&root, DEFAULT_PROFILE_NAME);
        assert_eq!(
            path,
            PathBuf::from(r"C:\Users\me\AppData\Local\pire-browser\firefox-profiles\Default")
        );
    }

    #[test]
    fn rejects_path_like_profile_names() {
        for name in [
            "Default",
            "my session",
            "test_session_v2",
            "my-project",
            "my.profile",
        ] {
            assert!(validate_profile_name(name).is_ok(), "{name}");
        }
        for name in [
            "", " ", " my", "my ", ".", "..", "foo/bar", r"foo\bar", "foo:bar", "../bad", "weird!",
        ] {
            assert!(validate_profile_name(name).is_err(), "{name}");
        }
    }

    #[test]
    fn annotates_sessions_from_launcher_metadata() {
        let root = tempfile::tempdir().unwrap();
        let alpha_path = launcher_metadata_path_from_data_dir(root.path(), "alpha");
        let beta_path = launcher_metadata_path_from_data_dir(root.path(), "beta");
        write_launcher_metadata_atomic(
            &alpha_path,
            &LauncherMetadata {
                profile_name: "alpha".into(),
                profile_path: managed_profile_dir_from_data_dir(root.path(), "alpha"),
                firefox_path: PathBuf::from("firefox.exe"),
                extension_source: PathBuf::from("extension"),
                launcher_pid: 1,
                started_at: 1,
                last_launch_url: None,
                session_id: Some("s-alpha".into()),
                profile_id: Some("p-alpha".into()),
            },
        )
        .unwrap();
        write_launcher_metadata_atomic(
            &beta_path,
            &LauncherMetadata {
                profile_name: "beta".into(),
                profile_path: managed_profile_dir_from_data_dir(root.path(), "beta"),
                firefox_path: PathBuf::from("firefox.exe"),
                extension_source: PathBuf::from("extension"),
                launcher_pid: 2,
                started_at: 2,
                last_launch_url: None,
                session_id: None,
                profile_id: Some("p-beta".into()),
            },
        )
        .unwrap();

        let mut sessions = vec![
            SessionInfo {
                session_id: "s-alpha".into(),
                profile_name: None,
                profile_id: "p-other".into(),
                pipe_name: "pipe".into(),
                extension_id: "ext".into(),
                extension_version: "1".into(),
                started_at: 1,
                last_heartbeat_at: 10,
                last_focused_at: 10,
                active_page: None,
            },
            SessionInfo {
                session_id: "s-beta".into(),
                profile_name: None,
                profile_id: "p-beta".into(),
                pipe_name: "pipe".into(),
                extension_id: "ext".into(),
                extension_version: "1".into(),
                started_at: 1,
                last_heartbeat_at: 10,
                last_focused_at: 10,
                active_page: None,
            },
        ];

        annotate_session_profile_names_from_data_dir(root.path(), &mut sessions).unwrap();
        assert_eq!(sessions[0].profile_name.as_deref(), Some("alpha"));
        assert_eq!(sessions[1].profile_name.as_deref(), Some("beta"));
    }
}
