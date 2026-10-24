#![allow(dead_code)]
// Exercise the real reqwest path against a local fixture; never load application config.
mod config {
    #[derive(Clone)]
    pub struct AppConfig {
        pub mode: String,
        pub hermes_gateway_url: String,
        pub hermes_auth_token: String,
        pub cloud_provider: String,
        pub cloud_api_key: String,
        pub cloud_model: String,
        pub custom_url: String,
        pub custom_auth_token: String,
        pub custom_model: String,
    }
    pub static CONFIG: std::sync::OnceLock<std::sync::Mutex<AppConfig>> =
        std::sync::OnceLock::new();
    pub fn load_config() -> AppConfig {
        CONFIG
            .get()
            .expect("fixture config")
            .lock()
            .unwrap()
            .clone()
    }
}
mod personas {
    pub fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
        Err("No private persona data in transport fixture".into())
    }
}
mod logger {
    pub fn log_debug(_: &str, _: &str) {}
    pub fn log_info(_: &str, _: &str) {}
    pub fn log_warn(_: &str, _: &str, _: Option<&str>) {}
    pub fn log_error(_: &str, _: &str, _: Option<&str>) {}
    pub fn log_perf(_: &str, _: &str, _: u128) {}
}
#[path = "../src/chat_cancel.rs"]
mod chat_cancel;
#[path = "../src/llm.rs"]
mod llm;

use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn fixture_config(url: String) -> config::AppConfig {
    config::AppConfig {
        mode: "custom_gateway".into(),
        hermes_gateway_url: "http://127.0.0.1:9".into(),
        hermes_auth_token: String::new(),
        cloud_provider: "openai".into(),
        cloud_api_key: String::new(),
        cloud_model: "wrong-cloud-default".into(),
        custom_url: url,
        custom_auth_token: String::new(),
        custom_model: "wrong-custom-default".into(),
    }
}

async fn fixture(
    body: &'static str,
    content_type: &'static str,
) -> (String, tokio::task::JoinHandle<serde_json::Value>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!(
        "http://{}/v1/chat/completions",
        listener.local_addr().unwrap()
    );
    let task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut bytes = Vec::new();
        let mut buffer = [0u8; 4096];
        let body_start = loop {
            let count = socket.read(&mut buffer).await.unwrap();
            assert!(count > 0);
            bytes.extend_from_slice(&buffer[..count]);
            if let Some(pos) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                break pos + 4;
            }
        };
        let headers = String::from_utf8_lossy(&bytes[..body_start]);
        assert!(
            headers.starts_with("POST /v1/chat/completions "),
            "conference must use completion endpoint"
        );
        let length: usize = headers
            .lines()
            .find_map(|line| {
                line.to_lowercase()
                    .strip_prefix("content-length:")
                    .map(|v| v.trim().parse().unwrap())
            })
            .unwrap();
        while bytes.len() < body_start + length {
            let count = socket.read(&mut buffer).await.unwrap();
            assert!(count > 0);
            bytes.extend_from_slice(&buffer[..count]);
        }
        let request = serde_json::from_slice(&bytes[body_start..body_start + length]).unwrap();
        let response = format!("HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        socket.write_all(response.as_bytes()).await.unwrap();
        request
    });
    (url, task)
}

#[tokio::test]
async fn conference_transport_abrupt_existing_persona_stream_is_not_success() {
    let (url, server) = fixture(
        "data: {\"choices\":[{\"delta\":{\"content\":\"partial answer\"}}]}\n\n",
        "text/event-stream",
    )
    .await;
    config::CONFIG
        .set(Mutex::new(fixture_config(url)))
        .ok()
        .unwrap();
    let events = Arc::new(Mutex::new(Vec::<serde_json::Value>::new()));
    let captured = events.clone();
    let channel = tauri::ipc::Channel::new(move |body| {
        if let tauri::ipc::InvokeResponseBody::Json(value) = body {
            captured
                .lock()
                .unwrap()
                .push(serde_json::from_str(&value).unwrap());
        }
        Ok(())
    });
    let result = llm::stream_persona_chat(
        "fixture-persona",
        "room context only",
        "actual persona prompt",
        Some("chosen-model"),
        channel,
        None,
    )
    .await;
    server.await.unwrap();
    let events = events.lock().unwrap();
    assert!(events
        .iter()
        .any(|event| event["type"] == "token" && event["delta"] == "partial answer"));
    assert!(
        !events.iter().any(|event| event["type"] == "done"),
        "abrupt provider EOF must not mark a partial answer complete"
    );
    assert!(result.is_err() || events.iter().any(|event| event["type"] == "error"));
    drop(events);
    for (body,content_type,success) in [
        ("data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"think\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"answer\"}}]}\n\ndata: [DONE]\n\n","text/event-stream",true),
        ("data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n","text/event-stream",false),
        ("data: {\"error\":{\"message\":\"fixture failure\"}}\n\n","text/event-stream",false),
        ("{}","application/json",false),
        ("{\"choices\":[{\"message\":{\"content\":\"answer\"},\"finish_reason\":\"stop\"}]}","application/json",true),
    ] {
        let(url,server)=fixture(body,content_type).await;
        *config::CONFIG.get().unwrap().lock().unwrap()=fixture_config(url);
        let mut guard=chat_cancel::register(Some(format!("transport-{}",rand::random::<u64>()))).unwrap();let mut events=Vec::new();
        let result=llm::stream_model_chat("custom_gateway","exact-selected-model","ACTUAL PERSONA PROMPT","ROOM ONLY",&mut guard,|e|{events.push(e);Ok(())}).await;
        let request=server.await.unwrap();assert_eq!(request["model"],"exact-selected-model");assert_eq!(request["messages"][0]["content"],"ACTUAL PERSONA PROMPT");assert_eq!(request["messages"][1]["content"],"ROOM ONLY");assert!(request.get("tools").is_none());
        assert_eq!(result.is_ok(),success,"{result:?}");assert_eq!(events.iter().any(|e|matches!(e,llm::ChatStreamEvent::Done{..})),success);
    }
}
