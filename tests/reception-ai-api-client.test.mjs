import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceptionAPI} from '../site/apps/reception/ai/api-client.js';

const view={id:'test-session',revision:1,status:'active',messages:[]};
const accepted=()=>new Response(JSON.stringify({ok:true,view}),{status:200,headers:{'Content-Type':'application/json'}});

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
