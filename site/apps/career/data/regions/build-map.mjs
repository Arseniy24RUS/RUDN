/** Derive the career selector's small SVG map from the geographical puzzle.
 * Shared arcs are projected and simplified once, preserving identical borders.
 * Run from any directory: node site/apps/career/data/regions/build-map.mjs [--check]
 */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const sourceURL=new URL('../../../../assets/puzzle/data/russia_subjects_89.topojson',import.meta.url);
const targetURL=new URL('../region-map.json',import.meta.url);
const source=await readFile(sourceURL);
const topology=JSON.parse(source);
const geometries=topology.objects.collection.geometries;
const width=1000,height=560,padding=18,tolerance=.14;
const radians=Math.PI/180;
const project=([longitude,latitude])=>{
  const centralLongitude=((longitude-105+540)%360)-180;
  return [centralLongitude*radians,-Math.log(Math.tan(Math.PI/4+latitude*radians/2))];
};
if(geometries.length!==89||topology.transform)throw Error('Expected the original 89-subject, unquantized puzzle topology.');
const rawArcs=topology.arcs.map(arc=>arc.map(project));
const bounds=[Infinity,Infinity,-Infinity,-Infinity];
for(const arc of rawArcs)for(const [x,y]of arc){bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}
const scale=Math.min((width-padding*2)/(bounds[2]-bounds[0]),(height-padding*2)/(bounds[3]-bounds[1]));
const translate=[(width-(bounds[2]-bounds[0])*scale)/2-bounds[0]*scale,(height-(bounds[3]-bounds[1])*scale)/2-bounds[1]*scale];
const projectedArcs=rawArcs.map(arc=>arc.map(([x,y])=>[x*scale+translate[0],y*scale+translate[1]]));
const squaredDistance=(point,a,b)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1];
  const t=dx||dy?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy))):0;
  return (point[0]-a[0]-t*dx)**2+(point[1]-a[1]-t*dy)**2;
};
const simplify=points=>{
  if(points.length<=2)return points;
  const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
  const stack=[[0,points.length-1]];
  while(stack.length){
    const [start,end]=stack.pop();let max=tolerance*tolerance,index=-1;
    for(let i=start+1;i<end;i++){const d=squaredDistance(points[i],points[start],points[end]);if(d>max){max=d;index=i;}}
    if(index!==-1){keep[index]=1;if(index-start>1)stack.push([start,index]);if(end-index>1)stack.push([index,end]);}
  }
  return points.filter((_,index)=>keep[index]);
};
const arcs=projectedArcs.map(simplify);
const ring=(references,sourceArcs=arcs)=>references.flatMap((reference,index)=>{
  const arc=sourceArcs[reference<0?~reference:reference];
  const points=reference<0?[...arc].reverse():arc;
  return index?points.slice(1):points;
});
const rounded=value=>Number(value.toFixed(2));
const area=points=>Math.abs(points.reduce((sum,point,index)=>{const next=points[(index+1)%points.length];return sum+point[0]*next[1]-next[0]*point[1];},0)/2);
const centroid=points=>{
  let weightedX=0,weightedY=0,areaSum=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],cross=a[0]*b[1]-b[0]*a[1];
    areaSum+=cross;weightedX+=(a[0]+b[0])*cross;weightedY+=(a[1]+b[1])*cross;
  }
  return Math.abs(areaSum)>1e-8?[weightedX/(3*areaSum),weightedY/(3*areaSum)]:points[0];
};
let vertices=0;
const features=geometries.map(geometry=>{
  const polygons=geometry.type==='Polygon'?[geometry.arcs]:geometry.arcs;
  let largest=[],largestArea=-1;
  const featureBounds=[Infinity,Infinity,-Infinity,-Infinity];
  const paths=[];
  for(const polygon of polygons)for(let index=0;index<polygon.length;index++){
    const references=polygon[index];let points=ring(references);
    // Keep tiny complete islands and narrow municipalities when simplification
    // would collapse a ring; a subject must never lose its only visible polygon.
    if(new Set(points.map(([x,y])=>`${rounded(x)},${rounded(y)}`)).size<3)points=ring(references,projectedArcs);
    if(points.length<3)continue;
    for(const [x,y]of points){featureBounds[0]=Math.min(featureBounds[0],x);featureBounds[1]=Math.min(featureBounds[1],y);featureBounds[2]=Math.max(featureBounds[2],x);featureBounds[3]=Math.max(featureBounds[3],y);}
    const ringArea=area(points);if(index===0&&ringArea>largestArea){largestArea=ringArea;largest=points;}
    vertices+=points.length;
    paths.push('M'+points.map(point=>point.map(rounded).join(',')).join('L')+'Z');
  }
  if(!largest.length)throw Error(`No usable polygon for ${geometry.id}`);
  const properties=geometry.properties;
  return {mapId:String(geometry.id),name:properties.name_ru||properties.name,name_en:properties.name_en||properties['name:en']||properties.name,name_zh:properties.name_zh||properties.name,
    d:paths.join(''),bounds:featureBounds.map(rounded),anchor:centroid(largest).map(rounded),city:['102269','337422','3788485'].includes(String(geometry.id))};
});
const output={schema:'rudn-career-region-map',schemaVersion:1,width,height,
  source:{path:'site/assets/puzzle/data/russia_subjects_89.topojson',sha256:createHash('sha256').update(source).digest('hex'),dataset:'russia-subjects-89-v1',projection:'Mercator; central meridian 105° E; identical to the geographical puzzle',sourceVertices:topology.arcs.reduce((sum,arc)=>sum+arc.length,0),svgVertices:vertices,simplificationToleranceSvgUnits:tolerance,precisionSvgUnits:.01,method:'Project and simplify shared arcs once; reconnect original polygon rings; SVG even-odd fill. Names and feature identifiers retained.'},features};
const serialized=JSON.stringify(output)+'\n';
if(process.argv.includes('--check')){
  if(await readFile(targetURL,'utf8')!==serialized)throw Error('Career region map differs from its source; rebuild it.');
  console.log(`Career region map verified: ${features.length} subjects, ${vertices} SVG vertices.`);
}else{
  await writeFile(targetURL,serialized);
  console.log(`Career region map created: ${features.length} subjects, ${vertices} SVG vertices, ${Buffer.byteLength(serialized)} bytes.`);
}
