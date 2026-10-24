#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod backup;
mod backup_policy;
mod config;
mod db;
mod llm;
mod chat_cancel;
mod chat_store;
mod conference;
mod updater;

#[tauri::command]
fn get_chat_storage_scope() -> Result<String, String> { backup::scope_id(&personas::get_app_data_dir()?) }

#[tauri::command]
fn get_conference_options()->serde_json::Value { conference::options() }
#[tauri::command]
fn list_conference_rooms(scope:String)->Result<Vec<conference::Room>,String> { conference::ConferenceStore::scoped(&scope)?.list() }
#[tauri::command]
fn get_conference_room(room_id:String,scope:String)->Result<conference::Room,String> { conference::ConferenceStore::scoped(&scope)?.get(&room_id) }
#[tauri::command]
fn create_conference_room(topic:String,participants:Vec<conference::ParticipantInput>,scope:String)->Result<conference::Room,String> { conference::ConferenceStore::scoped(&scope)?.create(&topic,participants) }
#[tauri::command]
fn update_conference_participants(room_id:String,participants:Vec<conference::ParticipantInput>,scope:String)->Result<conference::Room,String> { conference::ConferenceStore::scoped(&scope)?.update(&room_id,participants) }
#[tauri::command]
async fn stream_conference_round(room_id:String,message:String,request_id:String,scope:String,on_event:Channel<serde_json::Value>)->Result<conference::Room,String> {
    let store=conference::ConferenceStore::scoped(&scope)?;
    conference::run(store,&scope,&room_id,&message,&request_id,|room| {let _=on_event.send(serde_json::json!({"type":"room","room":room}));}).await
}
#[tauri::command]
fn cancel_conference_round(request_id:String,scope:String) { conference::cancel(&scope,&request_id); }

#[tauri::command]
async fn append_persona_turn(session_id:String, request_id:String, message:String, response:String, model:Option<String>, scope:String) -> Result<(),String> {
    tokio::task::spawn_blocking(move || {
        let root=personas::get_app_data_dir()?;
        if backup::scope_id(&root)? != scope { return Err("Storage changed during generation. Restore the original storage location before retrying this save.".into()); }
        chat_store::append_turn(&root,&session_id,&request_id,&message,&response,model.as_deref())
    }).await.map_err(|_|"Chat storage task failed".to_string())?
}
mod logger;
mod personas;

use personas::{ChatMessage, Persona};
use tauri::ipc::Channel;

#[tauri::command]
fn get_recent_logs(limit: Option<usize>) -> Result<Vec<logger::LogEntry>, String> {
    Ok(logger::AxionLogger::init().get_recent_logs(limit))
}

#[tauri::command]
async fn run_system_diagnostics() -> Result<logger::SystemDiagnosticStatus, String> {
    logger::log_info("DIAGNOSTICS", "Initiating on-demand comprehensive system health check...");
    Ok(logger::run_comprehensive_diagnostics().await)
}

#[tauri::command]
async fn export_diagnostic_report() -> Result<String, String> {
    logger::log_info("DIAGNOSTICS", "Exporting complete diagnostic bundle to disk...");
    logger::export_diagnostic_bundle().await
}

#[tauri::command]
fn log_frontend_event(level: String, tag: String, message: String, details: Option<String>) -> Result<(), String> {
    let lvl = match level.to_lowercase().as_str() {
        "error" => logger::LogLevel::Error,
        "warn" => logger::LogLevel::Warn,
        "debug" => logger::LogLevel::Debug,
        "perf" => logger::LogLevel::Perf,
        _ => logger::LogLevel::Info,
    };
    logger::AxionLogger::init().log(lvl, &tag, &message, details.as_deref(), Some("frontend_ui"));
    Ok(())
}

#[tauri::command]
fn clear_system_logs() -> Result<(), String> {
    logger::AxionLogger::init().clear_in_memory_logs();
    logger::log_info("CORE", "In-memory diagnostic log buffer cleared.");
    Ok(())
}

#[tauri::command]
fn get_personas() -> Result<Vec<Persona>, String> {
    personas::load_personas()
}

