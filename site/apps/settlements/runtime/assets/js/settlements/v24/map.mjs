import {Camera2D, largestFreeRect, focusContentRect} from './camera.mjs';
import {project, unproject, coordinates, boundaryRings, circleCoordinates, SpatialIndex, clamp} from './projection.mjs';
import {drawSymbol, SYMBOL_WORLD_SIZE, SERVICE_COLORS} from './symbols.mjs';
import {BasemapLayer} from './basemap.mjs';
import {RouteDisplay, routeDisplayEvidence, routePresentation, activeRouteEdges, routeStrokeDashed} from './route-display.mjs';
import {towerSpec} from './telecom-policy.mjs';
import {isInitialTower as initialTower, TowerSymbolCache, initialCoveragePath} from './tower-lod.mjs';
import {playableRows} from './region-playability.mjs';
/** Scenarios v3/v4/v5 retain the v2 road presentation contract. Adapt only
 * the presentation input; the domain scenario, fixed geometry and save stay intact. */
export function presentGameRoute(route, {scenario, ...options} = {}) {
  const presentationScenario = [3, 4, 5].includes(scenario?.version) ? {version: 2, transportPolicy: scenario.transportPolicy} : scenario;
  return routePresentation(route, {...options, scenario: presentationScenario});
}
import {trend} from '../v2/engine.mjs';

