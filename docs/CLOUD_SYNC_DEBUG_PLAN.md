# Axion Mind — Cloud Sync Debugging and Verification Plan

Status: The manual backup/recovery repair below was completed; the subsequent automatic scheduler update is documented in AUTO_BACKUP_IMPLEMENTATION_REPORT.md. Automatic backups now default ON for every verified active account, per user clarification. Historical manual-engine scope follows: implemented and verified for manual cloud backup/recovery. The user separately approved the scoped production upload to arafat.sofa.point@gmail.com and the repaired-app restart. See CLOUD_SYNC_IMPLEMENTATION_REPORT.md, CLOUD_SYNC_LIVE_VERIFICATION.json and CLOUD_SYNC_GATES.md. Actual second-machine and controlled cross-account write-policy verification remain a customer-readiness handoff.

## 1. Goal, scope, and verified starting point

Goal: remove the stuck progress state, back up every supported category without silent omissions, and prove recovery from the cloud without relying on the original PC's files or localStorage.

Last read-only production verification for arafat.sofa.point@gmail.com (user f0ac0538-35cb-45c9-a9c0-089372abaaf3):
- Authentication was verified through Supabase /auth/v1/user.
- cloud_personas: 1 record; config_json exactly matched the local persona.
- chat_conversations: 13 records; messages_json exactly matched all 13 local chat files.
- knowledge_cards: 0 records, while local personas_data files exist.
- Local personas_data currently contains 63 JSON files. This is a file count, NOT a knowledge-card count; classify their contents before setting upload expectations.
- Native log records UI_ERROR: Uncaught ReferenceError: sb is not defined.

Scope boundaries:
- Preserve working Google OAuth, PKCE, DPAPI sessions, embedded personas, and separate Framework/Anecdote RAG behavior.
- No automatic publication of Google OAuth, account migration, destructive deletion, or production schema modification.
- Shipping a reliable manual backup is the first gate. Automatic multi-device synchronization is a separate gate and must not be advertised as active before it is implemented and tested.

## 2. Evidence and ranked hypotheses

Confirmed source findings:
A. ui/index.html:3718-3801 contains the Force Cloud Sync handler. Its delayed result callback references undeclared sb at line 3794. The callback runs outside the enclosing async try/catch, explaining the logged error and persistent progress message.
B. The handler posts personas and chats, but never sends exported personas_data or knowledge-card rows. This explains why uploaded persona/chat content can coexist with zero knowledge cards.
C. The upload fetch calls do not check response.ok. HTTP 401/403/409/429/500 responses can therefore be mistaken for successful requests.
D. src/main.rs:454-506 exports personas, chats, and the full relative-path/content map under personas_data. The exported extra data is not consumed by the current cloud handler.
E. The handler writes a snapshot to localStorage. That is local-only storage, not proof of a remote or format-safe backup.

Ranked additional hypotheses, still requiring tests:
1. Missing stable conflict targets/identities can cause rejected upserts or duplicate records on a second sync. Prediction: repeated uploads either fail or increase counts. Inspect actual live constraints; checked-in supabase_schema.sql is not deployment evidence.
2. An expired session or permission error is silently ignored by the current handler. Prediction: a fixture returning 401 or 403 still reaches a success-like path.
3. Download/recovery coverage is incomplete. Prediction: a fresh isolated local-data directory cannot reconstruct every uploaded category using only cloud records.
4. Account switching or concurrent local edits can upload the wrong local namespace or yield an inconsistent snapshot. Prediction: the owner or snapshot manifest changes during a controlled test.

Treat these as separate bugs. Fixing sb alone cannot establish a complete backup.

## 3. Preserve data and capture a reproducible baseline

Before implementation:
1. Resolve the configured application data directory; do not assume its default. Record the running release path/version/hash and capture sanitized AUTH/SYNC/UI_ERROR logs.
2. Create a verified customer-data backup covering personas.json, chats, personas_data, and other discovered customer-owned files. Exclude OAuth sessions, passwords, API keys, and credential scripts. Protect private customer content at rest; do not put raw exports in git or public evidence.
3. Create a manifest of relative paths, byte sizes, and SHA-256 hashes. Parse knowledge files to inventory actual framework/anecdote counts, IDs, schema versions, style DNA/refusals, source material, and other non-card files.
4. Read back cloud data for the CURRENT verified user, with complete pagination, and retain a private rollback snapshot. Compare content, not merely counts. Do not use the previous account's data as this account's baseline.
5. Preserve the current executable and a source checkpoint. The repository currently reports source as untracked, so git diff alone is not a usable rollback plan. Never bulk-add the repository: supabase_credentials.json and user_session.json are present and must not be committed or copied into evidence.
6. Do not close/restart the user's active app to obtain a debugging port. Use a controlled isolated instance when needed. Pause if preserving a consistent snapshot requires interrupting active edits.

Gate: customer-data backup is readable, its manifest is verified, and rollback paths are known. A backup on the same PC is not sufficient protection against formatting the entire machine.

