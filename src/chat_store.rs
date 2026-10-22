use std::{fs, io::{Read, Write}, path::Path, sync::Mutex};
use serde_json::{Value,json};
static TURN_LOCK:Mutex<()>=Mutex::new(());
fn read_array(path:&Path)->Result<Vec<Value>,String>{
    let mut file=match fs::File::open(path){Ok(f)=>f,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(Vec::new()),Err(e)=>return Err(e.to_string())};
    let mut bytes=Vec::new();file.read_to_end(&mut bytes).map_err(|e|e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|_|"Existing chat or index is invalid; refusing to overwrite it.".into())
}
fn atomic_json(path:&Path,values:&[Value])->Result<(),String>{
    let parent=path.parent().ok_or("Invalid storage path")?;fs::create_dir_all(parent).map_err(|e|e.to_string())?;
    let temp=parent.join(format!(".axion-turn-{}.tmp",rand::random::<u128>()));
    let result=(||{let mut f=fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e|e.to_string())?;
        f.write_all(&serde_json::to_vec_pretty(values).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;f.sync_all().map_err(|e|e.to_string())?;drop(f);
        fs::rename(&temp,path).map_err(|e|e.to_string())})();
    if result.is_err(){let _=fs::remove_file(temp);}result
}
pub fn append_turn(root:&Path,session:&str,request:&str,user:&str,answer:&str,model:Option<&str>)->Result<(),String>{
    if session.is_empty()||session.len()>256||session.chars().any(|c|c.is_control()||"/\\:<>\"|?*".contains(c))||session=="."||session==".."||session.ends_with(['.',' '])||request.is_empty()||request.len()>128{return Err("Invalid chat identity".into());}
    let _lock=TURN_LOCK.lock().map_err(|_|"Chat storage unavailable")?;
    let path=root.join("chats").join(format!("{}.json",session));let mut messages=read_array(&path)?;
    let prior:Vec<_>=messages.iter().filter(|m|m["request_id"].as_str()==Some(request)).collect();
    if !prior.is_empty() && !(prior.len()==2 && prior[0]["role"]=="user" && prior[0]["content"]==user && prior[1]["role"]=="assistant" && prior[1]["content"]==answer){return Err("Request receipt conflicts with existing messages".into());}
    if prior.is_empty(){let time=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_secs_f64();
        messages.push(json!({"role":"user","content":user,"timestamp":time,"model":null,"request_id":request}));
        messages.push(json!({"role":"assistant","content":answer,"timestamp":time,"model":model,"request_id":request}));
        atomic_json(&path,&messages)?;
    }
    let agent=session.split('_').next().ok_or("Invalid chat identity")?;
    let meta_path=root.join("sessions").join(format!("{}.json",agent));let mut sessions=read_array(&meta_path)?;
    if let Some(meta)=sessions.iter_mut().find(|s|s["id"].as_str()==Some(session)){
        meta["message_count"]=json!(messages.len());meta["last_activity_at"]=json!(chrono::Utc::now().timestamp().to_string());atomic_json(&meta_path,&sessions)?;
    }
    Ok(())
}
