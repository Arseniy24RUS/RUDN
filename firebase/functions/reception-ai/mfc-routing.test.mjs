import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG_METADATA} from './catalog-metadata.mjs';
import {EVENT_LOCATIONS} from './routing-cases.mjs';
import {MFC_ROUTING_AUTHORITY_IDS, ROUTING_AUTHORITY_ALIASES} from './routing-directory.mjs';
import {publicRoutingWorkflow, evaluateRoutingWorkflow} from './routing-workflow.mjs';
import {publicMfcRouting, mfcRoutingAlternatives, evaluateMfcRouting, validateMfcRoutingDecision} from './mfc-routing.mjs';

const forward = (...recipientIds) => ({disposition:'forward',recipientIds});
const ids = caseId => mfcRoutingAlternatives(caseId).map(rows => rows.map(row => row.id));
const mayorOffice = 'ru-77-apparat-mera-i-pravitelstva-moskvy';
const cityProperty = 'ru-77-departament-gorodskogo-imushchestva-goroda-moskvy';
const mfcFounder = 'ru-77-departament-truda-i-sotsialnoy-zashchity-naseleniya-goroda-moskvy';

test('all 178 published dossiers have nonempty sets of named recipients without exposing the key', () => {
  const caseIds = Object.keys(CATALOG_METADATA);
  assert.equal(caseIds.length,178);
  for (const caseId of caseIds) {
    const workflow = publicMfcRouting(caseId);
    const routes = mfcRoutingAlternatives(caseId);
    assert.ok(routes.length,caseId);
    assert.equal(workflow.recipientLimit,Math.max(...routes.map(rows => rows.length)),caseId);
    assert.equal(workflow.routingPolicy.allowInternal,false,caseId);
    assert.ok(!Object.hasOwn(workflow,'expectedRecipients'),caseId);
    assert.ok(!Object.hasOwn(workflow,'expectedAlternatives'),caseId);
    assert.deepEqual(workflow.origin,publicRoutingWorkflow(caseId).origin,caseId);
    if (EVENT_LOCATIONS[caseId]?.territoryId) {
      assert.deepEqual(workflow.site,publicRoutingWorkflow(caseId).site,caseId);
    }
    for (const rows of routes) {
      assert.ok(rows.length>0 && rows.length<=2,caseId);
      assert.ok(rows.every(({id,name}) => MFC_ROUTING_AUTHORITY_IDS.has(id) && name.trim()),caseId);
      assert.equal(evaluateMfcRouting(caseId,forward(...rows.map(row => row.id))).correct,true,caseId);
    }
    assert.equal(evaluateMfcRouting(caseId,forward()).correct,false,caseId);
    assert.equal(evaluateMfcRouting(caseId,{disposition:'internal',recipientIds:[]}).correct,false,caseId);
  }
  assert.equal(publicMfcRouting('unknown-case'),null);
});

test('the receiving desk, the centre director, the founder, and the issuing authority remain distinct', () => {
  assert.deepEqual(ids('mfc-refusal'),[['mos-mfc-director']]);
  assert.deepEqual(ids('mfc-institution'),[[mfcFounder]]);
  assert.deepEqual(ids('mfc-service-refusal'),[[cityProperty]]);
  assert.deepEqual(ids('mfc-voluntary-document'),[['mos-housing-subsidy-centre']]);
  assert.match(publicMfcRouting('mfc-voluntary-document').routingPolicy.context.ru,/жилищной субсидии/);
  assert.equal(evaluateMfcRouting('mfc-institution',forward('mos-mfc-director')).correct,false);
  const krasnogorsk = publicMfcRouting('mfc-second-demand');
  assert.deepEqual(ids('mfc-second-demand'),[['krasnogorsk-mfc-director']]);
  assert.equal(krasnogorsk.site.territoryId,'ru-50');
  assert.equal(krasnogorsk.site.city.ru,'Красногорск');
  assert.equal(evaluateMfcRouting('mfc-second-demand',forward('mos-mfc-director')).correct,false);
  assert.equal(evaluateRoutingWorkflow('mfc-second-demand',{recipientIds:['mfc-manager']}).correct,true);
});

