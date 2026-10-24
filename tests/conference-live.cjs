/* Real release executable + native IPC + native HTTP streaming. All data stays under target/. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),binary=path.join(repo,'target/conference/release/axion-mind.exe');
const evidence=path.join(repo,'docs/conference-evidence');fs.mkdirSync(evidence,{recursive:true});
const scratch=path.join(repo,'target/conference-smoke');fs.mkdirSync(scratch,{recursive:true});
const root=fs.mkdtempSync(path.join(scratch,'run-')),hub=path.join(root,'PersonasHub');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const results=[],requests=[],errors=[];let child,c,server,scope,roomId,port,connect;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const write=(base,name,value)=>{const file=path.join(base,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));};
function seed(base,url){
 write(base,'.axion-test-workspace','AXION_TEST_ONLY');const hub=path.join(base,'PersonasHub');
 write(hub,'personas.json',[['alpha','Alex'],['beta','Alex'],['grace','Grace Hopper']].map(([id,name])=>({id,name,title:'Conference QA',avatar:'A',description:'Isolated fixture',system_prompt:`ACTUAL ${id.toUpperCase()} PROMPT`,welcome_message:'',model:'fixture/exact-'+id})));
 write(hub,'config.json',{mode:'custom_gateway',hermes_gateway_url:url,hermes_auth_token:'',cloud_provider:'openai',cloud_api_key:'',cloud_model:'WRONG-CLOUD-DEFAULT',custom_url:url+'/v1/chat/completions',custom_auth_token:'',custom_model:'WRONG-CUSTOM-DEFAULT',custom_storage_dir:null});
 for(const id of ['alpha','beta','grace']){write(hub,'sessions/'+id+'.json',[{id:id+'_private',agent_id:id,title:'Private fixture',created_at:'1',last_activity_at:'1',message_count:1}]);write(hub,'chats/'+id+'_private.json',[{role:'assistant',content:'PRIVATE_HISTORY_NEVER_SHARE_'+id}]);}
 write(hub,'unrelated.txt','UNRELATED MUST SURVIVE');return hub;
}
async function waitFor(fn,label='condition',ms=10000){const start=Date.now();while(Date.now()-start<ms){if(await fn())return;await delay(30);}throw Error('Timed out: '+label);}
async function scenario(name,fn){try{const detail=await fn();results.push({name,passed:true,detail});console.log('PASS',name,JSON.stringify(detail||{}));}catch(e){results.push({name,passed:false,error:e.stack});console.log('FAIL',name,e.message);throw e;}}
const evalJS=code=>c.evaluate(code);
const invoke=(cmd,args={})=>evalJS(`invoke(${JSON.stringify(cmd)},${JSON.stringify(args)})`);
const state=()=>evalJS('AxionConferenceUI.controller.state()');
const readRoom=()=>JSON.parse(fs.readFileSync(path.join(hub,'conferences',roomId+'.json'),'utf8'));
async function chooseRoom(){await evalJS(`AxionConferenceUI.openRoom(${JSON.stringify(roomId)})`);}
async function send(message){await evalJS(`(()=>{document.getElementById('conferenceInput').value=${JSON.stringify(message)};document.getElementById('btnConferenceSend').click();})()`);}
async function idle(){await waitFor(async()=>!(await state()).busy,'round settled');await delay(50);}
async function screenshot(name){const shot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,name+'.png'),Buffer.from(shot.data,'base64'));}
async function pointer(selector){const pos=await evalJS(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing target');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...pos});}
async function key(key,code,virtual){await c.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtual});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtual});}
async function stopApp(){c?.close();c=null;if(child){const owned=child;child=null;if(owned.exitCode===null){owned.kill();await Promise.race([new Promise(r=>owned.once('exit',r)),delay(3000)]);}}await delay(300);}
async function launch(base){
 child=spawn(binary,[],{cwd:base,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,AXION_SANDBOX_ROOT:base,WEBVIEW2_USER_DATA_FOLDER:path.join(base,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --deny-permission-prompts --no-sandbox --disable-gpu`,TEMP:path.join(repo,'target/conference-scratch'),TMP:path.join(repo,'target/conference-scratch')}});
 child.stdout.on('data',b=>fs.appendFileSync(path.join(base,'process.log'),b));child.stderr.on('data',b=>fs.appendFileSync(path.join(base,'process.log'),b));fs.appendFileSync(path.join(evidence,'process-exits.log'),JSON.stringify({base,pid:child.pid,launched:true})+'\n');child.on('error',e=>errors.push(e.message));child.on('exit',(code,signal)=>fs.appendFileSync(path.join(evidence,'process-exits.log'),JSON.stringify({base,code,signal})+'\n'));try{c=await connect();}catch(e){try{fs.writeFileSync(path.join(evidence,'cdp-failure.json'),JSON.stringify(await (await fetch('http://127.0.0.1:'+port+'/json/list')).json(),null,2));}catch(error){fs.writeFileSync(path.join(evidence,'cdp-failure.json'),String(error));}throw e;}
 await waitFor(()=>evalJS("typeof AxionConferenceUI==='object' && personas.some(p=>p.id==='alpha') && AxionConferenceUI.controller.state().scope"),'native app ready');
 const canonical=fs.realpathSync.native(path.join(base,'PersonasHub'));const scopes=[canonical,'\\\\?\\'+canonical].map(p=>digest(p.toLowerCase()));assert.ok(scopes.includes(await invoke('get_chat_storage_scope')),'native root scope');
 await evalJS("window.__conferenceErrors=[];window.addEventListener('error',e=>__conferenceErrors.push(e.message));window.addEventListener('unhandledrejection',e=>__conferenceErrors.push(String(e.reason)))");
}
async function newRoom(topic,ids){
 await pointer('#btnNewConference');await waitFor(()=>evalJS("!document.getElementById('btnSaveConference').disabled"),'participant dialog loaded');
 await evalJS(`(()=>{document.getElementById('conferenceTopicInput').value=${JSON.stringify(topic)};for(const id of ${JSON.stringify(ids)}){const row=[...document.querySelectorAll('.conference-participant-option')].find(r=>r.dataset.participantId===id);row.querySelector('input[type=checkbox]').click();row.querySelector('select').value='custom_gateway';row.querySelector('input[list]').value='fixture/exact-'+id;}})()`);
 await screenshot('dialog');await pointer('#btnSaveConference');await waitFor(async()=>!(await evalJS("document.getElementById('conferenceDialog').open")),'room created');
 roomId=(await state()).room.id;return roomId;
}
(async()=>{try{
 const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));port=reserve.address().port;await new Promise(r=>reserve.close(r));process.env.AXION_CDP_PORT=String(port);({connect}=require('./cdp-client.cjs'));
 server=http.createServer(async(req,res)=>{
  if(req.method!=='POST'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;}
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);let context;try{context=JSON.parse(body.messages?.at(-1)?.content);}catch{context={};}
  const latest=context.transcript?.filter(e=>e.kind==='user').at(-1)?.content||'';
  const item={url:req.url,model:body.model,system:body.messages?.[0]?.content,context,latest,received:Date.now(),closed:0,finished:0,hasTools:!!body.tools,hadAuth:!!req.headers.authorization};requests.push(item);res.on('close',()=>{item.closed=Date.now();});
  if(latest.includes('SILENT')){await delay(4500);if(res.destroyed)return;}
  res.writeHead(200,{'Content-Type':'text/event-stream'});res.flushHeaders();
  const emit=v=>{if(!res.destroyed)res.write('data: '+JSON.stringify(v)+'\n\n');};
  emit({choices:[{delta:{reasoning_content:'Fixture reasoning only. '}}]});
  const long=/LONG|CRASH/.test(latest),total=long?120:4;
  for(let i=0;i<total&&!res.destroyed;i++){
   if(i===2&&latest.includes('ABRUPT')){res.end();return;}
   if(i===2&&latest.includes('ERROR')){emit({error:{message:'Deterministic conference provider failure'}});res.end();return;}
   const delta=`${body.model}: token ${i} caf\u00e9 \u4f60\u597d.\n\n`+(i===0?'<img src="missing.png" onerror="window.__conferenceXss=true">':'');
   const packet=Buffer.from('data: '+JSON.stringify({choices:[{delta:{content:delta}}]})+'\n\n');const cut=packet.indexOf(Buffer.from('\u00e9'))+1;
   res.write(packet.subarray(0,cut));await delay(1);if(!res.destroyed)res.write(packet.subarray(cut));await delay(long?35:25);
  }
  if(!res.destroyed){emit({choices:[{delta:{},finish_reason:'stop'}]});res.end('data: [DONE]\n\n');item.finished=Date.now();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;seed(root,url);
 const preserved=['personas.json','config.json','sessions/alpha.json','sessions/beta.json','sessions/grace.json','chats/alpha_private.json','chats/beta_private.json','chats/grace_private.json','unrelated.txt'];
 const before=Object.fromEntries(preserved.map(p=>[p,digest(fs.readFileSync(path.join(hub,p)))]));
 await launch(root);scope=await invoke('get_chat_storage_scope');assert.equal(await evalJS("invoke('get_connection_config').then(c=>c.custom_url)"),url+'/v1/chat/completions');
 await scenario('accessible dialog keyboard focus, Escape and pointer controls',async()=>{
  await pointer('#btnNewConference');await waitFor(()=>evalJS("!document.getElementById('btnSaveConference').disabled"));
  const ax=await c.send('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(n=>n.role?.value==='dialog'&&n.name?.value==='Create conference room'));
  assert.equal(await evalJS('document.activeElement.id'),'conferenceTopicInput');
  await key('Tab','Tab',9);assert.equal(await evalJS("document.getElementById('conferenceDialog').contains(document.activeElement)"),true);
  await key('Escape','Escape',27);assert.equal(await evalJS("document.getElementById('conferenceDialog').open"),false);assert.equal(await evalJS('document.activeElement.id'),'btnNewConference');return {nativeDialog:true,focusRestored:true};
 });
 await scenario('create optional-agent room and native sequential streaming with exact prompts and models',async()=>{
  await newRoom('Conference native release smoke',['alpha','beta','__hermes__']);const at=requests.length;await send('NORMAL sequential');
  await waitFor(()=>readRoom().transcript?.[1]?.content?.length>10,'partial text on disk');assert.equal(readRoom().transcript[2].status,'pending');
  await idle();const room=readRoom(),batch=requests.slice(at);assert.equal(room.status,'completed');assert.equal(room.transcript.length,4);
  assert.deepEqual(batch.map(r=>r.model),['fixture/exact-alpha','fixture/exact-beta','fixture/exact-__hermes__']);
  assert.match(batch[0].system,/^ACTUAL ALPHA PROMPT/);assert.match(batch[1].system,/^ACTUAL BETA PROMPT/);assert.match(batch[2].system,/discussion-only/);
  for(let i=1;i<batch.length;i++){assert.ok(batch[i].received>=batch[i-1].finished);assert.ok(batch[i].context.transcript.some(e=>e.content.includes(batch[i-1].model+': token')));}
  assert.ok(batch.every(r=>r.url==='/v1/chat/completions'&&!r.hasTools&&!r.hadAuth&&!JSON.stringify(r.context).includes('PRIVATE_HISTORY_NEVER_SHARE')));
  assert.equal(await evalJS("document.querySelectorAll('#conferenceTranscript article').length"),4);assert.equal(await evalJS("!!document.querySelector('#conferenceTranscript [onerror]')||!!window.__conferenceXss"),false);
  await screenshot('completed-room');return {roomId,models:batch.map(r=>r.model),durableEntries:room.transcript.length};
 });
 await scenario('unknown and ambiguous mentions reject without writes; exact target plus synthesis',async()=>{
  const bytes=fs.readFileSync(path.join(hub,'conferences',roomId+'.json')),count=requests.length;
  for(const message of ['@Alex explain','@unknown explain']){await send(message);await idle();assert.ok(bytes.equals(fs.readFileSync(path.join(hub,'conferences',roomId+'.json'))));assert.equal(requests.length,count);assert.equal(await evalJS("document.getElementById('conferenceInput').value"),message);}
  await send('@beta NORMAL targeted');await idle();assert.deepEqual(requests.slice(count).map(r=>r.model),['fixture/exact-beta','fixture/exact-__hermes__']);return {ambiguousRejected:true,unknownRejected:true,targetedModels:requests.slice(count).map(r=>r.model)};
 });
 await scenario('room history reopens, participant edits retain prior model attribution, full-name targeting',async()=>{
  await evalJS("selectItem('persona','alpha_private')");assert.equal(await evalJS("document.getElementById('conferenceView').hidden"),true);await chooseRoom();assert.equal((await state()).room.transcript.length,7);
  await pointer('#btnEditConference');await waitFor(()=>evalJS("!document.getElementById('btnSaveConference').disabled"));
  await evalJS("(()=>{for(const row of document.querySelectorAll('.conference-participant-option')){const check=row.querySelector('[type=checkbox]');if(check.checked)check.click();if(row.dataset.participantId==='grace'){check.click();row.querySelector('select').value='custom_gateway';row.querySelector('input[list]').value='fixture/exact-grace';}}})()");
  await pointer('#btnSaveConference');await waitFor(()=>evalJS("!document.getElementById('conferenceDialog').open"));const count=requests.length;
  await send('@[Grace Hopper] NORMAL');await idle();assert.deepEqual(requests.slice(count).map(r=>r.model),['fixture/exact-grace']);assert.equal(readRoom().transcript[1].model,'fixture/exact-alpha');
  return {priorEntriesRetained:7,fullNameTarget:'grace',optionalAgentRemoved:true};
 });
 // Use a fresh room so cancellation/failure tests also verify queued speakers.
 await newRoom('Stop, restart and errors',['alpha','beta','__hermes__']);
 await scenario('Stop aborts silent upstream headers and all queued speakers',async()=>{
  const count=requests.length;await send('SILENT');await waitFor(()=>requests.length>count);const item=requests[count],at=Date.now();await pointer('#btnConferenceStop');await idle();
  await waitFor(()=>item.closed,'silent socket closed',1500);assert.ok(item.closed-at<1000);const r=readRoom();assert.equal(r.status,'cancelled');assert.ok(r.transcript.slice(1).every(e=>e.status==='cancelled'));assert.equal(requests.length,count+1);return {cancelMs:item.closed-at,queuedSpeakersCancelled:2};
 });
 await scenario('Stop preserves streamed partial text and survives navigation without duplicates',async()=>{
  const count=requests.length;await send('LONG');await waitFor(()=>readRoom().transcript.at(-3)?.content.length>100);await evalJS("selectItem('persona','beta_private')");await chooseRoom();
  assert.equal((await state()).busy,true);await pointer('#btnConferenceStop');await idle();const r=readRoom();assert.equal(r.status,'cancelled');assert.ok(r.transcript.at(-3).content.length>100);assert.equal(r.transcript.filter(e=>e.content==='LONG').length,1);assert.equal(requests.length,count+1);return {partialBytes:r.transcript.at(-3).content.length,duplicates:0};
 });
 await scenario('WebView reload reconnects saved running state and native Stop',async()=>{
  const count=requests.length;await send('LONG RELOAD');await waitFor(()=>requests.length>count&&readRoom().status==='running'&&readRoom().transcript.at(-3)?.content.length>80);
  await evalJS("window.__reloadMarker=true");await c.send('Page.reload');await waitFor(()=>evalJS("!window.__reloadMarker&&typeof AxionConferenceUI==='object'&&AxionConferenceUI.controller.state().scope").catch(()=>false),'reloaded UI');await chooseRoom();
  assert.equal((await state()).busy,true);assert.equal((await state()).streamAttached,false);await pointer('#btnConferenceStop');await idle();assert.equal(readRoom().status,'cancelled');assert.equal(requests.length,count+1);return {nativeTaskSurvivedReload:true,stopReconnected:true};
 });
 await scenario('provider failure and abrupt EOF remain visibly failed with durable partial output',async()=>{
  for(const marker of ['ERROR','ABRUPT']){const count=requests.length;await send(marker);await idle();const room=readRoom();assert.equal(room.status,'failed');assert.ok(room.transcript.at(-3).content.length>0);assert.equal(room.transcript.at(-2).status,'failed');assert.equal(requests.length,count+1);assert.match(await evalJS("document.getElementById('conferenceTranscript').textContent"),marker==='ERROR'?/Deterministic conference provider failure/:/ended before completion/);}
  return {partialErrorsSaved:2,noQueuedRequests:true};
 });
 await scenario('native scope, traversal and stale-request guards preserve stored bytes',async()=>{
  const before=fs.readFileSync(path.join(hub,'conferences',roomId+'.json'));
  for(const args of [{roomId,scope:'wrong-scope'},{roomId:'../outside',scope}]){await assert.rejects(()=>invoke('get_conference_room',args));}
  await assert.rejects(()=>invoke('update_conference_participants',{roomId,scope,participants:[{id:'alpha',provider:'custom_gateway',model:''}]}));assert.ok(before.equals(fs.readFileSync(path.join(hub,'conferences',roomId+'.json'))));return {invalidScopesRejected:true,pathEscapeRejected:true};
 });
 await scenario('snapshot, ZIP and legacy JSON exports include exact rooms and preserve unrelated data on restore',async()=>{
  for(const rel of preserved)assert.equal(digest(fs.readFileSync(path.join(hub,rel))),before[rel],'unrelated bytes changed: '+rel);
  const snapshot=await invoke('export_cloud_snapshot');assert.equal(snapshot.files['conferences/'+roomId+'.json'],fs.readFileSync(path.join(hub,'conferences',roomId+'.json'),'utf8'));
  const plan=await evalJS(`AxionCloudSync.prepare(${JSON.stringify(snapshot)},'fixture-owner')`);assert.equal(plan.counts.conferences,2);
  const payload=await invoke('export_all_data_json');assert.ok(payload.conferences[roomId]);assert.ok(payload.sessions.alpha);
  const zip=await invoke('export_customer_backup');assert.ok(zip.startsWith(root));assert.ok(fs.statSync(zip).size>0);
  await invoke('restore_customer_backup',{zipPath:zip});for(const rel of preserved)assert.equal(digest(fs.readFileSync(path.join(hub,rel))),before[rel]);const legacyBefore=readRoom();await invoke('import_all_data_json',{payload});assert.deepEqual(readRoom(),legacyBefore);
  // Formatting can change for explicitly restored legacy files; content must remain unchanged.
  for(const rel of preserved){if(rel.endsWith('.json')){assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(hub,rel),'utf8'))).includes('PRIVATE_HISTORY_NEVER_SHARE')||!rel.startsWith('chats/'),true);}else assert.equal(digest(fs.readFileSync(path.join(hub,rel))),before[rel]);}
  fs.writeFileSync(path.join(evidence,'legacy-snapshot.json'),JSON.stringify(payload,null,2));return {zip,rooms:Object.keys(payload.conferences).length,sessions:Object.keys(payload.sessions).length};
 });
 await scenario('real process interruption recovers partial and queued entries after restart',async()=>{
  const count=requests.length;await send('CRASH LONG');await waitFor(()=>requests.length>count&&readRoom().status==='running'&&readRoom().transcript.at(-3)?.content.length>80);const partial=readRoom().transcript.at(-3).content;await stopApp();await launch(root);scope=await invoke('get_chat_storage_scope');await chooseRoom();
  const recovered=readRoom();assert.equal(recovered.status,'interrupted');assert.ok(recovered.transcript.at(-3).content.startsWith(partial));assert.equal(recovered.transcript.at(-2).status,'interrupted');assert.equal(recovered.active_request_id,null);await screenshot('interrupted-room');
  await send('@beta NORMAL after restart');await idle();assert.equal(readRoom().status,'completed');return {partialBytes:partial.length,restarted:true,followupCompleted:true};
 });
 await scenario('room list is accessible and layout fits the minimum window',async()=>{
  await c.send('Emulation.setDeviceMetricsOverride',{width:900,height:600,deviceScaleFactor:1,mobile:false});await screenshot('room-900x600');
  const ax=await c.send('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(n=>n.role?.value==='button'&&n.name?.value==='Stop, restart and errors'));
  const layout=await evalJS("({overflow:document.documentElement.scrollWidth-innerWidth,errors:window.__conferenceErrors,focusable:document.getElementById('conferenceTranscript').tabIndex})");assert.ok(layout.overflow<=1);assert.equal(layout.focusable,0);assert.deepEqual(layout.errors,[]);await c.send('Emulation.clearDeviceMetricsOverride');return layout;
 });
 await scenario('another marked sandbox has independent rooms and rejects the original scope',async()=>{
  await stopApp();const second=fs.mkdtempSync(path.join(scratch,'other-'));seed(second,url);await launch(second);const otherScope=await invoke('get_chat_storage_scope');assert.notEqual(otherScope,scope);assert.deepEqual(await invoke('list_conference_rooms',{scope:otherScope}),[]);await assert.rejects(()=>invoke('get_conference_room',{roomId,scope}));return {secondSandbox:second,separateScope:true};
 });
 // The fixture never calls tool/session endpoints or uses real credentials.
 assert.ok(requests.every(r=>r.url==='/v1/chat/completions'&&!r.hadAuth&&!r.hasTools));
 console.log('CONFERENCE_RELEASE_SMOKE_PASSED');
}catch(e){errors.push(e.stack);console.error(e.stack);process.exitCode=1;}finally{
 await stopApp();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 fs.writeFileSync(path.join(evidence,'smoke.json'),JSON.stringify({binary,binarySha256:fs.existsSync(binary)?digest(fs.readFileSync(binary)):null,sandbox:root,cdpPort:port,results,requests,errors,allPassed:results.length>=13&&results.every(r=>r.passed)&&errors.length===0},null,2));
}})();
