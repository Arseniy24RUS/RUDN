// A failed immutable release must not be retried by each newly loaded document.
// This small local fence is separate from the accepted diagnostic archive.
export const FAILED_RELEASES_KEY='rudn.update.failed-releases.v1';
const HEX=/^[a-f0-9]{32}$/,LIMIT=32;
const local=()=>{try{return globalThis.localStorage||null}catch{return null}};
function read(storage){
  try{
    if(!storage)return null;
    const text=storage.getItem(FAILED_RELEASES_KEY);if(text===null)return [];
    if(text.length>16384)return null;
    const value=JSON.parse(text);
    if(value?.schema!==1||!Array.isArray(value.entries)||value.entries.length>LIMIT)return null;
    if(!value.entries.every(entry=>HEX.test(entry?.buildId||'')&&HEX.test(entry?.sourceBuild||'')&&Number.isSafeInteger(entry.at)&&entry.at>=0&&['boot-failed','restore-failed'].includes(entry.code)))return null;
    return value.entries;
  }catch{return null}
}
export function hasFailedRelease(buildId,{storage=local()}={}){
  const entries=read(storage);
  // If the fence cannot be read, keep the working document until storage recovers.
  return entries===null||entries.some(entry=>entry.buildId===buildId);
}
export function recordFailedRelease({buildId,sourceBuild,code='restore-failed'},{storage=local(),now=Date.now}={}){
  if(!HEX.test(buildId||'')||!HEX.test(sourceBuild||'')||!['boot-failed','restore-failed'].includes(code))return false;
  const entries=read(storage);if(entries===null)return false;
  const at=now();if(!Number.isSafeInteger(at)||at<0)return false;
  const next=[...entries.filter(entry=>entry.buildId!==buildId),{buildId,sourceBuild,at,code}].slice(-LIMIT);
  try{
    storage.setItem(FAILED_RELEASES_KEY,JSON.stringify({schema:1,entries:next}));
    return read(storage)?.some(entry=>entry.buildId===buildId&&entry.sourceBuild===sourceBuild)===true;
  }catch{return false}
}
