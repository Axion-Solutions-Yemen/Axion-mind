/* Presentation only: transient motion never owns navigation, requests, or stored data. */
(function (root) {
  'use strict';
  const document = root.document;
  if (!document) return;
  const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)');
  const easing = 'cubic-bezier(.22, 1, .36, 1)';
  const running = new Map();
  let navigationRevision = 0;
  let themeTimer;

  function cancel(element) {
    const animation = running.get(element);
    running.delete(element);
    animation?.cancel();
  }
  function play(element, frames, options = {}) {
    if (!element?.isConnected || reducedMotion.matches || typeof element.animate !== 'function') return null;
    cancel(element);
    try {
      const animation = element.animate(frames, { duration: 180, easing, ...options });
      running.set(element, animation);
      const release = () => { if (running.get(element) === animation) running.delete(element); };
      animation.addEventListener('finish', release, { once: true });
      animation.addEventListener('cancel', release, { once: true });
      return animation;
    } catch (_) {
      return null; // The natural layout and all controls remain usable without animation.
    }
  }
  // Legacy callers remain inert unless a real interaction explicitly opts in.
  function enter(element, { kind, distance = 6, duration = 180 } = {}) {
    if (!['message', 'response', 'navigation'].includes(kind)) return null;
    return play(element, [
      { opacity: kind === 'navigation' ? .7 : 0, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration });
  }
  function cancelConversation() {
    for (const element of [...running.keys()]) {
      if (element.closest('.conversation-body')) cancel(element);
    }
  }
  function captureComposer(transcript) {
    cancelConversation();
    if (reducedMotion.matches || !transcript.querySelector(':scope > .conversation-welcome:only-child')) return null;
    const element = transcript.parentElement.querySelector('.chat-input-wrapper');
    if (!element?.getClientRects().length) return null;
    return { element, before: element.getBoundingClientRect() };
  }
  function settleComposer(snapshot) {
    if (!snapshot || reducedMotion.matches || !snapshot.element.isConnected) return;
    const { element, before } = snapshot;
    const after = element.getBoundingClientRect();
    const x = before.left - after.left, y = before.top - after.top;
    if (Math.abs(x) + Math.abs(y) < 1) return;
    play(element, [
      { transform: `translate(${x}px, ${y}px)` },
      { transform: 'translate(0, 0)' }
    ], { duration: 440 });
  }
  function reset() {
    navigationRevision += 1;
    for (const element of [...running.keys()]) cancel(element);
  }
  root.addEventListener('resize', reset, { passive: true });
  reducedMotion.addEventListener('change', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  new MutationObserver(() => {
    reset();
    root.clearTimeout(themeTimer);
    if (reducedMotion.matches) return;
    document.documentElement.classList.add('is-theme-changing');
    themeTimer = root.setTimeout(() => document.documentElement.classList.remove('is-theme-changing'), 200);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  reducedMotion.addEventListener('change', () => {
    root.clearTimeout(themeTimer);
    document.documentElement.classList.remove('is-theme-changing');
  });

  // Selection feedback follows explicit clicks, never background sidebar refreshes.
  document.addEventListener('click', event => {
    const control = event.target.closest?.('#tabPersonas, #tabHermes, .persona-navigation-item, .sub-session-item');
    if (!control || reducedMotion.matches) return;
    cancelConversation();
    const revision = ++navigationRevision;
    const key = control.dataset.navigationKey;
    const isPersona = control.matches('.persona-navigation-item');
    root.requestAnimationFrame(() => {
      if (revision !== navigationRevision || reducedMotion.matches) return;
      const target = isPersona ? document.getElementById('selectedPersonaSelector') : key
        ? [...document.querySelectorAll('[data-navigation-key]')].find(item => item.dataset.navigationKey === key)
        : control;
      if (target?.getClientRects().length) enter(target, { kind: 'navigation', distance: 0, duration: 180 });
    });
  }, true);

  const api = { enter, play, captureComposer, settleComposer, cancelConversation };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AxionMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
