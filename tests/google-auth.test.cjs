const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.join(__dirname, '../ui/google-auth.js');

test('account form offers Google instead of a hardcoded personal login', () => {
  const html = require('./ui-source.cjs')();
  assert.equal(/id="btnGoogleSignIn"/.test(html), true, 'Google button missing');
  assert.equal(/btnQuickLoginArafat/.test(html), false, 'Personal account bypass must be removed');
  assert.equal(/id="authPassword"[^>]*value=/.test(html), false, 'Password must not be embedded');
  assert.equal(/token:\s*"eyJ/.test(html), false, 'Session token must not be embedded');
});

test('Google controller module exists for real browser auth', () => {
  assert.equal(fs.existsSync(modulePath), true, 'Google auth controller is missing');
});

function harness(invoke) {
  const states = [], sessions = [], busy = [];
  const { createController } = require(modulePath);
  const controller = createController({ invoke, onSession: async s => sessions.push(s),
    onStatus: (message, kind) => states.push({ message, kind }), onBusy: b => busy.push(b) });
  return { controller, states, sessions, busy };
}

test('verified backend session updates account, without claiming data was synced', async () => {
  const h = harness(async cmd => {
    assert.equal(cmd, 'sign_in_with_google');
    return { email: 'test@example.test', id: 'test-user', token: 'test-token-not-real' };
  });
  await h.controller.start();
  assert.equal(h.sessions.length, 1);
  assert.deepEqual(h.busy, [true, false]);
  assert.equal(h.states.at(-1).kind, 'success');
  assert.equal(/synchronized|sync active/i.test(h.states.at(-1).message), false);
});

test('provider configuration failure remains a visible error, not a fake login', async () => {
  const h = harness(async () => { throw new Error('Google provider is not enabled in Supabase.'); });
  await h.controller.start();
  assert.equal(h.sessions.length, 0);
  assert.equal(h.states.at(-1).kind, 'error');
  assert.match(h.states.at(-1).message, /not enabled/);
  assert.deepEqual(h.busy, [true, false]);
});

test('double clicks start only one native OAuth flow', async () => {
  let finish, calls = 0;
  const h = harness(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const running = h.controller.start();
  await h.controller.start();
  assert.equal(calls, 1);
  finish(null);
  await running;
  assert.equal(h.sessions.length, 0);
});

test('cancel asks native backend to close listener and suppresses late login', async () => {
  let finish;
  const commands = [];
  const h = harness(cmd => {
    commands.push(cmd);
    return cmd === 'sign_in_with_google' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve();
  });
  const running = h.controller.start();
  assert.equal(typeof h.controller.cancel, 'function', 'Cancellation method missing');
  await h.controller.cancel();
  finish({ email: 'late@example.test', id: 'late', token: 'test-token-not-real' });
  await running;
  assert.deepEqual(commands, ['sign_in_with_google', 'cancel_google_sign_in']);
  assert.equal(h.sessions.length, 0);
  assert.match(h.states.at(-1).message, /cancel/i);
});
