import {MFC_ROUTING_AUTHORITY_IDS, ROUTING_AUTHORITIES, ROUTING_AUTHORITY_ALIASES, ROUTING_TERRITORIES} from './routing-directory.mjs';
import {publicRoutingWorkflow} from './routing-workflow.mjs';
import {ReceptionError} from './schema.mjs';

const mayorOffice = 'ru-77-apparat-mera-i-pravitelstva-moskvy';
const socialProtection = 'ru-77-departament-truda-i-sotsialnoy-zashchity-naseleniya-goroda-moskvy';
const cityProperty = 'ru-77-departament-gorodskogo-imushchestva-goroda-moskvy';
const municipalCouncil = 'mos-nizhegorodsky-council';
const municipalAdministration = 'mos-nizhegorodsky-uprava';
const districtCourt = 'mos-danilovsky-court';
const cityControl = 'ru-77-glavnoe-kontrolnoe-upravlenie-goroda-moskvy';
const cityUtilities = 'mos-utilities';
const stpAmenities = 'ru-78-komitet-po-blagoustroystvu-sankt-peterburga';
const kalugaEducation = 'ru-40-ministerstvo-obrazovaniya-i-nauki-kaluzhskoy-oblasti';
const novosibirskHeritage = 'ru-54-gosudarstvennaya-inspekciya-po-ohrane-obektov-kulturnogo-naslediya-novosibirskoy-oblasti';

