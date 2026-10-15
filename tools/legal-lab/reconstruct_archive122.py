"""Repair the publicly mislabeled historical edition using dated source text.
The source mixes five clauses from 28.07.2012 into a purported 10.07.2012 edition.
Reverse ONLY those clauses, checked against public original amendments and the
public excerpt of the exact 12.07.2012 edition. This is synthetic consolidation.
"""
from acquire_corpus import *
from clean_corpus import clean_candidate
from finalize_candidates import E
import copy

def main(fetcher_factory=Fetcher):
 d=load(ROOT/'.pending-archive-fixed/documents/archive122.json');original=copy.deepcopy(d);rows=d['units'];changes=[]
 spinurl='https://base.spinform.ru/show_red.fwx?rid=9792';soup=BeautifulSoup((ROOT/'.source-probe/archive-spinform.html').read_text(encoding='utf-8'),'html.parser');text=clean_text(soup.select_one('#doc-text').get_text(' ',strip=True))
 def record(loc,before,after,url):changes.append({'locator':loc,'before':before,'after':after,'sourceUrl':url})
 # Exact previous paragraph text, publicly readable without authorization.
 q1='2. Сведения, содержащиеся в Едином государственном реестре прав, предоставляются в срок не более чем пять рабочих дней со дня получения органом, осуществляющим государственную регистрацию прав, соответствующего запроса (максимальный срок), если иное не установлено настоящим Федеральным законом.'
 q2='Если предоставление запрашиваемых сведений не допускается в соответствии с федеральным законом или в Едином государственном реестре прав отсутствуют запрашиваемые сведения, орган, осуществляющий государственную регистрацию прав, в срок, предусмотренный абзацем первым настоящего пункта, выдает или направляет обоснованное решение об отказе в предоставлении запрашиваемых сведений либо уведомление об отсутствии в Едином государственном реестре прав запрашиваемых сведений.'
 q3='Решение об отказе в предоставлении запрашиваемых сведений может быть обжаловано в судебном порядке.'
 for q in (q1,q2,q3):assert q in text
 a=next(i for i,u in enumerate(rows) if u['locator'].startswith('Статья 7.') and u['text'].startswith('2. Сведения'));z=next(i for i,u in enumerate(rows[a+1:],a+1) if u['text'].startswith('3. Сведения'))
 record('ст7п2',[u['text'] for u in rows[a:z]],[q1,q2,q3],spinurl)
 base=rows[a];rows[a:z]=[{**base,'text':q,'sourceUrl':spinurl} for q in [q1,q2,q3]]
 u=next(u for u in rows if u['locator'].startswith('Статья 7.') and u['text'].startswith('руководителям, заместителям руководителей федеральных органов'))
 prev='руководителям, заместителям руководителей федеральных органов исполнительной власти, руководителям, заместителям руководителей их территориальных органов, руководителям, заместителям руководителей органов государственной власти субъектов Российской Федерации, руководителям, заместителям руководителей органов местного самоуправления, если соответствующие сведения необходимы для осуществления полномочий данных органов в установленной сфере деятельности, в том числе для оказания государственных или муниципальных услуг;'
 source129='https://zakonbase.ru/content/base/177928?print=1';f=fetcher_factory(ROOT/'.source-cache');h=f.get(source129);htext=clean_text(BeautifulSoup(h,'html.parser').get_text(' ',strip=True));assert prev in htext
 record('ст7п3абз5',u['text'],prev,source129);u.update(text=prev,sourceUrl=source129)
 u=next(u for u in rows if u['locator'].startswith('Статья 8.') and u['text'].startswith('федеральных органов исполнительной власти'))
 prev='федеральных органов исполнительной власти, их территориальных органов, органов государственной власти субъектов Российской Федерации, органов местного самоуправления;';assert prev in htext
 record('ст8п2абз4',u['text'],prev,source129);u.update(text=prev,sourceUrl=source129)
 u=next(u for u in rows if u['locator'].startswith('Статья 8.') and u['text'].startswith('3. В срок не более чем пять дней'))
 prev=u['text'].replace('пять дней','десять дней');assert prev[3:] in htext
 record('ст8п3абз1',u['text'],prev,source129);u.update(text=prev,sourceUrl=source129)
 u=next(u for u in rows if u['locator'].startswith('Статья 9.') and u['text'].startswith('2. Предусмотренные'))
 added=' На государственные бюджетные учреждения, наделенные в соответствии с настоящей статьей полномочиями органов, осуществляющих государственную регистрацию прав, распространяются предусмотренные Федеральным законом от 27 июля 2010 года N 210-ФЗ "Об организации предоставления государственных и муниципальных услуг" требования к организации и порядку взаимодействия с заявителями при предоставлении государственных услуг и положения об ответственности за нарушение данных требований.'
 assert u['text'].count(added)==1
 prev=u['text'].replace(added,'');record('ст9п2/третье-предложение',u['text'],prev,'https://www.garant.ru/products/ipo/prime/doc/70107730/');u['text']=prev
 assert not any('многофункциональн' in u['text'] for u in rows)
 assert any(u['locator'].startswith('Статья 13.') and 'не позднее чем в месячный срок' in u['text'] for u in rows)
 d=clean_candidate(d);d.update(asOf='2012-07-12',revisionLabel='Редакция от 10.07.2012, действующая с 12.07.2012',consolidation='Synthetic historical reconstruction: five anachronistic source clauses removed against original 04.06.2011 №129-ФЗ, 28.07.2012 №133-ФЗ and exact dated public excerpt')
 for url in [spinurl,source129]:
  key=hashlib.sha256(url.encode()).hexdigest();d['provenance'].append(load(ROOT/'.source-cache'/(key+'.json')))
 d['provenance'].extend(load(ROOT/'.source-probe/archive133-garant.json')['provenance'])
 write(ROOT/'.clean-corpus/documents/archive122.json',d)
 write(E/'archive122-historical-reconstruction.json',{'reviewKind':'synthetic-source-based','asOf':'2012-07-12','inputSha256':original['sha256'],'candidateSha256':d['sha256'],'sourceDefect':'The purported 10.07.2012 page contains five clauses from later №133-ФЗ; malformed nested HTML also hid article8 before parser repair.','repairs':changes,'checks':{'lateMFCClausesAbsent':True,'article13RemainsOneMonth':True,'article8Restored':True}})
 print('Repaired exactly',len(changes),'dated clauses;',len(d['units']),'paragraphs')
if __name__=='__main__':main()
