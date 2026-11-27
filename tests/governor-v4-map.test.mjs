import test from 'node:test';
import assert from 'node:assert/strict';
import '../site/apps/governor/src/v4-map.js';

const map = globalThis.GovernorGame.V4Map;

test('camera keeps the illustration point under the zoom origin', () => {
  const bounds = {viewW:320,viewH:360,worldW:540,worldH:360};
  const camera = {x:.5,y:.5,zoom:1};
  const screen = {x:118,y:146};
  const world = map.anchorAt(screen,camera,bounds);
  const next = map.cameraAt(world,screen,2.6,bounds);
  const actual = map.anchorAt(screen,next,bounds);
  assert.ok(Math.abs(actual.x-world.x) < 1e-10);
  assert.ok(Math.abs(actual.y-world.y) < 1e-10);
  assert.equal(map.cameraAt(world,screen,10,bounds).zoom,4);
});

test('camera centers smaller art and clamps panning at image edges', () => {
  const bounds = {viewW:390,viewH:490,worldW:390,worldH:260};
  assert.deepEqual(map.transform({x:.5,y:.5,zoom:1},bounds),{left:0,top:115,width:390,height:260});
  const left = map.transform({x:0,y:0,zoom:3},bounds);
  assert.equal(left.left,0);
  assert.equal(left.top,0);
  const right = map.transform({x:1,y:1,zoom:3},bounds);
  assert.equal(right.left+right.width,bounds.viewW);
  assert.equal(right.top+right.height,bounds.viewH);
});

test('the school bridge shares road geometry with traffic and omits cars while closed', () => {
  const projectPoint = id => id==='b'?{x:.49,y:.52}:{x:.72,y:.41};
  const roads = [{id:'bridge-crossing',from:'b',to:'e'}];
  const open = map.schoolRoads({roads,projectPoint});
  const closed = map.schoolRoads({roads,projectPoint,closedRoads:['bridge-crossing']});
  assert.deepEqual(open[0].points,closed[0].points);
  assert.deepEqual(open[0].points[0],[.49,.52]);
  assert.deepEqual(open[0].points.at(-1),[.72,.41]);
  assert.match(map.render({routes:open}),/data-v4-car/);
  assert.match(map.render({routes:closed}),/data-v4-closed/);
  assert.doesNotMatch(map.render({routes:closed}),/data-v4-car/);
});

test('placement and inspection expose labelled buttons at the authored locations', () => {
  const pin = {id:'district-centre',kind:'site',label:'<Изучить участок>',marker:'B',
    ...map.sitePoint('north','district-centre',{x:.4,y:.2})};
  const html = map.render({district:'north',pins:[pin]});
  assert.match(html,/data-v3-site="district-centre"/);
  assert.match(html,/aria-label="&lt;Изучить участок&gt;"/);
  assert.match(html,/--map-x:0\.754;--map-y:0\.471/);
  assert.deepEqual(map.sitePoint('north','future-custom-site',{x:.38,y:.67}),{x:.38,y:.67});
});

test('the historical panel gives a static view and leaves the plan untouched', () => {
  const html = map.render({historical:true,routes:map.ambientRoads('north'),pins:[
    {id:'one',kind:'site',label:'Proposed site'},
    {id:'two',kind:'object',label:'Historical object'},
    {id:'three',kind:'district',label:'Northern district'}
  ],buildings:[{id:'four',src:'school.webp',animation:{src:'work.gif'}}]});
  assert.doesNotMatch(html,/data-v3-object|data-v3-site|data-v4-gif-src|data-v4-car/);
  assert.match(html,/Historical object/);
  assert.match(html,/school\.webp/);
  assert.match(html,/data-v3-district="three"/);
});

test('construction supplies a real lazy GIF and a separate static structure', () => {
  const html = map.render({buildings:[{id:'school',src:'school.webp',
    animation:{src:'assets/v4/motion/work-foundation.gif',width:.5,height:.4}}]});
  assert.match(html,/<img class="v4-map-structure" src="school.webp"/);
  assert.match(html,/<img data-v4-gif-src="assets\/v4\/motion\/work-foundation\.gif"/);
  assert.doesNotMatch(html,/<img src="[^"]+\.gif"/);
});
