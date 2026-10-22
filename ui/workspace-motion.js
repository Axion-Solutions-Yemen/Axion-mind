/* Container-level motion only. Never observe streamed markdown mutations. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.AxionMotion = api;
    const boot = () => {
      ['.sidebar', '.chat-header', '.chat-input-wrapper'].forEach((selector, i) => {
        api.enter(document.querySelector(selector), { delay: i * 45, duration: 380 });
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const running = new WeakMap();
  const active = new Set();
  let preference;
  function observePreference() {
    if (preference || !root.matchMedia) return;
    preference = root.matchMedia('(prefers-reduced-motion: reduce)');
    preference.addEventListener?.('change', event => {
      if (event.matches) { for (const animation of active) animation.cancel(); active.clear(); }
    });
  }
  function enter(element, options = {}) {
    if (!element || typeof element.animate !== 'function') return null;
    observePreference();
    const previous = running.get(element);
    if (previous) { previous.cancel(); active.delete(previous); running.delete(element); }
    if (root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
    const animation = element.animate([
      { opacity: .65, transform: 'translateY(5px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: options.duration || 240, delay: options.delay || 0, easing: 'cubic-bezier(.16,1,.3,1)' });
    running.set(element, animation);
    active.add(animation);
    const cleanup = () => { active.delete(animation); if (running.get(element) === animation) running.delete(element); };
    animation.finished.then(cleanup, cleanup);
    return animation;
  }
  return { enter };
});
