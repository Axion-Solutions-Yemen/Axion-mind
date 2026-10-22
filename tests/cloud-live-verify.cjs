// Opt-in integration against the actual Axion Mind release and current account.
// Never prints session credentials or customer payload contents.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');
const approved=process.env.AXION_LIVE_CLOUD_WRITE_APPROVED==='yes';
const expectedEmail=process.env.AXION_EXPECTED_EMAIL||'arafat.sofa.point@gmail.com';
const port=Number(process.env.AXION_CDP_PORT||43823);
async function connect(){
 let pages;
 for(let attempt=0;attempt<100;attempt++){
  try{pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.some(p=>p.type==='page'&&p.title==='Axion Mind'))break;}catch(_){}
  await new Promise(r=>setTimeout(r,100));
 }
 const page=pages?.find(p=>p.type==='page'&&p.title==='Axion Mind');assert.ok(page,'Actual release page missing');
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 let seq=0;const waiting=new Map();
 function send(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('CDP operation timed out: '+method));},210000);waiting.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
 ws.addEventListener('message',async e=>{
  const m=JSON.parse(e.data);
  if(m.method==='Page.javascriptDialogOpening'){
   const message=m.params.message||'';
   const allowed=approved&&m.params.type==='confirm'&&((message.startsWith('Back up all LOCAL customer data to ')&&message.includes(expectedEmail))||message.startsWith('Recover '));
   await send('Page.handleJavaScriptDialog',{accept:allowed});return;
  }
  const p=waiting.get(m.id);if(!p)return;waiting.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error('CDP command failed')):p.resolve(m.result);
 });
 await send('Page.enable');
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error('Release evaluation failed; inspect sanitized app diagnostics');return r.result.value;}
 return {evaluate,close(){for(const p of waiting.values())clearTimeout(p.timer);ws.close();}};
}
function hashes(root){const out={};function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(e.isFile())out[path.relative(root,f).replaceAll('\\','/')]=createHash('sha256').update(fs.readFileSync(f)).digest('hex');else throw new Error('Unexpected recovery file type');}}walk(root);return out;}
(async()=>{
 const c=await connect();const evaluate=c.evaluate;
 try{
  const initial=await evaluate(`(async()=>{const s=await invoke('get_user_cloud_session');if(!s)return {signedIn:false};await updateAccountUI();const snapshot=await invoke('export_cloud_snapshot');window.__cloudCheckPlan=await window.AxionCloudSync.prepare(snapshot,s.id);return {signedIn:true,email:s.email,owner:s.id,counts:window.__cloudCheckPlan.counts,digest:window.__cloudCheckPlan.digest,manifest:window.__cloudCheckPlan.manifest,handlerBound:typeof document.getElementById('btnForceCloudSync').onclick==='function',recoveryBound:typeof document.getElementById('btnRecoverCloudBackup').onclick==='function'};})()`);
  assert.equal(initial.email,expectedEmail);assert.ok(initial.handlerBound&&initial.recoveryBound);console.log('Native release dry run:',JSON.stringify({email:initial.email,counts:initial.counts,digest:initial.digest}));
  if(!approved){console.log('READ_ONLY_RELEASE_SMOKE_PASSED; production writes not enabled.');return;}
  await evaluate('(async()=>{await openAuthModal();return true;})()');
  const first=await evaluate("document.getElementById('btnForceCloudSync').onclick()");assert.equal(first.status,'complete');assert.equal(first.digest,initial.digest);
  async function cloudCounts(){return evaluate(`(async()=>{const s=await invoke('get_user_cloud_session'),result={};for(const table of ['cloud_personas','knowledge_cards','chat_conversations']){const rows=[];let offset=0;while(true){const q=new URLSearchParams({select:'id',user_id:'eq.'+s.id,limit:'200',offset:String(offset),order:'id.asc'});const r=await fetch('https://kefxeysyvtdxxdupkapa.supabase.co/rest/v1/'+table+'?'+q,{headers:{apikey:'sb_publishable_m6nFD1nyCmeP5xMz0K_5Hw_HqIHOr2N',Authorization:'Bearer '+s.token}});if(!r.ok)throw new Error('Readback failed');const batch=await r.json();rows.push(...batch);if(!batch.length)break;offset+=batch.length;}result[table]=rows.length;}return result;})()`);}
  const beforeRepeat=await cloudCounts();const second=await evaluate("document.getElementById('btnForceCloudSync').onclick()");assert.equal(second.status,'complete');assert.equal(second.digest,initial.digest);const afterRepeat=await cloudCounts();assert.deepEqual(afterRepeat,beforeRepeat);
  const recovery=await evaluate("document.getElementById('btnRecoverCloudBackup').onclick()");assert.equal(recovery.status,'recovered');assert.equal(recovery.digest,initial.digest);
  const recovered=hashes(recovery.path);const expected=Object.fromEntries(initial.manifest.map(f=>[f.path,f.sha256]));assert.deepEqual(recovered,expected,'Cloud-only recovery content must match every original raw file');
  const ui=await evaluate("({feedback:document.getElementById('authFeedback').textContent,backupEnabled:!document.getElementById('btnForceCloudSync').disabled,recoveryEnabled:!document.getElementById('btnRecoverCloudBackup').disabled,cancelHidden:document.getElementById('btnCancelCloudBackup').style.display==='none'})");assert.ok(ui.backupEnabled&&ui.recoveryEnabled&&ui.cancelHidden);assert.match(ui.feedback,/Recovered and verified/);
  // Scoped negative read test only. No attempts to write another customer's data.
  const isolation=await evaluate(`(async()=>{const s=await invoke('get_user_cloud_session'),out={};for(const table of ['cloud_personas','knowledge_cards','chat_conversations']){const q=new URLSearchParams({select:'id',user_id:'eq.3ba63a12-104c-4786-989a-68563f6a7a86'});if(table==='cloud_personas')q.set('is_public','eq.false');const r=await fetch('https://kefxeysyvtdxxdupkapa.supabase.co/rest/v1/'+table+'?'+q,{headers:{apikey:'sb_publishable_m6nFD1nyCmeP5xMz0K_5Hw_HqIHOr2N',Authorization:'Bearer '+s.token}});out[table]={status:r.status,visible:r.ok?(await r.json()).length:null};}return out;})()`);
  for(const result of Object.values(isolation)){assert.equal(result.status,200);assert.equal(result.visible,0);}
  const report={verified_at:new Date().toISOString(),email:initial.email,owner:initial.owner,counts:initial.counts,digest:initial.digest,cloud_rows:afterRepeat,idempotent:true,cloud_only_recovery_path:recovery.path,recovered_files:Object.keys(recovered).length,recovered_hashes_equal:true,current_user_cannot_read_other_known_users_private_rows:isolation,ui_controls_restored:true,limitations:['No second-machine test','No production cross-account write probes','Administrative schema/RLS metadata not accessible through the authenticated REST metadata endpoint','Manual backup and recovery only; no automatic multi-device reconciliation']};
  fs.writeFileSync(path.join(__dirname,'../docs/CLOUD_SYNC_LIVE_VERIFICATION.json'),JSON.stringify(report,null,2));console.log('LIVE_CLOUD_BACKUP_AND_RECOVERY_PASSED',JSON.stringify(report));
  await evaluate("document.getElementById('btnCloseAuthModal').click();delete window.__cloudCheckPlan;true");
 }finally{c.close();}
})().catch(error=>{console.error(error.message||'Live verification failed');process.exitCode=1;});
