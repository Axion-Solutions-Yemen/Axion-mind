const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Test the streaming UX module
const streamUx = require('../ui/streaming-ux.js');

test('prepareStreamingMarkdown: auto-closes unclosed code fences cleanly', () => {
  const input = "Here is some code:\n```python\nprint('hello world')";
  const prepared = streamUx.prepareStreamingMarkdown(input);
  assert.ok(prepared.includes("```python\nprint('hello world')\n```"), 'Unclosed fence must be closed');
  assert.ok(!prepared.endsWith("```\n```"), 'Must not duplicate fences');
});

test('prepareStreamingMarkdown: does not modify already balanced code blocks', () => {
  const input = "Here is code:\n```javascript\nconsole.log(1);\n```\nAll done!";
  const prepared = streamUx.prepareStreamingMarkdown(input);
  assert.equal(prepared, input, 'Balanced code blocks must not have extra fences');
});

test('prepareStreamingMarkdown: auto-closes unclosed inline backticks', () => {
  const input = "Use the `fetch command";
  const prepared = streamUx.prepareStreamingMarkdown(input);
  assert.equal(prepared, "Use the `fetch command`");
});

test('prepareStreamingMarkdown: handles multi-fence streaming content', () => {
  const input = "Block 1:\n```rust\nfn main() {}\n```\nBlock 2:\n```typescript\nconst a = 1;";
  const prepared = streamUx.prepareStreamingMarkdown(input);
  assert.ok(prepared.endsWith("\n```"));
  // Count fences: should be 4 total (2 open, 2 close)
  const count = (prepared.match(/```/g) || []).length;
  assert.equal(count % 2, 0, 'Total fence count must be even');
});

test('prepareStreamingMarkdown: handles empty or invalid inputs gracefully', () => {
  assert.equal(streamUx.prepareStreamingMarkdown(''), '');
  assert.equal(streamUx.prepareStreamingMarkdown(null), '');
  assert.equal(streamUx.prepareStreamingMarkdown(undefined), '');
});

test('StreamBuffer: smoothly accumulates deltas and flushes accurately', () => {
  const buffer = new streamUx.StreamBuffer();
  buffer.push('Hello');
  buffer.push(' ');
  buffer.push('World!');
  assert.equal(buffer.getText(), 'Hello World!');
  assert.equal(buffer.hasPending(), true);
  assert.equal(buffer.drain(), 'Hello World!');
  assert.equal(buffer.hasPending(), false);
  assert.equal(buffer.drain(), '');
  assert.equal(buffer.getText(), 'Hello World!');
  buffer.clear();
  assert.equal(buffer.getText(), '');
});

test('SmartScroll: detects near bottom threshold and respects user scroll up', () => {
  const scroller = new streamUx.ScrollTracker({ threshold: 50 });
  
  // Simulated container scrolled to bottom
  const containerAtBottom = {
    scrollTop: 900,
    clientHeight: 100,
    scrollHeight: 1000,
  };
  assert.equal(scroller.isNearBottom(containerAtBottom), true);
  assert.equal(scroller.onUserScroll(containerAtBottom), false);

  // Simulated container scrolled up by user (e.g. 200px from bottom)
  const containerScrolledUp = {
    scrollTop: 700,
    clientHeight: 100,
    scrollHeight: 1000,
  };
  assert.equal(scroller.isNearBottom(containerScrolledUp), false);
  assert.equal(scroller.onUserScroll(containerScrolledUp), true);

  // Calling scrollToBottom restores bottom state
  scroller.scrollToBottom(containerScrolledUp);
  assert.equal(containerScrolledUp.scrollTop, 1000);
  assert.equal(scroller.userHasScrolledUp, false);
});

test('StreamController: handles lifecycle from start to completion and interruption', () => {
  let renderedText = '';
  let doneCalled = false;
  let interruptedState = false;

  const controller = streamUx.createStreamController({
    onRender: (text) => { renderedText = text; },
    onDone: (finalText, interrupted) => {
      doneCalled = true;
      interruptedState = interrupted;
    }
  });

  assert.equal(controller.isActive(), true);
  controller.append('Hello ');
  controller.append('World');
  controller.flush();

  assert.ok(renderedText.includes('Hello World'));

  const finalResult = controller.complete();
  assert.equal(finalResult, 'Hello World');
  assert.equal(controller.isActive(), false);
  assert.equal(doneCalled, true);
  assert.equal(interruptedState, false);
});

test('StreamController: handles user cancellation cleanly via stop()', () => {
  let renderedText = '';
  let doneCalled = false;
  let interruptedState = null;

  const controller = streamUx.createStreamController({
    onRender: (text) => { renderedText = text; },
    onDone: (finalText, interrupted) => {
      doneCalled = true;
      interruptedState = interrupted;
    }
  });

  controller.append('Partial thought before stop.');
  controller.flush();

  const stoppedText = controller.stop();
  assert.equal(stoppedText, 'Partial thought before stop.');
  assert.equal(controller.isActive(), false);
  assert.equal(controller.isInterrupted(), true);
  assert.equal(doneCalled, true);
  assert.equal(interruptedState, true);

  // Appending after stop is ignored
  controller.append(' Should be ignored');
  assert.equal(controller.getText(), 'Partial thought before stop.');
});
