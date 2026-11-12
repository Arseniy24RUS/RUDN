#!/usr/bin/env node
/** Exhaustive private bank exercise: every authored scenario/date pack/language. */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createReceptionService} from '../firebase/functions/reception-ai/service.mjs';
import {createMemoryStore} from '../firebase/functions/reception-ai/store.mjs';
import {validateCase,evaluateDecision,actorCase} from '../firebase/functions/reception-ai/schema.mjs';
import {selectShiftCases} from '../firebase/functions/reception-ai/selection.mjs';
import {canonicalDecision,dossierVariants} from './reception-ai-qa-helpers.mjs';
const args=process.argv.slice(2),directory=args[args.indexOf('--cases')+1];
if(!args.includes('--cases')||!directory)throw Error('Usage: node scripts/test-reception-ai-cases.mjs --cases /path/private-data/cases');
const cases=await Promise.all((await readdir(directory)).filter(x=>x.endsWith('.json')).sort().map(async name=>{
  try{return validateCase(JSON.parse(await readFile(path.join(directory,name),'utf8')));}catch(error){throw Error('Invalid dossier: '+name,{cause:error});}
}));
assert.ok(cases.length>=8);const fullBank=cases.some(c=>c.rubric.authored);
if(fullBank){assert.equal(cases.length,178,'The complete source bank contains178 scenarios');assert.ok(cases.every(c=>c.rubric.authored&&c.dateVariants?.length===1));}
let calls=0;
const provider={name:'mock',async generate({actorCase:c}){calls++;return {reply:'Материалы по обращению переданы.',revealedFactIds:c.facts.map(f=>f.id),releasedDocumentIds:c.documents.map(d=>d.id),usage:{inputTokens:0,outputTokens:0}};}};
const report=[],negative={extraEvidence:0,wrongBinding:0,wrongExtraction:0,wrongOrder:0,critical:0,alternativePlans:0};
function pureChecks(c,decision){
  const state={knownFactIds:c.facts.map(f=>f.id),openedDocumentIds:c.documents.map(d=>d.id),followupChoiceId:c.followup?.correct};
  const score=evaluateDecision(c,state,decision);assert.equal(score.score,100,c.id+'/'+c.datePackId);
  if(!c.rubric.authored)return;
  const a=c.rubric.authored;
  for(const plan of a.decisionPlans){assert.equal(evaluateDecision(c,state,canonicalDecision(c,{planId:plan.id})).score,100);negative.alternativePlans++;}
  const extra=c.documents.find(d=>!decision.basisDocumentIds.includes(d.id));
  if(extra){const bad=structuredClone(decision);bad.basisDocumentIds.push(extra.id);if(!a.evidenceSets.some(set=>set.length===bad.basisDocumentIds.length&&set.every(id=>bad.basisDocumentIds.includes(id)))){assert.equal(evaluateDecision(c,state,bad).criteria.find(x=>x.id==='facts').earned,10);negative.extraEvidence++;}}
  const unbound=c.public.assessment.research.records.flatMap(record=>record.fragments.map(fragment=>({recordId:record.id,fragmentId:fragment.id}))).find(b=>!a.research.bindings.some(row=>row.recordId===b.recordId&&row.fragmentId===b.fragmentId));
  if(unbound){const bad=structuredClone(decision);Object.assign(bad.assessment.research,unbound);assert.equal(evaluateDecision(c,state,bad).criteria.find(x=>x.id==='research').earned,8);negative.wrongBinding++;}
  {const bad=structuredClone(decision);bad.assessment.research.extracted='QA incorrect extracted value';assert.equal(evaluateDecision(c,state,bad).criteria.find(x=>x.id==='research').earned,16);negative.wrongExtraction++;}
  const plan=a.decisionPlans.find(p=>p.routes.includes(decision.routeId)),edges=plan?.order||a.order;
  if(edges.length){const bad=structuredClone(decision);bad.actionIds.reverse();assert.equal(evaluateDecision(c,state,bad).score,98);negative.wrongOrder++;}
  for(const rule of a.criticalRules){const bad=structuredClone(decision);bad.actionIds=rule.kind==='selected'?[...new Set([...bad.actionIds,rule.id])]:bad.actionIds.filter(id=>id!==rule.id);assert.ok(evaluateDecision(c,state,bad).criticalIds.includes(rule.id));negative.critical++;}
}
async function finishCase(service,identity,view,c,{independent=false}={}){
  const call=async body=>(await service.handle(body,identity)).view;
  for(const forbidden of ['rubric','facts','actor','knownFactIds','provenance','dateVariants'])assert.equal(Object.hasOwn(view,forbidden),false);
  for(const forbidden of ['rubric','facts','actor','provenance','dateVariants'])assert.equal(Object.hasOwn(view.case,forbidden),false);
  const context=actorCase(c,view.locale);for(const forbidden of ['rubric','assessment','followup','provenance','dateVariants'])assert.equal(Object.hasOwn(context,forbidden),false);
  view=await call({op:'message',sessionId:view.id,text:'Покажите материалы обращения.',requestId:'m-'+view.caseIndex,expectedRevision:view.revision});
  assert.equal(view.documents.length,c.documents.length,c.id+' document release');
  for(const doc of view.documents)view=await call({op:'document',sessionId:view.id,documentId:doc.id,requestId:'doc-'+view.caseIndex+'-'+doc.id});
  const decision=canonicalDecision(c);
  view=await call({op:'decide',sessionId:view.id,decision,requestId:'d-'+view.caseIndex});
  if(c.followup){assert.equal(view.status,'followup');assert.equal(view.feedback,null);assert.deepEqual(Object.keys(view.followup).sort(),['intro','options']);view=await call({op:'followup',sessionId:view.id,choiceId:c.followup.correct,requestId:'f-'+view.caseIndex});}
  assert.equal(view.status,'review');if(independent)assert.equal(view.feedback,null);else assert.equal(view.feedback.score,100,c.id);
  return call({op:'next',sessionId:view.id,requestId:'n-'+view.caseIndex});
}
for(const locale of ['ru','en','zh']){
  let completed=0;
  for(const original of cases)for(const c of dossierVariants(original)){
    const service=createReceptionService({store:createMemoryStore(),cases:[c],provider}),identity={uid:'case-qa',studentKey:'case-qa'};
    let view=(await service.handle({op:'start',mode:'training',locale,caseId:c.id,requestId:'start'},identity)).view;
    assert.equal(view.case.opening,c.public.opening[locale]);assert.equal(view.caseCount,1);assert.equal(view.feedback,null);
    if(locale==='ru')pureChecks(c,canonicalDecision(c));
    view=await finishCase(service,identity,view,c);assert.equal(view.status,'complete');assert.equal(view.result.points,5);assert.equal(view.result.journalStatus,'local');completed++;
  }
  report.push({locale,completed,canonicalPoints:5});
}
const store=createMemoryStore(),service=createReceptionService({store,cases,provider}),identity={uid:'independent-qa',studentKey:'independent-qa'};
let view=(await service.handle({op:'start',mode:'independent',locale:'ru',requestId:'independent'},identity)).view;
const snapshot=(await store.get('sessions/'+view.id)).caseData;assert.equal(snapshot.length,8);assert.equal(new Set(snapshot.map(c=>c.familyId||c.id)).size,8);assert.ok(snapshot.every(c=>!c.dateVariants));
for(const c of snapshot)view=await finishCase(service,identity,view,c,{independent:true});
assert.equal(view.status,'complete');assert.equal(view.result.points,5);assert.equal(view.result.cases.length,8);assert.ok(view.result.cases.every(c=>c.score===100));
const reached=new Set();for(let seed=0;seed<1000;seed++)for(const c of selectShiftCases(cases,'qa-coverage-'+seed))reached.add(c.id+'/'+(c.datePackId||'default'));
const variants=cases.flatMap(dossierVariants);for(const c of variants)assert.ok(reached.has(c.id+'/'+(c.datePackId||'default')),'Unreached '+c.id+'/'+c.datePackId);
console.log(JSON.stringify({status:'PASS',scenarios:cases.length,families:new Set(cases.map(c=>c.familyId||c.id)).size,dateVariants:variants.length,runs:report,exhaustiveRuns:report.reduce((n,r)=>n+r.completed,0),independentShift:8,selectionCoverage:reached.size,negativeControls:negative,mockProviderCalls:calls,note:'Canonical fixture checks authored state, references, grading and localization; no model or Firebase requests.'},null,2));
