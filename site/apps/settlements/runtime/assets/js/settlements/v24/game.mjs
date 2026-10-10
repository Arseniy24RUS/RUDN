import {World,change,haversine} from '../v2/engine.mjs';
import {loadRegion,DATA,json,compressed,art} from '../v2/data.mjs';
import {RULES_VERSION,FIXED_TRANSPORT_RULES_VERSION,NEW_RULES_VERSION,TELECOM_RULES_VERSION,SERIALIZED_ACTIONS_RULES_VERSION,INITIAL_NETWORK_SAVE_RULES_VERSION,ROUTE_LIMIT_SAVE_RULES_VERSION,towerSpec,MAX_TOWER_BATCH,MAX_ROUTE_STOPS,MAX_ROUTE_DISTANCE_KM,TRANSPORT_PRICES,CATALOG,createState,evaluate,preview,apply,undo,restore,exportSave,tutorialInstruction,totalTutorialSteps} from './engine.mjs';
import {createIntroScenario,createRegionalScenario,CURATED_REGIONS} from './scenarios.mjs';
import {loadDistanceTransportPolicy} from './transport-policy-v2.mjs';
import {loadTelecomPlan} from './telecom-plans.mjs';
import {loadSocialPlan} from './social-plans.mjs';
import {SOCIAL_RULES_VERSION,isPopulationSocialScenario,socialAccessLimits} from './social-policy.mjs';
import {initialTowerThresholdFor} from './telecom-policy.mjs';
import {INITIAL_TOWER_POLICY_VERSION} from './initial-tower-spacing.mjs';
import {withPlayableRegionScope,playableRows} from './region-playability.mjs';
import {GameMap,isRouteAction,isTowerAction,facilityInLayer} from './map.mjs';
import {symbolSvg,SERVICE_COLORS} from './symbols.mjs';
import {uiIcon} from './ui-icons.mjs';
import {createStorage,downloadSave} from './storage.mjs';
import {FEDERAL_CITIES,appendFederalCities,loadFederalBoundary,combineFederalBoundary,releaseFederalBoundary} from './federal-cities.mjs';
import {createTaskGuide} from './task-guide.mjs';
import {classifyCompletion} from './platform-rules.mjs';
import {createGameTranslator} from './i18n.mjs';

const NAMES={population:'Население',telecom:'Связь',medical:'Медицина',school:'Образование',culture:'Культура'};
const TOOLS={tower:'Вышка',medical:'Клиника',school:'Школа',culture:'Центр досуга',connect:'Транспорт',outreach:'Выезд врача'};
const objectName=service=>service==='culture'||service==='outreach'?TOOLS[service]:CATALOG[service]?.name;
const PRICES={tower:12,medical:32,school:48,culture:22,connect:8,outreach:9};
const DRIVE_SPEED_KMH=50;
const distanceRules=version=>[NEW_RULES_VERSION,TELECOM_RULES_VERSION,SOCIAL_RULES_VERSION].includes(version);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(value||0);
const populationText=value=>Number.isFinite(value)?num(value)+' жителей':'Численность неизвестна';
const moneyNumber=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value||0);
const money=value=>moneyNumber(value)+' млн ₽';
const routeNumber=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value);
const deltaText=(service,delta)=>`${NAMES[service]}: ещё ${num(delta.people)} жителей · ${delta.newlyFullIds?.length?`полностью обеспечено ${delta.newlyFullIds.length} пос.`:`доступ лучше в ${delta.improvedIds?.length||0} пос.`}`;
const layerIcon=kind=>kind==='population'?uiIcon(kind):symbolSvg(kind);
const curatedIds=()=>Array.isArray(CURATED_REGIONS)?CURATED_REGIONS.map(x=>typeof x==='string'?x:x.id):Object.keys(CURATED_REGIONS||{});
const savedMode=value=>value?.scenarioId?.startsWith('intro-')?'intro':value?.scenarioId?.startsWith('free-')?'free':value?.scenarioId?.startsWith('campaign-')?'campaign':null;
export const DIFFICULTIES=Object.freeze([{id:'easy',name:'Лёгкая',description:'Около 10–15 действий на слой'},{id:'normal',name:'Обычная',description:'До 100 действий на слой'},{id:'hard',name:'Сложная',description:'Сотни действий в больших регионах'}].map(Object.freeze));
export function normalizeDifficulty(value){if(value===null||value===undefined||value==='')return 'normal';if(DIFFICULTIES.some(d=>d.id===value))return value;throw new Error('Неизвестная сложность партии. Выберите лёгкую, обычную или сложную.');}
export const scenarioKey=(regionId,mode,version,difficulty='normal')=>mode==='intro'?`intro-chelyabinsk-7${version>1?`-v${version}`:''}`:`${mode}-${regionId}-v${version}${version===5?`-${normalizeDifficulty(difficulty)}`:''}`;
export function partyUrl(current,{version,regionId,mode,difficulty}){const url=new URL(current);url.searchParams.set('rules',`3.${version-1}`);url.searchParams.set('region',regionId);url.searchParams.set('scenario',mode);if(version===5)url.searchParams.set('difficulty',mode==='intro'?'normal':normalizeDifficulty(difficulty));else url.searchParams.delete('difficulty');return url;}
const savedEngineRules=value=>[SERIALIZED_ACTIONS_RULES_VERSION,INITIAL_NETWORK_SAVE_RULES_VERSION,ROUTE_LIMIT_SAVE_RULES_VERSION].includes(value?.rulesVersion)?value.engineRulesVersion:value?.rulesVersion;
export const savedScenarioVersion=value=>{const rules=savedEngineRules(value);if(rules===RULES_VERSION&&value.scenarioVersion===1)return 1;if(rules===FIXED_TRANSPORT_RULES_VERSION&&value.scenarioVersion===2)return 2;if(rules===NEW_RULES_VERSION&&value.scenarioVersion===3)return 3;if(rules===TELECOM_RULES_VERSION&&value.scenarioVersion===4)return 4;if(rules===SOCIAL_RULES_VERSION&&value.scenarioVersion===5)return 5;throw new Error('Неизвестная версия правил или сценария. Текущее прохождение не изменено.');};
/** Storage lookup is read-only: each 3.4 difficulty owns a separate replay key. */
export function partySelection({storage,params,regionId,mode,imported=null,restart=false,requestedDifficulty=null}){
  const explicitProfile=requestedDifficulty!==null||params.has('difficulty'),profile=mode==='intro'?'normal':normalizeDifficulty(requestedDifficulty??params.get('difficulty'));
  if(imported&&savedScenarioVersion(imported)!==5)throw new Error('Этот файл относится к прежней разработческой версии. Откройте новую партию.');
  let stored=imported;
  if(!stored&&!restart){
    const resume=storage.resume();
    if(!explicitProfile&&resume?.scenarioVersion===5&&savedEngineRules(resume)===SOCIAL_RULES_VERSION&&resume?.regionId===regionId&&savedMode(resume)===mode)stored=storage.load(resume.id||resume.scenarioId);
    if(!stored)stored=storage.load(scenarioKey(regionId,mode,5,profile));
  }
  if(stored&&savedScenarioVersion(stored)!==5)stored=null;
  return {stored,version:5,difficulty:mode==='intro'?'normal':normalizeDifficulty(stored?.difficulty??profile)};
}
export function layerProgress(service,scenario){
  const settlements=isPopulationSocialScenario(scenario),total=settlements?service?.total:service?.demandUnits,covered=settlements?service?.covered:service?.servedUnits,known=total>0;
  return {known,settlements,percent:known?(covered>=total?100:Math.max(0,Math.min(99.9,Math.floor(covered/total*1000)/10))):null,covered,total};
}
/** The independent tutorial names the unmet result, never a prescribed placement. */
export function tutorialObjective(evaluation){
  for(const service of ['telecom','medical','school','culture']){
    const missingIds=evaluation?.services?.[service]?.missingIds;
    if(missingIds?.length){
      const n=missingIds.length,word=n%10===1&&n%100!==11?'поселение':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'поселения':'поселений';
      return {service,ids:missingIds.slice(),title:`${NAMES[service]}: осталось ${n} ${word}`};
    }
  }
  return null;
}

