"""Reproducible consolidation of public Moscow amendments; every change is receipted.
Synthetic editorial consolidation, not a signed official consolidated edition.
"""
from pathlib import Path
import re,json,hashlib,datetime as dt,copy
from bs4 import BeautifulSoup
from acquire_corpus import ROOT,DATA,load,write,extract_html,clean_text,is_editorial
P=ROOT/'.source-probe';O=ROOT/'.supplement-blocks';receipts=[]
def receipt(label,before,after,source):
 assert before!=after,label
 receipts.append({'clause':label,'sourceUrl':source,'before':before,'after':after})
 return after
def change(block,old,new,label,source,count=1):
 assert block['text'].count(old)==count,(label,old,block['text'])
 block['text']=receipt(label,block['text'],block['text'].replace(old,new),source)
def join_blocks(blocks):
 out=[]
 for src in blocks:
  b=copy.deepcopy(src);t=b['text'];t=re.sub(r'\([^()]*(?:в ред\.|введен[аоы]?|изменен[аоы]?)[^()]*\)','',t,flags=re.I);t=clean_text(t)
  if not t or is_editorial(t):continue
  b['text']=t
  if out and re.match(r'^[а-яa-z]',t) and not b.get('heading') and not re.search(r'[.;:!?»"]$',out[-1]['text']):out[-1]['text']+=' '+t
  else:out.append(b)
 return out

def moscow50():
 url=load(P/'moscow50-2025.html.receipt.json')['url'];amend='https://moskva-pravo.ru/zakon/2026/03/25/n-4/'
 html=(P/'moscow50-2025.html').read_bytes().decode('utf-8');b=extract_html(html,{'id':'moscow50','selector':'.contener_doc','includeLeafDivs':True},'');b=join_blocks(b)
 # Clip publisher title/navigation; preserve statute title from actual act heading.
 start=next(i for i,x in enumerate(b) if x['text']=='ЗАКОН')
 b=b[start:]
 a=next(i for i,x in enumerate(b) if x['text'].startswith('Статья 17.'));end=next(i for i,x in enumerate(b[a+1:],a+1) if x['text'].startswith('Статья 18.'))
 s=b[a:end];parts={re.match(r'^(\d+(?:\.\d+)?)\. ',x['text']).group(1):x for x in s if re.match(r'^\d+(?:\.\d+)?\. ',x['text'])}
 def c(part,old,new,label,count=1):change(parts[part],old,new,'50/ст17/'+label,amend,count)
 change(b[a],'доходах, расходах, об','доходах, об','50/ст17/заголовок-1',amend)
 b[a]['text']=receipt('50/ст17/заголовок-2',b[a]['text'],b[a]['text']+' и сведений о расходах',amend)
 old=parts['1']['text'].split('. Указанные')[0]+'.'
 new='1. Гражданин, претендующий на замещение должности муниципальной службы, муниципальный служащий представляют представителю нанимателя (работодателю) сведения о доходах, об имуществе и обязательствах имущественного характера, предусмотренные Федеральным законом "О противодействии коррупции" (далее - сведения о доходах, об имуществе и обязательствах имущественного характера), в случаях, установленных данным Федеральным законом.'
 c('1',old,new,'ч1')
 c('1.1','своих расходах, а также о расходах своих супруги (супруга) и несовершеннолетних детей','расходах, предусмотренные Федеральным законом от 3 декабря 2012 года N 230-ФЗ "О контроле за соответствием расходов лиц, замещающих государственные должности, и иных лиц их доходам" (далее - сведения о расходах),','ч1.1-1')
 c('1.1','доходах, ','','ч1.1-2');c('1.1',', об имуществе и обязательствах имущественного характера','','ч1.1-3')
 c('1.2','от 3 декабря 2012 года N 230-ФЗ ','','ч1.2')
 c('2','расходах, ','','ч2-1');c('2','имущественного характера','имущественного характера и сведения о расходах','ч2-2')
 for part in ['3','4']:
  c(part,'расходах, ','','ч'+part+'-1');c(part,'муниципального служащего, его супруги (супруга) и несовершеннолетних детей','и сведений о расходах, представляемых муниципальным служащим в соответствии с настоящей статьей,','ч'+part+'-2')
 c('3','либо определения его платежеспособности и платежеспособности','или определения платежеспособности муниципального служащего,','ч3-3');c('3','общественных объединений либо религиозных или','религиозных или других общественных объединений,','ч3-4');c('3','в пользу ','','ч3-5')
 c('4',', иными',' и иными','ч4-3')
 c('5','своих доходах, расходах','доходах','ч5-1');c('5',', а также о доходах, расходах, об имуществе и обязательствах имущественного характера своих супруги (супруга) и несовершеннолетних детей',' и сведений о расходах','ч5-2');c('5','неполных сведений','неполных сведений о доходах, об имуществе и обязательствах имущественного характера и сведений о расходах','ч5-3')
 c('5.1',', указанных в части 5 настоящей статьи,',' о доходах, об имуществе и обязательствах имущественного характера и сведений о расходах','ч5.1')
 c('6','Проверка достоверности и полноты','Проверка достоверности и полноты представляемых в соответствии с частями 1 и 1.1 настоящей статьи','ч6-1');c('6',', представляемых гражданами, претендующими на замещение должностей муниципальной службы, включенных в соответствующий перечень, достоверности и полноты сведений о доходах, расходах, об имуществе и обязательствах имущественного характера',' и сведений о расходах','ч6-2')
 c('8','и лицо','представляют сведения о доходах, об имуществе и обязательствах имущественного характера, лицо','ч8-1');c('8','представляют сведения о своих доходах, расходах','представляет сведения о доходах','ч8-2');c('8',', а также сведения о доходах, расходах, об имуществе и обязательствах имущественного характера своих супруг (супругов) и несовершеннолетних детей',' и сведения о расходах','ч8-3')
 parts['9']['text']=receipt('50/ст17/ч9',parts['9']['text'],'9. Утратила силу.',amend)
 c('10','расходах, ','','ч10-1');c('10','имущественного характера','имущественного характера и сведений о расходах','ч10-2')
 # All changed paragraphs cite the amendment as well as the base through the receipt.
 for x in s:
  if any(q['after']==x['text'] for q in receipts):x['sourceUrl']=amend
 st18=b[end:next(i for i,x in enumerate(b[end+1:],end+1) if x['text'].startswith('Статья 19.'))]
 x=next(x for x in st18 if x['text'].startswith('10) сведения о'))
 x['text']=receipt('50/ст18/ч3/п10',x['text'],'10) сведения о доходах, об имуществе и обязательствах имущественного характера;',amend);x['sourceUrl']=amend
 st38=next(i for i,x in enumerate(b) if x['text'].startswith('Статья 38.'))
 x=next(x for x in b[st38:] if x['text'].startswith('12)'))
 change(x,'муниципального служащего, его супруги (супруга) и несовершеннолетних детей',', представляемых муниципальным служащим','50/ст38/п12',amend);x['sourceUrl']=amend
 # Footer copyright/navigation must not become law.
 b=[x for x in b if not re.match(r'^(?:Главная|МЕГАНОРМ|©|Скачать)',x['text'])]
 write(O/'moscow50.json',{'sourceUrl':url,'blocks':b,'provenance':[load(P/'moscow50-2025.html.receipt.json'),load(P/'moscow-amend4-2026.html.receipt.json')],'revision':'25.03.2026; изменения действуют с 30.03.2026','consolidation':'synthetic source-based amendment application'})

