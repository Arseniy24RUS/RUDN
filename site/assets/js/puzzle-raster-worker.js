/* Exact active-piece preparation. No game state, network or geometry algorithms. */
"use strict";
const supported = typeof OffscreenCanvas === "function" && typeof Path2D === "function"
  && typeof createImageBitmap === "function";
postMessage({ type: "capability", supported });

function replay(commands) {
  const path = new Path2D();
  let ring = new Path2D();
  for (let i = 0; i < commands.length; i += 3) {
    const operation = commands[i];
    if (operation === 0) ring.moveTo(commands[i + 1], commands[i + 2]);
    else if (operation === 1) ring.lineTo(commands[i + 1], commands[i + 2]);
    else if (operation === 2) ring.closePath();
    else { path.addPath(ring); ring = new Path2D(); }
  }
  path.addPath(ring);
  return path;
}

onmessage = async ({ data }) => {
  const { id, variants, dpr, fillRule, fill, stroke } = data;
  let canvas;
  const results = [];
  try {
    if (!supported || variants.reduce((sum, item) => sum + item.width * item.height * 4, 0) > 2 * 1024 * 1024
      || fill.byteLength + stroke.byteLength > 8 * 1024 * 1024) throw new Error("Raster budget exceeded");
    const begin = performance.now();
    const path = replay(fill), border = replay(stroke), built = performance.now();
    for (const { width, height, x0, y0, scale } of variants) {
      canvas = new OffscreenCanvas(width, height);
      // Every preparation reads the full raster back. Request a context suited
      // to CPU readback to reduce contention with the shared GPU/compositor.
      const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
      if (!context) throw new Error("Canvas unavailable");
      context.setTransform(dpr * scale, 0, 0, dpr * scale, -x0, -y0);
      context.fillStyle = "#dc3f45"; context.strokeStyle = "#8e2028";
      context.lineWidth = 1.2 / scale; context.lineJoin = context.lineCap = "round";
      context.fill(path, fillRule); context.stroke(border);
      // A bitmap made directly from canvas may defer tessellation to its first
      // draw on the main thread. Materialize pixels here before transferring.
      const pixels = context.getImageData(0, 0, width, height);
      const bitmap = await createImageBitmap(pixels);
      results.push({ scale, bitmap });
      canvas.width = canvas.height = 0;
    }
    postMessage({ type: "ready", id, results, fill, stroke, buildMs: built - begin, rasterMs: performance.now() - built,
      workerMs: performance.now() - begin }, [...results.map(result => result.bitmap), fill.buffer, stroke.buffer]);
  } catch (_) {
    if (canvas) canvas.width = canvas.height = 0;
    results.forEach(result => result.bitmap.close());
    postMessage({ type: "failed", id, fill, stroke }, [fill.buffer, stroke.buffer]);
  }
};
