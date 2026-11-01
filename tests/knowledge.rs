#[path="../src/knowledge.rs"] mod knowledge;
#[test]
fn correcting_then_forgetting_redacts_the_whole_lineage() {
 let path=std::env::temp_dir().join(format!("axion-lineage-{}.sqlite",rand::random::<u64>()));
 let mut store=knowledge::Store::open(&path).unwrap();
 let old=store.propose("a","personal","SYNTHETIC_OLD_SECRET","message:1").unwrap();
 store.approve("a",old).unwrap();
 let new=store.correct("a",old,"SYNTHETIC_NEW_SECRET","message:2").unwrap();
 store.forget("a",new).unwrap();
 let db=rusqlite::Connection::open(&path).unwrap();
 let remaining:i64=db.query_row("SELECT count(*) FROM facts WHERE fact != '' OR source != ''",[],|r|r.get(0)).unwrap();
 drop(db);drop(store);std::fs::remove_file(path).unwrap();
 assert_eq!(remaining,0,"superseded source and content must be redacted too");
}
#[test]
fn forgetting_an_old_reference_forgets_its_current_correction() {
 let mut store=knowledge::Store::memory().unwrap();
 let old=store.propose("a","personal","old","message:1").unwrap();store.approve("a",old).unwrap();
 store.correct("a",old,"new","message:2").unwrap();
 assert!(store.forget("a",old).is_ok(),"old fact links must still revoke the whole lineage");
 assert!(store.retrieve("a","personal").unwrap().is_empty());
}
#[test]
fn provenance_cannot_bypass_memory_size_limit() {
 let mut store=knowledge::Store::memory().unwrap();
 assert!(store.propose("a","personal","short",&"x".repeat(13_000)).is_err());
}
#[test]
fn approved_records_survive_reopen(){
 let path=std::path::PathBuf::from(std::env::var("TMPDIR").expect("test scratch required")).join(format!("axion-knowledge-{}.sqlite",rand::random::<u64>()));
 { let mut store=knowledge::Store::open(&path).unwrap(); let id=store.propose("a","b","persisted","message:1").unwrap();store.approve("a",id).unwrap(); }
 { let store=knowledge::Store::open(&path).unwrap(); assert_eq!(store.retrieve("a","b").unwrap()[0].fact,"persisted"); }
 std::fs::remove_file(path).unwrap();
}
#[test]
fn memory_is_scoped_reviewable_correctable_and_forgotten(){
 let mut store=knowledge::Store::memory().unwrap();
 let id=store.propose("owner-a","client-a","Menu is cedar","user-message:1").unwrap();
 assert!(store.retrieve("owner-a","client-a").unwrap().is_empty());
 assert!(store.approve("owner-b",id).is_err());
 store.approve("owner-a",id).unwrap();
 assert_eq!(store.retrieve("owner-a","client-a").unwrap()[0].fact,"Menu is cedar");
 assert!(store.retrieve("owner-a","client-b").unwrap().is_empty());
 let newer=store.correct("owner-a",id,"Menu is birch","user-message:2").unwrap();
 assert_eq!(store.retrieve("owner-a","client-a").unwrap()[0].id,newer);
 store.forget("owner-a",newer).unwrap();
 assert!(store.retrieve("owner-a","client-a").unwrap().is_empty());
 assert!(store.approve("owner-a",newer).is_err());
}
