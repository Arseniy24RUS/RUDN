/** Scope and artifact checks for a future, separately reviewed Seminar 5 release.
 * --scope checks committed base-to-HEAD changes on the review branch. It does
 * not stage or include local/untracked files and is not a full-platform CI run.
 * Preparing this verifier or a ZIP does not publish anything. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const baseCommit='bbc731814813486541108a3abacfafd1f0cfa4a8';
const allowedFiles=new Set([
  '.gitignore',
  '.gitattributes',
  'package.json',
  'package-lock.json',
  '.github/workflows/publish-career-seminar.yml',
  'scripts/build-career.mjs',
  'scripts/build-platform-release.mjs',
  'scripts/unpack-career-vacancies.py',
  'scripts/repack-career-vacancies.py',
  'scripts/overlay-career-vacancy-parents.py',
  'scripts/test_repack_career_vacancies.py',
  'scripts/compress-career-vacancy-descriptors.py',
  'scripts/test_career_vacancy_bank_ui.mjs',
  'tests/employer-vacancies-bank.test.mjs',
  'tests/career-vacancy-details.test.mjs',
  'tests/career-vacancy-lazy-release.test.mjs',
  'scripts/test_compress_career_vacancy_descriptors.py',
  'site/service-worker.js',
  'scripts/build-career-territorial-catalog.py',
  'scripts/test_career_journey_ui.mjs',
  'scripts/test_career_preferences_ui.mjs',
  'scripts/test_career_update_migration.mjs',
  'scripts/test_personality_ui.mjs',
  'scripts/test_free_module_contexts.mjs',
  'scripts/verify-career-express-release.mjs',
  'site/assets/js/career-course.js',
  'tests/career-journey-model.test.mjs',
  'tests/career-territorial-catalog.test.mjs',
  'tests/personality-visuals.test.mjs',
  'tests/career-region-map.test.mjs',
  'tests/career-wish-sortable.test.mjs'
]);
const allowedPrefixes=['site/apps/career/','source-audit/career-vacancies/'];
const isAllowed=name=>allowedFiles.has(name)||allowedPrefixes.some(prefix=>name.startsWith(prefix));
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
  // Disable rename detection: moving a file is a deletion plus an addition,
  // and deletions (including those hidden by rename detection) are forbidden.
  const entries=git('diff','--name-status','--no-renames','-z',baseCommit,'HEAD').split('\0');
  if(entries.at(-1)==='')entries.pop();
  assert.equal(entries.length%2,0,'Expected NUL-delimited status/path pairs');
  const changed=[];
  for(let index=0;index<entries.length;index+=2){
    const status=entries[index],name=entries[index+1];
    assert.ok(status==='A'||status==='M',`Deleting, renaming or changing a file type is outside this publication: ${status} ${name}`);
    assert.ok(isAllowed(name),`Outside the reviewed Seminar 5 scope: ${name}`);
    assert.ok(fs.lstatSync(name).isFile(),`Only regular files may be published: ${name}`);
    changed.push(name);
  }
  assert.ok(changed.length,'The focused publication must contain a change');
  for(const name of changed){
    if(/\.m?js$/.test(name))execFileSync(process.execPath,['--check',name],{stdio:'inherit'});
    if(name.endsWith('.json'))JSON.parse(fs.readFileSync(name,'utf8'));
  }
  const detailsHosting='source-audit/career-vacancies/details-hosting.json';
  if(fs.existsSync(detailsHosting)){
    const details=JSON.parse(fs.readFileSync(detailsHosting,'utf8'));
    const seed=read('source-audit/career-vacancies','seed.json');
    assert.equal(details.qaSubset,undefined,'A development subset cannot be published to students');
    assert.equal(details.vacancies,seed.vacancies,'The requirements bank must cover every source vacancy');
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
  const workerTemplate=fs.readFileSync('site/service-worker.js','utf8');
  const lazyBlocks=/\/\* CAREER_VACANCY_LAZY_BEGIN \*\/[\s\S]*?\/\* CAREER_VACANCY_LAZY_END \*\/\n?/g;
  assert.equal(sha(workerTemplate),next.manifest.workerTemplateSha256,'Published worker matches the reviewed source');
  if(next.manifest.workerTemplateSha256!==old.manifest.workerTemplateSha256){
    assert.equal([...workerTemplate.matchAll(lazyBlocks)].length,2,'Only the two reviewed career collection additions are permitted');
    assert.equal(sha(workerTemplate.replace(lazyBlocks,'')),old.manifest.workerTemplateSha256,'Worker bytes outside career collection routing unchanged');
  }
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
    assert.ok(isAllowed('site/'+name),`Published bytes changed outside Seminar 5: ${name}`);
    assert.ok(after,`Deleting a published resource is outside this change: ${name}`);
    changed.push(name);
  }
  assert.ok(changed.length>0,'The release must update at least one explicitly allowed Seminar 5 student resource');
  console.log(JSON.stringify({status:'pass',scope:'seminar-5',previous:old.entry.buildId,current:next.entry.buildId,changed,fullPlatformTests:false}));
}else throw new Error('Usage: --scope | --seed-vacancies --baseline DIR | --compare --baseline DIR --staging DIR');
