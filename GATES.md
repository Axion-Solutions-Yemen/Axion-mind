# Gates: Axion Mind full implementation

OWNS: src/**, ui/**, tests/**, docs/full-implementation/**, capabilities/**, Cargo.toml, Cargo.lock, build.rs, tauri.conf.json

Scope: Implement and independently verify every AX01-AX30 requirement in an isolated worktree; preserve production/customer data. Real-account/device/consent blockers remain explicit handoffs, never fabricated success.

- [x] G1: Full AX01-AX30 acceptance inventory is preserved with implementation and evidence dispositions.
  CHECK: python docs/full-implementation/verify_inventory.py
  EXPECT: AXION_INVENTORY_VERIFIED
  EVIDENCE: automatic-evidence=v1; definition-sha256=6c1fd648c748e758cf4c55cf4ab70a56246a349bc692cbbf1315545efb2cd99b; exit=0; EXPECT=matched; output-sha256=95ebc8db4d0215bd0a481ead88e34af5cc66b19665639ed05d290d943d6f4d52; output-bytes=78; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Side-Projects\StartUp\axion-mind-implementation; path=dbdc69124223/63 entries

- [ ] G2: Integrated native, frontend, negative security and isolated end-to-end checks pass on the final candidate.
  CHECK: python docs/full-implementation/verify_integration.py
  EXPECT: AXION_INTEGRATION_VERIFIED
  EVIDENCE: pending; verifier runs regression suites but fails closed until independently verifiable packaged end-to-end evidence exists.

- [ ] G3: Every requested AX01-AX30 outcome meets original acceptance, including genuine manual/live-device/account evidence where required, or is explicitly handed off as incomplete.
  EVIDENCE: pending; planning documents and local unit tests cannot certify customer usability, persona rights, external accounts or deployment.
