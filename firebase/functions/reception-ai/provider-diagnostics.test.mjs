import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIProvider} from './provider.mjs';

const privateText='PRIVATE STUDENT TEXT sk-private-credential';
const actorCase={facts:[{id:'fact'}],documents:[]};
const dialogue={actorCase,messages:[],text:privateText,locale:'ru'};
const context={locale:'ru',phase:'initial',sections:{facts:'Visible source'},sources:[{id:'source'}],
  criteria:[{id:'facts',maxLevel:4,eligibleEvidenceIds:['source']}],criticalRules:[]};
const review={version:1,phase:'initial',criteria:[{id:'facts',level:4,reason:'Grounded finding',findings:[
  {type:'supported',section:'facts',quote:'Visible source',sourceIds:['source'],explanation:'Grounded finding'},
]}],criticalErrors:[],summary:'Grounded review'};
const headers={get:name=>name==='x-request-id'?'req_diagnostic_fixture':null};
const completed=parsed=>({ok:true,status:200,headers,json:async()=>({status:'completed',
  output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(parsed)}]}],
  usage:{input_tokens:10,output_tokens:10}})});
const rejected=status=>({ok:false,status,headers,json:async()=>({error:{type:'invalid_request_error',code:'invalid_json_schema',
  param:'text.format.schema',message:privateText},input:privateText,apiKey:privateText})});
const hasCode=(code,status)=>error=>error.code===code&&error.status===status;

test('each of the four provider stages reports only bounded operational metadata',async()=>{
  for(const stage of ['chat','chat_validation','assessment','assessment_validation']){
    const events=[],requests=[];
    const provider=createOpenAIProvider({apiKey:privateText,onDiagnostic:event=>events.push(event),fetchImpl:async(_url,options)=>{
      requests.push(JSON.parse(options.body));
      if(stage.endsWith('_validation')&&requests.length===1)return completed(stage==='chat_validation'
        ?{reply:'Known fact',revealedFactIds:['fact'],releasedDocumentIds:[]}:review);
      return rejected(400);
    }});
    await assert.rejects(stage.startsWith('chat')?provider.generate(dialogue):provider.reviewDecision({context}),hasCode('provider_unavailable',503));
    assert.deepEqual(events,[{event:'reception_provider_failure',category:'http_error',stage,
      model:stage.startsWith('chat')?'gpt-6-luna':'gpt-6.1-sol',httpStatus:400,requestId:'req_diagnostic_fixture',
      providerErrorType:'invalid_request_error',providerErrorCode:'invalid_json_schema',providerErrorParam:'text.format.schema'}]);
    assert.ok(!JSON.stringify(events).includes(privateText));
    assert.ok(!JSON.stringify(events).includes('Authorization'));
    assert.equal(requests.length,stage.endsWith('_validation')?2:1);
  }
});

test('transport, invalid JSON, incomplete responses and invalid output retain the existing error contract',async()=>{
  const cases=[
    ['transport_error',async()=>{throw Error(privateText);},'provider_unavailable',503],
    ['invalid_json',async()=>({ok:true,status:200,headers,json:async()=>{throw Error(privateText);}}),'provider_invalid',502],
    ['response_incomplete',async()=>({ok:true,status:200,headers,json:async()=>({status:'incomplete',
      incomplete_details:{reason:'max_output_tokens'},output:privateText})}),'provider_invalid',502],
    ['invalid_output',async()=>({ok:true,status:200,headers,json:async()=>({status:'completed',
      output:[{type:'message',content:[{type:'output_text',text:privateText}]}]})}),'provider_invalid',502],
  ];
  for(const [category,fetchImpl,code,status] of cases){
    const events=[],provider=createOpenAIProvider({apiKey:privateText,fetchImpl,onDiagnostic:event=>events.push(event)});
    await assert.rejects(provider.generate(dialogue),hasCode(code,status));
    assert.equal(events.length,1);assert.equal(events[0].category,category);assert.equal(events[0].stage,'chat');
    if(category==='response_incomplete')assert.equal(events[0].incompleteReason,'max_output_tokens');
    assert.ok(!JSON.stringify(events).includes(privateText));
  }
});

test('unsafe metadata is omitted and a broken diagnostic callback never replaces a provider failure',async()=>{
  const events=[];
  const fetchImpl=async()=>({ok:false,status:429,headers:{get:()=>privateText},json:async()=>({error:{type:privateText,
    code:privateText,param:privateText,message:privateText}})});
  const provider=createOpenAIProvider({apiKey:privateText,fetchImpl,onDiagnostic:event=>events.push(event)});
  await assert.rejects(provider.generate(dialogue),hasCode('provider_busy',503));
  assert.deepEqual(events,[{event:'reception_provider_failure',category:'http_error',stage:'chat',model:'gpt-6-luna',httpStatus:429}]);
  for(const onDiagnostic of [()=>{throw Error(privateText);},async()=>{throw Error(privateText);},null]){
    await assert.rejects(createOpenAIProvider({apiKey:privateText,fetchImpl,onDiagnostic}).generate(dialogue),hasCode('provider_busy',503));
  }
  await new Promise(resolve=>setImmediate(resolve));
});
