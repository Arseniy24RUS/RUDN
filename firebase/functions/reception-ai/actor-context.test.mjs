import test from 'node:test';
import assert from 'node:assert/strict';
import {actorCase} from './schema.mjs';
import {buildActorInstructions,createOpenAIProvider} from './provider.mjs';

const dossier=()=>({id:'mfc-second-demand',public:{citizen:{name:'Илья Андреевич'},opening:'После первого отказа я подписал заявление.',
 role:{title:'Не роль заявителя',text:'learner-only-instructions'},title:'hidden-solution-title',
 assessment:{calendar:{events:[{id:'sent',label:'Отправлено',date:'2026-06-09'},{id:'received',label:'Поступило',date:'2026-06-10'},
 {id:'registered',label:'Зарегистрировано',date:'2026-06-11'},{id:'decision',label:'Решение',date:'2026-06-30'}]}}},
 actor:{persona:'Заявитель',goal:'Разобраться с новым требованием документов'},facts:[],
 documents:[{id:'dates',initial:true,factIds:[],text:'Учебная временная линия'}],
 rubric:{authored:{},secret:'grading-key-sentinel'},followup:{intro:'unreleased-control-material'}});

test('the actor receives current appeal chronology without learner role, grading keys or inferred dates',()=>{
 const source=dossier(),before=structuredClone(source),actor=actorCase(source,'ru');
 assert.deepEqual(actor.participantContext.currentAppeal.events.map(e=>[e.id,e.date]),[
  ['sent','2026-06-09'],['received','2026-06-10'],['registered','2026-06-11']]);
 assert.equal(actor.participantContext.currentAppeal.scope,'current_appeal');
 assert.equal(actor.participantContext.conversationalBackground.evidentiary,false);
 assert.match(actor.participantContext.conversationalBackground.service,/ЕГРН/);
 assert.match(actor.participantContext.conversationalBackground.location,/Красногорск/);
 assert.equal(actor.participantContext.conversationalBackground.branchAddressKnown,false);
 assert.equal(actor.documents.length,0);
 for(const marker of ['learner-only-instructions','hidden-solution-title','grading-key-sentinel','unreleased-control-material','2026-06-30'])assert.ok(!JSON.stringify(actor).includes(marker));
 assert.deepEqual(source,before);
 const instructions=buildActorInstructions(actor,'ru');
 assert.match(instructions,/CURRENT appeal only/);assert.match(instructions,/earlier service application/);
 assert.match(instructions,/Do not say/);assert.match(instructions,/Do not invent a location or exact branch address/);
});

test('both Luna stages get the same chronology and optional personal background',async()=>{
 const actor=actorCase(dossier(),'ru'),payloads=[];
 const provider=createOpenAIProvider({apiKey:'local-fixture-not-a-key',fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body);payloads.push(body);
  const answer=payloads.length===1?{reply:'Жалобу я отправил 9 июня 2026 года.',revealedFactIds:[],releasedDocumentIds:[]}:{valid:true};
  return new Response(JSON.stringify({status:'completed',model:body.model,usage:{input_tokens:100,output_tokens:20},
   output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]}),{status:200});
 }});
 const reply=await provider.generate({actorCase:actor,messages:[],text:'Когда вы отправили жалобу?',locale:'ru'});
 assert.equal(reply.verified,true);assert.match(reply.reply,/9 июня/);
 assert.match(payloads[0].instructions,/2026-06-09/);
 const verification=JSON.parse(payloads[1].input[0].content);
 assert.deepEqual(verification.canonicalDossier.participantContext,actor.participantContext);
 assert.match(payloads[1].instructions,/original service application/);
 assert.match(payloads[1].instructions,/reject any asserted street or building number/);
});