#[tauri::command]
fn save_all_personas(personas_list: Vec<Persona>) -> Result<(), String> {
    personas::save_personas(&personas_list)
}

#[tauri::command]
fn list_agent_sessions(agent_id: String) -> Result<Vec<personas::AgentSessionMeta>, String> {
    personas::list_agent_sessions(&agent_id)
}

#[tauri::command]
fn create_agent_session(agent_id: String, title: Option<String>) -> Result<personas::AgentSessionMeta, String> {
    personas::create_agent_session(&agent_id, title.as_deref())
}

#[tauri::command]
fn get_persona_chat(session_id: String) -> Result<Vec<ChatMessage>, String> {
    personas::load_chat(&session_id)
}

#[tauri::command]
fn save_persona_chat(session_id: String, messages: Vec<ChatMessage>) -> Result<(), String> {
    personas::save_chat(&session_id, &messages)
}

#[tauri::command]
fn get_hermes_sessions() -> Result<Vec<db::HermesSession>, String> {
    db::list_hermes_sessions()
}

#[tauri::command]
fn get_hermes_messages(session_id: String) -> Result<Vec<db::FormattedMessage>, String> {
    db::get_hermes_messages(&session_id)
}

#[tauri::command]
async fn stream_hermes_chat(
    session_id: String,
    message: String,
    on_event: Channel<llm::ChatStreamEvent>,
    request_id: Option<String>,
) -> Result<(), String> {
    llm::stream_hermes_chat(&session_id, &message, on_event, request_id).await
}

#[tauri::command]
async fn stream_persona_chat(
    persona_id: String,
    message: String,
    system_prompt: String,
    model: Option<String>,
    on_event: Channel<llm::ChatStreamEvent>,
    request_id: Option<String>,
) -> Result<(), String> {
    llm::stream_persona_chat(&persona_id, &message, &system_prompt, model.as_deref(), on_event, request_id).await
}

#[tauri::command]
fn cancel_chat_stream(request_id: Option<String>) -> Result<(), String> {
    chat_cancel::cancel(request_id.as_deref());
    Ok(())
}

