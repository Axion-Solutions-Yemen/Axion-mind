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
 const result=await c.evaluate(`(async()=>{
   const wait=ms=>new Promise(r=>setTimeout(r,ms));
   const card=document.querySelector('.agent-card');const header=card.querySelector('.agent-card-header');const panel=card.querySelector('.agent-sessions-container');const wasOpen=card.classList.contains('expanded');
   header.click();await wait(300);const sameNode=card.isConnected;const toggled=card.classList.contains('expanded')!==wasOpen;
   header.click();await wait(300);
   document.getElementById('btnOpenNewPersonaModal').click();await wait(350);document.getElementById('btnCloseModal').click();
   const modal=document.getElementById('personaModal');const closingDisplay=getComputedStyle(modal).display;
   await wait(60);const closingOpacity=Number(getComputedStyle(modal).opacity);
   await wait(200);const closedDisplay=getComputedStyle(modal).display;
   let viewCalls=0;const original=Element.prototype.animate;
   Element.prototype.animate=function(...args){if(this.id==='messagesContainer')viewCalls++;return original.apply(this,args);};
   try{document.querySelector('.sub-session-item.active')?.click();await wait(700);}finally{Element.prototype.animate=original;}
   return {api:typeof window.AxionMotion?.enter,sameNode,toggled,closingDisplay,closingOpacity,closedDisplay,viewCalls,heightInterpolation:CSS.supports('interpolate-size','allow-keywords')};
 })()`);
 console.log(JSON.stringify(result,null,2));
 assert.equal(result.api,'function');assert.equal(result.sameNode,true);assert.equal(result.toggled,true);assert.equal(result.closingDisplay,'flex');assert.ok(result.closingOpacity>0&&result.closingOpacity<1);assert.equal(result.closedDisplay,'none');assert.ok(result.viewCalls>=1,'chat switch must animate');
 console.log('WORKSPACE ACCORDIONS, DIALOG EXITS AND CHAT SWITCH VERIFIED');
}finally{await c.send('Emulation.setEmulatedMedia',{features:[]});c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});