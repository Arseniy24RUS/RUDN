import test from 'node:test';
import assert from 'node:assert/strict';
import {PERSONALITY_RADAR_ORDER,personalityRadarGeometry,renderPersonalityRadar,personalityIcon} from '../site/apps/career/assets/personality-visuals.mjs';

const domains=(mean=3,overrides={})=>Object.fromEntries(PERSONALITY_RADAR_ORDER.map(id=>[id,{mean:overrides[id]??mean}]));
const distance=vertex=>Math.hypot(vertex.x-160,vertex.y-145);
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} should equal ${expected}`);

test('all five scales share the same 1–5 geometry, including the minimum and maximum',()=>{
  for(const mean of [1,2,3,4,5]){
    const vertices=personalityRadarGeometry(domains(mean));
    assert.deepEqual(vertices.map(vertex=>vertex.id),['C','E','A','O','N']);
    for(const vertex of vertices)close(distance(vertex),(mean-1)/4*94);
  }
});

test('emotional sensitivity retains its direction and scores are not normalised against other traits',()=>{
  const low=personalityRadarGeometry(domains(4,{N:1}));
  const high=personalityRadarGeometry(domains(4,{N:5}));
  assert.equal(distance(low.at(-1)),0);
  close(distance(high.at(-1)),94);
  assert.deepEqual(low.slice(0,4),high.slice(0,4));
  const varied=personalityRadarGeometry(domains(1,{C:4.125,E:2.5,A:5,O:3,N:2.25}));
  assert.equal(varied[0].value,4.125);
  close(distance(varied[0]),(4.125-1)/4*94);
});

test('missing, out-of-range and nonnumeric values cannot appear as plausible results',()=>{
  for(const mean of [0,6,NaN,Infinity,'3',null]){
    const invalid=domains();invalid.N.mean=mean;
    assert.throws(()=>personalityRadarGeometry(invalid),RangeError);
  }
  const missing=domains();delete missing.A;
  assert.throws(()=>personalityRadarGeometry(missing),RangeError);
});

test('chart exposes the same values as localised HTML text and escapes display content',()=>{
  const sample=domains(3,{C:4.125,N:1.5});
  for(const locale of ['ru','en','zh-CN']){
    const formatValue=value=>value.toLocaleString(locale,{minimumFractionDigits:1,maximumFractionDigits:2});
    const html=renderPersonalityRadar(sample,{
      labels:{C:'C & <script>',E:'Extraversion',A:'宜人性',O:'Открытость',N:'Emotional sensitivity'},
      title:'Profile <title>',description:'Five traits',scale:'1 centre, 5 outer ring',caption:'Answers',formatValue
    });
    assert.ok(html.includes('role="img" aria-labelledby="personality-radar-title personality-radar-desc"'));
    assert.ok(html.includes(`Emotional sensitivity: ${formatValue(1.5)} / 5`));
    assert.ok(html.includes(`<dd>${formatValue(4.125)}<small> / 5</small></dd>`));
    assert.ok(html.includes('C &amp; &lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.equal((html.match(/data-personality-radar-domain=/g)||[]).length,5);
    assert.ok(!html.includes('data-personality-score='),'Existing score selectors keep their original contract.');
  }
});

test('decorative icons do not introduce focus targets or duplicate spoken labels',()=>{
  for(const name of [...PERSONALITY_RADAR_ORDER,'E3','C3','C4','C5','C6','A4','coordinator','organizer','analyst','supporter','ideas','implementer']){
    const icon=personalityIcon(name);
    assert.ok(icon.includes('aria-hidden="true"'));
    assert.ok(icon.includes('focusable="false"'));
    assert.ok(!icon.includes('<title>'));
  }
});
