import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const siteRoot=fileURLToPath(new URL('../site/',import.meta.url));
const workerSource=await readFile(path.join(siteRoot,'service-worker.js'),'utf8');
const scope='https://example.test/platform-rudn/';
const modulePath='apps/governor/';
const excludedNames=new Set(['LICENSE','VERSION']);

async function runtimeFiles(directory,prefix=''){
  const entries=await readdir(directory,{withFileTypes:true});
  const nested=await Promise.all(entries.map(entry=>{
    const relative=prefix+entry.name;
    if(entry.isDirectory())return runtimeFiles(path.join(directory,entry.name),relative+'/');
    return entry.name.endsWith('.md')||excludedNames.has(entry.name)?[]:[relative];
  }));
  return nested.flat().sort();
}

function makeWorker(workerScope=scope){
  const listeners=new Map();
  const stores=new Map();
  const installedRequests=[];
  let networkCalls=0;
  let skipped=false;
  let claimed=false;
  const urlOf=input=>new URL(typeof input==='string'?input:input.url,workerScope).href;
  const cacheStorage={
    async open(name){
      if(!stores.has(name)){
        const entries=new Map();
        stores.set(name,{
          entries,
          async match(request){return entries.get(urlOf(request))?.clone()},
          async put(request,response){entries.set(urlOf(request),response.clone())},
          async addAll(requests){
            // Like browser addAll, installation fails if any response is unsuccessful.
            const pending=await Promise.all(requests.map(async request=>{
              installedRequests.push(request);
              const response=await harness.fetch(request);
              assert.equal(response.ok,true,`Precache request failed: ${urlOf(request)}`);
              return [request,response];
            }));
            for(const [request,response] of pending)await this.put(request,response);
          }
        });
      }
      return stores.get(name);
    },
    async keys(){return [...stores.keys()]},
    async delete(name){return stores.delete(name)}
    // Deliberately no global match: fallback must use only the owned cache.
  };
  const context=vm.createContext({
    URL,Request,Response,
    caches:cacheStorage,
    fetch:request=>{networkCalls++;return harness.fetch(request)},
    self:{
      registration:{scope:workerScope},
      addEventListener:(name,callback)=>listeners.set(name,callback),
      skipWaiting:async()=>{skipped=true},
      clients:{claim:async()=>{claimed=true}}
    }
  });
  vm.runInContext(workerSource,context,{filename:'service-worker.js'});
  const harness={
    stores,cacheStorage,installedRequests,
    get cacheName(){return vm.runInContext('CACHE',context)},
    get cachePrefix(){return vm.runInContext('CACHE_PREFIX',context)},
    get precache(){return Array.from(vm.runInContext('PRECACHE',context))},
    get networkCalls(){return networkCalls},
    get skipped(){return skipped},
    get claimed(){return claimed},
    async fetch(request){
      const url=new URL(urlOf(request));
      const root=new URL(workerScope);
      assert.equal(url.origin,root.origin);
      assert.ok(url.pathname.startsWith(root.pathname));
      let localPath=path.join(siteRoot,decodeURIComponent(url.pathname.slice(root.pathname.length)));
      if((await stat(localPath)).isDirectory())localPath=path.join(localPath,'index.html');
      return new Response(await readFile(localPath));
    },
    async emit(name,event={}){
      const pending=[];
      listeners.get(name)({...event,waitUntil:promise=>pending.push(promise)});
      await Promise.all(pending);
    },
    async request(relative,options={}){
      let response;
      await this.emit('fetch',{
        request:{url:urlOf(relative),method:'GET',mode:'cors',...options},
        respondWith:promise=>{response=promise}
      });
      return response===undefined?undefined:await response;
    }
  };
  return harness;
}

test('install includes every native runtime file and both native entry URLs',async()=>{
  const worker=makeWorker();
  await worker.emit('install');
  assert.equal(worker.skipped,true);
  assert.equal(new Set(worker.precache).size,worker.precache.length,'No duplicate precache URLs');
  const nativeFiles=await runtimeFiles(path.join(siteRoot,modulePath));
  for(const file of nativeFiles){
    assert.ok(worker.precache.includes('./'+modulePath+file),`Missing native runtime file: ${file}`);
  }
  for(const entry of ['./','./index.html','./apps/puzzle.html','./'+modulePath,'./'+modulePath+'index.html',
    './'+modulePath+'platform-bridge.js','./'+modulePath+'platform-contract.js','./'+modulePath+'platform.css',
    './assets/js/main.js?v=1.3.1','./assets/js/teacher-journal.js?v=1.3.1','./assets/css/site.css?v=1.3.0',
    './assets/js/career-course.js','./apps/career/entry.mjs','./apps/career/runtime.bundle.mjs',
    './apps/career/surface.html','./apps/career/module.css','./apps/career/assets/fonts/noto-sans-sc.woff2',
    './apps/career/data/model-manifest.json','./apps/career/docs/TEACHER-GUIDE-STAGE8.md',
    './assets/course/previews/seminar_07_simulator.jpg']){
    assert.ok(worker.precache.includes(entry),`Missing entry: ${entry}`);
  }
  assert.ok(worker.installedRequests.every(request=>request.cache==='reload'));
  assert.equal(worker.precache.filter(entry=>entry.startsWith('./apps/career/')).length,29);
  assert.ok(worker.cacheName.endsWith(':v1.3.1'));
});

