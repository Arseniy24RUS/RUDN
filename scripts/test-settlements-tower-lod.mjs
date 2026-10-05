/** Canvas detail regressions; no engine/source geography or saved game changes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTowerSymbols, towerSymbolSpacing, TowerSymbolCache, initialCoveragePath} from '../site/apps/settlements/runtime/assets/js/settlements/v24/tower-lod.mjs';
import {GameMap, TowerGeometryCache} from '../site/apps/settlements/runtime/assets/js/settlements/v24/map.mjs';

const seed = (id, x, y) => ({id: `initial-tower:${id}`, settlementId: id, center: {x, y}});
const dense = Array.from({length: 1000}, (_, i) => seed(String(i).padStart(4, '0'), i % 40 * 10 - 200, Math.floor(i / 40) * 10 - 100));
const idsSorted = ids => [...ids].sort();
const symbolPoint = (tower, scale, size, centered) => ({x: tower.center.x * scale, y: tower.center.y * scale - (centered.has(tower.id) ? 0 : size * 13 / 32)});

test('1000 initial towers retain geography while their visible footprints never overlap at overview or detail', () => {
  const before = structuredClone(dense);
  for (const scale of [.25, 1, 5, 10]) {
    const size = scale < 5 ? 24 : 48, centeredIds = new Set(dense.map(tower => tower.id));
    const ids = selectTowerSymbols(dense, scale, size, {centeredIds});
    assert(ids.size > 0 && ids.size <= dense.length);
    if (scale === .25) assert(ids.size < 30, 'overview does not retain hundreds of passive icons');
    const shown = dense.filter(tower => ids.has(tower.id));
    for (const [i, a] of shown.entries()) for (const b of shown.slice(i + 1)) {
      assert(Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) * scale >= towerSymbolSpacing(size));
    }
    assert.deepEqual(idsSorted(selectTowerSymbols(dense.toReversed(), scale, size, {centeredIds})), idsSorted(ids), 'permuting source data cannot reshuffle representatives');
  }
  assert.deepEqual(dense, before, 'display selection must not change original coordinates or towers');
});

test('selected, guided and player towers always survive crowding and exclude passive overlaps', () => {
  const towers = [seed('a', 0, 0), seed('selected', 2, 0), seed('guide', 3, 0), {id: 'player', center: {x: 4, y: 0}}, seed('far', 80, 0)];
  const ids = selectTowerSymbols(towers, 1, 24, {priorityIds: new Set(['selected', 'initial-tower:guide'])});
  assert.deepEqual(idsSorted(ids), ['initial-tower:far', 'initial-tower:guide', 'initial-tower:selected', 'player']);
});

test('adjacent grid cells, negative world positions and centered/foot-anchored icons share collision space', () => {
  const towers = [seed('a', -1, -1), seed('b', 1, 1), seed('c', 41, 1), seed('d', 40, 0), {id: 'player', center: {x: 20, y: 65}}];
  const centeredIds = new Set(towers.filter(tower => tower.settlementId).map(tower => tower.id));
  const ids = selectTowerSymbols(towers, 1, 24, {centeredIds});
  const shown = towers.filter(tower => ids.has(tower.id));
  assert.deepEqual(idsSorted(ids), ['initial-tower:a', 'initial-tower:c', 'player']);
  for (const [i, a] of shown.entries()) for (const b of shown.slice(i + 1)) {
    const p = symbolPoint(a, 1, 24, centeredIds), q = symbolPoint(b, 1, 24, centeredIds);
    assert(Math.hypot(p.x - q.x, p.y - q.y) >= towerSymbolSpacing(24));
  }
});

test('pan reuses world-anchored representatives; cache is bounded and selection changes invalidate it', () => {
  const cache = new TowerSymbolCache(), centeredIds = new Set(dense.map(tower => tower.id));
  const original = cache.select(dense, 1, 24, {centeredIds});
  const onScreen = ox => dense.filter(tower => original.has(tower.id) && tower.center.x >= ox && tower.center.x <= ox + 100).map(tower => tower.id);
  for (let pan = -100; pan <= 100; pan += 10) assert.equal(cache.select(dense, 1, 24, {centeredIds}), original);
  assert.equal(cache.computations, 1, 'panning does not repeat global sorting/collision selection');
  assert(onScreen(-100).filter(id => onScreen(-50).includes(id)).length > 0, 'overlapping viewports retain representatives in their common area');
  const hidden = dense.find(tower => !original.has(tower.id));
  assert(cache.select(dense, 1, 24, {centeredIds, priorityIds: new Set([hidden.settlementId])}).has(hidden.id));
  assert.equal(cache.computations, 2);
  cache.select([seed('other-region', 0, 0)], .5, 24);
  assert.equal(cache.evidence().sourceCount, 1, 'changing region drops old sources');
  cache.clear();
  assert.equal(cache.source, null); assert.equal(cache.ordered.length, 0); assert.equal(cache.ids.size, 0);
});

function withNativePaths(run) {
  const previousPath = globalThis.Path2D, previousMatrix = globalThis.DOMMatrix;
  class Path {
    constructor() { this.entries = []; }
    addPath(path, matrix) { this.entries.push({path, matrix}); }
    moveTo(x, y) { this.entries.push(['move', x, y]); }
    lineTo(x, y) { this.entries.push(['line', x, y]); }
    closePath() { this.entries.push(['close']); }
  }
  class Matrix { translate(x, y) { return {x, y}; } }
  globalThis.Path2D = Path; globalThis.DOMMatrix = Matrix;
  try { return run(); } finally { globalThis.Path2D = previousPath; globalThis.DOMMatrix = previousMatrix; }
}

test('coverage union keeps every exact source path and translation, without including player towers', () => withNativePaths(() => {
  const towers = [seed('a', 100, 200), seed('b', 130, 250), {id: 'player', center: {x: 999, y: 999}}].map(tower => ({...tower, path: {}, bounds: {left: tower.center.x - 5, right: tower.center.x + 5, top: tower.center.y - 6, bottom: tower.center.y + 6}}));
  const union = initialCoveragePath(towers);
  assert.deepEqual(union.center, {x: 100, y: 200});
  assert.deepEqual(union.bounds, {left: 95, right: 135, top: 194, bottom: 256});
  assert.deepEqual(union.path.entries.map(entry => entry.matrix), [{x: 0, y: 0}, {x: 30, y: 50}]);
  assert.equal(union.path.entries[0].path, towers[0].path); assert.equal(union.path.entries[1].path, towers[1].path);
  assert.equal(initialCoveragePath(towers.map(tower => ({...tower})), union), union, 'preview preserves native passive geometry');
  assert.notEqual(initialCoveragePath(towers.slice(0, 1), union), union);
  assert.equal(initialCoveragePath([], union), null);
}));

test('native path cache has one active region, one preview, and releases coverage on destroy/region changes', () => withNativePaths(() => {
  const cache = new TowerGeometryCache(), world = {}, tower = {id: 'initial-tower:one', settlementId: 'one', lat: 55, lon: 60, radiusKm: 10};
  cache.sync(world, [tower], false);
  const coverage = cache.coverage;
  cache.sync(world, [tower], false, {lat: 55.1, lon: 60.1, radiusKm: 10});
  assert.equal(cache.coverage, coverage); assert.equal(cache.entries.size, 1); assert(cache.preview);
  cache.sync({}, [], false);
  assert.equal(cache.coverage, null); assert.equal(cache.entries.size, 0); assert.equal(cache.preview, null);
  cache.clear(); assert.equal(cache.world, null);
}));

test('one coverage fill replaces all passive circle strokes, and wholly offscreen coverage does no painting', () => {
  const calls = [], context = Object.fromEntries(['save', 'restore', 'translate', 'scale', 'fill', 'stroke'].map(name => [name, (...args) => calls.push([name, ...args])]));
  const map = Object.create(GameMap.prototype);
  map.camera = {scale: 1, ox: 0, oy: 0, width: 100, height: 100, worldToScreen: point => point};
  map.towerCache = {coverage: {path: {}, center: {x: 0, y: 0}, bounds: {left: -10, top: -10, right: 50, bottom: 50}}};
  map.initialCoverageFills = 0;
  map.paintInitialCoverage(context);
  assert.equal(calls.filter(call => call[0] === 'fill').length, 1);
  assert.equal(calls.filter(call => call[0] === 'stroke').length, 0);
  assert.equal(calls.find(call => call[0] === 'fill')[2], 'nonzero');
  assert.equal(map.initialCoverageFills, 1);
  calls.length = 0; map.towerCache.coverage.bounds = {left: 1000, top: 1000, right: 1100, bottom: 1100};
  map.paintInitialCoverage(context);
  assert.equal(calls.length, 0);
});
