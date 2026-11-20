import {readFileSync} from 'node:fs';
import {copy, fail, localized} from './schema.mjs';
import {evaluateWorkbook, WORKBOOK_VERSION} from './workbook.mjs';
import {evaluateRoutingWorkflow,isInternalRoutingPath} from './routing-workflow.mjs';
import {mfcRoutingAlternatives,publicMfcRouting} from './mfc-routing.mjs';
import {MFC_SEMINAR_VERSION,mfcAuthorityName,mfcRole,mfcUsesSharedReply,mfcLegacyDispatchActions,mfcSharedReplyInstruction,mfcSharedMerits} from './mfc-seminar.mjs';
import {CORRESPONDENCE_WEIGHTS} from './correspondence.mjs';
import {applyControlAction, validateControlSubmission} from './control-workflow.mjs';
import {acceptableLegalProvisions, applicableLegalUnits, requiredSeminarExamples} from './normative-acts.mjs';

export const JOURNEY_STAGES = Object.freeze(['example', 'mentor', 'independent']);
export const SEMINAR_EXAMPLE = Object.freeze({caseId:'complaint-routing', datePackId:'a'});
export const SEMINAR_GRADING_VERSION = 'seminar-thresholds-v1';
export const isTutorial = session => ['example', 'mentor'].includes(session?.journeyStage);

export function seminarPointsAt(score) {
  if (score >= 90) return 5;
  if (score >= 80) return 4;
  if (score >= 70) return 3;
  return 0;
}

export function exactCaseScore(feedback) {
  const unrounded = part => Math.min(part.cap ?? 100, part.rawScore ?? part.score);
  const review = feedback.correspondence;
  if (review?.phase === 'complete') return (4 * unrounded(review.initial) + unrounded(review.control)) / 5;
  if (review?.phase === 'initial') return unrounded(review);
  return feedback.score;
}

export function seminarExample(available) {
  const c = available.find(item => item.id === SEMINAR_EXAMPLE.caseId);
  const snapshot = c && [c, ...(c.dateVariants || [])].find(item => item.datePackId === SEMINAR_EXAMPLE.datePackId);
  if (!snapshot) fail('journey_example_unavailable', 503);
  const out = copy(snapshot);
  delete out.dateVariants;
  return out;
}

export function tutorialOperational(c, decision,coreStepsVersion) {
  const base = {score:0, criteria:[
    {id:'route', earned:0, max:CORRESPONDENCE_WEIGHTS.initial.route},
    {id:'calendar', earned:0, max:CORRESPONDENCE_WEIGHTS.initial.calendar}
  ], cap:null, explanation:''};
  return evaluateWorkbook(c, decision, base, WORKBOOK_VERSION, {gameplay:true,coreStepsVersion});
}

const T = (ru, en, zh) => ({ru,en,zh});
const jointControl=T('Сопоставьте новое сообщение с материалами дела. Зафиксируйте в одном итоговом заключении, какие результаты подтверждены и какие вопросы остаются открытыми.',
  'Compare the new information with the case records. Record which outcomes are confirmed and which questions remain open in one final memorandum.',
  '将新消息与案件材料核对，在一份结论中记录已确认的结果及仍待处理的问题。');
const copyText = {
  reception:T('Приёмная','Reception','受理'),
  receptionPrompt:T('С чего начать работу в приёмной?','Where do you start at reception?','在受理页面应先做什么？'),
  verifyRole:T('Установить предмет обращения и свои полномочия','Identify the matter and your authority','确认来信事项及自身职权'),
  immediateReply:T('Ответить по одному заголовку обращения','Reply based on the case title','只根据来信标题作答'),
  chat:T('Разговор','Conversation','交谈'),
  chatPrompt:T('Как использовать разговор с заявителем?','How should you use the conversation?','如何利用与来访人的交谈？'),
  clarify:T('Уточнить существенные обстоятельства и источник сведений','Clarify the material circumstances and where the information came from','核实关键情况和信息来源'),
  assume:T('Считать любое предположение установленным фактом','Treat any assumption as an established fact','把所有推测视为已证实事实'),
  documents:T('Документы и источники','Documents and sources','文件和依据'),
  documentsPrompt:T('На что сослаться в ответе?','What should the draft cite?','草稿应引用什么？'),
  primarySources:T('Открыть материалы дела и применить конкретную правовую норму','Open the case records and apply the relevant legal provision','查阅案件材料并适用具体法律条款'),
  titlesOnly:T('Указать только заголовки документов','List only the titles of the documents','只列出文件标题'),
  calendar:T('Сроки','Deadlines','期限'),
  calendarPrompt:T('Какой набор дат соответствует расчёту по условию?','Which dates match the calculation for this case?','哪组日期符合本案的计算规则？'),
  draft:T('Проект ответа','Draft response','答复草稿'),
  draftPrompt:T('Какой маршрут положить в основу проекта?','Which route should the draft follow?','草稿应采用哪种办理路径？'),
  useWorkbook:T('Выбрать компетентного адресата по материалам дела','Choose the competent recipient from the case records','根据案件材料选择主管接收方'),
  guessRecipient:T('Передать дело любому знакомому органу','Send the case to a familiar authority','把事项转给任意熟悉的机关'),
  control:T('Исполнение','Follow-through','办理监督'),
  controlPrompt:T('Как поступить после нового сообщения?','What should you do after the new information arrives?','收到新的事项信息后应如何处理？'),
  keepChecking:T('Сверить результат с материалами по каждому вопросу','Check the evidence for the outcome of each issue','逐项核实处理结果及证据'),
  closeEverything:T('Закрыть всё дело по факту получения сообщения','Close the entire case as soon as a message arrives','收到消息后立即结案'),
  review:T('Итог','Review','回顾'),
  reviewPrompt:T('Что проверить перед завершением смены?','What do you check before finishing the shift?','结束本轮练习前应核查什么？'),
  reviewResult:T('Связь выводов с материалами и открытые вопросы','Check evidence for each finding and identify what remains open','检查各结论的证据并确认待办事项'),
  justDraft:T('Достаточно убедиться, что проект заполнен','Check only that the draft has been filled in','只确认草稿已经填写'),
  reviewExplanation:T('Сопоставьте итог с задачами приёмной: в проекте должны быть обоснование, адресат и сроки, а в исполнении — подтверждённый статус по каждому вопросу.','Check that the draft explains the decision, recipient and deadlines, and the follow-through records the supported status of each issue.','核查草稿是否说明决定、接收方和期限，并逐项记录有证据支持的办理状态。')
};

