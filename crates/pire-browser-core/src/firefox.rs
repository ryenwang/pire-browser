use std::path::{Path, PathBuf};

#[cfg(windows)]
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
#[cfg(windows)]
use winreg::RegKey;

pub fn discover_firefox(override_path: Option<String>) -> Option<PathBuf> {
    if let Some(path) = override_path {
        let path = PathBuf::from(path);
        if is_firefox_exe(&path) {
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
                    if is_firefox_exe(&path) {
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
                    if is_firefox_exe(&path) {
                        return Some(path);
                    }
                }
            }
        }
    }

    for candidate in common_firefox_paths() {
        if is_firefox_exe(&candidate) {
            return Some(candidate);
        }
    }

    None
}

fn common_firefox_paths() -> Vec<PathBuf> {
    let mut paths = vec![
        PathBuf::from(r"C:\Program Files\Mozilla Firefox\firefox.exe"),
        PathBuf::from(r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe"),
    ];

    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        paths.push(PathBuf::from(local).join(r"Mozilla Firefox\firefox.exe"));
    }

    paths
}

fn is_firefox_exe(path: &Path) -> bool {
    path.file_name()
        .and_then(|v| v.to_str())
        .map(|name| name.eq_ignore_ascii_case("firefox.exe"))
        .unwrap_or(false)
        && path.exists()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn common_paths_include_program_files() {
        let paths = common_firefox_paths();
        assert!(paths
            .iter()
            .any(|path| path.to_string_lossy().contains("Mozilla Firefox")));
    }
}
