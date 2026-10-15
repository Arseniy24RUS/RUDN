/** Pure domain functions. No DOM, network, Firebase or global mutable state. */
export const VERSION = '1.0.0';
export const ACT_TYPES = Object.freeze(['Указ', 'Постановление', 'Распоряжение', 'Приказ', 'Решение']);
export function parseDossierAnswer(legalLab) {
  if(typeof legalLab?.answerJson==='string'&&legalLab.answerJson.length>150000)throw new TypeError('Report answer is too large');
  const raw=typeof legalLab?.answerJson==='string'?JSON.parse(legalLab.answerJson):(legalLab?.answer||{});
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Invalid report answer');
  const result={metadata:raw.metadata||{},classifications:raw.classifications||{},documentIds:raw.documentIds||[],selections:raw.selections||[]};
  for(const key of ['metadata','classifications'])if(typeof result[key]!=='object'||Array.isArray(result[key]))throw new TypeError('Invalid report fields');
  for(const [key,max] of [['documentIds',3],['selections',500]])if(!Array.isArray(result[key])||result[key].length>max||result[key].some(id=>typeof id!=='string'||id.length>200))throw new TypeError('Invalid report selections');
  return result;
}
export const normalize = (v) => String(v ?? '').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[«»„“”"'’]/g,'').replace(/[–—−]/g,'-').replace(/\s+/g,' ').trim();
export const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const unique = (a) => [...new Set(Array.isArray(a) ? a.filter(x => typeof x==='string') : [])];
export const round = (n) => Math.round((Number(n)+Number.EPSILON)*100)/100;
export function uid() { return globalThis.crypto?.randomUUID?.() ?? `ll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
export function hash32(text) { let h=2166136261; for (const c of String(text)) { h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(36); }
export function randomIndex(length) {
  if(!Number.isInteger(length)||length<1||length>0x100000000) throw new RangeError('Empty assignment bank');
  if(globalThis.crypto?.getRandomValues) { const a=new Uint32Array(1), max=Math.floor(0x100000000/length)*length; do{crypto.getRandomValues(a);}while(a[0]>=max); return a[0]%length; }
  return Math.floor(Math.random()*length);
}
export function chooseCase(cases, existing=null, pick=randomIndex) {
  if(existing) { const item=cases.find(x=>x.id===existing); if(!item)throw new Error('Assigned case is unavailable in this content version'); return item; }
  if(!cases.length)throw new Error('No cases'); return cases[pick(cases.length)];
}
export function expandIds(ids, docs) {
  const aliases=Object.assign({}, ...docs.map(d=>d.aliases||{}));
  return unique(ids.flatMap(id=>aliases[id]||[id]));
}
/** Jaccard gives partial credit, penalises marking all paragraphs, and allows
 * equivalent complete answer sets. Invalid/unknown IDs can never add credit. */
export function gradeEvidence(selected, answerSets, docs=[]) {
  const known=new Set(docs.flatMap(d=>d.units.map(u=>u.id)));
  const chosen=unique(selected), expanded=answerSets.map(s=>expandIds(s,docs));
  if(!chosen.length)return {fraction:0,exact:false,matched:0,extra:0,missing:expanded[0]?.length||0};
  let best={fraction:0,exact:false,matched:0,extra:chosen.length,missing:expanded[0]?.length||0};
  for(const expected of expanded) {
    const allowed=new Set(expected.filter(id=>!docs.length||known.has(id)));
    if(!allowed.size) continue;
    const matched=chosen.filter(x=>allowed.has(x)).length;
    const extra=chosen.length-matched, missing=allowed.size-matched;
    const fraction=matched/(allowed.size+extra);
    if(fraction>best.fraction || (fraction===best.fraction&&missing<best.missing))best={fraction,exact:extra===0&&missing===0,matched,extra,missing};
  }
  return best;
}
export function gradeTask(task, answer={}, docs=[]) {
  if(task.kind==='scan')return {fraction:answer.hotspot===task.answer?1:0,exact:answer.hotspot===task.answer};
  if(task.kind==='type')return {fraction:answer.type===task.answer?1:0,exact:answer.type===task.answer};
  const found=answer.docId===task.docId;
  if(!found)return {fraction:0,exact:false,missingDocument:true};
  return gradeEvidence(answer.selections||[],task.answerSets,docs);
}
export function scoreDossier(item, answer={}, scans=[], docs=[]) {
  const fields=item.scanQuestions.map(x=>x.field);
  const scan=scans.find(s=>s.id===item.scanId);
  const valid=new Set(scan?.hotspots.map(x=>x.id)||[]);
  const metadata=fields.filter(f=>valid.has(f)&&answer.metadata?.[f]===f).length/fields.length;
  const classification=item.classificationIds.filter(id=>answer.classifications?.[id]===scans.find(s=>s.id===id)?.actType).length/item.classificationIds.length;
  const required=new Set(item.docIds), selected=new Set(unique(answer.documentIds||[]));
  const intersection=[...selected].filter(x=>required.has(x)).length;
  const document=selected.size ? intersection/(new Set([...selected,...required]).size) : 0;
  const evidence=gradeEvidence(answer.selections||[],item.answerSets,docs);
  // Evidence belongs to explicitly selected source documents; hidden answer IDs
  // from other documents do not gain credit.
  const knownSources=new Map(docs.flatMap(d=>d.units.map(u=>[u.id,d.id])));
  const sourceOK=unique(answer.selections||[]).every(id=>selected.has(knownSources.get(id)));
  const criterion=[
    {id:'metadata',label:'Реквизиты на скане',max:1,points:round(metadata)},
    {id:'classification',label:'Виды документов',max:1,points:round(classification)},
    {id:'document',label:'Поиск документа',max:1,points:round(document)},
    {id:'evidence',label:'Правовое основание',max:2,points:round(2*(sourceOK?evidence.fraction:0)),detail:{...evidence,sourceOK}}
  ];
  return {points:Math.min(5,round(criterion.reduce((a,c)=>a+c.points,0))),maxPoints:5,criteria:criterion};
}
export function assessmentReady(catalog, docs=[]) {
  const required=catalog.documents.filter(d=>d.main);
  const missing=required.filter(d=>d.coverage!=='full'||d.reviewStatus!=='reviewed');
  const actual=new Map(docs.map(d=>[d.id,d]));
  const mismatch=required.filter(d=>actual.has(d.id)&&actual.get(d.id).sha256!==d.sha256);
  return {ready:catalog.release?.status==='reviewed'&&missing.length===0&&mismatch.length===0,missing:missing.map(x=>x.id),mismatch:mismatch.map(x=>x.id)};
}
export function verifyBank(catalog, bank, cases, scans, docs) {
  const errors=[], ids=new Set();
  for(const t of [...bank.classroom,...bank.extra,...cases]) { if(ids.has(t.id))errors.push(`Duplicate task ID ${t.id}`);ids.add(t.id); }
  const docIds=new Set(docs.map(d=>d.id)), unitIds=new Set(docs.flatMap(d=>d.units.map(u=>u.id)));
  const aliases=Object.assign({},...docs.map(d=>d.aliases||{}));
  const scanMap=new Map(scans.map(s=>[s.id,s]));
  for(const d of docs) {
    const local=new Set(d.units.map(u=>u.id));
    if(local.size!==d.units.length)errors.push(`Duplicate unit in ${d.id}`);
    for(const s of d.sections)for(const id of s.unitIds)if(!local.has(id))errors.push(`Broken TOC ${d.id}/${id}`);
    for(const [a,targets] of Object.entries(d.aliases||{}))if(!targets.length||targets.some(id=>!local.has(id)))errors.push(`Broken alias ${a}`);
  }
  for(const t of [...bank.classroom,...bank.extra,...cases]) {
    if(t.docId&&!docIds.has(t.docId))errors.push(`Missing document ${t.id}`);
    for(const id of t.docIds||[])if(!docIds.has(id))errors.push(`Missing document ${t.id}/${id}`);
    for(const set of t.answerSets||[])for(const id of set)if(!unitIds.has(id)&&!aliases[id])errors.push(`Unknown target ${t.id}/${id}`);
    if(t.scanId&&!scanMap.has(t.scanId))errors.push(`Missing scan ${t.id}`);
    if(t.phase==='assessment') {
      if(scanMap.get(t.scanId)?.split!=='assessment')errors.push(`Scan leakage ${t.id}`);
      for(const s of t.classificationIds)if(scanMap.get(s)?.split!=='assessment')errors.push(`Type leakage ${t.id}`);
      if(Object.values(t.rubric).reduce((a,b)=>a+b,0)!==5)errors.push(`Invalid rubric ${t.id}`);
    }
  }
  for(const s of scans)for(const h of s.hotspots){const[x,y,w,hh]=h.rect;if([x,y,w,hh].some(v=>!Number.isFinite(v))||x<0||y<0||w<=0||hh<=0||x+w>1.001||y+hh>1.001)errors.push(`Bad hotspot ${s.id}/${h.id}`);}
  const shared=new Set(bank.classroom.flatMap(t=>(t.answerSets||[]).flat()));
  for(const c of cases)for(const id of c.answerSets.flat())if(shared.has(id))errors.push(`Norm leakage ${c.id}/${id}`);
  return errors;
}
export function searchUnits(doc, query, limit=Infinity) {
  const words=normalize(query).split(' ').filter(Boolean);
  if(!words.length)return [];
  const hits=[];
  for(const u of doc.units){const s=normalize(u.text+' '+u.locator);if(words.every(w=>s.includes(w))){hits.push(u);if(hits.length>=limit)break;}}
  return hits;
}
export function summarizeProgress(bank, answers, docs=[]) {
  const done=bank.classroom.filter(t=>answers[t.id]?.submitted);
  return {done:done.length,total:bank.classroom.length,correct:done.filter(t=>gradeTask(t,answers[t.id],docs).exact).length};
}

/** Same canonical UTF-8 representation as tools/acquire_corpus.py. */
export function canonicalStringify(value) {
  return JSON.stringify(value,(_key,item)=>item && typeof item==='object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])) : item);
}
export async function contentHash(value) {
  if(!globalThis.crypto?.subtle)throw new Error('Для проверки корпуса требуется HTTPS или localhost');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalStringify(value)));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function selectionLimit(task,docs=[]) {
  const expected=Math.max(0,...(task.answerSets||[]).map(set=>expandIds(set,docs).length));
  return Math.max(task.maxSelections||5,expected+2);
}
