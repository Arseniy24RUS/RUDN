// Deterministic slow-worker responses using the actual engine functions.
// Transferable buffers really detach, so terminating a job loses its commands.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'acorn';
import vm from 'node:vm';
import {test} from 'node:test';

const source = await readFile(process.env.PUZZLE_ENGINE_SOURCE || new URL('../site/assets/js/puzzle-engine.js', import.meta.url), 'utf8');
const names = ['rasterPreparationStats', 'stopRasterWorker', 'removePreparedRaster', 'resetRasterPreparation',
  'startRasterWorker', 'rasterVariant', 'scheduleRasterPreparation', 'rasterCandidates', 'prepareRasterCandidates'];
const functions = new Map();
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && names.includes(node.id.name)) functions.set(node.id.name, source.slice(node.start, node.end));
  for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === 'object') visit(child);
}
visit(parse(source, {ecmaVersion: 'latest'}));
for (const name of names.filter(name => name !== 'rasterCandidates')) assert.ok(functions.has(name), name);

function fixture() {
  let now = 0, sequence = 0, serializations = 0;
  const timers = new Map(), workers = [], jobs = [];
  const state = {ready: true, current: 0, cursor: 0, order: [0], pieces: [{index: 0, inTray: true, locked: false}],
    features: [{}], bounds: [{x0: 0, y0: 0, x1: 100, y1: 100, width: 100, height: 100}],
    view: {k: 1}, dpr: 1, projection: {}, attemptId: 'same-attempt', mode: 'country-regions', selection: 'CAN'};
  const preparation = {worker: null, status: 'idle', projection: null, timer: 0, timeout: 0, generation: 0,
    sequence: 0, pending: null, cache: new Map(), commands: new Map(), failed: new Set(), vertexCounts: new WeakMap(),
    planKey: null, preparations: [], lastScale: null, notBefore: 0, hits: 0, fallbacks: 0, peakReservedRasterBytes: 0, peakCommandBytes: 0};
  const commandBytes = 6 * 1024 * 1024;
  preparation.vertexCounts.set(state.features[0], {commandEstimate: commandBytes});
  class Worker {
    constructor() { this.terminated = false; workers.push(this); }
    terminate() { this.terminated = true; }
    postMessage(data, transfer) { jobs.push({worker: this, data: structuredClone(data, {transfer})}); }
  }
  const context = vm.createContext({state, rasterPreparation: preparation, disposed: false, Worker,
    rasterWorkerUrl: 'isolated-worker', ACTIVE_RASTER_BUDGET: 16 * 1024 * 1024, COMMAND_BUDGET: 8 * 1024 * 1024,
    activeSprite: {canvas: {width: 64, height: 64}}, performance: {now: () => now},
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, {fn, at: now + delay}); return id; },
    clearTimeout: id => timers.delete(id), currentPiece: () => state.pieces[state.current], complexFeature: () => true,
    trayRect: () => ({width: 58, height: 80}), window: {RudnPuzzleGeometry: {CommandPath: class {}}},
    buildFeatureGeometry: () => { serializations++; return {path: {commands: () => new Float64Array(commandBytes / 16)},
      strokePath: {commands: () => new Float64Array(commandBytes / 16)}}; },
  });
  vm.runInContext([...functions.values()].join('\n'), context);
  const advance = ms => {
    now += ms;
    for (let guard = 0; guard < 30; guard++) {
      const due = [...timers].find(([, task]) => task.at <= now);
      if (!due) return;
      timers.delete(due[0]); due[1].fn();
    }
    throw new Error('Unexpected scheduling loop');
  };
  const deliver = (job, type = 'ready') => {
    const results = job.data.variants.map(variant => ({scale: variant.scale, bitmap: {closed: false, close() { this.closed = true; }}}));
    job.worker.onmessage({data: {...job.data, type, results, buildMs: 1, rasterMs: 500, workerMs: 501}});
    return results;
  };
  context.scheduleRasterPreparation(); advance(0);
  workers[0].onmessage({data: {type: 'capability', supported: true}}); advance(0);
  assert.equal(jobs.length, 1);
  return {state, preparation, context, workers, jobs, advance, deliver, serializations: () => serializations};
}

test('slow obsolete scale returns its commands once, closes old bitmap and reuses the current tray raster', () => {
  const f = fixture(), first = f.jobs[0];
  for (const scale of [2, 3, 4]) {
    f.state.view.k = scale; f.context.scheduleRasterPreparation(); f.advance(250);
    assert.equal(f.workers.length, 1, 'Scale-only changes must keep the worker');
    assert.equal(f.workers[0].terminated, false, 'In-flight transferred commands must return');
    assert.equal(f.jobs.length, 1, 'Only one job may be in flight');
  }
  const obsolete = f.deliver(first);
  assert.equal(obsolete.find(item => item.scale === 1).bitmap.closed, true);
  assert.equal(obsolete.find(item => item.scale === .3).bitmap.closed, false);
  f.advance(0);
  assert.equal(f.jobs.length, 2);
  assert.deepEqual(f.jobs[1].data.variants.map(item => item.scale), [4]);
  assert.equal(f.serializations(), 1, 'Slow wheel frames must not reserialize immutable geometry');
  assert.equal(f.preparation.pending.reusedCommands, true);
  f.deliver(f.jobs[1]); f.advance(0);
  assert.deepEqual([...f.preparation.cache.values()].map(item => item.scale).sort(), [.3, 4]);
  const stats = f.context.rasterPreparationStats();
  assert.equal(stats.pendingJobs, 0);
  assert.ok(stats.peakCommandBytes <= 8 * 1024 * 1024);
  assert.ok(stats.peakReservedRasterBytes <= 16 * 1024 * 1024);
  assert.equal(f.state.attemptId, 'same-attempt');
  assert.equal(f.state.pieces[0].locked, false);
});

test('map/projection reset still terminates the job and closes every late bitmap', () => {
  const f = fixture(), old = f.jobs[0];
  f.context.resetRasterPreparation();
  f.state.attemptId = 'different-map'; f.state.projection = {};
  const late = f.deliver(old);
  assert.equal(f.workers[0].terminated, true);
  assert.ok(late.every(item => item.bitmap.closed));
  assert.equal(f.preparation.cache.size, 0);
  assert.equal(f.preparation.commands.size, 0);
  assert.equal(f.preparation.pending, null);
});

test('completion drops a late job without retaining its commands or bitmaps', () => {
  const f = fixture();
  f.state.pieces[0].locked = true; f.state.current = -1;
  const late = f.deliver(f.jobs[0]); f.advance(0);
  assert.ok(late.every(item => item.bitmap.closed));
  assert.equal(f.preparation.cache.size, 0);
  assert.equal(f.preparation.commands.size, 0);
  assert.equal(f.jobs.length, 1);
});

test('a stuck worker still reaches the safety timeout', () => {
  const f = fixture();
  f.advance(15000);
  assert.equal(f.workers[0].terminated, true);
  assert.equal(f.preparation.status, 'failed');
  assert.equal(f.preparation.pending, null);
});
