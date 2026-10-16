import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SCAN_METADATA_MODE, scanQuestionsFor, dossierScanQuestions, normalizeScanSelections,
  gradeTask, scoreDossier, parseDossierAnswer, expandIds, summarizeProgress, round
} from '../site/apps/legal-lab/lib/core.mjs';

const base=new URL('../site/apps/legal-lab/data/',import.meta.url);
const read=path=>JSON.parse(fs.readFileSync(new URL(path,base),'utf8'));
const catalog=read('catalog.json'),bank=read('bank.json'),cases=read('cases.json'),scans=read('scans.json');
const docs=catalog.documents.map(d=>read(d.file));
const scanTasks=bank.classroom.filter(t=>t.kind==='scan');
const blank=()=>({metadata:{},classifications:{},documentIds:[],selections:[]});
const full=(item,all=false)=>({
  ...(all?{metadataMode:SCAN_METADATA_MODE}:{}),
  metadata:Object.fromEntries((all?scans.find(s=>s.id===item.scanId).hotspots.map(h=>h.id):item.scanQuestions.map(q=>q.field)).map(id=>[id,id])),
  classifications:Object.fromEntries(item.classificationIds.map(id=>[id,scans.find(s=>s.id===id).actType])),
  documentIds:[...item.docIds],selections:expandIds(item.answerSets[0],docs)
});

test('all 24 legacy dossiers retain five points and their original three-field rubric',()=>{
  assert.equal(cases.length,24);
  for(const item of cases){
    const answer=full(item),snapshot=structuredClone(answer);
    const parsed=parseDossierAnswer({answerJson:JSON.stringify(answer)});
    assert.equal(scoreDossier(item,parsed,scans,docs).points,5,item.id);
    assert.equal(dossierScanQuestions(item,parsed,scans).length,3,item.id);
    assert.equal(Object.hasOwn(parsed,'metadataMode'),false,item.id);
    assert.deepEqual(answer,snapshot);
  }
});

test('all 24 new dossiers require every hotspot and keep the four criterion weights',()=>{
  for(const item of cases){
    const answer=full(item,true),result=scoreDossier(item,answer,scans,docs);
    assert.equal(result.points,5,item.id);assert.equal(result.maxPoints,5);
    assert.deepEqual(result.criteria.map(c=>[c.id,c.max,c.points]),[
      ['metadata',1,1],['classification',1,1],['document',1,1],['evidence',2,2]
    ]);
    assert.equal(dossierScanQuestions(item,answer,scans).length,scans.find(s=>s.id===item.scanId).hotspots.length);
    const oldFields=full(item);oldFields.metadataMode=SCAN_METADATA_MODE;
    assert.ok(scoreDossier(item,oldFields,scans,docs).criteria[0].points<1,item.id);
  }
});

test('empty new dossiers and RTDB-removed empty structures score zero',()=>{
  for(const item of cases){
    for(const envelope of [
      {answer:{metadataMode:SCAN_METADATA_MODE}},
      {answer:{metadataMode:SCAN_METADATA_MODE,metadata:null,classifications:null,documentIds:null,selections:null}},
      {answerJson:JSON.stringify({...blank(),metadataMode:SCAN_METADATA_MODE})}
    ]){
      const answer=parseDossierAnswer(envelope);
      assert.deepEqual(answer,{...blank(),metadataMode:SCAN_METADATA_MODE});
      assert.equal(scoreDossier(item,answer,scans,docs).points,0,item.id);
    }
    assert.equal(scoreDossier(item,parseDossierAnswer({}),scans,docs).points,0,item.id);
  }
});

test('a wrong new requisite loses only its equal share of the one-point metadata criterion',()=>{
  for(const item of cases){
    const answer=full(item,true),fields=Object.keys(answer.metadata),original=scoreDossier(item,answer,scans,docs);
    answer.metadata[fields[0]]=fields[1];
    const result=scoreDossier(item,answer,scans,docs);
    assert.equal(result.criteria[0].points,round((fields.length-1)/fields.length),item.id);
    assert.deepEqual(result.criteria.slice(1),original.criteria.slice(1));
    assert.ok(result.points<5&&result.points>4,item.id);
  }
});

