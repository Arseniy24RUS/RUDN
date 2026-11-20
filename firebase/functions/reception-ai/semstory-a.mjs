// Fictional correspondence and evidence for the seminar. Official links identify bodies only.
import backgrounds from './participant-backgrounds.json' with { type: 'json' };
const doc = (title, text) => ({ title, text });
const story = (docId, opening, prior, evidence, purpose, options = {}) =>
  ({ docId, opening, prior, evidence, purpose, ...options });

const lightingDivision = [
  'Управление эксплуатации систем наружного освещения и праздничного оформления Департамента жилищно-коммунального хозяйства города Москвы',
  'Outdoor Lighting Systems and Festive Decorations Operations Division of the Moscow Department of Housing and Communal Services',
  '莫斯科市住房和公用事业局户外照明系统及节庆装饰运行处',
];

export const storiesA = {
  'complaint-routing': story('resolution',
    ['Я Сергей Петрович. У московской остановки «Сосновый сквер» на подходе к переходу не горят фонари № 17 и 18. Начальник управления московского Департамента ЖКХ ответил мне про соседний сквер. Теперь в приёмной хотят отправить мою жалобу ему же. Кто разберётся, почему мой адрес пропустили?',
     'I’m Sergey Petrovich. Lamps 17 and 18 on the approach to the crossing by Moscow’s Sosnovy Skver stop are out. The division head at the Moscow Department of Housing and Communal Services replied about the square next door. Reception now wants to send my complaint back to him. Who will find out why my location was missed?',
     '我是谢尔盖·彼得罗维奇。莫斯科松树小广场公交站通往人行横道的路上，17、18号路灯不亮。莫斯科市住房和公用事业局的处长答复的却是隔壁广场。现在接待处还想把投诉交给他本人。谁来查清我反映的地点为什么被漏掉？'],
    ['{{priorDate}} я написал в Департамент ЖКХ Москвы про фонари № 17 и 18 и приложил схему подхода к переходу. В ответе от {{replyDate}} за подписью начальника управления указано, что освещение соседнего сквера исправно. Номеров моих опор там нет.',
     'On {{priorDate}} I wrote to the Moscow Department of Housing and Communal Services about lamps 17 and 18 and attached a map of the approach to the crossing. In the signed reply of {{replyDate}} the division head said the lights in the neighbouring square were working. My pole numbers were missing.',
     '{{priorDate}}，我向莫斯科市住房和公用事业局反映17、18号路灯的问题，并附上通往人行横道的示意图。处长在{{replyDate}}签署答复，称隔壁广场照明正常，没提我报的灯杆编号。'],
    ['Карточка МФЦ. Жалоба поступила {{received}}, зарегистрирована {{registered}}. В прежней переписке был неподписанный проект резолюции: «Начальнику управления по наружному освещению — рассмотреть жалобу окончательно, подписать ответ от своего имени». Должность совпадает с должностью подписанта ответа от {{replyDate}}.',
     'Public service centre intake record. Complaint received {{received}} and registered {{registered}}. The earlier correspondence contained an unsigned draft instruction: “Outdoor lighting division head to make the final determination and sign the reply personally.” The post matches that of the signatory of the reply dated {{replyDate}}.',
     '政务服务中心登记卡。投诉于{{received}}收到、{{registered}}登记。先前往来材料中有一份未签署的拟批示：“由户外照明运行处处长作出最终处理并以本人名义签署答复。”该职务与{{replyDate}}答复签署人的职务相同。'],
    ['Прошу руководителя департамента проверить, почему в ответе не разобраны фонари № 17 и 18, и дать мотивированный ответ по моим доводам. Мне нужно понять, кто проверит именно этот участок и что установлено.',
     'I ask the department director to check why the reply missed lamps 17 and 18 and to address my arguments with reasons. I want to know who will check that stretch and what they find.',
     '我请求局负责人核查原答复遗漏17、18号路灯的原因，并针对我的理由给出有依据的答复。我想知道谁来检查这一路段，以及查明了什么。'],
    { routeDocId: 'lighting-signed-reply', authoritySources: [
      'https://www.mos.ru/upload/documents/files/5356/11082023_01-01-13-189_23_Personalniedannie.pdf',
      'https://www.mos.ru/upload/documents/docs/29112017_64-02-1501_17_Sobyanin_SS_Rakova_AV.pdf',
    ],
    docs: {
      complaint: doc(['Жалоба Сергея Петровича', 'Sergey Petrovich’s complaint', '谢尔盖·彼得罗维奇的投诉'], [
        `В приёмную руководителя Департамента ЖКХ Москвы. В обращении от {{priorDate}} я просил проверить опоры № 17 и 18 у остановки «Сосновый сквер». Ответ подписал начальник подразделения «${lightingDivision[0]}». В ответе указан соседний объект. Прошу проверить полноту рассмотрения моего письма этим должностным лицом и дать ответ по указанным опорам.`,
        `To the office of the director of the Moscow Department of Housing and Communal Services. In my letter of {{priorDate}} I asked you to check poles 17 and 18 by the Sosnovy Skver stop. The head of the ${lightingDivision[1]} signed the reply, which identified the neighbouring site. Please examine how fully this official addressed my letter and give me a reply on the two poles.`,
        `致莫斯科市住房和公用事业局负责人接待室。我于{{priorDate}}请求检查松树小广场公交站旁17、18号灯杆。答复由${lightingDivision[2]}处长签署，写的却是相邻场地。请核查该工作人员处理原来信是否完整，并就这两根灯杆答复。`,
      ]),
      competence: doc(['Выписка о полномочиях руководителя департамента', 'Department director’s delegated powers', '局负责人的职权摘录'], [
        'Руководитель Департамента ЖКХ Москвы уполномочен проверить рассмотрение письма начальником управления. Часть 6 статьи 8 закона № 59-ФЗ исключает поручение рассмотрения тому, чьё бездействие оспорено. У управления можно запросить материалы и объяснение.',
        'The Moscow department director is authorised to review the division head’s handling of the letter. Article 8(6) of Law 59-FZ bars referring the complaint for determination to the official whose omission is challenged. The division may provide the records and an explanation.',
        '在本案中，莫斯科市住房和公用事业局负责人有权核查该处处长处理来信的情况。第59-FZ号法律第8条第6款禁止由被投诉不作为的人员办理投诉。可以向该处调取记录和情况说明。',
      ]),
      resolution: doc(['Проект резолюции приёмной без подписи', 'Unsigned draft reception instruction', '接待处未签署的拟批示'], [
        'Жалоба зарегистрирована в МФЦ {{registered}}. В прежней переписке предлагаемый исполнитель — начальник управления, подписавший ответ от {{replyDate}}. Предложение: поручить ему окончательное рассмотрение и подпись.',
        'The public service centre registered the complaint on {{registered}}. The earlier draft names the division head who signed the reply of {{replyDate}} and proposes that he conduct the final review and sign.',
        '政务服务中心于{{registered}}登记投诉。先前的拟批示指定签署{{replyDate}}答复的处长负责最终审查并签署答复。',
      ]),
    },
    extraDocs: [
      { id: 'lighting-original-letter', ...doc(['Первое письмо об освещении', 'Original letter about lighting', '关于照明的第一封来信'], [
        'В Департамент жилищно-коммунального хозяйства города Москвы. {{priorDate}}. Я возвращаюсь домой через остановку «Сосновый сквер». На пешеходной дорожке от остановки к переходу не горят фонари на опорах № 17 и 18. Номера переписал с табличек. После наступления темноты подход к переходу плохо виден. Прошу проверить две опоры на участке, отмеченном на прилагаемой схеме, и сообщить, что установлено. Сергей Петрович. Подпись имеется. Схема: остановка — опора 17 — опора 18 — пешеходный переход.',
        'To the Moscow Department of Housing and Communal Services. {{priorDate}}. I walk home past the Sosnovy Skver stop. The lamps on poles 17 and 18 on the footpath from the stop to the crossing are out. I copied the numbers from the plates. After dark the approach to the crossing is hard to see. Please check both poles on the stretch marked on the attached map and tell me what you find. Sergey Petrovich. Signed. Map: bus stop, pole 17, pole 18, pedestrian crossing.',
        '致莫斯科市住房和公用事业局。{{priorDate}}。我回家经过松树小广场公交站。车站到人行横道的步道上，17、18号灯杆的灯不亮。我从灯杆标牌抄下编号。天黑后很难看清横道入口。请检查附图所标路段上的两根灯杆，并告知结果。谢尔盖·彼得罗维奇。已签名。示意图：公交站—17号灯杆—18号灯杆—人行横道。',
      ]) },
      { id: 'lighting-signed-reply', ...doc(['Подписанный ответ о соседнем объекте', 'Signed reply about the neighbouring site', '关于相邻场地的已签署答复'], [
        `{{replyDate}}. «По результатам осмотра освещение центральной аллеи соседнего сквера работает в штатном режиме». Подписал начальник подразделения «${lightingDivision[0]}». Остановки, перехода и опор № 17 и 18 в письме нет.`,
        `{{replyDate}}. “The inspection found that the lights on the neighbouring square’s central walkway were operating normally.” Signed by the head of the ${lightingDivision[1]}. The reply contains no reference to the stop, the crossing or poles 17 and 18.`,
        `{{replyDate}}。“经检查，相邻广场中央步道的照明运行正常。”由${lightingDivision[2]}处长签署。答复未提公交站、人行横道或17、18号灯杆。`,
      ]) },
      { id: 'lighting-signed-instruction', stage: 'control', ...doc(['Подписанная резолюция руководителя · контрольный эпизод', 'Director’s signed instruction · follow-up', '负责人签署的批示 · 后续检查'], [
        'В контрольном эпизоде руководитель подписал резолюцию: «Запросить у начальника управления первое письмо, схему, ответ и объяснение по опорам 17 и 18. Жалобу рассматриваю я. Проект мотивированного ответа представить мне на подпись». Резолюция поручает проверку доводов и не удостоверяет состояние фонарей.',
        'In the follow-up the director has signed this instruction: “Obtain the first letter, map, reply and the division head’s explanation about poles 17 and 18. I will review the complaint. Submit a reasoned draft reply for my signature.” The instruction orders a review of the arguments; it does not establish the condition of the lamps.',
        '后续情节中，负责人签署批示：“向处长调取首次来信、示意图、答复及对17、18号灯杆的情况说明。投诉由我审查。请提交说明理由的答复草稿，由我签署。”批示要求核查投诉理由，未认定路灯状况。',
      ]) },
    ],
    factTexts: {
      person: ['Я обжалую, как начальник управления рассмотрел письмо про опоры 17 и 18.', 'My complaint concerns the division head’s handling of the letter about poles 17 and 18.', '我投诉的是该处处长处理17、18号灯杆来信的方式。'],
      subject: ['Я писал обычное обращение о двух фонарях у остановки. Теперь жалуюсь на то, как рассмотрели это письмо.', 'I sent an ordinary letter about two lamps by the bus stop. I’m now complaining about how that letter was handled.', '我原来写的是关于公交站旁两盏路灯的普通来信。现在投诉该来信的办理情况。'],
      materials: ['Есть первое подписанное письмо со схемой, ответ начальника и карточка регистрации моей жалобы.', 'There’s my original signed letter with the map, the division head’s reply and the complaint registration card.', '材料包括我签名的首次来信及附图、处长答复和投诉登记卡。'],
    } }),
  'complaint-officer-not-organ': story('d2',
    ['Сотрудник С-8 ответил на моё письмо о проходе к дому во дворе. Он описал въезд для машин, а про сломанную калитку не написал. Теперь ему же поручают подписать ответ на жалобу?',
     'Officer S-8 replied to my letter about getting into the courtyard on foot. He described the vehicle entrance and skipped the broken gate. Is he now being asked to sign the reply to the complaint about his own work?',
     '工作人员S-8答复了我反映步行进入住宅院落的问题。他写了车行入口，却没提坏掉的小门。现在又要由他签署对本人投诉的答复吗？'],
    ['{{priorDate}} я передал в Департамент ЖКХ Москвы схему двора, где отметил отдельную калитку. В ответе от {{replyDate}} С-8 написал, что проезд открыт. Про проход пешеходов я ничего не нашёл.',
     'On {{priorDate}} I submitted a courtyard sketch to the Moscow Department of Housing and Communal Services with the separate pedestrian gate marked. On {{replyDate}} S-8 wrote that the driveway was open. I found nothing about pedestrian access.',
     '{{priorDate}}我向莫斯科市住房和公用事业局提交院落示意图，标明独立的小门。S-8于{{replyDate}}答复称车道畅通，没提行人通道。'],
    ['Выписка из карточки Департамента ЖКХ Москвы по прежнему письму. Указание руководителя: С-8 даёт объяснение и подписывает окончательный ответ. В приложении к первому письму отмечена пешеходная калитка, в подписанном С-8 ответе описан только въезд.',
     'Extract from the Moscow Department of Housing and Communal Services file on the earlier letter. The manager instructed S-8 to give an explanation and sign the final reply. The attachment to the original letter marks the pedestrian gate. S-8’s signed reply describes only the driveway.',
     '莫斯科市住房和公用事业局原来件登记卡摘录。负责人指示S-8作说明并签署最终答复。首次来信附图标明行人小门，S-8签署的答复只讲车道。'],
    ['Прошу проверить, как С-8 рассмотрел письмо, и ответить по самой калитке. Я обращаюсь по поводу действий С-8.',
     'Please review how S-8 handled my letter and give me an answer about the gate. My complaint concerns S-8’s conduct.',
     '请核查S-8如何办理来信，并就小门本身答复。我投诉的是S-8的行为。']),
  'complaint-access-materials': story('d1',
    ['Я писала в Управление Роспотребнадзора по Москве про крепление качелей во дворе. Мне сообщили о проверке, а посмотреть акт не дали: сказали, что в этой папке есть медицинские сведения другого человека.',
     'I wrote to Moscow Rospotrebnadzor about a swing mounting in our courtyard. They reported an inspection but would not show me the report because the folder contains someone else’s medical information.',
     '我向消费者保护监督局莫斯科市管理局反映院内秋千固定件的问题。他们说检查过，却拒绝让我看记录，称案卷里有他人的医疗信息。'],
    ['{{priorDate}} я отметила на фото расшатанное крепление качелей у входа во двор. После ответа от {{replyDate}} я попросила показать акт осмотра и фотографии. Сотрудник отказал сразу во всей папке.',
     'On {{priorDate}} I marked the loose swing mounting by the courtyard entrance on a photo. After the reply of {{replyDate}} I asked to see the inspection record and photographs. The officer refused access to the whole file.',
     '{{priorDate}}我在照片上标出院落入口旁秋千松动的固定件。收到{{replyDate}}的答复后，我要求查看检查记录和照片。工作人员拒绝让我查看整个案卷。'],
    ['Опись Управления Роспотребнадзора по Москве, дело Д-42. А-4 — осмотр креплений качелей у входа, приложены фотографии площадки без людей. М-2 — отдельное приложение со сведениями о здоровье другого заявителя. Отказ «в папке есть персональные данные» не различает А-4 и М-2.',
     'Moscow Rospotrebnadzor inventory, file D-42. A-4 records inspection of swing mountings by the entrance and includes site photographs with no people visible. M-2 is a separate attachment with another applicant’s health information. The refusal cited personal data in the folder without distinguishing A-4 from M-2.',
     '消费者保护监督局莫斯科市管理局D-42案卷目录。A-4记录了入口旁秋千固定件的检查，附无人入镜的场地照片。M-2是含另一申请人健康信息的独立附件。拒绝理由只称案卷含个人数据，未区分A-4与M-2。'],
    ['Дайте ознакомиться с актом и снимками площадки: я хочу проверить, осматривали ли именно крепления качелей. Чужие медицинские сведения я не запрашиваю.',
     'Please let me inspect the report and the site photographs so I can see whether they checked the swing mountings. I have no request for anyone else’s medical information.',
     '请让我查阅记录和场地照片，我想确认是否检查了秋千固定件。我没有申请查阅他人的医疗信息。']),
  'complaint-wrong-procedure': story('d1',
    ['В московском МФЦ сотрудник у окна не принял мой пакет на оформление жилищной субсидии. Я указала окно, дату и услугу в жалобе Ж-18. Теперь говорят ждать тридцать дней как по обычному письму.',
     'At a Moscow public services centre the counter employee refused to accept my housing-subsidy application package. I gave the counter, date and service in complaint Zh-18. Now they say to wait thirty days as if it were an ordinary letter.',
     '莫斯科政务服务中心窗口工作人员拒收我的住房补贴申请材料。我在Ж-18号投诉里写明了窗口、日期和业务。现在却说要按普通来信等三十天。'],
    ['Я обратилась за жилищной субсидией в центр «Мои документы». После отказа принять пакет я указала сотрудника и обстоятельства отказа в жалобе. В приёмной жалобу зарегистрировали как Ж-18.',
     'I went to the My Documents centre to apply for a housing subsidy. After the counter employee refused to accept my papers I identified the employee and described the refusal in a complaint. Reception registered it as Zh-18.',
     '我到“我的文件”政务服务中心申请住房补贴。窗口拒收后，我在投诉中写明工作人员及拒收经过。接待处将投诉登记为Ж-18号。'],
    ['Карточка ГБУ МФЦ Москвы Ж-18. Поступила {{received}}, зарегистрирована {{registered}}. Предмет: отказ сотрудника окна принять пакет на жилищную субсидию. Услуга, работник и обстоятельства указаны. Поле «вид производства» заполнено «общее обращение»; решения по отказу в приёме в карточке ещё нет.',
     'Moscow Public Services Centres record Zh-18. Received {{received}} and registered {{registered}}. Subject: counter employee’s refusal to accept the housing-subsidy application package. The entry identifies the service, employee and circumstances. It is marked “general correspondence”; no decision on intake refusal has been entered.',
     '莫斯科政务服务中心Ж-18登记卡。{{received}}收到、{{registered}}登记。事项：窗口工作人员拒收住房补贴申请材料。已记载业务、工作人员和情况。“程序类别”填为“普通来信”，仍无关于拒收的处理决定。'],
    ['Прошу рассмотреть именно отказ принять пакет и объяснить, как я могу подать документы для оформления субсидии.',
     'Please review the refusal to accept my papers and explain how I can submit the subsidy application.',
     '请审查拒收材料这一行为，并告诉我怎样提交补贴申请。'],
    { authoritySources: ['https://md.mos.ru/'], recipients: [['mos-mfc-director']] }),
};

