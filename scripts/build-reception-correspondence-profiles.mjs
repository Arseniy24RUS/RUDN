import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  CASE_OVERRIDES,ISSUE_OVERRIDES,CASE_CONSTRAINTS,INITIAL_RESOLVED_CASES,
  REOPENED_CASES,COMPLETION_STATES,caseOverride
} from './reception-correspondence-overrides.mjs';

export const PROFILE_SCHEMA_VERSION=1;
export const PROFILE_VERSION='reception-correspondence-v1';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const DEFAULT_CASE_DIRECTORY=resolve(root,'site/apps/reception/content/cases');
export const DEFAULT_OUTPUT=resolve(root,'firebase/functions/reception-ai/correspondence-profiles.json');
const unique=values=>[...new Set(values.filter(Boolean))];
const sha256=value=>createHash('sha256').update(value).digest('hex');
const selected=(options,ids)=>options.filter(item=>ids.includes(item.id));
const requireValue=(condition,message)=>{if(!condition)throw new Error(message);};
const sourcePointer=(caseId,path)=>`site/apps/reception/content/cases/${caseId}.json#${path}`;

function buildIssue(t,spec,defaultEvidence){
  const questionIds=spec.questions||t.questions.filter(q=>q.essential).map(q=>q.id);
  const documentIds=spec.documents||t.documents.filter(d=>d.id!=='dates').map(d=>d.id);
  const docSets=spec.evidence||[defaultEvidence];
  questionIds.forEach(id=>requireValue(t.questions.some(q=>q.id===id),`${t.id}: unknown question ${id}`));
  documentIds.forEach(id=>requireValue(t.documents.some(d=>d.id===id),`${t.id}: unknown document ${id}`));
  docSets.flat().forEach(id=>requireValue(documentIds.includes(id),`${t.id}: evidence ${id} outside issue documents`));
  const claims=t.questions.filter(q=>questionIds.includes(q.id)).map(q=>({
    id:q.id,text:q.fact,statement:q.answer,question:q.text,essential:!!q.essential,
    source:{kind:'dialogue',questionId:q.id,pointer:sourcePointer(t.id,`template.questions.${q.id}`)},
    availableWhen:'question_answered_or_same_fact_established_by_case_material'
  }));
  return {
    id:spec.id,title:spec.title,sourceQuestions:questionIds,docIds:documentIds,
    requiredFactIds:questionIds,acceptedDocumentSets:docSets,claims,
    requiredOutcomes:spec.outcomes||selected(t.factTask.options,t.factTask.correct).map(o=>o.text),
    evidencePolicy:{
      referenceSetsAreExamples:true,acceptEquivalentRelevantCaseEvidence:true,
      requireClaimToSourceConnection:true,documentOpenedIsNotEvidenceOfUnderstanding:true,
      statementOfCitizenIsNotAutomaticallyVerifiedFact:true
    },
    initialCompletion:{
      status:spec.initialStatus||(INITIAL_RESOLVED_CASES.has(t.id)?'resolved':'pending'),
      conditionalOnAdequateDocument:true,
      scope:'Только данный предмет и сведения, доступные до контрольного события.'
    }
  };
}

function sourceBindings(payload){
  return payload.task.bindings.map(binding=>{
    const record=payload.records.find(record=>record.id===binding.recordId);
    const fragment=record?.fragments.find(fragment=>fragment.id===binding.fragmentId);
    requireValue(!!fragment,`${payload.template.id}: missing normative binding ${binding.recordId}/${binding.fragmentId}`);
    return {
      kind:'reference-fragment',recordKind:record.kind||'',recordId:record.id,fragmentId:fragment.id,
      title:record.title,publisher:record.publisher||'',label:fragment.label||'',
      text:fragment.text,url:record.url||'',scope:record.scope||'',asOf:record.asOf||null,
      representation:record.representation||'',
      pointer:sourcePointer(payload.template.id,`records.${record.id}.fragments.${fragment.id}`)
    };
  });
}

