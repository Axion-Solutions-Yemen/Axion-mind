const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const api=()=>require('../ui/auto-backup.js');
const cloud=require('../ui/cloud-sync.js');
const snapshot=n=>({version:1,files:{'personas.json':'[]','chats/demo_1.json':JSON.stringify([{role:'user',content:String(n)}])}});
function fixture(extra={}){
 let now=1000000,ctx={owner:'a',email:'a@example.test',scope:'a'.repeat(64),snapshot:snapshot(1)},calls=0,online=true,busy=false;
 const values=new Map(),events=[],policies=new Map();
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const opts={storage,now:()=>now,intervalMs:300000,inspect:async()=>{if(!online)throw new Error('Offline');return ctx?{...structuredClone(ctx),autoDisabled:policies.get(ctx.owner+'|'+ctx.scope)===true}:null;},setPolicy:async(disabled,c)=>policies.set(c.owner+'|'+c.scope,disabled),backup:async(s,c)=>{calls++;return {status:'complete',owner:c.owner,digest:await cloud.sha(cloud.canonical(s)),verified_at:new Date(now).toISOString()};},isBusy:()=>busy,cancel:()=>{},onState:s=>events.push(s),...extra};
 const scheduler=api().createScheduler(opts);
 return {scheduler,opts,values,events,get ctx(){return ctx},set ctx(v){ctx=v},get calls(){return calls},advance:n=>now+=n,setOnline:v=>online=v,setBusy:v=>busy=v};
}
test('automatic backup is opt-in, verifies once and skips unchanged data',async()=>{
 const f=fixture();await f.scheduler.poll();assert.equal(f.calls,0);assert.equal(f.scheduler.status().enabled,false);
 await f.scheduler.setEnabled(true,{owner:'a',scope:f.ctx.scope});await f.scheduler.poll();assert.equal(f.calls,1);assert.equal(f.scheduler.status().state,'verified');
 f.advance(600000);await f.scheduler.poll();assert.equal(f.calls,1);assert.ok(f.scheduler.status().lastVerifiedAt);
 assert.ok([...f.values.values()].every(v=>!v.includes('content')&&!v.includes('snapshot')),'Persist metadata only');
});
test('switching accounts revokes prior consent even when returning to a previously enabled account',async()=>{
 const f=fixture();await f.scheduler.poll();await f.scheduler.setEnabled(true,f.ctx);await f.scheduler.poll();
 const a=structuredClone(f.ctx);f.ctx={...f.ctx,owner:'b',email:'b@example.test'};await f.scheduler.poll();assert.equal(f.calls,1);
 f.ctx={...a,snapshot:snapshot(2)};await f.scheduler.poll();assert.equal(f.calls,1,'Returning to A must require fresh consent');assert.equal(f.scheduler.status().enabled,false);
});
test('disabling during an upload cancels it and ignores late success',async()=>{
 let release,started,cancelled=0;const start=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 const f=fixture({cancel:()=>cancelled++,backup:async(s,c)=>{started();await gate;return {status:'complete',owner:c.owner,digest:await cloud.sha(cloud.canonical(s)),verified_at:new Date(1000000).toISOString()};}});
 await f.scheduler.poll();await f.scheduler.setEnabled(true,f.ctx);const running=f.scheduler.poll();await start;
 await f.scheduler.setEnabled(false,f.ctx);release();await running;
 assert.equal(cancelled,1);assert.equal(f.scheduler.status().enabled,false);assert.equal(f.scheduler.status().lastVerifiedAt,null);assert.notEqual(f.scheduler.status().state,'verified');
});
test('network failures use increasing retries and retain unsaved status until verified',async()=>{
 let attempts=0;const f=fixture({backup:async(s,c)=>{attempts++;if(attempts<3)return {status:'failed',code:'NETWORK'};return {status:'complete',owner:c.owner,digest:await cloud.sha(cloud.canonical(s)),verified_at:new Date(f.opts.now()).toISOString()};}});
 await f.scheduler.poll();await f.scheduler.setEnabled(true,f.ctx);await f.scheduler.poll();assert.equal(attempts,1);assert.equal(f.scheduler.status().state,'retrying');assert.equal(f.scheduler.status().dirty,true);
 f.advance(59999);await f.scheduler.poll();assert.equal(attempts,1);f.advance(1);await f.scheduler.poll();assert.equal(attempts,2);
 f.advance(119999);await f.scheduler.poll();assert.equal(attempts,2);f.advance(1);await f.scheduler.poll();assert.equal(attempts,3);assert.equal(f.scheduler.status().state,'verified');
});
test('permission denial pauses automatic attempts until explicit re-enable',async()=>{
 let attempts=0;const f=fixture({backup:async()=>{attempts++;return {status:'failed',code:'HTTP_403'};}});
 await f.scheduler.poll();await f.scheduler.setEnabled(true,f.ctx);await f.scheduler.poll();f.advance(3600000);await f.scheduler.poll();
 assert.equal(attempts,1);assert.equal(f.scheduler.status().state,'paused');
 await f.scheduler.setEnabled(true,f.ctx);await f.scheduler.poll();assert.equal(attempts,2);
});
test('verified manual backup metadata survives restart without a second upload',async()=>{
 const f=fixture();await f.scheduler.poll();const digest=await cloud.sha(cloud.canonical(f.ctx.snapshot));
 f.scheduler.recordVerified({status:'complete',owner:'a',digest,verified_at:new Date(f.opts.now()).toISOString()});await f.scheduler.poll();assert.equal(f.scheduler.status().state,'verified');
 const again=api().createScheduler({...f.opts,onState:()=>{}});await again.poll();assert.equal(again.status().state,'verified');assert.equal(again.status().lastVerifiedAt,f.opts.now());assert.equal(f.calls,0);
 f.ctx.snapshot=snapshot(2);await again.poll();assert.equal(again.status().state,'disabled');assert.equal(again.status().dirty,true);
});
test('logout invalidates a late native inspection and revokes consent before reauthentication',async()=>{
 let hold=false,release,inspecting;const entered=new Promise(r=>inspecting=r);
 const f=fixture({inspect:async()=>{if(hold){inspecting();return new Promise(r=>release=r);}return structuredClone(f.ctx);}});
 await f.scheduler.poll();await f.scheduler.setEnabled(true,f.ctx);hold=true;const running=f.scheduler.poll();await entered;
 f.scheduler.accountChanged(null);release(structuredClone(f.ctx));await running;assert.equal(f.calls,0);assert.equal(f.scheduler.status().state,'signed-out');
 hold=false;f.scheduler.accountChanged('a');await f.scheduler.poll();assert.equal(f.scheduler.status().enabled,false);assert.equal(f.calls,0);
});
test('real scheduler lifecycle checks every 30 seconds and stops without a late reschedule',async()=>{
 const timers=new Map();let timer=0,inspections=0;let f;
 f=fixture({setTimer:(cb,ms)=>{timers.set(++timer,{cb,ms});return timer},clearTimer:id=>timers.delete(id),inspect:async()=>{inspections++;return structuredClone(f.ctx)}});
 await f.scheduler.start();assert.equal(inspections,1);assert.equal(timers.size,1);const t=[...timers.values()][0];assert.equal(t.ms,30000);
 timers.clear();await t.cb();assert.equal(inspections,2);assert.equal(timers.size,1);f.scheduler.stop();assert.equal(timers.size,0);await f.scheduler.poll();assert.equal(f.calls,0);
});
test('failed consent persistence cannot enable uploads in memory',async()=>{
 const f=fixture();await f.scheduler.poll();const original=f.opts.storage.setItem;f.opts.storage.setItem=()=>{throw new Error('No space');};
 await assert.rejects(f.scheduler.setEnabled(true,f.ctx));f.opts.storage.setItem=original;await f.scheduler.poll();assert.equal(f.calls,0);assert.equal(f.scheduler.status().enabled,false);
});
test('automatic authorization is bound to the active owner, storage and captured digest',async()=>{
 let f;f=fixture({backup:async(s,c)=>{const digest=await cloud.sha(cloud.canonical(s));assert.equal(f.scheduler.authorized(c.owner,c.scope,digest),true);assert.equal(f.scheduler.authorized('other',c.scope,digest),false);return {status:'complete',owner:c.owner,digest,verified_at:new Date(f.opts.now()).toISOString()};}});
 await f.scheduler.poll();assert.equal(f.scheduler.context().owner,'a');assert.equal(f.scheduler.authorized('a',f.ctx.scope,'0'.repeat(64)),false);
 await f.scheduler.setEnabled(true,f.ctx);await f.scheduler.poll();assert.equal(f.scheduler.status().state,'verified');assert.equal(f.scheduler.authorized('a',f.ctx.scope,await cloud.sha(cloud.canonical(f.ctx.snapshot))),false);
});
test('controller forwards automatic settings without bypassing verified engine logic',async()=>{
 let settings,exportCalls=0;const input=snapshot(1);const c=cloud.createController({invoke:async()=>{exportCalls++;return input},engine:{backup:async(s,p)=>{settings=p;assert.deepEqual(s,input);return {status:'complete',counts:{personas:0,frameworks:0,anecdotes:0,chats:0,files:2}}}}});
 const result=await c.start({automatic:true,autoOwner:'a',autoScope:'s',snapshot:input});assert.equal(result.status,'complete');assert.equal(settings.automatic,true);assert.equal(settings.autoOwner,'a');assert.equal(exportCalls,0);
});
test('account UI binds automatic policy, truthful diagnostics and the native scoped inspector',()=>{
 const html=require('./ui-source.cjs')();const native=fs.readFileSync(require('node:path').join(__dirname,'../src/main.rs'),'utf8');
 assert.match(html,/auto-backup\.js/);assert.match(html,/id="autoBackupEnabled"/);assert.match(html,/id="cloudBackupSummary"/);assert.match(html,/cloudAutoBackup\??\.accountChanged/);assert.match(html,/inspect_cloud_backup/);assert.match(native,/async fn inspect_cloud_backup/);
 assert.doesNotMatch(html,/supabase_reachable\s*\?\s*'[^']*Supabase Synced/,'Reachability is not proof of backup');
});
test('all-account policy automatically enrolls each verified owner but preserves explicit per-account off',async()=>{
 const f=fixture({defaultEnabled:true});await f.scheduler.poll();assert.equal(f.calls,1);assert.equal(f.scheduler.status().enabled,true);
 await f.scheduler.setEnabled(false,f.scheduler.status());const a=structuredClone(f.ctx);
 f.scheduler.accountChanged('b');f.ctx={...a,owner:'b',email:'b@example.test'};await f.scheduler.poll();assert.equal(f.calls,2);assert.equal(f.scheduler.status().owner,'b');
 f.scheduler.accountChanged('a');f.ctx={...a,snapshot:snapshot(2)};await f.scheduler.poll();assert.equal(f.calls,2);assert.equal(f.scheduler.status().enabled,false);
});
test('native disable fallback survives localStorage failure, logout and scheduler recreation',async()=>{
 const f=fixture();await f.scheduler.poll();await f.scheduler.setEnabled(true,f.ctx);const write=f.opts.storage.setItem;f.opts.storage.setItem=()=>{throw new Error('Quota');};
 await f.scheduler.setEnabled(false,f.scheduler.status());f.scheduler.accountChanged(null);f.opts.storage.setItem=write;
 const next=api().createScheduler({...f.opts});await next.poll();assert.equal(f.calls,0);assert.equal(next.status().enabled,false);
});
test('disabled control remains usable offline and resumption cannot silently re-enable it',async()=>{
 const f=fixture({defaultEnabled:true});await f.scheduler.poll();f.setOnline(false);await f.scheduler.poll();assert.equal(f.scheduler.status().state,'unavailable');
 await f.scheduler.setEnabled(false,f.scheduler.status());f.setOnline(true);f.advance(600000);f.ctx.snapshot=snapshot(2);await f.scheduler.poll();assert.equal(f.calls,1);assert.equal(f.scheduler.status().enabled,false);
});
test('enabling is serialized against a concurrent inspection of the old native off marker',async()=>{
 let release,entered;const start=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const f=fixture();await f.scheduler.poll();await f.scheduler.setEnabled(false,f.ctx);
 const set=f.opts.setPolicy;f.opts.setPolicy=async(disabled,c)=>{if(!disabled){entered();await gate;}return set(disabled,c);};
 const changing=f.scheduler.setEnabled(true,f.ctx);await start;await f.scheduler.poll();release();await changing;assert.equal(f.scheduler.status().enabled,true);await f.scheduler.poll();assert.equal(f.calls,1);
});
test('offline startup has an unconditional native pause action without implying signed-in state',()=>{
 const html=require('./ui-source.cjs')(),native=fs.readFileSync(require('node:path').join(__dirname,'../src/main.rs'),'utf8');
 assert.match(html,/id="btnPauseAutomaticBackups"/);assert.match(html,/pause_current_cloud_auto_backup/);assert.match(native,/async fn pause_current_cloud_auto_backup/);
 const action=html.indexOf('id="btnPauseAutomaticBackups"'),loggedIn=html.indexOf('id="authLoggedInView"');assert.ok(action<loggedIn,'Offline pause must not be hidden by the authenticated view');
});
test('offline durable pause runs after an already-started native enable and remains paused',async()=>{
 let release,entered,disabled=true;const begin=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const f=fixture({setPolicy:async off=>{if(!off){entered();await gate;}disabled=off;},pausePolicy:async()=>{disabled=true;return {owner:'a',scope:'a'.repeat(64),disabled:true};}});
 await f.scheduler.poll();const enabling=f.scheduler.setEnabled(true,f.ctx);await begin;
 const paused=f.scheduler.pauseOffline();release();await Promise.all([enabling,paused]);assert.equal(disabled,true);assert.equal(f.scheduler.status().enabled,false);await f.scheduler.poll();assert.equal(f.calls,0);
});
