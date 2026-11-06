import {getLanguage,translate} from './i18n.mjs';
import {authorityEmblem} from './authority-symbols.mjs';
import {authorityName} from './authority-names.mjs';
import {storageKey,readLocal,writeLocal} from './storage.mjs';
import {loadJSON} from './loader.mjs';
import {createEmployerVacancyBank,vacancyBankStatus,platformEmployerId} from './employer-vacancies-bank.mjs';
import {PORTAL,FRESH_MS,validateFeed,currentStatus,normalizeName} from './vacancies-model.mjs';
import {createRegionPicker} from './region-picker.mjs';
import {createWishSortable} from './wish-sortable.mjs';
import {expandTerritorialCatalog,mergeTerritorialAuthorityDetails} from './territorial-catalog.mjs';
import {sanitizeJourneyPreferences,rankJourneyAuthorities,buildAuthorityDevelopment,buildVacancyRequirements,summarizeVacancyAssessment,requirementStateFromText} from './career-journey-model.mjs';
import {E,L,display,icon as I,number,date,safeURL,regionName,groupLabel,levelLabel,requirementRadar,requirementBars} from './journey-visuals.mjs';

const JOURNEY_SCHEMA=1;
const DEFAULT_REGION='ru-77';
const preferenceRoutes=new Set(['test','sectors','conditions','results']);
const statuses=new Set(['met','gap']);
const isRecord=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const safeText=(value,max=20000)=>typeof value==='string'?value.trim().slice(0,max):'';

