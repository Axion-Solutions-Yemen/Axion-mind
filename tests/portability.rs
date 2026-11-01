#[path="../src/config.rs"] mod config;
mod app_paths { pub fn hub()->Result<std::path::PathBuf,String>{Err("Tests must not use a real profile".into())} }
#[test]
fn fresh_configuration_never_assumes_founder_bridges_or_credentials() {
 std::env::set_var("AXION_SANDBOX_ROOT",std::env::temp_dir());
 let config=config::AppConfig::default();
 assert!(config.hermes_auth_token.is_empty());
 assert!(config.custom_url.is_empty(),"a new installation must explicitly select its endpoint");
 assert!(config.custom_model.is_empty());
}

mod identity {pub struct Principal{pub vault:std::path::PathBuf} pub fn current()->Result<Principal,String>{Err("Test profile only".into())}}
