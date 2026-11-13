import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_METADATA} from './catalog-metadata.mjs';
import {ROUTING_RECIPIENTS} from './routing-cases.mjs';
import {ROUTING_AUTHORITIES, ROUTING_AUTHORITY_ALIASES, ROUTING_AUTHORITY_IDS} from './routing-directory.mjs';
import {publicRoutingWorkflow, validateRoutingWorkflowDecision, evaluateRoutingWorkflow} from './routing-workflow.mjs';

const choose = (...recipientIds) => ({recipientIds});

test('all 178 published dossier IDs have deterministic correspondence and valid private recipient sets', () => {
  const cases = Object.keys(CATALOG_METADATA).sort();
  assert.equal(cases.length,178);
  assert.deepEqual(Object.keys(ROUTING_RECIPIENTS).sort(),cases);
  for (const id of cases) {
    const workflow = publicRoutingWorkflow(id);
    assert.deepEqual(publicRoutingWorkflow(id),workflow);
    assert.ok(workflow.recipientLimit===1 || workflow.recipientLimit===2);
    assert.ok(!Object.hasOwn(workflow,'expectedRecipients'));
    assert.ok(!Object.hasOwn(workflow,'recipientIds'));
    if (id !== 'anonymous-danger') {
      assert.match(workflow.origin.territoryId,/^ru-\d\d$/);
      assert.match(workflow.origin.address.ru,/^ул\. \S+, д\. ([1-9]|[1-3][0-9])$/);
    }
    for (const variant of ROUTING_RECIPIENTS[id]) {
      assert.ok(variant.length>0 && variant.length<=workflow.recipientLimit);
      assert.ok(variant.every(recipient => Object.hasOwn(ROUTING_AUTHORITIES,recipient)));
      assert.equal(evaluateRoutingWorkflow(id,choose(...variant)).correct,true);
    }
    assert.equal(evaluateRoutingWorkflow(id,choose()).correct,false);
  }
});

test('correspondence and jurisdiction remain independent in cross-region dossiers', () => {
  const landfill = publicRoutingWorkflow('landfill-territory');
  assert.equal(landfill.origin.territoryId,'ru-77');
  assert.equal(landfill.site.territoryId,'ru-69');
  assert.equal(landfill.site.city,null);
  assert.equal(evaluateRoutingWorkflow('landfill-territory',choose('tver-environment')).correct,true);
  assert.equal(evaluateRoutingWorkflow('landfill-territory',choose('mos-environment')).correct,false);
  const noise = publicRoutingWorkflow('noise-other-region');
  assert.equal(noise.origin.territoryId,'ru-77');
  assert.equal(noise.site.territoryId,'ru-50');
  assert.equal(noise.site.city,null);
  assert.equal(evaluateRoutingWorkflow('noise-other-region',choose('mo-silence')).correct,true);
  assert.equal(evaluateRoutingWorkflow('noise-other-region',choose('police-moscow')).correct,false);
  assert.equal(publicRoutingWorkflow('landfill-registry-scope').site.territoryId,null);
  assert.equal(publicRoutingWorkflow('anonymous-danger').origin.address,null);
  assert.equal(evaluateRoutingWorkflow('authority-contact',choose('rpn-mo-smolensk')).correct,false);
  assert.equal(evaluateRoutingWorkflow('authority-contact',choose('rpn-moscow-kaluga')).correct,true);
});

test('MFC recipients distinguish staff action, centre policy and service issuer', () => {
  for (const [caseId,right,wrong] of [
    ['mfc-refusal','mfc-manager','mfc-issuer'],
    ['mfc-institution','mfc-founder','mfc-manager'],
    ['mfc-service-refusal','mfc-issuer','mfc-manager'],
  ]) {
    assert.equal(evaluateRoutingWorkflow(caseId,choose(right)).correct,true);
    const miss=evaluateRoutingWorkflow(caseId,choose(wrong));
    assert.equal(miss.correct,false);
    assert.equal(miss.expectedRecipients[0].id,right);
    assert.equal(typeof miss.expectedRecipients[0].name,'string');
  }
});

test('split recipients can be selected in either order and excess or fabricated IDs are rejected', () => {
  const caseId='several-issues';
  assert.equal(publicRoutingWorkflow(caseId).recipientLimit,2);
  assert.equal(evaluateRoutingWorkflow(caseId,choose('mos-transit')).correct,false);
  assert.equal(evaluateRoutingWorkflow(caseId,choose('rkn-central','mos-transit')).correct,true);
  assert.equal(evaluateRoutingWorkflow(caseId,choose('rkn-central','mos-transit')).expectedRecipients.length,2);
  for (const value of [{recipientIds:['invented']},choose('fas','fas'),choose('fas','rkn','sfr'),{recipientIds:['fas'],mode:'refer'},null]) {
    assert.throws(()=>validateRoutingWorkflowDecision(value),{code:'invalid_decision'});
  }
});


test('Career choices are valid inputs and aliases preserve the same territorial authority', () => {
  const longest = [...ROUTING_AUTHORITY_IDS].reduce((a,b)=>a.length>b.length?a:b);
  assert.ok(longest.length>120);
  assert.deepEqual(validateRoutingWorkflowDecision(choose(longest)),choose(longest));
  assert.equal(evaluateRoutingWorkflow('authority-contact',choose(longest)).correct,false);
  const canonicalTver = Object.keys(ROUTING_AUTHORITY_ALIASES).find(id=>ROUTING_AUTHORITY_ALIASES[id]==='tver-environment');
  assert.equal(evaluateRoutingWorkflow('landfill-territory',choose(canonicalTver)).correct,true);
  assert.throws(()=>validateRoutingWorkflowDecision(choose(canonicalTver,'tver-environment')),{code:'invalid_decision'});
});