const mentorFindings = {
  emptyDraft:T('Заполните тему и четыре раздела проекта либо явно примените образец наставника.','Fill in the subject and four sections, or explicitly apply the mentor’s sample.','填写主题和四个章节，或明确采用导师示例。'),
  kind:T('Выберите вид документа, соответствующий вашей роли и предмету обращения.','Choose the document type that fits your role and the matter at hand.','选择与岗位和来信事项相符的文书类型。'),
  invalidDraft:T('Проверьте формат проекта и цитаты. Цитата должна точно совпадать с открытым источником.','Check the draft format and citations. A quotation must match a source you opened.','检查文书格式和引文。引文必须与已打开的来源一致。'),
  evidence:T('Привяжите хотя бы один установленный факт к точной цитате из материалов дела или разговора.','Link at least one established fact to an exact quotation from the records or conversation.','至少将一个已查明事实与案件材料或交谈中的准确引文关联。'),
  legal:T('Привяжите правовое основание к применимому положению из правового источника.','Cite an applicable provision from the legal reader in the legal grounds section.','在法律依据章节引用法规阅读器中的适用条款。'),
  route:T('Сверьте компетенцию выбранного адресата с материалами дела. Исправьте направление в проекте.','Check the selected recipient’s competence against the case records and correct the route in the draft.','根据案件材料核对所选接收方的职权，并更正文书中的办理路径。'),
  calendar:T('Сверьте даты и отметку о своевременности регистрации с вкладкой сроков.','Check the dates and registration timeliness against the calendar tab.','在期限页面核对日期及登记是否及时。'),
  request:T('Зарегистрируйте запрос по каждому вопросу, для которого ещё требуется подтверждение.','Register a request for each issue that still needs evidence.','为仍需证明的每个事项登记请求。'),
  verify:T('Проверьте относимое подтверждение по каждому вопросу, где оно уже поступило.','Verify the relevant evidence for each issue that has received it.','逐项核实已收到的相关证明。'),
  status:T('Зафиксируйте итог по каждому вопросу. Завершите подтверждённое с нужным уведомлением, остальные оставьте в работе.','Record a disposition for each issue. Close the verified issues with any required notice and keep the rest open.','逐项记录处理状态。需要时通知后关闭已核实事项，其余继续办理。'),
  emptyControl:T('Напишите заключение по полученным материалам либо явно примените образец наставника.','Write your follow-through record using the materials, or explicitly apply the mentor’s sample.','根据收到的材料撰写监督结论，或明确采用导师示例。'),
  invalidControl:T('Проверьте статус и приложите полученное подтверждение отдельно по каждому вопросу.','Check the status and attach the supporting record for each issue separately.','逐项核对状态并附上收到的证明材料。')
};
export const mentorFinding = (code, language) => localized(mentorFindings[code],language);

function choose(ids, correct, text) {
  return ids.map((id, index) => ({id, label:text[index], correct:id===correct}));
}

let legalProvisions;
function preparedLegalCitation(c) {
  legalProvisions ||= JSON.parse(readFileSync(new URL('./normative-provisions.json',import.meta.url),'utf8'));
  for(const [sourceId,articles] of Object.entries(acceptableLegalProvisions(c))){
    const relevant=applicableLegalUnits(c,sourceId);
    if(!relevant)continue;
    const unit=articles.flatMap(article=>legalProvisions[sourceId]?.[article]||[]).find(([id])=>relevant.includes(id));
    if(unit)return {id:'basis-provision',section:'legalBasis',kind:'legal',sourceId,unitIds:[unit[0]],quote:unit[1].slice(0,4000)};
  }
  return null;
}

