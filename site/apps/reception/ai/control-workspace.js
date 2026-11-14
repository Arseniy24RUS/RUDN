/**
 * A workbench for the server-owned execution-v1 workflow.
 * This module renders public records and prepares student commands. It never
 * sets workflow status, releases a material or determines a correct outcome.
 *
 * Host integration:
 * - Wrap controlWorkspaceView in the existing data-followup-form, without a
 *   second submit button. The memorandum contains its own type=submit button.
 * - Pass input/change/click targets to controlWorkspaceIntent. Apply its pure
 *   action-draft / ui update, or handle execute / choose-recipient on the host.
 * - Final memorandum fields retain the existing data-response-* attributes and
 *   restoreCorrespondenceControl / correspondenceControlSubmission contract.
 * - Send controlActionSubmission(actionDraft), never the workflow or UI state.
 * - Navigation remains available while disabled; commands and writing do not.
 */
import {restoreCorrespondenceControl} from './response-editor.js';

const ACTIONS = ['request_evidence','verify','notify','close','keep_open','refer','reopen'];
const FINAL_STATUSES = ['pending','resolved','referred'];
const LIMITS = {issueId:120,reason:2000,instruction:2000,expectedResult:1000};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const language=value=>value==='en'||value==='zh'?value:'ru';
const local=(value,locale)=>typeof value==='string'?value:value&&typeof value==='object'?String(value[language(locale)]??value.ru??value.en??''):'';
const text=(value,max=6000)=>typeof value==='string'?value.slice(0,max):'';
const ids=(value,max=20)=>[...new Set((Array.isArray(value)?value:[]).filter(id=>typeof id==='string'&&id.length&&id.length<=240))].slice(0,max);
const paragraphs=value=>String(value||'').trim().split(/\n\s*\n/).filter(Boolean).map(part=>'<p>'+esc(part).replace(/\n/g,'<br>')+'</p>').join('');
const date=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const parsed=new Date(value+'T12:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:'';
};
const copy={
  ru:{
    title:'Контроль исполнения',intro:'Сопоставьте поступившие сведения с предметом обращения. Зафиксируйте необходимые действия и подготовьте итог по каждому вопросу.',
    matters:'Вопросы обращения',matter:'Вопрос обращения',scope:'Что проверяется',substance:'По существу',workStage:'Стадия работы',
    noIssues:'Предметы контроля пока не получены.',current:'Текущий вопрос',materials:'Полученные материалы',noMaterials:'По этому вопросу новые материалы пока не поступили.',
    material:'Материал дела',openMaterial:'Прочитать материал',closeMaterial:'Закрыть материал',source:'Источник',recordedMaterial:'Материал учебного дела',related:'Относится к вопросам',
    chronology:'Журнал работы',allEvents:'Все вопросы',issueEvents:'Текущий вопрос',emptyJournal:'Действия по этому вопросу ещё не зарегистрированы.',step:'Шаг',event:'Событие по делу',
    actionContent:'Содержание действия специалиста',actionReason:'Обоснование',instruction:'Что требуется сделать',recipient:'Адресат',due:'Установленный срок',expected:'Ожидаемый результат',grounds:'Основания действия',
    planned:'Первоначальные поручения',planHint:'План из зафиксированного проекта. Исполнение проверяется по поступившим материалам.',unallocated:'Предмет не определён',planEmpty:'В первоначальном проекте отдельных поручений нет.',
    tools:'Следующее действие',toolsHint:'Выберите профессиональное действие и сформулируйте его содержание.',noActions:'На этом этапе новых действий нет. Можно перейти к заключению.',
    draft:'Проект действия',draftOther:'Сохранён незавершённый проект действия по другому вопросу.',continueDraft:'Вернуться к проекту действия',clearDraft:'Очистить проект действия',
    reason:'Основание и цель действия',reasonHint:'Какое обстоятельство требует этого действия и какого результата вы добиваетесь?',
    requestInstruction:'Содержание запроса',verificationInstruction:'Результат сопоставления материалов',notificationInstruction:'Текст сообщения адресату',closureInstruction:'Какой результат зафиксировать',
    continuationInstruction:'Дальнейшее действие',referralInstruction:'Предмет и содержание передачи',reopeningInstruction:'Основание возобновления и дальнейшее действие',
    instructionHint:'Сформулируйте действие своими словами, с учётом материалов и полномочий.',chooseRecipient:'Выбрать адресата',recipientEmpty:'Адресат ещё не выбран',removeRecipient:'Убрать адресата',
    dueLabel:'Срок следующего действия',dueHint:'Укажите дату, если она требуется для этого действия.',expectedLabel:'Какой результат требуется получить',expectedHint:'Документ, сведения, подтверждение или иной проверяемый результат.',
    evidence:'Материалы, на которые вы опираетесь',evidenceHint:'Можно открыть материал перед выбором. Получение документа и его проверка — отдельные действия.',evidenceEmpty:'Для этого действия пока нет полученных материалов.',
    execute:'Зафиксировать действие',simulation:'Действие будет зарегистрировано в учебном деле. Результат появится в журнале.',
    prepare:'Подготовить заключение',prepareHint:'Итог может предусматривать завершение, продолжение работы или передачу по компетенции.',
    memorandum:'Заключение по контролю',memoIntro:'Сформулируйте итог по каждому вопросу и укажите подтверждающие материалы. Обоснуйте завершение или дальнейшую работу.',
    yourDisposition:'Ваш итог по вопросу',chooseDisposition:'Укажите итог',support:'Подтверждающие материалы',memoText:'Мотивированное заключение',memoHint:'Укажите установленные результаты, их основания и необходимые дальнейшие действия. Учитывайте пределы рассмотренного вопроса.',
    back:'Вернуться к работе по делу',submit:'Зафиксировать итог контроля',saved:'Зафиксированное заключение',noConclusion:'Заключение не представлено.',notChosen:'Итог не указан',noEvidence:'Материалы не указаны',
    record:'Запись контроля по делу',recordHint:'Сохранённые действия, полученные материалы и итоговое заключение.',unknownRecipient:'Адресат из записи работы',
    readOnly:'Работа доступна для просмотра.',ready:'Можно подготовить заключение',selected:'Выбрано',
    actions:{request_evidence:'Запросить подтверждения',verify:'Проверить материалы',notify:'Подготовить уведомление',close:'Завершить работу по вопросу',keep_open:'Продолжить контроль',refer:'Передать по компетенции',reopen:'Возобновить рассмотрение'},
    substantive:{pending:'Вопрос остаётся открытым',resolved:'Результат по предмету подтверждён',referred:'Передано по компетенции'},
    stage:{open:'Первичная проверка',awaiting:'Ожидаются сведения',ready:'Материалы проверены',closed:'Работа по вопросу завершена',referred:'Передано',reopened:'Рассмотрение возобновлено'},
    final:{pending:'Продолжить работу',resolved:'Завершить рассмотрение',referred:'Передача по компетенции'},
    orderKinds:{request:'Запрос материалов',referral:'Передача по компетенции',execution:'Исполнение',review:'Проверка',notification:'Уведомление',control:'Контроль результата'},
  },
  en:{
    title:'Follow-through',intro:'Compare the incoming information with the scope of the appeal. Record the necessary actions and prepare a conclusion for each issue.',
    matters:'Appeal issues',matter:'Appeal issue',scope:'Scope of review',substance:'Substantive outcome',workStage:'Work stage',noIssues:'The issues for review have not arrived yet.',current:'Current issue',
    materials:'Received materials',noMaterials:'No new materials have arrived for this issue yet.',material:'Case material',openMaterial:'Read material',closeMaterial:'Close material',source:'Source',recordedMaterial:'Training case material',related:'Related issues',
    chronology:'Work log',allEvents:'All issues',issueEvents:'Current issue',emptyJournal:'No actions have been recorded for this issue yet.',step:'Step',event:'Case event',
    actionContent:'Content of the specialist’s action',actionReason:'Reason',instruction:'Required action',recipient:'Recipient',due:'Recorded deadline',expected:'Expected result',grounds:'Supporting materials',
    planned:'Original assignments',planHint:'The plan from the recorded draft. Completion is checked against received materials.',unallocated:'Issue not allocated',planEmpty:'The original draft contains no separate assignments.',
    tools:'Next action',toolsHint:'Choose a professional action and write its substance.',noActions:'There are no new actions at this stage. You can prepare the conclusion.',
    draft:'Action draft',draftOther:'An unfinished action draft is saved for another issue.',continueDraft:'Return to the action draft',clearDraft:'Clear action draft',
    reason:'Grounds and purpose',reasonHint:'Which circumstance calls for this action, and what result are you seeking?',requestInstruction:'Request text',verificationInstruction:'Comparison of the materials',notificationInstruction:'Message to the recipient',closureInstruction:'Result to be recorded',continuationInstruction:'Further action',referralInstruction:'Scope and content of the referral',reopeningInstruction:'Grounds for reopening and further action',
    instructionHint:'Write the action in your own words, considering the materials and the body’s powers.',chooseRecipient:'Choose recipient',recipientEmpty:'No recipient selected',removeRecipient:'Remove recipient',
    dueLabel:'Deadline for the next action',dueHint:'Enter a date when this action requires one.',expectedLabel:'Required result',expectedHint:'A document, information, confirmation or another verifiable result.',
    evidence:'Materials supporting this action',evidenceHint:'Open a material before selecting it if needed. Receiving and verifying a document are separate actions.',evidenceEmpty:'No received materials are available for this action yet.',
    execute:'Record action',simulation:'The action will be recorded in the training case. Its result will appear in the work log.',
    prepare:'Prepare conclusion',prepareHint:'The conclusion may provide for completion, further work or referral to a competent body.',
    memorandum:'Follow-through memorandum',memoIntro:'State an outcome for each issue and identify its supporting materials. Explain completion or further work.',
    yourDisposition:'Your conclusion on the issue',chooseDisposition:'Choose an outcome',support:'Supporting materials',memoText:'Reasoned conclusion',memoHint:'State the established results, their grounds and any further action. Respect the scope of the issue reviewed.',
    back:'Return to case work',submit:'Record the final conclusion',saved:'Recorded conclusion',noConclusion:'No conclusion submitted.',notChosen:'No outcome specified',noEvidence:'No materials specified',
    record:'Case follow-through record',recordHint:'Recorded actions, received materials and the final conclusion.',unknownRecipient:'Recipient from the work record',readOnly:'This work is available for review.',ready:'A conclusion can be prepared',selected:'Selected',
    actions:{request_evidence:'Request evidence',verify:'Verify materials',notify:'Prepare a notification',close:'Complete work on the issue',keep_open:'Continue follow-through',refer:'Refer to a competent body',reopen:'Reopen the issue'},
    substantive:{pending:'The issue remains open',resolved:'Result within scope confirmed',referred:'Referred to a competent body'},
    stage:{open:'Initial review',awaiting:'Awaiting information',ready:'Materials verified',closed:'Work on the issue completed',referred:'Referred',reopened:'Review reopened'},
    final:{pending:'Continue work',resolved:'Complete review',referred:'Referral to a competent body'},
    orderKinds:{request:'Request for materials',referral:'Referral',execution:'Implementation',review:'Review',notification:'Notification',control:'Result verification'},
  },
  zh:{
    title:'办理结果核查',intro:'将收到的信息与来信事项的范围进行对照。记录必要行动，并为每项诉求形成结论。',
    matters:'来信事项',matter:'来信事项',scope:'核查范围',substance:'事项结果',workStage:'办理阶段',noIssues:'尚未收到待核查事项。',current:'当前事项',
    materials:'已收到的材料',noMaterials:'尚未收到与该事项有关的新材料。',material:'案件材料',openMaterial:'阅读材料',closeMaterial:'关闭材料',source:'来源',recordedMaterial:'教学案件材料',related:'相关事项',
    chronology:'办理日志',allEvents:'全部事项',issueEvents:'当前事项',emptyJournal:'尚未记录该事项的办理行动。',step:'步骤',event:'案件事件',
    actionContent:'经办人员的行动内容',actionReason:'理由',instruction:'所需行动',recipient:'接收方',due:'已确定的期限',expected:'预期结果',grounds:'依据材料',
    planned:'初始任务',planHint:'已提交草稿中的工作计划。完成情况根据收到的材料核查。',unallocated:'尚未对应事项',planEmpty:'初始草稿中没有单独的任务。',
    tools:'下一步行动',toolsHint:'选择办理行动，并自行撰写具体内容。',noActions:'本阶段没有新的行动。可以准备结论。',
    draft:'行动草稿',draftOther:'另一事项尚有未完成的行动草稿。',continueDraft:'返回行动草稿',clearDraft:'清除行动草稿',
    reason:'行动依据与目的',reasonHint:'什么情况需要采取该行动？希望取得什么结果？',requestInstruction:'请求内容',verificationInstruction:'材料比对结果',notificationInstruction:'给接收方的通知内容',closureInstruction:'应记录的结果',continuationInstruction:'后续行动',referralInstruction:'转送范围及内容',reopeningInstruction:'重新审查的依据及后续行动',
    instructionHint:'结合材料与机关权限，用自己的话明确行动。',chooseRecipient:'选择接收方',recipientEmpty:'尚未选择接收方',removeRecipient:'移除接收方',
    dueLabel:'下一步行动期限',dueHint:'该行动需要期限时，请填写日期。',expectedLabel:'需要取得的结果',expectedHint:'文件、信息、证明或其他可核查的结果。',
    evidence:'本次行动依据的材料',evidenceHint:'可以先打开材料再选择。收到文件与核验文件是两个不同的行动。',evidenceEmpty:'目前没有可用于该行动的已收材料。',
    execute:'记录行动',simulation:'该行动将记入教学案件。行动结果将在日志中显示。',
    prepare:'准备结论',prepareHint:'结论可以是完成办理、继续处理或按职权转送。',
    memorandum:'办理核查结论',memoIntro:'分别说明每项诉求的结果及证明材料，并解释为何可以结束或需要继续工作。',
    yourDisposition:'您对该事项的结论',chooseDisposition:'请选择结果',support:'证明材料',memoText:'附理由的结论',memoHint:'说明已查明的结果、依据以及必要的后续行动。注意已审查事项的范围。',
    back:'返回案件办理',submit:'记录最终核查结论',saved:'已记录的结论',noConclusion:'尚未提交结论。',notChosen:'尚未说明结果',noEvidence:'尚未注明材料',
    record:'案件核查记录',recordHint:'已记录的行动、收到的材料与最终结论。',unknownRecipient:'办理记录中的接收方',readOnly:'该作业可供查阅。',ready:'可以准备结论',selected:'已选择',
    actions:{request_evidence:'请求证明材料',verify:'核验材料',notify:'准备通知',close:'完成该事项的办理',keep_open:'继续跟进',refer:'按职权转送',reopen:'重新审查事项'},
    substantive:{pending:'事项仍待处理',resolved:'已确认事项范围内的结果',referred:'已按职权转送'},
    stage:{open:'初步核查',awaiting:'等待信息',ready:'材料已核验',closed:'事项办理已完成',referred:'已转送',reopened:'已恢复审查'},
    final:{pending:'继续办理该事项',resolved:'在已确认的结果范围内结束办理',referred:'记录按职权转送'},
    orderKinds:{request:'请求材料',referral:'按职权转送',execution:'执行',review:'核查',notification:'通知',control:'结果核验'},
  },
};

