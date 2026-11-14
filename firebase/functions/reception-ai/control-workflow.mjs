/** Server-owned, bounded control simulation. No IO, model, keyword classifier or score. */
import {createHash} from 'node:crypto';
import {ReceptionError} from './schema.mjs';
import {ROUTING_AUTHORITIES,ROUTING_AUTHORITY_IDS,ROUTING_AUTHORITY_ALIASES} from './routing-directory.mjs';
import {evaluateRoutingWorkflow} from './routing-workflow.mjs';

export const CONTROL_WORKFLOW_VERSION='execution-v1';
export const CONTROL_ACTION_KINDS=Object.freeze(['request_evidence','verify','notify','close','keep_open','refer','reopen']);
export const CONTROL_WORKFLOW_LIMITS=Object.freeze({issues:20,materials:180,actions:80,journal:100,reason:2000,instruction:4000,expectedResult:2000,evidence:20,recipients:4,
  newProseBytes:24000,reviewContributionBytes:64000});
const L=CONTROL_WORKFLOW_LIMITS;
const clone=value=>value==null?value:structuredClone(value);
const object=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.hasOwn(value,key);
const error=(code='invalid_control_action',status=400)=>{throw new ReceptionError(code,status);};
const invalidDefinition=()=>error('invalid_control_workflow',503);
const language=value=>['ru','en','zh'].includes(value)?value:'ru';
const local=(value,locale='ru')=>typeof value==='string'?value:value?.[language(locale)]||value?.ru||'';
const T=(ru,en,zh)=>({ru,en,zh});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const unique=values=>[...new Set(values)];
function canonical(value){
  if(Array.isArray(value))return value.map(item=>canonical(item)??null);
  if(object(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]).filter(([,item])=>
    item!==undefined&&item!==null&&!(Array.isArray(item)&&!item.length)&&!(object(item)&&!Object.keys(item).length)));
  return value;
}
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function id(value,max=220){
  if(typeof value!=='string'||!value.length||value.length>max||!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)||['constructor','prototype','__proto__'].includes(value))error();
  return value;
}
function text(value,max){
  if(value===undefined)return '';
  if(typeof value!=='string'||value.length>max||value.includes('\0'))error();
  return value.trim();
}
function ids(value,max){
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>max)error();
  const rows=value.map(value=>id(value));if(unique(rows).length!==rows.length)error();return rows;
}
function date(value){
  const out=text(value,10);
  if(out&&(!/^\d{4}-\d{2}-\d{2}$/.test(out)||!Number.isFinite(Date.parse(out+'T00:00:00Z'))||new Date(out+'T00:00:00Z').toISOString().slice(0,10)!==out))error();
  return out;
}
function at(value){
  if(!Number.isSafeInteger(value)||value<0)error('invalid_control_timestamp',503);
  return value;
}
function localizedText(value,max=24000){
  if(typeof value==='string')return Boolean(value.trim())&&value.length<=max&&!value.includes('\0');
  return object(value)&&typeof value.ru==='string'&&value.ru.trim()&&Object.values(value).every(v=>typeof v==='string'&&v.length<=max&&!v.includes('\0'));
}
function actionInput(value){
  const fields=['issueId','kind','reason','instruction','recipientIds','dueDate','expectedResult','evidenceSourceIds'];
  if(!object(value)||Object.keys(value).some(key=>!fields.includes(key))||!CONTROL_ACTION_KINDS.includes(value.kind))error();
  const recipientIds=ids(value.recipientIds,L.recipients);
  if(recipientIds.some(value=>!ROUTING_AUTHORITY_IDS.has(value)))error('invalid_recipient');
  return {issueId:id(value.issueId),kind:value.kind,reason:text(value.reason,L.reason),instruction:text(value.instruction,L.instruction),
    recipientIds,dueDate:date(value.dueDate),expectedResult:text(value.expectedResult,L.expectedResult),evidenceSourceIds:ids(value.evidenceSourceIds,L.evidence)};
}

