import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceptionAPI} from '../site/apps/reception/ai/api-client.js';

const view={id:'test-session',revision:1,status:'active',messages:[]};
const accepted=()=>new Response(JSON.stringify({ok:true,view}),{status:200,headers:{'Content-Type':'application/json'}});

test('execution is negotiated only for new sessions; recovery and commands preserve the server contract',async()=>{
  const calls=[];
  const client=createReceptionAPI({endpoint:'/api/reception',baseURL:'http://127.0.0.1:8787/',demo:true,
    decisionVersion:'correspondence-v1',controlVersion:'execution-v1',fetch:async(_url,options)=>{
      const body=JSON.parse(options.body);calls.push(body);
      return body.op==='catalog'?new Response(JSON.stringify({ok:true,cases:[]}),{status:200}):accepted();
    }});
  for(const op of ['catalog','start','resume','recover','control-action','followup'])await client.request({op,requestId:'same'});
  assert.deepEqual(calls.map(row=>row.controlVersion),['execution-v1','execution-v1',undefined,undefined,undefined,undefined]);
  assert.ok(calls.every(row=>row.requestId==='same'));
  const legacy=createReceptionAPI({endpoint:'/api/reception',baseURL:'http://127.0.0.1:8787/',demo:true,
    decisionVersion:'legacy',controlVersion:'execution-v1',fetch:async(_url,options)=>{calls.push(JSON.parse(options.body));return accepted();}});
  await legacy.request({op:'start'});assert.equal(calls.at(-1).controlVersion,undefined);
});

test('the Firebase client scopes start and recovery to this release without changing chat requests',async()=>{
  const calls=[],buildId='a'.repeat(32);
  const client=createReceptionAPI({endpoint:'https://example.test/reception',baseURL:'https://course.test/',buildId,getIdToken:async()=> 'token',
    fetch:async(_url,options)=>{calls.push(JSON.parse(options.body));return accepted();}});
  for(const op of ['start','recover','resume','message'])await client.request({op,requestId:'stable'});
  assert.deepEqual(calls.map(body=>body.buildId),[buildId,buildId,buildId,undefined]);
  assert.ok(calls.every(body=>body.requestId==='stable'));
});

test('an expired identity token refreshes once without changing the billable request id',async()=>{
  const calls=[],tokens=[];
  const client=createReceptionAPI({endpoint:'https://example.test/reception',baseURL:'https://course.test/',
    getIdToken:async options=>{tokens.push(options.forceRefresh);return options.forceRefresh?'fresh':'expired';},
    fetch:async(url,options)=>{calls.push(options);return calls.length===1?new Response('{}',{status:401}):accepted();}});
  const body={op:'message',sessionId:'test-session',requestId:'stable-key',text:'Question',expectedRevision:0};
  assert.equal((await client.request(body)).id,'test-session');
  assert.deepEqual(tokens,[false,true]);assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);
  assert.equal(calls[1].headers.Authorization,'Bearer fresh');
});

test('an uncertain transport failure does not silently replay a paid request',async()=>{
  let calls=0;
  const client=createReceptionAPI({endpoint:'https://example.test/reception',baseURL:'https://course.test/',getIdToken:async()=> 'token',
    fetch:async()=>{calls++;throw new TypeError('connection lost after write');}});
  await assert.rejects(client.request({op:'message',requestId:'lost-reply'}),error=>error.code==='network');
  assert.equal(calls,1);
});

test('raw provider errors never become browser messages and local demo cannot target another origin',async()=>{
  const client=createReceptionAPI({endpoint:'https://example.test/reception',baseURL:'https://course.test/',getIdToken:async()=> 'token',
    fetch:async()=>new Response(JSON.stringify({ok:false,error:{code:'provider_unavailable',message:'private upstream diagnostics'}}),{status:503})});
  await assert.rejects(client.request({op:'resume'}),error=>error.code==='provider_unavailable'&&!error.message.includes('private'));
  let called=false;
  const local=createReceptionAPI({endpoint:'http://localhost:9999/api',baseURL:'http://127.0.0.1:8787/',demo:true,fetch:async()=>{called=true;return accepted();}});
  await assert.rejects(local.request({op:'start'}),error=>error.code==='local-demo-only');assert.equal(called,false);
});

