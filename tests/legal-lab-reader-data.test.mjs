import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Worker as NodeWorker} from 'node:worker_threads';
import {Corpus} from '../site/apps/legal-lab/lib/corpus.mjs';
import {BlockCache,ReaderSearch} from '../site/apps/legal-lab/lib/reader-data.mjs';
import {unpackStructure,unpackDescriptor} from '../site/apps/legal-lab/lib/reader-codec.mjs';
import {gradeTask,scoreDossier,expandIds,searchUnits,SCAN_METADATA_MODE,EVIDENCE_MODE} from '../site/apps/legal-lab/lib/core.mjs';
import {canonicalArticleSelections} from '../site/apps/legal-lab/lib/article-evidence.mjs';
import {displayDocument} from '../site/apps/legal-lab/lib/translations.mjs';
import {prepareReportPassages} from '../site/apps/legal-lab/lib/translation-ui.mjs';
const base=new URL('../site/apps/legal-lab/',import.meta.url),read=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
const [catalog,bank,cases,scans,variants]=await Promise.all(['catalog','bank','cases','scans','assessment-variants'].map(n=>read('data/'+n+'.json')));
const docs=await Promise.all(catalog.documents.map(meta=>read('data/'+meta.file))),structures=await Promise.all(catalog.documents.map(async meta=>unpackStructure(await read('data/reader/'+meta.id+'/structure.json'))));

test('every RU/EN/ZH block reconstructs exact reviewed text and stable identities within limits',async()=>{
 let checked=0;
 for(const doc of docs)for(const locale of ['ru','en','zh']){
  const original=locale==='ru'?doc:displayDocument(doc,await read('data/translations/'+locale+'/'+doc.id+'.json'));
  const manifest=unpackDescriptor(await read('data/reader/'+doc.id+'/'+locale+'/manifest.json')),units=[];
  for(const block of manifest.blocks){const bytes=await readFile(new URL(block.file,base));assert.equal(createHash('sha256').update(bytes).digest('hex'),block.sha256);assert.equal(bytes.length,block.bytes);assert.ok(bytes.length<=131072);const loaded=JSON.parse(bytes);assert.ok(loaded.units.length<=64);for(const unit of loaded.units){assert.equal(manifest.unitToBlock[unit.id],block.id);const {label,heading,...source}=unit;assert.ok(label);units.push(source);}checked++;}
  assert.deepEqual(units,original.units,doc.id+'/'+locale);assert.deepEqual(manifest.sections,original.sections);
 }
 assert.equal(checked,948);
});

test('all quiz and assessment evidence, including heading equivalence, grades identically from structure',()=>{
 let comparisons=0;
 const compare=(task,answer)=>{assert.deepEqual(gradeTask(task,answer,structures,scans),gradeTask(task,answer,docs,scans),task.id);comparisons++;};
 for(const task of [...bank.classroom,...(bank.extra||[]),...variants.questionSets.flatMap(s=>s.tasks)]){
  if(task.kind==='scan'){compare(task,{metadataMode:SCAN_METADATA_MODE,metadata:Object.fromEntries(scans.find(s=>s.id===task.scanId).hotspots.map(h=>[h.id,h.id]))});compare(task,{hotspot:task.answer});continue;}
  if(task.kind==='type'){compare(task,{type:task.answer});compare(task,{type:'wrong'});continue;}
  const source=docs.find(doc=>doc.id===task.docId);for(const set of task.answerSets){const full=expandIds(set,docs);for(const choices of [set,full,full.slice(0,1),[...full,'unknown'],[],[source.units.at(-1).id]])compare(task,{docId:task.docId,selections:choices});}
 }
 for(const doc of docs)for(const section of doc.sections){const ids=section.unitIds.slice(0,2);assert.deepEqual(canonicalArticleSelections(ids,structures),canonicalArticleSelections(ids,docs));}
 assert.ok(comparisons>500);
});

