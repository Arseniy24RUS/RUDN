/** Server-only verification of citations against the same pinned corpus as the reader. */
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {ReceptionError} from './schema.mjs';

const root = new URL('./correspondence-corpus/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', root), 'utf8'));
const inventory = new Map(index.documents.map(row => [row.id, row]));
const cache = new Map();
const normalize = value => value.normalize('NFC').replace(/\s+/gu, ' ').trim();
const invalid = () => { throw new ReceptionError('invalid_citation', 400); };
const articleHeading = /^(?:[А-ЯЁ. ]+ )?Статья (\d+(?:\.\d+)*)\./u;
function withProvisionLabels(units) {
  let article='';
  return new Map(units.map((unit,index)=>{
    const heading=unit.text.match(articleHeading)?.[1];
    if(heading)article=`Статья ${heading}`;
    if(/^(?:Глава|Раздел|Подраздел) [IVXLCDM\d]/iu.test(unit.text))article='';
    const provisionLabel=unit.locator&&unit.locator!=='Начало документа'?unit.locator:article;
    return [unit.id,{unit,index,provisionLabel}];
  }));
}

export function publicLegalCitationSources() {
  return index.documents.map(({id,kind,title,number,url,version,revisionLabel}) => ({id,kind,title,number,url,version,revisionLabel}));
}
async function getDocument(id, signal) {
  if (signal?.aborted) throw new ReceptionError('citation_source_unavailable', 503);
  if (cache.has(id)) return cache.get(id);
  const meta = inventory.get(id);
  if (!meta) return invalid();
  try {
    const bytes = gunzipSync(await readFile(new URL(meta.file, root), {signal}));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== meta.bytes || sha256 !== meta.sha256) throw Error('Corpus integrity mismatch');
    const doc = JSON.parse(bytes.toString('utf8'));
    if (doc.id !== id || doc.units.length !== meta.unitCount) throw Error('Corpus identity mismatch');
    const record = {...doc, contentSha256: sha256, byId:withProvisionLabels(doc.units)};
    if (cache.size >= 6) cache.delete(cache.keys().next().value);
    cache.set(id, record);
    return record;
  } catch {
    throw new ReceptionError('citation_source_unavailable', 503);
  }
}

export async function resolveLegalCitation({sourceId, unitIds, quote} = {}, {signal, requireProvision = false} = {}) {
  if (typeof sourceId !== 'string' || !inventory.has(sourceId) || !Array.isArray(unitIds) || !unitIds.length || unitIds.length > 40
    || new Set(unitIds).size !== unitIds.length || unitIds.some(id => typeof id !== 'string' || id.length > 180)
    || typeof quote !== 'string' || !quote.trim() || quote.length > 4000) return invalid();
  const source = await getDocument(sourceId, signal);
  const selected = unitIds.map(id => source.byId.get(id));
  if (selected.some(item => !item)) return invalid();
  const labels=selected.map(item=>requireProvision?item.provisionLabel:item.unit.locator);
  if(requireProvision&&labels.some(label=>!label))return invalid();
  // Contiguous, ordered paragraphs prevent the citation from silently joining contradictory provisions.
  if (selected.some((item, position) => position && item.index !== selected[position - 1].index + 1)) return invalid();
  const text = selected.map(item => item.unit.text).join('\n');
  const normalizedText = normalize(text), normalizedQuote = normalize(quote);
  if(requireProvision&&(normalizedQuote.length<24||selected.every(({unit})=>articleHeading.test(unit.text))))return invalid();
  const firstEnd = normalize(selected[0].unit.text).length;
  const lastStart = normalizedText.length-normalize(selected.at(-1).unit.text).length;
  const start = selected.length===1 ? normalizedText.indexOf(normalizedQuote)
    : normalizedText.indexOf(normalizedQuote,Math.max(0,lastStart-normalizedQuote.length+1));
  if (start<0 || selected.length>1 && (start>=firstEnd || start+normalizedQuote.length<=lastStart)) return invalid();
  const locators = [...new Set(labels.filter(Boolean))];
  return {sourceId, kind: 'legal', title: source.title, url: source.url,
    locator: locators.join(' — '), unitIds: [...unitIds], quote: quote.trim(), text,
    contentSha256: source.contentSha256, version: source.version};
}
