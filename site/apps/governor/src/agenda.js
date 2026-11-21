/* Persistent annual agenda. Browsing is pure and never advances the clock.
 * Original 1.0 saves retain the first-five-years route. New campaigns unlock
 * all twenty authored situations, revisit each policy area, and keep crises
 * on their calendar even when the player chooses a different annual priority.
 */
(function (root) {
  'use strict';
  const D = root.GovernorGame?.DATA?.consolidationReady ? root.GovernorGame.DATA : require('./consolidation-data.js');
  const L = (ru, en, zh) => zh ? ({ru, en, zh}) : ({ru, en});
  const clone = v => JSON.parse(JSON.stringify(v));
  const VERSION = '2.0.0';
  const LEGACY_VERSION = '1.0.0';
  const LENGTH = 20;
  const FIRST_TERM_LENGTH = 5;
  const MODES = ['guided', 'agenda'];
  const TOPICS = [
    {id:'school-neighbourhood', districtId:'suburb', image:'school', icon:'school', metric:'schoolAccess',
      title:L('Школа рядом с домом','A school close to home'), label:L('Доступность школьных мест','Access to school places'),
      voice:L('Ольга · Новый берег','Olga · New Bank'),
      opening:L('Квартал уже заселён. Школу обещают, а родители пока составляют расписание поездок через весь город.', 'The neighbourhood is already occupied. A school has been promised, but parents still plan trips across the city.'),
      tradeoff:L('Здание потребует времени. Автобусы помогут быстрее, только если рядом есть свободные места. Вторая смена – временная мера.', 'A new building takes time. Buses help sooner, but only when nearby places are available. A second shift is temporary.'),
      wait:L('Пока новых мест нет, потребность пересчитывается каждый год. Более поздний старт школы означает более позднее открытие.', 'Without new places, demand is recalculated each year. Starting a school later also means opening it later.'),
      window:2},
    {id:'rural-healthcare', districtId:'north', image:'care', icon:'health', metric:'healthAccess',
      title:L('Врач для северных поселений','Care for northern villages'), label:L('Доступность помощи','Access to healthcare'),
      voice:L('Анна · фельдшер','Anna · paramedic'),
      opening:L('До врача далеко. В медпункте есть свободный кабинет, но работать в нём пока некому.', 'The doctor is far away. The local clinic has a spare room, but nobody to staff it yet.'),
      tradeoff:L('Клиника, выездная бригада и подготовка кадров решают разные ограничения. Здание без персонала не заменит помощь.', 'A clinic, a mobile team and staff training address different bottlenecks. A building without staff is not care.'),
      wait:L('Пропущенный год не превращается в штраф. Он проходит с действующей доступностью помощи и её демографическими последствиями.', 'A year without a new measure is not a flat penalty. It passes with existing access to care and its demographic consequences.')},
    {id:'flood-preparedness', districtId:'river', image:'barrier', icon:'flood', metric:'floodProtection',
      title:L('Долина до большой воды','The valley before high water'), label:L('Защита долины, индекс','Valley protection, index'),
      voice:L('Валентина · Речной','Valentina · Riverside'),
      opening:L('На дверном косяке осталась отметка прошлого паводка. Весной жители снова смотрят на реку.', 'The last flood left a mark on the doorframe. Each spring the residents watch the river again.'),
      tradeoff:L('Информирование запускается быстро, но заканчивается без продления. Защитные сооружения требуют строительства и содержания.', 'Preparedness outreach starts quickly but expires without renewal. Defences need construction and maintenance.'),
      wait:L('Крупный паводок остаётся в третьей главе. Важна работающая защита к его приходу, а не самая ранняя дата принятия решения.', 'The major flood remains in chapter three. What matters is protection that is still working then, not the earliest possible approval.')},
    {id:'youth-employment', districtId:'industrial', image:'training', icon:'briefcase', metric:'employment',
      title:L('Работа, ради которой остаются','Work worth staying for'), label:L('Занятость рабочей силы','Labour-force employment'),
      voice:L('Денис · мастерская','Denis · workshop'),
      opening:L('Молодые специалисты спрашивают не о новом лозунге, а о работе после выпуска. Предприятия ищут людей с опытом.', 'Young specialists ask about jobs after graduation, not a new slogan. Employers want people with experience.'),
      tradeoff:L('Контракт на подготовку, временная субсидия и индустриальная площадка отличаются сроком и стоимостью постоянной работы.', 'A training compact, temporary job subsidies and an industrial site differ in timing and ongoing costs.'),
      wait:L('Спрос на труд, поездки на работу и переезды продолжают рассчитываться. Отложенный проект не возвращает прошедшие годы занятости.', 'Labour demand, commuting and migration keep changing. A later project cannot restore years of employment already missed.')},
    {id:'digital-services', districtId:'capital', image:'digital', icon:'digital', metric:'digitalAccess',
      title:L('Услуги без бумажной папки','Services without a paper folder'), label:L('Цифровая доступность','Digital access'),
      voice:L('Михаил · областной центр','Mikhail · regional centre'),
      opening:L('Новый портал уже обсуждают, но Михаил по-прежнему берёт с собой копии документов. Он боится остаться без помощи при сбое.', 'People discuss a new portal, but Mikhail still brings copies of his documents. He worries about getting help when it fails.'),
      tradeoff:L('Удобный вход, резервирование и обратная связь – разные приоритеты. Позже систему проверит кибератака.', 'Easy access, resilient backups and feedback are different priorities. A cyberattack will test the system later.'),
      wait:L('Новый сервис не появится сам. У предложения софинансирования есть срок; собственное финансирование останется доступным.', 'A new service will not appear by itself. The cofinancing offer has a deadline; own funding remains available.'),
      window:3}
  ];
  const OPERATIONS = {
    id:'agenda-operations',chapter:1,threadPhase:'design',districtId:'capital',icon:'construction',kicker:L('Год исполнения','A year of delivery'),
    title:L('Довести начатое','Let existing work progress'),
    description:L('Не начинать ещё одну программу. Действующие проекты пройдут обычный год реализации и содержания; остальные вопросы останутся в повестке следующих лет.', 'Start no additional programme. Existing projects pass through their normal year of delivery and operation; other issues stay on the agenda in later years.','本年不启动新项目。现有项目按正常周期建设和运营；未解决的问题继续保留在后续年度议程中。'),
    objective:L('Проверить обязательства и сознательно сохранить возможность управлять уже начатым.', 'Review commitments and consciously preserve capacity to manage work already under way.'),
    advisors:{},debate:['viktor','mira'],actions:[{id:'defer-agenda-operations',deferred:true,icon:'clock',title:L('Год без новых запусков','A year without new starts'),
      description:L('Без нового проекта и специального бонуса. Год пройдёт: содержание оплачивается, жители пользуются доступными услугами.', 'No new project and no special bonus. The year passes: operations are paid and residents use available services.'),
      future:L('Нерешённые вопросы остаются в повестке. Услуги, обязательства и подготовка к календарным кризисам продолжают меняться.', 'Unaddressed issues stay on the agenda. Services, commitments and readiness for calendar crises continue changing.','未解决的问题继续保留在议程中。服务、承诺和应对定期危机的准备程度仍在变化。'),
      outcome:L('Новые обязательства не приняты. Прежние программы продолжают обычный жизненный цикл.', 'No new commitments were made. Existing programmes continue their normal lifecycle.'),
      cost:0,effects:{},resilience:{},tags:['caution','deferred'],xp:100,stars:0,deliveryRisk:0,mapObject:null,
      finance:{kind:'operating',annualOpex:0,lag:0,duration:0,adminLoad:0,adminMaintenance:0,federalMatch:0,debtEligible:false,reserveEligible:false,annualEffects:{}}}]
  };
  const byId = (id,state=null) => {
    const m=id===OPERATIONS.id ? OPERATIONS : D.missions.find(m=>m.id===id)||null;
    return routeCopy(state,m);
  };
  function routeCopy(state,m) {
    if(state?.agenda?.mode!=='agenda'||!m||m.chapter!==2)return m;
    const copy={...m};
    if(m.id==='health-delivery') {
      copy.title=L('Северная медицина: следующий шаг','Northern healthcare: the next step');
      copy.description=L('Зимняя логистика, кадровый дефицит и разные интересы муниципалитетов требуют организационного решения. Нужно выбрать, как обеспечить работу помощи, учитывая реальные проекты первого пятилетия.', 'Winter logistics, staff shortages and municipal interests call for an organisational decision. Choose how care should operate, taking account of the projects actually started in your first five years.');
      if(persistent(state))copy.description=L('Зимняя логистика, кадровый дефицит и разные интересы муниципалитетов требуют организационного решения. Выберите, как обеспечить работу помощи, учитывая ранее принятые проекты.', 'Winter logistics, staff shortages and municipal interests call for an organisational decision. Choose how care should operate, taking account of projects already started.','冬季交通、人员短缺和各市镇不同的利益需要协调决策。请结合已启动的项目，选择如何保障医疗服务。');
    }
    if(m.id==='river-land-use')copy.description=L('Инвесторы предлагают склады и жильё у реки. Муниципалитеты видят доходы, гидрологи – растущий риск. Опирайтесь на защиту, которая действительно есть, а не на ещё не принятые планы.', 'Investors propose warehouses and housing beside the river. Municipalities see revenue; hydrologists see risk. Rely on protection that actually exists, not on plans you have not approved.');
    if(m.id==='digital-procurement')copy.description=L('Предстоит определить архитектуру цифровых услуг. Один подрядчик обещает скорость, университет – открытый код, а ведомства требуют совместимости. Ранее принятые решения могут помочь или ограничить выбор.', 'Digital services need an architecture. A contractor promises speed, a university offers open code, and agencies need interoperability. Earlier choices can help or constrain this decision.');
    return copy;
  }
  const topic = id => TOPICS.find(t => t.id === id) || null;
  const mode = s => s?.agenda?.mode || 'guided';
  const persistent = s => s?.agenda?.version === VERSION && mode(s) === 'agenda';
  const length = s => persistent(s) ? LENGTH : FIRST_TERM_LENGTH;
  const open = s => mode(s) === 'agenda' && s.turnIndex < length(s);
  const isFlexibleTurn = (s,index) => mode(s) === 'agenda' && (persistent(s) || index < FIRST_TERM_LENGTH);
  const started = s => new Set((s.history || []).filter(r => (persistent(s) || r.turn <= FIRST_TERM_LENGTH) && !r.deferred).map(r => r.missionId));
  const needsChoice = s => open(s) && !s.completed && !s.awaitingContinue && !s.agenda.selectedId;
  const clamp = (v,min,max) => Math.max(min,Math.min(max,Number(v)||0));
  const themeFor = m => TOPICS.find(t=>t.districtId===m?.districtId) || TOPICS[0];
  const beforePlaces = (s,turn) => s.population.ledgers[turn-2]?.after?.municipalities || s.population.initial.access;
  function metricFor(m) {
    if(m.id==='childcare-queue'||m.id==='generations-city')return 'childcareAccess';
    if(m.id==='digital-procurement'||m.id==='cyberattack')return 'digitalProtection';
    return themeFor(m).metric;
  }
  function unlockTurn(s,m,turn=s.turnIndex+1) {
    const index=D.missions.findIndex(x=>x.id===m.id);
    if(m.chapter===1)return 1;
    // Emergency response cannot be selected before the event. Its shock is
    // applied separately by Engine, once on the original calendar date.
    if(m.chapter===3)return index+1;
    const early=m.chapter===2?4:14,normal=m.chapter===2?6:16;
    const records=(s.history||[]).filter(r=>r.turn<turn&&!r.deferred);
    const prior=records.some(r=>byId(r.missionId)?.districtId===m.districtId&&byId(r.missionId)?.chapter<m.chapter);
    const value=beforePlaces(s,turn)?.[m.districtId]?.[metricFor(m)]??1;
    return prior || value<.6 ? early : normal;
  }
  function eventForYear(s) {
    if(!persistent(s))return null;
    const m=D.missions[s.turnIndex];
    return m?.crisis ? m : null;
  }
  function available(s) {
    const year=s.turnIndex+1,done=started(s);
    if(!persistent(s))return TOPICS.map(t=>({...t,topicId:t.id,mission:byId(t.id,s),
      available:open(s)&&!done.has(t.id),status:done.has(t.id)?'started':'available',urgency:0,
      reason:t.tradeoff,unlocksAt:1,current:clamp(s.population.derived.municipalities[t.districtId]?.[t.metric],0,1)}));
    return D.missions.map((m,index)=>{
      const t=themeFor(m),metric=metricFor(m),place=s.population.derived.municipalities[m.districtId]||{},value=clamp(place[metric],0,1);
      const previous=beforePlaces(s,year)?.[m.districtId]?.[metric]??value;
      const decline=Math.max(0,previous-value),unlocksAt=unlockTurn(s,m);
      const initiated=done.has(m.id),isAvailable=!initiated&&year>=unlocksAt&&!s.completed;
      const related=s.finance.portfolio.filter(p=>p.districtId===m.districtId&&p.status!=='completed');
      const expiring=related.some(p=>p.status==='active'&&p.yearsRemaining<=2);
      const last=s.history.filter(r=>!r.deferred&&r.districtId===m.districtId).at(-1)?.turn||0;
      const crisisNow=eventForYear(s)?.id===m.id;
      const preparedness=m.districtId==='river'&&year<13?Math.max(0,18-Math.abs(10-year)*3):0;
      // Zero protection is not an immediate service emergency twelve years
      // before the flood. Raise preparation priority as its lead time closes.
      const hazardYear=metric==='floodProtection'?13:metric==='digitalProtection'?14:null;
      const riskWeight=hazardYear?(year<=hazardYear?clamp(4/(hazardYear-year+1),0.2,1):0.35):1;
      const urgency=initiated?0:Math.round(clamp((1-value)*55*riskWeight+decline*150+Math.min(12,(year-last)*1.2)+(expiring?14:0)+(crisisNow?30:0)+preparedness,0,100));
      const valueText=Math.round(value*100);
      const label=metric==='childcareAccess'?L('Доступность ухода за детьми','Access to childcare','托幼服务可及性'):metric==='digitalProtection'?L('Устойчивость цифровых услуг','Digital resilience','数字服务韧性'):t.label;
      let reason=L(`${label.ru}: ${valueText}%. Приоритет учитывает дефицит, изменение услуги и прежние обязательства.`,`${label.en}: ${valueText}%. Priority reflects the shortfall, service changes and existing commitments.`, `服务水平：${valueText}%。优先级综合考虑服务缺口、变化趋势和现有承诺。`);
      if(initiated)reason=L('Решение уже принято. Следите за исполнением и продлением программы в портфеле; следующие шаги по этой территории остаются в повестке.', 'A decision has been made. Manage delivery and renewal in the portfolio; later steps for this territory remain on the agenda.','决策已经作出。请在项目组合中管理执行和续期；该地区的后续措施仍保留在议程中。');
      else if(!isAvailable)reason=L(`Вопрос откроется не позднее ${unlocksAt}-го года срока. Уже принятые меры могут ускорить открытие следующих шагов.`, `This question opens by term year ${unlocksAt}. Earlier commitments can unlock follow-up steps sooner.`, `该议题最迟在任期第${unlocksAt}年开放。此前的措施可能使后续步骤提前开放。`);
      else if(crisisNow)reason=L('Календарный кризис уже наступил. Его ущерб учтён независимо от выбранной темы; сейчас можно направить годовое решение на ответ.', 'The calendar crisis has arrived. Its damage applies regardless of the topic selected; this annual decision can fund a response.','既定危机已经发生，无论选择哪个议题，其损失均已计入。本年度决策可以用于应对危机。');
      else if(expiring)reason=L(`${label.ru}: ${valueText}%. В этой территории программа завершится в ближайшие два года: проверьте продление и следующий шаг.`, `${label.en}: ${valueText}%. A local programme expires within two years: review renewal and the next step.`, `服务水平：${valueText}%。当地项目将在两年内到期，请评估续期和下一步措施。`);
      return {...t,id:m.id,topicId:t.id,title:m.title,icon:m.icon||t.icon,metric,label,mission:routeCopy(s,m),
        available:isAvailable,status:initiated?'started':isAvailable?'available':'future',urgency,reason,unlocksAt,
        current:value,decline,expiring,calendarEventTurn:m.crisis?index+1:null};
    }).sort((a,b)=>Number(b.available)-Number(a.available)||b.urgency-a.urgency||D.missions.findIndex(m=>m.id===a.id)-D.missions.findIndex(m=>m.id===b.id));
  }
  const pending = s => available(s).filter(t=>t.available);
  function create(selectedMode='guided') {
    if (!MODES.includes(selectedMode)) throw new Error('Unknown campaign mode');
    return {version:VERSION,mode:selectedMode,selectedId:null};
  }
  function mission(s) {
    let m = open(s) ? byId(s.agenda.selectedId) || OPERATIONS : D.missions[s.turnIndex] || null;
    if (!m || !open(s) || m.id === OPERATIONS.id) return routeCopy(s,m);
    // A wait changes real services and obligations, not a hidden card penalty.
    m = {...m,actions:m.actions.map(a => a.deferred ? {...a,effects:{},future:OPERATIONS.actions[0].future,
      title:L('Отложить: год без новой меры','Defer: a year without a new measure')} : a)};
    return routeCopy(s,m);
  }
  function select(s,id) {
    if (!open(s) || s.awaitingContinue || s.completed) throw new Error('The agenda is not editable');
    if (id !== OPERATIONS.id && !pending(s).some(t=>t.id===id)) throw new Error('This question is unavailable or already initiated');
    s.agenda.selectedId=id;
    s.selectedActionId=null;s.selectedFundingMode=null;s.selectedPlacementId=null;s.draft=null;
    if(s.governance)s.governance.draft=null;
    s.activeView='mission';
    return mission(s);
  }
  function window(s,missionId) {
    const t = topic(missionId);
    if (!open(s) || !t?.window) return null;
    return {topicId:t.id,untilTurn:t.window,untilYear:s.population.baseYear+t.window-1,
      open:s.turnIndex+1<=t.window,remainingYears:Math.max(0,t.window-s.turnIndex),
      scope:'Only the initial chapter-one cofinancing offer; later programmes have their own terms.'};
  }
  function chapterRows(s) {
    const through=Math.min(length(s),s.population.ledgers.length);
    const ledger = s.population.ledgers[through-1];
    const current = ledger?.after || s.population.derived;
    return TOPICS.map(t=>{
      const record=(s.history||[]).find(r=>r.turn<=through && !r.deferred && (persistent(s)?byId(r.missionId)?.districtId===t.districtId:r.missionId===t.id));
      const project=s.finance.portfolio.find(p=>p.id===record?.project?.id);
      const launchedByChapter=Boolean(project?.activatedTurn && project.activatedTurn<=through);
      const initial=s.population.initial.access[t.districtId]?.[t.metric];
      const final=current.municipalities[t.districtId]?.[t.metric];
      return {id:t.id,districtId:t.districtId,metric:t.metric,label:t.label,title:t.title,
        initial:Number(initial||0),current:Number(final||0),startedTurn:record?.turn||null,
        actionId:record?.actionId||null,titleAction:record?byId(record.missionId)?.actions.find(a=>a.id===record.actionId)?.title:null,
        fundingMode:record?.fundingMode||null,openedTurn:launchedByChapter?project.activatedTurn:null,
        openedByChapter:launchedByChapter,waitedYears:record?record.turn-1:through,
        launchPlan:record?.project ? record.turn+record.project.startsIn : null};
    });
  }
  function report(s) {
    return {version:s.agenda.version,mode:mode(s),openYears:length(s),
      completedYears:Math.min(length(s),s.history.length),
      order:(s.history||[]).filter(r=>r.turn<=length(s)).map(r=>({turn:r.turn,missionId:r.missionId,actionId:r.actionId,deferred:r.deferred,fundingMode:r.fundingMode})),
      topics:chapterRows(s),
      interpretation:'Start is not resolution; access indicators describe the whole model year, not a causal estimate of one decision.'};
  }
  const followups={'health-delivery':'rural-healthcare','industrial-transition':'youth-employment','river-land-use':'flood-preparedness','digital-procurement':'digital-services','family-neighbourhood':'school-neighbourhood'};
  function continuation(s,m) {
    const predecessor=followups[m?.id];
    if (mode(s)!=='agenda'||(!persistent(s)&&!predecessor)||m?.id===OPERATIONS.id) return null;
    const records=s.history.filter(r=>!r.deferred&&(persistent(s)?r.districtId===m.districtId:r.missionId===predecessor));
    if(!records.length)return {status:'not-started',text:L('По этой теме ещё не было запуска. Вы можете выбрать новый курс; прошедшие годы уже отражены в жизни территории.', 'No measure has been started for this topic yet. You can choose a new course; the intervening years are already reflected in the territory.','该议题尚未启动措施。您仍可选择新的方向，但过去几年的影响已经体现在当地生活中。')};
    const r=records.at(-1),p=s.finance.portfolio.find(x=>x.id===r.project?.id);
    const ru=p?.status==='delivery'?`Прежняя программа ещё в реализации; до открытия ${p.startsIn} г.`:p?.status==='active'?'Прежняя программа работает. Решайте, что дополняет её, а что дублирует.':'Финансирование прежней программы завершено. Капитальные объекты и остаточные навыки учитываются отдельно от текущей услуги.';
    const en=p?.status==='delivery'?`The earlier programme is still in delivery, ${p.startsIn} years from opening.`:p?.status==='active'?'The earlier programme is operating. Decide what complements it and what duplicates it.':'Funding of the earlier programme has ended. Capital assets and residual skills are counted separately from current service.';
    return {status:p?.status||'none',text:L(ru,en,p?.status==='delivery'?`此前项目仍在实施，预计${p.startsIn}年后开放。`:p?.status==='active'?'此前项目正在运行。请判断新措施是补充现有服务还是重复建设。':'此前项目的资助期已结束。固定资产和保留技能与当前服务分别计算。'),recordTurn:r.turn};
  }
  function verify(s) {
    const errors=[];const a=s?.agenda;
    if(!a||![VERSION,LEGACY_VERSION].includes(a.version)||!MODES.includes(a.mode))return ['agenda-schema'];
    if(a.mode==='guided') {if(a.selectedId!==null)errors.push('guided-selection');return errors;}
    const seen=new Set();
    for(const [i,r] of (s.history||[]).entries()) {
      if(!isFlexibleTurn(s,i)){if(r.missionId!==D.missions[i]?.id)errors.push('later-schedule');continue;}
      const m=byId(r.missionId);
      if(!m||(!persistent(s)&&(r.chapter!==1||(!topic(r.missionId)&&r.missionId!==OPERATIONS.id))))errors.push('agenda-reference');
      if(persistent(s)&&m&&m.id!==OPERATIONS.id&&r.turn<unlockTurn(s,m,r.turn))errors.push('locked-question');
      if(seen.has(r.missionId))errors.push('duplicate-start');
      if(!r.deferred)seen.add(r.missionId);
      if(r.agenda?.mode!=='agenda'||r.agenda?.selectedId!==r.missionId||r.agenda?.year!==i+1)errors.push('agenda-record');
      const win=topic(r.missionId)?.window;
      if(win&&i+1>win&&r.fundingMode==='cofinance')errors.push('expired-offer');
    }
    if(s.turnIndex>=length(s)) {if(a.selectedId!==null)errors.push('closed-selection');}
    else if(s.awaitingContinue||s.completed) {if(a.selectedId!==s.history.at(-1)?.missionId)errors.push('committed-selection');}
    else if(a.selectedId!==null&&a.selectedId!==OPERATIONS.id&&!pending(s).some(t=>t.id===a.selectedId))errors.push('pending-selection');
    if(needsChoice(s)&&(s.selectedActionId||s.draft?.actionId||s.governance?.draft))errors.push('orphan-draft');
    if(persistent(s)){
      const events=D.missions.map((m,index)=>({mission:m,turn:index+1})).filter(e=>e.mission.crisis);
      for(const e of events){
        if(Boolean(s.entryApplied?.[e.mission.id])!==(e.turn<=s.turnIndex+1))errors.push('calendar-entry');
      }
      for(const record of s.history||[]){
        const event=events.find(e=>e.turn===record.turn);
        if((record.entry?.missionId||null)!==(event?.mission.id||null))errors.push('calendar-record');
      }
      if((s.currentEntry?.missionId||null)!==(eventForYear(s)?.id||null))errors.push('calendar-current');
    }
    return errors;
  }
  const api={VERSION,LEGACY_VERSION,LENGTH,FIRST_TERM_LENGTH,TOPICS,OPERATIONS,MODES,mode,persistent,length,open,isFlexibleTurn,needsChoice,create,byId,topic,mission,available,pending,started,select,window,eventForYear,report,chapterRows,continuation,verify};
  root.GovernorGame=root.GovernorGame||{};root.GovernorGame.Agenda=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
