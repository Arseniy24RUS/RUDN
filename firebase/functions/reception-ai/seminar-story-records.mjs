const languages = ['ru', 'en', 'zh'];
const translate = (ru, en, zh) => ({ ru, en, zh });

function displayDate(iso, language) {
  const [year, month, day] = iso.split('-');
  if (language === 'ru') return [day, month, year].join('.');
  if (language === 'zh') return year + '年' + Number(month) + '月' + Number(day) + '日';
  return iso;
}

function replaceText(text, from, to) {
  for (const language of languages) text[language] = text[language].replaceAll(from[language], to[language]);
}

const receiptLabel = translate('Поступило в МФЦ', 'Received by the public services centre', '政务服务中心接收');
const registrationLabel = translate('Зарегистрировано в МФЦ', 'Registered by the public services centre', '政务服务中心登记');
const sentLabel = translate('Отправлено', 'Sent', '发送');
const observedLabel = translate('Дата события по приложенным материалам', 'Event date in the supporting records', '附件所载事件日期');
const datedIntakeTitle = translate('Выписка из журнала регистрации МФЦ', 'Public services centre intake register extract', '政务服务中心收件登记摘录');

const electronicReceipt = translate(
  'Поступило через официальную электронную приёмную',
  'Received through the official online reception service',
  '官方电子接待系统接收',
);
const electronicCases = new Set(['electronic-draft-only', 'electronic-email', 'electronic-receipt-not-result']);

function registrationRecord(c, dates, doc) {
  const events = c.public.assessment.calendar.events;
  const original = doc.text.ru;
  const hasOriginalDate = iso => iso && original.includes(displayDate(iso, 'ru'));
  const rows = [];
  if (c.id === 'electronic-email') {
    rows.push([translate('Первое письмо на общий контактный адрес', 'First email to the general contact address', '首次发送至通用联系邮箱'), dates.sent]);
  } else if (hasOriginalDate(dates.sent) && /отправлено|отправление|^Отправлено ·/i.test(original)) {
    rows.push([sentLabel, dates.sent]);
  }
  rows.push([receiptLabel, dates.received], [registrationLabel, dates.registered]);

  // The source calendar separates intake from dates in the attached material.
  // Retain those labels, including specialised events that use the same date as intake.
  const intakeIds = new Set(['sent', 'received', 'registered']);
  const subjectEvents = events.filter(event => !intakeIds.has(event.id));
  if (hasOriginalDate(dates.observed) && /событи|наблюден|черновик/i.test(original) && !subjectEvents.some(event => event.date === dates.observed)) {
    const label = c.id === 'electronic-draft-only'
      ? translate('Создан черновик в личном кабинете', 'Draft created in the online account', '个人账户内建立草稿')
      : observedLabel;
    rows.push([label, dates.observed]);
  }
  if (electronicCases.has(c.id)) rows.push([electronicReceipt, dates.received]);
  rows.push(...subjectEvents.map(({label, date}) => [label, date]));

  const anonymous = translate(
    'Фамилия автора, контакт и адрес для индивидуального ответа не установлены.',
    'The sender’s surname, contact details and postal or electronic reply address are unknown.',
    '来件人的姓氏、联系方式和用于个别答复的地址均不明。',
  );
  doc.title = {...datedIntakeTitle};
  doc.text = Object.fromEntries(languages.map(language => {
    const lines = rows.map(([label, date]) => label[language] + ' · ' + displayDate(date, language));
    if (c.id === 'anonymous-danger') lines.push(anonymous[language]);
    return [language, lines.join('\n')];
  }));
  delete doc.image;
}

