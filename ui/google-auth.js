(function (root) {
  'use strict';
  function createController({ invoke, onSession, onStatus, onBusy }) {
    let pending = false;
    let cancelled = false;
    return {
      async cancel() {
        if (!pending) return;
        cancelled = true;
        try {
          await invoke('cancel_google_sign_in');
          onStatus('Google sign-in cancelled. You can keep using Axion Mind locally.', 'info');
        } catch (_) {
          onStatus('Cancellation could not be confirmed. Close the browser sign-in tab and wait for the timeout.', 'error');
        }
      },
      async start() {
        if (pending) return;
        pending = true;
        cancelled = false;
        onBusy(true);
        onStatus('Opening your browser for Google sign-in. Choose an account there, then return here.', 'info');
        try {
          const session = await invoke('sign_in_with_google');
          if (cancelled) return;
          if (!session || !session.email || !session.id || !session.token) {
            throw new Error('Google sign-in did not return a verified account. Please try again.');
          }
          await onSession(session);
          onStatus('Signed in with Google. Cloud sync is available; use Sync Now to synchronize your data.', 'success');
        } catch (error) {
          if (!cancelled) onStatus(String(error?.message || error || 'Google sign-in failed.'), 'error');
        } finally {
          pending = false;
          onBusy(false);
        }
      }
    };
  }
  const api = { createController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AxionGoogleAuth = api;
})(typeof window !== 'undefined' ? window : globalThis);
