#[path="../src/resource_id.rs"] mod resource_id;
#[test]
fn rejects_paths_and_keeps_original_identifiers(){
 for id in ["../other","a/b","a\\b","", ".", "a:b", "a\0b"] {assert!(resource_id::validate(id).is_err(),"{id:?}");}
 for id in ["alex-hormozi","alex-hormozi_123_ff","مستشار"] {assert!(resource_id::validate(id).is_ok());}
}
