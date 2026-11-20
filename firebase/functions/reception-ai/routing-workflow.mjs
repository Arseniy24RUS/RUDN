import {ROUTING_AUTHORITIES, ROUTING_TERRITORIES, ROUTING_AUTHORITY_ALIASES, ROUTING_AUTHORITY_IDS} from './routing-directory.mjs';
import {ROUTING_RECIPIENTS, CORRESPONDENCE_TERRITORIES, CORRESPONDENCE_OVERRIDES, EVENT_LOCATIONS} from './routing-cases.mjs';
import {ReceptionError} from './schema.mjs';

const ID = /^[a-z0-9][a-z0-9-]{0,255}$/;
const canonicalId = id => Object.hasOwn(ROUTING_AUTHORITY_ALIASES,id) ? ROUTING_AUTHORITY_ALIASES[id] : id;
const INTERNAL_PATHS = new Set(['reception-unit','independent-review','court-guidance','clarify-environment']);
// Here the receiving organization already has authority, or its job is to
// explain a filing path to the applicant. The directory ID still describes
// the substantive route and is preserved for legacy workbooks.
const internalByRecipient = {
  'mos-nizhegorodsky-council':'budget',
  'info-holder':'budget-link budget-partial budget-published',
  'fas-at-site':'ads-channel-scope ads-service-message ads-withdrawal-time beer-distance beer-online-agegate',
  'fssp-office':'bailiff-copy-decision bailiff-specific-petition',
  'fssp-superior':'bailiff-subordination bailiff-unsigned-complaint',
  'deciding-court':'court-installments court-order-objections court-typo-not-merits',
  'git-employer':'driver-planned-extension driver-split-break driver-waiting-work salary-gross-net salary-late-compensation',
  'git-moscow':'salary-documents-request',
  'registry-office':'egrn-letter egrn-rights-dispute egrn-source-plan',
  'education-verify':'education-register',
  'rostransnadzor':'flight-weather-care',
  'carrier':'flight-claim',
  'rpn-consumer-at-site':'food-manufactured-date food-no-receipt-refund',
  'guard-oversight':'guard-contractor guard-current-register guard-identification-request guard-property-inspection',
  'regional-heritage':'heritage-approved-restoration heritage-identified-status heritage-license-not-permit',
  'mfc-manager':'mfc-delay mfc-refusal',
  'mfc-founder':'mfc-institution',
  'mos-utilities':'noise-emergency-work',
  'medical-clinic':'oms-free-slot',
  'medical-authority':'oms-other-region',
  'customs-office':'parcel-customs-notice',
  'postal-operator':'parcel-damaged-delivery',
  'personal-data-operator':'privacy-own-record privacy-restricted-access',
  'duty-service':'hatch hatch-location',
  'phyto-office':'seedlings-batch seedlings-electronic seedlings-lab-not-certificate',
  'sfr-office':'sickpay-data sickpay-refusal-notice',
  'road-owner':'sidewalk-restoration sidewalk-safe-detour sidewalk-updated-permit',
  'municipal-signs':'sign-night-measurement sign-promotion',
  'transport-local':'signal-night-fault signal-other-crossing signal-timing-proposal signal-visibility',
  'tax-office':'tax-amended-declaration tax-calendar-months tax-explanations-only tax-simplified-statement',
  'green-local':'trees-permit-matches trees-pruning-scope',
};
const internalCases = Object.fromEntries(Object.entries(internalByRecipient).map(([id,cases])=>[id,new Set(cases.split(' '))]));
export function isInternalRoutingPath(caseId,id) {
  const authority=canonicalId(id);
  return INTERNAL_PATHS.has(authority)||Boolean(internalCases[authority]?.has(caseId));
}
const STREETS = [
  ['Садовая','Sadovaya','花园'], ['Лесная','Lesnaya','森林'],
  ['Центральная','Tsentralnaya','中央'], ['Школьная','Shkolnaya','学校'],
  ['Парковая','Parkovaya','公园'], ['Полевая','Polevaya','田野'],
];
function caseHash(caseId) {
  let value = 0;
  for (const character of caseId) value = (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0;
  return value;
}

function correspondence(caseId) {
  const seed = caseHash(caseId);
  const fixed = Object.hasOwn(CORRESPONDENCE_OVERRIDES, caseId);
  const territoryId = fixed ? CORRESPONDENCE_OVERRIDES[caseId] : CORRESPONDENCE_TERRITORIES[seed % CORRESPONDENCE_TERRITORIES.length];
  if (territoryId === null) return {territoryId:null,territory:null,city:null,address:null,synthetic:false};
  const {name,city} = ROUTING_TERRITORIES[territoryId];
  const house = seed % 39 + 1;
  const [ru,en,zh] = STREETS[Math.floor(seed / CORRESPONDENCE_TERRITORIES.length) % STREETS.length];
  const address = {ru:`ул. ${ru}, д. ${house}`,en:`${house} ${en} Street`,zh:`${zh}街 ${house} 号`};
  return {territoryId,territory:name,city,address,synthetic:true};
}

export function publicRoutingWorkflow(caseId,{gameplay=false}={}) {
  if (!Object.hasOwn(ROUTING_RECIPIENTS, caseId)) return null;
  const authoredLocation = EVENT_LOCATIONS[caseId];
  const unspecified = ['anonymous-danger','landfill-registry-scope'];
  // A scenario's event region is independent of the correspondence address.
  const simulatedTerritory = CORRESPONDENCE_TERRITORIES[caseHash('event:'+caseId) % CORRESPONDENCE_TERRITORIES.length];
  let location = authoredLocation;
  if (gameplay && !authoredLocation?.territoryId && !unspecified.includes(caseId)) {
    location = {...authoredLocation, territoryId:caseId==='noise-emergency-work'?'ru-77':simulatedTerritory};
  }
  const workflow = {origin:correspondence(caseId),recipientLimit:Math.max(...ROUTING_RECIPIENTS[caseId].map(ids => ids.length))};
  if (location) {
    const region = ROUTING_TERRITORIES[location.territoryId];
    workflow.site = {territoryId:location.territoryId,territory:region?.name || null,city:location.cityKnown ? region.city : null,detail:location.detail || null};
  }
  return workflow;
}

export function validateRoutingWorkflowDecision(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['recipientIds','disposition'].includes(key))) throw new ReceptionError('invalid_decision');
  const {recipientIds,disposition} = value;
  if (!Array.isArray(recipientIds) || recipientIds.length > 2 || recipientIds.some(id => typeof id !== 'string' || !ID.test(id) || !ROUTING_AUTHORITY_IDS.has(id)) ||
      new Set(recipientIds.map(canonicalId)).size !== recipientIds.length) throw new ReceptionError('invalid_decision');
  if (disposition!==undefined && !(disposition==='internal' && !recipientIds.length ||
    disposition==='forward' && recipientIds.length)) throw new ReceptionError('invalid_decision');
  return {recipientIds:[...recipientIds],...(disposition?{disposition}:{})};
}

export function evaluateRoutingWorkflow(caseId, value) {
  if (!Object.hasOwn(ROUTING_RECIPIENTS, caseId)) return null;
  const {recipientIds,disposition} = validateRoutingWorkflowDecision(value);
  const variants = ROUTING_RECIPIENTS[caseId];
  const chosen = recipientIds.map(canonicalId);
  const matching = variants.find(ids=>{
    const internal=ids.every(id=>isInternalRoutingPath(caseId,id));
    if(disposition==='internal')return internal;
    return !(disposition==='forward'&&internal)&&ids.length===chosen.length&&ids.every(id=>chosen.includes(id));
  });
  return {correct:Boolean(matching),expectedRecipients:(matching || variants[0]).map(id => ROUTING_AUTHORITIES[id])};
}