function transferPolicy(t,override){
  if(['court-cancel','court-order-objections'].includes(t.id))return 'return_with_explanation_not_ordinary_referral';
  if(t.id==='budget-misdirected')return 'competent_holder_with_notice';
  if(t.curriculumId==='F05')return 'current_holder_must_prepare_information';
  if(t.id==='anonymous-danger')return 'service_transfer_without_individual_reply';
  if(t.curriculumId==='F37'||t.id==='noise-two-subjects')return 'separate_subjects_and_needed_attachments';
  if(['F31','F32','F33','F34','F26'].includes(t.curriculumId)||t.id==='complaint-wrong-procedure')return 'special_procedure_and_authorised_decider';
  if(override.kind==='referral')return 'verify_competence_and_notice_as_authored';
  return 'only_if_supported_by_authored_role_and_routes';
}

/** Compile the authored bank into a private semantic rubric, never a reply text. */
export function compileCorrespondenceProfile(payload,{sourceHash}={}){
  const t=payload?.template;
  requireValue(t?.id,'Case template is required');
  const override=caseOverride(t.id);
  requireValue(override.family===(t.curriculumId||'extension'),`${t.id}: editorial family mismatch`);
  requireValue(t.factTask?.evidence?.length,`${t.id}: no authored evidence`);
  requireValue(payload.task?.bindings?.length,`${t.id}: no authored legal binding`);
  const criticalRules=(t.criticalRules||[]).map(rule=>({
    ...rule,description:rule.message,
    provenance:sourcePointer(t.id,`template.criticalRules.${rule.id}`),
    requiresObservedEvidence:true,
    condition:rule.kind==='missing'?'Only when the named triggering fact was available and the required action was actually omitted.':'Only when this prohibited meaning is actually present in the submitted work.'
  }));
  const expectedActions=t.actions.filter(a=>a.good).map(a=>({id:a.id,text:a.title,detail:a.detail||'',source:sourcePointer(t.id,`template.actions.${a.id}`)}));
  const forbiddenActions=t.actions.filter(a=>!a.good).map(a=>({id:a.id,text:a.title,detail:a.detail||'',critical:criticalRules.some(r=>r.id===a.id&&r.kind==='selected'),source:sourcePointer(t.id,`template.actions.${a.id}`)}));
  const primaryFinding=selected(t.factTask.options,t.factTask.correct).map(option=>option.text);
  const issueSpecs=ISSUE_OVERRIDES[t.id]||[{id:'main',title:t.title}];
  const issues=issueSpecs.map(spec=>buildIssue(t,spec,t.factTask.evidence));
  const sources=sourceBindings(payload);
  const acceptedFollowup=t.followup.options.find(option=>option.id===t.followup.correct);
  requireValue(!!acceptedFollowup,`${t.id}: no authored control response`);
  const correctProcedure=selected(t.procedures,t.correctProcedure).map(option=>({id:option.id,text:option.text}));
  const correctRoutes=selected(t.routes,t.correctRoutes).map(option=>({id:option.id,text:option.text}));
  const knowledge=t.knowledge||{};
  const knowledgeConclusion=(knowledge.options||[]).find(option=>option.id===knowledge.correct)?.text||knowledge.explain||'';
  const constraints=unique([
    t.role?.text,override.focus,...(CASE_CONSTRAINTS[t.id]||[]),
    'Сведения и действия после контрольного события не приписываются студенту как известные при первоначальном решении.',
    'Подготовленный проект, уведомление, получение адресатом, решение уполномоченного лица и фактическое исполнение различаются.',
    'Иная доказанная формулировка или допустимый порядок независимых действий принимается без требования совпасть с образцом.',
    'Содержательная ошибка учитывается по своему основанию; её производные проявления не превращаются автоматически в несколько независимых штрафов.'
  ]);
  return {
    version:PROFILE_SCHEMA_VERSION,profileVersion:PROFILE_VERSION,caseId:t.id,
    familyId:t.curriculumId||'extension',title:t.title,topic:t.topic,
    authoredContentVersion:t.contentVersion,authoredDatePackIds:t.datePacks.map(pack=>pack.id),focus:override.focus,
    role:{title:t.role?.title||'',text:t.role?.text||''},
    documentKind:override.kind,acceptedKinds:override.acceptedKinds,
    response:{
      kind:override.kind,individualReplyRequired:t.id!=='anonymous-danger',
      internalRecordRequired:override.kind==='internal',
      requiredTopics:issues.map(issue=>({id:issue.id,title:issue.title})),
      representsDraftOnly:true,officialIssuerNotInvented:true
    },
    issues,primaryFinding,expectedActions,forbiddenActions,
    acceptablePlans:[{
      id:'authored-case-plan',requiredActionIds:expectedActions.map(action=>action.id),
      forbiddenActionIds:forbiddenActions.map(action=>action.id),
      partialOrder:t.order||[],acceptEquivalentActions:true,
      independentActionsMayBeReordered:true,notAClickOrPhraseChecklist:true
    }],
    correctProcedure,correctRoutes,
    routing:{policy:transferPolicy(t,override),accepted:correctRoutes,unacceptable:selected(t.routes,t.routes.map(route=>route.id).filter(id=>!t.correctRoutes.includes(id)))},
    criticalRules,constraints,sources,
    calendar:{...t.calendar,meaning:'This is the particular authored deadline. It is not automatically a repair, payment, service or response deadline for other subjects.'},
    criteria:{
      facts:{
        objective:'Точно изложить обстоятельства, существенные для предмета, отделив подтверждённое от заявления, предположения и отсутствующих данных.',
        requiredFindings:primaryFinding,issueIds:issues.map(issue=>issue.id),
        interpretation:t.factTask.explain,
        acceptEquivalentWording:true,doNotScoreLengthOrNumberOfQuotes:true
      },
      legalBasis:{
        objective:'Показать, почему применённая норма относится к установленным обстоятельствам и выбранному действию.',
        knowledge:{actType:knowledge.actType||'federal',number:knowledge.number||'',actDate:knowledge.actDate||'',articles:knowledge.articles||[],codeName:knowledge.codeName||null,codePart:knowledge.codePart||null,unitKind:knowledge.unitKind||'article',sourceId:knowledge.sourceId||null},
        expectedApplication:knowledgeConclusion,explanation:knowledge.explain||payload.task.explain,
        sourceBindings:sources.map(source=>({recordId:source.recordId,fragmentId:source.fragmentId})),
        researchExplanation:payload.task.explain,allowEquivalentCorrectAuthority:true,
        citationAloneIsNotApplication:true,doNotRequireOnlyTheListedExcerpt:true
      },
      resolution:{
        objective:'Сформулировать исполнимое решение по каждому поставленному вопросу в пределах роли и применимой процедуры.',
        expectedActionIds:expectedActions.map(action=>action.id),forbiddenActionIds:forbiddenActions.map(action=>action.id),
        correctProcedure,correctRoutes,partialOrder:t.order||[],
        roleBoundary:t.role?.text||'',draftIsNotExecutedAction:true
      },
      nextSteps:{
        objective:t.id==='anonymous-danger'?'Зафиксировать надлежащую передачу и контроль без вымышленной доставки ответа неизвестному автору.':'Понятно сообщить доступный гражданину следующий шаг и порядок контроля, не обещая неустановленного результата.',
        rightsAction:expectedActions.find(action=>action.id===t.rightsAction)||null,
        monitoringActions:expectedActions.filter(action=>/^(?:track|a4)$/.test(action.id)),
        calendar:t.calendar,
        doNotUseFutureControlEventInInitialGrade:true,
        noAutomaticRequirementForNewTaskWhenExplanationIsSufficient:true
      }
    },
    control:{
      prompt:t.followup.intro,source:sourcePointer(t.id,'template.followup.intro'),
      expectedOutcomes:unique([acceptedFollowup.text,t.followup.explain]),
      forbiddenOutcomes:t.followup.options.filter(option=>option.id!==t.followup.correct).map(option=>({id:option.id,text:option.text})),
      expectedStatuses:issueSpecs.map(spec=>({
        issueId:spec.id,
        allowedStatuses:spec.controlStatus==='resolved'?['resolved']:(override.kind==='referral'||t.id==='anonymous-danger'?['pending','referred']:['pending']),
        scope:spec.controlStatus==='resolved'?'Подтверждённая в материалах или данном событии часть; не всё обращение.':'Состояние именно этого предмета после данного события, без вымышленного результата следующей проверки.'
      })),
      initialResolutionMayBeReopened:REOPENED_CASES.has(t.id),
      criticalRules:[],
      authoredFeedback:{success:t.followup.success||'',failure:t.followup.failure||''},
      authoredFeedbackDoesNotProveCompletion:true,
      simulatedEvent:true
    },
    completionStates:COMPLETION_STATES,
    provenance:{
      sourceFile:`site/apps/reception/content/cases/${t.id}.json`,
      sourceSHA256:sourceHash||sha256(JSON.stringify(payload)),
      authority:'authored-case-bank',
      editorialOverride:`scripts/reception-correspondence-overrides.mjs#${t.id}`,
      legalSourcesInherited:true,independentlyRevalidated:false,
      generatedAnswerText:false
    }
  };
}

