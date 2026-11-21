import {resourceURL} from '../../../assets/js/release-resources.js';

const vendor = './vendor/ogv-vp9-1.9.0/';
const mediaURL = path => resourceURL(path, import.meta.url).href;
const STARTUP_TIMEOUT = 15000;
const FRAME_TIMEOUT = 3000;

function planeBuffers(frame) {
  return [frame.y.bytes.buffer, frame.u.bytes.buffer, frame.v.bytes.buffer];
}

/** Decode the color and alpha VP9 packets of one authored WebM frame off the UI thread. */
export async function createSoftwareFrameDecoder(view, _source, onError = () => {}) {
  if (typeof view.Worker !== 'function' || typeof view.WebAssembly !== 'object') {
    throw new Error('Reception software VP9 requires Worker and WebAssembly');
  }
  const worker = new view.Worker(mediaURL('./software-motion-worker.js'));
  let pending = null;
  let stopped = false;

  function settle(error, result) {
    const request = pending;
    pending = null;
    if (!request) return;
    view.clearTimeout(request.timer);
    if (error) request.reject(error);
    else request.resolve(result);
  }

  function destroy(error = new Error('Reception software VP9 stopped')) {
    if (stopped) return;
    stopped = true;
    worker.terminate();
    settle(error);
  }

  function fail(error) {
    if (stopped) return;
    destroy(error);
    onError(error);
  }

  worker.onmessage = ({data}) => {
    if (data.error) fail(new Error(data.error));
    else settle(null, data);
  };
  worker.onerror = event => fail(new Error(event.message || 'Reception software VP9 worker failed'));
  worker.onmessageerror = () => fail(new Error('Reception software VP9 worker message could not be read'));

  function request(message, transfer = [], timeout = FRAME_TIMEOUT) {
    if (stopped || pending) return Promise.reject(new Error('Reception software VP9 is unavailable or busy'));
    return new Promise((resolve, reject) => {
      const timer = view.setTimeout(() => fail(new Error('Reception software VP9 timed out')), timeout);
      pending = {resolve, reject, timer};
      try {
        worker.postMessage(message, transfer);
      } catch (error) {
        fail(error);
      }
    });
  }

  await request({
    type: 'start',
    scriptURL: mediaURL(vendor + 'ogv-decoder-video-vp9-wasm.js'),
    wasmURL: mediaURL(vendor + 'ogv-decoder-video-vp9-wasm.wasm'),
  }, [], STARTUP_TIMEOUT);

  return {
    async decodePair(sample) {
      // Packet views may share the original WebM buffer with subsequent frames.
      const colorPacket = new Uint8Array(sample.color);
      const alphaPacket = new Uint8Array(sample.alpha);
      const {color, alpha} = await request({type: 'decode', color: colorPacket, alpha: alphaPacket}, [
        colorPacket.buffer,
        alphaPacket.buffer,
      ]);
      let closed = false;
      return {
        color,
        alpha,
        close() {
          if (closed || stopped) return;
          closed = true;
          worker.postMessage({type: 'recycle', color, alpha}, [...planeBuffers(color), ...planeBuffers(alpha)]);
        },
      };
    },
    destroy,
  };
}
