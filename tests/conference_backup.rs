#[path = "../src/backup.rs"]
mod backup;

use serde_json::{json, Value};
use std::{fs, path::PathBuf};

fn root() -> PathBuf {
    let path = std::env::current_dir()
        .unwrap()
        .join("target/conference-backup-tests")
        .join(format!("room-backup-{:032x}", rand::random::<u128>()));
    fs::create_dir_all(&path).unwrap();
    path
}

fn room() -> Value {
    json!({
        "version": 1, "id": "room-1", "topic": "Deal review", "created_at": "2026-10-24T00:00:00Z", "updated_at": "2026-10-24T00:00:01Z", "round":1, "status":"cancelled", "active_request_id":null,
        "participants": [{"id":"expert", "kind":"persona", "name":"Expert", "model":"fixture/exact-model", "provider":"custom_gateway"}],
        "transcript": [{"id":"turn-1", "round":1, "request_id":"request-1", "speaker_id":"expert", "speaker_name":"Expert", "model":"fixture/exact-model", "provider":"custom_gateway", "kind":"persona", "content":"Partial analysis", "thinking":"Partial reasoning", "status":"cancelled", "error":null, "created_at":"2026-10-24T00:00:00Z", "completed_at":"2026-10-24T00:00:01Z"}]
    })
}

#[test]
fn conference_snapshot_round_trip_preserves_exact_room_and_existing_chat_bytes() {
    let source = root();
    fs::create_dir(source.join("conferences")).unwrap();
    fs::create_dir(source.join("chats")).unwrap();
    fs::write(source.join("personas.json"), "[]\r\n").unwrap();
    let room_bytes = format!("{}\r\n", serde_json::to_string_pretty(&room()).unwrap());
    let chat_bytes = "[ {\"role\":\"user\",\"content\":\"Existing private conversation\"} ]\r\n";
    fs::write(source.join("conferences/room-1.json"), &room_bytes).unwrap();
    fs::write(source.join("chats/expert_1.json"), chat_bytes).unwrap();
    let snapshot = backup::capture(&source).unwrap();
    assert_eq!(snapshot["files"]["conferences/room-1.json"], room_bytes);
    assert_eq!(snapshot["files"]["chats/expert_1.json"], chat_bytes);
    let destination = source.join("restored");
    backup::restore_new(&snapshot, &destination).unwrap();
    assert_eq!(
        fs::read_to_string(destination.join("conferences/room-1.json")).unwrap(),
        room_bytes
    );
    assert_eq!(
        fs::read_to_string(destination.join("chats/expert_1.json")).unwrap(),
        chat_bytes
    );
    assert_ne!(
        backup::scope_id(&source).unwrap(),
        backup::scope_id(&destination).unwrap()
    );
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn malformed_or_mismatched_conference_files_are_rejected_before_restore() {
    let source = root();
    let mut cases = vec![
        ("conferences/../outside.json", room()),
        ("conferences/nested/room-1.json", room()),
        ("conferences/wrong-id.json", room()),
        ("conferences/room-1.json", json!([])),
        (
            "conferences/room-1.json",
            json!({"version":1,"id":"room-1","topic":"Deal review"}),
        ),
    ];
    let mut bad = room();
    bad["participants"] = json!("not participants");
    cases.push(("conferences/room-1.json", bad));
    let mut bad = room();
    bad["transcript"] = json!([{"role":"assistant"}]);
    cases.push(("conferences/room-1.json", bad));
    for (name, room) in cases {
        let mut files = serde_json::Map::new();
        files.insert("personas.json".into(), json!("[]"));
        files.insert(name.into(), json!(room.to_string()));
        let destination = source.join("bad");
        assert!(
            backup::restore_new(&json!({"version":1,"files":files}), &destination).is_err(),
            "Malformed conference was restored: {name}"
        );
        assert!(!destination.exists());
    }
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn malformed_local_conference_prevents_claiming_a_complete_backup() {
    let source = root();
    fs::create_dir(source.join("conferences")).unwrap();
    fs::write(source.join("personas.json"), "[]").unwrap();
    fs::write(source.join("conferences/room-1.json"), "{\"version\":1}").unwrap();
    assert!(
        backup::capture(&source).is_err(),
        "Malformed conference must not silently disappear from a complete backup"
    );
    fs::remove_dir_all(source).unwrap();
}

#[test]
fn zip_and_legacy_restore_validate_first_and_preserve_unrelated_data() {
    let source = root();
    fs::create_dir(source.join("conferences")).unwrap();
    fs::create_dir(source.join("chats")).unwrap();
    fs::write(source.join("personas.json"), "[]").unwrap();
    fs::write(source.join("conferences/room-1.json"), room().to_string()).unwrap();
    let zip = source.join("backup.zip");
    backup::write_zip(&source, &zip).unwrap();
    let snapshot = backup::read_zip(&zip).unwrap();
    fs::write(source.join("chats/unrelated.json"), "[]\r\n").unwrap();
    backup::restore_into(&snapshot, &source).unwrap();
    assert_eq!(
        fs::read_to_string(source.join("chats/unrelated.json")).unwrap(),
        "[]\r\n"
    );
    let mut invalid = snapshot.clone();
    invalid["files"]["conferences/room-1.json"] = json!("{}");
    invalid["files"]["personas.json"] = json!("[1]");
    assert!(backup::restore_into(&invalid, &source).is_err());
    assert_eq!(
        fs::read_to_string(source.join("personas.json")).unwrap(),
        "[]"
    );
    fs::remove_dir_all(source).unwrap();
}
