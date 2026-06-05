#[cfg(windows)]
mod windows_ipc {
    use std::ffi::OsStr;
    use std::io::{Error, ErrorKind};
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;
    use std::time::{Duration, Instant};

    use anyhow::{bail, Context, Result};
    use sha2::{Digest, Sha256};
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, LocalFree, ERROR_BROKEN_PIPE, ERROR_PIPE_CONNECTED,
        GENERIC_READ, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::Security::Authorization::{
        ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
        SDDL_REVISION_1,
    };
    use windows_sys::Win32::Security::{
        GetTokenInformation, TokenUser, PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES, TOKEN_QUERY,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FlushFileBuffers, ReadFile, WriteFile, FILE_ATTRIBUTE_NORMAL, OPEN_EXISTING,
        PIPE_ACCESS_DUPLEX,
    };
    use windows_sys::Win32::System::Pipes::{
        ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, PeekNamedPipe, PIPE_READMODE_BYTE,
        PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
    };
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken, Sleep};

    struct Handle(HANDLE);

    unsafe impl Send for Handle {}

    impl Handle {
        fn new(handle: HANDLE) -> Result<Self> {
            if handle == INVALID_HANDLE_VALUE || handle.is_null() {
                bail!("invalid Windows handle: {}", Error::last_os_error());
            }
            Ok(Self(handle))
        }
    }

    impl Drop for Handle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }

    struct LocalPtr(*mut core::ffi::c_void);

    const DEFAULT_PIPE_RESPONSE_TIMEOUT: Duration = Duration::from_secs(35);

    impl Drop for LocalPtr {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    LocalFree(self.0);
                }
            }
        }
    }

    fn wide(value: impl AsRef<OsStr>) -> Vec<u16> {
        value.as_ref().encode_wide().chain(Some(0)).collect()
    }

    pub fn current_user_sid_string() -> Result<String> {
        let mut token: HANDLE = null_mut();
        unsafe {
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                bail!("OpenProcessToken failed: {}", Error::last_os_error());
            }
        }
        let token = Handle::new(token)?;

        let mut needed = 0u32;
        unsafe {
            GetTokenInformation(token.0, TokenUser, null_mut(), 0, &mut needed);
        }
        if needed == 0 {
            bail!("GetTokenInformation did not report TokenUser size");
        }

        let mut buffer = vec![0u8; needed as usize];
        unsafe {
            if GetTokenInformation(
                token.0,
                TokenUser,
                buffer.as_mut_ptr() as *mut _,
                needed,
                &mut needed,
            ) == 0
            {
                bail!("GetTokenInformation failed: {}", Error::last_os_error());
            }
        }

        #[repr(C)]
        struct TokenUserLocal {
            user: windows_sys::Win32::Security::SID_AND_ATTRIBUTES,
        }
        let token_user = unsafe { &*(buffer.as_ptr() as *const TokenUserLocal) };
        let mut sid_ptr = null_mut();
        unsafe {
            if ConvertSidToStringSidW(token_user.user.Sid, &mut sid_ptr) == 0 {
                bail!("ConvertSidToStringSidW failed: {}", Error::last_os_error());
            }
        }
        let _guard = LocalPtr(sid_ptr as *mut _);
        let mut len = 0usize;
        unsafe {
            while *sid_ptr.add(len) != 0 {
                len += 1;
            }
            Ok(String::from_utf16_lossy(std::slice::from_raw_parts(
                sid_ptr, len,
            )))
        }
    }

    pub fn pipe_name_for_session(session_id: &str) -> Result<String> {
        let sid = current_user_sid_string()?;
        let hash = Sha256::digest(sid.as_bytes());
        let user_hash = hex::encode(&hash[..6]);
        Ok(format!(r"\\.\pipe\pire-browser-{user_hash}-{session_id}"))
    }

    struct SecurityDescriptor {
        ptr: PSECURITY_DESCRIPTOR,
    }

    impl SecurityDescriptor {
        fn for_current_user() -> Result<Self> {
            let sid = current_user_sid_string()?;
            let sddl = format!("D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GA;;;{sid})");
            let mut ptr: PSECURITY_DESCRIPTOR = null_mut();
            unsafe {
                if ConvertStringSecurityDescriptorToSecurityDescriptorW(
                    wide(sddl).as_ptr(),
                    SDDL_REVISION_1,
                    &mut ptr,
                    null_mut(),
                ) == 0
                {
                    bail!(
                        "ConvertStringSecurityDescriptorToSecurityDescriptorW failed: {}",
                        Error::last_os_error()
                    );
                }
            }
            Ok(Self { ptr })
        }
    }

    impl Drop for SecurityDescriptor {
        fn drop(&mut self) {
            if !self.ptr.is_null() {
                unsafe {
                    LocalFree(self.ptr as *mut _);
                }
            }
        }
    }

    pub fn run_pipe_server(
        pipe_name: String,
        stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
        handler: impl Fn(String) -> String + Send + Sync + 'static,
    ) -> Result<()> {
        let handler = std::sync::Arc::new(handler);
        let name = wide(&pipe_name);
        let security = SecurityDescriptor::for_current_user()?;

        while !stop.load(std::sync::atomic::Ordering::SeqCst) {
            let attrs = SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: security.ptr,
                bInheritHandle: 0,
            };
            let raw = unsafe {
                CreateNamedPipeW(
                    name.as_ptr(),
                    PIPE_ACCESS_DUPLEX,
                    PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                    PIPE_UNLIMITED_INSTANCES,
                    1024 * 1024,
                    1024 * 1024,
                    0,
                    &attrs,
                )
            };
            let handle = Handle::new(raw).context("failed to create named pipe")?;
            let connected = unsafe { ConnectNamedPipe(handle.0, null_mut()) };
            if connected == 0 {
                let err = unsafe { GetLastError() };
                if err != ERROR_PIPE_CONNECTED {
                    // Some clients can connect in the small window before ConnectNamedPipe.
                    // Attempting the read gives us a chance to serve them instead of
                    // immediately dropping the pipe.
                }
            }

            if let Ok(request) = read_line(handle.0) {
                let response = handler(request);
                let _ = write_all(handle.0, response.as_bytes());
                let _ = write_all(handle.0, b"\n");
                unsafe {
                    FlushFileBuffers(handle.0);
                }
            }
            unsafe {
                DisconnectNamedPipe(handle.0);
            }
        }
        Ok(())
    }

    pub fn send_pipe_request(pipe_name: &str, request: &str) -> Result<String> {
        send_pipe_request_with_timeout(pipe_name, request, DEFAULT_PIPE_RESPONSE_TIMEOUT)
    }

    fn send_pipe_request_with_timeout(
        pipe_name: &str,
        request: &str,
        response_timeout: Duration,
    ) -> Result<String> {
        let name = wide(pipe_name);
        let mut last_error = None;
        for _ in 0..20 {
            let raw = unsafe {
                CreateFileW(
                    name.as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    0,
                    null_mut(),
                    OPEN_EXISTING,
                    FILE_ATTRIBUTE_NORMAL,
                    null_mut(),
                )
            };
            if raw != INVALID_HANDLE_VALUE {
                let handle = Handle::new(raw)?;
                write_all(handle.0, request.as_bytes())?;
                write_all(handle.0, b"\n")?;
                return read_line_with_timeout(handle.0, response_timeout)
                    .with_context(|| format!("timed out waiting for response from {pipe_name}"));
            }
            last_error = Some(Error::last_os_error());
            unsafe {
                Sleep(50);
            }
        }
        bail!(
            "failed to connect to pire-browser pipe {pipe_name}: {}",
            last_error.unwrap_or_else(|| Error::new(ErrorKind::TimedOut, "timed out"))
        )
    }

    fn read_line(handle: HANDLE) -> Result<String> {
        read_line_with_timeout(handle, Duration::MAX)
    }

    fn read_line_with_timeout(handle: HANDLE, timeout: Duration) -> Result<String> {
        let mut out = Vec::new();
        let mut byte = [0u8; 1];
        let deadline = Instant::now().checked_add(timeout);
        loop {
            let mut available = 0u32;
            let peek_ok = unsafe {
                PeekNamedPipe(
                    handle,
                    null_mut(),
                    0,
                    null_mut(),
                    &mut available,
                    null_mut(),
                )
            };
            if peek_ok == 0 {
                let err = unsafe { GetLastError() };
                if err == ERROR_BROKEN_PIPE && !out.is_empty() {
                    break;
                }
                bail!("PeekNamedPipe failed: {}", Error::last_os_error());
            }
            if available == 0 {
                if deadline
                    .map(|deadline| Instant::now() >= deadline)
                    .unwrap_or(false)
                {
                    bail!("timed out waiting for pire-browser pipe response");
                }
                std::thread::sleep(Duration::from_millis(5));
                continue;
            }

            let mut read = 0u32;
            let ok = unsafe {
                ReadFile(
                    handle,
                    byte.as_mut_ptr() as *mut _,
                    1,
                    &mut read,
                    null_mut(),
                )
            };
            if ok == 0 {
                let err = unsafe { GetLastError() };
                if err == ERROR_BROKEN_PIPE && !out.is_empty() {
                    break;
                }
                bail!("ReadFile failed: {}", Error::last_os_error());
            }
            if read == 0 {
                std::thread::sleep(Duration::from_millis(5));
                continue;
            }
            if byte[0] == b'\n' {
                break;
            }
            out.push(byte[0]);
        }
        Ok(String::from_utf8(out)?)
    }

    fn write_all(handle: HANDLE, mut data: &[u8]) -> Result<()> {
        while !data.is_empty() {
            let mut written = 0u32;
            let ok = unsafe {
                WriteFile(
                    handle,
                    data.as_ptr() as *const _,
                    data.len() as u32,
                    &mut written,
                    null_mut(),
                )
            };
            if ok == 0 {
                bail!("WriteFile failed: {}", Error::last_os_error());
            }
            data = &data[written as usize..];
        }
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        #[test]
        fn pipe_name_contains_session() {
            let name = pipe_name_for_session("abc").unwrap();
            assert!(name.contains("abc"));
            assert!(name.starts_with(r"\\.\pipe\pire-browser-"));
        }

        #[test]
        fn named_pipe_round_trips_response_before_disconnect() {
            let pipe_name = pipe_name_for_session(&format!("test-{}", std::process::id())).unwrap();
            let stop = Arc::new(AtomicBool::new(false));
            let server_stop = stop.clone();
            let server_pipe = pipe_name.clone();
            let server = std::thread::spawn(move || {
                run_pipe_server(server_pipe, server_stop, |line| format!("echo:{line}")).unwrap();
            });

            std::thread::sleep(Duration::from_millis(100));
            let response = send_pipe_request(&pipe_name, "ping").unwrap();
            assert_eq!(response, "echo:ping");

            stop.store(true, Ordering::SeqCst);
            let _ = send_pipe_request(&pipe_name, "stop");
            server.join().unwrap();
        }

        #[test]
        fn named_pipe_response_read_is_bounded() {
            let pipe_name = pipe_name_for_session(&format!("slow-{}", std::process::id())).unwrap();
            let stop = Arc::new(AtomicBool::new(false));
            let server_stop = stop.clone();
            let server_pipe = pipe_name.clone();
            let server = std::thread::spawn(move || {
                run_pipe_server(server_pipe, server_stop, |_line| {
                    std::thread::sleep(Duration::from_millis(500));
                    "too late".to_string()
                })
                .unwrap();
            });

            std::thread::sleep(Duration::from_millis(100));
            let err = send_pipe_request_with_timeout(&pipe_name, "ping", Duration::from_millis(25))
                .unwrap_err();
            assert!(format!("{err:#}").contains("timed out waiting for response"));

            stop.store(true, Ordering::SeqCst);
            std::thread::sleep(Duration::from_millis(600));
            let _ = send_pipe_request(&pipe_name, "stop");
            server.join().unwrap();
        }
    }
}

