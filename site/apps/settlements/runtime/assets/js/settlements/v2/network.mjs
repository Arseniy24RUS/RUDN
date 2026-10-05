/** Public game files have a second network path; profile traffic stays separate. */
const RUNTIME=new URL('../../../../',import.meta.url);
const GATEWAY=new URL('https://europe-west1-rudn-gmu-learning-platform.cloudfunctions.net/networkGateway/settlements/runtime/');
export function settlementsFallbackUrl(input,{runtimeRoot=RUNTIME,gatewayRoot=GATEWAY}={}){
  const url=new URL(input,runtimeRoot);
  if(url.protocol!=='https:'||url.origin!==runtimeRoot.origin||!url.pathname.startsWith(runtimeRoot.pathname)||url.href.startsWith(gatewayRoot.href))return null;
  const path=url.pathname.slice(runtimeRoot.pathname.length);
  if(!/^(?:data\/settlements\/|assets\/(?:js\/settlements\/|geodata\/federal-cities\/|img\/settlements\/|css\/))/.test(path)||!/^[-A-Za-z0-9_./]+\.(?:m?js|json|geojson|gz|webp|png|svg|css)$/.test(path))return null;
  return new URL(path,gatewayRoot).href;
}
async function bounded(action,{signal,timeout}){
  if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
  const controller=new AbortController();
  let timer,reject;
  const stopped=new Promise((_,fail)=>{reject=fail;});
  const stop=reason=>{controller.abort(reason);reject(reason);};
  const abort=()=>stop(signal.reason||new DOMException('Aborted','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>stop(new DOMException('Game resource timed out','TimeoutError')),timeout);
  try{return await Promise.race([Promise.resolve().then(()=>action(controller.signal)),stopped]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function readSettlementsResource(url,{signal,timeout=12000,fetchImpl=globalThis.fetch,read=response=>response.json(),...roots}={}){
  const load=target=>bounded(async requestSignal=>{
    const response=await fetchImpl(target,{signal:requestSignal,credentials:'omit'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return read(response);
  },{signal,timeout});
  try{return await load(url);}
  catch(error){
    if(signal?.aborted)throw error;
    const fallback=settlementsFallbackUrl(url,roots);
    if(!fallback)throw error;
    return load(fallback);
  }
}
let importAttempt=0;
export async function loadSettlementsGame({moduleUrl=new URL('../v24/game.mjs',import.meta.url),signal,timeout=12000,importImpl=url=>import(url),...roots}={}){
  const url=new URL(moduleUrl);
  const load=target=>bounded(()=>importImpl(target),{signal,timeout});
  try{return await load(url.href);}
  catch(error){
    if(signal?.aborted)throw error;
    const fallback=settlementsFallbackUrl(url,roots);
    if(!fallback)throw error;
    // Failed ESM imports are remembered by the browser. A retry gets a fresh key.
    return load(`${fallback}?attempt=${++importAttempt}`);
  }
}
