use std::collections::{BTreeSet, HashMap, HashSet};
use std::env;
use std::fs::{self, File, OpenOptions};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::download::{download_user_js_prefs, ensure_download_dir, sweep_old_downloads};
use crate::firefox::{discover_firefox, firefox_discovery_error_message};
use crate::ipc::send_pipe_request;
use crate::protocol::{RpcRequest, RpcResponse, EXTENSION_ID};
use crate::redaction::redact_text;
use crate::session::{
    cleanup_stale_sessions, data_dir, ensure_runtime_dirs, list_sessions, now_ms, SessionInfo,
    SessionProfileKind,
};
use crate::setup::sibling_host_path;

pub const DEFAULT_PROFILE_NAME: &str = "Default";
const PROFILE_PROCESS_SCAN_TIMEOUT: Duration = Duration::from_secs(3);
const EPHEMERAL_MARKER_FILE: &str = ".pire-browser-session.json";
const EPHEMERAL_MARKER_SCHEMA_VERSION: u32 = 1;
const EPHEMERAL_ORPHAN_GRACE_MS: u64 = 60 * 60 * 1000;
const EPHEMERAL_SWEEP_INTERVAL_MS: u64 = 24 * 60 * 60 * 1000;
const SESSION_CLOSE_GRACE: Duration = Duration::from_millis(750);

