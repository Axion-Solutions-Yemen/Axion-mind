const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const {connect}=require('./cdp-client.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const repo=path.resolve(__dirname,'..');const scratch='C:/Users/AR-Qamzawi/AppData/Local/hermes/cache/scratch';
const root=fs.mkdtempSync(path.join(scratch,'axion-stability-'));const hub=path.join(root,'PersonasHub');
fs.mkdirSync(path.join(hub,'chats'),{recursive:true});fs.mkdirSync(path.join(hub,'sessions'),{recursive:true});
fs.writeFileSync(path.join(root,'.axion-test-workspace'),'AXION_TEST_ONLY');
const write=(f,v)=>fs.writeFileSync(path.join(hub,f),JSON.stringify(v));
write('personas.json',['alpha','beta'].map(id=>({id,name:id.toUpperCase(),title:'QA fixture',avatar:'A',description:'Non-customer fixture',system_prompt:'',welcome_message:''})));
for(const id of ['alpha','beta']){write('sessions/'+id+'.json',[{id:id+'_one',agent_id:id,title:id.toUpperCase()+' QA',created_at:'1',last_activity_at:'1',message_count:1}]);write('chats/'+id+'_one.json',[{role:'assistant',content:'HISTORY '+id.toUpperCase()}]);}
const requests=[];let child,c,server;const results=[];
async function waitFor(fn,timeout=6000){const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await delay(20);}throw Error('condition deadline exceeded');}
async function scenario(name,fn){try{const detail=await fn();results.push({name,passed:true,detail});console.log('PASS',name,JSON.stringify(detail||{}));}catch(e){results.push({name,passed:false,error:e.message});console.log('FAIL',name,e.message);}}
(async()=>{try{
 server=http.createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;let p;try{p=JSON.parse(body);}catch{res.end('{}');return;}
 const text=p.messages?.at(-1)?.content||p.message||'';const item={text,received:Date.now(),closed:0,finished:0};requests.push(item);res.on('close',()=>{item.closed=Date.now();});
 const emit=o=>{if(!res.destroyed)res.write('data: '+JSON.stringify(o)+'\n\n');};
 if(text.includes('HOLD'))await delay(2200);
 if(res.destroyed)return;res.writeHead(200,{'Content-Type':'text/event-stream'});res.flushHeaders();
 emit({choices:[{delta:{reasoning_content:'Fixture reasoning. '}}]});await delay(60);
 const count=text.includes('LONG')?65:12;
 for(let i=0;i<count&&!res.destroyed;i++){if(text.includes('ERROR')&&i===3){emit({error:{message:'Deterministic fixture error'}});res.end();return;}
 const delta=text.includes('UNSAFE')?'<img src="missing.png" onerror="window.__qaXss=true">Safe text.':('Line '+i+': fixture answer with UTF8 café 你好.\n\n');const bytes=Buffer.from('data: '+JSON.stringify({choices:[{delta:{content:delta}}]})+'\n\n');const cut=bytes.indexOf(Buffer.from('é'))+1;res.write(bytes.subarray(0,cut));await delay(1);if(!res.destroyed)res.write(bytes.subarray(cut));await delay(text.includes('LONG')?35:25);}
 if(!res.destroyed){emit({choices:[{delta:{},finish_reason:'stop'}]});res.end('data: [DONE]\n\n');item.finished=Date.now();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 write('config.json',{mode:'custom_gateway',hermes_gateway_url:url,hermes_auth_token:'',cloud_provider:'openai',cloud_api_key:'',cloud_model:'fixture',custom_url:url+'/v1/chat/completions',custom_auth_token:'',custom_model:'fixture',custom_storage_dir:null});
 const binary=process.env.AXION_TEST_BINARY||path.join(repo,'target/debug/axion-mind.exe');
 child=spawn(binary,[],{env:{...process.env,AXION_SANDBOX_ROOT:root,WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=43825 --remote-debugging-address=127.0.0.1 --deny-permission-prompts'},stdio:'ignore',cwd:root});
 c=await connect();await waitFor(()=>c.evaluate("typeof selectItem==='function' && personas.some(p=>p.id==='alpha')"));
 assert.equal(await c.evaluate("invoke('get_connection_config').then(c=>c.custom_url)"),url+'/v1/chat/completions','CDP attached to wrong native configuration');
 await c.evaluate(`(()=>{window.__qaMetrics={renders:[],longTasks:[],errors:[]};const parse=marked.parse;marked.parse=(...args)=>{const start=performance.now();try{return parse(...args);}finally{__qaMetrics.renders.push({ms:performance.now()-start,chars:String(args[0]).length});}};window.addEventListener('error',e=>{if(e.message)__qaMetrics.errors.push(String(e.message));});window.addEventListener('unhandledrejection',()=>__qaMetrics.errors.push('unhandledrejection'));try{new PerformanceObserver(list=>__qaMetrics.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});}catch(_){};})()`);
 await c.evaluate("selectItem('persona','alpha_one')");
 const choose=id=>c.evaluate(`selectItem('persona',${JSON.stringify(id)})`);
 const send=text=>c.evaluate(`(()=>{document.getElementById('chatInput').value=${JSON.stringify(text)};document.getElementById('btnSend').click();})()`);
 const idle=()=>waitFor(()=>c.evaluate("document.getElementById('btnStop').style.display==='none'"));
 const chat=id=>JSON.parse(fs.readFileSync(path.join(hub,'chats',id+'.json'),'utf8'));
 await scenario('rapid real IPC history selection stays on the latest chat',async()=>{
  const stats=await c.evaluate(`(async()=>{let wrong=0;for(let i=0;i<30;i++){await Promise.all([selectItem('persona','alpha_one'),selectItem('persona','beta_one')]);if(!document.getElementById('messagesContainer').textContent.includes('HISTORY BETA'))wrong++;}return {attempts:30,wrong};})()`);
  assert.equal(stats.wrong,0,JSON.stringify(stats));return stats;
 });
 await scenario('generation saves only to its originating chat after navigation',async()=>{
  await choose('alpha_one');await send('IDENTITY LONG');await waitFor(()=>requests.some(r=>r.text.includes('IDENTITY')));await delay(200);await choose('beta_one');await idle();await delay(120);
  assert.ok(chat('alpha_one').some(m=>m.content==='IDENTITY LONG'),'originating chat did not receive turn');
  assert.ok(!chat('beta_one').some(m=>m.content==='IDENTITY LONG'),'wrong chat received originating turn');return {originSaved:true,otherUntouched:true};
 });
 await scenario('Stop interrupts a request while upstream headers are silent',async()=>{
  await choose('alpha_one');await send('HOLD');await waitFor(()=>requests.some(r=>r.text==='HOLD'));const item=requests.find(r=>r.text==='HOLD');const at=Date.now();await c.evaluate("document.getElementById('btnStop').click()");await delay(450);assert.ok(item.closed&&item.closed-at<450,'connection remained open after Stop');await idle();return {cancelMs:item.closed-at};
 });await delay(2400);
 await scenario('stopped partial answer persists exactly once',async()=>{
  await choose('alpha_one');await send('PARTIAL LONG');await waitFor(()=>c.evaluate("[...document.querySelectorAll('.live-answer')].at(-1)?.textContent.length>60"));await c.evaluate("document.getElementById('btnStop').click()");await delay(400);
  const messages=chat('alpha_one');const idx=messages.findIndex(m=>m.role==='user'&&m.content==='PARTIAL LONG');assert.ok(idx>=0,'stopped turn was not persisted');assert.ok(messages[idx+1]?.content.length>60);assert.equal(messages.filter(m=>m.content==='PARTIAL LONG').length,1);return {partialSaved:true};
 });
 await scenario('old request completion cannot reset a newer request',async()=>{
  await choose('alpha_one');await send('HOLD OLD');await waitFor(()=>requests.some(r=>r.text==='HOLD OLD'));await c.evaluate("document.getElementById('btnStop').click()");await send('NEW LONG');await waitFor(()=>requests.some(r=>r.text==='NEW LONG'));await delay(450);
  assert.equal(await c.evaluate("document.getElementById('btnStop').style.display!=='none'"),true,'new request lost Stop controls');await idle();return {newRequestRetainedControls:true};
 });await delay(2400);
 await scenario('stream completion does not steal focus from an open dialog',async()=>{
  await choose('alpha_one');await send('FOCUS');await c.evaluate("document.getElementById('btnOpenNewPersonaModal').click()");await c.evaluate("document.getElementById('modalPersonaName').focus()");await idle();
  assert.equal(await c.evaluate('document.activeElement.id'),'modalPersonaName');await c.evaluate("document.getElementById('btnCloseModal').click()");return {focusPreserved:true};
 });await c.evaluate("document.getElementById('btnCloseModal').click()");
 await scenario('runtime reduced motion cancels already-running workspace animation',async()=>{
  await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await c.evaluate("window.__qaAnimation=AxionMotion.enter(document.getElementById('messagesContainer'),{duration:2000})");
  await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(60);const state=await c.evaluate('window.__qaAnimation.playState');assert.notEqual(state,'running');return {playState:state};
 });
 await c.send('Emulation.setEmulatedMedia',{features:[]});
 await scenario('provider markdown cannot execute embedded HTML handlers',async()=>{
  await choose('alpha_one');await c.evaluate('window.__qaXss=false');await send('UNSAFE');await waitFor(()=>requests.some(r=>r.text==='UNSAFE'));await idle();await delay(100);
  assert.equal(await c.evaluate('window.__qaXss'),false,'provider HTML executed a handler');assert.equal(await c.evaluate("[...document.querySelectorAll('.live-answer')].at(-1)?.querySelector('[onerror]')?.getAttribute('onerror')||null"),null,'unsafe handler survived rendering');return {unsafeHandlerBlocked:true};
 });
 await scenario('provider errors preserve partial output and remain visibly errors',async()=>{
  await choose('alpha_one');await send('ERROR');await waitFor(()=>requests.some(r=>r.text==='ERROR'));await idle();await delay(100);
  const html=await c.evaluate("[...document.querySelectorAll('.live-answer')].at(-1).textContent");assert.match(html,/Deterministic fixture error/);
  const all=chat('alpha_one'),index=all.findIndex(m=>m.content==='ERROR');assert.ok(index>=0);assert.match(all[index+1].content,/Error: Deterministic fixture error/);return {partialPreserved:true,errorVisible:true};
 });
 await scenario('active turn survives navigating away and back without duplicate rows',async()=>{
  await choose('alpha_one');await send('RETURN LONG');await waitFor(()=>requests.some(r=>r.text==='RETURN LONG'));await delay(100);await choose('beta_one');await choose('alpha_one');
  assert.equal(await c.evaluate("[...document.querySelectorAll('.message-row.user')].filter(n=>n.textContent.includes('RETURN LONG')).length"),1);await idle();return {reattachedExactlyOnce:true};
 });
 await scenario('all streamed output follows latest at multiple viewport sizes',async()=>{
  const samples=[];
  for(const size of [{width:900,height:600},{width:1280,height:820}]){
   await c.send('Emulation.setDeviceMetricsOverride',{...size,deviceScaleFactor:1,mobile:false});await choose('alpha_one');await send('SCROLL LONG '+size.width);await waitFor(()=>requests.some(r=>r.text==='SCROLL LONG '+size.width));
   while(await c.evaluate("document.getElementById('btnStop').style.display!=='none'")){
    const value=await c.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const e=document.getElementById('messagesContainer'),t=document.querySelector('.live-reasoning-text');resolve({gap:e.scrollHeight-e.scrollTop-e.clientHeight,thinkingGap:t?t.scrollHeight-t.scrollTop-t.clientHeight:0,width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth});})))");samples.push(value);await delay(70);
   }
  }
  await c.send('Emulation.clearDeviceMetricsOverride');
  const worst=Math.max(...samples.map(s=>s.gap)),overflow=Math.max(...samples.map(s=>s.overflow));assert.ok(worst<=3,'latest text bottom gap='+worst);assert.ok(overflow<=1,'horizontal page overflow='+overflow);return {samples:samples.length,maxGap:worst,horizontalOverflow:overflow};
 });
 async function pointerClick(selector){const pos=await c.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing pointer target');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:e===document.elementFromPoint(x,y)||e.contains(document.elementFromPoint(x,y))};})()`);assert.ok(pos.hit,'pointer target obstructed '+selector);await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pos.x,y:pos.y});await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:pos.x,y:pos.y});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:pos.x,y:pos.y});}
 await scenario('real pointer, keyboard, RTL input and dialog focus restoration',async()=>{
  await pointerClick('#btnOpenNewPersonaModal');await delay(280);await pointerClick('#modalPersonaName');await c.send('Input.insertText',{text:'اختبار عربي QA'});
  assert.equal(await c.evaluate("document.getElementById('modalPersonaName').value"),'اختبار عربي QA');
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(200);
  assert.equal(await c.evaluate("document.getElementById('personaModal').classList.contains('open')"),false);
  assert.equal(await c.evaluate('document.activeElement.id'),'btnOpenNewPersonaModal','focus was not restored to dialog trigger');
  await c.evaluate("document.getElementById('chatInput').focus()");await c.send('Input.insertText',{text:'مرحبا بالعالم'});assert.equal(await c.evaluate("document.getElementById('chatInput').dir"),'auto');await c.evaluate("document.getElementById('chatInput').value=''");return {nativePointer:true,arabicInputPreserved:true,focusRestored:true};
 });
 await scenario('CSP, hostile markdown and link protocols enforce a local privilege boundary',async()=>{
  const result=await c.evaluate(`(()=>{let evalBlocked=false;try{new Function('return 1')();}catch(e){evalBlocked=e.name==='EvalError';}const malicious='<svg onload="window.__x=1"></svg><form><button data-action="runHermesQuickCommand" data-value="doctor">bad</button></form><a href="javascript:alert(1)">bad</a><iframe srcdoc="x"></iframe><img src="x" onerror="window.__x=1"><a href="https://example.com">ok</a>';const template=document.createElement('template');template.innerHTML=marked.parse(malicious);return {evalBlocked,unsafe:!!template.content.querySelector('svg,form,button,iframe,[onload],[onerror],[data-action],a[href^="javascript:"]'),safeLink:!!template.content.querySelector('a[href="https://example.com"]'),csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content||null};})()`);
  assert.equal(result.unsafe,false);console.log('CSP_ACTIVE',!!result.csp,result.evalBlocked);assert.equal(result.evalBlocked,true,'unsafe-eval still permitted');assert.equal(result.safeLink,true);assert.ok(result.csp);return {evalBlocked:true,unsafeHtmlRemoved:true,cspPresent:true};
 });
 await scenario('failed index update retries exactly once without hiding unsaved output',async()=>{
  await choose('alpha_one');const index=path.join(hub,'sessions/alpha.json'),old=fs.readFileSync(index);fs.writeFileSync(index,'broken QA index');
  try{
   await send('RETRY');await waitFor(()=>requests.some(r=>r.text==='RETRY'));await idle();
   assert.equal(await c.evaluate("!!document.querySelector('.stream-error button')"),true,'missing save retry action');
   await choose('beta_one');await choose('alpha_one');assert.equal(await c.evaluate("[...document.querySelectorAll('.message-row.user')].filter(e=>e.textContent.includes('RETRY')).length"),1,'unsaved turn duplicated on navigation');
   fs.writeFileSync(index,old);await c.evaluate("document.querySelector('.stream-error button').click()");await waitFor(()=>c.evaluate("!document.querySelector('.stream-error button')"));
   assert.equal(chat('alpha_one').filter(m=>m.role==='user'&&m.content==='RETRY').length,1);return {retryAvailable:true,exactlyOnce:true};
  }finally{fs.writeFileSync(index,old);}
 });
 await scenario('native storage scope and unsafe-link guards reject invalid requests',async()=>{
  const before=fs.readFileSync(path.join(hub,'chats/alpha_one.json'));
  const results=await c.evaluate(`(async()=>{const rejected=[];for(const url of ['javascript:alert(1)','file:///C:/Windows/win.ini','https://user:secret@example.com']){try{await invoke('open_chat_link',{url});rejected.push(false);}catch(_){rejected.push(true);}}let scopeRejected=false;try{await invoke('append_persona_turn',{sessionId:'alpha_one',requestId:'wrong-scope',message:'u',response:'a',model:null,scope:'invalid'});}catch(_){scopeRejected=true;}return {rejected,scopeRejected};})()`);
  assert.ok(results.rejected.every(Boolean));assert.equal(results.scopeRejected,true);assert.ok(before.equals(fs.readFileSync(path.join(hub,'chats/alpha_one.json'))));return {unsafeLinksRejected:3,scopeGuard:true};
 });
 const metrics=await c.evaluate('window.__qaMetrics');
 await scenario('render telemetry has no uncaught errors and stays within the fixture budget',async()=>{
  const times=metrics.renders.map(r=>r.ms).sort((a,b)=>a-b),p95=times[Math.floor(times.length*.95)]||0;
  assert.equal(metrics.errors.length,0,JSON.stringify(metrics.errors));assert.ok(p95<=16,'p95 render time '+p95+'ms');return {renders:times.length,p95Ms:p95,maxMs:Math.max(...times),maxMarkdownChars:Math.max(...metrics.renders.map(r=>r.chars)),longTasks:metrics.longTasks.length};
 });
 const payload={binary,sandbox:root,metrics,results,requestCount:requests.length,allPassed:results.every(r=>r.passed)};
 fs.mkdirSync(path.join(repo,'docs/frontend-debug/results'),{recursive:true});fs.writeFileSync(path.join(repo,'docs/frontend-debug/results',process.env.AXION_RESULT_NAME||'live.json'),JSON.stringify(payload,null,2));
 if(!payload.allPassed)throw Error('Stabilization matrix contains failures');console.log('STABILIZATION_LIVE_PASSED');
}finally{c?.close();if(child&&!child.killed)child.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}})().catch(e=>{console.error(e.message);process.exitCode=1;});
