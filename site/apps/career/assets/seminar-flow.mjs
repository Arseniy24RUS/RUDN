import {getLanguage,translate} from './i18n.mjs';
import {authorityEmblem} from './authority-symbols.mjs';
import {authorityName} from './authority-names.mjs';
import {storageKey,readLocal,writeLocal} from './storage.mjs';
import {loadJSON} from './loader.mjs';
import {PORTAL,FRESH_MS,validateFeed,selectVacancies} from './vacancies-model.mjs';

const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L=(ru,en,zh)=>getLanguage()==='ru'?ru:getLanguage()==='en'?en:zh;
const I=id=>`<svg aria-hidden="true"><use href="#i-${id}"></use></svg>`;
const date=value=>{
  if(!value)return '';
  try{return new Intl.DateTimeFormat(getLanguage()==='zh-Hans'?'zh-CN':getLanguage(),{dateStyle:'medium',timeZone:'Europe/Moscow'}).format(new Date(value));}
  catch{return '';}
};

/** Course presentation uses the existing questionnaire, scoring and source feed. */
export function createSeminarFlow({getResult,getProfileContext,radarSvg,toast}){
  let feed=null,loaded=false,loading=false,loadError=false,lastRoute='test',opening=false;
  const stageKey=storageKey('seminar-profile-stage-v1');
  let savedStage=null;
  try{savedStage=JSON.parse(readLocal(stageKey)||'null');}catch{}
  const stage=()=>savedStage?.recordId===getProfileContext().recordId&&savedStage?.view==='recommendations'?'recommendations':'profile';
  const top=()=>getResult()?.ranked.filter(a=>!['fund','corporation'].includes(a.entityType)).slice(0,3)||[];
  const display=text=>E(translate(text||''));
  const progress=document.createElement('div');
  progress.className='seminar-progress';progress.setAttribute('data-no-i18n','');
  progress.setAttribute('role','list');
  document.querySelector('#main-content').prepend(progress);

  function updateLabels(){
    progress.setAttribute('aria-label',L('Последовательность занятия','Seminar steps','课堂步骤'));
    const current=lastRoute==='results'?(stage()==='profile'?1:2):0;
    progress.innerHTML=[L('Профориентация','Career interests','职业倾向'),L('Мой профиль','My profile','我的画像'),L('Ведомства и вакансии','Authorities and vacancies','机关与职位'),L('Тест','Knowledge test','知识测试')].map((label,index)=>`<div role="listitem" class="seminar-step ${index===current?'is-current':''} ${index<current?'is-done':''}" ${index===current?'aria-current="step"':''}><span>${index<current?I('check'):index+1}</span><strong>${label}</strong></div>`).join('');
    const calculate=document.querySelector('#calculate-button');
    calculate.setAttribute('data-no-i18n','');
    calculate.innerHTML=L('Посмотреть мой профиль','View my profile','查看我的画像')+I('arrow-right');
    const explanation=document.querySelector('#view-conditions .workflow-heading p');
    explanation.setAttribute('data-no-i18n','');
    explanation.textContent=L('Отметьте, какие условия работы Вам подходят.','Select the working conditions that suit you.','请选择适合你的工作条件。');
    const storageWarning=document.querySelector('#storage-warning');
    storageWarning.setAttribute('data-no-i18n','');
    storageWarning.textContent=L('Ответы пока не сохранены. Оставьте вкладку открытой и проверьте соединение.','Answers have not been saved yet. Keep this tab open and check your connection.','答案尚未保存。请保持页面打开并检查网络连接。');
  }

  function sourceNote(){
    if(loading)return L('Загружаем вакансии…','Loading vacancies…','正在加载职位……');
    if(loadError||!feed?.lastSuccessAt)return L('Подборка временно недоступна. Изучите объявления на портале Госслужба.','The selection is temporarily unavailable. Browse the official civil service portal.','职位列表暂不可用。请查看公务员官方门户的公告。');
    const stale=Date.now()-Date.parse(feed.lastSuccessAt)>FRESH_MS;
    return `${L('Сведения от','Information retrieved on','信息获取于')} ${date(feed.lastSuccessAt).replace(/\.$/,'')}. ${stale?L('Приём документов необходимо уточнить на портале.','Check the portal for the current application status.','请在门户核实当前申请状态。'):L('Сроки и полные требования указаны в официальных объявлениях.','Official announcements contain deadlines and full requirements.','截止日期及完整要求以官方公告为准。')}`;
  }

  function vacancyCard(v){
    const labels={
      accepting:L('Приём в указанные сроки','Within the stated application period','处于所列申请期'),
      stale:L('Уточните актуальность на портале','Check current availability on the portal','请在门户核实当前状态'),
      verify:L('Уточните приём на портале','Check application status on the portal','请在门户核实接收状态'),
      upcoming:L('Приём ещё не начался','Applications have not started','尚未开始接受申请')
    };
    const fields=[
      [L('Место работы','Location','工作地点'),v.location],
      [L('Приём до','Apply by','申请截止'),date(v.deadline)],
      [L('Оплата','Pay','报酬'),v.salary],
      [L('Образование','Education','学历'),v.education],
      [L('Стаж','Experience','经历'),v.experience]
    ].filter(([,value])=>value);
    return `<article class="seminar-vacancy"><span class="seminar-vacancy-status">${labels[v.status]||labels.verify}</span><h4 lang="ru">${E(v.title)}</h4><p class="seminar-employer" lang="ru">${E(v.organization.name)}</p>${v.department?`<p lang="ru">${E(v.department)}</p>`:''}${v.organization.relation==='territorial'?`<p class="seminar-territorial">${L('Территориальный орган','Territorial authority','地方派出机关')}</p>`:''}<dl>${fields.map(([label,value])=>`<div><dt>${label}</dt><dd lang="ru">${E(value)}</dd></div>`).join('')}</dl><a href="${E(v.url)}" target="_blank" rel="noopener noreferrer" class="seminar-vacancy-link">${L('Открыть вакансию на Госслужбе','Open the official vacancy','打开官方职位')}${I('external')}</a></article>`;
  }

  function renderVacancies(){
    const root=document.querySelector('#seminar-vacancies');
    if(!root)return;
    const institutions=top();
    const items=feed&&!feed.testFixture?selectVacancies(feed,{authorityIds:institutions.map(a=>a.id),includeTerritorial:true}):[];
    root.innerHTML=`<p class="seminar-source-note" role="status">${E(sourceNote())}</p>${institutions.map(a=>{
      const found=items.filter(v=>v.organization.authorityId===a.id).slice(0,2);
      const emptyText=feed?L('В сохранённой подборке нет действующих объявлений этого органа. Проверьте вакансии на официальном портале по названию организации.','The saved selection has no current announcements for this authority. Search the official portal by the organisation name.','已保存的列表中没有该机关当前有效的公告。请按机构名称在官方门户搜索。'):L('Найдите объявления на официальном портале по названию организации.','Search the official portal by the organisation name.','请按机构名称在官方门户搜索公告。');
      return `<section class="seminar-vacancy-group"><h3>${E(authorityName(a))}</h3>${loading&&!loaded?`<p class="seminar-vacancy-empty">${L('Подбираем объявления…','Finding announcements…','正在查找公告……')}</p>`:found.length?`<div class="seminar-vacancy-grid">${found.map(vacancyCard).join('')}</div>`:`<p class="seminar-vacancy-empty">${emptyText}</p>`}</section>`;
    }).join('')}<a href="${PORTAL}/vacancy/" target="_blank" rel="noopener noreferrer" class="seminar-portal-link">${L('Поиск вакансий на Госслужбе','Search the official civil service portal','在公务员官方门户搜索职位')}${I('external')}</a>`;
  }

  async function loadVacancies(){
    if(loading||loaded)return;
    loading=true;renderVacancies();
    try{
      const result=await loadJSON('data/vacancies/gossluzhba.json',{timeout:10000,validate:value=>!validateFeed(value).length&&!value.testFixture});
      if(__careerHost.destroyed)return;
      feed=result;loadError=false;
    }catch{
      if(__careerHost.destroyed)return;
      loadError=true;
    }finally{
      loading=false;loaded=true;
      if(!__careerHost.destroyed)renderVacancies();
    }
  }

  function switchStage(view){
    savedStage={recordId:getProfileContext().recordId,view};
    try{writeLocal(stageKey,JSON.stringify(savedStage));}catch{}
    renderResults();updateLabels();
    window.scrollTo({top:0,behavior:'instant'});
    const heading=document.querySelector('#results-root h1');
    heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
  }

  function profileNote(result){
    if(result.roleProfile.lowInterest)return L('Вы пока не выразили устойчивого интереса к предложенным видам работы. Результат поможет познакомиться с ними и выбрать, что изучить подробнее.','You have not yet expressed a strong interest in these types of work. Use the result to explore them and decide what to learn about.','你尚未对这些工作类型表现出较强兴趣。可利用结果了解各类工作，选择想进一步探索的方向。');
    if(result.roleProfile.flat)return L('Ваши оценки видов работы близки друг к другу. При подборе ведомств особенно важны выбранные Вами сферы деятельности.','Your ratings of these types of work are similar. Your chosen policy areas are especially important when selecting authorities.','你对各类工作的评分较接近，因此在推荐机关时，你所选的政策领域尤为重要。');
    return L('Посмотрите, какие виды работы привлекают Вас больше, какие сферы интересны и какие условия Вам подходят.','Explore the work you find most interesting, your preferred policy areas and the conditions that suit you.','了解最吸引你的工作类型、感兴趣的政策领域，以及适合你的工作条件。');
  }

  function renderProfile(result,root){
    const context=getProfileContext();
    const scales=context.scales;
    const strongest=[...scales].sort((a,b)=>result.roleProfile.raw[b.id]-result.roleProfile.raw[a.id]).slice(0,3);
    const number=value=>Number(value).toLocaleString(getLanguage()==='zh-Hans'?'zh-CN':getLanguage(),{minimumFractionDigits:1,maximumFractionDigits:1});
    root.innerHTML=`<header class="seminar-results-heading"><h1>${L('Ваш профиль','Your profile','你的职业画像')}</h1><p>${profileNote(result)}</p></header>
      <section class="seminar-profile-card" aria-labelledby="seminar-interests-title">
        <h2 id="seminar-interests-title">${L('Интерес к видам работы','Interest in types of work','对各类工作的兴趣')}</h2>
        <p class="seminar-profile-caption">${L('От 1 до 5: чем дальше точка от центра, тем выше Ваш интерес. Это самооценка интересов, а не оценка способностей.','From 1 to 5: the farther a point is from the centre, the stronger your interest. This describes your interests, not your abilities.','评分为1至5分：点离中心越远，兴趣越强。这是兴趣自评，不是能力评价。')}</p>
        <div class="seminar-profile-chart"><div class="seminar-radar">${radarSvg(result.roleProfile,{numbered:true,label:L('Девять видов работы: интерес от 1 до 5','Nine types of work: interest from 1 to 5','九类工作：兴趣评分1至5分')})}</div>
          <ol class="seminar-profile-scores">${scales.map((scale,index)=>`<li><span class="seminar-scale-number">${index+1}</span><span>${display(scale.title)}</span><strong>${number(result.roleProfile.raw[scale.id])}<small> / 5</small></strong></li>`).join('')}</ol>
        </div>
      </section>
      ${!result.roleProfile.flat&&!result.roleProfile.lowInterest?`<section class="seminar-profile-section"><h2>${L('Что Вам ближе','Your leading interests','你的主要兴趣')}</h2><div class="seminar-strengths">${strongest.map(scale=>`<article><h3>${display(scale.title)}</h3><p>${display(scale.description)}</p></article>`).join('')}</div></section>`:''}
      <div class="seminar-preferences"><section class="seminar-profile-card"><h2>${L('Выбранные сферы','Your chosen policy areas','你选择的政策领域')}</h2><ol class="seminar-sector-list">${context.prioritySectors.map(id=>`<li>${display(context.sectors.find(sector=>sector.id===id)?.title||id)}</li>`).join('')}</ol></section>
      <section class="seminar-profile-card"><h2>${L('Подходящие условия','Your preferred conditions','适合你的工作条件')}</h2><dl class="seminar-condition-summary">${context.conditions.map(condition=>{const value=context.conditionValues[condition.id];return `<div><dt>${display(condition.title)}</dt><dd>${value<=2?display(condition.low):value>=4?display(condition.high):L('Средняя оценка: 3 из 5','Midpoint rating: 3 out of 5','中间评分：3分（满分5分）')}</dd></div>`;}).join('')}</dl></section></div>
      <div class="seminar-next"><p>${L('Ваши интересы, выбранные сферы и условия работы сопоставляются с направлениями деятельности ведомств. На следующем шаге Вы увидите рекомендации и сможете изучить вакансии.','Your interests, policy areas and working conditions are compared with authorities’ activities. The next step shows recommendations and vacancies to explore.','系统将你的兴趣、政策领域和工作条件与各机关的工作方向进行匹配。下一步将展示推荐机关及其职位。')}</p><button type="button" class="button button-primary button-large" id="seminar-show-authorities">${L('Посмотреть ведомства и вакансии','View authorities and vacancies','查看机关与职位')}${I('arrow-right')}</button></div>`;
    root.querySelector('#seminar-show-authorities').onclick=()=>switchStage('recommendations');
  }

  function authorityDetails(authority){
    const paragraphs=Array.isArray(authority.descriptionParagraphs)?authority.descriptionParagraphs.filter(value=>typeof value==='string'&&value.trim()).slice(0,3):[];
    if(!paragraphs.length)return '';
    const sources=(authority.descriptionSources||[]).filter(source=>/^https:\/\//.test(source.url||''));
    return `<details class="seminar-authority-details"><summary>${L('Подробнее об органе','About this authority','了解该机关')}</summary><div>${paragraphs.map(text=>`<p${getLanguage()!=='ru'&&translate(text)===text?' lang="ru"':''}>${display(text)}</p>`).join('')}${sources.map(source=>`<a href="${E(source.url)}" target="_blank" rel="noopener noreferrer">${L('Официальная информация','Official information','官方信息')}${I('external')}</a>`).join('')}</div></details>`;
  }

  function authorityCard(authority,index,result){
    const context=getProfileContext();
    const matches=context.prioritySectors.filter(id=>(authority.pathSectors||authority.sectors||[]).some(sector=>sector.id===id));
    return `<article class="seminar-authority"><div class="seminar-authority-heading">${authorityEmblem(authority,'compact')}<div><span class="seminar-rank">${index+1}</span><h2>${E(authorityName(authority))}</h2></div></div><p>${display(authority.mission)}</p>${authorityDetails(authority)}<div class="seminar-track"><span>${result.roleProfile.flat||result.roleProfile.lowInterest?L('Вид работы для знакомства','Type of work to explore','可了解的工作类型'):L('Близкий Вам вид работы','A type of work close to your interests','与你兴趣相近的工作类型')}</span><strong>${display(authority.track?.title||'')}</strong>${matches.length?`<p>${L('Выбранные Вами сферы','Your chosen policy areas','你选择的政策领域')}: ${matches.map(id=>display(context.sectors.find(sector=>sector.id===id)?.title||id)).join(', ')}.</p>`:''}</div></article>`;
  }

  function renderResults(){
    const result=getResult();if(!result)return;
    const institutions=top(),root=document.querySelector('#results-root');
    root.setAttribute('data-no-i18n','');
    if(stage()==='profile'){renderProfile(result,root);return;}
    root.innerHTML=`<header class="seminar-results-heading"><button type="button" class="seminar-back-profile" id="seminar-back-profile">${I('arrow-left')}${L('Вернуться к моему профилю','Back to my profile','返回我的画像')}</button><h1>${L('Ваши направления работы','Your career directions','你的职业方向')}</h1><p>${L('По Вашему профилю подобраны три органа власти. Сопоставьте их задачи со своими интересами, затем изучите вакансии.','Three authorities have been selected from your profile. Compare their activities with your interests, then explore the vacancies.','根据你的画像推荐了三个政府机关。请将其职责与你的兴趣进行比较，再了解相关职位。')}</p></header><div class="seminar-authorities">${institutions.map((authority,index)=>authorityCard(authority,index,result)).join('')}</div><section class="seminar-vacancy-section"><h2>${L('Изучите вакансии','Explore the vacancies','了解职位')}</h2><p class="seminar-task">${L('Откройте две подходящие вакансии и сравните обязанности, требования к образованию и стажу. Определите, что Вам нужно освоить для поступления на такую должность.','Open two relevant vacancies and compare their duties, education and experience requirements. Identify what you need to learn to qualify for such a position.','打开两个相关职位，比较职责、学历与工作经历要求，并思考入职前需要掌握哪些知识。')}</p><div id="seminar-vacancies"></div></section><div class="seminar-next"><p>${L('После изучения вакансий перейдите к тесту знаний о государственной службе.','After exploring the vacancies, continue to the public-service knowledge test.','了解职位后，请继续完成公务知识测试。')}</p><button type="button" class="button button-primary button-large" id="seminar-open-knowledge">${L('Перейти к тесту','Continue to the test','进入知识测试')}${I('arrow-right')}</button></div>`;
    root.querySelector('#seminar-back-profile').onclick=()=>switchStage('profile');
    root.querySelector('#seminar-open-knowledge').onclick=async()=>{
      if(opening)return;
      opening=true;
      const button=root.querySelector('#seminar-open-knowledge');button.disabled=true;
      try{await __careerHost.openKnowledge();}
      catch{toast(L('Не удалось открыть тест. Повторите переход.','The test could not be opened. Please try again.','无法打开测试，请重试。'));}
      finally{opening=false;if(button.isConnected)button.disabled=false;}
    };
    renderVacancies();void loadVacancies();
  }

  document.addEventListener('app:language',()=>{updateLabels();if(lastRoute==='results')renderResults();});
  updateLabels();
  return {
    renderResults,
    render(route){lastRoute=route;updateLabels();},
    updateBusy:()=>loading||opening
  };
}