export const COLORS = Object.freeze({...SERVICE_COLORS, grow: '#168470', stable: '#cc962d', decline: '#c96c5d', unknown: '#8b9ca5', missing: '#d48b74', preview: '#157bc3'});
const TAU = Math.PI * 2;
export const usesLayerIcons = (state, scenario) => state?.rulesVersion === 'settlements-3.4.0' || scenario?.version === 5;
export const facilityInLayer = (facility, layer) => facility.type === layer || layer === 'medical' && facility.type === 'outreach';
export function layerFacilityLayout(facilities, points, layer) { return facilities.filter(f => facilityInLayer(f, layer) && points.has(f.settlementId)).map(f => ({...f, point: points.get(f.settlementId), centered: true})); }
export const isTowerAction = action => ['tower', 'tower-batch'].includes(action?.type);
export function towerPreviewActions(state, preview) {
  const action = preview?.action, positions = action?.type === 'tower-batch' ? action.positions : action?.type === 'tower' ? [action] : [];
  return (positions || []).map((position, index) => ({...position, id: `preview:${index}`, radiusKm: towerSpec(state).radiusKm, number: positions.length > 1 ? index + 1 : null}));
}
export function towerPreviewAction(state, preview) { return preview?.action?.type === 'tower' ? {...preview.action, radiusKm: towerSpec(state).radiusKm} : null; }
const status = (evaluation, id, service) => evaluation?.byId?.[id]?.[service];
const intersects = (a, b, gap = 0) => a[0] < b[0] + b[2] + gap && a[0] + a[2] + gap > b[0] && a[1] < b[1] + b[3] + gap && a[1] + a[3] + gap > b[1];
export const MAX_POINT_RADIUS = 28;
/** Compressed population scale: readable villages, visibly larger cities, bounded overlap. */
export function populationRadius(population) { return Number.isFinite(population) && population > 0 ? clamp(4 + 2.5 * (population / 1000) ** .28, 4, MAX_POINT_RADIUS) : 2.5; }
/** Semantic point LOD depends only on zoom/population/priority, never pan or camera origin. */
export function displayPointRadius(population, zoom, priority = 0) {
  const base = populationRadius(population), t = clamp((zoom - 5) / 5.25, 0, 1), scale = .08 + .92 * t * t * (3 - 2 * t);
  return Math.min(base, Math.max(priority ? 4 : population > 0 ? 1 : .85, base * scale));
}
/** Glyph composition may wait for gesture end; its size/anchor always follow this continuous geometry. */
export function symbolFootprint(scale, {slot = 0, count = 1, offsetWorld} = {}) {
  offsetWorld ||= {x: (slot - (count - 1) / 2) * SYMBOL_WORLD_SIZE * 1.1, y: -SYMBOL_WORLD_SIZE * 1.05};
  const width = SYMBOL_WORLD_SIZE * scale, t = clamp((width - 23) / 5, 0, 1), blend = t * t * (3 - 2 * t);
  return {size: 24 + (Math.max(24, width) - 24) * blend, dx: offsetWorld.x * (27 / (SYMBOL_WORLD_SIZE * 1.1) * (1 - blend) + scale * blend), dy: offsetWorld.y * (29 / (SYMBOL_WORLD_SIZE * 1.05) * (1 - blend) + scale * blend), blend};
}
/** Local leader slots are a property of scene geometry, not the viewport or camera. */
export function layoutFacilities(facilities, points, towers = []) {
  const groups = new Map(), layout = [];
  for (const f of facilities) { if (!groups.has(f.settlementId)) groups.set(f.settlementId, []); groups.get(f.settlementId).push(f); }
  for (const [id, entries] of groups) {
    const point = points.get(id); if (!point) continue;
    entries.sort((a, b) => a.id.localeCompare(b.id));
    const halfRow = (entries.length - 1) * SYMBOL_WORLD_SIZE * .55;
    // A larger city circle must not cover its facilities. Fixed world slots
    // depend on source population, never on the current camera or viewport.
    const rowDistance = Math.max(SYMBOL_WORLD_SIZE * 1.05, populationRadius(point.row?.population) + SYMBOL_WORLD_SIZE / 2 + 4);
    const nearby = towers.filter(t => Math.abs(t.center.x - point.x) < halfRow + SYMBOL_WORLD_SIZE * 3 && Math.abs(t.center.y - point.y) < SYMBOL_WORLD_SIZE * 3);
    const slots = [{x: 0, y: -rowDistance}, {x: halfRow + SYMBOL_WORLD_SIZE * 1.3, y: -rowDistance}, {x: -halfRow - SYMBOL_WORLD_SIZE * 1.3, y: -rowDistance}, {x: 0, y: rowDistance}];
    const offsets = at => entries.map((_, i) => ({x: at.x + (i - (entries.length - 1) / 2) * SYMBOL_WORLD_SIZE * 1.1, y: at.y}));
    // Check both ends of compact/detail geometry. Fixed reference scales keep the
    // chosen slot identical on every viewport, during pan and throughout zoom.
    const collisions = at => offsets(at).reduce((sum, offsetWorld) => sum + nearby.reduce((hits, tower) => hits + [0, .5, 1].filter(scale => {
      const f = symbolFootprint(scale, {offsetWorld}), t = towerSymbolPoint({x: (tower.center.x - point.x) * scale, y: (tower.center.y - point.y) * scale}, f.size);
      return Math.abs(f.dx - t.x) < f.size + 2 && Math.abs(f.dy - t.y) < f.size + 2;
    }).length, 0), 0);
    let chosen = slots[0], best = nearby.length ? collisions(chosen) : 0;
    if (best) for (const slot of slots.slice(1)) { const score = collisions(slot); if (score < best) { chosen = slot; best = score; } if (!best) break; }
    const selected = offsets(chosen);
    for (const [i, f] of entries.entries()) layout.push({...f, point, offsetWorld: selected[i], slot: i, count: entries.length});
  }
  return layout;
}
export function historicalGlyph(row) { return {grow: '↑', stable: '→', decline: '↓', unknown: '?'}[trend(row)]; }
export function serviceShape(row, serviceState) {
  if (row.population === 0) return 'empty';
  if (!Number.isFinite(row.population) || !serviceState || serviceState.reason === 'unknown') return 'unknown';
  return serviceState.full ? 'check' : serviceState.served > 0 ? 'partial-arc' : 'open-ring';
}
/** Quality reduces optional FX first; it never changes the index, visible gameplay IDs or geometry. */
export class RenderQuality {
  constructor(deviceDpr = 1) { this.deviceDpr = clamp(deviceDpr, 1, 2); this.stage = 0; this.bad = 0; this.good = 0; this.goodSince = null; this.lastChange = -Infinity; this.changes = []; }
  get sceneDpr() { return Math.min(this.deviceDpr, [2, 2, 1.5, 1][this.stage]); }
  get fxDpr() { return Math.min(this.deviceDpr, this.stage ? 1 : 2); }
  get simpleEffects() { return this.stage > 0; }
  observe(costMs, now, continuousInterval = 0) {
    const slow = costMs > 14 || continuousInterval > 27;
    if (slow) { this.bad++; this.good = 0; this.goodSince = null; }
    else { this.bad = Math.max(0, this.bad - 1); if (costMs < 8 && (!continuousInterval || continuousInterval < 21)) { this.good++; this.goodSince ??= now; } else { this.good = 0; this.goodSince = null; } }
    let next = this.stage;
    if (this.bad >= 6 && now - this.lastChange >= 900) next = Math.min(3, this.stage + 1);
    else if (this.good >= 240 && this.goodSince !== null && now - this.goodSince >= 10000 && now - this.lastChange >= 10000) next = Math.max(0, this.stage - 1);
    if (next === this.stage) return false;
    this.changes.push({at: now, from: this.stage, to: next}); if (this.changes.length > 20) this.changes.shift();
    this.stage = next; this.lastChange = now; this.bad = this.good = 0; this.goodSince = null; return true;
  }
  evidence(actualSceneDpr = this.deviceDpr) { return {stage: this.stage, sceneDpr: actualSceneDpr, actualSceneDpr, suggestedSceneDpr: this.sceneDpr, fxDpr: this.fxDpr, simpleEffects: this.simpleEffects, changes: this.changes.map(c => ({...c}))}; }
}
/** The geographic point is the midpoint of the silhouette's two feet. */
export function towerSymbolPoint(anchor, size) { return {x: anchor.x, y: anchor.y - size * 13 / 32}; }
function prepareTower(tower, wrap) {
  const center = project(tower, wrap), ring = circleCoordinates(tower, tower.radiusKm ?? towerSpec().radiusKm).map(p => project(p, wrap));
  const bounds = {left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity};
  // Local coordinates keep native paths precise far from the world origin.
  const path = center && typeof globalThis.Path2D === 'function' ? new Path2D() : null;
  for (const [i, p] of ring.entries()) {
    bounds.left = Math.min(bounds.left, p.x); bounds.top = Math.min(bounds.top, p.y); bounds.right = Math.max(bounds.right, p.x); bounds.bottom = Math.max(bounds.bottom, p.y);
    if (path) i ? path.lineTo(p.x - center.x, p.y - center.y) : path.moveTo(p.x - center.x, p.y - center.y);
  }
  path?.closePath(); return {center, ring, bounds, path};
}
/** Bounded by active tower IDs plus the current draft, never by action history. */
export class TowerGeometryCache {
  constructor() { this.entries = new Map(); this.world = null; this.wrap = false; this.preview = null; this.previews = []; this.preparedCount = 0; }
  geometry(tower, previous) {
    const {lat, lon} = coordinates(tower), radiusKm = tower.radiusKm ?? towerSpec().radiusKm;
    if (previous && previous.lat === lat && previous.lon === lon && previous.radiusKm === radiusKm) return previous;
    this.preparedCount++; return {lat, lon, radiusKm, ...prepareTower(tower, this.wrap)};
  }
  sync(world, towers, wrap, previewAction = null) {
    if (world !== this.world || wrap !== this.wrap) { this.clear(); this.world = world; this.wrap = wrap; }
    const active = new Map(), geometry = towers.map(tower => {
      const prepared = this.geometry(tower, this.entries.get(tower.id)); active.set(tower.id, prepared); return {...tower, ...prepared};
    });
    this.entries = active; this.coverage = initialCoveragePath(geometry, this.coverage);
    const previews = Array.isArray(previewAction) ? previewAction : previewAction ? [previewAction] : [];
    this.previews = previews.map((tower, index) => ({...this.geometry(tower, this.previews[index]), ...tower}));
    this.preview = this.previews[0] || null;
    return geometry;
  }
  clear() { this.entries.clear(); this.preview = null; this.previews = []; this.coverage = null; this.world = null; }
  evidence() { return {activeCount: this.entries.size, previewCount: this.previews.length, preparedCount: this.preparedCount, nativePathCount: [...this.entries.values()].filter(t => t.path).length, initialCoverageCount: this.coverage?.sources.length || 0}; }
}
/** Test the perimeter extent, not the centre: a distant tower can cover the screen. */
export function towerZoneVisible(tower, camera, padding = 2) {
  const b = tower.bounds, {ox, oy, scale, width, height} = camera;
  return !b || (b.right - ox) * scale >= -padding && (b.left - ox) * scale <= width + padding && (b.bottom - oy) * scale >= -padding && (b.top - oy) * scale <= height + padding;
}
function pathGeometry(points) { const cumulative = [0]; for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)); return {points, cumulative, total: cumulative.at(-1) || 0}; }
export function sampleSignalPath(path, fraction) {
  if (!path.points.length) return null; const distance = path.total * clamp(fraction, 0, 1);
  let i = 1; while (i < path.cumulative.length - 1 && path.cumulative[i] < distance) i++;
  if (!path.points[i]) return {...path.points[0], segment: 0};
  const a = path.points[i - 1], b = path.points[i], t = (distance - path.cumulative[i - 1]) / (path.cumulative[i] - path.cumulative[i - 1] || 1);
  return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, segment: i - 1};
}
const actionKey = a => JSON.stringify([a?.type, a?.lat, a?.lon, a?.service, a?.settlementId, a?.from, a?.to, a?.facilityId, a?.targetEdge?.slice().sort(), a?.positions?.map(position => [position.lat, position.lon])]);
export const isRouteAction = action => ['connect', 'connect-network'].includes(action?.type);
/** Engine owns the path. An explicit empty freshPath must not fall back to old edges. */
export function previewRoutePaths(preview) { return Array.isArray(preview?.freshPath) ? preview.freshPath : preview?.path ? [preview.path] : []; }
/** Accept only a newly committed, matching preview. No solver, service or path calculation. */
export function createCommitSignal({previousState, previousPreview: q, state, points, routePoints = points, layer, wrap = false, now, reduced = false, newWorld = false, resolveRoute}) {
  if (reduced || newWorld || !q?.ok || !previousState || state === previousState || state.actions.length !== previousState.actions.length + 1 || q.baseRevision !== previousState.revision || actionKey(state.actions.at(-1)) !== actionKey(q.action)) return null;
  const ids = [...new Set([...(q.delta?.[layer]?.newlyFullIds || []), ...(q.delta?.[layer]?.improvedIds || [])])].filter(id => points.has(id));
  if (!ids.length) return null;
  const action = q.action, facility = action.type === 'upgrade' ? state.facilities.find(f => f.id === action.facilityId) : null;
  const origins = isTowerAction(action) ? (action.type === 'tower-batch' ? action.positions : [action]).map(position => project(position, wrap)).filter(Boolean) : [];
  const origin = origins[0] || points.get(action.settlementId || facility?.settlementId || action.from);
  if (!origin) return null;
  const paths = []; let kind = 'service';
  if (isRouteAction(action)) { kind = 'route'; for (const route of previewRoutePaths(q)) if (route.length > 1 && route.every(id => routePoints.has(id))) paths.push(resolveRoute ? resolveRoute(route) : pathGeometry(route.map(id => routePoints.get(id)))); }
  else if (isTowerAction(action)) { kind = 'radio'; for (const id of ids.slice(0, 24)) { const destination = points.get(id), nearest = origins.reduce((best, candidate) => Math.hypot(candidate.x - destination.x, candidate.y - destination.y) < Math.hypot(best.x - destination.x, best.y - destination.y) ? candidate : best, origin); paths.push(pathGeometry([nearest, destination])); } }
  return {kind, ids, origin: {x: origin.x, y: origin.y}, origins, sourceFacilityId: facility?.id || (action.type === 'build' ? state.facilities.find(f => f.settlementId === action.settlementId && !previousState.facilities.some(old => old.id === f.id))?.id : null), paths, start: now, duration: 650, revision: state.revision, layer, action: {...action}};
}
function focusHull(points) {
  if (points.length < 3) return [];
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y), cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x), low = [], high = [];
  for (const p of sorted) { while (low.length > 1 && cross(low.at(-2), low.at(-1), p) <= 0) low.pop(); low.push(p); }
  for (const p of sorted.reverse()) { while (high.length > 1 && cross(high.at(-2), high.at(-1), p) <= 0) high.pop(); high.push(p); }
  low.pop(); high.pop(); return [...low, ...high];
}
function historyColor(row) {
  return COLORS[trend(row)];
}
const compareKey = (a, b) => a < b ? -1 : a > b ? 1 : 0;
/** World-space segment index: a tap has a 44 CSS-pixel hit corridor at every zoom.
 * Long segments use an overflow bucket rather than allocating an unbounded grid. */
