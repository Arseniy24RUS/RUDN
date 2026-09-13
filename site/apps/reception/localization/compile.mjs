// A locale is publishable only after both translations cover every inventory entry.
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {UI_COPY, UI_TEMPLATES} from './ui.js';
import {createLocalePackPlan, compileLocalePacks,compileEvidenceAliasPack} from './pack-builder.mjs';
import {unapprovedCyrillic,approvedEvidenceLiterals} from './validation.js';
const inventory = JSON.parse(await readFile(new URL('source/inventory.json', import.meta.url), 'utf8'));
const translated = new Map([...UI_COPY,...UI_TEMPLATES].map(([ru, en, zh]) => [ru.trim(), {en, zh}]));
const byId = new Map(inventory.entries.map(entry => [entry.id, entry]));
inventory.entries=inventory.entries.filter(entry=>!entry.nonDisplay);
let files = [];
try { files = (await readdir(new URL('translations/', import.meta.url))).filter(file => file.endsWith('.json')).sort(); } catch { /* No translation batches completed yet. */ }
for (const file of files) {
  const entries = JSON.parse(await readFile(new URL(`translations/${file}`, import.meta.url), 'utf8'));
  for (const [id, value] of Object.entries(entries)) {
    const source = byId.get(id);
    if (!source) throw new Error(`Unknown inventory ID ${id} in ${file}`);
    const old = translated.get(source.ru);
    if (old && (old.en !== value.en || old.zh !== value.zh)) throw new Error(`Conflicting translations for ${id}`);
    translated.set(source.ru, value);
  }
}
const tokens = (text, pattern) => [...String(text).matchAll(pattern)].map(match => match[0]).sort().join('\n');
const problems = [];
for (const entry of inventory.entries) {
  const item = translated.get(entry.ru);
  if (!item) continue;
  for (const language of ['en', 'zh']) {
    const text = item[language];
    if (typeof text !== 'string' || !text.trim()) problems.push(`${entry.id}/${language}: missing text`);
    else {
      const literals=approvedEvidenceLiterals(entry);
      if (unapprovedCyrillic(entry.ru,text,{literals})) problems.push(`${entry.id}/${language}: Russian fallback`);
      for(const literal of literals)if(!text.includes(literal))problems.push(`${entry.id}/${language}: omitted spelling evidence ${literal}`);
      if (tokens(entry.ru, /\{\{\w+\}\}/g) !== tokens(text, /\{\{\w+\}\}/g)) problems.push(`${entry.id}/${language}: changed placeholders`);
      if (tokens(entry.ru, /https?:\/\/[^\s)]+/g) !== tokens(text, /https?:\/\/[^\s)]+/g)) problems.push(`${entry.id}/${language}: changed URL`);
      if (tokens(entry.ru, /\d+(?:[.,]\d+)*/g) !== tokens(text, /\d+(?:[.,]\d+)*/g)) problems.push(`${entry.id}/${language}: changed number`);
    }
  }
}
const missing = inventory.entries.filter(entry => !translated.has(entry.ru));
const summary = {total: inventory.entries.length, translated: inventory.entries.length - missing.length, missing: missing.length, problems};
console.log(JSON.stringify(summary, null, 2));
if (process.argv.includes('--batches')) {
  const batches = []; let batch = [], size = 0;
  for (const entry of missing) {
    if (batch.length && (batch.length >= 160 || size + entry.ru.length > 14000)) { batches.push(batch); batch = []; size = 0; }
    batch.push(entry); size += entry.ru.length;
  }
  if (batch.length) batches.push(batch);
  await mkdir(new URL('source/batches/', import.meta.url), {recursive: true});
  for (let i = 0; i < batches.length; i++) await writeFile(new URL(`source/batches/${String(i).padStart(3, '0')}.json`, import.meta.url), JSON.stringify(batches[i], null, 2) + '\n');
  console.log(`Prepared ${batches.length} bounded batches, at most 160 strings / 14,000 source characters each.`);
}
if (missing.length || problems.length) { process.exitCode = 1; }
else {
  await mkdir(new URL('compiled/', import.meta.url), {recursive: true});
  const plan=await createLocalePackPlan(inventory);
  const aliases=compileEvidenceAliasPack(plan,translated);
  await writeFile(new URL('compiled/'+aliases.manifest.path,import.meta.url),JSON.stringify(aliases.pack)+'\n');
  await writeFile(new URL('compiled/evidence-aliases.manifest.json',import.meta.url),JSON.stringify(aliases.manifest)+'\n');
  // Mandatory, small code dependency: importing it needs no second service call
  // and the release-pinned service worker can prepare it with the module shell.
  await writeFile(new URL('compiled/evidence-aliases.js',import.meta.url),`// Generated only after complete validated translation coverage.\nexport const contentVersion=${JSON.stringify(aliases.pack.contentVersion)};\nexport const sourceVersion=${JSON.stringify(aliases.pack.sourceVersion)};\nexport const sha256=${JSON.stringify(aliases.manifest.sha256)};\nexport const aliases=${JSON.stringify(aliases.pack.aliases)};\n`);
  for (const language of ['en', 'zh']) {
    const {packs,manifest}=compileLocalePacks(plan,language,translated);
    for(const [id,pack] of packs) {
      const url=new URL('compiled/'+manifest.entries[id].path,import.meta.url);
      await mkdir(new URL('./',url),{recursive:true});
      await writeFile(url,JSON.stringify(pack)+'\n');
    }
    // Publish the complete manifest last; a partial compile cannot advertise a pack.
    await writeFile(new URL(`compiled/${language}.manifest.json`,import.meta.url),JSON.stringify(manifest)+'\n');
  }
}
