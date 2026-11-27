import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AdvisorError,MODEL,identityMarkers,providerFacts,readRequest} from './contract.mjs';
import {createAdvisorService} from './service.mjs';
import {createProvider} from './provider.mjs';

const identity={uid:'synthetic-one',studentKey:'12345001'};
const sample={attemptId:'governor-test-attempt01',requestId:'governor-test-request01',studentKey:identity.studentKey,
  year:2026,revision:4,language:'ru',question:'Сколько стоит заём и когда погашать?',facts:{
    budget:{cash:500,debt:1000,debtLimit:2000},
    taxes:[{mode:'moderate',annualMln:1400}],
    sites:[{id:'yard',capex:1670,annualOpex:76,openingYear:2028,served:620,demand:1000}]
  }};
const loanReply={intent:'loan',answer:'Откройте бюджет. Сравните основной долг и проценты по займу.',model:MODEL};
const clone=value=>value===undefined?undefined:structuredClone(value);
const store=()=>{
  const data=new Map();
  return {data,transaction:async(path,act)=>{
    const candidate=act(clone(data.get(path)));
    if(candidate!==undefined)data.set(path,clone(candidate));
    return clone(data.get(path));
  }};
};

test('strict schema bounds optional conversation data and excludes unexpected profile fields',()=>{
  assert.deepEqual(readRequest(sample),sample);
  const preview={...sample,studentKey:null,gameContext:['Годовой результат'],history:[{question:'Что изменилось?',answer:'Проверьте сводку.'}]};
  assert.deepEqual(readRequest(preview),preview);
  for (const value of [{...sample,profile:{name:'Example Person'}},
    {...sample,studentKey:'../another'},
    {...sample,facts:{futureEvent:'EDU-01'}},
    {...sample,facts:{sites:[{...sample.facts.sites[0],id:'personal-name'}]}},
    {...sample,facts:{sites:[{...sample.facts.sites[0],served:1001}]}},
    {...sample,question:'ю'.repeat(1201)},
    {...sample,gameContext:Array(13).fill('строка')},
    {...sample,gameContext:Array(7).fill('甲'.repeat(600))},
    {...sample,gameContext:['甲'.repeat(601)]},
    {...sample,history:Array(4).fill(preview.history[0])},
    {...sample,history:[{...preview.history[0],uid:identity.uid}]},
    {...sample,history:[{...preview.history[0],answer:'甲'.repeat(901)}]}]) assert.throws(()=>readRequest(value),{code:'invalid-request'});
});

test('the provider gets the game question and context with obvious personal identifiers and credentials removed',()=>{
  const privateEmail='synthetic@example.test', phone='+7 (999) 567-89-01',pass='private-passphrase', key='sk-synthetic-random-key';
  const state={...sample,question:`Почему жители уезжают? ${privateEmail} ${phone} password: ${pass} ${identity.uid}`,
    gameContext:[`Охват 72%. Тестовый идентификатор ${sample.attemptId}`,`Бюджет 500 млн ₽. Bearer ${key}`],
    history:[{question:`https://synthetic.invalid/users/${sample.studentKey} Что было раньше?`,answer:'Показатель вырос на 2 п.п.'}]};
  const data=providerFacts(readRequest(state),identityMarkers(state,identity));
  const serialized=JSON.stringify(data);
  for (const privateText of [privateEmail,phone,pass,key,identity.uid,sample.studentKey,sample.attemptId,sample.requestId,'https://synthetic.invalid']) {
    assert.ok(!serialized.includes(privateText));
  }
  assert.deepEqual(Object.keys(data),['language','year','facts','question','gameContext','history']);
  assert.match(data.question,/Почему жители уезжают\?/);
  assert.match(data.gameContext[1],/Бюджет 500 млн ₽/);
  assert.deepEqual(data.facts,sample.facts);
  assert.match(data.history[0].answer,/2 п\.п\./);
});

test('concurrent requests produce one provider call and replay the same sanitized answer',async()=>{
  let calls=0, release, started;
  const invoked=new Promise(resolve=>{started=resolve;});
  const waiting=new Promise(resolve=>{release=resolve;});
  const cleanReply={...loanReply,answer:loanReply.answer+' [—]'};
  const db=store(), service=createAdvisorService({store:db,provider:async()=>{
    calls++;
    started();
    await waiting;
    return {...loanReply,answer:loanReply.answer+' '+identity.uid};
  }});
  const first=service(sample,identity);
  await invoked;
  await assert.rejects(service(sample,identity),{code:'request-pending',status:409});
  await assert.rejects(service({...sample,revision:5},identity),{code:'request-conflict',status:409});
  await assert.rejects(service(sample,{uid:'another-user',studentKey:identity.studentKey}),{code:'forbidden'});
  await assert.rejects(service({...sample,studentKey:'99999000'},identity),{code:'forbidden'});
  release();
  assert.deepEqual(await first,cleanReply);
  assert.deepEqual(await service(sample,identity),cleanReply);
  assert.equal(calls,1);
  assert.equal([...db.data].find(([p])=>p.startsWith('days/'))[1].count,1);
  const atRest=JSON.stringify([...db.data.values()]);
  assert.ok(!atRest.includes(sample.question) && !atRest.includes(sample.studentKey) && !atRest.includes(identity.uid));
});

