/* Verified scheduled backup. Persist only policy and receipt metadata, never customer content or tokens. */
(function(root,factory){const common=typeof module==='object'&&module.exports;const api=factory(common?require('./cloud-sync.js'):root.AxionCloudSync);if(common)module.exports=api;else root.AxionAutoBackup=api;})(typeof globalThis!=='undefined'?globalThis:this,function(cloud){
'use strict';
function createScheduler(opts){
 const now=opts.now||Date.now,interval=opts.intervalMs||300000,defaultEnabled=opts.defaultEnabled===true;
 const denied=new Set(),metadataKey=c=>'axion_backup_v2:'+c.owner+':'+c.scope;
 let changing=false;let epoch=0,failures=0,blocked=false,receipt=null,visibleOwner,observedDigest;
 let ctx=null,key=null,prefs=null,pending=false,nextAttempt=0,last={state:'checking',enabled:false,dirty:null};
 function publish(state,extra={}){last={state,owner:ctx?.owner,email:ctx?.email,scope:ctx?.scope,enabled:!!prefs?.enabled,lastVerifiedAt:prefs?.lastVerifiedAt||null,nextAttemptAt:nextAttempt,...extra};try{opts.onState?.({...last});}catch(_){}return {...last};}
 function decode(k){try{return JSON.parse(opts.storage.getItem(k)||'null');}catch(_){return null;}}
 function clean(c,v){
  const owned=v?.owner===c.owner&&v?.scope===c.scope,choice=owned&&v?.userChoice===true;
  const valid=owned&&/^[a-f0-9]{64}$/.test(v?.lastDigest||'')&&Number.isFinite(v?.lastVerifiedAt)&&v.lastVerifiedAt>0&&v.lastVerifiedAt<=now()+1000;
  return {version:1,owner:c.owner,scope:c.scope,userChoice:choice,enabled:choice?v.enabled===true:defaultEnabled,lastDigest:valid?v.lastDigest:null,lastVerifiedAt:valid?v.lastVerifiedAt:null};
 }
 function save(){opts.storage.setItem(key,JSON.stringify(prefs));}
 function load(c){
  if(!/^[\w-]+$/.test(c.owner)||!/^[a-f0-9]{64}$/.test(c.scope))throw new Error('Invalid backup identity');
  const nextKey=metadataKey(c),next=clean(c,decode(nextKey)),previous=opts.storage.getItem('axion_backup_v2_active');
  if(!defaultEnabled&&previous!==nextKey){
   next.enabled=false;
   if(/^axion_backup_v2:[\w-]+:[a-f0-9]{64}$/.test(previous||'')){
    denied.add(previous);const [,owner,scope]=previous.split(':'),old=clean({owner,scope},decode(previous));old.enabled=false;old.userChoice=true;
    opts.storage.setItem(previous,JSON.stringify(old));
   }
  }
  if(c.autoDisabled===true||denied.has(nextKey))next.enabled=false;
  // Commit the in-memory binding only after all fallible persistence succeeds.
  opts.storage.setItem(nextKey,JSON.stringify(next));opts.storage.setItem('axion_backup_v2_active',nextKey);
  key=nextKey;prefs=next;nextAttempt=next.lastVerifiedAt?next.lastVerifiedAt+interval:0;failures=0;blocked=false;
 }
 async function poll(){
  if(pending||changing)return {...last};pending=true;let uploading=false;const generation=epoch,current=()=>generation===epoch;
  try{
   const found=await opts.inspect();if(!current())return {...last};
   if(!found){accountChanged(null);return publish('signed-out',{dirty:null});}
   if(!ctx||metadataKey(found)!==key)load(found);ctx=found;visibleOwner=found.owner;
   if(found.autoDisabled===true||denied.has(key))prefs.enabled=false;
   const digest=await cloud.sha(cloud.canonical(cloud.validateSnapshot(ctx.snapshot)));if(!current())return {...last};observedDigest=digest;
   if(receipt){const r=receipt;receipt=null;const at=Date.parse(r.verified_at);if(r.owner===ctx.owner&&r.digest===digest&&Number.isFinite(at)&&at>0&&at<=now()+1000){prefs.lastDigest=digest;prefs.lastVerifiedAt=at;save();nextAttempt=at+interval;}}
   const dirty=digest!==prefs.lastDigest;
   if(!dirty)return publish('verified',{dirty:false});
   if(!prefs.enabled)return publish('disabled',{dirty:true});
   if(blocked)return publish('paused',{dirty:true});
   if(now()<nextAttempt||opts.isBusy?.())return publish(failures?'retrying':'pending',{dirty:true});
   nextAttempt=now()+interval;uploading=true;publish('backing-up',{dirty:true});
   const result=await opts.backup(ctx.snapshot,ctx);if(!current())return {...last};
   const at=Date.parse(result?.verified_at);
   if(result?.status!=='complete'||result.owner!==ctx.owner||result.digest!==digest||!Number.isFinite(at)||at<=0||at>now()+1000)throw Object.assign(new Error('No verified complete backup'),{code:result?.code||'INCOMPLETE'});
   prefs.lastDigest=digest;prefs.lastVerifiedAt=at;save();failures=0;receipt=null;return publish('verified',{dirty:false});
  }catch(error){
   if(!current())return {...last};if(!uploading)return publish('unavailable',{dirty:null});
   failures++;const retry=/^(NETWORK|TIMEOUT|LOCAL_CHANGED|HTTP_429|HTTP_5\d\d)$/.test(error?.code||'');
   if(retry){nextAttempt=now()+Math.min(900000,60000*2**Math.min(failures-1,4));return publish('retrying',{dirty:true,code:error.code});}
   blocked=true;return publish('paused',{dirty:true,code:error?.code||'INCOMPLETE'});
  }finally{pending=false;}
 }
 function accountChanged(owner){
  const previous=visibleOwner===undefined?ctx?.owner:visibleOwner;
  if(previous===owner)return;visibleOwner=owner;if(previous===undefined&&owner)return;
  epoch++;receipt=null;opts.cancel?.();
  if(!defaultEnabled){
   const active=key||opts.storage.getItem('axion_backup_v2_active');
   if(/^axion_backup_v2:[\w-]+:[a-f0-9]{64}$/.test(active||'')){
    denied.add(active);const [,id,scope]=active.split(':'),revoked=clean({owner:id,scope},decode(active));revoked.enabled=false;revoked.userChoice=true;
    try{opts.storage.setItem(active,JSON.stringify(revoked));}catch(_){}
    Promise.resolve().then(()=>opts.setPolicy?.(true,{owner:id,scope})).catch(()=>{});
   }
  }
  ctx=null;prefs=null;key=null;publish(owner?'checking':'signed-out',{dirty:null});
 }
 async function applyEnabled(enabled,expected){
  if(!ctx||ctx.owner!==expected?.owner||ctx.scope!==expected?.scope)throw new Error('Account or storage changed; use the current account.');
  const identity={owner:ctx.owner,scope:ctx.scope},target=key,generation=++epoch;
  prefs.enabled=false;prefs.userChoice=true;nextAttempt=0;failures=0;blocked=false;
  if(!enabled){
   denied.add(target);opts.cancel?.();let localSaved=false,nativeSaved=false;
   try{save();localSaved=true;}catch(_){}
   try{if(opts.setPolicy){await opts.setPolicy(true,identity);nativeSaved=true;}}catch(_){}
   if(generation!==epoch)return;
   if(!localSaved&&!nativeSaved){publish('paused',{dirty:last.dirty,persistenceError:true});throw new Error('Paused for this run only: the off switch could not be saved. Do not rely on this pause surviving restart.');}
   return publish('disabled',{dirty:last.dirty});
  }
  try{
   prefs.enabled=true;save();
   await opts.setPolicy?.(false,identity);if(generation!==epoch)return;
   denied.delete(target);prefs.enabled=true;return publish('pending',{dirty:last.dirty});
  }catch(_){
   denied.add(target);if(prefs&&key===target){prefs.enabled=false;try{save();}catch(_){}}
   try{await opts.setPolicy?.(true,identity);}catch(_){}
   if(generation===epoch)publish('unavailable',{dirty:null});
   throw new Error('Cannot save automatic-backup settings. Uploads are paused; check storage permissions.');
  }
 }
 let policyTask=Promise.resolve();
 function policyJob(action){const task=policyTask.then(action);policyTask=task.catch(()=>{});return task;}
 async function setEnabled(enabled,expected){return policyJob(async()=>{changing=true;try{return await applyEnabled(enabled,expected);}finally{changing=false;}});}
 async function pauseOffline(){return policyJob(async()=>{changing=true;try{epoch++;opts.cancel?.();const identity=await opts.pausePolicy();pauseKnown(identity);return identity;}finally{changing=false;}});} 
 function pauseKnown(identity){epoch++;opts.cancel?.();const target=metadataKey(identity);denied.add(target);if(key===target&&prefs){prefs.enabled=false;prefs.userChoice=true;try{save();}catch(_){}publish('disabled',{dirty:last.dirty});}}
 let running=false,timer=null,runEpoch=0;const schedule=opts.setTimer||setTimeout,unschedule=opts.clearTimer||clearTimeout;
 async function loop(run){await poll();if(running&&run===runEpoch)timer=schedule(()=>loop(run),opts.pollMs||30000);}
 return {poll,accountChanged,setEnabled,pauseOffline,pauseKnown,context:()=>ctx&&!['unavailable','checking','signed-out'].includes(last.state)?structuredClone(ctx):null,
  authorized:(owner,scope,digest)=>!!prefs?.enabled&&!blocked&&!denied.has(key)&&last.state==='backing-up'&&ctx?.owner===owner&&ctx?.scope===scope&&observedDigest===digest,
  async start(){if(running)return {...last};running=true;return loop(++runEpoch);},
  stop(){running=false;epoch++;runEpoch++;if(timer!==null)unschedule(timer);timer=null;opts.cancel?.();},
  status:()=>({...last}),recordVerified(result){if(result?.status==='complete'&&/^[a-f0-9]{64}$/.test(result.digest||''))receipt={owner:result.owner,digest:result.digest,verified_at:result.verified_at};}};
}
return {createScheduler};
});
