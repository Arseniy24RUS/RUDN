/* Original low-poly environment, rendered with an orthographic software camera.
 * No concept screenshots, remote assets, GPU permissions, or external library.
 * Terrain/buildings are schematic; a project model is one representative site. */
(function(root){
'use strict';const G=root.GovernorGame=root.GovernorGame||{};
const M=G.WorldModel||(typeof require==='function'?require('./world-model.js'):null);
const P={grass:'#96b982',grass2:'#b6cb91',earth:'#728d68',stone:'#bdc7be',white:'#edf3ed',blue:'#178bbe',dark:'#294d65',roof:'#71879b',wood:'#ceaa88',water:'#59b7d2',road:'#a3a7a4',sand:'#e7ddbd',leaf:'#558976',gold:'#f6c253'};
function rng(seed){let a=seed|0;return()=>{a+=0x6D2B79F5;let t=Math.imul(a^a>>>15,1|a);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
function rgb(c){const x=parseInt(c.slice(1),16);return[x>>16&255,x>>8&255,x&255];}
function shade(c,k){return 'rgb('+rgb(c).map(v=>Math.max(0,Math.min(255,Math.round(v*k)))).join(',')+')';}
function project(p){return [p[0]*.91-p[2]*.415,p[0]*.215+p[2]*.47-p[1]*.855];}
function depth(p){return p[0]*.37+p[1]*.765+p[2]*.75;}
function normal(a,b,c){let u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],d=Math.hypot(...n)||1;return n.map(x=>x/d);}
function river(z){return 3+3*Math.sin((z+1)*.19);}
function height(x,z){let d=Math.abs(x-river(z));if(d<1.36)return -.36;if(d<1.9)return .04+(d-1.36)*.42;return .3+Math.sin(x*.4+z*.2)*.09+Math.cos(z*.52)*.05;}
function inside(x,z,pad=0){return (Math.abs(x)/(25-pad))**4+(Math.abs(z)/(18-pad))**4<1;}
function sceneBuilder(){
const faces=[];
function face(points,color,opts={}){const n=normal(...points.slice(0,3)),light=Math.max(0,n[0]*-.45+n[1]*.82+n[2]*.35),ambient=.86;
  const k=opts.flat?1:ambient+light*.25;
  const centre=points.reduce((c,p)=>c.map((x,i)=>x+p[i]/points.length),[0,0,0]);
  faces.push({pts:points.map(project),color:shade(color,k),alpha:opts.alpha??1,depth:depth(centre)+(opts.order||0),stroke:opts.stroke});}
function box(x,y,z,w,h,d,color,top=color,rot=0){
  const cs=Math.cos(rot),sn=Math.sin(rot),q=(xx,yy,zz)=>[x+xx*cs-zz*sn,y+yy,z+xx*sn+zz*cs];
  const a=q(-w/2,0,-d/2),b=q(w/2,0,-d/2),c=q(w/2,0,d/2),f=q(-w/2,0,d/2),A=q(-w/2,h,-d/2),B=q(w/2,h,-d/2),C=q(w/2,h,d/2),F=q(-w/2,h,d/2);
  face([A,F,C,B],top);face([a,b,B,A],color);face([b,c,C,B],color);face([c,f,F,C],color);face([f,a,A,F],color);
}
function cone(x,y,z,r,h,color,n=7,rt=0){
  for(let i=0;i<n;i++){let a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;face([[x+r*Math.cos(a),y,z+r*Math.sin(a)],[x+r*Math.cos(b),y,z+r*Math.sin(b)],[x+rt*Math.cos(b),y+h,z+rt*Math.sin(b)],[x+rt*Math.cos(a),y+h,z+rt*Math.sin(a)]],color);}
  if(rt)face(Array.from({length:n},(_,i)=>{let t=-i/n*Math.PI*2;return[x+rt*Math.cos(t),y+h,z+rt*Math.sin(t)];}),color);
}
function roof(x,y,z,w,h,d,color){
 const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],f=[x-w/2,y,z+d/2],l=[x-w/2,y+h,z],r=[x+w/2,y+h,z];
 face([a,l,r,b],color);face([f,c,r,l],color);face([a,f,l],P.white);face([b,r,c],P.white);
}
function shadow(x,z,rx,rz){const y=height(x,z)+.018;face(Array.from({length:9},(_,i)=>{const t=-i/9*6.283;return[x+.3+Math.cos(t)*rx,y,z+.22+Math.sin(t)*rz];}),'#334e57',{alpha:.12,flat:true,order:-.001});}
function tree(x,z,s=1,type='pine',col){const y=height(x,z);shadow(x,z,.48*s,.42*s);box(x,y,z,.12*s,.7*s,.12*s,'#8a8065');
 if(type==='pine'){cone(x,y+.4*s,z,.65*s,1.4*s,col||'#5c977f');cone(x,y+1*s,z,.45*s,1.1*s,col||'#77a184');}
 else {cone(x,y+.45*s,z,.63*s,.55*s,col||'#779e75',7,.79*s);cone(x,y+1*s,z,.79*s,.77*s,col||'#8bae78',7,.13*s);}}
function windows(x,y,z,w,h,d,rows=2,lit=true){const col=lit?'#6ab3ca':'#9eabb0';
 for(let r=0;r<rows;r++)for(let c=0;c<3;c++){let xx=x-w*.31+c*w*.31,yy=y+.22+(r+.1)*(h-.15)/rows;face([[xx-.08,yy,z+d/2+.014],[xx+.08,yy,z+d/2+.014],[xx+.08,yy+.15,z+d/2+.014],[xx-.08,yy+.15,z+d/2+.014]],col,{flat:true});}
 for(let r=0;r<rows;r++)for(let c=0;c<2;c++){let zz=z-d*.23+c*d*.46,yy=y+.22+r*(h-.15)/rows;face([[x+w/2+.015,yy,zz-.08],[x+w/2+.015,yy,zz+.08],[x+w/2+.015,yy+.15,zz+.08],[x+w/2+.015,yy+.15,zz-.08]],col,{flat:true});}
}
function house(x,z,w=.75,h=.65,d=.85,c=P.white,rc=P.roof){let y=height(x,z);shadow(x,z,w*.66,d*.7);box(x,y,z,w,h,d,c);roof(x,y+h,z,w*1.12,h*.42,d*1.1,rc);windows(x,y,z,w,h,d,1);box(x-.15,y+h+.2,z-.2,.12,.34,.14,'#f1dfcf');}
function road(points,width=.48,color=P.road){
 for(let i=1;i<points.length;i++){const aa=points[i-1],bb=points[i],dx=bb[0]-aa[0],dz=bb[1]-aa[1],len=Math.hypot(dx,dz),nx=-dz/len*width/2,nz=dx/len*width/2,n=Math.ceil(len/.42);
 for(let j=0;j<n;j++){let a=[aa[0]+dx*j/n,aa[1]+dz*j/n],b=[aa[0]+dx*(j+1)/n,aa[1]+dz*(j+1)/n];
 const poly=(w,y)=>[[a[0]+nx*w,y,a[1]+nz*w],[a[0]-nx*w,y,a[1]-nz*w],[b[0]-nx*w,y,b[1]-nz*w],[b[0]+nx*w,y,b[1]+nz*w]];
 face(poly(1.55,.495),P.sand);face(poly(1,.505),color);if(j%4===0)face(poly(.065,.517),'#eee9d5');
 }}
}
function tower(x,z,w,h,d,color=P.white){let y=height(x,z);shadow(x,z,w*.75,d*.75);box(x,y,z,w,h,d,color);box(x,y+h,z,w*1.07,.12,d*1.07,P.blue,'#b1d5e1');box(x,y+h+.12,z,.3,.25,.26,P.white);windows(x,y,z,w,h,d,Math.min(5,Math.ceil(h*1.8)));}
function factory(x,z,green=false,small=false){const y=height(x,z),s=small?.72:1;shadow(x,z,2*s,1.4*s);box(x,y,z,3*s,1*s,1.7*s,green?'#e6edda':'#c5d1d1',P.blue);windows(x,y,z,3*s,1*s,1.7*s,2);for(let i=0;i<4;i++)box(x-1*s+i*.66*s,y+1*s,z, .53*s,.12,1.5*s,green?'#529db7':'#7795a1');
 cone(x+1.4*s,y,z-.7*s,.22*s,2.3*s,green?'#dedfd7':'#899b9b',8,.18*s);cone(x-1.4*s,y,z-.55*s,.44*s,1.2*s,'#abc3cd',10,.44*s);}
function pond(x,z,rx,rz,col=P.water){face(Array.from({length:22},(_,i)=>{const t=-i/22*Math.PI*2;return[x+Math.cos(t)*rx,.33,z+Math.sin(t)*rz];}),col);}
function crane(x,y,z){box(x,y,z,.18,3.8,.18,P.gold);box(x+1.1,y+3.6,z,2.8,.16,.15,P.gold);box(x-.6,y+3.48,z,.48,.5,.55,'#567a96');box(x+2.3,y+1.9,z,.03,1.8,.035,'#52697b');box(x+2.3,y+1.65,z,.22,.13,.19,'#536d75');}
function projectModel(p){const x=p.x,z=p.z,y=height(x,z)+.06;shadow(x,z,1.3,1.3);
 const inactive=p.status==='completed',partial=p.partial,primary=inactive?'#a6b7b5':partial?'#e1c99b':P.white,blue=inactive?'#8fa4a9':P.blue;
 box(x,y-.01,z,2.3,.08,2.1,inactive?'#b9c2ac':'#d6dbc5');
 if(p.status==='delivery'){
  box(x,y+.08,z,1.6,.18,1.2,'#c4c9bb');
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)box(x+i*.65,y+.22,z+j*.5,.1,1.12,.1,'#e8dcb8');
  box(x,y+.85,z,1.55,.08,1.12,'#d4d7c8');crane(x-.86,y,z-.62);
  for(let i=0;i<4;i++)box(x-.8+i*.5,y+.15,z+1,.32,.24,.08,'#ecc269');return;
 }
 switch(p.kind){
 case'training':
  box(x,y+.1,z,1.8,.16,1.4,'#a9cad6',P.white);
  for(const [dx,dz,col,skin]of[[-.52,-.1,'#2a83ac','#d6ab88'],[.45,-.1,'#64a1ad','#a17959'],[0,.65,'#4d678b','#edc6a0']]){
   cone(x+dx,y+.27,z+dz,.16,.53,col,7,.11);cone(x+dx,y+.8,z+dz,.14,.22,skin,9,.11);
  }
  box(x,y+.64,z-.4,1.2,.08,.55,'#e6e9d9');box(x-.2,y+.7,z-.4,.35,.045,.26,P.blue);break;
 case'clinic':case'care':
  box(x,y+.08,z,1.45,1.25,1.1,primary,blue);box(x-.85,y+.08,z+.4,.55,.7,1.2,primary,blue);box(x+.78,y+.08,z+.4,.55,.7,1.2,primary,blue);
  box(x,y+1.35,z,.17,.04,.65,'#ebf7f7');box(x,y+1.35,z,.65,.04,.17,'#ebf7f7');windows(x,y+.1,z,1.45,1.1,1.1,2,!inactive);break;
 case'school':
  box(x,y+.08,z,1.95,.72,1.04,primary,blue);box(x-.64,y+.8,z,.55,.35,.8,primary,blue);windows(x,y+.1,z,1.95,.7,1.04,2,!inactive);box(x+.22,y+.09,z+.75,1.15,.04,.35,'#729d82');box(x+.76,y+.1,z+.65,.08,.5,.08,'#dfbb75');break;
 case'barrier':
  for(let i=0;i<5;i++)box(x-.9+i*.44,y,z,.43,.4,.6,'#bfc6c6',primary);box(x,y+.04,z+.7,1.95,.08,.4,blue);break;
 case'nature':tree(x-.7,z-.35,.8,'round');tree(x+.4,z-.55,.95,'round');pond(x+.2,z+.5,.7,.38);box(x-.7,y+.1,z+.6,.65,.1,.22,'#d2aa7c');break;
 case'transport':
  box(x,y+.08,z-.4,1.8,.35,.7,primary,blue);box(x,y+.1,z+.45,1.4,.45,.52,inactive?'#a4aba9':'#f2dc86',blue);box(x+.55,y+.55,z+.45,.25,.15,.52,'#7ab5c8');for(let a of[-.44,.44])for(let b of[-.28,.28])cone(x+a,y+.08,z+.45+b,.12,.15,'#4a6374',8,.12);break;
 case'industry':case'greenIndustry':factory(x,z,p.kind==='greenIndustry',true);break;
 case'housing':for(let i of[-.58,.58]){box(x+i,y+.09,z,.72,1.45,.94,primary,blue);windows(x+i,y+.09,z,.72,1.45,.94,3,!inactive);}break;
 case'digital':
  box(x,y+.08,z,1.6,.9,1.25,primary,blue);for(let i=0;i<4;i++)box(x-.55+i*.36,y+1,z,.23,.08,.85,'#79b5c9');box(x+.67,y+1,z-.25,.04,.92,.04,'#a5b8c1');cone(x+.67,y+1.7,z-.25,.24,.15,blue,8,.05);windows(x,y+.09,z,1.6,.9,1.25,2,!inactive);break;
 default:
  box(x,y+.08,z,1.25,.78,1.05,primary,blue);windows(x,y+.1,z,1.25,.78,1.05,2,!inactive);box(x+.8,y,z,.035,1.65,.04,P.dark);box(x+.99,y+1.27,z,.35,.27,.04,blue);
 }
 if(inactive){box(x,y+.12,z+1,.68,.09,.07,'#a0a8a2');}
 if(partial&&!inactive){box(x+.9,y,z+.9,.04,1.35,.04,P.dark);box(x+1.08,y+1.02,z+.9,.34,.27,.04,P.gold);}
}
return{faces,face,box,cone,roof,tree,road,tower,house,factory,pond,projectModel};}
let baseCache;
function base(){if(baseCache)return baseCache;const b=sceneBuilder(),r=rng(294782);
 // A sculpted atlas, not a geographic claim about a real administrative region.
 const perimeter=Array.from({length:64},(_,i)=>{const a=-i/64*Math.PI*2,c=Math.cos(a),s=Math.sin(a);return[Math.sign(c)*25*Math.sqrt(Math.abs(c)),-.25,Math.sign(s)*18*Math.sqrt(Math.abs(s))];});
 for(let i=0;i<perimeter.length;i++){let a=perimeter[i],p=perimeter[(i+1)%perimeter.length];b.face([a,[a[0],-2.1,a[2]],[p[0],-2.1,p[2]],p],'#8db6b6');b.face([[a[0],-2.1,a[2]],[a[0],-2.42,a[2]],[p[0],-2.42,p[2]],[p[0],-2.1,p[2]]],'#d4e8e4');}
 function clipped(x,z){const q=(Math.abs(x)/25)**4+(Math.abs(z)/18)**4;if(q>1){const f=q**(-.25);x*=f;z*=f;}return[x,height(x,z),z];}
 for(let z=-18;z<18;z+=.9)for(let x=-25;x<25;x+=.9){
  const w=.91;if(!inside(x+w*.5,z+w*.5))continue;
  const tone=.98+.028*Math.sin(x*.5)*Math.sin(z*.36)+r()*.008;
  const c=rgb('#a6c58c').map(v=>Math.round(v*tone)),col='#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
  b.face([clipped(x,z),clipped(x,z+w),clipped(x+w,z+w),clipped(x+w,z)],Math.abs(x-river(z))<1.65?'#83b7b4':col);
 }
 // River with visible banks and blue water, following exactly the same geometry as bridges.
 for(let z=-18;z<18;z+=.38){const a=river(z),c=river(z+.39);b.face([[a-1.28,.055,z],[a+1.28,.055,z],[c+1.28,.055,z+.39],[c-1.28,.055,z+.39]],P.water,{flat:true});b.face([[a-.15,.058,z],[a+.16,.058,z],[c+.16,.058,z+.39],[c-.15,.058,z+.39]],'#7cc7dc',{alpha:.55,flat:true});}
 // Connected road network. Broad fixed crossings are bridges, not arbitrary line art.
 b.road([[-18,6],[-12,7],[-6,7],[-1,9],[5,9],[10,9],[18,8]],.55);
 b.road([[-13,7],[-10,2],[-9,-5],[-12,-10]],.48);
 b.road([[-9,-5],[-3,-6],[4,-6],[11,-6],[19,-8]],.42);
 b.road([[11,-6],[14,-1],[14,8]],.43);
 for(const z of[-6,9]){const x=river(z);b.box(x,.19,z,3.8,.42,.66,'#e2dfd0');b.box(x,.64,z,3.8,.04,.49,P.road);b.box(x,.71,z+.3,3.9,.14,.07,'#e5e4d8');b.box(x,.71,z-.3,3.9,.14,.07,'#e5e4d8');}
 // Fields in the valley, visually distinct from housing and industry.
 for(let i=0;i<6;i++){let x=15+(i%2)*3.1,z=-14+Math.floor(i/2)*2.5;b.box(x,.36,z,2.6,.015,1.9,i%2?'#d5cb8e':'#bfd193');for(let j=0;j<6;j++)b.box(x-1.05+j*.42,.39,z,.045,.015,1.8,'#a7b97b');}
 // Hand-shaped faceted ridges and irregular snow caps.
 for(const [x,z,rad,h] of[[-20,-13,4.3,5],[-16,-15,3.8,6.6],[-8,-16,3.4,4.4],[-23,-6,3,3.6]]){
  const rings=[0,.25,.57,.8,1].map((k,j)=>Array.from({length:11},(_,i)=>{const a=i/11*Math.PI*2,rr=rad*(1-k)*( .85+r()*.28 );return[x+Math.cos(a)*rr+k*.75,.3+h*k+(j>0&&j<4?(r()-.5)*.4:0),z+Math.sin(a)*rr];}));
  for(let j=0;j<4;j++)for(let i=0;i<11;i++){const n=(i+1)%11;b.face([rings[j][i],rings[j][n],rings[j+1][n],rings[j+1][i]],j===3?'#f1f3eb':j===2?'#baccc4':j===1?'#94aea0':'#91ad8b');}
 }
 const buildingAreas=[{x:-15,z:-8,w:8,d:5,n:24,type:'house'},{x:-15,z:7,w:10,d:7,n:25,type:'industry'},{x:-1,z:11,w:9,d:8,n:43,type:'city'},{x:17,z:8,w:8,d:7,n:30,type:'suburb'},{x:12,z:-8,w:5,d:6,n:14,type:'house'}];
 for(const area of buildingAreas){for(let i=0;i<area.n;i++){
   const cols=Math.ceil(Math.sqrt(area.n)),xx=area.x-area.w/2+(i%cols)*area.w/cols,zz=area.z-area.d/2+Math.floor(i/cols)*area.d/cols;
   if(!inside(xx,zz,1)||Math.abs(xx-river(zz))<2||M.PLACES.some(p=>Math.abs(xx-p.x)<4&&Math.abs(zz-p.z)<3))continue;
   if(area.type==='city')b.tower(xx,zz,.8+r()*.35,1+r()*3, .75+r()*.35,r()>.75?'#cadcdb':P.white);
   else if(area.type==='suburb')b.tower(xx,zz,.8,1.1+r()*1.35,.85,r()>.5?P.white:'#e1d7c3');
   else b.house(xx,zz,.68+r()*.2,.6+r()*.25,.82,P.white,r()>.5?'#ac9382':'#658ca2');
 }}
 b.factory(-19,4);b.factory(-18,11);b.factory(-10,12);
 // Civic centre, square and waterfront; purely background, not newly financed projects.
 b.box(-2,.39,6,2.7,.1,1.8,'#d3d9c9');b.box(-2,.51,5.8,1.8,.9,1,'#f2efe1');b.roof(-2,1.41,5.8,2,.34,1.2,'#538dac');for(let i=0;i<4;i++)b.box(-2.6+i*.4,.5,6.39,.09,.76,.09,'#f4f4e6');
 b.pond(8,14,2.6,1.1,'#8dc8cd');
 // Forests are deterministic decoration; their density does not encode population.
 for(let i=0;i<530;i++){let x=(r()-.5)*48,z=(r()-.5)*34;if(!inside(x,z,1)||Math.abs(x-river(z))<2.5)continue;
 if(M.PLACES.some(p=>Math.hypot(x-p.x,(z-p.z)*1.12)<5))continue;
 if(buildingAreas.some(a=>Math.abs(x-a.x)<a.w/2+.8&&Math.abs(z-a.z)<a.d/2+.5))continue;
 if(z>6.2&&z<9.7||Math.abs(z+6)<.8||x>13&&x<15)continue;
 if(x>13&&z<-6||x<-13&&z<-10)continue;
 b.tree(x,z,.55+r()*.48,z<0?'pine':'round',r()>.6?'#689982':null);}
 // Small parks/avenues around places, allowing clear project sites in the centre.
 for(const p of M.PLACES)for(let i=0;i<7;i++)b.tree(p.x-3.8+i*1.2,p.z-2.7,.47,'round');
 baseCache=b.faces;return baseCache;}
function build(snapshot){const b=sceneBuilder();for(const p of snapshot.projects)b.projectModel(p);
 if(snapshot.hazard==='flood'){b.pond(9,-2,5.6,3.1,'#71b9c8');for(let i=0;i<5;i++)b.box(6.5+i*.8,.65,.2,.55,.2,.32,'#dec9a5');}
 return base().concat(b.faces).sort((a,b)=>a.depth-b.depth);}
const BOUNDS={left:-27.5,right:27.5,top:-16.8,bottom:14.3};
function fit(width,height,view={}){const s=Math.min(width/(BOUNDS.right-BOUNDS.left),height/(BOUNDS.bottom-BOUNDS.top))*.95;
 return {scale:s*(view.zoom||1),cx:width/2+(view.dx||0),cy:height/2-s*(BOUNDS.top+BOUNDS.bottom)/2+(view.dy||0)};}
function screen(p,width,height,view){const xy=project(p),t=fit(width,height,view);return{x:xy[0]*t.scale+t.cx,y:xy[1]*t.scale+t.cy};}
function paint(ctx,width,height,faces,view={},options={}){
 const t=fit(width,height,view);ctx.clearRect(0,0,width,height);
 const sky=ctx.createLinearGradient(0,0,0,height);sky.addColorStop(0,'#e8f4f8');sky.addColorStop(1,'#baddea');ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
 // Island contact shadow on the atlas surface.
 if(!options.noShadow){ctx.save();ctx.translate(t.cx,t.cy+7*t.scale);ctx.scale(t.scale,t.scale*.32);ctx.beginPath();ctx.ellipse(0,0,25,14,0,0,6.283);ctx.fillStyle='rgba(32,82,107,.09)';ctx.fill();ctx.restore();}
 ctx.lineJoin='round';ctx.lineCap='round';
 for(const f of faces){const pts=f.pts;ctx.beginPath();ctx.moveTo(pts[0][0]*t.scale+t.cx,pts[0][1]*t.scale+t.cy);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0]*t.scale+t.cx,pts[i][1]*t.scale+t.cy);ctx.closePath();ctx.globalAlpha=f.alpha;ctx.fillStyle=f.color;ctx.fill();if(f.alpha===1){ctx.lineWidth=.42;ctx.strokeStyle=f.color;ctx.stroke();}}
 ctx.globalAlpha=1;return t;
}
function sample(kind,status='active'){const b=sceneBuilder();b.projectModel({id:kind,kind,x:0,z:0,status});return b.faces.sort((a,b)=>a.depth-b.depth);}
G.WorldGeometry={P,project,screen,fit,build,base,height,river,BOUNDS,paint,sample};
if(typeof module!=='undefined'&&module.exports)module.exports=G.WorldGeometry;
})(typeof window!=='undefined'?window:globalThis);
