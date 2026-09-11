(function (root) {
  'use strict';

  const DATA = root.GovernorGame && root.GovernorGame.DATA
    ? root.GovernorGame.DATA
    : (typeof require === 'function' ? require('./game-data.js') : null);

  if (!DATA) throw new Error('GovernorGame.DATA must be loaded before stage3-data.js');
  if (DATA.stage3Ready) {
    if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
    return;
  }

  const L = DATA.L;

  Object.assign(DATA.ui.ru, {
    appSubtitle: 'Строй регион. Переживай кризисы. Формируй наследие.',
    startLead: 'Шестнадцать связанных миссий образуют полноценную историю губернаторского срока: от первых обещаний и запуска реформ до кризисов, восстановления и публичного аудита. Карта меняется вместе с вашими решениями, проекты взаимодействуют друг с другом, а советники запоминают ваш стиль управления.',
    demoBadge: 'Этап 3 · живая кампания и изменяющийся регион',
    featureMission: '16 миссий в четырёх сюжетных главах',
    featureConsequences: 'карта хранит построенные объекты и последствия',
    featureOffline: 'синергии, конфликты, задержки и повторные прохождения',
    chapterOne: 'Мандат и выбор курса',
    chapterTwo: 'Реализация реформ',
    chapterThree: 'Кризисная проверка',
    chapterFour: 'Наследие и аудит',
    navJournal: 'История',
    journalTitle: 'История губернаторского срока',
    journalLead: 'Каждая глава сохраняет решения, способы финансирования, срывы сроков и последствия. Это уже не набор независимых карточек, а единая история региона.',
    chapterStatusCurrent: 'Текущая глава',
    chapterStatusDone: 'Завершена',
    chapterStatusLocked: 'Впереди',
    worldChanges: 'Изменения на карте',
    noWorldChanges: 'Первый объект появится после принятия решения.',
    projectOnMap: 'Объект на карте',
    placementTitle: 'Где реализовать решение',
    placementHint: 'Территориальный выбор меняет цену, сроки и распределение эффекта.',
    recommendedPlacement: 'Рекомендуемая территория',
    synergy: 'Синергия',
    conflict: 'Конфликт',
    portfolioInteraction: 'Связь с прежними решениями',
    noInteractions: 'Прямых связей с прежними проектами пока нет.',
    deliveryRisk: 'Риск реализации',
    deliveryLow: 'Низкий',
    deliveryMedium: 'Средний',
    deliveryHigh: 'Высокий',
    deliveryOutcome: 'Как прошла реализация',
    deliveryOnTime: 'По плану',
    deliveryDelayed: 'Задержка',
    deliveryOverrun: 'Удорожание',
    deliveryPartial: 'Неполное исполнение',
    deliveryOnTimeText: 'Проект прошёл согласования и стартовал без существенных отклонений.',
    deliveryDelayedText: 'Согласования и подготовка площадки заняли дополнительный ход.',
    deliveryOverrunText: 'Фактическая стоимость превысила план; разница покрыта доступными стабилизационными источниками.',
    deliveryPartialText: 'Часть мероприятий выполнена, но фактический эффект оказался ниже ожидаемого.',
    expectedRange: 'Ожидаемый диапазон',
    actualResult: 'Фактический результат',
    councilSplit: 'Совет разделён',
    councilAgreement: 'Совет в основном согласен',
    advisorTrust: 'Доверие советника',
    advisorApproved: 'Поддерживает',
    advisorCautious: 'Сомневается',
    advisorOpposed: 'Возражает',
    advisorMemory: 'Что запомнил советник',
    startChallenge: 'Режим повторного прохождения',
    challengeHint: 'Дополнительные режимы открываются после завершения кампаний и меняют правила, а не только цифры.',
    challengeStandard: 'Стандартная кампания',
    challengeNoDebt: 'Без новых заимствований',
    challengeHardSeason: 'Тяжёлый сезон',
    challengeFog: 'Неопределённая экспертиза',
    challengeLocked: 'Откроется после завершения кампании',
    challengeReward: 'Множитель награды',
    challengeActive: 'Активное испытание',
    challengeStandardDesc: 'Полные правила и открытый прогноз последствий.',
    challengeNoDebtDesc: 'Новые региональные облигации недоступны. Казна и софинансирование становятся критически важными.',
    challengeHardSeasonDesc: 'Кризисы сильнее, резерв меньше, а проекты чаще сталкиваются с задержками и удорожанием.',
    challengeFogDesc: 'До утверждения видны направления эффектов, но не точные значения.',
    replayProgress: 'Прогресс метакампании',
    campaignsCompleted: 'Завершено кампаний',
    newChallengeUnlocked: 'Открыт новый режим',
    mapLegendDelivery: 'строится',
    mapLegendActive: 'работает',
    mapLegendLegacy: 'часть наследия',
    headline: 'Сводка региона',
    threadDesign: 'Проектирование',
    threadDelivery: 'Реализация',
    threadCrisis: 'Испытание',
    threadLegacy: 'Наследие',
    location: 'Территория',
    costVariation: 'Отклонение стоимости',
    scheduleVariation: 'Отклонение срока',
    effectRealisation: 'Реализация эффекта',
    exactForecastHidden: 'Точный прогноз скрыт правилами испытания.',
    modelStage: 'Живая кампания 3.0',
    endSubtitle: 'Ваш стиль управления сформирован шестнадцатью решениями, качеством их реализации и тем, какое наследие они оставили региону.'
  });

  Object.assign(DATA.ui.en, {
    appSubtitle: 'Build the region. Survive crises. Shape a legacy.',
    startLead: 'Sixteen connected missions form a complete term in office: from promises and reform delivery to crises, recovery and public audit. The map changes with your choices, projects interact and advisers remember your governing style.',
    demoBadge: 'Stage 3 · living campaign and changing region',
    featureMission: '16 missions across four story chapters',
    featureConsequences: 'the map remembers projects and consequences',
    featureOffline: 'synergies, conflicts, delivery risk and replay modes',
    chapterOne: 'Mandate and direction',
    chapterTwo: 'Reform delivery',
    chapterThree: 'Crisis test',
    chapterFour: 'Legacy and audit',
    navJournal: 'Story',
    journalTitle: 'Your term in office',
    journalLead: 'Every chapter preserves choices, funding, delivery failures and consequences. This is one regional story rather than a stack of independent cards.',
    chapterStatusCurrent: 'Current chapter',
    chapterStatusDone: 'Complete',
    chapterStatusLocked: 'Ahead',
    worldChanges: 'Changes on the map',
    noWorldChanges: 'Your first visible project will appear after a decision.',
    projectOnMap: 'Map object',
    placementTitle: 'Choose the location',
    placementHint: 'Location changes cost, timing and who receives the benefit.',
    recommendedPlacement: 'Recommended location',
    synergy: 'Synergy',
    conflict: 'Conflict',
    portfolioInteraction: 'Interaction with earlier choices',
    noInteractions: 'No direct interaction with the existing portfolio yet.',
    deliveryRisk: 'Delivery risk',
    deliveryLow: 'Low',
    deliveryMedium: 'Medium',
    deliveryHigh: 'High',
    deliveryOutcome: 'Delivery outcome',
    deliveryOnTime: 'On plan',
    deliveryDelayed: 'Delayed',
    deliveryOverrun: 'Cost overrun',
    deliveryPartial: 'Partial delivery',
    deliveryOnTimeText: 'Approvals and mobilisation were completed without material deviation.',
    deliveryDelayedText: 'Approvals and site preparation added one extra turn.',
    deliveryOverrunText: 'Actual cost exceeded the plan; the difference was covered through available stabilisation sources.',
    deliveryPartialText: 'Part of the programme was delivered, but realised effects were below expectations.',
    expectedRange: 'Expected range',
    actualResult: 'Realised result',
    councilSplit: 'Council divided',
    councilAgreement: 'Council broadly aligned',
    advisorTrust: 'Adviser trust',
    advisorApproved: 'Supports',
    advisorCautious: 'Cautious',
    advisorOpposed: 'Opposes',
    advisorMemory: 'What the adviser remembers',
    startChallenge: 'Replay mode',
    challengeHint: 'Additional modes unlock after completed campaigns and change the rules, not just the numbers.',
    challengeStandard: 'Standard campaign',
    challengeNoDebt: 'No new borrowing',
    challengeHardSeason: 'Hard season',
    challengeFog: 'Uncertain evidence',
    challengeLocked: 'Unlocks after completing a campaign',
    challengeReward: 'Reward multiplier',
    challengeActive: 'Active challenge',
    challengeStandardDesc: 'Full rules with transparent forecasts.',
    challengeNoDebtDesc: 'New regional bonds are unavailable. Treasury and co-financing become critical.',
    challengeHardSeasonDesc: 'Crises are stronger, reserves smaller and projects face more delays and overruns.',
    challengeFogDesc: 'Forecast directions are visible, but exact values remain hidden until confirmation.',
    replayProgress: 'Meta-campaign progress',
    campaignsCompleted: 'Campaigns completed',
    newChallengeUnlocked: 'New mode unlocked',
    mapLegendDelivery: 'under construction',
    mapLegendActive: 'operating',
    mapLegendLegacy: 'part of your legacy',
    headline: 'Regional briefing',
    threadDesign: 'Design',
    threadDelivery: 'Delivery',
    threadCrisis: 'Test',
    threadLegacy: 'Legacy',
    location: 'Location',
    costVariation: 'Cost variation',
    scheduleVariation: 'Schedule variation',
    effectRealisation: 'Effect realisation',
    exactForecastHidden: 'Exact values are hidden by the current challenge rules.',
    modelStage: 'Living campaign 3.0',
    endSubtitle: 'Your leadership style was shaped by sixteen choices, how well they were delivered and the legacy they left across the region.'
  });

  const chapters = [
    { id: 1, key: 'chapterOne', titleKey: 'chapterOne', phase: 'design', icon: 'flag', color: 'mandate' },
    { id: 2, key: 'chapterTwo', titleKey: 'chapterTwo', phase: 'delivery', icon: 'construction', color: 'delivery' },
    { id: 3, key: 'chapterThree', titleKey: 'chapterThree', phase: 'crisis', icon: 'warning', color: 'crisis' },
    { id: 4, key: 'chapterFour', titleKey: 'chapterFour', phase: 'legacy', icon: 'trophy', color: 'legacy' }
  ];

  const challenges = [
    {
      id: 'standard', nameKey: 'challengeStandard', descriptionKey: 'challengeStandardDesc', unlockAfter: 0,
      rewardMultiplier: 1, rules: {}
    },
    {
      id: 'no-debt', nameKey: 'challengeNoDebt', descriptionKey: 'challengeNoDebtDesc', unlockAfter: 1,
      rewardMultiplier: 1.2, rules: { noNewDebt: true }
    },
    {
      id: 'hard-season', nameKey: 'challengeHardSeason', descriptionKey: 'challengeHardSeasonDesc', unlockAfter: 1,
      rewardMultiplier: 1.3, rules: { crisisRisk: 1, reserveDelta: -0.7, deliveryRisk: 0.12, costMultiplier: 1.04 }
    },
    {
      id: 'fog', nameKey: 'challengeFog', descriptionKey: 'challengeFogDesc', unlockAfter: 2,
      rewardMultiplier: 1.4, rules: { hideExactPreview: true, deliveryRisk: 0.05 }
    }
  ];

  const scenarioRules = {
    balanced: {
      costMultiplier: 1, deliveryRisk: 0.08, revenueGrowth: 0.004, mandatoryGrowth: 0.008,
      districtEffects: { north: 1, industrial: 1, river: 1, capital: 1 }
    },
    demographic: {
      costMultiplier: 1.02, deliveryRisk: 0.11, revenueGrowth: 0.002, mandatoryGrowth: 0.011,
      districtEffects: { north: 1.08, industrial: 1.14, river: 0.98, capital: 1 },
      story: L('Сокращение рабочей силы усиливает ценность кадровых и медицинских решений.', 'A shrinking workforce increases the value of skills and healthcare choices.')
    },
    infrastructure: {
      costMultiplier: 1.06, capitalCostMultiplier: 1.08, deliveryRisk: 0.16, revenueGrowth: 0.003, mandatoryGrowth: 0.012,
      districtEffects: { north: 1, industrial: 1.04, river: 1.15, capital: 0.98 },
      story: L('Износ сетей повышает стоимость капитальных проектов, но делает профилактику особенно ценной.', 'Asset deterioration raises capital costs while making preventive investment especially valuable.')
    },
    digital: {
      costMultiplier: 1.01, deliveryRisk: 0.10, revenueGrowth: 0.006, mandatoryGrowth: 0.007,
      districtEffects: { north: 1, industrial: 1.05, river: 0.98, capital: 1.18 },
      story: L('Сильная цифровая база ускоряет сервисы, но повышает цену киберошибки.', 'A strong digital base accelerates services but raises the cost of cyber failure.')
    }
  };

  DATA.scenarios.forEach(scenario => {
    scenario.rules = Object.assign({}, scenarioRules[scenario.id] || scenarioRules.balanced);
  });

  const advisorMemory = {
    mira: L('Запоминает, кто реально получил доступ к услуге, а не только среднее изменение показателя.', 'Remembers who actually gained access to a service, not only the average score.'),
    ilya: L('Сопоставляет решения между главами и ищет портфель, который усиливает сам себя.', 'Connects choices across chapters and looks for a portfolio that reinforces itself.'),
    elena: L('Следит за тем, были ли обещания понятны, честны и выполнены в обозначенный срок.', 'Tracks whether promises were clear, honest and delivered on time.'),
    viktor: L('Запоминает источники финансирования, удорожание и будущую стоимость эксплуатации.', 'Remembers funding sources, cost overruns and future operating commitments.')
  };
  DATA.advisors.forEach(advisor => {
    advisor.memory = advisorMemory[advisor.id];
  });

  const P = (id, ru, en, icon, position, modifiers) => Object.assign({
    id, title: L(ru, en), icon, position, costMultiplier: 1, delayDelta: 0,
    effects: {}, resilience: {}, recommended: false
  }, modifiers || {});

  const newMissions = [
    {
      id: 'health-delivery', chapter: 2, threadPhase: 'delivery', districtId: 'north', icon: 'construction',
      art: 'assets/art/health-delivery.webp', kicker: L('Реализация реформы', 'Reform delivery'),
      title: L('Северная медицина: первый год реализации', 'Northern healthcare: first year of delivery'),
      description: L('Первое решение принято, но зимняя логистика, нехватка специалистов и разные интересы муниципалитетов угрожают срокам. Нужно выбрать организационную модель следующего этапа.', 'The first choice has been made, but winter logistics, staff shortages and municipal competition threaten delivery. Choose the operating model for the next phase.'),
      objective: L('Превратить обещание в работающую услугу и определить, где жители почувствуют изменения раньше всего.', 'Turn the promise into an operating service and decide where residents should feel the change first.'),
      reward: { xp: 150, stars: 3 }, debate: ['mira', 'viktor'],
      placements: [
        P('remote-cluster', 'Удалённый кластер поселений', 'Remote settlement cluster', 'map', { x: 42, y: 13 }, { costMultiplier: 1.08, effects: { support: 2 }, resilience: { health: 1 }, recommended: true }),
        P('district-centre', 'Районный центр', 'District centre', 'clinic', { x: 51, y: 22 }, { effects: { development: 1 } }),
        P('transport-junction', 'Транспортный узел', 'Transport junction', 'bus', { x: 56, y: 29 }, { costMultiplier: 0.94, delayDelta: -1, effects: { support: -1, development: 1 } })
      ],
      advisors: {
        mira: L('Удалённые поселения дадут меньший средний охват, но именно там цена недоступности выше всего.', 'Remote settlements offer a smaller headline number, but the cost of poor access is highest there.'),
        ilya: L('Свяжите медицину с цифровой инфраструктурой и подготовкой кадров: отдельный объект не создаст систему.', 'Connect healthcare to digital infrastructure and workforce training: one building does not create a system.'),
        elena: L('Муниципалитеты должны заранее знать график, критерии выбора площадки и минимальный стандарт услуги.', 'Municipalities need a timetable, site criteria and a minimum service standard before construction starts.'),
        viktor: L('Площадка меняет не только политический эффект, но и строительную цену, логистику и будущие расходы.', 'Location changes not only political impact but construction cost, logistics and future operations.')
      },
      actions: [
        {
          id: 'medical-hub', icon: 'clinic', art: 'assets/art/health-delivery.webp', tags: ['health', 'capital', 'access'],
          title: L('Создать межрайонный медицинский хаб', 'Create an inter-district medical hub'),
          description: L('Диагностика, дневной стационар и координация выездных служб в одном узле.', 'Diagnostics, day care and coordination of mobile services in one hub.'),
          cost: 3.6, effects: { support: 2, development: 6 }, resilience: { health: 3 },
          flag: { key: 'healthDelivery', value: 'hub' }, xp: 155, stars: 3,
          interactions: [
            { type: 'synergy', when: { flag: 'healthStrategy', values: ['clinics', 'training'] }, effects: { development: 2 }, resilience: { health: 1 }, text: L('Первая медицинская стратегия дала хабу готовые кадры или инфраструктурную основу.', 'The first healthcare strategy supplied the hub with staff or an infrastructure base.') },
            { type: 'conflict', when: { flag: 'healthStrategy', values: ['mobile'] }, effects: { support: -1 }, text: L('Хаб конкурирует за кадры с уже развёрнутыми мобильными бригадами.', 'The hub competes for staff with the existing mobile teams.') }
          ],
          advisorAffinity: { mira: 1, ilya: 2, elena: 0, viktor: -1 },
          future: L('Хаб усилит эпидемиологическую готовность, если будет связан с первичным звеном и транспортом.', 'The hub strengthens epidemic readiness if linked to primary care and transport.'),
          outcome: L('Проект объединяет дефицитных специалистов и оборудование, но требует сложной координации маршрутов пациентов.', 'The project pools scarce specialists and equipment but requires complex patient-routing coordination.')
        },
        {
          id: 'telemedicine-network', icon: 'telemedicine', art: 'assets/art/health-mobile.webp', tags: ['health', 'digital', 'access'],
          title: L('Связать ФАПы телемедицинской сетью', 'Connect rural clinics through telemedicine'),
          description: L('Удалённые консультации, единая запись и дистанционная диагностика.', 'Remote consultation, unified appointments and distance diagnostics.'),
          cost: 2.2, effects: { support: 3, development: 5 }, resilience: { health: 3, digital: 1 },
          flag: { key: 'healthDelivery', value: 'telemedicine' }, xp: 150, stars: 3,
          interactions: [
            { type: 'synergy', when: { flag: 'healthStrategy', values: ['training'] }, effects: { development: 2 }, resilience: { health: 1 }, text: L('Подготовленные местные кадры умеют использовать телемедицинские протоколы.', 'Locally trained staff can use telemedicine protocols effectively.') },
            { type: 'synergy', when: { flag: 'digitalStrategy', values: ['cyber', 'portal'] }, effects: { development: 1 }, resilience: { digital: 1 }, text: L('Ранее созданная цифровая архитектура сокращает стоимость интеграции.', 'The existing digital architecture reduces integration friction.') }
          ],
          advisorAffinity: { mira: 1, ilya: 2, elena: 1, viktor: 1 },
          future: L('Сеть ускорит реакцию на эпидемию, но будет зависеть от киберустойчивости и связи.', 'The network accelerates epidemic response but depends on cyber resilience and connectivity.'),
          outcome: L('Регион создаёт единый клинический контур и переводит часть консультаций в дистанционный формат.', 'The region creates a shared clinical network and moves part of specialist consultation online.')
        },
        {
          id: 'municipal-health-contracts', icon: 'handshake', art: 'assets/art/health-training.webp', tags: ['health', 'coordination', 'operating'],
          title: L('Заключить муниципальные контракты доступности', 'Sign municipal access contracts'),
          description: L('Фиксированные стандарты времени ожидания, маршрутов и ответственности районов.', 'Clear standards for waiting time, routes and municipal responsibility.'),
          cost: 1.4, effects: { support: 5, development: 2 }, resilience: { health: 2 },
          flag: { key: 'healthDelivery', value: 'contracts' }, xp: 135, stars: 2,
          interactions: [
            { type: 'synergy', when: { flag: 'healthStrategy', values: ['mobile'] }, effects: { support: 2 }, resilience: { health: 1 }, text: L('Контракты превращают мобильные маршруты в устойчивую муниципальную услугу.', 'The contracts turn mobile routes into a stable municipal service.') }
          ],
          advisorAffinity: { mira: 2, ilya: 0, elena: 2, viktor: 1 },
          future: L('Контракты улучшают координацию, но без кадров и оборудования имеют ограниченный потолок.', 'Contracts improve coordination but remain constrained without staff and equipment.'),
          outcome: L('Муниципалитеты получают единый стандарт и публичные сроки, а губернатор – систему контроля исполнения.', 'Municipalities receive a common standard and public timetable, while the governor gains an accountability system.')
        }
      ]
    },
    {
      id: 'industrial-transition', chapter: 2, threadPhase: 'delivery', districtId: 'industrial', icon: 'factory',
      art: 'assets/art/industrial-transition.webp', kicker: L('Реализация реформы', 'Reform delivery'),
      title: L('Промышленный пояс меняет специализацию', 'The industrial belt changes direction'),
      description: L('Крупный работодатель модернизирует производство. Регион должен решить, как связать новые инвестиции с местными поставщиками, рабочими местами и экологическими ограничениями.', 'A major employer is modernising production. The region must connect investment to local suppliers, jobs and environmental constraints.'),
      objective: L('Не допустить, чтобы модернизация увеличила выпуск, но оставила молодёжь и малый бизнес за пределами роста.', 'Prevent modernisation from raising output while leaving youth and local firms outside the growth path.'),
      reward: { xp: 155, stars: 3 }, debate: ['ilya', 'mira'],
      placements: [
        P('old-industrial-city', 'Старый промышленный город', 'Old industrial city', 'factory', { x: 24, y: 58 }, { effects: { support: 2 }, costMultiplier: 1.04, recommended: true }),
        P('small-town-belt', 'Пояс малых городов', 'Small-town belt', 'community', { x: 19, y: 47 }, { effects: { support: 1 }, resilience: { jobs: 1 }, delayDelta: 1 }),
        P('logistics-corridor', 'Логистический коридор', 'Logistics corridor', 'bridge', { x: 36, y: 61 }, { effects: { development: 2 }, costMultiplier: 0.96 })
      ],
      advisors: {
        mira: L('Модернизация должна сохранить переходные доходы семей и не сосредоточить выгоды в одном предприятии.', 'Modernisation should protect household income during transition and spread benefits beyond one firm.'),
        ilya: L('Локальная сеть поставщиков и университетов создаст больше устойчивости, чем ещё одна отдельная льгота инвестору.', 'A local supplier and university network creates more resilience than another isolated investor incentive.'),
        elena: L('Работникам нужно честно объяснить, какие профессии исчезнут и какие маршруты переобучения реально доступны.', 'Workers need an honest account of which jobs will disappear and which retraining routes are real.'),
        viktor: L('Не превращайте временную компенсацию в постоянное обязательство без понятного источника.', 'Do not turn temporary compensation into a permanent commitment without a clear funding source.')
      },
      actions: [
        {
          id: 'supplier-clusters', icon: 'handshake', art: 'assets/art/industrial-transition.webp', tags: ['jobs', 'sme', 'network'],
          title: L('Создать сеть местных поставщиков', 'Build a local supplier network'),
          description: L('Сертификация, льготное оборудование и контракты между крупным заводом и МСП.', 'Certification, equipment support and contracts between the anchor plant and SMEs.'),
          cost: 2.8, effects: { support: 2, development: 6 }, resilience: { jobs: 4 },
          flag: { key: 'industrialDelivery', value: 'suppliers' }, xp: 160, stars: 3,
          interactions: [
            { type: 'synergy', when: { flag: 'jobsStrategy', values: ['skills', 'park'] }, effects: { development: 2 }, resilience: { jobs: 1 }, text: L('Кадровый контракт или индустриальная площадка уже создали основу сети поставщиков.', 'The skills compact or industrial site already created a foundation for the supplier network.') }
          ],
          advisorAffinity: { mira: 1, ilya: 2, elena: 0, viktor: 1 },
          future: L('Сеть поставщиков смягчит будущий отток молодёжи и зависимость от одного работодателя.', 'The supplier network reduces future youth outmigration and dependence on one employer.'),
          outcome: L('Регион помогает МСП войти в производственные цепочки и связывает поддержку с реальными заказами.', 'The region helps SMEs enter production chains and ties support to real contracts.')
        },
        {
          id: 'clean-line-modernisation', icon: 'factory', art: 'assets/art/industrial-green.webp', tags: ['jobs', 'capital', 'green'],
          title: L('Софинансировать чистую производственную линию', 'Co-finance a clean production line'),
          description: L('Высокая производительность и меньшие выбросы, но заметная капитальная цена.', 'Higher productivity and lower emissions at a significant capital cost.'),
          cost: 4.0, effects: { support: 1, development: 8 }, resilience: { jobs: 3, flood: 1 },
          flag: { key: 'industrialDelivery', value: 'modernisation' }, xp: 170, stars: 4,
          interactions: [
            { type: 'synergy', when: { flag: 'jobsStrategy', values: ['park'] }, effects: { development: 2 }, text: L('Индустриальная площадка ускоряет подключение новой линии к инфраструктуре.', 'The industrial site accelerates connection of the new line to infrastructure.') },
            { type: 'conflict', when: { flag: 'jobsStrategy', values: ['subsidy'] }, effects: { support: -1 }, text: L('Работники воспринимают автоматизацию как отказ от обещания быстро сохранить рабочие места.', 'Workers see automation as a retreat from the promise of rapid job protection.') }
          ],
          advisorAffinity: { mira: -1, ilya: 2, elena: -1, viktor: 0 },
          future: L('Модернизация повышает доходную базу, но потребует нового пакета переобучения.', 'Modernisation strengthens the revenue base but creates a new retraining need.'),
          outcome: L('Регион входит в проект вместе с инвестором и закрепляет экологические и кадровые условия соглашения.', 'The region joins the investor project with environmental and workforce conditions attached.')
        },
        {
          id: 'worker-income-guarantee', icon: 'people', art: 'assets/art/youth-event.webp', tags: ['jobs', 'support', 'operating'],
          title: L('Гарантировать доход на период переобучения', 'Guarantee income during retraining'),
          description: L('Сильная защита семей в переходный период, но слабый самостоятельный импульс развитию.', 'Strong household protection during transition but limited standalone development impact.'),
          cost: 2.4, effects: { support: 7, development: 1 }, resilience: { jobs: 1 },
          flag: { key: 'industrialDelivery', value: 'guarantee' }, xp: 135, stars: 2,
          interactions: [
            { type: 'conflict', when: { flag: 'jobsStrategy', values: ['subsidy'] }, effects: { development: -1 }, text: L('Две компенсационные программы начинают заменять структурные изменения.', 'Two compensation schemes begin to substitute for structural reform.') },
            { type: 'synergy', when: { flag: 'jobsStrategy', values: ['skills'] }, effects: { support: 2 }, resilience: { jobs: 1 }, text: L('Гарантия дохода делает уже созданную траекторию переобучения реально доступной.', 'Income protection makes the existing retraining pathway genuinely accessible.') }
          ],
          advisorAffinity: { mira: 2, ilya: -1, elena: 2, viktor: -2 },
          future: L('Гарантия снижает социальную цену перехода, но без новых рабочих мест не остановит отток.', 'The guarantee lowers the social cost of transition but cannot stop outmigration without new jobs.'),
          outcome: L('Работники получают временную защиту, связанную с прохождением подтверждённой программы переобучения.', 'Workers receive temporary protection tied to participation in an accredited retraining programme.')
        }
      ]
    },
    {
      id: 'river-land-use', chapter: 2, threadPhase: 'delivery', districtId: 'river', icon: 'map',
      art: 'assets/art/river-land-use.webp', kicker: L('Реализация реформы', 'Reform delivery'),
      title: L('Кому принадлежит пойма', 'Who owns the floodplain'),
      description: L('После первых противопаводковых решений инвесторы предлагают новые склады и жильё у реки. Муниципалитеты видят доходы, гидрологи – растущий риск.', 'After the first flood-preparedness measures, investors propose warehouses and housing along the river. Municipalities see revenue; hydrologists see growing risk.'),
      objective: L('Выбрать модель землепользования, которая определит масштаб будущего паводка и траекторию развития долины.', 'Choose a land-use model that will shape both the next flood and the valley’s development path.'),
      reward: { xp: 160, stars: 3 }, debate: ['ilya', 'elena'],
      placements: [
        P('upstream', 'Верховья и лесной пояс', 'Upstream forest belt', 'shield-water', { x: 70, y: 31 }, { resilience: { flood: 1 }, effects: { development: -1 } }),
        P('river-towns', 'Города средней долины', 'Middle-valley towns', 'community', { x: 74, y: 44 }, { effects: { support: 2 }, recommended: true }),
        P('delta-corridor', 'Нижний транспортный коридор', 'Lower logistics corridor', 'bridge', { x: 79, y: 55 }, { effects: { development: 2 }, costMultiplier: 1.05, resilience: { flood: -1 } })
      ],
      advisors: {
        mira: L('Жителям малых городов нужен понятный стандарт компенсации и запрет на новые уязвимые объекты.', 'Small-town residents need clear compensation standards and a ban on new vulnerable assets.'),
        ilya: L('Природный буфер часто дешевле бетонной стены, но его выгоды проявятся только в момент паводка.', 'A natural buffer is often cheaper than concrete, but its value becomes visible only during a flood.'),
        elena: L('Если изменить правила застройки без диалога, решение будет правильным технически, но политически неустойчивым.', 'Changing land-use rules without dialogue may be technically correct but politically fragile.'),
        viktor: L('Логистический проект приносит доходы, но будущая ответственность за защищённость площадки останется у региона.', 'A logistics project raises revenue, but the region retains future responsibility for protection.')
      },
      actions: [
        {
          id: 'nature-buffer', icon: 'shield-water', art: 'assets/art/river-nature.webp', tags: ['flood', 'green', 'prevention'],
          title: L('Создать природный буфер долины', 'Create a natural flood buffer'),
          description: L('Восстановить пойменные луга, водоудерживающие зоны и ограничить новую застройку.', 'Restore flood meadows, water-retention areas and constrain new development.'),
          cost: 2.2, effects: { support: 4, development: 3 }, resilience: { flood: 5 },
          flag: { key: 'riverDelivery', value: 'buffer' }, xp: 170, stars: 4,
          interactions: [
            { type: 'synergy', when: { flag: 'floodStrategy', values: ['defenses', 'outreach'] }, effects: { support: 1 }, resilience: { flood: 2 }, text: L('Инженерная защита или раннее информирование дополняют природный буфер.', 'Engineering protection or early communication complements the natural buffer.') }
          ],
          advisorAffinity: { mira: 1, ilya: 2, elena: 1, viktor: 1 },
          future: L('Буфер заметно сокращает высоту и скорость паводковой волны.', 'The buffer materially reduces the height and speed of the future flood wave.'),
          outcome: L('Регион выкупает наиболее опасные участки и закрепляет природоохранный режим поймы.', 'The region acquires the most vulnerable sites and establishes a protected floodplain regime.')
        },
        {
          id: 'logistics-embankment', icon: 'bridge', art: 'assets/art/flood-infrastructure.webp', tags: ['flood', 'capital', 'logistics'],
          title: L('Совместить дамбу и логистический коридор', 'Combine a levee with a logistics corridor'),
          description: L('Дорогой проект развития, который одновременно защищает часть долины.', 'An expensive development project that also protects part of the valley.'),
          cost: 4.1, effects: { support: 2, development: 8 }, resilience: { flood: 2 },
          flag: { key: 'riverDelivery', value: 'corridor' }, xp: 165, stars: 3,
          interactions: [
            { type: 'synergy', when: { flag: 'floodStrategy', values: ['infrastructure'] }, effects: { development: 2 }, resilience: { flood: 1 }, text: L('Ранее модернизированная инфраструктура снижает стоимость подключения коридора.', 'Earlier infrastructure upgrades reduce connection costs for the corridor.') },
            { type: 'conflict', when: { flag: 'floodStrategy', values: ['outreach'] }, effects: { support: -2 }, text: L('Жители воспринимают крупную стройку как отход от обещания приоритета безопасности сообществ.', 'Residents see the megaproject as a retreat from the earlier community-safety promise.') }
          ],
          advisorAffinity: { mira: -1, ilya: 2, elena: -1, viktor: -1 },
          future: L('Коридор создаёт актив и доходы, но оставляет риск за пределами защищённой зоны.', 'The corridor creates an asset and revenue but leaves risk outside the protected zone.'),
          outcome: L('Проект объединяет транспорт, защиту и новые площадки, повышая требования к контролю стоимости.', 'The project combines transport, protection and development sites, increasing the need for cost control.')
        },
        {
          id: 'zoning-moratorium', icon: 'map', art: 'assets/art/flood-outreach.webp', tags: ['flood', 'regulation', 'prevention'],
          title: L('Ввести мораторий на уязвимую застройку', 'Impose a moratorium on vulnerable development'),
          description: L('Дешёвое регуляторное решение с высокой ценой упущенных инвестиций и конфликтом с муниципалитетами.', 'A low-cost regulatory choice with forgone investment and municipal conflict.'),
          cost: 1.0, effects: { support: 1, development: -1 }, resilience: { flood: 4 },
          flag: { key: 'riverDelivery', value: 'moratorium' }, xp: 145, stars: 3,
          interactions: [
            { type: 'synergy', when: { flag: 'floodStrategy', values: ['outreach'] }, effects: { support: 3 }, text: L('Предварительная работа с жителями делает ограничения понятными и легитимными.', 'Earlier community engagement makes the restrictions understandable and legitimate.') }
          ],
          advisorAffinity: { mira: 1, ilya: 1, elena: 2, viktor: 2 },
          future: L('Мораторий предотвращает создание новых уязвимых активов, но не защищает уже существующие.', 'The moratorium prevents new vulnerable assets but does not protect existing ones.'),
          outcome: L('Правительство публикует карту риска и временно останавливает согласование новых объектов в опасной зоне.', 'The government publishes a risk map and temporarily halts approvals in the highest-risk zone.')
        }
      ]
    },
    {
      id: 'digital-procurement', chapter: 2, threadPhase: 'delivery', districtId: 'capital', icon: 'digital',
      art: 'assets/art/digital-procurement.webp', kicker: L('Реализация реформы', 'Reform delivery'),
      title: L('Кто будет строить цифровое государство', 'Who will build the digital state'),
      description: L('После выбора цифровой стратегии начинается закупка платформы. Один подрядчик обещает скорость, университет – открытый код, а ведомства требуют совместимости со старыми системами.', 'After the digital strategy comes procurement. One vendor promises speed, the university offers open code and agencies demand compatibility with legacy systems.'),
      objective: L('Выбрать архитектуру, которая выдержит расширение сервисов, аудит и будущую кибератаку.', 'Choose an architecture that can survive service growth, audit and a future cyberattack.'),
      reward: { xp: 160, stars: 3 }, debate: ['ilya', 'viktor'],
      advisors: {
        mira: L('Цифровой сервис имеет смысл только тогда, когда уязвимые группы не теряют офлайн-доступ.', 'A digital service works only if vulnerable groups retain an offline route.'),
        ilya: L('Модульная архитектура медленнее на старте, но позволяет менять компоненты без остановки всей системы.', 'A modular architecture is slower initially but allows components to change without stopping the whole system.'),
        elena: L('Открытый канал обратной связи поможет увидеть сбой раньше официальной отчётности.', 'An open feedback channel can reveal failure before formal reporting does.'),
        viktor: L('Низкая начальная цена единственного поставщика может обернуться дорогой зависимостью в следующих главах.', 'A low initial price from one vendor may become expensive lock-in later.')
      },
      actions: [
        {
          id: 'modular-platform', icon: 'portal', art: 'assets/art/digital-procurement.webp', tags: ['digital', 'modular', 'capital'],
          title: L('Создать модульную платформу', 'Build a modular platform'),
          description: L('Единые стандарты, несколько поставщиков и независимый резервный контур.', 'Shared standards, multiple suppliers and an independent backup layer.'),
          cost: 2.5, effects: { support: 2, development: 6 }, resilience: { digital: 5 },
          flag: { key: 'digitalDelivery', value: 'modular' }, xp: 170, stars: 4,
          interactions: [
            { type: 'synergy', when: { flag: 'digitalStrategy', values: ['cyber', 'portal'] }, effects: { development: 2 }, resilience: { digital: 1 }, text: L('Выбранная ранее архитектура упрощает переход к модульной платформе.', 'The earlier architecture simplifies the transition to a modular platform.') }
          ],
          advisorAffinity: { mira: 0, ilya: 2, elena: 1, viktor: 1 },
          future: L('Модульность значительно сокращает системный ущерб кибератаки.', 'Modularity substantially reduces systemic cyberattack damage.'),
          outcome: L('Регион разделяет платформу на независимые сервисы и вводит обязательные интерфейсы обмена данными.', 'The region splits the platform into independent services and mandates interoperable data interfaces.')
        },
        {
          id: 'single-vendor-contract', icon: 'briefcase', art: 'assets/art/storm-event.webp', tags: ['digital', 'vendor', 'fast'],
          title: L('Заключить контракт с единым поставщиком', 'Sign a single-vendor contract'),
          description: L('Быстрый запуск и единая ответственность, но высокий риск технологической зависимости.', 'Fast launch and clear accountability, but high lock-in risk.'),
          cost: 1.8, effects: { support: 4, development: 5 }, resilience: { digital: 2 },
          flag: { key: 'digitalDelivery', value: 'vendor' }, xp: 135, stars: 2,
          interactions: [
            { type: 'conflict', when: { flag: 'digitalStrategy', values: ['open'] }, effects: { support: -2 }, resilience: { digital: -1 }, text: L('Закрытый контракт противоречит обещанию открытого участия и контроля.', 'The closed contract conflicts with the earlier promise of open participation and oversight.') }
          ],
          advisorAffinity: { mira: 0, ilya: -1, elena: -1, viktor: 1 },
          future: L('Сервисы появятся быстро, но единая точка отказа усилит последствия атаки.', 'Services arrive quickly, but a single point of failure amplifies future attack damage.'),
          outcome: L('Подрядчик берёт на себя полный цикл поставки и обещает быстрый ввод системы.', 'The vendor takes responsibility for the full delivery cycle and promises rapid launch.')
        },
        {
          id: 'civic-tech-lab', icon: 'dialogue', art: 'assets/art/health-training.webp', tags: ['digital', 'open', 'skills'],
          title: L('Открыть лабораторию гражданских технологий', 'Open a civic technology lab'),
          description: L('Университет, ИТ-компании и жители тестируют сервисы небольшими итерациями.', 'The university, technology firms and residents test services in small iterations.'),
          cost: 1.5, effects: { support: 6, development: 3 }, resilience: { digital: 3 },
          flag: { key: 'digitalDelivery', value: 'civic' }, xp: 150, stars: 3,
          interactions: [
            { type: 'synergy', when: { flag: 'digitalStrategy', values: ['open'] }, effects: { support: 2 }, resilience: { digital: 1 }, text: L('Открытый канал обратной связи превращается в постоянную лабораторию улучшений.', 'The open feedback channel becomes a permanent improvement lab.') }
          ],
          advisorAffinity: { mira: 1, ilya: 1, elena: 2, viktor: 0 },
          future: L('Лаборатория быстрее выявит уязвимости и поможет объяснить кризис жителям.', 'The lab identifies vulnerabilities earlier and helps explain crises to residents.'),
          outcome: L('Команды запускают малые прототипы, публичные тесты и открытый реестр проблем.', 'Teams launch small prototypes, public tests and an open issue register.')
        }
      ]
    },
    {
      id: 'health-legacy', chapter: 4, threadPhase: 'legacy', districtId: 'north', icon: 'health',
      art: 'assets/art/health-legacy.webp', kicker: L('Восстановление и аудит', 'Recovery and audit'),
      title: L('После эпидемии: какой должна стать система', 'After the epidemic: what should the system become'),
      description: L('Кризис выявил разрывы между первичным звеном, районными больницами и социальной помощью. Настало время закрепить уроки, а не просто закрыть отчёт.', 'The crisis exposed gaps between primary care, district hospitals and social support. It is time to institutionalise lessons rather than simply close the report.'),
      objective: L('Выбрать устойчивую модель, которая сохранит доступность после завершения экстренного финансирования.', 'Choose a model that preserves access after emergency funding ends.'),
      reward: { xp: 190, stars: 4 }, debate: ['mira', 'ilya'],
      advisors: {
        mira: L('Система должна сопровождать человека между медициной и социальной помощью, особенно в старших возрастах.', 'The system must accompany people across healthcare and social support, especially in older age.'),
        ilya: L('Закрепите то звено, которое лучше всего сработало в двух предыдущих миссиях.', 'Institutionalise the component that performed best across the previous two missions.'),
        elena: L('Опубликуйте не только успехи, но и районы, где время ожидания всё ещё превышает стандарт.', 'Publish not only successes but districts where waiting time still exceeds the standard.'),
        viktor: L('Экстренные мощности нельзя автоматически превращать в постоянную сеть без расчёта содержания.', 'Emergency capacity should not automatically become a permanent network without an operating-cost plan.')
      },
      actions: [
        {
          id: 'integrated-primary-care', icon: 'medical-box', art: 'assets/art/health-legacy.webp', tags: ['health', 'integration', 'legacy'],
          title: L('Создать интегрированное первичное звено', 'Build integrated primary care'),
          description: L('Единый маршрут пациента, профилактика и связь с социальной помощью.', 'A single patient pathway connecting prevention, care and social support.'),
          cost: 2.7, effects: { support: 4, development: 5 }, resilience: { health: 4 },
          flag: { key: 'healthLegacy', value: 'integrated' }, xp: 195, stars: 4,
          interactions: [
            { type: 'synergy', when: { flag: 'healthDelivery', values: ['contracts', 'telemedicine'] }, effects: { support: 2, development: 1 }, resilience: { health: 2 }, text: L('Контракты доступности или телемедицина уже связали части системы.', 'Access contracts or telemedicine already connected parts of the system.') }
          ],
          advisorAffinity: { mira: 2, ilya: 2, elena: 1, viktor: 0 },
          future: L('Интегрированное первичное звено становится устойчивым наследием медицинской кампании.', 'Integrated primary care becomes the durable legacy of the healthcare campaign.'),
          outcome: L('Регион закрепляет единые маршруты, профилактические стандарты и ответственность за непрерывность помощи.', 'The region establishes shared pathways, preventive standards and accountability for continuity of care.')
        },
        {
          id: 'long-term-care-network', icon: 'people', art: 'assets/art/health-training.webp', tags: ['health', 'social', 'legacy'],
          title: L('Развернуть сеть долговременного ухода', 'Build a long-term care network'),
          description: L('Поддержка пожилых, семейных ухаживающих и межведомственных команд.', 'Support for older residents, family carers and cross-agency teams.'),
          cost: 2.4, effects: { support: 6, development: 3 }, resilience: { health: 3 },
          flag: { key: 'healthLegacy', value: 'care' }, xp: 180, stars: 3,
          interactions: [
            { type: 'synergy', when: { scenario: 'demographic' }, effects: { support: 2, development: 1 }, resilience: { health: 1 }, text: L('В демографически стареющем регионе сеть ухода закрывает наиболее быстро растущую потребность.', 'In the ageing scenario, long-term care addresses the fastest-growing need.') },
            { type: 'synergy', when: { flag: 'healthStrategy', values: ['mobile'] }, effects: { support: 1 }, text: L('Мобильные бригады становятся частью выездной системы ухода.', 'Mobile teams become part of the home-care network.') }
          ],
          advisorAffinity: { mira: 2, ilya: 1, elena: 2, viktor: -1 },
          future: L('Сеть ухода снижает нагрузку на стационары и укрепляет доверие старших поколений.', 'The care network reduces hospital pressure and strengthens trust among older residents.'),
          outcome: L('Медицина и социальная защита формируют совместные команды и единый план сопровождения.', 'Healthcare and social protection form joint teams and a shared support plan.')
        },
        {
          id: 'hospital-consolidation', icon: 'balance', art: 'assets/art/health-clinics.webp', tags: ['health', 'efficiency', 'legacy'],
          title: L('Консолидировать неэффективные мощности', 'Consolidate underused capacity'),
          description: L('Сократить дублирование и направить средства в сильные межрайонные центры.', 'Reduce duplication and redirect resources to stronger inter-district centres.'),
          cost: 1.2, effects: { support: -2, development: 5 }, resilience: { health: 2 },
          flag: { key: 'healthLegacy', value: 'consolidation' }, xp: 155, stars: 3,
          interactions: [
            { type: 'conflict', when: { flag: 'healthStrategy', values: ['clinics'] }, effects: { support: -2 }, text: L('Закрытие части новых мощностей воспринимается как признание ошибки первой главы.', 'Closing part of the new capacity is perceived as admitting an early strategic mistake.') },
            { type: 'synergy', when: { flag: 'healthDelivery', values: ['hub'] }, effects: { development: 2 }, text: L('Межрайонный хаб даёт понятный центр новой сети.', 'The inter-district hub provides a clear centre for the redesigned network.') }
          ],
          advisorAffinity: { mira: -2, ilya: 1, elena: -2, viktor: 2 },
          future: L('Консолидация высвобождает ресурс, но требует транспортной доступности и политической честности.', 'Consolidation frees resources but requires transport access and political honesty.'),
          outcome: L('Правительство объединяет часть учреждений и концентрирует дефицитных специалистов.', 'The government merges selected facilities and concentrates scarce specialists.')
        }
      ]
    },
    {
      id: 'industrial-legacy', chapter: 4, threadPhase: 'legacy', districtId: 'industrial', icon: 'factory',
      art: 'assets/art/industrial-legacy.webp', kicker: L('Восстановление и аудит', 'Recovery and audit'),
      title: L('Экономика после оттока молодёжи', 'The economy after youth outmigration'),
      description: L('Кризис показал, какие рабочие места удерживают людей, а какие исчезают вместе с субсидией. Инвестиционный совет требует финального выбора специализации.', 'The crisis showed which jobs retain people and which disappear with subsidies. The investment council demands a final specialisation choice.'),
      objective: L('Сформировать экономическое наследие, которое сочетает производительность, карьерные траектории и устойчивую доходную базу.', 'Create an economic legacy that combines productivity, career pathways and a durable revenue base.'),
      reward: { xp: 195, stars: 4 }, debate: ['ilya', 'viktor'],
      advisors: {
        mira: L('Новая специализация должна создавать не только высокие зарплаты для немногих, но и доступные траектории роста.', 'The new specialisation should create accessible growth pathways, not only high salaries for a few.'),
        ilya: L('Университетско-промышленная связка лучше всего закрепляет знания и предпринимательство внутри региона.', 'A university-industry ecosystem best anchors knowledge and entrepreneurship within the region.'),
        elena: L('Покажите молодёжи конкретные компании, проекты и сроки, а не ещё одну стратегию на бумаге.', 'Show young people real firms, projects and timelines rather than another paper strategy.'),
        viktor: L('Разовая льгота инвестору должна иметь обратные условия по занятости и налоговой отдаче.', 'A one-off investor rebate needs clawback conditions tied to jobs and tax performance.')
      },
      actions: [
        {
          id: 'green-manufacturing', icon: 'factory', art: 'assets/art/industrial-green.webp', tags: ['jobs', 'green', 'capital', 'legacy'],
          title: L('Сформировать кластер зелёного машиностроения', 'Build a green manufacturing cluster'),
          description: L('Экспортное оборудование, энергоэффективность и новые производственные профессии.', 'Export equipment, energy efficiency and new manufacturing professions.'),
          cost: 4.2, effects: { support: 2, development: 8 }, resilience: { jobs: 4, flood: 1 },
          flag: { key: 'industrialLegacy', value: 'green' }, xp: 205, stars: 4,
          interactions: [
            { type: 'synergy', when: { flag: 'industrialDelivery', values: ['modernisation', 'suppliers'] }, effects: { development: 3 }, resilience: { jobs: 2 }, text: L('Модернизация или сеть поставщиков создали ядро нового кластера.', 'Modernisation or the supplier network created the core of the new cluster.') }
          ],
          advisorAffinity: { mira: 0, ilya: 2, elena: 1, viktor: 0 },
          future: L('Кластер укрепляет доходную базу и связывает промышленность с климатической повесткой.', 'The cluster strengthens the revenue base and connects industry to the climate agenda.'),
          outcome: L('Регион объединяет инвестиционные площадки, университетские лаборатории и экспортную поддержку.', 'The region combines investment sites, university laboratories and export support.')
        },
        {
          id: 'university-industry-city', icon: 'graduation', art: 'assets/art/youth-event.webp', tags: ['jobs', 'skills', 'urban', 'legacy'],
          title: L('Создать университетско-промышленный город', 'Create a university-industry city'),
          description: L('Кампус, технологические команды, жильё и предприятия в единой городской среде.', 'A campus, technology teams, housing and firms in one urban ecosystem.'),
          cost: 3.0, effects: { support: 5, development: 6 }, resilience: { jobs: 5, digital: 1 },
          flag: { key: 'industrialLegacy', value: 'university' }, xp: 205, stars: 4,
          interactions: [
            { type: 'synergy', when: { flag: 'jobsStrategy', values: ['skills'] }, effects: { support: 2, development: 2 }, resilience: { jobs: 1 }, text: L('Кадровый контракт превращается в полноценную городскую экосистему.', 'The skills compact grows into a full urban ecosystem.') },
            { type: 'synergy', when: { flag: 'digitalDelivery', values: ['civic', 'modular'] }, effects: { development: 1 }, text: L('Цифровая инфраструктура облегчает совместные сервисы кампуса и города.', 'Digital infrastructure supports shared campus and city services.') }
          ],
          advisorAffinity: { mira: 1, ilya: 2, elena: 2, viktor: -1 },
          future: L('Город формирует долгую траекторию удержания выпускников и предпринимателей.', 'The city creates a long-term retention path for graduates and entrepreneurs.'),
          outcome: L('Регион связывает образование, жильё, исследования и производственные проекты в одной территории.', 'The region connects education, housing, research and production projects in one place.')
        },
        {
          id: 'investor-rebate', icon: 'coins', art: 'assets/art/industrial-transition.webp', tags: ['jobs', 'incentive', 'fast'],
          title: L('Предложить крупную инвестиционную скидку', 'Offer a major investor rebate'),
          description: L('Быстрый проект и новые вакансии, но слабая гарантия местных связей и долгосрочной отдачи.', 'A fast project and new vacancies with weak guarantees of local linkage and long-term return.'),
          cost: 1.5, effects: { support: 1, development: 5 }, resilience: { jobs: 2 },
          flag: { key: 'industrialLegacy', value: 'rebate' }, xp: 150, stars: 2,
          interactions: [
            { type: 'conflict', when: { flag: 'industrialDelivery', values: ['guarantee'] }, effects: { support: -1 }, text: L('Работники видят несоразмерность между поддержкой инвестора и защитой семей.', 'Workers see an imbalance between investor support and household protection.') }
          ],
          advisorAffinity: { mira: -1, ilya: 0, elena: -1, viktor: 1 },
          future: L('Скидка даёт быстрый эффект, но оставляет регион зависимым от условий одного инвестора.', 'The rebate creates a quick effect but leaves the region dependent on one investor.'),
          outcome: L('Инвестор получает льготу при выполнении минимальных условий по рабочим местам и срокам запуска.', 'The investor receives a rebate subject to minimum job and delivery commitments.')
        }
      ]
    },
    {
      id: 'river-legacy', chapter: 4, threadPhase: 'legacy', districtId: 'river', icon: 'flood',
      art: 'assets/art/river-legacy.webp', kicker: L('Восстановление и аудит', 'Recovery and audit'),
      title: L('Восстановить долину после большой воды', 'Rebuild the valley after the great flood'),
      description: L('Часть домов и дорог повреждена. Жители хотят вернуться быстро, но повторение прежней застройки сохранит риск на десятилетия.', 'Homes and roads are damaged. Residents want a rapid return, but rebuilding the old pattern would preserve risk for decades.'),
      objective: L('Совместить восстановление, справедливость и снижение будущего риска.', 'Combine recovery, fairness and lower future risk.'),
      reward: { xp: 200, stars: 4 }, debate: ['mira', 'viktor'],
      placements: [
        P('safe-terrace', 'Безопасная надпойменная терраса', 'Safe upper terrace', 'house', { x: 68, y: 38 }, { costMultiplier: 1.08, resilience: { flood: 2 }, recommended: true }),
        P('existing-towns', 'Существующие города у реки', 'Existing river towns', 'community', { x: 75, y: 46 }, { effects: { support: 2 }, resilience: { flood: -1 } }),
        P('regional-pool', 'Вся долина', 'Valley-wide pool', 'map', { x: 80, y: 53 }, { costMultiplier: 0.95, effects: { development: 1 } })
      ],
      advisors: {
        mira: L('Переселение допустимо только с реальным выбором жилья, работы и связи с прежним сообществом.', 'Relocation is legitimate only with real choice over housing, jobs and community continuity.'),
        ilya: L('Восстановление должно снизить следующий риск, иначе бюджет оплатит один и тот же ущерб дважды.', 'Recovery must lower the next risk or the budget will pay for the same damage twice.'),
        elena: L('Люди примут более долгий путь, если критерии, компенсации и этапы будут публичными.', 'People can accept a slower path if criteria, compensation and stages are public.'),
        viktor: L('Быстрое восстановление дешевле сегодня, но создаёт условное обязательство следующего паводка.', 'Fast rebuilding is cheaper today but creates a contingent liability for the next flood.')
      },
      actions: [
        {
          id: 'resilient-relocation', icon: 'house', art: 'assets/art/river-legacy.webp', tags: ['flood', 'housing', 'legacy'],
          title: L('Переселить наиболее уязвимые кварталы', 'Relocate the most vulnerable neighbourhoods'),
          description: L('Новое жильё на безопасных площадках и выкуп собственности в зоне высокого риска.', 'New housing on safe land and buyouts in the highest-risk zone.'),
          cost: 3.8, effects: { support: 4, development: 5 }, resilience: { flood: 6 },
          flag: { key: 'riverLegacy', value: 'relocation' }, xp: 215, stars: 5,
          interactions: [
            { type: 'synergy', when: { flag: 'riverDelivery', values: ['buffer', 'moratorium'] }, effects: { support: 2 }, resilience: { flood: 2 }, text: L('Буфер или мораторий заранее определили безопасные и запретные зоны.', 'The buffer or moratorium already defined safe and restricted areas.') }
          ],
          advisorAffinity: { mira: 1, ilya: 2, elena: 1, viktor: -1 },
          future: L('Переселение резко снижает условные обязательства следующего паводка.', 'Relocation sharply reduces contingent liabilities from the next flood.'),
          outcome: L('Регион предлагает выбор площадок, выкуп и сопровождение переезда наиболее уязвимых семей.', 'The region offers site choice, buyouts and relocation support to the most vulnerable households.')
        },
        {
          id: 'build-back-fast', icon: 'construction', art: 'assets/art/flood-infrastructure.webp', tags: ['flood', 'fast', 'support'],
          title: L('Восстановить всё на прежних местах', 'Rebuild rapidly in place'),
          description: L('Самый быстрый возврат жителей и бизнеса, но без существенного снижения риска.', 'The fastest return for residents and firms with little risk reduction.'),
          cost: 2.5, effects: { support: 7, development: 2 }, resilience: { flood: 1 },
          flag: { key: 'riverLegacy', value: 'rebuild' }, xp: 155, stars: 2,
          interactions: [
            { type: 'conflict', when: { flag: 'riverDelivery', values: ['moratorium'] }, effects: { support: -2, development: -1 }, resilience: { flood: -1 }, text: L('Восстановление в опасной зоне отменяет смысл ранее введённого моратория.', 'Rebuilding in the risk zone reverses the logic of the earlier moratorium.') }
          ],
          advisorAffinity: { mira: 1, ilya: -2, elena: 2, viktor: 0 },
          future: L('Жизнь возвращается быстро, но регион сохраняет высокий риск повторных расходов.', 'Life returns quickly, but the region retains high repeat-loss risk.'),
          outcome: L('Строительные бригады восстанавливают жильё, дороги и торговлю в прежней планировке.', 'Construction teams restore homes, roads and commerce in the previous layout.')
        },
        {
          id: 'climate-insurance-pool', icon: 'shield', art: 'assets/art/river-nature.webp', tags: ['flood', 'insurance', 'finance'],
          title: L('Создать региональный страховой пул', 'Create a regional climate insurance pool'),
          description: L('Совместное покрытие риска для домохозяйств, муниципалитетов и бизнеса.', 'Shared risk coverage for households, municipalities and firms.'),
          cost: 1.6, effects: { support: 3, development: 3 }, resilience: { flood: 3 },
          flag: { key: 'riverLegacy', value: 'insurance' }, xp: 175, stars: 3,
          interactions: [
            { type: 'synergy', when: { flag: 'floodStrategy', values: ['defenses', 'infrastructure'] }, effects: { development: 1 }, resilience: { flood: 1 }, text: L('Инженерная защита снижает страховую цену и делает пул устойчивее.', 'Engineering protection lowers premiums and improves pool viability.') }
          ],
          advisorAffinity: { mira: 0, ilya: 1, elena: 0, viktor: 2 },
          future: L('Пул не предотвращает паводок, но распределяет финансовый ущерб и ускоряет восстановление.', 'The pool does not prevent floods but spreads financial losses and accelerates recovery.'),
          outcome: L('Регион объединяет резерв, страхование и муниципальные взносы в прозрачный механизм покрытия ущерба.', 'The region combines reserves, insurance and municipal contributions in a transparent loss-sharing mechanism.')
        }
      ]
    },
    {
      id: 'public-audit', chapter: 4, threadPhase: 'legacy', districtId: 'capital', icon: 'trophy',
      art: 'assets/scenes/public-meeting-room.webp', kicker: L('Финальная миссия', 'Final mission'),
      title: L('Публичный аудит губернаторского срока', 'Public audit of the governor’s term'),
      description: L('Контрольно-счётная палата, муниципалитеты, общественные организации и студенты собираются на открытом заседании. Нужно решить, как представить результаты и незавершённые обязательства.', 'The audit chamber, municipalities, civil society and students meet in an open session. Decide how to present outcomes and unfinished commitments.'),
      objective: L('Завершить кампанию так, чтобы жители понимали не только итоговые цифры, но и причинную историю решений.', 'End the campaign with a causal account of choices, not only a final score.'),
      reward: { xp: 240, stars: 5 }, debate: ['elena', 'viktor'],
      advisors: {
        mira: L('Покажите, какие территории получили услуги, а какие всё ещё ждут обещанного.', 'Show which territories received services and which are still waiting.'),
        ilya: L('Свяжите результаты четырёх цепочек и объясните, почему некоторые ранние решения окупились только в кризисе.', 'Connect all four policy chains and explain why some early choices paid off only during crisis.'),
        elena: L('Открыто признайте задержки и неполное исполнение: доверие строится на объяснимости, а не безошибочности.', 'Acknowledge delays and partial delivery: trust depends on explainability, not perfection.'),
        viktor: L('Опубликуйте долг, резерв, содержание проектов и все отклонения фактической стоимости от плана.', 'Publish debt, reserves, programme operations and every deviation from planned cost.')
      },
      actions: [
        {
          id: 'open-ledger', icon: 'receipt', art: 'assets/scenes/public-meeting-room.webp', tags: ['audit', 'open', 'legacy'],
          title: L('Опубликовать открытый реестр результатов', 'Publish an open outcomes ledger'),
          description: L('Бюджет, сроки, незавершённые обязательства и результаты по каждой территории.', 'Budget, schedule, unfinished commitments and outcomes for every territory.'),
          cost: 0.8, effects: { support: 7, development: 2 }, resilience: { digital: 2 },
          flag: { key: 'auditStyle', value: 'ledger' }, xp: 245, stars: 5,
          interactions: [
            { type: 'synergy', when: { flag: 'digitalDelivery', values: ['modular', 'civic'] }, effects: { support: 2 }, text: L('Открытая цифровая архитектура позволяет показать данные в проверяемом виде.', 'The open digital architecture makes the data verifiable.') }
          ],
          advisorAffinity: { mira: 1, ilya: 1, elena: 2, viktor: 2 },
          future: L('Открытый реестр превращает кампанию в проверяемое управленческое наследие.', 'The open ledger turns the campaign into an auditable governing legacy.'),
          outcome: L('Правительство публикует журнал решений, источники финансирования, фактические сроки и территориальные результаты.', 'The government publishes the decision log, funding sources, actual schedules and territorial outcomes.')
        },
        {
          id: 'citizens-assembly', icon: 'people', art: 'assets/art/youth-event.webp', tags: ['audit', 'participation', 'legacy'],
          title: L('Провести гражданскую ассамблею', 'Hold a citizens’ assembly'),
          description: L('Жители и муниципалитеты оценивают результаты и формируют повестку следующего срока.', 'Residents and municipalities assess outcomes and shape the next-term agenda.'),
          cost: 1.2, effects: { support: 6, development: 3 }, resilience: { jobs: 1, health: 1 },
          flag: { key: 'auditStyle', value: 'assembly' }, xp: 225, stars: 4,
          interactions: [
            { type: 'synergy', when: { flag: 'digitalStrategy', values: ['open'] }, effects: { support: 2 }, text: L('Ранее созданный канал участия помогает собрать неслучайную и разнообразную аудиторию.', 'The existing participation channel helps recruit a diverse, non-random assembly.') }
          ],
          advisorAffinity: { mira: 2, ilya: 1, elena: 2, viktor: 0 },
          future: L('Ассамблея создаёт новый мандат, но часть сложных вопросов остаётся предметом политического выбора.', 'The assembly creates a renewed mandate while leaving some hard trade-offs political.'),
          outcome: L('Регион проводит многоэтапное обсуждение с муниципальными квотами и публичным ответом правительства.', 'The region holds a multi-stage deliberation with municipal quotas and a public government response.')
        },
        {
          id: 'legacy-expo', icon: 'trophy', art: 'assets/art/region-map.webp', tags: ['audit', 'showcase', 'legacy'],
          title: L('Провести выставку достижений региона', 'Stage a regional achievements showcase'),
          description: L('Яркая демонстрация завершённых проектов с ограниченным вниманием к незавершённым обязательствам.', 'A vivid display of completed projects with limited attention to unfinished commitments.'),
          cost: 1.0, effects: { support: 3, development: 5 }, resilience: {},
          flag: { key: 'auditStyle', value: 'showcase' }, xp: 185, stars: 3,
          interactions: [
            { type: 'conflict', when: { finance: { debtRatioMin: 0.75 } }, effects: { support: -3 }, text: L('Высокая долговая нагрузка делает праздничную выставку уязвимой для критики.', 'High debt makes the celebratory showcase vulnerable to criticism.') },
            { type: 'conflict', when: { finance: { overloadMin: 2 } }, effects: { support: -2 }, text: L('Незавершённые проекты противоречат образу полностью реализованной программы.', 'Unfinished projects contradict the image of a fully delivered programme.') }
          ],
          advisorAffinity: { mira: -1, ilya: 0, elena: -1, viktor: -1 },
          future: L('Выставка повышает узнаваемость проектов, но слабее формирует институциональную память.', 'The showcase raises project visibility but creates less institutional memory.'),
          outcome: L('Правительство собирает завершённые объекты в единую публичную экспозицию и кампанию региональной гордости.', 'The government packages completed projects into a public exhibition and regional-pride campaign.')
        }
      ]
    }
  ];

  const existing = Object.fromEntries(DATA.missions.map(mission => [mission.id, mission]));
  ['rural-healthcare', 'youth-employment', 'flood-preparedness', 'digital-services'].forEach(id => {
    existing[id].chapter = 1;
    existing[id].threadPhase = 'design';
  });
  ['flu-wave', 'youth-outflow', 'major-flood', 'cyberattack'].forEach(id => {
    existing[id].chapter = 3;
    existing[id].threadPhase = 'crisis';
  });

  existing['rural-healthcare'].debate = ['mira', 'viktor'];
  existing['youth-employment'].debate = ['ilya', 'mira'];
  existing['flood-preparedness'].debate = ['ilya', 'elena'];
  existing['digital-services'].debate = ['elena', 'viktor'];
  existing['flu-wave'].debate = ['mira', 'viktor'];
  existing['youth-outflow'].debate = ['mira', 'ilya'];
  existing['major-flood'].debate = ['elena', 'viktor'];
  existing.cyberattack.debate = ['ilya', 'elena'];

  const newById = Object.fromEntries(newMissions.map(mission => [mission.id, mission]));
  const orderedIds = [
    'rural-healthcare', 'youth-employment', 'flood-preparedness', 'digital-services',
    'health-delivery', 'industrial-transition', 'river-land-use', 'digital-procurement',
    'flu-wave', 'youth-outflow', 'major-flood', 'cyberattack',
    'health-legacy', 'industrial-legacy', 'river-legacy', 'public-audit'
  ];
  DATA.missions.splice(0, DATA.missions.length, ...orderedIds.map(id => existing[id] || newById[id]));

  const districtMissionIds = {
    north: ['rural-healthcare', 'health-delivery', 'flu-wave', 'health-legacy'],
    industrial: ['youth-employment', 'industrial-transition', 'youth-outflow', 'industrial-legacy'],
    river: ['flood-preparedness', 'river-land-use', 'major-flood', 'river-legacy'],
    capital: ['digital-services', 'digital-procurement', 'cyberattack', 'public-audit']
  };
  DATA.districts.forEach(district => {
    district.missionIds = districtMissionIds[district.id].slice();
  });

  const financeProfiles = {
    'medical-hub': { kind: 'capital', annualOpex: 0.50, lag: 2, duration: 8, adminLoad: 3.2, federalMatch: 0.45, debtEligible: true, annualEffects: { development: 0.25 }, deliveryRisk: 0.18 },
    'telemedicine-network': { kind: 'capital', annualOpex: 0.30, lag: 1, duration: 7, adminLoad: 2.4, federalMatch: 0.50, debtEligible: true, annualEffects: { development: 0.18, support: 0.08 }, deliveryRisk: 0.14 },
    'municipal-health-contracts': { kind: 'programme', annualOpex: 0.22, lag: 0, duration: 5, adminLoad: 1.6, federalMatch: 0.30, debtEligible: false, annualEffects: { support: 0.15 }, deliveryRisk: 0.07 },
    'supplier-clusters': { kind: 'programme', annualOpex: 0.38, lag: 1, duration: 7, adminLoad: 2.8, federalMatch: 0.45, debtEligible: false, annualEffects: { development: 0.25 }, deliveryRisk: 0.12 },
    'clean-line-modernisation': { kind: 'capital', annualOpex: 0.28, lag: 2, duration: 9, adminLoad: 3.4, federalMatch: 0.40, debtEligible: true, annualEffects: { development: 0.35 }, deliveryRisk: 0.20 },
    'worker-income-guarantee': { kind: 'programme', annualOpex: 0.62, lag: 0, duration: 3, adminLoad: 1.8, federalMatch: 0.30, debtEligible: false, annualEffects: { support: 0.18 }, deliveryRisk: 0.06 },
    'nature-buffer': { kind: 'capital', annualOpex: 0.18, lag: 1, duration: 10, adminLoad: 2.4, federalMatch: 0.50, debtEligible: true, annualEffects: { development: 0.14 }, deliveryRisk: 0.12 },
    'logistics-embankment': { kind: 'capital', annualOpex: 0.42, lag: 2, duration: 10, adminLoad: 3.6, federalMatch: 0.45, debtEligible: true, annualEffects: { development: 0.34 }, deliveryRisk: 0.22 },
    'zoning-moratorium': { kind: 'operating', annualOpex: 0.08, lag: 0, duration: 6, adminLoad: 1.4, federalMatch: 0, debtEligible: false, annualEffects: {}, deliveryRisk: 0.04 },
    'modular-platform': { kind: 'capital', annualOpex: 0.34, lag: 1, duration: 8, adminLoad: 3.0, federalMatch: 0.50, debtEligible: true, annualEffects: { development: 0.25 }, deliveryRisk: 0.16 },
    'single-vendor-contract': { kind: 'capital', annualOpex: 0.42, lag: 0, duration: 7, adminLoad: 1.8, federalMatch: 0.35, debtEligible: true, annualEffects: { support: 0.08, development: 0.18 }, deliveryRisk: 0.19 },
    'civic-tech-lab': { kind: 'programme', annualOpex: 0.25, lag: 0, duration: 5, adminLoad: 1.8, federalMatch: 0.40, debtEligible: false, annualEffects: { support: 0.16 }, deliveryRisk: 0.07 },
    'integrated-primary-care': { kind: 'programme', annualOpex: 0.42, lag: 1, duration: 8, adminLoad: 2.6, federalMatch: 0.45, debtEligible: false, annualEffects: { support: 0.10, development: 0.22 }, deliveryRisk: 0.10 },
    'long-term-care-network': { kind: 'programme', annualOpex: 0.58, lag: 1, duration: 8, adminLoad: 2.4, federalMatch: 0.55, debtEligible: false, annualEffects: { support: 0.18 }, deliveryRisk: 0.10 },
    'hospital-consolidation': { kind: 'operating', annualOpex: 0.10, lag: 1, duration: 5, adminLoad: 2.0, federalMatch: 0.20, debtEligible: false, annualEffects: { development: 0.20 }, deliveryRisk: 0.12 },
    'green-manufacturing': { kind: 'capital', annualOpex: 0.32, lag: 2, duration: 10, adminLoad: 3.6, federalMatch: 0.45, debtEligible: true, annualEffects: { development: 0.40 }, deliveryRisk: 0.20 },
    'university-industry-city': { kind: 'capital', annualOpex: 0.48, lag: 2, duration: 10, adminLoad: 3.4, federalMatch: 0.50, debtEligible: true, annualEffects: { support: 0.10, development: 0.32 }, deliveryRisk: 0.18 },
    'investor-rebate': { kind: 'programme', annualOpex: 0.22, lag: 0, duration: 4, adminLoad: 1.5, federalMatch: 0.20, debtEligible: false, annualEffects: { development: 0.18 }, deliveryRisk: 0.08 },
    'resilient-relocation': { kind: 'capital', annualOpex: 0.24, lag: 2, duration: 10, adminLoad: 3.4, federalMatch: 0.55, debtEligible: true, reserveEligible: true, annualEffects: { support: 0.10, development: 0.24 }, deliveryRisk: 0.18 },
    'build-back-fast': { kind: 'capital', annualOpex: 0.32, lag: 1, duration: 8, adminLoad: 2.4, federalMatch: 0.40, debtEligible: true, reserveEligible: true, annualEffects: { support: 0.12 }, deliveryRisk: 0.12 },
    'climate-insurance-pool': { kind: 'programme', annualOpex: 0.20, lag: 1, duration: 8, adminLoad: 1.8, federalMatch: 0.35, debtEligible: false, reserveEligible: true, annualEffects: { development: 0.12 }, deliveryRisk: 0.07 },
    'open-ledger': { kind: 'operating', annualOpex: 0.08, lag: 0, duration: 4, adminLoad: 1.3, federalMatch: 0.20, debtEligible: false, annualEffects: { support: 0.15 }, deliveryRisk: 0.03 },
    'citizens-assembly': { kind: 'operating', annualOpex: 0.14, lag: 0, duration: 3, adminLoad: 1.6, federalMatch: 0.10, debtEligible: false, annualEffects: { support: 0.12 }, deliveryRisk: 0.04 },
    'legacy-expo': { kind: 'operating', annualOpex: 0, lag: 0, duration: 0, adminLoad: 1.2, federalMatch: 0, debtEligible: false, annualEffects: {}, deliveryRisk: 0.02 }
  };

  Object.assign(DATA.financeProfiles, financeProfiles);
  DATA.missions.forEach(mission => {
    mission.actions.forEach((action, actionIndex) => {
      if (financeProfiles[action.id]) {
        action.finance = Object.assign({
          annualOpex: 0,
          lag: 0,
          duration: 0,
          adminLoad: 1,
          adminMaintenance: Math.max(0.15, Math.round(financeProfiles[action.id].adminLoad * 0.18 * 10) / 10),
          federalMatch: 0,
          debtEligible: false,
          reserveEligible: false,
          annualEffects: {}
        }, financeProfiles[action.id]);
      }
      action.tags = Array.from(new Set([...(action.tags || []), mission.districtId, mission.threadPhase || 'design']));
      action.deliveryRisk = Number((action.finance && action.finance.deliveryRisk) || (action.finance && action.finance.kind === 'capital' ? 0.16 : 0.08));
      action.advisorAffinity = action.advisorAffinity || {};
      const district = DATA.districts.find(item => item.id === mission.districtId);
      const offsets = [
        { x: -8, y: 7 }, { x: 0, y: 10 }, { x: 8, y: 7 },
        { x: -10, y: 15 }, { x: 1, y: 17 }, { x: 11, y: 15 }
      ];
      const offset = offsets[((mission.chapter - 1) + actionIndex) % offsets.length];
      action.mapObject = action.mapObject || {
        icon: action.icon || mission.icon,
        position: {
          x: Math.max(6, Math.min(94, district.position.x + offset.x)),
          y: Math.max(8, Math.min(88, district.position.y + offset.y))
        }
      };
    });
  });

  const existingCrisisEnhancements = {
    'flu-wave': {
      deliveryFlag: 'healthDelivery',
      notes: {
        telemedicine: L('Телемедицинская сеть ускорила сортировку пациентов и консультации специалистов.', 'The telemedicine network accelerated triage and specialist consultation.'),
        contracts: L('Муниципальные стандарты помогли быстро перераспределить маршруты и ответственность.', 'Municipal standards helped reallocate routes and responsibility quickly.'),
        hub: L('Межрайонный хаб принял тяжёлые случаи и разгрузил первичное звено.', 'The inter-district hub absorbed severe cases and relieved primary care.')
      }
    },
    'youth-outflow': {
      deliveryFlag: 'industrialDelivery',
      notes: {
        suppliers: L('Сеть поставщиков сохранила локальные карьерные траектории.', 'The supplier network preserved local career paths.'),
        modernisation: L('Модернизация создала новые профессии, но усилила потребность в переобучении.', 'Modernisation created new professions while increasing retraining needs.'),
        guarantee: L('Гарантия дохода смягчила переход, но не заменила создание новых рабочих мест.', 'Income protection softened transition but did not replace job creation.')
      }
    },
    'major-flood': {
      deliveryFlag: 'riverDelivery',
      notes: {
        buffer: L('Природный буфер замедлил паводковую волну и сократил ущерб.', 'The natural buffer slowed the flood wave and reduced damage.'),
        corridor: L('Защищённый коридор сохранил логистику, но не всю долину.', 'The protected corridor preserved logistics but not the whole valley.'),
        moratorium: L('Мораторий предотвратил появление новых объектов в зоне наибольшего риска.', 'The moratorium prevented new assets in the highest-risk zone.')
      }
    },
    cyberattack: {
      deliveryFlag: 'digitalDelivery',
      notes: {
        modular: L('Модульная архитектура локализовала сбой и сохранила часть сервисов.', 'The modular architecture contained the outage and preserved part of the services.'),
        vendor: L('Единый поставщик ускорил коммуникацию, но единая точка отказа усилила сбой.', 'The single vendor accelerated communication but amplified the failure through one point of dependency.'),
        civic: L('Лаборатория быстро обнаружила пользовательские симптомы атаки и помогла информировать жителей.', 'The civic tech lab detected user-facing symptoms early and supported public communication.')
      }
    }
  };
  Object.entries(existingCrisisEnhancements).forEach(([id, enhancement]) => {
    Object.assign(existing[id], enhancement);
  });

  DATA.quests.push(
    {
      id: 'coherent-portfolio', icon: 'handshake', title: L('Связанный портфель', 'Coherent portfolio'),
      description: L('Активировать не менее четырёх синергий и допустить не более двух конфликтов.', 'Activate at least four synergies and no more than two conflicts.'),
      evaluate: state => Math.min(1, ((state.interactionCounts && state.interactionCounts.synergy) || 0) / 4),
      complete: state => Boolean(state.interactionCounts && state.interactionCounts.synergy >= 4 && state.interactionCounts.conflict <= 2)
    },
    {
      id: 'delivery-record', icon: 'construction', title: L('Реализация без провала', 'Deliver without collapse'),
      description: L('Завершить кампанию без экстренного трансферта из-за удорожания проекта.', 'Finish without an emergency transfer caused by a cost overrun.'),
      evaluate: state => Math.max(0, 1 - ((state.deliveryStats && state.deliveryStats.overrunBailouts) || 0)),
      complete: state => Boolean(state.completed && (!state.deliveryStats || state.deliveryStats.overrunBailouts === 0))
    }
  );

  DATA.badges.push(
    {
      id: 'portfolio-architect', icon: 'handshake', title: L('Архитектор портфеля', 'Portfolio architect'),
      description: L('Активировать пять синергий между решениями разных глав.', 'Activate five synergies across chapters.'),
      test: state => Boolean(state.interactionCounts && state.interactionCounts.synergy >= 5)
    },
    {
      id: 'honest-audit', icon: 'receipt', title: L('Открытый мандат', 'Open mandate'),
      description: L('Завершить кампанию открытым реестром при сбалансированных регистрах.', 'Finish with an open ledger and balanced fiscal registers.'),
      test: state => Boolean(state.completed && state.flags.auditStyle === 'ledger' && state.finance && state.finance.fiscalIdentityFailures === 0)
    },
    {
      id: 'perfect-delivery', icon: 'construction', title: L('Без срыва сроков', 'Perfect delivery'),
      description: L('Завершить кампанию не более чем с одной задержкой реализации.', 'Finish with no more than one delivery delay.'),
      test: state => Boolean(state.completed && state.deliveryStats && state.deliveryStats.delayed <= 1)
    },
    {
      id: 'challenge-complete', icon: 'trophy', title: L('Губернатор испытаний', 'Challenge governor'),
      description: L('Завершить кампанию в любом дополнительном режиме.', 'Complete a campaign in any non-standard replay mode.'),
      test: state => Boolean(state.completed && state.challengeId && state.challengeId !== 'standard')
    }
  );

  DATA.chapters = chapters;
  DATA.challenges = challenges;
  DATA.stage3Ready = true;

  root.GovernorGame = root.GovernorGame || {};
  root.GovernorGame.DATA = DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