const LABELS={
  request_evidence:T('Запросить подтверждение','Request evidence','索取证明材料'),verify:T('Проверить материалы','Verify materials','核查材料'),
  notify:T('Зафиксировать уведомление','Record a notification','记录通知'),close:T('Завершить контроль предмета','Close this control item','结束该事项监督'),
  keep_open:T('Продолжить контроль','Keep under review','继续监督'),refer:T('Зафиксировать передачу','Record an acknowledged referral','记录已确认接收的转交'),
  reopen:T('Возобновить контроль','Reopen control','恢复监督'),opened:T('Открыт контроль исполнения','Control opened','已开始执行监督'),
  planned:T('Поручение из проекта','Assignment in the draft','草稿中的任务'),
};
const MESSAGES={
  opened:T('Поступившие материалы добавлены в дело. Проект и его поручения сами по себе не подтверждают исполнение.','Incoming materials were added to the file. A draft and its assignments do not prove execution.','收到的材料已归档。草稿及其中任务本身不能证明已经执行。'),
  planned:T('Поручение сохранено как план работы; результат его исполнения ещё не установлен.','The assignment is recorded as planned work; its execution has not been established.','该任务已作为工作计划保存；尚未确认执行结果。'),
  request_incomplete:T('Запрос возвращён: укажите адресата, основание из полученных материалов, поручение, ожидаемый результат и срок. Содержание поручения будет оценено отдельно.','The request was returned: provide a recipient, a received source, an instruction, an expected result and a date. The instruction’s substance is assessed separately.','请求已退回：请填写接收方、已收到的依据材料、任务、预期结果和日期。任务内容将另行评估。'),
  recipient_unconfirmed:T('Полномочия выбранного адресата по этому запросу не подтверждены. Новый результат не поступил; уточните направление.','The selected recipient’s competence for this request was not confirmed. No new result was released; check the destination.','尚未确认所选接收方对该请求的权限。未收到新结果；请核对转交方向。'),
  request_received:T('Учебный запрос зарегистрирован. Получен предусмотренный сценарием ответ по этому предмету. Его необходимо сопоставить с требуемым результатом.','The simulated request was registered. The authored response for this issue was received. Compare it with the required result.','模拟请求已登记，并收到本事项预设的答复。请将其与所需结果进行核对。'),
  already_received:T('Этот ответ уже находится в деле. Повторный запрос не создаёт нового подтверждения исполнения.','This response is already in the file. A repeated request does not create new execution evidence.','该答复已在案。重复请求不会产生新的执行证明。'),
  evidence_required:T('Выберите полученный материал по данному предмету и запишите основание сравнения.','Select a received material for this issue and record the basis of your comparison.','请选择该事项已收到的材料，并记录比较依据。'),
  evidence_unrelated:T('Выбранные материалы относятся к другому предмету. Они не подтверждают результат по этой части дела.','The selected materials concern another issue and do not establish the result for this part of the case.','所选材料涉及其他事项，不能证明本部分的结果。'),
  evidence_insufficient:T('В выбранном материале нет предусмотренного для данного предмета подтверждения результата. Обещание, отметка о пересылке или другой объект не заменяют его.','The selected material does not establish the required result for this scope. A promise, dispatch note or different object is insufficient.','所选材料未证明本事项范围内所需结果。承诺、转送记录或其他对象的材料不能替代该证明。'),
  evidence_verified:T('Источник и его относимость к указанному предмету проверены. Основание выполнения этой части зарегистрировано; содержание вашего сравнения оценивается отдельно.','The source and its relation to this issue were checked. Evidence for this scope was recorded; the substance of your comparison is assessed separately.','已核查来源及其与该事项的关联，并记录该范围的完成依据；比较内容将另行评估。'),
  notice_incomplete:T('Для уведомления запишите основание, содержание сообщения и следующий результат, указав материалы данного предмета.','For a notification, record its basis, message and next result, citing materials for this issue.','请填写通知依据、内容和后续结果，并引用本事项材料。'),
  notice_recorded:T('В учебном деле зарегистрированы текст уведомления и запись его отправки. Это действие симуляции, а не реальная внешняя отправка.','The simulated file records the notification text and dispatch. This is a simulation record, not an external communication.','模拟案件中已记录通知文本和发送情况。这是模拟记录，不是实际对外发送。'),
  closure_evidence_required:T('Завершение отклонено: сначала проверьте материал, подтверждающий результат именно по этому предмету и в пределах его объёма.','Closure was rejected: first verify evidence establishing the result for this precise issue and scope.','未允许结束：请先核查证明该具体事项及范围内结果的材料。'),
  closure_notice_required:T('Завершение отклонено: по проверенному результату ещё не зарегистрировано необходимое уведомление.','Closure was rejected: the required notification of the verified result has not been recorded.','未允许结束：尚未记录针对已核查结果的必要通知。'),
  closure_reason_required:T('Завершение отклонено: укажите основание и подтверждающие материалы.','Closure was rejected: state the grounds and cite the supporting materials.','未允许结束：请说明依据并引用证明材料。'),
  closed:T('Контроль завершён только в пределах указанного предмета и подтверждённого результата. Остальные предметы не закрыты этим действием.','Control was closed only for the specified issue and evidenced scope. Other issues were not closed by this action.','仅在该事项及已证明结果的范围内结束监督。本操作未结束其他事项。'),
  already_closed:T('Этот предмет уже завершён. Для изменения выводов сначала возобновите его контроль.','This issue is already closed. Reopen control before changing its disposition.','该事项已经结束。修改结论前，请先恢复监督。'),
  next_action_required:T('Запишите основание продолжения контроля и конкретное следующее действие.','State why control should continue and specify the next action.','请说明继续监督的依据，并填写具体后续措施。'),
  kept_open:T('Контроль по предмету продолжен. Основание и следующее действие сохранены; отсутствие результата не заменено вымышленным исполнением.','Control remains open. The reason and next action were recorded; a missing result was not replaced by invented execution.','该事项继续受监督。已保存依据和后续措施，未将尚无结果虚构为已执行。'),
  referral_not_applicable:T('Передача не предусмотрена для этого предмета. В пределах текущих полномочий определите дальнейшее действие.','Referral is not available for this issue. Determine the next action within the current authority.','该事项不适用转交。请在当前职权范围内确定后续措施。'),
  receipt_required:T('Передача не зафиксирована как принятая: нужна полученная квитанция компетентного адресата по этому предмету. Запись отправки не равна получению.','Receipt of the referral is not established: cite the competent recipient’s acknowledgement for this issue. Dispatch is not receipt.','尚未确认转交已被接收：请引用主管接收方针对本事项的接收凭据。发送不等于接收。'),
  receipt_recipient_mismatch:T('Квитанция относится к другому адресату запроса. Нельзя приписать подтверждение получения иному получателю.','The acknowledgement belongs to another request recipient. It cannot establish receipt by a different recipient.','该回执属于请求的另一接收方，不能证明其他接收方已接收。'),
  referred:T('Получение материалов компетентным адресатом зафиксировано. Это подтверждает передачу, но не разрешение вопроса по существу.','The competent recipient’s acknowledgement was recorded. It establishes referral, not resolution of the underlying merits.','已记录主管接收方接收材料。这证明转交，不表示实体问题已经解决。'),
  reopen_required:T('Для нового действия по завершённой или переданной части сначала возобновите контроль и укажите основание.','Reopen control with reasons before a new action on a closed or referred issue.','对已结束或已转交的事项采取新措施前，请说明依据并恢复监督。'),
  reopen_reason_required:T('Укажите основание возобновления; новая фактическая история не возникает автоматически.','Give a reason for reopening; this action does not create new facts.','请说明恢复监督的依据；本操作不会自动产生新事实。'),
  reopened:T('Контроль возобновлён. Прежняя история сохранена; новый факт исполнения не создан.','Control was reopened. The prior history is preserved; no new execution fact was created.','监督已恢复。保留既有历史，未产生新的执行事实。'),
  already_open:T('Контроль уже открыт; запишите требуемое действие в текущем деле.','Control is already open; record the necessary action in the current file.','监督已处于开放状态；请在当前案件中记录所需措施。'),
};
const PROVENANCE={
  'original-case':T('Материал исходного учебного дела','Original authored case material','原始教学案件材料'),
  'authored-control-extension':T('Авторский контрольный эпизод учебной симуляции','Authored follow-on material for the simulation','教学模拟的作者编写后续材料'),
  'student-action':T('Документ действия студента в симуляции','Student-authored simulation record','学生在模拟中拟定的记录'),
};
const ACCEPTED_OUTCOMES=new Set(['opened','planned','request_received','already_received','evidence_verified','evidence_insufficient','notice_recorded','closed','already_closed','kept_open','referred','reopened']);

