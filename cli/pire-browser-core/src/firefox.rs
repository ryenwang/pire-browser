use std::path::{Path, PathBuf};

#[cfg(windows)]
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
#[cfg(windows)]
use winreg::RegKey;

pub fn discover_firefox(override_path: Option<String>) -> Option<PathBuf> {
    if let Some(path) = override_path {
        let path = PathBuf::from(path);
        if let Some(path) = first_firefox_executable_candidate(path) {
            return Some(path);
        }
    }
    if let Some(path) = firefox_path_from_env() {
        if let Some(path) = first_firefox_executable_candidate(path) {
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

pub fn firefox_discovery_error_message(override_path: Option<&str>) -> String {
    let mut message = String::from("could not discover Firefox");
    if let Some(path) = override_path.filter(|path| !path.trim().is_empty()) {
        message.push_str(&format!(
            "; provided path was not a usable Firefox executable: {path}"
        ));
    }
    message.push_str(". Install Firefox, then rerun `pire-browser install`.");
    message.push(' ');
    message.push_str(platform_firefox_install_hint());
    message.push_str(" You can pass `--firefox-path <path>` or set `PIRE_BROWSER_FIREFOX_PATH`.");
    message
}

pub fn platform_firefox_install_hint() -> &'static str {
    #[cfg(windows)]
    {
        r#"On Windows, run `pire-browser install --with-deps` to try winget/Chocolatey, install Mozilla Firefox manually, or rerun with `pire-browser install --firefox-path "C:\Program Files\Mozilla Firefox\firefox.exe"`."#
    }
    #[cfg(target_os = "macos")]
    {
        "On macOS, run `pire-browser install --with-deps` to try Homebrew, install Firefox.app manually, or rerun with `pire-browser install --firefox-path /Applications/Firefox.app`."
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        "On Linux, install an unrestricted Mozilla package/tarball or distro non-Snap Firefox; Snap/Flatpak Firefox can block Native Messaging. Rerun with `pire-browser install --firefox-path /path/to/firefox`."
    }
    #[cfg(not(any(windows, target_os = "macos", unix)))]
    {
        "Install Firefox for this platform and rerun with `pire-browser install --firefox-path <path>`."
    }
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

fn first_firefox_executable_candidate(path: PathBuf) -> Option<PathBuf> {
    expanded_firefox_candidates(path)
        .into_iter()
        .find(|candidate| is_firefox_executable(candidate))
}

fn expanded_firefox_candidates(path: PathBuf) -> Vec<PathBuf> {
    let mut paths = vec![path.clone()];

    #[cfg(windows)]
    {
        paths.push(path.join("firefox.exe"));
    }

    #[cfg(target_os = "macos")]
    {
        paths.push(path.join("Contents").join("MacOS").join("firefox"));
        paths.push(path.join("firefox"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        paths.push(path.join("firefox"));
        paths.push(path.join("firefox-esr"));
    }

    paths
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
    fn override_path_accepts_directory_containing_firefox() {
        let root = tempfile::tempdir().unwrap();
        #[cfg(windows)]
        let executable = root.path().join("firefox.exe");
        #[cfg(not(windows))]
        let executable = root.path().join("firefox");
        std::fs::write(&executable, "").unwrap();

        let discovered = discover_firefox(Some(root.path().display().to_string())).unwrap();
        assert_eq!(discovered, executable);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn override_path_accepts_firefox_app_bundle() {
        let root = tempfile::tempdir().unwrap();
        let app = root.path().join("Firefox.app");
        let executable = app.join("Contents").join("MacOS").join("firefox");
        std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
        std::fs::write(&executable, "").unwrap();

        let discovered = discover_firefox(Some(app.display().to_string())).unwrap();
        assert_eq!(discovered, executable);
    }

    #[test]
    fn firefox_discovery_error_message_is_actionable() {
        let message = firefox_discovery_error_message(Some("missing-firefox"));
        assert!(message.contains("could not discover Firefox"));
        assert!(message.contains("missing-firefox"));
        assert!(message.contains("pire-browser install"));
        assert!(message.contains("PIRE_BROWSER_FIREFOX_PATH"));
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