// The intake desk hands specific tasks to competent organizations.
// The original bank/workbook assignments are separate.
const singleRecipients = {
  [mayorOffice]: `court-cancel electronic-draft-only electronic-email electronic-receipt-not-result repeat-other-authority repeat-routing-only unclear-subject unreadable-body`,
  [socialProtection]: `mfc-institution`,
  [cityProperty]: `mfc-change-not-typo mfc-correction-overdue mfc-interagency-silence mfc-service-not-overdue mfc-service-refusal mfc-typo-issuer`,
  [municipalCouncil]: `budget budget-link budget-misdirected budget-partial budget-published conflict-creditor`,
  [municipalAdministration]: `proposal-bench`,
  [districtCourt]: `court-installments court-typo-not-merits`,
  [cityUtilities]: `complaint-officer-not-organ complaint-routing conflict-namesake conflict-reassignment conflict-relative hatch-restored landfill-after-fire noise-emergency-work readable-attachment repeat-acknowledgements repeat-no-new repeat-same-arguments separate-waste-chain several-partial-response waste-chain-ready waste-container-fractions waste-site-register`,
  [stpAmenities]: `proposal-one-resident proposal-representative-limits proposal-vote-not-budget`,
  [kalugaEducation]: `education-dpo-accreditation education-provider-identity education-register`,
  [novosibirskHeritage]: `heritage-identified-status heritage-license-not-permit`,
  'mos-mfc-director': `access-counter access-guide-dog access-reading-choice access-written-dialogue complaint-wrong-procedure mfc-delay mfc-extra-paper mfc-identity-required mfc-ready-not-issued mfc-refusal mfc-territorial-choice mfc-typo-refusal`,
  'krasnogorsk-mfc-director': `mfc-second-demand`,
  'mos-housing-subsidy-centre': `mfc-voluntary-document`,
  'fas-moscow': `ads-channel-scope ads-service-message beer-distance beer-required-menu`,
  'fas-mo': `ads-withdrawal-time beer-online-agegate beer-warning-area`,
  'police-moscow': `anonymous-danger`,
  'rpn-moscow-kaluga': `authority-contact`,
  'mos-fssp-danilovsky': `bailiff-copy-decision bailiff-specific-petition`,
  'mos-fssp-danilovsky-chief': `bailiff-subordination bailiff-unsigned-complaint`,
  'mos-magistrate-245': `court-order-objections`,
  'git-moscow': `driver-planned-extension driver-waiting-work salary-documents-request salary-partial`,
  'git-mo': `driver-split-break salary-gross-net salary-late-compensation`,
  'rosobrnadzor': `education-accreditation-scope`,
  'mos-rosreestr': `egrn-letter egrn-rights-dispute egrn-source-plan`,
  'roskadastr': `egrn-map-layer`,
  'mos-streets': `electronic-optional-attachment sidewalk-updated-permit`,
  'mos-mchs': `fire-corridor-blocked fire-inside-release fire-key fire-other-exit-report landfill-current-burning`,
  'rostransnadzor': `flight-claim flight-weather-care`,
  'rpn-consumer-moscow': `complaint-access-materials flight-cancel-nonrefundable food-manufactured-date food-no-receipt-refund noise-ventilation sign-light-restored`,
  'rpn-consumer-mo': `food-other-batch food-recall-wrong-batch`,
  'mos-mosgaz': `gas-address-correction gas-past-incident`,
  'mos-rosgvardiya': `guard-contractor guard-current-register guard-identification-request`,
  'mos-mosvodokanal': `hatch-barrier hatch-known-owner hatch-network`,
  'mos-system112': `hatch hatch-location repeat-new-facts trees-current-danger`,
  'mos-heritage': `heritage-approved-restoration heritage-stair`,
  'bank-of-russia': `insurance-collective insurance-collective-payoff insurance-individual-payoff insurance-individual-refusal`,
  'rpn-upper-volga': `landfill-registry-scope`,
  'tver-environment': `landfill-territory`,
  'mo-silence': `noise-other-region`,
  'mos-health': `oms-free-slot`,
  'mos-ambulance': `oms-urgent-now`,
  'mos-central-customs': `parcel-customs-notice`,
  'rkn-central': `parcel-damaged-delivery parcel-release parcel-wrong-tracking privacy privacy-aggregate privacy-consent-scope privacy-withdrawal`,
  'ru-77-departament-informatsionnykh-tekhnologiy-goroda-moskvy': `privacy-own-record privacy-restricted-access`,
  'mos-environment': `river-observation river-old-photo trees-permit-matches trees-pruning-scope`,
  'mo-environment': `trees-other-site`,
  'mos-rosselkhoznadzor': `seedlings-batch seedlings-electronic seedlings-lab-not-certificate seedlings-outside-zone`,
  'mos-sfr': `sickpay-child-care sickpay-data sickpay-refusal-notice sickpay-two-payers`,
  'mos-gormost-road': `sidewalk-restoration sidewalk-safe-detour`,
  'mos-signs-department': `sign-night-measurement`,
  'mos-codd': `signal-night-fault signal-other-crossing signal-timing-proposal`,
  'mos-fns-25': `tax-amended-declaration tax-calendar-months tax-explanations-only tax-simplified-statement`,
};

const multipleRoutes = {
  'ads-consent': [['fas-moscow','rkn-central']],
  'driver-shifts': [['git-moscow'], ['rostransnadzor']],
  'flight-agent-receipt': [['rostransnadzor','rpn-consumer-moscow']],
  'gas-planned-outage': [['mos-mosgaz'], ['mos-system112']],
  'gas-smell': [['mos-mosgaz'], ['mos-system112']],
  'guard-property-inspection': [['mos-rosgvardiya','police-moscow']],
  'noise-two-subjects': [['mos-system112','police-moscow'], ['police-moscow']],
  'oms-other-region': [['mos-oms-fund'], ['mos-health']],
  'oms-paid-offer': [['mos-health'], ['mos-oms-fund']],
  'several-issues': [['mos-transit','rkn-central']],
  'several-minimum-attachments': [['mo-transit','rkn-central']],
  'several-repair-and-complaint': [['mos-gormost-road',cityControl]],
  'sidewalk-boundary': [['mos-streets'], ['mos-gormost-road']],
  'sign-not-ad': [['mos-signs-department','rpn-consumer-moscow']],
  'sign-promotion': [['fas-moscow','mos-signs-department']],
  'signal-visibility': [['mos-codd',cityUtilities], ['mos-transit',cityUtilities]],
};

