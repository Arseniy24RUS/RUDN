import {project, WORLD_SIZE} from './projection.mjs';
import {APPROVED_ART} from '../v2/assets.mjs';

export const MAX_BASEMAP_PIXELS = 2_000_000;
const CHUNK_POINTS = 64, CELL = 512;
const ROAD_ORDER = ['tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
const ROAD_STYLE = Object.freeze({tertiary: {minZoom: 8, width: 1.1, core: 0}, secondary: {minZoom: 6, width: 1.65, core: .65}, primary: {minZoom: 4, width: 2.05, core: .95}, trunk: {minZoom: 3, width: 2.6, core: 1.35}, motorway: {minZoom: 3, width: 2.9, core: 1.6}});
const intersects = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export const GRASS_TEXTURE_WORLD_SIZE = 128;
let sharedGrassPromise = null, sharedGrassImage = null, sharedGrassDecodeCount = 0;
/** One bounded 512² approved image is shared across region changes; never decode during paint. */
export function loadGrassTexture() {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  sharedGrassPromise ||= new Promise(resolve => {
    const image = new Image(); image.decoding = 'async';
    image.onload = async () => { try { await image.decode(); sharedGrassDecodeCount++; sharedGrassImage = image; resolve(image); } catch { resolve(null); } };
    image.onerror = () => resolve(null);
    image.src = new URL('../../../img/settlements/v3/terrain_grass.webp', import.meta.url).href;
  });
  return sharedGrassPromise;
}

/** RDP keeps source vertices; LOD never inserts a different road or changes endpoints. */
export function simplifyIndices(xy, tolerance) {
  const count = xy.length / 2;
  if (count < 3 || tolerance <= 0) return Uint16Array.from({length: count}, (_, i) => i);
  const keep = new Uint8Array(count); keep[0] = keep[count - 1] = 1;
  const stack = [0, count - 1], squaredTolerance = tolerance * tolerance;
  while (stack.length) {
    const end = stack.pop(), start = stack.pop(), ax = xy[start * 2], ay = xy[start * 2 + 1], dx = xy[end * 2] - ax, dy = xy[end * 2 + 1] - ay, length = dx * dx + dy * dy;
    let best = squaredTolerance, at = -1;
    for (let i = start + 1; i < end; i++) {
      const px = xy[i * 2] - ax, py = xy[i * 2 + 1] - ay, t = length ? Math.max(0, Math.min(1, (px * dx + py * dy) / length)) : 0;
      const distance = (px - t * dx) ** 2 + (py - t * dy) ** 2;
      if (distance > best) { best = distance; at = i; }
    }
    if (at >= 0) { keep[at] = 1; stack.push(start, at, at, end); }
  }
  return Uint16Array.from(Array.from(keep, (v, i) => v ? i : -1).filter(i => i >= 0));
}

/** BBox index includes crossing segments whose endpoints are outside the viewport. */
export class RoadIndex {
  constructor(records = []) {
    this.records = records; this.cells = new Map(); this.spanning = [];
    for (const r of records) {
      const [left, top, right, bottom] = r.bounds.map(v => Math.floor(v / CELL));
      if ((right - left + 1) * (bottom - top + 1) > 64) { this.spanning.push(r); continue; }
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) { const key = `${x}:${y}`; if (!this.cells.has(key)) this.cells.set(key, []); this.cells.get(key).push(r); }
    }
  }
  query(bounds) {
    const [left, top, right, bottom] = bounds.map(v => Math.floor(v / CELL));
    if ((right - left + 1) * (bottom - top + 1) > this.cells.size * 2) return this.records.filter(r => intersects(r.bounds, bounds));
    const found = new Set(this.spanning.filter(r => intersects(r.bounds, bounds)));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) for (const r of this.cells.get(`${x}:${y}`) || []) if (intersects(r.bounds, bounds)) found.add(r);
    return [...found];
  }
  clear() { this.records = []; this.cells.clear(); this.spanning = []; }
}

