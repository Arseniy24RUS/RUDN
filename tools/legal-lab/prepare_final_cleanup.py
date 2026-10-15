"""Source-preserving PDF note removal and rank-table extraction for reviewed candidates."""
from acquire_corpus import *
import pdfplumber,pypdfium2

PDF_NOTE_START=re.compile(r'^(?:в ред\.|(?:Пункт|Подпункт|Часть|Статья|Абзац|Название|Таблица|Положение|Раздел|Приложение)\b.*?(?:в редакции|дополнител|введен|утратил))',re.I)

def strip_pdf_notes(text):
 out=[];removed=[];i=0
 while i<len(text):
  if text[i]!='(':out.append(text[i]);i+=1;continue
  depth=1;j=i+1
  while j<len(text) and depth:
   if text[j]=='(':depth+=1
   elif text[j]==')':depth-=1
   j+=1
  inside=text[i+1:j-1 if not depth else j]
  if PDF_NOTE_START.search(inside):removed.append(text[i:j]);i=j
  else:out.append(text[i:j]);i=j
 cleaned=''.join(out)
 cleaned=re.sub(r'\s*[-–]\s*[Сс]м\. предыдущ(?:ую редакцию|ая редакция)\.?','',cleaned)
 cleaned=re.sub(r'\s+',' ',cleaned).strip()
 return cleaned,removed

def rank_table_blocks():
 pdf_path=ROOT/'.source-probe/moscow3-2026.pdf'
 doc=pypdfium2.PdfDocument(str(pdf_path));blocks=[];receipts=[]
 url='https://www.mos.ru/upload/documents/files/935/3Zakonot26_01_2005N3Ogosydarstvennoigrajdanskoislyjbe.pdf'
 with pdfplumber.open(pdf_path) as pdf:
  for page_number in [7,8]:
   tables=pdf.pages[page_number-1].find_tables();assert len(tables)==1
   table=tables[0];rows=table.extract();assert len(rows)==6 and all(len(r)==2 for r in rows)
   x0,y0,x1,y1=table.bbox;scale=2
   image=doc[page_number-1].render(scale=scale).to_pil()
   image=image.crop((int((x0-2)*scale),int((y0-2)*scale),int((x1+2)*scale),int((y1+2)*scale)))
   relative=f'documents/figures/moscow3-rank-table-p{page_number}.png';path=DATA/relative;path.parent.mkdir(parents=True,exist_ok=True);image.save(path)
   for n,row in enumerate(rows):
    cells=[re.sub(r'\s+',' ',x).replace('2- го','2-го').replace('1- го','1-го').replace('3- го','3-го') for x in row]
    block={'text':' | '.join(cells),'tableRow':True,'sourceUrl':url+f'#page={page_number}'}
    if n==0:block['imageUrl']=relative
    blocks.append(block)
   receipts.append({'sourceUrl':url+f'#page={page_number}','sourceSha256':hashlib.sha256(pdf_path.read_bytes()).hexdigest(),'pdfTableBounds':list(table.bbox),'rows':rows,'imageUrl':relative,'imageSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'operation':'Render exact PDF table bounding box; extract two cells per row in original order; no inferred text'})
 return blocks,receipts
