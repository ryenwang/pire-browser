use std::io::{self, Read, Write};

use anyhow::{anyhow, bail, Context, Result};
use serde::de::DeserializeOwned;
use serde::Serialize;

const MAX_NATIVE_MESSAGE_BYTES: usize = 1024 * 1024;

pub fn read_native_message<T: DeserializeOwned>(reader: &mut impl Read) -> Result<Option<T>> {
    let mut len_buf = [0u8; 4];
    match reader.read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(err) if err.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(err) if err.kind() == io::ErrorKind::BrokenPipe => return Ok(None),
        Err(err) => return Err(err).context("failed to read native message length"),
    }

    let len = u32::from_le_bytes(len_buf) as usize;
    if len > MAX_NATIVE_MESSAGE_BYTES {
        bail!("native message too large: {len} bytes");
    }

    let mut buf = vec![0u8; len];
    reader
        .read_exact(&mut buf)
        .context("failed to read native message body")?;
    let message = serde_json::from_slice(&buf).context("failed to decode native JSON message")?;
    Ok(Some(message))
}

pub fn write_native_message<T: Serialize>(writer: &mut impl Write, message: &T) -> Result<()> {
    let buf = serde_json::to_vec(message).context("failed to encode native JSON message")?;
    if buf.len() > MAX_NATIVE_MESSAGE_BYTES {
        return Err(anyhow!("native message too large: {} bytes", buf.len()));
    }
    writer
        .write_all(&(buf.len() as u32).to_le_bytes())
        .context("failed to write native message length")?;
    writer
        .write_all(&buf)
        .context("failed to write native message body")?;
    writer.flush().context("failed to flush native message")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn round_trips_native_frame() {
        let mut buf = Vec::new();
        write_native_message(&mut buf, &json!({"hello": "world"})).unwrap();
        let decoded: Option<serde_json::Value> = read_native_message(&mut &buf[..]).unwrap();
        assert_eq!(decoded.unwrap(), json!({"hello": "world"}));
    }
}
