/* Synthetic, discrete-time cohort-component model. No empirical calibration is claimed.
 * Integer resident stocks: female/male, completed ages 0..99 and open group 100+.
 * Live births - all deaths + external net migration; internal moves conserve the region.
 * Sources and approximations: docs/DEMOGRAPHY.md.
 */
(function(root){
  'use strict';
  const VERSION='2.0.0';
  const ProjectState=root.GovernorGame?.ProjectState||(typeof require==='function'?require('./project-state.js'):null);
  const L=(ru,en)=>({ru,en});
  const clone=v=>JSON.parse(JSON.stringify(v));
  const sum=a=>a.reduce((s,v)=>s+v,0);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const round=(v,n=4)=>Number(v.toFixed(n));
  const ageGroup=a=>a<18?0:a<35?1:a<65?2:3;
  const total=m=>sum(m.female)+sum(m.male);
  const populationTotal=p=>sum(Object.values(p.municipalities).map(total));
  const cohortTotals=m=>[0,0,0,0].map((_,g)=>sum(m.female.map((v,a)=>ageGroup(a)===g?v+m.male[a]:0)));
  const ageRange=(m,lo,hi,sex)=>sum((sex?m[sex]:m.female.map((v,a)=>v+m.male[a])).slice(lo,hi+1));
  const zeros=()=>Array(101).fill(0);
  // Hamilton/largest-remainder allocation. Rounding preserves integer totals.
  function allocate(n,weights){
    n=Math.max(0,Math.round(n));const norm=sum(weights);
    if(!norm||!n)return weights.map(()=>0);
    const exact=weights.map(w=>n*w/norm),values=exact.map(Math.floor);
    const order=exact.map((v,i)=>({i,r:v-values[i]})).sort((a,b)=>b.r-a.r||a.i-b.i);
    let left=n-sum(values); for(let i=0;i<left;i++)values[order[i%order.length].i]++;
    return values;
  }
  function expectedCounts(expected){return allocate(Math.round(sum(expected)),expected);}
  function boundedTake(n,stock,weights){
    const result=stock.map(()=>0);let left=Math.min(Math.round(n),sum(stock));
    while(left>0){
      const w=weights.map((v,i)=>stock[i]>result[i]?v:0);
      if(!sum(w))break;
      const proposal=allocate(left,w);let moved=0;
      proposal.forEach((v,i)=>{const use=Math.min(v,stock[i]-result[i]);result[i]+=use;moved+=use;});
      if(!moved)break;left-=moved;
    }
    return result;
  }
  const MUNICIPALITIES=[
    {id:'north',district:'north',name:L('Северные поселения','Northern villages'),type:L('Сельская периферия','Rural periphery'),icon:'health',position:{x:45,y:23},population:120000,cohorts:[.18,.16,.39,.27],mobility:.40,digital:.48,health:.99,staff:.73,school:1.04,childcare:.58,jobs:.91,housing:1.07,externalBias:-.10,persona:L('Анна · фельдшер','Anna · paramedic')},
    {id:'industrial',district:'industrial',name:L('Заводской город','Industrial city'),type:L('Промышленный город','Industrial city'),icon:'factory',position:{x:26,y:52},population:260000,cohorts:[.18,.20,.42,.20],mobility:.68,digital:.66,health:1.02,staff:.96,school:1.03,childcare:.68,jobs:.93,housing:1.03,externalBias:-.04,persona:L('Денис · мастер цеха','Denis · workshop supervisor')},
    {id:'river',district:'river',name:L('Речной','Riverside'),type:L('Малый город','Small town'),icon:'house',position:{x:69,y:42},population:100000,cohorts:[.18,.18,.39,.25],mobility:.52,digital:.52,health:.99,staff:.88,school:1.10,childcare:.63,jobs:.90,housing:1.05,externalBias:-.07,persona:L('Валентина · пенсионерка','Valentina · retired resident')},
    {id:'capital',district:'capital',name:L('Областной центр','Regional centre'),type:L('Региональный центр','Regional centre'),icon:'digital',position:{x:57,y:73},population:530000,cohorts:[.18,.24,.40,.18],mobility:.86,digital:.85,health:1.11,staff:1.06,school:1.13,childcare:.91,jobs:1.07,housing:1.00,externalBias:.04,persona:L('Михаил · учитель','Mikhail · teacher')},
    {id:'suburb',district:'suburb',name:L('Новый берег','New Bank'),type:L('Растущий пригород','Growing suburb'),icon:'school',position:{x:80,y:65},population:190000,cohorts:[.26,.27,.36,.11],mobility:.47,digital:.72,health:.91,staff:.91,school:.57,childcare:.43,jobs:.63,housing:1.11,externalBias:.06,persona:L('Ольга · жительница квартала','Olga · neighbourhood resident')}
  ];
  const COHORTS=[L('0–17 лет','Ages 0–17'),L('18–34 года','Ages 18–34'),L('35–64 года','Ages 35–64'),L('65 лет и старше','Ages 65+')];
  // All values below are explicit GAME parameters. Capacities are person-equivalents,
  // not causal estimates or promised effects for a real-world policy.
  const OUTPUTS={
    'clinics':{health:40000,healthStaff:6500},
    'mobile-units':{health:18000,healthStaff:18000,mobility:.12},
    'train-staff':{healthStaff:42000},
    'skills-compact':{jobs:14000,flexWork:.015},'first-job':{jobs:16000},'industrial-park':{jobs:22000,housing:1500},
    'outreach':{floodProtection:.18},'defenses':{floodProtection:.55},'infrastructure':{mobility:.17,floodProtection:.28},
    'single-window':{digital:.22},'cyber-first':{digital:.10,digitalProtection:.55},'open-feedback':{digital:.14},
    'medical-hub':{health:48000,healthStaff:22000},'telemedicine-network':{health:22000,healthStaff:19000,digital:.20},
    'municipal-health-contracts':{health:8000,healthStaff:14000,mobility:.14},
    'supplier-clusters':{jobs:20000},'clean-line-modernisation':{jobs:16000,health:4000},'worker-income-guarantee':{familySupport:.06,flexWork:.015},
    'nature-buffer':{floodProtection:.60},'logistics-embankment':{jobs:5500,mobility:.15,floodProtection:.32},'zoning-moratorium':{floodProtection:.27,housing:-1200},
    'modular-platform':{digital:.20,digitalProtection:.35},'single-vendor-contract':{digital:.28,digitalProtection:.10},'civic-tech-lab':{digital:.16,jobs:1500},
    'emergency-purchase':{health:19000,healthStaff:19000,emergencyMortality:.34},'mobilise-network':{health:15000,healthStaff:15000,emergencyMortality:.30},'federal-help':{health:11000,healthStaff:11000,emergencyMortality:.22},
    'skills-scale':{jobs:17000,flexWork:.02},'housing-package':{housing:24000,childcare:1100},'startup-challenge':{jobs:10000},
    'evacuate':{emergencyMortality:.8,familySupport:.025},'rebuild-better':{housing:7500,floodProtection:.55,mobility:.05},'compensation':{familySupport:.13},
    'incident-command':{digitalProtection:.60,digital:.12},'offline-centres':{digital:.16,mobility:.03},'open-briefing':{digitalProtection:.16},
    'integrated-primary-care':{health:24000,healthStaff:26000,mobility:.08},'long-term-care-network':{elderCare:.40,healthStaff:11000,flexWork:.02},'hospital-consolidation':{health:8000,healthStaff:4000,mobility:-.10},
    'green-manufacturing':{jobs:25000,health:4000},'university-industry-city':{jobs:18000,housing:15000,school:2300,schoolStaff:2300},'investor-rebate':{jobs:14000},
    'resilient-relocation':{housing:13000,floodProtection:.60},'build-back-fast':{housing:22000,floodProtection:.10},'climate-insurance-pool':{floodProtection:.20,familySupport:.04},
    'open-ledger':{digital:.035},'citizens-assembly':{digital:.02},'legacy-expo':{},
    'school-campus':{school:7000,schoolStaff:7000},'school-bus':{schoolReach:.8,mobility:.07},'second-shift':{school:3200,schoolStaff:3200},
    'complete-neighbourhood':{housing:16000,childcare:2600,school:3800,schoolStaff:3800},'commuter-link':{mobility:.22,schoolReach:.35},'housing-first':{housing:35000},
    'modular-nursery':{childcare:5500},'licensed-childminders':{childcare:3100},'flexible-employers':{flexWork:.07},
    'mixed-generations':{health:14000,healthStaff:14000,childcare:2100,school:1800,schoolStaff:1800},'age-friendly-routes':{mobility:.10,elderCare:.22,healthStaff:8000},'family-grant':{familySupport:.10}
  };
  const ROUTES={
    'remote-cluster':{north:1},'district-centre':{north:.65,river:.35},'transport-junction':{north:.40,capital:.30,suburb:.30},
    'old-industrial-city':{industrial:1},'small-town-belt':{industrial:.45,river:.55},'logistics-corridor':{industrial:.45,suburb:.55},
    upstream:{river:.75,north:.25},'river-towns':{river:1},'delta-corridor':{river:.45,suburb:.55},
    'safe-terrace':{river:1},'existing-towns':{river:1},'regional-pool':{river:.7,north:.15,suburb:.15}
  };
  function targets(mission,placement){
    if(placement&&ROUTES[placement.id])return ROUTES[placement.id];
    if(mission.districtId==='capital')return {capital:.72,suburb:.28};
    return {[mission.districtId]:1};
  }
  function demands(m){
    const c=cohortTotals(m);const young=ageRange(m,18,34),adults=ageRange(m,35,64);
    return {population:sum(c),cohorts:c,children:c[0],elders:c[3],women1549:ageRange(m,15,49,'female'),
      school:ageRange(m,7,17),childcare:ageRange(m,0,6),health:c[0]*.6+c[1]*.65+c[2]+c[3]*2.2,
      labourPotential:young*.82+adults*.81+ageRange(m,65,69)*.15,parents:ageRange(m,20,44)};
  }
  function makeStock(c){
    const nums=allocate(c.population,c.cohorts),female=zeros(),male=zeros();
    for(let g=0;g<4;g++){
      const lo=[0,18,35,65][g],hi=[17,34,64,100][g];
      const w=Array.from({length:hi-lo+1},(_,i)=>g===3?Math.exp(-i/12):1);
      const counts=allocate(nums[g],w);
      counts.forEach((n,i)=>{const a=lo+i;female[a]=Math.round(n*(a<65?.495:.59));male[a]=n-female[a];});
    }
    return {female,male};
  }
  function create(scenarioId){
    const p={version:VERSION,baseYear:2026,year:2026,municipalities:{},ledgers:[],lastYear:null,temporary:[],shock:null,derived:null,initial:null};
    for(const config of MUNICIPALITIES){
      const c=clone(config);
      if(scenarioId==='demographic'){c.cohorts=[c.cohorts[0]-.035,c.cohorts[1]-.025,c.cohorts[2],c.cohorts[3]+.06];}
      const stock=makeStock(c),d=demands(stock);
      const badNetwork=scenarioId==='infrastructure'?.88:1;
      const base={health:d.health*c.health,healthStaff:d.health*c.staff,school:d.school*c.school,schoolStaff:d.school*Math.max(.78,c.school),childcare:d.childcare*c.childcare,
        jobs:d.labourPotential*c.jobs,housing:c.population*c.housing,mobility:c.mobility*badNetwork,digital:clamp(c.digital+(scenarioId==='digital'?.12:0),0,1),
        schoolReach:0,flexWork:0,elderCare:0,familySupport:0,floodProtection:0,digitalProtection:0,emergencyMortality:0};
      p.municipalities[c.id]={id:c.id,...stock,base,initialPopulation:c.population,initialAdults:d.cohorts[1]+d.cohorts[2]};
    }
    const fake={population:p,finance:{portfolio:[]},scenarioId};
    p.derived=derive(fake);p.initial={population:populationTotal(p),employed:p.derived.employed,children:p.derived.children,elders:p.derived.elders,access:clone(p.derived.municipalities)};
    return p;
  }
  function outputsFor(actionId){
    if(actionId.startsWith('defer-'))return {};
    if(!Object.hasOwn(OUTPUTS,actionId))throw new Error(`Missing population profile: ${actionId}`);
    return OUTPUTS[actionId];
  }
  function registerDecision(state,mission,action,plan,project,placement,delivery){
    const spec={actionId:action.id,targets:targets(mission,placement),outputs:clone(outputsFor(action.id)),factor:round(plan.implementationFactor*plan.effectFactor*delivery.effectFactor)};
    if(project){
      // The stored object, not the preview copy, owns the service lifecycle.
      const stored=state.finance.portfolio.find(p=>p.id===project.id);if(stored)stored.people=spec;
    }else state.population.temporary.push({...spec,year:state.population.year});
  }
  function getSupply(state,extra){
    const p=state.population,supply=Object.fromEntries(Object.entries(p.municipalities).map(([id,m])=>[id,clone(m.base)]));
    const apply=spec=>{
      if(!spec)return;
      for(const[id,weight]of Object.entries(spec.targets)){
        if(!supply[id])throw new Error(`Unknown population destination ${id}`);
        for(const[k,v]of Object.entries(spec.outputs)){if(!(k in supply[id]))throw new Error(`Unknown service output ${k}`);supply[id][k]+=v*weight*spec.factor;}
      }
    };
    for(const project of state.finance.portfolio||[]){
      if(project.people)apply({...project.people,outputs:ProjectState.outputs(project,(state.turnIndex||0)+1)});
    }
    for(const spec of p.temporary||[])if(spec.year===p.year)apply(spec);
    if(extra)apply(extra);
    for(const[id,m]of Object.entries(p.municipalities)){
      // Existing staff availability follows the local adult pool, not just buildings.
      const adults=ageRange(m,18,64);const ratio=adults/m.initialAdults;
      supply[id].healthStaff*=.70+.30*ratio;supply[id].schoolStaff*=.80+.20*ratio;
      ['mobility','digital','elderCare','familySupport','floodProtection','digitalProtection','emergencyMortality','schoolReach'].forEach(k=>supply[id][k]=clamp(supply[id][k],0,1));
    }
    const shock=p.shock;
    if(shock && supply[shock.districtId]) {
      const s=supply[shock.districtId],severity=clamp(Number(shock.gap)||0,0,10);
      if(shock.key==='jobs')s.jobs*=1-severity*.012;
      if(shock.key==='digital')s.digital*=1-severity*.055*(1-s.digitalProtection);
      if(shock.key==='flood'){
        const damage=severity*.006*(1-s.floodProtection);
        s.housing*=1-damage;s.mobility*=1-damage*2;
      }
    }
    return supply;
  }
  function derive(state,extra=null){
    const p=state.population,supply=getSupply(state,extra),mun={};
    for(const[id,m]of Object.entries(p.municipalities)){
      const d=demands(m),s=supply[id];
      const housingCapacity=Math.max(1,s.housing),childcareAccess=clamp(s.childcare/Math.max(1,d.childcare),0,1);
      const parentConstraint=d.parents*Math.max(0,.055*(1-childcareAccess)-s.flexWork);
      const labour=Math.max(0,Math.round(d.labourPotential-parentConstraint));
      const healthAvailable=Math.min(s.health,s.healthStaff)*(.45+.55*s.mobility)*(.92+.08*s.digital);
      const schoolAvailable=Math.min(s.school,s.schoolStaff);
      mun[id]={id,...d,labour,employed:Math.round(Math.min(labour,s.jobs)),commuters:0,commutersReceived:0,
        vacancies:Math.max(0,Math.round(s.jobs-labour)),jobs:Math.round(s.jobs),
        healthAccess:clamp(healthAvailable/Math.max(1,d.health),0,1),schoolAccess:clamp(schoolAvailable/Math.max(1,d.school),0,1),
        childcareAccess,housingAccess:clamp(housingCapacity/d.population,0,1),housingCapacity,
        digitalAccess:s.digital,mobility:s.mobility,schoolTravel:0,schoolSpare:Math.max(0,Math.floor(schoolAvailable-d.school)),
        unmetSchool:Math.max(0,Math.ceil(d.school-schoolAvailable)),flexWork:s.flexWork,elderCare:s.elderCare,
        familySupport:s.familySupport,floodProtection:s.floodProtection,digitalProtection:s.digitalProtection,emergencyMortality:s.emergencyMortality};
    }
    // School bus places are borrowed from a real spare capacity, never manufactured.
    for(const id of Object.keys(mun)){
      const m=mun[id];let need=Math.min(m.unmetSchool,Math.floor(m.school*supply[id].schoolReach));
      for(const dest of Object.keys(mun).filter(dest=>dest!==id && travelMinutes(id,dest)<=60).sort((a,b)=>travelMinutes(id,a)-travelMinutes(id,b))){
        if(need<=0)continue;
        const use=Math.min(need,mun[dest].schoolSpare);mun[dest].schoolSpare-=use;m.schoolTravel+=use;need-=use;
      }
      m.schoolAccess=clamp(m.schoolAccess+m.schoolTravel/Math.max(1,m.school),0,1);
    }
    // Commuting is a job match, not a change of residence.
    for(const id of ['suburb','north','river','industrial','capital']){
      const m=mun[id];let seekers=Math.min(m.labour-m.employed,Math.round(m.labour*m.mobility*.28));
      const destinations=Object.keys(mun).filter(d=>d!==id && travelMinutes(id,d)<=90).sort((a,b)=>travelMinutes(id,a)-travelMinutes(id,b));
      for(const dest of destinations){
        const reach=Math.max(.1,1-travelMinutes(id,dest)/120);const n=Math.min(mun[dest].vacancies,Math.round(seekers*reach));
        m.employed+=n;m.commuters+=n;mun[dest].commutersReceived+=n;mun[dest].vacancies-=n;seekers-=n;
      }
    }
    for(const id of Object.keys(mun)){
      const m=mun[id],config=MUNICIPALITIES.find(c=>c.id===id);
      m.employment=clamp(m.employed/Math.max(1,m.labour),0,1);
      m.attractiveness=clamp(.34*m.employment+.18*m.healthAccess+.16*m.schoolAccess+.12*m.childcareAccess+.12*m.housingAccess+.08*m.digitalAccess+config.externalBias,0,1);
    }
    const values=Object.values(mun),pop=sum(values.map(v=>v.population));
    return {municipalities:mun,population:pop,children:sum(values.map(v=>v.children)),elders:sum(values.map(v=>v.elders)),employed:sum(values.map(v=>v.employed)),
      labour:sum(values.map(v=>v.labour)),commuters:sum(values.map(v=>v.commuters)),women1549:sum(values.map(v=>v.women1549)),
      accessGap:Math.max(...values.map(v=>v.healthAccess))-Math.min(...values.map(v=>v.healthAccess)),
      healthAccess:sum(values.map(v=>v.healthAccess*v.population))/pop,schoolAccess:sum(values.map(v=>v.schoolAccess*v.school))/Math.max(1,sum(values.map(v=>v.school)))};
  }
  // Stylised symmetric journey times, not geographic measurements. One shared
  // graph serves school and employment links and is exported to the interface.
  const TRANSPORT={north:{industrial:90,river:105,capital:120,suburb:145},industrial:{river:70,capital:50,suburb:80},river:{capital:50,suburb:45},capital:{suburb:30}};
  function travelMinutes(a,b){if(a===b)return 0;return TRANSPORT[a]?.[b]??TRANSPORT[b]?.[a]??Infinity;}
  function distance(a,b){return travelMinutes(a,b)/2;}
  function qx(age,sex){
    const q=age===0?.004:age<15?.00018:age<30?.0006:age<50?.0017:age<65?.0065:age<75?.017:age<85?.05:age<95?.14:.30;
    return q*(sex==='male'?(age<15?1.05:1.2):(age<15?.95:.83));
  }
  function fertility(a){return a<15||a>49?0:a<20?.015:a<25?.052:a<30?.082:a<35?.084:a<40?.045:a<45?.012:.0008;}
  function subtract(m,counts){for(const sex of ['female','male'])for(let a=0;a<=100;a++)m[sex][a]-=counts[sex][a];}
  function add(m,counts){for(const sex of ['female','male'])for(let a=0;a<=100;a++)m[sex][a]+=counts[sex][a];}
  function countStock(m){return sum(m.female)+sum(m.male);}
  function takeMovers(m,n){
    const stocks=m.female.concat(m.male);
    const weights=stocks.map((v,i)=>{const a=i%101;return v*(a<18?.7:a<35?2.5:a<65?1:.18);});
    const vals=boundedTake(n,stocks,weights);return {female:vals.slice(0,101),male:vals.slice(101)};
  }
  function takeFloodCasualties(m,n){
    const stocks=m.female.concat(m.male);
    // Exposure weights are distinct from migration preferences. Older people and
    // children are more vulnerable in this synthetic disaster mechanism.
    const weights=stocks.map((v,i)=>v*(i%101<18?1.2:i%101>=65?1.6:1));
    const vals=boundedTake(n,stocks,weights);return {female:vals.slice(0,101),male:vals.slice(101)};
  }
  function immigrantStock(n){
    const weights=Array.from({length:202},(_,i)=>{const a=i%101;return a<18?.18/18:a<35?.50/17:a<65?.29/30:.03/36;});
    const counts=allocate(n,weights);return{female:counts.slice(0,101),male:counts.slice(101)};
  }
  function fiscalFactors(state){
    const p=state.population;if(!p?.initial||!p?.derived)return {taxFactor:1,mandatoryFactor:1};
    const now=p.derived,start=p.initial;
    return {taxFactor:round(.4+.6*now.employed/Math.max(1,start.employed),6),
      mandatoryFactor:round(.55+.45*(.25*now.children/Math.max(1,start.children)+.4*now.population/start.population+.35*now.elders/Math.max(1,start.elders)),6),
      employed:now.employed,children:now.children,elders:now.elders};
  }
  function advanceYear(state){
    const p=state.population;
    if(p.ledgers.length!==state.turnIndex)throw new Error('Population year already advanced or missing');
    const before=derive(state),opening=populationTotal(p),startFiscal=fiscalFactors(state),rows={},natural={};
    const currentShock=p.shock;const emergency=(id)=>before.municipalities[id].emergencyMortality;
    for(const config of MUNICIPALITIES){
      const id=config.id,m=p.municipalities[id],d=before.municipalities[id];
      const localShock=currentShock?.districtId===id?currentShock:null;
      const shockGap=Math.min(10,localShock?.gap||0);
      const epidemic=localShock?.key==='health'?shockGap*.045*(1-emergency(id)):0;
      const mortalityFactor=(1+(1-d.healthAccess)*.38)*(1+epidemic);
      const deaths={female:[],male:[]};
      for(const sex of ['female','male'])deaths[sex]=expectedCounts(m[sex].map((n,a)=>n*clamp(qx(a,sex)*mortalityFactor*(a>=65?1-d.elderCare*.08:1),0,.95))).map((n,a)=>Math.min(n,m[sex][a]));
      // Flood mortality is small, explicit and bounded. Never treated as a reward.
      let catastrophe=0;
      if(localShock?.key==='flood'){
        const lost=takeFloodCasualties({female:m.female.map((n,a)=>n-deaths.female[a]),male:m.male.map((n,a)=>n-deaths.male[a])},Math.round(d.population*shockGap*.000015*(1-d.floodProtection)*(1-emergency(id))));
        catastrophe=countStock(lost);for(const sex of ['female','male'])deaths[sex]=deaths[sex].map((v,a)=>v+lost[sex][a]);
      }
      const fertilityFactor=(state.scenarioId==='demographic'?.87:1)*(.82+.10*d.childcareAccess+.08*d.housingAccess+.06*d.employment+.16*d.familySupport);
      const births=Math.round(sum(m.female.map((n,a)=>(n-deaths.female[a]/2)*fertility(a)*fertilityFactor)));
      const birthSex=allocate(births,[100,105]);const neonatal=allocate(Math.round(births*.004*.5*mortalityFactor),birthSex);
      const aged={female:zeros(),male:zeros()};
      ['female','male'].forEach((sex,i)=>{
        for(let a=0;a<=100;a++)aged[sex][Math.min(100,a+1)]+=m[sex][a]-deaths[sex][a];
        aged[sex][0]=birthSex[i]-neonatal[i];
      });
      natural[id]=aged;
      rows[id]={id,opening:d.population,births,deaths:countStock(deaths)+sum(neonatal),newbornDeaths:sum(neonatal),catastropheDeaths:catastrophe,
        internalIn:0,internalOut:0,externalIn:0,externalOut:0,cohortsBefore:clone(d.cohorts),
        women1549:d.women1549,modelTFR:round(sum(Array.from({length:35},(_,a)=>fertility(a+15)))*fertilityFactor,3),
        conditions:{healthAccess:round(d.healthAccess),schoolAccess:round(d.schoolAccess),childcareAccess:round(d.childcareAccess),employment:round(d.employment)},closing:0,gap:0};
    }
    // Plan flows against frozen beginning-of-year accessibility, and transfer exact
    // age/sex stocks simultaneously. No second migration or creation en route.
    const transfers=[];const remaining=clone(natural);const incoming=Object.fromEntries(MUNICIPALITIES.map(c=>[c.id,{female:zeros(),male:zeros()}]));
    for(const source of MUNICIPALITIES){
      const s=before.municipalities[source.id];
      const weights=MUNICIPALITIES.map(dest=>dest.id===source.id?0:Math.max(0,before.municipalities[dest.id].attractiveness-s.attractiveness-.015)*(0.1+Math.max(0,before.municipalities[dest.id].housingCapacity-before.municipalities[dest.id].population)/dest.population)*Math.exp(-distance(source.id,dest.id)/60));
      const push=currentShock?.districtId===source.id&&['jobs','flood'].includes(currentShock.key)?(currentShock.gap||0)*.00035:0;
      const proposed=Math.round(s.population*Math.min(.012,sum(weights)*.12+push));
      const counts=allocate(proposed,weights);
      MUNICIPALITIES.forEach((dest,i)=>{
        if(!counts[i])return;
        const stock=takeMovers(remaining[source.id],counts[i]),n=countStock(stock);
        subtract(remaining[source.id],stock);add(incoming[dest.id],stock);
        rows[source.id].internalOut+=n;rows[dest.id].internalIn+=n;
        transfers.push({from:source.id,to:dest.id,count:n,cohorts:cohortTotals(stock)});
      });
    }
    for(const config of MUNICIPALITIES){
      const id=config.id;add(remaining[id],incoming[id]);const d=before.municipalities[id];
      const mobility=.6+.4*d.mobility;
      const vacancies=Math.max(.05,1-d.population/d.housingCapacity);
      const inflow=Math.round(d.population*(.0016+.0048*d.attractiveness)*(.65+2.5*vacancies)*mobility);
      const push=currentShock?.districtId===id&&currentShock.key==='jobs'?(currentShock.gap||0)*.0003:0;
      const outflow=Math.round(d.population*(.0025+.010*Math.max(0,.87-d.attractiveness)+push+(state.scenarioId==='demographic'?.0006:0)));
      const departures=takeMovers(remaining[id],outflow);subtract(remaining[id],departures);add(remaining[id],immigrantStock(inflow));
      const m=p.municipalities[id];m.female=remaining[id].female;m.male=remaining[id].male;
      const r=rows[id];r.externalIn=inflow;r.externalOut=countStock(departures);r.closing=total(m);r.cohortsAfter=cohortTotals(m);
      r.gap=r.closing-(r.opening+r.births-r.deaths+r.internalIn-r.internalOut+r.externalIn-r.externalOut);
      if(r.gap!==0)throw new Error(`Population identity failed for ${id}: ${r.gap}`);
    }
    const list=Object.values(rows),ledger={year:p.year,opening,births:sum(list.map(r=>r.births)),deaths:sum(list.map(r=>r.deaths)),
      internalMoves:sum(list.map(r=>r.internalIn)),internalNet:sum(list.map(r=>r.internalIn-r.internalOut)),
      externalIn:sum(list.map(r=>r.externalIn)),externalOut:sum(list.map(r=>r.externalOut)),closing:populationTotal(p),
      municipalities:rows,transfers,shock:clone(p.shock),gap:0};
    ledger.gap=ledger.closing-(ledger.opening+ledger.births-ledger.deaths+ledger.externalIn-ledger.externalOut);
    if(ledger.gap!==0||ledger.internalNet!==0)throw new Error('Regional population identity failed');
    // Derived outcomes of this year include programmes actually funded this year.
    p.derived=derive(state);ledger.after=clone(p.derived);ledger.fiscalFactorsBefore=startFiscal;ledger.fiscalFactorsAfter=fiscalFactors(state);
    p.year++;p.ledgers.push(ledger);p.lastYear=ledger;p.temporary=[];p.shock=null;
    ledger.publicEffect=0; // Engine compares across the FULL previous transition, including project launch/expiry.
    return ledger;
  }
  function refresh(state){state.population.derived=derive(state);return state.population.derived;}
  function preview(state,mission,action,plan,placement){
    if(!state.population||!plan)return null;
    const before=derive(state),extra={outputs:outputsFor(action.id),targets:targets(mission,placement),factor:plan.implementationFactor*plan.effectFactor};
    const after=derive(state,extra);const ids=Object.keys(extra.targets),main=ids.sort((a,b)=>extra.targets[b]-extra.targets[a])[0];
    const change={};for(const k of ['healthAccess','schoolAccess','childcareAccess','employment','housingAccess'])change[k]=round(after.municipalities[main][k]-before.municipalities[main][k]);
    return {municipalityId:main,targets:clone(extra.targets),outputs:clone(extra.outputs),change,lag:plan.delay+(plan.profile.lag||0),
      reason:insight(state,main),affected:ids,conditional:true};
  }
  function insight(state,id){
    const d=state.population.derived.municipalities[id],config=MUNICIPALITIES.find(m=>m.id===id);
    const choices=[['healthAccess',d.healthAccess],['schoolAccess',d.schoolAccess],['childcareAccess',d.childcareAccess],['employment',d.employment],['housingAccess',d.housingAccess]];
    choices.sort((a,b)=>a[1]-b[1]);const issue=choices[0][0],ratio=choices[0][1];
    const texts={
      healthAccess:L('До специалиста трудно добраться. Важно связать мощность клиники, кадры и маршрут – одного здания недостаточно.', 'Reaching a specialist is difficult. Clinic capacity, staff and travel must work together; a building alone is not enough.'),
      schoolAccess:L('Мест в школе не хватает. Новое жильё без учебных мест увеличивает нагрузку на семьи.', 'School places are scarce. New homes without school places put pressure on families.'),
      childcareAccess:L('Уход за ребёнком мешает части родителей вернуться к работе. Нужны доступные места или гибкая занятость.', 'Lack of childcare keeps some parents out of work. Accessible places or flexible jobs can help.'),
      employment:L('Работа есть не для всех. Новые профессии и маршруты в соседние города дают разные возможности остаться.', 'Jobs are not available to everyone. Skills and routes to neighbouring towns offer different ways to stay.'),
      housingAccess:L('Жилья становится мало. Приток жителей опережает создание доступных мест для проживания.', 'Housing is becoming scarce. Arrivals are outpacing available places to live.')
    };
    return {id,issue,severity:ratio<.6?'critical':ratio<.85?'watch':'stable',value:ratio,
      title:ratio>=.9?L('Услуги успевают за жизнью','Services keep pace with life'):L('Жители ждут перемен','Residents are waiting for change'),
      text:ratio>=.9?L('Сейчас основные услуги доступны. Следите за возрастной структурой и сроками финансирования, чтобы сохранить результат.', 'Key services are accessible for now. Watch age structure and programme funding to sustain the result.'):texts[issue],persona:config.persona};
  }
  function report(state){return {modelVersion:VERSION,synthetic:true,timeStepYears:1,ageDefinition:'completed ages 0..99, 100+ open group',baseYear:state.population.baseYear,year:state.population.year,
    initial:clone(state.population.initial),current:clone(state.population.derived),ledgers:clone(state.population.ledgers),fiscalFactors:fiscalFactors(state),
    integrity:verify(state.population),municipalities:clone(state.population.municipalities)};}
  function verify(p){
    const errors=[];
    try {
      if(!p||p.version!==VERSION||!p.initial||!Array.isArray(p.ledgers))return{ok:false,errors:['schema']};
      if(Object.keys(p.municipalities||{}).sort().join(',')!==MUNICIPALITIES.map(c=>c.id).sort().join(','))errors.push('territories');
      const integer=n=>Number.isSafeInteger(n)&&n>=0;
      for(const c of MUNICIPALITIES){const m=p.municipalities?.[c.id];if(!m){errors.push(`missing:${c.id}`);continue;}
        for(const sex of ['female','male'])if(!Array.isArray(m[sex])||m[sex].length!==101||m[sex].some(n=>!integer(n)))errors.push(`stock:${c.id}:${sex}`);
        if(!m.base||Object.values(m.base).some(n=>!Number.isFinite(n)||n<0))errors.push(`base:${c.id}`);
        if(!Number.isFinite(m.initialAdults)||m.initialAdults<=0)errors.push(`adults:${c.id}`);
      }
      let previous=p.initial.population;
      const locals=Object.fromEntries(MUNICIPALITIES.map(c=>[c.id,p.initial.access?.[c.id]?.population]));
      for(const [i,r] of p.ledgers.entries()){
        if(r.year!==p.baseYear+i)errors.push(`calendar:${i}`);
        if(r.opening!==previous)errors.push(`continuity:${r.year}`);
        for(const k of ['opening','births','deaths','closing','externalIn','externalOut','internalMoves'])if(!integer(r[k]))errors.push(`count:${r.year}:${k}`);
        if(r.closing!==r.opening+r.births-r.deaths+r.externalIn-r.externalOut||r.internalNet!==0||r.gap!==0)errors.push(`balance:${r.year}`);
        const entries=MUNICIPALITIES.map(c=>r.municipalities[c.id]);
        for(const d of entries){
          if(d.opening!==locals[d.id])errors.push(`local-continuity:${r.year}:${d.id}`);
          for(const k of ['opening','births','deaths','closing','internalIn','internalOut','externalIn','externalOut'])if(!integer(d[k]))errors.push(`local-count:${r.year}:${d.id}:${k}`);
          if(d.closing!==d.opening+d.births-d.deaths+d.externalIn-d.externalOut+d.internalIn-d.internalOut||d.gap!==0||d.cohortsAfter.length!==4||d.cohortsAfter.some(n=>!integer(n))||sum(d.cohortsAfter)!==d.closing||sum(d.cohortsBefore)!==d.opening)errors.push(`local:${r.year}:${d.id}`);
          if(d.women1549<0||d.women1549>d.opening)errors.push(`women:${r.year}:${d.id}`);
          locals[d.id]=d.closing;
        }
        for(const k of ['opening','closing','births','deaths','externalIn','externalOut'])if(sum(entries.map(d=>d[k]))!==r[k])errors.push(`aggregation:${r.year}:${k}`);
        if(sum(entries.map(d=>d.internalIn))!==r.internalMoves||sum(entries.map(d=>d.internalOut))!==r.internalMoves||sum(r.transfers.map(d=>d.count))!==r.internalMoves)errors.push(`moves:${r.year}`);
        for(const t of r.transfers)if(!integer(t.count)||sum(t.cohorts)!==t.count||t.from===t.to)errors.push(`route:${r.year}`);
        previous=r.closing;
      }
      if(!errors.some(e=>e.startsWith('stock:')||e.startsWith('missing:'))){
        if(previous!==populationTotal(p))errors.push('current-total');
        for(const c of MUNICIPALITIES)if(locals[c.id]!==total(p.municipalities[c.id]))errors.push(`current-local:${c.id}`);
        if(p.derived?.population!==previous)errors.push('derived-total');
      }
      if(p.year!==p.baseYear+p.ledgers.length)errors.push('year');
    }catch(_){errors.push('malformed-data');}
    return{ok:errors.length===0,errors,years:(p?.ledgers||[]).length};
  }
  const Population={VERSION,travelMinutes,TRANSPORT,MUNICIPALITIES,COHORTS,OUTPUTS,ROUTES,create,derive,refresh,advanceYear,registerDecision,preview,insight,report,verify,fiscalFactors,targets,outputsFor,populationTotal,cohortTotals,allocate,qx,fertility};
  root.GovernorGame=root.GovernorGame||{};root.GovernorGame.Population=Population;
  if(typeof module!=='undefined'&&module.exports)module.exports=Population;
})(typeof window!=='undefined'?window:globalThis);
