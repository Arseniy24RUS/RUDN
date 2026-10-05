/** Versioned, explicitly synthetic starting infrastructure on untouched source geography. */
import {haversine, hash} from '../v2/engine.mjs';
import {pointInBoundary} from './engine.mjs';
import {transportPolicyFor,canonicalTransportEdge} from './transport-policy-v1.mjs';
import {distanceTransportPolicyFor} from './transport-policy-v2.mjs';
import {TELECOM_RULES_VERSION,towerSpec,initialTowersFor,initialTowerThresholdFor} from './telecom-policy.mjs';
import {telecomPlanFor} from './telecom-plans.mjs';
import {SOCIAL_RULES_VERSION,SOCIAL_POLICY_VERSION,isRemoteSocialRegion,validateDifficulty} from './social-policy.mjs';
import {socialPlanFor,socialContentHash} from './social-plans.mjs';
import {INITIAL_TOWER_POLICY_VERSION,spacedInitialTowerSeeds} from './initial-tower-spacing.mjs';

export const CURATED_REGIONS = Object.freeze([
  'moskovskaya_oblast', 'respublika_tyva', 'chukotskiy_avtonomnyy_okrug',
  'arkhangelskaya_oblast', 'kaliningradskaya_oblast', 'respublika_sakha_yakutiya',
]);
export const INTRO_IDS = Object.freeze(['44286','76826','136904','113445','149471','93651','68770'].map(id=>`chelyabinskaya_oblast:${id}`));
export const INTRO_SITES = Object.freeze({
  A:Object.freeze({lat:55.920,lon:61.581}),
  B:Object.freeze({lat:55.890,lon:61.520}),
  C:Object.freeze({lat:55.949,lon:61.551}),
});
export const INTRO_SITES_V5 = Object.freeze({
  A:Object.freeze({lat:55.95765,lon:61.6578}),
  B:Object.freeze({lat:55.89335,lon:61.4931}),
  C:Object.freeze({lat:55.9647,lon:61.6477}),
});
const SERVICE_TYPES = ['telecom','medical','school','culture'];
const clone = value=>structuredClone(value);
const compareId = (a,b)=>a<b?-1:a>b?1:0;
const positive = row=>Number.isFinite(row.population)&&row.population>0;
const units = (row,service)=>positive(row)?Math.round(row.population*(service==='school'?16:100)):0;
function fullBaseline(world){
  const baseline=Object.fromEntries(SERVICE_TYPES.map(service=>[service,{}]));
  for(const row of world.rows)if(positive(row))for(const service of SERVICE_TYPES)baseline[service][row.id]=service==='telecom'?true:units(row,service);
  return baseline;
}
function metadata(){return {
  initialNetwork:'synthetic-scenario-not-real-institutions',
  populationSource:'unchanged-regional-pack',
  baselineCapacity:'exactly-reserved-assignments-no-free-capacity',
  waterMask:'unavailable',landPlacementVerified:false,
  humanDurationMeasured:false,
};}

