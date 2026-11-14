import {createHash} from 'node:crypto';
import {ReceptionError} from './schema.mjs';
import {ROUTING_AUTHORITY_IDS,ROUTING_AUTHORITIES} from './routing-directory.mjs';
import {correspondenceIssueTitle} from './correspondence-profiles.mjs';
import {controlWorkflowSources,controlReviewContext,publicControlWorkflow} from './control-workflow.mjs';

export const DECISION_VERSION = 'correspondence-v1';
export const CORRESPONDENCE_RUBRIC_VERSION = 'correspondence-rubric-1';
export const CORRESPONDENCE_WEIGHTS = Object.freeze({
  initial: Object.freeze({facts:20, legalBasis:20, resolution:20, nextSteps:10, route:15, calendar:15}),
  control: Object.freeze({verification:40, status:30, nextAction:30}),
  combined: Object.freeze({initial:0.8, control:0.2}),
  criticalCap:60,
});
export const CORRESPONDENCE_SECTIONS = Object.freeze(['facts','legalBasis','resolution','nextSteps']);
const ORDER_KINDS = new Set(['request','referral','execution','review','notification','control']);
const STATUS = new Set(['pending','resolved','referred']);
const REVIEW_LABELS={
  ru:{issue:'Вопрос обращения',fields:['Вопрос','Действие','Адресат','Поручение','Срок','Подтверждение исполнения'],
    statuses:['Оставить на контроле','Исполнение подтверждено','Передано по компетенции'],
    orders:['Запросить материалы','Направить по компетенции','Организовать исполнение','Провести проверку','Уведомить','Проверить результат'],
    kinds:['Ответ заявителю','Уведомление','Направление по компетенции','Запрос материалов','Возврат с разъяснением','Служебный документ','Проект решения / постановления']},
  en:{issue:'Appeal issue',fields:['Issue','Action','Recipient','Instruction','Deadline','Evidence of completion'],
    statuses:['Keep under review','Completion confirmed','Referred to a competent body'],
    orders:['Request materials','Refer to the competent body','Arrange implementation','Conduct a review','Notify','Check the result'],
    kinds:['Reply to the applicant','Notice','Referral to a competent body','Request for materials','Return with explanation','Internal document','Draft decision / order']},
  zh:{issue:'来信问题',fields:['问题','行动','接收方','任务说明','执行期限','完成结果的证明'],
    statuses:['继续监督','已确认执行','已按职权转送'],
    orders:['请求材料','按职权转送','组织执行','开展核查','通知','核查结果'],
    kinds:['答复申请人','通知','按职权转送','材料请求','退回并说明','内部文书','决定 / 命令草案']},
};
const DOCUMENT_KINDS=['reply','notification','referral','request','return','internal','special'];
const STATUS_INDEX=[...STATUS];
const ORDER_INDEX=[...ORDER_KINDS];
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
const clone = value => structuredClone(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const local = (value,locale='ru') => typeof value === 'string' ? value : value?.[locale] || value?.ru || '';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const reject = (code='invalid_correspondence',status=400) => {throw new ReceptionError(code,status);};
const keys = (value,allowed) => {if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))reject();return value;};
function boundedText(value,max,{empty=true}={}) {
  if(typeof value!=='string'||value.length>max||value.includes('\0')||(!empty&&!value.trim()))reject();
  return value.trim();
}
function id(value,max=300) {
  if(typeof value!=='string'||!value||value.length>max||!/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(value)||['__proto__','prototype','constructor'].includes(value))reject();
  return value;
}
const unique = values => new Set(values).size===values.length;
function array(value,max) {if(!Array.isArray(value)||value.length>max)reject();return value;}
const validDate = value => {
  if(value==='')return true;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  try{return new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}catch{return false;}
};
export const normalizeCitationText = value => String(value??'').normalize('NFC').replace(/\s+/gu,' ').trim();
const quoteOccurs = (quote,text) => Boolean(normalizeCitationText(quote))&&normalizeCitationText(text).includes(normalizeCitationText(quote));