#[derive(Debug, Clone)]
pub struct LaunchOptions {
    pub session_name: String,
    pub namespace: String,
    pub profile: Option<String>,
    pub url: Option<String>,
    pub firefox_path: Option<String>,
    pub download_dir: Option<PathBuf>,
    pub headless: bool,
    pub extra_args: Vec<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct LaunchResult {
    pub reused: bool,
    pub session: SessionInfo,
    pub profile_name: String,
    pub profile_kind: SessionProfileKind,
    pub profile_path: PathBuf,
    pub ephemeral_root: PathBuf,
    pub launcher_pid: u32,
    pub log_path: PathBuf,
    pub headless: bool,
    pub extra_args: Vec<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct EphemeralSessionMarker {
    schema_version: u32,
    nonce: String,
    namespace: String,
    session_name: String,
    created_at: u64,
    profile_kind: SessionProfileKind,
    profile_path: PathBuf,
    profile_owned: bool,
}

#[derive(Debug, Clone)]
struct ResolvedLaunchProfile {
    name: String,
    kind: SessionProfileKind,
    path: PathBuf,
    ephemeral_root: PathBuf,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EphemeralProfileReport {
    pub root: PathBuf,
    pub inspected: usize,
    pub orphaned: usize,
    pub active: usize,
    pub removed: usize,
    pub bytes: u64,
    pub errors: Vec<String>,
    pub throttled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedProfileInfo {
    pub name: String,
    pub path: PathBuf,
    pub exists: bool,
    pub metadata_path: PathBuf,
    pub launcher_live: bool,
    pub launcher_pid: Option<u32>,
    pub session_id: Option<String>,
    pub active_url: Option<String>,
    pub last_launch_url: Option<String>,
    pub started_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredFirefoxProfileInfo {
    pub name: String,
    pub path: PathBuf,
    pub exists: bool,
    pub is_default: bool,
    pub source_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct ProfileImportOptions {
    pub source: PathBuf,
    pub name: String,
    pub overwrite: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileImportResult {
    pub name: String,
    pub source_path: PathBuf,
    pub profile_path: PathBuf,
    pub metadata_path: PathBuf,
    pub copied_files: usize,
    pub skipped_entries: usize,
    pub overwritten: bool,
    pub warnings: Vec<ProfileImportWarning>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileImportWarning {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedProfileUsage {
    pub name: String,
    pub profile_path: PathBuf,
    pub profile_bytes: u64,
    pub regenerable_cache_bytes: u64,
    pub associated_download_path: PathBuf,
    pub associated_download_bytes: u64,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedProfileCleanResult {
    pub name: String,
    pub profile_path: PathBuf,
    pub dry_run: bool,
    pub removable_bytes: u64,
    pub removed_bytes: u64,
    pub entries: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedProfileDeleteResult {
    pub name: String,
    pub profile_path: PathBuf,
    pub metadata_path: PathBuf,
    pub removed_profile_bytes: u64,
    pub downloads_preserved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileImportMetadata {
    source_path: PathBuf,
    imported_at: u64,
    copied_files: usize,
    skipped_entries: usize,
    overwritten: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExtensionLaunchMode {
    WebExt,
    Xpi,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ExtensionLaunch {
    WebExt(PathBuf),
    Xpi(PathBuf),
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WebExtInvocation {
    executable: PathBuf,
    prefix_args: Vec<&'static str>,
    description: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherMetadata {
    #[serde(default)]
    pub namespace: String,
    #[serde(default)]
    pub session_name: String,
    pub profile_name: String,
    #[serde(default)]
    pub profile_kind: SessionProfileKind,
    pub profile_path: PathBuf,
    #[serde(default)]
    pub ephemeral_root: Option<PathBuf>,
    pub firefox_path: PathBuf,
    pub extension_source: PathBuf,
    pub launcher_pid: u32,
    pub started_at: u64,
    pub last_launch_url: Option<String>,
    pub session_id: Option<String>,
    pub profile_id: Option<String>,
    #[serde(default)]
    pub headless: bool,
}

pub fn launch_firefox(options: LaunchOptions) -> Result<LaunchResult> {
    ensure_runtime_dirs()?;
    validate_runtime_key("session name", &options.session_name)?;
    validate_runtime_key("namespace", &options.namespace)?;
    ensure_firefox_startup_policies_best_effort();
    let extension_launch_mode = extension_launch_mode_from_env()?;
    let allow_unsigned_xpi = allow_unsigned_xpi_from_env();

    let root = data_dir()?;
    let _ = sweep_ephemeral_profiles(false, now_ms());
    let metadata_dir =
        runtime_metadata_dir_from_data_dir(&root, &options.namespace, &options.session_name);
    let launcher_path = metadata_dir.join("launcher.json");
    let log_path = metadata_dir.join("web-ext.log");

    fs::create_dir_all(&metadata_dir)
        .with_context(|| format!("failed to create {}", metadata_dir.display()))?;
    restrict_current_user_dir_best_effort(&metadata_dir);

    cleanup_stale_sessions(now_ms())?;
    if let Some(mut metadata) = read_launcher_metadata(&launcher_path)? {
        if let Some(session) = live_session_for_metadata(&metadata)? {
            if !launch_request_matches_metadata(&options, &metadata) {
                bail!(
                    "session_launch_mismatch: session `{}` is already running with profile {} ({:?}); close it before changing profile mode",
                    options.session_name,
                    metadata.profile_name,
                    metadata.profile_kind
                );
            }
            if metadata.session_id.as_deref() != Some(session.session_id.as_str()) {
                metadata.session_id = Some(session.session_id.clone());
                metadata.profile_id = Some(session.profile_id.clone());
                let _ = write_launcher_metadata_atomic(&launcher_path, &metadata);
            }
            return Ok(LaunchResult {
                reused: true,
                session,
                profile_name: metadata.profile_name.clone(),
                profile_kind: metadata.profile_kind,
                profile_path: metadata.profile_path.clone(),
                ephemeral_root: metadata.ephemeral_root.clone().unwrap_or_default(),
                launcher_pid: metadata.launcher_pid,
                log_path,
                headless: metadata.headless,
                extra_args: Vec::new(),
                user_agent: None,
            });
        }

        if process_is_alive(metadata.launcher_pid) {
            let _ = terminate_process_best_effort(metadata.launcher_pid);
            let _ = terminate_profile_processes_best_effort(&metadata.profile_path);
            thread::sleep(Duration::from_millis(250));
        } else if profile_processes_are_alive(&metadata.profile_path) {
            let _ = terminate_profile_processes_best_effort(&metadata.profile_path);
            thread::sleep(Duration::from_millis(500));
        }

        if process_is_alive(metadata.launcher_pid)
            || profile_processes_are_alive(&metadata.profile_path)
        {
            bail!(
                "session {} appears to be running under launcher PID {} or an orphaned Firefox/web-ext process, but no live pire-browser session was found; close that Firefox/web-ext instance or check {}",
                options.session_name,
                metadata.launcher_pid,
                log_path.display()
            );
        }

        if let Some(ephemeral_root) = &metadata.ephemeral_root {
            cleanup_ephemeral_best_effort(ephemeral_root);
        }
        let _ = fs::remove_file(&launcher_path);
    }

    let resolved = resolve_launch_profile(&root, &options)?;
    let profile_path = resolved.path.clone();
    let download_dir = if let Some(path) = &options.download_dir {
        ensure_download_dir(path)?
    } else {
        let path = resolved.ephemeral_root.join("downloads");
        fs::create_dir_all(&path)
            .with_context(|| format!("failed to create {}", path.display()))?;
        path
    };
    let _ = sweep_old_downloads(now_ms());
    write_profile_startup_prefs(
        &profile_path,
        &download_dir,
        extension_launch_mode,
        allow_unsigned_xpi,
        options.user_agent.as_deref(),
    )?;
    restrict_current_user_dir_best_effort(&resolved.ephemeral_root);
    restrict_current_user_dir_best_effort(&profile_path);

    let baseline: HashSet<String> = list_sessions()?
        .into_iter()
        .map(|session| session.session_id)
        .collect();
    let firefox_path = discover_firefox(options.firefox_path.clone())
        .with_context(|| firefox_discovery_error_message(options.firefox_path.as_deref()))?;
    let extension_launch = resolve_extension_launch(extension_launch_mode)?;
    let extension_source = extension_launch.path().to_path_buf();
    let log = open_append(&log_path)?;
    let log_err = log.try_clone()?;

    let mut web_ext_launcher_description = None;
    let mut command = match &extension_launch {
        ExtensionLaunch::Xpi(xpi) => {
            install_profile_xpi(&profile_path, xpi)?;
            let mut command = Command::new(&firefox_path);
            command
                .arg("-profile")
                .arg(&profile_path)
                .arg("-no-remote")
                .arg("-new-instance")
                .stdin(Stdio::null())
                .stdout(Stdio::from(log))
                .stderr(Stdio::from(log_err));
            if options.headless {
                command.arg("-headless");
            }
            for arg in &options.extra_args {
                command.arg(arg);
            }
            if let Some(url) = &options.url {
                command.arg(url);
            }
            command
        }
        ExtensionLaunch::WebExt(extension_source) => {
            let invocation = web_ext_invocation(extension_source);
            web_ext_launcher_description = Some(invocation.description.clone());
            let mut command = Command::new(&invocation.executable);
            for arg in &invocation.prefix_args {
                command.arg(arg);
            }
            command
                .arg("run")
                .arg("--source-dir")
                .arg(extension_source)
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
            if options.headless {
                command.arg("--arg=-headless");
            }
            for arg in &options.extra_args {
                command.arg(format!("--arg={arg}"));
            }
            if let Some(url) = &options.url {
                command.arg("--start-url").arg(url);
            }
            command
        }
    };
    let launcher_name = extension_launch.launcher_name();

    configure_launcher_process(&mut command);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            cleanup_ephemeral_best_effort(&resolved.ephemeral_root);
            return Err(error).with_context(|| {
                if matches!(&extension_launch, ExtensionLaunch::WebExt(_)) {
                    format!(
                        "failed to start web-ext with {}; make sure the packaged web-ext dependency is installed or Node.js/npm are available",
                        web_ext_launcher_description
                            .as_deref()
                            .unwrap_or("web-ext")
                    )
                } else {
                    format!(
                        "failed to start Firefox directly with {}; check Firefox path and signed XPI setup",
                        firefox_path.display()
                    )
                }
            });
        }
    };
    let launcher_pid = child.id();

    let mut metadata = LauncherMetadata {
        namespace: options.namespace.clone(),
        session_name: options.session_name.clone(),
        profile_name: resolved.name.clone(),
        profile_kind: resolved.kind,
        profile_path: profile_path.clone(),
        ephemeral_root: Some(resolved.ephemeral_root.clone()),
        firefox_path,
        extension_source,
        launcher_pid,
        started_at: now_ms(),
        last_launch_url: options.url.clone(),
        session_id: None,
        profile_id: None,
        headless: options.headless,
    };
    write_launcher_metadata_atomic(&launcher_path, &metadata)?;

    let deadline = Instant::now() + launch_wait_timeout(extension_launch_mode);
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait()? {
            cleanup_ephemeral_best_effort(&resolved.ephemeral_root);
            bail!(
                "{}",
                launch_connect_failure_message(
                    launcher_name,
                    Some(&format!(
                        "{launcher_name} exited before pire-browser connected (status: {status})"
                    )),
                    &log_path
                )
            );
        }

        cleanup_stale_sessions(now_ms())?;
        let mut sessions: Vec<_> = list_sessions()?
            .into_iter()
            .filter(|session| !baseline.contains(&session.session_id))
            .collect();
        sessions.sort_by_key(|session| std::cmp::Reverse(session.last_focused_at));

        if let Some(session) = sessions.into_iter().next() {
            let session = configure_host_lifecycle(
                &session,
                &options,
                &resolved.name,
                resolved.kind,
                &profile_path,
                &resolved.ephemeral_root,
            )?;
            metadata.session_id = Some(session.session_id.clone());
            metadata.profile_id = Some(session.profile_id.clone());
            write_launcher_metadata_atomic(&launcher_path, &metadata)?;
            return Ok(LaunchResult {
                reused: false,
                session,
                profile_name: resolved.name,
                profile_kind: resolved.kind,
                profile_path,
                ephemeral_root: resolved.ephemeral_root,
                launcher_pid,
                log_path,
                headless: options.headless,
                extra_args: options.extra_args,
                user_agent: options.user_agent,
            });
        }

        thread::sleep(Duration::from_millis(500));
    }

    let _ = terminate_process_best_effort(launcher_pid);
    let _ = terminate_profile_processes_best_effort(&profile_path);
    cleanup_ephemeral_best_effort(&resolved.ephemeral_root);
    bail!(
        "{}",
        launch_connect_failure_message(
            launcher_name,
            Some("timed out waiting for pire-browser extension session"),
            &log_path
        )
    )
}

fn configure_host_lifecycle(
    session: &SessionInfo,
    options: &LaunchOptions,
    profile_name: &str,
    profile_kind: SessionProfileKind,
    profile_path: &Path,
    ephemeral_root: &Path,
) -> Result<SessionInfo> {
    let request = RpcRequest {
        id: Uuid::new_v4().to_string(),
        method: "host_configure_lifecycle".to_string(),
        params: serde_json::json!({
            "sessionName": options.session_name,
            "namespace": options.namespace,
            "profileName": profile_name,
            "profileKind": profile_kind,
            "profilePath": profile_path,
            "ephemeralRoot": ephemeral_root,
        }),
    };
    let line = serde_json::to_string(&request)?;
    let response = send_pipe_request(&session.pipe_name, &line)
        .context("failed to configure lifecycle on the native host")?;
    let response: RpcResponse = serde_json::from_str(&response)
        .context("native host returned invalid lifecycle configuration response")?;
    if !response.ok {
        let message = response
            .error
            .map(|error| format!("{}: {}", error.code, error.message))
            .unwrap_or_else(|| "unknown host lifecycle error".to_string());
        bail!("browser_launch_failed: {message}");
    }
    serde_json::from_value(
        response
            .result
            .context("native host lifecycle response omitted session metadata")?,
    )
    .context("native host lifecycle response had invalid session metadata")
}

fn validate_runtime_key(label: &str, value: &str) -> Result<()> {
    if value.is_empty()
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        bail!("invalid_args: {label} must contain only letters, numbers, hyphens, and underscores");
    }
    Ok(())
}

fn runtime_metadata_dir_from_data_dir(root: &Path, namespace: &str, session: &str) -> PathBuf {
    root.join("runtime")
        .join(namespace)
        .join("sessions")
        .join(session)
}

pub fn finalize_closed_session_best_effort(session: &SessionInfo) {
    let Ok(root) = data_dir() else {
        schedule_session_ephemeral_cleanup(session);
        return;
    };
    let launcher_path = runtime_metadata_dir_from_data_dir(
        &root,
        session.effective_namespace(),
        session.effective_session_name(),
    )
    .join("launcher.json");
    let metadata = read_launcher_metadata(&launcher_path)
        .ok()
        .flatten()
        .filter(|metadata| launcher_metadata_matches_session(metadata, session));

    if let Some(metadata) = metadata {
        let deadline = Instant::now() + SESSION_CLOSE_GRACE;
        while Instant::now() < deadline
            && (process_is_alive(metadata.launcher_pid)
                || profile_processes_are_alive(&metadata.profile_path))
        {
            thread::sleep(Duration::from_millis(50));
        }
        if profile_processes_are_alive(&metadata.profile_path) {
            let _ = terminate_profile_processes_best_effort(&metadata.profile_path);
        }
        if process_is_alive(metadata.launcher_pid) {
            let _ = terminate_process_best_effort(metadata.launcher_pid);
        }
        let settle_deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < settle_deadline
            && profile_processes_are_alive(&metadata.profile_path)
        {
            thread::sleep(Duration::from_millis(50));
        }
        if metadata.profile_kind == SessionProfileKind::Persistent
            && !profile_processes_are_alive(&metadata.profile_path)
        {
            remove_stale_profile_locks_best_effort(&metadata.profile_path);
        }
        let _ = fs::remove_file(&launcher_path);
    }

    schedule_session_ephemeral_cleanup(session);
}

fn launcher_metadata_matches_session(metadata: &LauncherMetadata, session: &SessionInfo) -> bool {
    let identity_matches = metadata.session_id.as_deref() == Some(session.session_id.as_str())
        || metadata.profile_id.as_deref() == Some(session.profile_id.as_str());
    let profile_matches = session
        .profile_path
        .as_ref()
        .map(|path| paths_equivalent(path, &metadata.profile_path))
        .unwrap_or(false);
    identity_matches
        && profile_matches
        && metadata.namespace == session.effective_namespace()
        && metadata.session_name == session.effective_session_name()
}

fn schedule_session_ephemeral_cleanup(session: &SessionInfo) {
    if let Some(ephemeral_root) = &session.ephemeral_root {
        cleanup_ephemeral_best_effort(ephemeral_root);
    }
}

fn remove_stale_profile_locks_best_effort(profile_path: &Path) {
    for name in ["parent.lock", ".parentlock", "lock"] {
        let path = profile_path.join(name);
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.is_file() || metadata.file_type().is_symlink() {
            let _ = fs::remove_file(path);
        }
    }
}

fn launch_request_matches_metadata(options: &LaunchOptions, metadata: &LauncherMetadata) -> bool {
    if metadata.namespace != options.namespace || metadata.session_name != options.session_name {
        return false;
    }
    match options.profile.as_deref() {
        None => metadata.profile_kind == SessionProfileKind::Ephemeral,
        Some(value) if profile_value_is_path_like(value) => {
            metadata.profile_kind == SessionProfileKind::Persistent
                && resolve_persistent_profile_path(value)
                    .map(|path| paths_equivalent(&path, &metadata.profile_path))
                    .unwrap_or(false)
        }
        Some(value) => {
            metadata.profile_kind == SessionProfileKind::Snapshot
                && metadata.profile_name.eq_ignore_ascii_case(value)
        }
    }
}

fn resolve_launch_profile(root: &Path, options: &LaunchOptions) -> Result<ResolvedLaunchProfile> {
    let ephemeral_root = create_ephemeral_session_root(&options.namespace, &options.session_name)?;
    let resolved = (|| -> Result<ResolvedLaunchProfile> {
        let (name, kind, path, profile_owned) = match options.profile.as_deref() {
            None => {
                let path = ephemeral_root.join("profile");
                fs::create_dir_all(&path)
                    .with_context(|| format!("failed to create {}", path.display()))?;
                (
                    "ephemeral".to_string(),
                    SessionProfileKind::Ephemeral,
                    path,
                    true,
                )
            }
            Some(value) if profile_value_is_path_like(value) => {
                let path = resolve_persistent_profile_path(value)?;
                fs::create_dir_all(&path)
                    .with_context(|| format!("failed to create {}", path.display()))?;
                let path = fs::canonicalize(&path).unwrap_or(path);
                (
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("persistent")
                        .to_string(),
                    SessionProfileKind::Persistent,
                    path,
                    false,
                )
            }
            Some(value) => {
                let (resolved_name, source) = resolve_named_profile_source(root, value)?;
                ensure_profile_source_is_unlocked(&source)?;
                let path = ephemeral_root.join("profile");
                fs::create_dir_all(&path)
                    .with_context(|| format!("failed to create {}", path.display()))?;
                let mut copied_files = 0usize;
                let mut skipped_entries = 0usize;
                copy_profile_tree(
                    &source,
                    &path,
                    Path::new(""),
                    &mut copied_files,
                    &mut skipped_entries,
                )?;
                (resolved_name, SessionProfileKind::Snapshot, path, true)
            }
        };

        write_ephemeral_marker(
            &ephemeral_root,
            EphemeralSessionMarker {
                schema_version: EPHEMERAL_MARKER_SCHEMA_VERSION,
                nonce: Uuid::new_v4().to_string(),
                namespace: options.namespace.clone(),
                session_name: options.session_name.clone(),
                created_at: now_ms(),
                profile_kind: kind,
                profile_path: path.clone(),
                profile_owned,
            },
        )?;

        Ok(ResolvedLaunchProfile {
            name,
            kind,
            path,
            ephemeral_root: ephemeral_root.clone(),
        })
    })();

    if resolved.is_err() {
        let _ = fs::remove_dir_all(&ephemeral_root);
    }
    resolved
}

fn resolve_named_profile_source(root: &Path, requested: &str) -> Result<(String, PathBuf)> {
    let discovered = discover_firefox_profiles()?;
    if let Some(profile) = discovered.into_iter().find(|profile| {
        profile.name.eq_ignore_ascii_case(requested)
            || profile
                .path
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.eq_ignore_ascii_case(requested))
                .unwrap_or(false)
    }) {
        if !profile.exists {
            bail!(
                "profile_not_found: Firefox profile `{}` is listed but its directory is missing",
                requested
            );
        }
        return Ok((profile.name, profile.path));
    }

    let managed_root = root.join("firefox-profiles");
    if managed_root.exists() {
        for entry in fs::read_dir(&managed_root)
            .with_context(|| format!("failed to read {}", managed_root.display()))?
        {
            let entry = entry?;
            if entry.file_type()?.is_dir()
                && entry
                    .file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(requested)
            {
                return Ok((
                    entry.file_name().to_string_lossy().to_string(),
                    entry.path(),
                ));
            }
        }
    }

    bail!(
        "profile_not_found: no discovered or managed Firefox profile matched `{requested}`; run `pire-browser profiles`"
    )
}

fn ensure_profile_source_is_unlocked(source: &Path) -> Result<()> {
    for lock_name in ["parent.lock", ".parentlock", "lock"] {
        if source.join(lock_name).exists() {
            bail!(
                "profile_locked: Firefox profile {} appears to be in use; close Firefox before taking a snapshot",
                source.display()
            );
        }
    }
    Ok(())
}

fn profile_value_is_path_like(value: &str) -> bool {
    value.starts_with('.')
        || value.starts_with('~')
        || value.starts_with('/')
        || value.starts_with('\\')
        || value.contains('/')
        || value.contains('\\')
        || (value.len() >= 2 && value.as_bytes()[1] == b':')
}

fn resolve_persistent_profile_path(value: &str) -> Result<PathBuf> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        bail!("invalid_args: --profile requires a non-empty value");
    }
    let expanded = if trimmed == "~" || trimmed.starts_with("~/") || trimmed.starts_with("~\\") {
        let home = env::var_os("HOME")
            .or_else(|| env::var_os("USERPROFILE"))
            .map(PathBuf::from)
            .context("could not resolve home directory for --profile")?;
        if trimmed == "~" {
            home
        } else {
            home.join(&trimmed[2..])
        }
    } else {
        PathBuf::from(trimmed)
    };
    let absolute = if expanded.is_absolute() {
        expanded
    } else {
        env::current_dir()?.join(expanded)
    };
    if absolute.parent().is_none() {
        bail!("invalid_args: --profile path cannot be a filesystem root");
    }
    Ok(absolute)
}

fn paths_equivalent(left: &Path, right: &Path) -> bool {
    let left = fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
    let right = fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
    if cfg!(windows) {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    } else {
        left == right
    }
}

fn ephemeral_sessions_root(namespace: &str) -> PathBuf {
    env::temp_dir()
        .join("pire-browser")
        .join(namespace)
        .join("sessions")
}

fn create_ephemeral_session_root(namespace: &str, _session_name: &str) -> Result<PathBuf> {
    let base = ephemeral_sessions_root(namespace);
    create_ephemeral_session_root_under(&base)
}

fn create_ephemeral_session_root_under(base: &Path) -> Result<PathBuf> {
    fs::create_dir_all(&base).with_context(|| format!("failed to create {}", base.display()))?;
    restrict_current_user_dir_best_effort(&base);
    let root = base.join(Uuid::new_v4().to_string());
    fs::create_dir(&root).with_context(|| format!("failed to create {}", root.display()))?;
    Ok(root)
}

fn write_ephemeral_marker(root: &Path, marker: EphemeralSessionMarker) -> Result<()> {
    let final_path = root.join(EPHEMERAL_MARKER_FILE);
    let temp_path = root.join(format!("{EPHEMERAL_MARKER_FILE}.tmp"));
    fs::write(&temp_path, serde_json::to_vec_pretty(&marker)?)
        .with_context(|| format!("failed to write {}", temp_path.display()))?;
    fs::rename(&temp_path, &final_path)
        .with_context(|| format!("failed to publish {}", final_path.display()))?;
    restrict_current_user_file_best_effort(&final_path);
    Ok(())
}

fn read_owned_ephemeral_marker(root: &Path) -> Result<EphemeralSessionMarker> {
    let body = fs::read_to_string(root.join(EPHEMERAL_MARKER_FILE))
        .with_context(|| format!("missing ephemeral ownership marker in {}", root.display()))?;
    let marker: EphemeralSessionMarker = serde_json::from_str(&body)
        .with_context(|| format!("invalid ephemeral ownership marker in {}", root.display()))?;
    if marker.schema_version != EPHEMERAL_MARKER_SCHEMA_VERSION || marker.nonce.is_empty() {
        bail!("invalid ephemeral ownership marker in {}", root.display());
    }
    if !valid_lifecycle_key(&marker.namespace) || !valid_lifecycle_key(&marker.session_name) {
        bail!("invalid ephemeral ownership marker in {}", root.display());
    }
    let base = ephemeral_sessions_root(&marker.namespace);
    validate_owned_ephemeral_marker(root, &base, &marker)?;
    Ok(marker)
}

fn validate_owned_ephemeral_marker(
    root: &Path,
    base: &Path,
    marker: &EphemeralSessionMarker,
) -> Result<()> {
    let canonical_root =
        fs::canonicalize(root).with_context(|| format!("failed to resolve {}", root.display()))?;
    let canonical_base =
        fs::canonicalize(base).with_context(|| "failed to resolve ephemeral sessions root")?;
    if canonical_root == canonical_base || !canonical_root.starts_with(&canonical_base) {
        bail!("refusing to clean unowned path {}", root.display());
    }
    if marker.profile_owned {
        let owned_profile_path = if marker.profile_path.exists() {
            fs::canonicalize(&marker.profile_path)
                .with_context(|| format!("failed to resolve {}", marker.profile_path.display()))?
        } else {
            let existing_ancestor = marker
                .profile_path
                .ancestors()
                .find(|path| path.exists())
                .context("ephemeral marker profile has no existing ancestor")?;
            fs::canonicalize(existing_ancestor)
                .with_context(|| format!("failed to resolve {}", existing_ancestor.display()))?
        };
        if !owned_profile_path.starts_with(&canonical_root) {
            bail!("ephemeral marker points outside its owned root");
        }
    }
    Ok(())
}

pub fn remove_owned_ephemeral_root(root: &Path) -> Result<()> {
    let marker = read_owned_ephemeral_marker(root)?;
    remove_owned_ephemeral_contents(root)?;
    let marker_path = root.join(EPHEMERAL_MARKER_FILE);
    fs::remove_file(&marker_path)
        .with_context(|| format!("failed to remove {}", marker_path.display()))?;
    if let Err(error) = fs::remove_dir(root) {
        let _ = write_ephemeral_marker(root, marker);
        return Err(error).with_context(|| format!("failed to remove {}", root.display()));
    }
    Ok(())
}

fn remove_owned_ephemeral_contents(root: &Path) -> Result<()> {
    for entry in fs::read_dir(root).with_context(|| format!("failed to read {}", root.display()))? {
        let entry = entry?;
        if entry.file_name() == EPHEMERAL_MARKER_FILE {
            continue;
        }
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .with_context(|| format!("failed to inspect {}", path.display()))?;
        if metadata.is_dir() && !metadata.file_type().is_symlink() {
            fs::remove_dir_all(&path)
                .with_context(|| format!("failed to remove {}", path.display()))?;
        } else {
            fs::remove_file(&path)
                .with_context(|| format!("failed to remove {}", path.display()))?;
        }
    }
    Ok(())
}

#[cfg(test)]
fn remove_owned_ephemeral_root_with_base(root: &Path, base: &Path) -> Result<()> {
    let body = fs::read_to_string(root.join(EPHEMERAL_MARKER_FILE))
        .with_context(|| format!("missing ephemeral ownership marker in {}", root.display()))?;
    let marker: EphemeralSessionMarker = serde_json::from_str(&body)
        .with_context(|| format!("invalid ephemeral ownership marker in {}", root.display()))?;
    if marker.schema_version != EPHEMERAL_MARKER_SCHEMA_VERSION
        || marker.nonce.is_empty()
        || !valid_lifecycle_key(&marker.namespace)
        || !valid_lifecycle_key(&marker.session_name)
    {
        bail!("invalid ephemeral ownership marker in {}", root.display());
    }
    validate_owned_ephemeral_marker(root, base, &marker)?;
    remove_owned_ephemeral_contents(root)?;
    fs::remove_file(root.join(EPHEMERAL_MARKER_FILE))?;
    fs::remove_dir(root).with_context(|| format!("failed to remove {}", root.display()))
}

fn valid_lifecycle_key(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn cleanup_ephemeral_best_effort(root: &Path) {
    if remove_owned_ephemeral_root(root).is_err() {
        let _ = spawn_ephemeral_cleanup_worker(root);
    }
}

pub fn run_ephemeral_cleanup_worker(root: &Path) -> Result<()> {
    let marker = read_owned_ephemeral_marker(root)?;
    let deadline = Instant::now() + Duration::from_secs(120);
    while Instant::now() < deadline {
        if !profile_processes_are_alive(&marker.profile_path) {
            for attempt in 0..8u64 {
                match remove_owned_ephemeral_root(root) {
                    Ok(()) => return Ok(()),
                    Err(_) => thread::sleep(Duration::from_millis(250 * (attempt + 1))),
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    bail!(
        "timed out cleaning ephemeral session root {}",
        root.display()
    )
}

pub fn spawn_ephemeral_cleanup_worker(root: &Path) -> Result<()> {
    let host_exe = sibling_host_path().context("failed to resolve native host executable")?;
    let mut command = Command::new(host_exe);
    command
        .arg("--cleanup-ephemeral")
        .arg(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    configure_launcher_process(&mut command);
    command
        .spawn()
        .context("failed to start ephemeral cleanup worker")?;
    Ok(())
}

pub fn inspect_ephemeral_profiles(now: u64) -> EphemeralProfileReport {
    inspect_or_sweep_ephemeral_profiles(false, now)
}

pub fn sweep_ephemeral_profiles(force: bool, now: u64) -> EphemeralProfileReport {
    if !force && ephemeral_sweep_is_throttled(now) {
        return EphemeralProfileReport {
            root: env::temp_dir().join("pire-browser"),
            throttled: true,
            ..EphemeralProfileReport::default()
        };
    }
    let mut report = inspect_or_sweep_ephemeral_profiles(true, now);
    if !force || report.errors.is_empty() {
        let _ = write_ephemeral_sweep_timestamp(now);
    }
    report.throttled = false;
    report
}

fn inspect_or_sweep_ephemeral_profiles(remove: bool, now: u64) -> EphemeralProfileReport {
    let root = env::temp_dir().join("pire-browser");
    let mut report = EphemeralProfileReport {
        root: root.clone(),
        ..EphemeralProfileReport::default()
    };
    if !root.exists() {
        return report;
    }
    let Ok(namespaces) = fs::read_dir(&root) else {
        report
            .errors
            .push(format!("failed to read {}", root.display()));
        return report;
    };
    for namespace in namespaces.flatten() {
        let sessions = namespace.path().join("sessions");
        let Ok(entries) = fs::read_dir(&sessions) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                continue;
            }
            report.inspected += 1;
            let marker = match read_owned_ephemeral_marker(&path) {
                Ok(marker) => marker,
                Err(error) => {
                    report.errors.push(error.to_string());
                    continue;
                }
            };
            if profile_processes_are_alive(&marker.profile_path) {
                report.active += 1;
                continue;
            }
            if now.saturating_sub(marker.created_at) < EPHEMERAL_ORPHAN_GRACE_MS {
                continue;
            }
            report.orphaned += 1;
            report.bytes = report.bytes.saturating_add(directory_size(&path));
            if remove {
                match remove_owned_ephemeral_root(&path) {
                    Ok(()) => report.removed += 1,
                    Err(error) => report.errors.push(error.to_string()),
                }
            }
        }
    }
    report
}

fn ephemeral_sweep_state_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("maintenance").join("ephemeral-sweep.json"))
}

fn ephemeral_sweep_is_throttled(now: u64) -> bool {
    let Ok(path) = ephemeral_sweep_state_path() else {
        return false;
    };
    let Some(last) = fs::read_to_string(path)
        .ok()
        .and_then(|body| serde_json::from_str::<serde_json::Value>(&body).ok())
        .and_then(|value| value.get("lastSweepAt").and_then(|value| value.as_u64()))
    else {
        return false;
    };
    now.saturating_sub(last) < EPHEMERAL_SWEEP_INTERVAL_MS
}

fn write_ephemeral_sweep_timestamp(now: u64) -> Result<()> {
    let path = ephemeral_sweep_state_path()?;
    let parent = path.parent().context("maintenance path has no parent")?;
    fs::create_dir_all(parent)?;
    let temp = path.with_extension("json.tmp");
    fs::write(
        &temp,
        serde_json::to_vec_pretty(&serde_json::json!({ "lastSweepAt": now }))?,
    )?;
    fs::rename(temp, path)?;
    Ok(())
}

fn directory_size(root: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(root) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| match fs::symlink_metadata(entry.path()) {
            Ok(metadata) if metadata.is_file() => metadata.len(),
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
                directory_size(&entry.path())
            }
            _ => 0,
        })
        .sum()
}

pub fn launch_result_text(result: &LaunchResult) -> String {
    let action = if result.reused { "reused" } else { "launched" };
    let mode = if result.headless {
        "headless"
    } else {
        "headed"
    };
    let mut text = format!(
        "pire-browser {action} Firefox profile {}\nSession: {}\nMode: {}\nProfile path: {}\nLauncher PID: {}\nLog: {}",
        result.profile_name,
        result.session.session_id,
        mode,
        result.profile_path.display(),
        result.launcher_pid,
        result.log_path.display()
    );
    if !result.extra_args.is_empty() {
        text.push_str(&format!("\nFirefox args: {}", result.extra_args.join(", ")));
    }
    if let Some(user_agent) = &result.user_agent {
        text.push_str(&format!("\nUser-Agent override: {user_agent}"));
    }
    text
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

pub fn list_managed_profiles() -> Result<Vec<ManagedProfileInfo>> {
    let root = data_dir()?;
    let mut names = BTreeSet::new();
    names.insert(DEFAULT_PROFILE_NAME.to_string());

    collect_profile_names_from_dir(&root.join("firefox-profiles"), &mut names)?;
    collect_profile_names_from_dir(&root.join("profiles"), &mut names)?;

    let mut profiles = Vec::new();
    for name in names {
        if validate_profile_name(&name).is_err() {
            continue;
        }
        let path = managed_profile_dir_from_data_dir(&root, &name);
        let metadata_path = launcher_metadata_path_from_data_dir(&root, &name);
        let metadata = read_launcher_metadata(&metadata_path)?;
        let live_session = metadata
            .as_ref()
            .and_then(|metadata| live_session_for_metadata(metadata).ok())
            .flatten();
        let launcher_pid = metadata.as_ref().map(|metadata| metadata.launcher_pid);
        let launcher_live = launcher_pid.map(process_is_alive).unwrap_or(false);
        let last_launch_url = metadata
            .as_ref()
            .and_then(|metadata| metadata.last_launch_url.clone());
        let started_at = metadata.as_ref().map(|metadata| metadata.started_at);
        profiles.push(ManagedProfileInfo {
            name,
            exists: path.exists(),
            path,
            metadata_path,
            launcher_live,
            launcher_pid,
            session_id: live_session
                .as_ref()
                .map(|session| session.session_id.clone()),
            active_url: live_session
                .as_ref()
                .and_then(|session| session.active_page.as_ref())
                .and_then(|page| page.url.clone()),
            last_launch_url,
            started_at,
        });
    }
    profiles.sort_by(|left, right| {
        (left.name != DEFAULT_PROFILE_NAME)
            .cmp(&(right.name != DEFAULT_PROFILE_NAME))
            .then_with(|| {
                left.name
                    .to_ascii_lowercase()
                    .cmp(&right.name.to_ascii_lowercase())
            })
    });
    Ok(profiles)
}

pub fn managed_profile_usage(name: &str) -> Result<ManagedProfileUsage> {
    validate_profile_name(name)?;
    let root = data_dir()?;
    let profile_path = managed_profile_dir_from_data_dir(&root, name);
    let associated_download_path = root.join("downloads").join(name);
    let active = managed_profile_is_active(&profile_path)?;
    Ok(ManagedProfileUsage {
        name: name.to_string(),
        profile_bytes: directory_size(&profile_path),
        regenerable_cache_bytes: regenerable_profile_entries(&profile_path)
            .iter()
            .map(|path| path_size(path))
            .sum(),
        associated_download_bytes: directory_size(&associated_download_path),
        profile_path,
        associated_download_path,
        active,
    })
}

pub fn all_managed_profile_usage() -> Result<Vec<ManagedProfileUsage>> {
    list_managed_profiles()?
        .into_iter()
        .filter(|profile| profile.exists)
        .map(|profile| managed_profile_usage(&profile.name))
        .collect()
}

pub fn clean_managed_profile_cache(name: &str, dry_run: bool) -> Result<ManagedProfileCleanResult> {
    let usage = managed_profile_usage(name)?;
    if !usage.profile_path.exists() {
        bail!("profile_not_found: managed profile `{name}` does not exist");
    }
    if usage.active {
        bail!("profile_in_use: managed profile `{name}` must be stopped before cache cleaning");
    }
    validate_managed_profile_path(&usage.profile_path, name)?;
    let entries = regenerable_profile_entries(&usage.profile_path);
    let removable_bytes = entries.iter().map(|path| path_size(path)).sum();
    if !dry_run {
        for path in &entries {
            let metadata = fs::symlink_metadata(path)
                .with_context(|| format!("failed to inspect {}", path.display()))?;
            if metadata.file_type().is_symlink() {
                bail!(
                    "refusing to remove symlink from managed profile: {}",
                    path.display()
                );
            }
            if metadata.is_dir() {
                fs::remove_dir_all(path)
                    .with_context(|| format!("failed to remove {}", path.display()))?;
            } else if metadata.is_file() {
                fs::remove_file(path)
                    .with_context(|| format!("failed to remove {}", path.display()))?;
            }
        }
    }
    Ok(ManagedProfileCleanResult {
        name: name.to_string(),
        profile_path: usage.profile_path,
        dry_run,
        removable_bytes,
        removed_bytes: if dry_run { 0 } else { removable_bytes },
        entries,
    })
}

pub fn delete_managed_profile(name: &str) -> Result<ManagedProfileDeleteResult> {
    let usage = managed_profile_usage(name)?;
    if !usage.profile_path.exists() {
        bail!("profile_not_found: managed profile `{name}` does not exist");
    }
    if usage.active {
        bail!("profile_in_use: managed profile `{name}` must be stopped before deletion");
    }
    validate_managed_profile_path(&usage.profile_path, name)?;
    let root = data_dir()?;
    let metadata_path = profile_metadata_dir_from_data_dir(&root, name);
    fs::remove_dir_all(&usage.profile_path)
        .with_context(|| format!("failed to remove {}", usage.profile_path.display()))?;
    if metadata_path.exists() {
        validate_managed_metadata_path(&metadata_path, name)?;
        fs::remove_dir_all(&metadata_path)
            .with_context(|| format!("failed to remove {}", metadata_path.display()))?;
    }
    Ok(ManagedProfileDeleteResult {
        name: name.to_string(),
        profile_path: usage.profile_path,
        metadata_path,
        removed_profile_bytes: usage.profile_bytes,
        downloads_preserved: usage.associated_download_path.exists(),
    })
}

fn managed_profile_is_active(profile_path: &Path) -> Result<bool> {
    if profile_processes_are_alive(profile_path) {
        return Ok(true);
    }
    let canonical = profile_path.canonicalize().ok();
    Ok(list_sessions()?.into_iter().any(|session| {
        session
            .profile_path
            .as_ref()
            .is_some_and(|path| paths_equivalent(path, profile_path))
            || canonical.as_ref().is_some_and(|profile| {
                session
                    .profile_path
                    .as_ref()
                    .and_then(|path| path.canonicalize().ok())
                    .as_ref()
                    == Some(profile)
            })
    }))
}

fn validate_managed_profile_path(path: &Path, name: &str) -> Result<()> {
    let root = data_dir()?.join("firefox-profiles");
    let expected = root.join(name);
    if path != expected {
        bail!("refusing to operate on a non-managed Firefox profile path");
    }
    let metadata = fs::symlink_metadata(path)
        .with_context(|| format!("failed to inspect {}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        bail!("refusing to operate on a symlink or non-directory managed profile");
    }
    let canonical_root = root
        .canonicalize()
        .with_context(|| format!("failed to resolve {}", root.display()))?;
    let canonical_path = path
        .canonicalize()
        .with_context(|| format!("failed to resolve {}", path.display()))?;
    if canonical_path == canonical_root || !canonical_path.starts_with(canonical_root) {
        bail!("refusing to operate outside the managed profile root");
    }
    Ok(())
}

fn validate_managed_metadata_path(path: &Path, name: &str) -> Result<()> {
    let root = data_dir()?.join("profiles");
    if path != root.join(name) {
        bail!("refusing to operate on non-managed profile metadata");
    }
    let metadata = fs::symlink_metadata(path)
        .with_context(|| format!("failed to inspect {}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        bail!("refusing to remove symlinked profile metadata");
    }
    Ok(())
}

fn regenerable_profile_entries(profile_path: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(profile_path) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).ok()?;
            if metadata.file_type().is_symlink() {
                return None;
            }
            is_regenerable_profile_entry(&entry.file_name(), metadata.is_dir()).then_some(path)
        })
        .collect()
}

fn is_regenerable_profile_entry(name: &std::ffi::OsStr, is_dir: bool) -> bool {
    let Some(name) = name.to_str() else {
        return false;
    };
    let lower = name.to_ascii_lowercase();
    if !is_dir {
        return matches!(
            lower.as_str(),
            "compatibility.ini" | "sessioncheckpoints.json" | "xulstore.json.tmp"
        );
    }
    matches!(
        lower.as_str(),
        "cache2"
            | "startupcache"
            | "jumplistcache"
            | "crashes"
            | "minidumps"
            | "datareporting"
            | "saved-telemetry-pings"
            | "shader-cache"
            | "thumbnails"
            | "safebrowsing"
    )
}

fn path_size(path: &Path) -> u64 {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() => metadata.len(),
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            directory_size(path)
        }
        _ => 0,
    }
}

pub fn discover_firefox_profiles() -> Result<Vec<DiscoveredFirefoxProfileInfo>> {
    let mut profiles = Vec::new();
    for root in firefox_profile_roots() {
        let ini_path = root.join("profiles.ini");
        let Ok(body) = fs::read_to_string(&ini_path) else {
            continue;
        };
        profiles.extend(parse_firefox_profiles_ini(&root, &ini_path, &body));
    }
    dedupe_and_sort_discovered_profiles(profiles)
}

pub fn import_firefox_profile(options: ProfileImportOptions) -> Result<ProfileImportResult> {
    ensure_runtime_dirs()?;
    validate_profile_name(&options.name)?;
    let requested_source = options.source.clone();
    let resolved_source = resolve_firefox_profile_source(&requested_source)?;
    let source = resolved_source.canonicalize().with_context(|| {
        format!(
            "profile_import_not_found: could not read {}",
            requested_source.display()
        )
    })?;
    if !source.is_dir() {
        bail!(
            "invalid_args: profile import source must be a Firefox profile directory: {}",
            source.display()
        );
    }
    validate_firefox_profile_source(&source)?;
    if source_has_lock_file(&source) {
        bail!(
            "profile_in_use: source profile {} appears to be in use; close Firefox before importing it",
            source.display()
        );
    }

    let root = data_dir()?;
    let profile_path = managed_profile_dir_from_data_dir(&root, &options.name);
    let metadata_dir = profile_metadata_dir_from_data_dir(&root, &options.name);
    let metadata_path = metadata_dir.join("profile-import.json");
    if let Ok(existing_source) = profile_path.canonicalize() {
        if existing_source == source {
            bail!("invalid_args: profile import source and destination are the same directory");
        }
        if source.starts_with(&existing_source) {
            bail!("invalid_args: profile import source must not be inside the managed destination");
        }
    }
    if live_session_for_profile_name(&options.name)?.is_some()
        || profile_processes_are_alive(&profile_path)
    {
        bail!(
            "profile_in_use: managed profile `{}` is running; close it before importing over it",
            options.name
        );
    }
    let destination_exists = profile_path.exists() && dir_has_entries(&profile_path)?;
    if destination_exists && !options.overwrite {
        bail!(
            "already_exists: managed profile `{}` already exists at {}; pass --overwrite to replace it",
            options.name,
            profile_path.display()
        );
    }
    if destination_exists {
        fs::remove_dir_all(&profile_path)
            .with_context(|| format!("failed to remove {}", profile_path.display()))?;
    }
    if metadata_dir.exists() {
        fs::remove_dir_all(&metadata_dir)
            .with_context(|| format!("failed to remove {}", metadata_dir.display()))?;
    }
    fs::create_dir_all(&profile_path)
        .with_context(|| format!("failed to create {}", profile_path.display()))?;
    fs::create_dir_all(&metadata_dir)
        .with_context(|| format!("failed to create {}", metadata_dir.display()))?;

    let mut copied_files = 0usize;
    let mut skipped_entries = 0usize;
    copy_profile_tree(
        &source,
        &profile_path,
        Path::new(""),
        &mut copied_files,
        &mut skipped_entries,
    )?;
    restrict_current_user_dir_best_effort(&profile_path);
    restrict_current_user_dir_best_effort(&metadata_dir);
    let metadata = ProfileImportMetadata {
        source_path: source.clone(),
        imported_at: now_ms(),
        copied_files,
        skipped_entries,
        overwritten: destination_exists,
    };
    fs::write(&metadata_path, serde_json::to_vec_pretty(&metadata)?)
        .with_context(|| format!("failed to write {}", metadata_path.display()))?;

    let mut warnings = vec![ProfileImportWarning {
        code: "PROFILE_IMPORT_COPY".to_string(),
        message: "Imported profile data is a managed copy. Future changes in the original Firefox profile do not sync automatically.".to_string(),
    }];
    if skipped_entries > 0 {
        warnings.push(ProfileImportWarning {
            code: "PROFILE_IMPORT_SKIPPED_VOLATILE_ENTRIES".to_string(),
            message: format!(
                "Skipped {skipped_entries} lock/cache/runtime artifact(s) while copying the Firefox profile."
            ),
        });
    }
    Ok(ProfileImportResult {
        name: options.name,
        source_path: source,
        profile_path,
        metadata_path,
        copied_files,
        skipped_entries,
        overwritten: destination_exists,
        warnings,
    })
}

fn firefox_profile_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    #[cfg(windows)]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            roots.push(PathBuf::from(appdata).join("Mozilla").join("Firefox"));
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            roots.push(
                PathBuf::from(home)
                    .join("Library")
                    .join("Application Support")
                    .join("Firefox"),
            );
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(home) = std::env::var_os("HOME") {
            roots.push(PathBuf::from(home).join(".mozilla").join("firefox"));
        }
    }

    roots
}

fn resolve_firefox_profile_source(source: &Path) -> Result<PathBuf> {
    if source.exists() || path_value_is_path_like(source) {
        return Ok(source.to_path_buf());
    }
    resolve_firefox_profile_source_from_profiles(source, discover_firefox_profiles()?)
}

fn resolve_firefox_profile_source_from_profiles(
    source: &Path,
    profiles: Vec<DiscoveredFirefoxProfileInfo>,
) -> Result<PathBuf> {
    let Some(query) = source
        .to_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(source.to_path_buf());
    };
    let matches: Vec<DiscoveredFirefoxProfileInfo> = profiles
        .into_iter()
        .filter(|profile| discovered_profile_matches(profile, query))
        .collect();
    match matches.as_slice() {
        [profile] => Ok(profile.path.clone()),
        [] => bail!(
            "profile_import_not_found: no discovered Firefox profile named `{query}`; run `pire-browser profiles` or pass a Firefox profile directory"
        ),
        many => {
            let names = many
                .iter()
                .map(|profile| format!("{} ({})", profile.name, profile.path.display()))
                .collect::<Vec<_>>()
                .join(", ");
            bail!(
                "profile_import_ambiguous: `{query}` matched multiple Firefox profiles: {names}; pass the exact profile directory"
            )
        }
    }
}

fn discovered_profile_matches(profile: &DiscoveredFirefoxProfileInfo, query: &str) -> bool {
    profile.name.eq_ignore_ascii_case(query)
        || profile
            .path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case(query))
            .unwrap_or(false)
        || profile.path.to_string_lossy().eq_ignore_ascii_case(query)
        || (profile.is_default && query.eq_ignore_ascii_case("Default"))
}

fn path_value_is_path_like(path: &Path) -> bool {
    let text = path.to_string_lossy();
    text.starts_with("~/")
        || text.starts_with("~\\")
        || text.starts_with("./")
        || text.starts_with(".\\")
        || text.starts_with("../")
        || text.starts_with("..\\")
        || text.starts_with('/')
        || text.starts_with('\\')
        || text.contains('/')
        || text.contains('\\')
        || text
            .as_bytes()
            .get(1)
            .copied()
            .map(|byte| byte == b':')
            .unwrap_or(false)
}

fn parse_firefox_profiles_ini(
    root: &Path,
    ini_path: &Path,
    body: &str,
) -> Vec<DiscoveredFirefoxProfileInfo> {
    let mut profiles = Vec::new();
    let mut section = String::new();
    let mut values: HashMap<String, String> = HashMap::new();

    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            flush_firefox_profile_section(root, ini_path, &section, &values, &mut profiles);
            section = trimmed
                .trim_start_matches('[')
                .trim_end_matches(']')
                .trim()
                .to_string();
            values.clear();
            continue;
        }
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        values.insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
    }
    flush_firefox_profile_section(root, ini_path, &section, &values, &mut profiles);
    profiles
}

fn flush_firefox_profile_section(
    root: &Path,
    ini_path: &Path,
    section: &str,
    values: &HashMap<String, String>,
    profiles: &mut Vec<DiscoveredFirefoxProfileInfo>,
) {
    if !section.to_ascii_lowercase().starts_with("profile") {
        return;
    }
    let Some(raw_path) = values.get("path").filter(|value| !value.trim().is_empty()) else {
        return;
    };
    let is_relative = values.get("isrelative").map(String::as_str).unwrap_or("1") != "0";
    let path = if is_relative {
        root.join(raw_path)
    } else {
        PathBuf::from(raw_path)
    };
    let name = values
        .get("name")
        .filter(|value| !value.trim().is_empty())
        .cloned()
        .or_else(|| {
            path.file_name()
                .and_then(|value| value.to_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| section.to_string());
    let is_default = values.get("default").map(String::as_str) == Some("1");
    profiles.push(DiscoveredFirefoxProfileInfo {
        name,
        exists: path.exists(),
        path,
        is_default,
        source_path: ini_path.to_path_buf(),
    });
}

fn dedupe_and_sort_discovered_profiles(
    profiles: Vec<DiscoveredFirefoxProfileInfo>,
) -> Result<Vec<DiscoveredFirefoxProfileInfo>> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for profile in profiles {
        let key = profile
            .path
            .canonicalize()
            .unwrap_or_else(|_| profile.path.clone())
            .to_string_lossy()
            .to_ascii_lowercase();
        if seen.insert(key) {
            deduped.push(profile);
        }
    }
    deduped.sort_by(|left, right| {
        (!left.is_default)
            .cmp(&(!right.is_default))
            .then_with(|| {
                left.name
                    .to_ascii_lowercase()
                    .cmp(&right.name.to_ascii_lowercase())
            })
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(deduped)
}

fn collect_profile_names_from_dir(dir: &Path, names: &mut BTreeSet<String>) -> Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).with_context(|| format!("failed to read {}", dir.display()))? {
        let Ok(entry) = entry else {
            continue;
        };
        if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            continue;
        }
        if let Some(name) = entry.file_name().to_str() {
            names.insert(name.to_string());
        }
    }
    Ok(())
}

fn validate_firefox_profile_source(source: &Path) -> Result<()> {
    let markers = [
        "prefs.js",
        "cookies.sqlite",
        "places.sqlite",
        "logins.json",
        "storage",
    ];
    if markers.iter().any(|marker| source.join(marker).exists()) {
        return Ok(());
    }
    bail!(
        "invalid_args: {} does not look like a Firefox profile directory; expected prefs.js, cookies.sqlite, places.sqlite, logins.json, or storage/",
        source.display()
    )
}

fn source_has_lock_file(source: &Path) -> bool {
    ["parent.lock", ".parentlock", "lock"]
        .iter()
        .any(|name| source.join(name).exists())
}

fn dir_has_entries(dir: &Path) -> Result<bool> {
    Ok(fs::read_dir(dir)
        .with_context(|| format!("failed to read {}", dir.display()))?
        .next()
        .is_some())
}

fn copy_profile_tree(
    source_root: &Path,
    destination_root: &Path,
    relative: &Path,
    copied_files: &mut usize,
    skipped_entries: &mut usize,
) -> Result<()> {
    let source = source_root.join(relative);
    let destination = destination_root.join(relative);
    fs::create_dir_all(&destination)
        .with_context(|| format!("failed to create {}", destination.display()))?;
    for entry in
        fs::read_dir(&source).with_context(|| format!("failed to read {}", source.display()))?
    {
        let entry =
            entry.with_context(|| format!("failed to read entry in {}", source.display()))?;
        let file_name = entry.file_name();
        let child_relative = relative.join(&file_name);
        let metadata = fs::symlink_metadata(entry.path())
            .with_context(|| format!("failed to inspect {}", entry.path().display()))?;
        if should_skip_profile_import_entry(&child_relative, metadata.is_dir())
            || metadata.file_type().is_symlink()
        {
            *skipped_entries += 1;
            continue;
        }
        if metadata.is_dir() {
            copy_profile_tree(
                source_root,
                destination_root,
                &child_relative,
                copied_files,
                skipped_entries,
            )?;
        } else if metadata.is_file() {
            let target = destination_root.join(&child_relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("failed to create {}", parent.display()))?;
            }
            fs::copy(entry.path(), &target).with_context(|| {
                format!(
                    "failed to copy {} to {}; close Firefox and retry if the source profile is running",
                    entry.path().display(),
                    target.display()
                )
            })?;
            *copied_files += 1;
        } else {
            *skipped_entries += 1;
        }
    }
    Ok(())
}

