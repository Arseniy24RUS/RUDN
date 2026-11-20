import { normalizeStoryRecords } from './seminar-story-records.mjs';
import { additionalStoryRoutes } from './seminar-story-routes.mjs';
import { storiesA } from './semstory-a.mjs';
import { storiesB } from './semstory-b.mjs';
import { ReceptionError } from './schema.mjs';
import { mfcScene } from './mfc-seminar.mjs';
import { mfcRoutingAlternatives } from './mfc-routing.mjs';

export const LEGACY_SEMINAR_STORY_VERSION = 'mfc-stories-v1';
export const SEMINAR_STORY_VERSION = 'mfc-stories-v2';
export const SEMINAR_STORY_PROGRESS_KEY = 'storyJourneyV2';
const stories = { ...storiesA, ...storiesB };
const languages = ['ru', 'en', 'zh'];
const material = { ru:'Материал дела', en:'Case record', zh:'事项材料' };
const intakeVisitor = { ru:'Посетитель приёмной', en:'Reception visitor', zh:'接待处来访者' };

function invalid(id, reason) {
  // This error is caught at the service boundary. The case ID is useful in the offline bank audit.
  const error = new ReceptionError('invalid_case', 503);
  error.storyDetail = id + ': ' + reason;
  throw error;
}

function dateVariables(c) {
  const events = c.public.assessment.calendar.events;
  const received = events.find(event => event.id === 'received')?.date;
  if (!received) invalid(c.id, 'missing receipt date');
  const beforeReceipt = days => {
    const date = new Date(received + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };
  const dates = Object.fromEntries(Object.entries(c.provenance?.dateValues || {})
    .filter(([key, value]) => key.endsWith('ISO') && typeof value === 'string')
    .map(([key, value]) => [key.slice(0, -3), value]));
  return { ...dates, received, registered:events.find(event => event.id === 'registered')?.date || received,
    priorDate:beforeReceipt(14), replyDate:beforeReceipt(6) };
}

function dateText(iso, language) {
  const [year, month, day] = iso.split('-');
  if (language === 'ru') return [day, month, year].join('.');
  if (language === 'zh') return year + '年' + Number(month) + '月' + Number(day) + '日';
  return iso;
}

function localized(entry, dates, id) {
  if (!Array.isArray(entry) || entry.length !== 3) invalid(id, 'expected three translations');
  return Object.fromEntries(languages.map((language, index) => {
    if (typeof entry[index] !== 'string' || !entry[index].trim()) invalid(id, 'missing ' + language);
    const value = entry[index].replace(/\{\{([^}]+)\}\}/g, (_, name) => {
      if (!Object.hasOwn(dates, name)) invalid(id, 'unbound date ' + name);
      return dateText(dates[name], language);
    });
    return [language, value.trim()];
  }));
}

function joined(first, second) {
  return Object.fromEntries(languages.map(lang => [lang, [typeof first === 'string' ? first : first[lang], second[lang]].filter(Boolean).join('\n\n')]));
}

// Authored headings for the six legacy document titles which refer to the simulator.
const documentTitles = {
  'Учебная схема полномочий':['Выписка о полномочиях', 'Extract on departmental powers', '职权摘录'],
  'Учебное извлечение из перечня':['Выписка из перечня', 'Extract from the list', '清单摘录'],
  'Распоряжение учебного МФЦ':['Распоряжение МФЦ', 'MFC order', '多功能中心指令'],
  'Опись учебного архива':['Опись архива', 'Archive inventory', '档案目录'],
  'Состояние учебного раздела сайта':['Копия страницы сайта', 'Copy of the website page', '网站页面副本'],
  'Выписка из учебного реестра сетей':['Выписка из реестра сетей', 'Utility network register extract', '管网登记册摘录'],
};

