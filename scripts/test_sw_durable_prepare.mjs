import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

// Synthetic CacheStorage faults exercise the actual worker. No browser,
// student, network service or production storage is replaced by these tests.
const source=await fs.readFile(new URL('../site/service-worker.js',import.meta.url),'utf8');
const scope='https://test.invalid/RUDN/',id='b'.repeat(32);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const root=`/RUDN/_releases/${id}/`;
const entry=root+'index.html',main=root+'assets/js/main.js',descriptor=root+'release.json',manifestPath=root+'manifest.json';
function harness(){
  const files=new Map([[entry,'<html>verified</html>'],[main,'verified-runtime']]);
  const resources=Object.fromEntries([['index.html',entry],['assets/js/main.js',main]].map(([name,url])=>[name,{url,sha256:sha(files.get(url)),bytes:files.get(url).length,kind:'runtime'}]));
  const manifest=JSON.stringify({schema:1,buildId:id,runtimeRoot:root,resources,packs:{shell:Object.keys(resources)}});
  const target={buildId:id,manifestURL:manifestPath,manifestSha256:sha(manifest),entryURL:entry};
  files.set(manifestPath,manifest);files.set(descriptor,JSON.stringify(target));
  const maps=new Map(),stores=new Map(),listeners=new Map(),faults={open:null,put:null,match:null,drop:null};
  const urlOf=input=>new URL(typeof input==='string'?input:input.url||input.href,scope).href;
  const caches={async open(name){
    if(faults.open?.(name))throw new Error('synthetic-cache-open');
    if(!stores.has(name)){
      const map=new Map();maps.set(name,map);
      stores.set(name,{
        async match(input){const url=urlOf(input);if(faults.match?.(name,url))throw new Error('synthetic-cache-match');return map.get(url)?.clone();},
        async put(input,response){const url=urlOf(input);if(faults.put?.(name,url))throw new Error('synthetic-cache-put');if(!faults.drop?.(name,url))map.set(url,response.clone());},
        async delete(input){return map.delete(urlOf(input));},
        async keys(){return [...map.keys()].map(url=>new Request(url));}
      });
    }
    return stores.get(name);
  },async keys(){return [...stores.keys()];},async delete(name){maps.delete(name);return stores.delete(name);}};
  const clients=[],messages=[];let skipWaitingCalls=0;
  const context=vm.createContext({URL,Request,Response,AbortController,crypto:crypto.webcrypto,setTimeout,clearTimeout,caches,
    fetch:async input=>{const path=new URL(urlOf(input)).pathname;return new Response(files.get(path)||'missing',{status:files.has(path)?200:404});},
    self:{registration:{scope},addEventListener:(name,fn)=>listeners.set(name,fn),skipWaiting:async()=>{skipWaitingCalls++;},clients:{matchAll:async()=>clients,get:async key=>clients.find(c=>c.id===key),claim:async()=>{}}}});
  vm.runInContext(source.replace('const PLATFORM_RELEASE=null;',`const PLATFORM_RELEASE=${JSON.stringify({schema:1,current:target,previous:null})};`)+
    '\nthis.api={platformPrepare,platformManifest,platformChecked,platformCache,bindClient};',context);
  const api=context.api,cacheName=api.platformCache(id),client={id:'tab',url:scope,postMessage:message=>messages.push(message)};clients.push(client);
  async function prepareMessage(){await api.bindClient(client.id,cacheName);const pending=[];listeners.get('message')({source:client,data:{type:'PREPARE_MODULE',module:'shell',requestId:'durable'},waitUntil:value=>pending.push(value)});await Promise.all(pending);return messages.findLast(m=>m.type==='MODULE_CACHE_STATUS');}
  return {api,target,cacheName,files,maps,stores,faults,caches,messages,prepareMessage,urlOf,
    get skipWaitingCalls(){return skipWaitingCalls;},
    async install(){const pending=[];listeners.get('install')({waitUntil:value=>pending.push(value)});await Promise.all(pending);},
    async prime(){await api.platformManifest(target);},
    async read(path){return (await caches.open(cacheName)).match(urlOf(path));},
    async erase(path){return (await caches.open(cacheName)).delete(urlOf(path));}};
}

test('prepare refuses ready when a verified runtime cannot be stored',async()=>{
  const h=harness();await h.prime();h.faults.put=(name,url)=>name===h.cacheName&&url.endsWith(main);
  const reply=await h.prepareMessage();assert.equal(reply.ready,false);assert.equal(reply.failed,1);
  assert.equal(await h.read(main),undefined);
});

test('install never skips waiting when mandatory shell persistence fails',async()=>{
  const h=harness();h.faults.put=(name,url)=>name===h.cacheName&&url.endsWith(main);
  await assert.rejects(h.install());assert.equal(h.skipWaitingCalls,0);
});

test('prepare refuses ready when the release cache cannot be opened after RAM manifest load',async()=>{
  const h=harness();await h.prime();h.faults.open=name=>name===h.cacheName;
  await assert.rejects(h.api.platformPrepare(h.target,'shell'));
});

for(const missing of [manifestPath,descriptor])test(`RAM manifest cannot bypass missing persisted ${missing.split('/').at(-1)}`,async()=>{
  const h=harness();await h.prime();await h.erase(missing);h.faults.put=(name,url)=>name===h.cacheName&&url.endsWith(missing);
  await assert.rejects(h.api.platformPrepare(h.target,'shell'));
  assert.equal(await h.read(missing),undefined);
});

test('prepare verifies readback instead of accepting a resolved no-op cache write',async()=>{
  const h=harness();await h.prime();h.faults.drop=(name,url)=>name===h.cacheName&&url.endsWith(main);
  await assert.rejects(h.api.platformPrepare(h.target,'shell'));
});

test('strict prepare rechecks bytes even when this URL was verified earlier',async()=>{
  const h=harness();await h.api.platformPrepare(h.target,'shell');
  const cache=await h.caches.open(h.cacheName);await cache.put(h.urlOf(main),new Response('corrupt'));
  await h.api.platformPrepare(h.target,'shell');assert.equal(await (await h.read(main)).text(),'verified-runtime');
});

test('online verified runtime remains usable when optional cache storage rejects writes',async()=>{
  const h=harness();h.faults.put=name=>name===h.cacheName;
  const manifest=await h.api.platformManifest(h.target);assert.equal(manifest.buildId,id);
  const response=await h.api.platformChecked(main,sha('verified-runtime'),h.cacheName);assert.equal(await response.text(),'verified-runtime');
});

test('complete preparation persists its descriptor, manifest and verified shell',async()=>{
  const h=harness();const result=await h.api.platformPrepare(h.target,'shell');assert.equal(result.ready,true);
  for(const [path,expected] of [[manifestPath,h.target.manifestSha256],[descriptor,sha(JSON.stringify(h.target))],[entry,sha(h.files.get(entry))],[main,sha(h.files.get(main))]]){
    const stored=await h.read(path);assert.ok(stored,path);assert.equal(sha(Buffer.from(await stored.arrayBuffer())),expected,path);
  }
});
