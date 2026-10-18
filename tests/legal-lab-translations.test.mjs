import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {DocumentTranslations,DocumentTranslationError,displayDocument,labelForDisplayUnit} from '../site/apps/legal-lab/lib/translations.mjs';
import {searchUnits} from '../site/apps/legal-lab/lib/core.mjs';

const base='https://synthetic.invalid/apps/legal-lab/',sha=value=>createHash('sha256').update(value).digest('hex');
const copy=value=>structuredClone(value),deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
function fixture(locale='en'){
  const texts=['Статья 10','1. Первая часть','2) Второй пункт','а) Подпункт','Продолжение нормы','2. Вторая часть','Примечание. Сноска'];
  const doc={id:'constitution',version:'synthetic-v1',sha256:'a'.repeat(64),coverage:'full',reviewStatus:'reviewed',title:'Исходный акт',revisionLabel:'Редакция',sourceUrl:'https://source.invalid/act',number:'123',
    sections:[{id:'s1',title:'Статья 10',unitIds:texts.map((_,i)=>'u'+i)}],units:texts.map((text,i)=>({id:'u'+i,sectionId:'s1',text,locator:'Статья 10'}))};
  doc.units[4].context='Исходный контекст';doc.units[6].tableRow=true;doc.units[6].imageUrl='scan/original.png';
  const source={version:doc.version,sha256:doc.sha256,fileSha256:'b'.repeat(64)};
  const catalog={contentVersion:doc.version,documents:[{id:doc.id,...source,coverage:'full'}]};
  const translation={schema:1,docId:doc.id,locale,source:copy(source),status:'translated',kind:'educational-unofficial',title:'Translated act',revisionLabel:'Translated revision',sections:{s1:'Article 10'},units:Object.fromEntries(texts.map((_,i)=>['u'+i,{text:'Translated text '+i,locator:'Article 10'}]))};
  translation.units.u4.context='Translated context';
  const entry={docId:doc.id,locale,file:`${locale}/${doc.id}.json`,sha256:sha(JSON.stringify(translation)),source:copy(source),status:'complete',review:{status:'approved',kind:'independent-synthetic-review',evidence:'synthetic fixture only'}};
  const registry={schema:1,contentVersion:doc.version,kind:'educational-unofficial',documents:[entry]},calls=[];
  const f={doc,catalog,translation,entry,registry,calls,raw:null};
  f.rehash=()=>{entry.sha256=sha(f.raw??JSON.stringify(translation));};
  f.fetch=async(url,options)=>{calls.push({url:String(url),options});const raw=String(url).endsWith('/catalog.json')?JSON.stringify(registry):f.raw??JSON.stringify(translation);return new Response(raw,{status:200});};
  f.loader=options=>new DocumentTranslations(base,{catalog,fetch:f.fetch,...options});
  return f;
}
const code=suffix=>error=>error instanceof DocumentTranslationError&&error.code===`legal-lab/translations-${suffix}`;