const mfcRecipients = Object.freeze(Object.fromEntries([
  ...Object.entries(singleRecipients).flatMap(([recipient, cases]) => cases.split(' ').map(id => [id, [[recipient]]])),
  ...Object.entries(multipleRoutes),
]));

const local = (ru, en, zh) => ({ru,en,zh});
const facts = [
  [`${singleRecipients['mos-mfc-director']} mfc-institution`,
    local('Событие произошло в филиале ГБУ МФЦ города Москвы.', 'The event took place at a branch of the Moscow Public Services Centres.', '事件发生在莫斯科市多功能政务服务中心的一个分部。')],
  [`mfc-second-demand`,
    local('Выписку ЕГРН заказывали в муниципальном МФЦ городского округа Красногорск Московской области.', 'The property register extract was requested at the municipal public services centre in Krasnogorsk, Moscow Oblast.', '不动产登记摘录是在莫斯科州克拉斯诺戈尔斯克市辖区的市政多功能政务服务中心申请的。')],
  [`mfc-voluntary-document`,
    local('Заявитель добровольно представил справку при оформлении жилищной субсидии в ГКУ города Москвы «Городской центр жилищных субсидий». Справку отказался принять работник учреждения.', 'The applicant voluntarily submitted a document in their housing subsidy application to the Moscow City Housing Subsidy Centre. A staff member of the centre refused to accept it.', '申请人在莫斯科市住房补贴中心办理住房补贴时自愿提交证明，中心的一名工作人员拒绝接收。')],
  [singleRecipients[cityProperty],
    local('В деле о городской услуге по сведениям о жилищном фонде до 31 января 1998 года органом-поставщиком указан Департамент городского имущества Москвы. Жалоба касается обычного решения органа или действия специалиста.', 'The case concerns the city service for records on housing rights registered before 31 January 1998, provided by the Moscow City Property Department. The complaint concerns a routine agency decision or a staff member’s conduct.', '本案涉及莫斯科市提供的1998年1月31日前登记的住房权利信息服务。提供方为市财产局。投诉针对该局的一般决定或经办人员的行为。')],
  [`court-cancel electronic-draft-only electronic-email electronic-receipt-not-result unclear-subject unreadable-body`,
    local('В карточке указано, что за делопроизводство по этому заявлению отвечает Аппарат Мэра и Правительства Москвы.', 'The record identifies the Office of the Mayor and Government of Moscow as responsible for the processing of this submission.', '登记卡显示，该来件的文书处理由莫斯科市长和市政府办公厅负责。')],
  [`repeat-other-authority repeat-routing-only`,
    local('Вопрос касается порядка записи на личный приём в Аппарате Мэра и Правительства Москвы.', 'The question concerns how to book an appointment with the Office of the Mayor and Government of Moscow.', '问题涉及如何预约莫斯科市长和市政府办公厅的面谈。')],
  [`bailiff-copy-decision bailiff-specific-petition bailiff-subordination bailiff-unsigned-complaint`,
    local('В карточке производства указан Даниловский ОСП ГУ ФССП России по г. Москве. Обжалуемое действие относится к приставу-исполнителю.', 'The enforcement file identifies Moscow’s Danilovsky Bailiff Office. Any challenged conduct is that of the executing bailiff.', '执行案卷注明由莫斯科市达尼洛夫斯基执行处办理。涉及投诉的行为由执行员作出。')],
  [singleRecipients[districtCourt],
    local('На копии решения указан Симоновский районный суд города Москвы.', 'The copy of the judgment identifies the Simonovsky District Court of Moscow.', '裁判文书副本载明作出裁判的是莫斯科市西蒙诺夫斯基区法院。')],
  [`court-order-objections`,
    local('Судебный приказ вынес мировой судья участка № 245 Симоновского судебного района Москвы.', 'The court order was issued by the magistrate for Precinct No. 245 of the Simonovsky Judicial District in Moscow.', '支付令由莫斯科市西蒙诺夫斯基司法辖区第245审判区的治安法官签发。')],
  [`budget-link budget-partial budget-published`,
    local('Документы муниципального округа Нижегородский находятся в аппарате Совета депутатов.', 'The Nizhegorodsky Municipal District records are held by the Council of Deputies.', '下诺夫哥罗德斯基市辖区的文件由该区议会办事机构保管。')],
  [`conflict-creditor`,
    local('В карточке представителем нанимателя указан руководитель аппарата Совета депутатов муниципального округа Нижегородский.', 'The record identifies the head of the Council of Deputies’ office for Nizhegorodsky Municipal District as the employer’s representative.', '登记卡注明，下诺夫哥罗德斯基市辖区议会办事机构负责人是用人机关的代表。')],
  [`complaint-access-materials`,
    local('Акт об обследовании площадки хранится в московском управлении Роспотребнадзора. В доступе ко всей папке отказал сотрудник управления.', 'The Moscow Rospotrebnadzor office holds the inspection report. An officer refused access to the entire file.', '现场检查报告由俄联邦消费者权益保护和公益监督局莫斯科市管理局保管。该局一名工作人员曾拒绝提供整份卷宗。')],
  [`complaint-officer-not-organ complaint-routing conflict-namesake conflict-reassignment conflict-relative`,
    local('Подразделение из материалов входит в Департамент ЖКХ Москвы. Вопрос о жалобе или распределении дела решает руководитель либо назначенный независимый сотрудник.', 'The unit in the record belongs to the Moscow Utilities Department. Its director or an independent officer assigned to the case handles complaints and reassignment.', '材料中的部门隶属于莫斯科市住房公用事业局。投诉及案件重新分配由负责人或独立指定的人员处理。')],
  [`readable-attachment repeat-acknowledgements repeat-no-new repeat-same-arguments`,
    local('В карточке обращения указан городской объект благоустройства, который находится в ведении Департамента ЖКХ Москвы.', 'The submission record identifies a public-space facility under the Moscow Utilities Department.', '来件登记卡载明，事涉设施由莫斯科市住房公用事业局主管。')],
  [`hatch-barrier hatch-known-owner hatch-network`,
    local('Сетевая принадлежность объекта в материалах: участок водопроводно-канализационной сети АО «Мосводоканал».', 'The records locate the asset on the water and sewer network operated by Mosvodokanal.', '材料显示，涉事设施属于莫斯科供水与排水公司运营的管网。')],
  [`tax-amended-declaration tax-calendar-months tax-explanations-only tax-simplified-statement`,
    local('В подтверждении налоговой указана инспекция ФНС № 25 по г. Москве.', 'The tax receipt identifies Moscow Federal Tax Service Inspectorate No. 25.', '税务回执注明受理机构为莫斯科市第25税务监察局。')],
  [`noise-two-subjects`,
    local('Прежнее сообщение рассматривал сотрудник районного отдела полиции Москвы. Новый ночной эпизод происходит сейчас.', 'An officer from a Moscow district police station handled the earlier report. The new incident is occurring now.', '上次报告由莫斯科某区警察局工作人员处理。新的夜间事件正在发生。')],
  [`several-repair-and-complaint`,
    local('Департамент ЖКХ поручил ремонт ГБУ «Автомобильные дороги». Инспектор И-7 подписал отчёт от Департамента. Жалоба касается достоверности отчёта о выполнении городского задания.', 'The Utilities Department commissioned the road maintenance agency. Inspector I-7 signed for the department. The complaint concerns the reliability of its report on this municipal assignment.', '住房公用事业局委托市道路维护机构施工。监察员I-7代表该局签署报告。投诉涉及市政任务完工报告的真实性。')],
  [`privacy-own-record privacy-restricted-access`,
    local('В карточке защищённого городского школьного сервиса оператором данных указан Департамент информационных технологий Москвы.', 'The record for the restricted municipal school service identifies the Moscow Department of Information Technology as the data controller.', '该市级学校服务为受限访问，登记资料注明个人数据处理机构是莫斯科市信息技术局。')],
  [`parcel-customs-notice`,
    local('Проверенное уведомление поступило из Центральной почтовой таможни.', 'Central Postal Customs issued the verified notice.', '经核实的通知由中央邮政海关发出。')],
  [`sidewalk-boundary sidewalk-restoration sidewalk-safe-detour sidewalk-updated-permit`,
    local('Эксплуатация городского участка закреплена за ГБУ «Автомобильные дороги». Ордер на земляные работы выдан ОАТИ Москвы.', 'City records identify the Moscow road maintenance agency as responsible for the site. The Moscow Administrative and Technical Inspectorates authorised the excavation.', '市政记录显示，该路段由市道路维护机构负责。开挖许可由莫斯科市行政技术监察机构签发。')],
  [`landfill-registry-scope`,
    local('Карточка объекта Э-30 относится к Тверской области. В ней подтверждён федеральный уровень экологического надзора.', 'The record places site E-30 in Tver Oblast and identifies federal environmental supervision.', '记录显示E-30场地位于特维尔州，属联邦级生态监管。')],
];

