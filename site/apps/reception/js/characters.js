import {GFX_PASSPORTS,GFX_ROSTER} from './graphics-data.js';
/** All inputs are visual context. This module never imports grading or modifies cases. */
export const CHARACTER_ART_VERSION='gfx1-web-0.18.0';
const gfxHash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
export const gfxCaseKey=c=>String(c.templateId||c.id||'').split('@')[0];
export function visualCast(caseKeys,seed='preview'){
 const unique=[...new Set(caseKeys.map(x=>String(x).split('@')[0]))],assigned={},holder=new Map();
 const preferences={};
 for(const key of unique){const p=GFX_PASSPORTS[key];preferences[key]=[...(p?.candidates||['S03'])].sort((a,b)=>gfxHash(seed+key+a)-gfxHash(seed+key+b));if(p?.role!=='citizen')assigned[key]=preferences[key][0];}
 const assign=(key,seen)=>{for(const actor of preferences[key]){if(seen.has(actor))continue;seen.add(actor);const other=holder.get(actor);if(!other||assign(other,seen)){holder.set(actor,key);assigned[key]=actor;return true;}}return false;};
 const conflicts=[];
 for(const key of unique.filter(k=>GFX_PASSPORTS[k]?.role==='citizen').sort((a,b)=>preferences[a].length-preferences[b].length||a.localeCompare(b))){if(!assign(key,new Set())){assigned[key]=preferences[key][0];conflicts.push(key);}}
 return {version:CHARACTER_ART_VERSION,actors:assigned,conflicts};
}
export function ensureVisualCast(shift){
 const keys=shift.assignment?.manifest?.map(m=>m.templateId)||shift.caseIds;
 const old=shift.graphics;
 if(old?.version===CHARACTER_ART_VERSION&&keys.every(k=>GFX_PASSPORTS[k]?.candidates.includes(old.actors?.[k])))return old;
 // Derivation does not change seed/assignment/answers; persistence happens in the normal draft transaction.
 shift.graphics=visualCast(keys,shift.seed);return shift.graphics;
}
export function characterFor(c,context={}){
 const key=gfxCaseKey(c),p=GFX_PASSPORTS[key]||{role:'records_duty',candidates:['S03'],environment:'ENV04'},candidate=context.actor;
 const actor=p.candidates.includes(candidate)?candidate:p.candidates[gfxHash('catalog:'+key)%p.candidates.length];
 const staff=actor.startsWith('S'),tool=context.tool||'talk';
 let suffix='N';
 if(tool==='talk'&&context.questionIndex>=0)suffix=staff?['N','E','Q'][context.questionIndex%3]:['E','Q','W','A'][context.questionIndex%4];
 else if(tool==='docs')suffix=context.phone?'P':'D';
 else if(tool==='research')suffix='Q';
 // Final states remain attentive, regardless of correctness or score.
 if(context.completed)suffix='N';
 const state=(staff?'S-':'C-')+suffix,id=actor+'__'+state;
 const portrait='assets/gfx1/characters/'+actor+'/'+id+'__w512.webp';
 return {id:actor,state,states:GFX_ROSTER[actor].states,portrait,small:'assets/gfx1/characters/'+actor+'/'+id+'__w320.webp',avatar:'assets/gfx1/avatars/'+actor+'.webp',fallback:'assets/gfx1/characters/'+actor+'/'+actor+'__'+(staff?'S-N':'C-N')+'__w512.webp',environment:p.environment,role:p.role,newArt:true};
}
// Compatibility names for extensions using the old presentation API; no rejected art is used.
export const CHARACTER_ART=Object.freeze({woman:characterFor({id:'privacy'}),man:characterFor({id:'budget'}),duty:characterFor({id:'anonymous-danger'}),elder:characterFor({id:'river-observation'})});
