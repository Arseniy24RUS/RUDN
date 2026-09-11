(function (root) {
  'use strict';
  const DATA = root.GovernorGame?.DATA?.stage3Ready ? root.GovernorGame.DATA : (typeof require === 'function' ? require('./stage3-data.js') : null);
  if (!DATA) throw new Error('Stage 3 content must load before Stage 4');
  if (DATA.stage4Ready) { if (typeof module !== 'undefined') module.exports = DATA; return; }
  const L = DATA.L;

  Object.assign(DATA.ui.ru, {
    budget: 'Ресурс, млрд ₽', missionContext: 'Советники и награда миссии',
    demoBadge: 'Этап 4 · люди и территории',
    startLead: 'Двадцать лет, пять разных территорий и решения, которые меняют жизнь жителей. Школа не откроется без кадров, новая дорога изменит маршруты, а доступное жильё привлечёт семьи раньше, чем появятся места в детских садах. Соберите последовательную стратегию и проверьте её кризисами.',
    featureMission: 'миссий в четырёх главах', featureConsequences: 'жители переезжают, услуги меняют жизнь',
    featureOffline: 'сохраняется локально · работает без аккаунта',
    endSubtitle: 'Двадцать решений оставили след в жизни людей. Оцените не только рост показателей, но и доступность услуг в разных территориях.',
    navResidents: 'Жители', residentsTitle: 'Люди Новой области',
    residentsLead: 'Пять территорий, разные потребности. Выберите место на карте, чтобы увидеть, как здесь живут люди.',
    populationNote: 'Учебный мир: население и коэффициенты вымышлены. Один ход – один год. Полные расчёты доступны в отчёте.',
    populationTotal: 'жителей', populationSinceStart: 'с начала кампании',
    populationBalance: 'Как изменилось население', born: 'Родились', died: 'Умерли',
    externalIn: 'Приехали в область', externalOut: 'Уехали из области', internalMoves: 'Переехали внутри области',
    municipality: 'Территория', access: 'Доступность услуг', availableJobs: 'Работа рядом',
    servicesHealth: 'Медицина', servicesSchool: 'Школа', servicesChildcare: 'Уход за детьми',
    servicesHousing: 'Жильё', residentsDetails: 'Числа и методика',
    peopleEffect: 'Для жителей', currentNeed: 'Сейчас важнее всего',
    yearReview: 'Год в жизни людей', nextBudgetEffect: 'Влияние на следующий бюджет',
    populationModel: 'Демографическая модель', populationLedgerOk: 'Баланс населения сходится',
    residentsAction: 'Открыть жизнь территории', populationWait: 'Первый год ещё не завершён.',
    commute: 'Ездят на работу в соседнюю территорию', localJobs: 'Работают жители',
    serviceEffectDisclaimer: 'Это плановая мощность после запуска, а не обещание мгновенного результата.',
    nextTurn: 'Следующий год', turn: 'Год', noPopulationData: 'Для этой старой партии демографические данные не рассчитывались.',
    serviceExpiry: 'Завершается финансирование', noMagicGrowth: 'Рост населения не самоцель: важно, хватает ли людям услуг.'
  });
  Object.assign(DATA.ui.en, {
    budget: 'Funds, bn RUB', missionContext: 'Council advice and mission reward',
    demoBadge: 'Stage 4 · people and places',
    startLead: 'Twenty years, five distinct places and choices that change everyday life. A clinic needs staff, a new road changes commuting, and housing attracts families before nursery places arrive. Build a coherent strategy and test it through crises.',
    featureMission: 'missions across four chapters', featureConsequences: 'people move and public services shape lives',
    featureOffline: 'local saves · no account needed',
    endSubtitle: 'Twenty decisions have changed everyday lives. Look beyond growth and examine access to services across the region.',
    navResidents: 'Residents', residentsTitle: 'People of Novaya Oblast',
    residentsLead: 'Five places with different needs. Choose a place on the map to see how people live there.',
    populationNote: 'Educational fiction: population and parameters are synthetic. One turn is one year. Full calculations are in the report.',
    populationTotal: 'residents', populationSinceStart: 'since the campaign began',
    populationBalance: 'Population change', born: 'Births', died: 'Deaths',
    externalIn: 'Arrived in the region', externalOut: 'Left the region', internalMoves: 'Moved within the region',
    municipality: 'Place', access: 'Access to services', availableJobs: 'Work nearby',
    servicesHealth: 'Healthcare', servicesSchool: 'School', servicesChildcare: 'Childcare',
    servicesHousing: 'Housing', residentsDetails: 'Numbers and methods', peopleEffect: 'For residents',
    currentNeed: 'What matters here now', yearReview: 'A year in people’s lives',
    nextBudgetEffect: 'Effect on the next budget', populationModel: 'Population model',
    populationLedgerOk: 'Population balance verified', residentsAction: 'Explore everyday life',
    populationWait: 'The first year has not ended yet.', commute: 'Commute to another place',
    localJobs: 'Employed residents', serviceEffectDisclaimer: 'Planned capacity after opening, not an instant result.',
    nextTurn: 'Next year', turn: 'Year', noPopulationData: 'Population was not simulated in this older campaign.',
    serviceExpiry: 'Funding is ending', noMagicGrowth: 'Population growth is not a goal by itself: access to services matters.'
  });

  const suburb = { id: 'suburb', name: L('Новый пригород', 'New suburb'),
    role: L('Жильё, школы и жизнь семей', 'Housing, schools and family life'), icon: 'school', position: { x: 79, y: 63 },
    missionIds: ['school-neighbourhood','family-neighbourhood','childcare-queue','generations-city'] };
  DATA.districts.push(suburb);
  const mkAction = (id, title, description, cost, effects, outputs, finance, extra = {}) => ({
    id, title, description, cost, effects, resilience: { family: 1 }, icon: 'school',
    xp: 140, stars: 2, tags: ['suburb','family'],
    outcome: description, future: L('Открытая мощность влияет на доступность услуг, миграцию и следующий бюджет. До запуска услуги не возникают.', 'Operational capacity affects access, migration and next year’s budget. Services do not exist before opening.'),
    finance: { kind: 'programme', annualOpex: 0.2, lag: 0, duration: 5, adminLoad: 1.6, adminMaintenance: 0.3, federalMatch: 0.35, debtEligible: false, reserveEligible: false, annualEffects: {}, ...finance },
    people: outputs, deliveryRisk: finance.kind === 'capital' ? 0.16 : 0.08,
    ...extra
  });
  const mkMission = (id, chapter, phase, title, description, objective, actions, extra = {}) => ({
    id, chapter, threadPhase: phase, districtId: 'suburb', title, description, objective,
    kicker: L(phase === 'crisis' ? 'Семьи ждут решения' : 'История нового пригорода', phase === 'crisis' ? 'Families are waiting' : 'The new suburb’s story'),
    icon: 'school', reward: { xp: 140, stars: 2 }, debate: ['mira','viktor'],
    advisors: {
      mira: L('Посмотрите не только на новые дома. Семье нужны места в школе, уход за ребёнком и возможность добраться до работы.', 'Look beyond new homes. Families need school places, childcare and a way to get to work.'),
      viktor: L('После открытия объект придётся содержать каждый год. Сравните быструю помощь с постоянным обязательством.', 'After opening, a facility needs annual funding. Compare immediate help with a recurring obligation.'),
      ilya: L('Жильё и рабочие места могут находиться в разных территориях. Маршрут иногда важнее ещё одного здания.', 'Housing and jobs may be in different places. A route can matter more than another building.'),
      elena: L('Не обещайте всем одно и то же: скажите, кого решение охватит сейчас, а кому ещё придётся подождать.', 'Do not promise the same to everyone: explain who benefits now and who still has to wait.')
    }, actions, ...extra
  });

  const missions = [
    mkMission('school-neighbourhood',1,'design',L('Новый квартал без школы','A neighbourhood without a school'),
      L('Семьи переехали в новые дома. Ближайшая школа переполнена, а дорога до свободных мест в центре занимает утро. Нужен выбор между быстрым маршрутом и собственной школой.', 'Families have moved into new homes. The nearest school is full and reaching spare places in the centre takes the morning. Choose between a quick route and a local school.'),
      L('Открыть доступ к образованию, не выдавая строящееся здание за уже работающую школу.', 'Improve access to education without counting a building site as an open school.'), [
      mkAction('school-campus',L('Построить школу в квартале','Build a neighbourhood school'),L('Новые места рядом с домом, но только после строительства и набора учителей.','Local places, but only after construction and teacher recruitment.'),2.8,{support:3,development:5},{school:7000,schoolStaff:7000},{kind:'capital',lag:2,duration:15,annualOpex:0.34,adminLoad:2.4,debtEligible:true,federalMatch:0.5},{flag:{key:'suburbSchool',value:'campus'},resilience:{family:4}}),
      mkAction('school-bus',L('Запустить школьные автобусы','Launch school buses'),L('Использовать свободные места в центре. Дети тратят время на дорогу; нужны безопасные маршруты.','Use spare places in the centre. Children spend time travelling; safe routes are essential.'),0.9,{support:4,development:2},{schoolReach:0.8,mobility:0.07},{annualOpex:0.22,duration:4},{icon:'bus',flag:{key:'suburbSchool',value:'bus'},resilience:{family:2}}),
      mkAction('second-shift',L('Временно ввести вторую смену','Use a temporary second shift'),L('Быстро принять часть детей за счёт более плотного расписания. Это временное решение, а не новая школа.','Take some pupils quickly with a denser timetable. A temporary solution, not a new school.'),0.55,{support:1,development:1},{school:3200,schoolStaff:3200},{annualOpex:0.16,duration:2},{icon:'clock',flag:{key:'suburbSchool',value:'shift'},resilience:{family:1}})
    ]),
    mkMission('family-neighbourhood',2,'delivery',L('Куда растёт пригород?','Where does the suburb grow?'),
      L('Застройщик предлагает новые дома. Но семья выбирает не квадратные метры отдельно от работы, школы и детского сада. Решение изменит приток жителей и спрос на услуги.', 'A developer proposes new homes. Families choose housing together with jobs, schools and childcare. This decision changes arrivals and demand for services.'),
      L('Согласовать жильё, услуги и транспорт: рост без инфраструктуры создаёт новые очереди.', 'Coordinate housing, services and transport: growth without infrastructure creates queues.'), [
      mkAction('complete-neighbourhood',L('Строить вместе с инфраструктурой','Build a complete neighbourhood'),L('Жильё, детский сад и школа вводятся согласованно. Дороже и медленнее, зато спрос не оставлен без ответа.','Housing, nursery and school open together. Slower and costlier, but demand is matched by services.'),3.2,{support:4,development:6},{housing:16000,childcare:2600,school:3800,schoolStaff:3800},{kind:'capital',lag:2,duration:14,annualOpex:0.36,debtEligible:true,adminLoad:2.6},{icon:'house',flag:{key:'suburbGrowth',value:'complete'},resilience:{family:4}}),
      mkAction('commuter-link',L('Связать жильё и рабочие места','Connect homes and jobs'),L('Усилить маршрут в центр и промышленный пояс. Люди могут работать в соседней территории, не переезжая.','Improve routes to the centre and industrial belt. Residents can commute instead of moving.'),1.6,{support:3,development:5},{mobility:0.22,schoolReach:0.35},{kind:'capital',lag:1,duration:10,annualOpex:0.28,debtEligible:true},{icon:'bus',flag:{key:'suburbGrowth',value:'link'},resilience:{family:2}}),
      mkAction('housing-first',L('Сначала разрешить новые дома','Approve housing first'),L('Больше доступного жилья уже скоро. Школы и детские сады не увеличатся автоматически.','More housing soon. Schools and childcare will not expand automatically.'),0.85,{support:5,development:4},{housing:35000},{kind:'capital',lag:1,duration:12,annualOpex:0.12,debtEligible:true},{icon:'house',flag:{key:'suburbGrowth',value:'housing'},resilience:{family:-1}})
    ]),
    mkMission('childcare-queue',3,'crisis',L('Очередь в детский сад','The childcare queue'),
      L('В новом пригороде родители не могут вернуться к работе. Требуется выбрать, как расширить уход за детьми, не обещая немедленный ввод капитального объекта.', 'Parents in the new suburb cannot return to work. Decide how to expand childcare without promising instant construction.'),
      L('Сократить нехватку мест и открыть родителям путь к занятости.', 'Reduce the shortage of places and help parents return to work.'), [
      mkAction('modular-nursery',L('Открыть модульные детские сады','Open modular nurseries'),L('Создать постоянные места с подготовленными сотрудниками. Результат появится после ввода.','Create staffed, permanent places. Results arrive after opening.'),2.3,{support:4,development:5},{childcare:5500},{kind:'capital',lag:1,duration:12,annualOpex:0.32,debtEligible:true,reserveEligible:true},{icon:'school',resilience:{family:4}}),
      mkAction('licensed-childminders',L('Поддержать семейные группы ухода','Support licensed childminders'),L('Быстро расширить небольшой локальный уход с контролем качества. Финансирование ограничено сроком.','Quickly expand small local childcare groups with quality checks. Funding is time-limited.'),1.1,{support:5,development:2},{childcare:3100},{annualOpex:0.24,duration:4,reserveEligible:true},{icon:'people',resilience:{family:2}}),
      mkAction('flexible-employers',L('Договориться о гибком графике','Negotiate flexible work'),L('Части родителей станет проще работать. Новых мест в детских садах эта мера не создаёт.','Some parents can work more easily. This does not create nursery places.'),0.65,{support:3,development:2},{flexWork:0.07},{annualOpex:0.12,duration:3,reserveEligible:true},{icon:'clock',resilience:{family:1}})
    ]),
    mkMission('generations-city',4,'legacy',L('Город для разных поколений','A place for every generation'),
      L('Первые жители стали старше, дети выросли, а новые семьи продолжают приезжать. Какую систему услуг оставить после своего срока?', 'The first residents have aged, their children have grown up and new families keep arriving. What system of services will you leave behind?'),
      L('Выбрать наследие под меняющуюся структуру населения, а не под один показатель.', 'Choose a legacy that fits a changing population, not a single indicator.'), [
      mkAction('mixed-generations',L('Объединить семейные и районные услуги','Integrate neighbourhood services'),L('Связать первичную помощь, уход за детьми и общие пространства. Работает для разных возрастов.','Connect primary care, childcare and shared spaces across ages.'),2.5,{support:5,development:5},{health:14000,healthStaff:14000,childcare:2100,school:1800,schoolStaff:1800},{kind:'capital',lag:1,duration:14,annualOpex:0.3,debtEligible:true},{icon:'house',resilience:{family:3,health:1}}),
      mkAction('age-friendly-routes',L('Сделать район доступным старшим','Make the district age-friendly'),L('Доступный транспорт и помощь на дому улучшают жизнь пожилых. Это не заменяет школы для новых детей.','Accessible transport and home care help older residents. They do not replace schools for children.'),1.25,{support:6,development:2},{mobility:0.1,elderCare:0.22,healthStaff:8000},{annualOpex:0.26,duration:8},{icon:'health',resilience:{family:2,health:2}}),
      mkAction('family-grant',L('Дать семьям временную поддержку','Offer temporary family support'),L('Выплаты помогают сейчас, но не создают новые школы и рабочие места. Срок программы ограничен.','Payments help now but create no schools or jobs. The programme has an end date.'),0.8,{support:7,development:1},{familySupport:0.10},{annualOpex:0.33,duration:3},{icon:'people',resilience:{family:1}})
    ])
  ];
  // The final audit remains the final mission. All original content is preserved.
  const previous = DATA.missions.slice();
  DATA.missions = [];
  for (let ch=1;ch<=4;ch++) {
    const chapter = previous.filter(m=>m.chapter===ch);
    if(ch===4) DATA.missions.push(...chapter.slice(0,-1),missions[ch-1],chapter.at(-1));
    else DATA.missions.push(...chapter,missions[ch-1]);
  }
  missions.forEach(m=>m.actions.forEach((a,i)=>{
    a.tags.push(m.threadPhase); DATA.financeProfiles[a.id]=a.finance;
    a.mapObject={icon:a.icon,position:{x:Math.min(94,suburb.position.x+(i-1)*5),y:Math.min(88,suburb.position.y+4+m.chapter*2)}};
  }));
  // A five-place residential geography sits behind the four old story districts.
  DATA.quests.push({ id:'service-access', icon:'school', title:L('Не оставить периферию','Leave no place behind'),
    description:L('К концу срока улучшить медицинскую доступность севера и школы пригорода относительно старта.','Improve northern healthcare and suburban school access relative to the start.'),
    evaluate:s=>s.population ? Math.min(1,((s.population.derived?.municipalities?.north?.healthAccess||0)+(s.population.derived?.municipalities?.suburb?.schoolAccess||0))/1.7) : 0,
    complete:s=>Boolean(s.completed&&s.population&&s.population.derived.municipalities.north.healthAccess>s.population.initial.access.north.healthAccess+0.02&&s.population.derived.municipalities.suburb.schoolAccess>s.population.initial.access.suburb.schoolAccess+0.02) });
  DATA.scenarios.forEach(s=>{s.rules.districtEffects.suburb=s.id==='demographic'?1.10:1;});
  DATA.stage4Ready=true;
  root.GovernorGame=root.GovernorGame||{};root.GovernorGame.DATA=DATA;
  if(typeof module!=='undefined'&&module.exports)module.exports=DATA;
})(typeof window!=='undefined'?window:globalThis);
