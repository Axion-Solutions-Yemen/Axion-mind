const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, '../ui/index.html'), 'utf8');
const chatAppJs = fs.readFileSync(path.join(__dirname, '../ui/chat-app.js'), 'utf8');

test('minimalist UI: header contains thinking chip and overflow menu', () => {
  assert.ok(indexHtml.includes('id="btnToggleAllThinking"'), 'btnToggleAllThinking exists');
  assert.ok(indexHtml.includes('id="thinkingChipLabel"'), 'thinkingChipLabel exists');
  assert.ok(indexHtml.includes('id="btnChatOverflowMenu"'), 'btnChatOverflowMenu exists');
  assert.ok(indexHtml.includes('id="chatOverflowDropdown"'), 'chatOverflowDropdown exists');
  assert.ok(indexHtml.includes('id="btnEditPersona"'), 'btnEditPersona exists');
  assert.ok(indexHtml.includes('id="btnClearChat"'), 'btnClearChat exists');
});

test('minimalist UI: Hermes Control moved to sidebar footer', () => {
  assert.ok(indexHtml.includes('id="btnHermesControl"'), 'btnHermesControl preserved in DOM');
  const footerIdx = indexHtml.indexOf('sidebar-footer');
  const hermesBtnIdx = indexHtml.indexOf('id="btnHermesControl"');
  assert.ok(hermesBtnIdx > footerIdx, 'btnHermesControl is positioned within sidebar footer');
});

test('minimalist UI: sidebar tab switcher markup exists', () => {
  assert.ok(indexHtml.includes('id="tabPersonas"'), 'tabPersonas exists');
  assert.ok(indexHtml.includes('id="tabHermes"'), 'tabHermes exists');
  assert.ok(indexHtml.includes('Personal Agent'), 'Personal Agent label present in sidebar tab');
  assert.ok(chatAppJs.includes('Hermes (Personal Agent)'), 'Hermes (Personal Agent) name configured');
});

test('minimalist UI: JS defines exact model formatting, search, and custom model input', () => {
  assert.ok(chatAppJs.includes('formatModelName'), 'formatModelName helper defined');
  assert.ok(chatAppJs.includes('modelFilterInput'), 'Search filter input defined in model picker');
  assert.ok(chatAppJs.includes('customModelDirectInput'), 'Direct custom model input defined in model picker');
});

test('minimalist UI: session capping logic implemented', () => {
  assert.ok(chatAppJs.includes('MAX_INITIAL = 5'), 'MAX_INITIAL = 5 session capping defined');
  assert.ok(chatAppJs.includes('btn-show-more-sessions'), 'btn-show-more-sessions class defined');
});
