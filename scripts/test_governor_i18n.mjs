import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

class FixedDate extends Date {constructor(...args){super(...(args.length?args:[1789272000000]));}static now(){return 1789272000000;}}
const sandbox={console,Date:FixedDate};sandbox.window=sandbox;vm.createContext(sandbox);
const src=new URL('../site/apps/governor/',import.meta.url);
for(const file of ['src/i18n.js','locales/zh-Hans.js','src/i18n-shell.js',...['game-data','stage3-data','stage4-data','consolidation-data','agenda','project-state','population','recovery','budget-review','finance','governance-data','governance','stories-data','stories','world-outcomes','state-integrity','engine','learning'].map(name=>'src/'+name+'.js')]){
 vm.runInContext(await readFile(new URL(file,src),'utf8'),sandbox,{filename:file});
}
const G=sandbox.GovernorGame,I=G.I18n,E=G.Engine;
const plain=value=>JSON.parse(JSON.stringify(value));
const placeholders=value=>(value.match(/\{\d+\}/g)||[]).sort();
const cyrillic=value=>/[\u0400-\u04ff]/.test(value);
const allowAutonym=value=>!cyrillic(value.replaceAll('Русский','').replaceAll('ГГУбд-01-26',''));

test('Chinese catalog covers all 2,031 source messages, including template placeholders',()=>{
 assert.equal(G.ChineseCatalog.length,2031);assert.equal(new Set(G.ChineseCatalog.map(x=>x.id)).size,2031);
 for(const entry of G.ChineseCatalog){
  assert.ok(entry.zh.trim(),entry.id+' empty');
  assert.deepEqual(placeholders(entry.zh),placeholders(entry.ru),entry.id+' placeholders changed');
  assert.ok(!cyrillic(entry.zh)||allowAutonym(entry.zh),entry.id+' untranslated');
  assert.equal(I.translate(entry.ru),entry.zh,entry.id+' not reachable');
  if(placeholders(entry.ru).length){const fill=value=>value.replace(/\{(\d+)\}/g,(_,id)=>'QA_VALUE_'+id);assert.equal(I.translate(fill(entry.ru)),fill(entry.zh),entry.id+' runtime template');}
  assert.equal(I.choose('ru',entry.ru,entry.en),entry.ru);
  assert.equal(I.choose('en',entry.ru,entry.en),entry.en);
 }
 assert.ok(I.ready());
 for(const row of I.shellLabels)assert.ok(row.length===3&&row.every(x=>x.trim())&&!cyrillic(row[2]));
});

test('all reachable authored bilingual content has a Chinese rendering',()=>{
 const seen=new WeakSet(),missing=[];
 function visit(value,path){if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
  if(typeof value.ru==='string'&&typeof value.en==='string'){
   const result=I.local(value,'zh');if(cyrillic(result)&&!allowAutonym(result))missing.push([path,value.ru,result]);
  }
  for(const [key,item]of Object.entries(value))visit(item,path+'.'+key);
 }
 visit(G.DATA,'DATA');visit(G.Stories?.DATA,'Stories');visit(G.Governance?.CONFIG,'Governance');
 assert.deepEqual(missing,[]);
 I.install(G.DATA);for(const [key,text]of Object.entries(G.DATA.ui.ru))if(cyrillic(text)&&!allowAutonym(text))assert.ok(!cyrillic(G.DATA.ui.zh[key])||allowAutonym(G.DATA.ui.zh[key]),'UI key '+key);
});

test('translation is display-only and never translates captured user input',()=>{
 const source='Проверено: Иван Петров; принятых решений 7/20. При подтверждении текущая автокопия станет резервной.';
 const result=I.translate(source);assert.ok(result.includes('Иван Петров'));assert.ok(result.includes('7/20'));assert.notEqual(result,source);
 const object={ru:'Казна',en:'Treasury'};I.local(object,'zh');assert.deepEqual(object,{ru:'Казна',en:'Treasury'});
});

test('authored historical report fields translate bidirectionally without changing captured user content',()=>{
 const simple=G.ChineseCatalog.find(entry=>entry.ru==='Казна');assert.ok(simple);
 const template=G.ChineseCatalog.find(entry=>entry.ru.startsWith('Проверено: {0}; принятых решений'));
 assert.ok(template);
 const values=['Иван Петров / 中文 / Alice','7','20'];
 const fill=text=>text.replace(/\{(\d+)\}/g,(_,id)=>values[Number(id)]??'VALUE_'+id);
 for(const source of ['ru','en','zh'])for(const target of ['ru','en','zh']){
  assert.equal(I.authored(simple[source],target),simple[target]);
  assert.equal(I.authored(fill(template[source]),target),fill(template[target]));
 }
 const unknown='Моя собственная рефлексия: не следует менять текст. 中文 7/20';
 for(const target of ['ru','en','zh'])assert.equal(I.authored(unknown,target),unknown);
 assert.equal(I.authored(null,'en'),null);assert.equal(I.authored(12,'zh'),12);
});

