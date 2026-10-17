"""Normalize publisher layout artifacts; no inferred law text or silent anchor substitution."""
from acquire_corpus import *
from difflib import SequenceMatcher
OUT=ROOT/'.clean-corpus'
def clean_candidate(d):
 seed=anchor_catalog().get(d['id']) or load(DATA/'documents'/f"{d['id']}.json")
 oldsections={s['id']:s for s in d['sections']};blocks=[];last=None
 for u in d['units']:
  t=clean_text(u['text'],d['id'])
  if is_editorial(t) or t.startswith('--------------------------------'):continue
  # Number markers from publisher links are not operative law.
  h=u['id']==oldsections[u['sectionId']]['unitIds'][0] and oldsections[u['sectionId']]['title']!='Начало документа'
  b={'text':t,'heading':h,'sourceUrl':u['sourceUrl']}
  if u.get('tableRow'):b['tableRow']=True
  if u.get('imageUrl'):b['imageUrl']=u['imageUrl']
  if d['id']=='goals309':
   n=re.match(r'^(\d+)\.\s',t)
   if n:b['heading']=True;b['sectionTitle']='Пункт '+n[1]
  blocks.append(b)
 units,sections=structure(blocks,d['id'],d['sourceUrl']);d.update(units=units,sections=sections,aliases={},sha256=digest(units))
 d['sourceNote']='Текст нормативного акта. Графические приложения, если они есть, приведены вместе с соответствующим разделом.'
 d['preflight']['anchors']=resolve_anchors(seed,d)
 return d

def main():
 all={}
 for folder in ['.pending-corpus','.pending-other','.pending-goals','.pending-supplements']:
  for p in (ROOT/folder/'documents').glob('*.json'):all[p.stem]=load(p)
 for id,d in all.items():
  d=clean_candidate(d);write(OUT/'documents'/f'{id}.json',d)
  print(id,len(d['units']),d['preflight']['anchors']['resolved'],'/',d['preflight']['anchors']['total'])
  for issue in d['preflight']['anchors']['issues']:
   quote=norm(issue['quote']);candidates=sorted(d['units'],key=lambda u:SequenceMatcher(None,quote,norm(u['text'])).ratio(),reverse=True)[:2]
   issue['closest']=[{'id':u['id'],'locator':u['locator'],'text':u['text']} for u in candidates]
  write(OUT/'anchor-review'/f'{id}.json',d['preflight']['anchors'])
if __name__=='__main__':main()
