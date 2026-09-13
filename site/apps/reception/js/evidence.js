import {EVIDENCE_RECORDS,EVIDENCE_TASKS,EVIDENCE_VERSION} from './content-library.js';
import {evidenceLocaleAliases} from './evidence-locale-aliases.js';

/** A frozen reference task, not an AI verdict about an arbitrary webpage. */
function evidenceContext(value,c){
 if(!c?.dateValues)return value;
 if(Array.isArray(value))return value.map(v=>evidenceContext(v,c));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,evidenceContext(v,c)]));
 if(typeof value!=='string')return value;
 return value.replace(/\{\{(\w+)\}\}/g,(_,key)=>{const raw=c.dateValues[key]??c.dateValues[key+'ISO'];if(raw===undefined)throw Error('Неизвестное событие в материале источника: '+key);return key.endsWith('ISO')?String(raw):/^\d{4}-\d{2}-\d{2}$/.test(String(raw))?String(raw).split('-').reverse().join('.'):String(raw);});
}
export function evidenceTask(c){const t=c?._sourceSnapshot?.tasks?.[c.evidenceTaskId]||EVIDENCE_TASKS[c.evidenceTaskId];if(!t)throw Error('Не найдено задание по источникам.');return evidenceContext(t,c);}
export function evidenceRecord(id,c=null){const r=c?._sourceSnapshot?.records?.[id]||EVIDENCE_RECORDS.find(r=>r.id===id)||null;return evidenceContext(r,c);}
export function newEvidence(){return {recordId:'',fragmentId:'',extracted:'',finding:'',url:'',query:'',opened:[],externalOpened:[]};}
export function normalizeEvidence(value,kind='text'){
 const s=String(value??'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').trim();
 if(kind==='phone'){
  // Reject extensions and multiple phone numbers, rather than silently truncate.
  if(/(?:доб|ext|[a-zа-я])/i.test(s))return '';
  let n=s.replace(/[\s()+.\-–—]/g,'');if(!/^\d{10,11}$/.test(n))return '';
  if(n.length===10)n='8'+n;if(n.length===11&&n[0]==='7')n='8'+n.slice(1);
  return n[0]==='8'?n:'';
 }
 if(kind==='role'){
  const value=s.replace(/[«»"'.,:;()]/g,' ').replace(/\s+/g,' ').trim();
  const target='(?:(?:этого|данного|соответствующего|своего) )?(?:мфц|(?:многофункционального )?центра)';
  if(new RegExp('^(?:руководитель|руководителя|руководителю|директор|директора|директору|генеральный директор|генеральному директору) '+target+'$').test(value))return 'mfc-head';
  if(new RegExp('^(?:учредитель|учредителя|учредителю) '+target+'$').test(value))return 'mfc-founder';
  return '';
 }
 if(kind==='part'||kind==='article'){
  const prefix=kind==='part'?'(?:часть|части|ч\\.|part|pt\\.)':'(?:статья|статьи|ст\\.|article|art\\.)';
  const m=s.match(new RegExp('^'+prefix+'\\s*(\\d+(?:[.,]\\d+)?)$'));
  const chinese=s.match(new RegExp('^第\\s*(\\d+(?:[.,]\\d+)?)\\s*'+(kind==='part'?'款':'条')+'$'));
  const n=(m?m[1]:chinese?chinese[1]:s).replace(',','.');return /^\d+(?:\.\d+)?$/.test(n)?n.replace(/^0+(?=\d)/,''):'';
 }
 return s.replace(/[«»"'.,:;()]/g,' ').replace(/\s+/g,' ').trim();
}
export function evidenceChecks(c,answer){
 const t=evidenceTask(c),e=answer||newEvidence();
 const binding=t.bindings.some(b=>b.recordId===e.recordId&&b.fragmentId===e.fragmentId);
 const normalized=normalizeEvidence(e.extracted,t.extracted.normalize);
 const canonical=Boolean(normalized)&&t.extracted.accepted.some(v=>normalizeEvidence(v,t.extracted.normalize)===normalized);
 const translatedText=normalizeEvidence(e.extracted,'text');
 const translated=Boolean(translatedText)&&['text','role'].includes(t.extracted.normalize||'text')&&evidenceLocaleAliases(t).some(value=>translatedText===normalizeEvidence(value,'text'));
 const extracted=canonical||translated;
 const application=e.finding===t.correctFinding;
 // Facts and their application must be attached to the supporting fragment.
 // Arbitrary URL, its official domain and opening every card award nothing.
 return {version:EVIDENCE_VERSION,binding,extracted,application,
  scores:{binding:binding?4:0,extracted:binding&&extracted?4:0,application:binding&&application?4:0},
  total:binding?(4+(extracted?4:0)+(application?4:0)):0};
}
export function evidenceFeedback(c,e){
 const t=evidenceTask(c),r=evidenceChecks(c,e),out=[];
 if(!r.binding)out.push('Выбранный фрагмент не обосновывает требуемый вывод. '+t.explain);
 if(!r.extracted)out.push('Проверьте извлечённое сведение: '+t.extracted.label.toLowerCase()+'. В справочном пакете: '+t.extracted.accepted[0]+'.');
 if(!r.application)out.push('Источник нужно связать с обстоятельствами дела. '+t.explain);
 return out;
}
export function validEvidence(c,e){
 if(!e||!['recordId','fragmentId','extracted','finding','url','query'].every(k=>typeof e[k]==='string')||!Array.isArray(e.opened)||!Array.isArray(e.externalOpened))return false;
 const t=evidenceTask(c),records=t.recordIds;
 if(e.recordId&&!records.includes(e.recordId))return false;
 if(e.fragmentId&&!evidenceRecord(e.recordId,c)?.fragments.some(f=>f.id===e.fragmentId))return false;
 if(e.finding&&!t.findingOptions.some(o=>o.id===e.finding))return false;
 return e.opened.every(id=>records.includes(id))&&e.externalOpened.every(id=>records.includes(id))&&e.url.length<=2048&&e.query.length<=300&&e.extracted.length<=200;
}
