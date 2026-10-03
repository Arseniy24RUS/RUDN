/**
 * Decorative scene, derived from supplied art. Never a land-cover/relief dataset.
 * Geometry of settlements and roads remains authoritative in GameMap.
 * Raster sprites are cached, world-anchored, culled and removed at regional LOD.
 */
import {WorldIndex,objectScale} from './render-index.mjs';
import {artworkProfile,artworkVariant,recordArtworkDraw,VEGETATION} from './assets.mjs';
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function seed(a,b,c=0){let n=Math.imul(a|0,374761393)^Math.imul(b|0,668265263)^c;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
export class Landscape {
  constructor(map,images,wrap=false){this.map=map;this.images=images;this.wrap=wrap;this.paths=[];this.enabled=true;this.theme='grass';this.chunks=new Map();this.cacheLimit=128;this.pool=[];this.poolLimit=720;this.cacheHits=0;this.cacheMisses=0;this.surfaceBuilds=0;this.surface=null;this.metrics={};this.index=null;this.roadIndex=new WorldIndex();this.lod=true;this.lodAlpha=1;this.lastPaint=0;this.needsFrame=false;this.quality=1;this.targetQuality=1;this.badFrames=0;this.goodFrames=0;this.lastQualityChange=0;this.reserved=[];}
  setRoads(geo){
    const paths=[];
    for(const f of geo.features||[]){const g=f.geometry;if(!g)continue;const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
      for(const line of lines)paths.push(line.map(c=>{const p=this.map.project([c[1],this.wrap&&c[0]<0?c[0]+360:c[0]],11);return [p.x,p.y];}));}
    this.paths=paths;const points=[];
    for(const path of paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/12));for(let j=0;j<=steps;j++){const t=j/steps;points.push({x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t});}}
    this.roadIndex=new WorldIndex(points,128);this.chunks.clear();
  }
  chunk(cx,cy){
    const key=`${cx}:${cy}`,cached=this.chunks.get(key);if(cached){this.chunks.delete(key);this.chunks.set(key,cached);this.cacheHits++;return cached;}
    const records=[],grid=49;
    for(let y=cy*8;y<(cy+1)*8;y++)for(let x=cx*8;x<(cx+1)*8;x++){
      const density=(Math.sin(x*.73)+Math.cos(y*.47)+Math.sin(x*.22+y*.43)+3)/6;if(seed(x,y,52)>density*.76)continue;
      for(let k=0;k<(density>.64?3:1);k++){
        const group=seed(x,y,k+84)>.32?VEGETATION.slice(0,3):seed(x,y,k+93)>.25?VEGETATION.slice(3,6):VEGETATION.slice(6);
        records.push({key:`${x}:${y}:${k}`,wx:x*grid+seed(x,y,k+38)*grid,wy:y*grid+seed(y,x,k+64)*grid,size:26+seed(x,y,k+19)*22,id:artworkVariant(group,Math.floor(seed(x,y,k+105)*997)),rank:seed(x,y,k+141)});
      }
    }
    const accepted=records.filter(r=>{const w=Math.min(r.size,r.id.startsWith('shrub')?32:54)*1.65,box=[r.wx-w*.5,r.wy-w*.9,w,w];
      return !this.index?.query(box[0]-38,box[1]-38,box[0]+w+38,box[1]+w+38).some(p=>{const x=clamp(p.x,box[0],box[0]+w),y=clamp(p.y,box[1],box[1]+w);return Math.hypot(p.x-x,p.y-y)<(p.row.population>=500?35:25);})&&!this.roadIndex.query(box[0]-10,box[1]-10,box[0]+w+10,box[1]+w+10).length;
    });
    this.cacheMisses++;this.chunks.set(key,accepted);while(this.chunks.size>this.cacheLimit)this.chunks.delete(this.chunks.keys().next().value);return accepted;
  }
  setIndex(index){this.index=index;this.chunks.clear();}
  setReservations(boxes,paths,camera){
    const {ox,oy,scale}=camera;this.reserved=boxes.map(b=>[ox+b[0]/scale,oy+b[1]/scale,b[2]/scale,b[3]/scale]);
    for(const path of paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/16));for(let j=0;j<=steps;j++){const t=j/steps;this.reserved.push([ox+(a.x+(b.x-a.x)*t-16)/scale,oy+(a.y+(b.y-a.y)*t-16)/scale,32/scale,32/scale]);}}
  }
  observeBudget(ms,moving,now){
    if(ms>12){this.badFrames++;this.goodFrames=0;}else if(ms<7){this.goodFrames++;this.badFrames=Math.max(0,this.badFrames-1);}
    if(!moving&&now-this.lastQualityChange>1200){if(this.badFrames>=8){this.targetQuality=Math.max(.35,this.targetQuality-.2);this.badFrames=0;this.lastQualityChange=now;}else if(this.goodFrames>=90){this.targetQuality=Math.min(1,this.targetQuality+.1);this.goodFrames=0;this.lastQualityChange=now;}}
  }
  paintSurface(ctx,width,height,ox,oy,scale,level,ground,palette,terrainId){
    const ready=Boolean(ground?.complete&&ground.naturalWidth),old=this.surface;
    // One small, world-anchored material tile. Zoom/pan never prepare or upload a
    // new viewport-sized raster. The approved terrain supplies the texture;
    // expensive procedural gradients are deliberately omitted from decoration.
    if(!old||old.theme!==this.theme||old.ready!==ready){
      const canvas=old?.canvas||document.createElement('canvas'),size=512;canvas.width=size;canvas.height=size;
      const c=canvas.getContext('2d');c.fillStyle=palette[0];c.fillRect(0,0,size,size);
      if(ready){c.globalAlpha=.55;c.drawImage(ground,0,0,size,size);}
      this.surface={canvas,theme:this.theme,ready,pattern:ctx.createPattern(canvas,'repeat'),scale:1,ox:0,oy:0,width:size,height:size};this.surfaceBuilds++;
    }
    const s=this.surface;ctx.save();ctx.translate(-ox*scale,-oy*scale);ctx.scale(scale,scale);ctx.fillStyle=s.pattern||palette[0];ctx.fillRect(ox,oy,width/scale,height/scale);ctx.restore();
    if(ready)recordArtworkDraw(terrainId,ground,[0,0,width,height],{layer:'terrain',viewport:[width,height],theme:this.theme,opacity:.55});
  }
  evidence(){return{...this.metrics,poolSize:this.pool.length,poolLimit:this.poolLimit,cacheSize:this.chunks.size,cacheLimit:this.cacheLimit,cacheHits:this.cacheHits,cacheMisses:this.cacheMisses,surfaceBuilds:this.surfaceBuilds,surfaceCachePixels:this.surface?this.surface.canvas.width*this.surface.canvas.height:0,quality:this.quality,targetQuality:this.targetQuality,worldExclusion:true};}
  destroy(){this.chunks.clear();this.pool.length=0;this.paths=[];this.reserved=[];this.roadIndex.clear();this.index=null;if(this.surface){this.surface.canvas.width=1;this.surface.canvas.height=1;this.surface=null;}}
  paint(ctx,width,height,positions,reservedBoxes=[],routePaths=[],camera,moving=false){
    ctx.clearRect(0,0,width,height);this.metrics={signature:'00000000',candidates:0,visible:0};this.needsFrame=false;if(!this.enabled)return;
    const {zoom,scale,ox,oy}=camera,level=clamp((zoom-7.8)/2.6,0,1),terrainId=`terrain_${this.theme}`,ground=this.images.get(terrainId),palette=this.theme==='dry'?['#e7d4ab','188,158,105','255,240,198']:this.theme==='snow'?['#eef3f2','183,203,208','255,254,250']:['#dce7bd','112,153,83','248,240,170'];
    this.paintSurface(ctx,width,height,ox,oy,scale,level,ground,palette,terrainId);
    const now=performance.now(),dt=Math.min(50,this.lastPaint?now-this.lastPaint:16.7);this.lastPaint=now;
    if(!moving){if(zoom<9.35)this.lod=false;else if(zoom>9.6)this.lod=true;this.quality+=clamp(this.targetQuality-this.quality,-dt/600,dt/600);this.lodAlpha+=clamp(Number(this.lod)-this.lodAlpha,-dt/180,dt/180);this.needsFrame=Math.abs(this.targetQuality-this.quality)>.001||Math.abs(Number(this.lod)-this.lodAlpha)>.001;}
    const opacity=clamp((zoom-9.35)/.65,0,1)*.94*this.lodAlpha;if(opacity<=0)return;
    const active=[],grid=49,ts=Math.floor((ox-100/scale)/grid),ty=Math.floor((oy-100/scale)/grid),te=Math.ceil((ox+(width+100)/scale)/grid),tb=Math.ceil((oy+(height+100)/scale)/grid);if((te-ts)*(tb-ty)>5500)return;
    // Stable world-rank threshold: panning never changes membership to fill a screen quota.
    for(let cy=Math.floor(ty/8);cy<=Math.floor(tb/8);cy++)for(let cx=Math.floor(ts/8);cx<=Math.floor(te/8);cx++)for(const r of this.chunk(cx,cy)){
      const alpha=clamp((this.quality-r.rank)/.12,0,1);if(!alpha)continue;const x=(r.wx-ox)*scale,y=(r.wy-oy)*scale;if(x< -100||x>width+100||y< -60||y>height+100)continue;
      this.metrics.candidates++;const size=Math.min(r.size,r.id.startsWith('shrub')?32:54)*objectScale(zoom),worldSize=Math.min(r.size,r.id.startsWith('shrub')?32:54)*1.65,worldBox=[r.wx-worldSize*.5,r.wy-worldSize*.9,worldSize,worldSize];
      if(this.reserved.some(b=>worldBox[0]<b[0]+b[2]+3&&worldBox[0]+worldBox[2]+3>b[0]&&worldBox[1]<b[1]+b[3]+3&&worldBox[1]+worldBox[3]+3>b[1]))continue;
      active.push({key:r.key,id:r.id,x,y,size,alpha});
    }
    active.sort((a,b)=>a.y-b.y||a.x-b.x);this.pool=active.slice(0,this.poolLimit);ctx.save();let signature=2166136261;
    // pool is diagnostics only. Every eligible visible decoration is rendered, not first-N culled.
    for(const t of active){const image=this.images.get(t.id);if(!image?.complete||!image.naturalWidth)continue;const profile=artworkProfile(t.id,image),size=t.size,h=size*image.naturalHeight/image.naturalWidth,anchor=profile?.anchor||[.5,1],box=[t.x-size*anchor[0],t.y-h*anchor[1],size,h];ctx.globalAlpha=opacity*t.alpha;
      if(this.quality>.6){ctx.fillStyle='rgba(44,84,43,.10)';ctx.beginPath();ctx.ellipse(t.x+3,t.y-2,size*.35,size*.12,-.18,0,Math.PI*2);ctx.fill();}ctx.drawImage(this.images.raster(image,size),...box);recordArtworkDraw(t.id,image,box,{layer:'vegetation',viewport:[width,height],opacity:ctx.globalAlpha});this.metrics.visible++;for(const ch of t.key+':'+t.id)signature=Math.imul(signature^ch.charCodeAt(0),16777619);
    }
    this.metrics.signature=(signature>>>0).toString(16).padStart(8,'0');ctx.restore();
  }
}
