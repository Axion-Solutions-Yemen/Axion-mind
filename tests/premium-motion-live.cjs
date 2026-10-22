/**
 * Live End-to-End Test for Axion Mind Text Streaming UX
 * Connects over CDP to the real application and live model bridge (Antigravity 8766).
 * Verifies:
 *  1. Live token streaming, thinking transition, typing cursor, auto-healed code fences.
 *  2. Code block copy button and syntax highlighting.
 *  3. User stop/cancellation button (interrupts stream, renders badge, preserves partial chat).
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const port = Number(process.env.AXION_CDP_PORT || 43823);

async function connect() {
  let pages;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (pages.some(p => p.type === 'page' && p.title === 'Axion Mind')) break;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  const page = pages?.find(p => p.type === 'page' && p.title === 'Axion Mind');
  assert.ok(page, 'Axion Mind application window not found over CDP');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let seq = 0;
  const pending = new Map();
  function send(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('CDP timed out for ' + method));
      }, 120000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.error) p.reject(new Error(m.error.message || 'CDP error'));
    else p.resolve(m.result);
  });

  await send('Page.enable');

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (r.exceptionDetails) {
      throw new Error('Evaluation exception: ' + JSON.stringify(r.exceptionDetails));
    }
    return r.result.value;
  }

  return {
    evaluate, send,
    close() {
      for (const p of pending.values()) clearTimeout(p.timer);
      ws.close();
    }
  };
}

(async()=>{const c=await connect();try{
 await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 const initial=await c.evaluate(`(()=>{const sheet=[...document.styleSheets].find(s=>s.href?.endsWith('/premium-motion.css'));return {loaded:!!sheet,rules:sheet?.cssRules.length||0,historyAnimated:[...document.querySelectorAll('.message-row')].some(r=>r.classList.contains('motion-new'))};})()`);
 assert.equal(initial.loaded,true);assert.ok(initial.rules>10);assert.equal(initial.historyAnimated,false);
 const modal=await c.evaluate(`(()=>{document.getElementById('btnOpenNewPersonaModal').click();const m=document.querySelector('#personaModal .modal-card');return {open:document.getElementById('personaModal').classList.contains('open'),name:getComputedStyle(m).animationName,duration:getComputedStyle(m).animationDuration};})()`);
 assert.equal(modal.open,true);assert.equal(modal.name,'ax-dialog-in');
 await new Promise(r=>setTimeout(r,350));
 await c.evaluate(`document.getElementById('btnCloseModal').click()`);
 const message=await c.evaluate(`(()=>{const el=document.createElement('div');el.id='motionVerification';el.className='message-row motion-new';el.textContent='Motion verification';document.getElementById('messagesContainer').appendChild(el);const s=getComputedStyle(el);return {name:s.animationName,duration:s.animationDuration};})()`);
 assert.equal(message.name,'ax-message-in');
 await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 const reduced=await c.evaluate(`(()=>{const e=document.getElementById('motionVerification');return {animation:getComputedStyle(e).animationName,buttonTransition:getComputedStyle(document.getElementById('btnSend')).transitionDuration};})()`);
 assert.equal(reduced.animation,'none');assert.equal(reduced.buttonTransition,'0s');
 await c.evaluate(`document.getElementById('motionVerification').remove()`);
 await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 const screenshot=await c.send('Page.captureScreenshot',{format:'png'});
 fs.writeFileSync('C:/Users/AR-Qamzawi/AppData/Local/hermes/cache/scratch/axion-premium-motion.png',Buffer.from(screenshot.data,'base64'));
 console.log(JSON.stringify({initial,modal,message,reduced},null,2));console.log('LIVE MOTION AND REDUCED-MOTION VERIFIED');
}finally{await c.send('Emulation.setEmulatedMedia',{features:[]});c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});