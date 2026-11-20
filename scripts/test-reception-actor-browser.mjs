#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';
import {SEMINAR_EXAMPLE} from '../firebase/functions/reception-ai/seminar-journey.mjs';
import {SEMINAR_STORY_VERSION} from '../firebase/functions/reception-ai/seminar-stories.mjs';
import {SYNTHETIC_VERSION} from './reception-ai-qa-cases.mjs';

const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name)+1] : fallback;
const modulePath = option('--playwright-module', process.env.RECEPTION_PLAYWRIGHT_MODULE);
const output = path.resolve(option('--out', path.join(os.tmpdir(),'reception-actor-browser')));
const casesDirectory = option('--cases', process.env.RECEPTION_AI_CASES_DIR);
assert.ok(casesDirectory,'Provide --cases <bank directory> or RECEPTION_AI_CASES_DIR.');
const example = JSON.parse(await readFile(path.join(casesDirectory,SEMINAR_EXAMPLE.caseId+'.json'),'utf8'));
// The synthetic bank has a minimal independent fixture dossier for the same
// actor and deliberately excludes the authored story's facts and documents.
const synthetic = example.version===SYNTHETIC_VERSION;
const browsers = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : 'playwright');
const results = [];
await mkdir(output,{recursive:true});

// Compare the scene as displayed by the browser, excluding the motion toggle
// and outer margins. Canvas counters alone cannot prove visible animation.
async function pixelDifference(page, first, second) {
  return page.evaluate(async sources => {
    const pixels = [];
    for(const source of sources){
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image,0,0);
      pixels.push(context.getImageData(Math.floor(canvas.width*.28),8,
        Math.floor(canvas.width*.44),Math.floor(canvas.height*.62)).data);
    }
    let changed = 0;
    for(let i=0;i<pixels[0].length;i+=4){
      const difference = Math.abs(pixels[0][i]-pixels[1][i])+Math.abs(pixels[0][i+1]-pixels[1][i+1])+Math.abs(pixels[0][i+2]-pixels[1][i+2]);
      if(difference>25) changed++;
    }
    return changed;
  },[first,second].map(bytes=>'data:image/png;base64,'+bytes.toString('base64')));
}

