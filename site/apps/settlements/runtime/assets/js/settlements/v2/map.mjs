import {WorldIndex,BoundedCache,objectScale,focusSafeRect,fitWorldItems} from './render-index.mjs';
import {CameraController,cameraSnapshot} from './camera.mjs';
import * as L from '../../../vendor/leaflet-1.9.4/leaflet.esm.js';
import {CATALOG,trend,hash} from './engine.mjs';
import {DATA,art,sprite,json,compressed} from './data.mjs';
import {Landscape,clamp,seed} from './landscape.mjs';
import {ArtworkLoader,artworkProfile,artworkTransform,artworkLevel2Profile,artworkFamilyPlacement,artworkBounds,artworkVariant,headingDirection,recordArtworkDraw,setArtworkDiagnostics,TERRAIN_THEMES} from './assets.mjs';
import {MOTION,eventIsCurrent,routeGeometry,routeSample,stableDirection} from './motion.mjs';

export const COLORS={grow:'#138873',stable:'#e0a131',decline:'#e27265',unknown:'#8297a6',medical:'#078e83',school:'#2389ca',culture:'#b98126'};
const TAU=Math.PI*2;
const DETAIL_ZOOM=9;
const SELECTION_ZOOM=10.75;
const SCENE_LAYERS=Object.freeze([{name:'paintedGround',z:250,role:'surface and decorative vegetation'},{name:'localBounds',z:280,role:'supplied boundaries'},{name:'localRoads',z:310,role:'supplied roads'},{name:'mission',z:320,role:'task outline'},{name:'gameCanvas',z:460,role:'routes, residential decoration, facilities, then FX'},{name:'gameSemantics',z:480,role:'population markers, service rings, labels'}]);
function radius(pop,z){const n=pop<500?2+Math.sqrt(Math.max(0,pop))*.045:5.4+3.6*Math.log10(pop/500+1);return clamp(n*clamp((z-3)/7,.5,1.15),1.5,18);}
function hull(points){
  if(points.length<3)return points;const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],up=[];
  for(const p of sorted){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}for(const p of sorted.reverse()){while(up.length>1&&cross(up.at(-2),up.at(-1),p)<=0)up.pop();up.push(p);}lo.pop();up.pop();return lo.concat(up);
}
function rounded(c,x,y,w,h,r=9){c.beginPath();c.roundRect(x,y,w,h,r);}
function overlaps(a,b,pad=0){return a[0]<b[0]+b[2]+pad&&a[0]+a[2]+pad>b[0]&&a[1]<b[1]+b[3]+pad&&a[1]+a[3]+pad>b[1];}
function coversMarker(box,point){const x=clamp(point.x,box[0],box[0]+box[2]),y=clamp(point.y,box[1],box[1]+box[3]);return Math.hypot(point.x-x,point.y-y)<=point.r+2.75;}
function facilityArtBox(id,img,w,h,origin){const anchor=artworkProfile(id,img)?.anchor||[.5,1],transform=artworkTransform(id,img),scale=transform?.scale||1,tx=transform?transform.translation[0]/transform.referenceSize:0,ty=transform?transform.translation[1]/transform.referenceSize:0;return{x:origin[0]+w*(tx-anchor[0]),y:origin[1]+h*(ty-anchor[1]),w:w*scale,h:h*scale,anchor,transform};}
function unionBoxes(boxes){if(!boxes.length)return null;const x=Math.min(...boxes.map(b=>b[0])),y=Math.min(...boxes.map(b=>b[1]));return[x,y,Math.max(...boxes.map(b=>b[0]+b[2]))-x,Math.max(...boxes.map(b=>b[1]+b[3]))-y];}
function alphaBox(img,box){const a=artworkBounds(img);return[box[0]+box[2]*a[0],box[1]+box[3]*a[1],box[2]*(a[2]-a[0]),box[3]*(a[3]-a[1])];}
function circleBoxGap(box,p){const x=clamp(p.x,box[0],box[0]+box[2]),y=clamp(p.y,box[1],box[1]+box[3]);return Math.hypot(p.x-x,p.y-y)-p.r;}
function segmentPointGap(a,b,p){const dx=b[0]-a[0],dy=b[1]-a[1],t=((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy||1);return t>0&&t<1?Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy)-p.r:Infinity;}
const format=n=>Math.round(n).toLocaleString('ru-RU');
/** Local-first 2.5D scene. Map coordinates, demographic colors and engine stay unchanged. */
export class GameMap{
  constructor(element,world,{onSelect,onEmpty,onReady,onNotice}={}){
    Object.assign(this,{element,world,onSelect,onEmpty,onNotice});this.state=null;this.evaluation=null;this.selected=null;this.preview=null;this.tool=null;this.routeFrom=null;this.images=new Map();this.positions=[];this.hits=[];this.effects=[];this.buildingAnims=new Map();this.routeAnims=new Map();this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.destroyed=false;this.service='medical';this.scenic=true;this.historical=true;this._frame=0;this.dirty={scene:true,terrain:true,fx:true};this.geometryRevision=0;this.geometryCache=new BoundedCache(512);this.labelMetrics=new BoundedCache(512);this.diagnosticsActive=false;this.diagnosticsAvailableSince=null;this.frameCosts=[];
    this.motionGeneration=0;this.eventLog=[];this.cancelledEvents=[];this.seenEvents=new Set();this.routeCache=new Map();this.vehicleHeadings=new Map();this.fxFrames=0;this.fxIntervals=[];this.lastFxTime=null;this.drawnMotion={rings:[],labels:[],vehicles:[],pending:[]};this.subscriptions=[];
    const listen=(target,type,handler)=>{if(target===document)target.addEventListener(type,handler);else target.on(type,handler);this.subscriptions.push({target,type,handler});};
    this.images=new ArtworkLoader(sprite,()=>{if(!this.destroyed){this.geometryRevision++;this.geometryCache.clear();this.reservationsDirty=true;this.requestRender();this.revealSelection(this.selected);}});this.outreachNeighbors=new Map();
    const v=world.region.mapView||{},lon=v.center?.[1]||0;this.wrap=Boolean(v.wrapLongitude)||lon>150;
    // Custom scene canvases use settled coordinates; keep every geographic layer on that same zoom.
    this.map=L.map(element,{zoomControl:false,zoomAnimation:false,attributionControl:false,preferCanvas:true,minZoom:3,maxZoom:15,zoomSnap:0,zoomDelta:.75,keyboard:true,touchZoom:true,bounceAtZoomLimits:false,scrollWheelZoom:false,doubleClickZoom:false,worldCopyJump:false});
    this.worldPoints=new Map(this.world.valid.map(row=>{const p=this.map.project(this.ll(row),11);return[row.id,{x:p.x,y:p.y,row}];}));this.worldIndex=new WorldIndex([...this.worldPoints.values()]);
    this.camera=new CameraController(this.map,()=>this.requestRender('camera'),{reduced:()=>this.reduced}).bind(element);
    for(const {name,z} of SCENE_LAYERS){this.map.createPane(name);this.map.getPane(name).style.zIndex=String(z);this.map.getPane(name).style.pointerEvents='none';}
    this.terrain=L.DomUtil.create('canvas','sg-map-terrain',this.map.getPane('paintedGround'));
    this.canvas=L.DomUtil.create('canvas','sg-map-canvas',this.map.getPane('gameCanvas'));this.fx=L.DomUtil.create('canvas','sg-map-fx',this.map.getPane('gameCanvas'));
    // Semantic marks must remain above animated sprites as well as static artwork.
    this.semantic=L.DomUtil.create('canvas','sg-map-canvas',this.map.getPane('gameSemantics'));this.sctx=this.semantic.getContext('2d');this.sceneFrame=0;this.labels=[];this.facilityEvidence=[];this.staticRasterDraws=[];this.fxRasterDraws=[];this.paintCounts={staticFacilities:0,fxFacilities:0,residential:0,transport:0};this.staticFacilityIds=new Set();this.fxFacilityIds=new Set();this.geodata={boundaries:'loading',roads:'loading'};
    this.ctx=this.canvas.getContext('2d');this.fctx=this.fx.getContext('2d');this.tctx=this.terrain.getContext('2d');this.landscape=new Landscape(this.map,this.images,this.wrap);this.landscape.setIndex(this.worldIndex);this.reservationsDirty=true;
    this.drawHandler=()=>this.requestRender('camera');this.clickHandler=e=>this.pick(e.containerPoint);
    listen(this.map,'move zoom resize',this.drawHandler);listen(this.map,'click',this.clickHandler);
    this.cameraMoving=false;this.pendingReveal=null;this.revealEpoch=0;this.overviewActive=false;
    listen(this.map,'movestart',()=>{this.cameraMoving=true;});
    listen(this.map,'dragstart zoomstart',()=>{if(!this.camera.internal)this.camera.cancel();});
    listen(this.map,'moveend',()=>{this.cameraMoving=false;this.requestRender('camera');if(this.pendingReveal)this.scheduleReveal();});
    this.observer=new ResizeObserver(()=>{if(!this.destroyed){this.map.invalidateSize({pan:false});this.requestRender();if(this.overviewActive)this.fitFocus(false,{overview:true});else this.revealSelection(this.selected);}});this.observer.observe(element);
    this.visibilityHandler=()=>{if(document.hidden){cancelAnimationFrame(this.raf);this.raf=null;this.camera.cancel();this.map.stop();this.finishTransient('hidden');}else{this.requestRender();this.animate();if(this.pendingReveal)this.scheduleReveal();}};listen(document,'visibilitychange',this.visibilityHandler);
    this.fitFocus(false);this.loadArtwork();this.loadGeography();onReady?.();
  }
  ll(row){return L.latLng(row.lat,this.wrap&&row.lon<0?row.lon+360:row.lon);}
  zoomLevel(){return this.inFrame?this.frameCamera.zoom:this.map.getZoom();}
  viewportSize(){return this.inFrame?{x:this.frameCamera.width,y:this.frameCamera.height}:this.map.getSize();}
  view(){return this.inFrame?this.frameCamera:cameraSnapshot(this.map);}
  screen(row){const p=this.worldPoints.get(row.id),v=this.view();return p?L.point(Math.round(p.x*v.scale)-v.ox*v.scale,Math.round(p.y*v.scale)-v.oy*v.scale):this.map.latLngToContainerPoint(this.ll(row));}
  requestRender(layer='scene'){if(this.destroyed)return;this.dirty.scene=true;this.dirty.terrain=true;this.dirty.fx=true;if(layer!=='camera')this.obstacleCache=null;this.ensureFrame();}
  ensureFrame(){if(this.raf||this.destroyed||document.hidden)return;this.raf=requestAnimationFrame(now=>this.frame(now));}
  frame(now){
    this.raf=null;if(this.destroyed||document.hidden||!this.map._loaded)return;const started=performance.now();this.camera.step(now);this.frameCamera=cameraSnapshot(this.map);this.inFrame=true;
    try{const scene=this.dirty.scene;this.dirty.scene=false;if(scene)this.paintScene();
      else if(this.dirty.terrain){this.dirty.terrain=false;const v=this.frameCamera;this.landscape.paint(this.tctx,v.width,v.height,this.positions,[],[],v,this.cameraMoving);}
      if(scene||this.dirty.fx||this.hasMotion()){this.dirty.fx=false;this.drawFx(now);}
      if(this.revealPending&&!this.cameraMoving){this.revealPending=false;this.adjustSelectionView();}
    }finally{this.inFrame=false;}
    const cost=performance.now()-started;this.frameCosts.push(cost);if(this.frameCosts.length>240)this.frameCosts.shift();this.landscape.observeBudget(cost,this.cameraMoving,now);if(this.landscape.needsFrame)this.dirty.terrain=true;
    if(this.dirty.scene||this.dirty.terrain||this.dirty.fx||this.camera.active||this.hasMotion()||this.revealPending&&!this.cameraMoving)this.ensureFrame();
  }
  hasMotion(){return this.effects.length||!this.reduced&&((this.state?.routes?.length||0)>0&&this.zoomLevel()>=DETAIL_ZOOM||[...this.buildingAnims.values()].some(a=>!a.pending)||this.routeAnims.size);}
  render(){this.requestRender();}
  loadArtwork(){
    this.preparePreview(null,'medical');
  }
  preparePreview(preview,tool){
    const ids=[],action=preview?.action,spec=CATALOG[action?.kind||tool];
    if(spec?.art?.endsWith('-ready'))ids.push(spec.art,spec.art.replace('-ready','-build'));
    const family=artworkFamilyPlacement(spec?.art||'');if(family)ids.push(...family.assets);
    if(action?.type==='upgrade'){const facility=preview.proposed?.facilities.find(f=>f.id===action.id),artId=facility&&CATALOG[facility.type].upgradeArt;if(artId)ids.push(artId,artId.replace('-ready','-build'));}
    if(tool==='outreach'&&this.selected){const row=this.world.row(this.selected);if(row)ids.push(`mobile_med_${this.outreachDirection(row)}`);}
    if(tool==='bus')ids.push('bus_se');
    return this.images.prefetch(ids);
  }
  outreachDirection(row){
    if(!this.outreachNeighbors.has(row.id)){let neighbor=null;
      for(let i=0;i<this.world.drive.length;i++){const candidate=this.world.rows[i];if(candidate?.id===row.id||!Number.isFinite(candidate?.lat)||!Number.isFinite(candidate?.lon))continue;
        if(this.world.drive[i].some(([to])=>to===row.index)&&(candidate.lat!==row.lat||candidate.lon!==row.lon)&&(!neighbor||candidate.id<neighbor.id))neighbor=candidate;}
      this.outreachNeighbors.set(row.id,neighbor);
    }
    const neighbor=this.outreachNeighbors.get(row.id);if(!neighbor)return 'se';const a=this.screen(neighbor),b=this.screen(row);return headingDirection(b.x-a.x,b.y-a.y);
  }
  async loadGeography(){
    this.abort=new AbortController();const signal=this.abort.signal;
    try{const boundary=await json(new URL(`boundaries/${this.world.region.id}.geojson`,DATA),{signal});if(this.destroyed)return;
      this.boundary=L.geoJSON(boundary,{pane:'localBounds',interactive:false,coordsToLatLng:c=>L.latLng(c[1],this.wrap&&c[0]<0?c[0]+360:c[0]),style:{color:'#8ea793',weight:1.6,fillOpacity:0,opacity:.75}}).addTo(this.map);
      this.geodata.boundaries='loaded';
    }catch(e){this.geodata.boundaries='unavailable';if(!signal.aborted)this.onNotice?.('Граница недоступна; поселения остаются на карте.');}
    try{const roads=await compressed(`roads/${this.world.region.id}.geojson`,{signal});if(this.destroyed)return;
      this.landscape.setRoads(roads);
      this.geodata.roads='loaded';
      this.roads=L.geoJSON(roads,{pane:'localRoads',interactive:false,coordsToLatLng:c=>L.latLng(c[1],this.wrap&&c[0]<0?c[0]+360:c[0]),style:f=>({color:['motorway','trunk','primary'].includes(f.properties?.roadClass)?'#faf7e5':'#eeeacf',weight:['motorway','trunk'].includes(f.properties?.roadClass)?4:2.6,opacity:.90,lineCap:'round'})}).addTo(this.map);
      this.roadEdges=L.geoJSON(roads,{pane:'localRoads',interactive:false,coordsToLatLng:c=>L.latLng(c[1],this.wrap&&c[0]<0?c[0]+360:c[0]),style:f=>({color:'#b2b590',weight:['motorway','trunk'].includes(f.properties?.roadClass)?1.2:.7,opacity:.8,dashArray:'',lineCap:'round'})}).addTo(this.map);this.requestRender();
    }catch(e){this.geodata.roads='unavailable';if(!signal.aborted)this.onNotice?.('Дорожный слой не загрузился. Учебная сеть доступна.');}
  }
  bounds(ids){const rows=(ids?ids.map(id=>this.world.row(id)):this.world.valid).filter(r=>r&&Number.isFinite(r.lat)&&Number.isFinite(r.lon));return L.latLngBounds(rows.map(r=>this.ll(r)));}
  getPadding(){const mobile=this.element.clientWidth<=760,short=this.element.clientHeight<520&&!mobile;return mobile?{top:[36,215],bottom:[56,200]}:short?{top:[332,64],bottom:[56,116]}:{top:[400,150],bottom:[92,208]};}
  focusFootprint(f,zoom){
    const peers=(this.state?.facilities||[]).filter(p=>p.at===f.at),idx=peers.findIndex(p=>p.id===f.id),spec=CATALOG[f.type],row=this.world.row(f.at),id=f.type==='outreach'?`mobile_med_${this.outreachDirection(row)}`:f.level>1&&spec.upgradeArt?spec.upgradeArt:spec.art,img=this.images.get(id),profile=artworkProfile(id,img),transport=profile?.family==='transport',family=artworkFamilyPlacement(id,img);
    const base=(transport?10.75*3.1:85.5)*objectScale(zoom),w=peers.length>1?base*.79:base,offset=(idx-(peers.length-1)/2)*w*.64,boxes=[];
    for(const member of family?.assets||[id]){const image=this.images.get(member),h=image.naturalWidth?w*image.naturalHeight/image.naturalWidth:w,rect=facilityArtBox(member,image,w,h,[0,0]);boxes.push(alphaBox(image,[rect.x,rect.y,rect.w,rect.h]));}
    const [x,y,bw,bh]=unionBoxes(boxes);
    if(transport){const reach=Math.max(42,radius(row.population,zoom)+11.35+Math.max(bw,bh)/2+(family?.pointGapCss||3)+2);return{left:x-reach,top:y-reach,right:x+bw+reach,bottom:y+bh+reach};}
    return{left:x+offset,top:y-14-(family?.maxLiftCss||0),right:x+bw+offset,bottom:y+bh-14};
  }
  fitFocus(animated=true,{overview=false}={}){
    this.camera.cancel();this.overviewActive=overview;this.reservationsDirty=true;this.requestRender();
    if(overview){
      // Explicit overview supersedes queued detail framing, including a restore
      // whose images may finish decoding after the user presses this button.
      if(this.camera.nativeMoving)this.map.stop();
      this.revealEpoch++;this.pendingReveal=null;this.restoredRevealId=null;this.revealPending=false;this.placementReframe=null;
    }
    const ids=this.state?.focus||this.world.focus().ids,b=this.bounds(ids);if(!b.isValid()){this.map.setView([55,60],8);return;}
    const focus=new Set(ids),facilities=overview?[]:(this.state?.facilities||[]).filter(f=>focus.has(f.at)),maxZoom=11.5;
    if(overview){
      // The explicit command frames every task point. Detailed artwork remains
      // the responsibility of selection, construction and restore framing.
      this.obstacleCache=null;const size=this.viewportSize(),safe=focusSafeRect(size.x,size.y,this.obstacles()),items=ids.map(id=>this.worldPoints.get(id)).filter(Boolean).map(p=>{const r=radius(p.row.population,maxZoom)+12.35;return{x:p.x,y:p.y,left:-r,top:-r,right:r,bottom:r};});
      // Reserve every fixed compact alternative, including its border, rather
      // than letting a point-safe camera clip a marker against the HUD.
      const places=new Map();for(const f of this.state?.facilities||[])if(focus.has(f.at))places.set(f.at,(places.get(f.at)||0)+1);
      for(const [at,count] of places){const p=this.worldPoints.get(at);if(p){const r=radius(p.row.population,maxZoom)+11.35+6+1.5;items.push({x:p.x,y:p.y,left:-r-count*30,right:r+count*30,top:-r-30,bottom:r+30});}}
      const fit=fitWorldItems(items,safe,size.x,size.y,3,maxZoom);
      if(fit?.fits){this.map.setView(this.map.unproject([fit.x,fit.y],11),fit.zoom,{animate:animated&&!this.reduced,duration:.55});return;}
    }
    if(facilities.length){
      // Fit the task together with the complete approved art/lift envelope. The
      // HUD is measured now, so a clinic cannot be placed beneath its mission card.
      this.obstacleCache=null;const size=this.viewportSize(),safe=focusSafeRect(size.x,size.y,this.obstacles()),items=ids.map(id=>this.worldPoints.get(id)).filter(Boolean).map(p=>{const r=radius(p.row.population,maxZoom)+11.35;return{x:p.x,y:p.y,left:-r,top:-r,right:r,bottom:r};});
      for(const f of facilities){const p=this.worldPoints.get(f.at);if(p)items.push({x:p.x,y:p.y,...this.focusFootprint(f,maxZoom)});}
      const fit=fitWorldItems(items,safe,size.x,size.y,3,maxZoom),f=facilities.find(f=>f.at===this.selected)||facilities.at(-1);
      if(fit?.fits&&fit.zoom>=DETAIL_ZOOM){
        this.map.setView(this.map.unproject([fit.x,fit.y],11),fit.zoom,{animate:animated&&!this.reduced,duration:.55});
        // The safe HUD envelope alone does not resolve dense source-point
        // collisions. Reuse the bounded reveal only if no accepted lift fits.
        // Resolvable full-task views keep their existing camera and context.
        if(this.buildingBox(f,false,true)?.placementClearance?.fit===false){this.placementReframe=null;this.restoredRevealId=f.at;this.pendingReveal=f.at;this.scheduleReveal();}
        return;
      }
      // A short viewport cannot always contain the whole task and readable art.
      // Reuse the existing bounded reveal for a facility inside this task; never
      // change the selection/tool or shrink it into the non-art overview LOD.
      const row=this.world.row(f.at);
      this.placementReframe=null;this.restoredRevealId=f.at;this.pendingReveal=f.at;
      this.map.setView(this.ll(row),SELECTION_ZOOM,{animate:false});this.scheduleReveal();return;
    }
    const p=this.getPadding();if(this.element.clientHeight<670&&this.element.clientWidth<=760){p.top[1]=174;p.bottom[1]=148;}this.map.fitBounds(b,{paddingTopLeft:p.top,paddingBottomRight:p.bottom,maxZoom,animate:animated&&!this.reduced,duration:.55});
  }
  fitAll(){this.overviewActive=false;this.reservationsDirty=true;const b=this.bounds(),p=this.getPadding();if(b.isValid())this.map.fitBounds(b,{paddingTopLeft:p.top,paddingBottomRight:p.bottom,animate:!this.reduced,duration:.65});}
  // Explicit selection starts from the same snapped zoom, independent of prior view or reload.
  panTo(id){const row=this.world.row(id);if(!row)return;this.overviewActive=false;this.placementReframe=null;this.pendingReveal=id;this.map.setView(this.ll(row),SELECTION_ZOOM,{animate:false});this.scheduleReveal();}
  frameRestoredFacility(){
    // Reuse selection zoom for the latest restored primary-art facility.
    // One initial frame only: no selection/state change and no repeated fit/zoom loop.
    const f=this.state?.facilities.at(-1);if(!f)return;const row=this.world.row(f.at);if(!row)return;
    const spec=CATALOG[f.type],id=f.type==='outreach'?`mobile_med_${this.outreachDirection(row)}`:f.level>1?spec.upgradeArt:spec.art,family=artworkFamilyPlacement(id);if(!family)return;
    const restoredState=this.state,revealEpoch=this.revealEpoch;this.images.prefetch(family.assets).then(()=>{if(this.destroyed||this.state!==restoredState||revealEpoch!==this.revealEpoch||this.selected||!artworkProfile(id,this.images.get(id)))return;
      this.restoredRevealId=f.at;this.pendingReveal=f.at;this.map.setView(this.ll(row),SELECTION_ZOOM,{animate:false});this.scheduleReveal();});
  }
  revealSelection(id){
    if(!id||id!==this.selected||this.destroyed||this.overviewActive)return;this.pendingReveal=id;
    this.scheduleReveal();
  }
  scheduleReveal(){this.revealPending=true;this.requestRender();}
  retrySelectionZoom(id){
    const retry=this.placementReframe?.at===id?this.placementReframe:{at:id,attempts:0};this.placementReframe=retry;
    if(retry.attempts>=4||this.zoomLevel()>=15)return false;
    retry.attempts++;this.pendingReveal=id;if(id!==this.selected)this.restoredRevealId=id;this.map.setZoom(Math.min(15,this.zoomLevel()+.75),{animate:false});this.scheduleReveal();return true;
  }
  adjustSelectionView(animated=true){
    const id=this.pendingReveal;this.pendingReveal=null;if(this.destroyed||id!==this.selected&&id!==this.restoredRevealId)return;this.restoredRevealId=null;
    const row=this.world.row(id);if(!row)return;const p=this.screen(row),size=this.viewportSize(),r=Math.max(18,radius(row.population,this.zoomLevel())+11);
    const pieces=[[-r,-r,r*2,r*2]];
    const action=this.preview?.action,facilities=this.preview?.proposed?.facilities||this.state?.facilities||[];
    const facility=facilities.find(f=>f.at===id&&(action?.id?f.id===action.id:action?.type==='build'?!this.state.facilities.some(old=>old.id===f.id):true));
    if(facility&&this.zoomLevel()<DETAIL_ZOOM){this.pendingReveal=id;if(id!==this.selected)this.restoredRevealId=id;this.map.setView(this.ll(row),SELECTION_ZOOM,{animate:false});this.scheduleReveal();return;}
    let needsReframe=false;
    if(facility){const ghost=!this.state.facilities.some(f=>f.id===facility.id),b=this.buildingBox(facility,ghost);if(b){
      needsReframe=Boolean(b.placementClearance?.needsReframe||b.placementClearance?.localPlacement&&!b.placementClearance.fit);
      const box=b.familyAlphaBox||b.sharedBox||[b.x,b.y,b.w,b.h];pieces.push([box[0]-p.x,box[1]-p.y,box[2],box[3]]);}}
    // Selected names are part of the same safe camera frame as the real point and facility.
    // Dense views may need bounded zoom before a collision-free nearby label exists.
    const label=this.labels.find(l=>l.id===id),labelOptions=id===this.selected?[...(label?[label.box]:[]),...(this.selectedLabelCandidates||[])]:[null];
    if((needsReframe||!labelOptions.length)&&this.retrySelectionZoom(id))return;
    const margin=8,obstacles=this.obstacles();let target=null,distance=Infinity;
    // Keep the point, full family alpha and nearby label together, but do not reserve
    // empty space between them: the free map area can be L-shaped in landscape.
    for(const labelBox of labelOptions.length?labelOptions:[null]){
      const labelPart=labelBox&&[labelBox[0]-p.x,labelBox[1]-p.y,labelBox[2],labelBox[3]],parts=labelPart?[...pieces,labelPart]:pieces;
      // layoutLabels already permits <=8px vertical edge clamping. Include that
      // same fallback in the camera search, then validate its actual clamped box.
      const bounds=unionBoxes(labelPart?[...pieces,[labelPart[0],labelPart[1]+8,labelPart[2],labelPart[3]-16]]:parts),l=bounds[0],r=l+bounds[2],t=bounds[1],b=t+bounds[3];
      const minX=margin-l,maxX=size.x-margin-r,minY=margin-t,maxY=size.y-margin-b;if(minX>maxX||minY>maxY)continue;
      const xs=[clamp(p.x,minX,maxX),minX,maxX],ys=[clamp(p.y,minY,maxY),minY,maxY];
      const searchParts=labelPart?[...parts,[labelPart[0],labelPart[1]-8,labelPart[2],labelPart[3]],[labelPart[0],labelPart[1]+8,labelPart[2],labelPart[3]]]:parts;
      for(const [x,y,w,h] of obstacles)for(const [px,py,pw,ph] of searchParts){xs.push(clamp(x-margin-px-pw,minX,maxX),clamp(x+w+margin-px,minX,maxX));ys.push(clamp(y-margin-py-ph,minY,maxY),clamp(y+h+margin-py,minY,maxY));}
      for(const x of new Set(xs))for(const y of new Set(ys)){
        const boxes=pieces.map(([px,py,pw,ph])=>[x+px,y+py,pw,ph]);
        if(labelPart){const ly=clamp(y+labelPart[1],4,size.y-8-labelPart[3]),dy=ly-y-labelPart[1];if(Math.abs(dy)>8)continue;
          const local=[labelBox[0],labelBox[1]+dy,labelBox[2],labelBox[3]];
          if(dy&&(this.labelBuildingBoxes.some(o=>overlaps(local,o,2))||this.positions.some(q=>circleBoxGap(local,{x:q.x,y:q.y,r:q.outerRadius??q.r})<3)))continue;
          boxes.push([x+labelPart[0],ly,labelPart[2],labelPart[3]]);}
        if(boxes.some(box=>obstacles.some(o=>overlaps(box,o,margin))))continue;
        const d=(x-p.x)**2+(y-p.y)**2;if(d<distance){target={x,y};distance=d;}}
    }
    if(!target){this.retrySelectionZoom(id);return;}
    if(!needsReframe&&labelOptions.length)this.placementReframe=null;
    // A single corrective pan after the existing camera motion; user pan/zoom stays unrestricted.
    if(target&&distance>1)this.map.panBy([p.x-target.x,p.y-target.y],{animate:animated&&!this.reduced,duration:.25});
  }
  zoom(delta){this.camera.zoomBy(delta);}
  setScenic(enabled){this.scenic=enabled;this.landscape.enabled=enabled;this.element.classList.toggle('sg-flat-map',!enabled);this.requestRender();}
  setTheme(theme){this.landscape.theme=Object.hasOwn(TERRAIN_THEMES,theme)?theme:'grass';this.requestRender();}
  setBasemap(){/* Compatibility no-op: geography is local-only. */}
  update({state,evaluation,selected,preview,tool,routeFrom,service,historical,commit}){
    this.geometryRevision++;this.geometryCache.clear();this.reservationsDirty=true;
    const selectionChanged=selected!==this.selected||preview!==this.preview,toolChanged=tool!==this.tool;
    if(selectionChanged||commit)this.overviewActive=false;
    if(this.state&&state!==this.state){
      if(state.attemptId!==this.state.attemptId)this.resetMotion();
      else this.cancelRemoved(state);
      const routes=new Set(state.routes.map(r=>r.id));for(const id of this.routeCache.keys())if(!routes.has(id)&&id!=='preview'){this.routeCache.delete(id);this.vehicleHeadings.delete(id);}
    }
    Object.assign(this,{state,evaluation,selected,preview,tool,routeFrom,service:service||this.service,historical:historical??this.historical});
    if(commit)this.commitMotion(commit);
    else if(selectionChanged||toolChanged)this.effects=[];
    if(selectionChanged||toolChanged)this.preparePreview(preview,tool);
    if(!this.mission){const pts=state.focus.map(id=>this.world.row(id)).filter(Boolean).map(r=>[this.ll(r).lng,r.lat]),poly=hull(pts);
      if(poly.length>=3){const cx=poly.reduce((s,p)=>s+p[0],0)/poly.length,cy=poly.reduce((s,p)=>s+p[1],0)/poly.length;this.mission=L.polygon(poly.map(p=>[cy+(p[1]-cy)*1.17,cx+(p[0]-cx)*1.17]),{pane:'mission',color:'#456f6b',weight:1.8,dashArray:'5 8',fillColor:'#eff9d7',fillOpacity:.09,interactive:false}).addTo(this.map);}}
    this.render();this.animate();if(selected&&selectionChanged)this.revealSelection(selected);
    // Confirm changes HUD height while clearing selection. Frame the committed origin
    // against that new layout before the browser paints the first construction frame.
    if(commit?.origin){this.pendingReveal=commit.origin;this.restoredRevealId=commit.origin;this.placementReframe=null;this.scheduleReveal();}
  }
  resizeCanvas(canvas,ctx){const view=this.view(),size={x:view.width,y:view.height},dpr=Math.min(2,window.devicePixelRatio||1);if(canvas.width!==Math.round(size.x*dpr)||canvas.height!==Math.round(size.y*dpr)){canvas.width=Math.round(size.x*dpr);canvas.height=Math.round(size.y*dpr);canvas.style.width=size.x+'px';canvas.style.height=size.y+'px';}ctx.setTransform(dpr,0,0,dpr,0,0);L.DomUtil.setPosition(canvas,view.layer);return size;}
  obstacles(){if(this.obstacleCache)return this.obstacleCache;const origin=this.element.getBoundingClientRect();return this.obstacleCache=Array.from(this.element.parentElement.querySelectorAll('.sg-header,.sg-mission,.sg-map-controls,.sg-dock,.sg-tools,.sg-legend,.sg-scene-toggle')).map(el=>{const r=el.getBoundingClientRect();return[r.left-origin.left,r.top-origin.top,r.width,r.height];}).filter(r=>r[2]&&r[3]);}
  paintScene(){
    if(this.destroyed||document.hidden||!this.map._loaded)return;const c=this.ctx,{x:w,y:h}=this.resizeCanvas(this.canvas,c);this.resizeCanvas(this.fx,this.fctx);this.resizeCanvas(this.semantic,this.sctx);this.resizeCanvas(this.terrain,this.tctx);c.clearRect(0,0,w,h);this.sctx.clearRect(0,0,w,h);this.sceneFrame++;this.paintedAt=performance.now();this.staticRasterDraws=[];this.paintCounts={staticFacilities:0,fxFacilities:0,residential:0,transport:0};this.staticFacilityIds.clear();
    const zoom=this.zoomLevel(),focus=new Set(this.state?.focus||[]),previewIds=new Set(this.preview?.gains?.[this.service]?.ids||this.preview?.affected||[]);this.positions=[];this.hits=[];
    const v=this.frameCamera;for(const q of this.worldIndex.query(v.ox-130/v.scale,v.oy-130/v.scale,v.ox+(w+130)/v.scale,v.oy+(h+160)/v.scale)){const row=q.row,p=this.screen(row);this.positions.push({row,x:p.x,y:p.y,r:radius(row.population,zoom),color:COLORS[trend(row)]});}
    for(const p of this.positions){const selected=this.selected===p.row.id;let extent=p.r+(p.row.population===0?.6:.75);if(focus.has(p.row.id)||selected)extent=Math.max(extent,p.r+(selected?8:4));if(this.share(p.row)>0)extent=Math.max(extent,p.r+6.5);if(previewIds.has(p.row.id))extent=Math.max(extent,p.r+10);if(selected||this.routeFrom===p.row.id)extent=Math.max(extent,p.r+11.35);p.outerRadius=extent;}
    const reservedFacilities=[...(this.state?.facilities||[])];for(const f of this.preview?.proposed?.facilities||[])if(!reservedFacilities.some(old=>old.id===f.id))reservedFacilities.push(f);
    // A proposed facility must reserve the same ghost origin used by paintBuilding below.
    // Keep a full envelope for legacy facilities too; only decoration is excluded.
    this.compactGroups=this.overviewActive?this.overviewGroups():[];
    const reservedBoxes=this.overviewActive?this.compactGroups.filter(g=>g.fit).map(g=>({sharedBox:g.box})):reservedFacilities.map(f=>this.buildingBox(f,!(this.state?.facilities||[]).some(old=>old.id===f.id))).filter(Boolean);
    this.familyReservedBoxes=reservedBoxes.map(b=>b.sharedBox||[b.x,b.y,b.w,b.h]);
    // Text avoids the complete family's measured nontransparent pixels, not empty canvas margins.
    this.buildingBoxes=reservedBoxes.map(b=>b.familyAlphaBox||b.sharedBox||[b.x,b.y,b.w,b.h]);this.labelBuildingBoxes=this.buildingBoxes.slice();this.labels=this.layoutLabels(w,h,focus);
    const routePaths=(this.state?.routes||[]).map(r=>this.routePoints(r));if(this.preview?.path)routePaths.push(this.routePoints(this.preview));
    if(this.reservationsDirty){const allBoxes=this.overviewActive?this.familyReservedBoxes:reservedFacilities.map(f=>this.buildingBox(f,!(this.state?.facilities||[]).some(old=>old.id===f.id),true)).filter(Boolean).map(b=>b.sharedBox||[b.x,b.y,b.w,b.h]);this.landscape.setReservations(allBoxes,routePaths,v);this.reservationsDirty=false;}
    if(this.dirty.terrain){this.dirty.terrain=false;this.landscape.paint(this.tctx,w,h,this.positions,this.familyReservedBoxes,routePaths,v,this.cameraMoving);}
    for(const r of this.state?.routes||[])if(!this.routeAnims.has(r.id))this.drawRoute(c,r,false);
    if(this.preview?.path)this.drawRoute(c,this.preview,true);
    const buildings=new Set((this.state?.facilities||[]).map(f=>f.at));
    if(this.scenic&&zoom>=DETAIL_ZOOM){const candidates=this.positions.filter(p=>p.row.population>=500&&!buildings.has(p.row.id)).sort((a,b)=>b.row.population-a.row.population),used=[];
      for(const p of candidates.slice(0,100)){const size=clamp(54+Math.log10(p.row.population/500+1)*23,55,94)*((10.75-7.5)/3)*objectScale(zoom),kind=p.row.population>10000?'large':p.row.population>2000?'medium':'small',id=artworkVariant([`settlement_${kind}_01`,`settlement_${kind}_02`],hash(p.row.id)),img=this.images.get(id),profile=artworkProfile(id,img),height=img?.naturalWidth?size*img.naturalHeight/img.naturalWidth:size*.95,box=profile?[p.x-size*profile.anchor[0],p.y-height*profile.anchor[1]-11,size,height]:[p.x-size/2,p.y-size*.95-11,size,size*.95];
        const bounds=profile?artworkBounds(img):null,painted=bounds?[box[0]+size*bounds[0],box[1]+height*bounds[1],size*(bounds[2]-bounds[0]),height*(bounds[3]-bounds[1])]:[box[0],box[1],size,height];
        // Move decoration only, enough for its actual alpha bottom to clear its own real marker.
        const lift=Math.max(0,painted[1]+painted[3]-(p.y-p.r-3.75));box[1]-=lift;painted[1]-=lift;
        // Skip only the housing decoration; every real population point keeps its location and radius.
        if(this.positions.some(q=>coversMarker(painted,q))||used.some(b=>overlaps(box,b,8))||this.familyReservedBoxes.some(b=>overlaps(painted,b,3))||this.labels.some(l=>overlaps(painted,l.box,3)))continue;if(img?.complete&&img.naturalWidth){c.save();c.globalAlpha=clamp((zoom-8.8)/1.6,.1,1);c.drawImage(this.images.raster(img,size),box[0],box[1],size,height);recordArtworkDraw(id,img,[box[0],box[1],size,height],{layer:'residential',at:p.row.id,origin:[p.x,p.y],alphaBox:[...painted],viewport:[w,h],opacity:c.globalAlpha});c.restore();used.push(box);this.paintCounts.residential++;}}
    }
    this.facilityEvidence=(this.state?.facilities||[]).map(f=>({id:f.id,at:f.at,type:f.type,level:f.level,lod:zoom<DETAIL_ZOOM?'overview':'detail',reason:zoom<DETAIL_ZOOM?'overview':'offscreen',drawn:false,box:null,origin:null,hitRadius:0}));
    if(this.overviewActive)this.paintOverview(c);else{
    const upgrade=this.preview?.action?.type==='upgrade'?this.preview.proposed?.facilities.find(f=>f.id===this.preview.action.id):null,upgradeBox=upgrade&&this.buildingBox(upgrade),profilePreview=upgradeBox?.transform?{f:upgrade,box:upgradeBox}:null;
    for(const f of this.state?.facilities||[]){const box=profilePreview?.f.id===f.id?profilePreview.box:this.buildingBox(f);if(!box)continue;const evidence=this.facilityEvidence.find(e=>e.id===f.id);Object.assign(evidence,{reason:'pending-art',box:[box.x,box.y,box.w,box.h],origin:[box.p.x,box.p.y]});this.buildingBoxes.push(evidence.box);if(box.img?.complete&&box.img.naturalWidth&&(!box.placementClearance?.localPlacement||box.placementClearance.fit)){this.hits.push({x:box.x+box.w/2,y:box.y+box.h/2,r:box.w*.43,at:f.at,id:f.id});evidence.hitRadius=box.w*.43;}if(!this.buildingAnims.has(f.id))this.paintBuilding(c,profilePreview?.f.id===f.id?profilePreview.f:f,box,profilePreview?.f.id===f.id);}
    if(this.preview?.proposed&&this.tool&&this.tool!=='bus'){const ghost=this.preview.proposed.facilities.find(f=>!this.state.facilities.some(o=>o.id===f.id));if(ghost){const b=this.buildingBox(ghost,true);if(b){this.buildingBoxes.push([b.x,b.y,b.w,b.h]);this.paintBuilding(c,ghost,b,true);}}}
    }
    const markers=this.positions.slice().sort((a,b)=>Number(a.row.id===this.selected)-Number(b.row.id===this.selected));let order=0;
    {const c=this.sctx;for(const p of markers){const row=p.row,r=p.r,isSelected=this.selected===row.id,isTarget=focus.has(row.id),share=this.share(row);p.paintOrder=order++;
      if(isTarget||isSelected){c.beginPath();c.arc(p.x,p.y,r+(isSelected?8:4),0,TAU);c.fillStyle=isSelected?'rgba(255,255,255,.93)':'rgba(255,255,255,.85)';c.shadowColor='rgba(39,69,44,.15)';c.shadowBlur=this.cameraMoving?0:7;c.shadowOffsetY=2;c.fill();c.shadowBlur=0;c.shadowOffsetY=0;}
      if(share>0){c.beginPath();c.arc(p.x,p.y,r+5,-Math.PI/2,-Math.PI/2+TAU*Math.min(1,share));c.strokeStyle=COLORS[this.service];c.lineWidth=3;c.stroke();}
      if(previewIds.has(row.id)){c.beginPath();c.arc(p.x,p.y,r+9,0,TAU);c.strokeStyle='#0899e7';c.setLineDash([3,3]);c.lineWidth=2;c.stroke();c.setLineDash([]);}
      if(isSelected||this.routeFrom===row.id){c.beginPath();c.arc(p.x,p.y,r+10,0,TAU);c.strokeStyle='#007cb8';c.lineWidth=2.7;c.stroke();}
      c.beginPath();c.arc(p.x,p.y,r,0,TAU);c.fillStyle=p.color;c.fill();c.strokeStyle=row.population===0?'#788e83':'#ffffff';c.lineWidth=row.population===0?1.2:1.5;c.stroke();
      if(r>=6.2){c.strokeStyle='#ffffff';c.lineWidth=1.7;const t=trend(row),d=t==='grow'?-1:t==='decline'?1:0;c.beginPath();if(d){c.moveTo(p.x-2.7,p.y-d*1.5);c.lineTo(p.x,p.y+d*1.6);c.lineTo(p.x+2.7,p.y-d*1.5);}else{c.moveTo(p.x-2.5,p.y);c.lineTo(p.x+2.5,p.y);}c.stroke();}
    }}
    this.drawLabels(this.sctx);
  }
  share(row){const s=this.evaluation?.services[this.service];return s?.need[row.index]>0?s.served[row.index]/s.need[row.index]:0;}
  layoutLabels(w,h,focus){
    const c=this.sctx;
    this.selectedLabelCandidates=[];
    const obstacles=this.obstacles(),placed=[],ranked=this.positions.slice().sort((a,b)=>(b.row.id===this.selected)-(a.row.id===this.selected)||Number(focus.has(b.row.id))-Number(focus.has(a.row.id))||b.row.population-a.row.population),z=this.zoomLevel();
    c.textBaseline='middle';
    for(const p of ranked){const sel=p.row.id===this.selected,major=p.row.population>=500;if(!sel&&!major)continue;if(!sel&&placed.length>=(w<700?7:17))break;
      const detailed=z>=9.2&&(focus.has(p.row.id)||sel||p.row.population>4000),metricKey=`${p.row.id}:${detailed}:${w}`,cached=this.labelMetrics.get(metricKey);let metrics=cached;
      if(!metrics){const populationText=detailed?format(p.row.population)+' жителей':'';c.font='600 11px "Segoe UI", Arial, sans-serif';const populationWidth=c.measureText(populationText).width;
        c.font='700 13px "Segoe UI", Arial, sans-serif';let text=p.row.name,max=Math.min(w-38,w<700?160:208);if(c.measureText(text).width>max){while(text.length>1&&c.measureText(text+'…').width>max)text=text.slice(0,-1);text+='…';}const nameWidth=c.measureText(text).width;metrics={populationText,populationWidth,text,nameWidth,bw:Math.max(nameWidth,populationWidth)+22,bh:detailed?43:27};this.labelMetrics.set(metricKey,metrics);}
      const {populationText,populationWidth,text,nameWidth,bw,bh}=metrics,r=p.outerRadius??p.r;
      const variants=[[p.x+r+8,p.y-13,bw,bh],[p.x-r-8-bw,p.y-13,bw,bh],[p.x-bw/2,p.y+r+8,bw,bh],[p.x-bw/2,p.y-r-8-bh,bw,bh]];
      // A selected label may use a nearby corner when UI and real markers block all four sides.
      if(sel)variants.push([p.x+r+8,p.y-r-8-bh,bw,bh],[p.x-r-8-bw,p.y-r-8-bh,bw,bh],[p.x+r+8,p.y+r+8,bw,bh],[p.x-r-8-bw,p.y+r+8,bw,bh]);
      // Preserve a nearby selected name after a small manual pan at the viewport edge.
      // Original placements have priority; clamped fallbacks still pass every collision guard.
      if(sel&&h-8-bh>=4)for(const b of variants.slice()){const y=clamp(b[1],4,h-8-bh),dy=Math.abs(y-b[1]);if(dy>0&&dy<=8)variants.push([b[0],y,b[2],b[3]]);}
      const clearGeometry=b=>!placed.some(o=>overlaps(b,o.box,4))&&!this.buildingBoxes.some(o=>overlaps(b,o,2))&&!this.positions.some(q=>circleBoxGap(b,{x:q.x,y:q.y,r:q.outerRadius??q.r})<3);
      if(sel)this.selectedLabelCandidates=variants.filter(clearGeometry);
      const box=variants.find(b=>b[0]>=8&&b[0]+b[2]<=w-8&&b[1]>=4&&b[1]+b[3]<=h-8&&!obstacles.some(o=>overlaps(b,o,3))&&clearGeometry(b));
      if(box)placed.push({id:p.row.id,box,nameText:text,populationText,nameWidth,populationWidth,selected:sel,detailed});
    }
    this.labelCount=placed.length;return placed;
  }
  drawLabels(c){
    c.textBaseline='middle';for(const label of this.labels.slice().sort((a,b)=>Number(a.selected)-Number(b.selected))){const {box,nameText,populationText,selected:sel,detailed}=label,[x,y,w,h]=box;c.save();c.shadowColor='rgba(26,65,52,.16)';c.shadowBlur=this.cameraMoving?0:9;c.shadowOffsetY=3;rounded(c,x,y,w,h,9);c.fillStyle=sel?'#103f5b':(detailed?'rgba(255,255,255,.95)':'rgba(250,253,241,.85)');c.fill();c.shadowBlur=0;c.shadowOffsetY=0;c.fillStyle=sel?'#fff':'#193e48';c.font='700 13px "Segoe UI", Arial, sans-serif';c.fillText(nameText,x+11,y+14);if(detailed){c.font='600 11px "Segoe UI", Arial, sans-serif';c.fillStyle=sel?'#bce2ef':'#587478';c.fillText(populationText,x+11,y+32);}c.restore();}
  }
  overviewGroups(){
    const v=this.view(),key=`overview:${v.zoom}:${this.geometryRevision}`;
    let groups=this.geometryCache.get(key);
    if(!groups){
      const places=new Map();for(const f of this.state?.facilities||[]){if(!places.has(f.at))places.set(f.at,[]);places.get(f.at).push(f.id);}
      groups=[];
      for(const [at,facilityIds] of [...places].sort(([a],[b])=>a.localeCompare(b))){
        const row=this.world.row(at),world=this.worldPoints.get(at);if(!row||!world)continue;
        const p=this.screen(row),w=facilityIds.length*30,h=30,r=radius(row.population,v.zoom)+11.35,reach=(w+80)/v.scale;
        const circles=this.worldIndex.query(world.x-reach,world.y-reach,world.x+reach,world.y+reach).map(q=>{const t=this.screen(q.row);return{id:q.row.id,x:t.x,y:t.y,r:radius(q.row.population,v.zoom)+11.35};});
        let chosen=null;
        // Eight fixed nearby alternatives; no viewport, label or pan dependent solver.
        for(const [side,dx,dy] of [['above',0,-1],['below',0,1],['right',1,0],['left',-1,0],['above-right',1,-1],['below-right',1,1],['above-left',-1,-1],['below-left',-1,1]]){
          const cx=p.x+dx*(r+6+w/2),cy=p.y+dy*(r+6+h/2),box=[cx-w/2,cy-h/2,w,h],a=[clamp(p.x,box[0],box[0]+w),clamp(p.y,box[1],box[1]+h)],d=Math.hypot(a[0]-p.x,a[1]-p.y),b=[p.x+(a[0]-p.x)*r/d,p.y+(a[1]-p.y)*r/d];
          const minimumGapCss=Math.min(...circles.map(q=>circleBoxGap(box,q)))-.5;
          const stemClear=circles.every(q=>q.id===at||segmentPointGap(a,[p.x,p.y],q)>=3.75);
          if(minimumGapCss>=3&&stemClear&&!groups.some(g=>g.fit&&overlaps(box,g.box,3))){chosen={box,stem:[a,b],side,minimumGapCss};break;}
        }
        groups.push({at,facilityIds,origin:[p.x,p.y],fit:Boolean(chosen),box:chosen?.box||null,stem:chosen?.stem||null,side:chosen?.side||null,minimumGapCss:chosen?.minimumGapCss??null});
      }
      this.geometryCache.set(key,groups);
    }
    return groups.map(g=>{const p=this.screen(this.world.row(g.at)),dx=p.x-g.origin[0],dy=p.y-g.origin[1];return{...g,origin:[p.x,p.y],box:g.box&&[g.box[0]+dx,g.box[1]+dy,g.box[2],g.box[3]],stem:g.stem?.map(([x,y])=>[x+dx,y+dy]),drawn:false,frameId:this.sceneFrame};});
  }
  paintOverview(c){
    const {x:w,y:h}=this.viewportSize();
    for(const g of this.compactGroups){
      const entries=g.facilityIds.map(id=>this.state.facilities.find(f=>f.id===id));
      for(const f of entries)Object.assign(this.facilityEvidence.find(e=>e.id===f.id),{lod:'overview-marker',display:'compact',box:g.box,origin:g.origin,groupFacilityIds:g.facilityIds,reason:g.fit?'offscreen':'no-clear-marker-placement',placementClearance:{fit:g.fit,side:g.side,minimumGapCss:g.minimumGapCss,reservedRingAdditionCss:11.35,offsetCss:g.box?[g.box[0]+g.box[2]/2-g.origin[0],g.box[1]+15-g.origin[1]]:null}});
      if(!g.fit||g.box[0]+g.box[2]<0||g.box[0]>w||g.box[1]+30<0||g.box[1]>h)continue;
      c.save();c.lineWidth=1.5;c.strokeStyle='#587887';c.beginPath();c.moveTo(...g.stem[0]);c.lineTo(...g.stem[1]);c.stroke();rounded(c,...g.box,6);c.fillStyle='rgba(255,255,255,.96)';c.fill();c.lineWidth=1;c.stroke();g.drawn=true;
      for(const [i,f] of entries.entries()){
        const spec=CATALOG[f.type],id=f.type==='outreach'?`mobile_med_${this.outreachDirection(this.world.row(f.at))}`:f.level>1&&spec.upgradeArt?spec.upgradeArt:spec.art,img=this.images.get(id),e=this.facilityEvidence.find(e=>e.id===f.id);
        if(!img?.complete||!img.naturalWidth){e.reason='pending-art';continue;}
        const ratio=24/Math.max(img.naturalWidth,img.naturalHeight),iw=img.naturalWidth*ratio,ih=img.naturalHeight*ratio,box=[g.box[0]+i*30+(30-iw)/2,g.box[1]+(30-ih)/2,iw,ih],painted=alphaBox(img,box),placementOrigin=[box[0]+iw/2,box[1]+ih/2];
        c.drawImage(this.images.raster(img,iw),...box);this.staticFacilityIds.add(f.id);this.paintCounts.staticFacilities++;e.drawn=true;e.reason='painted';e.thumbnailBox=box;e.hitRadius=22;
        this.staticRasterDraws.push({assetId:artworkProfile(id,img)?.id||id,alias:id,at:f.at,facilityId:f.id,display:'compact',ghost:false,layer:'static',frameId:this.sceneFrame,paintTime:this.paintedAt,opacity:1,src:img.currentSrc||img.src,box,alphaBox:painted,familyAlphaBox:null,origin:g.origin,placementOrigin});
        recordArtworkDraw(id,img,box,{layer:'facility-overview',display:'compact',at:f.at,facilityId:f.id,origin:g.origin,placementOrigin,alphaBox:painted,viewport:[w,h]});
      }
      c.restore();
    }
  }
  buildingBox(f,ghost=false,unculled=false){
    const row=this.world.row(f.at),v=this.view();if(!row||v.zoom<DETAIL_ZOOM)return null;const p=this.screen(row);if(!unculled&&(p.x< -260||p.x>v.width+260||p.y< -260||p.y>v.height+260))return null;
    const key=`${f.id}:${f.type}:${f.level}:${ghost}:${v.zoom}:${this.geometryRevision}`,old=this.geometryCache.get(key);
    if(old){const dx=p.x-old.p.x,dy=p.y-old.p.y,box=b=>b?[b[0]+dx,b[1]+dy,b[2],b[3]]:null;return{...old,p,x:old.x+dx,y:old.y+dy,origin:[old.origin[0]+dx,old.origin[1]+dy],sharedBox:box(old.sharedBox),familyAlphaBox:box(old.familyAlphaBox)};}
    const value=this.computeBuildingBox(f,ghost);if(value)this.geometryCache.set(key,value);return value;
  }
  computeBuildingBox(f,ghost=false){
    if(this.zoomLevel()<DETAIL_ZOOM)return null;
    const row=this.world.row(f.at);if(!row)return null;const p=this.screen(row);
    const peers=(this.state?.facilities||[]).filter(x=>x.at===f.at),idx=ghost?peers.length:peers.findIndex(x=>x.id===f.id),n=peers.length+(ghost?1:0),spec=CATALOG[f.type],id=f.type==='outreach'?`mobile_med_${this.outreachDirection(row)}`:f.level>1&&spec.upgradeArt?spec.upgradeArt:spec.art,img=this.images.get(id),profile=artworkProfile(id,img),base=(profile?.family==='transport'?10.75*3.1:85.5)*objectScale(this.view().zoom),w=n>1?base*.79:base,offset=(idx-(n-1)/2)*w*.64,h=img?.naturalWidth?w*img.naturalHeight/img.naturalWidth:w*.84;
    const anchor=profile?.anchor||[.5,1],family=artworkFamilyPlacement(id,img),origin=[p.x+offset,p.y-14-(profile?.family==='transport'?h*(1-anchor[1]):0)];
    let sharedBox=null,familyAlphaBox=null,placementClearance=null;
    if(family){const transport=profile?.family==='transport',normal=[origin[0]-w*anchor[0],origin[1]-h*anchor[1],w,h],t=artworkLevel2Profile(f.type);
      // Keep complete transformed canvases, including culture's overhang beyond reference512.
      sharedBox=unionBoxes(t?[normal,[origin[0]+w*(t.translation[0]/512-.5),origin[1]+w*(t.translation[1]/512-.9),w*t.scale,w*t.scale]]:[normal]);
      const alphas=[];for(const member of family.assets){const image=this.images.get(member);if(!artworkProfile(member,image))continue;const memberHeight=transport?w*image.naturalHeight/image.naturalWidth:w,b=facilityArtBox(member,image,w,memberHeight,origin);alphas.push(alphaBox(image,[b.x,b.y,b.w,b.h]));}familyAlphaBox=unionBoxes(alphas);
      // Reserve existing maximum selection-ring extent at this zoom so preview, confirm,
      // reload and L1→L2 use the same data-derived origin, independent of current selection.
      const world=this.worldPoints.get(row.id),v=this.view(),reach=400/v.scale,circles=this.worldIndex.query(world.x-reach,world.y-reach,world.x+reach,world.y+reach).map(q=>{const screen=this.screen(q.row);return{id:q.row.id,x:screen.x,y:screen.y,r:radius(q.row.population,v.zoom)+11.35};});
      if(transport&&familyAlphaBox){
        const own=circles.find(q=>q.id===row.id),near=circles.filter(q=>q.id!==row.id),limit=Math.max(42,(own?.r||18)+Math.max(familyAlphaBox[2],familyAlphaBox[3])/2+family.pointGapCss+2),baseline=Math.hypot(origin[0]-p.x,origin[1]-p.y),distances=[];
        for(let d=baseline;d<=limit;d+=2)distances.push(d);if(distances.at(-1)!==limit)distances.push(limit);
        const trials=[];let chosen=null;
        // Nearby placements, never an unbounded upward escape across another settlement.
        for(const [side,dx,dy] of [['above',0,-1],['below',0,1],['right',1,0],['left',-1,0]])for(const distance of distances){
          const at=[p.x+dx*distance,p.y+dy*distance],delta=[at[0]-origin[0],at[1]-origin[1]],box=[familyAlphaBox[0]+delta[0],familyAlphaBox[1]+delta[1],familyAlphaBox[2],familyAlphaBox[3]],center=[box[0]+box[2]/2,box[1]+box[3]/2],ownDistance=Math.hypot(center[0]-p.x,center[1]-p.y),intervening=near.filter(q=>segmentPointGap([p.x,p.y],center,q)<family.pointGapCss),closer=near.filter(q=>Math.hypot(center[0]-q.x,center[1]-q.y)<ownDistance),clear=circles.every(q=>circleBoxGap(box,q)>=family.pointGapCss),fit=clear&&!intervening.length&&!closer.length;
          if(this.diagnosticsActive)trials.push({side,distance,fit,pointClear:clear,intervening:intervening.map(q=>q.id),closerPoints:closer.map(q=>q.id)});if(fit&&!chosen)chosen={at,delta,side,distance};
        }
        const delta=chosen?.delta||[0,0];origin[0]+=delta[0];origin[1]+=delta[1];sharedBox[0]+=delta[0];sharedBox[1]+=delta[1];familyAlphaBox[0]+=delta[0];familyAlphaBox[1]+=delta[1];placementClearance={fit:Boolean(chosen),localPlacement:true,side:chosen?.side||null,offsetCss:[origin[0]-p.x,origin[1]-p.y],anchorDistanceCss:Math.hypot(origin[0]-p.x,origin[1]-p.y),maxAnchorDistanceCss:limit,reservedRingAdditionCss:11.35,trials};
      }else{
        let lift=family.additionalLiftCss,fit=false;for(;lift<=family.maxLiftCss;lift++){const trial=familyAlphaBox&&[familyAlphaBox[0],familyAlphaBox[1]-lift,familyAlphaBox[2],familyAlphaBox[3]];if(!trial||circles.every(q=>circleBoxGap(trial,q)>=family.pointGapCss)){fit=true;break;}}
        lift=Math.min(lift,family.maxLiftCss);origin[1]-=lift;sharedBox[1]-=lift;if(familyAlphaBox)familyAlphaBox[1]-=lift;const preferredMaxLiftCss=t?.preferredMaxLiftCss??family.additionalLiftCss;placementClearance={fit,additionalLiftCss:lift,maxLiftCss:family.maxLiftCss,reservedRingAdditionCss:11.35,preferredMaxLiftCss,needsReframe:!fit||lift>preferredMaxLiftCss};
      }
    }
    return {...facilityArtBox(id,img,w,h,origin),p,id,img,origin,logicalW:w,logicalH:h,family,sharedBox,familyAlphaBox,placementClearance};
  }
  pointClearance(box,gap){if(!box)return null;const circles=this.positions.map(p=>{const x=clamp(p.x,box[0],box[0]+box[2]),y=clamp(p.y,box[1],box[1]+box[3]);return{id:p.row.id,center:[p.x,p.y],baseRadius:p.r,outerRadius:p.outerRadius??p.r+.75,gapCss:Math.hypot(p.x-x,p.y-y)-(p.outerRadius??p.r+.75)};});return{requiredGapCss:gap,minimumGapCss:Math.min(...circles.map(p=>p.gapCss)),nearby:circles.filter(p=>p.gapCss<gap+20),conflicts:circles.filter(p=>p.gapCss<gap)};}
  paintBuilding(c,f,b,ghost=false,animation=null){
    if(this.overviewActive||this.zoomLevel()<DETAIL_ZOOM)return;
    // A failed local outreach placement waits for the bounded camera retry; never paint a collision.
    if(b.placementClearance?.localPlacement&&!b.placementClearance.fit)return;
    if(!b.img?.complete||!b.img.naturalWidth)return;let alpha=ghost?.63:1,scale=1,raise=0,t=1;
    // Opacity-only construction keeps every approved family alpha bound and anchor fixed.
    if(animation)t=clamp((performance.now()-animation.start)/animation.duration,0,1);
    c.save();c.translate(...b.origin);c.scale(scale,scale);c.globalAlpha=alpha;
    c.shadowColor=ghost?'rgba(0,144,239,.42)':'rgba(39,66,51,.22)';c.shadowBlur=this.cameraMoving?0:ghost?18:9;c.shadowOffsetY=5;
    const paint=(id,image,rect)=>{const x=rect.x-b.origin[0],y=rect.y-b.origin[1]-raise;c.drawImage(this.images.raster(image,rect.w),x,y,rect.w,rect.h);if(c.globalAlpha>0){const fx=c===this.fctx;this.paintCounts[fx?'fxFacilities':'staticFacilities']++;(fx?this.fxFacilityIds:this.staticFacilityIds).add(f.id);}const box=[b.origin[0]+x*scale,b.origin[1]+y*scale,rect.w*scale,rect.h*scale],painted=alphaBox(image,box);
      if(c.globalAlpha>0){const fx=c===this.fctx,records=fx?this.fxRasterDraws:this.staticRasterDraws;if(records.length<128)records.push({assetId:artworkProfile(id,image)?.id||id,alias:id,at:f.at,facilityId:f.id,ghost,layer:fx?'fx':'static',frameId:this.sceneFrame,paintTime:fx?this.fxPaintedAt:this.paintedAt,opacity:c.globalAlpha,src:image.currentSrc||image.src,box:[...box],alphaBox:[...painted],familyAlphaBox:b.familyAlphaBox?[...b.familyAlphaBox]:null,origin:[b.p.x,b.p.y],placementOrigin:[...b.origin]});}
      recordArtworkDraw(id,image,box,{layer:'facility',at:f.at,facilityId:f.id,origin:[b.p.x,b.p.y],placementOrigin:[...b.origin],logicalCanvas:[b.logicalW,b.logicalH],rendererProfile:rect.transform?.id||null,placementProfile:b.family?.id||null,placementClearance:b.placementClearance,sharedBox:b.sharedBox,familyAlphaBox:b.familyAlphaBox,pointClearance:this.diagnosticsActive&&b.family?this.pointClearance(painted,b.family.pointGapCss):null,familyPointClearance:this.diagnosticsActive&&b.family?this.pointClearance(b.familyAlphaBox,b.family.pointGapCss):null,alphaBox:painted,ghost,opacity:c.globalAlpha,viewport:[this.viewportSize().x,this.viewportSize().y]});};
    if(animation&&t<.72&&b.id.endsWith('-ready')){const constructionId=b.id.replace('-ready','-build'),construction=this.images.get(constructionId);if(construction?.complete&&construction.naturalWidth){const height=artworkProfile(b.id,b.img)?b.logicalW*construction.naturalHeight/construction.naturalWidth:b.logicalH,rect=facilityArtBox(constructionId,construction,b.logicalW,height,b.origin);c.globalAlpha=(1-clamp((t-.18)/.54,0,1))*alpha;paint(constructionId,construction,rect);}}
    c.globalAlpha=alpha*(animation?clamp((t-.12)/.60,0,1):1);paint(b.id,b.img,b);c.shadowBlur=0;c.shadowOffsetY=0;
    if(!ghost&&f.level>1){c.globalAlpha=1;const bx=b.logicalW/2-8,by=-9;c.beginPath();c.arc(bx,by,9,0,TAU);c.fillStyle='#096fa8';c.fill();c.lineWidth=2;c.strokeStyle='#fff';c.stroke();c.fillStyle='#fff';c.font='700 10px "Segoe UI", Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(String(f.level),bx,by+.5);}
    c.restore();
  }
  routePoints(r){return this.routeView(r).points;}
  drawRoute(c,r,preview=false,progress=1){
    const view=this.routeView(r),points=view.points;if(points.length<2)return;
    const counter=c===this.fctx?'fxRoutes':'routes';this.paintCounts[counter]=(this.paintCounts[counter]||0)+1;
    const lens=view.cumulative.slice(1).map((d,i)=>(d-view.cumulative[i])*view.scale),total=view.total*view.scale;let remaining=total*progress;
    c.save();c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++){if(remaining<=0)break;const f=Math.min(1,remaining/(lens[i-1]||1));c.lineTo(points[i-1].x+(points[i].x-points[i-1].x)*f,points[i-1].y+(points[i].y-points[i-1].y)*f);remaining-=lens[i-1];}
    c.shadowColor=preview?'rgba(0,150,243,.38)':'rgba(28,74,75,.17)';c.shadowBlur=preview?12:5;c.shadowOffsetY=2;c.strokeStyle=preview?'rgba(255,255,255,.95)':'#f8fffb';c.lineWidth=preview?8:7;c.stroke();c.shadowBlur=0;c.shadowOffsetY=0;c.strokeStyle=preview?'#049ded':'#219acb';c.lineWidth=preview?3:3.4;c.setLineDash(preview?[7,7]:[]);c.stroke();c.setLineDash([]);
    if(!preview){c.lineWidth=.9;c.strokeStyle='rgba(255,255,255,.65)';c.setLineDash([7,13]);c.stroke();c.setLineDash([]);}c.restore();
  }
  pick(point){
    if(this.overviewActive){
      // A real point keeps priority over the generous compact-marker tap target.
      const overPoint=this.positions.some(p=>Math.hypot(p.x-point.x,p.y-point.y)<=Math.max(18,p.r+9));
      const group=!overPoint&&this.compactGroups?.find(g=>g.drawn&&point.x>=g.box[0]-7&&point.x<=g.box[0]+g.box[2]+7&&point.y>=g.box[1]-7&&point.y<=g.box[1]+g.box[3]+7);
      if(group){this.panTo(group.at);this.onSelect?.(this.world.row(group.at));return;}
    }
    const hit=this.zoomLevel()>=DETAIL_ZOOM?this.hits.map(h=>({...h,d:Math.hypot(h.x-point.x,h.y-point.y)})).filter(h=>h.d<=h.r).sort((a,b)=>a.d-b.d)[0]:null;if(hit){this.onSelect?.(this.world.row(hit.at),hit.id);return;}
    const possible=this.positions.map(p=>({...p,d:Math.hypot(p.x-point.x,p.y-point.y)})).filter(p=>p.d<=Math.max(18,p.r+9)).sort((a,b)=>a.d-b.d);
    // Zoom cannot separate distinct source rows at exactly the same coordinates.
    const first=possible[0]?.row,wp=first&&this.worldPoints.get(first.id),coincident=first?this.worldIndex.query(wp.x,wp.y,wp.x,wp.y).map(p=>p.row).filter(r=>r.id!==first.id&&r.lat===first.lat&&r.lon===first.lon):[];
    if(coincident.length){this.onSelect?.(first,null,coincident);return;}
    if(possible.length>1&&possible[1].d-possible[0].d<6&&this.zoomLevel()<14.5){this.map.setView(this.map.containerPointToLatLng(point),Math.min(15,this.zoomLevel()+.75),{animate:!this.reduced});return;}
    if(first){if(this.overviewActive)this.panTo(first.id);this.onSelect?.(first);}else this.onEmpty?.();
  }
  cancelRemoved(state){
    const removed=new Set(this.eventLog.filter(e=>e.status!=='cancelled'&&!eventIsCurrent(e,state)).map(e=>e.actionId));
    for(const event of this.eventLog)if(removed.has(event.actionId)){event.status='cancelled';this.cancelledEvents.push(event.actionId);this.seenEvents.delete(event.actionId);}
    this.cancelledEvents=this.cancelledEvents.slice(-24);
    for(const map of [this.buildingAnims,this.routeAnims])for(const [id,a] of map)if(removed.has(a.actionId))map.delete(id);
    this.effects=this.effects.filter(e=>!removed.has(e.actionId));
  }
  finishTransient(reason){
    this.motionGeneration++;this.lastFxTime=null;this.buildingAnims.clear();this.routeAnims.clear();this.effects=[];
    for(const event of this.eventLog)if(event.status==='active'||event.status==='pending')event.status=reason;
  }
  resetMotion(){this.finishTransient('reset');this.eventLog=[];this.cancelledEvents=[];this.seenEvents.clear();this.routeCache.clear();this.vehicleHeadings.clear();}
  setReduced(value){
    if(this.reduced===value)return;this.reduced=value;if(value){this.finishTransient('reduced');cancelAnimationFrame(this.raf);this.raf=null;this.camera.cancel();this.map.stop();}this.requestRender();this.animate();
  }
  commitMotion(payload){
    if(this.destroyed||this.seenEvents.has(payload.actionId)||!eventIsCurrent(payload,this.state))return;
    const now=performance.now(),event={...payload,committedAt:payload.committedAt??now,status:'active'};
    this.seenEvents.add(event.actionId);this.eventLog.push(event);if(this.eventLog.length>24){const old=this.eventLog.shift();this.seenEvents.delete(old.actionId);for(const map of [this.buildingAnims,this.routeAnims])for(const [id,a] of map)if(a.actionId===old.actionId)map.delete(id);}
    // The newest result owns the transient label; older results cannot sit over a new decision.
    this.effects=document.hidden?[]:[{...event,start:now,duration:MOTION.label}];
    if(document.hidden||this.reduced){event.status=document.hidden?'hidden':'reduced';return;}
    if(event.routeId){const route=this.state.routes.find(r=>r.id===event.routeId);if(route){this.routeAnims.set(route.id,{actionId:event.actionId,start:now,duration:MOTION.route});this.geometry(route);}}
    if(event.facilityId){
      const facility=this.state.facilities.find(f=>f.id===event.facilityId);if(!facility)return;
      const art=facility.type==='outreach'?`mobile_med_${this.outreachDirection(this.world.row(facility.at))}`:facility.level>1?CATALOG[facility.type].upgradeArt:CATALOG[facility.type].art;
      const ids=artworkFamilyPlacement(art)?.assets||[art,...(art.endsWith('-ready')?[art.replace('-ready','-build')]:[])],generation=this.motionGeneration;
      const animation={actionId:event.actionId,facilityId:facility.id,start:null,duration:event.type==='upgrade'?MOTION.upgrade:MOTION.build,pending:true};
      this.buildingAnims.set(facility.id,animation);event.status='pending';
      this.images.prefetch(ids).then(()=>{
        if(this.destroyed||generation!==this.motionGeneration||!eventIsCurrent(event,this.state)||this.buildingAnims.get(facility.id)!==animation)return;
        if(this.reduced||document.hidden){this.buildingAnims.delete(facility.id);event.status='settled';this.requestRender();return;}
        if(!this.images.get(art).naturalWidth){this.buildingAnims.delete(facility.id);event.status='art-unavailable';this.onNotice?.('Объект сохранён. Его изображение недоступно; карточка открывается через поселение.');this.requestRender();return;}
        animation.pending=false;animation.start=performance.now();event.status='active';event.visualStartedAt=animation.start;
        this.requestRender();this.animate();
      });
    }
  }
  geometry(route){
    const id=route.id||'preview',key=(route.path||[]).join('|');let cached=this.routeCache.get(id);
    if(!cached||cached.key!==key){const points=(route.path||[]).map(id=>this.world.row(id)).filter(Boolean).map(r=>this.worldPoints.get(r.id));cached={key,...routeGeometry(points)};this.routeCache.set(id,cached);
      const ids=[];for(let i=1;i<points.length;i++){const dx=points[i].x-points[i-1].x,dy=points[i].y-points[i-1].y;ids.push(`bus_${headingDirection(dx,dy)}`,`bus_${headingDirection(-dx,-dy)}`);}if(route.id)this.images.prefetch(ids);
    }return cached;
  }
  routeView(route){
    const geometry=this.geometry(route),v=this.view(),scale=v.scale,first=geometry.points[0];if(!first)return {...geometry,points:[],scale};
    const origin=L.point((first.x-v.ox)*scale,(first.y-v.oy)*scale);return {...geometry,scale,origin,points:geometry.points.map(p=>L.point((p.x-v.ox)*scale,(p.y-v.oy)*scale))};
  }
  animate(){this.dirty.fx=true;this.ensureFrame();}
  impactLabel(c,event,origin,w,h,age){
    const names={medical:'Медицина',school:'Школа',culture:'Досуг'},net=event.access[event.service].net;
    const text=net===0?`${names[event.service]}: охват без изменений`:`${names[event.service]}: ${net>0?'+':'−'}${format(Math.abs(net))} чел. с доступом`;
    c.save();c.font='600 12px "Segoe UI", Arial';const width=Math.min(w-24,c.measureText(text).width+24),height=30;
    const obstacles=[...this.obstacles(),...this.buildingBoxes,...this.labels.map(l=>l.box),...this.drawnMotion.labels.map(l=>l.box)];
    const candidates=[];for(const y of [origin.y+24,origin.y-48,...Array.from({length:Math.ceil(h/38)},(_,i)=>12+i*38)])for(const x of [origin.x-width/2,12,w-width-12])candidates.push([clamp(x,12,w-width-12),y,width,height]);
    const box=candidates.find(b=>b[1]>=8&&b[1]+height<=h-8&&!obstacles.some(o=>overlaps(b,o,6))&&!this.positions.some(p=>circleBoxGap(b,{x:p.x,y:p.y,r:p.outerRadius??p.r})<3));
    if(box){const [x,y]=box;c.globalAlpha=this.reduced?1:Math.min(clamp(age/100,0,1),clamp((MOTION.label-age)/160,0,1));rounded(c,x,y,width,height,12);c.fillStyle='#ffffff';c.shadowColor='rgba(18,71,78,.17)';c.shadowBlur=8;c.fill();c.shadowBlur=0;c.fillStyle=net<0?'#a34339':'#087d73';c.textBaseline='middle';c.fillText(text,x+12,y+15,width-24);this.drawnMotion.labels.push({actionId:event.actionId,service:event.service,text,box,people:net});}c.restore();
  }
  drawFx(now){
    if(this.destroyed||document.hidden)return;
    const c=this.fctx,{x:w,y:h}=this.viewportSize();c.clearRect(0,0,w,h);this.fxFrames++;const moving=!this.reduced&&((this.state?.routes.length||0)>0||this.buildingAnims.size||this.routeAnims.size);if(moving&&this.lastFxTime!==null){this.fxIntervals.push(now-this.lastFxTime);if(this.fxIntervals.length>240)this.fxIntervals.shift();}this.lastFxTime=moving?now:null;this.drawnMotion={rings:[],labels:[],vehicles:[],pending:[]};this.fxRasterDraws=[];this.paintCounts.fxFacilities=0;this.paintCounts.fxRoutes=0;this.paintCounts.transport=0;this.fxFacilityIds.clear();this.fxPaintedAt=now;
    // Keep the exact final image on FX until the requested static repaint. Clearing FX
    // and only scheduling render would expose an empty compositor frame at this handoff.
    // Removed/undone objects are never painted: both branches first resolve current state.
    for(const [id,a] of this.routeAnims){const r=this.state?.routes.find(r=>r.id===id);if(!r||now-a.start>=a.duration){this.routeAnims.delete(id);if(r)this.drawRoute(c,r,false,1);this.requestRender();continue;}this.drawRoute(c,r,false,clamp((now-a.start)/a.duration,0,1));}
    for(const [id,a] of this.buildingAnims){const f=this.state?.facilities.find(f=>f.id===id);if(!f||!a.pending&&now-a.start>=a.duration){this.buildingAnims.delete(id);const e=this.eventLog.find(e=>e.actionId===a.actionId);if(e)e.status='settled';if(f){const b=this.buildingBox(f);if(b)this.paintBuilding(c,f,b);}this.requestRender();continue;}if(a.pending){this.paintPending(c,f,a);continue;}const b=this.buildingBox(f);if(b)this.paintBuilding(c,f,b,false,a);}
    for(const [i,route] of (this.state?.routes||[]).entries()){
      if(this.zoomLevel()<DETAIL_ZOOM||this.drawnMotion.vehicles.length>=MOTION.maxVehicles)break;
      if(this.routeAnims.has(route.id))continue;const g=this.geometry(route);if(!g.total)continue;
      // 24 projected units/s at zoom 11: illustrative, never a real travel-time estimate.
      const phase=this.reduced?.45:(now*.024/g.total+i*.33)%2,forward=this.reduced||phase<=1,fraction=forward?phase:2-phase,sample=routeSample(g,fraction);if(!sample)continue;
      const view=this.view(),x=(sample.x-view.ox)*view.scale,y=(sample.y-view.oy)*view.scale;if(x< -50||x>w+50||y< -50||y>h+50)continue;
      const dx=sample.dx*(forward?1:-1),dy=sample.dy*(forward?1:-1),direction=stableDirection(dx,dy,this.reduced?null:this.vehicleHeadings.get(route.id));this.vehicleHeadings.set(route.id,direction);
      const id=`bus_${direction}`,requested=this.images.get(id),profile=artworkProfile(id,requested),bus=requested.complete&&requested.naturalWidth?requested:this.images.get('legacy:O-09');
      if(bus?.complete&&bus.naturalWidth){const s=(profile?10.75*3.1:50.525)*objectScale(this.view().zoom),bh=s*bus.naturalHeight/bus.naturalWidth;c.save();c.translate(x,y);if(!profile)c.scale(dx<0?-1:1,1);c.shadowColor='rgba(14,55,60,.30)';c.shadowBlur=profile?4:6;c.shadowOffsetX=profile?2:0;c.shadowOffsetY=profile?3:4;const bx=-s*(profile?.anchor[0]??.5),by=profile?-bh*profile.anchor[1]:-bh+5;c.drawImage(this.images.raster(bus,s),bx,by,s,bh);this.paintCounts.transport++;recordArtworkDraw(id,bus,[x+bx,y+by,s,bh],{layer:'transport',routeId:route.id,direction,viewport:[w,h]});c.restore();this.drawnMotion.vehicles.push({routeId:route.id,position:[x,y],direction,tangent:[dx,dy],phase:fraction,segment:sample.index});}
    }
    this.effects=this.effects.filter(e=>eventIsCurrent(e,this.state)&&now-e.start<MOTION.label);
    for(const event of this.effects){const age=now-event.start,row=this.world.row(event.origin),origin=row&&this.screen(row);if(!origin)continue;
      if(!this.reduced&&age<MOTION.coverage){const t=clamp(age/MOTION.coverage,0,1),changes=event.changes[event.service].filter(change=>{const row=this.world.row(change.id);if(!row)return false;const p=this.screen(row);return p.x>=0&&p.x<=w&&p.y>=0&&p.y<=h;}).sort((a,b)=>Number(a.people>=0)-Number(b.people>=0));
        for(const change of changes.slice(0,MOTION.maxParticles-this.drawnMotion.rings.length)){const row=this.world.row(change.id),p=this.screen(row),loss=change.new<change.old;c.save();c.globalAlpha=1-t;c.beginPath();c.arc(p.x,p.y,radius(row.population,this.zoomLevel())+8+t*5,0,TAU);c.strokeStyle=loss?'#b24f42':COLORS[event.service];c.lineWidth=2;if(loss)c.setLineDash([3,3]);c.stroke();c.restore();this.drawnMotion.rings.push({id:change.id,change:loss?'loss':'gain',service:event.service,actionId:event.actionId,old:change.old,new:change.new});}
      }
      if(this.drawnMotion.labels.length<MOTION.maxLabels&&event.changes[event.service].length)this.impactLabel(c,event,origin,w,h,age);
    }
  }
  paintPending(c,facility,animation){
    if(this.overviewActive)return;
    const row=this.world.row(facility.at),p=row&&this.screen(row);if(!p)return;
    // A small stationary outline outside the real marker: the action is already committed.
    const r=radius(row.population,this.zoomLevel())+15,box=[p.x+r,p.y-5,14,10],size=this.viewportSize();
    if(box[0]<0||box[0]+box[2]>size.x||box[1]<0||box[1]+box[3]>size.y||this.obstacles().some(o=>overlaps(box,o,3))||this.labels.some(l=>overlaps(box,l.box,3))||this.positions.some(q=>q.row.id!==row.id&&circleBoxGap(box,{x:q.x,y:q.y,r:q.outerRadius??q.r})<3))return;
    c.save();c.strokeStyle='#517984';c.lineWidth=1.5;c.setLineDash([2,2]);c.strokeRect(...box);c.restore();this.drawnMotion.pending.push({actionId:animation.actionId,facilityId:facility.id,box,meaning:'committed-image-loading'});
  }
  motionEvidence(){return structuredClone({generation:this.motionGeneration,reduced:this.reduced,hidden:document.hidden,destroyed:this.destroyed,frames:{static:this.sceneFrame,fx:this.fxFrames,fxIntervalsMs:this.fxIntervals},active:{builds:[...this.buildingAnims.values()],routes:[...this.routeAnims].map(([routeId,a])=>({routeId,...a})),effects:this.effects.map(e=>({actionId:e.actionId,start:e.start,duration:e.duration})),raf:Boolean(this.raf),renderRaf:Boolean(this.renderRaf),revealRaf:Boolean(this.revealRaf)},events:this.eventLog,cancelled:this.cancelledEvents,drawn:this.drawnMotion,routeCacheSize:this.routeCache.size,decode:{active:this.images.active,queued:this.images.queue.length},ownSubscriptions:this.subscriptions.length,subscriptionTypes:this.subscriptions.map(s=>s.type),observerActive:!this.destroyed,budgets:MOTION});}
  setDiagnostics(value){this.diagnosticsActive=Boolean(value);this.diagnosticsAvailableSince=value?performance.now():null;setArtworkDiagnostics(value);this.geometryCache.clear();}
  sceneEvidence(options={}){
    if(typeof options.diagnostics==='boolean'&&options.diagnostics!==this.diagnosticsActive)this.setDiagnostics(options.diagnostics);
    const limit=clamp(Number.isFinite(options.limit)?Math.floor(options.limit):64,1,128),rect=this.element.getBoundingClientRect(),size=this.viewportSize(),center=this.map.getCenter(),zoom=this.zoomLevel(),positions=new Map(this.positions.map(p=>[p.row.id,p])),labels=new Map(this.labels.map(l=>[l.id,l]));
    const box=b=>b?[b[0]+rect.x,b[1]+rect.y,b[2],b[3]]:null,ids=Array.isArray(options.ids)&&options.ids.length?options.ids:[this.selected,...this.positions.map(p=>p.row.id)],points=[];
    for(const id of [...new Set(ids)].filter(Boolean).slice(0,limit)){const row=this.world.row(id);if(!row)continue;const p=positions.get(id),at=p||this.screen(row),r=p?.r??radius(row.population,zoom),label=labels.get(id);points.push({id,population:row.population,population2010:row.population2010??null,trend:trend(row),color:p?.color||COLORS[trend(row)],center:[at.x+rect.x,at.y+rect.y],radius:r,outerRadius:p?.outerRadius??null,hitRadius:Math.max(18,r+9),drawn:Boolean(p&&Number.isFinite(p.paintOrder)),visible:Boolean(p&&at.x+r>=0&&at.x-r<=size.x&&at.y+r>=0&&at.y-r<=size.y),selected:id===this.selected,paintOrder:p?.paintOrder??null,label:label?{...label,box:box(label.box)}:null});}
    const facilities=this.facilityEvidence.map(f=>{const drawn=this.staticFacilityIds.has(f.id)||this.fxFacilityIds.has(f.id),row=this.world.row(f.at),p=row&&this.screen(row);return{...f,drawn,reason:drawn?'painted':f.reason,box:box(f.box),thumbnailBox:box(f.thumbnailBox),origin:p?[p.x+rect.x,p.y+rect.y]:null};}),decor=this.landscape.evidence(),drawnPoints=this.positions.filter(p=>Number.isFinite(p.paintOrder)),last=drawnPoints.reduce((best,p)=>!best||p.paintOrder>best.paintOrder?p:best,null);
    const rasterDraws=[...this.staticRasterDraws,...this.fxRasterDraws].map(d=>({...d,box:box(d.box),alphaBox:box(d.alphaBox),familyAlphaBox:box(d.familyAlphaBox),origin:[d.origin[0]+rect.x,d.origin[1]+rect.y],placementOrigin:[d.placementOrigin[0]+rect.x,d.placementOrigin[1]+rect.y]}));
    return{schemaVersion:1,diagnosticsActive:this.diagnosticsActive,diagnosticsAvailableSince:this.diagnosticsAvailableSince,renderer:{scheduler:'single-game-rAF',frameCostsMs:[...this.frameCosts],indexRecords:this.worldIndex.records.length,geometryCacheSize:this.geometryCache.size,labelCacheSize:this.labelMetrics.size,imageCacheSize:this.images.entries.size,imageCacheLimit:this.images.limit,imageRasterPixels:this.images.rasterPixels,imageRasterLimit:this.images.rasterPixelLimit,memory:{unit:'bytes, estimated pixel storage; not process RAM',decodedImages:[...this.images.entries].map(([id,e])=>({id,width:e.image.naturalWidth,height:e.image.naturalHeight,bytes:e.image.naturalWidth*e.image.naturalHeight*4})),rasterCacheBytes:this.images.rasterPixels*4,surfaceBytes:(this.landscape.surface?.canvas.width||0)*(this.landscape.surface?.canvas.height||0)*4,canvasBuffers:[...this.element.querySelectorAll('canvas')].map(c=>({className:c.className,width:c.width,height:c.height,bytes:c.width*c.height*4}))}},motion:this.motionEvidence(),frameId:this.sceneFrame,paintedAt:this.paintedAt||0,fxPaintedAt:this.fxPaintedAt||0,observedAt:performance.now(),region:{id:this.world.region.id,rowCount:this.world.rows.length,validCount:this.world.valid.length},camera:{zoom,center:[center.lat,center.lng],wrapLongitude:this.wrap,viewport:[size.x,size.y],mapRect:[rect.x,rect.y,rect.width,rect.height],moving:this.cameraMoving},lod:{mode:this.overviewActive||zoom<DETAIL_ZOOM?'overview':'detail',explicitOverview:this.overviewActive,detailZoom:DETAIL_ZOOM},layers:SCENE_LAYERS.map(l=>({...l})),counts:{drawnPoints:drawnPoints.length,visiblePoints:drawnPoints.filter(p=>p.x+p.r>=0&&p.x-p.r<=size.x&&p.y+p.r>=0&&p.y-p.r<=size.y).length,modelFacilities:this.state?.facilities.length||0,detailedFacilities:facilities.filter(f=>f.drawn&&f.lod==='detail').length,overviewFacilities:facilities.filter(f=>f.lod==='overview'||f.lod==='overview-marker').length,offscreenFacilities:facilities.filter(f=>f.reason==='offscreen').length,facilityDraws:this.paintCounts.staticFacilities+this.paintCounts.fxFacilities,labels:this.labels.length,residential:this.paintCounts.residential,vegetation:decor.visible},drawCalls:{surfaceBlits:this.scenic?1:0,vegetationImages:decor.visible,residentialImages:this.paintCounts.residential,facilityImages:this.paintCounts.staticFacilities+this.paintCounts.fxFacilities,transportImages:this.paintCounts.transport,routePaths:(this.paintCounts.routes||0)+(this.paintCounts.fxRoutes||0),markerSymbols:drawnPoints.length,labelBoxes:this.labels.length},selectedLastMarkerId:last?.row.id||null,points,facilities:facilities.slice(0,limit),compactGroups:(this.compactGroups||[]).map(g=>({...g,box:box(g.box),origin:[g.origin[0]+rect.x,g.origin[1]+rect.y],stem:g.stem?.map(([x,y])=>[x+rect.x,y+rect.y])})),rasterDraws,decor,geodata:{...this.geodata,basemapEnabled:Boolean(this.tiles),basemapFailed:Boolean(this.tileErrorShown)}};
  }
  destroy(){this.finishTransient('destroyed');this.destroyed=true;for(const key of ['raf','renderRaf','revealRaf']){cancelAnimationFrame(this[key]);this[key]=null;}this.routeCache.clear();this.vehicleHeadings.clear();this.drawnMotion={rings:[],labels:[],vehicles:[],pending:[]};this.abort?.abort();this.observer.disconnect();for(const s of this.subscriptions){if(s.target===document)s.target.removeEventListener(s.type,s.handler);else s.target.off(s.type,s.handler);}this.subscriptions=[];setArtworkDiagnostics(false);this.images.destroy();this.landscape.destroy();
    // Pinned Leaflet 1.9.4 leaves this handler on the container reused by the next region.
    this.camera.destroy();this.worldIndex.clear();this.worldPoints.clear();this.geometryCache.clear();this.labelMetrics.clear();this.obstacleCache=null;this.outreachNeighbors.clear();this.positions=[];this.hits=[];
    L.DomEvent.off(this.element,'scroll',this.map._onScroll,this.map);this.map.remove();
    // Its registry retains null context-stamped keys after removal; keep all active entries.
    const events=this.element._leaflet_events;for(const key of Object.keys(events||{}))if(events[key]===null)delete events[key];}
}
