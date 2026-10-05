/** Local-first loader. No login, CDN, IndexedDB or external tiles block startup. */
import {artwork,legacySpriteId} from './assets.mjs';
import {readSettlementsResource} from './network.mjs';
export const DATA = new URL('../../../../data/settlements/v1/', import.meta.url);
export const ART = new URL('../../../img/settlements/v1/', import.meta.url);
export const VISUAL_ART = new URL('../../../img/settlements/v2/', import.meta.url);
export const sprite = id => artwork(id,new URL(`${legacySpriteId(id)}.webp`,VISUAL_ART).href);
const trimmed=new Set(['O-01-ready','O-01-build','O-02-ready','O-02-build','O-03-ready','O-03-build','O-04-ready','O-04-build','O-05-ready','O-05-build','O-06-ready','O-06-build','O-09','O-10']);
export function art(id,size=256){const legacy=legacySpriteId(id),fallback=trimmed.has(legacy)?new URL(`${legacy}.webp`,VISUAL_ART).href:new URL(`${legacy}-${size}.webp`,ART).href;return artwork(id,fallback);}
export async function json(url,{signal,timeout=12000}={}){
  return readSettlementsResource(url,{signal,timeout,read:async response=>{
    if(String(url).endsWith('.gz')){
      if(typeof DecompressionStream==='undefined')throw new Error('GZIP_UNSUPPORTED');
      const bytes=await response.arrayBuffer(),prefix=new Uint8Array(bytes,0,Math.min(bytes.byteLength,2));
      // A CDN may have already decoded Content-Encoding: gzip.
      if(prefix[0]!==31||prefix[1]!==139)return new Response(bytes).json();
      return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
    }return await response.json();
  }});
}
export async function compressed(relative,options={}){
  try{return await json(new URL(relative+'.gz',DATA),options);}
  catch(error){if(options.signal?.aborted)throw error;return json(new URL(relative,DATA),options);}
}
export async function loadRegion(id,{signal,includeMissions=true}={}){
  if(!/^[a-z0-9_]+$/.test(id))throw new Error('Некорректный код региона');
  const [pack,network,missions]=await Promise.all([
    compressed(`regions/${id}.json`,{signal}),
    compressed(`transport/${id}.json`,{signal}),
    includeMissions?json(new URL('missions-v2.json',DATA),{signal}).catch(()=>null):null,
  ]);
  if(missions?.[id])pack.mission=missions[id];return {pack,network};
}
