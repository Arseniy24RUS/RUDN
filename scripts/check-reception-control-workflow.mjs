/** Read-only local/CI coverage of the authored execution workflow.
 * Builds narrow frozen test contexts, NOT a production private catalogue/exporter.
 * No Firebase, network, seeding or model calls. Scripted commands test mechanics;
 * their acceptance is not evidence of semantic grading accuracy.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {instantiateCase} from '../site/apps/reception/js/cases.js';
import {caseDeadlineWithSnapshot} from '../site/apps/reception/js/case-time.js';
import {getCorrespondenceProfile} from '../firebase/functions/reception-ai/correspondence-profiles.mjs';
import {buildCorrespondenceReview} from '../firebase/functions/reception-ai/correspondence.mjs';
import {estimateReviewReservation} from '../firebase/functions/reception-ai/provider.mjs';
import {createControlWorkflow,applyControlAction,publicControlWorkflow,controlReviewContext,controlWorkflowReviewSize,validateControlSubmission} from '../firebase/functions/reception-ai/control-workflow.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const T=value=>({ru:value,en:value,zh:value});
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
function frozenContext(payload,source,packId){
  const t=instantiateCase(payload.template,packId),id=payload.template.id;
  return {id,version:'execution-coverage-context-v1',datePackId:packId,
    provenance:{sourceCaseId:id,sourceContentVersion:t.contentVersion,sourceSHA256:createHash('sha256').update(source).digest('hex'),calendarYear:t.calendarYear,dateValues:t.dateValues},
    public:{title:T(t.title),role:{title:T(t.role.title),text:T(t.role.text)},citizen:{name:T(t.citizen.name)},opening:T(t.opening),date:t.dateValues.registeredISO||t.calendar.events[0].date,
      actions:t.actions.map(action=>({id:action.id,label:T(action.title)})),assessment:{calendar:{events:t.calendar.events}}},
    facts:t.questions.map(q=>({id:q.id,text:T(q.answer),knowledge:'direct',documentIds:[]})),
    documents:t.documents.map(doc=>({id:doc.id,title:T(doc.title),text:T(doc.text),factIds:[]})),
    rubric:{deadline:caseDeadlineWithSnapshot(t).finalDate,explanation:T(t.factTask.explain),
      requiredActionIds:t.actions.filter(a=>a.good).map(a=>a.id),forbiddenActionIds:t.actions.filter(a=>!a.good).map(a=>a.id),
      criticalActionIds:(t.criticalRules||[]).filter(r=>r.kind==='selected').map(r=>r.id),
      authored:{decisionPlans:t.decisionPlans||[],criticalRules:t.criticalRules||[],
        calendar:{anchor:t.calendar.anchor,rule:t.calendar.correctRule,start:t.calendar.startPolicy,acceptedShifts:t.calendar.acceptedLastDayPolicies}}},
    followup:{intro:T(t.followup.intro),correct:t.followup.correct,options:t.followup.options.map(o=>({id:o.id,label:T(o.text)})),explanation:T(t.followup.explain)}};
}
function finalControl(workflow,text='Результат каждого предмета зафиксирован в пределах полученных подтверждений.'){
  return {text,statuses:workflow.issues.map(issue=>{
    const spec=workflow.definition.issues.find(row=>row.id===issue.id),status=issue.status==='closed'?'resolved':issue.status==='referred'?'referred':'pending';
    return {issueId:issue.id,status,evidenceSourceIds:status==='resolved'?issue.verifiedEvidenceIds:
      status==='referred'?[spec.referralMaterialId||spec.responseMaterialId]:issue.materialIds.slice(0,1)};
  })};
}
function context(c,profile,decision,workflow,locale,text){
  const state={knownFactIds:c.facts.map(f=>f.id),releasedDocumentIds:c.documents.map(d=>d.id),openedDocumentIds:c.documents.map(d=>d.id),messages:[],
    decision,controlWorkflow:workflow,correspondenceInitialFeedback:{score:100}};
  return buildCorrespondenceReview(c,state,decision,locale,{profile,phase:'control',control:finalControl(workflow,text)});
}

export async function runControlWorkflowCoverage(){
  const catalog=JSON.parse(await readFile(resolve(root,'site/apps/reception/content/catalog.json'),'utf8'));
  const report={version:1,liveFirebaseVerified:false,modelQualityVerified:false,cases:[],caseCount:catalog.length,variants:0,issues:0,actions:0,closed:0,referred:0,errors:[],
    worstMaximumMemorandum:{contextBytes:0,estimatedInputAllowance:0},scope:'Local authored-data and server transition coverage only; no production sessions or model accuracy claims.'};
  let largest;
  for(const row of catalog){
    const source=await readFile(resolve(root,'site/apps/reception/content/cases/'+row.id+'.json'),'utf8'),payload=JSON.parse(source);
    for(const pack of payload.template.datePacks){
      const c=frozenContext(payload,source,pack.id),entry={caseId:c.id,datePackId:pack.id,sourceSHA256:c.provenance.sourceSHA256,issues:[]};
      try{
        const profile=getCorrespondenceProfile(c);if(!profile)throw Error('profile_unbound');
        const decision={correspondence:{version:1,kind:'reply',subject:'Coverage fixture',sections:{facts:'',legalBasis:'',resolution:'',nextSteps:''},citations:[],orders:[]}};
        let workflow=createControlWorkflow({caseData:c,profile,decision,timestamp:1000});
        entry.definitionHash=workflow.definitionHash;
        for(const spec of workflow.definition.issues){
          const current=workflow.issues.find(i=>i.id===spec.id),initial=current.materialIds[0],commands=[];
          const action=kind=>({issueId:spec.id,kind,reason:'Проверка результата по данному предмету.',
            instruction:'Предоставьте относимое подтверждение: '+(typeof spec.scope==='string'?spec.scope:spec.scope.ru),
            recipientIds:spec.acceptedRecipientSets[0],dueDate:c.rubric.deadline,expectedResult:'Документ, позволяющий проверить именно данный предмет и объём результата.',evidenceSourceIds:[initial]});
          const apply=(command,expectedOutcome)=>{
            const requestId='coverage-'+workflow.revision,expectedRevision=workflow.revision;
            workflow=applyControlAction(workflow,null,command,{caseData:c,timestamp:1000+workflow.revision,requestId,expectedRevision});
            const outcome=workflow.journal.at(-1).outcome;
            if(outcome!==expectedOutcome)throw Error(command.kind+':'+outcome+':'+spec.id);
            commands.push({requestId,expectedRevision,action:command,outcome,eventId:workflow.journal.at(-1).id});report.actions++;
          };
          apply(action('request_evidence'),'request_received');
          const proof=spec.evidenceMaterialIds.find(id=>workflow.materials.find(m=>m.id===id)?.verification==='confirmation');
          let completion;
          if(proof){
            apply({...action('verify'),evidenceSourceIds:[proof]},'evidence_verified');
            apply({...action('notify'),evidenceSourceIds:[proof]},'notice_recorded');
            apply({...action('close'),evidenceSourceIds:[proof]},'closed');completion='resolved';report.closed++;
          }else{
            apply({...action('refer'),evidenceSourceIds:[spec.referralMaterialId||spec.responseMaterialId]},'referred');completion='referred';report.referred++;
          }
          entry.issues.push({issueId:spec.id,scope:spec.scope,completion,commands});report.issues++;
        }
        if(!validateControlSubmission(workflow,null,finalControl(workflow)).valid)throw Error('final_validation_failed');
        entry.workflowSize=controlWorkflowReviewSize(workflow);
        for(const locale of ['ru','en','zh']){
          publicControlWorkflow(workflow,null,locale);controlReviewContext(workflow,null,locale);
          // U+0001 is accepted by the current text schema and expands sixfold in
          // JSON. This is larger than 6000 Cyrillic/Chinese characters.
          const review=context(c,profile,decision,workflow,locale,'\u0001'.repeat(6000));
          const contextBytes=bytes(review),estimatedInputAllowance=estimateReviewReservation({context:review}).perCallInputTokens;
          if(contextBytes>report.worstMaximumMemorandum.contextBytes){
            report.worstMaximumMemorandum={caseId:c.id,datePackId:pack.id,locale,contextBytes,estimatedInputAllowance};
            largest={c,profile,decision,workflow,locale};
          }
        }
        report.variants++;
      }catch(error){report.errors.push({caseId:row.id,datePackId:pack.id,code:error.code||error.message});}
      report.cases.push(entry);
    }
  }
  if(largest){
    const {c,profile,decision,locale}=largest;let workflow=largest.workflow;
    const target=workflow.issues[0],spec=workflow.definition.issues.find(i=>i.id===target.id);
    const base={issueId:target.id,reason:'Обоснование дальнейшей проверки.',instruction:'Сопоставить результаты с предметом.',recipientIds:spec.acceptedRecipientSets[0],dueDate:c.rubric.deadline,expectedResult:'Уточнение по предмету.',evidenceSourceIds:target.materialIds.slice(0,1)};
    workflow=applyControlAction(workflow,null,{...base,kind:'reopen'},{caseData:c,timestamp:5000,requestId:'stress-reopen',expectedRevision:workflow.revision});
    let rejectedCode=null,accepted=0;
    while(accepted<80){
      const command={...base,kind:'keep_open',instruction:accepted<2?'\u0001'.repeat(1800):'Проверить доступные материалы.'};
      try{workflow=applyControlAction(workflow,null,command,{caseData:c,timestamp:5001+accepted,requestId:'stress-'+accepted,expectedRevision:workflow.revision});accepted++;}
      catch(error){rejectedCode=error.code;break;}
    }
    // Fill the remaining prose allowance without truncating a previously
    // accepted action: each trial is a pure prospective transition.
    let low=0,high=1800,best=null;
    while(low<=high){
      const count=Math.floor((low+high)/2),command={...base,kind:'keep_open',instruction:'\u0001'.repeat(count)||'Проверить.'};
      try{const next=applyControlAction(workflow,null,command,{caseData:c,timestamp:6000,requestId:'stress-fill',expectedRevision:workflow.revision});best=next;low=count+1;}
      catch(error){if(error.code!=='control_context_limit')throw error;high=count-1;}
    }
    if(best){workflow=best;accepted++;}
    const review=context(c,profile,decision,workflow,locale,'\u0001'.repeat(6000));
    report.boundary={caseId:c.id,datePackId:c.datePackId,locale,acceptedAdditionalActions:accepted,rejectedCode,
      contextBytes:bytes(review),estimatedInputAllowance:estimateReviewReservation({context:review}).perCallInputTokens,
      workflowSize:controlWorkflowReviewSize(workflow),finalizable:validateControlSubmission(workflow,null,finalControl(workflow,'\u0001'.repeat(6000))).valid,
      note:'Stress prose has no assessed professional meaning; this exercises exact JSON-size and state-preservation bounds only.'};
    let metadata=applyControlAction(largest.workflow,null,{...base,kind:'reopen'},
      {caseData:c,timestamp:7000,requestId:'metadata-reopen',expectedRevision:largest.workflow.revision});
    let metadataAccepted=0,metadataRejected;
    while(metadataAccepted<80){
      const current=metadata.issues.find(issue=>issue.id===target.id);
      const command={...base,kind:'notify',reason:'Уведомление о текущем состоянии.',instruction:'Сообщить, что проверка продолжается.',expectedResult:'Дальнейший контроль.',evidenceSourceIds:current.materialIds.slice(-20)};
      try{metadata=applyControlAction(metadata,null,command,{caseData:c,timestamp:7001+metadataAccepted,requestId:'metadata-'+metadataAccepted,expectedRevision:metadata.revision});metadataAccepted++;}
      catch(error){metadataRejected=error.code;break;}
    }
    const metadataReview=context(c,profile,decision,metadata,locale,'\u0001'.repeat(6000));
    report.metadataBoundary={caseId:c.id,datePackId:c.datePackId,locale,acceptedAdditionalActions:metadataAccepted,rejectedCode:metadataRejected,
      contextBytes:bytes(metadataReview),estimatedInputAllowance:estimateReviewReservation({context:metadataReview}).perCallInputTokens,
      workflowSize:controlWorkflowReviewSize(metadata),finalizable:validateControlSubmission(metadata,null,finalControl(metadata,'\u0001'.repeat(6000))).valid};
  }
  report.pass=report.errors.length===0&&report.caseCount===178&&report.variants===356&&Boolean(report.boundary?.finalizable)&&Boolean(report.metadataBoundary?.finalizable);
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);if(args.some((arg,index)=>arg!=='--out'&&args[index-1]!=='--out'))throw Error('Usage: node scripts/check-reception-control-workflow.mjs [--out report.json]');
  const report=await runControlWorkflowCoverage(),out=args.includes('--out')?args[args.indexOf('--out')+1]:null;
  if(args.includes('--out')&&!out)throw Error('--out needs a path');
  if(out){await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(resolve(out),JSON.stringify(report,null,2)+'\n');}
  const {cases,...summary}=report;process.stdout.write(JSON.stringify(summary,null,2)+'\n');if(!report.pass)process.exitCode=1;
}
