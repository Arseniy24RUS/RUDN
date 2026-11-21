import {icon} from './cabinet-icons.js';
import {localized} from './copy.js';
import {coreLabel, isCoreJourney} from './core-steps.js';

const copy = {
  ru: {
    askVisitor: 'Задать вопрос посетителю', askVisitorPrompt: 'Задайте вопрос о том, что произошло или кто указан в жалобе.',
    askVisitorAgain: 'Уточните конкретное обстоятельство, чтобы посетитель мог ответить по делу.',
    useSuggestedQuestion: 'Подставить вопрос', routeDocumentPrompt: 'Откройте документ и сопоставьте предмет обращения с полномочиями адресата.',
    filledDraftHint: 'Проект уже заполнен. Посмотрите, как факты жалобы и выбранная норма обосновывают решение. Откройте предпросмотр, чтобы прочитать письмо целиком.', confirmExample: 'Подтвердить проект',
    internalTitle: 'Решение по анонимному обращению', internalNext: 'Зафиксируйте, кому передать сведения об угрозе и как проверить результат. Обратного адреса в обращении нет.',
    archive: 'Архив обращений', archiveCase: 'Открыть дело из архива', archiveBack: 'Вернуться к занятиям',
    historicalResult: 'Открыть прежний результат', backToRoute: 'Вернуться к маршруту',
    mentorHintLabel: 'Подсказка к шагу', route: 'Учебный маршрут', opening: 'Обращение посетителя', example: 'Разобранный пример',
    mentor: 'Дело с наставником', independent: 'Самостоятельное дело', finished: 'Пройдено', locked: 'После предыдущего этапа',
    exampleHint: 'Разберите обращение, выберите норму, сроки и адресата, затем подготовьте ответ и проверьте исполнение.',
    mentorHint: 'Решите новое случайное дело. Наставник ответит на вопросы и подскажет, что исправить. Оценка в журнал выставляется за самостоятельное дело.',
    independentHint: 'Получите новое дело и пройдите его без подсказок. Итог объединяет качество ответа и контроль исполнения.',
    scale: 'Оценка за семинар · от 70 из 100 — 3, от 80 — 4, от 90 — 5.',
    exampleResume:'Продолжить разбор примера', mentorResume:'Продолжить дело с наставником', independentResume:'Продолжить самостоятельное дело', startExample: 'Разобрать пример', startMentor: 'Получить дело с наставником', startIndependent: 'Получить самостоятельное дело',
    exampleDone: 'Пример разобран', mentorDone: 'Дело с наставником завершено', noPoints: 'Учебный этап завершён без оценки. Можно переходить к следующему делу.',
    practiceResult: 'Результат практики', practiceJournal: 'Оценка в журнал не выставляется.',
    practicePerfect: 'Все критерии выполнены полностью.', practiceDeductions: 'За что сняты баллы и что улучшить', practiceCap: 'Ограничение итогового балла',
    step: 'Шаг {count} из {total}', openTab: 'Открыть «{name}»', nextStep: 'Перейти к следующему шагу',
    tryAgain: 'Сверьтесь с объяснением и попробуйте ещё раз. Баллы не изменятся.',
    viewSample: 'Заполнить по образцу', showDraft: 'Открыть полный образец ответа', showControl: 'Показать, как заполнить контроль',
    docsFirst: 'Сначала откройте указанный документ в списке ниже.',
    mentorPerson: 'Елена Андреевна', mentorRole: 'Наставник', chatDialogs: 'Собеседники',
    mentorWelcome: 'Здравствуйте! Задайте любой вопрос по делу. Если застряли, дам прямой ответ с объяснением.',
    mentorGreeting: 'С чего хотите начать? Можем сверить документы и сроки, подобрать адресата или разобрать текст ответа. Если хотите, я сразу предложу ответ с объяснением.',
    mentorOpenChat: 'Написать наставнику', mentorReturnCase: 'К делу', mentorDismissWelcome: 'Позже',
    question: 'Ваш вопрос наставнику', questionExample: 'Напишите вопрос…', send: 'Отправить вопрос', thinking: 'Наставник готовит ответ…',
    you: 'Вы', finishExample: 'Завершить разбор', finishMentor: 'Завершить практику',
    grade: 'Оценка за семинар', caseGrade: 'За это дело', bestGrade: 'Лучшая оценка в журнале', quality: 'Результат дела', threshold: 'Для 3 баллов нужно не менее 70%.',
    zeroPoints: 'За эту работу — 0 баллов.', getGrade: 'Завершить дело и получить оценку',
    finishCaseHint: 'Заключение зафиксировано. Завершите дело, чтобы увидеть итог и сохранить оценку за семинар.',
    controlHint: 'Откройте материал и выберите вопрос, к которому он относится. После необходимых действий подготовьте заключение по каждому вопросу и зафиксируйте его.',
    controlActions: 'К действиям по вопросу', controlMaterials: 'К поступившим материалам', controlMemo: 'К заключению',
    compare: 'Сравнить с учебным образцом', tryDraft: 'Подготовьте и проверьте свой вариант. Можно сравнить его с образцом и отдельно применить образец, если он вам подходит.',
    chatExample: 'В этом примере уточняем, чьё бездействие обжалуется и назван ли в жалобе руководитель департамента.',
    dateInstructions: 'Выберите назначение срока над календарём, затем нажмите на нужную дату. Повторите для каждого срока.',
    openDraft: 'Перейти к официальному проекту', chatPurpose: 'В чате уточняйте обстоятельства у посетителя. Официальный проект оформляется и отправляется на вкладке «Решение».',
    citationGuide: 'На вкладке «Документы» откройте нужную норму и добавьте её фрагмент в проект. В правовом обосновании объясните, как эта норма применяется к установленному факту и выбранному действию.',
    submitProject: 'Отправить официальный проект', evidenceAction: 'Открыть поступившее подтверждение',
    workFeedback: 'Комментарий наставника к вашей работе', responseModel: 'Образец ответа', mentorSample: 'Применить образец наставника',
    openOwnAction: 'Перейти к действию', checkOwnAction: 'Проверить мои действия',
    tryAction: 'Заполните и зафиксируйте действие в рабочем журнале. Затем проверьте результат.',
    checkOwnDraft: 'Проверить мой проект', submitPractice: 'Отправить решение на разбор', checkOwnControl: 'Проверить моё заключение',
    openOwnDraft: 'Перейти к моему проекту', openOwnControl: 'Открыть моё заключение', goGuide: 'Перейти к шагу разбора',
  },
  en: {
    askVisitor: 'Ask the visitor', askVisitorPrompt: 'Ask what happened or who is named in the complaint.',
    askVisitorAgain: 'Ask about a specific detail so the visitor can answer about the case.',
    useSuggestedQuestion: 'Use suggested question', routeDocumentPrompt: 'Open the document and check the subject of the appeal against the recipient’s authority.',
    filledDraftHint: 'The draft is ready. See how the facts and the selected provision support the decision. Open the preview to read the complete letter.', confirmExample: 'Confirm draft',
    internalTitle: 'Decision on an anonymous appeal', internalNext: 'Record who should receive the threat report and how to check the outcome. The appeal gives no return address.',
    archive: 'Case archive', archiveCase: 'View archived case', archiveBack: 'Back to learning',
    historicalResult: 'Open previous result', backToRoute: 'Back to routing',
    mentorHintLabel: 'Step hint', route: 'Learning path', opening: 'Visitor’s request', example: 'Worked example',
    mentor: 'Case with a mentor', independent: 'Independent case', finished: 'Completed', locked: 'After the previous stage',
    exampleHint: 'Read an appeal, choose the provision, dates and recipient, then write a response and check what was done.',
    mentorHint: 'Try a new random case. Your mentor answers questions and suggests corrections. The independent case counts toward your gradebook grade.',
    independentHint: 'Get a new case and complete it on your own. The result combines the written response and follow-through.',
    scale: 'Seminar grade · 70 or above earns 3, 80 or above earns 4, and 90 or above earns 5.',
    exampleResume:'Resume the worked example', mentorResume:'Resume the mentored case', independentResume:'Resume the independent case', startExample: 'Work through the example', startMentor: 'Get a case with a mentor', startIndependent: 'Get an independent case',
    exampleDone: 'Worked example completed', mentorDone: 'Mentored case completed', noPoints: 'This stage is complete and ungraded. You can proceed to the next case.',
    practiceResult: 'Practice result', practiceJournal: 'This result stays out of the gradebook.',
    practicePerfect: 'You met every criterion in full.', practiceDeductions: 'Where you lost points and what to improve', practiceCap: 'Final score cap',
    step: 'Step {count} of {total}', openTab: 'Open “{name}”', nextStep: 'Continue to the next step',
    tryAgain: 'Read the explanation and try again. Your grade is unaffected.',
    viewSample: 'Fill in from the example', showDraft: 'Open the complete sample response', showControl: 'Show how to record follow-through',
    docsFirst: 'Open the indicated document in the list below first.',
    mentorPerson: 'Elena Andreyevna', mentorRole: 'Mentor', chatDialogs: 'Conversations',
    mentorWelcome: 'Hello! Ask me any question about the case. If you get stuck, I can give you a direct answer and explain why.',
    mentorGreeting: 'Where would you like to start? We can check the documents and deadlines, find the right recipient, or work through your reply. I can suggest an answer and explain my reasoning.',
    mentorOpenChat: 'Open mentor chat', mentorReturnCase: 'Back to case', mentorDismissWelcome: 'Later',
    question: 'Your question for the mentor', questionExample: 'Type your question…', send: 'Send question', thinking: 'The mentor is preparing a reply…',
    you: 'You', finishExample: 'Finish the example', finishMentor: 'Finish the practice case',
    grade: 'Seminar grade', caseGrade: 'Grade for this case', bestGrade: 'Best grade in the gradebook', quality: 'Case score', threshold: 'A score of at least 70% earns 3 points.',
    zeroPoints: 'This case earned 0 points.', getGrade: 'Finish the case and get the grade',
    finishCaseHint: 'The memorandum is recorded. Finish the case to view the outcome and save the seminar grade.',
    controlHint: 'Open the material and select the issue it concerns. After recording the necessary actions, prepare and record a conclusion for each issue.',
    controlActions: 'Go to actions', controlMaterials: 'Go to received materials', controlMemo: 'Go to the memorandum',
    compare: 'Compare with the sample', tryDraft: 'Write and check your own version. You can compare it with the sample and explicitly use the sample if it suits your case.',
    chatExample: 'In this example we ask whose failure to act is challenged and whether the complaint names the director.',
    dateInstructions: 'Select a deadline type above the calendar, then select the appropriate date. Repeat for each deadline.',
    openDraft: 'Open the official draft', chatPurpose: 'Use chat to clarify facts with the visitor. Write and submit the official draft on the Decision tab.',
    citationGuide: 'On the Documents tab, open the relevant provision and add it to your draft. In the legal reasoning, explain how the provision applies to the established fact and your proposed action.',
    submitProject: 'Submit the official draft', evidenceAction: 'Open the received evidence',
    workFeedback: 'Mentor feedback on your work', responseModel: 'Sample response', mentorSample: 'Use the mentor’s sample',
    openOwnAction: 'Go to the action', checkOwnAction: 'Check my actions',
    tryAction: 'Complete and record the action in the work log. Then check your result.',
    checkOwnDraft: 'Check my draft', submitPractice: 'Submit your response for review', checkOwnControl: 'Check my memorandum',
    openOwnDraft: 'Go to my draft', openOwnControl: 'Open my memorandum', goGuide: 'Go to the current step',
  },
  zh: {
    askVisitor: '询问来访人', askVisitorPrompt: '询问发生了什么，或投诉中提到了谁。',
    askVisitorAgain: '请询问具体情况，以便来访人针对本案作答。',
    useSuggestedQuestion: '填入建议问题', routeDocumentPrompt: '打开材料，将来信事项与接收方的职权核对。',
    filledDraftHint: '草稿已填写。请查看投诉事实和所选条款如何支持处理决定，再打开预览阅读完整答复。', confirmExample: '确认草稿',
    internalTitle: '匿名诉求处理决定', internalNext: '注明由哪个机关接收威胁线索，以及如何核实处理结果。诉求中没有回复地址。',
    archive: '历史案件', archiveCase: '查看已归档案件', archiveBack: '返回学习',
    historicalResult: '查看以往结果', backToRoute: '返回转交路径',
    mentorHintLabel: '步骤提示', route: '学习路径', opening: '来访者的诉求', example: '示范案例',
    mentor: '导师指导案例', independent: '独立案例', finished: '已完成', locked: '完成上一阶段后解锁',
    exampleHint: '阅读来信，选择法律条款、期限与接收方，再撰写答复并核查办理结果。',
    mentorHint: '处理一个随机分配的新案例。导师会回答问题并给出修改建议。独立案例的成绩会记入成绩册。',
    independentHint: '领取一个新案例并独立完成。成绩综合书面答复和执行监督的表现。',
    scale: '研讨课成绩 · 满分 100，达到 70、80、90 分分别获得 3、4、5。',
    exampleResume:'继续示范案例', mentorResume:'继续导师指导案例', independentResume:'继续独立案例', startExample: '开始学习示范案例', startMentor: '领取导师指导案例', startIndependent: '领取独立案例',
    exampleDone: '示范案例已完成', mentorDone: '导师指导案例已完成', noPoints: '本阶段已完成，不计分。您可以进入下一个案例。',
    practiceResult: '练习结果', practiceJournal: '练习结果不计入成绩册。',
    practicePerfect: '您已完全达到所有评分标准。', practiceDeductions: '扣分原因和改进建议', practiceCap: '最终得分上限',
    step: '第 {count} 步，共 {total} 步', openTab: '打开“{name}”', nextStep: '进入下一步',
    tryAgain: '请根据解释重试。成绩不受影响。',
    viewSample: '按示范填入', showDraft: '打开完整答复示例', showControl: '查看如何填写执行监督记录',
    docsFirst: '请先打开下方列表中指定的文档。',
    mentorPerson: '叶莲娜·安德烈耶芙娜', mentorRole: '导师', chatDialogs: '对话',
    mentorWelcome: '您好！关于本案，有任何问题都可以问我。遇到困难时，我可以直接给出答案，并解释原因。',
    mentorGreeting: '您想从哪里开始？我们可以一起核对材料和期限，确定由谁受理，或讨论答复该怎么写。如果需要，我可以直接给出建议并说明理由。',
    mentorOpenChat: '打开导师对话', mentorReturnCase: '返回案例', mentorDismissWelcome: '稍后',
    question: '您向导师提出的问题', questionExample: '请输入您的问题…', send: '发送问题', thinking: '导师正在准备答复…',
    you: '您', finishExample: '完成示范案例', finishMentor: '完成练习案例',
    grade: '研讨课成绩', caseGrade: '本次案例成绩', bestGrade: '成绩册中的最高成绩', quality: '案例分数', threshold: '案例得分至少达到 70% 才能获得 3 分。',
    zeroPoints: '本次作业得 0 分。', getGrade: '完成案例并查看成绩',
    finishCaseHint: '结论已记录。完成案例后可查看结果并保存研讨课成绩。',
    controlHint: '打开材料，选择它所涉及的事项。登记必要的行动后，逐项准备并记录结论。',
    controlActions: '前往事项办理操作', controlMaterials: '前往收到的材料', controlMemo: '前往办理结论',
    compare: '与示范内容对照', tryDraft: '请拟写并检查自己的方案。您可以与示范对照，或主动选择采用示范。',
    chatExample: '在此示范中，我们询问投诉针对谁的不作为，以及投诉是否涉及部门负责人。',
    dateInstructions: '先在日历上方选择期限类型，再点选相应日期。逐一设置各项期限。',
    openDraft: '打开正式草稿', chatPurpose: '在聊天中向来访者核实情况。请在“处理决定”页面撰写并提交正式草稿。',
    citationGuide: '在“文件”页面打开相关条款，将选中的段落添加到草稿。在法律依据部分说明该条款如何适用于已核实的事实和拟采取的行动。',
    submitProject: '提交正式草稿', evidenceAction: '打开收到的证明材料',
    workFeedback: '导师对您作业的反馈', responseModel: '答复示范', mentorSample: '采用导师的示范',
    openOwnAction: '前往办理操作', checkOwnAction: '检查我的操作',
    tryAction: '完成操作并将其记入办理日志。然后检查结果。',
    checkOwnDraft: '检查我的答复草稿', submitPractice: '提交答复以获取评阅', checkOwnControl: '检查我的办理结论',
    openOwnDraft: '查看我的答复草稿', openOwnControl: '打开我的办理结论', goGuide: '前往当前学习步骤',
  },
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, key => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[key]);
const replace = (value, data) => value.replace(/\{(\w+)\}/g, (_, key) => data[key] ?? '');
const pages = {
  reception: 'reception', read: 'reception', opening: 'reception', visitor: 'reception',
  conversation: 'chat', chat: 'chat', documents: 'documents', materials: 'documents', sources: 'documents',
  calendar: 'calendar', dates: 'calendar', decision: 'decision', draft: 'decision',
  route: 'decision', routing: 'decision', response: 'decision', control: 'decision', review: 'decision',
};
const startLabels = {example:'startExample', mentor:'startMentor', independent:'startIndependent'};
const lessonStages = ['example', 'mentor'];
export function availableMentorActions(view) {
  return isLesson(view?.journeyStage)&&(view.journeyStage==='mentor'||isCoreJourney(view)) ? view.guidance?.allowedControlActions : undefined;
}

