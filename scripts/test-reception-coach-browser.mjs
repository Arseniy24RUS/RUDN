#!/usr/bin/env node
/** Local browser test of the guided case using the real UI and case service.
 * The provider is a scripted test double. The browser fills and submits ordinary controls.
 */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';
import {createScriptedCorrespondenceReviewer} from './reception-correspondence-test-reviewer.mjs';
import {explicitQAReview} from './reception-correspondence-qa-cases.mjs';
import {RECEPTION_AUTHORITIES} from '../site/apps/reception/ai/authority-directory.js';
import {localizedAuthorityName} from '../site/apps/reception/ai/authority-picker.js';
import {privateCorrespondenceProfile} from '../firebase/functions/reception-ai/correspondence-profiles.mjs';
import {hash} from '../firebase/functions/reception-ai/schema.mjs';
import {MFC_CALENDAR_VERSION,MFC_CALENDAR_WITHOUT_REGISTRATION} from '../site/apps/reception/ai/core-steps.js';
import {SEMINAR_EXAMPLE,exactCaseScore,seminarPointsAt,tutorialGuide,tutorialExecutionAction,validatedTutorialMemo} from '../firebase/functions/reception-ai/seminar-journey.mjs';
import {SEMINAR_STORY_VERSION,SEMINAR_STORY_PROGRESS_KEY} from '../firebase/functions/reception-ai/seminar-stories.mjs';
import {createReceptionService} from '../firebase/functions/reception-ai/service.mjs';

