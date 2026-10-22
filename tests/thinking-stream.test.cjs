const test = require('node:test');
const assert = require('node:assert/strict');
const ux = require('../ui/streaming-ux.js');
test('thinking stays separate from answer, batches, and treats text literally',()=>{
 const frames=[];const renders=[];
 global.requestAnimationFrame=fn=>(frames.push(fn),frames.length);
 global.cancelAnimationFrame=()=>{};
 try {
  const c=ux.createThinkingController({onRender:(text,active)=>renders.push({text,active})});
  c.append('<script>');c.append('provider thinking');
  assert.equal(renders.length,0);frames.shift()();
  assert.equal(renders[0].text,'<script>provider thinking');
  c.complete();c.append('late');
  assert.deepEqual(renders.at(-1),{text:'<script>provider thinking',active:false});
 }finally{delete global.requestAnimationFrame;delete global.cancelAnimationFrame;}
});
