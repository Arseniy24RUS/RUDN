/* Stage 6 presentation model. Read-only projection of the simulation.
 * It has no clocks, random game events, financial mutations or score effects. */
(function (root) {
  'use strict';
  const G = root.GovernorGame = root.GovernorGame || {};
  const PLACES = [
    { id:'north', x:-12, z:-10, name:{ru:'Северные районы',en:'Northern districts'}, icon:'health', service:'healthAccess' },
    { id:'industrial', x:-13, z:7, name:{ru:'Промышленный пояс',en:'Industrial belt'}, icon:'factory', service:'employment' },
    { id:'river', x:11, z:-6, name:{ru:'Речная долина',en:'River valley'}, icon:'flood', service:'floodProtection' },
    { id:'capital', x:0, z:9, name:{ru:'Областной центр',en:'Regional capital'}, icon:'digital', service:'digitalAccess' },
    { id:'suburb', x:14, z:8, name:{ru:'Новый берег',en:'Novy Bereg'}, icon:'school', service:'schoolAccess' }
  ];
  const STATUS = {
    delivery:{ru:'В реализации',en:'In delivery'},active:{ru:'Работает',en:'Operating'},
    completed:{ru:'Финансирование завершено',en:'Funding ended'},
    approved:{ru:'Решение исполнено',en:'Decision enacted'}
  };
  const CHAPTERS = [
    {id:1,ru:'Ваш первый день',en:'Your first day',lead:{ru:'Пять территорий. У каждой – своя жизнь. Сегодня вы выбираете, с чего начнётся ваш срок.',en:'Five places, five different lives. Today you choose where your term begins.'},question:{ru:'Начните с севера: жители ждут медицинской помощи. Как приблизить её, не исчерпав бюджет?',en:'Start in the north: residents are waiting for care. How do you bring it closer without exhausting the budget?'},advisor:'mira'},
    {id:2,ru:'Обещания становятся стройками',en:'Promises become projects',lead:{ru:'Принять решение было только началом. Теперь нужны люди, исполнители и согласованная работа территорий.',en:'Choosing a policy was only a beginning. Now it needs people, contractors and cooperation between places.'},question:{ru:'Что важнее сейчас: запустить новый проект или довести начатое до работающей услуги?',en:'What matters more now: starting another project, or turning an existing one into a working service?'},advisor:'viktor'},
    {id:3,ru:'Когда планы встречаются с кризисом',en:'When plans meet a crisis',lead:{ru:'У региона есть новая инфраструктура и прежние уязвимости. Следующие годы проверят, что действительно работает.',en:'The region has new infrastructure and old vulnerabilities. The coming years will test what actually works.'},question:{ru:'Не каждую потерю можно предотвратить. На что вы будете опираться: резерв, подготовленные службы или внешнюю помощь?',en:'Not every loss can be prevented. Will you rely on reserves, prepared services, or outside help?'},advisor:'elena'},
    {id:4,ru:'Что останется после вас',en:'What remains after you',lead:{ru:'Кризисы прошли, но их последствия остались. Последняя глава – о восстановлении, работающих услугах и честном отчёте.',en:'The crises have passed, but their consequences remain. The final chapter is about recovery, working services and an honest account.'},question:{ru:'Жители запомнят не число проектов, а то, как изменилась повседневная жизнь.',en:'Residents will remember changes to everyday life, not the number of projects.'},advisor:'ilya'}
  ];
  function local(v,lang){return v&&typeof v==='object'?(v[lang]||v.ru||v.en||''):String(v||'');}
  function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function kind(project) {
    const a=project.actionId||'';
    if(/train|staff|skills|talent|worker-income|flexible-employers/.test(a))return 'training';
    if(/bus|mobile|routes|commuter|transport/.test(a))return 'transport';
    if(/school|shift|nursery|childmind|generations/.test(a))return 'school';
    if(/clinic|hospital|medical-hub|primary-care/.test(a))return 'clinic';
    if(/health|staff|care|medicine|screen|purchase|network/.test(a)&&project.districtId==='north')return 'care';
    if(/nature|buffer|moratorium|outreach|insurance/.test(a))return 'nature';
    if(/defense|embankment|rebuild|relocation|infrastructure/.test(a)&&project.districtId==='river')return 'barrier';
    if(/housing|neighbourhood/.test(a))return 'housing';
    if(project.districtId==='capital')return 'digital';
    if(project.districtId==='industrial')return /green|clean/.test(a)?'greenIndustry':'industry';
    return 'service';
  }
  // One representative site per programme, not a literal count of all facilities.
  const SITES=[[-2.6,0],[0,0],[2.6,0],[-2.6,2.7],[0,2.7],[2.6,2.7]];
  function projectDistrict(p){
    const keys=Object.entries(p.people?.targets||{}).filter(([k,v])=>PLACES.some(d=>d.id===k)&&Number.isFinite(v));
    keys.sort((a,b)=>b[1]-a[1]);return keys[0]?.[0]||p.districtId;
  }
  function snapshot(state, baseline=false){
    if(!state||!state.finance||!state.population)throw new Error('World needs an existing campaign');
    const history=baseline?[]:state.history||[],portfolio=baseline?[]:state.finance.portfolio||[];
    const totals=state.population.derived;
    const places=PLACES.map(p=>{
      const d=totals.municipalities[p.id];
      const initial=state.population.initial.access[p.id]||{};
      const raw=baseline?initial[p.service]:d[p.service];
      const value=Number.isFinite(raw)?Math.max(0,Math.min(1,raw)):null;
      return {...p,population:baseline?null:d.population,serviceValue:value,
        condition:value===null?'unknown':value<.6?'strained':value<.85?'watch':'stable',
        projects:portfolio.filter(q=>projectDistrict(q)===p.id).length};
    });
    const projects=portfolio.map(p=>{
      const target=projectDistrict(p);
      const place=PLACES.find(q=>q.id===target)||PLACES[0];
      const index=portfolio.filter(q=>projectDistrict(q)===target).findIndex(q=>q.id===p.id);
      const offset=SITES[index%SITES.length];
      return {id:p.id,actionId:p.actionId,districtId:target,policyDistrictId:p.districtId,title:p.title,
        kind:kind(p),status:p.status,delivery:p.deliveryOutcome,
        x:place.x+offset[0],z:place.z+offset[1]-1.3,
        started:p.activatedTurn,created:p.createdTurn,startsIn:p.startsIn,
        yearsRemaining:p.yearsRemaining,annualOpex:p.annualOpex,
        placement:p.placement?.title||place.name,capacity:p.kind==='capital',
        structural:G.IllustratedAssets?G.IllustratedAssets.structural(p):p.kind==='capital',
        visualSrc:G.IllustratedAssets?G.IllustratedAssets.image(p,{thumb:true}).src:'assets/world/'+kind(p)+'.webp',
        visual:G.IllustratedAssets?G.IllustratedAssets.image(p,{thumb:true}):null,
        partial:p.deliveryOutcome==='partial',late:p.deliveryOutcome==='delayed'};
    });
    const mission=G.Agenda.mission(state);
    const hazard=!baseline&&!state.completed&&!state.awaitingContinue&&mission?.threadPhase==='crisis'
      ? (mission.id==='major-flood'?'flood':mission.id==='cyberattack'?'cyber':mission.id==='flu-wave'?'health':null):null;
    return {year:baseline?state.population.baseYear:state.population.baseYear+Math.min(20,state.history.length),
      turn:baseline?0:state.turnIndex,chapter:baseline?1:mission?.chapter||4,baseline,
      population:baseline?state.population.initial.population:totals.population,
      missionId:mission?.id,focus:mission?.districtId||'north',hazard,
      flows:baseline?[]:(state.population.lastYear?.transfers||[]).slice().sort((a,b)=>b.count-a.count).slice(0,4),
      places,projects,decisions:history.length,signature:JSON.stringify([baseline,state.turnIndex,state.awaitingContinue,state.completed,projects.map(p=>[p.id,p.status,p.startsIn,p.yearsRemaining,p.delivery]),places.map(p=>p.serviceValue)])};
  }
  function updates(state){
    const base=state.population.baseYear;
    return (state.finance.lastLifecycleEvents||[]).filter(e=>['activated','completed'].includes(e.type)).map(e=>{
      const p=state.finance.portfolio.find(p=>p.id===e.projectId||p.id===e.id||local(p.title,'ru')===local(e.title,'ru'));
      return {id:p?.id||e.projectId||String(e.type)+local(e.title,'ru'),type:e.type,title:e.title||p?.title,districtId:p?.districtId||'north',year:base+state.turnIndex};
    });
  }
  function chapterCard(state){
    const mission=G.Agenda.mission(state),num=mission?.chapter||4;
    const record=CHAPTERS[num-1];
    const lastFive=(state.history||[]).filter(r=>r.chapter===num-1);
    const agenda=G.Agenda;
    const question=num===1&&agenda.mode(state)==='agenda'?{ru:'Школа, врач, работа, защита долины или госуслуги? Выберите первый вопрос. Другие останутся в повестке, но год всё равно пройдёт.',en:'School, care, jobs, valley protection or public services? Choose the first issue. The others remain on the agenda, but a year will still pass.'}:record.question;
    return {...record,question,year:state.population.baseYear+state.turnIndex,
      operating:state.finance.portfolio.filter(p=>p.status==='active').length,
      building:state.finance.portfolio.filter(p=>p.status==='delivery').length,
      previousDecisions:lastFive.length,previousTitles:lastFive.slice(-2).map(r=>r.project?.title||G.Agenda.byId(r.missionId)?.title)};
  }
  function initialiseJourney(state, saved){
    const id=state.sessionId+':'+state.startedAt;
    const valid=saved&&saved.campaignId===id;
    return {version:1,campaignId:id,seenChapters:valid&&Array.isArray(saved.seenChapters)?saved.seenChapters.filter(x=>Number.isInteger(x)&&x>=1&&x<=4):[],visited:valid&&Array.isArray(saved.visited)?saved.visited.filter(id=>PLACES.some(p=>p.id===id)):[],skipChapters:!!saved?.skipChapters};
  }
  G.WorldModel={PLACES,STATUS,CHAPTERS,local,hash,kind,projectDistrict,snapshot,updates,chapterCard,initialiseJourney};
  if(typeof module!=='undefined'&&module.exports)module.exports=G.WorldModel;
})(typeof window!=='undefined'?window:globalThis);
