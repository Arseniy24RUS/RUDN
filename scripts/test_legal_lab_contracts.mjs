import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {seminarModule,seminarTopic,seminarModuleForSlug} from '../site/assets/js/seminar-modules.js';
import {createLegalLabPersistence,legalLabIdentity,legalLabState,legalLabAttemptForCourse} from '../site/assets/js/legal-lab-storage.js';
import {gameAccessGate} from '../site/assets/js/games-catalog.js';
import {parseDossierAnswer} from '../site/apps/legal-lab/lib/core.mjs';

const course=JSON.parse(await readFile(new URL('../site/data/course.json',import.meta.url),'utf8'));
const state=()=>({schema:1,id:'work-id',contentVersion:'legal-1',answers:{},reader:{},assessment:null,elapsedMs:0,index:0,view:'home',empty:[]});
function fixture({conflict=false,initial=null}={}) {
  let row=initial, listener=()=>{},writes=0;
  const loadDraft=async scope=>scope?.mode==='legal-lab-practice'?null:row;
  const store={loadDraft,listConflicts:async()=>conflict?[{id:'conflict',resolvedAt:null}]:[],subscribe:fn=>{listener=fn;return()=>{};}};
  const backend={generation:1,user:null,getProfile:()=>({studentKey:'test-a'}),loadDraft,
    checkpoint:async(input)=>{writes++;row={...input,id:'draft-id',revision:writes};return row;}};
  return {store,backend,get row(){return row;},get writes(){return writes;},notify:()=>listener({owner:'student:test-a'})};
}
test('Topic order changes display numbers while history follows stable seminar identities',()=>{
  assert.equal(seminarTopic(course,'career').number,5);
  assert.equal(seminarTopic(course,'career').seminar.slug,'seminar-6');
  assert.equal(seminarTopic(course,'reception').number,6);
  assert.equal(seminarTopic(course,'reception').seminar.slug,'seminar-5');
  assert.equal(seminarModuleForSlug(course,'seminar-4'),'legal-lab');
  for(const [module,n] of [['career',5],['reception',6]]) {
    const seminar=seminarTopic(course,module).seminar;
    assert.match(seminar.title,new RegExp(`Семинар ${n}\\.`));
    assert.match(seminar.title_en,new RegExp(`Seminar ${n}\\.`));
    assert.match(seminar.title_zh,new RegExp(`研讨课${n}`));
  }
  assert.equal(seminarModule({seminar:{slug:'seminar-6'}}),'career');
});
test('Legal Lab replaces the old activity within the unchanged course total',()=>{
  const legal=seminarTopic(course,'legal-lab');
  assert.equal(legal.seminar.slug,'seminar-4');assert.equal(legal.seminar.points,5);
  assert.equal(course.topics.reduce((n,t)=>n+t.seminar.points+t.lecture.points,0),80);
});

