(function (root) {
  'use strict';

  const L = (ru, en) => ({ ru, en });

  const ui = {
    ru: {
      appTitle: 'Губернатор: Новая область',
      appSubtitle: 'Учись. Решай. Меняй регион.',
      startEyebrow: 'Учебная видеоигра РУДН',
      startTitle: 'Ваш регион ждёт решений',
      startLead: 'Восемь взаимосвязанных миссий покажут, как сегодняшняя политика меняет завтрашний кризис. Выбирайте приоритеты, слушайте советников и удерживайте доверие жителей.',
      startName: 'Имя губернатора',
      startNamePlaceholder: 'Например, Алексей Иванов',
      startGroup: 'Учебная группа',
      startGroupPlaceholder: 'Например, ГГУбд-01-26',
      startScenario: 'Стартовый сценарий',
      startSeed: 'Код учебной сессии',
      startSeedHint: 'Одинаковый код даёт группе одинаковые стартовые условия.',
      startButton: 'Начать кампанию',
      continueButton: 'Продолжить сохранённую кампанию',
      demoBadge: 'Этап 2 · казна, проекты и обязательства',
      featureMission: '8 связанных миссий',
      featureConsequences: 'решения возвращаются последствиями',
      featureOffline: 'автосохранение и офлайн-режим',
      navMission: 'Миссия',
      navMap: 'Карта',
      navQuests: 'Задания',
      navAdvisors: 'Советники',
      navBadges: 'Награды',
      navSettings: 'Настройки',
      budget: 'Бюджет',
      support: 'Поддержка',
      development: 'Развитие',
      chapter: 'Глава',
      turn: 'Ход',
      currentMission: 'Текущая миссия',
      missionReward: 'Награда миссии',
      chooseAction: 'Выберите решение',
      selectedActionStep: 'Решение выбрано',
      changeDecision: 'Изменить решение',
      confirmAction: 'Утвердить решение',
      selected: 'Выбрано',
      notEnough: 'Недостаточно средств',
      cost: 'Стоимость',
      immediateEffect: 'Сразу',
      strategicEffect: 'На будущее',
      advisorHint: 'Советники оценивают варианты по-разному. Нажмите на портрет, чтобы услышать аргумент.',
      regionOverview: 'Ваш регион',
      regionName: 'Новая область',
      regionTagline: 'Территория возможностей и трудных компромиссов.',
      advisors: 'Ваши советники',
      missionProgress: 'Прогресс миссии',
      missionStarted: 'Миссия начата',
      actionChosen: 'Решение принято',
      missionComplete: 'Последствия оценены',
      proTip: 'Подсказка',
      proTipText: 'Не максимизируйте один показатель. Сильная стратегия переживает кризисы, а не только красиво выглядит сегодня.',
      chapterOne: 'Первые решения',
      chapterTwo: 'Проверка стратегии',
      impactPreview: 'Предварительный эффект',
      entryImpact: 'Последствия прежних решений',
      longTerm: 'Стратегическая подготовка',
      xp: 'опыт',
      stars: 'звёзды',
      nextTurn: 'Перейти к следующему ходу',
      resultTitle: 'Решение принято',
      resultBeforeAfter: 'Изменение ресурсов',
      resultWhy: 'Почему это произошло',
      resultFuture: 'Что изменится в будущих миссиях',
      close: 'Закрыть',
      backToMission: 'Вернуться к миссии',
      mapTitle: 'Карта Новой области',
      mapLead: 'Четыре территории связаны одной системой. Завершённые миссии остаются на карте и меняют будущие события.',
      districtPrepared: 'Подготовлено',
      districtActive: 'Активная задача',
      districtWaiting: 'Ожидает решения',
      questsTitle: 'Задания кампании',
      questsLead: 'Дополнительные цели не ограничивают стиль игры, но помогают увидеть цену устойчивой стратегии.',
      advisorsTitle: 'Совет губернатора',
      advisorsLead: 'У каждого советника своя логика. Ни один из них не знает единственно правильного ответа.',
      badgesTitle: 'Награды и стиль управления',
      badgesLead: 'Награды открываются за устойчивые стратегии, а не за механическое накопление одного показателя.',
      locked: 'Пока не открыто',
      unlocked: 'Открыто',
      settingsTitle: 'Настройки кампании',
      sound: 'Звуки интерфейса',
      language: 'Язык',
      restart: 'Начать кампанию заново',
      export: 'Скачать отчёт о прохождении',
      restartConfirm: 'Удалить текущее прохождение и начать заново?',
      endTitle: 'Кампания завершена',
      endSubtitle: 'Ваш стиль управления сформирован восемью решениями и тем, как они выдержали проверку кризисами.',
      endStyle: 'Ваш управленческий стиль',
      endResources: 'Итоговые ресурсы',
      endLessons: 'Главные выводы',
      endDecisions: 'Ключевые решения',
      playAgain: 'Новая кампания',
      reportDownload: 'Скачать полный отчёт',
      saved: 'Кампания сохранена',
      saveFailed: 'Не удалось сохранить кампанию',
      level: 'Уровень',
      reputation: 'Репутация',
      session: 'Сессия',
      scenario: 'Сценарий',
      completed: 'Выполнено',
      of: 'из',
      billion: 'млрд ₽',
      perTurn: 'за ход',
      scenarioRandom: 'Случайный по коду сессии',
      reducedImpact: 'Подготовка снизила ущерб',
      highImpact: 'Регион встретил кризис неподготовленным',
      neutralImpact: 'Подготовка частично сработала',
      details: 'Подробнее',
      noDecisionYet: 'Сначала выберите одно из решений.',
      activeViewTip: 'Текущая миссия остаётся доступной справа.',
      profileGovernor: 'Губернатор-студент',
      accessibilityLabel: 'Открыть главное меню',
      skipToGame: 'Перейти к игре'
    },
    en: {
      appTitle: 'Governor: New Region',
      appSubtitle: 'Learn. Decide. Transform.',
      startEyebrow: 'RUDN educational game',
      startTitle: 'Your region is waiting',
      startLead: 'Eight connected missions show how today’s policy shapes tomorrow’s crisis. Set priorities, listen to advisers and keep public trust.',
      startName: 'Governor name',
      startNamePlaceholder: 'For example, Alex Ivanov',
      startGroup: 'Student group',
      startGroupPlaceholder: 'For example, PA-01-26',
      startScenario: 'Starting scenario',
      startSeed: 'Class session code',
      startSeedHint: 'The same code gives the class the same starting conditions.',
      startButton: 'Start campaign',
      continueButton: 'Continue saved campaign',
      demoBadge: 'Stage 2 · treasury, projects and commitments',
      featureMission: '8 connected missions',
      featureConsequences: 'choices return as consequences',
      featureOffline: 'autosave and offline mode',
      navMission: 'Mission',
      navMap: 'Map',
      navQuests: 'Quests',
      navAdvisors: 'Advisers',
      navBadges: 'Awards',
      navSettings: 'Settings',
      budget: 'Budget',
      support: 'Public support',
      development: 'Development',
      chapter: 'Chapter',
      turn: 'Turn',
      currentMission: 'Current mission',
      missionReward: 'Mission reward',
      chooseAction: 'Choose your action',
      selectedActionStep: 'Decision selected',
      changeDecision: 'Change decision',
      confirmAction: 'Confirm action',
      selected: 'Selected',
      notEnough: 'Not enough funds',
      cost: 'Cost',
      immediateEffect: 'Immediate',
      strategicEffect: 'Future',
      advisorHint: 'Advisers evaluate options differently. Select a portrait to hear an argument.',
      regionOverview: 'Your region',
      regionName: 'Novaya Region',
      regionTagline: 'A land of opportunity and difficult trade-offs.',
      advisors: 'Your advisers',
      missionProgress: 'Mission progress',
      missionStarted: 'Mission started',
      actionChosen: 'Action selected',
      missionComplete: 'Consequences assessed',
      proTip: 'Pro tip',
      proTipText: 'Do not maximize a single number. A strong strategy survives crises instead of merely looking good today.',
      chapterOne: 'First decisions',
      chapterTwo: 'Strategy under pressure',
      impactPreview: 'Impact preview',
      entryImpact: 'Consequences of earlier choices',
      longTerm: 'Strategic preparation',
      xp: 'experience',
      stars: 'stars',
      nextTurn: 'Continue to the next turn',
      resultTitle: 'Decision confirmed',
      resultBeforeAfter: 'Resource changes',
      resultWhy: 'Why this happened',
      resultFuture: 'How future missions changed',
      close: 'Close',
      backToMission: 'Back to mission',
      mapTitle: 'Map of Novaya Region',
      mapLead: 'Four territories form one system. Completed missions remain on the map and change later events.',
      districtPrepared: 'Prepared',
      districtActive: 'Active task',
      districtWaiting: 'Awaiting decision',
      questsTitle: 'Campaign quests',
      questsLead: 'Optional goals do not force a play style, but they reveal the price of a sustainable strategy.',
      advisorsTitle: 'Governor’s council',
      advisorsLead: 'Every adviser has a different logic. None of them knows the single correct answer.',
      badgesTitle: 'Awards and leadership style',
      badgesLead: 'Awards recognise resilient strategies rather than the mechanical maximisation of one score.',
      locked: 'Locked',
      unlocked: 'Unlocked',
      settingsTitle: 'Campaign settings',
      sound: 'Interface sounds',
      language: 'Language',
      restart: 'Restart campaign',
      export: 'Download campaign report',
      restartConfirm: 'Delete the current campaign and start again?',
      endTitle: 'Campaign complete',
      endSubtitle: 'Your leadership style was shaped by eight decisions and by how they performed under crisis.',
      endStyle: 'Your leadership style',
      endResources: 'Final resources',
      endLessons: 'Main lessons',
      endDecisions: 'Key decisions',
      playAgain: 'New campaign',
      reportDownload: 'Download full report',
      saved: 'Campaign saved',
      saveFailed: 'Could not save campaign',
      level: 'Level',
      reputation: 'Reputation',
      session: 'Session',
      scenario: 'Scenario',
      completed: 'Completed',
      of: 'of',
      billion: 'bn RUB',
      perTurn: 'per turn',
      scenarioRandom: 'Random from session code',
      reducedImpact: 'Preparation reduced the damage',
      highImpact: 'The region entered the crisis unprepared',
      neutralImpact: 'Preparation worked only partly',
      details: 'Details',
      noDecisionYet: 'Choose one action first.',
      activeViewTip: 'The current mission remains available on the right.',
      profileGovernor: 'Student governor',
      accessibilityLabel: 'Open main menu',
      skipToGame: 'Skip to game'
    }
  };

  const scenarios = [
    {
      id: 'balanced',
      name: L('Сбалансированный старт', 'Balanced start'),
      description: L('Регион располагает умеренным запасом средств, но жители ждут заметных улучшений.', 'The region has a moderate fiscal cushion, but residents expect visible improvements.'),
      stats: { budget: 12.0, support: 58, development: 40 },
      baseIncome: 2.0,
      risk: { health: 0, jobs: 0, flood: 0, digital: 0 }
    },
    {
      id: 'demographic',
      name: L('Демографическое сжатие', 'Demographic squeeze'),
      description: L('Молодёжь уезжает, а кадровый дефицит делает долгосрочные вложения особенно важными.', 'Young people are leaving and labour shortages make long-term investment especially important.'),
      stats: { budget: 11.2, support: 56, development: 38 },
      baseIncome: 1.8,
      risk: { health: 1, jobs: 2, flood: 0, digital: 0 }
    },
    {
      id: 'infrastructure',
      name: L('Изношенная инфраструктура', 'Infrastructure stress'),
      description: L('Коммунальные сети и транспорт требуют вложений, а резерв на чрезвычайные ситуации невелик.', 'Utilities and transport need investment while the emergency reserve is limited.'),
      stats: { budget: 11.5, support: 55, development: 37 },
      baseIncome: 1.9,
      risk: { health: 0, jobs: 0, flood: 2, digital: 0 }
    },
    {
      id: 'digital',
      name: L('Цифровой рывок', 'Digital leap'),
      description: L('Регион быстро внедряет цифровые сервисы, но зависимость от них усиливает киберриски.', 'The region is rapidly adopting digital services, but dependence on them increases cyber risk.'),
      stats: { budget: 12.4, support: 57, development: 43 },
      baseIncome: 2.1,
      risk: { health: 0, jobs: 0, flood: 0, digital: 2 }
    }
  ];

  const districts = [
    {
      id: 'north',
      name: L('Северные районы', 'Northern districts'),
      role: L('Сельская медицина и доступность услуг', 'Rural healthcare and service access'),
      icon: 'health',
      position: { x: 47, y: 19 },
      missionIds: ['rural-healthcare', 'flu-wave']
    },
    {
      id: 'industrial',
      name: L('Промышленный пояс', 'Industrial belt'),
      role: L('Занятость, кадры и диверсификация', 'Jobs, skills and diversification'),
      icon: 'factory',
      position: { x: 28, y: 54 },
      missionIds: ['youth-employment', 'youth-outflow']
    },
    {
      id: 'river',
      name: L('Речная долина', 'River valley'),
      role: L('Наводнения и устойчивость инфраструктуры', 'Floods and infrastructure resilience'),
      icon: 'flood',
      position: { x: 72, y: 42 },
      missionIds: ['flood-preparedness', 'major-flood']
    },
    {
      id: 'capital',
      name: L('Столичная агломерация', 'Capital agglomeration'),
      role: L('Государственные услуги и цифровая устойчивость', 'Public services and digital resilience'),
      icon: 'digital',
      position: { x: 64, y: 74 },
      missionIds: ['digital-services', 'cyberattack']
    }
  ];

  const advisors = [
    {
      id: 'mira',
      name: L('Мира Лебедева', 'Mira Lebedeva'),
      role: L('Социальная политика', 'Social policy'),
      image: 'assets/advisors/mira.png',
      principle: L('Смотрит на доступность услуг и распределение выгод между территориями.', 'Focuses on access to services and how benefits are distributed across territories.'),
      color: 'social'
    },
    {
      id: 'ilya',
      name: L('Илья Орлов', 'Ilya Orlov'),
      role: L('Стратегическое развитие', 'Strategic development'),
      image: 'assets/advisors/ilya.png',
      principle: L('Предпочитает решения с лагом, если они снижают будущие риски.', 'Prefers delayed-return options when they reduce future risk.'),
      color: 'strategy'
    },
    {
      id: 'elena',
      name: L('Елена Крылова', 'Elena Krylova'),
      role: L('Коммуникации и участие', 'Communication and participation'),
      image: 'assets/advisors/elena.png',
      principle: L('Оценивает доверие, понятность решений и включённость жителей.', 'Evaluates trust, clarity and resident participation.'),
      color: 'engagement'
    },
    {
      id: 'viktor',
      name: L('Виктор Соколов', 'Viktor Sokolov'),
      role: L('Финансы', 'Finance'),
      image: 'assets/advisors/viktor.png',
      principle: L('Следит за свободным остатком и стоимостью обязательств будущих лет.', 'Watches the fiscal cushion and the cost of future commitments.'),
      color: 'finance'
    }
  ];

  const missions = [
    {
      id: 'rural-healthcare',
      chapter: 1,
      districtId: 'north',
      icon: 'health',
      art: 'assets/scenes/north-access-scene.webp',
      kicker: L('Миссия развития', 'Development mission'),
      title: L('Доступная сельская медицина', 'Accessible rural healthcare'),
      description: L('В одиннадцати удалённых поселениях жители месяцами ждут приёма специалистов. Нужно выбрать основу новой модели помощи.', 'Residents of eleven remote settlements wait months for specialist care. Choose the foundation of a new service model.'),
      objective: L('Повысить доступность помощи, не исчерпав запас бюджета в первом же году.', 'Improve access without exhausting the fiscal cushion in the first year.'),
      reward: { xp: 120, stars: 2 },
      advisors: {
        mira: L('Мобильные бригады быстрее всего охватят малые поселения и дадут людям заметный результат.', 'Mobile teams reach small settlements fastest and produce a visible result.'),
        ilya: L('Кадры важнее зданий: подготовленные специалисты останутся в системе и усилят будущую устойчивость.', 'People matter more than buildings: trained staff remain in the system and strengthen future resilience.'),
        elena: L('Жители ждут физически доступной помощи. Объясните, когда и где появится новая услуга.', 'Residents expect care they can actually reach. Explain when and where the new service will appear.'),
        viktor: L('Три клиники дадут сильный эффект, но создадут расходы на содержание. Сравните их с более гибкими вариантами.', 'Three clinics offer a strong effect but create operating costs. Compare them with more flexible options.')
      },
      actions: [
        {
          id: 'clinics',
          icon: 'clinic',
          art: 'assets/art/health-clinics.webp',
          title: L('Построить три районные клиники', 'Build three district clinics'),
          description: L('Капитальное решение с сильным эффектом, но высокой ценой.', 'A capital solution with a strong effect and a high price.'),
          cost: 4.2,
          effects: { support: 3, development: 7 },
          resilience: { health: 3 },
          flag: { key: 'healthStrategy', value: 'clinics' },
          xp: 120,
          stars: 2,
          future: L('Клиники снизят ущерб от будущей эпидемии, но не полностью решат кадровый дефицит.', 'Clinics will reduce damage from a future epidemic but will not fully solve the staffing shortage.'),
          outcome: L('Строительство запускается сразу. Жители видят масштаб проекта, а регион берёт на себя содержание новых объектов.', 'Construction starts immediately. Residents see the scale of the project, while the region assumes future operating costs.')
        },
        {
          id: 'mobile-units',
          icon: 'ambulance',
          art: 'assets/art/health-mobile.webp',
          title: L('Развернуть мобильные медбригады', 'Deploy mobile medical teams'),
          description: L('Быстрый охват удалённых поселений и высокий эффект для доверия.', 'Fast coverage of remote settlements and a strong trust effect.'),
          cost: 2.6,
          effects: { support: 6, development: 3 },
          resilience: { health: 2 },
          flag: { key: 'healthStrategy', value: 'mobile' },
          xp: 105,
          stars: 2,
          future: L('Сеть мобильных бригад можно быстро мобилизовать в чрезвычайной ситуации.', 'The mobile network can be rapidly mobilised during an emergency.'),
          outcome: L('Первые бригады выходят на маршруты уже через несколько недель. Доступность растёт, но постоянной инфраструктуры пока мало.', 'The first teams begin routes within weeks. Access improves, but permanent infrastructure remains limited.')
        },
        {
          id: 'train-staff',
          icon: 'training',
          art: 'assets/art/health-training.webp',
          title: L('Подготовить местные медицинские кадры', 'Train local medical staff'),
          description: L('Незаметный сегодня, но самый сильный кадровый резерв на будущее.', 'Less visible today, but the strongest long-term staffing reserve.'),
          cost: 2.0,
          effects: { support: 2, development: 5 },
          resilience: { health: 4 },
          flag: { key: 'healthStrategy', value: 'training' },
          xp: 130,
          stars: 3,
          future: L('Подготовленные специалисты усилят реакцию на эпидемию и телемедицинские решения.', 'Trained professionals strengthen epidemic response and telemedicine solutions.'),
          outcome: L('Регион финансирует целевой набор и жильё для молодых специалистов. Эффект развивается медленнее, но остаётся в системе.', 'The region funds targeted admissions and housing for young professionals. The effect develops slowly but remains in the system.')
        }
      ]
    },
    {
      id: 'youth-employment',
      chapter: 1,
      districtId: 'industrial',
      icon: 'jobs',
      art: 'assets/scenes/industrial-mentoring-scene.webp',
      kicker: L('Миссия развития', 'Development mission'),
      title: L('Работа для молодых специалистов', 'Jobs for young professionals'),
      description: L('Выпускники уезжают из промышленного пояса: предприятиям нужны новые навыки, а молодёжи — понятные карьерные траектории.', 'Graduates are leaving the industrial belt: firms need new skills and young people need visible career paths.'),
      objective: L('Сформировать рабочие места, которые сохранятся после окончания субсидий.', 'Create jobs that survive after subsidies end.'),
      reward: { xp: 130, stars: 2 },
      advisors: {
        mira: L('Жилищная поддержка быстро укрепит доверие, но без рабочих мест она лишь отсрочит отъезд.', 'Housing support quickly raises trust, but without jobs it only delays departure.'),
        ilya: L('Связка колледжей, предприятий и стартапов создаёт долгий эффект и лучше готовит регион к следующему кризису.', 'A college–industry–startup compact creates lasting effects and prepares the region for the next crisis.'),
        elena: L('Молодые люди должны увидеть не лозунг, а конкретные вакансии, наставников и сроки.', 'Young people need concrete vacancies, mentors and timelines rather than slogans.'),
        viktor: L('Налоговые льготы дешевле сейчас, но их эффект зависит от поведения бизнеса и может быть неравномерным.', 'Tax incentives cost less now, but their effect depends on firms and may be uneven.')
      },
      actions: [
        {
          id: 'skills-compact',
          icon: 'graduation',
          title: L('Запустить кадровый контракт', 'Launch a skills compact'),
          description: L('Колледжи, предприятия и стартапы совместно готовят кадры под реальные вакансии.', 'Colleges, firms and startups train people for real vacancies.'),
          cost: 2.8,
          effects: { support: 3, development: 7 },
          resilience: { jobs: 5 },
          flag: { key: 'jobsStrategy', value: 'skills' },
          xp: 135,
          stars: 3,
          future: L('Кадровый контракт сильнее всего снижает риск будущего оттока молодёжи.', 'The skills compact most strongly reduces future youth outmigration risk.'),
          outcome: L('Появляются оплачиваемые стажировки и совместные программы. Быстрого всплеска популярности нет, зато работодатели меняют кадровую стратегию.', 'Paid internships and joint programmes appear. Popularity does not jump immediately, but employers change their staffing strategy.')
        },
        {
          id: 'first-job',
          icon: 'briefcase',
          title: L('Субсидировать первое рабочее место', 'Subsidise first jobs'),
          description: L('Быстрый найм выпускников за счёт компенсации части зарплаты работодателю.', 'Rapid graduate hiring through partial wage compensation.'),
          cost: 3.2,
          effects: { support: 6, development: 3 },
          resilience: { jobs: 2 },
          flag: { key: 'jobsStrategy', value: 'subsidy' },
          xp: 105,
          stars: 2,
          future: L('Программа смягчит первые признаки оттока, но часть рабочих мест исчезнет после субсидий.', 'The programme softens early outmigration, but some jobs disappear when subsidies end.'),
          outcome: L('Число вакансий быстро растёт, и программа получает широкую поддержку. Устойчивость рабочих мест пока не доказана.', 'Vacancies grow quickly and the programme gains broad support. Job durability remains uncertain.')
        },
        {
          id: 'industrial-park',
          icon: 'factory',
          title: L('Дать льготы новому индустриальному парку', 'Offer incentives to an industrial park'),
          description: L('Самый быстрый рост инвестиций, но жители опасаются, что выгоды получит прежде всего крупный бизнес.', 'The fastest investment growth, but residents fear that large firms will capture most benefits.'),
          cost: 1.5,
          effects: { support: -1, development: 9 },
          resilience: { jobs: 3 },
          flag: { key: 'jobsStrategy', value: 'industry' },
          xp: 120,
          stars: 2,
          future: L('Новая площадка создаст рабочие места, если инвестор выполнит обещания.', 'The new site creates jobs if the investor keeps its commitments.'),
          outcome: L('Инвестор объявляет первую очередь проекта. Бизнес реагирует позитивно, но часть жителей требует гарантий занятости и экологического контроля.', 'The investor announces the first project phase. Business reacts positively, while residents demand job guarantees and environmental oversight.')
        }
      ]
    },
    {
      id: 'flood-preparedness',
      chapter: 1,
      districtId: 'river',
      icon: 'flood',
      art: 'assets/scenes/river-before-flood-scene.webp',
      kicker: L('Миссия развития', 'Development mission'),
      title: L('Подготовить речную долину к паводку', 'Prepare the river valley for floods'),
      description: L('Гидрологи предупреждают: в ближайшие годы экстремальные осадки станут чаще. Пока бедствия нет, но окно для профилактики быстро закрывается.', 'Hydrologists warn that extreme rainfall will become more frequent. There is no disaster yet, but the prevention window is closing.'),
      objective: L('Выбрать между дешёвой готовностью населения и капитальной защитой территории.', 'Choose between low-cost community readiness and capital protection.'),
      reward: { xp: 135, stars: 3 },
      advisors: {
        mira: L('Оповещение и обучение спасают жизни даже там, где невозможно быстро построить защитные сооружения.', 'Warnings and training save lives even where defences cannot be built quickly.'),
        ilya: L('Защитные сооружения дороги, но именно они меняют масштаб будущего ущерба.', 'Flood defences are expensive, but they change the scale of future damage.'),
        elena: L('Если жители не понимают план эвакуации, даже хорошая инфраструктура сработает хуже.', 'If residents do not understand evacuation plans, even strong infrastructure underperforms.'),
        viktor: L('Не забывайте: после строительства дамб останутся расходы на обслуживание и мониторинг.', 'Remember that levees create future maintenance and monitoring costs.')
      },
      actions: [
        {
          id: 'outreach',
          icon: 'community',
          art: 'assets/art/flood-outreach.webp',
          title: L('Обучить жителей и настроить оповещение', 'Train residents and improve warnings'),
          description: L('Дешёвая и быстрая подготовка, но физический ущерб почти не снижается.', 'Fast and affordable preparation, but physical damage remains high.'),
          cost: 1.2,
          effects: { support: 5, development: 1 },
          resilience: { flood: 2 },
          flag: { key: 'floodStrategy', value: 'outreach' },
          xp: 95,
          stars: 1,
          future: L('План эвакуации уменьшит потери доверия при паводке.', 'The evacuation plan reduces trust losses during a flood.'),
          outcome: L('Муниципалитеты проводят учения, а телефоны жителей подключают к системе предупреждений. Инфраструктура остаётся уязвимой.', 'Municipalities conduct drills and connect residents to warning systems. Infrastructure remains vulnerable.')
        },
        {
          id: 'defenses',
          icon: 'shield-water',
          art: 'assets/art/flood-defenses.webp',
          title: L('Построить защитные сооружения', 'Build flood defences'),
          description: L('Самая дорогая мера, но она сильнее всего уменьшает будущий ущерб.', 'The most expensive option, but it reduces future damage most strongly.'),
          cost: 4.0,
          effects: { support: 2, development: 6 },
          resilience: { flood: 6 },
          flag: { key: 'floodStrategy', value: 'defenses' },
          xp: 145,
          stars: 3,
          future: L('Дамбы и водоотводы почти полностью меняют сценарий будущего паводка.', 'Levees and drainage fundamentally change the future flood scenario.'),
          outcome: L('Начинается строительство на наиболее опасных участках. Бюджет напряжён, зато у региона появляется реальный запас устойчивости.', 'Construction begins at the most dangerous sites. The budget tightens, but the region gains real resilience.')
        },
        {
          id: 'infrastructure',
          icon: 'bridge',
          art: 'assets/art/flood-infrastructure.webp',
          title: L('Модернизировать мосты и ливневые сети', 'Upgrade bridges and drainage'),
          description: L('Сбалансированная программа одновременно защищает и развивает территорию.', 'A balanced programme that protects and develops the territory.'),
          cost: 3.4,
          effects: { support: 3, development: 5 },
          resilience: { flood: 4 },
          flag: { key: 'floodStrategy', value: 'infrastructure' },
          xp: 125,
          stars: 2,
          future: L('Обновлённые сети снизят ущерб и ускорят восстановление транспортной связности.', 'Upgraded networks reduce damage and accelerate transport recovery.'),
          outcome: L('Работы распределяются по нескольким муниципалитетам. Эффект менее заметен, чем новая дамба, но охватывает больше повседневных проблем.', 'Works are distributed across municipalities. The effect is less visible than a new levee, but addresses more everyday problems.')
        }
      ]
    },
    {
      id: 'digital-services',
      chapter: 1,
      districtId: 'capital',
      icon: 'digital',
      art: 'assets/scenes/capital-service-scene.webp',
      kicker: L('Миссия развития', 'Development mission'),
      title: L('Перезапустить цифровые госуслуги', 'Relaunch digital public services'),
      description: L('Жители жалуются на очереди и разрозненные порталы. Регион может быстро улучшить сервис, но любая цифровизация создаёт новые уязвимости.', 'Residents complain about queues and fragmented portals. The region can improve service quickly, but digitalisation creates new vulnerabilities.'),
      objective: L('Сочетать удобство сервиса с защитой данных и устойчивостью процессов.', 'Combine service convenience with data protection and operational resilience.'),
      reward: { xp: 125, stars: 2 },
      advisors: {
        mira: L('Цифровой сервис не должен исключать пожилых людей и жителей без устойчивого доступа к интернету.', 'Digital service must not exclude older residents or people without reliable internet.'),
        ilya: L('Резервные контуры и киберзащита редко приносят популярность, но определяют устойчивость всей системы.', 'Backups and cyber security rarely win popularity, but they determine system resilience.'),
        elena: L('Открытая обратная связь быстро вернёт доверие и покажет, какие услуги действительно неудобны.', 'Open feedback quickly restores trust and shows which services actually fail users.'),
        viktor: L('Единый портал дешевле множества ведомственных систем, но перенос данных создаёт переходные риски.', 'A single portal is cheaper than many departmental systems, but data migration creates transition risks.')
      },
      actions: [
        {
          id: 'single-window',
          icon: 'portal',
          title: L('Создать единое цифровое окно', 'Create a single digital window'),
          description: L('Быстрое повышение удобства и заметный эффект для доверия.', 'A rapid improvement in convenience and a visible trust effect.'),
          cost: 2.4,
          effects: { support: 5, development: 5 },
          resilience: { digital: 2 },
          flag: { key: 'digitalStrategy', value: 'portal' },
          xp: 115,
          stars: 2,
          future: L('Единый портал упростит обслуживание, но останется уязвимым без резервного контура.', 'The single portal simplifies service but remains vulnerable without a backup layer.'),
          outcome: L('Основные услуги объединяются в одном интерфейсе. Очереди снижаются, а зависимость от цифровой платформы растёт.', 'Core services move into one interface. Queues fall, while dependence on the platform grows.')
        },
        {
          id: 'cyber-first',
          icon: 'cyber',
          title: L('Сначала построить защищённый резервный контур', 'Build a secure backup layer first'),
          description: L('Менее заметно для жителей, зато это сильнейшая защита от будущего сбоя.', 'Less visible to residents, but the strongest protection against a future outage.'),
          cost: 2.8,
          effects: { support: 1, development: 4 },
          resilience: { digital: 6 },
          flag: { key: 'digitalStrategy', value: 'cyber' },
          xp: 145,
          stars: 3,
          future: L('Резервные центры и учения радикально сократят ущерб от кибератаки.', 'Backup centres and drills radically reduce cyberattack damage.'),
          outcome: L('Команда создаёт резервирование и проводит учения. Пользователь почти не замечает перемен, зато система готовится к отказу.', 'The team builds redundancy and runs drills. Users barely notice the change, but the system prepares for failure.')
        },
        {
          id: 'open-feedback',
          icon: 'dialogue',
          title: L('Открыть данные и канал обратной связи', 'Open data and resident feedback'),
          description: L('Самый сильный быстрый эффект для доверия при слабой технической защите.', 'The strongest short-term trust effect, but weak technical protection.'),
          cost: 1.4,
          effects: { support: 7, development: 2 },
          resilience: { digital: 1 },
          flag: { key: 'digitalStrategy', value: 'open' },
          xp: 100,
          stars: 1,
          future: L('Открытая коммуникация смягчит недовольство, но не предотвратит технический сбой.', 'Open communication softens dissatisfaction but does not prevent a technical outage.'),
          outcome: L('Жители получают понятный статус обращений и публичную статистику. Доверие растёт, но технический долг остаётся.', 'Residents receive clear case status and public statistics. Trust rises, but technical debt remains.')
        }
      ]
    },
    {
      id: 'flu-wave',
      chapter: 2,
      districtId: 'north',
      icon: 'health',
      art: 'assets/scenes/respiratory-outbreak-scene.webp',
      kicker: L('Кризисная миссия', 'Crisis mission'),
      title: L('Волна респираторной инфекции', 'Respiratory infection wave'),
      description: L('Заболеваемость резко растёт. Теперь становится видно, была ли прежняя реформа реальной системой или только красивым проектом.', 'Cases are rising sharply. The region now discovers whether its earlier reform created a real system or merely an attractive project.'),
      objective: L('Сдержать кризис, используя созданный медицинский резерв.', 'Contain the crisis using the healthcare capacity already created.'),
      reward: { xp: 150, stars: 3 },
      crisis: {
        key: 'health', threshold: 5,
        perGap: { budget: -0.25, support: -0.9, development: -0.35 },
        preparedText: L('Медицинская подготовка сработала: первые потери оказались ограниченными.', 'Healthcare preparation worked: initial losses were limited.'),
        partialText: L('Часть системы выдержала нагрузку, но слабые места быстро стали заметны.', 'Part of the system absorbed the pressure, but weak points became visible.'),
        unpreparedText: L('Регион вошёл в эпидемию без достаточного резерва, и первые недели оказались тяжёлыми.', 'The region entered the epidemic without enough reserve, and the first weeks were severe.')
      },
      advisors: {
        mira: L('Не допустите, чтобы удалённые поселения снова оказались последними в очереди за помощью.', 'Do not let remote settlements become the last to receive help again.'),
        ilya: L('Используйте именно тот контур, который создавали раньше: кризис должен проверить стратегию, а не отменить её.', 'Use the capacity built earlier: the crisis should test the strategy rather than replace it.'),
        elena: L('Регулярно объясняйте жителям, где получить помощь и почему приоритеты меняются.', 'Explain regularly where people can get help and why priorities are changing.'),
        viktor: L('Экстренные закупки дороги. Сначала проверьте, какие ресурсы уже доступны внутри созданной системы.', 'Emergency procurement is expensive. First check which resources already exist in the system.')
      },
      actions: [
        {
          id: 'emergency-purchase',
          icon: 'medical-box',
          art: 'assets/art/health-clinics.webp',
          title: L('Провести экстренные закупки и развернуть койки', 'Procure supplies and expand beds'),
          description: L('Надёжное, но дорогое решение, частично заменяющее слабую подготовку.', 'A reliable but expensive response that partly substitutes for weak preparation.'),
          cost: 3.4,
          effects: { support: 5, development: -1 },
          resilience: { health: 1 },
          xp: 125,
          stars: 2,
          future: L('Кризис будет погашен, но экстренный режим не создаст устойчивую модель сам по себе.', 'The crisis will be contained, but emergency mode does not create a sustainable model by itself.'),
          outcome: L('Регион быстро закупает лекарства и оборудование. Система выдерживает, но цена экстренности высока.', 'The region rapidly buys medicines and equipment. The system holds, but emergency action is costly.')
        },
        {
          id: 'mobilise-network',
          icon: 'telemedicine',
          art: 'assets/art/health-mobile.webp',
          title: L('Мобилизовать созданную сеть помощи', 'Mobilise the existing care network'),
          description: L('Эффективность напрямую зависит от решения, принятого в первой миссии.', 'Effectiveness directly depends on the first mission decision.'),
          cost: 2.1,
          effects: { support: 3, development: 2 },
          resilience: { health: 1 },
          bonuses: [
            { flag: 'healthStrategy', values: ['mobile', 'training'], effects: { support: 2, development: 2 }, text: L('Мобильные бригады и подготовленные кадры дали дополнительный эффект.', 'Mobile teams and trained staff delivered an additional benefit.') },
            { flag: 'healthStrategy', values: ['clinics'], effects: { support: 1, development: 1 }, text: L('Новые клиники приняли основной поток пациентов.', 'New clinics absorbed the main patient flow.') }
          ],
          xp: 150,
          stars: 3,
          future: L('Успешная мобилизация превращает прежнюю реформу в доказанную систему.', 'Successful mobilisation turns the earlier reform into a proven system.'),
          outcome: L('Регион объединяет первичное звено, мобильные маршруты и дистанционные консультации в единый штаб.', 'The region integrates primary care, mobile routes and remote consultations under one command.')
        },
        {
          id: 'federal-help',
          icon: 'handshake',
          title: L('Запросить федеральную помощь', 'Request federal assistance'),
          description: L('Самая дешёвая мера, но жители оценивают её как признак слабой собственной готовности.', 'The cheapest response, but residents may see it as evidence of weak regional readiness.'),
          cost: 0.8,
          effects: { support: -1, development: 0 },
          resilience: { health: 0 },
          bonuses: [
            { resilience: { key: 'health', min: 4 }, effects: { support: 2 }, text: L('Высокая собственная готовность позволила представить помощь как разумную координацию, а не беспомощность.', 'Strong regional readiness framed assistance as coordination rather than helplessness.') }
          ],
          xp: 85,
          stars: 1,
          future: L('Кризис будет смягчён, но регион почти не наращивает собственную способность реагировать.', 'The crisis is softened, but the region builds little response capacity of its own.'),
          outcome: L('Федеральные специалисты и запасы прибывают, но регион теряет часть самостоятельной повестки.', 'Federal specialists and supplies arrive, but the region loses part of its own agenda.')
        }
      ]
    },
    {
      id: 'youth-outflow',
      chapter: 2,
      districtId: 'industrial',
      icon: 'jobs',
      art: 'assets/scenes/youth-outflow-scene.webp',
      kicker: L('Кризисная миссия', 'Crisis mission'),
      title: L('Ускорение оттока молодёжи', 'Accelerating youth outmigration'),
      description: L('Крупный работодатель сокращает набор, и молодые специалисты снова рассматривают переезд. Результат прежней политики становится измеримым.', 'A major employer cuts recruitment and young professionals again consider leaving. The earlier policy is now measurable.'),
      objective: L('Удержать человеческий капитал без бесконечного субсидирования рабочих мест.', 'Retain human capital without endless job subsidies.'),
      reward: { xp: 155, stars: 3 },
      crisis: {
        key: 'jobs', threshold: 5,
        perGap: { budget: -0.10, support: -0.75, development: -0.65 },
        preparedText: L('Ранее созданные карьерные траектории удержали значительную часть выпускников.', 'Earlier career pathways retained a large share of graduates.'),
        partialText: L('Часть молодых специалистов осталась, но зависимость от отдельных работодателей сохранилась.', 'Some young professionals stayed, but dependence on a few employers remained.'),
        unpreparedText: L('Регион не успел создать устойчивые карьерные траектории, и отъезд быстро усилился.', 'The region failed to create durable career paths and departures accelerated quickly.')
      },
      advisors: {
        mira: L('Люди уезжают не только из-за зарплаты: жильё, среда и уверенность в будущем также важны.', 'People leave for more than wages: housing, quality of place and confidence in the future matter too.'),
        ilya: L('Не возвращайтесь автоматически к субсидиям. Усильте структуру, которую уже начали строить.', 'Do not automatically return to subsidies. Strengthen the structure already created.'),
        elena: L('Дайте молодым специалистам возможность участвовать в формировании программы, а не только получать готовые меры.', 'Let young professionals shape the programme rather than merely receive it.'),
        viktor: L('Жилищная программа быстро съест бюджет. Ограничьте её теми, кто действительно закрепляется в регионе.', 'A housing programme can consume the budget quickly. Target those who actually remain in the region.')
      },
      actions: [
        {
          id: 'skills-scale',
          icon: 'graduation',
          title: L('Расширить кадровый контракт на новые отрасли', 'Scale the skills compact to new sectors'),
          description: L('Лучший вариант при ранее созданной системе колледжей и работодателей.', 'Best when the college–industry system already exists.'),
          cost: 2.5,
          effects: { support: 3, development: 5 },
          resilience: { jobs: 1 },
          bonuses: [
            { flag: 'jobsStrategy', values: ['skills'], effects: { support: 2, development: 3 }, text: L('Ранее созданный кадровый контракт позволил быстро масштабировать программу.', 'The earlier skills compact allowed rapid scaling.') }
          ],
          xp: 155,
          stars: 3,
          future: L('Регион снижает зависимость от одного работодателя и расширяет карьерные маршруты.', 'The region reduces dependence on one employer and expands career pathways.'),
          outcome: L('Новые программы запускаются в логистике, медицине и цифровых сервисах. Выпускники видят несколько траекторий вместо одной.', 'New programmes launch in logistics, healthcare and digital services. Graduates see several pathways rather than one.')
        },
        {
          id: 'housing-package',
          icon: 'house',
          title: L('Предложить жильё молодым специалистам', 'Offer housing to young professionals'),
          description: L('Сильный эффект для доверия, но высокая цена и слабое влияние на структуру экономики.', 'A strong trust effect, but high cost and limited structural economic impact.'),
          cost: 3.6,
          effects: { support: 7, development: 2 },
          resilience: { jobs: 1 },
          xp: 120,
          stars: 2,
          future: L('Жильё отсрочит отъезд, однако без новых рабочих траекторий проблема может вернуться.', 'Housing delays departures, but the problem may return without new career pathways.'),
          outcome: L('Первые сертификаты получают дефицитные специалисты. Программа популярна, но спрос быстро превышает предложение.', 'Scarce-skill professionals receive the first certificates. The programme is popular, but demand quickly exceeds supply.')
        },
        {
          id: 'startup-challenge',
          icon: 'rocket',
          title: L('Запустить конкурс молодых предпринимателей', 'Launch a young entrepreneur challenge'),
          description: L('Средняя стоимость, высокий потенциал и заметная неопределённость результата.', 'Moderate cost, high potential and significant uncertainty.'),
          cost: 2.2,
          effects: { support: 4, development: 6 },
          resilience: { jobs: 2 },
          bonuses: [
            { flag: 'jobsStrategy', values: ['industry'], effects: { development: 2 }, text: L('Индустриальный парк дал площадки и заказчиков для новых компаний.', 'The industrial park provided sites and customers for new firms.') }
          ],
          xp: 140,
          stars: 2,
          future: L('Успешные проекты диверсифицируют занятость, но не все команды останутся в регионе.', 'Successful projects diversify employment, but not every team will stay in the region.'),
          outcome: L('Команды получают гранты, наставников и первые заказы. Результат распределён неравномерно, зато появляются новые центры роста.', 'Teams receive grants, mentors and first contracts. Results are uneven, but new growth centres appear.')
        }
      ]
    },
    {
      id: 'major-flood',
      chapter: 2,
      districtId: 'river',
      icon: 'flood',
      art: 'assets/scenes/flood-response-scene.webp',
      kicker: L('Чрезвычайная ситуация', 'Emergency'),
      title: L('Большая вода приходит в долину', 'Major flood reaches the valley'),
      description: L('После нескольких дней ливней река выходит из берегов. Теперь профилактика превращается в реальные спасённые дома, дороги и доверие.', 'After days of heavy rain, the river overflows. Prevention now becomes real homes, roads and trust saved.'),
      objective: L('Спасти людей и восстановить связность территории, не разрушив бюджет кампании.', 'Protect residents and restore connectivity without destroying the campaign budget.'),
      reward: { xp: 170, stars: 4 },
      crisis: {
        key: 'flood', threshold: 6,
        perGap: { budget: -0.55, support: -0.9, development: -0.55 },
        preparedText: L('Защитная система удержала основной поток, а ущерб оказался локальным.', 'The protection system held the main flow and damage remained local.'),
        partialText: L('Часть мер сработала, но несколько районов всё же потеряли транспортную связь.', 'Some measures worked, but several districts still lost transport access.'),
        unpreparedText: L('Паводок застал инфраструктуру уязвимой, и регион сразу понёс крупные потери.', 'The flood found vulnerable infrastructure and the region immediately suffered major losses.')
      },
      advisors: {
        mira: L('Сначала обеспечьте эвакуацию и доступ к помощи. Восстановление можно планировать после стабилизации.', 'Secure evacuation and access to help first. Recovery can be planned after stabilisation.'),
        ilya: L('Используйте кризис, чтобы не просто восстановить старую уязвимость, а повысить стандарт защиты.', 'Use the crisis to improve protection standards rather than restore old vulnerability.'),
        elena: L('Публикуйте карту закрытых дорог и сроки помощи. Информационный вакуум быстро уничтожает доверие.', 'Publish closed-road maps and aid timelines. An information vacuum destroys trust quickly.'),
        viktor: L('Не обещайте полную компенсацию всем без оценки ущерба: это создаст обязательства, которые кампания не выдержит.', 'Do not promise full compensation without damage assessment: it creates obligations the campaign cannot sustain.')
      },
      actions: [
        {
          id: 'evacuate',
          icon: 'bus',
          art: 'assets/art/flood-outreach.webp',
          title: L('Сосредоточиться на эвакуации и адресной помощи', 'Focus on evacuation and targeted aid'),
          description: L('Быстро защищает людей и доверие, но инфраструктурный ущерб остаётся.', 'Rapidly protects residents and trust, but infrastructure damage remains.'),
          cost: 1.5,
          effects: { support: 6, development: -1 },
          resilience: { flood: 0 },
          bonuses: [
            { flag: 'floodStrategy', values: ['outreach'], effects: { support: 2 }, text: L('Ранее отработанный план эвакуации сделал операцию значительно эффективнее.', 'The previously rehearsed evacuation plan made the operation far more effective.') }
          ],
          xp: 135,
          stars: 2,
          future: L('Люди защищены, но региону ещё предстоит дорогое восстановление дорог и сетей.', 'People are protected, but the region still faces expensive network and road repairs.'),
          outcome: L('Эвакуационные центры разворачиваются быстро, помощь получают самые уязвимые семьи. Транспортные потери откладываются на следующий бюджет.', 'Evacuation centres deploy quickly and the most vulnerable families receive aid. Transport losses move into the next budget.')
        },
        {
          id: 'rebuild-better',
          icon: 'shield-water',
          art: 'assets/art/flood-defenses.webp',
          title: L('Восстановить и одновременно повысить стандарт защиты', 'Rebuild to a higher protection standard'),
          description: L('Самая дорогая реакция, превращающая кризис в долгосрочное обновление.', 'The most expensive response, turning crisis into long-term renewal.'),
          cost: 3.9,
          effects: { support: 3, development: 6 },
          resilience: { flood: 2 },
          bonuses: [
            { flag: 'floodStrategy', values: ['defenses', 'infrastructure'], effects: { development: 3 }, text: L('Предыдущие проекты дали готовую документацию и подрядчиков, поэтому восстановление ускорилось.', 'Earlier projects provided designs and contractors, accelerating recovery.') }
          ],
          xp: 175,
          stars: 4,
          future: L('После восстановления риск повторного ущерба станет минимальным.', 'After recovery, the risk of repeated damage becomes minimal.'),
          outcome: L('Регион объединяет ремонт дорог, водоотвод и защиту населённых пунктов в одну программу повышенного стандарта.', 'The region combines road repair, drainage and settlement protection in one higher-standard programme.')
        },
        {
          id: 'compensation',
          icon: 'coins',
          title: L('Выплатить широкие компенсации', 'Pay broad compensation'),
          description: L('Жители быстро получают поддержку, но развитие территории почти не восстанавливается.', 'Residents receive support quickly, but territorial development barely recovers.'),
          cost: 2.7,
          effects: { support: 7, development: -2 },
          resilience: { flood: 0 },
          xp: 120,
          stars: 2,
          future: L('Компенсации смягчат социальный ущерб, но не снизят вероятность повторения потерь.', 'Compensation softens social damage but does not reduce repeat-loss risk.'),
          outcome: L('Выплаты проходят быстро и снимают острое недовольство. Муниципалитеты предупреждают, что без ремонта уязвимость сохранится.', 'Payments arrive quickly and ease anger. Municipalities warn that vulnerability remains without repairs.')
        }
      ]
    },
    {
      id: 'cyberattack',
      chapter: 2,
      districtId: 'capital',
      icon: 'digital',
      art: 'assets/scenes/digital-outage-scene.webp',
      kicker: L('Чрезвычайная ситуация', 'Emergency'),
      title: L('Кибератака на региональные сервисы', 'Cyberattack on regional services'),
      description: L('Порталы недоступны, часть данных зашифрована, а жители не понимают, где получить услуги. Финальная миссия проверяет цифровую стратегию целиком.', 'Portals are offline, some data is encrypted and residents do not know where to receive services. The final mission tests the entire digital strategy.'),
      objective: L('Восстановить услуги, удержать доверие и не скрывать масштаб проблемы.', 'Restore services, retain trust and avoid concealing the scale of the problem.'),
      reward: { xp: 190, stars: 4 },
      crisis: {
        key: 'digital', threshold: 6,
        perGap: { budget: -0.3, support: -0.85, development: -0.6 },
        preparedText: L('Резервные системы изолировали атаку, и основные услуги продолжили работу.', 'Backup systems isolated the attack and core services remained available.'),
        partialText: L('Часть сервисов удалось быстро восстановить, но зависимость от единой платформы стала очевидной.', 'Some services recovered quickly, but dependence on the central platform became clear.'),
        unpreparedText: L('Сбой распространился на большинство сервисов, а информационный вакуум усилил недоверие.', 'The outage spread across most services and an information vacuum deepened distrust.')
      },
      advisors: {
        mira: L('Организуйте офлайн-точки для тех, кто не может ждать цифрового восстановления.', 'Set up offline service points for people who cannot wait for digital recovery.'),
        ilya: L('Не восстанавливайте уязвимую систему в прежнем виде. Сначала изолируйте контуры и проверьте резервные копии.', 'Do not restore the vulnerable system unchanged. Isolate networks and verify backups first.'),
        elena: L('Честное сообщение о сбое сейчас менее опасно, чем слухи и противоречивые обещания.', 'An honest outage briefing is less damaging than rumours and conflicting promises.'),
        viktor: L('Экстренное привлечение подрядчиков оправдано только с прозрачным объёмом работ и контролем цены.', 'Emergency contractors are justified only with a transparent scope and cost control.')
      },
      actions: [
        {
          id: 'incident-command',
          icon: 'cyber',
          title: L('Создать единый штаб и восстановить резервный контур', 'Create an incident command and restore backups'),
          description: L('Сильное техническое решение, особенно если киберзащита создавалась заранее.', 'A strong technical response, especially if cyber resilience was built earlier.'),
          cost: 2.8,
          effects: { support: 3, development: 5 },
          resilience: { digital: 2 },
          bonuses: [
            { flag: 'digitalStrategy', values: ['cyber'], effects: { support: 3, development: 3 }, text: L('Резервный контур сработал по плану, и время восстановления сократилось в несколько раз.', 'The backup layer worked as planned and recovery time fell dramatically.') }
          ],
          xp: 190,
          stars: 4,
          future: L('Регион завершает кампанию с доказанной цифровой устойчивостью.', 'The region ends the campaign with proven digital resilience.'),
          outcome: L('Штаб изолирует заражённые системы, восстанавливает данные и публикует график возвращения услуг.', 'The incident command isolates infected systems, restores data and publishes a service recovery timetable.')
        },
        {
          id: 'offline-centres',
          icon: 'service-desk',
          title: L('Развернуть временные офлайн-центры услуг', 'Deploy temporary offline service centres'),
          description: L('Сильнее всего защищает жителей, но почти не решает техническую причину атаки.', 'Best protects residents, but barely addresses the technical cause.'),
          cost: 1.6,
          effects: { support: 6, development: 1 },
          resilience: { digital: 0 },
          bonuses: [
            { flag: 'digitalStrategy', values: ['portal'], effects: { support: 1 }, text: L('Единые регламенты портала помогли быстро перенести процедуры в офлайн.', 'Unified portal procedures helped transfer services offline quickly.') }
          ],
          xp: 145,
          stars: 2,
          future: L('Жители сохраняют доступ к услугам, но цифровая система потребует отдельной модернизации.', 'Residents retain access, but the digital system still requires separate modernisation.'),
          outcome: L('МФЦ и мобильные пункты переходят на бумажные и локальные процедуры. Очереди растут, но критические услуги доступны.', 'Service centres and mobile offices switch to paper and local procedures. Queues grow, but critical services remain available.')
        },
        {
          id: 'open-briefing',
          icon: 'megaphone',
          title: L('Провести открытый брифинг и привлечь внешних экспертов', 'Hold an open briefing and bring in external experts'),
          description: L('Дешёвое решение для доверия; технический эффект зависит от прежней готовности.', 'A low-cost trust response; technical success depends on prior readiness.'),
          cost: 0.9,
          effects: { support: 4, development: 0 },
          resilience: { digital: 0 },
          bonuses: [
            { flag: 'digitalStrategy', values: ['open'], effects: { support: 3 }, text: L('Ранее созданный канал обратной связи помог быстро донести проверенную информацию.', 'The earlier feedback channel helped distribute verified information quickly.') },
            { resilience: { key: 'digital', max: 2 }, effects: { development: -2 }, text: L('Открытость не смогла компенсировать слабую техническую готовность.', 'Openness could not compensate for weak technical readiness.') }
          ],
          xp: 125,
          stars: 2,
          future: L('Прозрачность смягчает репутационный ущерб, но сама по себе не восстанавливает системы.', 'Transparency softens reputational damage but does not restore systems by itself.'),
          outcome: L('Регион публикует факты, приглашает независимых специалистов и избегает слухов. Техническое восстановление остаётся отдельной задачей.', 'The region publishes facts, invites independent specialists and avoids rumours. Technical recovery remains a separate task.')
        }
      ]
    }
  ];

  const quests = [
    {
      id: 'fiscal-cushion',
      icon: 'coins',
      title: L('Сохранить резерв', 'Keep a fiscal cushion'),
      description: L('Завершить кампанию с бюджетом не ниже 5 млрд ₽.', 'Finish with at least 5 bn RUB.'),
      evaluate: state => Math.min(1, state.stats.budget / 5),
      complete: state => state.stats.budget >= 5
    },
    {
      id: 'public-trust',
      icon: 'people',
      title: L('Доверие жителей', 'Public trust'),
      description: L('Поднять поддержку до 70% или выше.', 'Raise public support to 70% or more.'),
      evaluate: state => Math.min(1, state.stats.support / 70),
      complete: state => state.stats.support >= 70
    },
    {
      id: 'development-path',
      icon: 'development',
      title: L('Траектория развития', 'Development trajectory'),
      description: L('Довести развитие региона до 65 пунктов.', 'Raise regional development to 65.'),
      evaluate: state => Math.min(1, state.stats.development / 65),
      complete: state => state.stats.development >= 65
    },
    {
      id: 'preparedness',
      icon: 'shield',
      title: L('Готовность к кризисам', 'Crisis preparedness'),
      description: L('Накопить не менее 16 пунктов стратегической устойчивости.', 'Accumulate at least 16 resilience points.'),
      evaluate: state => Math.min(1, Object.values(state.resilience).reduce((a, b) => a + b, 0) / 16),
      complete: state => Object.values(state.resilience).reduce((a, b) => a + b, 0) >= 16
    }
  ];

  const badges = [
    {
      id: 'first-decision', icon: 'flag', title: L('Первый мандат', 'First mandate'),
      description: L('Принять первое управленческое решение.', 'Confirm the first policy decision.'),
      test: state => state.history.length >= 1
    },
    {
      id: 'prepared-governor', icon: 'shield', title: L('Готовый к испытаниям', 'Ready for pressure'),
      description: L('Накопить 16 пунктов устойчивости.', 'Accumulate 16 resilience points.'),
      test: state => Object.values(state.resilience).reduce((a, b) => a + b, 0) >= 16
    },
    {
      id: 'people-governor', icon: 'people', title: L('Губернатор доверия', 'People’s governor'),
      description: L('Достичь поддержки 75%.', 'Reach 75% public support.'),
      test: state => state.stats.support >= 75
    },
    {
      id: 'builder', icon: 'development', title: L('Архитектор развития', 'Development architect'),
      description: L('Достичь 72 пунктов развития.', 'Reach 72 development points.'),
      test: state => state.stats.development >= 72
    },
    {
      id: 'fiscal-guardian', icon: 'coins', title: L('Хранитель бюджета', 'Fiscal guardian'),
      description: L('Завершить кампанию с бюджетом 8 млрд ₽ или выше.', 'Finish with at least 8 bn RUB.'),
      test: state => state.completed && state.stats.budget >= 8
    },
    {
      id: 'balanced-path', icon: 'balance', title: L('Сбалансированный курс', 'Balanced path'),
      description: L('Завершить кампанию с поддержкой и развитием не ниже 65 и бюджетом не ниже 4 млрд ₽.', 'Finish with support and development at 65 or more and budget at 4 bn RUB or more.'),
      test: state => state.completed && state.stats.support >= 65 && state.stats.development >= 65 && state.stats.budget >= 4
    }
  ];


  // ----- Stage 2: finance, delivery and fiscal-responsibility metadata -----
  Object.assign(ui.ru, {
    appSubtitle: 'Решай. Финансируй. Отвечай за последствия.',
    startLead: 'Восемь связанных миссий теперь проверяют не только выбор приоритета, но и способ его финансирования. Используйте собственный ресурс, резерв, софинансирование и долг так, чтобы сегодняшнее решение не разрушило бюджет следующих ходов.',
    demoBadge: 'Этап 2 · казна, проекты и обязательства',
    featureMission: '8 сюжетных миссий и 24 решения',
    featureConsequences: 'проекты строятся, запускаются и требуют содержания',
    featureOffline: 'строгий бюджетный баланс и воспроизводимый отчёт',
    budget: 'Свободный ресурс',
    navTreasury: 'Казна',
    treasuryTitle: 'Казначейство Новой области',
    treasuryLead: 'За простым игровым HUD скрывается полный бюджетный регистр: доходы, обязательства, резерв, долг и стоимость уже запущенных проектов.',
    reserve: 'Резерв',
    debt: 'Долг',
    debtLimit: 'Лимит долга',
    debtService: 'Обслуживание долга',
    operatingBalance: 'Операционный баланс',
    ownRevenue: 'Собственные доходы',
    nonTaxRevenue: 'Неналоговые доходы',
    equalizationGrant: 'Дотация',
    mandatoryCosts: 'Обязательные расходы',
    programmeOpex: 'Содержание программ',
    currentYearLedger: 'Бюджетный путь текущего хода',
    projectPortfolio: 'Портфель обязательств',
    noProjects: 'Пока нет действующих проектов. Первое решение создаст не только эффект, но и финансовое обязательство.',
    adminCapacity: 'Управленческая способность',
    adminLoad: 'Нагрузка аппарата',
    identityVerified: 'Баланс сходится',
    identityError: 'Нарушена бюджетная идентичность',
    fundingTitle: 'Источник финансирования',
    fundingTreasury: 'Собственные средства',
    fundingTreasuryShort: 'Казна',
    fundingCofinance: 'Федеральное софинансирование',
    fundingCofinanceShort: 'Софинансирование',
    fundingDebt: 'Региональные облигации',
    fundingDebtShort: 'Долг',
    fundingReserve: 'Резервный фонд',
    fundingReserveShort: 'Резерв',
    fundingRecommended: 'Рекомендуется',
    fundingUnavailable: 'Недоступно',
    totalProjectCost: 'Полная стоимость',
    ownContribution: 'Из казны сейчас',
    federalShare: 'Целевые средства',
    reserveUse: 'Из резерва',
    debtIssue: 'Новый долг',
    futureCommitment: 'Будущие обязательства',
    annualOpex: 'Содержание за ход',
    launchIn: 'Запуск через',
    immediately: 'сразу',
    oneTurn: '1 ход',
    turns: 'хода',
    capacityUnits: 'ед. способности',
    implementationReady: 'Исполнимо',
    implementationTight: 'Аппарат перегружен',
    implementationBlocked: 'Не хватает управленческой способности',
    treasuryReason: 'Быстро и гибко, но полностью расходует свободный ресурс.',
    cofinanceReason: 'Снижает собственный взнос, но добавляет условия, отчётность и задержку запуска.',
    debtReason: 'Позволяет начать капитальный проект сейчас, но увеличивает долг и будущие проценты.',
    reserveReason: 'Самая быстрая реакция на кризис, но следующий шок регион встретит с меньшей подушкой.',
    underConstruction: 'Реализация',
    activeProgramme: 'Работает',
    completedProgramme: 'Завершено',
    startsNext: 'до запуска',
    remains: 'осталось',
    portfolioEmpty: 'Нет новых обязательств',
    fiscalRule: 'Свободный ресурс – это остаток после обязательных расходов, процентов и содержания программ.',
    lifecycleActivated: 'Проект начал работать',
    lifecycleCompleted: 'Программа завершена',
    bailoutTitle: 'Стабилизационная помощь',
    bailoutText: 'Казна не покрыла обязательные платежи. Регион использовал резерв, заём или экстренный трансферт, что отразилось на доверии.',
    financeInResolution: 'Финансирование и обязательства',
    debtPressure: 'Долговая нагрузка',
    reserveCoverage: 'Подушка безопасности',
    latestLedger: 'Последний закрытый бюджетный ход',
    currentLedger: 'Текущий открытый бюджетный ход',
    inflows: 'Поступления',
    outflows: 'Расходы',
    closingTreasury: 'Остаток казны',
    portfolioHint: 'Проекты с лагом сначала загружают аппарат, затем начинают приносить эффект и требовать ежегодного содержания.',
    financeTip: 'Софинансирование экономит казну, долг ускоряет стройку, резерв спасает в кризисе. Ни один источник не является бесплатным.',
    openTreasury: 'Открыть казначейство',
    actionCostFrom: 'собственный взнос от',
    reserveProtected: 'Резерв покрыл часть ущерба',
    modelStage: 'Финансовое ядро 2.0',
    fiscalIntegrity: 'Фискальная целостность'
  });

  Object.assign(ui.en, {
    appSubtitle: 'Decide. Fund. Own the consequences.',
    startLead: 'Eight connected missions now test not only what you choose but how you finance it. Use fiscal space, reserves, co-financing and debt without letting today’s decision break the next turns.',
    demoBadge: 'Stage 2 · treasury, projects and commitments',
    featureMission: '8 story missions and 24 choices',
    featureConsequences: 'projects are delivered, activated and maintained',
    featureOffline: 'strict budget identity and reproducible reports',
    budget: 'Fiscal space',
    navTreasury: 'Treasury',
    treasuryTitle: 'Treasury of Novaya Region',
    treasuryLead: 'Behind the simple game HUD sits a complete fiscal register: revenue, mandatory commitments, reserves, debt and the cost of projects already launched.',
    reserve: 'Reserve',
    debt: 'Debt',
    debtLimit: 'Debt limit',
    debtService: 'Debt service',
    operatingBalance: 'Operating balance',
    ownRevenue: 'Own-source revenue',
    nonTaxRevenue: 'Non-tax revenue',
    equalizationGrant: 'Equalisation grant',
    mandatoryCosts: 'Mandatory expenditure',
    programmeOpex: 'Programme operations',
    currentYearLedger: 'Fiscal path of the current turn',
    projectPortfolio: 'Commitment portfolio',
    noProjects: 'No active projects yet. The first choice will create a financial commitment as well as an outcome.',
    adminCapacity: 'Administrative capacity',
    adminLoad: 'Government workload',
    identityVerified: 'Budget identity verified',
    identityError: 'Budget identity broken',
    fundingTitle: 'Funding source',
    fundingTreasury: 'Own fiscal space',
    fundingTreasuryShort: 'Treasury',
    fundingCofinance: 'Federal co-financing',
    fundingCofinanceShort: 'Co-financing',
    fundingDebt: 'Regional bonds',
    fundingDebtShort: 'Debt',
    fundingReserve: 'Emergency reserve',
    fundingReserveShort: 'Reserve',
    fundingRecommended: 'Recommended',
    fundingUnavailable: 'Unavailable',
    totalProjectCost: 'Total project cost',
    ownContribution: 'Treasury now',
    federalShare: 'Earmarked funding',
    reserveUse: 'Reserve draw',
    debtIssue: 'New debt',
    futureCommitment: 'Future commitments',
    annualOpex: 'Operations per turn',
    launchIn: 'Launch in',
    immediately: 'immediately',
    oneTurn: '1 turn',
    turns: 'turns',
    capacityUnits: 'capacity units',
    implementationReady: 'Deliverable',
    implementationTight: 'Government overloaded',
    implementationBlocked: 'Not enough administrative capacity',
    treasuryReason: 'Fast and flexible, but uses the full amount of fiscal space.',
    cofinanceReason: 'Reduces the regional contribution but adds conditions, reporting and a delivery delay.',
    debtReason: 'Starts a capital project now but raises debt and future interest costs.',
    reserveReason: 'Fastest crisis response, but leaves a smaller cushion for the next shock.',
    underConstruction: 'Delivery',
    activeProgramme: 'Operating',
    completedProgramme: 'Complete',
    startsNext: 'until launch',
    remains: 'remaining',
    portfolioEmpty: 'No new commitments',
    fiscalRule: 'Fiscal space is what remains after mandatory expenditure, interest and programme operations.',
    lifecycleActivated: 'Project became operational',
    lifecycleCompleted: 'Programme completed',
    bailoutTitle: 'Stabilisation support',
    bailoutText: 'The treasury could not cover mandatory payments. The region used reserves, borrowing or emergency transfers, reducing trust.',
    financeInResolution: 'Funding and commitments',
    debtPressure: 'Debt pressure',
    reserveCoverage: 'Safety cushion',
    latestLedger: 'Latest closed fiscal turn',
    currentLedger: 'Current open fiscal turn',
    inflows: 'Inflows',
    outflows: 'Outflows',
    closingTreasury: 'Closing treasury',
    portfolioHint: 'Projects with a delivery lag first consume administrative capacity, then become operational and require annual maintenance.',
    financeTip: 'Co-financing saves fiscal space, debt accelerates construction and reserves protect crises. None of these sources is free.',
    openTreasury: 'Open treasury',
    actionCostFrom: 'regional contribution from',
    reserveProtected: 'The reserve absorbed part of the loss',
    modelStage: 'Finance core 2.0',
    fiscalIntegrity: 'Fiscal integrity'
  });

  const scenarioFinance = {
    balanced: {
      openingTreasury: 4.5, reserve: 2.5, debt: 6.0, debtLimit: 16.0, debtRate: 0.07,
      ownTaxRevenue: 35.0, nonTaxRevenue: 3.0, equalizationGrant: 2.5, mandatoryCosts: 37.4,
      adminCapacity: 8.0
    },
    demographic: {
      openingTreasury: 4.0, reserve: 2.2, debt: 7.0, debtLimit: 16.0, debtRate: 0.072,
      ownTaxRevenue: 33.5, nonTaxRevenue: 2.6, equalizationGrant: 3.2, mandatoryCosts: 36.8,
      adminCapacity: 7.5
    },
    infrastructure: {
      openingTreasury: 3.6, reserve: 1.4, debt: 8.5, debtLimit: 17.0, debtRate: 0.075,
      ownTaxRevenue: 34.0, nonTaxRevenue: 3.0, equalizationGrant: 3.0, mandatoryCosts: 37.8,
      adminCapacity: 7.0
    },
    digital: {
      openingTreasury: 4.8, reserve: 2.0, debt: 6.5, debtLimit: 16.5, debtRate: 0.068,
      ownTaxRevenue: 36.0, nonTaxRevenue: 3.2, equalizationGrant: 2.0, mandatoryCosts: 38.0,
      adminCapacity: 8.5
    }
  };
  scenarios.forEach(scenario => {
    scenario.finance = Object.assign({}, scenarioFinance[scenario.id] || scenarioFinance.balanced);
  });

  const financeProfiles = {
    clinics:             { kind: 'capital',   annualOpex: 0.55, lag: 2, duration: 6, adminLoad: 3.0, federalMatch: 0.45, debtEligible: true,  annualEffects: { development: 0.25 } },
    'mobile-units':      { kind: 'programme', annualOpex: 0.45, lag: 1, duration: 4, adminLoad: 2.0, federalMatch: 0.30, debtEligible: false, annualEffects: { support: 0.15 } },
    'train-staff':       { kind: 'programme', annualOpex: 0.35, lag: 1, duration: 5, adminLoad: 2.0, federalMatch: 0.50, debtEligible: false, annualEffects: { development: 0.25 } },
    'skills-compact':    { kind: 'programme', annualOpex: 0.50, lag: 1, duration: 5, adminLoad: 3.0, federalMatch: 0.50, debtEligible: false, annualEffects: { development: 0.25 } },
    'first-job':         { kind: 'programme', annualOpex: 0.80, lag: 0, duration: 3, adminLoad: 2.0, federalMatch: 0.35, debtEligible: false, annualEffects: { support: 0.15 } },
    'industrial-park':   { kind: 'capital',   annualOpex: 0.35, lag: 2, duration: 6, adminLoad: 3.0, federalMatch: 0.40, debtEligible: true,  annualEffects: { development: 0.30 } },
    outreach:            { kind: 'programme', annualOpex: 0.15, lag: 0, duration: 2, adminLoad: 1.0, federalMatch: 0.20, debtEligible: false, annualEffects: { support: 0.10 } },
    defenses:            { kind: 'capital',   annualOpex: 0.25, lag: 2, duration: 8, adminLoad: 3.0, federalMatch: 0.50, debtEligible: true,  annualEffects: { development: 0.20 } },
    infrastructure:      { kind: 'capital',   annualOpex: 0.45, lag: 2, duration: 8, adminLoad: 3.0, federalMatch: 0.45, debtEligible: true,  annualEffects: { development: 0.25 } },
    'single-window':     { kind: 'capital',   annualOpex: 0.35, lag: 1, duration: 6, adminLoad: 2.0, federalMatch: 0.40, debtEligible: true,  annualEffects: { support: 0.10, development: 0.15 } },
    'cyber-first':       { kind: 'capital',   annualOpex: 0.45, lag: 1, duration: 6, adminLoad: 3.0, federalMatch: 0.50, debtEligible: true,  annualEffects: { development: 0.20 } },
    'open-feedback':     { kind: 'programme', annualOpex: 0.20, lag: 0, duration: 3, adminLoad: 1.0, federalMatch: 0.20, debtEligible: false, annualEffects: { support: 0.15 } },
    'emergency-purchase':{ kind: 'emergency', annualOpex: 0.00, lag: 0, duration: 0, adminLoad: 3.0, federalMatch: 0.20, debtEligible: false, reserveEligible: true },
    'mobilise-network':  { kind: 'emergency', annualOpex: 0.20, lag: 0, duration: 2, adminLoad: 2.0, federalMatch: 0.20, debtEligible: false, reserveEligible: true, annualEffects: { support: 0.10 } },
    'federal-help':      { kind: 'emergency', annualOpex: 0.00, lag: 0, duration: 0, adminLoad: 1.0, federalMatch: 0.75, debtEligible: false, reserveEligible: true },
    'skills-scale':      { kind: 'programme', annualOpex: 0.45, lag: 1, duration: 4, adminLoad: 2.0, federalMatch: 0.50, debtEligible: false, annualEffects: { development: 0.20 } },
    'housing-package':   { kind: 'capital',   annualOpex: 0.55, lag: 1, duration: 5, adminLoad: 3.0, federalMatch: 0.40, debtEligible: true,  annualEffects: { support: 0.10 } },
    'startup-challenge': { kind: 'programme', annualOpex: 0.30, lag: 0, duration: 3, adminLoad: 2.0, federalMatch: 0.35, debtEligible: false, annualEffects: { development: 0.20 } },
    evacuate:            { kind: 'emergency', annualOpex: 0.00, lag: 0, duration: 0, adminLoad: 2.0, federalMatch: 0.15, debtEligible: false, reserveEligible: true },
    'rebuild-better':    { kind: 'capital',   annualOpex: 0.40, lag: 2, duration: 8, adminLoad: 3.0, federalMatch: 0.50, debtEligible: true,  reserveEligible: true, annualEffects: { development: 0.25 } },
    compensation:        { kind: 'emergency', annualOpex: 0.00, lag: 0, duration: 0, adminLoad: 1.0, federalMatch: 0.20, debtEligible: false, reserveEligible: true },
    'incident-command':  { kind: 'emergency', annualOpex: 0.25, lag: 0, duration: 2, adminLoad: 3.0, federalMatch: 0.25, debtEligible: false, reserveEligible: true, annualEffects: { development: 0.10 } },
    'offline-centres':   { kind: 'emergency', annualOpex: 0.20, lag: 0, duration: 1, adminLoad: 2.0, federalMatch: 0.10, debtEligible: false, reserveEligible: true, annualEffects: { support: 0.10 } },
    'open-briefing':     { kind: 'operating', annualOpex: 0.00, lag: 0, duration: 0, adminLoad: 1.0, federalMatch: 0.00, debtEligible: false, reserveEligible: false }
  };

  missions.forEach(mission => {
    mission.actions.forEach(action => {
      action.finance = Object.assign({
        kind: 'programme', annualOpex: 0, lag: 0, duration: 0, adminLoad: 1,
        adminMaintenance: 0.25, federalMatch: 0, debtEligible: false,
        reserveEligible: false, annualEffects: {}
      }, financeProfiles[action.id] || {});
      if (action.finance.adminMaintenance === 0.25) {
        action.finance.adminMaintenance = Math.max(0.15, Math.round(action.finance.adminLoad * 0.18 * 10) / 10);
      }
    });
  });

  quests[0].title = L('Сохранить фискальную подушку', 'Preserve the fiscal cushion');
  quests[0].description = L('Завершить кампанию с суммой казны и резерва не ниже 5 млрд ₽.', 'Finish with treasury plus reserve of at least 5 bn RUB.');
  quests[0].evaluate = state => Math.min(1, (((state.finance && state.finance.treasury) || state.stats.budget || 0) + ((state.finance && state.finance.reserve) || 0)) / 5);
  quests[0].complete = state => (((state.finance && state.finance.treasury) || state.stats.budget || 0) + ((state.finance && state.finance.reserve) || 0)) >= 5;
  quests.push({
    id: 'debt-discipline', icon: 'bank', title: L('Долговая дисциплина', 'Debt discipline'),
    description: L('Завершить кампанию, не использовав более 75% долгового лимита.', 'Finish without using more than 75% of the debt limit.'),
    evaluate: state => state.finance ? Math.min(1, Math.max(0, 1 - state.finance.debt / state.finance.debtLimit + 0.25)) : 0,
    complete: state => Boolean(state.finance && state.finance.debt <= state.finance.debtLimit * 0.75)
  });
  quests.push({
    id: 'delivery-capacity', icon: 'portfolio', title: L('Исполнимый портфель', 'Deliverable portfolio'),
    description: L('Не допустить критической перегрузки аппарата ни в одном решении.', 'Avoid critical administrative overload in every decision.'),
    evaluate: state => Math.max(0, 1 - ((state.finance && state.finance.overloadCount) || 0) / 3),
    complete: state => Boolean(state.finance && (state.finance.overloadCount || 0) === 0)
  });

  badges.push({
    id: 'smart-cofinance', icon: 'federal', title: L('Партнёр федерации', 'Federal partner'),
    description: L('Трижды использовать софинансирование, сохранив управляемость портфеля.', 'Use co-financing three times while keeping the portfolio deliverable.'),
    test: state => Boolean(state.finance && (state.finance.fundingCounts && state.finance.fundingCounts.cofinance >= 3) && (state.finance.overloadCount || 0) <= 1)
  });
  badges.push({
    id: 'reserve-keeper', icon: 'vault', title: L('Разумный резерв', 'Smart reserve'),
    description: L('Пережить кризис за счёт резерва и завершить кампанию с остатком не менее 1 млрд ₽.', 'Use the reserve during a crisis and finish with at least 1 bn RUB left.'),
    test: state => Boolean(state.completed && state.finance && state.finance.totalReserveDraw > 0 && state.finance.reserve >= 1)
  });

  root.GovernorGame = root.GovernorGame || {};
  root.GovernorGame.DATA = { L, ui, scenarios, districts, advisors, missions, quests, badges, financeProfiles };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.GovernorGame.DATA;
  }
})(typeof window !== 'undefined' ? window : globalThis);
