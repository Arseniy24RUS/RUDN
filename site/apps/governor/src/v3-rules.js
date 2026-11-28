/* Annual accounting and territory model for the versioned seminar-7 assignment. */
(function (root) {
  'use strict';

  const G = root.GovernorGame ||= {};
  const RULES_VERSION = 'governor-v3.1';
  const V4_RULES_VERSION = 'governor-v4.0';
  const FIRST_YEAR = 2026;
  const LAST_YEAR = 2045;
  const TAX_MODES = Object.freeze({low: 88, moderate: 100, high: 112});
  const TAX_RATE_LIMITS = Object.freeze({min:88,max:112,step:1,default:100});
  const INVESTMENT_TERMS = Object.freeze({min:2,max:5,annualPercent:4});
  const GROUP_WEIGHTS = Object.freeze({families: 25, seniors: 20, business: 20, youth: 15, publicStaff: 10, activists: 10});
  const SITE_METRICS = Object.freeze({north:'health', river:'flood', industrial:'employment', capital:'digital'});
  const OUTPUT_METRICS = Object.freeze({health:'health',healthStaff:'health',childcare:'childcare',school:'school',
    schoolStaff:'school',schoolReach:'school',floodProtection:'flood',jobs:'employment',housing:'housing',digital:'digital'});
  const SCHOOL_OUTPUTS = Object.freeze(['school','schoolStaff','schoolReach']);
  const SECTOR_SHARES = Object.freeze({education: 27, health: 25, transport: 12, economy: 9, social: 12, housingUtilities: 10, administration: 5});
  const EVENT_SECTORS = Object.freeze({edu:'education', health:'health', transport:'transport', utility:'housingUtilities', ecology:'housingUtilities', economy:'economy', social:'social', housing:'housingUtilities', public:'administration', budget:'administration'});
  const DISTRICTS = Object.freeze({
    suburb: {labels: {ru:'Новый берег', en:'New Bank', zh:'新岸'}, x:.80, y:.65},
    north: {labels: {ru:'Северные районы', en:'Northern districts', zh:'北部地区'}, x:.45, y:.23},
    river: {labels: {ru:'Речная долина', en:'River valley', zh:'河谷'}, x:.69, y:.42},
    industrial: {labels: {ru:'Промышленный пояс', en:'Industrial belt', zh:'工业带'}, x:.26, y:.52},
    capital: {labels: {ru:'Областной центр', en:'Regional centre', zh:'州中心'}, x:.57, y:.73}
  });
  const L = (ru, en, zh) => ({ru, en, zh});
  // Model budget sub-items included in the sector totals, in million rubles.
  // The avoidable part is smaller than the contracted expense.
  const BASE_EXPENSE_SOURCES = [
    {ref:'base.college.extraCharters',sector:'education',amount:4,avoidable:1,
      labels:L('Дополнительные рейсы колледжа','Additional college shuttles','学院额外班车')},
    {ref:'base.energy.municipalBuildings',sector:'housingUtilities',amount:9,avoidable:4,
      labels:L('Отопление муниципальных зданий','Municipal building heating','市政建筑供暖')},
    {ref:'base.procurement.logistics',sector:'administration',amount:5,avoidable:2,
      labels:L('Доставка общих расходников','Shared supplies delivery','通用耗材配送')},
    {ref:'base.freight.overlappingOrders',sector:'administration',amount:4,avoidable:1,
      labels:L('Дублирующие заказы на доставку','Duplicate freight orders','重复货运订单')}
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const sum = values => values.reduce((total, value) => total + value, 0);
  const money = value => Math.round(value);
  const percent = (num, den) => den ? Math.min(100, 100*num/den) : null;
  const clamp = (value, a = 0, b = 100) => Math.max(a, Math.min(b, value));
  const cents = value => Math.round(value * 100) / 100;
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const objectSum = values => sum(Object.values(values));
  const pay = (id, year, direction, type, amount, sector = null) => ({id, year, direction, type, amount, sector});
  const isV4 = state => state.rulesVersion === V4_RULES_VERSION;
  const validTaxRate = rate => integer(rate) && rate >= TAX_RATE_LIMITS.min && rate <= TAX_RATE_LIMITS.max;

  function measure(id, districtId, sector, labels, cost, annualOpex, years, lag = 0, siteIds = []) {
    return {id, districtId, sector, labels, cost, annualOpex, years, lag, siteIds, kind:lag ? 'capital' : 'service'};
  }

  const MEASURES = Object.freeze([
    measure('school-campus','suburb','education',L('Построить школу','Build a school','建设学校'),1670,76,15,2,['yard','bridge','south']),
    measure('second-shift','suburb','education',L('Открыть вторую смену','Add a second shift','开设第二班'),550,160,2),
    measure('school-bus','suburb','education',L('Запустить школьный подвоз','Launch school buses','开通校车'),900,220,4),
    measure('clinics','north','health',L('Открыть амбулаторию','Open an outpatient clinic','建设门诊部'),1660,240,9,2,['remote-cluster','district-centre','transport-junction']),
    measure('mobile-units','north','health',L('Запустить мобильные медбригады','Launch mobile medical teams','启动流动医疗队'),1820,450,4),
    measure('train-staff','north','health',L('Подготовить кадры для клиник','Train clinic staff','培养诊所人员'),840,105,5),
    measure('defenses','river','housingUtilities',L('Укрепить берег','Build flood defences','建设防洪设施'),1950,145,12,2,['upstream','river-towns','delta-corridor']),
    measure('outreach','river','social',L('Организовать предупреждение о паводке','Organise flood warnings','组织洪水预警'),430,80,4),
    measure('industrial-park','industrial','economy',L('Подготовить площадку для предприятий','Build an industrial park','建设工业园区'),2240,220,12,2,['old-industrial-city','small-town-belt','logistics-corridor']),
    measure('skills-compact','industrial','economy',L('Открыть программу переобучения','Open a retraining programme','开设再培训项目'),880,130,4),
    measure('single-window','capital','administration',L('Открыть единые окна обслуживания','Open one-stop service counters','开设一站式服务窗口'),1240,180,8,1,['central-hub','outer-district','split-counters']),
    measure('cyber-first','capital','administration',L('Защитить цифровые службы','Protect digital services','保护数字服务'),630,105,5),
    {id:'defer', districtId:null, sector:null, labels:L('Год без нового проекта','Year without a new project','本年不启动新项目'), cost:0, annualOpex:0, years:0, lag:0, siteIds:[], kind:'defer'}
  ]);

  function site(id, labels, x, y, cost, delay, opex, output, targets) {
    return {id, labels, x, y, cost, delay, opex, output, targets};
  }

  const SITES = Object.freeze([
    site('remote-cluster',L('В удалённых посёлках','In the outlying villages','偏远村庄'),.43,.17,240,1,60,1.10,{north:1}),
    site('district-centre',L('В районном центре','In the district centre','区中心'),.45,.24,0,0,0,1,{north:.8,river:.2}),
    site('transport-junction',L('У транспортного узла','At the transport hub','交通枢纽'),.51,.30,410,1,75,1.24,{north:.65,capital:.35}),
    site('upstream',L('Выше по течению','Upstream','上游'),.63,.32,200,1,55,1.23,{river:.8,north:.2}),
    site('river-towns',L('У городской набережной','At the town embankment','城镇河堤'),.67,.45,0,0,0,1,{river:1}),
    site('delta-corridor',L('У нижней переправы','At the lower crossing','下游渡口'),.77,.57,390,1,65,1.21,{river:.63,suburb:.37}),
    site('old-industrial-city',L('В старой промзоне','In the old industrial area','旧工业区'),.22,.48,0,0,5,1,{industrial:1}),
    site('small-town-belt',L('На границе малых городов','In the small-town belt','小城镇带'),.35,.53,160,1,35,1.12,{industrial:.60,river:.40}),
    site('logistics-corridor',L('У грузового коридора','At the freight corridor','货运走廊'),.36,.62,420,1,95,1.26,{industrial:.65,suburb:.35}),
    site('central-hub',L('В главном центре','In the central hub','中心枢纽'),.55,.76,0,0,0,1,{capital:1}),
    site('outer-district',L('У пересадки на окраине','At the outer transfer stop','外围换乘站'),.63,.81,100,0,35,1.13,{capital:.7,suburb:.3}),
    site('split-counters',L('В двух действующих центрах','In two existing service centres','两个现有服务中心'),.58,.82,260,1,65,1.25,{capital:.7,industrial:.3})
  ]);

  function split(total, weights) {
    const weightSum = sum(weights);
    const exact = weights.map(weight => weightSum ? total * weight / weightSum : total / weights.length);
    const result = exact.map(Math.floor);
    const order = exact.map((value, index) => index).sort((a,b) => exact[b]-result[b]-(exact[a]-result[a]) || a-b);
    for (let i = 0, rest = total - sum(result); i < rest; i++) result[order[i]]++;
    return result;
  }

  function loanSchedule(principal, annualPercent, termYears, issueYear = FIRST_YEAR) {
    if (!integer(principal) || !principal || !Number.isFinite(annualPercent) || annualPercent < 0 || annualPercent > 100 ||
        !Number.isInteger(termYears) || termYears < 1 || termYears > 20) throw new Error('governor-v3/loan-unavailable');
    let remaining = principal;
    const payments = split(principal, Array(termYears).fill(1));
    return payments.map((amount, i) => {
      const opening = remaining;
      const interest = money(opening * annualPercent / 100);
      remaining -= amount;
      return {year:issueYear+1+i, opening, principal:amount, interest, total:amount+interest, remaining};
    });
  }

  function investmentQuote(principal, termYears, placedYear) {
    if (!integer(principal) || principal === 0 || !integer(termYears) || termYears < INVESTMENT_TERMS.min ||
        termYears > INVESTMENT_TERMS.max || !integer(placedYear) || placedYear < FIRST_YEAR ||
        placedYear + termYears > LAST_YEAR) return null;
    const income = money(principal * INVESTMENT_TERMS.annualPercent * termYears / 100);
    if (!Number.isSafeInteger(principal + income)) return null;
    return {id:'investment:'+placedYear, principal, termYears, placedYear, maturityYear:placedYear+termYears,
      annualPercent:INVESTMENT_TERMS.annualPercent, income, payout:principal+income};
  }

  function reconcile({cash, debt, reserve, operations}) {
    let cashEnd = cash, debtEnd = debt, reserveEnd = reserve;
    const sectors = Object.fromEntries(Object.keys(SECTOR_SHARES).map(sector => [sector, {total:0, entries:[]}]));
    let totalIn = 0, totalOut = 0;
    const seen = new Set();
    for (const row of operations) {
      if (seen.has(row.id) || !integer(row.amount) || !['in','out'].includes(row.direction)) throw new Error('governor-v3/invalid-operation');
      seen.add(row.id);
      if (row.direction === 'in') {cashEnd += row.amount;totalIn += row.amount;}
      else {cashEnd -= row.amount;totalOut += row.amount;}
      if (row.type === 'loan') debtEnd += row.amount;
      if (row.type === 'principal') debtEnd -= row.amount;
      if (row.type === 'reserve-draw') reserveEnd -= row.amount;
      if (row.type === 'reserve-contribution') reserveEnd += row.amount;
      if (row.direction === 'out' && row.sector) {
        const sector = sectors[row.sector] ||= {total:0, entries:[]};
        sector.total += row.amount;
        sector.entries.push(row);
      }
    }
    return {cash, debt, reserve, cashEnd, debtEnd, reserveEnd, totalIn, totalOut, sectors, operations};
  }

  function graphPaths(nodes, roads, closedRoads) {
    const sorted = nodes.map(node => node.id).sort(), index = Object.fromEntries(sorted.map((id,i) => [id,i]));
    const distances = sorted.map((_,i) => sorted.map((__,j) => i === j ? 0 : Infinity));
    const paths = sorted.map(() => sorted.map(() => []));
    for (const road of [...roads].sort((a,b) => a.id.localeCompare(b.id))) {
      if (closedRoads.includes(road.id)) continue;
      const a = index[road.from], b = index[road.to];
      if (road.minutes >= distances[a][b]) continue;
      distances[a][b] = distances[b][a] = road.minutes;
      paths[a][b] = paths[b][a] = [road.id];
    }
    for (let k = 0; k < sorted.length; k++) for (let i = 0; i < sorted.length; i++) for (let j = 0; j < sorted.length; j++) {
      const candidate = distances[i][k] + distances[k][j];
      if (distances[i][j] <= candidate) continue;
      distances[i][j] = candidate;
      paths[i][j] = [...paths[i][k], ...paths[k][j]];
    }
    return (a,b) => ({minutes:distances[index[a]][index[b]], roads:paths[index[a]][index[b]]});
  }

  function schoolZones(map, byLocation) {
    if (!byLocation) return [...map.zones].sort((a,b) => a.id.localeCompare(b.id));
    const locations = Object.fromEntries(map.nodes.map(node=>[node.id,node]));
    return [...map.zones].sort((a,b)=>{
      const first = locations[a.node], second = locations[b.node];
      return first.y01-second.y01 || first.x01-second.x01 || a.node.localeCompare(b.node);
    });
  }

  function schoolAllocation(map, {closedRoads = [], schools = map.baselineSchools, byLocation = false} = {}) {
    const zones = schoolZones(map,byLocation);
    const institutions = [...schools].sort((a,b) => a.id.localeCompare(b.id));
    const path = graphPaths(map.nodes, map.roads, closedRoads);
    const demandByZone = Object.fromEntries(zones.map(z => [z.id,objectSum(z.pupilsByAge)]));
    const demand = objectSum(demandByZone), source = 0;
    const schoolOffset = zones.length + 1, sink = schoolOffset + institutions.length;
    const residual = Array.from({length:sink+1}, () => []);
    function edge(from,to,limit,minutes) {
      const forward = {to,limit,minutes,reverse:residual[to].length,initial:limit};
      const reverse = {to:from,limit:0,minutes:-minutes,reverse:residual[from].length,initial:0};
      residual[from].push(forward);
      residual[to].push(reverse);
      return forward;
    }
    institutions.forEach((school,i) => edge(schoolOffset+i,sink,Math.min(school.physicalSeats,school.staffedSeats),0));
    const routes = [];
    zones.forEach((zone,i) => {
      const from = i+1;
      edge(source,from,demandByZone[zone.id],0);
      institutions.forEach((school,j) => {
        const route = path(zone.node,school.node);
        if (route.minutes <= map.policy.walkingLimitMinutes) {
          const connection = edge(from,schoolOffset+j,demandByZone[zone.id],route.minutes);
          routes.push({zoneId:zone.id,schoolId:school.id,...route,connection});
        }
      });
    });
    // Successive shortest augmenting paths. The reverse edges let later
    // assignments free a slot for a pupil with fewer reachable alternatives.
    for (;;) {
      const time = residual.map(() => Infinity), parents = [];
      time[source] = 0;
      for (let count = 1; count < residual.length; count++) {
        let changed = false;
        residual.forEach((edges,i) => edges.forEach(e => {
          if (e.limit > 0 && time[i]+e.minutes < time[e.to]) {
            time[e.to] = time[i]+e.minutes;
            parents[e.to] = {i,e};changed = true;
          }
        }));
        if (!changed) break;
      }
      if (!parents[sink]) break;
      let amount = Infinity;
      for (let v = sink; v !== source; v = parents[v].i) amount = Math.min(amount,parents[v].e.limit);
      for (let v = sink; v !== source; v = parents[v].i) {
        const {e} = parents[v];
        e.limit -= amount;
        residual[v][e.reverse].limit += amount;
      }
    }
    const assignments = routes.map(({connection,...route}) => ({...route,pupils:connection.initial-connection.limit})).filter(r => r.pupils);
    const servedByZone = Object.fromEntries(zones.map(z => [z.id,sum(assignments.filter(a => a.zoneId === z.id).map(a => a.pupils))]));
    const servedBySchool = Object.fromEntries(institutions.map(s => [s.id,sum(assignments.filter(a => a.schoolId === s.id).map(a => a.pupils))]));
    const served = objectSum(servedByZone), pupilMinutesOneWay = sum(assignments.map(row => row.pupils * row.minutes));
    const zoneCoverage = zones.map(z => percent(servedByZone[z.id],demandByZone[z.id])).filter(x => x !== null);
    return {served,demand,unserved:demand-served,coveragePct:percent(served,demand),demandByZone,servedByZone,servedBySchool,pupilMinutesOneWay,
      meanTripMinutesServed:served ? cents(pupilMinutesOneWay/served) : null,lowestZoneCoveragePct:zoneCoverage.length ? cents(Math.min(...zoneCoverage)) : null,assignments};
  }

  function schoolComparison(map, siteId, {year = map.decisionYear, closedRoads = [], school = map.newSchool, byLocation = false} = {}) {
    const entry = map.sites.find(s => s.id === siteId);
    if (!entry) return null;
    const schools = [...map.baselineSchools, {...school, node:entry.node}];
    const baseline = schoolAllocation(map,{closedRoads,byLocation});
    const active = schoolAllocation(map,{closedRoads,schools,byLocation});
    const firstServiceYear = year + entry.paymentScheduleMillion.length;
    const capexMillion = objectSum(entry.capexMillion), annualOpexMillion = objectSum(entry.annualOpexMillion);
    const serviceYears = Math.max(0,map.horizonEndYear+1-firstServiceYear);
    return {id:siteId,site:entry,baseline,...active,firstServiceYear,capexMillion,annualOpexMillion,
      spendThrough2031Million:sum(entry.paymentScheduleMillion.slice(0,Math.max(0,map.horizonEndYear+1-year)))+annualOpexMillion*serviceYears,
      extraPupilYearsThrough2031:(active.served-baseline.served)*serviceYears,
      servedWithBridgeClosed:schoolAllocation(map,{closedRoads:[map.sensitivity.closedRoad],schools,byLocation}).served};
  }

  function baseOperations(state) {
    const {year, finance} = state, demographic = G.Population?.fiscalFactors(state) || {mandatoryFactor:1};
    const mandatory = money(finance.base.mandatory * (1 + (year-FIRST_YEAR)*.008) * demographic.mandatoryFactor);
    const amounts = split(mandatory,Object.values(SECTOR_SHARES));
    const rows = Object.keys(SECTOR_SHARES).map((sector,i) => pay(`base:${year}:${sector}`,year,'out','mandatory',amounts[i],sector));
    if (!isV4(state)) return rows;
    return rows.flatMap(row => {
      let remainder = row.amount;
      const lines = [];
      for (const source of BASE_EXPENSE_SOURCES.filter(item => item.sector === row.sector)) {
        const amount = Math.min(remainder, source.amount);
        if (!amount) continue;
        remainder -= amount;
        const reductionMln = Math.min(source.avoidable, Math.floor(amount * source.avoidable / source.amount));
        lines.push({...row,id:row.id+':'+source.ref,amount,baseLedgerRef:source.ref,reductionMln,labels:source.labels});
      }
      return [{...row,amount:remainder},...lines];
    });
  }

  function verifiedBaseExpenses(state) {
    if (!isV4(state)) return {};
    return Object.fromEntries(baseOperations(state).filter(row => row.baseLedgerRef && row.reductionMln > 0)
      .map(row => [row.baseLedgerRef,{id:row.id,year:row.year,expenseMln:row.amount,reductionMln:row.reductionMln}]));
  }

  function emptyDraft(taxMode = 'moderate', rulesVersion = RULES_VERSION) {
    if (rulesVersion===V4_RULES_VERSION) {
      const taxRate = validTaxRate(taxMode) ? taxMode : Object.hasOwn(TAX_MODES,taxMode) ? TAX_MODES[taxMode] : TAX_RATE_LIMITS.default;
      return {eventChoice:null,measures:[],taxRate,loan:null,investment:null,reserveDraw:0,reserveContribution:0,sectorLimits:{}};
    }
    return {eventChoice:null,measureId:null,siteId:null,districtId:null,taxMode,loan:null,
      reserveDraw:0,reserveContribution:0,sectorLimits:{},promise:null};
  }

  function create({attemptId, schoolMap, rulesVersion = RULES_VERSION}) {
    if (!attemptId || !schoolMap?.sites) throw new Error('governor-v3/missing-start-data');
    if (![RULES_VERSION,V4_RULES_VERSION].includes(rulesVersion)) throw new Error('governor/unsupported-rules');
    const scenario = G.DATA?.scenarios?.find(row => row.id === 'balanced');
    const opening = scenario?.finance || {openingTreasury:4.5,reserve:2.5,debt:6,debtLimit:16,debtRate:.07,
      ownTaxRevenue:35,nonTaxRevenue:3,equalizationGrant:2.5,mandatoryCosts:37.4};
    const population = G.Population.create('balanced'), debt = money(opening.debt*1000), annualPercent = cents(opening.debtRate*100);
    const start = {rulesVersion,attemptId,scenarioId:'balanced',schoolMap,population,year:FIRST_YEAR,revision:0,completed:false,
      draft:emptyDraft('moderate',rulesVersion),event:null,projects:[],history:[],promises:[],closedRoads:[],
      finance:{cash:money(opening.openingTreasury*1000),reserve:money(opening.reserve*1000),debt,initialDebt:debt,debtLimit:money(opening.debtLimit*1000),
        annualPercent,base:{taxes:money(opening.ownTaxRevenue*1000),nonTax:money(opening.nonTaxRevenue*1000),
          grant:money(opening.equalizationGrant*1000),mandatory:money(opening.mandatoryCosts*1000)},
        loans:[{id:'opening-debt',issueYear:FIRST_YEAR-1,schedule:loanSchedule(debt,annualPercent,10,FIRST_YEAR-1)}]}};
    const groups = Object.fromEntries(Object.keys(GROUP_WEIGHTS).map(id => [id,58]));
    const initial = calculateStats(start,groups,{},[]);
    start.stats = initial;
    start.initialStats = clone(initial);
    if (isV4(start)) {
      start.finance.investments = [];
      start.campaignKpis = G.V4Campaign.initial(start);
      start.initialCampaignKpis = clone(start.campaignKpis);
      start.campaignTerms = (G.V4Campaign.CHAPTERS??[]).map(({number,targets,weight,satisfactionTarget})=>
        ({number,targets:clone(targets),weight,satisfactionTarget}));
    }
    // The common assignment uses no externally supplied seed. The baseline
    // receives the saved event sequence and applies the documented base option.
    start.baseline = {finance:clone(start.finance), population:clone(start.population), stats:clone(initial), closedRoads:[]};
    if (isV4(start)) start.baseline.campaignKpis = clone(start.campaignKpis);
    return start;
  }

  function projectPhase(project, year) {
    if (year < project.openingYear) {
      if (project.reopeningYear) return 'restoring';
      const elapsed = year-project.approvedYear;
      if (!elapsed) return 'foundation';
      return year === project.openingYear-1 ? 'finishing' : 'frame';
    }
    return year <= project.endYear ? 'open' : 'closed';
  }

  function availableMeasures(state) {
    const adopted = new Set(state.projects.map(p => p.measureId));
    const catalog = isV4(state) ? G.V4Campaign.available(state.year) : MEASURES;
    const choices = catalog.filter(m => !adopted.has(m.id));
    for (const p of state.projects) {
      if (state.year < p.endYear || state.year < p.openingYear) continue;
      const closed = state.year > p.endYear;
      choices.push({id:(closed?'restore:':'renew:')+p.id, districtId:p.districtId, sector:p.sector, kind:closed?'restore':'renew',
        projectId:p.id, labels:closed?L('Восстановить: '+p.labels.ru,'Restore: '+p.labels.en,'恢复：'+p.labels.zh)
          :L('Продлить: '+p.labels.ru,'Renew: '+p.labels.en,'续期：'+p.labels.zh),
        cost:money(p.annualOpex*(closed?.5:.12)), annualOpex:p.annualOpex, lag:closed?1:0, years:3, siteIds:[]});
    }
    return choices;
  }

  function sitesFor(state, choice) {
    const school = choice?.id==='school-campus';
    return (choice?.siteIds || []).map(id => school ? state.schoolMap.sites.find(site => site.id===id) :
      (isV4(state) ? G.V4Campaign.site?.(id) : undefined) ?? SITES.find(site => site.id===id)).filter(Boolean);
  }

  function applicableSchoolData(state, population, staffedFactor = 1) {
    const map = state.schoolMap;
    const baselineDemand = state.population.initial.access.suburb.school;
    const groups = {'7-10':[7,10],'11-17':[11,17]};
    const stock = state.population.municipalities.suburb;
    const orderedZones = isV4(state) ? schoolZones(map,true) : map.zones;
    const weights = Object.keys(groups).map(age => orderedZones.map(z => z.pupilsByAge[age]));
    const counts = Object.values(groups).map(([first,last]) => sum(stock.male.slice(first,last+1))+sum(stock.female.slice(first,last+1)));
    const coverage = counts[0]+counts[1] === population ? counts : split(population,counts);
    const distributed = weights.map((rows,i)=>split(coverage[i],rows));
    const baselineScale = baselineDemand / sum(weights.map(sum));
    const zones = orderedZones.map((z,i) => ({...z,pupilsByAge:{'7-10':distributed[0][i],'11-17':distributed[1][i]}}));
    const baselineSchools = map.baselineSchools.map(s => ({...s,physicalSeats:money(s.physicalSeats*baselineScale),
      staffedSeats:money(s.staffedSeats*baselineScale*staffedFactor)}));
    const newSchool = {...map.newSchool,physicalSeats:money(map.newSchool.physicalSeats*baselineScale),
      staffedSeats:money(map.newSchool.staffedSeats*baselineScale*staffedFactor)};
    return {...map,zones,baselineSchools,newSchool};
  }

  function schoolQuote(state,siteId) {
    const local = state.population.derived.municipalities.suburb, original = state.population.initial.access.suburb;
    const adultsFactor = .80 + .20*(local.labour/Math.max(1,original.labour));
    return schoolComparison(applicableSchoolData(state,local.school,adultsFactor),siteId,{
      year:state.year,closedRoads:state.closedRoads,byLocation:isV4(state)
    });
  }

  function draftProject(state, errors, choice, draft, occupied) {
    const {year} = state;
    if (!choice) {errors.push({code:'measure-required',tab:'decisions'});return null;}
    if (choice.kind === 'defer') return null;
    if (choice.projectId) {
      const project = state.projects.find(p => p.id === choice.projectId);
      const restoring = choice.kind === 'restore';
      const openingYear = restoring ? year+1 : project.openingYear;
      const endYear = restoring ? openingYear+choice.years-1 : project.endYear+choice.years;
      return {...project,action:choice.kind,costNow:choice.cost,openingYear,endYear,durationYears:choice.years,
        reopeningYear:restoring ? openingYear : project.reopeningYear,status:restoring?'restoring':'open'};
    }
    const chosen = choice.siteIds.includes(draft.siteId) ? draft.siteId : null;
    if (choice.siteIds.length && !chosen) {
      errors.push({code:'site-required',tab:'map'});
      return null;
    }
    if (chosen && occupied.has(chosen)) {
      errors.push({code:'site-occupied',tab:'map'});
      return null;
    }
    const placement = isV4(state) ? sitesFor(state,choice).find(site=>site.id===chosen) : SITES.find(s => s.id === chosen);
    const projection = choice.id === 'school-campus' ? schoolQuote(state,chosen) : null;
    if (isV4(state) && chosen && !placement) {
      errors.push({code:'invalid-site',tab:'map'});
      return null;
    }
    const capex = projection?.capexMillion ?? choice.cost+(placement?.cost || 0);
    const annualOpex = projection?.annualOpexMillion ?? choice.annualOpex+(placement?.opex || 0);
    const lag = projection ? projection.firstServiceYear-year : choice.lag+(placement?.delay || 0);
    const schedule = projection ? projection.site.paymentScheduleMillion : split(capex,Array(Math.max(1,lag)).fill(1));
    const openingYear = year+lag;
    const project = {id:`project:${year}:${choice.id}`,measureId:choice.id, action:'new', facilityId:choice.id === 'school-campus' ? 'new-campus-01' : null,
      labels:choice.labels,sector:choice.sector,districtId:choice.districtId,siteId:chosen,kind:choice.kind,approvedYear:year,openingYear,endYear:openingYear+choice.years-1,
      capex,costNow:schedule[0],annualOpex,durationYears:choice.years,payments:schedule.map((amount,i)=>({year:year+i,amount})),
      targets:placement?.targets || choice.serviceEffect?.targets || {[choice.districtId]:1},outputFactor:placement?.output || 1,
      paidYears:[],changes:[]};
    // The school graph owns capacity and expense for its three fixed locations.
    if (isV4(state)) {
      if (projection) {
        project.targets = {[choice.districtId]:1};
        project.outputFactor = 1;
      }
      if (choice.serviceEffect) project.serviceEffect = choice.serviceEffect;
      if (choice.kpiEffects) project.kpiEffects = choice.kpiEffects;
      if (choice.artFamily) project.artFamily = choice.artFamily;
    }
    return {...project,status:projectPhase(project,year),projection:projection || (!isV4(state)?territoryProjection(state,project):null)};
  }

  function draftProjects(state, errors, eventPlan) {
    const choices = new Map(availableMeasures(state).map(choice=>[choice.id,choice]));
    const occupied = new Set(state.projects.map(project=>project.siteId).filter(Boolean));
    if (!isV4(state)) {
      const project = draftProject(state,errors,choices.get(state.draft.measureId),state.draft,occupied);
      return project?[project]:[];
    }
    if (!Array.isArray(state.draft.measures)) {
      errors.push({code:'invalid-measures',tab:'decisions'});
      return [];
    }
    const seen = new Set();
    const renewed = new Set();
    const projects = [];
    let promisedReserve = false;
    for (const entry of state.draft.measures) {
      const measureId = entry?.measureId;
      const choice = choices.get(measureId);
      if (!choice || choice.kind==='defer') {
        errors.push({code:'measure-unavailable',tab:'decisions',measureId});
        continue;
      }
      if (seen.has(measureId) || (choice.projectId && renewed.has(choice.projectId))) {
        errors.push({code:'duplicate-measure',tab:'decisions',measureId});
        continue;
      }
      seen.add(measureId);
      if (choice.projectId) renewed.add(choice.projectId);
      const localErrors = [];
      const {promise,siteId} = entry;
      if (siteId!=null && !choice.siteIds.includes(siteId)) localErrors.push({code:'invalid-site',tab:'map'});
      if (promise) {
        const valid = integer(promise.dueYear) && promise.dueYear>=state.year && promise.dueYear<=LAST_YEAR &&
          (['open','operate'].includes(promise.type) ||
            (promise.type==='reserve' && !promisedReserve && integer(promise.amount) && promise.amount>0));
        if (!valid) localErrors.push({code:'invalid-promise',tab:'decisions'});
        if (promise.type==='reserve') promisedReserve = true;
      }
      const project = !localErrors.some(row=>row.code==='invalid-site') &&
        draftProject(state,localErrors,choice,entry,occupied);
      errors.push(...localErrors.map(row=>({...row,measureId,siteId:siteId??null})));
      if (!project) continue;
      if (project.siteId) occupied.add(project.siteId);
      projects.push({...project,draftMeasureId:measureId});
    }
    // Project projections share the same portfolio. Their individual effects are
    // conditional comparisons, so overlapping access gains are never added up.
    return projects.map(project=>project.projection?project:{...project,projection:
      territoryProjection(state,project,projects.filter(other=>other!==project),eventPlan)});
  }

  function dueProject(project, year) {
    const rows = project.payments.filter(p => p.year === year).map(p => pay(project.id+':build:'+year,year,'out',project.kind === 'capital'?'capex':'start',p.amount,project.sector));
    if (projectPhase(project,year) === 'open') rows.push(pay(project.id+':operate:'+year,year,'out','operation',project.annualOpex,project.sector));
    return rows;
  }

  function mergeProject(projects, selected, year) {
    if (!selected) return projects;
    const {projection,draftMeasureId,...project} = selected;
    if (project.action === 'new') return [...projects,project];
    return projects.map(p => p.id !== project.id ? p : {...project,payments:[...p.payments,{year,amount:project.costNow}],
      changes:[...p.changes,{year,type:project.action,openingYear:project.openingYear,endYear:project.endYear}]});
  }

  function outstanding(finance, year) {
    return finance.loans.flatMap(loan => loan.schedule.filter(row => row.year >= year).map(row => ({loanId:loan.id,...row})))
      .sort((a,b) => a.year-b.year || a.loanId.localeCompare(b.loanId));
  }

  function paymentShortfall(cash, debtExpense) {
    return debtExpense > 0 ? Math.max(0,-cash) : 0;
  }

  function applyEventRows(operations, eventPlan, year) {
    const rows = [...operations];
    for (const row of (eventPlan?.rows || [])) {
      if (row.year !== year) continue;
      const amount = row.amount ?? row.amountMln;
      if (!integer(amount)) throw new Error('governor-v3/invalid-event-payment');
      if (row.type === 'saving') {
        const position = rows.findIndex(op => op.id === (row.replaces || row.sourceId) && op.direction === 'out');
        if (position !== -1) {
          const original = rows[position];
          const savings = original.savings || [];
          if (savings.some(entry => entry.id === row.id)) continue;
          const available = original.reductionMln === undefined ? original.amount :
            Math.max(0,original.reductionMln-sum(savings.map(entry => entry.amount)));
          const saved = Math.min(amount,original.amount,available);
          if (saved) rows[position] = {...original,amount:original.amount-saved,
            savings:[...savings,{id:row.id,amount:saved,...(original.baseLedgerRef?{eventId:row.eventId}:{})}]};
        }
      } else {
        rows.push({...row,amount,sector:row.direction === 'out' ? EVENT_SECTORS[row.sector] || row.sector || 'administration' : null});
      }
    }
    return rows;
  }

  function buildFinance(state, selected, eventPlan, errors, minimumHorizon = 0) {
    const {draft, finance, year} = state;
    const modern = isV4(state);
    const demo = G.Population.fiscalFactors(state);
    const regularTaxBase = finance.base.taxes*(1+(year-FIRST_YEAR)*.004);
    const taxBase = money(regularTaxBase*demo.taxFactor);
    const taxFactor = modern ? (validTaxRate(draft.taxRate) ? draft.taxRate : null) : TAX_MODES[draft.taxMode];
    if (!taxFactor) errors.push({code:'invalid-tax',tab:'budget'});
    const taxes = money(taxBase*(taxFactor || 100)/100);
    const nonTax = money(finance.base.nonTax*(1+(year-FIRST_YEAR)*.003));
    const debtRows = outstanding(finance,year);
    const due = debtRows.filter(row => row.year === year);
    const principalDue = sum(due.map(row => row.principal));
    const annualPercent = finance.annualPercent;
    const loans = [...finance.loans];
    const projects = selected.reduce((all,project)=>mergeProject(all,project,year),state.projects);
    const investments = [...(finance.investments || [])];
    const matured = modern ? investments.filter(row=>row.maturityYear===year) : [];
    const operations = [
      pay('tax:'+year,year,'in','tax',taxes),
      pay('non-tax:'+year,year,'in','non-tax',nonTax),
      pay('grant:'+year,year,'in','equalization',finance.base.grant),
      ...baseOperations(state),
      ...projects.flatMap(p => dueProject(p,year)),
      ...due.flatMap(row => [pay(row.loanId+':interest:'+year,year,'out','interest',row.interest),
        pay(row.loanId+':principal:'+year,year,'out','principal',row.principal)]),
      ...matured.flatMap(row => [pay(row.id+':principal',year,'in','investment-principal',row.principal),
        pay(row.id+':income',year,'in','investment-income',row.income)])
    ];
    if (draft.loan) {
      const requested = draft.loan;
      const maxLoan = finance.debtLimit-finance.debt+principalDue;
      // This is the same regional credit instrument in both budget and project
      // forecasts. The draft cannot choose a cheaper rate than the instrument.
      const acceptable = integer(requested.principal) && requested.principal>0 && requested.principal<=maxLoan &&
        Number.isInteger(requested.termYears) && requested.termYears>=1 && requested.termYears<=10 &&
        (requested.annualPercent === undefined || requested.annualPercent === annualPercent);
      if (!acceptable) errors.push({code:'loan-limit',tab:'budget',amount:Math.max(0,maxLoan)});
      if (acceptable) {
        const id = 'loan:'+year;
        const schedule = loanSchedule(requested.principal,annualPercent,requested.termYears,year);
        loans.push({id,issueYear:year,schedule});
        operations.push(pay(id,year,'in','loan',requested.principal));
      }
    }
    if (!integer(draft.reserveDraw) || draft.reserveDraw>finance.reserve || !integer(draft.reserveContribution) ||
        (draft.reserveDraw && draft.reserveContribution)) errors.push({code:'invalid-reserve',tab:'budget',amount:finance.reserve});
    else {
      if (draft.reserveDraw) operations.push(pay('reserve-in:'+year,year,'in','reserve-draw',draft.reserveDraw));
      if (draft.reserveContribution) operations.push(pay('reserve-out:'+year,year,'out','reserve-contribution',draft.reserveContribution));
    }
    const afterEvents = applyEventRows(operations,eventPlan,year);
    const canInvest = !draft.loan && !draft.reserveDraw;
    const investmentHeadroom = modern && canInvest ? Math.max(0,finance.cash+sum(afterEvents.map(row=>
      row.direction==='in' ? row.amount : -row.amount))) : 0;
    let investmentDraft = null;
    let investmentContribution = 0;
    if (modern && draft.investment!==null && draft.investment!==undefined) {
      investmentDraft = investmentQuote(draft.investment.principal,draft.investment.termYears,year);
      if (!investmentDraft) errors.push({code:'invalid-investment',tab:'budget'});
      else if (!canInvest) errors.push({code:'investment-funding-conflict',tab:'budget'});
      else if (investmentDraft.principal>investmentHeadroom) {
        errors.push({code:'investment-unfunded',tab:'budget',amount:investmentDraft.principal-investmentHeadroom});
      } else {
        investmentContribution = investmentDraft.principal;
        investments.push(investmentDraft);
        afterEvents.push(pay(investmentDraft.id+':contribution',year,'out','investment-contribution',investmentContribution));
      }
    }
    const result = reconcile({...finance,operations:afterEvents});
    const optionalTypes = modern ? ['start','capex','oneOff','operation'] : ['start','capex','oneOff'];
    const optional = afterEvents.filter(row => row.direction === 'out' && row.sector && optionalTypes.includes(row.type))
      .filter(row => selected.some(project => row.id.startsWith(project.id+':') &&
        (row.type!=='operation' || project.action==='new')));
    const mandatoryBySector = Object.fromEntries(Object.keys(SECTOR_SHARES).map(id => [id,(result.sectors[id]?.total || 0)-
      sum(optional.filter(row => row.sector === id).map(row => row.amount))]));
    const overLimits = Object.entries(draft.sectorLimits || {}).filter(([key, ceiling]) => !Object.hasOwn(SECTOR_SHARES,key) ||
      !integer(ceiling) || ceiling < mandatoryBySector[key] || ceiling < (result.sectors[key]?.total || 0));
    if (overLimits.length) errors.push({code:'sector-limit',tab:'budget',...(modern?{sectors:overLimits.map(([key])=>key)}:{})});
    if (result.cashEnd<0) errors.push({code:'budget-deficit',tab:'budget',amount:-result.cashEnd});
    const debtSchedule = outstanding({loans},year+1);
    const horizon = Math.max(year+3,LAST_YEAR,minimumHorizon,...debtSchedule.map(row => row.year),
      ...projects.map(p => p.endYear),...(eventPlan?.futureRows || []).map(row => row.year));
    const futureRows = [];
    let cash = result.cashEnd;
    for (let y=year+1; y<=horizon; y++) {
      const futureDebt = debtSchedule.filter(row => row.year===y);
      const knownEvent = (eventPlan?.futureRows || []).filter(row => row.year===y && row.direction==='out' && row.type!=='saving');
      const futureProject = projects.flatMap(p => dueProject(p,y));
      const debtExpense = sum(futureDebt.map(row=>row.total)), projectExpense = sum(futureProject.map(row=>row.amount)),
        eventExpense = sum(knownEvent.map(row=>row.amount ?? row.amountMln));
      const projectedBase = money(finance.base.mandatory*(1+(y-FIRST_YEAR)*.008)*demo.mandatoryFactor);
      const projectedIncome = money(finance.base.taxes*(1+(y-FIRST_YEAR)*.004)*demo.taxFactor*(taxFactor || 100)/100) +
        money(finance.base.nonTax*(1+(y-FIRST_YEAR)*.003)) + finance.base.grant;
      const payouts = modern?investments.filter(row=>row.maturityYear===y):[];
      const investmentPrincipal = sum(payouts.map(row=>row.principal));
      const investmentIncome = sum(payouts.map(row=>row.income));
      cash += projectedIncome + investmentPrincipal + investmentIncome - projectedBase - debtExpense - projectExpense - eventExpense;
      futureRows.push({year:y, debtExpense,projectExpense,eventExpense, protectedExpenses:projectedBase, projectedIncome, cash,
        ...(modern?{investmentPrincipal,investmentIncome}:{})});
    }
    if (draft.loan && futureRows.some(row=>row.year<=year+draft.loan.termYears && paymentShortfall(row.cash,row.debtExpense)))
      errors.push({code:'loan-unfunded-schedule',tab:'budget'});
    const shortfall = modern ? futureRows.find(row=>row.cash<0) : null;
    return {...result,taxes,taxBase,taxDelta:taxes-taxBase,nonTax,annualPercent,
      loanHeadroom:Math.max(0,finance.debtLimit-finance.debt+principalDue),debtSchedule,futureRows,loans,projects,mandatoryBySector,
      interest:sum(due.map(row=>row.interest)),principalDue,
      ...(modern?{eventSavings:sum(afterEvents.flatMap(row=>(row.savings||[]).map(entry=>entry.amount))),taxRate:taxFactor,employmentTaxDelta:taxBase-money(regularTaxBase),investmentHeadroom,investmentDraft,investments,investmentContribution,
        investmentPrincipal:sum(matured.map(row=>row.principal)),investmentIncome:sum(matured.map(row=>row.income)),
        firstShortfall:shortfall?{...shortfall,amount:-shortfall.cash}:null}:{})};
  }

  function quote(state, {eventPlan} = {}) {
    const errors = [];
    if (state.completed) errors.push({code:'campaign-finished',tab:'stats'});
    if (!['a','b','base'].includes(state.draft.eventChoice) || !state.event || !eventPlan) errors.push({code:'event-required',tab:'decisions'});
    const projects = draftProjects(state,errors,eventPlan);
    const project = projects[0] || null;
    const finance = buildFinance(state,projects,eventPlan,errors);
    const signature = JSON.stringify([state.attemptId,state.year,state.revision,state.event?.id || state.event?.eventId,state.draft,
      ...(isV4(state)?[projects.map(row=>[row.id,row.openingYear,row.projection?.served,row.projection?.districts])]:
        [project?.id,project?.openingYear,project?.projection?.served,project?.projection?.districts]),finance.cashEnd,finance.debtEnd,finance.reserveEnd,
      finance.operations.map(row=>[row.id,row.amount])]);
    return {ok:!errors.length,errors,finance,project,signature,...(isV4(state)?{projects}:{})};
  }

  function previewMeasure(state, measureId, siteId, {eventPlan} = {}) {
    if (!isV4(state)) return quote({...state,draft:{...state.draft,measureId,siteId}},{eventPlan});
    if (!Array.isArray(state.draft.measures)) return quote(state,{eventPlan});
    const current = state.draft.measures.find(row=>row.measureId===measureId);
    const other = state.draft.measures.filter(row=>row.measureId!==measureId);
    const draft = {...state.draft,measures:[...other,{measureId,siteId,promise:current?.promise??null}]};
    const baseline = quote({...state,draft:{...state.draft,measures:other}},{eventPlan});
    const preview = quote({...state,draft},{eventPlan});
    const project = preview.projects.find(row=>row.draftMeasureId===measureId) || null;
    const spending = finance => project ? sum(finance.operations.filter(row=>row.direction==='out' &&
      row.id.startsWith(project.id+':')).map(row=>row.amount)) : 0;
    const kpi = project?.measureId==='school-campus' ?
      territoryProjection(state,project,preview.projects.filter(row=>row!==project),eventPlan) : project?.projection ?? null;
    return {...preview,project,marginal:{cashEnd:preview.finance.cashEnd,cashChange:preview.finance.cashEnd-baseline.finance.cashEnd,
      spentNow:spending(preview.finance)-spending(baseline.finance),kpi}};
  }

  function previousSchoolState(state, year, municipalities) {
    const native = municipalities.suburb, start = state.population.initial.access.suburb;
    const staffedFactor = .8+.2*native.labour/Math.max(1,start.labour);
    const map = applicableSchoolData(state,native.school,staffedFactor);
    const localProjects = state.projects.filter(p => p.districtId === 'suburb' && projectPhase(p,year) === 'open');
    const shift = localProjects.some(p=>p.measureId==='second-shift');
    const shiftPlaces = shift ? G.Population.OUTPUTS['second-shift'].schoolStaff : 0;
    const additional = isV4(state) ? state.projects.filter(project=>projectPhase(project,year)==='open' &&
      project.targets?.suburb && !['school-campus','second-shift','school-bus'].includes(project.measureId)) : [];
    const schoolSupport = field => money(sum(additional.map(project=>
      (populationOutputs(project)[field] || 0) * project.targets.suburb * project.outputFactor)));
    const schools = map.baselineSchools.map(row => row.id !== 'old-school' ? row : {
      ...row,physicalSeats:row.physicalSeats+shiftPlaces+schoolSupport('school'),
      staffedSeats:row.staffedSeats+shiftPlaces+schoolSupport('schoolStaff')});
    const campus = state.projects.find(p=>p.measureId==='school-campus' && (year>=p.openingYear || p.paidYears.length));
    if (campus) schools.push({...map.newSchool,node:map.sites.find(site=>site.id===campus.siteId).node,
      staffedSeats:projectPhase(campus,year)==='open'?map.newSchool.staffedSeats:0,status:projectPhase(campus,year)});
    const modern = isV4(state);
    const local = schoolAllocation(map,{closedRoads:state.closedRoads,schools,byLocation:modern});
    const remaining = Object.fromEntries(Object.entries(local.demandByZone).map(([z,n])=>[z,n-local.servedByZone[z]]));
    const busReach = localProjects.some(p=>p.measureId==='school-bus') ? G.Population.OUTPUTS['school-bus'].schoolReach : 0;
    const extraReach = sum(additional.map(project=>(populationOutputs(project).schoolReach || 0)*project.targets.suburb*project.outputFactor));
    let routeDemand = Math.min(local.unserved,Math.floor(local.demand*clamp(busReach+extraReach,0,1)));
    const routes = [];
    const destinations = Object.values(municipalities).filter(m=>m.id!=='suburb' && G.Population.travelMinutes('suburb',m.id)<=60)
      .sort((a,b)=>G.Population.travelMinutes('suburb',a.id)-G.Population.travelMinutes('suburb',b.id) || a.id.localeCompare(b.id));
    const zoneIds = modern ? map.zones.map(zone=>zone.id) : Object.keys(remaining).sort();
    // Allocate the available places proportionally to unmet demand. Location
    // orders the fractional remainders independently of a zone's text key.
    const busCapacity = Math.min(routeDemand,sum(destinations.map(row=>row.schoolSpare)));
    const shares = modern ? G.Population.allocate(busCapacity,zoneIds.map(id=>remaining[id])) : null;
    const quotas = shares ? Object.fromEntries(zoneIds.map((id,index)=>[id,shares[index]])) : remaining;
    for (const destination of destinations) {
      if (!routeDemand) break;
      let spare = Math.min(routeDemand,destination.schoolSpare);
      const allocation = modern ? G.Population.allocate(spare,zoneIds.map(id=>quotas[id])) : null;
      for (const [index,zoneId] of zoneIds.entries()) {
        const pupils = allocation ? allocation[index] : Math.min(spare,quotas[zoneId]);
        if (!pupils) continue;
        routes.push({zoneId,from:'suburb',to:destination.id,pupils,minutes:G.Population.travelMinutes('suburb',destination.id)});
        destination.schoolSpare -= pupils;
        quotas[zoneId] -= pupils;
        if (modern) remaining[zoneId] -= pupils;
        routeDemand -= pupils;
        spare -= pupils;
      }
    }
    const transported = sum(routes.map(r=>r.pupils));
    const served = local.served+transported;
    const allServedByZone = Object.fromEntries(zoneIds.map(id=>[id,local.demandByZone[id]-remaining[id]]));
    let travel;
    if (modern) {
      const pupilMinutesByZone = Object.fromEntries(zoneIds.map(id=>[id,0]));
      for (const row of [...local.assignments,...routes]) pupilMinutesByZone[row.zoneId] += row.pupils*row.minutes;
      const pupilMinutesOneWay = objectSum(pupilMinutesByZone);
      const coverage = zoneIds.map(id=>percent(allServedByZone[id],local.demandByZone[id])).filter(value=>value!==null);
      travel = {pupilMinutesOneWay,pupilMinutesByZone,meanTripMinutesServed:served?cents(pupilMinutesOneWay/served):null,
        lowestZoneCoveragePct:coverage.length?cents(Math.min(...coverage)):null};
    }
    return {...local,transported,localServed:local.served,served,unserved:local.demand-served,coveragePct:percent(served,local.demand),routes,
      allServedByZone,...(travel?{travel}:{}),facilities:schools.map(school=>({...school,served:local.servedBySchool[school.id]})),closedRoads:[...state.closedRoads]};
  }

  function kpi(served,demand) {return {served,demand,value:percent(served,demand)};}

  function calculateStats(state,groups,reasons,eventOutcomes,year=state.year) {
    const native = clone(state.population.derived.municipalities);
    const school = previousSchoolState(state,year,native);
    const districts = {};
    for (const [id,m] of Object.entries(native)) {
      const schoolCount = id === 'suburb' ? school.served : money(m.school*m.schoolAccess);
      districts[id] = {id,districtId:id,population:m.population,kpis:{
        school:kpi(schoolCount,m.school),
        health:kpi(money(m.healthAccess*m.health),m.health),
        childcare:kpi(money(m.childcareAccess*m.childcare),m.childcare),
        housing:kpi(Math.min(m.population,money(m.housingCapacity)),m.population),
        employment:kpi(m.employed,m.labour),
        digital:kpi(money(m.digitalAccess*m.population),m.population),
        flood:kpi(money(m.floodProtection*m.population),m.population)
      },staffedSchoolPlaces:id==='suburb' ? sum(school.facilities.map(f=>f.staffedSeats)) : Math.max(0,money(m.school*m.schoolAccess)-m.schoolTravel)+m.schoolSpare,
      schoolSpare:id==='suburb' ? sum(school.facilities.map(f=>Math.max(0,Math.min(f.physicalSeats,f.staffedSeats)-f.served))) : m.schoolSpare};
    }
    const places = Object.values(districts);
    const kpis = Object.fromEntries(Object.keys(places[0].kpis).map(key=>[key,kpi(sum(places.map(p=>p.kpis[key].served)),sum(places.map(p=>p.kpis[key].demand)))]));
    const population = sum(places.map(row=>row.population));
    const support = aggregateSupport(groups);
    const development = cents(40+(serviceIndex(kpis)-serviceIndex(state?.initialStats?.kpis || kpis))*.8);
    return {year,population,districts,kpis,groups,groupReasons:reasons,support,development,school,eventOutcomes};
  }

  function aggregateSupport(groups) {
    return cents(sum(Object.entries(GROUP_WEIGHTS).map(([id,weight]) => groups[id]*weight/100)));
  }

  const SOCIAL_METRICS = Object.freeze({
    families:{school:.13,childcare:.11,housing:.08}, seniors:{health:.22,digital:.05},
    business:{employment:.21,digital:.13}, youth:{employment:.15,school:.07,digital:.10},
    publicStaff:{health:.08,school:.08,digital:.12}, activists:{flood:.16,housing:.06}
  });
  const TAX_REACTIONS = [.11,.06,.70,.22,.08,.14];

  function taxSupportEffects(mode) {
    const direction = validTaxRate(mode) ? (TAX_RATE_LIMITS.default-mode)/(TAX_RATE_LIMITS.max-TAX_RATE_LIMITS.default) :
      mode==='high'?-1:mode==='low'?1:0;
    return Object.fromEntries(Object.keys(GROUP_WEIGHTS).map((id,index)=>[id,direction*TAX_REACTIONS[index]]));
  }

  function reactions(state, nextStats, eventPlan, projects, previousGroups = state.stats.structuralGroups ?? state.stats.groups) {
    const taxes=taxSupportEffects(isV4(state)?state.draft.taxRate:state.draft.taxMode);
    const policy = isV4(state) ? G.V4Campaign.satisfactionEffects(projects,nextStats.year) : null;
    const population = Math.max(1,nextStats.population);
    const eventEffect = sum(Object.entries(eventPlan?.supportByDistrict || {}).map(([id,bps]) =>
      bps/100*(nextStats.districts[id]?.population || 0)/population));
    const groups = {}, structuralGroups = {}, reasons = {};
    Object.keys(GROUP_WEIGHTS).forEach(id => {
      const changes = Object.entries(SOCIAL_METRICS[id]).map(([metric,weight]) => ({
        source:metric,delta:weight*((nextStats.kpis[metric].value || 0)-(state.stats.kpis[metric].value || 0))
      }));
      changes.push({source:'tax',delta:taxes[id]});
      if (policy) {
        changes.push({source:'policy',delta:policy[id]});
        // A situation's response adds feedback in its operating year. The next
        // year starts with support earned through continuing policy and access.
        structuralGroups[id] = cents(clamp(previousGroups[id]+sum(changes.map(row=>row.delta))));
        groups[id] = cents(clamp(structuralGroups[id]+eventEffect));
      } else {
        groups[id] = cents(clamp(previousGroups[id]+sum([...changes.map(row=>row.delta),eventEffect])));
      }
      changes.push({source:'event',delta:eventEffect});
      reasons[id] = changes.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))[0];
      if (!reasons[id].delta) reasons[id] = {source:'stable',delta:0};
    });
    return {groups,reasons,...(policy?{structuralGroups,structuralSupport:aggregateSupport(structuralGroups)}:{})};
  }

  function structuralHistory(state) {
    let previous = state.initialStats, previousGroups = previous?.groups;
    return (state.history ?? []).map(row => {
      let groups = row.stats.structuralGroups;
      const taxRate = row.finance?.taxRate;
      if (!groups && previousGroups && previous?.kpis && row.stats.kpis && validTaxRate(taxRate) && Array.isArray(row.projects)) {
        // Saved turns contain the confirmed tax rate, KPI observations and
        // project snapshots. Historic site factors come from the fixed catalogue.
        const projects = row.projects.map(project => ({
          ...project, outputFactor:project.measureId==='school-campus' ? 1 : G.V4Campaign.site(project.siteId)?.output ?? 1
        }));
        const opening = {rulesVersion:V4_RULES_VERSION,stats:previous,draft:{taxRate}};
        groups = reactions(opening,row.stats,null,projects,previousGroups).structuralGroups;
      }
      previous = row.stats;
      previousGroups = groups ?? row.stats.groups;
      return {year:row.year,groups:previousGroups,
        support:row.stats.structuralSupport ?? (groups ? aggregateSupport(groups) : row.stats.support)};
    });
  }

  function populationOutputs(project) {
    return project.serviceEffect?.outputs || G.Population.outputsFor(project.serviceEffect?.measureId || project.measureId);
  }

  function peopleProject(project, year, modern) {
    // The local school graph owns school capacity and route matching. The
    // population engine still handles the region's other services, jobs and ageing.
    const outputs = {...populationOutputs(project)};
    if (modern?project.targets.suburb:project.districtId==='suburb') for (const key of SCHOOL_OUTPUTS) delete outputs[key];
    const phase = projectPhase(project,year);
    const status = phase==='open' ? 'active' : phase==='closed' ? 'completed' : 'delivery';
    return {id:project.id,actionId:project.measureId,kind:project.kind,status,activatedTurn:project.openingYear-FIRST_YEAR+1,
      completedTurn:project.endYear-FIRST_YEAR+2,people:{outputs,factor:project.outputFactor,targets:project.targets}};
  }

  function populationPortfolio(projects,year,modern) {
    return projects.flatMap(project=>{
      const normal = peopleProject(project,year,modern);
      if (!modern || !project.targets.suburb) return [normal];
      const targets = Object.fromEntries(Object.entries(project.targets).filter(([id])=>id!=='suburb'));
      if (!Object.keys(targets).length) return [normal];
      const outputs = Object.fromEntries(Object.entries(populationOutputs(project)).filter(([key])=>SCHOOL_OUTPUTS.includes(key)));
      if (!Object.keys(outputs).length) return [normal];
      return [normal,{...normal,id:normal.id+':schools',people:{...normal.people,outputs,targets}}];
    });
  }

  function territoryProjection(state,project,additional = [],eventPlan) {
    const modern = isV4(state);
    const output = modern ? populationOutputs(project) : {};
    const metric = Object.entries(OUTPUT_METRICS).find(([key])=>Object.hasOwn(output,key))?.[1] || SITE_METRICS[project.districtId];
    if (!metric) return null;
    const year = modern && project.action==='renew' ? project.endYear-project.durationYears+1 : project.openingYear;
    const baseProjects = additional.reduce((all,draft)=>mergeProject(all,draft,state.year),state.projects);
    const projects = populationPortfolio(baseProjects,year,modern);
    const model = {scenarioId:state.scenarioId, turnIndex:year-FIRST_YEAR, population:state.population, finance:{portfolio:projects}};
    const before = G.Population.derive(model);
    const afterProjects = modern ? mergeProject(baseProjects,project,state.year) : [...baseProjects,project];
    const combined = populationPortfolio(afterProjects,year,modern);
    const after = G.Population.derive({...model,finance:{portfolio:combined}});
    function indicator(row) {
      if (metric === 'employment') return kpi(row.employed,row.labour);
      if (metric === 'flood') return kpi(money(row.floodProtection*row.population),row.population);
      if (metric === 'digital') return kpi(money(row.digitalAccess*row.population),row.population);
      if (metric === 'childcare') return kpi(money(row.childcareAccess*row.childcare),row.childcare);
      if (metric === 'housing') return kpi(Math.min(row.population,money(row.housingCapacity)),row.population);
      if (metric === 'school') return kpi(money(row.schoolAccess*row.school),row.school);
      return kpi(money(row.healthAccess*row.health),row.health);
    }
    const closedRoads = modern ? Object.entries(updatedRoads(state,eventPlan).roadExpiry)
      .filter(([,throughYear])=>throughYear>=year).map(([id])=>id).sort() : state.closedRoads;
    const beforeSchool = metric==='school' && project.targets.suburb ?
      previousSchoolState({...state,closedRoads,projects:baseProjects},year,clone(before.municipalities)) : null;
    const afterSchool = beforeSchool ?
      previousSchoolState({...state,closedRoads,projects:afterProjects},year,clone(after.municipalities)) : null;
    const districts = Object.keys(project.targets).map(id => {
      const a = id==='suburb' && beforeSchool?kpi(beforeSchool.served,beforeSchool.demand):indicator(before.municipalities[id]);
      const b = id==='suburb' && afterSchool?kpi(afterSchool.served,afterSchool.demand):indicator(after.municipalities[id]);
      const travel = id==='suburb' && beforeSchool?.travel ? {before:beforeSchool.travel,after:afterSchool.travel} : null;
      return {districtId:id,before:a,after:b,servedChange:b.served-a.served,...(travel?{schoolTravel:travel}:{})};
    });
    return {districts,metric,firstServiceYear:year,served:sum(districts.map(d=>d.after.served)),
      demand:sum(districts.map(d=>d.after.demand)),servedChange:sum(districts.map(d=>d.servedChange)),
      ...(modern?{closedRoads}:{})};
  }

  function updatedRoads(state,eventPlan) {
    const known = new Set(state.schoolMap.roads.map(road => road.id));
    const changes = (eventPlan?.roadChanges || []).filter(row => known.has(row.id) && integer(row.throughYear) && row.throughYear >= state.year);
    const flags = Object.fromEntries(Object.entries(state.roadExpiry || {}).filter(([,year])=>year>=state.year));
    for (const row of changes) {
      if (row.open) delete flags[row.id];
      else flags[row.id] = row.throughYear;
    }
    return {roadExpiry:flags,closedRoads:Object.keys(flags).sort()};
  }

  function advanceProjection(state,finance,eventPlan,openingGroups) {
    const year = state.year, population = clone(state.population);
    const projects = finance.projects.map(p=>({...p,status:projectPhase(p,year),paidYears:
      projectPhase(p,year)==='open' ? [...p.paidYears,year] : p.paidYears}));
    const routes = updatedRoads(state,eventPlan);
    const adapter = {population,scenarioId:state.scenarioId,turnIndex:year-FIRST_YEAR,recordLifeExpectancy:isV4(state),
      finance:{portfolio:populationPortfolio(projects,year,isV4(state))}};
    const populationLedger = G.Population.advanceYear(adapter);
    const outcomes = eventPlan?.outcomes || [];
    const updated = {...state,projects,population,...routes};
    const preliminary = calculateStats(updated,state.stats.groups,{},outcomes);
    const {groups,reasons,...structural} = reactions(state,preliminary,eventPlan,projects,openingGroups);
    const stats = {...preliminary,...structural,groups,groupReasons:reasons,support:aggregateSupport(groups)};
    const schoolCount = stats.kpis.school;
    population.derived.schoolAccess = schoolCount.demand ? schoolCount.served/schoolCount.demand : 0;
    for (const [id,district] of Object.entries(stats.districts)) {
      const metric = district.kpis.school, observed = population.derived.municipalities[id];
      observed.schoolAccess = metric.demand ? metric.served/metric.demand : 0;
      observed.schoolSpare = district.schoolSpare;
      observed.unmetSchool = metric.demand - metric.served;
    }
    population.derived.municipalities.suburb.schoolTravel = stats.school.transported;
    populationLedger.after = clone(population.derived);
    const fiscal = {...state.finance,cash:finance.cashEnd,reserve:finance.reserveEnd,debt:finance.debtEnd,loans:finance.loans};
    if (isV4(state)) fiscal.investments = finance.investments;
    const result = {projects,population,stats,...routes,finance:fiscal};
    if (isV4(state)) result.campaignKpis = G.V4Campaign.advance(state,{...state,...result},{taxIndex:state.draft.taxRate,eventPlan});
    return result;
  }

  function checkPromises(state,selected,actual,year) {
    const modern = isV4(state);
    const result = state.promises.map(p=>({...p}));
    const planned = modern ? state.draft.measures.map(row=>[row.promise,selected.find(p=>p.draftMeasureId===row.measureId)]) :
      [[state.draft.promise,selected[0]]];
    for (const [promise,project] of planned) {
      if (!promise || !integer(promise.dueYear) || promise.dueYear<year) continue;
      const {type,dueYear} = promise;
      if ((type==='open' || type==='operate') && project) {
        result.push({id:'promise:'+year+(modern?':'+project.id:''),type,dueYear,projectId:project.id,status:'pending',
          ...(modern?{approvalYear:year}:{})});
      }
      if (type==='reserve' && integer(promise.amount) && promise.amount>0)
        result.push({id:'promise:'+year+(modern?':reserve':''),type,dueYear,amount:promise.amount,status:'pending'});
    }
    for (const promise of result) {
      if (promise.status!=='pending' || promise.dueYear>year) continue;
      const p = actual.projects.find(row=>row.id===promise.projectId);
      if (promise.type==='open') promise.status=p?.paidYears.some(paid=>paid<=promise.dueYear &&
        (!modern || paid>=promise.approvalYear))?'kept':'missed';
      if (promise.type==='operate') promise.status=p?.paidYears.includes(promise.dueYear)?'kept':'missed';
      if (promise.type==='reserve') promise.status=actual.finance.reserve>=promise.amount?'kept':'missed';
    }
    return result;
  }

  function projectSnapshot(project, modern) {
    const {id, status, approvedYear, openingYear, endYear, paidYears, siteId, labels, districtId, measureId, annualOpex} = project;
    return {id, status, approvedYear, openingYear, endYear, paidYears:[...paidYears], siteId, labels, districtId, measureId, annualOpex,
      ...(modern?{artFamily:project.artFamily,capex:project.capex,sector:project.sector,targets:project.targets}:{})};
  }

  function financeRecord(projection) {
    const {loans,projects,...report} = projection;
    return report;
  }

  function eventImpactContext(state,reference=false) {
    if (!isV4(state)) return {};
    const stats = reference ? state.baseline?.stats : state.stats;
    const coverage = stats?.districts?.river?.kpis?.flood;
    // The opening world is the last confirmed year, never a project's draft.
    const floodCoverageBps = coverage?.demand > 0
      ? Math.round(10000 * clamp(coverage.served / coverage.demand,0,1)) : 0;
    return {balance:{floodCoverageBps}};
  }

  function settleEvent(state,eventPlan,approvedOperations,settledEventPlan) {
    if (!G.V3Events?.year || !eventPlan.rows?.some(row => row.eventId === state.event.eventId)) return eventPlan;
    const ledger = [...state.history.map(row=>row.event),state.event];
    const picks = Object.fromEntries(ledger.map(row=>[row.year,row.choice || state.draft.eventChoice]));
    const settledSpend = Object.fromEntries(approvedOperations.filter(row=>row.direction==='out').map(row=>[row.id,row.amount]));
    const executionHistory = state.history.flatMap(row=>row.stats.eventOutcomes);
    const calculation = G.V3Events.year({attemptId:state.attemptId,year:state.year,ledger,picks,settledSpend,
      executionHistory,...eventImpactContext(state)});
    const known = new Set(eventPlan.rows.map(row=>row.id));
    const grants = calculation.rows.filter(row=>row.type==='grant' && row.direction==='in' && !known.has(row.id));
    if (settledEventPlan) {
      const offered = settledEventPlan.rows.filter(row=>row.type==='grant' && !known.has(row.id));
      if (offered.length!==grants.length || offered.some(row=>!grants.some(verified=>verified.id===row.id && verified.amount===row.amount)))
        throw new Error('governor-v3/event-receipt-mismatch');
    }
    return grants.length ? {...eventPlan,rows:[...eventPlan.rows,...grants]} : eventPlan;
  }

  function commit(state,{expectedRevision,signature,eventPlan,settledEventPlan,baselineEventPlan = {}} = {}) {
    if (state.completed || expectedRevision !== state.revision) throw new Error('governor-v3/stale-year');
    const review = quote(state,{eventPlan});
    if (!review.ok) throw new Error('governor-v3/invalid-plan');
    if (review.signature !== signature) throw new Error('governor-v3/quote-changed');
    const year = state.year;
    const modern = isV4(state);
    const selected = modern ? review.projects : review.project?[review.project]:[];
    const referenceDraft = {...emptyDraft('moderate',state.rulesVersion),...(!modern?{measureId:'defer'}:{}),eventChoice:'base'};
    const referenceState = {...state,...state.baseline,draft:referenceDraft,projects:[]};
    const baselineFinance = buildFinance(referenceState,[],baselineEventPlan,[]);
    const reference = advanceProjection(referenceState,baselineFinance,baselineEventPlan);
    const settled = settleEvent(state,eventPlan,review.finance.operations,settledEventPlan);
    const fiscalResult = settled === eventPlan ? review.finance : buildFinance(state,selected,settled,[]);
    const openingGroups = modern && !state.stats.structuralGroups && state.history.length
      ? structuralHistory(state).at(-1).groups : undefined;
    const actual = advanceProjection(state,fiscalResult,settled,openingGroups);
    const promises = checkPromises(state,selected,actual,year);
    const measures = selected.map(project=>({id:project.id,measureId:project.measureId,districtId:project.districtId,
      siteId:project.siteId,labels:project.labels,action:project.action,openingYear:project.openingYear,annualOpex:project.annualOpex,
      deliveryWindowStart:project.action==='renew' ? project.endYear-project.durationYears+1 : project.openingYear,
      deliveryWindowEnd:project.endYear, holdYears:project.durationYears,
      ...(modern?{costNow:project.costNow,draftMeasureId:project.draftMeasureId,capex:project.capex}:{})}));
    const history = [...state.history,{year,revision:state.revision,
      ...(modern?{measures,campaignKpis:actual.campaignKpis,referenceCampaignKpis:reference.campaignKpis}:{measure:measures[0]||null}),
      event:{...state.event,choice:state.draft.eventChoice},projects:actual.projects.map(project=>projectSnapshot(project,modern)),
      finance:{...financeRecord(fiscalResult),newMeasureCost:sum(selected.map(project=>project.costNow))},stats:actual.stats,reference:reference.stats}];
    const completed = year === LAST_YEAR;
    return {...state,...actual,promises,history,baseline:{finance:reference.finance,population:reference.population,stats:reference.stats,
      closedRoads:reference.closedRoads,roadExpiry:reference.roadExpiry,...(modern?{campaignKpis:reference.campaignKpis}:{})},completed,year:completed ? year : year+1,
      lastClosedYear:year,revision:state.revision+1,event:null,draft:emptyDraft(modern?state.draft.taxRate:state.draft.taxMode,state.rulesVersion)};
  }

  function fundedLoan(finance, year) {
    const need = -finance.cashEnd;
    let best = null;
    for (let termYears=1;termYears<=10;termYears++) {
      const limit = best ? best.principal-1 : finance.loanHeadroom;
      for (let principal=need;principal<=limit;) {
        const schedule = loanSchedule(principal,finance.annualPercent,termYears,year);
        let liquidity = principal;
        let shortfall = 0;
        let lastPaymentShortfall = 0;
        for (let i=0;i<termYears;i++) {
          const {cash,debtExpense} = finance.futureRows[i];
          const payment = schedule[i].total;
          liquidity -= payment;
          lastPaymentShortfall = paymentShortfall(cash+liquidity,debtExpense+payment);
          shortfall = Math.max(shortfall,lastPaymentShortfall);
        }
        if (!shortfall) {
          best = {principal,termYears};
          break;
        }
        // At maturity only interest remains in the cash difference. Raising
        // the principal cannot improve that year's balance.
        if (lastPaymentShortfall) break;
        // Remainder units go to the earliest installments. Increasing the
        // principal cannot lower repayments already made in any future year,
        // so each extra million can improve any closing balance by at most one.
        principal += shortfall;
      }
    }
    return best;
  }

  function handoverStatus(state,{eventPlan} = {}) {
    if (state.completed || !state.event || !G.V3Events?.year) return {available:false};
    const ledger = [...state.history.map(row=>row.event),state.event];
    const picks = Object.fromEntries(ledger.map(row=>[row.year,row.choice || 'base']));
    const params = {attemptId:state.attemptId,year:state.year,ledger,executionHistory:state.history.flatMap(row=>row.stats.eventOutcomes),
      verifiedBaseExpenses:verifiedBaseExpenses(state),...eventImpactContext(state)};
    const planFor = choice => G.V3Events.year({...params,picks:{...picks,[state.year]:choice}});
    const choices = ['base','a','b'];
    if (choices.includes(state.draft.eventChoice) && quote(state,{eventPlan:eventPlan??planFor(state.draft.eventChoice)}).ok)
      return {available:false};
    const modern = isV4(state);
    const taxRate = modern ? TAX_RATE_LIMITS.max : TAX_MODES.high;
    const draft = {...emptyDraft('high',state.rulesVersion),reserveDraw:state.finance.reserve,
      ...(modern?{taxRate}:{measureId:'defer'})};
    const deficits = [];
    let recovery = null;
    for (const eventChoice of choices) {
      const plan = planFor(eventChoice);
      const candidate = {...state,draft:{...draft,eventChoice}};
      const basic = buildFinance(candidate,[],plan,[],state.year+10);
      const summary = (finance,loan) => ({eventChoice,taxRate,reserveDraw:draft.reserveDraw,loan,
        closingCash:finance.cashEnd,firstShortfall:finance.firstShortfall??null});
      if (basic.cashEnd>=0) return {available:false,recovery:summary(basic,null)};
      deficits.push(-basic.cashEnd);
      const loan = fundedLoan(basic,state.year);
      if (!loan || (recovery && (loan.principal>recovery.loan.principal ||
          (loan.principal===recovery.loan.principal && loan.termYears>=recovery.loan.termYears)))) continue;
      const reviewed = quote({...candidate,draft:{...candidate.draft,loan}},{eventPlan:plan});
      if (reviewed.ok) recovery = summary(reviewed.finance,loan);
    }
    if (recovery) return {available:false,recovery};
    return {available:true,year:state.year,code:'no-funded-legal-plan',shortfall:Math.min(...deficits)};
  }

  function handover(state,{expectedRevision,eventPlan} = {}) {
    if (state.completed || expectedRevision!==state.revision) throw new Error('governor-v3/stale-year');
    const reason = handoverStatus(state,{eventPlan});
    if (!reason.available) throw new Error('governor-v3/handover-unavailable');
    return {...state,completed:true,handover:reason,revision:state.revision+1};
  }

  const serviceKeys = ['school','health','childcare','housing','employment','digital'];
  function serviceIndex(kpis) {
    return sum(serviceKeys.map(key=>kpis?.[key]?.value || 0))/serviceKeys.length;
  }
  const criteria = [
    ['mandate',.75,L('Общественный мандат','Public mandate','公众信任')],
    ['delivery',.75,L('Качество исполнения','Quality of delivery','执行质量')],
    ['territories',2,L('Многолетний результат услуг','Long-run service results','多年服务成果')],
    ['finance',1,L('Финансовая устойчивость','Financial sustainability','财政稳健')],
    ['promises',.5,L('Проверяемые обязательства','Verifiable commitments','可核查承诺')]
  ];

  function assess(state) {
    if (isV4(state)) return G.V4Campaign.score(state);
    const rows = state.history, count = rows.length, completionRatio = count/20;
    const last = rows.at(-1);
    const {support,development,districts} = state.initialStats;
    const inUnit = n=>clamp(n,0,1);
    const districtIds = Object.keys(districts);
    const gains = Object.fromEntries(districtIds.map(id=>[id,0]));
    let preservation=0,mandateGain=0;
    rows.forEach((row,i)=>{
      const weight = .65/count + (i>=count-5 ? .35/Math.min(5,count) : 0);
      for (const [key,start] of [['support',support],['development',development]]) {
        preservation += weight*.5*inUnit((row.stats[key]-start*.5)/Math.max(1,start*.5));
        mandateGain += weight*.5*inUnit((row.stats[key]-row.reference[key])/Math.max(5,start*.2));
      }
      for (const id of districtIds) gains[id]+=weight*(serviceIndex(row.stats.districts[id].kpis)-serviceIndex(row.reference.districts[id].kpis));
    });
    const serviceGain = objectSum(gains)/districtIds.length;
    const serviceTarget = Math.max(2.5,.35*(100-districtIds.reduce((total,id)=>total+serviceIndex(districts[id].kpis),0)/districtIds.length));
    const equityFactor = .75+.25*inUnit(1+Math.min(0,...Object.values(gains))/10);
    const programmes = rows.filter(row=>row.measure);
    const delivered = programmes.map(row=>{
      const p = state.projects.find(p=>p.id===row.measure.id);
      const years = p.paidYears.filter(year=>year>=row.measure.deliveryWindowStart && year<=row.measure.deliveryWindowEnd);
      return inUnit(years.length/Math.min(3,row.measure.holdYears));
    });
    const debtHeadroom = inUnit((state.finance.debtLimit-state.finance.debt)/Math.max(1,state.finance.debtLimit-state.finance.initialDebt));
    const covered = last?.finance.futureRows.slice(0,3).filter(r=>r.cash+state.finance.reserve>=0).length || 0;
    const accountable = state.promises.filter(row=>row.dueYear<=LAST_YEAR);
    const kept = accountable.filter(row=>row.status==='kept').length;
    const raw = [(preservation+mandateGain)/2,delivered.length?sum(delivered)/delivered.length:0,
      inUnit(serviceGain/serviceTarget)*equityFactor,state.handover?0:(debtHeadroom+covered/3)/2,kept/Math.max(3,accountable.length)].map(inUnit);
    const weighted = raw.map((value,i)=>value*criteria[i][1]*completionRatio);
    const exact = sum(weighted), cap = state.handover ? 2.5 : 5;
    const multiplier = exact>cap ? cap/exact : 1;
    const centValues = weighted.map(value=>value*multiplier*100);
    const points = centValues.map(value=>Math.floor(value+1e-9));
    const total = Math.round(sum(centValues));
    const order = centValues.map((_,i)=>i).sort((a,b)=>(centValues[b]-points[b])-(centValues[a]-points[a]) || a-b);
    for (let i=0, rest=total-sum(points); i<rest;i++) points[order[i]]++;
    return {version:RULES_VERSION,points:total/100,maxPoints:5,completionRatio,
      comparison:{kind:'same-events-base-response',serviceGain,serviceTarget,equityFactor,districtGains:gains},
      handoverCapApplied:multiplier<1,capMultiplier:multiplier,uncappedPoints:cents(exact),
      criteria:criteria.map(([id,maxPoints,title],i)=>({id,title,label:title,points:points[i]/100,maxPoints,rawPoints:raw[i],
        detail:L(`Закрытых лет ${count}/20, коэффициент ${cents(raw[i])}.`,
          `Years confirmed ${count}/20, factor ${cents(raw[i])}.`,`已结算${count}/20年，系数${cents(raw[i])}。`)}))};
  }

  G.V3Rules = {RULES_VERSION,V4_RULES_VERSION,FIRST_YEAR,LAST_YEAR,TAX_MODES,TAX_RATE_LIMITS,INVESTMENT_TERMS,
    GROUP_WEIGHTS,SECTOR_SHARES,DISTRICTS,MEASURES,SITES,create,emptyDraft,availableMeasures,sitesFor,projectPhase,loanSchedule,
    investmentQuote,reconcile,aggregateSupport,taxSupportEffects,structuralHistory,baseOperations,verifiedBaseExpenses,schoolAllocation,schoolComparison,schoolQuote,
    quote,previewMeasure,commit,eventImpactContext,handoverStatus,handover,assess};
})(globalThis);