// The exhibit header supplies the issuer. The exercise presents the underlying
// authored document alongside this case-specific excerpt.
function exhibit(title, evidence) {
  return title.map((name, index) => `${name}\n${evidence[index]}`);
}

function add(issuer, cases, options = {}) {
  for (const [id, [docId, opening, evidence, purpose, prior]] of Object.entries(cases)) {
    const previous = backgrounds.cases[id]?.priorContact;
    const history = previous && ['ru', 'en', 'zh'].map(language => previous[language]);
    storiesA[id] = story(docId, opening, prior || history || opening, exhibit(issuer, evidence), purpose, options);
  }
}

add(['Карточка смены ГБУ МФЦ Москвы', 'Moscow Public Services Centres shift record', '莫斯科政务服务中心值班记录'], {
  'access-counter': ['d0',
    ['Я у входа в московский центр «Мои документы». Нажал кнопку вызова, сотрудник вышел, но направил меня на второй этаж. По лестнице мне не подняться.',
     'I’m at the entrance to the Moscow My Documents centre. Someone answered the call button but told me to go upstairs. I can’t use the stairs.',
     '我在莫斯科“我的文件”服务中心入口。呼叫按钮有人响应，却让我去二楼。我上不了楼梯。'],
    ['На объекте два уровня, лифта нет. Входная кнопка сработала, приём по существу не начат. Переговорная на первом этаже свободна, специалист может спуститься.',
     'The site has two levels and no lift. The entrance button worked, but the consultation has yet to begin. The ground-floor meeting room is free and the specialist can come down.',
     '现场有两层，没有电梯。入口按钮有效，正式接待尚未开始。一楼会谈室空闲，业务人员可以下来。'],
    ['Позовите специалиста в комнату на первом этаже, чтобы я мог обсудить документы без посторонних.',
     'Please ask the specialist to meet me in the downstairs room so I can discuss my papers in private.',
     '请业务人员到一楼房间接待我，我想私下谈材料。']],
  'access-guide-dog': ['d1',
    ['У входа в зал «Мои документы» охранник увидел мою собаку-проводника и показал табличку. Я предъявил документ П-82 о её обучении, но нас не пустили.',
     'At the My Documents entrance the guard saw my guide dog and pointed to a sign. I showed its training document P-82, but we were turned away.',
     '“我的文件”中心入口的保安看到我的导盲犬，指了指告示牌。我出示P-82训练证明，但仍被拒绝入内。'],
    ['В журнале входа указан П-82, сведения о собаке совпадают. Причина отказа: общая табличка о входе с животными. Других причин в записи нет.',
     'Entrance log lists P-82 with matching guide-dog details. The general sign about animals is the sole reason entered for refusal.',
     '入口日志列有P-82，犬只信息吻合。拒绝原因仅为一般性禁止动物入内告示。'],
    ['Прошу пропустить меня к окну вместе с собакой-проводником и спросить, нужна ли мне помощь пройти к окну.',
     'Please let me go to the counter with my guide dog and ask whether I need help getting there.',
     '请让我带导盲犬到窗口，并先问我是否需要引导。']],
  'access-reading-choice': ['d2',
    ['В центре «Мои документы» мне дали лист с условиями, а мелкий шрифт я не различаю. Дочь готова ответить за меня, но я хочу сама понять весь текст.',
     'My Documents gave me a sheet of terms I can’t read in that small print. My daughter offered to answer for me, but I want to understand the complete text myself.',
     '“我的文件”中心给了我一张条款说明，字太小看不清。女儿愿意替我回答，但我想亲自了解全文。'],
    ['Кабинет К-2 свободен. Зафиксирован выбор посетительницы: прочитать документ целиком вслух в кабинете. Полномочий представителя у сопровождающей в деле нет.',
     'Room K-2 is free. The visitor chose to have the complete document read aloud there. The file records no authority for her companion to act as her representative.',
     'K-2室空闲。来访者选择在室内听取全文朗读。案卷未记载陪同人员有代理权限。'],
    ['Прочитайте мне документ целиком в отдельном кабинете. Когда услышу условия, сама решу, подписывать ли.',
     'Please read the whole document to me in a private room. Once I hear the terms I’ll decide whether to sign.',
     '请在单独房间读给我听全文。听完条款，我自己决定签不签。']],
  'access-written-dialogue': ['d2',
    ['Я ждала в зале с талоном А-16. Вызов по громкой связи я не слышу, а номера на табло не было. У окна сказали прийти с родственником.',
     'I waited in the hall with ticket A-16. I can’t hear the announcements and my number never appeared on the screen. The counter worker told me to return with a relative.',
     '我拿A-16号在大厅等候。我听不到广播，屏幕也没显示我的号码。窗口工作人员让我带亲属再来。'],
    ['А-16 вызван только голосом в секторе без работающей индикации. Планшет П-3 исправен; посетительница согласилась использовать его для конфиденциальной переписки у окна.',
     'A-16 was called only by voice in a section with no working display. Tablet P-3 works, and the visitor agreed to use it for private written communication at the counter.',
     '无可用显示屏的区域仅用广播叫了A-16。P-3平板正常，来访者同意用于窗口保密书面交流。'],
    ['Общайтесь со мной письменно на планшете, чтобы я смогла сама подать свои документы.',
     'Please communicate with me in writing on the tablet so I can submit my own papers.',
     '请用平板与我书面交流，让我亲自提交材料。']],
}, { authoritySources: ['https://md.mos.ru/'] });

add(['Материалы заявителя и журнала рассылки', 'Applicant’s exhibits and message log', '申请人材料及发送日志'], {
  'ads-channel-scope': ['d1',
    ['В магазине я разрешил присылать акции по электронной почте. Телефон оставил для связи по заказу, а на него пришло SMS с новыми товарами.',
     'I opted into promotional email at the shop. I gave my phone number for order updates, but got a text about new products.',
     '我只同意商家用电子邮件发促销。手机号用于订单联系，却收到推销新品的短信。'],
    ['В подписанном заявителем бланке есть отметка «электронная почта», канал «SMS» исключён. По журналу ушло SMS о новых товарах; отдельного согласия на него в комплекте нет.',
     'The applicant’s signed form selects email and excludes SMS. The log records a promotional text about new products, and the file contains no separate consent for it.',
     '申请人签署的表格选择电子邮件并排除短信。日志记载了新品推广短信，案卷中无另行同意。'],
    ['Проверьте, на каком основании магазин отправил рекламу на телефон, если я дал согласие только на письма.',
     'Please check what entitled the shop to send advertising to my phone when I only opted into email.',
     '我只同意收邮件，请核查商家依据什么向我发推广短信。']],
  'ads-consent': ['d0',
    ['Я оставил телефон при покупке, и вскоре посыпались сообщения со скидками. Я попросил прекратить рассылку. Мне кажется, номер передал магазин, но я видел только сообщения.',
     'I gave my number when I bought something and soon got a string of discount texts. I asked them to stop. I suspect the shop passed on my number, but all I’ve seen are the messages.',
     '我购物时留了电话，随后就收到一连串优惠短信。我提出停止发送。我怀疑是商家给的号码，但我只看到了短信。'],
    ['На снимках видны предложения скидок и отправленный отказ. По снимкам можно проверить содержание и последовательность переписки. Источник передачи номера и наличие предварительного согласия по ним установить нельзя.',
     'The screenshots show discount offers and the opt-out message. They document content and sequence; they do not establish where the number came from or whether prior consent was given.',
     '截图显示优惠推广及已发送的退订要求，可核对内容与顺序，无法据此认定号码来源或是否事先同意。'],
    ['Проверьте согласие на рассылку, законность использования моего номера и помогите прекратить рекламные сообщения.',
     'Please check consent and the use of my number, and help stop the promotional messages.',
     '请核查是否取得发送同意、号码是否被合法使用，并帮我停止广告短信。']],
  'ads-service-message': ['d0',
    ['Мне пришло SMS по заказу Z-18: оплаченное можно забирать. Я не давал согласия на рекламу и хочу разобраться именно с этой SMS.',
     'I got a text saying my paid order Z-18 is ready. I never opted into advertising, and this is the particular text I want to ask about.',
     '我收到短信说已付款的Z-18订单可领取。我没同意接收广告，想问的就是这条短信。'],
    ['Текст для покупателя Z-18: «Оплаченный заказ готов к выдаче. Пункт выдачи и часы работы указаны в заказе». Акций, купонов, рекламы товаров и рекламных ссылок в записи нет.',
     'Text to buyer Z-18: “Your paid order is ready for collection. The pickup point and its hours are in the order.” The record contains no promotions, coupons, product advertising or advertising links.',
     '给Z-18买家的短信：“您已付款的订单可领取。取件点和营业时间见订单。”记录没有促销、优惠券、商品广告或广告链接。'],
    ['Объясните, считается ли это конкретное уведомление рекламой.',
     'Please explain whether this particular notification counts as advertising.',
     '请说明这条具体通知是否属于广告。']],
  'ads-withdrawal-time': ['d0',
    ['При оформлении карты я подписала согласие на SMS с акциями. Я его отозвала, а в тот же день пришло новое рекламное сообщение. Мне сослались на старую подпись.',
     'I opted into promotional texts when I got my card. I withdrew consent and got another advertisement that day. They pointed to my earlier signature.',
     '办卡时我签字同意接收推广短信。撤回同意当天却又收到广告。他们只拿以前的签名说事。'],
    ['Получение требования прекратить рассылку подтверждено в 10:15. Новый рекламный выпуск отправлен в 14:20 того же дня. Это время отправки, а не задержанной доставки.',
     'Receipt of the opt-out request is confirmed at 10:15. A new promotional text was sent at 14:20 that day. That is the dispatch time, with delivery delay excluded.',
     '10:15确认收到停止发送的要求。同一天14:20发送新推广短信，该时间为发出时间，已排除延迟送达。'],
    ['Проверьте сообщение, отправленное после моего отказа, и помогите прекратить рассылку.',
     'Please check the message sent after I withdrew consent and help stop the texts.',
     '请核查撤回同意后发出的短信，并帮我停止发送。']],
});

add(['Журнал дежурного МФЦ', 'Public services centre duty log', '政务服务中心值班日志'], {
  'anonymous-danger': ['d0',
    ['Я дежурный в МФЦ. На стойке оставили лист о возможном опасном действии у ворот склада. Место и время указаны, но фамилии автора и адреса для ответа нет.',
     'I’m the duty officer at the public services centre. Someone left a sheet alleging a dangerous act at a warehouse gate. It gives a place and time, but no sender name or reply address.',
     '我是政务服务中心值班人员。柜台留下了一张纸，称仓库门口可能有危险行为。纸上有地点和时间，没有来件人姓氏或答复地址。'],
    ['Бумага поступила в приёмную МФЦ {{received}}. Сообщается о возможном опасном действии у ворот склада в вечернее время и приводятся сведения о предполагаемом участнике. Автор не установлен, заявление не проверено, отметка о регистрации отсутствует.',
     'The public services centre received the sheet on {{received}}. It describes a possible dangerous act at a warehouse gate in the evening and gives details of an alleged participant. The author is unknown, the allegation is unverified and the registration field is blank.',
     '政务服务中心于{{received}}收到纸质材料，称晚间仓库门口可能有危险行为，并提供据称参与者的信息。来件人不明，所述未经核实，登记栏为空。'],
    ['Мне нужно установить, какие сведения следует передать для проверки и что фиксировать при приёме листа.',
     'I need to establish what information to pass on for verification and what to record on intake.',
     '我需要确定应转交哪些信息供核查，以及接收时应记录什么。']],
});

add(['Выписка из реестра объектов надзора', 'Environmental supervision register extract', '环境监管对象名录摘录'], {
  'authority-contact': ['register',
    ['Я указал в письме, что предприятие с погрузочной площадкой находится в городе Москве. В приёмной предложили управление по Московской области. Письмо ещё не отправили дальше.',
     'I put the address of the facility with the loading yard in Moscow city. Reception suggested the Moscow Oblast directorate. The letter hasn’t been forwarded yet.',
     '我在信里写明有装货场的企业位于莫斯科市。接待处建议转给莫斯科州管理局。信还没有转出。'],
    ['Учётное поле «место объекта»: город Москва. Поле «уровень»: федеральный экологический надзор. В предложении о пересылке указаны Московская и Смоленская области. Непосредственная текущая опасность в материалах не подтверждена.',
     'Site field: Moscow city. Supervision level: federal. The proposed addressee covers Moscow Oblast and Smolensk Oblast. The material does not establish an immediate hazard.',
     '对象地点栏：莫斯科市。监管级别：联邦。拟转交辖区为莫斯科州及斯摩棱斯克州。材料未确认当前存在直接危险。'],
    ['Уточните по месту объекта, какое управление вправе проверить изложенное в письме.',
     'Please use the facility’s location to establish which office can examine my letter.',
     '请根据企业所在地确定哪个管理局有权核查来信。']],
});
storiesA['authority-contact'].authoritySources = ['https://rpn.gov.ru/regions/77/intro/', 'https://rpn.gov.ru/regions/67/contacts/'];