for(const engine of ['chromium','webkit']){
  const browser = await browsers[engine].launch();
  try{
    for(const preference of ['default','reduced-motion','save-data']){
      const lesson = synthetic ? {} : {
        decisionVersion:'correspondence-v1',controlVersion:'execution-v1',
        coreStepsVersion:'mfc-referral-v2',seminarStoryVersion:SEMINAR_STORY_VERSION,
        serviceOptions:{requireGameplay:true,requireSeminarJourney:true}
      };
      const fixture = await createReceptionFixture({casesDirectory,caseIds:[SEMINAR_EXAMPLE.caseId],...lesson});
      await new Promise(resolve=>fixture.server.listen(0,'127.0.0.1',resolve));
      const context = await browser.newContext({
        viewport:engine==='webkit'?{width:390,height:844}:{width:320,height:568},
        deviceScaleFactor:2,isMobile:true,hasTouch:true,
        reducedMotion:preference==='reduced-motion'?'reduce':'no-preference'
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const requests = [], errors = [], base = engine+'-'+preference;
      page.on('request', request=>requests.push(new URL(request.url()).pathname));
      page.on('pageerror', error=>errors.push(error.message));
      await page.addInitScript(saveData=>{
        HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Autoplay disabled','NotAllowedError'));
        if(saveData)Object.defineProperty(navigator,'connection',{value:{saveData:true}});
      },preference==='save-data');
      try{
        if(synthetic){
          const {view} = await fixture.service.handle({op:'start',context:'seminar',mode:'training',
            locale:'ru',workbookVersion:2,requestId:'synthetic-c03-motion'},fixture.identity);
          assert.equal(view.case.id,SEMINAR_EXAMPLE.caseId);
          await page.addInitScript(({owner,sessionId,mode,status})=>{
            const key='rudn.reception.workspace.v2:'+owner+':'+encodeURIComponent('/api/reception')+':current';
            localStorage.setItem(key,JSON.stringify({owner,version:'reception-ai-ui-v1',sessionId,mode,status}));
          },{owner:fixture.identity.studentKey,sessionId:view.id,mode:view.mode,status:view.status});
        }
        await page.goto('http://127.0.0.1:'+fixture.server.address().port+'/__qa/reception.html?context=seminar&lang=ru');
        if(!synthetic){
          const started = page.waitForResponse(response=>response.url().endsWith('/api/reception') &&
            response.request().postDataJSON()?.op==='start');
          await page.locator('[data-stage="example"]').tap();
          const startResponse = await started;
          assert.equal(startResponse.ok(),true,await startResponse.text());
        }
        const stage = page.locator('.rxt-active-reception [data-rxa-actor="C03"]');
        if(!synthetic){
          const openingGuide = page.locator('.rxa-tour-card').filter({hasText:/Прочитайте обращение|Поговорите с заявителем/});
          await page.locator('.rxt-active-reception [data-tour-target="reception"]').scrollIntoViewIfNeeded();
          await openingGuide.waitFor();
          const scene = await stage.boundingBox(), guide = await openingGuide.boundingBox();
          assert.ok(guide.x+guide.width<=scene.x || guide.x>=scene.x+scene.width ||
            guide.y+guide.height<=scene.y || guide.y>=scene.y+scene.height,
          'The opening guide must leave the visitor unobstructed.');
        }
        // The app viewport can scroll independently of the browser window.
        await stage.scrollIntoViewIfNeeded();
        const poster = stage.locator('.rxa-citizen-poster');
        const toggle = stage.getByRole('button',{name:'Анимация персонажа'});
        const canvas = stage.locator('[data-rxa-motion-canvas]');
        const ready = page.locator('.rxt-active-reception [data-rxa-actor="C03"][data-rxa-motion-ready]');
        const atlasRequests = ()=>requests.filter(url=>url.endsWith('/C03-frames.webp')).length;
        assert.match(await poster.getAttribute('src'),/\/C03\/C03__C-N__w512\.webp$/);
        const visitorName = fixture.cases[0].public.citizen.name.ru;
        assert.equal(await poster.getAttribute('alt'),visitorName);
        if(fixture.dataKind==='supplied-bank')assert.match(visitorName,/Сергей Петрович/);
        assert.ok((await toggle.boundingBox()).height>=44);
        if(preference!=='default'){
          assert.equal(await toggle.getAttribute('aria-pressed'),'false');
          assert.equal(atlasRequests(),0);
          assert.equal(await poster.evaluate(node=>getComputedStyle(node).opacity),'1');
          await toggle.tap();
        }
        await ready.waitFor();
        assert.equal(await toggle.getAttribute('aria-pressed'),'true');
        assert.equal(await canvas.evaluate(node=>getComputedStyle(node).opacity),'1');
        const movingA = await stage.screenshot({path:path.join(output,base+'-frame-a.png')});
        await page.waitForTimeout(460);
        const movingB = await stage.screenshot({path:path.join(output,base+'-frame-b.png')});
        await page.waitForTimeout(420);
        const movingC = await stage.screenshot({path:path.join(output,base+'-frame-c.png')});
        const differences = await Promise.all([pixelDifference(page,movingA,movingB),pixelDifference(page,movingA,movingC)]);
        const moving = Math.max(...differences);
        assert.ok(moving>500,'Visible actor pixels must change: '+moving);
        if(preference==='default')await page.screenshot({path:path.join(output,base+'-opening.png')});
        assert.equal(atlasRequests(),1);
        assert.equal(requests.some(url=>/\/motion\/C03\.(webm|webp)$/.test(url)),false);

        await toggle.tap();
        assert.equal(await toggle.getAttribute('aria-pressed'),'false');
        await ready.waitFor({state:'detached'});
        const pausedA = await stage.screenshot({path:path.join(output,base+'-poster.png')});
        const pausedFrame = await canvas.evaluate(node=>node.toDataURL());
        await page.waitForTimeout(320);
        const pausedB = await stage.screenshot();
        assert.equal(await pixelDifference(page,pausedA,pausedB),0);
        assert.equal(await canvas.evaluate(node=>node.toDataURL()),pausedFrame);
        assert.equal(await poster.evaluate(node=>getComputedStyle(node).opacity),'1');

        await toggle.tap();
        await ready.waitFor();
        // Cover tab visibility even on engines that keep headless tabs visible.
        await page.evaluate(()=>{
          Object.defineProperty(document,'hidden',{configurable:true,value:true});
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await ready.waitFor({state:'detached'});
        const hiddenFrame = await canvas.evaluate(node=>node.toDataURL());
        await page.waitForTimeout(250);
        assert.equal(await canvas.evaluate(node=>node.toDataURL()),hiddenFrame);
        await page.evaluate(()=>{
          delete document.hidden;
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await ready.waitFor();

        await page.locator('.rxa-mobile-nav [data-page="chat"]').tap();
        await stage.waitFor({state:'detached'});
        await page.locator('.rxa-mobile-nav [data-page="reception"]').tap();
        await stage.scrollIntoViewIfNeeded();
        await ready.waitFor();
        assert.equal(atlasRequests(),1);
        assert.equal(await canvas.evaluate(node=>{
          const context = node.getContext('2d');
          const transparent = context.getImageData(0,0,1,1).data[3]===0;
          const opaque = context.getImageData(node.width/2,node.height/2,1,1).data[3]>0;
          return transparent&&opaque;
        }),true);
        assert.deepEqual(errors,[]);
        results.push({engine,preference,status:'pass',actor:'C03',movingPixels:moving,atlasRequests:atlasRequests()});
        console.log(JSON.stringify(results.at(-1)));
      }catch(error){
        await page.screenshot({path:path.join(output,base+'-failure.png')}).catch(()=>{});
        throw error;
      }finally{
        await context.close();
        await new Promise(resolve=>fixture.server.close(resolve));
      }
    }
  }finally{await browser.close();}
}
await writeFile(path.join(output,'report.json'),JSON.stringify(results,null,2)+'\n');
