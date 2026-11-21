import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, mkdir, readFile, rm, writeFile, access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {buildRelease} from '../scripts/build-platform-release.mjs';
import {resolveAsset} from '../site/apps/governor/src/resource-url.js';

const siteSource = new URL('../site/', import.meta.url);
const governorSource = new URL('apps/governor/', siteSource);
const write = async (root, name, bytes) => {
  const filename = path.join(root, name);
  await mkdir(path.dirname(filename), {recursive: true});
  await writeFile(filename, bytes);
};
const logical = relative => 'apps/governor/' + relative;

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'governor-image-release-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const source = path.join(directory, 'site'), baseline = path.join(directory, 'baseline');
  const files = {
    'index.html': '<html><body><script type="module" src="assets/js/main.js"></script></body></html>',
    'service-worker.js': 'const PLATFORM_RELEASE=null;',
    'assets/js/main.js': 'export const fixture=true;',
    'assets/js/release-bootstrap.js': 'export const fixture=true;',
    'assets/js/diagnostics-bootstrap.js': 'globalThis.fixture=true;',
    'apps/governor/index.html': '<html><body><script type="module" src="src/resource-url.js"></script><script type="module" src="platform-bridge.js"></script></body></html>',
    'apps/governor/platform-bridge.js': 'globalThis.bridgeFixture=true;'
  };
  for (const name of ['assets/js/release-resources.js', 'assets/js/release-recovery.js', 'data/platform-contracts.json',
    'apps/career/assets/seminar-progress.mjs', logical('assets/icon-192.png'), logical('assets/rudn-logo.webp'),
    logical('src/resource-url.js'), logical('assets/advisors/mira.png'), logical('assets/illustrated/school.webp'),
    logical('assets/services/unavailable.svg'), logical('assets/illustrated/region.webp')]) {
    files[name] = await readFile(new URL(name, siteSource));
  }
  for (const [name, bytes] of Object.entries(files)) {
    await write(source, name, bytes);
    await write(baseline, name, bytes);
  }
  // A changed, still valid image must use the object URL, not the frozen path.
  const changedBytes = await readFile(new URL('assets/services/school-delivery.webp', governorSource));
  await write(source, logical('assets/illustrated/school.webp'), changedBytes);
  const built = await buildRelease({site: source, baseline, out: path.join(directory, 'published')});
  const manifest = JSON.parse(await readFile(path.join(built.out, '_releases', built.buildId, 'manifest.json'), 'utf8'));
  const siteRoot = 'https://example.test/RUDN/';
  const runtimeRoot = `${siteRoot}_releases/${built.buildId}/`;
  const previous = globalThis.__RUDN_RELEASE__;
  globalThis.__RUDN_RELEASE__ = {...manifest, siteRoot, runtimeRoot};
  t.after(() => { globalThis.__RUDN_RELEASE__ = previous; });
  const appBase = runtimeRoot + 'apps/governor/';
  return {built, manifest, siteRoot, appBase, changedBytes, resolve: input => resolveAsset(input, appBase)};
}

async function illustrations(resolve, {fail = false} = {}) {
  const requests = [], listeners = new Map();
  class Image {
    set src(value) { this.url = value; requests.push(value); queueMicrotask(() => fail ? this.onerror?.() : this.onload?.()); }
    get src() { return this.url; }
  }
  const sandbox = {console, Image, setTimeout, clearTimeout,
    document: {documentElement: {lang: 'zh'}, addEventListener: (name, fn) => listeners.set(name, fn)},
    GovernorGame: {resolveAsset: resolve}};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const name of ['asset-metadata', 'illustrated-assets']) {
    vm.runInContext(await readFile(new URL(`src/${name}.js`, governorSource), 'utf8'), sandbox, {filename: name + '.js'});
  }
  return {A: sandbox.GovernorGame.IllustratedAssets, requests, listeners};
}