const arg=(key, fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const engine=arg('--browser','chromium');
const legacy=process.argv.includes('--legacy');
const stories=process.argv.includes('--stories');
const seminarStoryVersion=stories?SEMINAR_STORY_VERSION:null;
const scored=process.argv.includes('--scored')||process.argv.includes('--teacher');
const practicePartial=process.argv.includes('--practice-partial');
const anonymous=process.argv.includes('--anonymous');
const teacherExample=process.argv.includes('--teacher-example');
const teacherAccepted=process.argv.includes('--teacher-accepted');
const teacher=process.argv.includes('--teacher')||teacherExample||teacherAccepted;
assert.ok([legacy,scored,teacherExample,teacherAccepted].filter(Boolean).length<=1,'Select just one browser scenario.');
assert.ok(!stories||!legacy&&!teacher,'Stories require the current student seminar.');
assert.ok(!anonymous||stories&&scored,'The anonymous case requires --stories --scored.');
assert.ok(!practicePartial||stories&&!scored,'The practice deduction check requires --stories without --scored.');
const coreStepsVersion=legacy?null:'mfc-referral-v2';
assert.ok(['chromium','webkit'].includes(engine));
const modulePath=arg('--playwright-module',process.env.RECEPTION_PLAYWRIGHT_MODULE);
const {[engine]:launcher}=await import(modulePath?pathToFileURL(path.resolve(modulePath)).href:'playwright');
const out=path.resolve(arg('--out',path.join(os.tmpdir(),'reception-coach-browser')),engine,anonymous?'anonymous':stories&&scored?'independent':practicePartial?'practice-partial':'.');
const sizes=[
  {width:1440,height:900,locale:'ru',full:true},
  {width:390,height:844,locale:'en',full:false},
  {width:430,height:932,locale:'zh',full:false},
  {width:320,height:568,locale:'ru',full:false},
  {width:844,height:390,locale:'zh',full:false},
].filter(({width})=>!arg('--viewport')||String(width)===arg('--viewport'));
assert.ok(sizes.length,'Use --viewport 1440, 390, 430, 320 or 844.');
const normative=JSON.parse(await readFile(new URL('../firebase/functions/reception-ai/normative-provisions.json',import.meta.url),'utf8'));
const labelByLocale={ru:'Пошаговая подсказка',en:'Step-by-step guide',zh:'分步提示'};
const replyByLocale={ru:'Ответ заявителю',en:'Reply to the applicant',zh:'答复申请人'};
const internalByLocale={ru:'Служебный документ',en:'Internal document',zh:'内部文书'};
const mentorAnswer={ru:'Отсчитайте срок ответа от крайней даты передачи.',en:'Count the reply period from the referral deadline.',zh:'从转送截止日期开始计算答复期限。'};
const retainedDraft={ru:'Сохранённый вывод по обращению.',en:'A saved conclusion on the appeal.',zh:'已保存的诉求结论。'};
const draftSectionIds=['facts','legalBasis','resolution','nextSteps'];
const learnerAddition={ru:'Проверил номера опор по схеме из первого письма.',en:'I checked the pole numbers against the map in the first letter.',zh:'我已根据首次来信的示意图核对灯杆编号。'};
const practiceResolution={ru:'Прошу проверить расписание и сообщить о результатах.',en:'Please check the timetable and report the findings.',zh:'请核查时刻表并告知核查结果。'};
const practiceReason={ru:'Вы предложили проверить расписание. В проекте остался открытым вопрос о публикации данных.',en:'You proposed checking the timetable. The draft leaves the publication of personal data unresolved.',zh:'您建议核查时刻表，草稿尚未处理个人数据公开事项。'};
const practiceCorrection={ru:'Укажите отдельный вывод по публикации персональных данных.',en:'Give a separate conclusion about the publication of personal data.',zh:'请就个人数据公开单独给出结论。'};
const practiceSubmit={ru:'Отправить решение на разбор',en:'Submit your response for review',zh:'提交答复以获取评阅'};
const practiceCheck={ru:'Проверить мой проект',en:'Check my draft',zh:'检查我的答复草稿'};
const exampleConfirm={ru:'Подтвердить проект',en:'Confirm draft',zh:'确认草稿'};
const independentText={
  ru:{
    facts:'В одном письме заявитель просит проверить сокращение движения автобуса и публикацию его телефона и сведений о здоровье. Именно эти два вопроса зафиксированы в материале дела.',
    legalBasis:'По части 4 статьи 8 закона № 59-ФЗ вопросы, входящие в компетенцию разных органов, направляются им в копиях. Транспортный вопрос относится к организации движения, а публикация телефона и сведений о здоровье требует отдельной проверки основания обработки.',
    resolution:'По автобусу необходимо сверить действующее расписание, фактические интервалы и основание изменения маршрута, затем сообщить результат заявителю. По персональным данным необходимо установить основание и объём публикации. Если законного основания нет, следует прекратить публичный доступ и сообщить о принятых мерах.',
    nextSteps:(recipients,referral,deadline)=>`МФЦ направит обращение ведомствам (${recipients}) до ${referral} и уведомит заявителя. До ${deadline} заявитель получит единый ответ с выводами по обращению. Сведения о здоровье и телефон в открытой переписке не приводятся.`,
    control:'Ответ транспортного органа относится к указанному автобусному маршруту. Материалы подтверждают рассмотрение, а восстановление интервалов в них не установлено. По публикации телефона и сведений о здоровье поступил отдельный результат профильного рассмотрения. Он не устанавливает удаление сведений. Подтверждённые результаты следует указать в одном ответе заявителю. Контроль завершается в пределах проведённого рассмотрения.',
  },
  en:{
    facts:'The letter asks about reduced bus service and public posting of the applicant’s telephone number and health information. The two issues are recorded separately in the case materials.',
    legalBasis:'Article 8(4) of Federal Law No. 59-FZ provides for copies to be sent to the bodies responsible for different issues. Service frequency is a transport matter, while publication of contact and health information requires a separate review of the basis for processing.',
    resolution:'For the bus, the transport authority should compare the timetable with actual service intervals, check what led to the change and explain its finding to the applicant. For personal data, the competent body should establish the scope and legal basis of publication. If no lawful basis exists, it should secure removal from public view and report the measures taken.',
    nextSteps:(recipients,referral,deadline)=>`The MFC will refer the appeal to ${recipients} by ${referral} and notify the applicant. One reply to the applicant is due by ${deadline}. Keep the telephone number and health information out of public correspondence.`,
    control:'The transport reply concerns the specific bus route in the appeal. The records confirm review of that issue and establish no restoration of service intervals. The personal-data publication has a separate review record and the record does not show removal. The applicant should receive the verified outcomes in one reply. The review can be closed within the scope established by those records.',
  },
  zh:{
    facts:'申请人在同一封信中要求核查公交班次减少，以及电话号码和健康信息被公开的情况。案卷材料分别记录了这两个事项。',
    legalBasis:'按照第59-ФЗ号联邦法第8条第4款，不同机关负责的事项应分别转送有关副本。公交班次属于交通组织问题，电话号码和健康信息公开则需要另行审查个人数据处理依据。',
    resolution:'交通机关应把时刻表与实际发车间隔对照，核查调整原因，并向申请人说明结果。个人数据主管机关应查明公开范围和法律依据。如无合法依据，应采取措施停止公开并说明处理结果。',
    nextSteps:(recipients,referral,deadline)=>`政务服务中心应在 ${referral} 前将诉求转送 ${recipients} 并通知申请人。应在 ${deadline} 前向申请人提供一份统一的答复。公开函件中不应包含电话号码及健康信息。`,
    control:'交通机关答复涉及来信所指的具体公交线路。材料证明该问题已经审查，尚未证明发车间隔恢复。公开个人数据的问题有独立的审查记录，材料未证明信息已删除。应在同一份答复中将已证实的结果告知申请人。在记录所证明的范围内结束核查。',
  },
};
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY??='1';
await mkdir(out,{recursive:true});
const browser=await launcher.launch({headless:true});
const report=[];

async function run({width,height,locale,full}) {
  const key=`${width}x${height}-${locale}`;
  const row={key,status:'running',sessionId:null,checks:[],screenshots:[],errors:[]};
  report.push(row);
  let journalWrites=0;
  const practiceReview=context=>{
    const review=explicitQAReview(context);
    if(practicePartial){
      const resolution=review.criteria.find(criterion=>criterion.id==='resolution');
      resolution.level=1;
      resolution.reason=practiceReason[locale];
      resolution.findings.push({type:'missing',section:'resolution',quote:'',sourceIds:['case-author-explanation'],explanation:practiceCorrection[locale]});
    }
    return review;
  };
  const provider={...createScriptedCorrespondenceReviewer({reviews:[stories&&!scored?practiceReview:explicitQAReview,explicitQAReview]}),name:'mock',
    async generate(){throw Error('The practice tests use the prepared case records.');},
    async answerMentor(){return {reply:mentorAnswer[locale],usage:{inputTokens:0,outputTokens:0}};},
    async reviewMentorWork(){return {ready:true,feedback:mentorAnswer[locale],usage:{inputTokens:0,outputTokens:0}};},
  };
  const fixture=await createReceptionFixture({
    casesDirectory:arg('--cases',process.env.RECEPTION_AI_CASES_DIR),
    provider,
    decisionVersion:'correspondence-v1',controlVersion:'execution-v1',coreStepsVersion,seminarStoryVersion,teacher,
    caseIds:stories||scored||full&&!legacy?[SEMINAR_EXAMPLE.caseId,anonymous?'anonymous-danger':'several-issues']:null,
    serviceOptions:{requireGameplay:true,requireSeminarJourney:true,guidedSeminarCore:true,requireCurrentSeminarTraining:stories,
      canStartAssessment:async()=>!teacher,saveResult:async()=>{journalWrites++;}},
  });
  if(scored){
    const owner=teacher?'teacher:'+fixture.identity.uid:'student:'+fixture.identity.studentKey;
    // Test setup only. Every action in the new independent attempt comes from rendered controls.
    await fixture.store.transaction('seminarProgress/'+hash(owner),()=>({
      [stories?SEMINAR_STORY_PROGRESS_KEY:'mfcJourney']:{example:{completed:true},mentor:{completed:true}},
    }));
  }
  const checkLegacyResume=!legacy&&!scored&&!teacher&&width===390;
  const priorService=stories&&checkLegacyResume?createReceptionService({store:fixture.store,cases:fixture.cases,provider,
    requireGameplay:true,guidedSeminarCore:true}):fixture.service;
  const older=checkLegacyResume?(await priorService.handle({op:'start',context:'seminar',mode:'training',locale,
    journeyStage:'example',workbookVersion:2,decisionVersion:'correspondence-v1',controlVersion:'execution-v1',
    requestId:'save-previous-example'},fixture.identity)).view:null;
  const olderSnapshot=older&&await fixture.store.get('sessions/'+older.id);
  await new Promise((resolve,reject)=>{fixture.server.once('error',reject);fixture.server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${fixture.server.address().port}`;
  row.origin=origin;
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<500,isMobile:width<500,serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  page.setDefaultTimeout(8000);
  let visitorMessages=0;
  await page.exposeFunction('qaVisitedVisitorChat',()=>{row.visitedVisitorChat=true;});
  await page.addInitScript(()=>{
    new MutationObserver(()=>{
      if(document.querySelector('#receptionAI[data-page="chat"]'))void window.qaVisitedVisitorChat();
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-page']});
  });
  page.on('request',request=>{
    if(request.url()===origin+'/api/reception'&&request.postDataJSON()?.op==='message')visitorMessages++;
  });
  page.on('pageerror',error=>row.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')row.errors.push(message.text());});
  const root=page.locator('#receptionAI');
  const card=page.locator('.rxa-tour-card');
  const ring=page.locator('.rxa-tour-highlight');
  const toggle=page.getByRole('button',{name:labelByLocale[locale],exact:true});
  const clue=page.locator('[aria-describedby*="rxaTourHint"]');
  const currentStep=view=>view.guidance?.steps?.[view.guidance.stepIndex];
  const operation=async (op, trigger)=>{
    const pending=page.waitForResponse(response=>response.url()===origin+'/api/reception'&&
      response.request().method()==='POST'&&response.request().postDataJSON()?.op===op);
    await trigger.click();
    const response=await pending;
    const body=await response.json();
    assert.ok(response.ok(),JSON.stringify(body.error));
    const request=response.request().postDataJSON();
    if(stories&&(op==='decide'||op==='tutorial-step'&&request.stepId==='draft')&&request.decision?.correspondence)
      assert.equal(request.decision.correspondence.kind,anonymous?'internal':'reply');
    await page.locator('#receptionAI[aria-busy="false"]').waitFor();
    return body.view;
  };
  const shot=async name=>{
    const filename=`${key}-${name}.png`;
    if(name!=='failure'){
      const overflow=await root.locator('.rxa-page-content').evaluate(panel=>panel.scrollWidth-panel.clientWidth);
      assert.ok(overflow<=2,`Horizontal overflow of ${overflow}px on ${name}`);
    }
    await page.screenshot({path:path.join(out,filename),animations:'disabled'});
    row.screenshots.push(filename);
  };
  const go=async destination=>{
    if(await root.getAttribute('data-page')===destination)return;
    await page.locator(`.rxa-mobile-nav [data-page="${destination}"]`).click();
    await page.locator(`#receptionAI[data-page="${destination}"]`).waitFor();
  };
  async function inspectHint(expected, name, {bubble=false,scroll=true}={}) {
    await clue.waitFor({state:'attached'});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const highlighted=`.rxa-tour-highlight[data-target="${expected}"]:not([hidden])`;
    if (scroll && !await page.locator(highlighted).isVisible()) await clue.scrollIntoViewIfNeeded();
    await page.locator(highlighted).waitFor();
    if(bubble)await card.waitFor();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const geometry=await page.evaluate(()=>{
      const target=document.querySelector('[aria-describedby*="rxaTourHint"]');
      const ring=document.querySelector('.rxa-tour-highlight');
      const card=document.querySelector('.rxa-tour-card');
      const arrow=document.querySelector('.rxa-tour-arrow');
      const rect=node=>node?.getBoundingClientRect();
      const intersection=(a,b)=>({left:Math.max(a.left,b.left),right:Math.min(a.right,b.right),top:Math.max(a.top,b.top),bottom:Math.min(a.bottom,b.bottom)});
      const clipped=node=>{
        let r=rect(node);
        for(let ancestor=node.parentElement;ancestor&&ancestor!==document.body;ancestor=ancestor.parentElement){
          const visible=getComputedStyle(ancestor);
          if(/^(auto|scroll|hidden|clip)$/.test(visible.overflowY))r=intersection(r,rect(ancestor));
        }
        return r;
      };
      const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
      const targetBounds=rect(target),cardBounds=clipped(card),ringBounds=rect(ring);
      const viewport={left:visualViewport.offsetLeft,top:visualViewport.offsetTop,
        right:visualViewport.offsetLeft+visualViewport.width,bottom:visualViewport.offsetTop+visualViewport.height};
      const visible=!card.hidden&&overlap(cardBounds,viewport);
      const arrowBounds=rect(arrow),arrowX=(arrowBounds.left+arrowBounds.right)/2,arrowY=(arrowBounds.top+arrowBounds.bottom)/2;
      const arrowDistance=arrow.hidden?null:Math.hypot(
        Math.max(targetBounds.left-arrowX,0,arrowX-targetBounds.right),
        Math.max(targetBounds.top-arrowY,0,arrowY-targetBounds.bottom),
      );
      const controls=[...document.querySelectorAll('#receptionAI button,#receptionAI input,#receptionAI textarea,#receptionAI select,#receptionAI summary')];
      const covered=controls.filter(node=>{
        if(node===target||!node.getClientRects().length||!visible)return false;
        const box=intersection(intersection(cardBounds,clipped(node)),viewport);
        if(box.right-box.left<=1||box.bottom-box.top<=1)return false;
        const hit=document.elementFromPoint((box.left+box.right)/2,(box.top+box.bottom)/2);
        return hit===node||node.contains(hit);
      });
      return {
        focused:document.activeElement===target, visible, arrow:!arrow.hidden, arrowDistance,
        pointerEvents:getComputedStyle(ring).pointerEvents, ringMatches:overlap(ringBounds,targetBounds),
        targetOverlap:visible&&overlap(cardBounds,targetBounds),
        coversOtherControl:covered.map(node=>node.dataset.action||node.dataset.controlAction||node.dataset.calendarAction||node.tagName.toLowerCase()),
        insideViewport:!visible||card.classList.contains('rxa-tour-inline')||(cardBounds.left>=viewport.left-1&&cardBounds.top>=viewport.top-1&&cardBounds.right<=viewport.right+1&&cardBounds.bottom<=viewport.bottom+1),
        targetLabel:target.getAttribute('aria-label')||target.dataset.action||target.dataset.responseField||target.tagName.toLowerCase(),
      };
    });
    assert.ok(geometry.ringMatches&&geometry.pointerEvents==='none'&&geometry.insideViewport&&!geometry.targetOverlap&&geometry.coversOtherControl.length===0,JSON.stringify(geometry));
    if (bubble) assert.ok(geometry.arrow&&geometry.arrowDistance<=24,JSON.stringify(geometry));
    row.checks.push({hint:expected,...geometry});
    if(name)await shot(name);
  }
  async function attachLegal(citation, hints=!scored) {
    const act=page.locator(`[data-core-law] [data-normative-doc="${citation.sourceId}"]`).first();
    await act.click();
    const reader=page.locator('.rx-source-embedded');
    const search=reader.locator('.rx-source-reader-content:not([inert]) [data-input="reader-query"]');
    await search.waitFor();
    const unitId=citation.unitIds[0];
    // The model's worked example supplies the cited provision. The browser uses
    // the in-app search, opens the matching paragraph and attaches it.
    const documentSections=normative[citation.sourceId]||{};
    const unitData=Object.values(documentSections).flat().find(([id])=>id===unitId);
    assert.ok(unitData,unitId);
    if(locale!=='ru'){
      const original=reader.locator('[data-action="toggle-document-original"]');
      await original.click();
      await reader.locator('.ll-reader[data-reader-locale="ru"]').waitFor();
    }
    const reasonableQuery=unitData[1].trim().replace(/^\d+(?:\.\d+)*\.\s*/,'').split(/\s+/).slice(0,5).join(' ');
    await search.fill(reasonableQuery);
    await search.press('Enter');
    await reader.locator(`[data-action="jump-unit"][data-id="${unitId}"]`).click();
    await reader.locator(`.ll-paper [data-unit="${unitId}"]`).click();
    if(hints)await inspectHint('lawUse','attach-provision');
    await reader.locator('[data-source-reference-use]').click();
    await page.locator(`[data-core-citation="${citation.sourceId}"]`).waitFor();
  }
  async function chooseDate(id,date,hints=!scored) {
    await page.locator(`[data-calendar-action="target"][data-target="${id}"]`).click();
    if(hints)await inspectHint('calendarDay',id==='referral'?'calendar-date':null);
    await page.locator('[data-calendar-input="year"]').selectOption(date.slice(0,4));
    await page.locator('[data-calendar-input="month"]').selectOption(date.slice(5,7));
    await page.locator(`[data-calendar-action="choose-date"][data-date="${date}"]`).click();
    await page.locator(`[data-calendar-action="clear"][data-target="${id}"]`).waitFor();
  }
  async function checkReception(view) {
    const group=root.locator('.rxt-mfc-visitor');
    const portrait=group.locator('.rxa-foyer-scene');
    const appeal=group.locator('.rxt-opening');
    await appeal.waitFor();
    const [imageBox,appealBox]=await Promise.all([portrait.boundingBox(),appeal.boundingBox()]);
    assert.ok(imageBox.height>0&&imageBox.y+imageBox.height<=appealBox.y);
    assert.ok(appealBox.x>=imageBox.x&&appealBox.x+appealBox.width<=imageBox.x+imageBox.width+1);
    assert.equal(await root.locator('.rxt-opening blockquote').count(),1);
    assert.equal(await appeal.locator('blockquote').innerText(),view.case.opening);
    assert.equal(await root.locator('.rxt-mfc-intro').count(),1);
    const role=await root.locator('.rxt-mfc-intro p').innerText();
    assert.equal(await root.getByText(role,{exact:true}).count(),1);
    if(view.case.workbook.calendarVersion===MFC_CALENDAR_VERSION){
      const dates=await root.locator('.rxa-case-timeline time').evaluateAll(items=>items.map(item=>item.dateTime));
      assert.deepEqual(dates,view.case.workbook.events.map(event=>event.date));
    }
    row.receptionLayout={portrait:imageBox,appeal:appealBox};
    if(width===390||width===1440){
      await group.scrollIntoViewIfNeeded();
      await shot('reception-layout');
    }
  }
  async function checkCalendar(view,model) {
    const workbook=view.case.workbook;
    assert.equal(workbook.calendarVersion,MFC_CALENDAR_VERSION);
    assert.equal(workbook.registrationCheck,true);
    assert.deepEqual(workbook.events.map(event=>event.id),['intakeReceived','intakeRegistered']);
    assert.deepEqual(workbook.targets.map(target=>[target.id,target.anchorId,target.ruleId,target.counting.shift]),[
      ['referral','intakeRegistered','calendar7','no_shift'],
      ['deadline','referral','calendar30','no_shift'],
    ]);
    const days=(start,end)=>(Date.parse(end)-Date.parse(start))/86400000;
    const [received,registered]=workbook.events;
    const {caseData}=await readSession(view);
    const events=caseData.public.assessment.calendar.events;
    assert.equal(received.date,events.find(event=>event.id==='received')?.date);
    assert.equal(registered.date,events.find(event=>event.id==='registered')?.date||received.date);
    assert.equal(days(registered.date,model.workbook.referralDeadline),7);
    assert.equal(days(model.workbook.referralDeadline,model.deadline),30);
    const rules=root.locator('.rxt-calendar-rules');
    await rules.waitFor();
    const instructions=await rules.innerText();
    assert.match(instructions,/(?:7|seven|七)/i);
    assert.match(instructions,/(?:30|thirty|三十)/i);
    assert.doesNotMatch(instructions,/учебн|симуляц|exercise|simulation|本模拟|本练习/i);
    assert.equal(await root.locator('[data-calendar-action="event-month"]').count(),2);
    assert.equal(await root.locator('[data-core-registration]').count(),2);
    assert.equal(await root.locator('[data-calendar-input="registration-timely"],[data-calendar-details="norms"]').count(),0);
    row.calendar={version:workbook.calendarVersion,receivedDate:received.date,registrationDate:registered.date,
      referral:model.workbook.referralDeadline,deadline:model.deadline};
  }
  const registrationAnswer=value=>root.locator(`[data-core-registration][value="${value}"]`);
  async function selectRegistration(value) {
    assert.equal(typeof value,'boolean');
    await registrationAnswer(value).check();
    assert.equal(await registrationAnswer(value).isChecked(),true);
    row.calendar.registrationAnswer=value;
  }
  async function calendarEvidence(name) {
    await root.locator('.rxw-calendar-events').evaluate(element=>element.scrollIntoView({block:'start',behavior:'instant'}));
    await shot(name);
  }
  async function reloadCase(view,tab) {
    const response=page.waitForResponse(res=>res.url()===origin+'/api/reception'&&res.request().method()==='POST'&&res.request().postDataJSON()?.op==='resume');
    await page.reload();
    const result=await (await response).json();
    assert.equal(result.view.id,view.id);
    await page.locator(`#receptionAI[data-page="${tab}"][aria-busy="false"]`).waitFor();
    return result.view;
  }
  async function migrateTeacherCalendar(view,model) {
    await chooseDate('referral',model.workbook.referralDeadline,false);
    await chooseDate('deadline',model.deadline,false);
    assert.equal(await root.locator('[data-calendar-action="clear"]').count(),2);
    // A pre-upgrade session and local draft are reproduced on this isolated memory fixture.
    await fixture.store.transaction('sessions/'+view.id,current=>{
      current.mfcCalendarVersion=MFC_CALENDAR_WITHOUT_REGISTRATION;
      return current;
    });
    await context.addInitScript(({id,revision,draft,legacyCalendar})=>{
      if(sessionStorage.getItem('qa-legacy-calendar'))return;
      const key=Object.keys(localStorage).find(key=>key.startsWith('rudn.reception.workspace.v2:')&&key.endsWith(':current'));
      if(!key)return;
      const saved=JSON.parse(localStorage.getItem(key));
      if(saved.sessionId!==id)return;
      saved.calendarVersion=legacyCalendar;
      saved.decisionDraft.correspondence.sections.resolution=draft;
      saved.pending={op:'tutorial-step',stepId:'calendar',requestId:'old-calendar-before-update',sessionId:id,
        expectedRevision:revision,calendar:{deadline:saved.decisionDraft.deadline,referralDeadline:saved.decisionDraft.workbook.referralDeadline}};
      localStorage.setItem(key,JSON.stringify(saved));
      sessionStorage.setItem('qa-legacy-calendar','1');
    },{id:view.id,revision:view.revision,draft:retainedDraft[locale],legacyCalendar:MFC_CALENDAR_WITHOUT_REGISTRATION});
    const resumed=await reloadCase(view,'calendar');
    assert.equal(resumed.revision,view.revision+1);
    assert.deepEqual(resumed.openedDocumentIds,view.openedDocumentIds);
    assert.deepEqual(resumed.coreSteps.values.citations,view.coreSteps.values.citations);
    assert.equal(await root.locator('[data-calendar-action="clear"]').count(),2);
    assert.equal(await root.locator('[data-core-registration]:checked').count(),0);
    assert.equal(await root.locator('[data-action="core-step"][data-step="calendar"]').isEnabled(),false);
    row.teacherMigration={previousRevision:view.revision,resumedRevision:resumed.revision,openedDocumentIds:resumed.openedDocumentIds};
    return resumed;
  }
  async function recordPreviousRegistration(view) {
    const {deadline,referralDeadline,registrationTimely}=view.coreSteps.values.calendar;
    const routing=view.coreSteps.values.routing;
    const step=currentStep(view).id;
    // Reproduce a date-only calendar already accepted in a previous release.
    await fixture.store.transaction('sessions/'+view.id,current=>{
      current.mfcCalendarVersion=MFC_CALENDAR_WITHOUT_REGISTRATION;
      delete current.caseStates[current.caseIndex].coreStepsValues.calendar.registrationTimely;
      return current;
    });
    await context.addInitScript(({id,legacyCalendar})=>{
      if(sessionStorage.getItem('qa-accepted-calendar'))return;
      const key=Object.keys(localStorage).find(key=>key.startsWith('rudn.reception.workspace.v2:')&&key.endsWith(':current'));
      if(!key)return;
      const saved=JSON.parse(localStorage.getItem(key));
      if(saved.sessionId!==id)return;
      saved.calendarVersion=legacyCalendar;
      delete saved.calendarState.registrationTimely;
      delete saved.decisionDraft.workbook.registrationTimely;
      localStorage.setItem(key,JSON.stringify(saved));
      sessionStorage.setItem('qa-accepted-calendar','1');
    },{id:view.id,legacyCalendar:MFC_CALENDAR_WITHOUT_REGISTRATION});
    let resumed=await reloadCase(view,'calendar');
    assert.equal(currentStep(resumed).id,step);
    assert.equal(resumed.case.workbook.calendarVersion,MFC_CALENDAR_WITHOUT_REGISTRATION);
    assert.equal(resumed.case.workbook.registrationPreviouslyUnasked,true);
    assert.deepEqual(resumed.case.workbook.events.map(event=>event.id),['intakeReceived','intakeRegistered']);
    assert.deepEqual(resumed.coreSteps.values.calendar,{deadline,referralDeadline});
    assert.deepEqual(resumed.coreSteps.values.routing,routing);
    assert.equal(await root.locator('[data-calendar-action="clear"]').count(),2);
    assert.equal(await root.locator('[data-calendar-action="target"]:enabled').count(),0);
    assert.equal(await root.locator('[data-action="core-step"][data-step="calendar"]').count(),0);
    const save=root.locator('[data-action="registration-check"]');
    assert.equal(await save.isEnabled(),false);
    await selectRegistration(registrationTimely);
    assert.equal(await save.isEnabled(),true);
    await calendarEvidence('accepted-calendar-registration');
    resumed=await operation('registration-check',save);
    assert.deepEqual(resumed.case.workbook.registrationPractice,{answer:registrationTimely,correct:true});
    assert.deepEqual(resumed.coreSteps.values.calendar,{deadline,referralDeadline});
    assert.deepEqual(resumed.coreSteps.values.routing,routing);
    assert.equal(currentStep(resumed).id,step);
    assert.equal(await root.getAttribute('data-page'),'decision');
    resumed=await reloadCase(resumed,'decision');
    await go('calendar');
    assert.equal(await registrationAnswer(registrationTimely).isChecked(),true);
    assert.equal(await registrationAnswer(registrationTimely).isEnabled(),false);
    assert.equal(await save.count(),0);
    await go('decision');
    row.teacherAccepted={originalStep:step,retainedDates:{deadline,referralDeadline},routing,answer:registrationTimely};
    return resumed;
  }
  async function setRecipients(ids) {
    const territory=page.locator('[data-routing-territory]');
    if(await territory.count())await territory.selectOption('');
    for(const id of ids){
      const authority=RECEPTION_AUTHORITIES.find(row=>row.id===id||row.careerId===id);
      assert.ok(authority,id);
      await page.locator('[data-routing-search]').fill(authority.name.slice(0,110));
      const choice=page.locator(`[data-routing-recipient][value="${authority.id}"]`);
      await choice.check();
      if(!legacy&&await root.getAttribute('data-page')==='route'){
        assert.ok(authority.emblem,id);
        const emblem=choice.locator('..').locator('img');
        await emblem.scrollIntoViewIfNeeded();
        const resource=await emblem.evaluate(async img=>{
          await img.decode();
          return {path:new URL(img.currentSrc).pathname,width:img.naturalWidth,height:img.naturalHeight};
        });
        assert.equal(resource.path,'/'+authority.emblem);
        assert.ok(resource.width>0&&resource.height>0,id);
        (row.emblems??=[]).push({id,...resource});
      }
    }
  }

  async function addFactCitation(caseSource) {
    const picker=root.locator('[data-response-section="facts"] details');
    if(await picker.count() && !await picker.evaluate(node=>node.open))await picker.locator('summary').click();
    const source=root.locator('[data-response-source="facts"]');
    const sourceKey=await source.locator('option').evaluateAll((choices,id)=>choices.find(item=>item.value.endsWith(':'+id))?.value,caseSource.sourceId);
    assert.ok(sourceKey);
    await source.selectOption(sourceKey);
    await root.locator('[data-response-source-quote="facts"]').fill(caseSource.quote);
    await root.locator('[data-response-action="attach-source"][data-section="facts"]').click();
  }
  const draftField=key=>root.locator(`[data-correspondence-editor] [data-response-field="${key}"]`);
  async function readDraft() {
    const subject=await draftField('subject').inputValue();
    const sections=Object.fromEntries(await Promise.all(draftSectionIds.map(async key=>[key,await draftField('sections.'+key).inputValue()])));
    return {subject,sections};
  }
  async function verifyExamplePrefill(view) {
    const model=view.guidance.prefilledDecision?.correspondence;
    assert.ok(model,'The example must expose its editable prefilled draft at the decision step');
    const actual=await readDraft();
    assert.equal(actual.subject,model.subject);
    assert.deepEqual(actual.sections,model.sections);
    assert.ok(actual.subject.trim().length>=5);
    for(const [key,value] of Object.entries(actual.sections))assert.ok(value.trim().length>=24,`${key} must contain a substantive example`);
    for(const citation of view.coreSteps.values.citations){
      assert.ok(model.citations.some(item=>item.kind==='legal'&&item.section==='legalBasis'&&item.sourceId===citation.sourceId&&
        item.quote===citation.quote&&item.unitIds.join(',')===citation.unitIds.join(',')),'The prefill must carry the selected legal provision');
      assert.equal(await root.locator(`[data-response-action="insert-provision"][data-citation-id="${citation.id}"]`).count(),1);
    }
    await shot('example-prefilled');
    row.prefilledExample={fields:1+draftSectionIds.length,selectedLegalCitations:view.coreSteps.values.citations.length};
    if(width===1440){
      row.prefilledExample.withoutTyping=true;
      return {view,draft:actual};
    }
    const facts=actual.sections.facts+'\n\n'+learnerAddition[locale];
    await draftField('sections.facts').fill(facts);
    await go('calendar');
    await go('decision');
    const updated={...actual,sections:{...actual.sections,facts}};
    assert.deepEqual(await readDraft(),updated);
    view=await reloadCase(view,'decision');
    assert.deepEqual(await readDraft(),updated);
    row.prefilledExample.learnerEditPreserved=true;
    await shot('example-edited-after-reload');
    return {view,draft:updated};
  }
  async function verifyEmptyDraft() {
    assert.deepEqual(await readDraft(),{subject:'',sections:Object.fromEntries(draftSectionIds.map(key=>[key,'']))});
  }
  async function verifyNoControl(view,{draft=false}={}) {
    assert.equal(view.case.correspondence.initialOnly,true);
    assert.ok(!view.control&&!view.controlWorkflow&&!view.followup);
    const forbidden='[data-page="control"], [data-step="control"], [data-tutorial-step="control"], [data-control-action], [data-control-submit], [data-response-action="add-order"], .rxc-letter-order';
    assert.equal(await root.locator(forbidden).count(),0);
    if(draft){
      assert.equal(await root.locator('.rxt-case-steps ol > li').count(),5);
      assert.equal(await draftField('kind').count(),0);
    }
  }
  async function verifyLinkedProvision(citation,{followLink=false}={}) {
    const preview=root.locator('[data-correspondence-preview]');
    await preview.waitFor();
    const excerpt=preview.locator('li').filter({has:page.getByText(citation.quote,{exact:true})});
    assert.equal(await excerpt.count(),1,'The official preview must list the inserted provision exactly once');
    const target=await excerpt.getAttribute('id');
    const link=preview.locator(`[data-response-citation-link][href="#${target}"]`);
    assert.equal(await link.count(),1,'The provision must have a matching link in the document body');
    if(followLink){
      await link.click();
      assert.equal(await excerpt.evaluate(node=>document.activeElement===node),true);
    }
  }
  async function verifyLegalInsertion(view) {
    const [citation]=view.coreSteps.values.citations;
    const passages=root.locator('[data-details="response-legal-passages"]');
    const insert=passages.locator(`[data-response-action="insert-provision"][data-citation-id="${citation.id}"]`);
    if(!await passages.evaluate(node=>node.open))await passages.locator('summary').click();
    const before=await readDraft();
    assert.ok(before.sections.legalBasis.trim()&&!before.sections.legalBasis.includes(citation.quote));
    await insert.click();
    const after=await readDraft();
    assert.ok(after.sections.legalBasis.startsWith(before.sections.legalBasis));
    assert.equal(after.sections.legalBasis.split(citation.quote).length,2);
    assert.deepEqual({...after,sections:{...after.sections,legalBasis:before.sections.legalBasis}},before);
    if(await insert.count()&&await insert.isEnabled())await insert.click();
    assert.deepEqual(await readDraft(),after);
    await root.locator('[data-response-action="preview"]').click();
    await verifyLinkedProvision(citation,{followLink:true});
    await shot(`${view.journeyStage}-linked-provision`);
    await root.locator('[data-response-action="edit"]').click();
    return citation;
  }
  async function fillMemo(memo) {
    for(const {issueId,status,evidenceSourceIds} of memo.statuses) {
      const field=page.locator(`[data-response-status-field][data-issue-id="${issueId}"]`);
      await field.selectOption(status);
      const proof=root.locator('.rxe-final-issue').filter({has:field}).locator('.rxe-final-sources');
      if(evidenceSourceIds.length&&!await proof.evaluate(node=>node.open))await proof.locator('summary').click();
      for(const materialId of evidenceSourceIds)await proof.locator(`[data-response-status-evidence="${materialId}"]`).check();
    }
    await root.locator('[data-response-control-field="text"]').fill(memo.text);
  }
  async function readSession(view) {
    const current=await fixture.store.get('sessions/'+view.id);
    return {caseData:current.caseData[current.caseIndex],workflow:current.caseStates[current.caseIndex].controlWorkflow};
  }
  async function checkDocumentKind(kind,applicant,{leavePreview=false}={}){
    const field=root.locator('[data-response-field="kind"]');
    if(!stories){await field.selectOption(kind);return;}
    assert.equal(await field.count(),0);
    await root.locator('[data-response-action="preview"]').click();
    const letter=root.locator('[data-correspondence-preview] .rxc-letter-meta');
    await letter.waitFor();
    const metadata=letter.locator('span');
    assert.equal(await metadata.first().textContent(),anonymous?internalByLocale[locale]:replyByLocale[locale]);
    if(anonymous){assert.equal(await metadata.count(),1);await shot('anonymous-internal-document');}
    else assert.ok((await letter.innerText()).includes(applicant));
    if(!leavePreview)await root.locator('[data-response-action="edit"]').click();
  }
  async function fillIndependentReply(model,{omitConclusion=false,applicant,resolution=independentText[locale].resolution}={}) {
    const {facts,legalBasis,nextSteps}=independentText[locale];
    const draft=root.locator('[data-correspondence-editor]');
    await draft.waitFor();
    const recipients=model.workbook.routing.recipientIds.map(id=>
      localizedAuthorityName(RECEPTION_AUTHORITIES.find(authority=>authority.id===id),locale)).join(' / ');
    await draft.locator('[data-response-field="subject"]').fill(model.correspondence.subject);
    const sections={facts,legalBasis,nextSteps:nextSteps(recipients,model.workbook.referralDeadline,model.deadline),
      ...(!omitConclusion?{resolution}:{})};
    for(const [id,value] of Object.entries(sections))await draft.locator(`[data-response-field="sections.${id}"]`).fill(value);
    for(const citation of model.correspondence.citations.filter(item=>item.kind==='document'))await addFactCitation(citation);
    await checkDocumentKind(model.correspondence.kind,applicant);
  }
  async function exerciseFollowThrough(view,guide,caseData) {
    let automaticRecipients=0;
    for(const step of ['control-request','control-evidence','control-status']){
      assert.ok(view.controlWorkflow.issues.every(issue=>!issue.availableActions.some(action=>action.kind==='notify')));
      const {workflow}=await readSession(view);
      const sample=tutorialExecutionAction(workflow,step,guide,{caseData,locale,timestamp:Date.now()});
      for(const event of sample.journal.slice(workflow.journal.length)){
        const {issueId,kind,reason,instruction,recipientIds,dueDate,expectedResult,evidenceSourceIds}=event;
        await root.locator(`[data-control-action="select-issue"][data-issue-id="${issueId}"]`).click();
        await root.locator(`[data-control-action="select-kind"][data-kind="${kind}"]`).click();
        await root.locator('[data-control-field="reason"]').fill(reason||guide.control.text);
        await root.locator('[data-control-field="instruction"]').fill(instruction||guide.control.text);
        if(dueDate)await root.locator('[data-control-field="dueDate"]').fill(dueDate);
        if(expectedResult)await root.locator('[data-control-field="expectedResult"]').fill(expectedResult);
        for(const evidenceId of evidenceSourceIds){
          const marker=root.locator(`[data-control-field="evidenceSourceIds"][data-source-id="${evidenceId}"]`);
          await marker.locator('../..').locator('[data-control-action="open-material"]').click();
          await root.locator('[data-control-material] [data-control-action="close-material"]').click();
          await marker.check();
        }
        const chooser=root.locator('[data-control-action="choose-recipient"]');
        const rule=view.controlWorkflow.issues.find(issue=>issue.id===issueId)?.availableActions.find(action=>action.kind===kind);
        if(rule?.requiresRecipients===false&&['request_evidence','refer'].includes(kind)){
          assert.equal(await chooser.count(),0);
          automaticRecipients++;
        }else if(recipientIds.length){
          await chooser.click();
          await setRecipients(recipientIds);
          await root.locator('[data-action="control-recipient-done"]').click();
        }
        view=await operation('control-action',root.locator('[data-control-action="execute"]'));
        assert.ok(view.controlWorkflow.journal.at(-1).accepted,view.controlWorkflow.journal.at(-1).outcome);
      }
    }
    return {view,automaticRecipients};
  }
  async function runIndependent() {
    let view=await operation('start',root.locator('[data-action="start-journey"][data-stage="independent"]'));
    row.sessionId=view.id;
    row.coreStepsVersion=view.coreStepsVersion;
    assert.equal(view.coreStepsVersion,coreStepsVersion);
    assert.equal(view.case.id,anonymous?'anonymous-danger':'several-issues');
    assert.equal(view.guidance,undefined);
    if(stories){
      await verifyNoControl(view);
      assert.equal(view.seminarStoryVersion,seminarStoryVersion);
      if(!anonymous)assert.match(view.case.opening,/автобус в Москве|my Moscow bus|莫斯科公交/);
      assert.equal(view.mentorMessages,undefined);
      assert.equal(await root.locator('.rxa-mobile-nav [data-page="chat"]').isEnabled(),true);
      assert.equal(await root.locator('[data-chat-form], [data-action="example-question"]').count(),0);
    }
    assert.equal(await root.locator('[data-chat-dialog="mentor"],[data-mentor-welcome],.rxa-tour-toggle').count(),0);
    await root.locator('.rxt-mfc-intro').waitFor();
    await checkReception(view);
    const {caseData}=await readSession(view);
    const profile=privateCorrespondenceProfile(caseData,locale);
    const guide=tutorialGuide(caseData,profile,locale,{execution:true,core:true,coreStepsVersion,mfcCalendarVersion:MFC_CALENDAR_VERSION});
    const model=guide.decision, answer=model.correspondence, {resolution,control}=independentText[locale];
    const records=answer.citations.filter(item=>item.kind==='document');
    for(const {sourceId} of records){
      view=await operation('document',root.locator(`[data-core-records] [data-action="document"][data-id="${sourceId}"]`));
      await root.locator('[data-core-records] [data-action="documents-list"]').click();
    }
    await root.locator('[data-action="core-sources"]').click();
    for(const item of answer.citations.filter(item=>item.kind==='legal'))await attachLegal(item);
    view=await operation('core-step',root.locator('[data-action="core-step"][data-step="materials"]'));
    assert.deepEqual(view.coreSteps.completed,['materials']);
    await checkCalendar(view,model);
    await shot('independent-counting-rules');
    const nextDate=root.locator('[data-action="core-step"][data-step="calendar"]');
    await chooseDate('referral',model.workbook.referralDeadline);
    assert.equal(await nextDate.isEnabled(),false);
    view=await reloadCase(view,'calendar');
    await root.locator('[data-calendar-action="clear"][data-target="referral"]').waitFor();
    await chooseDate('deadline',model.deadline);
    assert.equal(await nextDate.isEnabled(),false);
    await selectRegistration(false);
    assert.equal(await nextDate.isEnabled(),true);
    view=await reloadCase(view,'calendar');
    assert.equal(await registrationAnswer(false).isChecked(),true);
    await selectRegistration(model.workbook.registrationTimely);
    await shot('independent-both-dates');
    view=await operation('core-step',nextDate);
    await root.locator('[data-routing-search]').waitFor();
    assert.equal(await root.locator('[data-routing-territory]').inputValue(),view.case.workbook.site?.territoryId||'');
    assert.equal(await root.locator('[data-core-disposition]').count(),0);
    const extraRouteFields=root.locator('.rxt-route-choice :is(input,select,textarea):not([data-routing-search],[data-routing-territory],[data-routing-recipient])');
    assert.equal(await extraRouteFields.count(),0);
    const expectedIds=model.workbook.routing.recipientIds;
    if(anonymous)assert.ok(expectedIds.length);
    else assert.equal(expectedIds.length,2);
    await setRecipients(expectedIds);
    await shot('independent-two-authorities');
    view=await operation('core-step',root.locator('[data-action="core-step"][data-step="route"]'));
    assert.deepEqual(view.coreSteps.values.routing.recipientIds,expectedIds);
    const submit=root.locator('[data-decision-form] [type="submit"]');
    if(stories){await verifyNoControl(view,{draft:true});await verifyEmptyDraft();}
    if(anonymous){
      assert.equal(view.case.correspondence.fixedKind,'internal');
      assert.equal(view.case.correspondence.individualReplyRequired,false);
      const draft=root.locator('[data-correspondence-editor]');
      await draft.locator('[data-response-field="subject"]').fill(answer.subject);
      for(const [key,value] of Object.entries(answer.sections))await draft.locator(`[data-response-field="sections.${key}"]`).fill(value);
      for(const citation of records)await addFactCitation(citation);
      await checkDocumentKind(answer.kind);
      view=await operation('decide',submit);
      await verifyNoControl(view);
      assert.equal(view.status,'complete');
      assert.equal(view.decision.correspondence.kind,'internal');
      row.documentKind=view.decision.correspondence.kind;
      row.caseId=view.case.id;
      assert.deepEqual(row.errors,[]);
      row.status='pass';
      return;
    }
    await fillIndependentReply(model,{omitConclusion:true,applicant:view.case.citizen.name});
    const inserted=stories?await verifyLegalInsertion(view):null;
    assert.equal(await root.locator('[data-decision-form]').count(),1);
    assert.equal(await root.locator('[data-response-action="add-order"]').count(),0);
    await submit.click();
    const resolutionField=root.locator('[data-response-field="sections.resolution"]');
    assert.equal(await resolutionField.evaluate(node=>node===document.activeElement),true);
    await resolutionField.fill(resolution);
    await shot('independent-substantive-reply');
    view=await operation('decide',submit);
    assert.equal(view.decision.correspondence.sections.resolution,resolution);
    if(inserted){
      assert.equal(view.decision.correspondence.citations.filter(item=>item.id===inserted.id).length,1);
      assert.ok(view.decision.correspondence.sections.legalBasis.includes(inserted.quote));
      row.independentDraft={blankOnFirstOpen:true,insertedLegalCitation:inserted.id};
    }
    if(stories){
      await verifyNoControl(view);
      assert.equal(view.status,'complete');
      const initial=view.result.cases[0].feedback;
      assert.equal(initial.correspondence.phase,'initial');
      assert.equal(view.result.total,exactCaseScore(initial));
      assert.equal(view.result.points,seminarPointsAt(view.result.total));
      assert.equal(view.result.journalStatus,'local');
      assert.equal(journalWrites,0);
      row.caseId=view.case.id;
      row.grade={points:view.result.points,score:view.result.total,initialOnly:true,journalStatus:view.result.journalStatus,journalWrites};
      await shot('independent-grade');
      assert.deepEqual(row.errors,[]);
      row.status='pass';
      return;
    }
    assert.equal(view.status,'followup');
    const execution=await exerciseFollowThrough(view,guide,caseData);
    view=execution.view;
    const {automaticRecipients}=execution;
    assert.ok(automaticRecipients>0,'The shared reply must not require a second selection of authorities during follow-through.');
    row.automaticRecipients=automaticRecipients;
    assert.equal(view.controlWorkflow.journal.some(event=>event.kind==='notify'),false);
    const {workflow}=await readSession(view);
    const memo={...validatedTutorialMemo(workflow,profile,guide,locale),text:control};
    await root.locator('.rxt-control-navigation [data-control-action="prepare-memorandum"]').click();
    await fillMemo(memo);
    await shot('independent-substantive-control');
    view=await operation('followup',root.locator('[data-control-submit]'));
    assert.equal(view.status,'review');
    assert.equal(view.control.text,memo.text.trim());
    view=await operation('next',root.locator('[data-action="next"]'));
    assert.equal(view.status,'complete');
    assert.equal(view.result.points,seminarPointsAt(view.result.total));
    assert.equal(view.result.journalStatus,'local');
    assert.equal(journalWrites,0);
    row.caseId=view.case.id;
    assert.equal(visitorMessages,0);
    assert.equal(Boolean(row.visitedVisitorChat),false);
    row.visitorMessages=visitorMessages;
    row.grade={points:view.result.points,score:view.result.total,journalStatus:view.result.journalStatus,journalWrites};
    row.checks.push('Both deadlines survive a reload. One appeal has two verified recipient cards and one substantive reply. No routing allocation or assignment form is present.');
    await shot('independent-grade');
    assert.deepEqual(row.errors,[]);
    row.status='pass';
  }

  try {
    const response=await page.goto(origin+'/__qa/reception.html?context=seminar&lang='+locale);
    assert.equal(response.status(),200);
    assert.match(await page.title(),/Приёмная/);
    await root.locator('[data-journey-card="example"]').waitFor();
    if(scored){await runIndependent();return;}
    if(stories){
      assert.equal(await root.locator('[data-action="start-journey"][data-stage="mentor"]').count(),0);
      assert.equal(await root.locator('[data-action="start-journey"][data-stage="independent"]').count(),0);
      row.trainingInitiallyLocked=true;
    }
    if(older){
      if(stories)await root.locator('details[data-details="archive"] > summary').click();
      const resumed=await operation('resume',root.locator(`.rxt-recover [data-action="resume-session"][data-id="${older.id}"]`));
      assert.equal(resumed.coreStepsVersion,'guided-core-v1');
      assert.equal(resumed.id,older.id);
      assert.equal(await root.locator('.rxt-mfc-intro').count(),0);
      if(stories){
        assert.equal(resumed.historical,true);
        await root.locator('[data-historical-session]').waitFor();
        await shot('archive-read-only');
        await root.locator('[data-action="close-archive"], [data-act="close-archive"]').click();
        assert.deepEqual(await fixture.store.get('sessions/'+older.id),olderSnapshot);
      }else await root.locator('[data-action="choose-case"]').click();
      row.legacySessionId=older.id;
    }
    let view=await operation('start',root.locator('[data-action="start-journey"][data-stage="example"]'));
    row.sessionId=view.id;
    row.coreStepsVersion=view.coreStepsVersion;
    assert.equal(view.coreStepsVersion,coreStepsVersion||'guided-core-v1');
    assert.equal(await root.locator('.rxt-mfc-intro').count(),legacy?0:1);
    assert.equal(await root.getAttribute('lang'),locale);
    assert.equal(await toggle.getAttribute('aria-pressed'),'true');
    if(!legacy)await checkReception(view);
    await inspectHint(stories?'visitorChat':'reception','opening',{bubble:true});
    await toggle.click();
    await ring.waitFor({state:'hidden'});
    await toggle.press('Space');
    await ring.waitFor();
    if(stories){
      assert.equal(view.seminarStoryVersion,seminarStoryVersion);
      assert.equal(view.messages.length,1);
      const question=view.guidance.question;
      assert.equal(question.completed,false);
      await root.locator('[data-tour-target="visitor-chat"]').click();
      await inspectHint('visitorQuestion','question');
      assert.equal(await root.locator('[data-action="core-opening"]').count(),0);
      await root.locator('[data-action="example-question"]').click();
      const composer=root.locator('[data-message-draft]');
      assert.equal(await composer.inputValue(),question.prompt);
      await composer.fill(question.prompt+'…');
      assert.equal(await composer.inputValue(),question.prompt+'…');
      await root.locator('[data-action="example-question"]').click();
      view=await operation('message',root.locator('[data-chat-form] [type="submit"]'));
      assert.equal(view.guidance.question.completed,true);
      assert.equal(view.messages.length,3);
      assert.equal(view.messages[1].text,question.prompt);
      assert.match(view.messages[2].text,/17/);
      await shot('authored-visitor-response');
      view=await reloadCase(view,'chat');
      assert.equal(view.guidance.question.completed,true);
      assert.equal(view.messages.length,3);
      await inspectHint('advance','chat-completed');
    }
    const opening=root.locator('[data-action="core-opening"]');
    view=await operation('tutorial-step',opening);
    assert.equal(currentStep(view)?.id,'materials');
    for(const documentId of currentStep(view).documentIds||[]){
      await go('reception');
      const record=root.locator(`[data-core-records] [data-action="document"][data-id="${documentId}"]`);
      await inspectHint('materials','case-material');
      view=await operation('document',record);
      assert.ok(view.openedDocumentIds.includes(documentId));
      if(stories&&view.documents.find(row=>row.id===documentId)?.useCaseIllustrations===false)
        assert.equal(await root.locator('[data-core-records] [data-action="illustration-open"]').count(),0);
      await root.locator('[data-core-records] [data-action="documents-list"]').click();
    }
    const sources=root.locator('[data-action="core-sources"]');
    if(await sources.isVisible())await sources.click();
    await go('documents');
    assert.equal(await root.locator('[data-core-records]').count(),0);
    const model=view.guidance.decision;
    const citations=model.correspondence.citations.filter(row=>row.kind==='legal');
    assert.deepEqual([...new Set(citations.map(row=>row.sourceId))].sort(),view.case.normativeActs.map(act=>act.id).sort());
    await inspectHint('law','legal-source');
    for(const citation of citations)await attachLegal(citation);
    view=await operation('tutorial-step',root.locator('[data-step="materials"][data-action="core-step"]'));
    assert.equal(currentStep(view)?.id,'calendar',view.guidance.finding?.explanation);
    await go('calendar');
    await inspectHint(legacy?'calendarKind':'calendarRegistration','calendar-type');
    let calendarModel=view.guidance.decision;
    if(!legacy){
      await checkCalendar(view,calendarModel);
      if(teacherExample){
        view=await migrateTeacherCalendar(view,calendarModel);
        calendarModel=view.guidance.decision;
        await checkCalendar(view,calendarModel);
      }
      await selectRegistration(calendarModel.workbook.registrationTimely);
      if(!teacherExample)await inspectHint('calendarKind','calendar-deadline-target');
    }
    for(const {id} of teacherExample?[]:view.case.workbook.targets){
      await chooseDate(id,id==='referral'?calendarModel.workbook.referralDeadline:calendarModel.deadline);
      if(!legacy&&id==='referral'){
        assert.equal(await root.locator('[data-action="core-step"][data-step="calendar"]').isEnabled(),false);
        view=await reloadCase(view,'calendar');
        assert.equal(await registrationAnswer(calendarModel.workbook.registrationTimely).isChecked(),true);
        const chosen=root.locator('[data-calendar-action="clear"][data-target="referral"]');
        await chosen.waitFor();
        if(width===390||width===1440){
          await chosen.scrollIntoViewIfNeeded();
          await shot('calendar-resumed');
        }
      }
    }
    if(legacy&&await registrationAnswer(calendarModel.workbook.registrationTimely).count())
      await registrationAnswer(calendarModel.workbook.registrationTimely).check();
    if(!legacy&&(locale==='ru'||teacher))await calendarEvidence('registration-and-deadlines');
    await inspectHint('advance','calendar-saved');
    view=await operation('tutorial-step',root.locator('[data-step="calendar"][data-action="core-step"]'));
    assert.equal(currentStep(view)?.id,'route',view.guidance.finding?.explanation);
    assert.equal(view.coreSteps.values.calendar.deadline,calendarModel.deadline);
    if(!legacy)assert.equal(view.coreSteps.values.calendar.registrationTimely,calendarModel.workbook.registrationTimely);
    await go(currentStep(view).page||currentStep(view).panel);
    const routing=view.guidance.decision.workbook.routing;
    if(legacy){
      await inspectHint('routing','route');
      await root.locator('[data-core-disposition][value="forward"]').check();
    }else{
      assert.equal(await root.locator('[data-core-disposition]').count(),0);
      assert.equal(await root.locator('[data-action="core-step"][data-step="route"]').isEnabled(),false);
      assert.equal(routing.disposition,'forward');
      assert.ok(routing.recipientIds.length);
    }
    if(stories){
      const docId=view.guidance.routeDocumentId;
      assert.ok(view.documents.some(doc=>doc.id===docId));
      const documentButton=root.locator(`.rxt-route-choice [data-action="document"][data-id="${docId}"]`);
      await documentButton.waitFor();
      if(view.openedDocumentIds.includes(docId))await documentButton.click();
      else view=await operation('document',documentButton);
      assert.equal(await root.getAttribute('data-page'),'reception');
      const heading=root.locator('[data-core-records] .rxa-document h3');
      assert.equal(await heading.innerText(),view.documents.find(doc=>doc.id===docId).title);
      await page.waitForFunction(()=>{
        const h=document.querySelector('[data-core-records] .rxa-document h3');
        const bounds=h?.getBoundingClientRect();
        return bounds && bounds.top>=0 && bounds.bottom<=innerHeight;
      });
      await shot('route-document');
      await root.locator('[data-core-records] [data-action="core-go"][data-step="route"]').click();
      assert.equal(await root.getAttribute('data-page'),'route');
    }
    await inspectHint('recipient','recipient-search');
    if(routing.disposition==='forward')await setRecipients(routing.recipientIds);
    else await root.locator('[data-core-disposition][value="internal"]').check();
    if(!legacy){
      await page.reload();
      await root.locator('[data-routing-search]').waitFor();
      assert.equal(await root.getAttribute('data-page'),'route');
      assert.equal(await root.locator('[data-routing-territory]').inputValue(),'');
      assert.equal(await root.locator('[data-action="core-step"][data-step="route"]').isEnabled(),true);
    }
    view=await operation('tutorial-step',root.locator('[data-step="route"][data-action="core-step"]'));
    assert.equal(currentStep(view)?.id,'draft',view.guidance.finding?.explanation);
    await go('decision');
    if(teacherAccepted)view=await recordPreviousRegistration(view);
    if(teacherExample)assert.equal(await root.locator('[data-response-field="sections.resolution"]').inputValue(),retainedDraft[locale]);
    if(stories){await verifyNoControl(view,{draft:true});await inspectHint('exampleLetter','draft-start');}
    else await inspectHint('draft','draft-start');
    const answer=view.guidance.decision.correspondence;
    let expected;
    const writeSubject=root.locator('[data-response-field="subject"]');
    if(stories){
      const prefill=await verifyExamplePrefill(view);
      view=prefill.view;
      expected=prefill.draft;
    }else{
      await writeSubject.fill(answer.subject);
      expected=answer;
    }
    if(width<500){
      await page.setViewportSize({width,height:Math.min(height,350)});
      await writeSubject.focus();
      await writeSubject.scrollIntoViewIfNeeded();
      if(!stories)await inspectHint('draft','draft-focused-compact');
      assert.equal(await writeSubject.evaluate(node=>node===document.activeElement),true);
      assert.equal(await writeSubject.inputValue(),expected.subject);
      await page.setViewportSize({width,height});
    }
    if(!stories){
      for(const [id,text] of Object.entries(answer.sections))await draftField('sections.'+id).fill(text);
      const caseSource=answer.citations.find(row=>row.kind==='document'||row.kind==='dialogue');
      assert.ok(caseSource);
      await addFactCitation(caseSource);
    }
    await checkDocumentKind(answer.kind,view.case.citizen.name,{leavePreview:stories});
    if(stories)for(const citation of view.coreSteps.values.citations)await verifyLinkedProvision(citation);
    await inspectHint('draftSubmit','draft-filled');
    if(stories)await root.getByRole('button',{name:exampleConfirm[locale],exact:true}).waitFor();
    view=await operation('tutorial-step',root.locator('[data-tour-target="draft-submit"]'));
    assert.equal(view.status,stories?'complete':'followup',view.guidance.finding?.explanation);
    assert.equal(view.decision.correspondence.subject,expected.subject);
    assert.deepEqual(view.decision.correspondence.sections,expected.sections);
    if(stories){
      await verifyNoControl(view);
      await checkMentor(view);
    }else if(full)await checkControl(view);
    if(stories){
      assert.equal(visitorMessages,1);
      assert.equal(row.visitedVisitorChat,true);
      row.visitorMessages=visitorMessages;
    }
    assert.deepEqual(row.errors,[]);
    row.status='pass';

    async function checkControl(shortly) {
      let view=shortly;
      const enter=root.locator('[data-tutorial-step="control"] [data-action="tutorial-choice"].primary');
      if(await enter.count())view=await operation('tutorial-step',enter);
      assert.equal(currentStep(view)?.id,'control-request');
      const open=root.locator('[data-action="mentor-open-work"]');
      if(await open.count())await open.click();
      await inspectHint('request','control-request');
      assert.ok(await root.locator('[data-control-action="select-kind"][data-kind="request_evidence"]').count());
      await root.locator('[data-control-action="select-kind"][data-kind="request_evidence"]').first().click();
      await inspectHint('request','control-form');
      await page.locator('[data-control-field="reason"]').fill('Для проверки жалобы нужны материалы и подтверждение рассмотрения по каждому доводу.');
      await page.locator('[data-control-field="instruction"]').fill('Предоставить предыдущее обращение, ответ и регистрационные сведения по нему.');
      await page.locator('[data-control-field="dueDate"]').fill(view.decision.deadline);
      await page.locator('[data-control-field="expectedResult"]').fill('Документы о рассмотрении предыдущего обращения по существу.');
      await page.locator('[data-control-field="evidenceSourceIds"]').first().check();
      const stored=await fixture.store.get('sessions/'+view.id);
      const workflow=stored.caseStates[stored.caseIndex].controlWorkflow;
      const spec=workflow.definition.issues.find(issue=>issue.id===view.controlWorkflow.issues[0].id);
      const requestRule=view.controlWorkflow.issues[0].availableActions.find(action=>action.kind==='request_evidence');
      const chooser=root.locator('[data-control-action="choose-recipient"]');
      if(requestRule.requiresRecipients===false)assert.equal(await chooser.count(),0);
      else{
        await chooser.click();
        await setRecipients(spec.acceptedRecipientSets[0]);
        await root.locator('[data-action="control-recipient-done"]').click();
      }
      view=await operation('control-action',page.locator('[data-control-action="execute"]'));
      assert.ok(view.controlWorkflow.journal.at(-1).accepted);
      assert.ok(view.controlWorkflow.journal.at(-1).materialIds.length);
      await inspectHint('advance','control-journal');
      const completedRequest=view.controlWorkflow.journal.at(-1);
      const documentId=spec.responseMaterialId;
      assert.ok(completedRequest.materialIds.includes(documentId));
      view=await operation('tutorial-step',root.locator('[data-action="mentor-check-action"]'));
      assert.equal(currentStep(view)?.id,'control-evidence',view.guidance.finding?.explanation);
      const received=root.locator(`[data-control-action="open-material"][data-material-id="${documentId}"]`).first();
      await inspectHint('evidence','received-material');
      await received.click();
      const opened=root.locator(`[data-control-material="${documentId}"]`);
      await opened.waitFor();
      await opened.locator('[data-control-action="close-material"]').click();
      await execute('verify',documentId);
      assert.equal(view.controlWorkflow.journal.at(-1).outcome,'evidence_verified');
      view=await operation('tutorial-step',root.locator('[data-action="mentor-check-action"]'));
      assert.equal(currentStep(view)?.id,'control-status',view.guidance.finding?.explanation);
      if(spec.deliveryRequired)await execute('notify',documentId);
      await inspectHint('status','control-status');
      await execute('close',documentId);
      view=await operation('tutorial-step',root.locator('[data-action="mentor-check-action"]'));
      assert.equal(currentStep(view)?.id,'control-memo',view.guidance.finding?.explanation);
      await inspectHint('record','control-memo');
      await root.locator('[data-action="mentor-open-work"]').click();
      const memo=view.guidance.control;
      await fillMemo(memo);
      view=await operation('tutorial-step',root.locator('[data-control-submit]'));
      assert.equal(view.control.text,memo.text,view.guidance.finding?.explanation);
      while(currentStep(view)){
        const action=root.locator(`[data-tutorial-step="${currentStep(view).id}"] [data-action="tutorial-choice"].primary`);
        view=await operation('tutorial-step',action);
      }
      view=await operation('next',root.locator('[data-action="next"]'));
      assert.equal(view.status,'complete');
      assert.equal(view.result.points,undefined);
      assert.ok(view.seminarProgress.exampleCompleted);
      await checkMentor(view);

      async function execute(kind, evidenceId) {
        const tool=root.locator(`[data-control-action="select-kind"][data-kind="${kind}"]`).first();
        await tool.click();
        await root.locator('[data-control-field="reason"]').fill('Сопоставлено относимое подтверждение и установлен результат по конкретному вопросу.');
        await root.locator('[data-control-field="instruction"]').fill('Отразить подтверждённый результат по вопросу в материалах дела.');
        const expected=root.locator('[data-control-field="expectedResult"]');
        if(await expected.count())await expected.fill('Зафиксировать документальное подтверждение установленного результата.');
        await root.locator(`[data-control-field="evidenceSourceIds"][data-source-id="${evidenceId}"]`).check();
        view=await operation('control-action',root.locator('[data-control-action="execute"]'));
        assert.ok(view.controlWorkflow.journal.at(-1).accepted,view.controlWorkflow.journal.at(-1).outcome);
      }
    }
    async function checkMentor(view) {
      assert.equal(view.result.points,undefined);
      assert.equal(await root.locator('[data-practice-score]').count(),0,'Worked examples have no practice score.');
      assert.ok(view.seminarProgress.exampleCompleted);
      if(stories){
        assert.equal(await root.locator('[data-action="start-journey"][data-stage="independent"]').count(),0);
        row.assessmentLockedAfterExample=true;
      }
      await toggle.waitFor({state:'detached'});
      view=await operation('start',root.locator('[data-action="start-journey"][data-stage="mentor"]'));
      assert.equal(view.journeyStage,'mentor');
      assert.equal(await toggle.getAttribute('aria-pressed'),'false');
      assert.equal(await ring.isVisible(),false);
      await toggle.click();
      await inspectHint('reception','practice-opt-in');
      await toggle.click();
      await ring.waitFor({state:'hidden'});
      if(!legacy){
        assert.equal(view.coreStepsVersion,coreStepsVersion);
        await root.locator('.rxt-mfc-intro').waitFor();
        await root.locator('[data-mentor-welcome] [data-action="mentor-open-chat"]').click();
        const question={ru:'Как определить срок передачи?',en:'How do I calculate the referral deadline?',zh:'怎样计算转送期限？'}[locale];
        await root.locator('[data-mentor-draft]').fill(question);
        view=await operation('mentor-question',root.locator('[data-mentor-form] button[type="submit"]'));
        assert.deepEqual(view.mentorMessages.map(row=>row.text),[question,mentorAnswer[locale]]);
        await shot('mentor-practice');
        await root.locator('[data-action="mentor-return"]').click();
        row.mentorSessionId=view.id;
        if(stories){
          assert.equal(view.seminarStoryVersion,seminarStoryVersion);
          assert.equal(view.case.id,'several-issues');
          assert.match(view.case.opening,/автобус в Москве|my Moscow bus|莫斯科公交/);
          assert.equal(view.guidance.question,undefined);
          assert.equal(view.messages.length,1);
        }
        view=await operation('tutorial-step',root.locator('[data-action="core-opening"]'));
        const practice=view.guidance.decision;
        for(const documentId of currentStep(view).documentIds||[]){
          await operation('document',root.locator(`[data-core-records] [data-action="document"][data-id="${documentId}"]`));
          await root.locator('[data-core-records] [data-action="documents-list"]').click();
        }
        await root.locator('[data-action="core-sources"]').click();
        for(const citation of practice.correspondence.citations.filter(row=>row.kind==='legal'))await attachLegal(citation,false);
        await operation('tutorial-step',root.locator('[data-action="core-step"][data-step="materials"]'));
        await chooseDate('referral',practice.workbook.referralDeadline,false);
        await chooseDate('deadline',practice.deadline,false);
        await registrationAnswer(practice.workbook.registrationTimely).check();
        assert.equal(await registrationAnswer(practice.workbook.registrationTimely).isChecked(),true);
        await operation('tutorial-step',root.locator('[data-action="core-step"][data-step="calendar"]'));
        assert.equal(await root.locator('[data-core-disposition]').count(),0);
        await setRecipients(practice.workbook.routing.recipientIds);
        view=await operation('tutorial-step',root.locator('[data-action="core-step"][data-step="route"]'));
        if(stories){await verifyNoControl(view,{draft:true});await verifyEmptyDraft();}
        const resolution=practicePartial?practiceResolution[locale]:independentText[locale].resolution;
        await fillIndependentReply(practice,{applicant:view.case.citizen.name,resolution});
        const inserted=stories?await verifyLegalInsertion(view):null;
        const submit=root.getByRole('button',{name:(stories?practiceSubmit:practiceCheck)[locale],exact:true});
        await submit.scrollIntoViewIfNeeded();
        if(stories)await shot('mentor-submit');
        view=await operation('tutorial-step',submit);
        assert.equal(view.status,stories?'complete':'followup',JSON.stringify(view.guidance.finding));
        assert.equal(view.decision.correspondence.sections.resolution,resolution);
        if(!stories)assert.equal(view.result,null);
        if(inserted){
          assert.equal(view.decision.correspondence.citations.filter(item=>item.id===inserted.id).length,1);
          assert.ok(view.decision.correspondence.sections.legalBasis.includes(inserted.quote));
          row.mentorDraft={blankOnFirstOpen:true,insertedLegalCitation:inserted.id,freeQuestionAnswered:true};
        }
        await shot('mentor-substantive-reply');
        if(stories){
          await verifyNoControl(view);
          assert.equal(view.result.points,undefined);
          assert.equal(view.result.practiceAssessment,true);
          assert.ok(view.seminarProgress.mentorCompleted);
          assert.equal(journalWrites,0);
          const practiceResult=root.locator('[data-practice-result]');
          await practiceResult.waitFor();
          const heading=await practiceResult.getByRole('heading',{level:1}).boundingBox();
          assert.ok(heading&&heading.y>=0&&heading.y+heading.height<=height,'The result heading must be in the viewport immediately after submission.');
          const score=practicePartial?60:100;
          assert.equal(view.result.total,score);
          assert.equal((await practiceResult.locator('[data-practice-score]').innerText()).replace(/\s+/g,' ').trim(),`${score} / 100`);
          assert.equal(await practiceResult.locator('[data-practice-perfect]').count(),practicePartial?0:1);
          assert.equal(await practiceResult.locator('[data-practice-cap]').count(),practicePartial?1:0);
          assert.equal(await practiceResult.locator('[data-practice-deduction]').count(),practicePartial?1:0);
          if(practicePartial){
            const deduction=practiceResult.locator('[data-practice-deduction="resolution"]');
            await deduction.getByText(practiceReason[locale],{exact:true}).waitFor();
            await deduction.getByText(practiceCorrection[locale],{exact:true}).waitFor();
          }
          row.mentorComplete={status:view.status,practiceScore:score,journalWrites};
          await shot('mentor-complete');
          await page.reload();
          await practiceResult.locator('[data-practice-score]').waitFor();
          assert.equal(await root.getAttribute('data-session-id'),view.id);
          assert.equal((await practiceResult.locator('[data-practice-score]').innerText()).replace(/\s+/g,' ').trim(),`${score} / 100`);
          assert.equal(journalWrites,0);
          row.mentorComplete.reloaded=true;
          const independent=await operation('start',root.locator('[data-action="start-journey"][data-stage="independent"]'));
          assert.equal(independent.journeyStage,'independent');
          assert.ok(independent.seminarProgress.exampleCompleted&&independent.seminarProgress.mentorCompleted);
          assert.equal(independent.guidance,undefined);
          row.unlockedIndependent=independent.id;
        }
      }
    }
  }catch(error){
    row.status='fail';
    row.error=error.stack||String(error);
    await shot('failure');
  }finally{
    await context.close();
    await new Promise(resolve=>fixture.server.close(resolve));
  }
}

try {
  for (const size of sizes)await run(size);
}finally {
  await browser.close();
  await writeFile(path.join(out,`coach-report-${arg('--viewport','all')}.json`),JSON.stringify({engine,scenario:legacy?'legacy':teacherAccepted?'teacher-accepted':teacherExample?'teacher-example':teacher?'teacher':anonymous?'anonymous':stories&&scored?'stories-independent':scored?'independent':practicePartial?'stories-practice-partial':stories?'stories':'mfc',browserPath:'Playwright with the real app and local fixture service',report},null,2)+'\n');
}
for (const result of report)console.log(result.key,result.status,result.error||`${result.checks.length} rendered hints`);
if(report.some(result=>result.status!=='pass'))process.exitCode=1;
