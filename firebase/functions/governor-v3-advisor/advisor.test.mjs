import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AdvisorError,providerFacts,readRequest} from './contract.mjs';
import {createAdvisorService} from './service.mjs';
import {createProvider,mockProvider} from './provider.mjs';

const identity={uid:'synthetic-one',studentKey:'12345001'};
const sample={attemptId:'governor-test-attempt01',requestId:'governor-test-request01',studentKey:identity.studentKey,
  year:2026,revision:4,language:'ru',question:'Сколько стоит заём и когда погашать?',facts:{
    budget:{cash:500,debt:1000,debtLimit:2000},
    taxes:[{mode:'moderate',annualMln:1400}],
    sites:[{id:'yard',capex:1670,annualOpex:76,openingYear:2028,served:620,demand:1000}]
  }};
const clone=value=>value===undefined?undefined:structuredClone(value);
const store=()=>{
  const data=new Map();
  return {data,transaction:async(path,act)=>{
    const candidate=act(clone(data.get(path)));
    if(candidate!==undefined)data.set(path,clone(candidate));
    return clone(data.get(path));
  }};
};

test('strict schema rejects profile material, unknown locations and unexpected facts',()=>{
  assert.deepEqual(readRequest(sample),sample);
  for (const value of [{...sample,profile:{name:'Example Person'}},
    {...sample,studentKey:'../another'},
    {...sample,facts:{futureEvent:'EDU-01'}},
    {...sample,facts:{sites:[{...sample.facts.sites[0],id:'personal-name'}]}},
    {...sample,facts:{sites:[{...sample.facts.sites[0],served:1001}]}},
    {...sample,question:'ю'.repeat(1201)}]) assert.throws(()=>readRequest(value),{code:'invalid-request'});
});

test('only controlled gameplay vocabulary and facts reach the provider',()=>{
  const data=providerFacts({...sample,question:'Личный текст: Иванов Иван, 12345001, student@example.com. Заём и погашение.'});
  assert.equal(mockProvider(data).intent,'loan');
  assert.ok(!/Иван|12345001|@example|attempt|revision/i.test(JSON.stringify(data)));
  assert.deepEqual(mockProvider(providerFacts({...sample,language:'zh',question:'如何比较税率？'})),{intent:'tax'});
});

test('concurrent requests produce one provider call and replay the same closed intent',async()=>{
  let calls=0, release, started;
  const invoked=new Promise(resolve=>{started=resolve;});
  const waiting=new Promise(resolve=>{release=resolve;});
  const db=store(), service=createAdvisorService({store:db,provider:async()=>{calls++;started();await waiting;return {intent:'loan'};}});
  const first=service(sample,identity);
  await invoked;
  await assert.rejects(service(sample,identity),{code:'request-pending',status:409});
  await assert.rejects(service({...sample,revision:5},identity),{code:'request-conflict',status:409});
  await assert.rejects(service(sample,{uid:'another-user',studentKey:identity.studentKey}),{code:'forbidden'});
  await assert.rejects(service({...sample,studentKey:'99999000'},identity),{code:'forbidden'});
  release();
  assert.deepEqual(await first,{intent:'loan'});
  assert.deepEqual(await service(sample,identity),{intent:'loan'});
  assert.equal(calls,1);
  assert.equal([...db.data].find(([p])=>p.startsWith('days/'))[1].count,1);
  const atRest=JSON.stringify([...db.data.values()]);
  assert.ok(!atRest.includes(sample.question) && !atRest.includes(sample.studentKey));
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

test('paid adapter requires configuration and validates the limited response exactly',async()=>{
  assert.equal(createProvider({model:'',key:'ignored'}),null);
  let outbound;
  const fetcher=async(_url,request)=>{
    outbound=JSON.parse(request.body);
    return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"intent":"loan"}'}]}]})};
  };
  const provider=createProvider({model:'fixture-model',key:'fixture-key',fetchImpl:fetcher});
  assert.deepEqual(await provider(providerFacts(sample)),{intent:'loan'});
  assert.equal(outbound.store,false);
  assert.equal(outbound.text.format.strict,true);
  assert.equal(outbound.text.format.schema.additionalProperties,false);
  const bad=createProvider({model:'fixture-model',key:'fixture-key',fetchImpl:async()=>({ok:true,json:async()=>({
    status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"intent":"loan","fact":12}'}]}]
  })})});
  await assert.rejects(bad(providerFacts(sample)),{code:'provider-invalid',status:502});
});

test('per-campaign and global ceilings bound calls across independent verified profiles',async()=>{
  let calls=0;
  const service=createAdvisorService({store:store(),limits:{perAttempt:1,perDay:2},
    provider:()=>{calls++;return {intent:'loan'};}});
  await service(sample,identity);
  await assert.rejects(service({...sample,requestId:'governor-test-request02'},identity),{code:'attempt-quota',status:429});
  const second={uid:'synthetic-two',studentKey:'88770001'};
  await service({...sample,attemptId:'governor-test-attempt02',studentKey:second.studentKey},second);
  const third={uid:'synthetic-three',studentKey:'88770002'};
  await assert.rejects(service({...sample,attemptId:'governor-test-attempt03',studentKey:third.studentKey},third),{code:'daily-quota',status:429});
  assert.equal(calls,2);
});
