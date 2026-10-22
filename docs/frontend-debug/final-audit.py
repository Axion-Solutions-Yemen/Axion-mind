import datetime, hashlib, json, pathlib, re, subprocess
root=pathlib.Path(__file__).resolve().parents[2]
out=root/'docs/frontend-debug'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
candidate=root/'target/stabilization/release/axion-mind.exe'
files=[p for folder in ['src','ui','capabilities'] for p in (root/folder).rglob('*') if p.is_file()]+[root/p for p in ['Cargo.toml','Cargo.lock','build.rs','tauri.conf.json'] if (root/p).exists()]
manifest={str(p.relative_to(root)).replace('\\','/'):sha(p) for p in sorted(files)}
ui=list((root/'ui').rglob('*')); findings=[]
for p in ui:
 if not p.is_file(): continue
 rel=str(p.relative_to(root)); name=p.name.lower()
 if name.startswith('.env') or p.suffix.lower() in ['.dpapi','.pem','.key','.log','.sqlite','.db'] or name in ['config.json','cookies.json','credentials.json']:
  findings.append({'file':rel,'finding':'sensitive/artifact filename in frontendDist'})
 if p.suffix.lower() in ['.js','.html','.json']:
  text=p.read_text(encoding='utf-8',errors='replace')
  patterns={'private_key':r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----','provider_key':r'\b(?:sk-proj-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,})','jwt':r'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{15,}'}
  for kind,pat in patterns.items():
   if re.search(pat,text):findings.append({'file':rel,'finding':kind+' pattern (value withheld)'})
config=pathlib.Path('C:/Users/AR-Qamzawi/AppData/Local/PersonasHub/config.json')
baseline=json.loads((out/'baseline.json').read_text(encoding='utf-8'))
checks={}
for name in ['config.json','personas.json']:
 p=pathlib.Path(baseline['customer_root'])/name
 expected=baseline['customer_files'].get(name)
 checks[name]={'exists':p.exists(),'baseline_recorded':expected is not None,'matches_baseline':sha(p)==expected if p.exists() and expected else None}
report={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidate':str(candidate),'sha256':sha(candidate),'bytes':candidate.stat().st_size,'source_manifest':manifest,'source_newer_than_candidate':[str(p.relative_to(root)) for p in files if p.stat().st_mtime>candidate.stat().st_mtime],'packaging':{'scope':'Tauri frontendDist ui recursive source inventory; candidate exe not installer/signing certification','asset_count':sum(p.is_file() for p in ui),'findings':findings},'customer_readback':checks,'production_processes':subprocess.check_output(['tasklist','/FI','IMAGENAME eq axion-mind.exe'],text=True)}
(out/'final-candidate-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='source_manifest'},indent=2))