function walkthroughReply(c, deadline, language, compact) {
  const name=localized(c.public.citizen.name,language);
  const date=new Intl.DateTimeFormat({ru:'ru-RU',en:'en-GB',zh:'zh-CN'}[language],{
    day:'numeric',month:'long',year:'numeric',timeZone:'UTC'
  }).format(new Date(deadline+'T00:00:00Z'));
  const subject=T('О рассмотрении жалобы на действия начальника отдела',
    'Review of your complaint about the division head','关于审查您对处长的投诉');
  const sections={
    facts:T(
      `Уважаемый ${name}!\n\nМы приняли к рассмотрению вашу жалобу. Вы сообщаете, что начальник отдела оставил без рассмотрения доводы вашего предыдущего обращения. Вы также просите разъяснить, кто проверит эти действия, если жалобу передадут тому же начальнику отдела.`,
      `Dear ${name},\n\nWe have accepted your complaint for review. You report that the division head did not address the points you raised in your earlier appeal. You also ask who would review the matter if your complaint were assigned to that same official.`,
      `尊敬的${name}：\n\n我们已受理您的投诉。您反映，处长在处理您此前的来信时没有审查您提出的理由。您也想知道，如果投诉交给同一位处长，将由谁核查他的处理情况。`),
    legalBasis:T(
      'Часть 6 статьи 8 Федерального закона № 59-ФЗ запрещает поручать рассмотрение жалобы должностному лицу, чьё действие или бездействие обжалуется. Руководитель департамента рассмотрит вашу жалобу самостоятельно. Статья 10 этого закона позволяет запросить материалы для объективной проверки.',
      'Part 6 of Article 8 of Federal Law No. 59-FZ prohibits assigning a complaint to the official whose conduct or inaction is being challenged. The department director will review your complaint independently. Article 10 allows the director to request records for an impartial review.',
      '第59-FZ号联邦法律第8条第6款禁止将投诉交由被投诉行为或不作为的人员处理。部门负责人将独立审查您的投诉。该法第10条允许为客观审查调取相关材料。'),
    resolution:T(
      'Руководитель департамента запросит у отдела ваше прежнее обращение, ответ начальника отдела и регистрационную карточку. Эти документы вместе с объяснением начальника помогут установить, какие ваши доводы были рассмотрены и что отражено в ответе. Пока проверка продолжается, вывод о бездействии начальника отдела не сделан.',
      'The director will ask the division for your earlier appeal, the division head’s reply and the registration record. The director will compare those records with the division head’s explanation to establish which points you raised were considered and what the reply addressed. The review is ongoing, and a finding on the alleged inaction has yet to be made.',
      '部门负责人将向处室调取您此前的来信、处长的答复及登记记录，并与处长的说明相核对，以查明您提出的哪些理由得到了审查、答复涉及哪些问题。审查仍在进行，处长是否存在不作为尚无结论。'),
    nextSteps:T(
      `Не позднее ${date} вам направят письменный ответ по адресу для переписки, указанному в обращении. В ответе сообщат, какие обстоятельства подтвердились и какое решение принято по каждому доводу жалобы.`,
      `We will send you a written reply by ${date} at the correspondence address you provided. It will explain what the review established and the decision on each point in your complaint.`,
      `我们将在${date}前（含当日）按您在来信中提供的通信地址寄送书面答复，说明核实的事实以及对各项投诉理由作出的决定。`)
  };
  const concise={
    facts:T(
      'Вы сообщаете, что начальник отдела оставил без рассмотрения доводы вашего обращения.',
      'You report that the division head did not address the points raised in your appeal.',
      '您反映处长没有审查您来信中的理由。'),
    legalBasis:T(
      'По ч. 6 ст. 8 № 59-ФЗ жалобу рассматривает руководитель департамента. Для проверки он запрашивает документы по ст. 10 того же закона.',
      'Under Article 8(6) of Federal Law No. 59-FZ, the department director will review the complaint. Article 10 authorises the director to obtain the records needed for review.',
      '根据第59-FZ号联邦法律第8条第6款，由部门负责人审查投诉，并根据该法第10条调取材料。'),
    resolution:T(
      'Руководитель сопоставит прежнее обращение, ответ и регистрационную карточку с объяснением начальника отдела.',
      'The director will compare the earlier appeal, reply and registration record with the division head’s explanation.',
      '部门负责人将比对原来信、答复、登记记录及处长说明。'),
    nextSteps:T(
      `Направим мотивированный ответ по каждому доводу до ${date}.`,
      `We will send a written response addressing each point by ${date}.`,
      `我们将在${date}前发出书面答复，逐项说明理由。`)
  };
  return {kind:'reply',subject:localized(subject,language),sections:localized(compact?concise:sections,language)};
}

