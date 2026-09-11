/* Shared lifecycle semantics, Stage 8. Synthetic rules; see docs/CONSOLIDATION.md.
 * A funding contract may end without demolishing its assets. Service inputs still
 * require paid staff/operations; training has a distinct, explicit retention curve.
 */
(function(root){
 'use strict';
 const DURABLE_FIELDS=new Set(['housing','health','school','mobility','floodProtection']);
 const SKILLS=new Set(['train-staff','skills-compact','skills-scale']);
 const r=n=>Math.round(n*1e6)/1e6;
 function remainingFactor(project,field,turn){
  if(project.status==='delivery'||(!project.activatedTurn&&project.status==='completed'))return 0;
  const age=Math.max(0,turn-(project.activatedTurn||turn));
  const durable=field==='housing' || (project.kind==='capital'&&DURABLE_FIELDS.has(field));
  if(durable){
   // Physical capacity has slow continuous wear, never an expiry-date cliff.
   // Road/flood maintenance affects effectiveness, not existence of the object.
   const wear=Math.max(.65,1-age*.005);
   if(project.status==='completed'&&['mobility','floodProtection'].includes(field)){
    const unmaintained=Math.max(0,turn-(project.completedTurn||turn));
    return r(wear*Math.max(.4,1-unmaintained*.08));
   }
   return r(wear);
  }
  if(project.status==='active')return 1;
  if(project.status==='completed'&&SKILLS.has(project.actionId)&&['healthStaff','jobs','flexWork'].includes(field)){
   return r(Math.pow(.85,Math.max(1,turn-(project.completedTurn||turn)+1)));
  }
  return 0;
 }
 function outputs(project,turn){
  const result={};
  for(const[k,v]of Object.entries(project.people?.outputs||{})){
   const factor=remainingFactor(project,k,turn);
   if(factor)result[k]=r(v*factor);
  }
  return result;
 }
 function hasPhysicalAssets(project){
  return Object.keys(project.people?.outputs||{}).some(k=>k==='housing'||(project.kind==='capital'&&DURABLE_FIELDS.has(k)));
 }
 const api={VERSION:'1.0.0',outputs,remainingFactor,hasPhysicalAssets};
 root.GovernorGame=root.GovernorGame||{};root.GovernorGame.ProjectState=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
