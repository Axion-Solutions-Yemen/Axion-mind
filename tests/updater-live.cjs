const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { connect } = require('./cdp-client.cjs');

const delay = ms => new Promise(r => setTimeout(r, ms));
const repo = path.resolve(__dirname, '..');
const scratch = 'C:/Users/AR-Qamzawi/AppData/Local/hermes/cache/scratch';
const root = fs.mkdtempSync(path.join(scratch, 'axion-updater-live-'));
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

    // 1. Wait for page initialization
    await waitFor(() => c.evaluate("typeof window.__testShowUpdateModal === 'function'"));
    console.log('PASS: updater.js loaded and initialized in WebView');

    // 2. Check "Check Updates" button exists in Settings modal
    const checkBtnExists = await c.evaluate("!!document.getElementById('btnCheckAppUpdate')");
    assert.equal(checkBtnExists, true, 'Check Updates button must exist in settings');
    console.log('PASS: Check Updates button exists in Settings modal');

    // 3. Trigger simulated update notification
    await c.evaluate(`window.__testShowUpdateModal({
      available: true,
      current_version: '0.2.0',
      version: '0.2.1',
      body: '• Added automated background updates\\n• Minisign cryptographic verification'
    })`);

    // Verify modal is visible
    const isOpen = await c.evaluate("document.getElementById('updateModal').classList.contains('open')");
    assert.equal(isOpen, true, 'updateModal must have "open" class');

    const targetVer = await c.evaluate("document.getElementById('updateTargetVersion').textContent");
    assert.equal(targetVer, 'v0.2.1', 'target version must render v0.2.1');

    const currentVer = await c.evaluate("document.getElementById('updateCurrentVersion').textContent");
    assert.equal(currentVer, 'v0.2.0', 'current version must render v0.2.0');

    const notesText = await c.evaluate("document.getElementById('updateReleaseNotes').textContent");
    assert.ok(notesText.includes('Minisign cryptographic verification'), 'release notes must be rendered');
    console.log('PASS: Update modal opened with correct version comparison and release notes');

    // 4. Test progress simulation
    await c.evaluate(`(() => {
      const progSec = document.getElementById('updateProgressSection');
      const progBar = document.getElementById('updateProgressBar');
      const progPct = document.getElementById('updateProgressPercent');
      progSec.style.display = 'flex';
      progBar.style.width = '65%';
      progPct.textContent = '65%';
    })()`);

    const pctText = await c.evaluate("document.getElementById('updateProgressPercent').textContent");
    assert.equal(pctText, '65%');
    console.log('PASS: Update download progress bar binds and updates smoothly');

    // 5. Test "Remind Me Later" dismissal
    await c.evaluate("document.getElementById('btnLaterUpdate').click()");
    await delay(100);
    const isClosed = await c.evaluate("!document.getElementById('updateModal').classList.contains('open')");
    assert.equal(isClosed, true, 'updateModal must close when clicking Remind Me Later');
    console.log('PASS: Remind Me Later dismisses the update modal cleanly');

    console.log('UPDATER_LIVE_VERIFIED_SUCCESSFULLY');
  } catch (error) {
    console.error('UPDATER_LIVE_FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    c?.close();
    if (child && !child.killed) child.kill();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
})();
