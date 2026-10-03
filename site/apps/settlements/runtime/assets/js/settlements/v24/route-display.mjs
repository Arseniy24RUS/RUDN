/** Display-only tracing of the supplied simplified OSM lines. Never a navigation graph.
 * Engine edge IDs, costs, travel times and service recipients are not inputs here.
 * Only identical source vertices connect; crossings and gaps are never inferred.
 */
import {unproject} from './projection.mjs';
import {haversine} from '../v2/engine.mjs';

const WORLD_SIZE = 256 * 2 ** 11, EARTH_CIRCUMFERENCE_KM = 2 * Math.PI * 6371.0088;
export const ROUTE_DISPLAY_LIMITS = Object.freeze({endpointKm: 1, visitedNodes: 4096, cachedEdges: 256, cachedPaths: 64, cachedPathVertices: 8192, graphVertices: 100000});
export const ASSUMED_DRIVE_SPEED_KMH = 50;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const kmPerWorld = p => EARTH_CIRCUMFERENCE_KM / WORLD_SIZE / Math.cosh(Math.PI * (1 - 2 * p.y / WORLD_SIZE));
const now = () => globalThis.performance?.now() || 0;
const point = (x, y) => ({x, y});
const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;

class Heap {
  constructor() { this.items = []; }
  push(item) { const a = this.items; let i = a.length; a.push(item); while (i) { const p = (i - 1) >> 1; if (a[p][0] <= item[0]) break; a[i] = a[p]; i = p; } a[i] = item; }
  pop() { const a = this.items, first = a[0], last = a.pop(); if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++; if (a[c][0] >= last[0]) break; a[i] = a[c]; i = c; } a[i] = last; } return first; }
}

/** Informational estimate along the drawn line, including every conditional part.
 * 50 km/h is an explicit teaching assumption, independent of engine travel times.
 * Empty/invalid geometry has no estimate; coincident endpoints give exactly zero.
 */
export function measureRouteGeometry(route) {
  const {points, kinds} = route || {};
  if (!Array.isArray(points) || points.length < 2 || !Array.isArray(kinds) || kinds.length !== points.length - 1 || points.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) return null;
  let distanceKm = 0, roadKm = 0, connectorKm = 0, fallbackKm = 0, previous = unproject(points[0]);
  for (let i = 1; i < points.length; i++) {
    const next = unproject(points[i]), km = haversine(previous, next); previous = next;
    if (!Number.isFinite(km)) return null;
    distanceKm += km;
    if (kinds[i - 1] === 'road') roadKm += km;
    else if (kinds[i - 1] === 'connector') connectorKm += km;
    else fallbackKm += km;
  }
  const conditionalKm = connectorKm + fallbackKm, hasConditionalSegments = kinds.some(kind => kind !== 'road');
  return Object.freeze({distanceKm, driveMinutes: distanceKm / ASSUMED_DRIVE_SPEED_KMH * 60, assumedSpeedKmh: ASSUMED_DRIVE_SPEED_KMH, roadKm, connectorKm, fallbackKm, conditionalKm, hasConditionalSegments, source: hasConditionalSegments ? kinds.includes('road') ? 'mixed' : 'conditional' : 'road-backed'});
}

function geometry(points, kinds, edges) {
  const cumulative = [0], sections = [];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
    const kind = kinds[i - 1] || 'conditional', last = sections.at(-1);
    if (last?.kind === kind) last.points.push(points[i]);
    else sections.push({kind, points: [points[i - 1], points[i]]});
  }
  return {points, kinds, sections, cumulative, total: cumulative.at(-1) || 0, edges, summary: edges.some(e => e.reason === 'deferred-until-gesture-end') ? null : measureRouteGeometry({points, kinds})};
}

/** Game-layer styling is separate from the source provenance and never assigns a price. */
export function routePresentation(route, {scenario, activeEdges = new Set(), preview = false} = {}) {
  if (scenario?.version !== 2) return route;
  const visualKinds = Array(route.kinds.length).fill('active'), visualEdges = [];
  for (const edge of route.edges) {
    const key = edgeKey(edge.from, edge.to), active = !preview || activeEdges.has(key), roadRequired = scenario.transportPolicy?.roadRequired?.[key];
    if (!active && typeof roadRequired !== 'boolean') throw new Error(`Missing fixed transport policy for preview edge: ${key}`);
    const kind = active ? 'active' : roadRequired ? 'planned-construction' : 'ready-road';
    visualKinds.fill(kind, edge.startSegment, edge.startSegment + edge.segmentCount);
    visualEdges.push({key, kind, active, ...(typeof roadRequired === 'boolean' ? {roadRequired} : {})});
  }
  const visualSections = [];
  for (let i = 0; i < visualKinds.length; i++) {
    const kind = visualKinds[i], last = visualSections.at(-1);
    if (last?.kind === kind) last.points.push(route.points[i + 1]);
    else visualSections.push({kind, points: [route.points[i], route.points[i + 1]]});
  }
  return {...route, visualKinds, visualSections, visualEdges, renderSemantics: 'transport-policy-v2'};
}