export class NetworkHitIndex {
  constructor() { this.cellSize = 128; this.builds = 0; this.clear(); }
  clear() { this.cells = new Map(); this.segments = []; this.overflow = []; this.edges = []; this.lastCandidates = 0; }
  sync(edges) {
    if (edges.length === this.edges.length && edges.every((e, i) => e === this.edges[i])) return;
    this.clear(); this.edges = edges.slice(); this.builds++;
    for (const edge of edges) for (let i = 1; i < edge.geometry.points.length; i++) {
      const a = edge.geometry.points[i - 1], b = edge.geometry.points[i], segment = {a, b, edge}, id = this.segments.push(segment) - 1;
      const x0 = Math.floor(Math.min(a.x, b.x) / this.cellSize), x1 = Math.floor(Math.max(a.x, b.x) / this.cellSize), y0 = Math.floor(Math.min(a.y, b.y) / this.cellSize), y1 = Math.floor(Math.max(a.y, b.y) / this.cellSize);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) { this.overflow.push(id); continue; }
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const key = `${x},${y}`; if (!this.cells.has(key)) this.cells.set(key, []); this.cells.get(key).push(id); }
    }
  }
  hit(point, camera, radius = 22) {
    const p = camera.screenToWorld(point), reach = radius / camera.scale, size = this.cellSize;
    const x0 = Math.floor((p.x - reach) / size), x1 = Math.floor((p.x + reach) / size), y0 = Math.floor((p.y - reach) / size), y1 = Math.floor((p.y + reach) / size);
    const candidates = new Set(this.overflow);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > Math.max(64, this.cells.size * 2)) for (let i = 0; i < this.segments.length; i++) candidates.add(i);
    else for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (const id of this.cells.get(`${x},${y}`) || []) candidates.add(id);
    this.lastCandidates = candidates.size; let best = null;
    for (const id of candidates) {
      const {a, b, edge} = this.segments[id], dx = b.x - a.x, dy = b.y - a.y, t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      const distance = Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t) * camera.scale;
      if (distance <= radius && (!best || distance < best.distance - 1e-7 || Math.abs(distance - best.distance) <= 1e-7 && compareKey(edge.key, best.key) < 0)) best = {key: edge.key, targetEdge: edge.targetEdge.slice(), distance};
    }
    return best;
  }
  evidence() { return {edgeCount: this.edges.length, segmentCount: this.segments.length, cellCount: this.cells.size, overflowCount: this.overflow.length, builds: this.builds, lastCandidates: this.lastCandidates}; }
}
/** One geometry per active canonical source edge; removed edges/worlds are released. */
export class NetworkGeometryCache {
  constructor() { this.preparedCount = 0; this.clear(); }
  clear() { this.entries = new Map(); this.points = this.source = this.scenario = null; }
  sync(routes, {points, source, scenario, moving, resolve}) {
    if (this.points !== points || this.source !== source || this.scenario !== scenario) { this.clear(); this.points = points; this.source = source; this.scenario = scenario; }
    const edges = new Map();
    for (const route of routes || []) { const path = route.path || [route.from, route.to]; for (let i = 1; i < path.length; i++) { const targetEdge = [path[i - 1], path[i]].sort(), key = targetEdge.join('|'); if (targetEdge[0] !== targetEdge[1] && points.has(targetEdge[0]) && points.has(targetEdge[1])) edges.set(key, targetEdge); } }
    const active = new Map();
    for (const [key, targetEdge] of [...edges].sort(([a], [b]) => compareKey(a, b))) {
      let entry = this.entries.get(key);
      if (!entry || !moving && entry.deferred) {
        const geometry = resolve(targetEdge), bounds = {left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity};
        for (const p of geometry.points) { bounds.left = Math.min(bounds.left, p.x); bounds.top = Math.min(bounds.top, p.y); bounds.right = Math.max(bounds.right, p.x); bounds.bottom = Math.max(bounds.bottom, p.y); }
        entry = {key, targetEdge, geometry, bounds, deferred: geometry.edges?.some(e => e.reason === 'deferred-until-gesture-end') || false}; this.preparedCount++;
      }
      active.set(key, entry);
    }
    this.entries = active; return [...active.values()];
  }
}
/** A Canvas display facade: engine outcomes are inputs, never recalculated here. */
export class GameMap {
  constructor(element, {onSelect = () => {}, onPlace = () => {}, onSelectNetwork = () => {}, onCamera, onRouteGeometryChange, translate = value => value} = {}) {
    Object.assign(this, {element, onSelect, onPlace, onSelectNetwork, onCamera, onRouteGeometryChange});
    this.destroyed = false; this.world = null; this.state = null; this.index = new SpatialIndex(); this.points = new Map(); this.sourcePoints = new Map(); this.boundaries = []; this.routes = []; this.towerGeometry = []; this.towerSymbolGeometry = []; this.labels = []; this.facilityLayout = []; this.drawnPoints = []; this.drawnFacilities = []; this.effects = []; this.frameId = 0; this.frameCosts = []; this.layoutCount = 0; this.sceneRevision = 0; this.sceneDirty = true; this.labelsDirty = true; this.raf = null; this.reducedMotion = false; this.scenic = true; this.theme = 'grass'; this.wrap = false; this.lod = 'compact'; this.originalTabindex = element.getAttribute('tabindex');
    this.translate=translate;element.setAttribute('tabindex', '0'); element.setAttribute('aria-label', translate('Карта поселений. Стрелки перемещают карту, плюс и минус меняют масштаб. Enter или пробел выбирает место в центре карты. Для выбора поселения также доступен поиск.'));
    this.canvas = document.createElement('canvas'); this.fxCanvas = document.createElement('canvas');
    for (const [canvas, name] of [[this.canvas, 'sg24-map-scene'], [this.fxCanvas, 'sg24-map-effects']]) { canvas.className = name; canvas.setAttribute('aria-hidden', 'true'); Object.assign(canvas.style, {position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none'}); element.append(canvas); }
    this.ctx = this.canvas.getContext('2d'); this.fx = this.fxCanvas.getContext('2d');
    this.towerCache = new TowerGeometryCache(); this.towerSymbolCache = new TowerSymbolCache(); this.networkCache = new NetworkGeometryCache(); this.networkHitIndex = new NetworkHitIndex(); this.networkEdges = []; this.previewRoutes = [];
    this.quality = new RenderQuality(window.devicePixelRatio || 1); this.lastFrameAt = null; this.continuousFrames = false; this.drawnSignals = []; this.focusOutline = []; this.basemapLayer = new BasemapLayer({onInvalidate: () => this.invalidate()}); this.basemap = null; this.routeDisplay = new RouteDisplay(); this.previewRoute = this.routeDisplay.path([], this.points); this.routeGeometryPending = false;
    this.camera = new Camera2D({width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight), onChange: () => this.invalidate(), onGestureEnd: () => { if (this.routeGeometryPending) { this.refreshRouteGeometry(); this.effects = []; this.onRouteGeometryChange?.(); } this.labelsDirty = true; this.invalidate(); }, onTap: point => this.pick(point)}).attach(element);
    this.observer = new ResizeObserver(() => { this.camera.setViewport(element.clientWidth, element.clientHeight); this.labelsDirty = true; this.invalidate(); }); this.observer.observe(element);
    this.visibility = () => { if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = null; this.camera.cancel(); this.effects = []; } else { this.labelsDirty = true; this.invalidate(); } };
    document.addEventListener('visibilitychange', this.visibility); this.invalidate();
  }
  resolve(value) { return typeof value === 'string' ? this.points.get(value) : project(value, this.wrap); }
  setTranslator(translate){this.translate=translate;this.element.setAttribute('aria-label',translate('Карта поселений. Стрелки перемещают карту, плюс и минус меняют масштаб. Enter или пробел выбирает место в центре карты. Для выбора поселения также доступен поиск.'));this.labelsDirty=true;this.invalidate();}
  screen(value) { const p = this.resolve(value); return p ? this.camera.worldToScreen(p) : null; }
  setWorld(world, scenario) {
    this.world = world; const v = world.region?.mapView || {}; this.wrap = Boolean(v.wrapLongitude) || (v.center?.[1] || 0) > 150;
    // Preserve all original anchors for existing routes, including excluded transit nodes.
    // Only the playable subset participates in settlement symbols, taps and framing.
    this.sourcePoints = new Map((world.valid || world.rows || []).map(row => { const p = project(row, this.wrap); return p && [row.id, {...p, row}]; }).filter(Boolean));
    this.points = new Map(playableRows(world, scenario).map(row => [row.id, this.sourcePoints.get(row.id)]).filter(([, point]) => point));
    this.coordinatePoints=new Map();for(const p of this.points.values()){const key=`${p.row.lat}|${p.row.lon}`;if(!this.coordinatePoints.has(key))this.coordinatePoints.set(key,[]);this.coordinatePoints.get(key).push(p.row.id);}
    this.index = new SpatialIndex([...this.points.values()]); this.boundaries = boundaryRings(scenario?.boundary, this.wrap); this.boundarySource = scenario?.boundary; this.labels = []; this.labelsDirty = true;
  }
  update(input) {
    if (this.destroyed) return;
    const previousState = this.state, previousPreview = this.preview, newWorld = input.world !== this.world, inputBasemap = input.basemap || null, basemapChanged = inputBasemap !== this.basemap, boundaryChanged = this.boundarySource !== input.scenario?.boundary, scenarioChanged = input.scenario !== this.scenario;
    const guide = input.guidance, guideKey = guide ? `${guide.step}:${guide.locked}:${guide.tool}:${guide.settlementId}:${guide.from}:${guide.to}:${JSON.stringify(guide.coordinate)}` : '', focusIds = input.focusIds || (input.scenario?.kind === 'intro' ? input.scenario.targetIds : []), focusKey = focusIds.join('|');
    const obstacleKey = JSON.stringify(this.obstacles());
    const unchanged = !newWorld && !basemapChanged && !boundaryChanged && input.scenario === this.scenario && input.state === this.state && input.evaluation === this.evaluation && input.preview === this.preview && input.activeLayer === this.activeLayer && input.activeTool === this.activeTool && input.selectedId === this.selectedId && input.selectedFacilityId === this.selectedFacilityId && input.routeFrom === this.routeFrom && Boolean(input.reducedMotion) === this.reducedMotion && guideKey === this.guideKey && obstacleKey === this.obstacleKey && focusKey === this.focusKey;
    if (unchanged) return;
    this.guideKey = guideKey; this.obstacleKey = obstacleKey;
    const playableChanged = newWorld || input.scenario?.playableSettlementIds !== this.scenario?.playableSettlementIds;
    const geometryChanged = playableChanged || input.state !== previousState || input.preview !== previousPreview;
    if (playableChanged) this.setWorld(input.world, input.scenario);
    const previousLayer = this.activeLayer;
    Object.assign(this, input); this.activeLayer ||= 'telecom'; this.reducedMotion = Boolean(input.reducedMotion); if (this.reducedMotion) { this.effects = []; this.camera.stopTransition(); }
    this.routeStopIds = new Set(input.routeStops || []);
    if (this.boundarySource !== input.scenario?.boundary) { this.boundaries = boundaryRings(input.scenario?.boundary, this.wrap); this.boundarySource = input.scenario?.boundary; }
    this.basemap = inputBasemap;
    if (newWorld || basemapChanged || boundaryChanged) {
      this.basemapLayer.setData(inputBasemap?.regionId === this.world?.region?.id ? inputBasemap : {regionId: this.world?.region?.id, status: inputBasemap ? 'region-mismatch' : 'not-provided'}, this.boundaries, this.wrap);
      this.routeDisplay.setSource(this.basemapLayer.index, this.world?.region?.id);
    }
    this.sceneRevision++; this.targetIds = new Set(focusIds); if (playableChanged || focusKey !== this.focusKey) this.focusOutline = focusHull(focusIds.map(id => this.points.get(id)).filter(Boolean)); this.focusKey = focusKey;
    this.previewIds = new Set([...(input.preview?.delta?.[this.activeLayer]?.newlyFullIds || []), ...(input.preview?.delta?.[this.activeLayer]?.improvedIds || [])]);
    this.coverageIds = new Set(input.preview?.coverageIds || []);
    if (geometryChanged || basemapChanged || boundaryChanged || scenarioChanged) this.refreshRouteGeometry();
    const signal = createCommitSignal({previousState, previousPreview, state: input.state, points: this.points, routePoints: this.sourcePoints, layer: input.activeLayer, wrap: this.wrap, now: performance.now(), reduced: input.reducedMotion, newWorld, resolveRoute: path => presentGameRoute(this.routeDisplay.path(path, this.sourcePoints, {allowSearch: !this.camera.moving}), {scenario: this.scenario})});
    if (signal) this.effects = [signal];
    else if (newWorld || basemapChanged || scenarioChanged || input.state?.revision !== previousState?.revision || input.activeLayer !== previousLayer) this.effects = [];
    if (geometryChanged) {
    this.towerCache ||= new TowerGeometryCache();
    this.towerGeometry = this.towerCache.sync(input.world, input.state?.towers || [], this.wrap, towerPreviewActions(input.state, input.preview));
    // Keep legacy coverage exact, but do not resurrect an excluded settlement as
    // a passive tower icon. Player-built towers remain available at any location.
    this.towerSymbolGeometry = Array.isArray(input.scenario?.playableSettlementIds) ? this.towerGeometry.filter(t => !initialTower(t) || this.points.has(t.settlementId)) : this.towerGeometry;
    this.previewTowers = this.towerCache.previews.map(tower => ({...tower, valid: input.preview.ok}));
    this.previewTower = this.previewTowers[0] || null;
    const facilities = [...(input.state?.facilities || [])];
    if (input.preview?.ok && input.preview.action?.type === 'build') {
      const existingIds = new Set(facilities.map(f => f.id));
      for (const f of input.preview.nextState?.facilities || []) if (!existingIds.has(f.id)) { facilities.push({...f, ghost: true}); existingIds.add(f.id); }
    }
    if (input.preview?.ok && input.preview.action?.type === 'upgrade') { const upgraded = input.preview.nextState?.facilities?.find(f => f.id === input.preview.action.facilityId), index = facilities.findIndex(f => f.id === upgraded?.id); if (index >= 0) facilities[index] = {...upgraded, ghost: true}; }
    this.allFacilities = facilities;
    this.facilityLayout = usesLayerIcons(this.state, this.scenario) ? layerFacilityLayout(facilities, this.points, this.activeLayer) : layoutFacilities(facilities, this.points, [...this.towerGeometry, ...(this.previewTowers || [])]);
    }
    if (usesLayerIcons(this.state, this.scenario) && (geometryChanged || previousLayer !== this.activeLayer || scenarioChanged)) {
      this.facilityLayout = layerFacilityLayout(this.allFacilities || [], this.points, this.activeLayer);
      this.localMarkers = new Map(); for (const f of this.facilityLayout) { if (!this.localMarkers.has(f.settlementId)) this.localMarkers.set(f.settlementId, []); this.localMarkers.get(f.settlementId).push(f); }
      this.localTowers=new Map();this.localTowerIds=new Set();
      if(this.activeLayer==='telecom')for(const t of this.towerSymbolGeometry){const ids=t.settlementId&&this.points.has(t.settlementId)?[t.settlementId]:this.coordinatePoints?.get(`${t.lat}|${t.lon}`)||[];for(const id of ids)if(!this.localTowers.has(id)){this.localTowers.set(id,t);this.localTowerIds.add(t.id);}}
    }
    this.labelsDirty = true; if (playableChanged) this.fitFocus(input.scenario?.kind === 'intro' ? input.scenario.targetIds : [...this.points.keys()]); this.invalidate();
  }
  refreshRouteGeometry() {
    this.routeGeometryPending = Boolean(this.camera.moving);
    const activeEdges = activeRouteEdges(this.state?.routes), resolve = (path, preview = false) => presentGameRoute(this.routeDisplay.path(path, this.sourcePoints, {allowSearch: !this.routeGeometryPending}), {scenario: this.scenario, activeEdges, preview});
    this.routes = (this.state?.routes || []).map((route, i) => ({id: route.id || `${route.from}|${route.to}|${i}`, geometry: resolve(route.path || [route.from, route.to])}));
    this.networkCache ||= new NetworkGeometryCache(); this.networkHitIndex ||= new NetworkHitIndex();
    this.networkEdges = this.networkCache.sync(this.state?.routes, {points: this.sourcePoints, source: this.routeDisplay.edgeCache, scenario: this.scenario, moving: this.routeGeometryPending, resolve});
    this.networkHitIndex.sync(this.networkEdges);
    const path = this.preview?.path || (isRouteAction(this.preview?.action) ? this.preview?.nextState?.routes?.at(-1)?.path : null);
    this.previewRoute = resolve(path || [], true);
    this.previewRoutes = previewRoutePaths({...this.preview, path}).map(path => resolve(path, true));
  }
  /** Call after update has synced the current regional source; never uses a previous preview. */
  routeSummary(path) { return this.destroyed ? null : this.routeDisplay.path(path, this.sourcePoints, {allowSearch: !this.camera.moving}).summary; }
  invalidate() { if (this.destroyed) return; this.sceneDirty = true; this.schedule(); }
  schedule() { if (!this.raf && !this.destroyed && !document.hidden) this.raf = requestAnimationFrame(now => this.frame(now)); }
  // Base-map clarity remains constant while held, moving and idle. Adaptive
  // quality only reduces optional effects, never reallocates the main canvas.
  get sceneDpr() { return this.quality.deviceDpr ?? this.quality.sceneDpr; }
  resizeCanvas(canvas, ctx) {
    const {width, height} = this.camera, dpr = canvas === this.fxCanvas ? this.quality.fxDpr : this.sceneDpr;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return {width, height};
  }
  frame(now) {
    this.raf = null; if (this.destroyed || document.hidden) return; const started = performance.now(); this.camera.tick(now);
    if (this.sceneDirty) { this.sceneDirty = false; this.paint(); this.onCamera?.(this.camera.snapshot()); }
    this.paintEffects(now); this.frameId++; const cost = performance.now() - started; this.frameCosts.push(cost); if (this.frameCosts.length > 120) this.frameCosts.shift();
    if (this.quality.observe(cost, now, this.continuousFrames && this.lastFrameAt !== null ? now - this.lastFrameAt : 0)) this.invalidate();
    this.lastFrameAt = now; this.continuousFrames = Boolean(this.effects.length || this.camera.transition || this.camera.moving); if (this.effects.length || this.camera.transition) this.schedule();
  }
  visiblePoints(extra = 60) { const c = this.camera; return this.index.query(c.ox - extra / c.scale, c.oy - extra / c.scale, c.ox + (c.width + extra) / c.scale, c.oy + (c.height + extra) / c.scale); }
  pointPriority(p) {
    const id = p.row.id, s = status(this.evaluation, id, this.activeLayer), g = this.guidance;
    if (id === this.selectedId) return 4;
    if (this.previewIds?.has(id) || this.routeStopIds?.has(id) || id === this.routeFrom || id === g?.settlementId || id === g?.from || id === g?.to) return 3;
    if (this.targetIds?.has(id)) return 2;
    return this.activeLayer !== 'population' && s?.demand > 0 && !s.full ? 1 : 0;
  }
  worldPath(ctx, points, close = false) { if (!points.length) return; ctx.beginPath(); points.forEach((point, i) => { const p = this.camera.worldToScreen(point); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); if (close) ctx.closePath(); }
  paint() {
    const c = this.ctx, {width: w, height: h} = this.resizeCanvas(this.canvas, c); c.clearRect(0, 0, w, h);
    // The single cached texture is base content, not an optional animated effect.
    this.basemapLayer.paint(c, this.camera, {dpr: this.sceneDpr, theme: this.theme, scenic: this.scenic});
    if (!this.world) return;
    if (this.focusOutline.length >= 3) { this.worldPath(c, this.focusOutline, true); c.fillStyle = '#fdfdf515'; c.fill(); c.strokeStyle = '#688e8940'; c.lineWidth = 1; c.setLineDash([2, 7]); c.stroke(); c.setLineDash([]); }
    const width = SYMBOL_WORLD_SIZE * this.camera.scale, layerIcons = usesLayerIcons(this.state, this.scenario), showTowers = !layerIcons || this.activeLayer === 'telecom';
    if (!this.camera.moving) { if (this.lod === 'compact' && width >= 28) this.lod = 'detail'; else if (this.lod === 'detail' && width < 23) this.lod = 'compact'; }
    const towerPriority = new Set([this.selectedId, this.routeFrom, ...(this.routeStopIds || []), this.guidance?.settlementId, this.guidance?.from, this.guidance?.to, this.preview?.action?.settlementId, this.preview?.action?.from, this.preview?.action?.to].filter(Boolean));
    this.towerSymbolCache ||= new TowerSymbolCache();
    this.towerSymbolIds = showTowers ? this.towerSymbolCache.select(this.towerSymbolGeometry, this.camera.scale, symbolFootprint(this.camera.scale).size, {priorityIds: towerPriority, centeredIds: layerIcons ? this.localTowerIds : undefined}) : new Set();
    this.towerZoneMode = 'hidden'; this.initialCoverageFills = 0; this.initialCoverageOutlines = 0;
    if (showTowers && (this.activeLayer === 'telecom' || this.activeTool === 'tower')) {
      this.paintInitialCoverage(c);
      // Preserve exact coverage for every passive tower in one fill. Only the
      // selected tower needs its individual radius outlined on an overview.
      for (const t of this.towerSymbolGeometry) if ((!initialTower(t) || towerPriority.has(t.settlementId) || towerPriority.has(t.id)) && towerZoneVisible(t, this.camera)) {
        this.paintZone(c, t.ring, false, true, t, !initialTower(t));
        if (initialTower(t)) this.initialCoverageOutlines++;
      }
    }
    if (showTowers) this.paintPreviewCoverage(c);
    this.drawnNetworkEdges = [];
    for (const route of this.networkEdges || this.routes) if (towerZoneVisible(route, this.camera, 22)) { this.paintRoute(c, route.geometry || route.points, false); if (route.key) this.drawnNetworkEdges.push(route.key); }
    for (const route of this.previewRoutes || [this.previewRoute]) this.paintRoute(c, route, true);
    const points = this.visiblePoints(); this.drawnPoints = [];
    const drawPoint = (p, priority) => {
      const candidateTower = layerIcons && this.localTowers?.get(p.row.id), tower = candidateTower && this.towerSymbolIds.has(candidateTower.id) ? candidateTower : null;
      const at = this.camera.worldToScreen(p), row = p.row, r = displayPointRadius(row.population, this.camera.zoom, priority), s = status(this.evaluation, row.id, this.activeLayer), selected = row.id === this.selectedId, preview = this.previewIds.has(row.id), local = layerIcons && this.localMarkers?.get(row.id), icon = local?.length || tower, iconSize = icon ? symbolFootprint(this.camera.scale).size : 0, shape = icon ? local?.length ? 'facility-icon' : 'tower-icon' : this.activeLayer === 'population' ? 'historical' : serviceShape(row, s), tiny = r < 3.5;
      const color = this.activeLayer === 'population' ? historyColor(row) : s?.full ? SERVICE_COLORS[this.activeLayer] || '#087f78' : s?.reason === 'empty' || s?.reason === 'unknown' ? COLORS.unknown : s?.served > 0 ? '#d4a347' : COLORS.missing;
      if (icon) {
        if (local?.length) this.paintLocalFacility(c, local, at, iconSize, s);
        else this.paintTower(c, tower, false, width, true);
      } else {
      c.beginPath(); c.arc(at.x, at.y, r + (selected ? 6 : preview ? 4 : this.targetIds.has(row.id) ? 3 : 0), 0, TAU); c.fillStyle = selected || preview || this.targetIds.has(row.id) ? '#ffffff' : color; c.fill();
      c.beginPath(); c.arc(at.x, at.y, r, 0, TAU); c.fillStyle = row.population === 0 || shape === 'open-ring' ? '#f8faf7' : color; c.fill();
      if (!tiny || shape === 'open-ring' || shape === 'empty') { c.strokeStyle = row.population === 0 ? COLORS.unknown : shape === 'open-ring' ? COLORS.missing : '#fff'; c.lineWidth = tiny ? .7 : shape === 'open-ring' ? 2 : 1.5; c.stroke(); }
      if (s?.full && this.activeLayer !== 'population' && r >= 5) { c.strokeStyle = '#fff'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(at.x - 2.5, at.y); c.lineTo(at.x - .5, at.y + 2); c.lineTo(at.x + 3, at.y - 2); c.stroke(); }
      if (s?.served > 0 && !s.full && this.activeLayer !== 'population') { c.beginPath(); c.arc(at.x, at.y, r + 2.5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(s.served / s.demand, 0, 1)); c.strokeStyle = SERVICE_COLORS[this.activeLayer]; c.lineWidth = 2; c.stroke(); }
      }
      if (selected || preview || this.routeStopIds?.has(row.id) || row.id === this.routeFrom || row.id === this.guidance?.settlementId || row.id === this.guidance?.from || row.id === this.guidance?.to) { c.beginPath(); c.arc(at.x, at.y, (icon ? iconSize * .6 : r) + 5, 0, TAU); c.strokeStyle = selected ? '#174a65' : COLORS.preview; c.lineWidth = 2; c.setLineDash(preview ? [3, 3] : []); c.stroke(); c.setLineDash([]); }
      this.drawnPoints.push({id: row.id, x: at.x, y: at.y, radius: r, iconSize, hitRadius: Math.max(22, r + 8, iconSize / 2), priority, tiny, color, population: row.population, full: s?.full ?? null, shape, preview, capacityIndicator: local?.length && !s?.full ? s?.reason === 'capacity' ? 'capacity' : 'unserved' : null, historicalGlyph: null, historicalTrend: trend(row), historicalSource: {population: row.population, population2010: Number.isFinite(row.population2010) ? row.population2010 : null, territoryComparable: row.territoryComparable ?? null}});
    };
    this.drawnFacilities = [];
    for (const f of layerIcons ? [] : this.facilityLayout) {
      const rect = this.facilityRect(f); if (rect.x + rect.size < 0 || rect.x - rect.size > w || rect.y + rect.size < 0 || rect.y - rect.size > h) continue;
      const origin = this.camera.worldToScreen(f.point), direction = rect.y < origin.y ? -1 : 1; c.strokeStyle = '#89a5aa'; c.lineWidth = 1; c.beginPath(); c.moveTo(origin.x, origin.y + direction * (displayPointRadius(f.point.row.population, this.camera.zoom, this.pointPriority(f.point)) + 2)); c.lineTo(rect.x, rect.y - direction * rect.size / 2); c.stroke();
      drawSymbol(c, f.type, rect.x, rect.y, rect.size, {ghost: f.ghost, level: f.level, compact: this.lod === 'compact'});
      this.drawnFacilities.push({id: f.id, settlementId: f.settlementId, x: rect.x, y: rect.y, size: rect.size, hitRadius: Math.max(22, rect.size / 2), ghost: Boolean(f.ghost), lod: this.lod, worldSize: SYMBOL_WORLD_SIZE});
    }
    this.drawnTowers = [];
    if (showTowers && !layerIcons) for (const t of this.towerGeometry) if (!initialTower(t)) this.paintTower(c, t, false, width);
    if (showTowers && !layerIcons) for (const tower of this.previewTowers || []) this.paintTower(c, tower, true, width);
    // Every playable source point remains drawn. Foreground deficits/task/preview must not be buried by served background points.
    const pointBuckets = [[], [], [], [], []]; for (const p of points) pointBuckets[this.pointPriority(p)].push(p);
    for (let priority = 0; priority < pointBuckets.length; priority++) for (const p of pointBuckets[priority]) drawPoint(p, priority);
    // Seed towers coincide with town coordinates: retain the geographic foot,
    // but keep the mast readable above the population circle.
    if (showTowers) for (const t of this.towerGeometry) if (layerIcons ? !this.localTowerIds?.has(t.id) : initialTower(t)) this.paintTower(c, t, false, width);
    if (showTowers && layerIcons) for (const tower of this.previewTowers || []) this.paintTower(c, tower, true, width);
    this.paintGuidance(c);
    if (this.labelsDirty && !this.camera.moving) { this.layoutLabels(points); this.labelsDirty = false; }
    for (const l of this.labels) { const p = this.camera.worldToScreen(l.point), x = p.x + l.dx, y = p.y + l.dy; c.font = `${l.selected ? '700' : '600'} 12px system-ui, sans-serif`; c.textBaseline = 'middle'; c.fillStyle = l.selected ? '#174a65' : 'rgba(255,255,255,.96)'; c.beginPath(); c.roundRect(x, y, l.width, 24, 6); c.fill(); c.fillStyle = l.selected ? '#fff' : '#36505a'; c.fillText(l.text, x + 7, y + 12); }
  }
  paintLocalFacility(c, facilities, at, size, serviceState) {
    const kinds = [...new Set(facilities.map(f => f.type))].sort(), insufficient = !serviceState?.full;
    for (const [i, type] of kinds.entries()) {
      const entries = facilities.filter(f => f.type === type), f = entries.find(f => f.ghost) || entries[0], x = at.x + (i - (kinds.length - 1) / 2) * size * .5, glyphSize = kinds.length > 1 ? size * .65 : size;
      drawSymbol(c, type, x, at.y, glyphSize, {ghost: f.ghost, level: Math.max(...entries.map(f => f.level || 1)), compact: this.lod === 'compact'});
      this.drawnFacilities.push({id: f.id, facilityIds: entries.map(f => f.id), type, settlementId: f.settlementId, x, y: at.y, anchor: {...at}, size: glyphSize, hitRadius: Math.max(22, size / 2), ghost: Boolean(f.ghost), centered: true, capacityIndicator: insufficient ? serviceState?.reason === 'capacity' ? 'capacity' : 'unserved' : null, lod: this.lod, worldSize: SYMBOL_WORLD_SIZE});
    }
    if (insufficient) { c.beginPath(); c.arc(at.x, at.y, size * .6 + 2, 0, TAU); c.strokeStyle = serviceState?.served > 0 ? '#d4a347' : COLORS.missing; c.lineWidth = 2.5; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]); if (serviceState?.served > 0) { c.beginPath(); c.arc(at.x, at.y, size * .6 + 2, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(serviceState.served / serviceState.demand, 0, 1)); c.strokeStyle = SERVICE_COLORS[this.activeLayer]; c.stroke(); } }
  }
  facilityRect(f) {
    const p = this.camera.worldToScreen(f.point), geometry = symbolFootprint(this.camera.scale, f);
    if (f.centered) { const kinds = [...new Set((this.localMarkers?.get(f.settlementId) || [f]).map(f => f.type))].sort(), slot = kinds.indexOf(f.type); return {x: p.x + (slot - (kinds.length - 1) / 2) * geometry.size * .5, y: p.y, size: kinds.length > 1 ? geometry.size * .65 : geometry.size, anchor: p}; }
    return {x: p.x + geometry.dx, y: p.y + geometry.dy, size: geometry.size};
  }
  paintTower(c, tower, ghost, width, centered = false) {
    if (!tower.center || !ghost && this.towerSymbolIds && !this.towerSymbolIds.has(tower.id)) return;
    const anchor = this.camera.worldToScreen(tower.center), size = symbolFootprint(this.camera.scale).size, p = centered ? anchor : towerSymbolPoint(anchor, size);
    const reach = Math.max(22, size * .6) + 2;
    if (p.x + reach < 0 || p.x - reach > this.camera.width || p.y + reach < 0 || p.y - reach > this.camera.height) return;
    c.save(); if (initialTower(tower)) { c.shadowColor = '#fff'; c.shadowBlur = 2; }
    drawSymbol(c, 'tower', p.x, p.y, size, {ghost});
    if (ghost && tower.number) { const x = p.x + size * .38, y = p.y - size * .32; c.beginPath(); c.arc(x, y, 10, 0, TAU); c.fillStyle = '#157bc3'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); c.font = '700 12px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(String(tower.number), x, y); }
    c.restore();
    this.drawnTowers.push({id: tower.id || 'preview', x: p.x, y: p.y, size, anchor, centered, ghost, number: tower.number || null, foot: {x: p.x, y: p.y + size * 13 / 32}});
  }
  paintPreviewCoverage(c) {
    const towers = (this.previewTowers || []).filter(tower => towerZoneVisible(tower, this.camera));
    if (!towers.length) return;
    // One fill for the union: overlapping draft circles do not darken the map.
    c.save(); c.beginPath();
    for (const tower of towers) { for (const [index, point] of tower.ring.entries()) { const at = this.camera.worldToScreen(point); index ? c.lineTo(at.x, at.y) : c.moveTo(at.x, at.y); } c.closePath(); }
    c.fillStyle = towers.every(tower => tower.valid) ? '#7755b51a' : '#b34d4514'; c.fill('nonzero'); c.restore();
    for (const tower of towers) this.paintZone(c, tower.ring, true, tower.valid, tower, false);
  }
  paintInitialCoverage(c) {
    const coverage = this.towerCache?.coverage;
    this.towerZoneMode = coverage ? 'cached-union' : 'union';
    if (coverage && !towerZoneVisible(coverage, this.camera)) return;
    c.save(); c.fillStyle = '#7755b51a';
    if (coverage) {
      const anchor = this.camera.worldToScreen(coverage.center);
      c.translate(anchor.x, anchor.y); c.scale(this.camera.scale, this.camera.scale); c.fill(coverage.path, 'nonzero');
      this.initialCoverageFills = 1;
    } else {
      // Native Path2D is optional: the fallback still fills all source circles
      // once, without repeated translucent overlaps or hundreds of strokes.
      c.beginPath(); let count = 0;
      for (const tower of this.towerGeometry) if (initialTower(tower) && towerZoneVisible(tower, this.camera)) {
        for (const [i, point] of tower.ring.entries()) { const p = this.camera.worldToScreen(point); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
        c.closePath(); count++;
      }
      if (count) { c.fill('nonzero'); this.initialCoverageFills = 1; }
    }
    c.restore();
  }
  paintZone(c, ring, preview, valid, tower, fill = true) {
    c.save(); const path = tower?.path, scale = path ? this.camera.scale : 1;
    if (path) { const anchor = this.camera.worldToScreen(tower.center); c.translate(anchor.x, anchor.y); c.scale(scale, scale); }
    else this.worldPath(c, ring, true);
    c.fillStyle = preview ? valid ? '#7755b51a' : '#b34d4514' : '#7755b50b'; if (fill) path ? c.fill(path) : c.fill();
    c.strokeStyle = valid ? '#7755b5' : '#b34d45'; c.lineWidth = (preview ? 2 : 1) / scale; c.setLineDash(preview ? [6 / scale, 5 / scale] : []); path ? c.stroke(path) : c.stroke(); c.restore();
  }
  paintRoute(c, route, preview) {
    // Older callers pass a point array, including an empty preview before selection.
    const points = Array.isArray(route) ? route : route?.points;
    if (!points || points.length < 2) return;
    const sections = route.visualSections || route.sections || [{kind: 'conditional', points}];
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const section of sections) {
      this.worldPath(c, section.points); c.setLineDash(routeStrokeDashed(section.kind) ? [4, 5] : []);
      c.strokeStyle = '#fffffff0'; c.lineWidth = preview ? 6.5 : 5.5; c.stroke();
      c.strokeStyle = preview ? '#157bc3' : '#527f8c'; c.lineWidth = preview ? 3 : 2.6; c.stroke();
    }
    c.restore();
  }
  paintGuidance(c) {
    if (this.preview || !this.guidance?.locked || !this.guidance.coordinate) return; const p = this.screen(this.guidance.coordinate); if (!p) return;
    c.strokeStyle = '#157bc3'; c.fillStyle = '#ffffffd9'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, 22, 0, TAU); c.fill(); c.setLineDash([4, 4]); c.stroke(); c.setLineDash([]); c.beginPath(); c.moveTo(p.x - 7, p.y); c.lineTo(p.x + 7, p.y); c.moveTo(p.x, p.y - 7); c.lineTo(p.x, p.y + 7); c.stroke();
  }
  obstacles() {
    const r = this.element.getBoundingClientRect(); return [...(this.element.parentElement?.querySelectorAll('[data-map-obstacle]') || [])].map(el => { const b = el.getBoundingClientRect(); return [b.left - r.left, b.top - r.top, b.width, b.height]; }).filter(b => b[2] > 0 && b[3] > 0);
  }
  safeRect() {
    return largestFreeRect(this.camera.width, this.camera.height, this.obstacles());
  }
  layoutLabels(points) {
    this.layoutCount++; this.labels = []; const c = this.ctx, obstacles = this.obstacles(), {width: w, height: h} = this.camera;
    const priority = p => p.row.id === this.selectedId ? 1e15 : [this.guidance?.settlementId, this.guidance?.from, this.guidance?.to].includes(p.row.id) ? 1e14 : this.previewIds.has(p.row.id) ? 1e13 : this.targetIds.has(p.row.id) ? 1e12 + (p.row.population || 0) : p.row.population || 0;
    const candidates = points.slice().sort((a, b) => priority(b) - priority(a)).slice(0, 32), boxes = [...obstacles, ...[...this.drawnFacilities, ...(this.drawnTowers || [])].map(f => [f.x - f.size / 2 - 2, f.y - f.size / 2 - 2, f.size + 4, f.size + 4])];
    for (const p of candidates) {
      if (this.labels.length >= (w < 600 ? 7 : 14)) break; if (p.row.population < 500 && !this.targetIds.has(p.row.id) && !this.previewIds.has(p.row.id) && p.row.id !== this.selectedId) continue;
      const at = this.camera.worldToScreen(p), selected = p.row.id === this.selectedId, r = displayPointRadius(p.row.population, this.camera.zoom, this.pointPriority(p)) + 8; let text = String(p.row.name || this.translate('Без названия')); c.font = `${selected ? '700' : '600'} 12px system-ui, sans-serif`;
      while (text.length > 4 && c.measureText(text).width > 146) text = text.slice(0, -2) + '…'; const width = c.measureText(text).width + 14;
      const variants = [[r, -12], [-width - r, -12], [-width / 2, r], [-width / 2, -24 - r]];
      for (const [dx, dy] of variants) { const box = [at.x + dx, at.y + dy, width, 24]; if (box[0] < 4 || box[1] < 4 || box[0] + width > w - 4 || box[1] + 24 > h - 4 || boxes.some(b => intersects(b, box, 3))) continue;
        if (points.some(q => { const s = this.camera.worldToScreen(q), rr = displayPointRadius(q.row.population, this.camera.zoom, this.pointPriority(q)) + 3; return s.x + rr > box[0] && s.x - rr < box[0] + width && s.y + rr > box[1] && s.y - rr < box[1] + 24; })) continue;
        this.labels.push({point: p, dx, dy, width, text, selected}); boxes.push(box); break;
      }
    }
  }
  pick(point) {
    if (!this.world) return;
    if (this.activeTool === 'tower') { const guide = this.guidance?.locked && this.guidance.coordinate, at = guide && this.screen(guide); this.onPlace(at && Math.hypot(point.x - at.x, point.y - at.y) <= 22 ? coordinates(guide) : unproject(this.camera.screenToWorld(point))); return; }
    const w = this.camera.screenToWorld(point), reach = Math.max(22, MAX_POINT_RADIUS + 8) / this.camera.scale;
    const candidates = this.index.query(w.x - reach, w.y - reach, w.x + reach, w.y + reach).map(p => ({...p, screen: this.camera.worldToScreen(p), priority: this.pointPriority(p)})).map(p => ({...p, radius: displayPointRadius(p.row.population, this.camera.zoom, p.priority), distance: Math.hypot(p.screen.x - point.x, p.screen.y - point.y)})).filter(p => p.distance <= Math.max(22, p.radius + 8)).sort((a, b) => a.distance - b.distance || b.priority - a.priority || a.row.id.localeCompare(b.row.id));
    // A source point wins if directly touched. Facility targets do not steal its larger accessible hit zone.
    const direct = candidates.filter(p => p.distance <= p.radius + (p.priority === 4 ? 7 : p.priority >= 2 ? 4 : 2)).sort((a, b) => b.priority - a.priority || a.distance - b.distance || a.row.id.localeCompare(b.row.id))[0];
    if (!direct) { const facility = this.facilityLayout.filter(f => !f.ghost).map(f => ({f, rect: this.facilityRect(f)})).map(x => ({...x, d: Math.hypot(point.x - x.rect.x, point.y - x.rect.y)})).filter(x => x.d <= Math.max(22, x.rect.size / 2)).sort((a, b) => a.d - b.d)[0]; if (facility) { this.onSelect(facility.f.point.row, facility.f.id, []); return; } }
    const first = direct || candidates[0];
    if (!first) {
      if (this.scenario?.version === 5 && this.activeTool === 'connect' && this.routeFrom && !this.guidance?.locked) { const hit = this.networkHitIndex?.hit(point, this.camera); if (hit) this.onSelectNetwork?.({targetEdge: hit.targetEdge}); }
      return;
    }
    const coincident = this.index.query(first.x, first.y, first.x, first.y).map(p => p.row), alternatives = coincident.length > 1 ? coincident : [];
    if (!alternatives.length && !direct) { const close = candidates.filter(p => p.distance - first.distance < 7).map(p => p.row); if (close.length > 1) alternatives.push(...close); }
    const local = !alternatives.length && usesLayerIcons(this.state, this.scenario) ? (this.localMarkers?.get(first.row.id) || []).filter(f => !f.ghost).map(f => ({f, at: this.facilityRect(f)})).sort((a, b) => Math.hypot(point.x - a.at.x, point.y - a.at.y) - Math.hypot(point.x - b.at.x, point.y - b.at.y) || compareKey(a.f.id, b.f.id))[0]?.f : null;
    this.onSelect(first.row, local?.id || null, alternatives);
  }
  paintEffects(now) {
    const c = this.fx, {width, height} = this.resizeCanvas(this.fxCanvas, c); c.clearRect(0, 0, width, height);
    this.drawnSignals = []; this.effects = this.effects.filter(e => now - e.start < e.duration && e.revision === this.state?.revision && e.layer === this.activeLayer && !this.reducedMotion);
    for (const e of this.effects) {
      const age = now - e.start, travel = clamp((age - 100) / 350, 0, 1), arrival = clamp((age - 450) / 200, 0, 1), color = SERVICE_COLORS[e.layer] || COLORS.preview;
      const facility = e.sourceFacilityId && this.facilityLayout.find(f => f.id === e.sourceFacilityId), source = facility ? this.facilityRect(facility) : this.camera.worldToScreen(e.origin);
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 2;
      if (age < 250) { c.globalAlpha = 1 - age / 250; for (const at of e.origins?.length ? e.origins.map(origin => this.camera.worldToScreen(origin)) : [source]) { c.beginPath(); c.arc(at.x, at.y, 17 + age / 40, 0, TAU); c.stroke(); } }
      const heads = [];
      if (age >= 100 && age < 500) for (const path of e.paths) {
        const head = sampleSignalPath(path, travel); if (!head) continue;
        c.globalAlpha = e.kind === 'radio' ? .35 : .85;
        let previousKind = null;
        for (let i = 0; i <= head.segment; i++) {
          const a = this.camera.worldToScreen(path.points[i]), b = this.camera.worldToScreen(i === head.segment ? head : path.points[i + 1]);
          const kind = e.kind === 'radio' ? 'radio' : path.visualKinds?.[i] || path.kinds?.[i] || 'road';
          if (kind !== previousKind) { if (previousKind !== null) c.stroke(); c.setLineDash(kind === 'radio' ? [3, 5] : routeStrokeDashed(kind) ? [4, 5] : []); c.beginPath(); c.moveTo(a.x, a.y); previousKind = kind; }
          c.lineTo(b.x, b.y);
        }
        c.stroke(); const p = this.camera.worldToScreen(head); c.setLineDash([]);
        c.globalAlpha = .95; if (!this.quality.simpleEffects) { c.shadowColor = color; c.shadowBlur = 7; } c.beginPath(); c.arc(p.x, p.y, e.kind === 'radio' ? 2.5 : 4, 0, TAU); c.fill(); c.shadowBlur = 0;
        heads.push({position: [p.x, p.y], world: [head.x, head.y], segment: head.segment});
      }
      const recipients = [];
      if (age >= 450) { c.globalAlpha = 1 - arrival; for (const id of e.ids.slice(0, 24)) { const p = this.screen(id); if (p) { c.beginPath(); c.arc(p.x, p.y, 11 + arrival * 7, 0, TAU); c.stroke(); recipients.push(id); } } }
      this.drawnSignals.push({kind: e.kind, revision: e.revision, layer: e.layer, phase: age < 100 ? 'source' : age < 450 ? 'travel' : 'recipients', sourceWorld: [e.origin.x, e.origin.y], sourceWorlds: (e.origins || [e.origin]).map(origin => [origin.x, origin.y]), sourceScreen: [source.x, source.y], recipients: e.ids.slice(), drawnRecipients: recipients, heads, routeWorldPaths: e.kind === 'route' ? e.paths.map(path => path.points.map(p => [p.x, p.y])) : [], routeWorld: e.kind === 'route' ? e.paths[0]?.points.map(p => [p.x, p.y]) || [] : [], routeKinds: e.kind === 'route' ? e.paths[0]?.kinds?.slice() || [] : [], routeVisualKinds: e.kind === 'route' ? (e.paths[0]?.visualKinds || e.paths[0]?.kinds)?.slice() || [] : [], ageMs: age});
    }
    c.globalAlpha = 1; c.shadowBlur = 0; c.setLineDash([]);
  }
  panTo(value) { const p = this.resolve(value); if (!p) return; const [x, y, w, h] = this.safeRect(); this.camera.setCenter(p, {x: x + w / 2, y: y + h / 2}); this.labelsDirty = true; }
  zoom(delta) { this.camera.animateZoom(delta, performance.now(), undefined, this.reducedMotion ? 0 : 140); }
  fitFocus(ids = this.focusIds || this.scenario?.targetIds || []) { const points = ids.map(id => this.resolve(id)).filter(Boolean); if (this.guidance?.coordinate) points.push(this.resolve(this.guidance.coordinate)); this.camera.fit(points.filter(Boolean), focusContentRect(this.safeRect())); this.labelsDirty = true; }
  fitAll() { this.camera.fit([...this.points.values()], focusContentRect(this.safeRect()), 13); this.labelsDirty = true; }
  frameRestoredFacility(id) { const f = this.state?.facilities?.find(f => f.id === id || f.settlementId === id); if (f) this.panTo(f.settlementId); }
  setScenic(bool) { this.scenic = Boolean(bool); this.invalidate(); }
  setTheme(name) { this.theme = ['grass', 'snow', 'dry'].includes(name) ? name : 'grass'; this.invalidate(); }
  setReduced(bool) { this.reducedMotion = Boolean(bool); if (bool) { this.effects = []; this.camera.stopTransition(); } this.invalidate(); }
  sceneEvidence() {
    return {schemaVersion: 1, renderer: 'v24-canvas', sceneRaster: {dpr: this.sceneDpr, width: this.canvas.width, height: this.canvas.height, constantDeviceResolution: true, settledFullResolution: !this.camera.moving}, frameId: this.frameId, sceneRevision: this.sceneRevision, camera: this.camera.snapshot(), quality: this.quality.evidence(this.sceneDpr), basemap: this.basemapLayer.evidence(this.camera), routeDisplay: {...this.routeDisplay.evidence(), deferred: this.routeGeometryPending, routes: this.routes.map(r => ({id: r.id, ...routeDisplayEvidence(r.geometry)})), preview: routeDisplayEvidence(this.previewRoute), freshPreview: (this.previewRoutes || []).map(routeDisplayEvidence), network: this.networkEdges?.map(e => ({key: e.key, targetEdge: e.targetEdge.slice()})) || [], drawnNetworkEdges: [...(this.drawnNetworkEdges || [])], hitIndex: this.networkHitIndex?.evidence() || null, preparedNetworkEdges: this.networkCache?.preparedCount || 0}, motion: this.motionEvidence(), activeLayer: this.activeLayer, activeTool: this.activeTool, selectedId: this.selectedId, region: {id: this.world?.region?.id, rowCount: this.world?.rows?.length || 0, indexCount: this.index.records.length}, lod: this.lod, points: structuredClone(this.drawnPoints), facilities: structuredClone(this.drawnFacilities), towers: this.towerGeometry.map(t => ({id: t.id, radiusKm: t.radiusKm, center: this.camera.worldToScreen(t.center)})), towerSymbols: structuredClone(this.drawnTowers || []), towerCache: this.towerCache?.evidence() || null, towerDisplay: {symbolCache: this.towerSymbolCache?.evidence() || null, zoneMode: this.towerZoneMode, initialCoverageFills: this.initialCoverageFills || 0, initialCoverageOutlines: this.initialCoverageOutlines || 0}, focusIds: [...(this.targetIds || [])], previewIds: [...(this.previewIds || [])], previewCoverageIds: [...(this.coverageIds || [])], labels: this.labels.map(l => ({id: l.point.row.id, text: l.text})), guidance: this.guidance ? structuredClone(this.guidance) : null, guidanceVisible: Boolean(this.guidance?.locked && this.guidance.coordinate && !this.preview), layoutCount: this.layoutCount, frameCostsMs: [...this.frameCosts], boundaryRings: this.boundaries.length};
  }
  motionEvidence() { return {destroyed: this.destroyed, hidden: document.hidden, reduced: this.reducedMotion, activeEffects: this.effects.length, signals: structuredClone(this.drawnSignals), cameraTransition: Boolean(this.camera.transition), cameraTransitions: this.camera.transitionCount, cameraInterrupts: this.camera.interruptCount, quality: this.quality.evidence(this.sceneDpr), frames: this.frameId, ownSubscriptions: this.destroyed ? 0 : this.camera.disposers.length + 1, observerActive: !this.destroyed, raf: Boolean(this.raf)}; }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.routeGeometryPending = false; this.onRouteGeometryChange = null; cancelAnimationFrame(this.raf); this.raf = null; this.observer.disconnect(); document.removeEventListener('visibilitychange', this.visibility); this.camera.destroy(); this.basemapLayer.destroy(); this.basemap = null; this.routeDisplay.destroy(); this.previewRoute = this.routeDisplay.path([], this.points); this.routeGeometryPending = false; this.index.clear(); this.points.clear(); this.sourcePoints?.clear(); this.coordinatePoints?.clear(); this.localTowerIds?.clear(); this.effects = []; this.labels = []; this.facilityLayout = []; this.allFacilities = []; this.localMarkers?.clear(); this.localTowers?.clear(); this.routes = []; this.networkEdges = []; this.previewRoutes = []; this.drawnNetworkEdges = []; this.networkCache?.clear(); this.networkHitIndex?.clear(); this.onSelectNetwork = null; this.towerGeometry = []; this.towerSymbolGeometry = []; this.towerCache?.clear(); this.towerSymbolCache?.clear(); this.towerSymbolIds?.clear(); this.towerZoneMode = 'hidden'; this.initialCoverageFills = this.initialCoverageOutlines = 0; this.previewTower = null; this.previewTowers = []; this.boundaries = []; this.drawnPoints = []; this.drawnFacilities = []; this.drawnSignals = []; this.drawnTowers = []; this.focusOutline = []; this.targetIds?.clear(); this.world = this.state = this.preview = this.scenario = this.evaluation = null; this.canvas.remove(); this.fxCanvas.remove(); if (this.originalTabindex === null) this.element.removeAttribute('tabindex'); else this.element.setAttribute('tabindex', this.originalTabindex); }
}