test('Governor assets resolve against a real release manifest, including changed object bytes', async t => {
  const f = await fixture(t);
  assert.equal(f.built.status, 'pass');
  assert.ok(f.manifest.packs.shell.includes('apps/career/assets/seminar-progress.mjs'),
    'The offline platform shell includes its shared draft-policy dependency');
  const appAssets = Object.keys(f.manifest.resources).filter(name => name.startsWith(logical('assets/')));
  assert.equal(appAssets.length, 6);
  assert.deepEqual(f.manifest.packs.governor.filter(name => name.startsWith(logical('assets/'))).sort(), appAssets.sort());
  const unchanged = f.manifest.resources[logical('assets/advisors/mira.png')];
  const changed = f.manifest.resources[logical('assets/illustrated/school.webp')];
  assert.equal(unchanged.url, '/RUDN/apps/governor/assets/advisors/mira.png');
  assert.match(changed.url, /^\/RUDN\/_objects\/[a-f0-9]{64}\.webp$/);
  for (const relative of ['assets/advisors/mira.png', 'assets/illustrated/school.webp', 'assets/services/unavailable.svg', 'assets/illustrated/region.webp']) {
    const expected = new URL(f.manifest.resources[logical(relative)].url, f.siteRoot).href;
    assert.equal(f.resolve(relative), expected);
    assert.equal(f.resolve(new URL(relative, f.appBase)), expected);
    assert.equal(f.resolve(expected), expected, 'Resolved paths are safe to pass through twice');
    await access(path.join(f.built.out, new URL(expected).pathname.slice('/RUDN/'.length)));
    await assert.rejects(access(path.join(f.built.out, '_releases', f.built.buildId, 'apps/governor', relative)), {code: 'ENOENT'});
  }
  const published = await readFile(path.join(f.built.out, changed.url.slice('/RUDN/'.length)));
  assert.deepEqual(published, f.changedBytes);
  assert.equal(f.resolve('assets/illustrated/school.webp?variant=1#detail'), new URL(changed.url, f.siteRoot).href + '?variant=1#detail');
  assert.equal(f.resolve('https://images.example.test/picture.webp'), 'https://images.example.test/picture.webp');
});

test('cards, canvas preloads, cache lookups and unavailable artwork use the same release resolver', async t => {
  const f = await fixture(t), {A, requests, listeners} = await illustrations(f.resolve);
  const school = A.describe('school'), expected = f.resolve(school.src);
  assert.ok(A.tag(school).includes(`src="${expected}"`));
  const loaded = await A.preload(school.src);
  assert.equal(loaded.src, expected);
  assert.equal(A.peek(school.src), loaded);
  assert.equal(A.peek(expected), loaded);
  assert.equal(await A.preload(expected), loaded);
  assert.equal(requests.filter(url => url === expected).length, 1);
  const region = await A.prepare();
  assert.equal(region.src, f.resolve('assets/illustrated/region.webp'));
  const broken = {tagName: 'IMG', dataset: {artId: 'school'}, classList: {add() {}}, src: expected};
  listeners.get('error')({target: broken});
  assert.equal(broken.src, f.resolve('assets/services/unavailable.svg'));
  assert.equal(broken.alt, '插图暂不可用');
  const fallback = broken.src;
  listeners.get('error')({target: broken});
  assert.equal(broken.src, fallback, 'An unavailable fallback cannot recurse');
});

test('failed canvas artwork is cached by its resolved URL and stage notes render in all locales', async t => {
  const f = await fixture(t), {A, requests} = await illustrations(f.resolve, {fail: true});
  const source = 'assets/illustrated/school.webp';
  assert.equal(await A.preload(source), null);
  assert.equal(A.failed(source), true);
  assert.equal(A.failed(f.resolve(source)), true);
  await A.preload(source);
  assert.equal(requests.length, 1);
  for (const kind of [{contextual: true}, {targetView: true}, {approximatePair: true}, {}]) {
    for (const language of ['ru', 'en', 'zh']) {
      const note = A.note(kind, language);
      assert.ok(note.trim());
      if (language !== 'ru') assert.doesNotMatch(note, /[\u0400-\u04ff]/);
    }
  }
});

test('standalone asset paths and an installed platform resolver remain supported', () => {
  const previousContext = globalThis.__RUDN_RELEASE__, previousPlatform = globalThis.GovernorGame.Platform;
  try {
    delete globalThis.__RUDN_RELEASE__;
    assert.equal(resolveAsset('assets/advisors/mira.png', 'http://localhost:8080/RUDN/apps/governor/'),
      'http://localhost:8080/RUDN/apps/governor/assets/advisors/mira.png');
    globalThis.GovernorGame.Platform = {resolveAsset: input => new URL(input, 'https://cdn.example.test/governor/')};
    assert.equal(resolveAsset('assets/advisors/mira.png'), 'https://cdn.example.test/governor/assets/advisors/mira.png');
  } finally {
    globalThis.__RUDN_RELEASE__ = previousContext;
    globalThis.GovernorGame.Platform = previousPlatform;
  }
});
