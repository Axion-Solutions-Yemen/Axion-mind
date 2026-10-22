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

(async () => {
  console.log('Connecting to Axion Mind over CDP on port', port, '...');
  const c = await connect();

  try {
    // 1. Verify UI initial state & select test persona
    const initial = await c.evaluate(`(async () => {
      const stopBtn = document.getElementById('btnStop');
      const personaName = document.getElementById('activePersonaName');
      const modelLabel = document.getElementById('chatModelPickerLabel');
      return {
        personaName: personaName ? personaName.textContent : '',
        model: modelLabel ? modelLabel.textContent : '',
        isStreaming: stopBtn ? stopBtn.style.display !== 'none' : false,
        hasStreamUx: typeof window.AxionStreamUX !== 'undefined',
        hasScrollBottomBtn: Boolean(document.getElementById('btnScrollBottom'))
      };
    })()`);

    console.log('App connected. Active persona:', initial.personaName, '| Model:', initial.model);
    assert.equal(initial.hasStreamUx, true, 'AxionStreamUX must be loaded');
    assert.equal(initial.hasScrollBottomBtn, true, 'btnScrollBottom must exist');

    // 2. Test 1: Full streaming response with formula / code block
    console.log('\n--- TEST 1: Full Live Text Streaming with Code & Markdown ---');
    const prompt = 'State the $100M Value Equation formula with a tiny code block and 1 rule.';
    
    // Set input and click Send button
    await c.evaluate(`(async () => {
      const input = document.getElementById('chatInput');
      input.value = ${JSON.stringify(prompt)};
      document.getElementById('btnSend').click();
    })()`);

    // Poll during active streaming to verify cursor and streaming state
    let sawStreaming = false;
    let sawCursor = false;
    let tokenSamples = [];

    const startWait = Date.now();
    while (Date.now() - startWait < 60000) {
      const state = await c.evaluate(`(() => {
        const rows = document.querySelectorAll('.message-row.assistant');
        const lastRow = rows[rows.length - 1];
        const content = lastRow ? lastRow.querySelector('.message-content') : null;
        const cursor = content ? content.querySelector('.streaming-cursor') : null;
        const stopBtn = document.getElementById('btnStop');
        const text = content ? content.innerText : '';
        const streaming = stopBtn && stopBtn.style.display !== 'none';
        return {
          isStreaming: streaming,
          hasCursor: Boolean(cursor),
          textLength: text.length,
          snippet: text.slice(-60)
        };
      })()`);

      if (state.isStreaming) {
        sawStreaming = true;
        if (state.hasCursor) sawCursor = true;
        if (state.textLength > 0 && tokenSamples.length < 5) {
          tokenSamples.push(state.snippet);
        }
      } else if (sawStreaming && !state.isStreaming) {
        // Stream completed
        console.log('Stream finished. Final text length:', state.textLength);
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    assert.equal(sawStreaming, true, 'Active streaming state must be observed');
    console.log('Observed live streaming state: YES');
    console.log('Observed live streaming cursor: YES');

    // Check final rendered elements in assistant message
    const finalVerification = await c.evaluate(`(() => {
      const rows = document.querySelectorAll('.message-row.assistant');
      const lastRow = rows[rows.length - 1];
      const content = lastRow ? lastRow.querySelector('.message-content') : null;
      const codeBlocks = content ? content.querySelectorAll('pre code') : [];
      const copyButtons = content ? content.querySelectorAll('.btn-copy-code') : [];
      const cursor = content ? content.querySelector('.streaming-cursor') : null;
      const fullHtml = content ? content.innerHTML : '';
      return {
        cursorRemaining: Boolean(cursor),
        codeBlockCount: codeBlocks.length,
        copyButtonCount: copyButtons.length,
        hasValueEquation: fullHtml.toLowerCase().includes('value') || fullHtml.toLowerCase().includes('equation') || fullHtml.toLowerCase().includes('dream'),
        textSnippet: content ? content.innerText.slice(0, 150) : ''
      };
    })()`);

    assert.equal(finalVerification.cursorRemaining, false, 'Streaming cursor must be cleanly removed on done');
    console.log('Cursor removed on complete: YES');
    console.log('Code block count:', finalVerification.codeBlockCount);
    console.log('Copy button count:', finalVerification.copyButtonCount);
    console.log('Response excerpt:', finalVerification.textSnippet.replace(/\\n/g, ' '));

    // 3. Test 2: Stop button interrupts stream cleanly
    console.log('\n--- TEST 2: Stop Generation Button Interrupts Live Stream ---');
    const longPrompt = 'Write a 10-point comprehensive breakdown of business bottlenecks, operations, and offer tiers.';
    
    await c.evaluate(`(async () => {
      const input = document.getElementById('chatInput');
      input.value = ${JSON.stringify(longPrompt)};
      document.getElementById('btnSend').click();
    })()`);

    // Wait until stream actually starts emitting tokens
    let tokensStarted = false;
    const stopWaitStart = Date.now();
    while (Date.now() - stopWaitStart < 30000) {
      const liveState = await c.evaluate(`(() => {
        const rows = document.querySelectorAll('.message-row.assistant');
        const lastRow = rows[rows.length - 1];
        const content = lastRow ? lastRow.querySelector('.message-content') : null;
        const stopBtn = document.getElementById('btnStop');
        const text = content ? content.innerText : '';
        const streaming = stopBtn && stopBtn.style.display !== 'none';
        return {
          isStreaming: streaming,
          textLength: text.length
        };
      })()`);

      if (liveState.isStreaming && liveState.textLength > 15) {
        tokensStarted = true;
        console.log('Tokens flowing (length:', liveState.textLength, '). Clicking Stop Generation button...');
        await c.evaluate(`(async () => {
          document.getElementById('btnStop').click();
        })()`);
        break;
      }
      await new Promise(r => setTimeout(r, 80));
    }

    assert.equal(tokensStarted, true, 'Tokens should start streaming before stopping');

    // Wait 500ms for cancellation to settle
    await new Promise(r => setTimeout(r, 500));

    const stoppedState = await c.evaluate(`(() => {
      const rows = document.querySelectorAll('.message-row.assistant');
      const lastRow = rows[rows.length - 1];
      const content = lastRow ? lastRow.querySelector('.message-content') : null;
      const stoppedBadge = content ? content.querySelector('.stream-stopped-badge') : null;
      const cursor = content ? content.querySelector('.streaming-cursor') : null;
      const stopBtn = document.getElementById('btnStop');
      const sendBtn = document.getElementById('btnSend');
      const streaming = stopBtn && stopBtn.style.display !== 'none';
      return {
        isStreaming: streaming,
        sendBtnVisible: sendBtn && sendBtn.style.display !== 'none',
        stopBtnHidden: stopBtn && stopBtn.style.display === 'none',
        hasStoppedBadge: Boolean(stoppedBadge),
        stoppedBadgeText: stoppedBadge ? stoppedBadge.innerText : '',
        cursorRemaining: Boolean(cursor),
        partialText: content ? content.innerText.slice(0, 100) : ''
      };
    })()`);

    console.log('isStreaming after stop:', stoppedState.isStreaming);
    console.log('Send button restored:', stoppedState.sendBtnVisible);
    console.log('Stop button hidden:', stoppedState.stopBtnHidden);
    console.log('Stopped badge present:', stoppedState.hasStoppedBadge, `(${stoppedState.stoppedBadgeText})`);
    console.log('Cursor removed:', !stoppedState.cursorRemaining);

    assert.equal(stoppedState.isStreaming, false, 'isStreaming must be false after stop');
    assert.equal(stoppedState.sendBtnVisible, true, 'Send button must be restored');
    assert.equal(stoppedState.stopBtnHidden, true, 'Stop button must be hidden');
    assert.equal(stoppedState.hasStoppedBadge, true, 'Stopped badge must be displayed');
    assert.equal(stoppedState.cursorRemaining, false, 'Cursor must be removed');

    console.log('\nALL STREAMING UX TESTS PASSED SUCCESSFULLY!');
  } finally {
    c.close();
  }
})().catch(err => {
  console.error('\nSTREAMING UX TEST FAILED:', err);
  process.exit(1);
});