function presentation(c, profile, language, core,coreStepsVersion) {
  const mfc=coreStepsVersion===MFC_SEMINAR_VERSION;
  const local = value => localized(value, language) || '';
  const refs = (c.rubric.evidenceGroups || []).flat();
  const docs = [...new Set(refs)].map(id => c.documents.find(doc => doc.id === id)).filter(Boolean);
  if (!docs.length && c.documents.length) docs.push(c.documents[0]);
  const legal = profile.criteria?.legalBasis;
  const ruling = local(c.rubric.explanation) || local(profile.primaryFinding);
  const mfcRouting=mfc?publicMfcRouting(c.id):null;
  const sharedReply=mfcUsesSharedReply(coreStepsVersion,mfcRouting);
  const legacyDispatch=sharedReply?mfcLegacyDispatchActions(c.id):new Set();
  const facts = c.facts.filter(fact => c.rubric.requiredFactIds.includes(fact.id)&&
    !(sharedReply&&c.id==='several-minimum-attachments'&&fact.id==='q1')).map(fact => local(fact.text));
  const plan=mfc?profile.acceptablePlans?.[0]:null;
  const actionText=action=>mfc?(local(c.public.actions.find(row=>row.id===action?.id)?.label)||local(action?.text)):local(action?.text);
  const actions = (profile.expectedActions || []).filter(action=>(!plan||plan.requiredActionIds.includes(action.id))&&!legacyDispatch.has(action.id))
    .map(actionText).filter(Boolean);
  const recipients = mfc?mfcRoutingAlternatives(c.id)?.[0]:evaluateRoutingWorkflow(c.id,{recipientIds:[]}).expectedRecipients;
  if(!recipients?.length)fail('invalid_case',503);
  const recipientIds = recipients.map(recipient => recipient.id);
  const recipientNames=recipients.map(recipient=>mfc?mfcAuthorityName(recipient,language):local(recipient.name));
  const recipientText = !mfc&&c.id===SEMINAR_EXAMPLE.caseId
    ? local(T('Руководитель или независимое уполномоченное подразделение','Director or independent authorised unit','负责人或独立授权部门'))
    : mfc?new Intl.ListFormat(language,{type:'conjunction'}).format(recipientNames):recipientNames.join(' / ');
  const workbook = {referralDeadline:'', registrationTimely:false, routing:{recipientIds,...(mfc?{disposition:'forward'}:{})}};
  const calculation=tutorialOperational(c,{deadline:'',workbook},coreStepsVersion).workbook.calendar;
  const {expected}=calculation;
  workbook.referralDeadline = expected.referral || '';
  workbook.registrationTimely = expected.registrationTimely ?? false;
  const calendarExplanation = local(calculation.instructions);
  const deadlineText = mfc?`${local(calculation.targets.find(target=>target.id==='deadline').label)} — ${expected.deadline}.`
    :T(`Крайний срок ответа — ${expected.deadline}.`,`Response deadline: ${expected.deadline}.`,`答复截止日期为 ${expected.deadline}。`);
  const referralText = expected.referral ? T(`Крайний срок передачи — ${expected.referral}.`,`Referral deadline: ${expected.referral}.`,`转送截止日期为 ${expected.referral}。`) : '';
  const registrationText = Object.hasOwn(expected,'registrationTimely') ? local(expected.registrationTimely
    ? T('Регистрация своевременна.','Registration was timely.','登记及时。')
    : T('Срок регистрации нарушен.','Registration was late.','登记超期。')) : '';
  const timetable = [local(referralText),local(deadlineText),registrationText].filter(Boolean).join(' ');
  const authored=c.rubric.authored;
  const knowledge=c.public.assessment?.knowledge?.options.find(row=>row.id===authored?.knowledge?.correct);
  const jointConclusion=sharedReply?local(mfcSharedMerits[c.id]):'';
  const legalExplanation = jointConclusion||(mfc&&local(knowledge?.label))||[local(legal?.explanation),local(legal?.expectedApplication)].filter(Boolean).join(' ') || ruling;
  const findings=mfc?(c.public.assessment?.fact?.options||[]).filter(row=>authored?.factIds?.includes(row.id)).map(row=>local(row.label)) : [];
  const routingPolicy=mfcRouting?.routingPolicy;
  const boundary=local(routingPolicy?.boundary),routingContext=local(routingPolicy?.context);
  const transfer=mfc?local(recipientIds.length>1?
    T(`Адресаты одного обращения — ${recipientText}.`,`Recipients of this appeal: ${recipientText}.`,`此件来信的接收方：${recipientText}。`):
    T(`Адресат передачи из МФЦ — ${recipientText}.`,`MFC referral recipient: ${recipientText}.`,`MFC 转交的接收方：${recipientText}。`)):'';
  const sections = {
    facts:(mfc?[...facts,routingContext]:core&&facts.length?facts:[...facts,ruling]).filter(Boolean).join('\n\n'),
    legalBasis:legalExplanation,
    resolution:(mfc?[...(jointConclusion?[jointConclusion]:findings),...actions]:
      [recipientText,...(core?actions.slice(0,2):actions)]).filter(Boolean).join('\n'),
    nextSteps:[transfer,boundary,timetable,sharedReply?local(mfcSharedReplyInstruction):'',
      ...[profile.criteria?.nextSteps?.rightsAction,...(profile.criteria?.nextSteps?.monitoringActions||[])]
        .filter(action=>!legacyDispatch.has(action?.id)).map(actionText)].filter(Boolean).join('\n')
  };
  const citations = docs.slice(0,8).map((doc,index) => ({id:`evidence-${index+1}`,section:'facts',kind:'document',sourceId:doc.id,
    quote:local(doc.text).trim().slice(0,4000)})).filter(citation=>citation.quote);
  if(core)citations.push(...requiredSeminarExamples(c));
  else{
    const law=preparedLegalCitation(c);
    if(law)citations.push(law);
  }
  const orders=c.id===SEMINAR_EXAMPLE.caseId?[{
    id:'independent-review',issue:profile.issues[0].id,kind:'review',recipientIds,dueDate:expected.deadline,
    instruction:local(T('Самостоятельно рассмотреть доводы жалобы. Запросить у отдела прежнее обращение, ответ и регистрационную карточку, сопоставить их с объяснением начальника.','Independently review the allegations. Request the prior appeal, reply and registration record, then compare them with the department head’s explanation.','独立审查投诉理由。调取此前来信、答复及登记记录，并与部门主管的说明进行核对。')),
    expectedResult:local(T('Мотивированное решение руководителя по каждому доводу и подтверждение отправки ответа заявителю.','A reasoned decision by the director on each point and proof that a reply was sent to the applicant.','由负责人就各项理由作出有根据的决定，并保留给申请人发送答复的凭证。')),
    citationIds:citations.map(citation=>citation.id)
  }]:[];
  const reply=c.id===SEMINAR_EXAMPLE.caseId ? walkthroughReply(c,expected.deadline,language,core&&!mfc) : {
    kind:profile.acceptedKinds?.[0]||'reply',subject:local(c.public.title).slice(0,240),sections
  };
  if(mfc&&c.id===SEMINAR_EXAMPLE.caseId){
    reply.sections.facts=local(T(
      'В МФЦ поступили материалы жалобы. Заявитель сообщает, что начальник отдела оставил его прежние доводы без рассмотрения. Он просит проверить действия начальника и разъяснить, кто рассмотрит жалобу.',
      'The MFC has received the complaint file. The applicant reports that the division head overlooked the points in an earlier appeal. The applicant asks for a review of the division head’s conduct and an explanation of who will handle the complaint.',
      'MFC 已收到投诉材料。申请人称处长未审查其此前来信中的理由，请求核查处长的处理情况并说明由谁处理投诉。'));
    reply.sections.resolution+=' '+local(T(
      'Если нерассмотренные доводы подтвердятся, руководитель обеспечит их рассмотрение и даст мотивированный ответ по каждому из них. Если материалы подтвердят, что доводы уже рассмотрены, руководитель приведёт конкретные основания этого вывода.',
      'If the record shows that any point was overlooked, the director will ensure that it is considered and give a reasoned reply on each point. If the record shows that the points were addressed, the director will cite the evidence for that finding.',
      '如材料证实存在遗漏，负责人将确保审查遗漏的理由并逐项作出有理由的答复。如材料证实此前已审查相关理由，负责人将说明该结论的具体依据。'));
    reply.sections.nextSteps=[transfer,boundary,timetable,local(T(
      'МФЦ сообщает заявителю, куда переданы материалы. Руководитель департамента готовит письменный ответ с выводом по каждому доводу и направляет его по адресу для переписки.',
      'The MFC informs the applicant where the file was referred. The department director prepares a written reply with a finding on each point and sends it to the correspondence address.',
      'MFC 告知申请人材料的转交去向。部门负责人逐项作出结论，并按通信地址寄送书面答复。'))].filter(Boolean).join('\n');
  }
  const decision = {deadline:expected.deadline,workbook,correspondence:{version:1,...reply,citations,orders}};
  return {decision,docs,facts,timetable,calendarExplanation,legalExplanation:reply.sections.legalBasis,recipientText,boundary,routingContext,sharedReply};
}

