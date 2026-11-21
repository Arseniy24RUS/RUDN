#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';
import {SYNTHETIC_VERSION} from './reception-ai-qa-cases.mjs';
import {executionQAProfiles} from './reception-execution-qa.mjs';
import {hash} from '../firebase/functions/reception-ai/schema.mjs';
import {SEMINAR_STORY_VERSION, SEMINAR_STORY_PROGRESS_KEY} from '../firebase/functions/reception-ai/seminar-stories.mjs';

const option=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const caseId='ads-consent';
const casesDirectory=option('--cases',process.env.RECEPTION_AI_CASES_DIR);
assert.ok(casesDirectory,'Provide --cases <bank directory> or RECEPTION_AI_CASES_DIR.');
const output=path.resolve(option('--out',path.join(os.tmpdir(),'reception-mentor-chat-browser')));
await mkdir(output,{recursive:true});
const modulePath=option('--playwright-module',process.env.RECEPTION_PLAYWRIGHT_MODULE);
const browsers=await import(modulePath?pathToFileURL(path.resolve(modulePath)).href:'playwright');
const original=JSON.parse(await readFile(path.join(casesDirectory,caseId+'.json'),'utf8'));
const synthetic=original.version===SYNTHETIC_VERSION;
const authoredActor='C07';
const report=[];
const viewports=[
  {width:320,height:568,isMobile:true},
  {width:360,height:800,isMobile:true},
  {width:390,height:844,isMobile:true},
  {width:393,height:852,isMobile:true},
  {width:412,height:915,isMobile:true},
  {width:430,height:932,isMobile:true},
  {width:844,height:390,isMobile:true},
  {width:1440,height:900,isMobile:false},
];
const citizenQuestion='Какие материалы вы сохранили перед тем, как пришли в приёмную?';
const citizenReply='У меня сохранились снимки сообщений со скидками и моего отказа от рассылки.';
const mentorQuestion='Как проверить, что номер передал именно магазин, если у меня пока только сообщения?';
const mentorReply='Сопоставьте переписку и документы. Факт получения рекламы и источник передачи номера требуют разных подтверждений.';
const followupQuestion='Изменится ли расчёт, если заявление зарегистрировали только на следующий день?';
const followupReply='Различайте дату поступления и дату регистрации. Проверьте, к какому событию привязан каждый срок в календаре.';

async function checkHeader(root) {
  const header=root.locator('.rxa-top');
  await header.waitFor();
  const geometry=await header.evaluate(node=>{
    const layout=node.getBoundingClientRect(),brand=node.querySelector('.rxa-brand');
    const elements=[brand,...node.querySelectorAll('.rxa-top-actions button,.rxa-top-actions summary')]
      .filter(item=>item?.getClientRects().length);
    const items=elements.map(item=>{
      const area=item.getBoundingClientRect();
      return {label:item.getAttribute('aria-label')||item.textContent.trim()||item.dataset.action,
        left:area.left,right:area.right,top:area.top,bottom:area.bottom};
    });
    const outside=items.filter(item=>item.left<Math.max(0,layout.left)-1||item.right>Math.min(innerWidth,layout.right)+1||
      item.top<layout.top-1||item.bottom>layout.bottom+1).map(item=>item.label);
    const overlaps=[];
    for(const [index,item] of items.entries())for(const other of items.slice(index+1)){
      if(Math.min(item.right,other.right)-Math.max(item.left,other.left)>2&&
        Math.min(item.bottom,other.bottom)-Math.max(item.top,other.top)>2)overlaps.push([item.label,other.label]);
    }
    return {outside,overlaps,brandOverflow:brand?brand.scrollWidth-brand.clientWidth:0};
  });
  assert.deepEqual(geometry.outside,[]);
  assert.deepEqual(geometry.overlaps,[]);
  assert.ok(geometry.brandOverflow<=1,JSON.stringify(geometry));
  return geometry;
}

