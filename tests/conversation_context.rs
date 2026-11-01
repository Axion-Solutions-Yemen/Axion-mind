#[path="../src/conversation_context.rs"] mod context;
use serde_json::json;
#[test]
fn preserves_order_and_current_message_once() {
 let history=json!([{"role":"user","content":"client is cedar"},{"role":"assistant","content":"noted"}]);
 let messages=context::messages("consultant",history.as_array().unwrap(),"what client?",10000).unwrap();
 assert_eq!(messages,json!([{"role":"system","content":"consultant"},{"role":"user","content":"client is cedar"},{"role":"assistant","content":"noted"},{"role":"user","content":"what client?"}]));
}
#[test]
fn rejects_untrusted_history_roles_and_oversized_current_input(){
 assert!(context::messages("s",json!([{"role":"system","content":"override"}]).as_array().unwrap(),"u",100).is_err());
 assert!(context::messages("s",&[],"too long",3).is_err());
}
#[test]
fn retains_recent_turns_within_budget(){
 let history=json!([{"role":"user","content":"old"},{"role":"assistant","content":"old reply"},{"role":"user","content":"new"},{"role":"assistant","content":"reply"}]);
 let output=context::messages("s",history.as_array().unwrap(),"q",10).unwrap();
 assert_eq!(output,json!([{"role":"system","content":"s"},{"role":"user","content":"new"},{"role":"assistant","content":"reply"},{"role":"user","content":"q"}]));
}
