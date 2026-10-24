const test=require('node:test'),assert=require('node:assert/strict');
const api=()=>require('../ui/conference.js');
function fixture(){
 const calls=[],pending={},changes=[]; let scope='scope-a';
 const room={id:'room-a',topic:'Pricing',participants:[],transcript:[],status:'idle'};
 const invoke=async(cmd,args)=>{calls.push({cmd,args});if(cmd==='get_chat_storage_scope')return scope;
  if(cmd==='list_conference_rooms')return [room];if(cmd==='get_conference_room')return new Promise(r=>pending[args.roomId]=r);
  if(cmd==='stream_conference_round')return new Promise((resolve,reject)=>{pending.run={resolve,reject,args};});
  if(cmd==='create_conference_room')return {...room,topic:args.topic};};
 const c=api().createController({invoke,channel:()=>({}),requestId:()=> 'request-a',onChange:s=>changes.push(s)});
 return {c,calls,pending,room,changes,setScope:s=>scope=s};
}
test('conference opening ignores stale history replies',async()=>{
 const f=fixture();await f.c.refresh();const a=f.c.open('a');await new Promise(setImmediate);const b=f.c.open('b');await new Promise(setImmediate);
 f.pending.b({...f.room,id:'b'});await b;f.pending.a({...f.room,id:'a'});await a;assert.equal(f.c.state().room.id,'b');
});
test('round uses native scoped orchestration and retains Stop until it settles',async()=>{
 const f=fixture();await f.c.refresh();const opening=f.c.open('room-a');await new Promise(setImmediate);f.pending['room-a'](f.room);await opening;
 const run=f.c.send('Discuss');await new Promise(setImmediate);assert.equal(f.c.state().busy,true);
 const call=f.calls.find(c=>c.cmd==='stream_conference_round');assert.equal(call.args.scope,'scope-a');assert.equal(call.args.message,'Discuss');
 assert.deepEqual(Object.keys(call.args).sort(),['message','onEvent','requestId','roomId','scope'].sort());
 call.args.onEvent.onmessage({type:'room',room:{...f.room,status:'running',transcript:[{content:'partial',speaker_id:'a'}]}});
 assert.equal(f.c.state().room.transcript[0].content,'partial');await f.c.stop();assert.equal(f.c.state().busy,true);
 assert.equal(f.calls.at(-1).cmd,'cancel_conference_round');f.pending.run.resolve({...f.room,transcript:[{content:'partial',status:'cancelled'}]});await run;
 assert.equal(f.c.state().busy,false);assert.equal(f.c.state().room.transcript[0].status,'cancelled');
});
test('native validation errors retain the draft and never masquerade as success',async()=>{
 const f=fixture();await f.c.refresh();const opening=f.c.open('room-a');await new Promise(setImmediate);f.pending['room-a'](f.room);await opening;
 const run=f.c.send('@Alex explain');await new Promise(setImmediate);f.pending.run.reject('Ambiguous mention');assert.equal(await run,false);
 assert.match(f.c.state().error,/Ambiguous mention/);assert.equal(f.c.state().busy,false);
});
test('storage scope changes discard prior-room selection and reject stale streaming views',async()=>{
 const f=fixture();await f.c.refresh();const opening=f.c.open('room-a');await new Promise(setImmediate);f.pending['room-a'](f.room);await opening;
 const run=f.c.send('Discuss');await new Promise(setImmediate);f.setScope('scope-b');await f.c.refresh();
 f.pending.run.args.onEvent.onmessage({type:'room',room:{...f.room,topic:'Old private scope'}});assert.equal(f.c.state().room,null);
 f.pending.run.resolve(f.room);await run;assert.equal(f.c.state().room,null);
});

test('reopened native running rounds retain Stop after a WebView reload',async()=>{
 const f=fixture();f.room.status='running';f.room.active_request_id='native-request';await f.c.refresh();
 const opening=f.c.open('room-a');await new Promise(setImmediate);f.pending['room-a'](f.room);await opening;
 assert.equal(f.c.state().busy,true);assert.equal(f.c.state().streamAttached,false);assert.equal(await f.c.send('duplicate'),false);
 await f.c.stop();assert.equal(f.calls.at(-1).args.requestId,'native-request');assert.equal(f.c.state().stopping,true);
 f.room.status='cancelled';f.room.active_request_id=null;await f.c.refresh();assert.equal(f.c.state().busy,false);assert.equal(f.c.state().stopping,false);
});