// Changing the interface language does not revoke an authentic quotation that
// was taken from another canonical translation of the same opened document.
function citationSource(c,state,citation,locale) {
  if(citation.kind==='dialogue')return publicCorrespondenceSources(c,state,locale)
    .find(source=>source.kind==='dialogue'&&source.id===citation.sourceId&&quoteOccurs(citation.quote,source.text));
  if(citation.kind!=='document'||!(state.openedDocumentIds||[]).includes(citation.sourceId))return null;
  const document=c.documents.find(document=>document.id===citation.sourceId);
  if(!document)return null;
  const languages=[...new Set([locale,'ru','en','zh'])];
  const variants=typeof document.text==='string'?[{language:null,text:document.text}]:
    languages.filter(language=>typeof document.text?.[language]==='string').map(language=>({language,text:document.text[language]}));
  const variant=variants.find(variant=>quoteOccurs(citation.quote,variant.text));
  return variant?{id:document.id,kind:'document',title:local(document.title,variant.language||locale),...variant,
    ...(document.url?{url:document.url}:{})}:null;
}

function observedFacts(c,state) {
  const opened=new Set(state.openedDocumentIds||[]),observed=new Set(state.knownFactIds||[]);
  for(const document of c.documents)if(opened.has(document.id))for(const factId of document.factIds||[])observed.add(factId);
  for(const fact of c.facts)if((fact.documentIds||[]).some(id=>opened.has(id)))observed.add(fact.id);
  return observed;
}

/** Available sources are evidence, never model answers or unopened documents. */
export function publicCorrespondenceSources(c,state,locale='ru',{includeFollowup=false,review=false}={}) {
  const opened=new Set(state.openedDocumentIds||[]);
  const documents=c.documents.filter(doc=>opened.has(doc.id)).map(doc=>({
    id:doc.id,kind:'document',title:local(doc.title,locale),text:local(doc.text,locale),
    ...(doc.url?{url:doc.url}:{}),...(doc.image?{image:doc.image}:{}),
  }));
  const dialogue=(state.messages||[]).filter(message=>message.role==='assistant'&&typeof message.text==='string').map(message=>({
    id:message.id,kind:'dialogue',title:local({ru:'Сообщение участника дела',en:'Case participant message',zh:'当事人消息'},locale),text:message.text,
  }));
  if(includeFollowup&&c.followup)documents.push({
    id:'followup',kind:'document',title:local({ru:'Новое сообщение по делу',en:'New case information',zh:'案件新信息'},locale),text:local(c.followup.intro,locale),
  });
  const execution=includeFollowup&&state.controlWorkflow?controlWorkflowSources(state.controlWorkflow,null,locale,{review}):[];
  return [...documents,...dialogue,...execution];
}

/** Only syntax and bounds. No character counts, keywords or prose similarity earn points. */
export function validateCorrespondence(value,c,state,locale='ru') {
  keys(value,['version','kind','subject','sections','citations','orders']);
  if(value.version!==1)reject('invalid_decision_version');
  const out={version:1,kind:id(value.kind,80),subject:boundedText(value.subject,240),sections:{},citations:[],orders:[]};
  keys(value.sections,CORRESPONDENCE_SECTIONS);
  for(const section of CORRESPONDENCE_SECTIONS)out.sections[section]=boundedText(value.sections[section],6000);
  if(Object.values(out.sections).join('').length>24000)reject();
  for(const citation of array(value.citations,20)){
    keys(citation,['id','section','kind','sourceId','unitIds','quote']);
    if(!CORRESPONDENCE_SECTIONS.includes(citation.section)||!['document','dialogue','legal'].includes(citation.kind))reject();
    const row={id:id(citation.id),section:citation.section,kind:citation.kind,sourceId:id(citation.sourceId),quote:boundedText(citation.quote,4000,{empty:false})};
    if(citation.kind==='legal'){
      row.unitIds=array(citation.unitIds,40).map(value=>id(value));
      if(!row.unitIds.length||!unique(row.unitIds))reject('invalid_citation');
    }else{
      if(citation.unitIds!==undefined)reject('invalid_citation');
      if(!citationSource(c,state,row,locale))reject('invalid_citation');
    }
    out.citations.push(row);
  }
  if(!unique(out.citations.map(citation=>citation.id)))reject('invalid_citation');
  const citationIds=new Set(out.citations.map(citation=>citation.id));
  for(const order of array(value.orders,12)){
    keys(order,['id','issue','kind','recipientIds','instruction','dueDate','expectedResult','citationIds']);
    if(!ORDER_KINDS.has(order.kind))reject();
    const recipients=array(order.recipientIds,4).map(value=>id(value));
    if(!unique(recipients)||recipients.some(value=>!ROUTING_AUTHORITY_IDS.has(value)))reject('invalid_recipient');
    const refs=array(order.citationIds,20).map(value=>id(value));
    if(!unique(refs)||refs.some(value=>!citationIds.has(value)))reject('invalid_citation');
    const dueDate=boundedText(order.dueDate,10);
    if(!validDate(dueDate))reject();
    out.orders.push({
      id:id(order.id),issue:boundedText(order.issue,500),kind:order.kind,recipientIds:recipients,
      instruction:boundedText(order.instruction,2000),dueDate,expectedResult:boundedText(order.expectedResult,1000),citationIds:refs,
    });
  }
  if(!unique(out.orders.map(order=>order.id)))reject();
  if(Buffer.byteLength(JSON.stringify(out),'utf8')>180000)reject('context_limit',413);
  return out;
}

