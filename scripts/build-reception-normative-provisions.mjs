/** Build the server-side passage index from the same pinned texts used by the cabinet. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {unpackDescriptor} from '../site/apps/legal-lab/lib/reader-codec.mjs';
import {acceptableLegalProvisions,applicableLegalUnits,normativeActsForCase,hasApplicableLegalCitation} from '../firebase/functions/reception-ai/normative-acts.mjs';

const input = process.argv[2];
assert.ok(input, 'Pass the directory containing the authored Reception cases.');
const root = fileURLToPath(new URL('../', import.meta.url));
const reception = resolve(root,'site/apps/reception');
const legalLab = resolve(root,'site/apps/legal-lab');
const readJSON = path => JSON.parse(readFileSync(path,'utf8'));
const cases = readdirSync(input).filter(name => name.endsWith('.json')).sort().flatMap(name => {
  const row = readJSON(resolve(input,name));
  return [row,...(row.dateVariants || []).map(variant => ({...variant,id:row.id}))];
});
assert.ok(cases.length, 'No cases to validate.');
const required = new Map();
for (const row of cases) {
  const acts = normativeActsForCase(row);
  const provisions = Object.entries(acceptableLegalProvisions(row));
  assert.ok(acts.length && provisions.length, `No legal basis for ${row.id}`);
  for (const [id,parts] of provisions) {
    assert.ok(acts.some(act => act.id === id), `Act ${id} unavailable in ${row.id}`);
    const merged = required.get(id) || new Set();
    parts.forEach(part => merged.add(part));
    required.set(id,merged);
  }
}
const localCatalog = readJSON(resolve(reception,'content/legal-documents/catalog.json'));
const sharedCatalog = readJSON(resolve(legalLab,'data/catalog.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const article = text => text.match(/^(?:[А-ЯЁ]+ РФ\s+)?Статья\s+(\d+(?:\.\d+)?)(?=\.|\s|$)/iu)?.[1];
const clause = text => text.match(/^(\d+(?:\.\d+)?)(?:\((\d+)\))?\.(?=\s)/u)?.slice(1).filter(Boolean).join('.');
const clauseDocuments = new Set(['reception-driver160','reception-flight82','reception-law363263']);
const specialClauseSections = {
  'reception-driver160':new Set(['driver160-s1']),
  'reception-flight82':new Set(['flight82-s9']),
  'reception-law363263':new Set(['law363263-s2']),
};
const quoteText = text => text.normalize('NFC').replace(/\s+/gu,' ').trim();
const index = {};
const inlineArticleDocuments = new Set([
  'reception-law13744','reception-law19671','reception-law34683','reception-law39570','reception-tax2',
]);
const locatorStarts = {};
for (const [id,parts] of [...required].sort(([left],[right]) => left.localeCompare(right))) {
  const local = localCatalog.documents.find(doc => doc.id === id);
  const meta = local || sharedCatalog.documents.find(doc => doc.id === id);
  assert.ok(meta?.coverage === 'full', `${id} is missing a full-text source`);
  let bundle;
  if (meta.bundle) {
    const reference = new URL(meta.bundle.url).pathname.match(/^\/[^/]+\/[^/]+\/([\da-f]{40})\/(.+)$/i);
    assert.ok(reference, `Unsupported immutable bundle path for ${id}`);
    let zipped;
    try {
      zipped = execFileSync('git',['show',`${reference[1]}:${reference[2]}`],{cwd:root,maxBuffer:32 * 1024 ** 2,stdio:['ignore','pipe','ignore']});
    } catch {
      const response = await fetch(meta.bundle.url);
      assert.ok(response.ok, `Could not acquire the pinned text for ${id}`);
      zipped = Buffer.from(await response.arrayBuffer());
    }
    const raw = gunzipSync(zipped);
    assert.equal(sha(raw),meta.bundle.sha256);
    bundle = JSON.parse(raw);
    assert.equal(bundle.docId,id);
  }
  const folder = local ? reception : legalLab;
  const registry = readJSON(resolve(folder,local ? localCatalog.readerCatalog.path : 'data/reader/catalog.json'));
  const pinned = registry.documents.find(row => row.id === id);
  function readAsset(pin) {
    if (bundle) {
      assert.equal(bundle.files[pin.file]?.sha256,pin.sha256);
      return bundle.files[pin.file].value;
    }
    const bytes = readFileSync(resolve(folder,pin.file));
    const raw = pin.file.endsWith('.gz') ? gunzipSync(bytes) : bytes;
    assert.equal(sha(raw),pin.sha256);
    return JSON.parse(raw);
  }
  const descriptor = unpackDescriptor(readAsset(pinned.locales.ru));
  const sections = new Map(descriptor.sections.map(section => [section.id,section]));
  const units = descriptor.blocks.flatMap(pin => readAsset(pin).units);
  const rows = Object.fromEntries([...parts].sort().map(part => [part,[]]));
  const labels = inlineArticleDocuments.has(id) || clauseDocuments.has(id) ? [] : null;
  let current;
  let previousSection;
  for (const unit of units) {
    const text = quoteText(unit.text),section = sections.get(unit.sectionId);
    const nextSection = unit.sectionId !== previousSection;
    const matchesArticle = article(text);
    const previous = current;
    if (clauseDocuments.has(id)) {
      if (nextSection) current = null;
      if (specialClauseSections[id].has(unit.sectionId)) current = clause(text) || current;
    } else if (matchesArticle || nextSection) {
      current = matchesArticle || article(section.title) || null;
    }
    if (labels && current !== previous) {
      const position = Number(unit.id.match(/-u(\d+)$/)[1]);
      labels.push([position,current]);
    }
    previousSection = unit.sectionId;
    if (current && rows[current] && text && !matchesArticle) rows[current].push([unit.id,text]);
  }
  for (const [part,rowsInPart] of Object.entries(rows)) {
    assert.ok(rowsInPart.some(([,text]) => text.length >= 24), `${id}, provision ${part} absent from the full text`);
  }
  index[id] = rows;
  if (labels) locatorStarts[id] = {kind:clauseDocuments.has(id)?'п.':'ст.',starts:labels};
}
const locatorModule = Object.entries(locatorStarts).map(([id, spec]) =>
  `  ${JSON.stringify(id)}:${JSON.stringify(spec)},`).join('\n');
writeFileSync(resolve(reception,'js/source-locators.js'),
  `// Generated from the pinned full texts by build-reception-normative-provisions.mjs.\nexport const SOURCE_LOCATORS = {\n${locatorModule}\n};\n`);
writeFileSync(resolve(root,'firebase/functions/reception-ai/normative-provisions.json'),JSON.stringify(index)+'\n');
for (const row of cases) {
  const works = Object.entries(acceptableLegalProvisions(row)).some(([docId,parts]) => parts.some(part => {
    const allowed = applicableLegalUnits(row,docId);
    return index[docId][part].some(([unitId,text]) => (!allowed || allowed.includes(unitId)) &&
      hasApplicableLegalCitation(row,{docId,unitIds:[unitId],text}));
  }));
  assert.ok(works,`No accepted legal citation for ${row.id}`);
}
console.log(`Verified ${cases.length} case versions against ${required.size} full texts.`);
