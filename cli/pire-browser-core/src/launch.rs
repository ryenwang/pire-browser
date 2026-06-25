use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use crate::download::{
    download_user_js_prefs, ensure_download_dir, ensure_profile_download_dir, sweep_old_downloads,
};
use crate::firefox::{discover_firefox, firefox_discovery_error_message};
use crate::protocol::EXTENSION_ID;
use crate::session::{
    cleanup_stale_sessions, data_dir, ensure_runtime_dirs, list_sessions, now_ms, SessionInfo,
};

pub const DEFAULT_PROFILE_NAME: &str = "Default";

#[derive(Debug, Clone)]
pub struct LaunchOptions {
    pub profile: String,
    pub url: Option<String>,
    pub firefox_path: Option<String>,
    pub download_dir: Option<PathBuf>,
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
    ensure_runtime_dirs()?;
    validate_profile_name(&options.profile)?;
    ensure_firefox_startup_policies_best_effort();
    let extension_launch_mode = extension_launch_mode_from_env()?;
    let allow_unsigned_xpi = allow_unsigned_xpi_from_env();

    let root = data_dir()?;
    let profile_path = managed_profile_dir_from_data_dir(&root, &options.profile);
    let metadata_dir = profile_metadata_dir_from_data_dir(&root, &options.profile);
    let launcher_path = launcher_metadata_path_from_data_dir(&root, &options.profile);
    let log_path = metadata_dir.join("web-ext.log");

    fs::create_dir_all(&profile_path)
        .with_context(|| format!("failed to create {}", profile_path.display()))?;
    fs::create_dir_all(&metadata_dir)
        .with_context(|| format!("failed to create {}", metadata_dir.display()))?;
    let download_dir = if let Some(path) = &options.download_dir {
        ensure_download_dir(path)?
    } else {
        ensure_profile_download_dir(&root, &options.profile)?
    };
    let _ = sweep_old_downloads(now_ms());
    write_profile_startup_prefs(
        &profile_path,
        &download_dir,
        extension_launch_mode,
        allow_unsigned_xpi,
    )?;
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
            let _ = terminate_profile_processes_best_effort(&profile_path);
            thread::sleep(Duration::from_millis(250));
        } else if profile_processes_are_alive(&profile_path) {
            let _ = terminate_profile_processes_best_effort(&profile_path);
            thread::sleep(Duration::from_millis(500));
        }

        if process_is_alive(metadata.launcher_pid) || profile_processes_are_alive(&profile_path) {
            bail!(
                "profile {} appears to be running under launcher PID {} or an orphaned Firefox/web-ext process, but no live pire-browser session was found; close that Firefox/web-ext instance or check {}",
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
        .with_context(|| firefox_discovery_error_message(options.firefox_path.as_deref()))?;
    let extension_launch = resolve_extension_launch(extension_launch_mode)?;
    let extension_source = extension_launch.path().to_path_buf();
    let log = open_append(&log_path)?;
    let log_err = log.try_clone()?;

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
            if let Some(url) = &options.url {
                command.arg(url);
            }
            command
        }
        ExtensionLaunch::WebExt(extension_source) => {
            let mut command = Command::new(npx_command());
            command
                .arg("--yes")
                .arg("web-ext")
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
            if let Some(url) = &options.url {
                command.arg("--start-url").arg(url);
            }
            command
        }
    };
    let launcher_name = extension_launch.launcher_name();

    configure_launcher_process(&mut command);
    let mut child = command.spawn().with_context(|| {
        if matches!(&extension_launch, ExtensionLaunch::WebExt(_)) {
            format!(
                "failed to start web-ext with {}; make sure Node.js/npm are installed",
                npx_command().display()
            )
        } else {
            format!(
                "failed to start Firefox directly with {}; check Firefox path and signed XPI setup",
                firefox_path.display()
            )
        }
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

    let deadline = Instant::now() + launch_wait_timeout(extension_launch_mode);
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait()? {
            bail!(
                "{launcher_name} exited before pire-browser connected (status: {status}); check {}",
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

pub fn import_firefox_profile(options: ProfileImportOptions) -> Result<ProfileImportResult> {
    ensure_runtime_dirs()?;
    validate_profile_name(&options.name)?;
    let source = options.source.canonicalize().with_context(|| {
        format!(
            "profile_import_not_found: could not read {}",
            options.source.display()
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
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env(
            "PIRE_BROWSER_PROFILE_CLEANUP_NEEDLE",
            profile_path.display().to_string(),
        )
        .output();
    let Ok(output) = output else {
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
    let output = Command::new("ps").args(["-eo", "pid,args"]).output();
    let Ok(output) = output else {
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
{END}
"#,
        extension_user_js_prefs(extension_launch_mode, allow_unsigned_xpi),
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

        write_profile_startup_prefs(&profile, &downloads, ExtensionLaunchMode::Xpi, true).unwrap();

        let body = fs::read_to_string(profile.join("user.js")).unwrap();
        assert!(body.contains("extensions.autoDisableScopes"));
        assert!(body.contains("xpinstall.signatures.required"));
        assert!(body.contains("browser.download.dir"));
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
