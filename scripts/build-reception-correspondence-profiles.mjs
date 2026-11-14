import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  CASE_OVERRIDES,ISSUE_OVERRIDES,CASE_CONSTRAINTS,INITIAL_RESOLVED_CASES,
  REOPENED_CASES,COMPLETION_STATES,caseOverride,CONTROL_CASE_REVIEW,
  CONTROL_CONFIRMATIONS,CONTROL_ISSUE_REVIEW,CONTROL_TRANSFER_ONLY_CASES,CONTROL_PHASE_RECIPIENTS
} from './reception-correspondence-overrides.mjs';
import {ROUTING_RECIPIENTS} from '../firebase/functions/reception-ai/routing-cases.mjs';

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

/** A good action is admissible, not necessarily compulsory in every valid plan. */
function compileAcceptablePlans(t,expectedActions,forbiddenActions){
  const allowed=new Set(expectedActions.map(action=>action.id));
  const routes=new Set(t.correctRoutes);
  const authored=Array.isArray(t.decisionPlans)&&t.decisionPlans.length?t.decisionPlans:null;
  const input=authored||[{id:'authored-case-plan',routes:t.correctRoutes,requiredActions:[...allowed],order:t.order||[]}];
  requireValue(new Set(input.map(plan=>plan.id)).size===input.length,`${t.id}: duplicate decision plan`);
  const plans=input.map(plan=>{
    requireValue(typeof plan.id==='string'&&plan.id.length,`${t.id}: decision plan needs an id`);
    requireValue(Array.isArray(plan.requiredActions)&&plan.requiredActions.length,`${t.id}/${plan.id}: empty decision plan`);
    const requiredActionIds=unique(plan.requiredActions);
    requiredActionIds.forEach(id=>requireValue(allowed.has(id),`${t.id}/${plan.id}: unknown or forbidden plan action ${id}`));
    const routeIds=unique(plan.routes||t.correctRoutes);
    requireValue(routeIds.length,`${t.id}/${plan.id}: missing permitted route`);
    routeIds.forEach(id=>requireValue(routes.has(id),`${t.id}/${plan.id}: inadmissible plan route ${id}`));
    const partialOrder=plan.order||[];
    partialOrder.forEach(pair=>requireValue(Array.isArray(pair)&&pair.length===2&&pair.every(id=>requiredActionIds.includes(id)),`${t.id}/${plan.id}: order outside the plan`));
    return {
      id:plan.id,routeIds,requiredActionIds,
      forbiddenActionIds:forbiddenActions.map(action=>action.id),partialOrder,
      acceptEquivalentActions:true,independentActionsMayBeReordered:true,notAClickOrPhraseChecklist:true,
      source:sourcePointer(t.id,authored?`template.decisionPlans.${plan.id}`:'template.actions')
    };
  });
  const commonActionIds=plans[0].requiredActionIds.filter(id=>plans.every(plan=>plan.requiredActionIds.includes(id)));
  const commonPartialOrder=plans[0].partialOrder.filter(pair=>plans.every(plan=>plan.partialOrder.some(other=>other[0]===pair[0]&&other[1]===pair[1])));
  return {plans,commonActionIds,commonPartialOrder};
}

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

const CONTROL_RESULT_TYPES={
  risk:'risk-mitigation',identity:'evidence-verification',partial:'substantive-response',
  new:'new-matter-review',access:'access-restored',delivery:'dispatch-confirmed',
  redaction:'safe-copy',correction:'document-corrected',payment:'payment',
  scope:'substantive-review',version:'record-verification',procedure:'procedural-step',
  chronology:'chronology-review',explanation:'explanation',promise:'performance-confirmed'
};
const T=(ru,en,zh)=>({ru,en,zh});
const russianOriginal=text=>T(text,'Authored teaching material — Russian original:\n\n'+text,'作者编写的教学材料——俄语原文：\n\n'+text);
const controlBoundary=T(
  'Материал подтверждает только прямо описанный предмет и результат. Он не устанавливает иные факты, виновность, удовлетворение всех требований или исполнение будущих действий.',
  'This material establishes only its stated issue and result. It does not establish other facts, liability, satisfaction of every claim or future execution.',
  '本材料仅证明明确说明的事项及结果，不证明其他事实、责任认定、全部请求均已满足或未来措施已执行。'
);

