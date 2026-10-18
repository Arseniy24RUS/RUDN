import {randomUUID} from 'node:crypto';
import {LIMITS,CODES,fail,fields,identifier,token,environment,event,packet,hash,nameTokens,nameKey,isError,encodeCursor,decodeCursor} from './diagnostics-schema.mjs';

export const ROOT='rudn-platform/v1/diagnosticsV2';
export const TEACHER_EMAIL='omnistat@yandex.ru';
const V1='rudn-platform/v1';
const key=value=>hash(value).slice(0,40);
const list=value=>Object.entries(value||{}).sort(([a],[b])=>a.localeCompare(b));
const sessionKey=(stamp,id)=>String(stamp).padStart(13,'0')+'_'+id;
const maxPage=(value,maximum=LIMITS.page)=>Number.isInteger(value)&&value>0?Math.min(value,maximum):maximum;
const clean=value=>JSON.parse(JSON.stringify(value));
const teacher=auth=>auth?.email===TEACHER_EMAIL;
const requireTeacher=auth=>{if(!teacher(auth))fail('forbidden',403);};
const safeKey=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)?value:fail();
const values=value=>Array.isArray(value)?value:Object.keys(value||{});
const publicSummary=value=>({...value,modules:Object.fromEntries(values(value.modules).map(v=>[v,true])),codes:Object.fromEntries(values(value.codes).map(v=>[v,true]))});