function createIntroScenarioV1(world,boundary){
  if(world.region.id!=='chelyabinskaya_oblast'||INTRO_IDS.some(id=>!world.row(id)))throw new Error('Вводный сценарий требует исходные семь поселений Челябинской области');
  const [big,small,mansur,kunak,tulyak,sultan,irka]=INTRO_IDS;
  const baseline=fullBaseline(world);
  for(const id of INTRO_IDS){baseline.medical[id]=0;baseline.telecom[id]=false;}
  for(const id of [big,small,mansur])baseline.school[id]=0;
  const first={type:'tower',...INTRO_SITES.A};
  const second={type:'build',service:'medical',settlementId:big};
  const third={type:'connect',from:big,to:mansur};
  return {
    id:'intro-chelyabinsk-7',version:1,regionId:world.region.id,kind:'intro',
    title:'Семь поселений: связь и общая сеть',initialBudget:90,targetIds:[...INTRO_IDS],
    baseline,
    initialFacilities:[
      {id:'initial-medical-tulyak',type:'medical',settlementId:tulyak},
      {id:'initial-school-mansur',type:'school',settlementId:mansur},
    ],
    initialRoutes:[{from:tulyak,to:irka}],
    groups:[
      {id:'intro-telecom',title:'Связь для семи поселений',service:'telecom',ids:[...INTRO_IDS]},
      {id:'intro-medical',title:'Медицина для семи поселений',service:'medical',ids:[...INTRO_IDS]},
      {id:'intro-school',title:'Общая дорога к школе',service:'school',ids:[big,small,mansur]},
    ],
    tutorial:{completionServices:[...SERVICE_TYPES],steps:[
      {title:'Разместите вышку',hint:'Примерьте вышку в отмеченном месте и подтвердите. Радиус — учебное условие, не модель радиосвязи.',tool:'tower',coordinate:{...INTRO_SITES.A},toleranceKm:0.000001,action:first},
      {title:'Создайте медицинский центр',hint:'Постройте клинику в Большой Казакбаевой. Сравните новых получателей с картой до подтверждения.',tool:'medical',settlementId:big,action:second},
      {title:'Соедините две услуги',hint:'Соедините Большую Казакбаеву с Мансуровой. Один маршрут помогает медицине и школе.',tool:'connect',from:big,to:mansur,action:third},
    ]},
    boundary:boundary?clone(boundary):null,
    referenceActions:[first,second,third,{type:'tower',...INTRO_SITES.B},{type:'connect',from:sultan,to:big}],
    metadata:{...metadata(),seed:24001,completionScope:'intro-targets-only',diagnosticAlternative:{...INTRO_SITES.C},expectedReferenceCost:80},
  };
}

const LABELS={telecom:'Связь',medical:'Медицина',school:'Образование',culture:'Досуг'};
const CAPACITY={medical:200000,school:26000,culture:180000,outreach:50000};
const PRICES={medical:32,school:48,culture:22,outreach:9,tower:12};
const UPGRADE_PRICES={medical:16.6,school:25,culture:11.4,outreach:4.7};
const segment=(a,b)=>compareId(a,b)<0?`${a}|${b}`:`${b}|${a}`;