add(['Выписка из журнала подразделения ФССП', 'Bailiff service case log extract', '执行局案件日志摘录'], {
  'bailiff-copy-decision': ['d2',
    ['В подразделении приставов мне назвали номер П-73: постановление по моему ходатайству уже подписано. Копии у меня нет. По телефону предложили подождать ещё десять дней.', 'The bailiff office gave me number P-73: it has signed the decision on my application. I have no copy. On the phone they proposed another ten days.', '执行部门告诉我P-73号申请决定已签署。但我没拿到副本，电话里让我再等十天。'],
    ['Х-73 рассмотрено правомочным приставом. П-73: «подписано, не направлено». Доставленный П-72 относится к другой отправке. Повторное ходатайство журнал не фиксирует.', 'The competent bailiff decided Kh-73. P-73: signed, not sent. The delivery record for P-72 is a different dispatch. No fresh application is logged.', '有权执行员已处理Х-73。P-73标为“已签署、未发送”。P-72送达记录属另一份文书。没有新的申请登记。'],
    ['Прошу направить копию уже вынесенного П-73 и сообщить, когда её отправили.', 'Please send the existing P-73 decision and tell me when it was dispatched.', '请发送已经作出的P-73决定副本，并告诉我发送时间。']],
  'bailiff-specific-petition': ['d2',
    ['Я взыскатель по ИП-51. В подписанном Х-51 указала конкретный счёт должника и попросила пристава проверить его для исполнительных действий. Ответ пришёл только про тридцать дней.', 'I’m the claimant in IP-51. In signed application Kh-51 I identified a debtor account and asked the bailiff to check it for enforcement. I only got a thirty-day notice.', '我是ИП-51案的申请执行人。我在签名的Х-51里指明债务人的账户，请执行员为执行程序核查。却只收到三十天通知。'],
    ['Прежнее ходатайство Х-51 зарегистрировано Даниловским ОСП ГУ ФССП России по Москве. Дата вручения правомочному приставу указана отдельно от даты регистрации. Отметки о постановлении нет; исходящий ответ сообщает лишь общий срок.', 'Moscow’s Danilovsky Bailiff Office registered the earlier application Kh-51. The date it reached the competent bailiff is recorded separately from registration. No decision entry exists; the outgoing notice only gives a general deadline.', '莫斯科达尼洛夫斯基执行处登记之前的Х-51申请，交有权执行员的日期与登记日分开记录。无决定记录，发出信件仅说明一般期限。'],
    ['Рассмотрите просьбу об исполнительном действии и сообщите мне о принятом постановлении.', 'Please decide my request for an enforcement step and notify me of the ruling.', '请处理我提出的执行措施申请，并告知决定。']],
  'bailiff-subordination': ['d0',
    ['Я подал старшему приставу жалобу на бездействие по моему исполнительному производству. В приёмной мне сказали ждать тридцать дней. В суд пока только думаю обратиться.', 'I complained to the senior bailiff about inaction in my enforcement case. Reception told me to wait thirty days. Going to court is still just an idea.', '我已向上级执行员投诉执行案件中的不作为。接待处叫我等三十天。我目前只是在考虑去法院。'],
    ['Прежнюю жалобу в порядке подчинённости получил старший судебный пристав Даниловского ОСП ГУ ФССП России по Москве. Принятого судом заявления по этому предмету в деле нет. Приостановление не зафиксировано.', 'The senior bailiff of Moscow’s Danilovsky Bailiff Office received the earlier hierarchical complaint. There is no court-accepted application on the same issue and no recorded suspension.', '莫斯科达尼洛夫斯基执行处首席执行员收到之前的层级申诉。同一事项没有法院已受理的申请，也没有中止记录。'],
    ['Прошу сообщить порядок и срок рассмотрения жалобы старшим приставом и объяснить, что изменится при обращении в суд.', 'Tell me how and when the superior will consider my complaint and what would change if I went to court.', '请告知上级执行员的处理程序和期限，并解释去法院可能有什么变化。']],
  'bailiff-unsigned-complaint': ['d1',
    ['Я сдал в подразделение приставов три листа жалобы Ж-84. Фамилию напечатал, а ручкой не подписал. Теперь жалобу по существу не рассмотрят?', 'I handed the bailiff office three pages for complaint Zh-84. I typed my surname but forgot to sign it by hand. Will the arguments now go unexamined?', '我交给执行部门三页Ж-84号投诉，打印了姓氏，却忘了手写签名。现在就不审查理由了吗？'],
    ['Приняты три бумажных листа Ж-84. Производство, пристав и просьба указаны. Строка подписи пуста. Отдельной подписанной версии, доверенности или электронной подписи в деле нет.', 'Three paper pages of Zh-84 were received. The case, bailiff and request are identified. The signature line is empty. No signed version, authority to sign or electronic signature is on file.', '收到Ж-84三页纸质材料，写有案件、执行员及请求，签名栏为空。案卷没有另行签署的版本、授权或电子签名。'],
    ['Объясните, что указать и подписать, чтобы моя жалоба на пристава могла быть рассмотрена по существу.', 'Explain what to include and sign so the complaint about the bailiff can be heard on the merits.', '请告诉我应填写和签署什么，才能实质审查对执行员的投诉。']],
});

add(['Материалы осмотра спорного рекламного носителя', 'Inspection material for the disputed display', '争议展示载体检查材料'], {
  'beer-distance': ['d0',
    ['Отдельно стоящий щит рекламирует пиво. Владелец говорит, что до школы 180 метров и он больше ничего не должен проверять.', 'A freestanding billboard advertises beer. Its owner says it’s 180 metres from the school and there’s nothing else to check.', '独立户外广告牌推广啤酒。业主说离学校180米，所以不用再查。'],
    ['В листе осмотра: внешний отдельно стоящий щит, рекламируемый товар — пиво, расстояние до школы — 180 м. Обоснование владельца касается только расстояния.', 'Inspection sheet: outdoor freestanding billboard, product advertised is beer, school 180 m away. The owner’s explanation concerns distance alone.', '检查单：独立户外广告牌，宣传商品为啤酒，距学校180米。业主说明仅涉及距离。'],
    ['Проверьте и вид носителя: я хочу понять, разрешён ли именно такой щит.', 'Please check the type of display too. I want to know whether this billboard is allowed.', '请也核查载体类型。我想知道这种广告牌是否允许。']],
  'beer-online-agegate': ['d0',
    ['На странице магазина я увидел рекламу пива под пометкой 18+. Представитель сослался на эту отметку и предупреждение.', 'I saw a beer advertisement with an 18+ label on the shop’s website. The representative pointed to the label and warning.', '我在商家网站看到带18+标记的啤酒广告。代表只提到这个标记和警示。'],
    ['Снимок страницы подтверждает рекламу пива в интернете. Пометка 18+ и предупреждение видны. Приложенная справка о расстоянии до школы не описывает канал распространения.', 'The saved webpage documents online beer advertising. The 18+ label and warning are visible. An attached school-distance certificate does not describe the channel used.', '网页存档显示互联网啤酒广告，可见18+标记及警示。附带的学校距离证明不说明传播渠道。'],
    ['Прошу проверить интернет-размещение именно этой рекламы.', 'Please check the online placement of this advertisement.', '请核查这则广告在网上投放的情况。']],
  'beer-required-menu': ['d2',
    ['У стойки увидел пиво в списке цен И-6. В прошлом обращении я показывал плакат с акцией, а теперь спрашиваю про этот список.', 'I saw beer in price list I-6 at the counter. My previous submission had a promotional poster. This time I mean the price list.', '我在柜台的И-6价目表上看到啤酒。上次我反映的是促销海报，这次问的是价目表。'],
    ['На месте обслуживания размещён И-6: ассортимент и цены, одинаковое оформление строк, без скидок и рекламных призывов. Плакат из другого дела к И-6 не относится.', 'The service counter displays I-6: product range and prices, uniform rows and no discounts or promotional calls. The previous poster is separate.', '服务地点摆放И-6，列出品种与价格，各行格式一致，无折扣或宣传号召。以前的海报不属于本表。'],
    ['Разъясните, как оценить эту строку списка и есть ли основания считать её рекламой.', 'Explain how to assess this line and whether there is a basis to call it advertising.', '请说明如何判断这行内容，是否有依据认定为广告。']],
  'beer-warning-area': ['d1',
    ['На плакате Р-10 внутри магазина я увидела предупреждение о вреде и крупное 18+. Мне сказали сложить площади двух надписей.', 'Inside the shop I saw a health warning and a large 18+ on poster R-10. I was told to add up the space covered by both.', '我在店内Р-10海报上看到危害警示和很大的18+。有人叫我把两块面积相加。'],
    ['Замер Р-10: реклама 1000 см², собственно предупреждение 50 см², отдельная маркировка 18+ ещё 100 см². Протокол другого плаката к Р-10 не приложен как замер этого носителя.', 'R-10 measurements: ad 1,000 cm², warning itself 50 cm², separate 18+ mark another 100 cm². The other poster’s measurements do not identify R-10.', 'Р-10实测：广告1000平方厘米，警示本身50，独立18+标识另占100。另一张海报的测量不是Р-10。'],
    ['Проверьте площадь именно предупреждения на Р-10 и объясните, достаточно ли её.', 'Please check the area of the health warning itself on R-10 and explain whether it is sufficient.', '请核查Р-10上警示文字本身的面积，并说明是否足够。']],
});

add(['Материалы к запросу муниципального бюджета на 2026 год', 'Municipal budget request file for 2026', '2026年市辖区预算申请材料'], {
  'budget-link': ['web',
    ['Я попросил принятое решение о бюджете с двумя приложениями. По ссылке на главную страницу вижу анонс заседания и старый проект. Где сами файлы?', 'I requested the adopted budget decision and its two annexes. The homepage link shows a meeting notice and an older draft. Where are the actual files?', '我申请查阅已通过的预算决定和两份附件。首页链接里只有会议预告和旧草案。文件到底在哪？'],
    ['Копия страницы сайта: опубликованы анонс и проект. По описи у органа имеются принятое решение и приложения 1 и 2; их нет на показанной странице.', 'Website page capture: meeting notice and draft only. The holder’s inventory lists the adopted decision and annexes 1 and 2, absent from the displayed page.', '模拟页面只公布会议预告和草案。保管机关目录列有通过的决定及附件1、2，所示页面无这些文件。'],
    ['Прошу прислать решение и приложения или указать, где именно доступны все три файла.', 'Send the decision and annexes or give their precise location if all three are available.', '请发来决定和附件，或指出三份文件的确切可查位置。']],
  'budget-misdirected': ['request',
    ['Я адресовал запрос в управу Нижегородского района. Мне ответили, что решение о бюджете муниципального округа готовили не у них.', 'I addressed the request to the Nizhegorodsky district administration. They replied that they didn’t prepare the municipal district budget decision.', '我把申请寄给下诺夫哥罗德区行政机关。他们答复说市辖区预算决定不是他们制定的。'],
    ['Входящий адресат — управа Нижегородского района. В тексте запрошены уже принятое решение муниципального округа на 2026 год и приложения. Приложенный проект не имеет отметки о принятии.', 'Recipient field: Nizhegorodsky district administration. The request is for the already adopted 2026 municipal budget decision and annexes. The attached draft bears no adoption notation.', '收件人为下诺夫哥罗德区行政机关。申请的是已通过的2026年度市辖区预算决定及附件。所附草案无通过记录。'],
    ['Прошу найти орган, который хранит принятое решение, и сообщить, куда будет передан запрос.', 'Please identify who holds the adopted decision and tell me where my request will go.', '请查明保管已通过决定的机关，并告诉我申请将转给哪里。']],
  'budget-partial': ['inventory',
    ['Я попросил расходы по мероприятиям. В ответе написали, что ведомость целиком закрыта из-за телефонов и счетов. Мне нужны суммы и виды работ.', 'I asked for spending by activity. The reply said the entire schedule was closed because of phone numbers and accounts. I need the amounts and types of work.', '我申请按项目查看支出，答复称清单含电话和账号，所以全表不公开。我只需要金额和工作种类。'],
    ['Опись ведомости: общая сумма, мероприятие и вид работ — открытые поля. Телефоны и счета физических лиц учтены в отдельных закрытых полях. Ответ не оценил возможность предоставить открытую часть.', 'Schedule inventory: total, activity and category of work are public fields. Private phone and bank details are in separate restricted fields. The reply did not assess access to the public portion.', '清单目录：总额、项目、工作种类为公开字段。个人电话和账号在单独受限字段内。答复未评估能否提供公开部分。'],
    ['Прошу предоставить открытые строки о расходах без личных реквизитов и объяснить основание остальных ограничений.', 'Please provide the public spending entries with private details removed and explain the basis of any remaining restrictions.', '请提供去除个人信息的公开支出条目，并说明其余限制的依据。']],
  'budget-published': ['inventory',
    ['Я подал электронный запрос на решение о бюджете и приложения 1 и 2. Сосед уверяет, что мне обязательно должны выслать заверенные сканы.', 'I asked electronically for the budget decision and annexes 1 and 2. My neighbour insists I must be sent certified scans.', '我在线申请查阅预算决定和附件1、2。邻居坚持说必须给我寄认证扫描件。'],
    ['В контрольной выборке раздела «Бюджет 2026» проверены три файла. Дата, номер и редакция решения совпадают с описью; обе ссылки на приложения открываются без входа. Заверение в запросе не указано.', 'The three files in the simulated Budget 2026 section were checked. The decision’s date, number and version match the inventory; both annex links open without login. The request did not ask for certification.', '已核对模拟“2026预算”栏目三份文件。决定的日期、编号和版本与目录相符，两个附件无需登录即可打开。申请未要求认证。'],
    ['Покажите, где открыть именно действующее решение и оба приложения.', 'Show me where I can open the decision in force and both annexes.', '请告诉我在哪里打开现行决定和两个附件。']],
  'budget': ['request',
    ['На сайте вижу проект бюджета муниципального округа Нижегородский в Москве. Мне нужны принятое решение на 2026 год, приложения и опубликованные материалы обсуждения.', 'I see a draft budget for the Nizhegorodsky municipal district online. I need the adopted 2026 decision, its annexes and the published discussion materials.', '网站上有下诺夫哥罗德市辖区预算草案。我需要已通过的2026年决定、附件和已公开的讨论材料。'],
    ['Входящий запрос перечисляет решение, приложения и опубликованные материалы обсуждения. Найденный файл озаглавлен «Проект» и не содержит отметку о принятии. Аналитическая справка не запрошена.', 'The request lists the decision, annexes and published discussion materials. The located file is titled Draft and has no adoption notation. No new analysis is requested.', '来件列明决定、附件和已公开的讨论材料。找到的文件标题是“草案”，无通过标记。申请没有要求新作分析。'],
    ['Прошу помочь получить документы в действующей редакции и пояснить, нужно ли мне обосновывать интерес к ним.', 'Help me get the current documents and explain whether I need to say why I want them.', '请帮我取得现行文件，并说明是否要解释申请理由。']],
});

add(['Служебные материалы по распределению обращений', 'Internal appeal assignment material', '诉求分派内部材料'], {
  'conflict-creditor': ['d2',
    ['Мне поручили проект по заявлению организации О-17. Она ещё не вернула мне личный заём. Родственников там нет, поэтому не понимаю, влияет ли долг на мою работу.', 'I was assigned a draft decision on O-17’s submission. It still owes me a personal loan. I have no relatives there, so I’m unsure whether the debt matters.', '我负责起草处理O-17号机构来件。该机构尚未归还我个人借款。我没有亲属在那里，不清楚债务是否影响履职。'],
    ['О-17 остаётся должником исполнителя. Благоприятный исход по рассматриваемому заявлению способен улучшить возможность возврата займа. Решение ещё в проекте.', 'O-17 remains indebted to the case officer. A favourable result on the pending submission could make repayment easier. The decision is still in draft.', 'O-17仍欠经办人员借款。该来件获得有利结果可能使还款更容易。决定尚处于草拟阶段。'],
    ['Мне нужно сообщить о займе и выяснить, кто сможет законно и беспристрастно подготовить решение.', 'I need to report the loan and find out who can prepare the decision impartially and lawfully.', '我需要报告借款情况，并确定谁能依法公正地起草决定。']],
  'conflict-namesake': ['d2',
    ['Я А. Соколов, мне поручен ответ Б. Соколову. Коллега увидел нашу фамилию и предложил отвод. Мы познакомились только по этому делу.', 'I’m A. Sokolov and I’m drafting a reply to B. Sokolov. A colleague saw the surname and suggested recusal. We met through this file.', '我是A.索科洛夫，负责给B.索科洛夫起草答复。同事见我们同姓便建议回避。我们因本案才认识。'],
    ['Карточка содержит одну и ту же фамилию. Связей по родству, совместным организациям или обязательствам материалы не показывают. В обосновании коллеги указана только фамилия.', 'The records show the same surname. The material shows no family, shared organisation or obligation. The colleague’s reasoning cites the surname alone.', '记录显示姓氏相同。材料未显示亲属、共同机构或债权债务联系。同事理由仅为同姓。'],
    ['Прошу оценить имеющиеся сведения и сказать, нужно ли менять исполнителя.', 'Please assess the facts on file and tell me whether the assignment should change.', '请评估现有材料，说明是否需要换经办人。']],
  'conflict-reassignment': ['d2',
    ['Руководитель отвёл меня от дела Д-41 и назначил С-2. С-2 попросил меня написать выводы в личном файле и собирается подписать их сам.', 'The manager removed me from file D-41 and assigned S-2. S-2 asked me to write the conclusions off the official route and plans to sign them himself.', '负责人让我回避Д-41案，改派S-2。S-2让我在公务流程外写结论，并打算自己签署。'],
    ['В карточке Д-41 исполнителем указан С-2. Выводы в полученном вне маршрута файле составил отведённый С-1. Исходный срок сохранён.', 'D-41 lists S-2. The conclusions in the off-route file were written by recused officer S-1. The original deadline remains.', 'Д-41登记的经办人是S-2。流程外收到的结论文件由已回避的S-1撰写。原期限仍然有效。'],
    ['Хочу передать исходные бумаги и исключить своё участие в выводах. Как зафиксировать дальнейшие действия?', 'I want to hand over the original papers and leave the conclusions to the assigned officer. How do we record that?', '我想移交原始材料，不再参与结论。后续如何留痕？']],
  'conflict-relative': ['d0',
    ['Я обратился в Департамент ЖКХ Москвы с вопросом о действиях ООО «Городской мастер» по ремонту моей прихожей. У меня договор на 120 000 рублей и ответ компании, что вопрос принят.', 'I asked the Moscow Department of Housing and Communal Services to look into Gorodskoy Master LLC’s conduct concerning my hall renovation. I have the 120,000 rouble contract and the company’s acknowledgment.', '我请莫斯科市住房和公用事业局了解“城市工匠”有限责任公司装修门厅的履约行为。我有12万卢布的合同和公司已受理问题的回信。'],
    ['Карточка приёма Департамента ЖКХ Москвы: договор на ремонт прихожей и переписка приложены. Прежний вопрос дошёл до исполнителя этого подразделения; проверяется распределение обращения внутри Департамента. Совладелец и руководитель ООО — близкий родственник назначенного госслужащего. Решение по обращению ещё не принято. Цена договора сама по себе не является заявленной суммой требования.', 'Moscow Department of Housing and Communal Services intake record: hall-renovation contract and correspondence attached. The prior question reached a case officer there. The file concerns impartial allocation of the submission within the department. The LLC’s manager and co-owner is a close relative of the assigned civil servant. No decision on the submission exists yet. The contract price does not itself state a monetary claim.', '莫斯科市住房和公用事业局收件记录附门厅装修合同和通信。该局工作人员已接到先前事项，本案涉及该局内部公正分派经办人员。公司负责人兼共同所有人是经办公务员的近亲属。来件尚未作决定。合同价本身不等于请求金额。'],
    ['Прошу беспристрастно рассмотреть договор и ответить по моему вопросу о выполнении работ.', 'Please review the contract impartially and answer my question about the work.', '请公正审查合同，并答复我关于施工的问题。']],
});

