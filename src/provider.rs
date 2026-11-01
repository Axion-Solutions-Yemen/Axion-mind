use crate::config::AppConfig;
use serde::Serialize;
#[derive(Clone,Serialize)]
pub struct Destination {pub endpoint:String,pub model:String,pub disclosure:String,pub key:String,#[serde(skip)]pub token:String}
pub fn endpoint(value:&str)->Result<reqwest::Url,String>{
 let u=reqwest::Url::parse(value).map_err(|_|"Configure a provider endpoint in Settings")?;
 let local=matches!(u.host_str(),Some("127.0.0.1"|"localhost"|"[::1]"));
 if !(u.scheme()=="https"||(local&&u.scheme()=="http"))||!u.username().is_empty()||u.password().is_some()||u.query().is_some()||u.fragment().is_some(){return Err("Provider endpoint requires HTTPS or loopback HTTP, without credentials/query/fragment".into());}Ok(u)
}
pub fn resolve(c:&AppConfig)->Result<Destination,String>{
 let (url,model,token)=match c.mode.as_str(){
  "direct_cloud"=>{let url=match c.cloud_provider.as_str(){"openai"=>"https://api.openai.com/v1/chat/completions","openrouter"=>"https://openrouter.ai/api/v1/chat/completions","groq"=>"https://api.groq.com/openai/v1/chat/completions","gemini"=>"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",_=>return Err("Unsupported provider; no automatic fallback".into())};(url.to_string(),c.cloud_model.clone(),c.cloud_api_key.clone())},
  "custom_gateway"=>(c.custom_url.clone(),c.custom_model.clone(),c.custom_auth_token.clone()),
  "hermes_local"=>return Err("Consultants require an explicitly configured direct provider or gateway. Runtime session support is checked separately.".into()),
  _=>return Err("Unsupported connection mode".into())
 };
 let url=endpoint(url.trim())?.to_string();if model.trim().is_empty()||model.len()>256{return Err("Select an explicit provider model".into());}
 let model=model.trim().to_string();let key=format!("{url}|{model}|disclosure-v1");
 Ok(Destination{disclosure:format!("Messages, selected conversation history, consultant instructions and explicitly shared knowledge leave this device for {url} using {model}. A gateway may forward them to another processor; its operator must disclose that processor. Retention is controlled by that provider. Revocation stops future sends; it cannot recall earlier transmissions."),endpoint:url,model,key,token})
}
