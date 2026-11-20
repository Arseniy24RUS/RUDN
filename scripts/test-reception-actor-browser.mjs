#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createReceptionFixture} from './reception-ai-workspace-qa.mjs';
import {SEMINAR_EXAMPLE} from '../firebase/functions/reception-ai/seminar-journey.mjs';
import {SEMINAR_STORY_VERSION, SEMINAR_STORY_PROGRESS_KEY} from '../firebase/functions/reception-ai/seminar-stories.mjs';
import {hash} from '../firebase/functions/reception-ai/schema.mjs';
import {CATALOG_METADATA} from '../firebase/functions/reception-ai/catalog-metadata.mjs';
import {GFX_PASSPORTS, GFX_ROSTER} from '../site/apps/reception/js/graphics-data.js';
import {SYNTHETIC_VERSION} from './reception-ai-qa-cases.mjs';
import {executionQAProfiles} from './reception-execution-qa.mjs';

const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name)+1] : fallback;
const modulePath = option('--playwright-module', process.env.RECEPTION_PLAYWRIGHT_MODULE);
const output = path.resolve(option('--out', path.join(os.tmpdir(),'reception-actor-browser')));
const casesDirectory = option('--cases', process.env.RECEPTION_AI_CASES_DIR);
const coverageOnly = process.argv.includes('--coverage-only');
assert.ok(casesDirectory||coverageOnly,'Provide --cases <bank directory> or RECEPTION_AI_CASES_DIR.');
const example = casesDirectory?JSON.parse(await readFile(path.join(casesDirectory,SEMINAR_EXAMPLE.caseId+'.json'),'utf8')):null;
// The synthetic bank has a minimal independent fixture dossier for the same
// actor and deliberately excludes the authored story's facts and documents.
const synthetic = !example||example.version===SYNTHETIC_VERSION;
const results = [];
await mkdir(output,{recursive:true});
const sampleCases = [
  {stage:'example',caseId:SEMINAR_EXAMPLE.caseId,actor:'C03',preferences:['default','reduced-motion','save-data','no-canvas','missing-sheet','retry']},
  {stage:'mentor',caseId:'ads-consent',actor:'C07',storyDocument:'d0',preferences:['default','no-canvas','poster-only']},
  {stage:'independent',caseId:'budget',actor:'C05',storyDocument:'request',preferences:['default','missing-sheet']},
];

const gfx = new URL('../site/apps/reception/assets/gfx1/',import.meta.url);
const asset = relative => new URL(relative,gfx);
async function atlasHeader(relative) {
  const file=await open(asset(relative));
  try{
    const bytes=Buffer.alloc(30);
    assert.equal((await file.read(bytes)).bytesRead,bytes.length,relative);
    assert.equal(bytes.toString('ascii',0,4),'RIFF',relative);
    assert.equal(bytes.toString('ascii',8,16),'WEBPVP8X',relative);
    assert.ok(bytes[20]&0x10,`${relative} must support alpha`);
    assert.equal(bytes[20]&0x02,0,`${relative} must be a still sheet`);
    assert.equal(bytes.readUIntLE(24,3)+1,896,relative);
    assert.equal(bytes.readUIntLE(27,3)+1,1525,relative);
  }finally{await file.close();}
}
async function checkAssetCoverage() {
  assert.deepEqual(Object.keys(GFX_PASSPORTS).sort(),Object.keys(CATALOG_METADATA).sort());
  const actors=[...new Set(Object.values(GFX_PASSPORTS).flatMap(profile=>profile.candidates))].sort();
  assert.deepEqual(actors,Object.keys(GFX_ROSTER).filter(id=>!['S01','S02'].includes(id)).sort());
  const manifest=JSON.parse(await readFile(asset('manifest.json'),'utf8'));
  for(const id of actors){
    const state=id.startsWith('S')?'S-N':'C-N';
    const poster=`characters/${id}/${id}__${state}__w512.webp`;
    assert.ok(manifest.assets.some(item=>item.actorId===id&&item.stateId===state&&
      item.files.some(file=>file.path===`assets/gfx1/${poster}`&&file.width===512)),id);
    assert.ok(manifest.avatars.some(item=>item.id===id&&item.path===`assets/gfx1/avatars/${id}.webp`),id);
    await Promise.all([poster,`avatars/${id}.webp`,`motion/${id}.webp`,`motion/${id}.webm`].map(async relative=>{
      assert.ok((await stat(asset(relative))).size>0,relative);
    }));
    await Promise.all(Array.from({length:6},(_,index)=>atlasHeader(`motion/${id}-frames-${index+1}.webp`)));
  }
  let frozenVariants=0;
  if(!synthetic){
    const seen=new Set();
    for(const file of (await readdir(casesDirectory)).filter(name=>name.endsWith('.json'))){
      const c=JSON.parse(await readFile(path.join(casesDirectory,file),'utf8'));
      const candidates=GFX_PASSPORTS[c.id]?.candidates;
      assert.ok(candidates,c.id);
      for(const variant of [c,...(c.dateVariants||[])]){
        const actor=variant.public.citizen.portrait.match(/^assets\/gfx1\/avatars\/([CS]\d{2})\.webp$/)?.[1];
        assert.ok(candidates.includes(actor),`${c.id} visual passport does not include ${actor}`);
        seen.add(actor);
        frozenVariants++;
      }
    }
    assert.deepEqual([...seen].sort(),actors);
  }
  return {visualPassports:Object.keys(GFX_PASSPORTS).length,actors,transparentAtlases:actors.length*6,frozenVariants};
}

