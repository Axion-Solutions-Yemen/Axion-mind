use std::path::{Path, PathBuf};

pub fn validate_sandbox(root: &Path) -> Result<PathBuf, String> {
    if !root.is_absolute() || std::fs::read_to_string(root.join(".axion-test-workspace")).unwrap_or_default().trim() != "AXION_TEST_ONLY" {
        return Err("Sandbox requires an absolute, explicitly marked test workspace; refusing production fallback.".into());
    }
    Ok(root.to_path_buf())
}
pub fn sandbox() -> Result<Option<PathBuf>, String> {
    std::env::var_os("AXION_SANDBOX_ROOT").map(|p| validate_sandbox(Path::new(&p))).transpose()
}
pub fn hub() -> Result<PathBuf, String> {
    let base = match sandbox()? { Some(p) => p, None => dirs::data_local_dir().or_else(dirs::data_dir).ok_or("Cannot locate AppData")? };
    Ok(base.join("PersonasHub"))
}
