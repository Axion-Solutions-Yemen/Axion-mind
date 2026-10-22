/* Defensive Markdown boundary. Vendored parser + DOMPurify; no remote scripts. */
(function (root) {
  'use strict';
  if (!root.marked?.parse || !root.DOMPurify?.sanitize) throw new Error('Local Markdown security dependencies are unavailable.');
  const parse = root.marked.parse.bind(root.marked);
  root.marked = { ...root.marked, parse: function (source, options) {
    return root.DOMPurify.sanitize(parse(source, options), {
      USE_PROFILES: { html: true },
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['style','form','input','button','select','textarea','iframe','object','embed','video','audio'],
      FORBID_ATTR: ['id','name','style','autofocus','formaction','srcset','target'],
      ALLOW_UNKNOWN_PROTOCOLS: false
    });
  } };
  // Never navigate a privileged WebView to arbitrary Markdown destinations.
  root.document.addEventListener('click', event => {
    const anchor = event.target.closest?.('.message-content a[href]');
    if (!anchor) return;
    event.preventDefault(); event.stopPropagation();
    let url; try { url = new URL(anchor.getAttribute('href')); } catch (_) { return; }
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return;
    root.__TAURI__?.core?.invoke('open_chat_link', { url: url.href }).catch(() => {});
  }, true);
})(window);