test('all 1456 five-task variants keep full and partial scores independent of reader cache',()=>{
 let compared=0;
 for(const v of variants.variants){const scan=scans.find(s=>s.id===v.scanId),type=scans.find(s=>s.id===v.typeScanId),texts=variants.questionSets.find(s=>s.docId===v.questionSet).tasks;
  const tasks=[{id:v.id+'-scan',kind:'scan',scanId:scan.id},{id:v.id+'-type',kind:'type',scanId:type.id,answer:type.actType},...texts],item={id:v.id,format:'five-task-v1',tasks};
  const answer={assessmentMode:'five-task-v1',tasks:Object.fromEntries(tasks.map(t=>[t.id,t.kind==='scan'?{metadataMode:SCAN_METADATA_MODE,scanId:t.scanId,metadata:Object.fromEntries(scan.hotspots.map(h=>[h.id,h.id]))}:t.kind==='type'?{type:t.answer}:{docId:t.docId,selections:expandIds(t.answerSets[0],docs)}]))};
  for(let mode=0;mode<2;mode++){assert.deepEqual(scoreDossier(item,answer,scans,structures),scoreDossier(item,answer,scans,docs),v.id);compared++;answer.tasks[tasks[2].id].selections=['unknown'];}
 }
 assert.equal(compared,2912);
});

test('legacy dossier scores remain identical with empty/partial/excess evidence',()=>{
 for(const item of cases){if(item.docIds.some(id=>!docs.some(d=>d.id===id)))continue;for(const evidenceMode of [undefined,EVIDENCE_MODE])for(const selections of [[],expandIds(item.answerSets[0],docs),[...expandIds(item.answerSets[0],docs),'unknown']]){const answer={metadata:Object.fromEntries(item.scanQuestions.map(q=>[q.field,q.field])),classifications:Object.fromEntries(item.classificationIds.map(id=>[id,scans.find(s=>s.id===id).actType])),documentIds:item.docIds,selections,...(evidenceMode?{evidenceMode}:{})};assert.deepEqual(scoreDossier(item,answer,scans,structures),scoreDossier(item,answer,scans,docs));}}
});

test('LRU is bounded by count and bytes and retains recently read blocks',()=>{
 const cache=new BlockCache();for(let i=0;i<50;i++)cache.set(String(i),{id:i},131072);assert.equal(cache.stats().blocks,12);assert.ok(cache.stats().blockBytes<=2097152);cache.get('38');cache.set('next',{},131072);assert.ok(cache.peek('38'));assert.equal(cache.peek('39'),null);
 const tiny=new BlockCache({maxBlocks:12,maxBytes:100});tiny.set('a',{},60);tiny.set('b',{},60);assert.equal(tiny.stats().blocks,1);assert.equal(tiny.peek('a'),null);assert.throws(()=>tiny.set('huge',{},101));
});

test('Corpus reading never fetches full original/translated files and releases text caches',async()=>{
 const corpus=new Corpus(base);corpus.json=async(path,sha)=>{assert.doesNotMatch(path,/^data\/(?:documents\/|translations\/(?:en|zh)\/)/);const bytes=await readFile(new URL(path,base));if(sha)assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);return JSON.parse(bytes);};await corpus.initialize();
 const doc=await corpus.load('koap');assert.equal(doc.structural,true);assert.equal(doc.units.length,9493);assert.ok(doc.units.every(unit=>!Object.hasOwn(unit,'text')));
 const descriptor=await corpus.readerDocument('koap','zh');for(let i=0;i<30;i++)await corpus.loadBlock('koap','zh',i);assert.equal(corpus.cacheStats().blocks,12);assert.ok(corpus.cacheStats().blockBytes<=2097152);assert.equal(corpus.peekUnit('koap','zh',descriptor.units[0].id),null);
 const needed=await corpus.loadUnits('koap','zh',[descriptor.units[0].id,descriptor.units.at(-1).id]);assert.equal(needed.size,2);assert.ok([...needed.values()].every(unit=>unit.text));assert.equal(corpus.cacheStats().readerDocuments,1);
 await corpus.readerDocument('constitution','en');assert.equal(corpus.peekReaderDocument('koap','zh'),null);corpus.releaseReader();assert.equal(corpus.cacheStats().blocks,0);assert.equal(corpus.cacheStats().readerDocuments,0);assert.equal(corpus.cacheStats().searchIndexes,0);assert.ok(corpus.cache.has('koap'),'Grading structure survives reader release');
});

