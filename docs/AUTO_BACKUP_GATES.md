# Account-scoped automatic backup update

Scope updated by direct user clarification: "i want the backups to be automatic for all the accounts". Automatic backups default ON for each backend-verified signed-in account and current local storage folder; explicit per-account/folder off remains available. This authorizes current-account catch-up and future active-account scheduling, not logging into signed-out accounts, cross-account database access, deletion or two-way merging. The same local workspace is shared across sign-ins; the UI must state that explicitly.

- [x] G1: Current customer files, source and previous executable preserved before editing.
  EVIDENCE: Verified encrypted rollback C:/Users/AR-Qamzawi/AppData/Local/hermes/integrations/axion-backups/20261021-225549; 85 files, current arafat.trans@gmail.com cloud baseline 1 persona / 22 cards / 13 chats.
- [x] G2: Scheduler regressions exercise opt-in, timing, unchanged-data skip, account/storage changes, offline/backoff, concurrency, cancellation, stale async completions and persisted last verification.
  CHECK: node --test --test-reporter=tap tests/auto-backup.test.cjs
  EXPECT: /# fail 0/
  EVIDENCE: automatic-evidence=v1; definition-sha256=c603333d1769ad974ee792cd3808b39f2355a97cd068b32e54c56bfd39e0a8d0; exit=0; EXPECT=matched; output-sha256=b93de6ea5ba83ab04ca22bfae244d2aeb21ceec18258b852de3852a8707ad7ea; output-bytes=4248; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Side-Projects\StartUp\personas_hub_tauri; path=bc6adc5f725c/64 entries
- [x] G3: Full cloud/auth/native regressions and Rust type checking pass.
  CHECK: node --test --test-reporter=tap tests/cloud-sync.test.cjs tests/google-auth.test.cjs tests/auto-backup.test.cjs && C:/Users/AR-Qamzawi/.cargo/bin/cargo.exe test && C:/Users/AR-Qamzawi/.cargo/bin/cargo.exe check
  EXPECT: /Finished .*dev.* profile/
  EVIDENCE: automatic-evidence=v1; definition-sha256=1d189c0fab7953b9c6c12f7393ed9d504d703aee66222ed2d39394db2ce7a5ce; exit=0; EXPECT=matched; output-sha256=c324bcc5edc81aa2f823661ace807e8c89f9274765a75e79b38764d83cd0fdd3; output-bytes=14869; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Side-Projects\StartUp\personas_hub_tauri; path=bc6adc5f725c/64 entries
- [x] G4: Independent read-only security/correctness review is dispositioned with actual findings and focused fixes.
  EVIDENCE: Three actual read-only Codex reports retained under AUTO_BACKUP_REVIEW_DISPOSITION.json. Initial persistence/offline and subsequent enable/pause race findings all reproduced by RED regressions then fixed. Final queued-pause correction is covered by real regression and real blocked-network native pause. No clean independent final approval is claimed.
- [x] G5: Repaired Windows GUI release builds.
  CHECK: C:/Users/AR-Qamzawi/.cargo/bin/cargo.exe build --release
  EXPECT: /Finished .*release.* profile/
  EVIDENCE: automatic-evidence=v1; definition-sha256=c63b0d8c098e12afa8b2ebe01bd72a4d25822d9509575a0b7b997fc596f5fbe3; exit=0; EXPECT=matched; output-sha256=9bd332d14b8ac3e97fc88ba838a1dd6a5aa3b78b317642dd27b91f20815aeb9c; output-bytes=1037; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Side-Projects\StartUp\personas_hub_tauri; path=bc6adc5f725c/64 entries
- [x] G6: Actual release verifies current identity, scope, controls, persisted metadata and default-ON scheduler with approved production upload; normal app and preservation of pre-existing customer content verified after restart (concurrent additive session entries preserved, not reverted).
  EVIDENCE: Actual default automatic release uploaded and verified the current account; fresh cloud download matches digest and all categories; unchanged data skipped; real offline pause exercised with Supabase requests blocked. Native OFF/ON readback passed. Final normal app PID 35844 UI Automation confirms ar...trans@gmail.com, toggle On, last-verified summary and Backup matches local sidebar. All debug ports closed. 84 original files retain exact hashes; one session index gained entries with all six original entries intact; new chats preserved, not deleted. Final GET-only database audit verifies the latest snapshot against current files and confirms all current cards present; 22 legacy rows retained. See AUTO_BACKUP_LIVE_VERIFICATION.json and AUTO_BACKUP_FINAL_DATABASE_AUDIT.json.
- [x] G7: Opt-in policy, schedule, failure behavior and accurate limitations documented; live current-account upload is authorized by the all-accounts clarification; signed-out accounts are not accessed.
  EVIDENCE: AUTO_BACKUP.md documents the user-authorized all-account default, shared local workspace, 30-second checks / 5-minute changed-data cadence, bounded retry and native offline OFF persistence, no automatic download/merge, and unverified second-device/write-isolation boundaries.
