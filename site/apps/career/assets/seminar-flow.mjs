import {getLanguage,translate} from './i18n.mjs';
import {authorityEmblem} from './authority-symbols.mjs';
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
export function createSeminarFlow({getResult,toast}){
  let feed=null,loaded=false,loading=false,loadError=false,lastRoute='test',opening=false;
  const top=()=>getResult()?.ranked.filter(a=>!['fund','corporation'].includes(a.entityType)).slice(0,3)||[];
  const display=text=>E(translate(text||''));
  const progress=document.createElement('div');
  progress.className='seminar-progress';progress.setAttribute('data-no-i18n','');
  progress.setAttribute('role','list');
  document.querySelector('#main-content').prepend(progress);

  function updateLabels(){
    progress.setAttribute('aria-label',L('Последовательность занятия','Seminar steps','课堂步骤'));
    progress.innerHTML=[L('Профориентация','Career interests','职业倾向'),L('Вакансии','Vacancies','职位'),L('Тест','Knowledge test','知识测试')].map((label,index)=>`<div role="listitem" class="seminar-step ${index===(lastRoute==='results'?1:0)?'is-current':''} ${index===0&&lastRoute==='results'?'is-done':''}" ${index===(lastRoute==='results'?1:0)?'aria-current="step"':''}><span>${index===0&&lastRoute==='results'?I('check'):index+1}</span><strong>${label}</strong></div>`).join('');
    const calculate=document.querySelector('#calculate-button');
    calculate.setAttribute('data-no-i18n','');
    calculate.innerHTML=L('Посмотреть результат и вакансии','View my result and vacancies','查看结果与职位')+I('arrow-right');
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
      return `<section class="seminar-vacancy-group"><h3>${display(a.shortName||a.name)}</h3>${loading&&!loaded?`<p class="seminar-vacancy-empty">${L('Подбираем объявления…','Finding announcements…','正在查找公告……')}</p>`:found.length?`<div class="seminar-vacancy-grid">${found.map(vacancyCard).join('')}</div>`:`<p class="seminar-vacancy-empty">${emptyText}</p>`}</section>`;
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

  function renderResults(){
    const result=getResult();if(!result)return;
    const institutions=top(),root=document.querySelector('#results-root');
    root.setAttribute('data-no-i18n','');
    root.innerHTML=`<header class="seminar-results-heading"><h1>${L('Ваши направления работы','Your career directions','你的职业方向')}</h1><p>${L('По Вашим интересам подобраны три органа власти. Рекомендации помогают выбрать направления для знакомства.','Three authorities have been selected from your interests. The recommendations suggest career areas to explore.','根据你的兴趣推荐了三个政府机关，供你了解相关职业方向。')}</p>${result.roleProfile.flat||result.roleProfile.lowInterest?`<p class="seminar-profile-note">${result.roleProfile.lowInterest?L('Вы пока не выразили устойчивого интереса к предложенным видам работы. Используйте подборку для знакомства с профессиями.','You have not yet expressed a strong interest in these types of work. Use the selection to explore careers.','你尚未对这些工作类型表现出较强兴趣。可利用推荐列表了解职业。'):L('Ваши оценки близки друг к другу, поэтому в подборке особенно важны выбранные сферы деятельности.','Your interest ratings are similar, so your chosen policy areas are especially relevant to this selection.','你的兴趣评分较接近，因此所选政策领域对本次推荐尤为重要。')}</p>`:''}</header><div class="seminar-authorities">${institutions.map((a,index)=>`<article class="seminar-authority"><div class="seminar-authority-heading">${authorityEmblem(a,'compact')}<div><span class="seminar-rank">${index+1}</span><h2>${display(a.shortName||a.name)}</h2></div></div><p>${display(a.mission)}</p><div class="seminar-track"><span>${L('Направление работы','Type of work','工作方向')}</span><strong>${display(a.track?.title||'')}</strong></div></article>`).join('')}</div><section class="seminar-vacancy-section"><h2>${L('Изучите вакансии','Explore the vacancies','了解职位')}</h2><p class="seminar-task">${L('Откройте две подходящие вакансии и сравните обязанности, требования к образованию и стажу. Определите, что Вам нужно освоить для поступления на такую должность.','Open two relevant vacancies and compare their duties, education and experience requirements. Identify what you need to learn to qualify for such a position.','打开两个相关职位，比较职责、学历与工作经历要求，并思考入职前需要掌握哪些知识。')}</p><div id="seminar-vacancies"></div></section><div class="seminar-next"><p>${L('После изучения вакансий перейдите к тесту знаний о государственной службе.','After exploring the vacancies, continue to the public-service knowledge test.','了解职位后，请继续完成公务知识测试。')}</p><button type="button" class="button button-primary button-large" id="seminar-open-knowledge">${L('Перейти к тесту','Continue to the test','进入知识测试')}${I('arrow-right')}</button></div>`;
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
