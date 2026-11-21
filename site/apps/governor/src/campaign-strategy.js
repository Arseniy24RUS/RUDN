/* Campaign goals are declared before play. Reviews use observed service outcomes,
 * never project counts or population growth. Coefficients are game rules, not
 * empirical policy estimates. Legacy saves without this module remain unchanged. */
(function(root){
  'use strict';
  const G=root.GovernorGame=root.GovernorGame||{};
  const L=(ru,en,zh)=>({ru,en,zh});
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
  const mean=values=>values.reduce((sum,v)=>sum+v,0)/Math.max(1,values.length);
  const round=v=>Math.round(v*10000)/10000;
  const COURSES=[
    {id:'services',icon:'health',title:L('Услуги рядом','Services close to home','就近公共服务'),
      description:L('Поднять доступность медицины в самой слабой территории и школьных мест в пригороде.','Improve healthcare in the least served district and school access in the suburb.','改善服务最薄弱地区的医疗可及性和郊区学位供给。'),
      metrics:['healthFloor','suburbSchool'],gains:[.16,.24]},
    {id:'opportunity',icon:'briefcase',title:L('Работа и возможности','Work and opportunity','就业与机会'),
      description:L('Расширить занятость и доступ к уходу за детьми, чтобы жители могли работать.','Improve employment and childcare access so residents can take up work.','提高就业率和托幼服务可及性，使居民能够参加工作。'),
      metrics:['employment','childcare'],gains:[.08,.16]},
    {id:'connected',icon:'map',title:L('Связанный регион','A connected region','互联地区'),
      description:L('Улучшить транспортную и цифровую доступность пяти территорий.','Improve transport and digital access across the five districts.','改善五个地区的交通和数字服务可及性。'),
      metrics:['mobility','digital'],gains:[.12,.06]},
    {id:'generations',icon:'people',title:L('Забота о поколениях','Care across generations','代际关怀'),
      description:L('Улучшить помощь и уход в Северных поселениях и доступность ухода за детьми в регионе. Рост населения не является условием успеха.','Improve healthcare and older-person care in the northern villages, and childcare across the region. Population growth is not a victory condition.','改善北部村镇的医疗和老年照护，以及全地区的托幼服务。人口增长不是成功条件。'),
      metrics:['care','childcare'],gains:[.12,.14]}
  ];
  const LABELS={
    healthFloor:L('Медицина в наименее обеспеченной территории','Healthcare in the least served district','服务最薄弱地区的医疗可及性'),
    suburbSchool:L('Доступность школы в Новом береге','School access in New Bank','新岸区学校可及性'),
    employment:L('Доля занятых в рабочей силе','Employed share of the labour force','劳动力就业比例'),
    childcare:L('Доступность ухода за детьми, среднее по территориям','Childcare access, district average','各地区托幼服务平均可及性'),
    mobility:L('Транспортная доступность, среднее по территориям','Transport access, district average','各地区交通平均可及性'),
    digital:L('Цифровая доступность, среднее по территориям','Digital access, district average','各地区数字服务平均可及性'),
    care:L('Индекс помощи и ухода в Северных поселениях','Healthcare and older-person care index in the northern villages','北部村镇医疗与老年照护指数')
  };
  function course(id){return COURSES.find(c=>c.id===id)||COURSES[0];}
  function metrics(state,derived=state.population?.derived){
    const rows=Object.values(derived?.municipalities||{});
    const north=derived?.municipalities?.north;
    return {
      healthFloor:Math.min(1,...rows.map(m=>clamp(m.healthAccess))),
      suburbSchool:clamp(derived?.municipalities?.suburb?.schoolAccess),
      employment:clamp((derived?.employed||0)/Math.max(1,derived?.labour||0)),
      childcare:mean(rows.map(m=>clamp(m.childcareAccess))),
      mobility:mean(rows.map(m=>clamp(m.mobility))),
      digital:mean(rows.map(m=>clamp(m.digitalAccess))),
      care:north?clamp(.8*north.healthAccess+.2*north.elderCare):0
    };
  }
  function create(state,id='services'){
    return {version:1,id:course(id).id,baseline:metrics(state),baseCapacity:state.finance.adminCapacity,reviews:[]};
  }
  function goals(state,year){
    const config=state.campaignStrategy;if(!config)return [];
    const c=course(config.id),now=metrics(state),fraction=clamp(year/20);
    return c.metrics.map((key,i)=>{
      const initial=config.baseline[key],target=Math.min(.98,initial+c.gains[i]*fraction);
      // Already very high starting values are a maintenance task, not an
      // impossible demand to exceed 100% access.
      const actualTarget=Math.max(initial,target),value=now[key];
      const progress=actualTarget-initial>.005?clamp((value-initial)/(actualTarget-initial)):clamp(value/Math.max(.01,actualTarget));
      return {key,label:LABELS[key],initial,value,target:actualTarget,progress,met:value+.0005>=actualTarget};
    });
  }
  function snapshot(state,year){
    if(!state.campaignStrategy)return null;
    const elapsed=state.history?.length||0;
    const due=year||Math.min(20,(Math.floor(Math.min(19,elapsed)/5)+1)*5);
    const goalsNow=goals(state,due),forecast=G.Finance?.projectObligations?.(state,3);
    const publicSupport=Number(state.stats.support)||0;
    const debtRatio=state.finance.debt/Math.max(1,state.finance.debtLimit);
    const rows=forecast?.rows||[];
    const sustainable=debtRatio<=.90&&(!rows.length||rows.every(row=>row.cash+state.finance.reserve>=-.01));
    return {course:course(state.campaignStrategy.id),due,elapsed,goals:goalsNow,
      progress:mean(goalsNow.map(g=>g.progress)),publicSupport,debtRatio,sustainable,
      supportTarget:40,lastReview:state.campaignStrategy.reviews.at(-1)||null};
  }
  function review(state,closedYear){
    const c=state.campaignStrategy;
    if(!c||![5,10,15,20].includes(closedYear)||c.reviews.some(r=>r.year===closedYear))return null;
    const s=snapshot(state,closedYear),met=s.goals.filter(g=>g.met).length;
    const healthy=s.publicSupport>=s.supportTarget&&s.sustainable;
    const status=met===2&&healthy?'secured':s.publicSupport<25||(!met&&s.progress<.15)?'at-risk':'conditional';
    const capacityDelta=status==='secured'?1:status==='at-risk'?-1:0;
    const r={year:closedYear,courseId:c.id,status,progress:round(s.progress),support:round(s.publicSupport),
      sustainable:s.sustainable,capacityDelta,goals:s.goals.map(g=>({...g,value:round(g.value),target:round(g.target),progress:round(g.progress)}))};
    c.reviews.push(r);
    // Replace the previous mandate effect; never stack a bonus by reopening a
    // screen or replaying the review after an interrupted save.
    if(closedYear<20)state.finance.adminCapacity=Math.max(1,c.baseCapacity+capacityDelta);
    return r;
  }
  function check(state){
    const c=state.campaignStrategy;if(c===undefined)return [];
    if(!c||c.version!==1||!COURSES.some(x=>x.id===c.id)||!Number.isFinite(c.baseCapacity)||c.baseCapacity<1||c.baseCapacity>100)return ['campaign-strategy'];
    if(Object.keys(LABELS).some(k=>!Number.isFinite(c.baseline?.[k])||c.baseline[k]<0||c.baseline[k]>1))return ['campaign-baseline'];
    const closedYears=state.finance.ledgers.length;
    if(!Array.isArray(c.reviews)||c.reviews.length!==Math.floor(closedYears/5)||new Set(c.reviews.map(r=>r.year)).size!==c.reviews.length||c.reviews.some(r=>![5,10,15,20].includes(r.year)||r.year>closedYears||!['secured','conditional','at-risk'].includes(r.status)||![-1,0,1].includes(r.capacityDelta)))return ['campaign-reviews'];
    const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
    const selected=course(c.id);
    for(const [i,r]of c.reviews.entries()){
      if(r.year!==(i+1)*5||r.courseId!==c.id||!finite(r.progress,0,1)||!finite(r.support,0,100)||typeof r.sustainable!=='boolean'||!Array.isArray(r.goals)||r.goals.length!==2)return ['campaign-review-evidence'];
      const record=state.history[r.year-1];
      if(!record?.population?.after?.municipalities||!finite(record.after?.support,0,100))return ['campaign-review-history'];
      // Use the preserved, unrounded outcome from the reviewed year. The
      // current population may already be many years beyond this review.
      const reviewedState={...state,population:{...state.population,derived:record.population.after}};
      const expectedGoals=goals(reviewedState,r.year);
      for(const [j,g]of r.goals.entries()){
        const expected=expectedGoals[j];
        if(!g||g.key!==selected.metrics[j]||g.initial!==expected.initial||g.target!==round(expected.target)||g.value!==round(expected.value)||g.progress!==round(expected.progress)||g.met!==expected.met||!g.label||['ru','en','zh'].some(l=>typeof g.label[l]!=='string'||g.label[l].length>250))return ['campaign-review-goals'];
      }
      const progress=mean(expectedGoals.map(g=>g.progress));
      const met=expectedGoals.filter(g=>g.met).length;
      const support=record.after.support;
      const healthy=support>=40&&r.sustainable;
      const status=met===2&&healthy?'secured':support<25||(!met&&progress<.15)?'at-risk':'conditional';
      const capacityDelta=status==='secured'?1:status==='at-risk'?-1:0;
      if(r.progress!==round(progress)||r.support!==round(support)||r.status!==status||r.capacityDelta!==capacityDelta)return ['campaign-review-result'];
    }
    const previous=c.reviews.filter(r=>r.year<20).at(-1);
    if(state.finance.adminCapacity!==Math.max(1,c.baseCapacity+(previous?.capacityDelta||0)))return ['campaign-review-capacity'];
    return [];
  }
  G.CampaignStrategy={VERSION:1,COURSES,LABELS,course,metrics,create,goals,snapshot,review,check};
  if(typeof module!=='undefined')module.exports=G.CampaignStrategy;
})(typeof window!=='undefined'?window:globalThis);