const caseContext = Object.fromEntries(facts.flatMap(([cases, context]) => cases.split(' ').map(id => [id,context])));

const limits = [
  [`unreadable-body unclear-subject`,
    local('Передайте служебное поручение об уведомлении заявителя. Само письмо остаётся в делопроизводстве и по существу не пересылается (части 4 и 4.1 статьи 11 № 59-ФЗ).', 'Send a staff instruction to notify the applicant. Keep the letter on record without forwarding it for consideration on the merits (Federal Law No. 59-FZ, Article 11(4) and (4.1)).', '发送通知申请人的内部工作指令。来件须留档，不得转交作实质审查（第59-ФЗ号联邦法第11条第4款及第4.1款）。')],
  [`court-cancel`,
    local('Передайте служебное поручение о возврате письма заявителю и разъяснении судебного порядка. Письмо не пересылается в суд как жалоба (часть 2 статьи 11 № 59-ФЗ).', 'Send a staff instruction to return the letter to the applicant and explain the court procedure. Do not forward the letter to court as an appeal (Federal Law No. 59-FZ, Article 11(2)).', '发送内部指令，将来件退回申请人并解释司法程序。来件不能作为上诉转交法院（第59-ФЗ号联邦法第11条第2款）。')],
  [`court-installments court-order-objections court-typo-not-merits`,
    local('Укажите суд как адресат надлежащего процессуального документа. Гражданин подаёт его сам установленным способом. Игровая передача не является подачей документа в суд и не прерывает процессуальный срок.', 'Identify the court that can receive the proper procedural document. The citizen files it through the prescribed process. The exercise does not file a court document or stop its deadline.', '请指明有权接收相应程序文书的法院。由公民按规定方式自行提交。游戏内转送不等于向法院提交文书，也不中断程序期限。')],
  [`egrn-rights-dispute`,
    local('Росреестр разъясняет пределы административного исправления. Спор о правах и границах разрешается в судебном порядке; передача сведений не изменяет запись.', 'Rosreestr explains the limits of administrative correction. A court hears disputes over rights and boundaries. Sharing information leaves the register entry intact.', '联邦登记局说明行政更正的权限范围。权属与界址争议由法院解决，传递信息不会改变登记记录。')],
  [`flight-claim flight-cancel-nonrefundable flight-weather-care flight-agent-receipt`,
    local('Ведомству направляются вопросы надзора и защиты прав. Претензию по перевозке или возврату пассажир предъявляет перевозчику, а претензию по действиям продавца — продавцу; учебная передача не запускает срок претензии.', 'Send oversight and rights-protection questions to the authority. The passenger makes carriage or refund claims to the carrier and claims about the seller to the seller. The exercise does not start the claim deadline.', '向主管部门转交监督及权益保护事项。旅客应向承运人提出运输或退款请求，针对售票方的请求则应向售票方提出。游戏内转送不会启动索赔期限。')],
  [`parcel-damaged-delivery parcel-release parcel-wrong-tracking`,
    local('Ведомство проверяет соблюдение правил почтовой связи. Поиск, претензию и возмещение по отправлению оформляют у почтового оператора с верным идентификатором.', 'The authority checks compliance with postal rules. Use the correct item number when asking the postal operator to trace the item or when filing a claim for compensation.', '主管部门核查邮政规则的执行情况。邮件查询、投诉及赔偿申请须凭正确编号向邮政运营商办理。')],
  [`insurance-collective insurance-collective-payoff`,
    local('Надзорную жалобу направьте в Банк России, приложив имеющийся ответ кредитора или указав отказ от передачи жалобы ему. Заявление о возврате по коллективной схеме адресуют кредитору; денежный спор после претензии рассматривает финансовый уполномоченный в пределах своей компетенции.', 'Send the supervisory complaint to the Bank of Russia. Include any response from the lender or state that you do not consent to redirection. Submit a collective-policy refund request to the lender. After a direct claim, the financial ombudsman can handle eligible monetary disputes.', '向俄罗斯央行提交监管投诉，并附上已收到的贷款机构答复或明确拒绝转交该机构。集体保险的退款申请应向贷款机构提出。先行提出请求后，金融申诉专员可受理职责范围内的金钱争议。')],
  [`insurance-individual-payoff insurance-individual-refusal`,
    local('Надзорную жалобу направьте в Банк России, приложив имеющийся ответ страховщика или указав отказ от передачи жалобы ему. Заявление о возврате по индивидуальному полису адресуют страховщику; денежный спор после претензии рассматривает финансовый уполномоченный в пределах своей компетенции.', 'Send the supervisory complaint to the Bank of Russia. Include any response from the insurer or state that you do not consent to redirection. Submit an individual-policy refund request to the insurer. After a direct claim, the financial ombudsman can handle eligible monetary disputes.', '向俄罗斯央行提交监管投诉，并附上已收到的保险人答复或明确拒绝转交保险人。个人保单的退款申请应向保险人提出。先行提出请求后，金融申诉专员可受理职责范围内的金钱争议。')],
  [`gas-address-correction gas-planned-outage gas-smell`,
    local('При запахе газа передайте оперативное сообщение из безопасного места по 104 или 112. Письменное обращение ведётся отдельно.', 'Report a gas smell from a safe place via 104 or 112. Handle the written appeal separately.', '闻到燃气气味时，应从安全地点拨打104或112紧急报告。书面诉求另行办理。')],
  [`landfill-current-burning`,
    local('Активное горение требует оперативного сообщения по 101 или 112. Проверку оставшейся свалки ведут отдельно после устранения угрозы.', 'Report active burning immediately via 101 or 112. Handle any investigation of the remaining dump separately after the immediate threat is addressed.', '正在燃烧时须立即拨打101或112。消除紧急危险后，另行处理剩余垃圾堆的调查。')],
  [`landfill-territory`,
    local('Письменный материал о площадке адресуется по месту объекта в Тверской области. Если горение продолжается, передайте оперативный сигнал по 101 или 112 отдельно.', 'Route the written material about the site to Tver Oblast, where the site is located. Report any active fire separately via 101 or 112.', '有关场地的书面材料应转交场地所在地特维尔州。如仍在燃烧，另行拨打101或112紧急报告。')],
  [`oms-urgent-now`,
    local('Сначала вызов скорой помощи по 103 или 112. В игре выбирается диспетчерская служба, реальный вызов не совершается. Жалобу о записи рассматривают отдельно.', 'Call an ambulance first via 103 or 112. Selecting the dispatch service in the exercise does not make a real call. Handle the appointment complaint separately.', '应先拨打103或112呼叫救护车。练习中选择调度机构不会真实拨号。预约投诉另行处理。')],
  [`oms-free-slot`,
    local('Департамент рассматривает вопрос информирования. Подтверждение записи и медицинские решения остаются у поликлиники.', 'The health department handles the information issue. The clinic confirms appointments and remains responsible for medical decisions.', '卫生局处理告知事项。诊所负责确认预约和作出医疗决定。')],
  [`hatch hatch-location repeat-new-facts trees-current-danger`,
    local('По текущей угрозе передайте оперативное сообщение отдельно от письменного обращения. Указывайте ориентиры события, а для письменного ответа используйте адрес заявителя.', 'Report an immediate hazard separately from the written appeal. Give landmarks for the incident and use the applicant’s address for the written reply.', '紧急危险应与书面诉求分开报告。紧急报告中提供事发地标，书面答复则使用申请人的联系地址。')],
  [`access-counter access-guide-dog access-reading-choice access-written-dialogue`,
    local('Согласованную помощь организуют на месте. Руководителю передают вопрос об условиях доступного приёма и устранении подтверждённого барьера.', 'Arrange the agreed assistance on site. Route the accessibility issue and the confirmed barrier to the service centre director.', '应在现场安排当事人同意的协助。将无障碍受理条件及已确认的障碍提交服务中心负责人处理。')],
  [`complaint-access-materials`,
    local('Передайте запрос на ознакомление с материалами уполномоченному лицу, которое не принимало первоначальный отказ. Доступ зависит от содержания каждого документа; закрытое медицинское приложение не раскрывается.', 'Send the records-access request to an authorised officer who did not make the initial refusal. Assess access for each document and withhold the restricted medical attachment.', '查阅材料的请求应由未作出初次拒绝的授权人员处理。应逐份评估查阅权限，不得披露受限的医疗附件。')],
  [`complaint-officer-not-organ complaint-routing noise-two-subjects`,
    local('Руководителю направляется жалоба на действия сотрудника. Объяснение этого сотрудника можно запросить как материал, но рассматривать жалобу и подписывать решение он не вправе.', 'Refer the complaint about the employee to their supervisor. The employee may provide an account for the record, while an independent officer reviews the complaint and signs the decision.', '对工作人员的投诉应提交其上级。可将该工作人员的说明作为材料，但投诉审查和签署决定由独立人员负责。')],
  [`ads-consent several-issues several-minimum-attachments`,
    local('Укажите компетентных адресатов в одном обращении. В учебной переписке не раскрывайте сведения о здоровье и иные данные с ограниченным доступом.', 'List the competent recipients on one appeal. Keep health information and other restricted details out of the exercise correspondence.', '在同一来件中列明有权限的接收机关。练习文书中不要披露健康信息或其他受限资料。')],
  [`mfc-institution`,
    local('Жалоба касается решения центра. Рассмотрение ведёт учредитель. Решение по исходной государственной услуге остаётся за органом-поставщиком.', 'The complaint concerns a decision of the centre and goes to its founder. The provider remains responsible for deciding the original service request.', '投诉针对服务中心的决定，由其设立机关审查。原政务服务申请仍由服务提供机关决定。')],
  [`complaint-wrong-procedure mfc-delay mfc-extra-paper mfc-identity-required mfc-ready-not-issued mfc-refusal mfc-second-demand mfc-territorial-choice mfc-typo-refusal`,
    local('Предмет жалобы — действие или бездействие сотрудника. Поручение направляется руководителю конкретного МФЦ, который не участвовал в обжалуемом эпизоде.', 'The complaint concerns an employee’s act or omission. Route it to the director of the centre concerned, who did not participate in the incident.', '投诉针对工作人员的作为或不作为。应交由未参与该事件的相关服务中心负责人处理。')],
  [`mfc-voluntary-document`,
    local('Жалоба передаётся руководителю Городского центра жилищных субсидий или его уполномоченному заместителю для рассмотрения действий работника.', 'Send the complaint to the Housing Subsidy Centre director or their authorised deputy to review the staff member’s conduct.', '投诉应提交住房补贴中心主任或其授权副主任，以审查工作人员的行为。')],
  [singleRecipients[cityProperty],
    local('В органе жалобу рассматривает уполномоченное лицо, которое не выносило обжалуемое решение. Жалоба на самого руководителя вышла бы за рамки этого дела.', 'An authorised officer who did not make the challenged decision handles the complaint. A complaint against the director would follow a different route.', '由没有作出被投诉决定的授权人员审查。若投诉对象是该局负责人，则适用不同的转交程序。')],
];

