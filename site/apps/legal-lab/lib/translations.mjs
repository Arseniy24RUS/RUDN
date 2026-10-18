import {resourceURL} from '../../../assets/js/release-resources.js';
import {labelForUnit} from './reader-tools.mjs';

const locales=new Set(['en','zh']),kind='educational-unofficial',hashPattern=/^[a-f0-9]{64}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.trim().length>0;
const own=(value,key)=>Object.hasOwn(value,key);
const compact=value=>String(value||'').replace(/\s+/gu,' ').trim();

export class DocumentTranslationError extends Error {
  constructor(code,message,options){super(message,options);this.name='DocumentTranslationError';this.code=`legal-lab/translations-${code}`;}
}
function requireThat(condition,code,message){if(!condition)throw new DocumentTranslationError(code,message);}
function checkAbort(signal){if(signal?.aborted)throw new DOMException('Aborted','AbortError');}
function sourcePins(source){return object(source)&&text(source.version)&&hashPattern.test(source.sha256||'')&&hashPattern.test(source.fileSha256||'');}
function samePins(a,b){return a.version===b.version&&a.sha256===b.sha256&&a.fileSha256===b.fileSha256;}
function freeze(value){if(object(value)||Array.isArray(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function exactKeys(record,ids){return object(record)&&new Set(ids).size===ids.length&&Object.keys(record).length===ids.length&&ids.every(id=>own(record,id));}

function validateTranslation(doc,value,locale,source){
  requireThat(object(doc)&&Array.isArray(doc.units)&&Array.isArray(doc.sections),'source','An original document is required.');
  requireThat(object(value)&&value.schema===1&&value.kind===kind&&value.status==='translated'&&value.docId===doc.id&&value.locale===locale&&locales.has(locale),'payload','Unsupported translation document.');
  requireThat(sourcePins(value.source)&&value.source.version===doc.version&&value.source.sha256===doc.sha256&&(!source||samePins(value.source,source)),'source','Translation source pins do not match the original.');
  requireThat(text(value.title)&&text(value.revisionLabel),'payload','Translated title and revision label are required.');
  requireThat(exactKeys(value.units,doc.units.map(unit=>unit.id))&&exactKeys(value.sections,doc.sections.map(section=>section.id)),'coverage','Translation must cover exactly every original unit and section.');
  for(const section of doc.sections)requireThat(text(value.sections[section.id]),'coverage','A translated section title is empty.');
  for(const unit of doc.units){
    const translated=value.units[unit.id];
    requireThat(object(translated)&&Object.keys(translated).every(key=>['text','locator','context'].includes(key))&&text(translated.text)&&text(translated.locator),'coverage','A translated unit text or locator is empty or has unsupported fields.');
    requireThat(own(unit,'context')?text(translated.context):!own(translated,'context'),'coverage','Translated context must match the original field coverage.');
  }
  return value;
}

/** Separate display cache. The caller supplies the verified original Corpus catalog. */
export class DocumentTranslations {
  constructor(base,{catalog,signal,fetch:fetcher=globalThis.fetch?.bind(globalThis)}={}){
    this.base=base;this.originalCatalog=catalog;this.signal=signal;this.fetcher=fetcher;
    this.cache=new Map();this.inflight=new Map();this.entries=null;this.initializing=null;
  }
  async json(path,expectedSha){
    checkAbort(this.signal);
    let response;
    try{response=await this.fetcher(resourceURL(path,this.base),{signal:this.signal,credentials:'same-origin',cache:'no-cache'});}
    catch(error){checkAbort(this.signal);throw new DocumentTranslationError('load','Translation request failed.',{cause:error});}
    checkAbort(this.signal);
    requireThat(response.ok,'load',`Translation request failed: HTTP ${response.status}.`);
    let bytes;
    try{bytes=await response.arrayBuffer();}
    catch(error){checkAbort(this.signal);throw new DocumentTranslationError('load','Translation response could not be read.',{cause:error});}
    checkAbort(this.signal);
    if(expectedSha){
      const digest=await crypto.subtle.digest('SHA-256',bytes);checkAbort(this.signal);
      const actual=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
      requireThat(actual===expectedSha,'hash','Translation file checksum does not match the registry.');
    }
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
    catch(error){throw new DocumentTranslationError('payload','Translation JSON is invalid.',{cause:error});}
  }
  async initialize(){
    checkAbort(this.signal);if(this.entries)return this;if(this.initializing)return this.initializing;
    const work=(async()=>{
      const registry=await this.json('data/translations/catalog.json');
      requireThat(object(this.originalCatalog)&&Array.isArray(this.originalCatalog.documents)&&object(registry)&&registry.schema===1&&registry.kind===kind&&registry.contentVersion===this.originalCatalog.contentVersion&&Array.isArray(registry.documents),'catalog','Unsupported or stale translation registry.');
      const entries=new Map();
      for(const entry of registry.documents){
        requireThat(object(entry)&&typeof entry.docId==='string'&&/^[a-z0-9_-]+$/i.test(entry.docId)&&locales.has(entry.locale),'catalog','Invalid translation registry identity.');
        const key=`${entry.docId}/${entry.locale}`;
        requireThat(!entries.has(key)&&entry.file===`${entry.locale}/${entry.docId}.json`&&hashPattern.test(entry.sha256||'')&&sourcePins(entry.source),'catalog','Invalid or duplicate translation registry entry.');
        requireThat(entry.status==='complete'&&object(entry.review)&&entry.review.status==='approved'&&['independent-synthetic-review','independent-human-review'].includes(entry.review.kind)&&text(entry.review.evidence),'review','Only independently reviewed complete translations may be published.');
        const originals=this.originalCatalog.documents.filter(doc=>doc.id===entry.docId),meta=originals[0];
        requireThat(originals.length===1&&meta.version===this.originalCatalog.contentVersion&&sourcePins(meta)&&samePins(entry.source,meta),'source','Translation registry does not match the original catalog.');
        entries.set(key,freeze(entry));
      }
      checkAbort(this.signal);this.entries=entries;return this;
    })();
    this.initializing=work;
    try{return await work;}finally{if(this.initializing===work)this.initializing=null;}
  }
  entry(doc,locale){
    const entry=this.entries?.get(`${doc?.id}/${locale}`);if(!entry)return null;
    const matches=this.originalCatalog.documents.filter(meta=>meta.id===doc.id),meta=matches[0];
    requireThat(matches.length===1&&sourcePins(meta)&&samePins(entry.source,meta)&&doc.version===this.originalCatalog.contentVersion&&doc.version===entry.source.version&&doc.sha256===entry.source.sha256,'source','Cached translation does not match the current original.');
    return entry;
  }
  get(doc,locale){
    if(!locales.has(locale))return null;checkAbort(this.signal);
    if(doc?.structural)return doc.readerSource?.peekReaderDocument(doc.id,locale)||null;
    return this.entry(doc,locale)?this.cache.get(`${doc.id}/${locale}`)||null:null;
  }
  async load(doc,locale){
    if(!locales.has(locale))return null;checkAbort(this.signal);
    if(doc?.structural)return doc.readerSource.readerDocument(doc.id,locale);
    await this.initialize();
    const entry=this.entry(doc,locale);if(!entry)return null;
    const key=`${doc.id}/${locale}`;if(this.cache.has(key))return this.cache.get(key);
    if(this.inflight.has(key))return this.inflight.get(key);
    const work=this.json(`data/translations/${entry.file}`,entry.sha256).then(value=>{
      checkAbort(this.signal);this.entry(doc,locale);
      const translation=freeze(validateTranslation(doc,value,locale,entry.source));this.cache.clear();this.cache.set(key,translation);return translation;
    }).finally(()=>this.inflight.delete(key));
    this.inflight.set(key,work);return work;
  }
}

// Display helpers never parse translated prose to infer Russian legal structure.
// Original Corpus objects and loaded translations are immutable during a mount.
const contexts=new WeakMap();
function context(doc,translation){
  requireThat(object(translation),'payload','A translation document is required.');
  requireThat(translation.docId===doc?.id&&translation.source?.version===doc?.version&&translation.source?.sha256===doc?.sha256,'source','Display translation does not match the original.');
  let documents=contexts.get(translation);if(!documents){documents=new WeakMap();contexts.set(translation,documents);}
  let result=Object.isFrozen(translation)?documents.get(doc):null;if(result)return result;
  validateTranslation(doc,translation,translation.locale);
  const units=new Map(doc.units.map(unit=>[unit.id,unit])),sections=new Map(doc.sections.map(section=>[section.id,section])),literal=new Map();
  for(const section of doc.sections)literal.set(compact(section.title),translation.sections[section.id]);
  for(const unit of doc.units)if(!literal.has(compact(unit.text)))literal.set(compact(unit.text),translation.units[unit.id].text);
  result={units,sections,literal};if(Object.isFrozen(translation))documents.set(doc,result);return result;
}

/** Search-only view: no source checksum, version, coverage or review grading pins. */
export function displayDocument(originalDoc,translation){
  if(!translation)return originalDoc;context(originalDoc,translation);
  return {id:originalDoc.id,title:translation.title,revisionLabel:translation.revisionLabel,
    number:originalDoc.number,sourceUrl:originalDoc.sourceUrl,locale:translation.locale,displayOnly:true,
    sections:originalDoc.sections.map(section=>({id:section.id,title:translation.sections[section.id],unitIds:[...section.unitIds]})),
    units:originalDoc.units.map(unit=>({...unit,...translation.units[unit.id]}))};
}

function quoted(value){
  const characters=Array.from(compact(value));let excerpt=characters.slice(0,64).join('');
  if(characters.length>64){const space=excerpt.lastIndexOf(' ');if(space>=32)excerpt=excerpt.slice(0,space);excerpt+='…';}
  return `“${excerpt}”`;
}
const structure=/^(?:(?:Подп\.|П\.|Ч\.|Ст\.)(?:\d+(?:[.\-]\d+)*|«[а-яёa-z]»))(?: (?:Подп\.|П\.|Ч\.|Ст\.)(?:\d+(?:[.\-]\d+)*|«[а-яёa-z]»))*$/iu;
function formatStructure(value,locale){
  return value.replace(/(Подп\.|П\.|Ч\.|Ст\.)(\d+(?:[.\-]\d+)*|«[а-яёa-z]»)/giu,(_,type,number)=>{
    const labels=locale==='zh'?{'Ст.':'条','Ч.':'款','П.':'项','Подп.':'目'}:{'Ст.':'Art.','Ч.':'Part','П.':'Point','Подп.':'Subpoint'};
    return locale==='zh'?`第${number}${labels[type]}`:`${labels[type]} ${number}`;
  });
}

export function labelForDisplayUnit(originalDoc,unitId,translation,locale){
  if(!translation||!locales.has(locale))return labelForUnit(originalDoc,unitId);
  requireThat(translation.locale===locale,'payload','Display locale does not match the translation.');
  const index=context(originalDoc,translation),unit=index.units.get(unitId);if(!unit)return '';
  const label=labelForUnit(originalDoc,unitId),translated=translation.units[unitId];
  const parts=label.match(/^(.*?) · (текст|«[\s\S]*»)$/u),base=parts?parts[1]:label,suffix=parts?parts[2]:'';
  const heading=structure.test(base)?formatStructure(base,locale):index.literal.get(compact(base))||translated.locator;
  if(!suffix)return heading;
  return heading+' · '+(suffix==='текст'?(locale==='zh'?'正文':'text'):quoted(translated.text));
}
