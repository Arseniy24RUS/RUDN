"""Prepare audited corpus candidates and exact corrections to legacy quote anchors."""
from acquire_corpus import *
from clean_corpus import clean_candidate
import copy
from prepare_final_cleanup import strip_pdf_notes,rank_table_blocks
OUT=ROOT/'.review-corpus';E=pathlib.Path(os.environ.get('LEGAL_LAB_EVIDENCE_DIR',str(ROOT.parents[1]/'evidence/runs/20261015-legal-lab/corpus'))).resolve();E.mkdir(parents=True,exist_ok=True)
VERSION='legal-lab-2026-10-15.2'
REVISIONS={'constitution':'Текст с изменениями 2020 года и изменениями состава Российской Федерации 2022 года','koap':'Редакция от 04.08.2026','civil79':'Редакция от 08.03.2026; сведения о постановлении КС РФ от 29.09.2026 №56-П сохранены в метаданных источника','municipal25':'Редакция от 28.12.2025','system58':'Редакция от 29.09.2025','local33':'Редакция от 09.04.2026','procurement44':'Редакция от 04.08.2026','corruption273':'Редакция от 25.04.2026','realty218':'Редакция от 04.08.2026','spatial':'Распоряжение от 28.12.2024 №4146-р, первоначальная редакция','goals309':'Указ от 07.05.2024 №309, первоначальная редакция','moscow3':'Редакция от 25.03.2026, действующая с 10.04.2026','moscow50':'Редакция от 25.03.2026, действующая с 30.03.2026','moscow35':'Редакция от 08.06.2026, действующая с 08.06.2026','ekb':'С изменениями по решению Екатеринбургской городской Думы от 23.12.2025','archive122':'Редакция от 10.07.2012, действующая с 12.07.2012'}
# Explicitly inspected source paragraphs; not nearest-neighbour replacement.
CORRECTIONS={'g309life':('goals309','б) увеличение ожидаемой продолжительности жизни'), 'l33transition':('local33','1. До 1 января 2028 года органы местного самоуправления'), 'm50attest':('moscow50','1. Аттестация муниципального служащего (далее - аттестация)'), 's25work':('municipal25','2. Муниципальный служащий, за исключением муниципального служащего, замещающего должность главы местной администрации'), 'p44system':('procurement44','9) единая информационная система в сфере закупок'), 'r69':('realty218','1. Права на объекты недвижимости, возникшие до дня вступления в силу'), 's58federal':('system58','3. Военная служба и государственная служба иных видов,'), 's58time':('system58','2. В стаж (общую продолжительность) государственной службы одного вида')}