test('unknown or scalar rubric markers reject before they can choose an easier rubric',()=>{
  for(const marker of [null,false,0,1,{},[],['all-hotspots-v1'],'legacy','', 'all-hotspots-v2']){
    const answer={...full(cases[0]),metadataMode:marker};
    assert.throws(()=>parseDossierAnswer({answerJson:JSON.stringify(answer)}),TypeError);
    assert.throws(()=>scoreDossier(cases[0],answer,scans,docs),TypeError);
    assert.throws(()=>gradeTask(scanTasks[0],{metadataMode:marker,hotspot:scanTasks[0].answer},docs,scans),TypeError);
    assert.throws(()=>normalizeScanSelections(scanTasks[0],{metadataMode:marker},scans),TypeError);
  }
});

test('new rubrics fail closed when their scan is missing or has zero requisites',()=>{
  const item=cases[0],task=scanTasks[0];
  for(const damaged of [[],[{id:item.scanId,hotspots:[]}],scans.map(s=>({...s,hotspots:[]}))]){
    assert.throws(()=>scoreDossier(item,full(item,true),damaged,docs),TypeError);
  }
  assert.throws(()=>gradeTask(task,{metadataMode:SCAN_METADATA_MODE},docs),TypeError);
  assert.throws(()=>gradeTask(task,{metadataMode:SCAN_METADATA_MODE},docs,[{id:task.scanId,hotspots:[]}]),TypeError);
  assert.throws(()=>scanQuestionsFor({hotspots:[{id:'date'},{id:'date'}]}),TypeError);
});

test('every learning scan needs all selections: one old correct answer is only partial after upgrade',()=>{
  assert.equal(scanTasks.length,6);
  assert.equal(bank.classroom.length,52);
  for(const task of scanTasks){
    const original={hotspot:task.answer,submitted:true};
    assert.equal(gradeTask(task,original,docs).fraction,1,task.id);
    const answer={...original,metadataMode:SCAN_METADATA_MODE,metadata:normalizeScanSelections(task,original,scans),submitted:false};
    const result=gradeTask(task,answer,docs,scans),scan=scans.find(s=>s.id===task.scanId);
    assert.equal(result.fraction,1/scan.hotspots.length,task.id);assert.equal(result.exact,false,task.id);
    for(const h of scan.hotspots)answer.metadata[h.id]=h.id;
    assert.deepEqual(gradeTask(task,answer,docs,scans),{fraction:1,exact:true},task.id);
    answer.metadata[scan.hotspots[0].id]=scan.hotspots[1].id;
    assert.equal(gradeTask(task,answer,docs,scans).exact,false,task.id);
    assert.equal(gradeTask(task,{metadataMode:SCAN_METADATA_MODE,hotspot:task.answer},docs,scans).fraction,0,task.id);
    assert.deepEqual(original,{hotspot:task.answer,submitted:true});
  }
});

test('legacy restoration preserves a wrong valid click for only its original field',()=>{
  for(const task of scanTasks){
    const scan=scans.find(s=>s.id===task.scanId),wrong=scan.hotspots.find(h=>h.id!==task.answer).id;
    const original={hotspot:wrong,submitted:true};
    const metadata=normalizeScanSelections(task,original,scans);
    assert.deepEqual(metadata,{[task.answer]:wrong});
    assert.equal(gradeTask(task,{metadataMode:SCAN_METADATA_MODE,metadata},docs,scans).fraction,0);
    assert.deepEqual(normalizeScanSelections(task,{hotspot:'not-on-this-scan'},scans),{});
  }
});

test('scan normalization rejects unsafe entries without overwriting an existing valid choice',()=>{
  const task=scanTasks[0],scan=scans.find(s=>s.id===task.scanId),other=scan.hotspots.find(h=>h.id!==task.answer).id;
  const metadata=Object.assign(Object.create({[other]:other}),{
    [task.answer]:other,unknown:'unknown',[scan.hotspots[2].id]:{},[scan.hotspots[3].id]:'not-a-hotspot'
  });
  const answer={metadataMode:SCAN_METADATA_MODE,metadata,hotspot:task.answer};
  assert.deepEqual(normalizeScanSelections(task,answer,scans),{[task.answer]:other});
  assert.deepEqual(normalizeScanSelections(task,{metadata:'invalid'},scans),{});
  assert.deepEqual(normalizeScanSelections(task,{metadataMode:SCAN_METADATA_MODE,metadata:{},hotspot:task.answer},scans),{},'a cleared current field must not resurrect a stale legacy click');
  assert.equal(gradeTask(task,{metadataMode:SCAN_METADATA_MODE,metadata:Object.create(Object.fromEntries(scan.hotspots.map(h=>[h.id,h.id])))},docs,scans).fraction,0);
});

