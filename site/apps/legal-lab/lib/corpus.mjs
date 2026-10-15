import {searchUnits,contentHash} from './core.mjs';
export class Corpus {
  constructor(base,{signal}={}){this.base=base;this.signal=signal;this.cache=new Map();this.inflight=new Map();}
  async json(path,expectedSha=null){
    const r=await fetch(new URL(path,this.base),{signal:this.signal,credentials:'same-origin',cache:'no-cache'});
    if(!r.ok)throw new Error(`Не удалось загрузить ${path}: HTTP ${r.status}`);
    const bytes=await r.arrayBuffer();
    if(expectedSha){
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const actual=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
      if(actual!==expectedSha)throw new Error('Контрольная сумма документа не совпадает. Обновите материалы.');
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async initialize(){
    const [catalog,bank,scans,cases]=await Promise.all(['data/catalog.json','data/bank.json','data/scans.json','data/cases.json'].map(x=>this.json(x)));
    if(catalog.contentVersion!==bank.contentVersion)throw new Error('Версии каталога и банка не совпадают. Обновите кэш.');
    Object.assign(this,{catalog,bank,scans,cases});return this;
  }
  async load(id){
    if(this.cache.has(id))return this.cache.get(id);if(this.inflight.has(id))return this.inflight.get(id);
    const meta=this.catalog.documents.find(d=>d.id===id);if(!meta)throw new Error('Документ отсутствует в каталоге');
    if(meta.coverage==='full'&&!/^[a-f0-9]{64}$/.test(meta.fileSha256||''))throw new Error('Проверка полного документа не завершена. Обновите материалы.');
    const work=this.json(`data/${meta.file}`,meta.fileSha256).then(async doc=>{if(doc.version!==this.catalog.contentVersion||doc.sha256!==meta.sha256)throw new Error('Обнаружены несовместимые версии документа. Перезагрузите модуль.');if(await contentHash(doc.units)!==meta.sha256)throw new Error('Контрольная сумма текста не совпадает. Проверьте комплект файлов.');this.cache.set(id,doc);return doc;}).finally(()=>this.inflight.delete(id));
    this.inflight.set(id,work);return work;
  }
  async all(){for(const d of this.catalog.documents)await this.load(d.id);return [...this.cache.values()];}
  async search(query,{content=false,signal}={}){
    const tokens=String(query).toLocaleLowerCase('ru').replace(/ё/g,'е').trim().split(/\s+/).filter(Boolean),out=[];
    for(const d of this.catalog.documents){
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      const title=(d.title+' '+d.number+' '+d.shortTitle).toLocaleLowerCase('ru').replace(/ё/g,'е');
      const titleMatch=tokens.every(w=>title.includes(w));
      if(content&&tokens.length){const doc=await this.load(d.id);const hits=searchUnits(doc,query,8);if(titleMatch||hits.length)out.push({document:d,hits});}
      else if(titleMatch)out.push({document:d,hits:[]});
      if(content)await new Promise(r=>setTimeout(r,0));
    }
    return out;
  }
}
