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
  G.V4MajorEvents = {POLICY, LEGACY_POLICY, cards, copy, has:id => ids.has(id), roadImpact};
})(globalThis);