fn should_skip_profile_import_entry(relative: &Path, is_dir: bool) -> bool {
    let Some(file_name) = relative.file_name().and_then(|name| name.to_str()) else {
        return true;
    };
    let lower = file_name.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "parent.lock"
            | ".parentlock"
            | "lock"
            | "compatibility.ini"
            | "sessioncheckpoints.json"
            | "xulstore.json.tmp"
    ) {
        return true;
    }
    if is_dir
        && matches!(
            lower.as_str(),
            "cache2"
                | "startupcache"
                | "jumplistcache"
                | "crashes"
                | "minidumps"
                | "datareporting"
                | "saved-telemetry-pings"
                | "shader-cache"
                | "thumbnails"
                | "safebrowsing"
        )
    {
        return true;
    }
    false
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
            apply_launcher_metadata_to_session(&mut session, metadata);
            return Ok(Some(session));
        }
    }

    if let Some(profile_id) = metadata.profile_id.as_deref() {
        if let Some(mut session) = sessions
            .into_iter()
            .find(|session| session.profile_id == profile_id)
        {
            apply_launcher_metadata_to_session(&mut session, metadata);
            return Ok(Some(session));
        }
    }

    Ok(None)
}

fn apply_launcher_metadata_to_session(session: &mut SessionInfo, metadata: &LauncherMetadata) {
    session.session_name = Some(metadata.session_name.clone());
    session.namespace = Some(metadata.namespace.clone());
    session.profile_name = Some(metadata.profile_name.clone());
    session.profile_kind = Some(metadata.profile_kind);
    session.profile_path = Some(metadata.profile_path.clone());
    session.ephemeral_root = metadata.ephemeral_root.clone();
}