export function walkthroughControlProfile(c, profile) {
  if(c.id!==SEMINAR_EXAMPLE.caseId)return profile;
  const prepared=copy(profile), workflow=prepared.control.workflow;
  const scope=T('Независимая оценка материалов руководителем','Independent review by the director','由部门负责人独立审查材料');
  const issue=workflow.issues.find(row=>row.id==='main');
  issue.title=c.public.title;
  issue.scope=scope;
  issue.resultType=T('Рассмотрение жалобы','Complaint review','投诉审查');
  const record=workflow.materials.find(row=>row.id===issue.responseMaterialId);
  record.title=scope;
  record.text=T(record.text.ru,
    'The director considered the issues independently, using the documents and the division head’s explanation. The decision remains with the director. The division head’s explanation was collected as evidence for the review.',
    '部门负责人根据文件和处长的说明独立审查了各项理由。最终决定由部门负责人作出。处长的说明作为审查材料收集。');
  return prepared;
}

export function tutorialGuide(c, profile, language, {execution=false,core=false,coreStepsVersion}={}) {
  const text = key => localized(copyText[key],language);
  const local = value => localized(value,language) || '';
  const mfc=coreStepsVersion===MFC_SEMINAR_VERSION;
  const {decision,docs,facts,timetable,calendarExplanation,legalExplanation,recipientText,boundary,routingContext,sharedReply} = presentation(c,profile,language,core,coreStepsVersion);
  const role=mfc?mfcRole(c.public.role,language,sharedReply):null;
  const roleExplanation=mfc?role.text:c.id===SEMINAR_EXAMPLE.caseId
    ? local(T('Вы готовите материалы для руководителя департамента. Жалоба касается начальника отдела. В карточке выделите предмет жалобы и проверьте, кто вправе её рассматривать. Затем решите, кому направить материалы.',
      'You prepare the file for the department director. The complaint concerns the division head. Identify the subject of the complaint and check who has authority to review it. Then decide who should receive the records.',
      '你负责为部门负责人准备材料。投诉涉及处长。先在事项卡片中确定投诉对象和内容，核对谁有权审查，再决定将材料交给谁。'))
    : [local(c.public.role.title),local(T('В карточке прочитайте обращение и проверьте свои полномочия. Определите, что нужно выяснить до выбора дальнейших действий.',
      'Read the appeal and check your authority in the case card. Identify what you need to find out before you choose how to proceed.',
      '在事项卡片中阅读来信并核对自身职权。先确定还需查明哪些情况，再选择下一步。'))].join('. ');
  const routeOptions = c.public.routes;
  const initialControl = sharedReply?local(jointControl):c.followup ? local(c.followup.explanation) : text('reviewExplanation');
  const steps = [
    {id:'reception',panel:'reception',action:'read',title:text('reception'),prompt:text('receptionPrompt'),
      explanation:roleExplanation,choices:choose(['assume','role'],'role',[text('immediateReply'),text('verifyRole')])},
    {id:'conversation',panel:'chat',action:'read',title:text('chat'),prompt:text('chatPrompt'),
      explanation:facts.join(' '),choices:choose(['clarify','assume'],'clarify',[text('clarify'),text('assume')])},
    {id:'materials',panel:'documents',action:'document',title:text('documents'),prompt:text('documentsPrompt'),
      explanation:legalExplanation,documentIds:docs.map(doc=>doc.id),
      choices:choose(['titles','sources'],'sources',[text('titlesOnly'),text('primarySources')])},
    {id:'calendar',panel:'calendar',action:'calendar',title:text('calendar'),prompt:text('calendarPrompt'),
      explanation:calendarExplanation+' '+timetable,choices:choose(['start-date','deadline'],'deadline',
        [decision.workbook.referralDeadline||c.public.assessment.calendar.events[0].date,timetable])},
    {id:'draft',panel:'decision',action:'draft',title:text('draft'),prompt:text('draftPrompt'),
      explanation:[recipientText,decision.correspondence.sections.resolution].filter(Boolean).join('\n'),
      choices:routeOptions.length > 1 ? routeOptions.map(option=>({id:option.id,label:local(option.label),correct:c.rubric.routeIds.includes(option.id)}))
        : choose(['route','guess'],'route',[text('useWorkbook'),text('guessRecipient')])},
    ...(c.followup ? [{id:'control',panel:'decision',action:execution?'read':'control',title:text('control'),prompt:text('controlPrompt'),
      explanation:initialControl,choices:c.followup.options.map(option=>({id:option.id,
        label:sharedReply&&option.id===c.followup.correct?local(jointControl):local(option.label),correct:option.id===c.followup.correct}))}] : []),
    ...(c.followup && execution ? executionSteps(language,sharedReply) : []),
    {id:'review',panel:'decision',action:'review',title:text('review'),prompt:text('reviewPrompt'),
      explanation:text('reviewExplanation'),choices:choose(['draft-only','verified'],'verified',[text('justDraft'),text('reviewResult')])}
  ];
  if(core){
    const reception=steps[0];
    reception.prompt=local(T('Прочитайте обращение и свои полномочия.','Read the appeal and check your authority.','阅读来信并核对自身职权。'));
    reception.choices=reception.choices.filter(choice=>choice.id==='role');
    steps.splice(1,1);
    const materials=steps.find(step=>step.id==='materials');
    materials.action='legal';
    materials.prompt=local(T('Откройте правовой источник и выделите фрагмент статьи или пункта.','Open the legal source and select a passage from an article or clause.','打开法规来源并选中具体条款。'));
    materials.choices=[];
    const calendar=steps.find(step=>step.id==='calendar');
    calendar.prompt=local(mfc?T('Укажите две даты: срок передачи из МФЦ и срок рассмотрения у адресата.','Enter the MFC referral deadline and the recipient’s review deadline.','填写 MFC 转交截止日与主管接收方审查截止日。'):
      T('Выберите рассчитанные даты в календаре.','Select the calculated dates in the calendar.','在日历中选择计算出的日期。'));
    calendar.choices=[];
    const routing=decision.workbook.routing;
    if(!mfc)decision.workbook.routing=routing.recipientIds.every(id=>isInternalRoutingPath(c.id,id))
      ? {recipientIds:[],disposition:'internal'} : {...routing,disposition:'forward'};
    const draft=steps.find(step=>step.id==='draft');
    draft.prompt=local(mfc?T('Изложите факты и правовое основание. Сформулируйте решение, которое может принять адресат, и укажите, как МФЦ сообщит о передаче.','Set out the facts and legal grounds. Draft the recipient’s substantive decision and explain how the MFC will communicate the referral.','陈述事实与法律依据，拟写主管接收方可作出的实质处理决定，并说明 MFC 如何告知转交情况。'):
      T('Кратко изложите факты, правовое основание, решение и следующий шаг.','Briefly state the facts, legal grounds, decision and next step.','简述事实、法律依据、处理决定和下一步。'));
    if(sharedReply)draft.prompt=local(mfcSharedReplyInstruction);
    draft.choices=[];
    steps.splice(steps.indexOf(draft),0,{id:'route',panel:'route',action:'route',
      title:local(T('Маршрут','Route','办理路径')),
      prompt:local(sharedReply?T('Отметьте всех адресатов одного обращения.','Select all recipients of this single appeal.','选择此一件来信的全部接收方。'):mfc?T('Укажите, кому МФЦ должен передать материалы.','Select the recipient for the MFC referral.','选择 MFC 转交材料的接收方。'):
        T('Выберите рассмотрение внутри органа или укажите адресата пересылки.','Choose internal review or select the referral recipient.','选择内部审查或确定转送对象。')),
      explanation:[recipientText,routingContext,boundary].filter(Boolean).join('\n'),choices:[]});
  }
  const statuses = profile.control?.expectedStatuses || [];
  const control = {text:initialControl,
    statuses:statuses.map(row=>({issueId:row.issueId,status:row.allowedStatuses[0],evidenceSourceIds:['followup']}))};
  return {caseTitle:local(c.public.title),role:role?.text||local(c.public.role.text),steps,decision,control,
    ...(mfc?{coreStepsVersion,authorityContext:role.authorityContext,routingContext,routingBoundary:boundary,sharedReply}:{})};
}

