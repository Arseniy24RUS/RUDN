// Presentation-only editing of legacy authored copy. Saved answers and scoring
// snapshots keep their exact original strings. Legal qualifications stay intact.
const removedSentences = {
  ru: [
    /(?:Все адреса вымышлены|Источник не подтверждает вымышленные события сам по себе)\.\s*/g,
    /(?:Продолжительность требует пилота|Нормативные источники реальны)\.\s*/g,
    /; это учебный план, а не измеренное время и не таймер оценки/g,
    /(?:Все граждане, обращения и служебные материалы|Все люди, документы и события этого дела|Все участники и документы дела|Все граждане, организации-участники и служебные документы|Личные истории, документы и организации-участники инцидента|Граждане и все материалы инцидента|Люди, организации-участники, документы и события|Гражданин, организации-участники инцидента и материалы дела|Учебные документы и заявитель|Дело и все должности|Названия, партии и магазин|Материалы дела|Сведения|Документы) вымышлены\.\s*/g,
    /Учебная ситуация: граждане, участники событий, учреждения-нарушители и служебные материалы вымышлены\.\s*/g,
    /Моделируемая публикация и документы вымышлены; реальному муниципальному органу нарушения не приписываются\.\s*/g,
    /(?:Учебные документы не являются настоящими регламентами|Реальная отправка сообщений и звонки не выполняются|Реальная отправка не производится|Реальные обращения и звонки не отправляются|Реальные сообщения не отправляются|Реальные запросы и звонки игра не выполняет|Реальные отправления, звонки, проверки, списания и изменения реестров из игры не выполняются|Реальных звонков, отправки жалоб, выдачи разрешений, санкций и реестровых изменений игра не выполняет|В тренажёре звонки не выполняются|В игре сообщение моделируется: реального звонка нет|Учебные обращения никуда не отправляются)\.\s*/g,
    /Не назначаете лечение, не применяете реальные санкции и не отправляете настоящие обращения\.\s*/g,
    /(?:Адаптация исходного варианта \d+|Никаких реальных ФИО и диагнозов здесь нет|В документах показаны только условные поля, без реальных сведений о детях|Игрок не загружает настоящие медицинские документы|Опись и файлы созданы исключительно для учебного дела|Это вымышленный снимок, не аудит действующего сайта|Подтверждённые в условии факты не заменяют установление аналогичных фактов в реальной работе)\.\s*/g,
    /(?:Учебная модель|Учебная ситуация|Учебное продолжение|Вымышленный департамент)\.\s*/g,
    /(?:; он не является нормативным образцом для реального МФЦ|; это не настоящий административный регламент|; это не реальная выписка реестра)/g,
  ],
  en: [
    /“Northern School” is fictional\.\s*/g,
    /Documents show only placeholder fields, with no real children’s information\.\s*/g,
    /The player does not upload actual medical documents\.\s*/g,
    /The site and documents are fictional;\s*/g,
    /(?:The documents and applicant|Names, batches and the shop|The citizens and all incident materials|All addresses|The figures|Personal stories, documents and organisations involved in the incident) are fictional\.\s*/g,
    /(?:The information is fictional|The duration still needs to be tested in a pilot)\.\s*/g,
    /(?:Scenario: the citizens, participants, offending institutions and internal materials|Situation: citizens, event participants, offending institutions and official materials) are fictional\.\s*/g,
    /The simulated publication and documents are fictional; no violation is attributed to a real municipal body\.\s*/g,
    /The game does not place real calls(?:[^.]*)\.\s*/g,
    /All calls are simulated; no real calls are made\.\s*/g,
    /Do not prescribe treatment, impose real penalties or send actual appeals\.\s*/g,
    /(?:The duration requires a pilot|Duration requires piloting|The duration needs pilot testing|The legal sources are real|Legal sources are real)\.\s*/g,
    /; this is a teaching plan, not measured time or a grading timer/g,
    /(?:All (?:citizens|people|participants)[^.]*|The personal histories, documents and participating organisations|Personal histories, documents and participating organisations|People, participating organisations, documents and events|The citizen, organisations involved in the incident and case materials|The case and all positions|The names, batches and shop|The documents|The information|Documents) are fictional\.\s*/g,
    /(?:Training situation|Training model|Teaching follow-up|Training follow-up|A fictional department)\.\s*/g,
    /(?:The simulated publication and documents are fictional; no violation is attributed to a real municipal authority|The inventory and files were created solely for the training case|This is a fictional snapshot, not an audit of a live website|There are no real names or diagnoses here|The player does not upload real medical documents|Facts confirmed by the scenario do not replace establishing similar facts in real work|Adaptation of original variant \d+)\.\s*/g,
    /(?:Real (?:appeals|messages|requests|mailings|calls)[^.]* (?:are not sent|are not made|are not performed|are not carried out)|No real [^.]* (?:are sent|are made|are performed|are carried out)|The game (?:does not|never) (?:make|send|perform)[^.]*|In the game, the message is simulated: no real call is made|You do not prescribe treatment, impose real sanctions or send real appeals)\.\s*/g,
    /; (?:it is not a regulatory model for a real service centre|this is not an actual administrative regulation|this is not a real register extract)/g,
  ],
  zh: [
    /(?:本案)?(?:所有)?(?:人物、文件和事件|参与者和案件文件|名称、批次和商店|文件及申请人|个人经历、文件和事件参与机构|公民及事件材料)(?:均)?为虚构。\s*/g,
    /(?:情境：|情景：)?公民、事件参与者、违规机构和内部材料均为虚构。\s*/g,
    /模拟发布内容和文件均为虚构，不将违规归于任何真实市政机关。\s*/g,
    /这是虚构快照，并非对真实运行网站的审计。\s*/g,
    /根据原始变体\s*\d+\s*改编。\s*/g,
    /实际时长仍需通过试点验证。\s*/g,
    /(?:时长需经过试点验证|时长仍需试点验证|时长需要试点验证|法律来源是真实的|法律资料来源真实|法律依据来源真实)。\s*/g,
    /；这是教学计划，并非实测时间，也不是评分计时器/g,
    /(?:本案人物、文件和事件|所有公民、参与组织和公务文件|所有公民、申诉和公务材料|所有参与者和案件文件|个人经历、文件及参与机构|人物、参与机构、文件和事件|公民、事件参与组织和案件材料|公民及事件的全部材料|本案及所有职务|名称、批次和商店|案件材料|文件|信息)(?:均)?为虚构。\s*/g,
    /(?:教学情境|教学情景|教学模型|这是一个虚构部门)。\s*/g,
    /(?:教学后续情节|教学后续|后续教学情节)[：。]\s*/g,
    /(?:这里没有真实姓名或诊断|玩家不会上传真实医疗文件|题设确认的事实不能替代实际工作中对类似事实的查明|改编自原始第\s*\d+\s*题)。\s*/g,
    /(?:不会(?:实际|真正)发送[^。]*|不进行真实[^。]*|不实际发送[^。]*|游戏不会[^。]*|现实中的申诉和电话不会发送|您不进行诊疗、不实施真实处罚，也不发送真实申诉)。\s*/g,
    /[，；]并非真实公共服务中心的规范样本/g,
  ],
};

