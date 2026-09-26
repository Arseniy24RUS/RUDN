// Optional map caches must not block an already downloaded, exact map.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPuzzleGeometryStore} from '../site/assets/js/puzzle-storage.js';

const never=()=>new Promise(()=>{});
const wrapper={dataset:{id:'exact-small-region'},geometry:{type:'FeatureCollection',features:[{type:'Feature',id:'small',properties:{name:'Small region'},geometry:{type:'Polygon',coordinates:[[[1.123456789,2],[1.123456790,2],[1.123456790,2.000000001],[1.123456789,2]]]}}]}};
const options={operationTimeoutMs:20};
function memoryCache(){
  const records=new Map();
  return {records,open:async()=>({put:async(key,response)=>records.set(key,await response.text()),match:async key=>records.has(key)?new Response(records.get(key)):null})};
}
function hangingTransactions(){
  let aborts=0;
  const connection={close(){},transaction(){
    const tx={objectStore:()=>({put:()=>({}),get:()=>({})}),abort(){aborts++;tx.onabort?.()}};
    return tx;
  }};
  return {get aborts(){return aborts},open(){const request={result:connection};queueMicrotask(()=>request.onsuccess());return request}};
}

test('pending IndexedDB open falls back to exact CacheStorage; a late connection closes',{timeout:1500},async()=>{
  let request,closed=0;
  const caches=memoryCache();
  const store=createPuzzleGeometryStore({...options,indexedDB:{open(){return request={}}},caches});
  const ref=await store.save(wrapper);
  assert.deepEqual(await store.load(ref),wrapper);
  assert.equal(caches.records.size,1);
  request.result={close(){closed++}};request.onsuccess();
  assert.equal(closed,1);
  const reopened=createPuzzleGeometryStore({...options,indexedDB:null,caches});
  assert.deepEqual(await reopened.load(ref),wrapper);
  await store.close();await reopened.close();
});

test('pending IndexedDB write and read transactions abort, then recover exact cache bytes',{timeout:1500},async()=>{
  const indexedDB=hangingTransactions(),caches=memoryCache();
  const store=createPuzzleGeometryStore({...options,indexedDB,caches});
  const ref=await store.save(wrapper);
  assert.equal(indexedDB.aborts,1);
  assert.deepEqual(await store.load(ref),wrapper);
  await store.close();
  const reopened=createPuzzleGeometryStore({...options,indexedDB,caches});
  assert.deepEqual(await reopened.load(ref),wrapper);
  assert.equal(indexedDB.aborts,2);
  await reopened.close();
});

for(const phase of ['open','put'])test(`pending CacheStorage ${phase} retains playable exact memory`,{timeout:1500},async()=>{
  let warnings=0;
  const caches={open:phase==='open'?never:async()=>({put:never})};
  const store=createPuzzleGeometryStore({...options,indexedDB:null,caches,onWarning:()=>warnings++});
  const ref=await store.save(wrapper);
  assert.deepEqual(await store.load(ref),wrapper);
  assert.equal(warnings,1);
  await store.close();
});

for(const phase of ['open','match','body'])test(`pending CacheStorage ${phase} on restore permits source recovery`,{timeout:1500},async()=>{
  const caches={open:phase==='open'?never:async()=>({match:phase==='match'?never:async()=>({text:never})})};
  const store=createPuzzleGeometryStore({...options,indexedDB:null,caches});
  assert.equal(await store.load('saved-reference'),null);
  await store.close();
});

test('both pending backends retain exact memory and warn instead of leaving save pending',{timeout:1500},async()=>{
  let warnings=0;
  const store=createPuzzleGeometryStore({...options,indexedDB:{open:()=>({})},caches:{open:never},onWarning:()=>warnings++});
  const ref=await store.save(wrapper);
  assert.deepEqual(await store.load(ref),wrapper);
  assert.equal(warnings,1);
  await store.close();
});

test('closing while IndexedDB opens returns promptly and closes the late connection',{timeout:1500},async()=>{
  let request,closed=0;
  const store=createPuzzleGeometryStore({...options,indexedDB:{open(){return request={}}},caches:null});
  const loading=store.load('saved-reference');
  await store.close();
  request.result={close(){closed++}};request.onsuccess();
  assert.equal(await loading,null);
  assert.equal(closed,1);
});
