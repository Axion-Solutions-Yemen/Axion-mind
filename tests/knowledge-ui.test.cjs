const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
test('Arabic knowledge controls use explicit review and safe text nodes',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../ui/knowledge.js'),'utf8');
 for(const op of ['knowledge_propose','knowledge_approve','knowledge_correct','knowledge_forget','knowledge_list']) assert.ok(src.includes(op));
 assert.ok(src.includes('confirm('));assert.ok(src.includes('textContent'));assert.ok(src.includes('معرفتي'));
 assert.doesNotMatch(src,/innerHTML/);
 const html=fs.readFileSync(path.join(__dirname,'../ui/index.html'),'utf8');assert.ok(html.includes('src="knowledge.js"'));
});