test('worker requests cancel on replacement and document change without main-thread index',async()=>{
 const workers=[];class Worker {constructor(){this.messages=[];this.terminated=false;workers.push(this);}postMessage(data){this.messages.push(data);}terminate(){this.terminated=true;}}
 const search=new ReaderSearch(base,{WorkerClass:Worker}),manifest={docId:'one',locale:'ru',contentVersion:'test',search:{file:'index.json',sha256:'pin'}};
 const first=search.search(manifest,'one');const rejected=assert.rejects(first,{name:'AbortError'});const second=search.search(manifest,'two');await rejected;
 const request=workers[0].messages.findLast(m=>m.type==='search').request;workers[0].onmessage({data:{type:'result',request,result:{hits:[],total:0,page:0,pages:1}}});assert.equal((await second).total,0);assert.equal(search.stats().pendingSearches,0);
 const third=search.search(manifest,'three'),thirdRejected=assert.rejects(third,{name:'AbortError'});search.activate({...manifest,docId:'two'});await thirdRejected;assert.equal(workers[0].terminated,true);assert.equal(search.stats().searchIndexes,1);search.destroy();assert.equal(search.stats().searchIndexes,0);
});

test('the real standalone worker matches canonical search across languages and result pages',async()=>{
 class Worker {
  constructor(url){this.inner=new NodeWorker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=data=>parentPort.postMessage(data);import(${JSON.stringify(url.href)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});this.inner.on('message',data=>this.onmessage?.({data}));this.inner.on('error',error=>this.onerror?.(error));}
  postMessage(data,transfer){this.inner.postMessage(data,transfer);}
  terminate(){void this.inner.terminate();}
 }
 const worker=new ReaderSearch(base,{WorkerClass:Worker,fetch:async url=>new Response(await readFile(url))});
 try{for(const id of ['constitution','koap','procurement44'])for(const locale of ['ru','en','zh']){
  const source=docs.find(doc=>doc.id===id),doc=locale==='ru'?source:displayDocument(source,await read('data/translations/'+locale+'/'+id+'.json'));
  const manifest=unpackDescriptor(await read('data/reader/'+id+'/'+locale+'/manifest.json')),query={ru:'Статья',en:'Article',zh:'第'}[locale],expected=searchUnits(doc,query);
  for(const page of [0,1]){const result=await worker.search(manifest,query,{page,pageSize:20});assert.equal(result.total,expected.length,id+'/'+locale);assert.deepEqual(result.hits.map(u=>u.id),expected.slice(result.page*20,(result.page+1)*20).map(u=>u.id));}
  const last=doc.units.at(-1),specific=last.text.slice(0,30),result=await worker.search(manifest,specific);assert.deepEqual(result.hits.map(u=>u.id),searchUnits(doc,specific).slice(0,20).map(u=>u.id));
 }}finally{worker.destroy();}
 assert.equal(worker.stats().searchIndexes,0);
});

test('late document loads cannot replace the active descriptor and release aborts a pending block',async()=>{
 const corpus=new Corpus(base),readJson=async path=>read(path);corpus.json=readJson;await corpus.initialize();await corpus.load('koap');await corpus.load('constitution');
 let releaseOld;const oldGate=new Promise(resolve=>{releaseOld=resolve;});
 corpus.json=async path=>{if(path==='data/reader/koap/ru/manifest.json')await oldGate;return readJson(path);};
 const old=corpus.readerDocument('koap','ru');await Promise.resolve();const current=await corpus.readerDocument('constitution','en');releaseOld();await old;assert.equal(corpus.peekReaderDocument('constitution','en'),current);assert.equal(corpus.peekReaderDocument('koap','ru'),null);
 let started;const pendingStarted=new Promise(resolve=>{started=resolve;});
 corpus.json=async(path,sha,{signal}={})=>{if(path.includes('/blocks/')){started();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));}return readJson(path);};
 const pending=corpus.loadBlock('constitution','en',0),rejected=assert.rejects(pending,{name:'AbortError'});await pendingStarted;corpus.releaseReader();corpus.json=readJson;const reopened=corpus.loadBlock('constitution','en',0);await rejected;await reopened;assert.equal(corpus.cacheStats().blocks,1);assert.equal(corpus.cacheStats().pendingBlocks,0);
});

