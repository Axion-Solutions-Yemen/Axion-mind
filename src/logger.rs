use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
    Fatal,
    Perf,
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Trace => write!(f, "TRACE"),
            LogLevel::Debug => write!(f, "DEBUG"),
            LogLevel::Info  => write!(f, "INFO "),
            LogLevel::Warn  => write!(f, "WARN "),
            LogLevel::Error => write!(f, "ERROR"),
            LogLevel::Fatal => write!(f, "FATAL"),
            LogLevel::Perf  => write!(f, "PERF "),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: LogLevel,
    pub tag: String,
    pub message: String,
    pub details: Option<String>,
    pub file_line: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemDiagnosticStatus {
    pub timestamp: String,
    pub app_version: String,
    pub os_info: String,
    pub storage_dir: String,
    pub storage_writable: bool,
    pub personas_count: usize,
    pub frameworks_count: usize,
    pub anecdotes_count: usize,
    pub chats_count: usize,
    pub hermes_reachable: bool,
    pub antigravity_reachable: bool,
    pub gemini_web_reachable: bool,
    pub deepseek_reachable: bool,
    pub supabase_reachable: bool,
    pub supabase_url: String,
    pub issues_detected: Vec<String>,
    pub recommendations: Vec<String>,
}

pub struct AxionLogger {
    log_dir: PathBuf,
    recent_logs: Mutex<Vec<LogEntry>>,
    max_memory_logs: usize,
}

static LOGGER: OnceLock<AxionLogger> = OnceLock::new();

impl AxionLogger {
    pub fn init() -> &'static Self {
        LOGGER.get_or_init(|| {
            let log_dir = get_log_dir();
            if let Err(e) = fs::create_dir_all(&log_dir) {
                eprintln!("[LOGGER] Failed to create log directory: {}", e);
            }

            let logger = AxionLogger {
                log_dir,
                recent_logs: Mutex::new(Vec::with_capacity(600)),
                max_memory_logs: 500,
            };

            // Register global panic hook to log any unexpected crash
            let default_panic = std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {
                let location = info.location().map(|l| format!("{}:{}", l.file(), l.line())).unwrap_or_else(|| "unknown".into());
                let msg = match info.payload().downcast_ref::<&str>() {
                    Some(s) => *s,
                    None => match info.payload().downcast_ref::<String>() {
                        Some(s) => &**s,
                        None => "Box<Any>",
                    },
                };
                let panic_log = format!("FATAL APPLICATION PANIC at {}: {}", location, msg);
                eprintln!("{}", panic_log);
                if let Some(l) = LOGGER.get() {
                    l.log(LogLevel::Fatal, "PANIC", &panic_log, None, Some(&location));
                }
                default_panic(info);
            }));

            logger
        })
    }

    pub fn log(&self, level: LogLevel, tag: &str, message: &str, details: Option<&str>, file_line: Option<&str>) {
        let now: DateTime<Local> = Local::now();
        let timestamp = now.format("%Y-%m-%d %H:%M:%S%.3f").to_string();

        let entry = LogEntry {
            timestamp: timestamp.clone(),
            level: level.clone(),
            tag: tag.to_uppercase(),
            message: message.to_string(),
            details: details.map(|s| s.to_string()),
            file_line: file_line.map(|s| s.to_string()),
        };

        // 1. In-memory ring buffer for fast UI diagnosis
        if let Ok(mut logs) = self.recent_logs.lock() {
            if logs.len() >= self.max_memory_logs {
                logs.remove(0);
            }
            logs.push(entry.clone());
        }

        // 2. Write to persistent daily disk log
        let date_str = now.format("%Y-%m-%d").to_string();
        let log_file_name = format!("axion_mind_{}.log", date_str);
        let log_file_path = self.log_dir.join(log_file_name);

        let mut formatted_line = format!("[{}] [{}] [{}] {}", timestamp, level, tag.to_uppercase(), message);
        if let Some(fl) = file_line {
            formatted_line.push_str(&format!(" ({})", fl));
        }
        formatted_line.push('\n');
        if let Some(det) = details {
            formatted_line.push_str(&format!("    DETAILS: {}\n", det));
        }

        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_file_path) {
            let _ = file.write_all(formatted_line.as_bytes());
        }

        // Also update latest.log link/file
        let latest_log_path = self.log_dir.join("latest.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&latest_log_path) {
            let _ = file.write_all(formatted_line.as_bytes());
        }

        // Print to stderr if debug or console is attached
        #[cfg(debug_assertions)]
        eprint!("{}", formatted_line);
    }

    pub fn get_recent_logs(&self, limit: Option<usize>) -> Vec<LogEntry> {
        let limit = limit.unwrap_or(200);
        if let Ok(logs) = self.recent_logs.lock() {
            if logs.len() > limit {
                logs[logs.len() - limit..].to_vec()
            } else {
                logs.clone()
            }
        } else {
            Vec::new()
        }
    }

    pub fn clear_in_memory_logs(&self) {
        if let Ok(mut logs) = self.recent_logs.lock() {
            logs.clear();
        }
    }
}