export async function resolveCorrespondenceCitations(c,state,correspondence,locale,{resolveLegalCitation,signal}={}) {
  const resolved=[];
  for(const citation of correspondence.citations){
    if(signal?.aborted)reject('citation_source_unavailable',503);
    if(citation.kind==='legal'){
      if(typeof resolveLegalCitation!=='function')reject('citation_source_unavailable',503);
      const canonical=await resolveLegalCitation({sourceId:citation.sourceId,unitIds:citation.unitIds,quote:citation.quote},{signal});
      if(!canonical||canonical.sourceId!==citation.sourceId||!quoteOccurs(citation.quote,canonical.text))reject('invalid_citation');
      resolved.push({...citation,title:canonical.title,url:canonical.url,locator:canonical.locator||'',text:canonical.text,
        contentSha256:canonical.contentSha256,version:canonical.version});
    }else{
      const source=citationSource(c,state,citation,locale);
      if(!source)reject('invalid_citation');
      resolved.push({...citation,title:source.title,url:source.url||'',locator:'',text:source.text,
        language:source.language||null,contentSha256:digest(source.text)});
    }
  }
  return resolved;
}

export function validateCorrespondenceControl(value,c,state,profile,locale='ru') {
  keys(value,['text','statuses']);
  const allowed=new Set((state.controlWorkflow?publicControlWorkflow(state.controlWorkflow,null,locale).issues:profile?.issues||[]).map(issue=>issue.id));
  const sourceIds=new Set(publicCorrespondenceSources(c,state,locale,{includeFollowup:true}).flatMap(source=>[source.id,source.kind+':'+source.id]));
  for(const citation of state.correspondenceEvidence||[])sourceIds.add(citation.id);
  const statuses=array(value.statuses,20).map(row=>{
    keys(row,['issueId','status','evidenceSourceIds']);
    if(!allowed.has(row.issueId)||!STATUS.has(row.status))reject('invalid_control');
    const evidence=array(row.evidenceSourceIds,20).map(value=>id(value));
    if(!unique(evidence)||evidence.some(value=>!sourceIds.has(value)))reject('invalid_control');
    return {issueId:row.issueId,status:row.status,evidenceSourceIds:evidence};
  });
  if(!unique(statuses.map(row=>row.issueId)))reject('invalid_control');
  return {text:boundedText(value.text,6000),statuses};
}

