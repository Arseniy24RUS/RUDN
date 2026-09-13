// Build-only dependency graph: never import this file from the browser application.
// Content is split by the same canonical assignment boundary as content-library.js.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CONTENT_MANIFEST} from '../content/manifest.js';
import {GFX_DOCUMENTS, GFX_EVIDENCE} from '../js/graphics-data.js';
import {UI_COPY, UI_TEMPLATES} from './ui.js';
import {approvedEvidenceLiterals} from './validation.js';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const russian = /[А-Яа-яЁё]/;
const textValues = (value, result = new Set()) => {
  if (typeof value === 'string') {const text=value.trim();if(russian.test(text)&&!/^https?:/.test(text))result.add(text);}
  else if (Array.isArray(value)) for(const entry of value)textValues(entry,result);
  else if (value && typeof value==='object') for(const entry of Object.values(value))textValues(entry,result);
  return result;
};
const contentJSON = async path => JSON.parse(await readFile(new URL('../content/'+path,import.meta.url),'utf8'));

export async function createLocalePackPlan(inventory) {
  inventory={...inventory,entries:inventory.entries.filter(entry=>!entry.nonDisplay)};
  const known=new Set(inventory.entries.map(entry=>entry.ru));
  const common=textValues(await contentJSON('common.json'));
  for(const value of [CONTENT_MANIFEST.role,CONTENT_MANIFEST.rubric,CONTENT_MANIFEST.bank,CONTENT_MANIFEST.indexHeader])textValues(value,common);
  // Runtime UI, validation and error text are small; full authored case paragraphs
  // and the optional source editor/catalog are not promoted into this first pack.
  for(const entry of inventory.entries)if(entry.contexts.some(context=>/^[a-z-]+\.js:/.test(context)||/^(assignment|policy):/.test(context)))common.add(entry.ru);
  for(const [source] of [...UI_COPY,...UI_TEMPLATES])common.add(source.trim());
  const groups=new Map([['common',common]]),evidenceTasks=new Map();
  for(const [id,resource] of Object.entries(CONTENT_MANIFEST.resources)) {
    const canonical=await contentJSON(resource.path),values=textValues(canonical);
    if(['text','role'].includes(canonical.task.extracted.normalize||'text'))evidenceTasks.set(JSON.stringify([canonical.task.id,canonical.task.extracted.normalize||'text',canonical.task.extracted.accepted]),canonical.task);
    for(const [key,value] of Object.entries(GFX_DOCUMENTS))if(key.startsWith(id+'::'))textValues(value,values);
    textValues(GFX_EVIDENCE.filter(record=>record.caseId===id),values);
    for(const shared of common)values.delete(shared);
    groups.set('cases/'+id,values);
  }
  for(const [id,path] of [['catalog','catalog.json'],['source-index','source-index.json']]) {
    const values=textValues(await contentJSON(path));for(const shared of common)values.delete(shared);groups.set(id,values);
  }
  const assigned=new Set([...groups.values()].flatMap(values=>[...values]));
  // Inventory includes editor-only authored metadata not read by the student flow.
  // Keep it in the explicit source-editor pack, never silently drop its coverage.
  for(const entry of inventory.entries)if(!assigned.has(entry.ru))groups.get('source-index').add(entry.ru);
  const explicitUI=new Set([...UI_COPY,...UI_TEMPLATES].map(row=>row[0].trim()));
  const unknown=[...new Set([...groups.values()].flatMap(values=>[...values]))].filter(source=>!known.has(source)&&!explicitUI.has(source));
  if(unknown.length)throw Error(`Reception locale inventory is out of date (${unknown.length} source strings). Refresh inventory, not assigned translation batches.`);
  return {schema:2,contentVersion:CONTENT_MANIFEST.contentVersion,sourceVersion:digest(inventory.entries.map(({id,ru})=>({id,ru}))),
    groups,evidenceTasks:[...evidenceTasks.values()],templateIds:Object.keys(CONTENT_MANIFEST.resources),inventoryCount:inventory.entries.length,
    evidenceLiterals:new Map(inventory.entries.map(entry=>[entry.ru,approvedEvidenceLiterals(entry)]).filter(([,values])=>values.length))};
}

/** Tiny language-independent grading overlay: both languages are always loaded.
 * No document bodies, new accepted concepts, variants or user-written values.
 */
export function compileEvidenceAliasPack(plan,translated) {
  const aliases=plan.evidenceTasks.map(task=>({taskId:task.id,normalize:task.extracted.normalize||'text',accepted:[...task.extracted.accepted],values:task.extracted.accepted.map(source=>{
    const translation=translated.get(source.trim());
    if(russian.test(source)&&(!translation?.en||!translation?.zh))throw Error('Missing evidence-answer translation for '+task.id+': '+source);
    return {source,en:translation?.en||source,zh:translation?.zh||source};
  })}));
  const pack={schema:1,kind:'evidence-aliases',contentVersion:plan.contentVersion,sourceVersion:plan.sourceVersion,complete:true,aliases};
  const sha256=digest(pack),manifest={schema:1,kind:'evidence-aliases',contentVersion:plan.contentVersion,sourceVersion:plan.sourceVersion,complete:true,count:aliases.length,path:`evidence-aliases.${sha256.slice(0,16)}.json`,sha256};
  return {pack,manifest};
}

/** Pure build function, injectable translated strings allow structural test fixtures. */
export function compileLocalePacks(plan,language,translated) {
  if(!['en','zh'].includes(language))throw Error('Unsupported Reception locale.');
  const packs=new Map(),entries={};
  for(const [id,values] of plan.groups) {
    const strings={};
    for(const source of [...values].sort()) {
      const text=translated.get(source)?.[language];
      if(typeof text!=='string'||!text.trim())throw Error(`Incomplete ${language} pack ${id}: ${source.slice(0,100)}`);
      strings[source]=text;
    }
    const literals=Object.fromEntries([...plan.evidenceLiterals].filter(([source])=>values.has(source)));
    const pack={schema:2,locale:language,id,contentVersion:plan.contentVersion,sourceVersion:plan.sourceVersion,complete:true,count:values.size,strings,literals};
    const hash=digest(pack);packs.set(id,pack);
    entries[id]={path:`${language}/${id}.${hash.slice(0,16)}.json`,sha256:hash,count:values.size};
  }
  return {packs,manifest:{schema:2,locale:language,complete:true,contentVersion:plan.contentVersion,sourceVersion:plan.sourceVersion,
    inventoryCount:plan.inventoryCount,templates:plan.templateIds,entries}};
}