/** Compile bounded fictional follow-on evidence without changing original facts. */
function compileControlWorkflow(t,override,issueSpecs,{sourceHash,primaryFinding,acceptedFollowup}){
  const row=CONTROL_CASE_REVIEW[t.id],confirmation=CONTROL_CONFIRMATIONS[t.id];
  requireValue(!!row&&!!confirmation,`${t.id}: missing individually authored control extension`);
  requireValue(!!CONTROL_RESULT_TYPES[row.episodeType],`${t.id}: unknown control episode type`);
  requireValue(ROUTING_RECIPIENTS[t.id]?.length,`${t.id}: missing authored routing`);
  const prefix=`workflow-${t.id}`,eventId=prefix+'-event',materials=[],issues=[];
  const material=(id,issueIds,title,text,{kind='execution-record',verification='confirmation',original=false,sourceDocumentIds=[],sourcePointer: pointer}={})=>{
    requireValue(!materials.some(item=>item.id===id),`${t.id}: duplicate control material ${id}`);
    const value={id,issueIds,title,text,kind,verification,
      provenance:{kind:original?'original-case':'authored-control-extension',sourceCaseId:t.id,
        ...(pointer?{sourcePointer:pointer}:{}),...(!original?{authoringVersion:1}:{} )},
      sourceDocumentIds,factsDoNotEstablish:controlBoundary};
    materials.push(value);return id;
  };
  const extensionTitle=(ru,caseId=t.id)=>T(ru,`Follow-on record — ${caseId}`,`后续记录 — ${caseId}`);
  function build(spec,{newMatter=false,previousMatter=false}={}){
    const specific=CONTROL_ISSUE_REVIEW[t.id]?.[spec.id]||{};
    const phase=CONTROL_PHASE_RECIPIENTS[t.id]?.[spec.id];
    const knownOriginal=previousMatter&&INITIAL_RESOLVED_CASES.has(t.id);
    const initialProof=specific.initialProof||(knownOriginal?'documents':null);
    const scope=previousMatter
      ? `Самостоятельная фиксация результата прежнего вопроса «${spec.title}» и его границ; последующее новое обстоятельство сюда не входит.`
      : specific.scope||row.verificationGoal;
    const goal=previousMatter
      ? `Сверить первоначальный предмет «${spec.title}» и пределы установленного до нового события.`
      : specific.goal||row.verificationGoal;
    const outcome=previousMatter
      ? `В отдельной записи сохранён результат по первоначальным материалам: ${primaryFinding.join(' ')} Новое событие выделено в самостоятельный предмет. Эта запись не подменяет последующую проверку и не объявляет все будущие требования исполненными.`
      : specific.confirmation||confirmation;
    const resultType=previousMatter?'prior-result-scope':phase?.resultType||specific.resultType||CONTROL_RESULT_TYPES[row.episodeType];
    const transferOnly=!previousMatter&&!newMatter&&CONTROL_TRANSFER_ONLY_CASES.has(t.id);
    const allowReferral=!previousMatter&&(override.kind==='referral'||t.id==='anonymous-danger');
    const responseId=prefix+'-'+spec.id+'-result',receiptId=prefix+'-'+spec.id+'-receipt';
    const initialMaterialIds=[eventId],evidenceMaterialIds=[];
    material(responseId,[spec.id],extensionTitle(goal),russianOriginal(outcome),{
      verification:transferOnly?'delivery':'confirmation',kind:transferOnly?'delivery-receipt':'execution-record'
    });
    evidenceMaterialIds.push(responseId);
    if(initialProof){
      const proofId=prefix+'-'+spec.id+'-original-proof';
      if(initialProof==='event'){
        material(proofId,[spec.id],T('Результат из поступившего события','Result stated in the received event','收到事件中已说明的结果'),t.followup.intro,
          {kind:'author-event',verification:'confirmation',original:true,sourcePointer:sourcePointer(t.id,'template.followup.intro')});
      }else{
        const docIds=unique((spec.evidence||[t.factTask.evidence]).flat());
        const docs=docIds.map(id=>t.documents.find(doc=>doc.id===id));
        requireValue(docs.every(Boolean),`${t.id}/${spec.id}: missing original control proof`);
        material(proofId,[spec.id],T('Относимые материалы первоначального дела','Relevant original case documents','原案相关材料'),docs.map(doc=>doc.text).join('\n\n'),
          {kind:'case-document',verification:'confirmation',original:true,sourceDocumentIds:docIds,sourcePointer:sourcePointer(t.id,'template.documents')});
      }
      initialMaterialIds.push(proofId);evidenceMaterialIds.push(proofId);
    }
    let referralMaterialId;
    if(allowReferral){
      if(transferOnly)referralMaterialId=responseId;
      else{
        referralMaterialId=material(receiptId,[spec.id],T('Учебная квитанция получения материалов','Simulated acknowledgement of receipt','模拟材料接收凭据'),
          russianOriginal(`Компетентный адресат, проверенный для данного предмета, подтвердил получение относимого пакета по вопросу: ${goal} В квитанции речь о получении материалов; ремонт, выплата, виновность и решение по существу ею не подтверждаются.`),
          {kind:'delivery-receipt',verification:'delivery'});
      }
    }
    return {
      id:spec.id,title:spec.title,resultType,scope,
      initialStatus:initialProof?'resolved':'pending',initialMaterialIds,evidenceMaterialIds,
      deliveryRequired:true,allowReferral,responseMaterialId:responseId,
      ...(referralMaterialId?{referralMaterialId}:{}),
      acceptedRecipientSets:structuredClone(phase?.sets||specific.recipients||ROUTING_RECIPIENTS[t.id]),
      recipientScope:phase?'authored-control-phase':specific.recipients?'subject-specific-authored-routing':'case-level-authored-routing',
      ...(phase?{recipientBasis:{kind:'authored-control-phase',sourcePointer:sourcePointer(t.id,phase.source.split(',')[0]),sourcePointers:phase.source.split(',').map(pointer=>sourcePointer(t.id,pointer)),reason:phase.reason}}:{}),
      closureText:previousMatter
        ? 'Прежний результат сохранён в пределах исходных материалов; новое обстоятельство имеет отдельный предмет и не меняет прошлое задним числом.'
        : specific.scope||row.completionScope,
      continuationText:previousMatter
        ? 'Если первоначальный результат или его доведение не подтверждены, сохранить контроль этой части отдельно от нового предмета.'
        : `${acceptedFollowup.text} До получения и проверки относимого результата завершение данного предмета не подтверждено.`,
      professionalResultOnly:true,newIssue:null
    };
  }
  for(const spec of issueSpecs){
    const hasNew=!!row.newSubjectTitle&&spec===issueSpecs[0];
    const issue=build(spec,{previousMatter:hasNew});
    if(hasNew){
      issue.newIssue=build({id:'new-matter',title:row.newSubjectTitle},{newMatter:true});
      issue.newIssue.relationship={kind:'new-circumstance',previousIssueId:spec.id,originalEvent:sourcePointer(t.id,'template.followup.intro')};
    }
    issues.push(issue);
  }
  const allIssues=issues.flatMap(issue=>[issue,...(issue.newIssue?[issue.newIssue]:[])]);
  material(eventId,allIssues.map(issue=>issue.id),T('Новое событие дела','New case event','案件新事件'),t.followup.intro,{
    kind:'author-event',original:true,verification:['identity','scope','chronology'].includes(row.episodeType)?'mismatch':'insufficient',
    sourcePointer:sourcePointer(t.id,'template.followup.intro')
  });
  return {
    version:'execution-v1',provenance:{kind:'authored-control-extension',sourceCaseId:t.id,sourceSHA256:sourceHash,version:1},
    episodeType:row.episodeType,issues,materials,initialMaterialIds:[eventId],
    originalEventPreserved:true,noInventedOfficialRequisites:true,
    authoredExtensionLanguage:'ru',translatedInterfaceFramingOnly:true
  };
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
  const planRequirements=compileAcceptablePlans(t,expectedActions,forbiddenActions);
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
    acceptablePlans:planRequirements.plans,
    actionRequirements:{
      commonActionIds:planRequirements.commonActionIds,
      acceptablePlanIds:planRequirements.plans.map(plan=>plan.id),
      selection:'one_coherent_admissible_plan',
      expectedActionsIsAdmissibleCatalogue:true,doNotUnionAlternativeRequirements:true
    },
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
        expectedActionIds:planRequirements.commonActionIds,forbiddenActionIds:forbiddenActions.map(action=>action.id),
        acceptablePlanIds:planRequirements.plans.map(plan=>plan.id),
        alternativeRequirementPolicy:'Достаточен один целостный допустимый план, соответствующий выбранному маршруту. Требования разных альтернатив не суммируются; expectedActionIds содержит только общие обязательные действия.',
        correctProcedure,correctRoutes,partialOrder:planRequirements.commonPartialOrder,
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
      simulatedEvent:true,
      workflow:compileControlWorkflow(t,override,issueSpecs,{sourceHash:sourceHash||sha256(JSON.stringify(payload)),primaryFinding,acceptedFollowup})
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
    alternativePlanCaseIds:Object.values(profiles).filter(profile=>profile.acceptablePlans.length>1).map(profile=>profile.caseId),
    controlWorkflow:{
      version:'execution-v1',caseCount:ids.length,
      issueCount:Object.values(profiles).reduce((sum,profile)=>sum+profile.control.workflow.issues.reduce((n,issue)=>n+1+(issue.newIssue?1:0),0),0),
      newIssueCount:Object.values(profiles).reduce((sum,profile)=>sum+profile.control.workflow.issues.filter(issue=>issue.newIssue).length,0),
      materialCount:Object.values(profiles).reduce((sum,profile)=>sum+profile.control.workflow.materials.length,0),
      initialResolvedCount:Object.values(profiles).reduce((sum,profile)=>sum+profile.control.workflow.issues.flatMap(issue=>[issue,...(issue.newIssue?[issue.newIssue]:[])]).filter(issue=>issue.initialStatus==='resolved').length,0),
      episodeTypeCounts:Object.values(profiles).reduce((acc,profile)=>{const key=profile.control.workflow.episodeType;acc[key]=(acc[key]||0)+1;return acc;},{}),
      phaseRecipientCaseIds:Object.keys(CONTROL_PHASE_RECIPIENTS).sort(),
      sourceCaseFactsUnchanged:true,authoredExtensionLanguage:'ru',independentlyLegallyRevalidated:false
    },
    sourceBankSHA256:sha256(ids.map(id=>`${id}:${profiles[id].provenance.sourceSHA256}`).join('\n')),
    familyCoverage:families,
    documentKindCounts:Object.values(profiles).reduce((acc,profile)=>{acc[profile.documentKind]=(acc[profile.documentKind]||0)+1;return acc;},{}),
    privateOnly:true,generatedBy:'scripts/build-reception-correspondence-profiles.mjs'
  };
  const bank={meta,profiles};
  const serialised=JSON.stringify(bank,null,2)+'\n';
  if(check){
    const existing=await readFile(outputFile,'utf8');
    requireValue(existing.replaceAll('\r\n','\n')===serialised,'Private correspondence profiles are stale; rebuild from authored cases');
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
