const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=require('./ui-source.cjs')().replace(/\r\n/g,'\n');
test('answer render follows latest text even when a chunk exceeds the bottom threshold',()=>{
 const start=html.indexOf('onRender: (preparedMarkdown, meta) => {');
 const end=html.indexOf('\n        },\n        onDone:',start);
 const body=html.slice(start+'onRender: (preparedMarkdown, meta) => {'.length,end);
 const container={scrollHeight:1800,scrollTop:0,clientHeight:400};
 let called=0;
 const render=new Function('preparedMarkdown','meta','isFirstToken','thinkingCtrl','timerInterval','liveThinkingEl','marked','responseTextEl','scrollTracker','messagesContainerEl','btnScrollBottomEl','isOriginVisible',body);
 render('new chunk',{active:true},false,{},null,null,{parse:s=>s},{innerHTML:''},{isNearBottom:()=>false,scrollToBottom:c=>{called++;c.scrollTop=c.scrollHeight;}},container,{classList:{remove(){},add(){}}},()=>true);
 assert.equal(called,1,'new streamed text must scroll without a near-bottom gate');
});
test('thinking render follows latest inner and outer text',()=>{
 const start=html.indexOf('onRender: (raw, active) => {');
 const end=html.indexOf('\n        }\n      });',start);
 const body=html.slice(start+'onRender: (raw, active) => {'.length,end);
 const inner={scrollHeight:800,scrollTop:0};let scrolled=0;
 const render=new Function('raw','active','thinkingPanel','thinkingBody','thinkingSummary','scrollToBottom','isOriginVisible',body);
 render('new thinking',true,{},inner,{},()=>scrolled++,()=>true);
 assert.equal(inner.scrollTop,800);assert.equal(scrolled,1);
});
