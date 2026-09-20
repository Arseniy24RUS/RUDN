// Execute the real snap/advance/finalize functions with drawing and storage spies.
// Browser suites additionally exercise trusted input and the visible final dialog.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {parse} from 'acorn';

const source = await readFile(new URL('../site/assets/js/puzzle-engine.js', import.meta.url), 'utf8');
const required = new Map(['attemptSnap', 'setCurrentPiece', 'completeGame'].map(name => [name, []]));
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && required.has(node.id.name)) required.get(node.id.name).push(source.slice(node.start, node.end));
  for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === 'object') visit(child);
}
visit(parse(source, {ecmaVersion: 'latest'}));
for (const [name, matches] of required) assert.equal(matches.length, 1, `One actual ${name} function must be tested`);

function game({locked = [false, false], dx = 0} = {}) {
  const events = [];
  const state = {current: 0, placed: locked.filter(Boolean).length, cursor: 0, order: locked.map((_, i) => i),
    pieces: locked.map((value, index) => ({index, locked: value, inTray: false, dx: index ? 0 : dx, dy: 0})),
    features: locked.map((_, i) => ({properties: {_puzzleId: String(i)}})), view: {k: 2}, difficulty: 'medium',
    hints: 0, hintUntil: 999, finished: false, elapsedBeforeStart: 1234, attemptId: 'stable-attempt'};
  const record = type => events.push({type, current: state.current, placed: state.placed, finished: state.finished});
  const context = vm.createContext({state, DIFFICULTY: {medium: {snap: 10}}, hintTimer: 1, clearTimeout() {},
    currentPiece: () => state.pieces[state.current], updateUi: () => record('ui'),
    drawAll: dirty => { record('draw'); events.at(-1).dirty = !!dirty; },
    placePieceInTray: index => { state.pieces[index].inTray = true; },
    writable: () => true, pauseTimer: () => record('pause'), localResult: () => ({total: state.features.length, durationMs: 1234}),
    root: {dataset: {activitySlug: 'maps-freeplay'}}, csrf: 'isolated', locale: 'ru', disposed: false,
    checkpoint: () => { record('checkpoint'); return new Promise(() => {}); },
  });
  vm.runInContext([...required.values()].map(matches => matches[0]).join('\n'), context);
  return {state, events, snap: () => context.attemptSnap()};
}

test('successful placement renders the next unlocked piece once with the updated background', () => {
  const {state, events, snap} = game({locked: [false, true, false]});
  snap();
  assert.equal(state.current, 2);
  assert.equal(state.cursor, 2);
  assert.equal(state.placed, 2);
  assert.equal(state.pieces[0].locked, true);
  assert.equal(state.pieces[2].inTray, true);
  assert.equal(state.hintUntil, 0);
  assert.deepEqual(events, [
    {type: 'ui', current: 2, placed: 2, finished: false},
    {type: 'draw', current: 2, placed: 2, finished: false, dirty: true},
  ]);
});

test('last placement renders and checkpoints the final state once before async completion', () => {
  const {state, events, snap} = game({locked: [false]});
  snap();
  assert.equal(state.finished, true);
  assert.equal(state.current, -1);
  assert.equal(state.placed, 1);
  assert.equal(state.finishedResult.total, 1);
  assert.deepEqual(events.map(event => event.type), ['pause', 'ui', 'draw', 'checkpoint']);
  assert.equal(events.find(event => event.type === 'draw').dirty, true);
  assert.equal(events.find(event => event.type === 'checkpoint').finished, true);
});

test('a placement outside the unchanged tolerance leaves the current piece available', () => {
  const {state, events, snap} = game({dx: 5.1});
  snap();
  assert.equal(state.placed, 0);
  assert.equal(state.current, 0);
  assert.equal(state.pieces[0].locked, false);
  assert.equal('errors' in state, false);
  assert.deepEqual(events.map(event => event.type), ['ui', 'draw']);
  assert.equal(events[1].dirty, false);
});