function criticalRules(c,state,profile,phase,locale) {
  const rules=phase==='control'?profile?.control?.criticalRules:profile?.criticalRules;
  const rows=(rules||[]).map((row,index)=>({id:String(row.id||'profile-'+index),text:local(row.description||row.message||row,locale),
    ...(row.kind?{kind:row.kind}:{}),...(row.knownQuestion?{knownQuestion:row.knownQuestion}:{}),
    ...(row.condition?{condition:row.condition}:{}),requiresObservedEvidence:row.requiresObservedEvidence===true}));
  if(phase==='initial'){
    for(const rule of c.rubric.authored?.criticalRules||[]){
      const existing=rows.find(row=>row.id===rule.id);
      if(existing){existing.kind=rule.kind;if(rule.knownQuestion)existing.knownQuestion=rule.knownQuestion;continue;}
      const action=c.public.actions.find(action=>action.id===rule.id);
      rows.push({...rule,requiresObservedEvidence:true,text:(rule.kind==='missing'?'Required action: ':'Forbidden action: ')+local(action?.label,locale)});
    }
    for(const actionId of c.rubric.criticalActionIds||[]){
      if(!rows.some(row=>row.id===actionId))rows.push({id:actionId,kind:'selected',requiresObservedEvidence:true,
        text:'Forbidden action: '+local(c.public.actions.find(action=>action.id===actionId)?.label,locale)});
    }
  }
  const observed=observedFacts(c,state),conditions=new Set([
    'Only when the named triggering fact was available and the required action was actually omitted.',
    'Only when this prohibited meaning is actually present in the submitted work.',
  ]);
  return rows.filter(row=>row.text).map(row=>({...row,applicable:
    (!row.knownQuestion||observed.has(row.knownQuestion))&&(!row.kind||['selected','missing'].includes(row.kind))&&
    (!row.condition||conditions.has(row.condition))}));
}