async function run(browser,engine,size,stage,fixtureDirectory) {
  const key=`${engine}-${size.width}x${size.height}-${stage}`;
  const evidence={engine,stage,viewport:{width:size.width,height:size.height},status:'running',checks:[],screenshots:[]};
  report.push(evidence);
  const calls=[];
  let resolveMentor, resolveCitizen;
  const mentorDelay=new Promise(resolve=>{resolveMentor=resolve;});
  const citizenDelay=new Promise(resolve=>{resolveCitizen=resolve;});
  const provider={
    name:'mock',
    async generate(input){
      assert.equal(input.text,citizenQuestion);
      calls.push({op:'message',text:input.text});
      await citizenDelay;
      return {reply:citizenReply,revealedFactIds:[],releasedDocumentIds:[],usage:{inputTokens:0,outputTokens:0}};
    },
    async answerMentor(input){
      const followup=input.text===followupQuestion;
      assert.equal(input.text,followup?followupQuestion:mentorQuestion);
      assert.deepEqual(input.history,followup?[{role:'user',text:mentorQuestion},{role:'assistant',text:mentorReply}]:[]);
      if(followup)assert.equal(input.guide.workspacePage,'calendar');
      calls.push({op:'mentor-question',text:input.text});
      await mentorDelay;
      return {reply:followup?followupReply:mentorReply,usage:{inputTokens:0,outputTokens:0}};
    },
    async reviewDecision(){assert.fail('The chat UI test does not request grading.');},
  };
  const fixture=await createReceptionFixture({casesDirectory:fixtureDirectory,caseIds:[caseId],provider,
    decisionVersion:'correspondence-v1',controlVersion:'execution-v1',coreStepsVersion:'mfc-referral-v2',
    seminarStoryVersion:SEMINAR_STORY_VERSION,serviceOptions:{requireGameplay:true,guidedSeminarCore:true,
      requireCurrentSeminarTraining:true,...(synthetic?{correspondenceProfiles:executionQAProfiles}:{})}});
  await fixture.store.transaction('seminarProgress/'+hash('student:'+fixture.identity.studentKey),()=>({
    [SEMINAR_STORY_PROGRESS_KEY]:{example:{completed:true},...(stage==='independent'?{mentor:{completed:true}}:{})},
  }));
  await new Promise((resolve,reject)=>{fixture.server.once('error',reject);fixture.server.listen(0,'127.0.0.1',resolve);});
  const context=await browser.newContext({viewport:{width:size.width,height:size.height},
    isMobile:size.isMobile,hasTouch:size.isMobile,serviceWorkers:'block'});
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  const origin='http://127.0.0.1:'+fixture.server.address().port;
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const root=page.locator('#receptionAI');
  const nav=name=>root.locator(`.rxa-mobile-nav [data-page="${name}"]`);
  const welcome=root.locator('[data-mentor-welcome]');
  const chats=root.locator('[data-chat-dialogs]');
  const toolbar=root.locator('.rxa-chat-toolbar');
  const citizenTab=chats.locator('[data-chat-dialog="citizen"]');
  const mentorTab=chats.locator('[data-chat-dialog="mentor"]');
  const citizenLog=root.locator('.rxa-messages[role="log"]:not([data-mentor-messages])');
  const mentorChat=root.locator('[data-mentor-conversation]');
  const mentorLog=mentorChat.locator('[data-mentor-messages][role="log"]');
  const mentorForm=mentorChat.locator('[data-mentor-form]');
  const citizenForm=root.locator('[data-chat-form]');
  const citizenChat=root.locator('#rxaConversation');
  const returnToCase=toolbar.locator('[data-action="mentor-return"]');
  const mentorUI='[data-mentor-welcome],[data-mentor-conversation],[data-chat-dialog="mentor"],[data-mentor-draft],'+
    '[data-action="mentor-toggle"],[data-action="mentor-open-chat"],[data-mentor-greeting],.rxa-tour-toggle';
  const responseFor=op=>page.waitForResponse(response=>response.url()===origin+'/api/reception'&&
    response.request().method()==='POST'&&response.request().postDataJSON()?.op===op);
  async function receipt(waiting) {
    const response=await waiting;
    const body=await response.json();
    assert.equal(response.ok(),true,JSON.stringify(body.error));
    await page.locator('#receptionAI[aria-busy="false"]').waitFor();
    return body.view;
  }
  async function shot(name) {
    const filename=key+'-'+name+'.png';
    await page.screenshot({path:path.join(output,filename),animations:'disabled'});
    evidence.screenshots.push(filename);
  }
  async function checkContactLabels() {
    const layout=await toolbar.evaluate(async node=>{
      await document.fonts.ready;
      return {
        height:node.getBoundingClientRect().height,
        labels:[...node.querySelectorAll('[data-chat-dialog] :is(strong,small)')].map(label=>{
          const text=document.createRange();
          text.selectNodeContents(label);
          return {value:label.textContent,visible:label.getBoundingClientRect().width,
            needed:text.getBoundingClientRect().width,lines:text.getClientRects().length};
        })
      };
    });
    assert.ok(layout.height<=(size.width<=430?60:64),JSON.stringify(layout));
    assert.equal(layout.labels.length,4);
    for(const label of layout.labels){
      assert.equal(label.lines,1,JSON.stringify(label));
      assert.ok(label.visible+1>=label.needed,JSON.stringify(label));
    }
    if(size.width<=430){
      const title=await root.locator('.rxa-brand-copy strong').evaluate(label=>{
        const text=document.createRange();
        text.selectNodeContents(label);
        return {visible:label.getBoundingClientRect().width,needed:text.getBoundingClientRect().width,
          lines:text.getClientRects().length};
      });
      assert.equal(title.lines,1,JSON.stringify(title));
      assert.ok(title.visible+1>=title.needed,JSON.stringify(title));
    }
  }
  async function seeCitizen({withTabs=true}={}) {
    await citizenLog.waitFor();
    assert.equal(await mentorChat.count(),0);
    if(withTabs){
      await checkContactLabels();
      assert.equal(await citizenChat.locator('.rxa-person,.rxa-presence').count(),0);
      assert.ok(await citizenChat.getAttribute('aria-labelledby'));
      await toolbar.locator('.rxa-chat-menu summary').waitFor();
      await citizenTab.locator('[data-rxa-chat-actor]').waitFor();
      assert.equal(await citizenTab.getAttribute('aria-pressed'),'true');
      assert.equal(await mentorTab.getAttribute('aria-pressed'),'false');
    }else{
      assert.equal(await toolbar.count(),0);
      await citizenChat.locator('.rxa-person .rxa-presence').getByText('На связи',{exact:true}).waitFor();
    }
    assert.equal(await citizenLog.getByText(mentorQuestion,{exact:true}).count(),0);
    assert.equal(await citizenLog.getByText(mentorReply,{exact:true}).count(),0);
    assert.equal(await citizenLog.getByText(followupQuestion,{exact:true}).count(),0);
    assert.equal(await citizenLog.getByText(followupReply,{exact:true}).count(),0);
  }
  async function seeMentor({answered=false}={}) {
    await mentorLog.waitFor();
    await checkContactLabels();
    assert.equal(await citizenTab.getAttribute('aria-pressed'),'false');
    assert.equal(await mentorTab.getAttribute('aria-pressed'),'true');
    assert.equal(await mentorChat.locator('.rxa-person,.rxa-presence,[data-rxa-chat-actor]').count(),0);
    assert.ok(await mentorChat.getAttribute('aria-labelledby'));
    await returnToCase.waitFor();
    assert.ok(await returnToCase.getAttribute('aria-label'));
    assert.equal(await citizenLog.count(),0);
    assert.equal(await mentorLog.getByText(citizenQuestion,{exact:true}).count(),0);
    assert.equal(await mentorLog.getByText(citizenReply,{exact:true}).count(),0);
    if(answered){
      assert.equal(await mentorLog.getByText(mentorQuestion,{exact:true}).count(),1);
      assert.equal(await mentorLog.getByText(mentorReply,{exact:true}).count(),1);
    }
  }
  async function checkKeyboard() {
    const field=mentorForm.locator('[data-mentor-draft]');
    await field.focus();
    // Desktop-hosted touch contexts have no system IME. Drive the same viewport event.
    await page.evaluate(()=>{
      Object.defineProperty(visualViewport,'height',{configurable:true,value:innerHeight-220});
      visualViewport.dispatchEvent(new Event('resize'));
    });
    try{
      await page.locator('#receptionAI[data-keyboard-open=true]').waitFor();
      await citizenTab.waitFor();
      await mentorTab.waitFor();
      assert.equal(await mentorTab.getAttribute('aria-pressed'),'true');
      await shot('mentor-keyboard');
      await citizenTab.click();
      await seeCitizen();
    }finally{
      await page.evaluate(()=>{
        delete visualViewport.height;
        visualViewport.dispatchEvent(new Event('resize'));
      });
    }
    await mentorTab.click();
    await seeMentor();
  }
  try {
    const loaded=await page.goto(origin+'/__qa/reception.html?context=seminar&lang=ru');
    assert.equal(loaded.status(),200);
    assert.match(await page.title(),/Приёмная/);
    const start=responseFor('start');
    await root.locator(`[data-action="start-journey"][data-stage="${stage}"]`).click();
    const started=await receipt(start);
    evidence.sessionId=started.id;
    assert.equal(started.journeyStage,stage);
    assert.equal(started.seminarStoryVersion,SEMINAR_STORY_VERSION);
    await checkHeader(root);
    if(stage==='independent'){
      assert.equal(started.guidance,undefined);
      assert.equal(started.mentorMessages,undefined);
      assert.equal(await root.locator(mentorUI).count(),0);
      await nav('chat').click();
      await seeCitizen({withTabs:false});
      assert.equal(await root.locator(mentorUI).count(),0);
      assert.equal(await chats.count(),0);
      await citizenForm.waitFor();
      await checkHeader(root);
      evidence.checks.push('independent-citizen-only','header-unobstructed');
      await shot('citizen-only');
      assert.deepEqual(calls,[]);
    }else{
      await welcome.waitFor();
      assert.match(await welcome.innerText(),/наставник/i);
      await shot('welcome');
      await welcome.locator('[data-action="mentor-open-chat"]').click();
      await seeMentor();
      const greeting=mentorChat.locator('[data-mentor-greeting]');
      await greeting.waitFor();
      const greetingText=await greeting.innerText();
      assert.match(greetingText,/Елена Андреевна/);
      assert.match(greetingText,/начать|сверить|помо[гщ]|вопрос|подска/i);
      await checkHeader(root);
      await shot('mentor-greeting');
      if(size.isMobile&&size.width<=820)await checkKeyboard();
      await returnToCase.click();
      await page.locator('#receptionAI[data-page="reception"]').waitFor();
      await nav('chat').click();
      await seeCitizen();
      await checkHeader(root);
      const portraitMotion=citizenTab.locator('[data-rxa-chat-actor][data-rxa-motion-ready] > .rxa-citizen-video');
      await portraitMotion.waitFor();
      assert.equal(await citizenTab.locator('video[controls]').count(),0);
      evidence.checks.push('citizen-portrait-autoplays-in-active-contact');
      const chatMenu=toolbar.locator('.rxa-chat-menu');
      await chatMenu.locator('summary').click();
      await chatMenu.locator('[data-panel="documents"]').waitFor();
      await chatMenu.locator('summary').click();

      await citizenForm.locator('[data-message-draft]').fill(citizenQuestion);
      const citizenResult=responseFor('message');
      await citizenForm.locator('button[type="submit"]').click();
      await citizenLog.locator('[data-delivery-state="pending"]').waitFor();
      await citizenLog.locator('[data-typing]').waitFor();
      resolveCitizen();
      const citizen=await receipt(citizenResult);
      assert.deepEqual(citizen.messages.slice(-2).map(message=>message.text),[citizenQuestion,citizenReply]);
      await citizenLog.getByText(citizenReply,{exact:true}).waitFor();

      await mentorTab.click();
      await seeMentor();
      await greeting.waitFor();
      await checkHeader(root);

      const answer=responseFor('mentor-question');
      const requesting=page.waitForRequest(request=>request.url()===origin+'/api/reception'&&
        request.method()==='POST'&&request.postDataJSON()?.op==='mentor-question');
      await mentorForm.locator('[data-mentor-draft]').fill(mentorQuestion);
      await mentorForm.locator('button[type="submit"]').click();
      assert.equal((await requesting).postDataJSON().text,mentorQuestion);
      await mentorLog.getByText(mentorQuestion,{exact:true}).waitFor();
      await mentorLog.locator('[data-delivery-state="pending"]').waitFor();
      await mentorLog.locator('[data-op-wait="mentor-question"]').waitFor();
      assert.equal(await citizenLog.count(),0);
      resolveMentor();
      const mentored=await receipt(answer);
      assert.deepEqual(mentored.mentorMessages.map(message=>message.text),[mentorQuestion,mentorReply]);
      assert.deepEqual(mentored.messages,citizen.messages);
      await seeMentor({answered:true});
      await shot('mentor-answer');

      await citizenTab.click();
      await seeCitizen();
      assert.equal(await citizenLog.getByText(citizenReply,{exact:true}).count(),1);
      await shot('citizen-return');

      await nav('reception').click();
      await nav('chat').click();
      await seeCitizen();
      await mentorTab.click();
      await seeMentor({answered:true});
      const resume=responseFor('resume');
      await page.reload();
      const reopened=await receipt(resume);
      assert.equal(reopened.id,started.id);
      assert.deepEqual(reopened.mentorMessages,mentored.mentorMessages);
      assert.deepEqual(reopened.messages,citizen.messages);
      await seeMentor({answered:true});
      await checkHeader(root);
      await shot('mentor-after-reload');

      await returnToCase.click();
      await page.locator('#receptionAI[data-page="reception"]').waitFor();
      await nav('chat').click();
      await seeCitizen();
      assert.equal(await citizenLog.getByText(citizenQuestion,{exact:true}).count(),1);
      assert.equal(await citizenLog.getByText(citizenReply,{exact:true}).count(),1);

      await nav('calendar').click();
      const calendarPage=page.locator('#receptionAI[data-page="calendar"]');
      await calendarPage.waitFor();
      await nav('chat').click();
      await seeCitizen();
      await mentorTab.click();
      await seeMentor({answered:true});
      const followup=responseFor('mentor-question');
      await mentorForm.locator('[data-mentor-draft]').fill(followupQuestion);
      await mentorForm.locator('button[type="submit"]').click();
      const followedUp=await receipt(followup);
      assert.equal((await followup).request().postDataJSON().workspacePage,'calendar');
      assert.deepEqual(followedUp.mentorMessages.map(message=>message.text),[mentorQuestion,mentorReply,followupQuestion,followupReply]);
      await mentorLog.getByText(followupReply,{exact:true}).waitFor();
      await shot('mentor-calendar-followup');
      const recoverFollowup=responseFor('resume');
      await page.reload();
      const withFollowup=await receipt(recoverFollowup);
      assert.deepEqual(withFollowup.mentorMessages,followedUp.mentorMessages);
      assert.equal(await mentorLog.getByText(followupReply,{exact:true}).count(),1);
      await returnToCase.click();
      await calendarPage.waitFor();
      await checkHeader(root);
      await shot('returned-calendar');
      assert.deepEqual(calls,[{op:'message',text:citizenQuestion},{op:'mentor-question',text:mentorQuestion},
        {op:'mentor-question',text:followupQuestion}]);
      evidence.checks.push('welcome','separate-citizen-and-mentor','freeform-question','pending-in-mentor-only',
        'return-to-citizen','welcome-shortcut','history-across-reload','calendar-origin-and-return','followup-after-reload',
        'header-unobstructed','single-contact-row','contact-names-fit-on-one-line','citizen-menu','pending-and-typing-in-both-logs');
      if(size.isMobile&&size.width<=820)evidence.checks.push('keyboard-keeps-both-contact-switches');
    }
    assert.deepEqual(errors,[]);
    evidence.status='pass';
    console.log(JSON.stringify(evidence));
  }catch(error){
    evidence.status='fail';
    evidence.error=error.stack||String(error);
    console.error(evidence.error);
    await shot('failure').catch(()=>{});
  }finally{
    resolveMentor();
    resolveCitizen();
    await context.close();
    await new Promise(resolve=>fixture.server.close(resolve));
  }
}