function definitionFrom(profile,caseData){
  const raw=profile?.control?.workflow||(profile?.version===CONTROL_WORKFLOW_VERSION?profile:null);
  if(!object(raw)||raw.version!==CONTROL_WORKFLOW_VERSION)invalidDefinition();
  const definition=clone(raw),p=definition.provenance;
  if(!object(p)||p.kind!=='authored-control-extension'||p.version!==1||p.sourceCaseId!==caseData.id||!(/^[a-f0-9]{64}$/).test(p.sourceSHA256||'')||
    caseData.provenance?.sourceSHA256&&p.sourceSHA256!==caseData.provenance.sourceSHA256)invalidDefinition();
  if(!Array.isArray(definition.issues)||!definition.issues.length||!Array.isArray(definition.materials)||!definition.materials.length||definition.materials.length>L.materials)invalidDefinition();
  const issues=[];
  function add(issue,depth=0){
    if(!object(issue)||depth>2||issues.length>=L.issues)invalidDefinition();
    try{id(issue.id);ids(issue.initialMaterialIds,L.materials);ids(issue.evidenceMaterialIds,L.materials);}catch{invalidDefinition();}
    if(!localizedText(issue.title,500)||!localizedText(issue.scope,3000)||!localizedText(issue.resultType,200)||
      !['open','pending','resolved','referred'].includes(issue.initialStatus)||typeof issue.deliveryRequired!=='boolean'||typeof issue.allowReferral!=='boolean'||
      !localizedText(issue.closureText,6000)||!localizedText(issue.continuationText,6000))invalidDefinition();
    const {newIssue,...plain}=issue;
    if(plain.acceptedRecipientSets!==undefined&&(!Array.isArray(plain.acceptedRecipientSets)||!plain.acceptedRecipientSets.length||plain.acceptedRecipientSets.length>20||
      plain.acceptedRecipientSets.some(set=>!Array.isArray(set)||!set.length||set.length>L.recipients||set.some(id=>!ROUTING_AUTHORITY_IDS.has(id)))))invalidDefinition();
    issues.push({...plain,initialMaterialIds:plain.initialMaterialIds||[],evidenceMaterialIds:plain.evidenceMaterialIds||[]});
    if(newIssue)add(newIssue,depth+1);
  }
  definition.issues.forEach(issue=>add(issue));definition.issues=issues;
  if(unique(issues.map(issue=>issue.id)).length!==issues.length)invalidDefinition();
  const issueIds=new Set(issues.map(issue=>issue.id));
  for(const material of definition.materials){
    try{id(material.id);ids(material.issueIds,L.issues);ids(material.sourceDocumentIds,30);}catch{invalidDefinition();}
    if(!material.id.startsWith('workflow-')||!material.issueIds?.length||material.issueIds.some(issueId=>!issueIds.has(issueId))||
      !['author-event','case-document','execution-record','delivery-receipt'].includes(material.kind)||!['context','insufficient','mismatch','confirmation','delivery'].includes(material.verification)||
      !object(material.provenance)||!['original-case','authored-control-extension'].includes(material.provenance.kind)||material.provenance.sourceCaseId!==caseData.id)invalidDefinition();
    if(material.provenance.kind==='original-case'){
      if(material.kind==='author-event'&&caseData.followup?.intro)material.text=clone(caseData.followup.intro);
      if(material.sourceDocumentIds?.length){
        const docs=material.sourceDocumentIds.map(id=>caseData.documents?.find(doc=>doc.id===id));
        if(docs.some(doc=>!doc))invalidDefinition();
        material.text=Object.fromEntries(['ru','en','zh'].map(locale=>[locale,docs.map(doc=>local(doc.text,locale)).join('\n\n')]));
      }
    }
    if(!localizedText(material.title,1000)||!localizedText(material.text)||material.factsDoNotEstablish&&!localizedText(material.factsDoNotEstablish,6000))invalidDefinition();
    material.sourceDocumentIds ||= [];
  }
  const materials=new Map(definition.materials.map(m=>[m.id,m]));
  if(materials.size!==definition.materials.length)invalidDefinition();
  try{definition.initialMaterialIds=ids(definition.initialMaterialIds,L.materials);}catch{invalidDefinition();}
  if(definition.initialMaterialIds.some(id=>!materials.has(id)))invalidDefinition();
  for(const issue of issues){
    for(const materialId of unique([...issue.initialMaterialIds,...issue.evidenceMaterialIds,issue.responseMaterialId,...(issue.referralMaterialId?[issue.referralMaterialId]:[])])){
      const m=materials.get(materialId);if(!m||!m.issueIds.includes(issue.id))invalidDefinition();
    }
    if(issue.referralMaterialId&&materials.get(issue.referralMaterialId).verification!=='delivery')invalidDefinition();
  }
  return definition;
}

