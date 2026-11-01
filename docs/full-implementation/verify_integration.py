import json
import subprocess
from pathlib import Path
R=Path(__file__).resolve().parents[2]
for command,name in [(['cargo','test','--tests'],'native-regression.log'),(['node','--test',*map(str, sorted((R/'tests').glob('*.test.cjs')))],'frontend-regression.log')]:
    result=subprocess.run(command,cwd=R,capture_output=True,text=True,encoding='utf-8',errors='replace')
    (R/name).write_text(result.stdout+result.stderr,encoding='utf-8')
    if result.returncode: raise SystemExit(f'FAIL: {name}')
# Unit/source checks alone cannot certify a packaged native end-to-end candidate.
path=R/'docs/full-implementation/packaged-e2e.json'
if not path.exists(): raise SystemExit('BLOCKED: no fresh packaged end-to-end runtime/security/UI evidence; local regression logs are not G2 certification')
data=json.loads(path.read_text())
assert data.get('status')=='PASS' and data.get('candidate_hash') and data.get('revision')
raise SystemExit('BLOCKED: independent evidence verifier for packaged runtime not implemented; do not accept arbitrary PASS JSON')
