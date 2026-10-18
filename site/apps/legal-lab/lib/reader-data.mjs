import {resourceURL} from '../../../assets/js/release-resources.js';
import {READER_CATALOG_SHA,READER_CONTENT_VERSION} from './reader-registry.mjs';
import {unpackStructure,unpackDescriptor} from './reader-codec.mjs';

const abort=()=>new DOMException('Aborted','AbortError');
const checkSignal=signal=>{if(signal?.aborted)throw abort();};
function requireThat(value,message){if(!value)throw new Error('Reader data: '+message);}

// Each caller owns its cancellation. A report and a scrolling reader may share
// one fetch without cancelling each other; a flight with no consumers stops.
function shared(map,key,signal,parentSignal,task){
  checkSignal(signal);checkSignal(parentSignal);
  let flight=map.get(key);
  if(!flight){
    const controller=new AbortController();flight={controller,clients:new Set(),finished:false};map.set(key,flight);
    const finish=(error,value)=>{if(flight.finished)return;flight.finished=true;parentSignal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',cancelled);if(map.get(key)===flight)map.delete(key);for(const client of flight.clients){client.cleanup();error?client.reject(error):client.resolve(value);}flight.clients.clear();};
    const cancel=()=>controller.abort(),cancelled=()=>finish(abort());
    controller.signal.addEventListener('abort',cancelled,{once:true});parentSignal?.addEventListener('abort',cancel,{once:true});
    Promise.resolve().then(()=>{checkSignal(controller.signal);return task(controller.signal);}).then(value=>finish(null,value),error=>finish(error));
  }
  return new Promise((resolve,reject)=>{
    const cancel=()=>{flight.clients.delete(client);cleanup();reject(abort());if(!flight.clients.size&&!flight.finished)flight.controller.abort();},cleanup=()=>signal?.removeEventListener('abort',cancel),client={resolve,reject,cleanup};
    flight.clients.add(client);signal?.addEventListener('abort',cancel,{once:true});
  });
}

class BlockQueue {
  constructor(limit=3){this.limit=limit;this.active=0;this.waiting=[];}
  run(task,signal){
    checkSignal(signal);
    return new Promise((resolve,reject)=>{const cancel=()=>{const index=this.waiting.indexOf(item);if(index<0)return;this.waiting.splice(index,1);cleanup();reject(abort());},cleanup=()=>signal?.removeEventListener('abort',cancel),item={task,signal,resolve,reject,cleanup};this.waiting.push(item);signal?.addEventListener('abort',cancel,{once:true});this.drain();});
  }
  drain(){
    while(this.active<this.limit&&this.waiting.length){const item=this.waiting.shift();item.cleanup();if(item.signal?.aborted){item.reject(abort());continue;}this.active++;Promise.resolve().then(()=>{checkSignal(item.signal);return item.task();}).then(item.resolve,item.reject).finally(()=>{this.active--;this.drain();});}
  }
}
export class BlockCache {
  constructor({maxBlocks=12,maxBytes=2*1024*1024}={}){this.maxBlocks=maxBlocks;this.maxBytes=maxBytes;this.bytes=0;this.items=new Map();}
  get(key){const item=this.items.get(key);if(!item)return null;this.items.delete(key);this.items.set(key,item);return item.value;}
  peek(key){return this.items.get(key)?.value||null;}
  set(key,value,bytes){requireThat(Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=this.maxBytes,'invalid cache entry size');const old=this.items.get(key);if(old){this.bytes-=old.bytes;this.items.delete(key);}this.items.set(key,{value,bytes});this.bytes+=bytes;while(this.items.size>this.maxBlocks||this.bytes>this.maxBytes){const first=this.items.keys().next().value;this.bytes-=this.items.get(first).bytes;this.items.delete(first);}return value;}
  clear(){this.items.clear();this.bytes=0;}
  stats(){return {blocks:this.items.size,blockBytes:this.bytes,maxBlocks:this.maxBlocks,maxBlockBytes:this.maxBytes};}
}

/** Exactly one active search index, held only inside a dedicated worker. */
export class ReaderSearch {
  constructor(base,{signal,WorkerClass=globalThis.Worker,fetch:fetcher=globalThis.fetch?.bind(globalThis)}={}){this.base=base;this.signal=signal;this.WorkerClass=WorkerClass;this.fetcher=fetcher;this.worker=null;this.key=null;this.sequence=0;this.pending=new Map();this.ready=false;signal?.addEventListener('abort',()=>this.destroy(),{once:true});}
  activate(manifest){
    const key=manifest.docId+'/'+manifest.locale;if(this.key===key&&this.worker)return;
    this.destroy();if(this.signal?.aborted)throw abort();requireThat(this.WorkerClass,'Web Worker unavailable');
    this.key=key;this.worker=new this.WorkerClass(resourceURL('./reader-search-worker.mjs',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{if(data?.type==='ready'){this.ready=true;return;}const call=this.pending.get(data?.request);if(!call)return;this.pending.delete(data.request);call.cleanup();if(data.type==='error'){const error=new Error('Document search failed');error.code=data.code||'reader/search';call.reject(error);}else call.resolve(data.result);};
    this.worker.onerror=()=>{for(const call of this.pending.values()){call.cleanup();call.reject(new Error('Document search worker failed'));}this.pending.clear();this.worker?.terminate();this.worker=null;this.key=null;this.ready=false;};
    const worker=this.worker,controller=new AbortController();this.loadingController=controller;
    worker.postMessage({type:'load',key,sha256:manifest.search.sha256,docId:manifest.docId,locale:manifest.locale,contentVersion:manifest.contentVersion});
    // Fetch as the course window's service-worker client, then transfer the raw
    // buffer. Decoding and parsing stay in the worker and releases cannot mix.
    Promise.resolve().then(()=>this.fetcher(resourceURL(manifest.search.file,this.base),{credentials:'same-origin',cache:'no-cache',signal:controller.signal})).then(response=>{if(!response.ok)throw new Error('load');return response.arrayBuffer();}).then(bytes=>{if(this.worker===worker)worker.postMessage({type:'index',bytes},[bytes]);}).catch(()=>{if(this.worker===worker)worker.postMessage({type:'index-error'});});
  }
  search(manifest,query,{page=0,pageSize=20,signal}={}){
    if(signal?.aborted||this.signal?.aborted)return Promise.reject(abort());this.activate(manifest);this.cancel();
    const request=++this.sequence;
    return new Promise((resolve,reject)=>{const cancel=()=>{if(!this.pending.has(request))return;this.pending.delete(request);cleanup();this.worker?.postMessage({type:'cancel',request});reject(abort());},cleanup=()=>signal?.removeEventListener('abort',cancel);this.pending.set(request,{resolve,reject,cleanup});signal?.addEventListener('abort',cancel,{once:true});this.worker.postMessage({type:'search',request,query:String(query),page:Math.max(0,Math.floor(page)),pageSize:Math.min(100,Math.max(1,Math.floor(pageSize)))});});
  }
  cancel(){for(const [request,call]of this.pending){call.cleanup();call.reject(abort());this.worker?.postMessage({type:'cancel',request});}this.pending.clear();}
  destroy(){this.cancel();this.loadingController?.abort();this.loadingController=null;this.worker?.terminate();this.worker=null;this.key=null;this.ready=false;}
  stats(){return {searchIndexes:this.worker?1:0,pendingSearches:this.pending.size,searchReady:this.ready};}
}

export class ReaderData {
  constructor(corpus){this.corpus=corpus;this.registry=null;this.initializing=null;this.descriptors=new Map();this.manifestPending=new Map();this.blockPending=new Map();this.blocks=new BlockCache();this.blockQueue=new BlockQueue();this.search=new ReaderSearch(corpus.base,{signal:corpus.signal});this.epoch=0;this.controller=new AbortController();this.requestedKey=null;}
  async initialize(){this.corpus.assertActive();if(this.registry)return this;if(this.initializing)return this.initializing;const work=(async()=>{const value=await this.corpus.json('data/reader/catalog.json',READER_CATALOG_SHA);this.corpus.assertActive();requireThat(value?.schema===1&&value.contentVersion===READER_CONTENT_VERSION&&value.contentVersion===this.corpus.catalog.contentVersion,'registry version mismatch');requireThat(value.documents.length===this.corpus.catalog.documents.length,'registry coverage');for(const meta of this.corpus.catalog.documents){const entry=value.documents.find(d=>d.id===meta.id);requireThat(entry&&entry.sourceSha256===meta.sha256&&entry.sourceFileSha256===meta.fileSha256&&entry.unitCount===meta.unitCount,'source pins');}this.registry=value;return this;})();this.initializing=work;try{return await work;}finally{this.initializing=null;}}
  async entry(id){await this.initialize();const entry=this.registry.documents.find(d=>d.id===id);requireThat(entry,'unknown document');return entry;}
  async structure(id){const entry=await this.entry(id);this.corpus.assertActive();const packed=await this.corpus.json(entry.structure.file,entry.structure.sha256);this.corpus.assertActive();const doc=unpackStructure(packed);requireThat(doc?.id===id&&doc.structural===true&&doc.version===this.corpus.catalog.contentVersion&&doc.sha256===entry.sourceSha256&&doc.units.length===entry.unitCount,'structural source mismatch');const ids=new Set(doc.units.map(u=>u.id));requireThat(ids.size===doc.units.length&&doc.units.every(u=>Object.keys(u).sort().join(',')==='id,sectionId'),'structural units');for(const section of doc.sections)requireThat(section.unitIds.every(id=>ids.has(id)),'structural TOC');return doc;}
  peekDocument(id,locale='ru'){return this.descriptors.get(id+'/'+locale)||null;}
  async document(id,locale='ru',{signal,activate=true}={}){
    checkSignal(signal);this.corpus.assertActive();locale=['en','zh'].includes(locale)?locale:'ru';const key=id+'/'+locale;if(activate){this.requestedKey=key;if(this.search.key&&this.search.key!==key)this.search.destroy();}const cached=this.descriptors.get(key);if(cached)return cached;
    const epoch=this.epoch;
    return shared(this.manifestPending,key,signal,this.controller.signal,async activeSignal=>{const entry=await this.entry(id);checkSignal(activeSignal);const pin=entry.locales[locale];requireThat(pin,'locale missing');const packed=await this.corpus.json(pin.file,pin.sha256,{signal:activeSignal});checkSignal(activeSignal);const value=unpackDescriptor(packed);requireThat(value?.schema===1&&value.docId===id&&value.locale===locale&&value.contentVersion===this.corpus.catalog.contentVersion&&value.sourceSha256===entry.sourceSha256,'descriptor pins');requireThat(value.units.length===entry.unitCount&&value.blocks.every((b,i)=>b.id===i&&b.count<=64&&b.bytes<=131072),'descriptor limits');if(epoch!==this.epoch||this.corpus.signal?.aborted)throw abort();checkSignal(activeSignal);if(this.requestedKey===key){this.descriptors.clear();this.descriptors.set(key,value);}return value;});
  }
  key(id,locale,block){return id+'/'+locale+'/'+block;}
  peekBlock(id,locale,block){return this.blocks.peek(this.key(id,locale,block));}
  async block(id,locale,block,{signal}={}){
    checkSignal(signal);this.corpus.assertActive();const key=this.key(id,locale,block),cached=this.blocks.get(key);if(cached)return cached;
    const epoch=this.epoch;
    return shared(this.blockPending,key,signal,this.controller.signal,activeSignal=>this.blockQueue.run(async()=>{const manifest=await this.document(id,locale,{signal:activeSignal,activate:false});checkSignal(activeSignal);const pin=manifest.blocks[block];requireThat(pin&&pin.id===block,'unknown block');const value=await this.corpus.json(pin.file,pin.sha256,{signal:activeSignal});checkSignal(activeSignal);requireThat(value.schema===1&&value.docId===id&&value.locale===locale&&value.contentVersion===manifest.contentVersion&&value.id===block&&value.units.length===pin.count&&value.units.every((unit,i)=>unit.id===manifest.units[pin.start+i]?.id),'block identity/coverage');if(epoch!==this.epoch||this.corpus.signal?.aborted)throw abort();return this.blocks.set(key,value,pin.bytes*2+value.units.length*256);},activeSignal));
  }
  peekUnit(id,locale,unitId){for(const [key,item]of this.blocks.items)if(key.startsWith(id+'/'+locale+'/')){const unit=item.value.units.find(u=>u.id===unitId);if(unit)return unit;}return null;}
  loadedUnits(id,locale){const units=new Map();for(const [key,item]of this.blocks.items)if(key.startsWith(id+'/'+locale+'/'))for(const unit of item.value.units)units.set(unit.id,unit);return units;}
  async units(id,locale,ids,options={}){const manifest=await this.document(id,locale,{...options,activate:false}),groups=new Map(),result=new Map();checkSignal(options.signal);for(const unitId of new Set(ids)){const block=manifest.unitToBlock[unitId];if(Number.isInteger(block)){if(!groups.has(block))groups.set(block,[]);groups.get(block).push(unitId);}}for(const [index,wanted]of groups){const value=await this.block(id,locale,index,options);checkSignal(options.signal);const byId=new Map(value.units.map(u=>[u.id,u]));for(const unitId of wanted)result.set(unitId,byId.get(unitId));}return result;}
  async searchDocument(id,locale,query,options={}){checkSignal(options.signal);if(!String(query).trim()){this.search.cancel();return {hits:[],total:0,page:0,pages:1};}const manifest=await this.document(id,locale,{signal:options.signal});checkSignal(options.signal);const result=await this.search.search(manifest,query,options);return {...result,hits:result.hits.map(hit=>{const meta=manifest.units.find(unit=>unit.id===hit.id);return {...hit,label:meta?.label||'',locator:meta?.locator||''};})};}
  release(){this.epoch++;this.controller.abort();this.controller=new AbortController();this.search.destroy();this.requestedKey=null;this.descriptors.clear();this.blocks.clear();this.manifestPending.clear();this.blockPending.clear();}
  stats(){return {...this.blocks.stats(),...this.search.stats(),readerDocuments:this.descriptors.size,pendingBlocks:this.blockPending.size,activeBlockLoads:this.blockQueue.active,queuedBlockLoads:this.blockQueue.waiting.length,maxActiveBlockLoads:this.blockQueue.limit};}
}
