/** Search is presentation-only; it never changes an assigned independent shift. */
function catalogText(value){return String(value??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();}
export function catalogTopics(templates){return [...new Set(templates.map(c=>c.topic))].sort((a,b)=>a.localeCompare(b,'ru'));}
export function filterCaseCatalog(templates,{query='',level='all',topic='all'}={}){
 const tokens=catalogText(String(query).slice(0,160)).split(/\s+/).filter(Boolean);
 return templates.filter(c=>{
  if(level!=='all'&&c.level!==Number(level))return false;
  if(topic!=='all'&&c.topic!==topic)return false;
  const visible=catalogText([c.title,c.topic,c.curriculumId,c.number,c.opening,c.role?.title].join(' '));
  return tokens.every(token=>visible.includes(token));
 });
}
