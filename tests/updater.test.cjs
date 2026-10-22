const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const updaterSrc = fs.readFileSync(path.join(root, 'ui/updater.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'ui/index.html'), 'utf8');

test('updater UI elements exist in index.html', () => {
  assert.ok(indexHtml.includes('id="updateModal"'), 'updateModal markup must exist');
  assert.ok(indexHtml.includes('id="updateTargetVersion"'), 'updateTargetVersion markup must exist');
  assert.ok(indexHtml.includes('id="updateReleaseNotes"'), 'updateReleaseNotes markup must exist');
  assert.ok(indexHtml.includes('id="updateProgressBar"'), 'updateProgressBar markup must exist');
  assert.ok(indexHtml.includes('id="btnPerformUpdate"'), 'btnPerformUpdate markup must exist');
  assert.ok(indexHtml.includes('id="btnCheckAppUpdate"'), 'btnCheckAppUpdate markup must exist');
  assert.ok(indexHtml.includes('src="updater.js"'), 'updater.js script tag must be present');
});

test('updater script loads and runs cleanly in DOM environment', async () => {
  let invoked = [];
  let eventListeners = {};

  const fakeDocument = {
    readyState: 'complete',
    addEventListener: () => {},
    getElementById: (id) => {
      return {
        id,
        style: {},
        classList: {
          add: () => {},
          remove: () => {}
        },
        textContent: '',
        disabled: false,
        addEventListener: () => {}
      };
    }
  };

  const sandbox = {
    setTimeout: (fn) => fn(),
    window: {
      __TAURI__: {
        core: {
          invoke: async (cmd, args) => {
            invoked.push({ cmd, args });
            if (cmd === 'check_for_updates') {
              return {
                available: true,
                current_version: '0.2.0',
                version: '0.2.1',
                body: 'Fixes and new features'
              };
            }
            return null;
          }
        },
        event: {
          listen: (name, cb) => {
            eventListeners[name] = cb;
          }
        }
      },
      document: fakeDocument,
      setTimeout: (fn) => fn()
    },
    document: fakeDocument,
    console
  };
  sandbox.window.window = sandbox.window;

  vm.createContext(sandbox);
  vm.runInContext(updaterSrc, sandbox);

  assert.equal(typeof sandbox.window.axionCheckForUpdates, 'function');
  // Trigger check
  await sandbox.window.axionCheckForUpdates(false);
  assert.ok(invoked.some(x => x.cmd === 'check_for_updates'));
});
