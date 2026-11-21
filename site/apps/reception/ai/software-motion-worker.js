/* This classic worker loads the license-preserved ogv.js 1.9.0 VP9 wrapper. */
let colorDecoder;
let alphaDecoder;

function planeBuffers(frame) {
  return [frame.y.bytes.buffer, frame.u.bytes.buffer, frame.v.bytes.buffer];
}

async function createDecoder(wasmBinary) {
  const decoder = await self.OGVDecoderVideoVP9W({wasmBinary, videoFormat: {}});
  await new Promise(resolve => decoder.init(resolve));
  return decoder;
}

function decode(decoder, packet) {
  return new Promise((resolve, reject) => {
    decoder.processFrame(packet, ok => {
      if (ok && decoder.frameBuffer) resolve(decoder.frameBuffer);
      else reject(new Error('Reception software VP9 could not decode the authored frame'));
    });
  });
}

self.onmessage = async ({data}) => {
  try {
    switch (data.type) {
      case 'start': {
        importScripts(data.scriptURL);
        const response = await fetch(data.wasmURL);
        if (!response.ok) throw new Error('Reception software VP9 could not load its decoder');
        const bytes = await response.arrayBuffer();
        [colorDecoder, alphaDecoder] = await Promise.all([createDecoder(bytes), createDecoder(bytes)]);
        self.postMessage({type: 'ready'});
        break;
      }
      case 'decode': {
        const [color, alpha] = await Promise.all([
          decode(colorDecoder, data.color), decode(alphaDecoder, data.alpha),
        ]);
        self.postMessage({type: 'frame', color, alpha}, [...planeBuffers(color), ...planeBuffers(alpha)]);
        break;
      }
      case 'recycle':
        colorDecoder.recycleFrame(data.color);
        alphaDecoder.recycleFrame(data.alpha);
        break;
    }
  } catch (error) {
    self.postMessage({error: error.message || String(error)});
  }
};
