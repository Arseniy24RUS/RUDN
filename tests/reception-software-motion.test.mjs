import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInThisContext} from 'node:vm';
import {isMainThread, parentPort, Worker, workerData} from 'node:worker_threads';
import {readActorWebM} from '../site/apps/reception/ai/actor-webm.js';
import {createSoftwareFrameDecoder} from '../site/apps/reception/ai/software-motion.js';

const assets = new URL('../site/apps/reception/assets/gfx1/motion/', import.meta.url);
const actorIDs = [...Array.from({length:24}, (_, i) => 'C' + String(i+1).padStart(2, '0')), 'S03', 'S04'];
const readActor = actor => readFileSync(new URL(actor + '.webm', assets));

class ClassicWorker {
  constructor(url) {
    this.thread = new Worker(new URL(import.meta.url), {workerData: url});
    this.thread.on('message', data => this.onmessage({data}));
    this.thread.on('error', error => this.onerror(error));
  }
  postMessage(...args) { this.thread.postMessage(...args); }
  terminate() { this.thread.terminate(); }
}

if (!isMainThread) {
  // Run the deployed classic worker and unmodified WASM in a real worker
  // thread. Only the browser's script loading and file fetch are adapted.
  globalThis.self = globalThis;
  globalThis.process = undefined;
  globalThis.location = {href: workerData};
  globalThis.importScripts = url => runInThisContext(readFileSync(new URL(url), 'utf8'));
  globalThis.fetch = async url => new Response(readFileSync(new URL(url)));
  globalThis.postMessage = (...args) => parentPort.postMessage(...args);
  runInThisContext(readFileSync(new URL(workerData), 'utf8'));
  parentPort.on('message', data => self.onmessage({data}));
} else {
  test('the complete authored Reception bank has 240 paired VP9 frames per actor', () => {
    for (const actor of actorIDs) {
      const {width, height, interval, samples} = readActorWebM(readActor(actor));
      assert.deepEqual([width, height, samples.length], [800, 1088, 240], actor);
      assert.ok(Math.abs(interval - 1000 / 24) < 0.00001, actor);
      assert.equal(samples[0].timestamp, 0, actor);
      assert.equal(samples.at(-1).timestamp, 9958000, actor);
      assert.ok(samples[0].key && samples.every(sample => sample.color.length && sample.alpha.length), actor);
      assert.ok(samples.slice(1).every((sample, i) => sample.timestamp > samples[i].timestamp), actor);
    }
  });

  test('the software worker decodes and recycles a complete transparent Reception loop', {timeout:20000}, async () => {
    const {samples} = readActorWebM(readActor('C03'));
    const view = {Worker: ClassicWorker, WebAssembly, setTimeout, clearTimeout};
    const decoder = await createSoftwareFrameDecoder(view, null);
    const hashes = new Set();
    let initialHash;
    try {
      for (const sample of [...samples, samples[0]]) {
        const frame = await decoder.decodePair(sample);
        assert.deepEqual([frame.color.format.cropWidth, frame.color.format.cropHeight], [800, 1088]);
        const mask = frame.alpha.y;
        assert.equal(mask.bytes[0], 0, 'the background stays transparent');
        assert.equal(mask.bytes[544 * mask.stride + 400], 255, 'the torso stays opaque');
        const hash = createHash('sha256').update(frame.color.y.bytes).update(mask.bytes).digest('hex');
        if (sample === samples[0] && initialHash) assert.equal(hash, initialHash);
        else if (sample === samples[0]) initialHash = hash;
        hashes.add(hash);
        frame.close();
        frame.close();
        assert.equal(mask.bytes.byteLength, 0, 'the planes transfer back to the worker for reuse');
      }
      assert.equal(hashes.size, 240);
    } finally {
      decoder.destroy();
    }
    await assert.rejects(decoder.decodePair(samples[0]), /unavailable/);
  });
}
