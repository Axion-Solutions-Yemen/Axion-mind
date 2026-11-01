pub fn validate(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 240 || !id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid resource identifier".into());
    }
    Ok(())
}
