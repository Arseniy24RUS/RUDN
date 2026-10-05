import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {settlementsFallbackUrl,readSettlementsResource,loadSettlementsGame} from '../site/apps/settlements/runtime/assets/js/settlements/v2/network.mjs';
import {json} from '../site/apps/settlements/runtime/assets/js/settlements/v2/data.mjs';
const runtimeRoot=new URL('https://site.test/apps/settlements/runtime/'),gatewayRoot=new URL('https://gateway.test/settlements/runtime/');
const roots={runtimeRoot,gatewayRoot},url=new URL('data/settlements/v1/regions/a.json.gz',runtimeRoot);
test('only public runtime resources have a fallback; credentials and query are omitted',()=>{
 assert.equal(settlementsFallbackUrl(url,roots),gatewayRoot+'data/settlements/v1/regions/a.json.gz');
 assert.equal(settlementsFallbackUrl(url+'?auth=secret',roots),settlementsFallbackUrl(url,roots));
 for(const value of ['https://other.test/a.json','http://site.test/apps/settlements/runtime/data/settlements/a.json',new URL('../private.json',runtimeRoot),new URL('data/settlements/a.txt',runtimeRoot),new URL('data/settlements/a.json',gatewayRoot)])assert.equal(settlementsFallbackUrl(value,roots),null);
});
test('healthy primary never contacts the reserve',async()=>{
 let calls=0;
 assert.deepEqual(await readSettlementsResource(url,{...roots,fetchImpl:async(target,options)=>{calls++;assert.equal(String(target),String(url));assert.equal(options.credentials,'omit');return Response.json({ok:true});}}),{ok:true});
 assert.equal(calls,1);
});
for(const failure of ['blocked','http','invalid-json','hung-fetch','hung-body'])test(`automatic reserve recovers ${failure}`,async()=>{
 const calls=[];
 const result=await readSettlementsResource(url,{...roots,timeout:20,fetchImpl:async(target,options)=>{
  calls.push(String(target));
  if(calls.length>1)return Response.json({region:'a'});
  if(failure==='blocked')throw TypeError('Failed to fetch');
  if(failure==='http')return new Response('',{status:503});
  if(failure==='invalid-json')return new Response('<html>unavailable</html>');
  if(failure==='hung-fetch')return new Promise(()=>{});
  return {ok:true,json:()=>new Promise(()=>{})};
 }});
 assert.deepEqual(result,{region:'a'});assert.deepEqual(calls,[url.href,settlementsFallbackUrl(url,roots)]);
});
test('profile/route abort prevents reserve traffic, even if fetch ignores abort',async()=>{
 const controller=new AbortController(),calls=[];
 const task=readSettlementsResource(url,{...roots,signal:controller.signal,fetchImpl:async target=>{calls.push(target);return new Promise(()=>{});}});
 await Promise.resolve();controller.abort();await assert.rejects(task,{name:'AbortError'});assert.equal(calls.length,1);
 await assert.rejects(readSettlementsResource(url,{...roots,signal:controller.signal,fetchImpl:()=>{throw Error('must not fetch')}}),{name:'AbortError'});
});
test('game module failure recovers through a different origin and fresh retry keys',async()=>{
 const urls=[],moduleUrl=new URL('assets/js/settlements/v24/game.mjs',runtimeRoot);
 for(let n=0;n<2;n++)assert.deepEqual(await loadSettlementsGame({...roots,moduleUrl,importImpl:async target=>{urls.push(target);if(target===moduleUrl.href)throw TypeError('Module blocked');return {mountSettlementsGame:'fixture'};}}),{mountSettlementsGame:'fixture'});
 assert.ok(urls[1].startsWith(gatewayRoot.href));assert.notEqual(urls[1],urls[3]);
});
test('geography accepts gzip bytes and bodies already decoded by the browser',async()=>{
 const original=globalThis.fetch,payload={settlements:[{id:'a'}]};
 try{for(const bytes of [gzipSync(JSON.stringify(payload)),JSON.stringify(payload)]){globalThis.fetch=async()=>new Response(bytes);assert.deepEqual(await json(url),payload);}}
 finally{globalThis.fetch=original;}
});