add(['Материалы суда и карточка поступления в администрацию', 'Court papers and administration receipt record', '法院材料及行政机关收件卡'], {
  'court-cancel': ['d0',
    ['Я отправил в администрацию копию судебного акта. Хочу, чтобы она его отменила и сказала, можно ли прекратить исполнение.', 'I sent the administration a copy of a court ruling. I want it set aside and want to know whether enforcement can stop.', '我给行政机关寄了裁判副本，想让他们撤销并告诉我能否停止执行。'],
    ['Аппарат Мэра и Правительства Москвы ведёт переписку по этому письму. Просьба одна: отменить приложенный судебный акт. Его процессуальный вид и стадия материалами не установлены.', 'The Office of the Mayor and Government of Moscow handles correspondence on this letter. Its sole request is to set aside the attached court ruling. Its procedural type and stage are not established.', '莫斯科市长和市政府办公厅负责此信的往来手续。唯一请求是撤销所附裁判。材料未确定裁判程序类型或阶段。'],
    ['Прошу объяснить, куда обращаться по поводу судебного акта и что означает регистрация моего письма.', 'Explain where to raise the court ruling and what registering my letter actually means.', '请说明应向哪里处理裁判异议，以及登记我的信意味着什么。']],
  'court-installments': ['d2',
    ['Мне присудили выплату по гражданскому спору. Решение вступило в силу, а доход упал. В муниципальной приёмной я попросила разрешить платить ежемесячно.', 'A civil judgment ordered me to pay. It is in force, but my income fell. I asked municipal reception to let me pay monthly.', '民事判决要求我付款，已经生效，但我的收入下降了。我向市接待处申请按月付款。'],
    ['Мария приложила данные о временном снижении дохода и предложенный месячный график. Судебного определения о рассрочке и распоряжения приставу в приёмной нет.', 'Maria included evidence of temporary income loss and a proposed monthly schedule. Reception has no court order on instalments and no instruction to the bailiff.', '玛丽亚附有暂时收入下降的材料和建议月付方案。接待处没有法院分期裁定，也没有给执行员的指令。'],
    ['Хочу узнать, кто рассмотрит мой график и какие бумаги понадобятся для рассрочки.', 'I want to know who can consider my schedule and what papers I need to request instalments.', '我想知道谁能审查付款方案，申请分期需要什么材料。']],
  'court-order-objections': ['d0',
    ['Получил приказ мирового судьи СП-41. Я спорю со взысканием и отнёс письмо в администрацию. Там дали талон. Его можно считать подачей возражений судье?', 'I received judge’s order SP-41, dispute the collection and took a letter to the administration. They gave me a receipt. Does that count as filing an objection with the judge?', '我收到治安法官СП-41号支付令，不同意追偿，就把信交给行政机关并拿了回执。这算向法官提异议吗？'],
    ['Талон подтверждает прежний приём письма администрацией. Возражения по СП-41 судом не получены. Срок для своевременной подачи по условиям дела пока открыт.', 'The receipt confirms the administration’s earlier intake only. The court has not received objections to SP-41. The period for timely submission remains open in this scenario.', '回执仅证明行政机关先前收件。法院尚未收到СП-41异议。按题设，及时提交的期限尚未届满。'],
    ['Объясните, куда подать возражения по приказу, пока ещё есть время.', 'Explain where to send objections to the order while there is still time.', '请在期限尚未届满时告诉我该向哪里提交支付令异议。']],
  'court-typo-not-merits': ['d1',
    ['Районный суд один раз написал «Соловёв» вместо «Соловьёв» в решении о взыскании. Паспортные данные мои. Знакомый говорит, что из-за буквы решение отменят.', 'The district court once wrote “Solovëv” instead of “Solovʹëv” in its debt judgment. The passport details are mine. An acquaintance says that letter voids the judgment.', '区法院在追偿判决中有一处把“Соловьёв”写成“Соловёв”。护照资料是我的。熟人说少一个字母就会撤销判决。'],
    ['Вводная часть решения и документы устанавливают одного должника. Расхождение только в букве фамилии в одной строке. Сумма совпадает, определения об исправлении или отмене нет.', 'The judgment heading and supporting papers identify one debtor. One line has a spelling difference, with the same award amount throughout. No correction or reversal order is on file.', '判决开头及案卷确认同一债务人。一行姓氏写法不同，金额一致。无更正或撤销裁定。'],
    ['Прошу объяснить, куда подать заявление об исправлении фамилии и что будет с суммой взыскания.', 'Tell me where to ask for the spelling correction and what happens to the amount owed.', '请说明向哪里申请更正姓氏，以及应付金额会怎样。']],
});
add(['График и учёт рабочего времени перевозчика', 'Carrier’s schedule and working-time records', '承运企业排班及工时记录'], {
  'driver-planned-extension': ['d1',
    ['У нас в автобусном парке в графике Г-11 заранее поставили одиннадцать часов за рулём. Последние два назвали доездом до стоянки.', 'Our bus depot put eleven hours of driving in schedule G-11 ahead of time. They called the final two hours driving to the parking area.', '公交车队的Г-11排班提前安排驾驶11小时，最后两小时称为开往停车场。'],
    ['Г-11: 9 часов основной работы за рулём и 2 часа обязательного доезда в нескольких сменах. Оба блока внесены заранее. В обосновании указан только пункт 9 приказа № 160.', 'G-11 lists nine regular driving hours plus two mandatory driving hours across several shifts. Both are scheduled in advance. Management cites only paragraph 9 of Order 160.', 'Г-11数次班次排定9小时常规驾驶和2小时必须驾驶，均事先安排。制定方仅援引第160号命令第9点。'],
    ['Проверьте запланированные часы управления и объясните, можно ли добавлять два часа в график заранее.', 'Please examine the scheduled driving hours and explain whether the two hours can be added in advance.', '请核查计划驾驶时数，并说明能否预先排入额外两小时。']],
  'driver-shifts': ['d0',
    ['С утра до вечера на линии был автобус с одним и тем же номером. Я сообщил номер и маршрут. Как узнать, менялся ли водитель?', 'The same numbered bus was on the route from morning to evening. I reported the bus and route. How do I find out if drivers changed?', '同一编号的公交车从早跑到晚。我报告了车辆号和线路。怎么知道有没有换驾驶员？'],
    ['Сменная ведомость относит нужную машину и маршрут к двум водителям. Непрерывную работу одного водителя ведомость не подтверждает. Для проверки нужны записи именно за указанный день.', 'The roster assigns the identified vehicle and route to two drivers. It does not establish uninterrupted work by one driver. Logs for the specified day are needed.', '排班表显示该车该线路安排两名驾驶员，不能证明一人连续工作。核查需指定日期的记录。'],
    ['Прошу проверить фактические смены по этому автобусу и дню.', 'Please check the actual shifts for this vehicle on that day.', '请核查该车辆当天的实际换班。']],
  'driver-split-break': ['d1',
    ['В российском междугороднем рейсе я видел два перерыва: сначала пятнадцать, потом тридцать минут. Одного длинного перерыва не было.', 'On a domestic intercity run I saw two breaks, fifteen and then thirty minutes. There was no single long break.', '我在俄罗斯国内城际班次看到两段休息，先15分钟，再30分钟，没有一段长休息。'],
    ['Запись рейса: 2:15 за рулём, 0:15 специальный перерыв, ещё 2:15 за рулём, 0:30 перерыв. В обоих промежутках водитель свободен от посадки, ремонта и иной работы.', 'Trip log: 2 h 15 driving, 15-minute special break, another 2 h 15 driving, then 30-minute break. Both periods were free of boarding, maintenance or other duties.', '行车日志：驾驶2小时15分，专项休息15分，再驾驶2小时15分，再休息30分。两个休息时段均无乘客上车、维修或其他任务。'],
    ['Уточните, можно ли для этого рейса учитывать обе части перерыва.', 'Please explain whether both parts count for this run.', '请说明该班次的两段休息是否可以计入。']],
  'driver-waiting-work': ['d2',
    ['Я Сергей, водитель. На конечной два часа ждал посадки, оставался у автобуса и слушал диспетчера. В табеле это назвали отдыхом.', 'I’m Sergey, the driver. I waited at the terminus for two hours, stayed with the bus and took dispatch instructions. They put it down as rest.', '我是驾驶员谢尔盖。终点站等候上客两小时，我留在车边听调度指示。工时表却记为休息。'],
    ['Табель Сергея: 4 часа управления, 2 часа ожидания посадки на рабочем месте. Во время ожидания водитель обязан готовить посадку и выполнять указания диспетчера.', 'Sergey’s record: four driving hours and two hours at the workstation waiting for boarding. During the latter he must prepare boarding and follow dispatch instructions.', '谢尔盖的工时记录为驾驶4小时、在岗候客2小时。等候时须准备上客并执行调度指示。'],
    ['Прошу проверить, как учитывать эти два часа ожидания посадки.', 'Please check how those two hours waiting for passengers should be counted.', '请核查这两小时候客时间应如何计入。']],
});

add(['Договор и реестровая выписка в материалах приёма', 'Education contract and register extract in the intake file', '收件案卷内的教育合同与名录摘录'], {
  'education-accreditation-scope': ['d2',
    ['Поступаю на бакалавриат 38.03.04. Вуз сказал, что все программы аккредитованы, но показал запись 09.03.03.', 'I’m applying for bachelor’s course 38.03.04. The university claimed all courses were accredited, but showed entry 09.03.03.', '我申请38.03.04本科。学校称所有专业都获认证，出示的却是09.03.03条目。'],
    ['В выписке указан этот вуз, аккредитационная запись только 09.03.03. Подтверждение для 38.03.04 не найдено. Лицензионные условия реализации отдельно подтверждены.', 'The extract identifies the university and lists accreditation only for 09.03.03. It does not confirm 38.03.04. Licensing for delivery is independently confirmed.', '摘录所列学校相同，认证条目仅为09.03.03。未找到38.03.04的认证证明。开设课程的许可条件另有确认。'],
    ['Прошу проверить аккредитацию именно 38.03.04.', 'Please verify accreditation specifically for 38.03.04.', '请核查38.03.04这一专业的认证。']],
  'education-dpo-accreditation': ['d2',
    ['Центр Ц-21 предлагает повышение квалификации с удостоверением. В поиске аккредитации этой программы нет. Хочу проверить, могу ли я поступать.', 'Centre Ts-21 offers a continuing professional development course with a certificate. I couldn’t find accreditation in the search and want to check before enrolling.', 'Ц-21中心提供结业可获证的继续职业培训。我查不到该课程认证，想在报名之前核实。'],
    ['Лицензионная запись Ц-21 действительна для указанного подвида дополнительного профессионального образования. Предлагается повышение квалификации. Выписка об аккредитации чужого бакалавриата к договору не относится.', 'Ts-21 has a valid licence for the relevant category of further professional education. The offer is continuing training. Another provider’s bachelor’s accreditation is immaterial to this contract.', 'Ц-21具备相应类别的继续职业教育有效许可。提供的是进修培训。另一机构的本科认证与本合同无关。'],
    ['Поясните, какие сведения о праве Ц-21 вести этот курс мне проверить до оплаты.', 'Explain what to check about Ts-21’s authority to run this particular course before I pay.', '请说明付款前应核查Ц-21开设该课程的哪些资质。']],
  'education-provider-identity': ['d1',
    ['Я выбрал курс «Вектор знаний». По договору обучает и получает оплату ООО «Вектор-Практика» из Обнинска (У-2), а лицензия оформлена на ООО «Вектор-Учёба» из Калуги (У-1).', 'I chose a Vector of Knowledge course. The contract and payment name Vector-Praktika LLC in Obninsk (U-2), but the licence is for Vector-Uchyoba LLC in Kaluga (U-1).', '我选了“知识向量”课程。合同中的授课及收款方是奥布宁斯克的“向量实践”公司（У-2），而许可证属于卡卢加的“向量学习”公司（У-1）。'],
    ['Договор: ООО «Вектор-Практика», Обнинск (У-2) — исполнитель и получатель оплаты. Лицензионная выписка выдана ООО «Вектор-Учёба», Калуга (У-1). Общий бренд «Вектор знаний» есть на обоих документах. В комплекте нет подтверждения отдельной лицензии или иной законной формы участия У-2 в программе.', 'Contract: Vector-Praktika LLC, Obninsk (U-2), delivers the course and receives payment. The licence extract identifies Vector-Uchyoba LLC, Kaluga (U-1). Both use the Vector of Knowledge brand. The file gives no evidence of a licence or other lawful arrangement for U-2 to deliver the programme.', '合同列奥布宁斯克的“向量实践”公司（У-2）为教学和收款方，许可摘录属于卡卢加的“向量学习”公司（У-1）。两者都用“知识向量”品牌。材料没有证明У-2持有许可或以其他合法方式参与该课程。'],
    ['Проверьте право исполнителя из моего договора оказывать эту услугу.', 'Please verify whether the provider in my contract can deliver the service.', '请核查合同中的服务方是否有权提供该课程。']],
  'education-register': ['d0',
    ['В договоре калужский центр «Открытый практикум» (УЧ-01). На сайте под общей маркой вижу лицензию обнинского центра «Открытые курсы» (УЧ-02). По поиску аккредитации УЧ-01 ничего нет.', 'My contract names Open Workshop in Kaluga (Uch-01). The shared website shows a licence for Open Courses in Obninsk (Uch-02). I found no accreditation result for Uch-01.', '合同写的是卡卢加“开放实训”中心（УЧ-01）。共同品牌的网站只有奥布宁斯克“开放课程”中心（УЧ-02）的许可。搜索УЧ-01未查到认证结果。'],
    ['Сверка договора и выписки: УЧ-01 и УЧ-02 различаются. Поиск проводили по аккредитации; вывода о лицензии самого УЧ-01 материалы не дают.', 'The contract and extract identify different entities, Uch-01 and Uch-02. The search was for accreditation; the evidence does not determine Uch-01’s licensing.', '合同及摘录所列УЧ-01和УЧ-02不是同一机构。查询的是认证，材料无法确定УЧ-01本身的许可。'],
    ['Помогите проверить лицензию именно УЧ-01 и понять, какие сведения нужны по моей программе.', 'Help me check Uch-01’s licence and establish which records matter for my course.', '请帮我核查УЧ-01本身的许可，并说明该课程需要核对哪些记录。']],
});

