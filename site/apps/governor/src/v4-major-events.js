(function (root) {
  'use strict';
  const G = root.GovernorGame ||= {};
  const LEGACY_POLICY = 'governor-major-situations-v1';
  const POLICY = 'governor-major-situations-v2';
  const text = (ru, en, zh) => ({ru, en, zh});
  const situations = [
    {
      id:'LANDMARK-01', topic:'housing', districtId:'suburb', tag:'housing', kind:'stock',
      title:text('Падение метеорита', 'A meteorite falls', '陨石坠落'),
      situation:text(
        'Воздушная ударная волна повредила окна и крыши в Новом береге. Обломки упали за жилым кварталом. Въезд к пострадавшим домам перекрыт.',
        'An atmospheric shock wave damaged windows and roofs in New Bank. Fragments fell beyond the neighbourhood. The road into the affected area is closed.',
        '冲击波损坏了新岸区的窗户和屋顶。陨石碎片落在住宅区外，通往受灾住宅的道路已封闭。'
      ),
      notice:text(
        'Аварийное укрытие и обследование домов стоят 180 млн ₽. Базовые бригады восстановят 140 из 1 200 повреждённых квартир.',
        'Emergency shelter and inspections cost 180 million RUB. Existing crews can restore 140 of the 1,200 damaged homes.',
        '临时安置和房屋检查需支出1.8亿卢布。现有维修队能修复1,200套受损住宅中的140套。'
      ),
      units:text('дополнительно восстановленных квартир', 'additional homes restored', '套额外修复的住宅'),
      need:1200, baseline:140, emergency:180,
      responses:[
        {
          label:text('Восстановить квартал', 'Restore the neighbourhood', '修复受灾街区'),
          tradeoff:text(
            'Нанимаем подрядчиков для ремонта крыш и окон. Открываем перекрытую дорогу в этом году.',
            'Hire crews to fix roofs and windows. Reopen the road this year.',
            '聘请施工队修复屋顶和窗户，今年重新开放受阻道路。'
          ),
          beneficiaries:text('жильцы повреждённых домов и пассажиры района', 'residents of damaged homes and local passengers', '受损住宅居民和本区乘客'),
          setup:1120, units:950, support:560
        },
        {
          label:text('В первую очередь помочь самым пострадавшим', 'Help the worst affected first', '优先救助受灾最严重的家庭'),
          tradeoff:text(
            'Ремонтируем наиболее повреждённые квартиры. Движение на перекрытой дороге возобновится после следующего года.',
            'Repair the homes that sustained the most damage. The closed road reopens after next year.',
            '先修复受损最严重的住宅。封闭道路要到明年结束后才能恢复通行。'
          ),
          beneficiaries:text('семьи из наиболее повреждённых домов', 'families in the most badly damaged homes', '受损最严重住宅中的家庭'),
          setup:310, units:420, support:460
        }
      ],
      base:text(
        'Сохраняем аварийное укрытие и текущие ремонтные работы. Дорога останется перекрытой до конца следующего года.',
        'Keep emergency shelter and routine repairs in place. The road stays closed through next year.',
        '维持临时安置和常规维修。道路将封闭至明年年底。'
      )
    },
    {
      id:'LANDMARK-02', topic:'utility', districtId:'river', tag:'riverbank', kind:'flow',
      title:text('Прорыв дамбы', 'The dam gives way', '堤坝决口'),
      situation:text(
        'В Речной долине прорвало дамбу. Подъезд к нескольким населённым пунктам затоплен. Людей вывезли, теперь нужно восстановить сообщение.',
        'A dam breached in the River Valley. Floodwater cut off the approach to several settlements. Evacuation is complete; access still needs restoring.',
        '河谷地区发生堤坝决口，多个居民点的进出道路被淹。人员已撤离，接下来要恢复通行。'
      ),
      notice:text(
        'Эвакуация и аварийные работы стоят 420 млн ₽. До 280 млн ₽ возмещается после оплаты восстановительных работ. В плане нужно покрыть всю сумму расходов.',
        'Evacuation and emergency operations cost 420 million RUB. Up to 280 million can be reimbursed after restoration work is paid for. Budget for the full cost upfront.',
        '疏散和抢险需支出4.2亿卢布。修复工程付款后最高可报销2.8亿卢布。制定预算时须先留足全额款项。'
      ),
      units:text('домохозяйств с восстановленным подъездом', 'households with access restored', '户恢复通行的家庭'),
      need:1480, baseline:180, emergency:420, reimbursement:280,
      responses:[
        {
          label:text('Восстановить дамбу и подъезд', 'Rebuild the dam and access road', '修复堤坝和进出道路'),
          tradeoff:text(
            'Восстанавливаем основное сообщение. За обслуживание платим два года, включая этот.',
            'Restore the main approach. Fund maintenance for two years, including this year.',
            '恢复主要通道。支付含今年在内的两年维护费用。'
          ),
          beneficiaries:text('жители отрезанных посёлков и местные службы', 'cut-off communities and local services', '交通中断地区的居民和公共服务机构'),
          setup:1560, annual:110, years:2, units:1240, support:640
        },
        {
          label:text('Устроить временный объезд', 'Open a temporary detour', '开辟临时绕行路线'),
          tradeoff:text(
            'В этом году часть жителей снова сможет добраться домой. Дамбу этим решением не восстанавливаем.',
            'Restore access for some residents this year. The dam remains unrepaired.',
            '今年先让部分居民恢复通行。这项措施不包含堤坝修复。'
          ),
          beneficiaries:text('жители рядом с пригодными для объезда дорогами', 'residents near roads that can carry the detour', '临时绕行线路附近的居民'),
          setup:330, annual:45, units:640, support:510
        }
      ],
      base:text(
        'Оставляем эвакуацию и минимальный доступ для 180 домохозяйств. Временный объезд и ремонт дамбы не финансируем.',
        'Keep evacuation support and basic access for 180 households. Fund neither the detour nor the dam repairs.',
        '维持疏散支援及180户家庭的基本通行条件，暂不拨款修建绕行道路或修复堤坝。'
      )
    },
    {
      id:'LANDMARK-03', topic:'public', districtId:'capital', tag:'publicBuilding', kind:'flow',
      title:text('Визит Президента РФ', 'A visit from the President of Russia', '俄罗斯总统到访'),
      situation:text(
        'Президент РФ приезжает проверить национальные проекты. Жители хотят рассказать и об открытых объектах, и о том, что пока не работает.',
        'The President of Russia is visiting to review national projects. Residents want to talk about what has opened and what still falls short.',
        '俄罗斯总统到访检查国家项目。居民既想介绍已投入使用的设施，也想反映尚未解决的问题。'
      ),
      notice:text(
        'Организация обязательной программы стоит 70 млн ₽. По её итогам пресс-служба опубликует ответы на 160 обращений.',
        'The mandatory programme costs 70 million RUB. The press office will publish outcomes for 160 submissions.',
        '执行必需的访问安排需支出7,000万卢布。新闻部门将公开160件居民诉求的处理结果。'
      ),
      units:text('дополнительных обращений с опубликованным итогом', 'additional submissions with outcomes published', '件额外公开处理结果的居民诉求'),
      need:3200, baseline:160, emergency:70,
      responses:[
        {
          label:text('Открыть общественные приёмные в районах', 'Open public hearings in the districts', '在各区举办公开接待活动'),
          tradeoff:text(
            'Соберём обращения за пределами центра. Оплатим выездные приёмы и опубликуем результаты после визита.',
            'Hear from residents beyond the centre. Pay for mobile sessions and publish the outcomes after the visit.',
            '听取州府中心以外居民的诉求。为巡回接待拨款，并在访问结束后公开处理结果。'
          ),
          beneficiaries:text('жители центра и удалённых районов', 'residents in the centre and outlying districts', '州府中心和偏远地区的居民'),
          setup:620, units:2760, support:380
        },
        {
          label:text('Направить обращения в действующие приёмные', 'Use existing public reception offices', '通过现有接待办公室受理诉求'),
          tradeoff:text(
            'Перераспределим часы работы действующих команд. Бюджет не вырастет, но охват будет меньше.',
            'Reassign the hours of existing teams. Reach fewer people with no added spending.',
            '调整现有人员的工作时间，无需追加预算，但覆盖人数较少。'
          ),
          beneficiaries:text('жители, которым доступны действующие приёмные', 'residents who can get to existing reception offices', '能够前往现有接待办公室的居民'),
          setup:0, units:840, support:290
        }
      ],
      base:text(
        'Проводим обязательную инспекцию и оставляем обычный порядок работы с обращениями.',
        'Hold the mandatory inspection and keep the usual process for handling submissions.',
        '按要求开展检查，居民诉求仍通过常规程序处理。'
      )
    },
    {
      id:'LANDMARK-04', topic:'social', districtId:'capital', tag:'gym', kind:'flow',
      title:text('Заявка на зимнюю Олимпиаду', 'A bid to host the Winter Olympics', '申办冬季奥运会'),
      situation:text(
        'Область предложили включить в заявку на зимние Игры. Для этого нужно обновить спорткомплекс. Можно также вложить часть средств в занятия для местных жителей.',
        'The oblast has been invited to join a Winter Olympics bid. It would need to upgrade its sports complex. The region can also invest in facilities for local residents.',
        '本州受邀加入冬奥会申办计划。参与申办需要升级体育设施。也可以将部分资金用于改善居民体育服务。'
      ),
      notice:text(
        'Подача заявки не гарантирует проведение Игр. В расчёт входят только расходы области и посещения, которые обеспечит выбранная программа.',
        'Submitting a bid does not guarantee the Games. The calculation counts the region’s costs and visits provided by the chosen programme.',
        '提交申请不代表一定获得举办权。此处只计算本州支出以及所选方案能增加的到访人次。'
      ),
      units:text('дополнительных посещений объектов жителями за год', 'additional visits to the facilities by residents per year', '人次年度新增的居民场馆到访'),
      need:28000, baseline:0,
      responses:[
        {
          label:text('Подать заявку и обновить спорткомплекс', 'Bid and upgrade the sports complex', '提交申办并升级体育综合体'),
          tradeoff:text(
            'Готовим заявку и открываем обновлённые площадки для жителей. Область оплачивает работу комплекса два года, включая этот.',
            'Prepare the bid and open the upgraded venues to residents. The oblast covers two years of operating costs, including this year.',
            '准备申办材料，并将升级后的场馆向居民开放。本州承担含今年在内的两年运营费用。'
          ),
          beneficiaries:text('жители, спортивные секции и организаторы региональных соревнований', 'residents, local clubs and regional competition organisers', '居民、地方体育俱乐部和地区赛事组织方'),
          setup:2180, annual:170, years:2, units:24000, support:380
        },
        {
          label:text('Открыть больше часов для жителей', 'Open more hours to residents', '延长面向居民的开放时间'),
          tradeoff:text(
            'Ремонтируем три доступные площадки и продлеваем их работу на два года, включая этот. Область не участвует в заявке.',
            'Repair three existing venues and extend their opening hours for two years, including this year. The oblast sits out the bid.',
            '修缮三处现有场地，并在含今年在内的两年内延长开放时间。本州不参与申办。'
          ),
          beneficiaries:text('детские секции и семьи рядом со спортплощадками', 'youth clubs and families living near the venues', '青少年体育俱乐部和场馆附近居民家庭'),
          setup:465, annual:55, years:2, units:12600, support:335
        }
      ],
      base:text(
        'Сохраняем действующее расписание. Область не подаёт заявку и не расширяет занятия.',
        'Keep the current timetable. The oblast does not bid or expand sports programming.',
        '维持现有开放时间。本州不参与申办，也不扩大体育活动安排。'
      )
    },
    {
      id:'LANDMARK-05', topic:'economy', districtId:'industrial', tag:'factory', kind:'flow',
      title:text('Крупная IT-компания строит дата-центр', 'A major tech firm builds a data centre', '大型科技企业建设数据中心'),
      situation:text(
        'В Промышленном поясе начинается стройка. Компании нужны специалисты и надёжное подключение к сети. Колледжи готовы подключиться к подготовке кадров.',
        'Construction is starting in the Industrial Belt. The company needs staff and a reliable grid connection. Colleges are ready to help train the workforce.',
        '工业带的建设即将启动。企业需要专业人员和可靠的电力接入。职业院校愿意参与人才培训。'
      ),
      notice:text(
        'Компания оплачивает стройку. Действующие курсы подготовят 90 специалистов за год. Бюджет пока не рассчитывает на новые налоговые поступления.',
        'The company pays for construction. Existing courses train 90 people a year. The budget assumes no new tax revenue from the project.',
        '建设由企业出资。现有课程每年培训90人。预算暂未计入该项目的新增税收。'
      ),
      units:text('дополнительно подготовленных специалистов за год', 'additional people trained per year', '每年新增完成培训的人员'),
      need:600, baseline:90,
      responses:[
        {
          label:text('Усилить сеть и расширить подготовку кадров', 'Upgrade the grid and expand training', '升级电网并扩大培训规模'),
          tradeoff:text(
            'Модернизируем подстанцию и оснащаем учебные аудитории. Дополнительные курсы оплачиваем два года, включая этот.',
            'Upgrade the substation and equip classrooms. Fund two years of additional courses, including this one.',
            '升级变电站并配备教学设备。为新增课程提供含今年在内的两年经费。'
          ),
          beneficiaries:text('выпускники колледжей и работники местных предприятий', 'college graduates and local employees', '职业院校毕业生和当地企业员工'),
          setup:720, annual:120, years:2, units:410, support:365
        },
        {
          label:text('Открыть короткие курсы на действующей базе', 'Run short courses at existing facilities', '利用现有设施开设短期课程'),
          tradeoff:text(
            'Оплачиваем обучение одной группы в этом году. Дополнительные работы на сети остаются за компанией.',
            'Fund one cohort this year. Leave any extra grid work to the company.',
            '今年资助一批学员参加培训。额外的电网工程由企业负责。'
          ),
          beneficiaries:text('выпускники, готовые начать стажировку в этом году', 'graduates ready to start a placement this year', '今年即可开始实习的毕业生'),
          setup:235, units:180, support:285
        }
      ],
      base:text(
        'Сохраняем обычный набор на курсы. Компания сама организует подключение и наём.',
        'Keep regular enrolment. The company handles its grid connection and hiring.',
        '维持现有课程招生。企业自行安排电力接入和招聘。'
      )
    },
    {
      id:'LANDMARK-06', topic:'transport', districtId:'suburb', tag:'transit', kind:'flow',
      title:text('Проект скоростного общественного транспорта', 'A rapid public transport project', '快速公共交通项目'),
      situation:text(
        'Пассажиры Нового берега подолгу добираются до областного центра. Перевозчик предлагает пустить скоростные электробусы по выделенным полосам.',
        'New Bank passengers face long journeys to the regional capital. The operator proposes rapid electric buses with dedicated lanes.',
        '新岸区乘客前往州府耗时较长。运营方建议开通使用专用车道的快速电动公交。'
      ),
      notice:text(
        'Часть спроса покрывают обычные рейсы. Показатель отражает дополнительные поездки. Время в пути зависит от загрузки дорог.',
        'Regular services already cover some demand. The indicator measures additional trips. Journey times depend on traffic.',
        '常规班次已满足部分需求。指标按新增乘车人次计算。出行时间取决于路况。'
      ),
      units:text('дополнительных поездок на скоростных рейсах за год', 'additional trips on rapid buses per year', '每年新增快速公交乘车人次'),
      need:185000, baseline:24000,
      responses:[
        {
          label:text('Открыть скоростной коридор', 'Open a rapid bus corridor', '开通快速公交走廊'),
          tradeoff:text(
            'Выделяем полосы на загруженных участках и обновляем остановки. Дополнительные рейсы оплачиваем два года, включая этот.',
            'Reserve lanes on busy sections and upgrade stops. Fund two years of additional services, including this one.',
            '在拥堵路段设置专用车道并升级站点。为新增班次提供含今年在内的两年经费。'
          ),
          beneficiaries:text('пассажиры между Новым берегом и областным центром', 'passengers between New Bank and the regional capital', '往返新岸区和州府的乘客'),
          setup:1240, annual:180, years:2, units:126000, support:450
        },
        {
          label:text('Испытать один скоростной маршрут', 'Pilot one rapid bus route', '试运行一条快速公交线路'),
          tradeoff:text(
            'В этом году запускаем несколько рейсов на существующей дороге. Остальные маршруты сохраняют прежнее расписание.',
            'Run a limited service on the existing road this year. Other routes keep their current timetables.',
            '今年利用现有道路开行有限班次。其他线路仍按原时刻表运行。'
          ),
          beneficiaries:text('пассажиры пилотного маршрута', 'passengers on the pilot route', '试运行线路的乘客'),
          setup:350, annual:90, units:62000, support:325
        }
      ],
      base:text(
        'Сохраняем обычное расписание и обслуживание остановок. Скоростные рейсы пока не добавляем.',
        'Keep the regular timetable and stop maintenance. No extra rapid services start this year.',
        '维持常规时刻表和站点维护。今年不增加快速班次。'
      )
    },
    {
      id:'LANDMARK-07', topic:'health', districtId:'capital', tag:'clinic', kind:'flow',
      title:text('Угроза эпидемии', 'An outbreak threat', '疫情风险'),
      situation:text(
        'Поликлиники областного центра сообщают о росте обращений с симптомами инфекции. Врачи просят дополнительные часы приёма, чтобы сохранить доступ к плановой помощи.',
        'Clinics in the regional capital report more patients with signs of infection. They ask for extra hours to keep routine care available.',
        '州府多家门诊报告，出现感染症状的就诊者增多。医生申请增设接诊时段，以保证常规医疗服务。'
      ),
      notice:text(
        'Обязательное наблюдение и оповещение стоят 120 млн ₽. Измеряем, сколько дополнительных консультаций смогут провести врачи.',
        'Mandatory monitoring and notices cost 120 million RUB. The indicator measures how many additional consultations clinics can provide.',
        '必需的监测和通知支出为1.2亿卢布。指标衡量门诊可额外提供的咨询人次。'
      ),
      units:text('дополнительных консультаций за год', 'additional consultations per year', '每年新增咨询人次'),
      need:22000, baseline:2700, emergency:120,
      responses:[
        {
          label:text('Открыть отдельные смены в сети поликлиник', 'Open dedicated shifts across the clinic network', '在门诊网络增设专门接诊班次'),
          tradeoff:text(
            'Нанимаем временный персонал и открываем отдельные часы приёма в этом году. Плановые консультации остаются в расписании.',
            'Hire temporary staff and add separate appointment hours this year. Routine appointments remain on the timetable.',
            '今年聘用临时人员并增设独立接诊时段。常规预约仍按原时刻表安排。'
          ),
          beneficiaries:text('пациенты с симптомами и люди, которым нужна плановая помощь', 'people with symptoms and patients needing routine care', '出现症状的居民和需要常规医疗服务的患者'),
          setup:540, units:14000, support:520
        },
        {
          label:text('Продлить приём в самых загруженных поликлиниках', 'Extend hours at the busiest clinics', '延长就诊量最大的门诊服务时间'),
          tradeoff:text(
            'Оплачиваем дополнительные смены в нескольких учреждениях. Остальные поликлиники сохраняют прежний график.',
            'Fund extra shifts in a few clinics. Other facilities keep their usual hours.',
            '为少数门诊增加班次拨款。其他门诊维持原有开放时间。'
          ),
          beneficiaries:text('жители в зоне обслуживания самых загруженных поликлиник', 'residents served by the busiest clinics', '就诊量最大的门诊服务范围内的居民'),
          setup:250, units:6500, support:390
        }
      ],
      base:text(
        'Продолжаем обязательное наблюдение и оповещение. Поликлиники работают по обычному графику.',
        'Continue mandatory monitoring and notices. Clinics keep their usual appointment hours.',
        '继续开展必需的监测和通知工作。门诊仍按原时段接诊。'
      )
    },
    {
      id:'LANDMARK-08', topic:'ecology', districtId:'north', tag:'forest', kind:'flow',
      title:text('Лесные пожары', 'Wildfires', '森林火灾'),
      situation:text(
        'Из-за засухи в Северных районах загорелись леса. Спасатели защищают ближайшие посёлки и просят подкрепление.',
        'Drought has sparked forest fires in the Northern Districts. Emergency teams are protecting the nearest villages and asking for reinforcements.',
        '干旱导致北部地区发生森林火灾。救援队正在保护附近村镇，并请求增援。'
      ),
      notice:text(
        'Действующие бригады и оповещение стоят 210 млн ₽. Результат измеряем площадью, которую охватывает патрулирование.',
        'Existing crews and public alerts cost 210 million RUB. The result measures how much land receives patrol coverage.',
        '现有救援队和居民预警支出为2.1亿卢布。成效按纳入巡护的林地面积计算。'
      ),
      units:text('дополнительных гектаров под патрулированием за сезон', 'additional hectares patrolled per season', '每个火险季新增巡护面积（公顷）'),
      need:8000, baseline:1200, emergency:210,
      responses:[
        {
          label:text('Усилить тушение и лесные патрули', 'Reinforce firefighting and forest patrols', '加强灭火和森林巡护'),
          tradeoff:text(
            'Оплачиваем подкрепление в этом году. Расширенные патрули сохраняем на два сезона, включая нынешний.',
            'Fund reinforcements this year. Keep expanded patrols for two seasons, including the current one.',
            '今年为增援拨款。扩大后的巡护范围维持两个火险季，包括当前火险季。'
          ),
          beneficiaries:text('жители северных посёлков и лесные службы', 'northern communities and forestry services', '北部村镇居民和林业部门'),
          setup:810, annual:140, years:2, units:5700, support:535
        },
        {
          label:text('Сосредоточить подкрепление у посёлков', 'Concentrate reinforcements near villages', '将增援力量集中在村镇周边'),
          tradeoff:text(
            'Добавляем бригады у жилых зон на этот сезон. Дальние лесные участки остаются под обычным наблюдением.',
            'Add crews near populated areas for this season. Remote forests keep their existing monitoring.',
            '本火险季在居民区附近增派人员。偏远林地仍按常规方式监测。'
          ),
          beneficiaries:text('жители посёлков рядом с очагами возгорания', 'residents of villages closest to the fires', '火点附近村镇的居民'),
          setup:395, units:2600, support:445
        }
      ],
      base:text(
        'Сохраняем оповещение и работу действующих бригад. Зону патрулирования не расширяем.',
        'Keep public alerts and the current crews. Patrols stay within their existing area.',
        '维持居民预警和现有救援队工作。巡护范围保持不变。'
      )
    },
    {
      id:'LANDMARK-09', topic:'public', districtId:'river', tag:'club', kind:'flow',
      title:text('Местный референдум о присоединении соседнего района', 'A local referendum on joining a neighbouring district', '关于相邻区合并的地方公投'),
      situation:text(
        'В Речной долине обсуждают объединение с соседним муниципальным районом. Жители хотят знать, как изменятся услуги в посёлках, если предложение поддержат.',
        'The River Valley is considering a merger with a neighbouring municipal district. Residents want to know how village services might change if the proposal passes.',
        '河谷地区正在讨论与相邻市辖区合并。居民想知道，如果提案通过，各村镇的公共服务将发生什么变化。'
      ),
      notice:text(
        'Голосование и обязательные объявления стоят 45 млн ₽. Область может улучшить доступ к информации. Итог определяют избиратели.',
        'Running the vote and issuing required notices costs 45 million RUB. The oblast can improve access to information. Voters decide the result.',
        '组织投票和发布必需公告需支出4,500万卢布。本州可改善信息获取条件，由选民决定投票结果。'
      ),
      units:text('дополнительных жителей, получивших разъяснения', 'additional residents given information', '额外获得说明的居民人数'),
      need:17000, baseline:2300, emergency:45,
      responses:[
        {
          label:text('Провести выездные обсуждения в посёлках', 'Hold public discussions in the villages', '在各村镇举办公开讨论'),
          tradeoff:text(
            'Публикуем расчёты по услугам, проводим встречи и развозим материалы. Равным образом объясняем последствия обоих вариантов.',
            'Publish service estimates, hold meetings and deliver materials. Explain the consequences of both voting options on equal terms.',
            '公布服务测算，举办会议并分发资料。平等介绍两种投票选择可能带来的结果。'
          ),
          beneficiaries:text('жители обоих районов, включая удалённые посёлки', 'residents of both districts, including outlying villages', '两区居民，包括偏远村镇居民'),
          setup:310, units:12000, support:420
        },
        {
          label:text('Открыть справочную службу для жителей', 'Set up a public information line', '开设居民咨询热线'),
          tradeoff:text(
            'Запускаем телефонную линию и публикуем ответы на частые вопросы. Выездных обсуждений не будет.',
            'Open a telephone line and publish answers to common questions. There will be no travelling sessions.',
            '开通咨询电话并公布常见问题答复。不举办巡回讨论。'
          ),
          beneficiaries:text('жители, которым доступны телефон или интернет', 'residents with telephone or internet access', '可以使用电话或互联网的居民'),
          setup:105, units:6200, support:310
        }
      ],
      base:text(
        'Проводим голосование и размещаем обязательные объявления. Дополнительных встреч или консультаций не будет.',
        'Hold the vote and post the required notices. There are no additional meetings or consultations.',
        '组织投票并发布必需公告。不增设会议或咨询服务。'
      )
    }
  ];

  function effects(kind, {setup=0, annual=0, years=1, units=0, support=0} = {}) {
    return {
      treasury:{oneOffMlnRub:setup, operatingMlnRubPerYear:annual, firstOperatingYearOffset:0, fundedYears:years, bookWhen:'yearClosed'},
      localOutcome:{units, quantityMode:kind, firstYearOffset:0, fundedYears:years, effectAt:'afterExecution'},
      support:{rule:units ? 'deliveredServiceOnly' : 'noDirectEffect', scope:'district', maxBasisPoints:support}
    };
  }

  const cards = situations.map(row => ({
    id:row.id, locale:'ru', title:row.title.ru, situation:row.situation.ru, topic:row.topic, districtId:row.districtId,
    applicability:{requiresTerritory:row.districtId, requiresBaselineTag:row.tag},
    localIndicator:{id:'case.'+row.id.toLowerCase()+'.extraCovered', kind:row.kind, potential:row.need, unitLabel:row.units.ru, baselineExtra:0},
    circumstance:{
      kind:row.emergency ? 'priceShock' : 'caseDemand', appliesAt:'yearOpened', summary:row.notice.ru,
      effects:{baselineUnits:row.baseline, ...(row.emergency ? {unavoidableExpenseMlnRub:row.emergency} : {}),
        ...(row.reimbursement ? {matchedReceiptCapMlnRub:row.reimbursement} : {})}
    },
    options:[
      ...row.responses.map((option,index) => ({
        id:['a','b'][index], label:option.label.ru, tradeoff:option.tradeoff.ru, beneficiaries:option.beneficiaries.ru,
        instrument:option.setup ? 'оказание услуги или вложение' : 'организация действующих ресурсов',
        effects:effects(row.kind,option)
      })),
      {id:'base', label:'Сохранить базовый план', tradeoff:row.base.ru, beneficiaries:'получатели действующего обслуживания',
        instrument:'базовый порядок', effects:effects(row.kind,{years:0})}
    ]
  }));
  const legacyCards = cards.slice(0, 4);
  function translated(row,locale) {
    const [a,b] = row.responses.map(option => ({
      label:option.label[locale], tradeoff:option.tradeoff[locale], beneficiaries:option.beneficiaries[locale]
    }));
    return {title:row.title[locale], situation:row.situation[locale], unitLabel:row.units[locale],
      circumstance:row.notice[locale], a, b, base:{tradeoff:row.base[locale]}};
  }
  const copy = Object.fromEntries(situations.map(row => [row.id,{en:translated(row,'en'),zh:translated(row,'zh')}]));
  const ids = new Set(situations.map(row => row.id));
  function roadImpact(event, choice, year = event?.year) {
    if (event?.eventId !== 'LANDMARK-01' || !Number.isInteger(year) || year < event.year || year > event.year+1) return null;
    return {id:'w-c', throughYear:event.year+1, open:choice==='a'};
  }
  G.V4MajorEvents = {POLICY, LEGACY_POLICY, cards, legacyCards, copy, has:id => ids.has(id), roadImpact};
})(globalThis);