test('every shipped translation has full original coverage and exact approved review pins',async()=>{
 const module=new URL('../site/apps/legal-lab/',import.meta.url),root=new URL('../',import.meta.url);
 const registryBytes=await readFile(new URL('data/translations/catalog.json',module)),registry=JSON.parse(registryBytes);
 const catalog=JSON.parse(await readFile(new URL('data/catalog.json',module),'utf8'));
 assert.equal(registry.contentVersion,catalog.contentVersion);assert.ok(registry.documents.length>0);
 const loader=new DocumentTranslations(base,{catalog,fetch:async url=>{const rel=String(url).slice(base.length);return new Response(await readFile(new URL(rel,module)),{status:200});}});
 const keys=new Set();for(const entry of registry.documents){
  const key=entry.docId+':'+entry.locale;assert.ok(!keys.has(key));keys.add(key);
  const meta=catalog.documents.find(d=>d.id===entry.docId),original=JSON.parse(await readFile(new URL('data/'+meta.file,module),'utf8'));
  const payload=await loader.load(original,entry.locale);assert.equal(Object.keys(payload.units).length,original.units.length);assert.equal(Object.keys(payload.sections).length,original.sections.length);
  const loadReview=async reference=>{const [file,hash]=reference.split('#sha256=');assert.match(file,/^docs\/quality\/legal-document-translations\/[a-z0-9-]+\.json$/);assert.match(hash,/^[a-f0-9]{64}$/);const bytes=await readFile(new URL(file,root));assert.equal(sha(bytes),hash);return JSON.parse(bytes);};
  const assertReview=async(review,expectedSHA)=>{
   assert.equal(review.status,'approved');
   if(Array.isArray(review.payloadDecisions)){
    const decision=review.payloadDecisions.find(d=>d.docId===entry.docId&&d.locale===entry.locale&&d.payloadSha256===expectedSHA&&d.status==='approved');assert.ok(decision);
    assert.equal(decision.reviewedUnits,original.units.length);assert.equal(decision.reviewedSections,original.sections.length);
    if(decision.transport){assert.equal(decision.transport.kind,'crlf-to-lf-only');const bytes=await readFile(new URL('data/translations/'+entry.file,module)),text=bytes.toString('utf8');assert.equal(text.includes('\r'),false);assert.equal(sha(bytes),expectedSHA);assert.equal(sha(Buffer.from(text.replaceAll('\n','\r\n'))),decision.transport.fromSha256);assert.deepEqual(JSON.parse(text),JSON.parse(text.replaceAll('\n','\r\n')));await assertReview(await loadReview(decision.transport.originalReview),decision.transport.fromSha256);}
   }else if(review.approvedTranslationPins){assert.equal(review.docId,entry.docId);assert.equal(review.authorIndependent,true);assert.equal(review.approvedTranslationPins[entry.locale],expectedSHA);assert.deepEqual(Object.fromEntries(Object.keys(entry.source).map(key=>[key,review.source[key]])),entry.source);assert.equal(review.source.units,original.units.length);assert.equal(review.source.sections,original.sections.length);assert.deepEqual(review.coverage.reviewedUnitIds,original.units.map(u=>u.id));assert.deepEqual(review.coverage.reviewedSectionIds,original.sections.map(s=>s.id));assert.equal(review.coverage.sampling,false);assert.equal(review.coverage.locales[entry.locale].units,original.units.length);assert.equal(review.coverage.locales[entry.locale].sections,original.sections.length);}
   else {assert.equal(review.scope.docId,entry.docId);assert.ok(review.scope.locales.includes(entry.locale));assert.equal(review.pins[entry.locale],expectedSHA);assert.deepEqual(review.source,entry.source);assert.equal(review.scope.sourceUnits,original.units.length);assert.equal(review.scope.sourceSections,original.sections.length);}
  };
  await assertReview(await loadReview(entry.review.evidence),entry.sha256);
 }
});

test('a genuinely empty registry makes no document availability claim',async()=>{
 const f=fixture();f.registry.documents=[];const loader=f.loader();assert.equal(await loader.load(f.doc,'en'),null);assert.equal(await loader.load(f.doc,'zh'),null);assert.equal(f.calls.length,1);assert.equal(loader.get(f.doc,'en'),null);
});

test('original and unavailable locales never fetch translations; initialization is lazy',async()=>{
  const f=fixture(),loader=f.loader();assert.equal(loader.get(f.doc,'en'),null);
  for(const locale of ['ru','de',undefined]){assert.equal(await loader.load(f.doc,locale),null);assert.equal(loader.get(f.doc,locale),null);}
  assert.equal(f.calls.length,0);assert.equal(await loader.load(f.doc,'zh'),null);assert.equal(f.calls.length,1);
  assert.equal(await loader.load({...f.doc,id:'missing'},'en'),null);assert.equal(f.calls.length,1);
});

test('concurrent initialize and document loads deduplicate and preserve input objects',async()=>{
  const f=fixture(),before=copy({doc:f.doc,catalog:f.catalog,translation:f.translation}),loader=f.loader();
  await Promise.all([loader.initialize(),loader.initialize()]);assert.equal(f.calls.length,1);
  const [a,b]=await Promise.all([loader.load(f.doc,'en'),loader.load(f.doc,'en')]);
  assert.equal(a,b);assert.equal(loader.get(f.doc,'en'),a);assert.equal(await loader.load(f.doc,'en'),a);assert.equal(f.calls.length,2);
  assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.units.u4));assert.deepEqual({doc:f.doc,catalog:f.catalog,translation:f.translation},before);
  assert.deepEqual(f.calls.map(call=>call.url),[base+'data/translations/catalog.json',base+'data/translations/en/constitution.json']);
  assert.ok(f.calls.every(call=>call.options.credentials==='same-origin'&&call.options.cache==='no-cache'));
});

