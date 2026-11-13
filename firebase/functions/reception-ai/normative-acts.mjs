import {readFileSync} from 'node:fs';
import {fail} from './schema.mjs';
import {calendarNorms} from './workbook-norms.mjs';

const documents = JSON.parse(readFileSync(new URL('./normative-acts-data.json', import.meta.url), 'utf8'));
const docByNumber = new Map(Object.entries(documents).map(([id, row]) =>
  [row.number.match(/(?:№|\bN)\s*(\d+(?:-\d+)?)/u)?.[1], id]));
const sourceURLs = Object.entries(documents).map(([id,row]) =>
  [row.sourceUrl.replace(/^https?:\/\/(?:www\.)?/, ''), id]);
const secondaryProvisions = {
  'budget-partial': {'reception-law61801':['7']},
  'education-register': {'reception-law140174':['91']},
  'electronic-email': {'reception-law59999':['4','7']},
  'fire-key': {'reception-law363263':['26']},
  'food-no-receipt-refund': {'reception-law305':['22']},
  'food-other-batch': {'reception-law305':['5','7','10']},
  'heritage-stair': {'reception-law37318':['45']},
  'landfill-registry-scope': {'reception-law34823':['65']},
  'noise-emergency-work': {'reception-moscow42':['2']},
  'tax-calendar-months': {'reception-law19671':['6.1']},
  'tax-simplified-statement': {'reception-law19671':['88']},
};
// Specific paragraphs for cases where the authored explanation turns on a
// particular part. Other cases accept the relevant article named in the bank.
const relevantUnits = {
  'access-counter': {'reception-law8559':['law8559-u251','law8559-u258','law8559-u261']},
  'access-guide-dog': {'reception-law8559':['law8559-u257','law8559-u258']},
  'access-reading-choice': {'reception-law8559':['law8559-u254','law8559-u255','law8559-u256','law8559-u258']},
  'access-written-dialogue': {'reception-law8559':['law8559-u255','law8559-u256','law8559-u258']},
  'ads-channel-scope': {'reception-law58968':['law58968-u243']},
  'ads-consent': {'reception-law58968':['law58968-u243']},
  'ads-withdrawal-time': {'reception-law58968':['law58968-u243']},
  'anonymous-danger': {'reception-law59999':['law59999-u68']},
  'authority-contact': {'reception-law59999':['law59999-u46','law59999-u48']},
  'bailiff-copy-decision': {'reception-law71450':['law71450-u670']},
  'bailiff-specific-petition': {'reception-law71450':['law71450-u667','law71450-u668']},
  'bailiff-unsigned-complaint': {'reception-law71450':['law71450-u1535','law71450-u1538']},
  'budget-link': {'reception-info8':['info8-u181']},
  'budget-misdirected': {'reception-info8':['info8-u175']},
  'budget-partial': {'reception-info8':['info8-u182']},
  'budget-published': {'reception-info8':['info8-u181']},
  'complaint-access-materials': {'reception-law59999':['law59999-u33']},
  'complaint-officer-not-organ': {'reception-law59999':['law59999-u52','law59999-u53']},
  'complaint-routing': {'reception-law59999':['law59999-u52','law59999-u53']},
  'complaint-wrong-procedure': {'reception-law103023':['law103023-u224','law103023-u234']},
  'court-cancel': {'reception-law59999':['law59999-u69']},
  'driver-planned-extension': {'reception-driver160':['driver160-u35','driver160-u36']},
  'driver-split-break': {'reception-driver160':['driver160-u39']},
  'driver-waiting-work': {'reception-driver160':['driver160-u44']},
  'egrn-letter': {'reception-law182661':['law182661-u1393']},
  'egrn-map-layer': {'reception-law182661':['law182661-u1393','law182661-u1396']},
  'egrn-rights-dispute': {'reception-law182661':['law182661-u1400']},
  'egrn-source-plan': {'reception-law182661':['law182661-u1393','law182661-u1396']},
  'electronic-draft-only': {'reception-law59999':['law59999-u25']},
  'electronic-email': {'reception-law59999':['law59999-u25','law59999-u44','law59999-u47']},
  'electronic-receipt-not-result': {'reception-law59999':['law59999-u47']},
  'fire-corridor-blocked': {'reception-law363263':['law363263-u91']},
  'fire-inside-release': {'reception-law363263':['law363263-u86']},
  'fire-key': {'reception-law363263':['law363263-u86']},
  'fire-other-exit-report': {'reception-law363263':['law363263-u86']},
  'flight-weather-care': {'reception-flight82':['flight82-u315']},
  'food-no-receipt-refund': {'reception-law305':['law305-u224','law305-u239']},
  'guard-identification-request': {'reception-law491941':['law491941-u254','law491941-u256']},
  'guard-property-inspection': {'reception-law491941':['law491941-u233','law491941-u236','law491941-u239']},
  'hatch': {'reception-law59999':['law59999-u48']},
  'hatch-location': {'reception-law59999':['law59999-u48']},
  'hatch-network': {'reception-law59999':['law59999-u48']},
  'insurance-collective-payoff': {'reception-law155986':['law155986-u432']},
  'insurance-collective': {'reception-law155986':['law155986-u309','law155986-u313']},
  'insurance-individual-payoff': {'reception-law155986':['law155986-u434']},
  'insurance-individual-refusal': {'reception-law155986':['law155986-u433']},
  'noise-emergency-work': {'reception-moscow42':['moscow42-u26']},
  'noise-two-subjects': {'reception-law59999':['law59999-u50','law59999-u52']},
  'proposal-bench': {'reception-law59999':['law59999-u26']},
  'proposal-one-resident': {'reception-law59999':['law59999-u17']},
  'proposal-representative-limits': {'reception-law59999':['law59999-u33']},
  'proposal-vote-not-budget': {'reception-law59999':['law59999-u17']},
  'readable-attachment': {'reception-law59999':['law59999-u71','law59999-u72']},
  'several-issues': {'reception-law59999':['law59999-u50']},
  'several-minimum-attachments': {'reception-law59999':['law59999-u39']},
  'several-partial-response': {'reception-law59999':['law59999-u59','law59999-u62']},
  'several-repair-and-complaint': {'reception-law59999':['law59999-u48','law59999-u50','law59999-u52']},
  'sickpay-child-care': {'reception-law64871':['law64871-u91']},
  'sickpay-data': {'reception-law64871':['law64871-u352']},
  'sickpay-refusal-notice': {'reception-law64871':['law64871-u353']},
  'sickpay-two-payers': {'reception-law64871':['law64871-u88','law64871-u89']},
  'tax-amended-declaration': {'reception-law19671':['law19671-u2657']},
  'tax-calendar-months': {'reception-law19671':['law19671-u142','law19671-u145','law19671-u146','law19671-u2617']},
  'tax-explanations-only': {'reception-law19671':['law19671-u2628','law19671-u2633','law19671-u2634','law19671-u2657']},
  'tax-simplified-statement': {'reception-law19671':['law19671-u2622']},
  'unclear-subject': {'reception-law59999':['law59999-u72']},
  'unreadable-body': {'reception-law59999':['law59999-u71']},
};
export function applicableLegalUnits(c, docId) {
  if(c.id.startsWith('repeat-') && docId==='reception-law59999')return ['law59999-u73'];
  return relevantUnits[c.id]?.[docId] || null;
}

