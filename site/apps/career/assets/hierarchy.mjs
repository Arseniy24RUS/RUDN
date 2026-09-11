/** Deterministic forest of executive bodies. Adjacent employers are not child bodies. */
export const ROOT_IDS=['president','government'];
export function validateHierarchy(hierarchy, authorities) {
  const errors=[], ids=new Set(authorities.filter(a=>!['corporation','fund'].includes(a.entityType)).map(a=>a.id));
  const links=hierarchy.links || [], parents=new Map();
  for(const link of links) {
    if(!ids.has(link.child)) errors.push(`unknown-child:${link.child}`);
    if(!ids.has(link.parent) && !ROOT_IDS.includes(link.parent)) errors.push(`unknown-parent:${link.parent}`);
    if(parents.has(link.child)) errors.push(`duplicate-parent:${link.child}`);
    if(!['direct-leadership','ministerial-jurisdiction'].includes(link.relation)) errors.push(`relation:${link.child}`);
    if(!link.sourceIds?.length || link.sourceIds.some(id=>!hierarchy.sources.some(s=>s.id===id))) errors.push(`source:${link.child}`);
    parents.set(link.child,link.parent);
  }
  for(const id of ids) {
    if(!parents.has(id)) errors.push(`missing-parent:${id}`);
    const seen=new Set([id]);let next=parents.get(id);
    while(next && !ROOT_IDS.includes(next)) {
      if(seen.has(next)) {errors.push(`cycle:${id}`);break;}
      seen.add(next);next=parents.get(next);
    }
  }
  for(const node of hierarchy.territorialExamples || []) {
    if(!ids.has(node.parent) || !node.url?.startsWith('https:') || !node.sourceIds?.length) errors.push(`territorial:${node.id}`);
  }
  return errors;
}
export function ancestorsOf(id,hierarchy) {
  const parents=new Map(hierarchy.links.map(x=>[x.child,x.parent])), seen=new Set(), result=[];
  let next=parents.get(id);
  while(next && !seen.has(next)) {seen.add(next);result.unshift(next);next=parents.get(next);}
  return result;
}
export function childrenOf(id,hierarchy) { return hierarchy.links.filter(x=>x.parent===id).map(x=>x.child); }
export function hierarchySearch(query,authorities,localize=x=>x) {
  const q=query.trim().toLocaleLowerCase().replaceAll('ё','е');
  if(!q)return [];
  return authorities.filter(a=>!['fund','corporation'].includes(a.entityType) && [a.id,a.name,a.shortName,localize(a.name),localize(a.shortName)].join(' ').toLocaleLowerCase().replaceAll('ё','е').includes(q));
}