/** The frozen session dossier outranks generic profiles, particularly every date variant. */
export function buildCorrespondenceReview(c,state,decision,locale='ru',{profile,resolvedCitations=[],phase='initial',control=null,operational=null,workbook=null}={}) {
  const execution=phase==='control'&&state.controlWorkflow?controlReviewContext(state.controlWorkflow,profile,locale):null;
  const accessible=publicCorrespondenceSources(c,state,locale,{includeFollowup:phase==='control',review:Boolean(execution)});
  const observed=observedFacts(c,state);
  const sources=accessible.map(source=>{
    const document=source.kind==='document'?c.documents.find(document=>document.id===source.id):null;
    return {id:source.kind+':'+source.id,kind:source.kind,title:source.title,text:source.text,available:true,
      ...(source.provenanceLabel?{provenanceLabel:source.provenanceLabel}:{}),
      ...(document?{factIds:clone(document.factIds||[]),hasImage:Boolean(document.image),imageProvidedToReviewer:false}:{})};
  });
  for(const fact of c.facts)sources.push({id:'fact:'+fact.id,kind:'canonical-fact',title:fact.id,text:local(fact.text,locale),
    available:observed.has(fact.id),uncertain:fact.knowledge==='uncertain',knowledge:fact.knowledge||null,documentIds:clone(fact.documentIds||[])});
  for(const citation of resolvedCitations)sources.push({id:'citation:'+citation.id,kind:citation.kind,title:citation.title,text:citation.text,available:true,url:citation.url,locator:citation.locator});
  const calendar=operational?.workbook?.calendar||state.correspondenceInitialFeedback?.workbook?.calendar;
  const profileCriteria=clone(profile?.criteria);
  if(profileCriteria?.nextSteps?.calendar && workbook && calendar?.expected){
    profileCriteria.nextSteps.calendar={events:clone(workbook.events),targets:clone(workbook.targets),
      counting:clone(workbook.counting),expected:clone(calendar.expected)};
  }
  if(workbook)sources.push({id:'workbook-calendar',kind:'case-calendar',title:'Calendar and assignment shown to the student',
    text:JSON.stringify({events:workbook.events,targets:workbook.targets,counting:workbook.counting}),available:true});
  sources.push({id:'case-author-explanation',kind:'authored-explanation',text:local(c.rubric.explanation,locale),available:false,
    ...(execution?{scope:'Historical initial decision only. Current execution duties and recipients are defined by execution-rule sources.'}:{})});
  if(phase==='control'&&c.followup)sources.push({id:'control-author-explanation',kind:'authored-explanation',text:local(c.followup.explanation,locale),available:false,
    ...(execution?{scope:'Initial follow-up event only. Later released execution materials may establish a subsequent, narrower result. Use the frozen execution state for the current disposition.'}:{})});
  const rules=criticalRules(c,state,profile,phase,locale);
  for(const rule of rules)sources.push({id:'critical-rule:'+rule.id,kind:'critical-rule',text:rule.text,available:false});
  if(execution)for(const issue of execution.issues)sources.push({id:'execution-rule:'+issue.id,kind:'authored-execution-rule',available:false,
    title:issue.title,text:JSON.stringify({scope:issue.scope,closureScope:issue.closureScope,continuation:issue.continuation,
      allowedStatuses:issue.allowedStatuses,acceptedRecipientSets:issue.acceptedRecipientSets,recipientNames:issue.recipientNames,recipientBasis:issue.recipientBasis})});
  const display=REVIEW_LABELS[locale]||REVIEW_LABELS.ru;
  const issues=execution?publicControlWorkflow(state.controlWorkflow,profile,locale).issues:
    (profile?.issues||[]).map(issue=>({...issue,title:correspondenceIssueTitle(issue,c,locale)}));
  const sections=phase==='control'?{control:control.text}:clone(decision.correspondence.sections);
  if(phase==='initial'){
    sections.subject=decision.correspondence.subject;
    sections.kind=display.kinds[DOCUMENT_KINDS.indexOf(decision.correspondence.kind)]||'';
    sections.orders=decision.correspondence.orders.map(order=>{
      const values=[
        order.issue,display.orders[ORDER_INDEX.indexOf(order.kind)],
        order.recipientIds.map(id=>local(ROUTING_AUTHORITIES[id].name,locale)).join(', '),
        order.instruction,order.dueDate,order.expectedResult,
      ];
      return values.flatMap((value,index)=>value?[display.fields[index]+': '+value]:[]).join('\n');
    }).join('\n\n');
  }else{
    const title=id=>issues.find(issue=>issue.id===id)?.title||display.issue;
    sections.statuses=control.statuses.map(row=>title(row.issueId)+': '+display.statuses[STATUS_INDEX.indexOf(row.status)]).join('\n');
    if(execution)sections.execution=publicControlWorkflow(state.controlWorkflow,profile,locale).journal
      .map(row=>['['+row.id+'] '+row.label,row.reason,row.instruction,row.expectedResult].filter(Boolean).join('\n')).join('\n\n');
  }
  const rubric=phase==='initial'?CORRESPONDENCE_WEIGHTS.initial:CORRESPONDENCE_WEIGHTS.control;
  const ids=phase==='initial'?CORRESPONDENCE_SECTIONS:['verification','status','nextAction'];
  const citedControlIds=new Set();
  if(phase==='control')for(const row of control.statuses)for(const sourceId of row.evidenceSourceIds){
    for(const source of accessible)if(source.id===sourceId||source.kind+':'+source.id===sourceId)citedControlIds.add(source.kind+':'+source.id);
    for(const citation of resolvedCitations)if(citation.id===sourceId)citedControlIds.add('citation:'+citation.id);
  }
  const criteria=ids.map(id=>{
    const eligibleEvidenceIds=phase==='initial'?resolvedCitations
      .filter(citation=>id==='facts'?['document','dialogue'].includes(citation.kind):id==='legalBasis'?citation.kind==='legal':true)
      .map(citation=>'citation:'+citation.id):[...citedControlIds];
    return {id,max:rubric[id],maxLevel:eligibleEvidenceIds.length?4:2,eligibleEvidenceIds};
  });
  const context={
    version:1,rubricVersion:CORRESPONDENCE_RUBRIC_VERSION,phase,locale,caseId:c.id,caseVersion:c.version,datePackId:c.datePackId||null,
    role:local(c.public.role.text,locale),opening:local(c.public.opening,locale),
    citizenName:local(c.public.citizen?.name,locale),
    materialTitles:c.documents.filter(doc=>state.releasedDocumentIds?.includes(doc.id)).map(doc=>local(doc.title,locale)),
    // The snapshot and its server-derived worksheet supply events and target
    // dependencies. Use the actual target anchors and computed deadlines;
    // never invent an additional receipt or registration date.
    frozenCase:{date:c.public.date,deadline:calendar?.expected?.deadline||c.rubric.deadline,authoredDeadline:c.rubric.deadline,
      calendarEvents:clone(workbook?.events||c.public.assessment?.calendar?.events||[]),
      calendarTargets:clone(workbook?.targets||[]),calendarCounting:clone(workbook?.counting||null),
      correspondenceOrigin:clone(workbook?.origin||null),site:clone(workbook?.site||null),
      facts:c.facts.map(fact=>({id:fact.id,text:local(fact.text,locale),uncertain:fact.knowledge==='uncertain',
        knowledge:fact.knowledge||null,documentIds:clone(fact.documentIds||[])})),
      explanation:local(c.rubric.explanation,locale),...(execution?{explanationScope:'Historical initial decision, not the current execution stage.'}:{})},
    profile:profile?(execution?{issues:issues.map(({id,title,scope,resultType})=>({id,title,scope,resultType})),
      control:{version:'execution-v1',assessmentSource:'execution',instruction:'Use current scoped execution rules and recipients; the initial decision has already been assessed.'}}:clone({issues:profile.issues,acceptedKinds:profile.acceptedKinds,acceptablePlans:profile.acceptablePlans,
      constraints:profile.constraints,routing:profile.routing,response:profile.response,criteria:profileCriteria,
      control:phase==='control'?Object.fromEntries(Object.entries(profile.control||{}).filter(([key])=>key!=='workflow')):undefined})):null,
    acceptablePlans:(execution?[]:profile?.acceptablePlans?.length?profile.acceptablePlans:
      c.rubric.authored?.decisionPlans?.length?c.rubric.authored.decisionPlans:[{id:'default',requiredActions:c.rubric.requiredActionIds}])
      .map(plan=>({id:plan.id,routeIds:clone(plan.routeIds||[]),partialOrder:clone(plan.partialOrder||[]),
        actions:(plan.requiredActionIds||plan.requiredActions||[]).map(id=>({id,text:local(c.public.actions.find(action=>action.id===id)?.label,locale)}))})),
    planPolicy:'Each acceptable plan is a separate lawful alternative. Common requirements apply to every plan; branch-specific requirements apply only within the selected lawful branch. Never require the union of mutually alternative plans.',
    forbiddenActions:execution?[]:c.rubric.forbiddenActionIds.map(id=>({id,text:local(c.public.actions.find(action=>action.id===id)?.label,locale)})),
    criticalRules:rules,operational,
    submission:phase==='initial'?clone(decision.correspondence):{
      text:control.text,statuses:control.statuses.map(row=>({...row,
        issueTitle:issues.find(issue=>issue.id===row.issueId)?.title||display.issue,
        statusLabel:display.statuses[STATUS_INDEX.indexOf(row.status)],
        evidenceTitles:row.evidenceSourceIds.map(id=>accessible.find(source=>source.id===id||source.kind+':'+source.id===id)?.title||
          resolvedCitations.find(source=>source.id===id)?.title).filter(Boolean),
      })),
    },
    initialSubmission:phase==='control'?clone(execution?Object.fromEntries(Object.entries(state.decision?.correspondence||{}).filter(([key])=>key!=='citations')):state.decision?.correspondence):null,
    initialScore:phase==='control'?state.correspondenceInitialFeedback?.score:null,
    newInformation:phase==='control'?local(c.followup?.intro,locale):null,
    ...(execution?{execution}:{}),
    sections,sources,resolvedCitations:clone(execution?resolvedCitations.map(({text,...citation})=>citation):resolvedCitations),
    criteria,
  };
  if(Buffer.byteLength(JSON.stringify(context),'utf8')>240000)reject('context_limit',413);
  return context;
}

