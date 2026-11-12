import {createHash} from 'node:crypto';
import {validateAuthoredContract,validateAuthoredDecision,evaluateAuthoredDecision,parseDateOnly} from './authored.mjs';

export const LOCALES = ['ru', 'en', 'zh'];
export const MODEL = 'gpt-6-luna';
export const PROTOCOL = 1;
export class ReceptionError extends Error {
  constructor(code, status = 400) { super(code); this.name = 'ReceptionError'; this.code = code; this.status = status; }
}
export const fail = (code, status = 400) => { throw new ReceptionError(code, status); };
export const copy = value => structuredClone(value);
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function fields(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('invalid_request');
  return value;
}
export function identifier(value, max = 120) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) || ['constructor', 'prototype', '__proto__'].includes(value) || value.length > max) fail('invalid_id');
  return value;
}
export function string(value, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /\u0000/.test(value)) fail('invalid_text');
  return value.trim();
}
export function locale(value = 'ru') { if (!LOCALES.includes(value)) fail('invalid_locale'); return value; }
export function localized(value, language = 'ru') {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(item => localized(item, language));
  if (!object(value)) return value;
  if (Object.hasOwn(value, 'ru')) return value[language] || value.ru;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localized(item, language)]));
}
function text(value, all = false) {
  if (!object(value) || typeof value.ru !== 'string' || !value.ru.trim()) fail('invalid_case', 503);
  if (all && LOCALES.some(code => typeof value[code] !== 'string' || !value[code].trim())) fail('invalid_case', 503);
  if (Object.values(value).some(item => typeof item !== 'string' || item.length > 24000)) fail('invalid_case', 503);
}
function uniqueIds(rows) {
  if (!Array.isArray(rows)) fail('invalid_case', 503);
  // Authored procedure IDs can combine legal regimes, e.g. "59+152".
  // They remain data values; request/session/Firebase-path IDs stay stricter.
  const ids = rows.map(row => {if(typeof row.id!=='string')fail('invalid_case');identifier(row.id.replaceAll('+','-'));return row.id;});
  if (new Set(ids).size !== ids.length) fail('invalid_case', 503);
  return new Set(ids);
}
function references(values, allowed, required = false) {
  if (!Array.isArray(values) || required && !values.length || new Set(values).size !== values.length || values.some(id => !allowed.has(id))) fail('invalid_case', 503);
}
export const MAX_CATALOG_CASES = 512;
export function validateCase(input) {
  return validateDossier(input,false);
}
function validateDossier(input,isVariant) {
  try {
    const c = copy(input);
    fields(c, ['id', 'version', 'public', 'actor', 'facts', 'documents', 'rubric','familyId','datePackId','dateVariants','provenance','followup']);
    identifier(c.id); string(c.version, 100);
    if(c.familyId!==undefined)identifier(c.familyId);
    if(c.datePackId!==undefined)identifier(c.datePackId);
    if(c.provenance!==undefined){
      fields(c.provenance,['sourceCaseId','sourceContentVersion','sourceSHA256','calendarYear','dateValues']);
      identifier(c.provenance.sourceCaseId);string(c.provenance.sourceContentVersion,100);
      if(c.provenance.sourceCaseId!==c.id||!/^[a-f0-9]{64}$/.test(c.provenance.sourceSHA256)||!Number.isInteger(c.provenance.calendarYear)||!object(c.provenance.dateValues))fail('invalid_case');
      for(const [key,value]of Object.entries(c.provenance.dateValues)){identifier(key);if(typeof value!=='string'&&typeof value!=='number')fail('invalid_case');}
    }
    if(c.dateVariants!==undefined){
      if(isVariant||!Array.isArray(c.dateVariants)||!c.dateVariants.length||c.dateVariants.length>12)fail('invalid_case');
      const dates=new Set([c.datePackId]);
      c.dateVariants=c.dateVariants.map(value=>{const variant=validateDossier(value,true);
        if(variant.id!==c.id||variant.version!==c.version||variant.familyId!==c.familyId||!variant.datePackId||dates.has(variant.datePackId))fail('invalid_case');
        dates.add(variant.datePackId);return variant;});
    }
    const p = fields(c.public, ['title', 'role', 'citizen', 'opening', 'date', 'procedures', 'routes', 'actions', 'sources', 'deadlinePrompt','assessment']);
    for (const key of ['title', 'opening', 'deadlinePrompt']) text(p[key], true);
    fields(p.role, ['title', 'text']); text(p.role.title, true); text(p.role.text, true);
    fields(p.citizen, ['name', 'description', 'portrait']);
    if (typeof p.citizen.name !== 'string') text(p.citizen.name, true); else string(p.citizen.name, 200);
    text(p.citizen.description, true);
    if (p.citizen.portrait !== undefined && (typeof p.citizen.portrait !== 'string' || p.citizen.portrait.length > 400 || /^(?:https?:|data:|javascript:)/i.test(p.citizen.portrait))) fail('invalid_case');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) fail('invalid_case');
    const procedures = uniqueIds(p.procedures), routes = uniqueIds(p.routes), actions = uniqueIds(p.actions);
    for (const row of [...p.procedures, ...p.routes, ...p.actions]) { fields(row, ['id', 'label']); text(row.label, true); }
    uniqueIds(p.sources);
    for (const source of p.sources) { fields(source, ['id', 'title', 'url']); text(source.title, true); if (!/^https:\/\//.test(source.url)) fail('invalid_case'); }
    fields(c.actor, ['persona', 'goal', 'knowledgeLimits', 'style', 'background']);
    for (const key of ['persona', 'goal', 'knowledgeLimits', 'style', 'background']) text(c.actor[key]);
    const facts = uniqueIds(c.facts), documents = uniqueIds(c.documents);
    if (!facts.size || facts.size > 100 || documents.size > 30) fail('invalid_case');
    for (const fact of c.facts) {
      fields(fact, ['id', 'text', 'knowledge', 'initial', 'documentIds','prompt']); text(fact.text);
      if(fact.prompt!==undefined)text(fact.prompt,true);
      if (!['direct', 'document', 'uncertain'].includes(fact.knowledge) || typeof fact.initial !== 'boolean') fail('invalid_case');
      references(fact.documentIds, documents);
    }
    for (const doc of c.documents) {
      fields(doc, ['id', 'title', 'type', 'text', 'initial', 'factIds','image','url','sensitive']);
      for (const key of ['title', 'type', 'text']) text(doc[key], true);
      if (typeof doc.initial !== 'boolean') fail('invalid_case');
      if(doc.image!==undefined&&(typeof doc.image!=='string'||!/^assets\/[A-Za-z0-9/_-]+\.(?:webp|png|jpe?g)$/.test(doc.image)))fail('invalid_case');
      if(doc.url!==undefined&&(typeof doc.url!=='string'||!/^https:\/\//.test(doc.url)))fail('invalid_case');
      if(doc.sensitive!==undefined&&typeof doc.sensitive!=='boolean')fail('invalid_case');
      references(doc.factIds, facts);
    }
    const r = fields(c.rubric, ['procedureIds', 'routeIds', 'requiredActionIds', 'forbiddenActionIds', 'criticalActionIds', 'requiredFactIds', 'evidenceGroups', 'legal', 'deadline', 'explanation','authored']);
    references(r.procedureIds, procedures, true); references(r.routeIds, routes, true);
    references(r.requiredActionIds, actions); references(r.forbiddenActionIds, actions); references(r.criticalActionIds, new Set(r.forbiddenActionIds));
    if (r.requiredActionIds.some(id => r.forbiddenActionIds.includes(id))) fail('invalid_case');
    references(r.requiredFactIds, facts);
    if (!Array.isArray(r.evidenceGroups)) fail('invalid_case');
    r.evidenceGroups.forEach(group => references(group, documents, true));
    fields(r.legal, ['number', 'articles']); string(r.legal.number, 80);
    if (!Array.isArray(r.legal.articles) || !r.legal.articles.length || r.legal.articles.some(a => typeof a !== 'string')) fail('invalid_case');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.deadline)) fail('invalid_case');
    text(r.explanation, true);
    validateAuthoredContract(c,{fields,text,uniqueIds,references,identifier,string,fail});
    return c;
  } catch (error) { throw new ReceptionError('invalid_case', 503); }
}

export function validateDecision(input, c, opened) {
  const d = fields(input, ['procedureId', 'routeId', 'actionIds', 'law', 'deadline', 'basisDocumentIds', 'reasoning','assessment']);
  const authored=Boolean(c.rubric.authored);
  if (!(authored&&d.procedureId==='')&&!c.public.procedures.some(x=>x.id===d.procedureId) || !(authored&&d.routeId==='')&&!c.public.routes.some(x=>x.id===d.routeId)) fail('invalid_decision');
  const checkIds = (ids, allowed) => {
    if (!Array.isArray(ids) || ids.length > allowed.length || new Set(ids).size !== ids.length || ids.some(id => !allowed.includes(id))) fail('invalid_decision');
  };
  checkIds(d.actionIds, c.public.actions.map(x => x.id)); checkIds(d.basisDocumentIds, opened);
  fields(d.law, ['number', 'article']); string(d.law.number,100,authored?0:1); string(d.law.article,100,authored?0:1);
  if(authored){if(d.deadline!==''&&!parseDateOnly(d.deadline))fail('invalid_decision');}
  else if(!/^\d{4}-\d{2}-\d{2}$/.test(d.deadline))fail('invalid_decision');
  string(d.reasoning, 4000, 0);
  if(c.public.assessment)validateAuthoredDecision(d.assessment,c,{fields,string,fail});
  else if(d.assessment!==undefined)fail('invalid_decision');
  return copy(d);
}

const labels = {
  procedure: {ru: 'Порядок рассмотрения', en: 'Procedure', zh: '办理程序'},
  route: {ru: 'Компетентный адресат', en: 'Competent authority', zh: '主管机关'},
  actions: {ru: 'Действия', en: 'Actions', zh: '办理措施'},
  law: {ru: 'Правовое основание', en: 'Legal basis', zh: '法律依据'},
  deadline: {ru: 'Срок', en: 'Deadline', zh: '截止日期'},
  evidence: {ru: 'Основания в материалах', en: 'Supporting documents', zh: '证明材料'}
};
const normalize = value => String(value).toUpperCase().replace(/[\s№]/g, '').replace(/[–—−]/g, '-');
export const normalizeLawNumber = value => {
  const n = normalize(value); return n.match(/^(\d+)(?:-?(?:ФЗ|FZ))?$/)?.[1] || n;
};
export const normalizeArticle = value => normalize(String(value).replace(/^\s*(?:ст(?:атья|атьи)?\.?|article|art\.?|第)\s*/i, '').replace(/\s*条\s*$/, ''));
export function evaluateDecision(c, state, decision) {
  if(c.rubric.authored)return evaluateAuthoredDecision(c,state,decision);
  const r = c.rubric, selected = new Set(decision.actionIds);
  const matches = r.requiredActionIds.filter(id => selected.has(id)).length;
  const forbidden = r.forbiddenActionIds.filter(id => selected.has(id)).length;
  const evidence = r.evidenceGroups.filter(group => group.some(id => state.openedDocumentIds.includes(id) && decision.basisDocumentIds.includes(id))).length;
  const scores = {
    procedure: [r.procedureIds.includes(decision.procedureId) ? 15 : 0, 15],
    route: [r.routeIds.includes(decision.routeId) ? 15 : 0, 15],
    actions: [Math.max(0, Math.round(25 * (r.requiredActionIds.length ? matches / r.requiredActionIds.length : 1)) - 10 * forbidden), 25],
    law: [normalizeLawNumber(decision.law.number) === normalizeLawNumber(r.legal.number) && r.legal.articles.some(a => normalizeArticle(a) === normalizeArticle(decision.law.article)) ? 15 : 0, 15],
    deadline: [decision.deadline === r.deadline ? 10 : 0, 10],
    evidence: [r.evidenceGroups.length ? Math.round(20 * evidence / r.evidenceGroups.length) : 20, 20]
  };
  const missing = r.requiredFactIds.filter(id => !state.knownFactIds.includes(id));
  let score = Object.values(scores).reduce((sum, item) => sum + item[0], 0);
  if (missing.length) score = Math.min(60, score);
  const critical = r.criticalActionIds.some(id => selected.has(id));
  if (critical) score = Math.min(40, score);
  return {score, criteria: Object.entries(scores).map(([id, [earned, max]]) => ({id, earned, max, label: labels[id]})), explanation: r.explanation,
    missingFacts: missing.map(id => c.facts.find(f => f.id === id).text), cap: critical ? 40 : missing.length ? 60 : null};
}

// This allowlist is deliberately separate from the canonical private dossier.
// A future rubric field cannot silently flow into an actor request.
export function actorCase(c, language) {
  // The authored calendar worksheet is visible from the start and supplies
  // dates for the learner's exercise. Its generic event labels cannot identify
  // a particular letter or response in the character's account.
  const documents = c.rubric.authored
    ? c.documents.filter(document => document.id !== 'dates' || !document.initial || document.factIds.length > 0)
    : c.documents;
  return localized({id: c.id, citizen: c.public.citizen, opening: c.public.opening,
    actor: c.actor, facts: c.facts, documents}, language);
}
