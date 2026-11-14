#!/usr/bin/env node
/** Offline full-bank submission audit. No Firebase writes, real students or paid models.
 * Private dossiers remain outside site/ and are never included in this report.
 */
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {checkCorrespondenceCatalog} from './check-reception-correspondence-catalog.mjs';
import {buildBankDecision,buildBankControl} from './reception-bank-submission-fixtures.mjs';
import {checkRecipientSubmissionContexts} from './check-reception-recipient-submissions.mjs';
import {explicitQAReview} from './reception-correspondence-qa-cases.mjs';
import {createMemoryStore} from '../firebase/functions/reception-ai/store.mjs';
import {createReceptionService} from '../firebase/functions/reception-ai/service.mjs';
import {createOpenAIProvider} from '../firebase/functions/reception-ai/provider.mjs';
import {ROUTING_AUTHORITIES,ROUTING_AUTHORITY_ALIASES} from '../firebase/functions/reception-ai/routing-directory.mjs';
import {ROUTING_RECIPIENTS} from '../firebase/functions/reception-ai/routing-cases.mjs';

const LOCALES=['ru','en','zh'];
const MODES=[
 {name:'assessment',mode:'independent',context:'seminar',level:4},
 {name:'assessment-zero',mode:'independent',context:'seminar',level:0},
 {name:'training',mode:'training',context:'seminar',level:2},
 {name:'guest',mode:'training',context:'free',level:2,guest:true},
];
const regional=Object.keys(ROUTING_AUTHORITIES).filter(id=>id.startsWith('ru-')&&!Object.hasOwn(ROUTING_AUTHORITY_ALIASES,id));
const aliases=Object.keys(ROUTING_AUTHORITY_ALIASES);
const roundtrip=value=>value==null?value:JSON.parse(JSON.stringify(value));
function assertDecision(stored,submitted){
 assert.deepEqual(stored?.correspondence,submitted.correspondence);
 assert.deepEqual(stored?.workbook,submitted.workbook);
 assert.equal(stored?.deadline,submitted.deadline);
}
function jsonStore(){
 const memory=createMemoryStore();
 return {get:async path=>roundtrip(await memory.get(path)),getLegacySessionIds:memory.getLegacySessionIds,
  transaction:(path,update)=>memory.transaction(path,value=>{const next=update(roundtrip(value));return next===undefined?undefined:roundtrip(next);})};
}
const siteOf=error=>String(error?.stack||'').split('\n').slice(1).map(line=>line.match(/(?:reception-ai\/|scripts\/)[A-Za-z0-9_-]+\.mjs:\d+:\d+/)?.[0]).filter(Boolean)[0]||null;