#[tauri::command]
async fn execute_hermes_command(command: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use std::process::Command;
        #[cfg(target_os = "windows")]
        use std::os::windows::process::CommandExt;

        let parts: Vec<&str> = command.split_whitespace().collect();
        if parts.is_empty() {
            return Err("Empty command".to_string());
        }

        let mut cmd = Command::new("hermes");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        for arg in &parts {
            cmd.arg(arg);
        }

        let output = cmd.output().map_err(|e| format!("Failed to execute hermes command: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() && stdout.trim().is_empty() {
            return Err(stderr);
        }

        Ok(stdout)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn clone_persona_from_source(name: String, source: String) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || {
        use std::process::Command;
        #[cfg(target_os = "windows")]
        use std::os::windows::process::CommandExt;

        let script_path = r"D:\Side-Projects\StartUp\persona_engine\auto_clone.py";
        
        // Find best Python executable: prioritize Python 3.12 with cloner packages
        let candidates = [
            r"C:\Users\AR-Qamzawi\AppData\Local\Programs\Python\Python312\python.exe",
            r"C:\Users\AR-Qamzawi\AppData\Local\hermes\tools\python-3.14.7+20240901-win32-x64\python.exe",
            "python",
        ];
        let python_bin = candidates.iter().find(|&&p| p == "python" || std::path::Path::new(p).exists()).copied().unwrap_or("python");
        
        let mut cmd = Command::new(python_bin);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        
        let id = name.to_lowercase().replace(|c: char| !c.is_alphanumeric(), "-");
        let id = id.trim_matches('-').to_string();

        cmd.arg(script_path)
           .arg("--id").arg(&id)
           .arg("--name").arg(&name)
           .arg("--source").arg(&source);

        let output = cmd.output().map_err(|e| format!("Failed to launch clone engine: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            return Err(format!("Cloning error: {} {}", stderr, stdout));
        }


        let personas_file = app_paths::hub()?.join("personas.json");
        let content = std::fs::read_to_string(&personas_file).map_err(|e| e.to_string())?;
        let personas: Vec<serde_json::Value> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        if let Some(target) = personas.iter().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&id)) {
            return Ok(target.clone());
        }

        Ok(serde_json::json!({ "id": id, "name": name, "status": "created" }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pick_source_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        use std::process::Command;
        #[cfg(target_os = "windows")]
        use std::os::windows::process::CommandExt;

        let script = r#"
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.OpenFileDialog
            $dialog.Filter = "Books & Documents (*.pdf;*.epub;*.docx;*.txt;*.md)|*.pdf;*.epub;*.docx;*.txt;*.md|All Files (*.*)|*.*"
            $dialog.Title = "Select Book or PDF for Knowledge Bank"
            if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                Write-Output $dialog.FileName
            }
        "#;

        let mut cmd = Command::new("powershell.exe");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.arg("-NoProfile").arg("-Command").arg(script);

        let output = cmd.output().map_err(|e| format!("Failed to open file picker: {}", e))?;
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_connection_config() -> config::AppConfig {
    config::load_config()
}

#[tauri::command]
fn save_connection_config(config: config::AppConfig) -> Result<(), String> {
    config::save_config(&config)
}

#[tauri::command]
async fn test_connection(config: config::AppConfig) -> Result<String, String> {
    llm::test_ai_connection(config).await
}

#[tauri::command]
async fn get_connected_hermes_models() -> Vec<llm::HermesModelOption> {
    llm::list_connected_hermes_models().await
}

#[tauri::command]
async fn show_desktop_notification(title: String, body: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        notification::show(&title, &body)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_customer_backup()->Result<String,String>{
 tokio::task::spawn_blocking(move||{
  let root=personas::get_app_data_dir()?;
  let destination=if let Some(sandbox)=app_paths::sandbox()?{let dir=sandbox.join("exports");std::fs::create_dir_all(&dir).map_err(|e|e.to_string())?;dir}else{dirs::download_dir().or_else(dirs::desktop_dir).ok_or("Cannot locate Downloads")?};
  let path=destination.join(format!("AxionMind_Backup_{}_{:x}.zip",chrono_or_timestamp(),rand::random::<u32>()));
  backup::write_zip(&root,&path)?;Ok(path.to_string_lossy().into())
 }).await.map_err(|e|e.to_string())?
}

fn chrono_or_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("{}", d.as_secs())
}

#[tauri::command]
async fn restore_customer_backup(zip_path:String)->Result<usize,String>{
 tokio::task::spawn_blocking(move||{
  let root=personas::get_app_data_dir()?;let snapshot=backup::read_zip(std::path::Path::new(&zip_path))?;
  conference::with_idle_store(&root,||backup::restore_into(&snapshot,&root))
 }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn pick_backup_zip_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        use std::process::Command;
        #[cfg(target_os = "windows")]
        use std::os::windows::process::CommandExt;

        let ps_script = r#"
            Add-Type -AssemblyName System.Windows.Forms
            $f = New-Object System.Windows.Forms.OpenFileDialog
            $f.Filter = "Axion Mind Backup (*.zip)|*.zip|All Files (*.*)|*.*"
            $f.Title = "Select Axion Mind Backup File (.zip)"
            $res = $f.ShowDialog()
            if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
                Write-Output $f.FileName
            }
        "#;

        let mut cmd = Command::new("powershell.exe");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.arg("-NoProfile")
           .arg("-NonInteractive")
           .arg("-Command")
           .arg(ps_script);

        let output = cmd.output().map_err(|e| e.to_string())?;
        let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if res.is_empty() {
            Ok(None)
        } else {
            Ok(Some(res))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pick_folder() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        use std::process::Command;
        #[cfg(target_os = "windows")]
        use std::os::windows::process::CommandExt;

        let ps_script = r#"
            Add-Type -AssemblyName System.Windows.Forms
            $f = New-Object System.Windows.Forms.FolderBrowserDialog
            $f.Description = "Select Persistent Data / Cloud Storage Folder (e.g. OneDrive, Google Drive, D:\Backups)"
            $res = $f.ShowDialog()
            if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
                Write-Output $f.SelectedPath
            }
        "#;

        let mut cmd = Command::new("powershell.exe");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.arg("-NoProfile")
           .arg("-NonInteractive")
           .arg("-Command")
           .arg(ps_script);

        let output = cmd.output().map_err(|e| e.to_string())?;
        let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if res.is_empty() {
            Ok(None)
        } else {
            Ok(Some(res))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn cloud_backup_policy_root() -> Result<std::path::PathBuf,String> {
    Ok(app_paths::hub()?.join("cloud-backup-policy"))
}

#[tauri::command]
async fn set_cloud_auto_backup_disabled(owner:String,scope:String,disabled:bool) -> Result<(),String> {
    // Revocation works offline. Re-enabling requires a fresh verified owner and current storage scope.
    if !disabled {
        let verified=get_user_cloud_session().await?.ok_or("Sign in before enabling automatic backup.")?;
        if verified["id"].as_str()!=Some(owner.as_str()) {return Err("Account changed before enabling automatic backup.".into());}
    }
    let _lock=ACCOUNT_SESSION_LOCK.lock().await;
    if !disabled {
        let current=auth::SessionStore::production()?.read()?.ok_or("Account signed out.")?;
        if current["id"].as_str()!=Some(owner.as_str())||backup::scope_id(&personas::get_app_data_dir()?)?!=scope {return Err("Account or storage changed before enabling automatic backup.".into());}
    }
    tokio::task::spawn_blocking(move || backup_policy::set_disabled(&cloud_backup_policy_root()?,&owner,&scope,disabled)).await.map_err(|_|"Automatic-backup policy worker failed.".to_string())?
}

#[tauri::command]
async fn pause_current_cloud_auto_backup() -> Result<serde_json::Value,String> {
    let _lock=ACCOUNT_SESSION_LOCK.lock().await;
    // Stored identity is used ONLY for revocation, never as proof of a valid login/upload permission.
    let stored=auth::SessionStore::production()?.read()?.ok_or("No stored account exists. No automatic upload can run while signed out.")?;
    let owner=stored["id"].as_str().ok_or("Stored account identity is missing.")?.to_string();
    tokio::task::spawn_blocking(move || {
        let scope=backup::scope_id(&personas::get_app_data_dir()?)?;
        backup_policy::set_disabled(&cloud_backup_policy_root()?,&owner,&scope,true)?;
        Ok(serde_json::json!({"owner":owner,"scope":scope,"disabled":true}))
    }).await.map_err(|_|"Offline pause worker failed.".to_string())?
}

#[tauri::command]
async fn inspect_cloud_backup() -> Result<Option<serde_json::Value>, String> {
    let verified=match get_user_cloud_session().await? {Some(s)=>s,None=>return Ok(None)};
    let _lock=ACCOUNT_SESSION_LOCK.lock().await;
    let current=auth::SessionStore::production()?.read()?.ok_or("Account signed out during backup inspection.")?;
    if current["id"]!=verified["id"] {return Err("Account changed during backup inspection.".into());}
    tokio::task::spawn_blocking(move || {
        let root=personas::get_app_data_dir()?;
        let scope=backup::scope_id(&root)?;
        let disabled=backup_policy::is_disabled(&cloud_backup_policy_root()?,verified["id"].as_str().ok_or("Missing account identity.")?,&scope)?;
        let snapshot=backup::capture(&root)?;
        if backup::scope_id(&personas::get_app_data_dir()?)?!=scope {return Err("Storage changed during backup inspection.".into());}
        Ok(Some(serde_json::json!({"owner":verified["id"],"email":verified["email"],"scope":scope,"snapshot":snapshot,"autoDisabled":disabled})))
    }).await.map_err(|_|"Backup inspection worker failed.".to_string())?
}

#[tauri::command]
async fn export_cloud_snapshot() -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(|| {
        let root=personas::get_app_data_dir()?;
        let snapshot=backup::capture(&root)?;
        logger::log_info("SYNC", &format!("Strict customer snapshot exported: {} files. No cloud write yet.",snapshot["files"].as_object().map_or(0,|f|f.len())));
        Ok(snapshot)
    }).await.map_err(|_|"Customer snapshot worker failed.".to_string())?
}

#[tauri::command]
async fn recover_cloud_snapshot(snapshot: serde_json::Value, expected_owner: String) -> Result<serde_json::Value, String> {
    let verified=get_user_cloud_session().await?.ok_or("Sign in before recovering a cloud backup.")?;
    if verified["id"].as_str()!=Some(expected_owner.as_str()) {return Err("Account changed before recovery; no files were written.".into());}
    let _lock=ACCOUNT_SESSION_LOCK.lock().await;
    let current=auth::SessionStore::production()?.read()?.ok_or("Account signed out before recovery.")?;
    if current["id"].as_str()!=Some(expected_owner.as_str()) {return Err("Account changed before recovery; no files were written.".into());}
    tokio::task::spawn_blocking(move || {
        backup::validate(&snapshot)?;
        let parent=app_paths::hub()?.join("cloud-recovery");
        std::fs::create_dir_all(&parent).map_err(|_|"Cannot create cloud recovery parent.")?;
        let destination=parent.join(format!("recovered-{:032x}",rand::random::<u128>()));
        backup::restore_new(&snapshot,&destination)?;
        logger::log_info("SYNC","Cloud recovery written and verified in a NEW folder. Active customer files were not replaced.");
        Ok(serde_json::json!({"path":destination.to_string_lossy(),"files":snapshot["files"].as_object().map_or(0,|f|f.len()),"verified":true}))
    }).await.map_err(|_|"Cloud recovery worker failed.".to_string())?
}

#[tauri::command]
async fn export_all_data_json()->Result<serde_json::Value,String>{
 tokio::task::spawn_blocking(move||{
  let snapshot=backup::capture(&personas::get_app_data_dir()?)?;let files=backup::validate(&snapshot)?;
  let mut payload=serde_json::json!({"personas":[],"chats":{},"sessions":{},"personas_data":{},"conferences":{}});
  for (rel,text) in files{if rel=="personas.json"{payload["personas"]=serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e|e.to_string())?;}else if let Some((category,name))=rel.split_once('/'){
   if category=="personas_data"{payload[category][name]=serde_json::json!(text);}else{payload[category][name.trim_end_matches(".json")]=serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e|e.to_string())?;}
  }}Ok(payload)
 }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn import_all_data_json(payload:serde_json::Value)->Result<String,String>{
 tokio::task::spawn_blocking(move||{
  let root=personas::get_app_data_dir()?;let mut files=serde_json::Map::new();
  let personas=if let Some(value)=payload.get("personas"){serde_json::to_string_pretty(value).map_err(|e|e.to_string())?}else{std::fs::read_to_string(root.join("personas.json")).map_err(|e|e.to_string())?};
  files.insert("personas.json".into(),serde_json::json!(personas));
  for category in ["chats","sessions","conferences","personas_data"]{if let Some(value)=payload.get(category){let map=value.as_object().ok_or("Invalid import category")?;
   for (name,value) in map{let (rel,text)=if category=="personas_data"{(format!("{category}/{name}"),value.as_str().ok_or("Invalid knowledge file")?.to_string())}else{(format!("{category}/{name}.json"),serde_json::to_string_pretty(value).map_err(|e|e.to_string())?)};files.insert(rel,serde_json::json!(text));}
  }}
  let snapshot=serde_json::json!({"version":1,"files":files});conference::with_idle_store(&root,||backup::restore_into(&snapshot,&root))?;
  Ok("Successfully imported customer data, including conference rooms.".into())
 }).await.map_err(|e|e.to_string())?
}

static ACCOUNT_SESSION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[tauri::command]
async fn get_user_cloud_session() -> Result<Option<serde_json::Value>, String> {
    let _lock = ACCOUNT_SESSION_LOCK.lock().await;
    let store = auth::SessionStore::production()?;
    // Old plaintext cloud_session.json files are deliberately not trusted or imported.
    let saved = match store.read()? { Some(s) => s, None => return Ok(None) };
    let verified = auth::AuthApi::production()?.validate_or_refresh(&saved).await?;
    if let Some(session) = &verified { store.write(session)?; }
    else { store.clear()?; }
    Ok(verified)
}

#[tauri::command]
async fn save_user_cloud_session(session: serde_json::Value) -> Result<(), String> {
    let _lock = ACCOUNT_SESSION_LOCK.lock().await;
    let verified = auth::AuthApi::production()?.validate_session(&session).await?
        .ok_or("The account session could not be verified. Please sign in again.")?;
    auth::SessionStore::production()?.write(&verified)?;
    logger::log_info("AUTH", "Verified account session saved with Windows DPAPI encryption.");
    Ok(())
}

#[tauri::command]
async fn clear_user_cloud_session() -> Result<(), String> {
    auth::AUTH_FLOWS.cancel()?;
    let _lock = ACCOUNT_SESSION_LOCK.lock().await;
    auth::SessionStore::production()?.clear()?;
    logger::log_info("AUTH", "Local account session cleared. Cloud data was not deleted.");
    Ok(())
}

#[tauri::command]
async fn sign_in_with_google(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri_plugin_opener::OpenerExt;
    logger::log_info("AUTH", "Google sign-in requested (system browser / PKCE).");
    let result = auth::run_google_session(&auth::AuthApi::production()?, |url| {
        app.opener().open_url(url, None::<&str>).map_err(|_| "Browser launch failed.".to_string())
    }).await;
    match result {
        Ok(session) => {
            let _lock = ACCOUNT_SESSION_LOCK.lock().await;
            auth::SessionStore::production()?.write(&session)?;
            logger::log_info("AUTH", "Google account verified; encrypted session saved. Data sync is separate.");
            Ok(session)
        },
        Err(e) => {
            logger::log_warn("AUTH", &e, None);
            Err(e)
        }
    }
}

#[tauri::command]
fn cancel_google_sign_in() -> Result<(), String> {
    auth::AUTH_FLOWS.cancel()?;
    logger::log_info("AUTH", "Google sign-in cancellation requested.");
    Ok(())
}

mod notification;
mod app_paths;

#[tauri::command]
async fn open_chat_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid link")?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Only HTTP(S) links without credentials may be opened.".into());
    }
    app.opener().open_url(parsed.as_str(), None::<&str>).map_err(|_| "Could not open browser".into())
}

fn main() {
    if let Err(e) = app_paths::sandbox() { eprintln!("{}", e); std::process::exit(2); }
    // 1. Initialize High-Precision Axion Diagnostic Logger
    let _ = logger::AxionLogger::init();
    logger::log_info("CORE", &format!("Axion Mind v{} booting on native Windows runtime...", env!("CARGO_PKG_VERSION")));
    let app_dir_display = personas::get_app_data_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|e| format!("Error resolving vault: {}", e));
    logger::log_info("STORAGE", &format!("Resolved persistent storage vault: {}", app_dir_display));
    logger::log_info("DIAGNOSTICS", &format!("Active log directory: {}", logger::get_log_dir().display()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_conference_options,
            list_conference_rooms,
            get_conference_room,
            create_conference_room,
            update_conference_participants,
            stream_conference_round,
            cancel_conference_round,
            get_personas,
            open_chat_link,
            save_all_personas,
            list_agent_sessions,
            create_agent_session,
            get_persona_chat,
            save_persona_chat,
            append_persona_turn,
            get_chat_storage_scope,
            get_hermes_sessions,
            get_hermes_messages,
            stream_hermes_chat,
            stream_persona_chat,
            execute_hermes_command,
            clone_persona_from_source,
            pick_source_file,
            pick_folder,
            get_connection_config,
            save_connection_config,
            test_connection,
            get_connected_hermes_models,
            show_desktop_notification,
            export_customer_backup,
            restore_customer_backup,
            pick_backup_zip_file,
            export_all_data_json,
            export_cloud_snapshot,
            inspect_cloud_backup,
            set_cloud_auto_backup_disabled,
            pause_current_cloud_auto_backup,
            recover_cloud_snapshot,
            import_all_data_json,
            get_recent_logs,
            run_system_diagnostics,
            export_diagnostic_report,
            log_frontend_event,
            clear_system_logs,
            get_user_cloud_session,
            save_user_cloud_session,
            clear_user_cloud_session,
            sign_in_with_google,
            cancel_google_sign_in,
            cancel_chat_stream,
            updater::check_for_updates,
            updater::download_and_install_update,
            updater::restart_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
