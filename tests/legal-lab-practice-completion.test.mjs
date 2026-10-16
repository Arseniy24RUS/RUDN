import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {gradeTask} from '../site/apps/legal-lab/lib/core.mjs';

// Execute the actual method, including its awaits, against an isolated synthetic
// set of 52 type questions. This is a race test, not browser/Firebase evidence.
const source=await readFile(process.env.LEGAL_ENTRY_UNDER_TEST||new URL('../site/apps/legal-lab/entry.mjs',import.meta.url),'utf8');
const start=source.indexOf('  async completePractice(){'),end=source.indexOf('\n  flush(){',start);
assert.ok(start>=0&&end>start);
const complete=vm.runInNewContext(`({${source.slice(start,end)}}).completePractice`,{gradeTask,structuredClone,Date});

function fixture(){
  const classroom=Array.from({length:52},(_,i)=>({id:'T'+i,kind:'type',answer:'Указ'}));
  const answers=Object.fromEntries(classroom.map(t=>[t.id,{type:'Указ',submitted:true}]));
  const deliveries=[];
  const app={opt:{onPracticeComplete:async receipt=>deliveries.push(structuredClone(receipt))},active:()=>true,bank:{classroom},state:{id:'state-synthetic-completion',answers},catalog:{contentVersion:'synthetic-test-version'},scans:[],corpus:{all:async()=>{},cache:new Map()},answer:t=>answers[t.id],persist:async()=>{}};
  return {app,answers,deliveries};
}

test('an answer edited while documents load must be checked again',async()=>{
  const {app,answers,deliveries}=fixture();
  let release;app.corpus.all=()=>new Promise(resolve=>{release=resolve;});
  const work=complete.call(app);
  answers.T51.submitted=false;
  release();await work;
  assert.equal(deliveries.length,0);
  assert.equal(app.state.practiceCompletion,undefined);
  answers.T51.submitted=true;
  app.corpus.all=async()=>{};
  await complete.call(app);
  assert.equal(deliveries.length,1);
  assert.equal(deliveries[0].points,52);
});

test('an earned receipt retries unchanged even after later answer edits',async()=>{
  const {app,answers,deliveries}=fixture();
  app.opt.onPracticeComplete=async receipt=>{deliveries.push(structuredClone(receipt));if(deliveries.length===1)throw Error('temporary network failure');};
  await complete.call(app);
  assert.equal(deliveries.length,1);
  assert.equal(app.state.practiceCompletion.delivered,undefined);
  answers.T0.submitted=false;answers.T0.type='Приказ';
  await complete.call(app);
  assert.equal(deliveries.length,2);
  assert.deepEqual(deliveries[1],deliveries[0]);
  assert.equal(app.state.practiceCompletion.delivered,true);
  await complete.call(app);
  assert.equal(deliveries.length,2);
});

test('concurrent completion calls hand off only one receipt',async()=>{
  const {app,deliveries}=fixture();
  let release;app.corpus.all=()=>new Promise(resolve=>{release=resolve;});
  const first=complete.call(app);await complete.call(app);
  release();await first;
  assert.equal(deliveries.length,1);
});