/** Course-only journey. It never changes career scoring or personality storage. */
export function createSeminarFlow({data,getResult,getProfileContext,getInputs,navigate,resolveResumeRoute,radarSvg,toast}){
  const key=storageKey('career-journey-v1');
  let saved;
  try{saved=JSON.parse(readLocal(key)||'null');}catch{}
  let journey={schemaVersion:JOURNEY_SCHEMA,regionIds:[DEFAULT_REGION],desiredIds:[],confirmed:false,assessments:{},customVacancies:[],selectedVacancyId:null,view:'profile',resultRecordId:null,comparisonId:null};
  if(isRecord(saved)&&saved.schemaVersion===JOURNEY_SCHEMA){
    journey={...journey,...saved,assessments:isRecord(saved.assessments)?Object.fromEntries(Object.entries(saved.assessments).filter(([,value])=>isRecord(value))):{},customVacancies:Array.isArray(saved.customVacancies)?saved.customVacancies.slice(0,20):[]};
    if(!['profile','recommendations','requirements','summary'].includes(journey.view))journey.view='profile';
  }
  let regions=[],territorial=[],institutions=[...data.authorities],framework={trackProfiles:[]},competencies=[];
  let catalogLoaded=false,catalogLoading=false,catalogError=false,positionsLoaded=false,positionsLoading=false,positionsError=false,feed=null,positions=[];
  let lastRoute='personality',pendingRoute=null,manualSaveTimer=null,picker=null,wishSorter=null,opening=false,dirty=false,rankingCache=null,catalogGeneration=0;
  let authorityQuery='',authorityScope='',authorityLimit=24,vacancyQuery='',vacancyEmployer='',vacancyLimit=12;
  const rolePanelStates=new Map();
  const vacancyBank=createEmployerVacancyBank();
  vacancyBank.subscribe(id=>{if(!__careerHost.destroyed&&lastRoute==='results')document.querySelectorAll('[data-authority-roles]').forEach(panel=>{const state=rolePanelState(panel.dataset.rolePanel);if(bankId(state.bankAuthorityId||panel.dataset.authorityRoles)===id)renderEmployerVacancies(panel);});});
  const root=()=>document.querySelector('#results-root');
  const preferencesRoot=()=>document.querySelector('#journey-preferences-root');
  const byId=()=>new Map(institutions.map(a=>[a.id,a]));
  const selectedRegions=()=>regions.filter(region=>journey.regionIds.includes(region.id));
  const visibleInstitutions=()=>institutions.filter(a=>!a.regionId||journey.regionIds.includes(a.regionId));
  const progress=document.createElement('div');
  progress.className='seminar-progress journey-progress';progress.setAttribute('data-no-i18n','');progress.setAttribute('role','list');
  document.querySelector('#main-content').prepend(progress);

  function save(){
    if(manualSaveTimer){clearTimeout(manualSaveTimer);manualSaveTimer=null;}
    journey.updatedAt=new Date().toISOString();
    try{writeLocal(key,JSON.stringify(journey));dirty=false;return true;}
    catch{dirty=true;toast(L('Не удалось сохранить выбор. Оставьте страницу открытой.','Your choices could not be saved. Keep this page open.','无法保存选择，请保持此页面打开。'));return false;}
  }
  function invalidateRanking(){rankingCache=null;}
  function guardRoute(route){
    if(preferenceRoutes.has(route)&&!isReady()){
      // A confirmed saved journey can resume once its employer IDs have been
      // validated against the asynchronously loaded catalogue.
      if(!catalogLoaded&&journey.confirmed===true&&Array.isArray(journey.desiredIds)&&journey.desiredIds.length===3)pendingRoute=route;
      return 'preferences';
    }
    pendingRoute=null;
    return route;
  }
  function isReady(){return catalogLoaded&&journey.confirmed===true&&journey.desiredIds.length===3;}
  function stage(){
    if(journey.resultRecordId!==getProfileContext().recordId)return 'profile';
    return journey.view;
  }
  function updateLabels(){
    progress.setAttribute('aria-label',L('Последовательность занятия','Seminar steps','课堂步骤'));
    const current=['personality','personality-results'].includes(lastRoute)?0:lastRoute==='preferences'?1:lastRoute==='results'?(stage()==='requirements'||stage()==='summary'?4:3):2;
    const labels=[L('Личностный профиль','Personality','人格特征'),L('Мои цели','My choices','我的目标'),L('Профориентация','Career interests','职业兴趣'),L('Рекомендации','Recommendations','推荐'),L('План развития','Development plan','发展计划'),L('Тест знаний','Knowledge test','知识测试')];
    progress.innerHTML=labels.map((label,index)=>`<div role="listitem" class="seminar-step ${index===current?'is-current':''} ${index<current?'is-done':''}" ${index===current?'aria-current="step"':''}><span>${index<current?I('check'):index+1}</span><strong>${label}</strong></div>`).join('');
    const calculate=document.querySelector('#calculate-button');
    calculate.setAttribute('data-no-i18n','');calculate.innerHTML=L('Посмотреть мой профиль','View my profile','查看我的画像')+I('arrow-right');
    const explanation=document.querySelector('#view-conditions .workflow-heading p');
    explanation.setAttribute('data-no-i18n','');explanation.textContent=L('Отметьте, какие условия работы Вам подходят.','Select the working conditions that suit you.','请选择适合你的工作条件。');
    const storageWarning=document.querySelector('#storage-warning');storageWarning.setAttribute('data-no-i18n','');
    storageWarning.textContent=L('Ответы пока не сохранены. Оставьте вкладку открытой и проверьте соединение.','Answers have not been saved yet. Keep this tab open and check your connection.','答案尚未保存。请保持页面打开并检查网络连接。');
  }
  async function loadCatalog(){
    if(catalogLoading)return;
    catalogLoading=true;catalogError=false;const ticket=++catalogGeneration;
    try{
      const values=await Promise.all([
        loadJSON('data/territories.json',{validate:v=>Array.isArray(v)&&v.length===89&&new Set(v.map(x=>x.id)).size===89}),
        loadJSON('data/territorial-authorities.json',{validate:v=>Array.isArray(v)||Array.isArray(v?.authorities)}),
        loadJSON('data/career-framework.json',{validate:v=>Array.isArray(v?.trackProfiles)}),
        loadJSON('data/competencies.json',{validate:Array.isArray})
      ]);
      if(__careerHost.destroyed||ticket!==catalogGeneration)return;
      regions=values[0];territorial=expandTerritorialCatalog(values[1]);
      institutions=[...data.authorities,...territorial.filter(a=>!data.authorities.some(base=>base.id===a.id))];
      prepareManualDrafts();
      framework=values[2];competencies=values[3];
      const clean=sanitizeJourneyPreferences(journey,{regions,authorities:institutions,defaultRegionId:DEFAULT_REGION});
      journey={...journey,...clean};catalogLoaded=true;invalidateRanking();
    }catch{if(!__careerHost.destroyed)catalogError=true;}
    finally{
      catalogLoading=false;
      if(!__careerHost.destroyed){
        if(lastRoute==='preferences'&&catalogLoaded&&pendingRoute&&isReady()){
          const resume=pendingRoute;pendingRoute=null;navigate(resume);
        }else if(lastRoute==='preferences')renderPreferences();
        else if(lastRoute==='results')renderResults();
      }
    }
  }
  function changePreferences(){journey.confirmed=false;save();navigate('preferences');}
  function setRegions(ids){
    const before=new Set(journey.desiredIds),previousVacancy=findSelectedVacancy()||journey.selectedSnapshot;
    journey.regionIds=[...ids];
    const clean=sanitizeJourneyPreferences({...journey,confirmed:false},{regions,authorities:institutions,defaultRegionId:DEFAULT_REGION});
    journey={...journey,...clean};invalidateRanking();
    if(journey.selectedVacancyId){
      if(previousVacancy?.regionId&&!ids.includes(previousVacancy.regionId)){journey.selectedVacancyId=null;journey.selectedSnapshot=null;}
    }
    save();authorityLimit=24;
    if(authorityScope&&!ids.includes(authorityScope)&&authorityScope!=='federal')authorityScope='';
    renderDesiredChoices();renderAuthorityOptions();renderAuthorityScope();updatePreferenceNext();
    if(before.size>journey.desiredIds.length)toast(L('Органы из снятых территорий убраны из желаемых. Выберите замену.','Employers from deselected territories were removed from your choices. Choose a replacement.','已取消地区的机构已从意向中移除，请选择替代机构。'));
  }
  function renderPreferences(){
    const target=preferencesRoot();if(!target)return;
    picker?.destroy();picker=null;wishSorter?.destroy();wishSorter=null;target.setAttribute('data-no-i18n','');
    if(!catalogLoaded){
      target.innerHTML=`<header class="seminar-results-heading"><h1>${L('Где и кем Вы хотите работать','Where would you like to work?','你希望在哪里工作？')}</h1></header><p role="status">${catalogError?L('Не удалось загрузить каталог. Повторите загрузку.','The catalogue could not be loaded. Please try again.','目录加载失败，请重试。'):L('Загружаем территории и органы власти…','Loading territories and employers…','正在加载地区和机构……')}</p>${catalogError?`<button type="button" class="button button-primary" id="journey-retry-catalog">${L('Повторить','Retry','重试')}</button>`:''}`;
      target.querySelector('#journey-retry-catalog')?.addEventListener('click',()=>{void loadCatalog();renderPreferences();});return;
    }
    target.innerHTML=`<header class="seminar-results-heading"><h1>${L('Где и кем Вы хотите работать','Where would you like to work?','你希望在哪里工作？')}</h1><p>${L('Сначала выберите территории, затем три органа власти или работодателя публичного сектора в порядке Вашего предпочтения. После теста сравним Ваш выбор с рекомендациями.','Choose territories, then rank three public authorities or public-sector employers in order of preference. After the questionnaire, compare your choices with the recommendations.','先选择地区，再按意愿顺序选择三个政府机关或公共部门雇主。完成测试后，可将意向与推荐进行比较。')}</p></header>
      <section class="journey-panel" aria-labelledby="journey-regions-heading"><h2 id="journey-regions-heading">${L('Территории работы','Work territories','工作地区')}</h2><div id="journey-regions"></div></section>
      <section class="journey-panel" aria-labelledby="journey-wishes-heading"><h2 id="journey-wishes-heading">${L('Три желаемых места работы','Three preferred employers','三个意向工作单位')}</h2><p class="journey-muted" id="journey-wish-sort-help">${L('Позиция 1 — самый желаемый вариант. Перетяните выбранный орган за ручку с точками. С клавиатуры: пробел или Enter — взять и отпустить, ↑ и ↓ — переместить, Esc — отменить.','Position 1 is your first choice. Drag a selected employer by its dotted handle. Keyboard: Space or Enter to pick up and drop, ↑ and ↓ to move, Esc to cancel.','第1位为首选。拖动点状手柄调整已选机构的顺序。键盘：空格或 Enter 拿起和放下，↑ 和 ↓ 移动，Esc 取消。')}</p><div id="journey-desired-choices"></div><p class="journey-sort-status" data-wish-sort-status role="status" aria-live="polite" aria-atomic="true"></p>
      <div class="journey-search-row"><label for="journey-authority-search">${L('Найти орган или организацию','Find an authority or employer','查找机关或机构')}<input type="search" id="journey-authority-search" autocomplete="off" placeholder="${E(L('Название или сфера деятельности','Name or policy area','名称或工作领域'))}" value="${E(authorityQuery)}"></label><label for="journey-authority-scope">${L('Уровень и территория','Level and territory','层级与地区')}<select id="journey-authority-scope"></select></label></div><div id="journey-authority-options"></div></section>
      <div class="seminar-next"><button type="button" class="button button-secondary" id="journey-back-personality">${I('arrow-left')}${L('Личностный профиль','Personality profile','人格特征')}</button><span id="journey-preference-status" role="status"></span><button type="button" class="button button-primary button-large" id="journey-preferences-next">${L('Перейти к вопросам','Continue to the questions','进入问卷')}${I('arrow-right')}</button></div>`;
    picker=createRegionPicker({root:target.querySelector('#journey-regions'),regions,selectedIds:journey.regionIds,onChange:setRegions,getLanguage});
    renderDesiredChoices();renderAuthorityScope();renderAuthorityOptions();updatePreferenceNext();
    target.querySelector('#journey-authority-search').addEventListener('input',event=>{authorityQuery=event.target.value;authorityLimit=24;renderAuthorityOptions();});
    target.querySelector('#journey-authority-scope').addEventListener('change',event=>{authorityScope=event.target.value;authorityLimit=24;renderAuthorityOptions();});
    target.querySelector('#journey-back-personality').onclick=()=>navigate('personality-results');
    target.querySelector('#journey-preferences-next').onclick=()=>{
      const clean=sanitizeJourneyPreferences({...journey,confirmed:true},{regions,authorities:institutions,defaultRegionId:DEFAULT_REGION});
      journey={...journey,...clean};if(!isReady()){updatePreferenceNext();return;}
      if(save())navigate(resolveResumeRoute());
    };
  }
  function renderAuthorityScope(){
    const select=preferencesRoot()?.querySelector('#journey-authority-scope');if(!select)return;
    select.innerHTML=`<option value="">${L('Все доступные варианты','All available employers','所有可选机构')}</option><option value="federal">${L('Федеральный уровень и госкорпорации','Federal level and state corporations','联邦层级与国有企业')}</option>${selectedRegions().map(r=>`<option value="${E(r.id)}">${E(regionName(r))}</option>`).join('')}`;select.value=authorityScope;
  }
  function renderDesiredChoices(){
    wishSorter?.destroy();wishSorter=null;
    const target=preferencesRoot()?.querySelector('#journey-desired-choices');if(!target)return;
    const lookup=byId();
    target.innerHTML=`<ol class="journey-wish-slots" data-wish-list>${[0,1,2].map(index=>{
      const authority=lookup.get(journey.desiredIds[index]);
      return `<li class="${authority?'is-filled':''}" ${authority?`data-wish-id="${E(authority.id)}"`:''}><span class="journey-priority">${index+1}</span>${authority?`<div><strong>${E(authorityName(authority))}</strong><small>${levelLabel(authority)}</small></div><div class="journey-order-actions"><button type="button" class="journey-wish-handle" data-wish-drag-handle="${E(authority.id)}" aria-label="${E(L('Переместить: ','Reorder: ','调整顺序：')+authorityName(authority))}" aria-describedby="journey-wish-sort-help" aria-keyshortcuts="Space Enter ArrowUp ArrowDown Home End Escape" aria-pressed="false" ${journey.desiredIds.length<2?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="8" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg></button><button type="button" data-remove-wish="${E(authority.id)}" aria-label="${E(L('Убрать: ','Remove: ','移除：')+authorityName(authority))}">×</button></div>`:`<span class="journey-empty-slot">${L('Выберите орган ниже','Choose an employer below','请在下方选择机构')}</span>`}</li>`;
    }).join('')}</ol>`;
    target.querySelectorAll('[data-remove-wish]').forEach(button=>button.onclick=()=>{journey.desiredIds=journey.desiredIds.filter(id=>id!==button.dataset.removeWish);journey.confirmed=false;save();renderDesiredChoices();renderAuthorityOptions();updatePreferenceNext();});
    wishSorter=createWishSortable({
      list:target.querySelector('[data-wish-list]'),status:preferencesRoot().querySelector('[data-wish-sort-status]'),
      labels:{
        grabbed:(name,position)=>L(`${name}: взято для перемещения, позиция ${position}.`,`${name}: picked up, position ${position}.`,`${name}：已拿起，当前位置 ${position}。`),
        moved:(name,position)=>L(`${name}: новая позиция ${position}. Подтвердите пробелом или Enter.`,`${name}: new position ${position}. Press Space or Enter to confirm.`,`${name}：新位置 ${position}。按空格或 Enter 确认。`),
        dropped:(name,position)=>L(`${name}: позиция ${position}. Порядок подтверждён.`,`${name}: position ${position}. Order confirmed.`,`${name}：第 ${position} 位。顺序已确认。`),
        cancelled:(name,position)=>L(`Перемещение отменено. ${name}: позиция ${position}.`,`Move cancelled. ${name}: position ${position}.`,`已取消移动。${name}：第 ${position} 位。`)
      },
      onCommit:ids=>{journey.desiredIds=ids;journey.confirmed=false;save();renderAuthorityOptions();updatePreferenceNext();}
    });
  }
  function renderAuthorityOptions(){
    const target=preferencesRoot()?.querySelector('#journey-authority-options');if(!target)return;
    const query=normalizeName(authorityQuery),regionLookup=new Map(regions.map(r=>[r.id,r]));
    const list=visibleInstitutions().filter(a=>(!authorityScope||(authorityScope==='federal'?!a.regionId:a.regionId===authorityScope))&&(!query||normalizeName([a.name,a.shortName,authorityName(a),a.mission,a.familyId].join(' ')).includes(query)))
      .sort((a,b)=>Number(!!a.regionId)-Number(!!b.regionId)||authorityName(a).localeCompare(authorityName(b),getLanguage()));
    target.innerHTML=`<p class="journey-result-count" role="status">${L('Найдено','Found','找到')} ${number(list.length)} · ${L('выбрано','selected','已选择')} ${journey.desiredIds.length}/3</p><div class="journey-employer-options">${list.slice(0,authorityLimit).map(a=>{
      const chosen=journey.desiredIds.indexOf(a.id);
      return `<button type="button" class="journey-employer-option ${chosen>=0?'is-selected':''}" data-add-wish="${E(a.id)}" aria-pressed="${chosen>=0}" ${chosen<0&&journey.desiredIds.length===3?'disabled':''}><span class="journey-choice-marker">${chosen>=0?chosen+1:'+'}</span><span><strong>${E(authorityName(a))}</strong><small>${levelLabel(a)}${a.regionId?' · '+E(regionName(regionLookup.get(a.regionId))):''}</small></span></button>`;
    }).join('')}</div>${!list.length?`<p class="journey-empty">${L('Совпадений нет. Измените запрос или выберите другую территорию.','No matches. Change the query or select another territory.','没有匹配结果，请更改搜索词或选择其他地区。')}</p>`:''}${list.length>authorityLimit?`<button type="button" class="button button-secondary journey-more" id="journey-more-employers">${L('Показать ещё','Show more','显示更多')}</button>`:''}`;
    target.querySelectorAll('[data-add-wish]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.addWish;
      if(journey.desiredIds.includes(id))journey.desiredIds=journey.desiredIds.filter(value=>value!==id);
      else if(journey.desiredIds.length<3)journey.desiredIds.push(id);
      journey.confirmed=false;save();renderDesiredChoices();renderAuthorityOptions();updatePreferenceNext();
    });
    target.querySelector('#journey-more-employers')?.addEventListener('click',()=>{authorityLimit+=24;renderAuthorityOptions();});
  }
  function updatePreferenceNext(){
    const target=preferencesRoot();if(!target)return;
    const button=target.querySelector('#journey-preferences-next');if(button)button.disabled=journey.desiredIds.length!==3;
    const status=target.querySelector('#journey-preference-status');if(status)status.textContent=L(`Выбрано ${journey.desiredIds.length} из 3`,`Selected ${journey.desiredIds.length} of 3`,`已选择 ${journey.desiredIds.length} / 3`);
  }

  function rankings(){
    const result=getResult();if(!result||!catalogLoaded)return null;
    const cacheKey=JSON.stringify([getProfileContext().recordId,journey.regionIds]);
    if(rankingCache?.key===cacheKey)return rankingCache.value;
    const value=rankJourneyAuthorities({authorities:institutions,tracks:data.tracks,questions:data.questions,sectors:data.sectors,inputs:getInputs(),context:result.context,roleProfile:result.roleProfile,regionIds:journey.regionIds,limit:3});
    rankingCache={key:cacheKey,value};return value;
  }
  function switchStage(view){
    journey.resultRecordId=getProfileContext().recordId;journey.view=view;save();renderResults();updateLabels();
    window.scrollTo({top:0,behavior:'instant'});
    const heading=root()?.querySelector('h1');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
  }
  function profileNote(result){
    if(result.roleProfile.lowInterest)return L('Вы пока не выразили устойчивого интереса к предложенным видам работы. Результат поможет познакомиться с ними и выбрать, что изучить подробнее.','You have not yet expressed a strong interest in these types of work. Use the result to explore them and decide what to learn about.','你尚未对这些工作类型表现出较强兴趣。可利用结果了解各类工作，选择想进一步探索的方向。');
    if(result.roleProfile.flat)return L('Ваши оценки видов работы близки друг к другу. При подборе ведомств особенно важны выбранные Вами сферы деятельности.','Your ratings of these types of work are similar. Your chosen policy areas are especially important when selecting employers.','你对各类工作的评分较接近，因此在推荐机构时，你所选的政策领域尤为重要。');
    return L('Посмотрите, какие виды работы привлекают Вас больше, какие сферы интересны и какие условия Вам подходят.','Explore the work you find most interesting, your preferred policy areas and the conditions that suit you.','了解最吸引你的工作类型、感兴趣的政策领域，以及适合你的工作条件。');
  }
  function personalProfile(result){
    const context=getProfileContext();
    return `<section class="seminar-profile-card" aria-labelledby="seminar-interests-title"><h2 id="seminar-interests-title">${L('Мой профиль интересов','My interest profile','我的兴趣画像')}</h2><p class="seminar-profile-caption">${L('От 1 до 5: чем дальше точка от центра, тем выше Ваш интерес к этому виду работы.','From 1 to 5: the farther a point is from the centre, the stronger your interest in this type of work.','评分为1至5分：点离中心越远，对该类工作的兴趣越强。')}</p><div class="seminar-profile-chart"><div class="seminar-radar">${radarSvg(result.roleProfile,{numbered:true,label:L('Девять видов работы: интерес от 1 до 5','Nine types of work: interest from 1 to 5','九类工作：兴趣评分1至5分')})}</div><ol class="seminar-profile-scores">${context.scales.map((scale,index)=>`<li><span class="seminar-scale-number">${index+1}</span><span>${display(scale.title)}</span><strong>${number(result.roleProfile.raw[scale.id],1)}<small> / 5</small></strong></li>`).join('')}</ol></div></section>`;
  }
  function renderProfile(result,target){
    const context=getProfileContext(),strongest=[...context.scales].sort((a,b)=>result.roleProfile.raw[b.id]-result.roleProfile.raw[a.id]).slice(0,3);
    target.innerHTML=`<header class="seminar-results-heading"><h1>${L('Ваш профиль','Your profile','你的职业画像')}</h1><p>${profileNote(result)}</p></header>${personalProfile(result)}
      ${!result.roleProfile.flat&&!result.roleProfile.lowInterest?`<section class="seminar-profile-section"><h2>${L('Что Вам ближе','Your leading interests','你的主要兴趣')}</h2><div class="seminar-strengths">${strongest.map(scale=>`<article><h3>${display(scale.title)}</h3><p>${display(scale.description)}</p></article>`).join('')}</div></section>`:''}
      <div class="seminar-preferences"><section class="seminar-profile-card"><h2>${L('Выбранные сферы','Your chosen policy areas','你选择的政策领域')}</h2><ol class="seminar-sector-list">${context.prioritySectors.map(id=>`<li>${display(context.sectors.find(sector=>sector.id===id)?.title||id)}</li>`).join('')}</ol></section><section class="seminar-profile-card"><h2>${L('Подходящие условия','Your preferred conditions','适合你的工作条件')}</h2><dl class="seminar-condition-summary">${context.conditions.map(condition=>{const value=context.conditionValues[condition.id];return `<div><dt>${display(condition.title)}</dt><dd>${value<=2?display(condition.low):value>=4?display(condition.high):L('Средняя оценка: 3 из 5','Midpoint rating: 3 out of 5','中间评分：3分（满分5分）')}</dd></div>`;}).join('')}</dl></section></div>
      <div class="seminar-next"><p>${L('Теперь сравним три выбранных Вами места работы с рекомендациями для федерального уровня и каждой выбранной территории.','Next, compare your three preferred employers with recommendations at national level and in each selected territory.','接下来，将你的三个意向单位与联邦层级及各所选地区的推荐进行比较。')}</p><button type="button" class="button button-primary button-large" id="seminar-show-authorities">${L('Посмотреть рекомендации','View recommendations','查看推荐')}${I('arrow-right')}</button></div>`;
    target.querySelector('#seminar-show-authorities').onclick=()=>switchStage('recommendations');
  }
  function authorityDetails(authority){
    const paragraphs=(authority.descriptionParagraphs||[]).filter(value=>typeof value==='string'&&value.trim()).slice(0,3);
    const sources=(authority.descriptionSources||authority.sources||[]).filter(source=>safeURL(source.url));
    if(!paragraphs.length&&!sources.length&&!authority.detailPath)return '';
    return `<details class="seminar-authority-details" data-authority-details="${E(authority.id)}"><summary>${L('Об органе и его задачах','About the employer and its work','机构与职责')}</summary><div>${paragraphs.map(text=>`<p${getLanguage()!=='ru'&&translate(text)===text?' lang="ru"':''}>${display(text)}</p>`).join('')}${sources.slice(0,2).map(source=>`<a href="${safeURL(source.url)}" target="_blank" rel="noopener noreferrer">${L('Источник описания','Description source','描述来源')}${I('external')}</a>`).join('')}</div></details>`;
  }
  const authorityDetailFiles=new Map();
  function bindAuthorityDetails(target){
    target.querySelectorAll('[data-authority-details]').forEach(details=>details.addEventListener('toggle',async()=>{
      if(!details.open||details.dataset.detailsLoaded==='true')return;
      const authority=byId().get(details.dataset.authorityDetails);
      if(!authority?.detailPath)return;
      if(!/^data\/territorial-authorities\/[a-z0-9-]+\.json$/.test(authority.detailPath))return;
      details.dataset.detailsLoaded='true';
      try{
        if(!authorityDetailFiles.has(authority.detailPath))authorityDetailFiles.set(authority.detailPath,loadJSON(authority.detailPath,{validate:value=>Array.isArray(value?.authorities)}));
        const payload=await authorityDetailFiles.get(authority.detailPath);
        if(__careerHost.destroyed||!details.isConnected)return;
        const full=mergeTerritorialAuthorityDetails(authority,payload);
        const temporary=document.createElement('div');temporary.innerHTML=authorityDetails(full);
        const content=temporary.querySelector('details>div');if(content)details.querySelector('div').replaceWith(content);
      }catch{authorityDetailFiles.delete(authority.detailPath);details.dataset.detailsLoaded='false';}
    }));
  }
  function matchBadge(matched,preferred){return matched?`<span class="journey-match-badge">${I('check')}${preferred?L('Есть среди трёх рекомендаций','Among your three recommendations','在三个推荐之中'):L('Совпало с Вашим выбором','Matches your choice','与你的意向一致')}</span>`:'';}
  function authorityCard(authority,index,{matched=false,preferred=false}={}){
    const context=getProfileContext();
    const matches=context.prioritySectors.filter(id=>(authority.pathSectors||authority.sectors||[]).some(sector=>sector.id===id));
    const rankLabel=preferred?L(`Ваш приоритет ${index+1}`,`Your priority ${index+1}`,`你的第 ${index+1} 意向`):L(`Рекомендация ${index+1}`,`Recommendation ${index+1}`,`推荐 ${index+1}`);
    return `<article class="seminar-authority ${matched?'journey-matched':''}" data-recommended-authority="${E(authority.id)}"><div class="seminar-authority-heading">${authorityEmblem(authority,'compact')}<div><span class="seminar-rank">${rankLabel} · ${levelLabel(authority)}</span><h3>${E(authorityName(authority))}</h3></div></div>${matchBadge(matched,preferred)}<p${getLanguage()!=='ru'&&translate(authority.mission)===authority.mission?' lang="ru"':''}>${display(authority.mission)}</p>${authorityDetails(authority)}<div class="seminar-track"><span>${L('Подходящее направление работы','A matching work direction','匹配的工作方向')}</span><strong>${display(authority.track?.title||'')}</strong>${matches.length?`<p>${L('Ваши сферы','Your policy areas','你的领域')}: ${matches.map(id=>display(context.sectors.find(sector=>sector.id===id)?.title||id)).join(', ')}.</p>`:''}</div>${authorityRolePanel(authority,`${preferred?'preferred':'recommended'}-${authority.id}`)}</article>`;
  }
  function wishDevelopment(ranked){
    const options=journey.desiredIds.map(id=>ranked.ranked.find(a=>a.id===id)||byId().get(id)).filter(Boolean);
    if(!options.length)return '';
    if(!options.some(a=>a.id===journey.comparisonId))journey.comparisonId=options[0].id;
    const authority=options.find(a=>a.id===journey.comparisonId),development=buildAuthorityDevelopment(authority,ranked.roleProfile,{tracks:data.tracks,careerFramework:framework,competencies});
    const rows=development.lowerInterestDimensions.slice(0,3);
    return `<section class="journey-panel journey-development" aria-labelledby="journey-development-title"><h2 id="journey-development-title">${L('Как приблизиться к желаемой работе','Preparing for your preferred role','如何为意向工作做准备')}</h2><label class="journey-field" for="journey-development-authority">${L('Желаемое место работы','Preferred employer','意向工作单位')}<select id="journey-development-authority">${options.map(a=>`<option value="${E(a.id)}" ${a.id===authority.id?'selected':''}>${E(authorityName(a))}</option>`).join('')}</select></label><p><strong>${display(development.track?.title||authority.track?.title||'')}</strong></p>
      ${!development.available?`<p class="journey-muted">${L('Изучите требования выбранной должности, чтобы определить направления подготовки.','Examine the selected role requirements to identify preparation priorities.','请查看所选职位要求，以确定准备方向。')}</p>`:rows.length?`<h3>${L('Какие виды работы стоит попробовать','Types of work worth trying','值得尝试的工作类型')}</h3><div class="journey-reflection-grid">${rows.map(row=>{const scale=data.scales.find(s=>s.id===row.id);return `<article><strong>${display(scale?.title||row.id)}</strong><span>${L('Ваш интерес','Your interest','你的兴趣')}: ${number(row.interest,1)} / 5</span><p>${display(scale?.description||'')}</p></article>`;}).join('')}</div>`:`<p class="journey-muted">${L('Ваши интересы поддерживают основные виды работы этого направления. Следующий шаг — проверить конкретные требования должности.','Your interests support the main types of work in this direction. Next, examine the specific role requirements.','你的兴趣与该方向的主要工作类型一致。下一步，请核对具体职位要求。')}</p>`}
      <div class="journey-learning-grid">${development.competencies.slice(0,4).map(item=>`<article><h3>${display(item.title)}</h3><p>${display(item.description)}</p>${item.evidenceIdeas?.[0]?`<small>${L('Практика','Practice','实践')}: ${display(item.evidenceIdeas[0])}</small>`:''}</article>`).join('')}</div><p class="journey-method-note">${L('Тест описывает интересы. Направления развития связаны с выбранной работой; конкретные пробелы Вы отметите по требованиям должности.','The questionnaire describes interests. These learning directions relate to the chosen work; identify specific gaps by assessing the role requirements.','问卷反映兴趣。发展方向与所选工作有关；具体差距需要根据职位要求进行自评。')}</p></section>`;
  }
  function bindDevelopment(target,ranked){target.querySelector('#journey-development-authority')?.addEventListener('change',event=>{journey.comparisonId=event.target.value;save();const panel=target.querySelector('.journey-development');panel.outerHTML=wishDevelopment(ranked);bindDevelopment(target,ranked);});}
  function renderRecommendations(result,target){
    const ranked=rankings();if(!ranked)return;
    const recommended=ranked.ranked.slice(0,3),recommendedIds=new Set(recommended.map(authority=>authority.id));
    const rankedById=new Map(ranked.ranked.map(authority=>[authority.id,authority]));
    const preferred=journey.desiredIds.map(id=>rankedById.get(id)||byId().get(id)).filter(Boolean);
    target.innerHTML=`<header class="seminar-results-heading"><button type="button" class="seminar-back-profile" id="seminar-back-profile">${I('arrow-left')}${L('Мой профиль','My profile','我的画像')}</button><h1>${L('Ваши направления работы','Your career directions','你的职业方向')}</h1><p>${L('Сначала — три наиболее подходящих варианта по Вашему профилю интересов с учётом выбранных территорий. Затем — три желаемых места в Вашем порядке. Наличие вакансий не влияет на подбор органов.','First, the three closest matches to your interest profile within your chosen territories. Then, your three preferred employers in your own order. Employers are recommended independently of vacancy availability.','先展示在所选地区范围内与兴趣画像最匹配的三个选项，再按你的意愿顺序展示三个意向单位。机构推荐不取决于是否存在空缺职位。')}</p></header>
      <section class="journey-recommendation-group" data-recommendation-group="recommended"><h2>${L('Три наиболее подходящих варианта','Your three closest matches','最匹配的三个选项')}</h2><p class="journey-muted">${L('Зелёная рамка отмечает совпадение рекомендации с одним из Ваших желаемых мест.','A green border marks a recommendation that is also one of your preferred employers.','绿色边框表示推荐机构也是你的意向单位。')}</p><div class="seminar-authorities">${recommended.map((authority,index)=>authorityCard(authority,index,{matched:journey.desiredIds.includes(authority.id)})).join('')}</div></section>
      <section class="journey-recommendation-group" data-recommendation-group="preferred"><h2>${L('Ваши три желаемых места','Your three preferred employers','你的三个意向单位')}</h2><p class="journey-muted">${L('Порядок карточек соответствует Вашим приоритетам: от первого к третьему.','The cards follow your preference order, from first to third.','卡片按你的意愿排序，从第一到第三。')}</p><div class="seminar-authorities">${preferred.map((authority,index)=>authorityCard(authority,index,{preferred:true,matched:recommendedIds.has(authority.id)})).join('')}</div></section>
      <button type="button" class="seminar-back-profile journey-edit-preferences" id="journey-edit-preferences">${L('Изменить территории и желаемые места','Edit territories and preferred employers','修改地区与意向单位')}</button>${wishDevelopment(ranked)}
      <div class="seminar-next"><p>${L('Перед тестом знаний Вы увидите итоговый план: свой профиль, требования выбранной должности и конкретные шаги развития.','Before the knowledge test, you will see your interest profile, the selected role requirements and your development steps.','知识测试前，你将看到兴趣画像、所选职位要求和具体发展步骤。')}</p><button type="button" class="button button-primary button-large" id="journey-show-plan">${L('Мой план развития','My development plan','我的发展计划')}${I('arrow-right')}</button></div>`;
    target.querySelector('#seminar-back-profile').onclick=()=>switchStage('profile');
    target.querySelector('#journey-edit-preferences').onclick=changePreferences;
    target.querySelector('#journey-show-plan').onclick=()=>switchStage('summary');
    bindDevelopment(target,ranked);bindAuthorityDetails(target);bindAuthorityRolePanels(target);renderVacancies();renderEmployerVacancyPanels();
  }

  let positionSelection='',positionLoadGeneration=0;
  const positionShards=new Map();
  function sourceNote(){
    if(positionsLoading)return L('Загружаем должности выбранных территорий…','Loading roles for the selected territories…','正在加载所选地区的职位……');
    const savedDate=feed?.lastSuccessAt?date(feed.lastSuccessAt):'';
    return `${savedDate?L('Снимок портала Госслужба: ','Civil-service portal snapshot: ','公务员门户快照：')+savedDate+'. ':''}${L('Статус приёма и дата источника указаны в карточке. Архивные объявления и должностные регламенты доступны для учебного разбора.','Each card shows its source date and recruitment status. Archived announcements and role regulations are available for study.','卡片显示来源日期和招聘状态。历史公告及职位规定可用于学习分析。')}`;
  }
  async function loadVacancies(){
    const requestedRegions=[...journey.regionIds];const selection=JSON.stringify([...requestedRegions].sort());
    if(positionsLoading||positionsLoaded&&positionSelection===selection)return;
    positionsLoading=true;positionsError=false;const ticket=++positionLoadGeneration;renderVacancies();
    try{
      const fetched=await Promise.allSettled([
        feed?Promise.resolve(feed):loadJSON('data/vacancies/gossluzhba.json',{timeout:15000,validate:v=>!validateFeed(v).length&&!v.testFixture}),
        loadJSON('data/sourced-position-materials.json',{validate:v=>v?.schemaVersion===1&&(Array.isArray(v.positions)||Array.isArray(v.regions))})
      ]);
      if(__careerHost.destroyed||ticket!==positionLoadGeneration)return;
      if(fetched[0].status==='fulfilled')feed=fetched[0].value;else positionsError=true;
      const manifest=fetched[1].status==='fulfilled'?fetched[1].value:null;
      if(!manifest){positionsError=true;}
      else if(Array.isArray(manifest.positions))positions=manifest.positions;
      else{
        const entries=[manifest.national,...manifest.regions.filter(item=>requestedRegions.includes(item.regionId))].filter(item=>item?.path&&/^data\/position-materials\/[a-z0-9-]+\.json$/.test(item.path));
        const loaded=await Promise.allSettled(entries.map(async item=>{
          if(!positionShards.has(item.path))positionShards.set(item.path,await loadJSON(item.path,{validate:v=>Array.isArray(v?.positions)}));
          return positionShards.get(item.path).positions;
        }));
        if(__careerHost.destroyed||ticket!==positionLoadGeneration)return;
        positions=loaded.flatMap(result=>result.status==='fulfilled'?result.value:[]);
        positionsError||=loaded.some(result=>result.status==='rejected');
      }
      positionSelection=selection;positionsLoaded=true;
    }catch{if(!__careerHost.destroyed)positionsError=true;}
    finally{
      positionsLoading=false;
      if(!__careerHost.destroyed){
        renderVacancies();
        if(lastRoute==='results'&&selection!==JSON.stringify([...journey.regionIds].sort()))void loadVacancies();
      }
    }
  }
  function inferRegion(location){
    const value=normalizeName(location);if(!value)return null;
    // Exact source-name aliases, not geographical guessing from an agency name.
    const candidates=regions.flatMap(region=>[region.name,...(region.aliases||[])].filter(Boolean).map(name=>({id:region.id,name:normalizeName(name)})))
      .filter(item=>value===item.name||value.startsWith(item.name+',')||value.startsWith(item.name+' ')||value.startsWith('г '+item.name+' '))
      .sort((a,b)=>b.name.length-a.name.length);
    if(candidates.length)return candidates[0].id;
    if(/^(?:г )?москва(?:\s|$)/.test(value))return 'ru-77';
    if(/^(?:г )?санкт петербург(?:\s|$)/.test(value))return 'ru-78';
    if(/^(?:г )?севастополь(?:\s|$)/.test(value))return 'ru-92';
    return null;
  }
  function roleRecords(){
    const lookup=byId(),visible=new Set(visibleInstitutions().map(a=>a.id)),names=new Map();
    for(const authority of institutions){
      for(const name of [authority.name,authority.shortName,...(authority.matchAliases||[])]){
        if(typeof name!=='string')continue;const norm=normalizeName(name);
        if(!names.has(norm))names.set(norm,new Set());names.get(norm).add(authority.id);
      }
    }
    const orgs=new Map((feed?.organizations||[]).map(o=>[o.id,o]));
    const portal=(feed?.vacancies||[]).flatMap(v=>{
      const status=currentStatus(v);if(['closed','expired'].includes(status))return [];
      const org=orgs.get(v.organizationId);if(!org)return [];
      const exactIds=names.get(normalizeName(org.name)),institutionId=org.authorityId||(exactIds?.size===1?[...exactIds][0]:null);
      if(!institutionId||!visible.has(institutionId))return [];
      const regionId=inferRegion(v.location);
      if(regionId&&!journey.regionIds.includes(regionId))return [];
      // Territorial offices require a known selected work territory.
      if(org.relation==='territorial'&&(!regionId||!journey.regionIds.includes(regionId)))return [];
      return [{...v,id:'portal-'+v.id,sourceVacancyId:v.id,institutionId,employerName:org.name,organization:org,regionId,status,kind:'vacancy',source:{url:v.url,retrievedAt:v.lastSeenAt,publishedAt:v.publishedAt}}];
    });
    const combined=[...positions,...portal,...journey.customVacancies].filter(v=>visible.has(v.institutionId)&&(!v.regionId||journey.regionIds.includes(v.regionId)));
    const seen=new Set();
    return combined.filter(v=>{
      if(!v?.id||typeof v.title!=='string'||!safeURL(v.url||v.source?.url)||seen.has(v.id))return false;
      seen.add(v.id);return true;
    }).map(v=>({...v,employerName:v.employerName||lookup.get(v.institutionId)?.name||''}));
  }
  function findSelectedVacancy(){
    if(!journey.selectedVacancyId)return null;
    const record=roleRecords().find(v=>v.id===journey.selectedVacancyId);
    if(record)return record;
    const snapshot=journey.selectedSnapshot;
    return snapshot?.id===journey.selectedVacancyId&&!(snapshot.organization?.relation==='territorial'&&!journey.regionIds.includes(snapshot.regionId))&&visibleInstitutions().some(a=>a.id===snapshot.institutionId)&&(!snapshot.regionId||journey.regionIds.includes(snapshot.regionId))?snapshot:null;
  }
  function roleStatus(v){
    if(v.userProvided)return L('Добавлено Вами из объявления','Added by you from an announcement','由你从公告添加');
    if(v.kind==='position-profile'||v.status==='profile')return L('Профиль должности · учебный разбор','Role profile · study material','职位说明 · 学习材料');
    if(v.kind==='archived-vacancy'||v.status==='archived')return L('Архивное объявление · учебный разбор','Archived announcement · study material','历史公告 · 学习材料');
    if(v.status==='accepting')return L('Приём в указанные сроки','Within the stated application period','处于所列申请期');
    if(v.status==='upcoming')return L('Приём ещё не начался','Applications have not started','尚未开始接受申请');
    return L('Уточните приём у работодателя','Check recruitment with the employer','请向雇主核实招聘状态');
  }
  function normalizedManualDraft(value,employer){
    return {...Object.fromEntries(['title','url','education','experience','knowledge','skills'].map(name=>[name,safeText(value[name],name==='title'?500:name==='url'?2000:20000)])),employer,open:value.open===true,panelKey:safeText(value.panelKey,300)};
  }
  function prepareManualDrafts(){
    const canonical=new Set(institutions.map(authority=>authority.id));
    const drafts=isRecord(journey.manualDrafts)?journey.manualDrafts:{};
    journey.manualDrafts=Object.fromEntries(Object.entries(drafts).filter(([id,value])=>canonical.has(id)&&isRecord(value)).map(([id,value])=>[id,normalizedManualDraft(value,id)]));
    const legacy=journey.manualDraft;
    if(isRecord(legacy)&&canonical.has(legacy.employer)&&!journey.manualDrafts[legacy.employer])journey.manualDrafts[legacy.employer]=normalizedManualDraft(legacy,legacy.employer);
  }
  function draftForAuthority(id){return isRecord(journey.manualDrafts?.[id])?journey.manualDrafts[id]:{};}
  function defaultRolePanel(id){return `${journey.desiredIds.includes(id)?'preferred':'recommended'}-${id}`;}
  function rolePanelState(key){
    if(!rolePanelStates.has(key))rolePanelStates.set(key,{open:false,query:'',limit:5,sourceOpen:new Set()});
    return rolePanelStates.get(key);
  }
  function authorityRolePanel(authority,panelKey){
    const state=rolePanelState(panelKey),draft=draftForAuthority(authority.id);
    const draftHere=draft.open&&(draft.panelKey||defaultRolePanel(authority.id))===panelKey;
    const employerUrl=safeURL(authority.governmentUrl||authority.descriptionSources?.[0]?.url);
    return `<details class="journey-authority-roles" data-authority-roles="${E(authority.id)}" data-role-panel="${E(panelKey)}" ${state.open||draftHere?'open':''}><summary><span>${L('Должности и вакансии','Roles and vacancies','职位与招聘公告')}</span></summary><div class="journey-authority-roles-content"><section class="journey-bank" data-employer-bank></section><h4 class="journey-study-heading">${L('Материалы для учебного разбора','Materials for role assessment','职位分析学习材料')} <span class="journey-role-total" data-role-total>…</span></h4><p class="seminar-source-note" data-role-source-note role="status"></p><div data-role-load-status></div><label class="journey-field journey-role-search">${L('Найти должность в этом органе','Find a role with this employer','查找该机构的职位')}<input type="search" data-role-search autocomplete="off" value="${E(state.query)}"></label><p class="journey-result-count" data-role-result-count></p><div class="journey-local-role-list" data-authority-role-list></div><button type="button" class="button button-secondary journey-more" data-role-more hidden>${L('Показать ещё','Show more','显示更多')}</button><div class="journey-source-links">${employerUrl?`<a href="${employerUrl}" target="_blank" rel="noopener noreferrer">${L('Сайт органа','Employer website','机构网站')}${I('external')}</a>`:''}<a href="${PORTAL}/vacancy/" target="_blank" rel="noopener noreferrer">${L('Портал Госслужба','Civil service portal','公务员门户')}${I('external')}</a></div>${manualVacancyForm(authority,panelKey)}</div></details>`;
  }
  function bankId(value){try{return platformEmployerId(value);}catch{return String(value||'');}}
  function bankAuthority(panel){return bankId(rolePanelState(panel.dataset.rolePanel).bankAuthorityId||panel.dataset.authorityRoles);}
  function bankStatus(row){
    const status=vacancyBankStatus(row);
    const label={
      'source-active':L('Приём по данным портала','Accepting as listed by the portal','门户显示正在招募'),
      archived:L('Архивное объявление','Archived announcement','历史公告'),
      expired:L('Указанный срок истёк','Listed deadline has passed','所列截止日期已过'),
      unknown:L('Статус приёма не указан','Recruitment status not stated','未注明招聘状态')
    }[status];
    return `<span class="journey-bank-badge ${status}">${label}</span>`;
  }
  function bankJob(row){
    const salary=[row.salaryFrom,row.salaryTo].filter(value=>typeof value==='number'&&Number.isFinite(value));
    const pay=salary.length?salary.map(value=>number(value)).join(' – ')+' ₽':'';
    const location=[row.region,row.locality].filter(value=>typeof value==='string'&&value.trim()).join(', ');
    const fields=[[L('Опубликовано','Published','发布日期'),row.announcedAt?date(row.announcedAt):L('Не указано','Not stated','未注明')],
      [L('Приём до','Apply by','申请截止'),row.expiresAt?date(row.expiresAt):L('Не указан','Not stated','未注明')],
      [L('Оплата по источнику','Pay as published','来源所列报酬'),pay]].filter(([,value])=>value);
    const requirements=[[L('Образование','Education','学历'),row.education],[L('Опыт по специальности','Professional experience','专业经历'),row.professionalExperience],[L('Стаж госслужбы','Public-service experience','公务经历'),row.governmentExperience]].filter(([,value])=>typeof value==='string'&&value.trim());
    const url=safeURL(row.sourceURL);
    return `<article class="journey-bank-job" data-bank-job="${E(row.id)}"><div class="journey-bank-badges">${bankStatus(row)}${row.scope==='group-or-reserve-context'?`<span class="journey-bank-badge scope">${L('Группа должностей / кадровый резерв','Position group / talent reserve','职位组／人才储备')}</span>`:''}</div><h5 lang="ru">${E(row.title||L('Название должности не указано','Role title not stated','未注明职位名称'))}</h5>${location?`<p class="journey-bank-location" lang="ru">${E(location)}</p>`:''}<dl>${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${E(value)}</dd></div>`).join('')}</dl>${requirements.length?`<details class="journey-bank-requirements"><summary>${L('Образование и стаж','Education and experience','学历与经历')}</summary><dl>${requirements.map(([label,value])=>`<div><dt>${label}</dt><dd lang="ru">${E(value)}</dd></div>`).join('')}</dl></details>`:''}${url?`<a class="seminar-vacancy-link" href="${E(url)}" target="_blank" rel="noopener noreferrer">${L('Открыть объявление','Open announcement','打开公告')}${I('external')}</a>`:''}</article>`;
  }
  function renderEmployerVacancies(panel){
    const target=panel.querySelector('[data-employer-bank]');if(!target||!panel.isConnected)return;
    const state=rolePanelState(panel.dataset.rolePanel),id=bankAuthority(panel),view=vacancyBank.get(id),descriptor=view.descriptor;
    state.bankLimit=state.bankLimit||10;
    if(id===bankId(panel.dataset.authorityRoles)&&descriptor?.familyConnections){state.bankFamilyConnections=descriptor.familyConnections;state.bankPrimaryEmpty=descriptor.jobCount===0;
      const related=descriptor.familyConnections.find(item=>item.jobCount>0);
      if(state.bankPrimaryEmpty&&related&&!state.bankAutoSelected){state.bankAutoSelected=true;state.bankAuthorityId=related.authorityId;state.bankLimit=10;renderEmployerVacancies(panel);void vacancyBank.ensure(related.authorityId);return;}
    }
    const family=state.bankFamilyConnections||[],parentName=authorityName(byId().get(panel.dataset.authorityRoles)||{name:panel.dataset.authorityRoles});
    const selector=family.length?`<label class="journey-field journey-bank-family">${L('Работодатель','Employer','雇主')}<select data-bank-family><option value="${E(panel.dataset.authorityRoles)}" ${id===bankId(panel.dataset.authorityRoles)?'selected':''}>${E(parentName)}</option>${family.map(item=>`<option value="${E(item.authorityId)}" ${id===item.authorityId?'selected':''}>${E(item.name)} (${number(item.jobCount)})</option>`).join('')}</select><small>${L('Связанные органы показаны отдельно: их объявления не объединяются с объявлениями выбранного работодателя.','Related employers are separate; their announcements are not merged with this employer’s listings.','相关机构分别展示，其公告不会与当前雇主合并。')}</small></label>`:'';
    const selectedName=descriptor?.name||(state.bankFamilyConnections||[]).find(item=>item.authorityId===id)?.name||parentName;
    const heading=`<div class="journey-bank-heading"><h4>${L('Объявления на Госслужбе','Civil-service portal announcements','公务员门户公告')}</h4>${descriptor?`<span>${number(descriptor.jobCount)}</span>`:''}</div>`;
    if(view.status==='idle'){target.innerHTML=heading+`<p class="journey-muted">${L('Объявления загрузятся при открытии карточки.','Announcements load when you open this panel.','打开此面板时加载公告。')}</p>`;return;}
    const copyDate=descriptor?.snapshotAt?date(descriptor.snapshotAt):'';
    const total=descriptor?.jobCount||0,pageCount=descriptor?.pages.length||0,shown=view.rows.slice(0,state.bankLimit);
    const empty=descriptor&&!total?(!descriptor.employerId?L('Объявления пока не связаны с этим работодателем. Проверьте официальный портал.','Announcements have not yet been linked to this employer. Check the official portal.','尚未将公告关联到此雇主，请查看官方门户。'):L('В этой копии нет объявлений этого работодателя. Это не означает, что вакансий нет.','This snapshot has no announcements for this employer. This does not mean there are no vacancies.','此副本没有该雇主的公告，但这并不表示没有空缺。')):'';
    target.innerHTML=heading+selector+`<p class="journey-bank-current-employer" lang="ru">${E(selectedName)}</p>${state.bankPrimaryEmpty&&id!==bankId(panel.dataset.authorityRoles)?`<p class="journey-bank-note">${L('В этой копии нет объявлений выбранного органа. Показан отдельный связанный работодатель.','This snapshot has no listings for the selected authority. A separate related employer is shown.','此副本没有所选机关的公告，现显示一个独立的相关雇主。')}</p>`:''}`+(descriptor?`<p class="journey-bank-count">${L('Всего','Total','总计')}: ${number(total)} · ${L('Архивных по источнику','Archived as published','来源标为历史')}: ${number(descriptor.archiveCount||0)}</p>`:'')+`<p class="journey-bank-status" role="status" aria-live="polite">${view.loading?L('Загружаем объявления…','Loading announcements…','正在加载公告……'):view.error?L('Не удалось загрузить объявления. Уже загруженные карточки остаются доступны.','Announcements could not be loaded. Previously loaded cards remain available.','公告加载失败，已加载的卡片仍可查看。'):empty||''}</p>${view.error?`<button type="button" class="button button-secondary" data-bank-retry>${L('Повторить загрузку','Retry loading','重新加载')}</button>`:''}<div class="journey-bank-list" aria-busy="${view.loading}">${shown.map(bankJob).join('')}</div>${view.rows.length?`<p class="journey-bank-page-note">${L(`Страница ${view.pageIndex+1} из ${pageCount}. Показано ${shown.length} из ${view.rows.length} объявлений страницы.`,`Page ${view.pageIndex+1} of ${pageCount}. Showing ${shown.length} of ${view.rows.length} announcements on this page.`,`第 ${view.pageIndex+1}／${pageCount} 页，显示本页 ${view.rows.length} 条公告中的 ${shown.length} 条。`)}</p>`:''}${view.rows.length>state.bankLimit?`<button type="button" class="button button-secondary journey-bank-more" data-bank-more>${L('Показать ещё на этой странице','Show more on this page','显示本页更多公告')}</button>`:''}${pageCount>1?`<nav class="journey-bank-pages" aria-label="${L('Страницы объявлений работодателя','Employer announcement pages','雇主公告分页')}"><button type="button" class="button button-secondary" data-bank-prev ${view.loading||view.pageIndex===0?'disabled':''}>${L('Предыдущая страница','Previous page','上一页')}</button><span>${view.pageIndex+1} / ${pageCount}</span><button type="button" class="button button-secondary" data-bank-next ${view.loading||view.pageIndex>=pageCount-1?'disabled':''}>${L('Следующая страница','Next page','下一页')}</button></nav>`:''}<p class="journey-bank-note">${copyDate?L('Дата копии: ','Snapshot prepared: ','副本日期：')+E(copyDate)+(copyDate.trim().endsWith('.')?' ':L('. ','. ','。')):''}${L('Показаны все объявления работодателя, включая архивные. Сроки и возможность отклика уточняйте в официальном объявлении.','All this employer’s announcements are included, including archived listings. Check dates and application availability in the official announcement.','包含该雇主的全部公告及历史记录，请在官方公告中核对期限及申请状态。')}</p>`;
    target.querySelector('[data-bank-more]')?.addEventListener('click',()=>{state.bankLimit+=10;renderEmployerVacancies(panel);});
    target.querySelector('[data-bank-retry]')?.addEventListener('click',()=>void vacancyBank.retry(id));
    const turn=delta=>{state.bankLimit=10;void vacancyBank.loadPage(id,view.pageIndex+delta);};
    target.querySelector('[data-bank-prev]')?.addEventListener('click',()=>turn(-1));target.querySelector('[data-bank-next]')?.addEventListener('click',()=>turn(1));
    target.querySelector('[data-bank-family]')?.addEventListener('change',event=>{const previous=id;state.bankAuthorityId=event.target.value;state.bankLimit=10;cancelUnusedBank(previous,panel);renderEmployerVacancies(panel);void vacancyBank.ensure(state.bankAuthorityId);});
  }
  function cancelUnusedBank(id,except){if(![...document.querySelectorAll('[data-authority-roles][open]')].some(panel=>panel!==except&&bankAuthority(panel)===id))vacancyBank.cancel(id);}
  function renderEmployerVacancyPanels(){document.querySelectorAll('[data-authority-roles]').forEach(panel=>{renderEmployerVacancies(panel);if(panel.open)void vacancyBank.ensure(bankAuthority(panel));});}
  function cancelEmployerVacancyRequests(){document.querySelectorAll('[data-authority-roles]').forEach(panel=>vacancyBank.cancel(bankAuthority(panel)));}
  function vacancyCard(v,sourceOpen){
    const selected=journey.selectedVacancyId===v.id,sourceDate=date(v.source?.retrievedAt||v.lastSeenAt||v.sourceSnapshotAt);
    const requirementsCount=buildVacancyRequirements(v).rows.filter(row=>row.assessable).length;
    const fields=[[L('Место работы','Location','工作地点'),typeof v.location==='string'?v.location:v.location?.text],
      [L('Источник получен','Source retrieved','来源获取日期'),sourceDate],[L('Приём до','Apply by','申请截止'),date(v.deadline)],
      [L('Оплата','Pay','报酬'),typeof v.salary==='string'?v.salary:v.salary?.rawText]].filter(([,value])=>value);
    return `<article class="journey-local-role ${selected?'is-selected':''}" data-vacancy-id="${E(v.id)}" data-role-institution="${E(v.institutionId)}"><h4 lang="ru">${E(v.title)}</h4><p class="seminar-vacancy-status">${roleStatus(v)}</p><details class="journey-role-source" data-role-source="${E(v.id)}" ${sourceOpen?'open':''}><summary>${L('Источник и подробности','Source and details','来源与详情')}</summary>${v.department?`<p lang="ru">${E(v.department)}</p>`:''}<dl>${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${E(value)}</dd></div>`).join('')}</dl><p class="journey-requirement-count">${L('Пунктов для самооценки','Self-assessment items','自评项目数')}: ${requirementsCount}</p><a class="seminar-vacancy-link" href="${safeURL(v.url||v.source?.url)}" target="_blank" rel="noopener noreferrer">${L('Открыть источник','Open source','打开来源')}${I('external')}</a></details><button type="button" class="button ${selected?'button-secondary':'button-primary'} journey-role-select" data-select-vacancy="${E(v.id)}">${selected?L('Продолжить разбор','Continue assessment','继续分析'):L('Разобрать требования','Assess requirements','分析职位要求')}${I('arrow-right')}</button></article>`;
  }
  function renderVacancies(onlyPanel){
    const panels=onlyPanel?[onlyPanel]:[...document.querySelectorAll('[data-authority-roles]')];if(!panels.length)return;
    const all=roleRecords(),grouped=new Map();
    for(const record of all){if(!grouped.has(record.institutionId))grouped.set(record.institutionId,[]);grouped.get(record.institutionId).push(record);}
    for(const panel of panels){
      if(!panel.isConnected)continue;
      const authorityId=panel.dataset.authorityRoles,state=rolePanelState(panel.dataset.rolePanel),target=panel.querySelector('[data-authority-role-list]');
      const records=grouped.get(authorityId)||[];
      const query=normalizeName(state.query),list=records.filter(v=>!query||normalizeName([v.title,v.department].join(' ')).includes(query));
      list.sort((a,b)=>Number(b.currentRecruitmentVerified===true)-Number(a.currentRecruitmentVerified===true)||Number(a.kind==='position-profile')-Number(b.kind==='position-profile')||a.title.localeCompare(b.title,'ru'));
      if(target.dataset.rendered)state.sourceOpen=new Set([...target.querySelectorAll('[data-role-source][open]')].map(node=>node.dataset.roleSource));
      const active=document.activeElement,focused=target.contains(active)?{role:active?.dataset.selectVacancy,source:active?.closest('[data-role-source]')?.dataset.roleSource,summary:active?.tagName==='SUMMARY',link:active?.tagName==='A'}:null;
      const loadStatus=panel.querySelector('[data-role-load-status]'),retryFocused=loadStatus.contains(active);
      panel.querySelector('[data-role-total]').textContent=positionsLoading&&!records.length?'…':number(records.length);
      panel.querySelector('[data-role-source-note]').textContent=sourceNote();
      loadStatus.innerHTML=positionsError?`<p class="journey-source-status">${L('Часть источников не загрузилась. Доступные материалы сохранены.','Some sources could not be loaded. Available materials are still shown.','部分来源未能加载，已加载的材料仍可查看。')} <button type="button" class="journey-text-button" data-role-retry>${L('Повторить загрузку','Retry loading','重新加载')}</button></p>`:'';
      panel.querySelector('[data-role-result-count]').textContent=L(`Материалов этого органа: ${list.length}`,`Materials from this employer: ${list.length}`,`该机构的资料数：${list.length}`);
      target.innerHTML=list.slice(0,state.limit).map(record=>vacancyCard(record,state.sourceOpen.has(record.id))).join('')||`<p class="journey-local-role-empty">${positionsLoading?L('Подбираем материалы…','Finding materials…','正在查找材料……'):query?L('Совпадений нет. Измените запрос.','No matches. Try a different search.','没有匹配结果，请更改搜索词。'):L('В сохранённых источниках нет должностей этого органа для выбранных территорий. Проверьте официальный сайт или добавьте объявление ниже.','The saved sources contain no roles for this employer in your chosen territories. Check its official website or add an announcement below.','已保存来源中没有该机构在所选地区的职位。请查看官方网站，或在下方添加公告。')}</p>`;
      target.dataset.rendered='true';panel.querySelector('[data-role-more]').hidden=list.length<=state.limit;
      if(focused){
        const restore=focused.role?[...target.querySelectorAll('[data-select-vacancy]')].find(node=>node.dataset.selectVacancy===focused.role):focused.source?[...target.querySelectorAll('[data-role-source]')].find(node=>node.dataset.roleSource===focused.source)?.querySelector(focused.summary?'summary':focused.link?'a':'[tabindex]'):null;
        restore?.focus({preventScroll:true});
      }
      if(retryFocused)(loadStatus.querySelector('[data-role-retry]')||panel.querySelector(':scope > summary'))?.focus({preventScroll:true});
    }
  }
  function bindAuthorityRolePanels(target){
    target.querySelectorAll('[data-authority-roles]').forEach(panel=>{
      const state=rolePanelState(panel.dataset.rolePanel);
      panel.addEventListener('toggle',event=>{
        if(event.target===panel){state.open=panel.open;if(panel.open){renderEmployerVacancies(panel);void vacancyBank.ensure(bankAuthority(panel));void loadVacancies();}else cancelUnusedBank(bankAuthority(panel),panel);}
        else if(event.target.dataset.roleSource){if(event.target.open)state.sourceOpen.add(event.target.dataset.roleSource);else state.sourceOpen.delete(event.target.dataset.roleSource);}
      },true);
      panel.querySelector('[data-role-search]').addEventListener('input',event=>{state.query=event.target.value;state.limit=5;renderVacancies(panel);});
      panel.addEventListener('click',event=>{
        if(event.target.closest('[data-role-retry]')){positionsLoaded=false;void loadVacancies();return;}
        if(event.target.closest('[data-role-more]')){state.limit+=5;renderVacancies(panel);return;}
        const button=event.target.closest('[data-select-vacancy]');if(!button)return;
        const vacancy=roleRecords().find(v=>v.id===button.dataset.selectVacancy&&v.institutionId===panel.dataset.authorityRoles);if(!vacancy)return;
        journey.selectedVacancyId=vacancy.id;const {fullDescription,...snapshot}=vacancy;journey.selectedSnapshot=snapshot;
        if(!isRecord(journey.assessments[vacancy.id]))journey.assessments[vacancy.id]={};save();switchStage('requirements');
      });
      bindManualVacancy(panel);
    });
  }
  function manualVacancyForm(authority,panelKey){
    const draft=draftForAuthority(authority.id),open=draft.open&&(draft.panelKey||defaultRolePanel(authority.id))===panelKey;
    return `<details class="journey-manual-source" data-manual-authority="${E(authority.id)}" ${open?'open':''}><summary>${L('Добавить объявление этого органа','Add this employer’s announcement','添加该机构的公告')}</summary><form data-manual-vacancy="${E(authority.id)}" data-manual-panel="${E(panelKey)}"><input type="hidden" name="employer" value="${E(authority.id)}"><p>${L('Откройте официальный источник и перенесите точные формулировки. Каждый отдельный пункт начинайте с новой строки; альтернативные условия сохраняйте вместе.','Open the official source and copy the exact wording. Start each separate item on a new line; keep alternative conditions together.','请打开官方来源并复制准确表述。每个独立项目另起一行，替代性条件须保留在同一项中。')}</p><label class="journey-field">${L('Название должности','Role title','职位名称')}<input name="title" required maxlength="500" value="${E(safeText(draft.title,500))}"></label><label class="journey-field">${L('Ссылка на источник','Source URL','来源链接')}<input type="url" name="url" required placeholder="https://" maxlength="2000" value="${E(safeText(draft.url,2000))}"></label><div class="journey-manual-grid">${['education','experience','knowledge','skills'].map(id=>`<label>${groupLabel(id)}<textarea name="${id}" rows="3" maxlength="20000">${E(safeText(draft[id]))}</textarea></label>`).join('')}</div><p class="journey-form-error" data-manual-error role="alert"></p><button class="button button-primary" type="submit">${L('Сохранить и разобрать','Save and assess','保存并分析')}${I('arrow-right')}</button></form></details>`;
  }
  function captureManualDraft(form){
    const employer=form.dataset.manualVacancy;if(!byId().has(employer))return;
    const fields=Object.fromEntries(['title','url','education','experience','knowledge','skills'].map(name=>[name,form.elements[name]?.value]));
    const draft=normalizedManualDraft({...fields,open:form.closest('details')?.open===true,panelKey:form.dataset.manualPanel},employer);
    journey.manualDrafts={...journey.manualDrafts,[employer]:draft};journey.manualDraft={...draft};dirty=true;
    // Two cards may represent the same employer. Keep their unedited copy in sync.
    document.querySelectorAll('[data-manual-vacancy]').forEach(other=>{
      if(other===form||other.dataset.manualVacancy!==employer||other.contains(document.activeElement))return;
      for(const name of ['title','url','education','experience','knowledge','skills'])other.elements[name].value=draft[name];
    });
    if(manualSaveTimer)clearTimeout(manualSaveTimer);
    manualSaveTimer=setTimeout(()=>{manualSaveTimer=null;if(!__careerHost.destroyed)save();},500);
  }
  function bindManualVacancy(target){
    target.querySelectorAll('[data-manual-vacancy]').forEach(form=>{
      form.addEventListener('input',()=>captureManualDraft(form));form.addEventListener('change',()=>captureManualDraft(form));
      const details=form.closest('details');let wasOpen=details.open;
      details.addEventListener('toggle',event=>{if(event.target!==details||!form.isConnected||details.open===wasOpen)return;wasOpen=details.open;captureManualDraft(form);});
      form.addEventListener('submit',event=>{
        event.preventDefault();const values=new FormData(form),authority=byId().get(form.dataset.manualVacancy);
        const title=safeText(values.get('title'),500),url=safeText(values.get('url'),2000);
        const requirements=['education','experience','knowledge','skills'].flatMap(category=>safeText(values.get(category)).split(/\n+/).map(text=>text.trim()).filter(Boolean).map((text,index)=>({id:`${category}-${index+1}`,category,sourceText:text,requirementState:requirementStateFromText(text),selfAssessmentEligible:true,sourceLocator:L('Перенесено студентом из объявления','Copied from the announcement by the student','由学生从公告复制')})));
        const error=form.querySelector('[data-manual-error]');
        if(!title||!safeURL(url)||!authority||values.get('employer')!==authority.id||!visibleInstitutions().some(item=>item.id===authority.id)||!requirements.length){error.textContent=L('Укажите должность, действительную ссылку и хотя бы одно требование этого органа из источника.','Enter a role title, a valid source URL and at least one requirement from this employer’s source.','请填写职位名称、有效来源链接及该机构原文中的至少一项要求。');return;}
        const id='student-source-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
        const vacancy={id,institutionId:authority.id,employerName:authority.name,title,url,regionId:authority.regionId||null,userProvided:true,kind:'vacancy',status:'unconfirmed',source:{url,retrievedAt:new Date().toISOString(),format:'student-transcription'},requirements,coverage:{requirements:'student-transcription'}};
        journey.customVacancies=[...journey.customVacancies,vacancy].slice(-20);journey.selectedVacancyId=id;journey.selectedSnapshot=vacancy;journey.assessments[id]={};
        delete journey.manualDrafts[authority.id];if(journey.manualDraft?.employer===authority.id)journey.manualDraft={};save();switchStage('requirements');
      });
    });
  }

  function assessment(vacancy){
    const requirements=buildVacancyRequirements(vacancy);
    const summary=summarizeVacancyAssessment(requirements,journey.assessments[vacancy.id]||{});
    return {requirements,summary};
  }
  function assessmentProgress(summary){
    return L(`Отмечено ${summary.assessed} из ${summary.total}. Соответствую: ${summary.met}; пока не выполнено: ${summary.gap}; не оценено: ${summary.unassessed}.`,`Assessed ${summary.assessed} of ${summary.total}. Met: ${summary.met}; not yet met: ${summary.gap}; unassessed: ${summary.unassessed}.`,`已评估 ${summary.assessed} / ${summary.total}。已符合：${summary.met}；尚未符合：${summary.gap}；未评估：${summary.unassessed}。`);
  }
  function missingSourceNote(requirements){
    if(!requirements.missingCategories.length)return '';
    return `<p class="journey-source-status">${L('В сохранённом источнике не выделены отдельно','Not separately available in the saved source','已保存来源中未单独列明')}: ${requirements.missingCategories.map(groupLabel).join(', ')}. ${L('Проверьте оригинал; отсутствие сведений не означает отсутствия требования.','Check the original; missing information does not mean there is no requirement.','请核对原文；没有信息不代表没有相关要求。')}</p>`;
  }
  function sourceContextLabel(row){
    if(row.requirementState==='explicitly_not_required')return L('Источник прямо указывает отсутствие этого требования','The source explicitly states this is not required','来源明确说明不作此要求');
    if(row.requirementState==='source_not_stated')return L('В источнике не указано','Not stated in the source','来源未说明');
    if(row.requirementState==='preferred')return L('Предпочтительное условие','Preferred condition','优先条件');
    return L('Уточнение источника','Source context','来源说明');
  }
  function requirementSourceContext(row,mainSource){
    const asText=value=>Array.isArray(value)?value.filter(item=>typeof item==='string').join('; '):typeof value==='string'?value:'';
    const headings=[...new Set([row.sourceGroup,row.sourceHeading,row.sourceSubheadingAsPublished].map(asText).filter(Boolean))];
    const notes=[...new Set([row.interpretationNote,row.assessmentNote].map(asText).filter(Boolean))];
    const locator=asText(row.sourceLocator);
    return `${headings.length?`<p class="journey-source-heading" lang="ru">${headings.map(E).join(' · ')}</p>`:''}${notes.map(note=>`<p class="journey-source-note"><strong>${L('Пояснение к источнику','Source note','来源说明')}:</strong> <span lang="ru">${E(note)}</span></p>`).join('')}${locator?`<small class="journey-source-locator" lang="ru">${E(locator)}</small>`:''}${safeURL(row.evidenceSourceUrl)&&row.evidenceSourceUrl!==mainSource?`<a class="journey-source-locator" href="${safeURL(row.evidenceSourceUrl)}" target="_blank" rel="noopener noreferrer">${L('Источник этого требования','Source of this requirement','此项要求的来源')}</a>`:''}`;
  }
  function requirementRow(row,index,mainSource){
    const context=requirementSourceContext(row,mainSource);
    if(!row.assessable)return `<div class="journey-source-context"><span>${sourceContextLabel(row)}</span>${row.text?`<p lang="ru">${E(row.text)}</p>`:''}${context}</div>`;
    return `<fieldset class="journey-requirement" data-requirement-row="${E(row.id)}" data-status="${row.status||'unassessed'}"><legend><span class="journey-requirement-index">${index}</span><span lang="ru">${E(row.text)}</span></legend>${context}<div class="journey-assessment-options">${['met','gap'].map(value=>`<label class="journey-answer ${value}"><input type="radio" name="assessment-${E(row.id)}" data-requirement-key="${E(row.id)}" value="${value}" ${row.status===value?'checked':''}><span aria-hidden="true">${value==='met'?'✓':'×'}</span><strong>${value==='met'?L('Уже соответствую','Already meet it','已符合'):row.assessmentKind==='formal'?L('Пока не соответствую','Not yet met','暂未符合'):L('Предстоит освоить','Need to develop','需要提升')}</strong></label>`).join('')}</div></fieldset>`;
  }
  function renderRequirements(result,target){
    const vacancy=findSelectedVacancy();
    if(!vacancy){renderMissingSelection(target);return;}
    const {requirements,summary}=assessment(vacancy);let index=0;
    const sourceURL=safeURL(vacancy.url||vacancy.source?.url);
    const manualAuthority=byId().get(vacancy.institutionId),manualPanelKey=`requirements-${vacancy.institutionId}`;
    const manualDraft=draftForAuthority(vacancy.institutionId);
    const duties=typeof vacancy.duties==='string'?vacancy.duties:Array.isArray(vacancy.duties)?vacancy.duties.map(item=>typeof item==='string'?item:item.sourceText||item.text||'').filter(Boolean).join('\n'):'';
    target.innerHTML=`<header class="seminar-results-heading"><button type="button" class="seminar-back-profile" id="journey-back-vacancies">${I('arrow-left')}${L('К выбору должности','Back to role selection','返回职位选择')}</button><span class="journey-kicker">${roleStatus(vacancy)}</span><h1>${L('Требования выбранной должности','Selected role requirements','所选职位要求')}</h1><h2 lang="ru">${E(vacancy.title)}</h2><p lang="ru">${E(vacancy.employerName)}</p>${vacancy.department?`<p lang="ru">${E(vacancy.department)}</p>`:''}<a class="seminar-vacancy-link" href="${sourceURL}" target="_blank" rel="noopener noreferrer">${L('Источник требований','Requirements source','要求来源')}${I('external')}</a><p class="journey-muted">${L('Источник получен','Source retrieved','来源获取日期')}: ${date(vacancy.source?.retrievedAt||vacancy.lastSeenAt||vacancy.sourceSnapshotAt)||L('дата не указана','date not stated','未注明日期')}</p></header>
      ${duties?`<details class="journey-duties"><summary>${L('Должностные обязанности','Duties','工作职责')}</summary><p lang="ru">${E(duties)}</p></details>`:''}
      <p class="journey-assessment-intro">${L('Отметьте каждый пункт. Знания и умения, которые предстоит освоить, войдут в Ваш план развития; образование и стаж будут показаны отдельно.','Assess every item. Knowledge and skills to develop will enter your development plan; education and experience will be shown separately.','请逐项评估。需要掌握的知识和技能将加入发展计划；学历与工作经历将单独显示。')}</p>${missingSourceNote(requirements)}${!summary.total?`<p class="journey-source-status">${L('В этой карточке нет пунктов для самооценки. Откройте источник и добавьте точные требования или выберите другой материал.','This card has no assessable items. Open the source and add its exact requirements, or choose another material.','此卡片没有可评估项目。请打开来源并添加原文要求，或选择其他材料。')}</p>`:''}${requirements.missingCategories.length?`<button type="button" class="button button-secondary" id="journey-supplement-requirements">${L('Дополнить из источника','Add requirements from the source','从来源补充要求')}</button>`:''}
      <div class="journey-supplement-form" data-requirement-manual-slot>${manualAuthority&&manualDraft.open&&manualDraft.panelKey===manualPanelKey?manualVacancyForm(manualAuthority,manualPanelKey):''}</div>
      <div class="journey-assessment-progress"><p id="journey-assessment-state" role="status" aria-live="polite">${E(assessmentProgress(summary))}</p><progress id="journey-assessment-progress" max="${Math.max(1,summary.total)}" value="${summary.assessed}" aria-label="${E(L('Отмеченные требования','Assessed requirements','已评估要求'))}"></progress></div>
      <div class="journey-requirements">${summary.groups.filter(group=>group.rows.length).map(group=>`<section class="journey-requirement-group" aria-labelledby="requirement-heading-${group.id}"><h2 id="requirement-heading-${group.id}">${groupLabel(group.id)}</h2>${group.rows.map(row=>requirementRow(row,row.assessable?++index:0,vacancy.url||vacancy.source?.url)).join('')}</section>`).join('')}</div>
      <div class="seminar-next"><p>${L('Отметки сохраняются автоматически. Их можно изменить, вернувшись к этой должности.','Your answers are saved automatically. Return to this role to revise them.','回答会自动保存，返回该职位即可修改。')}</p><button type="button" class="button button-primary button-large" id="journey-open-plan">${L('Посмотреть план развития','View my development plan','查看发展计划')}${I('arrow-right')}</button></div>`;
    target.querySelector('#journey-back-vacancies').onclick=()=>switchStage('recommendations');
    target.querySelector('#journey-open-plan').onclick=()=>switchStage('summary');
    bindManualVacancy(target.querySelector('[data-requirement-manual-slot]'));
    target.querySelector('#journey-supplement-requirements')?.addEventListener('click',()=>{
      if(!manualAuthority)return;
      const previous=draftForAuthority(manualAuthority.id),hasDraft=['title','url','education','experience','knowledge','skills'].some(name=>safeText(previous[name]));
      const sourceFields={title:vacancy.title,url:vacancy.url||vacancy.source?.url||'',...Object.fromEntries(['education','experience','knowledge','skills'].map(category=>[category,requirements.rows.filter(row=>row.category===category&&row.text).map(row=>row.text).join('\n')]))};
      const draft=normalizedManualDraft({...hasDraft?previous:sourceFields,open:true,panelKey:manualPanelKey},manualAuthority.id);
      journey.manualDrafts={...journey.manualDrafts,[manualAuthority.id]:draft};journey.manualDraft={...draft};
      const slot=target.querySelector('[data-requirement-manual-slot]');
      slot.innerHTML=(hasDraft?`<p class="journey-muted">${L('Открыт сохранённый черновик этого органа. Сверьте его с источником выбранной должности.','Your saved draft for this employer is open. Check it against the selected role’s source.','已打开该机构的已保存草稿，请与所选职位的来源核对。')}</p>`:'')+manualVacancyForm(manualAuthority,manualPanelKey);
      bindManualVacancy(slot);const form=slot.querySelector('[data-manual-vacancy]');captureManualDraft(form);form.elements.title.focus({preventScroll:true});
    });
    target.querySelectorAll('[data-requirement-key]').forEach(input=>input.addEventListener('change',event=>{
      const row=requirements.rows.find(item=>item.id===event.target.dataset.requirementKey),value=event.target.value;
      if(!row?.assessable||!statuses.has(value))return;
      if(!isRecord(journey.assessments[vacancy.id]))journey.assessments[vacancy.id]={};journey.assessments[vacancy.id][row.id]={status:value,signature:row.signature};save();
      event.target.closest('[data-requirement-row]').dataset.status=value;
      const updated=summarizeVacancyAssessment(requirements,journey.assessments[vacancy.id]);
      target.querySelector('#journey-assessment-state').textContent=assessmentProgress(updated);
      target.querySelector('#journey-assessment-progress').value=updated.assessed;
    }));
  }
  function renderMissingSelection(target){
    target.innerHTML=`<header class="seminar-results-heading"><h1>${L('Ваш план развития','Your development plan','你的发展计划')}</h1><p>${L('Выберите должность и отметьте её требования, чтобы увидеть конкретные шаги подготовки.','Choose a role and assess its requirements to see your specific preparation steps.','请选择职位并评估要求，以查看具体准备步骤。')}</p></header><button type="button" class="button button-primary" id="journey-choose-role">${L('Выбрать должность','Choose a role','选择职位')}${I('arrow-right')}</button>`;
    target.querySelector('#journey-choose-role').onclick=()=>switchStage('recommendations');
  }
  function coverageChart(summary){
    const domainRows=summary.domainRadarAvailable?summary.domains:[];
    const groups=summary.groups.filter(group=>group.total>0);
    // A fully classified competency profile uses a domain radar. With incomplete
    // classification, category coverage includes every statement in the table.
    const radarRows=domainRows.length?domainRows:groups.filter(group=>!['eligibility','other'].includes(group.id));
    const radar=requirementRadar(radarRows);
    const heading=domainRows.length?L('Мои компетенции и требования должности','My competencies and role requirements','我的能力与职位要求'):L('Моя самооценка по группам требований','My self-assessment by requirement group','按要求类别进行自评');
    return `<section class="journey-panel" aria-labelledby="journey-target-title"><h2 id="journey-target-title">${heading}</h2><p class="journey-muted">${L('Доля пунктов, которым Вы отметили соответствие. Цель — 100% перечисленных требований каждой группы. Неотмеченные пункты показаны отдельно.','The share of listed items you marked as met. The target is 100% of the listed requirements in each group. Unassessed items are shown separately.','显示你标记为已符合的项目比例，目标是每类已列要求的100%。未评估项目单独显示。')}</p>${radar?`<div class="journey-target-layout"><div><div class="journey-chart-key"><span class="journey-key-current">${L('Моя самооценка','My self-assessment','我的自评')}</span><span class="journey-key-target">${L('Требования должности','Role requirements','职位要求')}</span></div>${radar}</div><div><ol class="journey-radar-labels">${radarRows.map(row=>`<li><strong>${groupLabel(row.id)}</strong><span>${row.met}/${row.total} · ${number(100*row.met/row.total)}%</span></li>`).join('')}</ol>${requirementBars(radarRows)}</div></div>`:requirementBars(groups)}
      ${radar&&groups.some(group=>!radarRows.includes(group))?requirementBars(groups.filter(group=>!radarRows.some(row=>row.id===group.id))):''}
      <p class="journey-method-note">${L('Проценты отражают самооценку по сохранённым пунктам источника. Полнота опубликованных требований и фактическое соответствие проверяются по оригиналу и работодателем.','Percentages describe self-reports against the saved source items. Check the original for the complete requirements; the employer verifies actual eligibility.','百分比反映对已保存来源项目的自评。完整要求应核对原文，实际资格由雇主确认。')}</p></section>`;
  }
  function developmentList(rows,heading,kind){
    if(!rows.length)return '';
    return `<section class="journey-panel"><h2>${heading}</h2><ol class="journey-gap-list">${rows.map(row=>`<li><strong lang="ru">${E(row.text)}</strong><p>${kind==='formal'?L('Определите, какой документ, уровень образования или опыт нужен для выполнения условия.','Identify the document, qualification or experience needed to meet this condition.','明确满足该条件所需的文件、学历或工作经验。'):row.category==='knowledge'?L('Изучите указанный материал и подготовьте короткий разбор его применения в работе.','Study the named material and prepare a short example of how it applies to the work.','学习所列材料，并准备一个在工作中应用的简短示例。'):row.category==='skills'?L('Выполните небольшое практическое задание и сохраните результат в портфолио.','Complete a small practical task and keep the result in your portfolio.','完成一项小型实践任务，并将成果保存到作品集中。'):L('Уточните составное условие в источнике и определите первый шаг подготовки.','Review the combined condition in the source and identify your first preparation step.','核对原文中的综合条件，并确定准备的第一步。')}</p>${row.sourceLocator?`<small lang="ru">${E(row.sourceLocator)}</small>`:''}</li>`).join('')}</ol></section>`;
  }
  function renderSummary(result,target){
    const vacancy=findSelectedVacancy();if(!vacancy){renderMissingSelection(target);return;}
    const {requirements,summary}=assessment(vacancy),ranked=rankings(),complete=summary.total>0&&summary.unassessed===0;
    const selectedAuthority=ranked?.ranked.find(a=>a.id===vacancy.institutionId)||byId().get(vacancy.institutionId);
    target.innerHTML=`<header class="seminar-results-heading"><button type="button" class="seminar-back-profile" id="journey-back-requirements">${I('arrow-left')}${L('Изменить отметки','Edit my assessment','修改自评')}</button><h1>${L('Ваш план развития','Your development plan','你的发展计划')}</h1><p>${L('Сопоставьте свои интересы с желаемой работой и выберите конкретные действия для подготовки к должности.','Compare your interests with your preferred work and choose concrete actions to prepare for the role.','将兴趣与意向工作进行比较，并选择为职位做准备的具体行动。')}</p></header>
      <section class="journey-goal-card"><span class="journey-kicker">${L('Выбранная должность','Selected role','所选职位')}</span><h2 lang="ru">${E(vacancy.title)}</h2><p>${E(selectedAuthority?authorityName(selectedAuthority):vacancy.employerName)}</p><p class="journey-muted">${roleStatus(vacancy)}</p><a class="seminar-vacancy-link" href="${safeURL(vacancy.url||vacancy.source?.url)}" target="_blank" rel="noopener noreferrer">${L('Источник требований','Requirements source','要求来源')}${I('external')}</a></section>
      <div class="journey-summary-counts"><div><strong>${summary.met}</strong><span>${L('Соответствую','Already met','已符合')}</span></div><div><strong>${summary.gap}</strong><span>${L('Предстоит подготовиться','To prepare','需要准备')}</span></div><div><strong>${summary.unassessed}</strong><span>${L('Не оценено','Unassessed','未评估')}</span></div></div>
      ${personalProfile(result)}${ranked?wishDevelopment(ranked):''}${coverageChart(summary)}${missingSourceNote(requirements)}
      ${developmentList(summary.developmentItems,L('Конкретные знания и умения для развития','Specific knowledge and skills to develop','需要提升的具体知识与技能'),'skills')}
      ${developmentList(summary.formalGaps,L('Образование, опыт и условия допуска','Education, experience and eligibility','学历、经历与资格条件'),'formal')}
      ${developmentList(summary.otherGaps,L('Другие требования, которые предстоит выполнить','Other requirements to meet','尚需满足的其他要求'),'other')}
      ${!summary.gap&&summary.total&&complete?`<p class="journey-positive">${L('По Вашим отметкам все доступные требования выполнены. Подготовьте примеры и документы, которыми сможете это подтвердить.','You marked every available requirement as met. Prepare examples and documents to support your assessment.','你将所有可评估要求标记为已符合。请准备示例和文件以支持自评。')}</p>`:''}
      ${summary.unassessed?`<section class="journey-panel"><h2>${L('Осталось оценить','Still to assess','仍需评估')}</h2><p>${L(`Ещё ${summary.unassessed} пунктов остаются без отметки. Они не включены в список подтверждённых пробелов.`,`Another ${summary.unassessed} items are unassessed. They are not included in your identified gaps.`,`仍有 ${summary.unassessed} 项尚未评估，它们未被计入已识别差距。`)}</p><button type="button" class="button button-secondary" id="journey-complete-checklist">${L('Вернуться к требованиям','Return to requirements','返回职位要求')}</button></section>`:''}
      <div class="seminar-next"><p>${complete?L('Самооценка завершена. Можно переходить к тесту знаний о государственной службе.','The self-assessment is complete. Continue to the public-service knowledge test.','自评已完成。现在可以进入公务知识测试。'):L('Завершите самооценку выбранной должности перед переходом к тесту знаний.','Complete the role self-assessment before continuing to the knowledge test.','请完成所选职位的自评，再进入知识测试。')}</p><button type="button" class="button button-primary button-large" id="seminar-open-knowledge" ${complete?'':'disabled'}>${L('Перейти к тесту знаний','Continue to the knowledge test','进入知识测试')}${I('arrow-right')}</button></div>`;
    target.querySelector('#journey-back-requirements').onclick=()=>switchStage('requirements');
    target.querySelector('#journey-complete-checklist')?.addEventListener('click',()=>switchStage('requirements'));
    if(ranked)bindDevelopment(target,ranked);
    target.querySelector('#seminar-open-knowledge').onclick=async()=>{
      if(opening||!complete||!save())return;opening=true;const button=target.querySelector('#seminar-open-knowledge');button.disabled=true;
      try{await __careerHost.openKnowledge();}
      catch{toast(L('Не удалось открыть тест. Повторите переход.','The test could not be opened. Please try again.','无法打开测试，请重试。'));}
      finally{opening=false;if(button.isConnected)button.disabled=false;}
    };
  }
  function renderResults(){
    const result=getResult(),target=root();if(!result||!target)return;
    target.setAttribute('data-no-i18n','');
    if(!catalogLoaded){navigate('preferences');return;}
    const view=stage();
    if(view!=='recommendations')cancelEmployerVacancyRequests();
    if(view==='profile')renderProfile(result,target);
    else if(view==='recommendations')renderRecommendations(result,target);
    else if(view==='requirements')renderRequirements(result,target);
    else renderSummary(result,target);
  }
  document.addEventListener('app:language',()=>{updateLabels();if(lastRoute==='preferences')renderPreferences();else if(lastRoute==='results')renderResults();});
  updateLabels();void loadCatalog();
  return {
    isReady,guardRoute,renderResults,
    render(route){
      if(lastRoute==='preferences'&&route!=='preferences'){picker?.destroy();picker=null;wishSorter?.destroy();wishSorter=null;}
      if(route!=='results')cancelEmployerVacancyRequests();lastRoute=route;updateLabels();if(route==='preferences')renderPreferences();
    },
    flush:()=>{wishSorter?.cancel({focus:false,announceResult:false});return !dirty||save();},
    updateBusy:()=>catalogLoading||positionsLoading||vacancyBank.isBusy()||opening||Boolean(wishSorter?.isBusy()),
    captureForUpdate:()=>({view:journey.view,authorityQuery,authorityScope,vacancyQuery,vacancyEmployer}),
    restoreForUpdate(value){if(!isRecord(value))return;authorityQuery=safeText(value.authorityQuery,500);authorityScope=safeText(value.authorityScope,80);vacancyQuery=safeText(value.vacancyQuery,500);vacancyEmployer=safeText(value.vacancyEmployer,200);}
  };
}
