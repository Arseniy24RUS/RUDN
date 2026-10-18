import test from 'node:test';
import assert from 'node:assert/strict';
import {legalLabSaveMode,legalLabSaveMessageKey} from '../site/assets/js/legal-lab-save-status.js';
test('graded retries use their actual receipt queue rather than an empty workspace',()=>{
 assert.equal(legalLabSaveMode({id:'legal-assessment-original'}),'legal-lab-workspace');
 assert.equal(legalLabSaveMode({id:'legal-assessment-original-r-12345678-1234-4123-8123-123456789abc'}),'legal-lab-assessment');
 assert.equal(legalLabSaveMode({id:'old-report',draftMode:'legal-lab-assessment'}),'legal-lab-assessment');
 assert.equal(legalLabSaveMode({id:'old-report',draftMode:'untrusted-mode'}),'legal-lab-workspace');
});
test('missing or unreadable draft cannot be presented as confirmed cloud delivery',()=>{
 for(const value of ['empty','unknown',undefined,null,'host-accepted'])assert.equal(legalLabSaveMessageKey(value),'unknown');
 assert.equal(legalLabSaveMessageKey('device-only'),'device');
 assert.equal(legalLabSaveMessageKey('pending'),'pending');
 assert.equal(legalLabSaveMessageKey('saved'),'saved');
});
