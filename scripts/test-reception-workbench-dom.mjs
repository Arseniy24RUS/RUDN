#!/usr/bin/env node
/** Real reception mount + embedded corpus + native Range + draft restoration.
 * node scripts/test-reception-workbench-dom.mjs --jsdom /path/to/jsdom/lib/api.js
 * No browser engine, Firebase, OpenAI or network requests are used.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Worker as NodeWorker} from 'node:worker_threads';

const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const jsdomModule=arg('--jsdom')||process.env.RECEPTION_JSDOM_MODULE;
if(!jsdomModule)throw Error('Provide --jsdom /path/to/node_modules/jsdom/lib/api.js');
const {JSDOM}=await import(pathToFileURL(path.resolve(jsdomModule)));
const dom=new JSDOM('<!doctype html><html lang="ru"><head></head><body><main id="app"></main></body></html>',{url:'http://127.0.0.1:8787/apps/reception/ai-demo.html',pretendToBeVisual:true});
for(const key of ['window','document','location','localStorage','CustomEvent','Event','MouseEvent','KeyboardEvent','HTMLElement','AbortController','AbortSignal','NodeFilter'])globalThis[key]=dom.window[key];
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.CSS=window.CSS={escape:value=>String(value).replace(/[^\w-]/g,char=>'\\'+char)};
globalThis.innerHeight=window.innerHeight=760;
window.innerWidth=320;
globalThis.visualViewport=window.visualViewport=Object.assign(new window.EventTarget(),{height:760,width:320,offsetTop:0,scale:1});
globalThis.matchMedia=window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
window.HTMLElement.prototype.scrollIntoView=function(){};
window.scrollBy=function(){};window.scrollTo=function(){};
window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
window.HTMLMediaElement.prototype.canPlayType=function(){return '';};
window.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
window.HTMLMediaElement.prototype.pause=function(){};
window.HTMLMediaElement.prototype.load=function(){};

// Reader CSS load events are acknowledged; real CSS is checked below separately.
const stylesObserver=new window.MutationObserver(records=>{
  for(const record of records)for(const node of record.addedNodes)if(node.matches?.('link[rel="stylesheet"]'))queueMicrotask(()=>node.dispatchEvent(new Event('load')));
});
stylesObserver.observe(document.head,{childList:true});
const siteRoot=fileURLToPath(new URL('../site/',import.meta.url));
let fileRequests=0;
globalThis.fetch=async input=>{
  const url=new URL(input);
  assert.equal(url.protocol,'file:','Embedded reader test must not access the network');
  const filename=fileURLToPath(url);assert.ok(filename.startsWith(siteRoot));
  fileRequests++;
  return new Response(await readFile(filename),{status:200});
};
// jsdom has no Web Worker. Run the real search module in a Node worker, using
// the same adapter as the corpus integration tests; no search results are mocked.
globalThis.Worker=class {
  constructor(url){
    assert.equal(url.protocol,'file:');assert.ok(fileURLToPath(url).startsWith(siteRoot));
    this.inner=new NodeWorker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=data=>parentPort.postMessage(data);import(${JSON.stringify(url.href)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});
    this.inner.on('message',data=>this.onmessage?.({data}));this.inner.on('error',error=>this.onerror?.(error));
  }
  postMessage(data,transfer){this.inner.postMessage(data,transfer);}
  terminate(){return this.inner.terminate();}
};

const lawURL='https://www.consultant.ru/document/cons_doc_LAW_59999/';
const publicCase={
  id:'workbench-fixture',title:'Проверка правового основания',date:'2026-04-30',level:1,estimatedMinutes:10,
  citizen:{name:'Мария',portrait:'assets/maria.webp',description:'Посетитель приёмной'},
  opening:'Прошу разобраться с моим обращением.',role:{title:'Специалист приёмной',text:'Изучите материалы и подготовьте решение.'},
  sources:[{id:'law',title:'Федеральный закон № 59-ФЗ',url:lawURL}],
  procedures:[{id:'appeal',label:'Рассмотрение обращения'}],routes:[{id:'office',label:'Приёмная'}],actions:[{id:'register',label:'Зарегистрировать обращение'}],
  assessment:{
    fact:{prompt:'Установите факты',options:[]},knowledge:{prompt:'Выберите норму в документе',numberLabel:'Номер акта',dateLabel:'Дата акта',unitLabel:'Статья',options:[]},
    calendar:{events:[{id:'registered',label:'Зарегистрировано',date:'2026-04-30'}],rules:[],starts:[],lastDays:[]},
    research:{prompt:'Изучите источник',records:[],extractedLabel:'Сведение',findingOptions:[]},trap:{prompt:'Проверьте решение',options:[]},
  },
};
const publicView={id:'workbench-session',revision:1,status:'active',mode:'training',locale:'ru',caseIndex:0,caseCount:1,case:publicCase,messages:[{id:'opening',role:'assistant',text:publicCase.opening}],documents:[],openedDocumentIds:[]};
let started=false;
const apiRequests=[];
const fetchAPI=async(_url,options)=>{
  const body=JSON.parse(options.body);apiRequests.push(body.op);
  if(body.op==='catalog')return Response.json({ok:true,cases:[{id:publicCase.id,title:publicCase.title,familyId:'appeal',level:1,estimatedMinutes:10}]});
  if(body.op==='recover')return Response.json({ok:true,view:started?publicView:null});
  assert.ok(['start','resume'].includes(body.op),'Only mounting and resuming are required by this test');
  started=true;return Response.json({ok:true,view:publicView});
};
const {mountReceptionAI}=await import('../site/apps/reception/ai/app.js');
const root=document.getElementById('app');
const options={locale:'ru',studentKey:'workbench-dom',fetch:fetchAPI,context:'course',period:'test',showLanguageSelector:true};
const config={endpoint:'http://127.0.0.1:8787/api/reception',demo:true};
let handle=await mountReceptionAI(root,options,config);
const find=selector=>{const node=document.querySelector(selector);assert.ok(node,selector);return node;};
async function until(condition,label){
  for(let i=0;i<1000;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,5));}
  throw Error(label+'; '+document.querySelector('[data-source-reader-status]')?.textContent);
}
async function click(selector){find(selector).click();await handle.flush();}
function openDetails(id){find(`[data-details="${id}"]`).open=true;}
function savedDraft(){const key=Object.keys(localStorage).find(key=>key.startsWith('rudn.reception.workspace.v2:')&&key.endsWith(':current'));assert.ok(key);return JSON.parse(localStorage.getItem(key));}

try{
  await click('[data-action="start"]');assert.equal(root.dataset.page,'reception');
  await click('[data-action="page"][data-page="documents"]');
  await click('[data-action="tab"][data-tab="sources"]');
  assert.equal(root.querySelectorAll('.rxa-source-links a').length,1,'The internal document has no duplicate external action');
  await click('.rxa-source-links a[data-source-reader]');
  await until(()=>document.querySelector('.rx-source-dialog .ll-paper [data-unit]'),'Reader did not load the real corpus');
  assert.ok(root.querySelector('[data-source-reader-host] .rx-source-embedded'),'The actual reader is embedded inside Documents');
  assert.equal(root.dataset.page,'documents');
  assert.equal(document.querySelector('.rx-source-dialog')?.tagName,'SECTION');
  assert.ok(fileRequests>=4,'Registry, structure, manifest and real text blocks were loaded');
  const toc=find('.rx-source-dialog-bar [data-action="toggle-toc"]');
  toc.click();assert.equal(toc.getAttribute('aria-expanded'),'true');
  assert.ok(find('.rx-source-embedded .ll-reader-grid').classList.contains('toc-open'));
  assert.ok(root.querySelectorAll('.rx-source-embedded .ll-toc [data-action="section"]').length>0);
  toc.click();assert.equal(toc.getAttribute('aria-expanded'),'false');
  const query=find('.rx-source-embedded [data-input="reader-query"]');query.value='в течение 30 дней';
  find('.rx-source-embedded [data-search-form="reader"]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>root.querySelector('.rx-source-embedded .ll-search-results[aria-busy="false"]'),'Embedded search did not finish');
  assert.ok([...root.querySelectorAll('.rx-source-embedded [data-action="jump-unit"]')].some(node=>node.textContent.includes('Статья 12')),'Searching the actual deadline text finds Article 12 after the toolbar relocation');
  await click('.rx-source-embedded [data-action="clear-search"]');
  assert.equal(find('.rx-source-embedded [data-input="reader-query"]').value,'');
  assert.equal(find('.rx-source-embedded [data-reader-search-panel]').hidden,false,'Embedded search remains available after clearing');
  const paragraph=[...document.querySelectorAll('.rx-source-dialog .ll-paper [data-unit]')].find(node=>node.textContent.includes('Статья 12')&&node.querySelector('.ll-paragraph-text')?.textContent.includes('в течение 30 дней'));
  assert.ok(paragraph,'Article 12 text is available in the embedded corpus');
  const text=paragraph.querySelector('.ll-paragraph-text'),node=text.firstChild,start=node.textContent.indexOf('в течение 30 дней');
  const quote='в течение 30 дней',range=document.createRange();range.setStart(node,start);range.setEnd(node,start+quote.length);
  window.getSelection().removeAllRanges();window.getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));
  assert.equal(find('[data-source-reference-preview]').textContent,quote);
  assert.equal(find('[data-source-reference-use]').disabled,false);
  await click('[data-source-reference-use]');
  await until(()=>!document.querySelector('.rx-source-dialog'),'Saving the passage did not close its dialog after root rerender');
  assert.equal(root.dataset.page,'decision');
  assert.equal(find('[data-decision="law.number"]').value,'59-ФЗ');
  assert.equal(find('[data-decision="assessment.actDate"]').value,'2006-05-02');
  assert.equal(find('[data-decision="law.article"]').value,'12');
  assert.equal(find('.rxw-reference blockquote').textContent,quote);
  assert.equal(find('[data-details="assessment-law"]').open,true,'The transferred citation is visible');
  assert.equal(find('[data-decision="reasoning"]').value,'','A citation must not write the student’s justification');

  assert.equal(root.querySelector('[data-calendar-workbench], [data-decision="deadline"]'),null);
  await click('[data-deadline-summary] [data-action="page"][data-page="calendar"]');
  assert.equal(root.dataset.page,'calendar');
  await click('[data-calendar-action="event-month"]');
  assert.equal(find('[data-calendar-details="norms"]').open,false);
  await click('[data-calendar-details="norms"] > summary');
  assert.equal(find('[data-calendar-details="norms"]').open,true);
  await click('[data-calendar-action="target"][data-target="deadline"]');
  await click('[data-calendar-action="month-next"]');
  await click('[data-calendar-action="choose-date"][data-date="2026-05-04"]');
  assert.equal(find('[data-calendar-details="norms"]').open,true,'Legal reference stays open while choosing dates');
  assert.equal(root.querySelector('[data-calendar-input="anchor"], [data-calendar-action="step-day"]'),null);
  assert.equal(find('[data-decision="deadline"]').value,'','Picking alone does not submit a deadline');
  await click('[data-calendar-action="use-date"]');
  assert.equal(find('[data-decision="deadline"]').value,'2026-05-04');
  const before=savedDraft();assert.equal(before.selectedReferences.length,1);assert.equal(before.calendarState.selectedDate,'2026-05-04');

  await click('[data-action="page"][data-page="chat"]');
  await click('[data-action="page"][data-page="documents"]');
  await click('[data-action="page"][data-page="decision"]');
  assert.equal(find('.rxw-reference blockquote').textContent,quote);
  assert.equal(find('[data-deadline-summary] time').dateTime,'2026-05-04');
  await click('[data-action="page"][data-page="calendar"]');
  assert.equal(find('[data-decision="deadline"]').value,'2026-05-04');
  assert.equal(find('[data-calendar-details="norms"]').open,true,'Page switching retains the opened legal reference');
  await handle();handle=await mountReceptionAI(root,options,config);
  assert.equal(root.dataset.page,'calendar','Remount restores the Calendar destination');
  assert.equal(root.dataset.mobilePane,'desk','Mobile pane state keeps the restored calendar visible');
  assert.equal(find('[data-decision="deadline"]').value,'2026-05-04');
  assert.equal(find('[data-calendar-details="norms"]').open,true,'Remount restores the legal reference state');
  await click('[data-action="page"][data-page="decision"]');
  assert.deepEqual(savedDraft().selectedReferences,before.selectedReferences);
  assert.deepEqual(savedDraft().calendarState,before.calendarState);
  for(const [field,value] of [['law.number','59-ФЗ'],['assessment.actDate','2006-05-02'],['law.article','12']])assert.equal(find(`[data-decision="${field}"]`).value,value);
  assert.equal(find('.rxw-reference blockquote').textContent,quote);

  // Repeat from the decision itself. The citation's opener is destroyed by render().
  openDetails('assessment-law');
  await click('.rxw-reference a[data-source-reader]');
  await until(()=>document.querySelector('.rx-source-dialog .ll-paper [data-unit]'),'Reopened reader did not restore');
  assert.equal(root.dataset.page,'documents','Reopening a saved citation returns to its source workspace');
  assert.equal(find('[data-source-reference-use]').disabled,true,'A reopened document must not silently reuse an earlier selection');
  const whole=[...document.querySelectorAll('.rx-source-dialog .ll-paper [data-unit]')].find(node=>node.querySelector('.ll-paragraph-text')?.textContent.includes('в течение 30 дней'));
  assert.ok(whole);whole.click();
  assert.equal(find('[data-source-reference-use]').disabled,false);
  await click('[data-source-reference-use]');
  await until(()=>!document.querySelector('.rx-source-dialog'),'Repeat selection did not close after root rerender');
  assert.equal(root.querySelectorAll('.rxw-reference').length,2);
  assert.equal(find('[data-decision="law.article"]').value,'12');
  assert.equal(find('[data-details="assessment-law"]').open,true);

  await click('.rxw-reference a[data-source-reader]');
  await until(()=>document.querySelector('.rx-source-dialog .ll-paper [data-unit]'),'Reader did not reopen before cancel test');
  document.querySelector('.rx-source-dialog .ll-paper [data-unit]').click();
  assert.equal(find('[data-source-reference-use]').disabled,false);
  await click('[data-source-reader-close]');
  assert.equal(document.querySelector('.rx-source-dialog'),null);
  assert.equal(savedDraft().selectedReferences.length,2,'Leaving the document without confirmation must not attach a passage');

  // Media conditions are explicitly evaluated at 320px; jsdom does not lay out pixels.
  const activeRules=rules=>[...rules].flatMap(rule=>{
    if(rule.type!==4)return [rule.cssText];
    const condition=rule.conditionText||rule.media.mediaText;
    if(/prefers-reduced-motion/.test(condition))return [];
    for(const match of condition.matchAll(/(min|max)-(width|height)\s*:\s*(\d+)px/g)){
      const value=match[2]==='width'?320:760,limit=Number(match[3]);if(match[1]==='max'?value>limit:value<limit)return [];
    }
    return activeRules(rule.cssRules);
  }).join('\n');
  for(const filename of ['style.css','workbench.css','cabinet.css']){
    const scratch=document.createElement('style');scratch.textContent=await readFile(new URL('../site/apps/reception/ai/'+filename,import.meta.url),'utf8');document.head.append(scratch);
    const flattened=activeRules(scratch.sheet.cssRules);scratch.remove();const style=document.createElement('style');style.textContent=flattened;document.head.append(style);
  }
  await click('[data-action="page"][data-page="calendar"]');
  const day=find('[data-calendar-action="choose-date"]'),style=getComputedStyle(day);
  assert.equal(style.minWidth,'0','Global 44px button minimum must not overflow seven calendar columns');
  assert.equal(style.minHeight,'44px','Calendar cells retain a 44px vertical touch area');
  assert.match(getComputedStyle(find('.rxw-calendar-grid')).gridTemplateColumns,/repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(getComputedStyle(find('.rxa-mobile-nav')).gridTemplateColumns,/repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  await click('[data-action="page"][data-page="decision"]');
  await click('.rxw-reference a[data-source-reader]');
  await until(()=>document.querySelector('.rx-source-dialog .ll-paper [data-unit]'),'Reader did not reopen before unmount test');
  await handle();
  assert.equal(document.querySelector('.rx-source-dialog'),null,'Unmount closes and aborts the reader');
  assert.equal(document.body.classList.contains('reception-immersive'),false);
  document.dispatchEvent(new Event('selectionchange'));
  assert.equal(savedDraft().selectedReferences.length,2);

  // A simple, non-authored case still requires a date. The missing field now
  // lives on another page: submitting must navigate there and focus it.
  delete publicCase.assessment;publicView.id='workbench-basic-session';started=false;localStorage.clear();
  handle=await mountReceptionAI(root,options,config);await click('[data-action="start"]');
  await click('[data-action="page"][data-page="decision"]');
  for(const [field,value]of [['procedureId','appeal'],['routeId','office'],['law.number','59-ФЗ'],['law.article','12']]){
    const control=find(`[data-decision="${field}"]`);control.value=value;
    if(control.type==='radio')control.checked=true;
    control.dispatchEvent(new Event(control.type==='radio'?'change':'input',{bubbles:true}));
  }
  find('[data-decision-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await handle.flush();
  assert.equal(root.dataset.page,'calendar');
  assert.equal(document.activeElement,find('[data-decision="deadline"]'));
  assert.equal(root.querySelector('[data-action="confirm-decision"]'),null);
  const deadline=find('[data-decision="deadline"]');deadline.value='2026-05-04';deadline.dispatchEvent(new Event('input',{bubbles:true}));
  await click('[data-action="page"][data-page="decision"]');
  assert.equal(find('[data-deadline-summary] time').dateTime,'2026-05-04');
  find('[data-decision-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await handle.flush();
  assert.ok(find('[data-action="confirm-decision"]'));
  assert.equal(savedDraft().decisionDraft.deadline,'2026-05-04');
  await handle();
  const {createSourceReader}=await import('../site/apps/reception/js/source-reader.js');
  const legacyHost=document.createElement('div');document.body.append(legacyHost);
  const legacyReader=createSourceReader(legacyHost);
  try{
    assert.equal(await legacyReader.open(lawURL),true);assert.equal(find('.rx-source-dialog').tagName,'DIALOG');
    assert.ok(find('.rx-source-dialog').hasAttribute('open'));assert.equal(legacyReader.isOpen(),true);
    legacyReader.close();assert.equal(document.querySelector('.rx-source-dialog'),null);assert.equal(legacyReader.isOpen(),false);
    assert.equal(await legacyReader.open(lawURL),true);legacyReader.destroy();assert.equal(document.querySelector('.rx-source-dialog'),null);
    assert.equal(await legacyReader.open(lawURL),false,'A destroyed legacy reader cannot reopen');
  }finally{legacyReader.destroy();legacyHost.remove();}
  console.log(JSON.stringify({passed:true,checks:['real corpus embedded inside Documents','embedded table of contents and real corpus search','native partial text selection','legal fields and visible citation','reader close after root rerender','manual calendar to deadline','legal reference persist across updates, navigation and remount','page transitions','full draft remount','saved citation returns to Documents for repeat selection','close without attaching','320px calendar and five-tab cabinet CSS cascade','reader cleanup on app unmount','missing deadline redirects and focuses Calendar','Calendar deadline shared with decision confirmation','legacy modal reader open, close and destroy'],fileRequests,apiRequests},null,2));
}finally{
  await handle();stylesObserver.disconnect();dom.window.close();
}