function chooseSites(world,boundary,seed){
  const candidates=world.valid.filter(row=>positive(row)&&pointInBoundary(boundary,row.lat,row.lon)).sort((a,b)=>compareId(a.id,b.id));
  if(!candidates.length)throw new Error('В регионе нет известного положительного спроса внутри заданной границы');
  const preferred=candidates.filter(row=>row.population>=100&&row.population<=5000);
  const pool=preferred.length?preferred:candidates;
  const selected=[pool[seed%pool.length]],minimum=new Map(candidates.map(row=>[row.id,Infinity]));
  while(selected.length<12&&selected.length<candidates.length){
    const last=selected.at(-1);let best=null;
    for(const row of candidates){
      const distance=Math.min(minimum.get(row.id),haversine(last,row));minimum.set(row.id,distance);
      if(selected.some(point=>point.id===row.id))continue;
      // Separation keeps an individual tower useful; population does not alter source geography.
      const score=distance*(.8+.2*Math.min(1,Math.sqrt(row.population/1500)));
      if(!best||score>best.score||(score===best.score&&compareId(row.id,best.row.id)<0))best={row,distance,score};
    }
    if(!best||best.distance<5.6)break;
    selected.push(best.row);
  }
  return selected;
}
function makeGroups(world,service,ids){
  const remaining=ids.map(id=>world.row(id)).sort((a,b)=>a.lon-b.lon||a.lat-b.lat||compareId(a.id,b.id)),groups=[];
  const count=Math.min(3,remaining.length);
  for(let group=0;group<count;group++){
    const size=Math.ceil(remaining.length/(count-group)),anchor=remaining[0];
    remaining.sort((a,b)=>haversine(anchor,a)-haversine(anchor,b)||compareId(a.id,b.id));
    const members=remaining.splice(0,size);
    groups.push({id:`${service}-${group+1}`,title:`${LABELS[service]}: ${anchor.name} и соседние пункты`,service,ids:members.map(row=>row.id)});
  }
  return groups;
}
function existingHub(world,target,service,excluded){
  const walkLimit=service==='school'?30:35,totalLimit=service==='school'?55:60;
  const walk=world.shortest(target.index,world.walk,walkLimit).dist;
  const options=[];
  for(const [index,minutes] of world.drive[target.index]){
    const row=world.rows[index];if(excluded.has(row.id)||!positive(row)||Number.isFinite(walk[index])||minutes>totalLimit)continue;
    const route=world.route(target.id,row.id);if(!route||route.minutes>totalLimit)continue;
    options.push({row,route});
  }
  options.sort((a,b)=>a.route.path.length-b.route.path.length||a.route.minutes-b.route.minutes||compareId(a.row.id,b.row.id));
  return options[0]||null;
}
function referenceCost(world,facilities,routes,actions,transportPolicy=null,towerPrice=PRICES.tower){
  const active=new Set(),knownFacilities=facilities.map(f=>({...f}));
  for(const route of routes){const path=world.route(route.from,route.to)?.path;if(!path)throw new Error('Исходный маршрут отсутствует в учебном графе');for(let i=1;i<path.length;i++)active.add(segment(path[i-1],path[i]));}
  let total=0;
  for(const [index,action] of actions.entries()){
    if(action.type==='tower')total+=towerPrice;
    else if(action.type==='build'){total+=PRICES[action.service];knownFacilities.push({id:`facility:${index+1}`,type:action.service});}
    else if(action.type==='upgrade'){
      const facility=knownFacilities.find(item=>item.id===action.facilityId);
      if(!facility)throw new Error('Расширяемый сценарный объект отсутствует');total+=UPGRADE_PRICES[facility.type];
    }else if(action.type==='connect'){
      const path=world.route(action.from,action.to)?.path;if(!path)throw new Error('Контрольный маршрут отсутствует в учебном графе');
      for(let i=1;i<path.length;i++){const key=segment(path[i-1],path[i]);if(!active.has(key)){
        if(transportPolicy){
          const at=canonicalTransportEdge(path[i-1],path[i]),required=transportPolicy.roadRequired[at];
          if(typeof required!=='boolean')throw new Error('В дорожных условиях отсутствует участок');
          if(transportPolicy.version==='transport-policy-v2'){
            const metres=transportPolicy.distanceMeters[at];if(!Number.isSafeInteger(metres)||metres<0)throw new Error('В дорожных условиях отсутствует расстояние');
            total+=(Math.floor((metres+250)/500)+(required?Math.floor((6*metres+250)/500):0))/10;
          }else total+=2+(required?6:0);
        }
        else total+=8;
        active.add(key);
      }}
    }
  }
  return Math.round(total*10)/10;
}

