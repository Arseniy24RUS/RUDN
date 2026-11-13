import test from 'node:test';
import assert from 'node:assert/strict';
import {caseTimelineView,workbookSummaryView,workbookFeedbackView} from '../site/apps/reception/ai/workbook.js';

const deadline={id:'deadline',label:{ru:'Подать возражения до',en:'File objections by'}};
const referral={id:'referral',label:{ru:'Передача по компетенции',en:'Refer by'}};
const decision={deadline:'2026-05-18',workbook:{referralDeadline:'2026-05-11',registrationTimely:true}};
const special={version:2,special:true,targets:[deadline],registrationCheck:false,liabilityApplicable:false,
  instructions:{ru:'Отсчёт начинается на следующий день.\nСчитайте 10 рабочих дней.',en:'Count 10 working days.'},
  expected:{deadline:'2026-05-19'},selected:{deadline:'2026-05-18'},correct:{deadline:false},wrongDates:true};
const withCalendar=calendar=>({workbook:{calendar}});

test('timeline displays all actual events and places the standard dates first',()=>{
  const events=[
    {id:'served',kind:'event',label:{ru:'Вручено <судом>',en:'Served by court'},date:'2026-05-08'},
    {id:'registered',kind:'registered',date:'2026-05-05'},
    {id:'sent',date:'2026-05-03'},
    {id:'received',date:'2026-05-04'},
    {id:'reported',kind:'event',label:{ru:'Сообщено',en:'Reported'},date:'2026-05-06'}
  ];
  const html=caseTimelineView({events},{locale:'en'});
  assert.deepEqual([...html.matchAll(/<dt>(.*?)<\/dt>/g)].map(match=>match[1]),['Sent','Received','Registered','Served by court','Reported']);
  assert.match(html,/event-other"><dt>Served by court<\/dt><dd><time datetime="2026-05-08">08\.05\.2026/);
  assert.match(caseTimelineView({events}),/Вручено &lt;судом&gt;/);
});

test('decision summary shows only applicable dates and registration judgment',()=>{
  const single=workbookSummaryView(decision,{workbook:special});
  assert.match(single,/Подать возражения до<\/dt><dd>18\.05\.2026/);
  assert.doesNotMatch(single,/11\.05\.2026|Регистрация в течение/);
  const basic=workbookSummaryView(decision,{locale:'en',workbook:{version:2,targets:[referral,deadline],registrationCheck:true}});
  assert.match(basic,/Refer by<\/dt><dd>11\.05\.2026/);
  assert.match(basic,/File objections by<\/dt><dd>18\.05\.2026/);
  assert.match(basic,/Registered within 3 days<\/dt><dd>Yes/);
});

test('special feedback uses its deadline label and rule, without unrelated penalty or blank rows',()=>{
  const html=workbookFeedbackView(withCalendar(special),{training:true});
  assert.match(html,/Подать возражения до · Нужно исправить/);
  assert.match(html,/Ваш ответ: 18\.05\.2026<br>Правильный ответ: <strong>19\.05\.2026/);
  assert.match(html,/Отсчёт начинается на следующий день\.\nСчитайте 10 рабочих дней\./);
  assert.doesNotMatch(html,/data-deadline-liability|Регистрация в течение|Предельный срок передачи|Срок передачи — 7/);
  assert.equal((html.match(/class="rxa-workbook-check /g)||[]).length,1);
});

test('article 5.59 warning appears only for relevant wrong dates in training, with v1 results supported',()=>{
  const legacy={expected:{referral:'2026-05-07',deadline:'2026-05-30',registrationTimely:true},
    selected:{referral:'2026-05-08',deadline:'2026-05-30',registrationTimely:true},
    correct:{referral:false,deadline:true,registrationTimely:true},wrongDates:true};
  const old=workbookFeedbackView(withCalendar(legacy),{training:true});
  assert.match(old,/Срок передачи — 7/);
  assert.match(old,/data-deadline-liability/);
  const v2={...legacy,version:2,targets:[referral,deadline],registrationCheck:true,liabilityApplicable:true};
  assert.match(workbookFeedbackView(withCalendar(v2),{training:true}),/data-deadline-liability/);
  assert.doesNotMatch(workbookFeedbackView(withCalendar(v2)),/data-deadline-liability/);
  assert.doesNotMatch(workbookFeedbackView(withCalendar({...v2,wrongDates:false}),{training:true}),/data-deadline-liability/);
  assert.doesNotMatch(workbookFeedbackView(withCalendar({...v2,liabilityApplicable:undefined}),{training:true}),/data-deadline-liability/);
  assert.doesNotMatch(workbookFeedbackView(withCalendar(v2),{training:true}),/Срок передачи — 7/);
});