test('an open-ended game question reaches the provider for a verified instructor and never for guests',async()=>{
  const request={...sample,studentKey:null,language:'zh',question:'为什么年轻人开始搬走？',facts:{}};
  const teacher={uid:'synthetic-instructor',teacher:true,studentKey:null};
  const answer={intent:'unknown',answer:'先查看统计中的人口变动，再比较就业和住房指标。',model:MODEL};
  let calls=0;
  const service=createAdvisorService({store:store(),provider:context=>{
    calls++;
    assert.equal(context.question,request.question);
    return answer;
  }});
  await assert.rejects(service(request,identity),{code:'forbidden'});
  await assert.rejects(service(request,{uid:'anonymous-without-profile'}),{code:'forbidden'});
  await assert.rejects(service(sample,teacher),{code:'forbidden'});
  assert.deepEqual(await service(request,teacher),answer);
  assert.equal(calls,1);
});

test('a failed answer is terminal and daily limits are shared by all of the UID’s attempts',async()=>{
  let calls=0;
  const db=store();
  const service=createAdvisorService({store:db,limits:{perAttempt:5,perUserDay:1,perDay:2},
    provider:()=>{calls++;throw new AdvisorError('provider-unavailable',503);}});
  await assert.rejects(service(sample,identity),{code:'provider-unavailable',status:503});
  await assert.rejects(service(sample,identity),{code:'provider-unavailable',status:503});
  await assert.rejects(service({...sample,attemptId:'governor-test-attempt02'},identity),{code:'daily-quota',status:429});
  assert.equal(calls,1);
});

test('Responses adapter selects Terra, disables storage and returns only validated text',async()=>{
  assert.equal(createProvider({key:''}),null);
  let outbound;
  const fakeResponse=(output,{status='completed',model=MODEL}={})=>({ok:true,json:async()=>({status,model,
    output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]})});
  const provider=createProvider({key:'fixture-key',fetchImpl:async(url,request)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    outbound=JSON.parse(request.body);
    return fakeResponse({intent:loanReply.intent,answer:loanReply.answer},{model:MODEL+'-2026-11-01'});
  }});
  assert.deepEqual(await provider(providerFacts(sample)),loanReply);
  assert.equal(outbound.model,MODEL);
  assert.equal(outbound.store,false);
  assert.deepEqual(outbound.reasoning,{effort:'none'});
  assert.equal(JSON.parse(outbound.input).question,sample.question);
  assert.equal(outbound.text.format.strict,true);
  assert.equal(outbound.text.format.schema.additionalProperties,false);
  assert.equal(Object.hasOwn(outbound,'tools'),false);
  for (const reply of [fakeResponse({intent:'loan',answer:'Пример'},{model:'gpt-6.1-sol'}),
    fakeResponse({intent:'loan',answer:'Пример'},{status:'incomplete'}),fakeResponse({intent:'loan'}),
    fakeResponse({intent:'loan',answer:'Пример',fact:12}),fakeResponse(loanReply)]) {
    const bad=createProvider({key:'fixture-key',fetchImpl:async()=>reply});
    await assert.rejects(bad(providerFacts(sample)),{code:'provider-invalid',status:502});
  }
});

test('per-campaign and global ceilings bound calls across independent verified profiles',async()=>{
  let calls=0;
  const service=createAdvisorService({store:store(),limits:{perAttempt:1,perDay:2},
    provider:()=>{calls++;return loanReply;}});
  await service(sample,identity);
  await assert.rejects(service({...sample,requestId:'governor-test-request02'},identity),{code:'attempt-quota',status:429});
  const second={uid:'synthetic-two',studentKey:'88770001'};
  await service({...sample,attemptId:'governor-test-attempt02',studentKey:second.studentKey},second);
  const third={uid:'synthetic-three',studentKey:'88770002'};
  await assert.rejects(service({...sample,attemptId:'governor-test-attempt03',studentKey:third.studentKey},third),{code:'daily-quota',status:429});
  assert.equal(calls,2);
});
