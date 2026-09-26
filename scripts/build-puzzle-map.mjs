#!/usr/bin/env node
/** Rebuild the compact Russia map fallback without simplifying any geometry. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

const root=new URL('../',import.meta.url);
const sourcePath=new URL('site/assets/puzzle/data/russia_subjects_89.topojson',root);
const outputPath=new URL('site/assets/puzzle/data/russia_subjects_89.compact.json',root);
const metaPath=new URL('site/assets/puzzle/data/russia_subjects_89.compact.meta.json',root);
const check=process.argv.includes('--check');
assert(process.argv.slice(2).every(arg=>arg==='--check'),'Usage: node scripts/build-puzzle-map.mjs [--check]');
const GRID=10_000_000,SCALE=1/GRID;
const sha256=value=>createHash('sha256').update(value).digest('hex');
const sourceBytes=await readFile(sourcePath);
const source=JSON.parse(sourceBytes);
assert.equal(source.type,'Topology');
assert.equal(source.transform,undefined,'Input must contain absolute, unquantized coordinates');
assert(Array.isArray(source.arcs)&&source.arcs.length,'Input arcs are required');
const objects=Object.values(source.objects||{});
assert.equal(objects.length,1,'Expected one source geometry collection');
assert.equal(objects[0].type,'GeometryCollection');
assert.equal(objects[0].geometries?.length,89,'The graded map must retain all 89 subjects');
for(const geometry of objects[0].geometries){
  assert(['Polygon','MultiPolygon'].includes(geometry.type),'Only polygon geometries are supported');
}
let vertices=0,maxCoordinateError=0,maxPositionError=0;
const arcs=source.arcs.map((arc,arcIndex)=>{
  assert(Array.isArray(arc)&&arc.length>0,`Empty arc ${arcIndex}`);
  let lastX=0,lastY=0;
  return arc.map((point,pointIndex)=>{
    assert(Array.isArray(point)&&point.length===2&&point.every(Number.isFinite),`Invalid point ${arcIndex}:${pointIndex}`);
    const x=Math.round(point[0]*GRID),y=Math.round(point[1]*GRID);
    assert(Number.isSafeInteger(x)&&Number.isSafeInteger(y),'Quantized coordinate exceeds integer precision');
    // Keep every point, including repeated points and zero-length deltas.
    const delta=[x-lastX,y-lastY];lastX=x;lastY=y;vertices++;
    // Match TopoJSON-client reconstruction: integer accumulation, then multiply.
    const dx=Math.abs(x*SCALE-point[0]),dy=Math.abs(y*SCALE-point[1]);
    maxCoordinateError=Math.max(maxCoordinateError,dx,dy);
    maxPositionError=Math.max(maxPositionError,Math.hypot(dx,dy));
    // This source is already on the grid. Permit representation noise only;
    // a future source with more precision requires an explicit encoding change.
    assert(dx<=1e-12&&dy<=1e-12,'Source coordinate is not on the 1e-7-degree grid');
    return delta;
  });
});
const compact={...source,arcs,transform:{scale:[SCALE,SCALE],translate:[0,0]}};
assert.deepEqual(compact.objects,source.objects,'Properties, IDs and polygon references must remain unchanged');
assert.deepEqual(compact.bbox,source.bbox,'Original bounds must remain unchanged');
// Independently decode every generated arc and verify vertex counts/order.
for(let i=0;i<arcs.length;i++){
  assert.equal(arcs[i].length,source.arcs[i].length);
  let x=0,y=0;
  for(let j=0;j<arcs[i].length;j++){
    x+=arcs[i][j][0];y+=arcs[i][j][1];
    assert(Math.abs(x*SCALE-source.arcs[i][j][0])<=1e-12);
    assert(Math.abs(y*SCALE-source.arcs[i][j][1])<=1e-12);
  }
}
const json=JSON.stringify(compact);
const outputBytes=Buffer.from(json+'\n');
const metadata={
  format:'TopoJSON',source:'russia_subjects_89.topojson',output:'russia_subjects_89.compact.json',
  sourceSha256:sha256(sourceBytes),outputSha256:sha256(outputBytes),
  sourceBytes:sourceBytes.length,outputBytes:outputBytes.length,
  gzipSourceBytes:gzipSync(sourceBytes).length,gzipOutputBytes:gzipSync(outputBytes).length,
  subjects:89,arcs:arcs.length,vertices,
  quantization:{scale:[SCALE,SCALE],translate:[0,0],maxCoordinateErrorDegrees:maxCoordinateError,
    maxPositionErrorDegrees:maxPositionError,
    conservativePositionErrorMetres:maxPositionError*111_700,
    maximumAllowedCoordinateErrorDegrees:1e-12,
    maximumAllowedPositionErrorMetres:Math.SQRT2*1e-12*111_700},
  preserves:['all vertices and their order','arc and ring references','feature IDs','properties','original bbox'],
  simplification:false,
};
const metadataBytes=JSON.stringify(metadata,null,2)+'\n';
if(check){
  assert.equal(await readFile(outputPath,'utf8'),outputBytes.toString(),'Compact map is stale; rerun builder');
  assert.equal(await readFile(metaPath,'utf8'),metadataBytes,'Map metadata is stale; rerun builder');
}else{
  await writeFile(outputPath,outputBytes);
  await writeFile(metaPath,metadataBytes);
}
console.log(JSON.stringify({check,...metadata,
  output:fileURLToPath(outputPath)},null,2));
