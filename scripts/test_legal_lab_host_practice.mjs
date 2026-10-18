// Actual host functions with synthetic dependency boundaries; no production data/network.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createLegalLabPracticeCompletion} from '../site/apps/legal-lab/platform.mjs';
import {createDurableStore,durableStore} from '../site/assets/js/durable-store.js';
import {commitStudentAttempt} from '../site/assets/js/checkpoint-sync.js';
import {createLegalLabPersistence} from '../site/assets/js/legal-lab-storage.js';
import {seminarModule,seminarModuleForSlug} from '../site/assets/js/seminar-modules.js';

const version='synthetic-legal-v1',owner='student:synthetic-practice',studentKey='synthetic-practice';
const payload=()=>({id:'synthetic-work-1',contentVersion:version,points:52,total:52,finishedAt:1792175000000});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const memoryStorage=()=>{const map=new Map();return{get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
function fixture(){
  const f={owner,active:true,calls:[],controller:new AbortController(),backend:{generation:1,profile:{studentKey},teacher:false,getProfile(){return this.profile;},isAdmin(){return this.teacher;}}};
  f.backend.saveAttempt=async attempt=>{f.calls.push(structuredClone(attempt));return attempt;};
  f.complete=createLegalLabPracticeCompletion({backend:f.backend,owner,getOwner:()=>f.owner,contentVersion:version,signal:f.controller.signal,isActive:()=>f.active});return f;
}
after(()=>durableStore.close());

test('practice callback accepts only exact public completion fields',async()=>{
  const f=fixture();
  for(const bad of [null,[],{},...[
    {id:'../unsafe'},{id:''},{id:'a'.repeat(129)},{contentVersion:'old'},{points:51},{points:'52'},{total:51},
    {finishedAt:0},{finishedAt:NaN},{finishedAt:Infinity},{finishedAt:1.5},{finishedAt:8640000000000001},
    {delivered:'yes'},{answers:{}},{studentKey:'someone-else'},{recordGrade:true},{type:'legal-lab'}
  ].map(change=>({...payload(),...change}))])await assert.rejects(f.complete(bad),{code:'legal-lab/invalid-practice-completion'});
  assert.equal(f.calls.length,0);
});

test('owner, profile, generation, teacher, abort and conflict guards prevent a queued write',async()=>{
  const changes=[f=>f.owner='student:other',f=>f.backend.profile={studentKey:'other'},f=>f.backend.profile=null,
    f=>f.backend.generation++,f=>f.backend.teacher=true,f=>f.controller.abort(),f=>f.active=false];
  for(const change of changes){
    const before=fixture();change(before);await assert.rejects(before.complete(payload()),{code:'auth/profile-changed'});assert.equal(before.calls.length,0);
    const queued=fixture();const result=queued.complete(payload());change(queued);await assert.rejects(result,{code:'auth/profile-changed'});assert.equal(queued.calls.length,0);
    const inflight=fixture(),gate=deferred(),entered=deferred();
    inflight.backend.saveAttempt=async attempt=>{inflight.calls.push(attempt);entered.resolve();await gate.promise;return attempt;};
    const pending=inflight.complete(payload());await entered.promise;change(inflight);gate.resolve();
    await assert.rejects(pending,{code:'auth/profile-changed'});assert.equal(inflight.calls.length,1,'An already accepted old-owner write cannot mark the new session delivered');
  }
});

test('concurrent and subsequent deliveries keep one immutable non-graded receipt',async()=>{
  const f=fixture();const [a,b]=await Promise.all([f.complete(payload()),f.complete({...payload(),delivered:false})]);
  await f.complete({...payload(),delivered:true});assert.deepEqual(a,b);assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0],{id:'legal-practice-synthetic-work-1',type:'legal-lab-practice',activitySlug:'seminar-4-classroom',draftMode:'legal-lab-practice-completion',points:52,maxPoints:52,recordGrade:false,contentVersion:version,finishedAt:payload().finishedAt,createdAt:new Date(payload().finishedAt).toISOString()});
  await assert.rejects(f.complete({...payload(),finishedAt:payload().finishedAt+1}),{code:'legal-lab/practice-completion-changed'});assert.equal(f.calls.length,1);
  const retry=fixture();retry.backend.saveAttempt=async attempt=>{retry.calls.push(attempt);if(retry.calls.length===1)throw new Error('synthetic storage failure');return attempt;};
  await assert.rejects(retry.complete(payload()));await retry.complete(payload());assert.deepEqual(retry.calls[0],retry.calls[1]);
});