export function publicTutorialGuide(guide, session) {
  const state = session.caseStates[session.caseIndex], example = session.journeyStage==='example';
  const stepIndex = state.tutorialStepIndex || 0;
  const allowed=example&&!session.coreStepsVersion?null:tutorialExecutionKinds(guide.steps[stepIndex]?.id);
  const actions=guide.sharedReply?allowed?.filter(kind=>kind!=='notify'):allowed;
  return {stepIndex,...(actions?{allowedControlActions:actions}:{}),steps:guide.steps.map(({choices,explanation,...step},index)=>{
    const visited = index <= stepIndex;
    const correctChoiceId = choices.find(choice=>choice.correct)?.id;
    return {...step,
      ...(visited && choices.length ? {choices:choices.map(({id,label})=>({id,label}))} : {}),
      ...(visited && (example || index < stepIndex) ? {explanation,correctChoiceId} : {})};
  }), ...(state.tutorialFinding ? {finding:state.tutorialFinding} : {}),
    ...(state.tutorialWorkFeedback ? {workFeedback:state.tutorialWorkFeedback} : {}),
  ...(stepIndex>=(session.coreStepsVersion?1:2) ? {decision:guide.decision} : {}),
    ...(guide.steps.some((step,index)=>step.action==='control'&&index<=stepIndex)&&session.status!=='active'
      ? {control:state.control||(state.controlWorkflow?controlMemo(state.controlWorkflow,guide,session.locale):guide.control)} : {})};
}

