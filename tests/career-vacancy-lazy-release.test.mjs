import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {buildRelease,verifyRelease} from '../scripts/build-platform-release.mjs';
const PREFIX='apps/career/data/vacancies/bank/',BASE='/RUDN/';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const contracts={schema:1,adapterSnapshot:1,durableStore:1,updateEnvelope:1,modules:Object.fromEntries(['platform','quiz','form','maps','legal-lab','career','reception','settlements','governor'].map(k=>[k,1]))};
async function write(root,name,bytes){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);}
async function fixture(root){
 const files={'index.html':'<!doctype html><html><head><title>fixture</title></head><body><script type="module" src="assets/js/main.js"></script></body></html>','service-worker.js':'const PLATFORM_RELEASE=null;\n','data/platform-contracts.json':JSON.stringify(contracts),'assets/js/main.js':'export const fixture=true;\n','assets/js/release-bootstrap.js':'export {};\n','assets/js/release-resources.js':'export {};\n','assets/js/release-recovery.js':'globalThis.fixtureRecovery=true;\n','assets/js/diagnostics-bootstrap.js':'globalThis.fixtureDiagnostics=true;\n','apps/governor/data/original.json':'{"original":"unchanged non-career bytes"}\n'};
 for(const [name,bytes]of Object.entries(files))await write(root,name,bytes);
}
async function bank(root,label='A'){
 const files={'summary.json':Buffer.from('{"schemaVersion":2,"jobCount":1}\n'),'employers/private-employer-id.json.gz':gzipSync(Buffer.from(JSON.stringify({schemaVersion:2,name:label,jobCount:1}))),'pages/private-page-id.json.gz':gzipSync(Buffer.from('{"schemaVersion":2,"rows":[["private-source-uuid"]]}'))};
 const hash=crypto.createHash('sha256');let bytes=0;
 for(const name of Object.keys(files).sort()){await write(root,PREFIX+name,files[name]);hash.update(name+'\0'+sha(files[name])+'\0'+files[name].length+'\n');bytes+=files[name].length;}
 return{treeSHA:hash.digest('hex'),fileCount:Object.keys(files).length,bytes,files};
}
async function manifest(out){const p=JSON.parse(await fs.readFile(path.join(out,'release.json')));const m=JSON.parse(await fs.readFile(path.join(out,p.current.manifestURL.slice(BASE.length))));return{pointer:p,manifest:m};}
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'career-lazy-release-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const site=path.join(root,'site'),baseline=path.join(root,'baseline');await fixture(site);await fixture(baseline);return{root,site,baseline};}

test('career collection stays private to global manifests/packs and verifies every server byte',async t=>{
 const{root,site,baseline}=await setup(t),expected=await bank(site),out=path.join(root,'release');const report=await buildRelease({site,baseline,out});assert.equal(report.status,'pass');assert.equal(report.verifiedLazyCollections,1);
 const{manifest:m}=await manifest(out),rootURL=BASE+'_collections/career-vacancies/'+expected.treeSHA+'/';assert.deepEqual(m.lazyCollections,[{id:'career-vacancies',logicalPrefix:PREFIX,collectionRoot:rootURL,treeSHA:expected.treeSHA,fileCount:expected.fileCount,bytes:expected.bytes}]);
 assert.deepEqual(m.resources[PREFIX+'summary.json'].collection,{treeSHA:expected.treeSHA,fileCount:expected.fileCount,bytes:expected.bytes});assert.equal(m.resources[PREFIX+'summary.json'].collectionRoot,rootURL);assert.deepEqual(Object.keys(m.resources).filter(x=>x.startsWith(PREFIX)),[PREFIX+'summary.json']);assert(!Object.values(m.packs).flat().some(x=>x.startsWith(PREFIX)));assert(!JSON.stringify(m).includes('private-employer-id'));assert(!JSON.stringify(m).includes('private-page-id'));assert(!JSON.stringify(m).includes('private-source-uuid'));
 const physical=path.join(out,rootURL.slice(BASE.length));for(const[name,bytes]of Object.entries(expected.files))assert.deepEqual(await fs.readFile(path.join(physical,name)),bytes);
 assert.equal(await fs.readFile(path.join(out,'apps/governor/data/original.json'),'utf8'),'{"original":"unchanged non-career bytes"}\n');assert.equal(m.resources['apps/governor/data/original.json'].url,BASE+'apps/governor/data/original.json');await assert.rejects(fs.access(path.join(out,PREFIX+'employers/private-employer-id.json.gz')),{code:'ENOENT'});
 const page=path.join(physical,'pages/private-page-id.json.gz');await fs.writeFile(page,'tampered');await assert.rejects(verifyRelease(out),/lazy-collection-integrity/);await fs.writeFile(page,expected.files['pages/private-page-id.json.gz']);await write(physical,'_objects/unlisted.txt','unlisted');await assert.rejects(verifyRelease(out),/lazy-collection-integrity/);await fs.rm(path.join(physical,'_objects'),{recursive:true});assert.equal((await verifyRelease(out)).status,'pass');
});