fn discover_extension_source() -> Result<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(extension_dir) =
        extension_source_from_env(std::env::var_os("PIRE_BROWSER_EXTENSION_DIR"))
    {
        candidates.push(extension_dir);
    }
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

fn web_ext_invocation(extension_source: &Path) -> WebExtInvocation {
    let package_root = extension_source.parent().unwrap_or_else(|| Path::new("."));
    web_ext_invocation_for_platform(package_root, cfg!(windows), npx_command())
}

fn web_ext_invocation_for_platform(
    package_root: &Path,
    windows: bool,
    npx: PathBuf,
) -> WebExtInvocation {
    if let Some(local) = local_web_ext_binary_for_platform(package_root, windows) {
        return WebExtInvocation {
            executable: local.clone(),
            prefix_args: Vec::new(),
            description: format!("local web-ext at {}", local.display()),
        };
    }

    WebExtInvocation {
        executable: npx.clone(),
        prefix_args: vec!["--yes", "web-ext"],
        description: format!("{} --yes web-ext", npx.display()),
    }
}

fn local_web_ext_binary_for_platform(package_root: &Path, windows: bool) -> Option<PathBuf> {
    let binary = if windows { "web-ext.cmd" } else { "web-ext" };
    let candidate = package_root.join("node_modules").join(".bin").join(binary);
    candidate.exists().then_some(candidate)
}

