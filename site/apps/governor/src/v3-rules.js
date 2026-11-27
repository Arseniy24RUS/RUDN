/* Annual accounting and territory model for the versioned seminar-7 assignment. */
(function (root) {
  'use strict';

  const G = root.GovernorGame ||= {};
  const RULES_VERSION = 'governor-v3.1';
  const FIRST_YEAR = 2026;
  const LAST_YEAR = 2045;
  const TAX_MODES = Object.freeze({low: 88, moderate: 100, high: 112});
  const GROUP_WEIGHTS = Object.freeze({families: 25, seniors: 20, business: 20, youth: 15, publicStaff: 10, activists: 10});
  const SITE_METRICS = Object.freeze({north:'health', river:'flood', industrial:'employment', capital:'digital'});
  const SECTOR_SHARES = Object.freeze({education: 27, health: 25, transport: 12, economy: 9, social: 12, housingUtilities: 10, administration: 5});
  const EVENT_SECTORS = Object.freeze({edu:'education', health:'health', transport:'transport', utility:'housingUtilities', ecology:'housingUtilities', economy:'economy', social:'social', housing:'housingUtilities', public:'administration', budget:'administration'});
  const DISTRICTS = Object.freeze({
    suburb: {labels: {ru:'Новый берег', en:'New Bank', zh:'新岸'}, x:.80, y:.65},
    north: {labels: {ru:'Северные поселения', en:'Northern villages', zh:'北部村落'}, x:.45, y:.23},
    river: {labels: {ru:'Речной', en:'Riverside', zh:'河滨镇'}, x:.69, y:.42},
    industrial: {labels: {ru:'Заводской город', en:'Industrial city', zh:'工业城'}, x:.26, y:.52},
    capital: {labels: {ru:'Областной центр', en:'Regional centre', zh:'州中心'}, x:.57, y:.73}
  });
  const L = (ru, en, zh) => ({ru, en, zh});
  const clone = value => JSON.parse(JSON.stringify(value));
  const sum = values => values.reduce((total, value) => total + value, 0);
  const money = value => Math.round(value);
  const percent = (num, den) => den ? Math.min(100, 100*num/den) : null;
  const clamp = (value, a = 0, b = 100) => Math.max(a, Math.min(b, value));
  const cents = value => Math.round(value * 100) / 100;
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const objectSum = values => sum(Object.values(values));
  const pay = (id, year, direction, type, amount, sector = null) => ({id, year, direction, type, amount, sector});

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

  function schoolAllocation(map, {closedRoads = [], schools = map.baselineSchools} = {}) {
    const zones = [...map.zones].sort((a,b) => a.id.localeCompare(b.id));
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

  function schoolComparison(map, siteId, {year = map.decisionYear, closedRoads = [], school = map.newSchool} = {}) {
    const entry = map.sites.find(s => s.id === siteId);
    if (!entry) return null;
    const schools = [...map.baselineSchools, {...school, node:entry.node}];
    const baseline = schoolAllocation(map,{closedRoads});
    const active = schoolAllocation(map,{closedRoads,schools});
    const firstServiceYear = year + entry.paymentScheduleMillion.length;
    const capexMillion = objectSum(entry.capexMillion), annualOpexMillion = objectSum(entry.annualOpexMillion);
    const serviceYears = Math.max(0,map.horizonEndYear+1-firstServiceYear);
    return {id:siteId,site:entry,baseline,...active,firstServiceYear,capexMillion,annualOpexMillion,
      spendThrough2031Million:sum(entry.paymentScheduleMillion.slice(0,Math.max(0,map.horizonEndYear+1-year)))+annualOpexMillion*serviceYears,
      extraPupilYearsThrough2031:(active.served-baseline.served)*serviceYears,
      servedWithBridgeClosed:schoolAllocation(map,{closedRoads:[map.sensitivity.closedRoad],schools}).served};
  }

  function baseOperations(state) {
    const {year, finance} = state, demographic = G.Population?.fiscalFactors(state) || {mandatoryFactor:1};
    const mandatory = money(finance.base.mandatory * (1 + (year-FIRST_YEAR)*.008) * demographic.mandatoryFactor);
    const amounts = split(mandatory,Object.values(SECTOR_SHARES));
    return Object.keys(SECTOR_SHARES).map((sector,i) => pay(`base:${year}:${sector}`,year,'out','mandatory',amounts[i],sector));
  }

  function emptyDraft(taxMode = 'moderate') {
    return {eventChoice:null,measureId:null,siteId:null,districtId:null,taxMode,loan:null,
      reserveDraw:0,reserveContribution:0,sectorLimits:{},promise:null};
  }

  function create({attemptId, schoolMap}) {
    if (!attemptId || !schoolMap?.sites) throw new Error('governor-v3/missing-start-data');
    const scenario = G.DATA?.scenarios?.find(row => row.id === 'balanced');
    const opening = scenario?.finance || {openingTreasury:4.5,reserve:2.5,debt:6,debtLimit:16,debtRate:.07,
      ownTaxRevenue:35,nonTaxRevenue:3,equalizationGrant:2.5,mandatoryCosts:37.4};
    const population = G.Population.create('balanced'), debt = money(opening.debt*1000), annualPercent = cents(opening.debtRate*100);
    const start = {rulesVersion:RULES_VERSION,attemptId,scenarioId:'balanced',schoolMap,population,year:FIRST_YEAR,revision:0,completed:false,
      draft:emptyDraft(),event:null,projects:[],history:[],promises:[],closedRoads:[],
      finance:{cash:money(opening.openingTreasury*1000),reserve:money(opening.reserve*1000),debt,initialDebt:debt,debtLimit:money(opening.debtLimit*1000),
        annualPercent,base:{taxes:money(opening.ownTaxRevenue*1000),nonTax:money(opening.nonTaxRevenue*1000),
          grant:money(opening.equalizationGrant*1000),mandatory:money(opening.mandatoryCosts*1000)},
        loans:[{id:'opening-debt',issueYear:FIRST_YEAR-1,schedule:loanSchedule(debt,annualPercent,10,FIRST_YEAR-1)}]}};
    const groups = Object.fromEntries(Object.keys(GROUP_WEIGHTS).map(id => [id,58]));
    const initial = calculateStats(start,groups,{},[]);
    start.stats = initial;
    start.initialStats = clone(initial);
    // The common assignment uses no externally supplied seed. The baseline
    // receives the saved event sequence and applies the documented base option.
    start.baseline = {finance:clone(start.finance), population:clone(start.population), stats:clone(initial), closedRoads:[]};
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
    const choices = MEASURES.filter(m => !adopted.has(m.id));
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

  function applicableSchoolData(state, population, staffedFactor = 1) {
    const map = state.schoolMap;
    const baselineDemand = state.population.initial.access.suburb.school;
    const groups = {'7-10':[7,10],'11-17':[11,17]};
    const stock = state.population.municipalities.suburb;
    const weights = Object.keys(groups).map(age => map.zones.map(z => z.pupilsByAge[age]));
    const counts = Object.values(groups).map(([first,last]) => sum(stock.male.slice(first,last+1))+sum(stock.female.slice(first,last+1)));
    const coverage = counts[0]+counts[1] === population ? counts : split(population,counts);
    const distributed = weights.map((rows,i)=>split(coverage[i],rows));
    const baselineScale = baselineDemand / sum(weights.map(sum));
    const zones = map.zones.map((z,i) => ({...z,pupilsByAge:{'7-10':distributed[0][i],'11-17':distributed[1][i]}}));
    const baselineSchools = map.baselineSchools.map(s => ({...s,physicalSeats:money(s.physicalSeats*baselineScale),
      staffedSeats:money(s.staffedSeats*baselineScale*staffedFactor)}));
    const newSchool = {...map.newSchool,physicalSeats:money(map.newSchool.physicalSeats*baselineScale),
      staffedSeats:money(map.newSchool.staffedSeats*baselineScale*staffedFactor)};
    return {...map,zones,baselineSchools,newSchool};
  }

  function schoolQuote(state,siteId) {
    const local = state.population.derived.municipalities.suburb, original = state.population.initial.access.suburb;
    const adultsFactor = .80 + .20*(local.labour/Math.max(1,original.labour));
    return schoolComparison(applicableSchoolData(state,local.school,adultsFactor),siteId,{year:state.year,closedRoads:state.closedRoads});
  }

  function draftProject(state, errors) {
    const {draft,year} = state;
    const choice = availableMeasures(state).find(m => m.id === draft.measureId);
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
    if (chosen && state.projects.some(p => p.siteId === chosen)) {
      errors.push({code:'site-occupied',tab:'map'});
      return null;
    }
    const placement = SITES.find(s => s.id === chosen);
    const projection = choice.id === 'school-campus' ? schoolQuote(state,chosen) : null;
    const capex = projection?.capexMillion ?? choice.cost+(placement?.cost || 0);
    const annualOpex = projection?.annualOpexMillion ?? choice.annualOpex+(placement?.opex || 0);
    const lag = projection ? projection.firstServiceYear-year : choice.lag+(placement?.delay || 0);
    const schedule = projection ? projection.site.paymentScheduleMillion : split(capex,Array(Math.max(1,lag)).fill(1));
    const openingYear = year+lag;
    const project = {id:`project:${year}:${choice.id}`,measureId:choice.id, action:'new', facilityId:choice.id === 'school-campus' ? 'new-campus-01' : null,
      labels:choice.labels,sector:choice.sector,districtId:choice.districtId,siteId:chosen,kind:choice.kind,approvedYear:year,openingYear,endYear:openingYear+choice.years-1,
      capex,costNow:schedule[0],annualOpex,durationYears:choice.years,payments:schedule.map((amount,i)=>({year:year+i,amount})),
      targets:placement?.targets || {[choice.districtId]:1},outputFactor:placement?.output || 1, paidYears:[],changes:[]};
    return {...project,status:projectPhase(project,year),projection:projection || territoryProjection(state,project)};
  }

  function dueProject(project, year) {
    const rows = project.payments.filter(p => p.year === year).map(p => pay(project.id+':build:'+year,year,'out',project.kind === 'capital'?'capex':'start',p.amount,project.sector));
    if (projectPhase(project,year) === 'open') rows.push(pay(project.id+':operate:'+year,year,'out','operation',project.annualOpex,project.sector));
    return rows;
  }

  function mergeProject(projects, selected, year) {
    if (!selected) return projects;
    const {projection,...project} = selected;
    if (project.action === 'new') return [...projects,project];
    return projects.map(p => p.id !== project.id ? p : {...project,payments:[...p.payments,{year,amount:project.costNow}],
      changes:[...p.changes,{year,type:project.action,openingYear:project.openingYear,endYear:project.endYear}]});
  }

  function outstanding(finance, year) {
    return finance.loans.flatMap(loan => loan.schedule.filter(row => row.year >= year).map(row => ({loanId:loan.id,...row})))
      .sort((a,b) => a.year-b.year || a.loanId.localeCompare(b.loanId));
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
          const saved = Math.min(amount,original.amount);
          rows[position] = {...original,amount:original.amount-saved,savings:[...(original.savings || []),{id:row.id,amount:saved}]};
        }
      } else {
        rows.push({...row,amount,sector:row.direction === 'out' ? EVENT_SECTORS[row.sector] || row.sector || 'administration' : null});
      }
    }
    return rows;
  }

  function buildFinance(state, project, eventPlan, errors) {
    const {draft, finance, year} = state;
    const demo = G.Population.fiscalFactors(state);
    const taxBase = money(finance.base.taxes*(1+(year-FIRST_YEAR)*.004)*demo.taxFactor);
    const taxFactor = TAX_MODES[draft.taxMode];
    if (!taxFactor) errors.push({code:'invalid-tax',tab:'budget'});
    const taxes = money(taxBase*(taxFactor || 100)/100);
    const nonTax = money(finance.base.nonTax*(1+(year-FIRST_YEAR)*.003));
    const debtRows = outstanding(finance,year);
    const due = debtRows.filter(row => row.year === year);
    const principalDue = sum(due.map(row => row.principal));
    const annualPercent = finance.annualPercent;
    const loans = [...finance.loans], projects = mergeProject(state.projects,project,year);
    const operations = [
      pay('tax:'+year,year,'in','tax',taxes),
      pay('non-tax:'+year,year,'in','non-tax',nonTax),
      pay('grant:'+year,year,'in','equalization',finance.base.grant),
      ...baseOperations(state),
      ...projects.flatMap(p => dueProject(p,year)),
      ...due.flatMap(row => [pay(row.loanId+':interest:'+year,year,'out','interest',row.interest),
        pay(row.loanId+':principal:'+year,year,'out','principal',row.principal)])
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
    const result = reconcile({...finance,operations:afterEvents});
    const optional = afterEvents.filter(row => row.direction === 'out' && row.sector && ['start','capex','oneOff'].includes(row.type))
      .filter(row => project?.id && row.id.startsWith(project.id+':'));
    const mandatoryBySector = Object.fromEntries(Object.keys(SECTOR_SHARES).map(id => [id,(result.sectors[id]?.total || 0)-
      sum(optional.filter(row => row.sector === id).map(row => row.amount))]));
    const overLimit = Object.entries(draft.sectorLimits || {}).some(([key, ceiling]) => !Object.hasOwn(SECTOR_SHARES,key) ||
      !integer(ceiling) || ceiling < mandatoryBySector[key] || ceiling < (result.sectors[key]?.total || 0));
    if (overLimit) errors.push({code:'sector-limit',tab:'budget'});
    if (result.cashEnd<0) errors.push({code:'budget-deficit',tab:'budget',amount:-result.cashEnd});
    const debtSchedule = outstanding({loans},year+1);
    const horizon = Math.max(year+3,LAST_YEAR,...debtSchedule.map(row => row.year),
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
      cash += projectedIncome - projectedBase - debtExpense - projectExpense - eventExpense;
      futureRows.push({year:y, debtExpense,projectExpense,eventExpense, protectedExpenses:projectedBase, projectedIncome, cash});
    }
    if (draft.loan && futureRows.some(row=>row.year<=year+draft.loan.termYears && row.cash<0 && row.debtExpense>0)) errors.push({code:'loan-unfunded-schedule',tab:'budget'});
    return {...result,taxes,taxBase,taxDelta:taxes-taxBase,nonTax,annualPercent,
      loanHeadroom:Math.max(0,finance.debtLimit-finance.debt+principalDue),debtSchedule,futureRows,loans,projects,mandatoryBySector,
      interest:sum(due.map(row=>row.interest)),principalDue};
  }

  function quote(state, {eventPlan} = {}) {
    const errors = [];
    if (state.completed) errors.push({code:'campaign-finished',tab:'stats'});
    if (!['a','b','base'].includes(state.draft.eventChoice) || !state.event || !eventPlan) errors.push({code:'event-required',tab:'decisions'});
    const project = draftProject(state,errors);
    const finance = buildFinance(state,project,eventPlan,errors);
    const signature = JSON.stringify([state.attemptId,state.year,state.revision,state.event?.id || state.event?.eventId,state.draft,
      project?.id,project?.openingYear,project?.projection?.served,project?.projection?.districts,finance.cashEnd,finance.debtEnd,finance.reserveEnd,
      finance.operations.map(row=>[row.id,row.amount])]);
    return {ok:!errors.length,errors,finance,project,signature};
  }

  function previousSchoolState(state, year, municipalities) {
    const native = municipalities.suburb, start = state.population.initial.access.suburb;
    const staffedFactor = .8+.2*native.labour/Math.max(1,start.labour);
    const map = applicableSchoolData(state,native.school,staffedFactor);
    const localProjects = state.projects.filter(p => p.districtId === 'suburb' && projectPhase(p,year) === 'open');
    const shift = localProjects.some(p=>p.measureId==='second-shift');
    const shiftPlaces = shift ? G.Population.OUTPUTS['second-shift'].schoolStaff : 0;
    const schools = map.baselineSchools.map(row => row.id !== 'old-school' ? row : {
      ...row,physicalSeats:row.physicalSeats+shiftPlaces,staffedSeats:row.staffedSeats+shiftPlaces});
    const campus = state.projects.find(p=>p.measureId==='school-campus' && (year>=p.openingYear || p.paidYears.length));
    if (campus) schools.push({...map.newSchool,node:map.sites.find(site=>site.id===campus.siteId).node,
      staffedSeats:projectPhase(campus,year)==='open'?map.newSchool.staffedSeats:0,status:projectPhase(campus,year)});
    const local = schoolAllocation(map,{closedRoads:state.closedRoads,schools});
    const remaining = Object.fromEntries(Object.entries(local.demandByZone).map(([z,n])=>[z,n-local.servedByZone[z]]));
    let routeDemand = Math.min(local.unserved,Math.floor(local.demand*(localProjects.some(p=>p.measureId==='school-bus') ? G.Population.OUTPUTS['school-bus'].schoolReach : 0)));
    const routes = [];
    const destinations = Object.values(municipalities).filter(m=>m.id!=='suburb' && G.Population.travelMinutes('suburb',m.id)<=60)
      .sort((a,b)=>G.Population.travelMinutes('suburb',a.id)-G.Population.travelMinutes('suburb',b.id) || a.id.localeCompare(b.id));
    for (const destination of destinations) {
      if (!routeDemand) break;
      let spare = Math.min(routeDemand,destination.schoolSpare);
      for (const zoneId of Object.keys(remaining).sort()) {
        const pupils = Math.min(spare,remaining[zoneId]);
        if (!pupils) continue;
        routes.push({zoneId,from:'suburb',to:destination.id,pupils,minutes:G.Population.travelMinutes('suburb',destination.id)});
        destination.schoolSpare -= pupils;
        remaining[zoneId] -= pupils;
        routeDemand -= pupils;
        spare -= pupils;
      }
    }
    const transported = sum(routes.map(r=>r.pupils));
    const served = local.served+transported;
    return {...local,transported,localServed:local.served,served,unserved:local.demand-served,coveragePct:percent(served,local.demand),routes,
      allServedByZone:Object.fromEntries(Object.entries(remaining).map(([z,n])=>[z,local.demandByZone[z]-n])),
      facilities:schools.map(school=>({...school,served:local.servedBySchool[school.id]})),closedRoads:[...state.closedRoads]};
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
    const direction=mode==='high'?-1:mode==='low'?1:0;
    return Object.fromEntries(Object.keys(GROUP_WEIGHTS).map((id,index)=>[id,direction*TAX_REACTIONS[index]]));
  }

  function reactions(state, nextStats, eventPlan) {
    const taxes=taxSupportEffects(state.draft.taxMode);
    const population = Math.max(1,nextStats.population);
    const eventEffect = sum(Object.entries(eventPlan?.supportByDistrict || {}).map(([id,bps]) =>
      bps/100*(nextStats.districts[id]?.population || 0)/population));
    const groups = {}, reasons = {};
    Object.keys(GROUP_WEIGHTS).forEach(id => {
      const changes = Object.entries(SOCIAL_METRICS[id]).map(([metric,weight]) => ({
        source:metric,delta:weight*((nextStats.kpis[metric].value || 0)-(state.stats.kpis[metric].value || 0))
      }));
      changes.push({source:'tax',delta:taxes[id]},{source:'event',delta:eventEffect});
      groups[id] = cents(clamp(state.stats.groups[id]+sum(changes.map(row=>row.delta))));
      reasons[id] = changes.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))[0];
      if (!reasons[id].delta) reasons[id] = {source:'stable',delta:0};
    });
    return {groups,reasons};
  }

  function peopleProject(project, year) {
    // The local school graph owns school capacity and route matching. The
    // population engine still handles the region's other services, jobs and ageing.
    const outputs = {...G.Population.outputsFor(project.measureId)};
    if (project.districtId === 'suburb') {
      delete outputs.school;
      delete outputs.schoolStaff;
      delete outputs.schoolReach;
    }
    const phase = projectPhase(project,year);
    const status = phase==='open' ? 'active' : phase==='closed' ? 'completed' : 'delivery';
    return {id:project.id,actionId:project.measureId,kind:project.kind,status,activatedTurn:project.openingYear-FIRST_YEAR+1,
      completedTurn:project.endYear-FIRST_YEAR+2,people:{outputs,factor:project.outputFactor,targets:project.targets}};
  }

  function territoryProjection(state,project) {
    const metric = SITE_METRICS[project.districtId];
    if (!metric) return null;
    const year = project.openingYear;
    const projects = state.projects.map(p=>peopleProject(p,year));
    const model = {scenarioId:state.scenarioId, turnIndex:year-FIRST_YEAR, population:state.population, finance:{portfolio:projects}};
    const before = G.Population.derive(model);
    const after = G.Population.derive({...model,finance:{portfolio:[...projects,peopleProject(project,year)]}});
    function indicator(row) {
      if (metric === 'employment') return kpi(row.employed,row.labour);
      if (metric === 'flood') return kpi(money(row.floodProtection*row.population),row.population);
      if (metric === 'digital') return kpi(money(row.digitalAccess*row.population),row.population);
      return kpi(money(row.healthAccess*row.health),row.health);
    }
    const districts = Object.keys(project.targets).map(id => {
      const a = indicator(before.municipalities[id]), b = indicator(after.municipalities[id]);
      return {districtId:id, before:a, after:b, servedChange:b.served-a.served};
    });
    return {districts,metric,firstServiceYear:year,served:sum(districts.map(d=>d.after.served)),
      demand:sum(districts.map(d=>d.after.demand)),servedChange:sum(districts.map(d=>d.servedChange))};
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

  function advanceProjection(state,finance,eventPlan) {
    const year = state.year, population = clone(state.population);
    const projects = finance.projects.map(p=>({...p,status:projectPhase(p,year),paidYears:
      projectPhase(p,year)==='open' ? [...p.paidYears,year] : p.paidYears}));
    const routes = updatedRoads(state,eventPlan);
    const adapter = {population,scenarioId:state.scenarioId,turnIndex:year-FIRST_YEAR,finance:{portfolio:projects.map(p=>peopleProject(p,year))}};
    const populationLedger = G.Population.advanceYear(adapter);
    const outcomes = eventPlan?.outcomes || [];
    const updated = {...state,projects,population,...routes};
    const preliminary = calculateStats(updated,state.stats.groups,{},outcomes);
    const {groups,reasons} = reactions(state,preliminary,eventPlan);
    const stats = {...preliminary,groups,groupReasons:reasons,support:aggregateSupport(groups)};
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
    return {projects,population,stats,...routes,finance:{...state.finance,cash:finance.cashEnd,reserve:finance.reserveEnd,debt:finance.debtEnd,loans:finance.loans}};
  }

  function checkPromises(promises,draft,project,finance,year) {
    const result = promises.map(p=>({...p}));
    if (draft.promise && integer(draft.promise.dueYear) && draft.promise.dueYear>=year) {
      const {type,dueYear} = draft.promise;
      if ((type==='open' || type==='operate') && project) {
        result.push({id:'promise:'+year,type,dueYear,projectId:project.id,status:'pending'});
      }
      if (type==='reserve' && integer(draft.promise.amount) && draft.promise.amount>0)
        result.push({id:'promise:'+year,type,dueYear,amount:draft.promise.amount,status:'pending'});
    }
    for (const promise of result) {
      if (promise.status!=='pending' || promise.dueYear>year) continue;
      const p = finance.projects.find(row=>row.id===promise.projectId);
      if (promise.type==='open') promise.status=p?.paidYears.some(paid=>paid<=year)?'kept':'missed';
      if (promise.type==='operate') promise.status=p && projectPhase(p,year)==='open'?'kept':'missed';
      if (promise.type==='reserve') promise.status=finance.reserveEnd>=promise.amount?'kept':'missed';
    }
    return result;
  }

  function projectSnapshot(project) {
    const {id, status, approvedYear, openingYear, endYear, paidYears, siteId, labels, districtId, measureId, annualOpex} = project;
    return {id, status, approvedYear, openingYear, endYear, paidYears:[...paidYears], siteId, labels, districtId, measureId, annualOpex};
  }

  function financeRecord(projection) {
    const {loans,projects,...report} = projection;
    return report;
  }

  function settleEvent(state,eventPlan,approvedOperations,settledEventPlan) {
    if (!G.V3Events?.year || !eventPlan.rows?.some(row => row.eventId === state.event.eventId)) return eventPlan;
    const ledger = [...state.history.map(row=>row.event),state.event];
    const picks = Object.fromEntries(ledger.map(row=>[row.year,row.choice || state.draft.eventChoice]));
    const settledSpend = Object.fromEntries(approvedOperations.filter(row=>row.direction==='out').map(row=>[row.id,row.amount]));
    const calculation = G.V3Events.year({attemptId:state.attemptId,year:state.year,ledger,picks,settledSpend});
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
    const referenceDraft = {...emptyDraft(),measureId:'defer',eventChoice:'base'};
    const referenceState = {...state,...state.baseline,draft:referenceDraft,projects:[]};
    const baselineFinance = buildFinance(referenceState,null,baselineEventPlan,[]);
    const reference = advanceProjection(referenceState,baselineFinance,baselineEventPlan);
    const settled = settleEvent(state,eventPlan,review.finance.operations,settledEventPlan);
    const fiscalResult = settled === eventPlan ? review.finance : buildFinance(state,review.project,settled,[]);
    const actual = advanceProjection(state,fiscalResult,settled);
    const promises = checkPromises(state.promises,state.draft,review.project,fiscalResult,year);
    const history = [...state.history,{year,revision:state.revision,measure:review.project ? {id:review.project.id,
      measureId:review.project.measureId,districtId:review.project.districtId,siteId:review.project.siteId,labels:review.project.labels,
      action:review.project.action,openingYear:review.project.openingYear,annualOpex:review.project.annualOpex,
      deliveryWindowStart:review.project.action==='renew' ? review.project.endYear-review.project.durationYears+1 : review.project.openingYear,
      deliveryWindowEnd:review.project.endYear, holdYears:review.project.durationYears} : null,
      event:{...state.event,choice:state.draft.eventChoice},projects:actual.projects.map(projectSnapshot),
      finance:{...financeRecord(fiscalResult),newMeasureCost:review.project?.costNow || 0},stats:actual.stats,reference:reference.stats}];
    const completed = year === LAST_YEAR;
    return {...state,...actual,promises,history,baseline:{finance:reference.finance,population:reference.population,stats:reference.stats,
      closedRoads:reference.closedRoads,roadExpiry:reference.roadExpiry},completed,year:completed ? year : year+1,
      lastClosedYear:year,revision:state.revision+1,event:null,draft:emptyDraft(state.draft.taxMode)};
  }

  function handoverStatus(state) {
    if (state.completed || !state.event || !G.V3Events?.year) return {available:false};
    const ledger = [...state.history.map(row=>row.event),state.event];
    const picks = Object.fromEntries(ledger.map(row=>[row.year,row.choice || 'base']));
    const executionHistory = state.history.flatMap(row=>row.stats.eventOutcomes);
    const candidate = {...state,draft:{...emptyDraft('high'),reserveDraw:state.finance.reserve,measureId:'defer'}};
    const deficits = [];
    for (const choice of ['base','a','b']) {
      const eventPlan = G.V3Events.year({attemptId:state.attemptId,year:state.year,ledger,picks:{...picks,[state.year]:choice},executionHistory});
      const basic = buildFinance(candidate,null,eventPlan,[]);
      if (basic.cashEnd>=0) return {available:false};
      deficits.push(-basic.cashEnd);
      if (-basic.cashEnd>basic.loanHeadroom) continue;
      for (let termYears=1;termYears<=10;termYears++) {
        candidate.draft.loan = {principal:-basic.cashEnd,termYears};
        const errors = [];
        buildFinance(candidate,null,eventPlan,errors);
        if (!errors.length) return {available:false};
      }
      candidate.draft.loan = null;
    }
    return {available:true,year:state.year,code:'no-funded-legal-plan',shortfall:Math.min(...deficits)};
  }

  function handover(state,{expectedRevision} = {}) {
    if (state.completed || expectedRevision!==state.revision) throw new Error('governor-v3/stale-year');
    const reason = handoverStatus(state);
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

  G.V3Rules = {RULES_VERSION,FIRST_YEAR,LAST_YEAR,TAX_MODES,GROUP_WEIGHTS,SECTOR_SHARES,DISTRICTS,MEASURES,SITES,
    create,emptyDraft,availableMeasures,projectPhase,loanSchedule,reconcile,aggregateSupport,taxSupportEffects,baseOperations,schoolAllocation,
    schoolComparison,schoolQuote,quote,commit,handoverStatus,handover,assess};
})(globalThis);
