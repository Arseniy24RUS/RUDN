// Keep the original map as the first choice. The compact copy preserves every
// vertex and only changes TopoJSON's coordinate encoding; it is a lazy fallback.
const abortError=()=>new DOMException('Map loading cancelled','AbortError');

export function validateRussiaTopology(value){
  const collections=Object.values(value?.objects||{});
  const regions=collections.find(item=>item?.type==='GeometryCollection'&&item.geometries?.length===89);
  if(value?.type!=='Topology'||!Array.isArray(value.arcs)||!value.arcs.length||!regions||
    regions.geometries.some(item=>!['Polygon','MultiPolygon'].includes(item.type)||!Array.isArray(item.arcs))){
    throw new Error('map/invalid-russia-topology');
  }
  return value;
}

async function fetchTopology(fetchImpl,url,options,timeoutMs){
  // Reject before constructing the cancellation race: an already-aborted
  // signal would otherwise leave its rejected Promise without a handler.
  if(options.signal?.aborted)throw abortError();
  const controller=new AbortController();
  let timer,abort;
  const cancelled=new Promise((_,reject)=>{
    abort=()=>{controller.abort();reject(abortError())};
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted)abort();
    timer=setTimeout(()=>{controller.abort();reject(new Error('map/download-timeout'))},timeoutMs);
  });
  try{
    if(options.signal?.aborted)throw abortError();
    const download=(async()=>{
      const response=await fetchImpl(url,{...options,signal:controller.signal});
      if(!response.ok)throw new Error(`map/http-${response.status}`);
      // The deadline covers the body too: some proxies send headers promptly
      // and then leave a large response pending indefinitely.
      return validateRussiaTopology(await response.json());
    })();
    return await Promise.race([download,cancelled]);
  }finally{
    clearTimeout(timer);
    options.signal?.removeEventListener('abort',abort);
  }
}

export async function loadRussiaMap({fetchImpl=globalThis.fetch,primaryUrl,fallbackUrl,options={},primaryTimeoutMs=12000,fallbackTimeoutMs=20000}){
  try{
    const geometry=await fetchTopology(fetchImpl,primaryUrl,options,primaryTimeoutMs);
    return {geometry,source:'primary'};
  }catch(error){
    // Navigation, a new map or a changed profile must never start a fallback
    // download for an abandoned attempt.
    if(options.signal?.aborted)throw abortError();
    const geometry=await fetchTopology(fetchImpl,fallbackUrl,options,fallbackTimeoutMs);
    return {geometry,source:'fallback'};
  }
}
