const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
test('knowledge IPC derives local authority and exposes explicit memory lifecycle',()=>{
 const src=fs.readFileSync(require('node:path').join(__dirname,'../src/main.rs'),'utf8');
 for(const name of ['knowledge_propose','knowledge_approve','knowledge_correct','knowledge_forget','knowledge_list']) assert.match(src,new RegExp('fn '+name+'\\('));
 assert.match(src,/backup::scope_id\(&root\)/);
 assert.match(src,/knowledge::Store::open/);
 for(const name of ['knowledge_propose','knowledge_approve','knowledge_correct','knowledge_forget','knowledge_list']) assert.match(src,new RegExp('            '+name+','));
});