export function prepareRoads(geo, wrap = false) {
  const records = []; let features = 0, sourceLines = 0, vertices = 0, preparedVertices = 0, preparedBufferBytes = 0;
  function line(coordinates, roadClass) {
    sourceLines++; vertices += coordinates.length;
    let points = [];
    function flush() {
      if (points.length < 2) { points = []; return; }
      for (let start = 0; start < points.length - 1; start += CHUNK_POINTS - 1) {
        const part = points.slice(start, start + CHUNK_POINTS), xy = Float64Array.from(part.flatMap(p => [p.x, p.y]));
        const bounds = [Math.min(...part.map(p => p.x)), Math.min(...part.map(p => p.y)), Math.max(...part.map(p => p.x)), Math.max(...part.map(p => p.y))];
        const levels = [0, .75, 3, 12, 48].map(tolerance => simplifyIndices(xy, tolerance));
        records.push({xy, bounds, roadClass, levels}); preparedVertices += part.length; preparedBufferBytes += xy.byteLength + levels.reduce((n, a) => n + a.byteLength, 0);
      }
      points = [];
    }
    for (const coordinate of coordinates) {
      const p = Array.isArray(coordinate) && project({lon: coordinate[0], lat: coordinate[1]}, wrap);
      if (!p) { flush(); continue; }
      // Never draw a cross-world bridge through a discontinuous source branch.
      if (points.length && Math.abs(p.x - points.at(-1).x) > WORLD_SIZE / 2) flush();
      points.push(p);
    }
    flush();
  }
  function visit(node, roadClass = 'tertiary') {
    if (!node) return;
    if (node.type === 'FeatureCollection') { for (const f of node.features || []) visit(f); return; }
    if (node.type === 'Feature') { features++; visit(node.geometry, Object.hasOwn(ROAD_STYLE, node.properties?.roadClass) ? node.properties.roadClass : 'tertiary'); return; }
    if (node.type === 'GeometryCollection') { for (const g of node.geometries || []) visit(g, roadClass); return; }
    if (node.type === 'LineString') line(node.coordinates || [], roadClass);
    else if (node.type === 'MultiLineString') for (const coordinates of node.coordinates || []) line(coordinates, roadClass);
  }
  visit(geo);
  return {records, features, sourceLines, vertices, preparedVertices, preparedBufferBytes};
}

// Green is an explicitly illustrative style for every region, never inferred land cover.
const palette = () => ({outside: '#e9eee5', region: '#dfead5'});
const lodFor = zoom => zoom >= 12 ? 0 : zoom >= 10 ? 1 : zoom >= 8 ? 2 : zoom >= 6 ? 3 : 4;

