#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';
import {writeSyntheticReceptionCases} from './reception-ai-qa-cases.mjs';

const arg = (key, fallback) => process.argv.includes(key) ? process.argv[process.argv.indexOf(key)+1] : fallback;
const engine = arg('--browser','chromium');
assert.ok(['chromium','webkit'].includes(engine),'Use --browser chromium or webkit');
const modulePath = arg('--playwright-module',process.env.RECEPTION_PLAYWRIGHT_MODULE);
// Windows WebKit can leave the CSS Font Loading API pending after the reader mounts.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY ??= '1';
const { [engine]: launcher } = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : 'playwright');
const out = path.resolve(arg('--out',path.join(os.tmpdir(),'reception-reader-search',engine)));
const {directory:casesDirectory} = await writeSyntheticReceptionCases(path.join(out,'synthetic-cases'));
const scenarios = [
  {width:320,height:568,textScale:100}, {width:360,height:600,textScale:100,dpr:2.8},
  {width:390,height:844,textScale:100}, {width:412,height:915,textScale:100},
  {width:320,height:620,textScale:125}, {width:360,height:650,textScale:150},
  {width:390,height:700,textScale:150}, {width:1280,height:900,textScale:100},
];
if (arg('--scenario')) scenarios.splice(0,scenarios.length,...scenarios.filter(row=>`${row.width}x${row.height}`===arg('--scenario')));
assert.ok(scenarios.length,'Unknown scenario');
const baseline = process.argv.includes('--baseline');
const report = [];
let browser;
await mkdir(out,{recursive:true});
try {
  browser = await launcher.launch();
  for (const {width,height,textScale,dpr=1} of scenarios) {
    const fixture = await createReceptionFixture({casesDirectory});
    await new Promise(resolve=>fixture.server.listen(0,'127.0.0.1',resolve));
    const origin = `http://127.0.0.1:${fixture.server.address().port}`;
    const touch = engine==='chromium' && width<500;
    const context = await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,deviceScaleFactor:dpr,serviceWorkers:'block'});
    const page = await context.newPage();
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    const key=`${width}x${height}-text${textScale}`;
    try {
      const response=await page.goto(`${origin}/__qa/reception.html`,{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200);
      assert.match(await page.title(),/Приёмная/);
      assert.equal(new URL(page.url()).pathname,'/__qa/reception.html');
      if (textScale>100) {
        // Real font enlargement even on desktop engines where text autosizing
        // is not applied to CSS text-size-adjust percentages.
        await page.addStyleTag({content:`.rx-source-embedded .ll-searchbar>input,.rx-source-embedded .ll-reader-header h2,.rx-source-embedded .ll-paragraph-text{font-size:${textScale*0.16}px!important}.rx-source-embedded .ll-search-results button,.rx-source-embedded .ll-search-results button b,.rx-source-embedded .ll-search-results button span,.rx-source-embedded .ll-search-results strong{font-size:${textScale*0.12}px!important}`});
      }
      await page.locator('[name="trainingCaseId"] option[value]').nth(1).waitFor({state:'attached'});
      await page.locator('[data-action="start"]').click();
      await page.locator('#receptionAI[data-session-status="active"]').waitFor();
      await page.locator('#rxaPage-documents').click();
      assert.equal(await page.locator('.rxa-documents-page [role="tablist"]').count(),0);
      await page.locator('.rxa-source-record').evaluateAll(nodes=>nodes.forEach(node=>{node.open=true;}));
      await page.locator('a[data-source-reader][href*="LAW_59999/"]').first().click();
      const reader=page.locator('.rx-source-embedded');
      await reader.locator('.ll-paper [data-unit]').first().waitFor();
      await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1500))]));
      const reading=await reader.locator('.ll-paper').evaluate(paper=>{
        const text=paper.querySelector('.ll-paragraph-text'),bounds=paper.getBoundingClientRect();
        return {height:bounds.height,top:bounds.top,bottom:bounds.bottom,fontSize:parseFloat(getComputedStyle(text).fontSize),viewport:visualViewport.height};
      });
      await page.screenshot({path:path.join(out,`${key}-reading.png`),animations:'disabled'});
      if(width<=820&&!baseline){
        assert.ok(reading.height>=reading.viewport*.60&&reading.fontSize>=16,JSON.stringify(reading));
        const title=reader.locator('.rx-source-title');
        assert.equal(await title.evaluate(node=>node.open),false);
        await title.locator('summary').click();
        assert.match(await title.locator('h2').innerText(),/Федеральный закон.*Обращени|Федеральный закон.*обращений/);
        await title.locator('summary').click();
      }
      const search=reader.locator('[data-input="reader-query"]');
      const results=reader.locator('.ll-search-results');
      await search.fill('Статья');
      await search.press('Enter');
      const hits=results.locator('[data-action="jump-unit"]');
      await hits.nth(3).waitFor({state:'attached'});
      await page.screenshot({path:path.join(out,`${key}-search.png`),animations:'disabled'});
      const geometry=await reader.evaluate(root=>{
        const get=selector=>root.querySelector(selector);
        const rect=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,visible:s.visibility!=='hidden'&&s.display!=='none'&&r.width>0&&r.height>0,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,overflowY:s.overflowY};};
        const panel=get('[data-reader-search-panel]'), list=get('.ll-search-results');
        const nav=document.querySelector('.rxa-mobile-nav').getBoundingClientRect();
        return {viewport:{width:visualViewport.width,height:visualViewport.height},root:rect(root),bar:rect(get('.rx-source-dialog-bar')),panel:rect(panel),search:rect(get('.ll-searchbar')),results:rect(list),first:rect(list.querySelector('[data-action="jump-unit"]')),title:rect(get('.ll-reader-header')),paper:rect(get('.ll-paper')),tray:rect(get('[data-source-reference-tray]')),navTop:nav.top};
      });
      if (baseline) {report.push({key,reading,geometry,errors}); continue;}
      assert.equal(await reader.getAttribute('data-search-results-open'),'true');
      assert.ok(geometry.bar.bottom<=geometry.search.top+1&&geometry.search.bottom<=geometry.results.top+1,JSON.stringify(geometry));
      assert.ok(geometry.results.bottom<=Math.min(geometry.root.bottom,width<=820?geometry.navTop:geometry.viewport.height)+1,JSON.stringify(geometry));
      assert.ok(geometry.results.height>=140&&geometry.results.scrollHeight>geometry.results.clientHeight,JSON.stringify(geometry));
      assert.ok(geometry.first.top>=geometry.results.top-1&&geometry.first.bottom<=geometry.results.bottom+1,JSON.stringify(geometry));
      assert.ok(!geometry.title.visible&&!geometry.paper.visible&&!geometry.tray.visible,JSON.stringify(geometry));
      assert.ok(geometry.results.right<=geometry.viewport.width+1&&geometry.first.right<=geometry.results.right+1,JSON.stringify(geometry));
      const later=hits.nth(3);
      const unit=await later.getAttribute('data-id');
      // Scroll the results, then verify the intended card is fully hit-testable.
      await later.evaluate(node=>{
        const list=node.closest('.ll-search-results');
        list.scrollTop=node.getBoundingClientRect().top-list.getBoundingClientRect().top+list.scrollTop-8;
      });
      const scroll=await later.evaluate(node=>{
        const list=node.closest('.ll-search-results'),r=node.getBoundingClientRect(),b=list.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
        return {scrollTop:list.scrollTop,fullyVisible:r.top>=b.top-1&&r.bottom<=b.bottom+1,reachable:node===hit||node.contains(hit)};
      });
      assert.ok(scroll.scrollTop>0&&scroll.fullyVisible&&scroll.reachable,JSON.stringify(scroll));
      await page.screenshot({path:path.join(out,`${key}-later-hit.png`),animations:'disabled'});
      await later.click();
      const selected=reader.locator(`.ll-search-target[data-unit="${unit}"]`);
      await selected.waitFor();
      await page.waitForFunction(id=>document.activeElement?.dataset.unit===id,unit);
      assert.equal(await results.isVisible(),false);
      assert.equal(await search.inputValue(),'Статья');
      const opened=await selected.evaluate(node=>{
        const unit=node.getBoundingClientRect(),paper=node.closest('.ll-paper').getBoundingClientRect();
        return {height:paper.height,top:paper.top,bottom:paper.bottom,unitTop:unit.top};
      });
      assert.ok(opened.height>75&&opened.unitTop>=opened.top-1&&opened.unitTop<opened.bottom,JSON.stringify(opened));
      if(width<=820)assert.ok(opened.height>=reading.viewport*.60,JSON.stringify(opened));
      await page.screenshot({path:path.join(out,`${key}-opened-hit.png`),animations:'disabled'});
      await search.fill('нетсовпаденийздесь');
      await search.press('Enter');
      await results.locator('strong').filter({hasText:'Совпадений нет'}).waitFor();
      await reader.locator('[data-action="clear-search"]').click();
      assert.equal(await search.inputValue(),'');
      assert.equal(await results.isVisible(),false);
      assert.equal(await reader.locator('.ll-paper').isVisible(),true);
      await reader.locator('[data-source-reader-close]').click();
      assert.equal(await page.locator('.rxa-document-group').count(),2);
      assert.equal(await page.locator('.rxa-top').isVisible(),true);
      assert.deepEqual(errors,[]);
      report.push({key,reading,geometry,scroll,unit,opened,errors});
      console.log(`PASS ${engine} ${key}: ${Math.round(reading.height/reading.viewport*100)}% law text, ${Math.round(geometry.results.height)}px search results, later match ${unit}`);
    } finally {
      await context.close();
      await new Promise(resolve=>fixture.server.close(resolve));
    }
  }
} finally {
  await browser?.close();
  await writeFile(path.join(out,'report.json'),JSON.stringify({engine,baseline,scenarios:report},null,2)+'\n');
}