const caseBoundaries = Object.fromEntries(limits.flatMap(([cases, boundary]) => cases.split(' ').map(id => [id,boundary])));
const territoryOverrides = {
  'landfill-registry-scope':'ru-69',
  'parcel-customs-notice':'ru-50',
  'seedlings-batch':'ru-50',
  'seedlings-electronic':'ru-50',
  'seedlings-outside-zone':'ru-50',
};

function routingCase(value) {
  const caseId = typeof value === 'string' ? value : value.id;
  const story = typeof value === 'object' ? value.seminarStory : null;
  return {caseId, story, choices:story?.recipients || mfcRecipients[caseId]};
}

export function publicMfcRouting(value) {
  const {caseId, story, choices} = routingCase(value);
  if (!Object.hasOwn(mfcRecipients,caseId)) return null;
  const workflow = publicRoutingWorkflow(caseId);
  const routedTerritory = choices[0].map(id => ROUTING_AUTHORITIES[id].territoryId).find(Boolean);
  const territoryId = workflow.site?.territoryId || territoryOverrides[caseId] || routedTerritory;
  const region = ROUTING_TERRITORIES[territoryId];
  const city = caseId==='mfc-second-demand' ? region.city : workflow.site?.city || null;
  return {
    ...workflow,
    ...(region ? {site:{territoryId,territory:region.name,city,detail:workflow.site?.detail || null}} : {}),
    recipientLimit:Math.max(...choices.map(ids => ids.length)),
    // Optional co-referrals do not change the substantive response expected in the original case.
    ...(story ? {sharedReply:mfcRecipients[caseId].some(ids => ids.length > 1)} : {}),
    routingPolicy:{
      allowInternal:false,
      ...(!story && caseContext[caseId] ? {context:caseContext[caseId]} : {}),
      ...(!story && caseBoundaries[caseId] ? {boundary:caseBoundaries[caseId]} : {}),
    },
  };
}

