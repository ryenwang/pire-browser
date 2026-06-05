use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use serde_json::json;

use crate::firefox::discover_firefox;
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
}

pub fn setup(firefox_path: Option<String>) -> Result<SetupResult> {
    setup_inner(firefox_path)
}

pub fn setup_windows(firefox_path: Option<String>) -> Result<SetupResult> {
    setup_inner(firefox_path)
}

fn setup_inner(firefox_path: Option<String>) -> Result<SetupResult> {
    ensure_runtime_dirs()?;
    let firefox_path = discover_firefox(firefox_path)
        .context("could not discover Firefox; pass --firefox-path <path>")?;
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
    text
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
