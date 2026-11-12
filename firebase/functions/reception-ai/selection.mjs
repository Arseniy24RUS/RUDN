import {hash,copy} from './schema.mjs';
import {CATALOG_METADATA,CATALOG_CALENDAR_TERMS} from './catalog-metadata.mjs';

const ranked = (items,seed,key) => [...items].sort((a,b)=>hash(seed+':'+key(a)).localeCompare(hash(seed+':'+key(b))));
const familyOf = c => c.familyId || CATALOG_METADATA[c.id]?.familyId || c.id;
const INDEPENDENT_LEVELS = [1,1,2,2,2,2,3,3];
const REQUIRED_FAMILIES = ['budget','mfc-complaint'];
const REQUIRED_TERMS = ['calendarDays:7','calendarDays:30','workingDays'];

// Restore the authored extended-eight blueprint from js/assignment.js. Selection
// is independent of grading: it uses the original assignment metadata only.
// Legacy and small custom banks keep their prior equal-family selection.
function balancedCases(cases, seed) {
  if (!cases.every(c => Object.hasOwn(CATALOG_METADATA,c.id))
    || !REQUIRED_FAMILIES.every(family => cases.some(c => familyOf(c) === family))) return null;
  const byLevel = new Map();
  for (const level of [1,2,3]) {
    const families = new Map();
    for (const c of cases.filter(c => CATALOG_METADATA[c.id].level === level)) {
      const family=familyOf(c); if(!families.has(family))families.set(family,[]); families.get(family).push(c);
    }
    byLevel.set(level, ranked([...families],seed+':level:'+level,row=>row[0])
      .flatMap(([family,variants])=>ranked(variants,seed+':level:'+level+':'+family,c=>c.id)));
  }
  const candidates=INDEPENDENT_LEVELS.map(level=>byLevel.get(level)); let nodes=0;
  function choose(index,picked,used,terms) {
    if (++nodes > 20000) return null;
    if (index===candidates.length) return REQUIRED_FAMILIES.every(family=>used.has(family))
      && REQUIRED_TERMS.every(term=>terms.has(term))?picked:null;
    for (const c of candidates[index]) {
      if (nodes >= 20000) return null;
      const family=familyOf(c); if(used.has(family))continue;
      const nextUsed=new Set([...used,family]),nextTerms=new Set([...terms,CATALOG_CALENDAR_TERMS[c.id]]);
      if (!REQUIRED_FAMILIES.every(required=>nextUsed.has(required)
        || candidates.slice(index+1).some(rows=>rows.some(row=>familyOf(row)===required)))) continue;
      if (!REQUIRED_TERMS.every(term=>nextTerms.has(term)
        || candidates.slice(index+1).some(rows=>rows.some(row=>!nextUsed.has(familyOf(row))&&CATALOG_CALENDAR_TERMS[row.id]===term)))) continue;
      const result=choose(index+1,[...picked,c],nextUsed,nextTerms); if(result)return result;
    }
    return null;
  }
  const chosen=choose(0,[],new Set(),new Set());
  if (!chosen && cases.length >= Object.keys(CATALOG_METADATA).length) throw new TypeError('Full bank cannot satisfy the independent assignment blueprint');
  return chosen;
}

/** Every family has equal selection weight; a large variant family cannot
 * displace smaller topics. IDs and date packs are chosen only on the server. */
export function selectShiftCases(cases,seed,{count=8,caseId,balanced=false}={}) {
  const families = new Map();
  for(const c of cases){const family=familyOf(c);if(!families.has(family))families.set(family,[]);families.get(family).push(c);}
  const balancedSelection=balanced&&count===8&&!caseId?balancedCases(cases,seed):null;
  const selected = caseId ? [cases.find(c=>c.id===caseId)] : balancedSelection || ranked([...families],seed+':families',row=>row[0]).slice(0,count)
    .map(([family,variants])=>ranked(variants,seed+':'+family,c=>c.id)[0]);
  return selected.map(c=>{
    if(!c)throw new TypeError('Unknown selected case');
    const versions=[c,...(c.dateVariants||[])];
    const chosen=ranked(versions,seed+':'+c.id+':dates',variant=>variant.datePackId||'default')[0];
    const snapshot=copy(chosen);delete snapshot.dateVariants;return snapshot;
  });
}
