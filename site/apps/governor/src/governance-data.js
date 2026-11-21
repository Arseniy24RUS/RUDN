(function(root){
 'use strict';
 const D=root.GovernorGame?.DATA?.consolidationReady?root.GovernorGame.DATA:(typeof require==='function'?require('./consolidation-data.js'):null);
 if(!D)throw Error('Stage 4 content is required');
 const CONFIG={
  "version": "5.0",
  "actors": [
    {
      "id": "municipality",
      "icon": "town",
      "image": "assets/advisors/anna-berezina.png",
      "name": {
        "ru": "Анна Березина",
        "en": "Anna Berezina"
      },
      "role": {
        "ru": "Муниципальная команда",
        "en": "Municipal team"
      },
      "remit": {
        "ru": "Готовит местное исполнение и проект соглашения. Не утверждает областной бюджет.",
        "en": "Prepares local delivery and a draft agreement. Does not approve the regional budget."
      }
    },
    {
      "id": "finance",
      "icon": "vault",
      "image": "assets/advisors/viktor.png",
      "name": {
        "ru": "Виктор Соколов",
        "en": "Viktor Sokolov"
      },
      "role": {
        "ru": "Финансовый блок",
        "en": "Finance team"
      },
      "remit": {
        "ru": "Проверяет источник средств и будущие обязательства. Условия трансферта нельзя заменить устной договорённостью.",
        "en": "Checks funding and future obligations. Verbal agreement cannot replace grant conditions."
      }
    },
    {
      "id": "residents",
      "icon": "people",
      "image": "assets/advisors/denis-kovalev.png",
      "name": {
        "ru": "Денис Ковалёв",
        "en": "Denis Kovalev"
      },
      "role": {
        "ru": "Представитель жителей",
        "en": "Residents’ representative"
      },
      "remit": {
        "ru": "Представляет обращения жителей. Его согласие не заменяет бюджетные и закупочные процедуры.",
        "en": "Represents residents’ concerns. His support does not replace budget or procurement procedures."
      }
    }
  ],
  "terms": [
    {
      "id": "delivery-team",
      "actor": "municipality",
      "title": {
        "ru": "Совместная команда исполнения",
        "en": "Joint delivery team"
      },
      "line": {
        "ru": "Оплатить координацию и назвать проверяемую дату запуска с годовым запасом.",
        "en": "Pay for coordination and commit to a verifiable opening date with a one-year buffer."
      },
      "cost": 0.18,
      "opex": 0,
      "lag": 0,
      "admin": 0.15,
      "risk": -0.035,
      "match": 0,
      "positions": {
        "municipality": 3,
        "finance": -1,
        "residents": 1
      },
      "promise": "launch",
      "buffer": 1
    },
    {
      "id": "firm-date",
      "actor": "municipality",
      "title": {
        "ru": "Обещать точный срок",
        "en": "Promise a firm opening date"
      },
      "line": {
        "ru": "Без дополнительных затрат. Публичный срок не сдвигается автоматически при задержке проекта.",
        "en": "No extra cost. The public deadline does not move automatically if the project is delayed."
      },
      "cost": 0,
      "opex": 0,
      "lag": 0,
      "admin": 0,
      "risk": 0,
      "match": 0,
      "positions": {
        "municipality": 3,
        "residents": 2
      },
      "promise": "launch",
      "buffer": 0
    },
    {
      "id": "milestones",
      "actor": "finance",
      "title": {
        "ru": "Софинансирование под отчёт",
        "en": "Grant with a reporting condition"
      },
      "line": {
        "ru": "Дополнительные целевые средства требуют публикации отчёта в течение двух следующих лет. Неотчитанный дополнительный транш возвращается.",
        "en": "Extra earmarked funding requires a report within two years. The additional tranche is repaid if not reported."
      },
      "cost": 0.12,
      "opex": 0,
      "lag": 0,
      "admin": 0.35,
      "risk": -0.025,
      "match": 0.08,
      "positions": {
        "finance": 3,
        "municipality": -1,
        "residents": 1
      },
      "promise": "report",
      "requires": "cofinance"
    },
    {
      "id": "reserve-floor",
      "actor": "finance",
      "title": {
        "ru": "Сохранить страховой запас",
        "en": "Keep a reserve cushion"
      },
      "line": {
        "ru": "Сохранить минимальный резерв на конец текущего и двух следующих лет. Экстренный расход возможен, но может нарушить обещание.",
        "en": "Keep a minimum reserve at the close of this year and the next two years. Emergency spending remains possible but may break the promise."
      },
      "cost": 0,
      "opex": 0,
      "lag": 0,
      "admin": 0,
      "risk": 0,
      "match": 0,
      "positions": {
        "finance": 3,
        "municipality": -1
      },
      "promise": "reserve"
    },
    {
      "id": "public-report",
      "actor": "residents",
      "title": {
        "ru": "Открытый контроль жителей",
        "en": "Public scrutiny"
      },
      "line": {
        "ru": "Подготовить доступный отчёт о фактическом исполнении. Публикация – ваше отдельное действие, не автоматический бонус.",
        "en": "Prepare an accessible delivery report. Publication is a separate player action, not an automatic bonus."
      },
      "cost": 0.16,
      "opex": 0,
      "lag": 0,
      "admin": 0.2,
      "risk": -0.025,
      "match": 0,
      "positions": {
        "residents": 3,
        "municipality": 1
      },
      "promise": "report"
    },
    {
      "id": "service-guarantee",
      "actor": "residents",
      "title": {
        "ru": "Три года без закрытия",
        "en": "Three years without closure"
      },
      "line": {
        "ru": "Добавить сопровождение услуги и обязаться оплатить три последовательных года её работы. Короткую программу придётся продлить.",
        "en": "Add service support and commit to funding three consecutive operating years. A short programme will need renewal."
      },
      "cost": 0.1,
      "opex": 0.1,
      "lag": 0,
      "admin": 0.15,
      "risk": -0.015,
      "match": 0,
      "positions": {
        "residents": 3,
        "finance": -1,
        "municipality": 1
      },
      "promise": "continuity"
    }
  ],
  "scenes": [
    {
      "missionId": "rural-healthcare",
      "title": {
        "ru": "Сначала договоримся о помощи",
        "en": "Agree on care first"
      },
      "setting": {
        "ru": "Первая встреча с северными поселениями",
        "en": "First meeting with the northern settlements"
      },
      "image": "assets/scenes/negotiation-room.webp",
      "lead": {
        "ru": "Деньги ещё не выделены. Север просит назвать не красивый объект, а дату, когда помощь действительно станет доступной.",
        "en": "No money has been allocated yet. The north wants a date when care becomes accessible, not just an impressive building."
      },
      "positions": {
        "clinics": [
          0,
          0,
          1
        ],
        "mobile-units": [
          1,
          1,
          0
        ],
        "train-staff": [
          -1,
          1,
          0
        ]
      },
      "speeches": [
        {
          "ru": "Три клиники – это ещё и земля, подъезд, жильё для врачей. Кто сведёт работу в один план?",
          "en": "Three clinics also need sites, roads and housing for doctors. Who will coordinate delivery?"
        },
        {
          "ru": "Смета – только начало. Если после стройки не останется денег на работу, проект не решит проблему.",
          "en": "The estimate is only the start. Without operating funds after construction, the project cannot solve the problem."
        },
        {
          "ru": "Моя мать ездит к врачу через два посёлка. Мне нужен понятный срок и помощь, которая не исчезнет через год.",
          "en": "My mother travels through two villages to see a doctor. We need a clear deadline and care that will not disappear next year."
        }
      ],
      "questions": [
        {
          "ru": "Нужен один ответственный за ввод, а не новая комиссия без срока. Совместная команда уменьшит риск задержки.",
          "en": "We need one person responsible for opening, not another committee without a deadline. A joint team reduces delay risk."
        },
        {
          "ru": "Дополнительный транш возможен только при выбранном софинансировании и проверяемом отчёте. Иначе нужно сохранить резерв.",
          "en": "An additional tranche requires cofinancing and a verifiable report. Otherwise, keep a reserve."
        },
        {
          "ru": "Не обещайте улучшить всё сразу. Назовите срок запуска или гарантируйте, что работающая услуга не закроется.",
          "en": "Do not promise to improve everything at once. Name an opening date or guarantee continuity of the service."
        }
      ]
    },
    {
      "missionId": "school-neighbourhood",
      "title": {
        "ru": "Школа для Нового берега",
        "en": "A school for New Bank"
      },
      "setting": {
        "ru": "Встреча в переполненной школе",
        "en": "Meeting at an overcrowded school"
      },
      "lead": {
        "ru": "Родители хотят решение к учебному году. Муниципалитет опасается остаться один на один с расходами на него.",
        "en": "Parents want a solution for the school year. The municipality fears being left to pay for it alone."
      },
      "positions": {
        "school-campus": [
          1,
          -1,
          1
        ],
        "school-bus": [
          1,
          1,
          0
        ],
        "second-shift": [
          0,
          2,
          -2
        ]
      },
      "speeches": [
        {
          "ru": "Школа, маршрут или вторая смена – исполнять всё равно нам. Нужны ответственный и понятный срок.",
          "en": "Whether it is a school, a bus or a second shift, we have to deliver it. We need an owner and a deadline."
        },
        {
          "ru": "Стройку можно софинансировать. Зарплаты, обслуживание и топливо придётся оплачивать и потом.",
          "en": "Construction can be cofinanced. Salaries, maintenance and fuel still need future funding."
        },
        {
          "ru": "Вторая смена меняет расписание всей семьи. Если решение временное, скажите честно, сколько оно будет работать.",
          "en": "A second shift changes the whole family’s day. If this is temporary, tell us honestly how long it will last."
        }
      ],
      "questions": [
        {
          "ru": "Для маршрута важно продление: без него четыре года пройдут, а автобус пропадёт. Дата открытия не заменяет содержание.",
          "en": "A bus route needs renewal: otherwise four years will pass and it will disappear. An opening date is not operating funding."
        },
        {
          "ru": "Отчёт относится к фактически оплаченным работам и срокам. Красивое обещание не является основанием для дополнительного транша.",
          "en": "Reporting concerns actual spending and dates. An attractive promise alone is not grounds for an extra tranche."
        },
        {
          "ru": "Готов обсудить временный вариант, если смогу проверить отчёт и дальнейшие обязательства.",
          "en": "I can discuss a temporary solution if I can inspect the report and future commitments."
        }
      ]
    },
    {
      "missionId": "river-land-use",
      "title": {
        "ru": "Кому принадлежит безопасный берег?",
        "en": "Who gets a safer riverbank?"
      },
      "setting": {
        "ru": "Согласование плана речной долины",
        "en": "Agreeing on the river-valley plan"
      },
      "lead": {
        "ru": "Защита долины затрагивает участки, дороги и привычные места. Здесь недостаточно просто оплатить проект.",
        "en": "Protecting the valley affects land, roads and familiar places. Paying for the project is not enough."
      },
      "positions": {
        "nature-buffer": [
          0,
          1,
          0
        ],
        "logistics-embankment": [
          2,
          -1,
          -1
        ],
        "zoning-moratorium": [
          -1,
          2,
          0
        ]
      },
      "speeches": [
        {
          "ru": "Нельзя перенести местные функции одним распоряжением. Нужны соглашение, исполнители и план по территории.",
          "en": "Local responsibilities cannot be moved by a single order. We need an agreement, people and a local plan."
        },
        {
          "ru": "Дамба требует содержания. Природный буфер – контроля территории. У дешёвого решения тоже есть обязательства.",
          "en": "A levee needs maintenance; a natural buffer needs land management. Even a cheap option creates obligations."
        },
        {
          "ru": "На карте это площадка. Для нас это дома и дорога на работу. Кто покажет, что будет сделано на самом деле?",
          "en": "On a map it is a site. For us it is our homes and the road to work. Who will show what actually gets done?"
        }
      ],
      "questions": [
        {
          "ru": "Выбранное размещение уже изменяет смету и срок. Команда согласования помогает исполнению, но не заменяет законную процедуру.",
          "en": "The selected location already changes cost and timing. Coordination helps delivery but does not replace lawful procedures."
        },
        {
          "ru": "Не тратьте весь запас до паводка. Обещание сохранить резерв станет реальным ограничением во время следующего кризиса.",
          "en": "Do not spend the entire reserve before a flood. A reserve promise will matter during the next crisis."
        },
        {
          "ru": "Проверяемый публичный отчёт важнее очередного заверения, что учтены все интересы.",
          "en": "A verifiable public report matters more than another assurance that everyone’s interests were considered."
        }
      ]
    },
    {
      "missionId": "digital-procurement",
      "title": {
        "ru": "Кому доверить цифровой регион?",
        "en": "Who will run the digital region?"
      },
      "setting": {
        "ru": "Обсуждение будущего контракта",
        "en": "Discussing a future contract"
      },
      "lead": {
        "ru": "Быстрый запуск, открытость и возможность сменить поставщика не всегда совпадают в одном предложении.",
        "en": "Fast delivery, openness and the ability to change suppliers do not always come together."
      },
      "positions": {
        "modular-platform": [
          0,
          0,
          1
        ],
        "single-vendor-contract": [
          2,
          1,
          -2
        ],
        "civic-tech-lab": [
          0,
          1,
          1
        ]
      },
      "speeches": [
        {
          "ru": "Сотрудникам придётся работать с системой каждый день. Назовите того, кто отвечает за внедрение и обучение.",
          "en": "Staff will use this system every day. Name who is responsible for rollout and training."
        },
        {
          "ru": "Льготная цена запуска ничего не говорит о содержании. Сравним весь срок работы, а не первый платёж.",
          "en": "A cheap launch says little about maintenance. Compare the service lifetime, not just the first payment."
        },
        {
          "ru": "Госуслуги должны работать и после презентации. А обещанный отчёт должен содержать факты, а не рекламный ролик.",
          "en": "Public services must keep working after the presentation. The report must contain facts, not a promotional video."
        }
      ],
      "questions": [
        {
          "ru": "Для нас важна ответственность за внедрение. Согласование не даёт права выбирать поставщика в обход закупочных правил.",
          "en": "We need clear rollout responsibility. Agreement does not authorise bypassing procurement rules."
        },
        {
          "ru": "Дополнительные средства – условие игрового контракта, не подарок за согласие. Не будет отчёта – вернём дополнительный транш.",
          "en": "Extra funding is a game-contract condition, not a reward for agreement. Without the report, the extra tranche is repaid."
        },
        {
          "ru": "Быстрое решение можно принять с разногласиями. Тогда они останутся в протоколе и вернутся на публичном разборе.",
          "en": "A quick decision can proceed with dissent. The objections remain in the minutes and return at the public review."
        }
      ]
    },
    {
      "missionId": "river-legacy",
      "title": {
        "ru": "Вернуться на прежнее место?",
        "en": "Return to the same place?"
      },
      "setting": {
        "ru": "Встреча после большого паводка",
        "en": "Meeting after the major flood"
      },
      "lead": {
        "ru": "Люди хотят вернуться домой. Безопасное переселение дольше; быстрое восстановление может вернуть и прежний риск.",
        "en": "People want to go home. Safer relocation takes longer; fast reconstruction can bring back the old risk."
      },
      "positions": {
        "resilient-relocation": [
          0,
          0,
          -1
        ],
        "build-back-fast": [
          2,
          0,
          0
        ],
        "climate-insurance-pool": [
          -1,
          2,
          0
        ]
      },
      "speeches": [
        {
          "ru": "Часть прежних решений уже проверил паводок. Не начинайте новую стройку без ответственных за ввод.",
          "en": "The flood has already tested earlier decisions. Do not start new construction without delivery owners."
        },
        {
          "ru": "Срок подходит к концу, а расходы останутся преемнику. Обязательства за пределами кампании тоже будут видны.",
          "en": "The term is ending, but the successor inherits the costs. Commitments beyond this campaign will still be visible."
        },
        {
          "ru": "После прежних обещаний я сначала посмотрю протокол: что выполнено, что перенесено и что так и осталось на бумаге.",
          "en": "After earlier promises, I will first read the record: what was kept, renegotiated or left on paper."
        }
      ],
      "questions": [
        {
          "ru": "Если объект откроется после конца срока, это незавершённое обязательство, а не провал и не уже полученная победа.",
          "en": "An opening after the end of the term is an outstanding commitment, not a failure and not an achieved success."
        },
        {
          "ru": "Не включайте будущую работу в уже достигнутый результат. Её должен видеть следующий бюджет.",
          "en": "Do not count future work as an achieved result. The next budget must show it."
        },
        {
          "ru": "Признание задержки не отменяет потерянного времени. Новый срок можно согласовать заранее, но первоначальный останется в истории.",
          "en": "Acknowledging a delay does not erase lost time. A revised deadline can be agreed beforehand, but the original remains in the history."
        }
      ]
    }
  ]
};
 // Delivery conversations follow the chosen measure. These are display-only
 // variants: actor positions, terms and saved agreement IDs remain unchanged.
 const say=(ru,en,zh)=>({ru,en,zh});
 const actionDialogue={
  'rural-healthcare':{
   clinics:{speeches:[
    say('Для трёх клиник нужны площадки, подъезды и специалисты. Кто сведёт подготовку и открытие в один план?','Three clinics need sites, access roads and staff. Who will coordinate preparation and opening?','三所诊所需要场地、通道和医务人员。谁来统筹筹备与启用？'),
    say('После строительства клиникам понадобятся ежегодные средства на работу. Проверим, что останется на содержание.','After construction, the clinics need annual operating funds. Let us check what remains for operation.','诊所建成后每年仍需运营经费。我们要核实后续资金是否充足。'),
    say('Новые клиники помогут только после открытия. Мне нужен понятный срок и помощь, которая не исчезнет через год.','New clinics help only after opening. We need a clear date and care that will not disappear a year later.','新诊所启用后才能提供帮助。我们需要明确日期，也需要不会一年后就中断的服务。')
   ],questions:{0:say('Назовём ответственного за подготовку и открытие клиник. Совместная команда уменьшает риск задержки, но не гарантирует срок.','Name who owns clinic preparation and opening. A joint team reduces delay risk but cannot guarantee the date.','请明确诊所筹备和启用的负责人。联合团队可以降低延期风险，但不能保证日期。')}},
   'mobile-units':{speeches:[
    say('Мобильным бригадам нужны маршруты, расписание и специалисты. Кто отвечает за регулярные выезды в поселения?','Mobile teams need routes, schedules and staff. Who is responsible for regular visits to the settlements?','流动医疗队需要路线、时间表和医务人员。谁负责定期前往各居民点？'),
    say('Медбригады требуют ежегодных расходов на работу и поездки. После окончания программы понадобится решение о продлении.','Medical teams need annual operating and travel funds. Continuing beyond the programme requires a renewal decision.','医疗队每年都需要运营和出行经费。项目到期后，继续服务需要作出续期决定。'),
    say('Для моей семьи важны регулярные приезды бригады. Когда начнутся выезды и как долго мы сможем на них рассчитывать?','My family needs regular team visits. When will they start, and how long can we rely on them?','我们家需要医疗队定期来访。什么时候开始，我们可以依靠这项服务多久？')
   ],questions:{0:say('Согласуем начало выездов и ответственного за расписание. Дата запуска не заменяет ежегодное финансирование бригад.','Agree on the first visits and who owns the schedule. A launch date does not replace annual team funding.','请确定首次出诊日期和排班负责人。启动日期不能代替医疗队每年的经费安排。')}},
   'train-staff':{speeches:[
    say('Вы выбрали подготовку местных медицинских кадров. Кто организует обучение и поможет специалистам начать работу в поселениях?','You chose local medical training. Who will organise it and help trained staff begin work in the settlements?','您选择培养本地医务人员。谁负责组织培训，并帮助受训人员到各居民点开展工作？'),
    say('Здесь оплачивается кадровая программа. Проверим её ежегодные расходы и срок финансирования, прежде чем обещать результат.','This funds a staffing programme. Check its annual costs and funding period before promising results.','这项支出用于人才培养项目。在承诺成果之前，要核实年度费用和资助期限。'),
    say('Нам нужны специалисты, к которым можно попасть на приём. Когда подготовка кадров начнёт менять доступность помощи?','We need staff we can actually see for care. When will training begin to improve access?','我们需要真正能够接诊的医务人员。人才培养何时开始改善就医可及性？')
   ],questions:{0:say('Назовём ответственного за запуск кадровой программы. Её результат проверим по работе подготовленных специалистов и доступности помощи.','Name who owns the staffing programme launch. Check results through trained staff working and access to care.','请明确人才项目启动的负责人。应通过受训人员实际工作和就医可及性来检验成效。')}}
  },
  'school-neighbourhood':{
   'school-campus':{speeches:[
    say('Для новой школы нужно согласовать строительство и набор учителей. Кто отвечает за подготовку к открытию?','The new school needs coordinated construction and teacher recruitment. Who is responsible for opening preparations?','新学校需要协调建设和教师招聘。谁负责启用前的准备工作？'),
    say('Средства на строительство не оплачивают все будущие годы работы школы. Проверим ежегодное содержание.','Construction funding does not pay for every future school year. Check annual operating costs.','建设资金并不能支付学校今后每年的运营费用。需要核实年度经费。'),
    say('Школа рядом с домом нужна семьям. Но пока она строится, переполненные классы остаются: когда появятся новые места?','Families need a nearby school. Classes remain crowded during construction: when will the new places be ready?','家庭需要就近上学。但建设期间班级仍然拥挤：新学位何时可以使用？')
   ],questions:{0:say('У школы есть срок строительства и будущие годы работы. Отдельно назовём ответственного за открытие и расходы после него.','The school has a construction schedule and future operating years. Identify opening responsibility and the costs after it.','学校既有建设周期，也有后续运营期。应分别明确启用责任和启用后的费用。')}},
   'school-bus':{speeches:[
    say('Выбраны школьные автобусы. Нужно связать безопасные маршруты со свободными местами в действующих школах.','You chose school buses. Safe routes need to connect pupils with available places in existing schools.','您选择了校车。安全路线需要把学生与现有学校的空余学位连接起来。'),
    say('Автобусам нужны водители, топливо и обслуживание. После окончания оплаченного срока маршрут потребует продления.','Buses need drivers, fuel and maintenance. The route needs renewal when its funded period ends.','校车需要司机、燃料和维护。已获资助的期限结束后，线路需要续期。'),
    say('Автобус даёт доступ к школе, но дети проведут часть дня в дороге. Хочу знать расписание и срок работы маршрута.','A bus gives access to school, but travel takes part of the children’s day. We need a schedule and a service period.','校车能帮助孩子到校，但通勤会占用时间。我们需要了解时间表和线路运营期限。')
   ],questions:{0:say('У маршрута есть оплаченный срок. Заранее проверим продление: дата первого рейса не гарантирует дальнейшую работу.','The route has a funded term. Plan its renewal: the first journey does not guarantee continued operation.','线路有确定的资助期限。要提前考虑续期：首次发车并不保证持续运营。')}},
   'second-shift':{speeches:[
    say('Вторая смена использует действующую школу. Кто согласует новое расписание, нагрузку учителей и срок временной меры?','A second shift uses the existing school. Who will coordinate timetables, teacher workload and the temporary term?','第二轮教学利用现有校舍。谁来协调课表、教师工作量和临时措施的期限？'),
    say('Временная вторая смена тоже требует ежегодных расходов. При продлении потребуются новые обязательства.','A temporary second shift still has annual costs. Renewal creates further commitments.','临时增加一轮教学也有年度费用。续期会产生新的支出义务。'),
    say('Вторая смена меняет расписание всей семьи. Скажите, как долго она будет действовать и когда вернёмся к этому решению.','A second shift changes the whole family’s day. Tell us how long it will last and when we will review it.','第二轮教学会改变全家的时间安排。请说明持续多久，以及何时重新评估这项决定。')
   ],questions:{0:say('Нужно организовать расписание действующей школы. Назовём срок временной меры и заранее обсудим, что будет после него.','Organise the existing school’s timetable. Define the temporary term and discuss what follows before it ends.','需要安排现有学校的课表。应明确临时措施的期限，并提前讨论到期后的安排。')}}
  },
  'river-land-use':{
   'nature-buffer':{speeches:[
    say('Природный буфер требует восстановления поймы и согласования использования земли. Кто отвечает за работы в долине?','A natural buffer requires floodplain restoration and agreed land use. Who is responsible for the valley work?','自然缓冲区需要恢复洪泛区并协调土地用途。谁负责河谷内的工作？'),
    say('У природного буфера есть ежегодное содержание. Ограничение застройки тоже меняет возможности развития территории.','The natural buffer has annual upkeep. Development restrictions also change the area’s economic options.','自然缓冲区每年需要维护。建设限制也会改变地区的发展选择。'),
    say('Нам важно, как изменятся привычные участки и доступ к берегу. Покажите, что именно сделано для защиты долины.','We need to understand changes to familiar land and river access. Show what was actually done to protect the valley.','我们需要了解常用地块和河岸通行会怎样变化。请展示保护河谷的实际工作。')
   ]},
   'logistics-embankment':{speeches:[
    say('Дамба и логистический коридор должны работать как один проект. Кто согласует защиту берега, дорогу и сроки работ?','The levee and logistics corridor must work as one project. Who will coordinate river protection, the road and timing?','堤坝和物流通道需要作为一个项目协同发挥作用。谁来协调护岸、道路和工期？'),
    say('Этот проект дорог при запуске и требует дальнейшего содержания. Проверим, чем обеспечены оба этапа.','This project is costly to launch and needs ongoing upkeep. Check funding for both stages.','这个项目启动费用高，之后也需要维护。应核实两个阶段的资金来源。'),
    say('Защита берега и новая дорога затронут дома и поездки на работу. Хочу видеть фактические работы и оставшиеся риски.','River protection and a new road affect homes and journeys to work. I want to see actual delivery and remaining risks.','护岸工程和新道路会影响住房及通勤。我希望看到实际进展和剩余风险。')
   ]},
   'zoning-moratorium':{speeches:[
    say('Мораторий меняет правила застройки. Кто объяснит ограничения муниципалитетам и будет отвечать за их исполнение?','A moratorium changes development rules. Who will explain the restrictions to municipalities and oversee implementation?','暂停建设改变了开发规则。谁向市镇解释限制并负责落实？'),
    say('У моратория небольшие прямые расходы, но есть упущенные инвестиции. Дешёвое решение тоже требует контроля.','A moratorium has low direct costs but forgoes investment. A low-cost choice still needs oversight.','暂停建设的直接费用较低，但会失去部分投资机会。低成本措施仍然需要监督。'),
    say('Ограничение новой застройки не отвечает на все вопросы жителей существующих домов. Какие риски останутся у нас?','Restricting new development does not answer every concern of existing residents. What risks remain for us?','限制新建并不能解决现有居民的全部问题。我们还面临哪些风险？')
   ],questions:{0:say('Согласуем исполнение правил и проверяемый отчёт. Для моратория запуск означает начало действия ограничений.','Agree on enforcement and a verifiable report. Launching a moratorium means the restrictions take effect.','请明确规则执行和可核验的报告。暂停建设措施的启动是指限制开始生效。')}}
  },
  'digital-procurement':{
   'modular-platform':{speeches:[
    say('У модульной платформы несколько поставщиков и единые стандарты. Кто отвечает за совместимость и внедрение?','A modular platform combines multiple suppliers and common standards. Who owns interoperability and rollout?','模块化平台涉及多个供应商和统一标准。谁负责兼容性和部署？'),
    say('Сравним расходы на внедрение, сопровождение и резервный контур. Цена запуска не показывает весь срок работы.','Compare rollout, maintenance and backup costs. The launch price does not describe the full service lifetime.','应比较部署、维护和备用系统的费用。启动价格并不代表整个使用期的成本。'),
    say('Для жителей важно, чтобы сервисы работали вместе. Покажите проверяемые результаты внедрения, а не только презентацию.','Residents need services that work together. Show verifiable rollout results, not just a presentation.','居民需要能够协同工作的服务。请展示可核验的部署成果，而不仅是演示。')
   ]},
   'single-vendor-contract':{speeches:[
    say('У единого поставщика проще определить ответственного. Кто со стороны области будет контролировать исполнение контракта?','A single vendor makes accountability clearer. Who on the regional side will supervise contract delivery?','单一供应商便于明确责任。地区方面由谁监督合同履行？'),
    say('Быстрый запуск может обернуться зависимостью от поставщика. Сравним ежегодные платежи и будущие обязательства.','A fast launch can create vendor dependence. Compare annual payments and future commitments.','快速上线可能造成对供应商的依赖。应比较年度付款和未来义务。'),
    say('Мне нужна надёжная услуга и понятная ответственность при сбое. Что покажет публичный отчёт о работе поставщика?','I need a reliable service and clear responsibility when it fails. What will the public report show about the vendor?','我需要可靠的服务，以及故障时明确的责任。公开报告将如何说明供应商的工作？')
   ]},
   'civic-tech-lab':{speeches:[
    say('Лаборатория будет проверять сервисы небольшими шагами. Кто свяжет работу университета, компаний и жителей?','The lab will test services in small steps. Who will coordinate the university, companies and residents?','实验室将以小步试验的方式测试服务。谁来协调大学、企业和居民？'),
    say('У лаборатории есть ежегодный бюджет и срок программы. Проверим, какие обязательства возникают после запуска.','The lab has an annual budget and a programme term. Check the commitments that follow launch.','实验室有年度预算和项目期限。应核实启动后的支出义务。'),
    say('Если нас зовут тестировать сервисы, хочу узнать, что изменилось после наших замечаний. Это должно попасть в отчёт.','If residents test services, I want to know what changed after our feedback. Include that in the report.','如果邀请居民测试服务，我想知道意见带来了哪些改变。这应写入报告。')
   ]}
  },
  'river-legacy':{
   'resilient-relocation':{speeches:[
    say('Переселение требует новых безопасных площадок и подготовки жилья. Кто согласует работы и переезд жителей?','Relocation needs safer sites and prepared housing. Who will coordinate construction and residents’ moves?','搬迁需要更安全的地点和住房准备。谁来协调建设和居民迁移？'),
    say('Переселение займёт время, а часть расходов останется преемнику. Покажем обязательства за пределами срока.','Relocation takes time, and some costs pass to the successor. Show commitments beyond the term.','搬迁需要时间，部分费用将由继任者承担。应列明任期之后的义务。'),
    say('Безопасность важна, но переезд меняет всю жизнь семьи. Хочу понять сроки и проверить, какие обещания выполнены.','Safety matters, but moving changes family life. I need clear timing and evidence of which promises were kept.','安全很重要，但搬迁会改变整个家庭的生活。我需要明确时间，并核实哪些承诺已兑现。')
   ]},
   'build-back-fast':{speeches:[
    say('Восстановление идёт на прежних местах. Кто отвечает за работы и объяснит, какие риски сохранятся после возвращения?','Rebuilding uses the same sites. Who owns delivery and will explain the risks that remain after residents return?','重建将在原址进行。谁负责实施，并解释居民返回后仍然存在的风险？'),
    say('Быстрое восстановление всё равно требует содержания. Эти расходы продолжатся и после конца кампании.','Rapid rebuilding still needs upkeep. Those costs continue beyond the campaign.','快速重建仍需要后续维护。这些费用会延续到游戏任期结束之后。'),
    say('Вернуться домой хочется быстрее. Но мы должны понимать, что восстановлено и насколько прежний риск остаётся с нами.','We want to return home quickly. But we need to know what was rebuilt and how much of the old risk remains.','我们希望尽快回家。但也需要了解恢复了什么，以及过去的风险还剩多少。')
   ]},
   'climate-insurance-pool':{speeches:[
    say('Страховой пул объединяет риски жителей, муниципалитетов и бизнеса. Кто организует его запуск и работу с участниками?','The insurance pool shares household, municipal and business risks. Who will organise launch and work with participants?','保险池分担家庭、市镇和企业的风险。谁负责启动并协调各参与方？'),
    say('Страховая программа требует средств на протяжении всего срока. Покажем будущие платежи, включая годы после кампании.','The insurance programme needs funding throughout its term. Show future payments, including years beyond this campaign.','保险项目在整个期限内都需要资金。应列出未来付款，包括游戏任期之后的年份。'),
    say('После паводка нужна понятная финансовая защита. Хочу проверить условия программы и увидеть отчёт о её работе.','After the flood, we need understandable financial protection. I want to inspect the programme terms and its delivery report.','洪水过后，我们需要清楚的财务保障。我希望查看项目条件和运行报告。')
   ],questions:{0:say('Здесь согласуем начало работы страховой программы. Обязательства, которые продолжатся после срока, должны остаться в отчёте.','Agree on the start of the insurance programme. Commitments continuing beyond the term must remain in the report.','这里需要确定保险项目的启动。任期结束后仍持续的义务必须保留在报告中。')}}
  }
 };
 for(const scene of CONFIG.scenes)scene.actionDialogue=actionDialogue[scene.missionId]||{};
 root.GovernorGame=root.GovernorGame||{};
 root.GovernorGame.GovernanceData=CONFIG;
 D.stage5Ready=true;
 for(const lang of ['ru','en']){
  Object.assign(D.ui[lang],lang==='ru'?{modelStage:'Stage 5 · 0.5.0',demoBadge:'Этап 5 · слово губернатора',startLead:'Двадцать лет у руля Новой области. Стройте, договаривайтесь с людьми и возвращайтесь к данным обещаниям. Деньги ещё не гарантируют результат, а согласие сегодня не отменяет проверку завтра.',buildLabel:'Версия 0.5.0 · Слово губернатора',startIntro:'Постройте регион, договоритесь с людьми и отвечайте за данные обещания.',reviewRegion:'Вернуться к региону',startGroup:'Учебная группа (необязательно)',confirmAction:'Утвердить решение'}:{modelStage:'Stage 5 · 0.5.0',demoBadge:'Stage 5 · A Governor’s Word',startLead:'Twenty years leading Novaya Oblast. Build, negotiate with people and return to the promises you made. Money does not guarantee results; agreement today does not cancel scrutiny tomorrow.',buildLabel:'Version 0.5.0 · A Governor’s Word',startIntro:'Build a region, negotiate with people and stand behind your promises.',reviewRegion:'Return to the region',startGroup:'Student group (optional)',confirmAction:'Approve decision'});
 }
 if(typeof module!=='undefined'&&module.exports)module.exports=CONFIG;
})(typeof window!=='undefined'?window:globalThis);