const executionCopy = [
  {
    id:'control-request',action:'read',
    title:T('Запросить результат','Request the outcome','请求办理结果'),
    prompt:T('У кого и что запрашивать?','Who should receive the request, and what should you ask for?','应向谁请求什么？'),
    correct:T('У компетентного исполнителя — подтверждение по конкретному вопросу','Ask the competent actor for evidence on the particular issue','向有权经办人请求该具体事项的证明'),
    wrong:T('У первого доступного адресата — общее письмо','Ask the first available recipient for a general letter','向任意接收方索要笼统的信件'),
    why:T('Выберите конкретный вопрос и компетентного получателя. Укажите, какой материал подтвердит результат. Новый ответ появится в материалах исполнения.','Choose an issue and a competent recipient. Specify what record would prove the outcome. The response appears under follow-through materials.','选定具体事项及有权接收方，明确能证明结果的材料。新回复将出现在办理监督材料中。')
  },{
    id:'control-evidence',action:'read',
    title:T('Проверить подтверждение','Check the evidence','核查证明'),
    prompt:T('Что можно принять как доказательство исполнения?','What counts as evidence of completion?','什么能证明已完成？'),
    correct:T('Только материал, подтверждающий этот результат по этому вопросу','A record that establishes this outcome for this issue','只接受能证明该具体事项结果的材料'),
    wrong:T('Любое поступившее письмо или обещание','Any new letter or promise','任何收到的信件或承诺'),
    why:T('Откройте поступивший материал и сопоставьте его с вопросом. Запись в журнале покажет, проверено ли относимое подтверждение.','Open the incoming record and compare it with the issue. The log records whether relevant evidence was verified.','打开新材料并与具体事项核对。日志将记录是否核实了相关证明。')
  },{
    id:'control-status',action:'read',
    title:T('Обновить статус вопроса','Update each issue','更新事项状态'),
    prompt:T('Когда менять статус отдельного вопроса?','When should an issue’s status change?','何时更改单项事项的状态？'),
    correct:T('Завершить подтверждённое с уведомлением, остальные вопросы оставить на контроле','Notify and close verified issues, keep other issues under review','通知后关闭已核实事项，其余继续监督'),
    wrong:T('После получения любого ответа закрыть все вопросы','Close every issue when any response arrives','收到任何回复后关闭所有事项'),
    why:T('Статус относится к одному вопросу. Для закрытия нужны относимое подтверждение и, когда это предусмотрено, уведомление. Незавершённый вопрос остаётся в работе.','Status belongs to one issue. Closing it requires evidence and, where required, notification. Unresolved issues stay open.','状态只属于一个事项。结案需要相关证明，并在要求时作出通知。未解决的事项继续办理。')
  },{
    id:'control-memo',action:'control',
    title:T('Подготовить заключение','Write the follow-through record','形成监督结论'),
    prompt:T('Что записать в заключении?','What should the record contain?','结论应记录什么？'),
    correct:T('Отдельные статусы, подтверждающие документы и следующий шаг','Separate statuses, supporting records and the next step','各事项状态、证明材料和后续步骤'),
    wrong:T('Только отметку о получении письма','Only a note that a letter arrived','只记录收到信件'),
    why:T('Укажите статус, доказательство и следующий шаг по каждому вопросу. В образце ссылки ведут к материалам в журнале исполнения.','State each issue’s status, evidence and next action. The sample points to the records in the follow-through log.','逐项说明状态、证据与后续步骤。示例引用办理日志中的材料。')
  }
];
const sharedExecutionCopy={
  'control-request':{
    prompt:T('Какой материал подтвердит результат?','What would establish the outcome?','什么材料能证明结果？'),
    correct:T('Запросить относимое подтверждение','Request relevant evidence','请求相关证明'),
    wrong:T('Запросить письмо без уточнения результата','Request a letter without specifying the outcome','索要未指定结果的信件'),
    why:T('Укажите, какой материал подтвердит результат. Ответ появится в деле.','Specify what would establish the result. The reply will enter the case records.','说明何种材料能证明结果。回复将进入案件记录。')
  },
  'control-status':{
    correct:T('Завершить подтверждённые вопросы, остальные оставить на контроле','Close the evidenced issues and keep the others open','结束已有证明的事项，其余继续监督'),
    why:T('Завершите то, что подтверждено, и сохраните открытые вопросы. Все выводы войдут в одно заключение.','Close what the evidence confirms. Keep the remaining issues open and include all findings in one memorandum.','结束证据已确认的事项，保留其余事项，并在一份结论中写明全部结果。')
  }
};
function executionSteps(language,sharedReply) {
  return executionCopy.map((entry,index)=>{
    const {id,action,title,prompt,correct,wrong,why}={...entry,...(sharedReply?sharedExecutionCopy[entry.id]:null)};
    const options = choose(['apply','skip'],'apply',[localized(correct,language),localized(wrong,language)]);
    return {id,action,panel:'decision',title:localized(title,language),prompt:localized(prompt,language),
      explanation:localized(why,language),choices:index%2?options.reverse():options};
  });
}

const executionKinds={
  'control-request':['request_evidence'],
  'control-evidence':['verify'],
  'control-status':['notify','close','keep_open','refer']
};
export const tutorialExecutionKinds = stepId => Object.hasOwn(executionKinds,stepId)?executionKinds[stepId]:null;

function issueEvidence(workflow,spec) {
  return workflow.materials.find(row=>row.issueIds.includes(spec.id)&&spec.evidenceMaterialIds.includes(row.id)&&row.verification==='confirmation');
}

function actionRecorded(workflow,issueId,outcomes) {
  return workflow.journal.some(row=>row.issueId===issueId&&outcomes.includes(row.outcome));
}

