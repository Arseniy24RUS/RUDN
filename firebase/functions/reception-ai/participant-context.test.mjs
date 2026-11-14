import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildParticipantContext} from './participant-context.mjs';
import {instantiateCase} from '../../../site/apps/reception/js/cases.js';
const T = ru => ({ru, en: `EN ${ru}`, zh: `ZH ${ru}`});
const fixture = () => ({id:'staff-case', public:{title:'SECRET_TITLE',role:{text:'SECRET_LEARNER_ROLE'},assessment:{calendar:{events:[
  {id:'sent',label:T('Отправлено'),date:'2026-11-01'},
  {id:'received',label:T('Получено'),date:'2026-11-02'},
  {id:'registered',label:T('Зарегистрировано'),date:'2026-11-03'},
  {id:'response',label:'SECRET_RESPONSE',date:'2026-12-01'},
  {id:'deadline',label:'SECRET_DEADLINE',date:'2026-12-02'}
]}}},rubric:{deadline:'SECRET_RUBRIC'},followup:{correct:'SECRET_FOLLOWUP'},provenance:{dateValues:{receivedISO:'1999-01-01'}}});
test('copies only current appeal dates and labels without modifying source or leaking evaluator context',()=>{
  const c=fixture(),before=structuredClone(c),result=buildParticipantContext(c,'en');
  assert.deepEqual(result,{currentAppeal:{scope:'current_appeal',events:c.public.assessment.calendar.events.slice(0,3).map(e=>({id:e.id,label:e.label.en,date:e.date}))}});
  assert.deepEqual(c,before);
  assert.doesNotMatch(JSON.stringify(result),/SECRET|1999|\bI\b|\bmy\b/);
  result.currentAppeal.events[0].date='2000-01-01';
  assert.deepEqual(c,before);
});
test('unknown and absent chronology is never guessed from other fields',()=>{
  assert.deepEqual(buildParticipantContext({public:{date:'2026-11-01'},provenance:{dateValues:{sentISO:'2026-11-01'}}}),{currentAppeal:{scope:'current_appeal',events:[]}});
  const c=fixture();c.public.assessment.calendar.events=[{id:'sent',label:'Unknown',date:'2026-02-30'},{id:'registered',date:'2026-11-01'},{id:'application',label:'Original',date:'2026-10-01'}];
  assert.deepEqual(buildParticipantContext(c).currentAppeal.events,[]);
});
test('background is narrowly authored, localized, optional and independent from legal facts',()=>{
  for(const locale of ['ru','en','zh']){
    const c=fixture();c.id='mfc-second-demand';
    const b=buildParticipantContext(c,locale).conversationalBackground;
    assert.equal(b.optional,true);assert.equal(b.evidentiary,false);
    assert.ok(b.service.length);assert.ok(b.currentComplaint.length);assert.ok(b.limits.length);
  }
  for(const id of ['staff-case','mfc-second-demand-copy','mfc-other'])assert.equal(buildParticipantContext({...fixture(),id}).conversationalBackground,undefined);
  assert.match(buildParticipantContext({...fixture(),id:'mfc-second-demand'}).conversationalBackground.service,/ЕГРН/);
});
test('real authored date variants preserve frozen known chronology exactly',async()=>{
  const payload=JSON.parse(await readFile(new URL('../../../site/apps/reception/content/cases/mfc-second-demand.json',import.meta.url),'utf8'));
  for(const pack of payload.template.datePacks){
    const t=instantiateCase(payload.template,pack.id);
    const c={id:'mfc-second-demand',public:{assessment:{calendar:{events:t.calendar.events}}}};
    const before=JSON.stringify(c);
    assert.deepEqual(buildParticipantContext(c).currentAppeal.events,t.calendar.events.filter(e=>['sent','received','registered'].includes(e.id)).map(({id,label,date})=>({id,label,date})));
    assert.equal(JSON.stringify(c),before);
  }
});