test('multi-document report quotations retain translated titles, labels and exact text after descriptor eviction',async()=>{
 const corpus=new Corpus(base);corpus.json=async path=>{assert.doesNotMatch(path,/^data\/(?:documents\/|translations\/(?:en|zh)\/)/);return read(path);};await corpus.initialize();
 const sources=await Promise.all(['constitution','koap','procurement44'].map(id=>corpus.load(id))),ids=sources.map(doc=>doc.units.at(-1).id);
 const app={corpus,locale:'zh',state:{reader:{}}},passages=await prepareReportPassages(app,sources,ids);assert.equal(passages.size,3);assert.equal(corpus.cacheStats().readerDocuments,1);
 for(let i=0;i<sources.length;i++){const translated=await read('data/translations/zh/'+sources[i].id+'.json'),passage=passages.get(ids[i]);assert.equal(passage.locale,'zh');assert.equal(passage.title,translated.title);assert.equal(passage.unit.text,translated.units[ids[i]].text);assert.ok(passage.label);}
 corpus.releaseReader();assert.ok([...passages.values()].every(passage=>passage.unit.text),'A visible report owns only its requested quotations');
});

const until=async predicate=>{const end=Date.now()+5000;while(!predicate()){if(Date.now()>end)throw new Error('Expected asynchronous reader state was not reached');await new Promise(resolve=>setImmediate(resolve));}};
async function readerFixture(){const corpus=new Corpus(base);corpus.json=async path=>read(path);await corpus.initialize();await corpus.readerDocument('koap','ru');return corpus;}

test('rapidly replaced windows fetch at most three blocks and discard obsolete queued work',async()=>{
 const corpus=await readerFixture(),started=[],gates=new Map();let active=0,maximum=0;
 corpus.json=async(path,sha,{signal}={})=>{
  if(!path.includes('/blocks/'))return read(path);
  const index=Number(path.match(/(\d+)\.json$/)[1]);started.push(index);maximum=Math.max(maximum,++active);
  try{await new Promise((resolve,reject)=>{const cancel=()=>reject(new DOMException('Aborted','AbortError'));signal.addEventListener('abort',cancel,{once:true});gates.set(index,()=>{signal.removeEventListener('abort',cancel);resolve();});});return await read(path);}finally{active--;gates.delete(index);}
 };
 const controllers=Array.from({length:30},()=>new AbortController()),requests=controllers.map((controller,index)=>corpus.loadBlock('koap','ru',index,{signal:controller.signal})),results=Promise.allSettled(requests);
 await until(()=>started.length===3);assert.equal(corpus.cacheStats().activeBlockLoads,3);assert.equal(corpus.cacheStats().queuedBlockLoads,27);
 for(const controller of controllers.slice(0,27))controller.abort();
 await until(()=>started.length===6);assert.deepEqual(started,[0,1,2,27,28,29]);for(const release of [...gates.values()])release();
 const settled=await results;await until(()=>corpus.cacheStats().activeBlockLoads===0);assert.equal(maximum,3);assert.equal(settled.filter(result=>result.status==='fulfilled').length,3);assert.ok(settled.slice(0,27).every(result=>result.reason?.name==='AbortError'));assert.equal(corpus.cacheStats().queuedBlockLoads,0);assert.equal(corpus.cacheStats().pendingBlocks,0);assert.equal(corpus.cacheStats().blocks,3);
 corpus.destroy();
});

test('shared block cancellation preserves another consumer and aborts work with no consumers',async()=>{
 const corpus=await readerFixture(),gates=new Map(),fetchSignals=[];let calls=0;
 corpus.json=async(path,sha,{signal}={})=>{if(!path.includes('/blocks/'))return read(path);const index=Number(path.match(/(\d+)\.json$/)[1]);calls++;fetchSignals.push(signal);await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});gates.set(index,resolve);});return read(path);};
 const first=new AbortController(),second=new AbortController(),one=corpus.loadBlock('koap','ru',0,{signal:first.signal}),two=corpus.loadBlock('koap','ru',0,{signal:second.signal}),firstRejected=assert.rejects(one,{name:'AbortError'});
 await until(()=>calls===1);first.abort();await firstRejected;assert.equal(fetchSignals[0].aborted,false);gates.get(0)();assert.equal((await two).id,0);assert.equal(calls,1);
 const abandoned=new AbortController(),old=corpus.loadBlock('koap','ru',1,{signal:abandoned.signal}),oldRejected=assert.rejects(old,{name:'AbortError'});await until(()=>calls===2);abandoned.abort();await oldRejected;await until(()=>corpus.cacheStats().activeBlockLoads===0);assert.equal(fetchSignals[1].aborted,true);assert.equal(corpus.peekBlock('koap','ru',1),null);corpus.destroy();
});

