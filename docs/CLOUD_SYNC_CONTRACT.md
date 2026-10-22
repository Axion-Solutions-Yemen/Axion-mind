# Axion Mind manual cloud backup contract

Update: the verified engine below is now also driven by the automatic scheduler described in AUTO_BACKUP.md. Automatic backups default ON for each authenticated active account, per explicit user clarification. This document records the underlying manual engine contract, not the current scheduling policy.

Implementation: ui/cloud-sync.js plus strict native snapshot/recovery in src/backup.rs. This replaces the old Force Cloud Sync handler. Google OAuth, its PKCE flow, and DPAPI session persistence are unchanged.

## What is backed up

The active configured storage directory is captured twice; differing captures fail rather than claiming a stable export. The portable snapshot consists of version=1 and exact UTF-8 file contents for:
- personas.json
- chats/*.json
- sessions/*.json (conversation metadata needed for restoration)
- all files recursively beneath personas_data (frameworks, anecdotes, style DNA, refusal rules, supporting knowledge/source text)

Authentication, config/API credentials, logs, old session artifacts, localStorage and unrelated folders are not included. Missing personas.json, malformed JSON, inaccessible files, links, non-UTF-8/binary files, unsafe paths and unsupported sizes fail closed. Limits: 4 MiB per file, 16 MiB total UTF-8 content, 10,000 files. Supporting arbitrary PDF/binary source attachments requires an explicit future storage contract; the implementation does not silently omit them.

## Existing-table representation; no schema migration

The user approved a scoped upload to arafat.sofa.point@gmail.com and release restart after local verification.

1. Customer personas are upserted on (user_id, slug), with is_public=false.
2. Knowledge files under <persona>/frameworks and <persona>/anecdotes are separately indexed as knowledge_cards with their original payload_json and category. Deterministic UUIDs depend on owner, relative source path, and item index. Parent persona UUIDs come from the server's acknowledged owned rows. Knowledge groups absent from personas.json get private knowledge-parent carrier rows; these are storage rows, not extra local customer personas.
3. Chats are upserted on (user_id, session_id). Session metadata supplies the persona mapping; longest known IDs and trailing session markers are fallback mappings. Underscores are not split at the first occurrence.
4. Typed rows are read back and compared before publishing the recovery snapshot.
5. A private reserved cloud_personas row stores config_json.axion_backup with version, owner, snapshot digest, per-file SHA-256/byte manifest, category counts, created_at, and the full raw-file snapshot. Its slug is __axion_backup_v1_<snapshot_sha256>. This uses existing JSONB storage, without changing production schema. The name explicitly identifies it as a backup, not a chat persona.
6. Published snapshot content is immutable through this client; an identical digest reuses the existing validated envelope. Only last-verification metadata is updated. Distinct snapshots retain distinct rows. No rows are deleted by backup.

Mutable persona/card/chat tables are convenient current-content indexes, NOT the atomic recovery authority. The immutable published envelope preserves complete historical content if an index-table update is interrupted later. Existing independent card IDs from older clients are retained, not deleted or silently re-keyed. Count reports distinguish original customer personas, carrier rows, and snapshot storage rows.

## Completion and failures

The engine verifies the native session via /auth/v1/user, pins its owner, and rejects a changed renderer account before/after requests. A dry-run confirmation names the receiving email and all category counts; it warns that this PC's local data may span previous sign-ins. There is no automatic upload on account switch.

Every HTTP response is checked. All owned readbacks are paginated until an empty page, including when a server caps pages below the requested size. Full success requires matching typed rows, a published envelope re-read with matching owner, digest, manifest and counts, and unchanged local snapshot on a final native export.

Request timeout is 20 seconds; operation timeout is 180 seconds. Reads retry bounded 429/5xx responses. Writes are not blindly retried after an ambiguous failure: the status explicitly says that partial/unconfirmed writes may exist, and a user retry uses deterministic conflict identities. A complete archive is not published after an earlier typed-write failure.

Progress, failure, partial upload, cancellation and complete verification are different states. The controller restores controls in finally, prevents overlapping jobs, and offers cancellation. A signed-in badge is never proof of backup. No session token or customer payload is written to localStorage by this backup path.

## Recovery

Recover Cloud Backup performs a NEW authenticated network download of the latest published envelope for the current account. It recalculates digest, manifest and counts, and validates every path/content before writing.

The native recovery command re-verifies the expected account and prevents session switching while creating the recovered directory. It validates all content, writes into a new staging folder, re-captures and checks the result, then publishes a NEW folder under %LOCALAPPDATA%/PersonasHub/cloud-recovery/recovered-<random>.

It never overwrites the active data directory. The UI displays the recovered path. To use that recovery, the user selects its folder in Settings using the existing custom storage feature. On a freshly formatted PC, sign in again; Windows DPAPI session files are not portable backup credentials.

This is a manual backup/recovery feature. It is not an automatic two-way sync engine, deletion propagation protocol, or conflict-resolution system. Real second-machine use and full two-account write-policy/parent-ownership enforcement require separate verification. Read-only denial tests are not a substitute for that security gate.

## Evidence and execution

- Focused regressions: node --test tests/cloud-sync.test.cjs
- Native capture/path/recovery tests: cargo test --test backup
- Existing auth regressions: cargo test; node --test tests/google-auth.test.cjs
- Release integration dry run: node tests/cloud-live-verify.cjs (read-only by default)
- Approved real backup/recovery integration: AXION_LIVE_CLOUD_WRITE_APPROVED=yes AXION_EXPECTED_EMAIL=arafat.sofa.point@gmail.com node tests/cloud-live-verify.cjs, against an isolated release WebView debugging port. The opt-in gate is mandatory; do not enable it as part of ordinary tests.
- The live script drives the release's actual button handlers, accepts only expected task-authorized confirmation dialogs, repeats backup for idempotence, recovers solely from a new cloud download, compares every recovered file hash, and writes a sanitized report.

Independent reviewer and live execution results are recorded separately. This contract does not itself certify an execution result.
