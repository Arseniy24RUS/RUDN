/** Display geometry only. Source coordinates and engine distances remain unchanged. */
export const WORLD_ZOOM = 11;
export const WORLD_SIZE = 256 * 2 ** WORLD_ZOOM;
// Same spherical radius as the supplied engine's haversine distance.
export const EARTH_RADIUS_KM = 6371.0088;
const MAX_LAT = 85.0511287798066;
const RAD = Math.PI / 180;
export const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export function coordinates(value) {
  if (Array.isArray(value)) return {lat: value[0], lon: value[1]};
  return {lat: value?.lat, lon: value?.lon ?? value?.lng};
}
export function project(value, wrap = false) {
  let {lat, lon} = coordinates(value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (wrap && lon < 0) lon += 360;
  const sin = Math.sin(clamp(lat, -MAX_LAT, MAX_LAT) * RAD);
  return {x: WORLD_SIZE * (lon + 180) / 360, y: WORLD_SIZE * (.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI))};
}
export function unproject({x, y}) {
  const lon = x / WORLD_SIZE * 360 - 180;
  return {lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / WORLD_SIZE))) / RAD, lon: ((lon + 180) % 360 + 360) % 360 - 180};
}
/** Geodesic display perimeter. Membership comes exclusively from engine preview/evaluation. */
export function circleCoordinates(center, radiusKm = 5.5, segments = 72) {
  const {lat, lon} = coordinates(center), p = lat * RAD, l = lon * RAD, d = radiusKm / EARTH_RADIUS_KM;
  if (![lat, lon, radiusKm].every(Number.isFinite)) return [];
  return Array.from({length: segments + 1}, (_, i) => {
    const b = i / segments * 2 * Math.PI, p2 = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b));
    return {lat: p2 / RAD, lon: ((l + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(p2))) / RAD + 540) % 360 - 180};
  });
}
export function boundaryRings(geo, wrap = false) {
  const out = [];
  function geometry(g) {
    if (!g) return;
    if (g.type === 'FeatureCollection') { for (const f of g.features || []) geometry(f); return; }
    if (g.type === 'Feature') { geometry(g.geometry); return; }
    if (g.type === 'GeometryCollection') { for (const child of g.geometries || []) geometry(child); return; }
    const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const ring of rings || []) {
      const points = ring.map(([lon, lat]) => project({lat, lon}, wrap)).filter(Boolean);
      if (points.length > 1) out.push(points);
    }
  }
  geometry(geo); return out;
}
export class SpatialIndex {
  constructor(records = [], cellSize = 128) {
    this.records = records; this.cellSize = cellSize; this.cells = new Map();
    for (const p of records) { const key = this.key(p.x, p.y); if (!this.cells.has(key)) this.cells.set(key, []); this.cells.get(key).push(p); }
  }
  key(x, y) { return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`; }
  query(left, top, right, bottom) {
    const out = [], s = this.cellSize, x0 = Math.floor(left / s), x1 = Math.floor(right / s), y0 = Math.floor(top / s), y1 = Math.floor(bottom / s);
    const inside = p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.cells.size * 2) return this.records.filter(inside);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const p of this.cells.get(`${x}:${y}`) || []) if (inside(p)) out.push(p);
    return out;
  }
  clear() { this.records = []; this.cells.clear(); }
}
