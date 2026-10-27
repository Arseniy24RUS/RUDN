import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {SEARCH_URL,FILTER,sourceDate,requestJSON,collectPages,organizationFromDetail,vacancyFromList,collectSnapshot,refresh,checkFiles,baselineFeed} from '../scripts/sync-career-vacancies.mjs';
import {currentStatus,selectVacancies,validateFeed} from '../site/apps/career/assets/vacancies-model.mjs';
// Synthetic records belong only to isolated tests, never to the production feed.
const guid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now='2026-10-27T12:00:00.000Z';
const institutions=[{id:'ministry',name:'Министерство примеров Российской Федерации'}];
const row=(n=1,organizationName=institutions[0].name)=>({id:guid(n),caption:'Специалист',organizationName,announcementDate:'2026-10-26T00:00:00',expireDate:'2026-11-26T00:00:00',salaryFrom:100,salaryTo:200,type:1,kind:1,regionName:'Тестовый регион'});
const detail=(r=row())=>({vacancy:{id:r.id,organizationName:r.organizationName,organizations:[{text:r.organizationName,value:guid(100)}],subTypeName:'ФОИВ - Федеральные органы исполнительной власти',parentOrganizationName:'Все ФОИВ',state:'Открыта'}});
const response=(body,status=200,contentType='application/json')=>new Response(JSON.stringify(body),{status,headers:{'content-type':contentType}});
const empty={schemaVersion:1,source:'https://gossluzhba.gov.ru',state:'not_connected',lastSuccessAt:null,organizations:[],vacancies:[]};
const paged=(rows,page=1,pageSize=100,total=rows.length)=>({vacancies:rows,total,page,pageSize,pageCount:Math.ceil(total/pageSize)});
const temporary=async t=>{const base=fileURLToPath(new URL('../.qa/career-vacancy-sync-tests/',import.meta.url));await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'run-'));t.after(()=>{if(!path.resolve(dir).startsWith(path.resolve(base)+path.sep))throw new Error('unsafe test cleanup');return fs.rm(dir,{recursive:true,force:true});});return dir;};
const goodFeed=()=>collectSnapshot({observedAt:now,institutions,request:async(url)=>url===SEARCH_URL?paged([row()]):detail()});

