// Deterministic translation inventory. Source content, IDs, state and scoring are never rewritten.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {stringSegments} from './source-strings.mjs';
const base = new URL('../', import.meta.url);
const entries = new Map();
const russian = /[А-Яа-яЁё]/;
function add(text, context) {
  if (typeof text !== 'string' || !russian.test(text)) return;
  const value = text.trim();
  if (!value || /^https?:/.test(value)) return;
  const id = createHash('sha256').update(value).digest('hex').slice(0, 16);
  const previous = entries.get(id);
  if (previous && previous.ru !== value) throw new Error(`Catalog hash collision: ${id}`);
  if (!previous) entries.set(id, {id, ru: value, contexts: [context],...(/\.js:\d+$/.test(context)&&value.includes('(?:')?{nonDisplay:true,reason:'Regular-expression normalization pattern, not rendered interface copy.'}:{})});
  else if (previous.contexts.length < 3 && !previous.contexts.includes(context)) previous.contexts.push(context);
}
function walk(value, context) {
  if (typeof value === 'string') add(value, context);
  else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${context}[${item?.id || index}]`));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walk(item, `${context}.${key}`);
}
for (const name of ['cases', 'evidence-catalog', 'source-index', 'graphics-data', 'assignment', 'policy']) {
  const module = await import(new URL(`js/${name}.js`, base));
  for (const [key, value] of Object.entries(module)) if (key !== 'CASES') walk(value, `${name}:${key}`);
}

function htmlParts(value) {
  if (!/[<>]|(?:aria-label|title|placeholder|alt)\s*=/.test(value)) return [value];
  const attributes = [...value.matchAll(/(?:aria-label|title|placeholder|alt)\s*=\s*["']([^"']*)(?:["']|$)/g)].map(match => match[1]);
  // A template segment can start or end halfway through an HTML tag. Extract
  // its readable attribute separately; do not ask translators to translate markup.
  const visible = value.replace(/<[^>]*(?:>|$)/g, '\n').replace(/^[^<>\n]*>/, '\n').split('\n').filter(part => !/(?:aria-label|class|data-[\w-]+|placeholder|alt)\s*=/.test(part));
  return [...attributes, ...visible];
}
for (const name of ['app', 'icons', 'confirm', 'boot', 'standalone', 'source-monitor-ui', 'source-lifecycle', 'source-policy', 'legal-reference', 'engine', 'evidence']) {
  const source = await readFile(new URL(`js/${name}.js`, base), 'utf8');
  for (const item of stringSegments(source)) {
    const line = source.slice(0, item.start).split('\n').length;
    for (const part of htmlParts(item.text)) add(part, `${name}.js:${line}`);
  }
}
// Keep prior IDs used by assigned translation batches and old display snapshots.
// Removed UI copy is marked, not silently deleted while translators are working.
try {
  const prior=JSON.parse(await readFile(new URL('source/inventory.json',import.meta.url),'utf8'));
  for(const entry of prior.entries||[])if(!entries.has(entry.id))entries.set(entry.id,{...entry,retired:true,...(/return 'mfc-head'/.test(entry.ru)?{nonDisplay:true,reason:'Old lexer read quotation marks inside a regular expression as string delimiters.'}:{})});
} catch(error) {if(error.code!=='ENOENT')throw error;}
const values = [...entries.values()].sort((a, b) => a.contexts[0].localeCompare(b.contexts[0], 'en') || a.id.localeCompare(b.id));
await mkdir(new URL('source/', import.meta.url), {recursive: true});
await writeFile(new URL('source/inventory.json', import.meta.url), JSON.stringify({version: 1, count: values.length, characters: values.reduce((n, item) => n + item.ru.length, 0), entries: values}, null, 2) + '\n');
const groups = new Map();
for (const item of values) {
  const group = item.contexts[0].split(/[:.]/)[0];
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push(item);
}
console.log(JSON.stringify({count: values.length, characters: values.reduce((n, item) => n + item.ru.length, 0), groups: Object.fromEntries([...groups].map(([key, items]) => [key, {count: items.length, characters: items.reduce((n, item) => n + item.ru.length, 0)}]))}, null, 2));
