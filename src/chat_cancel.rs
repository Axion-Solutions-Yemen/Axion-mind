use std::{collections::{HashMap, VecDeque}, sync::{Mutex, OnceLock}, future::Future};
use tokio::sync::watch;
#[derive(Default)]
struct Registry { active: HashMap<String, watch::Sender<bool>>, latest: Option<String>, early: VecDeque<String> }
static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
fn registry() -> &'static Mutex<Registry> { REGISTRY.get_or_init(|| Mutex::new(Registry::default())) }
pub struct RequestGuard { id: String, receiver: watch::Receiver<bool> }
pub fn register(id: Option<String>) -> Result<RequestGuard, String> {
    let id = id.unwrap_or_else(|| format!("native-{}",rand::random::<u128>()));
    let mut registry=registry().lock().map_err(|_|"Cancellation registry unavailable")?;
    if registry.active.contains_key(&id) { return Err("Request already active".into()); }
    let early = registry.early.iter().position(|key| key == &id).and_then(|position| registry.early.remove(position)).is_some();
    let (sender, receiver)=watch::channel(early);
    registry.active.insert(id.clone(),sender); registry.latest=Some(id.clone());
    Ok(RequestGuard{id,receiver})
}
pub fn cancel(id: Option<&str>) {
    if let Ok(mut registry)=registry().lock() {
        if let Some(key)=id.or(registry.latest.as_deref()) {
            if let Some(sender)=registry.active.get(key) { sender.send_replace(true); }
            else if let Some(id)=id { if id.len()<=128 && !registry.early.iter().any(|key| key==id) {
                registry.early.push_back(id.to_owned()); if registry.early.len()>128 {registry.early.pop_front();}
            } }
        }
    }
}
impl RequestGuard {
    pub async fn run<T, F: Future<Output=Result<T,String>>>(&mut self, future:F) -> Result<T,String> {
        let receiver=&mut self.receiver;
        tokio::select! { biased;
            _ = async { while !*receiver.borrow_and_update() { if receiver.changed().await.is_err() {break;} } } => Err("Generation cancelled".into()),
            result = future => result
        }
    }
}
impl Drop for RequestGuard {
    fn drop(&mut self) { if let Ok(mut r)=registry().lock() {r.active.remove(&self.id);if r.latest.as_deref()==Some(&self.id){r.latest=None;}} }
}
