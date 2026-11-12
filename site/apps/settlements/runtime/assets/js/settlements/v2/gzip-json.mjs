// A static host may serve the compressed bytes or decode Content-Encoding itself.
export async function readGzipJson(response, Decompressor = globalThis.DecompressionStream) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new Response(bytes).json();

  let decompressor;
  if (typeof Decompressor === 'function') {
    try { decompressor = new Decompressor('gzip'); } catch { /* Older browser without gzip support. */ }
  }
  if (decompressor) {
    const stream = new Blob([bytes]).stream().pipeThrough(decompressor);
    return new Response(stream).json();
  }

  const {gunzipSync} = await import('./gzip-fallback.mjs');
  return JSON.parse(new TextDecoder().decode(gunzipSync(bytes)));
}
