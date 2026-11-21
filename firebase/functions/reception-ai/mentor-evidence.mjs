import {localized} from './schema.mjs';
import {participantOpening} from './participant-context.mjs';
import {mfcRoutingAlternatives} from './mfc-routing.mjs';
import {mfcAuthorityName} from './mfc-seminar.mjs';
import {hasApplicableLegalCitation, requiredSeminarActs, requiredSeminarExamples, requiredSeminarProvisions} from './normative-acts.mjs';
import {calculateWorkbookDeadline} from './workbook-calendar.mjs';
import {registrationTimely} from './workbook.mjs';
import {missingCoreMaterials} from './seminar-journey.mjs';

const guidedWorkspace = {
  ru:{reception:'Приёмная', records:'Материалы дела', recordsButton:'К материалам дела',
    sources:'Источники', calendar:'Календарь', routing:'Маршрут', decision:'Решение', draft:'Ответ по существу',
    followupMaterials:'Полученные материалы', requestEvidence:'Запросить подтверждения',
    mobile:{reception:'Приём',sources:'Нормы',calendar:'Сроки',routing:'Маршрут',decision:'Ответ'}},
  en:{reception:'Reception', records:'Case materials', recordsButton:'Go to case records',
    sources:'Sources', calendar:'Calendar', routing:'Routing', decision:'Decision', draft:'Substantive reply',
    followupMaterials:'Received materials', requestEvidence:'Request evidence',
    mobile:{reception:'Appeal',sources:'Sources',calendar:'Dates',routing:'Route',decision:'Reply'}},
  zh:{reception:'接待室', records:'案件材料', recordsButton:'查看案件材料',
    sources:'法律依据', calendar:'日历', routing:'办理路径', decision:'决定', draft:'实质性答复',
    followupMaterials:'已收到的材料', requestEvidence:'请求证明材料',
    mobile:{reception:'受理',sources:'依据',calendar:'期限',routing:'路径',decision:'答复'}}
};

function legalEvidence(c) {
  const passages = requiredSeminarExamples(c);
  const provisions = requiredSeminarProvisions(c);
  return requiredSeminarActs(c).map(({id, title, number}) => {
    const example = passages.find(row => row.sourceId === id);
    const citation = example && {docId:id, unitIds:example.unitIds, text:example.quote};
    const articles = provisions[id];
    const exampleArticle = citation && articles.find(article => hasApplicableLegalCitation(c, citation, {[id]:[article]}));
    return {title, number, articles, ...(exampleArticle ? {exampleArticle, exactPassage:example.quote} : {})};
  });
}

function calendarEvidence(workbook, decision) {
  if (!workbook) return null;
  const {events, targets, instructions, registrationCheck, registrationCounting, counting} = workbook;
  const expected = {referral:decision.workbook.referralDeadline, deadline:decision.deadline};
  const byId = new Map([...events, ...targets].map(row => [row.id, row]));
  const calendar = {events:events.map(({id, label, date}) => ({id, label, date})), instructions,
    deadlines:targets.map(({id, label, anchorId, amount, unit, counting:targetCounting}) => ({
      id, label, date:expected[id], anchor:byId.get(anchorId)?.label,
      anchorDate:expected[anchorId] || byId.get(anchorId)?.date, amount, unit, counting:targetCounting || counting
    }))};
  const received = byId.get('intakeReceived') ?? byId.get('received');
  const registered = byId.get('intakeRegistered') ?? byId.get('registered');
  if (registrationCheck && received && registered) {
    const rule = registrationCounting || (received.id==='intakeReceived'
      ? {start:'exclude_anchor',shift:'next_working_day',calendar:'ru-federal-five-day'} : counting);
    calendar.registration = {received:received.date, registered:registered.date,
      unadjustedDeadline:calculateWorkbookDeadline({anchorDate:received.date, ruleId:'calendar3', ...rule, shift:'no_shift'}),
      deadline:calculateWorkbookDeadline({anchorDate:received.date, ruleId:'calendar3', ...rule}),
      timely:registrationTimely(received.date, registered.date, rule)};
  }
  return calendar;
}