fn extension_source_from_env(value: Option<std::ffi::OsString>) -> Option<PathBuf> {
    let path = PathBuf::from(value?);
    path.join("manifest.json").exists().then_some(path)
}

impl ExtensionLaunch {
    fn path(&self) -> &Path {
        match self {
            ExtensionLaunch::WebExt(path) | ExtensionLaunch::Xpi(path) => path,
        }
    }

    fn launcher_name(&self) -> &'static str {
        match self {
            ExtensionLaunch::WebExt(_) => "web-ext",
            ExtensionLaunch::Xpi(_) => "Firefox",
        }
    }
}

fn extension_launch_mode_from_env() -> Result<ExtensionLaunchMode> {
    parse_extension_launch_mode(std::env::var("PIRE_BROWSER_EXTENSION_MODE").ok().as_deref())
}

fn parse_extension_launch_mode(value: Option<&str>) -> Result<ExtensionLaunchMode> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(ExtensionLaunchMode::WebExt),
        Some("web-ext") => Ok(ExtensionLaunchMode::WebExt),
        Some("xpi") => Ok(ExtensionLaunchMode::Xpi),
        Some(value) => {
            bail!("invalid PIRE_BROWSER_EXTENSION_MODE={value:?}; expected `web-ext` or `xpi`")
        }
    }
}

