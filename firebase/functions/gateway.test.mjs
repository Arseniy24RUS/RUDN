import test from 'node:test';
import assert from 'node:assert/strict';
import {handle,upstreamFor} from './gateway.mjs';
const origin='https://arseniy24rus.github.io';
const key='AIzaSyBH5MD8tpcV2DSFiE7K4FLzfUIYPNfHYHQ';
const url=path=>'https://gateway.test'+path;
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
