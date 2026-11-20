export const MFC_SEMINAR_VERSION = 'mfc-referral-v2';
export const MFC_CALENDAR_VERSION = 'mfc-7-plus-30-v2';
export const MFC_DATES_ONLY_CALENDAR_VERSION = 'mfc-7-plus-30-v1';
export const LEGACY_MFC_CALENDAR_VERSION = 'mfc-calendar-original-v1';

export const isMfcChainedCalendar = version => [MFC_CALENDAR_VERSION,MFC_DATES_ONLY_CALENDAR_VERSION].includes(version);

// These authored actions require partitioning the original dispatch. They apply
// to the legacy case only. The MFC exercise grades the joint addressee choice.
const legacyDispatchActions = {
  'ads-consent':['a2'],
  'guard-property-inspection':['a2'],
  'noise-two-subjects':['a1','a2','a3'],
  'several-issues':['scope','protect','route','notify'],
  'several-minimum-attachments':['a1','a2'],
  'several-repair-and-complaint':['a1','a3'],
  'sign-not-ad':['a1','a2','a3'],
  'sign-promotion':['a2','a3'],
};

export function mfcUsesSharedReply(coreStepsVersion,workbook) {
  return coreStepsVersion===MFC_SEMINAR_VERSION&&workbook?.recipientLimit>1;
}

export function mfcLegacyDispatchActions(caseId) {
  return new Set(legacyDispatchActions[caseId]||[]);
}

export const mfcSharedReplyInstruction = {
  ru:'В приёмной МФЦ укажите всех компетентных адресатов для одного обращения и подготовьте один общий ответ. Включите содержательный вывод по всем вопросам и соблюдайте конфиденциальность.',
  en:'At the MFC reception desk, list all competent recipients for one appeal and prepare one joint response. Address the substance of every issue and protect confidential information.',
  zh:'在 MFC 受理台为同一件来信选出全部主管接收方，并起草一份统一答复。逐项说明实质结论，并保护保密信息。'
};

export const mfcScene = {
  title:{ru:'Сотрудник приёмной МФЦ',en:'MFC reception officer',zh:'多功能政务服务中心受理人员'},
  text:{
    ru:'Уточните предмет обращения и передайте материалы по компетенции. Подготовьте уведомление о передаче и проект решения, которое может принять компетентный адресат.',
    en:'Clarify the matter and refer it to the competent recipient. Prepare a referral notice and a draft decision for the competent recipient to make.',
    zh:'请明确来件事项并将材料转交主管接收方，同时拟写转交通知和供主管接收方作出的处理决定。'
  },
  authorityLabel:{ru:'Контекст исходного дела',en:'Context from the original case',zh:'原案背景'}
};

export function mfcRole(role,locale,sharedReply=false) {
  const text=value=>value?.[locale]||value?.ru||value||'';
  return {title:text(mfcScene.title),text:text(sharedReply?mfcSharedReplyInstruction:mfcScene.text),
    authorityContext:{label:text(mfcScene.authorityLabel),title:text(role.title),text:text(role.text)}};
}

export function mfcAuthorityName(authority,locale) {
  if(!authority)return '';
  const localizedName=locale==='en'?authority.nameEn:locale==='zh'?authority.nameZh:null;
  return localizedName||(typeof authority.name==='string'?authority.name:authority.name?.[locale]||authority.name?.ru)||'';
}

const T=(ru,en,zh)=>({ru,en,zh});
// Keep the substantive part of an authored action when its other part only
// asks for a calendar calculation that the current worksheet replaces.
const formerCalendarActions={
  'bailiff-subordination':{a2:T('Проверить результат рассмотрения жалобы.','Check the outcome of the complaint review.','核查投诉审查结果。')},
  'complaint-wrong-procedure':{a4:T('Проверить обоснование решения по отказу.','Check the reasons given for the refusal.','核查拒绝决定的理由。')},
  'flight-agent-receipt':{a2:null},
  'insurance-collective':{a2:T('Определить дальнейший способ защиты по спору о возврате.','Identify the next remedy in the refund dispute.','确定退款争议的后续救济途径。')},
  'sickpay-data':{a2:null},
  'tax-calendar-months':{a2:null}
};

