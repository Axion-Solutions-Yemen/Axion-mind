#[path = "../src/backup.rs"]
mod backup;
use serde_json::json;
use std::{fs, path::PathBuf};
fn root() -> PathBuf {
    let base=std::env::var_os("TMPDIR").map(PathBuf::from).unwrap_or_else(||dirs::data_local_dir().unwrap().join("hermes/cache/scratch"));
    let p=base.join(format!("axion-backup-test-{}",rand::random::<u128>())); fs::create_dir_all(&p).unwrap();p
}
#[test]
fn backup_scope_tracks_the_real_storage_directory() {
    let first=root();let second=root();
    let a=backup::scope_id(&first).unwrap();assert_eq!(a.len(),64);assert_eq!(a,backup::scope_id(&first.join(".")).unwrap());
    assert_ne!(a,backup::scope_id(&second).unwrap());
    assert!(backup::scope_id(&first.join("missing")).is_err());
    fs::remove_dir_all(first).unwrap();fs::remove_dir_all(second).unwrap();
}
#[test]
fn dangling_category_link_cannot_silently_disappear_from_a_backup() {
    let p=root();fs::write(p.join("personas.json"),"[]").unwrap();let target=p.join("temporary-target");fs::create_dir(&target).unwrap();let link=p.join("sessions");
    #[cfg(windows)] {
        let result=std::process::Command::new("cmd.exe").args(["/C","mklink","/J"]).arg(&link).arg(&target).output().unwrap();
        assert!(result.status.success(),"Test junction creation must succeed");
    }
    #[cfg(not(windows))] std::os::unix::fs::symlink(&target,&link).unwrap();
    fs::remove_dir(&target).unwrap();let rejected=backup::capture(&p).is_err();
    #[cfg(windows)] fs::remove_dir(&link).unwrap();
    #[cfg(not(windows))] fs::remove_file(&link).unwrap();
    fs::remove_dir_all(&p).unwrap();assert!(rejected,"An inaccessible/dangling category must not be silently omitted");
}
#[test]
fn snapshot_keeps_exact_customer_files_including_session_metadata() {
    let p=root();fs::create_dir_all(p.join("chats")).unwrap();fs::create_dir_all(p.join("sessions")).unwrap();fs::create_dir_all(p.join("personas_data/expert/frameworks")).unwrap();
    let files=[("personas.json","[ {\"id\":\"expert\"} ]\r\n"),("chats/expert_1.json","[]"),("sessions/expert.json","[]"),("personas_data/expert/frameworks/f.json","{\"price\":1234567.89}")];
    for (name,body) in files {fs::write(p.join(name),body).unwrap();}
    fs::write(p.join("config.json"),"private config must be excluded").unwrap();
    let s=backup::capture(&p).unwrap();assert_eq!(s["version"],json!(1));assert_eq!(s["files"].as_object().unwrap().len(),files.len());
    for (name,body) in files {assert_eq!(s["files"][name],json!(body));}
    fs::remove_dir_all(p).unwrap();
}
#[test]
fn recovery_is_exact_and_never_overwrites_an_existing_directory() {
    let source=root();fs::write(source.join("personas.json"),"[]\r\n").unwrap();fs::create_dir_all(source.join("personas_data/expert")).unwrap();fs::write(source.join("personas_data/expert/style.json"),"{\"voice\":\"خاص\"}").unwrap();
    let snapshot=backup::capture(&source).unwrap();let dest=source.join("recovered");
    backup::restore_new(&snapshot,&dest).unwrap();assert_eq!(backup::capture(&dest).unwrap(),snapshot);
    fs::write(dest.join("personas.json"),"[1]").unwrap();assert!(backup::restore_new(&snapshot,&dest).is_err());assert_eq!(fs::read_to_string(dest.join("personas.json")).unwrap(),"[1]");fs::remove_dir_all(source).unwrap();
}
#[test]
fn recovery_rejects_unsafe_paths_corrupt_json_and_case_aliases_without_creating_files() {
    let p=root();
    for name in ["../outside.json","/outside.json","personas_data/a/../../x","personas_data/a/file:secret","personas_data/CON.json","config.json","chats/x.json."] {
        let mut files=serde_json::Map::new();files.insert("personas.json".into(),json!("[]"));files.insert(name.into(),json!("{}"));
        assert!(backup::restore_new(&json!({"version":1,"files":files}),&p.join("bad")).is_err(),"unsafe path admitted: {name}");assert!(!p.join("bad").exists());
    }
    assert!(backup::restore_new(&json!({"version":1,"files":{"personas.json":"not json"}}),&p.join("bad")).is_err());
    assert!(backup::restore_new(&json!({"version":1,"files":{"personas.json":"[]","personas_data/A.json":"{}","personas_data/a.json":"{}"}}),&p.join("bad")).is_err());
    fs::write(p.join("personas.json"),"bad-json").unwrap();assert!(backup::capture(&p).is_err());fs::remove_dir_all(p).unwrap();
}
