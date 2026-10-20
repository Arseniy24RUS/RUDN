import test from 'node:test';
import assert from 'node:assert/strict';
import {handle,upstreamFor,settlementsUpstreamFor} from './gateway.mjs';
import {firebaseGatewayUrl} from '../../site/assets/js/firebase-gateway.js';
import {createFirebaseRestTransport} from '../../site/assets/js/firebase-rest.js';
import {commitPuzzleLeaderboard} from '../../site/assets/js/puzzle-storage.js';
const origin='https://arseniy24rus.github.io';
const key='AIzaSyBH5MD8tpcV2DSFiE7K4FLzfUIYPNfHYHQ';
const url=path=>'https://gateway.test'+path;
test('static reserve is limited to public Settlements files on the platform host',()=>{
 const path='/settlements/runtime/data/settlements/v1/regions/a.json.gz';
 assert.equal(settlementsUpstreamFor(new URL(url(path)),'GET').href,'https://arseniy24rus.github.io/RUDN/apps/settlements/runtime/data/settlements/v1/regions/a.json.gz');
 for(const invalid of ['/settlements/runtime/../../private.json','/settlements/runtime/assets/js/backend.js','/settlements/runtime/data/settlements/%2fprivate.json','/settlements/runtime/data/settlements/a.txt'])assert.equal(settlementsUpstreamFor(new URL(url(invalid)),'GET'),null);
 assert.equal(settlementsUpstreamFor(new URL(url(path)),'POST'),null);
});
test('public static reserve never forwards credentials, queries or redirects',async()=>{
 const request=new Request(url('/settlements/runtime/assets/js/settlements/v24/game.mjs?auth=secret'),{headers:{Origin:origin,Authorization:'Bearer secret',Cookie:'secret'}});
 const response=await handle(request,{fetchImpl:async(target,options)=>{
  assert.equal(new URL(target).search,'');assert.equal(options.headers,undefined);assert.equal(options.redirect,'manual');
  return new Response('export const fixture=1;',{headers:{'Content-Type':'text/javascript','Set-Cookie':'secret'}});
 }});
 assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),origin);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('content-type'),'text/javascript');assert.equal(await response.text(),'export const fixture=1;');
 assert.equal((await handle(request,{fetchImpl:async()=>new Response(null,{status:302})})).status,502);
 assert.equal((await handle(new Request(request.url,{headers:{Origin:'https://other.test'}}))).status,403);
});
test('project routes reject arbitrary hosts, keys, buckets and database roots',()=>{
 for(const path of ['/https://evil.test','/firebase/auth/v1/accounts:signInWithPassword?key=other','/firebase/storage/v0/b/other/o','/firebase/database/private.json','/firebase/database/rudn-platform/v1/../outside.json'])assert.equal(upstreamFor(new URL(url(path)),'POST'),null);
 assert.equal(upstreamFor(new URL(url('/firebase/token/v1/token?key='+key)),'POST').host,'securetoken.googleapis.com');
});
test('login preserves credentials transiently, Firebase status and private headers',async()=>{
 const body=JSON.stringify({email:'fixture@example.invalid',password:'fixture-password',returnSecureToken:true});
 let called=false;
 const response=await handle(new Request(url('/firebase/auth/v1/accounts:signInWithPassword?key='+key),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'not-forwarded'},body}),{fetchImpl:async(target,options)=>{
  called=true;assert.equal(new URL(target).host,'identitytoolkit.googleapis.com');assert.equal(await new Response(options.body).text(),body);assert.equal(options.headers.get('cookie'),null);assert.equal(options.headers.get('origin'),origin);
  return new Response('{"error":{"message":"INVALID_LOGIN_CREDENTIALS"}}',{status:400,headers:{'Content-Type':'application/json','Set-Cookie':'secret','Cache-Control':'public'}});
 }});
 assert.ok(called);assert.equal(response.status,400);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);assert.match(await response.text(),/INVALID_LOGIN_CREDENTIALS/);
});
test('CORS rejects foreign origins and allows only project preflight routes',async()=>{
 const request=(path,host)=>new Request(url(path),{method:'OPTIONS',headers:{Origin:host,'Access-Control-Request-Method':'POST'}});
 assert.equal((await handle(request('/firebase/token/v1/token?key='+key,'https://evil.test'))).status,403);
 const allowed=await handle(request('/firebase/token/v1/token?key='+key,origin));
 assert.equal(allowed.status,204);assert.match(allowed.headers.get('access-control-allow-headers'),/x-firebase-storage-version/);
 assert.equal((await handle(request('/firebase/auth/v1/accounts:delete?key='+key,origin))).status,404);
});
test('storage streams data with original bearer; resumable upload stays on gateway',async()=>{
 const response=await handle(new Request(url('/firebase/storage/v0/b/rudn-gmu-learning-platform.firebasestorage.app/o?name=test'),{method:'POST',headers:{Origin:origin,Authorization:'Firebase fixture-id-token','X-Firebase-Storage-Version':'web/12'},body:'file bytes'}),{fetchImpl:async(target,options)=>{
  assert.equal(options.headers.get('authorization'),'Firebase fixture-id-token');assert.equal(options.headers.get('x-firebase-storage-version'),'web/12');assert.equal(options.duplex,'half');assert.equal(await new Response(options.body).text(),'file bytes');
  return new Response(null,{headers:{'x-goog-upload-url':'https://firebasestorage.googleapis.com/v0/b/rudn-gmu-learning-platform.firebasestorage.app/o?upload_id=fixture','x-goog-upload-status':'active'}});
 }});
 assert.match(response.headers.get('x-goog-upload-url'),/^https:\/\/gateway\.test\/firebase\/storage\//);
});
test('redirects and upstream errors cannot redirect credentials elsewhere',async()=>{
 const request=()=>new Request(url('/firebase/token/v1/token?key='+key),{method:'POST',body:'refresh_token=fixture'});
 assert.equal((await handle(request(),{fetchImpl:async()=>new Response(null,{status:307,headers:{Location:'https://evil.test'}})})).status,502);
 assert.equal((await handle(request(),{fetchImpl:async()=>{throw Error('private diagnostic')}})).status,502);
});

const database='https://rudn-gmu-learning-platform-default-rtdb.europe-west1.firebasedatabase.app';
const resultPath='/firebase/database/results';
test('public puzzle leaderboard GET reaches the configured database through the actual client URL mapper',async()=>{
 let calls=0;
 const request=new Request(firebaseGatewayUrl(database+'/results.json','https://gateway.test/'),{headers:{Origin:origin}});
 assert.equal(new URL(request.url).pathname,resultPath+'.json');
 const response=await handle(request,{fetchImpl:async(target,options)=>{
  calls++;assert.equal(target,database+'/results.json');assert.equal(options.method,'GET');
  assert.equal(options.headers.get('authorization'),null);assert.equal(options.redirect,'manual');
  return new Response('{"fixture":{"placed":89}}',{headers:{'Content-Type':'application/json','Set-Cookie':'not-forwarded'}});
 }});
 assert.equal(response.status,200);assert.equal(calls,1);
 assert.deepEqual(await response.json(),{fixture:{placed:89}});
 assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('puzzle result routes accept only the current collection and safe single-entry read/create contract',()=>{
 assert.equal(upstreamFor(new URL(url(resultPath+'.json')),'GET').href,database+'/results.json');
 for(const id of ['a','attempt_2026-10-20','A'.repeat(150)])for(const method of ['GET','PUT']){
  const path=`${resultPath}/${id}.json?auth=fixture-token`;
  assert.equal(upstreamFor(new URL(url(path)),method).href,`${database}/results/${id}.json?auth=fixture-token`);
 }
});
test('puzzle routes reject unrelated methods, paths and query parameters before any upstream request',async()=>{
 const cases=[];
 for(const method of ['POST','PUT','PATCH','DELETE','HEAD'])cases.push([resultPath+'.json',method]);
 for(const method of ['POST','PATCH','DELETE','HEAD'])cases.push([resultPath+'/attempt.json',method]);
 for(const suffix of ['/.json','//attempt.json','/nested/attempt.json','/attempt/field.json','/a.b.json','/a%2Fb.json','/a%252Fb.json','/%2e%2e/private.json','/a%20b.json','/a%00b.json','/'+('a'.repeat(151))+'.json','/attempt.JSON','/attempt.json/']){
  for(const method of ['GET','PUT'])cases.push([resultPath+suffix,method]);
 }
 for(const query of ['ns=other','shallow=true','orderBy=%22timestamp%22','callback=fixture','access_token=fixture','auth=a&auth=b','auth=','auth=fixture&ns=other']){
  for(const path of [resultPath+'.json',resultPath+'/attempt.json'])cases.push([path+'?'+query,'GET']);
  cases.push([resultPath+'/attempt.json?'+query,'PUT']);
 }
 for(const [path,method] of cases){
  assert.equal(upstreamFor(new URL(url(path)),method),null,method+' '+path);
  let calls=0;const response=await handle(new Request(url(path),{method,headers:{Origin:origin}}),{fetchImpl:async()=>{calls++;return new Response('unexpected')}});
  assert.equal(response.status,404,method+' '+path);assert.equal(calls,0);
  assert.equal((await response.json()).error.message,'ROUTE_NOT_ALLOWED');
 }
});
test('puzzle preflights permit GET and entry PUT only and retain origin isolation',async()=>{
 const preflight=(path,method,requestOrigin=origin)=>new Request(url(path),{method:'OPTIONS',headers:{Origin:requestOrigin,'Access-Control-Request-Method':method}});
 for(const [path,method] of [[resultPath+'.json','GET'],[resultPath+'/attempt.json?auth=fixture','GET'],[resultPath+'/attempt.json?auth=fixture','PUT']]){
  const response=await handle(preflight(path,method));assert.equal(response.status,204);
  assert.match(response.headers.get('access-control-allow-headers'),/if-match/);
  assert.match(response.headers.get('access-control-allow-headers'),/x-firebase-etag/);
 }
 for(const [path,method] of [[resultPath+'.json','PUT'],[resultPath+'/attempt.json','DELETE'],[resultPath+'/attempt.json?ns=other','PUT']]){
  assert.equal((await handle(preflight(path,method))).status,404);
 }
 let calls=0;
 for(const method of ['GET','PUT']){
  const request=new Request(url(resultPath+'/attempt.json'),{method,headers:{Origin:'https://other.test'}});
  assert.equal((await handle(request,{fetchImpl:async()=>{calls++;return new Response('unexpected')}})).status,403);
 }
 assert.equal(calls,0);assert.equal((await handle(preflight(resultPath+'/attempt.json','PUT','https://other.test'))).status,403);
});
test('real puzzle transaction keeps its ID, auth, ETag and immutable record through the gateway',async()=>{
 const id='attempt_fixture-2026',record={fio:'Synthetic fixture',group:'Synthetic group',difficulty:'easy',time_ms:2000,elapsed_ms:2000,placed:89,total:89,timestamp:1234,user_agent:'fixture'};
 let stored=null,etag='"empty"',writes=0;const methods=[];
 const transport=createFirebaseRestTransport({
  databaseURL:database,rootPath:'results',getUser:()=>user,getGeneration:()=>1,
  fetchImpl:async(input,init)=>handle(new Request(firebaseGatewayUrl(input,'https://gateway.test/'),init),{fetchImpl:async(target,options)=>{
   const upstream=new URL(target);assert.equal(upstream.origin,database);assert.equal(upstream.pathname,`/results/${id}.json`);
   assert.equal(upstream.searchParams.get('auth'),'fixture-token');assert.equal(options.headers.get('cookie'),null);
   methods.push(options.method);
   if(options.method==='GET'){
    assert.equal(options.headers.get('x-firebase-etag'),'true');
    return new Response(JSON.stringify(stored),{headers:{'Content-Type':'application/json',ETag:etag}});
   }
   assert.equal(options.method,'PUT');assert.equal(options.headers.get('if-match'),etag);
   assert.equal(options.headers.get('content-type'),'application/json');assert.equal(options.redirect,'manual');
   const value=JSON.parse(await new Response(options.body).text());assert.deepEqual(value,record);
   // Synthetic upstream models the first create; real RTDB rules remain independently tested.
   assert.equal(stored,null);stored=value;etag='"created"';writes++;
   return new Response(JSON.stringify(stored),{headers:{'Content-Type':'application/json',ETag:etag}});
  }})
 });
 const user={uid:'synthetic-owner',getIdToken:async()=> 'fixture-token'};
 assert.deepEqual(await commitPuzzleLeaderboard(transport,id,record),record);
 assert.deepEqual(await commitPuzzleLeaderboard(transport,id,record),record);
 await assert.rejects(commitPuzzleLeaderboard(transport,id,{...record,time_ms:3000}),{code:'database/leaderboard-conflict'});
 assert.deepEqual(methods,['GET','PUT','GET','GET']);assert.equal(writes,1);
});
test('puzzle gateway preserves database permission/conflict responses and cannot follow redirects',async()=>{
 for(const status of [401,403,412]){
  const response=await handle(new Request(url(resultPath+'/attempt.json?auth=fixture'),{method:'PUT',body:'{}'}),{fetchImpl:async()=>new Response('{"error":"fixture"}',{status,headers:{ETag:'"remote"'}})});
  assert.equal(response.status,status);assert.equal(response.headers.get('etag'),'"remote"');assert.equal(await response.text(),'{"error":"fixture"}');
 }
 const response=await handle(new Request(url(resultPath+'.json')),{fetchImpl:async()=>new Response(null,{status:302,headers:{Location:'https://other.test'}})});
 assert.equal(response.status,502);
});
test('existing v1 database routes preserve methods, queries, auth and conditional-write headers',async()=>{
 for(const method of ['GET','PUT','PATCH','DELETE']){
  let calls=0;const suffix='/rudn-platform/v1/checkpoints/fixture.json?auth=fixture&print=silent';
  const request=new Request(url('/firebase/database'+suffix),{method,headers:{Origin:origin,Authorization:'Bearer fixture','If-Match':'"v1-etag"','X-Firebase-ETag':'true','Content-Type':'application/json'},...(method==='GET'?{}:{body:'{"fixture":true}'})});
  const response=await handle(request,{fetchImpl:async(target,options)=>{
   calls++;assert.equal(target,database+suffix);assert.equal(options.method,method);
   assert.equal(options.headers.get('authorization'),'Bearer fixture');assert.equal(options.headers.get('if-match'),'"v1-etag"');assert.equal(options.headers.get('x-firebase-etag'),'true');
   if(method!=='GET')assert.equal(await new Response(options.body).text(),'{"fixture":true}');
   return new Response('null',{headers:{ETag:'"next"'}});
  }});
  assert.equal(response.status,200);assert.equal(response.headers.get('etag'),'"next"');assert.equal(calls,1);
 }
});