add(['Кадастровые документы в приёмной', 'Cadastral documents at reception', '接待处地籍材料'], {
  'egrn-letter': ['d0',
    ['Я получила выписку ЕГРН с одной неверной буквой в фамилии. В документе, по которому внесли запись, фамилия правильная. Мне предложили ждать месяц.', 'My property register extract has one wrong letter in my surname. The source document spells it correctly. I was told to wait a month.', '不动产登记摘录中我的姓有一个字母错了，登记依据文件写得正确。有人叫我等一个月。'],
    ['Управление Росреестра по Москве получило отдельное заявление об исправлении. Фамилия в исходном документе и удостоверении личности совпадает, отличается только запись ЕГРН. Спора о праве нет.', 'The Moscow Rosreestr office received the separate correction application. The source and identity documents match. Only the register entry differs. No dispute over ownership is on file.', '莫斯科市登记局收到另行提交的更正申请。来源文件和身份证件姓氏一致，只有登记条目不同。无权利争议。'],
    ['Прошу исправить букву в записи и пояснить, когда я смогу получить исправленную выписку.', 'Please correct the letter and tell me when I can get the corrected extract.', '请更正登记中的字母，并告知何时能取得更正后的摘录。']],
  'egrn-map-layer': ['d2',
    ['На слое С-2 дом на экране выглядит сдвинутым. При переключении на С-1 контур снова на месте. Я хочу узнать, менялась ли запись по участку У-11.', 'On map layer S-2 the house looks shifted. On S-1 its outline is back in place. I want to know whether the record for plot U-11 changed.', 'S-2图层上房子看起来偏移，切换到S-1就恢复。我想知道У-11地块登记是否改变。'],
    ['Таблицы координат У-11 в выписке и контрольной выгрузке совпадают. Смещение видно только на С-2; старая распечатка У-12 относится к другому участку.', 'U-11 coordinate tables match in the extract and control export. The apparent shift is confined to S-2. The older printout for U-12 is a different plot.', 'У-11的摘录与核查导出坐标表一致。偏移仅在S-2可见。旧打印件У-12是另一地块。'],
    ['Прошу проверить отображение слоя и объяснить, есть ли основания менять координаты в реестре.', 'Please check the map display and explain whether there is any reason to change the register coordinates.', '请核查图层显示，并说明是否有理由改动登记坐标。']],
  'egrn-rights-dispute': ['d1',
    ['Я попросил перенести границу З-7 как опечатку. Сосед возразил. У меня только проект заявления в суд.', 'I asked for the boundary of Z-7 to be moved as a typo. The neighbour objected. I have only a draft court application.', '我申请按笔误更改З-7边界，邻居反对。我手里只有法院申请草稿。'],
    ['Перенос З-7 затрагивает интересы соседнего правообладателя, полагавшегося на ЕГРН. Возражение касается именно этого участка. Судебного решения нет.', 'The move of Z-7 affects the neighbouring titleholder who relied on the register. Their objection concerns this plot. There is no court decision.', '移动З-7涉及信赖登记信息的相邻权利人利益。其异议针对本地块。没有法院决定。'],
    ['Объясните, как решать вопрос с границей при возражении соседа.', 'Explain how to resolve the boundary issue given my neighbour’s objection.', '请说明邻居有异议时如何处理边界问题。']],
  'egrn-source-plan': ['d0',
    ['В ЕГРН у моего помещения номер 18 вместо 81. Принёс исправленный план. В приёмной сказали, что всякая ошибка исправляется за три дня.', 'My property register shows room 18 instead of 81. I brought a corrected plan. Reception said every error takes three days.', '登记把我的房间81写成18。我带来了更正图纸。接待处说所有错误都三天改好。'],
    ['В исходном ТП-41 записано 18, в ЕГРН воспроизведено 18. Надлежащий исправленный план с номером 81 и полный комплект приняты Управлением Росреестра по Москве по прежнему заявлению.', 'The original TP-41 lists 18, and the register copied 18. The corrected plan showing 81 and its complete supporting papers reached the Moscow Rosreestr office under the earlier application.', '原ТП-41写18，登记照录18。载明81的合规更正图纸与完整支持材料已由莫斯科市登记局在之前的申请中收到。'],
    ['Уточните вид ошибки и когда запись можно исправить по принятому плану.', 'Please identify the error type and when the entry can be corrected using the accepted plan.', '请说明错误类型及可依据已收图纸更正的时间。']],
});

add(['Квитанции и карточки официальной электронной приёмной', 'Receipts and records of the official electronic reception service', '官方电子接待回执及登记记录'], {
  'electronic-draft-only': ['d2',
    ['Я написал текст в личном кабинете и оставил как черновик. Когда нажал «Отправить», пришла квитанция О-381. Можно считать срок от черновика?', 'I wrote my message in the portal and left it as a draft. When I pressed Send, receipt O-381 arrived. Does the clock run from the draft?', '我在个人账户写了内容，存成草稿。点发送后收到О-381回执。能从草稿日算起吗？'],
    ['О-381: «доставлено» в электронную приёмную Аппарата Мэра и Правительства Москвы. В более ранней строке стоит «не отправлен». До подтверждения доставки входящего материала у получателя нет.', 'O-381 records delivery to the electronic reception service of the Office of the Mayor and Government of Moscow. The earlier row says unsent. The recipient had no submission before delivery confirmation.', 'О-381记录送达莫斯科市长和市政府办公厅电子接待。较早一行是“未发送”。送达确认前接收方没有来件。'],
    ['Прошу объяснить, какое событие подтверждает поступление О-381.', 'Please explain what confirms receipt of O-381.', '请说明什么事件证明О-381已收到。']],
  'electronic-email': ['d0',
    ['Сначала я отправил вопрос на общий email. Потом вошёл в официальную приёмную с подтверждением личности и получил квитанцию. Какую дату брать?', 'I emailed a general inbox first. Then I verified my identity in official reception and got a receipt. Which date counts?', '我先发到通用邮箱，后来通过验明身份的官方接待提交并收到回执。应以哪天为准？'],
    ['Карточка электронной приёмной Аппарата Мэра и Правительства Москвы подтверждает получение через идентифицированный сервис. Ранний email относится к ящику для общих организационных вопросов; квитанции надлежащего поступления по нему нет.', 'The Office of the Mayor and Government of Moscow records receipt through the identity-verified service. The earlier email was sent to a general organisational mailbox with no valid receipt for the appeal.', '莫斯科市长和市政府办公厅记录了经身份核验服务收到的来件。之前的邮件发到通用事务邮箱，无正式收件回执。'],
    ['Прошу назвать дату поступления моего обращения через официальный сервис.', 'Please tell me when my submission arrived through the official service.', '请告知我的来件通过官方服务送达的日期。']],
  'electronic-optional-attachment': ['d1',
    ['Я описал в электронном письме, что сломалось и где. Фото photo.jpg не открывается, и мне предложили удалить письмо целиком.', 'My electronic submission says what broke and where. The photo.jpg file won’t open, and they suggested deleting the whole message.', '我在电子来件里写清了哪里什么东西坏了。photo.jpg打不开，工作人员建议删掉整封信。'],
    ['Основной текст читается: объект, место, наблюдение и конкретная просьба приведены. Поступление подтверждено. Не открывается дополнительный photo.jpg.', 'The body is readable and identifies the object, place, observation and request. Receipt is confirmed. The supplementary photo.jpg cannot be opened.', '正文可读，写有对象、地点、观察与请求。已确认收件。打不开的是附加photo.jpg。'],
    ['Прошу рассмотреть то, что есть в тексте, и уточнить, нужно ли дослать фото.', 'Please handle what is in the text and tell me whether to resend the photograph.', '请处理正文能够说明的问题，并告知是否需要补发照片。']],
  'electronic-receipt-not-result': ['d2',
    ['По Е-72 пришло «Ваше обращение доставлено». Я подумала, что мою просьбу уже удовлетворили, но в личном кабинете решения не вижу.', 'E-72 says my submission was delivered. I thought the request had been granted, but there is no decision in my account.', 'Е-72显示来件已送达。我以为请求已获准，但个人账户没有决定。'],
    ['Квитанция Е-72 из электронной приёмной Аппарата Мэра и Правительства Москвы подтверждает доставку и идентификацию отправителя. В показанном состоянии решения нет, материал ожидает регистрации.', 'E-72 from the Office of the Mayor and Government of Moscow confirms delivery and sender identification. At the recorded stage no decision exists, and registration is pending.', '莫斯科市长和市政府办公厅Е-72确认送达及来件人身份。当前无决定，材料尚待登记。'],
    ['Объясните, что означает квитанция Е-72 и как я узнаю итог рассмотрения.', 'Explain what E-72 confirms and how I will hear the outcome.', '请说明Е-72回执证明什么，我如何得知结果。']],
});

add(['Журнал осмотра путей эвакуации', 'Evacuation route inspection log', '疏散路线检查日志'], {
  'fire-corridor-blocked': ['d1',
    ['Ручку на двери Э-3 заменили, но коридор К-3 заставлен тележками и коробками. Владелец показал только акт о двери.', 'They replaced the handle on E-3, but carts and boxes still obstruct corridor K-3. The owner showed me only the door report.', 'E-3门把手换了，但K-3走廊仍被推车和箱子堵塞。业主只出示门的检查记录。'],
    ['Специалист зафиксировал тележки и коробки поперёк К-3. Акт о свободном открывании Э-3 описывает дверь и не подтверждает освобождение подхода.', 'The specialist found carts and boxes across K-3. The report on E-3 establishes the door opens freely but gives no evidence that the approach was cleared.', '专业人员记录推车和箱子横挡K-3。E-3记录确认门能自由开启，未确认通道已清空。'],
    ['Прошу проверить, можно ли пройти через К-3 к выходу, и учесть это при ответе.', 'Check whether K-3 is passable on the way to the exit and address that in the reply.', '请核查能否经K-3到达出口，并在答复中处理这个问题。']],
  'fire-inside-release': ['d2',
    ['Снаружи дверь Э-2 в нашем холле не открылась. Я увидел скважину и испугался, что изнутри тоже нельзя выйти.', 'The E-2 door from our lobby was locked from the outside. I saw the keyhole and worried that people couldn’t get out from inside either.', '我们大厅E-2门从外面打不开。我看到钥匙孔，担心里面也出不来。'],
    ['Из той же настройки замка специалист испытал Э-2 изнутри. Дверь открылась без ключа. Снимок снаружи не показывает внутренний механизм.', 'The specialist tested E-2 from inside with the lock in the same setting. It opened without a key. The outside photo does not show the interior hardware.', '专业人员在锁设置相同的情况下从内侧试开E-2，无需钥匙。外侧照片看不见内部装置。'],
    ['Прошу объяснить, подтверждено ли свободное открывание Э-2 в сторону выхода.', 'Please confirm whether E-2 was shown to open freely in the exit direction.', '请说明是否已确认E-2沿疏散方向可自由开启。']],
  'fire-key': ['d0',
    ['В зале много людей. Дверь под табличкой эвакуационного выхода изнутри не открылась. Охранник сказал, что ключ этажом ниже. Дыма сейчас нет.', 'The hall is crowded. The door under the emergency exit sign would not open from inside. A guard says the key is downstairs. There’s no smoke now.', '大厅人很多。标为疏散出口的门从里面打不开。保安说钥匙在下一层。现在没有烟。'],
    ['Эвакуационная дверь обычного объекта испытана изнутри: открыть без ключа не удалось. Ключ хранится у охраны на другом этаже. Особого режима объекта нет.', 'The ordinary facility’s exit door was tested from inside and could not open without a key. Security keeps the key on another floor. No special premises regime applies.', '普通场所的疏散门进行了内侧试开，无法无钥匙开启。钥匙由另一层保安保管。场所无特殊制度。'],
    ['Прошу прямо сейчас передать ответственному сообщение о выходе и проверить его состояние.', 'Please alert the person responsible about this exit now and have its condition checked.', '请立即向负责人报告该出口的问题并核查状态。']],
  'fire-other-exit-report': ['d2',
    ['У двери Э-5 охранник велел ждать ключ. В ответ на жалобу прислали акт и фотографию двери с другой табличкой: Э-4.', 'At E-5 a guard said to wait for a key. The response to my complaint contained a report and a photograph with a different label: E-4.', 'E-5门口保安叫我等钥匙。投诉答复发来检查记录和照片，门牌却是E-4。'],
    ['В отчёте испытано открывание Э-4. Отдельный осмотр Э-5 зафиксировал невозможность открыть изнутри без ключа. Подтверждения исправления Э-5 нет.', 'The report tests E-4. The separate inspection of E-5 found it could not open from inside without a key. No evidence shows E-5 was fixed.', '报告检查了E-4。E-5另行检查发现从内侧无法无钥匙开启。没有E-5已修复的证明。'],
    ['Прошу оставить вопрос по Э-5 на контроле до проверки именно этой двери.', 'Keep the issue with E-5 open until that particular door is checked.', '请继续跟进E-5，直至检查该门本身。']],
});

add(['Документы по перевозке и журнал претензий', 'Carriage documents and claims register', '运输材料及索赔登记'], {
  'flight-agent-receipt': ['d2',
    ['На рейс «Северной дуги» из Москвы я купил билет у продавца «Учебный билет». Продавец принял моё письмо, перевозчик получил претензию позже. Прошу проверить действия обоих.', 'I bought my Northern Arc flight from Moscow through the seller Training Ticket. The seller accepted my message, but the carrier received the claim later. Please look into how each handled it.', '我经“教学票务”购买“北方弧线”从莫斯科出发的机票。售票商接收我的信，承运人之后才收到索赔。请核查双方的处理。'],
    ['В договоре продавец не уполномочен получать претензии за перевозчика. У перевозчика есть своя отметка о получении надлежащей претензии. Более поздняя регистрация письма в органе относится к другому производству.', 'The seller’s contract gives no authority to receive claims for the airline. The carrier has its own receipt record for the proper claim. Later registration by the public authority is a separate matter.', '合同未授权售票商代航司收索赔。承运人有自己正式索赔的收件记录。公共机关后来登记的是另一来件。'],
    ['Объясните, какое подтверждение определяет получение претензии перевозчиком.', 'Explain which receipt establishes when the carrier received the claim.', '请说明哪份凭证确定承运人何时收到索赔。']],
  'flight-cancel-nonrefundable': ['d1',
    ['«Северная дуга» отменила мой рейс Москва — Казань. Я отказался от поездки из-за отмены, а в кассе дали только вариант с ваучером. Возврат я прошу у перевозчика. Здесь хочу подать жалобу на то, как со мной обошлись.', 'Northern Arc cancelled my Moscow–Kazan flight. I declined to travel after the cancellation, and the desk offered only a voucher. I’m asking the carrier for the refund. Here I’d like to complain about how that request was handled.', '“北方弧线”取消了我莫斯科至喀山的航班。我因取消放弃出行，柜台只提供代金券。我向承运人要退款，在这里投诉的是处理方式。'],
    ['Перевозчик подтвердил отмену. Прямой билет целиком не использован. Получено заявление о вынужденном отказе. Соглашения о ваучере в деле нет.', 'The carrier confirmed cancellation. The direct ticket is wholly unused. The passenger declared an involuntary withdrawal. No voucher agreement is on file.', '承运人确认取消。直达票完全未使用。收到因取消被迫放弃的申请。案卷无代金券协议。'],
    ['Прошу рассмотреть возврат денег за неиспользованный билет при отмене рейса.', 'Please consider a refund for my unused ticket after the cancellation.', '请处理航班取消后未使用机票的退款。']],
  'flight-claim': ['d0',
    ['После задержки рейса «Северной дуги» из Москвы я заявила перевозчику о расходах. В ответ получила только квитанцию. Прошу отдельно проверить, как он принял и рассмотрел претензию.', 'After Northern Arc delayed my flight from Moscow, I claimed expenses from the carrier. All I received was an automated receipt. I want a separate review of how it received and handled the claim.', '“北方弧线”从莫斯科出发的航班延误后，我向承运人索赔费用，只收到自动回执。我另请核查承运人怎样接收和处理索赔。'],
    ['Отметка перевозчика раздельно фиксирует отправку и поступление претензии. Автоответ подтверждает получение; решения о расходах в нём нет.', 'The carrier’s record distinguishes dispatch from receipt. The automated message confirms delivery but contains no decision on expenses.', '承运记录区分发出与收到日期。自动回信确认送达，没有就费用作决定。'],
    ['Прошу сообщить, с какой даты рассматривают претензию и как я получу ответ по расходам.', 'Tell me when consideration began and how I will receive a decision on the expenses.', '请告知从哪天开始处理索赔，我怎样收到费用答复。']],
  'flight-weather-care': ['d1',
    ['Мой рейс «Северной дуги» из Москвы был на 08:00. Воду дали в 10:30, а к 15:00 не было ни посадки, ни горячего питания. Сотрудник объяснил это погодой.', 'My Northern Arc domestic flight from Moscow was due at 08:00. We got water at 10:30, but by 15:00 there was no boarding or hot food. The employee blamed the weather.', '我乘坐的“北方弧线”莫斯科出发国内航班原定08:00。10:30给了水，到15:00仍没登机，也没有热餐。工作人员说是天气原因。'],
    ['Журнал рейса: план 08:00, вода 10:30, к 15:00 посадка и горячее питание не организованы. Чек о питании на борту относится к другому рейсу.', 'Flight log: scheduled 08:00, water at 10:30, no boarding or hot meal by 15:00. A receipt for food onboard concerns another flight.', '航班日志：原定08:00，10:30发水，至15:00未登机也无热餐。机上餐饮收据属于另一航班。'],
    ['Хочу понять, какое обслуживание полагалось во время ожидания независимо от причины задержки.', 'I want to know what care was due during the wait given the weather delay.', '我想知道即使因天气延误，等候期间应提供什么服务。']],
});

