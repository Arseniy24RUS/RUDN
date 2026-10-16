import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EVIDENCE_MODE,gradeEvidence,gradeTask,scoreDossier,expandIds,selectionLimit,parseDossierAnswer,dossierScanQuestions,escapeHTML} from '../site/apps/legal-lab/lib/core.mjs';
import {canonicalArticleSelections} from '../site/apps/legal-lab/lib/article-evidence.mjs';
import {labelForUnit} from '../site/apps/legal-lab/lib/reader-tools.mjs';
import {documentDisplay,displayLabel} from '../site/apps/legal-lab/lib/translation-ui.mjs';
const data=new URL('../site/apps/legal-lab/data/',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,data),'utf8'));
const [catalog,bank,cases,scans]=await Promise.all(['catalog.json','bank.json','cases.json','scans.json'].map(json));
const docs=await Promise.all(catalog.documents.map(d=>json(d.file)));
const q=id=>bank.classroom.find(t=>t.id===id);
const c10h='constitution-uef487aaa43bb47e948-1',c10b='constitution-u9a351be5af65a89019-1',c132h='constitution-ub5e150c7a74ad063fc-1';
const k22h='koap-u5fece65c704862a2ee-1',k22h2='koap-u0df14950d0a61d3625-1',k22a='koap-ue507d7f65fc906384d-1',k22b='koap-u60461f909b6f39079e-1';
// Call public domain functions directly: no helper/precanonicalization can hide a missed integration.
test('gradeTask accepts Q01 heading/body and Q05 complete article but preserves required parts',()=>{
  for(const selections of [[c10h],[c10b],[c10h,c10b]])assert.equal(gradeTask(q('Q01'),{docId:'constitution',selections},docs).exact,true);
  for(const selections of [[k22h],[k22h2],[k22h,k22h2],[k22a,k22b]])assert.equal(gradeTask(q('Q05'),{docId:'koap',selections},docs).exact,true);
  const partial=gradeTask(q('Q05'),{docId:'koap',selections:[k22a]},docs);assert.equal(partial.exact,false);assert.equal(partial.fraction,0.5);
  const broad=gradeTask(q('Q02'),{docId:'constitution',selections:[c132h]},docs);assert.equal(broad.exact,false);assert.equal(broad.matched,1);assert.equal(broad.extra,2);
  assert.equal(gradeTask(q('Q03'),{docId:'constitution',selections:[c132h]},docs).exact,false);
  assert.equal(gradeTask(q('Q01'),{docId:'koap',selections:[c10h]},docs).missingDocument,true);
});
test('gradeEvidence canonicalizes expected headings as well as selections without losing unknown/extra IDs',()=>{
  assert.equal(gradeEvidence([k22a,k22b],[[k22h]],docs).exact,true);
  assert.equal(gradeEvidence([k22h2],[[k22h]],docs).exact,true);
  assert.equal(gradeEvidence([k22a],[[k22h]],docs).missing,1);
  assert.equal(gradeEvidence([k22h,c10h],[[k22a,k22b]],docs).extra,1);
  assert.equal(gradeEvidence([c10h,'unknown'],[['c10']],docs).extra,1);
  assert.equal(gradeEvidence([],[[k22h]],docs).missing,2);
  const twoArticles=[[c10h,k22h]];assert.equal(gradeEvidence([c10b,k22a,k22b],twoArticles,docs).exact,true);assert.equal(gradeEvidence([c10h],twoArticles,docs).missing,2);
  assert.equal(selectionLimit({answerSets:[[c132h]],maxSelections:1},docs),5);
  const copy=structuredClone(docs.find(d=>d.id==='constitution'));copy.version='stale';assert.equal(gradeEvidence([c10h],[['c10']],[copy]).exact,false);
});
test('all 38 actual classroom answers retain full credit, incomplete lists and select-all retain penalties',()=>{
  let count=0;for(const task of bank.classroom.filter(t=>t.kind==='text')){count++;const selections=expandIds(task.answerSets[0],docs);assert.equal(gradeTask(task,{docId:task.docId,selections},docs).exact,true,task.id);
    const own=docs.find(d=>d.id===task.docId);assert.equal(gradeTask(task,{docId:task.docId,selections:own.units.map(u=>u.id)},docs).exact,false,task.id+' mark-all');
    if(selections.length>1)assert.equal(gradeTask(task,{docId:task.docId,selections:selections.slice(0,-1)},docs).exact,false,task.id+' missing unit');
  }assert.equal(count,38);
});
const fullAnswer=item=>({metadata:Object.fromEntries(item.scanQuestions.map(f=>[f.field,f.field])),classifications:Object.fromEntries(item.classificationIds.map(id=>[id,scans.find(s=>s.id===id).actType])),documentIds:item.docIds,selections:expandIds(item.answerSets[0],docs)});
test('all 24 canonical legacy dossiers retain five points and input objects are unchanged',()=>{
  for(const item of cases){const answer=fullAnswer(item),before=structuredClone(answer);assert.equal(scoreDossier(item,answer,scans,docs).points,5,item.id);assert.deepEqual(answer,before,item.id+' unchanged answer');}
});