const primaryId = knowledge => knowledge?.number === '273' ?
  ({'2008-12-25':'corruption273','2012-12-29':'reception-law140174'}[knowledge.actDate]) :
  docByNumber.get(knowledge?.number);
const sourceId = url => sourceURLs.find(([prefix]) =>
  String(url).replace(/^https?:\/\/(?:www\.)?/, '').startsWith(prefix))?.[1];

export function normativeActsForCase(c) {
  const knowledge = c.rubric?.authored?.knowledge;
  const calendar = c.rubric?.authored?.calendar ? calendarNorms(c) : [];
  const ids = new Set([
    primaryId(knowledge), ...Object.keys(secondaryProvisions[c.id] || {}),
    ...calendar.map(row => sourceId(row.url)),
  ]);
  return [...ids].filter(Boolean).map(id => ({id, title:documents[id].title, number:documents[id].number}));
}

export function acceptableLegalProvisions(c) {
  const knowledge = c.rubric?.authored?.knowledge;
  const id = primaryId(knowledge);
  if (!id) return {};
  return {...secondaryProvisions[c.id], [id]:[...new Set([
    ...(knowledge.articles || []), ...(secondaryProvisions[c.id]?.[id] || []),
  ])]};
}

const unitId = /^[a-zA-Z0-9_-]{1,120}$/;
const normalizeQuote = text => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

export function validateLegalCitation(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['docId','unitIds','text'].includes(key)) ||
      typeof value.docId !== 'string' || !Object.hasOwn(documents,value.docId) ||
      !Array.isArray(value.unitIds) || value.unitIds.length < 1 || value.unitIds.length > 64 ||
      value.unitIds.some(id => typeof id !== 'string' || !unitId.test(id)) ||
      new Set(value.unitIds).size !== value.unitIds.length ||
      typeof value.text !== 'string' || value.text.length > 12000 ||
      value.text.includes('\0') || !normalizeQuote(value.text)) fail('invalid_decision');
  return {docId:value.docId, unitIds:[...value.unitIds], text:value.text.trim()};
}

let corpus;
export function hasApplicableLegalCitation(c, citation) {
  if (!citation) return false;
  const provisions = acceptableLegalProvisions(c)[citation.docId];
  if (!provisions) return false;
  corpus ||= JSON.parse(readFileSync(new URL('./normative-provisions.json', import.meta.url), 'utf8'));
  const quote = normalizeQuote(citation.text);
  if (quote.length < 24) return false;
  const allowed = applicableLegalUnits(c,citation.docId);
  return provisions.some(provision => {
    const units = corpus[citation.docId]?.[provision];
    if (!units) return false;
    const index = units.findIndex(([id]) => id === citation.unitIds[0]);
    const selected = units.slice(index, index + citation.unitIds.length);
    if (index < 0 || selected.length !== citation.unitIds.length ||
        selected.some(([id],i) => id !== citation.unitIds[i]) ||
        allowed && !selected.some(([id]) => allowed.includes(id))) return false;
    if (selected.length === 1) return selected[0][1].includes(quote);
    const [first,...rest] = selected.map(([, text]) => text);
    const last = rest.pop();
    const joined = [first, ...rest, last].join(' ');
    const start = joined.indexOf(quote);
    return start >= 0 && start < first.length && start + quote.length > joined.length - last.length;
  });
}