add(['Маркировка товара и материалы продавца', 'Product labels and retailer’s records', '商品标签与销售方记录'], {
  'food-manufactured-date': ['d2',
    ['На фото упаковки М-8 я увидел февральскую дату и решил, что питание просрочено. На моём первом снимке часть надписи обрезана.', 'I saw a February date on pack M-8 and thought the food had expired. My first photo cuts off part of the label.', '我看到М-8包装上的二月日期，以为食品过期。我第一张照片裁掉了部分标签。'],
    ['На полном снимке той же пачки: изготовлено 01.02.2026, годен до 01.08.2026. Покупка 24.04.2026. Первая фотография не захватила поле «Годен до».', 'Full photograph of the same pack: made 01 February 2026, use by 01 August 2026, bought 24 April 2026. The first shot cut out the use-by field.', '同一包装完整照片：2026年2月1日生产，保质至2026年8月1日，2026年4月24日购买。首张照片漏掉保质期栏。'],
    ['Проверьте срок на моей пачке по полному снимку.', 'Please check the expiry on my pack using the full photo.', '请用完整照片核查这包食品的保质期。']],
  'food-no-receipt-refund': ['d1',
    ['Детское питание П-61 уже было просрочено при покупке. Магазин подтвердил продажу по платёжным данным и отказал вернуть деньги без бумажного чека.', 'Baby food P-61 was expired when I bought it. The shop confirmed the sale from payment records but refused a refund without a paper receipt.', '婴儿食品П-61购买时已经过期。商店根据支付记录确认售出，却以没有纸质小票拒绝退款。'],
    ['Продажа подтверждена продавцом и платёжными сведениями. Продавец получил денежное требование 27.04.2026. Единственная записанная причина отказа — отсутствие бумажного чека.', 'The seller and payment data confirm the sale. The retailer received the refund demand on 27 April 2026. Missing paper receipt was the only reason recorded for refusal.', '卖家及付款记录确认销售。销售方于2026年4月27日收到退款要求。拒绝记录的唯一理由是没有纸质小票。'],
    ['Прошу рассмотреть возврат суммы за П-61 с учётом подтверждённой покупки.', 'Please consider refunding P-61 using the confirmed purchase information.', '请根据已确认的购买记录处理П-61退款。']],
  'food-other-batch': ['d0',
    ['Деньги за продукт мне уже вернули. На полке осталась партия А, а магазин показывает документ на партию Б.', 'I already got my money back. Batch A remains on the shelf, but the shop showed papers for batch B.', '我已经拿到退款。货架上还留着A批，商店却出示B批文件。'],
    ['На упаковке и полке отмечена партия А; срок истёк к покупке. Представленная продавцом бумага указывает партию Б с другим сроком. Запись о возврате подтверждает расчёт с одной покупательницей.', 'The pack and shelf identify batch A, already expired at purchase. The shop’s paper lists batch B with another expiry. The refund record settles the buyer’s individual payment.', '包装和货架标为A批，购买时已过期。商店出示的文件为保质期不同的B批。退款记录只证明与一位买家结算。'],
    ['Прошу проверить, остаётся ли партия А в продаже, и сообщить о результатах.', 'Please check whether batch A remains on sale and tell me the result.', '请核查A批是否仍在销售并告知结果。']],
  'food-recall-wrong-batch': ['d2',
    ['Мне прислали акт об изъятии Д-27. Я писал о Д-72: номер виден на фотографии упаковки с полки.', 'They sent me a removal record for D-27. I reported D-72, which is visible on the photo of the packet on the shelf.', '有人发来D-27下架记录。我反映的是D-72，包装货架照片上可见编号。'],
    ['В акте изъятия числится Д-27. Снимок маркировки и материалы проверяющего относятся к Д-72. Сведений о действиях по Д-72 акт не содержит.', 'The removal record lists D-27. The label photograph and inspector’s papers identify D-72. The record contains no action on D-72.', '下架记录列的是D-27。标签照片和检查材料指向D-72。记录未载对D-72采取的措施。'],
    ['Проверьте, что сделано именно с Д-72, прежде чем закрывать обращение.', 'Check what was done about D-72 before closing the case.', '请查明具体对D-72做了什么，再结束处理。']],
});

add(['Оперативные сведения по газовой заявке', 'Operational information for the gas report', '燃气报修信息'], {
  'gas-address-correction': ['d0',
    ['Я звонил по 104 из безопасного места. Запах у дома 7, корпус 3. В карточке G-16 оказался корпус 2, а запах ещё есть.', 'I called 104 from a safe place. The smell is at building 7, block 3. G-16 says block 2, and I still smell it.', '我在安全地点拨打104。气味地点是7号楼3栋，G-16却记成2栋，气味还有。'],
    ['Диспетчер принял G-16 с адресом дом 7, корпус 2. Текущее уточнение очевидца: корпус 3. Принятие вызова по корпусу 2 не подтверждает выезд к корпусу 3.', 'Dispatch accepted G-16 for building 7, block 2. The witness now clarifies block 3. Accepting the call for block 2 does not establish a response to block 3.', '调度收到G-16，地址为7号楼2栋。目击者现在澄清是3栋。受理2栋不能证明派人去了3栋。'],
    ['Помогите немедленно передать диспетчеру правильный корпус; письмо у меня отдельно.', 'Help me get the correct block to the dispatcher immediately. I have a separate written submission.', '请立即把正确的楼栋告知调度。书面来件是另一个事项。']],
  'gas-past-incident': ['d2',
    ['Специалисты приезжали по G-25. Сейчас запаха нет, а в ответе вижу только «закрыто». Хочу узнать, что делали на месте.', 'The technicians came for G-25. There is no smell now, but the response just says closed. I want to know what they did onsite.', '技术人员来处理过G-25。现在没有气味，但答复只写“办结”。我想知道当时做了什么。'],
    ['Выезд специалистов по G-25 относится к указанному объекту. В акте зафиксированы обследование и выполненные меры. Ответ заявителю содержит лишь статус «закрыто».', 'The technicians’ G-25 visit matches the reported site. The report documents inspection and measures taken. The applicant’s reply shows only closed status.', 'G-25技术人员到访与所报地点吻合。记录列有检查和已采取措施。给申请人的答复仅写“办结”。'],
    ['Прошу объяснить, что зафиксировали специалисты и что сделали по G-25.', 'Please explain what the technicians found and did for G-25.', '请说明技术人员对G-25查到了什么，采取了什么措施。']],
  'gas-planned-outage': ['d2',
    ['На подъезде висит объявление об отключении на объекте G-31. Сейчас я почувствовала запах и ушла в безопасное место. Сосед уверен, что причина в работах.', 'The entrance has an outage notice for site G-31. I smelled gas just now and went somewhere safe. A neighbour thinks it’s because of the works.', '入口有G-31停气公告。我刚闻到气味，已到了安全地方。邻居认为是施工导致。'],
    ['Объявление подтверждает плановое отключение G-31. Заявительница сообщает о текущем запахе из безопасного места. Осмотра и подтверждённой связи запаха с работами нет.', 'The notice documents a planned G-31 outage. The caller reports a current odour from a safe location. No inspection or verified link to the work is recorded.', '公告确认G-31计划停气。来访者在安全处报告当前气味。没有检查记录，也未确认气味与施工有关。'],
    ['Прошу как можно скорее передать сообщение о запахе, пока причина не выяснена.', 'Please relay the report about the odour promptly so the cause can be investigated.', '请尽快转报气味，以便查明原因。']],
  'gas-smell': ['d0',
    ['По дороге сюда несколько минут назад почувствовал сильный запах у газового шкафа. На схеме отметил место. Диспетчеру ещё не сообщил.', 'A few minutes ago on the way here I smelled a strong odour near the gas cabinet. I marked it on the map. I haven’t called dispatch yet.', '刚才来这里路上，我在燃气柜附近闻到强烈气味，已在图上标明地点，还没联系调度。'],
    ['В схеме очевидца отмечен газовый шкаф у пешеходного прохода. Сообщение о сильном запахе относится к только что наблюдавшемуся событию. Причина не установлена; принятой оперативной заявки ещё нет.', 'The witness map marks the gas cabinet next to a pedestrian path. The strong smell was just observed. The cause is unknown and dispatch has yet to accept a report.', '目击者图上标明人行通道旁燃气柜。强烈气味是刚观察到的。原因不明，尚无调度受理记录。'],
    ['Скажите, кому сейчас безопасно передать место и признаки, которые я заметил.', 'Tell me how to report the exact location and what I noticed safely right now.', '请告诉我现在如何安全报告具体地点和观察到的现象。']],
});

add(['Журнал поста и документы частной охраны', 'Post log and private security documents', '岗亭日志及保安文件'], {
  'guard-contractor': ['d0',
    ['В клубе «Учебная сцена» охранник остановил меня у входа. На форме эмблема клуба, а в показанной лицензии написано «Учебный пост».', 'A guard stopped me at the Training Stage club. The uniform has the club emblem, but the licence says Training Post.', '我在“教学舞台”俱乐部入口被保安拦住。制服有俱乐部标志，出示的许可证却写“教学岗亭”。'],
    ['Договор клуба с ООО «Учебный пост» на охрану. ИНН подрядчика совпадает с лицензией. Журнал содержит время и пост; правомерность конкретного действия договор не подтверждает.', 'The club contracted Training Post LLC for security. Its taxpayer ID matches the licence. The log identifies the time and post; the contract does not establish whether particular conduct was lawful.', '俱乐部与“教学岗亭”公司签安保合同。承包商纳税人编号与许可一致。日志列明时间和岗点，合同未证明具体行为合法。'],
    ['Проверьте, какая организация действительно охраняла вход и имела ли она право выполнять эту работу.', 'Please check which company actually guarded the entrance and whether it was authorised to provide security.', '请核查实际负责入口安保的是哪家公司、是否有权做这项工作。']],
  'guard-current-register': ['d2',
    ['На стенде висит старая копия лицензии. Я сфотографировал её и хочу установить, действовало ли разрешение у фирмы О-17.', 'There’s an old licence copy on the noticeboard. I photographed it and want to know if O-17 had a valid licence.', '公告栏有旧版许可证复印件。我拍了照片，想知道О-17的许可是否有效。'],
    ['На дату проверки реестровая запись О-17 действительна для указанной охранной услуги. Стенд показывает прежнюю бумажную копию. Действия отдельного работника выписка не оценивает.', 'O-17’s register entry was valid for the stated security service on the inspection date. The board holds an older copy. The entry does not assess an individual guard’s conduct.', '核查当日О-17名录记录对该安保业务有效。公告栏是旧纸质副本。摘录不评价个人行为。'],
    ['Прошу сверить действующий статус О-17 и объяснить, что подтверждает выписка.', 'Please verify O-17’s current status and explain what the extract establishes.', '请核查О-17当前许可状态，并说明摘录证明什么。']],
  'guard-identification-request': ['d1',
    ['Охранник К-9 предъявил мне требование. Я попросил показать удостоверение и личную карточку. Он отказался: сказал, что показывает их только проверяющим.', 'Guard K-9 made a demand. I asked him to show his credential and personal card. He refused, saying he only shows them to inspectors.', '保安K-9向我提出要求。我请他出示证件和个人卡，他拒绝，说只给检查人员看。'],
    ['Запись поста: требование предъявил К-9, документы действительны. Посетитель просил предъявить их для обозрения, без передачи в руки или копирования. Причина отказа записана со слов охранника.', 'Post record: K-9 made the demand and has valid documents. The visitor asked to see them, without handling or copying them. The reason for refusal is the guard’s account.', '岗亭记录表明K-9提出要求，证件有效。访客仅要求看证件，未要求拿在手里或复印。拒绝理由为保安陈述。'],
    ['Уточните, обязан ли он показать документы посетителю после предъявленного требования.', 'Please explain whether the guard had to show me his documents after making that demand.', '请说明保安提出要求后是否有义务向我出示证件。']],
  'guard-property-inspection': ['d2',
    ['У входа я отказался показать, что в сумке. Охранник сказал, что будет держать меня до согласия. Другой причины он не назвал.', 'At the door I refused to show the contents of my bag. The guard said he would hold me until I agreed. He gave no other reason.', '入口处我拒绝展示包内物品。保安说在我同意前会扣住我，没说其他理由。'],
    ['Режим объекта предусматривает осмотр вносимого имущества. На записи слышно, как охранник грозит задержать посетителя из-за отказа показать сумку. Запись обрывается до выхода посетителя. Признаков отдельного правонарушения в материалах нет.', 'The access rules allow inspection of brought-in property. The recording captures the guard threatening to detain the visitor for refusing a bag inspection. It ends before the visitor leaves. No independent offence is documented.', '出入规则允许检查带入物品。录音中保安称如不出示包就要扣留来访者。录音在来访者离开前中断。没有记录其他独立违法行为。'],
    ['Прошу проверить действия охранника, выяснить, мог ли я свободно уйти, и объяснить порядок обжалования.', 'Please review the guard’s conduct, establish whether I was free to leave, and explain how I can challenge what happened.', '请核查保安的行为，查明我当时能否自由离开，并说明申诉途径。']],
});

add(['Карточка участка и материалы осмотра пешеходного прохода', 'Site record and footpath inspection materials', '地点登记及人行通道检查材料'], {
  'hatch-barrier': ['photo',
    ['У остановки крышку поставили, но металлическое ограждение теперь поперёк дорожки. С коляской безопасно не пройти.', 'At the bus stop they fitted a cover, but the metal barrier is across the path. I can’t get through safely with a stroller.', '公交站的井盖装好了，但金属围挡横在人行道上，推婴儿车无法安全通过。'],
    ['На снимке установлена крышка, ограждение перекрывает дорожку. В сообщении АО «Мосводоканал» выполненной названа заявка по крышке; освобождение прохода не зафиксировано. Инвентарная бирка на секции ограждения совпадает с номером в наряде бригады Мосводоканала.', 'The photograph shows the cover fitted and a barrier across the path. Mosvodokanal marked the cover ticket complete but did not record that the path was cleared. The inventory tag on the barrier matches the one on the Mosvodokanal crew’s work order.', '照片显示井盖装好，围挡挡住步道。莫斯科供排水公司将井盖工单标为完成，未记录通道清理。围挡上的资产编号与莫斯科供排水公司班组工单所列编号相同。'],
    ['Проверьте проход у остановки после установки крышки и сообщите, когда можно будет им безопасно пользоваться.', 'Please check the path after the cover replacement and let me know when it is safe to use.', '请检查井盖安装后的通道，并告知何时可安全使用。']],
  'hatch-known-owner': ['d0',
    ['Я принёс письмо «Мосводоканала»: колодец К-17 на их схеме совпал с моим ориентиром. Крышки по-прежнему нет. К кому сейчас попадёт заявка?', 'I brought a Mosvodokanal letter. Manhole K-17 on its map matches my landmark. The cover is still missing. Who gets the report now?', '我带来莫斯科供排水公司的信。图上的K-17井与我的地标吻合，井盖仍缺。工单现在会交给谁？'],
    ['Письмо сетевой службы подтверждает обслуживание московского К-17. Номер на схеме совпадает. Записи об установленном ограждении нет.', 'The network operator’s letter confirms it maintains Moscow manhole K-17. Its number matches the diagram. No installed barrier is recorded.', '管网单位函件确认维护莫斯科K-17井，编号与示意图一致。没有已安装围挡的记录。'],
    ['Передайте сигнал о текущей опасности и проверьте, что дежурная служба получила заявку именно по К-17.', 'Relay the current hazard and verify that dispatch received it for K-17.', '请转报当前危险，并确认值班调度收到了关于K-17的工单。']],
  'hatch-location': ['ticket',
    ['Я заметил провал на дорожке от остановки «Парк» к мосту, рядом с синим киоском. Диспетчер отправил заявку к моему дому А. Это другой квартал.', 'I spotted the opening between Park stop and the bridge by the blue kiosk. Dispatch sent the report to my home address, building A, which is in a different block.', '我在“公园”公交站到桥的路上、蓝色售货亭旁看到坑洞。调度把工单送到我家A楼，那个地方在另一个街区。'],
    ['Поле «адрес заявителя»: дом А. В тексте место события — дорожка от остановки «Парк» до моста через двор Б, на снимке виден синий киоск. Карточка автоматически подставила дом А; выезд не подтверждён. На последнем снимке у киоска видно открытое отверстие без ограждения на пешеходной дорожке.', 'Applicant address: building A. The incident text places it on the path between Park stop and the bridge through courtyard B; the photo shows a blue kiosk. The ticket auto-filled building A. No visit is confirmed. The latest photograph shows an unguarded opening in the footpath beside the kiosk.', '申请人地址：A楼。事发说明为“公园”站经B院通往桥的步道，照片有蓝色售货亭。系统自动用A楼，未确认到场。最新照片显示，售货亭旁的步道上有一个没有围挡的洞口。'],
    ['Исправьте место в оперативной карточке по ориентирам и проверьте передачу сигнала.', 'Please correct the location using those landmarks and verify dispatch got the update.', '请用地标更正应急工单位置，并确认更新已转达。']],
  'hatch-network': ['registry',
    ['У московского колодца К-17 крышка лежит рядом, ограждения нет. Управляющая компания обслуживает двор, но на диспетчерской схеме указана другая сеть.', 'At Moscow manhole K-17 the cover is lying nearby and there’s no barrier. The property manager maintains the courtyard, but the dispatch map shows another network.', '莫斯科K-17井盖放在一旁，无围挡。物业负责院落，但调度示意图标为另一管网。'],
    ['Условный знак «Сеть Б» в легенде реестра обозначает сеть АО «Мосводоканал». В этой строке указан колодец К-17. К-18 имеет другую привязку. Уход за покрытием двора не включает колодец К-17.', 'The register legend identifies Network B as the Mosvodokanal water and sewer network. Its entry lists manhole K-17. K-18 has a different network. The courtyard paving contract does not include K-17.', '登记图例注明“管网B”为莫斯科供排水公司管网，并在此栏列出K-17号井。K-18归属不同。院落路面养护不包括K-17。'],
    ['Прошу сообщить о доступном открытом колодце и направить вопрос правильной сетевой службе.', 'Please report the open manhole and get the issue to the correct utility.', '请报告这个开放的井口并将问题转给正确的管网单位。']],
  'hatch-restored': ['d0',
    ['Я сфотографировал открытый люк, а сосед говорит, что крышку уже поставили. Хочу сопоставить мой снимок с актом, прежде чем закрывать вопрос.', 'I photographed the open manhole, and my neighbour says the cover is back. I want to compare my photo with the completion report before closing the issue.', '我拍过敞开的井口，邻居说井盖已装回。我想先核对照片与完工记录。'],
    ['В акте и на снимке после работ совпадают номер колодца и ориентиры исходного фото. Крышка закреплена, проход свободен. В заявлении просили установить крышку и сообщить о результате.', 'The completion report and post-work photo match the original manhole number and landmarks. The cover is secured and the path open. The request sought replacement and notice of completion.', '完工记录和施工后照片与原片的井编号、地标吻合。井盖固定，通道畅通。申请要求装回井盖并告知结果。'],
    ['Сообщите, что именно сделано по моему обращению, с указанием проверенных номера и места.', 'Tell me what was done about my report, with the checked manhole number and location.', '请告诉我针对来件已做什么，并注明核对过的井编号和地点。']],
  'hatch': ['photo',
    ['У московской остановки чуть не наступил в открытый колодец на школьной дорожке. Отметил участок А на схеме. В приёмной сказали ждать письменного ответа месяц.', 'By a Moscow bus stop I nearly stepped into an open manhole on the school footpath. I marked section A on the map. Reception told me to wait a month for the written reply.', '我在莫斯科公交站旁的上学步道差点踩进敞开的井口，已在示意图标出A区。接待处让我等一个月的书面答复。'],
    ['На снимке 08:40 видно открытое отверстие на участке А, без ограждения. Подход дети используют по дороге в школу. Маркировки владельца сети на снимке нет.', 'The 08:40 photo shows the uncovered opening in section A without barriers, on a path children use for school. No utility owner marking is visible.', '08:40照片显示A区有敞开井口、无围挡，儿童用这条路上学。照片无管网归属标识。'],
    ['Помогите сразу передать место и опасность дежурным, а по письму сообщите, кто проверит колодец.', 'Help get the location and hazard to dispatch immediately, and tell me in the written reply who will inspect the manhole.', '请立即向值班部门报告地点和危险，并书面告知谁核查井口。']],
});

