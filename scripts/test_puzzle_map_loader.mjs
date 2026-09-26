import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRussiaMap, validateRussiaTopology} from '../site/assets/js/puzzle-map-loader.js';

// Keep the loader tests independent from the large production map. All 89
// features have a closed ring, stable identity and valid shared arc references.
const fixture = () => ({
  type: 'Topology',
  objects: {regions: {type: 'GeometryCollection', geometries: Array.from({length: 89}, (_, index) => ({
    type: 'Polygon', id: `region-${index + 1}`, properties: {name: `Region ${index + 1}`}, arcs: [[0]],
  }))}},
  arcs: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
});
const primaryUrl = 'https://example.test/RUDN/assets/puzzle/data/russia_subjects_89.topojson';
const fallbackUrl = 'https://example.test/RUDN/assets/puzzle/data/russia_subjects_89.compact.json';
const defaults = {primaryUrl, fallbackUrl, primaryTimeoutMs: 1000, fallbackTimeoutMs: 1000};
const jsonResponse = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});
const deferred = () => { let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve}; };

function sequenceFetch(steps) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url, options});
    const step = steps[calls.length - 1];
    assert.ok(step, `Unexpected download ${url}`);
    return step(url, options);
  };
  return {fetchImpl, calls};
}

// A normal download must not fetch or prefetch the compact map.
test('primary success keeps the original geometry and never requests fallback', async () => {
  const geometry = fixture();
  const {fetchImpl, calls} = sequenceFetch([() => jsonResponse(geometry)]);
  const result = await loadRussiaMap({...defaults, fetchImpl, options: {credentials: 'same-origin', cache: 'no-cache'}});
  assert.equal(result.source, 'primary');
  assert.deepEqual(result.geometry, geometry);
  assert.deepEqual(calls.map(call => call.url), [primaryUrl]);
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.cache, 'no-cache');
  assert.equal(calls[0].options.signal.aborted, false);
});

for (const [label, primary] of [
  ['network failure', () => {throw new TypeError('Failed to fetch');}],
  ['HTTP error', () => new Response('Service unavailable', {status: 503})],
  ['HTML block page with HTTP 200', () => new Response('<html>Access denied by proxy</html>', {headers: {'content-type': 'text/html'}})],
  ['malformed JSON', () => new Response('{"type":"Topology",')],
  ['valid JSON with a wrong map', () => jsonResponse({...fixture(), objects: {regions: {type: 'GeometryCollection', geometries: []}}})],
]) {
  test(`${label} automatically uses the compact fallback`, async () => {
    const geometry = fixture();
    const {fetchImpl, calls} = sequenceFetch([primary, () => jsonResponse(geometry)]);
    const result = await loadRussiaMap({...defaults, fetchImpl});
    assert.equal(result.source, 'fallback');
    assert.deepEqual(result.geometry, geometry);
    assert.deepEqual(calls.map(call => call.url), [primaryUrl, fallbackUrl]);
  });
}

test('deadline includes stalled body even after successful headers; fallback is used', async () => {
  const {fetchImpl, calls} = sequenceFetch([
    () => ({ok: true, json: () => new Promise(() => {})}),
    () => jsonResponse(fixture()),
  ]);
  const result = await loadRussiaMap({...defaults, fetchImpl, primaryTimeoutMs: 15});
  assert.equal(result.source, 'fallback');
  assert.equal(calls[0].options.signal.aborted, true, 'A timed-out primary must be aborted');
  assert.deepEqual(calls.map(call => call.url), [primaryUrl, fallbackUrl]);
});

test('deadline also handles a fetch implementation that never returns headers or observes abort', async () => {
  const {fetchImpl, calls} = sequenceFetch([
    () => new Promise(() => {}),
    () => jsonResponse(fixture()),
  ]);
  const result = await loadRussiaMap({...defaults, fetchImpl, primaryTimeoutMs: 15});
  assert.equal(result.source, 'fallback');
  assert.equal(calls[0].options.signal.aborted, true);
});

test('user cancellation during the primary rejects without starting fallback', async () => {
  const controller = new AbortController();
  const started = deferred();
  const {fetchImpl, calls} = sequenceFetch([() => {started.resolve(); return new Promise(() => {});}]);
  const pending = loadRussiaMap({...defaults, fetchImpl, options: {signal: controller.signal}});
  const rejection = assert.rejects(pending, {name: 'AbortError'});
  await started.promise;
  controller.abort();
  await rejection;
  assert.deepEqual(calls.map(call => call.url), [primaryUrl]);
  assert.equal(calls[0].options.signal.aborted, true);
});

test('an already cancelled request starts no downloads', async () => {
  const controller = new AbortController();
  controller.abort();
  const {fetchImpl, calls} = sequenceFetch([]);
  await assert.rejects(loadRussiaMap({...defaults, fetchImpl, options: {signal: controller.signal}}), {name: 'AbortError'});
  assert.equal(calls.length, 0);
});

test('user cancellation while fallback body is loading aborts fallback and rejects', async () => {
  const controller = new AbortController();
  const fallbackStarted = deferred();
  const {fetchImpl, calls} = sequenceFetch([
    () => {throw new TypeError('Blocked primary');},
    () => ({ok: true, json: () => {fallbackStarted.resolve(); return new Promise(() => {});}}),
  ]);
  const pending = loadRussiaMap({...defaults, fetchImpl, options: {signal: controller.signal}});
  const rejection = assert.rejects(pending, {name: 'AbortError'});
  await fallbackStarted.promise;
  controller.abort();
  await rejection;
  assert.deepEqual(calls.map(call => call.url), [primaryUrl, fallbackUrl]);
  assert.equal(calls[1].options.signal.aborted, true);
});

test('both failed downloads reject instead of accepting a missing or malformed map', async () => {
  const {fetchImpl, calls} = sequenceFetch([
    () => new Response('', {status: 503}),
    () => jsonResponse({type: 'FeatureCollection', features: []}),
  ]);
  await assert.rejects(loadRussiaMap({...defaults, fetchImpl}), /map\/invalid-russia-topology/);
  assert.deepEqual(calls.map(call => call.url), [primaryUrl, fallbackUrl]);
});

test('a stalled fallback also has a deadline', async () => {
  const {fetchImpl, calls} = sequenceFetch([
    () => {throw new TypeError('Blocked primary');},
    () => ({ok: true, json: () => new Promise(() => {})}),
  ]);
  await assert.rejects(loadRussiaMap({...defaults, fetchImpl, fallbackTimeoutMs: 15}), /map\/download-timeout/);
  assert.equal(calls[1].options.signal.aborted, true);
});

test('validation accepts original and delta-encoded compact TopoJSON without mutation', () => {
  const original = fixture();
  const compact = {...fixture(), transform: {scale: [0.1, 0.1], translate: [0, 0]}, arcs: [[[0, 0], [10, 0], [0, 10], [-10, 0], [0, -10]]]};
  for (const geometry of [original, compact]) {
    const before = JSON.stringify(geometry);
    assert.equal(validateRussiaTopology(geometry), geometry);
    assert.equal(JSON.stringify(geometry), before);
  }
});
