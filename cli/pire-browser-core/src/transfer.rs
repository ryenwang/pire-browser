use std::collections::HashMap;
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const TRANSFER_TTL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferMeta {
    pub transfer_id: String,
    pub mime_type: String,
    pub byte_length: usize,
    pub sha256: String,
}

pub type ScreenshotTransferMeta = TransferMeta;
pub type ResultTransferMeta = TransferMeta;

#[derive(Debug)]
struct Transfer {
    total: u32,
    chunks: Vec<Option<String>>,
    started_at: Instant,
}

#[derive(Debug, Default)]
pub struct TransferStore {
    transfers: HashMap<String, Transfer>,
}

impl TransferStore {
    pub fn add_chunk(
        &mut self,
        transfer_id: String,
        index: u32,
        total: u32,
        _byte_length: usize,
        _sha256: String,
        data: String,
    ) -> Result<()> {
        self.cleanup_expired();
        if index >= total {
            bail!("invalid screenshot chunk index {index} for total {total}");
        }
        let transfer = self
            .transfers
            .entry(transfer_id)
            .or_insert_with(|| Transfer {
                total,
                chunks: vec![None; total as usize],
                started_at: Instant::now(),
            });
        if transfer.total != total {
            bail!("screenshot transfer total changed");
        }
        transfer.chunks[index as usize] = Some(data);
        Ok(())
    }

    pub fn complete(&mut self, meta: &ScreenshotTransferMeta) -> Result<Vec<u8>> {
        self.cleanup_expired();
        let transfer = self
            .transfers
            .remove(&meta.transfer_id)
            .ok_or_else(|| anyhow!("missing screenshot transfer {}", meta.transfer_id))?;

        let mut encoded = String::new();
        for (index, chunk) in transfer.chunks.into_iter().enumerate() {
            let chunk = chunk.ok_or_else(|| anyhow!("missing screenshot chunk {index}"))?;
            encoded.push_str(&chunk);
        }

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .context("failed to decode screenshot base64")?;
        if bytes.len() != meta.byte_length {
            bail!(
                "screenshot byte length mismatch: expected {}, got {}",
                meta.byte_length,
                bytes.len()
            );
        }
        let actual = hex::encode(Sha256::digest(&bytes));
        if actual != meta.sha256 {
            bail!("screenshot checksum mismatch");
        }
        Ok(bytes)
    }

    pub fn cleanup_expired(&mut self) {
        self.transfers
            .retain(|_, transfer| transfer.started_at.elapsed() <= TRANSFER_TTL);
    }

    pub fn clear(&mut self) {
        self.transfers.clear();
    }
}

#[cfg(test)]
mod tests {
    use base64::Engine;

    use super::*;

    #[test]
    fn reassembles_and_verifies_chunks() {
        let bytes = b"hello screenshot";
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        let sha = hex::encode(Sha256::digest(bytes));
        let mut store = TransferStore::default();
        store
            .add_chunk(
                "x".into(),
                0,
                2,
                bytes.len(),
                sha.clone(),
                encoded[..8].into(),
            )
            .unwrap();
        store
            .add_chunk(
                "x".into(),
                1,
                2,
                bytes.len(),
                sha.clone(),
                encoded[8..].into(),
            )
            .unwrap();
        let meta = ScreenshotTransferMeta {
            transfer_id: "x".into(),
            mime_type: "image/png".into(),
            byte_length: bytes.len(),
            sha256: sha,
        };
        assert_eq!(store.complete(&meta).unwrap(), bytes);
    }
}
