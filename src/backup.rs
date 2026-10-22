//! Strict, credential-free portable customer snapshots.
use serde_json::{json, Value};
use std::{collections::BTreeMap, fs, path::Path};
const MAX_FILE: usize = 4 * 1024 * 1024;
const MAX_TOTAL: usize = 16 * 1024 * 1024;
const MAX_FILES: usize = 10_000;

pub fn scope_id(root: &Path) -> Result<String,String> {
    use sha2::{Digest,Sha256};
    let canonical=root.canonicalize().map_err(|_|"Cannot resolve the customer storage directory.")?;
    Ok(format!("{:x}",Sha256::digest(canonical.to_string_lossy().to_lowercase().as_bytes())))
}

fn safe_path(rel: &str) -> Result<(), String> {
    let parts: Vec<_> = rel.split('/').collect();
    if parts.is_empty() || parts.iter().any(|p| p.is_empty() || *p == "." || *p == ".." || p.ends_with([' ', '.']) || p.chars().any(|c| c < ' ' || "\\:*?\"<>|".contains(c))) {
        return Err("Backup contains an unsafe relative path.".into());
    }
    for part in &parts {
        let stem=part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if matches!(stem.as_str(),"CON"|"PRN"|"AUX"|"NUL") || ((stem.starts_with("COM") || stem.starts_with("LPT")) && stem.len()==4 && stem.as_bytes()[3].is_ascii_digit()) {
            return Err("Backup contains a reserved Windows path.".into());
        }
    }
    let allowed=rel=="personas.json" || (parts.len()==2 && matches!(parts[0],"chats"|"sessions") && rel.ends_with(".json")) || (parts.len()>=2 && parts[0]=="personas_data");
    if !allowed { return Err("Backup contains a file outside customer data categories.".into()); }
    Ok(())
}

