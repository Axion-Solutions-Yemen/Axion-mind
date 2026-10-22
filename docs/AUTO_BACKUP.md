# Automatic account backups

## Behavior

Automatic verified backups are ON by default for every backend-verified signed-in account, following the user's explicit all-accounts requirement. Signing out stops uploads. The app does not log into other accounts or upload to signed-out accounts.

This PC currently uses a shared local workspace across sign-ins. Its customer files are backed up to the currently authenticated account, including work created under other sign-ins. This is NOT account-specific local workspace isolation. The account modal states this explicitly. Each account/storage-directory pair has an independent durable OFF switch.

While Axion Mind is open:
- Inspect the authenticated identity and a stable local snapshot about every 30 seconds.
- On first use of a new account/folder, catch up immediately unless explicitly disabled.
- If a digest matches that account/folder's last verified receipt, skip the upload.
- When files change, run a full checked backup at most once every 5 minutes during normal operation. A file saved just after a check can wait the remaining interval plus a polling delay. WebView background throttling, sleep, offline state or closed app can delay work; this is not a hard real-time guarantee.
- Transient upload errors retry after about 1, 2, 4, 8 and at most 15 minutes. Identity or filesystem inspection errors are rechecked on the normal polling cycle; no upload occurs without successful inspection.
- Permission/authentication/validation failures pause attempts rather than hammering the server. Fix the issue and turn the option off/on to resume. Cancel stops the operation and turns automatic backup off for that account/folder.
- Restoring a backup is still an explicit operation into a NEW folder. There is no automatic download, two-way merge, deletion propagation or close-time guarantee.

## Status and privacy

The sidebar and account modal distinguish verified matching content, unbacked changes, retry pending, pause and unknown status. Last-verified receipts are scoped to verified owner and the native canonical storage-directory hash. Receipt history describes the last successful verification on this device, not a claim that every historical cloud row is still unchanged or that another device has caught up.

Only receipt/policy metadata is saved in localStorage. Customer content and session tokens are not saved there by this feature. Session credentials remain in native Windows DPAPI persistence.

A native hashed marker under %LOCALAPPDATA%/PersonasHub/cloud-backup-policy retains per-account/folder OFF even when WebView localStorage fails or is reset. Policy-inspection failures prevent upload. Re-enabling requires a fresh verified owner and current storage scope.

The separate Pause automatic backups for the last signed-in account button is outside the authenticated-only panel. It works on offline startup using the stored identity exclusively to REVOKE upload policy, never to assert authenticated status or permit upload. Native pause and enable calls share one ordered scheduler mutation queue; later pause cannot be undone by an earlier outstanding enable.

If neither native nor local persistence can save OFF, the app reports that pause is session-only and must not be trusted after restart. It does not falsely report durable revocation.

## Data representation and compatibility

Uses the existing checked backup engine: private typed indexes plus immutable complete raw-file snapshots, followed by content readback and digest verification. Full session metadata, style/refusal/supporting files remain included. Snapshot limits remain 4 MiB/file, 16 MiB total UTF-8 content and 10,000 files. Unsupported content fails explicitly.

Older independently keyed knowledge rows are retained, not deleted. For ar...trans@gmail.com, 58 current deterministic card rows coexist with 22 old rows, so the table has 80 rows. The complete snapshot is the recovery authority; extra legacy index rows are not additional current cards. No schema migration or production record deletion was performed.

## Verification and boundaries

Run local regression suites:
node --test --test-reporter=tap tests/auto-backup.test.cjs tests/cloud-sync.test.cjs tests/google-auth.test.cjs
cargo test
cargo check
cargo build --release

Live production test requires explicit authorization and the scoped real-release CDP probe:
AXION_ALL_ACCOUNT_AUTO_APPROVED=yes AXION_EXPECTED_EMAIL=arafat.trans@gmail.com node tests/auto-live-verify.cjs

The release test observes the actual default automatic scheduler, downloads and validates its remote envelope, skips unchanged content, blocks Supabase network requests to exercise the real offline pause button, restores enabled policy and verifies original customer content against a DPAPI-sealed archive.

Local files changed during this work: the session index gained entries and new chats appeared. These additions were preserved, not reset to the original test baseline. Original chat/knowledge/persona bytes remained exact; the original session-index entries were verified to remain intact. The source of the concurrent session additions was not established.

Current-account live execution passed. All-account behavior and owner switching are additionally covered by scheduler regressions; separate real Google accounts were NOT repeatedly signed into just to test this change. Actual second-PC operation, controlled cross-account database write-policy probes and full deployed RLS inspection remain unverified.
