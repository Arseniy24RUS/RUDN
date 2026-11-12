import {hash,copy} from './schema.mjs';

const ranked = (items,seed,key) => [...items].sort((a,b)=>hash(seed+':'+key(a)).localeCompare(hash(seed+':'+key(b))));

/** Every family has equal selection weight; a large variant family cannot
 * displace smaller topics. IDs and date packs are chosen only on the server. */
export function selectShiftCases(cases,seed,{count=8,caseId}={}) {
  const families = new Map();
  for(const c of cases){const family=c.familyId||c.id;if(!families.has(family))families.set(family,[]);families.get(family).push(c);}
  const selected = caseId ? [cases.find(c=>c.id===caseId)] : ranked([...families],seed+':families',row=>row[0]).slice(0,count)
    .map(([family,variants])=>ranked(variants,seed+':'+family,c=>c.id)[0]);
  return selected.map(c=>{
    if(!c)throw new TypeError('Unknown selected case');
    const versions=[c,...(c.dateVariants||[])];
    const chosen=ranked(versions,seed+':'+c.id+':dates',variant=>variant.datePackId||'default')[0];
    const snapshot=copy(chosen);delete snapshot.dateVariants;return snapshot;
  });
}
