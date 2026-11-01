//! Principal comes only from the native verified session store, never an IPC owner argument.
use std::{path::{Path,PathBuf},sync::{Mutex,OnceLock}};
use serde::Serialize;
use sha2::{Digest,Sha256};
#[derive(Clone,Debug,Serialize)]
pub struct Principal {pub id:String,pub kind:String,pub vault:PathBuf}
static EPOCH:OnceLock<Mutex<u128>>=OnceLock::new();
pub fn invalidate(){if let Ok(mut e)=EPOCH.get_or_init(||Mutex::new(rand::random())).lock(){*e=rand::random();}}
pub fn token()->Result<String,String>{let p=current()?;let e=EPOCH.get_or_init(||Mutex::new(rand::random())).lock().map_err(|_|"Identity coordinator unavailable")?;Ok(format!("{}:{:032x}",p.id,*e))}
pub fn check_path(path:&Path)->Result<(),String>{
 for p in path.ancestors(){match std::fs::symlink_metadata(p){Ok(m)=>{
  #[cfg(windows)] {use std::os::windows::fs::MetadataExt;if m.file_attributes()&0x400!=0{return Err("Linked/reparse vault paths are not supported".into());}}
  if m.file_type().is_symlink(){return Err("Linked vault path refused".into());}
 },Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},Err(_)=>return Err("Cannot inspect vault path".into())}}
 Ok(())
}
pub fn current()->Result<Principal,String>{
 let base=crate::app_paths::hub()?;check_path(&base)?;std::fs::create_dir_all(&base).map_err(|e|e.to_string())?;
 let (subject,kind)=match crate::auth::SessionStore::production()?.read()? {
  Some(session)=>{let id=session["id"].as_str().ok_or("Saved account identity missing; sign in again")?;crate::resource_id::validate(id)?;(format!("account:{id}"),"account")},
  None=>{
   let path=base.join("local-principal");check_path(&path)?;
   let id=if path.exists(){std::fs::read_to_string(&path).map_err(|e|e.to_string())?}else{
    use std::io::Write;let id=format!("{:032x}",rand::random::<u128>());
    match std::fs::OpenOptions::new().create_new(true).write(true).open(&path){Ok(mut f)=>{f.write_all(id.as_bytes()).and_then(|_|f.sync_all()).map_err(|e|e.to_string())?;id},Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>std::fs::read_to_string(&path).map_err(|e|e.to_string())?,Err(e)=>return Err(e.to_string())}
   };crate::resource_id::validate(&id)?;(format!("local:{id}"),"local")
  }
 };
 let id=format!("{:x}",Sha256::digest(subject.as_bytes()));
 let vault=base.join("vaults").join(&id);check_path(&vault)?;
 for sub in ["","chats","sessions"]{std::fs::create_dir_all(vault.join(sub)).map_err(|e|e.to_string())?;}
 Ok(Principal{id,kind:kind.into(),vault})
}
