// Synthetic UI integration using actual diagnostics modules; no real profiles.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),site=path.join(repo,'site');
const output=path.resolve(process.env.DIAGNOSTICS_OUTPUT||'test-results/diagnostics');await fs.mkdir(output,{recursive:true});
const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH):'playwright');
const harness=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diagnostics synthetic UI test</title><link rel="stylesheet" href="/assets/css/site.css"></head><body><main id="app"></main><script type="module">
import {createPlatformDiagnostics,detectEnvironment,sanitizeDiagnosticEvent} from '/assets/js/diagnostics.js';
import {openDiagnosticReport,mountDiagnosticsAdmin} from '/assets/js/diagnostics-ui.js';
const locale=new URLSearchParams(location.search).get('locale')||'ru';document.documentElement.lang=locale;
window.writes=[];window.reportLoads=[];const stamp=Date.now();const backend={user:{uid:'synthetic-only'},generation:1,isAdmin:()=>true,getProfile:()=>null,claimDiagnosticSession:async(_uid,_session,slot)=>slot,writeDiagnosticBatch:async(...args)=>window.writes.push(args.slice(0,4)),readDiagnostics:async({after=null}={})=>{window.reportLoads.push(after);return {nextAfter:after?null:'page2',rows:after?[]:Array.from({length:10},(_,row)=>{const index=row<5?0:1;return {schema:1,createdAt:stamp,reportCode:'ABCDEF12345'+row,build:index?'build-b':'build-a',environment:detectEnvironment(),selfReport:{model:'Synthetic phone',os:'18.7'},events:Object.fromEntries(Array.from({length:12},(_,i)=>['e'+i,sanitizeDiagnosticEvent('document-jump',{docId:index?'koap':'constitution',code:index?'target-missing':'ok',success:!index,durationMs:12},{module:index?'seminar-4':'seminar-3',locale,at:stamp-i})]))}})}}};
window.service=createPlatformDiagnostics({backend,getLocale:()=>locale,getModule:()=> 'seminar-4'});window.showReport=()=>openDiagnosticReport({diagnostics:window.service,locale});window.showAdmin=()=>mountDiagnosticsAdmin(document.getElementById('app'),{backend,locale});window.ready=true;
</script></body></html>`;
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');if(url.pathname==='/diagnostics-harness'){res.setHeader('content-type','text/html; charset=utf-8');res.end(harness);return}const file=path.resolve(site,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(site+path.sep)){res.statusCode=403;res.end();return}res.setHeader('content-type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file))}catch{res.statusCode=404;res.end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/diagnostics-harness';const results=[];
try{
 for(const engine of (process.env.DIAGNOSTICS_BROWSERS||'chromium,firefox,webkit').split(',')){
  const browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})});
  try{for(const locale of (process.env.DIAGNOSTICS_LOCALES||'ru,en,zh').split(','))for(const viewport of [{width:390,height:844},{width:1280,height:900}].filter(v=>!process.env.DIAGNOSTICS_WIDTH||v.width===Number(process.env.DIAGNOSTICS_WIDTH))){
   const context=await browser.newContext({viewport,hasTouch:viewport.width<500}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
   await page.goto(url+'?locale='+locale);await page.waitForFunction(()=>window.ready);assert.equal(await page.title(),'Diagnostics synthetic UI test');
   await page.evaluate(()=>window.showReport());await page.locator('[name=model]').fill('iPhone 15');await page.locator('[name=os]').fill('iOS 18.7');await page.locator('#diagnosticReport [type=submit]').click();
   await page.waitForFunction(()=>window.writes.length===1);assert.match(await page.locator('#diagnosticReport [role=status]').innerText(),/[A-Z0-9]{12}/);
   assert.equal(await page.evaluate(()=>window.writes[0][3].selfReport.model),'iPhone 15');assert.equal(await page.evaluate(()=>Object.keys(window.writes[0][3].events).length),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,engine+'-'+locale+'-'+viewport.width+'-report.png')});await page.locator('#diagnosticReport .modal-close').click();
   await page.evaluate(()=>{window.originalReport=window.service.report;window.service.report=()=>new Promise(resolve=>window.finishDelayedReport=()=>resolve({status:'sent',code:'STALE1234567'}));window.showReport()});
   await page.locator('#diagnosticReport [type=submit]').click();await page.waitForFunction(()=>typeof window.finishDelayedReport==='function');await page.locator('#diagnosticReport .modal-close').click();await page.evaluate(()=>window.showReport());await page.evaluate(()=>window.finishDelayedReport());
   assert.equal(await page.locator('#diagnosticReport [role=status]').innerText(),'');assert.equal(await page.locator('#diagnosticReport [type=submit]').isDisabled(),false);await page.evaluate(()=>{window.service.report=window.originalReport;window.dispatchEvent(new Event('rudn:identitychange'))});assert.equal(await page.locator('#diagnosticReport').isVisible(),false);
   await page.evaluate(()=>window.showAdmin());await page.locator('[data-filter=build]').waitFor();assert.equal(await page.locator('tbody tr').count(),50);
   await page.locator('[data-filter=build]').selectOption('build-b');await page.locator('[data-filter=module]').selectOption('seminar-4');await page.locator('[data-filter=code]').selectOption('document-jump / target-missing');
   assert.equal(await page.locator('tbody tr').count(),50);await page.locator('[data-next]').click();assert.equal(await page.locator('tbody tr').count(),10);
   await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));await page.screenshot({path:path.join(output,engine+'-'+locale+'-'+viewport.width+'-admin.png')});const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,outside:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.table-wrap')).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,scroll:e.scrollWidth})).slice(0,12)}));if(geometry.scrollWidth>geometry.width)console.log(JSON.stringify({overflow:geometry}));assert.equal(geometry.scrollWidth<=geometry.width,true);
   await page.locator('[data-source-next]').click();await page.waitForFunction(()=>window.reportLoads.length===2);await page.waitForFunction(()=>document.querySelector('[data-source-prev]').disabled===false);
   assert.equal(await page.locator('[data-source-next]').isDisabled(),true);await page.locator('[data-source-prev]').click();await page.waitForFunction(()=>window.reportLoads.length===3);assert.deepEqual(await page.evaluate(()=>window.reportLoads),[null,'page2',null]);
   assert.deepEqual(errors,[]);await page.evaluate(()=>window.service.destroy());results.push({engine,locale,viewport,status:'pass',consoleErrors:0,reportDelivered:true,filteredPagination:true,sourcePagination:true,staleDialogGuard:true,identityClosesReport:true});
   await fs.writeFile(path.join(output,'partial.json'),JSON.stringify({status:'running',synthetic:true,results},null,2));console.log(JSON.stringify({engine,locale,width:viewport.width,status:'pass'}));await context.close();
  }}finally{await browser.close()}
 }
}finally{server.close()}
await fs.writeFile(path.join(output,'report.json'),JSON.stringify({status:'pass',synthetic:true,browserPlugin:'not available; Playwright fallback',results},null,2));console.log(JSON.stringify({status:'pass',cases:results.length,output}));
