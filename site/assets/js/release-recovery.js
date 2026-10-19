// This small, import-free recovery runs inline even when an old runtime vanished.
(()=>{
  if(globalThis.__RUDN_RELEASE_RECOVERY__)return;
  const html=document.documentElement,scope=html.dataset.releaseScope;
  if(!scope||!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(scope))return;
  const root=new URL(scope,location.origin),flag='rudnRecovery';let active=false,running=false;
  const language=(navigator.language||'ru').slice(0,2);
  const messages={ru:{loading:'Открываем актуальную версию…',missing:'Страница недоступна. Сохранённая работа остаётся на устройстве.'},en:{loading:'Opening the current version…',missing:'This page is unavailable. Your saved work remains on this device.'},zh:{loading:'正在打开当前版本…',missing:'此页面暂不可用。已保存的工作仍保留在此设备上。'}};
  const copy=messages[language]||messages.ru;
  const status=message=>{const node=document.getElementById('releaseRecoveryStatus');if(node)node.textContent=message;};
  function logicalEntry(){
    const pathname=new URL(location.href).pathname;if(!pathname.startsWith(scope))return null;
    let relative=pathname.slice(scope.length);if(relative.endsWith('/'))relative+='index.html';const alias=html.dataset.releaseAlias;
    if(alias&&relative===alias&&/\.html$/.test(alias)&&!alias.split('/').some(x=>!x||x==='..'))return alias;
    if(!relative||relative==='index.html')return 'index.html';
    const match=/^_releases\/[a-f0-9]{32}\/(.+\.html)$/.exec(relative);
    if(!match||match[1].split('/').some(x=>!x||x==='..')||/[\\%]/.test(match[1]))return null;
    return match[1];
  }
  const inside=value=>{const url=new URL(value,root);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))throw Error('scope');return url;};
  async function recover(reason){
    // Never move an already running tab. A URL marker is also a guard when
    // sessionStorage is unavailable or the browser process has been discarded.
    if(active||running||new URL(location.href).searchParams.has(flag))return false;
    const logical=logicalEntry();if(!logical)return false;running=true;status(copy.loading);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(new URL('release.json',root),{cache:'no-store',credentials:'same-origin',signal:controller.signal});if(!response.ok)throw Error('pointer');
      const pointer=await response.json(),target=pointer.current;
      if(pointer.schema!==1||!/^[a-f0-9]{32}$/.test(target?.buildId||'')||!/^[a-f0-9]{64}$/.test(target?.manifestSha256||''))throw Error('target');
      const runtime=new URL(`_releases/${target.buildId}/`,root),manifestURL=inside(target.manifestURL);
      if(manifestURL.href!==new URL('manifest.json',runtime).href)throw Error('manifest-path');
      const result=await fetch(manifestURL,{cache:'no-store',credentials:'same-origin',signal:controller.signal});if(!result.ok)throw Error('manifest');
      const bytes=await result.arrayBuffer(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==target.manifestSha256)throw Error('integrity');
      const manifest=JSON.parse(new TextDecoder().decode(bytes)),entry=manifest.resources?.[logical];
      if(manifest.schema!==1||manifest.buildId!==target.buildId||entry?.kind!=='runtime'||!manifest.publicEntries?.includes(logical))throw Error('entry');
      const url=inside(entry.url);if(url.href!==new URL(logical,runtime).href||url.pathname===location.pathname)throw Error('entry-path');
      url.search=location.search;url.hash=location.hash;url.searchParams.set(flag,'1');
      globalThis.__RUDN_DIAGNOSTICS_BOOTSTRAP__?.record('bootstrap-error',{code:'obsolete-entry',stage:'cold-recovery'});
      location.replace(url.href);return true;
    }catch{status(copy.missing);return false;}finally{clearTimeout(timer);}
  }
  function ready(){active=true;const url=new URL(location.href);if(url.searchParams.has(flag)){url.searchParams.delete(flag);try{history.replaceState(history.state,'',url.href);}catch{}}}
  globalThis.__RUDN_RELEASE_RECOVERY__=Object.freeze({recover,ready});
  addEventListener('error',event=>{if(event.target?.matches?.('script[data-platform-bootstrap]'))void recover('bootstrap-unavailable');},true);
  document.addEventListener('rudn:release-entry-ready',ready,{once:true});
  if(html.dataset.releaseAlias||html.hasAttribute('data-release-missing'))void recover('entry-missing');
})();
