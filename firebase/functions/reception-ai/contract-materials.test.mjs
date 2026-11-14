import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConflictContractMaterials} from './contract-materials.mjs';
import {createReceptionService} from './service.mjs';
import {createMemoryStore} from './store.mjs';
import {buildActorInstructions,createOpenAIProvider} from './provider.mjs';
import {createSyntheticReceptionCases} from '../../../scripts/reception-ai-qa-cases.mjs';

const SHA='d0f32b375be23b1e97960580f82830d9b03538d81b71f2f881086ee2d54a0e90';
const source=()=>({id:'conflict-relative',provenance:{sourceSHA256:SHA}});

test('the supplement is source-bound, localized and does not rewrite the source or create assessed facts',()=>{
  const c=source(),before=structuredClone(c),docs=buildConflictContractMaterials(c);
  assert.deepEqual(c,before);assert.equal(docs.length,2);
  assert.deepEqual(docs.map(d=>d.id),['supplement-contract','supplement-correspondence']);
  for(const doc of docs){
    assert.equal(doc.initial,true);assert.deepEqual(doc.factIds,[]);
    for(const language of ['ru','en','zh']){
      assert.ok(doc.title[language].trim());assert.ok(doc.text[language].trim());
      assert.ok(doc.text[language].replace(/[,\s]/g,'').includes('120000'));
      assert.doesNotMatch(doc.text[language],/учебн|вымышленн|эталон|правильный ответ|grading/i);
    }
  }
  assert.match(docs[0].text.ru,/120 000/);
  assert.match(docs[1].text.ru,/не является сама по себе суммой денежных требований/);
  docs[0].text.ru='changed';assert.notEqual(buildConflictContractMaterials(c)[0].text.ru,'changed');
  for(const c of [{id:'another-case',provenance:{sourceSHA256:SHA}},{id:'conflict-relative'},
    {id:'conflict-relative',provenance:{sourceSHA256:'different-source'}}])assert.deepEqual(buildConflictContractMaterials(c),[]);
});

test('an existing active session receives readable attachments without losing its history, draft or build',async()=>{
  const c=structuredClone(createSyntheticReceptionCases()[0]);
  c.id='conflict-relative';c.provenance={sourceCaseId:c.id,sourceContentVersion:'qa-source',sourceSHA256:SHA,calendarYear:2026,dateValues:{}};
  const store=createMemoryStore(),identity={uid:'local-attachment-qa',studentKey:'900000000001'},buildId='a'.repeat(32);
  const provider={name:'mock',generate:async()=>({reply:'Материалы доступны.',revealedFactIds:[],releasedDocumentIds:[]})};
  const make=()=>createReceptionService({store,cases:[c],provider,config:{enforceMonetaryBudgets:false}});
  let service=make(),view=(await service.handle({op:'start',mode:'training',locale:'ru',buildId,requestId:'start'},identity)).view;
  await store.transaction('sessions/'+view.id,s=>{
    s.caseData[0].documents=s.caseData[0].documents.filter(d=>!d.id.startsWith('supplement-'));
    s.caseStates[0].releasedDocumentIds=s.caseStates[0].releasedDocumentIds.filter(id=>!id.startsWith('supplement-'));
    s.caseStates[0].messages.push({id:'before-fix',role:'user',text:'Где договор?',at:s.startedAt});
    s.caseStates[0].correspondenceDraft={subject:'saved-draft-sentinel'};
    return s;
  });
  const before=structuredClone(await store.get('sessions/'+view.id));service=make();
  view=(await service.handle({op:'resume',sessionId:view.id,buildId},identity)).view;
  assert.equal(view.id,before.id);assert.equal(view.revision,before.revision);assert.equal(view.buildId,buildId);
  assert.deepEqual(view.messages,before.caseStates[0].messages);
  assert.ok(view.documents.find(d=>d.id==='supplement-contract').text.includes('120 000'));
  view=(await service.handle({op:'document',sessionId:view.id,documentId:'supplement-contract',requestId:'open-contract'},identity)).view;
  const after=await store.get('sessions/'+view.id);
  for(const key of ['id','owner','studentKey','uid','buildId','caseIndex','status','results','startSignature'])assert.deepEqual(after[key],before[key],key);
  for(const key of ['messages','turns','correspondenceDraft','knownFactIds','decision','feedback'])assert.deepEqual(after.caseStates[0][key],before.caseStates[0][key],key);
  for(const key of ['public','actor','facts','rubric','provenance','version'])assert.deepEqual(after.caseData[0][key],before.caseData[0][key],key);
  assert.ok(view.openedDocumentIds.includes('supplement-contract'));
  await service.handle({op:'resume',sessionId:view.id,buildId},identity);
  const final=await store.get('sessions/'+view.id);
  assert.equal(final.caseData[0].documents.filter(d=>d.id.startsWith('supplement-')).length,2);
});

test('both dialogue stages check actual attachments and distinguish contract price from a claim',async()=>{
  const payloads=[],dossier={id:'conflict-relative',opening:'Договор приложен.',facts:[],documents:[],documentsAvailableUpfront:true};
  assert.match(buildActorInstructions(dossier,'ru'),/Do not tell the student to open an absent document/);
  const provider=createOpenAIProvider({apiKey:'offline-fixture-not-a-key',fetchImpl:async(_url,options)=>{
    const body=JSON.parse(options.body);payloads.push(body);
    const parsed=payloads.length===1?{reply:'В доступном комплекте нет копии договора.',revealedFactIds:[],releasedDocumentIds:[]}:{valid:true};
    return new Response(JSON.stringify({status:'completed',model:body.model,usage:{input_tokens:100,output_tokens:20},
      output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(parsed)}]}]}),{status:200});
  }});
  await provider.generate({actorCase:dossier,messages:[],text:'Где договор?',locale:'ru'});
  assert.match(payloads[1].instructions,/Reject any instruction to read a document absent/);
  assert.match(payloads[1].instructions,/Distinguish contract price/);
});