export function mfcCalendarAction(caseId,actionId,locale) {
  const replacement=formerCalendarActions[caseId]?.[actionId];
  return replacement===null?null:replacement?.[locale];
}

export const mfcCalendarMerits={
  'bailiff-subordination':T('Передать жалобу правомочному руководителю. Проверить, имеются ли основания для приостановления исполнения.',
    'Refer the complaint to the competent supervisor and check whether there are grounds for suspending enforcement.',
    '将投诉提交有权负责人，并核查是否具备暂停执行的理由。'),
  'complaint-wrong-procedure':T('Проверить отказ в приёме документов по правилам досудебного обжалования государственной услуги.',
    'Review the refusal to accept the documents under the administrative complaint procedure for the public service.',
    '按政务服务的行政申诉程序审查拒收材料的决定。'),
  'flight-agent-receipt':T('Установить полномочия продавца и подтверждённый факт получения претензии перевозчиком.',
    'Establish the seller’s authority and verify that the carrier received the claim.',
    '查明销售方的权限，并核实承运人已收到索赔。'),
  'insurance-collective-payoff':T('Проверить право на возврат страховой премии пропорционально оставшемуся периоду по части 10 статьи 11.',
    'Check entitlement under Article 11(10) to a premium refund for the remaining coverage period.',
    '根据第11条第10款核查是否可按剩余保险期间退还相应保费。'),
  'insurance-collective':T('Проверить полученное кредитором заявление о возврате и разъяснить, какие условия ставки требуют проверки.',
    'Check the refund request received by the creditor and explain which interest-rate terms require verification.',
    '核查贷款方收到的退款申请，并说明哪些利率条款有待查证。'),
  'mfc-change-not-typo':T('Разъяснить порядок обновления данных и проверить основания жалобы на отказ в исправлении.',
    'Explain how the records can be updated and examine the grounds of the complaint about correction.',
    '说明如何更新资料，并核查关于拒绝更正的投诉理由。'),
  'mfc-correction-overdue':T('Проверить получение заявления об исправлении и выяснить, выдан ли исправленный результат.',
    'Verify receipt of the correction request and check whether the corrected result was issued.',
    '核实是否收到更正申请，以及是否已出具更正后的结果。'),
  'mfc-delay':T('Установить, какая стадия оказания услуги задержалась, кто отвечает за неё и какие действия уже выполнены.',
    'Establish which stage of the service was delayed, who is responsible and what has already been done.',
    '查明服务在哪一阶段发生延误、由谁负责，以及已经办理了哪些事项。'),
  'mfc-refusal':T('Проверить причины отказа в приёме документов и выяснить, было ли названо законное основание для отказа.',
    'Check why the documents were refused and determine whether a legal ground was given.',
    '核查拒收材料的原因，并确定是否说明了合法依据。'),
  'mfc-service-not-overdue':T('Проверить фактический ход оказания услуги и причины жалобы. Различать исполнение услуги и рассмотрение жалобы.',
    'Check progress on the service and the grounds of the complaint. Distinguish delivery of the service from review of the complaint.',
    '核查服务实际办理进展及投诉理由，区分服务办理与投诉审查。'),
  'mfc-service-refusal':T('Установить, кто принял решение об отказе в услуге, и проверить его доводы по материалам дела.',
    'Identify who refused the service and examine the reasons on the case record.',
    '查明作出服务拒绝决定的主体，并依据案件材料核查其理由。'),
  'sickpay-data':T('Проверить, поступили ли в СФР полные сведения, необходимые для назначения и выплаты пособия.',
    'Check whether the Social Fund received the complete information needed to award and pay the benefit.',
    '核查社会基金是否已收到核定和支付补助所需的完整资料。'),
  'sickpay-refusal-notice':T('Проверить мотивировку отказа и направление решения обоим предусмотренным получателям.',
    'Check the reasons for the refusal and whether the decision was sent to both designated recipients.',
    '核查拒绝决定的理由，以及是否已将决定送达两个指定接收方。'),
  'tax-calendar-months':T('Камеральную проверку ведут по представленной декларации. Окончание проверки и возврат средств относятся к разным стадиям.',
    'The desk audit concerns the submitted tax return. Completion of the audit and payment of a refund are separate stages.',
    '案头税务审核依据已提交的申报表开展。审核结束与退付资金属于不同阶段。')
};

