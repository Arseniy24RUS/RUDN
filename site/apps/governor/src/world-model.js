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
    {id:1,ru:'Ваш первый день',en:'Your first day',zh:'上任第一天',lead:{ru:'Пять территорий. У каждой — свои потребности. Выберите первый приоритет и наметьте следующие шаги.',en:'Five places, each with its own needs. Choose your first priority and plan the next steps.',zh:'五个地区各有需求。请选择首要任务，并规划接下来的步骤。'},question:{ru:'Какую проблему вы решите первой и по каким данным проверите результат?',en:'Which problem will you address first, and what evidence will you use to check the result?',zh:'您将先解决哪个问题，并用什么数据检验结果？'},advisor:'mira'},
    {id:2,ru:'От решений к результатам',en:'From decisions to results',zh:'从决策到成效',lead:{ru:'Проверьте, как прежние решения изменили потребности региона. Новый приоритет должен учитывать действующие обязательства.',en:'Check how earlier decisions changed the region’s needs. Your next priority must account for existing commitments.',zh:'请检查先前的决策如何改变了地区需求。下一个优先事项必须考虑已有义务。'},question:{ru:'Что сейчас даст больше пользы: новая мера, завершение начатого или продление работающей программы?',en:'What would help most now: a new measure, completing delivery, or renewing an operating programme?',zh:'现在什么最有帮助：启动新措施、完成已开始的项目，还是延续正在运行的项目？'},advisor:'viktor'},
    {id:3,ru:'Когда планы встречаются с кризисом',en:'When plans meet a crisis',zh:'当计划遇到危机',lead:{ru:'Прежние решения определяют готовность региона к новым нагрузкам. Возможные кризисы проверят резервы и устойчивость услуг.',en:'Earlier decisions shape the region’s readiness for new pressures. Crises may test reserves and the resilience of services.',zh:'先前的决策决定了地区应对新压力的准备程度。危机可能考验储备和公共服务的韧性。'},question:{ru:'Какие уязвимости остались и что вы подготовите заранее: резерв, службы или доступ к внешней помощи?',en:'Which vulnerabilities remain, and what will you prepare: reserves, services, or access to outside help?',zh:'还有哪些薄弱环节？您将提前准备储备、服务能力，还是外部援助渠道？'},advisor:'elena'},
    {id:4,ru:'Что останется после вас',en:'What remains after you',zh:'您将留下什么',lead:{ru:'Срок подходит к концу. Сопоставьте результаты, оставшиеся риски и обязательства, которые унаследует следующая команда.',en:'Your term is nearing its end. Compare results, remaining risks and the commitments the next team will inherit.',zh:'任期即将结束。请对照成果、剩余风险以及下一届团队将继承的义务。'},question:{ru:'Как изменилась повседневная жизнь жителей и что ещё нужно сохранить или исправить?',en:'How has everyday life changed, and what still needs to be sustained or improved?',zh:'居民的日常生活发生了哪些变化？还有什么需要维持或改善？'},advisor:'ilya'}
  ];
  function local(v,lang){return root.GovernorGame.I18n?root.GovernorGame.I18n.local(v,lang):v&&typeof v==='object'?(v[lang]||v.ru||v.en||''):String(v||'');}
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
    const mission=G.Agenda.mission(state);
    const num=state.completed?4:G.Agenda.persistent?.(state)?Math.min(4,Math.floor(state.turnIndex/5)+1):mission?.chapter||4;
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
