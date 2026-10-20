import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

// Run the actual classic entry. Only the dynamic-import transport is replaced;
// event ordering, recovery flags, script loading and retries stay in the source.
const html=await readFile(new URL('../site/apps/puzzle.html',import.meta.url),'utf8');
const entries=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(source=>source.includes("type:'BIND_RELEASE'"));
assert.equal(entries.length,1,'Exactly one standalone release entry is tested');
assert.equal((entries[0].match(/\bimport\(/g)||[]).length,1,'The controlled seam covers the only dynamic import');
const entry=entries[0].replace(/\bimport\(/,'__import(');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
function eventTarget(){
  const listeners=new Map();
  return{addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(listener)},
    emit(type,event={}){for(const listener of listeners.get(type)||[])listener(event)}};
}
function harness({serviceWorker=true,controlled=true,autoScripts=true}={}){
  const window=eventTarget(),workers=eventTarget(),registration=deferred();
  const imports=[],scripts=[],announcements=[],statusNodes=[],timers=[];
  let activeImports=0,maxActiveImports=0,updates=0;
  const makeController=()=>({postMessage(message){announcements.push({...message})}});
  workers.controller=controlled?makeController():null;
  workers.register=(url,options)=>{assert.equal(url,'../service-worker.js');assert.equal(options.updateViaCache,'none');return registration.promise};
  const document={documentElement:{dataset:{locale:'en'}},
    querySelector(selector){assert.equal(selector,'main');return{before(node){statusNodes.push(node)}}},
    createElement(tag){return{tag,textContent:'',removed:false,setAttribute(){},remove(){this.removed=true}}},
    body:{append(script){scripts.push(script);if(autoScripts)queueMicrotask(()=>script.onload())}}};
  const context=vm.createContext({window,document,navigator:serviceWorker?{serviceWorker:workers}:{},
    __import(url){const pending=deferred();activeImports++;maxActiveImports=Math.max(maxActiveImports,activeImports);
      imports.push({url,...pending});return pending.promise.then(value=>{activeImports--;return value},error=>{activeImports--;throw error})},
    setTimeout(){timers.push('timeout');throw new Error('The entry must not poll')},
    setInterval(){timers.push('interval');throw new Error('The entry must not poll')}});
  vm.runInContext(entry,context,{filename:'actual-puzzle-entry.js',timeout:1000});
  const bound=(source=workers.controller,release='1.3.10',type='RELEASE_BOUND')=>workers.emit('message',{source,data:{type,release}});
  return{window,workers,imports,scripts,announcements,statusNodes,timers,bound,makeController,
    register(){registration.resolve({update(){updates++;return Promise.resolve()}})},
    get updates(){return updates},get activeImports(){return activeImports},get maxActiveImports(){return maxActiveImports},
    async finishImport(index=imports.length-1){imports[index].resolve({});await turn()},
    async failImport(index=imports.length-1){imports[index].reject(new TypeError('Synthetic transport failure'));await turn()}};
}

test('a matching binding received during a failed import is retried once, without overlapping imports',async()=>{
  const h=harness();h.bound();assert.equal(h.imports.length,1);
  for(let i=0;i<12;i++)h.bound();
  assert.equal(h.imports.length,1,'Pending binding notifications do not start concurrent work');
  await h.failImport(0);
  assert.equal(h.imports.length,2,'The pending matching binding must survive the rejected import');
  assert.equal(h.imports[0].url,'../assets/js/puzzle-bootstrap.js?v=1.3.10');
  assert.equal(h.imports[1].url,'../assets/js/puzzle-bootstrap.js?v=1.3.10&loaderRetry=2');
  assert.equal(h.maxActiveImports,1);await h.finishImport(1);
  assert.equal(h.scripts.length,2);assert.equal(h.statusNodes[0].removed,true);
  h.bound();h.window.emit('online');await turn();assert.equal(h.imports.length,2);assert.deepEqual(h.timers,[]);
});

test('a new controller binding during the old import survives failure, while old-controller messages are ignored',async()=>{
  const h=harness(),old=h.workers.controller;h.bound();
  h.workers.controller=h.makeController();h.workers.emit('controllerchange');
  assert.equal(h.announcements.at(-1).type,'BIND_RELEASE');h.bound();
  await h.failImport(0);assert.equal(h.imports.length,2);h.bound(old);
  await h.failImport(1);assert.equal(h.imports.length,2,'A stale worker cannot queue another retry');
  h.bound();assert.equal(h.imports.length,3);await h.finishImport(2);assert.equal(h.maxActiveImports,1);
});

test('successful startup consumes coalesced notifications without repeating imports or classic scripts',async()=>{
  const h=harness();h.bound();for(let i=0;i<8;i++)h.bound();
  h.register();await turn();assert.equal(h.imports.length,1);await h.finishImport();
  for(let i=0;i<8;i++)h.bound();h.workers.emit('controllerchange');h.window.emit('online');await turn();
  assert.equal(h.imports.length,1);assert.equal(h.scripts.length,2);assert.equal(h.updates,1);
  assert.equal(h.statusNodes[0].removed,true);assert.equal(h.maxActiveImports,1);assert.deepEqual(h.timers,[]);
});

test('failure without a new wake stays dormant; online only announces until the current worker acknowledges',async()=>{
  const h=harness();h.register();await turn();h.bound();await h.failImport();
  h.window.emit('offline');await turn();await turn();assert.equal(h.imports.length,1);
  assert.match(h.statusNodes[0].textContent,/connection returns/);assert.equal(h.statusNodes[0].removed,false);
  h.window.emit('online');await turn();assert.equal(h.updates,1);assert.equal(h.imports.length,1);
  h.bound();assert.equal(h.imports.length,2);await h.failImport();await turn();
  assert.equal(h.imports.length,2,'An unsuccessful retry does not create a polling loop');assert.deepEqual(h.timers,[]);
});

test('wrong worker, release or message type neither starts nor queues recovery',async()=>{
  const h=harness(),foreign=h.makeController();
  const invalid=()=>{h.bound(foreign);h.bound(h.workers.controller,'1.3.5');h.bound(h.workers.controller,'1.3.10','OTHER')};
  invalid();assert.equal(h.imports.length,0);h.bound();invalid();await h.failImport();
  assert.equal(h.imports.length,1);invalid();await turn();assert.equal(h.imports.length,1);
});

test('a binding during classic-script failure retries only the failed script, without reimporting the ready bootstrap',async()=>{
  const h=harness({autoScripts:false});h.bound();await h.finishImport();
  assert.equal(h.scripts.length,1);h.scripts[0].onload();await turn();assert.equal(h.scripts.length,2);
  for(let i=0;i<5;i++)h.bound();h.scripts[1].onerror(new Error('Synthetic script failure'));await turn();
  assert.equal(h.imports.length,1);assert.equal(h.scripts.length,3,'A pending wake retries the failed engine script');
  assert.equal(h.scripts[1].removed,true);assert.equal(h.scripts[2].src,h.scripts[1].src);
  assert.match(h.scripts[0].src,/puzzle-render-geometry/);h.scripts[2].onload();await turn();
  assert.equal(h.statusNodes[0].removed,true);assert.equal(h.scripts.length,3);
});

test('without service-worker support direct startup works and a failed import waits for online',async()=>{
  const h=harness({serviceWorker:false});assert.equal(h.imports.length,1);await h.failImport();await turn();
  assert.equal(h.imports.length,1);h.window.emit('online');assert.equal(h.imports.length,2);await h.finishImport();
  assert.equal(h.statusNodes[0].removed,true);assert.deepEqual(h.timers,[]);
});

test('a first controller acknowledged while direct startup is pending supplies one recovery wake',async()=>{
  const h=harness({controlled:false});assert.equal(h.imports.length,1);
  h.workers.controller=h.makeController();h.workers.emit('controllerchange');h.bound();
  await h.failImport(0);assert.equal(h.imports.length,2);await h.finishImport(1);
  assert.equal(h.statusNodes[0].removed,true);assert.equal(h.maxActiveImports,1);
});