/** One prepared region and one bounded surface. Gestures transform it until coverage runs out. */
export class BasemapLayer {
  constructor({createCanvas = () => document.createElement('canvas'), createPath = () => typeof Path2D === 'function' ? new Path2D() : null, textureLoader = loadGrassTexture, onInvalidate = () => {}} = {}) {
    this.createCanvas = createCanvas; this.index = new RoadIndex(); this.rings = []; this.surface = null; this.cache = null; this.cacheBuilds = 0; this.affineDraws = 0; this.preparations = 0; this.coverageRebuildsDuringGesture = 0; this.sourceStatus = 'not-provided'; this.regionId = null; this.sourceIds = []; this.stats = {features: 0, sourceLines: 0, vertices: 0, preparedVertices: 0, preparedBufferBytes: 0}; this.drawnRoadChunks = 0; this.drawnRoadVertices = 0; this.destroyed = false;
    this.texture = null; this.textureStatus = 'loading'; this.textureRevision = 0; this.pattern = null; this.patternBuilds = 0; this.onInvalidate = onInvalidate;
    this.createPath = createPath; this.boundaryPath = null; this.roadPaths = []; this.vectorPathBuilds = 0; this.vectorDraws = 0;
    textureLoader().then(image => { if (this.destroyed) return; this.texture = image; this.textureStatus = image ? 'loaded' : 'unavailable'; this.textureRevision++; this.onInvalidate(); }).catch(() => { if (!this.destroyed) { this.textureStatus = 'unavailable'; this.textureRevision++; this.onInvalidate(); } });
  }
  release() {
    this.index.clear(); this.rings = []; this.cache = null;
    this.boundaryPath = null; this.roadPaths = [];
    if (this.surface) this.surface.width = this.surface.height = 1;
    this.surface = null; this.pattern = null; this.stats = {features: 0, sourceLines: 0, vertices: 0, preparedVertices: 0, preparedBufferBytes: 0}; this.drawnRoadChunks = this.drawnRoadVertices = 0;
  }
  setData({regionId, roads, status = roads ? 'loaded' : 'not-provided'} = {}, rings = [], wrap = false) {
    this.release(); this.regionId = regionId || null; this.sourceStatus = status; this.rings = rings;
    this.sourceIds = (roads?.provenance?.sources || []).map(s => s.id); this.sourceMethod = roads?.provenance?.geometryMethod || null;
    const prepared = prepareRoads(roads, wrap); this.index = new RoadIndex(prepared.records); const {records, ...stats} = prepared; this.stats = stats; this.preparations++;
  }
  rebuild(camera, {dpr = 1, theme = 'grass', scenic = true, textureEnabled = true} = {}) {
    const margin = Math.min(384, Math.ceil(Math.max(camera.width, camera.height) * .4)), width = camera.width + margin * 2, height = camera.height + margin * 2;
    const rasterDpr = Math.min(dpr, Math.sqrt(MAX_BASEMAP_PIXELS / (width * height)));
    this.surface ||= this.createCanvas(); this.surface.width = Math.max(1, Math.floor(width * rasterDpr)); this.surface.height = Math.max(1, Math.floor(height * rasterDpr));
    const c = this.surface.getContext('2d'), ox = camera.ox - margin / camera.scale, oy = camera.oy - margin / camera.scale;
    // Local coordinates keep native path precision at close zoom as well.
    this.boundaryPath = this.createPath();
    if (this.boundaryPath) for (const ring of this.rings) { ring.forEach((p, i) => i ? this.boundaryPath.lineTo(p.x - ox, p.y - oy) : this.boundaryPath.moveTo(p.x - ox, p.y - oy)); this.boundaryPath.closePath(); }
    const colors = palette(theme, scenic); c.setTransform(rasterDpr, 0, 0, rasterDpr, 0, 0); c.fillStyle = colors.outside; c.fillRect(0, 0, width, height);
    c.setTransform(rasterDpr * camera.scale, 0, 0, rasterDpr * camera.scale, -ox * camera.scale * rasterDpr, -oy * camera.scale * rasterDpr);
    c.beginPath(); for (const ring of this.rings) { ring.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); }
    c.fillStyle = colors.region; c.fill('evenodd');
    let textured = false;
    if (scenic && textureEnabled && this.texture) {
      if (!this.pattern) { this.pattern = c.createPattern(this.texture, 'repeat'); this.pattern?.setTransform({a: GRASS_TEXTURE_WORLD_SIZE / this.texture.naturalWidth, b: 0, c: 0, d: GRASS_TEXTURE_WORLD_SIZE / this.texture.naturalHeight, e: 0, f: 0}); this.patternBuilds++; }
      if (this.pattern) { c.globalAlpha = .42; c.fillStyle = this.pattern; c.fill('evenodd'); c.globalAlpha = 1; textured = true; }
    }
    if (!this.boundaryPath) { c.strokeStyle = '#94aa88'; c.lineWidth = 1.3 / camera.scale; c.stroke(); }
    const bounds = [ox, oy, ox + width / camera.scale, oy + height / camera.scale], visible = this.index.query(bounds), lod = lodFor(camera.zoom);
    this.drawnRoadChunks = 0; this.drawnRoadVertices = 0; this.roadPaths = []; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const roadClass of ROAD_ORDER) {
      const style = ROAD_STYLE[roadClass]; if (camera.zoom < style.minZoom) continue;
      const path = this.createPath(), pen = path || c; if (!path) c.beginPath(); let chunks = 0;
      for (const record of visible) {
        if (record.roadClass !== roadClass) continue;
        const indices = record.levels[lod]; this.drawnRoadChunks++; chunks++; this.drawnRoadVertices += indices.length;
        const px = path ? ox : 0, py = path ? oy : 0;
        indices.forEach((i, j) => j ? pen.lineTo(record.xy[i * 2] - px, record.xy[i * 2 + 1] - py) : pen.moveTo(record.xy[i * 2] - px, record.xy[i * 2 + 1] - py));
      }
      if (path) { if (chunks) this.roadPaths.push({roadClass, path}); continue; }
      c.strokeStyle = roadClass === 'tertiary' ? '#9eb18f' : '#879b79'; c.lineWidth = style.width / camera.scale; c.stroke();
      if (style.core) { c.strokeStyle = '#fffdf3'; c.lineWidth = style.core / camera.scale; c.stroke(); }
    }
    this.cache = {ox, oy, width: this.surface.width / rasterDpr, height: this.surface.height / rasterDpr, scale: camera.scale, dpr, rasterDpr, theme, scenic, textureEnabled, textureRevision: this.textureRevision, textured, lod}; this.cacheBuilds++; this.vectorPathBuilds++;
  }
  /** A maximum of five culled native paths avoids raster upscaling of thin roads.
   * Input frames reuse commands; no point projection or JS vertex walk in paint. */
  paintVectors(c, camera) {
    if (!this.boundaryPath && !this.roadPaths.length) return;
    c.save(); c.translate((this.cache.ox - camera.ox) * camera.scale, (this.cache.oy - camera.oy) * camera.scale); c.scale(camera.scale, camera.scale); c.lineCap = 'round'; c.lineJoin = 'round';
    if (this.boundaryPath) { c.strokeStyle = '#94aa88'; c.lineWidth = 1.3 / camera.scale; c.stroke(this.boundaryPath); }
    for (const {roadClass, path} of this.roadPaths) {
      const style = ROAD_STYLE[roadClass]; if (camera.zoom < style.minZoom) continue;
      c.strokeStyle = roadClass === 'tertiary' ? '#9eb18f' : '#879b79'; c.lineWidth = style.width / camera.scale; c.stroke(path);
      if (style.core) { c.strokeStyle = '#fffdf3'; c.lineWidth = style.core / camera.scale; c.stroke(path); }
    }
    c.restore(); this.vectorDraws++;
  }
  covers(camera) {
    const a = this.cache; if (!a) return false;
    return camera.ox >= a.ox && camera.oy >= a.oy && camera.ox + camera.width / camera.scale <= a.ox + a.width / a.scale && camera.oy + camera.height / camera.scale <= a.oy + a.height / a.scale;
  }
  paint(c, camera, options = {}) {
    if (this.destroyed) return;
    const {theme = 'grass', scenic = true, dpr = 1, textureEnabled = true} = options, cache = this.cache;
    c.fillStyle = palette(theme, scenic).outside; c.fillRect(0, 0, camera.width, camera.height);
    const covered = this.covers(camera), outdated = !cache || cache.theme !== theme || cache.scenic !== scenic || cache.dpr !== dpr || cache.textureEnabled !== textureEnabled || cache.textureRevision !== this.textureRevision || Math.abs(cache.scale - camera.scale) > 1e-9 || !covered;
    // A long held drag or zoom-out must not reveal an empty cache rectangle.
    // Coverage refresh still uses only the prepared, culled index and capped raster.
    if (outdated && (!camera.moving || !cache || !covered)) { if (camera.moving && cache && !covered) this.coverageRebuildsDuringGesture++; this.rebuild(camera, {dpr, theme, scenic, textureEnabled}); }
    if (!this.cache) return;
    const a = this.cache, scale = camera.scale / a.scale;
    c.drawImage(this.surface, (a.ox - camera.ox) * camera.scale, (a.oy - camera.oy) * camera.scale, a.width * scale, a.height * scale); this.affineDraws++;
    this.paintVectors(c, camera);
  }
  evidence(camera) {
    return {raster: this.cache ? {dpr: this.cache.rasterDpr, scale: this.cache.scale, screenScaleRatio: camera ? camera.scale / this.cache.scale : null, width: this.surface.width, height: this.surface.height} : null, vectors: {mode: this.boundaryPath ? 'cached-native-paths' : 'raster-fallback', paths: this.roadPaths.length, builds: this.vectorPathBuilds, draws: this.vectorDraws, vertices: this.drawnRoadVertices, surfaceCount: this.surface ? 1 : 0}, regionId: this.regionId, sourceStatus: this.sourceStatus, sourceIds: this.sourceIds.slice(), sourceMethod: this.sourceMethod, ...this.stats, chunks: this.index.records.length, indexCells: this.index.cells.size, cacheBuilds: this.cacheBuilds, coverageRebuildsDuringGesture: this.coverageRebuildsDuringGesture, viewportCovered: camera ? this.covers(camera) : null, affineDraws: this.affineDraws, preparations: this.preparations, drawnRoadChunks: this.drawnRoadChunks, drawnRoadVertices: this.drawnRoadVertices, lod: this.cache?.lod ?? null, cachedCanvasBytes: this.surface ? this.surface.width * this.surface.height * 4 : 0, cachedCanvasBytesKind: 'RGBA allocation estimate, not resident memory', cachedCanvasPixelLimit: MAX_BASEMAP_PIXELS, preparedBufferBytesKind: 'exact typed-array byteLength sum; JS object overhead and native resident bytes unknown', texture: {asset: 'terrain_grass', approvedSha256: APPROVED_ART.terrain_grass, status: this.textureStatus, drawn: Boolean(this.cache?.textured), illustrative: true, alpha: .42, worldTileSize: GRASS_TEXTURE_WORLD_SIZE, patternBuilds: this.patternBuilds, sharedDecodeCount: sharedGrassDecodeCount, sharedDecodedImageBytes: sharedGrassImage ? sharedGrassImage.naturalWidth * sharedGrassImage.naturalHeight * 4 : 0, sharedDecodedImageBytesKind: 'RGBA estimate for one shared bounded image cache; native resident bytes unknown'}, water: {status: 'not-available-in-supplied-data', features: 0}, terrain: {status: 'not-available-in-supplied-data'}, surfaceMeaning: 'Actual region polygon and supplied OSM roads. Green texture is illustrative style, not observed land cover; no water or terrain data inferred.', destroyed: this.destroyed};
  }
  destroy() { this.release(); this.texture = null; this.textureStatus = 'released'; this.onInvalidate = () => {}; this.sourceIds = []; this.sourceMethod = null; this.regionId = null; this.sourceStatus = 'destroyed'; this.destroyed = true; }
}
