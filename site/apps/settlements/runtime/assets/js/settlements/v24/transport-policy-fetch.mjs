/** Read the authored record as JSON data, without retaining a regional ESM. */
export function parseTransportRecord(text){
  const match=text.match(/^\s*(?:(?:\/\/[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)\s*)*export\s+const\s+DISTANCE_TRANSPORT_RECORD\s*=\s*Object\.freeze\(([\s\S]*)\)\s*;?\s*$/);
  if(!match)throw new Error('Invalid transport record');
  const record=JSON.parse(match[1]);
  if(!Array.isArray(record))throw new Error('Invalid transport record');
  return record;
}
export async function fetchTransportRecord(url,{signal,fetchImpl=globalThis.fetch}={}){
  const response=await fetchImpl(url,{signal});
  if(!response.ok)throw new Error(`Transport record HTTP ${response.status}`);
  return parseTransportRecord(await response.text());
}
