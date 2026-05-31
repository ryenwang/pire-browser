use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use anyhow::{bail, Context, Result};

use crate::redaction::redact_text;
use crate::session::data_dir;
use crate::session::now_ms;
use crate::state_file::display_url_without_query_or_fragment;

pub const DOWNLOAD_TIMEOUT_MS: u64 = 60_000;
pub const DOWNLOAD_RECENT_MS: u64 = 60_000;
pub const DOWNLOAD_SWEEP_AGE_MS: u64 = 24 * 60 * 60 * 1000;
pub const DOWNLOAD_FINALIZE_RETRY_MS: u64 = 3_000;

const DOWNLOAD_MIME_TYPES: &[&str] = &[
    "application/octet-stream",
    "text/plain",
    "application/json",
    "text/csv",
    "application/zip",
    "application/pdf",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadFinalization {
    pub path: PathBuf,
    pub bytes: u64,
    pub moved: bool,
}

pub fn downloads_root() -> Result<PathBuf> {
    Ok(data_dir()?.join("downloads"))
}

pub fn profile_download_dir_from_data_dir(root: &Path, profile_name: &str) -> PathBuf {
    root.join("downloads").join(profile_name)
}

pub fn ensure_profile_download_dir(root: &Path, profile_name: &str) -> Result<PathBuf> {
    let path = profile_download_dir_from_data_dir(root, profile_name);
    fs::create_dir_all(&path).with_context(|| format!("failed to create {}", path.display()))?;
    Ok(path)
}

pub fn sweep_old_downloads(now: u64) -> Result<usize> {
    sweep_old_downloads_in_dir(&downloads_root()?, now)
}

pub fn sweep_old_downloads_in_dir(root: &Path, now: u64) -> Result<usize> {
    if !root.exists() {
        return Ok(0);
    }
    let mut removed = 0;
    sweep_old_downloads_inner(root, now, &mut removed)?;
    Ok(removed)
}

fn sweep_old_downloads_inner(path: &Path, now: u64, removed: &mut usize) -> Result<()> {
    for entry in fs::read_dir(path).with_context(|| format!("failed to read {}", path.display()))? {
        let entry = entry?;
        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.is_dir() {
            sweep_old_downloads_inner(&path, now, removed)?;
            let _ = fs::remove_dir(&path);
            continue;
        }
        if !metadata.is_file() {
            continue;
        }
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(now);
        if now.saturating_sub(modified) > DOWNLOAD_SWEEP_AGE_MS && fs::remove_file(&path).is_ok() {
            *removed += 1;
        }
    }
    Ok(())
}

pub fn download_user_js_prefs(download_dir: &Path) -> String {
    let escaped = user_js_string(download_dir.to_string_lossy().as_ref());
    format!(
        r#"user_pref("browser.download.folderList", 2);
user_pref("browser.download.dir", "{escaped}");
user_pref("browser.download.useDownloadDir", true);
user_pref("browser.download.always_ask_before_handling_new_types", false);
user_pref("browser.download.alwaysOpenPanel", false);
user_pref("browser.helperApps.neverAsk.saveToDisk", "{}");"#,
        DOWNLOAD_MIME_TYPES.join(",")
    )
}

pub fn display_download_url(raw_url: Option<&str>) -> Option<String> {
    let raw_url = raw_url?;
    let display = redact_sensitive_url_path_segments(&display_url_without_query_or_fragment(
        &redact_text(raw_url),
    ));
    (!display.is_empty()).then_some(display)
}

pub fn finalize_download(
    staged_path: &Path,
    destination: Option<&Path>,
) -> Result<DownloadFinalization> {
    let source = staged_path;
    let final_path = destination.unwrap_or(staged_path);
    if let Some(destination) = destination {
        if destination.exists() {
            bail!(
                "invalid_args: download destination already exists: {}",
                destination.display()
            );
        }
        if let Some(parent) = destination.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("failed to create {}", parent.display()))?;
            }
        }
    }

    let deadline = now_ms() + DOWNLOAD_FINALIZE_RETRY_MS;
    loop {
        match finalize_download_once(source, final_path, destination.is_some()) {
            Ok(result) => return Ok(result),
            Err(error) => {
                if now_ms() >= deadline {
                    return Err(error);
                }
                thread::sleep(Duration::from_millis(100));
            }
        }
    }
}

