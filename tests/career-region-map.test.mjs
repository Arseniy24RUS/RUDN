import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REGION_MAP_MAX_ZOOM,zoomMapAt,containMapView} from '../site/apps/career/assets/region-map-geometry.mjs';

const map=JSON.parse(await readFile(new URL('../site/apps/career/data/region-map.json',import.meta.url)));
const sourceBytes=await readFile(new URL('../site/assets/puzzle/data/russia_subjects_89.topojson',import.meta.url));
const source=JSON.parse(sourceBytes),geometries=source.objects.collection.geometries;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('the same 89 subjects, original fill rings, bounds and anchors survive the outline repair',()=>{
  assert.equal(map.features.length,89);
  assert.deepEqual(map.features.map(f=>f.mapId),geometries.map(g=>String(g.id)));
  assert.equal(map.source.sha256,createHash('sha256').update(sourceBytes).digest('hex'));
  for(const [index,feature]of map.features.entries()){
    const geometry=geometries[index],polygons=geometry.type==='Polygon'?[geometry.arcs]:geometry.arcs;
    assert.equal((feature.d.match(/M/g)||[]).length,polygons.reduce((sum,polygon)=>sum+polygon.length,0),feature.name+' retains every island and hole');
    assert.equal((feature.d.match(/Z/g)||[]).length,(feature.d.match(/M/g)||[]).length);
  }
  // Snapshot calculated from the published bbc7318 geometry BEFORE repairing
  // outlines. This deliberately protects every existing projected fill ring.
  const retained=map.features.map(({mapId,d,bounds,anchor,city})=>({mapId,d,bounds,anchor,city}));
  assert.equal(createHash('sha256').update(JSON.stringify(retained)).digest('hex'),'dd16f82c8b0554331c78fd4b3319c92f2be5afaddfc9df9298343a76bd59cebd');
});

test('only the antimeridian-cut Chukotka outline omits the 73 artificial closure edges',()=>{
  const repaired=map.features.filter(f=>f.outlineD);
  assert.deepEqual(repaired.map(f=>f.mapId),['151231']);
  const chukotka=repaired[0];
  assert.equal(chukotka.omittedAntimeridianCutEdges,73);
  assert.equal(map.source.omittedAntimeridianCutEdges,73);
  assert.ok(!chukotka.outlineD.includes('Z'),'Open outline fragments must not recreate cut closures');
  const project=([lon,lat])=>[(((lon-105+540)%360)-180)*Math.PI/180,-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(const arc of source.arcs)for(const coordinate of arc){const [x,y]=project(coordinate);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
  const scale=Math.min((map.width-36)/(xmax-xmin),(map.height-36)/(ymax-ymin));
  const seamX=Number(((180-105)*Math.PI/180*scale+(map.width-(xmax-xmin)*scale)/2-xmin*scale).toFixed(2));
  for(const run of chukotka.outlineD.split('M').filter(Boolean)){
    const points=run.split('L').map(pair=>pair.split(',').map(Number));
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      assert.ok(!(a[0]===seamX&&b[0]===seamX&&Math.abs(a[1]-b[1])>1),'No visible artificial segment along 180°');
    }
  }
});

test('wheel/pinch zoom preserves the map coordinate beneath its anchor and reaches 40×',()=>{
  const before={zoom:3,x:-250,y:-120},point={x:170,y:235};
  const next=zoomMapAt(before,18,point);
  close((point.x-before.x)/before.zoom,(point.x-next.x)/next.zoom);
  close((point.y-before.y)/before.zoom,(point.y-next.y)/next.zoom);
  assert.equal(zoomMapAt(next,100,point).zoom,40);
  assert.equal(REGION_MAP_MAX_ZOOM,40);
  assert.equal(zoomMapAt(next,.1,point).zoom,1);
});

test('panning keeps the canvas reachable and centres it in a letterboxed mobile viewport',()=>{
  const bounds={width:1000,height:560,left:0,right:1000,top:-220,bottom:780};
  assert.deepEqual(containMapView({zoom:1,x:100,y:-900},bounds),{zoom:1,x:0,y:0});
  assert.deepEqual(containMapView({zoom:4,x:500,y:-9000},bounds),{zoom:4,x:0,y:-1460});
  const view=containMapView({zoom:40,x:-4000,y:-20000},bounds);
  assert.ok(view.x<=0&&view.x+40000>=1000);
  assert.ok(view.y<=-220&&view.y+22400>=780);
});
