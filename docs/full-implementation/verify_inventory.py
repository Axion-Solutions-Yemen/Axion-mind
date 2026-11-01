import json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
original=json.loads(Path('D:/Side-Projects/StartUp/axion-improvement-plan/BACKLOG.json').read_text(encoding='utf-8'))['items']
actual=json.loads((root/'docs/full-implementation/inventory.json').read_text())['packages']
assert len(actual)==len(original)
index={x['id']:x for x in actual}
assert len(index)==len(actual)
for old in original:
    new=index[old['id']]
    assert new['acceptance']==old['acceptance']
    assert [x['criterion'] for x in new['acceptance_dispositions']]==old['acceptance']
    assert all(x['state']=='UNVERIFIED' for x in new['acceptance_dispositions'])
    for p in new['evidence']: assert (root/p).is_file(),p
print('AXION_INVENTORY_VERIFIED',len(actual),'packages',sum(len(x['acceptance']) for x in actual),'criteria; not application completion')
