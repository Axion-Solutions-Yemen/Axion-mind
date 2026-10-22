/* Versioned manual cloud backup. No credentials or customer data persisted here. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AxionCloudSync=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PREFIX='__axion_backup_v1_';
const encoder=new TextEncoder();
function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
async function sha(text){const data=await globalThis.crypto.subtle.digest('SHA-256',encoder.encode(text));return Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,'0')).join('');}
async function uuid(text){const h=(await sha(text)).slice(0,32).split('');h[12]='8';h[16]=((parseInt(h[16],16)&3)|8).toString(16);const s=h.join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;}
function parse(text){try{return JSON.parse(text.replace(/^\uFEFF/,''));}catch(_){throw new Error('Customer JSON is invalid. No complete backup was created.');}}
function validateSnapshot(snapshot){
 if(!snapshot||snapshot.version!==1||!snapshot.files||Array.isArray(snapshot.files)||typeof snapshot.files!=='object')throw new Error('Unsupported customer snapshot.');
 const names=Object.keys(snapshot.files);if(!names.length||names.length>10000||!names.includes('personas.json'))throw new Error('Snapshot file inventory is incomplete.');
 const aliases=new Map();let total=0;
 for(const rel of names){
  const parts=rel.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||/[\\:*?"<>|\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\.|$)/i.test(p)))throw new Error('Unsafe snapshot path.');
  if(!(rel==='personas.json'||(parts.length===2&&['chats','sessions'].includes(parts[0])&&rel.endsWith('.json'))||(parts.length>=2&&parts[0]==='personas_data')))throw new Error('Snapshot includes a non-customer file.');
  let prefix='';for(const part of parts){prefix+=(prefix?'/':'')+part;const k=prefix.toLowerCase();if(aliases.has(k)&&aliases.get(k)!==prefix)throw new Error('Case-colliding snapshot paths.');aliases.set(k,prefix);}
  const text=snapshot.files[rel];if(typeof text!=='string')throw new Error('Snapshot file is not text.');
  const bytes=encoder.encode(text).length;total+=bytes;if(bytes>4*1024*1024||total>16*1024*1024)throw new Error('Snapshot exceeds backup size limits.');
  if(rel.endsWith('.json'))parse(text);
  for(let i=1;i<parts.length;i++)if(Object.hasOwn(snapshot.files,parts.slice(0,i).join('/')))throw new Error('Conflicting snapshot paths.');
 }
 if(!Array.isArray(parse(snapshot.files['personas.json'])))throw new Error('Persona data must be an array.');
 return snapshot;
}
async function prepare(input,owner){
 if(!owner||typeof owner!=='string')throw new Error('A verified account is required.');
 const snapshot=validateSnapshot(JSON.parse(JSON.stringify(input)));
 const personas=parse(snapshot.files['personas.json']);const personaMap=new Map();
 for(const p of personas){if(!p||typeof p.id!=='string'||!p.id||p.id.startsWith('__axion_')||typeof p.name!=='string'||personaMap.has(p.id))throw new Error('Invalid or duplicate persona identity.');personaMap.set(p.id,p);}
 const sessionOwners=new Map();
 for(const [rel,text] of Object.entries(snapshot.files))if(rel.startsWith('sessions/')){
  const items=parse(text);if(!Array.isArray(items))throw new Error('Session metadata must be an array.');
  for(const meta of items){if(!meta||typeof meta.id!=='string'||typeof meta.agent_id!=='string')throw new Error('Invalid session metadata.');if(sessionOwners.has(meta.id)&&sessionOwners.get(meta.id)!==meta.agent_id)throw new Error('Conflicting session ownership.');sessionOwners.set(meta.id,meta.agent_id);}
 }
 const cards=[],parents=new Map(),chats=[];let frameworks=0,anecdotes=0;
 for(const [rel,text] of Object.entries(snapshot.files)){
  const match=rel.match(/^personas_data\/([^/]+)\/(frameworks|anecdotes)\/(.+\.json)$/);
  if(match){
   const slug=match[1],type=match[2]==='frameworks'?'framework':'anecdote';
   if(slug.startsWith('__axion_'))throw new Error('Reserved knowledge identity.');
   if(!personaMap.has(slug))parents.set(slug,{id:slug,name:slug,system_prompt:'',axion_kind:'knowledge-parent'});
   const parsed=parse(text),items=Array.isArray(parsed)?parsed:[parsed];
   for(let index=0;index<items.length;index++){
    const item=items[index];if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('Invalid knowledge card.');
    cards.push({id:await uuid(owner+'|'+rel+'|'+index),user_id:owner,local_persona_id:slug,card_type:type,title:String(item.title||item.anchor||item.id||match[3]),payload_json:item});
    if(type==='framework')frameworks++;else anecdotes++;
   }
  }
 }
 const known=[...new Set([...personaMap.keys(),...parents.keys()])].sort((a,b)=>b.length-a.length);
 for(const [rel,text] of Object.entries(snapshot.files))if(rel.startsWith('chats/')){
  const stem=rel.slice(6,-5),messages=parse(text);if(!Array.isArray(messages))throw new Error('Chat messages must be an array.');
  const slug=sessionOwners.get(stem)||known.find(s=>stem===s||stem.startsWith(s+'_'))||stem.replace(/_(?:\d+|legacy|original)$/,'');
  if(!slug)throw new Error('Cannot map a chat to its persona.');
  chats.push({user_id:owner,persona_slug:slug,session_id:stem,title:stem,messages_json:messages});
 }
 const manifest=[];for(const rel of Object.keys(snapshot.files).sort())manifest.push({path:rel,bytes:encoder.encode(snapshot.files[rel]).length,sha256:await sha(snapshot.files[rel])});
 return {snapshot,owner,digest:await sha(canonical(snapshot)),manifest,personas,parents:[...parents.values()],cards,chats,counts:{personas:personas.length,chats:chats.length,frameworks,anecdotes,files:manifest.length,knowledgeFiles:Object.keys(snapshot.files).filter(p=>p.startsWith('personas_data/')).length,sessionFiles:Object.keys(snapshot.files).filter(p=>p.startsWith('sessions/')).length}};
}
class CloudError extends Error {constructor(message,code){super(message);this.code=code;}}
function createEngine(options){
 const opts=options||{},base=(opts.baseUrl||'https://kefxeysyvtdxxdupkapa.supabase.co').replace(/\/$/,'');
 const endpoint=new URL(base);
 if(!(base==='https://kefxeysyvtdxxdupkapa.supabase.co'||(opts.allowLocalFixture&&endpoint.protocol==='http:'&&endpoint.hostname==='127.0.0.1')))throw new Error('Refusing to send a session to an unapproved cloud endpoint.');
 let busy=false;const fetcher=opts.fetch||globalThis.fetch;
 const state=(name,extra={})=>{if(opts.onState)opts.onState({state:name,...extra});};
 async function operation(kind,settings,action){
  if(busy)throw new CloudError('A cloud operation is already running.','BUSY');busy=true;
  const controller=new AbortController();const outer=settings?.signal;
  const cancel=()=>controller.abort();if(outer?.aborted)cancel();else outer?.addEventListener('abort',cancel,{once:true});
  let timedOut=false;const overall=setTimeout(()=>{timedOut=true;controller.abort();},opts.overallTimeoutMs||180000);
  let session;
  const ctx={controller,session:null,writes:0,check(){
   if(controller.signal.aborted)throw new CloudError(timedOut?'Cloud operation timed out; partial writes may exist.': 'Cloud operation cancelled; partial writes may exist.',timedOut?'TIMEOUT':'CANCELLED');
   if(session&&opts.ownerNow&&opts.ownerNow()!==session.id)throw new CloudError('Account changed. Cloud operation stopped; no complete backup is claimed.','ACCOUNT_CHANGED');
  }};
  try{
   state('authenticating');ctx.check();session=await opts.getSession();ctx.session=session;ctx.check();
   if(!session?.id||!session?.token)throw new CloudError('Sign in before using cloud backup.','AUTH');
   const user=await request(ctx,'/auth/v1/user');if(user.id!==session.id)throw new CloudError('Verified cloud account does not match this session.','AUTH');
   return await action(ctx,user);
  }catch(error){
   const e=error instanceof CloudError?error:new CloudError('Cloud operation failed. No complete backup was verified.','FAILED');
   if(ctx.writes)e.partialWrites=ctx.writes;state(e.code==='CANCELLED'?'cancelled':ctx.writes?'partial':'failed',{message:e.message,code:e.code,acknowledgedRequests:ctx.writes});throw e;
  }finally{clearTimeout(overall);outer?.removeEventListener('abort',cancel);busy=false;}
 }
 async function pause(ctx,ms){
  ctx.check();await new Promise((resolve,reject)=>{const done=()=>{ctx.controller.signal.removeEventListener('abort',stop);resolve();};const id=setTimeout(done,ms);const stop=()=>{clearTimeout(id);ctx.controller.signal.removeEventListener('abort',stop);reject(new CloudError('Cloud operation cancelled.','CANCELLED'));};ctx.controller.signal.addEventListener('abort',stop,{once:true});});ctx.check();
 }
 async function request(ctx,path,init={},attempt=0){
  ctx.check();const controller=new AbortController();const abort=()=>controller.abort();ctx.controller.signal.addEventListener('abort',abort,{once:true});
  let timeout=false;const timer=setTimeout(()=>{timeout=true;controller.abort();},opts.requestTimeoutMs||20000);
  let response,data;
  try{
   response=await fetcher(base+path,{...init,signal:controller.signal,redirect:'error',headers:{apikey:opts.key,Authorization:'Bearer '+ctx.session.token,'Content-Type':'application/json',...(init.headers||{})}});
   if(response.ok){try{data=await response.json();}catch(_){throw new CloudError('Cloud returned invalid JSON.','FORMAT');}}
  }catch(error){
   ctx.check();if(error instanceof CloudError)throw error;
   throw new CloudError(timeout?'Cloud request timed out. Its write status is unconfirmed; retry safely.':'Cannot reach the cloud. Its write status may be unconfirmed.',timeout?'TIMEOUT':'NETWORK');
  }finally{clearTimeout(timer);ctx.controller.signal.removeEventListener('abort',abort);}
  ctx.check();
  if(!response.ok){
   if((!init.method||init.method==='GET')&&attempt<2&&(response.status===429||response.status>=500)){
    const delay=Math.min(5000,Math.max(100,Number(response.headers.get('Retry-After')||0)*1000||250*(attempt+1)));await pause(ctx,delay);return request(ctx,path,init,attempt+1);
   }
   throw new CloudError(`Cloud ${init.method||'GET'} failed (HTTP ${response.status}). No complete backup was verified.`,'HTTP_'+response.status);
  }
  return data;
 }
 async function rows(ctx,table,filters={},maxRows=Infinity){
  const result=[];let offset=0;
  for(let page=0;page<10000;page++){
   const q=new URLSearchParams({select:'*',user_id:'eq.'+ctx.session.id,order:'id.asc',limit:String(Math.min(opts.pageSize||200,maxRows-result.length)),offset:String(offset),...filters});
   const batch=await request(ctx,'/rest/v1/'+table+'?'+q);if(!Array.isArray(batch))throw new CloudError('Cloud table response is invalid.','FORMAT');
   if(batch.some(r=>r.user_id!==ctx.session.id))throw new CloudError('Cloud returned another account\'s records.','OWNERSHIP');
   if(!batch.length)return result;result.push(...batch);if(result.length>=maxRows)return result;offset+=batch.length;
  }
  throw new CloudError('Cloud pagination exceeded safety limits.','LIMIT');
 }
 async function write(ctx,table,records,conflict){
  if(!records.length)return [];
  const data=await request(ctx,'/rest/v1/'+table+'?on_conflict='+encodeURIComponent(conflict),{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(records)});
  ctx.writes++;if(!Array.isArray(data)||data.length!==records.length||data.some(r=>r.user_id!==ctx.session.id))throw new CloudError('Cloud did not acknowledge every owned record.','ACK');return data;
 }
 function requireMatch(expected,actual,key,fields){
  const map=new Map(actual.map(r=>[r[key],r]));
  for(const item of expected){const found=map.get(item[key]);if(!found||fields.some(k=>canonical(found[k])!==canonical(item[k])))throw new CloudError('Cloud readback differs from the customer snapshot.','MISMATCH');}
 }
 async function verifiedEnvelope(ctx,row){
  const e=row?.config_json?.axion_backup;
  if(!e||e.version!==1||e.owner!==ctx.session.id||row.user_id!==ctx.session.id||row.is_public!==false||row.slug!==PREFIX+e.digest)throw new CloudError('Cloud backup has invalid ownership or format.','SNAPSHOT');
  let plan;try{plan=await prepare(e.snapshot,e.owner);}catch(_){throw new CloudError('Cloud backup snapshot is invalid.','SNAPSHOT');}
  if(plan.digest!==e.digest||canonical(plan.manifest)!==canonical(e.manifest)||canonical(plan.counts)!==canonical(e.counts))throw new CloudError('Cloud backup integrity check failed.','INTEGRITY');
  return e;
 }
 return {
  async backup(snapshot,settings={}){return operation('backup',settings,async(ctx,user)=>{
   state('exporting');const plan=await prepare(snapshot,ctx.session.id);ctx.check();
   if(opts.confirmPlan&&!(await opts.confirmPlan(plan,user,settings)))throw new CloudError('Backup cancelled before upload.','CANCELLED');ctx.check();
   state('uploading',{counts:plan.counts});const now=new Date().toISOString();
   const expectedPersonas=[...plan.personas,...plan.parents].map(p=>({user_id:ctx.session.id,slug:p.id,name:p.name,description:p.description||p.title||'',system_prompt:p.system_prompt||'',config_json:p,is_public:false,updated_at:now}));
   const returned=await write(ctx,'cloud_personas',expectedPersonas,'user_id,slug');const parents=new Map(returned.map(r=>[r.slug,r.id]));
   const cards=plan.cards.map(({local_persona_id,...card})=>{const persona_id=parents.get(local_persona_id);if(!persona_id)throw new CloudError('Knowledge parent was not acknowledged.','PARENT');return {...card,persona_id,updated_at:now};});
   await write(ctx,'knowledge_cards',cards,'id');
   const chats=plan.chats.map(c=>({...c,updated_at:now}));await write(ctx,'chat_conversations',chats,'user_id,session_id');
   state('verifying',{counts:plan.counts});
   const personaReadback=[];for(const persona of expectedPersonas)personaReadback.push(...await rows(ctx,'cloud_personas',{slug:'eq.'+persona.slug},1));
   requireMatch(expectedPersonas,personaReadback,'slug',['user_id','config_json','is_public']);
   requireMatch(cards,await rows(ctx,'knowledge_cards'),'id',['user_id','persona_id','card_type','payload_json']);
   requireMatch(chats,await rows(ctx,'chat_conversations'),'session_id',['user_id','persona_slug','messages_json']);
   const slug=PREFIX+plan.digest;const previous=await rows(ctx,'cloud_personas',{slug:'eq.'+slug});
   let envelope={version:1,owner:ctx.session.id,digest:plan.digest,manifest:plan.manifest,counts:plan.counts,snapshot:plan.snapshot,created_at:now};
   if(previous.length){if(previous.length!==1)throw new CloudError('Duplicate cloud backup identity.','INTEGRITY');envelope=await verifiedEnvelope(ctx,previous[0]);}
   await write(ctx,'cloud_personas',[{user_id:ctx.session.id,slug,name:'Axion Mind verified backup',description:'Private versioned customer snapshot; not a chat persona.',system_prompt:'',is_public:false,config_json:{axion_kind:'complete-backup-v1',axion_backup:envelope},updated_at:now}],'user_id,slug');
   const published=await rows(ctx,'cloud_personas',{slug:'eq.'+slug});if(published.length!==1)throw new CloudError('Published backup readback is missing.','INTEGRITY');await verifiedEnvelope(ctx,published[0]);
   if(opts.snapshotNow){const current=await opts.snapshotNow();ctx.check();if(canonical(current)!==canonical(plan.snapshot))throw new CloudError('Snapshot was backed up, but local files changed during sync. Run backup again for your latest edits.','LOCAL_CHANGED');}
   ctx.check();
   const result={status:'complete',owner:ctx.session.id,email:user.email,digest:plan.digest,counts:plan.counts,verified_at:new Date().toISOString()};state('complete',result);return result;
  });},
  async download(settings={}){return operation('download',settings,async ctx=>{
   state('downloading');const filter=settings.digest?'eq.'+PREFIX+settings.digest:'like.'+PREFIX+'*';
   if(settings.digest&&!/^[a-f0-9]{64}$/.test(settings.digest))throw new CloudError('Invalid backup identifier.','SNAPSHOT');
   const list=await rows(ctx,'cloud_personas',{slug:filter,order:'updated_at.desc,id.asc'},1);
   if(!list.length)throw new CloudError('No complete cloud backup exists for this account yet.','NOT_FOUND');
   state('verifying');const envelope=await verifiedEnvelope(ctx,list[0]);ctx.check();state('complete',{digest:envelope.digest,counts:envelope.counts});return envelope;
  });},
  isBusy(){return busy;}
 };
}
function createController(opts){
 let pending=false,abort=null;
 const status=(message,kind='info')=>opts.onStatus?.(message,kind);
 async function run(recovery,settings={}){
  if(pending)return null;pending=true;abort=new AbortController();opts.onBusy?.(true);
  try{
   if(recovery){
    status('Downloading and verifying the latest complete cloud backup...');
    const envelope=await opts.engine.download({signal:abort.signal});
    if(abort.signal.aborted)throw new CloudError('Recovery cancelled before writing local files.','CANCELLED');
    if(opts.confirmRecovery&&!(await opts.confirmRecovery(envelope)))throw new CloudError('Recovery cancelled.','CANCELLED');
    const recovered=await opts.invoke('recover_cloud_snapshot',{snapshot:envelope.snapshot,expectedOwner:envelope.owner});
    status(`Recovered and verified ${envelope.counts.files} files to: ${recovered.path}. Your active data was not overwritten. Select this folder in Settings to use the recovery.`,'success');
    return {status:'recovered',path:recovered.path,digest:envelope.digest};
   }
   status('Exporting customer files for a complete backup...');const snapshot=settings.automatic&&settings.snapshot?settings.snapshot:await opts.invoke('export_cloud_snapshot');
   if(abort.signal.aborted)throw new CloudError('Backup cancelled before upload.','CANCELLED');
   const result=await opts.engine.backup(snapshot,{...settings,signal:abort.signal});
   if(result.status!=='complete')throw new CloudError('Cloud backup did not finish verification.','INCOMPLETE');
   const c=result.counts;status(`Cloud backup verified: ${c.personas} personas, ${c.frameworks} frameworks, ${c.anecdotes} anecdotes, ${c.chats} chats; ${c.files} files preserved including session metadata and supporting knowledge files. Automatic multi-device sync is not enabled.`,'success');
   if(opts.onVerified)await opts.onVerified(result,settings);return result;
  }catch(error){status((error?.partialWrites?'Partial upload. ':'')+(error?.message||String(error)||'Cloud operation failed.'),'error');return {status:'failed',code:error?.code||'FAILED'};}
  finally{pending=false;abort=null;opts.onBusy?.(false);}
 }
 return {start:(settings={})=>run(false,settings),recover:()=>run(true),cancel(){abort?.abort();},isBusy:()=>pending};
}
return {prepare,canonical,sha,validateSnapshot,PREFIX,createEngine,createController,CloudError};
});
