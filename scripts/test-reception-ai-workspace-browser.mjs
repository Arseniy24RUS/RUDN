#!/usr/bin/env node
/** Real-browser acceptance scenario. Local mock fixture only; no paid model or grades.
 * node browser-scenario.mjs --executable /usr/bin/chromium
 * Needs an environment that permits ordinary browser processes and sockets.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
if(process.argv.includes('--help')){
  console.log(`node scripts/test-reception-ai-workspace-browser.mjs --cases /private-data/cases
  [--playwright-module /path/playwright/index.mjs] [--executable /path/chromium]
  [--browser chromium|webkit] [--headed] [--out /reports]
Alternatively --url http://127.0.0.1:8793 points to reception-ai-workspace-qa.mjs.
The test starts its own loopback mock fixture when --url is omitted. No paid model,
Firebase or production grades. Screenshots are produced only by an actual run.`);process.exit(0);
}
const out=path.resolve(arg('--out',path.join(os.tmpdir(),'rudn-reception-workspace-browser')));
const modulePath=arg('--playwright-module',arg('--playwright',process.env.RECEPTION_PLAYWRIGHT_MODULE));
const moduleSpecifier=modulePath?pathToFileURL(path.resolve(modulePath)).href:'playwright';
const engine=arg('--browser','chromium');if(!['chromium','webkit'].includes(engine))throw Error('Use chromium or webkit.');
const external=arg('--url');
if(external){const url=new URL(external);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:'||url.username||url.password||url.search||url.hash)throw Error('QA --url must be an unauthenticated HTTP loopback fixture.');}
const fixture=external?null:await createReceptionFixture({casesDirectory:arg('--cases',process.env.RECEPTION_AI_CASES_DIR)});
const report={suite:'reception-mobile-repair',status:'running',provider:'mock',actualBrowser:false,caseCount:fixture?.caseCount||null,dataKind:fixture?.dataKind||null,browser:engine,
  checks:[],screenshots:[],errors:[],notes:[
    'Application, CSS, reader and assets are the real checkout. Shell mounting is an isolated fixture, not production Firebase routing.',
    'Mock replies test transport and UI lifecycle only. No claim is made about model roleplay or legal answer quality.',
    'Viewport resizing does not replace testing a physical phone keyboard or iOS WebM alpha decoding.'
  ]};
await mkdir(out,{recursive:true});
let browser,stage='fixture-start',page;
const check=(name,detail={})=>report.checks.push({name,status:'passed',...detail});
async function idle(){await page.waitForFunction(()=>document.querySelector('#receptionAI')?.getAttribute('aria-busy')==='false');}
async function click(selector){await page.locator(selector).click();await idle();}
async function screenshot(name){await page.screenshot({path:path.join(out,name),fullPage:true,animations:'disabled'});report.screenshots.push(name);}
async function navigate(name){await click(`.rxa-mobile-nav [data-action="page"][data-page="${name}"]`);assert.equal(await page.locator('#receptionAI').getAttribute('data-page'),name);}
async function apiResponse(op,action){
  const waiting=page.waitForResponse(r=>r.url().endsWith('/api/reception')&&r.request().method()==='POST'&&r.request().postDataJSON()?.op===op);
  const [response]=await Promise.all([waiting,action()]);const payload=await response.json();
  assert.equal(payload.ok,true,`${op}: ${JSON.stringify(payload.error)}`);await idle();return payload.view;
}
async function noOverflow(label){
  const geometry=await page.evaluate(()=>{const content=document.querySelector('.rxa-page-content');return {width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,content:content?{width:content.clientWidth,scrollWidth:content.scrollWidth}:null};});
  assert.ok(geometry.document<=geometry.width+1&&geometry.body<=geometry.width+1,`${label}: ${JSON.stringify(geometry)}`);
  if(geometry.content)assert.ok(geometry.content.scrollWidth<=geometry.content.width+1,`${label}: page content overflow ${JSON.stringify(geometry)}`);
  check(`No horizontal overflow: ${label}`,geometry);
}
async function shellHidden(){assert.equal(await page.locator('nav.mobile-nav').isVisible(),false);}
async function phoneComposerVisible(label){
  const geometry=await page.evaluate(()=>{
    const field=document.querySelector('[data-message-draft]'),send=document.querySelector('[data-chat-form] button[type="submit"]'),nav=document.querySelector('.rxa-mobile-nav');
    const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const bounds=send.getBoundingClientRect(),hit=document.elementFromPoint(bounds.left+bounds.width/2,bounds.top+bounds.height/2);
    return {viewport:{width:innerWidth,height:innerHeight},field:rect(field),send:rect(send),nav:rect(nav),uncovered:hit===send||send.contains(hit)};
  });
  for(const key of ['field','send']){const bounds=geometry[key];assert.ok(bounds.width>=43.5&&bounds.height>=43.5&&bounds.top>=0&&bounds.bottom<=geometry.nav.top+1&&bounds.left>=0&&bounds.right<=geometry.viewport.width+1,`${label}: clipped ${key}: ${JSON.stringify(geometry)}`);}
  assert.equal(geometry.uncovered,true,`${label}: Send is covered`);check(`Composer above navigation: ${label}`,geometry);
}

try{
  if(fixture)await new Promise((resolve,reject)=>{fixture.server.once('error',reject);fixture.server.listen(0,'127.0.0.1',resolve);});
  const origin=external?new URL(external).origin:`http://127.0.0.1:${fixture.server.address().port}`;
  const health=await fetch(origin+'/__qa/health').then(async response=>response.ok?response.json():null);
  if(health?.provider!=='mock'||health?.fixture!==true)throw Error('Use scripts/reception-ai-workspace-qa.mjs as the --url server, or omit --url and provide --cases.');
  report.caseCount=health.caseCount;
  report.dataKind=health.dataKind;
  stage='browser-launch';
  const playwright=await import(moduleSpecifier);
  const executable=arg('--executable',undefined);
  browser=await playwright[engine].launch({headless:!process.argv.includes('--headed'),...(executable?{executablePath:executable}:{})});
  report.actualBrowser=true;
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',serviceWorkers:'block'});
  await context.addInitScript(()=>{
    if(location.origin==='null')return;
    const buildId=sessionStorage.getItem('qa.reception.release')||'a'.repeat(32);
    globalThis.__RUDN_RELEASE__={buildId,retention:'current-only',siteRoot:location.origin+'/',runtimeRoot:location.origin+'/',resources:{}};
  });
  page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin?route.continue():route.abort('blockedbyclient');});
  stage='lobby-and-bank';
  await page.goto(origin+'/__qa/reception.html',{waitUntil:'networkidle'});await idle();
  assert.equal(await page.locator('input[name="mode"][value="training"]').count(),1);
  assert.equal(await page.locator('input[name="mode"][value="independent"]').count(),1);
  const bank=page.locator('select[name="trainingCaseId"]'),level=page.locator('select[name="trainingLevel"]');
  assert.equal(await bank.count(),1);assert.equal(await level.count(),1);
  const allCases=await bank.locator('option').evaluateAll(nodes=>nodes.filter(n=>n.value).map(n=>n.value));
  assert.equal(allCases.length,report.caseCount);
  await level.selectOption('3');await idle();
  const choices=await bank.locator('option').evaluateAll(nodes=>nodes.filter(n=>n.value).map(n=>n.value));
  assert.ok(choices.length>0&&choices.length<allCases.length);
  await level.selectOption('');await idle();
  const selectedCase=allCases.includes('complaint-routing')?'complaint-routing':allCases[0];
  await bank.selectOption(selectedCase);await idle();await shellHidden();
  await screenshot('01-phone-lobby.png');check('Training/independent controls and the supplied catalog with a difficulty filter',{allCases:allCases.length,advancedCases:choices.length,dataKind:report.dataKind});
  let view=await apiResponse('start',()=>page.locator('[data-action="start"]').click());
  assert.equal(view.provider,'mock');assert.equal(view.mode,'training');
  assert.equal(view.case.id,selectedCase);const sessionId=view.id;
  stage='reception-and-unread';
  assert.equal(await page.locator('#receptionAI').getAttribute('data-page'),'reception');
  assert.equal((await page.locator('[data-chat-unread]').first().textContent()).trim(),'1');
  assert.deepEqual(await page.locator('.rxa-mobile-nav [data-action="page"]').evaluateAll(buttons=>buttons.map(button=>button.dataset.page)),['reception','chat','documents','calendar','decision']);
  await page.locator('[data-rxa-actor]').waitFor({state:'visible'});
  await page.waitForFunction(()=>{const image=document.querySelector('.rxa-citizen-poster');return image?.complete&&image.naturalWidth>0;});
  const video=page.locator('video[data-rxa-motion]');
  let videoStatus='poster fallback';
  if(await video.count()){
    try{await page.waitForFunction(()=>{const v=document.querySelector('video[data-rxa-motion]');return v&&!v.paused&&v.currentTime>0&&v.videoWidth>0;},null,{timeout:8000});videoStatus='decoded video playing';}
    catch{videoStatus='video exists; playback not confirmed';}
  }
  if(await page.locator('[data-rxa-motion-image]').count()){
    await page.waitForFunction(()=>{const img=document.querySelector('[data-rxa-motion-image]');return img?.complete&&img.naturalWidth>0;});
    videoStatus='animated WebP resource loaded';
  }
  check('Reception actor and initial unread badge',{videoStatus,animationClaim:videoStatus==='decoded video playing'});
  await screenshot('02-phone-reception.png');await noOverflow('reception 390');
  stage='chat-and-navigation';
  await navigate('chat');assert.equal(await page.locator('[data-chat-unread]').count(),0);
  await page.locator('[data-message-draft]').fill('Покажите, пожалуйста, документы по вашему обращению.');
  view=await apiResponse('message',()=>page.locator('[data-chat-form] button[type="submit"]').click());
  assert.ok(view.documents.length);const messageCount=view.messages.length;
  await page.locator('[data-message-draft]').fill('Уточню обстоятельства после чтения документа.');
  await screenshot('03-phone-chat.png');
  await navigate('documents');
  const openDocument=page.locator('[data-action="document"]').first();
  if(await openDocument.count()){await openDocument.click();await idle();assert.ok((await page.locator('.rxa-document-body').textContent()).trim());}
  await screenshot('04-phone-documents.png');
  stage='reader-citation';
  await click('[data-action="tab"][data-tab="sources"]');
  await page.locator('.rxa-source-record').evaluateAll(nodes=>nodes.forEach(node=>{node.open=true;}));
  const source=page.locator('a[data-source-reader]').first();
  if(await source.count()){
    await source.click();await page.locator('[data-source-reader-host] .rx-source-embedded [data-unit]').first().waitFor({state:'visible'});
    assert.equal(await page.locator('#receptionAI').getAttribute('data-page'),'documents');
    assert.equal(await page.locator('.rxa-mobile-nav').isVisible(),true);
    stage='desktop-source-reader';
    await page.setViewportSize({width:1280,height:900});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForFunction(()=>innerWidth===1280&&document.querySelector('.rx-source-embedded .ll-paper')?.clientHeight>0);
    const readerGeometry=await page.evaluate(async()=>{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const root=document.querySelector('#receptionAI'),paper=document.querySelector('.rx-source-embedded .ll-paper');
      const bounds=paper.getBoundingClientRect();
      paper.scrollTop=0;paper.scrollTop=Math.min(80,paper.scrollHeight-paper.clientHeight);
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const scrolled=paper.scrollTop;paper.scrollTop=0;
      const navigation=[...document.querySelectorAll('.rxa-mobile-nav [data-page]')].map(button=>{
        const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
        return {page:button.dataset.page,disabled:button.disabled,left:r.left,right:r.right,top:r.top,bottom:r.bottom,uncovered:hit===button||button.contains(hit)};
      });
      return {viewport:{width:innerWidth,height:innerHeight},rootHeight:root.clientHeight,paper:{height:paper.clientHeight,scrollHeight:paper.scrollHeight,top:bounds.top,bottom:bounds.bottom,overflowY:getComputedStyle(paper).overflowY,scrolled},navigation};
    });
    assert.ok(readerGeometry.paper.height>120&&readerGeometry.paper.height<readerGeometry.viewport.height,`Desktop reader has a bounded usable text surface: ${JSON.stringify(readerGeometry)}`);
    assert.ok(readerGeometry.paper.top>=0&&readerGeometry.paper.bottom<=readerGeometry.viewport.height+1,`Desktop text surface stays inside the viewport: ${JSON.stringify(readerGeometry)}`);
    assert.ok(readerGeometry.paper.scrollHeight>readerGeometry.paper.height+1&&readerGeometry.paper.scrolled>0&&['auto','scroll'].includes(readerGeometry.paper.overflowY),`Desktop text surface actually scrolls: ${JSON.stringify(readerGeometry)}`);
    assert.equal(readerGeometry.navigation.length,5);
    assert.ok(readerGeometry.navigation.every(button=>!button.disabled&&button.uncovered&&button.left>=0&&button.right<=1281&&button.top>=0&&button.bottom<=901),`Desktop reader keeps all five navigation targets reachable: ${JSON.stringify(readerGeometry)}`);
    await screenshot('05b-desktop-source-reader.png');
    check('Desktop 1280×900 source reader has bounded scrolling text and accessible navigation',readerGeometry);
    await page.setViewportSize({width:390,height:844});stage='reader-citation';
    await page.locator('.rx-source-embedded [data-unit]').first().click();
    await page.locator('[data-source-reference-tray]').waitFor({state:'visible'});
    await screenshot('05-phone-source-reference.png');
    await page.locator('[data-source-reference-use]').click();
    check('In-platform source reference selected');
  }else{throw Error('Documents page has no supported in-platform source link');}
  stage='calendar-and-draft';
  await navigate('decision');
  await page.locator('[data-decision="reasoning"]').fill('Факты сопоставлены с документами. Проверяю правовое основание и срок.');
  const reasoning=await page.locator('[data-decision="reasoning"]').inputValue();
  assert.equal(await page.locator('[data-calendar-workbench], [data-decision="deadline"]').count(),0);
  await click('[data-deadline-summary] [data-action="page"][data-page="calendar"]');
  assert.equal(await page.locator('#receptionAI').getAttribute('data-page'),'calendar');
  await page.locator('[data-calendar-workbench]').waitFor({state:'visible'});
  const anchor=page.locator('[data-calendar-action="anchor-event"]').first();
  if(await anchor.count())await anchor.click();
  const manualTools=page.locator('[data-calendar-details="tools"]');
  if(await manualTools.count()&&!await manualTools.evaluate(element=>element.open))await manualTools.locator(':scope > summary').click();
  if(!await anchor.count()){await page.locator('[data-calendar-input="anchor"]').fill(view.case.date);await page.locator('[data-calendar-input="anchor"]').dispatchEvent('change');}
  await page.locator('[data-calendar-action="step-day"]').click();
  await page.locator('[data-calendar-action="use-date"]').click();
  const deadline=await page.locator('[data-decision="deadline"]').inputValue();assert.match(deadline,/\d{4}-\d{2}-\d{2}/);
  await screenshot('06-phone-calendar.png');
  await navigate('chat');assert.equal(await page.locator('[data-message-draft]').inputValue(),'Уточню обстоятельства после чтения документа.');
  assert.equal(await page.locator('.rxa-message[data-message-id]').count(),messageCount);
  await navigate('decision');assert.equal(await page.locator('[data-decision="reasoning"]').inputValue(),reasoning);
  assert.equal(await page.locator('[data-deadline-summary] time').getAttribute('datetime'),deadline);
  await screenshot('07-phone-decision.png');
  await navigate('calendar');assert.equal(await page.locator('[data-decision="deadline"]').inputValue(),deadline);
  check('Five pages retain chat, decision and calendar drafts');
  stage='exit-and-return';
  await page.locator('header [data-action="exit"]').click();await page.locator('#qaReenter').waitFor({state:'visible'});
  assert.equal(await page.locator('nav.mobile-nav').isVisible(),true);
  await page.locator('#qaReenter').click();await idle();
  assert.equal(await page.locator('#receptionAI').getAttribute('data-page'),'calendar');
  assert.equal(await page.locator('[data-decision="deadline"]').inputValue(),deadline);
  await navigate('decision');assert.equal(await page.locator('[data-decision="reasoning"]').inputValue(),reasoning);
  assert.equal(await page.locator('[data-deadline-summary] time').getAttribute('datetime'),deadline);
  const saved=await page.evaluate(()=>Object.values(localStorage).map(value=>{try{return JSON.parse(value);}catch{return null;}}).filter(Boolean));
  assert.ok(saved.some(item=>item.sessionId===sessionId));await shellHidden();
  check('Exit restores platform navigation; return restores same shift and drafts');
  stage='phone-sizes';
  for(const [width,height] of [[320,740],[360,780],[390,844]]){
    await page.setViewportSize({width,height});
    const tabs=await page.locator('.rxa-mobile-nav [data-action="page"]').evaluateAll(buttons=>buttons.map(button=>{
      const rect=button.getBoundingClientRect(),label=button.lastElementChild;
      return {page:button.dataset.page,width:rect.width,height:rect.height,left:rect.left,right:rect.right,labelWidth:label.clientWidth,labelScroll:label.scrollWidth,icon:!!button.querySelector('.rxa-icon')};
    }));
    assert.equal(tabs.length,5);
    assert.ok(tabs.every(tab=>tab.width>=43.5&&tab.height>=43.5&&tab.left>=0&&tab.right<=width+1&&tab.labelScroll<=tab.labelWidth+1&&tab.icon),`Five accessible destinations at ${width}: ${JSON.stringify(tabs)}`);
    check(`Five navigation targets fit at ${width}`,{tabs});
    for(const name of ['reception','chat','documents','calendar','decision']){await navigate(name);await noOverflow(`${name} ${width}`);await shellHidden();if(name==='chat')await phoneComposerVisible(String(width));}
  }
  await page.setViewportSize({width:390,height:460});await navigate('chat');await page.locator('[data-message-draft]').focus();
  await noOverflow('short viewport 390×460');await phoneComposerVisible('short viewport 390×460');await screenshot('08-short-viewport-chat.png');
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});await navigate('reception');
  assert.equal(await page.locator('video[data-rxa-motion]').evaluateAll(videos=>videos.every(v=>v.paused)),true);
  check('Reduced motion pauses decorative video');
  stage='animated-webp-fallback';
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(()=>{
    const original=HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType=function(type){return String(type).includes('webm')?'':original.call(this,type);};
  });
  await page.reload({waitUntil:'networkidle'});await idle();await navigate('reception');
  await page.waitForFunction(()=>{const img=document.querySelector('[data-rxa-motion-image]');return img?.complete&&img.naturalWidth>0&&img.closest('[data-rxa-motion-ready]');});
  assert.equal(await page.locator('video[data-rxa-motion][src]').count(),0);
  const fallback=await page.evaluate(async()=>{
    const image=document.querySelector('[data-rxa-motion-image]'),buffer=await fetch(image.src).then(r=>r.arrayBuffer()),bytes=new Uint8Array(buffer),data=new DataView(buffer);
    const text=(at,size)=>String.fromCharCode(...bytes.slice(at,at+size));let frames=0,loop=null,duration=0;
    for(let at=12;at+8<=bytes.length;){const type=text(at,4),size=data.getUint32(at+4,true);if(at+8+size>bytes.length)break;if(type==='ANMF'&&size>=16){frames++;duration+=bytes[at+20]+256*bytes[at+21]+65536*bytes[at+22];}if(type==='ANIM'&&size>=6)loop=data.getUint16(at+12,true);at+=8+size+(size%2);}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');context.drawImage(image,0,0,1,1,0,0,1,1);
    return {header:text(0,4),format:text(8,4),frames,loop,duration,width:image.naturalWidth,bytes:bytes.length,cornerAlpha:context.getImageData(0,0,1,1).data[3]};
  });
  assert.equal(fallback.header,'RIFF');assert.equal(fallback.format,'WEBP');assert.equal(fallback.frames,120);assert.equal(fallback.width,320);assert.equal(fallback.loop,0);
  assert.ok(fallback.duration>=9500&&fallback.duration<=10500,'The fallback preserves the original loop duration');
  assert.ok(fallback.cornerAlpha<32,'The decoded WebP preserves the transparent background');
  check('Unsupported VP9 loads the transparent animated WebP asset',{...fallback,framePlaybackObserved:false});
  await screenshot('09-phone-webp-fallback.png');
  await navigate('chat');assert.equal(await page.locator('[data-rxa-motion-image][src]').count(),0);
  await navigate('reception');await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>!document.querySelector('[data-rxa-motion-image][src]'));
  check('Leaving reception and reduced motion release the image animation');
  stage='retired-unfinished-session';
  await page.evaluate(()=>sessionStorage.setItem('qa.reception.release','b'.repeat(32)));
  await page.reload({waitUntil:'networkidle'});await idle();
  await page.locator('[data-action="start"]').waitFor();
  assert.equal(await page.locator('.rxa-mobile-nav [data-page="chat"]').isDisabled(),true);
  assert.equal(await page.locator('[data-action="resume-session"]').count(),0);
  assert.ok((await page.locator('#receptionAI').innerText()).includes('результаты завершённых смен сохранены'));
  const fresh=await apiResponse('start',()=>page.locator('[data-action="start"]').click());
  assert.notEqual(fresh.id,sessionId);assert.equal(fresh.buildId,'b'.repeat(32));
  check('A new release retires the old unfinished local and server session and starts a fresh game');
  await screenshot('10-phone-current-release.png');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure={stage,message:error.message};if(page)try{await screenshot('failure.png');}catch{}}
finally{
  await browser?.close();if(fixture)await new Promise(resolve=>fixture.server.listening?fixture.server.close(resolve):resolve());
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({status:report.status,stage,checks:report.checks.length,report:path.join(out,'report.json'),failure:report.failure}));
if(report.status!=='passed')process.exitCode=1;