export function tutorialExecutionProgress(workflow,stepId) {
  for(const spec of workflow.definition.issues){
    const issue=workflow.issues.find(row=>row.id===spec.id);
    const evidence=issueEvidence(workflow,spec);
    if(stepId==='control-request'&&!evidence&&spec.responseMaterialId&&spec.acceptedRecipientSets?.[0]?.length&&
      workflow.materials.some(row=>row.issueIds.includes(spec.id))&&
      !actionRecorded(workflow,issue.id,['request_received','already_received']))return 'request';
    if(stepId==='control-evidence'&&evidence&&!issue.verifiedEvidenceIds.length)return 'verify';
  }
  if(stepId==='control-status'){
    for(const issue of workflow.issues){
      if(['closed','referred'].includes(issue.status))continue;
      if(issue.verifiedEvidenceIds.length||!actionRecorded(workflow,issue.id,['kept_open']))return 'status';
    }
  }
  return null;
}

export function tutorialExecutionAction(workflow, stepId, guide, {caseData,locale,timestamp}) {
  let current=workflow;
  const hints={
    request:localized(T('Представьте документ о результате по этому вопросу.','Provide a record of the outcome for this issue.','请提交该事项办理结果的记录。'),locale),
    verify:localized(T('Сопоставлено с предметом контрольного вопроса.','Compared the evidence with the scope of the issue.','已按监督事项范围核对证明。'),locale),
    notify:localized(T('Сообщить заявителю подтверждённый результат по этому вопросу.','Tell the applicant the confirmed outcome for this issue.','将本事项已确认结果告知申请人。'),locale),
    keep:localized(T('Запросить или проверить относимое подтверждение перед завершением.','Obtain or check relevant proof before closing.','结案前取得或核查相关证明。'),locale)
  };
  function apply(issueId,kind,input) {
    current=applyControlAction(current,null,{issueId,kind,...input},
      {caseData,locale,timestamp,requestId:`tutorial-${kind}-${current.revision}`});
  }
  for(const spec of current.definition.issues){
    const issue=current.issues.find(row=>row.id===spec.id);
    if(!issue)continue;
    const records=current.materials.filter(row=>row.issueIds.includes(spec.id));
    const evidence=issueEvidence(current,spec);
    const first=records[0];
    if(stepId==='control-request'&&!evidence&&first&&spec.responseMaterialId&&spec.acceptedRecipientSets?.[0]?.length&&
      !actionRecorded(current,issue.id,['request_received','already_received'])){
      apply(spec.id,'request_evidence',{reason:guide.control.text,instruction:hints.request,recipientIds:spec.acceptedRecipientSets[0],
        dueDate:guide.decision.deadline,expectedResult:localized(spec.scope,locale),evidenceSourceIds:[first.id]});
    }
    if(stepId==='control-evidence'&&evidence&&!issue.verifiedEvidenceIds.length)apply(spec.id,'verify',{reason:hints.verify,evidenceSourceIds:[evidence.id]});
    if(stepId==='control-status'&&!['closed','referred'].includes(issue.status)){
      const verified=issue.verifiedEvidenceIds[0];
      if(verified){
        const notice={reason:hints.verify,instruction:hints.notify,expectedResult:hints.notify,evidenceSourceIds:[verified]};
        if(!current.sharedReply&&spec.deliveryRequired&&!issue.notificationEvidenceIds.includes(verified))apply(spec.id,'notify',notice);
        apply(spec.id,'close',{reason:hints.verify,evidenceSourceIds:[verified]});
      }else if(!actionRecorded(current,issue.id,['kept_open'])){
        apply(spec.id,'keep_open',{reason:guide.control.text,instruction:hints.keep});
      }
    }
  }
  return current;
}

export function controlMemo(workflow, guide, locale) {
  const statuses=[], paragraphs=[];
  for(const issue of workflow.issues){
    const resolved=issue.status==='closed', referred=issue.status==='referred';
    const status=resolved?'resolved':referred?'referred':'pending';
    const records=workflow.materials.filter(row=>row.issueIds.includes(issue.id));
    const referral=workflow.journal.findLast(row=>row.issueId===issue.id&&row.outcome==='referred');
    const evidence=(referred?records.find(row=>referral?.evidenceSourceIds.includes(row.id)&&row.verification==='delivery')
      :records.find(row=>issue.verifiedEvidenceIds.includes(row.id)))||records[0];
    statuses.push({issueId:issue.id,status,evidenceSourceIds:evidence?[evidence.id]:[]});
    const title=localized(issue.title,locale), reference=evidence?localized(evidence.title,locale):'';
    const conclusion=resolved
      ? T('Подтверждён результат именно по этому вопросу. Завершение отражено в журнале.','The outcome of this issue was verified. The log records closure.','已核实本事项结果，办结情况已记录在日志中。')
      : referred ? T('Надлежащий адресат подтвердил приём этого вопроса. Проверяйте дальнейшее рассмотрение.','The competent recipient acknowledged this issue. Follow its substantive review.','主管接收方已确认收到该事项。继续跟进实质审理。')
      : T('Результат ещё не подтверждён. Оставить вопрос на контроле и проверить относимый документ при поступлении.','There is no confirmed result yet. Keep this issue open and check relevant evidence when received.','结果尚未确认。继续监督并在收到相关材料后核查。');
    const support=guide.coreStepsVersion===MFC_SEMINAR_VERSION&&(resolved||referred)&&evidence
      ? localized(evidence.text,locale).slice(0,480):'';
    paragraphs.push([title,localized(conclusion,locale),reference,support].filter(Boolean).join(' — '));
  }
  return {text:[guide.control.text,...paragraphs].filter(Boolean).join('\n\n').slice(0,6000),statuses};
}

export function validatedTutorialMemo(workflow, profile, guide, locale) {
  const memo=controlMemo(workflow,guide,locale);
  if(!validateControlSubmission(workflow,profile,memo).valid)fail('journey_example_unavailable',503);
  return memo;
}
