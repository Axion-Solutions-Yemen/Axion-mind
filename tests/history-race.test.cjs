const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=require('./ui-source.cjs')().replace(/\r\n/g,'\n');
test('actual history loader ignores reverse-order responses across 30 schedules',async()=>{
 const source=html.slice(html.indexOf('    async function selectItem('),html.indexOf('    // Render messages in view'));
 for(let i=0;i<30;i++){
  const pending={};const rendered=[];
  const element={textContent:'',style:{},classList:{remove(){}},focus(){}};
  const ctx=vm.createContext({personas:[],hermesSessions:[],activeMode:'persona',activeId:'a',activeAgentId:'',historyLoadEpoch:0,
   activePersonaAvatarEl:element,activePersonaNameEl:element,activePersonaTitleEl:element,btnEditPersonaEl:element,btnClearChatEl:element,chatInputEl:element,
   document:{getElementById:()=>element,querySelector:()=>null},window:{AxionMotion:{enter(){}}},messagesContainerEl:{},renderUnifiedSidebar(){},console,
   invoke:(cmd,args)=>new Promise(resolve=>{pending[args.sessionId]=resolve;}),renderMessages:(messages,mode,id)=>rendered.push(id)});
  vm.runInContext(source,ctx);const a=ctx.selectItem('persona','a');const b=ctx.selectItem('persona','b');
  pending.b([]);await b;pending.a([]);await a;
  assert.deepEqual(rendered,['b'],'stale response overwrote selected chat at schedule '+i);
 }
});