fn capture_once(root: &Path) -> Result<BTreeMap<String,String>,String> {
    let mut result=BTreeMap::new(); let mut total=0;
    if root.symlink_metadata().map_err(|_|"Cannot inspect customer storage.")?.file_type().is_symlink() { return Err("Customer storage cannot be a symbolic link for backup.".into()); }
    for sub in ["personas.json","chats","sessions","personas_data"] {
        let start=root.join(sub);
        let metadata=match fs::symlink_metadata(&start) {
            Ok(metadata)=>metadata,
            Err(error) if error.kind()==std::io::ErrorKind::NotFound=>continue,
            Err(_)=>return Err("Cannot inspect a customer data category; refusing an incomplete backup.".into()),
        };
        if metadata.file_type().is_symlink() {return Err("A customer category is a link; refusing an incomplete backup.".into());}
        if (sub=="personas.json" && !metadata.is_file()) || (sub!="personas.json" && !metadata.is_dir()) {return Err("A customer data category has an invalid file type.".into());}
        for entry in walkdir::WalkDir::new(&start).follow_links(false) {
            let entry=entry.map_err(|_|"Cannot enumerate a customer data file.")?;
            if entry.file_type().is_symlink() { return Err("Symbolic links are not supported in customer backups.".into()); }
            if entry.file_type().is_dir() {continue;}
            if !entry.file_type().is_file() {return Err("Unsupported customer file type.".into());}
            let rel=entry.path().strip_prefix(root).map_err(|_|"Invalid customer path.")?.to_str().ok_or("Customer path is not UTF-8.")?.replace('\\',"/");
            safe_path(&rel)?;
            if entry.metadata().map_err(|_|"Cannot inspect a customer file.")?.len()>MAX_FILE as u64 {return Err("A customer file exceeds the 4 MiB backup limit.".into());}
            let bytes=fs::read(entry.path()).map_err(|_|"Cannot read a customer data file; no complete backup was created.")?;
            total+=bytes.len();
            if bytes.len()>MAX_FILE || total>MAX_TOTAL || result.len()>=MAX_FILES {return Err("Customer snapshot exceeds supported backup limits.".into());}
            let text=String::from_utf8(bytes).map_err(|_|"A customer file is not UTF-8; no complete backup was created.")?;
            if rel.ends_with(".json") {serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')).map_err(|_|"A customer JSON file is invalid; no complete backup was created.")?;}
            result.insert(rel,text);
        }
    }
    if !result.contains_key("personas.json") {return Err("Customer personas.json is missing; refusing an incomplete snapshot.".into());}
    Ok(result)
}

pub fn validate(snapshot: &Value) -> Result<BTreeMap<String,String>,String> {
    if snapshot["version"]!=json!(1) {return Err("Unsupported cloud snapshot version.".into());}
    let files=snapshot["files"].as_object().ok_or("Snapshot files are missing.")?;
    if files.is_empty() || files.len()>MAX_FILES {return Err("Snapshot file count exceeds supported limits.".into());}
    let mut result=BTreeMap::new();let mut aliases=BTreeMap::new();let mut total=0;
    for (rel,value) in files {
        safe_path(rel)?;let text=value.as_str().ok_or("Snapshot content must be UTF-8 text.")?;
        total+=text.len();if text.len()>MAX_FILE || total>MAX_TOTAL {return Err("Snapshot exceeds supported size limits.".into());}
        let mut prefix=String::new();
        for part in rel.split('/') {
            if !prefix.is_empty(){prefix.push('/');} prefix.push_str(part);
            if let Some(previous)=aliases.insert(prefix.to_lowercase(),prefix.clone()) {if previous!=prefix{return Err("Snapshot contains case-colliding Windows paths.".into());}}
        }
        if rel.ends_with(".json") {serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')).map_err(|_|"Snapshot JSON is invalid.")?;}
        result.insert(rel.clone(),text.to_string());
    }
    for rel in result.keys() {
        let parts:Vec<_>=rel.split('/').collect();
        for i in 1..parts.len() {if result.contains_key(&parts[..i].join("/")){return Err("Snapshot contains conflicting file/directory paths.".into());}}
    }
    let personas=result.get("personas.json").ok_or("Snapshot personas.json is missing.")?;
    if !serde_json::from_str::<Value>(personas.trim_start_matches('\u{feff}')).map_err(|_|"Invalid persona JSON.")?.is_array() {return Err("Snapshot personas must be an array.".into());}
    Ok(result)
}

pub fn restore_new(snapshot: &Value,destination: &Path) -> Result<(),String> {
    use std::io::Write;
    let files=validate(snapshot)?;
    if destination.exists() {return Err("Recovery target already exists; no customer files were overwritten.".into());}
    let parent=destination.parent().ok_or("Recovery target has no parent.")?;
    for ancestor in parent.ancestors() {if ancestor.exists() && ancestor.symlink_metadata().map_err(|_|"Cannot inspect recovery parent.")?.file_type().is_symlink(){return Err("Recovery parent cannot contain symbolic links.".into());}}
    if !parent.is_dir(){return Err("Recovery parent is unavailable.".into());}
    let stage=parent.join(format!(".axion-restore-{:032x}",rand::random::<u128>()));
    fs::create_dir(&stage).map_err(|_|"Cannot create recovery staging directory.")?;
    let outcome=(|| {
        for (rel,text) in &files {
            let target=stage.join(rel);if let Some(p)=target.parent(){fs::create_dir_all(p).map_err(|_|"Cannot create recovery subdirectory.")?;}
            let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&target).map_err(|_|"Cannot create recovered file.")?;
            file.write_all(text.as_bytes()).and_then(|_|file.sync_all()).map_err(|_|"Cannot write recovered file.")?;
        }
        if capture(&stage)?!=*snapshot {return Err("Recovered content did not match the snapshot.".into());}
        if destination.exists(){return Err("Recovery target appeared during restore; refusing replacement.".into());}
        fs::rename(&stage,destination).map_err(|_|"Cannot publish recovered directory.")?;Ok(())
    })();
    if outcome.is_err(){let _=fs::remove_dir_all(&stage);}outcome
}

pub fn capture(root: &Path) -> Result<Value,String> {
    let first=capture_once(root)?;
    let second=capture_once(root)?;
    if first!=second { return Err("Customer files changed while exporting. Save your work and retry.".into()); }
    Ok(json!({"version":1,"files":first}))
}
