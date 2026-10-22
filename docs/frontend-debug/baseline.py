from pathlib import Path
import os,json,hashlib,shutil,subprocess,datetime
repo=Path(__file__).resolve().parents[2]
out=repo/'docs/frontend-debug';out.mkdir(parents=True,exist_ok=True)
manifest=out/'baseline.json'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
if manifest.exists():
 print('BASELINE_PRESENT_NOT_RECHECKED (run the separate read-only preservation verifier)');raise SystemExit(0)
backup=Path('C:/Users/AR-Qamzawi/AppData/Local/hermes/cache/scratch')/('axion-stability-rollback-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'));backup.mkdir()
files=[*repo.joinpath('ui').glob('*.*'),*repo.joinpath('src').glob('*.rs'),repo/'tauri.conf.json',repo/'Cargo.toml',repo/'Cargo.lock',repo/'target/release/axion-mind.exe']
sources={}
for p in files:
 if p.is_file():
  rel=p.relative_to(repo);dest=backup/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest);sources[str(rel)]=digest(p)
hub=Path(os.environ['LOCALAPPDATA'])/'PersonasHub';cfg=json.loads((hub/'config.json').read_text(encoding='utf-8')) if (hub/'config.json').exists() else {}
store=Path(cfg.get('custom_storage_dir') or hub)
def inventory(root):
 result={}
 for base in ['personas.json','chats','sessions','personas_data']:
  p=root/base
  items=list(p.rglob('*')) if p.is_dir() else [p]
  for f in items:
   if f.is_file():result[str(f.relative_to(root))]=digest(f)
 return result
result={'time':datetime.datetime.now().astimezone().isoformat(),'rollback':str(backup),'sources':sources,'customer_root':str(store),'customer_files':inventory(store),'auth_hash':digest(hub/'auth/session.dpapi') if (hub/'auth/session.dpapi').exists() else None,'config_hash':digest(hub/'config.json') if (hub/'config.json').exists() else None,'git_status':subprocess.check_output(['git','status','--short'],cwd=repo,text=True)}
manifest.write_text(json.dumps(result,indent=2),encoding='utf-8');print('BASELINE_PRESERVED',len(result['customer_files']),'customer files; rollback:',backup)