/** RTDB can omit empty collections. Rehydrate their known shapes before hashing. */
export function normalizeControlWorkflow(value){
  if(!object(value))error('invalid_control_state',503);
  const s=clone(value);
  s.issues ||= [];s.materials ||= [];s.journal ||= [];s.plannedOrders ||= [];s.receipts ||= {};
  if(s.definition){
    s.definition.initialMaterialIds ||= [];s.definition.issues ||= [];s.definition.materials ||= [];
    for(const issue of s.definition.issues){issue.initialMaterialIds ||= [];issue.evidenceMaterialIds ||= [];}
    for(const material of s.definition.materials)material.sourceDocumentIds ||= [];
  }
  for(const issue of s.issues){issue.materialIds ||= [];issue.verifiedEvidenceIds ||= [];issue.notificationEvidenceIds ||= [];}
  for(const material of s.materials){material.sourceDocumentIds ||= [];material.recipientIds ||= [];}
  for(const order of s.plannedOrders){order.recipientIds ||= [];order.citationIds ||= [];order.issueId ??= null;}
  for(const event of s.journal){event.recipientIds ||= [];event.evidenceSourceIds ||= [];event.materialIds ||= [];event.issueId ??= null;}
  s.initialRouting ||= {};s.initialRouting.recipientIds ||= [];s.initialRouting.expectedRecipientIds ||= [];s.initialRouting.correct ??= null;
  return s;
}
function stateHash(s){const {integrityHash,...payload}=s;return digest(payload);}
function assertState(value){
  const s=normalizeControlWorkflow(value);
  if(s.version!==CONTROL_WORKFLOW_VERSION||!Number.isSafeInteger(s.revision)||s.revision<1||!Array.isArray(s.issues)||!s.issues.length||s.issues.length>L.issues||
    !Array.isArray(s.materials)||s.materials.length>L.materials||!Array.isArray(s.journal)||s.journal.length>L.journal||!object(s.receipts)||
    !s.definition||s.definitionHash!==digest(s.definition)||s.integrityHash!==stateHash(s))error('invalid_control_state',503);
  let previousHash='';
  for(const [index,event] of s.journal.entries()){
    const {hash,...payload}=event;
    if(event.seq!==index+1||event.previousHash!==previousHash||hash!==digest(payload))error('invalid_control_state',503);
    previousHash=hash;
  }
  return s;
}
const seal=value=>{const s=normalizeControlWorkflow(value);s.integrityHash=stateHash(s);return s;};
function append(s,{issueId=null,kind,outcome,action={},materialIds=[],timestamp,message=outcome}){
  if(s.journal.length>=L.journal)error('control_action_limit',429);
  const seq=s.journal.length+1;
  const event={id:'control-event-'+seq,seq,issueId,kind,label:clone(LABELS[kind]),
    reason:action.reason||'',instruction:action.instruction||'',recipientIds:clone(action.recipientIds||[]),dueDate:action.dueDate||'',expectedResult:action.expectedResult||'',
    evidenceSourceIds:clone(action.evidenceSourceIds||[]),outcome,accepted:ACCEPTED_OUTCOMES.has(outcome),message:clone(MESSAGES[message]||MESSAGES[outcome]),materialIds:clone(materialIds),at:at(timestamp),previousHash:s.journal.at(-1)?.hash||''};
  event.hash=digest(event);s.journal.push(event);return event;
}
function release(s,materialIds,{recipientIds=[]}={}){
  const released=[];
  for(const id of unique(materialIds)){
    if(s.materials.some(m=>m.id===id))continue;
    const source=s.definition.materials.find(m=>m.id===id);if(!source)invalidDefinition();
    s.materials.push({...clone(source),recipientIds:clone(recipientIds)});released.push(id);
    for(const issue of s.issues)if(source.issueIds.includes(issue.id))issue.materialIds.push(id);
  }
  return released;
}
function addStudentMaterial(s,issue,action,kind){
  if(s.materials.length>=L.materials)error('control_action_limit',429);
  const materialId='workflow-'+s.caseId+'-student-'+(s.journal.length+1);
  const title=kind==='request'?T('Запрос студента, зарегистрированный в учебном деле','Student request registered in the simulated file','在模拟案件中登记的学生请求'):T('Учебная запись уведомления','Simulated notification record','模拟通知记录');
  const text=T('Документ действия студента. Отправка существует только в учебной симуляции.','Student-authored action record. Dispatch exists only in this simulation.','学生拟定的操作记录。发送仅存在于教学模拟中。');
  for(const locale of ['ru','en','zh'])text[locale]+='\n\n'+[action.reason,action.instruction,action.expectedResult].filter(Boolean).join('\n\n');
  const material={id:materialId,issueIds:[issue.id],title,text,kind:kind==='request'?'execution-record':'delivery-receipt',
    provenance:{kind:'student-action',sourceCaseId:s.caseId},verification:'context',sourceDocumentIds:[],eventId:'control-event-'+(s.journal.length+1)};
  s.materials.push(material);issue.materialIds.push(material.id);return materialId;
}
function refresh(s){
  s.status=s.issues.every(issue=>['closed','referred'].includes(issue.status))?'ready':'active';
  return s;
}

