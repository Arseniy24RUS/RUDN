import assert from 'node:assert/strict';
import {test} from 'node:test';
import {completedCareerRecord,readCareerCompletion,readCareerSeminarProgress} from '../site/assets/js/career-course.js';

const record=()=>({schema:'rudn-career-result',schemaVersion:2,recordId:'career-complete-1234',createdAt:'2026-10-30T12:00:00.000Z',modelVersion:'8.1.0',questionnaireVersion:'8.0.0',registryVersion:'ru-public-careers-2026-09-05-stage8',roleProfile:{raw:Object.fromEntries(['N','K','A','M','C','E','D','T','I'].map(id=>[id,3])),dispersion:0,flat:true},prioritySectors:['EDU','SOC','HEA','ADM'],lowPrioritySectors:['SEC','INT'],conditions:{FIELD:3,SCHEDULE:3,FORMAL:3,SECURITY:3},focusAreas:{},leadingTieIds:['mintrud'],ranking:['mintrud','minpros','minzdrav','mincifry','minjust'].map((authorityId,index)=>({rank:index+1,authorityId,score:80-index,trackId:'POLICY'}))});
const attempt=(studentKey='a',changes={})=>({id:'saved-result',studentKey,activitySlug:'career-diagnostic',type:'career-diagnostic',recordGrade:false,career:record(),...changes});
const backend=(draft=null,attempts=[])=>({loadDraft:async()=>draft,getAttempts:async()=>attempts});

test('partial questionnaires, malformed ratings and demo records do not unlock the assessment',()=>{
  assert.equal(completedCareerRecord(record()),true);
  for(const change of [{recordId:'demo-result-1234'},{conditions:{FIELD:3}},{prioritySectors:['EDU']},{ranking:[]},{createdAt:'invalid'},{schemaVersion:1}])assert.equal(completedCareerRecord({...record(),...change}),false);
});

test('only a completed course result belonging to this student unlocks the test',async()=>{
  for(const candidate of [attempt('b'),attempt('a',{activitySlug:'career-freeplay'}),attempt('a',{recordGrade:true}),attempt('a',{type:'civil-service-knowledge'})]){
    assert.equal(await readCareerCompletion({backend:backend(),owner:'student:a',attempts:[candidate]}),null);
  }
  assert.equal((await readCareerCompletion({backend:backend(),owner:'student:a',attempts:[attempt()]})).recordId,record().recordId);
});

test('course completion restores from the matching durable draft without a grade',async()=>{
  const draft={owner:'student:a',activitySlug:'career-diagnostic',state:{record:record()}};
  assert.equal((await readCareerCompletion({backend:backend(draft),owner:'student:a',attempts:[]})).recordId,record().recordId);
  assert.equal(await readCareerCompletion({backend:backend({...draft,owner:'student:b'}),owner:'student:a',attempts:[]}),null);
});

test('guests use their own course record and cannot inherit a student result',async()=>{
  const draft={owner:'guest:career',activitySlug:'career-diagnostic',state:{record:record()}};
  assert.equal((await readCareerCompletion({backend:backend(draft),owner:'guest',attempts:[]})).recordId,record().recordId);
  assert.equal(await readCareerCompletion({backend:backend(),owner:'guest',attempts:[attempt()]}),null);
});

test('another device can restore an existing authenticated course result',async()=>{
  assert.equal((await readCareerCompletion({backend:backend(null,[attempt()]),owner:'student:a'})).recordId,record().recordId);
});

const currentBuild='a'.repeat(32);
const priorBuild='b'.repeat(32);
const legacyWorkspace='workspace-v1';
const owner='student:fixture';
const progressScope={owner,activitySlug:'career-workspace',mode:'diagnostic'};
const versionedWorkspace=build=>`workspace-v1-${build}`;