const labels={
  facts:{ru:'Установленные обстоятельства',en:'Established facts',zh:'查明事实'},
  legalBasis:{ru:'Применение правовых оснований',en:'Application of legal grounds',zh:'适用法律依据'},
  resolution:{ru:'Решение по существу',en:'Substantive decision',zh:'实质决定'},
  nextSteps:{ru:'Понятный ответ и дальнейшие действия',en:'Clear answer and next steps',zh:'明确答复与后续措施'},
  route:{ru:'Компетентные адресаты',en:'Competent recipients',zh:'主管收件机关'},
  calendar:{ru:'Сроки',en:'Deadlines',zh:'期限'},
  verification:{ru:'Проверка результата',en:'Verification of the result',zh:'结果核查'},
  status:{ru:'Состояние каждого вопроса',en:'Status of each issue',zh:'各事项状态'},
  nextAction:{ru:'Дальнейший контроль',en:'Follow-up action',zh:'后续监督'},
};

export function correspondenceReviewSchema(context) {
  const finding={type:'object',additionalProperties:false,required:['type','section','quote','sourceIds','explanation'],properties:{
    type:{type:'string',enum:['supported','incorrect','missing']},section:{type:'string',enum:Object.keys(context.sections)},
    quote:{type:'string'},sourceIds:{type:'array',items:{type:'string',enum:context.sources.map(source=>source.id)}},explanation:{type:'string'},
  }};
  return {type:'object',additionalProperties:false,required:['version','phase','criteria','criticalErrors','summary'],properties:{
    version:{type:'integer',enum:[1]},phase:{type:'string',enum:[context.phase]},
    criteria:{type:'array',items:{type:'object',additionalProperties:false,required:['id','level','reason','findings'],properties:{
      id:{type:'string',enum:context.criteria.map(row=>row.id)},level:{type:'integer',enum:[0,1,2,3,4]},reason:{type:'string'},findings:{type:'array',items:finding},
    }}},
    criticalErrors:{type:'array',items:{type:'object',additionalProperties:false,required:['ruleId','finding'],properties:{
      ruleId:{type:'string'},finding,
    }}},summary:{type:'string'},
  }};
}