#[cfg(windows)]
pub use windows_ipc::{
    current_user_sid_string, pipe_name_for_session, run_pipe_server, send_pipe_request,
};

#[cfg(unix)]
mod unix_ipc {
    use std::fs;
    use std::io::{BufRead, BufReader, Write};
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::net::{UnixListener, UnixStream};
    use std::path::{Path, PathBuf};
    use std::time::Duration;

    use anyhow::{bail, Context, Result};
    use sha2::{Digest, Sha256};

    use crate::platform::runtime_dir;
    use crate::protocol::PRODUCT_NAME;

    const DEFAULT_SOCKET_RESPONSE_TIMEOUT: Duration = Duration::from_secs(35);
    const MAX_UNIX_SOCKET_PATH_BYTES: usize = 100;

    pub fn pipe_name_for_session(session_id: &str) -> Result<String> {
        let root = runtime_dir()?;
        let uid = unsafe { libc::geteuid() };
        let socket = socket_path_for_session(&root, uid, session_id);
        Ok(socket.to_string_lossy().to_string())
    }

    fn socket_path_for_session(root: &Path, uid: libc::uid_t, session_id: &str) -> PathBuf {
        let file_name = socket_file_name(session_id);
        let candidate = root.join(&file_name);
        if unix_path_len(&candidate) <= MAX_UNIX_SOCKET_PATH_BYTES {
            return candidate;
        }
        PathBuf::from("/tmp")
            .join(format!("{PRODUCT_NAME}-{uid}"))
            .join(file_name)
    }

