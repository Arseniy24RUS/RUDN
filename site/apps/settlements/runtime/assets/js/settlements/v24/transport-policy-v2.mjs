/** Frozen distance and authored road conditions; loads only the requested region.
 * Neither the save file nor runtime display geometry can supply these conditions.
 */
import {DISTANCE_TRANSPORT_INDEX} from './transport-policy-v2.generated.mjs';
import {transportContentHash,transportWorldDefinition} from './transport-policy-v1.mjs';
import {sourceWorldFor} from './federal-cities.mjs';
import {deriveFederalDistancePolicy} from './federal-transport.mjs';
import {fetchTransportRecord} from './transport-policy-fetch.mjs';
export {canonicalTransportEdge} from './transport-policy-v1.mjs';
export const DISTANCE_TRANSPORT_POLICY_VERSION='transport-policy-v2';
const policies=new WeakMap(),pending=new WeakMap(),syntheticPolicies=new WeakMap(),attemptsByRegion=new Map();
const bytes=encoded=>Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
const frozenPolicy=(fingerprint,roadRequired,distanceMeters)=>Object.freeze({version:DISTANCE_TRANSPORT_POLICY_VERSION,fingerprint,
  roadRequired:Object.freeze(roadRequired),distanceMeters:Object.freeze(distanceMeters)});
const fingerprintFor=(regionId,worldHash,sourceBinding,roadRequired,distanceMeters)=>`sha256:${transportContentHash(JSON.stringify({
  version:DISTANCE_TRANSPORT_POLICY_VERSION,regionId,worldHash,sourceBinding,roadRequired:Object.entries(roadRequired),distanceMeters:Object.entries(distanceMeters),
}))}`;

export async function loadDistanceTransportPolicy(world,{signal}={}){
  if(policies.has(world))return policies.get(world);
  if(pending.has(world))return pending.get(world);
  const source=sourceWorldFor(world);
  if(source!==world){
    const task=loadDistanceTransportPolicy(source,{signal}).then(policy=>{const extended=deriveFederalDistancePolicy(world,source,policy);policies.set(world,extended);return extended;});
    pending.set(world,task);try{return await task;}finally{pending.delete(world);}
  }
  const id=world?.region?.id,index=Object.hasOwn(DISTANCE_TRANSPORT_INDEX,id)?DISTANCE_TRANSPORT_INDEX[id]:null;
  if(!index)throw new Error('Для региона отсутствуют фиксированные расстояния');
  const attempt=attemptsByRegion.get(id)||0;
  const loading=(async()=>{
    // Only a local index member selects a module. Imported saves cannot provide URLs.
    // A failed dynamic import is cached by browsers. The next explicit caller
    // may retry a fresh URL; this function never loops or retries by itself.
    const suffix=attempt?`?retry=${attempt}`:'';
    const url=new URL(`./transport-policy-v2-regions/${id}.mjs${suffix}`,import.meta.url);
    const record=url.protocol==='file:'?(await import(url.href)).DISTANCE_TRANSPORT_RECORD:await fetchTransportRecord(url,{signal});
    if(!Array.isArray(record)||transportContentHash(JSON.stringify(record))!==index[1]||record[0]!==index[0])
      throw new Error('Контрольная сумма региональных расстояний не совпадает');
    const [fingerprint,worldHash,keysHash,count,encodedRoads,encodedMetres,sourceBinding]=record,definition=transportWorldDefinition(world);
    if(definition.worldHash!==worldHash||definition.keysHash!==keysHash||definition.keys.length!==count)
      throw new Error('Исходный граф не соответствует расстояниям сценария');
    const roadBytes=bytes(encodedRoads),metresBytes=bytes(encodedMetres);
    if(roadBytes.length!==Math.ceil(count/8)||metresBytes.length!==count*4||count%8&&roadBytes.at(-1)>>(count%8))
      throw new Error('Повреждён каталог региональных расстояний');
    const roadRequired=Object.create(null),distanceMeters=Object.create(null),view=new DataView(metresBytes.buffer,metresBytes.byteOffset,metresBytes.byteLength);
    for(const [i,key] of definition.keys.entries()){
      roadRequired[key]=Boolean(roadBytes[i>>3]&(1<<(i%8)));distanceMeters[key]=view.getUint32(i*4,true);
      if(distanceMeters[key]===0&&roadRequired[key])throw new Error('Нулевой участок не требует строительства дороги');
    }
    if(fingerprintFor(id,worldHash,sourceBinding,roadRequired,distanceMeters)!==fingerprint)
      throw new Error('Контрольная сумма дорожной политики не совпадает');
    const policy=frozenPolicy(fingerprint,roadRequired,distanceMeters);policies.set(world,policy);attemptsByRegion.set(id,attempt);return policy;
  })();
  pending.set(world,loading);
  try{return await loading;}catch(error){
    if((attemptsByRegion.get(id)||0)<=attempt)attemptsByRegion.set(id,attempt+1);
    throw error;
  }finally{pending.delete(world);}
}

export function distanceTransportPolicyFor(world){
  if(!policies.has(world))throw new Error('Сначала загрузите расстояния сценария');
  return policies.get(world);
}

export function validateDistanceTransportPolicy(world,policy){
  if(world?.region?.id?.startsWith('synthetic-')&&!Object.hasOwn(DISTANCE_TRANSPORT_INDEX,world.region.id)){
    if(!syntheticPolicies.get(world)?.has(policy))throw new Error('Синтетические расстояния должны быть явно созданы для этого мира');
    return policy;
  }
  const canonical=distanceTransportPolicyFor(world);
  if(policy===canonical)return canonical;
  if(!policy||policy.version!==canonical.version||policy.fingerprint!==canonical.fingerprint||!policy.roadRequired||!policy.distanceMeters||
    Object.keys(policy.roadRequired).length!==Object.keys(canonical.roadRequired).length||Object.keys(policy.distanceMeters).length!==Object.keys(canonical.distanceMeters).length||
    Object.keys(canonical.roadRequired).some(key=>policy.roadRequired[key]!==canonical.roadRequired[key]||policy.distanceMeters[key]!==canonical.distanceMeters[key]))
    throw new Error('Расстояния не соответствуют каноническому сценарию');
  return canonical;
}

export function createSyntheticDistanceTransportPolicy(world,{roadRequired,distanceMeters}={}){
  if(!world?.region?.id?.startsWith('synthetic-')||Object.hasOwn(DISTANCE_TRANSPORT_INDEX,world.region.id))
    throw new Error('Синтетические расстояния требуют отдельного synthetic-региона');
  const {keys,worldHash}=transportWorldDefinition(world),expected=JSON.stringify(keys);
  if(JSON.stringify(Object.keys(roadRequired||{}).sort())!==expected||JSON.stringify(Object.keys(distanceMeters||{}).sort())!==expected||
    keys.some(key=>typeof roadRequired[key]!=='boolean'||!Number.isSafeInteger(distanceMeters[key])||distanceMeters[key]<0||distanceMeters[key]>0xffffffff||distanceMeters[key]===0&&roadRequired[key]))
    throw new Error('Синтетические расстояния должны точно описывать все рёбра');
  const roads=Object.fromEntries(keys.map(key=>[key,roadRequired[key]])),metres=Object.fromEntries(keys.map(key=>[key,distanceMeters[key]]));
  const policy=frozenPolicy(fingerprintFor(world.region.id,worldHash,'synthetic-distance-fixture-v2',roads,metres),roads,metres);
  if(!syntheticPolicies.has(world))syntheticPolicies.set(world,new WeakSet());syntheticPolicies.get(world).add(policy);return policy;
}