export function validateCorrespondenceReview(review,context) {
  try{
    keys(review,['version','phase','criteria','criticalErrors','summary']);
    if(review.version!==1||review.phase!==context.phase)reject();
    const expected=context.criteria.map(row=>row.id),sourceIds=new Set(context.sources.map(source=>source.id));
    const validateFinding=finding=>{
      keys(finding,['type','section','quote','sourceIds','explanation']);
      if(!['supported','incorrect','missing'].includes(finding.type)||!own(context.sections,finding.section))reject();
      const quote=boundedText(finding.quote,5000),refs=array(finding.sourceIds,12).map(value=>id(value,600));
      if(!refs.length||!unique(refs)||refs.some(value=>!sourceIds.has(value)))reject();
      if(finding.type!=='missing'&&!quoteOccurs(quote,context.sections[finding.section]))reject();
      if(finding.type==='missing'&&quote&&!quoteOccurs(quote,context.sections[finding.section]))reject();
      if(['incorrect','missing'].includes(finding.type)&&!refs.length)reject();
      return {...finding,quote,sourceIds:refs,explanation:boundedText(finding.explanation,2000,{empty:false})};
    };
    const criteria=array(review.criteria,expected.length).map(row=>{
      keys(row,['id','level','reason','findings']);
      if(!expected.includes(row.id)||!Number.isInteger(row.level)||row.level<0||row.level>4)reject();
      const specification=context.criteria.find(criterion=>criterion.id===row.id);
      if(row.level>specification.maxLevel)reject();
      const findings=array(row.findings,8).map(validateFinding);
      if(!findings.length)reject();
      // Full or partial achievement must quote actual student work.
      if(row.level>0&&!findings.some(finding=>finding.type==='supported'&&finding.quote))reject();
      if(row.level>=3&&!findings.some(finding=>finding.type==='supported'&&finding.sourceIds.some(id=>specification.eligibleEvidenceIds.includes(id))))reject();
      if(row.level<4&&!findings.some(finding=>['incorrect','missing'].includes(finding.type)))reject();
      return {id:row.id,level:row.level,reason:boundedText(row.reason,1600,{empty:false}),findings};
    });
    if(criteria.length!==expected.length||!unique(criteria.map(row=>row.id)))reject();
    const rules=new Map(context.criticalRules.filter(row=>row.applicable!==false).map(row=>[row.id,row]));
    const criticalErrors=array(review.criticalErrors,12).map(row=>{
      keys(row,['ruleId','finding']);if(!rules.has(row.ruleId))reject();
      const finding=validateFinding(row.finding);if(finding.type==='supported')reject();
      if(rules.get(row.ruleId).kind==='selected'&&finding.type!=='incorrect')reject();
      if(rules.get(row.ruleId).kind==='missing'&&finding.type!=='missing')reject();
      if(!finding.sourceIds.includes('critical-rule:'+row.ruleId))reject();
      return {ruleId:row.ruleId,finding};
    });
    if(!unique(criticalErrors.map(row=>row.ruleId)))reject();
    return {version:1,phase:context.phase,criteria,criticalErrors,summary:boundedText(review.summary,3000,{empty:false})};
  }catch(error){
    if(error?.code==='context_limit')throw error;
    throw new ReceptionError('review_invalid',503);
  }
}