export function activeRouteEdges(routes = []) {
  const active = new Set();
  for (const route of routes) { const path = route.path || [route.from, route.to]; for (let i = 1; i < path.length; i++) active.add(edgeKey(path[i - 1], path[i])); }
  return active;
}

export function routeStrokeDashed(kind) { return !['road', 'active', 'ready-road'].includes(kind); }

/** One active region; compact adjacency and bounded edge cache; no timers or requests. */
export class RouteDisplay {
  constructor({offline} = {}) {
    this.maxVisitedNodes = ROUTE_DISPLAY_LIMITS.visitedNodes;
    if (offline?.maxVisitedNodes !== undefined) {
      const limit = offline.maxVisitedNodes;
      if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 1)) throw new TypeError('offline.maxVisitedNodes must be a positive integer or Infinity');
      this.maxVisitedNodes = limit;
    }
    this.setSource(null);
  }
  setSource(index, regionId = null) {
    this.index = index; this.regionId = regionId; this.graph = null; this.graphAttempted = false; this.edgeCache = new Map(); this.pathCache = new Map(); this.cachedPathVertices = 0; this.pointsSource = null; this.recordNodes = new Map();
    this.stats = {builds: 0, buildMs: 0, searches: 0, searchMs: 0, maxSearchMs: 0, visitedNodes: 0, cacheHits: 0, pathCacheHits: 0, measurements: 0, snapQueries: 0};
  }
  prepare() {
    if (this.graphAttempted) return;
    this.graphAttempted = true; const started = now(), lookup = new Map(), coords = [], pairs = [], degrees = [];
    for (const record of this.index?.records || []) {
      const ids = new Uint32Array(record.xy.length / 2);
      for (let i = 0; i < ids.length; i++) {
        const x = record.xy[i * 2], y = record.xy[i * 2 + 1], key = `${x},${y}`;
        let id = lookup.get(key);
        if (id === undefined) { id = degrees.length; lookup.set(key, id); coords.push(x, y); degrees.push(0); }
        ids[i] = id;
        if (i && id !== ids[i - 1]) { pairs.push(ids[i - 1], id); degrees[ids[i - 1]]++; degrees[id]++; }
      }
      this.recordNodes.set(record, ids);
      if (degrees.length > ROUTE_DISPLAY_LIMITS.graphVertices) { this.recordNodes.clear(); return; }
    }
    const xy = Float64Array.from(coords), offsets = new Uint32Array(degrees.length + 1);
    for (let i = 0; i < degrees.length; i++) offsets[i + 1] = offsets[i] + degrees[i];
    const cursor = offsets.slice(), neighbors = new Uint32Array(pairs.length), lengths = new Float64Array(pairs.length);
    for (let i = 0; i < pairs.length; i += 2) {
      const a = pairs[i], b = pairs[i + 1], d = Math.hypot(xy[a * 2] - xy[b * 2], xy[a * 2 + 1] - xy[b * 2 + 1]);
      let at = cursor[a]++; neighbors[at] = b; lengths[at] = d; at = cursor[b]++; neighbors[at] = a; lengths[at] = d;
    }
    const components = new Int32Array(degrees.length).fill(-1); let count = 0;
    for (let i = 0; i < degrees.length; i++) {
      if (components[i] >= 0) continue;
      components[i] = count; const pending = [i];
      while (pending.length) { const n = pending.pop(); for (let j = offsets[n]; j < offsets[n + 1]; j++) { const id = neighbors[j]; if (components[id] < 0) { components[id] = count; pending.push(id); } } }
      count++;
    }
    this.graph = {xy, offsets, neighbors, lengths, components, componentCount: count}; this.stats.builds++; this.stats.buildMs += now() - started;
  }
  vertex(id) { const xy = this.graph.xy; return point(xy[id * 2], xy[id * 2 + 1]); }
  nearest(p, limitKm) {
    this.stats.snapQueries++; const factor = kmPerWorld(p), radius = limitKm / factor;
    let best = null, bestDistance = radius;
    for (const record of this.index.query([p.x - radius, p.y - radius, p.x + radius, p.y + radius])) {
      const ids = this.recordNodes.get(record); if (!ids) continue;
      const xy = record.xy;
      for (let i = 1; i < ids.length; i++) {
        const ax = xy[i * 2 - 2], ay = xy[i * 2 - 1], dx = xy[i * 2] - ax, dy = xy[i * 2 + 1] - ay, squared = dx * dx + dy * dy;
        if (!squared) continue;
        const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / squared)), q = point(ax + t * dx, ay + t * dy), d = distance(p, q);
        if (d < bestDistance) { bestDistance = d; best = {a: ids[i - 1], b: ids[i], point: q, connectorKm: d * factor}; }
      }
    }
    return best;
  }
  trace(a, b, maximum) {
    const {offsets, neighbors, lengths, components} = this.graph;
    if (components[a.a] !== components[b.a]) return {reason: 'disconnected-source-lines'};
    const goal = new Map([[b.a, distance(b.point, this.vertex(b.a))], [b.b, distance(b.point, this.vertex(b.b))]]), dist = new Map(), previous = new Map(), heap = new Heap();
    const sameSegment = a.a === b.a && a.b === b.b || a.a === b.b && a.b === b.a;
    let best = sameSegment ? distance(a.point, b.point) : maximum, end = null, visited = 0;
    for (const id of [a.a, a.b]) { const g = distance(a.point, this.vertex(id)); dist.set(id, g); heap.push([g + distance(this.vertex(id), b.point), g, id]); }
    while (heap.items.length) {
      const [estimate, g, n] = heap.pop(); if (dist.get(n) !== g) continue;
      if (estimate >= best) break;
      if (++visited > this.maxVisitedNodes) return {reason: 'search-limit', visited};
      if (goal.has(n) && g + goal.get(n) < best) { best = g + goal.get(n); end = n; }
      for (let i = offsets[n]; i < offsets[n + 1]; i++) {
        const id = neighbors[i], next = g + lengths[i], estimate = next + distance(this.vertex(id), b.point);
        if (estimate < best && next < (dist.get(id) ?? Infinity)) { dist.set(id, next); previous.set(id, n); heap.push([estimate, next, id]); }
      }
    }
    if (end === null) return sameSegment ? {points: [a.point, b.point], visited} : {reason: 'excess-detour-or-incomplete-lines', visited};
    const nodes = []; for (let n = end; n !== undefined; n = previous.get(n)) nodes.push(this.vertex(n));
    return {points: [a.point, ...nodes.reverse(), b.point], visited};
  }
  edge(from, to, points, allowSearch) {
    const key = edgeKey(from, to), forward = from < to;
    let accepted = this.edgeCache.get(key);
    if (accepted) { this.stats.cacheHits++; this.edgeCache.delete(key); this.edgeCache.set(key, accepted); }
    else {
      const a = points.get(forward ? from : to), b = points.get(forward ? to : from);
      accepted = {points: [a, b], kinds: ['conditional'], reason: allowSearch ? 'source-lines-unavailable' : 'deferred-until-gesture-end', source: 'conditional'};
      if (a.x === b.x && a.y === b.y) accepted.reason = 'coincident-endpoints';
      else if (allowSearch && this.index?.records.length) {
        this.prepare(); const started = now(); this.stats.searches++;
        if (this.graph) {
          const direct = distance(a, b), factor = (kmPerWorld(a) + kmPerWorld(b)) / 2, directKm = direct * factor, endpointLimit = Math.min(ROUTE_DISPLAY_LIMITS.endpointKm, Math.max(.2, directKm * .5));
          const left = this.nearest(a, endpointLimit), right = this.nearest(b, endpointLimit);
          if (!left || !right) accepted.reason = 'no-source-road-near-endpoint';
          else {
            const maximum = Math.max(direct * 3, direct + 2 / factor) - distance(a, left.point) - distance(b, right.point), trace = this.trace(left, right, maximum);
            this.stats.visitedNodes += trace.visited || 0;
            if (trace.points) {
              const road = trace.points.filter((p, i, list) => !i || distance(p, list[i - 1]) > 1e-9);
              accepted = {points: [a, ...road, b], kinds: ['connector', ...Array(Math.max(0, road.length - 1)).fill('road'), 'connector'], source: 'road-backed', reason: 'exact-source-vertices', connectorKm: [left.connectorKm, right.connectorKm]};
            } else accepted.reason = trace.reason;
          }
        }
        const elapsed = now() - started; this.stats.searchMs += elapsed; this.stats.maxSearchMs = Math.max(this.stats.maxSearchMs, elapsed);
      }
      if (allowSearch) { this.edgeCache.set(key, accepted); if (this.edgeCache.size > ROUTE_DISPLAY_LIMITS.cachedEdges) this.edgeCache.delete(this.edgeCache.keys().next().value); }
    }
    return forward ? accepted : {...accepted, points: accepted.points.slice().reverse(), kinds: accepted.kinds.slice().reverse(), connectorKm: accepted.connectorKm?.slice().reverse()};
  }
  path(ids, points, {allowSearch = true} = {}) {
    if (!Array.isArray(ids) || ids.length < 2 || typeof points?.get !== 'function' || ids.some(id => !Number.isFinite(points.get(id)?.x) || !Number.isFinite(points.get(id)?.y))) return geometry([], [], []);
    if (this.pointsSource !== points) { this.pointsSource = points; this.edgeCache.clear(); this.pathCache.clear(); this.cachedPathVertices = 0; }
    const key = JSON.stringify(ids), cached = this.pathCache.get(key);
    if (cached) { this.stats.pathCacheHits++; this.pathCache.delete(key); this.pathCache.set(key, cached); return cached; }
    const all = [], kinds = [], edges = [];
    for (let i = 1; i < (ids?.length || 0); i++) {
      const edge = this.edge(ids[i - 1], ids[i], points, allowSearch);
      const startSegment = kinds.length;
      if (!all.length) all.push(edge.points[0]);
      all.push(...edge.points.slice(1)); kinds.push(...edge.kinds);
      edges.push({from: ids[i - 1], to: ids[i], source: edge.source, reason: edge.reason, connectorKm: edge.connectorKm, startSegment, segmentCount: edge.kinds.length});
    }
    const accepted = geometry(all, kinds, edges);
    if (accepted.summary) {
      this.stats.measurements++;
      if (accepted.points.length <= ROUTE_DISPLAY_LIMITS.cachedPathVertices) {
        this.pathCache.set(key, accepted); this.cachedPathVertices += accepted.points.length;
        while (this.pathCache.size > ROUTE_DISPLAY_LIMITS.cachedPaths || this.cachedPathVertices > ROUTE_DISPLAY_LIMITS.cachedPathVertices) {
          const first = this.pathCache.keys().next().value; this.cachedPathVertices -= this.pathCache.get(first).points.length; this.pathCache.delete(first);
        }
      }
    }
    return accepted;
  }
  evidence() {
    const g = this.graph;
    return {regionId: this.regionId, ...this.stats, cachedEdges: this.edgeCache.size, cachedPaths: this.pathCache.size, cachedPathVertices: this.cachedPathVertices, limits: ROUTE_DISPLAY_LIMITS, searchVisitLimit: this.maxVisitedNodes === Infinity ? 'unbounded-offline' : this.maxVisitedNodes, vertices: g?.xy.length / 2 || 0, directedSegments: g?.neighbors.length || 0, components: g?.componentCount || 0, typedArrayBytes: g ? g.xy.byteLength + g.offsets.byteLength + g.neighbors.byteLength + g.lengths.byteLength + g.components.byteLength + [...this.recordNodes.values()].reduce((s, a) => s + a.byteLength, 0) : 0, memoryMeaning: 'exact display graph typed arrays only; object and cache overhead excluded', method: 'nearest source segment; exact shared vertices only; no inferred crossings; simplified visual lines, not verified driveability'};
  }
  destroy() { this.setSource(null); }
}

export function routeDisplayEvidence(route) {
  return {vertices: route.points.length, world: route.points.map(p => [p.x, p.y]), kinds: route.kinds.slice(), edges: route.edges.map(e => ({...e})), roadBackedEdges: route.edges.filter(e => e.source === 'road-backed').length, conditionalEdges: route.edges.filter(e => e.source === 'conditional').length, summary: route.summary ? {...route.summary} : null, renderSemantics: route.renderSemantics || 'legacy-source-lines', visualKinds: (route.visualKinds || route.kinds).slice(), visualEdges: route.visualEdges?.map(e => ({...e})) || []};
}
