const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ui=path.join(__dirname,'../ui');
test('security wrapper supports read-only parser exports and sanitizes every parse',()=>{
 const original=Object.defineProperty({},'parse',{enumerable:true,get:()=>text=>'<b>'+text+'</b>'});let observed;
 const root={marked:original,DOMPurify:{sanitize:(html,options)=>{observed=options;return 'SANITIZED '+html;}},document:{addEventListener(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(ui,'safe-markdown.js'),'utf8'),{window:root,URL});
 assert.equal(root.marked.parse('fixture'),'SANITIZED <b>fixture</b>');assert.equal(observed.ALLOW_DATA_ATTR,false);assert.ok(observed.FORBID_TAGS.includes('form'));
});
test('missing security dependencies fail closed',()=>{
 assert.throws(()=>vm.runInNewContext(fs.readFileSync(path.join(ui,'safe-markdown.js'),'utf8'),{window:{}}),/security dependencies/);
});
test('release assets avoid inline handlers, remote scripts, broad windows and devtools',()=>{
 const html=fs.readFileSync(path.join(ui,'index.html'),'utf8');assert.doesNotMatch(html,/\son(?:click|error|load|change|input|keydown)=/i);
 const config=JSON.parse(fs.readFileSync(path.join(ui,'../tauri.conf.json'),'utf8'));assert.match(config.app.security.csp,/script-src 'self'/);assert.match(config.app.security.csp,/object-src 'none'/);assert.doesNotMatch(config.app.security.csp,/script-src[^;]*unsafe/);
 const caps=JSON.parse(fs.readFileSync(path.join(ui,'../capabilities/default.json'),'utf8'));assert.deepEqual(caps.windows,['main']);assert.ok(!caps.permissions.some(p=>p.startsWith('opener:')));
 assert.doesNotMatch(fs.readFileSync(path.join(ui,'../Cargo.toml'),'utf8'),/features\s*=\s*\[[^\]]*"devtools"/);
});