// Authored IDs, reviewed against the supplied graph. These are compact local
// service problems; geographically remote packages are never merged into a group.
const CURATED_PAIRS={
  moskovskaya_oblast:[['73809','132447'],['115374','38103'],['110537','93845']],
  respublika_tyva:[['110252','149912'],['118941','140058'],['130896','21152']],
  arkhangelskaya_oblast:[['32270','72203'],['115987','94229'],['85146','39291']],
  kaliningradskaya_oblast:[['134278','480'],['50029','100119'],['113176','94874']],
  respublika_sakha_yakutiya:[['59531','117941'],['92174','42309'],['49879','92556']],
};
function midpoint(a,b){
  const rad=Math.PI/180,p=a.lat*rad,q=b.lat*rad,d=((b.lon-a.lon+540)%360-180)*rad;
  const x=Math.cos(q)*Math.cos(d),y=Math.cos(q)*Math.sin(d);
  return {lat:Math.atan2(Math.sin(p)+Math.sin(q),Math.sqrt((Math.cos(p)+x)**2+y*y))/rad,lon:((a.lon+Math.atan2(y,Math.cos(p)+x)/rad+540)%360)-180};
}
function buildAction(actions,service,id){const facilityId=`facility:${actions.length+1}`;actions.push({type:'build',service,settlementId:id});return facilityId;}
function upgradeAction(actions,facilityId){actions.push({type:'upgrade',facilityId});}
function pairActions(world,boundary,packages,{alternative=false}={}){
  const actions=[];
  for(const item of packages){
    const a=world.row(item.a),b=world.row(item.b),center=midpoint(a,b);
    // This is a geometric alternative only; it does not certify dry land.
    if(alternative&&!item.noMidpoint&&haversine(a,b)<=11&&pointInBoundary(boundary,center.lat,center.lon))actions.push({type:'tower',...center});
    else for(const row of [a,b])actions.push({type:'tower',lat:row.lat,lon:row.lon});
    const first=alternative?b.id:a.id,last=alternative?a.id:b.id;
    let medical;
    if(item.medical)medical=buildAction(actions,'medical',first);
    actions.push({type:'connect',from:a.id,to:b.id});
    if(item.medical){upgradeAction(actions,medical);buildAction(actions,'medical',last);}
    if(item.outreach){const outreach=buildAction(actions,'outreach',b.id);upgradeAction(actions,outreach);}
    upgradeAction(actions,item.schoolId);buildAction(actions,'school',b.id);
    if(item.culture){const culture=buildAction(actions,'culture',first);upgradeAction(actions,culture);buildAction(actions,'culture',last);}
  }
  return actions;
}
function curatedScenario(world,boundary){
  const baseline=fullBaseline(world),groups=[],initialFacilities=[],packages=[],targetIds=world.rows.filter(positive).map(row=>row.id).sort(compareId);
  const id=suffix=>`${world.region.id}:${suffix}`;
  const addGap=(service,at,gap)=>{const row=world.row(at);if(!row||!positive(row))throw new Error('Исходный населённый пункт курируемого сценария отсутствует');baseline[service][at]=service==='telecom'?false:units(row,service)-Math.min(units(row,service),gap);};
  const addGroup=(service,ids,label)=>groups.push({id:`${label}-${service}`,title:`${LABELS[service]}: ${ids.map(at=>world.row(at).name).join(' — ')}`,service,ids:[...ids]});
  const pairs=world.region.id==='chukotskiy_avtonomnyy_okrug'?[['44174','143217']]:CURATED_PAIRS[world.region.id];
  if(!pairs)throw new Error('Нет утверждённых локальных пакетов этого региона');
  for(const [index,[aRaw,bRaw]] of pairs.entries()){
    const a=id(aRaw),b=id(bRaw),A=world.row(a),B=world.row(b),route=world.route(a,b),arctic=world.region.id==='chukotskiy_avtonomnyy_okrug';
    // The third local package has a distinct existing-service layer. Its
    // remaining demand is still taken directly from these two source rows.
    const thirdCultureAlreadyServed=['respublika_tyva','kaliningradskaya_oblast','respublika_sakha_yakutiya'].includes(world.region.id);
    const medical=index!==2||thirdCultureAlreadyServed,culture=index!==2||!thirdCultureAlreadyServed;
    if(!A||!B||haversine(A,B)>30||!route||route.minutes>55)throw new Error('Локальный пакет не соответствует исходной географии или графу');
    const schoolId=`initial-school-package-${index+1}`;
    initialFacilities.push({id:schoolId,type:'school',settlementId:a});
    addGap('telecom',a);addGap('telecom',b);
    if(medical){addGap('medical',a,arctic?150000:100000);addGap('medical',b,arctic?500000:420000);}
    addGap('school',a,10000);addGap('school',b,62000);
    if(culture){addGap('culture',a,80000);addGap('culture',b,420000);}
    for(const service of SERVICE_TYPES)if((service!=='medical'||medical)&&(service!=='culture'||culture))addGroup(service,[a,b],`package-${index+1}`);
    packages.push({a,b,medical,culture,schoolId,outreach:arctic,noMidpoint:arctic,diameterKm:haversine(A,B),routePath:[...route.path],routeMinutes:route.minutes});
  }
  let referenceActions=pairActions(world,boundary,packages),alternativeActions=pairActions(world,boundary,packages,{alternative:true});
  if(world.region.id==='chukotskiy_avtonomnyy_okrug'){
    // Supplied travel times forbid transplanting the connected-pair puzzle to
    // Bilibino/Pevek. Their local solutions are deliberately separate packages.
    const isolated=[
      {at:id('135927'),label:'bilibino',telecom:true,medical:450000,school:46800,culture:0,outreachUpgrade:true},
      {at:id('152547'),label:'pevek',telecom:true,medical:403400,school:0,culture:324000,outreachUpgrade:false},
      {at:id('21357'),label:'egvekinot',telecom:false,medical:0,school:46800,culture:324000},
    ];
    for(const item of isolated){
      const row=world.row(item.at);if(!row||!positive(row))throw new Error('Нет исходной арктической локальной группы');
      if(item.telecom){addGap('telecom',item.at);addGroup('telecom',[item.at],item.label);}
      for(const service of ['medical','school','culture'])if(item[service]){addGap(service,item.at,item[service]);addGroup(service,[item.at],item.label);}
      const append=actions=>{
        if(item.telecom)actions.push({type:'tower',lat:row.lat,lon:row.lon});
        for(const service of ['medical','school','culture'])if(item[service]){
          const facility=buildAction(actions,service,item.at);upgradeAction(actions,facility);
          if(service==='medical'){const outreach=buildAction(actions,'outreach',item.at);if(item.outreachUpgrade)upgradeAction(actions,outreach);}
        }
      };
      append(referenceActions);append(alternativeActions);
      packages.push({a:item.at,b:item.at,diameterKm:0,routePath:[],routeMinutes:null,isolated:true,services:SERVICE_TYPES.filter(service=>item[service])});
    }
  }
  const cost=referenceCost(world,initialFacilities,[],referenceActions),alternativeCost=referenceCost(world,initialFacilities,[],alternativeActions);
  return {
    id:`campaign-${world.region.id}-v1`,version:1,regionId:world.region.id,kind:'campaign',
    title:`${world.region.name}: связанные услуги`,initialBudget:Math.ceil(cost*1.25/10)*10,
    targetIds,baseline,initialFacilities,initialRoutes:[],groups,tutorial:null,boundary:boundary?clone(boundary):null,referenceActions,
    metadata:{...metadata(),seed:hash(`${world.region.id}:authored-local-v1`),completionScope:'all-known-positive-region-points',
      expectedReferenceCost:cost,budgetReserveRatio:.25,budgetRoundingMillion:10,referenceLength:referenceActions.length,targetActionRange:[30,50],
      lengthWithinTarget:referenceActions.length>=30&&referenceActions.length<=50,unknownPopulationIds:world.rows.filter(row=>!Number.isFinite(row.population)).map(row=>row.id),
      packages,maximumGroupDiameterKm:Math.max(...packages.map(item=>item.diameterKm)),
      alternativeActions,expectedAlternativeCost:alternativeCost,
      alternativeMeaning:'Same source demand and rules: swap the first institution site; use one geometric midpoint tower where allowed. Not a dry-land certification.',
      validation:'requires-new-engine-audit',
    },
  };
}