export function scoreCorrespondenceReview(rawReview,context) {
  const review=validateCorrespondenceReview(rawReview,context);
  const criteria=review.criteria.map(row=>({id:row.id,label:labels[row.id],earned:context.criteria.find(item=>item.id===row.id).max*row.level/4,
    max:context.criteria.find(item=>item.id===row.id).max,level:row.level,reason:row.reason,findings:row.findings}));
  if(context.phase==='initial')for(const row of context.operational?.criteria||[]){
    if(!['route','calendar'].includes(row.id)||!Number.isFinite(row.earned)||row.earned<0||row.earned>row.max)throw new ReceptionError('review_invalid',503);
    criteria.push({...row,label:labels[row.id]});
  }
  const raw=criteria.reduce((sum,row)=>sum+row.earned,0),cap=review.criticalErrors.length?CORRESPONDENCE_WEIGHTS.criticalCap:null;
  const score=Math.round(Math.min(cap??100,raw)*10)/10;
  return {
    score,criteria,explanation:review.summary,missingFacts:[],cap,authored:false,
    criticalIds:review.criticalErrors.map(row=>row.ruleId),
    ...(context.operational?.workbook?{workbook:clone(context.operational.workbook)}:{}),
    correspondence:{version:1,rubricVersion:CORRESPONDENCE_RUBRIC_VERSION,phase:context.phase,displayFormat:1,rawScore:raw,score,cap,
      criteria:clone(criteria),criticalErrors:review.criticalErrors,summary:review.summary,
      citations:context.resolvedCitations.map(({id,kind,sourceId,title,url,locator,quote,contentSha256,unitIds,language})=>({
        id,kind,sourceId,title,url:url||'',locator:locator||'',quote,contentSha256:contentSha256||'',...(unitIds?{unitIds}:{}),
        ...(language?{language}:{}),
      }))},
  };
}

/** Control contributes its own component; initial judgement is immutable. */
export function combineCorrespondenceFeedback(initial,control) {
  if(!initial?.correspondence||!control?.correspondence)throw new ReceptionError('review_invalid',503);
  const score=Math.round((initial.score*CORRESPONDENCE_WEIGHTS.combined.initial+control.score*CORRESPONDENCE_WEIGHTS.combined.control)*10)/10;
  return {
    score,criteria:[...initial.criteria.map(row=>({...row,id:'initial-'+row.id,earned:row.earned*.8,max:row.max*.8})),
      ...control.criteria.map(row=>({...row,id:'control-'+row.id,earned:row.earned*.2,max:row.max*.2}))],
    explanation:control.explanation,missingFacts:[],cap:null,authored:false,criticalIds:[],
    ...(initial.workbook?{workbook:clone(initial.workbook)}:{}),
    correspondence:{version:1,rubricVersion:CORRESPONDENCE_RUBRIC_VERSION,phase:'complete',initialScore:initial.score,controlScore:control.score,
      initial:clone(initial.correspondence),control:clone(control.correspondence),score},
  };
}