export function createControlWorkflow({caseData,profile,decision,initialFeedback,locale='ru',timestamp,reviewBudgetBytes=L.reviewContributionBytes}={}){
  if(!object(caseData)||!caseData.id)invalidDefinition();
  if(!Number.isSafeInteger(reviewBudgetBytes)||reviewBudgetBytes<2048||reviewBudgetBytes>L.reviewContributionBytes)error('invalid_control_capacity',503);
  const definition=definitionFrom(profile,caseData);at(timestamp);
  const initialRouting={recipientIds:clone(decision?.workbook?.routing?.recipientIds||[]),
    correct:typeof initialFeedback?.workbook?.routing?.correct==='boolean'?initialFeedback.workbook.routing.correct:null,
    expectedRecipientIds:(initialFeedback?.workbook?.routing?.expectedRecipients||[]).map(row=>row.id).filter(Boolean)};
  const s={version:CONTROL_WORKFLOW_VERSION,revision:1,caseId:caseData.id,caseVersion:caseData.version||'',datePackId:caseData.datePackId||'',
    definition,definitionHash:digest(definition),initialRouting,budget:{newProseBytes:L.newProseBytes,reviewContributionBytes:reviewBudgetBytes},
    issues:definition.issues.map(issue=>({id:issue.id,title:clone(issue.title),resultType:clone(issue.resultType),scope:clone(issue.scope),
      status:'open',substantiveStatus:['resolved','referred'].includes(issue.initialStatus)?issue.initialStatus:'pending',
      materialIds:[],verifiedEvidenceIds:[],notificationEvidenceIds:[],notified:false})),materials:[],journal:[],plannedOrders:[],receipts:{},status:'active'};
  const initialIds=unique([...definition.initialMaterialIds,...definition.issues.flatMap(issue=>issue.initialMaterialIds)]);
  const released=release(s,initialIds);
  append(s,{kind:'opened',outcome:'opened',materialIds:released,timestamp});
  const orders=decision?.correspondence?.orders||[];
  if(!Array.isArray(orders)||orders.length>12)error('invalid_control_workflow',503);
  for(const order of orders){
    const candidate=definition.issues.find(issue=>issue.id===order.issue||['ru','en','zh'].some(lang=>local(issue.title,lang)===order.issue));
    const issueId=candidate?.id||(definition.issues.length===1?definition.issues[0].id:null);
    const planned={...clone(order),issueId,recipientIds:clone(order.recipientIds||[]),citationIds:clone(order.citationIds||[])};
    s.plannedOrders.push(planned);
    append(s,{issueId,kind:'planned',outcome:'planned',timestamp,action:{instruction:order.instruction,recipientIds:order.recipientIds,dueDate:order.dueDate,expectedResult:order.expectedResult}});
  }
  const normalized=normalizeControlWorkflow(s);normalized.definitionHash=digest(normalized.definition);
  return enforceBudget(seal(normalized));
}

