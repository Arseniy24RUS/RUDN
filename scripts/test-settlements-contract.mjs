import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomRegion,resultMetrics} from '../site/apps/settlements/entry.mjs';
import {COPY,normalizeLocale,regionName,durationText} from '../site/apps/settlements/copy.mjs';
import {settlementsPoints} from '../site/assets/js/settlements-leaderboard.js';

const root=new URL('../site/apps/settlements/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('runtime/data/settlements/v1/manifest.json',root)));
const catalog=manifest.regions;
const random=(...values)=>({getRandomValues(array){assert.ok(values.length,'Random generator consumed unexpectedly');array[0]=values.shift();return array;}});
test('all 82 territories are reachable; immediately previous territory cannot be drawn',()=>{
  assert.equal(catalog.length,82);assert.equal(new Set(catalog.map(r=>r.id)).size,82);
  for(const previous of catalog){const remaining=catalog.filter(r=>r.id!==previous.id);
    assert.deepEqual(remaining.map((_,i)=>randomRegion(catalog,previous.id,random(i))),remaining.map(r=>r.id));
  }
  assert.equal(randomRegion(catalog,null,random(0xffffffff,0)),catalog[0].id,'Reject biased remainder of uint32 range');
});
const coverage=(covered,total=10000,people=1000,population=1000)=>({services:Object.fromEntries(['telecom','medical','school','culture'].map((s,i)=>[s,{covered:Array.isArray(covered)?covered[i]:covered,total,people,population,servedUnits:400,demandUnits:500}]))});
test('unrounded settlement threshold drives score; population coverage remains distinct',()=>{
  const save={actions:[{type:'tower'}]};
  for(const [n,expected] of [[8999,0],[9000,5],[10000,5]]){
    const result=resultMetrics(coverage(n),save,'budget_exhausted',1234);
    assert.equal(result.coverageNp,n/100);assert.equal(result.coveragePopulation,100);
    assert.equal(settlementsPoints('hard',result.coverageNp,true,'assessment'),expected);
    assert.equal(settlementsPoints('hard',result.coverageNp,false,'assessment'),0,'High initial coverage is not a completed game');
    assert.equal(settlementsPoints('hard',result.coverageNp,true,'free'),0);
  }
  const mixed=resultMetrics(coverage([8000,9000,10000,9000],10000,700,1000),{actions:[]},'budget_exhausted',0);
  assert.equal(mixed.coverageNp,90);assert.equal(mixed.coveragePopulation,70,'Population weighting uses residents, not service capacity units');assert.equal(mixed.turns,0,'Undone actions are not moves');
});
test('outer interface has matching language coverage and translated combined territories',()=>{
  for(const language of ['ru','en','zh']){
    assert.deepEqual(Object.keys(COPY[language]).sort(),Object.keys(COPY.ru).sort());
    for(const region of catalog)assert.ok(regionName(region,language));
    assert.equal(COPY[language].version.includes('1.0'),true);
  }
  assert.equal(normalizeLocale('zh-Hans'),'zh');
  assert.equal(regionName({id:'moskovskaya_oblast'},'en'),'Moscow Oblast and Moscow');
  assert.equal(regionName({id:'leningradskaya_oblast'},'en'),'Leningrad Oblast and Saint Petersburg');
  assert.equal(durationText(3661000),'01:01:01');
});
