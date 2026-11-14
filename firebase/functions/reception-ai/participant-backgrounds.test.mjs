import test from 'node:test';
import assert from 'node:assert/strict';
import backgrounds from './participant-backgrounds.json' with {type:'json'};
import {CATALOG_METADATA} from './catalog-metadata.mjs';
import {getCorrespondenceProfile} from './correspondence-profiles.mjs';
import {buildParticipantContext} from './participant-context.mjs';
import {buildActorInstructions,createOpenAIProvider} from './provider.mjs';

test('all authored participants have three localized, source-bound background fields',()=>{
  assert.equal(backgrounds.version,'reception-participant-background-v1');
  assert.deepEqual(Object.keys(backgrounds.cases).sort(),Object.keys(CATALOG_METADATA).sort());
  assert.equal(Object.keys(backgrounds.cases).length,178);
  for(const [id,row] of Object.entries(backgrounds.cases)){
    assert.deepEqual(Object.keys(row).sort(),['priorContact','purpose','service','sourceSHA256']);
    assert.equal(row.sourceSHA256,getCorrespondenceProfile(id).provenance.sourceSHA256,id);
    for(const field of ['service','purpose','priorContact'])for(const locale of ['ru','en','zh']){
      const value=row[field][locale];
      assert.ok(typeof value==='string'&&value.length>=8&&value.length<=1500,id+'/'+field+'/'+locale);
      assert.doesNotMatch(value,/\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4}|\{\{|grading|answer key|в моих сведениях|вымышленн|учебн/iu,id);
    }
    for(const locale of ['ru','en','zh']){
      const c={id,provenance:{sourceSHA256:row.sourceSHA256}},before=structuredClone(c);
      const b=buildParticipantContext(c,locale).conversationalBackground;
      assert.equal(b.optional,true);assert.equal(b.evidentiary,false);
      for(const field of ['service','purpose','priorContact'])assert.equal(b[field],row[field][locale]);
      assert.deepEqual(c,before);
    }
  }
});

test('changed or unsupported cases never borrow an incompatible personal scene',()=>{
  for(const c of [{id:'not-a-case'},{id:'__proto__'},{id:'constructor'},
    {id:'mfc-second-demand',provenance:{sourceSHA256:'changed-source'}}])
    assert.equal(buildParticipantContext(c).conversationalBackground,undefined);
});

test('records colleagues and personal-interest cases retain their own perspective',()=>{
  const row=id=>backgrounds.cases[id];
  assert.match(row('anonymous-danger').service.ru,/дежур|корреспонден|канцеляр|письм/i);
  assert.match(row('unclear-subject').priorContact.ru,/не|нельзя|неясн/i);
  assert.match(row('unreadable-body').priorContact.ru,/не|нельзя|неразбор/i);
  assert.match(row('conflict-creditor').service.ru,/проект|работ|решени|рассмотр/i);
  assert.match(row('electronic-draft-only').priorContact.ru,/черновик/i);
});

test('both dialogue stages distinguish the sender address from the event site',async()=>{
  const payloads=[],dossier={id:'salary-partial',participantContext:buildParticipantContext({id:'salary-partial'}),
    correspondenceAddress:{city:'Екатеринбург',address:'ул. Полевая, д. 29'},
    eventLocation:{territory:'Москва',city:'Москва',detail:'Работодатель в Москве'},facts:[],documents:[]};
  const instructions=buildActorInstructions(dossier,'ru');
  assert.match(instructions,/sender's postal contact address ONLY/);
  assert.match(instructions,/Do not move an event into the sender's region/);
  const provider=createOpenAIProvider({apiKey:'offline-fixture-not-a-key',fetchImpl:async(_url,options)=>{
    const body=JSON.parse(options.body);payloads.push(body);
    const parsed=payloads.length===1?{reply:'Работодатель находится в Москве.',revealedFactIds:[],releasedDocumentIds:[]}:{valid:true};
    return new Response(JSON.stringify({status:'completed',model:body.model,usage:{input_tokens:100,output_tokens:20},
      output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(parsed)}]}]}),{status:200});
  }});
  await provider.generate({actorCase:dossier,messages:[],text:'Где находится работодатель?',locale:'ru'});
  assert.match(payloads[1].instructions,/never the incident or office address/);
  const supplied=JSON.parse(payloads[1].input[0].content).canonicalDossier;
  assert.deepEqual(supplied.eventLocation,dossier.eventLocation);
  assert.deepEqual(supplied.participantContext,dossier.participantContext);
});
