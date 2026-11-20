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

const arg=(key, fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const engine=arg('--browser','chromium');
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
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY??='1';
await mkdir(out,{recursive:true});
const browser=await launcher.launch({headless:true});
const report=[];

async function run({width,height,locale,full}) {
  const key=`${width}x${height}-${locale}`;
  const row={key,status:'running',sessionId:null,checks:[],screenshots:[],errors:[]};
  report.push(row);
  const fixture=await createReceptionFixture({
    casesDirectory:arg('--cases',process.env.RECEPTION_AI_CASES_DIR),
    provider:{...createScriptedCorrespondenceReviewer({reviews:[explicitQAReview]}),name:'mock',
      async generate(){throw Error('The worked example uses the prepared dialogue.');}},
    decisionVersion:'correspondence-v1',controlVersion:'execution-v1',
    serviceOptions:{requireGameplay:true,requireSeminarJourney:true,guidedSeminarCore:true},
  });
  await new Promise((resolve,reject)=>{fixture.server.once('error',reject);fixture.server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${fixture.server.address().port}`;
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
  async function attachLegal(citation) {
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
    await inspectHint('lawUse','attach-provision');
    await reader.locator('[data-source-reference-use]').click();
    await page.locator(`[data-core-citation="${citation.sourceId}"]`).waitFor();
  }
  async function chooseDate(id,date) {
    await page.locator(`[data-calendar-action="target"][data-target="${id}"]`).click();
    await inspectHint('calendarDay',id==='referral'?'calendar-date':null);
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
      await page.locator(`[data-routing-recipient][value="${authority.id}"]`).check();
    }
  }

  try {
    const response=await page.goto(origin+'/__qa/reception.html?context=seminar&lang='+locale);
    assert.equal(response.status(),200);
    assert.match(await page.title(),/Приёмная/);
    await root.locator('[data-journey-card="example"]').waitFor();
    let view=await operation('start',root.locator('[data-action="start-journey"][data-stage="example"]'));
    row.sessionId=view.id;
    assert.equal(view.coreStepsVersion,'guided-core-v1');
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
    await inspectHint('routing','route');
    const routing=view.guidance.decision.workbook.routing;
    // Probe the live catalogue even when the example should stay within the authority.
    await root.locator('[data-core-disposition][value="forward"]').check();
    await inspectHint('recipient','recipient-search');
    if(routing.disposition==='forward')await setRecipients(routing.recipientIds);
    else await root.locator('[data-core-disposition][value="internal"]').check();
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
    const picker=root.locator('[data-response-section="facts"] details');
    if(await picker.count() && !await picker.evaluate(node=>node.open))await picker.locator('summary').click();
    const source=root.locator('[data-response-source="facts"]');
    const sourceKey=await source.locator('option').evaluateAll((choices,id)=>choices.find(item=>item.value.endsWith(':'+id))?.value,caseSource.sourceId);
    assert.ok(sourceKey);
    await source.selectOption(sourceKey);
    await root.locator('[data-response-source-quote="facts"]').fill(caseSource.quote);
    await root.locator('[data-response-action="attach-source"][data-section="facts"]').click();
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
      await page.locator('[data-control-action="choose-recipient"]').click();
      const stored=await fixture.store.get('sessions/'+view.id);
      const workflow=stored.caseStates[stored.caseIndex].controlWorkflow;
      const spec=workflow.definition.issues.find(issue=>issue.id===view.controlWorkflow.issues[0].id);
      await setRecipients(spec.acceptedRecipientSets[0]);
      await page.locator('[data-action="control-recipient-done"]').click();
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
      for(const {issueId,status,evidenceSourceIds} of memo.statuses) {
        const field=page.locator(`[data-response-status-field][data-issue-id="${issueId}"]`);
        await field.selectOption(status);
        const proof=root.locator('.rxe-final-issue').filter({has:field}).locator('.rxe-final-sources');
        if(!await proof.evaluate(node=>node.open))await proof.locator('summary').click();
        for(const materialId of evidenceSourceIds)await proof.locator(`[data-response-status-evidence="${materialId}"]`).check();
      }
      await root.locator('[data-response-control-field="text"]').fill(memo.text);
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
  await writeFile(path.join(out,`coach-report-${arg('--viewport','all')}.json`),JSON.stringify({engine,report},null,2)+'\n');
}
for (const result of report)console.log(result.key,result.status,result.error||`${result.checks.length} rendered hints`);
if(report.some(result=>result.status!=='pass'))process.exitCode=1;
