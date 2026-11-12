import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync, gzipSync} from 'node:zlib';
import {readGzipJson} from '../site/apps/settlements/runtime/assets/js/settlements/v2/gzip-json.mjs';
import {gunzipSync as fallback} from '../site/apps/settlements/runtime/assets/js/settlements/v2/gzip-fallback.mjs';
import {readSettlementsResource} from '../site/apps/settlements/runtime/assets/js/settlements/v2/network.mjs';
import {fetchSocialPlan} from '../site/apps/settlements/runtime/assets/js/settlements/v24/social-plan-fetch.mjs';

const root = new URL('../site/apps/settlements/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('source-manifest.json', root)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('all 492 packed inputs expand to their recorded source bytes with both decoders', async () => {
  const {packedSources} = manifest;
  assert.equal(packedSources.length, 492);
  assert.equal(new Set(packedSources.map(entry => entry.path)).size, 492);
  assert.equal(new Set(packedSources.map(entry => entry.packedPath)).size, 492);
  for (const entry of packedSources) {
    const raw = new URL('runtime/' + entry.path, root);
    await assert.rejects(stat(raw), {code: 'ENOENT'});
    const packed = await readFile(new URL('runtime/' + entry.packedPath, root));
    const expanded = gunzipSync(packed);
    assert.equal(expanded.length, entry.expandedBytes, entry.path);
    assert.equal(sha(expanded), entry.expandedSha256, entry.path);
    if (!entry.path.endsWith('.mjs')) assert.equal(entry.expandedSha256, entry.sha256, entry.path);
    assert.ok(expanded.equals(fallback(packed)), entry.path);
  }
});

test('gzip JSON decodes via native and local fallback, and handles HTTP-decoded bodies', async () => {
  const value = {message: 'Территория 区域', rows: [{population: 2100}]};
  const json = JSON.stringify(value);
  const gzip = gzipSync(json);
  class UnsupportedGzip { constructor() { throw new TypeError('gzip unsupported'); } }
  for (const decoder of [DecompressionStream, null, UnsupportedGzip]) {
    assert.deepEqual(await readGzipJson(new Response(gzip), decoder), value);
    assert.deepEqual(await readGzipJson(new Response(json), decoder), value);
  }
});

test('a failed packed request retries on the reserve and an aborted one stops', async () => {
  const runtimeRoot = new URL('https://site.test/apps/settlements/runtime/');
  const gatewayRoot = new URL('https://gateway.test/settlements/runtime/');
  const path = 'data/settlements/v1/regions/a.json.gz';
  const url = new URL(path, runtimeRoot);
  const calls = [];
  const value = await readSettlementsResource(url, {
    runtimeRoot,
    gatewayRoot,
    read: response => readGzipJson(response, null),
    async fetchImpl(target) {
      calls.push(String(target));
      if (calls.length === 1) return new Response('', {status: 503});
      return new Response(gzipSync('{"region":"a"}'));
    },
  });
  assert.deepEqual(value, {region: 'a'});
  assert.deepEqual(calls, [url.href, new URL(path, gatewayRoot).href]);

  const controller = new AbortController();
  const pending = readSettlementsResource(url, {
    runtimeRoot,
    gatewayRoot,
    signal: controller.signal,
    read: readGzipJson,
    fetchImpl(target) { calls.push(String(target)); return new Promise(() => {}); },
  });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.deepEqual(calls.slice(2), [url.href]);
});

test('the authored social plan supports local replay and a retry key for browser fetch', async () => {
  const entry = manifest.packedSources.find(row => row.path.endsWith('-easy.mjs'));
  const file = new URL('runtime/' + entry.packedPath, root);
  const local = await fetchSocialPlan(file);
  assert.equal(local.difficulty, 'easy');
  const url = new URL('https://site.test/' + entry.packedPath + '?retry=1');
  const bytes = await readFile(file);
  const remote = await fetchSocialPlan(url, {
    Decompressor: null,
    fetchImpl(target) { assert.equal(String(target), url.href); return new Response(bytes); },
  });
  assert.deepEqual(remote, local);
});