test('public search omits credentials, rejects redirects and allows only the observed read-only endpoints',async()=>{
  let options;await requestJSON(SEARCH_URL,{body:{page:1,...FILTER},fetchImpl:async(url,opts)=>{options=opts;return response({ok:true});}});
  assert.equal(options.method,'POST');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);
  await assert.rejects(requestJSON('https://gossluzhba.gov.ru/api/vacancy/data/favorite/add/'+guid(1)),/endpoint-not-allowed/);
  await assert.rejects(requestJSON(SEARCH_URL),/method-not-allowed/);
  await assert.rejects(requestJSON('https://foreign.invalid/api/vacancy/data/'+guid(1)),/endpoint-not-allowed/);
});
test('HTTP denial and HTML login pages cannot masquerade as JSON',async()=>{
  await assert.rejects(requestJSON(SEARCH_URL,{body:{},fetchImpl:async()=>response({},403)}),/http-403/);
  await assert.rejects(requestJSON(SEARCH_URL,{body:{},fetchImpl:async()=>response('<html>Login</html>',200,'text/html')}),/non-json-response/);
});
test('paginator fetches every page and preserves the count',async()=>{
  const calls=[];const result=await collectPages(async(url,{body})=>{calls.push(body);return paged(body.page===1?[row(1),row(2)]:[row(3)],body.page,2,3);},{pageSize:2});
  assert.equal(result.rows.length,3);assert.equal(calls.length,2);assert.deepEqual(calls[1],{page:2,sort:0,direction:1,pageSize:2,...FILTER});
});
test('duplicate records, changed totals, missing pages and oversized sources fail closed',async()=>{
  await assert.rejects(collectPages(async()=>paged([row(1),row(1)],1,2,2),{pageSize:2}),/duplicate-source/);
  await assert.rejects(collectPages(async(url,{body})=>body.page===1?paged([row(1),row(2)],1,2,3):paged([row(3),row(4)],2,2,4),{pageSize:2}),/source-changed/);
  await assert.rejects(collectPages(async()=>paged([row()],1,2,2),{pageSize:2}),/incomplete-page/);
  await assert.rejects(collectPages(async()=>paged([row()],1,1,51),{pageSize:1,maxPages:50}),/pagination-limit/);
});
test('source UUIDs and explicit hierarchy distinguish central and territorial employers',()=>{
  const central=organizationFromDetail(detail(),row(),institutions,now);assert.equal(central.id,guid(100));assert.equal(central.authorityId,'ministry');assert.equal(central.relation,'exact');
  const r=row(2,'Управление по тестовому региону'),d=detail(r);d.vacancy.organizations.unshift({text:institutions[0].name,value:guid(101)});d.vacancy.subTypeName='Территориальный орган';d.vacancy.parentOrganizationName=institutions[0].name;
  const territorial=organizationFromDetail(d,r,institutions,now);assert.equal(territorial.relation,'territorial');assert.equal(territorial.authorityId,'ministry');
  d.vacancy.subTypeName='Подведомственное учреждение';assert.equal(organizationFromDetail(d,r,institutions,now).authorityId,null);
});
test('a name substring never suffices and ambiguous source IDs are rejected',()=>{
  const r=row(2,'Учреждение: '+institutions[0].name),d=detail(r);assert.equal(organizationFromDetail(d,r,institutions,now).authorityId,null);
  d.vacancy.organizations.push({text:r.organizationName,value:guid(102)});assert.throws(()=>organizationFromDetail(d,r,institutions,now),/ambiguous-employer-id/);
});
test('calendar dates retain their meaning and invalid or timezone-ambiguous dates are rejected',()=>{
  assert.equal(sourceDate('2026-11-26T00:00:00'),'2026-11-26');assert.equal(sourceDate(null),null);
  assert.throws(()=>sourceDate('2026-02-31T00:00:00'),/invalid-source-date/);assert.throws(()=>sourceDate('2026-11-26T15:30:00'),/invalid-source-date/);
});
test('a representative status and education are never copied to another vacancy',()=>{
  const d=detail(),organization=organizationFromDetail(d,row(),institutions,now);d.vacancy.educationLevelName='Высшее образование';
  const first=vacancyFromList(row(),organization,now,d),second=vacancyFromList(row(2),organization,now,d);
  assert.equal(first.sourceStatus,'Открыта');assert.equal(second.sourceStatus,null);assert.equal(second.education,'');assert.equal(second.acceptFrom,null);
  assert.equal(first.sourceOrganizationReference,organization.id);assert.equal(second.sourceOrganizationReference,null);assert.equal(organization.idScope,'vacancy-organization-reference');
  assert.equal(currentStatus(second,Date.parse(now)),'verify');assert.equal(currentStatus({...first,deadline:null},Date.parse(now)),'verify');
});
test('all source records are retained while unmatched employers remain outside personal selections',async()=>{
  const feed=await collectSnapshot({observedAt:now,institutions,request:async(url)=>url===SEARCH_URL?paged([row(1),row(2)]):detail({...row(),id:url.split('/').at(-1)})});
  assert.equal(feed.sourceTotal,2);assert.equal(feed.vacancies.length,2);assert.equal(feed.organizations.length,1);assert.deepEqual(validateFeed(feed),[]);
  assert.equal(selectVacancies(feed,{authorityIds:['ministry'],now:Date.parse(now)}).length,2);assert.equal(selectVacancies(feed,{authorityIds:['unmatched'],now:Date.parse(now)}).length,0);
});
test('central vacancies use their own observed organization UUID even with identical employer names',async()=>{
  const feed=await collectSnapshot({observedAt:now,institutions,request:async(url)=>{if(url===SEARCH_URL)return paged([row(1),row(2)]);const id=url.split('/').at(-1),d=detail({...row(),id});if(id===guid(2))d.vacancy.organizations[0].value=guid(101);return d;}});
  assert.equal(feed.centralDetailsVerified,2);assert.equal(feed.organizations.length,2);assert.equal(feed.vacancies.find(v=>v.id===guid(2)).organizationId,guid(101));
  assert.equal(feed.sourceEmployerCount,1);assert.equal(feed.sourceReferenceCount,2);
  assert.ok(feed.vacancies.every(v=>v.organizationIdentityMethod==='individual-vacancy-detail'&&v.organizationEvidenceUrl===v.url));
});
test('failed refresh retains last-good data and success time, reporting unavailable',async t=>{
  const dir=await temporary(t),feedPath=path.join(dir,'feed.json'),statusPath=path.join(dir,'status.json'),good=await goodFeed();await fs.writeFile(feedPath,JSON.stringify(good));
  const result=await refresh({feedPath,statusPath,institutions,request:async()=>{throw new Error('vacancies/http-503');}});
  assert.equal(result.state,'unavailable');assert.deepEqual(JSON.parse(await fs.readFile(feedPath)),good);assert.equal((await checkFiles(feedPath,statusPath)).lastSuccessAt,now);
});
test('outage retains a newer published baseline instead of an old checked-in feed',async t=>{
  const dir=await temporary(t),feedPath=path.join(dir,'feed.json'),statusPath=path.join(dir,'status.json'),good=await goodFeed();await fs.writeFile(feedPath,JSON.stringify(empty));
  await refresh({feedPath,statusPath,institutions,baseline:good,request:async()=>{throw new Error('network timeout');}});
  assert.deepEqual(JSON.parse(await fs.readFile(feedPath)),good);assert.equal((await checkFiles(feedPath,statusPath)).state,'unavailable');
});
test('immutable baseline resource hashes are verified',async t=>{
  const dir=await temporary(t),logical='apps/career/data/vacancies/gossluzhba.json';await fs.mkdir(path.join(dir,'releases'),{recursive:true});const feed=await goodFeed(),raw=JSON.stringify(feed);
  await fs.writeFile(path.join(dir,'release.json'),JSON.stringify({current:{manifestURL:'/RUDN/releases/manifest.json'}}));await fs.writeFile(path.join(dir,'platform-baseline.json'),JSON.stringify({sitePath:'/RUDN/'}));
  await fs.writeFile(path.join(dir,'releases/feed.json'),raw);await fs.writeFile(path.join(dir,'releases/manifest.json'),JSON.stringify({resources:{[logical]:{url:'/RUDN/releases/feed.json',bytes:Buffer.byteLength(raw),sha256:crypto.createHash('sha256').update(raw).digest('hex')}}}));
  assert.deepEqual(await baselineFeed(dir),feed);await fs.appendFile(path.join(dir,'releases/feed.json'),' ');await assert.rejects(baselineFeed(dir),/baseline-integrity/);
});
