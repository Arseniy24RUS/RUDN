/** Link directories are not live vacancy feeds. Missing dates never mean “open”. */
export function resourceStatus(resource, now = new Date()) {
  const today=now.toISOString().slice(0,10);
  if(resource.deadline && resource.deadline < today) return 'closed';
  if(resource.kind==='announcement') return 'check-deadline';
  const age=resource.checkedAt ? (Date.parse(today)-Date.parse(resource.checkedAt))/86400000 : Infinity;
  if(!Number.isFinite(age) || age<0 || age>90) return 'recheck';
  if(resource.verification==='indirect') return 'indirect';
  return 'directory';
}
export function resourcesForAuthority(authority, resources) {
  return resources.filter(r=>r.authorityIds.includes(authority.id) || (r.authorityIds.includes('*') && !['corporation','fund'].includes(authority.entityType)));
}
export function validResourceUrl(value,allowedHosts) {
  try {const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && allowedHosts.includes(u.hostname);}catch{return false;}
}