export async function mountPuzzle(root,params=new URLSearchParams(),options={}){
  const embedded=Boolean(options.embedded),translator=createGameTranslator(options.locale||'ru');
  const t=(source,values)=>translator.text(source,values),localize=()=>translator.localize(root);
  const num=value=>translator.number(value||0,{maximumFractionDigits:0});
  const moneyNumber=value=>translator.number(value||0,{maximumFractionDigits:1});
  const money=value=>t('{amount} млн ₽',{amount:moneyNumber(value)});
  const routeNumber=value=>translator.number(value,{maximumFractionDigits:1});
  const populationText=value=>Number.isFinite(value)?t('{count} жителей',{count:num(value)}):t('Численность неизвестна');
  const deltaText=(service,delta)=>t('{service}: ещё {count} жителей · {coverage}',{service:t(NAMES[service]),count:num(delta.people),coverage:delta.newlyFullIds?.length?t('полностью обеспечено {count} пос.',{count:num(delta.newlyFullIds.length)}):t('доступ лучше в {count} пос.',{count:num(delta.improvedIds?.length||0)})});
  // Embedded parties use only the host's owner-scoped durable storage. Never
  // read autonomous saves, including the autonomous tutorial-completed marker.
  const storage=embedded?{preferences:()=>({}),setPreferences:()=>{},load:()=>null,resume:()=>null,save:()=>{},introDone:()=>true,finishIntro:()=>{}}:createStorage();
  const abort=new AbortController(),media=matchMedia('(prefers-reduced-motion: reduce)');
  let readOnly=Boolean(options.readOnly),terminalReason=null,completionSent=false,classification=null,saveQueue=Promise.resolve(),lastSaveFailure=null,dialogSource=null;
  const hostAbort=()=>destroy();
  options.signal?.addEventListener('abort',hostAbort,{once:true});
  if(options.signal?.aborted){abort.abort();throw new DOMException('Game mount aborted','AbortError');}
  let preferences=storage.preferences(),world,scenario,state,ev,map,basemap,manifest,mode='intro',difficulty='normal',activeLayer='telecom',activeTool='tower';
  let selectedId=null,selectedFacilityId=null,selectedPosition=null,towerPositions=[],routeFrom=null,routeStops=[],targetEdge=null,q=null,guide=null,lastResult=null,saveError='',loading=false,disposed=false,request=0;
  let toolsOpen=false,inlineHelp='',dialogOpener=null,retryTarget=null;
  const reduced=()=>Boolean(preferences.reducedMotion||media.matches);
  const listen=(node,event,handler,options={})=>node.addEventListener(event,handler,{...options,signal:abort.signal});
  root.classList.add('puzzle');root.classList.toggle('puzzle-embedded',embedded);root.innerHTML=`
    <div class="puzzle-map" tabindex="0" role="application" aria-label="Карта. Перемещайте стрелками, масштабируйте плюс и минус. Поиск поселений доступен кнопкой Поиск."></div>
    <header class="puzzle-header" data-map-obstacle><div class="header-actions"><button class="icon-button" data-act="menu" aria-label="Меню игры">${uiIcon('menu')}</button></div><a class="puzzle-brand" href="#" data-act="home" aria-label="Меню игры">Учебная группа</a><button class="budget" data-act="budget"></button><div class="header-actions"><button class="icon-button" data-act="undo" aria-label="Отменить последний ход" title="Отменить ход">${uiIcon('undo')}</button></div></header>
    <aside class="puzzle-sidebar">
      <section class="puzzle-mission panel" data-map-obstacle aria-label="Текущая задача"></section>
      <div class="puzzle-build" data-map-obstacle><button class="tools-toggle panel" data-act="tools" aria-expanded="false" aria-controls="action-panel">${uiIcon('tools')}<span>Построить</span>${uiIcon('chevron')}</button></div>
      <section class="puzzle-layer" aria-label="Слой карты"></section>
      <section id="action-panel" class="puzzle-dock panel" data-map-obstacle aria-label="Действие"></section>
    </aside>
    <div class="puzzle-camera" data-map-obstacle><button class="icon-button" data-act="search" aria-label="Поиск поселения" title="Поиск поселения">${uiIcon('search')}</button><button class="icon-button" data-act="zoom-in" aria-label="Приблизить карту">${uiIcon('plus')}</button><button class="icon-button" data-act="zoom-out" aria-label="Отдалить карту">${uiIcon('minus')}</button></div>
    <div class="puzzle-message" role="status" aria-live="polite" aria-atomic="true"></div>
    <dialog class="puzzle-dialog"></dialog><input class="puzzle-import" type="file" accept="application/json,.json" hidden>
    <div class="puzzle-loading" aria-live="polite"><span class="loader-mark">↗</span><h1>Система расселения</h1><p>Открываем учебную группу…</p></div>`;
  const $=selector=>root.querySelector(selector),instruction=()=>scenario?.kind==='intro'?tutorialInstruction(world,scenario,state):null;
  const currentTask=()=>guide&&ev?guide.read(ev).current:null;
  const targetIds=()=>scenario?.kind==='intro'?scenario.targetIds:currentTask()?[currentTask().id]:[];
  const row=id=>world?.row(id),titleFor=id=>row(id)?.name||id;
  const difficultySelector=()=>`<label class="field-label" for="game-difficulty">Сложность новой или сохранённой партии</label><select id="game-difficulty" aria-describedby="difficulty-description">${DIFFICULTIES.map(d=>`<option value="${d.id}" ${difficulty===d.id?'selected':''}>${d.name} — ${d.description}</option>`).join('')}</select><p id="difficulty-description" class="muted">${DIFFICULTIES.find(d=>d.id===difficulty).description}. У каждой сложности своё сохранение.</p>`;
  const selectedDifficulty=()=>normalizeDifficulty($('#game-difficulty')?.value||difficulty);
  function message(text,error=false){if(!text&&saveError){text=saveError;error=true;}const node=$('.puzzle-message');node.textContent=t(text);node.classList.toggle('error',error);node.classList.toggle('visible',!!text);localize();}
  function showDialog(title,body,cls=''){
    dialogSource={title,body,cls};const d=$('dialog');if(!d.open)dialogOpener=root.getRootNode().activeElement||root.ownerDocument.activeElement;else d.close();d.className='puzzle-dialog '+cls;d.innerHTML=`<header><h2 id="puzzle-dialog-title">${esc(title)}</h2><button class="icon-button" data-act="close" aria-label="Закрыть">${uiIcon('close')}</button></header><div class="dialog-body">${body}</div>`;d.setAttribute('aria-labelledby','puzzle-dialog-title');localize();d.scrollTop=0;d.showModal();d.scrollTop=0;d.querySelector('[data-act="close"]').focus({preventScroll:true});return d;
  }
  function closeDialog(){const d=$('dialog');if(!d.open)return;d.close();dialogSource=null;const target=dialogOpener?.isConnected?dialogOpener:$('.puzzle-map');target.focus({preventScroll:true});dialogOpener=null;}
  function snapshotSave(){return {...exportSave(state),ui:{mode,activeLayer,...(guide?{taskGuide:guide.export()}: {}),...(embedded&&terminalReason?{terminalReason}: {})}};}
  function snapshot(){return state?{save:snapshotSave(),evaluation:structuredClone(ev),status:terminalReason||classification?.status||'playing',metrics:{spentMillionRub:state.spent,turns:state.actions.length},spentMillionRub:state.spent}:null;}
  function updateCompletion(finishBudget=false){
    if(!embedded||!state)return;
    const intro=scenario.kind==='intro';
    classification=intro?{status:instruction()?.complete?'complete':'playing',canFinish:Boolean(instruction()?.complete)}:classifyCompletion(world,scenario,state,ev);
    if(instruction()?.complete||!intro&&classification.status==='complete')terminalReason='complete';
    else if(finishBudget&&!intro&&classification.canFinish)terminalReason='budget_exhausted';
    if(terminalReason){toolsOpen=false;activeTool=null;clearSelection();}
  }
  function save(){
    if(!state||disposed)return;
    if(!embedded){try{storage.save(scenario.id,snapshotSave());saveError='';}catch{saveError='Не удалось сохранить в браузере. Откройте меню и экспортируйте файл.';message(saveError,true);}return;}
    if(readOnly)return;
    const payload=snapshot();
    saveQueue=saveQueue.catch(()=>{}).then(async()=>{
      await options.onCheckpoint?.(payload);
      lastSaveFailure=null;saveError='';
      if(payload.save.ui.terminalReason&&!completionSent){completionSent=true;try{await options.onComplete?.({...payload,reason:payload.save.ui.terminalReason});}catch(error){completionSent=false;throw error;}}
    }).catch(error=>{lastSaveFailure=error;saveError='Не удалось сохранить ход. Вернитесь к списку партий и повторите синхронизацию.';if(!disposed){readOnly=true;render();message(saveError,true);}});
  }
  function clearSelection(){selectedId=null;selectedFacilityId=null;selectedPosition=null;towerPositions=[];routeFrom=null;routeStops=[];targetEdge=null;q=null;inlineHelp='';}
  function resetPreview(){q=null;selectedPosition=null;towerPositions=[];selectedFacilityId=null;targetEdge=null;}
  function makeAction(){
    if(activeTool==='tower'&&towerPositions.length>1)return {type:'tower-batch',positions:towerPositions.map(position=>({...position}))};
    if(activeTool==='tower'&&selectedPosition)return {type:'tower',...selectedPosition};
    if(activeTool==='connect'&&routeFrom&&targetEdge)return {type:'connect-network',from:routeFrom,targetEdge:targetEdge.slice()};
    if(activeTool==='connect'&&!instruction()?.locked&&routeStops.length>=2)return {type:'connect',stopIds:routeStops.slice()};
    if(activeTool==='connect'&&routeFrom&&selectedId&&routeFrom!==selectedId)return {type:'connect',from:routeFrom,to:selectedId};
    if(['medical','school','culture','outreach'].includes(activeTool)&&selectedId)return {type:'build',service:activeTool,settlementId:selectedId};
    return null;
  }
  function calculate(action=makeAction()){
    if(!action){q=null;return;}
    try{q=preview(world,scenario,state,action);}catch(error){q={ok:false,error:error.message,action};}
    if(isTowerAction(action)&&!Number.isFinite(q.cost))q={...q,cost:Math.round(towerSpec(state).cost*(action.type==='tower-batch'?action.positions.length:1)*1000)/1000};
  }
  function select(rowValue,facilityId=null,alternatives=[]){
    if(loading||disposed||!rowValue)return;
    if(readOnly||terminalReason)activeTool=null;
    toolsOpen=false;inlineHelp='';
    if(alternatives.length>1){showDialog('В этой точке несколько поселений',`<p>Координаты совпадают. Выберите нужную запись.</p><div class="choice-list">${alternatives.map(a=>{const item=typeof a==='string'?row(a):a;return `<button data-select="${esc(item.id)}"><strong data-source-name>${esc(item.name)}</strong><span>${populationText(item.population)}</span></button>`;}).join('')}</div>`);return;}
    const id=rowValue.id,inst=instruction();
    if(activeTool==='tower'){
      if(inst?.locked&&inst.coordinate){message('Для первого размещения коснитесь отмеченной площадки вышки.');return;}
      place({lat:rowValue.lat,lon:rowValue.lon});return;
    }
    if(inst?.locked&&inst.settlementId&&id!==inst.settlementId){message(t('Сейчас выберите {name} — отмеченное поселение.',{name:titleFor(inst.settlementId)}));return;}
    if(inst?.locked&&inst.from&&id!==(routeFrom?inst.to:inst.from)){message(t('Выберите {name}.',{name:titleFor(routeFrom?inst.to:inst.from)}));return;}
    if(activeTool==='connect'&&!inst?.locked){
      if(routeStops.includes(id)){message('Это поселение уже выбрано. Для изменения маршрута уберите последнюю остановку.');return;}
      if(routeStops.length>=MAX_ROUTE_STOPS){message(t('В одном маршруте можно выбрать не более {limit} поселений',{limit:num(MAX_ROUTE_STOPS)}),true);return;}
      routeStops=[...routeStops,id];
    }
    selectedId=id;selectedFacilityId=facilityId;selectedPosition=null;targetEdge=null;
    if(activeTool==='connect'&&!routeFrom){routeFrom=id;q=null;message(!inst?.locked?t('Выберите до {limit} близких поселений. Маршрут — до {distance} км.',{limit:num(MAX_ROUTE_STOPS),distance:num(MAX_ROUTE_DISTANCE_KM)}):'Теперь выберите второе поселение. Цена учитывает только новые участки.');}
    else{calculate();message('');}
    render();
  }
  function selectNetwork(selection){
    if(loading||disposed||readOnly||terminalReason||state.rulesVersion!==SOCIAL_RULES_VERSION||activeTool!=='connect'||!routeFrom||instruction()?.locked)return;
    if(routeStops.length>1){message('Для присоединения к действующей линии начните отдельное соединение.');return;}
    targetEdge=selection.targetEdge.slice();selectedId=null;selectedFacilityId=null;selectedPosition=null;toolsOpen=false;inlineHelp='';calculate();message('');render();
  }
  function place(coordinate){
    if(loading||readOnly||terminalReason||activeTool!=='tower')return;
    toolsOpen=false;inlineHelp='';
    const inst=instruction();
    if(inst?.locked&&inst.coordinate&&(Math.abs(coordinate.lat-inst.coordinate.lat)>1e-6||Math.abs(coordinate.lon-inst.coordinate.lon)>1e-6)){message('Коснитесь отмеченной площадки, чтобы увидеть первое покрытие.');return;}
    if(!inst?.locked){
      if(towerPositions.some(position=>Math.abs(position.lat-coordinate.lat)<1e-6&&Math.abs(position.lon-coordinate.lon)<1e-6)){message('Это место уже выбрано. Можно убрать последнюю вышку.');return;}
      if(towerPositions.length>=MAX_TOWER_BATCH){message(t('За один ход можно построить до {count} вышек.',{count:num(MAX_TOWER_BATCH)}));return;}
      towerPositions=[...towerPositions,{lat:coordinate.lat,lon:coordinate.lon}];
    }else towerPositions=[{lat:coordinate.lat,lon:coordinate.lon}];
    selectedPosition=towerPositions.at(-1);selectedId=null;selectedFacilityId=null;calculate();message('');render();
  }
  async function boot(regionId,requestedMode,{imported=null,restart=false,difficulty:requestedDifficulty=null}={}){
    retryTarget={regionId,requestedMode,options:{imported,restart,difficulty:requestedDifficulty}};
    const ticket=++request,previousMode=mode;loading=true;mode=requestedMode;$('.puzzle-loading').hidden=false;$('.puzzle-loading').innerHTML='<span class="loader-mark">↗</span><h1>Открываем регион</h1><p>Загружается только выбранная территория</p>';
    try{
      if(!manifest){const source=await json(new URL('manifest.json',DATA),{signal:abort.signal});manifest={...source,regions:source.regions.map(r=>FEDERAL_CITIES[r.id]?{...r,name:FEDERAL_CITIES[r.id].partyTitle,settlementCount:r.settlementCount+FEDERAL_CITIES[r.id].rows.length}:r)};}
      if(!manifest.regions.some(r=>r.id===regionId))throw new Error('Такого региона нет в поставленном наборе.');
      const [{pack,network},sourceBoundary,roads,cityBoundary]=await Promise.all([loadRegion(regionId,{signal:abort.signal,includeMissions:!embedded}),json(new URL(`boundaries/${regionId}.geojson`,DATA),{signal:abort.signal}),compressed(`roads/${regionId}.geojson`,{signal:abort.signal}).catch(error=>{if(abort.signal.aborted)throw error;return null;}),loadFederalBoundary(regionId,{signal:abort.signal})]);
      const boundary=combineFederalBoundary(sourceBoundary,cityBoundary);
      if(ticket!==request||disposed)return;
      const {stored,version,difficulty:nextDifficulty}=partySelection({storage,params,regionId,mode,imported,restart,requestedDifficulty}),nextWorld=appendFederalCities(new World(pack,network));
      if(version>=3)await loadDistanceTransportPolicy(nextWorld,{signal:abort.signal});
      if(version===4)await loadTelecomPlan(nextWorld,{retry:ticket>1});
      if(version===5&&mode!=='intro')await loadSocialPlan(nextWorld,{difficulty:nextDifficulty,retry:ticket>1,signal:abort.signal});
      if(ticket!==request||disposed)return;
      const nextScenario=withPlayableRegionScope(nextWorld,mode==='intro'?createIntroScenario(nextWorld,boundary,{version}):createRegionalScenario(nextWorld,boundary,{mode,version,difficulty:nextDifficulty,initialTowerPolicyVersion:stored?stored.initialTowerPolicyVersion??null:INITIAL_TOWER_POLICY_VERSION}));
      if(embedded&&stored&&(stored.regionId!==regionId||stored.scenarioId!==nextScenario.id))throw new Error('Сохранение не соответствует назначенной партии.');
      let nextState=createState(nextWorld,nextScenario);
      const initialEvaluation=evaluate(nextWorld,nextScenario,nextState);
      const updatedScenario=stored&&!imported&&(stored.dataVersion!==nextState.dataVersion||stored.socialPolicyFingerprint!==nextState.socialPolicyFingerprint||stored.telecomPlanFingerprint!==nextState.telecomPlanFingerprint);
      if(stored&&!updatedScenario){nextState=restore(nextWorld,nextScenario,stored);}
      const nextGuide=mode==='intro'?null:createTaskGuide(nextWorld,initialEvaluation,{saved:stored&&!updatedScenario?stored.ui?.taskGuide:null,revision:nextState.actions.length});
      const nextEvaluation=stored&&!updatedScenario?evaluate(nextWorld,nextScenario,nextState):initialEvaluation;
      map?.destroy();world=nextWorld;scenario=nextScenario;state=nextState;ev=nextEvaluation;guide=nextGuide;difficulty=nextDifficulty;basemap={regionId,roads,status:roads?'loaded':'unavailable'};clearSelection();lastResult=null;
      activeLayer=stored?.ui?.activeLayer&&NAMES[stored.ui.activeLayer]?stored.ui.activeLayer:currentTask()?.service||'telecom';
      const inst=instruction();activeTool=inst?.locked?inst.tool:null;
      terminalReason=null;completionSent=false;updateCompletion(stored?.ui?.terminalReason==='budget_exhausted');
      map=new GameMap($('.puzzle-map'),{onSelect:select,onPlace:place,onSelectNetwork:selectNetwork,onRouteGeometryChange:updateRouteEstimate,translate:t});loading=false;$('.puzzle-loading').hidden=true;render();
      // First acquaint the player with the whole territory; task focus stays explicit.
      map.camera.setViewport(map.element.clientWidth,map.element.clientHeight);
      if(mode!=='intro'&&(!stored||updatedScenario))map.fitAll();else map.fitFocus(targetIds());
      // A restored party can now satisfy every valid regional goal. Persist its
      // completion through the usual idempotent host path, without another move.
      if(imported||restart||!stored||updatedScenario||!readOnly&&terminalReason&&!stored.ui?.terminalReason)save();
      if(mode==='intro'&&inst?.complete)try{storage.finishIntro();}catch{saveError='Браузер не сохраняет прогресс. Экспортируйте прохождение через меню.';}
      message(basemap.status==='unavailable'?'Фоновые дороги не удалось загрузить. Игровая сеть доступна; попробуйте открыть регион снова.':updatedScenario?'Условия партии обновлены. Начинаем с новой исходной сети.':'',basemap.status==='unavailable');
      if(!embedded){const url=partyUrl(location.href,{version,regionId,mode,difficulty});for(const key of ['rules','region','scenario','difficulty']){if(url.searchParams.has(key))params.set(key,url.searchParams.get(key));else params.delete(key);}history.replaceState(history.state,'',url);}
    }catch(error){
      if(ticket!==request||disposed)return;loading=false;console.error(error);
      if(map){mode=previousMode;$('.puzzle-loading').hidden=true;message(`Не удалось ${imported?'импортировать прохождение':'открыть регион'}: ${error.message}. Текущая партия сохранена.`,true);return;}
      $('.puzzle-loading').innerHTML=`<h1>Не удалось открыть игру</h1><p>${esc(error.message)}</p><p>Сохранённые данные не удалены.</p><button class="primary" data-act="retry">Повторить</button><button class="text-button" data-act="menu">Открыть меню</button>`;
      localize();if(embedded)throw error;
    }
  }
  function progressSummary(){
    if(!ev)return '';
    return Object.keys(NAMES).filter(s=>s!=='population').map(s=>{const e=ev.services[s];return `<div class="service-summary"><span>${NAMES[s]}</span><strong>${e?.covered||0} / ${e?.total||0}</strong></div>`;}).join('');
  }
  function renderLayers(){
    $('.puzzle-layer').innerHTML=`<div id="layer-options" class="layer-options panel" data-map-obstacle>${Object.entries(NAMES).map(([id,name])=>{
      const {known,percent,settlements,covered,total}=layerProgress(ev.services[id],scenario);
      const label=id==='population'?t(name):known?(settlements?t('{service}: полностью обеспечено {covered} из {total} поселений ({percent}%)',{service:t(name),covered:num(covered),total:num(total),percent:routeNumber(percent)}):t('{service}: удовлетворено {percent}% спроса',{service:t(name),percent:routeNumber(percent)})):t('{service}: нет известного спроса',{service:t(name)});
      const value=id==='population'?'':`<span class="layer-progress-value" aria-hidden="true">${known?routeNumber(percent)+'%':'—'}</span>`;
      const progress=id==='population'?'':`<span class="layer-progress ${known?'':'unknown'}" aria-hidden="true"><i style="width:${percent??0}%"></i></span>`;
      return `<button data-layer="${id}" aria-pressed="${id===activeLayer}" aria-label="${esc(label)}" title="${esc(label)}${id==='population'?'':'. '+t(settlements?'Доля полностью обеспеченных поселений с известным спросом.':'Доля обслуженного спроса; для победы нужно всё.')}" class="layer-option ${id===activeLayer?'active':''}" style="--layer-color:${SERVICE_COLORS[id]||'#52666a'}"><span class="layer-symbol">${layerIcon(id)}${value}</span><span class="layer-label" translate="no">${esc(translator.layerLabel(id))}</span>${progress}</button>`;
    }).join('')}</div>`;
  }
  function toolButton(kind,guided=false,disabled=false){return `<button class="tool ${activeTool===kind?'active':''}" data-tool="${kind}" aria-pressed="${activeTool===kind}" ${disabled?'disabled':''}>${symbolSvg(kind)}<span>${TOOLS[kind]}</span><small>${kind==='connect'?(distanceRules(state.rulesVersion)?'по расстоянию':state.rulesVersion===FIXED_TRANSPORT_RULES_VERSION?`от ${num(TRANSPORT_PRICES.transport)} млн / участок`:'8 млн / участок'):money(kind==='tower'?towerSpec(state).cost:PRICES[kind])}</small></button>`;}
  function routeSummary(){
    if(!q?.ok||!isRouteAction(q.action)||!q.path)return null;
    if(Number.isFinite(q.transportCost?.distanceKm)){const distanceKm=q.transportCost.distanceKm;return {distanceKm,driveMinutes:distanceKm/DRIVE_SPEED_KMH*60,assumedSpeedKmh:DRIVE_SPEED_KMH};}
    return map?.routeSummary?.(q.path);
  }
  function updateRouteEstimate(){
    const node=$('[data-route-estimate]');if(!node)return;
    const summary=routeSummary();node.textContent=summary?t('≈ {distance} км · ≈ {minutes} мин на машине',{distance:routeNumber(summary.distanceKm),minutes:routeNumber(summary.driveMinutes)}):'';
  }
  function previewDock(){
    const tower=isTowerAction(q.action),towerDraft=tower&&!instruction()?.locked;
    const name=tower?(q.action.type==='tower-batch'?'Вышки связи':'Вышка связи'):isRouteAction(q.action)?'Соединение':q.action.type==='upgrade'?'Расширение':objectName(q.action.service)||TOOLS[q.action.service];
    const joinsNetwork=q.action.type==='connect-network'||(q.joinId&&q.joinId!==q.action.to);
    const placeName=tower?t('На выбранной площадке'):isRouteAction(q.action)?`${titleFor(q.action.from||routeStops[0])} → ${q.action.stopIds?titleFor(q.action.to||routeStops.at(-1)):joinsNetwork?t('К сети')+(q.joinId?` · ${titleFor(q.joinId)}`:''):titleFor(q.action.to)}`:q.action.settlementId?titleFor(q.action.settlementId):titleFor(state.facilities.find(f=>f.id===q.action.facilityId)?.settlementId);
    const changes=Object.entries(q.delta||{}).filter(([,v])=>v.newlyFullIds?.length||v.improvedIds?.length||v.people>0);
    const effects=q.ok?(changes.length?`<div class="preview-effects">${changes.map(([service,v])=>`<div class="preview-effect" style="--effect-color:${SERVICE_COLORS[service]||'#203b38'}" title="${esc(deltaText(service,v))}">${layerIcon(service)}<div><span>${NAMES[service]}</span><strong>+${num(v.people)} <small>жителей</small></strong></div></div>`).join('')}</div>`:'<p class="preview-result">Новых получателей пока нет</p>'):`<p class="preview-result error" role="alert">${esc(q.error||'Это действие недоступно')}</p>`;
    const connecting=isRouteAction(q.action),transport=q.transportCost,place=`<p class="place-name" data-source-name title="${esc(placeName)}">${esc(placeName)}</p>`,estimate=q.ok?'<p class="route-estimate" data-route-estimate></p>':'';
    const heading=connecting?`<div class="route-heading ${transport?'transport-heading':''}"><h2>Предпросмотр · Соединение</h2>${place}${transport?estimate:''}</div>`:`<div><span class="eyebrow">Предпросмотр</span><h2>${esc(name)}</h2></div>`;
    const breakdown=transport?`<p class="transport-price">${t('Транспорт {transport} · Дорога {road} млн ₽',{transport:moneyNumber(transport.transport),road:moneyNumber(transport.construction)})}</p>`:'';
    const multiple=connecting&&Array.isArray(q.action.stopIds);
    return `<div class="preview-body"><div class="dock-heading">${heading}<button class="icon-button" data-act="cancel" aria-label="Отменить примеривание">${uiIcon('close')}</button></div>${connecting&&!q.ok?effects:''}${multiple?routeStopsControl():''}${towerDraft?towerPositionsControl():connecting?(transport?breakdown:estimate):place}${connecting&&!q.ok?'':effects}</div><div class="confirm-row"><strong class="preview-price" aria-label="${money(q.cost||0)}"><span>${moneyNumber(q.cost||0)}</span><small>млн ₽</small></strong><button class="primary" data-act="confirm" ${q.ok?'':'disabled'}>${towerDraft?(towerPositions.length>1?'Построить вышки':'Построить вышку'):multiple?'Построить транспорт':'Подтвердить'}</button>${q.ok?`<div class="preview-links"><button class="icon-button" data-act="recipients" aria-label="Показать получателей" title="Показать получателей">${uiIcon('population')}</button><button class="icon-button" data-act="details" aria-label="Почему такой результат?" title="Почему такой результат?">${uiIcon('info')}</button></div>`:''}</div>`;
  }
  function towerPositionsControl(){
    return `<div class="tower-positions"><div><strong>${t('Выбрано вышек: {count}',{count:num(towerPositions.length)})}</strong><p>${t('Коснитесь карты, чтобы добавить ещё вышку.')}</p></div><button class="icon-button" data-act="tower-remove-last" aria-label="Убрать последнюю вышку" title="Убрать последнюю вышку">${uiIcon('undo')}</button></div>`;
  }
  function routeStopsControl(){
    if(!routeStops.length)return '';
    return `<div class="route-stops"><p>${t('Остановок: {count} из {limit} · до {distance} км',{count:num(routeStops.length),limit:num(MAX_ROUTE_STOPS),distance:num(MAX_ROUTE_DISTANCE_KM)})}</p><ol>${routeStops.map(id=>`<li data-source-name>${esc(titleFor(id))}</li>`).join('')}</ol><button class="text-button" data-act="route-remove-last">Убрать последнюю остановку</button></div>`;
  }
  function render(){
    if(!world||!state||loading)return;
    const inst=instruction(),task=currentTask(),isIntro=scenario.kind==='intro',done=embedded?Boolean(terminalReason):(isIntro?inst?.complete:ev.complete),frozen=embedded&&(readOnly||Boolean(terminalReason));
    root.style.setProperty('--service-color',SERVICE_COLORS[activeLayer]||'#52666a');
    root.classList.toggle('has-preview',!!q);root.classList.toggle('has-selection',!!selectedId);root.classList.toggle('reduced-motion',reduced());
    $('.puzzle-build [data-act="tools"]').setAttribute('aria-expanded',String(toolsOpen));
    $('[data-act="undo"]').disabled=frozen||!state.actions.length;
    $('.puzzle-build [data-act="tools"]').disabled=frozen;
    $('.puzzle-brand').textContent=isIntro?t('Учебная группа'):(translator.regionName?.(world.region)||world.region.name);$('.puzzle-brand').setAttribute('data-source-name','');
    $('.budget').textContent=money(state.budget);
    let goal=isIntro?(!inst?.locked&&!done?tutorialObjective(ev)?.title||inst?.title:inst?.title||'Ваша первая сеть'):task?`${t(task.service==='school'?'Школа':NAMES[task.service])}: ${titleFor(task.id)}`:'Достройте сеть региона';
    if(done)goal=isIntro&&embedded?'Обучение пройдено':isIntro?'Первая сеть работает':terminalReason==='budget_exhausted'?'Партия завершена':'Регион обеспечен';
    const introSteps=totalTutorialSteps(scenario),badge=done?'✓':isIntro?`${Math.min(introSteps,(inst?.step||0)+1)}/${introSteps}`:task?layerIcon(task.service):'↗';
    $('.puzzle-mission').classList.toggle('regional-task',!isIntro);
    $('.puzzle-mission').innerHTML=`<span class="step-badge" aria-hidden="true" style="${task?`color:${SERVICE_COLORS[task.service]}`:''}">${badge}</span><h1 title="${esc(goal)}">${esc(goal)}</h1><button class="icon-button" data-act="${done?(embedded?'exit':'regions'):'focus'}" aria-label="${done?(embedded?(isIntro?'К выбору сложности':'К результатам'):'Выбрать регион'):'Показать текущую задачу'}">${uiIcon(done?'check':'focus')}</button>`;
    renderLayers();
    let dock='',dockState='neutral';
    if(toolsOpen){dockState='tools';dock=`<div id="tool-options" class="tool-grid" aria-label="Построить">${['tower','medical','connect','school','culture','outreach'].map(kind=>toolButton(kind,false,inst?.locked&&inst.tool!==kind)).join('')}</div>`;}
    else if(q){dock=previewDock();dockState='preview';}
    else if(done&&!selectedId&&!activeTool){
      dockState='complete';dock=`<div class="completion-heading"><span class="completion-mark">${uiIcon('check')}</span><h2>${isIntro&&embedded?'Обучение пройдено':isIntro?'Все четыре услуги — 100%':terminalReason==='budget_exhausted'?'Партия завершена':'Регион обеспечен'}</h2><button class="icon-button" data-act="summary" aria-label="Посмотреть результат" title="Посмотреть результат">${uiIcon('info')}</button></div>${isIntro?`<div class="completion-services" aria-label="Итог обучения">${['telecom','medical','school','culture'].map(service=>`<div style="--layer-color:${SERVICE_COLORS[service]}">${layerIcon(service)}<span>${service==='school'?'Школа':NAMES[service]}</span><strong>100%</strong></div>`).join('')}</div>`:''}${isIntro&&embedded?'<p>Обучение не начисляет баллы. Далее — основная игра.</p>':''}<button class="primary" data-act="${embedded?'exit':'regions'}">${embedded?(isIntro?'К выбору сложности':'К результатам'):isIntro?'Выбрать регион':'Другая партия'}</button>`;
    }else if(selectedId&&!activeTool){dock=settlementCard(selectedId,selectedFacilityId);dockState='selection';}
    else if(inst?.locked&&!frozen){
      dockState='guided';
      const target=inst.tool==='medical'?titleFor(inst.settlementId):titleFor(routeFrom?inst.to:inst.from);
      const hint=inst.tool==='tower'?t('Примерьте вышку на отмеченном месте'):activeTool!==inst.tool?t('Выберите «{tool}», затем {name} на карте',{tool:t(TOOLS[inst.tool]),name:target}):t('Выберите на карте: {name}',{name:target});
      dock=`<div class="guided-action"><div class="tool-grid guided">${toolButton(inst.tool,true)}</div><p class="action-hint">${esc(hint)}</p>${inst.coordinate?'<button class="text-button guide-position" data-act="guide-position" aria-label="Примерить отмеченное место">Примерить</button>':''}${state.actions.length===0?'<p class="intro-goal action-hint">Цель: все 7 поселений получают четыре услуги на 100%.</p>':''}</div>`;
    }else if(activeTool&&!toolsOpen&&!frozen){
      dockState='active-tool';
      const hint=activeTool==='tower'?'Выберите места для вышек, затем подтвердите строительство.':activeTool==='connect'?(routeFrom?t('Остановок: {count} из {limit} · до {distance} км',{count:num(routeStops.length),limit:num(MAX_ROUTE_STOPS),distance:num(MAX_ROUTE_DISTANCE_KM)}):'Выберите первое поселение'):'Выберите поселение';
      dock=`<span class="tool-symbol">${symbolSvg(activeTool)}</span><div><h2>${TOOLS[activeTool]}</h2><p class="action-hint">${hint}</p></div><button class="icon-button" data-act="clear-tool" aria-label="Сменить действие">${uiIcon('close')}</button>`;
    }
    if(inlineHelp){dockState='help';dock=`<div class="dock-heading"><h2>${inlineHelp==='budget'?'Бюджет':inlineHelp==='legend'?'Обозначения':'Результат хода'}</h2><button class="icon-button" data-act="dismiss-help" aria-label="Вернуться к карте">${uiIcon('close')}</button></div>${inlineHelp==='budget'?`<strong class="budget-number">${money(state.budget)}</strong><p>${t('Потрачено {amount}.',{amount:money(state.spent)})}</p>`:inlineHelp==='legend'?`${activeLayer==='population'?'<div class="inline-legend"><span>Зелёный — рост</span><span>Жёлтый — стабильно</span><span>Красный — убыль</span><span>Серый — нет сравнения</span></div>':'<div class="inline-legend"><span>○ нет услуги</span><span>✓ есть</span><span>◌ изменится</span></div>'}<p>Размер — численность населения; шкала сжата.</p><button class="text-button" data-act="legend-details">Все обозначения</button>`:`<p>${esc(lastResult||'Пока нет новых действий')}</p>`}`;}
    if(embedded&&!done&&!readOnly&&classification?.canFinish&&!q&&!selectedId&&!activeTool&&!toolsOpen&&!inlineHelp){dockState='complete';dock=`<h2>Бюджет исчерпан</h2><p>${classification.hasFreeConnection?'Остались бесплатные соединения. Можно продолжить или сохранить итог.':'Доступных действий больше нет. Сохраните итог партии.'}</p><button class="primary" data-act="finish-budget">Завершить партию</button>`;}
    root.classList.toggle('has-inline-help',!!inlineHelp);
    $('.puzzle-dock').dataset.state=dockState;$('.puzzle-dock').innerHTML=dock;
    map.update({world,scenario,state,evaluation:ev,basemap,activeLayer,activeTool,selectedId,selectedFacilityId,preview:q?.ok||isTowerAction(q?.action)?q:null,routeFrom,routeStops,guidance:inst?.locked?inst:null,focusIds:targetIds(),reducedMotion:reduced()});
    updateRouteEstimate();
    if(frozen)root.querySelectorAll('[data-tool],[data-upgrade],[data-act="confirm"],[data-act="guide-position"],[data-act="tools"]').forEach(button=>button.disabled=true);
    root.toggleAttribute('data-readonly',readOnly);root.toggleAttribute('data-terminal',Boolean(terminalReason));
    localize();
    if(saveError)message(saveError,true);
  }
  function settlementCard(id,facilityId){
    const r=row(id),history=change(r),status=ev.byId[id]?.[activeLayer],f=state.facilities.find(x=>x.id===facilityId)||state.facilities.find(x=>x.settlementId===id&&facilityInLayer(x,activeLayer));
    const usage=f&&ev.facilityUsage[f.id],places=value=>translator.number(value/100,{maximumFractionDigits:2});
    const reasons={'no-object':'Пока нет подходящего учреждения','no-path':'Нет доступного пути к учреждению',capacity:'Не хватает мест',unknown:'Нет достоверного значения спроса',empty:'В исходных данных нет жителей',served:'Услуга доступна'};
    return `<div class="dock-heading"><h2 data-source-name>${esc(r.name)}</h2><button class="icon-button" data-act="cancel" aria-label="Закрыть карточку">${uiIcon('close')}</button></div><p>${populationText(r.population)} · ${history===null?t('Изменение за 2010–2021 гг. не рассчитано'):t('Изменение {change}% за 2010–2021 гг.',{change:(history>0?'+':'')+routeNumber(history)})}</p><p class="preview-result">${activeLayer==='population'?'Исторические данные не меняются от игровых действий.':esc(reasons[status?.reason]||'Выберите отрасль для проверки доступа')}</p>${status?.reason==='capacity'?`<p>${t('Нужно ещё {count} мест.',{count:places(status.missing)})}</p>`:''}${usage?`<p><strong>${t(objectName(f.type))}</strong> · ${t('свободно {free} из {total} мест.',{free:places(usage.capacity-usage.used),total:places(usage.capacity)})}</p>`:''}<div class="card-actions">${f&&f.level<2?`<button class="primary" data-upgrade="${esc(f.id)}">${t('Расширить')} · ${money(CATALOG[f.type]?.upgradeCost||0)}</button>`:''}<button class="text-button" data-act="tools">Выбрать действие</button></div>`;
  }
  function selectTool(tool){
    if(readOnly||terminalReason)return;
    const inst=instruction();if(inst?.locked&&inst.tool!==tool){message('Сначала завершите отмеченный шаг.');return;}
    activeTool=tool;clearSelection();lastResult=null;toolsOpen=false;
    if(['tower','medical','school','culture','outreach'].includes(tool))activeLayer=tool==='tower'?'telecom':tool==='outreach'?'medical':tool;
    message('');closeDialog();render();
  }
  function commit(){
    if(readOnly||terminalReason)return;
    if(!q?.ok||q.baseRevision!==state.revision){calculate();render();return;}
    try{
      const action=q.action,oldStep=instruction()?.step,changes=Object.entries(q.delta).filter(([,d])=>d.people>0||d.newlyFullIds?.length);
      const previousEvaluation=ev;state=apply(world,scenario,state,action);ev=evaluate(world,scenario,state);guide?.advance(previousEvaluation,ev);
      lastResult=changes.length?changes.map(([s,d])=>deltaText(s,d)).join(' · '):'Действие выполнено. Новых получателей пока нет.';
      // Keep the just-confirmed service visible. Choosing the next tool explicitly changes the layer.
      clearSelection();const inst=instruction();activeTool=null;
      if(inst?.complete)try{storage.finishIntro();}catch{saveError='Браузер не сохраняет прогресс. Экспортируйте прохождение через меню.';}updateCompletion();save();render();message('');
    }catch(error){message(error.message,true);calculate();render();}
  }
  function showRecipients(){
    const changes=q?.delta||{};const ids=[...new Set(Object.values(changes).flatMap(d=>d.improvedIds||d.newlyFullIds||[]))];
    if(ids.length){map.fitFocus(ids);return;}message('Этот вариант пока не добавляет обслуживания. Откройте объяснение или примеряйте другое место.');
  }
  function details(){
    if(!q)return;
    const reason=(service,id)=>{
      if(service==='telecom'){const positions=q.action.type==='tower-batch'?q.action.positions:[q.action],distance=Math.min(...positions.map(position=>haversine(row(id),position)));return t('{distance} км от вышки — внутри радиуса {radius} км. Перекрытие с прежними зонами не считается повторно.',{distance:routeNumber(distance),radius:routeNumber(towerSpec(state).radiusKm)});}
      const providers=Object.entries(q.nextState?.assignments?.[service]?.[id]||{}).filter(([fid,amount])=>amount>(state.assignments?.[service]?.[id]?.[fid]||0)).map(([fid])=>q.nextState.facilities.find(f=>f.id===fid)).filter(Boolean);
      return providers.map(f=>t('{facility} в пункте {name}: есть доступный путь и свободные места',{facility:t(objectName(f.type)),name:titleFor(f.settlementId)})).join('; ')+'.';
    };
    const mechanism=isTowerAction(q.action)?'Вышка даёт связь каждому поселению внутри круга, даже без дороги.':isRouteAction(q.action)?'Соединение помогает добраться до учреждений при доступном времени пути и свободных местах. Один участок используется всеми услугами.':q.action.type==='upgrade'?'Расширение добавляет места в действующем учреждении. Новые места получают доступные по сети поселения; прежние назначения сохраняются.':'Учреждение обслуживает свой пункт и соседей, доступных пешком или по действующим участкам сети. Число мест ограничено; прежние назначения сохраняются.';
    const sections=Object.entries(q.delta||{}).filter(([,d])=>d.improvedIds?.length||d.newlyFullIds?.length).map(([s,d])=>`<h3>${NAMES[s]}</h3><p>${t('{people} жителей получают дополнительный доступ. Полностью обеспечены ещё {count} поселений.',{people:num(d.people),count:num(d.newlyFullIds?.length||0)})}</p><ul>${(d.improvedIds||d.newlyFullIds||[]).map(id=>`<li><strong data-source-name>${esc(titleFor(id))}</strong>: ${esc(reason(s,id))}</li>`).join('')}</ul>`).join('');
    const illustration=CATALOG[q.action.service]?.art,summary=routeSummary();
    const estimate=summary?`<p>≈ ${routeNumber(summary.distanceKm)} км · ≈ ${routeNumber(summary.driveMinutes)} мин на машине. Справочное время при ${routeNumber(summary.assumedSpeedKmh)} км/ч; обеспеченность рассчитывается моделью доступности.</p><p>Время = расстояние / ${routeNumber(summary.assumedSpeedKmh)} × 60.</p>`:'';
    const transport=q.transportCost,distancePricing=Number.isFinite(transport?.distanceKm);
    const pricing=transport?`${distancePricing?`<p>Весь путь — ${routeNumber(transport.distanceKm)} км. Новые участки — ${routeNumber(transport.freshDistanceKm)} км; строительство дороги — ${routeNumber(transport.constructionDistanceKm)} км.</p>`:''}<p>Запуск транспорта — ${money(transport.transport)}${distancePricing?` (${money(transport.transportPerKm)}/км)`:''}. Строительство дороги — ${money(transport.construction)}${distancePricing?` (${money(transport.constructionPerKm)}/км)`:''}. Итого — ${money(transport.total)}.</p><p>Оплачиваются только новые участки. Ранее запущенные соединения используются бесплатно.</p><p>Пунктир — строительство дороги. Сплошная линия — готовая дорога; подсветка отмечает ${state.rulesVersion===SOCIAL_RULES_VERSION?'только новые участки':'выбранный путь'}.</p>`:`<p>Оплачиваются только новые участки пути: ${money(q.cost)}. Существующие участки используются бесплатно.</p>`;
    const accessLimit=type=>{const time=isPopulationSocialScenario(scenario)?socialAccessLimits(world,type).time:CATALOG[type].time;return Number.isFinite(time)?`${time} мин`:'по действующей сети без лимита времени';};
    const noRecipients=`<p>Новых получателей нет: либо эти пункты уже обеспечены, либо нужны подходящее учреждение, маршрут или дополнительные места.</p>${isRouteAction(q.action)?`<p>Лимит поездки до учреждения в модели: медицина — ${accessLimit('medical')}, досуг — ${accessLimit('culture')}, образование — ${accessLimit('school')}. Если путь превышает лимит, нужно учреждение ближе или подходящий маршрут.</p>`:''}`;
    showDialog('Почему такой результат?',`${illustration?`<img class="detail-art" src="${art(illustration)}" alt="Условная иллюстрация объекта" loading="lazy" width="144" height="112">`:''}<p>${mechanism}</p>${isRouteAction(q.action)?pricing+estimate:''}${sections||noRecipients}<p class="muted">Результат учитывает весь регион. Граница задания не отсекает внешних получателей. Это учебная модель доступности.</p>`);
  }
  function menu(){
    toolsOpen=false;inlineHelp='';render();
    if(embedded){
      const items=[['exit','overview',terminalReason?(scenario.kind==='intro'?'К выбору сложности':'К результатам'):'К списку партий'],['search','search','Найти поселение'],['overview','focus','Весь регион'],['summary','population','Результат'],...(lastResult?[['last-result','check','Последний ход']]:[]),['legend','info','Обозначения'],['help','info','Как играть'],['settings','settings','Настройки'],['sources','info','Источники'],...(options.onReplayTutorial?[['replay-tutorial','info','Пройти обучение заново']]:[]),...(!terminalReason&&!readOnly&&classification?.canFinish?[['finish-budget','check','Завершить партию']]:[])];
      showDialog('Система расселения',`<div class="menu-grid">${items.map(([act,icon,label])=>`<button data-act="${act}">${uiIcon(icon)}<span>${label}</span></button>`).join('')}</div>`);return;
    }
    const items=[['regions','overview','Выбрать регион'],['search','search','Найти поселение'],['overview','focus','Весь регион'],['summary','population','Результат'],...(lastResult?[['last-result','check','Последний ход']]:[]),['export','export','Экспортировать'],['import','import','Импортировать'],['legend','info','Обозначения'],['help','info','Как играть'],['settings','settings','Настройки'],['sources','info','Источники'],['restart','undo','Начать заново']];
    showDialog('Система расселения',`<div class="menu-grid">${items.map(([act,icon,label])=>`<button data-act="${act}">${uiIcon(icon)}<span>${label}</span></button>`).join('')}</div><p class="muted">Интерфейс 2.4.0 · правила ${esc((state?.rulesVersion||SOCIAL_RULES_VERSION).replace('settlements-',''))}${state?.rulesVersion===SOCIAL_RULES_VERSION&&mode!=='intro'?' · '+DIFFICULTIES.find(d=>d.id===difficulty).name:''}</p>`);
  }
  function regions(){
    if(embedded){exitGame();return;}
    if(!manifest)return;
    if(!storage.introDone()&&!instruction()?.complete){showDialog('Сначала освоим первый результат','<p>Завершите короткое введение: три действия с подсказкой, затем доведите четыре услуги до 100%. Затем откроются все регионы.</p><button class="primary wide" data-act="close">Продолжить введение</button>');return;}
    showDialog('Выберите регион',`<p>Подготовленные партии — достройка сценарной сети до полного обеспечения.</p>${difficultySelector()}<div class="choice-list">${manifest.regions.filter(r=>curatedIds().includes(r.id)).map(r=>`<button data-region="${r.id}" data-mode="campaign"><strong data-source-name>${esc(r.name)}</strong><span>Подготовленная партия · ${num(r.settlementCount)} поселений</span></button>`).join('')}</div><label class="field-label" for="free-region">Свободная игра · 85 субъектов, 82 территории</label><select id="free-region">${manifest.regions.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><button class="primary wide" data-act="start-free">Открыть свободную игру</button><button class="text-button" data-act="intro">Вернуться к введению</button>`);
  }
  function search(){showDialog('Найти поселение','<label class="field-label" for="settlement-search">Название</label><input id="settlement-search" type="search" autocomplete="off" placeholder="Начните вводить название"><div class="search-results choice-list"></div>');$('#settlement-search').focus();}
  function searchResults(value){const query=value.trim().toLocaleLowerCase('ru');const matches=query?playableRows(world,scenario).filter(r=>r.name.toLocaleLowerCase('ru').includes(query)).slice(0,40):[];$('.search-results').innerHTML=matches.map(r=>`<button data-select="${esc(r.id)}" data-search-result="1"><strong data-source-name>${esc(r.name)}</strong><span>${populationText(r.population)}</span></button>`).join('')+(query&&!matches.length?'<p>Совпадений не найдено</p>':'');localize();}
  function help(){showDialog('От дефицита к решению',`<p>Задания — необязательные подсказки. Они чередуют связь, медицину, школу и досуг, предлагая поселения с дефицитом от крупных к малым. Можно строить в любом порядке: выполненные задачи пропускаются автоматически. Кнопка возле задачи показывает нужное место и слой. Цель — 100% по всем четырём услугам во всём регионе.</p><ol class="help-steps"><li><strong>Посмотрите, чего не хватает.</strong> Выберите отраслевой слой. Необслуженные точки имеют отдельный контур.</li><li><strong>Примерьте решение.</strong> Коснитесь места для вышки или поселения для учреждения. Сравнивать варианты можно бесплатно.</li><li><strong>Проверьте получателей и цену.</strong> Предпросмотр показывает результат. «Показать получателей» возвращает их в кадр.</li><li><strong>Подтвердите.</strong> Только теперь списываются деньги. Ошибочный ход можно отменить.</li></ol><h3>Одна дорога — разные услуги</h3><p>«Транспорт» запускает транспорт.${distanceRules(state?.rulesVersion)?' Если требуется дорога, её строительство входит в ту же цену.':''} Маршрут помогает и клинике, и школе, если у них есть свободные места. Сам по себе путь не создаёт учреждение.${state?.rulesVersion===SOCIAL_RULES_VERSION?' После первого поселения можно выбрать действующую линию. Ветка присоединится к узлу исходной сети; оплачиваются только новые участки.':''}</p><p>${t('Выберите до {limit} близких поселений по порядку. Длина всего маршрута — не более {distance} км.',{limit:num(MAX_ROUTE_STOPS),distance:num(MAX_ROUTE_DISTANCE_KM)})}</p><p>${t('Для двух удалённых поселений разрешён один прямой участок исходной сети длиннее {distance} км.',{distance:num(MAX_ROUTE_DISTANCE_KM)})}</p><h3>Связь</h3>${[TELECOM_RULES_VERSION,SOCIAL_RULES_VERSION].includes(state?.rulesVersion)?`<p>Связь есть только в зоне вышки. ${state?.rulesVersion===SOCIAL_RULES_VERSION?'Исходная сеть зависит от выбранной сложности.':`Исходные вышки стоят в поселениях от ${num(initialTowerThresholdFor(world))} жителей.`} Новая вышка — ${money(towerSpec(state).cost)}.</p>`:''}<p>Вышка покрывает поселения в учебном радиусе ${routeNumber(towerSpec(state).radiusKm)} км. Повторное покрытие не добавляет жителей. Её можно поставить между поселениями. Подтверждается граница региона, но в поставке нет достоверной маски всех водоёмов.</p><h3>Малые поселения</h3><p>Строить можно и там, где меньше 500 жителей. Цена одинакового объекта одинакова. Полезность зависит от положения, спроса и сети.</p><p class="muted">Начальная инфраструктура сценарная. Историческое население остаётся неизменным.</p>`);}
  function legend(){showDialog('Обозначения карты',`<div class="legend-list"><p><span class="legend-swatch missing"></span><strong>Услуги пока нет</strong></p><p><span class="legend-swatch served"></span><strong>Услуга доступна</strong></p><p><span class="legend-swatch partial"></span><strong>Нужны дополнительные места</strong></p><p><span class="legend-swatch preview"></span><strong>Изменится после подтверждения</strong></p></div><p>Размер точки — численность по исходным данным; шкала сжата, чтобы малые поселения оставались видны. История за 2010–2021 гг. доступна в карточке поселения и не меняется от строительства. Территориальная сопоставимость переписей в наборе не установлена.</p><p>В слое «Население» зелёная заливка означает рост, жёлтая — изменение в пределах ±3%, красная — убыль, серая — отсутствие сравнения. В отраслевых слоях заливка означает доступ.</p><p>Тонкие светлые дороги — географический фон из поставленного набора. Сине-серые линии с белой обводкой — действующие игровые маршруты. Наличие дороги на подложке само по себе не включает обслуживание: используйте «Транспорт».</p>`);}
  function sources(){showDialog('Источники и условности',`<p>Все исходные 155 794 записи сохранены; добавлены 45 записей Москвы, Санкт-Петербурга и Севастополя. Всего 155 839 поселений: 85 субъектов в 82 игровых территориях. Численность и координаты берутся из поставленных источников.</p><p>В проекте колонка Population_2020 исходной таблицы трактуется как численность переписи 2021 года. История сравнивается с 2010 годом. Территориальная сопоставимость переписей не установлена; это ограничение набора, а не подтверждённое изменение одинаковых границ.</p><p>Исходная обеспеченность и учреждения — <strong>сценарные условия</strong>, не реестр реальной инфраструктуры. Школьный спрос условно составляет 16% населения. Цены, мощность и радиус связи — параметры паззла.</p><p>Связь не моделирует рельеф, частоты и качество радиосигнала.</p><p>Границы и производные геоданные: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>, ODbL. Исходные выгрузки дорог: Geofabrik. Лицензионные сведения сохранены в поставке.</p>${embedded?'':'<p><a href="sources-v24.html" target="_blank">Происхождение данных и лицензии</a></p>'}`);}
  async function importedFile(file){
    if(!file)return;
    try{if(file.size>2*1024*1024)throw new Error('Файл сохранения больше 2 МБ.');const data=JSON.parse(await file.text());
      if(savedScenarioVersion(data)!==5)throw new Error('Файл прежней разработческой версии. Начните новую партию.');
      savedScenarioVersion(data);
      showDialog('Восстановить прохождение?',`<p>Файл будет проверен повторным расчётом ходов. Текущее сохранение не меняется до успешной проверки.</p><button class="primary wide" data-act="confirm-import">Проверить и восстановить</button>`);pendingImport=data;
    }catch(error){if($('dialog').open)closeDialog();message('Не удалось импортировать: '+error.message,true);}
  }
  let pendingImport=null;
  async function flush(){await saveQueue;if(lastSaveFailure)throw lastSaveFailure;}
  async function exitGame(replay=false){try{await flush();if(replay)await options.onReplayTutorial?.();else await options.onExit?.();}catch(error){message(error.message||'Не удалось сохранить ход. Вернитесь к списку партий и повторите синхронизацию.',true);}}
  function destroy(){if(disposed)return;disposed=true;request++;abort.abort();options.signal?.removeEventListener('abort',hostAbort);map?.destroy();releaseFederalBoundary();$('dialog')?.close();dialogSource=null;map=world=scenario=state=ev=guide=basemap=null;clearSelection();}
  listen(root,'click',async event=>{
    const button=event.target.closest('button,[data-act]');if(!button||button.disabled)return;event.preventDefault();
    if((readOnly||terminalReason)&&(button.dataset.tool||button.dataset.upgrade||['confirm','undo','guide-position','tools','finish-budget'].includes(button.dataset.act)))return;
    if(embedded&&['export','import','confirm-import','restart','confirm-restart','start-free','intro'].includes(button.dataset.act))return;
    if(button.dataset.tool){selectTool(button.dataset.tool);return;}
    if(button.dataset.select){const item=row(button.dataset.select);closeDialog();if(button.dataset.searchResult)map.panTo(item);select(item);return;}
    if(button.dataset.region){const profile=selectedDifficulty();closeDialog();await boot(button.dataset.region,button.dataset.mode,{difficulty:profile});return;}
    if(button.dataset.layer){if(towerPositions.length){clearSelection();activeTool=null;}activeLayer=button.dataset.layer;closeDialog();save();render();$('[data-layer="'+activeLayer+'"]').focus({preventScroll:true});return;}
    if(button.dataset.upgrade){calculate({type:'upgrade',facilityId:button.dataset.upgrade});render();return;}
    const act=button.dataset.act;
    switch(act){
      case 'guide-position':{const inst=instruction();if(inst?.locked&&inst.coordinate){activeTool='tower';activeLayer='telecom';place(inst.coordinate);}break;}
      case 'confirm':commit();break;
      case 'tower-remove-last':if(!readOnly&&!terminalReason&&activeTool==='tower'&&!instruction()?.locked){towerPositions=towerPositions.slice(0,-1);selectedPosition=towerPositions.at(-1)||null;calculate();message('');render();$('.puzzle-map').focus({preventScroll:true});}break;
      case 'route-remove-last':if(!readOnly&&!terminalReason&&activeTool==='connect'&&!instruction()?.locked){routeStops=routeStops.slice(0,-1);routeFrom=routeStops[0]||null;selectedId=routeStops.at(-1)||null;targetEdge=null;calculate();message('');render();$('.puzzle-map').focus({preventScroll:true});}break;
      case 'cancel':clearSelection();message('');render();$('.puzzle-map').focus({preventScroll:true});break;
      case 'clear-tool':activeTool=null;clearSelection();render();break;
      case 'dismiss-help':inlineHelp='';render();$('.puzzle-map').focus({preventScroll:true});break;
      case 'undo':try{state=undo(world,scenario,state);ev=evaluate(world,scenario,state);guide?.undo();clearSelection();lastResult=null;const inst=instruction();activeTool=inst?.locked?inst.tool:null;if(inst?.locked)activeLayer=inst.tool==='tower'?'telecom':'medical';updateCompletion();save();render();message('Последний ход отменён.');}catch(error){message(error.message,true);}break;
      case 'exit':await exitGame();break;
      case 'replay-tutorial':await exitGame(true);break;
      case 'finish-budget':updateCompletion(true);save();closeDialog();render();break;
      case 'close':closeDialog();break;
      case 'home':case 'menu':menu();break;
      case 'regions':regions();break;
      case 'start-free':{const id=$('#free-region').value,profile=selectedDifficulty();closeDialog();await boot(id,'free',{difficulty:profile});break;}
      case 'intro':closeDialog();await boot('chelyabinskaya_oblast','intro');break;
      case 'retry':if(retryTarget)await boot(retryTarget.regionId,retryTarget.requestedMode,retryTarget.options);break;
      case 'search':search();break;
      case 'focus':{const inst=instruction(),task=currentTask(),objective=scenario.kind==='intro'&&!inst?.locked&&!inst?.complete?tutorialObjective(ev):task?{service:task.service,ids:[task.id]}:null;if(objective){activeLayer=objective.service;save();render();map?.fitFocus(objective.ids);}else map?.fitFocus(targetIds());break;}
      case 'overview':closeDialog();map?.fitAll();break;
      case 'zoom-in':map?.zoom(1);break;
      case 'zoom-out':map?.zoom(-1);break;
      case 'tools':toolsOpen=!toolsOpen;inlineHelp='';if(toolsOpen){clearSelection();activeTool=instruction()?.locked?instruction().tool:null;}render();(toolsOpen?$('[data-tool]:not(:disabled)'):$('[data-act="tools"]'))?.focus({preventScroll:true});break;
      case 'summary':showDialog(scenario?.kind==='intro'?'Учебная группа · 7 поселений':'Обеспечение всего региона',progressSummary()+'<p class="muted">Знаменатель — поселения с известным спросом. Полное обеспечение означает удовлетворённый спрос, без скрытых порогов. Пункты с нулевым и неизвестным населением не объявляются обслуженными автоматически.</p>');break;
      case 'budget':closeDialog();inlineHelp=inlineHelp==='budget'?'':'budget';render();break;
      case 'details':details();break;
      case 'recipients':showRecipients();break;
      case 'last-result':closeDialog();inlineHelp=inlineHelp==='last-result'?'':'last-result';render();break;
      case 'help':help();break;
      case 'legend':closeDialog();inlineHelp=inlineHelp==='legend'?'':'legend';render();break;
      case 'legend-details':legend();break;
      case 'sources':sources();break;
      case 'settings':showDialog('Настройки',`<label class="toggle-row"><input type="checkbox" id="reduced-motion" ${reduced()?'checked':''}> Уменьшить движение</label><p>Все получатели и результаты остаются видимыми без анимации. Качество карты автоматически подстраивается под время кадра.</p>`);break;
      case 'export':if(state){downloadSave(snapshotSave());message('Файл сохранения подготовлен.');}break;
      case 'import':$('.puzzle-import').value='';$('.puzzle-import').click();break;
      case 'confirm-import':if(pendingImport){const data=pendingImport;pendingImport=null;closeDialog();await boot(data.regionId,savedMode(data)||data.ui?.mode||'campaign',{imported:data});}break;
      case 'restart':showDialog('Начать заново?',`${mode==='intro'?'':difficultySelector()}<p>Прогресс этого сценария будет заменён. Другие регионы и сложности сохранятся. Можно сначала экспортировать прохождение.</p>${mode==='intro'?'':'<p>Другая сложность открывает отдельную партию и сохраняет текущую.</p>'}<button class="primary wide" data-act="confirm-restart">Начать текущий сценарий заново</button>`);break;
      case 'confirm-restart':{const profile=mode==='intro'?'normal':selectedDifficulty(),restart=mode==='intro'||state?.rulesVersion===SOCIAL_RULES_VERSION&&profile===difficulty;closeDialog();await boot(world?.region.id||'chelyabinskaya_oblast',mode,{restart,difficulty:profile});break;}
    }
  });
  listen(root,'input',event=>{if(event.target.id==='settlement-search')searchResults(event.target.value);});
  listen(root,'keydown',event=>{if(event.key!=='Escape'||$('dialog').open)return;if(toolsOpen){toolsOpen=false;render();$('[data-act="tools"]')?.focus({preventScroll:true});}else if(inlineHelp){inlineHelp='';render();$('.puzzle-map').focus({preventScroll:true});}else return;event.preventDefault();event.stopPropagation();});
  listen(root,'change',event=>{if(event.target.id==='game-difficulty'){const profile=selectedDifficulty();$('#difficulty-description').textContent=DIFFICULTIES.find(d=>d.id===profile).description+'. У каждой сложности своё сохранение.';const confirm=$('[data-act="confirm-restart"]');if(confirm)confirm.textContent=profile===difficulty?'Начать текущий сценарий заново':'Открыть выбранную партию';}if(event.target.id==='reduced-motion'){preferences.reducedMotion=event.target.checked;try{storage.setPreferences(preferences);}catch{}map?.setReduced(reduced());render();}});
  listen($('.puzzle-import'),'change',event=>importedFile(event.target.files[0]));
  listen(media,'change',()=>{map?.setReduced(reduced());render();});
  listen($('dialog'),'cancel',event=>{event.preventDefault();closeDialog();});
  listen($('dialog'),'click',event=>{if(event.target===$('dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
  const resume=storage.resume(),requested=params.get('scenario')||params.get('mode');
  const initialMode=embedded?options.mode:!requested&&!params.get('region')&&savedMode(resume)?savedMode(resume):!storage.introDone()?'intro':requested==='intro'?'intro':requested==='free'?'free':params.get('region')?(curatedIds().includes(params.get('region'))?'campaign':'free'):savedMode(resume)||'intro';
  localize();
  try{await boot(initialMode==='intro'?'chelyabinskaya_oblast':params.get('region')||resume?.regionId||'moskovskaya_oblast',initialMode,{imported:options.initialSave||null,difficulty:embedded?options.difficulty:null});}catch(error){destroy();throw error;}
  return {
    setLocale(value){translator.setLocale(value);root.lang=value==='zh'||value==='zh-Hans'?'zh-Hans':value==='en'?'en':'ru';map?.setTranslator(t);render();localize();},
    setReadOnly(value){readOnly=Boolean(value);if(readOnly){toolsOpen=false;activeTool=null;clearSelection();}else{lastSaveFailure=null;saveError='';if(terminalReason&&!completionSent)save();}render();},
    snapshot,
    flush,
    inspect:()=>({uiVersion:'2.4.0',rulesVersion:state?.rulesVersion||null,ready:!!map&&!loading,mode,task:currentTask(),taskProgress:guide&&ev?guide.read(ev):null,difficulty:state?.rulesVersion===SOCIAL_RULES_VERSION?difficulty:null,regionId:world?.region.id,scenarioId:scenario?.id,activeLayer,activeTool,selectedId,routeFrom,targetEdge,towerPositions:towerPositions.map(position=>({...position})),preview:q?{ok:q.ok,cost:q.cost,error:q.error,delta:q.delta,action:q.action,joinId:q.joinId,requestedTo:q.requestedTo,targetEdge:q.targetEdge,freshPath:q.freshPath,freshEdgeKeys:q.freshEdgeKeys,...(q.transportCost?{transportCost:structuredClone(q.transportCost)}:{})}:null,state:state?structuredClone(state):null,tutorial:scenario?instruction():null,evaluation:ev?{complete:ev.complete,services:ev.services,groups:ev.groups}:null}),
    sceneEvidence:()=>map?.sceneEvidence(),mapPoint:value=>map?.screen(value),exportSave:()=>state?snapshotSave():null,
    destroy,
  };
}

/** Native platform boundary. Rules and replay remain the existing engine's.
 * The host owns identity, region assignment, cloud storage and navigation. */
export async function mountSettlementsGame(root,{locale='ru',regionId,mode='free',difficulty='normal',initialSave=null,owner,onCheckpoint,onComplete,onExit,onReplayTutorial,signal,readOnly=false}={}){
  if(!root||typeof root.querySelector!=='function')throw new TypeError('A game root is required');
  if(!['intro','campaign','free'].includes(mode))throw new TypeError('Unknown game mode');
  const profile=mode==='intro'?'normal':normalizeDifficulty(difficulty);
  const selectedRegion=mode==='intro'?'chelyabinskaya_oblast':regionId;
  if(!selectedRegion)throw new TypeError('A region is required');
  if(initialSave&&(initialSave.regionId!==selectedRegion||savedMode(initialSave)!==mode||mode!=='intro'&&initialSave.difficulty!==profile))throw new Error('Сохранение не соответствует назначенной партии.');
  const params=new URLSearchParams({region:selectedRegion,scenario:mode,difficulty:profile});
  root.lang=locale==='zh'||locale==='zh-Hans'?'zh-Hans':locale==='en'?'en':'ru';
  return mountPuzzle(root,params,{embedded:true,locale,mode,difficulty:profile,initialSave,owner,onCheckpoint,onComplete,onExit,onReplayTutorial,signal,readOnly});
}
