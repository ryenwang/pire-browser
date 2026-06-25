use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{bail, Context, Result};
use serde_json::json;

use crate::firefox::{discover_firefox, firefox_discovery_error_message};
#[cfg(all(unix, not(target_os = "macos")))]
use crate::firefox::{firefox_install_kind, sandboxed_firefox_message, FirefoxInstallKind};
use crate::platform::{host_executable_name, native_manifest_registration_path};
use crate::protocol::{EXTENSION_ID, NATIVE_HOST_NAME};
use crate::session::ensure_runtime_dirs;

#[cfg(windows)]
use winreg::enums::HKEY_CURRENT_USER;
#[cfg(windows)]
use winreg::RegKey;

#[derive(Debug, Clone)]
pub struct SetupResult {
    pub firefox_path: PathBuf,
    pub host_path: PathBuf,
    pub manifest_path: PathBuf,
    pub note: Option<String>,
    pub dependency_note: Option<String>,
}

pub fn setup(firefox_path: Option<String>) -> Result<SetupResult> {
    setup_inner(firefox_path, false)
}

pub fn setup_with_deps(firefox_path: Option<String>) -> Result<SetupResult> {
    setup_inner(firefox_path, true)
}

pub fn setup_windows(firefox_path: Option<String>) -> Result<SetupResult> {
    setup_inner(firefox_path, false)
}

fn setup_inner(firefox_path: Option<String>, with_deps: bool) -> Result<SetupResult> {
    ensure_runtime_dirs()?;
    let explicit_firefox_path = firefox_path
        .as_deref()
        .is_some_and(|path| !path.trim().is_empty())
        || firefox_override_env_present();
    let mut dependency_install_note = None;
    let mut resolved_firefox_path = discover_firefox(firefox_path.clone());
    if resolved_firefox_path.is_none() && with_deps && !explicit_firefox_path {
        dependency_install_note = Some(install_firefox_dependency()?);
        resolved_firefox_path = discover_firefox(firefox_path.clone());
    }
    let firefox_path = resolved_firefox_path
        .with_context(|| firefox_discovery_error_message(firefox_path.as_deref()))?;
    let host_path = sibling_host_path()?;
    if !host_path.exists() {
        bail!(
            "native host not found at {}; build with `cargo build` first",
            host_path.display()
        );
    }

    let manifest_path = native_manifest_path_for_firefox(&firefox_path)?;
    write_native_manifest(&manifest_path, &host_path)?;
    register_native_host(&manifest_path)?;

    Ok(SetupResult {
        note: linux_sandbox_note(&firefox_path),
        dependency_note: dependency_note(with_deps, dependency_install_note),
        firefox_path,
        host_path,
        manifest_path,
    })
}

pub fn native_manifest_path() -> Result<PathBuf> {
    native_manifest_registration_path(NATIVE_HOST_NAME)
}

pub fn native_manifest_path_for_firefox(firefox_path: &Path) -> Result<PathBuf> {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
            return native_manifest_path();
        };
        return match firefox_install_kind(firefox_path) {
            FirefoxInstallKind::Snap => Ok(home
                .join("snap")
                .join("firefox")
                .join("common")
                .join(".mozilla")
                .join("native-messaging-hosts")
                .join(format!("{NATIVE_HOST_NAME}.json"))),
            FirefoxInstallKind::Flatpak => Ok(home
                .join(".var")
                .join("app")
                .join("org.mozilla.firefox")
                .join(".mozilla")
                .join("native-messaging-hosts")
                .join(format!("{NATIVE_HOST_NAME}.json"))),
            FirefoxInstallKind::Standard => native_manifest_path(),
        };
    }

    #[cfg(any(windows, target_os = "macos"))]
    {
        let _ = firefox_path;
        native_manifest_path()
    }
}

pub fn sibling_host_path() -> Result<PathBuf> {
    let current = std::env::current_exe().context("failed to locate current executable")?;
    let dir = current
        .parent()
        .context("current executable has no parent directory")?;
    Ok(dir.join(host_executable_name()))
}

