#[path = "../src/app_paths.rs"]
#[allow(dead_code)]
mod app_paths;
#[path = "../src/auth.rs"]
#[allow(dead_code)]
mod auth;

static CALLBACK_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[test]
fn pkce_matches_rfc7636_sha256_vector() {
    assert_eq!(auth::pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
}

#[test]
fn callback_only_accepts_code_for_the_exact_random_path() {
    let path = "/auth/callback/test-random-path";
    assert_eq!(auth::parse_callback("GET /auth/callback/test-random-path?code=hello%2Bworld HTTP/1.1\r\nHost: 127.0.0.1:43821\r\n\r\n", path).unwrap(), Some("hello+world".into()));
    assert_eq!(auth::parse_callback("GET /favicon.ico HTTP/1.1\r\n\r\n", path).unwrap(), None);
    assert!(auth::parse_callback("POST /auth/callback/test-random-path?code=x HTTP/1.1\r\n\r\n", path).is_err());
    assert!(auth::parse_callback("GET /auth/callback/test-random-path?error=access_denied&error_description=secret HTTP/1.1\r\n\r\n", path).unwrap_err().contains("declined"));
    assert!(auth::parse_callback("GET /auth/callback/test-random-path?code=a&code=b HTTP/1.1\r\n\r\n", path).is_err());
}

#[test]
fn windows_session_encryption_roundtrips_and_rejects_tampering() {
    let plaintext = b"fixture-not-a-real-session-or-token";
    let ciphertext = auth::protect(plaintext).unwrap();
    assert_ne!(ciphertext, plaintext);
    assert_eq!(auth::unprotect(&ciphertext).unwrap(), plaintext);
    assert!(auth::unprotect(b"not-a-DPAPI-blob").is_err());
}

#[tokio::test]
async fn disabled_google_provider_never_opens_a_browser() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buf = [0u8; 4096];
        let n = socket.read(&mut buf).await.unwrap();
        assert!(String::from_utf8_lossy(&buf[..n]).starts_with("GET /auth/v1/settings"));
        let body = r#"{"external":{"google":false}}"#;
        socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).as_bytes()).await.unwrap();
    });
    let api = auth::AuthApi::new(&base, "public-test-key").unwrap();
    let result = auth::google_session(&api, |_| panic!("Browser must not open when provider is disabled")).await;
    assert!(result.unwrap_err().contains("not enabled"));
    server.await.unwrap();
}

#[tokio::test]
async fn oauth_pkce_callback_exchanges_code_and_validates_identity_with_fixture_server() {
    let _lock = CALLBACK_TEST_LOCK.lock().await;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use std::sync::{Arc, Mutex};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let challenge = Arc::new(Mutex::new(String::new()));
    let check_challenge = challenge.clone();
    let server = tokio::spawn(async move {
        for (expected, body) in [
            ("GET /auth/v1/settings", r#"{"external":{"google":true}}"#),
            ("POST /auth/v1/token?grant_type=pkce", r#"{"access_token":"fixture-access-token","refresh_token":"fixture-refresh-token","expires_in":3600}"#),
            ("GET /auth/v1/user", r#"{"id":"fixture-user","email":"fixture@example.test"}"#),
        ] {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            loop {
                let mut buf = [0u8; 4096];
                let n = socket.read(&mut buf).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&bytes);
                if let Some((headers, data)) = text.split_once("\r\n\r\n") {
                    let len = headers.lines().find_map(|l| l.to_lowercase().strip_prefix("content-length:").map(|x| x.trim().parse::<usize>().unwrap())).unwrap_or(0);
                    if data.len() >= len { break; }
                }
            }
            let request = String::from_utf8(bytes).unwrap();
            assert!(request.starts_with(expected));
            if expected.starts_with("POST") {
                let payload: serde_json::Value = serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
                assert_eq!(payload["auth_code"], "fixture-code");
                let verifier = payload["code_verifier"].as_str().unwrap();
                assert!(verifier.len() >= 43);
                assert_eq!(&auth::pkce_challenge(verifier), &*check_challenge.lock().unwrap());
            }
            socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).as_bytes()).await.unwrap();
        }
    });
    let api = auth::AuthApi::new(&base, "public-test-key").unwrap();
    let result = auth::google_session(&api, |url| {
        let url = reqwest::Url::parse(url).unwrap();
        let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(pairs["provider"], "google");
        assert_eq!(pairs["code_challenge_method"], "s256");
        assert!(!pairs.contains_key("code_verifier"));
        *challenge.lock().unwrap() = pairs["code_challenge"].clone();
        let redirect = pairs["redirect_to"].clone();
        assert!(redirect.starts_with("http://127.0.0.1:43821/auth/callback/"));
        tokio::spawn(async move { reqwest::get(format!("{}?code=fixture-code",redirect)).await.unwrap(); });
        Ok(())
    }).await.unwrap();
    assert_eq!(result["email"], "fixture@example.test");
    assert_eq!(result["id"], "fixture-user");
    assert_eq!(result["refresh_token"], "fixture-refresh-token");
    server.await.unwrap();
}