test('raw translation bytes must match the registered SHA and a failure is retryable',async()=>{
  const f=fixture(),loader=f.loader();f.raw=JSON.stringify(f.translation)+'\n';
  await assert.rejects(loader.load(f.doc,'en'),code('hash'));assert.equal(loader.get(f.doc,'en'),null);
  f.raw=null;assert.equal((await loader.load(f.doc,'en')).docId,f.doc.id);assert.equal(f.calls.length,3);
});

test('registry rejects stale pins, duplicates, traversal and unreviewed entries before a document fetch',async()=>{
  const cases=[
    ['catalog',f=>f.registry.schema=2],['catalog',f=>f.registry.contentVersion='old'],['catalog',f=>f.registry.kind='official'],
    ['catalog',f=>f.registry.documents.push(copy(f.entry))],['catalog',f=>f.entry.file='../constitution.json'],
    ['catalog',f=>f.entry.file='https://other.invalid/act.json'],['catalog',f=>f.entry.sha256='bad'],
    ['source',f=>f.entry.source.version='old'],['source',f=>f.entry.source.sha256='c'.repeat(64)],
    ['source',f=>f.entry.source.fileSha256='c'.repeat(64)],['source',f=>f.catalog.documents.push(copy(f.catalog.documents[0]))],
    ['review',f=>f.entry.status='draft'],['review',f=>f.entry.review.status='pending'],['review',f=>f.entry.review.kind='official'],['review',f=>f.entry.review.evidence=' ']
  ];
  for(const [expected,mutate] of cases){const f=fixture();mutate(f);await assert.rejects(f.loader().load(f.doc,'en'),code(expected));assert.equal(f.calls.length,1);}
});

test('cached get and load reject changed original or catalog pins',async()=>{
  for(const mutate of [f=>f.doc.version='old',f=>f.doc.sha256='c'.repeat(64),f=>f.catalog.documents[0].fileSha256='c'.repeat(64)]){
    const f=fixture(),loader=f.loader();await loader.load(f.doc,'en');mutate(f);
    assert.throws(()=>loader.get(f.doc,'en'),code('source'));await assert.rejects(loader.load(f.doc,'en'),code('source'));assert.equal(f.calls.length,2);
  }
});

test('payload validates identity, exact coverage, strings, context and protected ID fields',async()=>{
  const cases=[
    ['payload',f=>f.translation.schema=2],['payload',f=>f.translation.kind='official'],['payload',f=>f.translation.status='draft'],
    ['payload',f=>f.translation.locale='zh'],['payload',f=>f.translation.docId='other'],['payload',f=>f.translation.title=' '],
    ['payload',f=>f.translation.revisionLabel=''],['source',f=>f.translation.source.version='old'],['source',f=>f.translation.source.fileSha256='c'.repeat(64)],
    ['coverage',f=>delete f.translation.units.u1],['coverage',f=>f.translation.units.extra={text:'Extra',locator:'Extra'}],
    ['coverage',f=>delete f.translation.sections.s1],['coverage',f=>f.translation.sections.extra='Extra'],['coverage',f=>f.translation.sections.s1=''],
    ['coverage',f=>f.translation.units.u1.text=' '],['coverage',f=>f.translation.units.u1.locator=null],['coverage',f=>f.translation.units.u1.id='wrong'],
    ['coverage',f=>delete f.translation.units.u4.context],['coverage',f=>f.translation.units.u2.context='Invented context']
  ];
  for(const [expected,mutate] of cases){const f=fixture();mutate(f);f.rehash();const loader=f.loader();await assert.rejects(loader.load(f.doc,'en'),code(expected));assert.equal(loader.get(f.doc,'en'),null);}
  const f=fixture();f.raw='{not JSON';f.rehash();await assert.rejects(f.loader().load(f.doc,'en'),code('payload'));
});