export function gameCopy(value, locale = 'ru') {
  let text = String(value ?? '');
  // These are deliberately incorrect choices about fabricating evidence.
  if (/^(?:Подготовить вымышленные документы|Prepare fictional documents|准备虚构文件)/.test(text)) return text;
  for (const pattern of removedSentences[locale] || []) text = text.replace(pattern, '');
  if (locale === 'ru') {
    text = text
      .replace(/^(?:Участник вымышленной (?:учебной )?(?:истории|ситуации)|Персонаж вымышленного (?:учебного )?дела)$/g, 'Заявитель')
      .replace(/Игрок —/g, 'Вы —')
      .replace(/вымышленному адресу/g, 'несуществующему адресу')
      .replace(/вымышленного экстренного вызова/g, 'необоснованного экстренного вызова')
      .replace(/вымышленная проверка бездействия/g, 'необоснованная проверка бездействия')
      .replace(/вымышленного результата измерений/g, 'выдуманного результата измерений')
      .replace(/, не выдавая правовой источник за подтверждение вымышленного события/g, '')
      .replace(/Реальные контактные данные студент проверяет по справке; вымышленные нарушения реальным организациям не приписываются/g, 'Контактные данные проверяйте по справке')
      .replace(/Нет, в (?:учебном )?деле используются только вымышленные сведения\./g, 'Нет, используйте материалы дела.')
      .replace(/вымышленный специальный срок/g, 'непредусмотренный специальный срок')
      .replace(/вымышленным, явно обозначенным порядком/g, 'указанным порядком')
      .replace(/вымышленн(?:ой|ом) (?=(?:раздел|рабоч|услуг|объект))/g, '')
      .replace(/Учебное продолжение:\s*/g, '')
      .replace(/(?:[Вв]ымышленн(?:ая|ого|ом|ый|ые|ое|ой|ых|ыми)\s+)?[Уу]чебн(?:ый|ая|ое|ые|ого|ому|ом|ой|ую|ым|ых|ыми)\s+(?!(?:центр|заведени|программ|план|отпуск|реставраци|билет))/g, '')
      .replace(/[Вв]ымышленн(?:ая|ого|ом|ый|ые|ое|ой|ую|ых|ыми)\s+(?=(?:организаци|департамент|порядок|выписк|документ|отдел|реестр|перевозчик|обстоятельств|дел|ситуаци|материал|факт))/g, '')
      .replace(/Смоделировать оперативную передачу диспетчеру 104\/112 без реального звонка/g, 'Передать сообщение диспетчеру 104/112')
      .replace(/В симуляции передать/g, 'Передать')
      .replace(/В модели /g, '')
      .replace(/Вымышленная стажировка/g, 'Стажировка')
      .replace(/Персонаж дела/g, 'Заявитель')
      .replace(/учебный профиль 0\.12/g, 'Профиль дела')
      .replace(/учебный номер/g, 'номер')
      .replace(/; не полный текст акта и не сведения о реальном инциденте/g, '')
      .replace(/Полностью вымышленный документ для упражнения\.\s*/g, '')
      .replace(/Не опубликован реальным ведомством\.\s*/g, '')
      .replace(/Это не настоящий административный регламент\.\s*/g, '');
  } else if (locale === 'en') {
    text = text
      .replace(/^(?:Participant in a fictional (?:training )?(?:story|situation)|Character in a fictional (?:training )?case)$/g, 'Applicant')
      .replace(/^Fictional training-case document$/g, 'Document')
      .replace(/^Fictional (?=(?:copy of the publication|sensitive attachment)$)/g, '')
      .replace(/fictional address/g, 'nonexistent address')
      .replace(/fictional emergency call/g, 'unnecessary emergency call')
      .replace(/fictional result of measurements/g, 'invented result of measurements')
      .replace(/No, only fictional information is used in the (?:training )?case\./g, 'No, use the case materials.')
      .replace(/without treating a legal source as proof of a fictional event/g, 'using the relevant legal rule')
      .replace(/The source does not itself confirm fictional events\.\s*/g, '')
      .replace(/The student checks real contact details against the reference; fictional violations are not attributed to real organisations\./g, 'Check the contact details against the reference.')
      .replace(/fictional, explicitly specified rules/g, 'specified rules')
      .replace(/fictional (?=(?:record|workflow|house|courtyard|utility operator|property management|licensed|identifier|service|placeholder|row|copy|facility|“Budget))/g, '')
      .replace(/(?:[Aa] fictional )?(?:[Tt]raining|[Tt]eaching|[Ee]ducational) (?:follow-up[:.]\s*)/g, '')
      .replace(/\b(?:[Tt]raining|[Tt]eaching|[Ee]ducational) (?=(?:case|placement|internship|service centre|MFC|document|material|extract|excerpt|record|register|registry|model|illustration|photograph|photo|description|situation|scenario|timeline|calculation|receipt|card|sample|mock-up|rule|regulation|scheme|profile|message|department|number|archive|version))/g, '')
      .replace(/\b[Ff]ictional (?=(?:training |teaching )?(?:organisation|organization|department|procedure|extract|document|case|incident|material|circumstance|registry|register|carrier|placement|internship|situation|scenario|service centre|MFC|record))/g, '')
      .replace(/ without (?:making )?a real call/g, '')
      .replace(/Simulate (?:an urgent|the urgent) (?:message|referral|notification)/g, 'Send an urgent message');
  } else if (locale === 'zh') {
    text = text
      .replace(/^(?:虚构教学故事的参与者|虚构教学案例人物|虚构教学情境参与者)$/g, '申请人')
      .replace(/虚构的(?= [AB] (?:楼|庭院))/g, '')
      .replace(/材料均属虚构，并非关于真实地点的报告。\s*/g, '')
      .replace(/玩家是/g, '您是')
      .replace(/虚构地址/g, '不存在的地址')
      .replace(/虚构的“/g, '“')
      .replace(/虚构识别号/g, '识别号')
      .replace(/虚构持证机构/g, '持证机构')
      .replace(/，不要把法律来源当作虚构事件的证明/g, '')
      .replace(/，并非真实登记簿摘录/g, '')
      .replace(/本案所有参与者和虚构案情确认：/g, '案情确认：')
      .replace(/针对既往事件的投诉，不需要虚构一次紧急呼叫。/g, '针对既往事件的投诉，无须发起不必要的紧急呼叫。')
      .replace(/无须虚构对莫斯科市不作为的调查。/g, '无须开展没有依据的莫斯科市不作为调查。')
      .replace(/公民及全部事件材料均为虚构。/g, '')
      .replace(/所有地址均为虚构。/g, '')
      .replace(/本案所有人物、文件及事件均为虚构。/g, '')
      .replace(/事件中的个人经历、文件和参与机构均为虚构。/g, '')
      .replace(/数值均为虚构。/g, '')
      .replace(/公民、事件参与机构和案卷材料均为虚构，法律来源真实。/g, '')
      .replace(/情境：公民、事件参与者、违规机构及公务材料均为虚构。/g, '')
      .replace(/学生应通过参考资料核实真实联系方式；不得将虚构违法行为归于真实机构。/g, '请通过参考资料核实联系方式。')
      .replace(/不得开具治疗方案、实施真实处罚或发送真实申诉。/g, '')
      .replace(/不需要，案例仅使用虚构信息。/g, '不需要，请使用案件材料。')
      .replace(/法律来源本身不证明虚构事件。/g, '')
      .replace(/虚构的终止通知特别期限/g, '未规定的终止通知特别期限')
      .replace(/虚构(?:的)?(?=(?:案卷|A 楼|B 庭院|公用管网|物业|占位|副本|敏感附件|设施))/g, '')
      .replace(/所有公民、参与机构和公务场地与文件为虚构；/g, '')
      .replace(/所有公民、参与机构和公务可接收物由本方案明确列出的虚构规则确定/g, '可接收物由本方案明确列出的规则确定')
      .replace(/所有公民、参与机构和公务辖区是/g, '辖区是')
      .replace(/虚构标识П-9和П-10不代表真实场地。/g, '场地标识为П-9和П-10。')
      .replace(/虚构(?=(?:摘录|工作|服务|物业))/g, '')
      .replace(/虚构(?:的)?(?=(?:教学|培训|案件|案例|机构|组织|部门|程序|文件|材料|登记|情境|情景|情况|承运人|公共服务中心|多功能|公务|事实))/g, '')
      .replace(/(?:教学|培训)(?=(?:实习|案例|案件|文件|材料|摘录|节选|记录|登记|模型|图示|示意|照片|描述|情境|情景|时间线|计算|收据|卡片|示例|规程|规定|流程|规则|消息|部门|编号|档案|版本|公共服务中心|多功能))/g, '')
      .replace(/(?:无需|不进行|没有)真实通话/g, '');
  }
  // Adjective cleanup can expose an exact legacy sentence from an older pack.
  for (const pattern of removedSentences[locale] || []) text = text.replace(pattern, '');
  const leading = String(value ?? '').match(/^\s*/)[0], trailing = String(value ?? '').match(/\s*$/)[0];
  text = text.replace(/ {2,}/g, ' ').trim();
  if(locale==='ru')text=text.replace(/^[Дд]ело\.\s*(?=Вы готовите)/u,'');
  if(locale==='en')text=text.replace(/^Case\.\s*(?=You prepare|You are preparing)/u,'');
  if (/^\p{Lu}/u.test(String(value ?? '').trim()) && /^\p{Ll}/u.test(text)) text = text[0].toLocaleUpperCase(locale) + text.slice(1);
  return text ? leading + text + trailing : '';
}
