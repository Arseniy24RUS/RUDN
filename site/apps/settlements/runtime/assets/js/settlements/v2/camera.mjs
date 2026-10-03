/** Thin adapter for pinned Leaflet 1.9.4. The map is the only display camera.
 * No rAF here: GameMap calls step() in its own frame. Native drag/pinch stay Leaflet-owned.
 * These three private calls are the same event path used by Leaflet TouchZoom.
 */
export class CameraController {
  constructor(map,invalidate,{duration=180,reduced=()=>false}={}){this.map=map;this.invalidate=invalidate;this.duration=duration;this.reduced=reduced;this.active=null;this.internal=false;this.disposers=[];this.nativeMoving=false;
    const start=()=>{if(!this.internal)this.nativeMoving=true;},end=()=>{if(!this.internal)this.nativeMoving=false;};map.on('movestart',start);map.on('moveend',end);this.disposers.push(()=>{map.off('movestart',start);map.off('moveend',end);});}
  zoomBy(delta,anchor,now=performance.now()){
    const m=this.map,from=m.getZoom(),to=Math.max(m.getMinZoom(),Math.min(m.getMaxZoom(),(this.active?.to??from)+delta));
    if(Math.abs(to-from)<1e-9){this.cancel();return;}
    const size=m.getSize(),point=anchor||{x:size.x/2,y:size.y/2},at=m.containerPointToLatLng(point);
    // Public stop() fires viewreset with zoomSnap:0 in 1.9.4. Only stop actual
    // native movement; doing that for every wheel tick reprojects all geography.
    const already=Boolean(this.active);if(!already&&this.nativeMoving)m.stop();this.active={from,to,point:{x:point.x,y:point.y},at,start:now};
    if(!already)this.privateMove('start');
    if(this.reduced())this.step(now+this.duration);this.invalidate();
  }
  privateMove(operation,center,zoom){this.internal=true;try{if(operation==='start')this.map._moveStart(true);else if(operation==='end')this.map._moveEnd(true);else this.map._move(center,zoom);}finally{this.internal=false;}}
  step(now){
    const a=this.active;if(!a)return false;const t=Math.max(0,Math.min(1,(now-a.start)/this.duration)),zoom=a.from+(a.to-a.from)*(1-(1-t)**3),s=this.map.getSize(),p=this.map.project(a.at,zoom);
    const center=this.map.unproject({x:p.x-a.point.x+s.x/2,y:p.y-a.point.y+s.y/2},zoom);this.privateMove('move',center,zoom);
    if(t===1){this.active=null;this.privateMove('end');}return true;
  }
  cancel(){if(!this.active)return;this.active=null;this.privateMove('end');}
  bind(element){
    const listen=(target,type,fn,opts)=>{target.addEventListener(type,fn,opts);this.disposers.push(()=>target.removeEventListener(type,fn,opts));};
    listen(element,'wheel',e=>{e.preventDefault();e.stopPropagation();const r=element.getBoundingClientRect(),unit=e.deltaMode===1?16:e.deltaMode===2?element.clientHeight:1;this.zoomBy(Math.max(-1.5,Math.min(1.5,-e.deltaY*unit/240)),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
    listen(element,'dblclick',e=>{e.preventDefault();e.stopPropagation();const r=element.getBoundingClientRect();this.zoomBy(e.shiftKey?-1:1,{x:e.clientX-r.left,y:e.clientY-r.top});});
    // Capture only +/-; native Leaflet arrow-key panning and focus handling remain active.
    listen(element,'keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||!['+','=','-','_'].includes(e.key))return;e.preventDefault();e.stopImmediatePropagation();this.zoomBy(e.key==='-'||e.key==='_'?-1:1);},true);
    for(const type of ['pointerdown','touchstart','mousedown'])listen(element,type,()=>this.cancel(),{capture:true,passive:true});
    return this;
  }
  destroy(){this.cancel();for(const off of this.disposers)off();this.disposers=[];}
}
/** Snapshot honours Leaflet's rounded pixel origin and current native pane translation. */
export function cameraSnapshot(map){const zoom=map.getZoom(),size=map.getSize(),scale=2**(zoom-11),origin=map.getPixelOrigin(),layer=map.containerPointToLayerPoint([0,0]);return{zoom,width:size.x,height:size.y,scale,ox:(origin.x+layer.x)/scale,oy:(origin.y+layer.y)/scale,layer};}
