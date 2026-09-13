import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {compactReport} from '../site/apps/governor/platform-contract.js';
import {prepareGovernorReportLocale,governorReportValue,governorReceiptState} from '../site/assets/js/governor-report-locale.js';

test('saved report display translates authored values without rewriting historical records',async()=>{
  await prepareGovernorReportLocale();
  const catalog=globalThis.GovernorGame.ChineseCatalog;
  const row=catalog.find(entry=>entry.ru&&entry.en&&entry.zh&&!entry.ru.includes('{'));
  const legacy={title:{ru:row.ru,en:row.en},territory:row.ru,reflection:'Моя рефлексия 学生 Example',points:4.5};
  const before=structuredClone(legacy);
  for(const locale of ['ru','en','zh']){
    assert.equal(governorReportValue(legacy.title,locale),row[locale]);
    assert.equal(governorReportValue(legacy.territory,locale),row[locale]);
  }
  assert.deepEqual(legacy,before);
  assert.equal(governorReportValue('Неизвестный авторский текст','zh'),'Неизвестный авторский текст');
  assert.equal(governorReportValue(null,'zh'),'—');
});
test('IndexedDB receipt takes priority over missing legacy localStorage receipt',()=>{
  for(const state of ['pending','device-only'])assert.equal(governorReceiptState({state},false),'pending');
  assert.equal(governorReceiptState({state:'saved'},true),'submitted');
  assert.equal(governorReceiptState({state:'unsafe'},false),'unsafe');
  assert.equal(governorReceiptState({state:'conflict'},false),'conflict');
  assert.equal(governorReceiptState({state:'empty'},true),'pending');
  assert.equal(governorReceiptState({state:'empty'},false),'submitted');
  assert.equal(governorReceiptState(null,null),'saved');
});

test('complete legacy Russian campaign report has translated authored fields in EN and ZH',async()=>{
  await prepareGovernorReportLocale();
  const sandbox={console};sandbox.window=sandbox;vm.createContext(sandbox);
  for(const name of ['game-data','stage3-data','stage4-data','consolidation-data','agenda','project-state','population','recovery','budget-review','finance','governance-data','governance','stories-data','stories','world-outcomes','state-integrity','engine']){
    vm.runInContext(await readFile(new URL(`../site/apps/governor/src/${name}.js`,import.meta.url),'utf8'),sandbox);
  }
  const G=sandbox.GovernorGame,E=G.Engine,state=E.createState({name:'Synthetic report',scenarioId:'balanced',seed:'LEGACY-REPORT',language:'ru'});
  while(!state.completed){const mission=E.getCurrentMission(state);E.commitAction(state,mission.actions.find(item=>item.deferred).id,'treasury');E.advanceTurn(state);}
  const report=compactReport(state,G),before=JSON.stringify(report);
  const fields=[report.scenario,...report.territories.map(row=>row.name),...report.decisionRegister.flatMap(row=>[row.mission,row.action]),...report.assessment.criteria.flatMap(row=>[row.title,row.detail])];
  for(const locale of ['en','zh']){
    const missing=[...new Set(fields.map(value=>String(governorReportValue(value,locale))).filter(value=>/[А-Яа-яЁё]/.test(value)))];
    assert.deepEqual(missing,[],`Untranslated ${locale} authored report fields`);
  }
  assert.equal(JSON.stringify(report),before);
});
