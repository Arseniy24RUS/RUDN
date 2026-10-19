import test from 'node:test';
import assert from 'node:assert/strict';
import {FAILED_RELEASES_KEY,hasFailedRelease,recordFailedRelease} from '../site/assets/js/platform-update-failures.js';
const A='a'.repeat(32),B='b'.repeat(32);
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),values}};

test('failed release persists across fresh helper calls without blocking a new build',()=>{
  const storage=memory();assert.equal(hasFailedRelease(B,{storage}),false);
  assert.equal(recordFailedRelease({buildId:B,sourceBuild:A,code:'boot-failed'},{storage,now:()=>10}),true);
  assert.equal(hasFailedRelease(B,{storage}),true);assert.equal(hasFailedRelease('c'.repeat(32),{storage}),false);
  assert.equal(storage.values.size,1);
});
test('failure fence remains bounded and repeated failure does not create another key or entry',()=>{
  const storage=memory();
  for(let n=0;n<100;n++)assert.equal(recordFailedRelease({buildId:n.toString(16).padStart(32,'0'),sourceBuild:A},{storage,now:()=>n}),true);
  recordFailedRelease({buildId:'63'.padStart(32,'0'),sourceBuild:A},{storage,now:()=>101});
  const raw=storage.getItem(FAILED_RELEASES_KEY);assert.equal(JSON.parse(raw).entries.length,32);assert.equal(storage.values.size,1);assert.ok(raw.length<16384);
});
test('unavailable or damaged failure storage defers automatic switching',()=>{
  for(const storage of [null,{getItem(){throw Error('denied')}},{getItem:()=>''},{getItem:()=>'{broken'},{getItem:()=>JSON.stringify({schema:1,entries:[{buildId:B}]})}]){
    assert.equal(hasFailedRelease(B,{storage}),true);assert.equal(recordFailedRelease({buildId:B,sourceBuild:A},{storage}),false);
  }
});
test('failed writes and lost readback are not certified durable',()=>{
  for(const storage of [{getItem:()=>null,setItem(){throw Error('quota')}},{getItem:()=>null,setItem(){}}])assert.equal(recordFailedRelease({buildId:B,sourceBuild:A},{storage}),false);
});
test('only exact build identities, a timestamp and fixed technical codes are persisted',()=>{
  const storage=memory();
  for(const entry of [{buildId:'student name',sourceBuild:A},{buildId:B,sourceBuild:'input'},{buildId:B,sourceBuild:A,code:'arbitrary exception message'}])assert.equal(recordFailedRelease(entry,{storage}),false);
  assert.equal(storage.values.size,0);
});