add(['Разрешительные материалы и осмотр охраняемого объекта', 'Authorisation and inspection materials for a heritage site', '受保护遗产对象的许可与检查材料'], {
  'heritage-approved-restoration': ['d0',
    ['У московского дома H-21 снимают детали с фасада. Я увидел маркировку Е-3 и Е-4 и хочу узнать, зачем их сняли.', 'At Moscow building H-21, facade elements are being removed. I saw tags E-3 and E-4 and want to know why they were taken down.', '莫斯科H-21号建筑正在拆下立面构件。我看到E-3、E-4标记，想知道为何拆下。'],
    ['Действующие разрешение и проект по H-21 предусматривают снятие E-3 и E-4 для реставрации, учёт, хранение и возврат. Журнал подтверждает маркировку и место хранения. Выход за согласованный объём не установлен.', 'H-21’s valid authorisation and plan allow E-3 and E-4 to be taken down for restoration, tracked, stored and returned. The log records labels and storage. No departure from the approved scope is established.', 'H-21有效许可及方案允许拆下E-3、E-4修复、登记、保管并装回。日志确认编号与保管处。未认定超出批准范围。'],
    ['Проверьте, входят ли эти две детали в проект и как предусмотрен их возврат.', 'Check whether those two pieces are in the approved design and how they will be returned.', '请核查这两件是否属于批准方案，以及如何规定装回。']],
  'heritage-identified-status': ['d2',
    ['Подрядчик на доме H-32 в Новосибирской области говорит, что записи в реестре нет. У соседей есть письмо о статусе выявленного объекта.', 'The contractor at H-32 in Novosibirsk Oblast says it isn’t in the register. My neighbours have a letter about its identified heritage status.', '新西伯利亚州H-32建筑的承包商说名录查不到，邻居却有一封关于已认定遗产对象状态的信。'],
    ['Инспекция Новосибирской области подтвердила, что H-32 включён в перечень выявленных объектов. Адрес и границы совпадают с местом работ по фасаду. В деле только согласие собственника, разрешительный комплект не подтверждён.', 'The Novosibirsk Oblast inspectorate confirms H-32 appears on the list of identified heritage properties. Address and boundaries match the facade work. The file confirms only owner consent, with no site authorisation package established.', '新西伯利亚州监察机关确认H-32列入已认定遗产对象清单。地址和范围与立面施工处一致。材料仅确认业主同意，未确认施工许可文件。'],
    ['Прошу проверить статус дома и основания для работ по фасаду.', 'Please verify the building’s status and the authority for the facade work.', '请核查建筑保护状态和立面施工依据。']],
  'heritage-license-not-permit': ['d2',
    ['На объекте H-44 в Новосибирской области показали лицензию «Учебной реставрации». В ней нет нашего дома, только название подрядчика.', 'At H-44 in Novosibirsk Oblast they showed me Training Restoration’s licence. It names the contractor but gives no reference to our building.', '在新西伯利亚州H-44施工现场，他们出示“教学修复”公司的许可证。上面只有承包商名称，没有这栋楼。'],
    ['В комплекте по охраняемому H-44 действующая лицензия подрядчика и письмо собственника. Выдача разрешения на конкретные работы по H-44 не подтверждена.', 'The file for protected H-44 contains the contractor’s valid licence and the owner’s letter. It does not establish that authorisation for the specific work at H-44 was issued.', '受保护H-44案卷有承包商有效许可和业主函件，未确认已签发H-44具体工程的许可。'],
    ['Прошу проверить, есть ли разрешение именно на работы по нашему дому H-44.', 'Please check for authorisation for these specific works at H-44.', '请核查有没有针对我们H-44楼具体施工的许可。']],
  'heritage-stair': ['d0',
    ['В нашем старом московском доме снимают детали лестницы. На стенде вижу «ремонт кровли», про лестницу ничего.', 'Workers are removing stair parts in our old Moscow building. The site notice says roof repair and says nothing about the stairs.', '我们莫斯科老楼正在拆楼梯构件。现场告示写“屋顶维修”，没讲楼梯。'],
    ['В карточке предмета охраны указаны фасад и историческая лестница. Представленная карточка работ относится к кровле. На фото видны снятые лестничные элементы, цель и порядок их сохранения по нему не установлены.', 'The heritage record protects the facade and historic staircase. The work notice concerns the roof. A photo shows stair elements removed; it does not establish why or how they are being preserved.', '保护对象记录列有立面和历史楼梯。施工卡针对屋面。照片显示楼梯构件被拆，无法确定拆除目的或保管办法。'],
    ['Прошу проверить документы на лестницу и узнать, что происходит со снятыми деталями.', 'Please check the paperwork for the stairs and find out what is happening to the removed parts.', '请核查楼梯施工文件，并查明拆下构件如何处理。']],
});

add(['Кредитное досье: полис, заявление и ответ', 'Credit file: policy, application and response', '贷款案卷：保单、申请及答复'], {
  'insurance-collective-payoff': ['d1',
    ['Я досрочно полностью погасила кредит. Банк включил меня в коллективную страховку за 40 000 рублей, а теперь ждёт перевода от страховщика.', 'I repaid my loan in full ahead of schedule. The bank enrolled me in group insurance for 40,000 roubles, and now wants me to wait for the insurer to pay it.', '我已提前全额还贷。银行把我加入收费4万卢布的团体保险，现在却叫我等保险公司给银行转款。'],
    ['Страхователь — банк. Плата 40 000 рублей включает 30 000 премии и 10 000 отдельной платы банка. Полное погашение и получение банком заявления об исключении подтверждены. Событий с признаками страхового случая нет.', 'The bank is the policyholder. The 40,000 rouble fee includes 30,000 premium and a separate 10,000 bank charge. Full repayment and bank receipt of the removal request are documented. No event indicating a claim is recorded.', '投保人为银行。4万卢布包括3万保费及另列1万银行费用。已确认全额还款及银行收到退出申请。无具备保险事故迹象的事件。'],
    ['Прошу разобрать, какую часть платы возвращает банк и от какой даты считать срок.', 'Explain what share the bank refunds and which date starts the time limit.', '请说明银行应退哪部分费用、从哪天计算期限。']],
  'insurance-collective': ['d0',
    ['В страховке к кредиту банк указан страхователем, а я в списке застрахованных. Заявление об отказе получил банк, но меня направляют к страховщику.', 'The loan insurance lists the bank as policyholder and me as an insured person. The bank has my opt-out request but keeps sending me to the insurer.', '贷款保险上银行是投保人，我在被保险人名单里。银行已收退保申请，却让我找保险公司。'],
    ['Коллективный страхователь — кредитор; заёмщица включена как застрахованная. Кредитор получил отказ 27.04.2026 в пределах 30 календарных дней. Событий с признаками страхового случая нет.', 'The lender is the group policyholder, and the borrower is insured under it. The lender received withdrawal on 27 April 2026 within 30 calendar days. No event indicating an insurance claim is recorded.', '团体投保人为贷款机构，借款人为被保险人。贷款机构在30个自然日内于2026年4月27日收到退出要求。无具备保险事故迹象的事件。'],
    ['Уточните, кто должен рассмотреть мой отказ и когда я получу ответ по возврату.', 'Tell me who handles my withdrawal request and when I can expect a response on the refund.', '请说明谁处理退出申请、何时给出退款答复。']],
  'insurance-individual-payoff': ['d2',
    ['Я полностью досрочно погасил кредит. В полисе ИС-27 я страхователь. Страховщик ответил, что тридцать дней с оформления уже прошли.', 'I repaid the loan in full early. I am the policyholder for IS-27. The insurer answered that thirty days from issue had already elapsed.', '我已提前全额还贷。ИС-27保单上的投保人是我。保险人答复说从出单已过三十天。'],
    ['ИС-27 обеспечивал кредит и должен был действовать после полного досрочного погашения. Заявление получено страховщиком. Ответ ссылается только на истечение периода отказа и не оценивает погашение.', 'IS-27 secured the loan and was due to remain in force after full early repayment. The insurer received the request. Its reply cites only the expiry of the withdrawal period and does not assess repayment.', 'ИС-27为贷款担保，原本在提前还清后仍在保险期。保险人收到申请。答复只援引退出期届满，未评估还清贷款。'],
    ['Прошу проверить право на возврат за оставшееся время действия полиса после полного погашения.', 'Check whether I am entitled to a refund for the unused portion of the policy after full repayment.', '请核查全额还贷后保单剩余期限是否可以退款。']],
  'insurance-individual-refusal': ['d2',
    ['В полисе к моему кредиту страхователь — я. Страховщик получил мой отказ на двадцатый день, но сослался на четырнадцать дней и решение банка.', 'I am the policyholder for the insurance tied to my loan. The insurer got my withdrawal on day twenty, but mentioned fourteen days and the bank’s decision.', '我本人是贷款保单的投保人。保险人在第二十天收到退出申请，却提到十四天和银行的决定。'],
    ['Индивидуальный полис на Марию, премия уплачена страховщику. Подписанный отказ получен страховщиком на двадцатый календарный день. Более раннее письмо получил банк; страхового случая с указанными признаками нет.', 'Maria holds the individual policy and paid the insurer. The insurer received signed withdrawal on calendar day twenty. The earlier message went to the bank. No event indicating an insurance claim is documented.', '玛丽亚持有个人保单并向保险人支付保费。其签署的退出申请于第二十个自然日送达保险人。早先的信寄给银行。无具备保险事故迹象的事件。'],
    ['Прошу оценить отказ страховщика по дате, когда заявление получил именно он.', 'Please assess the insurer’s refusal using the date it received my signed request.', '请按保险人实际收到签名申请的日期核查其拒绝决定。']],
});

add(['Карточка площадки отходов и журнал выездов', 'Waste site and dispatch visit records', '废弃物场地记录及出动日志'], {
  'landfill-after-fire': ['d2',
    ['На московской площадке У-32 уже потушили мусор. Дыма нет, но мусор остался в той же точке. Мне предложили закрыть всё по акту о тушении.', 'The waste fire at Moscow site U-32 is out. The smoke is gone, but waste remains in the same spot. They proposed closing everything based on the fire report.', '莫斯科У-32场地垃圾火已扑灭，无烟但垃圾仍在原地。有人建议凭灭火记录办结全部事项。'],
    ['Акт службы по У-32 фиксирует прекращение горения. На более поздних снимках по тем же ориентирам видны отходы. Сведений о вывозе нет.', 'The service report for U-32 documents that the fire stopped. Later photos at matching landmarks show waste remaining. There is no removal record.', 'У-32服务记录确认燃烧停止。相同地标的后续照片显示垃圾仍在。无清运记录。'],
    ['Прошу сообщить об окончании тушения и отдельно проверить, что будет с оставшимися отходами.', 'Please confirm the fire response is complete and separately check how the remaining waste will be handled.', '请确认灭火已完成，并另行查明剩余垃圾如何处理。']],
  'landfill-current-burning': ['d2',
    ['Из дома вижу, что на московском пустыре У-30 сейчас горит мусор. Точку могу показать. Собственника не знаю.', 'From my home I can see waste burning now on Moscow vacant lot U-30. I can show the location. I don’t know the owner.', '我从家里看到莫斯科У-30空地的垃圾正在烧。我能指出地点，不知道业主。'],
    ['У-30 привязан к Москве. Очевидец сообщает о текущем горении, контакт с ним сохранён. Собственник не установлен. Передача оперативного сообщения ещё не отмечена.', 'U-30 is in Moscow. A witness reports active burning and can be reached. The owner is unknown. No dispatch handoff has been recorded.', 'У-30位于莫斯科。目击者报告仍在燃烧，可联系到本人。业主不明。尚无应急转报记录。'],
    ['Помогите немедленно передать место горения пожарным; вопрос о земле можно уточнить потом.', 'Help alert the fire service to the location immediately. The land question can be settled later.', '请立即将燃烧地点告知消防部门，土地归属可以随后查明。']],
  'landfill-registry-scope': ['d1',
    ['Я живу в Москве, а площадка Э-30 находится в Тверской области. По домашнему адресу мне предложили московский районный отдел.', 'I live in Moscow, but site E-30 is in Tver Oblast. They suggested a Moscow district office using my home address.', '我住莫斯科，但Э-30场地在特维尔州。有人按住宅地址建议莫斯科区级部门。'],
    ['Выписка по Э-30: Тверская область, федеральный экологический надзор. Московский адрес внесён только для ответа заявителю.', 'Register extract for E-30: Tver Oblast, federal environmental supervision. The Moscow address is entered only for replying to the applicant.', 'Э-30名录摘录：特维尔州，联邦环境监管。莫斯科地址仅用于给申请人回信。'],
    ['Проверьте, какое территориальное управление федерального надзора работает по месту Э-30.', 'Check which federal environmental office covers site E-30.', '请核查哪一个联邦环境监管辖区覆盖Э-30。']],
  'landfill-territory': ['d0',
    ['На даче в Тверской области увидел дым с мусорной площадки. В московской приёмной предложили поискать место по моему домашнему адресу в Москве.', 'At my dacha in Tver Oblast I saw smoke coming from the waste site. Moscow reception suggested finding the site from my Moscow home address.', '在特维尔州的别墅我看到垃圾场冒烟。莫斯科接待处却建议按我在莫斯科的住宅地址查找地点。'],
    ['По координатам площадка в Тверской области. В реестре для этого участка указан региональный уровень надзора. В журнале МФЦ раздельные записи: сообщение о текущем дыме — дежурному по 101/112, письменное обращение — о проверке самой свалки. Фото и сообщение относятся к дыму на месте; владельца и состав отходов они не устанавливают.', 'Coordinates place the site in Tver Oblast. The register places this site under regional supervision. The intake log has separate entries for the current smoke report to local emergency dispatch (101/112) and the written request for an inspection of the dump. The photograph and report concern smoke at the site and establish neither ownership nor waste composition.', '坐标指向特维尔州。登记册将该地点列入州级监管。受理日志分列两项：将当前烟情报当地101/112值班调度，书面来件要求检查垃圾场。照片和陈述涉及场地的烟雾，无法确认业主或废弃物成分。'],
    ['Помогите передать сообщение о дыме и отдельно определить адресата письма по месту площадки.', 'Help report the smoke and separately identify who should receive the letter for the site.', '请协助报告烟雾，并另行确定按场地位置受理书面来件的机关。']],
});

