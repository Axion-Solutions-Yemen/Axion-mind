
mod db;
fn main() {
    match db::list_hermes_sessions() {
        Ok(sessions) => {
            println!("SUCCESS: Extracted {} Hermes sessions!", sessions.len());
            for s in sessions.iter().take(3) {
                println!("  - [{}] {} (msgs: {})", s.source, s.title, s.message_count);
            }
        },
        Err(e) => {
            println!("ERROR from db::list_hermes_sessions: {}", e);
        }
    }
}
