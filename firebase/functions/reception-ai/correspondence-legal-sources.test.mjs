import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolveLegalCitation, publicLegalCitationSources} from './correspondence-legal-sources.mjs';

const inventory = publicLegalCitationSources();
const sample = JSON.parse(gunzipSync(readFileSync(new URL('./correspondence-corpus/reception-law59999.json.gz', import.meta.url))).toString());
test('every pinned source accepts its own reader paragraph and returns immutable provenance', async () => {
  assert.equal(inventory.length, 33);
  for (const meta of inventory) {
    const doc = JSON.parse(gunzipSync(readFileSync(new URL(`./correspondence-corpus/${meta.id}.json.gz`, import.meta.url))).toString());
    const unit = doc.units.find(item => item.text.trim() && item.text.length <= 4000);
    const result = await resolveLegalCitation({sourceId: meta.id, unitIds: [unit.id], quote: unit.text});
    assert.equal(result.text, unit.text);
    assert.equal(result.url, meta.url);
    assert.match(result.contentSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.version, meta.version);
  }
});
test('invented quote, unknown source/paragraph, duplicate and noncontiguous units are rejected', async () => {
  const [a,b,c] = sample.units;
  const base = {sourceId: sample.id, unitIds: [a.id], quote: a.text};
  for (const change of [{quote: 'Несуществующая норма: срок 9999 лет'}, {sourceId: 'https://untrusted.test/law'},
    {unitIds: ['does-not-exist']}, {unitIds: [a.id,a.id]}, {unitIds: [a.id,c.id]}, {unitIds: [b.id,a.id]}, {quote: ''}]) {
    await assert.rejects(resolveLegalCitation({...base, ...change}), {code: 'invalid_citation', status: 400});
  }
});
test('whitespace from browser selection is normalized; legal words are not changed', async () => {
  const unit = sample.units.find(item => item.text.includes(' ') && item.text.length < 1000);
  const result = await resolveLegalCitation({sourceId: sample.id, unitIds: [unit.id], quote: unit.text.replace(/ /g, '\n')});
  assert.equal(result.text, unit.text);
  await assert.rejects(resolveLegalCitation({sourceId: sample.id, unitIds: [unit.id], quote: unit.text.replace(/ /, ' ИЗМЕНЕНО ')}), {code: 'invalid_citation'});
});

test('a multi-paragraph citation must include material from both selected boundaries', async () => {
  const [a,b]=sample.units;
  const selection={sourceId:sample.id,unitIds:[a.id,b.id]};
  const quote=`${a.text.slice(-20)}\n${b.text.slice(0,20)}`;
  assert.equal((await resolveLegalCitation({...selection,quote})).quote,quote.trim());
  await assert.rejects(resolveLegalCitation({...selection,quote:a.text}),{code:'invalid_citation'});
  await assert.rejects(resolveLegalCitation({...selection,quote:b.text}),{code:'invalid_citation'});
});
