import {CONFIG} from './config.js?v=1.1.12';
import {backend,groupOptions} from './backend.js?v=1.1.12';
import {
  buildQuiz,
  canonicalMatrixValue,
  correctMatrixValue,
  feedbackText,
  matrixChoiceLabel,
  renderInstitutionHeading,
  renderMatrixButtons,
  renderQuestionMedia,
  renderQuiz
} from './quiz.js?v=1.1.12';
import {getLocale} from './i18n.js?v=1.1.12';

const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,(char)=>({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[char]));

const COPY={
  ru:{
    group:'Учебная группа',online:'Сейчас в квизе',participants:'участников',unique:'ответили хотя бы раз',
    waiting:'Ожидаем ответы студентов…',answered:'Ответили на этот вопрос',
    revealed:'Результаты открыты автоматически',accuracy:'Точность группы',commonError:'Частая ошибка',
    cloudRequired:'Общая доска временно недоступна: нет соединения с Firebase.',
    question:'Вопрос',questionList:'Список вопросов'
  },
  en:{
    group:'Study group',online:'Currently in the quiz',participants:'participants',unique:'answered at least once',
    waiting:'Waiting for student responses…',answered:'Responses to this question',
    revealed:'Results revealed automatically',accuracy:'Class accuracy',commonError:'Most common misconception',
    cloudRequired:'The shared board is temporarily unavailable because Firebase cannot be reached.',
    question:'Question',questionList:'Question list'
  },
  zh:{
    group:'班级',online:'当前参加测验',participants:'名学生',unique:'至少回答过一次',
    waiting:'正在等待学生作答……',answered:'本题已作答',
    revealed:'结果已自动显示',accuracy:'班级正确率',commonError:'最常见误区',
    cloudRequired:'因无法连接 Firebase，共享大屏暂不可用。',
    question:'题目',questionList:'题目列表'
  }
};

function c(key){return COPY[getLocale()]?.[key]||COPY.ru[key]||key}
function participantNoun(count){
  const locale=getLocale();const value=Math.abs(Number(count)||0);
  if(locale==='en')return value===1?'participant':'participants';
  if(locale==='zh')return COPY.zh.participants;
  const lastTwo=value%100;const last=value%10;
  if(last===1&&lastTwo!==11)return'участник';
  if(last>=2&&last<=4&&(lastTwo<12||lastTwo>14))return'участника';
  return'участников';
}
function roomQuestionSet(group){
  const roomKey=backend.automaticRoomKey(group);
  const session=buildQuiz(window.RUDN_DATA.questions,'seminar-1',{studentKey:roomKey});
  return {roomKey,session};
}

export function activeParticipantIds(presence){
  return new Set(
    Object.entries(presence||{})
      .filter(([,connections])=>connections&&typeof connections==='object'&&Object.values(connections).some(
        (connection)=>connection&&typeof connection==='object'&&connection.joinedAt!=null
      ))
      .map(([uid])=>uid)
  );
}
export function participantCount(presence){return activeParticipantIds(presence).size}
function recordsFor(responses,questionId,activeIds){
  return Object.entries(responses?.[questionId]||{})
    .filter(([uid,value])=>value&&activeIds.has(uid))
    .map(([,value])=>value);
}
function answerCounts(records){
  const counts={};
  for(const record of records){const answer=canonicalMatrixValue(record.answer);counts[answer]=(counts[answer]||0)+1;}
  return counts;
}
function submittedAt(record){return Number(record?.submittedAt||record?.clientSubmittedAt||0)}
function latestQuestionIndex(questions,responses,activeIds){
  let best=0;
  let bestAt=0;
  questions.forEach((question,index)=>{
    for(const record of recordsFor(responses,question.id,activeIds)){
      const at=submittedAt(record);
      if(at>=bestAt){bestAt=at;best=index}
    }
  });
  return best;
}

export function revealState(records,active,nowValue=Date.now()){
  if(records.length<2||active<2)return false;
  const threshold=Math.max(2,Math.ceil(active*(CONFIG.live?.revealRatio||0.7)));
  const timestamps=records.map(submittedAt).filter((value)=>Number.isFinite(value)&&value>0);
  const first=timestamps.length?Math.min(...timestamps):0;
  return records.length>=threshold||Boolean(first&&nowValue-first>=(CONFIG.live?.revealAfterMs||45000));
}