test('legacy A01 report stays at three points while explicit new article mode earns partial evidence',()=>{
  const item=cases.find(c=>c.id==='A01'),answer={...fullAnswer(item),selections:['constitution-ua258597def4c307226-1']};
  const stored={caseId:item.id,points:3,maxPoints:5,legalLab:{answerJson:JSON.stringify(answer)}};const before=structuredClone(stored);
  const decoded=parseDossierAnswer(stored.legalLab);assert.equal(Object.hasOwn(decoded,'evidenceMode'),false);
  const legacyResult=scoreDossier(item,decoded,scans,docs);assert.equal(legacyResult.points,stored.points);assert.equal(legacyResult.criteria.find(c=>c.id==='evidence').points,0);assert.deepEqual(stored,before);
  const newAnswer={...answer,evidenceMode:EVIDENCE_MODE};const newDecoded=parseDossierAnswer({answerJson:JSON.stringify(newAnswer)});assert.equal(newDecoded.evidenceMode,'whole-article-v1');
  const currentResult=scoreDossier(item,newDecoded,scans,docs);assert.equal(currentResult.points,3.67);assert.equal(currentResult.criteria.find(c=>c.id==='evidence').points,0.67);assert.equal(legacyResult.points,3);
  assert.notEqual(currentResult.points,4,'A tampered new stored score still differs from actual grading');
  assert.equal(gradeEvidence([c10h],[['c10']],docs,{wholeArticles:false}).exact,false);
  assert.equal(gradeEvidence([c10b],[['c10']],docs,{wholeArticles:false}).exact,true);
});
test('mode parsing is explicit, preserves legacy shape and rejects unsupported evidence grading versions',()=>{
  const item=cases[0],legacy=fullAnswer(item);assert.deepEqual(parseDossierAnswer({answer:legacy}),legacy);
  const current={...legacy,evidenceMode:EVIDENCE_MODE};assert.deepEqual(parseDossierAnswer({answer:current}),current);
  for(const evidenceMode of ['unknown','',null,1,{},undefined]){
    const invalid={...legacy,evidenceMode};assert.throws(()=>parseDossierAnswer({answer:invalid}),TypeError);assert.throws(()=>scoreDossier(item,invalid,scans,docs),TypeError);
  }
});
test('new dossier mode preserves full canonical scores and document ownership checks',()=>{
  for(const item of cases){const answer={...fullAnswer(item),evidenceMode:EVIDENCE_MODE};assert.equal(scoreDossier(item,answer,scans,docs).points,5,item.id);}
  const item=cases.find(c=>c.id==='A01'),answer={...fullAnswer(item),evidenceMode:EVIDENCE_MODE,selections:['constitution-ua258597def4c307226-1',k22h]};
  const evidence=scoreDossier(item,answer,scans,docs).criteria.find(c=>c.id==='evidence');assert.equal(evidence.points,0);assert.equal(evidence.detail.sourceOK,false);
});

test('actual report method explains legacy and new heading selections using the same grading mode',async()=>{
  // This exercises the real string-rendering method only, not a browser/DOM simulation.
  // Dependencies and already-verified corpus are explicit; production source is unchanged.
  const entry=await readFile(new URL('../site/apps/legal-lab/entry.mjs',import.meta.url),'utf8');
  const start=entry.indexOf('  report(item,a,reportDocs=null){'),end=entry.indexOf('\n  help(){',start);assert.ok(start>=0&&end>start);
  const render=new Function('e','asset','dossierScanQuestions','gradeEvidence','expandIds','canonicalArticleSelections','labelForUnit','EVIDENCE_MODE','documentDisplay','displayLabel','return ({'+entry.slice(start,end)+'}).report;')(escapeHTML,value=>value,dossierScanQuestions,gradeEvidence,expandIds,canonicalArticleSelections,labelForUnit,EVIDENCE_MODE,documentDisplay,displayLabel);
  const app={corpus:{cache:new Map(docs.map(d=>[d.id,d]))},scans,reportOnly:true};
  const item=cases.find(c=>c.id==='A01'),legacy={...fullAnswer(item),selections:['constitution-ua258597def4c307226-1']};
  const report=answer=>{const result=scoreDossier(item,answer,scans,docs);return render.call(app,item,{caseId:item.id,answer,result:{...result,criteria:result.criteria.filter(c=>c.id==='evidence')},preview:false,delivery:'host-accepted'});};
  const before=structuredClone(legacy),oldHtml=report(legacy);assert.deepEqual(legacy,before);
  assert.equal((oldHtml.match(/>Совпало<\/p>/g)||[]).length,0);
  assert.equal((oldHtml.match(/>Лишний фрагмент<\/p>/g)||[]).length,1);
  assert.equal((oldHtml.match(/>Пропущенный фрагмент<\/p>/g)||[]).length,1);
  assert.doesNotMatch(oldHtml,/Ваш выбор в документе:/);
  const current={...legacy,evidenceMode:EVIDENCE_MODE},currentBefore=structuredClone(current),newHtml=report(current);assert.deepEqual(current,currentBefore);
  assert.equal((newHtml.match(/>Совпало<\/p>/g)||[]).length,2,'matched selected unit and expected unit agree');
  assert.equal((newHtml.match(/>Лишний фрагмент<\/p>/g)||[]).length,2);
  assert.equal((newHtml.match(/>Пропущенный фрагмент<\/p>/g)||[]).length,0);
  assert.match(newHtml,/Ваш выбор в документе:/);assert.match(newHtml,/Ст\.104/);assert.match(newHtml,/Совпало: 1; пропущено: 0; лишних: 2/);
});
