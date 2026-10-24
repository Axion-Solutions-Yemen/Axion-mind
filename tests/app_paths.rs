#[path = "../src/app_paths.rs"]
mod app_paths;
#[test]
fn sandbox_is_explicit_marked_absolute_and_never_falls_back() {
    let root=std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/test-scratch").join(format!("axion-isolation-{}",rand::random::<u64>()));
    std::fs::create_dir_all(&root).unwrap();
    assert!(app_paths::validate_sandbox(&root).is_err());
    std::fs::write(root.join(".axion-test-workspace"),"AXION_TEST_ONLY").unwrap();
    assert_eq!(app_paths::validate_sandbox(&root).unwrap(),root);
    assert!(app_paths::validate_sandbox(std::path::Path::new("relative")).is_err());
    std::fs::remove_dir_all(root).unwrap();
}
