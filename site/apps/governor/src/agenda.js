/* First-term agenda. One annual decision; priorities are chosen, not shuffled.
 * Viewing, changing focus and making a draft consume no resources or RNG.
 * Only the recorded choice starts a programme. The five-year clock remains
 * authoritative; subsequent chapters keep their established schedule.
 */
(function (root) {
  'use strict';
  const D = root.GovernorGame?.DATA?.consolidationReady ? root.GovernorGame.DATA : require('./consolidation-data.js');
  const L = (ru, en) => ({ru, en});
  const clone = v => JSON.parse(JSON.stringify(v));
  const VERSION = '1.0.0';
  const LENGTH = 5;
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
    description:L('Не начинать ещё одну программу. Действующие проекты пройдут обычный год реализации и содержания; остальные вопросы останутся в повестке до конца пятилетия.', 'Start no additional programme. Existing projects pass through their normal year of delivery and operation; other issues stay available until the end of the first five years.'),
    objective:L('Проверить обязательства и сознательно сохранить возможность управлять уже начатым.', 'Review commitments and consciously preserve capacity to manage work already under way.'),
    advisors:{},debate:['viktor','mira'],actions:[{id:'defer-agenda-operations',deferred:true,icon:'clock',title:L('Год без новых запусков','A year without new starts'),
      description:L('Без нового проекта и специального бонуса. Год пройдёт: содержание оплачивается, жители пользуются доступными услугами.', 'No new project and no special bonus. The year passes: operations are paid and residents use available services.'),
      future:L('Нерешённые вопросы можно снова выбрать, пока первая глава не закончена. Позднее они вернутся через последующие сюжетные задачи.', 'Unaddressed issues remain selectable until chapter one ends. Later chapters revisit them through their follow-up missions.'),
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
    }
    if(m.id==='river-land-use')copy.description=L('Инвесторы предлагают склады и жильё у реки. Муниципалитеты видят доходы, гидрологи – растущий риск. Опирайтесь на защиту, которая действительно есть, а не на ещё не принятые планы.', 'Investors propose warehouses and housing beside the river. Municipalities see revenue; hydrologists see risk. Rely on protection that actually exists, not on plans you have not approved.');
    if(m.id==='digital-procurement')copy.description=L('Предстоит определить архитектуру цифровых услуг. Один подрядчик обещает скорость, университет – открытый код, а ведомства требуют совместимости. Ранее принятые решения могут помочь или ограничить выбор.', 'Digital services need an architecture. A contractor promises speed, a university offers open code, and agencies need interoperability. Earlier choices can help or constrain this decision.');
    return copy;
  }
  const topic = id => TOPICS.find(t => t.id === id) || null;
  const mode = s => s?.agenda?.mode || 'guided';
  const open = s => mode(s) === 'agenda' && s.turnIndex < LENGTH;
  const started = s => new Set((s.history || []).filter(r => r.turn <= LENGTH && !r.deferred).map(r => r.missionId));
  const pending = s => TOPICS.filter(t => !started(s).has(t.id));
  const needsChoice = s => open(s) && !s.completed && !s.awaitingContinue && !s.agenda.selectedId;
  function create(selectedMode='guided') {
    if (!MODES.includes(selectedMode)) throw new Error('Unknown campaign mode');
    return {version:VERSION,mode:selectedMode,selectedId:null};
  }
  function mission(s) {
    let m = open(s) ? byId(s.agenda.selectedId) || OPERATIONS : D.missions[s.turnIndex] || null;
    if (!m || !open(s) || m.id === OPERATIONS.id) return routeCopy(s,m);
    // Deferring in an open agenda does not silently remove the topic or add
    // the linear campaign's author-assigned penalty. Service outcomes remain.
    m = {...m,actions:m.actions.map(a => a.deferred ? {...a,effects:{},future:OPERATIONS.actions[0].future,
      title:L('Отложить: год без новой меры','Defer: a year without a new measure')} : a)};
    return m;
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
    const ledger = s.population.ledgers[Math.min(LENGTH,s.population.ledgers.length)-1];
    const current = ledger?.after || s.population.derived;
    return TOPICS.map(t=>{
      const record=(s.history||[]).find(r=>r.turn<=LENGTH && r.missionId===t.id && !r.deferred);
      const project=s.finance.portfolio.find(p=>p.id===record?.project?.id);
      const atTurn=Math.min(LENGTH,s.population.ledgers.length);
      const launchedByChapter=Boolean(project?.activatedTurn && project.activatedTurn<=atTurn);
      const initial=s.population.initial.access[t.districtId]?.[t.metric];
      const final=current.municipalities[t.districtId]?.[t.metric];
      return {id:t.id,districtId:t.districtId,metric:t.metric,label:t.label,title:t.title,
        initial:Number(initial||0),current:Number(final||0),startedTurn:record?.turn||null,
        actionId:record?.actionId||null,titleAction:record?byId(t.id)?.actions.find(a=>a.id===record.actionId)?.title:null,
        fundingMode:record?.fundingMode||null,openedTurn:launchedByChapter?project.activatedTurn:null,
        openedByChapter:launchedByChapter,waitedYears:record?record.turn-1:atTurn,
        launchPlan:record?.project ? record.turn+record.project.startsIn : null};
    });
  }
  function report(s) {
    return {version:VERSION,mode:mode(s),openYears:LENGTH,
      completedYears:Math.min(LENGTH,s.history.length),
      order:(s.history||[]).filter(r=>r.turn<=LENGTH).map(r=>({turn:r.turn,missionId:r.missionId,actionId:r.actionId,deferred:r.deferred,fundingMode:r.fundingMode})),
      topics:chapterRows(s),
      interpretation:'Start is not resolution; access indicators describe the whole model year, not a causal estimate of one decision.'};
  }
  const followups={'health-delivery':'rural-healthcare','industrial-transition':'youth-employment','river-land-use':'flood-preparedness','digital-procurement':'digital-services','family-neighbourhood':'school-neighbourhood'};
  function continuation(s,m) {
    const predecessor=followups[m?.id];
    if (mode(s)!=='agenda'||!predecessor) return null;
    const records=s.history.filter(r=>r.missionId===predecessor&&!r.deferred);
    if(!records.length)return {status:'not-started',text:L('В первой главе вы не запускали меру по этому вопросу. Он вернулся: сейчас можно изменить курс, но прошедшие годы уже отражены в жизни территории.', 'You did not start a measure for this issue in chapter one. It has returned: you can change course now, but the intervening years are already reflected in the territory.')};
    const r=records[0],p=s.finance.portfolio.find(x=>x.id===r.project?.id);
    const ru=p?.status==='delivery'?`Прежняя программа ещё в реализации; до открытия ${p.startsIn} г.`:p?.status==='active'?'Прежняя программа работает. Решайте, что дополняет её, а что дублирует.':'Финансирование прежней программы завершено. Капитальные объекты и остаточные навыки учитываются отдельно от текущей услуги.';
    const en=p?.status==='delivery'?`The earlier programme is still in delivery, ${p.startsIn} years from opening.`:p?.status==='active'?'The earlier programme is operating. Decide what complements it and what duplicates it.':'Funding of the earlier programme has ended. Capital assets and residual skills are counted separately from current service.';
    return {status:p?.status||'none',text:L(ru,en),recordTurn:r.turn};
  }
  function verify(s) {
    const errors=[];const a=s?.agenda;
    if(!a||a.version!==VERSION||!MODES.includes(a.mode))return ['agenda-schema'];
    if(a.mode==='guided') {if(a.selectedId!==null)errors.push('guided-selection');return errors;}
    const seen=new Set();
    for(const [i,r] of (s.history||[]).entries()) {
      if(i>=LENGTH){if(r.missionId!==D.missions[i]?.id)errors.push('later-schedule');continue;}
      if(r.chapter!==1||(!topic(r.missionId)&&r.missionId!==OPERATIONS.id))errors.push('first-chapter-reference');
      if(seen.has(r.missionId))errors.push('duplicate-start');
      if(!r.deferred)seen.add(r.missionId);
      if(r.agenda?.mode!=='agenda'||r.agenda?.selectedId!==r.missionId||r.agenda?.year!==i+1)errors.push('agenda-record');
      const win=topic(r.missionId)?.window;
      if(win&&i+1>win&&r.fundingMode==='cofinance')errors.push('expired-offer');
    }
    if(s.turnIndex>=LENGTH) {if(a.selectedId!==null)errors.push('closed-selection');}
    else if(s.awaitingContinue||s.completed) {if(a.selectedId!==s.history.at(-1)?.missionId)errors.push('committed-selection');}
    else if(a.selectedId!==null&&a.selectedId!==OPERATIONS.id&&(!topic(a.selectedId)||seen.has(a.selectedId)))errors.push('pending-selection');
    if(needsChoice(s)&&(s.selectedActionId||s.draft?.actionId||s.governance?.draft))errors.push('orphan-draft');
    return errors;
  }
  const api={VERSION,LENGTH,TOPICS,OPERATIONS,MODES,mode,open,needsChoice,create,byId,topic,mission,pending,started,select,window,report,chapterRows,continuation,verify};
  root.GovernorGame=root.GovernorGame||{};root.GovernorGame.Agenda=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
