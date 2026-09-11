/** Explicit class backups and atomic, bounded imports. No persistent student database. */
import {MODEL_VERSION, validateAnonymousRecord} from './analytics.mjs';
export const GROUP_SCHEMA='rudn-career-class';
export const GROUP_LIMIT=250;
export const GROUP_FILE_LIMIT=2_000_000;
const plain=x=>x!==null && typeof x==='object' && !Array.isArray(x);
const keys=(x,allowed)=>plain(x)&&Object.keys(x).length===allowed.length&&allowed.every(k=>Object.hasOwn(x,k));
function stable(x){return Array.isArray(x)?x.map(stable):plain(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;}
export function sameRecord(a,b){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
export function groupBundle(records,origin='uploaded',exportedAt=new Date().toISOString()) {
  return {schema:GROUP_SCHEMA,schemaVersion:1,modelVersion:MODEL_VERSION,origin,exportedAt,records:structuredClone(records)};
}
export function readGroupInput(text,registry) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>GROUP_FILE_LIMIT)throw Error('file-size');
  let value;try{value=JSON.parse(text);}catch{throw Error('json');}
  const bundle=value?.schema===GROUP_SCHEMA;
  if(bundle && (!keys(value,['schema','schemaVersion','modelVersion','origin','exportedAt','records']) || value.schemaVersion!==1 || value.modelVersion!==MODEL_VERSION || !['uploaded','demo'].includes(value.origin) || typeof value.exportedAt!=='string' || !Number.isFinite(Date.parse(value.exportedAt)) || !Array.isArray(value.records)))throw Error('bundle-schema');
  const records=bundle?value.records:[value];
  if(!records.length||records.length>GROUP_LIMIT)throw Error('record-limit');
  if((bundle&&value.origin==='demo') || records.some(r=>typeof r?.recordId==='string'&&r.recordId.startsWith('demo-')))throw Error('demo-data');
  const seen=new Set();
  for(const record of records){
    const validation=validateAnonymousRecord(record,registry);
    if(!validation.valid){const error=new Error('record-schema');error.validationErrors=validation.errors;throw error;}
    if(seen.has(record.recordId))throw Error('duplicate-in-bundle');seen.add(record.recordId);
  }
  return records;
}
export function mergeGroupRecords(existing,incoming) {
  // Work on a copy. A conflict or overflow cancels this whole file, not earlier files.
  const records=[...existing],byId=new Map(existing.map(x=>[x.recordId,x]));let added=0,duplicates=0;
  for(const record of incoming) {
    const prior=byId.get(record.recordId);
    if(prior){if(!sameRecord(prior,record))throw Error('id-conflict');duplicates++;continue;}
    records.push(record);byId.set(record.recordId,record);added++;
  }
  if(records.length>GROUP_LIMIT)throw Error('record-limit');
  return {records,added,duplicates};
}
