import {createHash} from 'node:crypto';

export const PRIVATE_ROOT = 'rudn-platform/v1/governorV3Advisor';
export const INTENTS = ['tax','sites','loan','budget','route','compare','unknown'];
export class AdvisorError extends Error {
  constructor(code,status) {super(code);this.code=code;this.status=status;}
}
const invalid = () => {throw new AdvisorError('invalid-request',400);};
const isObject = value => value && typeof value==='object' && !Array.isArray(value);
const sites = ['yard','bridge','south','remote-cluster','district-centre','transport-junction','upstream','river-towns','delta-corridor',
  'old-industrial-city','small-town-belt','logistics-corridor','central-hub','outer-district','split-counters'];
const id = value => typeof value==='string' && /^[A-Za-z0-9_-]{16,80}$/.test(value);
const student = value => typeof value==='string' && /^\d{5,20}$/.test(value);
const int = (value,min,max) => Number.isSafeInteger(value) && value>=min && value<=max;
const number = (value,min,max) => Number.isFinite(value) && value>=min && value<=max;
const money = value => int(value,-1_000_000,1_000_000);
const quantity = value => int(value,0,10_000_000);
const year = value => int(value,2026,2075);
const district = value => ['suburb','north','river','industrial','capital'].includes(value);
const taxMode = value => ['low','moderate','high'].includes(value);
const optional = (value, rule) => value===undefined || rule(value);
const rows = (value, length, check) => Array.isArray(value) && value.length<=length && value.every(check);
export function hash(text) {return createHash('sha256').update(text).digest('hex');}
function matches(value, schema) {
  return isObject(value) && Object.keys(value).every(key=>Object.hasOwn(schema,key)) &&
    Object.entries(schema).every(([key,check])=>check(value[key]));
}
const validTax = row => matches(row,{mode:taxMode,annualMln:money,supportDelta:value=>optional(value,n=>number(n,-100,100))});
const validSite = row => matches(row,{id:value=>sites.includes(value),capex:value=>int(value,0,1_000_000),annualOpex:value=>int(value,0,1_000_000),openingYear:year,served:quantity,demand:quantity}) && row.served<=row.demand;
const budgetFields = Object.fromEntries(['cash','cashEnd','reserve','debt','debtLimit','shortfall'].map(key=>[key,value=>optional(value,money)]));
const validFacts = value => matches(value,{
  taxes:value=>optional(value,r=>rows(r,3,validTax)),
  sites:value=>optional(value,r=>rows(r,12,validSite)),
  budget:value=>optional(value,b=>matches(b,budgetFields)),
  route:value=>optional(value,r=>matches(r,{from:district,to:district,pupils:quantity,minutes:n=>number(n,0,240)}))
});

export function readRequest(body) {
  if (!matches(body,{requestId:id,attemptId:id,studentKey:student,
      year:value=>int(value,2026,2045),revision:value=>int(value,0,100_000),
      language:value=>['ru','en','zh'].includes(value),
      question:value=>typeof value==='string' && value.trim().length>0 && Array.from(value).length<=1200,
      facts:validFacts})) invalid();
  return {...body,question:body.question.trim()};
}

export function requestSignature(request) {
  function sorted(value) {
    if (Array.isArray(value)) return value.map(sorted);
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])]));
  }
  const {requestId,studentKey,...data} = request;
  return hash(JSON.stringify(sorted(data)));
}

export function readResult(reply) {
  if (!matches(reply,{intent:value=>INTENTS.includes(value)})) throw new AdvisorError('provider-invalid',502);
  return reply;
}

// These are published gameplay words and not a bag of student-entered tokens.
// The provider never sees arbitrary identifiers, pasted profiles or raw chat.
const gameplayWords = {
  tax: ['налог','ставк','налоговая нагрузка','tax','levy','taxation','税','税负','税率'],
  sites: ['участ','площад','школ','стро','здание','site','plot','school','build','construction','选址','学校','建设'],
  loan: ['заём','заем','займ','долг','кредит','процент','погаш','loan','debt','borrow','repay','interest','贷款','借款','债务','利息'],
  budget: ['бюджет','казн','резерв','дефицит','расход','остат','бюджета','budget','reserve','cash','deficit','expend','funds','财政','预算','赤字','储备'],
  route: ['дорог','маршрут','мост','переправ','подвоз','карта','транспорт','route','bridge','bus','road','map','transport','道路','过河','路线','桥','校车','地图'],
  compare: ['сравн','альтернатив','лучш','стратег','один или','дешев','быстр','compare','alternative','tradeoff','versus','strategy','best','比较','方案','策略','更好','区别']
};
export function providerFacts(request) {
  const text = request.question.normalize('NFKC').toLocaleLowerCase(request.language);
  const terms = Object.entries(gameplayWords).flatMap(([intent,words])=>words.filter(word=>text.includes(word)).map(word=>({intent,word})));
  return {language:request.language, year:request.year, facts:request.facts, terms:terms.slice(0,24)};
}
