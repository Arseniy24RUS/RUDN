import {loadJSON,isRecord} from './loader.mjs';
import {storageKey} from './storage.mjs';
/** Trilingual presentation layer for the existing vanilla application.
 * It never changes scoring data, input values, IDs or event listeners.
 * Text-node originals make switching back lossless, including a mounted dialog.
 */
export const SUPPORTED_LANGUAGES = ['ru', 'en', 'zh-Hans'];
export const LANGUAGE_KEY = storageKey('language-v2');
let language='ru', observer=null,languageRequest=0;
const pendingLanguages=new Map();
export const unavailableLanguages=new Set();
const resources=new Map();
const originals=new WeakMap(), attributeOriginals=new WeakMap();
export const missingTranslations=new Set();
const normalized = text => String(text).replace(/\s+/g,' ').trim();
const escapeRE = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function normalizeLanguage(value='') {
  const v=String(value).toLowerCase();
  return v==='en'||v.startsWith('en-')?'en':v==='zh'||v.startsWith('zh-')?'zh-Hans':'ru';
}
export function preferredLanguage(values=[]) {
  for(const value of values){if(/^(ru|en|zh)(-|$)/i.test(value))return normalizeLanguage(value);}
  return 'ru';
}
export function configureTranslations(entries={}, templates=[], locale='en') {
  const dictionary=Object.fromEntries(Object.entries(entries).map(([key,value])=>[normalized(key),value]));
  const patterns=templates.map(([source,target])=>({
    re:new RegExp('^'+source.split(/(\{\d+\})/).map(x=>/^\{\d+\}$/.test(x)?'(.+?)':escapeRE(x)).join('')+'$'),target
  }));
  resources.set(normalizeLanguage(locale),{dictionary,patterns});
}
export function englishText(source){return textForLanguage(source,'en');}
export function chineseText(source){return textForLanguage(source,'zh-Hans');}
export function getLanguage(){return language;}
export function numberLocale(){return language==='zh-Hans'?'zh-CN':language==='en'?'en-GB':'ru-RU';}
export function translate(source,depth=0,forceEnglish=false){return textForLanguage(source,forceEnglish?'en':language,depth);}
export function textForLanguage(source,locale=language,depth=0){
  locale=normalizeLanguage(locale);
  if(locale==='ru'||typeof source!=='string')return source;
  const key=normalized(source),{dictionary={},patterns=[]}=resources.get(locale)||{};
  if(!key||!/[А-Яа-яЁё]/.test(key))return source;
  let output=dictionary[key];
  if(output===undefined&&depth<4)for(const pattern of patterns){
    const match=key.match(pattern.re);
    if(match){output=pattern.target.replace(/\{(\d+)\}/g,(_,i)=>textForLanguage(match[Number(i)+1],locale,depth+1));break;}
  }
  if(output===undefined&&depth<4)for(const separator of ['; ', ', ']){
    const parts=key.split(separator);if(parts.length<2)continue;
    const translated=parts.map(part=>textForLanguage(part,locale,depth+1));
    if(translated.every(part=>!/[А-Яа-яЁё]/.test(part))){output=translated.join(locale==='zh-Hans'?'、':separator);break;}
  }
  if(output===undefined){missingTranslations.add(key);return source;}
  return source.replace(/\S[\s\S]*\S|\S/, output);
}
export async function ensureLanguage(locale) {
 locale=normalizeLanguage(locale);
 if(locale==='ru'||resources.has(locale))return true;
 if(pendingLanguages.has(locale))return pendingLanguages.get(locale);
 const request=loadJSON(`./locales/${locale}.json`,{timeout:4000,validate:x=>isRecord(x)&&isRecord(x.entries)&&Array.isArray(x.templates)})
  .then(content=>{configureTranslations(content.entries,content.templates,locale);unavailableLanguages.delete(locale);return true;})
  .catch(()=>{unavailableLanguages.add(locale);return false;}).finally(()=>pendingLanguages.delete(locale));
 pendingLanguages.set(locale,request);return request;
}
function languageNotice(locale) {
 let el=document.getElementById('language-load-notice');
 if(!el){el=document.createElement('div');el.id='language-load-notice';el.className='app-notice';el.setAttribute('role','status');document.body.prepend(el);}
 el.textContent=language==='en'?'This language could not be loaded. Your answers are safe; try again.':language==='zh-Hans'?'无法加载该语言。答案已保留，请重试。':'Не удалось загрузить выбранный язык. Ответы сохранены; попробуйте переключить его ещё раз.';
}
export async function setLanguage(value,{persist=true}={}) {
  const requested=normalizeLanguage(value),ticket=++languageRequest;
  if(requested!=='ru'&&!resources.has(requested)) {
    if(!await ensureLanguage(requested)){if(ticket===languageRequest)languageNotice(requested);return false;}
    if(ticket!==languageRequest)return false;
  }
  document.getElementById('language-load-notice')?.remove();
  language=requested;
  if(persist)try{localStorage.setItem(LANGUAGE_KEY,language);}catch{/* private mode: session only */}
  document.documentElement.lang=language;
  document.title=language==='ru'?'Профориентационный тест для госслужащих':language==='en'?'Career Guidance Test for Civil Servants':'公务员职业倾向测试';
  document.querySelectorAll('[data-language]').forEach(el=>{const on=el.dataset.language===language;el.setAttribute('aria-pressed',String(on));el.classList.toggle('selected',on);});
  translateDOM(document.body);
  document.dispatchEvent(new CustomEvent('app:language',{detail:language}));
}
function ignored(el){return el?.closest('script,style,code,pre,[data-no-i18n],textarea,[contenteditable="true"]');}
function translateText(node){
  if(ignored(node.parentElement)||!node.nodeValue?.trim())return;
  const value=node.nodeValue, record=originals.get(node);
  const source=record && value===record.rendered?record.source:value;
  const rendered=translate(source);
  originals.set(node,{source,rendered});
  if(value!==rendered)node.nodeValue=rendered;
}
function translateAttributes(el){
  if(ignored(el))return;
  const records=attributeOriginals.get(el)||{};
  for(const key of ['title','aria-label','placeholder','alt']) {
    if(!el.hasAttribute(key))continue;
    const value=el.getAttribute(key), prior=records[key];
    const source=prior&&value===prior.rendered?prior.source:value,rendered=translate(source);
    records[key]={source,rendered};if(value!==rendered)el.setAttribute(key,rendered);
  }
  attributeOriginals.set(el,records);
}
export function translateDOM(root=document.body){
  if(!root)return;
  observer?.disconnect();
  if(root.nodeType===Node.TEXT_NODE)translateText(root);
  else {
    if(root.nodeType===Node.ELEMENT_NODE)translateAttributes(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let node;while((node=walker.nextNode()))node.nodeType===Node.TEXT_NODE?translateText(node):translateAttributes(node);
  }
  observer?.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','alt']});
}
export async function initializeI18n(){
  let saved;try{saved=localStorage.getItem(LANGUAGE_KEY);}catch{}
  const query=new URL(location.href).searchParams.get('lang');
  await setLanguage(__careerHost.lang||query||saved||preferredLanguage(navigator.languages||[navigator.language]),{persist:false});
  observer=new MutationObserver(records=>{
    // One synchronous batch. Disconnect around our writes, avoiding feedback loops.
    observer.disconnect();
    const roots=new Set();
    for(const record of records){
      if(record.type==='childList')record.addedNodes.forEach(n=>roots.add(n));else roots.add(record.target);
    }
    for(const root of roots) {
      if(!root.isConnected)continue;
      if(root.nodeType===Node.TEXT_NODE)translateText(root);
      else if(root.nodeType===Node.ELEMENT_NODE){translateAttributes(root);const w=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))n.nodeType===Node.TEXT_NODE?translateText(n):translateAttributes(n);}
    }
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','alt']});
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','alt']});
  document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.language)));
}
