import {readSettlementsResource} from '../v2/network.mjs';
import {readGzipJson} from '../v2/gzip-json.mjs';

export async function fetchSocialPlan(url, {signal, fetchImpl, Decompressor} = {}) {
  const read = response => readGzipJson(response, Decompressor);
  if (url.protocol === 'file:') {
    const {readFile} = await import('node:fs/promises');
    return read(new Response(await readFile(url, {signal})));
  }
  return readSettlementsResource(url, {signal, fetchImpl, read});
}
