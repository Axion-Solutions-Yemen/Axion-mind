# Gates: complete manual cloud backup and recovery

OWNS: ui/index.html, ui/cloud-sync.js, src/backup.rs, src/main.rs, tests/cloud-sync.test.cjs, tests/backup.rs, tests/cloud-live-verify.cjs, docs/CLOUD_SYNC*

Scope: Repair manual backups with complete versioned snapshots, checked typed uploads, readback verification, safe cloud recovery, and preserved authentication/customer files. Automatic multi-device reconciliation is not implemented or advertised.

- [x] G1: Customer files, previous executable and source are preserved before modifications.
  EVIDENCE: Private rollback at C:/Users/AR-Qamzawi/AppData/Local/hermes/integrations/axion-backups/20261021-212824; customer ZIP and cloud baseline sealed by Windows DPAPI and decrypted/hash-checked; previous executable and source checkpoint preserved. 83 original customer-file hashes still match after live backup/recovery.
- [x] G2: Focused regression tests catch the original progress exception and prove complete checked uploads, idempotence and cloud-only recovery.
  CHECK: node --test tests/cloud-sync.test.cjs
  EXPECT: fail 0
  EVIDENCE: automatic-evidence=v1; definition-sha256=ee007f9bd13218c5a87fa2d46a1b8fb2880a064d66b742aebab72cebfb0ee781; exit=0; EXPECT=matched; output-sha256=a01efdc8928fe26fad6b31785241d9dca75e95d300cea9e5cdc46bb8090a24fc; output-bytes=2267; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Side-Projects\StartUp\personas_hub_tauri; path=da09ccb639c7/65 entries
- [x] G3: Native snapshot and sandbox recovery reject corrupt/unsafe content and preserve originals.
  CHECK: C:/Users/AR-Qamzawi/.cargo/bin/cargo.exe test --test backup
  EXPECT: test result: ok.
  EVIDENCE: automatic-evidence=v1; definition-sha256=8c130d56afc928f2c8de461ce48b72f78eef2dfe31576e81127caad03758b33e; exit=0; EXPECT=matched; output-sha256=48f015a0b74f4f29c275d8acaf8c8e0d94cbab8daf30d256e729d987d004a06d; output-bytes=1556; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Side-Projects\StartUp\personas_hub_tauri; path=da09ccb639c7/65 entries
- [x] G4: Existing native and Google controller tests and compilation pass.
  CHECK: C:/Users/AR-Qamzawi/.cargo/bin/cargo.exe test && C:/Users/AR-Qamzawi/.cargo/bin/cargo.exe check && node --test tests/google-auth.test.cjs
  EXPECT: fail 0
  EVIDENCE: automatic-evidence=v1; definition-sha256=28da81195642a16a61e1171834657821824709cc6ee54b0eae04016005b1732b; exit=0; EXPECT=matched; output-sha256=3885badf991ef51dbe52ccf2b668ecc8777ff2d18f08ffb39c7a141be43f1fde; output-bytes=4449; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Side-Projects\StartUp\personas_hub_tauri; path=da09ccb639c7/65 entries
- [x] G5: Release binary builds with Windows console suppression preserved.
  CHECK: C:/Users/AR-Qamzawi/.cargo/bin/cargo.exe build --release
  EXPECT: /Finished .*release.* profile/
  EVIDENCE: automatic-evidence=v1; definition-sha256=c63b0d8c098e12afa8b2ebe01bd72a4d25822d9509575a0b7b997fc596f5fbe3; exit=0; EXPECT=matched; output-sha256=1ca9449adfbe4f8cc672a3ee755562905ccdda90fd52edc29de681f9f5d28eed; output-bytes=1037; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Side-Projects\StartUp\personas_hub_tauri; path=da09ccb639c7/65 entries
- [x] G6: Current account complete cloud snapshot, typed knowledge uploads and idempotence are verified by readback; cloud-only restore matches the snapshot.
  EVIDENCE: tests/cloud-live-verify.cjs exited 0 with LIVE_CLOUD_BACKUP_AND_RECOVERY_PASSED for arafat.sofa.point@gmail.com. 1 customer persona, 35 frameworks, 23 anecdotes, 13 chats, all 83 files including 6 metadata and 63 knowledge files. Repeated sync left counts unchanged; fresh cloud-only recovery matched every raw-file SHA-256. See CLOUD_SYNC_LIVE_VERIFICATION.json.
- [x] G7: Repaired release runs with truthful UI and original customer file hashes unchanged; no temporary debug ports remain.
  EVIDENCE: Final normal-profile process PID 57988 displays arafat.sofa.point@gmail.com. Direct Windows UI Automation opened the actual account modal and confirmed enabled Back Up & Verify Now and Recover Cloud Backup controls. All 83 original customer files retain baseline SHA-256 hashes. Ports 43823, 43821, 9224 and 9225 independently verified closed. Final executable SHA-256 290439c1ce754d1a58a3c4219068c81e255be6d2528b92caadc1f6617ef639ff. Core release verified; G8 remains a separate customer-readiness handoff.
- [ ] G8: Two-account write isolation and actual second-machine behavior are verified.
  EVIDENCE: Scoped real-account negative read probes returned no private records from the other known account for all three tables; no broader write-isolation or second-machine claim is made.

ABANDON: G8 No second Windows machine or controlled staging account pair is available. Production cross-account write probes and RLS/schema changes were not authorized; administrative metadata endpoint returned 401. Customer-readiness handoff, not a completed security/device gate.
