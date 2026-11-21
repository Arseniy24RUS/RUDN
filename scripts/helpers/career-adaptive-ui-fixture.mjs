import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {FUNCTIONAL_MODEL_VERSION} from '../../site/apps/career/assets/adaptive-model.mjs';
import {CANDIDATE_COLUMNS,CANDIDATE_ENCODING} from '../../site/apps/career/assets/adaptive-index-codec.mjs';

/** An isolated candidate pool for setup, question UI and workspace tests.
 * It does not certify the published vacancy bank or recommendation quality. */
export function createAdaptiveCareerIndexFixture(taxonomy){
  const indexVersion=FUNCTIONAL_MODEL_VERSION+'-isolated-ui';
  const candidatePayload={schemaVersion:2,version:indexVersion,encoding:CANDIDATE_ENCODING,columns:[...CANDIDATE_COLUMNS],
    dictionaries:{strings:['QA specialist','QA department','Moscow','https://example.test/personality-qa',
      'data/vacancies/details/qa.json','data/adaptive-index/details/d0000.json.gz'],employers:[['qa-employer','QA employer']],
      profiles:[{id:'a'.repeat(64),features:{[taxonomy.facets[0].id]:1}}]},
    rows:[['personality-qa-vacancy',0,1,0,'ru-77',2,0,'duties','specialist','profile',null,3,4,'position',1,5]]};
  const candidateBytes=Buffer.from(JSON.stringify(candidatePayload)),candidateGzip=gzipSync(candidateBytes);
  const descriptor=relative=>({path:'data/adaptive-index/'+relative,count:1,bytes:candidateGzip.length,
    uncompressedBytes:candidateBytes.length,sha256:createHash('sha256').update(candidateGzip).digest('hex')});
  const indexManifest={schemaVersion:2,version:indexVersion,taxonomyVersion:taxonomy.version,
    all:descriptor('all.json.gz'),nationalParts:[descriptor('national/n0000.json.gz')],
    shards:[{...descriptor('regions/ru-77.json.gz'),regionId:'ru-77'}],details:[]};
  return new Map([
    ['/apps/career/data/adaptive-index/manifest.json',{type:'application/json',body:Buffer.from(JSON.stringify(indexManifest))}],
    ...['national/n0000.json.gz','regions/ru-77.json.gz'].map(name=>[
      '/apps/career/data/adaptive-index/'+name,{type:'application/gzip',body:candidateGzip}])
  ]);
}

export async function chooseAdaptiveCareerPreferences(page){
  await page.locator('#view-preferences:not([hidden])').waitFor();
  const locationNext=page.locator('#adaptive-location-next');await locationNext.waitFor();
  assert.equal(await page.locator('#view-test').isVisible(),false,'Questions wait for explicit location and role choices');
  await page.locator('input[name="adaptive-location-mode"][value="selected"]').check();
  assert.equal(await locationNext.isDisabled(),true,'Selected-region mode requires a region');
  await page.locator('input[name="adaptive-location-mode"][value="all"]').check();
  assert.equal(await locationNext.isEnabled(),true);
  await locationNext.click();
  const roleNext=page.locator('#adaptive-responsibility-next');await roleNext.waitFor();
  assert.equal(await page.locator('[data-adaptive-responsibility]:checked').count(),0,'A new owner has no inherited role');
  assert.equal(await roleNext.isDisabled(),true,'The role must be explicitly selected');
  await page.locator('[data-adaptive-responsibility="specialist"]').check();
  assert.equal(await roleNext.isEnabled(),true);await roleNext.click();
  await page.locator('#adaptive-question').waitFor();
}
