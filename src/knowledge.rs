//! One local authority for reviewed knowledge, sharing consent, and deletion receipts.
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
pub struct Store { db: Connection }
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Fact { pub id:i64, pub key:String, pub lineage:String, pub scope:String, pub fact:String, pub source:String, pub state:String }
fn valid(v:&str,n:usize)->bool{!v.trim().is_empty()&&v.len()<=n&&!v.contains('\0')}
fn key()->String{format!("{:032x}",rand::random::<u128>())}
fn err(e:rusqlite::Error)->String{e.to_string()}
const SELECT:&str="SELECT id,record_key,lineage,scope,fact,source,state FROM facts";
fn row(r:&rusqlite::Row<'_>)->rusqlite::Result<Fact>{Ok(Fact{id:r.get(0)?,key:r.get(1)?,lineage:r.get(2)?,scope:r.get(3)?,fact:r.get(4)?,source:r.get(5)?,state:r.get(6)?})}
impl Store {
 pub fn memory()->Result<Self,String>{Self::init(Connection::open_in_memory().map_err(err)?)}
 pub fn open(path:&std::path::Path)->Result<Self,String>{Self::init(Connection::open(path).map_err(err)?)}
 fn init(mut db:Connection)->Result<Self,String>{
  db.busy_timeout(std::time::Duration::from_secs(5)).map_err(err)?;
  db.execute_batch("PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE; CREATE TABLE IF NOT EXISTS facts(id INTEGER PRIMARY KEY,owner TEXT NOT NULL,scope TEXT NOT NULL,fact TEXT NOT NULL,source TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','approved','superseded','deleted')));").map_err(err)?;
  let columns=db.prepare("PRAGMA table_info(facts)").map_err(err)?.query_map([],|r|r.get::<_,String>(1)).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
  let tx=db.transaction().map_err(err)?;
  if !columns.iter().any(|c|c=="record_key") {tx.execute_batch("ALTER TABLE facts ADD COLUMN record_key TEXT NOT NULL DEFAULT ''; ALTER TABLE facts ADD COLUMN lineage TEXT NOT NULL DEFAULT ''; UPDATE facts SET record_key=lower(hex(randomblob(16))); UPDATE facts SET lineage=record_key; UPDATE facts SET fact='',source='' WHERE state IN ('deleted','superseded');").map_err(err)?;}
  tx.execute_batch("CREATE UNIQUE INDEX IF NOT EXISTS fact_key ON facts(record_key);
   CREATE TABLE IF NOT EXISTS tombstones(owner TEXT NOT NULL,target TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('record','lineage')),PRIMARY KEY(owner,target,kind));
   INSERT OR IGNORE INTO tombstones SELECT owner,record_key,'record' FROM facts WHERE state IN ('deleted','superseded');
   CREATE TABLE IF NOT EXISTS egress(owner TEXT,provider TEXT,PRIMARY KEY(owner,provider));
   CREATE TABLE IF NOT EXISTS grants(owner TEXT,scope TEXT,consultant TEXT,provider TEXT,PRIMARY KEY(owner,scope,consultant,provider));
   CREATE TABLE IF NOT EXISTS revisions(owner TEXT PRIMARY KEY,version INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS context_floor(owner TEXT,session TEXT,version INTEGER,start INTEGER,scope TEXT,PRIMARY KEY(owner,session));
   CREATE TABLE IF NOT EXISTS preferences(owner TEXT,name TEXT,value TEXT,PRIMARY KEY(owner,name));").map_err(err)?;
  tx.commit().map_err(err)?;Ok(Self{db})
 }
 fn bump(db:&Connection,owner:&str)->Result<(),String>{db.execute("INSERT INTO revisions VALUES(?1,1) ON CONFLICT(owner) DO UPDATE SET version=version+1",[owner]).map_err(err)?;Ok(())}
 pub fn propose(&mut self,owner:&str,scope:&str,fact:&str,source:&str)->Result<i64,String>{
  if !valid(owner,256)||!valid(scope,128)||!valid(fact,12000)||!valid(source,2048){return Err("Missing or oversized memory field".into());}
  let k=key();self.db.execute("INSERT INTO facts(owner,scope,fact,source,state,record_key,lineage) VALUES(?1,?2,?3,?4,'pending',?5,?5)",params![owner,scope,fact,source,k]).map_err(err)?;Ok(self.db.last_insert_rowid())
 }
 pub fn approve(&mut self,owner:&str,id:i64)->Result<(),String>{
  let tx=self.db.transaction().map_err(err)?;
  if tx.execute("UPDATE facts SET state='approved' WHERE id=?1 AND owner=?2 AND state='pending'",params![id,owner]).map_err(err)?!=1{return Err("Memory not pending or not owned".into());}
  Self::bump(&tx,owner)?;tx.commit().map_err(err)
 }
 pub fn inspect(&self,owner:&str,scope:&str)->Result<Vec<Fact>,String>{
  let mut s=self.db.prepare(&format!("{SELECT} WHERE owner=?1 AND scope=?2 AND state IN ('pending','approved') ORDER BY id")).map_err(err)?;
  let rows=s.query_map(params![owner,scope],row).map_err(err)?;rows.collect::<Result<Vec<_>,_>>().map_err(err)
 }
 pub fn retrieve(&self,owner:&str,scope:&str)->Result<Vec<Fact>,String>{Ok(self.inspect(owner,scope)?.into_iter().filter(|f|f.state=="approved").collect())}
 pub fn correct(&mut self,owner:&str,id:i64,fact:&str,source:&str)->Result<i64,String>{
  if !valid(fact,12000)||!valid(source,2048){return Err("Invalid correction".into());}
  let tx=self.db.transaction().map_err(err)?;
  let old=tx.query_row(&format!("{SELECT} WHERE id=?1 AND owner=?2 AND state='approved'"),params![id,owner],row).map_err(|_|"Memory not approved or not owned")?;
  tx.execute("INSERT OR IGNORE INTO tombstones VALUES(?1,?2,'record')",params![owner,old.key]).map_err(err)?;
  tx.execute("UPDATE facts SET state='superseded',fact='',source='' WHERE id=?1",[id]).map_err(err)?;
  tx.execute("INSERT INTO facts(owner,scope,fact,source,state,record_key,lineage) VALUES(?1,?2,?3,?4,'approved',?5,?6)",params![owner,old.scope,fact,source,key(),old.lineage]).map_err(err)?;
  let id=tx.last_insert_rowid();Self::bump(&tx,owner)?;tx.commit().map_err(err)?;Ok(id)
 }
 pub fn forget(&mut self,owner:&str,id:i64)->Result<(),String>{
  let tx=self.db.transaction().map_err(err)?;
  let lineage:String=tx.query_row("SELECT lineage FROM facts WHERE id=?1 AND owner=?2",params![id,owner],|r|r.get(0)).map_err(|_|"Memory not owned or missing")?;
  tx.execute("INSERT OR IGNORE INTO tombstones VALUES(?1,?2,'lineage')",params![owner,lineage]).map_err(err)?;
  tx.execute("UPDATE facts SET state='deleted',fact='',source='' WHERE owner=?1 AND lineage=?2",params![owner,lineage]).map_err(err)?;
  Self::bump(&tx,owner)?;tx.commit().map_err(err)
 }
 pub fn allow_provider(&mut self,owner:&str,provider:&str,allowed:bool)->Result<(),String>{
  if !valid(provider,2048){return Err("Invalid provider disclosure".into());}let tx=self.db.transaction().map_err(err)?;
  if allowed {tx.execute("INSERT OR IGNORE INTO egress VALUES(?1,?2)",params![owner,provider]).map_err(err)?;}
  else {tx.execute("DELETE FROM egress WHERE owner=?1 AND provider=?2",params![owner,provider]).map_err(err)?;tx.execute("DELETE FROM grants WHERE owner=?1 AND provider=?2",params![owner,provider]).map_err(err)?;}
  Self::bump(&tx,owner)?;tx.commit().map_err(err)
 }
 pub fn provider_allowed(&self,owner:&str,provider:&str)->Result<bool,String>{self.db.query_row("SELECT EXISTS(SELECT 1 FROM egress WHERE owner=?1 AND provider=?2)",params![owner,provider],|r|r.get(0)).map_err(err)}
 pub fn share(&mut self,owner:&str,scope:&str,consultant:&str,provider:&str,allowed:bool)->Result<(),String>{
  if !valid(scope,128)||!valid(consultant,128){return Err("Invalid sharing scope".into());}
  if allowed&&!self.provider_allowed(owner,provider)?{return Err("Review provider disclosure before sharing".into());}
  let tx=self.db.transaction().map_err(err)?;
  if allowed {tx.execute("INSERT OR IGNORE INTO grants VALUES(?1,?2,?3,?4)",params![owner,scope,consultant,provider]).map_err(err)?;}
  else {tx.execute("DELETE FROM grants WHERE owner=?1 AND scope=?2 AND consultant=?3 AND provider=?4",params![owner,scope,consultant,provider]).map_err(err)?;}
  Self::bump(&tx,owner)?;tx.commit().map_err(err)
 }
 pub fn shared(&self,owner:&str,scope:&str,consultant:&str,provider:&str)->Result<bool,String>{
  if !self.provider_allowed(owner,provider)?{return Ok(false);}
  self.db.query_row("SELECT EXISTS(SELECT 1 FROM grants WHERE owner=?1 AND scope=?2 AND consultant=?3 AND provider=?4)",params![owner,scope,consultant,provider],|r|r.get(0)).map_err(err)
 }
 pub fn context(&self,owner:&str,scope:&str,consultant:&str,provider:&str,budget:usize)->Result<Vec<Fact>,String>{
  if !self.shared(owner,scope,consultant,provider)?{return Ok(vec![]);}let mut used=2;let mut out=vec![];
  for fact in self.retrieve(owner,scope)? {let n=serde_json::to_vec(&fact).map_err(|e|e.to_string())?.len()+1;if used+n<=budget{used+=n;out.push(fact);}}Ok(out)
 }
 /// Mutations and scope changes invalidate all prior derived transcript context.
 pub fn history_floor(&mut self,owner:&str,session:&str,scope:&str,len:usize)->Result<usize,String>{
  let version:i64=self.db.query_row("SELECT version FROM revisions WHERE owner=?1",[owner],|r|r.get(0)).optional().map_err(err)?.unwrap_or(0);
  let previous:Option<(i64,usize,String)>=self.db.query_row("SELECT version,start,scope FROM context_floor WHERE owner=?1 AND session=?2",params![owner,session],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(err)?;
  let start=match previous{Some((v,n,s)) if v==version&&s==scope=>n.min(len),_=>len};
  self.db.execute("INSERT INTO context_floor VALUES(?1,?2,?3,?4,?5) ON CONFLICT(owner,session) DO UPDATE SET version=excluded.version,start=excluded.start,scope=excluded.scope",params![owner,session,version,start,scope]).map_err(err)?;Ok(start)
 }
 pub fn preference(&self,owner:&str,name:&str)->Result<Option<String>,String>{self.db.query_row("SELECT value FROM preferences WHERE owner=?1 AND name=?2",params![owner,name],|r|r.get(0)).optional().map_err(err)}
 pub fn set_preference(&mut self,owner:&str,name:&str,value:&str)->Result<(),String>{self.db.execute("INSERT INTO preferences VALUES(?1,?2,?3) ON CONFLICT(owner,name) DO UPDATE SET value=excluded.value",params![owner,name,value]).map_err(err)?;Ok(())}
 pub fn snapshot(&self,owner:&str)->Result<Value,String>{
  let mut s=self.db.prepare(&format!("{SELECT} WHERE owner=?1 AND state IN ('pending','approved') ORDER BY record_key")).map_err(err)?;
  let facts=s.query_map([owner],row).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
  let mut s=self.db.prepare("SELECT target,kind FROM tombstones WHERE owner=?1 ORDER BY target,kind").map_err(err)?;
  let deleted=s.query_map([owner],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
  let data=json!({"version":2,"owner":owner,"facts":facts,"tombstones":deleted});
  Ok(json!({"sha256":format!("{:x}",Sha256::digest(serde_json::to_vec(&data).unwrap())),"data":data}))
 }
 /// Merge, never overwrite: local tombstones/corrections win. Consents are not restored.
 pub fn restore(&mut self,owner:&str,snapshot:&Value)->Result<(),String>{
  let data=&snapshot["data"];
  if data["version"]!=2||data["owner"]!=owner||snapshot["sha256"]!=format!("{:x}",Sha256::digest(serde_json::to_vec(data).map_err(|e|e.to_string())?)){return Err("Foreign, obsolete or corrupt knowledge snapshot".into());}
  let facts:Vec<Fact>=serde_json::from_value(data["facts"].clone()).map_err(|_|"Invalid snapshot facts")?;
  let deleted:Vec<(String,String)>=serde_json::from_value(data["tombstones"].clone()).map_err(|_|"Invalid deletion receipts")?;
  if facts.len()>10000||deleted.len()>50000{return Err("Snapshot exceeds record limit".into());}
  for f in &facts {if !valid(&f.key,64)||!valid(&f.lineage,64)||!valid(&f.scope,128)||!valid(&f.fact,12000)||!valid(&f.source,2048)||!matches!(f.state.as_str(),"pending"|"approved"){return Err("Invalid snapshot record".into());}}
  if deleted.iter().any(|(t,k)|!valid(t,64)||!matches!(k.as_str(),"record"|"lineage")){return Err("Invalid tombstone".into());}
  let tx=self.db.transaction().map_err(err)?;
  for (t,k) in deleted {tx.execute("INSERT OR IGNORE INTO tombstones VALUES(?1,?2,?3)",params![owner,t,k]).map_err(err)?;}
  for f in facts {
   let exists:Option<(String,String,String)>=tx.query_row("SELECT owner,fact,state FROM facts WHERE record_key=?1",[&f.key],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(err)?;
   if let Some((o,text,state))=exists{if o!=owner||(matches!(state.as_str(),"pending"|"approved")&&text!=f.fact){return Err("Conflicting knowledge identity".into());}continue;}
   tx.execute("INSERT INTO facts(owner,scope,fact,source,state,record_key,lineage) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![owner,f.scope,f.fact,f.source,f.state,f.key,f.lineage]).map_err(err)?;
  }
  tx.execute("UPDATE facts SET state='deleted',fact='',source='' WHERE owner=?1 AND EXISTS(SELECT 1 FROM tombstones t WHERE t.owner=facts.owner AND ((t.kind='record' AND t.target=facts.record_key) OR (t.kind='lineage' AND t.target=facts.lineage)))",[owner]).map_err(err)?;
  tx.execute("DELETE FROM grants WHERE owner=?1",[owner]).map_err(err)?;tx.execute("DELETE FROM egress WHERE owner=?1",[owner]).map_err(err)?;
  Self::bump(&tx,owner)?;tx.commit().map_err(err)
 }
}