test('field prompts enumerate exactly the source hotspots, including special requisite types',()=>{
  const ids=new Set();
  for(const task of scanTasks){
    const scan=scans.find(s=>s.id===task.scanId),questions=scanQuestionsFor(scan);
    assert.equal(questions.length,scan.hotspots.length);
    for(const question of questions){ids.add(question.field);assert.equal(question.prompt,scan.hotspots.find(h=>h.id===question.field).label);}
  }
  for(const field of ['registration','approved','agreed','acknowledgment','signature','type','title'])assert.ok(ids.has(field),field);
});

test('a completed legacy A11 receipt stays five points with its original attempt identity',()=>{
  const item=cases.find(c=>c.id==='A11');
  const receipt={id:'legacy-a11-attempt',caseId:'A11',points:5,maxPoints:5,phase:'completed',legalLab:{answer:full(item),answerJson:JSON.stringify(full(item))}};
  const snapshot=structuredClone(receipt),parsed=parseDossierAnswer(receipt.legalLab);
  assert.equal(scoreDossier(item,parsed,scans,docs).points,receipt.points);
  assert.equal(Object.hasOwn(parsed,'metadataMode'),false);
  assert.deepEqual(receipt,snapshot);
});

test('new and old JSON answers are stable across repeated decoding and copying',()=>{
  for(const item of cases)for(const all of [false,true]){
    const answer=full(item,all);
    const first=parseDossierAnswer({answerJson:JSON.stringify(answer)});
    const second=parseDossierAnswer({answerJson:JSON.stringify(first)});
    assert.deepEqual(second,answer);assert.deepEqual(parseDossierAnswer({answer:structuredClone(second)}),answer);
  }
  const task=scanTasks[0],answer={hotspot:task.answer};
  const first=normalizeScanSelections(task,answer,scans);
  assert.deepEqual(normalizeScanSelections(task,{...answer,metadataMode:SCAN_METADATA_MODE,metadata:JSON.parse(JSON.stringify(first))},scans),first);
});

test('scalar and structured field values cannot masquerade as report selections',()=>{
  for(const answer of [0,false,'issuer',[],{metadata:false},{metadata:['issuer']},{metadata:{issuer:{toString:'issuer'}}},{classifications:{'slide-41-2':[]}}]){
    assert.throws(()=>parseDossierAnswer({answer}),TypeError);
  }
  assert.throws(()=>parseDossierAnswer({answerJson:'{"selections":[{}]}'}),TypeError);
  assert.throws(()=>parseDossierAnswer({answerJson:'{"documentIds":"constitution"}'}),TypeError);
});

test('new metadata cannot alter classification, source selection, or legal evidence credit',()=>{
  const item=cases[0],legacy=full(item),current=full(item,true);
  for(const answer of [legacy,current]){
    answer.classifications={};answer.documentIds=[];
    const result=scoreDossier(item,answer,scans,docs);
    assert.equal(result.criteria[1].points,0);assert.equal(result.criteria[2].points,0);assert.equal(result.criteria[3].points,0);
    assert.equal(result.points,1);
  }
});

test('progress aggregates new scan answers using the same all-requisites grading',()=>{
  const task=scanTasks[0],scan=scans.find(s=>s.id===task.scanId);
  const answer={metadataMode:SCAN_METADATA_MODE,metadata:{[task.answer]:task.answer},submitted:true};
  assert.deepEqual(summarizeProgress({classroom:[task]},{[task.id]:answer},docs,scans),{done:1,total:1,correct:0});
  answer.metadata=Object.fromEntries(scan.hotspots.map(h=>[h.id,h.id]));
  assert.deepEqual(summarizeProgress({classroom:[task]},{[task.id]:answer},docs,scans),{done:1,total:1,correct:1});
});
