import {getLanguage,translate} from './i18n.mjs';
import {authorityEmblem} from './authority-symbols.mjs';
import {authorityName} from './authority-names.mjs';
import {storageKey,readLocal,writeLocal} from './storage.mjs';
import {loadJSON} from './loader.mjs';
import {PORTAL,FRESH_MS,validateFeed,currentStatus,normalizeName} from './vacancies-model.mjs';
import {createRegionPicker} from './region-picker.mjs';
import {expandTerritorialCatalog,mergeTerritorialAuthorityDetails} from './territorial-catalog.mjs';
import {sanitizeJourneyPreferences,rankJourneyAuthorities,compareDesiredAuthorities,buildAuthorityDevelopment,buildVacancyRequirements,summarizeVacancyAssessment,requirementStateFromText} from './career-journey-model.mjs';
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
  let lastRoute='personality',pendingRoute=null,manualSaveTimer=null,picker=null,opening=false,dirty=false,rankingCache=null,catalogGeneration=0;
  let authorityQuery='',authorityScope='',authorityLimit=24,vacancyQuery='',vacancyEmployer='',vacancyLimit=12;
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
    picker?.destroy();picker=null;target.setAttribute('data-no-i18n','');
    if(!catalogLoaded){
      target.innerHTML=`<header class="seminar-results-heading"><h1>${L('Где и кем Вы хотите работать','Where would you like to work?','你希望在哪里工作？')}</h1></header><p role="status">${catalogError?L('Не удалось загрузить каталог. Повторите загрузку.','The catalogue could not be loaded. Please try again.','目录加载失败，请重试。'):L('Загружаем территории и органы власти…','Loading territories and employers…','正在加载地区和机构……')}</p>${catalogError?`<button type="button" class="button button-primary" id="journey-retry-catalog">${L('Повторить','Retry','重试')}</button>`:''}`;
      target.querySelector('#journey-retry-catalog')?.addEventListener('click',()=>{void loadCatalog();renderPreferences();});return;
    }
    target.innerHTML=`<header class="seminar-results-heading"><h1>${L('Где и кем Вы хотите работать','Where would you like to work?','你希望在哪里工作？')}</h1><p>${L('Сначала выберите территории, затем три органа власти или работодателя публичного сектора в порядке Вашего предпочтения. После теста сравним Ваш выбор с рекомендациями.','Choose territories, then rank three public authorities or public-sector employers in order of preference. After the questionnaire, compare your choices with the recommendations.','先选择地区，再按意愿顺序选择三个政府机关或公共部门雇主。完成测试后，可将意向与推荐进行比较。')}</p></header>
      <section class="journey-panel" aria-labelledby="journey-regions-heading"><h2 id="journey-regions-heading">${L('Территории работы','Work territories','工作地区')}</h2><div id="journey-regions"></div></section>
      <section class="journey-panel" aria-labelledby="journey-wishes-heading"><h2 id="journey-wishes-heading">${L('Три желаемых места работы','Three preferred employers','三个意向工作单位')}</h2><p class="journey-muted">${L('Позиция 1 — самый желаемый вариант. Порядок можно изменить стрелками.','Position 1 is your first choice. Use the arrows to change the order.','第1位为首选。可通过箭头调整顺序。')}</p><div id="journey-desired-choices" aria-live="polite"></div>
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
    const target=preferencesRoot()?.querySelector('#journey-desired-choices');if(!target)return;
    const lookup=byId();
    target.innerHTML=`<ol class="journey-wish-slots">${[0,1,2].map(index=>{
      const authority=lookup.get(journey.desiredIds[index]);
      return `<li class="${authority?'is-filled':''}"><span class="journey-priority">${index+1}</span>${authority?`<div><strong>${E(authorityName(authority))}</strong><small>${levelLabel(authority)}</small></div><div class="journey-order-actions"><button type="button" data-move-wish="${index}" data-direction="-1" aria-label="${E(L('Поднять приоритет: ','Move up: ','提高优先级：')+authorityName(authority))}" ${index===0?'disabled':''}>↑</button><button type="button" data-move-wish="${index}" data-direction="1" aria-label="${E(L('Понизить приоритет: ','Move down: ','降低优先级：')+authorityName(authority))}" ${index===journey.desiredIds.length-1?'disabled':''}>↓</button><button type="button" data-remove-wish="${E(authority.id)}" aria-label="${E(L('Убрать: ','Remove: ','移除：')+authorityName(authority))}">×</button></div>`:`<span class="journey-empty-slot">${L('Выберите орган ниже','Choose an employer below','请在下方选择机构')}</span>`}</li>`;
    }).join('')}</ol>`;
    target.querySelectorAll('[data-remove-wish]').forEach(button=>button.onclick=()=>{journey.desiredIds=journey.desiredIds.filter(id=>id!==button.dataset.removeWish);journey.confirmed=false;save();renderDesiredChoices();renderAuthorityOptions();updatePreferenceNext();});
    target.querySelectorAll('[data-move-wish]').forEach(button=>button.onclick=()=>{const from=Number(button.dataset.moveWish),to=from+Number(button.dataset.direction);if(to<0||to>=journey.desiredIds.length)return;[journey.desiredIds[from],journey.desiredIds[to]]=[journey.desiredIds[to],journey.desiredIds[from]];journey.confirmed=false;save();renderDesiredChoices();renderAuthorityOptions();});
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
  function matchBadge(matched){return matched?`<span class="journey-match-badge">${I('check')}${L('Совпало с Вашим выбором','Matches your choice','与你的意向一致')}</span>`:'';}
  function authorityCard(authority,index,result){
    const context=getProfileContext(),matched=journey.desiredIds.includes(authority.id);
    const matches=context.prioritySectors.filter(id=>(authority.pathSectors||authority.sectors||[]).some(sector=>sector.id===id));
    return `<article class="seminar-authority ${matched?'journey-matched':''}" data-recommended-authority="${E(authority.id)}"><div class="seminar-authority-heading">${authorityEmblem(authority,'compact')}<div><span class="seminar-rank">${index+1} · ${levelLabel(authority)}</span><h3>${E(authorityName(authority))}</h3></div></div>${matchBadge(matched)}<p${getLanguage()!=='ru'&&translate(authority.mission)===authority.mission?' lang="ru"':''}>${display(authority.mission)}</p>${authorityDetails(authority)}<div class="seminar-track"><span>${L('Подходящее направление работы','A matching work direction','匹配的工作方向')}</span><strong>${display(authority.track?.title||'')}</strong>${matches.length?`<p>${L('Ваши сферы','Your policy areas','你的领域')}: ${matches.map(id=>display(context.sectors.find(sector=>sector.id===id)?.title||id)).join(', ')}.</p>`:''}</div><button type="button" class="button button-secondary journey-card-button" data-authority-vacancies="${E(authority.id)}">${L('Должности и требования','Roles and requirements','职位与要求')}${I('arrow-right')}</button></article>`;
  }
  function choiceComparison(ranked){
    const desired=compareDesiredAuthorities(journey.desiredIds,ranked.ranked,ranked);
    const compact=(authority,index,matched,preferred)=>`<li class="journey-compare-item ${matched?'journey-matched':''}"><span class="journey-priority">${index+1}</span><div><strong>${E(authorityName(authority))}</strong><small>${levelLabel(authority)}</small>${matched?`<span class="journey-match-text">✓ ${preferred?L('Есть в рекомендациях','Among recommendations','在推荐中'):L('Есть в Вашем выборе','Among your choices','在你的意向中')}</span>`:''}</div></li>`;
    return `<section class="journey-comparison" aria-labelledby="journey-comparison-title"><h2 id="journey-comparison-title">${L('Ваш выбор и результат теста','Your choices and the test result','你的意向与测试结果')}</h2><div class="journey-comparison-columns"><div><h3>${L('Ваши три приоритета','Your three priorities','你的三个优先意向')}</h3><ol>${desired.map((item,index)=>compact(item.authority||byId().get(item.authorityId),index,item.matched,true)).join('')}</ol></div><div><h3>${L('Три наиболее близких варианта','Three closest matches','最匹配的三个选项')}</h3><ol>${ranked.ranked.slice(0,3).map((authority,index)=>compact(authority,index,journey.desiredIds.includes(authority.id),false)).join('')}</ol></div></div><p class="journey-muted">${L('Зелёная рамка отмечает совпадение желаемого места работы с одной из рекомендаций ниже. Порядок Ваших желаний сохранён.','A green border marks a preferred employer included in the recommendations below. Your original preference order is preserved.','绿色边框表示意向单位出现在下方推荐中。你的原始意向顺序保持不变。')}</p></section>`;
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
    target.innerHTML=`<header class="seminar-results-heading"><button type="button" class="seminar-back-profile" id="seminar-back-profile">${I('arrow-left')}${L('Мой профиль','My profile','我的画像')}</button><h1>${L('Ваши направления работы','Your career directions','你的职业方向')}</h1><p>${L('Три рекомендации для федерального уровня и публичного сектора, затем по три для каждой выбранной территории. Наличие вакансий не влияет на подбор органов.','Three recommendations at federal and public-sector level, followed by three for each selected territory. Employers are recommended independently of vacancy availability.','先展示联邦层级和公共部门的三个推荐，再展示每个所选地区的三个推荐。机构推荐不取决于是否存在空缺职位。')}</p></header>${choiceComparison(ranked)}
      <section class="journey-recommendation-group" data-recommendation-group="federal"><h2>${L('Федеральный уровень и публичный сектор','Federal level and public sector','联邦层级与公共部门')}</h2><div class="seminar-authorities">${ranked.federal.map((a,i)=>authorityCard(a,i,result)).join('')}</div></section>
      ${ranked.regions.map(group=>{const region=regions.find(r=>r.id===group.regionId);return `<section class="journey-recommendation-group" data-recommendation-group="${E(group.regionId)}"><h2>${E(regionName(region))}</h2><p class="journey-muted">${L('Региональные и муниципальные органы','Regional and municipal authorities','地区与市政机关')}</p><div class="seminar-authorities">${group.authorities.map((a,i)=>authorityCard(a,i,result)).join('')}</div>${group.authorities.length<3?`<p class="journey-muted">${L('В каталоге пока меньше трёх подходящих записей этой территории.','The catalogue currently contains fewer than three matching records for this territory.','该地区目录中目前少于三个匹配记录。')}</p>`:''}</section>`;}).join('')}
      <button type="button" class="seminar-back-profile journey-edit-preferences" id="journey-edit-preferences">${L('Изменить территории и желаемые места','Edit territories and preferred employers','修改地区与意向单位')}</button>${wishDevelopment(ranked)}
      <section class="seminar-vacancy-section" id="journey-vacancy-section"><h2>${L('Выберите должность для разбора','Choose a role to examine','选择要分析的职位')}</h2><p class="seminar-task">${L('Изучите обязанности и источник, затем отметьте по каждому требованию, чему Вы уже соответствуете и что предстоит освоить.','Review the duties and source, then mark which requirements you already meet and which you need to develop.','了解职责与来源，然后逐项标记已符合的要求及需要提升的部分。')}</p><div id="seminar-vacancies"></div></section>
      <div class="seminar-next"><p>${L('Перед тестом знаний Вы увидите итоговый план: свой профиль, требования выбранной должности и конкретные шаги развития.','Before the knowledge test, you will see your interest profile, the selected role requirements and your development steps.','知识测试前，你将看到兴趣画像、所选职位要求和具体发展步骤。')}</p><button type="button" class="button button-primary button-large" id="journey-show-plan">${L('Мой план развития','My development plan','我的发展计划')}${I('arrow-right')}</button></div>`;
    target.querySelector('#seminar-back-profile').onclick=()=>switchStage('profile');
    target.querySelector('#journey-edit-preferences').onclick=changePreferences;
    target.querySelector('#journey-show-plan').onclick=()=>switchStage('summary');
    target.querySelectorAll('[data-authority-vacancies]').forEach(button=>button.onclick=()=>{vacancyEmployer=button.dataset.authorityVacancies;vacancyLimit=12;renderVacancies();document.querySelector('#journey-vacancy-section')?.scrollIntoView({block:'start',behavior:'instant'});});
    bindDevelopment(target,ranked);bindAuthorityDetails(target);renderVacancies();void loadVacancies();
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
      if(!manifest){positionsError=true;positions=[];}
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
        if(lastRoute==='results'&&['requirements','summary'].includes(stage()))renderResults();else renderVacancies();
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
  function vacancyCard(v){
    const selected=journey.selectedVacancyId===v.id,sourceDate=date(v.source?.retrievedAt||v.lastSeenAt||v.sourceSnapshotAt);
    const req=buildVacancyRequirements(v),requirementsCount=req.rows.filter(row=>row.assessable).length;
    const fields=[[L('Место работы','Location','工作地点'),typeof v.location==='string'?v.location:v.location?.text],
      [L('Источник получен','Source retrieved','来源获取日期'),sourceDate],[L('Приём до','Apply by','申请截止'),date(v.deadline)],
      [L('Оплата','Pay','报酬'),typeof v.salary==='string'?v.salary:v.salary?.rawText]].filter(([,value])=>value);
    return `<article class="seminar-vacancy ${selected?'is-selected':''}" data-vacancy-id="${E(v.id)}"><span class="seminar-vacancy-status">${roleStatus(v)}</span><h3 lang="ru">${E(v.title)}</h3><p class="seminar-employer" lang="ru">${E(v.employerName)}</p>${v.department?`<p lang="ru">${E(v.department)}</p>`:''}<dl>${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${E(value)}</dd></div>`).join('')}</dl><p class="journey-requirement-count">${L('Пунктов для самооценки','Self-assessment items','自评项目数')}: ${requirementsCount}</p><a class="seminar-vacancy-link" href="${safeURL(v.url||v.source?.url)}" target="_blank" rel="noopener noreferrer">${L('Открыть источник','Open source','打开来源')}${I('external')}</a><button type="button" class="button ${selected?'button-secondary':'button-primary'} journey-card-button" data-select-vacancy="${E(v.id)}">${selected?L('Продолжить разбор','Continue assessment','继续分析'):L('Разобрать требования','Assess requirements','分析职位要求')}${I('arrow-right')}</button></article>`;
  }
  function renderVacancies(){
    const target=document.querySelector('#seminar-vacancies');if(!target)return;
    const ranked=rankings(),eligible=visibleInstitutions(),interestIds=new Set([...(ranked?.recommendations||[]).map(a=>a.id),...journey.desiredIds]);
    const all=roleRecords(),sourceCounts=new Map();for(const v of all)sourceCounts.set(v.institutionId,(sourceCounts.get(v.institutionId)||0)+1);
    let list=all.filter(v=>(vacancyEmployer==='all'||vacancyEmployer?vacancyEmployer==='all'||v.institutionId===vacancyEmployer:interestIds.has(v.institutionId))&&(!vacancyQuery||normalizeName([v.title,v.employerName,v.department].join(' ')).includes(normalizeName(vacancyQuery))));
    list.sort((a,b)=>Number(b.currentRecruitmentVerified===true)-Number(a.currentRecruitmentVerified===true)||Number(journey.desiredIds.includes(b.institutionId))-Number(journey.desiredIds.includes(a.institutionId))||Number(a.kind==='position-profile')-Number(b.kind==='position-profile')||a.title.localeCompare(b.title,'ru'));
    const employerOptions=eligible.filter(a=>interestIds.has(a.id)||sourceCounts.has(a.id)||a.id===vacancyEmployer).sort((a,b)=>Number(interestIds.has(b.id))-Number(interestIds.has(a.id))||authorityName(a).localeCompare(authorityName(b),getLanguage()));
    const chosenEmployer=byId().get(vacancyEmployer);
    const employerUrl=safeURL(chosenEmployer?.governmentUrl||chosenEmployer?.descriptionSources?.[0]?.url);
    target.innerHTML=`<p class="seminar-source-note" role="status">${E(sourceNote())}</p>${positionsError?`<p class="journey-source-status">${L('Часть источников не загрузилась. Доступные материалы сохранены.','Some sources could not be loaded. Available materials are still shown.','部分来源未能加载，已加载的材料仍可查看。')} <button type="button" class="journey-text-button" id="journey-retry-positions">${L('Повторить загрузку','Retry loading','重新加载')}</button></p>`:''}
      <div class="journey-search-row"><label for="journey-vacancy-employer">${L('Орган или организация','Authority or employer','机关或机构')}<select id="journey-vacancy-employer"><option value="">${L('Рекомендации и мои цели','Recommendations and my choices','推荐与我的意向')}</option><option value="all">${L('Все органы выбранных территорий','All employers in selected territories','所选地区的所有机构')}</option>${employerOptions.map(a=>`<option value="${E(a.id)}">${E(authorityName(a))}${sourceCounts.has(a.id)?' · '+sourceCounts.get(a.id):''}</option>`).join('')}</select></label><label for="journey-vacancy-search">${L('Поиск должности','Find a role','查找职位')}<input type="search" id="journey-vacancy-search" value="${E(vacancyQuery)}" autocomplete="off"></label></div>
      <p class="journey-result-count">${L('Найдено должностей и материалов','Roles and source materials found','找到的职位和资料')}: ${number(list.length)}</p><div class="seminar-vacancy-grid">${list.slice(0,vacancyLimit).map(vacancyCard).join('')}</div>${!list.length?`<p class="seminar-vacancy-empty">${positionsLoading?L('Подбираем материалы…','Finding materials…','正在查找材料……'):L('В сохранённых источниках нет подходящего объявления. Проверьте кадровый раздел органа или портал Госслужба; выбранное объявление можно добавить ниже.','The saved sources contain no matching announcement. Check the employer’s careers page or the official portal; you can add a selected announcement below.','已保存来源中没有匹配公告。请查看机构招聘页面或官方门户，也可在下方添加选定公告。')}</p>`:''}
      ${list.length>vacancyLimit?`<button type="button" class="button button-secondary journey-more" id="journey-more-vacancies">${L('Показать ещё','Show more','显示更多')}</button>`:''}
      <div class="journey-source-links">${employerUrl?`<a class="button button-secondary" href="${employerUrl}" target="_blank" rel="noopener noreferrer">${L('Страница выбранного органа','Selected employer’s website','所选机构网站')}${I('external')}</a>`:''}<a href="${PORTAL}/vacancy/" target="_blank" rel="noopener noreferrer" class="button button-secondary button-large seminar-portal-link">${L('Поиск вакансий на Госслужбе','Search the official civil service portal','在公务员官方门户搜索职位')}${I('external')}</a></div>${manualVacancyForm(eligible)}`;
    target.querySelector('#journey-vacancy-employer').value=vacancyEmployer;
    target.querySelector('#journey-vacancy-employer').onchange=event=>{vacancyEmployer=event.target.value;vacancyLimit=12;renderVacancies();};
    target.querySelector('#journey-vacancy-search').oninput=event=>{
      const cursor=event.target.selectionStart;vacancyQuery=event.target.value;vacancyLimit=12;renderVacancies();const input=document.querySelector('#journey-vacancy-search');input.focus();try{input.setSelectionRange(cursor,cursor);}catch{}
    };
    target.querySelector('#journey-more-vacancies')?.addEventListener('click',()=>{vacancyLimit+=12;renderVacancies();});
    target.querySelector('#journey-retry-positions')?.addEventListener('click',()=>{positionsLoaded=false;void loadVacancies();});
    target.querySelectorAll('[data-select-vacancy]').forEach(button=>button.onclick=()=>{
      const vacancy=roleRecords().find(v=>v.id===button.dataset.selectVacancy);if(!vacancy)return;
      journey.selectedVacancyId=vacancy.id;
      const {fullDescription,...snapshot}=vacancy;journey.selectedSnapshot=snapshot;
      if(!isRecord(journey.assessments[vacancy.id]))journey.assessments[vacancy.id]={};save();switchStage('requirements');
    });
    bindManualVacancy(target);
  }
  function manualVacancyForm(eligible){
    const draft=isRecord(journey.manualDraft)?journey.manualDraft:{};
    const chosen=eligible.find(a=>a.id===draft.employer)||eligible.find(a=>a.id===vacancyEmployer)||eligible.find(a=>a.id===journey.desiredIds[0]);
    const options=[...eligible].sort((a,b)=>authorityName(a).localeCompare(authorityName(b),getLanguage()));
    return `<details class="journey-manual-source" ${draft.open?'open':''}><summary>${L('Добавить выбранное объявление','Add a selected announcement','添加选定公告')}</summary><form id="journey-manual-vacancy"><p>${L('Откройте официальный источник и перенесите точные формулировки. Каждый отдельный пункт начинайте с новой строки; альтернативные условия сохраняйте вместе.','Open the official source and copy the exact wording. Start each separate item on a new line; keep alternative conditions together.','请打开官方来源并复制准确表述。每个独立项目另起一行，替代性条件须保留在同一项中。')}</p><div class="journey-search-row"><label>${L('Орган или организация','Authority or employer','机关或机构')}<select name="employer" required>${options.map(a=>`<option value="${E(a.id)}" ${a.id===chosen?.id?'selected':''}>${E(authorityName(a))}</option>`).join('')}</select></label><label>${L('Название должности','Role title','职位名称')}<input name="title" required maxlength="500" value="${E(safeText(draft.title,500))}"></label></div><label class="journey-field">${L('Ссылка на источник','Source URL','来源链接')}<input type="url" name="url" required placeholder="https://" maxlength="2000" value="${E(safeText(draft.url,2000))}"></label><div class="journey-manual-grid">${['education','experience','knowledge','skills'].map(id=>`<label>${groupLabel(id)}<textarea name="${id}" rows="4" maxlength="20000">${E(safeText(draft[id]))}</textarea></label>`).join('')}</div><p class="journey-form-error" id="journey-manual-error" role="alert"></p><button class="button button-primary" type="submit">${L('Сохранить и разобрать','Save and assess','保存并分析')}${I('arrow-right')}</button></form></details>`;
  }
  function captureManualDraft(form){
    journey.manualDraft=Object.fromEntries(['employer','title','url','education','experience','knowledge','skills'].map(name=>[name,safeText(form.elements[name]?.value,name==='title'?500:name==='url'?2000:name==='employer'?200:20000)]));
    journey.manualDraft.open=form.closest('details')?.open===true;dirty=true;
    if(manualSaveTimer)clearTimeout(manualSaveTimer);
    manualSaveTimer=setTimeout(()=>{manualSaveTimer=null;if(!__careerHost.destroyed)save();},500);
  }
  function bindManualVacancy(target){
    const draftForm=target.querySelector('#journey-manual-vacancy');
    draftForm?.addEventListener('input',()=>captureManualDraft(draftForm));
    draftForm?.addEventListener('change',()=>captureManualDraft(draftForm));
    draftForm?.closest('details')?.addEventListener('toggle',()=>{if(draftForm.isConnected)captureManualDraft(draftForm);});
    target.querySelector('#journey-manual-vacancy')?.addEventListener('submit',event=>{
      event.preventDefault();const form=event.currentTarget,values=new FormData(form),authority=byId().get(String(values.get('employer')));
      const title=safeText(values.get('title'),500),url=safeText(values.get('url'),2000);
      const requirements=['education','experience','knowledge','skills'].flatMap(category=>safeText(values.get(category)).split(/\n+/).map(text=>text.trim()).filter(Boolean).map((text,index)=>({id:`${category}-${index+1}`,category,sourceText:text,requirementState:requirementStateFromText(text),selfAssessmentEligible:true,sourceLocator:L('Перенесено студентом из объявления','Copied from the announcement by the student','由学生从公告复制')})));
      const error=target.querySelector('#journey-manual-error');
      if(!title||!safeURL(url)||!authority||!requirements.length){error.textContent=L('Укажите должность, действительную ссылку и хотя бы одно требование из источника.','Enter a role title, a valid source URL and at least one requirement from the source.','请填写职位名称、有效来源链接及至少一项原文要求。');return;}
      const id='student-source-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
      const vacancy={id,institutionId:authority.id,employerName:authority.name,title,url,regionId:authority.regionId||null,userProvided:true,kind:'vacancy',status:'unconfirmed',source:{url,retrievedAt:new Date().toISOString(),format:'student-transcription'},requirements,coverage:{requirements:'student-transcription'}};
      journey.customVacancies=[...journey.customVacancies,vacancy].slice(-20);journey.selectedVacancyId=id;journey.selectedSnapshot=vacancy;journey.assessments[id]={};journey.manualDraft={};save();switchStage('requirements');
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
    const duties=typeof vacancy.duties==='string'?vacancy.duties:Array.isArray(vacancy.duties)?vacancy.duties.map(item=>typeof item==='string'?item:item.sourceText||item.text||'').filter(Boolean).join('\n'):'';
    target.innerHTML=`<header class="seminar-results-heading"><button type="button" class="seminar-back-profile" id="journey-back-vacancies">${I('arrow-left')}${L('К выбору должности','Back to role selection','返回职位选择')}</button><span class="journey-kicker">${roleStatus(vacancy)}</span><h1>${L('Требования выбранной должности','Selected role requirements','所选职位要求')}</h1><h2 lang="ru">${E(vacancy.title)}</h2><p lang="ru">${E(vacancy.employerName)}</p>${vacancy.department?`<p lang="ru">${E(vacancy.department)}</p>`:''}<a class="seminar-vacancy-link" href="${sourceURL}" target="_blank" rel="noopener noreferrer">${L('Источник требований','Requirements source','要求来源')}${I('external')}</a><p class="journey-muted">${L('Источник получен','Source retrieved','来源获取日期')}: ${date(vacancy.source?.retrievedAt||vacancy.lastSeenAt||vacancy.sourceSnapshotAt)||L('дата не указана','date not stated','未注明日期')}</p></header>
      ${duties?`<details class="journey-duties"><summary>${L('Должностные обязанности','Duties','工作职责')}</summary><p lang="ru">${E(duties)}</p></details>`:''}
      <p class="journey-assessment-intro">${L('Отметьте каждый пункт. Знания и умения, которые предстоит освоить, войдут в Ваш план развития; образование и стаж будут показаны отдельно.','Assess every item. Knowledge and skills to develop will enter your development plan; education and experience will be shown separately.','请逐项评估。需要掌握的知识和技能将加入发展计划；学历与工作经历将单独显示。')}</p>${missingSourceNote(requirements)}${!summary.total?`<p class="journey-source-status">${L('В этой карточке нет пунктов для самооценки. Откройте источник и добавьте точные требования или выберите другой материал.','This card has no assessable items. Open the source and add its exact requirements, or choose another material.','此卡片没有可评估项目。请打开来源并添加原文要求，或选择其他材料。')}</p>`:''}${requirements.missingCategories.length?`<button type="button" class="button button-secondary" id="journey-supplement-requirements">${L('Дополнить из источника','Add requirements from the source','从来源补充要求')}</button>`:''}
      <div class="journey-assessment-progress"><p id="journey-assessment-state" role="status" aria-live="polite">${E(assessmentProgress(summary))}</p><progress id="journey-assessment-progress" max="${Math.max(1,summary.total)}" value="${summary.assessed}" aria-label="${E(L('Отмеченные требования','Assessed requirements','已评估要求'))}"></progress></div>
      <div class="journey-requirements">${summary.groups.filter(group=>group.rows.length).map(group=>`<section class="journey-requirement-group" aria-labelledby="requirement-heading-${group.id}"><h2 id="requirement-heading-${group.id}">${groupLabel(group.id)}</h2>${group.rows.map(row=>requirementRow(row,row.assessable?++index:0,vacancy.url||vacancy.source?.url)).join('')}</section>`).join('')}</div>
      <div class="seminar-next"><p>${L('Отметки сохраняются автоматически. Их можно изменить, вернувшись к этой должности.','Your answers are saved automatically. Return to this role to revise them.','回答会自动保存，返回该职位即可修改。')}</p><button type="button" class="button button-primary button-large" id="journey-open-plan">${L('Посмотреть план развития','View my development plan','查看发展计划')}${I('arrow-right')}</button></div>`;
    target.querySelector('#journey-back-vacancies').onclick=()=>switchStage('recommendations');
    target.querySelector('#journey-open-plan').onclick=()=>switchStage('summary');
    target.querySelector('#journey-supplement-requirements')?.addEventListener('click',()=>{
      vacancyEmployer=vacancy.institutionId;switchStage('recommendations');
      const details=document.querySelector('.journey-manual-source'),form=document.querySelector('#journey-manual-vacancy');
      if(!details||!form)return;details.open=true;
      form.elements.title.value=vacancy.title;form.elements.url.value=vacancy.url||vacancy.source?.url||'';
      for(const category of ['education','experience','knowledge','skills'])form.elements[category].value=requirements.rows.filter(row=>row.category===category&&row.text).map(row=>row.text).join('\n');
      captureManualDraft(form);
      details.scrollIntoView({block:'start',behavior:'instant'});form.elements.knowledge.focus({preventScroll:true});
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
      if(lastRoute==='preferences'&&route!=='preferences'){picker?.destroy();picker=null;}
      lastRoute=route;updateLabels();if(route==='preferences')renderPreferences();
    },
    flush:()=>!dirty||save(),
    updateBusy:()=>catalogLoading||positionsLoading||opening,
    captureForUpdate:()=>({view:journey.view,authorityQuery,authorityScope,vacancyQuery,vacancyEmployer}),
    restoreForUpdate(value){if(!isRecord(value))return;authorityQuery=safeText(value.authorityQuery,500);authorityScope=safeText(value.authorityScope,80);vacancyQuery=safeText(value.vacancyQuery,500);vacancyEmployer=safeText(value.vacancyEmployer,200);}
  };
}
