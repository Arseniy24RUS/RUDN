/** Test utilities only. Answers come from private dossiers supplied by callers. */
export function orderedActions(required,edges=[]){
  const left=new Set(required),ordered=[];
  while(left.size){
    const ready=[...left].filter(id=>!edges.some(([before,after])=>after===id&&left.has(before)));
    if(!ready.length)throw Error('Cyclic authored action dependency');
    for(const id of ready){ordered.push(id);left.delete(id);}
  }
  return ordered;
}
export function canonicalDecision(c,{planId}={}){
  const r=c.rubric,a=r.authored,plan=a?.decisionPlans.find(row=>row.id===planId)||a?.decisionPlans[0];
  const decision={procedureId:r.procedureIds[0],routeId:plan?.routes[0]||r.routeIds[0],actionIds:orderedActions(plan?.requiredActions||r.requiredActionIds,plan?.order||a?.order||[]),
    law:{number:a?.knowledge.number||r.legal.number,article:a?.knowledge.articles[0]||r.legal.articles[0]},deadline:r.deadline,
    basisDocumentIds:a?[...a.evidenceSets[0]]:[...new Set(r.evidenceGroups.map(group=>group[0]))],reasoning:'QA fixture: authored expected solution.'};
  if(a)decision.assessment={factId:a.factIds[0],applicationId:a.knowledge.correct,trapId:a.trap,actDate:a.knowledge.actDate,
    calendar:{anchor:a.calendar.anchor,rule:a.calendar.rule,start:a.calendar.start,shift:a.calendar.acceptedShifts[0]},
    research:{...a.research.bindings[0],extracted:a.research.accepted[0],finding:a.research.finding}};
  return decision;
}
export function dossierVariants(c){
  return [c,...(c.dateVariants||[])].map(value=>{const dossier=structuredClone(value);delete dossier.dateVariants;return dossier;});
}