fn allow_unsigned_xpi_from_env() -> bool {
    matches!(
        std::env::var("PIRE_BROWSER_ALLOW_UNSIGNED_XPI")
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn launch_wait_timeout(mode: ExtensionLaunchMode) -> Duration {
    launch_wait_timeout_from_env(
        mode,
        std::env::var("PIRE_BROWSER_LAUNCH_TIMEOUT_MS")
            .ok()
            .as_deref(),
    )
}

fn launch_wait_timeout_from_env(mode: ExtensionLaunchMode, value: Option<&str>) -> Duration {
    let default_ms = match mode {
        ExtensionLaunchMode::WebExt => 180_000,
        ExtensionLaunchMode::Xpi => 60_000,
    };
    let millis = value
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default_ms);
    Duration::from_millis(millis)
}

fn resolve_extension_launch(mode: ExtensionLaunchMode) -> Result<ExtensionLaunch> {
    match mode {
        ExtensionLaunchMode::WebExt => {
            choose_extension_launch(mode, Some(discover_extension_source()?), None)
        }
        ExtensionLaunchMode::Xpi => choose_extension_launch(mode, None, discover_extension_xpi()),
    }
}

fn choose_extension_launch(
    mode: ExtensionLaunchMode,
    extension_source: Option<PathBuf>,
    extension_xpi: Option<PathBuf>,
) -> Result<ExtensionLaunch> {
    match mode {
        ExtensionLaunchMode::WebExt => extension_source
            .map(ExtensionLaunch::WebExt)
            .context("could not locate extension source directory; run from the repo or install extension files next to the binary"),
        ExtensionLaunchMode::Xpi => extension_xpi
            .map(ExtensionLaunch::Xpi)
            .context("PIRE_BROWSER_EXTENSION_MODE=xpi requires extension/pire-browser.xpi next to the repo or installed binary"),
    }
}

fn discover_extension_xpi() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(extension_dir) =
        extension_source_from_env(std::env::var_os("PIRE_BROWSER_EXTENSION_DIR"))
    {
        candidates.push(extension_dir.join("pire-browser.xpi"));
    }
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("extension").join("pire-browser.xpi"));
    }
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors() {
            candidates.push(ancestor.join("extension").join("pire-browser.xpi"));
        }
    }
    candidates.into_iter().find(|candidate| candidate.exists())
}

fn install_profile_xpi(profile_path: &Path, xpi: &Path) -> Result<()> {
    let extensions_dir = profile_path.join("extensions");
    fs::create_dir_all(&extensions_dir)?;
    let target = extensions_dir.join(format!("{EXTENSION_ID}.xpi"));
    fs::copy(xpi, &target).with_context(|| {
        format!(
            "failed to install pire-browser extension {} into {}",
            xpi.display(),
            target.display()
        )
    })?;
    Ok(())
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

fn launch_connect_failure_message(
    launcher_name: &str,
    summary: Option<&str>,
    log_path: &Path,
) -> String {
    let mut text = String::new();
    text.push_str(summary.unwrap_or("pire-browser could not connect to the Firefox extension"));
    text.push_str(&format!("\nLog: {}", log_path.display()));
    text.push_str("\nNext actions:");
    text.push_str("\n- Run `pire-browser doctor --json` and follow `data.nextActions`.");
    text.push_str("\n- Run `pire-browser install` to refresh Native Messaging setup.");
    text.push_str("\n- Close managed Firefox/web-ext processes for this profile, then retry.");
    if launcher_name == "web-ext" {
        text.push_str("\n- If `web-ext` failed, reinstall `pire-browser` with normal dependencies; source checkouts can run `npm install`.");
    }
    if let Some(tail) = redacted_log_tail(log_path, 6) {
        text.push_str(&format!("\nRecent {launcher_name} log:\n{tail}"));
    }
    text
}

fn redacted_log_tail(path: &Path, max_lines: usize) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let lines: Vec<_> = content
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.trim().is_empty())
        .collect();
    if lines.is_empty() {
        return None;
    }
    let start = lines.len().saturating_sub(max_lines);
    let tail = lines[start..].join("\n");
    Some(redact_text(&tail))
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
fn hide_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x08000000);
}

#[cfg(not(windows))]
fn hide_window(_command: &mut Command) {}

#[cfg(windows)]
const CREATE_NO_WINDOW_FLAG: u32 = 0x08000000;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP_FLAG: u32 = 0x00000200;
#[cfg(windows)]
const DETACHED_PROCESS_FLAG: u32 = 0x00000008;

#[cfg(windows)]
fn configure_launcher_process(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(launcher_creation_flags());
}

#[cfg(windows)]
fn launcher_creation_flags() -> u32 {
    CREATE_NO_WINDOW_FLAG | CREATE_NEW_PROCESS_GROUP_FLAG | DETACHED_PROCESS_FLAG
}

#[cfg(not(windows))]
fn configure_launcher_process(_command: &mut Command) {}

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
fn process_is_alive(pid: u32) -> bool {
    #[cfg(unix)]
    unsafe {
        libc::kill(pid as i32, 0) == 0
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

fn profile_processes_are_alive(profile_path: &Path) -> bool {
    !profile_process_ids(profile_path).is_empty()
}

fn terminate_profile_processes_best_effort(profile_path: &Path) -> bool {
    let current_pid = std::process::id();
    let mut terminated = false;
    for pid in profile_process_ids(profile_path) {
        if pid == current_pid {
            continue;
        }
        terminated |= terminate_process_best_effort(pid);
    }
    terminated
}

#[cfg(windows)]
fn profile_process_ids(profile_path: &Path) -> Vec<u32> {
    let script = r#"
$needle = [Environment]::GetEnvironmentVariable('PIRE_BROWSER_PROFILE_CLEANUP_NEEDLE')
if ([string]::IsNullOrEmpty($needle)) { exit 0 }
Get-CimInstance Win32_Process |
  Where-Object {
    $cmd = $_.CommandLine
    if ([string]::IsNullOrEmpty($cmd)) { return $false }
    $matchesNeedle = $cmd.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0
    $name = $_.Name
    $isTarget = $name -eq 'firefox.exe' -or (($name -eq 'node.exe') -and ($cmd -match 'web-ext'))
    $matchesNeedle -and $isTarget
  } |
  ForEach-Object { Write-Output $_.ProcessId }
"#;
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env(
            "PIRE_BROWSER_PROFILE_CLEANUP_NEEDLE",
            profile_path.display().to_string(),
        );
    let Ok(Some(output)) = command_output_with_timeout(command, PROFILE_PROCESS_SCAN_TIMEOUT)
    else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect()
}

#[cfg(all(unix, not(windows)))]
fn profile_process_ids(profile_path: &Path) -> Vec<u32> {
    let needle = profile_path.display().to_string();
    if needle.is_empty() {
        return Vec::new();
    }
    let mut command = Command::new("ps");
    command.args(["-eo", "pid,args"]);
    let Ok(Some(output)) = command_output_with_timeout(command, PROFILE_PROCESS_SCAN_TIMEOUT)
    else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let line = line.trim_start();
            let (pid, command_line) = line.split_once(char::is_whitespace)?;
            if profile_process_command_matches(command_line, &needle) {
                pid.trim().parse::<u32>().ok()
            } else {
                None
            }
        })
        .collect()
}

#[cfg(not(any(windows, unix)))]
fn profile_process_ids(_profile_path: &Path) -> Vec<u32> {
    Vec::new()
}

#[cfg(test)]
fn profile_process_command_matches(command_line: &str, profile_path: &str) -> bool {
    profile_process_command_matches_impl(command_line, profile_path)
}

#[cfg(all(unix, not(windows)))]
fn profile_process_command_matches(command_line: &str, profile_path: &str) -> bool {
    profile_process_command_matches_impl(command_line, profile_path)
}

#[cfg(any(test, all(unix, not(windows))))]
fn profile_process_command_matches_impl(command_line: &str, profile_path: &str) -> bool {
    if profile_path.is_empty() || !command_line.contains(profile_path) {
        return false;
    }
    let lowered = command_line.to_ascii_lowercase();
    let lowered_profile = profile_path.to_ascii_lowercase();
    let launcher_text = lowered.replace(&lowered_profile, "");
    launcher_text.contains("firefox")
        || (launcher_text.contains("node") && launcher_text.contains("web-ext"))
}

fn command_output_with_timeout(
    mut command: Command,
    timeout: Duration,
) -> std::io::Result<Option<Output>> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn()?;
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait()? {
            let mut stdout = Vec::new();
            let mut stderr = Vec::new();
            if let Some(mut pipe) = child.stdout.take() {
                pipe.read_to_end(&mut stdout)?;
            }
            if let Some(mut pipe) = child.stderr.take() {
                pipe.read_to_end(&mut stderr)?;
            }
            return Ok(Some(Output {
                status,
                stdout,
                stderr,
            }));
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(None);
        }
        thread::sleep(Duration::from_millis(25));
    }
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
fn terminate_process_best_effort(pid: u32) -> bool {
    #[cfg(unix)]
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM) == 0
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