## 4. Build a tight failing reproduction before editing production code

Build a focused, deterministic test harness around the actual sync handler/controller. Use synthetic customer content and a local HTTP fixture, never an unsolicited production upload. Capture asynchronous uncaught exceptions as test failures.

Planned initial command: node --test tests/cloud-sync.test.cjs
The file does not exist yet; creating and exercising it is part of implementation, not a completed result.

Use one RED -> GREEN slice at a time:
1. Successful fixture uploads must leave progress and produce a result without an uncaught sb error. First demonstrate this fails on the current handler for the observed reason.
2. A fixture export containing frameworks and anecdotes must issue appropriate upload operations and retain their categories and exact payload values. Demonstrate current omission before adding the missing behavior.
3. A fixture HTTP error must yield an explicit failure/partial state, never full success. Verify status and sanitized error propagation.
4. A second sync of the same content must be idempotent.
5. A restore into an empty sandbox must reproduce the snapshot manifest.

Capture command, exit code, expected failure, and final passing result for each slice. Fixture success establishes protocol/controller behavior only, not a successful production backup.

## 5. Trace and repair the upload contract incrementally

Trace this full path: button -> verified owner/session -> local export -> manifest -> per-table/file requests -> acknowledgement -> readback verification -> terminal UI result.

A. Result/error lifecycle
- Replace the timer-dependent success path with awaited, explicit states: idle, exporting, uploading, verifying, complete, partial, failed, cancelled.
- Disable overlapping syncs and re-enable controls in finally. Add bounded request/overall timeouts and cancellation with truthful partial-write reporting.
- Validate the current account at operation start. Abort safely if the account changes; never continue using another account's local queue or session.
- Do not convert a localStorage backup into a cloud-success message.

B. HTTP and session handling
- Route requests through one testable sync boundary that checks response.ok and returns structured results.
- Use the existing native verified-session/refresh mechanism rather than introducing plaintext credential persistence. Choose frontend versus native orchestration after tracing existing save/export seams; do not silently rewrite the architecture.
- Bound retries for transient network/429/5xx failures, respect Retry-After, and avoid blind retries for validation/permission failures. After a timeout, read back before retrying if the write may already have committed.
- Record attempted/uploaded/verified/failed counts per category with a non-secret operation ID. Never log tokens, raw chat content, or full sensitive payloads.

C. Data completeness and identity
- Upload personas first and map local persona IDs to the server UUID required by knowledge_cards.persona_id.
- Preserve framework versus anecdote classification, stable card identities, exact deal figures, Unicode, empty collections, schema versions, and references.
- Inspect actual cloud constraints and upsert semantics for (user_id, slug), (user_id, session_id), and stable card identity. The checked-in card schema has no explicit stable local-card uniqueness rule: do not invent one or migrate production silently.
- Inventory everything exported under personas_data. Card rows alone may not preserve style DNA, refusals, source files, or reconstructable path metadata. Select and document a versioned representation for these after checking the live schema. Any new table/storage/migration requires separate approval.
- Avoid lossy persona_slug extraction by stem.split('_')[0]; test real IDs containing underscores and use an explicit mapping.
- Verify exports do not silently treat unreadable or malformed customer files as empty data. Report omissions and stop full-success claims.

Gate: a complete snapshot has a stable manifest and explicit representation for every supported item. Unsupported items are named and prevent an 'all data backed up' claim.

## 6. Schema, ownership, account switching, and recovery

Read-only audit first:
- Inspect deployed tables, indexes, constraints, RLS policies, schema compatibility, pagination limits, and payload limits. Do not treat the local SQL file as proof of the deployed state.
- Ensure private records are not inadvertently public. Public personas, if supported, must remain explicit opt-in and are distinct from private customer backup.
- Verify that knowledge-card parent persona ownership matches the authenticated owner, not merely that a UUID exists.
- Treat local data as potentially shared across account switches until namespaces are proven. Do not silently auto-upload one account's private files into another account's cloud.

Recovery design and tests:
- Locate and trace the actual cloud download/recovery entry point. A local ZIP importer or import_all_data_json command does not establish a cloud restore path.
- Retrieve all pages and reconstruct personas, framework/anecdote files, supporting knowledge files, references, and messages in an EMPTY isolated data directory.
- Validate version, manifest, relative-path safety, and file sizes before applying any restore. Reject traversal/absolute paths and malformed payloads.
- Stage files and use safe replacement/rollback; never overwrite the user's working data to demonstrate recovery.
- Test new-device login, restart, and restored-data use. Windows DPAPI sessions need fresh login after OS formatting; tokens are not part of portable customer backup.
- Determine conflict semantics explicitly. Do not default to newest timestamp if it can discard another device's changes. Until conflict/deletion behavior is agreed, preserve both versions and perform no destructive reconciliation or propagated deletions.

Gate: empty-sandbox recovery passes without consulting the original customer files, localStorage, or locally bundled content to hide missing cloud data. Test content absent from the bundle so embedded defaults cannot produce a false pass.