pub fn get_log_dir() -> PathBuf {
    crate::personas::get_app_data_dir()
        .unwrap_or_else(|_| dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("PersonasHub"))
        .join("logs")
}

// Global helper macros and functions
pub fn log_info(tag: &str, msg: &str) {
    if let Some(l) = LOGGER.get() {
        l.log(LogLevel::Info, tag, msg, None, None);
    }
}

pub fn log_warn(tag: &str, msg: &str, details: Option<&str>) {
    if let Some(l) = LOGGER.get() {
        l.log(LogLevel::Warn, tag, msg, details, None);
    }
}

pub fn log_error(tag: &str, msg: &str, details: Option<&str>) {
    if let Some(l) = LOGGER.get() {
        l.log(LogLevel::Error, tag, msg, details, None);
    }
}

pub fn log_debug(tag: &str, msg: &str) {
    if let Some(l) = LOGGER.get() {
        l.log(LogLevel::Debug, tag, msg, None, None);
    }
}

pub fn log_perf(tag: &str, msg: &str, duration_ms: u128) {
    if let Some(l) = LOGGER.get() {
        let det = format!("Duration: {} ms", duration_ms);
        l.log(LogLevel::Perf, tag, msg, Some(&det), None);
    }
}

// Full System Health Check Diagnostic Engine
pub async fn run_comprehensive_diagnostics() -> SystemDiagnosticStatus {
    let now: DateTime<Local> = Local::now();
    let timestamp = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let app_data = crate::personas::get_app_data_dir()
        .unwrap_or_else(|_| dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("PersonasHub"));
    let mut issues = Vec::new();
    let mut recommendations = Vec::new();

    // 1. Test Storage & Permissions
    let test_file = app_data.join(".diag_rw_test");
    let storage_writable = match fs::write(&test_file, b"test_diagnostic_write") {
        Ok(_) => {
            let _ = fs::remove_file(test_file);
            true
        }
        Err(e) => {
            issues.push(format!("Storage directory is not writable: {}", e));
            recommendations.push("Check Windows folder permissions for %LOCALAPPDATA%\\PersonasHub".into());
            false
        }
    };

    // 2. Count Personas
    let personas = crate::personas::load_personas().unwrap_or_default();
    let personas_count = personas.len();
    if personas_count == 0 {
        issues.push("Zero active personas loaded in database".into());
        recommendations.push("Ensure alex-hormozi is unpacked in personas.json".into());
    }

    // 3. Count Knowledge Cards & Anecdotes
    let cards_dir = app_data.join("personas_data").join("alex-hormozi");
    let fw_dir = cards_dir.join("frameworks");
    let an_dir = cards_dir.join("anecdotes");
    
    let frameworks_count = if fw_dir.exists() {
        fs::read_dir(&fw_dir).map(|rd| rd.filter_map(|e| e.ok()).count()).unwrap_or(0)
    } else { 0 };

    let anecdotes_count = if an_dir.exists() {
        fs::read_dir(&an_dir).map(|rd| rd.filter_map(|e| e.ok()).count()).unwrap_or(0)
    } else { 0 };

    if frameworks_count == 0 || anecdotes_count == 0 {
        issues.push(format!("Dual-RAG cards count low: {} frameworks, {} anecdotes", frameworks_count, anecdotes_count));
    }

    // 4. Count Chats
    let chats_dir = app_data.join("chats");
    let chats_count = if chats_dir.exists() {
        fs::read_dir(&chats_dir).map(|rd| rd.filter_map(|e| e.ok()).count()).unwrap_or(0)
    } else { 0 };

    // 5. Test Model Endpoints
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
        .unwrap_or_default();

    // Hermes Gateway (127.0.0.1:8642)
    let hermes_reachable = client.get("http://127.0.0.1:8642/v1/models").send().await.is_ok();
    
    // Antigravity Bridge (127.0.0.1:8766)
    let antigravity_reachable = client.get("http://127.0.0.1:8766/v1/models").send().await.is_ok();
    
    // Gemini Web Bridge (127.0.0.1:8768)
    let gemini_web_reachable = client.get("http://127.0.0.1:8768/v1/models").send().await.is_ok();

    // DeepSeek Web Bridge (127.0.0.1:8769)
    let deepseek_reachable = client.get("http://127.0.0.1:8769/v1/models").send().await.is_ok();

    if !hermes_reachable && !antigravity_reachable {
        issues.push("Neither Hermes (8642) nor Antigravity Bridge (8766) is responding".into());
        recommendations.push("Ensure Antigravity Bridge or Hermes CLI gateway is running".into());
    }

    // 6. Test Supabase Cloud Endpoint
    let supabase_url = "https://kefxeysyvtdxxdupkapa.supabase.co".to_string();
    let supabase_reachable = client.get(format!("{}/auth/v1/settings", supabase_url))
        .header("apikey", "sb_publishable_m6nFD1nyCmeP5xMz0K_5Hw_HqIHOr2N")
        .send().await.map(|r| r.status().is_success()).unwrap_or(false);

    if !supabase_reachable {
        issues.push("Supabase cloud database is unreachable".into());
        recommendations.push("Check internet connection and Supabase project status".into());
    }

    let os_info = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);

    SystemDiagnosticStatus {
        timestamp,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os_info,
        storage_dir: app_data.to_string_lossy().to_string(),
        storage_writable,
        personas_count,
        frameworks_count,
        anecdotes_count,
        chats_count,
        hermes_reachable,
        antigravity_reachable,
        gemini_web_reachable,
        deepseek_reachable,
        supabase_reachable,
        supabase_url,
        issues_detected: issues,
        recommendations,
    }
}

