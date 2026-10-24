use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Write,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};
#[path = "conference_schema.rs"]
mod schema;
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ParticipantInput {
    pub id: String,
    pub model: String,
    pub provider: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Participant {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub model: String,
    pub provider: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Entry {
    pub id: String,
    pub round: u64,
    pub request_id: String,
    pub speaker_id: String,
    pub speaker_name: String,
    pub kind: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub content: String,
    pub thinking: String,
    pub status: String,
    pub error: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Room {
    pub version: u32,
    pub id: String,
    pub topic: String,
    pub participants: Vec<Participant>,
    pub transcript: Vec<Entry>,
    pub created_at: String,
    pub updated_at: String,
    pub round: u64,
    pub status: String,
    pub active_request_id: Option<String>,
}
static STORAGE: Mutex<()> = Mutex::new(());
static RUNS: OnceLock<Mutex<HashMap<PathBuf, String>>> = OnceLock::new();
fn runs() -> &'static Mutex<HashMap<PathBuf, String>> {
    RUNS.get_or_init(|| Mutex::new(HashMap::new()))
}
pub fn with_idle_store<T>(
    root: &std::path::Path,
    action: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let _lock = STORAGE.lock().map_err(|_| "Room storage unavailable")?;
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    if runs()
        .lock()
        .map_err(|_| "Room registry unavailable")?
        .keys()
        .any(|p| p.starts_with(&root))
    {
        return Err("Stop conference rounds before restoring data".into());
    }
    action()
}
fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}
fn uid(prefix: &str) -> String {
    format!("{prefix}-{:032x}", rand::random::<u128>())
}
pub struct ConferenceStore {
    root: PathBuf,
}
impl ConferenceStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }
    pub fn scoped(scope: &str) -> Result<Self, String> {
        let root = crate::personas::get_app_data_dir()?;
        if crate::backup::scope_id(&root)? != scope {
            return Err("Storage changed. Reopen the room in its original storage folder.".into());
        }
        Ok(Self::new(root.canonicalize().map_err(|e| e.to_string())?))
    }
    fn path(&self, id: &str) -> Result<PathBuf, String> {
        if !schema::valid_id(id) {
            return Err("Invalid room identity".into());
        }
        let path = self.root.join("conferences").join(format!("{id}.json"));
        for p in [
            self.root.clone(),
            self.root.join("conferences"),
            path.clone(),
        ] {
            if let Ok(meta) = fs::symlink_metadata(p) {
                if meta.file_type().is_symlink() {
                    return Err("Conference storage cannot contain symbolic links".into());
                }
            }
        }
        Ok(path)
    }
    fn read(&self, id: &str) -> Result<Room, String> {
        let path = self.path(id)?;
        if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 4 * 1024 * 1024 {
            return Err("Room exceeds the 4 MiB storage limit".into());
        }
        let value: serde_json::Value =
            serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        schema::validate(&value, id)?;
        serde_json::from_value(value).map_err(|e| e.to_string())
    }
    fn write(&self, room: &Room) -> Result<(), String> {
        let value = serde_json::to_value(room).map_err(|e| e.to_string())?;
        schema::validate(&value, &room.id)?;
        let bytes = serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?;
        if bytes.len() > 4 * 1024 * 1024 {
            return Err("Room exceeds the 4 MiB storage limit. Start a new room.".into());
        }
        let path = self.path(&room.id)?;
        fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        // Stage outside customer categories, on the same volume, then atomically replace.
        let temp = self.root.join(format!(".conference-{}.tmp", uid("save")));
        let result = (|| {
            let mut f = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp)
                .map_err(|e| e.to_string())?;
            f.write_all(&bytes)
                .and_then(|_| f.sync_all())
                .map_err(|e| e.to_string())?;
            drop(f);
            fs::rename(&temp, &path).map_err(|e| e.to_string())
        })();
        if result.is_err() {
            let _ = fs::remove_file(temp);
        }
        result
    }
    fn personas(&self) -> Result<Vec<serde_json::Value>, String> {
        serde_json::from_slice(
            &fs::read(self.root.join("personas.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| format!("Cannot read persona definitions: {e}"))
    }
    fn participants(&self, inputs: Vec<ParticipantInput>) -> Result<Vec<Participant>, String> {
        if inputs.is_empty() || inputs.len() > 32 {
            return Err("Select between 1 and 32 participants".into());
        }
        let personas = self.personas()?;
        let mut seen = HashSet::new();
        let mut result = Vec::new();
        for p in inputs {
            if !schema::valid_id(&p.id) || !seen.insert(p.id.clone()) {
                return Err("Invalid or duplicate participant".into());
            }
            if p.model.trim().is_empty()
                || p.model.len() > 256
                || p.model != p.model.trim()
                || p.model.chars().any(char::is_control)
            {
                return Err("Every participant needs an exact model ID".into());
            }
            if !schema::PROVIDERS.contains(&p.provider.as_str()) {
                return Err("Unknown provider".into());
            }
            let hermes = p.id == "__hermes__";
            let name = if hermes {
                "Hermes Personal Agent".to_string()
            } else {
                let matches: Vec<_> = personas.iter().filter(|v| v["id"] == p.id).collect();
                if matches.len() != 1 {
                    return Err(format!("Missing or duplicate persona: {}", p.id));
                }
                matches[0]["name"]
                    .as_str()
                    .filter(|s| !s.trim().is_empty())
                    .ok_or("Persona name is missing")?
                    .to_string()
            };
            result.push(Participant {
                id: p.id,
                name,
                kind: if hermes { "hermes" } else { "persona" }.into(),
                model: p.model,
                provider: p.provider,
            });
        }
        result.sort_by_key(|p| p.kind == "hermes");
        Ok(result)
    }
    fn recover(&self, mut room: Room) -> Result<Room, String> {
        if room.status == "running"
            && !runs()
                .lock()
                .map_err(|_| "Room registry unavailable")?
                .contains_key(&self.path(&room.id)?)
        {
            finish(
                &mut room,
                "interrupted",
                Some("Application exited before this round completed".into()),
            );
            self.write(&room)?;
        }
        Ok(room)
    }
    pub fn create(&self, topic: &str, inputs: Vec<ParticipantInput>) -> Result<Room, String> {
        let _lock = STORAGE.lock().map_err(|_| "Room storage unavailable")?;
        if topic.trim().is_empty() || topic.chars().count() > 500 {
            return Err("Enter a topic of 1 to 500 characters".into());
        }
        let room = Room {
            version: 1,
            id: uid("room"),
            topic: topic.trim().into(),
            participants: self.participants(inputs)?,
            transcript: vec![],
            created_at: now(),
            updated_at: now(),
            round: 0,
            status: "idle".into(),
            active_request_id: None,
        };
        self.write(&room)?;
        Ok(room)
    }
    pub fn get(&self, id: &str) -> Result<Room, String> {
        let _lock = STORAGE.lock().map_err(|_| "Room storage unavailable")?;
        self.recover(self.read(id)?)
    }
    pub fn list(&self) -> Result<Vec<Room>, String> {
        let _lock = STORAGE.lock().map_err(|_| "Room storage unavailable")?;
        self.path("check")?;
        let dir = self.root.join("conferences");
        if !dir.exists() {
            return Ok(vec![]);
        }
        let mut rooms = Vec::new();
        for item in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let path = item.map_err(|e| e.to_string())?.path();
            if path.extension().is_some_and(|v| v == "json") {
                let id = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .ok_or("Invalid room filename")?;
                rooms.push(self.recover(self.read(id)?)?);
            }
        }
        rooms.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(rooms)
    }
    pub fn update(&self, id: &str, inputs: Vec<ParticipantInput>) -> Result<Room, String> {
        let _lock = STORAGE.lock().map_err(|_| "Room storage unavailable")?;
        let mut room = self.recover(self.read(id)?)?;
        if room.status == "running" {
            return Err("Stop the active round before editing participants".into());
        }
        room.participants = self.participants(inputs)?;
        room.updated_at = now();
        self.write(&room)?;
        Ok(room)
    }
    pub fn begin_round(&self, id: &str, message: &str, request: &str) -> Result<Room, String> {
        let _lock = STORAGE.lock().map_err(|_| "Room storage unavailable")?;
        let mut room = self.read(id)?;
        if room.status == "running" {
            return Err(
                "Room already has an active round; reopen an interrupted room first".into(),
            );
        }
        if message.trim().is_empty() || message.len() > 64000 || !schema::valid_id(request) {
            return Err("Invalid message or request identity".into());
        }
        if room.transcript.iter().any(|e| e.request_id == request) {
            return Err("Request already recorded; reopen the room to see its result".into());
        }
        let speakers = select_speakers(&room.participants, message)?;
        for p in &speakers {
            self.system_prompt(p)?;
        }
        room.round += 1;
        room.status = "running".into();
        room.active_request_id = Some(request.into());
        room.updated_at = now();
        room.transcript.push(Entry {
            id: uid("entry"),
            round: room.round,
            request_id: request.into(),
            speaker_id: "user".into(),
            speaker_name: "You".into(),
            kind: "user".into(),
            model: None,
            provider: None,
            content: message.into(),
            thinking: String::new(),
            status: "completed".into(),
            error: None,
            created_at: now(),
            completed_at: Some(now()),
        });
        for p in speakers {
            room.transcript.push(Entry {
                id: uid("entry"),
                round: room.round,
                request_id: request.into(),
                speaker_id: p.id,
                speaker_name: p.name,
                kind: p.kind,
                model: Some(p.model),
                provider: Some(p.provider),
                content: String::new(),
                thinking: String::new(),
                status: "pending".into(),
                error: None,
                created_at: now(),
                completed_at: None,
            });
        }
        self.write(&room)?;
        Ok(room)
    }
    pub fn append_delta(
        &self,
        id: &str,
        request: &str,
        index: usize,
        delta: &str,
        thinking: bool,
    ) -> Result<Room, String> {
        self.mutate(id, request, |r| {
            let e = r.transcript.get_mut(index).ok_or("Missing speaker")?;
            if e.request_id != request || !matches!(e.status.as_str(), "pending" | "streaming") {
                return Err("Stale speaker update".into());
            }
            e.status = "streaming".into();
            if thinking {
                e.thinking.push_str(delta)
            } else {
                e.content.push_str(delta)
            };
            Ok(())
        })
    }
    fn mutate(
        &self,
        id: &str,
        request: &str,
        f: impl FnOnce(&mut Room) -> Result<(), String>,
    ) -> Result<Room, String> {
        let _lock = STORAGE.lock().map_err(|_| "Room storage unavailable")?;
        let mut room = self.read(id)?;
        if room.active_request_id.as_deref() != Some(request) {
            return Err("Stale conference request".into());
        }
        f(&mut room)?;
        room.updated_at = now();
        self.write(&room)?;
        Ok(room)
    }
    fn system_prompt(&self, p: &Participant) -> Result<String, String> {
        if p.kind == "hermes" {
            return Ok("You are the discussion-only Hermes Personal Agent. Synthesize the preceding speakers, identify agreements, disagreements and practical next steps. You have no tools, live session, private history or ability to execute actions. Never claim to have performed an action. Use only this conference transcript.".into());
        }
        let personas = self.personas()?;
        let matches: Vec<_> = personas.iter().filter(|v| v["id"] == p.id).collect();
        if matches.len() != 1 {
            return Err(format!("Persona {} is missing or duplicated", p.id));
        }
        let prompt = matches[0]["system_prompt"]
            .as_str()
            .filter(|p| !p.trim().is_empty())
            .ok_or_else(|| {
                format!(
                    "Persona {} has no system prompt. Configure it before starting a round.",
                    p.id
                )
            })?;
        Ok(format!("{prompt}\n\nYou are participating in a conference as {}. Respond to the latest user turn using only this room's attributed transcript. No tools, private chats, or external actions are available.",p.name))
    }
}
fn finish(room: &mut Room, status: &str, error: Option<String>) {
    for e in &mut room.transcript {
        if matches!(e.status.as_str(), "pending" | "streaming") {
            e.status = status.into();
            e.error = error.clone();
            e.completed_at = Some(now());
        }
    }
    room.status = status.into();
    room.active_request_id = None;
    room.updated_at = now();
}
pub fn select_speakers(
    participants: &[Participant],
    message: &str,
) -> Result<Vec<Participant>, String> {
    let mut selected = HashSet::new();
    let mut found = false;
    let mut offset = 0;
    while let Some(pos) = message[offset..].find('@') {
        let at = offset + pos;
        offset = at + 1;
        if at > 0
            && message[..at]
                .chars()
                .last()
                .is_some_and(|c| c.is_alphanumeric() || c == '_')
        {
            continue;
        }
        found = true;
        let tail = &message[offset..];
        let explicit = if let Some(rest) = tail.strip_prefix('[') {
            Some((rest, ']'))
        } else {
            tail.strip_prefix('"').map(|rest| (rest, '"'))
        };
        let (candidates, consumed): (Vec<&Participant>, usize) = if let Some((rest, end)) = explicit
        {
            let n = rest.find(end).ok_or("Unclosed participant mention")?;
            let name = &rest[..n];
            (
                participants
                    .iter()
                    .filter(|p| {
                        p.id.eq_ignore_ascii_case(name)
                            || p.name.to_lowercase() == name.to_lowercase()
                    })
                    .collect(),
                n + 2,
            )
        } else {
            let mut matches = Vec::new();
            let mut longest = 0;
            for p in participants {
                for name in [&p.id, &p.name] {
                    if let Some(prefix) = tail.get(..name.len()) {
                        if prefix.to_lowercase() == name.to_lowercase()
                            && tail[name.len()..]
                                .chars()
                                .next()
                                .is_none_or(|c| !c.is_alphanumeric() && c != '_' && c != '-')
                        {
                            if name.len() > longest {
                                longest = name.len();
                                matches.clear();
                            }
                            if name.len() == longest
                                && !matches.iter().any(|q: &&Participant| q.id == p.id)
                            {
                                matches.push(p);
                            }
                        }
                    }
                }
            }
            (matches, longest)
        };
        if candidates.is_empty() {
            return Err("Unknown participant mention. Use a selected @id or @[Full Name].".into());
        }
        if candidates.len() > 1 {
            return Err("Ambiguous mention. Use the participant's unique @id.".into());
        }
        selected.insert(candidates[0].id.clone());
        offset += consumed;
    }
    let mut result: Vec<_> = participants
        .iter()
        .filter(|p| !found || selected.contains(&p.id) || p.kind == "hermes")
        .cloned()
        .collect();
    result.sort_by_key(|p| p.kind == "hermes");
    Ok(result)
}
struct Lease(PathBuf);
impl Drop for Lease {
    fn drop(&mut self) {
        if let Ok(mut map) = runs().lock() {
            map.remove(&self.0);
        }
    }
}
fn cancel_id(scope: &str, request: &str) -> String {
    use sha2::{Digest, Sha256};
    format!(
        "conf-{:x}",
        Sha256::digest(format!("{scope}:{request}").as_bytes())
    )
}
pub fn cancel(scope: &str, request: &str) {
    crate::chat_cancel::cancel(Some(&cancel_id(scope, request)));
}
pub async fn run<F: FnMut(&Room)>(
    store: ConferenceStore,
    scope: &str,
    id: &str,
    message: &str,
    request: &str,
    mut emit: F,
) -> Result<Room, String> {
    let path = store.path(id)?;
    {
        let _lock = STORAGE.lock().map_err(|_| "Room storage unavailable")?;
        let mut map = runs().lock().map_err(|_| "Room registry unavailable")?;
        if map.contains_key(&path) {
            return Err("Room already has an active round".into());
        }
        map.insert(path.clone(), request.into());
    }
    let _lease = Lease(path);
    let mut cancellation = crate::chat_cancel::register(Some(cancel_id(scope, request)))?;
    let mut room = store.begin_round(id, message, request)?;
    emit(&room);
    let indices: Vec<_> = room
        .transcript
        .iter()
        .enumerate()
        .filter(|(_, e)| e.request_id == request && e.kind != "user")
        .map(|(i, _)| i)
        .collect();
    for index in indices {
        let participant = room
            .participants
            .iter()
            .find(|p| p.id == room.transcript[index].speaker_id)
            .unwrap()
            .clone();
        let result=async{
   cancellation.run(async{Ok(())}).await?;
   let system=store.system_prompt(&participant)?;
   let context=serde_json::to_string(&serde_json::json!({"topic":room.topic,"transcript":room.transcript.iter().take(index).filter(|e|e.status!="pending").map(|e|serde_json::json!({"speaker":e.speaker_name,"speaker_id":e.speaker_id,"kind":e.kind,"status":e.status,"content":e.content})).collect::<Vec<_>>()})).map_err(|e|e.to_string())?;
   room=store.append_delta(id,request,index,"",false)?;emit(&room);
   crate::llm::stream_model_chat(&participant.provider,&participant.model,&system,&context,&mut cancellation,|event|{
    match event{
     crate::llm::ChatStreamEvent::Token{delta}=>{room=store.append_delta(id,request,index,&delta,false)?;emit(&room);},
     crate::llm::ChatStreamEvent::Thinking{delta}=>{room=store.append_delta(id,request,index,&delta,true)?;emit(&room);},
     crate::llm::ChatStreamEvent::Error{message}=>return Err(message),
     crate::llm::ChatStreamEvent::Done{..}=>{},
    }Ok(())
   }).await
  }.await;
        if let Err(error) = result {
            let status = if error == "Generation cancelled" {
                "cancelled"
            } else {
                "failed"
            };
            room = store.mutate(id, request, |r| {
                finish(r, status, Some(error));
                Ok(())
            })?;
            emit(&room);
            return Ok(room);
        }
        room = store.mutate(id, request, |r| {
            let e = &mut r.transcript[index];
            e.status = "completed".into();
            e.completed_at = Some(now());
            Ok(())
        })?;
        emit(&room);
    }
    room = store.mutate(id, request, |r| {
        finish(r, "completed", None);
        Ok(())
    })?;
    emit(&room);
    Ok(room)
}
pub fn options() -> serde_json::Value {
    let config = crate::config::load_config();
    let provider = if config.mode == "direct_cloud" {
        &config.cloud_provider
    } else {
        &config.mode
    };
    let model = match config.mode.as_str() {
        "direct_cloud" => config.cloud_model.as_str(),
        "custom_gateway" => config.custom_model.as_str(),
        _ => "",
    };
    serde_json::json!({"provider":provider,"default_model":model,"providers":schema::PROVIDERS.iter().map(|id|serde_json::json!({"id":id,"name":id})).collect::<Vec<_>>()})
}
