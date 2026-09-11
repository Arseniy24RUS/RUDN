/* Raster art is the scene substrate; DOM labels and project states remain live.
 * One coordinate transform is shared by illustration, pins, selection and export.
 * This is a schematic fictional region, not a georeferenced transport network.
 */
(function(root){
'use strict';const G=root.GovernorGame,A=G.IllustratedAssets,F=G.WorldGeometry;
const ANCHORS={north:[.245,.29],industrial:[.59,.75],river:[.245,.61],capital:[.57,.435],suburb:[.82,.35]};
function ready(){return !!A.peek(A.base+'region.webp');}
function project(p){
 if(!ready())return F.project(p);
 const [x,y,z]=p;
 const place=G.WorldModel.PLACES.reduce((a,b)=>Math.hypot(x-a.x,z-a.z)<=Math.hypot(x-b.x,z-b.z)?a:b);
 const anchor=ANCHORS[place.id];
 return[(anchor[0]+(x-place.x)*.026-.5)*1000,(anchor[1]+(z-place.z)*.035-.5)*562-y*3];
}
function fit(w,h,view={}){if(!ready())return F.fit(w,h,view);return{scale:Math.min(w/1000,h/390)*.99*(view.zoom||1),cx:w/2+(view.dx||0),cy:h/2+(view.dy||0)};}
function screen(p,w,h,view){const xy=project(p),t=fit(w,h,view);return{x:xy[0]*t.scale+t.cx,y:xy[1]*t.scale+t.cy};}
function build(snapshot){return{snapshot,length:snapshot.projects.length};}
function paint(ctx,w,h,built,view={}){
 const model=built.snapshot||built;
 if(!ready()){return F.paint(ctx,w,h,F.build(model),view);}
 const t=fit(w,h,view),back=A.peek(A.base+'region.webp');
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#d4e2ee';ctx.fillRect(0,0,w,h);
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(back,t.cx-500*t.scale,t.cy-281*t.scale,1000*t.scale,562*t.scale);
 const items=model.projects.slice().sort((a,b)=>project([a.x,0,a.z])[1]-project([b.x,0,b.z])[1]);
 for(const p of items){
  const xy=screen([p.x,0,p.z],w,h,view);
  const im=A.peek(p.visualSrc),site=!!p.structural;
  // Non-building interventions stay a small symbol, never a fabricated new school.
  const width=(site?112:p.visual?.direct?86:48)*t.scale,height=width;
  ctx.save();
  ctx.fillStyle=p.status==='delivery'?'rgba(204,145,35,.38)':p.status==='completed'?'rgba(76,101,112,.32)':'rgba(0,126,200,.3)';
  ctx.beginPath();ctx.ellipse(xy.x,xy.y,34*t.scale,12*t.scale,0,0,Math.PI*2);ctx.fill();
  if(im){
   if(!site&&!p.visual?.direct){ctx.beginPath();ctx.arc(xy.x,xy.y-height*.49,height*.44,0,Math.PI*2);ctx.fillStyle='#eff8ff';ctx.fill();ctx.clip();}
   ctx.globalAlpha=p.status==='completed'?(site?.78:.55):p.visual?.targetView?.60:1;
   if(p.status==='completed')ctx.filter='saturate(.35)';
   else if(p.visual?.targetView)ctx.filter='saturate(.55)';
   ctx.drawImage(im,xy.x-width/2,xy.y-height*.948,width,height);
  }else{
   ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(xy.x,xy.y-11*t.scale,12*t.scale,0,7);ctx.fill();
   ctx.fillStyle='#0784cb';ctx.font=`600 ${16*t.scale}px system-ui`;ctx.textAlign='center';ctx.fillText(site?'⌂':'•',xy.x,xy.y-5*t.scale);
  }
  ctx.restore();
 }
 return t;
}
G.IllustratedWorld={ANCHORS,ready,project,fit,screen,build,paint,prepare:A.prepare};
})(typeof window!=='undefined'?window:globalThis);
