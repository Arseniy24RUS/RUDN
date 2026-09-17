/* Geometric regression against the unchanged author topology, without a browser. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const sandbox = { console };
vm.createContext(sandbox);
for (const file of ['site/assets/puzzle/vendor/d3.v7.9.0.min.js', 'site/assets/puzzle/vendor/topojson-client.v3.1.0.min.js', 'site/assets/js/puzzle-render-geometry.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
const { computeLayout, createTopologyRenderer } = sandbox.RudnPuzzleGeometry;
const topology = JSON.parse(fs.readFileSync(path.join(root, 'site/assets/puzzle/data/russia_subjects_89.topojson'), 'utf8'));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceHash = digest(topology);
const objectKey = Object.keys(topology.objects).sort((a, b) => topology.objects[b].geometries.length - topology.objects[a].geometries.length)[0];
const features = sandbox.topojson.feature(topology, topology.objects[objectKey]).features;
assert.equal(features.length, 89);
class RecordedPath {
  constructor() { this.rings = []; this.current = null; this.vertices = 0; }
  moveTo(x, y) { this.current = [[x, y]]; this.rings.push(this.current); this.vertices++; }
  lineTo(x, y) { this.current.push([x, y]); this.vertices++; }
  closePath() {}
}
const area = points => {
  if (!points.length) return 0;
  const [ox, oy] = points[0]; let sum = 0;
  for (let i = 1; i < points.length; i++) sum += (points[i - 1][0] - ox) * (points[i][1] - oy) - (points[i][0] - ox) * (points[i - 1][1] - oy);
  return sum / 2;
};
const distanceSquared = (xy, index, first, last) => {
  const x = xy[index * 2], y = xy[index * 2 + 1], ax = xy[first * 2], ay = xy[first * 2 + 1];
  const dx = xy[last * 2] - ax, dy = xy[last * 2 + 1] - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
};
const report = { sourceHash, sourceFeatures: features.length, cases: [], layouts: [] };
const began = performance.now();
for (const [width, height, fullscreen, viewportWidth, viewportHeight] of [
  [320, 340.8, false, 320, 568], [390, 500, false, 390, 844],
  [844, 250, true, 844, 390], [568, 150, true, 568, 320], [1280, 720, false, 1366, 900],
]) {
  const layout = computeLayout(width, height, fullscreen, viewportWidth, viewportHeight), map = layout.map;
  assert(map.width > 0 && map.height > 0 && layout.tray.width > 0 && layout.tray.height > 0);
  assert(map.x + map.width <= width && map.y + map.height <= height);
  assert(layout.tray.x + layout.tray.width <= width && layout.tray.y + layout.tray.height <= height);
  assert(layout.side ? map.x + map.width + 12 <= layout.tray.x + 1e-8 : map.y + map.height + 12 <= layout.tray.y + 1e-8);
  if (layout.side) assert.equal(map.height, layout.tray.height);
  report.layouts.push({ width, height, fullscreen, ...JSON.parse(JSON.stringify(layout)) });
  const padding = Math.max(8, Math.min(20, map.width * 0.025));
  const projection = sandbox.d3.geoMercator().rotate([-105, 0]).fitSize([Math.max(1, map.width - padding * 2), Math.max(1, map.height - padding * 2)], { type: 'FeatureCollection', features });
  const offset = projection.translate(); projection.translate([offset[0] + map.x + padding, offset[1] + map.y + padding]);
  const setupAt = performance.now();
  const renderer = createTopologyRenderer({ topology, objectKey, featureIds: features.map(feature => String(feature.id)), project: projection, seamWidth: 2 * Math.PI * projection.scale(), Path: RecordedPath });
  assert(renderer, 'Author topology must use shared-arc rendering');
  const setupMs = performance.now() - setupAt;
  for (const zoom of [0.55, 1, 1.01, 2, 4, 8, 16, 32, 64, 128]) {
    const started = performance.now(), level = renderer.inspectLevel(zoom);
    let maximumSquared = 0, checkedPoints = 0;
    for (const arc of level.arcs) {
      assert.equal(arc.indices[0], 0);
      assert.equal(arc.indices.at(-1), arc.xy.length / 2 - 1);
      for (let j = 1; j < arc.indices.length; j++) {
        const first = arc.indices[j - 1], last = arc.indices[j];
        for (let i = first + 1; i < last; i++) { maximumSquared = Math.max(maximumSquared, distanceSquared(arc.xy, i, first, last)); checkedPoints++; }
      }
    }
    const screenError = Math.sqrt(maximumSquared) * zoom;
    assert(screenError <= 0.35000001, `Screen error ${screenError} exceeds 0.35px at ${width}x${height}, zoom ${zoom}`);
    features.forEach((feature, index) => {
      const full = renderer.getFull(index).path, display = renderer.get(index, zoom).path;
      assert.equal(display.rings.length, full.rings.length, `Lost ring ${feature.id}`);
      full.rings.forEach((ring, ringIndex) => {
        const before = area(ring), after = area(display.rings[ringIndex]);
        if (before) assert(before * after > 0, `Collapsed/reversed ring: ${feature.properties.name}, zoom ${zoom}`);
      });
      if (/Ингушет|Чечен|Самар/u.test(feature.properties.name || feature.properties.name_ru || '')) {
        assert(full.vertices > 100, `Active piece lost detail: ${feature.properties.name}`);
      }
    });
    const stats = renderer.diagnostics();
    assert(stats.levels.length <= 3);
    assert(stats.fullPaths <= 3);
    report.cases.push({ width, height, zoom, bucket: level.bucket, maximumScreenError: screenError, checkedPoints, setupMs, checkMs: performance.now() - started, ...JSON.parse(JSON.stringify(stats)) });
  }
}
assert.equal(createTopologyRenderer({ topology: { type: 'FeatureCollection', features }, objectKey, featureIds: [], project: x => x, Path: RecordedPath }), null, 'Legacy geometry uses unsimplified fallback');
assert.equal(digest(topology), sourceHash, 'Rendering must not alter persisted source geometry');
report.elapsedMs = performance.now() - began; report.status = 'passed';
const output = process.env.QA_OUT;
if (output) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'render-geometry.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ status: report.status, cases: report.cases.length, layouts: report.layouts.length, maximumScreenError: Math.max(...report.cases.map(item => item.maximumScreenError)), maxSetupMs: Math.max(...report.cases.map(item => item.setupMs)), elapsedMs: report.elapsedMs }));
