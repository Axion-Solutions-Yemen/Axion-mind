use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use serde_json::{json, Value};
use std::time::Duration;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};

#[derive(Default)]
pub struct FlowRegistry { current: Mutex<Option<Arc<AtomicBool>>> }
pub struct FlowGuard<'a> { registry: &'a FlowRegistry, cancelled: Arc<AtomicBool> }
impl FlowRegistry {
    pub fn acquire(&self) -> Result<FlowGuard<'_>, String> {
        let mut slot = self.current.lock().map_err(|_| "Sign-in coordinator is unavailable.".to_string())?;
        if slot.is_some() { return Err("Google sign-in is already in progress. Finish or cancel it first.".into()); }
        let flag = Arc::new(AtomicBool::new(false));
        *slot = Some(flag.clone());
        Ok(FlowGuard { registry: self, cancelled: flag })
    }
    pub fn cancel(&self) -> Result<(), String> {
        let slot = self.current.lock().map_err(|_| "Sign-in coordinator is unavailable.".to_string())?;
        if let Some(flag) = &*slot { flag.store(true, Ordering::SeqCst); }
        Ok(())
    }
}
impl FlowGuard<'_> {
    pub fn is_cancelled(&self) -> bool { self.cancelled.load(Ordering::SeqCst) }
    async fn wait_cancelled(&self) {
        while !self.is_cancelled() { tokio::time::sleep(Duration::from_millis(25)).await; }
    }
}
impl Drop for FlowGuard<'_> {
    fn drop(&mut self) { if let Ok(mut slot) = self.registry.current.lock() { *slot = None; } }
}
pub static AUTH_FLOWS: FlowRegistry = FlowRegistry { current: Mutex::new(None) };

pub async fn run_google_session(api: &AuthApi, open: impl FnOnce(&str) -> Result<(), String>) -> Result<Value, String> {
    let guard = AUTH_FLOWS.acquire()?;
    tokio::select! {
        biased;
        _ = guard.wait_cancelled() => Err("Google sign-in cancelled.".into()),
        result = google_session(api, open) => result,
    }
}

pub const SUPABASE_URL: &str = "https://kefxeysyvtdxxdupkapa.supabase.co";
pub const PUBLIC_KEY: &str = "sb_publishable_m6nFD1nyCmeP5xMz0K_5Hw_HqIHOr2N";

pub struct SessionStore { path: std::path::PathBuf }
impl SessionStore {
    pub fn new(path: std::path::PathBuf) -> Self { Self { path } }
    pub fn production() -> Result<Self, String> {
        Ok(Self::new(crate::app_paths::hub()?.join("auth").join("session.dpapi")))
    }
    pub fn read(&self) -> Result<Option<Value>, String> {
        if !self.path.exists() { return Ok(None); }
        let metadata = std::fs::metadata(&self.path).map_err(|_| "Cannot inspect the saved account session.".to_string())?;
        if metadata.len() > 1024 * 1024 { return Err("Saved account session is too large. Please sign in again.".into()); }
        let bytes = std::fs::read(&self.path).map_err(|_| "Cannot read the saved account session.".to_string())?;
        let mut plain = unprotect(&bytes)?;
        let result = serde_json::from_slice(&plain).map(Some).map_err(|_| "Saved account session is invalid. Please sign in again.".to_string());
        plain.fill(0);
        result
    }
    pub fn write(&self, value: &Value) -> Result<(), String> {
        let mut plain = serde_json::to_vec(value).map_err(|_| "Could not encode the account session.".to_string())?;
        let encrypted = protect(&plain);
        plain.fill(0);
        let encrypted = encrypted?;
        let dir = self.path.parent().ok_or("Invalid account storage path.")?;
        std::fs::create_dir_all(dir).map_err(|_| "Cannot create encrypted account storage.".to_string())?;
        let temp = dir.join(format!("session-{}.tmp", random_secret()));
        let result = (|| {
            use std::io::Write;
            let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temp)
                .map_err(|_| "Cannot create encrypted session file.".to_string())?;
            file.write_all(&encrypted).and_then(|_| file.sync_all()).map_err(|_| "Cannot write encrypted session file.".to_string())?;
            drop(file);
            std::fs::rename(&temp, &self.path).map_err(|_| "Cannot replace encrypted session file.".to_string())
        })();
        if result.is_err() { let _ = std::fs::remove_file(&temp); }
        result
    }
    pub fn clear(&self) -> Result<(), String> {
        match std::fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err("Could not remove the saved account session.".into()),
        }
    }
}

