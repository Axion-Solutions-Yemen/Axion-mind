#[path="../src/chat_store.rs"] mod chat_store;
use std::path::PathBuf;
fn root()->PathBuf{let p=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-scratch").join(format!("axion-chat-store-{}",rand::random::<u64>()));std::fs::create_dir_all(p.join("chats")).unwrap();p}
#[test]
fn retry_is_exactly_once_and_preserves_unrecognized_customer_fields(){
 let p=root();let file=p.join("chats/alpha_one.json");std::fs::write(&file,r#"[{"role":"user","content":"original","custom_field":{"keep":true}}]"#).unwrap();
 for _ in 0..2 {chat_store::append_turn(&p,"alpha_one","request-1","new user","partial response",Some("fixture")).unwrap();}
 let a:serde_json::Value=serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();assert_eq!(a.as_array().unwrap().len(),3);assert_eq!(a[0]["custom_field"]["keep"],true);assert_eq!(a[1]["role"],"user");assert_eq!(a[2]["role"],"assistant");
 std::fs::remove_dir_all(p).unwrap();
}
#[test]
fn corrupt_chat_and_path_traversal_fail_without_rewriting_data(){let p=root();let file=p.join("chats/a.json");std::fs::write(&file,b"{corrupt").unwrap();assert!(chat_store::append_turn(&p,"a","request-2","u","a",None).is_err());assert_eq!(std::fs::read(&file).unwrap(),b"{corrupt");assert!(chat_store::append_turn(&p,"../outside","request-2","u","a",None).is_err());std::fs::remove_dir_all(p).unwrap();}
#[test]
fn metadata_failure_can_be_retried_without_duplicate_messages(){let p=root();std::fs::create_dir_all(p.join("sessions")).unwrap();std::fs::write(p.join("sessions/alpha.json"),b"broken index").unwrap();assert!(chat_store::append_turn(&p,"alpha_one","request-3","u","a",None).is_err());std::fs::write(p.join("sessions/alpha.json"),r#"[{"id":"alpha_one","message_count":0,"extra":"preserved"}]"#).unwrap();chat_store::append_turn(&p,"alpha_one","request-3","u","a",None).unwrap();let a:serde_json::Value=serde_json::from_slice(&std::fs::read(p.join("chats/alpha_one.json")).unwrap()).unwrap();assert_eq!(a.as_array().unwrap().len(),2);std::fs::remove_dir_all(p).unwrap();}
