
#[path = "../src/chat_cancel.rs"]
mod chat_cancel;
#[tokio::test]
async fn stop_before_native_registration_is_not_lost() {
    chat_cancel::cancel(Some("early-stop"));
    let mut request=chat_cancel::register(Some("early-stop".into())).unwrap();
    assert!(request.run(async{Ok(1)}).await.is_err(),"a queued Stop must survive IPC ordering");
}
