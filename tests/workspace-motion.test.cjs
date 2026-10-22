const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
test('workspace motion cancels old view animation and respects live reduced-motion preference',()=>{
 const file=path.join(__dirname,'../ui/workspace-motion.js');
 assert.ok(fs.existsSync(file),'workspace motion controller must exist');
 const motion=require(file);let reduced=false;global.matchMedia=()=>({matches:reduced});
 const calls=[];let cancels=0;
 const el={animate:(frames,options)=>{calls.push({frames,options});return {cancel:()=>cancels++,finished:Promise.resolve()};}};
 try{motion.enter(el);motion.enter(el);assert.equal(calls.length,2);assert.equal(cancels,1);reduced=true;motion.enter(el);assert.equal(calls.length,2);assert.equal(cancels,2);}
 finally{delete global.matchMedia;}
});
test('whole workspace covers startup, navigation, forms, accordions, and modal exits',()=>{
 const html=require('./ui-source.cjs')();
 const css=fs.readFileSync(path.join(__dirname,'../ui/premium-motion.css'),'utf8');
 assert.ok(html.includes('AxionMotion.enter(messagesContainerEl)'),'chat switching must animate once at the container boundary');
 for(const selector of ['button:not(:disabled)', '.form-input', '.form-textarea','.search-input','.agent-sessions-container','.tool-card-body','@starting-style','allow-discrete'])assert.ok(css.includes(selector),'Missing motion coverage: '+selector);
 assert.ok(!html.includes("expandedAgents.add(agent.id);\n            }\n            renderUnifiedSidebar();"),'accordion toggles should not rebuild sidebar DOM');
});