function createRegionalScenarioV1(world,boundary,{mode='campaign'}={}){
  if(!['campaign','free'].includes(mode))throw new Error('Неизвестный режим сценария');
  if(mode==='campaign'&&!CURATED_REGIONS.includes(world.region.id))throw new Error('Для этого региона предусмотрен свободный режим');
  if(mode==='campaign')return curatedScenario(world,boundary);
  const seed=hash(`${world.region.id}:regional-v1`),sites=chooseSites(world,boundary,seed),baseline=fullBaseline(world);
  const perService=sites.length>=10?sites.length-2:sites.length,deficits={},groups=[],initialFacilities=[],initialRoutes=[],referenceActions=[];
  const siteIds=new Set(sites.map(row=>row.id));
  for(let index=0;index<SERVICE_TYPES.length;index++){
    const service=SERVICE_TYPES[index],selected=Array.from({length:perService},(_,i)=>sites[(i+index*3)%sites.length]);
    deficits[service]=selected.map(row=>row.id);groups.push(...makeGroups(world,service,deficits[service]));
    for(const row of selected)baseline[service][row.id]=service==='telecom'?false:units(row,service)-Math.min(units(row,service),CAPACITY[service]);
  }
  // The witness is diagnostic only. The UI receives deficits, never a recommended next action.
  for(const id of deficits.telecom){const row=world.row(id);referenceActions.push({type:'tower',lat:row.lat,lon:row.lon});}
  for(const service of ['medical','school','culture'])for(let index=0;index<deficits[service].length;index++){
    const id=deficits[service][index],row=world.row(id),gap=units(row,service)-baseline[service][id];
    if(service==='medical'&&index===0&&gap>=50000){
      const facilityId='initial-medical-expansion';
      initialFacilities.push({id:facilityId,type:service,settlementId:id,capacityUnits:Math.floor(gap/2)});
      referenceActions.push({type:'upgrade',facilityId});
      continue;
    }
    const hub=index===1&&service!=='culture'?existingHub(world,row,service,siteIds):null;
    if(hub){
      initialFacilities.push({id:`initial-${service}-hub`,type:service,settlementId:hub.row.id,capacityUnits:CAPACITY[service]});
      referenceActions.push({type:'connect',from:id,to:hub.row.id});
    }else referenceActions.push({type:'build',service,settlementId:id});
  }
  const cost=referenceCost(world,initialFacilities,initialRoutes,referenceActions),targetIds=world.rows.filter(positive).map(row=>row.id).sort(compareId);
  const unknownIds=world.rows.filter(row=>!Number.isFinite(row.population)).map(row=>row.id).sort(compareId);
  return {
    id:`${mode}-${world.region.id}-v1`,version:1,regionId:world.region.id,kind:mode,
    title:`${world.region.name}: достройте сеть`,initialBudget:Math.ceil(cost*1.25/10)*10,
    targetIds,baseline,initialFacilities,initialRoutes,groups,tutorial:null,boundary:boundary?clone(boundary):null,referenceActions,
    metadata:{...metadata(),seed,completionScope:'all-known-positive-region-points',
      expectedReferenceCost:cost,budgetReserveRatio:.25,budgetRoundingMillion:10,referenceLength:referenceActions.length,
      targetActionRange:[30,50],lengthWithinTarget:referenceActions.length>=30&&referenceActions.length<=50,
      unknownPopulationIds:unknownIds,selectedSiteCount:sites.length,
      validation:'requires-new-engine-audit',
    },
  };
}

