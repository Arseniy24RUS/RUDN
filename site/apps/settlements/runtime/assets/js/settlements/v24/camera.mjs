import {WORLD_ZOOM, clamp} from './projection.mjs';

/** Largest HUD-free rectangle, including small floating controls rather than only full-width panels. */
export function largestFreeRect(width, height, obstacles = [], margin = 8, gap = 8) {
  const left = margin, top = margin, right = Math.max(left + 1, width - margin), bottom = Math.max(top + 1, height - margin);
  const blocked = obstacles.map(([x, y, w, h]) => [Math.max(left, x - gap), Math.max(top, y - gap), Math.min(right, x + w + gap), Math.min(bottom, y + h + gap)]).filter(([x, y, r, b]) => r > x && b > y);
  const ys = [...new Set([top, bottom, ...blocked.flatMap(b => [b[1], b[3]])])].sort((a, b) => a - b);
  let best = null, bestArea = 0;
  for (let i = 0; i < ys.length - 1; i++) for (let j = i + 1; j < ys.length; j++) {
    const y = ys[i], h = ys[j] - y, ranges = blocked.filter(b => b[1] < ys[j] && b[3] > y).map(b => [b[0], b[2]]).sort((a, b) => a[0] - b[0]);
    let x = left;
    for (const [a, b] of [...ranges, [right, right]]) {
      if (a > x && (a - x) * h > bestArea) { best = [x, y, a - x, h]; bestArea = (a - x) * h; }
      x = Math.max(x, b);
    }
  }
  return best || [left, top, right - left, bottom - top];
}

/** Screen-space reserve for a 44px target and a neighbouring 24px label. */
export function focusContentRect(rect) {
  const [x, y, width, height] = rect, px = Math.min(44, width * .2), py = Math.min(44, height * .2);
  return [x + px, y + py, Math.max(1, width - px * 2), Math.max(1, height - py * 2)];
}

function reachedDragThreshold(pointer, point) {
  const dx = point.x - pointer.start.x, dy = point.y - pointer.start.y;
  return pointer.pointerType === 'mouse' ? Math.abs(dx) + Math.abs(dy) >= 3 : Math.hypot(dx, dy) >= 5;
}

