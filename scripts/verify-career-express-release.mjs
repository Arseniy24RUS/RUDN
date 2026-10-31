/** Scope and artifact checks for the owner's explicitly requested Seminar 5 publication.
 * This does not represent a full-platform CI run. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const baseCommit='40eff0ec2693232dadd8f727c229b15b62829c8c';
const allowed=new Set([
  '.github/workflows/deploy-pages.yml',
  '.github/workflows/publish-career-seminar.yml',
  'scripts/verify-career-express-release.mjs',
  'docs/CAREER-SEMINAR-2026-10-30.md',
  'tests/civil-service-model.test.mjs',
  'site/apps/career/assets/app.js',
  'site/apps/career/assets/seminar-flow.mjs',
  'site/apps/career/assets/authority-names.mjs',
  'site/apps/career/assets/vacancies.mjs',
  'site/apps/career/assets/workspace.mjs',
  'site/apps/career/assets/decision-lab.mjs',
  'site/apps/career/assets/classroom.mjs',
  'site/apps/career/embedded.css',
  'site/apps/career/runtime.bundle.mjs',
  'site/apps/career/module.css',
  'site/apps/career/locales/en.json',
  'site/apps/career/locales/zh-Hans.json',
  'site/apps/career/data/authorities.json',
  'site/assets/js/civil-service-model.mjs',
  'site/assets/js/civil-service-test.mjs',
  'site/assets/js/civil-service-course.mjs',
  'site/assets/js/career-course.js',
  'site/assets/css/civil-service-test.css'
]);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=(root,file)=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const local=url=>{
  assert.equal(typeof url,'string');
  assert.ok(url.startsWith('/RUDN/')&&!url.includes('\\'),'Expected an in-site resource');
  const name=decodeURIComponent(url.slice('/RUDN/'.length));
  assert.ok(name&&!name.split('/').some(x=>x==='..'||x===''),'Unsafe release path');
  return name;
};
function current(root){
  const pointer=read(root,'release.json'),entry=pointer.current;
  const bytes=fs.readFileSync(path.join(root,local(entry.manifestURL)));
  assert.equal(sha(bytes),entry.manifestSha256,'Baseline manifest integrity');
  const manifest=JSON.parse(bytes);
  assert.equal(manifest.buildId,entry.buildId);
  return {pointer,entry,manifest};
}
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
if(args.includes('--scope')){
  const changed=git('diff','--name-only',baseCommit,'HEAD').split('\n').filter(Boolean);
  assert.ok(changed.length,'The focused publication must contain a change');
  for(const name of changed){
    assert.ok(allowed.has(name),`Outside the reviewed Seminar 5 scope: ${name}`);
    assert.ok(fs.statSync(name).isFile(),`Deleting a file is outside this publication: ${name}`);
    if(/\.m?js$/.test(name))execFileSync(process.execPath,['--check',name],{stdio:'inherit'});
    if(name.endsWith('.json'))JSON.parse(fs.readFileSync(name,'utf8'));
  }
  const authorities=read('site/apps/career/data','authorities.json');
  assert.equal(authorities.length,73,'Every catalogued authority is retained');
  assert.equal(new Set(authorities.map(a=>a.id)).size,73,'Authority IDs remain unique');
  for(const authority of authorities){
    assert.ok(typeof authority.name==='string'&&authority.name.trim().length>15,`${authority.id}: full official name`);
    assert.ok(typeof authority.shortName==='string'&&authority.shortName.trim(),`${authority.id}: short name`);
    const paragraphs=authority.descriptionParagraphs,sources=authority.descriptionSources;
    assert.ok(Array.isArray(paragraphs)&&paragraphs.length>=2&&paragraphs.length<=3,`${authority.id}: two or three explanatory paragraphs`);
    assert.ok(paragraphs.every(text=>typeof text==='string'&&text.trim().length>30),`${authority.id}: complete explanatory text`);
    assert.ok(Array.isArray(sources)&&sources.length>0,`${authority.id}: official sources`);
    for(const source of sources){
      assert.ok(source&&typeof source.title==='string'&&source.title.trim(),`${authority.id}: source title`);
      const url=new URL(source.url);
      assert.equal(url.protocol,'https:',`${authority.id}: HTTPS source`);
      assert.ok(!url.username&&!url.password,`${authority.id}: public source`);
    }
  }
  console.log(JSON.stringify({status:'pass',scope:'seminar-5',baseCommit,changed,authorities:authorities.length,fullPlatformTests:false}));
}else if(args.includes('--seed-vacancies')){
  const root=option('--baseline'),{manifest}=current(root);
  for(const name of ['apps/career/data/vacancies/gossluzhba.json','apps/career/data/vacancies/sync-status.json']){
    const item=manifest.resources[name];assert.ok(item,`Published snapshot missing: ${name}`);
    const bytes=fs.readFileSync(path.join(root,local(item.url)));
    assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256);
    fs.mkdirSync(path.dirname(path.join('site',name)),{recursive:true});
    fs.writeFileSync(path.join('site',name),bytes);
  }
  console.log('Preserved the published vacancy snapshot; no external refresh requested.');
}else if(args.includes('--compare')){
  const a=option('--baseline'),b=option('--staging');
  const old=current(a),next=current(b);
  assert.deepEqual(next.pointer.previous,old.entry,'The live release remains the rollback target');
  assert.deepEqual(next.manifest.contracts,old.manifest.contracts,'Module contracts unchanged');
  assert.deepEqual(next.manifest.publicEntries,old.manifest.publicEntries,'Public entry routes unchanged');
  assert.equal(next.manifest.workerTemplateSha256,old.manifest.workerTemplateSha256,'Worker unchanged');
  const resources=new Set([...Object.keys(old.manifest.resources),...Object.keys(next.manifest.resources)]),changed=[];
  const canonical=(root,item,buildId)=>fs.readFileSync(path.join(root,local(item.url)),'utf8').replaceAll(buildId,'__RUDN_RELEASE_ID__');
  for(const name of resources){
    const before=old.manifest.resources[name],after=next.manifest.resources[name];
    if(before&&after){
      assert.equal(after.kind,before.kind,`Resource type changed: ${name}`);
      const differs=after.kind==='runtime'
        ? canonical(a,before,old.entry.buildId)!==canonical(b,after,next.entry.buildId)
        : after.sha256!==before.sha256;
      if(!differs)continue;
    }
    assert.ok(allowed.has('site/'+name),`Published bytes changed outside Seminar 5: ${name}`);
    assert.ok(after,`Deleting a published resource is outside this change: ${name}`);
    changed.push(name);
  }
  assert.ok(changed.length>0,'The release must update at least one explicitly allowed Seminar 5 student resource');
  console.log(JSON.stringify({status:'pass',scope:'seminar-5',previous:old.entry.buildId,current:next.entry.buildId,changed,fullPlatformTests:false}));
}else throw new Error('Usage: --scope | --seed-vacancies --baseline DIR | --compare --baseline DIR --staging DIR');