pub struct AuthApi { base: String, key: String, client: reqwest::Client }
impl AuthApi {
    pub fn new(base: &str, key: &str) -> Result<Self, String> {
        Ok(Self { base: base.trim_end_matches('/').into(), key: key.into(),
            client: reqwest::Client::builder().timeout(Duration::from_secs(15))
                .redirect(reqwest::redirect::Policy::none()).build()
                .map_err(|_| "Could not initialize secure sign-in networking.".to_string())? })
    }
    pub fn production() -> Result<Self, String> { Self::new(SUPABASE_URL, PUBLIC_KEY) }
    async fn google_enabled(&self) -> Result<bool, String> {
        let response = self.client.get(format!("{}/auth/v1/settings", self.base))
            .header("apikey", &self.key).send().await
            .map_err(|_| "Cannot reach Supabase. Check your internet connection and try again.".to_string())?;
        if !response.status().is_success() { return Err("Supabase auth settings could not be read.".into()); }
        let value: Value = response.json().await.map_err(|_| "Invalid Supabase auth settings response.".to_string())?;
        Ok(value.pointer("/external/google").and_then(Value::as_bool) == Some(true))
    }
}

pub async fn google_session(api: &AuthApi, open: impl FnOnce(&str) -> Result<(), String>) -> Result<Value, String> {
    tokio::time::timeout(Duration::from_secs(180), async {
        if !api.google_enabled().await? {
            return Err("Google sign-in is not enabled in Supabase yet. Enable the Google provider with its Google OAuth Client ID and Client Secret, then add the Axion Mind loopback redirect URL. See GOOGLE_SIGN_IN_SETUP.md.".into());
        }
        let listener = tokio::net::TcpListener::bind("127.0.0.1:43821").await
            .map_err(|_| "The Google sign-in callback port (43821) is busy. Close another Axion Mind sign-in attempt and try again.".to_string())?;
        let verifier = random_secret();
        let path = format!("/auth/callback/{}", random_secret());
        let redirect = format!("http://127.0.0.1:43821{}", path);
        let mut authorize = reqwest::Url::parse(&format!("{}/auth/v1/authorize", api.base))
            .map_err(|_| "Invalid sign-in service URL.".to_string())?;
        authorize.query_pairs_mut().append_pair("provider", "google")
            .append_pair("redirect_to", &redirect).append_pair("code_challenge", &pkce_challenge(&verifier))
            .append_pair("code_challenge_method", "s256").append_pair("prompt", "select_account");
        open(authorize.as_str()).map_err(|_| "Could not open your default browser. Check your Windows browser settings.".to_string())?;
        let code = wait_for_callback(&listener, &path).await?;
        let response = api.client.post(format!("{}/auth/v1/token?grant_type=pkce", api.base))
            .header("apikey", &api.key).json(&json!({"auth_code": code, "code_verifier": verifier}))
            .send().await.map_err(|_| "Could not finish Google sign-in. Please try again.".to_string())?;
        if !response.status().is_success() { return Err("Google authorization code could not be exchanged. Retry sign-in and check the redirect URL configuration.".into()); }
        let session: Value = response.json().await.map_err(|_| "Invalid sign-in response.".to_string())?;
        api.validate_session(&session).await?.ok_or_else(|| "Supabase did not accept the Google account session. Please sign in again.".into())
    }).await.map_err(|_| "Google sign-in timed out. Click Continue with Google to try again.".to_string())?
}

fn random_secret() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

async fn wait_for_callback(listener: &tokio::net::TcpListener, path: &str) -> Result<String, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    loop {
        let (mut stream, peer) = listener.accept().await.map_err(|_| "Could not receive Google callback.".to_string())?;
        if !peer.ip().is_loopback() { continue; }
        let read = tokio::time::timeout(Duration::from_secs(3), async {
            let mut request = Vec::new();
            while request.len() <= 8192 {
                let mut buf = [0u8; 1024];
                let n = stream.read(&mut buf).await.map_err(|_| ())?;
                if n == 0 { return Err(()); }
                request.extend_from_slice(&buf[..n]);
                if request.windows(4).any(|w| w == b"\r\n\r\n") {
                    return String::from_utf8(request).map_err(|_| ());
                }
            }
            Err(())
        }).await;
        let request = match read { Ok(Ok(r)) => r, _ => continue };
        let parsed = parse_callback(&request, path);
        let (status, body) = match &parsed {
            Ok(Some(_)) => ("200 OK", "Completing Axion Mind sign-in. Return to the app to see the result. You can close this tab."),
            Ok(None) => ("404 Not Found", "No sign-in callback at this address."),
            Err(_) => ("400 Bad Request", "Sign-in could not be completed. Return to Axion Mind and try again."),
        };
        let response = format!("HTTP/1.1 {}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n{}", status, body.len(), body);
        let _ = tokio::time::timeout(Duration::from_secs(2), stream.write_all(response.as_bytes())).await;
        match parsed { Ok(Some(code)) => return Ok(code), Ok(None) => continue, Err(e) => return Err(e) }
    }
}