const coverage=await checkAssetCoverage();
await writeFile(path.join(output,'coverage.json'),JSON.stringify(coverage,null,2)+'\n');
if(coverageOnly){
  console.log(JSON.stringify(coverage));
  process.exit(0);
}
const browsers = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : 'playwright');

async function prepareSyntheticActors(directory) {
  for(const sample of sampleCases.filter(item=>item.stage!=='example')){
    const c=JSON.parse(await readFile(path.join(casesDirectory,sample.caseId+'.json'),'utf8'));
    assert.equal(c.version,SYNTHETIC_VERSION);
    assert.ok(GFX_PASSPORTS[c.id].candidates.includes(sample.actor));
    c.public.citizen.portrait=`assets/gfx1/avatars/${sample.actor}.webp`;
    // Reuse the real story projector against synthetic records. Only one
    // evidence document needs the canonical story ID for each chosen case.
    c.documents.push({...c.documents[0],id:sample.storyDocument,factIds:[]});
    await writeFile(path.join(directory,c.id+'.json'),JSON.stringify(c)+'\n');
  }
}

// Compare the character as displayed by the browser. Canvas counters alone
// cannot prove visible animation.
async function pixelDifference(page, first, second) {
  return page.evaluate(async sources => {
    const pixels = [];
    let dimensions;
    for(const source of sources){
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const current=`${image.width}x${image.height}`;
      if(dimensions&&dimensions!==current)throw new Error(`The actor crop changed from ${dimensions} to ${current}.`);
      dimensions=current;
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

async function checkMovement(page,target,{label,threshold,screenshotStem}) {
  // Disable UI entrance fades while preserving the frame player's JavaScript
  // drawing and intrinsic WebP animation. A fading poster is not actor motion.
  const screenshot=frame=>target.screenshot({animations:'disabled',...(screenshotStem?{path:screenshotStem+'-'+frame+'.png'}:{})});
  const first=await screenshot('a');
  let changed=0;
  for(const delay of [410,470,610]){
    await page.waitForTimeout(delay);
    const next=await screenshot('b');
    changed=Math.max(changed,await pixelDifference(page,first,next));
    if(changed>threshold)return changed;
  }
  assert.fail(`${label}: expected more than ${threshold} changed pixels, got ${changed}`);
}
async function checkStill(page,target,poster,filename) {
  assert.equal(await target.getAttribute('data-rxa-motion-ready'),null);
  assert.equal(await poster.evaluate(node=>getComputedStyle(node).opacity),'1');
  assert.ok(await poster.evaluate(async node=>{await node.decode();return node.naturalWidth>0;}));
  const first=await target.screenshot({animations:'disabled',...(filename?{path:filename}:{})});
  await page.waitForTimeout(460);
  assert.equal(await pixelDifference(page,first,await target.screenshot({animations:'disabled'})),0,'The poster must remain visibly still.');
}
function viewportFor(engine,stage) {
  if(stage==='independent')return engine==='webkit'?{width:430,height:932}:{width:844,height:390};
  return engine==='webkit'?{width:390,height:844}:{width:320,height:568};
}
async function runActorCase(browser,engine,sample,preference,syntheticDirectory){
  const {stage:journeyStage,caseId,actor}=sample;
  const syntheticExample=synthetic&&journeyStage==='example';
  const lesson=syntheticExample?{}:{
    decisionVersion:'correspondence-v1',controlVersion:'execution-v1',
    coreStepsVersion:'mfc-referral-v2',seminarStoryVersion:SEMINAR_STORY_VERSION,
    serviceOptions:{requireGameplay:true,requireSeminarJourney:true,requireCurrentSeminarTraining:true,
      ...(synthetic?{correspondenceProfiles:executionQAProfiles}:{})}
  };
  const fixture=await createReceptionFixture({
    casesDirectory:synthetic&&!syntheticExample?syntheticDirectory:casesDirectory,caseIds:[caseId],...lesson,
    provider:{name:'mock',generate(){assert.fail('Actor playback must not ask the provider to generate dialogue.');},
      reviewDecision(){assert.fail('Actor playback must not run automated grading.');}}
  });
  await new Promise((resolve,reject)=>{fixture.server.once('error',reject);fixture.server.listen(0,'127.0.0.1',resolve);});
  const viewport=viewportFor(engine,journeyStage);
  const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,
    reducedMotion:preference==='reduced-motion'?'reduce':'no-preference'});
  try{
    const page=await context.newPage();
    page.setDefaultTimeout(12000);
    const requests=[], errors=[], base=`${engine}-${journeyStage}-${actor}-${preference}`;
    const capture=name=>path.join(output,base+'-'+name+'.png');
    page.on('request',request=>requests.push(new URL(request.url()).pathname));
    page.on('pageerror',error=>errors.push(error.message));
    const useNativeImage=preference==='missing-sheet';
    const posterOnly=preference==='poster-only';
    let blockAllMedia=posterOnly||preference==='retry';
    const blockedMotion=blockAllMedia?page.waitForEvent('requestfailed',{
      predicate:request=>new URL(request.url()).pathname.endsWith(`/motion/${actor}.webp`),timeout:16000
    }):null;
    if(blockAllMedia||useNativeImage){
      await page.route(`**/motion/${actor}*`,route=>{
        const isSheet=/\/\w+-frames-\d+\.webp$/.test(new URL(route.request().url()).pathname);
        return blockAllMedia||useNativeImage&&isSheet?route.abort():route.continue();
      });
    }
    await page.addInitScript(mode=>{
      HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Autoplay disabled','NotAllowedError'));
      if(mode==='save-data')Object.defineProperty(navigator,'connection',{value:{saveData:true}});
      if(mode==='no-canvas'||mode==='poster-only'){
        const getContext=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(...args){
          return this.hasAttribute('data-rxa-motion-canvas')?null:getContext.apply(this,args);
        };
      }
      window.actorClicks=0;
      document.addEventListener('click',event=>{
        if(event.target.closest?.('[data-rxa-actor],[data-rxa-chat-actor]'))window.actorClicks++;
      },true);
    },preference);
    try{
      if(syntheticExample){
        const {view}=await fixture.service.handle({op:'start',context:'seminar',mode:'training',
          locale:'ru',workbookVersion:2,requestId:'synthetic-c03-motion'},fixture.identity);
        assert.equal(view.case.id,caseId);
        await page.addInitScript(({owner,sessionId,mode,status})=>{
          const key='rudn.reception.workspace.v2:'+owner+':'+encodeURIComponent('/api/reception')+':current';
          localStorage.setItem(key,JSON.stringify({owner,version:'reception-ai-ui-v1',sessionId,mode,status}));
        },{owner:fixture.identity.studentKey,sessionId:view.id,mode:view.mode,status:view.status});
      }else if(journeyStage!=='example'){
        // Seed only the completed prerequisite stages of this isolated profile.
        // A real browser click must still start and allocate a current session.
        const ownerKey=hash('student:'+fixture.identity.studentKey);
        await fixture.store.transaction('seminarProgress/'+ownerKey,()=>({
          [SEMINAR_STORY_PROGRESS_KEY]:{example:{completed:true},...(journeyStage==='independent'?{mentor:{completed:true}}:{})}
        }));
      }
      const origin='http://127.0.0.1:'+fixture.server.address().port;
      await page.goto(origin+'/__qa/reception.html?context=seminar&lang=ru');
      if(!syntheticExample){
        const started=page.waitForResponse(response=>response.url()===origin+'/api/reception'&&
          response.request().postDataJSON()?.op==='start');
        await page.locator(`[data-action="start-journey"][data-stage="${journeyStage}"]`).tap();
        const startResponse=await started;
        assert.equal(startResponse.ok(),true,await startResponse.text());
        const {view}=await startResponse.json();
        assert.equal(view.seminarStoryVersion,SEMINAR_STORY_VERSION);
        assert.equal(view.journeyStage,journeyStage);
        assert.equal(view.case.id,caseId);
        assert.equal(view.case.citizen.portrait,`assets/gfx1/avatars/${actor}.webp`);
      }
      const sceneSelector=`.rxt-active-reception [data-rxa-actor="${actor}"]`;
      const character=page.locator(sceneSelector);
      if(journeyStage==='example'&&!syntheticExample){
        const guide=page.locator('.rxa-tour-card').filter({hasText:/Прочитайте обращение|Поговорите с заявителем/});
        await page.locator('.rxt-active-reception [data-tour-target="reception"]').scrollIntoViewIfNeeded();
        await guide.waitFor();
        const scene=await character.boundingBox(), tip=await guide.boundingBox();
        assert.ok(tip.x+tip.width<=scene.x||tip.x>=scene.x+scene.width||
          tip.y+tip.height<=scene.y||tip.y>=scene.y+scene.height,'The opening guide must leave the visitor unobstructed.');
      }
      await character.scrollIntoViewIfNeeded();
      const poster=character.locator('.rxa-citizen-poster');
      const activeLayer=character.locator('.rxa-citizen-video');
      const ready=page.locator(sceneSelector+'[data-rxa-motion-ready]');
      const avatarSelector=`[data-rxa-chat-actor="${actor}"]`;
      const avatar=page.locator(avatarSelector);
      const avatarReady=page.locator(avatarSelector+'[data-rxa-motion-ready]');
      const sheetURLs=()=>requests.filter(url=>new RegExp(`/${actor}-frames-[1-6]\\.webp$`).test(url));
      const usesNative=()=>requests.some(url=>url.endsWith(`/motion/${actor}.webp`));
      const neutral=actor.startsWith('S')?'S-N':'C-N';
      const assertIdentity=async()=>{
        assert.ok((await poster.getAttribute('src')).endsWith(`/${actor}/${actor}__${neutral}__w512.webp`));
        assert.equal(await poster.getAttribute('alt'),fixture.cases[0].public.citizen.name.ru);
      };
      const controls='button, [role="button"], video[controls]';
      await assertIdentity();
      assert.equal(await character.locator(controls).count(),0,'The scene has no playback controls.');
      let recoveryMs, movingPixels, chatMovingPixels, returnedMovingPixels;
      if(blockedMotion){
        await blockedMotion;
        await checkStill(page,character,poster,capture('blocked-poster'));
        if(!posterOnly){
          const restoredAt=Date.now();
          blockAllMedia=false;
          await ready.waitFor({timeout:3000});
          recoveryMs=Date.now()-restoredAt;
        }
      }
      if(!posterOnly){
        await ready.waitFor();
        assert.equal(await activeLayer.evaluate(node=>getComputedStyle(node).opacity),'1');
        if(preference==='no-canvas')assert.ok(await activeLayer.evaluate(node=>node.hasAttribute('data-rxa-motion-sprite')));
        if(useNativeImage)assert.ok(await activeLayer.evaluate(node=>node.hasAttribute('data-rxa-motion-image')));
        movingPixels=await checkMovement(page,character,{label:'Scene',threshold:500,screenshotStem:path.join(output,base+'-scene')});
      }
      if(preference==='default')await page.screenshot({path:capture('opening')});
      assert.ok(sheetURLs().length>=1);
      assert.ok(!requests.some(url=>url.endsWith(`/${actor}-frames.webp`)));
      assert.equal(usesNative(),useNativeImage||preference==='retry'||posterOnly);
      assert.ok(!requests.some(url=>url.endsWith(`/motion/${actor}.webm`)),'Atlas playback must work with video disabled.');

      if(journeyStage==='example'&&!posterOnly){
        await page.evaluate(()=>{
          Object.defineProperty(document,'hidden',{configurable:true,value:true});
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await ready.waitFor({state:'detached'});
        await checkStill(page,character,poster,capture('hidden-poster'));
        await page.evaluate(()=>{
          delete document.hidden;
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await ready.waitFor();
      }

      await page.locator('.rxa-mobile-nav [data-page="chat"]').tap();
      await character.waitFor({state:'detached'});
      const avatarPoster=avatar.locator('.rxa-citizen-poster');
      await avatar.scrollIntoViewIfNeeded();
      assert.ok((await avatarPoster.getAttribute('src')).endsWith(`/avatars/${actor}.webp`));
      assert.equal(await avatar.locator(controls).count(),0,'The chat portrait has no playback controls.');
      if(posterOnly)await checkStill(page,avatar,avatarPoster,capture('chat-poster'));
      else{
        await avatarReady.waitFor();
        chatMovingPixels=await checkMovement(page,avatar,{label:'Chat portrait',threshold:10,
          screenshotStem:preference==='default'?path.join(output,base+'-chat-portrait'):undefined});
        if(preference==='default')await page.screenshot({path:capture('chat')});
      }

      await page.locator('.rxa-mobile-nav [data-page="reception"]').tap();
      await avatar.waitFor({state:'detached'});
      await character.scrollIntoViewIfNeeded();
      await assertIdentity();
      assert.equal(await character.locator(controls).count(),0,'Returning to the scene adds no playback controls.');
      if(posterOnly)await checkStill(page,character,poster,capture('returned-poster'));
      else{
        await ready.waitFor();
        returnedMovingPixels=await checkMovement(page,character,{label:'Returned scene',threshold:500});
        if(await activeLayer.evaluate(node=>node.tagName==='CANVAS'))assert.equal(await activeLayer.evaluate(node=>{
          const context=node.getContext('2d');
          return context.getImageData(0,0,1,1).data[3]===0&&context.getImageData(node.width/2,node.height/2,1,1).data[3]>0;
        }),true);
      }
      const actorClicks=await page.evaluate(()=>window.actorClicks);
      assert.equal(actorClicks,0,'The player must never require a click on the visitor.');
      assert.deepEqual(errors,[]);
      const result={engine,journeyStage,caseId,viewport,preference,status:'pass',actor,actorClicks,movingPixels,
        chatMovingPixels,returnedMovingPixels,posterOnly,recoveryMs,sheets:new Set(sheetURLs()).size};
      results.push(result);
      console.log(JSON.stringify(result));
    }catch(error){
      await page.screenshot({path:capture('failure')}).catch(()=>{});
      throw error;
    }
  }finally{
    await context.close();
    await new Promise(resolve=>fixture.server.close(resolve));
  }
}

let syntheticDirectory;
try{
  if(synthetic){
    syntheticDirectory=await mkdtemp(path.join(os.tmpdir(),'reception-actor-cases-'));
    await prepareSyntheticActors(syntheticDirectory);
  }
  const selectedEngine=option('--browser',null), selectedStage=option('--stage',null);
  const engines=selectedEngine?[selectedEngine]:['chromium','webkit'];
  const samples=sampleCases.filter(sample=>!selectedStage||sample.stage===selectedStage);
  assert.ok(samples.length,'Choose example, mentor or independent.');
  for(const engine of engines){
    assert.ok(['chromium','webkit'].includes(engine),'Choose chromium or webkit.');
    const browser=await browsers[engine].launch();
    try{
      for(const sample of samples)for(const preference of sample.preferences)
        await runActorCase(browser,engine,sample,preference,syntheticDirectory);
    }finally{await browser.close();}
  }
}finally{
  if(syntheticDirectory)await rm(syntheticDirectory,{recursive:true,force:true});
  await writeFile(path.join(output,'report.json'),JSON.stringify(results,null,2)+'\n');
}
