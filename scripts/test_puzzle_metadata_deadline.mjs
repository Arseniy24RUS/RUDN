import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {fetchPuzzleMetadata} from '../site/assets/js/puzzle-metadata-request.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
const url='https://example.test/metadata';
function tracked(){
  const controller=new AbortController(),signal=controller.signal,listeners=new Set(),timers=new Set(),delays=[];
  const add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
  signal.addEventListener=(type,fn,options)=>{if(type==='abort')listeners.add(fn);return add(type,fn,options)};
  signal.removeEventListener=(type,fn,options)=>{if(type==='abort')listeners.delete(fn);return remove(type,fn,options)};
  let clears=0;
  const setTimer=(fn,delay)=>{delays.push(delay);const id=setTimeout(()=>{timers.delete(id);fn()},delay);timers.add(id);return id};
  const clearTimer=id=>{clears++;timers.delete(id);clearTimeout(id)};
  return {controller,options:{signal,setTimer,clearTimer},delays,
    clean(){assert.equal(timers.size,0,'deadline timer released');assert.equal(listeners.size,0,'parent abort listener released')},
    get clears(){return clears}};
}

test('success returns the same metadata and cleans the default four-second deadline',async()=>{
  const state=tracked(),value={id:'synthetic-metadata'};let child,calls=0;
  const actual=await fetchPuzzleMetadata(url,{...state.options,fetchImpl:async(request,options)=>{
    calls++;assert.equal(request,url);child=options.signal;return{ok:true,json:async()=>value};
  }});
  assert.equal(actual,value);assert.equal(calls,1);assert.deepEqual(state.delays,[4000]);
  assert.equal(state.clears,1);state.clean();state.controller.abort();assert.equal(child.aborted,false);
});

for(const stage of ['fetch','json'])test(`${stage} ignoring native abort still rejects on the independent deadline`,{timeout:2000},async()=>{
  const state=tracked();let child,jsonStarted=false;
  await assert.rejects(fetchPuzzleMetadata(url,{...state.options,timeoutMs:15,fetchImpl:async(_,options)=>{
    child=options.signal;
    if(stage==='fetch')return new Promise(()=>{});
    return{ok:true,json:()=>{jsonStarted=true;return new Promise(()=>{})}};
  }}),{name:'TimeoutError'});
  assert.equal(child.aborted,true);assert.equal(jsonStarted,stage==='json');state.clean();assert.equal(state.clears,1);
});

test('an already-aborted parent creates no fetch, timer or listener',async()=>{
  const state=tracked();state.controller.abort();let calls=0;
  await assert.rejects(fetchPuzzleMetadata(url,{...state.options,fetchImpl:()=>{calls++}}),{name:'AbortError'});
  assert.equal(calls,0);assert.deepEqual(state.delays,[]);state.clean();
});

for(const stage of ['fetch','json'])test(`parent abort rejects immediately while ${stage} ignores abort`,{timeout:2000},async()=>{
  const state=tracked(),started=deferred();let child;
  const pending=fetchPuzzleMetadata(url,{...state.options,timeoutMs:10000,fetchImpl:async(_,options)=>{
    child=options.signal;
    if(stage==='fetch'){started.resolve();return new Promise(()=>{})}
    return{ok:true,json:()=>{started.resolve();return new Promise(()=>{})}};
  }});
  const rejected=assert.rejects(pending,{name:'AbortError'});await started.promise;state.controller.abort();await rejected;
  assert.equal(child.aborted,true);state.clean();
});

for(const [label,fetchImpl] of [
  ['synchronous fetch failure',()=>{throw new TypeError('Synthetic network failure')}],
  ['HTTP error',async()=>({ok:false,status:503,json:()=>assert.fail('Do not parse an HTTP error')})],
  ['JSON rejection',async()=>({ok:true,json:()=>Promise.reject(new SyntaxError('Synthetic invalid JSON'))})],
])test(`${label} rejects and releases resources`,async()=>{
  const state=tracked();await assert.rejects(fetchPuzzleMetadata(url,{...state.options,fetchImpl}));
  state.clean();assert.equal(state.clears,1);
});

test('timeout remains the winner when native abort synchronously rejects fetch',{timeout:2000},async()=>{
  const state=tracked();
  await assert.rejects(fetchPuzzleMetadata(url,{...state.options,timeoutMs:15,fetchImpl:(_,options)=>new Promise((_,reject)=>{
    options.signal.addEventListener('abort',()=>reject(new DOMException('Native cancellation','AbortError')),{once:true});
  })}),{name:'TimeoutError'});
  state.clean();await nextTurn();
});

for(const stage of ['fetch','json'])for(const outcome of ['resolve','reject'])
test(`late ${stage} ${outcome} cannot change the timeout or become unhandled`,{timeout:2000},async()=>{
  const state=tracked(),late=deferred(),unhandled=[];let bodyCalls=0;
  const observe=error=>unhandled.push(error);process.on('unhandledRejection',observe);
  try{
    const pending=fetchPuzzleMetadata(url,{...state.options,timeoutMs:15,fetchImpl:()=>stage==='fetch'?late.promise:
      Promise.resolve({ok:true,json:()=>{bodyCalls++;return late.promise}})});
    const winner=await pending.catch(error=>error);assert.equal(winner.name,'TimeoutError');
    if(outcome==='reject')late.reject(new Error('Synthetic late failure'));
    else late.resolve(stage==='fetch'?{ok:true,json:()=>{bodyCalls++;return{late:true}}}:{late:true});
    await nextTurn();await nextTurn();
    assert.equal(await pending.catch(error=>error),winner);assert.deepEqual(unhandled,[]);
    assert.equal(bodyCalls,stage==='json'?1:0,'A late response does not start new JSON work');state.clean();
  }finally{process.off('unhandledRejection',observe)}
});

