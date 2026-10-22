# Gates: Frontend stabilization

OWNS: ui/**, src/**, tests/**, docs/frontend-debug/**

Scope: Execute the frontend debug plan with preserved data, deterministic race/cancellation/motion tests, and a verified release candidate.

- [x] G1: Baseline binary/source preserved and customer storage hash manifest recorded without secrets
  CHECK: python docs/frontend-debug/baseline.py
  EXPECT: BASELINE_PRESERVED
  EVIDENCE: docs/frontend-debug/baseline.json verified with verify_preservation.py (23 rollback, 90 customer files intact)

- [x] G2: Deterministic JavaScript regressions including adversarial request/history schedules pass
  CHECK: node --test tests/*.test.cjs
  EXPECT: fail 0
  EVIDENCE: 68/68 passed in 402ms

- [x] G3: Native cancellation and isolation tests plus existing native regressions pass
  CHECK: cargo test
  EXPECT: test result: ok
  EVIDENCE: 24 passed across unit and integration suites; 1 live-auth test ignored as designed

- [x] G4: Release candidate builds
  CHECK: cargo build --release
  EXPECT: Finished
  EVIDENCE: target/stabilization/release/axion-mind.exe built (SHA256: 75798fb69ef54b9420130059b68ebfcda53677e3c4a11730e6071addb759a80a)

- [x] G5: Isolated live release matrix covers races, stop persistence, scrolling, motion, input and errors
  CHECK: node tests/stabilization-live.cjs
  EXPECT: STABILIZATION_LIVE_PASSED
  EVIDENCE: 16 live UI scenarios verified over CDP on isolated candidate instance; all passed

- [x] G6: Real provider integration, customer preservation and normal launch verified; limitations recorded
  EVIDENCE: Antigravity 8766 real model smoke check passed (tests/real-model-smoke.cjs); verify_preservation.py confirmed customer data intact