test('cancelled non-cooperative fetches retain scheduler slots until completion and cannot enter cache',async()=>{
 const corpus=await readerFixture(),started=[],gates=new Map();
 corpus.json=async path=>{if(!path.includes('/blocks/'))return read(path);const index=Number(path.match(/(\d+)\.json$/)[1]);started.push(index);await new Promise(resolve=>gates.set(index,resolve));return read(path);};
 const oldController=new AbortController(),oldResults=Promise.allSettled([0,1,2].map(index=>corpus.loadBlock('koap','ru',index,{signal:oldController.signal})));
 await until(()=>started.length===3);oldController.abort();await oldResults;
 const nextResults=Promise.all([3,4,5].map(index=>corpus.loadBlock('koap','ru',index)));await until(()=>corpus.cacheStats().queuedBlockLoads===3);assert.deepEqual(started,[0,1,2]);
 for(const index of [0,1,2])gates.get(index)();await until(()=>started.length===6);for(const index of [3,4,5])gates.get(index)();await nextResults;await until(()=>corpus.cacheStats().activeBlockLoads===0);for(const index of [0,1,2])assert.equal(corpus.peekBlock('koap','ru',index),null);assert.equal(corpus.cacheStats().blocks,3);corpus.destroy();
});

test('aborted descriptor scopes cannot activate old documents or replace the current descriptor',async()=>{
 const corpus=await readerFixture();let started=false,release;const gate=new Promise(resolve=>{release=resolve;});
 corpus.json=async path=>{if(path==='data/reader/constitution/en/manifest.json'){started=true;await gate;}return read(path);};
 const controller=new AbortController(),old=corpus.readerDocument('constitution','en',{signal:controller.signal}),rejected=assert.rejects(old,{name:'AbortError'});await until(()=>started);controller.abort();await rejected;const current=await corpus.readerDocument('koap','ru');release();await new Promise(resolve=>setImmediate(resolve));assert.equal(corpus.peekReaderDocument('koap','ru'),current);
 await assert.rejects(corpus.readerDocument('constitution','en',{signal:controller.signal}),{name:'AbortError'});assert.equal(corpus.readerData.requestedKey,'koap/ru');corpus.destroy();
});

test('JSON loading checks cancellation before decoding an obsolete response',async()=>{
 const oldFetch=globalThis.fetch,controller=new AbortController(),corpus=new Corpus(base);
 try{globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>{controller.abort();return new TextEncoder().encode('invalid obsolete JSON').buffer;}});await assert.rejects(corpus.json('obsolete.json',null,{signal:controller.signal}),{name:'AbortError'});}finally{globalThis.fetch=oldFetch;corpus.destroy();}
});

test('destroy during structural loading cannot repopulate the grading cache',async()=>{
 const corpus=new Corpus(base);corpus.json=async path=>read(path);await corpus.initialize();let started=false,release;const gate=new Promise(resolve=>{release=resolve;});
 corpus.json=async path=>{if(path==='data/reader/koap/structure.json'){started=true;await gate;}return read(path);};
 const pending=corpus.load('koap'),rejected=assert.rejects(pending,{name:'AbortError'});await until(()=>started);corpus.destroy();release();await rejected;assert.equal(corpus.cache.size,0);assert.equal(corpus.inflight.size,0);assert.equal(corpus.cacheStats().pendingBlocks,0);await assert.rejects(corpus.load('koap'),{name:'AbortError'});await assert.rejects(corpus.readerDocument('koap','ru'),{name:'AbortError'});
});
