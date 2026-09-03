import {getLocale,localized,t} from './i18n.js?v=1.0.7';
import {backend} from './backend.js?v=1.0.7';

const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const shuffle=(array,seed=Date.now())=>{const copy=[...array];let state=seed>>>0;const rand=()=>{state+=0x6D2B79F5;let x=state;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296};for(let i=copy.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy};
const hash=(s)=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
const norm=(s)=>String(s??'').toLowerCase().replace(/ё/g,'е').replace(/[«»“”"'.,;:!?()\[\]{}]/g,' ').replace(/\s+/g,' ').trim();

export function questionText(q){return localized(q,'prompt',q.prompt||q.name||'')}
export function answerText(a){return localized(a,'text',a.text||'')}
export function feedbackText(q){return localized(q,'general_feedback',q.general_feedback||'')}
export function categoryText(q){return localized(q,'category',q.category||'')}

export function buildQuiz(questions,activitySlug,profile){
  let pool=[];let title='';let pointsMax=5;
  const byCategory=(name)=>questions.filter(q=>q.category===name);
  if(/^lecture-[1-7]$/.test(activitySlug)){
    const n=Number(activitySlug.split('-')[1]);pool=byCategory(`Тест по лекции ${n}`);title=`${t('test')} · ${t('lecture')} ${n}`;
  }else if(activitySlug==='seminar-1'){
    pool=shuffle(byCategory('Семинар 1. Ветви и уровни власти'),hash(profile?.studentKey||Date.now())).slice(0,10);title='Квиз «Ветви и уровни власти»';
  }else if(activitySlug==='seminar-4'){
    const all=byCategory('Семинар 4. Нормативные правовые акты');const blocks=[...new Set(all.map(q=>q.block_title).filter(Boolean))];const block=blocks[hash(profile?.studentKey||Date.now())%blocks.length];pool=all.filter(q=>q.block_title===block);title=localized(pool[0]||{},'block_title',block)||block;
  }else if(activitySlug==='seminar-8'){
    pool=byCategory('Итоговый тест по дисциплине');title='Итоговый тест';
  }else if(activitySlug==='exam'){
    pool=byCategory('Итоговый тест по дисциплине');title='Экзаменационный тест';pointsMax=20;
  }
  return {id:crypto.randomUUID(),activitySlug,title,pointsMax,questions:pool,answers:{},index:0,startedAt:Date.now()};
}

function renderMedia(q){
  const m=q.media;if(!m)return'';
  const photo=m.photo?`<div><img class="question-photo" src="${escapeHtml(m.photo)}" alt="${escapeHtml(localized(m,'photo_alt',''))}"><div class="media-caption">${escapeHtml(localized(m,'credit',''))}</div></div>`:'';
  const symbol=m.symbol?`<div><img class="question-symbol" src="${escapeHtml(m.symbol)}" alt="${escapeHtml(localized(m,'symbol_alt',''))}"><div class="media-caption">${escapeHtml(localized(m,'symbol_label',''))}</div></div>`:'';
  return photo||symbol?`<div class="question-media">${photo}${symbol}</div>`:'';
}

function selectedValue(session,q){return session.answers[q.id]??(q.single?'':[])}

function renderMultichoice(q,session){
  const current=selectedValue(session,q);const type=q.single?'radio':'checkbox';
  return `<div class="answer-list">${q.answers.map(a=>{const checked=q.single?current===a.id:Array.isArray(current)&&current.includes(a.id);return`<label class="answer-option ${checked?'selected':''}"><input type="${type}" name="answer" value="${escapeHtml(a.id)}" ${checked?'checked':''}><span>${escapeHtml(answerText(a))}</span></label>`}).join('')}</div>`;
}
function renderShort(q,session){return`<label><span>${t('typeAnswer')}</span><input class="short-answer" value="${escapeHtml(selectedValue(session,q))}" autocomplete="off"></label>`}
function renderMatrix(q,session){
  const matrix=q.matrix||{};const rows=matrix.rows||[];const cols=matrix.columns||[];const current=selectedValue(session,q);
  return `<div class="matrix-grid"><div class="matrix-cell header"></div>${cols.map(c=>`<div class="matrix-cell header">${escapeHtml(localized(c,'label',c.label))}</div>`).join('')}${rows.map(r=>`<div class="matrix-cell header">${escapeHtml(localized(r,'label',r.label))}</div>${cols.map(c=>{const value=`${r.id}|${c.id}`;return`<button type="button" class="matrix-cell choice ${current===value?'selected':''}" data-matrix="${value}" aria-pressed="${current===value}">${current===value?'✓':''}</button>`}).join('')}`).join('')}</div>`;
}

export function renderQuiz(container,session,{onExit}={}){
  const q=session.questions[session.index];
  if(!q){container.innerHTML=`<div class="panel"><p>В этом блоке пока нет вопросов.</p><button class="btn btn-neutral" id="quizExit">${t('backToCourse')}</button></div>`;container.querySelector('#quizExit').onclick=onExit||(()=>history.back());return}
  const progress=((session.index)/session.questions.length)*100;
  const body=q.type==='matrix_single'?renderMatrix(q,session):q.type==='shortanswer'?renderShort(q,session):renderMultichoice(q,session);
  container.innerHTML=`<div class="quiz-shell"><div class="quiz-progress"><span>${t('quizQuestion')} ${session.index+1}/${session.questions.length}</span><div class="track"><span style="width:${progress}%"></span></div></div><article class="quiz-question"><div class="question-kicker">${escapeHtml(categoryText(q))}</div><h2>${questionText(q)}</h2>${renderMedia(q)}${body}<div class="quiz-actions"><button class="btn btn-neutral" id="quizPrev" ${session.index===0?'disabled':''}>← ${t('previous')}</button><button class="btn btn-primary" id="quizNext">${session.index===session.questions.length-1?t('finish'):t('next')} →</button></div></article></div>`;
  container.querySelectorAll('.answer-option input').forEach(input=>input.addEventListener('change',()=>{
    if(q.single)session.answers[q.id]=input.value;else{const values=[...container.querySelectorAll('.answer-option input:checked')].map(x=>x.value);session.answers[q.id]=values}renderQuiz(container,session,{onExit});
  }));
  container.querySelectorAll('[data-matrix]').forEach(btn=>btn.addEventListener('click',()=>{session.answers[q.id]=btn.dataset.matrix;renderQuiz(container,session,{onExit})}));
  const short=container.querySelector('.short-answer');if(short)short.addEventListener('input',()=>session.answers[q.id]=short.value);
  container.querySelector('#quizPrev').onclick=()=>{session.index=Math.max(0,session.index-1);renderQuiz(container,session,{onExit})};
  container.querySelector('#quizNext').onclick=()=>{
    if(!hasAnswer(q,session.answers[q.id])){window.dispatchEvent(new CustomEvent('rudn:toast',{detail:{message:t('selectAnswer'),type:'error'}}));return}
    if(session.index<session.questions.length-1){session.index++;renderQuiz(container,session,{onExit})}else finishQuiz(container,session,{onExit});
  };
}
function hasAnswer(q,value){if(q.type==='multichoice'&&!q.single)return Array.isArray(value)&&value.length>0;return value!==undefined&&value!==null&&String(value).trim()!==''}

function gradeQuestion(q,value){
  if(q.type==='matrix_single'){const expected=`${q.matrix?.correct?.row}|${q.matrix?.correct?.column}`;return {fraction:value===expected?1:0,expected}}
  if(q.type==='shortanswer'){
    const correct=q.answers.filter(a=>Number(a.fraction)>0).map(a=>norm(a.text));const given=norm(value);return {fraction:correct.some(x=>x===given)?1:0,expected:correct.join(' / ')};
  }
  const selected=new Set(Array.isArray(value)?value:[value]);let fraction=0;
  for(const a of q.answers)if(selected.has(a.id))fraction+=Number(a.fraction||0);
  fraction=Math.max(0,Math.min(1,fraction));const expected=q.answers.filter(a=>Number(a.fraction)>0).map(answerText).join('; ');
  return {fraction,expected};
}

export async function finishQuiz(container,session,{onExit}={}){
  const results=session.questions.map(q=>({q,value:session.answers[q.id],...gradeQuestion(q,session.answers[q.id])}));
  const raw=results.reduce((s,r)=>s+r.fraction,0);const ratio=results.length?raw/results.length:0;const points=Math.round(ratio*session.pointsMax*100)/100;
  const attempt={id:session.id,type:'quiz',activitySlug:session.activitySlug,title:session.title,points,maxPoints:session.pointsMax,ratio,answers:session.answers,questionIds:session.questions.map(q=>q.id),durationMs:Date.now()-session.startedAt};
  await backend.saveAttempt(attempt);
  container.innerHTML=`<div class="quiz-shell"><div class="panel result-hero"><div class="result-score">${points}/${session.pointsMax}</div><h1>${t('quizResult')}</h1><p class="muted">${Math.round(ratio*100)}% · ${results.filter(r=>r.fraction>=.999).length}/${results.length}</p><div class="page-actions" style="justify-content:center"><button class="btn btn-primary" id="quizRetry">${t('retry')}</button><button class="btn btn-neutral" id="quizExit">${t('backToCourse')}</button></div></div><div class="panel"><h2>${t('review')}</h2><div class="review-list">${results.map((r,i)=>`<div class="review-item ${r.fraction>=.999?'correct':'incorrect'}"><strong>${i+1}. ${escapeHtml(questionText(r.q))}</strong><p>${r.fraction>=.999?t('correct'):t('incorrect')} · ${Math.round(r.fraction*100)}%</p>${r.fraction<.999?`<small class="muted">${escapeHtml(r.expected||'')}</small>`:''}${feedbackText(r.q)?`<p class="muted">${escapeHtml(feedbackText(r.q))}</p>`:''}</div>`).join('')}</div></div></div>`;
  container.querySelector('#quizRetry').onclick=()=>{const next=buildQuiz(window.RUDN_DATA.questions,session.activitySlug,backend.getProfile());renderQuiz(container,next,{onExit})};
  container.querySelector('#quizExit').onclick=onExit||(()=>location.hash='dashboard');
  window.dispatchEvent(new CustomEvent('rudn:gradechange'));
}