    fn socket_file_name(session_id: &str) -> String {
        let hash = Sha256::digest(session_id.as_bytes());
        format!("s-{}.sock", hex::encode(&hash[..8]))
    }

    fn unix_path_len(path: &Path) -> usize {
        path.as_os_str().as_bytes().len()
    }

    pub fn run_pipe_server(
        pipe_name: String,
        stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
        handler: impl Fn(String) -> String + Send + Sync + 'static,
    ) -> Result<()> {
        let path = PathBuf::from(&pipe_name);
        let parent = path.parent().context("Unix socket path has no parent")?;
        fs::create_dir_all(parent)?;
        fs::set_permissions(parent, fs::Permissions::from_mode(0o700))?;
        if path.exists() {
            let _ = fs::remove_file(&path);
        }
        let listener = UnixListener::bind(&path)
            .with_context(|| format!("failed to bind pire-browser socket {}", path.display()))?;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
        for stream in listener.incoming() {
            if stop.load(std::sync::atomic::Ordering::SeqCst) {
                break;
            }
            let Ok(mut stream) = stream else {
                continue;
            };
            if let Ok(request) = read_line(&stream, None) {
                let response = handler(request);
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.write_all(b"\n");
                let _ = stream.flush();
            }
        }
        let _ = fs::remove_file(&path);
        Ok(())
    }