/** A new rules/scenario identity preserves the entire old budget envelope and
 * task definition. Cheaper transport never silently reduces the starting bank.
 */
function withoutLegacyTowers(actions){
  const out=[],builtIds=new Map();
  for(const [index,source] of actions.entries()){
    if(source.type==='tower')continue;
    const action=clone(source);
    if(action.type==='build')builtIds.set(`facility:${index+1}`,`facility:${out.length+1}`);
    if(action.type==='upgrade'&&builtIds.has(action.facilityId))action.facilityId=builtIds.get(action.facilityId);
    out.push(action);
  }
  return out;
}

function withVisibleTelecom(world,scenario){
  const plan=telecomPlanFor(world),tower=towerSpec(TELECOM_RULES_VERSION);
  const newTowers=plan.centerIds.map(id=>{const row=world.row(id);return {type:'tower',lat:row.lat,lon:row.lon};});
  const adapt=actions=>scenario.kind==='intro'?clone(actions):[...withoutLegacyTowers(actions),...newTowers];
  const referenceActions=adapt(scenario.referenceActions),initialTowers=initialTowersFor(world);
  const price=actions=>referenceCost(world,scenario.initialFacilities,scenario.initialRoutes,actions,scenario.transportPolicy,tower.cost);
  const socialGroups=scenario.groups.filter(group=>group.service!=='telecom'),networkGroups=clone(plan.groups);
  const groups=scenario.kind==='intro'?clone(scenario.groups):networkGroups.length?
    [networkGroups[0],...clone(socialGroups),...networkGroups.slice(1)]:clone(socialGroups);
  const alternativeActions=scenario.metadata.alternativeActions?adapt(scenario.metadata.alternativeActions):null;
  return {...scenario,id:scenario.id.replace(/-v3$/,'-v4'),version:4,rulesVersion:TELECOM_RULES_VERSION,
    telecomPlanVersion:plan.version,telecomPlanFingerprint:plan.fingerprint,
    baseline:{...scenario.baseline,telecom:{}},initialTowers,groups,referenceActions,
    metadata:{...scenario.metadata,expectedReferenceCost:price(referenceActions),
      referenceLength:referenceActions.length,
      lengthWithinTarget:referenceActions.length>=30&&referenceActions.length<=50,
      ...(alternativeActions?{alternativeActions,expectedAlternativeCost:price(alternativeActions)}:{}),
      telecomBasis:'geographic-tower-coverage-only',telecomRadiusKm:tower.radiusKm,
      telecomInitialPopulationThreshold:initialTowerThresholdFor(world),telecomTowerCost:tower.cost,
      initialTowerCount:initialTowers.length,telecomPlanFingerprint:plan.fingerprint,
      telecomReferenceActions:scenario.kind==='intro'?2:newTowers.length,
      humanDurationMeasured:false,
    },
  };
}