test('aborts before and during either fetch cannot publish a cache entry',async()=>{
  const already=fixture(),controller=new AbortController();controller.abort();await assert.rejects(already.loader({signal:controller.signal}).initialize(),{name:'AbortError'});assert.equal(already.calls.length,0);
  for(const during of ['catalog','document']){
    const f=fixture(),control=new AbortController(),gate=deferred(),entered=deferred();
    const fetch=async(url,options)=>{const response=await f.fetch(url,options);if(String(url).includes(during==='catalog'?'/catalog.json':'/en/')){entered.resolve();await gate.promise;}return response;};
    const loader=f.loader({signal:control.signal,fetch}),pending=loader.load(f.doc,'en');await entered.promise;control.abort();gate.resolve();
    await assert.rejects(pending,{name:'AbortError'});assert.equal(loader.cache.size,0);assert.equal(loader.inflight.size,0);
  }
});

test('HTTP and network failures remain typed and do not cache a translation',async()=>{
  for(const fetch of [async()=>new Response('',{status:404}),async()=>{throw new TypeError('Synthetic offline');},async()=>({ok:true,arrayBuffer:async()=>{throw new TypeError('Synthetic interrupted response');}})]){
    const f=fixture(),loader=f.loader({fetch});await assert.rejects(loader.load(f.doc,'en'),code('load'));assert.equal(loader.cache.size,0);
  }
});

test('search display retains original IDs and image fields but has no grading pins',async()=>{
  const f=fixture(),before=copy(f.doc),translation=await f.loader().load(f.doc,'en'),view=displayDocument(f.doc,translation);
  assert.equal(displayDocument(f.doc,null),f.doc);assert.equal(view.displayOnly,true);assert.equal(view.id,f.doc.id);
  for(const key of ['version','sha256','fileSha256','coverage','reviewStatus'])assert.ok(!own(view,key));
  assert.deepEqual(view.units.map(unit=>unit.id),f.doc.units.map(unit=>unit.id));assert.deepEqual(view.sections.map(section=>section.unitIds),f.doc.sections.map(section=>section.unitIds));
  assert.equal(view.units[6].imageUrl,f.doc.units[6].imageUrl);assert.equal(view.units[6].tableRow,true);assert.equal(view.units[4].context,'Translated context');
  assert.equal(searchUnits(view,'translated text 4')[0].id,'u4');assert.deepEqual(f.doc,before);
  view.sections[0].unitIds.pop();view.units[0].text='View-only edit';assert.deepEqual(f.doc,before);assert.equal(translation.units.u0.text,'Translated text 0');
});
const own=(value,key)=>Object.hasOwn(value,key);

test('display labels retain RU legal hierarchy and source glyphs while quoting translated prose',async()=>{
  for(const locale of ['en','zh']){
    const f=fixture(locale);f.translation.units.u4.text=locale==='en'?'Continuation: obligations remain.':'继续规定：义务保持不变。';f.rehash();
    const translation=await f.loader().load(f.doc,locale);
    assert.equal(labelForDisplayUnit(f.doc,'u3',translation,locale),locale==='en'?'Subpoint «а» Point 2 Part 1 Art. 10':'第«а»目 第2项 第1款 第10条');
    assert.equal(labelForDisplayUnit(f.doc,'u4',translation,locale),locale==='en'?'Subpoint «а» Point 2 Part 1 Art. 10 · “Continuation: obligations remain.”':'第«а»目 第2项 第1款 第10条 · “继续规定：义务保持不变。”');
    assert.equal(labelForDisplayUnit(f.doc,'u5',translation,locale),locale==='en'?'Part 2 Art. 10':'第2款 第10条');
    assert.doesNotMatch(labelForDisplayUnit(f.doc,'u6',translation,locale),/Part 2|第2款/);
    assert.equal(labelForDisplayUnit(f.doc,'absent',translation,locale),'');assert.equal(labelForDisplayUnit(f.doc,'u3',translation,'ru'),'Подп.«а» П.2 Ч.1 Ст.10');
  }
});