export function validateMfcRoutingDecision(value) {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key => !['disposition','recipientIds'].includes(key))) throw new ReceptionError('invalid_decision');
  const {recipientIds,disposition} = value;
  if (disposition!=='forward' || !Array.isArray(recipientIds) || recipientIds.length<1 || recipientIds.length>2) throw new ReceptionError('invalid_decision');
  const canonicalIds = Array.from(recipientIds,id => typeof id==='string' && Object.hasOwn(ROUTING_AUTHORITY_ALIASES,id) ? ROUTING_AUTHORITY_ALIASES[id] : id);
  if (canonicalIds.some(id => !MFC_ROUTING_AUTHORITY_IDS.has(id)) || new Set(canonicalIds).size!==canonicalIds.length) throw new ReceptionError('invalid_decision');
  return {recipientIds:canonicalIds,disposition};
}

export function mfcRoutingAlternatives(value) {
  const {caseId, choices} = routingCase(value);
  if (!Object.hasOwn(mfcRecipients,caseId)) return null;
  return choices.map(ids => ids.map(id => ROUTING_AUTHORITIES[id]));
}

export function evaluateMfcRouting(caseId,value) {
  const expectedAlternatives = mfcRoutingAlternatives(caseId);
  if (!expectedAlternatives) return null;
  let selected;
  try {
    selected = validateMfcRoutingDecision(value).recipientIds;
  } catch (error) {
    if (!(error instanceof ReceptionError)) throw error;
    return {correct:false,expectedRecipients:expectedAlternatives[0],expectedAlternatives};
  }
  const matching = expectedAlternatives.find(rows => rows.length===selected.length && rows.every(({id}) => selected.includes(id)));
  return {correct:Boolean(matching),expectedRecipients:matching || expectedAlternatives[0],expectedAlternatives};
}