fn write_native_manifest(path: &Path, host_path: &Path) -> Result<()> {
    let body = json!({
        "name": NATIVE_HOST_NAME,
        "description": "Native host for pire-browser Firefox automation",
        "path": host_path,
        "type": "stdio",
        "allowed_extensions": [EXTENSION_ID],
    });
    fs::create_dir_all(path.parent().context("manifest path has no parent")?)?;
    fs::write(path, serde_json::to_vec_pretty(&body)?)
        .with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

#[cfg(windows)]
fn register_native_host(manifest_path: &Path) -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu.create_subkey(format!(
        r"Software\Mozilla\NativeMessagingHosts\{}",
        NATIVE_HOST_NAME
    ))?;
    key.set_value("", &manifest_path.to_string_lossy().to_string())?;
    Ok(())
}

#[cfg(not(windows))]
fn register_native_host(_manifest_path: &Path) -> Result<()> {
    Ok(())
}

pub fn setup_result_text(result: &SetupResult) -> String {
    let mut text = format!(
        "pire-browser setup complete\nFirefox: {}\nNative host: {}\nManifest: {}",
        result.firefox_path.display(),
        result.host_path.display(),
        result.manifest_path.display()
    );
    if let Some(note) = &result.note {
        text.push_str(&format!("\nNote: {note}"));
    }
    if let Some(note) = &result.dependency_note {
        text.push_str(&format!("\nDependency note: {note}"));
    }
    text
}

fn dependency_note(with_deps: bool, install_note: Option<String>) -> Option<String> {
    if !with_deps {
        return None;
    }
    Some(install_note.unwrap_or_else(|| platform_dependency_note().to_string()))
}

