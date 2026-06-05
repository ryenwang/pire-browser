use std::path::{Path, PathBuf};

#[cfg(windows)]
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
#[cfg(windows)]
use winreg::RegKey;

pub fn discover_firefox(override_path: Option<String>) -> Option<PathBuf> {
    if let Some(path) = override_path {
        let path = PathBuf::from(path);
        if is_firefox_executable(&path) {
            return Some(path);
        }
    }
    if let Some(path) = firefox_path_from_env() {
        if is_firefox_executable(&path) {
            return Some(path);
        }
    }

    #[cfg(windows)]
    {
        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            let root = RegKey::predef(root);
            if let Ok(key) =
                root.open_subkey(r"Software\Microsoft\Windows\CurrentVersion\App Paths\firefox.exe")
            {
                if let Ok(value) = key.get_value::<String, _>("") {
                    let path = PathBuf::from(value);
                    if is_firefox_executable(&path) {
                        return Some(path);
                    }
                }
            }
        }

        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            let root = RegKey::predef(root);
            for key_path in [
                r"Software\Mozilla\Mozilla Firefox",
                r"Software\WOW6432Node\Mozilla\Mozilla Firefox",
            ] {
                let Ok(key) = root.open_subkey(key_path) else {
                    continue;
                };
                let Ok(current_version) = key.get_value::<String, _>("CurrentVersion") else {
                    continue;
                };
                let install_key = format!(r"{key_path}\{current_version}\Main");
                let Ok(main) = root.open_subkey(install_key) else {
                    continue;
                };
                if let Ok(path) = main.get_value::<String, _>("PathToExe") {
                    let path = PathBuf::from(path);
                    if is_firefox_executable(&path) {
                        return Some(path);
                    }
                }
            }
        }
    }

    path_firefox_candidates()
        .into_iter()
        .chain(common_firefox_paths())
        .into_iter()
        .find(|candidate| is_firefox_executable(candidate))
}

fn firefox_path_from_env() -> Option<PathBuf> {
    for name in [
        "PIRE_BROWSER_FIREFOX_PATH",
        "PIRE_BROWSER_EXECUTABLE_PATH",
        "AGENT_BROWSER_EXECUTABLE_PATH",
    ] {
        let Some(value) = std::env::var_os(name) else {
            continue;
        };
        if value.is_empty() {
            continue;
        }
        return Some(PathBuf::from(value));
    }
    None
}

fn common_firefox_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    #[cfg(windows)]
    {
        paths.push(PathBuf::from(
            r"C:\Program Files\Mozilla Firefox\firefox.exe",
        ));
        paths.push(PathBuf::from(
            r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
        ));

        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            paths.push(PathBuf::from(local).join(r"Mozilla Firefox\firefox.exe"));
        }
    }

    #[cfg(target_os = "macos")]
    {
        paths.push(PathBuf::from(
            "/Applications/Firefox.app/Contents/MacOS/firefox",
        ));
        if let Some(home) = std::env::var_os("HOME") {
            paths.push(PathBuf::from(home).join("Applications/Firefox.app/Contents/MacOS/firefox"));
        }
        paths.push(PathBuf::from("/opt/homebrew/bin/firefox"));
        paths.push(PathBuf::from("/usr/local/bin/firefox"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        paths.push(PathBuf::from("/usr/bin/firefox"));
        paths.push(PathBuf::from("/usr/bin/firefox-esr"));
        paths.push(PathBuf::from("/snap/bin/firefox"));
        paths.push(PathBuf::from(
            "/var/lib/flatpak/exports/bin/org.mozilla.firefox",
        ));
        if let Some(home) = std::env::var_os("HOME") {
            paths.push(
                PathBuf::from(home).join(".local/share/flatpak/exports/bin/org.mozilla.firefox"),
            );
        }
    }

    paths
}

fn path_firefox_candidates() -> Vec<PathBuf> {
    let Some(path_var) = std::env::var_os("PATH") else {
        return Vec::new();
    };
    let names: &[&str] = if cfg!(windows) {
        &["firefox.exe"]
    } else {
        &["firefox", "firefox-esr", "org.mozilla.firefox"]
    };
    std::env::split_paths(&path_var)
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .collect()
}

fn is_firefox_executable(path: &Path) -> bool {
    is_firefox_name(path) && path.exists()
}

fn is_firefox_name(path: &Path) -> bool {
    path.file_name()
        .and_then(|v| v.to_str())
        .map(|name| {
            name.eq_ignore_ascii_case("firefox.exe")
                || name == "firefox"
                || name == "firefox-esr"
                || name == "org.mozilla.firefox"
        })
        .unwrap_or(false)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FirefoxInstallKind {
    Standard,
    Snap,
    Flatpak,
}

impl FirefoxInstallKind {
    pub fn as_str(self) -> &'static str {
        match self {
            FirefoxInstallKind::Standard => "standard",
            FirefoxInstallKind::Snap => "snap",
            FirefoxInstallKind::Flatpak => "flatpak",
        }
    }
}

pub fn firefox_install_kind(path: &Path) -> FirefoxInstallKind {
    let text = path.to_string_lossy();
    if text.contains("/snap/") || text.contains("/snap/bin/firefox") {
        FirefoxInstallKind::Snap
    } else if text.contains("flatpak") || text.contains("org.mozilla.firefox") {
        FirefoxInstallKind::Flatpak
    } else {
        FirefoxInstallKind::Standard
    }
}

pub fn sandboxed_firefox_message(kind: FirefoxInstallKind) -> Option<&'static str> {
    match kind {
        FirefoxInstallKind::Snap => Some(
            "Snap Firefox detected; manifest registration may succeed, but sandbox confinement can still block native host execution. Use an unrestricted Firefox build, such as Mozilla's official package/tarball or a distro package that is not Snap/Flatpak, then rerun `pire-browser setup --firefox-path <path>`.",
        ),
        FirefoxInstallKind::Flatpak => Some(
            "Flatpak Firefox detected; manifest registration may succeed, but sandbox confinement can still block native host execution. Use an unrestricted Firefox build, such as Mozilla's official package/tarball or a distro package that is not Snap/Flatpak, then rerun `pire-browser setup --firefox-path <path>`.",
        ),
        FirefoxInstallKind::Standard => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn common_paths_include_program_files() {
        let paths = common_firefox_paths();
        assert!(!paths.is_empty());
    }

    #[test]
    fn classifies_linux_sandbox_firefox_paths() {
        assert_eq!(
            firefox_install_kind(Path::new("/snap/firefox/current/usr/lib/firefox/firefox")),
            FirefoxInstallKind::Snap
        );
        assert_eq!(
            firefox_install_kind(Path::new(
                "/var/lib/flatpak/exports/bin/org.mozilla.firefox"
            )),
            FirefoxInstallKind::Flatpak
        );
        assert_eq!(
            firefox_install_kind(Path::new("/usr/bin/firefox")),
            FirefoxInstallKind::Standard
        );
    }

    #[test]
    fn sandboxed_firefox_message_is_actionable() {
        let message = sandboxed_firefox_message(FirefoxInstallKind::Snap).unwrap();
        assert!(message.contains("sandbox confinement"));
        assert!(message.contains("setup --firefox-path"));
        assert!(sandboxed_firefox_message(FirefoxInstallKind::Standard).is_none());
    }
}
