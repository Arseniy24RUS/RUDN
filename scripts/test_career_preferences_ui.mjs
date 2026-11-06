/** Focused, real-browser checks of the Seminar 5 preferences component.
 * Reuses the existing isolated localhost harness, the actual entry/runtime and
 * native controls. Chromium uses CDP's native multi-touch input; Firefox/WebKit
 * exercise real mouse Pointer Events and keyboard input, not simulated phones.
 * Evidence is written outside the repository. No production service is used.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {rankJourneyAuthorities,buildVacancyRequirements,summarizeVacancyAssessment} from '../site/apps/career/assets/career-journey-model.mjs';
import {expandTerritorialCatalog} from '../site/apps/career/assets/territorial-catalog.mjs';

const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const engine=option('--browser','chromium');assert.ok(['chromium','firefox','webkit'].includes(engine));
const output=path.resolve(option('--output',path.join(root,'../career-preferences-qa',engine)));
assert.ok(output!==root&&!output.startsWith(root),'Keep QA evidence outside the source repository.');
const playwrightPath=process.env.PLAYWRIGHT_MODULE_PATH||process.env.PLAYWRIGHT_PATH;
const pw=playwrightPath?await import(pathToFileURL(path.resolve(playwrightPath)).href):require('playwright');
const mapData=JSON.parse(await readFile(path.join(root,'site/apps/career/data/region-map.json'),'utf8'));
const territories=JSON.parse(await readFile(path.join(root,'site/apps/career/data/territories.json'),'utf8'));
const mapById=new Map(territories.map(region=>[region.id,mapData.features.find(f=>f.mapId===String(region.mapId))]));
const json=async name=>JSON.parse(await readFile(path.join(root,'site/apps/career/data',name+'.json'),'utf8'));
const [questions,sectors,tracks,conditions,baseAuthorities,territorial,authoritySymbols]=await Promise.all(['questions','sectors','tracks','conditions','authorities','territorial-authorities','authority-symbols'].map(json));
const national=await json('position-materials/national');
const allAuthorities=[...baseAuthorities,...expandTerritorialCatalog(territorial).filter(a=>!baseAuthorities.some(b=>b.id===a.id))];
const careerInputs={answers:Object.fromEntries(questions.map(q=>[q.id,({E:5,A:5,D:4,M:4,N:3,K:2,C:2,T:2,I:2})[q.scale]||3])),prioritySectors:['FIN','ECO','DIG','IND'],lowPrioritySectors:['SEC','EMR'],conditions:Object.fromEntries(conditions.map(c=>[c.id,3])),focusAreas:{}};
const report={status:'fail',engine,startedAt:new Date().toISOString(),checks:[],screenshots:[],errors:[],externalRequests:[],inputEvidence:engine==='chromium'?'Native CDP multi-touch and touch drag; Playwright mouse/keyboard':'Native Playwright mouse Pointer Events and keyboard; no physical or native multi-touch claim',limitations:['Synthetic browser QA; not a physical phone or screen-reader field test.'],runtimeSha256:createHash('sha256').update(await readFile(path.join(root,'site/apps/career/runtime.bundle.mjs'))).digest('hex')};
const pass=(name,details={})=>{report.checks.push({name,status:'pass',...details});console.log('PASS '+name);};
const tick=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const near=(a,b,tolerance=2)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} should be within ${tolerance} of ${b}`);
const viewportSelector='.career-region-map-viewport',contentSelector='.career-region-map-content';
const handleSelector=id=>`[data-wish-drag-handle="${id}"]`;
const rowSelector=id=>`[data-wish-list] > [data-wish-id="${id}"]`;
let server,browser,context,page,cdp,base;
async function bounded(promise,label,ms=45000){
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out after '+ms+'ms')),ms);})]);}finally{clearTimeout(timer);}
}

async function startHarness(){
  if(args.includes('--base-url'))return option('--base-url');
  server=spawn(process.execPath,[path.join(root,'scripts/test_personality_ui.mjs'),'--serve','--port','0'],{cwd:root,stdio:['ignore','pipe','pipe']});
  return new Promise((resolve,reject)=>{
    let stdout='',stderr='';const deadline=setTimeout(()=>reject(Error('Isolated harness did not start within 15 seconds')),15000);
    server.stdout.on('data',bytes=>{stdout+=bytes;const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/__personality-qa/);if(match){clearTimeout(deadline);resolve(match[0]);}});
    server.stderr.on('data',bytes=>{stderr+=bytes;});server.once('error',error=>{clearTimeout(deadline);reject(error);});
    server.once('exit',code=>{clearTimeout(deadline);reject(Error(`Harness exit ${code}: ${stderr}`));});
  });
}
async function screenshot(name,selector=null){
  const filename=path.join(output,name+'.png');await mkdir(output,{recursive:true});
  if(selector)await page.locator(selector).screenshot({path:filename});else await page.screenshot({path:filename,fullPage:false});
  report.screenshots.push(filename);
}
async function readyPreferences(){
  await page.locator('html[data-qa-ready="true"]').waitFor();
  await page.locator('#view-preferences:not([hidden])').waitFor();
  await page.locator('#journey-regions[data-region-map-state="ready"]').waitFor();await tick(page);
}
async function finishPersonality(){
  await page.locator('html[data-qa-ready="true"]').waitFor();await page.locator('#view-personality:not([hidden])').waitFor();
  const seen=new Set();
  for(let p=0;p<12;p++){
    const ids=await page.locator('#personality-root input[data-personality-item]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.personalityItem))]);
    assert.equal(ids.length,10);
    for(const id of ids){assert.ok(!seen.has(id));seen.add(id);await page.locator(`input[data-personality-item="${id}"][value="3"]`).check();}
    await page.locator('#personality-next').click();
  }
  assert.equal(seen.size,120);await page.locator('#view-personality-results:not([hidden])').waitFor();
  await page.locator('#personality-continue').click();await readyPreferences();
  pass('Actual course UI reaches preferences after all 120 personality answers');
}
async function journey(){
  await page.evaluate(()=>handle.flush());
  return page.evaluate(async()=>{
    const {durableStore}=await import('/assets/js/durable-store.js');
    const entry=await durableStore.loadDraft({owner:qa.owner,activitySlug:'career-workspace',mode:'diagnostic',attemptId:'workspace-v1'});
    return entry?.state?.values?.['career-journey-v1']?JSON.parse(entry.state.values['career-journey-v1']):null;
  });
}
const order=()=>page.locator('[data-wish-list] > [data-wish-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.wishId));
const selection=()=>page.locator('[data-region-checkbox]:checked').evaluateAll(nodes=>nodes.map(node=>node.dataset.regionCheckbox).sort());
const mapState=()=>page.locator(viewportSelector).evaluate(node=>({zoom:Number(node.dataset.mapZoom),x:Number(node.dataset.mapPanX),y:Number(node.dataset.mapPanY)}));
async function mapCenter(){
  await page.locator(viewportSelector).scrollIntoViewIfNeeded();const box=await page.locator(viewportSelector).boundingBox();return {x:box.x+box.width/2,y:box.y+box.height/2,box};
}
async function mapPoint(anchor){
  return page.locator(contentSelector).evaluate((node,point)=>{const matrix=node.getScreenCTM();return {x:matrix.a*point[0]+matrix.c*point[1]+matrix.e,y:matrix.b*point[0]+matrix.d*point[1]+matrix.f};},anchor);
}
async function worldPoint(point){
  return page.locator(contentSelector).evaluate((node,point)=>{const m=node.getScreenCTM().inverse();return {x:m.a*point.x+m.c*point.y+m.e,y:m.b*point.x+m.d*point.y+m.f};},point);
}
async function resetMap(){
  const button=page.locator('[data-region-zoom="reset"]');if(await button.isEnabled())await button.click();
  await tick(page);near((await mapState()).zoom,1,.001);await mapCenter();
}
async function wheelAt(point,deltaY){
  const before=(await mapState()).zoom;await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,deltaY);
  await page.waitForFunction(({before,deltaY})=>{const n=document.querySelector('#module').shadowRoot.querySelector('.career-region-map-viewport');const z=Number(n.dataset.mapZoom);return deltaY<0?z>before||z>=40:z<before||z<=1;},{before,deltaY});await tick(page);
}
async function zoomToRegion(id,target=16){
  await resetMap();const feature=mapById.get(id);assert.ok(feature);
  for(let count=0;count<12&&(await mapState()).zoom<target;count++){
    const point=await mapPoint(feature.anchor),box=await page.locator(viewportSelector).boundingBox();
    assert.ok(point.x>=box.x&&point.x<=box.x+box.width&&point.y>=box.y&&point.y<=box.y+box.height,`${id}: anchor must remain visible while zooming`);
    await wheelAt(point,-650);
  }
  assert.ok((await mapState()).zoom>=target,`${id}: zoom reaches ${target}×`);
}
async function nativeTouch(type,points){
  assert.ok(cdp,'CDP input is available only in Chromium');
  await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(({x,y,id=1})=>({x,y,id,radiusX:5,radiusY:5,force:1}))});
}
async function pinch(center,startRadius,endRadius,{cancel=false}={}){
  await nativeTouch('touchStart',[{x:center.x-startRadius,y:center.y,id:1},{x:center.x+startRadius,y:center.y,id:2}]);
  for(let step=1;step<=10;step++){
    const r=startRadius+(endRadius-startRadius)*step/10;
    await nativeTouch('touchMove',[{x:center.x-r,y:center.y,id:1},{x:center.x+r,y:center.y,id:2}]);await tick(page);
  }
  await nativeTouch(cancel?'touchCancel':'touchEnd',[]);await tick(page);
}
async function labelSnapshot(){
  return page.locator('[data-region-label][data-label-visible="true"]').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect(),lines=[...node.children].map(span=>span.textContent),matrix=node.getScreenCTM();return {id:node.dataset.regionLabel,text:lines.join(qa.lang==='zh-Hans'?'':' '),lines:lines.length,fontPixels:parseFloat(getComputedStyle(node).fontSize)*Math.hypot(matrix.a,matrix.b),x:b.x,y:b.y,width:b.width,height:b.height};}));
}
function assertLabels(labels){
  assert.ok(labels.length>0,'Zoomed map exposes region names');
  for(const label of labels){assert.ok(label.text&&label.fontPixels>=12&&label.fontPixels<=14&&label.height>=10&&label.height<=20*label.lines,`Readable label ${JSON.stringify(label)}`);}
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
    const a=labels[i],b=labels[j],w=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),h=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
    assert.ok(!(w>2&&h>2),`Region labels overlap: ${a.id} / ${b.id}`);
  }
}
async function assertLayout(width,height,language){
  await page.setViewportSize({width,height});await tick(page);
  const boxes=await page.locator('#journey-regions').evaluate(root=>{
    const list=root.querySelector('.career-region-list-panel'),map=root.querySelector('.career-region-map-panel'),a=list.getBoundingClientRect(),b=map.getBoundingClientRect();
    return {domListFirst:!!(list.compareDocumentPosition(map)&Node.DOCUMENT_POSITION_FOLLOWING),listBottom:a.bottom,mapTop:b.top,documentWidth:document.documentElement.scrollWidth,windowWidth:innerWidth,rootWidth:root.scrollWidth,rootClientWidth:root.clientWidth};
  });
  assert.equal(boxes.domListFirst,true);assert.ok(boxes.mapTop>=boxes.listBottom-1,'List is visually above the map');
  assert.ok(boxes.documentWidth<=boxes.windowWidth+1);assert.ok(boxes.rootWidth<=boxes.rootClientWidth+1);
  await resetMap();const low=await labelSnapshot();await zoomToRegion('ru-77',8);const high=await labelSnapshot();assertLabels(high);
  const regions=new Map(territories.map(region=>[region.id,region]));
  for(const item of high){const r=regions.get(item.id),expected=language==='ru'?r.name:language==='en'?(r.name_en||r.name):(r.name_zh||r.name);assert.equal(item.text,expected);}
  await screenshot(`${language}-${width}x${height}-map`,'.career-region-map-panel');
  await resetMap();await screenshot(`${language}-${width}x${height}-list-before-map`,'#journey-regions');
  pass(`${language}: list before map, readable labels and no overflow at ${width}×${height}`,{initialLabels:low.length,zoomedLabels:high.length});
}
async function chooseEmployers(){
  await page.locator('[data-region-checkbox="ru-77"]').check();
  const rank=rankJourneyAuthorities({authorities:allAuthorities,tracks,questions,sectors,inputs:careerInputs,regionIds:(await journey()).regionIds,limit:3});
  const third=rank.ranked.slice(0,3).find(authority=>!['mintrud','rosatom'].includes(authority.id));assert.ok(third,'At least one actual top-three match is exercised');
  await page.locator('#journey-authority-scope').selectOption('');
  for(const id of ['mintrud','rosatom',third.id]){
    await page.locator('#journey-authority-search').fill(allAuthorities.find(authority=>authority.id===id).name);
    await page.locator(`[data-add-wish="${id}"]`).click();
  }
  const ids=await order();assert.equal(ids.length,3);assert.equal(new Set(ids).size,3);assert.deepEqual((await journey()).desiredIds,ids);
  assert.equal(await page.locator('[data-move-wish]').count(),0,'Arrow reorder buttons are removed');
  return ids;
}
async function drag(id,targetId,{touch=false,cancel=false,releaseCapture=false,previewExpected=null}={}){
  await page.locator('[data-wish-list]').scrollIntoViewIfNeeded();await tick(page);
  const handle=page.locator(handleSelector(id)),from=await handle.boundingBox(),target=await page.locator(rowSelector(targetId)).boundingBox();
  const rows=await order(),down=rows.indexOf(targetId)>rows.indexOf(id);
  const start={x:from.x+from.width/2,y:from.y+from.height/2},end={x:start.x,y:target.y+target.height*(down?.8:.2)};
  const initial=[...(await journey()).desiredIds];
  if(releaseCapture)await handle.evaluate(node=>node.addEventListener('pointerdown',event=>{window.qa.lastDragPointer=event.pointerId;},{once:true}));
  if(touch)await nativeTouch('touchStart',[{...start,id:7}]);else{await page.mouse.move(start.x,start.y);await page.mouse.down();}
  for(let step=1;step<=12;step++){
    const p={x:start.x,y:start.y+(end.y-start.y)*step/12};
    if(touch)await nativeTouch('touchMove',[{...p,id:7}]);else await page.mouse.move(p.x,p.y);
    await tick(page);
  }
  assert.equal(await handle.getAttribute('aria-pressed'),'true');
  if(previewExpected!==null)assert.equal(await page.locator(rowSelector(id)).getAttribute('data-wish-preview-position'),String(previewExpected));
  assert.deepEqual((await journey()).desiredIds,initial,'A drag preview must not be persisted before drop');
  if(releaseCapture)await handle.evaluate(node=>node.releasePointerCapture(qa.lastDragPointer));
  if(touch)await nativeTouch(cancel?'touchCancel':'touchEnd',[]);else{if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
  await tick(page);assert.equal(await page.locator('[data-wish-drag-handle][aria-pressed="true"]').count(),0);
}

try{
  await mkdir(output,{recursive:true});base=await startHarness();report.url=base;
  report.setupStage='launch';browser=await bounded(pw[engine].launch({headless:true,timeout:45000}),'Browser launch');report.browserVersion=await browser.version();
  report.setupStage='context';context=await bounded(browser.newContext({viewport:{width:390,height:844},hasTouch:engine!=='firefox',deviceScaleFactor:1,reducedMotion:'reduce'}),'Browser context');
  report.setupStage='trace';await bounded(context.tracing.start({screenshots:true,snapshots:true,sources:false}),'Browser tracing');
  report.setupStage='page';page=await bounded(context.newPage(),'Browser page');page.setDefaultTimeout(15000);report.setupStage='ready';
  page.on('pageerror',error=>report.errors.push({kind:'pageerror',message:error.message}));
  page.on('console',message=>{if(message.type()==='error')report.errors.push({kind:'console',message:message.text()});});
  page.on('response',response=>{if(response.status()>=400)report.errors.push({kind:'http',status:response.status(),url:response.url()});});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==new URL(base).origin&&!['data:','blob:'].includes(url.protocol)){report.externalRequests.push(url.href);return route.abort();}return route.continue();});
  // The reused personality harness forbids career submissions. This isolated
  // backend adapter records the real career payload locally; it never contacts
  // the production API and does not replace or pre-seed the application UI.
  await context.route(url=>url.pathname==='/assets/js/backend.js',async route=>{
    const response=await route.fetch(),source=await response.text();
    const original="saveAttempt:async()=>{window.qa.unexpectedSubmissions++;throw Error('Personality QA forbids submissions');}";
    assert.ok(source.includes(original),'Only the known isolated backend stub may be adapted');
    await route.fulfill({response,body:source.replace(original,"saveAttempt:async attempt=>{(window.qa.careerSubmissions ||= []).push(structuredClone(attempt));return {queued:false};}")});
  });
  if(engine==='chromium')cdp=await context.newCDPSession(page);
  await page.goto(base);assert.match(await page.title(),/Personality course UI/);await finishPersonality();
  assert.equal(await page.locator('[data-region-checkbox]').count(),89);
  assert.equal(await page.locator('[data-region-zoom="in"], [data-region-zoom="out"]').count(),0);
  assert.ok(await page.locator('#journey-preferences-root').innerText());
  const beforeSelection=await selection();
  const centre=await mapCenter(),anchorBefore=await worldPoint(centre);await wheelAt(centre,-650);const anchorAfter=await worldPoint(centre);
  const anchoredScreen=await mapPoint([anchorBefore.x,anchorBefore.y]);near(anchoredScreen.x,centre.x,1.5);near(anchoredScreen.y,centre.y,1.5);
  assert.ok((await mapState()).zoom>1);await wheelAt(centre,650);assert.ok((await mapState()).zoom<1.1);
  pass('Mouse wheel zooms around its pointer and zooms back out');
  await zoomToRegion('ru-77',8);const panBefore=await mapState(),p=await mapCenter();
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+52,p.y+34,{steps:12});await page.mouse.up();await tick(page);
  const panAfter=await mapState();assert.ok(Math.hypot(panAfter.x-panBefore.x,panAfter.y-panBefore.y)>1);assert.deepEqual(await selection(),beforeSelection);
  pass('Mouse pan changes the map position without selecting a region');
  if(cdp){
    await resetMap();const center=await mapCenter(),world=await worldPoint(center);
    await pinch(center,18,84);const z1=(await mapState()).zoom;assert.ok(z1>3);
    await pinch(center,18,84);const z2=(await mapState()).zoom;assert.ok(z2>12);
    const anchoredScreen=await mapPoint([world.x,world.y]);near(anchoredScreen.x,center.x,2);near(anchoredScreen.y,center.y,2);assert.deepEqual(await selection(),beforeSelection);
    await pinch(center,84,18);assert.ok((await mapState()).zoom<z2/2);
    await pinch(center,18,30,{cancel:true});assert.deepEqual(await selection(),beforeSelection);
    const old=await mapState();await nativeTouch('touchStart',[{x:center.x,y:center.y,id:4}]);await nativeTouch('touchMove',[{x:center.x+44,y:center.y+28,id:4}]);await nativeTouch('touchEnd',[]);await tick(page);
    const moved=await mapState();assert.ok(Math.hypot(moved.x-old.x,moved.y-old.y)>1);assert.deepEqual(await selection(),beforeSelection);
    pass('Native Chromium two-finger pinch, pinch-out, cancel and one-finger pan preserve selection',{firstZoom:z1,secondZoom:z2});
  }
  const firstLabels=await labelSnapshot();
  for(const id of ['ru-77','ru-78','ru-92']){
    await zoomToRegion(id,32);const z=(await mapState()).zoom;assert.ok(z>=32&&z<=40);
    const point=await mapPoint(mapById.get(id).anchor),selectedBefore=await selection();
    if(cdp){await nativeTouch('touchStart',[{...point,id:8}]);await nativeTouch('touchEnd',[]);}else await page.mouse.click(point.x,point.y);
    await tick(page);const selectedAfter=await selection(),expected=new Set(selectedBefore);expected.has(id)?expected.delete(id):expected.add(id);assert.deepEqual(selectedAfter,[...expected].sort());
    const label=page.locator(`[data-region-label="${id}"]`);assert.equal(await label.getAttribute('data-label-visible'),'true');
    await screenshot(`${id}-city-selection` ,'.career-region-map-panel');
  }
  pass('All three federal cities can be selected precisely at 32–40× zoom',{input:cdp?'native touch':'mouse'});
  await resetMap();const low=await labelSnapshot();await zoomToRegion('ru-77',8);const high=await labelSnapshot();assertLabels(high);
  assert.ok(high.some(label=>!low.some(old=>old.id===label.id)),'Additional local names appear when approaching');
  pass('Regional names progressively appear and remain non-overlapping',{overview:low.length,close:high.length});
  const chukotka=mapById.get('ru-87');assert.ok(typeof chukotka.outlineD==='string'&&chukotka.outlineD!==chukotka.d);
  assert.equal(await page.locator('[data-region-outline="ru-87"]').getAttribute('d'),chukotka.outlineD);
  assert.equal(await page.locator('[data-region-fill="ru-87"]').getAttribute('d'),chukotka.d);
  assert.equal(await page.locator('[data-region-fill="ru-87"]').evaluate(node=>getComputedStyle(node).stroke),'none');
  await zoomToRegion('ru-87',4);await screenshot('chukotka-outline','.career-region-map-panel');
  pass('Chukotka renders its seam-free outline independently of the preserved fill rings');
  await resetMap();
  for(const language of ['ru','en','zh-Hans']){
    await page.evaluate(async value=>{await handle.setLocale(value);qa.lang=value;},language);await readyPreferences();
    for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[1280,900]])await assertLayout(width,height,language);
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{await handle.setLocale('ru');qa.lang='ru';});await readyPreferences();
  const original=await chooseEmployers();await page.locator('[data-wish-list]').scrollIntoViewIfNeeded();
  const dimensions=await page.locator('[data-wish-drag-handle]').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {width:b.width,height:b.height};}));
  assert.ok(dimensions.every(b=>b.width>=44&&b.height>=44));
  await drag(original[2],original[0],{touch:!!cdp,previewExpected:1});const reordered=[original[2],original[0],original[1]];
  assert.deepEqual(await order(),reordered);assert.deepEqual((await journey()).desiredIds,reordered);
  await drag(original[2],original[1],{touch:!!cdp,previewExpected:3});assert.deepEqual(await order(),original);assert.deepEqual((await journey()).desiredIds,original);
  pass('Employers reorder 3→1 and 1→3 using a real drag handle, saving only the drop',{input:cdp?'native touch':'mouse'});
  await drag(original[0],original[2],{touch:!!cdp,cancel:true,previewExpected:3});assert.deepEqual(await order(),original);assert.deepEqual((await journey()).desiredIds,original);
  if(cdp){await drag(original[0],original[2],{touch:true,releaseCapture:true,previewExpected:3});assert.deepEqual(await order(),original);assert.deepEqual((await journey()).desiredIds,original);}
  pass('Cancel and capture-loss restore the exact original employer order',{captureLossTested:!!cdp});
  await page.setViewportSize({width:320,height:568});await page.locator(handleSelector(original[0])).scrollIntoViewIfNeeded();await tick(page);
  const firstHandle=page.locator(handleSelector(original[0])),edgeBox=await firstHandle.boundingBox(),edgeStart={x:edgeBox.x+edgeBox.width/2,y:edgeBox.y+edgeBox.height/2};
  const scrollBefore=await page.evaluate(()=>scrollY);
  if(cdp)await nativeTouch('touchStart',[{...edgeStart,id:9}]);else{await page.mouse.move(edgeStart.x,edgeStart.y);await page.mouse.down();}
  for(let n=1;n<=12;n++){const y=edgeStart.y+(558-edgeStart.y)*n/12;if(cdp)await nativeTouch('touchMove',[{x:edgeStart.x,y,id:9}]);else await page.mouse.move(edgeStart.x,y);await tick(page);}
  await page.waitForFunction(before=>scrollY>before+20,scrollBefore);
  assert.deepEqual((await journey()).desiredIds,original,'Edge-scroll preview does not commit');
  if(cdp)await nativeTouch('touchCancel',[]);else{await page.keyboard.press('Escape');await page.mouse.up();}
  await tick(page);assert.deepEqual(await order(),original);assert.deepEqual((await journey()).desiredIds,original);
  pass('Dragging at the viewport edge scrolls the page, and cancellation preserves employer order');
  if(cdp){
    await page.locator('[data-wish-list]').scrollIntoViewIfNeeded();await tick(page);const startScroll=await page.evaluate(()=>scrollY);
    await nativeTouch('touchStart',[{x:8,y:430,id:10}]);for(let n=1;n<=10;n++)await nativeTouch('touchMove',[{x:8,y:430-n*24,id:10}]);await nativeTouch('touchEnd',[]);
    await page.waitForFunction(before=>scrollY>before+20,startScroll);assert.deepEqual(await order(),original);
    pass('A normal native touch swipe outside the map and drag handle still scrolls the page');
  }
  await page.setViewportSize({width:390,height:844});
  const last=page.locator(handleSelector(original[2]));await last.focus();await last.press('Space');await last.press('ArrowUp');await last.press('ArrowUp');
  assert.deepEqual((await journey()).desiredIds,original);await last.press('Escape');assert.deepEqual(await order(),original);
  await last.focus();await last.press('Enter');await last.press('ArrowUp');await last.press('ArrowUp');await last.press('Enter');
  assert.deepEqual(await order(),reordered);assert.deepEqual((await journey()).desiredIds,reordered);
  assert.ok((await page.locator('[data-wish-sort-status]').innerText()).trim());
  await page.evaluate(()=>handle.flush());await page.reload();await page.locator('html[data-qa-ready="true"]').waitFor();await page.evaluate(()=>handle.navigate('preferences'));await readyPreferences();assert.deepEqual(await order(),reordered);
  pass('Keyboard grab, move, cancel and drop work; reload retains the confirmed order');
  for(const language of ['en','zh-Hans','ru']){
    await page.evaluate(async value=>{await handle.setLocale(value);qa.lang=value;},language);await readyPreferences();assert.deepEqual(await order(),reordered);
    await page.locator('[data-wish-list]').scrollIntoViewIfNeeded();await screenshot(`${language}-employer-order`,'#journey-desired-choices');
    const handles=await page.locator('[data-wish-drag-handle]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));assert.ok(handles.every(Boolean));
    const prefix={ru:'Переместить: ',en:'Reorder: ','zh-Hans':'调整顺序：'}[language];assert.ok(handles.every(value=>value.startsWith(prefix)),`${language}: drag instruction is translated separately from the official employer name`);
  }
  pass('Translated drag instructions preserve exact employer priority in English, Chinese and Russian');
  const stored=await journey(),owner=await page.evaluate(()=>qa.owner);
  await page.evaluate(async()=>{await mount({context:'free',route:'home'});});await page.locator('html[data-qa-ready="true"]').waitFor();assert.equal(await page.locator('#view-preferences:not([hidden])').count(),0);
  await page.evaluate(async owner=>{await mount({owner,context:'course',route:'preferences'});},owner);await readyPreferences();assert.deepEqual(await order(),reordered);assert.deepEqual((await journey()).desiredIds,stored.desiredIds);
  await page.evaluate(async()=>{await mount({owner:'student:preferences-other',route:'home'});});await page.locator('html[data-qa-ready="true"]').waitFor();await page.locator('#view-personality:not([hidden])').waitFor();
  await page.evaluate(async owner=>{await mount({owner,route:'preferences'});},owner);await readyPreferences();assert.deepEqual(await order(),reordered);
  pass('Free mode and another student cannot alter the saved course preference order');
  assert.equal(await page.evaluate(()=>qa.unexpectedSubmissions),0);assert.equal(await page.evaluate(()=>(qa.careerSubmissions||[]).length),0);
  await page.locator('#journey-preferences-next').click();await page.locator('#view-test:not([hidden])').waitFor();
  for(const question of questions){await page.locator(`[data-answer="${careerInputs.answers[question.id]}"]`).click();await page.locator('#question-next').click();}
  await page.locator('#view-sectors:not([hidden])').waitFor();
  for(const id of careerInputs.prioritySectors)await page.locator(`[data-sector="${id}"] .priority-toggle`).click();
  for(const id of careerInputs.lowPrioritySectors)await page.locator(`[data-sector="${id}"] .low-toggle`).click();
  await page.locator('#sectors-next').click();await page.locator('#view-conditions:not([hidden])').waitFor();
  for(const condition of conditions)await page.locator(`[data-condition="${condition.id}"][data-value="3"]`).click();
  await page.locator('#calculate-button').click();await page.locator('#seminar-show-authorities').click();
  await page.locator('[data-recommendation-group="recommended"]').waitFor();
  await page.evaluate(()=>handle.flush());
  const careerSubmissions=await page.evaluate(()=>qa.careerSubmissions||[]);assert.equal(careerSubmissions.length,1,'The completed career diagnostic produces exactly one local submission');assert.ok(!JSON.stringify(careerSubmissions).includes('ipip-'),'Personality item answers are excluded');
  const expectedRank=rankJourneyAuthorities({authorities:allAuthorities,tracks,questions,sectors,inputs:careerInputs,regionIds:(await journey()).regionIds,limit:3});
  const top3=expectedRank.ranked.slice(0,3).map(a=>a.id),matched=new Set(top3.filter(id=>reordered.includes(id)));
  for(const language of ['ru','en','zh-Hans']){
    await page.evaluate(async value=>{await handle.setLocale(value);qa.lang=value;},language);
    await page.locator('[data-recommendation-group="recommended"]').waitFor();
    const groups=await page.locator('[data-recommendation-group]').evaluateAll(nodes=>nodes.map(n=>n.dataset.recommendationGroup));assert.deepEqual(groups,['recommended','preferred']);
    assert.equal(await page.locator('[data-recommended-authority]').count(),6);assert.equal(await page.locator('.journey-comparison,.journey-comparison-columns,.journey-compare-item').count(),0);
    for(const [group,expected] of [['recommended',top3],['preferred',reordered]]){
      const cards=page.locator(`[data-recommendation-group="${group}"] [data-recommended-authority]`);
      assert.deepEqual(await cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.recommendedAuthority)),expected);
      for(let i=0;i<expected.length;i++){
        const card=cards.nth(i),id=expected[i];assert.equal(await card.locator('.journey-match-badge').count(),matched.has(id)?1:0);
        assert.equal(await card.evaluate(node=>node.classList.contains('journey-matched')),matched.has(id));
        assert.ok((await card.locator('h3').innerText()).trim());assert.ok((await card.locator(':scope > p').first().innerText()).trim());assert.ok((await card.locator('.seminar-track > strong').innerText()).trim());
        assert.equal(await card.locator('[data-authority-roles]').getAttribute('data-authority-roles'),id);assert.equal(await card.locator('[data-authority-vacancies]').count(),0);
        if(authoritySymbols.symbols[id]){const img=card.locator('.authority-symbol img');await img.scrollIntoViewIfNeeded();await img.evaluate(node=>node.decode());assert.ok(await img.evaluate(node=>node.naturalWidth>0));}
      }
    }
    for(const [width,height] of [[390,844],[1280,900]]){
      await page.setViewportSize({width,height});await tick(page);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      for(const group of ['recommended','preferred'])await screenshot(`${language}-${width}x${height}-${group}`,`[data-recommendation-group="${group}"]`);
    }
  }
  pass('Completed career UI shows exactly3 actual overall recommendations and3 chosen rich cards, with official images, preserved order, meaningful details and correct match badges in all3 languages',{top3,preferred:reordered});
  const disclosure=page.locator('[data-recommendation-group="preferred"] [data-authority-details]').first();
  if(await disclosure.count()){await disclosure.locator('summary').click();assert.equal(await disclosure.evaluate(node=>node.open),true);assert.ok((await disclosure.locator('div').innerText()).trim());}
  pass('Employer description disclosure remains interactive after the two-group simplification');
  assert.equal(await page.locator('#journey-vacancy-section,#seminar-vacancies,#journey-vacancy-employer,#journey-vacancy-search').count(),0,'The shared lower catalogue and filters are removed');
  await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{await handle.setLocale('ru');qa.lang='ru';});
  const roles=page.locator('[data-recommendation-group="preferred"] details[data-authority-roles="mintrud"]');
  await roles.locator(':scope > summary').click();assert.equal(await roles.evaluate(node=>node.open),true);
  const actualVacancy=national.positions.find(item=>item.id==='mintrud-reserve-2022-1');assert.ok(actualVacancy);
  await roles.locator('[data-role-search]').fill(actualVacancy.title);
  await roles.locator(`[data-select-vacancy="${actualVacancy.id}"]`).waitFor();
  const sourceRows=await roles.locator('[data-vacancy-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.vacancyId));
  for(const id of sourceRows)assert.equal(national.positions.find(item=>item.id===id)?.institutionId,'mintrud','Local search never includes another employer');
  const sourceDisclosure=roles.locator(`[data-role-source="${actualVacancy.id}"]`);
  if(await sourceDisclosure.count()){await sourceDisclosure.locator('summary').click();assert.equal(await sourceDisclosure.evaluate(node=>node.open),true);}
  await screenshot('ru-390x844-mintrud-local-roles','[data-recommendation-group="preferred"] [data-recommended-authority="mintrud"]');
  await roles.locator(`[data-select-vacancy="${actualVacancy.id}"]`).click();await page.locator('#journey-assessment-state').waitFor();
  const requirements=buildVacancyRequirements(actualVacancy),assessable=requirements.rows.filter(row=>row.assessable);assert.ok(assessable.length>=5);
  for(const row of assessable)assert.ok((await page.locator(`[data-requirement-row="${row.id}"] legend`).innerText()).replace(/\s+/g,' ').includes(row.text.replace(/\s+/g,' ')));
  assert.equal((await journey()).selectedVacancyId,actualVacancy.id);
  for(let i=0;i<3;i++)await page.locator(`[data-requirement-key="${assessable[i].id}"][value="${i===0?'met':'gap'}"]`).check();
  await page.locator('#journey-open-plan').click();
  const summary=summarizeVacancyAssessment(requirements,(await journey()).assessments[actualVacancy.id]);
  assert.deepEqual(await page.locator('.journey-summary-counts > div > strong').evaluateAll(nodes=>nodes.map(n=>Number(n.textContent))),[summary.met,summary.gap,summary.unassessed]);
  assert.equal(await page.locator('#seminar-open-knowledge').isDisabled(),true);await screenshot('ru-390x844-role-plan');
  pass('A source opens inline within its employer card, keeps its exact requirements and reaches the existing partial-assessment gate');
  await page.locator('#journey-back-requirements').click();await page.locator('#journey-back-vacancies').click();
  const drafts={mintrud:{title:'Синтетический черновик Mintrud QA',url:'https://example.invalid/preferences-qa/mintrud',knowledge:'Синтетическое требование QA: аналитическая записка.'},rosatom:{title:'Синтетический черновик Rosatom QA',url:'https://example.invalid/preferences-qa/rosatom',skills:'Синтетическое требование QA: работа с данными.'}};
  for(const [id,values]of Object.entries(drafts)){
    const panel=page.locator(`[data-recommendation-group="preferred"] details[data-authority-roles="${id}"]`);if(!await panel.evaluate(n=>n.open))await panel.locator(':scope > summary').click();
    const manual=panel.locator(`[data-manual-authority="${id}"]`);if(!await manual.evaluate(n=>n.open))await manual.locator(':scope > summary').click();
    const form=panel.locator(`[data-manual-vacancy="${id}"]`);assert.equal(await form.locator('[name="employer"]').getAttribute('type'),'hidden');assert.equal(await form.locator('[name="employer"]').inputValue(),id);
    for(const [name,value]of Object.entries(values))await form.locator(`[name="${name}"]`).fill(value);
  }
  const draftDeadline=Date.now()+15000;
  do{
    report.draftsBeforeReload=await journey();
    if(Object.entries(drafts).every(([id,fields])=>Object.entries(fields).every(([name,value])=>report.draftsBeforeReload?.manualDrafts?.[id]?.[name]===value)))break;
    await tick(page);
  }while(Date.now()<draftDeadline);
  for(const [id,fields]of Object.entries(drafts))for(const [name,value]of Object.entries(fields))assert.equal(report.draftsBeforeReload?.manualDrafts?.[id]?.[name],value,'Each field must reach durable autosave before reload');
  await page.evaluate(()=>handle.flush());await page.reload();await page.locator('html[data-qa-ready="true"]').waitFor();
  report.reloadDiagnostics=await page.evaluate(async()=>{
    const snapshot=stage=>({stage,owner:qa.owner,route:qa.route,local:[...Array(localStorage.length)].map((_,i)=>localStorage.key(i)).filter(key=>key.endsWith(':career-journey-v1')&&key.includes(encodeURIComponent(qa.owner))).map(key=>({key,journey:JSON.parse(localStorage.getItem(key))})),forms:[...document.querySelector('#module').shadowRoot.querySelectorAll('[data-manual-vacancy]')].map(form=>({id:form.dataset.manualVacancy,panel:form.dataset.manualPanel,open:form.closest('details').open,fields:Object.fromEntries([...form.elements].filter(n=>n.name).map(n=>[n.name,n.value]))}))});
    const snapshots=[snapshot('ready-after-reload')];handle.navigate('results');snapshots.push(snapshot('after-navigate-results'));await handle.setLocale('en');qa.lang='en';snapshots.push(snapshot('after-locale-en'));return snapshots;
  });
  await page.locator('[data-recommendation-group="preferred"]').waitFor();
  for(const [id,values]of Object.entries(drafts)){
    const form=page.locator(`[data-recommendation-group="preferred"] [data-manual-vacancy="${id}"]`);
    for(const [name,value]of Object.entries(values))assert.equal(await form.locator(`[name="${name}"]`).inputValue(),value);
    assert.equal(await form.locator(`[name="${id==='mintrud'?'skills':'knowledge'}"]`).inputValue(),'');
    assert.equal((await journey()).manualDrafts[id].title,values.title);
  }
  const mintrudPanel=page.locator('[data-recommendation-group="preferred"] details[data-authority-roles="mintrud"]');if(!await mintrudPanel.evaluate(n=>n.open))await mintrudPanel.locator(':scope > summary').click();
  const manual=mintrudPanel.locator('[data-manual-authority="mintrud"]');if(!await manual.evaluate(n=>n.open))await manual.locator(':scope > summary').click();
  await mintrudPanel.locator('[data-manual-vacancy="mintrud"] [type="submit"]').click();await page.locator('#journey-assessment-state').waitFor();
  const saved=await journey(),custom=saved.customVacancies.find(v=>v.id===saved.selectedVacancyId);assert.equal(custom.institutionId,'mintrud');assert.equal(custom.source.url,drafts.mintrud.url);assert.deepEqual(custom.requirements.map(row=>row.sourceText),[drafts.mintrud.knowledge]);assert.equal(saved.manualDrafts.rosatom.title,drafts.rosatom.title);
  pass('Two card-local employer drafts survive reload and translation; submitting one keeps its institution and leaves the other draft intact');
  await page.evaluate(()=>handle.flush());
  const submissions=await page.evaluate(()=>qa.careerSubmissions||[]);assert.equal(submissions.length,1,'The remounted entry emits the existing result once');
  assert.equal(submissions[0].id,careerSubmissions[0].id,'Remount retains the original career result ID');assert.equal(submissions[0].createdAt,careerSubmissions[0].createdAt);assert.ok(!JSON.stringify(submissions).includes('ipip-'));
  const resultsAfterReload=await page.evaluate(()=>qa.results);assert.equal(resultsAfterReload.length,1);assert.equal(resultsAfterReload[0].recordId,careerSubmissions[0].id,'Source selection does not create another career record');
  assert.equal(await page.evaluate(()=>qa.unexpectedSubmissions),0);assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
  pass('Actual component stays nonblank with no browser errors, failed resources or production requests');report.status='pass';
}catch(error){if(page&&!page.isClosed())report.failureJourney=await journey().catch(()=>null);report.failure={message:error.message,stack:error.stack};console.error(error.stack);if(page&&!page.isClosed())await screenshot('failure').catch(()=>{});process.exitCode=1;
}finally{
  report.finishedAt=new Date().toISOString();
  await mkdir(output,{recursive:true});if(context)await bounded(context.tracing.stop({path:path.join(output,'trace.zip')}),'Trace cleanup',10000).catch(()=>{});
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  if(browser)await bounded(browser.close(),'Browser cleanup',10000).catch(()=>{});server?.kill('SIGTERM');
  console.log(JSON.stringify({status:report.status,engine,checks:report.checks.length,report:path.join(output,'report.json'),failure:report.failure?.message}));
}
