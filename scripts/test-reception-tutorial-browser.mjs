#!/usr/bin/env node
/** Browser audit of the Reception route using a local service and supplied case bank.
 * Mentor and assessment responses are scripted. No live provider or Firebase is used.
 */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';
import {createScriptedCorrespondenceReviewer} from './reception-correspondence-test-reviewer.mjs';
import {explicitQAReview} from './reception-correspondence-qa-cases.mjs';
import {buildBankDecision} from './reception-bank-submission-fixtures.mjs';
import {RECEPTION_AUTHORITIES} from '../site/apps/reception/ai/authority-directory.js';
import {getCorrespondenceProfile} from '../firebase/functions/reception-ai/correspondence-profiles.mjs';
import {tutorialGuide, seminarPointsAt} from '../firebase/functions/reception-ai/seminar-journey.mjs';
import {acceptableLegalProvisions, hasApplicableLegalCitation} from '../firebase/functions/reception-ai/normative-acts.mjs';

const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name)+1] : fallback;
const out = path.resolve(arg('--out', path.join(os.tmpdir(),'reception-tutorial-browser')));
const modulePath = arg('--playwright-module', process.env.RECEPTION_PLAYWRIGHT_MODULE);
const scenarios = [
  {width:1440,height:1000,locale:'ru',full:true},
  {width:390,height:844,locale:'en',full:true},
  {width:430,height:932,locale:'zh',full:true},
  {width:320,height:568,locale:'ru',full:false},
  {width:844,height:390,locale:'zh',full:false},
];
const selected = arg('--viewport');
const targets = scenarios.filter(({width})=>!selected||String(width)===selected);
assert.ok(targets.length, 'Use --viewport 1440, 390, 430, 320 or 844.');
await mkdir(out,{recursive:true});
const {chromium} = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : 'playwright');
const browser = await chromium.launch({headless:true,executablePath:arg('--executable',undefined)});
const report = [];
const mentorReply = {ru:'Сначала установите предмет обращения и свои полномочия.',en:'Start by identifying the matter and your authority.',zh:'先确认来信事项和自身职权。'};
const normativeProvisions = JSON.parse(await readFile(
  new URL('../firebase/functions/reception-ai/normative-provisions.json',import.meta.url),'utf8'));
const studentDraftText = 'По своему проекту отдельно сверю вывод с подтверждающими материалами.';
const workFeedbackText = 'Сохраните связь между выводом, его основанием и следующим действием.';
const studentActionText = 'Представьте относимое документальное подтверждение именно этого результата.';
const studentMemoText = 'Я сопоставил каждый статус с доступной записью и зафиксировал результат отдельно.';
const mentorQuestion = {ru:'С чего начать и почему?',en:'What should I do next, and why?',zh:'下一步应做什么，为什么？'};

