use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub version: String,
    pub date: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadProgress {
    pub downloaded_bytes: usize,
    pub total_bytes: Option<u64>,
    pub percentage: Option<u8>,
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| format!("Updater unavailable: {}", e))?;
    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateInfo {
            available: true,
            current_version: update.current_version.clone(),
            version: update.version.clone(),
            date: update.date.map(|d| d.to_string()),
            body: update.body.clone(),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Update check failed: {}", e)),
    }
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| format!("Updater unavailable: {}", e))?;
    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => return Err("No pending update found.".to_string()),
        Err(e) => return Err(format!("Update check failed: {}", e)),
    };

    let app_handle_progress = app.clone();
    let mut downloaded: usize = 0;

    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded += chunk_length;
                let pct = content_length.map(|tot| {
                    if tot > 0 {
                        ((downloaded as f64 / tot as f64) * 100.0).min(100.0) as u8
                    } else {
                        0
                    }
                });
                let _ = app_handle_progress.emit(
                    "updater-progress",
                    DownloadProgress {
                        downloaded_bytes: downloaded,
                        total_bytes: content_length,
                        percentage: pct,
                    },
                );
            },
            move || {
                let _ = app.emit("updater-downloaded", ());
            },
        )
        .await
        .map_err(|e| format!("Update download/install failed: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}
