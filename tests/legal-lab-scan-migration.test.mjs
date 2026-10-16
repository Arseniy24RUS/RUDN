import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateClassroomScans} from '../site/apps/legal-lab/lib/core.mjs';

const bank={classroom:[{id:'S01',kind:'scan',scanId:'new-document',previousScanId:'old-document'},{id:'T01',kind:'type'}]};

test('replacement keeps old scan responses and completed dossier intact',()=>{
  const answer={metadata:{issuer:'date',date:'date'},submitted:true,metadataMode:'all-hotspots-v1'};
  const dossier={attemptId:'earned-attempt',result:{points:5},answer:{metadata:{issuer:'issuer'}}};
  const state={answers:{S01:structuredClone(answer),T01:{type:'Указ',submitted:true}},scanFields:{S01:1},assessment:structuredClone(dossier)};
  assert.equal(migrateClassroomScans(state,bank),true);
  assert.deepEqual(state.scanAnswerHistory.S01,[{scanId:'old-document',answer,fieldIndex:1}]);
  assert.equal(state.answers.S01,undefined);
  assert.equal(state.scanFields.S01,undefined);
  assert.deepEqual(state.answers.T01,{type:'Указ',submitted:true});
  assert.deepEqual(state.assessment,dossier);
  assert.equal(migrateClassroomScans(state,bank),false);
  assert.equal(state.scanAnswerHistory.S01.length,1);
});

test('a response already tied to the new document is retained',()=>{
  const state={answers:{S01:{scanId:'new-document',metadata:{issuer:'issuer'},submitted:false}},scanFields:{S01:3}};
  const original=structuredClone(state);
  assert.equal(migrateClassroomScans(state,bank),false);
  assert.deepEqual(state,original);
});

test('an older retained branch is never replaced by a different response',()=>{
  const state={answers:{S01:{scanId:'old-document',metadata:{issuer:'issuer'}}},scanAnswerHistory:{S01:[{scanId:'old-document',answer:{metadata:{issuer:'date'}},fieldIndex:0}]}};
  assert.equal(migrateClassroomScans(state,bank),true);
  assert.equal(state.scanAnswerHistory.S01.length,2);
  assert.deepEqual(state.scanAnswerHistory.S01[0].answer.metadata,{issuer:'date'});
  assert.deepEqual(state.scanAnswerHistory.S01[1].answer.metadata,{issuer:'issuer'});
});