test('procedural dispositions use a named recipient and preserve the limits on forwarding', () => {
  for (const id of ['unreadable-body','unclear-subject','court-cancel']) {
    assert.deepEqual(ids(id),[[mayorOffice]]);
    const {context,boundary} = publicMfcRouting(id).routingPolicy;
    assert.match(context.ru,/делопроизводство/);
    assert.match(boundary.ru,/не пересылается/);
    assert.ok(boundary.en && boundary.zh);
  }
  assert.deepEqual(ids('court-order-objections'),[['mos-magistrate-245']]);
  assert.match(publicMfcRouting('court-order-objections').routingPolicy.boundary.ru,/подаёт его сам/);
  assert.deepEqual(ids('repeat-other-authority'),[[mayorOffice]]);
  assert.match(publicMfcRouting('repeat-other-authority').routingPolicy.context.ru,/записи на личный приём/);
});

test('jurisdiction, multiple subjects and admissible alternatives are checked separately', () => {
  const mo = publicMfcRouting('noise-other-region');
  assert.equal(mo.site.territoryId,'ru-50');
  assert.equal(mo.origin.territoryId,'ru-77');
  assert.deepEqual(ids('landfill-registry-scope'),[['rpn-upper-volga']]);
  assert.equal(publicMfcRouting('landfill-registry-scope').site.territoryId,'ru-69');
  assert.equal(evaluateMfcRouting('landfill-registry-scope',forward('tver-environment')).correct,false);
  assert.equal(evaluateMfcRouting('authority-contact',forward('rpn-mo-smolensk')).correct,false);
  assert.equal(evaluateMfcRouting('several-minimum-attachments',forward('mo-transit')).correct,false);
  assert.equal(evaluateMfcRouting('several-minimum-attachments',forward('rkn-central','mo-transit')).correct,true);
  assert.equal(evaluateMfcRouting('several-minimum-attachments',forward('rkn-central','mos-transit')).correct,false);
  assert.match(publicMfcRouting('several-minimum-attachments').routingPolicy.boundary.ru,/в одном обращении/);
  assert.doesNotMatch(publicMfcRouting('several-minimum-attachments').routingPolicy.boundary.ru,/раздел|каждому|копи/);
  assert.equal(evaluateMfcRouting('noise-two-subjects',forward('police-moscow')).correct,true);
  assert.equal(evaluateMfcRouting('oms-paid-offer',forward('mos-oms-fund')).correct,true);
  assert.equal(evaluateMfcRouting('oms-paid-offer',forward('mos-oms-fund','mos-health')).correct,false);
});

test('the seminar requires forward and rejects duplicate, obsolete and fabricated recipient IDs', () => {
  const abstractRoles = ['reception-unit','independent-review','mfc-manager','mfc-issuer','carrier','creditor','insurer','postal-operator',
    'court-guidance','deciding-court','rpn-at-site','rkn-at-site','fas-at-site','rpn-consumer-at-site','git-employer','fssp-office','fssp-superior',
    'sfr-office','registry-office','fire-oversight','guard-oversight','police-at-site','phyto-office','tax-office','customs-office'];
  for (const id of abstractRoles) {
    assert.equal(MFC_ROUTING_AUTHORITY_IDS.has(id),false,id);
    assert.throws(() => validateMfcRoutingDecision(forward(id)),{code:'invalid_decision'});
  }
  const alias = Object.keys(ROUTING_AUTHORITY_ALIASES).find(id => ROUTING_AUTHORITY_ALIASES[id]==='tver-environment');
  assert.deepEqual(validateMfcRoutingDecision(forward(alias)),forward('tver-environment'));
  assert.equal(evaluateMfcRouting('landfill-territory',forward(alias)).correct,true);
  for (const value of [forward(), forward('invented-authority'), forward('internal'), forward('independent-review'),
    forward(alias,'tver-environment'), forward('fns','fns'), forward('fns','fas','rkn'),
    {recipientIds:['fns']}, {disposition:'internal',recipientIds:[]}, {disposition:'forward',recipientIds:[1]},
    {disposition:'forward',recipientIds:Array(1)}, {...forward('fns'),mode:'refer'}, null]) {
    assert.throws(() => validateMfcRoutingDecision(value),{code:'invalid_decision'});
  }
});
