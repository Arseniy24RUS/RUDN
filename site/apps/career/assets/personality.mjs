import {getLanguage} from './i18n.mjs';
import {PERSONALITY_ITEMS,PERSONALITY_DOMAINS,PERSONALITY_FACETS,PERSONALITY_METHOD,scorePersonality} from './personality-model.mjs';
import {WORK_TRAITS,expressionBand,suggestTeamRoles} from './personality-insights.mjs';

const PAGE_SIZE=10;
const PAGE_COUNT=PERSONALITY_ITEMS.length/PAGE_SIZE;
const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const L=(ru,en,zh)=>getLanguage()==='ru'?ru:getLanguage()==='en'?en:zh;
const text=values=>L(...values);
const label=value=>getLanguage()==='ru'?value.name:getLanguage()==='en'?value.en:value.zh;
const number=value=>Number(value).toLocaleString(getLanguage()==='zh-Hans'?'zh-CN':getLanguage(),{minimumFractionDigits:1,maximumFractionDigits:2});
const facetById=new Map(PERSONALITY_FACETS.map(facet=>[facet.id,facet]));
const validAnswer=value=>Number.isInteger(value)&&value>=1&&value<=5;
const answerLabels=()=>L(
  ['Совершенно неверно','Скорее неверно','Ни верно, ни неверно','Скорее верно','Совершенно верно'],
  ['Very inaccurate','Moderately inaccurate','Neither accurate nor inaccurate','Moderately accurate','Very accurate'],
  ['完全不符合','比较不符合','既不符合也不违背','比较符合','完全符合']);
const domainCopy={
  C:{title:['Добросовестность','Conscientiousness','尽责性'],description:['Как Вы организуете работу, соблюдаете обязательства и поддерживаете усилия.','How you organise work, honour commitments and sustain effort.','你如何安排工作、履行承诺并持续付出努力。']},
  E:{title:['Экстраверсия','Extraversion','外向性'],description:['Насколько Вам свойственны активное общение, инициативность и энергичный темп.','Your tendency towards active interaction, initiative and an energetic pace.','你对积极交流、主动行动和活跃节奏的偏好。']},
  A:{title:['Доброжелательность','Agreeableness','宜人性'],description:['Как Вы относитесь к другим людям, сотрудничеству и взаимной поддержке.','Your orientation towards other people, cooperation and mutual support.','你对他人、合作以及相互支持的态度。']},
  O:{title:['Открытость опыту','Openness to experience','经验开放性'],description:['Ваш интерес к новым впечатлениям, идеям и различным способам действий.','Your interest in new experiences, ideas and different ways of doing things.','你对新体验、新想法和不同做事方式的兴趣。']},
  N:{title:['Эмоциональная чувствительность','Emotional sensitivity','情绪敏感性'],description:['Насколько часто Вы отмечаете напряжение, переживания и эмоциональные колебания.','How often you report tension, worries and emotional fluctuations.','你感受到紧张、担忧和情绪波动的频繁程度。']}
};

function meter(value,name){
  return `<div class="personality-meter" role="meter" aria-label="${E(name)}" aria-valuemin="1" aria-valuemax="5" aria-valuenow="${value}" aria-valuetext="${E(number(value)+' '+L('из 5','out of 5','分，满分5分'))}"><span style="width:${(value-1)*25}%"></span></div>`;
}

/** Only the dedicated, owner-scoped browser store receives this state.
 * It is never passed to the career questionnaire, backend, grades or telemetry.
 */
