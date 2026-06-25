use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const NATIVE_HOST_NAME: &str = "dev.pi.pire_browser";
pub const EXTENSION_ID: &str = "pire-browser@pi.local";
pub const PRODUCT_NAME: &str = "pire-browser";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcRequest {
    pub id: String,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcResponse {
    pub id: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl RpcResponse {
    pub fn ok(id: impl Into<String>, result: Value) -> Self {
        Self {
            id: id.into(),
            ok: true,
            result: Some(result),
            error: None,
        }
    }

    pub fn err(id: impl Into<String>, code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            ok: false,
            result: None,
            error: Some(RpcError {
                code: code.into(),
                message: message.into(),
                data: None,
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NativeInbound {
    Hello {
        profile_id: String,
        extension_id: String,
        extension_version: String,
    },
    Event {
        name: String,
        #[serde(default)]
        data: Value,
    },
    Response {
        id: String,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        result: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<RpcError>,
    },
    ScreenshotChunk {
        transfer_id: String,
        index: u32,
        total: u32,
        byte_length: usize,
        sha256: String,
        data: String,
    },
    ResultChunk {
        transfer_id: String,
        index: u32,
        total: u32,
        byte_length: usize,
        sha256: String,
        data: String,
    },
    UploadChunkRequest {
        request_id: String,
        transfer_id: String,
        file_index: u32,
        chunk_index: u32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NativeOutbound {
    Request {
        id: String,
        method: String,
        #[serde(default)]
        params: Value,
    },
    HostStatus {
        session_id: String,
        pipe_name: String,
    },
    UploadChunkResponse {
        request_id: String,
        ok: bool,
        transfer_id: String,
        file_index: u32,
        chunk_index: u32,
        total: u32,
        data: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<RpcError>,
    },
}