// The restricted connection uses a service auth override. Rules atomically fence
// packet/index writes against deletion generations; Admin reads never bypass it.
export function createDiagnosticsService({db,ingestDb=db,now=Date.now,uuid=randomUUID}={}){
 const ref=path=>db.ref(path.startsWith(V1)?path:ROOT+'/'+path);
 const read=async path=>(await ref(path).get()).val();
 const restricted=path=>ingestDb.ref(ROOT+'/'+path);
 async function epoch(path){const result=await ref(path).transaction(current=>current??{generation:0});return result.snapshot.val().generation;}
 async function active(session){if(!session||session.closed)return false;const [global,subject,tombstone]=await Promise.all([read('control/global'),read('control/subjects/'+session.subjectKey),read('tombstones/'+session.sessionId)]);return !tombstone&&session.globalGeneration===(global?.generation||0)&&session.generation===(subject?.generation||0);}
 async function requireSession(sessionId,auth,{admin=false}={}){identifier(sessionId);const session=await read('sessions/'+sessionId);if(!session)fail('not-found',404);if(!admin&&session.uid!==auth.uid)fail('forbidden',403);if(!await active(session))fail('deleted',409);return session;}
 async function profile(studentKey,auth){if(!/^[0-9]{5,20}$/.test(studentKey||''))fail();let canonical=studentKey;for(let i=0;i<4;i++){const alias=await read(V1+'/studentAliases/'+canonical);if(!alias)break;if(!/^[0-9]{5,20}$/.test(alias)||alias===canonical)fail('invalid-profile',409);canonical=alias;}const p=await read(V1+'/profiles/'+canonical);if(!p||p.mergedInto||p.studentKey!==canonical)fail('not-found',404);if(auth&&!teacher(auth)&&p.ownerUid!==auth.uid&&p.ownerUids?.[auth.uid]!==true)fail('forbidden',403);return {canonical,p};}
 async function directoryEntry(path,studentKey,revision,deleted=false){await ref(path).transaction(current=>Number(current?.sourceUpdatedAt||0)>revision?undefined:{studentKey,sourceUpdatedAt:revision,deleted});}
 async function directory(studentKey,p,revision=Number(p.updatedAt)||0){
  const old=await read('directory/'+studentKey),tokens=nameTokens(p.fullName);
  const value={studentKey,fullName:String(p.fullName||'').slice(0,150),group:String(p.group||'').slice(0,50),tokens,updatedAt:now(),sourceUpdatedAt:revision};
  const claimed=await ref('directory/'+studentKey).transaction(current=>Number(current?.sourceUpdatedAt||0)>revision?undefined:value);if(!claimed.committed)return claimed.snapshot.val();
  for(const word of old?.tokens||[])if(!tokens.includes(word))await directoryEntry('nameIndex/'+nameKey(word)+'!'+studentKey,studentKey,revision,true);
  for(const word of tokens)await directoryEntry('nameIndex/'+nameKey(word)+'!'+studentKey,studentKey,revision);
  if(old?.group&&old.group!==value.group)await directoryEntry('groupIndex/'+key(old.group)+'/'+studentKey,studentKey,revision,true);
  await directoryEntry('groupIndex/'+key(value.group)+'/'+studentKey,studentKey,revision);return value;
 }
 async function rate(uid,kind){const stamp=now();let retry=0;const result=await ref('limits/'+key(uid)).transaction(current=>{const value=current||{};if(kind==='batch'){if(value.lastBatch&&stamp-value.lastBatch<LIMITS.intervalMs){retry=LIMITS.intervalMs-(stamp-value.lastBatch);return;}return {...value,lastBatch:stamp};}const start=value.openWindow||0,count=stamp-start<60000?value.opens||0:0;if(count>=12){retry=Math.max(1,60000-(stamp-start));return;}return {...value,openWindow:count?start:stamp,opens:count+1};});if(!result.committed)fail('rate-limit',429,{retryAfterMs:retry||30000});}
 async function index(session,events=[],receivedAt=session.openedAt){
  const modules=events.map(e=>e.module),codes=events.map(e=>e.code);
  const result=await restricted('sessions/'+session.sessionId).transaction(current=>{const value=current||session;if(value.closed)return;return {...value,lastAt:Math.max(value.lastAt||0,receivedAt),modules:[...new Set([...values(value.modules),...modules])],codes:[...new Set([...values(value.codes),...codes])]};});
  if(!result.committed)fail('deleted',409);const value=result.snapshot.val();
  const summary={sessionId:value.sessionId,indexKey:value.indexKey,subjectKey:value.subjectKey,studentKey:value.studentKey||null,kind:value.kind,installationId:value.installationId,reportCode:value.reportCode,build:value.build,environment:value.environment,openedAt:value.openedAt,lastAt:value.lastAt,modules:value.modules||{},codes:value.codes||{},generation:value.generation,globalGeneration:value.globalGeneration};
  const updates={['sessionIndex/'+value.indexKey]:summary,['subjectIndex/'+value.subjectKey+'/'+value.indexKey]:summary};
  for(const [field,items] of Object.entries({build:[value.build],browser:[value.environment.browser],installationId:[value.installationId],module:values(summary.modules),code:values(summary.codes)}))for(const item of items)updates['filterIndex/'+field+'/'+key(item)+'/'+value.indexKey]=summary;
  await ingestDb.ref(ROOT).update(updates);return summary;
 }
 async function openSession(input,auth){
  fields(input,['action','clientSessionId','installationId','studentKey','build','environment']);identifier(input.clientSessionId);const installationId=identifier(input.installationId||input.clientSessionId),build=token(input.build||'unknown',80),env=environment(input.environment);
  let studentKey=null,kind=teacher(auth)?'teacher':'anonymous';if(!teacher(auth)&&input.studentKey){const resolved=await profile(input.studentKey,auth);studentKey=resolved.canonical;kind='student';await directory(studentKey,resolved.p);}
  const subjectKey=kind==='student'?'student_'+studentKey:kind+'_'+key(auth.uid),sessionId=key(auth.uid+'|'+input.clientSessionId);
  if(await read('tombstones/'+sessionId))fail('deleted',409);
  const old=await read('sessions/'+sessionId);if(old){if(old.subjectKey!==subjectKey||old.installationId!==installationId||old.build!==build||old.uid!==auth.uid)fail('conflict',409);if(!await active(old))fail('deleted',409);await index(old);return {...old,uid:undefined,environment:undefined};}
  await rate(auth.uid,'open');const [globalGeneration,generation]=await Promise.all([epoch('control/global'),epoch('control/subjects/'+subjectKey)]),openedAt=now();
  const value={schema:2,sessionId,subjectKey,studentKey,kind,uid:auth.uid,installationId,build,environment:env,globalGeneration,generation,openedAt,lastAt:openedAt,indexKey:sessionKey(openedAt,sessionId),reportCode:sessionId.slice(0,12).toUpperCase(),closed:false};
  const result=await restricted('sessions/'+sessionId).transaction(current=>current||value);if(result.snapshot.val()?.subjectKey!==subjectKey)fail('conflict',409);await index(result.snapshot.val());return {sessionId,subjectKey,studentKey,generation,reportCode:value.reportCode,openedAt};
 }
 async function repairBatch(session,batch){
  await restricted('batchIndex/'+session.sessionId+'/'+sessionKey(batch.receivedAt,batch.batchId)).set({batchId:batch.batchId,receivedAt:batch.receivedAt,events:batch.events.length,errors:batch.events.filter(isError).length,bytes:Buffer.byteLength(JSON.stringify(batch)),dropped:batch.dropped,deduplicated:batch.deduplicated});
  await index(session,batch.events,batch.receivedAt);
 }
 async function append(input,auth){
  const p=packet(input),session=await requireSession(p.sessionId,auth),digest=hash(p),path='batches/'+p.sessionId+'/'+p.batchId;
  if(new Set([...values(session.modules),...p.events.map(e=>e.module)]).size>128)fail('limit',413);
  const existing=await read(path);if(existing){if(existing.digest!==digest)fail('batch-conflict',409);await repairBatch(session,existing);return {batchId:p.batchId,receivedAt:existing.receivedAt,duplicate:true};}
  const receivedAt=now(),value={schema:2,...p,digest,receivedAt,subjectKey:session.subjectKey,generation:session.generation,globalGeneration:session.globalGeneration};if(Buffer.byteLength(JSON.stringify(value))>LIMITS.packetBytes)fail('limit',413);await rate(auth.uid,'batch');
  const result=await restricted(path).transaction(current=>current?undefined:value);
  if(!result.committed){const saved=result.snapshot.val();if(saved?.digest!==digest)fail('batch-conflict',409);await repairBatch(session,saved);return {batchId:p.batchId,receivedAt:saved.receivedAt,duplicate:true};}
  await repairBatch(session,value);return {batchId:p.batchId,receivedAt,duplicate:false};
 }
 async function page(path,{after='',prefix='',at='',limit=LIMITS.scan}={}){let query=ref(path).orderByKey();if(after)query=query.startAfter(after);else if(at||prefix)query=query.startAt(at||prefix);if(prefix)query=query.endAt(prefix+'\uf8ff');const data=(await query.limitToFirst(limit+1).get()).val(),rows=list(data),more=rows.length>limit;return {rows:rows.slice(0,limit),more};}
 function cursor(input,path){const c=decodeCursor(input.cursor);if(c&&c.path!==path)fail('invalid-cursor');return c?.after||'';}
 async function searchStudents(input){
  fields(input,['action','query','group','cursor','limit']);const query=typeof input.query==='string'?input.query.trim().slice(0,150):'',words=nameTokens(query),group=typeof input.group==='string'?input.group.slice(0,50):'';
  if(/^[0-9]{5,20}$/.test(query)){try{const {canonical,p}=await profile(query,null);return {items:!group||p.group===group?[{studentKey:canonical,fullName:p.fullName,group:p.group}]:[],nextCursor:null};}catch(error){if(error.code==='not-found')return {items:[],nextCursor:null};throw error;}}
  const path=words.length?'nameIndex':group?'groupIndex/'+key(group):'directory',prefix=words.length?nameKey(words[0]):'',signature=path+'|'+query+'|'+group,after=cursor(input,signature),limit=maxPage(input.limit),out=[];
  const result=await page(path,{after,prefix,limit:LIMITS.scan});let last=after;for(const [entry,value] of result.rows){last=entry;if(value.deleted)continue;const p=path==='directory'?value:await read('directory/'+value.studentKey);if(!p||p.deleted||group&&p.group!==group||words.some(word=>!p.tokens?.some(token=>token.startsWith(word))))continue;out.push({studentKey:p.studentKey,fullName:p.fullName,group:p.group});if(out.length===limit)break;}
  const more=result.more||result.rows.at(-1)?.[0]!==last;return {items:out,nextCursor:more?encodeCursor({path:signature,after:last}):null};
 }
 function filterArgs(input){const filters=fields(input.filters||{},['build','browser','module','code','installationId']);for(const [k,v] of Object.entries(filters)){if(k==='code'){if(!CODES.has(v))fail();}else token(v,k==='build'?80:64);}return filters;}
 async function listSessions(input){
  fields(input,['action','studentKey','subjectKey','filters','cursor','limit']);const filters=filterArgs(input);let subjectKey=input.subjectKey?safeKey(input.subjectKey):'';if(input.studentKey)subjectKey='student_'+(await profile(input.studentKey,null)).canonical;
  const first=Object.entries(filters)[0],path=subjectKey?'subjectIndex/'+subjectKey:first?'filterIndex/'+first[0]+'/'+key(first[1]):'sessionIndex',signature=path+'|'+JSON.stringify(filters),after=cursor(input,signature),limit=maxPage(input.limit),out=[];
  const result=await page(path,{after,limit:LIMITS.scan});let last=after;for(const [entry,value] of result.rows){last=entry;if(Object.entries(filters).some(([field,v])=>field==='module'?!values(value.modules).includes(v):field==='code'?!values(value.codes).includes(v):field==='browser'?value.environment?.browser!==v:value[field]!==v))continue;if(!await active(await read('sessions/'+value.sessionId)))continue;out.push(publicSummary(value));if(out.length===limit)break;}
  const more=result.more||result.rows.at(-1)?.[0]!==last;return {items:out,nextCursor:more?encodeCursor({path:signature,after:last}):null};
 }
 async function readEvents(input,auth,exporting=false){
  fields(input,['action','sessionId','cursor','limit']);
  if(typeof input.sessionId==='string'&&/^legacy-[a-f0-9]{40}$/.test(input.sessionId)){const archive=await read('legacyArchive/'+input.sessionId.slice(7));if(!archive||archive.deleted)fail('not-found',404);return {items:archive.batch.events.map((e,i)=>({...e,eventId:input.sessionId+'_'+i,receivedAt:archive.batch.writtenAt||archive.archivedAt})),nextCursor:null,session:{sessionId:input.sessionId,kind:'legacy-unbound',build:archive.batch.build,environment:archive.batch.environment,openedAt:archive.batch.createdAt,reportCode:archive.batch.reportCode},format:'diagnostics-v1-archive',containsGrades:false};}
  const session=await requireSession(input.sessionId,auth,{admin:true}),path='batchIndex/'+session.sessionId,after=cursor(input,path),limit=maxPage(input.limit,exporting?LIMITS.exportPage:LIMITS.eventPage),out=[];
  // Cursor points to batch + offset, keeping each server response bounded.
  let parsed;try{parsed=after?JSON.parse(after):{batch:'',offset:0};}catch{fail('invalid-cursor');}if(typeof parsed.batch!=='string'||parsed.batch.length>150||!Number.isInteger(parsed.offset)||parsed.offset<0||parsed.offset>12)fail('invalid-cursor');
  const result=await page(path,{at:parsed.batch,limit:Math.ceil(limit/12)+1});let next=null;
  for(const [indexKey,meta] of result.rows){if(parsed.batch&&indexKey<parsed.batch)continue;const batch=await read('batches/'+session.sessionId+'/'+meta.batchId);if(!batch)continue;for(let i=indexKey===parsed.batch?parsed.offset:0;i<batch.events.length;i++){if(out.length===limit){next=encodeCursor({path,after:JSON.stringify({batch:indexKey,offset:i})});break;}out.push({...batch.events[i],eventId:meta.batchId+'_'+i,batchId:meta.batchId,receivedAt:batch.receivedAt});}if(next)break;}
  if(!next&&result.more&&result.rows.length)next=encodeCursor({path,after:JSON.stringify({batch:result.rows.at(-1)[0],offset:result.rows.at(-1)[1].events})});
  return {items:out,nextCursor:next,...(exporting?{session,format:'diagnostics-v2',containsGrades:false}:{})};
 }
 async function scope(input){if(!['all','student','session','legacy'].includes(input.scope))fail();if(input.scope==='session'||input.scope==='legacy'){identifier(input.sessionId);if(/^legacy-[a-f0-9]{40}$/.test(input.sessionId))return {scope:'legacy',sessionId:input.sessionId};if(input.scope==='legacy')fail();return {scope:'session',sessionId:input.sessionId};}if(input.scope==='student'){return {scope:'student',studentKey:(await profile(input.studentKey,null)).canonical};}return {scope:'all'};}
 async function stats(input){
  const target=await scope(input),path=target.scope==='session'?'batchIndex/'+target.sessionId:target.scope==='student'?'subjectIndex/student_'+target.studentKey:'sessionIndex';
  const counts={sessions:0,batches:0,events:0,errors:0,bytes:0,dropped:0,deduplicated:0},add=rows=>{for(const [,b] of rows){counts.batches++;for(const f of ['events','errors','bytes','dropped','deduplicated'])counts[f]+=b[f]||0;}};
  const legacyPage=async(after='')=>{const result=await page('legacyArchive',{after,limit:10});for(const [,v] of result.rows){if(v.deleted)continue;counts.sessions++;counts.batches++;counts.events+=v.batch.events.length;counts.errors+=v.batch.events.filter(isError).length;counts.bytes+=Buffer.byteLength(JSON.stringify(v));}return {counts,nextCursor:result.more?encodeCursor({path,phase:'legacy',after:result.rows.at(-1)[0]}):null,partial:result.more};};
  if(target.scope==='legacy'){const v=await read('legacyArchive/'+target.sessionId.slice(7));if(v&&!v.deleted){counts.sessions=1;counts.batches=1;counts.events=v.batch.events.length;counts.errors=v.batch.events.filter(isError).length;counts.bytes=Buffer.byteLength(JSON.stringify(v));}return {counts,nextCursor:null,partial:false};}
  if(target.scope==='session'){const after=cursor(input,path);if(!await active(await read('sessions/'+target.sessionId)))return {counts,nextCursor:null,partial:false};counts.sessions=after?0:1;const result=await page(path,{after,limit:100});add(result.rows);return {counts,nextCursor:result.more?encodeCursor({path,after:result.rows.at(-1)[0]}):null,partial:result.more};}
  const encoded=decodeCursor(input.cursor);if(encoded&&encoded.path!==path)fail('invalid-cursor');if(encoded?.phase){if(target.scope!=='all'||encoded.phase!=='legacy'||typeof encoded.after!=='string'||encoded.after.length>150)fail('invalid-cursor');return legacyPage(encoded.after);}const position=encoded?.position||{after:'',current:'',batchAfter:''};
  if([position.after,position.current,position.batchAfter].some(v=>typeof v!=='string'||v.length>150))fail('invalid-cursor');
  const result=await page(path,{after:position.current?'':position.after,at:position.current,limit:10});let next=null;
  for(const [entry,summary] of result.rows){const current=await read('sessions/'+summary.sessionId);if(!await active(current))continue;const batchAfter=entry===position.current?position.batchAfter:'';if(!batchAfter)counts.sessions++;
   const batches=await page('batchIndex/'+summary.sessionId,{after:batchAfter,limit:Math.max(1,100-counts.batches)});add(batches.rows);
   if(batches.more){next={after:'',current:entry,batchAfter:batches.rows.at(-1)[0]};break;}
   if(counts.batches>=100){if(result.more||entry!==result.rows.at(-1)[0])next={after:entry,current:'',batchAfter:''};break;}
  }
  if(!next&&result.more)next={after:result.rows.at(-1)[0],current:'',batchAfter:''};
  if(!next&&target.scope==='all')return legacyPage();
  return {counts,nextCursor:next?encodeCursor({path,position:next}):null,partial:Boolean(next)};
 }
 async function previewDelete(input,auth){fields(input,['action','scope','studentKey','sessionId']);const target=await scope(input),confirmationToken=uuid().replaceAll('-',''),createdAt=now();await ref('deletePreviews/'+confirmationToken).set({target,uid:auth.uid,createdAt});return {confirmationToken,target,...await stats({...target}),requiresConfirmation:true};}
 async function createExport(input,auth){
  fields(input,['action','sessionId']);const first=await readEvents({action:'exportSession',sessionId:input.sessionId,limit:1},auth,true),session=first.session,owner=key(auth.uid),secret=uuid().replaceAll('-','')+uuid().replaceAll('-',''),stamp=now();
  for(let slot=0;slot<4;slot++){const value={sessionId:input.sessionId,secretHash:hash(secret),createdAt:stamp,expiresAt:stamp+120000,usedAt:0,generation:session.generation??null,globalGeneration:session.globalGeneration??null};const claimed=await ref('exportTokens/'+owner+'/'+slot).transaction(current=>!current||current.usedAt||current.expiresAt<=stamp?value:undefined);if(claimed.committed)return {downloadToken:owner+'.'+slot+'.'+secret,expiresAt:value.expiresAt};}
  fail('export-busy',429,{retryAfterMs:120000});
 }
 async function consumeExport(downloadToken){
  if(typeof downloadToken!=='string'||!/^([a-f0-9]{40})\.[0-3]\.([a-f0-9]{64})$/.test(downloadToken))fail('not-found',404);const [owner,slot,secret]=downloadToken.split('.'),path='exportTokens/'+owner+'/'+slot,known=await read(path),stamp=now();
  if(!known||known.secretHash!==hash(secret)||known.usedAt||known.expiresAt<=stamp)fail('expired',410);
  const claimed=await ref(path).transaction(current=>{const value=current||known;if(value.secretHash!==hash(secret)||value.usedAt||value.expiresAt<=stamp)return;return {...value,usedAt:stamp};});if(!claimed.committed)fail('expired',410);
  const grant=claimed.snapshot.val();if(!grant.sessionId.startsWith('legacy-')){const session=await requireSession(grant.sessionId,{}, {admin:true});if(session.generation!==grant.generation||session.globalGeneration!==grant.globalGeneration)fail('deleted',409);}else {const archive=await read('legacyArchive/'+grant.sessionId.slice(7));if(!archive||archive.deleted)fail('deleted',409);}
  return {sessionId:grant.sessionId};
 }
 async function* exportLines(grant){
  let cursor=null,total=0,header=false;
  do{const page=await readEvents({action:'exportSession',sessionId:grant.sessionId,limit:100,cursor},{},true);if(!header){const {uid,...session}=page.session;yield {kind:'session',schema:2,session};header=true;}for(const event of page.items){yield {kind:'event',...event};total++;}cursor=page.nextCursor;}while(cursor);
  yield {kind:'complete',complete:true,events:total};
 }
 async function removeSession(session){
  const id=session.sessionId;await ref('tombstones/'+id).set({deletedAt:now(),subjectKey:session.subjectKey});await ref('sessions/'+id+'/closed').set(true);session=await read('sessions/'+id);
  // The close precedes cleanup. A delayed restricted ingest cannot recreate any
  // packet/index, even after metadata is removed, because the tombstone remains.
  const updates={['batches/'+id]:null,['batchIndex/'+id]:null,['sessions/'+id]:null,['sessionIndex/'+session.indexKey]:null,['subjectIndex/'+session.subjectKey+'/'+session.indexKey]:null};
  for(const [field,items] of Object.entries({build:[session.build],browser:[session.environment?.browser||'unknown'],installationId:[session.installationId],module:values(session.modules),code:values(session.codes)}))for(const value of items)updates['filterIndex/'+field+'/'+key(value)+'/'+session.indexKey]=null;
  await ref('').update(updates);
 }
 async function runDelete(jobId){
  identifier(jobId);const leaseId=uuid(),runner=await ref('jobRunners/'+jobId).transaction(value=>!value||value.until<now()?{id:leaseId,until:now()+90000}:undefined);
  if(!runner.committed){const job=await read('deleteJobs/'+jobId);if(!job)fail('not-found',404);return {job};}
  try{return await runDeleteStep(jobId);}finally{await ref('jobRunners/'+jobId).transaction(value=>!value||value.id===leaseId?null:undefined);}
 }
 async function runDeleteStep(jobId){
  identifier(jobId);let job=await read('deleteJobs/'+jobId);if(!job)fail('not-found',404);if(job.state==='complete'){await ref('control/deleteLock').transaction(value=>!value||value.jobId===jobId?null:undefined);return {job};}
  // Only one manual job runs at a time. Its persistent lock also makes a crash
  // between fencing and job acknowledgement safely resumable, with no lease TTL.
  let lock=await ref('control/deleteLock').transaction(value=>!value||value.jobId===jobId?{jobId}:undefined);
  if(!lock.committed){const otherId=lock.snapshot.val()?.jobId,other=otherId&&await read('deleteJobs/'+otherId);if(other?.state==='complete'){await ref('control/deleteLock').transaction(value=>!value||value.jobId===otherId?null:undefined);lock=await ref('control/deleteLock').transaction(value=>!value||value.jobId===jobId?{jobId}:undefined);}if(!lock.committed)fail('delete-busy',409);}
  const target=job.target;
  if(target.scope==='legacy'){await ref('legacyArchive/'+target.sessionId.slice(7)).transaction(()=>({deleted:true,deletedAt:now()}));const update={...job,state:'complete',deletedLegacy:1,updatedAt:now()};await ref('deleteJobs/'+jobId).set(update);await ref('control/deleteLock').transaction(value=>!value||value.jobId===jobId?null:undefined);return {job:update};}
  if(job.state==='preparing'){
   let generation=0;
   if(target.scope!=='session'){const controlPath=target.scope==='all'?'control/global':'control/subjects/student_'+target.studentKey;const fenced=await ref(controlPath).transaction(value=>value?.deleteJob===jobId?value:{generation:(value?.generation||0)+1,deleteJob:jobId});generation=fenced.snapshot.val().generation;}
   else{await ref('tombstones/'+target.sessionId).set({deletedAt:now()});if(await read('sessions/'+target.sessionId))await ref('sessions/'+target.sessionId+'/closed').set(true);}
   job={...job,state:'running',fencedGeneration:generation};await ref('deleteJobs/'+jobId).set(job);
  }
  if(job.phase==='legacy'){
   const result=await page('legacyArchive',{after:job.legacyCursor||'',limit:10});let deleted=0;for(const [id,value] of result.rows){if(value.deleted)continue;await ref('legacyArchive/'+id).transaction(()=>({deleted:true,deletedAt:now()}));deleted++;}
   const update={...job,deletedLegacy:(job.deletedLegacy||0)+deleted,legacyCursor:result.rows.at(-1)?.[0]||job.legacyCursor||'',state:'running',phase:result.more?'legacy':'legacy-source',updatedAt:now()};await ref('deleteJobs/'+jobId).set(update);return {job:update};
  }
  if(job.phase==='legacy-source'){
   const result=await page(V1+'/diagnostics',{limit:4});for(const [uid] of result.rows){await ref(V1+'/diagnostics/'+uid).remove();await ref(V1+'/diagnosticSessions/'+uid).remove();}
   const update={...job,deletedLegacyOwners:(job.deletedLegacyOwners||0)+result.rows.length,state:result.more?'running':'complete',updatedAt:now()};await ref('deleteJobs/'+jobId).set(update);if(update.state==='complete')await ref('control/deleteLock').transaction(value=>!value||value.jobId===jobId?null:undefined);return {job:update};
  }
  const path='sessions';let rows=[],more=false;
  if(target.scope==='session'){const session=await read('sessions/'+target.sessionId);if(session)rows=[[session.indexKey,session]];}
  else{const result=await page(path,{after:job.cursor||'',limit:10});rows=result.rows;more=result.more;}
  let deleted=0;
  for(const [,row] of rows){const session=await read('sessions/'+row.sessionId);if(!session)continue;const matches=target.scope!=='student'||session.subjectKey==='student_'+target.studentKey;const older=target.scope==='session'||(target.scope==='all'?session.globalGeneration:session.generation)<job.fencedGeneration;if(matches&&older){await removeSession(session);deleted++;}}
  const update={...job,deletedSessions:(job.deletedSessions||0)+deleted,state:more||target.scope==='all'?'running':'complete',phase:!more&&target.scope==='all'?'legacy':'sessions',cursor:rows.at(-1)?.[0]||job.cursor||'',updatedAt:now()};await ref('deleteJobs/'+jobId).set(update);
  if(update.state==='complete')await ref('control/deleteLock').transaction(value=>!value||value.jobId===jobId?null:undefined);
  return {job:update};
 }
 async function deleteHistory(input,auth){
  fields(input,['action','confirmationToken']);identifier(input.confirmationToken);const jobId=key(auth.uid+'|'+input.confirmationToken),old=await read('deleteJobs/'+jobId);if(old)return runDelete(jobId);
  const preview=await read('deletePreviews/'+input.confirmationToken);if(!preview||preview.uid!==auth.uid||now()-preview.createdAt>600000)fail('invalid-confirmation',409);
  await ref('deleteJobs/'+jobId).transaction(value=>value||{jobId,target:preview.target,createdAt:now(),updatedAt:now(),state:'preparing',deletedSessions:0});return runDelete(jobId);
 }
 async function migrateLegacy(input){
  fields(input,['action','kind','cursor','limit','dryRun']);if(input.dryRun!==undefined&&typeof input.dryRun!=='boolean')fail();const kind=input.kind||'profiles',limit=maxPage(input.limit,20),dryRun=input.dryRun===true;
  if(kind==='listArchive'){const path='legacyArchive',result=await page(path,{after:cursor(input,path),limit});return {items:result.rows.filter(([,v])=>!v.deleted).map(([id,v])=>({sessionId:'legacy-'+id,kind:'legacy-unbound',build:v.batch.build,environment:v.batch.environment,openedAt:v.batch.createdAt,reportCode:v.batch.reportCode,eventCount:v.batch.events.length})),nextCursor:result.more?encodeCursor({path,after:result.rows.at(-1)[0]}):null};}
  if(kind==='profiles'){const path=V1+'/profiles',after=cursor(input,path),result=await page(path,{after,limit});let copied=0;for(const [studentKey,p] of result.rows){if(p.studentKey===studentKey&&!p.mergedInto){if(!dryRun)await directory(studentKey,p);copied++;}}return {kind,dryRun,scanned:result.rows.length,copied,nextCursor:result.more?encodeCursor({path,after:result.rows.at(-1)[0]}):null};}
  if(kind!=='archive')fail();if(await read('control/deleteLock'))fail('delete-busy',409);const path=V1+'/diagnostics',after=cursor(input,path),result=await page(path,{after,limit:Math.min(limit,4)});let copied=0;
  for(const [uid,slots] of result.rows)for(const [slot,batches] of list(slots))for(const [batchId,batch] of list(batches)){
   if(batch?.schema!==1||!/^s[0-3]$/.test(slot)||!/^b[0-7]$/.test(batchId))continue;
   let sanitized;try{sanitized={schema:1,build:token(batch.build,80),environment:environment(batch.environment),events:Object.values(batch.events||{}).slice(0,12).filter(e=>e.event!=='report').map(event),createdAt:batch.createdAt,writtenAt:batch.writtenAt,reportCode:token(batch.reportCode,12)};}catch{continue;}
   const archiveId=key(uid+'|'+slot+'|'+batchId+'|'+batch.batchId),value={schema:1,association:'legacy-unbound',archivedAt:now(),sourceUidHash:key(uid),sourceSlot:slot,sourceBatch:batchId,batch:sanitized};if((await read('legacyArchive/'+archiveId))?.deleted)continue;if(!dryRun)await ref('legacyArchive/'+archiveId).transaction(old=>old?.deleted?undefined:old||value);copied++;
  }
  return {kind,dryRun,scanned:result.rows.length,copied,nextCursor:result.more?encodeCursor({path,after:result.rows.at(-1)[0]}):null};
 }
 async function handle(input,auth){
  if(!auth?.uid)fail('auth',401);if(!input||typeof input.action!=='string')fail();
  if(input.action==='openSession')return clean({ok:true,...await openSession(input,auth)});
  if(input.action==='append')return clean({ok:true,...await append(input,auth)});
  requireTeacher(auth);let result;
  switch(input.action){case 'searchStudents':result=await searchStudents(input);break;case 'listSessions':result=await listSessions(input);break;case 'readEvents':result=await readEvents(input,auth);break;case 'exportSession':result=await readEvents(input,auth,true);break;case 'createExport':result=await createExport(input,auth);break;case 'previewDelete':result=await previewDelete(input,auth);break;case 'delete':result=await deleteHistory(input,auth);break;case 'status':result=input.jobId?await runDelete(input.jobId):await stats(input);break;case 'migrateLegacy':result=await migrateLegacy(input);break;default:fail();}
  return clean({ok:true,...result});
 }
 async function syncProfile(studentKey,p,revision=now()){
  if(!/^[0-9]{5,20}$/.test(studentKey))return;
  // Trigger delivery is at-least-once and may be out of order. Re-read the
  // current profile; its index revision prevents older work undoing a rename.
  if(p===undefined)p=await read(V1+'/profiles/'+studentKey);
  revision=Math.max(Number(p?.updatedAt)||0,revision);
  if(p&&!p.mergedInto&&p.studentKey===studentKey){await directory(studentKey,p,revision);return;}
  const old=await read('directory/'+studentKey);const claimed=await ref('directory/'+studentKey).transaction(current=>Number(current?.sourceUpdatedAt||0)>revision?undefined:{studentKey,deleted:true,sourceUpdatedAt:revision});if(!claimed.committed||!old)return;
  await directoryEntry('groupIndex/'+key(old.group||'')+'/'+studentKey,studentKey,revision,true);for(const word of old.tokens||[])await directoryEntry('nameIndex/'+nameKey(word)+'!'+studentKey,studentKey,revision,true);
 }
 return {handle,syncProfile,consumeExport,exportLines};
}
