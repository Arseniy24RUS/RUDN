/** The native game owns the available viewport only while its map is open. */
export function createSettlementsPresentation(container){
  const root=document.documentElement,abort=new AbortController();
  let playing=false,disposed=false,origin=null,nativeOwned=false,nativeRequest=null;
  function size(){
    if(!playing)return;
    const viewport=globalThis.visualViewport;
    container.style.setProperty('--game-viewport-height',`${viewport?.height||innerHeight}px`);
    container.style.setProperty('--game-viewport-top',`${viewport?.offsetTop||0}px`);
  }
  function leaveNative(){
    if(nativeOwned&&document.fullscreenElement===root)void document.exitFullscreen?.().catch(()=>{});
    nativeOwned=false;
  }
  function setView(view){
    const next=!disposed&&view!=='lobby';
    if(next===playing)return;
    playing=next;
    if(next){
      origin={x:scrollX,y:scrollY,focus:document.activeElement};
      root.classList.add('settlements-playing');container.dataset.presentation='game';size();
      // Browser chrome can only be removed where the browser permits it. The
      // application viewport stays immersive even when this API is unavailable.
      if(!document.fullscreenElement&&root.requestFullscreen&&navigator.userActivation?.isActive){
        nativeRequest=root.requestFullscreen({navigationUI:'hide'}).then(()=>{
          nativeOwned=true;if(!playing||disposed)leaveNative();
        }).catch(()=>{}).finally(()=>{nativeRequest=null;});
      }
      queueMicrotask(()=>{if(playing&&!disposed){const heading=container.shadowRoot?.querySelector('.game-heading');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});}});
    }else{
      delete container.dataset.presentation;root.classList.remove('settlements-playing');
      container.style.removeProperty('--game-viewport-height');container.style.removeProperty('--game-viewport-top');leaveNative();
      const previous=origin;origin=null;
      if(previous){scrollTo(previous.x,previous.y);const focus=previous.focus?.isConnected?previous.focus:container.shadowRoot?.querySelector('[data-action="resume"],[data-action="tutorial"],[data-action="start"]');focus?.focus?.({preventScroll:true});}
    }
  }
  addEventListener('resize',size,{signal:abort.signal});
  globalThis.visualViewport?.addEventListener('resize',size,{signal:abort.signal});
  globalThis.visualViewport?.addEventListener('scroll',size,{signal:abort.signal});
  document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement!==root)nativeOwned=false;size();},{signal:abort.signal});
  return {setView,destroy(){if(!disposed){disposed=true;setView('lobby');abort.abort();}return nativeRequest||Promise.resolve();}};
}
