import test from 'node:test';
import assert from 'node:assert/strict';
import {FIVE_MODE,chooseFiveVariant,quizComplete,scoreFiveAssessment} from '../site/apps/legal-lab/lib/assessment-five.mjs';
import {parseDossierAnswer,scoreDossier,SCAN_METADATA_MODE} from '../site/apps/legal-lab/lib/core.mjs';

const scans=[{id:'assessment-scan',hotspots:[{id:'issuer',label:'Орган'},{id:'date',label:'Дата'}]}];
const docs=[{id:'act',units:[{id:'u1'},{id:'u2'},{id:'u3'},{id:'u4'}],aliases:{first:['u1']},sections:[]}];
const item={id:'F01',format:FIVE_MODE,tasks:[
  {id:'FS',kind:'scan',scanId:'assessment-scan',answer:'issuer'},
  {id:'FT',kind:'type',scanId:'type-scan',answer:'Указ'},
  ...[1,2,3].map(n=>({id:'FQ'+n,kind:'text',docId:'act',answerSets:[[n===1?'first':'u'+n]]}))
]};
const answer=()=>({assessmentMode:FIVE_MODE,tasks:{FS:{metadataMode:SCAN_METADATA_MODE,scanId:'assessment-scan',metadata:{issuer:'issuer',date:'date'}},FT:{type:'Указ'},FQ1:{docId:'act',selections:['u1']},FQ2:{docId:'act',selections:['u2']},FQ3:{docId:'act',selections:['u3']}}});

test('five ordinary tasks give exactly five independently visible criteria',()=>{
  const before=structuredClone({item,scans,docs}),a=answer();
  assert.deepEqual(scoreDossier(item,a,scans,docs),scoreFiveAssessment(item,a,scans,docs));
  const scored=scoreDossier(item,a,scans,docs);assert.equal(scored.points,5);assert.equal(scored.maxPoints,5);assert.equal(scored.criteria.length,5);assert.ok(scored.criteria.every(c=>c.points===1&&c.max===1));
  assert.deepEqual({item,scans,docs},before);assert.deepEqual(a,answer());
});
test('scan assesses all requisites and text penalises extra/foreign paragraphs',()=>{
  const a=answer();a.tasks.FS.metadata.date='issuer';a.tasks.FT.type='Приказ';a.tasks.FQ1.selections=['u1','u4'];a.tasks.FQ2.docId='foreign';a.tasks.FQ3.selections=['unknown'];
  const result=scoreDossier(item,a,scans,docs);assert.equal(result.points,1);assert.deepEqual(result.criteria.map(c=>c.points),[0.5,0,0.5,0,0]);
  const foreignDoc={id:'foreign',units:[{id:'u999'}],aliases:{first:['u999']},sections:[]};const borrowed=answer();borrowed.tasks.FQ1.selections=['u999'];assert.equal(scoreDossier(item,borrowed,scans,[...docs,foreignDoc]).criteria[2].points,0);
  assert.equal(scoreDossier(item,answer(),scans,[]).points,2);
});
test('single-field legacy scans cannot earn a five-task scan point',()=>{
  const a=answer();a.tasks.FS={hotspot:'issuer'};assert.equal(scoreDossier(item,a,scans,docs).criteria[0].points,0);
  a.tasks.FS={...answer().tasks.FS,scanId:'another'};assert.equal(scoreDossier(item,a,scans,docs).criteria[0].points,0);
});
test('report decoder retains new answers while legacy shape and absent markers remain exact',()=>{
  const a=answer();assert.deepEqual(parseDossierAnswer({answerJson:JSON.stringify(a)}),a);
  const raw={...a,tasks:{...a.tasks,FS:{...a.tasks.FS,submitted:true,cursor:3}}};assert.deepEqual(parseDossierAnswer({answer:raw}),a);
  assert.deepEqual(parseDossierAnswer({answer:{metadata:{issuer:'date'}}}),{metadata:{issuer:'date'},classifications:{},documentIds:[],selections:[]});
  for(const invalid of [{...a,assessmentMode:'future'}, {...a,tasks:[]},{...a,tasks:{bad:{metadataMode:'future'}}},{...a,tasks:{bad:{selections:['x'.repeat(201)]}}},{...a,tasks:Object.fromEntries(Array.from({length:6},(_,i)=>['t'+i,{}]))}])assert.throws(()=>parseDossierAnswer({answer:invalid}),TypeError);
  assert.throws(()=>scoreDossier(item,{metadata:{}},scans,docs),TypeError);
  assert.throws(()=>scoreDossier({...item,format:'unknown'},a,scans,docs),TypeError);
  assert.throws(()=>scoreDossier(item,{...a,tasks:{stranger:{}}},scans,docs),TypeError);
});
test('quiz gate opens after every submitted answer even when every answer is wrong',()=>{
  const bank={classroom:Array.from({length:52},(_,i)=>({id:'q'+i}))};const state={answers:Object.fromEntries(bank.classroom.map(task=>[task.id,{submitted:true,correct:false,type:'wrong'}]))};
  assert.equal(quizComplete(bank,state),true);state.answers.q51.submitted=false;assert.equal(quizComplete(bank,state),false);delete state.answers.q51;assert.equal(quizComplete(bank,state),false);assert.equal(quizComplete({classroom:[]},state),false);
});
test('new variants avoid used choices, then exclude the immediate previous variant',()=>{
  const variants=['F1','F2','F3'].map(id=>({...item,id}));
  assert.equal(chooseFiveVariant(variants,[],()=>2).id,'F3');
  assert.equal(chooseFiveVariant(variants,['F2','F1'],()=>0).id,'F3');
  assert.equal(chooseFiveVariant(variants,['F2','F1','F3'],()=>1).id,'F2');
  assert.equal(chooseFiveVariant(variants,['F2','F1','F3','F2','F1'],()=>0).id,'F3','Every subsequent cycle also visits all variants');
  assert.equal(chooseFiveVariant([variants[0]],['F1'],()=>0).id,'F1');
  for(const pick of [()=>-1,()=>3,()=>0.5])assert.throws(()=>chooseFiveVariant(variants,[],pick),RangeError);
});

test('a profile first assignment is stable across devices, while retries draw fresh unused variants',()=>{
 const variants=Array.from({length:19},(_,i)=>({...item,id:'F'+i})),seed='synthetic-student|2026-autumn|seminar-4';
 const firstDevice=chooseFiveVariant(variants,[],()=>0,seed),secondDevice=chooseFiveVariant(variants,[],()=>18,seed);
 assert.equal(firstDevice.id,secondDevice.id,'Independent first-device random sources cannot choose different initial work');
 assert.equal(chooseFiveVariant(variants,['A24'],()=>0,seed).id,firstDevice.id,'Preserved legacy reports do not change the first new-format assignment');
 const retryA=chooseFiveVariant(variants,[firstDevice.id],()=>0,seed),retryB=chooseFiveVariant(variants,[firstDevice.id],()=>17,seed);
 assert.notEqual(retryA.id,firstDevice.id);assert.notEqual(retryB.id,firstDevice.id);assert.notEqual(retryA.id,retryB.id,'A restart uses randomness rather than a fixed profile sequence');
 const assignments=new Set(Array.from({length:100},(_,i)=>chooseFiveVariant(variants,[],()=>0,'synthetic-profile-'+i).id));assert.ok(assignments.size>1,'Different profiles do not all receive a single shared variant');
});
