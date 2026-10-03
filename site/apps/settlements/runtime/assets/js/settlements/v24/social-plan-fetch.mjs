/** Fetch one selected plan as data, so old regions are not retained as JS modules. */
export function parseSocialModule(text){
  const marker='export default ',start=text.indexOf(marker);
  if(start<0)throw new Error('Некорректный файл регионального сценария');
  const json=text.slice(start+marker.length).trim().replace(/;$/,'');
  return JSON.parse(json);
}

export async function fetchSocialPlan(moduleUrl,{signal,fetchImpl=globalThis.fetch,Decompressor=globalThis.DecompressionStream}={}){
  const url=new URL(moduleUrl),compressed=new URL(url);compressed.pathname=compressed.pathname.replace(/\.mjs$/,'.json.gz');
  if(typeof Decompressor==='function'){
    try{
      const response=await fetchImpl(compressed,{signal});
      if(response.ok){
        const buffer=await response.arrayBuffer(),prefix=new Uint8Array(buffer,0,Math.min(buffer.byteLength,2));
        // Some static hosts set Content-Encoding and the browser has already
        // decoded the body. Do not try to decompress it a second time.
        if(prefix[0]!==31||prefix[1]!==139)return await new Response(buffer).json();
        const stream=new Blob([buffer]).stream().pipeThrough(new Decompressor('gzip'));
        return await new Response(stream).json();
      }
    }catch(error){if(signal?.aborted||error?.name==='AbortError')throw error;}
  }
  // Older browsers and an unavailable compressed payload use the same authored
  // JSON inside the source module. Read it as text; never evaluate downloaded JS.
  const response=await fetchImpl(url,{signal});
  if(!response.ok)throw new Error(`Не удалось загрузить региональный сценарий: HTTP ${response.status}`);
  return parseSocialModule(await response.text());
}
