import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MODEL_VERSION,QUESTIONNAIRE_VERSION,REGISTRY_VERSION} from '../site/apps/career/assets/versions.mjs';
import {upgradePreviousDraft,canReuseScenarioInputs} from '../site/apps/career/assets/model-upgrade.mjs';
import {parseSession,SESSION_SCHEMA} from '../site/apps/career/assets/session-transfer.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../site/apps/career/data/'+name+'.json',import.meta.url)));
const questions=read('questions'),sectors=read('sectors');
const inputs={answers:Object.fromEntries(questions.map(q=>[q.id,3])),prioritySectors:['EDU','FIN','HEA','SOC'],lowPrioritySectors:['SEC','EMR'],conditions:{FIELD:3,SCHEDULE:3,FORMAL:3,SECURITY:3},focusAreas:{EDU:'science'}};
const previous={schema:4,modelVersion:'8.0.0',questionnaireVersion:QUESTIONNAIRE_VERSION,registryVersion:REGISTRY_VERSION,...inputs,resultRecordId:'previous-result-123',completedAt:'2026-10-27T10:00:00Z',lastRoute:'results'};
test('reuse questionnaire without reusing or mutating a completed result identity',()=>{
 const bytes=JSON.stringify(previous),upgraded=upgradePreviousDraft(previous);
 assert.equal(JSON.stringify(previous),bytes);assert.equal(upgraded.modelVersion,MODEL_VERSION);
 assert.equal(upgraded.resultRecordId,null);assert.equal(upgraded.completedAt,null);
 for(const key of Object.keys(inputs))assert.deepEqual(upgraded[key],inputs[key]);
 upgraded.answers[questions[0].id]=1;assert.equal(previous.answers[questions[0].id],3);
});
test('unknown questionnaire, registry and model cannot migrate silently',()=>{
 for(const patch of [{questionnaireVersion:'7.0.0'},{registryVersion:'unknown'},{modelVersion:'10.0.0'},{schema:3}])assert.equal(upgradePreviousDraft({...previous,...patch}),null);
});
test('explicit answer import accepts unchanged questionnaire and rejects unknown models',()=>{
 const bundle={schema:SESSION_SCHEMA,schemaVersion:1,modelVersion:'8.0.0',questionnaireVersion:QUESTIONNAIRE_VERSION,registryVersion:REGISTRY_VERSION,inputs};
 assert.deepEqual(parseSession(JSON.stringify(bundle),questions,sectors),inputs);
 assert.throws(()=>parseSession(JSON.stringify({...bundle,modelVersion:'future'}),questions,sectors));
});
test('only the known unchanged scenario questionnaire skips question reconfirmation',()=>{
 assert.equal(canReuseScenarioInputs({modelVersion:'8.0.0',scoringRevision:'smooth065-path-scoped-domains-v8'}),true);
 assert.equal(canReuseScenarioInputs({modelVersion:'7.0.0',scoringRevision:'old'}),false);
});
