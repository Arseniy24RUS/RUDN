// Automated protocol fixture, not a claim about physical phones. Browser plugin
// is unavailable in this session; use the repository's bundled Playwright path.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildRelease} from './build-platform-release.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(process.env.QA_OUT||path.join(repo,'../evidence/runs/20261018-platform-observability/release/browser-fixture'));
await fs.mkdir(out,{recursive:true});const source=path.join(out,'source'),baseline=path.join(out,'baseline');
async function write(root,name,text){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);}
for(const root of [source,baseline]){
  await write(root,'index.html','<!doctype html><html><head><title>Release protocol fixture</title></head><body><main id="app">Loading</main><button id="update">Update</button><button id="lazy">Lazy</button><output id="lazy-result"></output><script type="module" src="assets/js/main.js"></script></body></html>');
  for(const name of ['service-worker.js','assets/js/release-bootstrap.js','assets/js/release-resources.js','assets/js/release-recovery.js','assets/js/diagnostics-bootstrap.js','assets/js/platform-update-failures.js','data/platform-contracts.json'])await write(root,name,await fs.readFile(path.join(repo,'site',name)));
  await write(root,'data/course.json','{"release":"A"}');await write(root,'data/lazy.json','{"lazy":"A"}');
}
const main=version=>`import {getReleaseContext,releaseFetch} from './release-resources.js';import {checkRelease,prepareRelease,activatePreparedRelease} from './release-bootstrap.js';const data=await (await releaseFetch('../../data/course.json',{},import.meta.url)).json();document.querySelector('#app').textContent='${version} '+data.release+' '+(sessionStorage.getItem('fixture-draft')||'none');document.querySelector('#app').dataset.build=getReleaseContext().buildId;document.querySelector('#update').onclick=async()=>{sessionStorage.setItem('fixture-draft','question-7');const target=await checkRelease();await prepareRelease(target);activatePreparedRelease(target,{resumeToken:'fixture-token'});};document.querySelector('#lazy').onclick=async()=>document.querySelector('#lazy-result').textContent=(await(await releaseFetch('../../data/lazy.json',{},import.meta.url)).json()).lazy;`;
await write(source,'assets/js/main.js',main('A'));await write(baseline,'assets/js/main.js',main('A'));
const standalone=version=>`<html><head><title>Standalone protocol fixture</title></head><body><main id="app">Loading</main><button id="update">Update</button><button id="lazy">Lazy</button><output id="lazy-result"></output><script type="module">${main(version).replaceAll("from './","from './assets/js/").replaceAll("'../../data/","'./data/")}</script></body></html>`;
const nested=version=>standalone(version).replaceAll("from './assets/js/","from '../../assets/js/").replaceAll("'./data/","'../../data/");
await write(source,'standalone.html',standalone('A'));
await write(baseline,'standalone.html',standalone('legacy'));
await write(source,'apps/demo/index.html',nested('A'));await write(baseline,'apps/demo/index.html',nested('legacy'));
const a=await buildRelease({site:source,baseline,out:path.join(out,'a')});await write(source,'assets/js/main.js',main('B'));await write(source,'standalone.html',standalone('B'));await write(source,'apps/demo/index.html',nested('B'));await write(source,'data/course.json','{"release":"B"}');await write(source,'data/lazy.json','{"lazy":"B"}');const b=await buildRelease({site:source,baseline:a.out,out:path.join(out,'b')});
await write(source,'assets/js/main.js',main('C'));await write(source,'standalone.html',standalone('C'));await write(source,'apps/demo/index.html',nested('C'));await write(source,'data/course.json','{"release":"C"}');await write(source,'data/lazy.json','{"lazy":"C"}');const c=await buildRelease({site:source,baseline:b.out,out:path.join(out,'c')});
await assert.rejects(fs.access(path.join(c.out,`_releases/${a.buildId}`)),{code:'ENOENT'});
await write(source,'assets/js/main.js',"throw new Error('synthetic-entry-import-failure');");const broken=await buildRelease({site:source,baseline:a.out,out:path.join(out,'broken')});
let live=a.out,networkDown=false,staleRoot=false,cachedBootstrap=false;
const requests=[];
const server=http.createServer(async(req,res)=>{
  if(networkDown){req.socket.destroy();return;}
  let name;try{
    const url=new URL(req.url,'http://localhost');name=decodeURIComponent(url.pathname).replace(/^\/RUDN\//,'');if(!name||name.endsWith('/'))name+='index.html';if(name.includes('..'))throw Error('path');
    const cached=staleRoot&&name==='index.html'||cachedBootstrap&&name.startsWith(`_releases/${a.buildId}/assets/js/`)&&/release-(bootstrap|resources)\.js$/.test(name);
    const file=path.join(cached?a.out:live,name),bytes=await fs.readFile(file),type=/\.m?js$/.test(file)?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'application/octet-stream';
    requests.push({path:url.pathname,status:200});res.writeHead(200,{'content-type':type,'cache-control':'no-cache'});res.end(bytes);
  }catch{
    requests.push({path:req.url,status:404});const documentRequest=req.headers['sec-fetch-dest']==='document'||name?.endsWith('.html');
    res.writeHead(404,{'content-type':documentRequest?'text/html':'text/plain','cache-control':'no-store'});res.end(documentRequest?await fs.readFile(path.join(live,'404.html')):'missing');
  }
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/RUDN/?language=en#activity/fixture';const playwright=await import(pathToFileURL(process.env.PLAYWRIGHT_PATH||'C:/Users/arsen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const results=[];
// Keep the synthetic localhost fixture independent of the host's proxy settings.
const launch=engine=>playwright[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
try{for(const engine of (process.env.RELEASE_BROWSERS||'chromium,webkit').split(','))for(const sw of ['allow','block']){
  console.log(JSON.stringify({engine,phase:'update',serviceWorkers:sw}));
  live=a.out;const browser=await launch(engine),context=await browser.newContext({serviceWorkers:sw,viewport:{width:390,height:844}});if(sw==='block')await context.addInitScript(()=>Object.defineProperty(window,'caches',{get(){throw new DOMException('Synthetic cache unavailable','SecurityError');}}));const page=await context.newPage(),other=await context.newPage(),standalonePage=await context.newPage(),errors=[];
  await context.addInitScript(()=>{window.fixtureClicks=[];addEventListener('click',event=>fixtureClicks.push({id:event.target?.id,at:performance.now()}),true);});
  page.on('pageerror',error=>errors.push(error.message));other.on('pageerror',error=>errors.push(error.message));standalonePage.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(url);await page.locator('#app').filter({hasText:'A A none'}).waitFor();await other.goto(url);await other.locator('#app').filter({hasText:'A A none'}).waitFor();await standalonePage.goto(origin+`/RUDN/_releases/${a.buildId}/standalone.html#question-3`);await standalonePage.locator('#app').filter({hasText:'A A none'}).waitFor();await context.addCookies([{name:'fixture-login',value:'preserved',url:origin}]);
    if(sw==='allow')await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    live=b.out;await page.locator('#update').click();await page.locator('#app').filter({hasText:'B B question-7'}).waitFor();assert.equal(await page.locator('#app').getAttribute('data-build'),b.buildId);assert.equal(new URL(page.url()).hash,'#activity/fixture');assert.equal(new URL(page.url()).searchParams.get('language'),'en');assert.equal(new URL(page.url()).searchParams.get('rudnResume'),'fixture-token');assert.ok((await context.cookies()).some(x=>x.name==='fixture-login'&&x.value==='preserved'));
    await other.locator('#lazy').click();await other.locator('#lazy-result').filter({hasText:'A'}).waitFor();
    await standalonePage.locator('#update').click();await standalonePage.locator('#app').filter({hasText:'B B question-7'}).waitFor();assert.equal(new URL(standalonePage.url()).pathname,`/RUDN/_releases/${b.buildId}/standalone.html`);assert.equal(new URL(standalonePage.url()).hash,'#question-3');
    if(sw==='allow'){await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);networkDown=true;await page.reload();await page.locator('#app').filter({hasText:'B B question-7'}).waitFor();networkDown=false;}
    await page.screenshot({path:path.join(out,`${engine}-${sw}.png`)});assert.deepEqual(errors,[]);results.push({engine,serviceWorkers:sw,status:'pass',buildId:b.buildId,oldTabStable:true,draftRestored:true,cookiePreserved:true,offline:sw==='allow'?'pass':'not-applicable'});
  }catch(error){const pages=[];for(const [name,tab] of [['main',page],['other',other],['standalone',standalonePage]]){pages.push({name,...await tab.evaluate(()=>({href:location.href,text:document.getElementById('app')?.textContent,clicks:window.fixtureClicks,worker:!!navigator.serviceWorker?.controller})).catch(()=>({unavailable:true}))});await tab.screenshot({path:path.join(out,`${engine}-${sw}-${name}-failure.png`)}).catch(()=>{});}await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({engine,serviceWorkers:sw,error:error.message,errors,pages,requests},null,2)+'\n');throw error;}finally{networkDown=false;await browser.close();}
}
for(const engine of (process.env.RELEASE_BROWSERS||'chromium,webkit').split(',')){
  console.log(JSON.stringify({engine,phase:'cold-entry'}));
  live=a.out;const browser=await launch(engine),context=await browser.newContext({serviceWorkers:'block'}),old=await context.newPage(),errors=[];
  await context.addInitScript(()=>Object.defineProperty(window,'caches',{get(){throw new DOMException('Synthetic cache unavailable','SecurityError');}}));
  try{
    await old.goto(url);await old.locator('#app').filter({hasText:'A A none'}).waitFor();const oldURL=old.url();live=c.out;
    await old.locator('#lazy').click();await old.locator('#lazy-result').filter({hasText:'A'}).waitFor();assert.equal(old.url(),oldURL);
    await old.evaluate(()=>{localStorage.setItem('fixture-persistent-draft','unchanged');});
    for(const scenario of ['obsolete-exact-entry','obsolete-exact-directory','canonical-standalone','canonical-standalone-directory','stale-root-dead-bootstrap','stale-root-cached-bootstrap']){
      console.log(JSON.stringify({engine,scenario}));
      const page=await context.newPage(),navigations=[];page.on('pageerror',error=>errors.push({scenario,message:error.message}));page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())navigations.push(request.url());});
      staleRoot=scenario.startsWith('stale-root');cachedBootstrap=scenario==='stale-root-cached-bootstrap';
      const directory=scenario.endsWith('-directory'),logical=directory?'apps/demo/index.html':scenario==='canonical-standalone'?'standalone.html':'index.html';
      const pathname=scenario.startsWith('obsolete-exact')?`_releases/${a.buildId}/`+(directory?'apps/demo/':'index.html'):scenario.startsWith('canonical-standalone')?(directory?'apps/demo/':logical):'';
      await page.goto(origin+'/RUDN/'+pathname+'?language=zh&rudnResume=opaque-local-token#question-9');await page.locator('#app').filter({hasText:'C C none'}).waitFor();
      const current=new URL(page.url());assert.equal(current.pathname,`/RUDN/_releases/${c.buildId}/${logical}`);assert.equal(current.hash,'#question-9');assert.equal(current.searchParams.get('language'),'zh');assert.equal(current.searchParams.get('rudnResume'),'opaque-local-token');assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
      await page.waitForFunction(()=>!new URL(location.href).searchParams.has('rudnRecovery'));assert.equal(await page.evaluate(()=>localStorage.getItem('fixture-persistent-draft')),'unchanged');assert.equal(navigations.length,2);
      results.push({engine,scenario,status:'pass',serviceWorkers:'block',cacheStorage:'unavailable',buildId:c.buildId,navigations:2,persistentDraftPreserved:true});await page.close();staleRoot=false;cachedBootstrap=false;
    }
    const missing=await context.newPage(),start=requests.length,response=await missing.goto(origin+'/RUDN/not-ours.html#question-9');assert.equal(response.status(),404);assert.equal(new URL(missing.url()).pathname,'/RUDN/not-ours.html');assert.equal(await missing.evaluate(()=>__RUDN_RELEASE_RECOVERY__.recover('test')),false);assert.ok(!requests.slice(start).some(x=>x.path.endsWith('/release.json')));await missing.close();
    assert.deepEqual(errors,[]);results.push({engine,scenario:'unknown-entry-remains-404-and-live-old-tab-stable',status:'pass'});
    live=broken.out;const failed=await context.newPage(),moves=[];failed.on('framenavigated',frame=>{if(frame===failed.mainFrame())moves.push(frame.url());});await failed.goto(origin+broken.target.entryURL);await failed.getByRole('status').filter({hasText:'Не удалось загрузить приложение'}).waitFor();assert.equal(await failed.evaluate(()=>__RUDN_RELEASE_RECOVERY__.recover('test')),false);assert.equal(moves.length,1);assert.equal(await failed.evaluate(()=>localStorage.getItem('fixture-persistent-draft')),'unchanged');results.push({engine,scenario:'broken-current-no-reload-loop',status:'pass',navigations:1});await failed.close();
  }finally{staleRoot=false;cachedBootstrap=false;await browser.close();}
}
for(const engine of (process.env.RELEASE_BROWSERS||'chromium,webkit').split(',')){
  live=broken.out;const token='process-recovery-token',pending={token,owner:'synthetic-owner',sourceBuild:a.buildId,targetBuild:broken.buildId,phase:'switching',attempts:1,startedAt:Date.now(),route:'#activity/fixture',previous:a.target};
  const browser=await launch(engine),context=await browser.newContext({serviceWorkers:'block',storageState:{cookies:[],origins:[{origin,localStorage:[{name:'rudn.update.pending.v1:'+token,value:JSON.stringify(pending)}]}]}}),page=await context.newPage(),navigations=[];page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url());});
  try{await page.goto(origin+broken.target.entryURL+'?rudnResume='+token+'#activity/fixture');await page.locator('#app').filter({hasText:'A A none'}).waitFor();assert.equal(new URL(page.url()).pathname,`/RUDN/_releases/${a.buildId}/index.html`);assert.equal(navigations.filter(value=>value.includes(broken.buildId)).length,1);const marker=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),'rudn.update.pending.v1:'+token);assert.equal(marker.phase,'rollback');assert.equal(marker.targetBuild,a.buildId);assert.equal(marker.failedBuild,broken.buildId);results.push({engine,scenario:'process-session-lost-import-failure',status:'pass',rollbackCount:1,previousBuild:a.buildId});}finally{await browser.close();}
}
}finally{await new Promise(r=>{server.close(r);server.closeAllConnections();});await fs.writeFile(path.join(out,'report.json'),JSON.stringify({classification:'automated synthetic protocol fixture',browserPlugin:'not available',results},null,2)+'\n');}
console.log(JSON.stringify({status:'pass',results,out},null,2));
