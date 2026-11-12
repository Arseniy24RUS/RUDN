import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';

export async function readSettlementsJson(file) {
  const bytes = await readFile(file);
  const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  return JSON.parse(decoded.toString('utf8').replace(/^\uFEFF/, ''));
}
