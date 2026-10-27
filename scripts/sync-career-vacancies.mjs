/** Read-only public portal ingestion. No login, subscriptions, applications or live backend. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PORTAL, plain, normalizeName, matchOrganizations, validateFeed, isoDate, vacancyUrl} from '../site/apps/career/assets/vacancies-model.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const SEARCH_URL=PORTAL+'/api/vacancy/data/get-vacancies';
export const FILTER=Object.freeze({showFederal:true,isElectronicResponseEnabled:false,applicationHasExpired:false,isTargetedTraining:false});
const GUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=code=>{throw new Error('vacancies/'+code);};
const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const detailURL=id=>PORTAL+'/api/vacancy/data/'+id;
export function sourceDate(value){
  if(value==null||value==='')return null;
  // The portal prints these midnight values as calendar dates, without a timezone.
  const date=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?$/.test(value)?value.slice(0,10):isoDate(value);
  if(!date||!isoDate(date))fail('invalid-source-date');
  return date;
}
export async function requestJSON(url,{body,fetchImpl=fetch,timeoutMs=25000,onObservation=()=>{}}={}){
  const u=new URL(url);
  if(u.origin!==PORTAL||!(u.pathname==='/api/vacancy/data/get-vacancies'||/^\/api\/vacancy\/data\/[a-f0-9-]{36}$/.test(u.pathname)))fail('endpoint-not-allowed');
  if((u.pathname.endsWith('/get-vacancies'))!==(body!==undefined))fail('method-not-allowed');
  const response=await fetchImpl(url,{method:body===undefined?'GET':'POST',redirect:'error',credentials:'omit',headers:body===undefined?{Accept:'application/json'}:{Accept:'application/json','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok)fail('http-'+response.status);
  if(!/application\/(?:[\w.+-]*\+)?json\b/i.test(response.headers.get('content-type')||''))fail('non-json-response');
  const text=await response.text();if(Buffer.byteLength(text)>5_000_000)fail('response-too-large');
  let data;try{data=JSON.parse(text);}catch{fail('invalid-json');}
  await onObservation({url,method:body===undefined?'GET':'POST',...(body===undefined?{}:{body}),status:response.status,bytes:Buffer.byteLength(text),sha256:sha(text),observedAt:new Date().toISOString()},data);
  return data;
}
export async function collectPages(request,{pageSize=100,maxPages=50}={}){
  const rows=[],ids=new Set();let total=null,pageCount=null;
  for(let page=1;page<=maxPages;page++){
    const data=await request(SEARCH_URL,{body:{page,sort:0,direction:1,pageSize,...FILTER}});
    if(!Array.isArray(data?.vacancies)||!Number.isSafeInteger(data.total)||data.total<0||data.page!==page||data.pageSize!==pageSize||!Number.isSafeInteger(data.pageCount)||data.pageCount<0)fail('search-contract');
    const expectedPages=Math.max(1,Math.ceil(data.total/pageSize));
    if(data.pageCount!==Math.ceil(data.total/pageSize)||expectedPages>maxPages)fail('pagination-limit-or-contract');
    if(total===null){total=data.total;pageCount=expectedPages;}
    if(data.total!==total||expectedPages!==pageCount)fail('source-changed-during-pagination');
    const expectedLength=Math.min(pageSize,Math.max(0,total-(page-1)*pageSize));
    if(data.vacancies.length!==expectedLength)fail('incomplete-page');
    for(const row of data.vacancies){
      if(!GUID.test(row?.id||'')||ids.has(row.id.toLowerCase())||!plain(row.caption)||!plain(row.organizationName))fail('invalid-or-duplicate-source-vacancy');
      ids.add(row.id.toLowerCase());rows.push(row);
    }
    if(page===pageCount){if(rows.length!==total)fail('incomplete-snapshot');return {rows,total,pageCount,pageSize};}
  }
  fail('pagination-limit');
}
export function organizationFromDetail(detail,row,institutions,observedAt){
  if(!detail?.vacancy||detail.vacancy.id?.toLowerCase()!==row.id.toLowerCase())fail('detail-contract');
  const v=detail.vacancy;
  if(normalizeName(v.organizationName)!==normalizeName(row.organizationName)||!Array.isArray(v.organizations))fail('detail-employer-mismatch');
  const chain=v.organizations.map(o=>({id:String(o.value||'').toLowerCase(),name:plain(o.text,1000)}));
  if(chain.some(o=>!GUID.test(o.id)||!o.name))fail('organization-contract');
  const candidates=chain.filter(o=>normalizeName(o.name)===normalizeName(row.organizationName));
  if(candidates.length!==1)fail('ambiguous-employer-id');
  const employer=candidates[0],url=vacancyUrl(row.id);
  let mapped=matchOrganizations([employer],institutions)[0];
  const subtype=plain(v.subTypeName),parent=plain(v.parentOrganizationName,1000);
  if(!mapped.authorityId&&subtype==='Территориальный орган'){
    const ancestors=matchOrganizations(chain.filter(o=>o.id!==employer.id),institutions).filter(o=>o.authorityId);
    const direct=ancestors.filter(o=>normalizeName(o.name)===normalizeName(parent));
    const eligible=direct.length===1?direct:ancestors;
    if(new Set(eligible.map(o=>o.authorityId)).size===1){mapped={...mapped,authorityId:eligible[0].authorityId,relation:'territorial',matchMethod:'reviewed',evidenceUrl:url};}
  }
  return {...mapped,idScope:'vacancy-organization-reference',sourceSubtype:subtype,sourceParentName:parent,sourceHierarchy:chain,evidenceUrl:url,lastSeenAt:observedAt,identityMethod:'exact-name-in-observed-vacancy-hierarchy',identityVacancyId:row.id.toLowerCase()};
}
export function vacancyFromList(row,organization,observedAt,detail){
  if(normalizeName(row.organizationName)!==normalizeName(organization.name))fail('employer-join-mismatch');
  const amount=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1e9?x.toLocaleString('ru-RU'):null;
  const from=amount(row.salaryFrom),to=amount(row.salaryTo);
  const salary=from&&to?(from===to?from:`${from} – ${to}`):from?`от ${from}`:to?`до ${to}`:'';
  const v=detail?.vacancy?.id?.toLowerCase()===row.id.toLowerCase()?detail.vacancy:null;
  return {id:row.id.toLowerCase(),title:plain(row.caption),organizationId:organization.id,sourceOrganizationReference:v?organization.id:null,url:vacancyUrl(row.id),department:plain(row.departmentName),location:plain([row.regionName,row.areaName].filter(Boolean).join(', ')),publishedAt:sourceDate(row.announcementDate),deadline:sourceDate(row.expireDate),acceptFrom:null,sourceStatus:v?plain(v.state):null,salary:salary?salary+' ₽/мес.':'',education:v?plain(v.educationLevelName):'',experience:plain(row.governmentExperienceName),kind:row.type===2?'Кадровый резерв':row.isCompetition===true?'Конкурс':row.type===1?'Вакантная должность':'',lastSeenAt:observedAt,sourceType:row.type,sourceKind:row.kind,isCompetition:row.isCompetition===true,sourceEmployerName:plain(row.organizationName,1000),organizationEvidenceUrl:v?vacancyUrl(row.id):organization.evidenceUrl,organizationIdentityMethod:v?'individual-vacancy-detail':organization.identityMethod};
}
export async function collectSnapshot({request,institutions,observedAt=new Date().toISOString(),maxOrganizations=500,log=()=>{}}){
  const pages=await collectPages(request),groups=new Map();
  for(const row of pages.rows){const key=normalizeName(row.organizationName);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  if(groups.size>maxOrganizations)fail('organization-limit');
  const organizations=[],vacancies=[],orgIDs=new Map();let count=0,centralDetails=0;
  const register=organization=>{
    if(orgIDs.has(organization.id)&&normalizeName(orgIDs.get(organization.id).name)!==normalizeName(organization.name))fail('conflicting-employer-identity');
    if(!orgIDs.has(organization.id)){organizations.push(organization);orgIDs.set(organization.id,organization);}
  };
  for(const rows of groups.values()){
    const detail=await request(detailURL(rows[0].id));
    const organization=organizationFromDetail(detail,rows[0],institutions,observedAt);
    register(organization);
    for(const row of rows){
      if(organization.relation==='exact'){
        if(++centralDetails>750)fail('central-detail-limit');
        const individual=row.id===rows[0].id?detail:await request(detailURL(row.id));
        const exactOrganization=organizationFromDetail(individual,row,institutions,observedAt);
        if(exactOrganization.relation!=='exact'||exactOrganization.authorityId!==organization.authorityId)fail('central-detail-identity-changed');
        register(exactOrganization);vacancies.push(vacancyFromList(row,exactOrganization,observedAt,individual));
      }else vacancies.push(vacancyFromList(row,organization,observedAt,detail));
    }
    count++;if(count%25===0||count===groups.size)log({organizationsResolved:count,totalOrganizations:groups.size});
  }
  const feed={schemaVersion:1,source:PORTAL,sourcePage:PORTAL+'/vacancy/tab1',state:'ready',lastSuccessAt:observedAt,directoryCoverage:'employer-references-in-filtered-results',vacancyCoverage:'all-pages-of-federal-active-search',sourceQuery:{endpoint:SEARCH_URL,method:'POST',filter:FILTER,sort:0,direction:1,pageSize:pages.pageSize},sourceTotal:pages.total,sourcePageCount:pages.pageCount,sourceEmployerCount:groups.size,sourceReferenceCount:organizations.length,centralDetailsVerified:centralDetails,organizations:organizations.sort((a,b)=>a.id.localeCompare(b.id)),vacancies:vacancies.sort((a,b)=>a.id.localeCompare(b.id)),note:'Complete paged federal search, excluding expired applications and targeted education; not the entire portal or a canonical employer directory. Organization UUIDs are references inside individual vacancy details, NOT verified canonical employer IDs; distinct references may have identical employer names. All central authority vacancies have individual detail checks. Other vacancies join an observed representative hierarchy by exact normalized source employer name, with explicit evidence; their unobserved sourceOrganizationReference stays null. Intake status is copied only from the same individual vacancy; missing deadlines/statuses are not invented.'};
  if(validateFeed(feed).length)fail('invalid-normalized-feed');
  return feed;
}
export async function checkFiles(feedPath,statusPath){
  const feed=await json(feedPath),status=await json(statusPath),errors=validateFeed(feed);
  if(status.schemaVersion!==1||!['ready','partial','unavailable','not_connected'].includes(status.state))errors.push('invalid-sync-status');
  if(status.lastSuccessAt!==feed.lastSuccessAt)errors.push('sync-time-mismatch');
  if(feed.lastSuccessAt&&(!Number.isSafeInteger(feed.sourceTotal)||feed.sourceTotal!==feed.vacancies.length))errors.push('source-count-mismatch');
  if(feed.lastSuccessAt&&(feed.sourceReferenceCount!==feed.organizations.length||feed.sourceEmployerCount!==new Set(feed.organizations.map(o=>normalizeName(o.name))).size))errors.push('employer-count-mismatch');
  if(feed.vacancies.some(v=>v.testFixture)||feed.testFixture)errors.push('synthetic-production-feed');
  if(errors.length)fail(errors.join(','));return {status:'pass',state:status.state,organizations:feed.organizations.length,vacancies:feed.vacancies.length,lastSuccessAt:feed.lastSuccessAt};
}
async function atomicJSON(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(data,null,2)+'\n');await fs.rename(tmp,file);}
export async function baselineFeed(baselineRoot){
  const root=path.resolve(baselineRoot),logical='apps/career/data/vacancies/gossluzhba.json';let filename=path.join(root,logical),expected=null;
  let pointer;try{pointer=await json(path.join(root,'release.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(pointer){
    const registry=await json(path.join(root,'platform-baseline.json')),base=registry.sitePath;
    const local=value=>{const u=new URL(value,'https://release.invalid');if(u.origin!=='https://release.invalid'||typeof base!=='string'||!u.pathname.startsWith(base))fail('baseline-path');const name=decodeURIComponent(u.pathname.slice(base.length)),out=path.resolve(root,name);if(name.includes('\\')||out===root||!out.startsWith(root+path.sep))fail('baseline-path');return out;};
    const manifest=await json(local(pointer.current.manifestURL));expected=manifest.resources[logical];if(!expected)return null;filename=local(expected.url);
  }
  let raw;try{raw=await fs.readFile(filename);}catch(error){if(error.code==='ENOENT'&&!expected)return null;throw error;}
  if(expected&&(raw.length!==expected.bytes||sha(raw)!==expected.sha256))fail('baseline-integrity');
  const feed=JSON.parse(raw.toString('utf8'));if(validateFeed(feed).length)fail('baseline-invalid-feed');return feed.lastSuccessAt?feed:null;
}
export async function refresh({feedPath,statusPath,institutions,request,baseline=null,log=()=>{}}){
  let previous=await json(feedPath);if(validateFeed(previous).length)fail('invalid-existing-feed');
  if(baseline?.lastSuccessAt&&Date.parse(baseline.lastSuccessAt)>Date.parse(previous.lastSuccessAt||'1970-01-01'))previous=baseline;
  const attemptedAt=new Date().toISOString();
  try{
    const feed=await collectSnapshot({request,institutions,observedAt:attemptedAt,log});
    await atomicJSON(feedPath,feed);await atomicJSON(statusPath,{schemaVersion:1,state:feed.state,attemptedAt,lastSuccessAt:feed.lastSuccessAt,errorCode:null,message:'Public federal search retrieved without authentication; see feed coverage and observation time.',sourceTotal:feed.sourceTotal,sourcePageCount:feed.sourcePageCount});
    return {status:'pass',state:feed.state,organizations:feed.organizations.length,vacancies:feed.vacancies.length,lastSuccessAt:feed.lastSuccessAt};
  }catch(error){
    // Persist the last successful published snapshot, not an incomplete new page.
    await atomicJSON(feedPath,previous);
    const code=/^vacancies\/[a-z0-9,-]+$/.test(error.message)?error.message:'vacancies/source-unavailable';
    await atomicJSON(statusPath,{schemaVersion:1,state:'unavailable',attemptedAt,lastSuccessAt:previous.lastSuccessAt,errorCode:code,message:'Refresh failed; last known good snapshot retained. An empty list is not proof of no vacancies.'});
    return {status:'unavailable',state:'unavailable',errorCode:code,vacancies:previous.vacancies.length,lastSuccessAt:previous.lastSuccessAt};
  }
}
async function main(){
  const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1],feedPath=path.join(ROOT,'site/apps/career/data/vacancies/gossluzhba.json'),statusPath=path.join(ROOT,'site/apps/career/data/vacancies/sync-status.json');
  if(args.includes('--check')){if(args.length!==1)fail('check-is-offline-only');console.log(JSON.stringify(await checkFiles(feedPath,statusPath)));return;}
  if(!args.includes('--refresh')||args.some((x,i)=>x.startsWith('--')&&!['--refresh','--baseline','--evidence'].includes(x)))fail('usage-refresh-or-check');
  const institutions=await json(path.join(ROOT,'site/apps/career/data/authorities.json')),additional=await json(path.join(ROOT,'site/apps/career/data/public-service.json'));
  institutions.push(...additional.records.map(a=>({id:a.id,name:a.name.ru,shortName:a.name.ru})));
  const evidence=args.includes('--evidence')?path.resolve(option('--evidence')):null,observations=[];if(evidence)await fs.mkdir(evidence,{recursive:true});
  let requestCount=0,lastRequest=0;
  const request=async(url,options={})=>{
    if(++requestCount>1200)fail('request-limit');await pause(Math.max(0,450-(Date.now()-lastRequest)));lastRequest=Date.now();
    return requestJSON(url,{...options,onObservation:async(receipt,data)=>{observations.push(receipt);if(evidence){const name=url===SEARCH_URL?`page-${String(options.body.page).padStart(3,'0')}.json`:`employer-${url.split('/').at(-1)}.json`;const safe=url===SEARCH_URL?data:{vacancy:{id:data.vacancy?.id,organizationName:data.vacancy?.organizationName,organizations:data.vacancy?.organizations,subTypeName:data.vacancy?.subTypeName,parentOrganizationName:data.vacancy?.parentOrganizationName,state:data.vacancy?.state}};await atomicJSON(path.join(evidence,name),safe);}}});
  };
  const baseline=args.includes('--baseline')?await baselineFeed(option('--baseline')):null;
  const result=await refresh({feedPath,statusPath,institutions,request,baseline,log:value=>console.log(JSON.stringify(value))});
  if(evidence)await atomicJSON(path.join(evidence,'observations.json'),{schemaVersion:1,requests:observations,result});
  console.log(JSON.stringify(result));
  // Source availability is advisory for the course; structural --check is a separate hard gate.
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message?.startsWith('vacancies/')?error.message:'vacancies/local-pipeline-error');process.exitCode=1;});
