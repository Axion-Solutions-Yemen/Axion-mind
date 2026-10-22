const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = () => require('./ui-source.cjs')();

test('actual sync handler settles without the original delayed sb exception', async()=>{
  const source=html();
  // Before extraction this executes the production inline handler, not a copy.
  if(source.includes('window.AxionCloudSync.createController')) {
    assert.doesNotMatch(source,/textContent\s*=\s*sb\s*&&/);
    return;
  }
  const block=source.match(/btnForceCloudSyncEl.onclick = async \(\) => \{([\s\S]*?)\n    \};/);
  assert.ok(block,'Production sync handler not found');
  const timers=[];
  const context={authFeedbackEl:{style:{}},invoke:async()=>({personas:[],chats:{}}),
    document:{getElementById:()=>({value:''})},cloudAccountSession:{id:'user-a',token:'not-a-real-token'},
    fetch:async()=>new Response('{}',{status:201}),localStorage:{setItem(){}},setTimeout:fn=>timers.push(fn)};
  await vm.runInNewContext('(async()=>{'+block[1]+'})()',context);
  for(const timer of timers)assert.doesNotThrow(timer,'Result callback must not leave progress stuck');
});

function sample(){return {version:1,files:{
 'personas.json':JSON.stringify([{id:'expert_with_under',name:'Expert',system_prompt:'Keep exact numbers.'}]),
 'chats/expert_with_under_1.json':JSON.stringify([{role:'user',content:'Deal price: $1,234,567.89'}]),
 'sessions/expert_with_under.json':JSON.stringify([{id:'expert_with_under_1',agent_id:'expert_with_under'}]),
 'personas_data/expert_with_under/frameworks/f.json':'{"id":"framework-one","title":"Framework","value":1234567.89}',
 'personas_data/expert_with_under/anecdotes/a.json':'{"id":"anecdote-one","anchor":"صفقة","purchase_price":"$1,234,567.89"}',
 'personas_data/other_expert/style_dna.json':'{ "voice": "خاص" }\r\n'
}};}

test('snapshot plan covers distinct cards, supporting files, exact values, and underscored persona IDs',async()=>{
 const {prepare}=require('../ui/cloud-sync.js');const p=await prepare(sample(),'user-a');
 assert.equal(p.counts.personas,1);assert.equal(p.counts.chats,1);assert.equal(p.counts.frameworks,1);assert.equal(p.counts.anecdotes,1);assert.equal(p.counts.files,6);
 assert.deepEqual(p.cards.map(c=>c.card_type).sort(),['anecdote','framework']);
 assert.equal(p.cards.find(c=>c.card_type==='framework').payload_json.value,1234567.89);
 assert.equal(p.chats[0].persona_slug,'expert_with_under');assert.equal(p.snapshot.files['personas_data/other_expert/style_dna.json'],sample().files['personas_data/other_expert/style_dna.json']);
 assert.match(p.digest,/^[a-f0-9]{64}$/);assert.equal((await prepare(sample(),'user-a')).digest,p.digest);
});

const http=require('node:http');
const {randomUUID}=require('node:crypto');
async function fixture(t,options={}){
 const rows={cloud_personas:[],knowledge_cards:[],chat_conversations:[]};const requests=[];let fault=null;
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');requests.push({method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams)});
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  if(url.pathname==='/auth/v1/user')return send(200,{id:'user-a',email:'a@example.test'});
  const table=url.pathname.split('/').pop();if(!rows[table])return send(404,{});
  if(fault&&fault.table===table&&(!fault.method||fault.method===req.method)){const f=fault;if(f.once)fault=null;if(f.delay)await new Promise(r=>setTimeout(r,f.delay));if(f.status)return send(f.status,{message:'sensitive backend body must not be displayed'});}
  if(req.method==='POST'){
   let text='';for await(const part of req)text+=part;const data=JSON.parse(text);const list=Array.isArray(data)?data:[data];
   const conflict=(url.searchParams.get('on_conflict')||'id').split(',');const written=[];
   for(const row of list){if(row.user_id!=='user-a')return send(403,{});
    if(table==='knowledge_cards'&&!rows.cloud_personas.some(p=>p.id===row.persona_id&&p.user_id===row.user_id))return send(403,{});
    let current=rows[table].find(x=>conflict.every(k=>x[k]!==undefined&&x[k]===row[k]));
    if(current)Object.assign(current,row);else{current={id:randomUUID(),...row};rows[table].push(current);}written.push(current);
   }
   return send(201,written);
  }
  if(req.method==='GET'){
   let output=rows[table].filter(r=>r.user_id==='user-a');
   for(const [k,v] of url.searchParams){if(v.startsWith('eq.'))output=output.filter(r=>String(r[k])===v.slice(3));if(v.startsWith('like.'))output=output.filter(r=>String(r[k]).startsWith(v.slice(5).replace(/\*$/,'')));}
   if(url.searchParams.get('order')?.startsWith('updated_at.desc'))output=output.slice().sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
   const start=Number(url.searchParams.get('offset')||0),limit=Math.min(Number(url.searchParams.get('limit')||500),options.pageLimit||500);
   return send(200,output.slice(start,start+limit));
  }
  send(405,{});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});
 const baseUrl='http://127.0.0.1:'+server.address().port;
 const create=(extra={})=>require('../ui/cloud-sync.js').createEngine({baseUrl,allowLocalFixture:true,key:'public-fixture',getSession:async()=>({id:'user-a',email:'a@example.test',token:'fixture-not-real'}),ownerNow:()=> 'user-a',...extra});
 return {rows,requests,create,setFault:f=>fault=f};
}

