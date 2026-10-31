import {createAttempt, getAttemptQuestions, setAnswer, finishAttempt, validateAttempt, gradeAttempt} from './civil-service-model.mjs';

const COPY = {
  ru: {
    title:'Знания о государственной службе', eyebrow:'Тест семинара', intro:'Проверьте знания и сразу получите результат с разбором ответов.',
    source:'Источник', version:'Версия банка', reviewed:'Активный пул проверен', reviewPending:'Дата проверки не указана', pool:'В проверенной выдаче', sourceCount:'В исходном банке',
    questions:'вопросов', topics:'тем', maximum:'максимум баллов', distribution:'Вариант включает по 8 вопросов из каждой из 5 тем.',
    scoreRule:'Оценка: 5 × число верных ответов / 40, с округлением до сотых.', multipleRule:'В вопросах с несколькими ответами нужно выбрать все верные варианты. Частичные ответы и пропуски не приносят баллов.',
    sourceLanguage:'В языковых заданиях русские слова и примеры сохранены как предмет проверки. Цитаты документов в них могут относиться к прежним редакциям. Подписи на исходных иллюстрациях сохранены.',
    start:'Начать тест', startFailed:'Не удалось подготовить вариант. Проверенный банк пока не готов; попробуйте позже.',
    readonly:'Просмотр без изменения ответов.', readonlyIntro:'Начать попытку в режиме просмотра нельзя.',
    question:'Вопрос', of:'из', sourceNumber:'№ в источнике', single:'Выберите один ответ', multiple:'Выберите все верные ответы',
    previous:'Назад', next:'Далее', clear:'Очистить ответ', finish:'Завершить тест', answered:'С ответом', unanswered:'Без ответа', overview:'Все вопросы', current:'Текущий вопрос',
    saving:'Сохраняем ответы…', saved:'Ответы сохранены.', saveFailed:'Не удалось сохранить последние изменения. Ответы остаются на экране; повторите сохранение перед выходом.', retrySave:'Повторить сохранение',
    skippedTitle:'Остались вопросы без ответа', skippedBody:'За пропущенные вопросы начисляется 0 баллов. После завершения изменить ответы в этой попытке нельзя.', return:'Вернуться к вопросам', finishAnyway:'Завершить с пропусками',
    result:'Результат теста', correct:'Верно', incorrect:'Неверно', skipped:'Пропущено', points:'баллов', percent:'верных ответов', byTopic:'Результат по темам', breakdown:'Разбор ответов',
    selected:'Ваш ответ', answerKey:'Верный ответ', noAnswer:'Ответ не выбран.', sourceLink:'Источник вопроса',
    submitting:'Сохраняем результат…', submitted:'Результат сохранён.', submit:'Сохранить результат', submitFailed:'Результат рассчитан, но не сохранён в курсе. Повторите отправку этой же попытки.',
    newAttempt:'Новая попытка', saveBeforeRetry:'Сохраните результат, чтобы начать новую попытку.',
    restoreTitle:'Не удалось восстановить попытку', restoreBody:'Сохранённые ответы не заменены. Для этой попытки нужна совместимая версия банка.', retryRestore:'Повторить восстановление', export:'Скачать сохранённые ответы',
    imageAlt:'Иллюстрация к вопросу', imageFailed:'Не удалось загрузить иллюстрацию к вопросу.', retryImage:'Загрузить иллюстрацию снова', enlargeImage:'Увеличить изображение', closeImage:'Закрыть изображение', imagePan:'Прокручивайте изображение, чтобы рассмотреть детали.', zoomIn:'Увеличить масштаб', zoomOut:'Уменьшить масштаб',
    answerError:'Не удалось применить ответ. Попробуйте ещё раз.', completeError:'Не удалось завершить попытку. Ответы сохранены в текущем тесте.',
    attempt:'Попытка', details:'Показать разбор', topic:'Тема'
  },
  en: {
    title:'Public-service knowledge', eyebrow:'Seminar test', intro:'Check your knowledge and get an immediate score with an answer review.',
    source:'Source', version:'Bank version', reviewed:'Active pool reviewed', reviewPending:'Review date not provided', pool:'In the reviewed pool', sourceCount:'In the source bank',
    questions:'questions', topics:'topics', maximum:'maximum points', distribution:'Each paper includes 8 questions from each of 5 topics.',
    scoreRule:'Score: 5 × correct answers / 40, rounded to two decimal places.', multipleRule:'For multiple-answer questions, select every correct option. Partial answers and unanswered questions earn no points.',
    sourceLanguage:'Russian words and examples are retained for language assessment. Document excerpts in those tasks may use earlier versions. Source screenshots retain their original labels.',
    start:'Start test', startFailed:'A paper could not be prepared. The reviewed bank is not ready yet; please try later.',
    readonly:'Read-only view.', readonlyIntro:'A new attempt cannot be started in read-only mode.',
    question:'Question', of:'of', sourceNumber:'Source no.', single:'Choose one answer', multiple:'Choose all correct answers',
    previous:'Back', next:'Next', clear:'Clear answer', finish:'Finish test', answered:'Answered', unanswered:'Unanswered', overview:'All questions', current:'Current question',
    saving:'Saving answers…', saved:'Answers saved.', saveFailed:'The latest changes could not be saved. Your answers remain on screen; retry saving before leaving.', retrySave:'Retry saving',
    skippedTitle:'Some questions are unanswered', skippedBody:'Unanswered questions receive 0 points. Answers cannot be changed once this attempt is finished.', return:'Return to questions', finishAnyway:'Finish with unanswered questions',
    result:'Test result', correct:'Correct', incorrect:'Incorrect', skipped:'Unanswered', points:'points', percent:'correct answers', byTopic:'Results by topic', breakdown:'Answer review',
    selected:'Your answer', answerKey:'Correct answer', noAnswer:'No answer selected.', sourceLink:'Question source',
    submitting:'Saving result…', submitted:'Result saved.', submit:'Save result', submitFailed:'Your score has been calculated but has not been saved to the course. Retry submitting this same attempt.',
    newAttempt:'New attempt', saveBeforeRetry:'Save this result before starting a new attempt.',
    restoreTitle:'This attempt could not be restored', restoreBody:'Your saved answers have not been replaced. This attempt requires a compatible question-bank version.', retryRestore:'Retry restoring', export:'Download saved answers',
    imageAlt:'Question illustration', imageFailed:'The question illustration could not be loaded.', retryImage:'Reload illustration', enlargeImage:'Enlarge image', closeImage:'Close image', imagePan:'Scroll the image to examine its details.', zoomIn:'Zoom in', zoomOut:'Zoom out',
    answerError:'The answer could not be applied. Please try again.', completeError:'The attempt could not be finished. Your answers remain in the current test.',
    attempt:'Attempt', details:'Show answer review', topic:'Topic'
  },
  zh: {
    title:'公务知识测试', eyebrow:'研讨课测试', intro:'检验你的知识，并立即查看成绩和答案解析。',
    source:'来源', version:'题库版本', reviewed:'有效题目审核日期', reviewPending:'未提供审核日期', pool:'已审核可抽取题目', sourceCount:'原始题库题目',
    questions:'道题', topics:'个主题', maximum:'最高分', distribution:'每份试卷从5个主题中各抽取8道题。',
    scoreRule:'得分＝5 × 答对题数 / 40，保留两位小数。', multipleRule:'多选题需选出所有正确选项。部分选对或未作答均不得分。',
    sourceLanguage:'俄语词语和例句作为语言考查内容保留原文。这类题目中的文件引文可能来自旧版文件。原始截图中的界面文字也保留原样。',
    start:'开始测试', startFailed:'暂时无法生成试卷。已审核题库尚未准备就绪，请稍后重试。',
    readonly:'只读模式，无法修改答案。', readonlyIntro:'只读模式下无法开始新的测试。',
    question:'题目', of:'／', sourceNumber:'原题编号', single:'请选择一个答案', multiple:'请选择所有正确答案',
    previous:'上一题', next:'下一题', clear:'清除答案', finish:'完成测试', answered:'已作答', unanswered:'未作答', overview:'全部题目', current:'当前题目',
    saving:'正在保存答案……', saved:'答案已保存。', saveFailed:'未能保存最新修改。答案仍保留在屏幕上，请在离开前重试保存。', retrySave:'重试保存',
    skippedTitle:'仍有题目未作答', skippedBody:'未作答题目计0分。完成本次测试后无法修改答案。', return:'返回答题', finishAnyway:'提交并保留未作答题目',
    result:'测试结果', correct:'正确', incorrect:'错误', skipped:'未作答', points:'分', percent:'正确率', byTopic:'各主题成绩', breakdown:'答案解析',
    selected:'你的答案', answerKey:'正确答案', noAnswer:'未选择答案。', sourceLink:'题目来源',
    submitting:'正在保存成绩……', submitted:'成绩已保存。', submit:'保存成绩', submitFailed:'成绩已计算，但尚未保存到课程中。请重新提交本次测试。',
    newAttempt:'开始新测试', saveBeforeRetry:'请先保存本次成绩，再开始新测试。',
    restoreTitle:'无法恢复本次测试', restoreBody:'已保存的答案未被替换。本次测试需要兼容版本的题库。', retryRestore:'重试恢复', export:'下载已保存答案',
    imageAlt:'题目插图', imageFailed:'无法加载题目插图。', retryImage:'重新加载插图', enlargeImage:'放大图片', closeImage:'关闭图片', imagePan:'滚动图片以查看细节。', zoomIn:'放大', zoomOut:'缩小',
    answerError:'无法应用该答案，请重试。', completeError:'无法完成本次测试。答案仍保留在当前测试中。',
    attempt:'测试记录', details:'查看答案解析', topic:'主题'
  }
};

