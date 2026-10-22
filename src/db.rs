use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct HermesSession {
    pub id: String,
    pub source: String,
    pub title: String,
    pub model: String,
    pub message_count: i64,
    pub last_activity_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolCallItem {
    pub name: String,
    pub args: String,
    pub output: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FormattedMessage {
    pub role: String,
    pub content: String,
    pub tools: Vec<ToolCallItem>,
    pub timestamp: Option<String>,
}

fn get_state_db_path() -> Result<PathBuf, String> {
    if let Some(root) = crate::app_paths::sandbox()? { return Ok(root.join("hermes/state.db")); }
    if let Some(local_app_data) = dirs::data_local_dir() {
        let p = local_app_data.join("hermes").join("state.db");
        if p.exists() {
            return Ok(p);
        }
    }
    let home = dirs::home_dir().ok_or("Cannot locate home directory")?;
    let p = home.join("AppData").join("Local").join("hermes").join("state.db");
    Ok(p)
}

pub fn list_hermes_sessions() -> Result<Vec<HermesSession>, String> {
    let db_path = get_state_db_path()?;
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let conn = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    ).map_err(|e| e.to_string())?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
        .map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, source, COALESCE(display_name, title, id), COALESCE(model, 'unknown'),
                COALESCE(message_count, 0), COALESCE(CAST(last_activity_at AS TEXT), CAST(started_at AS TEXT), '')
         FROM sessions
         ORDER BY last_activity_at DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(HermesSession {
            id: row.get(0)?,
            source: row.get(1)?,
            title: row.get(2)?,
            model: row.get(3)?,
            message_count: row.get(4)?,
            last_activity_at: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(item) = r {
            list.push(item);
        }
    }
    Ok(list)
}

pub fn get_hermes_messages(session_id: &str) -> Result<Vec<FormattedMessage>, String> {
    let db_path = get_state_db_path()?;
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let conn = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    ).map_err(|e| e.to_string())?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
        .map_err(|e| e.to_string())?;

    // Load tool execution outputs
    let mut tool_stmt = conn.prepare(
        "SELECT tool_call_id, content FROM messages WHERE session_id = ? AND role = 'tool' AND tool_call_id IS NOT NULL"
    ).map_err(|e| e.to_string())?;

    let tool_map: std::collections::HashMap<String, String> = tool_stmt.query_map([session_id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    let mut msg_stmt = conn.prepare(
        "SELECT role, content, tool_calls, CAST(timestamp AS TEXT) FROM messages WHERE session_id = ? ORDER BY id ASC"
    ).map_err(|e| e.to_string())?;

    let raw_rows = msg_stmt.query_map([session_id], |row| {
        let role: String = row.get(0)?;
        let content: Option<String> = row.get(1)?;
        let tool_calls: Option<String> = row.get(2)?;
        let timestamp: Option<String> = row.get(3)?;
        Ok((role, content.unwrap_or_default(), tool_calls, timestamp))
    }).map_err(|e| e.to_string())?;

    let mut formatted: Vec<FormattedMessage> = Vec::new();

    for r in raw_rows {
        let (role, content, tc_raw, timestamp) = match r {
            Ok(v) => v,
            Err(_) => continue,
        };

        if role == "user" {
            if !content.is_empty() {
                formatted.push(FormattedMessage {
                    role: "user".to_string(),
                    content,
                    tools: Vec::new(),
                    timestamp,
                });
            }
        } else if role == "assistant" {
            let mut parsed_tools = Vec::new();
            if let Some(raw_json) = tc_raw {
                if let Ok(tcs) = serde_json::from_str::<serde_json::Value>(&raw_json) {
                    if let Some(arr) = tcs.as_array() {
                        for item in arr {
                            let t_id = item.get("id").or_else(|| item.get("call_id")).and_then(|v| v.as_str()).unwrap_or("");
                            let fn_obj = item.get("function");
                            let name = fn_obj.and_then(|f| f.get("name")).or_else(|| item.get("name")).and_then(|v| v.as_str()).unwrap_or("tool");
                            let args = fn_obj.and_then(|f| f.get("arguments")).or_else(|| item.get("arguments")).and_then(|v| v.as_str()).unwrap_or("");
                            let output = tool_map.get(t_id).cloned().unwrap_or_default();

                            parsed_tools.push(ToolCallItem {
                                name: name.to_string(),
                                args: args.to_string(),
                                output,
                            });
                        }
                    }
                }
            }

            // Coalesce into prior assistant turn if adjacent
            if let Some(last) = formatted.last_mut() {
                if last.role == "assistant" {
                    last.tools.extend(parsed_tools);
                    if !content.is_empty() {
                        if !last.content.is_empty() {
                            last.content.push_str("\n\n");
                        }
                        last.content.push_str(&content);
                    }
                    if timestamp.is_some() {
                        last.timestamp = timestamp;
                    }
                    continue;
                }
            }

            if !content.is_empty() || !parsed_tools.is_empty() {
                formatted.push(FormattedMessage {
                    role: "assistant".to_string(),
                    content,
                    tools: parsed_tools,
                    timestamp,
                });
            }
        }
    }

    Ok(formatted)
}
