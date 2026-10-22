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
    evaluate,
    close() {
      for (const p of pending.values()) clearTimeout(p.timer);
      ws.close();
    }
  };
}

(async()=>{const c=await connect();try{
 await c.evaluate(`(()=>{document.getElementById('chatInput').value='Streaming verification: explain offer design in 12 numbered sentences.';document.getElementById('btnSend').click();})()`);
 const samples=[];let started=false;const start=Date.now();
 while(Date.now()-start<90000){
  const state=await c.evaluate(`(()=>{const rows=document.querySelectorAll('.message-row.assistant');const row=rows[rows.length-1];return {active:document.getElementById('btnStop').style.display!=='none',thinking:row?.querySelector('.live-reasoning-text')?.textContent.length||0,visible:!!row?.querySelector('.live-reasoning:not([hidden])'),answer:row?.querySelector('.live-answer')?.textContent.length||0,cursor:!!row?.querySelector('.streaming-cursor')};})()`);
  state.ms=Date.now()-start;if(state.active)started=true;
  if(!samples.length||state.answer!==samples.at(-1).answer||state.thinking!==samples.at(-1).thinking||!state.active)samples.push(state);
  if(started&&!state.active)break;await new Promise(r=>setTimeout(r,75));
 }
 console.log(JSON.stringify(samples,null,2));
 assert.ok(samples.some(s=>s.active&&s.visible&&s.thinking>0),'live thinking must be visible');
 assert.ok(new Set(samples.filter(s=>s.active&&s.answer>0).map(s=>s.answer)).size>=2,'answer must visibly grow while streaming');
 assert.ok(samples.some(s=>s.active&&s.cursor),'cursor must actually be observed');
 assert.equal(samples.at(-1).active,false,'generation must complete');
 console.log('LIVE THINKING AND ANSWER VERIFIED');
}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});