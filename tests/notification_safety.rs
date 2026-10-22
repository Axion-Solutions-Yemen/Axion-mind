#[path = "../src/notification.rs"]
mod notification;

#[test]
fn notification_via_stdin_does_not_evaluate_syntax() {
    let res = notification::show("safe title", "$(exit 42)");
    assert!(res.is_ok());
}