fn finalize_download_once(
    source: &Path,
    final_path: &Path,
    should_move: bool,
) -> Result<DownloadFinalization> {
    ensure_readable_file(source)?;
    if !should_move {
        return Ok(DownloadFinalization {
            path: source.to_path_buf(),
            bytes: fs::metadata(source)?.len(),
            moved: false,
        });
    }
    match fs::rename(source, final_path) {
        Ok(()) => {
            let bytes = fs::metadata(final_path)?.len();
            Ok(DownloadFinalization {
                path: final_path.to_path_buf(),
                bytes,
                moved: true,
            })
        }
        Err(rename_error) => match copy_then_remove(source, final_path) {
            Ok(bytes) => Ok(DownloadFinalization {
                path: final_path.to_path_buf(),
                bytes,
                moved: true,
            }),
            Err(copy_error) => Err(anyhow::anyhow!(
                "failed to finalize download from {} to {}: rename failed: {}; copy fallback failed: {}",
                source.display(),
                final_path.display(),
                rename_error,
                copy_error
            )),
        },
    }
}

fn ensure_readable_file(path: &Path) -> Result<()> {
    let metadata = fs::metadata(path).with_context(|| {
        format!(
            "download source is not ready or does not exist yet: {}",
            path.display()
        )
    })?;
    if !metadata.is_file() {
        bail!("download source is not a file: {}", path.display());
    }
    File::open(path)
        .map(|_| ())
        .with_context(|| format!("download source is not readable yet: {}", path.display()))
}

fn copy_then_remove(source: &Path, destination: &Path) -> io::Result<u64> {
    let bytes = fs::copy(source, destination)?;
    fs::remove_file(source)?;
    Ok(bytes)
}

fn user_js_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn redact_sensitive_url_path_segments(url: &str) -> String {
    let Some(scheme_end) = url.find("://") else {
        return url.to_string();
    };
    let path_start = url[scheme_end + 3..]
        .find('/')
        .map(|index| scheme_end + 3 + index);
    let Some(path_start) = path_start else {
        return url.to_string();
    };
    let prefix = &url[..path_start];
    let path = &url[path_start..];
    let segments = path
        .split('/')
        .map(|segment| {
            let lower = segment.to_ascii_lowercase();
            if [
                "access_token",
                "auth",
                "code",
                "key",
                "password",
                "secret",
                "session",
                "token",
            ]
            .iter()
            .any(|needle| lower.contains(needle))
            {
                "[REDACTED]"
            } else {
                segment
            }
        })
        .collect::<Vec<_>>()
        .join("/");
    format!("{prefix}{segments}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_js_string_escapes_windows_paths() {
        let prefs = download_user_js_prefs(Path::new(r#"C:\Users\me\Downloads "safe""#));
        assert!(prefs.contains(r#"C:\\Users\\me\\Downloads \"safe\""#));
        assert!(prefs.contains("browser.helperApps.neverAsk.saveToDisk"));
    }

    #[test]
    fn display_url_is_redacted_and_stripped() {
        assert_eq!(
            display_download_url(Some(
                "https://example.test/download/token-secret/file?code=secret#frag"
            ))
            .unwrap(),
            "https://example.test/download/[REDACTED]/file"
        );
        assert_eq!(
            display_download_url(Some("https://example.test/file?code=secret#frag")).unwrap(),
            "https://example.test/file"
        );
    }

    #[test]
    fn finalize_download_moves_file_and_creates_parent() {
        let temp = tempfile::tempdir().unwrap();
        let staged = temp.path().join("staged.txt");
        fs::write(&staged, "hello").unwrap();
        let destination = temp.path().join("out").join("file.txt");
        let result = finalize_download(&staged, Some(&destination)).unwrap();
        assert_eq!(result.path, destination);
        assert_eq!(result.bytes, 5);
        assert!(!staged.exists());
        assert_eq!(fs::read_to_string(result.path).unwrap(), "hello");
    }

    #[test]
    fn finalize_download_fails_when_destination_exists() {
        let temp = tempfile::tempdir().unwrap();
        let staged = temp.path().join("staged.txt");
        let destination = temp.path().join("file.txt");
        fs::write(&staged, "hello").unwrap();
        fs::write(&destination, "existing").unwrap();
        assert!(finalize_download(&staged, Some(&destination))
            .unwrap_err()
            .to_string()
            .contains("already exists"));
    }

    #[test]
    fn finalize_download_without_destination_reports_staged_file() {
        let temp = tempfile::tempdir().unwrap();
        let staged = temp.path().join("staged.txt");
        fs::write(&staged, "hello").unwrap();
        let result = finalize_download(&staged, None).unwrap();
        assert_eq!(result.path, staged);
        assert_eq!(result.bytes, 5);
        assert!(!result.moved);
    }

    #[test]
    fn sweep_old_downloads_removes_old_files() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old.txt");
        fs::write(&old, "old").unwrap();
        assert_eq!(
            sweep_old_downloads_in_dir(temp.path(), u64::MAX).unwrap(),
            1
        );
        assert!(!old.exists());
    }
}
