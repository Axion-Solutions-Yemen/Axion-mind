//! Credential-free durable per-account/per-storage automatic-backup off switches.
use std::{fs,path::{Path,PathBuf}};
use sha2::{Digest,Sha256};
fn marker(root:&Path,owner:&str,scope:&str)->Result<PathBuf,String>{
 let valid_owner=owner.len()==36&&owner.chars().enumerate().all(|(i,c)|if [8,13,18,23].contains(&i){c=='-'}else{c.is_ascii_hexdigit()});
 if !valid_owner||scope.len()!=64||!scope.chars().all(|c|c.is_ascii_hexdigit()){return Err("Invalid backup policy identity.".into());}
 match fs::symlink_metadata(root){Ok(m) if m.file_type().is_symlink()||!m.is_dir()=>return Err("Backup policy storage must be a real directory.".into()),Err(e) if e.kind()!=std::io::ErrorKind::NotFound=>return Err("Cannot inspect backup policy storage.".into()),_=>{}}
 Ok(root.join(format!("{:x}.disabled",Sha256::digest(format!("{}|{}",owner,scope).as_bytes()))))
}
pub fn is_disabled(root:&Path,owner:&str,scope:&str)->Result<bool,String>{
 let path=marker(root,owner,scope)?;
 match fs::symlink_metadata(path){Ok(m) if m.is_file()&&!m.file_type().is_symlink()=>Ok(true),Ok(_)=>Err("Invalid backup policy marker; automatic backup is paused.".into()),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(false),Err(_)=>Err("Cannot read backup policy; automatic backup is paused.".into())}
}
pub fn set_disabled(root:&Path,owner:&str,scope:&str,disabled:bool)->Result<(),String>{
 let path=marker(root,owner,scope)?;
 if disabled{
  fs::create_dir_all(root).map_err(|_|"Cannot save the automatic-backup off switch.")?;
  let path=marker(root,owner,scope)?;
  match fs::OpenOptions::new().write(true).create_new(true).open(path){Ok(file)=>file.sync_all().map_err(|_|"Cannot flush the automatic-backup off switch.".into()),Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>if is_disabled(root,owner,scope)?{Ok(())}else{Err("Cannot confirm the off switch.".into())},Err(_)=>Err("Cannot save the automatic-backup off switch.".into())}
 }else{
  if is_disabled(root,owner,scope)?{fs::remove_file(path).map_err(|_|"Cannot remove the automatic-backup off switch.")?;}
  Ok(())
 }
}