test('Free module access follows its semantic course topic after another reorder',()=>{
  const reordered=structuredClone(course);
  seminarTopic(reordered,'career').number=8;
  const backend={isAdmin:()=>false,getProfile:()=>({studentKey:'test'}),globalNow:()=>Date.parse('2026-09-19T12:00:00Z'),getAccessOverrides:()=>({'topic-8':'open','topic-5':'closed'})};
  assert.equal(gameAccessGate('career',backend,reordered).open,true);
  assert.equal(gameAccessGate('career',backend,course).open,false);
});
test('Two devices derive the same assessment identity, isolated by owner and period',()=>{
  const id=legalLabIdentity('student:a','2026-2027','legal-1');
  assert.deepEqual(id,legalLabIdentity('student:a','2026-2027','legal-1'));
  assert.notDeepEqual(id,legalLabIdentity('student:b','2026-2027','legal-1'));
  assert.notDeepEqual(id,legalLabIdentity('student:a','2027-2028','legal-1'));
  assert.doesNotMatch(id.workspaceId,/[.#$\[\]/]/);
});

test('Actual module numeric completion time becomes the same ISO timestamp on every delivery',()=>{
  const record={id:'one-dossier',type:'legal-lab',activitySlug:'seminar-4',startedAt:1792065600000,finishedAt:1792069200000,points:5,maxPoints:5};
  const first=legalLabAttemptForCourse(record),retry=legalLabAttemptForCourse(structuredClone(record));
  assert.equal(first.createdAt,new Date(record.finishedAt).toISOString());
  assert.deepEqual(first,retry);assert.equal(typeof first.createdAt,'string');
  assert.equal(record.createdAt,undefined);
  assert.throws(()=>legalLabAttemptForCourse({...record,finishedAt:NaN}));
});

test('A zero-point dossier survives RTDB removal of empty maps and arrays',()=>{
  const answer={metadata:{},classifications:{},documentIds:[],selections:[]};
  assert.deepEqual(parseDossierAnswer({answerJson:JSON.stringify(answer)}),answer);
  assert.deepEqual(parseDossierAnswer({}),answer);
  assert.throws(()=>parseDossierAnswer({answerJson:'{"documentIds":"<b>forged</b>"}'}));
  assert.throws(()=>parseDossierAnswer({answerJson:'{"selections":[{}]}'}));
});
test('Course checkpoints preserve empty objects and arrays across RTDB serialization',async()=>{
  const f=fixture(), p=createLegalLabPersistence({...f,owner:'student:test-a',period:'2026-2027',contentVersion:'legal-1'});
  assert.equal(await p.load(),null);
  const value=state();await p.checkpoint({state:value,contentVersion:'legal-1'});
  assert.equal(f.row.activitySlug,'seminar-4');assert.equal(f.row.mode,'legal-lab-workspace');
  assert.deepEqual(legalLabState(JSON.parse(JSON.stringify(f.row.state))),value);
  assert.equal(f.row.baseRevision,0);
  value.answers.Q1={selected:['unit-1']};await p.checkpoint({state:value,contentVersion:'legal-1'});
  assert.equal(f.row.baseRevision,1);await p.flush();p.destroy();
});
test('A restored workspace keeps the same unsubmitted answer and assigned dossier',async()=>{
  const value=state();value.assessment={caseId:'A03',attemptId:'stable-id',answer:{selections:['p1']}};
  const f=fixture({initial:{id:'draft-id',revision:7,state:{legalLab:JSON.stringify(value)}}});
  const p=createLegalLabPersistence({...f,owner:'student:test-a',period:'2026-2027',contentVersion:'legal-1'});
  assert.deepEqual(await p.load(),value);assert.equal(f.writes,0);p.destroy();
});
test('An identity change or content change cannot write into another profile',async()=>{
  const f=fixture(), p=createLegalLabPersistence({...f,owner:'student:test-a',period:'2026-2027',contentVersion:'legal-1'});
  await p.load();
  await assert.rejects(p.checkpoint({state:state(),contentVersion:'other-version'}),{code:'legal-lab/content-version-changed'});
  f.backend.generation++;
  await assert.rejects(p.checkpoint({state:state(),contentVersion:'legal-1'}),{code:'auth/profile-changed'});
  assert.equal(f.writes,0);p.destroy();
});
test('A retained conflict blocks new writes instead of silently overwriting a branch',async()=>{
  const value=state(), f=fixture({conflict:true,initial:{id:'draft-id',revision:1,state:{legalLab:JSON.stringify(value)}}});
  let notices=0;const p=createLegalLabPersistence({...f,owner:'student:test-a',period:'2026-2027',contentVersion:'legal-1',onConflict:()=>notices++});
  assert.deepEqual(await p.load(),value);assert.equal(p.conflicted,true);assert.equal(notices,1);
  await assert.rejects(p.checkpoint({state:value,contentVersion:'legal-1'}),{name:'DraftConflict'});
  assert.equal(f.writes,0);p.destroy();
});
