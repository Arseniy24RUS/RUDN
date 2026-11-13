#!/usr/bin/env node
/** Pin the very same RU paragraphs which the Reception source reader presents.
 * No network calls and no new interpretation of the legal sources. */
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gzipSync, gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reception = path.join(repo, 'site/apps/reception');
const shared = path.join(repo, 'site/apps/legal-lab/data');
const out = path.join(repo, 'firebase/functions/reception-ai/correspondence-corpus');
const check = process.argv.includes('--check');
const fetchMissing = process.argv.includes('--fetch');
const cacheRoot = path.join(repo, '.cache/reception-correspondence-sources');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
async function pinned(base, record, packet) {
  if (packet) {
    const entry = packet.files?.[record.file];
    // The containing packet has already been verified against the reader's SHA256.
    if (!entry || entry.sha256 !== record.sha256) throw Error('Unpinned packet entry: ' + record.file);
    return entry.value;
  }
  const file = path.resolve(base, record.file);
  if (!file.startsWith(base + path.sep)) throw Error('Source path escapes its corpus');
  const raw = gunzipSync(await readFile(file));
  if (raw.length !== record.bytes || digest(raw) !== record.sha256) throw Error('Source integrity mismatch: ' + record.file);
  return JSON.parse(raw.toString('utf8'));
}
async function sourcePacket(meta) {
  if (!meta.bundle) return null;
  const source = meta.bundle.url.match(/^https:\/\/raw\.githubusercontent\.com\/Arseniy24RUS\/RUDN\/([a-f0-9]{40})\/(source-data\/reception\/[A-Za-z0-9-]+\.json\.gz)$/);
  if (!source) throw Error('Untrusted source packet URL');
  const filename = path.join(cacheRoot, meta.id + '.json.gz');
  let raw;
  try { raw = await readFile(filename); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try {
      raw = execFileSync('git', ['show', source[1] + ':' + source[2]], {
        cwd: repo, maxBuffer: 32 * 1024 ** 2, stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      if (!fetchMissing) throw Error('Missing pinned source packet. Run with --fetch: ' + meta.id);
      const response = await fetch(meta.bundle.url, {signal: AbortSignal.timeout(30000)});
      if (!response.ok) throw Error('Unable to fetch pinned source packet: ' + meta.id);
      raw = Buffer.from(await response.arrayBuffer());
    }
  }
  const bytes = gunzipSync(raw);
  if (raw.length !== meta.bundle.bytes || digest(bytes) !== meta.bundle.sha256) throw Error('Packet integrity mismatch: ' + meta.id);
  const packet = JSON.parse(bytes.toString('utf8'));
  if (packet.docId !== meta.id) throw Error('Packet identity mismatch: ' + meta.id);
  if (fetchMissing) { await mkdir(cacheRoot, {recursive:true}); await writeFile(filename, raw); }
  return packet;
}
async function save(file, bytes, {gzip=false}={}) {
  if (check) {
    const existing = await readFile(file);
    // Gzip headers and compression can differ by host. The reader pins the decoded bytes.
    if (!(gzip ? gunzipSync(existing) : existing).equals(bytes)) throw Error('Regenerate corpus: ' + path.relative(repo, file));
  } else await writeFile(file, gzip ? gzipSync(bytes, {level: 9}) : bytes);
}

const localCatalog = await json(path.join(reception, 'content/legal-documents/catalog.json'));
const registry = await json(path.join(reception, 'content/legal-documents/registry.json'));
const sharedCatalog = await json(path.join(shared, 'catalog.json'));
const documents = [];
for (const meta of localCatalog.documents) {
  const entry = registry.documents.find(row => row.id === meta.id);
  if (!entry || entry.sourceSha256 !== meta.sha256 || entry.sourceFileSha256 !== meta.fileSha256) throw Error('Unpinned source: ' + meta.id);
  const packet = await sourcePacket(meta);
  const structure = await pinned(reception, entry.structure, packet);
  const manifest = await pinned(reception, entry.locales.ru, packet);
  if (structure.id !== meta.id || manifest.docId !== meta.id) throw Error('Source identity mismatch: ' + meta.id);
  const labels = new Map(structure.sections.map(section => Array.isArray(section)
    ? [section[0], structure.strings[section[1]]] : [section.id, section.title]));
  const units = [];
  for (const block of [...manifest.blocks].sort((a, b) => a.start - b.start)) {
    const data = await pinned(reception, block, packet);
    if (data.start !== units.length || data.docId !== meta.id || data.units.length !== block.count) throw Error('Broken source block: ' + block.file);
    units.push(...data.units.map(unit => ({id: unit.id, locator: labels.get(unit.sectionId) || '', text: unit.text})));
  }
  if (units.length !== entry.unitCount || units.length !== meta.unitCount) throw Error('Incomplete source: ' + meta.id);
  documents.push({meta, units});
}
// These are the shared sources explicitly allowed by Reception's source-reader.js.
for (const id of ['civil79', 'corruption273']) {
  const meta = sharedCatalog.documents.find(row => row.id === id);
  if (!meta) throw Error('Missing shared source: ' + id);
  const raw = await readFile(path.join(shared, meta.file));
  if (digest(raw) !== meta.fileSha256) throw Error('Shared source integrity mismatch: ' + id);
  const data = JSON.parse(raw.toString('utf8'));
  documents.push({meta, units: data.units.map(unit => ({id: unit.id, locator: unit.locator || '', text: unit.text}))});
}
if (!check) await mkdir(out, {recursive: true});
const index = {version: 'reception-correspondence-corpus-v1', readerContentVersion: localCatalog.contentVersion, documents: []};
for (const {meta, units} of documents.sort((a,b) => a.meta.id.localeCompare(b.meta.id, 'en'))) {
  if (new Set(units.map(unit => unit.id)).size !== units.length || units.some(unit => !unit.id || typeof unit.text !== 'string')) throw Error('Invalid paragraphs: ' + meta.id);
  const document = {id: meta.id, title: meta.title, number: meta.number, url: meta.sourceUrl, version: meta.version,
    revisionLabel: meta.revisionLabel, sourceSha256: meta.sha256, sourceFileSha256: meta.fileSha256, units};
  const bytes = Buffer.from(JSON.stringify(document));
  const filename = meta.id + '.json.gz';
  await save(path.join(out, filename), bytes, {gzip:true});
  index.documents.push({id: meta.id, kind: 'legal', title: meta.title, number: meta.number, url: meta.sourceUrl,
    version: meta.version, revisionLabel: meta.revisionLabel, file: filename, sha256: digest(bytes), bytes: bytes.length, unitCount: units.length});
}
await save(path.join(out, 'index.json'), Buffer.from(JSON.stringify(index, null, 2) + '\n'));
console.log(`${check ? 'Verified' : 'Built'} ${index.documents.length} pinned legal documents; ${index.documents.reduce((sum, row) => sum + row.unitCount, 0)} paragraphs.`);