function addContext(ids, evidence, authoritySources) {
  for (const id of ids.split(' ')) {
    const entry = storiesA[id];
    if (evidence) entry.evidence = entry.evidence.map((text, index) => `${text}\n${evidence[index]}`);
    entry.authoritySources = [...new Set([...(entry.authoritySources || []), ...authoritySources])];
  }
}

const moscow = ['Место события: город Москва.', 'Incident location: Moscow city.', '事发地：莫斯科市。'];
const moscowOblast = ['Место события: Московская область.', 'Incident location: Moscow Oblast.', '事发地：莫斯科州。'];
const cityUtilitiesSource = 'https://www.mos.ru/dgkh/';
const labourMoscow = 'https://git77.rostrud.gov.ru/';
const consumerMoscow = 'https://77.rospotrebnadzor.ru/';
const transport = 'https://rostransnadzor.gov.ru/';
const city112 = 'https://www.mos.ru/emercom/function/sistema-112/';
const gas = 'https://www.mos-gaz.ru/press-service/publications/2025/08/21/6830';
const policeMoscow = 'https://77.мвд.рф/';
const nationalGuard = 'https://77.rosguard.gov.ru/';

addContext('complaint-wrong-procedure', null, [
  'https://www.mos.ru/upload/content/files/d8fca445f3b983500e6a5ac0792fc3fd/24PostanovleniePravitelstvaMoskviot27_03_2012N111-PP%28r.pdf',
]);
addContext('ads-channel-scope ads-service-message beer-distance beer-required-menu', moscow, ['https://moscow.fas.gov.ru/']);
addContext('ads-consent', ['Эпизод рассылки и магазин, получивший номер, относятся к городу Москве. Передача номера магазином остаётся версией заявителя.',
  'The message incident and the shop that received the number are in Moscow city. The shop passing it on remains the applicant’s theory.',
  '短信事件和收集号码的商店均涉及莫斯科市。商店转交号码仍属申请人推测。'], ['https://moscow.fas.gov.ru/', 'https://77.rkn.gov.ru/']);
addContext('ads-withdrawal-time beer-online-agegate beer-warning-area', moscowOblast, ['https://mo.fas.gov.ru/']);
addContext('anonymous-danger', ['На листе место предполагаемого события указано в городе Москве.', 'The sheet places the alleged conduct in Moscow city.', '纸面将所称行为发生地写为莫斯科市。'], [policeMoscow]);
addContext('bailiff-copy-decision bailiff-specific-petition bailiff-subordination bailiff-unsigned-complaint', [
  'Подразделение, ведущее производство: Даниловский отдел судебных приставов ГУ ФССП России по г. Москве.',
  'Enforcement office: Danilovsky Bailiff Office of the Moscow Federal Bailiff Service.',
  '办理执行案件的机构：俄罗斯联邦执行局莫斯科市总局达尼洛夫斯基执行处。',
], ['https://linkeddata.fssp.gov.ru/page/resource/agency_77005']);
addContext('budget budget-link budget-misdirected budget-partial budget-published', [
  'В модели дела документы бюджета московского муниципального округа Нижегородский хранятся в аппарате Совета депутатов.',
  'In the exercise, the Council of Deputies office holds the budget records of Moscow’s Nizhegorodsky Municipal District.',
  '在练习设定中，莫斯科下诺夫哥罗德斯基市辖区的预算文件由区议会办事机构保存。',
], ['https://www.mun-nizh.ru/covet-deputatov/']);
addContext('conflict-creditor', [
  'Представитель нанимателя по кадровой карточке — руководитель аппарата Совета депутатов муниципального округа Нижегородский в Москве.',
  'The personnel record identifies the head of the Council of Deputies office for Moscow’s Nizhegorodsky Municipal District as the employer’s representative.',
  '人事记录显示，用人机关代表是莫斯科下诺夫哥罗德斯基市辖区议会办事机构负责人。',
], ['https://www.mun-nizh.ru/covet-deputatov/']);
addContext('complaint-access-materials', null, [consumerMoscow]);
addContext('complaint-officer-not-organ complaint-routing conflict-relative', null, [cityUtilitiesSource]);
addContext('conflict-namesake conflict-reassignment hatch-restored landfill-after-fire', [
  'Карточку ведёт подразделение Департамента жилищно-коммунального хозяйства города Москвы.',
  'The record is held by a unit of the Moscow Department of Housing and Communal Services.',
  '该记录由莫斯科市住房和公用事业局所属部门保管。',
], [cityUtilitiesSource]);
addContext('court-cancel electronic-draft-only electronic-email electronic-receipt-not-result', null, ['https://www.mos.ru/upload/documents/files/3204/3PPMot21_02_2006N112-PPOReglamentePravitelstvaMoskvi.pdf']);
addContext('court-installments court-typo-not-merits', [
  'На приложенном решении указан Симоновский районный суд города Москвы.',
  'The attached judgment identifies the Simonovsky District Court of Moscow.',
  '所附判决载明莫斯科市西蒙诺夫斯基区法院。',
], ['https://mos-gorsud.ru/rs/simonovskij']);
addContext('court-order-objections', [
  'В шапке СП-41 указан мировой судья судебного участка № 245 Симоновского судебного района города Москвы.',
  'SP-41 identifies the magistrate for precinct 245 of Moscow’s Simonovsky Judicial District.',
  'СП-41抬头载明莫斯科市西蒙诺夫斯基司法辖区第245审判区治安法官。',
], ['https://mos-gorsud.ru/rs/simonovskij/info/districts']);
addContext('driver-planned-extension driver-waiting-work', [
  'Работодатель и автобусный парк находятся в городе Москве.',
  'The employer and the depot are in Moscow city.',
  '用人单位和公交车队位于莫斯科市。',
], [labourMoscow]);
addContext('driver-shifts', [
  'Маршрут и парк перевозчика находятся в Москве. По записи можно отдельно проверить режим работников и организацию перевозки.',
  'The route and carrier’s depot are in Moscow. The record supports separate inquiries into working hours and the operation of the service.',
  '线路与承运车队在莫斯科。可根据记录分别核查工时安排和运输运营。',
], [labourMoscow, transport]);
addContext('driver-split-break', [
  'Работодатель зарегистрирован в Московской области.',
  'The employer is registered in Moscow Oblast.',
  '用人单位登记在莫斯科州。',
], ['https://git50.rostrud.gov.ru/']);
addContext('education-accreditation-scope', [
  'В деле проверяется запись федерального реестра государственной аккредитации по программе высшего образования.',
  'The file concerns an entry in the federal state-accreditation register for a higher education programme.',
  '案卷涉及联邦国家认证名录中的高等教育专业条目。',
], ['https://obrnadzor.gov.ru/']);
addContext('education-dpo-accreditation education-provider-identity education-register', [
  'В договоре указан адрес исполнителя в Калужской области. Сведения запрашиваются по лицензированию исполнителя, указанного в договоре.',
  'The contract gives the provider’s address in Kaluga Oblast. The request concerns licensing for the entity named in the contract.',
  '培训合同记载服务方位于卡卢加州。申请核查合同所列机构的许可。',
], ['https://pre.admoblkaluga.ru/sub/education/']);
addContext('egrn-letter egrn-rights-dispute egrn-source-plan', [
  'Недвижимость находится в Москве; запись ЕГРН ведёт Управление Росреестра по Москве.',
  'The property is in Moscow. The Moscow Rosreestr office holds the entry.',
  '不动产位于莫斯科，登记条目由莫斯科市登记局管理。',
], ['https://rosreestr.gov.ru/']);
addContext('egrn-map-layer', [
  'Слои показаны в Национальной системе пространственных данных, оператор — ППК «Роскадастр».',
  'The layers are displayed in the National Spatial Data System operated by Roskadastr.',
  '图层由俄罗斯地籍公法公司运营的国家空间数据系统展示。',
], ['https://nspd.gov.ru/']);
addContext('electronic-optional-attachment', [
  'В тексте обращения указан московский участок с ограждением земляных работ и номером ордера Объединения административно-технических инспекций города Москвы.',
  'The readable message identifies a Moscow site with an excavation barrier and a permit reference from the Moscow Administrative and Technical Inspectorates.',
  '可读正文指出莫斯科一处有开挖围挡的地点，并写明莫斯科市行政技术监察机构的施工许可编号。',
], ['https://www.mos.ru/oati/']);
addContext('fire-corridor-blocked fire-inside-release fire-key fire-other-exit-report landfill-current-burning', moscow,
  ['https://77.mchs.gov.ru/']);
addContext('food-manufactured-date food-no-receipt-refund', moscow, [consumerMoscow]);
addContext('food-other-batch food-recall-wrong-batch', moscowOblast, ['https://50.rospotrebnadzor.ru/']);
addContext('gas-address-correction gas-past-incident', moscow, [gas]);
addContext('gas-planned-outage gas-smell', moscow, [gas, city112]);
addContext('guard-contractor guard-current-register guard-identification-request', moscow, [nationalGuard]);
addContext('guard-property-inspection', moscow, [nationalGuard, policeMoscow]);
addContext('hatch hatch-location', moscow, [city112]);
addContext('hatch-barrier hatch-known-owner hatch-network', moscow, ['https://www.mosvodokanal.ru/']);
addContext('heritage-approved-restoration heritage-stair', [
  'Учётная карточка московского объекта находится в Департаменте культурного наследия города Москвы.',
  'The Moscow Department of Cultural Heritage holds the site record.',
  '莫斯科市文化遗产局保管该遗产对象的登记卡。',
], ['https://www.mos.ru/dkn/']);
addContext('heritage-identified-status heritage-license-not-permit', [
  'Карточку объекта ведёт Государственная инспекция по охране объектов культурного наследия Новосибирской области.',
  'The State Inspectorate for the Protection of Cultural Heritage Sites of Novosibirsk Oblast holds the site record.',
  '新西伯利亚州文化遗产保护国家监察机关保管对象登记卡。',
], ['https://publication.pravo.gov.ru/file/pdf?eoNumber=5400201901040010']);
addContext('insurance-collective insurance-collective-payoff insurance-individual-payoff insurance-individual-refusal', [
  'В комплекте отделены ранее поданное кредитору или страховщику заявление о возврате и жалоба о проверке финансовой организации. Договор и ответ приложены к жалобе.',
  'The file separates the earlier refund request to the lender or insurer from the supervisory complaint about the financial firm. The contract and reply are attached to the complaint.',
  '材料区分先前提交给贷款机构或保险人的退款申请，以及请求监管核查金融机构的投诉。合同和答复随投诉附上。',
], ['https://www.cbr.ru/reception/', 'https://www.cbr.ru/protection_rights/rassmotrenie-obrascheniy-potrebiteley-finansovykh-uslug/']);
addContext('landfill-registry-scope', null, ['https://rpn.gov.ru/regions/76/contacts/']);
addContext('landfill-territory', null, ['https://publication.pravo.gov.ru/document/6900202307030001', 'https://69.mchs.gov.ru/']);

addContext('flight-agent-receipt flight-cancel-nonrefundable flight-claim flight-weather-care', [
  'В билете перевозчик — «Северная дуга», место отправления — Москва. В МФЦ принят отдельный запрос о проверке соблюдения правил. Требование о выплате, если заявлено, предъявлено перевозчику.',
  'The ticket identifies Northern Arc as the carrier and Moscow as the departure city. The public services centre accepted a separate request for a review of compliance. Any monetary claim is addressed to the carrier.',
  '机票上承运人为“北方弧线”，出发地为莫斯科。政务服务中心收到核查规则执行情况的单独请求。如有金钱要求，向承运人提出。',
], []);
addContext('flight-claim flight-weather-care', null, [transport]);
addContext('flight-agent-receipt', null, [transport, consumerMoscow]);
addContext('flight-cancel-nonrefundable', null, [consumerMoscow]);

storiesA['flight-weather-care'].meritsNote = [
  'По пункту 99(2) Федеральных авиационных правил № 82 при отправлении в 08:00 воду следовало предоставить до 11:00, горячее питание и напитки — до 14:00. Воду в 10:30 выдали в срок. К 15:00 обязанность по горячему питанию не выполнена.',
  'Under paragraph 99(2) of Federal Aviation Rules No. 82, for an 08:00 departure water was due by 11:00 and hot food and drinks by 14:00. Water at 10:30 was on time. The meal was still outstanding at 15:00.',
  '根据第82号联邦航空规则第99(2)款，原定08:00起飞，最迟应在11:00前供水、14:00前提供热餐和饮品。10:30供水符合时限，15:00仍未提供热餐。',
];

storiesA['guard-property-inspection'].docs = {
  d2: doc(['Запись эпизода О-5', 'Recording of incident O-5', 'O-5 事件记录'], [
    '{{observed}}. Охранник сказал посетителю, что задержит его, если тот не покажет сумку. На этом запись заканчивается. Был ли посетитель фактически лишён возможности уйти, по записи установить нельзя.',
    '{{observed}}. The guard told the visitor he would detain him if he refused to show his bag. The recording ends there. It does not establish whether the visitor was actually prevented from leaving.',
    '{{observed}}。保安说，如果来访者不出示包，就要把他扣下。记录至此结束，无法据此认定来访者实际上是否被阻止离开。',
  ]),
};

for (const id of ['electronic-email','electronic-draft-only','electronic-receipt-not-result']) {
  storiesA[id].actionLabels = {a2:[
    'Сверить запись о выполненной регистрации с квитанцией надлежащего поступления и проверить соблюдение срока.',
    'Match the completed registration to the delivery receipt from the proper channel and check whether it was on time.',
    '将已经完成的登记与正式渠道的收件凭证核对，并检查登记是否及时。',
  ]};
  storiesA[id].meritsNote = [
    'Запись в журнале МФЦ подтверждает регистрацию {{registered}}. Достаточно проверить её своевременность по дате надлежащего поступления. Повторная регистрация не требуется. Квитанция о доставке сама по себе не подтверждает решение по существу.',
    'The intake register confirms registration on {{registered}}. Check timeliness against the date of proper receipt. No second registration is required. A delivery receipt alone does not establish a substantive decision.',
    '政务服务中心登记簿确认已于{{registered}}登记。应依据正式收件日期核查登记时限，无需重复登记。送达凭证本身不能证明已作出实质处理决定。',
  ];
}

storiesA['guard-property-inspection'].actionLabels = {a2:[
  'Передать материалы о действиях охранника в Росгвардию. При наличии сведений о возможном правонарушении направить их также в полицию.',
  'Refer the guard’s conduct to the National Guard for oversight. Forward relevant material to the police as well if there are indications of a possible offence.',
  '将保安行为交国民近卫军监督核查。如有涉嫌违法的线索，同时将相关材料转交警方。',
]};
storiesA['guard-property-inspection'].meritsNote = [
  'Запись подтверждает угрозу задержанием. Установить фактическое удержание по ней нельзя. Росгвардия рассматривает жалобу на действия охранника. Обращение в полицию также допустимо для проверки возможного правонарушения.',
  'The recording establishes a threat of detention. Actual detention remains unconfirmed. The National Guard can review the complaint about the guard’s conduct. The police can also check for a possible offence.',
  '录音能证实扣留威胁，不能证实实际扣留。国民近卫军可监督核查保安行为，也可将涉嫌违法的线索交警方核查。',
];

storiesA['electronic-receipt-not-result'].legalApplication = [
  'Сопоставить квитанцию с записью о регистрации, проверить срок регистрации и сообщить, вынесено ли решение по существу.',
  'Match the delivery receipt to the registration entry, verify timely registration and report whether a substantive decision has been made.',
  '将送达凭证与登记记录核对，检查登记是否及时，并说明是否已作出实质处理决定。',
];
storiesA['guard-property-inspection'].controlFinding = [
  'Запросить оценку угрозы задержанием и выяснить, мог ли посетитель свободно уйти. Общего ответа о лицензии недостаточно для завершения проверки.',
  'Obtain a finding on the threat of detention and establish whether the visitor was free to leave. A general reply about the licence is insufficient to close the review.',
  '应核查扣留威胁，并查明来访者能否自由离开。仅答复许可证情况不足以结案。',
];
