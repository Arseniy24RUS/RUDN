import {getLocale,localized,t} from './i18n.js?v=1.1.20';
import {backend} from './backend.js?v=1.1.20';

function uuid(){return globalThis.crypto?.randomUUID?.()||`quiz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}
const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const hash=(s)=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
const norm=(s)=>String(s??'').toLowerCase().replace(/ё/g,'е').replace(/[«»“”"'.,;:!?()\[\]{}]/g,' ').replace(/\s+/g,' ').trim();
const SEMINAR1_ASSESSMENT_IDS=[
  '29ae02be-3bda-5b48-81e6-b8565fabf760',
  '1feebc7f-6872-56be-a958-7f090218591d',
  'f59842c3-91da-5740-8b11-322bb5e1a9a7',
  'cac3af1c-a4b5-533a-b3b7-a986bea3a9a7',
  '7fd17bff-0bef-5896-8c6a-2b99018549da'
];

const MATRIX_COPY={
  ru:{
    federal:'Федеральный уровень',regional:'Региональный уровень',municipal:'Муниципальный уровень',
    federal_legislative:'Законодательная',federal_executive:'Исполнительная',federal_judicial:'Судебная',
    regional_legislative:'Законодательная',regional_executive:'Исполнительная',regional_judicial:'Судебная',
    municipal_representative:'Представительная',municipal_administration:'Исполнительная',municipal_other:'Иные органы'
  },
  en:{
    federal:'Federal level',regional:'Regional level',municipal:'Municipal level',
    federal_legislative:'Legislative',federal_executive:'Executive',federal_judicial:'Judicial',
    regional_legislative:'Legislative',regional_executive:'Executive',regional_judicial:'Judicial',
    municipal_representative:'Representative',municipal_administration:'Executive',municipal_other:'Other bodies'
  },
  zh:{
    federal:'联邦层级',regional:'地区层级',municipal:'市政层级',
    federal_legislative:'立法',federal_executive:'行政',federal_judicial:'司法',
    regional_legislative:'立法',regional_executive:'行政',regional_judicial:'司法',
    municipal_representative:'代表',municipal_administration:'行政',municipal_other:'其他机关'
  }
};
const REVIEW_COPY={
  ru:{yourAnswer:'Ваш ответ',correctAnswer:'Правильный ответ',acceptedAnswers:'Засчитываются ответы',unanswered:'Ответ не выбран',explanation:'Пояснение'},
  en:{yourAnswer:'Your answer',correctAnswer:'Correct answer',acceptedAnswers:'Accepted answers',unanswered:'No answer selected',explanation:'Explanation'},
  zh:{yourAnswer:'您的答案',correctAnswer:'正确答案',acceptedAnswers:'可接受的答案',unanswered:'未选择答案',explanation:'说明'}
};
const MATRIX_SCHEMA=[
  ['federal','legislative'],['federal','executive'],['federal','judicial'],
  ['regional','legislative'],['regional','executive'],['regional','judicial'],
  ['municipal','representative'],['municipal','administration'],['municipal','other']
];
const LEGACY_MATRIX_ALIASES={
  'municipal|legislative':'municipal|representative',
  'municipal|executive':'municipal|administration',
  'municipal|judicial':'municipal|other'
};
function matrixCopy(){return MATRIX_COPY[getLocale()]||MATRIX_COPY.ru}
export function canonicalMatrixValue(value){
  const raw=String(value||'');
  return LEGACY_MATRIX_ALIASES[raw]||raw;
}
export function correctMatrixValue(question){
  return correctMatrixValues(question)[0]||'';
}
export function correctMatrixValues(question){
  const accepted=Array.isArray(question?.classification_accepted)?question.classification_accepted:[];
  const fallback=question?.classification_correct
    ?[question.classification_correct]
    :[`${question?.matrix?.correct?.row||''}|${question?.matrix?.correct?.column||''}`];
  return [...new Set((accepted.length?accepted:fallback).map(canonicalMatrixValue).filter(value=>value.includes('|')))];
}
export function matrixChoiceMeta(value){
  const canonical=canonicalMatrixValue(value);
  const [row,column]=canonical.split('|');
  const copy=matrixCopy();
  return {row,column,level:copy[row]||row,authority:copy[`${row}_${column}`]||column,value:canonical};
}
export function matrixChoiceLabel(value){const item=matrixChoiceMeta(value);return `${item.level} · ${item.authority}`}
export function matrixChoices(){return MATRIX_SCHEMA.map(([row,column],index)=>({...matrixChoiceMeta(`${row}|${column}`),index:index+1}))}

export function questionText(q){return localized(q,'prompt',q.prompt||q.name||'')}
export function institutionText(q){return questionText(q).replace(/^\s*\d+\s*[.)．、:–—-]\s*/u,'')}
export function answerText(a){return localized(a,'text',a.text||'')}
export function feedbackText(q){return localized(q,'general_feedback',q.general_feedback||'')}
export function reviewNoteText(q){return localized(q,'review_note',q.review_note||'')}
export function categoryText(q){return localized(q,'category',q.category||'')}

export function buildQuiz(questions,activitySlug,profile,options={}){
  let pool=[];let title='';let pointsMax=5;let recordAttempt=true;let recordGrade=true;let resultActivitySlug=activitySlug;
  const byCategory=(name)=>questions.filter(q=>q.category===name);
  if(/^lecture-[1-7]$/.test(activitySlug)){
    const n=Number(activitySlug.split('-')[1]);pool=byCategory(`Тест по лекции ${n}`);title=`${t('test')} · ${t('lecture')} ${n}`;
  }else if(activitySlug==='seminar-1'||activitySlug==='seminar-1-classroom'){
    const all=byCategory('Семинар 1. Ветви и уровни власти');
    const byId=new Map(all.map(q=>[q.id,q]));const assessment=options.mode==='assessment';
    if(Array.isArray(options.questionIds)&&options.questionIds.length)pool=options.questionIds.map(id=>byId.get(id)).filter(Boolean);
    else if(assessment)pool=SEMINAR1_ASSESSMENT_IDS.map(id=>byId.get(id)).filter(Boolean);
    else pool=[...all];
    pointsMax=assessment?5:pool.length;recordAttempt=true;recordGrade=assessment;resultActivitySlug=assessment?'seminar-1':'seminar-1-classroom';
    title=assessment
      ?getLocale()==='en'?'Independent work · Branches and Levels of Public Authority':getLocale()==='zh'?'自主作业 · 公共权力分支与层级':'Самостоятельная работа · Ветви и уровни власти'
      :getLocale()==='en'?'Classroom quiz · Branches and Levels of Public Authority':getLocale()==='zh'?'课堂测验 · 公共权力分支与层级':'Аудиторный квиз · Ветви и уровни власти';
  }else if(activitySlug==='seminar-4'){
    const all=byCategory('Семинар 4. Нормативные правовые акты');const blocks=[...new Set(all.map(q=>q.block_title).filter(Boolean))];const block=blocks[hash(options.seedKey||profile?.studentKey||Date.now())%blocks.length];pool=all.filter(q=>q.block_title===block);title=localized(pool[0]||{},'block_title',block)||block;
  }else if(activitySlug==='seminar-8'){
    pool=byCategory('Итоговый тест по дисциплине');title=getLocale()==='en'?'Final course test':getLocale()==='zh'?'课程期末测验':'Итоговый тест';
  }else if(activitySlug==='exam'){
    pool=byCategory('Итоговый тест по дисциплине');title=getLocale()==='en'?'Examination test':getLocale()==='zh'?'考试测验':'Экзаменационный тест';pointsMax=20;
  }
  return {id:uuid(),activitySlug:resultActivitySlug,title,pointsMax,questions:pool,answers:{},index:0,startedAt:Date.now(),recordAttempt,recordGrade,buildOptions:{...options}};
}

export function renderInstitutionHeading(q,{tag='h2',board=false}={}){
  const safeTag=tag==='h1'?'h1':'h2';const m=q.media||{};
  const symbol=m.symbol?`<img class="institution-heading-logo" src="${escapeHtml(m.symbol)}" alt="">`:'';
  return `<div class="institution-heading ${board?'board-institution-heading':''}">${symbol}<${safeTag} class="institution-title ${board?'board-question-title':''}">${escapeHtml(institutionText(q))}</${safeTag}></div>`;
}

export function renderQuestionMedia(q,{showSymbol=true}={}){
  const m=q.media;if(!m)return'';
  const photo=m.photo?`<div><img class="question-photo" src="${escapeHtml(m.photo)}" alt="${escapeHtml(institutionText(q))}"></div>`:'';
  const symbol=showSymbol&&m.symbol?`<div><img class="question-symbol" src="${escapeHtml(m.symbol)}" alt=""></div>`:'';
  return photo||symbol?`<div class="question-media ${photo&&symbol?'':'single'}">${photo}${symbol}</div>`:'';
}

function selectedValue(session,q){return session.answers[q.id]??(q.single?'':[])}
function renderMultichoice(q,session){
  const current=selectedValue(session,q);const type=q.single?'radio':'checkbox';
  return `<div class="answer-list">${q.answers.map(a=>{const checked=q.single?current===a.id:Array.isArray(current)&&current.includes(a.id);return`<label class="answer-option ${checked?'selected':''}"><input type="${type}" name="answer" value="${escapeHtml(a.id)}" ${checked?'checked':''}><span>${escapeHtml(answerText(a))}</span></label>`}).join('')}</div>`;
}
function renderShort(q,session){return`<label><span>${t('typeAnswer')}</span><input class="short-answer" value="${escapeHtml(selectedValue(session,q))}" autocomplete="off"></label>`}
export function renderMatrixButtons(q,selected='',options={}){
  const normalizedCounts={};
  for(const [value,count] of Object.entries(options.counts||{})){
    const canonical=canonicalMatrixValue(value);
    normalizedCounts[canonical]=(normalizedCounts[canonical]||0)+Number(count||0);
  }
  const selectedValueCanonical=canonicalMatrixValue(selected);
  const reveal=Boolean(options.reveal);const showDistribution=Boolean(options.showDistribution);const total=Number(options.total||0);const correct=new Set(correctMatrixValues(q));
  return `<div class="matrix-option-grid" role="radiogroup" aria-label="${escapeHtml(t('selectAnswer'))}">${matrixChoices().map(choice=>{
    const count=Number(normalizedCounts[choice.value]||0);const percent=total?Math.round(count/total*100):0;
    const state=[selectedValueCanonical===choice.value?'selected':'',showDistribution?'live-distribution':'',reveal&&correct.has(choice.value)?'correct':'',reveal&&count&&!correct.has(choice.value)?'has-wrong':''].filter(Boolean).join(' ');
    const authorityIcon=['legislative','representative'].includes(choice.column)?'legislative':['executive','administration'].includes(choice.column)?'executive':choice.column==='other'?'other':'judicial';
    const fullLabel=`${choice.level}: ${choice.authority}`;
    const accessibleLabel=showDistribution?`${fullLabel} · ${percent}%`:fullLabel;
    return `<button type="button" class="matrix-option ${state}" style="--answer-share:${percent}%" data-level="${choice.row}" data-authority="${authorityIcon}" data-matrix="${choice.value}" aria-label="${escapeHtml(accessibleLabel)}" title="${escapeHtml(fullLabel)}" aria-pressed="${selectedValueCanonical===choice.value}" aria-keyshortcuts="${choice.index}" ${options.disabled?'disabled':''}><span class="matrix-option-symbol" aria-hidden="true"></span><span class="matrix-option-level">${escapeHtml(choice.level)}</span><strong>${escapeHtml(choice.authority)}</strong>${reveal||(showDistribution&&count>0)?`<span class="matrix-option-result"><b>${count}</b><small>${percent}%</small></span>`:''}</button>`;
  }).join('')}</div>`;
}
function renderMatrix(q,session,options={}){return renderMatrixButtons(q,selectedValue(session,q),options)}

function renderQuestionNavigator(session){
  const items=session.questions.map((question,index)=>{
    const active=index===session.index;const answered=hasAnswer(question,session.answers[question.id]);
    return `<button type="button" class="quiz-question-tab ${active?'active':''} ${answered?'answered':''}" data-quiz-index="${index}" aria-current="${active?'step':'false'}" aria-label="${escapeHtml(t('quizQuestion'))} ${index+1}">${index+1}</button>`;
  }).join('');
  return `<details class="quiz-question-nav" ${session.navOpen?'open':''}><summary><span>${escapeHtml(t('questionList'))}</span><strong>${session.index+1}/${session.questions.length}</strong></summary><div class="quiz-question-list">${items}</div></details>`;
}

export function renderQuiz(container,session,options={}){
  const {onExit,onAnswer,onQuestionChange}=options;const q=session.questions[session.index];
  if(!q){container.innerHTML=`<div class="panel"><p>В этом блоке пока нет вопросов.</p><button class="btn btn-neutral" id="quizExit">${t('backToCourse')}</button></div>`;container.querySelector('#quizExit').onclick=onExit||(()=>history.back());return}
  const progress=(session.index/session.questions.length)*100;
  const matrixOptions=typeof options.matrixOptions==='function'?options.matrixOptions({question:q,index:session.index,session}):(options.matrixOptions||{});
  const body=q.type==='matrix_single'?renderMatrix(q,session,matrixOptions):q.type==='shortanswer'?renderShort(q,session):renderMultichoice(q,session);
  const heading=q.type==='matrix_single'?renderInstitutionHeading(q):`<h2>${escapeHtml(questionText(q))}</h2>`;
  const statusText=typeof options.statusText==='function'?options.statusText({question:q,index:session.index,session}):options.statusText;
  const questionNavigatorHtml=session.activitySlug==='seminar-1-classroom'?renderQuestionNavigator(session):'';
  container.innerHTML=`<div class="quiz-shell"><div class="quiz-progress"><span>${t('quizQuestion')} ${session.index+1}/${session.questions.length}</span><div class="track"><span style="width:${progress}%"></span></div>${statusText?`<span class="quiz-live-status">${escapeHtml(statusText)}</span>`:''}</div><article class="quiz-question">${questionNavigatorHtml}<div class="question-kicker">${escapeHtml(categoryText(q))}</div>${heading}${renderQuestionMedia(q,{showSymbol:q.type!=='matrix_single'})}${body}<div class="quiz-actions"><button class="btn btn-neutral" id="quizPrev" ${session.index===0?'disabled':''}>← ${t('previous')}</button><button class="btn btn-primary" id="quizNext">${session.index===session.questions.length-1?t('finish'):t('next')} →</button></div></article></div>`;
  Promise.resolve(onQuestionChange?.({question:q,index:session.index,session})).catch(console.warn);
  const choose=(value)=>{
    session.answers[q.id]=value;
    Promise.resolve(onAnswer?.({question:q,value,index:session.index,session})).catch(console.warn);
    if(q.type==='matrix_single'){
      const canonical=canonicalMatrixValue(value);
      container.querySelectorAll('[data-matrix]').forEach(button=>{
        const selected=canonicalMatrixValue(button.dataset.matrix)===canonical;
        button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
      });
      container.querySelector(`[data-quiz-index="${session.index}"]`)?.classList.add('answered');
      return;
    }
    renderQuiz(container,session,options);
  };
  container.tabIndex=-1;container.focus({preventScroll:true});
  container.querySelectorAll('.answer-option input').forEach(input=>input.addEventListener('change',()=>{if(q.single)choose(input.value);else{const values=[...container.querySelectorAll('.answer-option input:checked')].map(x=>x.value);choose(values)}}));
  container.querySelectorAll('[data-matrix]').forEach(btn=>btn.addEventListener('click',()=>choose(btn.dataset.matrix)));
  const questionNavigatorElement=container.querySelector('.quiz-question-nav');if(questionNavigatorElement)questionNavigatorElement.ontoggle=()=>{session.navOpen=questionNavigatorElement.open};
  container.querySelectorAll('[data-quiz-index]').forEach(button=>button.onclick=()=>{session.index=Number(button.dataset.quizIndex);session.navOpen=false;renderQuiz(container,session,options)});
  container.onkeydown=event=>{if(q.type!=='matrix_single'||event.altKey||event.ctrlKey||event.metaKey)return;const n=Number(event.key);if(n>=1&&n<=9){event.preventDefault();container.querySelector(`[aria-keyshortcuts="${n}"]`)?.click()}};
  const short=container.querySelector('.short-answer');if(short){short.addEventListener('input',()=>session.answers[q.id]=short.value);short.addEventListener('change',()=>Promise.resolve(onAnswer?.({question:q,value:short.value,index:session.index,session})).catch(console.warn))}
  container.querySelector('#quizPrev').onclick=()=>{session.index=Math.max(0,session.index-1);renderQuiz(container,session,options)};
  container.querySelector('#quizNext').onclick=()=>{if(!hasAnswer(q,session.answers[q.id])){window.dispatchEvent(new CustomEvent('rudn:toast',{detail:{message:t('selectAnswer'),type:'error'}}));return}if(session.index<session.questions.length-1){session.index++;renderQuiz(container,session,options)}else finishQuiz(container,session,options)};
}
function hasAnswer(q,value){if(q.type==='multichoice'&&!q.single)return Array.isArray(value)&&value.length>0;return value!==undefined&&value!==null&&String(value).trim()!==''}

export function gradeQuestion(q,value){
  const copy=REVIEW_COPY[getLocale()]||REVIEW_COPY.ru;
  if(q.type==='matrix_single'){
    const accepted=correctMatrixValues(q);const given=canonicalMatrixValue(value);const expectedValues=accepted.map(matrixChoiceLabel);
    return {fraction:accepted.includes(given)?1:0,expected:expectedValues.join(' / '),expectedValues,givenLabel:given.includes('|')?matrixChoiceLabel(given):copy.unanswered};
  }
  if(q.type==='shortanswer'){
    const correct=q.answers.filter(a=>Number(a.fraction)>0);const normalized=correct.map(a=>norm(a.text));const given=norm(value);
    return {fraction:normalized.some(x=>x===given)?1:0,expected:correct.map(answerText).join(' / '),expectedValues:correct.map(answerText),givenLabel:String(value||'').trim()||copy.unanswered};
  }
  const selected=new Set(Array.isArray(value)?value:[value]);let fraction=0;for(const a of q.answers)if(selected.has(a.id))fraction+=Number(a.fraction||0);
  fraction=Math.max(0,Math.min(1,fraction));const correct=q.answers.filter(a=>Number(a.fraction)>0).map(answerText);const given=q.answers.filter(a=>selected.has(a.id)).map(answerText);
  return {fraction,expected:correct.join('; '),expectedValues:correct,givenLabel:given.join('; ')||copy.unanswered};
}

function renderReviewItem(result,index){
  const copy=REVIEW_COPY[getLocale()]||REVIEW_COPY.ru;const correct=result.fraction>=.999;
  const expectedValues=result.expectedValues?.length?result.expectedValues:[result.expected].filter(Boolean);
  const expectedLabel=expectedValues.length>1?copy.acceptedAnswers:copy.correctAnswer;
  const note=result.q.type==='matrix_single'?reviewNoteText(result.q):feedbackText(result.q);
  return `<div class="review-item ${correct?'correct':'incorrect'}"><strong class="review-question">${index+1}. ${escapeHtml(result.q.type==='matrix_single'?institutionText(result.q):questionText(result.q))}</strong><p class="review-status">${correct?t('correct'):t('incorrect')} · ${Math.round(result.fraction*100)}%</p><dl class="review-answers"><div class="review-answer-row given"><dt>${escapeHtml(copy.yourAnswer)}</dt><dd>${escapeHtml(result.givenLabel||copy.unanswered)}</dd></div><div class="review-answer-row expected"><dt>${escapeHtml(expectedLabel)}</dt><dd>${expectedValues.map(value=>`<span>${escapeHtml(value)}</span>`).join('')}</dd></div></dl>${note?`<div class="review-explanation"><strong>${escapeHtml(copy.explanation)}</strong><p>${escapeHtml(note)}</p></div>`:''}</div>`;
}

export async function finishQuiz(container,session,options={}){
  const {onExit,onFinish}=options;const results=session.questions.map(q=>({q,value:session.answers[q.id],...gradeQuestion(q,session.answers[q.id])}));
  const raw=results.reduce((s,r)=>s+r.fraction,0);const ratio=results.length?raw/results.length:0;const points=Math.round(ratio*session.pointsMax*100)/100;
  const attempt={id:session.id,type:'quiz',activitySlug:session.activitySlug,title:session.title,points,maxPoints:session.pointsMax,ratio,recordGrade:session.recordGrade!==false,answers:session.answers,questionIds:session.questions.map(q=>q.id),durationMs:Date.now()-session.startedAt};
  if(session.recordAttempt!==false){
    await backend.saveAttempt(attempt);
  }
  await Promise.resolve(onFinish?.({attempt,results,session}));
  container.innerHTML=`<div class="quiz-shell"><div class="panel result-hero"><div class="result-score">${points}/${session.pointsMax}</div><h1>${t('quizResult')}</h1><p class="muted">${Math.round(ratio*100)}% · ${results.filter(r=>r.fraction>=.999).length}/${results.length}</p><div class="page-actions" style="justify-content:center"><button class="btn btn-primary" id="quizRetry">${t('retry')}</button><button class="btn btn-neutral" id="quizExit">${t('backToCourse')}</button></div></div><div class="panel"><h2>${t('review')}</h2><div class="review-list">${results.map(renderReviewItem).join('')}</div></div></div>`;
  container.querySelector('#quizRetry').onclick=()=>{const next=buildQuiz(window.RUDN_DATA.questions,session.activitySlug,backend.getProfile(),session.buildOptions||{});renderQuiz(container,next,options)};
  container.querySelector('#quizExit').onclick=onExit||(()=>location.hash='dashboard');window.dispatchEvent(new CustomEvent('rudn:gradechange'));
}
