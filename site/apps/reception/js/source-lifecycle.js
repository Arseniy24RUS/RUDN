import {SOURCES} from './cases.js';
import {EVIDENCE_RECORDS,EVIDENCE_TASKS,EVIDENCE_VERSION} from './evidence-catalog.js';
import {SOURCE_INDEX} from './source-index.js';
import {SOURCE_POLICY,SOURCE_POLICY_VERSION} from './source-policy.js';
const copySource=value=>JSON.parse(JSON.stringify(value));
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const canonicalSource=value=>Array.isArray(value)?'['+value.map(canonicalSource).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalSource(value[k])).join(',')+'}':JSON.stringify(value);
/** Accidental corruption check only, NOT a cryptographic signature or anti-cheat. */
export function sourceChecksum(value){let h=2166136261;const text=canonicalSource(value);for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(16).padStart(8,'0')+'-'+text.length;}
export function createSourceSnapshot(caseList,{shelf=SOURCES,records=EVIDENCE_RECORDS,tasks=EVIDENCE_TASKS,index=SOURCE_INDEX,createdAt=new Date().toISOString()}={}){
 const taskIds=[...new Set(caseList.map(c=>c.evidenceTaskId))].sort();
 const taskMap={};const recordIds=new Set();
 for(const id of taskIds){if(!own(tasks,id))throw Error('Неизвестный профиль источников');taskMap[id]=copySource(tasks[id]);for(const rid of tasks[id].recordIds)recordIds.add(rid);}
 const recordMap={};for(const id of [...recordIds].sort()){const r=records.find(v=>v.id===id);if(!r)throw Error('Не найден материал источника');recordMap[id]=copySource(r);}
 const entries=index.entries.filter(e=>e.collection==='shelf'||recordIds.has(e.recordId)).map(copySource);
 const body={schema:1,evidenceVersion:EVIDENCE_VERSION,indexVersion:index.version,policyVersion:SOURCE_POLICY_VERSION,createdAt,shelf:copySource(shelf),records:recordMap,tasks:taskMap,metadata:entries,policy:copySource(SOURCE_POLICY)};
 return {...body,id:'sources-'+sourceChecksum(body)};
}
export function validateSourceSnapshot(snapshot,caseList=[]){
 if(!snapshot||snapshot.schema!==1||snapshot.evidenceVersion!==EVIDENCE_VERSION||!Array.isArray(snapshot.shelf)||!Array.isArray(snapshot.metadata)||!Array.isArray(snapshot.policy)||!snapshot.records||!snapshot.tasks||typeof snapshot.createdAt!=='string')throw Error('Неверный снимок источников');
 const {id,...body}=snapshot;if(id!=='sources-'+sourceChecksum(body))throw Error('Снимок источников повреждён');
 if(snapshot.shelf.length>500||Object.keys(snapshot.records).length>500||Object.keys(snapshot.tasks).length>500||JSON.stringify(snapshot).length>2_000_000)throw Error('Снимок источников превышает допустимый размер');
 for(const c of caseList){const t=snapshot.tasks[c.evidenceTaskId];if(!t||!Array.isArray(t.recordIds)||!Array.isArray(t.bindings)||!Array.isArray(t.findingOptions)||!t.extracted||!Array.isArray(t.extracted.accepted)||!t.recordIds.every(rid=>own(snapshot.records,rid)))throw Error('Неполный снимок источников дела');for(const binding of t.bindings){const r=snapshot.records[binding.recordId];if(!r||!r.fragments?.some(f=>f.id===binding.fragmentId))throw Error('Нет фрагмента основания');}}
 for(const [id,r] of Object.entries(snapshot.records)){if(r.id!==id||typeof r.title!=='string'||!Array.isArray(r.fragments)||!r.fragments.every(f=>typeof f.id==='string'&&typeof f.text==='string'))throw Error('Повреждён материал снимка');}
 return snapshot;
}
export function sourceMetadata(collection,id,snapshot=null){return (snapshot?.metadata||SOURCE_INDEX.entries).find(r=>r.collection===collection&&r.recordId===id)||null;}
export function sourceReviewStatus(entry,asOf='2026-09-08',{policy=SOURCE_POLICY,observations=[]}={}){
 const reasons=[];const warnings=[];
 if(entry.kind!=='authored-case'){
  if(!entry.inheritedCheckedAt)reasons.push('Дата предметной проверки не зафиксирована');
  else if(entry.reviewIntervalDays&&Math.floor((Date.parse(asOf+'T00:00:00Z')-Date.parse(entry.inheritedCheckedAt+'T00:00:00Z'))/86400000)>entry.reviewIntervalDays)reasons.push('Плановый срок повторной проверки');
 }
 for(const id of entry.rules||[]){const p=policy.find(x=>x.id===id);if(!p)continue;if(p.effectiveFrom&&asOf<p.effectiveFrom)reasons.push('Дата раньше начала указанного порядка');if(p.reviewFrom&&asOf>=p.reviewFrom)reasons.push(p.title);else if(p.reviewFrom)warnings.push({date:p.reviewFrom,title:p.title});}
 const observation=observations.find(x=>x.url===entry.url)||null;
 const transport=observation?.status||'not-probed';
 if(['text-changed','unavailable','blocked','unreadable','too-large','redirect-blocked'].includes(transport))reasons.push('Сетевой мониторинг: '+transport);
 return {status:entry.kind==='authored-case'?'authored':reasons.length?'review':'tracked',reasons,upcoming:warnings,transport,observation};
}
export function sourceHealthReport({asOf='2026-09-08',query='',filter='all',observations=[],index=SOURCE_INDEX}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf)))throw Error('Неверная дата просмотра реестра');
 const q=String(query).normalize('NFKC').toLowerCase().replace(/ё/g,'е').trim();
 const rows=index.entries.map(e=>({...copySource(e),health:sourceReviewStatus(e,asOf,{observations})}));
 const matching=rows.filter(e=>(!q||(e.title+' '+e.url+' '+e.id+' '+e.families.join(' ')).toLowerCase().replace(/ё/g,'е').includes(q))&&(filter==='all'||filter==='review'&&e.health.status==='review'||filter===e.kind));
 return {schema:1,indexVersion:index.version,asOf,disclaimer:'Техническая доступность и совпадение текста не подтверждают правовую актуальность. Материалы дела вымышлены. Отчёт не содержит данные студентов и не меняет оценки.',total:rows.length,matching:matching.length,counts:{review:rows.filter(e=>e.health.status==='review').length,authored:rows.filter(e=>e.kind==='authored-case').length,tracked:rows.filter(e=>e.health.status==='tracked').length},entries:matching};
}
export function sourceImpact(ids,index=SOURCE_INDEX){const found=index.entries.filter(e=>ids.includes(e.id));return {sourceIds:found.map(e=>e.id),families:[...new Set(found.flatMap(e=>e.families))].sort(),cases:[...new Map(found.flatMap(e=>e.cases).map(c=>[c.id,c])).values()]};}
/** Reports are untrusted diagnostics. Import never executes markup or writes source text. */
export function parseSourceObservations(text,index=SOURCE_INDEX){
 if(typeof text!=='string'||text.length>2_000_000)throw Error('Отчёт слишком велик');const raw=JSON.parse(text);
 if(raw.schema!==1||raw.indexVersion!==index.version||!Array.isArray(raw.observations)||raw.observations.length>500)throw Error('Неверная версия отчёта');
 const urls=new Set(index.entries.map(e=>e.url));const allowed=new Set(['not-probed','available-first-seen','unchanged','text-changed','unavailable','blocked','unreadable','too-large','redirect-blocked']);
 const observations=[];const seen=new Set();for(const r of raw.observations){if(!r||!urls.has(r.url)||!allowed.has(r.status)||seen.has(r.url))throw Error('В отчёте неизвестный или повторный источник');seen.add(r.url);observations.push({url:r.url,status:r.status,observedAt:typeof r.observedAt==='string'?r.observedAt.slice(0,50):null,textSHA256:/^[a-f0-9]{64}$/.test(r.textSHA256||'')?r.textSHA256:null});}
 return observations;
}