pub fn platform_dependency_note() -> &'static str {
    #[cfg(windows)]
    {
        "`--with-deps` uses installed Firefox when available. If Firefox is missing, pire-browser tries winget (`Mozilla.Firefox`) or Chocolatey (`firefox`) before rerunning setup; install Firefox manually or pass `--firefox-path <path>` if neither installer is available."
    }
    #[cfg(target_os = "macos")]
    {
        "`--with-deps` uses installed Firefox.app when available. If Firefox is missing and Homebrew is available, pire-browser runs `brew install --cask firefox` with Homebrew auto-update disabled before rerunning setup; install Firefox manually or pass `--firefox-path <path>` if Homebrew is unavailable."
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        "`--with-deps` uses installed Firefox when available. Linux package managers are not run automatically because distro defaults can install Snap/Flatpak Firefox, which may block Native Messaging; install an unrestricted Mozilla package/tarball or distro non-Snap Firefox, then rerun `pire-browser install --firefox-path <path>` if needed."
    }
    #[cfg(not(any(windows, target_os = "macos", unix)))]
    {
        "`--with-deps` is accepted for agent-browser-style setup recipes, but this platform needs a user-installed Firefox. Install Firefox, then rerun `pire-browser install`."
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DependencyPlatform {
    Windows,
    Macos,
    Linux,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FirefoxDependencyPlan {
    manager: &'static str,
    executable: &'static str,
    args: Vec<&'static str>,
    env: Vec<(&'static str, &'static str)>,
    note: &'static str,
}

fn install_firefox_dependency() -> Result<String> {
    let plans = firefox_dependency_plans(current_dependency_platform(), command_available);
    if plans.is_empty() {
        bail!(
            "firefox_dependency_unavailable: Firefox was not discovered and `--with-deps` could not find a supported automatic installer. {}",
            platform_dependency_note()
        );
    }

    let mut failures = Vec::new();
    for plan in plans {
        match run_firefox_dependency_plan(&plan) {
            Ok(note) => return Ok(note),
            Err(error) => failures.push(format!("{}: {error:#}", plan.manager)),
        }
    }
    bail!(
        "firefox_dependency_install_failed: all supported Firefox installers failed.\n{}",
        failures.join("\n")
    )
}

fn run_firefox_dependency_plan(plan: &FirefoxDependencyPlan) -> Result<String> {
    let output = run_dependency_plan(&plan).with_context(|| {
        format!(
            "failed to run Firefox dependency installer `{}`",
            plan.command_for_display()
        )
    })?;
    if !output.status.success() {
        bail!(
            "firefox_dependency_install_failed: {} exited with {} while installing Firefox.\nstdout:\n{}\nstderr:\n{}",
            plan.manager,
            output
                .status
                .code()
                .map(|code| code.to_string())
                .unwrap_or_else(|| "signal".to_string()),
            trimmed_output(&output.stdout),
            trimmed_output(&output.stderr)
        );
    }
    Ok(format!(
        "Ran {} before setup: {}. {} Reran Firefox discovery before registering Native Messaging.",
        plan.manager,
        plan.command_for_display(),
        plan.note
    ))
}

fn run_dependency_plan(plan: &FirefoxDependencyPlan) -> Result<std::process::Output> {
    let mut command = Command::new(plan.executable);
    command
        .args(&plan.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in &plan.env {
        command.env(key, value);
    }
    command.output().map_err(Into::into)
}

fn trimmed_output(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    let text = text.trim();
    if text.len() <= 2_000 {
        return text.to_string();
    }
    format!("{}...", text.chars().take(2_000).collect::<String>())
}

fn current_dependency_platform() -> DependencyPlatform {
    if cfg!(windows) {
        DependencyPlatform::Windows
    } else if cfg!(target_os = "macos") {
        DependencyPlatform::Macos
    } else if cfg!(all(unix, not(target_os = "macos"))) {
        DependencyPlatform::Linux
    } else {
        DependencyPlatform::Other
    }
}

#[cfg(test)]
fn select_firefox_dependency_plan(
    platform: DependencyPlatform,
    available: impl FnMut(&str) -> bool,
) -> Option<FirefoxDependencyPlan> {
    firefox_dependency_plans(platform, available)
        .into_iter()
        .next()
}

fn firefox_dependency_plans(
    platform: DependencyPlatform,
    mut available: impl FnMut(&str) -> bool,
) -> Vec<FirefoxDependencyPlan> {
    match platform {
        DependencyPlatform::Windows => {
            let mut plans = Vec::new();
            if available("winget") {
                plans.push(FirefoxDependencyPlan {
                    manager: "winget",
                    executable: "winget",
                    args: vec![
                        "install",
                        "--id",
                        "Mozilla.Firefox",
                        "--source",
                        "winget",
                        "--accept-package-agreements",
                        "--accept-source-agreements",
                        "--silent",
                    ],
                    env: Vec::new(),
                    note: "Install Mozilla Firefox from the winget source.",
                });
            }
            if available("choco") {
                plans.push(FirefoxDependencyPlan {
                    manager: "Chocolatey",
                    executable: "choco",
                    args: vec!["install", "firefox", "-y", "--no-progress"],
                    env: Vec::new(),
                    note: "Install Mozilla Firefox through Chocolatey.",
                });
            }
            plans
        }
        DependencyPlatform::Macos if available("brew") => vec![FirefoxDependencyPlan {
            manager: "Homebrew",
            executable: "brew",
            args: vec!["install", "--cask", "firefox"],
            env: vec![("HOMEBREW_NO_AUTO_UPDATE", "1")],
            note: "Install Firefox.app through Homebrew without updating Homebrew metadata first.",
        }],
        _ => Vec::new(),
    }
}

impl FirefoxDependencyPlan {
    fn command_for_display(&self) -> String {
        let mut parts = vec![self.executable.to_string()];
        parts.extend(self.args.iter().map(|arg| arg.to_string()));
        parts.join(" ")
    }
}

fn command_available(name: &str) -> bool {
    let Some(path_var) = env::var_os("PATH") else {
        return false;
    };
    env::split_paths(&path_var).any(|dir| {
        command_candidate_names(name).into_iter().any(|candidate| {
            let path = dir.join(candidate);
            path.is_file()
        })
    })
}

fn command_candidate_names(name: &str) -> Vec<OsString> {
    let mut names = vec![OsString::from(name)];
    #[cfg(windows)]
    {
        if Path::new(name).extension().is_none() {
            let pathext = env::var_os("PATHEXT")
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".to_string());
            for ext in pathext.split(';').filter(|ext| !ext.trim().is_empty()) {
                names.push(OsString::from(format!("{name}{ext}")));
            }
            names.push(OsString::from(format!("{name}.exe")));
        }
    }
    names
}

fn firefox_override_env_present() -> bool {
    [
        "PIRE_BROWSER_FIREFOX_PATH",
        "PIRE_BROWSER_EXECUTABLE_PATH",
        "AGENT_BROWSER_EXECUTABLE_PATH",
    ]
    .iter()
    .any(|name| env::var_os(name).is_some_and(|value| !value.is_empty()))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn linux_sandbox_note(firefox_path: &Path) -> Option<String> {
    sandboxed_firefox_message(firefox_install_kind(firefox_path)).map(str::to_string)
}

#[cfg(any(windows, target_os = "macos"))]
fn linux_sandbox_note(_firefox_path: &Path) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_manifest_uses_host_name() {
        let path = native_manifest_path();
        if let Ok(path) = path {
            assert!(path.to_string_lossy().contains(NATIVE_HOST_NAME));
        }
    }

    #[test]
    fn dependency_note_only_appears_with_deps() {
        assert!(dependency_note(false, None).is_none());
        let note = dependency_note(true, None).unwrap();
        assert!(note.contains("--with-deps"));
        assert!(note.contains("Firefox"));
        assert!(note.contains("winget") || note.contains("Homebrew") || note.contains("Linux"));
        assert_eq!(
            dependency_note(true, Some("Ran dependency installer.".to_string())).unwrap(),
            "Ran dependency installer."
        );
    }

    #[test]
    fn firefox_dependency_plan_prefers_winget_on_windows() {
        let plan = select_firefox_dependency_plan(DependencyPlatform::Windows, |name| {
            matches!(name, "winget" | "choco")
        })
        .unwrap();
        assert_eq!(plan.manager, "winget");
        assert_eq!(plan.executable, "winget");
        assert!(plan.args.contains(&"Mozilla.Firefox"));
    }

    #[test]
    fn firefox_dependency_plans_include_windows_fallbacks_in_order() {
        let plans = firefox_dependency_plans(DependencyPlatform::Windows, |name| {
            matches!(name, "winget" | "choco")
        });
        assert_eq!(
            plans.iter().map(|plan| plan.manager).collect::<Vec<_>>(),
            vec!["winget", "Chocolatey"]
        );
    }

    #[test]
    fn firefox_dependency_plan_falls_back_to_chocolatey_on_windows() {
        let plan =
            select_firefox_dependency_plan(DependencyPlatform::Windows, |name| name == "choco")
                .unwrap();
        assert_eq!(plan.manager, "Chocolatey");
        assert_eq!(plan.args, vec!["install", "firefox", "-y", "--no-progress"]);
    }

    #[test]
    fn firefox_dependency_plan_uses_homebrew_on_macos() {
        let plan = select_firefox_dependency_plan(DependencyPlatform::Macos, |name| name == "brew")
            .unwrap();
        assert_eq!(plan.manager, "Homebrew");
        assert_eq!(plan.args, vec!["install", "--cask", "firefox"]);
        assert_eq!(plan.env, vec![("HOMEBREW_NO_AUTO_UPDATE", "1")]);
    }

    #[test]
    fn firefox_dependency_plan_does_not_auto_install_linux_firefox() {
        let plan = select_firefox_dependency_plan(DependencyPlatform::Linux, |_| true);
        assert!(plan.is_none());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn linux_sandbox_note_is_specific_to_sandboxed_firefox() {
        let snap =
            linux_sandbox_note(Path::new("/snap/firefox/current/usr/lib/firefox/firefox")).unwrap();
        assert!(snap.contains("Snap Firefox detected"));
        assert!(snap.contains("setup --firefox-path"));
        assert!(linux_sandbox_note(Path::new("/usr/bin/firefox")).is_none());
    }
}
