#[path="../src/personas.rs"] mod personas;
#[path="../src/resource_id.rs"] mod resource_id;
#[path="../src/identity.rs"] mod identity;
mod config { pub struct Config {pub custom_storage_dir:Option<String>} pub fn load_config()->Config {Config{custom_storage_dir:None}} }
mod app_paths {
 pub fn hub()->Result<std::path::PathBuf,String>{Ok(ROOT.get().unwrap().clone())}
 pub fn sandbox()->Result<Option<std::path::PathBuf>,String>{Ok(Some(hub()?))}
 pub static ROOT:std::sync::OnceLock<std::path::PathBuf>=std::sync::OnceLock::new();
}
mod auth {
 pub static ACCOUNT:std::sync::Mutex<Option<serde_json::Value>>=std::sync::Mutex::new(None);
 pub struct SessionStore;
 impl SessionStore {pub fn production()->Result<Self,String>{Ok(Self)} pub fn read(&self)->Result<Option<serde_json::Value>,String>{Ok(ACCOUNT.lock().unwrap().clone())}}
}
#[test]
fn switching_accounts_isolates_chat_enumeration_and_old_identifiers() {
 let root=std::env::temp_dir().join(format!("axion-principal-{}",rand::random::<u128>()));std::fs::create_dir(&root).unwrap();app_paths::ROOT.set(root.clone()).unwrap();
 *auth::ACCOUNT.lock().unwrap()=Some(serde_json::json!({"id":"account-a"}));
 let a=personas::get_app_data_dir().unwrap();let session=personas::create_agent_session("sample",None).unwrap();
 personas::save_chat(&session.id,&[personas::ChatMessage{request_id:None,role:"user".into(),content:"A PRIVATE SYNTHETIC".into(),timestamp:None,model:None}]).unwrap();
 *auth::ACCOUNT.lock().unwrap()=Some(serde_json::json!({"id":"account-b"}));
 let b=personas::get_app_data_dir().unwrap();
 assert_ne!(a,b,"verified account identity must change the vault, even in one workspace");
 assert!(personas::list_agent_sessions("sample").unwrap().is_empty());
 assert!(personas::load_chat(&session.id).is_err(),"a foreign session ID must be refused");
 *auth::ACCOUNT.lock().unwrap()=None;
 assert_ne!(personas::get_app_data_dir().unwrap(),a);
 *auth::ACCOUNT.lock().unwrap()=Some(serde_json::json!({"id":"account-a"}));
 assert_eq!(personas::load_chat(&session.id).unwrap()[0].content,"A PRIVATE SYNTHETIC");
 std::fs::remove_dir_all(root).unwrap();
}
