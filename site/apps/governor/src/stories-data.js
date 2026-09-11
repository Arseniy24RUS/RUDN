/* Authored fictional resident narratives. All gameplay criteria are declared here. */
(function(root){
  "use strict";
  const data = {
  "version": "1.0.0-stage7",
  "title": {
    "ru": "Пять адресов",
    "en": "Five addresses"
  },
  "arcs": [
    {
      "id": "anna",
      "name": {
        "ru": "Анна",
        "en": "Anna"
      },
      "role": {
        "ru": "Фельдшер северного посёлка",
        "en": "Paramedic in a northern village"
      },
      "age": 29,
      "districtId": "north",
      "icon": "health",
      "art": "assets/scenes/north-access-scene.webp",
      "portrait": "assets/advisors/anna-resident.png",
      "portraits": [
        "assets/characters/anna-resident.webp",
        "assets/letters/anna-letter-02.webp",
        "assets/letters/anna-letter-03.webp"
      ],
      "turns": [
        1,
        11,
        20
      ],
      "title": {
        "ru": "Второй стул",
        "en": "The second chair"
      },
      "opening": {
        "ru": "В кабинете Анны два стула. На одном лежат сумки пациентов, другой она оставляет для молодого коллеги, которого пока нет. «О проектах все уже слышали. А кто выйдет на смену после меня? И доедет ли сюда человек из дальнего посёлка?»",
        "en": "There are two chairs in Anna’s surgery. Patients leave their bags on one. The other is kept for a younger colleague who has not arrived. “Everyone has heard about the projects. Who will take over my shift? And can someone from the farthest village get here?”"
      },
      "routes": [
        {
          "id": "near",
          "label": {
            "ru": "Спросить о доступности приёма",
            "en": "Ask about access to appointments"
          },
          "reply": {
            "ru": "«Смотрите не на число открытых дверей. Смотрите, сколько людей могут получить помощь». Вы оставили в записной книжке вопрос о доступности медицины на севере.",
            "en": "“Do not count open doors. Ask how many people can get care.” Your notebook now follows access to healthcare in the north."
          }
        },
        {
          "id": "future",
          "label": {
            "ru": "Спросить о дороге к пациентам",
            "en": "Ask about reaching patients"
          },
          "reply": {
            "ru": "«Автобус ходит, когда он ходит. Болезнь этого расписания не читала». Вы будете следить за транспортной доступностью северных поселений.",
            "en": "“The bus has its timetable. Illness has never read it.” Your notebook will follow transport access in the northern villages."
          }
        }
      ],
      "returnTitle": {
        "ru": "Смена после эпидемии",
        "en": "The shift after the outbreak"
      },
      "returning": {
        "ru": "Анна снова пишет вам после волны инфекции. Она не просит ещё одной торжественной встречи: хочет понять, что останется от антикризисных решений, когда чрезвычайный режим закончится. На столе всё тот же второй стул.",
        "en": "Anna writes again after the outbreak. She does not want another ceremonial meeting. She wants to know what will remain when the emergency ends. The second chair is still by her desk."
      },
      "followups": [
        {
          "id": "today",
          "label": {
            "ru": "Проверим результат к концу срока",
            "en": "Check the result at the end of the term"
          }
        },
        {
          "id": "lasting",
          "label": {
            "ru": "Проверим последние три года, а не один удачный",
            "en": "Check the last three years, not one good year"
          }
        }
      ],
      "endings": {
        "steady": {
          "title": {
            "ru": "Обычный приём",
            "en": "An ordinary appointment"
          },
          "body": {
            "ru": "В последнем письме нет просьбы устроить торжественное открытие. Анна прислала короткую записку: «Давайте просто сохраним то, что наконец стало получаться». Второй стул всё ещё стоит рядом. Теперь это место для разговора с тем, кто примет дела после вас.",
            "en": "The last letter does not ask for an opening ceremony. Anna sends a short note: “Let us keep what has finally started working.” The second chair is still there. Now it is a place for a conversation with whoever takes over from you."
          }
        },
        "fragile": {
          "title": {
            "ru": "Стул пока у окна",
            "en": "The chair by the window"
          },
          "body": {
            "ru": "Анна достаёт следующую страницу записной книжки. «Кое-что у нас получается. Но это ещё не значит, что можно перестать об этом думать». На столе остаётся список вопросов для новой команды.",
            "en": "Anna opens another page in her notebook. “Some things are working. That does not mean we can stop thinking about them.” A list of questions for the next team remains on her desk."
          }
        },
        "unresolved": {
          "title": {
            "ru": "Вопрос для преемника",
            "en": "A question for the successor"
          },
          "body": {
            "ru": "Анна просит передать преемнику её записную книжку. «Только не оставьте её в архиве вместе с фотографиями. Здесь люди, до которых мы всё ещё не добрались». На последней странице она оставила свободное место для ответа.",
            "en": "Anna asks you to give her notebook to your successor. “Please do not file it away with the photographs. These are the people we still have not reached.” She leaves room for a reply on the last page."
          }
        }
      },
      "metrics": {
        "near": {
          "key": "healthAccess",
          "label": {
            "ru": "Доступность медицины",
            "en": "Healthcare access"
          },
          "good": 0.72,
          "watch": 0.58
        },
        "future": {
          "key": "mobility",
          "label": {
            "ru": "Транспортная доступность",
            "en": "Transport access"
          },
          "good": 0.66,
          "watch": 0.51
        }
      },
      "related": [
        "rural-healthcare",
        "health-delivery",
        "flu-wave",
        "health-legacy"
      ]
    },
    {
      "id": "denis",
      "name": {
        "ru": "Денис",
        "en": "Denis"
      },
      "role": {
        "ru": "Мастер промышленного пояса",
        "en": "Industrial workshop supervisor"
      },
      "age": 24,
      "districtId": "industrial",
      "icon": "factory",
      "art": "assets/scenes/industrial-mentoring-scene.webp",
      "portrait": "assets/advisors/denis-resident.png",
      "portraits": [
        "assets/characters/denis-resident.webp",
        "assets/letters/denis-letter-02.webp",
        "assets/letters/denis-letter-03.webp"
      ],
      "turns": [
        2,
        12,
        20
      ],
      "title": {
        "ru": "Ключ от мастерской",
        "en": "The workshop key"
      },
      "opening": {
        "ru": "Денис хранит старый ключ от учебной мастерской. Здесь он научился работать на станке, но теперь друзья обсуждают вакансии в других городах. «Я не прошу удерживать нас любой ценой. Хочу понять, чему учиться и где потом работать».",
        "en": "Denis keeps the old key to his training workshop. He learned to operate a machine there, but his friends are now discussing jobs in other cities. “I am not asking you to keep us here at any cost. I want to know what to learn, and where I could work afterwards.”"
      },
      "routes": [
        {
          "id": "near",
          "label": {
            "ru": "Поговорить о работе в промышленном поясе",
            "en": "Talk about jobs in the industrial belt"
          },
          "reply": {
            "ru": "«Договорились. Только отличайте вакансию на плакате от человека, который действительно работает». Вы будете следить за занятостью жителей промышленной территории, включая поездки на работу.",
            "en": "“Then distinguish a vacancy on a poster from someone actually employed.” You will follow employment among industrial-area residents, including commuters."
          }
        },
        {
          "id": "future",
          "label": {
            "ru": "Поговорить о жизни семьи после смены",
            "en": "Talk about family life after the shift"
          },
          "reply": {
            "ru": "«Смену можно отработать. Сложнее решить, кто заберёт маленького ребёнка». Вы будете следить за доступностью ухода за детьми в промышленной территории.",
            "en": "“I can work a shift. Finding someone to look after a small child is harder.” You will follow childcare access in the industrial area."
          }
        }
      ],
      "returnTitle": {
        "ru": "Билет не куплен",
        "en": "The ticket is not bought"
      },
      "returning": {
        "ru": "После новой волны отъезда Денис возвращается к разговору. Он не хочет ни плаката «останься», ни обещания лёгкой жизни. «Мы договаривались смотреть на условия. Так они стали другими или только планы поменялись?»",
        "en": "After another wave of departures, Denis returns to your conversation. He wants neither a “stay here” poster nor a promise of an easy life. “We agreed to look at conditions. Have they changed, or only the plans?”"
      },
      "followups": [
        {
          "id": "today",
          "label": {
            "ru": "Сравнить условия к концу срока",
            "en": "Compare conditions at the end of the term"
          }
        },
        {
          "id": "lasting",
          "label": {
            "ru": "Посмотреть, держался ли результат три года",
            "en": "See whether the result lasted three years"
          }
        }
      ],
      "endings": {
        "steady": {
          "title": {
            "ru": "Ключ остался в деле",
            "en": "The key still has a use"
          },
          "body": {
            "ru": "Денис кладёт на стол старый ключ и улыбается: «Вопрос уже не в том, куда уехать поскорее. Можно выбирать, что делать здесь». Он не обещает остаться навсегда. Для вас важнее, что разговор о будущем больше не начинается с билета.",
            "en": "Denis puts the old key on the table and smiles. “The question is no longer where to leave for first. There are choices to consider here.” He does not promise to stay forever. What matters is that the conversation about his future no longer starts with a ticket."
          }
        },
        "fragile": {
          "title": {
            "ru": "Два варианта",
            "en": "Two options"
          },
          "body": {
            "ru": "Денис всё ещё сравнивает два варианта будущего. «Некоторые вещи сдвинулись. Теперь бы не потерять их после выборов и смены команды». Он просит передать следующему губернатору не лозунг про молодёжь, а вашу переписку.",
            "en": "Denis is still weighing two possible futures. “Some of the conditions are in place. Now we need to keep them when the team changes.” He asks you to pass on the letters, not another slogan about young people."
          }
        },
        "unresolved": {
          "title": {
            "ru": "Адрес для ответа",
            "en": "A forwarding address"
          },
          "body": {
            "ru": "В последнем письме Денис оставляет адрес для связи. «Я начал искать работу в другом месте. Это не значит, что я забыл свой город». Старый ключ он берёт с собой. Разговор, начавшийся в мастерской, заканчивается открытым вопросом о возвращении.",
            "en": "In his last letter, Denis leaves a forwarding address. “I have started looking for work elsewhere. That does not mean I have forgotten my city.” He takes the old key with him. The conversation that started in the workshop ends with an open question about returning."
          }
        }
      },
      "metrics": {
        "near": {
          "key": "employment",
          "label": {
            "ru": "Занятость доступной рабочей силы",
            "en": "Employment of available labour"
          },
          "good": 0.985,
          "watch": 0.94
        },
        "future": {
          "key": "childcareAccess",
          "label": {
            "ru": "Доступность ухода за детьми",
            "en": "Childcare access"
          },
          "good": 0.92,
          "watch": 0.85
        }
      },
      "related": [
        "youth-employment",
        "industrial-transition",
        "youth-outflow",
        "industrial-legacy"
      ]
    },
    {
      "id": "valentina",
      "name": {
        "ru": "Валентина",
        "en": "Valentina"
      },
      "role": {
        "ru": "Жительница речной долины",
        "en": "River-valley resident"
      },
      "age": 57,
      "districtId": "river",
      "icon": "house",
      "art": "assets/scenes/river-before-flood-scene.webp",
      "portrait": "assets/advisors/valentina-resident.png",
      "portraits": [
        "assets/characters/valentina-resident.webp",
        "assets/letters/valentina-letter-02.webp",
        "assets/letters/valentina-letter-03.webp"
      ],
      "turns": [
        3,
        13,
        20
      ],
      "title": {
        "ru": "Черта на дверном косяке",
        "en": "The mark on the doorframe"
      },
      "opening": {
        "ru": "На дверном косяке у Валентины есть карандашная черта: до неё однажды дошла вода. «В отчётах я вижу планы защиты. Из окна – реку. А если придётся уехать, где я окажусь?» Она предлагает говорить отдельно о защите территории и о доступности жилья.",
        "en": "There is a pencil mark on Valentina’s doorframe: the water once reached that high. “Reports show protection plans. My window shows a river. And if I need to leave, where would I live?” She suggests talking separately about protection and housing."
      },
      "routes": [
        {
          "id": "near",
          "label": {
            "ru": "Следить за защитой от паводка",
            "en": "Follow flood protection"
          },
          "reply": {
            "ru": "«Хорошо. Но отметка на стене не исчезнет от красивого обещания». Вы будете следить за защитой территории, а не за числом торжественных открытий.",
            "en": "“The mark on the wall will not disappear because of a fine promise.” You will follow territorial protection rather than count opening ceremonies."
          }
        },
        {
          "id": "future",
          "label": {
            "ru": "Следить за доступностью жилья",
            "en": "Follow housing access"
          },
          "reply": {
            "ru": "«Мне важно, чтобы переезд был выбором, а не просто новой очередью». В истории будет проверяться доступность жилья; качество адресного переселения модель пока не измеряет.",
            "en": "“Moving should be a choice, not just another queue.” The story will track housing access; the model does not yet measure the quality of individual resettlement."
          }
        }
      ],
      "returnTitle": {
        "ru": "После большой воды",
        "en": "After the high water"
      },
      "returning": {
        "ru": "Валентина пишет после паводка. Ранние планы уже прошли проверку, а теперь обсуждается восстановление. «Только не говорите, что вопрос закрыт, когда раздадут ключи. Что будет через несколько лет?»",
        "en": "Valentina writes after the flood. The early plans have been tested, and rebuilding is being discussed. “Please do not call this finished when the keys are handed over. What will things look like in a few years?”"
      },
      "followups": [
        {
          "id": "today",
          "label": {
            "ru": "Проверить состояние к передаче полномочий",
            "en": "Check conditions at the handover"
          }
        },
        {
          "id": "lasting",
          "label": {
            "ru": "Проверить устойчивость последних трёх лет",
            "en": "Check stability over the last three years"
          }
        }
      ],
      "endings": {
        "steady": {
          "title": {
            "ru": "Окно на реку",
            "en": "A window on the river"
          },
          "body": {
            "ru": "Валентина не стирает черту на дверном косяке. «Пусть остаётся. Мы ведь не договорились забыть о воде». Впервые за долгое время её письмо посвящено планам на весну, а не только тому, что делать при тревоге.",
            "en": "Valentina does not erase the mark on the doorframe. “Let it stay. We never agreed to forget the water.” For the first time in a long while, her letter is about plans for spring, not just what to do when the alarm comes."
          }
        },
        "fragile": {
          "title": {
            "ru": "Ключи и вопросы",
            "en": "Keys and questions"
          },
          "body": {
            "ru": "«Изменения я вижу», – пишет Валентина. Следующее предложение начинается со слова «но». Она просит не потерять условия договорённостей при смене команды. Копию письма оставляет рядом с документами на дом.",
            "en": "“I can see the changes,” Valentina writes. Her next sentence begins with “but”. She asks you not to lose the agreements during the handover. She keeps a copy of the letter beside her house documents."
          }
        },
        "unresolved": {
          "title": {
            "ru": "Черта осталась",
            "en": "The mark remains"
          },
          "body": {
            "ru": "Валентина снова обводит карандашную черту. «Не потому, что я знаю, когда вернётся вода. Чтобы следующая команда спросила, что это за отметка». Вы забираете последнее письмо: вопрос, с которого начался разговор, передаётся дальше.",
            "en": "Valentina traces over the pencil mark again. “Not because I know when the water will return. So the next team will ask what this mark means.” You take her final letter: the question that began the conversation is being passed on."
          }
        }
      },
      "metrics": {
        "near": {
          "key": "floodProtection",
          "label": {
            "ru": "Защита от паводка, игровой индекс",
            "en": "Flood protection, game index"
          },
          "good": 0.55,
          "watch": 0.25
        },
        "future": {
          "key": "housingAccess",
          "label": {
            "ru": "Доступность жилья",
            "en": "Housing access"
          },
          "good": 0.995,
          "watch": 0.96
        }
      },
      "related": [
        "flood-preparedness",
        "river-land-use",
        "major-flood",
        "river-legacy"
      ]
    },
    {
      "id": "mikhail",
      "name": {
        "ru": "Михаил",
        "en": "Mikhail"
      },
      "role": {
        "ru": "Учитель областного центра",
        "en": "Teacher in the regional centre"
      },
      "age": 33,
      "districtId": "capital",
      "icon": "digital",
      "art": "assets/scenes/capital-service-scene.webp",
      "portrait": "assets/advisors/mikhail-resident.png",
      "portraits": [
        "assets/characters/mikhail-resident.webp",
        "assets/letters/mikhail-letter-02.webp",
        "assets/letters/mikhail-letter-03.webp"
      ],
      "turns": [
        4,
        14,
        20
      ],
      "title": {
        "ru": "Папка с копиями",
        "en": "The folder of copies"
      },
      "opening": {
        "ru": "Михаил пришёл в приёмную с папкой документов. «Я умею пользоваться порталом. Но потом всё равно просят бумагу. А отец вообще не хочет разбираться с экраном». Он предлагает проверить либо доступность цифровой услуги, либо её способность пережить сбой.",
        "en": "Mikhail arrives with a folder of documents. “I can use the portal. They still ask for paper afterwards. My father does not want to deal with a screen at all.” He suggests following either digital access or resilience to disruption."
      },
      "routes": [
        {
          "id": "near",
          "label": {
            "ru": "Проверять доступность цифровых услуг",
            "en": "Check access to digital services"
          },
          "reply": {
            "ru": "«Тогда не будем считать новый логотип на сайте результатом». Вы записали вопрос о цифровой доступности. Опыт отдельных пользователей шире одного индекса.",
            "en": "“Then a new logo on the website is not a result.” You note the question of digital access. Individual experiences are broader than one index."
          }
        },
        {
          "id": "future",
          "label": {
            "ru": "Проверять защиту от сбоев",
            "en": "Check resilience to disruption"
          },
          "reply": {
            "ru": "«Я готов потерпеть неудобство, если понимаю, как система восстановится». Вы будете следить за защитой сервисов; этот индекс не является вероятностью атаки.",
            "en": "“I can tolerate inconvenience if I understand how the system recovers.” You will follow service protection; that index is not an attack probability."
          }
        }
      ],
      "returnTitle": {
        "ru": "Сайт недоступен",
        "en": "The service is unavailable"
      },
      "returning": {
        "ru": "После кибератаки Михаил возвращается с той же папкой. «Запасной канал оказался нужен именно тогда, когда основной перестал работать. Давайте вернёмся к тому, что мы решили проверять».",
        "en": "After the cyberattack, Mikhail returns with the same folder. “A backup channel matters when the main one stops working. Let us return to what we agreed to check.”"
      },
      "followups": [
        {
          "id": "today",
          "label": {
            "ru": "Посмотреть итоговое состояние системы",
            "en": "Check the system at the end of the term"
          }
        },
        {
          "id": "lasting",
          "label": {
            "ru": "Проверить, не был ли успех кратковременным",
            "en": "Check that success was not short-lived"
          }
        }
      ],
      "endings": {
        "steady": {
          "title": {
            "ru": "Папка на полке",
            "en": "The folder on the shelf"
          },
          "body": {
            "ru": "Михаил ставит папку на верхнюю полку. «Выбрасывать не буду. Но хорошо, что она больше не первое, о чём думаешь перед обращением». На прощание он просит сохранить возможность задать вопрос живому человеку.",
            "en": "Mikhail puts the folder on the top shelf. “I will not throw it away. But it is good that it is no longer the first thing I think of before asking for a service.” Before leaving, he asks you to preserve the option of speaking to a person."
          }
        },
        "fragile": {
          "title": {
            "ru": "Держать копии",
            "en": "Keep the copies"
          },
          "body": {
            "ru": "Михаил перебирает копии и часть оставляет под рукой. «Стало легче, но я пока не готов убирать всё в дальний ящик». Он предлагает новому руководителю пройти тот же путь обычного пользователя, с которого началась ваша переписка.",
            "en": "Mikhail sorts the copies and keeps some within reach. “Some tasks can be done, but I am not ready to put everything away.” He suggests that the next governor follow the same ordinary user’s journey that started your conversation."
          }
        },
        "unresolved": {
          "title": {
            "ru": "Ещё один визит",
            "en": "One more visit"
          },
          "body": {
            "ru": "Михаил приходит с той же папкой. «Мне уже объясняли, сколько систем запустили. Давайте в следующий раз начнём с того, что нужно сделать человеку». Он оставляет копию обращения, а оригинал забирает с собой.",
            "en": "Mikhail returns with the same folder. “I have been told how many systems were launched. Next time, let us begin with what a person actually needs to do.” He leaves a copy of his request and takes the original home."
          }
        }
      },
      "metrics": {
        "near": {
          "key": "digitalAccess",
          "label": {
            "ru": "Цифровая доступность, игровой индекс",
            "en": "Digital access, game index"
          },
          "good": 0.98,
          "watch": 0.9
        },
        "future": {
          "key": "digitalProtection",
          "label": {
            "ru": "Защита сервисов, игровой индекс",
            "en": "Service protection, game index"
          },
          "good": 0.5,
          "watch": 0.23
        }
      },
      "related": [
        "digital-services",
        "digital-procurement",
        "cyberattack",
        "public-audit"
      ]
    },
    {
      "id": "olga",
      "name": {
        "ru": "Ольга",
        "en": "Olga"
      },
      "role": {
        "ru": "Мать школьника из Нового берега",
        "en": "Parent in New Bank"
      },
      "age": 28,
      "districtId": "suburb",
      "icon": "school",
      "art": "assets/scenes/suburb-school-scene.webp",
      "portrait": "assets/advisors/olga-resident.png",
      "portraits": [
        "assets/characters/olga-resident.webp",
        "assets/letters/olga-letter-02.webp",
        "assets/letters/olga-letter-03.webp"
      ],
      "turns": [
        5,
        15,
        20
      ],
      "title": {
        "ru": "Дорога после уроков",
        "en": "The way home from school"
      },
      "opening": {
        "ru": "Когда семья Ольги въехала в Новый берег, сыну было шесть. Теперь он учится, а обещанная близость школы всё ещё обсуждается. «Мы выбирали дом надолго. Не хочется каждый год заново собирать семейное расписание».",
        "en": "Olga’s son was six when the family moved to New Bank. He is at school now, while the promise of a nearby school is still being discussed. “We chose a home for the long term. We do not want to rebuild our family timetable every year.”"
      },
      "routes": [
        {
          "id": "near",
          "label": {
            "ru": "Следить за доступностью школы",
            "en": "Follow school access"
          },
          "reply": {
            "ru": "«Тогда смотрите и на соседние школы, а не только на нашу стройку». В записной книжке остаётся вопрос о доступных школьных местах, включая поездки в другую территорию.",
            "en": "“Look at neighbouring schools too, not just our construction site.” Your notebook follows available school places, including places reached in another area."
          }
        },
        {
          "id": "future",
          "label": {
            "ru": "Следить за возможностью родителей работать",
            "en": "Follow parents’ ability to work"
          },
          "reply": {
            "ru": "«Дом – это ещё и возможность не отказываться от работы». Вы будете следить за занятостью жителей пригорода. Это общий показатель, а не отдельная статистика родителей.",
            "en": "“A home should also make it possible to keep working.” You will follow employment in the suburb. This is an aggregate measure, not a separate measure for parents."
          }
        }
      ],
      "returnTitle": {
        "ru": "Дети выросли",
        "en": "The children have grown"
      },
      "returning": {
        "ru": "Ольга возвращается к переписке: её сын уже взрослый, а новые семьи обсуждают очередь в детский сад. «Теперь этот разговор ведут другие родители. То, что мы выбирали для одного поколения, помогло следующему?»",
        "en": "Olga returns to the correspondence. Her son is an adult now, while new families discuss the childcare queue. “Other parents are having that conversation now. Did what we chose for one generation help the next?”"
      },
      "followups": [
        {
          "id": "today",
          "label": {
            "ru": "Оценить условия для новых семей сейчас",
            "en": "Assess conditions for new families now"
          }
        },
        {
          "id": "lasting",
          "label": {
            "ru": "Посмотреть, удержались ли услуги три года",
            "en": "See whether services lasted three years"
          }
        }
      ],
      "endings": {
        "steady": {
          "title": {
            "ru": "Новый школьный маршрут",
            "en": "A new school route"
          },
          "body": {
            "ru": "Сын Ольги давно вырос. В последнем письме она рассказывает о новых соседях с детьми: «Мы хотя бы можем объяснить им, как здесь устроена жизнь, а не только пересказать обещания». Семейное расписание снова меняется, но уже не начинается с того самого школьного вопроса.",
            "en": "Olga’s son has grown up. Her last letter is about new neighbours with children. “At least we can explain how life here works, rather than just repeat the promises.” The family timetable is changing again, but it no longer starts with that same school question."
          }
        },
        "fragile": {
          "title": {
            "ru": "Расписание на двоих",
            "en": "A timetable for two"
          },
          "body": {
            "ru": "Ольга улыбается, узнав знакомый разговор новых соседей. «Кое-что им будет проще. Кое-что придётся устраивать самим, как и нам». Она передаёт им не готовый ответ, а список того, что ещё надо довести до конца.",
            "en": "Olga smiles when she hears a familiar conversation among new neighbours. “Some things will be easier for them. Others they will have to arrange themselves, just as we did.” She hands them a list of unfinished work, not a ready-made answer."
          }
        },
        "unresolved": {
          "title": {
            "ru": "Следующие родители",
            "en": "The next parents"
          },
          "body": {
            "ru": "Сын Ольги уже взрослый, а в соседнем подъезде родители снова собирают своё расписание вокруг нехватки услуг. «Я надеялась, что этот разговор не достанется следующим». Ольга сохраняет первое письмо: теперь оно может пригодиться новой инициативной группе.",
            "en": "Olga’s son is an adult, but parents in the next building are once again arranging their timetables around missing services. “I hoped the next families would not inherit this conversation.” She keeps the first letter for a new residents’ group."
          }
        }
      },
      "metrics": {
        "near": {
          "key": "schoolAccess",
          "label": {
            "ru": "Доступность школьных мест",
            "en": "Access to school places"
          },
          "good": 0.94,
          "watch": 0.76
        },
        "future": {
          "key": "employment",
          "label": {
            "ru": "Занятость доступной рабочей силы",
            "en": "Employment of available labour"
          },
          "good": 0.84,
          "watch": 0.79
        }
      },
      "related": [
        "school-neighbourhood",
        "family-neighbourhood",
        "childcare-queue",
        "generations-city"
      ]
    }
  ]
};
  root.GovernorGame=root.GovernorGame||{};root.GovernorGame.StoriesData=data;
  if(typeof module!=="undefined"&&module.exports)module.exports=data;
})(typeof window!=="undefined"?window:globalThis);
