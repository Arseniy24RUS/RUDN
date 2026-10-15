"""Prepare sourced PDF supplements and apply public amendment text with receipts."""
from pathlib import Path
import json,re,hashlib,datetime as dt
import pdfplumber
from acquire_corpus import ROOT,DATA,write,load,clean_text,is_editorial,HEADING,structure,digest,extract_html
P=ROOT/'.source-probe';OUT=ROOT/'.supplement-blocks';OUT.mkdir(exist_ok=True)
def pdf_blocks(name,source_url,doc_id):
 cache=OUT/(name+'.blocks.json')
 if cache.exists():return load(cache)
 blocks=[]
 with pdfplumber.open(P/(name+'.pdf')) as pdf:
  for i,page in enumerate(pdf.pages):
   if doc_id=='moscow35' and i==0:continue
   if doc_id=='moscow3':page=page.crop((20,42,page.width-15,page.height-38))
   text=page.extract_text(layout=True) or ''
   for chunk in re.split(r'\n\s*\n',text):
    t=clean_text(chunk,doc_id)
    if not t:continue
    # Remove publisher's revision notes, retaining the statute itself.
    t=re.sub(r'\s*\((?:в ред\.|(?:абзац|п\.|часть|дефис|преамбула|подпункт|приложение)\b)[\s\S]*?\)\s*',' ',t,flags=re.I).strip()
    if not t or is_editorial(t) or t.startswith('Список изменяющих документов'):continue
    b={'text':t,'heading':bool(HEADING.match(t)) or (len(t)<260 and t.upper()==t and bool(re.search('[А-Я]',t))),'sourceUrl':source_url+f'#page={i+1}','sourcePage':i+1}
    if blocks and i>blocks[-1].get('sourcePage',0)-1 and not b['heading'] and not re.match(r'^(?:\d+[.)]|[а-я]\)|Приложение|Мэр Москвы|Утвержден)',t) and not re.search(r'[.;:!?»"]$',blocks[-1]['text']) and blocks[-1].get('sourcePage')!=i+1:
     blocks[-1]['text']+=' '+t
    else:blocks.append(b)
   if i%15==0:print(name,i+1,'/',len(pdf.pages),flush=True)
 if doc_id=='moscow3':
  start=next(i for i,b in enumerate(blocks) if 'Настоящий Закон в соответствии с Федеральным законом от 27 мая 2003' in b['text'])
  blocks=blocks[start:]
 write(cache,blocks);return blocks

def main():
 m3url=load(P/'moscow3-2026.receipt.json')['url'];b=pdf_blocks('moscow3-2026',m3url,'moscow3');write(OUT/'moscow3.json',{'sourceUrl':m3url,'blocks':b,'provenance':[load(P/'moscow3-2026.receipt.json')]})
 m35url='https://www.mos.ru/upload/documents/files/721/2YkazMeraMoskviot30082002N35-YM%28redot13022024%29.pdf'
 b=pdf_blocks('moscow35-2024',m35url,'moscow35');write(OUT/'moscow35-base.json',{'sourceUrl':m35url,'blocks':b})
 print('prepared',len(b),flush=True)
if __name__=='__main__':main()
