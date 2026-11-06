import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createEmployerVacancyBank,BANK_COLUMNS,decodeGzip,vacancyBankStatus} from '../site/apps/career/assets/employer-vacancies-bank.mjs';
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const row=(n,archive=false)=>[id(n),`Должность ${n}`,'individual-role','г. Москва','Центральный',10000,20000,'2026-11-06','2026-12-30','Открыта',archive,`https://gossluzhba.gov.ru/vacancy/${id(n)}`,'Высшее образование','Без требований к стажу','Без требований к стажу'];
function pack(authority='minfin',employer=authority){const groups=[[row(1),row(2,true)],[row(3,true)]];const objects=new Map();const pages=groups.map((rows,i)=>{const raw=Buffer.from(JSON.stringify({schemaVersion:2,employerId:employer,columns:BANK_COLUMNS,rows})),gz=gzipSync(raw),path=`pages/${employer}/p${i}.json.gz`;objects.set('data/vacancies/bank/'+path,gz);return{path,count:rows.length,bytes:gz.length,sha256:hash(gz),uncompressedBytes:raw.length,uncompressedSHA256:hash(raw)};});const descriptor={schemaVersion:2,authorityId:authority,employerId:employer,jobCount:3,nonArchiveCount:1,archiveCount:2,pages};objects.set('data/vacancies/bank/employers/'+authority+'.json.gz',gzipSync(Buffer.from(JSON.stringify(descriptor))));return{objects,descriptor};}
const response=value=>value instanceof Uint8Array?{ok:true,arrayBuffer:async()=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)}:{ok:true,json:async()=>value};
const fetchFrom=(objects,urls)=>async url=>{urls.push(url);assert(objects.has(url),`unexpected fetch ${url}`);return response(objects.get(url));};
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
test('employer opening loads descriptor plus one gzip page; pagination caches all archive rows',async()=>{
 const {objects}=pack(),urls=[],bank=createEmployerVacancyBank({fetchImpl:fetchFrom(objects,urls)});assert.equal(bank.get('minfin').status,'idle');assert.equal(urls.length,0);
 await bank.ensure('minfin');assert.equal(urls.length,2);assert.equal(bank.get('minfin').rows.length,2);assert.equal(bank.get('minfin').rows[1].archive,true);assert.equal(bank.get('minfin').descriptor.jobCount,3);
 await bank.loadPage('minfin',1);assert.equal(urls.length,3);assert.equal(bank.get('minfin').rows[0].id,id(3));await bank.loadPage('minfin',0);assert.equal(urls.length,3);assert(urls.every(url=>!url.includes('summary')&&!url.endsWith('index.json')));bank.dispose();
});
test('gzip native and local fallback decode identical bytes',async t=>{
 const raw=Buffer.from(JSON.stringify({hello:'Образование'})),gz=gzipSync(raw);assert.deepEqual(Buffer.from(await decodeGzip(gz,{expectedBytes:raw.length})),raw);
 t.mock.property(globalThis,'DecompressionStream',undefined);assert.deepEqual(Buffer.from(await decodeGzip(gz,{expectedBytes:raw.length})),raw);
 await assert.rejects(decodeGzip(gz,{expectedBytes:raw.length+1}));
});
test('two explicit alias descriptors share one canonical employer page request',async()=>{
 const a=pack('legacy-a','canonical'),b=pack('legacy-b','canonical'),objects=new Map([...a.objects,...b.objects]),urls=[];const bank=createEmployerVacancyBank({fetchImpl:fetchFrom(objects,urls)});
 await Promise.all([bank.ensure('legacy-a'),bank.ensure('legacy-b')]);assert.equal(urls.filter(url=>url.includes('/pages/')).length,1);assert.equal(bank.get('legacy-b').rows.length,2);bank.dispose();
});
test('abort then reopen cannot mistake a descriptor-only entry for a loaded page',async()=>{
 const {objects}=pack(),urls=[];let release,hitPage,blocked=true;const entered=new Promise(resolve=>hitPage=resolve),gate=new Promise(resolve=>release=resolve);const bank=createEmployerVacancyBank({fetchImpl:async(url,options)=>{urls.push(url);if(url.includes('/pages/')&&blocked){hitPage();await gate;}return response(objects.get(url));}});
 const first=bank.ensure('minfin');await entered;assert.equal(urls.length,2);bank.cancel('minfin');blocked=false;release();await first;await bank.ensure('minfin');assert.equal(bank.get('minfin').rows.length,2);assert.equal(bank.get('minfin').error,null);bank.dispose();
});
test('failed page keeps a retryable state, rejects corruption, and never caches it',async()=>{
 const {objects}=pack(),urls=[];let bad=true;const bank=createEmployerVacancyBank({fetchImpl:async url=>{urls.push(url);const value=objects.get(url);return response(url.includes('/pages/')&&bad?new Uint8Array([31,139,8]):value);}});
 await bank.ensure('minfin');assert.equal(bank.get('minfin').status,'error');assert.equal(bank.cacheInfo().pages,0);bad=false;await bank.retry('minfin');assert.equal(bank.get('minfin').rows.length,2);assert.equal(urls.filter(url=>url.includes('/employers/')).length,1);bank.dispose();
});
test('employer and decoded-page caches stay bounded across distinct employers',async()=>{
 const objects=new Map();for(const name of ['municipal-a','federal-b','regional-c'])for(const [key,value]of pack(name).objects)objects.set(key,value);const urls=[],bank=createEmployerVacancyBank({fetchImpl:fetchFrom(objects,urls),maxEmployers:2,maxPages:2});
 for(const name of ['municipal-a','federal-b','regional-c'])await bank.ensure(name);assert.equal(bank.cacheInfo().employers,2);assert.equal(bank.cacheInfo().pages,2);bank.dispose();
});
test('published non-archive flags never override closed state or an expired calendar deadline',()=>{
 const now=new Date('2026-11-07T12:00:00Z');assert.equal(vacancyBankStatus({archive:false,state:'Закрыта',expiresAt:'2027-01-01'},now),'archived');assert.equal(vacancyBankStatus({archive:false,state:'Открыта',expiresAt:'2026-11-06'},now),'expired');assert.equal(vacancyBankStatus({archive:false,expiresAt:'2026-11-07'},now),'source-active');assert.equal(vacancyBankStatus({archive:true,expiresAt:'2027-01-01'},now),'archived');assert.equal(vacancyBankStatus({archive:null},now),'unknown');
});

