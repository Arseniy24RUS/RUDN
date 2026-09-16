import {UI_COPY, UI_TEMPLATES} from './ui.js';
import {createReceptionCatalogLoader} from './catalog-loader.js';
import {unapprovedCyrillic} from './validation.js';
export {createReceptionCatalogLoader} from './catalog-loader.js';

const cyrillic = /[А-Яа-яЁё]/;
const word = /[\p{L}\p{N}_]/u;
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const normalizeReceptionLocale = value => /^zh/i.test(value || '') ? 'zh' : /^en/i.test(value || '') ? 'en' : 'ru';
const preserve = 'input,textarea,script,style,code,pre,[data-rx-user-content],[translate="no"]';
const attributes = ['title', 'aria-label', 'placeholder', 'alt'];
const normalize = value => String(value ?? '').replace(/\u00a0/g, ' ').trim();

/** Display only: no IDs, attributes used as answers, control values, or objects are mutated. */
export function createReceptionTranslator({locale = 'ru', catalog = {}, literals = {}, onMissing = () => {}} = {}) {
  const language = normalizeReceptionLocale(locale);
  const languageIndex = language === 'zh' ? 2 : 1;
  const dictionary = new Map([...UI_COPY, ...UI_TEMPLATES].map(row => [normalize(row[0]), row[languageIndex]]));
  for (const [source, translated] of Object.entries(catalog)) dictionary.set(normalize(source), translated);
  const folded=new Map([...dictionary].map(([source,target])=>[source.toLocaleLowerCase('ru'),{source,target}]));
  const uiTemplates=new Set(UI_TEMPLATES.map(([source])=>normalize(source)));
  const templates = [...dictionary].filter(([source]) => /\{\{\w+\}\}/.test(source)).map(([source, target]) => {
    const names = []; let last = 0; let pattern = '^';
    for (const match of source.matchAll(/\{\{(\w+)\}\}/g)) {
      // This is an authored difficulty label, not an arbitrary phrase ending in
      // «уровень». Otherwise evidence captions such as «Наименование и уровень»
      // are misread as a level and never reach exact-segment composition.
      // Count slots in the UI are canonical integer counters. An unconstrained
      // "{{count}} месяц" would consume an entire document caption ending in
      // «месяц» before its known complete title can be translated.
      const capture=source==='{{topic}} · {{level}} уровень'&&match[1]==='level'?'(Базовый|Средний|Сложный)':uiTemplates.has(source)&&match[1]==='count'?'(\\d+)':'(.+?)';
      pattern += escapeRegExp(source.slice(last, match.index)) + capture; names.push(match[1]); last = match.index + match[0].length;
    }
    return {pattern: new RegExp(pattern + escapeRegExp(source.slice(last)) + '$','s'), names, target,source,specificity:source.replace(/\{\{\w+\}\}/g,'').length};
  // A longer authored paragraph must win over its generic prefix. Otherwise a
  // final date slot can swallow the extra sentence and leave it untranslated.
  // Pack/assignment order must not decide which authored translation is used.
  }).sort((a,b)=>b.specificity-a.specificity||(a.source<b.source?-1:a.source>b.source?1:0));
  // Exact authored source segments allow composition of a UI prefix + case title,
  // option text or reference caption. These are not arbitrary word translations;
  // profile text and entered answers are excluded by explicit DOM boundaries.
  const fragments = new Map([...dictionary].filter(([source])=>cyrillic.test(source)&&!source.includes('{{')));
  const fragmentPattern = new RegExp([...fragments.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|'), 'gi');
  const missing = new Set();
  const renderedText=new WeakMap(),renderedAttributes=new WeakMap();
  const report = text => { if (!missing.has(text)) { missing.add(text); onMissing(text); } };

  function translate(value, {reportMissing = true, depth=0} = {}) {
    const original = String(value ?? '');
    if (language === 'ru' || !cyrillic.test(original)) return original;
    const source = normalize(original);
    let translated = dictionary.get(source);
    const allowed=[...(literals[source]||[])];
    if(translated===undefined&&folded.has(source.toLocaleLowerCase('ru'))){const match=folded.get(source.toLocaleLowerCase('ru'));translated=match.target;allowed.push(...(literals[match.source]||[]));}
    if(translated===undefined){const month=source.match(/^(январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь)(?:\s+(\d{4})(?:\s*г\.)?)?$/i);if(month){const index=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'].indexOf(month[1].toLowerCase());translated=new Intl.DateTimeFormat(language==='zh'?'zh-CN':'en',{month:'long',...(month[2]?{year:'numeric'}:{}),timeZone:'UTC'}).format(new Date(Date.UTC(Number(month[2]||2026),index,1)));}}
    if (translated === undefined) {
      for (const template of templates) {
        const match = source.match(template.pattern);
        if (!match) continue;
        const substitutions = Object.fromEntries(template.names.map((name, index) => [name, depth<3?translate(match[index+1],{reportMissing:false,depth:depth+1}):match[index+1]]));
        translated = template.target.replace(/\{\{(\w+)\}\}/g, (token, name) => substitutions[name] ?? token);
        allowed.push(...(literals[template.source]||[]));
        break;
      }
    }
    if (translated === undefined) translated = source.replace(fragmentPattern, (segment, index) => {
      const before = source[index - 1], after = source[index + segment.length];
      if ((before && word.test(before) && word.test(segment[0])) || (after && word.test(after) && word.test(segment.at(-1)))) return segment;
      // A case-sensitive authored title can intentionally differ from its
      // sentence-case variant. Prefixing it must keep the same translation and
      // reference-code spelling as rendering the complete title on its own.
      const match=dictionary.has(segment)?{source:segment,target:dictionary.get(segment)}:folded.get(segment.toLocaleLowerCase('ru'));
      allowed.push(...(literals[match.source]||[]));
      return match.target;
    });
    if (reportMissing && unapprovedCyrillic(source,translated,{literals:allowed})) report(source);
    const leading = original.match(/^\s*/)?.[0] || '', trailing = original.match(/\s*$/)?.[0] || '';
    return leading + translated + trailing;
  }

  function apply(root) {
    if (!root) return;
    root.lang = language === 'zh' ? 'zh-Hans' : language;
    if (language === 'ru') return;
    const document = root.ownerDocument;
    // An <option> without a value attribute derives its value from its label.
    // Preserve that canonical value before changing only the displayed label.
    for (const option of root.querySelectorAll('option:not([value])')) option.setAttribute('value', option.value);
    const walker = document.createTreeWalker(root, 4); // SHOW_TEXT, also works in an iframe document.
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement?.closest(preserve)) {
        const previous=renderedText.get(node),source=previous&&node.nodeValue===previous.translated?previous.source:node.nodeValue;
        const translated=translate(source);renderedText.set(node,{source,translated});node.nodeValue=translated;
      }
    }
    for (const element of [root, ...root.querySelectorAll('*')]) {
      if (element.closest('[data-rx-user-content],[translate="no"]')) continue;
      // Only accessibility/presentation attributes; never value, href, data-* or name.
      for (const attribute of attributes) if (element.hasAttribute(attribute)) {
        const values=renderedAttributes.get(element)||{},previous=values[attribute],current=element.getAttribute(attribute);
        const source=previous&&current===previous.translated?previous.source:current,translated=translate(source);
        values[attribute]={source,translated};renderedAttributes.set(element,values);element.setAttribute(attribute,translated);
      }
    }
  }
  return {locale: language, translate, apply, missing: () => [...missing]};
}

const defaultCatalogLoader = createReceptionCatalogLoader();
/** Load only common + assigned cases; catalog/editor packs require explicit flags. */
export async function loadReceptionTranslator(locale, options = {}) {
  const language = normalizeReceptionLocale(locale);
  if (language === 'ru') return createReceptionTranslator({locale: language, ...options});
  const loader=options.loader||(options.fetch?createReceptionCatalogLoader({fetch:options.fetch,cacheStorage:null}):defaultCatalogLoader);
  const loaded=await loader.load(language,options);
  const translator=createReceptionTranslator({...options,locale:language,catalog:loaded.catalog,literals:loaded.literals});
  return {...translator,groups:loaded.groups,contentVersion:loaded.manifest.contentVersion};
}
