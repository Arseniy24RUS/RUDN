const abortError=()=>new DOMException('Metadata loading cancelled','AbortError');

// Native abort alone does not bound a fetch/body implementation that ignores it.
// The independent deadline races the complete headers -> JSON operation.
export function fetchPuzzleMetadata(url,{signal,fetchImpl=globalThis.fetch,timeoutMs=4000,
  setTimer=globalThis.setTimeout,clearTimer=globalThis.clearTimeout}={}){
  if(signal?.aborted)return Promise.reject(abortError());
  if(!Number.isFinite(timeoutMs)||timeoutMs<0)return Promise.reject(new RangeError('Invalid metadata deadline'));
  return new Promise((resolve,reject)=>{
    const controller=new AbortController();
    let settled=false,timer;
    const cleanup=()=>{if(timer!==undefined)clearTimer(timer);signal?.removeEventListener('abort',cancel)};
    const settle=(complete,value)=>{
      if(settled)return;
      settled=true;cleanup();complete(value);
    };
    const stop=error=>{if(settled)return;settle(reject,error);controller.abort()};
    const cancel=()=>stop(abortError());
    signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted){cancel();return}
    timer=setTimer(()=>stop(new DOMException('map/metadata-timeout','TimeoutError')),timeoutMs);
    // Both outcomes are observed even after timeout/cancellation. A late fetch
    // response must not start body work for a request that has already lost.
    const download=Promise.resolve().then(()=>{
      if(settled)return;
      return fetchImpl(url,{signal:controller.signal});
    }).then(response=>{
      if(settled)return;
      if(!response.ok)throw new Error(`geoBoundaries HTTP ${response.status}`);
      return response.json();
    });
    download.then(value=>settle(resolve,value),error=>settle(reject,error));
  });
}
