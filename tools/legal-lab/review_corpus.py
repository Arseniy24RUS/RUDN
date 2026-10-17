#!/usr/bin/env python3
"""Validate source-backed review evidence and install the active catalog documents.
Synthetic and human review are explicitly distinguished. No claims are inferred
from byte length, coverage flags, or a checked attestation alone.
"""
import argparse,datetime as dt,json,pathlib,shutil,sys,re,hashlib
from acquire_corpus import ROOT,DATA,load,write,digest,thresholds,norm,SOURCE_PATH,anchor_catalog
VERSION='legal-lab-2026-10-15.2'

def structural_review(d):
 issues=[];units=d.get('units',[]);known={u['id']:u for u in units};sections=d.get('sections',[]);seen=[]
 for s in sections:
  if not s.get('unitIds'):issues.append('Empty section '+s['id'])
  for uid in s.get('unitIds',[]):
   if uid not in known:issues.append('Missing section unit '+uid)
   elif known[uid]['sectionId']!=s['id']:issues.append('Wrong section link '+uid)
   seen.append(uid)
 if seen!=[u['id'] for u in units]:issues.append('Sections do not partition the full ordered text')
 toc=d.get('tocInventory',[]);by_url={}
 for u in units:by_url.setdefault(u.get('sourceUrl'),[]).append(u)
 for page in toc:
  actual=by_url.get(page['url'],[])
  if not actual:issues.append('Missing TOC page '+page['url'])
  if not page.get('paragraphs') or page.get('characters',0)<len(page.get('label','')):issues.append('Empty TOC leaf '+page['url'])
 text=' '.join(u['text'] for u in units);id=d['id'];images=[]
 def require(pattern,label):
  if not re.search(pattern,text,re.I):issues.append('Missing structural clause '+label)
 article_ends={'constitution':137,'koap':32.14,'civil79':73,'municipal25':37,'system58':19,'local33':94,'procurement44':114,'corruption273':14,'realty218':72,'moscow3':63,'moscow50':47,'ekb':70,'archive122':33}
 if id in article_ends:require(r'Статья\s+'+re.escape(str(article_ends[id]))+r'(?:\.|\b)','terminal article '+str(article_ends[id]))
 if id=='constitution':require(r'ЗАКЛЮЧИТЕЛЬНЫЕ И ПЕРЕХОДНЫЕ ПОЛОЖЕНИЯ','second section')
 if id=='spatial':
  require(r'XII\. Модель управления','strategy XII')
  for n in (1,2):require(r'Приложение\s*№\s*'+str(n),'strategy annex '+str(n))
  require(r'Перечень утративших силу актов','repealed acts annex')
 if id=='goals309':
  for n in range(1,13):
   if not any(u['text'].startswith(str(n)+'. ') for u in units):issues.append('Missing operative point '+str(n))
 if id in ('moscow35','moscow50'):
  for n in range(1,14 if id=='moscow35' else 7):require(r'Приложение\s*'+str(n)+r'\s+к\s+(?:указу|Закону)','annex '+str(n))
 if id=='moscow35':
  for n in range(1,5):require(r'Приложение\s*'+str(n)+r'\s+к Инструкции','instruction annex '+str(n))
  if sum(bool(u.get('imageUrl')) for u in units)!=7:issues.append('Missing one of seven graphic annex pages')
  require(r'до 15 премий','2025 security prize amendment')
  require(r'Почетный работник в сфере контрольной','2025 honorary title amendment')
  require(r'страховой номер индивидуального лицевого счета','2026 form amendment')
  if 'государственной службы и кадров' in text:issues.append('Superseded department name remains')
 if id=='archive122':
  if d.get('asOf')!='2012-07-12':issues.append('Historical date not preserved')
  if 'многофункциональн' in text.lower():issues.append('Post-cutoff MFC clause')
  require(r'не позднее чем в месячный срок','historical registration time')
  a8=[u for u in units if u.get('locator','').startswith('Статья 8.')]
  if len(a8)<10:issues.append('Article8 lost by malformed HTML parser')
 for u in units:
  if 'Список изменяющих документов' in u['text']:issues.append('Publisher revision list in text')
  if u.get('imageUrl'):
   path=DATA/u['imageUrl']
   if not path.is_file():issues.append('Missing graphic '+u['imageUrl'])
   else:images.append({'file':u['imageUrl'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size})
 # Completeness is content/structure based; sizes are diagnostic only.
 return {'reviewKind':'synthetic-automated-structural','tocPagesChecked':len(toc),'sections':len(sections),'units':len(units),'charactersDiagnostic':len(text),'graphicFiles':images,'issues':issues}

def validate_review(catalog,candidates,attestation,sources):
 issues=[];by_id={x['id']:x for x in attestation.get('documents',[])};sm={s['id']:s for s in sources}
 for field in ('reviewer','reviewedAt','asOf'):
  if not str(attestation.get(field,'')).strip():issues.append('Missing '+field)
 if attestation.get('reviewKind') not in ('synthetic-source-audit','human-source-audit'):issues.append('Missing explicit reviewKind')
 for meta in catalog['documents']:
  id=meta['id'];d=candidates.get(id);a=by_id.get(id,{})
  if not d:issues.append('Missing full document '+id);continue
  if digest(d['units'])!=d.get('sha256'):issues.append('Hash mismatch '+id)
  if a.get('sha256')!=d.get('sha256'):issues.append('Review hash mismatch '+id)
  if not a.get('revisionLabel'):issues.append('Missing revision label '+id)
  for field in ('completeIncludingAnnexes','applicableRevisionChecked','allQuestionAnchorsChecked','editorialMaterialRemoved'):
   if a.get(field) is not True:issues.append(id+': unchecked '+field)
  if not a.get('evidence'):issues.append('Missing per-document evidence '+id)
  expected=(anchor_catalog().get(id) or load(DATA/'documents'/f'{id}.json')).get('units',[]);known={u['id'] for u in d['units']}
  for target in expected:
   mapped=d.get('aliases',{}).get(target['id'])
   if not isinstance(mapped,list) or not mapped or any(u not in known for u in mapped):issues.append('Invalid anchor '+id+'/'+target['id'])
  pf=d.get('preflight',{}).get('anchors',{})
  if pf.get('total')!=len(expected) or pf.get('resolved')!=len(expected) or pf.get('issues'):issues.append('Incomplete anchor preflight '+id)
  if id in sm:issues.extend(id+': '+s for s in thresholds(d,sm[id])['issues'])
  issues.extend(id+': '+s for s in structural_review(d)['issues'])
 return issues

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--staged',default=str(ROOT/'.review-corpus'));p.add_argument('--attestation');p.add_argument('--template',action='store_true');p.add_argument('--install',action='store_true');p.add_argument('--structural-report');args=p.parse_args()
 staged=pathlib.Path(args.staged);cat=load(DATA/'catalog.json');candidates={f.stem:load(f) for f in (staged/'documents').glob('*.json')}
 if args.structural_report:
  reports={id:structural_review(d) for id,d in candidates.items()};write(args.structural_report,reports);print(json.dumps({id:r['issues'] for id,r in reports.items()},ensure_ascii=False));return int(any(r['issues'] for r in reports.values()))
 if args.template:
  a={'reviewKind':'synthetic-source-audit','reviewer':'','reviewedAt':'','asOf':'2026-10-15','documents':[{'id':m['id'],'sha256':candidates.get(m['id'],{}).get('sha256'),'revisionLabel':'','completeIncludingAnnexes':False,'applicableRevisionChecked':False,'allQuestionAnchorsChecked':False,'editorialMaterialRemoved':False,'evidence':[]} for m in cat['documents']]};write(staged/'review-attestation.template.json',a);print('Created unchecked review template.');return 0
 if not args.attestation:p.error('--attestation required')
 a=load(args.attestation);issues=validate_review(cat,candidates,a,load(SOURCE_PATH))
 if issues:print('\n'.join(issues));return 1
 if not args.install:print('Source review and structural checks pass.');return 0
 backup=ROOT/'.corpus-backups'/dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ');backup.mkdir(parents=True)
 shutil.copy2(DATA/'catalog.json',backup/'catalog.json');shutil.copytree(DATA/'documents',backup/'documents')
 for meta in cat['documents']:
  d=candidates[meta['id']];d.update(version=VERSION,coverage='full',reviewStatus='reviewed',reviewKind=a['reviewKind'],reviewer=a['reviewer'],reviewedAt=a['reviewedAt']);d['sha256']=digest(d['units']);d['preflight']['legalReviewRequired']=False;d['structuralReview']=structural_review(d);write(DATA/meta['file'],d)
  meta.update({k:d[k] for k in ['version','coverage','reviewStatus','reviewKind','revisionLabel','sourceUrl','sha256']});meta['unitCount']=len(d['units'])
 cat.update(contentVersion=VERSION,release={'status':'reviewed','reviewKind':a['reviewKind'],'reviewedBy':a['reviewer'],'reviewedAt':a['reviewedAt'],'asOf':a['asOf'],'mainDocumentsComplete':True,'allDocumentsComplete':True,'reviewAttestationHash':digest(a)})
 cat.pop('coverageNotice',None)
 write(DATA/'catalog.json',cat);write(ROOT/'docs/corpus-review.json',a)
 print('Installed',VERSION,'all',len(candidates),'documents. Bank and platform files were not changed.')
 return 0
if __name__=='__main__':sys.exit(main())
