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
const requireHD = process.argv.includes('--require-hd');
const measure = requireHD || process.argv.includes('--measure');
const legacyAtlas = process.argv.includes('--legacy-atlas');
const selectedPreferences = option('--preference', '').split(',').filter(Boolean);
const coverageOnly = process.argv.includes('--coverage-only');
assert.ok(casesDirectory||coverageOnly,'Provide --cases <bank directory> or RECEPTION_AI_CASES_DIR.');
const example = casesDirectory?JSON.parse(await readFile(path.join(casesDirectory,SEMINAR_EXAMPLE.caseId+'.json'),'utf8')):null;
// The synthetic bank has a minimal independent fixture dossier for the same
// actor and deliberately excludes the authored story's facts and documents.
const synthetic = !example||example.version===SYNTHETIC_VERSION;
const results = [];
await mkdir(output,{recursive:true});
const sampleCases = [
  {stage:'example',caseId:SEMINAR_EXAMPLE.caseId,actor:'C03',preferences:['default','reduced-motion','save-data','no-canvas','missing-sheet','retry','autoplay-denied','video-frozen','video-opaque','software-only','atlas-only']},
  {stage:'mentor',caseId:'ads-consent',actor:'C07',storyDocument:'d0',preferences:['default','no-canvas','poster-only']},
  {stage:'independent',caseId:'budget',actor:'C05',storyDocument:'request',preferences:['default','missing-sheet']},
  {stage:'free',caseId:'river-observation',actor:'C23',preferences:['default']},
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
    if(sample.storyDocument)c.documents.push({...c.documents[0],id:sample.storyDocument,factIds:[]});
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
// Browser screenshots capture the composited layer (including native animated
// images). The count is a lower bound from sampling, not a decoder FPS figure.
async function sampleVisibleFrames(page,target,screenshotStem) {
  const probeStart = await page.evaluate(()=>performance.now());
  const layer = await target.evaluate(node => {
    const active = Array.from(node.querySelectorAll('.rxa-citizen-video'))
      .find(layer=>getComputedStyle(layer).opacity==='1');
    const image = active?.querySelector('image');
    const bounds = active?.getBoundingClientRect();
    const rect = bounds && {width:Math.round(bounds.width*100)/100,height:Math.round(bounds.height*100)/100};
    const clipped = bounds && {left:Math.max(0,bounds.left),top:Math.max(0,bounds.top),
      right:Math.min(innerWidth,bounds.right),bottom:Math.min(innerHeight,bounds.bottom)};
    for(let parent=active?.parentElement;parent;parent=parent.parentElement){
      const style=getComputedStyle(parent);
      const area=parent.getBoundingClientRect();
      if(/^(hidden|clip|auto|scroll)$/.test(style.overflowX)){
        clipped.left=Math.max(clipped.left,area.left+parent.clientLeft);
        clipped.right=Math.min(clipped.right,area.left+parent.clientLeft+parent.clientWidth);
      }
      if(/^(hidden|clip|auto|scroll)$/.test(style.overflowY)){
        clipped.top=Math.max(clipped.top,area.top+parent.clientTop);
        clipped.bottom=Math.min(clipped.bottom,area.top+parent.clientTop+parent.clientHeight);
      }
    }
    const nativeMediaSource = active?.currentSrc || image?.getAttribute('href') || null;
    const intrinsic = active && {
      width:active.videoWidth || active.naturalWidth || Number(active.getAttribute('width')) || null,
      height:active.videoHeight || active.naturalHeight || Number(active.getAttribute('height')) || null,
    };
    return {
      actor:node.dataset.rxaActor || node.dataset.rxaChatActor,
      layer:active?.tagName,
      renderer:active?.getAttribute('data-rxa-motion-decoded')||active?.tagName.toLowerCase(),
      source:nativeMediaSource,
      objectFit:active&&getComputedStyle(active).objectFit,
      cssBox:rect,
      intrinsic,
      devicePixelRatio,
      outputPixels:rect&&{width:Math.round(rect.width*devicePixelRatio),height:Math.round(rect.height*devicePixelRatio)},
      visibleLayerPixels:clipped&&{width:Math.max(0,Math.round((clipped.right-clipped.left)*devicePixelRatio)),
        height:Math.max(0,Math.round((clipped.bottom-clipped.top)*devicePixelRatio))}
    };
  });
  const samples=[];
  const started=performance.now();
  for(let index=0;index<25;index++){
    const screenshot=await target.screenshot({animations:'disabled',timeout:4000,
      ...(index===0&&screenshotStem?{path:screenshotStem+'-sample.png'}:{})});
    samples.push({at:Math.round(performance.now()-started),data:screenshot.toString('base64')});
    const pause=started+(index+1)*62-performance.now();
    if(pause>0)await new Promise(resolve=>setTimeout(resolve,pause));
  }
  return {...layer,...await page.evaluate(async ({samples,probeStart}) => {
    const events = window.actorFrameEvents.filter(event=>event.at>=probeStart);
    const last = events.at(-1);
    const presentation = last ? {events:events.length,source:last.source,size:last.size,
      decodedBy:last.decodedBy,alpha:last.alpha,
      distinctTimestamps:new Set(events.map(event=>event.mediaTime).filter(time=>time!==undefined)).size,
      elapsedMs:Math.round(last.at-events[0].at)} : undefined;
    const fingerprints = new Set();
    let previous, changes=0, runStarted=0, longestUnchangedMs=0, cropPixels;
    for(const [index,{at,data}] of samples.entries()){
      const image = new Image();
      image.src='data:image/png;base64,'+data;
      await image.decode();
      const canvas=document.createElement('canvas');
      canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
      cropPixels={width:canvas.width,height:canvas.height};
      const context=canvas.getContext('2d');
      context.drawImage(image,0,0);
      const pixels=context.getImageData(Math.floor(canvas.width*.3),Math.floor(canvas.height*.1),
        Math.max(1,Math.floor(canvas.width*.4)),Math.max(1,Math.floor(canvas.height*.58))).data;
      let hash=2166136261;
      for(let offset=0;offset<pixels.length;offset+=4){
        for(let channel=0;channel<3;channel++)hash=Math.imul(hash^(pixels[offset+channel]>>3),16777619);
      }
      fingerprints.add(hash);
      if(index===0 || hash!==previous){
        if(index>0){
          changes++;
          longestUnchangedMs=Math.max(longestUnchangedMs,at-runStarted);
        }
        runStarted=at;
      }
      previous=hash;
    }
    const elapsedMs=samples.at(-1).at-samples[0].at;
    longestUnchangedMs=Math.max(longestUnchangedMs,samples.at(-1).at-runStarted);
    return {samples:samples.length,elapsedMs,sampleIntervalMs:Math.round(elapsedMs/(samples.length-1)),
      cropPixels,presentation,uniqueVisibleFrames:fingerprints.size,visibleChanges:changes,longestUnchangedMs};
  },{samples,probeStart})};
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
  const {stage:journeyStage,caseId}=sample;
  const free=journeyStage==='free';
  const suppliedFree=free&&!synthetic&&JSON.parse(await readFile(path.join(casesDirectory,caseId+'.json'),'utf8'));
  const actor=suppliedFree?path.basename(suppliedFree.public.citizen.portrait,'.webp'):sample.actor;
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
  const viewportArg=option('--viewport', null);
  const [width,height]=viewportArg?.split('x').map(Number)||[];
  if(viewportArg)assert.ok(width>=200&&height>=250,'Provide --viewport WIDTHxHEIGHT.');
  const viewport=viewportArg?{width,height}:viewportFor(engine,journeyStage);
  const dpr=Number(option('--dpr',2));
  const context=await browser.newContext({viewport,deviceScaleFactor:dpr,isMobile:true,hasTouch:true,
    reducedMotion:preference==='reduced-motion'?'reduce':'no-preference'});
  try{
    const page=await context.newPage();
    page.setDefaultTimeout(12000);
    const requests=[], failedRequests=[], errors=[], base=`${engine}-${journeyStage}-${actor}-${preference}`;
    const capture=name=>path.join(output,base+'-'+name+'.png');
    page.on('request',request=>requests.push(new URL(request.url()).pathname));
    page.on('requestfailed',request=>failedRequests.push(new URL(request.url()).pathname));
    page.on('pageerror',error=>errors.push(error.message));
    const useNativeImage=preference==='missing-sheet';
    const posterOnly=preference==='poster-only';
    let blockAllMedia=posterOnly||preference==='retry';
    const blockedMotion=blockAllMedia?page.waitForEvent('requestfailed',{
      predicate:request=>new URL(request.url()).pathname.endsWith(`/motion/${actor}.webp`),timeout:16000
    }):null;
    if(blockAllMedia||useNativeImage){
      await page.route(`**/motion/${actor}*`,route=>{
        const isNativeImage=new URL(route.request().url()).pathname.endsWith(`/motion/${actor}.webp`);
        return blockAllMedia||useNativeImage&&!isNativeImage?route.abort():route.continue();
      });
    }else if(['atlas-only','no-canvas'].includes(preference)){
      // Both decoders share the same authored WebM. Fail it to reach the last
      // two animated fallback layers deterministically.
      await page.route('**/motion/'+actor+'.webm',route=>route.abort());
    }
    await page.addInitScript(({mode,legacyAtlas,measure})=>{
      if(legacyAtlas||['no-canvas','autoplay-denied','software-only','atlas-only'].includes(mode))HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Autoplay disabled','NotAllowedError'));
      if(['atlas-only','no-canvas','software-only'].includes(mode))Object.defineProperty(window,'VideoDecoder',{value:undefined});
      const videoFrameCallback=HTMLVideoElement.prototype.requestVideoFrameCallback;
      const drawImage=CanvasRenderingContext2D.prototype.drawImage;
      const getImageData=CanvasRenderingContext2D.prototype.getImageData;
      const videoProbeCanvases=new WeakSet();
      if(mode==='video-opaque'){
        CanvasRenderingContext2D.prototype.getImageData=function(...args){
          const pixels=getImageData.apply(this,args);
          if(videoProbeCanvases.has(this.canvas))pixels.data[3]=255;
          return pixels;
        };
      }
      window.actorFrameEvents=[];
      const record=(layer,source,size,mediaTime,decodedBy,alpha)=>{
        if(!measure||!layer.parentNode?.hasAttribute('data-rxa-motion-ready')||!layer.matches('.rxa-citizen-video'))return;
        window.actorFrameEvents.push({at:performance.now(),source,size,mediaTime,decodedBy,alpha});
      };
      if(videoFrameCallback&&(measure||mode==='video-frozen')){
        let delivered=0;
        HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){
          return videoFrameCallback.call(this,(at,metadata)=>{
            // Emulate a decoder that hands over initial frames then freezes.
            if(mode==='video-frozen'&&this.hasAttribute('data-rxa-motion')&&delivered++>=4)return;
            record(this,this.currentSrc,{width:metadata.width,height:metadata.height},metadata.mediaTime);
            callback.call(this,at,metadata);
          });
        };
      }
      if(measure||mode==='video-opaque'){
        CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
          const drawn=drawImage.call(this,image,...args);
          if(mode==='video-opaque'&&image instanceof HTMLVideoElement&&this.canvas.width===1&&this.canvas.height===1)
            videoProbeCanvases.add(this.canvas);
          if(this.canvas.hasAttribute('data-rxa-motion-canvas'))
            record(this.canvas,image.currentSrc,{width:this.canvas.width,height:this.canvas.height});
          return drawn;
        };
      }
      if(measure){
        const webgl=globalThis.WebGLRenderingContext?.prototype;
        const sampledAlpha=new WeakMap();
        const frameTimes=new WeakMap();
        if(webgl){
          const texImage=webgl.texImage2D;
          webgl.texImage2D=function(...args){
            const result=texImage.apply(this,args);
            const image=args.at(-1);
            if(this.canvas.hasAttribute('data-rxa-motion-decoded')&&globalThis.VideoFrame&&image instanceof VideoFrame)
              frameTimes.set(this.canvas,image.timestamp);
            return result;
          };
          const drawArrays=webgl.drawArrays;
          webgl.drawArrays=function(...args){
            const result=drawArrays.apply(this,args);
            const canvas=this.canvas;
            if(!canvas.hasAttribute('data-rxa-motion-decoded'))return result;
            if(!sampledAlpha.has(canvas)){
              const pixel=new Uint8Array(4);
              this.readPixels(0,0,1,1,this.RGBA,this.UNSIGNED_BYTE,pixel);
              const corner=pixel[3];
              this.readPixels(canvas.width>>1,canvas.height>>1,1,1,this.RGBA,this.UNSIGNED_BYTE,pixel);
              sampledAlpha.set(canvas,{corner,center:pixel[3]});
            }
            const mediaTime=frameTimes.get(canvas);
            record(canvas,null,{width:canvas.width,height:canvas.height},mediaTime,
              mediaTime===undefined?'software-vp9':'webcodecs',sampledAlpha.get(canvas));
            return result;
          };
        }
      }
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
    },{mode:preference,legacyAtlas,measure});
    try{
      if(syntheticExample){
        const {view}=await fixture.service.handle({op:'start',context:'seminar',mode:'training',
          locale:'ru',workbookVersion:2,requestId:'synthetic-c03-motion'},fixture.identity);
        assert.equal(view.case.id,caseId);
        await page.addInitScript(({owner,sessionId,mode,status})=>{
          const key='rudn.reception.workspace.v2:'+owner+':'+encodeURIComponent('/api/reception')+':current';
          localStorage.setItem(key,JSON.stringify({owner,version:'reception-ai-ui-v1',sessionId,mode,status}));
        },{owner:fixture.identity.studentKey,sessionId:view.id,mode:view.mode,status:view.status});
      }else if(journeyStage!=='example'&&!free){
        // Seed only the completed prerequisite stages of this isolated profile.
        // A real browser click must still start and allocate a current session.
        const ownerKey=hash('student:'+fixture.identity.studentKey);
        await fixture.store.transaction('seminarProgress/'+ownerKey,()=>({
          [SEMINAR_STORY_PROGRESS_KEY]:{example:{completed:true},...(journeyStage==='independent'?{mentor:{completed:true}}:{})}
        }));
      }
      const origin='http://127.0.0.1:'+fixture.server.address().port;
      await page.goto(origin+'/__qa/reception.html?context='+(free?'free':'seminar')+'&lang=ru');
      if(free){
        const caseSelect=page.locator('select[name="trainingCaseId"]');
        await caseSelect.selectOption(caseId);
        const started=page.waitForResponse(response=>response.url()===origin+'/api/reception'&&
          response.request().postDataJSON()?.op==='start');
        const [response]=await Promise.all([started,page.locator('[data-action="start"]').tap()]);
        assert.equal(response.ok(),true,await response.text());
        const {view}=await response.json();
        assert.equal(view.case.id,caseId);
        assert.equal(view.case.citizen.portrait,`assets/gfx1/avatars/${actor}.webp`);
      }
      if(!syntheticExample&&!free){
        const started=page.waitForResponse(response=>response.url()===origin+'/api/reception'&&
          response.request().postDataJSON()?.op==='start');
        const [startResponse]=await Promise.all([started,
          page.locator(`[data-action="start-journey"][data-stage="${journeyStage}"]`).tap()]);

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
      const quality={};
      let recoveryMs, videoSwitchMs, movingPixels, chatMovingPixels, returnedMovingPixels, keyboardMovingPixels, afterKeyboardMovingPixels;
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
        if(preference==='video-frozen'){
          const awaitingFallback=Date.now();
          await character.locator('video[data-rxa-motion]').waitFor({state:'detached'});
          await ready.waitFor();
          videoSwitchMs=Date.now()-awaitingFallback;
        }
        assert.equal(await activeLayer.evaluate(node=>getComputedStyle(node).opacity),'1');
        if(preference==='no-canvas')assert.ok(await activeLayer.evaluate(node=>node.hasAttribute('data-rxa-motion-sprite')));
        if(useNativeImage)assert.ok(await activeLayer.evaluate(node=>node.hasAttribute('data-rxa-motion-image')));
        movingPixels=await checkMovement(page,character,{label:'Scene',threshold:500,screenshotStem:path.join(output,base+'-scene')});
      }
      if(measure&&!posterOnly)quality.scene=await sampleVisibleFrames(page,character,path.join(output,base+'-scene'));
      if(requireHD&&['default','reduced-motion','save-data','autoplay-denied','video-frozen','video-opaque','software-only'].includes(preference)){
        assert.ok(quality.scene.intrinsic.width>=700, 'Use the authored master on a capable decoder.');
        assert.ok(quality.scene.uniqueVisibleFrames>=10, 'The master must visibly animate.');
      }
      if(preference==='software-only')assert.equal(await activeLayer.getAttribute('data-rxa-motion-decoded'),'software');
      if(preference==='atlas-only')assert.ok(await activeLayer.evaluate(node=>node.hasAttribute('data-rxa-motion-canvas')));
      if(preference==='default')await page.screenshot({path:capture('opening')});
      if(legacyAtlas||useNativeImage||posterOnly||preference==='no-canvas')assert.ok(sheetURLs().length>=1);
      assert.ok(!requests.some(url=>url.endsWith(`/${actor}-frames.webp`)));
      if(legacyAtlas)assert.equal(usesNative(),useNativeImage||preference==='retry'||posterOnly);
      if(legacyAtlas)assert.ok(!requests.some(url=>url.endsWith(`/motion/${actor}.webm`)),'Atlas playback must work with video disabled.');

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
      const contact=journeyStage==='mentor'?'[data-chat-dialog="citizen"][aria-pressed="true"]':'.rxa-person';
      assert.equal(await page.locator(contact).locator(avatarSelector).count(),1,
        'The citizen portrait belongs to the visible active contact.');
      assert.ok((await avatarPoster.getAttribute('src')).endsWith(`/avatars/${actor}.webp`));
      assert.equal(await avatar.locator(controls).count(),0,'The chat portrait has no playback controls.');
      if(posterOnly)await checkStill(page,avatar,avatarPoster,capture('chat-poster'));
      else{
        await avatarReady.waitFor();
        chatMovingPixels=await checkMovement(page,avatar,{label:'Chat portrait',threshold:10,
          screenshotStem:preference==='default'?path.join(output,base+'-chat-portrait'):undefined});
        if(measure)quality.chat=await sampleVisibleFrames(page,avatar,path.join(output,base+'-chat'));
        if(requireHD&&['default','reduced-motion','save-data','autoplay-denied','video-frozen','video-opaque','software-only'].includes(preference)){
          assert.ok(quality.chat.intrinsic.width>=700, 'The chat portrait must also use the authored master.');
          assert.ok(quality.chat.uniqueVisibleFrames>=10, 'The master must visibly animate in chat.');
        }
        if(preference==='default')await page.screenshot({path:capture('chat')});
      }

      if(journeyStage==='mentor'){
        await page.locator('[data-chat-dialog="mentor"]').tap();
        await avatar.waitFor({state:'detached'});
        await page.locator('[data-chat-dialog="citizen"] .rxa-chat-portrait .rxa-citizen-poster').waitFor();
        await page.locator('[data-chat-dialog="citizen"]').tap();
        await avatar.waitFor();
        if(!posterOnly)await avatarReady.waitFor();
        if(preference==='default'){
          const editor=page.locator('[data-message-draft]');
          await editor.focus();
          // Drive the viewport events used by the app when a device IME appears.
          await page.evaluate(()=>{
            Object.defineProperty(visualViewport,'height',{configurable:true,value:innerHeight-220});
            visualViewport.dispatchEvent(new Event('resize'));
          });
          await page.locator('#receptionAI[data-keyboard-open=true]').waitFor();
          await avatarReady.waitFor();
          keyboardMovingPixels=await checkMovement(page,avatar,{label:'Chat portrait with keyboard',threshold:10});
          await page.evaluate(()=>{
            delete visualViewport.height;
            visualViewport.dispatchEvent(new Event('resize'));
          });
          await editor.blur();
          await page.locator('#receptionAI[data-keyboard-open=false]').waitFor();
          await avatarReady.waitFor();
          afterKeyboardMovingPixels=await checkMovement(page,avatar,{label:'Chat portrait after keyboard',threshold:10});
        }
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
          if(node.hasAttribute('data-rxa-motion-decoded'))return true;
          const context=node.getContext('2d');
          return context.getImageData(0,0,1,1).data[3]===0&&context.getImageData(node.width/2,node.height/2,1,1).data[3]>0;
        }),true);
      }
      const actorClicks=await page.evaluate(()=>window.actorClicks);
      assert.equal(actorClicks,0,'The player must never require a click on the visitor.');
      assert.deepEqual(errors,[]);
      for(const visible of Object.values(quality)){
        assert.equal(visible.actor,actor);
        if(visible.presentation?.alpha){
          assert.ok(visible.presentation.alpha.corner<=32, 'The authored cutout keeps a transparent outer edge.');
          assert.ok(visible.presentation.alpha.center>=192, 'The composited cutout displays the actor.');
        }
        const shownSource=visible.source||visible.presentation?.source;
        if(shownSource)assert.ok(path.basename(new URL(shownSource).pathname).match(new RegExp('^'+actor+'(?:-|\\.)')),
          'The composited layer must use the current actor’s animation: '+shownSource);
      }
      const motionURLs=items=>[...new Set(items.filter(url=>url.includes('/assets/gfx1/motion/')))];
      const result={engine,browserVersion:browser.version(),journeyStage,caseId,viewport,dpr,preference,status:'pass',actor,actorClicks,movingPixels,
        ...(measure?{quality,motionRequested:motionURLs(requests),motionFailed:motionURLs(failedRequests)}:{}),
        chatMovingPixels,keyboardMovingPixels,afterKeyboardMovingPixels,returnedMovingPixels,posterOnly,recoveryMs,videoSwitchMs,sheets:new Set(sheetURLs()).size};
      results.push(result);
      console.log(JSON.stringify(result));
    }catch(error){
      await page.screenshot({path:capture('failure')}).catch(()=>{});
      results.push({engine,browserVersion:browser.version(),journeyStage,caseId,viewport,dpr,preference,actor,status:'fail',error:error.message});
      if(!measure)throw error;
      console.error(JSON.stringify(results.at(-1)));
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
  assert.ok(samples.length,'Choose example, mentor, independent or free.');
  for(const engine of engines){
    assert.ok(['chromium','webkit','yandex'].includes(engine),'Choose chromium, webkit or yandex.');
    const browser=await browsers[engine==='yandex'?'chromium':engine].launch(engine==='yandex'
      ?{executablePath:option('--browser-executable','/Applications/Yandex.app/Contents/MacOS/Yandex')}
      :{});
    try{
      for(const sample of samples)for(const preference of sample.preferences.filter(item=>!selectedPreferences.length||selectedPreferences.includes(item)))
        await runActorCase(browser,engine,sample,preference,syntheticDirectory);
    }finally{await browser.close();}
  }
}finally{
  if(syntheticDirectory)await rm(syntheticDirectory,{recursive:true,force:true});
  await writeFile(path.join(output,'report.json'),JSON.stringify(results,null,2)+'\n');
}
assert.ok(results.length,'No sample matches this stage and preference.');
assert.ok(results.every(result=>result.status==='pass'),'Actor browser checks failed. See report.json.');