test('real HTTP fixture: complete backup verifies cards and immutable snapshot and survives cloud-only download',async t=>{
 const f=await fixture(t);const states=[];const engine=f.create({onState:s=>states.push(s.state)});
 const result=await engine.backup(sample());assert.equal(result.status,'complete');assert.equal(result.counts.frameworks,1);assert.equal(result.counts.anecdotes,1);
 assert.equal(f.rows.knowledge_cards.length,2);assert.ok(f.rows.cloud_personas.every(p=>p.is_public===false));
 const recovered=await engine.download();assert.deepEqual(recovered.snapshot,sample());assert.equal(recovered.digest,result.digest);
 const counts=Object.fromEntries(Object.entries(f.rows).map(([k,v])=>[k,v.length]));await engine.backup(sample());assert.deepEqual(Object.fromEntries(Object.entries(f.rows).map(([k,v])=>[k,v.length])),counts);
 assert.ok(states.includes('verifying'));assert.equal(states.at(-1),'complete');
});

for(const status of [400,401,403,409,413,429,500])test(`HTTP ${status} cannot publish a complete backup or expose raw backend content`,async t=>{
 const f=await fixture(t);const states=[];f.setFault({table:'knowledge_cards',method:'POST',status});
 await assert.rejects(f.create({onState:s=>states.push(s)}).backup(sample()),e=>e.code==='HTTP_'+status&&!e.message.includes('sensitive'));
 assert.equal(f.rows.cloud_personas.filter(p=>p.slug.startsWith('__axion_backup')).length,0);assert.equal(states.at(-1).state,'partial');
});

