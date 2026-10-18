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
  for(const name of ['service-worker.js','assets/js/release-bootstrap.js','assets/js/release-resources.js','assets/js/diagnostics-bootstrap.js','data/platform-contracts.json'])await write(root,name,await fs.readFile(path.join(repo,'site',name)));
  await write(root,'data/course.json','{"release":"A"}');await write(root,'data/lazy.json','{"lazy":"A"}');
}
const main=version=>`import {getReleaseContext,releaseFetch} from './release-resources.js';import {checkRelease,prepareRelease,activatePreparedRelease} from './release-bootstrap.js';const data=await (await releaseFetch('../../data/course.json',{},import.meta.url)).json();document.querySelector('#app').textContent='${version} '+data.release+' '+(sessionStorage.getItem('fixture-draft')||'none');document.querySelector('#app').dataset.build=getReleaseContext().buildId;document.querySelector('#update').onclick=async()=>{sessionStorage.setItem('fixture-draft','question-7');const target=await checkRelease();await prepareRelease(target);activatePreparedRelease(target,{resumeToken:'fixture-token'});};document.querySelector('#lazy').onclick=async()=>document.querySelector('#lazy-result').textContent=(await(await releaseFetch('../../data/lazy.json',{},import.meta.url)).json()).lazy;`;
await write(source,'assets/js/main.js',main('A'));await write(baseline,'assets/js/main.js',main('A'));
const standalone=version=>`<html><head><title>Standalone protocol fixture</title></head><body><main id="app">Loading</main><button id="update">Update</button><button id="lazy">Lazy</button><output id="lazy-result"></output><script type="module">${main(version).replaceAll("from './","from './assets/js/").replaceAll("'../../data/","'./data/")}</script></body></html>`;
await write(source,'standalone.html',standalone('A'));
const a=await buildRelease({site:source,baseline,out:path.join(out,'a')});await write(source,'assets/js/main.js',main('B'));await write(source,'standalone.html',standalone('B'));await write(source,'data/course.json','{"release":"B"}');await write(source,'data/lazy.json','{"lazy":"B"}');const b=await buildRelease({site:source,baseline:a.out,out:path.join(out,'b')});
await write(source,'assets/js/main.js',"throw new Error('synthetic-entry-import-failure');");const broken=await buildRelease({site:source,baseline:a.out,out:path.join(out,'broken')});
let live=a.out,networkDown=false;const server=http.createServer(async(req,res)=>{if(networkDown){req.socket.destroy();return;}try{const url=new URL(req.url,'http://localhost');let name=decodeURIComponent(url.pathname).replace(/^\/RUDN\//,'');if(!name||name.endsWith('/'))name+='index.html';if(name.includes('..'))throw Error('path');const file=path.join(live,name),bytes=await fs.readFile(file);const type=/\.m?js$/.test(file)?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'application/octet-stream';res.writeHead(200,{'content-type':type,'cache-control':'no-cache'});res.end(bytes);}catch{res.writeHead(404);res.end('missing');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/RUDN/?language=en#activity/fixture';const playwright=await import(pathToFileURL(process.env.PLAYWRIGHT_PATH||'C:/Users/arsen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const results=[];
// Keep the synthetic localhost fixture independent of the host's proxy settings.
const launch=engine=>playwright[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
try{for(const engine of (process.env.RELEASE_BROWSERS||'chromium,webkit').split(','))for(const sw of ['allow','block']){
  live=a.out;const browser=await launch(engine),context=await browser.newContext({serviceWorkers:sw,viewport:{width:390,height:844}});if(sw==='block')await context.addInitScript(()=>Object.defineProperty(window,'caches',{get(){throw new DOMException('Synthetic cache unavailable','SecurityError');}}));const page=await context.newPage(),other=await context.newPage(),standalonePage=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));other.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(url);await page.locator('#app').filter({hasText:'A A none'}).waitFor();await other.goto(url);await other.locator('#app').filter({hasText:'A A none'}).waitFor();await standalonePage.goto(origin+`/RUDN/_releases/${a.buildId}/standalone.html#question-3`);await standalonePage.locator('#app').filter({hasText:'A A none'}).waitFor();await context.addCookies([{name:'fixture-login',value:'preserved',url:origin}]);
    if(sw==='allow')await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    live=b.out;await page.locator('#update').click();await page.locator('#app').filter({hasText:'B B question-7'}).waitFor();assert.equal(await page.locator('#app').getAttribute('data-build'),b.buildId);assert.equal(new URL(page.url()).hash,'#activity/fixture');assert.equal(new URL(page.url()).searchParams.get('language'),'en');assert.equal(new URL(page.url()).searchParams.get('rudnResume'),'fixture-token');assert.ok((await context.cookies()).some(x=>x.name==='fixture-login'&&x.value==='preserved'));
    await other.locator('#lazy').click();await other.locator('#lazy-result').filter({hasText:'A'}).waitFor();
    await standalonePage.locator('#update').click();await standalonePage.locator('#app').filter({hasText:'B B question-7'}).waitFor();assert.equal(new URL(standalonePage.url()).pathname,`/RUDN/_releases/${b.buildId}/standalone.html`);assert.equal(new URL(standalonePage.url()).hash,'#question-3');
    if(sw==='allow'){await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);networkDown=true;await page.reload();await page.locator('#app').filter({hasText:'B B question-7'}).waitFor();networkDown=false;}
    await page.screenshot({path:path.join(out,`${engine}-${sw}.png`)});assert.deepEqual(errors,[]);results.push({engine,serviceWorkers:sw,status:'pass',buildId:b.buildId,oldTabStable:true,draftRestored:true,cookiePreserved:true,offline:sw==='allow'?'pass':'not-applicable'});
  }finally{networkDown=false;await browser.close();}
}
for(const engine of (process.env.RELEASE_BROWSERS||'chromium,webkit').split(',')){
  live=broken.out;const token='process-recovery-token',pending={token,owner:'synthetic-owner',sourceBuild:a.buildId,targetBuild:broken.buildId,phase:'switching',attempts:1,startedAt:Date.now(),route:'#activity/fixture',previous:a.target};
  const browser=await launch(engine),context=await browser.newContext({serviceWorkers:'block',storageState:{cookies:[],origins:[{origin,localStorage:[{name:'rudn.update.pending.v1:'+token,value:JSON.stringify(pending)}]}]}}),page=await context.newPage(),navigations=[];page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url());});
  try{await page.goto(origin+broken.target.entryURL+'?rudnResume='+token+'#activity/fixture');await page.locator('#app').filter({hasText:'A A none'}).waitFor();assert.equal(new URL(page.url()).pathname,`/RUDN/_releases/${a.buildId}/index.html`);assert.equal(navigations.filter(value=>value.includes(broken.buildId)).length,1);assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).phase,'rudn.update.pending.v1:'+token),'rollback');results.push({engine,scenario:'process-session-lost-import-failure',status:'pass',rollbackCount:1,previousBuild:a.buildId});}finally{await browser.close();}
}
}finally{await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify({classification:'automated synthetic protocol fixture',browserPlugin:'not available',results},null,2)+'\n');}
console.log(JSON.stringify({status:'pass',results,out},null,2));