## 7. Failure, security, and reliability test matrix

For every implementation slice, test at the narrowest seam first, then integration:
- Normal complete backup and verified per-category readback.
- Backend errors 400/401/403/409/413/429/500 and malformed responses.
- Connection loss, timeout before/after server commit, cancellation, and resume.
- Mid-sync account switch, logout, duplicate clicks, overlapping jobs, and app restart.
- Empty data, missing/corrupt local files, large payloads, Unicode, and exact numeric content.
- Repeated sync with no duplicate rows or unintended overwrites.
- Framework/anecdote separation and all other inventoried personas_data categories.
- A cloud dataset exceeding one response page.
- Local data edited while a snapshot is being exported or uploaded.
- Controlled two-account access tests: B cannot read or mutate A's private rows or attach cards to A's private persona. Cross-account production write tests require explicit approval; use staging first.
- Complete staged restore, restore failure rollback, and path-traversal rejection.
- Progress always reaches a terminal result; no timer/uncaught exception can leave a permanent spinner.

Retain existing auth regressions:
  cargo test
  cargo check
  node --test tests/google-auth.test.cjs
  node --test tests/cloud-sync.test.cjs
  cargo build --release

Adapt any historical provider-disabled-only smoke test before using it against an enabled provider. Never cancel a user's login or clear a real session just to run an old test.

## 8. Controlled live verification and release gates

Only after code review, local tests, and explicit authorization for the production upload:
1. Confirm the intended account and show a dry-run manifest of categories/items to upload.
2. Take a fresh private rollback snapshot and keep the original customer files unchanged.
3. Perform one controlled sync, then read back every category under the same verified user. Exhaust pagination and compare normalized JSON content or canonical hashes; preserve bytes where exact file representation is part of the contract.
4. Require uploaded and verified counts to equal the dry-run manifest, with zero unexplained omissions. Do not hardcode an old card count.
5. Repeat sync and prove stable identities/counts. Only intentional customer changes may modify content.
6. Restore solely from the cloud into the isolated empty directory. Compare the manifest and exercise persona loading, separate Framework/Anecdote retrieval, and restored chat history.
7. Restart the normal app after saving work, verify authentication and truthful sync status, and check sanitized logs for new errors. Confirm temporary debug ports are closed.
8. Keep the old release until the repaired release passes. Do not roll back customer data destructively if the app build is rolled back.

Automatic-sync/customer-readiness gate, separate from manual backup:
- Trace triggers for persona edits, knowledge changes, chat saves, startup, reconnect, and a second device. If missing, specify the queue/debounce/retry/conflict behavior before implementation.
- Keep login, 'cloud available', 'backup verified', and 'automatic sync active' as different states.
- Remove or qualify unsupported 'automatically sync'/'never lose data' claims until the behavior and recovery are verified.
- A separate Windows machine/device is required for an actual cross-device claim; an isolated profile is not equivalent evidence.

Stop and escalate if a schema change, destructive merge, account migration, unexpected public visibility, lost ownership boundary, or customer data mismatch is discovered. Do not treat a green badge or a successful POST as completion.

## 9. Deliverables, definition of done, and rollback

Expected implementation deliverables (not yet created by this plan):
- Focused regression harness and retained RED/GREEN execution evidence.
- Repaired sync boundary/controller and truthful UI results; no unrelated UI redesign.
- Versioned data/restore contract; proposed schema migration only if inspection demonstrates necessity and approval is given.
- Sanitized per-run manifest/report containing account identity, category counts, readback comparison, partial failures, and restore result. No credentials or raw customer content in public evidence.
- Updated setup/verification documentation distinguishing login, manual backup, automatic synchronization, and public customer readiness.

Done only when ALL core backup conditions pass:
- The observed sb exception is gone and progress always terminates correctly.
- Every inventoried supported category is represented remotely; no ignored HTTP failure or omitted knowledge data can produce full success.
- Readback content matches the captured local snapshot for the intended user.
- Repeated sync is idempotent and ownership boundaries hold.
- Empty-sandbox recovery reproduces the snapshot without depending on the original PC's state.
- Customer local data is preserved, existing OAuth tests pass, and rollback remains possible.

Rollback: restore the previous app executable/source checkpoint without deleting current local files or cloud records. Restore customer data only after comparing the protected backup and obtaining approval for replacement. Stop all jobs before switching versions; revoke no sessions, rotate no credentials, and delete no records as an implicit rollback step.

Current conclusion: the repaired release completed a verified manual backup of 1 persona, 35 frameworks, 23 anecdotes, 13 chats and all 83 customer files for the approved account. Repeated upload was idempotent; cloud-only recovery into a new folder matched every file hash, and original customer files remained unchanged. The normal app is running the repaired release. Automatic multi-device reconciliation, actual second-machine testing and controlled cross-account write-policy checks remain outside the verified result; see the implementation report and G8 handoff.