test('the follow-up phase is a valid server view and its submission keeps the request id',async()=>{
  const calls=[];
  const client=createReceptionAPI({endpoint:'/api/reception',baseURL:'http://127.0.0.1:8787/',demo:true,
    fetch:async(_url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({ok:true,view:{...view,status:'followup',followup:{intro:'New circumstances',options:[{id:'verify',label:'Verify'}]}}}),{status:200});}});
  const result=await client.request({op:'followup',sessionId:view.id,requestId:'followup-key',choiceId:'verify'});
  assert.equal(result.status,'followup');assert.equal(result.followup.options[0].id,'verify');
  assert.deepEqual(calls,[{op:'followup',sessionId:view.id,requestId:'followup-key',choiceId:'verify'}]);
});

test('catalog reads public assignment metadata without expecting a session view',async()=>{
  const calls=[],row={id:'river-observation',title:'Ситуация',familyId:'river',level:1,estimatedMinutes:8};
  const client=createReceptionAPI({endpoint:'https://example.test/reception',baseURL:'https://course.test/',getIdToken:async()=> 'token',
    fetch:async(_url,options)=>{calls.push(options);return new Response(JSON.stringify({ok:true,cases:[{...row,extra:'discard'}]}),{status:200});}});
  assert.deepEqual(await client.catalog({studentKey:'12345678',locale:'ru'}),[row]);
  assert.deepEqual(JSON.parse(calls[0].body),{studentKey:'12345678',locale:'ru',op:'catalog'});
  assert.equal(calls[0].headers.Authorization,'Bearer token');
  assert.equal(calls[0].cache,'no-store');
});

test('history returns a bounded owner history with zero points and no session mutation fields',async()=>{
  const bodies=[];
  const row={id:'a'.repeat(40),title:'Регистрация обращения',journeyStage:'independent',
    completedAt:1795263000000,points:0,maxPoints:5,score:53};
  let packet={ok:true,attempts:[{...row,private:'discard'}],nextCursor:'next-page'};
  const client=createReceptionAPI({endpoint:'/api/reception',baseURL:'http://127.0.0.1:8787/',demo:true,
    context:'seminar',buildId:'f'.repeat(32),coreStepsVersion:'mfc-referral-v2',fetch:async(_url,options)=>{
      bodies.push(JSON.parse(options.body));return new Response(JSON.stringify(packet));
    }});
  assert.deepEqual(await client.history({studentKey:'12345678',locale:'ru'}),{attempts:[row],nextCursor:'next-page'});
  packet={ok:true,attempts:[],nextCursor:null};
  assert.deepEqual(await client.history({studentKey:'12345678',locale:'ru',cursor:'next-page'}),{attempts:[],nextCursor:null});
  assert.deepEqual(bodies,[{studentKey:'12345678',locale:'ru',context:'seminar',op:'history'},
    {studentKey:'12345678',locale:'ru',cursor:'next-page',context:'seminar',op:'history'}]);
  for(const bad of [{...row,points:'0'},{...row,id:'other'},{...row,score:101},{...row,completedAt:0}]){
    packet={ok:true,attempts:[bad],nextCursor:null};
    await assert.rejects(client.history(),{code:'invalid-response'});
  }
  packet={ok:true,attempts:[row,row],nextCursor:null};
  await assert.rejects(client.history(),{code:'invalid-response'});
});

test('recover accepts an explicit empty result and retains ordinary resume validation',async()=>{
  const bodies=[];
  const client=createReceptionAPI({endpoint:'/api/reception',baseURL:'http://127.0.0.1:8787/',demo:true,
    fetch:async(_url,options)=>{bodies.push(JSON.parse(options.body));return new Response(JSON.stringify({ok:true,view:null}),{status:200});}});
  assert.equal(await client.recover({studentKey:'12345678',mode:'training'}),null);
  assert.deepEqual(bodies[0],{studentKey:'12345678',mode:'training',op:'recover'});
  await assert.rejects(client.request({op:'resume',sessionId:'missing'}),error=>error.code==='invalid-response');
  const bad=createReceptionAPI({endpoint:'/api/reception',baseURL:'http://127.0.0.1:8787/',demo:true,
    fetch:async()=>new Response(JSON.stringify({ok:true}),{status:200})});
  await assert.rejects(bad.recover({mode:'training'}),error=>error.code==='invalid-response');
});

