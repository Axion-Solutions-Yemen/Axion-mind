#[path="../src/backup_policy.rs"] mod backup_policy;
use std::{fs,path::PathBuf};
fn root()->PathBuf{let p=std::env::var_os("TMPDIR").map(PathBuf::from).unwrap_or_else(||dirs::data_local_dir().unwrap().join("hermes/cache/scratch")).join(format!("axion-policy-{}",rand::random::<u128>()));fs::create_dir_all(&p).unwrap();p}
const OWNER:&str="3ba63a12-104c-4786-989a-68563f6a7a86";
#[test] fn native_off_switch_is_durable_and_owner_storage_scoped(){
 let p=root();let scope="a".repeat(64);assert!(!backup_policy::is_disabled(&p,OWNER,&scope).unwrap());
 backup_policy::set_disabled(&p,OWNER,&scope,true).unwrap();assert!(backup_policy::is_disabled(&p,OWNER,&scope).unwrap());
 assert!(!backup_policy::is_disabled(&p,"f0ac0538-35cb-45c9-a9c0-089372abaaf3",&scope).unwrap());assert!(!backup_policy::is_disabled(&p,OWNER,&"b".repeat(64)).unwrap());
 backup_policy::set_disabled(&p,OWNER,&scope,false).unwrap();assert!(!backup_policy::is_disabled(&p,OWNER,&scope).unwrap());fs::remove_dir_all(p).unwrap();
}
#[test] fn native_policy_rejects_non_identity_paths_and_non_file_markers(){
 let p=root();assert!(backup_policy::set_disabled(&p,"../outside",&"a".repeat(64),true).is_err());assert!(backup_policy::set_disabled(&p,OWNER,"../outside",true).is_err());
 backup_policy::set_disabled(&p,OWNER,&"a".repeat(64),true).unwrap();let marker=fs::read_dir(&p).unwrap().next().unwrap().unwrap().path();fs::remove_file(&marker).unwrap();fs::create_dir(&marker).unwrap();assert!(backup_policy::is_disabled(&p,OWNER,&"a".repeat(64)).is_err());assert!(backup_policy::set_disabled(&p,OWNER,&"a".repeat(64),false).is_err());fs::remove_dir_all(p).unwrap();
}
