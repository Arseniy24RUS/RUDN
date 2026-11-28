import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const app = new URL('../site/apps/governor/', import.meta.url);
const context = vm.createContext({GovernorGame:{}});
const modules = [
  'v4-catalog','v3-event-bank','v3-event-art','v4-major-events','v4-event-media',
  'v4-decision-media','v4-facility-media','v4-terrain-media',
];
for (const name of modules) {
  const filename = 'src/' + name + '.js';
  vm.runInContext(await readFile(new URL(filename, app), 'utf8'), context, {filename});
}
const G = context.GovernorGame;
const measures = G.V4Catalog.phases.flat();
const eventBank = Object.values(G).find(item => Array.isArray(item?.cards));

async function originalFile(path) {
  assert.match(path, /^assets\/[\w/-]+\.(?:webp|gif)$/);
  return readFile(new URL(path, app));
}

async function still(path) {
  const bytes = await originalFile(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', path);
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', path);
}

async function nativeLoop(path) {
  const bytes = await originalFile(path);
  assert.match(bytes.toString('ascii', 0, 6), /^GIF8[79]a$/, path);
  assert.ok(bytes.readUInt16LE(6) >= 200 && bytes.readUInt16LE(8) >= 150, path);
  assert.ok(bytes.includes('NETSCAPE2.0'), path);
  const palette = flags => flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0;
  let offset = 13 + palette(bytes[10]), frames = 0;
  const blocks = () => {
    while (offset < bytes.length && bytes[offset]) offset += bytes[offset] + 1;
    offset++;
  };
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      offset++;
      blocks();
    } else {
      assert.equal(marker, 0x2c, path);
      offset += 10 + palette(bytes[offset + 8]);
      blocks();
      frames++;
    }
  }
  assert.ok(frames >= 4, `Expected multiple GIF frames in ${path}, got ${frames}`);
}

test('all 89 selectable decisions have a concrete loadable scene', async () => {
  assert.equal(measures.length, 89);
  assert.equal(G.V4DecisionMedia.get('constructor'), null);
  const images = new Set(measures.map(row => G.V4DecisionMedia.get(row.id)));
  assert.ok(images.size >= 40);
  const thumbnails = new Set(measures.map(row => G.V4DecisionMedia.thumbnail(row.id)));
  assert.equal(thumbnails.size, images.size);
  await Promise.all([...images,...thumbnails].map(still));
});

test('all 18 placeable facilities show their delivery stages and a distinct opened object', async () => {
  const projects = measures.filter(row => row.kind === 'capital');
  assert.equal(projects.length, 18);
  const opened = projects.map(row => G.V4FacilityMedia.get(row.id, 'open').building);
  assert.equal(new Set(opened).size, projects.length);
  await Promise.all(opened.map(still));
  for (const {id} of projects) {
    const art = ['foundation','frame','finishing'].map(stage => G.V4FacilityMedia.get(id, stage));
    assert.equal(new Set(art.map(asset => asset.building)).size, 3, id);
    assert.equal(new Set(art.map(asset => asset.loop.src)).size, 3, id);
    await Promise.all(art.flatMap(asset => [still(asset.building), nativeLoop(asset.loop.src)]));
    await nativeLoop(G.V4FacilityMedia.get(id, 'open').loop.src);
    assert.equal(G.V4FacilityMedia.get(id, 'closed').building, G.V4FacilityMedia.get(id, 'open').building);
    assert.equal(G.V4FacilityMedia.get(id, 'closed').loop, null);
  }
});

test('all situations display narrative art before the player chooses a response', async () => {
  assert.equal(eventBank.cards.length, 100);
  assert.equal(G.V4MajorEvents.cards.length,4);
  const images = new Set();
  const motion = new Set();
  for (const event of [...eventBank.cards,...G.V4MajorEvents.cards]) {
    const art = G.V4EventMedia.get(event);
    assert.ok(art?.poster && !art.emblem, event.id);
    images.add(art.poster);
    if (art.small) images.add(art.small);
    const clip=art.gif||(art.motion==='river'?'assets/v4/motion/river-flow.gif':
      art.poster.endsWith('/school-street.webp')?'assets/v4/motion/school-breeze.gif':null);
    assert.ok(clip,event.id);
    motion.add(clip);
  }
  await Promise.all([...images].map(still));
  await Promise.all([...motion].map(nativeLoop));
});

test('each map has its own registered native animation and the world bounds are valid', async () => {
  const scenes = ['region','suburb','north','river','industrial','capital'];
  const layers = scenes.flatMap(id => {
    const found = G.V4TerrainMedia.layers(id);
    assert.ok(found.length, id);
    return found;
  });
  assert.equal(new Set(layers.map(row => row.src)).size, layers.length);
  for (const layer of layers) {
    for (const axis of ['offsetX', 'offsetY']) assert.ok(layer[axis] >= 0 && layer[axis] <= 1);
    for (const axis of ['width', 'height']) assert.ok(layer[axis] > 0 && layer[axis] <= 1);
    assert.ok(layer.offsetX + layer.width <= 1.00001 && layer.offsetY + layer.height <= 1.00001);
    await nativeLoop(layer.src);
  }
});
