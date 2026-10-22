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

const port = Number(process.env.AXION_CDP_PORT || 43825);

async function connect() {
  let pages;
  for (let attempt = 0; attempt < 200; attempt++) {
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
  const events = [];
  function send(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('CDP timed out for ' + method));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method) { events.push(m); if (events.length>500) events.shift(); }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.error) p.reject(new Error(m.error.message || 'CDP error'));
    else p.resolve(m.result);
  });

  await send('Page.enable');
  await send('Runtime.enable');

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      allowUnsafeEvalBlockedByCSP: false
    });
    if (r.exceptionDetails) {
      throw new Error('Evaluation exception: ' + JSON.stringify(r.exceptionDetails));
    }
    return r.result.value;
  }

  return {
    evaluate, send, events,
    close() {
      for (const p of pending.values()) clearTimeout(p.timer);
      ws.close();
    }
  };
}


module.exports={connect};