#[test]
fn session_store_uses_encrypted_bytes_and_can_be_cleared_without_touching_other_data() {
    let root = std::path::PathBuf::from(std::env::var("TMPDIR").expect("Hermes scratch directory must be set"))
        .join(format!("axion-auth-test-{}-{}",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap()));
    std::fs::create_dir_all(&root).unwrap();
    let path = root.join("session.dpapi");
    let store = auth::SessionStore::new(path.clone());
    let session = serde_json::json!({"token":"fixture-token-not-real", "id":"fixture", "email":"fixture@example.test"});
    assert!(store.read().unwrap().is_none());
    store.write(&session).unwrap();
    assert!(!String::from_utf8_lossy(&std::fs::read(&path).unwrap()).contains("fixture-token-not-real"));
    assert_eq!(store.read().unwrap(), Some(session));
    std::fs::write(root.join("unrelated.json"), "keep").unwrap();
    store.clear().unwrap();
    assert!(store.read().unwrap().is_none());
    assert!(root.join("unrelated.json").exists());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn native_flow_registry_rejects_overlap_and_cancels_the_current_attempt() {
    let registry = auth::FlowRegistry::default();
    let flow = registry.acquire().unwrap();
    assert!(registry.acquire().is_err());
    assert!(!flow.is_cancelled());
    registry.cancel().unwrap();
    assert!(flow.is_cancelled());
    drop(flow);
    assert!(registry.acquire().is_ok());
}

#[tokio::test]
async fn expired_session_refreshes_then_checks_user_identity_with_fixture_server() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        for (expected, status, body) in [
            ("GET /auth/v1/user", "401 Unauthorized", r#"{"error":"expired fixture"}"#),
            ("POST /auth/v1/token?grant_type=refresh_token", "200 OK", r#"{"access_token":"refreshed-fixture","refresh_token":"rotated-fixture","expires_in":3600}"#),
            ("GET /auth/v1/user", "200 OK", r#"{"id":"fixture-user","email":"fixture@example.test"}"#),
        ] {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buf = [0u8; 8192];
            let n = socket.read(&mut buf).await.unwrap();
            let request = String::from_utf8_lossy(&buf[..n]);
            assert!(request.starts_with(expected));
            socket.write_all(format!("HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", status, body.len(), body).as_bytes()).await.unwrap();
        }
    });
    let api = auth::AuthApi::new(&base,"public-fixture-key").unwrap();
    let session = serde_json::json!({"id":"fixture-user","token":"expired-fixture", "refresh_token":"refresh-fixture"});
    let verified = api.validate_or_refresh(&session).await.unwrap().unwrap();
    assert_eq!(verified["id"], "fixture-user");
    assert_eq!(verified["token"], "refreshed-fixture");
    assert_eq!(verified["refresh_token"], "rotated-fixture");
    server.await.unwrap();
}

#[tokio::test]
async fn native_cancellation_releases_the_callback_port() {
    let _lock = CALLBACK_TEST_LOCK.lock().await;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut s, _) = listener.accept().await.unwrap();
        let mut b = [0u8; 4096]; s.read(&mut b).await.unwrap();
        let body = r#"{"external":{"google":true}}"#;
        s.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).as_bytes()).await.unwrap();
    });
    let api = auth::AuthApi::new(&base,"fixture-key").unwrap();
    let result = tokio::time::timeout(std::time::Duration::from_secs(3), auth::run_google_session(&api, |_| {
        auth::AUTH_FLOWS.cancel().unwrap();
        Ok(())
    })).await.expect("Native cancellation must finish before the test watchdog");
    assert!(result.unwrap_err().contains("cancelled"));
    let port = tokio::net::TcpListener::bind("127.0.0.1:43821").await.expect("OAuth listener must have been dropped");
    drop(port);
    assert!(auth::AUTH_FLOWS.acquire().is_ok());
    server.await.unwrap();
}

#[tokio::test]
#[ignore = "Explicit live provider-readiness check; no browser login and no cloud writes"]
async fn live_supabase_google_readiness() {
    let api = auth::AuthApi::production().unwrap();
    let result = auth::run_google_session(&api, |_| Err("Provider is enabled; a human login is needed for end-to-end verification.".into())).await;
    let message = result.unwrap_err();
    println!("Live readiness: {}", message);
    assert!(message.contains("not enabled") || message.contains("default browser"));
}