export async function mountAdaptiveSeminar1(container,{onExit}={}){
  const profile=backend.getProfile();
  const {roomKey,session}=roomQuestionSet(profile.group);
  let leave=()=>{};
  let unsubPresence=()=>{};
  let unsubResponses=()=>{};
  let presence={};
  let responses={};
  let joined=false;
  let closed=false;
  const render=()=>{
    if(closed)return;
    const activeIds=activeParticipantIds(presence);
    renderQuiz(container,session,{
      onExit:()=>{cleanup();(onExit||(()=>history.back()))()},
      onAnswer:({question,value,index})=>backend.submitAutomaticQuizResponse(roomKey,question.id,value,index),
      onFinish:()=>{},
      statusText:()=>{const active=Math.max(joined?1:0,activeIds.size);return backend.mode==='cloud'?`${c('online')}: ${active} ${participantNoun(active)}`:c('cloudRequired')},
      matrixOptions:({question})=>{
        const records=recordsFor(responses,question.id,activeIds);
        return {counts:answerCounts(records),total:records.length,showDistribution:true};
      }
    });
  };
  const cleanup=()=>{
    if(closed)return;
    closed=true;
    try{unsubPresence()}catch{}
    try{unsubResponses()}catch{}
    try{leave()}catch{}
  };
  if(backend.mode==='cloud'){
    try{
      ({leave}=await backend.joinAutomaticQuizRoom(profile.group));joined=true;
      unsubPresence=backend.subscribeAutomaticPresence(roomKey,(value)=>{presence=value;render()});
      unsubResponses=backend.subscribeAutomaticResponses(roomKey,(value)=>{responses=value;render()});
    }
    catch(error){console.warn('Automatic classroom connection failed',error)}
  }
  render();
  return cleanup;
}

function boardInsight({reveal,active,accuracy,wrong,question}){
  if(!reveal)return '';
  const common=wrong
    ?`<span>${escapeHtml(c('commonError'))}: ${escapeHtml(matrixChoiceLabel(wrong[0]))} (${wrong[1]})</span>`
    :'';
  const feedback=feedbackText(question)?`<p>${escapeHtml(feedbackText(question))}</p>`:'';
  return `<div class="board-insight revealed"><strong>${escapeHtml(c('revealed'))}</strong><span>${escapeHtml(c('accuracy'))}: ${accuracy}%</span>${common}${feedback}</div>`;
}

