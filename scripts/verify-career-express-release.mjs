/** Scope and artifact checks for the owner's explicitly requested Seminar 5 publication.
 * This does not represent a full-platform CI run. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const baseCommit='6a0a9699aa6ad882d2ee14554f6936a55432a537';
const verifiedCommit='515d05c7d95e7b0cad668cf96c6e167439697a4c';
const verifiedRun=42205963973;
const publisherFiles=['.github/workflows/publish-career-seminar.yml','scripts/verify-career-express-release.mjs'];
const verifiedJobs=[
  [127853367984,'platform-checks / browsers (chromium)'],
  [127853368027,'platform-checks / browsers (firefox)'],
  [127853368043,'platform-checks / browsers (webkit)'],
  [127853654469,'puzzle-checks / games-and-rendering (chromium)'],
  [127853654391,'puzzle-checks / games-and-rendering (firefox)'],
  [127853654565,'puzzle-checks / games-and-rendering (webkit)']
];
const allowed=new Set([
  '.github/workflows/platform-checks.yml',
  '.github/workflows/publish-career-seminar.yml',
  'scripts/build-career.mjs',
  'scripts/platform-update-adapters.mjs',
  'scripts/test_free_module_contexts.mjs',
  'scripts/test_personality_insights.mjs',
  'scripts/test_personality_model.mjs',
  'scripts/test_personality_ui.mjs',
  'scripts/verify-career-express-release.mjs',
  'site/apps/career/assets/app.js',
  'site/apps/career/assets/personality-insights.mjs',
  'site/apps/career/assets/personality-items.mjs',
  'site/apps/career/assets/personality-model.mjs',
  'site/apps/career/assets/personality.css',
  'site/apps/career/assets/personality.mjs',
  'site/apps/career/assets/seminar-flow.mjs',
  'site/apps/career/docs/IPIP-NEO-120.md',
  'site/apps/career/embedded.css',
  'site/apps/career/entry.mjs',
  'site/apps/career/module.css',
  'site/apps/career/runtime.bundle.mjs',
  'site/apps/career/surface.html',
  'site/assets/js/career-course.js'
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
}else if(args.includes('--verified-ci')){
  const sourceDelta=git('diff','--name-only',verifiedCommit,'HEAD').split('\n').filter(Boolean);
  assert.deepEqual(sourceDelta.sort(),[...publisherFiles].sort(),'Only the publisher and its guard may change after the verified career checks');
  const siteTree=git('rev-parse','HEAD:site');
  assert.equal(siteTree,git('rev-parse',verifiedCommit+':site'),'The complete site must be identical to the browser-tested commit');
  const repo=process.env.GH_REPO||'Arseniy24RUS/RUDN',token=process.env.GH_TOKEN;
  assert.equal(repo.toLowerCase(),'arseniy24rus/rudn','Expected the reviewed repository');
  assert.ok(token,'GH_TOKEN is required to verify completed workflow jobs');
  const api=async endpoint=>{
    const response=await fetch('https://api.github.com/repos/'+repo+endpoint,{
      headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
      signal:AbortSignal.timeout(30000)
    });
    assert.equal(response.status,200,'GitHub verification API failed: '+endpoint);
    return response.json();
  };
  const [run,firstPage]=await Promise.all([api('/actions/runs/'+verifiedRun),api('/actions/runs/'+verifiedRun+'/jobs?per_page=100')]);
  assert.equal(run.id,verifiedRun);
  assert.equal(run.head_sha,verifiedCommit,'Completed checks must belong to the pinned tested source');
  assert.equal(run.repository.full_name.toLowerCase(),repo.toLowerCase());
  const jobs=[...firstPage.jobs];
  for(let page=2;jobs.length<firstPage.total_count;page++){
    const next=await api('/actions/runs/'+verifiedRun+'/jobs?per_page=100&page='+page);
    assert.ok(next.jobs.length,'Missing workflow job page');jobs.push(...next.jobs);
  }
  const evidence=verifiedJobs.map(([id,name])=>{
    const job=jobs.find(candidate=>candidate.id===id);
    assert.ok(job,'Missing completed career verification job: '+name);
    assert.equal(job.name,name);assert.equal(job.run_id,verifiedRun);
    assert.equal(job.head_sha,verifiedCommit);
    assert.equal(job.status,'completed',name+' must have completed');
    assert.equal(job.conclusion,'success',name+' must have passed');
    return {id,name,status:job.status,conclusion:job.conclusion,url:job.html_url,completedAt:job.completed_at};
  });
  const report={status:'pass',scope:'seminar-5',head:git('rev-parse','HEAD'),verifiedCommit,siteTree,sourceDelta,
    verificationRun:{id:run.id,url:run.html_url,status:run.status,conclusion:run.conclusion},jobs:evidence,fullPlatformTests:false};
  if(args.includes('--report')){
    const filename=option('--report');fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify(report));
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
}else throw new Error('Usage: --scope | --verified-ci [--report FILE] | --seed-vacancies --baseline DIR | --compare --baseline DIR --staging DIR');