export function withSeminarStory(source) {
  if (source.seminarStory?.version === SEMINAR_STORY_VERSION) return structuredClone(source);
  const entry = stories[source.id];
  if (!entry) invalid(source.id, 'missing story');
  const c = structuredClone(source);
  delete c.dateVariants;
  const dates = dateVariables(c);
  const read = value => localized(value, dates, c.id);
  const opening = read(entry.opening);
  const priorContact = read(entry.prior);
  const purpose = read(entry.purpose);
  c.version += '.' + SEMINAR_STORY_VERSION;
  c.public.opening = opening;
  for (const [id, words] of Object.entries(entry.actionLabels || {})) {
    const action = c.public.actions.find(row => row.id === id);
    if (!action) invalid(c.id, 'unknown action ' + id);
    action.label = read(words);
  }
  if (entry.meritsNote) c.rubric.explanation = joined(read(entry.meritsNote), c.rubric.explanation);
  c.public.role = {title:{...mfcScene.title}, text:{...mfcScene.text}};
  c.actor.goal = purpose;
  c.actor.background = priorContact;
  if (/учебн.*истори|вымышленн/i.test(c.public.citizen.description.ru)) c.public.citizen.description = intakeVisitor;
  c.actor.persona = joined(c.public.citizen.name, c.public.citizen.description);
  for (const d of c.documents) {
    if (documentTitles[d.title.ru]) d.title = read(documentTitles[d.title.ru]);
    if (/учебн|вымышленн/i.test(d.type.ru)) d.type = material;
  }
  for (const [id, replacement] of Object.entries(entry.docs || {})) {
    const doc = c.documents.find(row => row.id === id);
    if (!doc) invalid(c.id, 'unknown document ' + id);
    doc.title = read(replacement.title);
    doc.text = read(replacement.text);
    // The source illustration depicts an older document. Use the new legible text.
    delete doc.image;
  }
  for (const extra of entry.extraDocs || []) {
    const title = read(extra.title), text = read(extra.text);
    if (extra.stage === 'control') {
      if (!c.followup) invalid(c.id, 'control document without follow-up');
      c.followup.intro = joined(title, text);
      continue;
    }
    if (c.documents.some(row => row.id === extra.id)) invalid(c.id, 'duplicate document ' + extra.id);
    c.documents.push({id:extra.id, title, text, type:material, initial:true, factIds:[]});
  }
  const evidenceDoc = c.documents.find(row => row.id === entry.docId);
  if (!evidenceDoc) invalid(c.id, 'unknown evidence document ' + entry.docId);
  evidenceDoc.text = joined(evidenceDoc.text, read(entry.evidence));
  for (const [id, wording] of Object.entries(entry.factTexts || {})) {
    const fact = c.facts.find(row => row.id === id);
    if (!fact) invalid(c.id, 'unknown fact ' + id);
    fact.text = read(wording);
  }
  normalizeStoryRecords(c, dates);
  const legalApplication = entry.legalApplication && read(entry.legalApplication);
  if (legalApplication) {
    const option = c.public.assessment.knowledge.options.find(row => row.id === c.rubric.authored.knowledge.correct);
    if (!option) invalid(c.id, 'missing legal application');
    option.label = legalApplication;
  }
  if (entry.controlFinding) {
    const option = c.followup?.options.find(row => row.id === c.followup.correct);
    if (!option) invalid(c.id, 'missing follow-up outcome');
    option.label = read(entry.controlFinding);
    c.followup.explanation = option.label;
  }
  const routeDocumentId = entry.routeDocId || evidenceDoc.id;
  if (!c.documents.some(doc => doc.id === routeDocumentId)) invalid(c.id, 'missing routing evidence');
  const reviewedRoutes = additionalStoryRoutes[c.id];
  const originalRoutes = entry.recipients || mfcRoutingAlternatives(c.id).map(rows => rows.map(row => row.id));
  c.seminarStory = {version:SEMINAR_STORY_VERSION, routeDocumentId,
    ...(entry.docs ? {textOnlyDocumentIds:Object.keys(entry.docs)} : {}),
    ...(legalApplication ? {legalApplication} : {}),
    participant:{service:opening, priorContact, purpose},
    recipients:structuredClone([...originalRoutes, ...(reviewedRoutes?.recipients || [])]),
    authoritySources:[...new Set([...entry.authoritySources, ...(reviewedRoutes?.sources || [])])]};
  if (c.id === 'complaint-routing') {
    c.seminarStory.exampleDialogue = {
      factId:'subject', documentId:routeDocumentId,
      prompt:read(['По чему вы поняли, что проверили другое место?', 'How could you tell that they checked a different place?', '您是怎么发现他们检查的是另一个地方的？']),
      reply:read(['Я указал опоры № 17 и 18 у перехода рядом с остановкой «Сосновый сквер». В письме начальника написано про фонари в соседнем сквере. Ни переход, ни номера моих опор там не упомянуты. Посмотрите, я принёс копию ответа.',
        'I identified poles 17 and 18 by the crossing at the Sosnovy Skver stop. The division head wrote about the lights inside the neighbouring square. The crossing and my pole numbers are missing. I brought a copy of the reply.',
        '我写明了松树小广场公交站旁人行横道边的17号和18号灯杆。处长的答复说的是隔壁广场里面的路灯，没有提到人行横道，也没提这两个编号。我带来了答复的副本。'])
    };
  }
  return c;
}