export function lessonLabel(locale, key) {
  return (copy[locale] || copy.ru)[key] || '';
}

export function isLesson(stage) {
  return lessonStages.includes(stage);
}

export function nextJourneyStage(progress = {}) {
  return !progress.exampleCompleted ? 'example' : !progress.mentorCompleted ? 'mentor' : 'independent';
}

export function lessonStep(view) {
  const step = view?.guidance?.steps?.[view.guidance.stepIndex];
  return step ? {...step, page:isCoreJourney(view)&&step.id==='route'?'route':pages[step.panel] || pages[step.action] || 'decision'} : null;
}

export function journeyPathView({locale, progress = {}, locked, canIndependent, button, mfc=false}) {
  const t = key => lessonLabel(locale, key);
  const current = nextJourneyStage(progress);
  const stages = [['example','sources'], ['mentor','talk'], ['independent','decision']];
  return `<section class="rxt-route" aria-labelledby="rxtRouteTitle"><h2 id="rxtRouteTitle">${esc(t('route'))}</h2>
    <ol class="rxt-route-stages">${stages.map(([id,glyph], index) => {
      const completed = id === 'example' ? progress.exampleCompleted : id === 'mentor' ? progress.mentorCompleted : false;
      const available = id==='example' || id==='mentor'&&progress.exampleCompleted ||
        id==='independent'&&progress.mentorCompleted&&canIndependent&&(progress.independentActive||progress.remainingCases!==0);
      const label=progress[id+'Active']?t(id+'Resume'):
        completed?coreLabel(locale,id==='example'?'replayExample':'repeatMentor'):t(startLabels[id]);
      return `<li class="rxt-route-stage" data-journey-card="${id}" ${current===id?'aria-current="step"':''}>
        <span class="rxt-stage-icon" aria-hidden="true">${icon(completed?'check':glyph)}</span>
        <div><h3>${esc(t(id))}</h3><p>${esc(mfc?coreLabel(locale,id+'Hint',true):t(id+'Hint'))}</p>
        ${id==='independent'?`<p class="rxt-grade-scale">${esc(t('scale'))}</p>`:''}
        ${completed?`<span class="rxt-stage-state">${esc(t('finished'))}</span>`:!available&&current!==id?`<span class="rxt-stage-state">${esc(t('locked'))}</span>`:''}
        ${available?button(label,'start-journey',{primary:current===id,quiet:current!==id,disabled:locked,extra:`data-stage="${id}"`,glyph:'arrow'}):''}</div>
      </li>`;
    }).join('')}</ol></section>`;
}