function reviewedWorkspace({attemptId=legacyWorkspace, personalityComplete=true, ...changes}={}){
  const recordId='functional-fixture-1200';
  const completedAt='2026-11-07T12:00:00.000Z';
  const vacancyId='12345678-1234-1234-1234-123456789abc';
  const markKey='fixture-mark';
  const signature=JSON.stringify(['requirement','skills','Практическое составление служебной записки']);
  const target={
    vacancyId, authorityId:'fixture-authority',
    pagePath:'pages/aa/bbbbbbbbbbbbbbbbbbbbbbbb/p0001-cccccccccccccccc.json.gz',
    pageSHA256:'d'.repeat(64),sourceURL:`https://gossluzhba.gov.ru/vacancy/${vacancyId}`
  };
  const state={
    personalityComplete,route:personalityComplete?'review':'home',
    values:{
      'functional-career-v1':JSON.stringify({
        setupComplete:true,completedAt,resultRecordId:recordId,answers:Array.from({length:47},()=>3),
        completion:{schema:'rudn-career-result',schemaVersion:3,resultKind:'vacancy-functional',
          completed:true,createdAt:completedAt,recordId,answerCount:47},
        reviewCompletion:{schemaVersion:1,resultRecordId:recordId,target,markKey,signature,status:'gap'}
      }),
      [`functional-vacancy-review-v1:${vacancyId}`]:JSON.stringify({
        schemaVersion:1,vacancyId,marks:{[markKey]:{signature,status:'gap'}}
      })
    }
  };
  return {...progressScope,attemptId,state,...changes};
}

function releaseFixture(t){
  const initial=globalThis.__RUDN_RELEASE__;
  globalThis.__RUDN_RELEASE__={buildId:currentBuild,retention:'current-only'};
  t.after(()=>{globalThis.__RUDN_RELEASE__=initial;});
}

test('a newer restored Career workspace cannot hide its owner’s confirmed old review',async t=>{
  releaseFixture(t);
  const before=reviewedWorkspace();
  const latest=reviewedWorkspace({attemptId:versionedWorkspace(priorBuild),personalityComplete:false});
  const snapshot=structuredClone(latest);
  const calls=[];
  const backend={loadDraft:async scope=>{
    calls.push(scope);
    if(scope.attemptId===legacyWorkspace)return before;
    if(!scope.attemptId)return latest;
    return null;
  }};
  const restored=await readCareerSeminarProgress({backend,owner});
  assert.deepEqual(calls,[
    {...progressScope,attemptId:versionedWorkspace(currentBuild)},progressScope,
    {...progressScope,attemptId:legacyWorkspace}
  ]);
  assert.deepEqual(restored,{stage:'personality',personalityComplete:true,preferencesComplete:true,careerComplete:true,reviewAvailable:true,reviewComplete:true});
  assert.deepEqual(latest,snapshot,'new workspace answers and release state are untouched');
  assert.deepEqual(await readCareerSeminarProgress({backend,owner,workspace:latest}),restored);
});

test('completed reviews on the current release need no historical read',async t=>{
  releaseFixture(t);
  const current=reviewedWorkspace({attemptId:versionedWorkspace(currentBuild)});
  const result=await readCareerSeminarProgress({owner,backend:{loadDraft:async scope=>{
    assert.deepEqual(scope,{...progressScope,attemptId:current.attemptId});
    return current;
  }}});
  assert.equal(result.reviewComplete,true);
});

test('only the same owner’s valid legacy Career review can reopen the knowledge path',async t=>{
  releaseFixture(t);
  const current=reviewedWorkspace({attemptId:versionedWorkspace(currentBuild),personalityComplete:false});
  const noMark=reviewedWorkspace();
  delete noMark.state.values[Object.keys(noMark.state.values).find(key=>key.startsWith('functional-vacancy-review-v1:'))];
  for(const candidate of [
    null,noMark,reviewedWorkspace({owner:'student:other'}),reviewedWorkspace({owner:'guest:career'}),
    reviewedWorkspace({activitySlug:'career-freeplay'}),reviewedWorkspace({mode:'free'}),
    reviewedWorkspace({attemptId:versionedWorkspace(priorBuild)}),
    reviewedWorkspace({saveStatus:{state:'conflict'}})
  ]){
    const result=await readCareerSeminarProgress({owner,workspace:current,backend:{loadDraft:async scope=>{
      assert.deepEqual(scope,{...progressScope,attemptId:legacyWorkspace});
      return candidate;
    }}});
    assert.equal(result.reviewComplete,false);
  }
});

