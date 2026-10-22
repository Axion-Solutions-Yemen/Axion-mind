#[cfg(test)]
mod tests {
    use tauri_plugin_updater::{Update, UpdaterExt};

    #[test]
    fn test_updater_api() {
        fn _check_update(u: &Update) {
            let _version: &String = &u.version;
            let _current_version: &String = &u.current_version;
            let _body: &Option<String> = &u.body;
        }

        async fn _check_download(u: Update) {
            let _ = u.download_and_install(|_chunk_len, _total_len| {}, || {}).await;
        }

        async fn _check_handle(app: &tauri::AppHandle) -> Result<Option<String>, String> {
            let updater = app.updater().map_err(|e| e.to_string())?;
            let _ = updater.check().await.map_err(|e| e.to_string())?;
            let url = "http://127.0.0.1:9999".parse().unwrap();
            let _custom_updater = app.updater_builder().endpoints(vec![url]).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())?;
            Ok(None)
        }
    }

    #[test]
    fn test_minisign_signature_verification() {
        let pubkey_str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEQzQzVDMzIwQzk3MDQ0NUEKUldSYVJIREpJTVBGMCtuM05LUkNadEZnWHBVZXRRMWw0WlBwRE5QNGJ4cm80SkNpQmIvT3dmN2cK";
        let decoded_pub = String::from_utf8(base64::Engine::decode(&base64::engine::general_purpose::STANDARD, pubkey_str).unwrap()).unwrap();
        let key_line = decoded_pub.lines().nth(1).unwrap();
        let pubkey = minisign_verify::PublicKey::from_base64(key_line).expect("Valid public key");

        let sig_str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSYVJIREpJTVBGMCtWaXNNcFFVTmlkbGpRTCs2MnhJWCt2RDlXaE4vdjNhU2Y4YjFxVzM3bFZ6aVRXWW8zY1BQNTU3MTdjQlA0SEdqaGRndDg5L0NOaXUyT1kwQ1o0N0FrPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkyNjk1ODE3CWZpbGU6dGVzdC1idW5kbGUuemlwCXZlcnNpb246MC4yLjEKYkNMVnIvWlF3enEwZVFnaVNuNU42OWRtNnM3TUtqMmZnTkJHbHRTT3A1cXYwRTJkenFxWXNOWFZ3UHQvT0Q2Wk8xNU16ZDRnTkEvT3JHcERjS21aQXc9PQo=";
        let decoded_sig = String::from_utf8(base64::Engine::decode(&base64::engine::general_purpose::STANDARD, sig_str).unwrap()).unwrap();
        println!("DECODED_SIG:\n{}", decoded_sig);
        let sig = minisign_verify::Signature::decode(&decoded_sig).expect("Valid signature");
        let valid_data = b"dummy-zip-data";

        // Positive control: Exact valid data matches
        assert!(pubkey.verify(valid_data, &sig, false).is_ok());

        // Negative control: Tampered payload fails verification
        let tampered_data = b"malicious-payload";
        assert!(pubkey.verify(tampered_data, &sig, false).is_err());
    }
}
