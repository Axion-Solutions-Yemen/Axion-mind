#[path = "../src/chat_cancel.rs"]
mod chat_cancel;
#[tokio::test]
async fn cancellation_interrupts_silent_work_without_cancelling_another_request() {
    let mut a=chat_cancel::register(Some("test-a".into())).unwrap();
    let mut b=chat_cancel::register(Some("test-b".into())).unwrap();
    assert!(chat_cancel::register(Some("test-a".into())).is_err());
    let task=tokio::spawn(async move { a.run(async { std::future::pending::<Result<(),String>>().await }).await });
    chat_cancel::cancel(Some("test-a"));
    let result=tokio::time::timeout(std::time::Duration::from_millis(200),task).await.expect("request's own task must finish before watchdog").unwrap();
    assert_eq!(result.unwrap_err(),"Generation cancelled");
    assert_eq!(b.run(async{Ok(7)}).await.unwrap(),7);
}
