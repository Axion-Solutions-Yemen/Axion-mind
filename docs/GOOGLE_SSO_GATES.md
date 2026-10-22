# Gates: Axion Mind working Google SSO

OWNS: docs/GOOGLE_SSO_GATES.md, docs/GOOGLE_SIGN_IN_VERIFICATION.md, src/auth.rs, src/main.rs, ui/google-auth.js, ui/index.html, tests/**

Scope: Configure Google OAuth using the user's PC and Zen, then demonstrate real Google sign-in and durable verified identity in Axion Mind. No credentials in chat, bundled assets, or evidence files. User authorized the required Google and Supabase configuration changes.

- [x] G1: Google OAuth web client is configured with the Supabase callback and the intended account can use its audience.
  EVIDENCE: VERIFIED. Used the accessible project gen-lang-client-0573839341 under arafat.trans@gmail.com (not the earlier inaccessible stoked-droplet project). Created Web application client 'Axion Mind Supabase', reopened its detail page and verified https://kefxeysyvtdxxdupkapa.supabase.co/auth/v1/callback persisted. Saved arafat.trans@gmail.com as an External/Testing test user and verified after reloading Audience. Actual Google roundtrip succeeded. Credentials were transferred in memory directly into Supabase; no secret in project/evidence files.

- [x] G2: Supabase Google provider is enabled and the native randomized loopback callback is allowlisted.
  EVIDENCE: VERIFIED. Saved Google Client ID and Client Secret directly into the Google provider UI; reloaded and verified the client ID matched, secret remained present, Google enabled=true, Skip nonce checks=false and Allow users without email=false. Independent live GET /auth/v1/settings returned google_enabled=true. Reloaded URL Configuration and verified http://127.0.0.1:43821/auth/callback/* persisted. Existing Site URL unchanged.

- [x] G3: Real Google browser consent returns to Axion Mind; backend verifies the intended account and the UI displays it without fake login or embedded tokens.
  EVIDENCE: VERIFIED. Used the real release binary, its Google button, system Zen account chooser, native loopback callback and backend token exchange. Server /auth/v1/user confirmed arafat.trans@gmail.com, existing UUID 3ba63a12-104c-4786-989a-68563f6a7a86, providers email+google, and a Google identity. Read-only authenticated queries returned 1 cloud_personas, 22 knowledge_cards and 13 chat_conversations. No token in localStorage; encrypted DPAPI session created. No bulk sync was triggered.

- [x] G4: Relaunch restores the verified account using DPAPI storage; logout and fresh Google sign-in work without losing persona/chat data.
  EVIDENCE: VERIFIED. Gracefully restarted the real app and saw verified account hydration. Sign Out removed session.dpapi and showed Local / Sign In. A fresh Google account-chooser roundtrip signed in again with the same verified UUID. Final launch used the normal app profile without debugging flags; independent Windows UI Automation for PID 47708 confirmed the displayed email arafat.trans@gmail.com. Compared SHA-256 hashes of 77 customer persona/chat/content files before and after; all unchanged. Temporary browser/controller/WebView/callback ports verified closed. See GOOGLE_SSO_E2E_VERIFICATION.json.

All gates are consequential manual integration gates because they depend on the user's already-authenticated browser and Google consent. Passing local fixture tests alone does not meet them. Pause on authentication/2FA barriers for the user; do not bypass challenges.
