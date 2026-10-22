// Native WebView2 smoke test. Uses real IPC; never mocks authentication.
import assert from 'node:assert/strict';
const port = Number(process.env.AXION_CDP_PORT || 43823);
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find(t => t.type === 'page' && t.title === 'Axion Mind');
assert.ok(target, 'Axion Mind WebView target must exist');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r,j) => { ws.addEventListener('open',r,{once:true}); ws.addEventListener('error',j,{once:true}); });
let id = 0;
const pending = new Map();
ws.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const {resolve,reject} = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
function send(method,params) {
  return new Promise((resolve,reject) => { const seq=++id; pending.set(seq,{resolve,reject}); ws.send(JSON.stringify({id:seq,method,params})); });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const evidence = [];
try {
  assert.equal(await evaluate("Boolean(window.__TAURI_INTERNALS__?.invoke)"),true);
  evidence.push('Real Tauri IPC detected');
  assert.equal(await evaluate("typeof document.getElementById('btnGoogleSignIn').onclick"),'function');
  evidence.push('Google button handler bound in release WebView');
  assert.equal(await evaluate("document.getElementById('authPassword').value === ''"),true);
  evidence.push('No prefilled password');
  await evaluate("document.getElementById('btnOpenAuthModal').click()");
  for(let n=0;n<30 && !(await evaluate("document.getElementById('authSyncModal').classList.contains('open')"));n++) await sleep(200);
  assert.equal(await evaluate("document.getElementById('authSyncModal').classList.contains('open')"),true);
  evidence.push('Account button opens modal using real native session lookup');
  await evaluate("document.getElementById('btnGoogleSignIn').click()");
  let feedback = '';
  for(let n=0;n<100;n++) {
    await sleep(200);
    feedback=await evaluate("document.getElementById('authFeedback').textContent");
    if(await evaluate("!document.getElementById('btnGoogleSignIn').disabled")) break;
  }
  assert.match(feedback,/Google sign-in is not enabled in Supabase/);
  evidence.push('Real native preflight displays live provider-disabled error');
  assert.equal(await evaluate("document.getElementById('accountUserEmail').textContent"),'Local / Sign In');
  evidence.push('Failure does not falsely authenticate');
  await evaluate("document.getElementById('btnCloseAuthModal').click()");
  assert.equal(await evaluate("document.getElementById('authSyncModal').classList.contains('open')"),false);
  evidence.push('Account modal X closes');
  await evaluate("document.getElementById('btnOpenSettings').click();document.getElementById('btnCancelSettings').click()");
  assert.equal(await evaluate("document.getElementById('connectionSettingsModal').classList.contains('open')"),false);
  evidence.push('Settings Cancel still closes');
  console.log(JSON.stringify({status:'passed',scope:'Native release WebView, real IPC, provider disabled (not a successful Google login)',evidence,feedback},null,2));
} finally { ws.close(); }
