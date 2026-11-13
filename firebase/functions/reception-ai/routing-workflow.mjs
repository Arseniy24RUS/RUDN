import {ROUTING_AUTHORITIES, ROUTING_TERRITORIES, ROUTING_AUTHORITY_ALIASES, ROUTING_AUTHORITY_IDS} from './routing-directory.mjs';
import {ROUTING_RECIPIENTS, CORRESPONDENCE_TERRITORIES, CORRESPONDENCE_OVERRIDES, EVENT_LOCATIONS} from './routing-cases.mjs';
import {ReceptionError} from './schema.mjs';

const ID = /^[a-z0-9][a-z0-9-]{0,255}$/;
const canonicalId = id => Object.hasOwn(ROUTING_AUTHORITY_ALIASES,id) ? ROUTING_AUTHORITY_ALIASES[id] : id;
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

export function publicRoutingWorkflow(caseId) {
  if (!Object.hasOwn(ROUTING_RECIPIENTS, caseId)) return null;
  const location = EVENT_LOCATIONS[caseId];
  const workflow = {origin:correspondence(caseId),recipientLimit:Math.max(...ROUTING_RECIPIENTS[caseId].map(ids => ids.length))};
  if (location) {
    const region = ROUTING_TERRITORIES[location.territoryId];
    workflow.site = {territoryId:location.territoryId,territory:region?.name || null,city:location.cityKnown ? region.city : null,detail:location.detail || null};
  }
  return workflow;
}

export function validateRoutingWorkflowDecision(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'recipientIds')) throw new ReceptionError('invalid_decision');
  const {recipientIds} = value;
  if (!Array.isArray(recipientIds) || recipientIds.length > 2 || recipientIds.some(id => typeof id !== 'string' || !ID.test(id) || !ROUTING_AUTHORITY_IDS.has(id)) ||
      new Set(recipientIds.map(canonicalId)).size !== recipientIds.length) throw new ReceptionError('invalid_decision');
  return {recipientIds:[...recipientIds]};
}

export function evaluateRoutingWorkflow(caseId, value) {
  if (!Object.hasOwn(ROUTING_RECIPIENTS, caseId)) return null;
  const {recipientIds} = validateRoutingWorkflowDecision(value);
  const variants = ROUTING_RECIPIENTS[caseId];
  const chosen = recipientIds.map(canonicalId);
  const matching = variants.find(ids => ids.length === chosen.length && ids.every(id => chosen.includes(id)));
  return {correct:Boolean(matching),expectedRecipients:(matching || variants[0]).map(id => ROUTING_AUTHORITIES[id])};
}