export function mountAutomaticBoard(container,{initialGroup}={}){
  const availableGroups=groupOptions();
  let group=availableGroups.includes(initialGroup)?initialGroup:availableGroups[0];
  let presence={};
  let responses={};
  let selectedIndex=null;
  let followLatest=true;
  let navOpen=false;
  let unsubPresence=()=>{};
  let unsubResponses=()=>{};
  let disposed=false;

  const groupOptionsHtml=availableGroups
    .map((value)=>`<option value="${escapeHtml(value)}" ${value===group?'selected':''}>${escapeHtml(value)}</option>`)
    .join('');
  container.innerHTML=`
    <div class="auto-board-shell">
      <div class="panel auto-board-toolbar">
        <label><span>${escapeHtml(c('group'))}</span><select id="autoBoardGroup">${groupOptionsHtml}</select></label>
        <div class="auto-board-stat"><span>${escapeHtml(c('online'))}</span><strong id="autoBoardParticipants">0</strong><small id="autoBoardParticipantLabel">${escapeHtml(participantNoun(0))}</small></div>
        <div class="auto-board-stat"><span>${escapeHtml(c('unique'))}</span><strong id="autoBoardUnique">0</strong></div>
      </div>
      <div id="autoBoardContent"></div>
    </div>`;

  const content=container.querySelector('#autoBoardContent');
  function cleanupSubscriptions(){
    try{unsubPresence()}catch{}
    try{unsubResponses()}catch{}
    unsubPresence=()=>{};
    unsubResponses=()=>{};
  }
  function render(){
    if(disposed)return;
    const {session}=roomQuestionSet(group);
    const questions=session.questions;
    const activeIds=activeParticipantIds(presence);
    const active=activeIds.size;
    const unique=new Set();
    for(const question of questions){
      for(const [uid] of Object.entries(responses?.[question.id]||{})){
        if(activeIds.has(uid))unique.add(uid);
      }
    }
    container.querySelector('#autoBoardParticipants').textContent=String(active);
    container.querySelector('#autoBoardParticipantLabel').textContent=participantNoun(active);
    container.querySelector('#autoBoardUnique').textContent=String(unique.size);
    if(!questions.length){
      content.innerHTML=`<div class="panel notice warning">${escapeHtml(c('waiting'))}</div>`;
      return;
    }
    if(selectedIndex===null||followLatest)selectedIndex=latestQuestionIndex(questions,responses,activeIds);
    selectedIndex=Math.max(0,Math.min(questions.length-1,selectedIndex));
    const question=questions[selectedIndex];
    const records=recordsFor(responses,question.id,activeIds);
    const counts=answerCounts(records);
    const reveal=revealState(records,active);
    const correct=correctMatrixValue(question);
    const right=records.filter((record)=>canonicalMatrixValue(record.answer)===correct).length;
    const accuracy=records.length?Math.round(right/records.length*100):0;
    const wrong=Object.entries(counts)
      .filter(([value])=>value!==correct)
      .sort((a,b)=>b[1]-a[1])[0];
    const tabs=questions.map((item,index)=>{
      const answered=recordsFor(responses,item.id,activeIds).length;
      return `<button type="button" class="board-question-tab ${index===selectedIndex?'active':''}" data-board-index="${index}" aria-current="${index===selectedIndex?'step':'false'}"><span>${index+1}</span><small>${answered}</small></button>`;
    }).join('');
    const status=records.length?`${c('answered')}: ${records.length}${active?` / ${active}`:''}`:c('waiting');
    content.innerHTML=`
      <section class="panel auto-board-panel">
        <details class="board-question-navigation" ${navOpen?'open':''}><summary><span>${escapeHtml(c('questionList'))}</span><strong>${selectedIndex+1}/${questions.length}</strong></summary><div class="board-question-nav">${tabs}</div></details>
        <div class="board-meta"><span class="badge ${active>1?'success':''}">${escapeHtml(status)}</span></div>
        ${renderInstitutionHeading(question,{tag:'h1',board:true})}
        ${renderQuestionMedia(question,{showSymbol:false})}
        ${renderMatrixButtons(question,'',{counts,total:records.length,reveal,showDistribution:true,disabled:true})}
        ${boardInsight({reveal,active,accuracy,wrong,question})}
      </section>`;
    const navigation=content.querySelector('.board-question-navigation');if(navigation)navigation.ontoggle=()=>{navOpen=navigation.open};
    content.querySelectorAll('[data-board-index]').forEach((button)=>{
      button.onclick=()=>{followLatest=false;selectedIndex=Number(button.dataset.boardIndex);navOpen=false;render()};
    });
  }
  function subscribe(){
    cleanupSubscriptions();
    presence={};responses={};selectedIndex=null;followLatest=true;navOpen=false;
    if(backend.mode!=='cloud'){
      content.innerHTML=`<div class="panel notice warning">${escapeHtml(c('cloudRequired'))}</div>`;
      container.querySelector('#autoBoardParticipants').textContent='0';
      container.querySelector('#autoBoardUnique').textContent='0';
      return;
    }
    const {roomKey}=roomQuestionSet(group);
    unsubPresence=backend.subscribeAutomaticPresence(roomKey,(value)=>{presence=value;render()});
    unsubResponses=backend.subscribeAutomaticResponses(roomKey,(value)=>{responses=value;render()});
    render();
  }
  container.querySelector('#autoBoardGroup').onchange=(event)=>{group=event.target.value;subscribe()};
  subscribe();
  const timer=setInterval(render,1000);
  return ()=>{disposed=true;cleanupSubscriptions();clearInterval(timer)};
}