function withScenarioVersion(world,scenario,version){
  if(version===4){
    // The new version is only available after its authored regional plan has
    // loaded. Older synchronous callers must not receive a partial scenario.
    try{telecomPlanFor(world);}catch(error){throw new Error('Эта версия сценария требует загрузки регионального плана связи',{cause:error});}
    return withVisibleTelecom(world,withScenarioVersion(world,scenario,3));
  }
  if(version===1)return scenario;
  if(version!==2&&version!==3)throw new Error('Неизвестная версия сценария');
  const policy=version===3?distanceTransportPolicyFor(world):transportPolicyFor(world),legacyCost=scenario.metadata.expectedReferenceCost;
  const price=actions=>referenceCost(world,scenario.initialFacilities,scenario.initialRoutes,actions,policy);
  return {
    ...scenario,id:scenario.kind==='intro'?`${scenario.id}-v${version}`:scenario.id.replace(/-v1$/,`-v${version}`),
    version,rulesVersion:version===3?'settlements-3.2.0':'settlements-3.1.0',transportPolicy:policy,
    metadata:{...scenario.metadata,expectedReferenceCost:price(scenario.referenceActions),
      ...(scenario.metadata.alternativeActions?{expectedAlternativeCost:price(scenario.metadata.alternativeActions)}:{}),
      budgetBasisRulesVersion:'settlements-3.0.0',budgetBasisReferenceCost:legacyCost,
      transportPolicyVersion:policy.version,transportPolicyFingerprint:policy.fingerprint,
    },
  };
}

export function createIntroScenario(world,boundary,{version=1}={}){
  if(version===5){
    const intro=withScenarioVersion(world,createIntroScenarioV1(world,boundary),3);
    const referenceActions=clone(intro.referenceActions);referenceActions[0]={type:'tower',...INTRO_SITES_V5.A};referenceActions[3]={type:'tower',...INTRO_SITES_V5.B};
    referenceActions.push({type:'build',service:'culture',settlementId:INTRO_IDS[4]});
    const baseline={...intro.baseline,telecom:{},culture:{...intro.baseline.culture,[INTRO_IDS[4]]:0,[INTRO_IDS[6]]:0}};
    const groups=[...clone(intro.groups),{id:'intro-culture',title:'Досуг для двух соседних поселений',service:'culture',ids:[INTRO_IDS[4],INTRO_IDS[6]]}];
    const tutorial=clone(intro.tutorial);tutorial.steps[0].coordinate={...INTRO_SITES_V5.A};tutorial.steps[0].action=clone(referenceActions[0]);
    const parameters={rulesVersion:SOCIAL_RULES_VERSION,telecomInitialPopulationThreshold:8000};
    const socialPolicyFingerprint=socialContentHash({version:SOCIAL_POLICY_VERSION,kind:'intro-v5-six-actions',referenceActions,tutorial,baseline,groups,initialFacilities:intro.initialFacilities,initialRoutes:intro.initialRoutes});
    return {...intro,...parameters,id:'intro-chelyabinsk-7-v5',version:5,difficulty:'normal',tutorial,referenceActions,groups,
      baseline,initialTowers:initialTowersFor(world,parameters),
      telecomPlanVersion:'telecom-plan-v2',telecomPlanFingerprint:socialContentHash({version:'telecom-plan-v2',radiusKm:10,initialPopulationThreshold:8000,sites:INTRO_SITES_V5}),
      socialPolicyVersion:SOCIAL_POLICY_VERSION,socialPolicyFingerprint,
      metadata:{...intro.metadata,socialSetup:'guided-intro-reserved-network',socialPolicyFingerprint,
        telecomBasis:'geographic-tower-coverage-only',telecomRadiusKm:10,telecomInitialPopulationThreshold:8000,telecomTowerCost:.2,
        diagnosticAlternative:{...INTRO_SITES_V5.C},expectedReferenceCost:referenceCost(world,intro.initialFacilities,intro.initialRoutes,referenceActions,intro.transportPolicy,.2)}};
  }
  return withScenarioVersion(world,createIntroScenarioV1(world,boundary),version);
}