const edits = {
  'anonymous-danger': {
    documents: {
      d0: [[
        translate('Автор не установлен, заявление не проверено, отметка о регистрации отсутствует.', 'The author is unknown, the allegation is unverified and the registration field is blank.', '来件人不明，所述未经核实，登记栏为空。'),
        translate('Автор не установлен, изложенные сведения пока не проверены.', 'The author is unknown and the allegation is unverified.', '来件人不明，所述情况尚未经核实。'),
      ]],
    },
  },
  'electronic-draft-only': {
    facts: {
      q2: [[
        translate('Я написал всё в личном кабинете неделю назад. Сегодня увидел кнопку «Отправить» и нажал её. Срок уже идёт с прошлой недели?', 'I wrote everything in my account a week ago. Today I noticed the “Send” button and pressed it. Has the deadline been running since last week?', '我一周前就在个人账户里写完了。今天才看到“发送”按钮并点击。期限已经从上周开始计算了吗？'),
        translate('Сначала я сохранил текст в личном кабинете. Потом нажал «Отправить» и получил квитанцию. С какого дня идёт срок?', 'I saved the text in my account first, then pressed “Send” and got a receipt. Which date starts the deadline?', '我先在个人账户保存了文字，后来点击“发送”并取得回执。期限从哪天开始算？'),
      ]],
    },
    factSources: {q1:'d2'},
  },
  'flight-agent-receipt': {
    documents: {
      d1: [[
        translate('В данном упражнении рассчитывается крайний день рассмотрения претензии перевозчиком и уведомления по ней.', 'This exercise asks for the deadline for the carrier to consider the claim and issue its notice.', '本练习要求计算承运人审理索赔并发出通知的截止日期。'),
        translate('Срок рассмотрения претензии и уведомления отслеживается отдельно по отметке перевозчика о получении.', 'The time allowed to consider the claim and issue a notice is tracked separately, using the carrier’s own receipt record.', '索赔审理与发出通知的期限根据承运人自己的收件记录单独跟踪。'),
      ]],
    },
  },
  'flight-claim': {
    documents: {
      d1: [[
        translate('Размер ответственности в упражнении не определяется; спорные обстоятельства требуют проверки.', 'This exercise does not determine the amount of liability; disputed circumstances require checking.', '本练习不确定责任金额，争议情况需要核查。'),
        translate('Размер возмещения пока не установлен. Спорные обстоятельства требуют проверки.', 'The amount of compensation has not been determined. The disputed circumstances need to be checked.', '赔偿金额尚未确定，争议事项需要核查。'),
      ]],
    },
  },
  'electronic-receipt-not-result': {
    documents: {
      d2: [
        [
          translate('Материал ожидает регистрации, ответ по существу не готовился.', 'The material awaits registration, and no substantive reply has been prepared.', '材料等待登记，未拟定实质答复。'),
          translate('Ответ по существу не готовился.', 'No substantive reply has been prepared.', '未拟定实质答复。'),
        ],
        [
          translate('В показанном состоянии решения нет, материал ожидает регистрации.', 'At the recorded stage no decision exists, and registration is pending.', '当前无决定，材料尚待登记。'),
          translate('В карточке отсутствуют решение и исходящий ответ.', 'The record contains neither a decision nor an outgoing reply.', '记录中没有决定，也没有发出的答复。'),
        ],
      ],
    },
    factSources: {q1:'d2'},
  },
  'repeat-routing-only': {
    documents: {
      d0: [[
        translate('Учебная подборка содержит', 'The training collection contains', '教学材料包括'),
        translate('В деле имеются', 'The file contains', '卷宗内包括'),
      ]],
      d1: [[
        translate('В календарном упражнении рассчитывается срок нового зарегистрированного обращения. Это не обнуляет обязанностей и возможного нарушения сроков по предыдущему материалу.', 'The calendar exercise calculates the deadline for the newly registered appeal. This does not erase obligations or possible missed deadlines on the earlier material.', '日历练习计算新登记诉求的期限。这不会消除此前材料的办理义务或可能存在的逾期问题。'),
        translate('Повторное обращение зарегистрировано отдельно. Обязанности по прежнему обращению сохраняются. Соблюдение срока по нему проверяется отдельно.', 'The new appeal has its own registration. The obligations under the earlier appeal remain in force, and compliance with its deadline is examined separately.', '新来件已单独登记。此前来件的办理义务仍然有效，其期限遵守情况另行核查。'),
      ]],
    },
  },
  'sickpay-data': {
    documents: {
      d0: [[
        translate('выплата в календарном задании относится к СФР', "the payment in the calendar task is the Social Fund's responsibility", '日历任务中的付款属于社会基金职责'),
        translate('выплату назначает и перечисляет СФР', 'the Social Fund assesses and pays this benefit', '该待遇由社会基金核定及支付'),
      ]],
    },
    facts: {
      q1: [[translate('В учебном журнале', 'The training log', '教学登记簿'), translate('В журнале СФР', 'The Social Fund’s log', '社会基金登记簿')]],
      q3: [[translate('учебному номеру', 'training reference number', '教学编号'), translate('номеру страхового случая', 'claim reference number', '保险事项编号')]],
    },
  },
  'unreadable-body': {
    documents: {
      d1: [[
        translate('В учебной задаче нужно определить крайнюю дату сообщения о невозможности прочитать текст. Восстанавливать смысл по догадке или адресовать письмо предполагаемому ведомству не требуется.', 'The exercise requires the deadline for notifying that the text cannot be read. There is no need to reconstruct the meaning by guesswork or address the letter to a presumed authority.', '本练习要求确定通知文本无法辨读的截止日期。无需凭猜测还原含义，也无需将信件转给推测的机关。'),
        translate('Текст прочитать не удалось. Исходящего сообщения об этом пока нет. По доступным реквизитам предмет обращения и компетентное ведомство определить нельзя.', 'The text is illegible. No notice has been sent yet. The remaining details do not identify the subject or the competent authority.', '正文无法辨认，尚未发送相关通知。仅凭现有信息无法确定来件事项或主管机关。'),
      ]],
    },
  },
};