const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalizeLocale = value => /^zh/i.test(value) ? 'zh' : /^en/i.test(value) ? 'en' : 'ru';
const clone = value => structuredClone(value);
const externalUrl = value => {try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:'';} catch {return '';}};

/** One contained quiz. Persistence and course access remain the caller's responsibility. */
export async function mountCivilServiceTest(container, {
  bank, historicalBank=null, locale='ru', initialAttempt=null, readOnly=false,
  onCheckpoint=async()=>{}, onComplete=async()=>{}, isCurrent=()=>true
}={}) {
  if(!container?.replaceChildren)throw new TypeError('A quiz container is required.');
  let language=normalizeLocale(locale), attempt=null, restoreError=null, actionError=null;
  let destroyed=false, pendingSaves=0, savingError=null, completionError=null, finalizing=false;
  let checkpointTail=Promise.resolve(), completionTask=null, revision=0, savedRevision=0;
  let confirming=false, overviewOpen=false, breakdownOpen=false, submitted=false, imageQuestionId=null, imageZoom=1;
  const originalAttempt=initialAttempt===null?null:clone(initialAttempt);
  const life=new AbortController(), failedMedia=new Set(), expandedResults=new Set();
  const instanceId=`civil-${crypto.randomUUID()}`;
  const root=container.ownerDocument.createElement('section');
  root.className='civil-service-test';root.dataset.civilServiceTest='';
  container.replaceChildren(root);
  const t=key=>COPY[language][key];
  const local=value=>typeof value==='string'?value:value?.[language]||value?.ru||'';
  const bankFor=(value=attempt)=>value?.contentVersion&&value.contentVersion!==bank.contentVersion?historicalBank:bank;
  const number=value=>new Intl.NumberFormat(language==='zh'?'zh-CN':language==='en'?'en-GB':'ru-RU',{maximumFractionDigits:2}).format(value);
  const topicLabel=id=>local(bankFor()?.sections?.find(section=>section.id===id)?.label)||id;
  const completed=()=>attempt?.phase==='completed';
  const answeredCount=()=>attempt?.questionIds.filter(id=>attempt.answers[id]?.length).length||0;
  const $=selector=>root.querySelector(selector);
  const currentQuestion=()=>attempt?getAttemptQuestions(bankFor(),attempt)[attempt.currentIndex]:null;
  const blocked=()=>readOnly||pendingSaves>0||finalizing||Boolean(savingError);
  function restore() {
    try {
      if(originalAttempt!==null){const originalBank=bankFor(originalAttempt);validateAttempt(originalBank,originalAttempt);attempt=originalAttempt.phase==='completed'?finishAttempt(originalBank,originalAttempt):clone(originalAttempt);submitted=Number.isFinite(attempt.submittedAt);}
      restoreError=null;
    } catch(error){restoreError=error;attempt=null;}
  }

  function sourceMarkup() {
    const sourceBank=bankFor(),source=sourceBank.source||{},url=externalUrl(source.url);
    if(source.educationalEdition){
      const wording={ru:['Учебная редакция на основе','сборника Минтруда'],en:['Educational edition based on the','Ministry of Labour collection'],zh:['教学修订版，依据','劳动部题集']}[language];
      return `<div class="cst-source"><span>${html(wording[0])} ${url?`<a href="${html(url)}" target="_blank" rel="noopener noreferrer">${html(wording[1])}</a>`:html(wording[1])}</span></div>`;
    }
    return `<div class="cst-source"><span>${html(t('source'))}: ${url?`<a href="${html(url)}" target="_blank" rel="noopener noreferrer">${html(local(source.title))}</a>`:html(local(source.title))}</span></div>`;
  }

  function statusMarkup() {
    return `<div class="cst-save-status" data-save-status role="status" aria-live="polite"></div><div class="cst-warning" data-save-warning role="alert" hidden><p>${html(t('saveFailed'))}</p><button type="button" class="cst-button" data-action="retry-save">${html(t('retrySave'))}</button></div><div class="cst-warning" data-complete-warning role="alert" hidden><p>${html(t('submitFailed'))}</p><button type="button" class="cst-button" data-action="submit-result">${html(t('submit'))}</button></div>`;
  }

  function refreshStatus() {
    if(destroyed)return;
    const status=$('[data-save-status]');
    if(status)status.textContent=finalizing?t('submitting'):pendingSaves?t('saving'):savingError?'':submitted?t('submitted'):attempt?t('saved'):'';
    const warning=$('[data-save-warning]');if(warning)warning.hidden=!savingError;
    const completeWarning=$('[data-complete-warning]');if(completeWarning)completeWarning.hidden=!completionError;
    root.querySelectorAll('[data-action="finish"],[data-action="confirm-finish"],[data-action="submit-result"]').forEach(button=>button.disabled=blocked());
    root.querySelectorAll('[data-action="retry-save"]').forEach(button=>button.disabled=readOnly||pendingSaves>0||finalizing);
    root.querySelectorAll('[data-action="new"]').forEach(button=>button.disabled=blocked()||!submitted);
  }

  function checkpoint() {
    if(!attempt||readOnly)return Promise.resolve();
    const snapshot=clone(attempt), ticket=++revision;
    pendingSaves++;refreshStatus();
    const operation=checkpointTail.then(()=>onCheckpoint(snapshot)).then(()=>{
      savedRevision=ticket;if(savedRevision===revision)savingError=null;
    }).catch(error=>{savingError=error;throw error;}).finally(()=>{pendingSaves--;refreshStatus();});
    checkpointTail=operation.catch(()=>{});
    return operation;
  }

  async function drainCheckpoints() {
    await checkpointTail;
    if(savingError&&savedRevision<revision)throw savingError;
  }

  function renderIntro() {
    return `<header class="cst-heading"><span class="cst-eyebrow">${html(t('eyebrow'))}</span><h2 tabindex="-1" data-focus-heading>${html(t('title'))}</h2><p>${html(t('intro'))}</p></header><div class="cst-intro-grid"><div class="cst-stat"><strong>40</strong><span>${html(t('questions'))}</span></div><div class="cst-stat"><strong>5</strong><span>${html(t('topics'))}</span></div><div class="cst-stat"><strong>5</strong><span>${html(t('maximum'))}</span></div></div><div class="cst-rules"><p>${html(t('distribution'))}</p><p>${html(t('multipleRule'))}</p></div>${readOnly?`<p class="cst-readonly">${html(t('readonlyIntro'))}</p>`:`<button class="cst-button cst-primary" type="button" data-action="start">${html(t('start'))}</button>`}${sourceMarkup()}`;
  }

  function mediaMarkup(question) {
    if(!question.media)return '';
    let src='';
    try {const url=new URL(question.media.src,container.ownerDocument.baseURI);if(['http:','https:'].includes(url.protocol)&&url.origin===new URL(container.ownerDocument.baseURI).origin)src=url.href;}catch{/* An invalid image must remain a visible, recoverable failure. */}
    if(!src||failedMedia.has(question.id))return `<div class="cst-media-warning" role="alert"><p>${html(t('imageFailed'))}</p><button type="button" class="cst-button" data-action="retry-image" data-question="${html(question.id)}">${html(t('retryImage'))}</button></div>`;
    return `<figure class="cst-question-media"><img src="${html(src)}" alt="${html(local(question.media.alt)||t('imageAlt'))}" data-question-image="${html(question.id)}"><button type="button" class="cst-button cst-zoom-open" data-action="zoom-image" data-question="${html(question.id)}">${html(t('enlargeImage'))}</button></figure>`;
  }

  function imageDialogMarkup() {
    const question=bankFor()?.questions.find(item=>item.id===imageQuestionId);
    if(!question?.media){imageQuestionId=null;return '';}
    let src='';
    try {const url=new URL(question.media.src,container.ownerDocument.baseURI);if(['http:','https:'].includes(url.protocol)&&url.origin===new URL(container.ownerDocument.baseURI).origin)src=url.href;}catch{/* The normal image card exposes this error. */}
    if(!src){imageQuestionId=null;return '';}
    return `<dialog class="cst-image-dialog" aria-labelledby="${instanceId}-image-title"><header><h3 id="${instanceId}-image-title">${html(t('imageAlt'))} · ${html(t('sourceNumber'))} ${html(question.number)}</h3><button type="button" class="cst-button" data-action="close-image">${html(t('closeImage'))}</button></header><div class="cst-image-toolbar"><p>${html(t('imagePan'))}</p><div><button type="button" class="cst-button" data-action="zoom-out" aria-label="${html(t('zoomOut'))}" ${imageZoom<=1?'disabled':''}>−</button><span data-image-scale aria-live="polite">${Math.round(imageZoom*100)}%</span><button type="button" class="cst-button" data-action="zoom-in" aria-label="${html(t('zoomIn'))}" ${imageZoom>=3?'disabled':''}>+</button></div></div><div class="cst-image-scroll" tabindex="0" role="region" aria-label="${html(t('imagePan'))}"><img src="${html(src)}" alt="${html(local(question.media.alt)||t('imageAlt'))}" data-zoom-image></div></dialog>`;
  }

  function updateImageScale(){
    const image=$('[data-zoom-image]');if(image?.naturalWidth)image.style.width=`${image.naturalWidth*imageZoom}px`;
    const label=$('[data-image-scale]');if(label)label.textContent=`${Math.round(imageZoom*100)}%`;
    const out=$('[data-action="zoom-out"]'),inside=$('[data-action="zoom-in"]');if(out)out.disabled=imageZoom<=1;if(inside)inside.disabled=imageZoom>=3;
  }

  function renderQuestion() {
    const questions=getAttemptQuestions(bankFor(),attempt), question=questions[attempt.currentIndex], selected=attempt.answers[question.id]||[], multi=question.correctOptionIds.length>1;
    const answered=answeredCount(),remaining=questions.length-answered;
    return `<header class="cst-heading cst-active-heading"><div><span class="cst-eyebrow">${html(t('eyebrow'))}</span><h2>${html(t('title'))}</h2></div><div class="cst-test-status"><span class="cst-paper-position">${attempt.currentIndex+1} / ${questions.length}</span></div></header><div class="cst-progress-line"><span>${html(t('answered'))}: <strong>${answered} / ${questions.length}</strong></span><span>${html(t('unanswered'))}: <strong>${remaining}</strong></span></div><progress class="cst-progress" max="${questions.length}" value="${answered}" aria-label="${html(t('answered'))}"></progress>${statusMarkup()}${readOnly?`<p class="cst-readonly">${html(t('readonly'))}</p>`:''}<div class="cst-workspace"><article class="cst-question-card"><div class="cst-question-meta"><span>${html(topicLabel(question.sectionId))}</span></div><h3 tabindex="-1" data-focus-heading>${html(local(question.stem))}</h3>${mediaMarkup(question)}<fieldset class="cst-options" ${readOnly||finalizing?'disabled':''}><legend>${html(t(multi?'multiple':'single'))}</legend>${question.options.map((option,index)=>`<label class="cst-option${selected.includes(option.id)?' is-selected':''}" for="${instanceId}-option-${index}"><input id="${instanceId}-option-${index}" type="${multi?'checkbox':'radio'}" name="${instanceId}-answer" data-option="${html(option.id)}" data-option-index="${index}" value="${html(option.id)}" ${selected.includes(option.id)?'checked':''}><span>${html(local(option.text))}</span></label>`).join('')}</fieldset><div class="cst-question-tools"><button type="button" class="cst-text-button" data-action="clear" ${readOnly||!selected.length||finalizing?'disabled':''}>${html(t('clear'))}</button></div><nav class="cst-navigation" aria-label="${html(t('overview'))}"><button type="button" class="cst-button" data-action="previous" ${!attempt.currentIndex||finalizing?'disabled':''}>${html(t('previous'))}</button>${attempt.currentIndex<questions.length-1?`<button type="button" class="cst-button cst-primary" data-action="next" ${finalizing?'disabled':''}>${html(t('next'))}</button>`:`<button type="button" class="cst-button cst-primary" data-action="finish" ${blocked()?'disabled':''}>${html(t('finish'))}</button>`}</nav></article><aside class="cst-sidebar"><details class="cst-overview" ${overviewOpen?'open':''}><summary>${html(t('overview'))}<span>${answered} / ${questions.length}</span></summary><div class="cst-question-map">${questions.map((q,index)=>{const done=Boolean(attempt.answers[q.id]?.length);return `<button type="button" data-question-index="${index}" class="${done?'is-answered':''}" ${index===attempt.currentIndex?'aria-current="step"':''} aria-label="${html(t('question'))} ${index+1}: ${html(t(done?'answered':'unanswered'))}${index===attempt.currentIndex?', '+html(t('current')):''}">${index+1}${done?'<span aria-hidden="true">✓</span>':''}</button>`;}).join('')}</div><p class="cst-map-legend">✓ ${html(t('answered'))}</p></details><button type="button" class="cst-button cst-finish" data-action="finish" ${blocked()?'disabled':''}>${html(t('finish'))}</button></aside></div>${confirming?`<dialog class="cst-confirm" aria-labelledby="${instanceId}-confirm-title"><h3 id="${instanceId}-confirm-title">${html(t('skippedTitle'))}: ${remaining}</h3><p>${html(t('skippedBody'))}</p><div class="cst-confirm-actions"><button type="button" class="cst-button" data-action="cancel-finish">${html(t('return'))}</button><button type="button" class="cst-button cst-primary" data-action="confirm-finish" ${blocked()?'disabled':''}>${html(t('finishAnyway'))}</button></div></dialog>`:''}`;
  }

  function renderResult() {
    const resultBank=bankFor(),result=gradeAttempt(resultBank,attempt), questions=getAttemptQuestions(resultBank,attempt);
    return `<header class="cst-heading"><span class="cst-eyebrow">${html(t('title'))}</span><h2 tabindex="-1" data-focus-heading>${html(t('result'))}</h2></header><div class="cst-result-hero"><div class="cst-result-score"><strong>${number(result.points)}<small> / ${result.maxPoints}</small></strong><span>${html(t('points'))}</span></div><div><strong>${result.correct} / ${result.total}</strong><span>${html(t('correct'))}</span></div><div><strong>${number(result.percent)}%</strong><span>${html(t('percent'))}</span></div></div>${statusMarkup()}<div class="cst-result-actions">${!readOnly&&!submitted?`<button type="button" class="cst-button cst-primary" data-action="submit-result" ${blocked()?'disabled':''}>${html(t('submit'))}</button>`:''}${!readOnly?`<button type="button" class="cst-button${submitted?' cst-primary':''}" data-action="new" ${blocked()||!submitted?'disabled':''}>${html(t('newAttempt'))}</button>`:''}</div>${!submitted&&!readOnly?`<p class="cst-note">${html(t('saveBeforeRetry'))}</p>`:''}<section class="cst-section-results" aria-labelledby="${instanceId}-topics"><h3 id="${instanceId}-topics">${html(t('byTopic'))}</h3><ul>${(resultBank.sections||[]).map(section=>{const ids=questions.filter(q=>q.sectionId===section.id).map(q=>q.id),correct=result.questionResults.filter(q=>ids.includes(q.id)&&q.correct).length;return `<li><span>${html(local(section.label))}</span><strong>${correct} / ${ids.length}</strong></li>`;}).join('')}</ul></section><details class="cst-breakdown" id="${instanceId}-breakdown" ${breakdownOpen?'open':''}><summary>${html(t('breakdown'))}</summary>${questions.map((question,index)=>{
      const item=result.questionResults.find(value=>value.id===question.id),status=item.correct?'correct':item.selectedOptionIds.length?'incorrect':'skipped';
      const sources=[...new Set(question.review?.sourceUrls||[])].map(externalUrl).filter(Boolean);
      return `<details class="cst-result-question ${item.correct?'is-correct':'is-incorrect'}" data-review-question="${html(question.id)}" ${expandedResults.has(question.id) ? "open" : ""}><summary><span class="cst-result-number">${index+1}</span><span>${html(local(question.stem))}</span><b>${html(t(status))}</b></summary><div class="cst-result-content"><p class="cst-question-meta">${html(topicLabel(question.sectionId))} · ${html(t('sourceNumber'))} ${html(question.number)}</p>${mediaMarkup(question)}${!item.selectedOptionIds.length?`<p>${html(t('noAnswer'))}</p>`:''}<ul class="cst-reviewed-options">${question.options.map(option=>{const chosen=item.selectedOptionIds.includes(option.id),correct=item.correctOptionIds.includes(option.id);return `<li class="${correct?'is-key':''}${chosen?' was-selected':''}"><span>${html(local(option.text))}</span><span class="cst-answer-tags">${chosen?`<b>${html(t('selected'))}</b>`:''}${correct?`<b class="cst-key-tag">${html(t('answerKey'))}</b>`:''}</span></li>`;}).join('')}</ul>${sources.length?`<div class="cst-question-sources">${sources.map((url,i)=>`<a href="${html(url)}" target="_blank" rel="noopener noreferrer">${html(t('sourceLink'))}${sources.length>1?' '+(i+1):''}</a>`).join('')}</div>`:''}</div></details>`;
    }).join('')}</details>${sourceMarkup()}`;
  }

  function render({focus=false,optionIndex=null}={}) {
    if(destroyed)return;
    root.lang=language==='zh'?'zh-Hans':language;
    root.innerHTML=restoreError?`<div class="cst-recovery" role="alert"><h2 tabindex="-1" data-focus-heading>${html(t('restoreTitle'))}</h2><p>${html(t('restoreBody'))}</p><div class="cst-result-actions"><button type="button" class="cst-button cst-primary" data-action="retry-restore">${html(t('retryRestore'))}</button></div></div>`:!attempt?renderIntro():completed()?renderResult():renderQuestion();
    if(imageQuestionId)root.insertAdjacentHTML('beforeend',imageDialogMarkup());
    if(actionError){const notice=root.ownerDocument.createElement('p');notice.className='cst-warning';notice.setAttribute('role','alert');notice.textContent=t(actionError);root.prepend(notice);}
    refreshStatus();
    const dialog=$('.cst-confirm');
    if(dialog){dialog.addEventListener('cancel',()=>{confirming=false;},{signal:life.signal});dialog.addEventListener('close',()=>{confirming=false;$('[data-action="finish"]')?.focus({preventScroll:true});},{signal:life.signal});dialog.showModal();}
    else if(imageQuestionId){const imageDialog=$('.cst-image-dialog');imageDialog.addEventListener('close',()=>{const id=imageQuestionId;imageQuestionId=null;$(`[data-action="zoom-image"][data-question="${CSS.escape(id)}"]`)?.focus({preventScroll:true});},{signal:life.signal});imageDialog.showModal();updateImageScale();}
    else if(optionIndex!==null)$(`[data-option-index="${optionIndex}"]`)?.focus({preventScroll:true});
    else if(focus){$('[data-focus-heading]')?.focus({preventScroll:true});$('[data-focus-heading]')?.scrollIntoView({block:'nearest',behavior:'instant'});}
  }

  function start() {
    if(readOnly||finalizing||!isCurrent())return;
    try {
      const random=new Uint32Array(1);crypto.getRandomValues(random);
      attempt=createAttempt(bank,{seed:random[0],id:crypto.randomUUID(),startedAt:Date.now()});
      submitted=false;completionError=null;actionError=null;savingError=null;overviewOpen=false;breakdownOpen=false;expandedResults.clear();
      void checkpoint().catch(()=>{});render({focus:true});
    } catch {actionError='startFailed';render();}
  }

  function navigate(index) {
    if(!attempt||completed()||finalizing||!isCurrent())return;
    if(!Number.isInteger(index)||index<0||index>=attempt.questionIds.length)return;
    attempt={...attempt,currentIndex:index};actionError=null;
    void checkpoint().catch(()=>{});render({focus:true});
  }

  function choose(optionIds,optionIndex=null) {
    if(readOnly||!attempt||completed()||finalizing||!isCurrent())return;
    try {attempt=setAnswer(bankFor(),attempt,currentQuestion().id,optionIds);actionError=null;void checkpoint().catch(()=>{});render({optionIndex});}
    catch{actionError='answerError';render({optionIndex});}
  }

  function finish() {
    if(blocked()||!attempt||completed())return;
    if(answeredCount()<attempt.questionIds.length){confirming=true;render();return;}
    void complete();
  }

  async function complete({retryCompleted=false}={}) {
    if(readOnly||finalizing||!attempt||!isCurrent()||(retryCompleted&&!completed())||(!retryCompleted&&blocked()))return;
    finalizing=true;confirming=false;imageQuestionId=null;completionError=null;actionError=null;
    try {attempt=finishAttempt(bankFor(),attempt,{finishedAt:Date.now()});}
    catch {finalizing=false;actionError='completeError';render();return;}
    render();
    completionTask=(async()=>{
      try {
        // Persist the manually completed paper before submitting its result.
        // A fresh full checkpoint can recover an earlier write failure.
        await checkpointTail;
        await checkpoint();
        render({focus:true});
        try {await onComplete({attempt:clone(attempt),result:clone(attempt.result)});}
        catch(error){completionError=error;return;}
        submitted=true;attempt={...attempt,submittedAt:Date.now()};
        await checkpoint();
      } catch(error){if(!savingError)actionError='completeError';}
      finally{finalizing=false;render({focus:true});}
    })();
    await completionTask;
  }

  root.addEventListener('change',event=>{
    const input=event.target.closest('input[data-option]');if(!input)return;
    const question=currentQuestion();
    const selected=question.correctOptionIds.length>1?[...root.querySelectorAll('input[data-option]:checked')].map(option=>option.dataset.option):[input.dataset.option];
    choose(selected,Number(input.dataset.optionIndex));
  },{signal:life.signal});
  root.addEventListener('toggle',event=>{if(event.target.matches('.cst-overview'))overviewOpen=event.target.open;if(event.target.matches('.cst-breakdown'))breakdownOpen=event.target.open;const id=event.target.dataset.reviewQuestion;if(id){if(event.target.open)expandedResults.add(id);else expandedResults.delete(id);}},{capture:true,signal:life.signal});
  root.addEventListener('load',event=>{if(event.target.matches?.('[data-zoom-image]'))updateImageScale();},{capture:true,signal:life.signal});
  root.addEventListener('error',event=>{
    const id=event.target.dataset?.questionImage;if(!id)return;failedMedia.add(id);render();
  },{capture:true,signal:life.signal});
  root.addEventListener('click',event=>{
    const indexButton=event.target.closest('[data-question-index]');
    if(indexButton){navigate(Number(indexButton.dataset.questionIndex));return;}
    const button=event.target.closest('button[data-action]');if(!button||button.disabled)return;
    const action=button.dataset.action;
    if(action==='start'||action==='new')start();
    else if(action==='previous')navigate(attempt.currentIndex-1);
    else if(action==='next')navigate(attempt.currentIndex+1);
    else if(action==='clear')choose([],0);
    else if(action==='finish')finish();
    else if(action==='confirm-finish'||action==='submit-result')void complete();
    else if(action==='cancel-finish'){confirming=false;render();$('[data-action="finish"]')?.focus({preventScroll:true});}
    else if(action==='retry-save')void checkpoint().then(()=>{if(completed()&&!submitted)return complete({retryCompleted:true});}).catch(()=>{});
    else if(action==='retry-restore'){restore();render({focus:true});}
    else if(action==='retry-image'){failedMedia.delete(button.dataset.question);render();}
    else if(action==='zoom-image'){imageQuestionId=button.dataset.question;imageZoom=1;render();}
    else if(action==='close-image')$('.cst-image-dialog')?.close();
    else if(action==='zoom-in'||action==='zoom-out'){imageZoom=Math.max(1,Math.min(3,imageZoom+(action==='zoom-in' ? 0.5 : -0.5)));updateImageScale();}
  },{signal:life.signal});

  restore();render();
  if(completed()&&!submitted&&!readOnly)void complete({retryCompleted:true});
  return {
    get hasActiveAttempt(){return attempt?.phase==='active';},
    get attemptId(){return attempt?.id||'civil-service-intro';},
    get updateBusy(){return destroyed||finalizing||pendingSaves>0||Boolean(savingError||completionError||restoreError);},
    setLocale(value){if(destroyed)return;const focused=$('input[data-option]:focus')?.dataset.optionIndex;language=normalizeLocale(value);render({optionIndex:focused===undefined?null:Number(focused)});},
    async flush(){if(completionTask)await completionTask;await drainCheckpoints();return attempt?clone(attempt):null;},
    destroy(){if(destroyed)return;destroyed=true;life.abort();$('dialog[open]')?.close();root.remove();}
  };
}
