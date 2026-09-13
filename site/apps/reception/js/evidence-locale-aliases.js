// Exact, build-authored translations of canonical evidence answers. These are
// language aliases, not additional pedagogical answers or student input.
const registered=new Map();
export function evidenceAliasKey(task) {
  return JSON.stringify([task.id,task.extracted?.normalize||'text',task.extracted?.accepted||[]]);
}
export function registerEvidenceLocaleAliases(rows) {
  if(!Array.isArray(rows))throw Error('Invalid Reception evidence aliases.');
  const prepared=[];
  for(const row of rows) {
    if(!row||typeof row.taskId!=='string'||!['text','role'].includes(row.normalize)||!Array.isArray(row.accepted)||!row.accepted.length||row.accepted.some(value=>typeof value!=='string')||!Array.isArray(row.values)||row.values.length!==row.accepted.length)throw Error('Invalid Reception evidence alias scope.');
    const aliases=[];
    for(let index=0;index<row.values.length;index++) {
      const value=row.values[index];
      if(value?.source!==row.accepted[index]||!['en','zh'].every(locale=>typeof value[locale]==='string'&&value[locale].trim()&&value[locale].length<=500))throw Error('Invalid Reception evidence alias value.');
      aliases.push(value.en,value.zh);
    }
    const key=evidenceAliasKey({id:row.taskId,extracted:row}),old=registered.get(key);
    if(old&&JSON.stringify(old)!==JSON.stringify(aliases))throw Error('Conflicting Reception evidence aliases.');
    prepared.push([key,Object.freeze(aliases)]);
  }
  // Register atomically only after every entry passed the compiled-data checks.
  for(const [key,aliases] of prepared)registered.set(key,aliases);
}
export function evidenceLocaleAliases(task) {
  return registered.get(evidenceAliasKey(task))||[];
}
