import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

// Exercise the real worker functions with deliberately delayed CacheStorage.
// No network, auth, clock, release selection or student records are fabricated.
const worker=await readFile(new URL('../site/service-worker.js',import.meta.url),'utf8');
const begin=worker.indexOf('async function clientRelease(id)');
const end=worker.indexOf('async function activateRelease()',begin);
assert(begin>=0&&end>begin,'Worker binding functions remain covered');
const source=worker.slice(begin,end);
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
function harness(){
  const memory=new Map(),disk=new Map(),reads=[],puts=[];
  let matchHook=null,putHook=null;
  const cache={
    async match(key){
      const value=disk.get(key);reads.push(key);
      if(matchHook)return matchHook(key,value);
      return value===undefined?undefined:new Response(value);
    },
    async put(key,response){
      const value=await response.text();puts.push({key,value});
      if(putHook)await putHook(key,value);
      disk.set(key,value);
    }
  };
  const context=vm.createContext({clientBindings:memory,clientBindingWrites:new Map(),
    CLIENT_CACHE:'bindings',clientKey:id=>id,isReleaseCache:name=>name.startsWith('release:'),Response,
    caches:{async open(name){assert.equal(name,'bindings');return cache}}});
  vm.runInContext(source+'\nthis.api={clientRelease,bindClient};',context);
  return {...context.api,memory,disk,reads,puts,setMatch(fn){matchHook=fn},setPut(fn){putHook=fn},
    get pendingWrites(){return context.clientBindingWrites.size}};
}

test('a delayed historical response cannot overwrite a binding acknowledged in the meantime',async()=>{
  const h=harness(),text=deferred();h.disk.set('tab','release:unavailable');
  h.setMatch((_key,value)=>({text:()=>text.promise.then(()=>value)}));
  const read=h.clientRelease('tab');await turn();
  await h.bindClient('tab','release:current');text.resolve();
  assert.equal(await read,'release:current');
  assert.equal(h.memory.get('tab'),'release:current');assert.equal(h.disk.get('tab'),'release:current');
});

test('an empty historical lookup cannot hide a newly bound client',async()=>{
  const h=harness(),match=deferred();h.setMatch(()=>match.promise);
  const read=h.clientRelease('tab');await turn();
  await h.bindClient('tab','release:current');match.resolve(undefined);
  assert.equal(await read,'release:current');
});

test('a failed historical lookup cannot hide a newly bound client',async()=>{
  const h=harness(),match=deferred();h.setMatch(()=>match.promise);
  const read=h.clientRelease('tab');await turn();
  await h.bindClient('tab','release:current');match.reject(new Error('synthetic cache failure'));
  assert.equal(await read,'release:current');
});

test('persisted writes for one client retain invocation order despite delayed native completion',async()=>{
  const h=harness(),first=deferred();h.setPut((_key,value)=>value==='release:old'?first.promise:undefined);
  const old=h.bindClient('tab','release:old');await turn();
  const current=h.bindClient('tab','release:current');await turn();
  const before=h.puts.map(item=>item.value);first.resolve();await Promise.all([old,current]);
  assert.deepEqual(before,['release:old'],'A later write waits for its predecessor');
  assert.equal(h.disk.get('tab'),'release:current');assert.equal(h.memory.get('tab'),'release:current');
  assert.equal(h.pendingWrites,0,'Completed queues release client references');
});

test('a rejected persistence operation neither rejects binding nor prevents the next write',async()=>{
  const h=harness();let attempts=0;h.setPut(()=>{if(++attempts===1)throw new Error('synthetic quota failure')});
  await h.bindClient('tab','release:old');await h.bindClient('tab','release:current');
  assert.equal(h.disk.get('tab'),'release:current');assert.equal(await h.clientRelease('tab'),'release:current');
  assert.equal(h.pendingWrites,0);
});

test('independent clients do not block one another',async()=>{
  const h=harness(),first=deferred();h.setPut(key=>key==='first'?first.promise:undefined);
  const blocked=h.bindClient('first','release:old');await turn();
  await h.bindClient('second','release:current');assert.equal(h.disk.get('second'),'release:current');
  first.resolve();await blocked;assert.equal(h.pendingWrites,0);
});

test('valid historical bindings are cached; missing or invalid entries stay unbound',async()=>{
  const h=harness();h.disk.set('old','release:old');h.disk.set('invalid','foreign');
  assert.equal(await h.clientRelease('old'),'release:old');assert.equal(await h.clientRelease('old'),'release:old');
  assert.equal(h.reads.filter(key=>key==='old').length,1);
  assert.equal(await h.clientRelease('invalid'),null);assert.equal(await h.clientRelease('missing'),null);
  assert.equal(await h.clientRelease(''),null);await h.bindClient('','release:current');
  assert.equal(h.memory.has(''),false);assert.equal(h.disk.has(''),false);
});
