use std::env;
use std::path::PathBuf;

#[cfg(windows)]
use anyhow::bail;
#[cfg(unix)]
use anyhow::Context;
use anyhow::Result;

use crate::protocol::PRODUCT_NAME;

pub fn data_dir() -> Result<PathBuf> {
    #[cfg(windows)]
    {
        if let Some(local) = env::var_os("LOCALAPPDATA") {
            return Ok(PathBuf::from(local).join(PRODUCT_NAME));
        }
        bail!("LOCALAPPDATA is not set; Windows local app data is required")
    }

    #[cfg(target_os = "macos")]
    {
        let home = home_dir()?;
        Ok(home
            .join("Library")
            .join("Application Support")
            .join(PRODUCT_NAME))
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(xdg) = env::var_os("XDG_DATA_HOME") {
            return Ok(PathBuf::from(xdg).join(PRODUCT_NAME));
        }
        Ok(home_dir()?.join(".local").join("share").join(PRODUCT_NAME))
    }
}

pub fn runtime_dir() -> Result<PathBuf> {
    #[cfg(windows)]
    {
        return Ok(data_dir()?.join("runtime"));
    }

    #[cfg(unix)]
    {
        let uid = unsafe { libc::geteuid() };
        Ok(env::temp_dir().join(format!("{PRODUCT_NAME}-{uid}")))
    }
}

pub fn native_manifest_registration_path(host_name: &str) -> Result<PathBuf> {
    #[cfg(windows)]
    {
        return Ok(data_dir()?
            .join("native-messaging")
            .join(format!("{host_name}.json")));
    }

    #[cfg(target_os = "macos")]
    {
        return Ok(home_dir()?
            .join("Library")
            .join("Application Support")
            .join("Mozilla")
            .join("NativeMessagingHosts")
            .join(format!("{host_name}.json")));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Ok(home_dir()?
            .join(".mozilla")
            .join("native-messaging-hosts")
            .join(format!("{host_name}.json")))
    }
}

pub fn host_executable_name() -> &'static str {
    if cfg!(windows) {
        "pire-browser-host.exe"
    } else {
        "pire-browser-host"
    }
}

pub fn cli_executable_name() -> &'static str {
    if cfg!(windows) {
        "pire-browser.exe"
    } else {
        "pire-browser"
    }
}

#[cfg(unix)]
fn home_dir() -> Result<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .context("HOME is not set; cannot resolve per-user pire-browser directories")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn executable_names_have_platform_suffixes() {
        if cfg!(windows) {
            assert_eq!(host_executable_name(), "pire-browser-host.exe");
            assert_eq!(cli_executable_name(), "pire-browser.exe");
        } else {
            assert_eq!(host_executable_name(), "pire-browser-host");
            assert_eq!(cli_executable_name(), "pire-browser");
        }
    }

    #[test]
    fn native_manifest_path_uses_firefox_host_name() {
        let path = native_manifest_registration_path("dev.pi.pire_browser").unwrap();
        assert!(path.to_string_lossy().contains("dev.pi.pire_browser"));
    }
}