test('point policies, literal headings and unnumbered text do not infer structure from EN or ZH',()=>{
  const make=(id,texts,title,locale='en')=>{
    const f=fixture(locale);f.doc.id=id;f.doc.units=texts.map((text,i)=>({id:'u'+i,sectionId:'s1',text,locator:title}));f.doc.sections=[{id:'s1',title,unitIds:f.doc.units.map(u=>u.id)}];
    f.translation.docId=id;f.translation.sections={s1:'Translated literal heading'};f.translation.units=Object.fromEntries(f.doc.units.map(u=>[u.id,{text:'999. Not a source part',locator:'Translated locator'}]));return f;
  };
  const point=make('ekb',['Статья 25','2-1. Пункт','3) Подпункт'],'Статья 25');assert.equal(labelForDisplayUnit(point.doc,'u2',point.translation,'en'),'Subpoint 3 Point 2-1 Art. 25');
  const single=make('constitution',['Статья 10','Единственная норма'],'Статья 10');assert.equal(labelForDisplayUnit(single.doc,'u1',single.translation,'en'),'Art. 10 · text');
  const multi=make('koap',['Статья 7, статья 8. Утратили силу','Продолжение'],'Статья 7, статья 8. Утратили силу');
  assert.equal(labelForDisplayUnit(multi.doc,'u0',multi.translation,'en'),'Translated literal heading');assert.equal(labelForDisplayUnit(multi.doc,'u1',multi.translation,'en'),'Translated literal heading · “999. Not a source part”');
  const literal=make('unknown',['Раздел · Дополнение','Продолжение'],'Раздел · Дополнение');assert.equal(labelForDisplayUnit(literal.doc,'u0',literal.translation,'en'),'Translated literal heading');
  assert.equal(labelForDisplayUnit(literal.doc,'u1',literal.translation,'en'),'Translated literal heading · “999. Not a source part”');
  assert.throws(()=>displayDocument({...single.doc,version:'old'},single.translation),code('source'));
  single.translation.units.u1.id='wrong';assert.throws(()=>displayDocument(single.doc,single.translation),code('coverage'));
});

test('default browser fetch keeps its global receiver while explicit fetch remains injectable',async()=>{
 const f=fixture(),previous=globalThis.fetch;globalThis.fetch=function(...args){assert.equal(this,globalThis,'Window.fetch requires its global receiver');return f.fetch(...args);};
 try{const loader=new DocumentTranslations(base,{catalog:f.catalog});assert.equal((await loader.load(f.doc,'en')).locale,'en');assert.equal(f.calls.length,2);}finally{globalThis.fetch=previous;}
});


test('course cache preparation excludes full RU, EN and ZH texts until the reader opens them',async()=>{
 const {warmCourseCache}=await import('../site/apps/legal-lab/platform.mjs');
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),previousFetch=globalThis.fetch,listeners=new Set(),messages=[];
 const serviceWorker={controller:{postMessage(message){messages.push(message);queueMicrotask(()=>{for(const listener of listeners)listener({data:{type:'MODULE_CACHE_STATUS',requestId:message.requestId,ready:true}});});}},addEventListener(type,listener){assert.equal(type,'message');listeners.add(listener);},removeEventListener(type,listener){listeners.delete(listener);}};
 const paths=['entry.mjs','data/translations/catalog.json','data/translations/en/constitution.json','data/translations/zh/constitution.json','data/documents/constitution.json','data/documents/figures/example.png','assets/scans/graded-01.png'];
 try{Object.defineProperty(globalThis,'navigator',{value:{serviceWorker},configurable:true});globalThis.fetch=async url=>{assert.ok(String(url).endsWith('/precache-manifest.json'));return new Response(JSON.stringify({contentVersion:'test-cache',files:paths.map(path=>({url:'apps/legal-lab/'+path}))}));};
  assert.equal(await warmCourseCache('test-cache'),true);const urls=messages.flatMap(message=>message.urls);assert.equal(urls.length,2);assert.ok(urls.some(url=>url.endsWith('/data/translations/catalog.json')));assert.equal(urls.some(url=>url.endsWith('/assets/scans/graded-01.png')),false,'Unseen scans must not compete with document reading');for(const url of urls)assert.doesNotMatch(url,/\/data\/(?:documents|translations\/(?:en|zh))\//);assert.equal(listeners.size,0);const requests=messages.length;assert.equal(await warmCourseCache('test-cache'),true);assert.equal(messages.length,requests,'Repeated mounts reuse this release shell preparation');
 }finally{globalThis.fetch=previousFetch;if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});
