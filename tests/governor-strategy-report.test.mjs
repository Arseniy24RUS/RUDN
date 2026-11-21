import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../site/assets/js/main.js',import.meta.url),'utf8');
const numberAndTable=source.slice(source.indexOf('function governorNumber('),source.indexOf('function governorReportText('));
const strategyAndCards=source.slice(source.indexOf('function governorStrategyDetails('),source.indexOf('async function renderSeminar7('));
const escape=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
function renderer(locale){
  const sandbox=vm.createContext({Intl,getLocale:()=>locale,esc:escape,governorCopy:()=>({noRows:'—',score:'Score',submitted:'Saved',details:'Report'}),
    governorAssessmentDetails:()=>'',governorReportText:value=>typeof value==='string'?value:'',governorSaveLabel:()=>'',formatDate:()=>''});
  vm.runInContext(`${numberAndTable}\n${strategyAndCards}\nglobalThis.api={details:governorStrategyDetails,cards:governorReportCards};`,sandbox);
  return sandbox.api;
}
function strategy(courseId='services',keys=['healthFloor','suburbSchool']){
  return {version:1,courseId,reviews:[5,10,15,20].map((year,index)=>({year,status:['at-risk','conditional','secured','secured'][index],progress:.8,support:40+index,sustainable:index>0,capacityDelta:index>1?1:0,
    goals:keys.map(key=>({key,initial:.4,value:.5,target:.6,progress:.5,met:false}))}))};
}

test('Governor native reports show the four saved reviews for both student and instructor without changing the grade',()=>{
  const attempt={id:'campaign-synthetic',studentKey:'synthetic',type:'governor-simulator',points:4.13,recordGrade:true,createdAt:'2026-01-01',governor:{campaignStatus:'completed',decisions:20,assessment:{version:'governor-outcomes-v2',points:4.13},campaignStrategy:strategy()}};
  const before=structuredClone(attempt),render=renderer('en');
  for(const teacher of [false,true]){
    const html=render.cards([attempt],{teacher});
    assert.match(html,/Strategic course and reviews: Services close to home/);
    assert.equal((html.match(/scope="row"/g)||[]).length,4);
    assert.match(html,/50% \/ 60%/);assert.match(html,/Mandate at risk/);assert.match(html,/Mandate secured/);
    assert.match(html,/Model fiscal conditions/);assert.match(html,/>Not met</);assert.match(html,/>Met</);
    assert.match(html,/Score: 4\.13\/5/);
  }
  assert.deepEqual(attempt,before);
});

test('Governor course and seven goal labels are available in Russian, English and Chinese',()=>{
  const courses={services:['healthFloor','suburbSchool'],opportunity:['employment','childcare'],connected:['mobility','digital'],generations:['care','childcare']};
  const titles={ru:['Услуги рядом','Работа и возможности','Связанный регион','Забота о поколениях'],en:['Services close to home','Work and opportunity','A connected region','Care across generations'],zh:['就近公共服务','就业与机会','互联地区','代际关怀']};
  for(const locale of ['ru','en','zh'])for(const [index,[courseId,keys]]of Object.entries(courses).entries()){
    const html=renderer(locale).details({campaignStrategy:strategy(courseId,keys)});
    assert.ok(html.includes(titles[locale][index]));assert.match(html,/50% \/ 60%/);
    assert.equal(html.includes('undefined'),false);assert.equal(html.includes('Indicator:'),false);assert.equal(html.includes('Показатель:'),false);assert.equal(html.includes('指标:'),false);
    for(const key of keys)assert.equal(html.includes('>'+key+':'),false,'raw metric identifiers must not replace localised labels');
  }
});

test('Governor old reports are unchanged and untrusted strategy fields cannot inject markup',()=>{
  const render=renderer('ru');assert.equal(render.details({}), '');assert.equal(render.details({campaignStrategy:null}), '');assert.equal(render.details({campaignStrategy:{version:2}}), '');
  const data=strategy('<img src=x onerror=alert(1)>',['<script>attack</script>','healthFloor']);
  data.reviews[0].status='<script>attack</script>';data.reviews[0].support='<img src=x>';data.reviews[0].goals[0].value='<script>attack</script>';
  const html=render.details({campaignStrategy:data});
  assert.equal(html.includes('<script'),false);assert.equal(html.includes('<img'),false);assert.equal(html.includes('onerror'),false);
  assert.match(html,/Курс не указан/);assert.match(html,/Показатель: — \/ 60%/);
});
