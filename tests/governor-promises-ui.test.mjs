import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {G, fresh} from './helpers/governor-gameplay.mjs';

const context = {GovernorGame:{...G, icon:()=>''}, Intl};
context.window=context;
vm.createContext(context);
for(const file of ['src/i18n.js','locales/zh-Hans.js','src/governance-ui.js']){
  vm.runInContext(await readFile(new URL('../site/apps/governor/'+file,import.meta.url),'utf8'),context);
}
const ui=context.GovernorGame.GovernanceUI;
const scene='rural-healthcare';
const state=fresh();
state.turnIndex=1;
state.governance.agreements.push({sceneId:scene,turn:1,positions:[],status:'agreed'});
state.history.push({missionId:scene,funding:{totalCost:2,actualTotalCost:2.6},delivery:{id:'overrun'}});
function promise(id,kind,actorId){
  return {id:scene+':'+id,kind,actorId,status:'pending',dueTurn:4,createdTurn:1,revisions:[]};
}
const launch=promise('firm-date','launch','municipality');
const report=promise('public-report','report','residents');
state.governance.promises.push(launch,report);

test('Chinese summaries use catalogued prose, resolved promise events and counters',()=>{
  const html=ui.recordSummary({agreement:{termIds:[]},promiseEvents:[{type:'late-delivery',promiseId:launch.id}]},'zh');
  assert.match(html,/条件已写入会议记录/);
  assert.match(html,/项目逾期投用/);
  assert.doesNotMatch(html,/The terms|delivered late|Слово/);
  const summary=ui.summaryHtml(state,'zh');
  assert.match(summary,/尚待核查：2/);
  assert.doesNotMatch(summary,/What your word|Late delivery|Остаётся/);
  assert.match(ui.summaryHtml(state,'en'),/Still pending: 2/);
});

test('a deadline can only open the factual report for that eligible promise',()=>{
  const dialog={innerHTML:'',open:false,showModal(){this.open=true;},querySelector:()=>({}),querySelectorAll:()=>[]};
  context.document={getElementById:()=>dialog,activeElement:null};
  ui.init({getState:()=>state,getLanguage:()=>'zh'});
  ui.openPromises(launch.id);
  assert.doesNotMatch(dialog.innerHTML,/data-publish-promise=/);
  assert.match(dialog.innerHTML,/data-inspect-report="rural-healthcare:public-report"/);
  ui.openPromises(report.id);
  assert.match(dialog.innerHTML,/data-publish-promise="rural-healthcare:public-report"/);
  assert.doesNotMatch(dialog.innerHTML,/>Factual report<|>Publish these facts<|>Фактический отчёт</);
  state.awaitingContinue=true;
  try{ui.openPromises(report.id);assert.doesNotMatch(dialog.innerHTML,/data-publish-promise=/);}
  finally{state.awaitingContinue=false;}
});
