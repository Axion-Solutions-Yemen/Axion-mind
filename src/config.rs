use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub mode: String, // "hermes_local", "direct_cloud", "custom_gateway"
    pub hermes_gateway_url: String,
    pub hermes_auth_token: String,
    pub cloud_provider: String, // "openai", "gemini", "openrouter", "groq"
    pub cloud_api_key: String,
    pub cloud_model: String,
    pub custom_url: String,
    pub custom_auth_token: String,
    pub custom_model: String,
    #[serde(default)]
    pub custom_storage_dir: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        let (auto_token, auto_url) = auto_detect_hermes_env();
        Self {
            mode: "hermes_local".to_string(),
            hermes_gateway_url: auto_url,
            hermes_auth_token: auto_token,
            cloud_provider: "openrouter".to_string(),
            cloud_api_key: "".to_string(),
            cloud_model: "google/gemini-2.0-flash-001".to_string(),
            custom_url: "http://127.0.0.1:8766/v1/chat/completions".to_string(),
            custom_auth_token: "".to_string(),
            custom_model: "antigravity-gemini-3.8-flash".to_string(),
            custom_storage_dir: None,
        }
    }
}

fn auto_detect_hermes_env() -> (String, String) {
    if std::env::var_os("AXION_SANDBOX_ROOT").is_some() { return (String::new(), "http://127.0.0.1:8642".into()); }
    let mut detected_token = "hermes-agent-mind-secure-key-2026".to_string();
    let detected_url = "http://127.0.0.1:8642".to_string();

    // Check %LOCALAPPDATA%/hermes/config.yaml or state
    if let Some(local_app_data) = dirs::data_local_dir() {
        let config_yaml = local_app_data.join("hermes").join("config.yaml");
        if config_yaml.exists() {
            if let Ok(content) = fs::read_to_string(&config_yaml) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("auth_token:") {
                        let parts: Vec<&str> = trimmed.split(':').collect();
                        if parts.len() > 1 {
                            let t = parts[1].trim().trim_matches('"').trim_matches('\'');
                            if !t.is_empty() {
                                detected_token = t.to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    (detected_token, detected_url)
}

fn get_config_path() -> Result<PathBuf, String> {
    let hub_dir = crate::app_paths::hub()?;
    fs::create_dir_all(&hub_dir).map_err(|e| e.to_string())?;
    Ok(hub_dir.join("config.json"))
}

pub fn load_config() -> AppConfig {
    if let Ok(path) = get_config_path() {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(cfg) = serde_json::from_str::<AppConfig>(&content) {
                    return cfg;
                }
            }
        }
    }
    let default_cfg = AppConfig::default();
    let _ = save_config(&default_cfg);
    default_cfg
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = get_config_path()?;
    let data = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}
