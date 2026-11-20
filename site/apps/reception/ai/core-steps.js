const copy = {
  ru: {
    sources:'Источники', routeTab:'Маршрут', shortReception:'Приём', shortChat:'Чат', shortDocuments:'Нормы', shortCalendar:'Сроки', shortRoute:'Маршрут', shortDecision:'Ответ', toSources:'К правовым источникам', attached:'Фрагмент выбран', openRecord:'Откройте хотя бы один материал дела.', journey:'Работа над делом', reception:'Обращение', materials:'Материалы и норма', calendar:'Сроки',
    route:'Компетентный орган', draft:'Ответ по существу', control:'Контроль', review:'Итог',
    read:'К материалам дела', nextMaterials:'К срокам', nextCalendar:'К выбору органа', nextRoute:'К ответу', update:'Сохранить изменения',
    materialsHint:'Прочитайте материалы дела. Откройте полный текст нормативного акта, выделите подходящее положение и добавьте его в ответ.',
    noCitation:'Добавьте фрагмент правовой нормы из полного текста.',
    dateHint:'Отметьте на календаре каждый требуемый срок. Выбранная дата сохранится для указанной над календарём цели.',
    registration:'Соблюдён ли срок регистрации?', yes:'Да, соблюдён', no:'Нет, нарушен',
    routeHint:'Выберите, кто вправе рассмотреть вопрос. Если передаёте его, укажите компетентный орган.',
    internal:'Рассмотреть в своём органе', forward:'Передать по компетенции',
    routeMissing:'Выберите внутреннее рассмотрение или укажите орган для передачи.',
    draftHint:'Объясните, какие обстоятельства установлены, как применяется выбранная норма, что решено и что будет дальше.',
    draftIncomplete:'Перед отправкой заполните тему и все разделы ответа.',
    returnTo:'К текущему шагу', blocked:'Сначала выполните текущий шаг.', path:'Выбор дела',
    repeatMentor:'Пройти ещё одно дело с наставником', replayExample:'Пройти пример заново',
    sourceSaved:'Норма добавлена. Проверьте выбранный фрагмент и продолжите работу.',
    requireDocuments:'Сначала откройте материалы, указанные наставником.',
    evidence:'Свяжите важное обстоятельство с прочитанным материалом или репликой заявителя.',
  },
  en: {
    sources:'Sources', routeTab:'Routing', shortReception:'Appeal', shortChat:'Chat', shortDocuments:'Sources', shortCalendar:'Dates', shortRoute:'Route', shortDecision:'Reply', toSources:'Go to legal sources', attached:'Passage selected', openRecord:'Open at least one case record.', journey:'Case steps', reception:'Appeal', materials:'Records and law', calendar:'Deadlines',
    route:'Competent authority', draft:'Substantive reply', control:'Follow-through', review:'Outcome',
    read:'Go to case records', nextMaterials:'Go to deadlines', nextCalendar:'Go to routing', nextRoute:'Go to the reply', update:'Save changes',
    materialsHint:'Read the case records. Open the full legal text, select the relevant provision and add it to your reply.',
    noCitation:'Add an excerpt from the full legal text.',
    dateHint:'Mark each required date on the calendar. Each selected date is saved for the deadline type shown above the calendar.',
    registration:'Was the appeal registered on time?', yes:'Yes, on time', no:'No, it was late',
    routeHint:'Decide who has authority to handle the matter. If you refer it, select the competent authority.',
    internal:'Handle within this authority', forward:'Refer to a competent authority',
    routeMissing:'Choose internal handling or select a competent authority for referral.',
    draftHint:'Explain what the facts show, how the selected provision applies, what you have decided and what happens next.',
    draftIncomplete:'Complete the subject and every section before submitting.',
    returnTo:'Return to the current step', blocked:'Complete the current step first.', path:'Choose a case',
    repeatMentor:'Try another case with a mentor', replayExample:'Repeat the worked example',
    sourceSaved:'Provision added. Review the selected passage and continue.',
    requireDocuments:'Open the records indicated by the mentor first.',
    evidence:'Link an important fact to a case record or a message from the applicant.',
  },
  zh: {
    sources:'法律依据', routeTab:'办理路径', shortReception:'受理', shortChat:'交谈', shortDocuments:'依据', shortCalendar:'期限', shortRoute:'路径', shortDecision:'答复', toSources:'查阅法律依据', attached:'已选条文', openRecord:'请至少打开一份案件材料。', journey:'案例办理步骤', reception:'来信', materials:'材料与法律条款', calendar:'期限',
    route:'主管机关', draft:'实质性答复', control:'办理监督', review:'结果',
    read:'查看案件材料', nextMaterials:'设置期限', nextCalendar:'选择主管机关', nextRoute:'撰写答复', update:'保存修改',
    materialsHint:'阅读案件材料。打开法规全文，选择适用的条款并将其添加到答复中。',
    noCitation:'请从法规全文中添加一段条文。',
    dateHint:'在日历中选定所有要求的期限。所选日期会保存至日历上方指出的期限项目。',
    registration:'来信是否在规定期限内登记？', yes:'是，按时登记', no:'否，登记超期',
    routeHint:'判断哪个机关有权处理该事项。如需转送，请选择有权机关。',
    internal:'由本机关办理', forward:'转送有权机关',
    routeMissing:'请选择本机关办理，或指定有权接受转送的机关。',
    draftHint:'说明已查明的事实，所选条款如何适用，作出的决定以及后续步骤。',
    draftIncomplete:'请填写主题和所有答复栏目后再提交。',
    returnTo:'返回当前步骤', blocked:'请先完成当前步骤。', path:'选择案例',
    repeatMentor:'再做一个导师指导案例', replayExample:'再次学习示范案例',
    sourceSaved:'已添加法律条款。请核对所选段落并继续。',
    requireDocuments:'请先打开导师指出的案件材料。',
    evidence:'请将一项重要事实与案件材料或来访者消息关联。',
  },
};

export const CORE_VERSION = 'guided-core-v1';
export const CORE_ACTIONS = ['materials', 'calendar', 'route'];
export const CORE_PAGES = {
  reception:'reception', materials:'documents', calendar:'calendar',
  route:'route', draft:'decision', control:'decision', review:'decision',
};
export const coreLabel = (locale,key) => (copy[locale] || copy.ru)[key] || '';
export const coreStepId = view => view?.status === 'followup' ? 'control' :
  ['review', 'complete'].includes(view?.status) ? 'review' :
  view?.guidance?.steps?.[view.guidance.stepIndex]?.id || view?.coreSteps?.stepId || 'reception';

export function coreDatePayload(workbook, state) {
  const dates=state?.selectedDates || {};
  if((workbook?.targets || []).some(target=>!dates[target.id]) ||
    (workbook?.registrationCheck && typeof state?.registrationTimely !== 'boolean'))return null;
  return {
    deadline:dates.deadline || '',
    referralDeadline:workbook?.targets?.some(target=>target.id==='referral') ? dates.referral : '',
    registrationTimely:workbook?.registrationCheck ? state.registrationTimely : false,
  };
}
