#!/usr/bin/env python3
"""Acquire public legal text, preserve fresh source receipts, stage for content review.
No access-control bypass. Completeness requires checked TOC leaves and terminal clauses.
"""
from __future__ import annotations
import os, argparse, datetime as dt, hashlib, json, pathlib, re, sys, time, unicodedata
from urllib.parse import urljoin,urlsplit,urldefrag
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
ROOT=pathlib.Path(os.environ.get('LEGAL_LAB_WORK_ROOT',pathlib.Path(__file__).resolve().parents[1])).resolve()
DATA=pathlib.Path(os.environ.get('LEGAL_LAB_DATA_DIR',ROOT/'site/apps/legal-lab/data')).resolve()
SOURCE_PATH=pathlib.Path(__file__).with_name('sources.json')
def canonical(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def digest(v):return hashlib.sha256(canonical(v)).hexdigest()
def norm(s):
 s=unicodedata.normalize('NFKC',s).lower().replace('ё','е');s=re.sub(r'[«»„“”"\'’]','',s);s=re.sub('[–—−]','-',s)
 return re.sub(r'\s+',' ',s).strip()
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def write(p,v):
 p=pathlib.Path(p);p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix(p.suffix+'.tmp');tmp.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n','utf-8',newline='\n');tmp.replace(p)
class Fetcher:
 def __init__(self,cache,delay=.25,timeout=40,max_age_hours=24):
  self.cache=pathlib.Path(cache);self.cache.mkdir(parents=True,exist_ok=True);self.delay=delay;self.timeout=timeout;self.records=[];self.max_age=max_age_hours*3600
 def get(self,url):
  if urlsplit(url).scheme not in ('http','https'):raise ValueError('Only public HTTP(S)')
  key=hashlib.sha256(url.encode()).hexdigest();p=self.cache/(key+'.html');meta=self.cache/(key+'.json');m=load(meta) if meta.exists() else None
  fresh=m and (dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(m['retrievedAt'])).total_seconds()<self.max_age
  if fresh and p.exists():
   raw=p.read_bytes()
   if hashlib.sha256(raw).hexdigest()!=m['sha256']:raise ValueError('Raw cache checksum mismatch')
  else:
   time.sleep(self.delay)
   with urlopen(Request(url,headers={'User-Agent':'RUDN-Legal-Lab-Content-Preparation/1.1 (public educational corpus)'}),timeout=self.timeout) as r:
    raw=r.read(35000001)
    if len(raw)>35000000:raise ValueError('Source unexpectedly large')
    encoding=r.headers.get_content_charset() or 'utf-8';text=raw.decode(encoding)
    if re.search(r'(докажите, что вы|подтвердите, что вы не робот|доступен по\s*расписанию)',BeautifulSoup(text,'html.parser').get_text(' ',strip=True),re.I):raise ValueError('Source access restriction: use another public source')
    m={'url':url,'resolvedUrl':r.url,'retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'encoding':encoding,'httpStatus':r.status,'file':str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p)}
   p.write_bytes(raw);write(meta,m)
  self.records.append(m);return raw.decode(m.get('encoding','utf-8'))
EDITORIAL=re.compile(r'^(\(в ред\.|\(см\.|\(часть .*введена|\(п\.? .*в ред|КонсультантПлюс:|Zakonbase:|ГАРАНТ:|См\. (текст|предыдущую|также|сравнение)|Информация об изменениях|Комментарии к статье|Список изменяющих документов|©|Все права защищены)',re.I)
HEADING=re.compile(r'^(?:Статья\s+\d+(?:\.\d+)*(?:\.\s|\s*$)|Глава\s+[\dIVX]|Раздел\s+|[IVX]{1,8}\.\s|Приложение\s*(?:№|N|\d|$))',re.I)
def clean_text(text,doc_id=''):
 text=re.sub(r'\s+',' ',text).strip()
 if doc_id=='constitution':text=re.sub(r'\s*<\*+>\s*',' ',text)
 text=re.sub(r'\s+([,.;:!?])',r'\1',text)
 text=re.sub(r'([«(])\s+',r'\1',text);text=re.sub(r'\s+([»)])',r'\1',text)
 return text

def is_editorial(text):
 return bool(EDITORIAL.match(text) or re.match(r'^\((?:.*(?:в ред\.|введен|в редакции|редакция|изменени|изменен|дополнен|абзац|часть|пункт|подпункт|дефис|преамбула|приложение))',text,re.I))

def extract_html(html,source,default_title):
 soup=BeautifulSoup(html,'html.parser');selectors=[source['selector']] if source.get('selector') else ['.document-page__content','#primeDocs','.document__content','.doc-content','article','main','.content']
 nodes=[]
 for sel in selectors:
  nodes=soup.select(sel)
  if nodes:break
 if not nodes:nodes=soup.find_all('pre')
 if not nodes:raise ValueError('No reliable legal document container')
 node=max(nodes,key=lambda x:len(x.get_text()))
 for x in node.select('script,style,nav,footer,header,aside,form,button,.document-page__toc,.document-page__comment,.document-page__reference,.advertisement,.ad,.consultantplus-note,.doc__annotation,.document__insert,.doc-insert'):x.decompose()
 if node.name=='pre':return extract_text(node.get_text(),default_title)
 out=[]
 tags=['p','h1','h2','h3','h4','li','tr']
 if source.get('includeLeafDivs'):tags.append('div')
 if source.get('includeAnchorHeadings'):tags.append('a')
 for b in node.find_all(tags):
  if b.find_parent(['td','th']) is not None:continue
  if b.name in ['li','h1','h2','h3','h4','div'] and b.find(tags):continue
  if b.name=='a' and not b.get('class')==['title']:continue
  if b.name!='p' and b.find_parent('p') is not None:continue
  if b.name=='p' and b.find('p'):
   # Some public archives emit malformed nested paragraphs. Preserve each leaf.
   shallow=BeautifulSoup(str(b),'html.parser').find('p')
   for nested in list(shallow.find_all('p')):nested.decompose()
   b=shallow
  text=' | '.join(c.get_text(' ',strip=True) for c in b.find_all(['td','th'],recursive=False)) if b.name=='tr' else ' '.join(b.stripped_strings)
  text=clean_text(text,source.get('id',''))
  if not text or is_editorial(text) or text in ('Открыть полный текст документа','Документ','Содержание'):continue
  out.append({'text':text,'heading':(b.name.startswith('h') or bool(HEADING.match(text))) and len(text)<500,'tableRow':b.name=='tr'})
 if not out:raise ValueError('No legal paragraphs')
 return out

def extract_text(text,default_title):
 if '\x00' in text:raise ValueError('Not a text export')
 return [{'text':p,'heading':bool(HEADING.match(p)) and len(p)<500} for p in (re.sub(r'\s+',' ',x).strip() for x in re.split(r'\n\s*\n',text.replace('\r\n','\n'))) if p and not EDITORIAL.match(p)]
def article_links(html,base):
 soup=BeautifulSoup(html,'html.parser');seen=set();out=[];prefix=urlsplit(base).path.rstrip('/')+'/'
 for a in soup.select('a[href]'):
  label=a.get_text(' ',strip=True);url=urldefrag(urljoin(base,a['href']))[0];p=urlsplit(url)
  if not re.match(r'^Статья\s+\d',label) or p.netloc!=urlsplit(base).netloc or not p.path.startswith(prefix) or p.path==prefix or p.query or url in seen:continue
  seen.add(url);out.append((label,url))
 return out
def toc_links(html,base):
 soup=BeautifulSoup(html,'html.parser');toc=soup.select_one('.document-page__toc');seen=set();out=[];prefix=urlsplit(base).path.rstrip('/')+'/'
 if not toc:return []
 for a in toc.select('a[href]'):
  label=a.get_text(' ',strip=True);url=urldefrag(urljoin(base,a['href']))[0];p=urlsplit(url)
  if p.netloc!=urlsplit(base).netloc or not p.path.startswith(prefix) or p.path==prefix or p.query or url in seen:continue
  seen.add(url);out.append((label,url))
 return out

def structure(blocks,doc_id,source_url):
 sections=[];units=[];current=None;occ={}
 for b in blocks:
  text=b['text'].strip()
  if not text:continue
  if b.get('heading') or current is None:
   current={'id':f'{doc_id}-s{len(sections)+1}','title':b.get('sectionTitle',text) if b.get('heading') else 'Начало документа','unitIds':[]};sections.append(current)
  token=hashlib.sha256(norm(text).encode()).hexdigest()[:18];occ[token]=occ.get(token,0)+1
  u={'id':f'{doc_id}-u{token}-{occ[token]}','sectionId':current['id'],'locator':current['title'],'text':text,'sourceUrl':b.get('sourceUrl',source_url)}
  if b.get('tableRow'):u['tableRow']=True
  if b.get('imageUrl'):u['imageUrl']=b['imageUrl']
  units.append(u);current['unitIds'].append(u['id'])
 return units,sections

def resolve_anchors(seed,candidate,mapping=None):
 units=candidate['units'];known={u['id'] for u in units};aliases={};issues=[];normalized=[norm(u['text']) for u in units];mapping=mapping or {}
 for old in seed['units']:
  key=old['id']
  if key in mapping:
   ids=mapping[key]
   if not isinstance(ids,list) or not ids or any(x not in known for x in ids):issues.append({'id':key,'error':'invalid explicit mapping'});continue
   aliases[key]=list(dict.fromkeys(ids));continue
  quote=norm(old.get('anchor',{}).get('quote') or old['text']);hits=[]
  for i,text in enumerate(normalized):
   if quote in text:hits.append([units[i]['id']])
   elif len(quote)>len(text) and (quote.startswith(text) or text.startswith(quote[:60])):
    combined=text
    for j in range(i+1,min(i+35,len(units))):
     combined+=' '+normalized[j]
     if quote in combined:hits.append([u['id'] for u in units[i:j+1]]);break
     if len(combined)>len(quote)*2+1000:break
  hits=list({tuple(h):h for h in hits}.values())
  if len(hits)==1:aliases[key]=hits[0]
  else:issues.append({'id':key,'locator':old['locator'],'quote':old['text'],'candidates':hits,'error':'not-found' if not hits else 'ambiguous'})
 candidate['aliases']=aliases;return {'resolved':len(aliases),'total':len(seed['units']),'issues':issues}

def thresholds(candidate,source,expected_pages=0,pages_loaded=0):
 n=sum(len(u['text']) for u in candidate['units']);s=len(candidate['sections']);errors=[]
 if n<source.get('minCharacters',1000):errors.append(f'Only {n} characters; expected at least {source.get("minCharacters")}')
 if s<source.get('minSections',1):errors.append(f'Only {s} sections; expected at least {source.get("minSections")}')
 if expected_pages and expected_pages!=pages_loaded:errors.append('Not all TOC leaves loaded')
 full=' '.join(norm(u['text']) for u in candidate['units'])
 for marker in source.get('requiredMarkers',[]):
  if norm(marker) not in full:errors.append('Missing structural marker: '+marker)
 return {'characters':n,'sections':s,'expectedPages':expected_pages,'loadedPages':pages_loaded,'requiredMarkers':source.get('requiredMarkers',[]),'issues':errors,'heuristicOnly':True}

def prepare_one(source,args,fetcher):
 seed=load(DATA/'documents'/f"{source['id']}.json");start=len(fetcher.records);url=source['url'];expected=loaded=0;blocks=[];page_inventory=[]
 local=pathlib.Path(args.local_dir)/source['id'] if args.local_dir else None
 file=next((local.with_suffix(e) for e in ('.json','.html','.txt') if local and local.with_suffix(e).exists()),None)
 if file:
  text=file.read_text('utf-8-sig');raw=json.loads(text) if file.suffix=='.json' else None
  blocks=raw['blocks'] if raw else extract_text(text,seed['title']) if file.suffix=='.txt' else extract_html(text,source,seed['title']);url=raw.get('sourceUrl',url) if raw else url
  provenance=(raw.get('provenance',[]) if raw else [])+[{'localFile':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'sourceUrl':url}]
 else:
  html=fetcher.get(url);blocks=extract_html(html,source,seed['title'])
  if source['adapter']=='consultant':
   links=toc_links(html,url);expected=len(links)
   if expected<source.get('minTocPages',source.get('minSections',1)):raise ValueError('Incomplete TOC')
   def page(item):
    label,child=item;b=extract_html(fetcher.get(child),source,label)
    if not any(norm(x['text'])==norm(label) for x in b):b.insert(0,{'text':label,'heading':True})
    for x in b:x['sourceUrl']=child
    return b,{'label':label,'url':child,'paragraphs':len(b),'characters':sum(len(x['text']) for x in b)}
   with ThreadPoolExecutor(max_workers=args.workers) as pool:
    for i,(b,receipt) in enumerate(pool.map(page,links)):
     blocks.extend(b);loaded+=1;page_inventory.append(receipt)
     if i%100==0:print(source['id'],loaded,'/',expected,flush=True)
  provenance=sorted(fetcher.records[start:],key=lambda x:x['url'])
 units,sections=structure(blocks,seed['id'],url)
 candidate={**seed,'units':units,'sections':sections,'aliases':{},'coverage':'candidate','reviewStatus':'pending-review','sourceUrl':url,'provenance':provenance,'revisionLabel':source.get('revisionLabel',args.revision_label or 'Редакция источника; проверка применимости не завершена'),'sha256':digest(units),'sourceTitle':BeautifulSoup(html,'html.parser').title.get_text(' ',strip=True) if not file else seed['title'],'asOf':source.get('asOf',args.as_of),'tocInventory':page_inventory}
 map_path=pathlib.Path(args.mappings)/f"{source['id']}.json" if args.mappings else None;mapping=load(map_path) if map_path and map_path.exists() else {}
 anchors=resolve_anchors(load(DATA/'anchors.json').get(seed['id'],seed),candidate,mapping);quality=thresholds(candidate,source,expected,loaded)
 if file and raw:
  candidate['revisionLabel']=raw.get('revision',candidate['revisionLabel'])
  candidate['consolidation']=raw.get('consolidation')
 candidate['preflight']={'anchors':anchors,'completeness':quality,'legalReviewRequired':True};write(pathlib.Path(args.output)/'documents'/f"{source['id']}.json",candidate)
 return {'id':source['id'],'status':'candidate' if not quality['issues'] and not anchors['issues'] else 'needs-fix','preflight':candidate['preflight'],'sha256':candidate['sha256']}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--ids',nargs='*');p.add_argument('--local-dir');p.add_argument('--mappings');p.add_argument('--output',default=str(ROOT/'.pending-corpus'));p.add_argument('--sources',default=str(SOURCE_PATH));p.add_argument('--cache',default=str(ROOT/'.source-cache'));p.add_argument('--delay',type=float,default=.25);p.add_argument('--timeout',type=int,default=40);p.add_argument('--revision-label');p.add_argument('--as-of',default='2026-10-15');p.add_argument('--max-cache-age-hours',type=float,default=24);p.add_argument('--workers',type=int,default=4);args=p.parse_args()
 chosen=[s for s in load(args.sources) if not args.ids or s['id'] in args.ids];fetcher=Fetcher(pathlib.Path(args.cache),max(.2,args.delay),args.timeout,args.max_cache_age_hours);report=[]
 for source in chosen:
  try:item=prepare_one(source,args,fetcher)
  except Exception as exc:item={'id':source['id'],'status':'failed','error':str(exc)}
  report.append(item);print(source['id'],item['status'],item.get('error',''),flush=True);write(pathlib.Path(args.output)/'acquisition-report.json',{'createdAt':dt.datetime.now(dt.timezone.utc).isoformat(),'documents':report,'published':False})
 return int(any(x['status']!='candidate' for x in report))
if __name__=='__main__':sys.exit(main())