export function mentorWorkFeedbackView(view, locale) {
  const feedback = localized(view?.guidance?.workFeedback?.text, locale);
  if(!feedback)return '';
  return `<div class="rxt-mentor-feedback" data-mentor-work-feedback role="status">
    <strong>${esc(lessonLabel(locale,'workFeedback'))}</strong><p>${esc(feedback)}</p></div>`;
}

export function guidanceView({view, page, locale, localePage, button, locked, sampleReady, materialsReady, documents = [], executionMaterial, materialSeen}) {
  const step = lessonStep(view);
  if (!step || !isLesson(view?.journeyStage) || !['active','followup'].includes(view.status)) return '';
  const t = key => lessonLabel(locale, key), text = value => localized(value, locale);
  const example = view.journeyStage === 'example', inPlace = step.page === page;
  const finding = view.guidance.finding?.stepId === step.id ? view.guidance.finding : null;
  const right = example ? step.correctChoiceId : finding?.correctChoiceId;
  const sampleKey = {draft:'showDraft', control:'showControl', calendar:'viewSample'}[step.action];
  const sample = sampleKey && (step.action==='control' ? view.guidance.control : view.guidance.decisionByLocale?.[locale] || view.guidance.decision);
  const actionStep = Boolean(availableMentorActions(view)?.length);
  const core=isCoreJourney(view);
  const productStep = (!example||core) && (actionStep || ['draft','control-memo'].includes(step.id));
  const showChoices = inPlace && materialsReady && !productStep && (!example || !sample || sampleReady) && (!executionMaterial || materialSeen);
  const choices = Array.isArray(step.choices) ? step.choices : [];
  const single = choices.length === 1;
  return `<aside class="rxt-guide" aria-labelledby="rxtGuideTitle" data-tutorial-step="${esc(step.id)}">
    <p class="rxt-guide-progress">${esc(t(view.journeyStage))} <span>·</span> ${esc(replace(t('step'),{count:view.guidance.stepIndex+1,total:view.guidance.steps.length}))}</p>
    <h2 id="rxtGuideTitle" tabindex="-1">${esc(text(step.title))}</h2>
    ${mentorWorkFeedbackView(view,locale)}
    ${example || finding ? `<p class="rxt-explanation">${esc(text(finding?.explanation || step.explanation))}</p>` : ''}
    ${!inPlace?button(replace(t('openTab'),{name:localePage(step.page)}),'page',{primary:true,extra:`data-page="${step.page}"`,glyph:'arrow'}):`
      ${step.prompt?`<p class="rxt-prompt">${esc(text(step.prompt))}</p>`:''}
      ${step.page==='chat'&&example?`<p class="rxt-inline-tip">${esc(t('chatExample'))}</p>`:''}
      ${step.action==='calendar'?`<p class="rxt-inline-tip">${esc(t('dateInstructions'))}</p>`:''}
      ${productStep&&(actionStep||!core)?`<p class="rxt-inline-tip">${esc(t(actionStep?'tryAction':'tryDraft'))}</p>`:''}
      ${!materialsReady?`<p class="rxt-inline-tip">${esc(t('docsFirst'))}</p><div class="rxt-choices">${documents.map(doc=>button(text(doc.title),'document',{quiet:true,glyph:doc.opened?'check':'docs',extra:`data-id="${esc(doc.id)}"`})).join('')}</div>`:''}
      ${executionMaterial?`<button type="button" class="rxa-btn ${materialSeen?'quiet':'primary'}" data-control-action="open-material"
        data-material-id="${esc(executionMaterial.id)}">${icon('docs')}${esc(t('evidenceAction'))}</button>`:''}
      ${productStep?`<div class="rxt-choices">${button(t(actionStep?'openOwnAction':step.id==='draft'?'openOwnDraft':'openOwnControl'),
        'mentor-open-work',{primary:true,disabled:locked})}${sample?button(t('compare'),'tutorial-sample',{quiet:true,disabled:locked}) : ''}
        ${actionStep?button(t('checkOwnAction'),'mentor-check-action',{quiet:true,disabled:locked}) : ''}
        ${!core&&(sample||actionStep)?button(t('mentorSample'),'mentor-use-sample',{quiet:true,disabled:locked}) : ''}</div>`:
        sample?button(t(example?sampleKey:'compare'),'tutorial-sample',{quiet:sampleReady,primary:!sampleReady,disabled:locked}):''}
      ${finding?`<p class="rxt-inline-tip" role="status">${esc(t('tryAgain'))}</p>`:''}
      ${showChoices?`<div class="rxt-choices">${choices.map(choice => button(text(choice.label) || t('nextStep'),'tutorial-choice',{
        primary: choice.id===right || single, disabled:locked, extra:`data-choice="${esc(choice.id)}"`,
        glyph:choice.id===right?'check':'',
      })).join('')}</div>`:''}`}
  </aside>`;
}
