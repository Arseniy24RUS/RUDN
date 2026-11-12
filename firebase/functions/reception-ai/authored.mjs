/** Server-only assessment of the complete authored bank. The formula follows
 * reception/js/engine.js, documents.js and evidence.js; no model grades answers. */
import {referenceNumber, referenceUnit} from './legal-reference.mjs';

export function parseDateOnly(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) s = s.split('.').reverse().join('-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y,m,d] = s.split('-').map(Number), date = new Date(Date.UTC(y,m-1,d));
  return y >= 1900 && y <= 9999 && date.getUTCFullYear() === y && date.getUTCMonth() === m-1 && date.getUTCDate() === d ? s : null;
}

export function normalizeEvidence(value, kind = 'text') {
  const s = String(value ?? '').normalize('NFKC').toLowerCase().replace(/ё/g,'е').trim();
  if (kind === 'phone') {
    if (/(?:доб|ext|[a-zа-я])/i.test(s)) return '';
    let n = s.replace(/[\s()+.\-–—]/g,''); if (!/^\d{10,11}$/.test(n)) return '';
    if (n.length === 10) n = '8'+n; if (n.length === 11 && n[0] === '7') n = '8'+n.slice(1);
    return n[0] === '8' ? n : '';
  }
  if (kind === 'role') {
    const v = s.replace(/[«»"'.,:;()]/g,' ').replace(/\s+/g,' ').trim();
    const target = '(?:(?:этого|данного|соответствующего|своего) )?(?:мфц|(?:многофункционального )?центра)';
    if (new RegExp('^(?:руководитель|руководителя|руководителю|директор|директора|директору|генеральный директор|генеральному директору) '+target+'$').test(v)) return 'mfc-head';
    if (new RegExp('^(?:учредитель|учредителя|учредителю) '+target+'$').test(v)) return 'mfc-founder';
    return '';
  }
  if (kind === 'part' || kind === 'article') {
    const prefix = kind === 'part' ? '(?:часть|части|ч\\.|part|pt\\.)' : '(?:статья|статьи|ст\\.|article|art\\.)';
    const m = s.match(new RegExp('^'+prefix+'\\s*(\\d+(?:[.,]\\d+)?)$'));
    const zh = s.match(new RegExp('^第\\s*(\\d+(?:[.,]\\d+)?)\\s*'+(kind === 'part' ? '款' : '条')+'$'));
    const n = (m ? m[1] : zh ? zh[1] : s).replace(',','.');
    return /^\d+(?:\.\d+)?$/.test(n) ? n.replace(/^0+(?=\d)/,'') : '';
  }
  return s.replace(/[«»"'.,:;()]/g,' ').replace(/\s+/g,' ').trim();
}

/** Strict public/private allowlists prevent authored keys from leaking through
 * a careless content extension. Cross references are checked on catalog load. */
export function validateAuthoredContract(c, h) {
  const {fields, text, uniqueIds, references, identifier, string, fail} = h;
  const a = c.public.assessment, r = c.rubric.authored;
  if (!a && !r && !c.followup) return;
  if (!a || !r || !c.followup) fail('invalid_case');
  fields(a, ['fact','knowledge','trap','calendar','research']);
  const options = rows => {
    const ids = uniqueIds(rows); if (!ids.size || ids.size > 100) fail('invalid_case');
    for (const row of rows) { fields(row,['id','label']); text(row.label,true); }
    return ids;
  };
  fields(a.fact,['prompt','options']); text(a.fact.prompt,true); const factOptions = options(a.fact.options);
  fields(a.knowledge,['prompt','options','numberLabel','dateLabel','unitLabel']);
  for (const key of ['prompt','numberLabel','dateLabel','unitLabel']) text(a.knowledge[key],true);
  const applications = options(a.knowledge.options);
  fields(a.trap,['prompt','options']); text(a.trap.prompt,true); const traps = options(a.trap.options);
  fields(a.calendar,['events','rules','starts','lastDays']);
  const events = uniqueIds(a.calendar.events);
  for (const event of a.calendar.events) { fields(event,['id','label','date']); text(event.label,true); if (!parseDateOnly(event.date)) fail('invalid_case'); }
  const rules = options(a.calendar.rules), starts = options(a.calendar.starts), shifts = options(a.calendar.lastDays);
  fields(a.research,['prompt','extractedLabel','findingOptions','records']); text(a.research.prompt,true); text(a.research.extractedLabel,true);
  const findings = options(a.research.findingOptions), records = uniqueIds(a.research.records), fragments = new Map();
  if (!records.size || records.size > 100) fail('invalid_case');
  for (const record of a.research.records) {
    fields(record,['id','title','url','fragments']); text(record.title,true);
    if (typeof record.url !== 'string' || record.url && !/^https:\/\//.test(record.url)) fail('invalid_case');
    const fragmentIds = uniqueIds(record.fragments); if (!fragmentIds.size) fail('invalid_case'); fragments.set(record.id,fragmentIds);
    for (const fragment of record.fragments) { fields(fragment,['id','label','text']); text(fragment.label,true); text(fragment.text,true); }
  }
  fields(r,['factIds','evidenceSets','evidencePaired','order','rightsAction','criticalRules','decisionPlans','knowledge','calendar','research','trap']);
  references(r.factIds,factOptions,true);
  if (typeof r.evidencePaired !== 'boolean' || !Array.isArray(r.evidenceSets) || !r.evidenceSets.length) fail('invalid_case');
  const docs = new Set(c.documents.map(x => x.id)), actions = new Set(c.public.actions.map(x => x.id)), facts = new Set(c.facts.map(x => x.id));
  r.evidenceSets.forEach(set => references(set,docs,true));
  const order = (pairs, allowed) => {
    if (!Array.isArray(pairs)) fail('invalid_case');
    for (const pair of pairs) if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1] || pair.some(id => !allowed.has(id))) fail('invalid_case');
    const left = new Set(allowed);
    while (left.size) { const free = [...left].filter(id => !pairs.some(([before,after]) => after === id && left.has(before))); if (!free.length) fail('invalid_case'); free.forEach(id => left.delete(id)); }
  };
  order(r.order,actions); if (!actions.has(r.rightsAction)) fail('invalid_case');
  if (!Array.isArray(r.criticalRules)) fail('invalid_case');
  for (const rule of r.criticalRules) {
    fields(rule,['id','kind','knownQuestion']); if (!actions.has(rule.id) || !['selected','missing'].includes(rule.kind) || rule.knownQuestion && !facts.has(rule.knownQuestion)) fail('invalid_case');
  }
  const plans = uniqueIds(r.decisionPlans), covered = [];
  for (const plan of r.decisionPlans) {
    fields(plan,['id','routes','requiredActions','order']); references(plan.routes,new Set(c.rubric.routeIds),true);
    references(plan.requiredActions,new Set(c.rubric.requiredActionIds),true); order(plan.order,new Set(plan.requiredActions));
    covered.push(...plan.routes);
  }
  if (plans.size && (new Set(covered).size !== covered.length || c.rubric.routeIds.some(id => !covered.includes(id)))) fail('invalid_case');
  fields(r.knowledge,['number','actDate','articles','correct','actType','unitKind','issuer','codeName','codePart','codeAliases']);
  string(r.knowledge.number,80); if (!parseDateOnly(r.knowledge.actDate)) fail('invalid_case');
  if (!Array.isArray(r.knowledge.articles) || !r.knowledge.articles.length) fail('invalid_case');
  r.knowledge.articles.forEach(value => string(value,80));
  if (!applications.has(r.knowledge.correct) || !traps.has(r.trap)) fail('invalid_case');
  if (r.knowledge.actType !== undefined && !['federal','rfLaw','resolution','order','code'].includes(r.knowledge.actType)) fail('invalid_case');
  if (r.knowledge.unitKind !== undefined && !['article','clause'].includes(r.knowledge.unitKind)) fail('invalid_case');
  if (r.knowledge.codePart !== undefined && ![1,2,'1','2'].includes(r.knowledge.codePart)) fail('invalid_case');
  for (const key of ['issuer','codeName']) if (r.knowledge[key] !== undefined) string(r.knowledge[key],500);
  if (r.knowledge.codeAliases !== undefined) { if (!Array.isArray(r.knowledge.codeAliases)) fail('invalid_case'); r.knowledge.codeAliases.forEach(x => string(x,500)); }
  fields(r.calendar,['anchor','rule','start','acceptedShifts']);
  if (!events.has(r.calendar.anchor) || !rules.has(r.calendar.rule) || !starts.has(r.calendar.start)) fail('invalid_case'); references(r.calendar.acceptedShifts,shifts,true);
  fields(r.research,['bindings','accepted','aliases','normalize','finding']);
  if (!Array.isArray(r.research.bindings) || !r.research.bindings.length) fail('invalid_case');
  for (const binding of r.research.bindings) { fields(binding,['recordId','fragmentId']); if (!fragments.get(binding.recordId)?.has(binding.fragmentId)) fail('invalid_case'); }
  for (const key of ['accepted','aliases']) { if (!Array.isArray(r.research[key])) fail('invalid_case'); r.research[key].forEach(value => string(value,2000)); }
  if (!r.research.accepted.length || !['text','role','phone','part','article'].includes(r.research.normalize) || !findings.has(r.research.finding)) fail('invalid_case');
  fields(c.followup,['intro','options','correct','explanation','success','failure']);
  for (const key of ['intro','explanation','success','failure']) text(c.followup[key],true);
  if (!options(c.followup.options).has(c.followup.correct)) fail('invalid_case');
}

export function validateAuthoredDecision(value, c, h) {
  const {fields,string,fail} = h, a = c.public.assessment;
  fields(value,['factId','applicationId','trapId','actDate','calendar','research']);
  const has = (rows,id) => rows.some(row => row.id === id);
  const answer=(rows,id)=>id===''||has(rows,id);
  if (!answer(a.fact.options,value.factId) || !answer(a.knowledge.options,value.applicationId) || !answer(a.trap.options,value.trapId) || value.actDate!==''&&!parseDateOnly(value.actDate)) fail('invalid_decision');
  fields(value.calendar,['anchor','rule','start','shift']);
  for (const [key,rows] of [['anchor',a.calendar.events],['rule',a.calendar.rules],['start',a.calendar.starts],['shift',a.calendar.lastDays]]) if (!answer(rows,value.calendar[key])) fail('invalid_decision');
  const e = fields(value.research,['recordId','fragmentId','extracted','finding']);
  const record = a.research.records.find(row => row.id === e.recordId);
  if (e.recordId!==''&&!record || e.fragmentId!==''&&(!record||!has(record.fragments,e.fragmentId)) || !answer(a.research.findingOptions,e.finding)) fail('invalid_decision');
  string(e.extracted,200,0);
}

const labels = {
  facts:{ru:'Факты и материалы',en:'Facts and documents',zh:'事实与材料'},
  research:{ru:'Работа с источниками',en:'Source research',zh:'资料研究'},
  routing:{ru:'Процедура и адресат',en:'Procedure and authority',zh:'程序与主管机关'},
  calendar:{ru:'Исчисление срока',en:'Deadline calculation',zh:'期限计算'},
  actions:{ru:'План действий и контроль',en:'Action plan and follow-up',zh:'行动方案与后续处理'},
  rights:{ru:'Права заявителя',en:'Applicant rights',zh:'申请人权利'}
};
export function evaluateAuthoredDecision(c,state,decision) {
  const r = c.rubric.authored, a = decision.assessment, selected = decision.actionIds;
  const factGood = r.factIds.includes(a.factId);
  const evidenceGood = r.evidenceSets.some(set => set.length === decision.basisDocumentIds.length && set.every(id => decision.basisDocumentIds.includes(id) && state.openedDocumentIds.includes(id))) && (!r.evidencePaired || factGood);
  const checks = {number:referenceNumber(decision.law.number,r.knowledge) === r.knowledge.number,
    date:parseDateOnly(a.actDate) === r.knowledge.actDate, article:r.knowledge.articles.includes(referenceUnit(decision.law.article,r.knowledge)), application:a.applicationId === r.knowledge.correct};
  const proof = r.research, answer = a.research;
  const binding = proof.bindings.some(row => row.recordId === answer.recordId && row.fragmentId === answer.fragmentId);
  const normalized = normalizeEvidence(answer.extracted,proof.normalize), translated = normalizeEvidence(answer.extracted,'text');
  const extracted = Boolean(normalized) && proof.accepted.some(value => normalizeEvidence(value,proof.normalize) === normalized) || Boolean(translated) && ['text','role'].includes(proof.normalize) && proof.aliases.some(value => normalizeEvidence(value,'text') === translated);
  const finding = answer.finding === proof.finding;
  const plan = r.decisionPlans.length ? r.decisionPlans.find(row => row.routes.includes(decision.routeId)) || {id:'unselected',requiredActions:[],order:[]} : {id:'default',requiredActions:c.rubric.requiredActionIds,order:r.order};
  const matches = plan.requiredActions.filter(id => selected.includes(id)).length, bad = c.rubric.forbiddenActionIds.filter(id => selected.includes(id)).length;
  const wrongOrder = plan.order.some(([before,after]) => selected.includes(before) && selected.includes(after) && selected.indexOf(before) > selected.indexOf(after));
  const criticalIds = r.criticalRules.filter(rule => !rule.knownQuestion || state.knownFactIds.includes(rule.knownQuestion)).filter(rule => rule.kind === 'selected' ? selected.includes(rule.id) : !selected.includes(rule.id)).map(rule => rule.id);
  const followupGood = Boolean(state.followupChoiceId && state.followupChoiceId === c.followup.correct);
  const scores = {
    facts:[(factGood ? 10 : 0)+(evidenceGood ? 5 : 0),15],
    research:[Object.values(checks).filter(Boolean).length*2+(binding ? 4+(extracted ? 4 : 0)+(finding ? 4 : 0) : 0),20],
    routing:[(c.rubric.procedureIds.includes(decision.procedureId) ? 7 : 0)+(c.rubric.routeIds.includes(decision.routeId) ? 8 : 0),15],
    calendar:[(a.calendar.anchor === r.calendar.anchor ? 2 : 0)+(a.calendar.rule === r.calendar.rule ? 2 : 0)+(a.calendar.start === r.calendar.start ? 2 : 0)+(r.calendar.acceptedShifts.includes(a.calendar.shift) ? 2 : 0)+(parseDateOnly(decision.deadline) === c.rubric.deadline ? 12 : 0),20],
    actions:[Math.max(0,Math.min(16,14*matches/Math.max(1,plan.requiredActions.length)+(selected.length && plan.requiredActions.length && !wrongOrder ? 2 : 0)-4*bad))+(followupGood ? 4 : 0),20],
    rights:[(a.trapId === r.trap ? 5 : 0)+(selected.includes(r.rightsAction) && !criticalIds.length ? 5 : 0),10]
  };
  const score = Object.values(scores).reduce((sum,row) => sum+row[0],0);
  return {score,criteria:Object.entries(scores).map(([id,[earned,max]]) => ({id,earned,max,label:labels[id]})),explanation:c.rubric.explanation,
    missingFacts:[],cap:null,authored:true,criticalIds,actionPlanId:plan.id,followupCorrect:followupGood,
    followupExplanation:c.followup.explanation,followupMessage:followupGood ? c.followup.success : c.followup.failure};
}