async function verify(target) {
  const {width,height,locale,full} = target;
  const key = `${width}x${height}-${locale}`;
  const row = {key,status:'running',checks:[],screenshots:[],errors:[]};
  report.push(row);
  const reviewer = createScriptedCorrespondenceReviewer({reviews:[explicitQAReview,explicitQAReview,
    context=>explicitQAReview(context,{initialLevel:0}),context=>explicitQAReview(context,{controlLevel:0})]});
  const provider = {...reviewer,name:'mock',async generate(){throw Error('The actor is unused in this fixture.');},
    async answerMentor(){return {reply:mentorReply[locale],usage:{inputTokens:0,outputTokens:0}};},
    async reviewMentorWork({work}){
      assert.ok(work);
      return {ready:true,feedback:workFeedbackText,usage:{inputTokens:0,outputTokens:0}};
    },
  };
  const fixture = await createReceptionFixture({
    casesDirectory:arg('--cases', process.env.RECEPTION_AI_CASES_DIR),provider,
    decisionVersion:'correspondence-v1',controlVersion:'execution-v1',
    serviceOptions:{requireGameplay:true,requireSeminarJourney:true},
  });
  await new Promise((resolve,reject)=>{fixture.server.once('error',reject);fixture.server.listen(0,'127.0.0.1',resolve);});
  const origin = 'http://127.0.0.1:'+fixture.server.address().port;
  const context = await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500});
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror',error=>row.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')row.errors.push(message.text());});
  const root = page.locator('#receptionAI');
  const idle = () => page.locator('#receptionAI[aria-busy="false"]').waitFor();
  const check = text => row.checks.push(text);
  async function shot(name, selector) {
    if(selector)await page.locator(selector).first().scrollIntoViewIfNeeded();
    const filename = `${key}-${name}.png`;
    await page.screenshot({path:path.join(out,filename),animations:'disabled'});
    row.screenshots.push(filename);
  }
  async function operation(op, selector) {
    const reply = page.waitForResponse(res=>res.url()===origin+'/api/reception'&&res.request().method()==='POST'&&res.request().postDataJSON()?.op===op);
    await page.locator(selector).first().click();
    const response = await reply;
    const data = await response.json();
    assert.equal(response.ok(),true,JSON.stringify(data.error));
    await idle();
    return data.view;
  }
  async function openRequiredDocs(step, view) {
    for(const id of step.documentIds || []){
      if(view.openedDocumentIds.includes(id))continue;
      view=await operation('document',`[data-tutorial-step] [data-action="document"][data-id="${id}"]`);
      assert.ok(view.openedDocumentIds.includes(id));
    }
    return view;
  }
  async function seedPreparedDraft(view) {
    const stored = await fixture.store.get('sessions/'+view.id);
    const caseData = stored.caseData[stored.caseIndex];
    const model = tutorialGuide(caseData,getCorrespondenceProfile(caseData.id),locale,{execution:true}).decision;
    const draft = buildBankDecision(caseData,view,locale,{recipientIds:model.workbook.routing.recipientIds});
    const provisions = acceptableLegalProvisions(caseData);
    const legal = Object.entries(provisions).flatMap(([docId,articles])=>articles.flatMap(article=>
      (normativeProvisions[docId]?.[article]||[]).map(([unitId,text])=>({docId,unitIds:[unitId],text:text.slice(0,900)}))))
      .find(citation=>hasApplicableLegalCitation(caseData,citation));
    if(legal)draft.correspondence.citations[1]={id:'qa-law',section:'legalBasis',kind:'legal',
      sourceId:legal.docId,unitIds:legal.unitIds,quote:legal.text.trim()};
    await context.addInitScript(({draft,sessionId})=>{
      const key='rudn.reception.workspace.v2:reception-repair-qa:'+encodeURIComponent('/api/reception')+':current';
      const done='reception-qa-prepared:'+sessionId;
      const saved=JSON.parse(localStorage.getItem(key)||'null');
      if(saved?.sessionId===sessionId&&!sessionStorage.getItem(done)){
        localStorage.setItem(key,JSON.stringify({...saved,decisionDraft:draft,page:'decision',responsePreview:false}));
        sessionStorage.setItem(done,'1');
      }
    },{draft,sessionId:view.id});
    await page.reload();
    await root.locator('[data-correspondence-editor]').waitFor();
  }
  async function writeMemo(statuses, text) {
    for(const {issueId,status,evidenceSourceIds} of statuses){
      const field = page.locator(`[data-response-status-field][data-issue-id="${issueId}"]`);
      await field.selectOption(status);
      const block = page.locator('.rxe-final-issue').filter({has:field});
      const evidence = block.locator('.rxe-final-sources');
      for(const id of evidenceSourceIds){
        if(await evidence.getAttribute('open')===null)await evidence.locator('summary').click();
        await block.locator(`[data-response-status-evidence="${id}"]`).check();
      }
    }
    await page.locator('[data-response-control-field="text"]').fill(text);
  }
  async function mentorControlRequest(view) {
    const current = await fixture.store.get('sessions/'+view.id);
    const workflow = current.caseStates[current.caseIndex].controlWorkflow;
    const spec = workflow.definition.issues.find(issue=>issue.responseMaterialId&&issue.acceptedRecipientSets?.[0]?.length&&
      workflow.materials.some(material=>material.issueIds.includes(issue.id))&&
      !workflow.materials.some(material=>issue.evidenceMaterialIds.includes(material.id)&&material.verification==='confirmation'));
    if(!spec)return view;
    await page.locator(`[data-control-action="select-issue"][data-issue-id="${spec.id}"]`).click();
    await page.locator('[data-control-action="select-kind"][data-kind="request_evidence"]').click();
    await page.locator('[data-control-field="reason"]').fill('Подтверждение по этому вопросу ещё требуется.');
    await page.locator('[data-control-field="instruction"]').fill(studentActionText);
    await page.locator('[data-control-field="dueDate"]').fill(view.decision.deadline);
    await page.locator('[data-control-field="expectedResult"]').fill('Документ, относящийся к указанному вопросу.');
    const source=workflow.materials.find(material=>material.issueIds.includes(spec.id));
    await page.locator(`[data-control-field="evidenceSourceIds"][data-source-id="${source.id}"]`).check();
    await page.locator('[data-control-action="choose-recipient"]').click();
    await page.locator('[data-routing-territory]').selectOption('');
    for (const id of spec.acceptedRecipientSets[0]) {
      const authority = RECEPTION_AUTHORITIES.find(row=>row.id===id || row.careerId===id);
      assert.ok(authority,id);
      await page.locator('[data-routing-search]').fill(authority.name.slice(0,110));
      await page.locator(`[data-routing-recipient][value="${authority.id}"]`).check();
    }
    await page.locator('[data-action="control-recipient-done"]').click();
    view=await operation('control-action','[data-control-action="execute"]');
    assert.ok(view.controlWorkflow.journal.at(-1).accepted);
    assert.equal(view.controlWorkflow.journal.at(-1).instruction,studentActionText);
    await shot('mentor-own-control-action','.rxe-journal');
    check('A learner composes and sends a real mentored evidence request; the accepted action retains the learner’s wording in the journal.');
    return view;
  }
  async function walkthrough(view, example) {
    const seen = [];
    while (view.guidance?.steps?.[view.guidance.stepIndex]) {
      const step = view.guidance.steps[view.guidance.stepIndex];
      seen.push(step.id);
      const guide = page.locator(`[data-tutorial-step="${step.id}"]`);
      await guide.waitFor();
      if(await guide.locator('[data-action="page"]').count())await guide.locator('[data-action="page"]').click();
      view=await openRequiredDocs(step,view);
      if(step.id==='control-evidence'&&await guide.locator('[data-control-action="open-material"]').count()){
        await guide.locator('[data-control-action="open-material"]').click();
        await page.locator('[data-control-material] .rxe-material-text').waitFor();
        if(example)await shot('received-evidence','[data-control-material]');
      }
      if(example&&await guide.locator('[data-action="tutorial-sample"]').count()){
        await guide.locator('[data-action="tutorial-sample"]').click();
        if(step.id==='draft'){
          const preview=page.locator('[data-correspondence-preview]');
          assert.equal(await preview.locator('.rxc-letter-block').count(),4);
          assert.ok((await preview.locator('.rxc-letter-body').innerText()).trim().length>120);
          assert.equal(await preview.locator('.rxc-project-mark,[data-response-action="print"],[data-response-action="download"]').count(),0);
          await preview.locator('[data-response-action="edit"]').click();
          await page.locator('[data-correspondence-editor] [data-response-action="preview"]').click();
          await preview.locator('.rxc-letter-body').waitFor();
          await shot('sample-response','[data-correspondence-preview] .rxc-letter-head');
        }
        if(step.id==='control-memo'){
          const memo=page.locator('[data-control-memorandum]');
          await memo.waitFor();
          assert.ok((await memo.locator('[data-response-control-field="text"]').inputValue()).trim().length>30);
          await shot('sample-control','[data-control-memorandum]');
        }
      }
      if(!example&&step.id==='reception'){
        const wrong=step.choices.find(choice=>choice.id==='assume');
        view=await operation('tutorial-step',`[data-action="tutorial-choice"][data-choice="${wrong.id}"]`);
        assert.equal(view.guidance.steps[view.guidance.stepIndex].id,step.id);
        assert.equal(view.guidance.finding.correctChoiceId,'role');
        assert.equal(view.result,null);
        await shot('mentor-correction','[data-tutorial-step]');
      }
      if(!example&&['control-request','control-evidence','control-status'].includes(step.id)){
        if(locale==='ru'&&step.id==='control-request'){
          view=await mentorControlRequest(view);
          view=await operation('tutorial-step','[data-action="mentor-check-action"]');
        }
        if(view.guidance.steps[view.guidance.stepIndex]?.id===step.id)
          view=await operation('tutorial-step','[data-action="mentor-use-sample"]');
        assert.notEqual(view.guidance.steps[view.guidance.stepIndex]?.id,step.id);
        continue;
      }
      if(!example&&['draft','control-memo'].includes(step.id)){
        if(locale!=='ru')view=await operation('tutorial-step','[data-action="mentor-use-sample"]');
        else if(step.id==='draft'){
          const submit='[data-decision-form] button[type="submit"]';
          const subject=page.locator('[data-response-field="subject"]');
          const next=page.locator('[data-response-field="sections.nextSteps"]');
          await subject.fill('Мой черновик');
          await next.fill(studentDraftText);
          view=await operation('tutorial-step',submit);
          assert.equal(view.guidance.steps[view.guidance.stepIndex].id,'draft');
          assert.ok(view.guidance.finding.explanation);
          assert.equal(await next.inputValue(),studentDraftText);
          await page.locator('[data-action="tutorial-sample"]').click();
          await page.locator('[data-tutorial-model] .rxc-letter-body').waitFor();
          assert.equal(await next.inputValue(),studentDraftText);
          await seedPreparedDraft(view);
          await next.fill(studentDraftText);
          view=await operation('tutorial-step',submit);
          assert.equal(view.decision?.correspondence.sections.nextSteps,studentDraftText,view.guidance.finding?.explanation);
          assert.equal(view.guidance.workFeedback?.text,workFeedbackText);
          await page.getByText(workFeedbackText,{exact:true}).waitFor();
        }else{
          await page.locator('[data-action="mentor-open-work"]').click();
          const submit='[data-control-submit]';
          await page.locator('[data-response-control-field="text"]').fill(studentMemoText);
          view=await operation('tutorial-step',submit);
          assert.equal(view.guidance.steps[view.guidance.stepIndex].id,'control-memo');
          assert.equal(await page.locator('[data-response-control-field="text"]').inputValue(),studentMemoText);
          await writeMemo(view.guidance.control.statuses,studentMemoText);
          view=await operation('tutorial-step',submit);
          assert.equal(view.control?.text,studentMemoText,view.guidance.finding?.explanation);
          assert.equal(view.guidance.workFeedback?.stepId,'control-memo');
          assert.equal(view.guidance.workFeedback?.text,workFeedbackText);
          await page.getByText(workFeedbackText,{exact:true}).waitFor();
          await shot('mentor-work-feedback','[data-mentor-work-feedback]');
        }
        assert.notEqual(view.guidance.steps[view.guidance.stepIndex]?.id,step.id);
        continue;
      }
      // The worked example marks the correct choice. In practice deliberately
      // exercise correction if the initial choice is not the intended one.
      for(let attempt=0;attempt<2;attempt++){
        const marked=guide.locator('[data-action="tutorial-choice"].primary');
        if(await marked.count()===0)await guide.locator('[data-action="tutorial-choice"]').first().waitFor();
        view=await operation('tutorial-step',await marked.count()
          ? `[data-tutorial-step="${step.id}"] [data-action="tutorial-choice"].primary`
          : `[data-tutorial-step="${step.id}"] [data-action="tutorial-choice"]`);
        if(view.guidance.steps[view.guidance.stepIndex]?.id!==step.id)break;
      }
      assert.notEqual(view.guidance.steps[view.guidance.stepIndex]?.id,step.id,'The step must advance after a correction');
      if(step.id==='control-request'&&example)assert.ok(view.controlWorkflow.journal.some(event=>event.outcome==='request_received'));
      if(step.id==='control-evidence'&&example)assert.ok(view.controlWorkflow.journal.some(event=>event.outcome==='evidence_verified'));
      if(step.id==='control-status'&&example)assert.ok(view.controlWorkflow.journal.some(event=>['closed','kept_open'].includes(event.outcome)));
    }
    assert.equal(view.status,'review');
    assert.ok(seen.includes('control-memo'));
    assert.ok(view.control.text.trim());
    view=await operation('next','[data-action="next"]');
    assert.equal(view.status,'complete');
    assert.equal(view.result.points,undefined);
    assert.equal(await page.locator('.rxa-score').count(),0);
    if(!example&&locale==='ru'){
      assert.equal(view.decision.correspondence.sections.nextSteps,studentDraftText);
      assert.equal(view.control.text,studentMemoText);
      const record=page.locator('[data-details="response-record-current"]');
      await record.locator('summary').first().click();
      assert.ok((await record.locator('.rxc-letter-body').innerText()).includes(studentDraftText));
      await shot('mentor-own-record','.rxc-letter-body');
    }
    return view;
  }
  try {
    await page.goto(`${origin}/__qa/reception.html?context=seminar&lang=${locale}`);
    await root.locator('[data-journey-card="example"]').waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('link[rel="stylesheet"]')].every(link=>link.sheet));
    assert.match(await page.title(),/Приёмная/);
    assert.equal(await root.getAttribute('lang'),locale);
    assert.equal(await page.locator('[data-action="start-journey"]').count(),1);
    await shot('route');
    let view=await operation('start','[data-stage="example"]');
    assert.equal(view.journeyStage,'example');
    assert.equal(view.controlVersion,'execution-v1');
    assert.equal((await page.locator('.rxt-opening blockquote').innerText()).trim(),view.case.opening.trim());
    const layout=await page.evaluate(()=>{
      const content=document.querySelector('.rxa-page-content'), opening=document.querySelector('.rxt-opening');
      const mark=opening.getBoundingClientRect();
      return {viewport:innerWidth, document:document.documentElement.scrollWidth, page:content.clientWidth,
        pageScroll:content.scrollWidth, opening:mark.top, height:innerHeight};
    });
    assert.ok(layout.document<=layout.viewport+1&&layout.pageScroll<=layout.page+1,JSON.stringify(layout));
    assert.ok(layout.opening>=0&&layout.opening<layout.height,JSON.stringify(layout));
    await shot('opening');
    check('The case opens on Reception with the visitor’s full opening, immediate in the initial viewport and without horizontal overflow.');
    if(full){
      const exampleId=view.case.id;
      view=await walkthrough(view,true);
      assert.ok(view.seminarProgress.exampleCompleted);
      check('The worked example uses live tabs, opens real documents, shows the full letter, requests and verifies evidence, updates a scoped issue and records the final memorandum.');
      view=await operation('start','[data-stage="mentor"]');
      assert.equal(view.journeyStage,'mentor');
      assert.notEqual(view.case.id,exampleId);
      await page.locator('[data-mentor-welcome] [data-action="mentor-open-chat"]').click();
      await page.locator('[data-mentor-draft]').fill(mentorQuestion[locale]);
      view=await operation('mentor-question','[data-mentor-form] button[type="submit"]');
      assert.deepEqual(view.mentorMessages.map(message=>message.text),[mentorQuestion[locale],mentorReply[locale]]);
      await shot('mentor-answer','[data-mentor-messages]');
      await page.reload();
      await page.locator('#receptionAI[data-session-status="active"]').waitFor();
      await page.locator('[data-mentor-messages]').waitFor();
      assert.ok((await page.locator('[data-mentor-messages]').innerText()).includes(mentorReply[locale]));
      await page.locator('[data-action="mentor-return"]').click();
      const mentorId=view.case.id;
      view=await walkthrough(view,false);
      assert.ok(view.seminarProgress.mentorCompleted);
      check('A different random practice case answers a free-form question, resumes with its conversation, and corrects a wrong choice without scoring.');
      view=await operation('start','[data-stage="independent"]');
      assert.equal(view.journeyStage,'independent');
      assert.notEqual(view.case.id,mentorId);
      assert.equal(view.guidance,undefined);
      assert.equal(await page.locator('[data-chat-dialog="mentor"],[data-mentor-welcome],[data-tutorial-step]').count(),0);
      await page.locator('#rxaPage-chat').click();
      await page.locator('[data-action="page"][data-page="decision"]').last().click();
      await page.locator('button[form="rxaDecisionForm"]').waitFor();
      await shot('independent-draft','.rxt-draft-tools');
      await page.locator('button[form="rxaDecisionForm"]').click();
      await page.locator('[data-action="focus-omission"][data-section="routing"]').waitFor();
      await page.locator('[data-action="focus-omission"][data-section="legal-source"]').waitFor();
      await shot('independent-omissions','.rxa-confirm');
      await page.locator('[data-action="focus-omission"][data-section="routing"]').click();
      assert.equal(await page.locator('[data-routing-search]:focus').count(),1);
      check('Independent mode keeps the learner’s confirmation choice. The empty draft identifies missing destinations, deadlines, sections and legal citations and links to the fields.');
      if(locale==='ru'){
        await page.locator('#rxaPage-documents').click();
        view=await operation('document','.rxa-document-group [data-action="document"]');
        await page.locator('#rxaPage-decision').click();
        await seedPreparedDraft(view);
        await page.locator('button[form="rxaDecisionForm"]').click();
        view=await operation('decide','[data-action="confirm-decision"]');
        assert.equal(view.status,'followup');
        await page.locator('[data-control-action="select-kind"][data-kind="keep_open"]').first().click();
        let traffic=0;
        page.on('request',req=>{if(req.method()==='POST'&&req.url()===origin+'/api/reception'&&req.postDataJSON()?.op==='control-action')traffic++;});
        await page.locator('[data-control-action="execute"]').click();
        await page.locator('[data-control-missing]').waitFor();
        assert.equal(traffic,0);
        await shot('independent-control-omissions','[data-control-missing]');
        await page.locator('[data-control-missing] [data-field="instruction"]').click();
        assert.equal(await page.locator('[data-control-field="instruction"]:focus').count(),1);
        await page.locator('[data-control-field="reason"]').fill('Полученные сведения ещё требуют проверки по отдельному вопросу.');
        await page.locator('[data-control-field="instruction"]').fill('Сопоставить полученный документ с содержанием обращения.');
        view=await operation('control-action','[data-control-action="execute"]');
        assert.equal(traffic,1);assert.equal(view.controlWorkflow.journal.at(-1).outcome,'kept_open');
        await page.locator('.rxt-control-navigation [data-control-action="prepare-memorandum"]').click();
        const statuses=view.controlWorkflow.issues.map(issue=>({
          issueId:issue.id,status:'pending',
          evidenceSourceIds:[view.controlWorkflow.materials.find(material=>material.issueIds.includes(issue.id)).id],
        }));
        await writeMemo(statuses,studentMemoText);
        view=await operation('followup','[data-control-submit]');
        assert.equal(view.status,'review');
        await page.getByRole('button',{name:'Завершить дело и получить оценку'}).waitFor();
        await shot('independent-review');
        view=await operation('next','[data-action="next"]');
        assert.equal(view.status,'complete');
        assert.equal(view.result.gradingVersion,'seminar-thresholds-v1');
        assert.equal(view.result.points,seminarPointsAt(view.result.total));
        await shot('independent-grade');
        check('An incomplete control command is blocked locally, focuses a missing field, and can be corrected. A full memorandum and explicit finish lead to the computed final grade.');
        const bestPoints=view.result.seminarPoints;
        assert.ok(bestPoints>=3);
        view=await operation('start','[data-stage="independent"]');
        await page.locator('#rxaPage-documents').click();
        view=await operation('document','.rxa-document-group [data-action="document"]');
        await page.locator('#rxaPage-decision').click();
        await seedPreparedDraft(view);
        await page.locator('button[form="rxaDecisionForm"]').click();
        view=await operation('decide','[data-action="confirm-decision"]');
        assert.equal(view.status,'followup');
        await page.locator('.rxt-control-navigation [data-control-action="prepare-memorandum"]').click();
        await writeMemo(view.controlWorkflow.issues.map(issue=>({
          issueId:issue.id,status:'pending',
          evidenceSourceIds:[view.controlWorkflow.materials.find(material=>material.issueIds.includes(issue.id)).id],
        })),studentMemoText);
        view=await operation('followup','[data-control-submit]');
        assert.equal(view.status,'review');
        view=await operation('next','[data-action="next"]');
        assert.equal(view.result.points,0);
        assert.equal(view.result.seminarPoints,bestPoints);
        await page.getByText('За эту работу — 0 баллов.',{exact:true}).waitFor();
        assert.ok((await page.locator('[data-best-grade]').innerText()).includes(bestPoints+' / 5'));
        await shot('independent-retry-below-threshold');
        check('A below-threshold retry shows a zero for this case and preserves the previous best grade.');

      }
    }
    assert.deepEqual(row.errors,[]);
    row.status='pass';
  } catch(error){
    row.status='fail';row.failure=String(error.stack||error);
    await shot('failure');
  } finally {
    await context.close();
    await new Promise(resolve=>fixture.server.close(resolve));
  }
}
try { await Promise.all(targets.map(verify)); }
finally {
  await browser.close();
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
}
for(const row of report)console.log(row.key,row.status,row.failure||row.checks.join(' '));
if(report.some(row=>row.status!=='pass'))process.exitCode=1;
