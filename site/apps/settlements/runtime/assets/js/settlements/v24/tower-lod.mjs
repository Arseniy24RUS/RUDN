/** Display-only detail: never move or remove an engine tower or alter its reach. */
export const isInitialTower = tower => Boolean(tower.settlementId) && String(tower.id).startsWith('initial-tower:');
const order = (a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
const usable = tower => Number.isFinite(tower.center?.x) && Number.isFinite(tower.center?.y);
export const towerSymbolSpacing = size => Math.max(size + 16, size * Math.SQRT2 + 4);

function selectOrdered(towers, scale, size, {enabled = true, priorityIds = new Set(), centeredIds = new Set()} = {}) {
  if (!enabled) return new Set(towers.map(tower => tower.id));
  const distance = towerSymbolSpacing(size), cells = new Map(), visible = new Set();
  // World-anchored screen units deliberately exclude viewport position. A pan
  // cannot change which original geographic anchor represents a dense group.
  const position = tower => ({x: tower.center.x * scale, y: tower.center.y * scale - (centeredIds.has(tower.id) ? 0 : size * 13 / 32)});
  const key = (x, y) => `${x}|${y}`;
  const put = (tower, point) => {
    visible.add(tower.id);
    const cell = key(Math.floor(point.x / distance), Math.floor(point.y / distance));
    if (!cells.has(cell)) cells.set(cell, []);
    cells.get(cell).push(point);
  };
  const fixed = tower => !isInitialTower(tower) || priorityIds.has(tower.settlementId) || priorityIds.has(tower.id);
  // Player/selected towers reserve space before passive representatives. They
  // are never concealed even if the player intentionally builds them together.
  for (const tower of towers) if (fixed(tower)) put(tower, position(tower));
  for (const tower of towers) {
    if (fixed(tower)) continue;
    const point = position(tower), cx = Math.floor(point.x / distance), cy = Math.floor(point.y / distance);
    let blocked = false;
    for (let x = cx - 1; x <= cx + 1 && !blocked; x++) for (let y = cy - 1; y <= cy + 1 && !blocked; y++) {
      blocked = (cells.get(key(x, y)) || []).some(other => (point.x - other.x) ** 2 + (point.y - other.y) ** 2 < distance ** 2);
    }
    if (!blocked) put(tower, point);
  }
  return visible;
}

export function selectTowerSymbols(towers, scale, size, options) {
  return selectOrdered(towers.filter(usable).slice().sort(order), scale, size, options);
}

/** One active region, one scale and one selection; no growing zoom/pan cache. */
export class TowerSymbolCache {
  constructor() { this.computations = 0; this.clear(); }
  select(towers, scale, size, {enabled = true, priorityIds = new Set(), centeredIds} = {}) {
    const priorityKey = [...priorityIds].sort().join('|');
    const sourceChanged = towers !== this.source;
    if (sourceChanged) { this.source = towers; this.ordered = towers.filter(usable).slice().sort(order); }
    if (sourceChanged || scale !== this.scale || size !== this.size || enabled !== this.enabled || priorityKey !== this.priorityKey || centeredIds !== this.centeredIds) {
      Object.assign(this, {scale, size, enabled, priorityKey, centeredIds});
      this.ids = selectOrdered(this.ordered, scale, size, {enabled, priorityIds, centeredIds});
      this.computations++;
    }
    return this.ids;
  }
  clear() { this.source = null; this.ordered = []; this.ids = new Set(); this.scale = this.size = this.enabled = this.priorityKey = this.centeredIds = undefined; }
  evidence() { return {sourceCount: this.ordered.length, representativeCount: this.ids.size, computations: this.computations}; }
}

/** Same-winding source rings with one nonzero fill form their exact union.
 * Reuse native geometry across pans/previews and avoid overlap darkening.
 */
export function initialCoveragePath(towers, previous = null) {
  const initial = towers.filter(tower => isInitialTower(tower) && usable(tower));
  if (previous && initial.length === previous.sources.length && initial.every((tower, i) => tower.path === previous.sources[i])) return previous;
  if (!initial.length || typeof globalThis.Path2D !== 'function' || !initial.every(tower => tower.path)) return null;
  const path = new Path2D(), center = initial[0].center;
  const bounds = {left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity};
  for (const tower of initial) {
    if (typeof path.addPath === 'function' && typeof globalThis.DOMMatrix === 'function') {
      path.addPath(tower.path, new DOMMatrix().translate(tower.center.x - center.x, tower.center.y - center.y));
    } else {
      for (const [i, point] of tower.ring.entries()) i ? path.lineTo(point.x - center.x, point.y - center.y) : path.moveTo(point.x - center.x, point.y - center.y);
      path.closePath();
    }
    bounds.left = Math.min(bounds.left, tower.bounds.left); bounds.top = Math.min(bounds.top, tower.bounds.top);
    bounds.right = Math.max(bounds.right, tower.bounds.right); bounds.bottom = Math.max(bounds.bottom, tower.bounds.bottom);
  }
  return {path, center, bounds, sources: initial.map(tower => tower.path)};
}
