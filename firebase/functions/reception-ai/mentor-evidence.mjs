import {localized} from './schema.mjs';
import {participantOpening} from './participant-context.mjs';
import {mfcRoutingAlternatives} from './mfc-routing.mjs';
import {mfcAuthorityName} from './mfc-seminar.mjs';
import {hasApplicableLegalCitation, requiredSeminarActs, requiredSeminarExamples, requiredSeminarProvisions} from './normative-acts.mjs';
import {calculateWorkbookDeadline} from './workbook-calendar.mjs';
import {registrationTimely} from './workbook.mjs';

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
    return {title, number, articles, ...(exampleArticle ? {exampleArticle, exactPassage:example.quote.slice(0, 1500)} : {})};
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
  const recipients = guide.coreStepsVersion ? mfcRoutingAlternatives(c)?.map(set =>
    set.map(authority => mfcAuthorityName(authority, language))) : null;
  return {stage:guide.currentStep, status, documents, ...(guide.coreStepsVersion ? {workspace:guidedWorkspace[language]} : {}),
    participantOpening:participantOpening(c, language),
    participantDialogue:state.messages.slice(1).slice(-6).map(({role,text}) => ({role,text:text.slice(0, 900)})),
    calendar:calendarEvidence(workbook, guide.decision), recipients, legalSources:legalEvidence(c),
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
