import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createSyntheticReceptionCases,writeSyntheticReceptionCases,SYNTHETIC_VERSION} from '../scripts/reception-ai-qa-cases.mjs';
import {canonicalDecision} from '../scripts/reception-ai-qa-helpers.mjs';
import {createReceptionService} from '../firebase/functions/reception-ai/service.mjs';
import {createMemoryStore} from '../firebase/functions/reception-ai/store.mjs';
import {validateCase} from '../firebase/functions/reception-ai/schema.mjs';

test('synthetic CI fixture covers the phone browser contract and a complete authored service lifecycle',async()=>{
  const cases=createSyntheticReceptionCases();assert.equal(cases.length,3);
  for(const c of cases){
    assert.equal(validateCase(c).version,SYNTHETIC_VERSION);
    assert.match(c.public.title.ru,/Синтетическая/);
    assert.ok(c.documents.some(document=>document.text.ru.length>20));
    assert.equal(c.public.sources[0].url,'https://www.consultant.ru/document/cons_doc_LAW_59999/');
    assert.ok((await stat(new URL('../site/apps/reception/'+c.public.citizen.portrait,import.meta.url))).isFile());
  }
  let calls=0;
  const provider={name:'mock',async generate({actorCase:c}){calls++;return{reply:'Передаю оба вымышленных тестовых документа.',revealedFactIds:c.facts.map(f=>f.id),releasedDocumentIds:c.documents.map(d=>d.id),usage:{inputTokens:0,outputTokens:0}};}};
  const service=createReceptionService({store:createMemoryStore(),cases,provider}),identity={uid:'synthetic-qa',studentKey:'synthetic-qa'};
  const catalog=await service.handle({op:'catalog',locale:'ru'},identity);
  assert.deepEqual(catalog.cases.map(c=>c.level),[1,2,3]);
  const call=async body=>(await service.handle(body,identity)).view;
  let view=await call({op:'start',requestId:'synthetic-start',mode:'training',locale:'ru',caseId:'complaint-routing',level:3});
  assert.equal(view.case.id,'complaint-routing');assert.equal(view.messages.length,1);assert.equal(view.documents.length,0);
  assert.doesNotMatch(JSON.stringify(view),/qa-plan|criticalRules|evidenceSets|"rubric"/);
  view=await call({op:'message',sessionId:view.id,requestId:'synthetic-message',text:'Покажите тестовые документы',expectedRevision:view.revision});
  assert.equal(view.documents.length,2);assert.equal(view.messages.length,3);
  const c=cases.find(c=>c.id===view.case.id),decision=canonicalDecision(c);
  for(const id of decision.basisDocumentIds)view=await call({op:'document',sessionId:view.id,requestId:'open-'+id,documentId:id});
  view=await call({op:'decide',sessionId:view.id,requestId:'synthetic-decision',decision});
  assert.equal(view.status,'followup');assert.equal(view.feedback,null);
  view=await call({op:'followup',sessionId:view.id,requestId:'synthetic-followup',choiceId:c.followup.correct});
  assert.equal(view.status,'review');assert.equal(view.feedback.score,100);
  view=await call({op:'next',sessionId:view.id,requestId:'synthetic-finish'});
  assert.equal(view.status,'complete');assert.equal(view.result.points,5);assert.equal(calls,1);
});

test('synthetic files are reproducible and cannot overwrite different dossiers or enter the public site',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'reception-synthetic-test-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  assert.equal((await writeSyntheticReceptionCases(directory)).caseCount,3);
  assert.equal((await readdir(directory)).filter(name=>name.endsWith('.json')).length,3);
  await writeSyntheticReceptionCases(directory);
  const target=path.join(directory,'complaint-routing.json'),preserved='{"preserve":"different dossier"}\n';
  await writeFile(target,preserved);
  await assert.rejects(writeSyntheticReceptionCases(directory),/Refusing to overwrite different data/);
  assert.equal(await readFile(target,'utf8'),preserved);
  await assert.rejects(writeSyntheticReceptionCases(fileURLToPath(new URL('../site/synthetic-qa-not-public',import.meta.url))),/outside the publicly served site/);
});
