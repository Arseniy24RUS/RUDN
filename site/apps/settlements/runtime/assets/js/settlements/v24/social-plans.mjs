/** Selected-region authored population/network plans. No country prefetch. */
import {transportContentHash} from './transport-policy-v1.mjs';
import {distanceTransportPolicyFor} from './transport-policy-v2.mjs';
import {SOCIAL_POLICY_VERSION,SOCIAL_PARAMETERS,DIFFICULTY_TARGETS,validateDifficulty,isRemoteSocialRegion} from './social-policy.mjs';
import {SOCIAL_PLAN_INDEX} from './social-plans-regions/index.mjs';
import {fetchSocialPlan} from './social-plan-fetch.mjs';
const loaded=new WeakMap(),pending=new WeakMap(),attempts=new Map();
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export function socialContentHash(value){return `sha256:${transportContentHash(JSON.stringify(canonical(value)))}`;}
export function socialSourceIdentity(world){return socialContentHash({regionId:world.region.id,rows:world.rows.map(row=>[row.id,Number.isFinite(row.population)?row.population:null,row.lat,row.lon]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0),walk:world.rows.map(row=>[row.id,world.walk[row.index].map(([to,minutes])=>[world.rows[to].id,minutes]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]-b[1])]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0),transport:distanceTransportPolicyFor(world).fingerprint});}
export function socialConfigIdentity(world,difficulty='normal'){return socialContentHash({version:SOCIAL_POLICY_VERSION,difficulty:validateDifficulty(difficulty),targets:DIFFICULTY_TARGETS[difficulty],parameters:SOCIAL_PARAMETERS,remote:isRemoteSocialRegion(world),networkVersion:'population-backbone-half-v1',capacityFactor:1.25,upgradeFactor:.8,telecomRadiusKm:10});}
export function socialPlanFingerprint(plan){const {fingerprint,...content}=plan;return socialContentHash(content);}
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function validateSocialPlan(world,plan,{difficulty='normal'}={}){
  validateDifficulty(difficulty);
  if(plan?.version!==SOCIAL_POLICY_VERSION||plan.difficulty!==difficulty||plan.regionId!==world.region.id||plan.fingerprint!==SOCIAL_PLAN_INDEX[`${world.region.id}/${difficulty}`]||socialPlanFingerprint(plan)!==plan.fingerprint||plan.sourceIdentity!==socialSourceIdentity(world)||plan.configIdentity!==socialConfigIdentity(world,difficulty))throw new Error('Социальный сценарий не соответствует исходным данным или версии правил');
  if(!Array.isArray(plan.initialFacilities)||!Array.isArray(plan.initialRoutes)||!Array.isArray(plan.groups)||!Array.isArray(plan.referenceActions)||!Number.isFinite(plan.initialBudget)||plan.initialBudget<0)throw new Error('Повреждён социальный сценарий');
  const telecom=plan.telecom;
  if(!telecom||telecom.version!=='telecom-plan-v2'||telecom.radiusKm!==10||!Number.isSafeInteger(telecom.initialPopulationThreshold)||telecom.initialPopulationThreshold<1||!Array.isArray(telecom.initialSeedIds)||!Array.isArray(telecom.centres)||telecom.fingerprint!==socialPlanFingerprint(telecom)||!['medical','school','culture'].every(type=>Number.isSafeInteger(plan.thresholds?.[type])&&plan.thresholds[type]>=1))throw new Error('Повреждены начальные условия сложности');
  return freeze(plan);
}
export async function loadSocialPlan(world,{retry=false,difficulty='normal',signal}={}){
  validateDifficulty(difficulty);
  const cache=loaded.get(world)||new Map(),tasks=pending.get(world)||new Map();loaded.set(world,cache);pending.set(world,tasks);
  if(cache.has(difficulty))return cache.get(difficulty);if(tasks.has(difficulty))return tasks.get(difficulty);
  const id=world.region.id,key=`${id}/${difficulty}`;if(!Object.hasOwn(SOCIAL_PLAN_INDEX,key))throw new Error('Для региона ещё не подготовлена новая социальная сеть');
  const attempt=attempts.get(key)||0;
  const task=(async()=>{const url=new URL(`./social-plans-regions/${id}-${difficulty}.mjs${retry&&attempt?`?retry=${attempt}`:''}`,import.meta.url);
    const plan=url.protocol==='file:'?(await import(url.href)).default:await fetchSocialPlan(url,{signal});
    const accepted=validateSocialPlan(world,plan,{difficulty});cache.set(difficulty,accepted);return accepted;})();
  tasks.set(difficulty,task);try{return await task;}catch(error){attempts.set(key,attempt+1);throw error;}finally{tasks.delete(difficulty);}
}
export function socialPlanFor(world,difficulty='normal'){validateDifficulty(difficulty);const plan=loaded.get(world)?.get(difficulty);if(!plan)throw new Error('Эта версия сценария требует загрузки социальной сети');return plan;}
