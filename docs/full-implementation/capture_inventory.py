import json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
original=json.loads(Path('D:/Side-Projects/StartUp/axion-improvement-plan/BACKLOG.json').read_text(encoding='utf-8'))
rows=[]
for item in original['items']:
    rows.append({**item,'state':'PARTIAL' if item['id'] in ['AX03','AX06','AX07','AX28'] else 'NOT_IMPLEMENTED','evidence':['tests/conversation_context.rs','tests/consultant-history.test.cjs','context-green.log','native-regression.log','frontend-regression.log'] if item['id']=='AX03' else [],'acceptance_dispositions':[{'criterion':a,'state':'UNVERIFIED','reason':'Focused context tests do not establish restart, live runtime, packaged UI, privacy or full-plan acceptance.' if item['id']=='AX03' else 'Not implemented or verified in this tranche.'} for a in item['acceptance']]})
(root/'docs/full-implementation/inventory.json').write_text(json.dumps({'packages':rows,'complete':False},indent=2),encoding='utf-8')
print('Inventory recorded; all full package acceptances remain unverified')
