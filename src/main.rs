#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod backup;
mod backup_policy;
mod config;
mod db;
mod llm;
mod chat_cancel;
mod chat_store;

#[tauri::command]
fn get_chat_storage_scope() -> Result<String, String> { backup::scope_id(&personas::get_app_data_dir()?) }

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
async fn export_customer_backup() -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use std::fs::File;
        use std::io::{Read, Write};
        use walkdir::WalkDir;
        use zip::write::SimpleFileOptions;

        let hub_dir = personas::get_app_data_dir()?;
        let downloads = dirs::download_dir()
            .or_else(dirs::desktop_dir)
            .ok_or("Cannot locate Downloads directory")?;
        
        let now = chrono_or_timestamp();
        let backup_filename = format!("AxionMind_Backup_{}.zip", now);
        let backup_path = downloads.join(&backup_filename);

        let file = File::create(&backup_path).map_err(|e| format!("Failed to create zip: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for entry in WalkDir::new(&hub_dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            let rel_path = match path.strip_prefix(&hub_dir) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let rel_str = rel_path.to_string_lossy().replace('\\', "/");
            if rel_str.is_empty() {
                continue;
            }

            // Exclude secrets, credentials, configs, system logs, and non-customer artifacts
            let first_segment = rel_str.split('/').next().unwrap_or("");
            let is_customer_data = matches!(first_segment, "personas.json" | "chats" | "sessions" | "personas_data");
            if !is_customer_data || rel_str.starts_with('.') || rel_str.ends_with(".dpapi") || rel_str.ends_with(".log") || rel_str == "config.json" {
                continue;
            }

            if entry.file_type().is_dir() {
                let _ = zip.add_directory(&rel_str, SimpleFileOptions::default());
            } else if entry.file_type().is_file() {
                zip.start_file(&rel_str, options).map_err(|e| e.to_string())?;
                let mut f = File::open(path).map_err(|e| e.to_string())?;
                let mut buffer = Vec::new();
                f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
                zip.write_all(&buffer).map_err(|e| e.to_string())?;
            }
        }

        zip.finish().map_err(|e| format!("Failed to finalize zip: {}", e))?;
        Ok(backup_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn chrono_or_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("{}", d.as_secs())
}

#[tauri::command]
async fn restore_customer_backup(zip_path: String) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || {
        use std::fs::{self, File};
        use std::io::copy;

        let hub_dir = personas::get_app_data_dir()?;
        let zpath = std::path::Path::new(&zip_path);
        if !zpath.exists() {
            return Err("Selected backup file does not exist.".to_string());
        }

        let file = File::open(zpath).map_err(|e| format!("Cannot open zip file: {}", e))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;

        let mut restored_count = 0;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let raw_path = file.mangled_name();
            let outpath = hub_dir.join(&raw_path);

            if file.name().ends_with('/') {
                let _ = fs::create_dir_all(&outpath);
            } else {
                if let Some(p) = outpath.parent() {
                    let _ = fs::create_dir_all(p);
                }
                let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
                copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
                restored_count += 1;
            }
        }
        Ok(restored_count)
    })
    .await
    .map_err(|e| e.to_string())?
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
async fn export_all_data_json() -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || {
        let app_dir = crate::personas::get_app_data_dir()?;
        
        // 1. Read personas.json
        let personas_file = app_dir.join("personas.json");
        let personas_val: serde_json::Value = if personas_file.exists() {
            let s = std::fs::read_to_string(&personas_file).unwrap_or_else(|_| "[]".to_string());
            serde_json::from_str(&s).unwrap_or(serde_json::json!([]))
        } else {
            serde_json::json!([])
        };

        // 2. Read all chats
        let chats_dir = app_dir.join("chats");
        let mut chats_map = serde_json::Map::new();
        if let Ok(entries) = std::fs::read_dir(chats_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        if let Ok(s) = std::fs::read_to_string(&path) {
                            if let Ok(json_msgs) = serde_json::from_str::<serde_json::Value>(&s) {
                                chats_map.insert(stem.to_string(), json_msgs);
                            }
                        }
                    }
                }
            }
        }

        // 3. Read Dual-RAG Knowledge Cards
        let data_dir = app_dir.join("personas_data");
        let mut data_files = serde_json::Map::new();
        if data_dir.exists() {
            for entry in walkdir::WalkDir::new(&data_dir).into_iter().flatten() {
                if entry.file_type().is_file() {
                    let path = entry.path();
                    if let Ok(rel) = path.strip_prefix(&data_dir) {
                        let rel_str = rel.to_string_lossy().replace('\\', "/");
                        if let Ok(content) = std::fs::read_to_string(path) {
                            data_files.insert(rel_str, serde_json::Value::String(content));
                        }
                    }
                }
            }
        }

        Ok(serde_json::json!({
            "personas": personas_val,
            "chats": chats_map,
            "personas_data": data_files
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn import_all_data_json(payload: serde_json::Value) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let app_dir = crate::personas::get_app_data_dir()?;

        // 1. Restore personas
        if let Some(personas_val) = payload.get("personas") {
            let personas_file = app_dir.join("personas.json");
            let _ = std::fs::write(personas_file, serde_json::to_string_pretty(personas_val).unwrap_or_default());
        }

        // 2. Restore chats
        if let Some(chats_obj) = payload.get("chats").and_then(|v| v.as_object()) {
            let chats_dir = app_dir.join("chats");
            let _ = std::fs::create_dir_all(&chats_dir);
            for (stem, msgs) in chats_obj {
                // Reject path traversal, directory separators, and control characters in chat filenames
                if stem.contains('/') || stem.contains('\\') || stem.contains("..") || stem.chars().any(|c| c.is_control()) {
                    continue;
                }
                let file_path = chats_dir.join(format!("{}.json", stem));
                let _ = std::fs::write(file_path, serde_json::to_string_pretty(msgs).unwrap_or_default());
            }
        }

        // 3. Restore Dual-RAG Knowledge Cards
        if let Some(data_files) = payload.get("personas_data").and_then(|v| v.as_object()) {
            let data_dir = app_dir.join("personas_data");
            for (rel_path, content_val) in data_files {
                if let Some(content) = content_val.as_str() {
                    let normalized = rel_path.replace('\\', "/");
                    // Enforce that the path stays strictly under personas_data (no .. traversal, no absolute paths)
                    let p = std::path::Path::new(&normalized);
                    if p.is_absolute() || normalized.starts_with('/') || p.components().any(|c| matches!(c, std::path::Component::ParentDir | std::path::Component::Prefix(_) | std::path::Component::RootDir)) {
                        continue;
                    }
                    let target_path = data_dir.join(p);
                    if let Some(parent) = target_path.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    let _ = std::fs::write(&target_path, content);
                }
            }
        }

        Ok("Successfully imported and synchronized all data!".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
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
        .invoke_handler(tauri::generate_handler![
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
