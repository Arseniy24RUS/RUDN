import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceptionService} from './service.mjs';
import {createMemoryStore} from './store.mjs';
import {createSyntheticReceptionCases} from '../../../scripts/reception-ai-qa-cases.mjs';

test('a restarted backend enriches the next turn without changing the active build or saved conversation',async()=>{
  const c=createSyntheticReceptionCases().find(c=>c.id==='budget');
  const store=createMemoryStore(),captured=[],identity={uid:'local-seamless-qa',studentKey:'900000000001'};
  const buildId='a'.repeat(32);
  const provider={name:'mock',generate:async({actorCase})=>{
    captured.push(actorCase);
    return {reply:'Мне нужны документы по моему вопросу.',revealedFactIds:[],releasedDocumentIds:[],usage:{inputTokens:0,outputTokens:0}};
  }};
  const make=()=>createReceptionService({store,cases:[c],provider,config:{enforceMonetaryBudgets:false}});
  let service=make();
  let view=(await service.handle({op:'start',mode:'training',locale:'ru',buildId,requestId:'start'},identity)).view;
  view=(await service.handle({op:'message',sessionId:view.id,expectedRevision:view.revision,requestId:'before-restart',text:'Какая у вас цель?'},identity)).view;
  const before=structuredClone(await store.get('sessions/'+view.id));
  service=make();
  const recovered=(await service.handle({op:'resume',sessionId:view.id,buildId},identity)).view;
  assert.equal(recovered.id,view.id);assert.equal(recovered.buildId,buildId);
  assert.deepEqual(await store.get('sessions/'+view.id),before);
  const after=(await service.handle({op:'message',sessionId:view.id,expectedRevision:recovered.revision,requestId:'after-restart',text:'А что было раньше?'},identity)).view;
  const saved=await store.get('sessions/'+view.id);
  assert.equal(after.id,view.id);assert.equal(after.buildId,buildId);assert.equal(after.status,'active');
  assert.deepEqual(saved.caseData,before.caseData);assert.deepEqual(saved.results,before.results);
  assert.deepEqual(saved.caseStates[0].messages.slice(0,before.caseStates[0].messages.length),before.caseStates[0].messages);
  assert.equal(saved.caseStates[0].turns,before.caseStates[0].turns+1);
  assert.equal(captured.at(-1).participantContext.conversationalBackground.evidentiary,false);
  assert.ok(captured.at(-1).participantContext.conversationalBackground.priorContact);
});
