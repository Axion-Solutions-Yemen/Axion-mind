//! Shared room and backup validation; no config or credentials.
use serde_json::Value;
pub const PROVIDERS: &[&str] = &[
    "hermes_local",
    "custom_gateway",
    "openai",
    "openrouter",
    "groq",
    "gemini",
];
pub fn valid_id(id: &str) -> bool {
    let upper = id.to_ascii_uppercase();
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        && !matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !((upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper.len() == 4
            && upper.as_bytes()[3].is_ascii_digit())
}
fn text(v: &Value, k: &str) -> bool {
    v[k].is_string()
}
fn nonempty(v: &Value, k: &str) -> bool {
    v[k].as_str().is_some_and(|s| !s.trim().is_empty())
}
fn nullable(v: &Value, k: &str) -> bool {
    v.get(k).is_some_and(|v| v.is_null() || v.is_string())
}
fn timestamp(v: &Value, k: &str) -> bool {
    v[k].as_str()
        .is_some_and(|s| chrono::DateTime::parse_from_rfc3339(s).is_ok())
}
pub fn validate(v: &Value, id: &str) -> Result<(), String> {
    let fail = || "Invalid conference room; refusing to overwrite or restore it.".to_string();
    if !valid_id(id)
        || v["version"] != 1
        || v["id"] != id
        || !nonempty(v, "topic")
        || !timestamp(v, "created_at")
        || !timestamp(v, "updated_at")
        || v["round"].as_u64().is_none()
        || !nullable(v, "active_request_id")
        || !matches!(
            v["status"].as_str(),
            Some("idle" | "running" | "completed" | "failed" | "cancelled" | "interrupted")
        )
    {
        return Err(fail());
    }
    if (v["status"] == "running")
        != v["active_request_id"]
            .as_str()
            .is_some_and(|s| !s.is_empty())
    {
        return Err(fail());
    }
    let participants = v["participants"].as_array().ok_or_else(fail)?;
    if participants.is_empty() || participants.len() > 32 {
        return Err(fail());
    }
    let mut ids = std::collections::HashSet::new();
    for p in participants {
        let pid = p["id"].as_str().ok_or_else(fail)?;
        if !valid_id(pid)
            || !ids.insert(pid)
            || !nonempty(p, "name")
            || !nonempty(p, "model")
            || !PROVIDERS.contains(&p["provider"].as_str().unwrap_or(""))
            || !matches!(p["kind"].as_str(), Some("persona" | "hermes"))
            || (p["kind"] == "hermes") != (pid == "__hermes__")
        {
            return Err(fail());
        }
    }
    let mut ids = std::collections::HashSet::new();
    for e in v["transcript"].as_array().ok_or_else(fail)? {
        if !e["id"]
            .as_str()
            .is_some_and(|id| valid_id(id) && ids.insert(id))
            || !nonempty(e, "request_id")
            || !nonempty(e, "speaker_id")
            || !nonempty(e, "speaker_name")
            || e["round"]
                .as_u64()
                .is_none_or(|r| r == 0 || r > v["round"].as_u64().unwrap())
            || !text(e, "content")
            || !text(e, "thinking")
            || !nullable(e, "error")
            || !timestamp(e, "created_at")
            || !(e.get("completed_at").is_some_and(Value::is_null) || timestamp(e, "completed_at"))
            || !matches!(
                e["status"].as_str(),
                Some(
                    "pending" | "streaming" | "completed" | "failed" | "cancelled" | "interrupted"
                )
            )
        {
            return Err(fail());
        }
        match e["kind"].as_str() {
            Some("user")
                if e.get("model").is_some_and(Value::is_null)
                    && e.get("provider").is_some_and(Value::is_null) => {}
            Some("persona" | "hermes")
                if nonempty(e, "model")
                    && PROVIDERS.contains(&e["provider"].as_str().unwrap_or("")) => {}
            _ => return Err(fail()),
        }
    }
    Ok(())
}
