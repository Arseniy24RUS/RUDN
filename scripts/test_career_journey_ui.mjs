/** Focused DOM interaction checks for the native seminar-5 runtime.
 * Uses the actual compiled component, surface, catalogues and scoring model.
 * Happy DOM supplies DOM/events; this is NOT browser layout or accessibility QA.
 *
 * HAPPY_DOM_MODULE_PATH=/absolute/path/happy-dom/lib/index.js \
 *   node scripts/test_career_journey_ui.mjs [--output /outside/repo/report.json]
 *
 * No backend, production profile or external website is contacted. Only synthetic
 * questionnaire answers and owner identifiers are used. Source vacancy rows are
 * loaded unchanged from the same local files as the production component.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createCareerRuntime} from '../site/apps/career/runtime.bundle.mjs';
import {expandTerritorialCatalog} from '../site/apps/career/assets/territorial-catalog.mjs';
import {rankJourneyAuthorities,buildVacancyRequirements,summarizeVacancyAssessment} from '../site/apps/career/assets/career-journey-model.mjs';

const args=process.argv.slice(2),require=createRequire(import.meta.url);
const argument=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const repo=fileURLToPath(new URL('../',import.meta.url)),career=path.join(repo,'site/apps/career');
const output=path.resolve(argument('--output',path.join(repo,'../career-journey-dom-qa/report.json')));
assert.ok(!output.startsWith(repo),'Keep generated QA evidence outside the repository.');
let domModule=process.env.HAPPY_DOM_MODULE_PATH||argument('--happy-dom','');
if(!domModule){try{domModule=require.resolve('happy-dom');}catch{throw Error('Install happy-dom as an isolated QA dependency or set HAPPY_DOM_MODULE_PATH to its lib/index.js.');}}
if(!domModule.startsWith('file:')&&(await stat(domModule)).isDirectory())domModule=path.join(domModule,'lib/index.js');
const {Window}=await import(domModule.startsWith('file:')?domModule:pathToFileURL(path.resolve(domModule)).href);
assert.equal(typeof Window,'function','The supplied dependency must expose Happy DOM Window.');
const dom=new Window({url:'http://career-journey.test/apps/career/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
const hostDocument=dom.document;
Object.assign(globalThis,{Node:dom.Node,NodeFilter:dom.NodeFilter,CustomEvent:dom.CustomEvent,Event:dom.Event,KeyboardEvent:dom.KeyboardEvent,MouseEvent:dom.MouseEvent,HTMLElement:dom.HTMLElement,HTMLInputElement:dom.HTMLInputElement,FormData:dom.FormData,File:dom.File,CSS:dom.CSS,matchMedia:dom.matchMedia.bind(dom),getComputedStyle:dom.getComputedStyle.bind(dom)});
const template=await readFile(path.join(career,'surface.html'),'utf8');
const json=async name=>JSON.parse(await readFile(path.join(career,'data',name+'.json'),'utf8'));
const [questions,sectors,tracks,baseAuthorities,territories,territorialPacked,conditions,national]=await Promise.all(['questions','sectors','tracks','authorities','territories','territorial-authorities','conditions','position-materials/national'].map(json));
const allAuthorities=[...baseAuthorities,...expandTerritorialCatalog(territorialPacked).filter(item=>!baseAuthorities.some(base=>base.id===item.id))];
const authorityById=new Map(allAuthorities.map(item=>[item.id,item]));
const stores=new Map(),personalityStores=new Map(),hosts=new Set();
const report={status:'running',runtime:'Happy DOM; real compiled career runtime',limitations:['DOM event/state checks only; no browser layout, painting, pointer hit testing, screen-reader or cross-engine claims.'],checks:[],errors:[],externalRequests:[],artifacts:[],startedAt:new Date().toISOString(),runtimeSha256:createHash('sha256').update(await readFile(path.join(career,'runtime.bundle.mjs'))).digest('hex')};
const pass=(name,details={})=>{report.checks.push({name,status:'pass',...details});console.log('PASS '+name);};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
const clone=value=>JSON.parse(JSON.stringify(value));

async function saveSVG(host,selector,filename,{styles='',...details}={}){
  const original=host.q(selector);assert.ok(original,'Expected actual SVG: '+selector);
  const svg=original.cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  if(styles){const style=hostDocument.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=styles;svg.prepend(style);}
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(path.join(path.dirname(output),filename),'<?xml version="1.0" encoding="UTF-8"?>\n'+svg.outerHTML+'\n');
  report.artifacts.push({filename,kind:'actual runtime SVG DOM snapshot',selector,...details});
}

async function waitUntil(condition,message,{timeout=12000}={}){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(condition())return;await tick();}
  throw Error('Timed out: '+message);
}

function createHost({owner='student:journey-dom-a',language='ru',route='home',free=false}={}){
  const ownerKey=`career-journey-dom:${free?'free:':'course:'}${encodeURIComponent(owner)}:`;
  const personalKey=`${free?'free:':'course:'}${owner}`;
  const surface=hostDocument.createElement('section');surface.className=`career-surface${free?'':' seminar-flow'}`;surface.lang=language;surface.innerHTML=template;hostDocument.body.append(surface);
  let destroyed=false;
  const timers=new Set(),observers=new Set(),listeners=[],results=[];
  const host={owner,ownerKey,personalKey,surface,route,results,knowledgeCalls:0,requests:[],runtime:null};
  hosts.add(host);
  const listen=(target,type,callback,options)=>{target.addEventListener(type,callback,options);listeners.push(()=>target.removeEventListener(type,callback,options));};
  const scopedDocument={body:surface,documentElement:surface,get activeElement(){return hostDocument.activeElement;},get title(){return '';},set title(_value){},
    querySelector:selector=>surface.querySelector(selector),querySelectorAll:selector=>surface.querySelectorAll(selector),getElementById:id=>surface.querySelector('#'+dom.CSS.escape(id)),
    createElement:hostDocument.createElement.bind(hostDocument),createTreeWalker:hostDocument.createTreeWalker.bind(hostDocument),
    addEventListener:(type,callback,options)=>listen(surface,type,callback,options),removeEventListener:(type,callback,options)=>surface.removeEventListener(type,callback,options),dispatchEvent:event=>!destroyed&&surface.dispatchEvent(event)};
  class ScopedObserver extends dom.MutationObserver{constructor(callback){super((...values)=>{if(!destroyed)callback(...values);});observers.add(this);}}
  const timeout=(callback,delay,...values)=>{if(destroyed)return 0;const id=setTimeout(()=>{timers.delete(id);if(!destroyed)callback(...values);},delay);timers.add(id);return id;};
  const clear=id=>{timers.delete(id);clearTimeout(id);};
  const context={document:scopedDocument,
    window:{addEventListener:(type,callback,options)=>listen(surface,type,callback,options),innerHeight:900,scrollTo(){},scrollBy(){},print(){}},
    localStorage:{getItem:key=>key.startsWith(ownerKey)?stores.get(key)??null:null,setItem(key,value){assert.ok(key.startsWith(ownerKey),'Native runtime must retain owner storage scope');if(destroyed)throw Error('Host closed');stores.set(key,String(value));},removeItem:key=>{if(key.startsWith(ownerKey))stores.delete(key);}},
    location:{href:`http://career-journey.test/apps/career/?lang=${language}#${route}`,hash:'#'+route,protocol:'http:',reload(){throw Error('Unexpected reload');}},navigator:{languages:[language],language},
    async fetch(input,options={}){
      const url=new URL(String(input),'http://career-journey.test/apps/career/');host.requests.push(url.pathname);
      if(url.origin!=='http://career-journey.test'||!url.pathname.startsWith('/apps/career/')){report.externalRequests.push(url.href);throw Error('External requests forbidden in focused DOM QA');}
      if(options.signal?.aborted||destroyed)throw new DOMException('Host closed','AbortError');
      const filename=path.resolve(career,'.'+url.pathname.slice('/apps/career'.length));
      assert.ok(filename.startsWith(career+path.sep),'Resource must remain in career module');
      try{const text=await readFile(filename,'utf8');return {ok:true,status:200,json:async()=>JSON.parse(text),text:async()=>text};}
      catch(error){return {ok:false,status:404,json:async()=>{throw error;}};}
    },
    MutationObserver:ScopedObserver,URL:dom.URL,setTimeout:timeout,clearTimeout:clear,requestAnimationFrame:callback=>timeout(()=>callback(performance.now()),0),confirm:()=>true,prompt:()=>null,
    lang:language,seminarFlow:!free,liveVacancies:false,get destroyed(){return destroyed;},storageKey:name=>ownerKey+name,
    personalityStorage:{getItem:()=>personalityStores.get(personalKey)||null,setItem:value=>{if(destroyed)throw Error('Host closed');personalityStores.set(personalKey,String(value));}},
    routeChanged(value){host.route=value;},resultCalculated(record){results.push(clone(record));},async openKnowledge(){host.knowledgeCalls++;},assetURL:value=>new URL(value,'http://career-journey.test/apps/career/').href};
  host.runtime=createCareerRuntime(context);
  host.q=selector=>surface.querySelector(selector);host.qa=selector=>[...surface.querySelectorAll(selector)];
  host.journey=()=>JSON.parse(stores.get(ownerKey+'career-journey-v1')||'null');
  host.answers=()=>JSON.parse(stores.get(ownerKey+'answers-v8.1')||'null');
  host.personality=()=>JSON.parse(personalityStores.get(personalKey)||'null');
  host.activeRoute=()=>host.q('.view:not([hidden])')?.id.replace('view-','');
  host.close=()=>{if(destroyed)return;destroyed=true;listeners.forEach(off=>off());observers.forEach(observer=>observer.disconnect());timers.forEach(clearTimeout);surface.remove();hosts.delete(host);};
  return host;
}

async function mount(options){const host=createHost(options);await host.runtime.ready;await tick();assert.equal(host.q('.boot-error'),null,'Native module boot must succeed');return host;}
async function settled(host){await waitUntil(()=>!host.runtime.updateBusy(),'career module to finish scoped data loading');await tick();}
function click(host,selector){const element=host.q(selector);assert.ok(element,'Expected control: '+selector);assert.notEqual(element.disabled,true,'Control must be enabled: '+selector);element.click();return element;}
function input(host,selector,value,event='input'){const element=host.q(selector);assert.ok(element,'Expected input: '+selector);element.value=value;element.dispatchEvent(new dom.Event(event,{bubbles:true}));return element;}
function mapToggle(host,id){const shape=host.q(`[data-region-map-id="${id}"]`);assert.ok(shape,'Mapped territory exists: '+id);shape.dispatchEvent(new dom.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));}
function countSummary(host){return host.qa('.journey-summary-counts > div > strong').map(node=>Number(node.textContent));}
const personalKeys=value=>value&&typeof value==='object'&&Object.entries(value).some(([key,child])=>/^ipip-\d{3}$/.test(key)||personalKeys(child));

const syntheticInputs={answers:Object.fromEntries(questions.map(question=>[question.id,({E:5,A:5,D:4,M:4,N:3,K:2,C:2,T:2,I:2})[question.scale]||3])),prioritySectors:['FIN','ECO','DIG','IND'],lowPrioritySectors:['SEC','EMR'],conditions:Object.fromEntries(conditions.map(condition=>[condition.id,3])),focusAreas:{},regionIds:['ru-77','ru-16','ru-78']};
const expected=rankJourneyAuthorities({authorities:allAuthorities,tracks,questions,sectors,inputs:syntheticInputs,regionIds:syntheticInputs.regionIds,limit:3});
const federalWish=expected.federal[0].id;
const regionalWish=expected.regions.find(group=>group.regionId==='ru-16').authorities[0].id;
const corporationWish='rosatom';assert.ok(authorityById.has(corporationWish));

async function finishPersonality(host){
  const seen=new Set();
  for(let page=0;page<12;page++){
    const items=[...new Set(host.qa('#personality-root [data-personality-item]').map(node=>node.dataset.personalityItem))];assert.equal(items.length,10,'Ten personality statements per page');
    for(const id of items){assert.ok(!seen.has(id),'No repeated personality pages');seen.add(id);click(host,`input[data-personality-item="${id}"][value="3"]`);}
    assert.equal(host.q('#personality-next').disabled,false);click(host,'#personality-next');await tick();
  }
  assert.equal(seen.size,120);assert.equal(host.activeRoute(),'personality-results');assert.equal(Object.keys(host.personality().answers).length,120);assert.equal(host.results.length,0,'Psychological answers must not create a career record');
  pass('All 120 personality answers completed through DOM controls and stored separately');
}

async function addWish(host,id){
  input(host,'#journey-authority-search',authorityById.get(id).name);await tick();
  click(host,`[data-add-wish="${id}"]`);await tick();
}

async function completeCareer(host){
  assert.equal(host.activeRoute(),'test');
  for(let i=0;i<questions.length;i++){
    assert.ok(normalize(host.q('#question-counter').textContent).includes(String(i+1)));
    click(host,`[data-answer="${syntheticInputs.answers[questions[i].id]}"]`);click(host,'#question-next');await tick();
  }
  assert.equal(host.activeRoute(),'sectors');
  for(const id of syntheticInputs.prioritySectors)click(host,`[data-sector="${id}"] .priority-toggle`);
  for(const id of syntheticInputs.lowPrioritySectors)click(host,`[data-sector="${id}"] .low-toggle`);
  click(host,'#sectors-next');assert.equal(host.activeRoute(),'conditions');
  for(const condition of conditions)click(host,`[data-condition="${condition.id}"][data-value="3"]`);
  click(host,'#calculate-button');await tick();assert.equal(host.activeRoute(),'results');assert.ok(host.q('#seminar-show-authorities'));assert.equal(host.answers().completedAt!==null,true);
  assert.deepEqual(host.answers().answers,syntheticInputs.answers);assert.deepEqual(host.answers().prioritySectors,syntheticInputs.prioritySectors);
  assert.ok(host.results.length>0);assert.equal(personalKeys(host.results),false,'Career records must exclude personality item answers');
  pass('All 27 career questions, four priorities, two exclusions and four conditions use the existing scoring path');
}

async function selectRole(host,vacancy){
  if(host.q('#journey-back-requirements'))click(host,'#journey-back-requirements');
  if(host.q('#journey-back-vacancies'))click(host,'#journey-back-vacancies');
  if(host.q('#journey-choose-role'))click(host,'#journey-choose-role');
  await settled(host);
  input(host,'#journey-vacancy-employer',vacancy.institutionId,'change');
  input(host,'#journey-vacancy-search',vacancy.title);
  let more=0;
  while(!host.q(`[data-select-vacancy="${vacancy.id}"]`)&&host.q('#journey-more-vacancies')&&more++<50)click(host,'#journey-more-vacancies');
  click(host,`[data-select-vacancy="${vacancy.id}"]`);await tick();
  assert.ok(host.q('#journey-assessment-state'),'Role selection opens actual requirements');
  assert.equal(host.journey().selectedVacancyId,vacancy.id);
}

function requirementControl(host,id,status){return host.q(`[data-requirement-key="${id}"][value="${status}"]`);}
function mark(host,id,status){const node=requirementControl(host,id,status);assert.ok(node,`Assessable requirement ${id}/${status} exists`);node.click();}
function assertCounts(host,requirements,statuses){
  const expected=summarizeVacancyAssessment(requirements,statuses);
  assert.deepEqual(countSummary(host),[expected.met,expected.gap,expected.unassessed]);return expected;
}
async function assertLanguage(host,language,stage){
  await host.runtime.setLocale(language);await tick();
  const labels={ru:{preferences:'Где и кем Вы хотите работать',requirements:'Требования выбранной должности',summary:'Ваш план развития'},en:{preferences:'Where would you like to work?',requirements:'Selected role requirements',summary:'Your development plan'},'zh-Hans':{preferences:'你希望在哪里工作？',requirements:'所选职位要求',summary:'你的发展计划'}};
  const heading=stage==='preferences'?host.q('#journey-preferences-root h1'):host.q('#results-root h1');assert.equal(normalize(heading.textContent),labels[language][stage]);
  if(stage==='preferences'){
    const options=host.qa('.career-region-option');assert.equal(options.length,89);
    if(language!=='ru')assert.equal(/[А-Яа-яЁё]/.test(options.map(node=>node.textContent).join('')),false,'All territory names must be localized');
  }else if(stage==='requirements'){
    const inputs=host.qa('[data-requirement-key]');assert.ok(inputs.length>0);assert.equal(host.qa('.journey-assessment-options input:checked').length,Object.keys(host.journey().assessments[host.journey().selectedVacancyId]||{}).length);
    if(language!=='ru')assert.equal(/[А-Яа-яЁё]/.test(host.qa('.journey-assessment-options label').map(node=>node.textContent).join('')),false,'Assessment controls are localized; source wording remains original');
  }else assert.ok(host.q('.journey-target-radar[role="img"][aria-label]'));
}

try{
  let host=await mount({owner:'student:journey-dom-a'});
  assert.equal(host.activeRoute(),'personality');host.runtime.navigate('test');assert.equal(host.activeRoute(),'personality');
  await finishPersonality(host);
  click(host,'#personality-continue');await waitUntil(()=>host.activeRoute()==='preferences'&&host.q('[data-region-checkbox]'),'preferences after personality');await settled(host);
  await waitUntil(()=>host.qa('[data-region-map-id]').length===89,'89 map geometries');
  assert.equal(host.qa('[data-region-checkbox]').length,89);assert.equal(host.q('[data-region-checkbox]').value,'ru-77');assert.equal(host.q('[data-region-checkbox="ru-77"]').checked,true);assert.equal(host.q('#journey-preferences-next').disabled,true);
  host.runtime.navigate('test');assert.equal(host.activeRoute(),'preferences');
  await waitUntil(()=>host.qa('[data-region-map-id]').length===89,'map after guarded preference navigation');
  pass('Preferences follow personality and block career questions until three wishes are confirmed');
  click(host,'[data-region-checkbox="ru-77"]');assert.deepEqual(host.journey().regionIds,[]);assert.equal(host.q('[data-region-map-id="ru-77"]').getAttribute('aria-checked'),'false');
  mapToggle(host,'ru-77');mapToggle(host,'ru-16');click(host,'[data-region-checkbox="ru-78"]');assert.deepEqual([...host.journey().regionIds].sort(),[...syntheticInputs.regionIds].sort());
  assert.equal(host.q('[data-region-checkbox="ru-16"]').checked,true);pass('Moscow can be removed; map and checkboxes select the same three canonical regions');
  const mapStyles=(await readFile(path.join(career,'assets/region-picker.css'),'utf8')).split('\n').filter(line=>/^\.career-region-(?:shape|city)/.test(line)&&!/:hover|:focus/.test(line)).join('\n');
  await saveSVG(host,'.career-region-map','territory-selection.svg',{styles:mapStyles,regionIds:clone(host.journey().regionIds),note:'Static copy embeds the corresponding noninteractive map styles; browser layout was not evaluated.'});
  await addWish(host,federalWish);await addWish(host,corporationWish);await addWish(host,regionalWish);
  assert.deepEqual(host.journey().desiredIds,[federalWish,corporationWish,regionalWish]);assert.equal(host.q('#journey-preferences-next').disabled,false);
  click(host,'[data-move-wish="2"][data-direction="-1"]');click(host,'[data-move-wish="1"][data-direction="-1"]');
  const wished=[regionalWish,federalWish,corporationWish];assert.deepEqual(host.journey().desiredIds,wished);
  pass('Three distinct wishes include a corporation; arrows preserve their explicit priority order');
  const beforeRemount=clone(host.journey());host.close();host=await mount({owner:'student:journey-dom-a',route:'preferences'});await settled(host);
  assert.equal(host.activeRoute(),'preferences');assert.deepEqual(host.journey().regionIds,beforeRemount.regionIds);assert.deepEqual(host.journey().desiredIds,wished);assert.equal(host.qa('#journey-desired-choices .is-filled').length,3);pass('Territories and wish order survive native runtime remount');
  click(host,'#journey-preferences-next');await completeCareer(host);
  click(host,'#seminar-show-authorities');await settled(host);
  const groups=host.qa('[data-recommendation-group]');assert.deepEqual(groups.map(node=>node.dataset.recommendationGroup),['federal',...host.journey().regionIds]);
  for(const group of groups)assert.equal(group.querySelectorAll('[data-recommended-authority]').length,3,'Exactly three employers in '+group.dataset.recommendationGroup);
  assert.deepEqual(host.qa('[data-recommendation-group="federal"] [data-recommended-authority]').map(node=>node.dataset.recommendedAuthority),expected.federal.map(authority=>authority.id));
  assert.deepEqual(host.journey().desiredIds,wished);assert.ok(host.q(`[data-recommended-authority="${federalWish}"].journey-matched`));
  pass('Actual recommendations contain three national employers and three per region; matching wishes receive a frame');
  assert.equal(host.q('#seminar-open-knowledge'),null,'Knowledge test is not offered before choosing and assessing a role');
  click(host,'#journey-show-plan');assert.ok(host.q('#journey-choose-role'));assert.equal(host.q('#seminar-open-knowledge'),null);click(host,'#journey-choose-role');await settled(host);
  pass('Development plan requires a selected role before offering the knowledge test');
  const vacancy=national.positions.find(item=>item.id==='mintrud-reserve-2022-1');assert.ok(vacancy,'Use the actual retained Mintrud source record');
  const requirements=buildVacancyRequirements(vacancy),assessable=requirements.rows.filter(row=>row.assessable);
  assert.ok(assessable.length>=5);await selectRole(host,vacancy);
  assert.equal(host.qa('[data-requirement-row]').length,assessable.length);
  for(const row of assessable)assert.ok(normalize(host.q(`[data-requirement-row="${row.id}"] legend`).textContent).includes(normalize(row.text)),'Retained source statement is rendered verbatim');
  for(const row of requirements.rows.filter(item=>!item.assessable))assert.equal(requirementControl(host,row.id,'met'),null,'Source context is not a forced self-assessment item');
  assert.equal(host.qa('[data-requirement-key]:checked').length,0);
  pass('Actual source requirements are rendered intact; explicitly absent/source-only statements are excluded from assessment');
  const formal=assessable.find(row=>row.assessmentKind==='formal'),knowledge=assessable.find(row=>row.category==='knowledge'),met=assessable.find(row=>row.id!==formal.id&&row.id!==knowledge.id);
  assert.ok(formal&&knowledge&&met);mark(host,formal.id,'gap');mark(host,knowledge.id,'gap');mark(host,met.id,'met');
  assert.equal(Number(host.q('#journey-assessment-progress').value),3);
  mark(host,met.id,'gap');assert.equal(host.journey().assessments[vacancy.id][met.id].status,'gap');mark(host,met.id,'met');
  click(host,'#journey-open-plan');await tick();const partial=assertCounts(host,requirements,host.journey().assessments[vacancy.id]);
  assert.equal(partial.met,1);assert.equal(partial.gap,2);assert.equal(partial.unassessed,assessable.length-3);assert.equal(host.q('#seminar-open-knowledge').disabled,true);assert.equal(host.knowledgeCalls,0);
  const gapSections=host.qa('section').filter(section=>section.querySelector(':scope > .journey-gap-list'));
  assert.ok(gapSections.some(section=>section.querySelector('h2')?.textContent.includes('знания')&&section.textContent.includes(knowledge.text)));
  assert.ok(gapSections.some(section=>section.querySelector('h2')?.textContent.includes('Образование')&&section.textContent.includes(formal.text)));
  assert.equal(host.qa('.journey-gap-list li').length,2,'Unknown items must not be listed as demonstrated gaps');
  assert.ok(host.q('.seminar-radar svg[role="img"]'),'Original interest radar remains available');assert.ok(host.q('.journey-target-radar[role="img"]'),'Requirement comparison radar is present');
  assert.ok(host.q('.journey-target-radar polygon[stroke-dasharray]'),'Target outline has a non-color encoding');assert.ok(host.qa('.journey-coverage-track .is-unassessed').some(node=>parseFloat(node.style.width)>0));
  pass('Partial assessment distinguishes met, gap and unassessed; interest/target charts and separate formal/skill gaps are shown');
  click(host,'#journey-back-requirements');
  for(const row of assessable)mark(host,row.id,[formal.id,knowledge.id].includes(row.id)?'gap':'met');
  const completedAssessments=clone(host.journey().assessments[vacancy.id]);
  click(host,'#journey-open-plan');const completed=assertCounts(host,requirements,completedAssessments);
  assert.equal(completed.unassessed,0);assert.equal(host.q('#seminar-open-knowledge').disabled,false);click(host,'#seminar-open-knowledge');await tick();assert.equal(host.knowledgeCalls,1);
  await saveSVG(host,'.journey-target-radar','requirements-comparison.svg',{vacancyId:vacancy.id,counts:{met:completed.met,gap:completed.gap,unassessed:completed.unassessed},note:'Synthetic student assessment of the unchanged bundled source requirements.'});
  await saveSVG(host,'.seminar-radar svg','interest-profile.svg',{note:'Existing scoring model with synthetic questionnaire inputs.'});
  pass('A fully assessed sourced role unlocks the knowledge test without requiring all requirements to be met');
  for(const language of ['en','zh-Hans','ru']){
    await assertLanguage(host,language,'summary');assertCounts(host,requirements,completedAssessments);assert.equal(host.q('#seminar-open-knowledge').disabled,false);
    click(host,'#journey-back-requirements');await assertLanguage(host,language,'requirements');click(host,'#journey-open-plan');
  }
  pass('RU, EN and Simplified Chinese preserve requirement states, chart counts and the knowledge gate');
  const another=national.positions.find(item=>item.id==='mintrud-reserve-2022-2');assert.ok(another);await selectRole(host,another);
  assert.equal(host.qa('[data-requirement-key]:checked').length,0,'A different position starts with no inherited marks');
  const anotherRows=buildVacancyRequirements(another).rows.filter(row=>row.assessable);mark(host,anotherRows[0].id,'met');
  await selectRole(host,vacancy);assert.equal(host.qa('[data-requirement-key]:checked').length,assessable.length);assert.deepEqual(host.journey().assessments[vacancy.id],completedAssessments);click(host,'#journey-open-plan');
  pass('Changing roles retains each role’s own assessment without leaking marks between source records');
  click(host,'#journey-back-requirements');click(host,'#journey-back-vacancies');await settled(host);
  click(host,'.journey-manual-source > summary');
  const manual={title:'Синтетическая должность QA — не вакансия',url:'https://example.invalid/career-dom-qa/role',knowledge:'Синтетическое требование QA: анализ данных.\nСинтетическое требование QA: подготовка аналитической записки.'};
  input(host,'#journey-manual-vacancy [name="employer"]','mintrud','change');
  input(host,'#journey-manual-vacancy [name="title"]',manual.title);input(host,'#journey-manual-vacancy [name="url"]',manual.url);
  const customCount=host.journey().customVacancies.length;
  click(host,'#journey-manual-vacancy [type="submit"]');assert.ok(normalize(host.q('#journey-manual-error').textContent));assert.equal(host.journey().customVacancies.length,customCount,'An announcement without requirements cannot be added');
  input(host,'#journey-manual-vacancy [name="knowledge"]',manual.knowledge);
  await host.runtime.setLocale('en');await tick();
  for(const [name,value] of Object.entries(manual))assert.equal(host.q(`#journey-manual-vacancy [name="${name}"]`).value,value,'Manual draft survives locale change: '+name);
  await waitUntil(()=>host.journey().manualDraft?.knowledge===manual.knowledge,'debounced manual draft persistence');
  click(host,'#journey-manual-vacancy [type="submit"]');await tick();
  assert.ok(host.q('#journey-assessment-state'));assert.ok(host.journey().selectedVacancyId.startsWith('student-source-'));
  const added=host.journey().customVacancies.find(item=>item.id===host.journey().selectedVacancyId);assert.ok(added.userProvided);assert.equal(added.title,manual.title);assert.equal(added.source.url,manual.url);assert.deepEqual(added.requirements.map(row=>row.sourceText),manual.knowledge.split('\n'));assert.equal(host.qa('[data-requirement-row]').length,2);
  assert.equal(host.qa('[data-requirement-key]:checked').length,0);assert.equal(host.journey().assessments[vacancy.id][formal.id].status,'gap');
  await host.runtime.setLocale('ru');await selectRole(host,vacancy);click(host,'#journey-open-plan');assertCounts(host,requirements,completedAssessments);
  pass('Manual source drafts survive language changes, persist, require source requirements and open a separate assessment');
  const ownerA={journey:clone(host.journey()),answers:clone(host.answers()),personality:clone(host.personality())};
  const other=await mount({owner:'student:journey-dom-b'});await settled(other);
  assert.equal(other.activeRoute(),'personality');assert.equal(other.personality(),null);assert.equal(Object.keys(other.answers().answers).length,0);assert.equal(other.journey(),null);assert.equal(other.results.length,0);
  click(other,'input[data-personality-item="ipip-001"][value="5"]');
  assert.equal(other.personality().answers['ipip-001'],5);assert.equal(host.personality().answers['ipip-001'],3);assert.deepEqual(host.journey(),ownerA.journey);assert.deepEqual(host.answers(),ownerA.answers);
  other.close();pass('Different students have isolated personality answers, career results, wishes and vacancy assessments');
  const free=await mount({owner:'student:journey-dom-a',free:true});await settled(free);
  assert.equal(free.activeRoute(),'home');assert.equal(free.journey(),null);assert.equal(free.personality(),null);assert.equal(Object.keys(free.answers().answers).length,0);free.close();
  assert.deepEqual(host.journey(),ownerA.journey);pass('Free-play storage for the same student cannot alter the course journey');
  const savedRecord=host.answers().resultRecordId;host.close();host=await mount({owner:'student:journey-dom-a',route:'results'});await settled(host);
  assert.equal(host.activeRoute(),'results','Confirmed saved result must resume after catalogue loading');
  assert.equal(host.answers().resultRecordId,savedRecord);assert.equal(host.journey().selectedVacancyId,vacancy.id);assert.deepEqual(host.journey().assessments[vacancy.id],completedAssessments);
  if(host.q('#seminar-show-authorities'))click(host,'#seminar-show-authorities');
  if(host.q('#journey-show-plan'))click(host,'#journey-show-plan');
  await settled(host);assertCounts(host,requirements,completedAssessments);assert.equal(host.q('#seminar-open-knowledge').disabled,false);
  pass('Native remount resumes the saved summary, selected source and assessment without recalculating a new record');
  click(host,'#journey-back-requirements');click(host,'#journey-back-vacancies');click(host,'#journey-edit-preferences');
  await waitUntil(()=>host.qa('[data-region-map-id]').length===89,'editable preference map');
  for(const language of ['en','zh-Hans','ru']){await assertLanguage(host,language,'preferences');assert.deepEqual(host.journey().desiredIds,wished);}
  pass('Preference editing is trilingual and preserves the wish order');
  click(host,'[data-region-checkbox="ru-16"]');assert.equal(host.journey().desiredIds.includes(regionalWish),false);assert.equal(host.journey().desiredIds.length,2);assert.equal(host.q('#journey-preferences-next').disabled,true);assert.equal(host.journey().confirmed,false);
  assert.deepEqual(host.answers().answers,syntheticInputs.answers);host.runtime.navigate('results');assert.equal(host.activeRoute(),'preferences');
  pass('Removing a territory removes its desired employer, requires a replacement and preserves career answers');
  await waitUntil(()=>host.qa('[data-region-map-id]').length===89,'map after region-change guard');
  click(host,'[data-region-checkbox="ru-77"]');assert.equal(host.journey().selectedVacancyId,null,'Removing a selected role’s work region clears that role selection');assert.equal(host.journey().selectedSnapshot==null,true);
  assert.deepEqual(host.journey().assessments[vacancy.id],completedAssessments,'Historical self-assessment may remain for later reselection');
  click(host,'[data-region-checkbox="ru-78"]');assert.deepEqual(host.journey().regionIds,[]);pass('Removing a vacancy’s region clears its active selection; explicit empty territory list persists');
  host.close();host=await mount({owner:'student:journey-dom-a',route:'preferences'});await settled(host);assert.deepEqual(host.journey().regionIds,[]);assert.equal(host.q('[data-region-checkbox="ru-77"]').checked,false);
  const extraFederal=expected.federal.find(item=>![federalWish,corporationWish].includes(item.id));assert.ok(extraFederal);await addWish(host,extraFederal.id);click(host,'#journey-preferences-next');await tick();
  if(host.q('#seminar-show-authorities'))click(host,'#seminar-show-authorities');
  if(host.q('#journey-choose-role'))click(host,'#journey-choose-role');await settled(host);
  assert.deepEqual(host.qa('[data-recommendation-group]').map(node=>node.dataset.recommendationGroup),['federal']);assert.equal(host.qa('[data-recommended-authority]').length,3);assert.ok(!host.requests.some(url=>/position-materials\/ru-/.test(url)),'An explicitly federal-only remount must not request regional position shards');
  pass('Federal-only selection survives remount, returns three employers and avoids regional source loads');
  assert.deepEqual(report.externalRequests,[]);assert.equal(personalKeys(host.results),false);pass('QA used only bundled resources and kept psychological item answers out of career payloads');
  report.status='pass';
}catch(error){report.status='fail';report.errors.push({message:error.message,stack:error.stack});console.error(error.stack);process.exitCode=1;}
finally{
  for(const host of [...hosts])host.close();await dom.happyDOM.close();report.finishedAt=new Date().toISOString();await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log('DOM QA report: '+output);
}