function recipientResult(s,issue,action,{caseData,recipientCheck,initialFeedback}){
  if(!action.recipientIds.length)return false;
  try{
    const canonical=id=>ROUTING_AUTHORITY_ALIASES[id]||id;
    const chosen=unique(action.recipientIds.map(canonical)).sort();
    const result=recipientCheck?recipientCheck({caseData,issue:clone(issue),action:clone(action),initialFeedback:initialFeedback||{workbook:{routing:clone(s.initialRouting)}}}):
      issue.acceptedRecipientSets?{valid:issue.acceptedRecipientSets.some(set=>same(unique(set.map(canonical)).sort(),chosen))}:
      evaluateRoutingWorkflow(s.caseId,{recipientIds:action.recipientIds});
    // A Promise or an undecided callback must never accidentally count as success.
    return result===true||Boolean(result&&!result.then&&(result.valid===true||result.correct===true));
  }catch{return false;}
}
/** Returns a NEW private workflow state. The input and its journal are never mutated. */
export function applyControlAction(workflow,profile,command,{caseData,locale='ru',timestamp,requestId,expectedRevision,recipientCheck}={}){
  const s=assertState(workflow),action=actionInput(command),request=id(requestId,120),requestDigest=digest(action);
  if(own(s.receipts,request)){
    if(s.receipts[request].digest!==requestDigest)error('request_conflict',409);
    return s;
  }
  if(expectedRevision!==undefined&&(!Number.isSafeInteger(expectedRevision)||expectedRevision!==s.revision))error('revision_conflict',409);
  if(Object.keys(s.receipts).length>=L.actions)error('control_action_limit',429);
  if(caseData&&(caseData.id!==s.caseId||caseData.version&&caseData.version!==s.caseVersion||caseData.datePackId&&caseData.datePackId!==s.datePackId||
    caseData.provenance?.sourceSHA256&&caseData.provenance.sourceSHA256!==s.definition.provenance.sourceSHA256))error('invalid_control_state',503);
  at(timestamp);
  const issue=s.issues.find(issue=>issue.id===action.issueId),spec=s.definition.issues.find(issue=>issue.id===action.issueId);
  if(!issue||!spec)error('invalid_control_issue');
  const selected=action.evidenceSourceIds.map(id=>s.materials.find(material=>material.id===id));
  if(selected.some(material=>!material))error('invalid_control_evidence');
  const relevant=selected.filter(material=>material.issueIds.includes(issue.id));
  const onlyRelevant=selected.length>0&&relevant.length===selected.length;
  let outcome,materialIds=[];
  const finalized=['closed','referred'].includes(issue.status);
  const resetNotice=()=>{issue.notified=false;issue.notificationEvidenceIds=[];};
  if(finalized&&['request_evidence','keep_open','refer'].includes(action.kind)||issue.status==='referred'&&action.kind==='close')outcome='reopen_required';
  else if(action.kind==='request_evidence'){
    if(!action.reason||!action.instruction||!action.expectedResult||!action.dueDate||!action.recipientIds.length||!selected.length)outcome='request_incomplete';
    else if(!onlyRelevant)outcome='evidence_unrelated';
    else if(!recipientResult(s,spec,action,{caseData,recipientCheck}))outcome='recipient_unconfirmed';
    else{
      const incoming=release(s,[spec.responseMaterialId,...(spec.referralMaterialId?[spec.referralMaterialId]:[])],{recipientIds:action.recipientIds});
      materialIds=[addStudentMaterial(s,issue,action,'request'),...incoming];
      outcome=incoming.length?'request_received':'already_received';
      if(incoming.length){issue.status='awaiting';resetNotice();}
    }
  }else if(action.kind==='verify'){
    if(!action.reason||!selected.length)outcome='evidence_required';
    else if(!onlyRelevant)outcome='evidence_unrelated';
    else{
      const proof=relevant.filter(m=>spec.evidenceMaterialIds.includes(m.id)&&m.verification==='confirmation').map(m=>m.id);
      if(!proof.length)outcome='evidence_insufficient';
      else{
        if(!finalized){
          const previous=[...issue.verifiedEvidenceIds];issue.verifiedEvidenceIds=unique([...previous,...proof]);
          if(!same(previous,issue.verifiedEvidenceIds))resetNotice();
          issue.status='ready';
        }
        outcome='evidence_verified';
      }
    }
  }else if(action.kind==='notify'){
    if(!action.reason||!action.instruction||!action.expectedResult||!selected.length)outcome='notice_incomplete';
    else if(!onlyRelevant)outcome='evidence_unrelated';
    else{
      materialIds=[addStudentMaterial(s,issue,action,'notice')];issue.notified=true;issue.notificationEvidenceIds=action.evidenceSourceIds;
      outcome='notice_recorded';
    }
  }else if(action.kind==='close'){
    if(issue.status==='closed')outcome='already_closed';
    else if(!action.reason||!selected.length)outcome='closure_reason_required';
    else if(!onlyRelevant||!issue.verifiedEvidenceIds.some(id=>action.evidenceSourceIds.includes(id)))outcome='closure_evidence_required';
    else if(spec.deliveryRequired&&(!issue.notified||!issue.verifiedEvidenceIds.some(id=>action.evidenceSourceIds.includes(id)&&issue.notificationEvidenceIds.includes(id))))outcome='closure_notice_required';
    else{issue.status='closed';issue.substantiveStatus='resolved';outcome='closed';}
  }else if(action.kind==='keep_open'){
    if(!action.reason||!action.instruction)outcome='next_action_required';
    else{issue.status='open';issue.substantiveStatus='pending';outcome='kept_open';}
  }else if(action.kind==='refer'){
    if(!spec.allowReferral)outcome='referral_not_applicable';
    else if(!action.reason||!action.instruction||!recipientResult(s,spec,action,{caseData,recipientCheck}))outcome='recipient_unconfirmed';
    else{
      const receiptIds=unique([spec.referralMaterialId,...(s.definition.materials.find(m=>m.id===spec.responseMaterialId)?.verification==='delivery'?[spec.responseMaterialId]:[])].filter(Boolean));
      const receipt=relevant.find(m=>receiptIds.includes(m.id)&&m.verification==='delivery');
      if(!onlyRelevant||!receipt)outcome='receipt_required';
      else if(receipt.recipientIds?.length&&!same(receipt.recipientIds.map(id=>ROUTING_AUTHORITY_ALIASES[id]||id).sort(),action.recipientIds.map(id=>ROUTING_AUTHORITY_ALIASES[id]||id).sort()))outcome='receipt_recipient_mismatch';
      else{issue.status='referred';issue.substantiveStatus='referred';outcome='referred';}
    }
  }else if(action.kind==='reopen'){
    if(!finalized)outcome='already_open';
    else if(!action.reason)outcome='reopen_reason_required';
    else{issue.status='reopened';issue.substantiveStatus='pending';issue.verifiedEvidenceIds=[];resetNotice();outcome='reopened';}
  }
  const event=append(s,{issueId:issue.id,kind:action.kind,outcome,action,materialIds,timestamp});
  s.revision++;s.receipts[request]={digest:requestDigest,eventId:event.id,revision:s.revision};
  return enforceBudget(seal(refresh(s)));
}

