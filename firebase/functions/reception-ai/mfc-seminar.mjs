export const MFC_SEMINAR_VERSION = 'mfc-referral-v2';

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