export async function buildCorrespondenceProfiles({caseDirectory=DEFAULT_CASE_DIRECTORY,outputFile=DEFAULT_OUTPUT,check=false,write=true}={}){
  const catalog=JSON.parse(await readFile(resolve(caseDirectory,'../catalog.json'),'utf8'));
  const ids=catalog.map(item=>item.id).sort();
  requireValue(new Set(ids).size===ids.length,'Duplicate case in catalog');
  requireValue(ids.length===178,`Expected all 178 authored cases; received ${ids.length}`);
  const registryIds=Object.keys(CASE_OVERRIDES).sort();
  requireValue(JSON.stringify(ids)===JSON.stringify(registryIds),'Editorial registry must cover exactly the published catalog');
  const profiles={};
  for(const id of ids){
    const bytes=await readFile(resolve(caseDirectory,`${id}.json`),'utf8');
    const payload=JSON.parse(bytes);
    requireValue(payload.template.id===id,`${id}: file and template mismatch`);
    profiles[id]=compileCorrespondenceProfile(payload,{sourceHash:sha256(bytes)});
  }
  const families={};
  for(const profile of Object.values(profiles))(families[profile.familyId]??=[]).push(profile.caseId);
  requireValue(Object.keys(families).filter(key=>key!=='extension').length===42,'Expected 42 curriculum families');
  requireValue(families.extension?.length===3,'Expected three authored extensions');
  const meta={
    version:PROFILE_SCHEMA_VERSION,profileVersion:PROFILE_VERSION,caseCount:ids.length,
    curriculumFamilyCount:42,curriculumCaseCount:ids.length-families.extension.length,
    extensionCount:families.extension.length,extensionIds:families.extension,
    dateVariantCount:Object.values(profiles).reduce((sum,profile)=>sum+profile.authoredDatePackIds.length,0),
    multiSubjectCount:Object.values(profiles).filter(profile=>profile.issues.length>1).length,
    individuallyConstrainedCaseIds:Object.keys(CASE_CONSTRAINTS).sort(),
    caseIdsWithoutIndividualReply:Object.values(profiles).filter(profile=>!profile.response.individualReplyRequired).map(profile=>profile.caseId),
    authoredCriticalRuleCount:Object.values(profiles).reduce((sum,profile)=>sum+profile.criticalRules.length,0),
    noAuthoredCriticalRuleCaseIds:Object.values(profiles).filter(profile=>!profile.criticalRules.length).map(profile=>profile.caseId),
    sourceBankSHA256:sha256(ids.map(id=>`${id}:${profiles[id].provenance.sourceSHA256}`).join('\n')),
    familyCoverage:families,
    documentKindCounts:Object.values(profiles).reduce((acc,profile)=>{acc[profile.documentKind]=(acc[profile.documentKind]||0)+1;return acc;},{}),
    privateOnly:true,generatedBy:'scripts/build-reception-correspondence-profiles.mjs'
  };
  const bank={meta,profiles};
  const serialised=JSON.stringify(bank,null,2)+'\n';
  if(check){
    const existing=await readFile(outputFile,'utf8');
    requireValue(existing===serialised,'Private correspondence profiles are stale; rebuild from authored cases');
  }else if(write){
    await mkdir(dirname(outputFile),{recursive:true});
    await writeFile(outputFile,serialised);
  }
  return bank;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await buildCorrespondenceProfiles({check:process.argv.includes('--check')});
  console.log(JSON.stringify({...result.meta,familyCoverage:undefined,individuallyConstrainedCaseIds:undefined},null,2));
}