test('nested authored fragments are localized before insertion in treasury and promise views',async()=>{
 const dialogs=new Map(),prompts=[];
 const context={console,Intl,document:{activeElement:null,getElementById:id=>dialogs.get(id)},confirm:text=>{prompts.push(text);return false;}};
 context.window=context;context.GovernorGame={I18n:I,icon:()=>'',DATA:{missions:[{id:'qa-mission',title:{ru:'Казна',en:'Treasury'}}]},
  Engine:{localise:(value,locale)=>I.local(value,locale),treasuryOperationQuote:()=>({available:true,treasuryAfter:2})},
  Governance:{CONFIG:{actors:[{id:'qa-actor',role:{ru:'Казна',en:'Treasury'}}]},revisionQuote:()=>({available:false}),sceneFor:()=>({title:{ru:'Казна',en:'Treasury'}})}};
 const dialog={innerHTML:'',showModal(){},querySelector:()=>({}),querySelectorAll:()=>[]};dialogs.set('promises-dialog',dialog);
 vm.createContext(context);
 for(const file of ['consolidation-ui','governance-ui'])vm.runInContext(await readFile(new URL('src/'+file+'.js',src),'utf8'),context);
 for(const locale of ['ru','en','zh']){
  const listeners={},buttons=['reserve','repay'].map(operation=>({dataset:{treasuryOp:operation},addEventListener:(_,fn)=>{listeners[operation]=fn;}}));
  const input={value:'0.5',addEventListener(){}},node={querySelector:selector=>selector==='#fiscal-amount'?input:{},querySelectorAll:()=>buttons};
  context.GovernorGame.ConsolidationUI.attachTreasury(node,{},locale,()=>assert.fail('Cancelled confirmation changed state'),()=>assert.fail('Cancelled confirmation saved'));
  listeners.reserve();listeners.repay();
  if(locale==='zh')for(const text of prompts.slice(-2))assert.ok(!cyrillic(text),'Untranslated treasury operation: '+text);
  if(locale==='ru')assert.ok(prompts.at(-2).startsWith('Перевести в резерв'));
  if(locale==='en')assert.ok(prompts.at(-1).startsWith('Repay principal'));
  const state={population:{baseYear:2026},turnIndex:4,finance:{portfolio:[]},history:[],governance:{agreements:[{sceneId:'qa-mission',turn:1,status:'agreed',positions:[]}],promises:[{id:'qa-mission:launch',actorId:'qa-actor',kind:'launch',status:'broken',dueTurn:2,resolvedTurn:3,revisions:[],evidence:{activatedTurn:null}}]}};
  context.GovernorGame.GovernanceUI.init({getState:()=>state,getLanguage:()=>locale});
  context.GovernorGame.GovernanceUI.openPromises();
  if(locale==='zh')assert.ok(!cyrillic(dialog.innerHTML),'Untranslated missed opening: '+dialog.innerHTML);
  if(locale==='ru')assert.ok(dialog.innerHTML.includes('не состоялся к сроку'));
  if(locale==='en')assert.ok(dialog.innerHTML.includes('not delivered by the deadline'));
 }
});

test('RU, EN and ZH produce identical decisions, IDs, balances and results across 20 turns',()=>{
 const states=['ru','en','zh'].map(language=>E.createState({name:'QA Governor',group:'QA',language,seed:'LOCALE-INVARIANTS',scenarioId:'balanced',campaignMode:'guided'}));
 const comparable=state=>{const result=plain(state);delete result.language;delete result.startedAt;delete result.completedAt;return result;};
 for(let turn=0;turn<20;turn++){
  for(const state of states){const mission=E.getCurrentMission(state),action=mission.actions.find(x=>x.deferred);E.commitAction(state,action.id,'treasury');E.advanceTurn(state);}
  assert.deepEqual(comparable(states[1]),comparable(states[0]),'EN changed turn '+turn);
  assert.deepEqual(comparable(states[2]),comparable(states[0]),'ZH changed turn '+turn);
 }
 for(const state of states){assert.equal(state.history.length,20);assert.equal(state.completed,true);assert.ok(E.validateState(state));}
 const zh=G.Learning.documentHtml(states[2],'zh');assert.ok(zh.includes('lang="zh"'));
 assert.ok(!cyrillic(zh),'Chinese HTML report has untranslated Russian: '+zh.match(/[^<>]*[\u0400-\u04ff][^<>]*/g)?.join('\n'));
 const ru=G.Learning.documentHtml(states[0],'ru'),en=G.Learning.documentHtml(states[1],'en');assert.ok(ru.includes('Ресурсы и результаты'));assert.ok(en.includes('Resources and outcomes'));
});
