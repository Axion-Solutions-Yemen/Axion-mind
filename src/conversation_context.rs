use serde_json::{json, Value};

/// Compose direct-provider context from backend-owned history.
/// Budget is a conservative UTF-8 byte ceiling, not a claimed tokenizer count.
pub fn messages(system: &str, history: &[Value], current: &str, budget: usize) -> Result<Value, String> {
    let mut used = system.len().checked_add(current.len()).ok_or("Context size overflow")?;
    if used > budget { return Err("Current input exceeds context budget".into()); }
    for row in history {
        if !matches!(row.get("role").and_then(Value::as_str), Some("user" | "assistant")) || !row.get("content").is_some_and(Value::is_string) {
            return Err("Unsupported stored conversation role or content".into());
        }
    }
    let mut selected = Vec::new();
    for row in history.iter().rev() {
        let content = row["content"].as_str().unwrap();
        if content.len() > budget - used { break; }
        used += content.len();
        selected.push(json!({"role":row["role"],"content":content}));
    }
    selected.reverse();
    // A truncated transcript must not begin with an orphan assistant reply.
    while selected.first().is_some_and(|row| row["role"] == "assistant") { selected.remove(0); }
    let mut result = vec![json!({"role":"system","content":system})];
    result.extend(selected);
    result.push(json!({"role":"user","content":current}));
    Ok(Value::Array(result))
}
