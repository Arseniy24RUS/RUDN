import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIProvider, validateActorTurn, estimateMentorReservation} from './provider.mjs';
import {addReviewDialogue} from './correspondence.mjs';

function fixture(responses) {
  const requests=[];
  const provider=createOpenAIProvider({apiKey:'fixture',fetchImpl:async (_url,options)=>{
    const body=JSON.parse(options.body);
    requests.push(body);
    const data=responses[requests.length-1];
    return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[
      {type:'output_text',text:JSON.stringify(data)}
    ]}],usage:{input_tokens:5,output_tokens:10}}));
  }});
  return {requests,provider};
}
const actor={opening:'Хочу узнать о своём заявлении.',documents:[],facts:[]};
const reply=text=>({reply:text,revealedFactIds:[],releasedDocumentIds:[]});

test('character keeps harmless details with the same person, and can repair an ungrounded draft in the existing two calls',async()=>{
  const history=[{role:'assistant',text:'Мне удобнее записать объяснение на бумаге.'}];
  const repaired=reply('Я записываю всё на бумаге, так мне проще. Точную дату первого визита я не помню.');
  const {requests,provider}=fixture([reply('Точно 3 марта.'),{valid:false,repairedTurn:repaired}]);
  const result=await provider.generate({actorCase:actor,messages:history,text:'А когда вы пришли?',locale:'ru'});
  assert.deepEqual(validateActorTurn(result,actor,{releasedDocumentIds:[]},'ru'),{...repaired,guarded:false});
  assert.deepEqual(result.usage,{inputTokens:10,outputTokens:20});assert.equal(requests.length,2);
  assert.equal(requests[0].input[0].content,history[0].text);
  const check=JSON.parse(requests[1].input[0].content);
  assert.deepEqual(check.priorConversation,history);
  for(const request of requests)assert.match(request.instructions,/Improvise ordinary, low-stakes details/);
  assert.equal(requests[0].text.format.schema.properties.revealedFactIds.maxItems,0);
});

test('a purported repair cannot introduce a fact or a fictional attachment',async()=>{
  const {provider}=fixture([reply('Мой договор.'),{valid:false,repairedTurn:{...reply('Вот договор.'),releasedDocumentIds:['invented']}}]);
  const result=await provider.generate({actorCase:actor,messages:[],text:'Где?',locale:'ru'});
  assert.equal(validateActorTurn(result,actor,{releasedDocumentIds:[]},'ru').guarded,true);
});

test('reviewer reads the two sides in order without making a learner question citable or displacing required evidence',()=>{
  const sources=[{id:'dialogue:a1',kind:'dialogue',text:'Не помню.'},{id:'dialogue:a2',kind:'dialogue',text:'Лично не видел.'}];
  const messages=[{role:'user',text:'Вы подавали заявление?'},{role:'assistant',id:'a1'},{role:'user',text:'Это вы видели?'},{role:'assistant',id:'a2'}];
  const context={sources};addReviewDialogue(context,messages,10000);
  assert.deepEqual(context.dialogueContext,{earlierPairsOmitted:0,exchanges:[
    {question:messages[0].text,replySourceId:'dialogue:a1'},{question:messages[2].text,replySourceId:'dialogue:a2'}]});
  assert.equal(context.sources.length,2);
  const bounded={sources};addReviewDialogue(bounded,messages,12);assert.equal(bounded.dialogueContext,undefined);
});

test('mentor can answer direct practice questions from the current guide and conversation',async()=>{
  const args={guide:{recipient:'Отдел ЖКХ'},history:[{role:'user',text:'Куда направлять?'}],text:'Что указать в поручении?',locale:'ru'};
  const {provider,requests}=fixture([{reply:'Укажите адресата и опишите, какой результат он должен подтвердить.'}]);
  const answer=await provider.answerMentor(args);
  assert.match(answer.reply,/адресата/);assert.equal(requests.length,1);
  assert.match(requests[0].instructions,/may give the correct choice/);
  assert.deepEqual(JSON.parse(requests[0].input[0].content),{practiceGuide:args.guide,priorConversation:args.history,question:args.text});
  assert.ok(estimateMentorReservation(args).perCallInputTokens>JSON.stringify(args).length);
});

test('a vague repeated appeal names the same concrete everyday request on entry and in the actor context',async()=>{
  const {buildParticipantContext,participantOpening}=await import('./participant-context.mjs');
  for(const id of ['repeat-other-authority','repeat-routing-only']){
    for(const [locale,phrase] of [['ru','личный приём'],['en','appointment'],['zh','预约']]){
      const c={id,public:{opening:'original'}};
      assert.ok(participantOpening(c,locale).includes(phrase));
      assert.ok(buildParticipantContext(c,locale).conversationalBackground.service.includes(phrase));
      assert.equal(participantOpening({...c,provenance:{sourceSHA256:'changed'}},locale),'original');
    }
  }
});

test('practice feedback checks meaning and returns a correction without assigning a score',async()=>{
  const {provider,requests}=fixture([{ready:false,feedback:'Квитанция подтверждает доставку. Для закрытия сверьте ответ с доводами жалобы.'}]);
  const args={guide:{material:'Квитанция о доставке'},work:{conclusion:'Ремонт выполнен'},phase:'control',locale:'ru'};
  const result=await provider.reviewMentorWork(args);
  assert.equal(result.ready,false);assert.match(result.feedback,/доставку/);
  assert.equal(requests.length,1);assert.deepEqual(JSON.parse(requests[0].input[0].content),{guide:args.guide,work:args.work,phase:'control'});
  assert.equal('score' in result,false);
  const malformed=fixture([{ready:true,feedback:''}]).provider;
  await assert.rejects(malformed.reviewMentorWork(args),error=>error.code==='provider_invalid');
});