def main():
 original=E/'original-anchors.json'
 if not original.exists():write(original,load(DATA/'anchors.json'))
 anchors=load(original);pdf_cleanup=[];table_blocks,table_receipts=rank_table_blocks();candidates={p.stem:load(p) for p in (ROOT/'.clean-corpus/documents').glob('*.json')};changes=[]
 for id,d in candidates.items():
  blocks=[];sections={s['id']:s for s in d['sections']}
  for u in d['units']:
   t=u['text']
   if id in ('moscow3','moscow35') or (id=='ekb' and t.startswith('Принят Решением')):
    t,removed=strip_pdf_notes(t)
    if t=='67-УМ)':t=''
    if t!=u['text']:pdf_cleanup.append({'documentId':id,'sourceUnitId':u['id'],'sourceUrl':u['sourceUrl'],'before':u['text'],'after':t,'removedNotes':removed})
    if not t:continue
   if id=='moscow3' and u['id'] in ('moscow3-u81c081356f2e5f9ba5-1','moscow3-u563ffd4683a9704b74-1','moscow3-u6cfd13279ef8162325-1','moscow3-ucefd2bd1be7bf9690e-1'):
    if u['id']=='moscow3-u81c081356f2e5f9ba5-1':blocks.extend(table_blocks)
    continue
   if t.startswith('Zakonbase:'):continue
   if 'Список изменяющих документов' in t:continue
   if id=='moscow35' and t.startswith('Приложение 2 к указу'):t=t.split(' от 05.08.2019')[0]
   if t.startswith(('Редакция документа с учетом изменений','Редакция статей, частей и пунктов, помеченных','от 24.08.2017 N 56-УМ')):continue
   b={'text':t,'heading':u['id']==sections[u['sectionId']]['unitIds'][0] and sections[u['sectionId']]['title']!='Начало документа','sourceUrl':u['sourceUrl']}
   for k in ['imageUrl','tableRow']:
    if k in u:b[k]=u[k]
   if id=='goals309' and (m:=re.match(r'^(\d+)\. ',t)):b.update(heading=True,sectionTitle='Пункт '+m[1])
   if id=='moscow3':
    # PDF paragraph reflow can put consecutive numbered parts in the same text chunk.
    splits=re.split(r'(?<=[.;]) (?=\d{1,2}(?:\.\d+)?\. [А-Я])',t)
    for i,text in enumerate(splits):blocks.append({**b,'text':text,'heading':b['heading'] and i==0})
   else:blocks.append(b)
  deduped=[]
  for block in blocks:
   if deduped and block.get('heading') and deduped[-1].get('heading') and norm(block['text'])==norm(deduped[-1]['text']):deduped.pop()
   deduped.append(block)
  d['units'],d['sections']=structure(deduped,id,d['sourceUrl']);d.update(version=VERSION,revisionLabel=REVISIONS[id],sha256=digest(d['units']))
 for key,(id,prefix) in CORRECTIONS.items():
  found=[u for u in candidates[id]['units'] if u['text'].startswith(prefix)];assert len(found)==1,(key,len(found));u=found[0]
  a=next(a for a in anchors[id]['units'] if a['id']==key);before=copy.deepcopy(a)
  a.update(text=u['text'],sourceUrl=u['sourceUrl']);a['anchor']['quote']=u['text'];a['anchor']['sourceUrl']=u['sourceUrl']
  changes.append({'id':key,'documentId':id,'before':before,'after':copy.deepcopy(a),'reason':'Exact current source text replaces paraphrased, incomplete, or outdated legacy quotation','sourceUnit':u['id']})
 id='moscow3';key='m3ranks';q='9. Классные чины гражданской службы - действительный государственный советник города Москвы 1, 2 или 3-го класса присваиваются Мэром Москвы.'
 u=next(u for u in candidates[id]['units'] if q in u['text']);a=next(a for a in anchors[id]['units'] if a['id']==key);before=copy.deepcopy(a);a.update(text=q,sourceUrl=u['sourceUrl']);a['anchor'].update(quote=q,sourceUrl=u['sourceUrl']);changes.append({'id':key,'documentId':id,'before':before,'after':copy.deepcopy(a),'reason':'Exact quotation rather than seed paraphrase','sourceUnit':u['id']})
 names=[u for u in candidates['moscow35']['units'] if u['text'].startswith('ПОЛОЖЕНИЕ О ЗНАКЕ ОТЛИЧИЯ') and ('ЗА ЗАСЛУГИ' in u['text'] or 'ЗА БЕЗУПРЕЧНУЮ' in u['text'])]
 assert len(names)==2
 a=next(a for a in anchors['moscow35']['units'] if a['id']=='m35names');before=copy.deepcopy(a);quote='\n'.join(u['text'] for u in names);a.update(text=quote,locator='Приложение 1, заголовки двух положений');a['anchor'].update(quote=quote,locator=a['locator']);changes.append({'id':'m35names','documentId':'moscow35','before':before,'after':copy.deepcopy(a),'reason':'Question34 asks for appendix1: map both actual regulation headings, not the main approval clause','sourceUnits':[u['id'] for u in names]})
 write(E/'pdf-cleanup-receipts.json',{'reviewKind':'synthetic-source-preserving-transformation','notes':pdf_cleanup,'rankTable':table_receipts})
 write(DATA/'anchors.json',anchors);write(E/'anchor-corrections.json',{'reviewKind':'synthetic-source-comparison','changes':changes})
 sources=load(SOURCE_PATH);sm={s['id']:s for s in sources}
 sm['spatial']['requiredMarkers']=['XI.','Приложение № 1','Приложение № 2'];sm['goals309']['requiredMarkers']=['12. Настоящий Указ вступает в силу','7 мая 2024 года'];sm['moscow50']['requiredMarkers']=['Статья 47.','Приложение 1','Приложение 6']
 sm['moscow3'].update(url=candidates['moscow3']['sourceUrl'],adapter='pdf-local')
 sm['moscow35'].update(url=candidates['moscow35']['sourceUrl'],adapter='pdf-local',requiredMarkers=['Приложение 13','Почетный работник в сфере контрольной (надзорной) деятельности'])
 sm['moscow50'].update(url=candidates['moscow50']['sourceUrl'],adapter='amendment-consolidation')
 for id,s in sm.items():s['revisionLabel']=REVISIONS[id]
 write(SOURCE_PATH,sources)
 reports=[]
 for id,d in candidates.items():
  mapping={'m35names':[u['id'] for u in names]} if id=='moscow35' else None
  ar=resolve_anchors(anchors[id],d,mapping);q=thresholds(d,sm[id],len(d['tocInventory']),len(d['tocInventory']));d['preflight']={'anchors':ar,'completeness':q,'legalReviewRequired':True}
  d['sha256']=digest(d['units']);write(OUT/'documents'/f'{id}.json',d)
  reports.append({'id':id,'units':len(d['units']),'sections':len(d['sections']),'anchors':ar,'thresholds':q,'sha256':d['sha256'],'revisionLabel':d['revisionLabel']})
 write(E/'candidate-preflight.json',{'contentVersion':VERSION,'reviewKind':'synthetic-automated','documents':reports});print([(r['id'],r['anchors']['resolved'],r['anchors']['total'],r['thresholds']['issues']) for r in reports])
if __name__=='__main__':main()
