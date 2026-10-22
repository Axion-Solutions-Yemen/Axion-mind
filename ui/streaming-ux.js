/**
 * Axion Mind — High-Performance Streaming UX Module
 * Delivers smooth token streaming, auto-healing markdown, pulsing typing cursor,
 * frame-budgeted rAF batching, and intelligent non-intrusive auto-scrolling.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AxionStreamUX = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Auto-heals incomplete markdown syntax during active token streaming.
   * Prevents flickering, broken layouts, and unstyled raw code blocks while typing.
   */
  function prepareStreamingMarkdown(text) {
    if (!text || typeof text !== 'string') return '';

    let result = text;

    // 1. Detect unclosed code fences: ``` or ```lang
    // Split by triple-backtick to count fences
    const fenceMatches = text.match(/```/g);
    const fenceCount = fenceMatches ? fenceMatches.length : 0;
    if (fenceCount % 2 !== 0) {
      // An odd number of fences means a code block was opened but not yet closed.
      // Auto-append a closing fence so `marked.parse` renders it as a styled code block.
      result += '\n```';
    }

    // 2. Detect unclosed inline backticks (single `) outside of code blocks
    // If not inside a code block and there's an odd number of single backticks
    const textWithoutTripleFences = result.replace(/```[\s\S]*?```/g, '');
    const inlineBacktickMatches = textWithoutTripleFences.match(/`/g);
    if (inlineBacktickMatches && inlineBacktickMatches.length % 2 !== 0) {
      result += '`';
    }

    return result;
  }

  /**
   * High-performance stream buffer to collect incoming chunks and produce snapshots.
   */
  class StreamBuffer {
    constructor() {
      this.fullText = '';
      this.pendingDelta = '';
    }

    push(delta) {
      if (!delta) return;
      this.fullText += delta;
      this.pendingDelta += delta;
    }

    drain() {
      const delta = this.pendingDelta;
      this.pendingDelta = '';
      return delta;
    }

    hasPending() {
      return this.pendingDelta.length > 0;
    }

    getText() {
      return this.fullText;
    }

    clear() {
      this.fullText = '';
      this.pendingDelta = '';
    }
  }

  /**
   * Intelligent Scroll Tracker.
   * Tracks whether the viewport was already at the bottom before a render.
   * Prevents scroll hijacking when a user has scrolled up to read earlier text.
   */
  class ScrollTracker {
    constructor(options = {}) {
      this.threshold = options.threshold || 60;
      this.userHasScrolledUp = false;
    }

    isNearBottom(container) {
      if (!container) return true;
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      return distance <= this.threshold;
    }

    onUserScroll(container) {
      if (!container) return false;
      const atBottom = this.isNearBottom(container);
      this.userHasScrolledUp = !atBottom;
      return this.userHasScrolledUp;
    }

    scrollToBottom(container, smooth = false) {
      if (!container) return;
      this.userHasScrolledUp = false;
      if (smooth && typeof container.scrollTo === 'function') {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  }

  /**
   * Stream Controller managing token ingestion, rAF batching,
   * markdown rendering, cursor lifecycle, and interruption.
   */
  function createStreamController(options = {}) {
    const buffer = new StreamBuffer();
    const scroller = new ScrollTracker({ threshold: options.scrollThreshold || 60 });
    let active = true;
    let interrupted = false;
    let animationFrameId = null;

    const onRender = options.onRender || (() => {});
    const onDone = options.onDone || (() => {});

    function renderFrame() {
      if (!active) return;
      const currentText = buffer.getText();
      const prepared = prepareStreamingMarkdown(currentText);
      onRender(prepared, { raw: currentText, active: true });
    }

    function scheduleRender() {
      if (!active) return;
      if (typeof globalThis.requestAnimationFrame === 'function') {
        if (animationFrameId === null) {
          animationFrameId = globalThis.requestAnimationFrame(() => {
            animationFrameId = null;
            renderFrame();
          });
        }
      } else {
        renderFrame();
      }
    }

    return {
      append(delta) {
        if (!active) return;
        buffer.push(delta);
        scheduleRender();
      },

      flush() {
        if (animationFrameId !== null && typeof globalThis.cancelAnimationFrame === 'function') {
          globalThis.cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        renderFrame();
      },

      complete() {
        if (!active) return buffer.getText();
        active = false;
        if (animationFrameId !== null && typeof globalThis.cancelAnimationFrame === 'function') {
          globalThis.cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        const finalRaw = buffer.getText();
        onRender(finalRaw, { raw: finalRaw, active: false });
        onDone(finalRaw, false);
        return finalRaw;
      },

      stop() {
        if (!active) return buffer.getText();
        active = false;
        interrupted = true;
        if (animationFrameId !== null && typeof globalThis.cancelAnimationFrame === 'function') {
          globalThis.cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        const partialRaw = buffer.getText();
        onRender(partialRaw, { raw: partialRaw, active: false, interrupted: true });
        onDone(partialRaw, true);
        return partialRaw;
      },

      isActive() {
        return active;
      },

      isInterrupted() {
        return interrupted;
      },

      getText() {
        return buffer.getText();
      },

      getScroller() {
        return scroller;
      }
    };
  }

  function createThinkingController(options = {}) {
    const controller = createStreamController({
      onRender: (_, meta) => options.onRender?.(meta.raw, meta.active)
    });
    return controller;
  }

  return {
    createThinkingController,
    prepareStreamingMarkdown,
    StreamBuffer,
    ScrollTracker,
    createStreamController
  };
});