export async function checkBankSubmissions({casesDirectory,smoke=0,onProgress=()=>{}}={}){
 const report={status:'FAIL',startedAt:new Date().toISOString(),scope:smoke?'smoke':'all-live-bank-snapshot',networkCalls:0,paidModelCalls:0,productionWrites:0,
  methodology:'Actual service, JSON persistence and provider parser; scripted HTTP model responses, not AI/legal-quality validation.',
  catalog:null,counts:{cases:0,variants:0,flows:0,completed:0,initialReviews:0,controls:0,preservedRetries:0,idempotentDuplicates:0,
   recoveries:0,resultWrites:0,scriptedModelRequests:0,savedPayloadChecks:0,positiveResults:0,zeroResults:0},recipients:null,failures:[]};
 report.catalog=await checkCorrespondenceCatalog({casesDirectory});
 if(report.catalog.status!=='PASS')return report;
 const cases=[];
 for(const name of (await readdir(casesDirectory)).filter(name=>name.endsWith('.json')).sort())cases.push(JSON.parse(await readFile(resolve(casesDirectory,name),'utf8')));
 report.counts.cases=cases.length;
 report.snapshotSha256=createHash('sha256').update(JSON.stringify(cases)).digest('hex');
 const allVariants=cases.flatMap(c=>[c,...(c.dateVariants||[])].map(v=>{const copy=structuredClone(v);delete copy.dateVariants;return copy;}));
 const variants=smoke?allVariants.slice(0,smoke):allVariants;
 report.counts.variants=variants.length;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=()=>{report.networkCalls++;throw Error('Bank audit forbids network calls');};
 let representative;
 try{
  for(const [index,c]of variants.entries()){
   for(const locale of LOCALES)for(const mode of MODES){
    report.counts.flows++;let stage='start';
    try{
     const store=jsonStore(),identity=mode.guest?{uid:'isolated-bank-guest',guest:true}:{uid:'isolated-bank-student',studentKey:'900000000001',teacher:false};
     const counters={requests:0,reviews:0,writes:0},failed=new Set();
     const provider=createOpenAIProvider({apiKey:'offline-fixture-not-a-key',fetchImpl:async(_url,options)=>{
      report.counts.scriptedModelRequests++;counters.requests++;
      const body=JSON.parse(options.body),format=body.text.format.name;
      let parsed;
      if(format==='citizen_reply')parsed={reply:{ru:'Уточните, пожалуйста, какой документ нужен.',en:'Which document do you need?',zh:'请问需要哪份材料？'}[locale],revealedFactIds:[],releasedDocumentIds:[]};
      else if(format==='citizen_reply_check')parsed={valid:true};
      else{
       const input=JSON.parse(body.input[0].content),context=input.context||input;
       if(format==='correspondence_review'){
        counters.reviews++;
        if(!failed.has(context.phase)){failed.add(context.phase);return new Response(JSON.stringify({error:{type:'server_error',code:'server_error'}}),{status:503});}
       }
       parsed=explicitQAReview(context,{initialLevel:mode.level,controlLevel:mode.level});
      }
      return new Response(JSON.stringify({status:'completed',model:body.model,usage:{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:0}},
       output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(parsed)}]}]}),{status:200});
     }});
     const config={enforceMonetaryBudgets:false};
     const makeService=()=>createReceptionService({store,cases:[c],provider,config,requireGameplay:true,canStartAssessment:async()=>true,
      saveResult:async()=>{counters.writes++;report.counts.resultWrites++;}});
     let service=makeService();
     let view=(await service.handle({op:'start',context:mode.context,mode:mode.mode,locale,workbookVersion:2,decisionVersion:'correspondence-v1',
      ...(!mode.guest?{studentKey:identity.studentKey}:{}),requestId:'bank-audit-start'},identity)).view;
     assert.equal(view.case.id,c.id);assert.equal(view.caseCount,1);
     stage='documents';
     for(const document of view.documents)view=(await service.handle({op:'document',sessionId:view.id,documentId:document.id,requestId:'document-'+document.id},identity)).view;
     assert.ok(view.openedDocumentIds.length);
     stage='chat';
     view=(await service.handle({op:'message',sessionId:view.id,text:'Какие материалы вы можете предоставить?',requestId:'bank-audit-chat',expectedRevision:view.revision},identity)).view;
     stage='locale-roundtrip';
     const otherLocale=LOCALES[(LOCALES.indexOf(locale)+1)%LOCALES.length];
     view=(await service.handle({op:'locale',sessionId:view.id,locale:otherLocale},identity)).view;
     view=(await service.handle({op:'locale',sessionId:view.id,locale},identity)).view;
     const recipientIds=mode.name.startsWith('assessment')?ROUTING_RECIPIENTS[c.id][0]:mode.guest?[aliases[index%aliases.length]]:[regional[index%regional.length]];
     const decision=buildBankDecision(c,view,locale,{recipientIds});
     if(mode.name==='assessment-zero'){decision.correspondence.citations=[];decision.correspondence.orders=[];}
     if(!representative&&locale==='ru')representative={caseData:c,view:structuredClone(view)};
     const request={op:'decide',sessionId:view.id,decision,requestId:'bank-audit-decision',expectedRevision:view.revision};
     stage='initial-failure-preservation';
     await assert.rejects(service.handle(request,identity),error=>error.code==='provider_unavailable');
     let saved=await store.get('sessions/'+view.id),state=saved.caseStates[0];
     assertDecision(state.correspondenceDraft,decision);report.counts.savedPayloadChecks++;assert.equal(state.reviewPending.status,'retry');assert.equal(saved.lease,null);
     assert.equal(state.correspondenceInitialFeedback,undefined);report.counts.preservedRetries++;
     stage='initial-resume-retry';
     service=makeService();view=(await service.handle({op:'resume',sessionId:view.id},identity)).view;report.counts.recoveries++;
     view=(await service.handle(request,identity)).view;report.counts.initialReviews++;
     saved=await store.get('sessions/'+view.id);assertDecision(saved.caseStates[0].decision,decision);report.counts.savedPayloadChecks++;
     let calls=counters.requests;let duplicate=(await service.handle(request,identity)).view;
     assert.equal(counters.requests,calls);assert.equal(duplicate.revision,view.revision);report.counts.idempotentDuplicates++;
     if(c.followup){
      assert.equal(view.status,'followup');stage='control-build';
      const control=buildBankControl(c,view,locale);if(mode.name==='assessment-zero')control.statuses=[];
      const followup={op:'followup',sessionId:view.id,control,requestId:'bank-audit-control',expectedRevision:view.revision};
      stage='control-failure-preservation';
      await assert.rejects(service.handle(followup,identity),error=>error.code==='provider_unavailable');
      saved=await store.get('sessions/'+view.id);state=saved.caseStates[0];
      assert.deepEqual(state.controlDraft,control);assert.equal(state.reviewPending.status,'retry');assert.equal(saved.lease,null);report.counts.preservedRetries++;
      stage='control-resume-retry';service=makeService();view=(await service.handle({op:'resume',sessionId:view.id},identity)).view;report.counts.recoveries++;
      view=(await service.handle(followup,identity)).view;report.counts.controls++;
      saved=await store.get('sessions/'+view.id);assert.deepEqual(saved.caseStates[0].control,control);report.counts.savedPayloadChecks++;
      calls=counters.requests;duplicate=(await service.handle(followup,identity)).view;
      assert.equal(counters.requests,calls);assert.equal(duplicate.revision,view.revision);report.counts.idempotentDuplicates++;
     }
     stage='completion';assert.equal(view.status,'review');
     view=(await service.handle({op:'next',sessionId:view.id,requestId:'bank-audit-complete'},identity)).view;
     assert.equal(view.status,'complete');assert.ok(Number.isFinite(view.result.points));
     assert.ok(view.result.points>=0&&view.result.points<=view.result.maxPoints);
     assertDecision(view.result.cases[0].decision,decision);report.counts.savedPayloadChecks++;
     if(c.followup){assert.deepEqual(view.result.cases[0].control,saved.caseStates[0].control);report.counts.savedPayloadChecks++;}
     report.counts[view.result.points>0?'positiveResults':'zeroResults']++;
     assert.equal(counters.writes,mode.mode==='independent'?1:0);
     if(mode.name==='assessment-zero')assert.equal(view.result.points,0);
     stage='completed-recovery';service=makeService();const recovered=(await service.handle({op:'resume',sessionId:view.id},identity)).view;
     assert.deepEqual(recovered.result,view.result);assert.equal(counters.writes,mode.mode==='independent'?1:0);report.counts.recoveries++;
     report.counts.completed++;
    }catch(error){report.failures.push({caseId:c.id,datePackId:c.datePackId,locale,mode:mode.name,stage,code:error.code||error.name,site:siteOf(error)});}
   }
   if((index+1)%20===0)onProgress({variants:index+1,totalVariants:variants.length,completed:report.counts.completed,failures:report.failures.length});
  }
  if(representative){report.recipients=await checkRecipientSubmissionContexts({...representative,buildDecision:buildBankDecision});}
 }finally{globalThis.fetch=originalFetch;}
 const expected=variants.length*LOCALES.length*MODES.length;
 if(report.counts.completed===expected&&report.failures.length===0&&report.recipients?.status==='PASS'&&report.networkCalls===0)report.status=smoke?'SMOKE_PASS':'PASS';
 report.completedAt=new Date().toISOString();
 return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
 if(args.includes('--help')){console.log('node scripts/check-reception-bank-submissions.mjs --cases /private/frozen-bank [--out /audit.json] [--smoke N]\nOffline only. No live student records, network/model calls or production writes.');}
 else{
  const report=await checkBankSubmissions({casesDirectory:arg('--cases'),smoke:Number(arg('--smoke',0)),onProgress:value=>process.stderr.write(JSON.stringify({progress:value})+'\n')});
  if(arg('--out'))await writeFile(arg('--out'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));process.exitCode=['PASS','SMOKE_PASS'].includes(report.status)?0:1;
 }
}
