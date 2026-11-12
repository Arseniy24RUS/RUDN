#!/usr/bin/env node
/**
 * Local browser acceptance test for the reception messenger and full case bank.
 * This script only accepts a loopback server and refuses to send a message
 * unless that server has explicitly returned provider:"mock".
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const args=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
if(args.includes('--help')){
  console.log(`Usage:
  node scripts/test-reception-ai-browser.mjs [--url http://127.0.0.1:8787]
    [--playwright-module /absolute/path/to/playwright/index.mjs]
    [--browser chromium|webkit] [--executable /absolute/path/to/browser]
    [--headed] [--out /absolute/path]

Start scripts/reception-ai-dev.mjs with --provider mock first.
Playwright is loaded from the project, or from --playwright-module /
RECEPTION_PLAYWRIGHT_MODULE. This test never starts a server or calls OpenAI.
Screenshots and a factual JSON report are saved only when the test is run.`);
  process.exit(0);
}
const base=new URL(arg('--url','http://127.0.0.1:8787'));
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.protocol!=='http:'||base.username||base.password||base.search||base.hash){
  throw new Error('Browser QA only accepts an unauthenticated HTTP loopback server URL.');
}
const origin=base.origin;
const engine=arg('--browser','chromium');
if(!['chromium','webkit'].includes(engine)) throw new Error('Use --browser chromium or --browser webkit.');
const out=path.resolve(arg('--out',path.join(os.tmpdir(),`rudn-reception-ai-browser-${new Date().toISOString().replace(/[:.]/g,'-')}`)));
const moduleInput=arg('--playwright-module',process.env.RECEPTION_PLAYWRIGHT_MODULE);
const moduleSpecifier=moduleInput?(moduleInput.startsWith('file:')?moduleInput:pathToFileURL(path.resolve(moduleInput)).href):'playwright';
const report={suite:'reception-ai-browser',startedAt:new Date().toISOString(),base:origin,provider:null,browser:engine,status:'running',
  checks:[],screenshots:[],browserErrors:[],failedRequests:[],note:'Mock transport integration; this does not evaluate GPT-6 Luna roleplay or legal answer quality.'};
let browser,context,page,stage='load-playwright',mockConfirmed=false,holdNextMessage=false,messageGate,releaseHeldMessage;
const check=(name,details={})=>report.checks.push({name,status:'passed',...details});
await mkdir(out,{recursive:true});
async function idle(){
  await page.waitForFunction(()=>document.querySelector('#receptionAI')?.getAttribute('aria-busy')==='false');
}
async function responseFor(operation,action){
  const waiting=page.waitForResponse(response=>{
    try{return new URL(response.url()).pathname==='/api/reception'&&response.request().method()==='POST'
      &&response.request().postDataJSON()?.op===operation;}catch{return false;}
  });
  const [response]=await Promise.all([waiting,action()]);
  const packet=await response.json();
  assert.equal(response.ok(),true,`${operation}: HTTP ${response.status()}`);
  assert.equal(packet.ok,true,`${operation}: ${packet.error?.code||'invalid envelope'}`);
  await idle();return packet.view;
}
async function screenshot(name){
  const filename=path.join(out,name);
  await page.screenshot({path:filename,fullPage:true,animations:'disabled'});
  report.screenshots.push(name);
}
async function noOverflow(label){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(dimensions.document<=dimensions.viewport+1,`${label}: page overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.body<=dimensions.viewport+1,`${label}: body overflow ${JSON.stringify(dimensions)}`);
  check(`no-horizontal-overflow-${label}`,dimensions);
}
async function touchTargets(label){
  const sizes=await page.locator('#receptionAI button, #receptionAI select, #receptionAI textarea, #receptionAI input:not([type=radio]):not([type=checkbox]), #receptionAI summary, #receptionAI label.rxa-choice, #receptionAI a.rxa-btn').evaluateAll(elements=>elements.map(element=>{
    const r=element.getBoundingClientRect(),style=getComputedStyle(element);
    return {tag:element.tagName,action:element.getAttribute('data-action')||element.getAttribute('data-decision')||element.getAttribute('aria-label')||element.textContent.trim().slice(0,60),width:r.width,height:r.height,visible:r.width>0&&r.height>0&&style.visibility!=='hidden'};
  }).filter(item=>item.visible));
  const small=sizes.filter(item=>item.width<43.5||item.height<43.5);
  assert.equal(small.length,0,`${label}: touch targets below 44 CSS px: ${JSON.stringify(small)}`);
  check(`touch-targets-${label}`,{count:sizes.length,minimumCssPixels:44,inlineTextLinksExcluded:true});
}
async function phoneComposerVisible(label){
  const geometry=await page.evaluate(()=>{
    const field=document.querySelector('[data-message-draft]'),send=document.querySelector('[data-chat-form] button[type=submit]');
    const bounds=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const sendBounds=send.getBoundingClientRect(),hit=document.elementFromPoint(sendBounds.left+sendBounds.width/2,sendBounds.top+sendBounds.height/2);
    return {viewport:{width:innerWidth,height:innerHeight},field:bounds(field),send:bounds(send),sendUncovered:send===hit||send.contains(hit)};
  });
  for(const key of ['field','send']){const r=geometry[key];assert.ok(r.width>0&&r.height>=43.5&&r.top>=-1&&r.left>=-1&&r.bottom<=geometry.viewport.height+1&&r.right<=geometry.viewport.width+1,`${label}: ${key} is clipped: ${JSON.stringify(geometry)}`);}
  assert.equal(geometry.sendUncovered,true,`${label}: another element covers Send`);
  check(`composer-visible-${label}`,{...geometry,physicalKeyboard:false});
}
async function send(text){
  assert.equal(mockConfirmed,true,'Refusing to send a question without a verified mock provider');
  await page.locator('[data-message-draft]').fill(text);
  return responseFor('message',()=>page.locator('[data-chat-form] button[type=submit]').click());
}
async function immersiveCopy(){
  const text=await page.locator('#receptionAI').innerText();
  assert.doesNotMatch(text,/\b(?:GPT(?:[-‑\s]?6)?|OpenAI|mock|LLM|AI|API)\b|искусственн\w*\s+интеллект|демонстрационн\w*\s+(?:ответ|режим|провайдер)|\bИИ\b|人工智能/iu);
  assert.equal(await page.locator('[data-mode], [data-action=legacy], [data-rxa-entry], .rxa-demo').count(),0);
}

try{
  const imported=await import(moduleSpecifier);
  const playwright=imported.chromium?imported:imported.default;
  assert.ok(playwright?.[engine],`The supplied module does not export Playwright ${engine}`);
  stage='launch-browser';
  const executable=arg('--executable',(engine==='chromium'?process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:undefined));
  browser=await playwright[engine].launch({headless:!args.includes('--headed'),...(executable?{executablePath:path.resolve(executable)}:{})});
  context=await browser.newContext({viewport:{width:1365,height:1000},locale:'ru-RU',serviceWorkers:'block'});
  page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
  page.on('pageerror',error=>report.browserErrors.push(String(error.message).slice(0,500)));
  page.on('requestfailed',request=>report.failedRequests.push({path:new URL(request.url()).pathname,code:request.failure()?.errorText||'unknown'}));
  // Guard independently of the test steps: a non-mock backend can never receive
  // a message from this test, even if a future edit reorders its actions.
  await page.route('**/api/reception',async route=>{
    const body=route.request().postDataJSON();
    if(body?.op==='message'&&!mockConfirmed){await route.abort('blockedbyclient');return;}
    if(body?.op==='message'&&holdNextMessage){holdNextMessage=false;await messageGate;}
    await route.continue();
  });

  stage='fresh-training-session';
  await page.goto(`${origin}/apps/reception/ai-demo.html?lang=ru`,{waitUntil:'domcontentloaded'});
  await page.locator('[data-action=start]').waitFor({state:'visible'});
  await immersiveCopy();
  let view=await responseFor('start',()=>page.locator('[data-action=start]').click());
  assert.equal(view.provider,'mock','Stop the server and restart it with --provider mock. No message was sent.');
  mockConfirmed=true;report.provider='mock';
  assert.equal(view.mode,'training');assert.equal(view.caseCount,1);assert.equal(view.status,'active');
  assert.ok(view.messages.length>=1,'The authored opening is present');
  const sessionId=view.id;
  for(const key of ['rubric','actor','facts','correctProcedure','correctRoutes','requiredFactIds'])assert.equal(Object.hasOwn(view.case,key),false,`Private ${key} in browser case`);
  await immersiveCopy();
  await page.locator('[data-rxa-actor]').waitFor({state:'visible'});
  await page.waitForFunction(()=>{const image=document.querySelector('img.rxa-citizen-poster');return image?.complete&&image.naturalWidth>0;});
  assert.ok(await page.locator('[data-rxa-actor]').getAttribute('data-rxa-actor'));
  check('direct-entry-and-authored-opening',{caseCount:view.caseCount,privateKeysAbsent:true,portraitLoaded:true,modeSelector:false});

  stage='conversation-and-document-request';
  const question='Здравствуйте! Расскажите, пожалуйста, что произошло и когда вы обращались.';
  messageGate=new Promise(resolve=>{releaseHeldMessage=resolve;});holdNextMessage=true;
  const pendingSend=send(question);
  pendingSend.catch(()=>{}); // A later assertion may close the page before this response.
  await page.locator('[data-typing]').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-pending-message]').count(),1);
  assert.equal(await page.locator('[data-pending-message] [data-delivery-state=pending]').count(),1);
  assert.equal(await page.locator('[data-pending-message] [data-delivery-state=sent]').count(),0);
  await screenshot('00-message-sending.png');releaseHeldMessage();view=await pendingSend;releaseHeldMessage=null;
  assert.ok(view.messages.some(message=>message.role==='user'&&message.text===question));
  assert.equal(view.messages.at(-1).role,'assistant');
  assert.equal(await page.locator('[data-pending-message], [data-typing]').count(),0);
  assert.ok(await page.locator('[data-delivery-state=sent]').count()>0);
  assert.ok(await page.locator('.rxa-message time[datetime]').count()>0);
  await screenshot('01-desktop-conversation.png');
  view=await send('Покажите, пожалуйста, документы, которые подтверждают ваши слова.');
  assert.ok(view.documents.length>0,'The mock document request must make at least one document available');
  const userCount=view.messages.filter(message=>message.role==='user').length;
  assert.equal(userCount,2);check('chat-and-document-request',{messages:view.messages.length,availableDocuments:view.documents.length});

  stage='open-document-and-sources';
  await page.locator('[data-action=tab][data-tab=documents]').click();
  const firstDocumentId=await page.locator('.rxa-document-list [data-action=document]').first().getAttribute('data-id');
  view=await responseFor('document',()=>page.locator('.rxa-document-list [data-action=document]').first().click());
  assert.ok(view.openedDocumentIds.includes(firstDocumentId));
  assert.ok((await page.locator('.rxa-document-body').innerText()).trim().length>20);
  assert.equal(await page.locator('.rxa-message-enter[data-message-id]').count(),0,'Document navigation does not replay conversation animations');
  await screenshot('02-desktop-document.png');
  await page.locator('[data-action=tab][data-tab=sources]').click();
  const sourceLinks=await page.locator('.rxa-source-links a').evaluateAll(links=>links.map(link=>({href:link.href,target:link.target,rel:link.rel})));
  assert.ok(sourceLinks.length>0);
  assert.ok(sourceLinks.every(link=>/^https?:\/\//.test(link.href)&&link.target==='_blank'&&link.rel.includes('noopener')));
  assert.equal(await page.locator('[data-message-draft]').isVisible(),true,'Chat remains accessible while inspecting sources');
  check('documents-and-source-links',{openedDocuments:view.openedDocumentIds.length,sourceLinks:sourceLinks.length,externalSourcesVisited:false});

  stage='decision-draft-and-reload';
  await page.locator('[data-action=tab][data-tab=decision]').click();
  if(view.case.assessment)await page.locator('[data-decision-form] details').evaluateAll(nodes=>nodes.forEach(node=>{node.open=true;}));
  const procedure=page.locator('[data-decision=procedureId]').first(),route=page.locator('[data-decision=routeId]').first();
  const procedureId=await procedure.inputValue(),routeId=await route.inputValue();
  await procedure.check();await route.check();
  await page.locator('[data-decision=actionIds]').first().check();
  await page.locator('[data-decision="law.number"]').fill('59');
  await page.locator('[data-decision="law.article"]').fill('8');
  await page.locator('[data-decision=deadline]').fill(view.case.date||'2026-11-11');
  await page.locator('[data-decision=basisDocumentIds]').first().check();
  if(view.case.assessment){
    for(const field of ['factId','applicationId','trapId'])await page.locator(`[data-decision="assessment.${field}"]`).first().check();
    await page.locator('[data-decision="assessment.actDate"]').fill('2000-01-01');
    for(const field of ['anchor','rule','start','shift'])await page.locator(`[data-decision="assessment.calendar.${field}"]`).first().check();
    const record=view.case.assessment.research.records[0],fragment=record.fragments[0];
    await page.locator('[data-decision="assessment.research.recordId"]').selectOption(record.id);
    await page.locator('[data-decision="assessment.research.fragmentId"]').selectOption(fragment.id);
    await page.locator('[data-decision="assessment.research.extracted"]').fill('Учебное извлечение из источника');
    await page.locator('[data-decision="assessment.research.finding"]').first().check();
    assert.ok((await page.locator('.rxa-selected-fragment').innerText()).trim().length>0);
    check('authored-assessment-fields-and-fragment-preview',{blocks:await page.locator('.rxa-assessment-block').count(),correctAnswersUsed:false});
  }
  const reasoning='Учебная проверка интерфейса: сопоставляю факты, документы и выбранную норму.';
  const unsent='Хочу уточнить ещё одно обстоятельство перед решением.';
  await page.locator('[data-decision=reasoning]').fill(reasoning);
  await page.locator('[data-message-draft]').fill(unsent);
  view=await responseFor('resume',()=>page.reload({waitUntil:'domcontentloaded'}));
  assert.equal(view.id,sessionId);assert.equal(view.messages.filter(message=>message.role==='user').length,userCount);
  assert.equal(await page.locator('[data-message-draft]').inputValue(),unsent);
  assert.equal(await page.locator('[data-decision=reasoning]').inputValue(),reasoning);
  assert.equal(await page.locator('[data-decision=procedureId]:checked').inputValue(),procedureId);
  assert.equal(await page.locator('[data-decision=routeId]:checked').inputValue(),routeId);
  assert.equal(await page.locator('[data-decision="law.number"]').inputValue(),'59');
  assert.equal(await page.locator('.rxa-message-enter[data-message-id]').count(),0,'Restoring history does not animate old messages');
  check('reload-restores-session-and-unsent-drafts',{sameSession:true,duplicateMessages:0});

  stage='languages';
  for(const language of ['en','zh','ru']){
    view=await responseFor('locale',()=>page.locator('[data-language]').selectOption(language));
    assert.equal(view.locale,language);assert.equal(await page.locator('#receptionAI').getAttribute('lang'),language);
    await immersiveCopy();
    assert.equal(await page.locator('[data-message-draft]').inputValue(),unsent);
    assert.equal(await page.locator('[data-decision=reasoning]').inputValue(),reasoning);
    await noOverflow(`desktop-${language}`);
    if(language!=='ru')await screenshot(`03-desktop-${language}.png`);
  }
  check('ru-en-zh-locale-switch-preserves-answers');

  stage='reduced-motion';
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('video[data-rxa-motion]')).every(video=>video.paused));
  view=await send('Спасибо за пояснение.');
  const reducedAnimation=await page.locator('.rxa-message[data-message-id]').last().evaluate(element=>getComputedStyle(element).animationDuration);
  assert.ok(reducedAnimation.split(',').every(value=>parseFloat(value)<=0.01),'Reduced motion disables decorative message animation');
  await page.locator('[data-message-draft]').fill(unsent);
  await page.emulateMedia({reducedMotion:'no-preference'});
  check('reduced-motion-pauses-character-and-message-animation');

  stage='phone-viewports';
  const phoneTranscript=await page.locator('.rxa-message[data-message-id]').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.messageId,text:node.textContent})));
  for(const [width,height] of [[320,740],[360,780],[390,844]]){
    await page.setViewportSize({width,height});
    assert.equal(await page.locator('.rxa-mobile-nav').isVisible(),true);
    await page.locator('.rxa-mobile-nav [data-action=chat]').click();
    assert.equal(await page.locator('#receptionAI').getAttribute('data-mobile-pane'),'chat');
    assert.equal(await page.locator('.rxa-conversation').isVisible(),true);assert.equal(await page.locator('.rxa-desk').isVisible(),false);
    assert.equal(await page.locator('[data-message-draft]').evaluate(element=>document.activeElement===element),true);
    await noOverflow(`phone-${width}-chat`);await touchTargets(`phone-${width}-chat`);await phoneComposerVisible(`phone-${width}`);
    await screenshot(`04-phone-${width}-chat.png`);
    for(const panel of ['documents','sources','decision']){
      await page.locator(`.rxa-mobile-nav [data-action=workspace][data-panel=${panel}]`).click();
      assert.equal(await page.locator('#receptionAI').getAttribute('data-mobile-pane'),'desk');
      assert.equal(await page.locator('.rxa-desk').isVisible(),true);assert.equal(await page.locator('.rxa-conversation').isVisible(),false);
      assert.equal(await page.locator(`#rxaTab-${panel}`).getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('[data-message-draft]').inputValue(),unsent);
      assert.deepEqual(await page.locator('.rxa-message[data-message-id]').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.messageId,text:node.textContent}))),phoneTranscript);
      assert.equal(await page.locator('.rxa-message-enter[data-message-id]').count(),0);
      await noOverflow(`phone-${width}-${panel}`);await touchTargets(`phone-${width}-${panel}`);
    }
    assert.equal(await page.locator('[data-decision=reasoning]').inputValue(),reasoning);
    assert.equal(await page.locator('[data-decision=procedureId]:checked').inputValue(),procedureId);
    if(width===390)await screenshot('04-phone-390-decision.png');
    await page.locator('.rxa-mobile-nav [data-action=chat]').click();
    assert.equal(await page.locator('[data-message-draft]').inputValue(),unsent);
    check(`phone-navigation-${width}`,{width,height,draftPreserved:true,transcriptPreserved:true,physicalDevice:false});
  }
  stage='phone-short-viewport';
  await page.setViewportSize({width:390,height:460});
  await page.locator('.rxa-mobile-nav [data-action=chat]').click();await page.locator('[data-message-draft]').focus();
  await noOverflow('phone-short-viewport');await touchTargets('phone-short-viewport');await phoneComposerVisible('phone-short-viewport');
  await screenshot('04-phone-short-viewport.png');
  check('phone-short-viewport',{width:390,height:460,physicalIME:false,note:'Reduced CSS viewport only; native keyboards require a phone check.'});

  stage='submit-training-decision';
  await page.setViewportSize({width:390,height:844});
  await page.locator('.rxa-mobile-nav [data-action=workspace][data-panel=decision]').click();
  await page.locator('[data-decision-form] button[type=submit]').click();
  await page.locator('#rxaConfirmTitle').waitFor({state:'visible'});
  view=await responseFor('decide',()=>page.locator('[data-action=confirm-decision]').click());
  if(view.status==='followup'){
    assert.equal(view.feedback,null,'Initial grading stays hidden until follow-up');
    assert.equal(await page.locator('[data-decision-form], [data-chat-form], [data-action=next]').count(),0);
    assert.ok((await page.locator('.rxa-followup-intro').innerText()).trim().length>0);
    await noOverflow('phone-followup');await touchTargets('phone-followup');await screenshot('05-phone-followup.png');
    await page.locator('[data-followup-choice]').first().check();
    view=await responseFor('followup',()=>page.locator('[data-followup-form] button[type=submit]').click());
    check('followup-is-required-before-feedback-and-next',{phone:true});
  }
  assert.equal(view.status,'review');assert.ok(view.feedback);assert.ok(Array.isArray(view.feedback.criteria));
  assert.ok(Number.isFinite(view.feedback.score)&&view.feedback.score>=0&&view.feedback.score<=100);
  assert.equal(view.decision.reasoning,reasoning);
  assert.equal(await page.locator('[data-message-draft]').count(),0,'Finalized case cannot accept a new message');
  await noOverflow('phone-review');await touchTargets('phone-review');
  await screenshot('05-training-review.png');
  check('server-grades-submitted-training-decision',{serverScore:view.feedback.score,perfectScoreExpected:false});

  stage='complete-training';
  view=await responseFor('next',()=>page.locator('[data-action=next]').click());
  assert.equal(view.status,'complete');assert.equal(view.result.journalStatus,'local');assert.equal(view.result.maxPoints,5);
  assert.ok((await page.locator('.rxa-journal').innerText()).trim().length>0);await immersiveCopy();
  await noOverflow('phone-complete');await touchTargets('phone-complete');
  await screenshot('06-training-complete.png');
  assert.equal(report.browserErrors.length,0,`Browser errors: ${report.browserErrors.join('; ')}`);
  const expectedMediaAbort=request=>/\/assets\/gfx1\/motion\/(?:C\d{2}|S\d{2})\.webm$/.test(request.path)&&request.code==='net::ERR_ABORTED';
  report.expectedMediaCancellations=report.failedRequests.filter(expectedMediaAbort);
  const criticalRequests=report.failedRequests.filter(request=>!request.path.endsWith('/favicon.ico')&&!expectedMediaAbort(request));
  assert.equal(criticalRequests.length,0,`Failed requests: ${JSON.stringify(criticalRequests)}`);
  check('completion-is-local-and-has-no-browser-errors');
  report.status='passed';
}catch(error){
  report.status='failed';report.failure={stage,name:error.name,message:String(error.message).slice(0,2000)};
  if(page)try{await screenshot('failure.png');}catch{/* A launch failure cannot produce a browser screenshot. */}
  process.exitCode=1;
}finally{
  releaseHeldMessage?.();
  await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
  report.finishedAt=new Date().toISOString();
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,report:path.join(out,'report.json'),failure:report.failure||undefined},null,2));
}