/** Single display camera. No engine calls, second animation loop, inertia, or geographic rounding. */
export class Camera2D {
  constructor({width = 1, height = 1, zoom = 11, minZoom = 3, maxZoom = 17, onChange = () => {}, onTap = () => {}, onGestureEnd = () => {}} = {}) {
    Object.assign(this, {width, height, minZoom, maxZoom, onChange, onTap, onGestureEnd});
    this.scale = 2 ** (clamp(zoom, minZoom, maxZoom) - WORLD_ZOOM); this.ox = 0; this.oy = 0;
    this.pointers = new Map(); this.disposers = []; this.moving = false; this.destroyed = false; this.revision = 0; this.wheelTimer = null; this.transition = null; this.transitionCount = 0; this.interruptCount = 0;
  }
  get zoom() { return WORLD_ZOOM + Math.log2(this.scale); }
  snapshot() { return {ox: this.ox, oy: this.oy, scale: this.scale, zoom: this.zoom, width: this.width, height: this.height, moving: this.moving, revision: this.revision, transition: this.transition ? {toZoom: this.transition.toZoom, start: this.transition.start, duration: this.transition.duration} : null}; }
  worldToScreen(p) { return {x: (p.x - this.ox) * this.scale, y: (p.y - this.oy) * this.scale}; }
  screenToWorld(p) { return {x: this.ox + p.x / this.scale, y: this.oy + p.y / this.scale}; }
  changed() { if (!this.destroyed) { this.revision++; this.onChange(this.snapshot()); } }
  setViewport(width, height) {
    if (width === this.width && height === this.height) return;
    this.stopTransition();
    const center = this.screenToWorld({x: this.width / 2, y: this.height / 2});
    this.width = Math.max(1, width); this.height = Math.max(1, height); this.ox = center.x - this.width / 2 / this.scale; this.oy = center.y - this.height / 2 / this.scale; this.changed();
  }
  setCenter(p, at = {x: this.width / 2, y: this.height / 2}) { this.stopTransition(); this.ox = p.x - at.x / this.scale; this.oy = p.y - at.y / this.scale; this.changed(); }
  panBy(dx, dy) { this.stopTransition(); this.ox -= dx / this.scale; this.oy -= dy / this.scale; this.changed(); }
  zoomBy(delta, anchor = {x: this.width / 2, y: this.height / 2}) {
    this.stopTransition();
    const p = this.screenToWorld(anchor), next = 2 ** (clamp(this.zoom + delta, this.minZoom, this.maxZoom) - WORLD_ZOOM);
    if (next === this.scale) return;
    this.scale = next; this.ox = p.x - anchor.x / next; this.oy = p.y - anchor.y / next; this.changed();
  }
  pinch(fromCenter, toCenter, ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    this.stopTransition();
    const fixed = this.screenToWorld(fromCenter);
    this.scale = 2 ** (clamp(this.zoom + Math.log2(ratio), this.minZoom, this.maxZoom) - WORLD_ZOOM);
    this.ox = fixed.x - toCenter.x / this.scale; this.oy = fixed.y - toCenter.y / this.scale; this.changed();
  }
  fit(points, rect = [32, 32, this.width - 64, this.height - 64], maxZoom = 13.5) {
    if (!points.length) return;
    this.stopTransition();
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const p of points) { left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); bottom = Math.max(bottom, p.y); }
    const [x, y, width, height] = rect, desired = Math.min(Math.max(1, width) / Math.max(1, right - left), Math.max(1, height) / Math.max(1, bottom - top));
    this.scale = clamp(desired, 2 ** (this.minZoom - WORLD_ZOOM), 2 ** (Math.min(maxZoom, this.maxZoom) - WORLD_ZOOM));
    this.ox = (left + right) / 2 - (x + width / 2) / this.scale; this.oy = (top + bottom) / 2 - (y + height / 2) / this.scale; this.changed();
  }
  /** The caller owns time and requestAnimationFrame. Button transitions never start a second loop. */
  animateZoom(delta, now, anchor = {x: this.width / 2, y: this.height / 2}, duration = 140) {
    this.tick(now); const toZoom = clamp((this.transition?.toZoom ?? this.zoom) + delta, this.minZoom, this.maxZoom);
    if (duration <= 0) { this.zoomBy(toZoom - this.zoom, anchor); return; }
    if (Math.abs(toZoom - this.zoom) < 1e-10) { this.stopTransition(); return; }
    this.transition = {fromZoom: this.zoom, toZoom, anchor: {...anchor}, fixed: this.screenToWorld(anchor), start: now, duration};
    this.transitionCount++; this.moving = true; this.changed();
  }
  tick(now) {
    const a = this.transition; if (!a) return false;
    const t = clamp((now - a.start) / a.duration, 0, 1), z = a.fromZoom + (a.toZoom - a.fromZoom) * (1 - (1 - t) ** 3);
    this.scale = 2 ** (z - WORLD_ZOOM); this.ox = a.fixed.x - a.anchor.x / this.scale; this.oy = a.fixed.y - a.anchor.y / this.scale;
    if (t === 1) { this.transition = null; this.moving = false; this.onGestureEnd(this.snapshot()); }
    this.changed(); return Boolean(this.transition);
  }
  stopTransition() { if (!this.transition) return; this.transition = null; this.interruptCount++; this.finishGesture(); }
  finishGesture() {
    if (!this.moving) return;
    this.moving = false; this.onGestureEnd(this.snapshot()); this.changed();
  }
  attach(element) {
    this.element = element; this.originalTouchAction = element.style.touchAction; element.style.touchAction = 'none';
    const point = e => { const r = element.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
    const listen = (type, fn, options) => { element.addEventListener(type, fn, options); this.disposers.push(() => element.removeEventListener(type, fn, options)); };
    const pair = () => { const [a, b] = [...this.pointers.values()]; return b ? {center: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, distance: Math.hypot(a.x - b.x, a.y - b.y)} : null; };
    listen('pointerdown', e => {
      if (e.button !== 0 && e.pointerType !== 'touch') return;
      this.stopTransition();
      clearTimeout(this.wheelTimer); this.wheelTimer = null;
      const p = point(e); this.pointers.set(e.pointerId, {...p, start: p, pointerType: e.pointerType, moved: false});
      if (this.pointers.size > 1) for (const pointer of this.pointers.values()) pointer.moved = true;
      try { element.setPointerCapture(e.pointerId); } catch {}
      element.focus({preventScroll: true}); this.moving = true; this.changed();
    });
    listen('pointermove', e => {
      const old = this.pointers.get(e.pointerId); if (!old) return;
      const before = pair(), p = point(e), moved = old.moved || reachedDragThreshold(old, p);
      this.pointers.set(e.pointerId, {...old, ...p, moved});
      const after = pair();
      if (before && after && before.distance > 0) this.pinch(before.center, after.center, after.distance / before.distance);
      else if (moved) this.panBy(p.x - (old.moved ? old.x : old.start.x), p.y - (old.moved ? old.y : old.start.y));
    });
    const end = (e, cancelled = false) => {
      const old = this.pointers.get(e.pointerId); if (!old) return;
      const p = point(e), tap = !cancelled && !old.moved && this.pointers.size === 1 && !reachedDragThreshold(old, p);
      this.pointers.delete(e.pointerId);
      try { if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId); } catch {}
      if (!this.pointers.size) this.finishGesture();
      if (tap) this.onTap(p);
    };
    listen('pointerup', e => end(e)); listen('pointercancel', e => end(e, true)); listen('lostpointercapture', e => { if (this.pointers.has(e.pointerId)) end(e, true); });
    listen('wheel', e => {
      e.preventDefault(); const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1;
      this.stopTransition();
      this.moving = true; this.zoomBy(clamp(-e.deltaY * unit / 120, -1.25, 1.25), point(e));
      clearTimeout(this.wheelTimer); this.wheelTimer = setTimeout(() => { this.wheelTimer = null; this.finishGesture(); }, 120);
    }, {passive: false});
    listen('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) { this.stopTransition(); this.onTap({x: this.width / 2, y: this.height / 2}); } return; }
      const d = {'ArrowLeft': [60, 0], 'ArrowRight': [-60, 0], 'ArrowUp': [0, 60], 'ArrowDown': [0, -60]}[e.key];
      if (d) { e.preventDefault(); this.panBy(...d); this.onGestureEnd(this.snapshot()); }
      else if (['+', '=', '-', '_'].includes(e.key)) { e.preventDefault(); this.zoomBy(e.key === '-' || e.key === '_' ? -.75 : .75); this.onGestureEnd(this.snapshot()); }
    });
    return this;
  }
  cancel() { this.stopTransition(); const ids = [...this.pointers.keys()]; this.pointers.clear(); for (const id of ids) { try { if (this.element?.hasPointerCapture(id)) this.element.releasePointerCapture(id); } catch {} } clearTimeout(this.wheelTimer); this.wheelTimer = null; this.finishGesture(); }
  destroy() { this.cancel(); this.destroyed = true; for (const off of this.disposers) off(); this.disposers = []; if (this.element) this.element.style.touchAction = this.originalTouchAction; this.element = null; }
}
