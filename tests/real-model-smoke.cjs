const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { connect } = require('./cdp-client.cjs');

const delay = ms => new Promise(r => setTimeout(r, ms));
const repo = path.resolve(__dirname, '..');
const scratch = 'C:/Users/AR-Qamzawi/AppData/Local/hermes/cache/scratch';
const root = fs.mkdtempSync(path.join(scratch, 'axion-realbridge-'));
const hub = path.join(root, 'PersonasHub');

fs.mkdirSync(path.join(hub, 'chats'), { recursive: true });
fs.mkdirSync(path.join(hub, 'sessions'), { recursive: true });
fs.writeFileSync(path.join(root, '.axion-test-workspace'), 'AXION_TEST_ONLY');

const write = (f, v) => fs.writeFileSync(path.join(hub, f), JSON.stringify(v));
write('personas.json', [{
  id: 'alex-hormozi',
  name: 'Alex Hormozi',
  title: 'Executive CEO Consultant',
  avatar: '🦁',
  description: 'Test Persona',
  system_prompt: 'You are Alex Hormozi. Be punchy, direct, and concise.',
  welcome_message: 'What offer are we fixing?'
}]);
write('sessions/alex-hormozi.json', [{
  id: 'alex-hormozi_test',
  agent_id: 'alex-hormozi',
  title: 'Real Model Smoke Check',
  created_at: '1',
  last_activity_at: '1',
  message_count: 0
}]);

// Direct to Antigravity Bridge at 8766
write('config.json', {
  mode: 'custom_gateway',
  hermes_gateway_url: 'http://127.0.0.1:8766',
  hermes_auth_token: '',
  cloud_provider: 'openai',
  cloud_api_key: '',
  cloud_model: 'antigravity-gemini-3.8-flash',
  custom_url: 'http://127.0.0.1:8766/v1/chat/completions',
  custom_auth_token: '',
  custom_model: 'antigravity-gemini-3.8-flash',
  custom_storage_dir: null
});

const binary = path.join(repo, 'target/stabilization/release/axion-mind.exe');
let child, c;

(async () => {
  try {
    child = spawn(binary, [], {
      env: {
        ...process.env,
        AXION_SANDBOX_ROOT: root,
        WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview'),
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=43825 --remote-debugging-address=127.0.0.1 --deny-permission-prompts'
      },
      stdio: 'ignore',
      cwd: root
    });

    c = await connect();
    const waitFor = async (fn, timeout = 15000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await fn()) return;
        await delay(50);
      }
      throw new Error('timeout waiting for condition');
    };

    await waitFor(() => c.evaluate("typeof selectItem === 'function' && personas.some(p => p.id === 'alex-hormozi')"));
    // Let startup selection settle before selecting the test conversation.
    await delay(1200);
    await c.evaluate("selectItem('persona', 'alex-hormozi_test')");
    await delay(200);

    // Observe DOM delivery without recording provider thought contents.
    await c.evaluate(`(() => {
      window.thinkingTiming = { started: performance.now(), firstThinkingMs: null, firstAnswerMs: null, updates: 0, lastLength: 0 };
      const observer = new MutationObserver(() => {
        const t = window.thinkingTiming;
        const panel = document.querySelector('.live-reasoning');
        const body = panel?.querySelector('.live-reasoning-text');
        const length = body?.textContent.length || 0;
        if (length && panel.open && !panel.hidden && body.getBoundingClientRect().height > 0) {
          if (t.firstThinkingMs === null) t.firstThinkingMs = performance.now() - t.started;
          if (length !== t.lastLength) { t.updates++; t.lastLength = length; }
        }
        if (document.querySelector('.live-answer')?.textContent && t.firstAnswerMs === null) t.firstAnswerMs = performance.now() - t.started;
      });
      observer.observe(document.getElementById('chatInput').ownerDocument.body, { subtree: true, childList: true, characterData: true, attributes: true });
      window.thinkingObserver = observer;
    })()`);
    console.log('Sending real model prompt...');
    await c.evaluate(`(() => {
      document.getElementById('chatInput').value = 'Explain how rain forms in 12 numbered sentences.';
      document.getElementById('btnSend').click();
    })()`);

    // Wait for real streaming text to emerge
    await waitFor(async () => {
      const text = await c.evaluate("[...document.querySelectorAll('.live-answer')].at(-1)?.textContent || ''");
      return text.length > 0;
    }, 20000);

    console.log('Real model streaming started.');

    // Wait for generation to finish or text to contain expected output
    await waitFor(async () => {
      const stopVisible = await c.evaluate("document.getElementById('btnStop').style.display !== 'none'");
      return !stopVisible;
    }, 25000);

    const finalText = await c.evaluate("[...document.querySelectorAll('.live-answer')].at(-1)?.textContent || ''");
    console.log('Final text received:', finalText.trim());
    assert.ok(finalText.includes('PING_PONG_OK') || finalText.length > 5, 'Real model did not produce substantive text');

    // Verify chat persisted to disk in the isolated sandbox
    const savedChat = JSON.parse(fs.readFileSync(path.join(hub, 'chats/alex-hormozi_test.json'), 'utf8'));
    assert.equal(savedChat.length, 2);
    assert.equal(savedChat[0].content, 'Explain how rain forms in 12 numbered sentences.');
    assert.ok(savedChat[1].content.length > 0);

    const timing = await c.evaluate('window.thinkingTiming');
    console.log('THINKING_TIMING:', JSON.stringify(timing));
    assert.ok(timing.firstThinkingMs !== null, 'Provider thinking was not visibly rendered');
    assert.ok(timing.firstThinkingMs < timing.firstAnswerMs, 'Thinking must be visible before the answer');
    await c.evaluate('window.thinkingObserver.disconnect()');
    console.log('REAL_MODEL_SMOKE_PASSED');
  } catch (error) {
    if (c) console.error('SMOKE_DIAGNOSTICS:', JSON.stringify(await c.evaluate(`({timing:window.thinkingTiming, generating:typeof isGenerating !== 'undefined' ? isGenerating : null, errors:[...document.querySelectorAll('.stream-error')].map(e=>e.textContent), inputDisabled:document.getElementById('chatInput')?.disabled, sendDisabled:document.getElementById('btnSend')?.disabled, activeId:typeof activeId !== 'undefined' ? activeId : null, tail:document.body.innerText.slice(-1200)})`)));
    throw error;
  } finally {
    c?.close();
    if (child && !child.killed) child.kill();
  }
})().catch(e => {
  console.error('REAL_MODEL_SMOKE_FAILED:', e.message);
  process.exitCode = 1;
});
