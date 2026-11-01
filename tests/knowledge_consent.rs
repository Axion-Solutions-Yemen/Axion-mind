#[path="../src/knowledge.rs"] mod knowledge;
#[test]
fn sharing_requires_exact_owner_scope_consultant_and_provider_and_revokes_history(){
 let mut s=knowledge::Store::memory().unwrap();let id=s.propose("a","client-x","Menu is cedar","user:1").unwrap();s.approve("a",id).unwrap();
 assert!(s.context("a","client-x","alpha","fixture-a",6000).unwrap().is_empty());
 assert!(s.share("a","client-x","alpha","fixture-a",true).is_err());
 s.allow_provider("a","fixture-a",true).unwrap();s.share("a","client-x","alpha","fixture-a",true).unwrap();
 assert_eq!(s.context("a","client-x","alpha","fixture-a",6000).unwrap()[0].source,"user:1");
 for (owner,scope,persona,provider) in [("b","client-x","alpha","fixture-a"),("a","client-y","alpha","fixture-a"),("a","client-x","beta","fixture-a"),("a","client-x","alpha","fixture-b")] {assert!(s.context(owner,scope,persona,provider,6000).unwrap().is_empty());}
 assert_eq!(s.history_floor("a","session","client-x",0).unwrap(),0);
 assert_eq!(s.history_floor("a","session","client-x",2).unwrap(),0);
 s.share("a","client-x","alpha","fixture-a",false).unwrap();
 assert_eq!(s.history_floor("a","session","client-x",2).unwrap(),2);
 assert!(s.context("a","client-x","alpha","fixture-a",6000).unwrap().is_empty());
 s.allow_provider("a","fixture-a",false).unwrap();s.allow_provider("a","fixture-a",true).unwrap();
 assert!(s.context("a","client-x","alpha","fixture-a",6000).unwrap().is_empty());
}
#[test]
fn old_backup_cannot_resurrect_corrected_or_deleted_facts_and_consents_never_restore(){
 let p=std::env::temp_dir().join(format!("axion-restore-{}.sqlite",rand::random::<u128>()));
 let mut s=knowledge::Store::open(&p).unwrap();let id=s.propose("a","personal","old","user:1").unwrap();s.approve("a",id).unwrap();let old=s.snapshot("a").unwrap();
 let current=s.correct("a",id,"new","user:2").unwrap();s.restore("a",&old).unwrap();assert_eq!(s.retrieve("a","personal").unwrap()[0].fact,"new");
 let recent=s.snapshot("a").unwrap();s.forget("a",current).unwrap();drop(s);
 let mut s=knowledge::Store::open(&p).unwrap();s.restore("a",&old).unwrap();s.restore("a",&recent).unwrap();assert!(s.retrieve("a","personal").unwrap().is_empty());
 let receipts=s.snapshot("a").unwrap();let mut clean=knowledge::Store::memory().unwrap();clean.restore("a",&receipts).unwrap();clean.restore("a",&old).unwrap();assert!(clean.retrieve("a","personal").unwrap().is_empty());
 assert!(s.restore("b",&old).is_err());let mut corrupt=old.clone();corrupt["data"]["facts"][0]["fact"]=serde_json::json!("tampered");assert!(s.restore("a",&corrupt).is_err());
 drop(s);std::fs::remove_file(p).unwrap();
}
#[test]
fn pending_inspection_reject_and_bounded_context_are_real_store_operations(){
 let mut s=knowledge::Store::memory().unwrap();let id=s.propose("a","personal","pending","user:1").unwrap();
 assert_eq!(s.inspect("a","personal").unwrap()[0].state,"pending");assert!(s.retrieve("a","personal").unwrap().is_empty());s.forget("a",id).unwrap();assert!(s.approve("a",id).is_err());
 let id=s.propose("a","personal",&"ع".repeat(3000),"user:2").unwrap();s.approve("a",id).unwrap();s.allow_provider("a","fixture",true).unwrap();s.share("a","personal","alpha","fixture",true).unwrap();assert!(s.context("a","personal","alpha","fixture",100).unwrap().is_empty());
}
