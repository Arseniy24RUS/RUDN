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

test('new collection versions retire previous bytes, same-tree releases keep one verified collection',async t=>{
 const{root,site,baseline}=await setup(t),a=await bank(site),outA=path.join(root,'release-a');await buildRelease({site,baseline,out:outA});const ma=await manifest(outA);
 const b=await bank(site,'B');assert.notEqual(a.treeSHA,b.treeSHA);await write(site,'_collections/ignored/private-physical-index.txt','not a source resource');const outB=path.join(root,'release-b'),rb=await buildRelease({site,baseline:outA,out:outB}),mb=await manifest(outB);assert.notEqual(ma.pointer.current.buildId,mb.pointer.current.buildId);assert.equal(mb.pointer.previous,null);assert.equal(rb.verifiedLazyCollections,1);
 assert.deepEqual(await fs.readFile(path.join(outB,'_collections/career-vacancies',b.treeSHA,'employers/private-employer-id.json.gz')),b.files['employers/private-employer-id.json.gz']);await assert.rejects(fs.access(path.join(outB,'_collections/career-vacancies',a.treeSHA)),{code:'ENOENT'});assert(!Object.keys(mb.manifest.resources).some(x=>x.startsWith('_collections/')));
 await write(site,'assets/js/main.js','export const fixture="second-runtime";\n');const outC=path.join(root,'release-c'),rc=await buildRelease({site,baseline:outB,out:outC}),mc=await manifest(outC);assert.equal(mc.pointer.previous,null);assert.equal(rc.verifiedLazyCollections,1);assert.deepEqual(await fs.readdir(path.join(outC,'_collections/career-vacancies')),[b.treeSHA]);assert.deepEqual(await fs.readFile(path.join(outC,'apps/governor/data/original.json')),await fs.readFile(path.join(baseline,'apps/governor/data/original.json')));
});

test('immutable external collection validates the local tree but adds no bank payload to Pages',async t=>{
 const{root,site,baseline}=await setup(t),expected=await bank(site),out=path.join(root,'external-a');
 const hosting={schemaVersion:1,encoding:'base64-gzip',collectionRoot:'https://raw.githubusercontent.com/Arseniy24RUS/RUDN/'+('d'.repeat(40))+'/career-vacancy-bank/',treeSHA:expected.treeSHA,fileCount:expected.fileCount,bytes:expected.bytes,hostedTreeSHA:'e'.repeat(40)};
 const config=path.join(root,'source-audit/career-vacancies/hosting.json');await fs.mkdir(path.dirname(config),{recursive:true});await fs.writeFile(config,JSON.stringify(hosting));
 const report=await buildRelease({site,baseline,out}),first=await manifest(out),m=first.manifest;
 assert.equal(report.externalLazyCollectionsMetadataValidated,1);assert.equal(report.remoteCollectionBytesVerified,false);assert.equal(report.verifiedLazyCollections,undefined);assert.equal(m.resources[PREFIX+'summary.json'].collectionRoot,hosting.collectionRoot);assert.equal(m.resources[PREFIX+'summary.json'].collectionEncoding,'base64-gzip');assert.equal(m.lazyCollections[0].hostedTreeSHA,hosting.hostedTreeSHA);assert.equal(m.lazyCollections[0].encoding,'base64-gzip');assert.deepEqual(Object.keys(m.resources).filter(x=>x.startsWith(PREFIX)),[PREFIX+'summary.json']);assert(!Object.values(m.packs).flat().some(x=>x.startsWith(PREFIX)));assert(!JSON.stringify(m).includes('private-employer-id'));await assert.rejects(fs.access(path.join(out,'_collections')),{code:'ENOENT'});await assert.rejects(fs.access(path.join(out,PREFIX+'employers/private-employer-id.json.gz')),{code:'ENOENT'});assert.equal((await verifyRelease(out)).remoteCollectionBytesVerified,false);
 assert.deepEqual(await fs.readFile(path.join(out,'apps/governor/data/original.json')),await fs.readFile(path.join(baseline,'apps/governor/data/original.json')));
 hosting.collectionRoot=hosting.collectionRoot.replace('d'.repeat(40),'f'.repeat(40));hosting.hostedTreeSHA='a'.repeat(40);await fs.writeFile(config,JSON.stringify(hosting));const outB=path.join(root,'external-b');await buildRelease({site,baseline:out,out:outB});const second=await manifest(outB);assert.notEqual(first.pointer.current.buildId,second.pointer.current.buildId);assert.equal(second.pointer.previous,null);await assert.rejects(fs.access(path.join(outB,'_collections')),{code:'ENOENT'});
 hosting.treeSHA='0'.repeat(64);await fs.writeFile(config,JSON.stringify(hosting));await assert.rejects(buildRelease({site,baseline,out:path.join(root,'invalid-tree')}),/hosted-collection-config-mismatch/);
 hosting.treeSHA=expected.treeSHA;hosting.collectionRoot='https://raw.githubusercontent.com/Arseniy24RUS/RUDN/main/career-vacancy-bank/';await fs.writeFile(config,JSON.stringify(hosting));await assert.rejects(buildRelease({site,baseline,out:path.join(root,'mutable-root')}),/hosted-collection-config-mismatch/);
});

test('optional rich details are metadata-only, immutable, base-bound and included in release identity',async t=>{
 const{root,site,baseline}=await setup(t),base=await bank(site);
 const config=path.join(root,'source-audit/career-vacancies/details-hosting.json');
 const details={schemaVersion:1,encoding:'base64-gzip',collectionRoot:'https://raw.githubusercontent.com/Arseniy24RUS/RUDN/'+('c'.repeat(40))+'/career-vacancy-details/',baseTreeSHA:base.treeSHA,treeSHA:'a'.repeat(64),hostedTreeSHA:'b'.repeat(40),fileCount:10343,bytes:123456,vacancies:457627};
 await write(root,'source-audit/career-vacancies/details-hosting.json',JSON.stringify(details));
 const firstOut=path.join(root,'details-a');const report=await buildRelease({site,baseline,out:firstOut});const first=await manifest(firstOut);
 assert.deepEqual(first.manifest.lazyCollections[0].details,details);const summary=first.manifest.resources[PREFIX+'summary.json'];
 assert.equal(summary.detailsCollectionRoot,details.collectionRoot);assert.equal(summary.detailsCollectionEncoding,'base64-gzip');assert.equal(summary.detailsBaseTreeSHA,base.treeSHA);assert.equal(summary.detailsTreeSHA,details.treeSHA);
 assert.equal(report.remoteCollectionBytesVerified,false);assert.equal((await verifyRelease(firstOut)).externalLazyCollectionsMetadataValidated,1);
 assert(!Object.keys(first.manifest.resources).some(k=>k.includes('career-vacancy-details')));
 details.bytes++;await fs.writeFile(config,JSON.stringify(details));const secondOut=path.join(root,'details-b');await buildRelease({site,baseline,out:secondOut});assert.notEqual(first.pointer.current.buildId,(await manifest(secondOut)).pointer.current.buildId);
 details.baseTreeSHA='0'.repeat(64);await fs.writeFile(config,JSON.stringify(details));await assert.rejects(buildRelease({site,baseline,out:path.join(root,'details-wrong-base')}),/invalid-details-hosting/);
 details.baseTreeSHA=base.treeSHA;details.collectionRoot=details.collectionRoot.replace('c'.repeat(40),'main');await fs.writeFile(config,JSON.stringify(details));await assert.rejects(buildRelease({site,baseline,out:path.join(root,'details-mutable')}),/invalid-details-hosting/);
});
