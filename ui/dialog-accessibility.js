/* Dialog lifecycle: focus stays within the active dialog and returns to its trigger. */
(function () {
  'use strict';
  const triggers = new WeakMap();
  let lastFocus = null;
  document.addEventListener('focusin', event => { if (!event.target.closest('.modal-backdrop')) lastFocus = event.target; });
  function focusable(modal) {
    return [...modal.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]')]
      .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  }
  function start() {
    for (const modal of document.querySelectorAll('.modal-backdrop')) {
      const dialog = modal.querySelector('.modal') || modal.firstElementChild;
      if (dialog) { dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); const title=dialog.querySelector('h3[id],h2[id]'); if(title)dialog.setAttribute('aria-labelledby',title.id); }
      let open = modal.classList.contains('open');
      new MutationObserver(() => {
        const next = modal.classList.contains('open'); if (next === open) return;
        open = next;
        if (open) {
          triggers.set(modal, document.activeElement !== document.body && !document.activeElement.closest('.modal-backdrop') ? document.activeElement : lastFocus);
          modal.removeAttribute('inert'); if (!modal.contains(document.activeElement)) (focusable(modal)[0] || dialog)?.focus({ preventScroll: true });
        } else {
          modal.setAttribute('inert', '');
          const trigger = triggers.get(modal); if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        }
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
      if (!open) modal.setAttribute('inert', '');
    }
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const modal = [...document.querySelectorAll('.modal-backdrop.open')].at(-1); if (!modal) return;
    const nodes = focusable(modal), first=nodes[0], last=nodes.at(-1); if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
