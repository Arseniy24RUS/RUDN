/** Render-only world geometry. Coordinates are projected once, never written to source rows. */
export const WORLD_ZOOM=11;
export class WorldIndex {
  constructor(records=[],cellSize=256){this.cellSize=cellSize;this.cells=new Map();this.records=records;for(const p of records){const key=this.key(p.x,p.y);let cell=this.cells.get(key);if(!cell)this.cells.set(key,cell=[]);cell.push(p);}}
  key(x,y){return `${Math.floor(x/this.cellSize)}:${Math.floor(y/this.cellSize)}`;}
  query(left,top,right,bottom){
    const out=[],s=this.cellSize,x0=Math.floor(left/s),x1=Math.floor(right/s),y0=Math.floor(top/s),y1=Math.floor(bottom/s);
    // At regional zoom iterating occupied cells is cheaper than visiting empty world cells.
    if((x1-x0+1)*(y1-y0+1)>this.cells.size*2){for(const p of this.records)if(p.x>=left&&p.x<=right&&p.y>=top&&p.y<=bottom)out.push(p);return out;}
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)for(const p of this.cells.get(`${x}:${y}`)||[])if(p.x>=left&&p.x<=right&&p.y>=top&&p.y<=bottom)out.push(p);
    return out;
  }
  clear(){this.cells.clear();this.records=[];}
}
/** Shared continuous art scale, normalised to the accepted selection camera. */
export const objectScale=zoom=>2**((Math.max(3,Math.min(15,zoom))-10.75)*.32);
export class BoundedCache extends Map {
  constructor(limit=128){super();this.limit=limit;}
  get(key){const v=super.get(key);if(v!==undefined){super.delete(key);super.set(key,v);}return v;}
  set(key,value){super.delete(key);super.set(key,value);while(this.size>this.limit)super.delete(this.keys().next().value);return this;}
}
/** Largest HUD-free axis-aligned area. Used only by an explicit focus command. */
export function focusSafeRect(width,height,obstacles,margin=8){
  const xs=new Set([margin,width-margin]),ys=new Set([margin,height-margin]);
  for(const [x,y,w,h] of obstacles){xs.add(Math.max(margin,Math.min(width-margin,x-margin)));xs.add(Math.max(margin,Math.min(width-margin,x+w+margin)));ys.add(Math.max(margin,Math.min(height-margin,y-margin)));ys.add(Math.max(margin,Math.min(height-margin,y+h+margin)));}
  const xx=[...xs].sort((a,b)=>a-b),yy=[...ys].sort((a,b)=>a-b);let best=null,area=0;
  for(let l=0;l<xx.length-1;l++)for(let r=l+1;r<xx.length;r++)for(let t=0;t<yy.length-1;t++)for(let b=t+1;b<yy.length;b++){
    const x=xx[l],y=yy[t],w=xx[r]-x,h=yy[b]-y;if(w*h<=area)continue;
    if(obstacles.some(o=>x<o[0]+o[2]+margin&&x+w>o[0]-margin&&y<o[1]+o[3]+margin&&y+h>o[1]-margin))continue;
    best=[x,y,w,h];area=w*h;
  }
  return best;
}
/** Fit source world points and fixed screen-space art envelopes without moving a
 * temporary camera or changing sprite anchors. Envelopes at maxZoom conservatively
 * contain the smaller artwork at the returned zoom, including accepted lift caps.
 */
export function fitWorldItems(items,safe,width,height,minZoom=3,maxZoom=11.5){
  if(!items.length||!safe)return null;
  const envelope=zoom=>{const scale=2**(zoom-WORLD_ZOOM);let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;for(const p of items){l=Math.min(l,p.x*scale+p.left);t=Math.min(t,p.y*scale+p.top);r=Math.max(r,p.x*scale+p.right);b=Math.max(b,p.y*scale+p.bottom);}return{l,t,r,b,scale};};
  let lo=minZoom,hi=maxZoom;for(let i=0;i<32;i++){const mid=(lo+hi)/2,e=envelope(mid);if(e.r-e.l<=safe[2]&&e.b-e.t<=safe[3])lo=mid;else hi=mid;}
  const e=envelope(lo),x=((e.l+e.r)/2-(safe[0]+safe[2]/2)+width/2)/e.scale,y=((e.t+e.b)/2-(safe[1]+safe[3]/2)+height/2)/e.scale;
  return{x,y,zoom:lo,envelope:e,fits:e.r-e.l<=safe[2]+1e-6&&e.b-e.t<=safe[3]+1e-6};
}