test('actual durable completion and cloud commit preserve the existing grade and are idempotent after remount',async()=>{
  const store=createDurableStore({indexedDB:null,localStorage:memoryStorage(),broadcast:false,locks:null,databaseName:'synthetic-practice-host'});
  const f=fixture(),writes=[],records=new Map([['grades/'+studentKey+'/seminar-4',{points:5,max:5,sourceAttemptId:'old-assessment'}]]);
  const transport={async transaction(path,update){writes.push(path);const next=update(structuredClone(records.get(path)??null));if(next!==undefined)records.set(path,structuredClone(next));return{value:structuredClone(records.get(path))};}};
  f.backend.saveAttempt=async attempt=>{
    const record={...attempt,studentKey,ownerUid:'synthetic-uid'};
    await store.complete({owner,activitySlug:record.activitySlug,mode:record.draftMode,attemptId:record.id,contentVersion:version,state:{phase:'completed',resultAttempt:record},attempt:record});return record;
  };
  try{
    const first=await f.complete(payload());
    const remount=createLegalLabPracticeCompletion({backend:f.backend,owner,contentVersion:version});await remount({...payload(),delivered:false});
    assert.equal((await store.listAttempts({owner})).length,1);
    const options={studentKey,uid:'synthetic-uid',activityMax:{'seminar-4':5}};
    await commitStudentAttempt(transport,first,options);await commitStudentAttempt(transport,first,options);
    assert.equal([...records.keys()].filter(k=>k.startsWith('attempts/')).length,1);
    assert.ok(writes.every(path=>path.startsWith('attempts/')),'Practice delivery must never transact a grade');
    assert.deepEqual(records.get('grades/'+studentKey+'/seminar-4'),{points:5,max:5,sourceAttemptId:'old-assessment'});
    const rules=await readFile(new URL('../firebase/database.rules.json',import.meta.url),'utf8');assert.match(rules,/newData\.child\('createdAt'\)\.isString\(\)/);assert.equal(typeof first.createdAt,'string');
  }finally{store.close();}
});

test('completed dossier sidecar preserves practice receipt and scan answer history without extra attempts',async()=>{
  const storage=memoryStorage(),store=createDurableStore({indexedDB:null,localStorage:storage,broadcast:false,locks:null,databaseName:'synthetic-practice-sidecar'});
  const backend={generation:1,getProfile:()=>({studentKey}),loadDraft:s=>store.loadDraft(s),checkpoint:(s,o)=>store.checkpoint(s,o)};
  const options={backend,store,owner,period:'synthetic-period',contentVersion:version};let persistence=createLegalLabPersistence(options);
  const scope={owner,activitySlug:'seminar-4',mode:'legal-lab-workspace',attemptId:persistence.attemptId};
  const state={schema:1,id:'synthetic-work-1',contentVersion:version,answers:{},scanFields:{},assessment:{phase:'completed',result:{points:5},answer:{metadata:{issuer:'public synthetic'}}}};
  try{
    await store.complete({...scope,contentVersion:version,state:{legalLab:JSON.stringify(state)},attempt:{id:scope.attemptId,type:'legal-lab',points:5,activitySlug:'seminar-4'}});
    await persistence.load();const continued={...state,practiceCompletion:{...payload(),delivered:true},scanAnswerHistory:{S01:[{scanId:'old-synthetic-scan',answer:{metadata:{issuer:'old public answer'}},fieldIndex:2}]}};
    await persistence.checkpoint({state:continued,contentVersion:version});persistence.destroy();persistence=createLegalLabPersistence(options);
    const loaded=await persistence.load();assert.deepEqual(loaded.practiceCompletion,continued.practiceCompletion);assert.deepEqual(loaded.scanAnswerHistory,continued.scanAnswerHistory);assert.deepEqual(loaded.assessment,state.assessment);
    assert.equal((await store.listAttempts({owner})).length,1,'Ordinary checkpoint adds no practice attempt');
  }finally{persistence.destroy();store.close();}
});

