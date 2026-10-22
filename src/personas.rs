use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Persona {
    pub id: String,
    pub name: String,
    pub title: String,
    #[serde(alias = "emoji", default = "default_avatar")]
    pub avatar: String,
    pub description: String,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default)]
    pub welcome_message: String,
    #[serde(default)]
    pub model: Option<String>,
}

fn default_avatar() -> String {
    "🤖".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentSessionMeta {
    pub id: String,
    pub agent_id: String,
    pub title: String,
    pub created_at: String,
    pub last_activity_at: String,
    pub message_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub timestamp: Option<serde_json::Value>,
    #[serde(default)]
    pub model: Option<String>,
}

pub fn get_app_data_dir() -> Result<PathBuf, String> {
    // 1. Check if user configured a custom storage location (e.g. OneDrive, Google Drive, D:\Backups)
    let config = crate::config::load_config();
    if crate::app_paths::sandbox()?.is_none() {
    if let Some(ref custom_dir) = config.custom_storage_dir {
        let trimmed = custom_dir.trim();
        if !trimmed.is_empty() {
            let custom_path = PathBuf::from(trimmed);
            if fs::create_dir_all(&custom_path).is_ok() {
                let _ = fs::create_dir_all(custom_path.join("chats"));
                let _ = fs::create_dir_all(custom_path.join("sessions"));
                return Ok(custom_path);
            }
        }
    }

    }
    let hub_dir = crate::app_paths::hub()?;
    fs::create_dir_all(hub_dir.join("chats")).map_err(|e| e.to_string())?;
    fs::create_dir_all(hub_dir.join("sessions")).map_err(|e| e.to_string())?;
    Ok(hub_dir)
}

pub fn list_agent_sessions(agent_id: &str) -> Result<Vec<AgentSessionMeta>, String> {
    let hub_dir = get_app_data_dir()?;
    let meta_file = hub_dir.join("sessions").join(format!("{}.json", agent_id));
    if !meta_file.exists() {
        // Auto-migrate legacy single-chat file if present
        let legacy_file = PathBuf::from(r"D:\Side-Projects\StartUp\personas_hub\chats").join(format!("{}.json", agent_id));
        if crate::app_paths::sandbox()?.is_none() && legacy_file.exists() {
            if let Ok(content) = fs::read_to_string(&legacy_file) {
                if let Ok(msgs) = serde_json::from_str::<Vec<ChatMessage>>(&content) {
                    if !msgs.is_empty() {
                        let sess_id = format!("{}_legacy", agent_id);
                        let _ = fs::write(hub_dir.join("chats").join(format!("{}.json", sess_id)), &content);
                        let meta = AgentSessionMeta {
                            id: sess_id,
                            agent_id: agent_id.to_string(),
                            title: format!("Previous Conversation ({} msgs)", msgs.len()),
                            created_at: "1792289511".to_string(),
                            last_activity_at: "1792353827".to_string(),
                            message_count: msgs.len(),
                        };
                        let list = vec![meta];
                        let _ = fs::write(&meta_file, serde_json::to_string_pretty(&list).unwrap_or_default());
                        return Ok(list);
                    }
                }
            }
        }
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&meta_file).map_err(|e| e.to_string())?;
    serde_json::from_str::<Vec<AgentSessionMeta>>(&content).map_err(|e| e.to_string())
}

pub fn create_agent_session(agent_id: &str, title: Option<&str>) -> Result<AgentSessionMeta, String> {
    let hub_dir = get_app_data_dir()?;
    let sessions_dir = hub_dir.join("sessions");
    fs::create_dir_all(&sessions_dir).map_err(|e| e.to_string())?;
    let meta_file = sessions_dir.join(format!("{}.json", agent_id));

    let mut sessions = if meta_file.exists() {
        let content = fs::read_to_string(&meta_file).map_err(|e| e.to_string())?;
        serde_json::from_str::<Vec<AgentSessionMeta>>(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    let timestamp_millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let now_ts = timestamp_millis / 1000;
    let nonce = rand::random::<u32>();
    let session_id = format!("{}_{}_{:08x}", agent_id, timestamp_millis, nonce);
    let session_title = title.unwrap_or("New Conversation").to_string();

    let new_meta = AgentSessionMeta {
        id: session_id.clone(),
        agent_id: agent_id.to_string(),
        title: session_title,
        created_at: now_ts.to_string(),
        last_activity_at: now_ts.to_string(),
        message_count: 0,
    };

    sessions.insert(0, new_meta.clone());
    let data = serde_json::to_string_pretty(&sessions).map_err(|e| e.to_string())?;
    fs::write(&meta_file, data).map_err(|e| e.to_string())?;

    // Create empty chat file
    let chat_file = hub_dir.join("chats").join(format!("{}.json", session_id));
    let _ = fs::write(chat_file, "[]");

    Ok(new_meta)
}

pub fn load_chat(session_id: &str) -> Result<Vec<ChatMessage>, String> {
    let hub_dir = get_app_data_dir()?;
    let chat_file = hub_dir.join("chats").join(format!("{}.json", session_id));

    if !chat_file.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&chat_file).map_err(|e| e.to_string())?;
    serde_json::from_str::<Vec<ChatMessage>>(&content).map_err(|e| e.to_string())
}

pub fn save_chat(session_id: &str, messages: &[ChatMessage]) -> Result<(), String> {
    let hub_dir = get_app_data_dir()?;
    let chat_file = hub_dir.join("chats").join(format!("{}.json", session_id));
    let content = serde_json::to_string_pretty(messages).map_err(|e| e.to_string())?;
    fs::write(chat_file, content).map_err(|e| e.to_string())?;

    // Update message count in session meta if exists
    let parts: Vec<&str> = session_id.split('_').collect();
    if !parts.is_empty() {
        let agent_id = parts[0];
        let meta_file = hub_dir.join("sessions").join(format!("{}.json", agent_id));
        if meta_file.exists() {
            if let Ok(mut meta_list) = list_agent_sessions(agent_id) {
                if let Some(target) = meta_list.iter_mut().find(|m| m.id == session_id) {
                    target.message_count = messages.len();
                    target.last_activity_at = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs()
                        .to_string();
                    let _ = fs::write(meta_file, serde_json::to_string_pretty(&meta_list).unwrap_or_default());
                }
            }
        }
    }
    Ok(())
}

const EMBEDDED_BUNDLE: &str = include_str!("../embedded_data/embedded_bundle.json");

#[derive(Deserialize)]
struct EmbeddedBundle {
    personas_json: String,
    data_files: std::collections::HashMap<String, String>,
}

pub fn load_personas() -> Result<Vec<Persona>, String> {
    let hub_dir = get_app_data_dir()?;
    let personas_file = hub_dir.join("personas.json");
    let personas_data_dir = hub_dir.join("personas_data");

    // Automatically unpack embedded personas & knowledge cards on clean installs
    if let Ok(bundle) = serde_json::from_str::<EmbeddedBundle>(EMBEDDED_BUNDLE) {
        // 1. Unpack Knowledge Cards (frameworks, anecdotes, style_dna, refusals)
        for (rel_path, content) in &bundle.data_files {
            let target_path = personas_data_dir.join(rel_path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if !target_path.exists() {
                if let Some(parent) = target_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::write(&target_path, content);
            }
        }

        // 2. Unpack master personas.json strictly if it does NOT exist on disk
        if !personas_file.exists() {
            let _ = fs::write(&personas_file, &bundle.personas_json);
        }
    }

    if !personas_file.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&personas_file).map_err(|e| e.to_string())?;
    serde_json::from_str::<Vec<Persona>>(&content).map_err(|e| e.to_string())
}

pub fn save_personas(personas: &[Persona]) -> Result<(), String> {
    let hub_dir = get_app_data_dir()?;
    let personas_file = hub_dir.join("personas.json");
    let content = serde_json::to_string_pretty(personas).map_err(|e| e.to_string())?;
    fs::write(personas_file, content).map_err(|e| e.to_string())
}
