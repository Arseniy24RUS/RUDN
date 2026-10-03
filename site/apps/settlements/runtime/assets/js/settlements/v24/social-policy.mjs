/** Versioned population model; its starting network is authored from source rows. */
import {SPARSE_TELECOM_REGIONS} from './telecom-policy.mjs';

export const SOCIAL_RULES_VERSION = 'settlements-3.4.0';
export const SOCIAL_POLICY_VERSION = 'social-policy-v1';
export const SOCIAL_SERVICES = Object.freeze(['medical','school','culture']);
export const DIFFICULTIES = Object.freeze(['easy','normal','hard']);
export const DIFFICULTY_TARGETS = Object.freeze({
  easy:Object.freeze({medical:12,school:10,culture:15,telecom:12}),
  normal:Object.freeze({medical:90,school:75,culture:60,telecom:100}),
  hard:Object.freeze({medical:350,school:300,culture:250,telecom:300}),
});
export function validateDifficulty(value='normal'){
  if(!DIFFICULTIES.includes(value))throw new Error('Неизвестный уровень сложности');
  return value;
}
export const SOCIAL_PARAMETERS = Object.freeze({
  medical:Object.freeze({capacityUnits:200000,threshold:8000,remoteThreshold:500,time:60,walk:35}),
  school:Object.freeze({capacityUnits:26000,threshold:5000,remoteThreshold:250,time:55,walk:30}),
  culture:Object.freeze({capacityUnits:180000,threshold:3000,remoteThreshold:500,time:60,walk:35}),
  outreach:Object.freeze({capacityUnits:50000,time:0,walk:0}),
});
export const isRemoteSocialRegion = world => SPARSE_TELECOM_REGIONS.includes(world.region.id);
export const isPopulationSocialScenario = scenario => scenario?.rulesVersion===SOCIAL_RULES_VERSION && scenario.kind!=='intro';
export function socialInitialThreshold(world,type){
  const spec=SOCIAL_PARAMETERS[type];
  if(!SOCIAL_SERVICES.includes(type))throw new Error('Неизвестная социальная услуга');
  return isRemoteSocialRegion(world)?spec.remoteThreshold:spec.threshold;
}
export function socialDemandUnits(row,type){
  return Number.isFinite(row?.population)&&row.population>0?Math.round(row.population*(type==='school'?16:100)):0;
}
export function socialFacilityCapacity(world,type,settlementId){
  const spec=SOCIAL_PARAMETERS[type];
  if(!spec)throw new Error('Неизвестный объект');
  if(type==='outreach')return spec.capacityUnits;
  return Math.round(Math.max(spec.capacityUnits,socialDemandUnits(world.row(settlementId),type))*1.25);
}
export function socialUpgradeCapacity(world,type,settlementId){
  return Math.round(socialFacilityCapacity(world,type,settlementId)*.8);
}
export function socialAccessLimits(world,type){
  const spec=SOCIAL_PARAMETERS[type];
  if(!spec)throw new Error('Неизвестный объект');
  return {time:type!=='outreach'&&isRemoteSocialRegion(world)?Infinity:spec.time,walk:spec.walk};
}