pub async fn export_diagnostic_bundle() -> Result<String, String> {
    let diag = run_comprehensive_diagnostics().await;
    let log_dir = get_log_dir();
    let export_path = log_dir.join(format!("Axion_Mind_Diagnostic_Report_{}.md", Local::now().format("%Y%m%d_%H%M%S")));

    let mut report = String::new();
    report.push_str("# AXION MIND SYSTEM DIAGNOSTIC REPORT\n");
    report.push_str(&format!("Generated: {}\n\n", diag.timestamp));
    report.push_str("## 1. System Environment\n");
    report.push_str(&format!("- **App Version:** {}\n", diag.app_version));
    report.push_str(&format!("- **Platform:** {}\n", diag.os_info));
    report.push_str(&format!("- **Storage Path:** {}\n", diag.storage_dir));
    report.push_str(&format!("- **Storage Status:** {}\n\n", if diag.storage_writable { "ONLINE (Read/Write OK)" } else { "ERROR (Read-Only/Blocked)" }));

    report.push_str("## 2. Model Bridges & Network Connectivity\n");
    report.push_str(&format!("- **Hermes Gateway (8642):** {}\n", if diag.hermes_reachable { "✅ Connected" } else { "❌ Offline" }));
    report.push_str(&format!("- **Antigravity Bridge (8766):** {}\n", if diag.antigravity_reachable { "✅ Connected" } else { "❌ Offline" }));
    report.push_str(&format!("- **Gemini Web Bridge (8768):** {}\n", if diag.gemini_web_reachable { "✅ Connected" } else { "❌ Offline" }));
    report.push_str(&format!("- **DeepSeek Web Bridge (8769):** {}\n", if diag.deepseek_reachable { "✅ Connected" } else { "❌ Offline" }));
    report.push_str(&format!("- **Supabase Cloud Sync (PostgreSQL):** {}\n\n", if diag.supabase_reachable { "✅ Online & Synced" } else { "❌ Offline" }));

    report.push_str("## 3. Data Bank & Dual-RAG Inventory\n");
    report.push_str(&format!("- **Active Personas:** {}\n", diag.personas_count));
    report.push_str(&format!("- **Framework Knowledge Cards:** {}\n", diag.frameworks_count));
    report.push_str(&format!("- **Historical Anecdote Cards:** {}\n", diag.anecdotes_count));
    report.push_str(&format!("- **Saved Chat Sessions:** {}\n\n", diag.chats_count));

    report.push_str("## 4. Issues Detected & Health Audit\n");
    if diag.issues_detected.is_empty() {
        report.push_str("✅ **0 Issues Detected.** System is operating in nominal production condition.\n\n");
    } else {
        for issue in &diag.issues_detected {
            report.push_str(&format!("- ⚠️ {}\n", issue));
        }
        report.push('\n');
    }

    report.push_str("## 5. Recent Trace Logs (Tail 100)\n```text\n");
    if let Some(l) = LOGGER.get() {
        for entry in l.get_recent_logs(Some(100)) {
            report.push_str(&format!("[{}] [{}] [{}] {}\n", entry.timestamp, entry.level, entry.tag, entry.message));
            if let Some(det) = entry.details {
                report.push_str(&format!("    DETAIL: {}\n", det));
            }
        }
    }
    report.push_str("```\n");

    fs::write(&export_path, report).map_err(|e| format!("Failed to write diagnostic file: {}", e))?;
    Ok(export_path.to_string_lossy().to_string())
}