    pub fn send_pipe_request(pipe_name: &str, request: &str) -> Result<String> {
        let mut last_error = None;
        for _ in 0..20 {
            match UnixStream::connect(pipe_name) {
                Ok(mut stream) => {
                    stream
                        .set_read_timeout(Some(DEFAULT_SOCKET_RESPONSE_TIMEOUT))
                        .ok();
                    stream.write_all(request.as_bytes())?;
                    stream.write_all(b"\n")?;
                    stream.flush()?;
                    return read_line(&stream, Some(DEFAULT_SOCKET_RESPONSE_TIMEOUT)).with_context(
                        || format!("timed out waiting for response from {pipe_name}"),
                    );
                }
                Err(err) => {
                    last_error = Some(err);
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
        }
        bail!(
            "failed to connect to pire-browser socket {pipe_name}: {}",
            last_error
                .map(|err| err.to_string())
                .unwrap_or_else(|| "timed out".to_string())
        )
    }

    fn read_line(stream: &UnixStream, _timeout: Option<Duration>) -> Result<String> {
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        reader.read_line(&mut line)?;
        Ok(line.trim_end_matches(['\r', '\n']).to_string())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        #[test]
        fn unix_socket_name_is_short_and_session_derived() {
            let name = pipe_name_for_session("abc").unwrap();
            assert!(name.contains("pire-browser-"));
            assert!(name.len() < 104, "{name}");
        }

        #[test]
        fn unix_socket_path_falls_back_when_runtime_root_is_too_long() {
            let long_root = PathBuf::from(format!("/tmp/{}", "deep".repeat(30)));
            let path = socket_path_for_session(&long_root, 501, "abc");
            assert!(
                path.starts_with("/tmp/pire-browser-501"),
                "{}",
                path.display()
            );
            assert!(unix_path_len(&path) <= MAX_UNIX_SOCKET_PATH_BYTES);
        }

        #[test]
        fn unix_socket_path_uses_runtime_root_when_short() {
            let root = PathBuf::from("/tmp/pire-browser-501");
            let path = socket_path_for_session(&root, 501, "abc");
            assert!(path.starts_with(&root), "{}", path.display());
            assert!(unix_path_len(&path) <= MAX_UNIX_SOCKET_PATH_BYTES);
        }

        #[test]
        fn unix_socket_round_trips_response() {
            let pipe_name = pipe_name_for_session(&format!("test-{}", std::process::id())).unwrap();
            let stop = Arc::new(AtomicBool::new(false));
            let server_stop = stop.clone();
            let server_pipe = pipe_name.clone();
            let server = std::thread::spawn(move || {
                run_pipe_server(server_pipe, server_stop, |line| format!("echo:{line}")).unwrap();
            });
            std::thread::sleep(Duration::from_millis(100));
            let response = send_pipe_request(&pipe_name, "ping").unwrap();
            assert_eq!(response, "echo:ping");
            stop.store(true, Ordering::SeqCst);
            let _ = send_pipe_request(&pipe_name, "stop");
            server.join().unwrap();
        }
    }
}

#[cfg(unix)]
pub use unix_ipc::{pipe_name_for_session, run_pipe_server, send_pipe_request};

#[cfg(not(any(windows, unix)))]
pub fn pipe_name_for_session(_session_id: &str) -> anyhow::Result<String> {
    anyhow::bail!("pire-browser IPC does not support this platform")
}

#[cfg(not(any(windows, unix)))]
pub fn run_pipe_server(
    _pipe_name: String,
    _stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
    _handler: impl Fn(String) -> String + Send + Sync + 'static,
) -> anyhow::Result<()> {
    anyhow::bail!("pire-browser IPC does not support this platform")
}

#[cfg(not(any(windows, unix)))]
pub fn send_pipe_request(_pipe_name: &str, _request: &str) -> anyhow::Result<String> {
    anyhow::bail!("pire-browser IPC does not support this platform")
}