// Exercise the actual remoteAdm1 function without importing browser/Firebase
// bootstrap side effects. The surrounding dependencies are explicit test seams.
const bootstrap=await readFile(new URL('../site/assets/js/puzzle-bootstrap.js',import.meta.url),'utf8');
const start=bootstrap.indexOf('async function remoteAdm1('),end=bootstrap.indexOf('\nconst puzzleFetch=',start);
assert.ok(start>=0&&end>start,'Actual remoteAdm1 source is available');
const remoteFactory=new Function('admCatalogSource','fetchPuzzleMetadata','nativeFetch','base','wrapper','diagnostics','DOMException',
  `${bootstrap.slice(start,end)};return remoteAdm1;`);
const pinned={boundaryISO:'YEM',boundaryName:'Synthetic country',boundaryCanonical:'ADM1',
  simplifiedGeometryGeoJSON:'https://example.test/pinned.geojson',boundarySource:'Synthetic source',
  boundaryLicense:'Synthetic licence',boundaryYearRepresented:'2026',admUnitCount:'3'};
function remoteHarness(fetchImpl,{catalog=[pinned],state=tracked(),metadataImpl,diagnostics}={}){
  const wrapped=[],events=[],calls=[];
  const remote=remoteFactory(catalog,metadataImpl||((request,options)=>fetchPuzzleMetadata(request,{...options,...state.options,timeoutMs:15})),
    (request,options)=>{calls.push(request);return fetchImpl(request,options)},'https://example.test/data',
    value=>{wrapped.push(value);return value},diagnostics||{record:(event,fields)=>events.push({event,fields})},DOMException);
  return{run:()=>remote('YEM',state.options.signal),state,wrapped,events,calls};
}

test('actual remoteAdm1 keeps its pinned metadata on deadline while parent is live',{timeout:2000},async()=>{
  const harness=remoteHarness(()=>new Promise(()=>{}));const before=JSON.stringify(pinned);
  const result=await harness.run();
  assert.equal(result.geometry_url,pinned.simplifiedGeometryGeoJSON);assert.equal(result.feature_count,3);
  assert.equal(result.id,'yem-adm1-geoboundaries');assert.equal(result.origin,'remote');assert.equal(JSON.stringify(pinned),before);
  assert.equal(harness.calls.length,1);assert.equal(harness.wrapped.length,1);harness.state.clean();
  assert.deepEqual(harness.events,[{event:'asset-load',fields:{operation:'map-metadata',stage:'fallback',docId:'YEM',success:false,code:'timeout'}}]);
});

test('actual remoteAdm1 retains network-failure fallback with safe diagnostics',async()=>{
  const harness=remoteHarness(()=>Promise.reject(new TypeError('Synthetic remote failure')));
  assert.equal((await harness.run()).geometry_url,pinned.simplifiedGeometryGeoJSON);
  assert.equal(harness.events[0].fields.code,'load-failed');assert.equal(harness.calls.length,1);harness.state.clean();
});

test('throwing optional diagnostics cannot prevent the actual remoteAdm1 pinned fallback',async()=>{
  let recorderCalls=0;
  const harness=remoteHarness(()=>Promise.reject(new TypeError('Synthetic remote failure')),{diagnostics:{record(){
    recorderCalls++;throw new Error('Synthetic diagnostic failure');
  }}});
  const result=await harness.run();
  assert.equal(result.geometry_url,pinned.simplifiedGeometryGeoJSON);assert.equal(result.id,'yem-adm1-geoboundaries');
  assert.equal(recorderCalls,1);assert.equal(harness.wrapped.length,1);assert.equal(harness.calls.length,1);harness.state.clean();
});

test('actual remoteAdm1 rejects parent abort without pinned fallback or wrapper',async()=>{
  const started=deferred();const harness=remoteHarness(()=>{started.resolve();return new Promise(()=>{})});
  const rejected=assert.rejects(harness.run(),{name:'AbortError'});await started.promise;harness.state.controller.abort();await rejected;
  assert.equal(harness.wrapped.length,0);assert.deepEqual(harness.events,[]);assert.equal(harness.calls.length,1);harness.state.clean();
});

test('parent cancellation also ends an uncached catalog body and never requests remote metadata',async()=>{
  const started=deferred();const harness=remoteHarness(()=>Promise.resolve({ok:true,json:()=>{started.resolve();return new Promise(()=>{})}}),{catalog:null});
  const rejected=assert.rejects(harness.run(),{name:'AbortError'});await started.promise;harness.state.controller.abort();await rejected;
  assert.deepEqual(harness.calls,['https://example.test/data/geoboundaries_adm1_catalog.json']);
  assert.equal(harness.wrapped.length,0);assert.deepEqual(harness.events,[]);harness.state.clean();
});

test('parent aborted after metadata settles cannot create a fallback or a successful wrapper',async()=>{
  const state=tracked();const harness=remoteHarness(()=>assert.fail('No direct fetch in this post-await control'),{state,
    metadataImpl:()=>{const result=Promise.resolve(pinned);queueMicrotask(()=>state.controller.abort());return result}});
  await assert.rejects(harness.run(),{name:'AbortError'});assert.equal(harness.wrapped.length,0);assert.deepEqual(harness.events,[]);state.clean();
});

test('missing pinned metadata propagates the deadline instead of inventing a fallback',{timeout:2000},async()=>{
  const harness=remoteHarness(()=>new Promise(()=>{}),{catalog:[]});
  await assert.rejects(harness.run(),{name:'TimeoutError'});assert.equal(harness.wrapped.length,0);assert.deepEqual(harness.events,[]);harness.state.clean();
});