// Keep the record titles, wording and availability aligned with the student's workspace.
export function mentorEvidence(c, state, language, guide, workbook, status) {
  const documents = c.documents.filter(doc => state.releasedDocumentIds.includes(doc.id))
    .map(doc => ({title:localized(doc.title, language), text:localized(doc.text, language).slice(0, 3600),
      hasImage:Boolean(doc.image), opened:state.openedDocumentIds.includes(doc.id),
      linkedFacts:c.facts.filter(fact => doc.factIds.includes(fact.id)).map(fact => localized(fact.text, language))}));
  const unreadRequiredDocuments = missingCoreMaterials(c, state, guide.steps)
    .map(doc => localized(doc.title, language));
  const recipients = guide.coreStepsVersion ? mfcRoutingAlternatives(c)?.map(set =>
    set.map(authority => mfcAuthorityName(authority, language))) : null;
  return {stage:guide.currentStep, status, documents, ...(guide.coreStepsVersion ? {workspace:guidedWorkspace[language]} : {}),
    participantOpening:participantOpening(c, language),
    participantDialogue:state.messages.slice(1).slice(-6).map(({role,text}) => ({role,text:text.slice(0, 900)})),
    calendar:calendarEvidence(workbook, guide.decision), recipients, legalSources:legalEvidence(c), unreadRequiredDocuments,
    ...(status==='followup' && c.followup ? {followupNotice:localized(c.followup.intro, language)} : {})};
}

const questions = {
  ru: {
    documents:/^(?:(?:перечисли(?:те)?|назови(?:те)?) )?(?:какие )?(?:документы|материалы)(?: (?:есть|доступны|мне доступны|я могу открыть))?(?: (?:сейчас|в деле|по этому делу|по этому обращению))*$/,
    recipients:/^(?:кому|куда) (?:мфц )?(?:(?:мне |мфц )?(?:должен |должно |надо |нужно )?)?(?:передать|направить|переслать)(?: (?:это |данное )?(?:обращение|дело|материалы))?(?: и почему)?$/,
    calendar:/^(?:(?:назови(?:те)?|какие) )?(?:даты мфц|сроки(?: передачи и рассмотрения)?|срок (?:передачи|рассмотрения)|крайние сроки(?: передачи и рассмотрения)?|когда (?:поступило|зарегистрировано) обращение(?: в мфц)?|в срок ли зарегистрировано обращение)$/,
    legal:/^какие? (?:правовые источники(?: открыть| выбрать)?|статьи(?: открыть| выбрать| выделить)?)$/
  },
  en:{
    documents:/^(?:list the (?:available )?documents|what documents (?:are available|can i open))(?: (?:now|in this case))?$/,
    recipients:/^(?:who|which (?:office|authority)) (?:does|should) (?:the )?mfc (?:have to )?(?:send|refer|forward) (?:this (?:appeal|case)|the (?:appeal|case)) to(?: and why)?$/,
    calendar:/^(?:what (?:are|is) the (?:referral|review|referral and review) deadlines?|when (?:was the appeal (?:received|registered)|is the (?:review|referral) deadline)|was the appeal registered on time)$/,
    legal:/^which (?:legal (?:sources|acts)|articles) (?:can i open|should i (?:select|open|cite))$/
  },
  zh:{
    documents:/^(?:请)?(?:列出|告诉我)?(?:现在)?(?:我)?(?:可|可以|能)?(?:打开的|查看的|查阅的|用的)?文件(?:有哪些)?$/,
    recipients:/^(?:请问)?(?:mfc|政务服务中心)?(?:应该|应当|要)?(?:把此件|将来件)?转交给哪个(?:机关|部门)(?:[，,]?为什么)?$/,
    calendar:/^(?:请问)?(?:转交和审查|转交|审查|登记)(?:的)?(?:截止日|最后一天|截止日期)(?:是哪一天|是什么时候)?$/,
    legal:/^(?:请问)?我?(?:应该|应当)?(?:查阅|引用|选择)哪些(?:法律来源|法律条文|法条)$/
  }
};

const materialsIntent = {
  ru:/^(?:а\s+)?(?:ещ[её]|что ещ[её])$|^(?:(?:подскажи(?:те)?|скажи(?:те)?|пожалуйста)[, ]+)?(?:(?:какую (?:статью|норму|часть|цитату)|какой (?:пункт|фрагмент))(?: (?:мне )?(?:нужно )?(?:выбрать|выделить|отметить|цитировать|процитировать))?(?: (?:здесь|добавить|по этому делу|в нормах))?|что (?:именно )?(?:выбрать|выделить|цитировать|процитировать))$|^(?:почему (?:меня )?)?(?:не пускает|не пропускает|не переходит|не получается перейти|не могу перейти|не открывается|заблокирован[ао]?|как перейти)[^?]*?(?:календар|срок)/u,
  en:/^(?:and (?:what )?else|what else|which (?:article|provision|passage) should i (?:select|quote|choose))$|(?:can.t (?:continue|go|move)|won.t let me go) (?:to|on to) (?:the )?(?:calendar|deadlines)/u,
  zh:/^(?:还有呢|还有什么|要选哪一条|应该引用哪一条|为什么进不了期限|无法进入日历)$/u
};

