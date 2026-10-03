/** Fixed scenario road conditions, independent of renderer, fetches and zoom.
 * The compact catalogue describes authored game conditions, not observed absence
 * of physical roads. Full source support and derivation evidence live in docs.
 */
import {TRANSPORT_CATALOGUE} from './transport-policy-v1.generated.mjs';

export const TRANSPORT_POLICY_VERSION = 'transport-policy-v1';
const byWorld = new WeakMap(), syntheticPolicies = new WeakMap();
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export const canonicalTransportEdge = (a,b) => compare(a,b) < 0 ? `${a}|${b}` : `${b}|${a}`;

// Synchronous SHA-256 keeps the deterministic rules API synchronous. It is a
// content fingerprint, not an authentication mechanism. Tested against node:crypto.
const K = Uint32Array.from([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);
const rotr = (x,n) => (x >>> n) | (x << (32-n));
export function transportContentHash(text) {
  const input = new TextEncoder().encode(text), padded = new Uint8Array(Math.ceil((input.length+9)/64)*64);
  padded.set(input); padded[input.length] = 0x80;
  const view = new DataView(padded.buffer), bits = input.length*8;
  view.setUint32(padded.length-8, Math.floor(bits/2**32)); view.setUint32(padded.length-4, bits>>>0);
  const h = Uint32Array.from([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w = new Uint32Array(64);
  for (let offset=0; offset<padded.length; offset+=64) {
    for (let i=0;i<16;i++) w[i]=view.getUint32(offset+i*4);
    for (let i=16;i<64;i++) {
      const a=w[i-15], b=w[i-2], s0=rotr(a,7)^rotr(a,18)^(a>>>3), s1=rotr(b,17)^rotr(b,19)^(b>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,k]=h;
    for (let i=0;i<64;i++) {
      const s1=rotr(e,6)^rotr(e,11)^rotr(e,25), ch=(e&f)^(~e&g), t1=(k+s1+ch+K[i]+w[i])>>>0;
      const s0=rotr(a,2)^rotr(a,13)^rotr(a,22), maj=(a&b)^(a&c)^(b&c), t2=(s0+maj)>>>0;
      k=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    for (const [i,value] of [a,b,c,d,e,f,g,k].entries()) h[i]=(h[i]+value)>>>0;
  }
  return [...h].map(value=>value.toString(16).padStart(8,'0')).join('');
}

/** Deterministic catalogue identity. Source coordinates and directed drive times
 * are part of this binding; population and walking rules retain engine dataVersion.
 */
export function transportWorldDefinition(world) {
  if (!world?.region?.id || !Array.isArray(world.rows) || !Array.isArray(world.drive) || world.drive.length!==world.rows.length)
    throw new Error('Недоступен исходный транспортный граф');
  const drive=[], keys=new Set();
  for(let from=0;from<world.drive.length;from++) for(const [to,minutes] of world.drive[from]) {
    const a=world.rows[from]?.id,b=world.rows[to]?.id;
    if(typeof a!=='string'||typeof b!=='string'||!Number.isFinite(minutes)) throw new Error('Некорректное транспортное ребро');
    drive.push([a,b,minutes]); keys.add(canonicalTransportEdge(a,b));
  }
  drive.sort((a,b)=>compare(a[0],b[0])||compare(a[1],b[1])||a[2]-b[2]);
  const nodes=world.rows.map(row=>[row.id,row.lat,row.lon]).sort((a,b)=>compare(a[0],b[0]));
  const orderedKeys=[...keys].sort(compare);
  return {keys:orderedKeys,keysHash:transportContentHash(JSON.stringify(orderedKeys)),worldHash:transportContentHash(JSON.stringify({regionId:world.region.id,nodes,drive}))};
}

const frozenPolicy=(fingerprint,roadRequired)=>Object.freeze({version:TRANSPORT_POLICY_VERSION,fingerprint,roadRequired:Object.freeze(roadRequired)});

export function transportPolicyFor(world) {
  if(byWorld.has(world)) return byWorld.get(world);
  const record=TRANSPORT_CATALOGUE[world?.region?.id];
  if(!record) throw new Error('Для региона отсутствуют фиксированные дорожные условия');
  const [fingerprint,worldHash,keysHash,count,encoded,sourceBinding]=record, definition=transportWorldDefinition(world);
  if(definition.worldHash!==worldHash || definition.keysHash!==keysHash || definition.keys.length!==count)
    throw new Error('Исходный граф не соответствует дорожным условиям сценария');
  const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
  if(bytes.length!==Math.ceil(count/8) || count%8 && bytes.at(-1) >> (count%8))
    throw new Error('Повреждён каталог дорожных условий');
  const roadRequired=Object.create(null);
  for(const [index,key] of definition.keys.entries()) roadRequired[key]=Boolean(bytes[index>>3] & (1<<(index%8)));
  const expected=transportContentHash(JSON.stringify({version:TRANSPORT_POLICY_VERSION,regionId:world.region.id,worldHash,sourceBinding,roadRequired:Object.entries(roadRequired)}));
  if(fingerprint!==`sha256:${expected}`) throw new Error('Контрольная сумма дорожных условий не совпадает');
  const policy=frozenPolicy(fingerprint,roadRequired);byWorld.set(world,policy);return policy;
}

/** Test-only explicit entry point: never accepts a supplied real regional ID.
 * A synthetic policy is valid only with its actual World and builder object;
 * no save importer reads or registers an imported roadRequired mapping.
 */
export function createSyntheticTransportPolicy(world,roadRequired) {
  if(!world?.region?.id?.startsWith('synthetic-') || Object.hasOwn(TRANSPORT_CATALOGUE,world.region.id))
    throw new Error('Синтетические дорожные условия требуют отдельного synthetic-региона');
  const {keys,worldHash}=transportWorldDefinition(world), supplied=Object.keys(roadRequired||{}).sort(compare);
  if(JSON.stringify(keys)!==JSON.stringify(supplied) || keys.some(key=>typeof roadRequired[key]!=='boolean'))
    throw new Error('Синтетические дорожные условия должны содержать все рёбра графа');
  const conditions=Object.fromEntries(keys.map(key=>[key,roadRequired[key]]));
  const fingerprint=`sha256:${transportContentHash(JSON.stringify({version:TRANSPORT_POLICY_VERSION,regionId:world.region.id,worldHash,sourceBinding:'synthetic-fixture-v1',roadRequired:Object.entries(conditions)}))}`;
  const policy=frozenPolicy(fingerprint,conditions);
  if(!syntheticPolicies.has(world)) syntheticPolicies.set(world,new WeakSet());
  syntheticPolicies.get(world).add(policy);return policy;
}

export function validateTransportPolicy(world,policy) {
  if(world?.region?.id?.startsWith('synthetic-') && !Object.hasOwn(TRANSPORT_CATALOGUE,world.region.id)) {
    if(!syntheticPolicies.get(world)?.has(policy)) throw new Error('Синтетическая политика должна быть явно создана для этого мира');
    return policy;
  }
  const canonical=transportPolicyFor(world);
  if(policy===canonical) return canonical;
  if(!policy || policy.version!==canonical.version || policy.fingerprint!==canonical.fingerprint ||
    !policy.roadRequired || Object.keys(policy.roadRequired).length!==Object.keys(canonical.roadRequired).length ||
    Object.entries(canonical.roadRequired).some(([key,value])=>policy.roadRequired[key]!==value))
    throw new Error('Дорожные условия не соответствуют каноническому сценарию');
  return canonical;
}