test('new collection versions retain previous bytes, same-tree releases deduplicate and verify once',async t=>{
 const{root,site,baseline}=await setup(t),a=await bank(site),outA=path.join(root,'release-a');await buildRelease({site,baseline,out:outA});const ma=await manifest(outA);
 const b=await bank(site,'B');assert.notEqual(a.treeSHA,b.treeSHA);await write(site,'_collections/ignored/private-physical-index.txt','not a source resource');const outB=path.join(root,'release-b'),rb=await buildRelease({site,baseline:outA,out:outB}),mb=await manifest(outB);assert.notEqual(ma.pointer.current.buildId,mb.pointer.current.buildId);assert.equal(mb.pointer.previous.buildId,ma.pointer.current.buildId);assert.equal(rb.verifiedLazyCollections,2);
 for(const c of[a,b])assert.deepEqual(await fs.readFile(path.join(outB,'_collections/career-vacancies',c.treeSHA,'employers/private-employer-id.json.gz')),c.files['employers/private-employer-id.json.gz']);assert(!Object.keys(mb.manifest.resources).some(x=>x.startsWith('_collections/')));
 await write(site,'assets/js/main.js','export const fixture="second-runtime";\n');const outC=path.join(root,'release-c'),rc=await buildRelease({site,baseline:outB,out:outC}),mc=await manifest(outC);assert.equal(mc.pointer.previous.buildId,mb.pointer.current.buildId);assert.equal(rc.verifiedLazyCollections,1);assert.deepEqual(await fs.readdir(path.join(outC,'_collections/career-vacancies')),[b.treeSHA]);assert.deepEqual(await fs.readFile(path.join(outC,'apps/governor/data/original.json')),await fs.readFile(path.join(baseline,'apps/governor/data/original.json')));
});

test('bound worker permits only its declared career collection lazily and preserves other resource guards',async()=>{
 const text=await fs.readFile(new URL('../site/service-worker.js',import.meta.url),'utf8'),markers=/\/\* CAREER_VACANCY_LAZY_BEGIN \*\/[\s\S]*?\/\* CAREER_VACANCY_LAZY_END \*\/\n?/g;assert.equal([...text.matchAll(markers)].length,2);
 const snippet=text.slice(text.indexOf('function platformLazyCollection('),text.indexOf('function platformMessage(')),scope=new URL('https://fixture.invalid/RUDN/'),build='a'.repeat(32),tree='b'.repeat(64),root=scope.href+'_collections/career-vacancies/'+tree+'/';
 const collection={id:'career-vacancies',logicalPrefix:PREFIX,collectionRoot:root,treeSHA:tree,fileCount:3,bytes:100},calls=[];const state={resources:{[PREFIX+'summary.json']:{collectionRoot:root,collection:{treeSHA:tree,fileCount:3,bytes:100}},'apps/governor/data/original.json':{url:scope.href+'_objects/'+('c'.repeat(64))+'.json',sha256:'c'.repeat(64)}},byURL:new Map(),lazyCollections:[collection]};
 const platformURL=value=>{const url=new URL(value,scope);if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))throw new Error('outside');return url;};
 const serve=Function('SCOPE','platformURL','clientRelease','platformFind','platformChecked','platformCache','fetchWithDeadline','unavailableRelease',snippet+';return platformServe;')(scope,platformURL,async()=> 'release-'+build,async id=>{assert.equal(id,build);return state;},async(url,digest,cache)=>{calls.push({kind:'pinned',url,digest,cache});return new Response('pinned');},id=>'cache-'+id,async request=>{calls.push({kind:'network',url:request.url});return new Response('one lazy body');},async()=>new Response('blocked',{status:503}));
 const request=url=>serve({request:new Request(url),clientId:'student'});assert.equal(calls.length,0);
 assert.equal((await request(root+'employers/mvd.json.gz')).status,200);assert.equal((await request(root+'pages/aa/'+('a'.repeat(24))+'/p0000-'+('d'.repeat(16))+'.json.gz')).status,200);assert.equal(calls.length,2);assert(calls.every(x=>x.kind==='network'));
 for(const url of[root,root+'employers/mvd.json',root+'employers/../unlisted.json.gz',root+'employers/mvd.json.gz?all=true',root.replace(tree,'e'.repeat(64))+'employers/mvd.json.gz'])assert.equal((await request(url)).status,503);assert.equal(calls.length,2);
 assert.equal((await request(scope.href+'apps/governor/data/original.json')).status,200);assert.equal(calls.length,3);assert.equal(calls[2].kind,'pinned');assert.equal(calls[2].digest,'c'.repeat(64));assert.equal(calls[2].cache,'cache-'+build);assert.equal((await request(scope.href+'apps/governor/data/unknown.json')).status,503);assert.equal(calls.length,3);
});
