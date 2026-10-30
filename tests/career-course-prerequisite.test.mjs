import assert from 'node:assert/strict';
import {test} from 'node:test';
import {completedCareerRecord,readCareerCompletion} from '../site/assets/js/career-course.js';

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