export function createRegionalScenario(world,boundary,{mode='campaign',version=1,difficulty='normal',initialTowerPolicyVersion=INITIAL_TOWER_POLICY_VERSION}={}){
  if(version===5){
    if(!['campaign','free'].includes(mode)||mode==='campaign'&&!CURATED_REGIONS.includes(world.region.id))throw new Error('Для этого региона предусмотрен свободный режим');
    validateDifficulty(difficulty);
    const plan=socialPlanFor(world,difficulty),telecom=plan.telecom;
    const parameters={rulesVersion:SOCIAL_RULES_VERSION,telecomInitialPopulationThreshold:telecom.initialPopulationThreshold,telecomInitialSeedIds:clone(telecom.initialSeedIds)};
    if(initialTowerPolicyVersion!==null){
      if(initialTowerPolicyVersion!==INITIAL_TOWER_POLICY_VERSION)throw new Error('Неизвестная версия исходной сети связи');
      parameters.initialTowerPolicyVersion=INITIAL_TOWER_POLICY_VERSION;
      parameters.initialTowerPolicyFingerprint=spacedInitialTowerSeeds(world,telecom.initialSeedIds).fingerprint;
    }
    const initialTowers=initialTowersFor(world,parameters);
    return {id:`${mode}-${world.region.id}-v5-${difficulty}`,...parameters,version:5,difficulty,regionId:world.region.id,kind:mode,
      title:`${world.region.name}: учреждения и общая сеть`,initialBudget:plan.initialBudget,
      targetIds:world.rows.filter(positive).map(row=>row.id).sort(compareId),baseline:Object.fromEntries(SERVICE_TYPES.map(service=>[service,{}])),
      initialFacilities:clone(plan.initialFacilities),initialRoutes:clone(plan.initialRoutes),initialTowers,
      groups:clone(plan.groups),tutorial:null,boundary:boundary?clone(boundary):null,referenceActions:clone(plan.referenceActions),
      transportPolicy:distanceTransportPolicyFor(world),telecomPlanVersion:telecom.version,telecomPlanFingerprint:telecom.fingerprint,
      socialPolicyVersion:SOCIAL_POLICY_VERSION,socialPolicyFingerprint:plan.fingerprint,
      metadata:{...metadata(),...clone(plan.metadata),completionScope:'all-known-positive-region-points',
        initialNetwork:'visible-population-based-institutions-and-scenario-transport',baselineCapacity:'visible-facilities-only',
        socialInitialThresholds:clone(plan.thresholds),difficulty,
        socialTransportTimeLimit:isRemoteSocialRegion(world)?'unlimited':'medical60-school55-culture60',
        initialTowerCount:initialTowers.length,telecomRadiusKm:towerSpec(SOCIAL_RULES_VERSION).radiusKm,
        ...(parameters.initialTowerPolicyVersion?{initialTowerPolicyVersion:parameters.initialTowerPolicyVersion,originalInitialTowerCount:telecom.initialSeedIds.length}:{}),
        telecomInitialPopulationThreshold:telecom.initialPopulationThreshold,telecomTowerCost:towerSpec(SOCIAL_RULES_VERSION).cost,
        telecomReferenceActions:telecom.centres.length,referenceLength:plan.referenceActions.length,
        humanDurationMeasured:false,unknownPopulationIds:world.rows.filter(row=>!Number.isFinite(row.population)).map(row=>row.id),
      },
    };
  }
  return withScenarioVersion(world,createRegionalScenarioV1(world,boundary,{mode}),version);
}
