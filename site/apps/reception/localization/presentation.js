// Locale composition adapter. Release requires complete packs and full-flow QA.
import {createReceptionTranslator,loadReceptionTranslator,normalizeReceptionLocale,createReceptionCatalogLoader} from './runtime.js';
import {parseDateOnly,formatDateOnly} from '../../../assets/js/legal-calendar.js';
import {registerEvidenceLocaleAliases} from '../js/evidence-locale-aliases.js';

/** Call once before rendering/evaluating a restored assignment, even in RU:
 * an earlier EN/ZH free-text answer remains valid after reload or language switch.
 * On failure keep the draft, retry the load, and do not finalise with missing aliases.
 */
export async function prepareReceptionEvidenceAliases(options={},loader=createReceptionCatalogLoader()) {
  const result=await loader.loadEvidenceAliases(options);registerEvidenceLocaleAliases(result.aliases);return result;
}

export function receptionSearchText(value) {
  return String(value??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
export function filterLocalizedCaseCatalog(templates,{query='',level='all',topic='all',translator}={}) {
  const tokens=receptionSearchText(String(query).slice(0,160)).split(/\s+/).filter(Boolean),t=value=>translator?.translate(String(value??''),{reportMissing:false})??String(value??'');
  return templates.filter(c=>{
    if(level!=='all'&&c.level!==Number(level))return false;
    // Selected topic values stay canonical even though the visible label changes.
    if(topic!=='all'&&c.topic!==topic)return false;
    const fields=[c.title,c.topic,c.curriculumId,c.number,c.opening,c.role?.title];
    const visible=receptionSearchText([...fields,...fields.map(t)].join(' '));
    return tokens.every(token=>visible.includes(token));
  });
}
export function localizedCatalogTopics(templates,translator) {
  return [...new Set(templates.map(c=>c.topic))].map(value=>({value,label:translator.translate(value)})).sort((a,b)=>a.label.localeCompare(b.label,translator.locale==='zh'?'zh-CN':translator.locale));
}
export function localizedMonthLabel(month,locale='ru') {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)))throw Error('Invalid display month.');
  return new Intl.DateTimeFormat(normalizeReceptionLocale(locale)==='zh'?'zh-CN':normalizeReceptionLocale(locale),{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z'));
}
/** Match the existing reply structure. Unknown stored option text remains literal. */
export function localizedReplyParts(c,p,translator) {
  const t=text=>translator.translate(text),label=text=>({text:t(text),userContent:false}),literal=text=>({text:String(text),userContent:true});
  const lines=[[label('Учебный проект сообщения по делу «'),label(c.title),{text:translator.locale==='en'?'”.':translator.locale==='zh'?'”。':'».',userContent:false}]];
  for(const [field,options,prefix] of [['procedure',c.procedures,'Выбран порядок: '],['route',c.routes,'Выбран маршрут: ']])if(p[field]) {
    const option=options.find(row=>row.id===p[field]),chosen=option?label(option.text):literal(p[field]);lines.push([label(prefix),chosen,...(/[.!?。！？]$/.test(chosen.text.trim())?[]:[label('.')])]);
  }
  if(parseDateOnly(p.calendar.answer))lines.push([label('Указанная вами крайняя дата: '),literal(formatDateOnly(p.calendar.answer)),label('.')]);
  const chosen=new Set(p.actions);if(chosen.size)lines.push([label('В проект включено: '),...c.actions.filter(action=>chosen.has(action.id)).flatMap((action,index)=>[...(index?[label('; ')]:[]),label(action.title)]),label('.')]);
  lines.push([label('Проект воспроизводит ваш выбор и не исправляет его автоматически. Реальная отправка не производится.')]);
  return lines;
}
/** Only known user-authored display slots are protected, not fictional case text. */
export function markReceptionUserContent(root,{state,profileIsUserContent=false}={}) {
  if(profileIsUserContent)root.querySelector('.rx-profile > span')?.setAttribute('data-rx-user-content','');
  const progress=state?.cases?.[state.caseIds?.[state.active]];
  if(progress?.phase==='history'&&progress.calendar?.answer)for(const strong of root.querySelectorAll('.rx-panel > p > strong'))if(strong.textContent===progress.calendar.answer)strong.setAttribute('data-rx-user-content','');
}
function captureFocus(root) {
  const element=root.ownerDocument.activeElement;if(!element||!root.contains(element))return null;
  const attributes=['id','name','data-field','data-action','data-tab','data-id','data-date','data-page','data-fragment','data-delta','data-mode','data-doc-evidence','data-calendar-month','data-calendar-year','data-bank-search','data-bank-topic','data-bank-filter','data-practice-profile','data-source-query','data-source-asof'];
  const descriptor=Object.fromEntries(attributes.filter(name=>element.hasAttribute(name)).map(name=>[name,element.getAttribute(name)]));
  if(!Object.keys(descriptor).length)return null;
  if(element.matches('input[type=radio],input[type=checkbox]'))descriptor.value=element.value;
  let selection=null;try{if(typeof element.selectionStart==='number')selection=[element.selectionStart,element.selectionEnd,element.selectionDirection];}catch{}
  return {descriptor,tag:element.tagName,selection};
}
function restoreFocus(root,saved) {
  if(!saved)return;const element=[...root.querySelectorAll(saved.tag)].find(candidate=>Object.entries(saved.descriptor).every(([name,value])=>candidate.getAttribute(name)===value));
  if(!element||element.disabled)return;element.focus({preventScroll:true});if(saved.selection)try{element.setSelectionRange(...saved.selection);}catch{}
}

/**
 * Caller supplies canonical render and local flush, never a "new shift" function.
 * `afterRender()` is the sole hook for normal content/status redraws. Rendering
 * must mark other custom user-content slots with data-rx-user-content beforehand.
 */
export function createReceptionPresentation({root,getState,getOwner,renderCanonical,flush=async()=>{},profileIsUserContent=()=>false,
  getOptionalViews=()=>({}),loader=createReceptionCatalogLoader(),load=loadReceptionTranslator,onStatus=()=>{},onMissing=()=>{}}={}) {
  if(!root||typeof getState!=='function'||typeof getOwner!=='function'||typeof renderCanonical!=='function')throw Error('Reception presentation requires canonical state/render boundaries.');
  let translator=createReceptionTranslator({locale:'ru',onMissing}),request=0,disposed=false,controller=null;
  const identity=()=>{const state=getState();return JSON.stringify([getOwner(),state?.id,state?.contentVersion,state?.assignment?.manifest?.map(row=>row.templateId)]);};
  function afterRender() {if(disposed)return;markReceptionUserContent(root,{state:getState(),profileIsUserContent:profileIsUserContent()});translator.apply(root);}
  async function setLocale(value) {
    const locale=normalizeReceptionLocale(value),revision=++request;controller?.abort();controller=new AbortController();
    const signal=controller.signal,capturedIdentity=identity();
    if(disposed)return {applied:false,reason:'disposed'};
    onStatus({state:'loading',locale});
    try {
      await flush();if(disposed||revision!==request||identity()!==capturedIdentity)return {applied:false,reason:'stale'};
      const state=getState(),next=await load(locale,{loader,templateIds:state.assignment.manifest.map(row=>row.templateId),contentVersion:state.contentVersion,signal,...getOptionalViews(),onMissing});
      if(disposed||revision!==request||signal.aborted||identity()!==capturedIdentity)return {applied:false,reason:'stale'};
      await flush();if(disposed||revision!==request||identity()!==capturedIdentity)return {applied:false,reason:'stale'};
      const focus=captureFocus(root),scroll={x:root.ownerDocument.defaultView.scrollX,y:root.ownerDocument.defaultView.scrollY};
      translator=next;await renderCanonical();
      if(disposed||revision!==request||identity()!==capturedIdentity)return {applied:false,reason:'stale'};
      afterRender();restoreFocus(root,focus);
      root.ownerDocument.defaultView.scrollTo(scroll.x,scroll.y);onStatus({state:'ready',locale});return {applied:true,locale};
    }catch(error){
      if(disposed||revision!==request||signal.aborted||identity()!==capturedIdentity)return {applied:false,reason:'stale'};
      onStatus({state:'unavailable',locale,code:error?.code||'locale/unavailable'});return {applied:false,reason:'unavailable',code:error?.code||'locale/unavailable'};
    }
  }
  return {setLocale,afterRender,translate:(text,options)=>translator.translate(text,options),getTranslator:()=>translator,
    getLocale:()=>translator.locale,destroy(){disposed=true;request++;controller?.abort();}};
}