test('actual 183/207-character catalog identifiers load their gzip descriptors; invalid IDs stay local errors',async()=>{
 const ids=['ru-09-upravlenie-karachaevo-cherkesskoy-respubliki-po-obespecheniyu-meropriyatiy-grazhdanskoy-oborony-preduprezhdeniya-i-likvidatsii-chrezvychaynykh-situatsiy-i-pozharnoy-bezopasnosti','ru-16-gosudarstvennaya-inspektsiya-respubliki-tatarstan-po-obespecheniyu-gosudarstvennogo-kontrolya-za-proizvodstvom-oborotom-i-kachestvom-etilovogo-spirta-alkogolnoy-produktsii-i-zashchite-prav-potrebiteley'];
 const objects=new Map();for(const id of ids)for(const [key,value]of pack(id).objects)objects.set(key,value);const urls=[],bank=createEmployerVacancyBank({fetchImpl:fetchFrom(objects,urls)});
 for(const id of ids){await bank.ensure(id);assert.equal(bank.get(id).status,'ready');assert.equal(bank.get(id).rows.length,2);}const before=urls.length;assert.equal(bank.get('../invalid').status,'error');await bank.ensure('../invalid');await bank.retry('../invalid');bank.cancel('../invalid');assert.equal(urls.length,before);bank.dispose();
});
