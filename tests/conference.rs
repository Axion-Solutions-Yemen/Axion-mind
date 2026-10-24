// Conference behavior contract: run before implementation for the red slice.
#[path = "../src/chat_cancel.rs"]
mod chat_cancel;
#[path = "../src/conference.rs"]
mod conference;
mod config {
    #[derive(Clone)]
    pub struct AppConfig {
        pub mode: String,
        pub cloud_provider: String,
        pub cloud_model: String,
        pub custom_model: String,
    }
    pub fn load_config() -> AppConfig {
        panic!("unit fixture must not load application credentials")
    }
}
mod personas {
    pub fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
        panic!("unit fixture must use explicit isolated root")
    }
}
mod backup {
    pub fn scope_id(root: &std::path::Path) -> Result<String, String> {
        Ok(root.to_string_lossy().into())
    }
}
mod llm {
    #[derive(Clone)]
    pub enum ChatStreamEvent {
        Thinking { delta: String },
        Token { delta: String },
        Done { elapsed_sec: f64 },
        Error { message: String },
    }
    pub async fn stream_model_chat<F: FnMut(ChatStreamEvent) -> Result<(), String>>(
        provider: &str,
        model: &str,
        system: &str,
        message: &str,
        cancellation: &mut crate::chat_cancel::RequestGuard,
        mut callback: F,
    ) -> Result<(), String> {
        assert_eq!(provider, "custom_gateway");
        assert!(model.starts_with("exact-"));
        assert!(!message.contains("PRIVATE CHAT MUST NEVER BE READ"));
        if model == "exact-alpha" {
            assert!(system.starts_with("ACTUAL ALPHA PROMPT"));
        }
        if model == "exact-beta" {
            assert!(system.starts_with("ACTUAL BETA PROMPT"));
        }
        if model == "exact-__hermes__" {
            assert!(system.contains("discussion-only"));
            assert!(message.contains("answer exact-alpha"));
        }
        callback(ChatStreamEvent::Thinking {
            delta: "reasoning".into(),
        })?;
        callback(ChatStreamEvent::Token {
            delta: format!("answer {model}"),
        })?;
        if message.contains("FAIL_FIXTURE") {
            return Err("Fixture provider failure".into());
        }
        if message.contains("STOP_FIXTURE") {
            cancellation
                .run(async {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    Ok(())
                })
                .await?;
        }
        callback(ChatStreamEvent::Done { elapsed_sec: 0.1 })
    }
}
use conference::{ConferenceStore, ParticipantInput};
fn fixture() -> (std::path::PathBuf, ConferenceStore) {
    let path = std::env::current_dir()
        .unwrap()
        .join("target/conference-fixtures")
        .join(format!("native-{}", rand::random::<u128>()));
    std::fs::create_dir_all(path.join("chats")).unwrap();
    std::fs::write(path.join("personas.json"),r#"[{"id":"alpha","name":"Alex","system_prompt":"ACTUAL ALPHA PROMPT"},{"id":"beta","name":"Alex","system_prompt":"ACTUAL BETA PROMPT"},{"id":"grace","name":"Grace Hopper","system_prompt":"ACTUAL GRACE PROMPT"}]"#).unwrap();
    std::fs::write(
        path.join("chats/private.json"),
        "PRIVATE CHAT MUST NEVER BE READ",
    )
    .unwrap();
    let store = ConferenceStore::new(path.clone());
    (path, store)
}
fn p(id: &str) -> ParticipantInput {
    ParticipantInput {
        id: id.into(),
        model: format!("exact-{id}"),
        provider: "custom_gateway".into(),
    }
}
#[test]
fn durable_room_reopen_edit_and_targeting() {
    let (path, store) = fixture();
    let room = store
        .create(
            "Test topic",
            vec![p("alpha"), p("beta"), p("grace"), p("__hermes__")],
        )
        .unwrap();
    assert_eq!(store.get(&room.id).unwrap().topic, "Test topic");
    assert!(
        conference::select_speakers(&room.participants, "@Alex please answer")
            .unwrap_err()
            .contains("Ambiguous")
    );
    let selected =
        conference::select_speakers(&room.participants, "@Grace Hopper please answer").unwrap();
    assert_eq!(
        selected.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(),
        vec!["grace", "__hermes__"]
    );
    assert!(conference::select_speakers(&room.participants, "@missing answer").is_err());
    assert_eq!(
        store
            .update(&room.id, vec![p("beta")])
            .unwrap()
            .participants[0]
            .model,
        "exact-beta"
    );
    assert_eq!(
        std::fs::read_to_string(path.join("chats/private.json")).unwrap(),
        "PRIVATE CHAT MUST NEVER BE READ"
    );
    std::fs::remove_dir_all(path).unwrap();
}
#[test]
fn pending_and_partial_turns_recover_honestly_and_reject_path_escape() {
    let (path, store) = fixture();
    let room = store.create("Topic", vec![p("alpha"), p("beta")]).unwrap();
    let started = store.begin_round(&room.id, "hello", "req-crash").unwrap();
    assert_eq!(started.transcript.len(), 3);
    store
        .append_delta(&room.id, "req-crash", 1, "partial", false)
        .unwrap();
    let recovered = store.get(&room.id).unwrap();
    assert_eq!(recovered.status, "interrupted");
    assert_eq!(recovered.transcript[1].content, "partial");
    assert_eq!(recovered.transcript[1].status, "interrupted");
    assert_eq!(recovered.transcript[2].status, "interrupted");
    assert!(store.get("../outside").is_err());
    assert!(store.create("Topic", vec![p("missing")]).is_err());
    assert!(store.create("", vec![p("alpha")]).is_err());
    std::fs::remove_dir_all(path).unwrap();
}

#[tokio::test]
async fn native_runner_is_sequential_exact_scoped_and_reuses_room_history() {
    let (path, store) = fixture();
    let room = store
        .create("Sequential", vec![p("alpha"), p("beta"), p("__hermes__")])
        .unwrap();
    let mut snapshots = Vec::new();
    let result = conference::run(store, "scope-fixture", &room.id, "Discuss", "run-1", |r| {
        snapshots.push(r.clone())
    })
    .await
    .unwrap();
    assert_eq!(result.status, "completed");
    assert_eq!(result.transcript.len(), 4);
    assert!(snapshots
        .iter()
        .any(|r| r.transcript[1].content == "answer exact-alpha"
            && r.transcript[2].status == "pending"));
    let store = ConferenceStore::new(path.clone());
    assert_eq!(store.get(&room.id).unwrap().transcript.len(), 4);
    let result = conference::run(
        store,
        "scope-fixture",
        &room.id,
        "@alpha follow up",
        "run-2",
        |_| {},
    )
    .await
    .unwrap();
    assert_eq!(result.transcript.len(), 7);
    assert_eq!(result.transcript[5].model.as_deref(), Some("exact-alpha"));
    assert_eq!(result.transcript[6].kind, "hermes");
    assert_eq!(
        std::fs::read_to_string(path.join("chats/private.json")).unwrap(),
        "PRIVATE CHAT MUST NEVER BE READ"
    );
    std::fs::remove_dir_all(path).unwrap();
}
#[tokio::test]
async fn stop_and_provider_failure_keep_partial_output_and_never_start_later_speakers() {
    for (message, status) in [("STOP_FIXTURE", "cancelled"), ("FAIL_FIXTURE", "failed")] {
        let (path, store) = fixture();
        let room = store
            .create("Failure", vec![p("alpha"), p("beta")])
            .unwrap();
        let scope = format!("scope-{}", room.id);
        let scope2 = scope.clone();
        let id = room.id.clone();
        let other = ConferenceStore::new(path.clone());
        let result = conference::run(store, &scope, &id, message, "run-stop", |r| {
            if r.status == "running"
                && r.transcript[1].content.len() > 0
                && message == "STOP_FIXTURE"
            {
                assert!(other.update(&id, vec![p("beta")]).is_err());
                assert_eq!(other.get(&id).unwrap().status, "running");
                conference::cancel(&scope2, "run-stop");
            }
        })
        .await
        .unwrap();
        assert_eq!(result.status, status);
        assert_eq!(result.transcript[1].content, "answer exact-alpha");
        assert_eq!(result.transcript[2].status, status);
        assert!(result.transcript[2].content.is_empty());
        std::fs::remove_dir_all(path).unwrap();
    }
}
#[test]
fn mentions_models_and_failed_validation_do_not_mutate_history() {
    let (path, store) = fixture();
    let room = store
        .create("Mentions", vec![p("alpha"), p("beta"), p("grace")])
        .unwrap();
    for message in [
        "@[Grace Hopper] help",
        "@\"Grace Hopper\" help",
        "@grace help",
    ] {
        assert_eq!(
            conference::select_speakers(&room.participants, message).unwrap()[0].id,
            "grace"
        );
    }
    assert_eq!(
        conference::select_speakers(&room.participants, "mail a@example.com")
            .unwrap()
            .len(),
        3
    );
    let before = std::fs::read(path.join(format!("conferences/{}.json", room.id))).unwrap();
    for message in ["@Alex help", "@unknown help", "@[unclosed"] {
        assert!(store
            .begin_round(&room.id, message, "invalid-round")
            .is_err());
    }
    let mut missing = p("alpha");
    missing.model = String::new();
    assert!(store.update(&room.id, vec![missing]).is_err());
    assert_eq!(
        std::fs::read(path.join(format!("conferences/{}.json", room.id))).unwrap(),
        before
    );
    std::fs::remove_dir_all(path).unwrap();
}