function icon(name){
  const paths={
    paper:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
    request_evidence:'<path d="M4 5h16v14H4zM4 6l8 6 8-6M8 16h4"/>',
    verify:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5m-13-10 2 2 4-4"/>',
    notify:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8M10 20h4"/>',
    close:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    keep_open:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    refer:'<path d="M4 12h15m-5-5 5 5-5 5M4 5v14"/>',
    reopen:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
    arrow:'<path d="M19 12H5m6-6-6 6 6 6"/>',
    close_panel:'<path d="m6 6 12 12M6 18 18 6"/>',
  };
  return '<svg class="rxe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.paper)+'</svg>';
}
function button(label,action,{extra='',disabled=false,primary=false,quiet=false,glyph=''}={}){
  return '<button type="button" class="rxa-btn rxe-button'+(primary?' primary':'')+(quiet?' quiet':'')+'" data-control-action="'+action+'"'+(disabled?' disabled':'')+' '+extra+'>'+(glyph?icon(glyph):'')+'<span>'+esc(label)+'</span></button>';
}
function humanDate(value,locale){
  const valid=date(value);if(!valid)return '';
  return new Intl.DateTimeFormat({ru:'ru-RU',en:'en-GB',zh:'zh-CN'}[language(locale)],{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(valid+'T12:00:00Z'));
}

export function restoreControlActionDraft(value,workflow){
  const source=value&&typeof value==='object'?value:{};
  return {issueId:text(source.issueId,LIMITS.issueId),kind:ACTIONS.includes(source.kind)?source.kind:'',reason:text(source.reason,LIMITS.reason),instruction:text(source.instruction,LIMITS.instruction),recipientIds:ids(source.recipientIds,12),dueDate:date(source.dueDate),expectedResult:text(source.expectedResult,LIMITS.expectedResult),evidenceSourceIds:ids(source.evidenceSourceIds)};
}
export function reduceControlActionDraft(value,action={},workflow){
  const draft=restoreControlActionDraft(value);
  if(action.type==='reset')return restoreControlActionDraft({issueId:action.issueId??draft.issueId});
  if(action.type==='select'||action.type==='issue'){
    const issueId=text(action.issueId,LIMITS.issueId)||draft.issueId;
    // A draft for a different issue is kept until the student explicitly clears
    // it. Merely inspecting another issue must not reassign their instructions.
    if(draft.issueId&&issueId!==draft.issueId&&hasActionWork(draft))return draft;
    return {...draft,issueId,kind:ACTIONS.includes(action.kind)?action.kind:draft.kind};
  }
  if(action.type==='field'){
    const field=action.field;
    if(field==='kind')draft.kind=ACTIONS.includes(action.value)?action.value:'';
    else if(field==='dueDate')draft.dueDate=date(action.value);
    else if(field==='issueId'&&draft.issueId&&action.value!==draft.issueId&&hasActionWork(draft))return draft;
    else if(Object.hasOwn(LIMITS,field))draft[field]=text(action.value,LIMITS[field]);
  }else if(action.type==='evidence'&&text(action.sourceId,240))draft.evidenceSourceIds=action.selected?ids([...draft.evidenceSourceIds,action.sourceId]):draft.evidenceSourceIds.filter(id=>id!==action.sourceId);
  else if(action.type==='recipient'&&text(action.recipientId,240))draft.recipientIds=action.selected?ids([...draft.recipientIds,action.recipientId],12):draft.recipientIds.filter(id=>id!==action.recipientId);
  return draft;
}
export function controlActionSubmission(value,workflow){return restoreControlActionDraft(value);}
export function restoreControlWorkspaceUI(value,workflow){
  const source=value&&typeof value==='object'?value:{};
  return {issueId:text(source.issueId,120),materialId:text(source.materialId,240),pane:source.pane==='memorandum'?'memorandum':'work',journalAll:source.journalAll===true};
}
export function reduceControlWorkspaceUI(value,action={},workflow){
  const ui=restoreControlWorkspaceUI(value);
  if(action.type==='issue'){ui.issueId=text(action.issueId,120);ui.materialId='';ui.pane='work';}
  if(action.type==='material')ui.materialId=text(action.materialId,240);
  if(action.type==='pane')ui.pane=action.pane==='memorandum'?'memorandum':'work';
  if(action.type==='journal')ui.journalAll=typeof action.all==='boolean'?action.all:!ui.journalAll;
  return ui;
}
function hasActionWork(draft){return Boolean(draft.reason||draft.instruction||draft.recipientIds.length||draft.dueDate||draft.expectedResult||draft.evidenceSourceIds.length);}

/** Pure event decoding. The host alone performs requests and persists drafts. */
export function controlWorkspaceIntent(element){
  if(!element?.closest)return null;
  const field=element.closest('[data-control-field]');
  if(field){
    if(field.disabled)return null;
    if(field.dataset.controlField==='evidenceSourceIds')return {type:'action-draft',action:{type:'evidence',sourceId:field.dataset.sourceId,selected:field.checked===true}};
    return {type:'action-draft',action:{type:'field',field:field.dataset.controlField,value:field.value}};
  }
  const target=element.closest('[data-control-action]');if(!target||target.disabled)return null;
  const {controlAction:action,issueId,materialId,kind,recipientId}=target.dataset;
  if(action==='select-issue')return {type:'ui',action:{type:'issue',issueId}};
  if(action==='open-material'||action==='close-material')return {type:'ui',action:{type:'material',materialId:action==='close-material'?'':materialId}};
  if(action==='prepare-memorandum'||action==='back-to-work')return {type:'ui',action:{type:'pane',pane:action==='prepare-memorandum'?'memorandum':'work'}};
  if(action==='toggle-journal')return {type:'ui',action:{type:'journal'}};
  if(action==='select-kind')return {type:'action-draft',action:{type:'select',issueId,kind}};
  if(action==='clear-action')return {type:'action-draft',action:{type:'reset',issueId}};
  if(action==='remove-recipient')return {type:'action-draft',action:{type:'recipient',recipientId,selected:false}};
  if(action==='execute'||action==='choose-recipient')return {type:action};
  return null;
}

function publicView(workflow,locale){
  const source=workflow&&typeof workflow==='object'?workflow:{},t=copy[language(locale)];
  const issues=(Array.isArray(source.issues)?source.issues:[]).filter(issue=>issue&&typeof issue.id==='string').slice(0,20);
  const materials=(Array.isArray(source.materials)?source.materials:[]).filter(material=>material&&typeof material.id==='string').slice(0,200);
  // No spread/stringification of profile records: fields which resemble private
  // verification, closure rules or future materials are intentionally ignored.
  return {issues,materials,journal:(Array.isArray(source.journal)?source.journal:[]).filter(event=>event&&typeof event.id==='string').slice(-200),plannedOrders:Array.isArray(source.plannedOrders)?source.plannedOrders:[],t,locale:language(locale)};
}
function materialTitle(material,ctx){return local(material?.title,ctx.locale)||ctx.t.material;}
function issueTitle(issue,ctx){return local(issue?.title,ctx.locale)||ctx.t.matter;}
function recipientName(id,recipients,ctx){const row=(recipients||[]).find(item=>item.id===id);return local(row?.label??row?.name,ctx.locale)||ctx.t.unknownRecipient;}
function statusMarkup(issue,ctx){
  const t=ctx.t,substance=t.substantive[issue.substantiveStatus]||t.substantive.pending,stage=t.stage[issue.status]||t.stage.open;
  return '<dl class="rxe-status-pair"><div><dt>'+esc(t.substance)+'</dt><dd>'+esc(substance)+'</dd></div><div><dt>'+esc(t.workStage)+'</dt><dd class="rxe-stage rxe-stage-'+(['open','awaiting','ready','closed','referred','reopened'].includes(issue.status)?issue.status:'open')+'">'+esc(stage)+'</dd></div></dl>';
}
function materialLinks(materialIds,ctx,{readOnly=false}={}){
  return ids(materialIds).map(id=>ctx.materials.find(material=>material.id===id)).filter(Boolean).map(material=>readOnly?'<span class="rxe-source-name">'+esc(materialTitle(material,ctx))+'</span>':button(materialTitle(material,ctx),'open-material',{extra:'data-material-id="'+esc(material.id)+'"',quiet:true,glyph:'paper'})).join('');
}
function materialView(material,ctx,{readOnly=false}={}){
  if(!material)return '';
  return '<article class="rxe-material" data-control-material="'+esc(material.id)+'" tabindex="-1"><header><div><p class="rxe-eyebrow">'+esc(local(material.provenanceLabel,ctx.locale)||ctx.t.recordedMaterial)+'</p><h3>'+esc(materialTitle(material,ctx))+'</h3></div>'+(!readOnly?button(ctx.t.closeMaterial,'close-material',{quiet:true,glyph:'close_panel'}):'')+'</header><div class="rxe-material-text">'+paragraphs(local(material.text,ctx.locale))+'</div></article>';
}
function plannedView(ctx,recipients,issueId,{readOnly=false}={}){
  const rows=ctx.plannedOrders.filter(order=>order&&(!issueId||order.issueId===issueId||!order.issueId));
  if(!rows.length)return '';
  return '<details class="rxe-planned"><summary>'+esc(ctx.t.planned)+' <span>'+rows.length+'</span></summary><p class="rxe-muted">'+esc(ctx.t.planHint)+'</p>'+rows.map(order=>'<article><h4>'+esc(order.issue||issueTitle(ctx.issues.find(issue=>issue.id===order.issueId),ctx))+'</h4>'+(!order.issueId?'<p class="rxe-unallocated">'+esc(ctx.t.unallocated)+'</p>':'')+paragraphs(order.instruction)+'<dl class="rxe-record-fields">'+(ids(order.recipientIds).length?'<div><dt>'+esc(ctx.t.recipient)+'</dt><dd>'+esc(ids(order.recipientIds).map(id=>recipientName(id,recipients,ctx)).join('; '))+'</dd></div>':'')+(date(order.dueDate)?'<div><dt>'+esc(ctx.t.due)+'</dt><dd>'+esc(humanDate(order.dueDate,ctx.locale))+'</dd></div>':'')+(order.expectedResult?'<div><dt>'+esc(ctx.t.expected)+'</dt><dd>'+esc(order.expectedResult)+'</dd></div>':'')+'</dl></article>').join('')+'</details>';
}
function journalView(ctx,issueId,ui,recipients,{readOnly=false}={}){
  const rows=ctx.journal.filter(event=>readOnly||ui.journalAll||!event.issueId||event.issueId===issueId).slice().sort((a,b)=>(Number(a.seq)||0)-(Number(b.seq)||0));
  const list=rows.map(event=>{
    const action=ctx.t.actions[event.kind]||local(event.label,ctx.locale)||ctx.t.event;
    const recipientIds=ids(event.recipientIds),evidenceIds=ids(event.evidenceSourceIds);
    const fields=[
      [ctx.t.actionReason,event.reason],[ctx.t.instruction,event.instruction],
      [ctx.t.recipient,recipientIds.map(id=>recipientName(id,recipients,ctx)).join('; ')],
      [ctx.t.due,humanDate(event.dueDate,ctx.locale)],[ctx.t.expected,event.expectedResult],
    ].filter(([,value])=>typeof value==='string'&&value.trim());
    const unsuccessful=event.accepted===false;
    return '<li class="rxe-journal-entry'+(unsuccessful?' rxe-journal-returned':'')+'" data-control-event="'+esc(event.id)+'"><div class="rxe-journal-mark" aria-hidden="true">'+icon(event.kind)+'</div><article><div class="rxe-journal-meta"><span>'+esc(ctx.t.step)+' '+esc(Number.isFinite(Number(event.seq))?event.seq:'')+'</span>'+(event.issueId&&ctx.issues.length>1?'<span>'+esc(issueTitle(ctx.issues.find(issue=>issue.id===event.issueId),ctx))+'</span>':'')+'</div><h4>'+esc(action)+'</h4>'+paragraphs(local(event.message,ctx.locale))+(fields.length||evidenceIds.length?'<details class="rxe-action-record"><summary>'+esc(ctx.t.actionContent)+'</summary><dl class="rxe-record-fields">'+fields.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>'+(evidenceIds.length?'<div class="rxe-event-sources"><strong>'+esc(ctx.t.grounds)+'</strong>'+materialLinks(evidenceIds,ctx,{readOnly})+'</div>':'')+'</details>':'')+(ids(event.materialIds).length?'<div class="rxe-event-sources">'+materialLinks(event.materialIds,ctx,{readOnly})+'</div>':'')+'</article></li>';
  }).join('');
  return '<section class="rxe-journal"><div class="rxe-section-heading"><h3>'+esc(ctx.t.chronology)+'</h3>'+(!readOnly&&ctx.issues.length>1?button(ui.journalAll?ctx.t.issueEvents:ctx.t.allEvents,'toggle-journal',{quiet:true}):'')+'</div>'+(list?'<ol>'+list+'</ol>':'<p class="rxe-muted">'+esc(ctx.t.emptyJournal)+'</p>')+'</section>';
}
function actionEvidence(draft,ctx,disabled){
  return '<fieldset class="rxe-evidence"><legend>'+esc(ctx.t.evidence)+'</legend><p class="rxe-muted">'+esc(ctx.t.evidenceHint)+'</p>'+(ctx.materials.length?'<div class="rxe-evidence-list">'+ctx.materials.map(material=>'<div class="rxe-evidence-row"><label><input type="checkbox" data-control-field="evidenceSourceIds" data-source-id="'+esc(material.id)+'" data-focus="control-evidence-'+esc(material.id)+'"'+(draft.evidenceSourceIds.includes(material.id)?' checked':'')+(disabled?' disabled':'')+'><span>'+esc(materialTitle(material,ctx))+'</span></label>'+button(ctx.t.openMaterial,'open-material',{extra:'data-material-id="'+esc(material.id)+'"',quiet:true,glyph:'paper'})+'</div>').join('')+'</div>':'<p class="rxe-muted">'+esc(ctx.t.evidenceEmpty)+'</p>')+'</fieldset>';
}
function actionComposer(issue,draft,ctx,recipients,disabled){
  const available=(Array.isArray(issue.availableActions)?issue.availableActions:[]).filter(action=>ACTIONS.includes(action.kind));
  const otherDraft=draft.issueId&&draft.issueId!==issue.id&&hasActionWork(draft);
  const selected=available.find(action=>action.kind===draft.kind&&draft.issueId===issue.id);
  const choose=available.map(action=>'<button type="button" class="rxe-tool'+(selected?.kind===action.kind?' rxe-tool-selected':'')+'" data-control-action="select-kind" data-issue-id="'+esc(issue.id)+'" data-kind="'+esc(action.kind)+'" aria-pressed="'+(selected?.kind===action.kind)+'"'+(disabled||otherDraft?' disabled':'')+'>'+icon(action.kind)+'<span>'+esc(local(action.label,ctx.locale)||ctx.t.actions[action.kind])+'</span></button>').join('');
  const notice=otherDraft?'<div class="rxe-draft-notice"><p>'+esc(ctx.t.draftOther)+'</p><div>'+button(ctx.t.continueDraft,'select-issue',{extra:'data-issue-id="'+esc(draft.issueId)+'"',quiet:true})+button(ctx.t.clearDraft,'clear-action',{extra:'data-issue-id="'+esc(issue.id)+'"',disabled,quiet:true})+'</div></div>':'';
  let compose='';
  if(selected){
    const off=disabled?' disabled':'';
    const instructionKey={request_evidence:'requestInstruction',verify:'verificationInstruction',notify:'notificationInstruction',close:'closureInstruction',keep_open:'continuationInstruction',refer:'referralInstruction',reopen:'reopeningInstruction'}[draft.kind];
    const needsRecipients=selected.requiresRecipients===true||['request_evidence','refer'].includes(draft.kind)||draft.recipientIds.length>0;
    const needsDate=selected.requiresDueDate===true||['request_evidence','keep_open','refer','reopen'].includes(draft.kind)||Boolean(draft.dueDate);
    const needsExpected=needsDate||draft.kind==='notify'||Boolean(draft.expectedResult);
    const recipientMarkup=needsRecipients?'<fieldset class="rxe-action-recipients"><legend>'+esc(ctx.t.recipient)+'</legend>'+(draft.recipientIds.length?'<div class="rxe-recipient-chips">'+draft.recipientIds.map(id=>'<span><span>'+esc(recipientName(id,recipients,ctx))+'</span>'+button(ctx.t.removeRecipient,'remove-recipient',{extra:'data-recipient-id="'+esc(id)+'"',disabled,quiet:true,glyph:'close_panel'})+'</span>').join('')+'</div>':'<p class="rxe-muted">'+esc(ctx.t.recipientEmpty)+'</p>')+button(ctx.t.chooseRecipient,'choose-recipient',{disabled,quiet:true})+'</fieldset>':'';
    compose='<section class="rxe-action-composer" data-control-composer><div class="rxe-composer-heading"><div><p class="rxe-eyebrow">'+esc(ctx.t.draft)+'</p><h4>'+esc(ctx.t.actions[draft.kind])+'</h4></div>'+button(ctx.t.clearDraft,'clear-action',{extra:'data-issue-id="'+esc(issue.id)+'"',disabled,quiet:true})+'</div><label class="rxe-field"><span>'+esc(ctx.t.reason)+'</span><textarea data-control-field="reason" data-focus="control-action-reason" maxlength="2000" rows="3"'+off+'>'+esc(draft.reason)+'</textarea><small>'+esc(ctx.t.reasonHint)+'</small></label><label class="rxe-field"><span>'+esc(ctx.t[instructionKey])+'</span><textarea data-control-field="instruction" data-focus="control-action-instruction" maxlength="2000" rows="4"'+off+'>'+esc(draft.instruction)+'</textarea><small>'+esc(ctx.t.instructionHint)+'</small></label>'+recipientMarkup+((needsDate||needsExpected)?'<div class="rxe-action-plan">'+(needsDate?'<label class="rxe-field"><span>'+esc(ctx.t.dueLabel)+'</span><input type="date" data-control-field="dueDate" data-focus="control-action-due" value="'+esc(draft.dueDate)+'"'+off+'><small>'+esc(ctx.t.dueHint)+'</small></label>':'')+(needsExpected?'<label class="rxe-field"><span>'+esc(ctx.t.expectedLabel)+'</span><textarea data-control-field="expectedResult" data-focus="control-action-expected" maxlength="1000" rows="3"'+off+'>'+esc(draft.expectedResult)+'</textarea><small>'+esc(ctx.t.expectedHint)+'</small></label>':'')+'</div>':'')+actionEvidence(draft,ctx,disabled)+'<footer class="rxe-action-footer"><p>'+esc(ctx.t.simulation)+'</p>'+button(ctx.t.execute,'execute',{disabled,primary:true,glyph:draft.kind})+'</footer></section>';
  }
  return '<section class="rxe-action-tools"><div class="rxe-section-heading"><h3>'+esc(ctx.t.tools)+'</h3></div><p class="rxe-muted">'+esc(ctx.t.toolsHint)+'</p>'+notice+(choose?'<div class="rxe-tools">'+choose+'</div>':'<p class="rxe-muted">'+esc(ctx.t.noActions)+'</p>')+compose+'</section>';
}
function finalEvidence(issueId,selected,ctx,disabled){
  if(!ctx.materials.length)return '<p class="rxe-muted">'+esc(ctx.t.evidenceEmpty)+'</p>';
  return '<div class="rxe-final-evidence">'+ctx.materials.map(material=>'<div class="rxe-evidence-row"><label><input type="checkbox" data-response-status-evidence="'+esc(material.id)+'" data-issue-id="'+esc(issueId)+'" data-focus="response-evidence-'+esc(issueId)+'-'+esc(material.id)+'"'+(selected.some(id=>id===material.id||id==='document:'+material.id)?' checked':'')+(disabled?' disabled':'')+'><span>'+esc(materialTitle(material,ctx))+'</span></label>'+button(ctx.t.openMaterial,'open-material',{extra:'data-material-id="'+esc(material.id)+'"',quiet:true,glyph:'paper'})+'</div>').join('')+'</div>';
}
function memorandumView(draft,ctx,disabled,{readOnly=false}={}){
  const value=restoreCorrespondenceControl(draft),off=disabled?' disabled':'';
  const rows=ctx.issues.map(issue=>{
    const row=value.statuses.find(status=>status.issueId===issue.id);
    const evidence=row?.evidenceSourceIds||[];
    const controls=readOnly?'<dl class="rxe-record-fields"><div><dt>'+esc(ctx.t.yourDisposition)+'</dt><dd>'+esc(ctx.t.final[row?.status]||ctx.t.notChosen)+'</dd></div><div><dt>'+esc(ctx.t.support)+'</dt><dd>'+((evidence.length&&materialLinks(evidence,ctx,{readOnly:true}))||esc(ctx.t.noEvidence))+'</dd></div></dl>':'<label class="rxe-field"><span>'+esc(ctx.t.yourDisposition)+'</span><select data-response-status-field="status" data-issue-id="'+esc(issue.id)+'" data-focus="response-status-'+esc(issue.id)+'"'+off+'><option value="">'+esc(ctx.t.chooseDisposition)+'</option>'+FINAL_STATUSES.map(status=>'<option value="'+status+'"'+(row?.status===status?' selected':'')+'>'+esc(ctx.t.final[status])+'</option>').join('')+'</select></label><details class="rxe-final-sources"'+(evidence.length?' open':'')+'><summary>'+esc(ctx.t.support)+' <span>'+evidence.length+'</span></summary>'+finalEvidence(issue.id,evidence,ctx,disabled)+'</details>';
    return '<article class="rxe-final-issue"><h4>'+esc(issueTitle(issue,ctx))+'</h4>'+(local(issue.scope,ctx.locale)?'<div class="rxe-scope"><strong>'+esc(ctx.t.scope)+'</strong>'+paragraphs(local(issue.scope,ctx.locale))+'</div>':'')+statusMarkup(issue,ctx)+controls+'</article>';
  }).join('');
  const prose=readOnly?'<div class="rxe-conclusion-text">'+(value.text.trim()?paragraphs(value.text):'<p class="rxe-muted">'+esc(ctx.t.noConclusion)+'</p>')+'</div>':'<label class="rxe-field rxe-memorandum-text"><span>'+esc(ctx.t.memoText)+'</span><textarea data-response-control-field="text" data-focus="response-control-text" maxlength="6000" rows="8"'+off+'>'+esc(value.text)+'</textarea><small>'+esc(ctx.t.memoHint)+'</small></label>';
  return '<section class="rxe-memorandum" data-control-memorandum tabindex="-1"><div class="rxe-section-heading"><div><p class="rxe-eyebrow">'+esc(readOnly?ctx.t.saved:ctx.t.memorandum)+'</p><h3>'+esc(ctx.t.memoText)+'</h3></div>'+(!readOnly?button(ctx.t.back,'back-to-work',{quiet:true,glyph:'arrow'}):'')+'</div>'+(!readOnly?'<p class="rxe-muted">'+esc(ctx.t.memoIntro)+'</p>':'')+'<div class="rxe-final-issues">'+rows+'</div>'+prose+(!readOnly?'<div class="rxe-memorandum-footer"><button type="submit" class="rxa-btn primary rxe-button" data-control-submit'+off+'>'+icon('close')+'<span>'+esc(ctx.t.submit)+'</span></button></div>':'')+'</section>';
}

export function controlWorkspaceView({workflow,draft,actionDraft,ui,caseInfo={},sources=[],recipients=[],locale='ru',disabled=false}={}){
  const ctx=publicView(workflow,locale),view=restoreControlWorkspaceUI(ui),action=restoreControlActionDraft(actionDraft);
  const issue=ctx.issues.find(row=>row.id===view.issueId)||ctx.issues[0];
  const material=ctx.materials.find(row=>row.id===view.materialId);
  if(!issue)return '<section class="rxe-workspace" data-control-workspace><p class="rxe-muted">'+esc(ctx.t.noIssues)+'</p></section>';
  const selectedMaterials=ctx.materials.filter(row=>ids(row.issueIds).includes(issue.id)||ids(issue.materialIds,200).includes(row.id));
  const issueCards=ctx.issues.map(row=>'<button type="button" class="rxe-issue'+(row.id===issue.id?' rxe-issue-current':'')+'" data-control-action="select-issue" data-issue-id="'+esc(row.id)+'" aria-current="'+(row.id===issue.id?'true':'false')+'"><strong>'+esc(issueTitle(row,ctx))+'</strong><span>'+esc(ctx.t.stage[row.status]||ctx.t.stage.open)+'</span></button>').join('');
  const work='<div class="rxe-work-grid"><aside class="rxe-issues"><h3>'+esc(ctx.t.matters)+'</h3><nav aria-label="'+esc(ctx.t.matters)+'">'+issueCards+'</nav>'+button(ctx.t.prepare,'prepare-memorandum',{quiet:true,glyph:'paper'})+'</aside><div class="rxe-work-main"><section class="rxe-current-issue"><p class="rxe-eyebrow">'+esc(ctx.t.current)+'</p><h3>'+esc(issueTitle(issue,ctx))+'</h3>'+(local(issue.scope,ctx.locale)?'<div class="rxe-scope"><strong>'+esc(ctx.t.scope)+'</strong>'+paragraphs(local(issue.scope,ctx.locale))+'</div>':'')+statusMarkup(issue,ctx)+'</section>'+plannedView(ctx,recipients,issue.id)+'<section class="rxe-materials"><div class="rxe-section-heading"><h3>'+esc(ctx.t.materials)+'</h3><span class="rxe-count">'+selectedMaterials.length+'</span></div>'+(selectedMaterials.length?'<div class="rxe-material-list">'+selectedMaterials.map(item=>button(materialTitle(item,ctx),'open-material',{extra:'data-material-id="'+esc(item.id)+'"',quiet:true,glyph:'paper'})).join('')+'</div>':'<p class="rxe-muted">'+esc(ctx.t.noMaterials)+'</p>')+'</section>'+journalView(ctx,issue.id,view,recipients)+actionComposer(issue,action,ctx,recipients,disabled)+'<section class="rxe-prepare"><div><h3>'+esc(ctx.t.memorandum)+'</h3><p>'+esc(ctx.t.prepareHint)+'</p></div>'+button(ctx.t.prepare,'prepare-memorandum',{primary:true,glyph:'paper'})+'</section></div></div>';
  return '<div class="rxe-workspace" data-control-workspace data-control-revision="'+esc(Number.isInteger(workflow?.revision)?workflow.revision:0)+'"><p class="rxe-workspace-intro">'+esc(ctx.t.intro)+'</p>'+(material?materialView(material,ctx):'')+(view.pane==='memorandum'?memorandumView(draft,ctx,disabled):work)+'</div>';
}

export function controlRecordView({workflow,control,caseInfo={},sources=[],recipients=[],locale='ru'}={}){
  const ctx=publicView(workflow,locale);
  return '<section class="rxe-workspace rxe-record" data-control-record><div class="rxe-section-heading"><h3>'+esc(ctx.t.record)+'</h3></div><p class="rxe-muted">'+esc(ctx.t.recordHint)+'</p>'+memorandumView(control,ctx,true,{readOnly:true})+plannedView(ctx,recipients,null,{readOnly:true})+journalView(ctx,null,{journalAll:true},recipients,{readOnly:true})+(ctx.materials.length?'<details class="rxe-record-materials"><summary>'+esc(ctx.t.materials)+' <span>'+ctx.materials.length+'</span></summary>'+ctx.materials.map(material=>materialView(material,ctx,{readOnly:true})).join('')+'</details>':'')+'</section>';
}
