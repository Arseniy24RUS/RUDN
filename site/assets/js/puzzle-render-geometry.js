/* Display geometry only. The source topology and saved attempts stay immutable. */
(() => {
  "use strict";
  const MAX_ERROR = 0.35;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const arcId = value => value < 0 ? ~value : value;

  function computeLayout(width, height, fullscreen, viewportWidth, viewportHeight) {
    const margin = 10, gap = 12;
    const side = fullscreen && viewportWidth > viewportHeight && viewportHeight <= 520;
    let tray, map;
    if (side) {
      const trayWidth = Math.min(Math.max(1, width - margin * 2 - gap - 60), clamp(width * 0.25, 144, 224));
      tray = { x: width - margin - trayWidth, y: margin, width: trayWidth, height: Math.max(1, height - margin * 2) };
      map = { x: margin, y: margin, width: Math.max(1, tray.x - gap - margin), height: tray.height };
    } else {
      const trayHeight = Math.min(150, height * 0.46, Math.max(82, height * 0.22));
      tray = { x: margin, y: height - trayHeight - margin, width: Math.max(1, width - margin * 2), height: trayHeight };
      map = { x: margin, y: margin, width: tray.width, height: Math.max(1, tray.y - gap - margin) };
    }
    return { side, map, tray };
  }

  function segmentDistanceSquared(x, y, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1) : 0;
    return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
  }

  // The Douglas–Peucker hierarchy is computed once per projection. Filtering
  // its importance values produces nested levels with a bounded screen error;
  // pinch frames do not repeatedly traverse the full simplification tree.
  function importanceFor(xy, protectedPoints, minimumSquared) {
    const count = xy.length / 2, importance = new Float64Array(count);
    const protectedIndices = [];
    for (let i = 0; i < count; i += 1) if (i === 0 || i === count - 1 || protectedPoints[i]) {
      importance[i] = Infinity;
      protectedIndices.push(i);
    }
    const stack = [];
    for (let i = 1; i < protectedIndices.length; i += 1) stack.push([protectedIndices[i - 1], protectedIndices[i], Infinity]);
    while (stack.length) {
      const [first, last, ceiling] = stack.pop();
      let farthest = -1, distance = 0;
      for (let i = first + 1; i < last; i += 1) {
        const value = segmentDistanceSquared(xy[i * 2], xy[i * 2 + 1], xy[first * 2], xy[first * 2 + 1], xy[last * 2], xy[last * 2 + 1]);
        if (value > distance) { distance = value; farthest = i; }
      }
      if (farthest < 0 || distance <= minimumSquared) continue;
      const value = Math.min(ceiling, distance);
      importance[farthest] = value;
      if (farthest - first > 1) stack.push([first, farthest, value]);
      if (last - farthest > 1) stack.push([farthest, last, value]);
    }
    return importance;
  }

  function createTopologyRenderer({ topology, objectKey, featureIds, project, seamWidth, maxScale = 128, Path = globalThis.Path2D }) {
    if (topology?.type !== "Topology" || !Array.isArray(topology.arcs) || !Path) return null;
    const object = topology.objects?.[objectKey];
    const geometries = object?.type === "GeometryCollection" ? object.geometries : object ? [object] : [];
    const byId = new Map(geometries.map((geometry, index) => [String(geometry.id ?? geometry.properties?.id ?? `feature-${index + 1}`), geometry]));
    const selected = featureIds.map(id => byId.get(String(id)));
    if (selected.some(geometry => !geometry || !["Polygon", "MultiPolygon"].includes(geometry.type))) return null;
    const ringsFor = geometry => geometry.type === "Polygon" ? geometry.arcs : geometry.arcs.flat();
    const rings = selected.flatMap(ringsFor);
    const transform = topology.transform;
    const maximumBucket = 2 ** Math.ceil(Math.log2(Math.max(0.5, maxScale)));
    const minimumSquared = (MAX_ERROR / maximumBucket) ** 2;
    const arcs = topology.arcs.map(source => {
      const xy = new Float64Array(source.length * 2), meridian = new Uint8Array(source.length), protectedPoints = new Uint8Array(source.length);
      let x = 0, y = 0;
      source.forEach((coordinate, index) => {
        if (transform) { x += coordinate[0]; y += coordinate[1]; } else { x = coordinate[0]; y = coordinate[1]; }
        const longitude = transform ? x * transform.scale[0] + transform.translate[0] : x;
        const latitude = transform ? y * transform.scale[1] + transform.translate[1] : y;
        const point = project([longitude, latitude]);
        if (!point?.every(Number.isFinite)) throw new Error("Non-finite projected topology");
        xy[index * 2] = point[0]; xy[index * 2 + 1] = point[1];
        meridian[index] = Math.abs(Math.abs(longitude) - 180) < 1e-6 ? 1 : 0;
        if (index && (meridian[index] !== meridian[index - 1] || Math.abs(point[0] - xy[(index - 1) * 2]) > seamWidth / 2)) {
          protectedPoints[index] = protectedPoints[index - 1] = 1;
        }
      });
      return { xy, meridian, importance: importanceFor(xy, protectedPoints, minimumSquared), full: Uint32Array.from({ length: source.length }, (_, index) => index) };
    });
    const visitRing = (ring, indices, visit) => {
      for (const reference of ring) {
        const id = arcId(reference), arc = arcs[id], retained = indices[id];
        if (reference >= 0) for (const index of retained) visit(arc.xy[index * 2], arc.xy[index * 2 + 1], arc.meridian[index]);
        else for (let offset = retained.length - 1; offset >= 0; offset -= 1) {
          const index = retained[offset]; visit(arc.xy[index * 2], arc.xy[index * 2 + 1], arc.meridian[index]);
        }
      }
    };
    const ringShape = (ring, indices) => {
      let firstX, firstY, previousX, previousY, area = 0, started = false;
      const distinct = [];
      visitRing(ring, indices, (x, y) => {
        if (!started) { firstX = x; firstY = y; }
        if (distinct.length < 3 && !distinct.some(point => point[0] === x && point[1] === y)) distinct.push([x, y]);
        if (started) area += (previousX - firstX) * (y - firstY) - (x - firstX) * (previousY - firstY);
        previousX = x; previousY = y; started = true;
      });
      return { area, distinct: distinct.length };
    };
    const full = arcs.map(arc => arc.full);
    const originalShapes = rings.map(ring => ringShape(ring, full));
    const levels = new Map();
    const fullPaths = new Map();
    const bucketFor = scale => 2 ** Math.ceil(Math.log2(Math.max(0.5, scale)));
    function levelFor(scale) {
      const bucket = bucketFor(scale);
      if (levels.has(bucket)) {
        const cached = levels.get(bucket); levels.delete(bucket); levels.set(bucket, cached); return cached;
      }
      const tolerance = MAX_ERROR / bucket, threshold = tolerance ** 2;
      const indices = arcs.map(arc => bucket > maximumBucket ? arc.full : arc.full.filter(index => arc.importance[index] > threshold));
      const restored = new Set();
      let changed;
      do {
        changed = false;
        rings.forEach((ring, index) => {
          const original = originalShapes[index], shape = ringShape(ring, indices);
          if (original.distinct < 3 || !original.area || (shape.distinct >= 3 && shape.area * original.area > 0 && Math.abs(shape.area) >= Math.abs(original.area) * 0.05)) return;
          // Restore the entire incident arcs, not just one polygon, so a small
          // district and all its neighbours keep exactly the same boundary.
          for (const reference of ring) {
            const id = arcId(reference);
            if (!restored.has(id)) { restored.add(id); indices[id] = arcs[id].full; changed = true; }
          }
        });
      } while (changed);
      const level = { bucket, tolerance, indices, paths: new Map(), retained: indices.reduce((sum, values) => sum + values.length, 0) };
      levels.set(bucket, level);
      while (levels.size > 3) levels.delete(levels.keys().next().value);
      return level;
    }
    function build(index, indices) {
      const path = new Path(), strokePath = new Path();
      for (const ring of ringsFor(selected[index])) {
        let first = null, previous = null;
        visitRing(ring, indices, (x, y, meridian) => {
          const point = { x, y, meridian };
          if (!first) { first = point; path.moveTo(x, y); strokePath.moveTo(x, y); }
          else if (previous.x !== x || previous.y !== y) {
            if (Math.abs(x - previous.x) > seamWidth / 2) { path.closePath(); path.moveTo(x, y); strokePath.moveTo(x, y); }
            else { path.lineTo(x, y); if (previous.meridian && meridian) strokePath.moveTo(x, y); else strokePath.lineTo(x, y); }
          }
          previous = point;
        });
        if (first) {
          path.closePath();
          if (Math.abs(previous.x - first.x) <= seamWidth / 2 && !(previous.meridian && first.meridian)) strokePath.lineTo(first.x, first.y);
        }
      }
      return { path, strokePath };
    }
    return {
      get(index, scale) {
        const level = levelFor(scale);
        if (!level.paths.has(index)) level.paths.set(index, build(index, level.indices));
        return level.paths.get(index);
      },
      getFull(index) {
        if (!fullPaths.has(index)) fullPaths.set(index, build(index, full));
        const result = fullPaths.get(index);
        fullPaths.delete(index); fullPaths.set(index, result);
        while (fullPaths.size > 3) fullPaths.delete(fullPaths.keys().next().value);
        return result;
      },
      diagnostics() { return { sourceVertices: full.reduce((sum, values) => sum + values.length, 0), levels: [...levels.values()].map(level => ({ bucket: level.bucket, tolerance: level.tolerance, retained: level.retained, paths: level.paths.size })), fullPaths: fullPaths.size }; },
      // Read-only copies used by geometric error tests; never used to mutate a game.
      inspectLevel(scale) { const level = levelFor(scale); return { bucket: level.bucket, tolerance: level.tolerance, arcs: arcs.map((arc, index) => ({ xy: Array.from(arc.xy), indices: Array.from(level.indices[index]) })) }; },
    };
  }
  globalThis.RudnPuzzleGeometry = Object.freeze({ computeLayout, createTopologyRenderer, maxError: MAX_ERROR });
})();