impl AuthApi {
    pub async fn validate_or_refresh(&self, session: &Value) -> Result<Option<Value>, String> {
        let verified = self.validate_session(session).await?;
        let refresh = session.get("refresh_token").and_then(Value::as_str).filter(|s| !s.is_empty());
        if let Some(value) = &verified {
            if value["expires_at"].as_i64().unwrap_or(0) > chrono::Utc::now().timestamp() + 60 || refresh.is_none() {
                return Ok(verified);
            }
        }
        let refresh = match refresh { Some(s) => s, None => return Ok(None) };
        let response = self.client.post(format!("{}/auth/v1/token?grant_type=refresh_token", self.base))
            .header("apikey", &self.key).json(&json!({"refresh_token": refresh})).send().await
            .map_err(|_| "Could not renew the account session. Check your internet connection.".to_string())?;
        if response.status() == 400 || response.status() == 401 || response.status() == 403 { return Ok(None); }
        if !response.status().is_success() { return Err("Session renewal is temporarily unavailable. Try again later.".into()); }
        let mut renewed: Value = response.json().await.map_err(|_| "Invalid account renewal response.".to_string())?;
        if !renewed.is_object() { return Ok(None); }
        if let Some(id) = session.get("id") { renewed["id"] = id.clone(); }
        self.validate_session(&renewed).await
    }

    pub async fn validate_session(&self, session: &Value) -> Result<Option<Value>, String> {
        let token = match session.get("token").or_else(|| session.get("access_token")).and_then(Value::as_str) {
            Some(t) if !t.is_empty() && t.len() <= 16384 => t,
            _ => return Ok(None),
        };
        let response = self.client.get(format!("{}/auth/v1/user", self.base)).header("apikey", &self.key)
            .bearer_auth(token).send().await.map_err(|_| "Cannot verify your account right now. Check your internet connection.".to_string())?;
        if response.status() == 401 || response.status() == 403 { return Ok(None); }
        if !response.status().is_success() { return Err("Supabase could not verify your account. Please try again later.".into()); }
        let user: Value = response.json().await.map_err(|_| "Invalid account verification response.".to_string())?;
        let id = match user.get("id").and_then(Value::as_str) { Some(s) if !s.is_empty() => s, _ => return Ok(None) };
        let email = match user.get("email").and_then(Value::as_str) { Some(s) if !s.is_empty() => s, _ => return Ok(None) };
        if let Some(expected) = session.get("id").and_then(Value::as_str) { if expected != id { return Ok(None); } }
        let now = chrono::Utc::now().timestamp();
        Ok(Some(json!({"id":id,"email":email,"token":token,
            "refresh_token":session.get("refresh_token").and_then(Value::as_str),
            "expires_at":session.get("expires_at").and_then(Value::as_i64).unwrap_or(now + session.get("expires_in").and_then(Value::as_i64).unwrap_or(3600)),
            "signed_in_at":chrono::Utc::now().to_rfc3339()})))
    }
}

#[cfg(windows)]
pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> { dpapi(data, true) }
#[cfg(windows)]
pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> { dpapi(data, false) }
#[cfg(not(windows))]
pub fn protect(_: &[u8]) -> Result<Vec<u8>, String> { Err("Encrypted account storage requires Windows.".into()) }
#[cfg(not(windows))]
pub fn unprotect(_: &[u8]) -> Result<Vec<u8>, String> { Err("Encrypted account storage requires Windows.".into()) }

#[cfg(windows)]
fn dpapi(data: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN};
    use windows_sys::Win32::Foundation::LocalFree;
    if data.is_empty() || data.len() > 1024 * 1024 { return Err("Invalid encrypted session size.".into()); }
    let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
    let ok = unsafe {
        if encrypt { CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) }
        else { CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) }
    };
    if ok == 0 { return Err("Windows could not protect or unlock this account session. Please sign in again.".into()); }
    let bytes = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        std::ptr::write_bytes(output.pbData, 0, output.cbData as usize);
        LocalFree(output.pbData as *mut core::ffi::c_void);
    }
    Ok(bytes)
}

pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn parse_callback(request: &str, expected_path: &str) -> Result<Option<String>, String> {
    if request.len() > 8192 { return Err("OAuth callback was too large.".into()); }
    let parts: Vec<_> = request.lines().next().unwrap_or("").split_whitespace().collect();
    if parts.len() != 3 || parts[0] != "GET" || !parts[1].starts_with('/') || parts[1].starts_with("//") {
        return Err("Invalid OAuth callback request.".into());
    }
    let url = reqwest::Url::parse(&format!("http://127.0.0.1:43821{}", parts[1]))
        .map_err(|_| "Invalid OAuth callback URL.".to_string())?;
    if url.path() != expected_path { return Ok(None); }
    let pairs: Vec<_> = url.query_pairs().collect();
    if pairs.iter().any(|(k, _)| k == "error" || k == "error_code") {
        return Err("Google sign-in was declined or could not be completed. Please try again.".into());
    }
    let codes: Vec<_> = pairs.iter().filter(|(k, _)| k == "code").collect();
    if codes.len() != 1 || codes[0].1.is_empty() || codes[0].1.len() > 4096 {
        return Err("No valid authorization code was returned. Check the Supabase redirect URL configuration.".into());
    }
    Ok(Some(codes[0].1.to_string()))
}