let tempDirectory;
try {
  if(synthetic){
    tempDirectory=await mkdtemp(path.join(os.tmpdir(),'reception-mentor-chat-'));
    original.public.citizen.portrait=`assets/gfx1/avatars/${authoredActor}.webp`;
    original.documents.push({...original.documents[0],id:'d0',factIds:[]});
    await writeFile(path.join(tempDirectory,caseId+'.json'),JSON.stringify(original)+'\n');
  }
  const engine=option('--browser',null),width=option('--viewport',null);
  const engines=engine?[engine]:['chromium','webkit'];
  const sizes=viewports.filter(size=>!width||width===String(size.width));
  assert.ok(sizes.length,'Choose 320, 360, 390, 393, 412, 430, 844, or 1440.');
  for(const name of engines){
    assert.ok(['chromium','webkit'].includes(name),'Choose chromium or webkit.');
    const browser=await browsers[name].launch();
    try{
      for(const size of sizes)for(const stage of ['mentor','independent'])
        await run(browser,name,size,stage,tempDirectory||casesDirectory);
    }finally{await browser.close();}
  }
}finally{
  if(tempDirectory)await rm(tempDirectory,{recursive:true,force:true});
  await writeFile(path.join(output,'mentor-chat-report.json'),JSON.stringify({synthetic,report},null,2)+'\n');
}
if(report.some(row=>row.status!=='pass'))process.exitCode=1;