function materialView(material,locale){
  return {id:material.id,kind:material.kind,title:local(material.title,locale),text:local(material.text,locale),issueIds:clone(material.issueIds),
    provenanceLabel:local(PROVENANCE[material.provenance.kind],locale),
    ...(material.factsDoNotEstablish?{factsDoNotEstablish:local(material.factsDoNotEstablish,locale)}:{})};
}
function actionsFor(issue,locale){
  const kinds=issue.status==='closed'||issue.status==='referred'?['verify','notify','reopen']:CONTROL_ACTION_KINDS.filter(kind=>kind!=='reopen');
  return kinds.map(kind=>({kind,label:local(LABELS[kind],locale),requiresInstruction:['request_evidence','notify','keep_open','refer'].includes(kind),
    requiresRecipients:['request_evidence','refer'].includes(kind),requiresDueDate:kind==='request_evidence'}));
}
export function publicControlWorkflow(workflow,profile=null,locale='ru'){
  const s=assertState(workflow);
  return {version:s.version,revision:s.revision,caseId:s.caseId,status:s.status,
    issues:s.issues.map(issue=>({id:issue.id,title:local(issue.title,locale),scope:local(issue.scope,locale),resultType:local(issue.resultType,locale),status:issue.status,
      substantiveStatus:issue.substantiveStatus,materialIds:clone(issue.materialIds),verifiedEvidenceIds:clone(issue.verifiedEvidenceIds),notified:issue.notified,availableActions:actionsFor(issue,locale)})),
    materials:s.materials.map(material=>materialView(material,locale)),plannedOrders:clone(s.plannedOrders),
    journal:s.journal.map(({hash,previousHash,...event})=>({...clone(event),label:local(event.label,locale),message:local(event.message,locale)}))};
}
export function controlWorkflowSources(workflow,profile=null,locale='ru',{review=false}={}){
  const s=assertState(workflow);
  return s.materials.map(material=>({id:material.id,kind:'document',title:local(material.title,locale),
    text:review&&material.provenance.kind==='student-action'
      ? 'Student-authored simulation record. Complete, unabridged submitted prose appears in context.sections.execution; journal entry '+material.eventId+'. This record is not proof of an external result.'
      : local(material.text,locale),issueIds:clone(material.issueIds),provenanceLabel:local(PROVENANCE[material.provenance.kind],locale)}));
}
export function controlReviewContext(workflow,profile=null,locale='ru'){
  const s=assertState(workflow),view=publicControlWorkflow(s,null,locale);
  return {version:s.version,revision:s.revision,caseId:s.caseId,definitionHash:s.definitionHash,
    provenance:clone(s.definition.provenance),initialRouting:clone(s.initialRouting),
    plannedOrders:view.plannedOrders.map(({id,issueId,recipientIds,dueDate,citationIds})=>({id,issueId,recipientIds,dueDate,citationIds})),
    issues:view.issues.map(({availableActions,...issue})=>({...issue,
      allowedStatuses:[issue.status==='closed'?'resolved':issue.status==='referred'?'referred':'pending'],
      acceptedRecipientSets:clone(s.definition.issues.find(row=>row.id===issue.id).acceptedRecipientSets||[]),
      recipientNames:(s.definition.issues.find(row=>row.id===issue.id).acceptedRecipientSets||[]).map(set=>set.map(id=>local(ROUTING_AUTHORITIES[id]?.name,locale))),
      recipientBasis:clone(s.definition.issues.find(row=>row.id===issue.id).recipientBasis||null),
      authoredInitialStatus:s.definition.issues.find(row=>row.id===issue.id).initialStatus,
      closureScope:local(s.definition.issues.find(row=>row.id===issue.id).closureText,locale),
      continuation:local(s.definition.issues.find(row=>row.id===issue.id).continuationText,locale)})),
    materials:view.materials.map(({text,kind,...material})=>({...material,sourceId:'document:'+material.id,verification:s.materials.find(row=>row.id===material.id).verification,
      recipientIds:clone(s.materials.find(row=>row.id===material.id).recipientIds||[]),
      recipientNames:(s.materials.find(row=>row.id===material.id).recipientIds||[]).map(id=>local(ROUTING_AUTHORITIES[id]?.name,locale))})),
    journal:view.journal.map(({reason,instruction,expectedResult,...event})=>event),
    instructions:'Facts come only from the released authored materials. Student requests and simulated dispatch records are actions, not proof of execution. Assess the meaning of instructions and comparisons; structural acceptance is not semantic certification. A corrected rejected attempt is not a permanent critical error. Scope completion does not establish a wider physical or legal outcome.'};
}

/** Exact JSON byte bounds of the new review contribution, across all supported locales.
 * The service must reserve the remaining envelope for the pre-existing dossier,
 * initial work, citations and a maximum-size final memorandum. No prose is truncated.
 */
