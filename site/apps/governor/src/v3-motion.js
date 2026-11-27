(function (root) {
  'use strict';
  const G=root.GovernorGame;
  const constructionPlans={
    foundation:['loader','worker'],
    frame:['crew','worker'],
    finishing:['crew','worker']
  };
  function workLayer(building) {
    const stage=building.dataset.v3Construction,plan=constructionPlans[stage];
    if(!plan)return null;
    const layer=document.createElement('div');
    layer.className='v3-build-activity';
    layer.dataset.stage=stage;
    layer.setAttribute('aria-hidden','true');
    for(const axis of ['--x','--y'])layer.style.setProperty(axis,building.style.getPropertyValue(axis));
    for(const actor of plan){
      const image=document.createElement('img');
      image.className='v3-site-'+actor;
      image.alt='';
      image.draggable=false;
      image.src=G.resolveAsset('assets/v3/site-'+actor+'.webp');
      layer.append(image);
    }
    if(stage!=='finishing'){
      const dust=document.createElement('span');
      dust.className='v3-site-dust';
      layer.append(dust);
    }
    building.after(layer);
    return layer;
  }

  const SVG='http://www.w3.org/2000/svg';
  function svg(tag,attributes){
    const node=document.createElementNS(SVG,tag);
    for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
    return node;
  }
  function routeLayer(map,state){
    const routes=state()?.stats?.school?.routes||[];
    const places=G.V3Rules.DISTRICTS;
    const overlay=svg('svg',{class:'v3-service-routes',viewBox:'0 0 1000 540',preserveAspectRatio:'none','aria-hidden':'true'});
    const destinations=new Set(routes.filter(row=>row.pupils>0&&places[row.to]).map(row=>row.to));
    const from=places.suburb;
    for(const id of destinations){
      const to=places[id],x1=1000*from.x,y1=540*from.y,x2=1000*to.x,y2=540*to.y;
      const points=`M${x1},${y1} Q${(x1+x2)/2},${(y1+y2)/2-42} ${x2},${y2}`;
      overlay.append(svg('path',{class:'v3-existing-link',d:points}),
        svg('path',{class:'v3-trip-link',d:points,'data-v3-map-motion':''}));
    }
    if(destinations.size)map.prepend(overlay);
    return overlay;
  }
  function attach(scene, ui, state) {
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const connection=navigator.connection;
    const scenes=new Map();
    const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
      for(const entry of entries){
        const item=scenes.get(entry.target);
        if(item)item.visible=entry.isIntersecting&&entry.intersectionRatio>=.15;
      }
      update();
    },{threshold:[0,.15]}):null;
    const enabled=()=>!motion.matches&&ui().motion!=='still'&&!document.hidden&&!connection?.saveData;
    function play(host,item) {
      if(!item.video){
        const video=document.createElement('video');
        video.muted=true;
        video.defaultMuted=true;
        video.playsInline=true;
        video.loop=true;
        video.disablePictureInPicture=true;
        video.setAttribute('aria-hidden','true');
        video.className='v3-scene-video';
        for(const [ext,type] of [['webm','video/webm'],['mp4','video/mp4']]){
          const source=document.createElement('source');
          source.type=type;
          source.src=G.resolveAsset('assets/v3/river-card-720.'+ext);
          video.append(source);
        }
        video.addEventListener('playing',()=>{if(enabled()&&item.visible)video.classList.add('v3-scene-playing');});
        video.addEventListener('error',()=>{item.failed=true;video.classList.remove('v3-scene-playing');});
        host.append(video);
        item.video=video;
      }
      if(item.video.paused)item.video.play().catch(()=>item.video.classList.remove('v3-scene-playing'));
    }
    function update() {
      const wanted=new Set(scene.querySelectorAll('[data-v3-motion=river], [data-v3-construction], .v3-overview'));
      for(const [host,item] of scenes){
        if(wanted.has(host))continue;
        observer?.unobserve(host);
        item.video?.pause();item.layer?.remove();scenes.delete(host);
      }
      for(const host of wanted){
        if(!scenes.has(host)){
          scenes.set(host,{visible:false,video:null,layer:null});
          observer?.observe(host);
        }
      }
      scene.classList.toggle('v3-motion-paused',!enabled());
      for(const [host,item] of scenes){
        if(host.classList.contains('v3-overview')){
          if(item.visible&&!item.layer)item.layer=routeLayer(host,state);
          item.layer?.classList.toggle('v3-route-active',enabled()&&item.visible);
        } else if(host.matches('[data-v3-construction]')){
          if(item.visible&&!item.layer)item.layer=workLayer(host);
          item.layer?.classList.toggle('v3-building-active',enabled()&&item.visible);
        } else if(enabled()&&item.visible&&!item.failed) {
          play(host,item);
        } else if(item.video) {
          item.video.pause();
          item.video.classList.remove('v3-scene-playing');
        }
      }
    }
    const mutations=new MutationObserver(update);
    mutations.observe(scene,{childList:true,subtree:true});
    motion.addEventListener('change',update);
    document.addEventListener('visibilitychange',update);
    connection?.addEventListener?.('change',update);
    update();
    return {update,destroy(){
      mutations.disconnect();observer?.disconnect();
      motion.removeEventListener('change',update);
      document.removeEventListener('visibilitychange',update);
      connection?.removeEventListener?.('change',update);
      for(const {video,layer} of scenes.values()){video?.pause();layer?.remove();}
      scenes.clear();
    }};
  }
  G.V3Motion={attach};
})(globalThis);
