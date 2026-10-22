const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('chat formatting dependencies are local and available offline',()=>{
 const ui=path.join(__dirname,'../ui'),html=fs.readFileSync(path.join(ui,'index.html'),'utf8');
 for(const name of ['vendor/marked.min.js','vendor/highlight.min.js','vendor/github-dark.min.css'])assert.ok(html.includes(name),'missing local '+name);
 assert.ok(!/<script[^>]+src="https?:/.test(html),'startup JavaScript must not depend on CDN availability');
 for(const name of ['marked.min.js','highlight.min.js'])assert.ok(fs.statSync(path.join(ui,'vendor',name)).size>1000);
});