export function controlWorkflowReviewSize(workflow){
  const s=assertState(workflow);
  const newProseBytes=Buffer.byteLength(JSON.stringify(s.journal.filter(row=>CONTROL_ACTION_KINDS.includes(row.kind))
    .map(({reason,instruction,expectedResult})=>({reason,instruction,expectedResult}))),'utf8');
  const locales={};
  for(const locale of ['ru','en','zh']){
    const view=publicControlWorkflow(s,null,locale);
    const executionSection=view.journal.map(row=>[row.label,row.reason,row.instruction,row.expectedResult].filter(Boolean).join('\n')).join('\n\n');
    const sources=controlWorkflowSources(s,null,locale,{review:true}).map(source=>({...source,id:'document:'+source.id,available:true}));
    // Deliberate wrapper reserve covers the surrounding array and source metadata.
    locales[locale]=Buffer.byteLength(JSON.stringify({execution:controlReviewContext(s,null,locale),executionSection,sources}),'utf8')+2048;
  }
  return {newProseBytes,reviewContributionBytes:Math.max(...Object.values(locales)),locales,
    limits:clone(s.budget||{newProseBytes:L.newProseBytes,reviewContributionBytes:L.reviewContributionBytes})};
}
function enforceBudget(s){
  const size=controlWorkflowReviewSize(s);
  if(size.newProseBytes>size.limits.newProseBytes||size.reviewContributionBytes>size.limits.reviewContributionBytes)error('control_context_limit',413);
  return s;
}

const VALIDATION={
  status_missing:T('Укажите состояние каждого предмета в итоговом заключении.','State the disposition of every issue in the final memorandum.','请在最终结论中填写每个事项的状态。'),
  closure_not_verified:T('Статус «разрешён» пока не подтверждён завершённой проверкой и необходимым уведомлением. Исправьте действие или итоговый статус.','Resolved status is not supported by completed verification and any required notification. Correct the action or the final status.','“已解决”状态尚无完整核查及必要通知的支持。请修正操作或最终状态。'),
  referral_not_recorded:T('В журнале нет подтверждённой передачи этого предмета компетентному адресату.','The journal has no acknowledged referral of this issue to a competent recipient.','日志中没有该事项已由主管接收方确认接收的转交记录。'),
  evidence_missing:T('Укажите полученный источник по этому предмету.','Cite a received source for this issue.','请引用该事项已收到的来源。'),
  evidence_unavailable:T('Указанный источник не получен в этом деле либо относится к другому предмету.','The cited source was not received in this case or concerns another issue.','所引用来源尚未在本案中收到，或涉及其他事项。'),
  evidence_not_verified:T('Для подтверждённого завершения сошлитесь на проверенный материал этой части дела.','For closure, cite verified evidence for this part of the case.','确认结束时，请引用本部分案件已核查的证据。'),
  evidence_not_receipt:T('Для передачи сошлитесь на полученную квитанцию адресата, а не на запись отправки.','For referral, cite the recipient’s acknowledgement rather than a dispatch record.','确认转交时，请引用接收方回执，而非发送记录。'),
  final_state_conflict:T('Итоговый статус расходится с журналом. При необходимости возобновите контроль и затем обновите заключение.','The final status conflicts with the journal. Reopen control if needed, then update the memorandum.','最终状态与日志不一致。如有需要，请恢复监督后更新结论。'),
};
export function validateControlSubmission(workflow,profile,control){
  const s=assertState(workflow);
  if(!object(control)||typeof control.text!=='string'||control.text.length>6000||control.text.includes('\0')||!Array.isArray(control.statuses)||control.statuses.length>L.issues)error('invalid_control');
  const rows=control.statuses,seen=new Set(),findings=[];
  for(const row of rows){
    if(!object(row)||!s.issues.some(issue=>issue.id===row.issueId)||seen.has(row.issueId)||!['pending','resolved','referred'].includes(row.status))error('invalid_control');
    seen.add(row.issueId);ids(row.evidenceSourceIds,L.evidence);
  }
  const expectedStatuses=s.issues.map(issue=>({issueId:issue.id,allowedStatuses:[issue.status==='closed'?'resolved':issue.status==='referred'?'referred':'pending'],
    verifiedEvidenceIds:clone(issue.verifiedEvidenceIds),scope:clone(issue.scope)}));
  const add=(issueId,code)=>findings.push({issueId,code,message:clone(VALIDATION[code])});
  for(const issue of s.issues){
    const row=rows.find(row=>row.issueId===issue.id),spec=s.definition.issues.find(row=>row.id===issue.id);
    if(!row){add(issue.id,'status_missing');continue;}
    const refs=row.evidenceSourceIds||[],materials=refs.map(id=>s.materials.find(m=>m.id===id));
    if(!refs.length)add(issue.id,'evidence_missing');
    else if(materials.some(m=>!m||!m.issueIds.includes(issue.id)))add(issue.id,'evidence_unavailable');
    if(row.status==='resolved'){
      if(issue.status!=='closed')add(issue.id,'closure_not_verified');
      if(!issue.verifiedEvidenceIds.some(id=>refs.includes(id)))add(issue.id,'evidence_not_verified');
    }else if(row.status==='referred'){
      if(issue.status!=='referred')add(issue.id,'referral_not_recorded');
      const receipts=[spec.referralMaterialId,...(s.definition.materials.find(m=>m.id===spec.responseMaterialId)?.verification==='delivery'?[spec.responseMaterialId]:[])].filter(Boolean);
      if(!materials.some(m=>m&&m.verification==='delivery'&&receipts.includes(m.id)))add(issue.id,'evidence_not_receipt');
    }else if(['closed','referred'].includes(issue.status))add(issue.id,'final_state_conflict');
  }
  return {valid:findings.length===0,findings,expectedStatuses};
}