export function createPersonality({navigate,continueCareer}){
  const storage=__careerHost.personalityStorage;
  let state={schema:1,method:PERSONALITY_METHOD.id,version:PERSONALITY_METHOD.version,answers:{},page:0,completedAt:null};
  let currentRoute='',profile=null,dirty=false,saveFailed=false,saveConflict=false;
  try{
    const saved=JSON.parse(storage.getItem()||'null');
    if(saved?.schema===1&&saved.method===state.method&&saved.version===state.version&&saved.answers&&typeof saved.answers==='object'){
      state.answers=Object.fromEntries(PERSONALITY_ITEMS.filter(item=>validAnswer(saved.answers[item.id])).map(item=>[item.id,saved.answers[item.id]]));
      state.page=Number.isInteger(saved.page)?Math.max(0,Math.min(PAGE_COUNT-1,saved.page)):0;
      if(Object.keys(state.answers).length===PERSONALITY_ITEMS.length&&typeof saved.completedAt==='string'&&Number.isFinite(Date.parse(saved.completedAt))){
        profile=scorePersonality(state.answers);state.completedAt=saved.completedAt;
      }else{
        const first=PERSONALITY_ITEMS.findIndex(item=>!validAnswer(state.answers[item.id]));
        if(first>=0)state.page=Math.min(state.page,Math.floor(first/PAGE_SIZE));
      }
    }
  }catch{saveFailed=true;}

  const isComplete=()=>Boolean(state.completedAt&&profile);
  const currentItems=()=>PERSONALITY_ITEMS.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE);
  const answeredCount=()=>Object.keys(state.answers).length;
  const pageComplete=()=>currentItems().every(item=>validAnswer(state.answers[item.id]));

  function save(){
    if(!dirty)return !saveFailed;
    try{storage.setItem(JSON.stringify(state));dirty=false;saveFailed=false;saveConflict=false;}
    catch(error){saveFailed=true;saveConflict=error?.code==='storage/conflict';}
    showSaveStatus();return !saveFailed;
  }
  function showSaveStatus(){
    for(const node of document.querySelectorAll('.personality-save-status')){
      node.hidden=!saveFailed;
      node.textContent=saveConflict
        ?L('Ответы изменены в другой вкладке. Продолжите там или обновите эту страницу, чтобы загрузить сохранённые ответы.','Answers changed in another tab. Continue there or reload this page to load the saved answers.','答案已在另一个标签页中更改。请在那里继续，或刷新本页以载入保存的答案。')
        :L('Не удалось сохранить ответы на устройстве. Оставьте эту вкладку открытой.','Answers could not be saved on this device. Keep this tab open.','无法在此设备上保存答案。请保持此标签页打开。');
    }
  }
  function updateProgress(){
    const root=document.querySelector('#personality-root');
    const counter=root.querySelector('#personality-counter');
    if(counter)counter.textContent=L(`Ответов: ${answeredCount()} из 120`,`Answered: ${answeredCount()} of 120`,`已回答：${answeredCount()} / 120`);
    const progress=root.querySelector('progress');if(progress)progress.value=answeredCount();
    const next=root.querySelector('#personality-next');if(next)next.disabled=!pageComplete();
  }
  function focusPage(){
    window.scrollTo({top:0,behavior:'instant'});
    document.querySelector('#personality-title')?.focus({preventScroll:true});
  }
  function renderQuestionnaire(){
    const root=document.querySelector('#personality-root'),labels=answerLabels();
    root.lang=getLanguage();
    root.innerHTML=`<header class="personality-heading"><h1 id="personality-title" tabindex="-1">${L('Личностный профиль','Personality profile','人格特征')}</h1><p>${L('Оцените, насколько каждое утверждение описывает Вас в обычной жизни. Ориентируйтесь на своё привычное поведение.','Rate how accurately each statement describes you in everyday life. Think about your usual behaviour.','请判断每个陈述在多大程度上符合日常生活中的你，并以平时的行为为依据。')}</p></header>
      <div class="personality-progress"><div><span id="personality-counter" aria-live="polite"></span><span>${L(`Страница ${state.page+1} из ${PAGE_COUNT}`,`Page ${state.page+1} of ${PAGE_COUNT}`,`第${state.page+1}页，共${PAGE_COUNT}页`)}</span></div><progress max="120" value="${answeredCount()}" aria-label="${L('Прогресс личностного теста','Personality test progress','人格测试进度')}"></progress></div>
      <div class="personality-scale" aria-hidden="true">${labels.map((caption,index)=>`<div><b>${index+1}</b><span>${E(caption)}</span></div>`).join('')}</div>
      <form id="personality-form"><div class="personality-items">${currentItems().map(item=>`<fieldset class="personality-item${validAnswer(state.answers[item.id])?' is-answered':''}"><legend><span>${item.order}.</span> ${E(getLanguage()==='ru'?item.text:getLanguage()==='en'?item.en:item.zh)}</legend><div class="personality-options">${labels.map((caption,index)=>`<label class="personality-choice" title="${E(caption)}"><input type="radio" name="${item.id}" data-personality-item="${item.id}" value="${index+1}" ${state.answers[item.id]===index+1?'checked':''} required><span class="personality-choice-number" aria-hidden="true">${index+1}</span><span class="personality-sr-only">${E(caption)}</span></label>`).join('')}</div><p class="personality-selected" aria-live="polite">${validAnswer(state.answers[item.id])?E(labels[state.answers[item.id]-1]):'&nbsp;'}</p></fieldset>`).join('')}</div>
      <p class="personality-save-status" role="status" hidden></p><div class="personality-actions"><button type="button" id="personality-back" class="button button-secondary" ${state.page===0?'hidden':''}>${L('Назад','Back','上一步')}</button><button type="submit" id="personality-next" class="button button-primary" disabled>${state.page===PAGE_COUNT-1?L('Мои результаты','My results','我的结果'):L('Далее','Next','下一步')}</button></div></form>`;
    root.querySelector('#personality-form').addEventListener('change',event=>{
      const input=event.target.closest('input[data-personality-item]');if(!input)return;
      const value=Number(input.value);if(!validAnswer(value))return;
      if(state.answers[input.dataset.personalityItem]!==value){state.answers[input.dataset.personalityItem]=value;state.completedAt=null;profile=null;dirty=true;save();}
      const item=input.closest('.personality-item');item.classList.add('is-answered');item.querySelector('.personality-selected').textContent=answerLabels()[value-1];
      updateProgress();
    });
    root.querySelector('#personality-back').onclick=()=>{if(state.page>0){state.page--;dirty=true;save();renderQuestionnaire();focusPage();}};
    root.querySelector('#personality-form').addEventListener('submit',event=>{
      event.preventDefault();if(!pageComplete())return;
      if(state.page<PAGE_COUNT-1){state.page++;dirty=true;save();renderQuestionnaire();focusPage();return;}
      const first=PERSONALITY_ITEMS.findIndex(item=>!validAnswer(state.answers[item.id]));
      if(first>=0){state.page=Math.floor(first/PAGE_SIZE);dirty=true;save();renderQuestionnaire();focusPage();return;}
      profile=scorePersonality(state.answers);state.completedAt=new Date().toISOString();dirty=true;save();navigate('personality-results');
    });
    updateProgress();showSaveStatus();
  }

  function renderResults(){
    if(!isComplete()){navigate('personality');return;}
    const root=document.querySelector('#personality-results-root'),suggestions=suggestTeamRoles(profile);
    root.lang=getLanguage();
    const roleIntro=suggestions.kind==='balanced'
      ?L('Несколько способов участия в команде выражены сходным образом. Попробуйте разные роли и сравните, какие задачи дают Вам больше удовлетворения.','Several ways of contributing to a team are similarly expressed. Try different roles and compare which tasks you find more satisfying.','你在多种团队参与方式上表现相近。可以尝试不同角色，比较哪些任务更让你感到满意。')
      :suggestions.kind==='exploratory'
        ?L('По Вашим ответам пока не выделяется определённая командная роль. В ближайшем групповом задании попробуйте небольшую задачу по планированию, анализу или поддержке участников и оцените свои впечатления.','Your answers do not point clearly to a particular team role. In your next group task, try a small planning, analysis or support responsibility and reflect on the experience.','你的回答尚未显示出明确的团队角色倾向。下次小组任务中，可以尝试一项计划、分析或支持成员的具体工作，再体会自己的感受。')
        :L('Сочетания Ваших черт дают основания попробовать следующие способы участия в общей работе.','Your combination of traits suggests the following contributions to try in shared work.','根据你的特征组合，可以在共同工作中尝试以下参与方式。');
    root.innerHTML=`<header class="personality-heading personality-result-heading"><button type="button" id="personality-edit" class="personality-text-button">${L('К ответам','Back to answers','返回答案')}</button><h1>${L('Ваш стиль работы в команде','Your style of working in a team','你的团队工作风格')}</h1><p>${L('Баллы от 1 до 5 показывают выраженность черт в Ваших ответах. У каждого сочетания есть полезные стороны и задачи для развития.','Scores from 1 to 5 describe the traits expressed in your answers. Each combination has useful aspects and opportunities for development.','1至5分反映你的回答中各项特征的表现程度。每种组合都有有利之处和可以发展的方面。')}</p></header>
      <section class="personality-section" aria-labelledby="personality-work-title"><h2 id="personality-work-title">${L('Ответственность, инициатива и совместная работа','Responsibility, initiative and collaboration','责任、主动性与合作')}</h2><div class="personality-traits">${WORK_TRAITS.map(trait=>{
        const value=profile.facets[trait.facet].mean,title=text(trait.label);
        return `<article class="personality-trait" data-personality-facet="${trait.facet}" data-personality-score="${value}"><div class="personality-score-heading"><h3>${E(title)}</h3><strong>${number(value)}<small> / 5</small></strong></div>${meter(value,title)}<p>${E(text(trait[expressionBand(value)]))}</p></article>`;
      }).join('')}</div></section>
      <section class="personality-section" aria-labelledby="personality-roles-title"><h2 id="personality-roles-title">${L('Роли, которые стоит попробовать','Roles worth trying','值得尝试的团队角色')}</h2><p class="personality-section-lead">${roleIntro}</p>${suggestions.roles.length?`<div class="personality-roles">${suggestions.roles.map(role=>`<article class="personality-role" data-personality-role="${role.id}"><h3>${E(text(role.label))}</h3><p>${E(text(role.description))}</p><dl>${role.facets.map(id=>`<div><dt>${E(label(facetById.get(id)))}</dt><dd>${number(profile.facets[id].mean)} / 5</dd></div>`).join('')}</dl><p class="personality-role-action"><strong>${L('Попробуйте:','Try:','可以尝试：')}</strong> ${E(text(role.action))}</p></article>`).join('')}</div>`:''}</section>
      <section class="personality-section" aria-labelledby="personality-full-title"><h2 id="personality-full-title">${L('Полный личностный профиль','Your full personality profile','完整的人格特征')}</h2><div class="personality-domains">${['C','E','A','O','N'].map(id=>{
        const domain=PERSONALITY_DOMAINS.find(item=>item.id===id),copy=domainCopy[id],value=profile.domains[id].mean,title=text(copy.title);
        return `<article class="personality-domain" data-personality-domain="${id}" data-personality-score="${value}"><div class="personality-score-heading"><h3>${E(title)}</h3><strong>${number(value)}<small> / 5</small></strong></div>${meter(value,title)}<p>${E(text(copy.description))}</p><dl>${domain.facets.map(facet=>{
          const facetLabel=getLanguage()==='en'&&facet==='N3'?'Low mood':label(facetById.get(facet));
          return `<div data-personality-detail-facet="${facet}" data-personality-score="${profile.facets[facet].mean}"><dt>${E(facetLabel)}</dt><dd>${number(profile.facets[facet].mean)}<small> / 5</small></dd></div>`;
        }).join('')}</dl></article>`;
      }).join('')}</div></section>
      <p class="personality-method">${L('Методика:','Method:','方法：')} <a href="${PERSONALITY_METHOD.doi}" target="_blank" rel="noopener noreferrer">IPIP-NEO-120</a> (Johnson, 2014)${L(', редакция открытого перевода; роли в команде — учебная интерпретация шкал.','; team roles are an educational interpretation of the scales.','，采用开放译文的修订版本；团队角色是各项特征的教学性解读。')}</p>
      <p class="personality-save-status" role="status" hidden></p><div class="personality-actions personality-result-actions"><button type="button" id="personality-continue" class="button button-primary button-large">${L('Перейти к профориентации','Continue to career interests','继续职业兴趣测试')}</button></div>`;
    root.querySelector('#personality-edit').onclick=()=>{state.page=0;dirty=true;save();navigate('personality');};
    root.querySelector('#personality-continue').onclick=()=>{save();continueCareer();};
    showSaveStatus();
  }

  function render(route){
    currentRoute=route;
    document.body.classList.toggle('personality-active',route==='personality'||route==='personality-results');
    if(route==='personality')renderQuestionnaire();
    else if(route==='personality-results')renderResults();
  }
  document.addEventListener('app:language',()=>render(currentRoute));
  return {render,isComplete,flush:save,updateBusy:()=>saveFailed};
}