const studentKey='12345678';
const cloudOwner='student:'+studentKey;
const archiveAttemptId=versionedWorkspace(priorBuild);
const signedIn=()=>({user:{uid:'fixture-browser'},generation:3,getProfile:()=>({studentKey})});
function archivedReview(headChanges={},envelopeChanges={}){
  return {
    schemaVersion:1,activitySlug:progressScope.activitySlug,mode:progressScope.mode,studentKey,attemptId:archiveAttemptId,
    current:reviewedWorkspace({studentKey,owner:cloudOwner,attemptId:archiveAttemptId,releaseBuildId:priorBuild,...headChanges}),
    ...envelopeChanges
  };
}

test('same-owner versioned review survives a newer workspace without loading an old quiz',async t=>{
  releaseFixture(t);
  const current=reviewedWorkspace({owner:cloudOwner,attemptId:versionedWorkspace(currentBuild),personalityComplete:false});
  const unchanged=structuredClone(current);
  const history={[archiveAttemptId]:archivedReview()};
  const savedHistory=structuredClone(history);
  const backend={...signedIn(),
    loadDraft:async scope=>{
      assert.deepEqual(scope,{...progressScope,owner:cloudOwner,attemptId:legacyWorkspace});
      return null;
    },
    readCloud:async (resource,options)=>{
      assert.equal(resource,`checkpoints/${studentKey}/career-workspace`);
      assert.deepEqual(options,{authoritative:true});
      return history;
    }
  };
  const progress=await readCareerSeminarProgress({backend,owner:cloudOwner,workspace:current});
  assert.equal(progress.reviewComplete,true);
  assert.equal(progress.stage,'personality');
  assert.deepEqual(current,unchanged);
  assert.deepEqual(history,savedHistory);
});

test('versioned cloud recovery rejects wrong owners, scope, malformed IDs and conflicts',async t=>{
  releaseFixture(t);
  const current=reviewedWorkspace({owner:cloudOwner,attemptId:versionedWorkspace(currentBuild),personalityComplete:false});
  const cases=[
    {[archiveAttemptId]:archivedReview({owner:'student:87654321'})},
    {[archiveAttemptId]:archivedReview({mode:'free'})},
    {[archiveAttemptId]:archivedReview({studentKey:'87654321'})},
    {[archiveAttemptId]:archivedReview({attemptId:versionedWorkspace(currentBuild)})},
    {[archiveAttemptId]:archivedReview({releaseBuildId:currentBuild})},
    {[archiveAttemptId]:archivedReview({saveStatus:{state:'conflict'}})},
    {[archiveAttemptId]:archivedReview({}, {studentKey:'87654321'})},
    {[archiveAttemptId]:archivedReview({}, {attemptId:versionedWorkspace(currentBuild)})},
    {[archiveAttemptId]:archivedReview({}, {activitySlug:'career-freeplay'})},
    {[archiveAttemptId]:archivedReview({}, {mode:'free'})},
    {[archiveAttemptId]:archivedReview({}, {conflicts:{draft:{}}})},
    {'malformed-workspace-id':archivedReview()}
  ];
  for(const history of cases){
    const backend={...signedIn(),loadDraft:async()=>null,readCloud:async()=>history};
    assert.equal((await readCareerSeminarProgress({backend,owner:cloudOwner,workspace:current})).reviewComplete,false);
  }
  let archiveReads=0;
  const backend={...signedIn(),loadDraft:async()=>null,readCloud:async()=>{
    archiveReads++;
    return {[archiveAttemptId]:archivedReview()};
  }};
  assert.equal((await readCareerSeminarProgress({backend,owner:'student:87654321',workspace:null})).reviewComplete,false);
  assert.equal(archiveReads,0);
});

test('an account change while reading versioned Career proof cannot grant eligibility',async t=>{
  releaseFixture(t);
  const backend={...signedIn(),loadDraft:async()=>null,readCloud:async()=>{
    backend.generation++;
    return {[archiveAttemptId]:archivedReview()};
  }};
  assert.equal((await readCareerSeminarProgress({backend,owner:cloudOwner,workspace:null})).reviewComplete,false);
});
