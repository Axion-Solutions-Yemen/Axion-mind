const test = require('node:test');
const assert = require('node:assert/strict');
const {prepare, validateSnapshot} = require('../ui/cloud-sync.js');

function room() {
  return {version:1,id:'room-1',topic:'Deal review',created_at:'2026-10-24T00:00:00Z',updated_at:'2026-10-24T00:00:01Z',round:1,status:'cancelled',active_request_id:null,
    participants:[{id:'expert',kind:'persona',name:'Expert',model:'fixture/exact-model',provider:'custom_gateway'}],
    transcript:[{id:'turn-1',round:1,request_id:'request-1',speaker_id:'expert',speaker_name:'Expert',model:'fixture/exact-model',provider:'custom_gateway',kind:'persona',content:'Partial analysis',thinking:'Partial reasoning',status:'cancelled',error:null,created_at:'2026-10-24T00:00:00Z',completed_at:'2026-10-24T00:00:01Z'}]};
}
function snapshot() {return {version:1,files:{'personas.json':'[{"id":"expert","name":"Expert"}]','chats/expert_1.json':'[]\r\n','conferences/room-1.json':JSON.stringify(room(),null,2)+'\r\n'}};}

test('cloud snapshot preserves conference transcript and exact models without inventing a persona chat',async()=>{
  const input=snapshot();const plan=await prepare(input,'fixture-owner');
  assert.deepEqual(plan.snapshot,input);
  assert.equal(plan.chats.length,1);
  assert.equal(plan.chats[0].session_id,'expert_1');
  assert.ok(plan.manifest.some(file=>file.path==='conferences/room-1.json'));
  assert.equal(plan.counts.files,3);
  assert.equal(plan.counts.conferences,1);
});

test('cloud backup rejects traversal, mismatched identities, and malformed conference contents',()=>{
  const cases=[['conferences/../outside.json',room()],['conferences/nested/room-1.json',room()],['conferences/wrong-id.json',room()],['conferences/room-1.json',[]],['conferences/room-1.json',{version:1,id:'room-1',topic:'Deal review'}],['conferences/room-1.json',{...room(),transcript:[{role:'assistant'}]}]];
  for(const [name,value] of cases){const input={version:1,files:{'personas.json':'[]',[name]:JSON.stringify(value)}};assert.throws(()=>validateSnapshot(input),undefined,name);}
});

test('older backup counts stay byte-for-byte compatible when no conferences exist',async()=>{
  const plan=await prepare({version:1,files:{'personas.json':'[]'}},'fixture-owner');
  assert.deepEqual(plan.counts,{personas:0,chats:0,frameworks:0,anecdotes:0,files:1,knowledgeFiles:0,sessionFiles:0});
});