const main=await readFile(new URL('../site/assets/js/main.js',import.meta.url),'utf8');
function block(from,to){const start=main.indexOf(from),end=main.indexOf(to,start);assert.ok(start>=0&&end>start);return main.slice(start,end);}
const legalTopic={number:6,title:'Synthetic legal module moved to topic 6',seminar:{slug:'seminar-4',module:'legal-lab',title:'Legal'},lecture:{slug:'lecture-6',title:'Lecture'}};
function dashboard({attempts=[],grades={},locale='ru'}={}){
  const context={data:{course:{topics:[legalTopic],title:'Synthetic course'},legalLabCatalog:{contentVersion:version}},app:{innerHTML:'',querySelector:()=>null},
    backend:{getProfile:()=>({studentKey}),getGrades:async()=>grades,getAttempts:async()=>attempts,isAdmin:()=>false},attemptOwner:()=>owner,
    readSettlementsCourseDrafts:async()=>[null,null],durableStore:{},settlementsCourseStatus:()=>null,seminarModule,number:v=>Number(v)||0,
    esc:String,ui:null,getLocale:()=>locale,loc:(obj,key)=>obj[key],accessSnapshot:()=>({now:0,context:{},overrides:{}}),topicGate:()=>({open:true}),accessAllowed:()=>true,
    lectureTestGate:()=>({open:true}),gateStatus:()=>'',accessText:()=>'',officialTicket:()=>'',t:key=>key,mountSettlementsCourseReceipt:()=>({destroy(){}}),currentCleanup:null};
  vm.createContext(context);vm.runInContext(block('const UI = {','const ACCESS_COPY=')+'\nfunction ui(key){return UI[getLocale()][key]||key;}\n'+block('function bestCourseQuizAttempt','const gradeItems='),context);return context;
}
test('actual dashboard has independent quiz and assessment stars in RU, EN, ZH without changing course totals',async()=>{
  const valid={id:'receipt',activitySlug:'seminar-4-classroom',type:'legal-lab-practice',contentVersion:version,points:52,maxPoints:52,recordGrade:false};
  for(const locale of ['ru','en','zh']){
    const c=dashboard({attempts:[valid],grades:{'seminar-4':{points:5}},locale});await c.renderDashboard();const html=c.app.innerHTML;
    assert.match(html,/href="#activity\/seminar-4\/quiz"/);assert.match(html,/href="#activity\/seminar-4\/assessment"/);assert.equal((html.match(/class="activity-mini /g)||[]).length,3);
    assert.match(html,/52\/52.*?achievement-star/);assert.match(html,/5\/5.*?achievement-star/);assert.match(html,/<strong>5<\/strong>/);assert.match(html,/5\/80/);assert.match(html,/1\/16/);
    assert.ok(html.includes(({ru:'Квиз: нормативные правовые акты',en:'Quiz: regulatory legal acts',zh:'测验：规范性法律文件'})[locale]));
  }
  for(const bad of [{...valid,recordGrade:true},{...valid,type:'quiz'},{...valid,contentVersion:'old'},{...valid,points:51},{...valid,maxPoints:5},{...valid,activitySlug:'seminar-4'}]){
    const c=dashboard({attempts:[bad],grades:{'seminar-4':{points:5}}});await c.renderDashboard();assert.match(c.app.innerHTML,/—\/52/);assert.equal((c.app.innerHTML.match(/class="achievement-star"/g)||[]).length,1);
  }
  const quizOnly=dashboard({attempts:[valid]});await quizOnly.renderDashboard();assert.match(quizOnly.app.innerHTML,/—\/5/);assert.equal((quizOnly.app.innerHTML.match(/class="achievement-star"/g)||[]).length,1);assert.match(quizOnly.app.innerHTML,/0\/80/);assert.match(quizOnly.app.innerHTML,/0\/16/);
});

test('actual route chain forwards quiz, assessment and bare resume without starting an assignment',async()=>{
  for(const [view,expected] of [['quiz','learn'],['assessment','assessment'],[undefined,undefined]]){
    const mounted=[],mount={isConnected:true,setAttribute(){}},context={
      data:{course:{topics:[legalTopic]}},seminarModule,seminarModuleForSlug,navigator:{},location:{hash:''},accessSnapshot:()=>({now:0,context:{startYear:2026,endYear:2027},overrides:{}}),topicGate:()=>({open:true}),accessAllowed:()=>true,
      attemptOwner:()=>owner,AbortController,app:{innerHTML:'',querySelector:()=>mount},currentCleanup:null,t:key=>key,backend:{},diagnostics:{record(){}},CONFIG:{rootPath:'synthetic'},groupOptions:()=>[],getLocale:()=> 'en',
      loadPlatform:async()=>({mountLegalLabInCourse:async(root,options)=>{mounted.push(options);return{destroy(){},flush(){}};}})};
    vm.createContext(context);vm.runInContext(block('async function renderActivity','function renderLecture')+block('async function renderSeminar','function seminarShell')+
      block('function renderSeminar4','function renderSeminar8').replace("import('../../apps/legal-lab/platform.mjs?v=1.0.0')",'loadPlatform()'),context);
    await context.renderActivity('seminar-4',view);await new Promise(resolve=>setImmediate(resolve));assert.equal(mounted.length,1);assert.equal(mounted[0].initialView,expected);assert.equal(mounted[0].owner,owner);
    assert.equal(mounted[0].diagnostics,context.diagnostics,'The shell passes its optional shared diagnostics service');await context.currentCleanup();
  }
});

test('actual platform forwards initial view and sends practice through real backend, preserving assessment proxy',async()=>{
  const source=await readFile(new URL('../site/apps/legal-lab/platform.mjs',import.meta.url),'utf8');
  for(const initialView of ['learn','assessment',undefined]){
    const f=fixture(),assessmentCalls=[],mounted=[],persist={load:async()=>null,conflicted:false,attemptId:'assessment-stable',saveAttempt:async attempt=>assessmentCalls.push(attempt),destroy(){}};
    const context={document:{createElement:()=>({})},fetch:async()=>({ok:true,json:async()=>({contentVersion:version})}),
      createLegalLabPersistence:()=>persist,legalLabAttemptForCourse:attempt=>attempt,mountLegalLab:async(root,options)=>{mounted.push(options);return{contentVersion:version};},FirebaseLive:class{},URL,crypto,console};
    vm.createContext(context);vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replaceAll('export ','').replaceAll('import.meta.url',"'https://synthetic.invalid/apps/legal-lab/platform.mjs'"),context);
    await context.mountLegalLabInCourse({replaceChildren(){}},{backend:f.backend,owner,contentVersion:version,initialView});
    assert.equal(mounted[0].initialView,initialView);await mounted[0].onPracticeComplete(payload());assert.equal(f.calls.length,1);assert.equal(assessmentCalls.length,0);
    await mounted[0].backend.saveAttempt({id:'assessment-stable',type:'legal-lab'});assert.equal(assessmentCalls.length,1);assert.equal(f.calls.length,1);
  }
});
