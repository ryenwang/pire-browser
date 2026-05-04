use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use serde_json::json;

use crate::firefox::discover_firefox;
use crate::protocol::{EXTENSION_ID, NATIVE_HOST_NAME};
use crate::session::{data_dir, ensure_runtime_dirs};

#[cfg(windows)]
use winreg::enums::HKEY_CURRENT_USER;
#[cfg(windows)]
use winreg::RegKey;

#[derive(Debug, Clone)]
pub struct SetupResult {
    pub firefox_path: PathBuf,
    pub host_path: PathBuf,
    pub manifest_path: PathBuf,
}

pub fn setup_windows(firefox_path: Option<String>) -> Result<SetupResult> {
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

    let manifest_path = native_manifest_path()?;
    write_native_manifest(&manifest_path, &host_path)?;
    register_native_host(&manifest_path)?;

    Ok(SetupResult {
        firefox_path,
        host_path,
        manifest_path,
    })
}

pub fn native_manifest_path() -> Result<PathBuf> {
    Ok(data_dir()?
        .join("native-messaging")
        .join(format!("{NATIVE_HOST_NAME}.json")))
}

pub fn sibling_host_path() -> Result<PathBuf> {
    let current = std::env::current_exe().context("failed to locate current executable")?;
    let dir = current
        .parent()
        .context("current executable has no parent directory")?;
    Ok(dir.join("pire-browser-host.exe"))
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
    bail!("pire-browser MVP setup supports Windows only")
}

pub fn setup_result_text(result: &SetupResult) -> String {
    format!(
        "pire-browser setup complete\nFirefox: {}\nNative host: {}\nManifest: {}",
        result.firefox_path.display(),
        result.host_path.display(),
        result.manifest_path.display()
    )
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
}