test('catalog rejects malformed difficulty and training sends the chosen case unchanged',async()=>{
  const bodies=[];let packet={ok:true,cases:[{id:'river',title:'Case',familyId:'river',level:4,estimatedMinutes:8}]};
  const client=createReceptionAPI({endpoint:'/api/reception',baseURL:'http://127.0.0.1:8787/',demo:true,
    fetch:async(_url,options)=>{bodies.push(JSON.parse(options.body));return new Response(JSON.stringify(packet),{status:200});}});
  await assert.rejects(client.catalog(),error=>error.code==='invalid-response');
  packet={ok:true,view};
  const body={op:'start',mode:'training',studentKey:'12345678',requestId:'chosen-case',caseId:'river-observation',level:1,locale:'ru'};
  assert.deepEqual(await client.request(body),view);assert.deepEqual(bodies.at(-1),body);
  assert.deepEqual(await client.recover({mode:'training'}),view);
});


test('the current workbook version is attached only to session lifecycle and catalog reads',async()=>{
  const calls=[];
  const client=createReceptionAPI({endpoint:'https://example.test/reception',baseURL:'https://course.test/',workbookVersion:1,getIdToken:async()=> 'token',
    fetch:async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return body.op==='catalog'?new Response(JSON.stringify({ok:true,cases:[]}),{status:200}):accepted();}});
  for(const op of ['catalog','start','recover','resume','message','decide'])await client.request({op,requestId:'stable'});
  assert.deepEqual(calls.map(body=>body.workbookVersion),[1,1,1,1,undefined,undefined]);
  assert.ok(calls.every(body=>body.requestId==='stable'));
});


test('session reads and keyed material writes retry one transport failure with identical endpoint and body',async()=>{
  const sessionId=view.id,requestId='existing-key';
  for(const body of [
    {op:'resume',sessionId},
    {op:'catalog'},
    {op:'document',sessionId,requestId,documentId:'receipt'},
    {op:'core-step',sessionId,requestId,stepId:'materials',expectedRevision:1},
    {op:'tutorial-step',sessionId,requestId,stepId:'materials',expectedRevision:1},
  ]){
    const calls=[];
    const client=createReceptionAPI({endpoint:'https://example.test/reception',baseURL:'https://course.test/',getIdToken:async()=> 'token',
      fetch:async(url,options)=>{
        calls.push([url,options.body]);
        if(calls.length===1)throw new TypeError('Load failed');
        return body.op==='catalog'?new Response(JSON.stringify({ok:true,cases:[]})):accepted();
      }});
    await client.request(body);
    assert.deepEqual(calls,Array.from({length:2},()=>['https://example.test/reception',JSON.stringify(body)]));
  }
});

test('a material transport retry is bounded and cannot refresh the token more than once',async()=>{
  const tokens=[],calls=[];
  const body={op:'document',sessionId:view.id,requestId:'existing-key',documentId:'receipt'};
  const client=createReceptionAPI({endpoint:'https://example.test/reception',baseURL:'https://course.test/',
    getIdToken:async({forceRefresh})=>{tokens.push(forceRefresh);return forceRefresh?'fresh':'expired';},
    fetch:async(_url,options)=>{
      calls.push(options);
      if(calls.length===1)return new Response('{}',{status:401});
      throw new TypeError('Load failed');
    }});
  await assert.rejects(client.request(body),error=>error.code==='network');
  assert.deepEqual(tokens,[false,true]);
  assert.deepEqual(calls.map(options=>options.headers.Authorization),['Bearer expired','Bearer fresh','Bearer fresh']);
  assert.ok(calls.every(options=>options.body===JSON.stringify(body)));
});

test('unkeyed document and other step requests are not replayed on transport failure',async()=>{
  let calls=0;
  const client=createReceptionAPI({endpoint:'https://example.test/reception',baseURL:'https://course.test/',getIdToken:async()=> 'token',
    fetch:async()=>{calls++;throw new TypeError('Load failed');}});
  for(const body of [
    {op:'document',sessionId:view.id,documentId:'receipt'},
    {op:'core-step',sessionId:view.id,requestId:'existing-key',stepId:'calendar'},
    {op:'tutorial-step',sessionId:view.id,requestId:'existing-key',stepId:'draft'},
  ])await assert.rejects(client.request(body),error=>error.code==='network');
  assert.equal(calls,3);
});
