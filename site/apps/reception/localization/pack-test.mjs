// Structural, synthetic locale tests only. Fake translations never touch compiled/.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {createLocalePackPlan,compileLocalePacks,compileEvidenceAliasPack,digest} from './pack-builder.mjs';
import {unapprovedCyrillic,approvedEvidenceLiterals} from './validation.js';
const require=createRequire(import.meta.url),playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');
const inventory=JSON.parse(await readFile(new URL('source/inventory.json',import.meta.url),'utf8'));
assert.equal(unapprovedCyrillic('Бумажная жалоба Ж-84','Paper complaint Ж-84'),false);
assert.equal(unapprovedCyrillic('Бумажная жалоба Ж-84','纸质申诉Ж-84'),false);
assert.equal(unapprovedCyrillic('Порядок 59-ФЗ','Procedure under 59-ФЗ'),false);
assert.equal(unapprovedCyrillic('П73','П73'),false,'Exact source code without a hyphen');
assert.equal(unapprovedCyrillic('ЭК 41','ЭК 41'),false,'Exact source code with a space');
assert.equal(unapprovedCyrillic('П73','П74'),true,'Another numeric reference is never exempt');
assert.equal(unapprovedCyrillic('Бумажная жалоба Ж-84','Paper complaint Д-24'),true,'Invented reference code not exempt');
assert.equal(unapprovedCyrillic('Бумажная жалоба Ж-84','Бумажная complaint Ж-84'),true,'Reference exemption never hides prose');
const typo=inventory.entries.find(entry=>entry.id==='9d4b35f1aca75fc1'),literals=approvedEvidenceLiterals(typo);
assert.deepEqual(literals,['Соловёв','Соловьёв']);
assert.equal(unapprovedCyrillic(typo.ru,'The spelling “Соловёв” differs from “Соловьёв”.',{literals}),false);
assert.equal(unapprovedCyrillic(typo.ru,'The spelling “Соловёв” differs from “Соловьёв”.'),true,'Names outside this exercise are not exempt');
assert.deepEqual(approvedEvidenceLiterals({...typo,id:'different-case'}),[]);
assert.deepEqual(approvedEvidenceLiterals({...typo,contexts:['unrelated-source']}),[]);
const before=JSON.stringify(inventory),plan=await createLocalePackPlan(inventory);
assert.equal(plan.templateIds.length,178);assert.equal(plan.groups.size,181);
assert.equal(JSON.stringify(inventory),before,'Build never mutates authored inventory');
const all=new Set([...plan.groups.values()].flatMap(values=>[...values]));
assert(inventory.entries.filter(entry=>!entry.nonDisplay).every(entry=>all.has(entry.ru)),'Every authored display string belongs to at least one pack');
const synthetic=new Map([...all].map(source=>[source,{en:'QA-EN-'+digest(source),zh:'QA-ZH-'+digest(source)}]));
const files=new Map();
const aliasBuild=compileEvidenceAliasPack(plan,synthetic);
assert(aliasBuild.pack.aliases.length>0);assert(aliasBuild.pack.aliases.every(row=>row.values.length===row.accepted.length));
files.set('/compiled/evidence-aliases.manifest.json',JSON.stringify(aliasBuild.manifest));
files.set('/compiled/'+aliasBuild.manifest.path,JSON.stringify(aliasBuild.pack));
for(const locale of ['en','zh']) {
  const {manifest,packs}=compileLocalePacks(plan,locale,synthetic);
  files.set('/compiled/'+locale+'.manifest.json',JSON.stringify(manifest));
  for(const [id,pack] of packs)files.set('/compiled/'+manifest.entries[id].path,JSON.stringify(pack));
  for(const id of plan.templateIds)assert(packs.get('cases/'+id).count<200,'One case cannot pull in the full bank');
  const unique=Object.keys(packs.get('cases/'+plan.templateIds[0]).strings).find(text=>!plan.groups.get('catalog').has(text)&&!plan.groups.get('common').has(text));
  assert(unique,'Case-specific body is not part of common/catalog');
  assert(!Object.hasOwn(packs.get('common').strings,unique));
  assert(!Object.hasOwn(packs.get('catalog').strings,unique));
}
for(const file of ['catalog-loader.js'])files.set('/'+file,await readFile(new URL(file,import.meta.url),'utf8'));
const requestPaths=[];
const server=createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;requestPaths.push(pathname);
  response.setHeader('Cache-Control','no-store');
  if(files.has(pathname)){response.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':'application/json');response.end(files.get(pathname));}
  else if(pathname==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Reception lazy locale QA</title>Isolated locale tests');}
  else {response.statusCode=404;response.end('Missing synthetic fixture');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  for(const engine of (process.env.DURABLE_TEST_BROWSERS||'chromium,webkit').split(',')) {
    const browser=await playwright[engine].launch({headless:true});
    try {
      const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const result=await page.evaluate(async ({ids,contentVersion})=>{
        const {createReceptionCatalogLoader,LOCALE_CACHE}=await import('/catalog-loader.js');
        const check=(condition,label)=>{if(!condition)throw Error(label);},calls=[];
        const fetcher=(url,options)=>{calls.push(new URL(url).pathname);return fetch(url,options);};
        const loader=createReceptionCatalogLoader({fetch:fetcher});
        const first=await loader.load('en',{templateIds:ids.slice(0,2),contentVersion});
        check(first.groups.length===3,'Load common + only two assigned cases');
        check(calls.length===4,'Only manifest/common/two case fetches');
        check(!calls.some(path=>/\/(catalog|source-index)\./.test(path)),'Optional bank/editor not loaded');
        check(!calls.some(path=>path.includes('/cases/'+ids[2]+'.')),'Unassigned third case not loaded');
        await loader.load('en',{templateIds:ids.slice(0,3),contentVersion});check(calls.length===5,'One newly assigned case fetch only');
        await loader.load('en',{templateIds:ids.slice(0,3),includeCatalog:true,contentVersion});check(calls.length===6,'Catalog lazy fetch');
        await loader.load('en',{templateIds:ids.slice(0,3),includeCatalog:true,includeSourceIndex:true,contentVersion});check(calls.length===7,'Source editor lazy fetch');
        let failed=false;try{await loader.load('en',{templateIds:['does-not-exist'],contentVersion});}catch(error){failed=error.code==='locale/unknown-template';}check(failed,'Unknown saved IDs rejected, not substituted');
        const beforeRU=calls.length;await loader.load('ru',{templateIds:ids});check(calls.length===beforeRU,'Russian requires no locale network');
        const chinese=await loader.load('zh',{templateIds:ids.slice(0,2),contentVersion});check(chinese.locale==='zh'&&chinese.groups.length===3,'Chinese separately assigned');
        check(Object.values(chinese.catalog).every(value=>value.startsWith('QA-ZH-')),'No other-language catalog mixing');
        const offline=createReceptionCatalogLoader({fetch:async()=>{throw Error('Synthetic offline');}});
        const restored=await offline.load('en',{templateIds:ids.slice(0,3),contentVersion});check(Object.keys(restored.catalog).length>0,'Cached manifest and exact assigned packs available offline');
        // Tampering is rejected; a cached resource from another generation is not trusted.
        const manifest=first.manifest,entry=manifest.entries.common,cache=await caches.open(LOCALE_CACHE);
        const url=new URL('compiled/'+entry.path,location.href);const original=await (await cache.match(url)).json();
        await cache.put(url,new Response(JSON.stringify({...original,strings:{...original.strings,extra:'tampered'}})));
        let corrupt=false;try{await offline.load('en',{templateIds:[],contentVersion});}catch{corrupt=true;}
        // Its memory copy is valid; inspect a fresh loader for actual cache validation.
        const freshOffline=createReceptionCatalogLoader({fetch:async()=>{throw Error('Synthetic offline');}});
        try{await freshOffline.load('en',{templateIds:[],contentVersion});}catch{corrupt=true;}check(corrupt,'Corrupt cached pack never accepted');
        await cache.put(url,new Response(JSON.stringify(original)));
        const timed=createReceptionCatalogLoader({fetch:()=>new Promise(()=>{}),cacheStorage:null,timeoutMs:40});
        let timedOut=false;const start=performance.now();try{await timed.load('en',{contentVersion});}catch(error){timedOut=error.code==='locale/timeout';}
        check(timedOut&&performance.now()-start<2000,'Hanging request has finite deadline');
        const controller=new AbortController();controller.abort();let aborted=false;
        try{await loader.load('en',{templateIds:ids,signal:controller.signal});}catch(error){aborted=error.name==='AbortError';}check(aborted,'Canceled display request cannot apply a language');
        const count=calls.length,aliases=await loader.loadEvidenceAliases({contentVersion});check(calls.length===count+2,'Small grading aliases use one manifest and one pack, not case documents');
        await loader.loadEvidenceAliases({contentVersion});check(calls.length===count+2,'All-language aliases share one current load');
        const aliasRestored=await offline.loadEvidenceAliases({contentVersion});check(JSON.stringify(aliasRestored)===JSON.stringify(aliases),'Same all-language grading aliases restored offline');
        const aliasURL=new URL('compiled/evidence-aliases.manifest.json',location.href);aliasURL.searchParams.set('content',contentVersion);
        const aliasManifest=await(await cache.match(aliasURL)).json(),aliasPackURL=new URL('compiled/'+aliasManifest.path,location.href),originalAliases=await(await cache.match(aliasPackURL)).json();
        await cache.put(aliasPackURL,new Response(JSON.stringify({...originalAliases,aliases:[]})));
        let badAliases=false;try{await freshOffline.loadEvidenceAliases({contentVersion});}catch{badAliases=true;}check(badAliases,'Corrupt grading aliases never accepted');
        return {assignedOnly:true,incrementalPacks:true,optionalCatalog:true,optionalEditor:true,offlineCache:true,integrity:true,deadline:true,languages:3,gradingAliases:true};
      },{ids:plan.templateIds.slice(0,3),contentVersion:plan.contentVersion});
      assert.deepEqual(errors,[]);console.log(engine+': '+JSON.stringify(result));
    } finally {await browser.close();}
  }
} finally {server.close();}