const materialsCopy = {
  ru:{
    start:'На шаге «Нормы» в полном тексте выделите по одному фрагменту из каждого обязательного акта.',
    article:'ст.',
    unread:'В разделе «Материалы дела» откройте:',
    oneRecord:'В разделе «Материалы дела» откройте хотя бы один документ.',
    next:'Когда отмечены все фрагменты и открыты нужные материалы, вернитесь в «Нормы» и нажмите «К срокам».'
  },
  en:{
    start:'In Sources, select one passage from the full text of each required act.',
    article:'art.',
    unread:'In Case materials, open:',
    oneRecord:'Open at least one document in Case materials.',
    next:'Once all passages are selected and the required records are open, return to Sources and click “Go to deadlines”.'
  },
  zh:{
    start:'在「依据」中打开法规全文，从每部必选法规中选取一段。',
    article:'第',
    unread:'请在「案件材料」中打开：',
    oneRecord:'请在「案件材料」中至少打开一份文件。',
    next:'选完所有条文并打开所需文件后，回到「依据」，点击「设置期限」。'
  }
};

export function deterministicMaterialsHint({guide, text, locale}) {
  const evidence = guide.evidence;
  if (!guide.coreStepsVersion || evidence?.stage !== 'materials') return null;
  const question = text.trim().toLowerCase().replace(/[?？。.!！]+$/u, '').trim();
  if (!materialsIntent[locale].test(question) && !questions[locale].legal.test(question)) return null;
  const {legalSources, unreadRequiredDocuments, documents} = evidence;
  if (!legalSources.length || legalSources.some(source => !source.exactPassage)) return null;
  const copy = materialsCopy[locale];
  const quotes = legalSources.map(({title, number, exampleArticle, exactPassage}, index) => {
    const article = locale === 'zh' ? `第${exampleArticle}条` : `${copy.article} ${exampleArticle}`;
    return `${index + 1}. ${number} «${title}», ${article} — «${exactPassage}»`;
  });
  const unread = unreadRequiredDocuments.length
    ? [copy.unread, ...unreadRequiredDocuments.map(title => `• «${title}»`)]
    : documents.length && !documents.some(doc => doc.opened) ? [copy.oneRecord] : [];
  const reply = [copy.start, ...quotes, ...unread, copy.next].join('\n');
  return reply.length <= 3200 ? reply : null;
}

function fallbackCalendar(calendar, language) {
  if (!calendar?.deadlines.length) return null;
  const registration = calendar.registration;
  const registrationLine = registration && ({
    ru:`Последний день регистрации — ${registration.deadline}. Регистрация ${registration.timely?'своевременна':'просрочена'}.`,
    en:`Registration deadline: ${registration.deadline}. Registration was ${registration.timely?'timely':'late'}.`,
    zh:`登记截止日：${registration.deadline}。登记${registration.timely?'及时':'超期'}。`
  })[language];
  return [...calendar.events, ...calendar.deadlines].map(({label,date}) => `${label} — ${date}.`)
    .concat(registrationLine || [], calendar.instructions).join('\n');
}

// An outage must surface as an error whenever the exact request cannot be answered from the workspace.
export function groundedMentorFallback({guide, text, locale}) {
  const question = text.trim().toLowerCase().replace(/[?？。.!！]+$/u, '').trim();
  const patterns = questions[locale];
  const {documents, recipients, calendar, legalSources} = guide.evidence;
  if (patterns.documents.test(question)) {
    const titles = documents.map(doc => doc.title);
    const list = new Intl.ListFormat(locale).format(titles);
    return titles.length ? ({
      ru:`Доступные материалы: ${list}.`, en:`Available materials: ${list}.`, zh:`可以打开的文件：${list}。`
    })[locale] : null;
  }
  if (patterns.recipients.test(question) && recipients?.length) {
    const alternatives = recipients.map(set => new Intl.ListFormat(locale).format(set)).join(' / ');
    const route = guide.steps.find(step => step.id === 'route');
    // A request for the reason needs an authored explanation, not just the name.
    if (/(?:почему|why|为什么)$/u.test(question) && !guide.routingContext && !guide.routingBoundary) return null;
    return [alternatives, route?.title, guide.routingContext, guide.routingBoundary].filter(Boolean).join('\n');
  }
  if (patterns.calendar.test(question)) return fallbackCalendar(calendar, locale);
  if (patterns.legal.test(question) && legalSources.length) {
    const articleLabel={ru:'ст.',en:'art.',zh:'条'}[locale];
    return legalSources.map(({title,number,articles}) => `${title}, ${number} (${articleLabel} ${articles.join(', ')})`).join('\n');
  }
  return null;
}