export const mfcSharedMerits={
  'ads-consent':T('Проверьте, давал ли адресат согласие на рекламные сообщения и прекратилась ли рассылка после отказа. Установите, кто использовал номер и на каком основании.',
    'Check whether the recipient consented to the advertisements and whether messages stopped after they opted out. Establish who used the number and on what basis.',
    '核查收件人是否同意接收广告，以及其拒绝后是否停止发送。查明谁使用了号码及其依据。'),
  'noise-two-subjects':T('Новый ночной эпизод требует оперативной проверки. Жалобу на прежний ответ проверяет уполномоченное лицо, которое не принимало обжалуемое решение.',
    'The current nighttime incident calls for prompt attention. An authorised official who did not make the challenged decision reviews the complaint about the earlier response.',
    '应及时核查当前夜间事件。对先前答复的投诉由未参与作出被投诉决定的授权人员审查。'),
  'several-issues':T('Проверьте каждый довод транспортного обращения и установите, на каком основании использовались персональные данные. Сообщите выводы по обоим вопросам в одном ответе, соблюдая конфиденциальность.',
    'Check the points raised about transport and establish the basis for using the personal data. Explain the findings on both issues in one response and protect confidential information.',
    '核查交通方面的各项理由，查明使用个人数据的依据。在一份答复中说明两项结论，并保护保密信息。'),
  'several-minimum-attachments':T('Проверьте обстоятельства транспортного эпизода и основания обработки персональных данных. Правовые выводы опираются на относимые доказательства. В общем ответе соблюдайте конфиденциальность.',
    'Check the transport incident and the basis for processing personal data. Base the legal findings on relevant evidence and protect confidential information in the joint response.',
    '核查交通事件和处理个人数据的依据。法律结论应有相关证据支持，并在统一答复中保护保密信息。'),
  'several-repair-and-complaint':T('Проверьте по документам, восстановлена ли дорожка. По жалобе на прежний ответ запросите материалы и пояснения. Решение принимает независимое уполномоченное лицо.',
    'Check the records for evidence that the path was repaired. Obtain the records and accounts relevant to the complaint about the earlier reply. An independent authorised official decides the complaint.',
    '核对材料是否证实道路已修复。调取与先前答复投诉有关的记录和说明。由独立的授权人员处理投诉。'),
  'sign-not-ad':T('Определите назначение конструкции по её фактическому содержанию. Проверьте соблюдение правил размещения и влияние света в ночное время.',
    'Determine the function of the sign from its actual content. Check the placement requirements and the effects of its lighting at night.',
    '根据实际内容确定标牌用途。核查设置规定及夜间照明影响。'),
  'sign-promotion':T('Сопоставьте текущую демонстрацию рекламы с предыдущей карточкой и проверьте ночное световое воздействие. Отразите в одном ответе, что подтверждено и какие сведения ещё нужны.',
    'Compare the current advertising display with the earlier record and check the impact of lighting at night. Explain what is confirmed and what still requires evidence in one response.',
    '将当前广告展示与先前记录比对，并核查夜间照明影响。在一份答复中说明已确认情况及仍需核查的事项。')
};
