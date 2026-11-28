/* The four-term Governor campaign. All indicators and coefficients describe the fictional game region. */
(function (root) {
  'use strict';
  const G=root.GovernorGame;
  const L=(ru,en,zh)=>({ru,en,zh});
  const FIRST_YEAR=2026;
  const YEARS_PER_TERM=5;
  const VERSION='governor-v4.0';
  const BALANCE_VERSION='governor-balance-v1';
  const balanced=state=>state?.balanceVersion===BALANCE_VERSION;
  const FULL_GRADE=Object.freeze({targets:4,accessGains:2,accessPoints:5,promiseShare:.75,debtShare:.40});
  const {phases,sites}=G.V4Catalog;
  const measures=new Map(phases.flat().map(row=>[row.id,row]));
  const locations=new Map(sites.map(row=>[row.id,row]));
  const sum=values=>values.reduce((total,value)=>total+value,0);
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const ratio=value=>clamp(value,0,1);
  const round=(value,digits=2)=>{
    const scale=10**digits;
    return Math.round(value*scale)/scale;
  };

  function metric(id,labels,unit,min,max,weight,description,inverse=false) {
    return {id,labels,unit,min,max,weight,description,inverse};
  }

  const METRICS=[
    metric('trust',L('Доверие к власти','Trust in government','对政府的信任'),'points',0,100,1.2,
      L('Меняется по итогам работы служб, выполнения программ и решения ситуаций.','Reflects how services, programmes and event responses work.','反映公共服务、项目和事件应对的效果。')),
    metric('population',L('Численность населения','Population','人口'),'index',70,135,1.1,
      L('Число жителей по демографической модели. На старте индекс равен 100.','Resident count from the population model. The starting index is 100.','依据人口模型统计居民人数。起始指数为100。')),
    metric('tfr',L('Суммарный коэффициент рождаемости','Total fertility rate','总和生育率'),'children',.6,3,1.1,
      L('Расчётное число детей на одну женщину по возрастным коэффициентам текущего года.','Estimated children per woman from this year’s age-specific rates.','依据本年度分年龄生育率推算的每名妇女平均生育子女数。')),
    metric('life',L('Ожидаемая продолжительность жизни','Life expectancy','预期寿命'),'years',60,90,1.1,
      L('Получается из возрастного риска смертности и доступности медицинской помощи.','Calculated from age-specific mortality risks and access to healthcare.','依据分年龄死亡风险与医疗可及性计算。')),
    metric('poverty',L('Уровень бедности','Poverty rate','贫困率'),'percent',0,35,1.1,
      L('Условная доля жителей за чертой бедности. Реагирует на занятость, доходы и адресную помощь.','Simulated share of residents below the poverty line. It responds to jobs, incomes and targeted assistance.','模拟贫困线以下居民比例，随就业、收入和定向援助变化。'),true),
    metric('sport',L('Удовлетворённость спортом','Satisfaction with sport','体育服务满意度'),'points',0,100,.8,
      L('Растёт, когда программы расширяют доступ к занятиям и улучшают повседневные маршруты.','Rises as programmes widen participation and improve everyday access.','项目扩大体育参与机会、改善日常通达性时上升。')),
    metric('education',L('Образование и кадры','Education and skills','教育和技能'),'points',0,100,1,
      L('Учитывает доступ к обучению, подготовку преподавателей и развитие навыков.','Combines access to learning with teacher training and skills programmes.','综合衡量教育可及性、师资培训和技能发展。')),
    metric('income',L('Реальные доходы населения','Real household income','居民实际收入'),'index',65,155,1.1,
      L('Условный индекс дохода с поправкой на занятость, навыки, помощь и налоговую нагрузку.','A simulated income index responding to employment, skills, support and tax burden.','模拟收入指数，受就业、技能、援助和税负影响。')),
    metric('investment',L('Инвестиционная активность','Investment activity','投资活跃度'),'index',65,164,.9,
      L('Условный индекс привлечения вложений в экономику. Его меняют деловые программы и условия работы предприятий.','A simulated index of investment in the economy. Business programmes and operating conditions affect it.','模拟经济投资活跃度，受企业项目与经营条件影响。')),
    metric('sme_income',L('Доход на одного работника МСП','Income per small-business worker','中小企业人均从业收入'),'index',65,164,.9,
      L('Условный индекс отдачи на работника малого бизнеса. Учитывает доступ к заказам, кадрам и рынкам.','A simulated small-business earnings index. It reflects access to contracts, workers and markets.','模拟中小企业从业者的收入指数，反映获取订单、人才和市场的条件。')),
    metric('environment',L('Качество окружающей среды','Environmental quality','环境质量'),'points',0,100,.9,
      L('Реагирует на загрязнение, состояние сетей, защиту от паводков и экологические программы.','Responds to pollution, utilities, flood protection and environmental programmes.','受污染、公用设施、防洪和环保项目影响。')),
    metric('digital',L('Цифровая зрелость управления','Digital maturity of government','政府数字化成熟度'),'points',0,100,1,
      L('Учитывает доступность цифровых услуг, их надёжность и развитие компетенций.','Reflects service access, reliability and digital skills.','反映数字服务可及性、可靠性及数字技能。'))
  ];

  const INITIAL={
    trust:50,poverty:15,sport:40,education:65,income:100,investment:100,sme_income:100,environment:55,digital:40
  };
  const TARGETS={
    trust:[54,58,62,67],
    population:[99.75,99.45,98.65,97.1],
    tfr:[1.51,1.52,1.52,1.52],
    life:[78.08,78.14,78.15,78.17],
    poverty:[13.7,12,10.7,9],
    sport:[43,46,49,52],
    education:[68,72,77,83],
    income:[104,109,115,121],
    investment:[103.5,108,113,118],
    sme_income:[103,107.5,113.5,120],
    environment:[58,62,67,72],
    digital:[44,49,55,61]
  };
  const RETENTION_TOLERANCE={population:1};
  const GROUP_RESPONSE={
    families:{trust:.15,poverty:-.16,education:.11},
    seniors:{life:.43,trust:.13},
    business:{investment:.20,sme_income:.21},
    youth:{education:.14,sport:.13,income:.09},
    publicStaff:{trust:.14,digital:.10,education:.09},
    activists:{environment:.25,sport:.10}
  };

  function term(number,weight,satisfactionTarget,priority,labels,description) {
    const index=number-1;
    const startYear=FIRST_YEAR+index*YEARS_PER_TERM;
    return {number,startYear,endYear:startYear+YEARS_PER_TERM-1,weight,satisfactionTarget,priority,labels,description,
      targets:Object.fromEntries(METRICS.map(({id})=>[id,TARGETS[id][index]]))};
  }

  const CHAPTERS=[
    term(1,.10,60,['trust','population','life','education'],L('Восстановить доступ','Restore access','恢复服务可及性'),
      L('Сделайте базовые услуги доступнее. Срочные меры дают результат раньше, крупные проекты нужно успеть запустить.','Improve access to basic services. Quick measures deliver sooner. Larger projects take time to open.','改善基本服务的可及性。短期措施见效较早，大型项目需要预留启用时间。')),
    term(2,.20,62,['education','income','sme_income','digital'],L('Связать районы','Connect the districts','联通各地区'),
      L('Свяжите службы и предприятия между районами. Оцените, сколько будет стоить содержание созданной сети.','Connect services and businesses across districts. Check what the network will cost to keep running.','跨区连接公共服务和企业，并估算维持网络运行的成本。')),
    term(3,.30,64,['poverty','investment','sme_income','environment'],L('Обновить экономику и услуги','Modernise the economy and services','更新经济与公共服务'),
      L('Сделайте долгосрочный выбор. Рабочие места, здоровье, доступ и экология требуют разных вложений.','Make long-term choices. Jobs, health, access and the environment need different investments.','做出长期选择。就业、健康、可及性和环境需要不同的投资。')),
    term(4,.40,66,['population','life','environment','digital'],L('Оставить работающие проекты','Leave lasting services','留下可持续的服务'),
      L('Сохраните доступ к услугам и проверьте долги, сроки открытия и выплаты после окончания кампании.','Keep services accessible. Check debt, opening dates and commitments beyond the campaign.','保持服务可及性，并核对任期结束后仍存在的债务、启用日期和支付义务。'))
  ];

  function chapter(year) {
    const index=clamp(Math.floor((year-FIRST_YEAR)/YEARS_PER_TERM),0,CHAPTERS.length-1);
    return CHAPTERS[index];
  }

  function averageBy(rows,value,weight) {
    const total=sum(rows.map(weight));
    return total ? sum(rows.map(row=>value(row)*weight(row)))/total : 0;
  }

  function observed(state) {
    return Object.values(state.population?.derived?.municipalities??{});
  }

  function fertility(state,rows) {
    const ledger=state.population?.lastYear;
    if (ledger) return averageBy(Object.values(ledger.municipalities),row=>row.modelTFR,row=>row.women1549);
    const schedule=sum(Array.from({length:35},(_,index)=>G.Population.fertility(index+15)));
    return averageBy(rows,row=>schedule*(.82+.10*row.childcareAccess+.08*row.housingAccess+
      .06*row.employment+.16*row.familySupport),row=>row.women1549);
  }

  // A period life table uses the same base risks as the population model. Temporary
  // flood casualty counts are real population losses, separate from baseline risk.
  function lifespan(row,shock) {
    const epidemic=shock?.districtId===row.id&&shock.key==='health'?
      Math.min(10,shock.gap||0)*.045*(1-row.emergencyMortality):0;
    const mortality=(1+(1-row.healthAccess)*.38)*(1+epidemic);
    function expected(sex) {
      let survivors=1,years=0;
      for (let age=0;age<100;age++) {
        const risk=clamp(G.Population.qx(age,sex)*mortality*(age>=65?1-row.elderCare*.08:1),0,.95);
        const remaining=survivors*(1-risk);
        years+=(survivors+remaining)/2;
        survivors=remaining;
      }
      const tailRisk=G.Population.qx(100,sex)*mortality*(1-row.elderCare*.08);
      return years+survivors/Math.max(.01,tailRisk);
    }
    return (100*expected('female')+105*expected('male'))/205;
  }

  function normalise(values) {
    return Object.fromEntries(METRICS.map(({id,min,max})=>[id,round(clamp(values[id],min,max))]));
  }

  function initial(state) {
    const rows=observed(state);
    return normalise({...INITIAL,population:100,tfr:rows.length?fertility(state,rows):1.44,
      life:rows.length?averageBy(rows,row=>lifespan(row),row=>row.population):76});
  }

  function serviceDelta(prev,next,key) {
    return (next.stats.kpis[key]?.value??0)-(prev.stats.kpis[key]?.value??0);
  }

  function diminishing(positive,negative) {
    return positive/(1+.16*positive)-negative/(1+.16*negative);
  }

  function fundedEffects(projects,year) {
    const effects=Object.fromEntries(METRICS.map(({id})=>[id,{positive:0,negative:0}]));
    for (const project of projects) {
      if (G.V3Rules.projectPhase(project,year)!=='open') continue;
      const entries=project.kpiEffects??measures.get(project.measureId)?.kpiEffects??{};
      for (const [id,coefficient] of Object.entries(entries)) {
        const amount=coefficient*(project.outputFactor??1);
        if (amount>=0) effects[id].positive+=amount;
        else effects[id].negative-=amount;
      }
    }
    return Object.fromEntries(Object.entries(effects).map(([id,{positive,negative}])=>[id,diminishing(positive,negative)]));
  }

  function satisfactionEffects(projects,year) {
    const effects=fundedEffects(projects,year);
    return Object.fromEntries(Object.entries(GROUP_RESPONSE).map(([group,weights])=>[
      group,clamp(sum(Object.entries(weights).map(([id,weight])=>weight*effects[id])),-1.1,1.1)
    ]));
  }

  function eventKpiEffects(eventPlan,stats) {
    const population=Math.max(1,stats.population);
    const effects={};
    for(const outcome of eventPlan?.outcomes??[]){
      const impact=outcome.kpiEffect;
      if(!impact)continue;
      // Use the actual district, with diminishing returns from its size so
      // that comparable improvements in sparsely settled districts count.
      const weight=Math.sqrt(ratio((stats.districts[outcome.district]?.population??0)/population));
      effects[impact.id]=(effects[impact.id]??0)+impact.localChange*weight;
    }
    return effects;
  }

  function advance(prev,next,{taxIndex=100,eventPlan=null}={}) {
    const before=prev.campaignKpis??initial(prev);
    const rows=observed(next),earlierRows=observed(prev);
    const effects=fundedEffects(next.projects,next.stats.year);
    const eventEffects=G.V4Campaign.balanced?.(prev)?eventKpiEffects(eventPlan,next.stats):{};
    const tax=(taxIndex-100)/12;
    const changes={
      jobs:serviceDelta(prev,next,'employment'),
      school:serviceDelta(prev,next,'school'),
      health:serviceDelta(prev,next,'health'),
      flood:serviceDelta(prev,next,'flood'),
      digital:serviceDelta(prev,next,'digital'),
      mobility:100*(averageBy(rows,row=>row.mobility,row=>row.population)-
        averageBy(earlierRows,row=>row.mobility,row=>row.population))
    };
    const realPopulation=next.population.derived.population;
    const localFeedback=sum(Object.entries(eventPlan?.supportByDistrict??{}).map(([id,value])=>
      value/100*(next.stats.districts[id]?.population??0)/Math.max(1,realPopulation)));
    const yearStep=(id,extra=0,drift=.022,coefficient=1)=>
      before[id]+(INITIAL[id]-before[id])*drift+effects[id]*coefficient+extra;
    // Economic series are synthetic indices. Public fund redemptions go to the
    // fiscal ledger and do not count as productive investment a second time.
    return normalise({
      trust:yearStep('trust',.17*changes.health+.14*changes.school+.1*changes.digital+localFeedback*.35-.23*tax,.03,.66),
      population:100*realPopulation/next.population.initial.population,
      tfr:fertility(next,rows),
      life:averageBy(rows,row=>lifespan(row,next.population.lastYear?.shock),row=>row.population)+effects.life*.20+(eventEffects.life??0),
      poverty:yearStep('poverty',-.16*changes.jobs+.19*tax-.11*effects.income,.075,.65),
      sport:yearStep('sport',.27*changes.mobility+.07*changes.health+(eventEffects.sport??0)),
      education:yearStep('education',.20*changes.school+.10*changes.digital+(eventEffects.education??0),.04,.78),
      income:yearStep('income',.39*changes.jobs+.085*changes.school-.35*tax),
      investment:yearStep('investment',.19*changes.jobs+.12*changes.digital-.37*tax),
      sme_income:yearStep('sme_income',.24*changes.jobs+.15*changes.mobility+.10*changes.digital-.35*tax+(eventEffects.sme_income??0)),
      environment:yearStep('environment',.17*changes.flood+(eventEffects.environment??0)),
      digital:yearStep('digital',.24*changes.digital+(eventEffects.digital??0))
    });
  }

  function achievement(actual,baseline,target,inverse=false,retentionTolerance=0) {
    const direction=inverse?-1:1;
    if (direction*(actual-target)>=0) return 1;
    const span=direction*(target-baseline);
    if (span>0) return ratio(direction*(actual-baseline)/span);
    return retentionTolerance?ratio(1+direction*(actual-target)/retentionTolerance):0;
  }

  function status(state,number=chapter(state.year).number) {
    const term={...CHAPTERS[number-1],...state.campaignTerms?.find(row=>row.number===number)};
    const history=state.history??[];
    const rows=history.filter(row=>row.year>=term.startYear&&row.year<=term.endYear);
    const last=rows.at(-1);
    const starting=state.initialCampaignKpis??initial({...state,population:{...state.population,lastYear:null}});
    const phaseStart=number===1?starting:history.find(row=>row.year===term.startYear-1)?.campaignKpis;
    const values=last?.campaignKpis??(state.year>=term.startYear?state.campaignKpis:phaseStart);
    const entries=METRICS.map(item=>{
      const {id,inverse}=item;
      const target=term.targets[id],actual=values?.[id]??null,baseline=starting[id];
      const retentionTolerance=RETENTION_TOLERANCE[id]??0;
      const progress=actual==null?null:achievement(actual,baseline,target,inverse,retentionTolerance);
      return {...item,start:phaseStart?.[id]??null,baseline,target,actual,
        reference:last?.referenceCampaignKpis?.[id]??null,
        delta:actual!=null&&phaseStart?round(actual-phaseStart[id]):null,
        progress:progress==null?null:round(100*progress),
        met:progress===1};
    });
    const achieved=entries.some(entry=>entry.progress!=null);
    const kpi=achieved?averageBy(entries.filter(entry=>entry.progress!=null),entry=>entry.progress/100,entry=>entry.weight):0;
    const supportAverage=rows.length?sum(rows.map(row=>row.stats.support))/rows.length:null;
    const startingSupport=state.initialStats?.support??58;
    const satisfaction=supportAverage==null?0:achievement(supportAverage,startingSupport,term.satisfactionTarget);
    return {chapter:term,entries,kpi:round(kpi*100),satisfaction:round(satisfaction*100),supportAverage:supportAverage==null?null:round(supportAverage),
      winning:kpi>=satisfaction?'kpi':'satisfaction',closed:rows.length===YEARS_PER_TERM,yearsClosed:rows.length};
  }

  function sustainedServices(row) {
    const projects=(row?.projects??[]).filter(project=>project.status==='open'&&project.paidYears?.includes(row.year));
    const events=(row?.stats?.eventOutcomes??[]).filter(event=>event.optionId!=='base'&&event.active&&
      (event.actualUnits>0||event.kind==='stock'&&event.cumulativeUnits>0));
    return new Set([...projects.map(project=>'project:'+project.id),...events.map(event=>'event:'+event.eventId)]);
  }

  function accessGains(row) {
    const services=['school','health','flood','digital'];
    return Object.entries(row?.stats?.districts??{}).flatMap(([district,data])=>services.filter(id=>
      Number.isFinite(data.kpis?.[id]?.value)&&Number.isFinite(row.reference?.districts?.[district]?.kpis?.[id]?.value)&&
      data.kpis[id].value-row.reference.districts[district].kpis[id].value>=FULL_GRADE.accessPoints
    ).map(id=>district+':'+id));
  }

  function fullGradeConditions(state,lastTerm) {
    const last=state.history.at(-1), previous=state.history.at(-2);
    const precedingServices=sustainedServices(previous);
    const precedingAccess=new Set(accessGains(previous));
    const maintained=[...sustainedServices(last)].filter(id=>precedingServices.has(id)).length;
    const gained=accessGains(last).filter(id=>precedingAccess.has(id)).length;
    const targets=lastTerm.entries.filter(row=>row.id!=='trust'&&row.met).length;
    const due=(state.promises??[]).filter(row=>row.dueYear<=last?.year);
    const kept=due.filter(row=>row.status==='kept').length;
    const forecast=last?.finance?.futureRows??[];
    const successorDebt=sum((last?.finance?.debtSchedule??[]).map(row=>row.total));
    const liquid=state.finance.cash+state.finance.reserve;
    const netLiquid=liquid-successorDebt;
    const ordinaryIncome=forecast[0]?.projectedIncome??0;
    const debtLimit=Math.floor(ordinaryIncome*FULL_GRADE.debtShare);
    const covered=forecast.length>=3&&forecast.slice(0,3).every(row=>row.cash+state.finance.reserve>=0);
    const checks={
      performance:targets>=FULL_GRADE.targets||gained>=FULL_GRADE.accessGains,
      services:maintained>0,
      promises:kept>=Math.ceil(due.length*FULL_GRADE.promiseShare),
      finance:covered&&netLiquid>=0&&successorDebt<=debtLimit
    };
    return {checks,targets,gained,maintained,kept,due:due.length,successorDebt,netLiquid,debtLimit,covered,
      ceiling:!state.handover&&Object.values(checks).every(Boolean)?5:4};
  }

  function score(state) {
    const results=CHAPTERS.map(({number})=>status(state,number));
    const completionRatio=sum(results.map(row=>row.yearsClosed))/(YEARS_PER_TERM*CHAPTERS.length);
    const weighted=(row,path)=>row[path]/100*row.yearsClosed/YEARS_PER_TERM*row.chapter.weight*5;
    const paths=Object.fromEntries(['kpi','satisfaction'].map(path=>[path,sum(results.map(row=>weighted(row,path)))]));
    const winning=paths.kpi>=paths.satisfaction?'kpi':'satisfaction';
    const raw=results.map(row=>weighted(row,winning)*100);
    const qualification=balanced(state)&&state.completed?fullGradeConditions(state,results.at(-1)):null;
    const rawTotal=sum(raw);
    const ceiling=qualification?.ceiling*100;
    const scaled=qualification&&rawTotal>ceiling?raw.map(value=>value*ceiling/rawTotal):raw;
    const cents=scaled.map(value=>Math.floor(value+1e-9));
    const total=Math.round(sum(scaled));
    const order=scaled.map((_,index)=>index).sort((a,b)=>(scaled[b]-cents[b])-(scaled[a]-cents[a])||a-b);
    const remaining=total-sum(cents);
    for (let i=0;i<remaining;i++) cents[order[i]]++;
    return {version:balanced(state)?BALANCE_VERSION:VERSION,points:total/100,maxPoints:5,completionRatio,winning,
      ...(qualification?{qualification,rawPoints:round(rawTotal/100)}:{}),
      paths:{kpi:round(paths.kpi),satisfaction:round(paths.satisfaction)},handoverCapApplied:false,
      criteria:results.map((row,index)=>{
        const term=row.chapter, n=row.yearsClosed;
        return {id:'term-'+term.number,title:term.labels,label:term.labels,maxPoints:term.weight*5,
          points:cents[index]/100,kpi:row.kpi,satisfaction:row.satisfaction,
          detail:L(`Закрыто лет ${n}/5. Доля пятилетки ${Math.round(term.weight*100)}%.`,
            `${n} of 5 years closed. Term weight ${Math.round(term.weight*100)}%.`,
            `已结算 ${n}/5 年。本届任期权重 ${Math.round(term.weight*100)}%。`)};
      })};
  }

  G.V4Campaign={
    VERSION,BALANCE_VERSION,balanced,FULL_GRADE,METRICS,CHAPTERS,chapter,initial,advance,satisfactionEffects,eventKpiEffects,status,score,
    journalPoints:points=>Math.ceil(points),
    available:year=>phases[chapter(year).number-1],
    measure:id=>measures.get(id),
    site:id=>locations.get(id)
  };
})(globalThis);