test('activation deletes only this scope releases and the exact legacy platform cache',async()=>{
  const worker=makeWorker();
  const rootWorker=makeWorker('https://example.test/');
  const retained=[worker.cacheName,rootWorker.cacheName,
    'rudn-governor-stage9','unrelated-site-v4','rudn-gmu-pages-v0.9.0','rudn-gmu-pages-v1.3.0-career-other'];
  const removed=[worker.cachePrefix+'v1.2.2','rudn-gmu-pages-v1.2.2','rudn-gmu-pages-v1.3.0-career'];
  for(const name of [...retained,...removed])await worker.cacheStorage.open(name);
  await worker.emit('activate');
  assert.equal(worker.claimed,true);
  assert.deepEqual((await worker.cacheStorage.keys()).sort(),retained.sort());
  assert.notEqual(worker.cachePrefix,rootWorker.cachePrefix);
});

test('the complete installed runtime is available offline before its first visit',async()=>{
  const worker=makeWorker();
  await worker.emit('install');
  worker.fetch=async()=>{throw new TypeError('Network unavailable')};
  for(const entry of worker.precache){
    const navigate=entry.endsWith('/')||entry.endsWith('.html');
    const response=await worker.request(entry,{mode:navigate?'navigate':'cors'});
    assert.equal(response?.status,200,`Offline response unavailable: ${entry}`);
  }
  const navigation=await worker.request('./'+modulePath+'index.html?from=seminar-7',{mode:'navigate'});
  assert.equal(navigation.status,200);
  assert.match(await navigation.text(),/<!doctype html>/i);
  const missing=await worker.request('./apps/missing/index.html',{mode:'navigate'});
  assert.equal(missing.type,'error','An uncached page must not receive unrelated HTML');
});

test('404 and 500 responses preserve and return the healthy cached resource',async()=>{
  const worker=makeWorker();
  const cache=await worker.cacheStorage.open(worker.cacheName);
  const existing='./'+modulePath+'src/engine.js';
  const careerModule='./apps/career/entry.mjs';
  await cache.put(existing,new Response('healthy engine'));
  await cache.put(careerModule,new Response('healthy career module'));
  for(const status of [404,500]){
    worker.fetch=async()=>new Response('bad deployment',{status});
    assert.equal(await (await worker.request(existing)).text(),'healthy engine');
    assert.equal(await (await cache.match(existing)).text(),'healthy engine');
    assert.equal(await (await worker.request(careerModule)).text(),'healthy career module');
    assert.equal(await (await cache.match(careerModule)).text(),'healthy career module');
    const missing='./'+modulePath+`missing-${status}.js`;
    assert.equal((await worker.request(missing)).status,status);
    assert.equal(await cache.match(missing),undefined);
    const missingImage='./'+modulePath+`assets/missing-${status}.webp`;
    assert.equal((await worker.request(missingImage)).status,status);
    assert.equal(await cache.match(missingImage),undefined);
  }
  worker.fetch=async()=>new Response('new healthy engine');
  assert.equal(await (await worker.request(existing)).text(),'new healthy engine');
  worker.fetch=async()=>new Response('new healthy career module');
  assert.equal(await (await worker.request(careerModule)).text(),'new healthy career module');
  worker.fetch=async()=>{throw new TypeError('Network unavailable')};
  assert.equal(await (await worker.request(existing)).text(),'new healthy engine');
  assert.equal(await (await worker.request(careerModule)).text(),'new healthy career module');
});

test('fallback never reads another application cache and ignores requests outside scope',async()=>{
  const worker=makeWorker();
  const foreignCache=await worker.cacheStorage.open('another-module-cache');
  const file='./'+modulePath+'src/engine.js';
  await foreignCache.put(file,new Response('another app copy'));
  worker.fetch=async()=>{throw new TypeError('Network unavailable')};
  assert.equal((await worker.request(file)).type,'error');
  const before=worker.networkCalls;
  assert.equal(await worker.request('https://other.test/platform-rudn/file.js'),undefined);
  assert.equal(await worker.request('https://example.test/another-app/file.js'),undefined);
  assert.equal(await worker.request('https://example.test/platform-rudn-extra/file.js'),undefined);
  assert.equal(await worker.request(file,{method:'POST'}),undefined);
  assert.equal(worker.networkCalls,before);
});

test('a cache write failure still returns the successful network response',async()=>{
  const worker=makeWorker();
  const cache=await worker.cacheStorage.open(worker.cacheName);
  cache.put=async()=>{throw new Error('Cache quota exceeded')};
  worker.fetch=async()=>new Response('successful network content');
  assert.equal(await (await worker.request('./'+modulePath+'src/engine.js')).text(),'successful network content');
});