fn write_profile_startup_prefs(
    profile_path: &Path,
    download_dir: &Path,
    extension_launch_mode: ExtensionLaunchMode,
    allow_unsigned_xpi: bool,
    user_agent: Option<&str>,
) -> Result<()> {
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
{}
{}
{END}
"#,
        extension_user_js_prefs(extension_launch_mode, allow_unsigned_xpi),
        download_user_js_prefs(download_dir),
        user_agent_user_js_pref(user_agent)
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

fn user_agent_user_js_pref(user_agent: Option<&str>) -> String {
    let Some(user_agent) = user_agent.map(str::trim).filter(|value| !value.is_empty()) else {
        return String::new();
    };
    format!(
        "user_pref(\"general.useragent.override\", \"{}\");",
        user_js_string(user_agent)
    )
}

fn extension_user_js_prefs(
    extension_launch_mode: ExtensionLaunchMode,
    allow_unsigned_xpi: bool,
) -> String {
    if extension_launch_mode != ExtensionLaunchMode::Xpi {
        return String::new();
    }

    let mut prefs = String::from("user_pref(\"extensions.autoDisableScopes\", 0);\n");
    if allow_unsigned_xpi {
        prefs.push_str("user_pref(\"xpinstall.signatures.required\", false);\n");
    }
    prefs
}

fn user_js_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
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

#[cfg(unix)]
fn restrict_current_user_dir_best_effort(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
}

#[cfg(not(any(windows, unix)))]
fn restrict_current_user_dir_best_effort(_path: &Path) {}

#[cfg(unix)]
fn restrict_current_user_file_best_effort(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_current_user_file_best_effort(_path: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_marker(
        profile_path: PathBuf,
        profile_owned: bool,
        session_name: &str,
    ) -> EphemeralSessionMarker {
        EphemeralSessionMarker {
            schema_version: EPHEMERAL_MARKER_SCHEMA_VERSION,
            nonce: Uuid::new_v4().to_string(),
            namespace: "test".to_string(),
            session_name: session_name.to_string(),
            created_at: now_ms(),
            profile_kind: if profile_owned {
                SessionProfileKind::Ephemeral
            } else {
                SessionProfileKind::Persistent
            },
            profile_path,
            profile_owned,
        }
    }

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
    fn marked_ephemeral_roots_are_removed_without_storage_growth() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("controlled").join("sessions");

        for index in 0..100 {
            let root = create_ephemeral_session_root_under(&base).unwrap();
            let profile = root.join("profile");
            fs::create_dir_all(&profile).unwrap();
            fs::write(profile.join("payload.bin"), vec![0u8; 1024]).unwrap();
            write_ephemeral_marker(
                &root,
                test_marker(profile, true, &format!("session-{index}")),
            )
            .unwrap();
            remove_owned_ephemeral_root_with_base(&root, &base).unwrap();
        }

        assert_eq!(fs::read_dir(&base).unwrap().count(), 0);
    }

    #[test]
    fn ephemeral_content_cleanup_preserves_ownership_marker_for_retries() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("session");
        let profile = root.join("profile");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("payload.bin"), b"payload").unwrap();
        write_ephemeral_marker(&root, test_marker(profile.clone(), true, "retry-test")).unwrap();

        remove_owned_ephemeral_contents(&root).unwrap();

        assert!(root.join(EPHEMERAL_MARKER_FILE).exists());
        assert!(!profile.exists());
    }

    #[test]
    fn ephemeral_cleanup_rejects_paths_outside_the_controlled_root() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("controlled");
        let outside = temp.path().join("outside");
        fs::create_dir_all(&base).unwrap();
        fs::create_dir_all(outside.join("profile")).unwrap();
        let marker = test_marker(outside.join("profile"), true, "outside");

        assert!(validate_owned_ephemeral_marker(&outside, &base, &marker).is_err());
        assert!(outside.exists());
    }

    #[test]
    fn ephemeral_cleanup_rejects_owned_profile_traversal() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("controlled");
        let root = base.join("session");
        let outside_profile = temp.path().join("persistent-profile");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside_profile).unwrap();
        let marker = test_marker(outside_profile, true, "traversal");

        assert!(validate_owned_ephemeral_marker(&root, &base, &marker).is_err());
    }

    #[test]
    fn cleanup_removes_only_the_wrapper_for_persistent_profiles() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("controlled");
        let root = create_ephemeral_session_root_under(&base).unwrap();
        let persistent = temp.path().join("persistent-profile");
        fs::create_dir_all(&persistent).unwrap();
        fs::write(persistent.join("cookies.sqlite"), b"keep").unwrap();
        write_ephemeral_marker(&root, test_marker(persistent.clone(), false, "durable")).unwrap();

        remove_owned_ephemeral_root_with_base(&root, &base).unwrap();

        assert!(!root.exists());
        assert_eq!(
            fs::read(persistent.join("cookies.sqlite")).unwrap(),
            b"keep"
        );
    }

    #[cfg(unix)]
    #[test]
    fn ephemeral_cleanup_rejects_symlinked_roots() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("controlled");
        let outside = temp.path().join("outside");
        let link = base.join("linked-session");
        fs::create_dir_all(&base).unwrap();
        fs::create_dir_all(outside.join("profile")).unwrap();
        write_ephemeral_marker(
            &outside,
            test_marker(outside.join("profile"), true, "linked"),
        )
        .unwrap();
        symlink(&outside, &link).unwrap();

        assert!(remove_owned_ephemeral_root_with_base(&link, &base).is_err());
        assert!(outside.exists());
    }

    #[test]
    fn profile_cache_allowlist_preserves_durable_browser_state() {
        let temp = tempfile::tempdir().unwrap();
        let profile = temp.path();
        for directory in [
            "cache2",
            "startupCache",
            "safebrowsing",
            "storage",
            "remote-settings",
            "extensions",
        ] {
            fs::create_dir_all(profile.join(directory)).unwrap();
            fs::write(profile.join(directory).join("value"), directory).unwrap();
        }
        fs::write(profile.join("compatibility.ini"), b"cache").unwrap();
        fs::write(profile.join("cookies.sqlite"), b"cookies").unwrap();

        let names = regenerable_profile_entries(profile)
            .into_iter()
            .filter_map(|path| {
                path.file_name()
                    .map(|name| name.to_string_lossy().to_string())
            })
            .collect::<Vec<_>>();

        assert!(names.contains(&"cache2".to_string()));
        assert!(names.contains(&"startupCache".to_string()));
        assert!(names.contains(&"safebrowsing".to_string()));
        assert!(names.contains(&"compatibility.ini".to_string()));
        for preserved in ["storage", "remote-settings", "extensions", "cookies.sqlite"] {
            assert!(!names.contains(&preserved.to_string()), "{preserved}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn launcher_process_flags_detach_web_ext_on_windows() {
        let flags = launcher_creation_flags();
        assert_ne!(flags & CREATE_NO_WINDOW_FLAG, 0);
        assert_ne!(flags & CREATE_NEW_PROCESS_GROUP_FLAG, 0);
        assert_ne!(flags & DETACHED_PROCESS_FLAG, 0);
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
    fn parses_extension_launch_mode_conservatively() {
        assert_eq!(
            parse_extension_launch_mode(None).unwrap(),
            ExtensionLaunchMode::WebExt
        );
        assert_eq!(
            parse_extension_launch_mode(Some("")).unwrap(),
            ExtensionLaunchMode::WebExt
        );
        assert_eq!(
            parse_extension_launch_mode(Some("web-ext")).unwrap(),
            ExtensionLaunchMode::WebExt
        );
        assert_eq!(
            parse_extension_launch_mode(Some("xpi")).unwrap(),
            ExtensionLaunchMode::Xpi
        );
        assert!(parse_extension_launch_mode(Some("direct")).is_err());
    }

    #[test]
    fn web_ext_mode_ignores_available_xpi() {
        let source = PathBuf::from("extension");
        let xpi = PathBuf::from("extension/pire-browser.xpi");
        let selected =
            choose_extension_launch(ExtensionLaunchMode::WebExt, Some(source.clone()), Some(xpi))
                .unwrap();
        assert_eq!(selected, ExtensionLaunch::WebExt(source));
    }

    #[test]
    fn web_ext_invocation_prefers_package_local_binary() {
        let root = tempfile::tempdir().unwrap();
        let package_root = root.path();
        let local_bin = package_root
            .join("node_modules")
            .join(".bin")
            .join("web-ext");
        fs::create_dir_all(local_bin.parent().unwrap()).unwrap();
        fs::write(&local_bin, "web-ext").unwrap();

        let invocation = web_ext_invocation_for_platform(package_root, false, PathBuf::from("npx"));

        assert_eq!(invocation.executable, local_bin);
        assert!(invocation.prefix_args.is_empty());
        assert!(invocation.description.contains("local web-ext"));
    }

    #[test]
    fn web_ext_invocation_uses_windows_cmd_binary() {
        let root = tempfile::tempdir().unwrap();
        let package_root = root.path();
        let local_bin = package_root
            .join("node_modules")
            .join(".bin")
            .join("web-ext.cmd");
        fs::create_dir_all(local_bin.parent().unwrap()).unwrap();
        fs::write(&local_bin, "web-ext").unwrap();

        let invocation =
            web_ext_invocation_for_platform(package_root, true, PathBuf::from("npx.cmd"));

        assert_eq!(invocation.executable, local_bin);
        assert!(invocation.prefix_args.is_empty());
    }

    #[test]
    fn web_ext_invocation_falls_back_to_npx_when_local_binary_is_missing() {
        let root = tempfile::tempdir().unwrap();
        let invocation = web_ext_invocation_for_platform(root.path(), false, PathBuf::from("npx"));

        assert_eq!(invocation.executable, PathBuf::from("npx"));
        assert_eq!(invocation.prefix_args, vec!["--yes", "web-ext"]);
        assert!(invocation.description.contains("--yes web-ext"));
    }

    #[test]
    fn xpi_mode_requires_packaged_xpi() {
        assert!(choose_extension_launch(ExtensionLaunchMode::Xpi, None, None).is_err());
        let xpi = PathBuf::from("extension/pire-browser.xpi");
        let selected =
            choose_extension_launch(ExtensionLaunchMode::Xpi, None, Some(xpi.clone())).unwrap();
        assert_eq!(selected, ExtensionLaunch::Xpi(xpi));
    }

    #[test]
    fn launch_timeout_defaults_allow_cold_web_ext_startup() {
        assert_eq!(
            launch_wait_timeout_from_env(ExtensionLaunchMode::WebExt, None),
            Duration::from_secs(180)
        );
        assert_eq!(
            launch_wait_timeout_from_env(ExtensionLaunchMode::Xpi, None),
            Duration::from_secs(60)
        );
        assert_eq!(
            launch_wait_timeout_from_env(ExtensionLaunchMode::WebExt, Some("120000")),
            Duration::from_secs(120)
        );
    }

    #[test]
    fn launch_connect_failure_message_reports_next_actions_and_redacted_log_tail() {
        let root = tempfile::tempdir().unwrap();
        let log_path = root.path().join("web-ext.log");
        fs::write(
            &log_path,
            "starting web-ext\nAuthorization: Bearer sk-test-secret\nfailed to launch\n",
        )
        .unwrap();

        let message = launch_connect_failure_message(
            "web-ext",
            Some("web-ext exited before pire-browser connected (status: 1)"),
            &log_path,
        );

        assert!(message.contains("web-ext exited before pire-browser connected"));
        assert!(message.contains("Log: "));
        assert!(message.contains("pire-browser doctor --json"));
        assert!(message.contains("pire-browser install"));
        assert!(message.contains("reinstall `pire-browser` with normal dependencies"));
        assert!(message.contains("Recent web-ext log:"));
        assert!(message.contains("failed to launch"));
        assert!(!message.contains("sk-test-secret"));
    }

    #[test]
    fn launch_result_text_reports_headless_mode() {
        let result = LaunchResult {
            reused: false,
            session: SessionInfo {
                session_id: "s-1".into(),
                profile_name: Some("ci".into()),
                profile_id: "p-1".into(),
                pipe_name: "pipe".into(),
                extension_id: "ext".into(),
                extension_version: "1".into(),
                started_at: 1,
                last_heartbeat_at: 2,
                last_focused_at: 3,
                active_page: None,
                ..SessionInfo::default()
            },
            profile_name: "ci".into(),
            profile_path: PathBuf::from("profile"),
            launcher_pid: 42,
            log_path: PathBuf::from("web-ext.log"),
            headless: true,
            extra_args: vec!["-private-window".into()],
            user_agent: Some("test-agent/1.0".into()),
            ..LaunchResult::default()
        };

        let text = launch_result_text(&result);

        assert!(text.contains("Mode: headless"));
        assert!(text.contains("Firefox args: -private-window"));
        assert!(text.contains("User-Agent override: test-agent/1.0"));
    }

    #[test]
    fn extension_source_can_be_supplied_by_launcher_env() {
        let root = tempfile::tempdir().unwrap();
        let extension = root.path().join("extension");
        fs::create_dir_all(&extension).unwrap();
        fs::write(extension.join("manifest.json"), "{}").unwrap();

        let resolved = extension_source_from_env(Some(extension.as_os_str().to_os_string()));

        assert_eq!(resolved, Some(extension));
        assert_eq!(extension_source_from_env(None), None);
        assert_eq!(
            extension_source_from_env(Some(root.path().join("missing").into_os_string())),
            None
        );
    }

    #[test]
    fn xpi_install_uses_extension_id_filename() {
        let root = tempfile::tempdir().unwrap();
        let xpi = root.path().join("pire-browser.xpi");
        fs::write(&xpi, b"xpi").unwrap();
        let profile = root.path().join("profile");

        install_profile_xpi(&profile, &xpi).unwrap();

        let target = profile
            .join("extensions")
            .join(format!("{EXTENSION_ID}.xpi"));
        assert_eq!(fs::read(target).unwrap(), b"xpi");
    }

    #[test]
    fn xpi_prefs_are_written_only_for_xpi_mode() {
        let web_ext_prefs = extension_user_js_prefs(ExtensionLaunchMode::WebExt, true);
        assert!(!web_ext_prefs.contains("extensions.autoDisableScopes"));
        assert!(!web_ext_prefs.contains("xpinstall.signatures.required"));

        let signed_xpi_prefs = extension_user_js_prefs(ExtensionLaunchMode::Xpi, false);
        assert!(signed_xpi_prefs.contains("extensions.autoDisableScopes"));
        assert!(!signed_xpi_prefs.contains("xpinstall.signatures.required"));

        let unsigned_xpi_prefs = extension_user_js_prefs(ExtensionLaunchMode::Xpi, true);
        assert!(unsigned_xpi_prefs.contains("extensions.autoDisableScopes"));
        assert!(unsigned_xpi_prefs.contains("xpinstall.signatures.required"));
    }

    #[test]
    fn writes_xpi_profile_prefs_when_xpi_mode_is_selected() {
        let root = tempfile::tempdir().unwrap();
        let profile = root.path().join("profile");
        let downloads = root.path().join("downloads");
        fs::create_dir_all(&profile).unwrap();

        write_profile_startup_prefs(
            &profile,
            &downloads,
            ExtensionLaunchMode::Xpi,
            true,
            Some(r#"agent "quoted" \ slash"#),
        )
        .unwrap();

        let body = fs::read_to_string(profile.join("user.js")).unwrap();
        assert!(body.contains("extensions.autoDisableScopes"));
        assert!(body.contains("xpinstall.signatures.required"));
        assert!(body.contains("browser.download.dir"));
        assert!(body
            .contains(r#"user_pref("general.useragent.override", "agent \"quoted\" \\ slash");"#));
    }

    #[test]
    fn user_agent_pref_ignores_empty_values() {
        assert_eq!(user_agent_user_js_pref(None), "");
        assert_eq!(user_agent_user_js_pref(Some("  ")), "");
    }

    #[test]
    fn recognizes_firefox_profile_sources_and_locks() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        fs::create_dir_all(&source).unwrap();
        assert!(validate_firefox_profile_source(&source).is_err());

        fs::write(source.join("prefs.js"), b"user_pref();").unwrap();
        assert!(validate_firefox_profile_source(&source).is_ok());
        assert!(!source_has_lock_file(&source));

        fs::write(source.join("parent.lock"), b"locked").unwrap();
        assert!(source_has_lock_file(&source));
    }

    #[test]
    fn closed_persistent_profile_cleanup_removes_only_known_lock_artifacts() {
        let root = tempfile::tempdir().unwrap();
        let profile = root.path().join("profile");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("prefs.js"), b"prefs").unwrap();
        fs::write(profile.join("parent.lock"), b"locked").unwrap();
        fs::write(profile.join("keep.locked-data"), b"keep").unwrap();

        remove_stale_profile_locks_best_effort(&profile);

        assert!(!profile.join("parent.lock").exists());
        assert_eq!(fs::read(profile.join("prefs.js")).unwrap(), b"prefs");
        assert_eq!(fs::read(profile.join("keep.locked-data")).unwrap(), b"keep");
    }

    #[test]
    fn parses_firefox_profiles_ini_for_importable_profiles() {
        let root = tempfile::tempdir().unwrap();
        let firefox_root = root.path().join("Firefox");
        let default_profile = firefox_root.join("Profiles/abc.default-release");
        let dev_profile = root.path().join("External/dev-edition");
        fs::create_dir_all(&default_profile).unwrap();
        fs::create_dir_all(&dev_profile).unwrap();
        let ini_path = firefox_root.join("profiles.ini");
        let body = format!(
            r#"
[Profile0]
Name=default-release
IsRelative=1
Path=Profiles/abc.default-release
Default=1

[Profile1]
Name=Developer
IsRelative=0
Path={}
"#,
            dev_profile.display()
        );

        let profiles = parse_firefox_profiles_ini(&firefox_root, &ini_path, &body);

        assert_eq!(profiles.len(), 2);
        assert_eq!(profiles[0].name, "default-release");
        assert_eq!(profiles[0].path, default_profile);
        assert!(profiles[0].exists);
        assert!(profiles[0].is_default);
        assert_eq!(profiles[1].name, "Developer");
        assert_eq!(profiles[1].path, dev_profile);
    }

    #[test]
    fn resolves_discovered_firefox_profile_names_for_import() {
        let root = tempfile::tempdir().unwrap();
        let default_profile = root.path().join("Profiles/abc.default-release");
        let other_profile = root.path().join("Profiles/def.work");
        let profiles = vec![
            DiscoveredFirefoxProfileInfo {
                name: "default-release".to_string(),
                path: default_profile.clone(),
                exists: true,
                is_default: true,
                source_path: root.path().join("profiles.ini"),
            },
            DiscoveredFirefoxProfileInfo {
                name: "work".to_string(),
                path: other_profile.clone(),
                exists: true,
                is_default: false,
                source_path: root.path().join("profiles.ini"),
            },
        ];

        assert_eq!(
            resolve_firefox_profile_source_from_profiles(Path::new("Default"), profiles.clone())
                .unwrap(),
            default_profile
        );
        assert_eq!(
            resolve_firefox_profile_source_from_profiles(Path::new("work"), profiles.clone())
                .unwrap(),
            other_profile
        );
        assert_eq!(
            resolve_firefox_profile_source_from_profiles(
                Path::new("abc.default-release"),
                profiles.clone()
            )
            .unwrap(),
            default_profile
        );
        assert!(
            resolve_firefox_profile_source_from_profiles(Path::new("missing"), profiles)
                .unwrap_err()
                .to_string()
                .contains("no discovered Firefox profile")
        );
    }

    #[test]
    fn copies_firefox_profile_tree_without_volatile_artifacts() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let destination = root.path().join("destination");
        fs::create_dir_all(source.join("storage/default/app")).unwrap();
        fs::create_dir_all(source.join("cache2")).unwrap();
        fs::create_dir_all(source.join("jumpListCache")).unwrap();
        fs::write(source.join("prefs.js"), b"prefs").unwrap();
        fs::write(source.join("cookies.sqlite"), b"cookies").unwrap();
        fs::write(source.join("parent.lock"), b"locked").unwrap();
        fs::write(source.join("storage/default/app/state.sqlite"), b"state").unwrap();
        fs::write(source.join("cache2/ignored"), b"cache").unwrap();
        fs::write(source.join("jumpListCache/ignored"), b"jump").unwrap();

        let mut copied = 0usize;
        let mut skipped = 0usize;
        copy_profile_tree(
            &source,
            &destination,
            Path::new(""),
            &mut copied,
            &mut skipped,
        )
        .unwrap();

        assert_eq!(copied, 3);
        assert_eq!(skipped, 3);
        assert_eq!(fs::read(destination.join("prefs.js")).unwrap(), b"prefs");
        assert_eq!(
            fs::read(destination.join("storage/default/app/state.sqlite")).unwrap(),
            b"state"
        );
        assert!(!destination.join("parent.lock").exists());
        assert!(!destination.join("cache2").exists());
        assert!(!destination.join("jumpListCache").exists());
    }

    #[test]
    fn profile_process_matching_is_limited_to_managed_browser_launchers() {
        let profile = r"C:\Users\me\AppData\Local\pire-browser\firefox-profiles\Default";
        assert!(profile_process_command_matches(
            r#""C:\Program Files\Mozilla Firefox\firefox.exe" -profile C:\Users\me\AppData\Local\pire-browser\firefox-profiles\Default"#,
            profile
        ));
        assert!(profile_process_command_matches(
            r#"node web-ext run --firefox-profile C:\Users\me\AppData\Local\pire-browser\firefox-profiles\Default"#,
            profile
        ));
        assert!(!profile_process_command_matches(
            r#""C:\Program Files\Mozilla Firefox\firefox.exe" -profile C:\Users\me\OtherProfile"#,
            profile
        ));
        assert!(!profile_process_command_matches(
            r#"node some-script.js C:\Users\me\AppData\Local\pire-browser\firefox-profiles\Default"#,
            profile
        ));
    }

    #[test]
    fn command_output_with_timeout_captures_successful_output() {
        let command = quick_output_command("pire-timeout-ok");

        let output = command_output_with_timeout(command, Duration::from_secs(5))
            .unwrap()
            .expect("command should finish");

        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("pire-timeout-ok"));
    }

    #[test]
    fn command_output_with_timeout_kills_slow_processes() {
        let command = slow_output_command();
        let started = Instant::now();

        let output = command_output_with_timeout(command, Duration::from_millis(150)).unwrap();

        assert!(output.is_none());
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn close_cleanup_matches_only_the_recorded_session_and_profile() {
        let profile_path = PathBuf::from(r"C:\Temp\pire-profile");
        let metadata = LauncherMetadata {
            namespace: "qa".into(),
            session_name: "work".into(),
            profile_name: "ephemeral".into(),
            profile_kind: SessionProfileKind::Ephemeral,
            profile_path: profile_path.clone(),
            session_id: Some("session-1".into()),
            profile_id: Some("profile-1".into()),
            ..LauncherMetadata::default()
        };
        let session = SessionInfo {
            session_id: "session-1".into(),
            session_name: Some("work".into()),
            namespace: Some("qa".into()),
            profile_path: Some(profile_path),
            profile_id: "profile-1".into(),
            ..SessionInfo::default()
        };

        assert!(launcher_metadata_matches_session(&metadata, &session));
        let mut other = session.clone();
        other.session_id = "session-2".into();
        other.profile_id = "profile-2".into();
        assert!(!launcher_metadata_matches_session(&metadata, &other));
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
                headless: false,
                ..LauncherMetadata::default()
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
                headless: true,
                ..LauncherMetadata::default()
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
                ..SessionInfo::default()
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
                ..SessionInfo::default()
            },
        ];

        annotate_session_profile_names_from_data_dir(root.path(), &mut sessions).unwrap();
        assert_eq!(sessions[0].profile_name.as_deref(), Some("alpha"));
        assert_eq!(sessions[1].profile_name.as_deref(), Some("beta"));
    }

    #[cfg(windows)]
    fn quick_output_command(text: &str) -> Command {
        let mut command = Command::new("powershell.exe");
        command
            .args(["-NoProfile", "-NonInteractive", "-Command"])
            .arg(format!("Write-Output {text:?}"));
        command
    }

    #[cfg(not(windows))]
    fn quick_output_command(text: &str) -> Command {
        let mut command = Command::new("sh");
        command
            .arg("-c")
            .arg(format!("printf '%s\\n' {}", shell_quote(text)));
        command
    }

    #[cfg(windows)]
    fn slow_output_command() -> Command {
        let mut command = Command::new("powershell.exe");
        command.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Sleep -Seconds 5; Write-Output done",
        ]);
        command
    }

    #[cfg(not(windows))]
    fn slow_output_command() -> Command {
        let mut command = Command::new("sh");
        command.args(["-c", "sleep 5; printf done"]);
        command
    }

    #[cfg(not(windows))]
    fn shell_quote(text: &str) -> String {
        format!("'{}'", text.replace('\'', "'\\''"))
    }
}