test('pagination exhausts server pages even if server page cap is smaller than requested',async t=>{
 const f=await fixture(t,{pageLimit:1});const engine=f.create({pageSize:20});await engine.backup(sample());assert.deepEqual((await engine.download()).snapshot,sample());
 assert.ok(f.requests.filter(r=>r.method==='GET'&&r.path.endsWith('knowledge_cards')).length>=3);
});
test('tampered cloud snapshot fails integrity validation',async t=>{
 const f=await fixture(t);const engine=f.create();await engine.backup(sample());const row=f.rows.cloud_personas.find(p=>p.slug.startsWith('__axion_backup'));
 row.config_json.axion_backup.snapshot.files['personas_data/other_expert/style_dna.json']='{}';
 await assert.rejects(engine.download(),e=>e.code==='INTEGRITY');
});
test('mid-operation account change stops writes and cannot claim complete',async t=>{
 const f=await fixture(t);let owner='user-a';const engine=f.create({ownerNow:()=>owner,onState:s=>{if(s.state==='uploading')owner='user-b';}});
 await assert.rejects(engine.backup(sample()),e=>e.code==='ACCOUNT_CHANGED');assert.equal(f.requests.filter(r=>r.method==='POST').length,0);
});
test('request timeout terminates the operation and releases the admission guard',async t=>{
 const f=await fixture(t);f.setFault({table:'knowledge_cards',method:'POST',delay:150,status:500});const e=f.create({requestTimeoutMs:20});
 await assert.rejects(e.backup(sample()),error=>error.code==='TIMEOUT');assert.equal(e.isBusy(),false);
});
test('cancellation during an HTTP request is terminal and leaves no complete backup',async t=>{
 const f=await fixture(t);const c=new AbortController();f.setFault({table:'knowledge_cards',method:'POST',delay:150,status:500});
 const e=f.create({onState:s=>{if(s.state==='uploading')setTimeout(()=>c.abort(),25);}});
 await assert.rejects(e.backup(sample(),{signal:c.signal}),error=>error.code==='CANCELLED');assert.equal(e.isBusy(),false);assert.ok(!f.rows.cloud_personas.some(p=>p.slug.startsWith('__axion_backup')));
});
test('overlapping operations are rejected without queuing a second upload',async t=>{
 const f=await fixture(t);let release;const gate=new Promise(r=>release=r);const e=f.create({getSession:async()=>{await gate;return {id:'user-a',token:'fixture'};}});
 const pending=e.backup(sample());await assert.rejects(e.backup(sample()),error=>error.code==='BUSY');release();await pending;
});
test('local edits during upload prevent a latest-data success claim',async t=>{
 const f=await fixture(t);await assert.rejects(f.create({snapshotNow:async()=>({version:1,files:{'personas.json':'[]'}})}).backup(sample()),e=>e.code==='LOCAL_CHANGED');
});
test('unsafe, corrupt and Windows-alias snapshot paths are rejected before any HTTP write',async()=>{
 const {prepare}=require('../ui/cloud-sync.js');
 for(const bad of ['../outside.json','personas_data/CON.json','personas_data/a/file:stream','config.json']){const s=sample();s.files[bad]='{}';await assert.rejects(prepare(s,'user-a'));}
 const s=sample();s.files['personas_data/A.json']='{}';s.files['personas_data/a.json']='{}';await assert.rejects(prepare(s,'user-a'));
});
test('controller restores controls and reports verified counts rather than a stuck timer',async()=>{
 const {createController}=require('../ui/cloud-sync.js');const busy=[],statuses=[];
 const controller=createController({invoke:async name=>{assert.equal(name,'export_cloud_snapshot');return sample();},engine:{backup:async()=>({status:'complete',counts:{personas:1,chats:1,frameworks:1,anecdotes:1,files:6}})},onBusy:v=>busy.push(v),onStatus:(m,k)=>statuses.push({m,k})});
 await controller.start();assert.deepEqual(busy,[true,false]);assert.equal(statuses.at(-1).k,'success');assert.match(statuses.at(-1).m,/verified/i);
});
test('UI and native bindings expose verified backup and non-destructive cloud recovery without auto-sync promises',()=>{
 const source=html();const native=fs.readFileSync(path.join(__dirname,'../src/main.rs'),'utf8');
 assert.match(source,/<script src="cloud-sync.js"><\/script>/);assert.match(source,/id="btnRecoverCloudBackup"/);assert.match(source,/id="btnCancelCloudBackup"/);
 assert.match(source,/window\.AxionCloudSync\.createController/);assert.doesNotMatch(source,/Never lose a deal conversation|Real-time Cloud Sync Active|Live cloud sync is active/);
 for(const command of ['export_cloud_snapshot','recover_cloud_snapshot'])assert.match(native,new RegExp('async fn '+command+'\\('));
});
test('snapshot history is excluded from persona readback and only one selected recovery envelope is fetched',async t=>{
 const f=await fixture(t);const e=f.create();await e.backup(sample());
 const badReads=f.requests.filter(r=>r.method==='GET'&&r.path.endsWith('cloud_personas')&&(!r.query.slug||r.query.slug.startsWith('like.'))&&(!r.query.select||r.query.select==='*'));
 assert.deepEqual(badReads,[],'Persona verification must exclude full historical envelopes');
 f.requests.length=0;await e.download();
 const read=f.requests.find(r=>r.method==='GET'&&r.path.endsWith('cloud_personas'));assert.equal(read.query.limit,'1','Download only the latest snapshot payload, not every version');
});
test('cancellation during final snapshot verification cannot turn into success',async t=>{
 const f=await fixture(t);const cancel=new AbortController();let reached=false;
 const e=f.create({snapshotNow:async()=>{reached=true;cancel.abort();return sample();}});
 await assert.rejects(e.backup(sample(),{signal:cancel.signal}),err=>err.code==='CANCELLED');assert.equal(reached,true);assert.equal(e.isBusy(),false);
});

test('controller cloud recovery writes only the downloaded verified snapshot to a new native folder',async()=>{
 const {createController}=require('../ui/cloud-sync.js');const snapshot=sample();const busy=[],commands=[];
 const c=createController({engine:{download:async()=>({owner:'user-a',snapshot,counts:{files:6},digest:'digest'})},invoke:async(command,args)=>{commands.push({command,args});return {path:'safe-new-recovery'};},onBusy:v=>busy.push(v)});
 const result=await c.recover();assert.equal(result.status,'recovered');assert.deepEqual(commands,[{command:'recover_cloud_snapshot',args:{snapshot,expectedOwner:'user-a'}}]);assert.deepEqual(busy,[true,false]);
});