function applyEdits(rows, changes) {
  for (const [id, pairs] of Object.entries(changes || {})) {
    const row = rows.find(candidate => candidate.id === id);
    if (row) for (const [from, to] of pairs) replaceText(row.text, from, to);
  }
}

/** Update the already-localised dossier in place. dates.registered is the MFC intake registration. */
export function normalizeStoryRecords(c, dates) {
  const dateDoc = c.documents.find(doc => doc.id === 'dates');
  if (dateDoc) registrationRecord(c, dates, dateDoc);
  const edit = edits[c.id];
  applyEdits(c.documents, edit?.documents);
  applyEdits(c.facts, edit?.facts);
  if (c.id === 'electronic-draft-only') {
    const doc = c.documents.find(row => row.id === 'd2');
    if (doc) {
      // The legacy copy used the confirmation date for both sending and delivery.
      const stamp = displayDate(dates.received, 'ru');
      replaceText(doc.text,
        translate('После отправки ' + stamp + ' официальный сервис подтвердил поступление органу.', 'After submission on ' + stamp + ', the official service confirmed receipt by the authority.', '于 ' + stamp + ' 提交后，官方服务确认机关收到。'),
        translate('Официальный сервис подтвердил поступление обращения в орган ' + stamp + '.', 'The official service confirmed receipt by the authority on ' + stamp + '.', '官方服务确认机关于 ' + stamp + ' 收到来件。'));
    }
  }
  for (const [factId, docId] of Object.entries(edit?.factSources || {})) {
    const fact = c.facts.find(row => row.id === factId);
    const doc = c.documents.find(row => row.id === docId);
    if (fact && doc) {
      fact.text = Object.fromEntries(languages.map(language => [language, doc.text[language].split('\n\n')[0]]));
    }
  }
  if (c.id === 'anonymous-danger') {
    const doc = c.documents.find(row => row.id === 'd1');
    if (doc) {
      doc.text = translate(
        'Лист получен и зарегистрирован в МФЦ. Фамилии, контакта и адреса автора нет. В листе указаны место, время и сведения о возможном участнике; сведения пока не проверены.',
        'The centre received and registered the sheet. The sender’s surname, contact details and reply address are unknown. The sheet gives the place, time and details of a possible participant. These details are unverified.',
        '政务服务中心已接收并登记纸质来件。来件人的姓氏、联系方式和答复地址均不明。来件载有地点、时间和可能参与者的信息，尚未经核实。',
      );
    }
  }
  return c;
}
