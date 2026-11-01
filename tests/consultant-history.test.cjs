const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('consultant IPC carries immutable conversation identity to backend history loader',()=>{
 const ui=read('ui/chat-app.js');const main=read('src/main.rs');const llm=read('src/llm.rs');
 assert.match(ui,/personaId:persona\?\.id \|\| origin\.id,sessionId:origin\.id/);
 assert.match(main,/llm::stream_persona_chat\(&persona_id, &session_id,/);
 assert.match(llm,/load_chat\(session_id\)/);
 assert.match(llm,/list_agent_sessions\(persona_id\)/);
 assert.doesNotMatch(llm,/"messages": \[\s*\{ "role": "system", "content": augmented_system_prompt \},\s*\{ "role": "user", "content": message \}\s*\]/);
});
