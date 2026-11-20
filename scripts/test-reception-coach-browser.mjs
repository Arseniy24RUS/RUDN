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
import {SEMINAR_EXAMPLE,seminarPointsAt,tutorialGuide,tutorialExecutionAction,validatedTutorialMemo} from '../firebase/functions/reception-ai/seminar-journey.mjs';

const arg=(key, fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const engine=arg('--browser','chromium');
const legacy=process.argv.includes('--legacy');
const scored=process.argv.includes('--scored')||process.argv.includes('--teacher');
const teacher=process.argv.includes('--teacher');
assert.ok(!(legacy&&scored),'--legacy and --scored/--teacher are separate browser runs.');
const coreStepsVersion=legacy?null:'mfc-referral-v2';
assert.ok(['chromium','webkit'].includes(engine));
const modulePath=arg('--playwright-module',process.env.RECEPTION_PLAYWRIGHT_MODULE);
const {[engine]:launcher}=await import(modulePath?pathToFileURL(path.resolve(modulePath)).href:'playwright');
const out=path.resolve(arg('--out',path.join(os.tmpdir(),'reception-coach-browser')),engine);
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
const mentorAnswer={ru:'Рассчитайте сроки передачи и ответа по отдельности.',en:'Calculate the referral and reply deadlines separately.',zh:'请分别计算转送期限和答复期限。'};
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
  const fixture=await createReceptionFixture({
    casesDirectory:arg('--cases',process.env.RECEPTION_AI_CASES_DIR),
    provider:{...createScriptedCorrespondenceReviewer({reviews:[explicitQAReview,explicitQAReview]}),name:'mock',
      async generate(){throw Error('The practice tests use the prepared case records.');},
      async answerMentor(){return {reply:mentorAnswer[locale],usage:{inputTokens:0,outputTokens:0}};},
      async reviewMentorWork(){return {ready:true,feedback:mentorAnswer[locale],usage:{inputTokens:0,outputTokens:0}};},
    },
    decisionVersion:'correspondence-v1',controlVersion:'execution-v1',coreStepsVersion,teacher,
    caseIds:scored||full&&!legacy?[SEMINAR_EXAMPLE.caseId,'several-issues']:null,
    serviceOptions:{requireGameplay:true,requireSeminarJourney:true,guidedSeminarCore:true,
      canStartAssessment:async()=>!teacher,saveResult:async()=>{journalWrites++;}},
  });
  if(scored){
    const owner=teacher?'teacher:'+fixture.identity.uid:'student:'+fixture.identity.studentKey;
    // Test setup only. Every action in the new independent attempt comes from rendered controls.
    await fixture.store.transaction('seminarProgress/'+hash(owner),()=>({
      mfcJourney:{example:{completed:true},mentor:{completed:true}},
    }));
  }
  const checkLegacyResume=!legacy&&!scored&&width===390;
  const older=checkLegacyResume?(await fixture.service.handle({op:'start',context:'seminar',mode:'training',locale,
    journeyStage:'example',workbookVersion:2,decisionVersion:'correspondence-v1',controlVersion:'execution-v1',
    requestId:'save-previous-example'},fixture.identity)).view:null;
  await new Promise((resolve,reject)=>{fixture.server.once('error',reject);fixture.server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${fixture.server.address().port}`;
  row.origin=origin;
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<500,isMobile:width<500,serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  page.setDefaultTimeout(8000);
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
      const controls=[...document.querySelectorAll('#receptionAI button,#receptionAI input,#receptionAI textarea,#receptionAI select,#receptionAI summary')];
      const covered=controls.filter(node=>{
        if(node===target||!node.getClientRects().length||!visible)return false;
        const box=intersection(intersection(cardBounds,clipped(node)),viewport);
        if(box.right-box.left<=1||box.bottom-box.top<=1)return false;
        const hit=document.elementFromPoint((box.left+box.right)/2,(box.top+box.bottom)/2);
        return hit===node||node.contains(hit);
      });
      return {
        focused:document.activeElement===target, visible, arrow:!document.querySelector('.rxa-tour-arrow').hidden,
        pointerEvents:getComputedStyle(ring).pointerEvents, ringMatches:overlap(ringBounds,targetBounds),
        targetOverlap:visible&&overlap(cardBounds,targetBounds),
        coversOtherControl:covered.map(node=>node.dataset.action||node.dataset.controlAction||node.dataset.calendarAction||node.tagName.toLowerCase()),
        insideViewport:!visible||card.classList.contains('rxa-tour-inline')||(cardBounds.left>=viewport.left-1&&cardBounds.top>=viewport.top-1&&cardBounds.right<=viewport.right+1&&cardBounds.bottom<=viewport.bottom+1),
        targetLabel:target.getAttribute('aria-label')||target.dataset.action||target.dataset.responseField||target.tagName.toLowerCase(),
      };
    });
    assert.ok(geometry.ringMatches&&geometry.pointerEvents==='none'&&geometry.insideViewport&&!geometry.targetOverlap&&geometry.coversOtherControl.length===0,JSON.stringify(geometry));
    if (bubble) assert.ok(geometry.arrow);
    row.checks.push({hint:expected,...geometry});
    if(name)await shot(name);
  }
  async function attachLegal(citation, hints=!scored) {
    const act=page.locator(`[data-core-law] [data-normative-doc="${citation.sourceId}"]`).first();
    await act.click();
    const reader=page.locator('.rx-source-embedded');
    const search=reader.locator('[data-input="reader-query"]');
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
  async function fillIndependentReply(model,{omitConclusion=false}={}) {
    const {facts,legalBasis,resolution,nextSteps}=independentText[locale];
    const draft=root.locator('[data-correspondence-editor]');
    await draft.waitFor();
    const recipients=model.workbook.routing.recipientIds.map(id=>
      localizedAuthorityName(RECEPTION_AUTHORITIES.find(authority=>authority.id===id),locale)).join(' / ');
    await draft.locator('[data-response-field="kind"]').selectOption(model.correspondence.kind);
    await draft.locator('[data-response-field="subject"]').fill(model.correspondence.subject);
    const sections={facts,legalBasis,nextSteps:nextSteps(recipients,model.workbook.referralDeadline,model.deadline),
      ...(!omitConclusion?{resolution}:{})};
    for(const [id,value] of Object.entries(sections))await draft.locator(`[data-response-field="sections.${id}"]`).fill(value);
    for(const citation of model.correspondence.citations.filter(item=>item.kind==='document'))await addFactCitation(citation);
  }
  async function runIndependent() {
    let view=await operation('start',root.locator('[data-action="start-journey"][data-stage="independent"]'));
    row.sessionId=view.id;
    row.coreStepsVersion=view.coreStepsVersion;
    assert.equal(view.coreStepsVersion,coreStepsVersion);
    assert.equal(view.case.id,'several-issues');
    assert.equal(view.guidance,undefined);
    assert.equal(await root.locator('[data-action="mentor-toggle"],.rxa-tour-toggle').count(),0);
    await root.locator('.rxt-mfc-intro').waitFor();
    await shot('independent-intake');
    const {caseData}=await readSession(view);
    const profile=privateCorrespondenceProfile(caseData,locale);
    const guide=tutorialGuide(caseData,profile,locale,{execution:true,core:true,coreStepsVersion});
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
    await root.locator('.rxt-calendar-rules').waitFor();
    await shot('independent-counting-rules');
    const nextDate=root.locator('[data-action="core-step"][data-step="calendar"]');
    await chooseDate('referral',model.workbook.referralDeadline);
    await root.locator(`[data-core-registration][value="${model.workbook.registrationTimely}"]`).check();
    assert.equal(await nextDate.isEnabled(),false);
    await page.reload();
    await root.locator('[data-calendar-action="clear"][data-target="referral"]').waitFor();
    assert.equal(await root.getAttribute('data-page'),'calendar');
    await chooseDate('deadline',model.deadline);
    assert.equal(await nextDate.isEnabled(),true);
    await shot('independent-both-dates');
    view=await operation('core-step',nextDate);
    await root.locator('[data-routing-search]').waitFor();
    assert.equal(await root.locator('[data-routing-territory]').inputValue(),view.case.workbook.site?.territoryId||'');
    assert.equal(await root.locator('[data-core-disposition]').count(),0);
    const extraRouteFields=root.locator('.rxt-route-choice :is(input,select,textarea):not([data-routing-search],[data-routing-territory],[data-routing-recipient])');
    assert.equal(await extraRouteFields.count(),0);
    const expectedIds=model.workbook.routing.recipientIds;
    assert.equal(expectedIds.length,2);
    await setRecipients(expectedIds);
    await shot('independent-two-authorities');
    view=await operation('core-step',root.locator('[data-action="core-step"][data-step="route"]'));
    assert.deepEqual(view.coreSteps.values.routing.recipientIds,expectedIds);
    const submit=root.locator('[data-decision-form] [type="submit"]');
    await fillIndependentReply(model,{omitConclusion:true});
    assert.equal(await root.locator('[data-decision-form]').count(),1);
    assert.equal(await root.locator('[data-response-action="add-order"]').count(),0);
    await submit.click();
    const resolutionField=root.locator('[data-response-field="sections.resolution"]');
    assert.equal(await resolutionField.evaluate(node=>node===document.activeElement),true);
    await resolutionField.fill(resolution);
    await shot('independent-substantive-reply');
    view=await operation('decide',submit);
    assert.equal(view.status,'followup');
    assert.equal(view.decision.correspondence.sections.resolution,resolution);
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
    if(older){
      const resumed=await operation('resume',root.locator(`.rxt-recover [data-action="resume-session"][data-id="${older.id}"]`));
      assert.equal(resumed.coreStepsVersion,'guided-core-v1');
      assert.equal(resumed.id,older.id);
      assert.equal(await root.locator('.rxt-mfc-intro').count(),0);
      await root.locator('[data-action="choose-case"]').click();
      row.legacySessionId=older.id;
    }
    let view=await operation('start',root.locator('[data-action="start-journey"][data-stage="example"]'));
    row.sessionId=view.id;
    row.coreStepsVersion=view.coreStepsVersion;
    assert.equal(view.coreStepsVersion,coreStepsVersion||'guided-core-v1');
    assert.equal(await root.locator('.rxt-mfc-intro').count(),legacy?0:1);
    assert.equal(await root.getAttribute('lang'),locale);
    assert.equal(await toggle.getAttribute('aria-pressed'),'true');
    await inspectHint('reception','opening',{bubble:true});
    await toggle.click();
    await ring.waitFor({state:'hidden'});
    await toggle.press('Space');
    await ring.waitFor();
    const opening=root.locator('[data-action="core-opening"]');
    view=await operation('tutorial-step',opening);
    assert.equal(currentStep(view)?.id,'materials');
    for(const documentId of currentStep(view).documentIds||[]){
      await go('reception');
      const record=root.locator(`[data-core-records] [data-action="document"][data-id="${documentId}"]`);
      await inspectHint('materials','case-material');
      view=await operation('document',record);
      assert.ok(view.openedDocumentIds.includes(documentId));
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
    await inspectHint('calendarKind','calendar-type');
    const calendarModel=view.guidance.decision;
    const targets=view.case.workbook.targets;
    if(!legacy){
      assert.deepEqual(targets.map(target=>target.id),['referral','deadline']);
      for(const {anchorId} of targets)assert.ok(view.case.workbook.events.some(event=>event.id===anchorId),anchorId);
      assert.ok(await root.locator('.rxt-calendar-rules').isVisible());
    }
    for(const {id} of targets){
      await chooseDate(id,id==='referral'?calendarModel.workbook.referralDeadline:calendarModel.deadline);
    }
    const registration=root.locator(`[data-core-registration][value="${calendarModel.workbook.registrationTimely}"]`);
    if(await registration.count())await registration.check();
    await inspectHint('advance','calendar-saved');
    view=await operation('tutorial-step',root.locator('[data-step="calendar"][data-action="core-step"]'));
    assert.equal(currentStep(view)?.id,'route',view.guidance.finding?.explanation);
    assert.equal(view.coreSteps.values.calendar.deadline,calendarModel.deadline);
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
    await inspectHint('draft','draft-start');
    const answer=view.guidance.decision.correspondence;
    const writeSubject=root.locator('[data-response-field="subject"]');
    await writeSubject.fill(answer.subject);
    if(width<500){
      await page.setViewportSize({width,height:Math.min(height,350)});
      await writeSubject.focus();
      await writeSubject.scrollIntoViewIfNeeded();
      await inspectHint('draft','draft-focused-compact');
      assert.equal(await writeSubject.evaluate(node=>node===document.activeElement),true);
      assert.equal(await writeSubject.inputValue(),answer.subject);
      await page.setViewportSize({width,height});
    }
    for(const [id,text] of Object.entries(answer.sections)){
      await root.locator(`[data-response-field="sections.${id}"]`).fill(text);
    }
    await root.locator('[data-response-field="kind"]').selectOption(answer.kind);
    const caseSource=answer.citations.find(row=>row.kind==='document'||row.kind==='dialogue');
    assert.ok(caseSource);
    await addFactCitation(caseSource);
    await inspectHint('draftSubmit','draft-filled');
    view=await operation('tutorial-step',root.locator('[data-tour-target="draft-submit"]'));
    assert.equal(view.status,'followup',view.guidance.finding?.explanation);
    assert.equal(view.decision.correspondence.sections.nextSteps,answer.sections.nextSteps);
    assert.equal(view.decision.correspondence.sections.legalBasis,answer.sections.legalBasis);
    if(full)await checkControl(view);
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
        await root.locator('.rxa-top [data-action="mentor-toggle"]').click();
        const question={ru:'Как определить срок передачи?',en:'How do I calculate the referral deadline?',zh:'怎样计算转送期限？'}[locale];
        await root.locator('[data-mentor-draft]').fill(question);
        view=await operation('mentor-question',root.locator('[data-mentor-form] button[type="submit"]'));
        assert.deepEqual(view.mentorMessages.map(row=>row.text),[question,mentorAnswer[locale]]);
        await shot('mentor-practice');
        await root.locator('.rxt-mentor-top [data-action="mentor-toggle"]').click();
        row.mentorSessionId=view.id;
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
        await root.locator(`[data-core-registration][value="${practice.workbook.registrationTimely}"]`).check();
        await operation('tutorial-step',root.locator('[data-action="core-step"][data-step="calendar"]'));
        assert.equal(await root.locator('[data-core-disposition]').count(),0);
        await setRecipients(practice.workbook.routing.recipientIds);
        await operation('tutorial-step',root.locator('[data-action="core-step"][data-step="route"]'));
        await fillIndependentReply(practice);
        view=await operation('tutorial-step',root.locator('[data-tour-target="draft-submit"]'));
        assert.equal(view.status,'followup',JSON.stringify(view.guidance.finding));
        assert.equal(view.decision.correspondence.sections.resolution,independentText[locale].resolution);
        assert.equal(view.result,null);
        await shot('mentor-substantive-reply');
      }

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
  await writeFile(path.join(out,`coach-report-${arg('--viewport','all')}.json`),JSON.stringify({engine,scenario:legacy?'legacy':teacher?'teacher':scored?'independent':'mfc',report},null,2)+'\n');
}
for (const result of report)console.log(result.key,result.status,result.error||`${result.checks.length} rendered hints`);
if(report.some(result=>result.status!=='pass'))process.exitCode=1;