def moscow35():
 src=load(O/'moscow35-base.json');b=join_blocks(src['blocks'])
 urls={k:load(P/f'moscow35-amend{k}.pdf.receipt.json')['url'] for k in ['42-2025','77-2025','20-2026']}
 u=urls['42-2025'];a=next(i for i,x in enumerate(b) if x['text'].startswith('ПОЛОЖЕНИЕ О ПРЕМИИ ГОРОДА МОСКВЫ В ОБЛАСТИ ОБЕСПЕЧЕНИЯ БЕЗОПАСНОСТИ'))
 x=next(x for x in b[a:] if x['text'].startswith('2. '));change(x,'до 5 премий','до 15 премий','35/42-2025/п2',u);x['sourceUrl']=u+'#page=7'
 u=urls['77-2025'];a=next(i for i,x in enumerate(b) if x['text'].startswith('Приложение 5 к указу'))
 heading='Положение о почетном звании «Почетный работник в сфере контрольной (надзорной) деятельности города Москвы»'
 p1='Почетное звание «Почетный работник в сфере контрольной (надзорной) деятельности города Москвы» присваивается высококвалифицированным лицам, замещающим государственные должности города Москвы, государственным гражданским служащим, проходящим государственную гражданскую службу в органах исполнительной власти города Москвы, федеральных органах исполнительной власти и иных государственных органах, работникам учреждений, осуществляющих контрольные (надзорные) полномочия на территории города Москвы, за заслуги в сфере контрольной (надзорной) деятельности, большой личный вклад в организацию и осуществление государственного контроля (надзора) и муниципального контроля на территории города Москвы, работающим в сфере контрольной (надзорной) деятельности в городе Москве не менее 15 лет.'
 p2='Лица, которым присвоено почетное звание «Почетный работник в сфере контрольной (надзорной) деятельности города Москвы», премируются денежной премией в размере, установленном Правительством Москвы. Выплата денежной премии производится Управлением делами Мэра и Правительства Москвы.'
 receipts.append({'clause':'35/77-2025/приложение4/дополнение','sourceUrl':u+'#page=10','before':None,'after':[heading,p1,p2]})
 b[a:a]=[{'text':t,'heading':i==0,'sourceUrl':u+'#page=10'} for i,t in enumerate([heading,p1,p2])]
 u=urls['20-2026'];prefix='35/20-2026/'
 main4=next(x for x in b[:30] if x['text'].startswith('4. Департаменту'))
 main4['text']=receipt(prefix+'1.2',main4['text'],'4. Департаменту культуры города Москвы, Департаменту здравоохранения города Москвы, Департаменту образования и науки города Москвы, Департаменту спорта города Москвы, Комитету по туризму города Москвы, Департаменту региональной безопасности и противодействия коррупции города Москвы, Департаменту средств массовой информации и рекламы города Москвы, Департаменту труда и социальной защиты населения города Москвы, Департаменту градостроительной политики города Москвы выплату премий города Москвы в количествах и размерах, установленных Положениями о премиях, осуществлять за счет бюджетных ассигнований, предусмотренных законом города Москвы о бюджете города Москвы на соответствующий финансовый год и плановый период на указанные цели.',u)
 # Remove exactly the two repealed footnotes, identified by their actual content.
 removed=[x for x in b if x['text'].startswith(('<*> В соответствии с постановлением Правительства Москвы от 25 декабря 2001','<**> В соответствии с постановлением Правительства Москвы от 25 декабря 2001'))]
 assert len(removed)==2,len(removed)
 for x in removed:receipts.append({'clause':prefix+'1.15/1.21-отмена-сноски','sourceUrl':u,'before':x['text'],'after':None});b.remove(x)
 # Expand former short departmental name to new full name in the grammatical case of each occurrence.
 for i,x in enumerate(b):
  before=x['text'];after=before
  after=after.replace('Управление государственной службы и кадров Правительства Москвы (далее - Управление государственной службы и кадров) <*>','Управление кадровой политики Правительства Москвы')
  after=after.replace('Управление государственной службы и кадров Правительства Москвы <**>','Управление кадровой политики Правительства Москвы')
  after=re.sub(r'Управлени(е|я|ю|ем|и) государственной службы и кадров(?: Правительства Москвы)?',r'Управлени\1 кадровой политики Правительства Москвы',after)
  after=re.sub(r'Комитет(ом|а|е|у|) по архитектуре и градостроительству города Москвы',r'Департамент\1 градостроительной политики города Москвы',after)
  if '10. Домашний адрес, номер контактного телефона ' in after:after=after.replace('номер контактного телефона','номер контактного телефона, страховой номер индивидуального лицевого счета')
  if after.startswith('- домашний адрес награждаемого лица'):after=after.replace('телефона','телефона и страховой номер индивидуального лицевого счета')
  if after!=before:x['text']=receipt(prefix+'наименование/реквизиты-'+str(i),before,after,u);x['sourceUrl']=u+'#page=3'
 assert not any('государственной службы и кадров' in x['text'] for x in b)
 # Actual graphic annex: all seven original pages, rendered from the official PDF.
 import pypdfium2 as pdfium
 pdf=pdfium.PdfDocument(str(P/'moscow35-2024.pdf'));fig=DATA/'documents/figures';fig.mkdir(exist_ok=True)
 for page in range(36,43):
  path=fig/f'moscow35-annex6-p{page}.png';pdf[page-1].render(scale=1.4).to_pil().save(path,optimize=True)
  positions=[i for i,x in enumerate(b) if x.get('sourcePage')==page]
  insert=max(positions)+1
  b.insert(insert,{'text':f'Приложение 6. Образцы наградных документов — лист {page-35}.','heading':False,'sourceUrl':src['sourceUrl']+f'#page={page}','imageUrl':f'documents/figures/{path.name}'})
 # Distinguish nested regulations in navigation.
 for x in b:
  if x['text'].startswith(('ПОЛОЖЕНИЕ ','ОПИСАНИЕ ','ОБРАЗЦЫ ','ИНСТРУКЦИЯ ')):x['heading']=True
  if x['text'].startswith('Приложение') and 'к указу' in x['text']:x['sectionTitle']=x['text'].split(' к указу')[0]
 prov=[{'url':src['sourceUrl'],'sha256':hashlib.sha256((P/'moscow35-2024.pdf').read_bytes()).hexdigest(),'bytes':(P/'moscow35-2024.pdf').stat().st_size,'retrievedAt':dt.datetime.fromtimestamp((P/'moscow35-2024.pdf').stat().st_mtime,dt.timezone.utc).isoformat(),'timestampBasis':'local receipt file mtime; raw bytes retained'}]+[load(P/f'moscow35-amend{k}.pdf.receipt.json') for k in urls]
 write(O/'moscow35.json',{'sourceUrl':src['sourceUrl'],'blocks':b,'provenance':prov,'revision':'08.06.2026 (№20-УМ); применены №42-УМ от 03.06.2025 и №77-УМ от 02.12.2025','consolidation':'synthetic source-based amendment application'})

if __name__=='__main__':
 moscow50();moscow35();write(O/'amendment-application-receipts.json',{'reviewKind':'synthetic-editorial','amendments':receipts});print('Applied with receipts:',len(receipts))

