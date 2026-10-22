const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const ui=path.join(__dirname,'../ui');
test('premium motion loads locally, honors reduced motion, and avoids streamed child animations',()=>{
 const html=require('./ui-source.cjs')();
 assert.match(html,/<link[^>]+href="premium-motion.css"/,'local motion stylesheet must be loaded');
 const css=fs.readFileSync(path.join(ui,'premium-motion.css'),'utf8');
 assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
 assert.doesNotMatch(css,/transition\s*:\s*all\b/);
 assert.doesNotMatch(css,/\.live-answer\s+(?:p|\*)\s*\{/,'streaming markdown children must never reanimate');
 assert.match(css,/\.message-row\.motion-new/,'only newly sent messages animate, not loaded history');
 for(const match of css.matchAll(/@keyframes\s+\S+\s*\{([\s\S]*?)(?=\n\})/g)){
  assert.doesNotMatch(match[1],/\b(?:height|width|padding|margin|filter|box-shadow|top|left)\s*:/,'entrances must be compositor-only');
 }
});
test('message entrances are explicitly enabled only on new sends',()=>{
 const html=require('./ui-source.cjs')();
 assert.match(html,/function appendMessageRow\([^)]*animate = false\)/);
 assert.match(html,/if \(animate\) row.classList.add\('motion-new'\)/);
 assert.match(html,/appendMessageRow\('user', text, origin.mode, null, null, true\)/);
});
