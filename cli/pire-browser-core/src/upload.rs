use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const UPLOAD_MAX_TOTAL_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadFileIdentity {
    pub path: String,
    pub canonical_path: String,
    pub name: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadFilePayload {
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub sha256: String,
    pub bytes_base64: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedUpload {
    pub files: Vec<UploadFilePayload>,
    pub identities: Vec<UploadFileIdentity>,
    pub total_bytes: u64,
}

pub fn snapshot_upload_file_identities(paths: &[PathBuf]) -> Result<Vec<UploadFileIdentity>> {
    if paths.is_empty() {
        bail!("invalid_args: upload requires at least one file");
    }
    let mut identities = Vec::with_capacity(paths.len());
    let mut total_bytes = 0u64;
    for path in paths {
        let file = read_upload_file(path)?;
        total_bytes = total_bytes
            .checked_add(file.size)
            .context("invalid_args: upload file sizes overflowed")?;
        if total_bytes > UPLOAD_MAX_TOTAL_BYTES {
            bail!(
                "invalid_args: upload file payload is too large ({} bytes; max {})",
                total_bytes,
                UPLOAD_MAX_TOTAL_BYTES
            );
        }
        identities.push(file.identity);
    }
    Ok(identities)
}

pub fn prepare_upload_files(paths: &[PathBuf]) -> Result<PreparedUpload> {
    if paths.is_empty() {
        bail!("invalid_args: upload requires at least one file");
    }
    let mut files = Vec::with_capacity(paths.len());
    let mut identities = Vec::with_capacity(paths.len());
    let mut total_bytes = 0u64;
    for path in paths {
        let file = read_upload_file(path)?;
        total_bytes = total_bytes
            .checked_add(file.size)
            .context("invalid_args: upload file sizes overflowed")?;
        if total_bytes > UPLOAD_MAX_TOTAL_BYTES {
            bail!(
                "invalid_args: upload file payload is too large ({} bytes; max {})",
                total_bytes,
                UPLOAD_MAX_TOTAL_BYTES
            );
        }
        files.push(UploadFilePayload {
            name: file.identity.name.clone(),
            mime_type: guess_mime_type(path),
            size: file.size,
            sha256: file.identity.sha256.clone(),
            bytes_base64: base64::engine::general_purpose::STANDARD.encode(&file.bytes),
        });
        identities.push(file.identity);
    }
    Ok(PreparedUpload {
        files,
        identities,
        total_bytes,
    })
}

pub fn verify_upload_file_identities(
    expected: &[UploadFileIdentity],
    actual: &[UploadFileIdentity],
) -> Result<()> {
    if expected != actual {
        bail!("invalid_args: upload file changed since confirmation; rerun the upload command");
    }
    Ok(())
}

fn read_upload_file(path: &Path) -> Result<UploadFileRead> {
    let metadata = fs::metadata(path)
        .with_context(|| format!("invalid_args: upload file not found: {}", path.display()))?;
    if !metadata.is_file() {
        bail!(
            "invalid_args: upload path is not a file: {}",
            path.display()
        );
    }
    if metadata.len() > UPLOAD_MAX_TOTAL_BYTES {
        bail!(
            "invalid_args: upload file is too large ({} bytes; max {})",
            metadata.len(),
            UPLOAD_MAX_TOTAL_BYTES
        );
    }
    let canonical = fs::canonicalize(path).with_context(|| {
        format!(
            "invalid_args: failed to resolve upload file {}",
            path.display()
        )
    })?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .context("invalid_args: upload file path must have a basename")?
        .to_string();
    let bytes = fs::read(path).with_context(|| {
        format!(
            "invalid_args: failed to read upload file {}",
            path.display()
        )
    })?;
    let size = bytes.len() as u64;
    if size != metadata.len() {
        bail!(
            "invalid_args: upload file changed while reading: {}",
            path.display()
        );
    }
    let sha256 = hex::encode(Sha256::digest(&bytes));
    Ok(UploadFileRead {
        size,
        identity: UploadFileIdentity {
            path: path.display().to_string(),
            canonical_path: canonical.display().to_string(),
            name,
            size,
            sha256,
        },
        bytes,
    })
}

fn guess_mime_type(path: &Path) -> String {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "txt" | "log" => "text/plain",
        "html" | "htm" => "text/html",
        "json" => "application/json",
        "csv" => "text/csv",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
    .to_string()
}

struct UploadFileRead {
    size: u64,
    identity: UploadFileIdentity,
    bytes: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn prepares_payloads_with_basenames_hashes_and_mime_types() {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("hello.txt");
        fs::write(&path, b"hello").unwrap();

        let prepared = prepare_upload_files(std::slice::from_ref(&path)).unwrap();
        assert_eq!(prepared.total_bytes, 5);
        assert_eq!(prepared.files[0].name, "hello.txt");
        assert_eq!(prepared.files[0].mime_type, "text/plain");
        assert_eq!(prepared.files[0].bytes_base64, "aGVsbG8=");
        assert_eq!(prepared.identities[0].path, path.display().to_string());
        assert!(prepared.identities[0].canonical_path.ends_with("hello.txt"));
        assert_eq!(prepared.identities[0].size, 5);
        assert_eq!(prepared.files[0].sha256, prepared.identities[0].sha256);
    }

    #[test]
    fn rejects_missing_directories_and_oversized_totals() {
        let temp = TempDir::new().unwrap();
        assert!(prepare_upload_files(&[temp.path().join("missing.txt")]).is_err());
        assert!(prepare_upload_files(&[temp.path().to_path_buf()]).is_err());

        let first = temp.path().join("first.bin");
        let second = temp.path().join("second.bin");
        fs::write(&first, vec![1u8; (UPLOAD_MAX_TOTAL_BYTES / 2 + 1) as usize]).unwrap();
        fs::write(
            &second,
            vec![2u8; (UPLOAD_MAX_TOTAL_BYTES / 2 + 1) as usize],
        )
        .unwrap();
        let err = prepare_upload_files(&[first, second])
            .unwrap_err()
            .to_string();
        assert!(err.contains("upload file payload is too large"));
    }

    #[test]
    fn verifies_confirmation_identities() {
        let temp = TempDir::new().unwrap();
        let path = temp.path().join("fixture.json");
        fs::write(&path, br#"{"ok":true}"#).unwrap();
        let first = snapshot_upload_file_identities(std::slice::from_ref(&path)).unwrap();
        fs::write(&path, br#"{"ok":false}"#).unwrap();
        let second = snapshot_upload_file_identities(&[path]).unwrap();
        assert!(verify_upload_file_identities(&first, &second).is_err());
    }
}
