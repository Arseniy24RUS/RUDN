import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readdirSync,statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildRelease,verifyRelease,isRuntime} from './build-platform-release.mjs';
import {seedBaselineCalendar} from './download-release-baseline.mjs';
async function write(root,name,text){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);}
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'rudn-release-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const site=path.join(root,'site'),baseline=path.join(root,'baseline');
  const files={'index.html':'<html><head><link rel="stylesheet" href="assets/css/site.css"></head><body><script type="module" src="assets/js/main.js"></script></body></html>','service-worker.js':'const PLATFORM_RELEASE=null;','assets/js/main.js':"import './dep.js'; export const value=1;",'assets/js/dep.js':'export const dep=1;','assets/js/release-bootstrap.js':'export const bootstrap=1;','assets/js/release-resources.js':'export const resourceURL=()=>{};','assets/js/diagnostics-bootstrap.js':'globalThis.early=true;','assets/css/site.css':'body { background:url(../img/a.png) }','assets/img/a.png':'old-png','data/course.json':'{"v":1}','apps/demo/index.html':'<html><body><script src="script.js"></script><script>globalThis.hello=true;</script></body></html>','apps/demo/script.js':'globalThis.demo=true;','apps/settlements/runtime/assets/js/settlements/v24/social-plans-regions/1-easy.mjs':'export default {large:1};'};
  files['data/platform-contracts.json']=await fs.readFile(new URL('../site/data/platform-contracts.json',import.meta.url),'utf8');
  for(const [name,text] of Object.entries(files)){await write(site,name,text);await write(baseline,name,text);}return {root,site,baseline};
}
test('exact runtime, frozen baseline, changed resource dedup and previous retention',async t=>{
  const f=await fixture(t),out=path.join(f.root,'first');await write(f.site,'data/course.json','{"v":2}');
  await write(f.site,'apps/demo/module.html','<html><body><script type="module">import "./script.js";</script></body></html>');
  await write(f.site,'apps/demo/fragment.html','<div id="surface">fragment</div>');
  const first=await buildRelease({...f,out}),pointer=JSON.parse(await fs.readFile(path.join(out,'release.json'))),manifest=JSON.parse(await fs.readFile(path.join(out,`_releases/${first.buildId}/manifest.json`)));
  assert.equal(first.status,'pass');assert.equal(pointer.previous,null);assert.equal(await fs.readFile(path.join(out,'data/course.json'),'utf8'),'{"v":1}');
  assert.equal(manifest.contracts.modules['legal-lab'],1);assert.equal(manifest.contracts.adapterSnapshot,1);
  const measured=dir=>readdirSync(dir,{withFileTypes:true}).reduce((sum,item)=>sum+(item.isDirectory()?measured(path.join(dir,item.name)):statSync(path.join(dir,item.name)).size),0);assert.equal(first.totalBytes,measured(out),'Budget is the actual sum of every staged byte, including the receipt');
  assert.match(manifest.resources['data/course.json'].url,/_objects\/[a-f0-9]{64}\.json$/);
  assert.equal(manifest.resources['assets/img/a.png'].url,'/RUDN/assets/img/a.png');assert.match(manifest.resources['assets/js/main.js'].url,/_releases\/[a-f0-9]{32}\/assets\/js\/main.js$/);
  const css=await fs.readFile(path.join(out,`_releases/${first.buildId}/assets/css/site.css`),'utf8');assert.match(css,/url\(\/RUDN\/assets\/img\/a.png\)/);
  const html=await fs.readFile(path.join(out,`_releases/${first.buildId}/apps/demo/index.html`),'utf8');assert.match(html,/platform-entry-scripts/);assert.match(html,/data-release-build=/);assert.ok(!html.includes('<script src="script.js"'));
  assert.equal(manifest.resources['apps/demo/module.html.inline-0.mjs'].kind,'runtime');assert.equal(await fs.readFile(path.join(out,`_releases/${first.buildId}/apps/demo/module.html.inline-0.mjs`),'utf8'),'import "./script.js";');
  assert.equal(await fs.readFile(path.join(out,`_releases/${first.buildId}/apps/demo/fragment.html`),'utf8'),'<div id="surface">fragment</div>');
  assert.equal(isRuntime('apps/settlements/runtime/assets/js/settlements/v24/social-plans-regions/1-easy.mjs'),false);
  await write(f.site,'assets/js/dep.js','export const dep=2;');await write(f.site,'data/course.json','{"v":3}');const second=await buildRelease({site:f.site,baseline:out,out:path.join(f.root,'second')});assert.notEqual(first.buildId,second.buildId);assert.equal(second.previous,first.buildId);
  const oldMain=await fs.readFile(path.join(second.out,`_releases/${first.buildId}/assets/js/dep.js`),'utf8');assert.equal(oldMain,'export const dep=1;');
  await write(f.site,'assets/js/dep.js','export const dep=3;');await write(f.site,'data/course.json','{"v":4}');const third=await buildRelease({site:f.site,baseline:second.out,out:path.join(f.root,'third')});assert.equal(third.previous,second.buildId);
  await assert.rejects(fs.access(path.join(third.out,`_releases/${first.buildId}`)),{code:'ENOENT'});
  await assert.rejects(fs.access(path.join(third.out,manifest.resources['data/course.json'].url.slice('/RUDN/'.length))),{code:'ENOENT'});
  const retained=JSON.parse(await fs.readFile(path.join(third.out,`_releases/${second.buildId}/manifest.json`),'utf8'));assert.equal(await fs.readFile(path.join(third.out,retained.resources['data/course.json'].url.slice('/RUDN/'.length)),'utf8'),'{"v":3}');
  assert.equal(await fs.readFile(path.join(third.out,'data/course.json'),'utf8'),'{"v":1}');
  await write(third.out,`_releases/${third.buildId}/assets/js/dep.js`,'corrupt');await assert.rejects(verifyRelease(third.out),/release\/integrity/);
});
test('build ID follows transformed bytes deterministically; budget and unsafe output fail closed',async t=>{
  const f=await fixture(t);const a=await buildRelease({...f,out:path.join(f.root,'a')}),b=await buildRelease({...f,out:path.join(f.root,'b')});assert.equal(a.buildId,b.buildId);
  await assert.rejects(buildRelease({...f,out:path.join(f.site,'bad')}),/overlaps-source/);
  await assert.rejects(verifyRelease(a.out,{budget:1}),/release\/budget/);
  await write(f.site,'assets/js/main.js',"import './missing.js';");await assert.rejects(buildRelease({...f,out:path.join(f.root,'bad')}),/unpinned-static-import/);
});
test('resource resolver pins source and runtime relative URLs while external APIs remain untouched',async()=>{
  const mod=await import('../site/assets/js/release-resources.js');const prior=globalThis.__RUDN_RELEASE__;const EventType=globalThis.CustomEvent;
  globalThis.CustomEvent??=class {constructor(type,options){this.type=type;this.detail=options?.detail;}};
  try{mod.setReleaseContext({buildId:'a'.repeat(32),siteRoot:'https://test.invalid/RUDN/',runtimeRoot:'https://test.invalid/RUDN/_releases/'+ 'a'.repeat(32)+'/',resources:{'apps/demo/data.json':{url:'/RUDN/_objects/'+ 'b'.repeat(64)+'.json'}}});
    assert.equal(mod.resourceURL('data.json',`https://test.invalid/RUDN/_releases/${'a'.repeat(32)}/apps/demo/entry.mjs`).pathname,'/RUDN/_objects/'+ 'b'.repeat(64)+'.json');
    assert.equal(mod.resourceURL('https://api.invalid/auth').href,'https://api.invalid/auth');assert.throws(()=>mod.setReleaseContext({buildId:'c'.repeat(32),resources:{}}),/already-bound/);
  }finally{globalThis.__RUDN_RELEASE__=prior;globalThis.CustomEvent=EventType;}
});
test('calendar rollover seeds the published immutable calendar, not the frozen migration copy',async t=>{
  const f=await fixture(t),logical='assets/data/calendars/current.json',destination=path.join(f.root,'seed.json');
  await write(f.baseline,logical,'{"period":"old"}');await write(f.site,logical,'{"period":"current"}');
  await seedBaselineCalendar(f.baseline,destination);assert.equal(await fs.readFile(destination,'utf8'),'{"period":"old"}');
  const built=await buildRelease({...f,out:path.join(f.root,'calendar')});await seedBaselineCalendar(built.out,destination);assert.equal(await fs.readFile(destination,'utf8'),'{"period":"current"}');
  const manifestPath=path.join(built.out,`_releases/${built.buildId}/manifest.json`),manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  const current=manifest.resources[logical];await fs.writeFile(path.join(built.out,current.url.slice('/RUDN/'.length)),'corrupt');await assert.rejects(seedBaselineCalendar(built.out,destination),/release\/calendar-integrity/);
  current.url='/RUDN/..%2Foutside.json';await fs.writeFile(manifestPath,JSON.stringify(manifest));await assert.rejects(seedBaselineCalendar(built.out,destination),/release\/calendar-path/);
});
test('missing or malformed save contracts cannot produce a ready release',async t=>{
  const f=await fixture(t);await write(f.site,'data/platform-contracts.json','{"schema":1}');await assert.rejects(buildRelease({...f,out:path.join(f.root,'invalid-contract')}),/release\/invalid-contracts/);
  await fs.unlink(path.join(f.site,'data/platform-contracts.json'));await assert.rejects(buildRelease({...f,out:path.join(f.root,'missing-contract')}),/release\/missing-source:data\/platform-contracts.json/);
});
test('verifier rejects conflicting immutable references and a changed baseline registry',async t=>{
  const f=await fixture(t),built=await buildRelease({...f,out:path.join(f.root,'references')});
  const pointerPath=path.join(built.out,'release.json'),pointer=JSON.parse(await fs.readFile(pointerPath,'utf8')),manifestPath=path.join(built.out,`_releases/${built.buildId}/manifest.json`),manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  manifest.resources['assets/img/a.png'].sha256='0'.repeat(64);const bytes=JSON.stringify(manifest);await fs.writeFile(manifestPath,bytes);pointer.current.manifestSha256=crypto.createHash('sha256').update(bytes).digest('hex');await fs.writeFile(pointerPath,JSON.stringify(pointer));await assert.rejects(verifyRelease(built.out),/release\/conflicting-reference/);
  const registryPath=path.join(built.out,'platform-baseline.json'),registry=JSON.parse(await fs.readFile(registryPath,'utf8'));registry.files['assets/img/a.png'].bytes++;await fs.writeFile(registryPath,JSON.stringify(registry));await assert.rejects(verifyRelease(built.out),/release\/baseline-identity/);
});
