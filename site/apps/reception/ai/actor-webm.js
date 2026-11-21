// The authored silent loops have one unlaced VP9 track. Matroska stores each
// transparency packet in BlockAdditional (ID 1), alongside the colour packet.
const SEGMENT = 0x18538067, INFO = 0x1549a966, TRACKS = 0x1654ae6b, CLUSTER = 0x1f43b675;

function integer(bytes) {
  let value = 0;
  for (const byte of bytes) value = value * 256 + byte;
  if (!Number.isSafeInteger(value)) throw Error('Invalid WebM integer');
  return value;
}
function vint(bytes, at, id = false) {
  const first = bytes[at];
  if (!first) throw Error('Invalid WebM header');
  const length = Math.clz32(first) - 23;
  if (length > (id ? 4 : 8) || at + length > bytes.length) throw Error('Incomplete WebM header');
  let value = id ? first : first & (0xff >> length);
  for (let i = 1; i < length; i++) value = value * 256 + bytes[at + i];
  return {value, length};
}
function* elements(bytes) {
  let at = 0;
  while (at < bytes.length) {
    const tag = vint(bytes, at, true);
    const size = vint(bytes, at + tag.length);
    at += tag.length + size.length;
    if (!Number.isSafeInteger(size.value) || size.value > bytes.length - at) throw Error('Incomplete WebM element');
    yield [tag.value, bytes.subarray(at, at + size.value)];
    at += size.value;
  }
}
const children = bytes => new Map(elements(bytes));

export function readActorWebM(buffer) {
  const segment = children(new Uint8Array(buffer)).get(SEGMENT);
  if (!segment) throw Error('No WebM segment');
  const samples = [];
  let scale = 1000000, width, height, interval, track;
  for (const [tag, bytes] of elements(segment)) {
    if (tag === INFO) {
      const value = children(bytes).get(0x2ad7b1);
      if (value) scale = integer(value);
    } else if (tag === TRACKS) {
      for (const [id, body] of elements(bytes)) {
        if (id !== 0xae) continue;
        const entry = children(body);
        if (new TextDecoder().decode(entry.get(0x86)) !== 'V_VP9') continue;
        const video = children(entry.get(0xe0));
        width = integer(video.get(0xb0));
        height = integer(video.get(0xba));
        track = integer(entry.get(0xd7));
        interval = integer(entry.get(0x23e383)) / 1000000;
      }
    } else if (tag === CLUSTER) {
      let base = 0;
      for (const [id, body] of elements(bytes)) {
        if (id === 0xe7) base = integer(body);
        if (id !== 0xa0) continue;
        const group = children(body);
        const block = group.get(0xa1);
        const number = vint(block, 0);
        if (number.value !== track) continue;
        const pos = number.length;
        if (block.length <= pos + 3 || (block[pos + 2] & 6)) throw Error('Unsupported WebM block');
        const offset = new DataView(block.buffer, block.byteOffset + pos, 2).getInt16(0);
        let alpha;
        for (const [kind, extra] of elements(group.get(0x75a1) || [])) {
          if (kind !== 0xa6) continue;
          const more = children(extra);
          if (!more.has(0xee) || integer(more.get(0xee)) === 1) alpha = more.get(0xa5);
        }
        if (!alpha?.length) throw Error('No actor transparency plane');
        samples.push({timestamp:Math.round((base + offset) * scale / 1000), key:!group.has(0xfb),
          color:block.subarray(pos + 3), alpha});
      }
    }
  }
  if (!width || !height || width > 4096 || height > 4096 || !(interval > 0) || !samples[0]?.key || samples.length < 2)
    throw Error('No complete transparent actor track');
  return {width, height, interval, samples};
}
