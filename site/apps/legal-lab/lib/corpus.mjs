import {searchUnits,contentHash} from './core.mjs';
import {ReaderData} from './reader-data.mjs';
export class Corpus {
  constructor(base,{signal}={}){this.base=base;this.signal=signal;this.destroyed=false;this.cache=new Map();this.inflight=new Map();this.readerData=new ReaderData(this);signal?.addEventListener('abort',()=>this.destroy(),{once:true});}
  assertActive(){if(this.destroyed||this.signal?.aborted)throw new DOMException('Aborted','AbortError');}
  async json(path,expectedSha=null,{signal=this.signal}={}){
    const check=()=>{this.assertActive();if(signal?.aborted)throw new DOMException('Aborted','AbortError');};check();
    const r=await fetch(new URL(path,this.base),{signal,credentials:'same-origin',cache:'no-cache'});
    check();
    if(!r.ok)throw new Error(`Не удалось загрузить ${path}: HTTP ${r.status}`);
    const bytes=await r.arrayBuffer();
    check();
    if(expectedSha){
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      check();
      const actual=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
      if(actual!==expectedSha)throw new Error('Контрольная сумма документа не совпадает. Обновите материалы.');
    }
    check();return JSON.parse(new TextDecoder().decode(bytes));
  }
  async initialize(){
    const [catalog,bank,scans,cases]=await Promise.all(['data/catalog.json','data/bank.json','data/scans.json','data/cases.json'].map(x=>this.json(x)));
    if(catalog.contentVersion!==bank.contentVersion)throw new Error('Версии каталога и банка не совпадают. Обновите кэш.');
    this.assertActive();Object.assign(this,{catalog,bank,scans,cases});return this;
  }
  async load(id){
    this.assertActive();
    if(this.cache.has(id))return this.cache.get(id);if(this.inflight.has(id))return this.inflight.get(id);
    const work=this.readerData.structure(id).then(doc=>{this.assertActive();Object.defineProperty(doc,'readerSource',{value:this});this.cache.set(id,doc);return doc;}).finally(()=>{if(this.inflight.get(id)===work)this.inflight.delete(id);});
    this.inflight.set(id,work);return work;
  }
  /** Explicit legacy/source-verification API; never retained by the reader. */
  async loadFull(id){
    const meta=this.catalog.documents.find(d=>d.id===id);if(!meta)throw new Error('Документ отсутствует в каталоге');
    if(meta.coverage==='full'&&!/^[a-f0-9]{64}$/.test(meta.fileSha256||''))throw new Error('Проверка полного документа не завершена. Обновите материалы.');
    const doc=await this.json(`data/${meta.file}`,meta.fileSha256);if(doc.version!==this.catalog.contentVersion||doc.sha256!==meta.sha256)throw new Error('Обнаружены несовместимые версии документа. Перезагрузите модуль.');if(await contentHash(doc.units)!==meta.sha256)throw new Error('Контрольная сумма текста не совпадает. Проверьте комплект файлов.');return doc;
  }
  readerDocument(id,locale='ru',options={}){return this.readerData.document(id,locale,options);}
  peekReaderDocument(id,locale='ru'){return this.readerData.peekDocument(id,locale);}
  loadBlock(id,locale,block,options={}){return this.readerData.block(id,locale,block,options);}
  peekBlock(id,locale,block){return this.readerData.peekBlock(id,locale,block);}
  loadUnits(id,locale,ids,options={}){return this.readerData.units(id,locale,ids,options);}
  peekUnit(id,locale,unitId){return this.readerData.peekUnit(id,locale,unitId);}
  loadedUnits(id,locale='ru'){return this.readerData.loadedUnits(id,locale);}
  searchDocument(id,locale,query,options={}){return this.readerData.searchDocument(id,locale,query,options);}
  cancelSearch(){this.readerData.search.cancel();}
  releaseReader(){this.readerData.release();}
  cacheStats(){return this.readerData.stats();}
  destroy(){this.destroyed=true;this.readerData.release();this.cache.clear();this.inflight.clear();}
  async all(){for(const d of this.catalog.documents)await this.load(d.id);return [...this.cache.values()];}
  async search(query,{content=false,signal}={}){
    const tokens=String(query).toLocaleLowerCase('ru').replace(/ё/g,'е').trim().split(/\s+/).filter(Boolean),out=[];
    for(const d of this.catalog.documents){
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      const title=(d.title+' '+d.number+' '+d.shortTitle).toLocaleLowerCase('ru').replace(/ё/g,'е');
      const titleMatch=tokens.every(w=>title.includes(w));
      if(content&&tokens.length){const result=await this.searchDocument(d.id,'ru',query,{pageSize:8,signal}),hits=result.hits;if(titleMatch||hits.length)out.push({document:d,hits});}
      else if(titleMatch)out.push({document:d,hits:[]});
      if(content)await new Promise(r=>setTimeout(r,0));
    }
    return out;
  }
}
