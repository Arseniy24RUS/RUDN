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
 root.GovernorGame=root.GovernorGame||{};
 root.GovernorGame.GovernanceData=CONFIG;
 D.stage5Ready=true;
 for(const lang of ['ru','en']){
  Object.assign(D.ui[lang],lang==='ru'?{modelStage:'Stage 5 · 0.5.0',demoBadge:'Этап 5 · слово губернатора',startLead:'Двадцать лет у руля Новой области. Стройте, договаривайтесь с людьми и возвращайтесь к данным обещаниям. Деньги ещё не гарантируют результат, а согласие сегодня не отменяет проверку завтра.',buildLabel:'Версия 0.5.0 · Слово губернатора',startIntro:'Постройте регион, договоритесь с людьми и отвечайте за данные обещания.',reviewRegion:'Вернуться к региону',startGroup:'Учебная группа (необязательно)',confirmAction:'Утвердить решение'}:{modelStage:'Stage 5 · 0.5.0',demoBadge:'Stage 5 · A Governor’s Word',startLead:'Twenty years leading Novaya Oblast. Build, negotiate with people and return to the promises you made. Money does not guarantee results; agreement today does not cancel scrutiny tomorrow.',buildLabel:'Version 0.5.0 · A Governor’s Word',startIntro:'Build a region, negotiate with people and stand behind your promises.',reviewRegion:'Return to the region',startGroup:'Student group (optional)',confirmAction:'Approve decision'});
 }
 if(typeof module!=='undefined'&&module.exports)module.exports=CONFIG;
})(typeof window!=='undefined'?window:globalThis);
