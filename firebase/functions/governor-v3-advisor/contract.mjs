import {createHash} from 'node:crypto';

export const PRIVATE_ROOT = 'rudn-platform/v1/governorV3Advisor';
export const MODEL = 'gpt-6.1-terra';
export const INTENTS = ['tax','sites','loan','budget','route','compare','event','unknown'];
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
const length = value => Array.from(value).length;
const shortText = (value, limit) => typeof value==='string' && value.trim().length>0 && length(value)<=limit;
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
const validGameContext = value => rows(value,12,line=>shortText(line,600)) &&
  value.reduce((total,line)=>total+length(line),0)<=3600;
const validTurn = value => matches(value,{question:question=>shortText(question,600),answer:answer=>shortText(answer,900)});

export function readRequest(body) {
  if (!matches(body,{requestId:id,attemptId:id,studentKey:value=>value===null || student(value),
      year:value=>int(value,2026,2045),revision:value=>int(value,0,100_000),
      language:value=>['ru','en','zh'].includes(value),
      question:value=>shortText(value,1200),facts:validFacts,
      gameContext:value=>optional(value,validGameContext),history:value=>optional(value,history=>rows(history,3,validTurn))})) invalid();
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

export function readResult(reply,privateValues=[]) {
  if (!matches(reply,{intent:value=>INTENTS.includes(value),answer:value=>shortText(value,1800),model:value=>value===MODEL})) {
    throw new AdvisorError('provider-invalid',502);
  }
  const answer = redact(reply.answer,privateValues);
  if (!answer.replaceAll('[—]','').trim()) throw new AdvisorError('provider-invalid',502);
  return {...reply,answer};
}

const privatePatterns = [
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,
  /\b(?:https?:\/\/|www\.)[^\s<>"'()]+/giu,
  /\bBearer\s+[\w.~+\/=:-]+/gi,
  /\b(?:sk|rk|pk)-[\w-]{10,}\b|\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,
  /(?:\b(?:api[ _-]?key|token|password|secret|uid|email|student[ _-]?key)\b|ключ\s+(?:API|доступа)|пароль|токен|учётный\s+номер|номер\s+(?:зач[её]тки|студ(?:енческого)?(?:\s+билета)?)|密码|令牌|密钥|学号)\s*[:=：]\s*(?:"[^"]*"|'[^']*'|[^\s,;，；]+)/giu,
  /(?:\b(?:home address|full name)\b|домашний\s+адрес|адрес\s+проживания|ФИО|姓名|家庭地址|住址)\s*[:=：]\s*[^.!?;。！？；]{2,150}/giu,
  /(?<!\d)\+\d(?:[\s()（）.-]*\d){9,14}(?!\d)|(?<!\d)(?:\+?7|8)\s*[(（]\d{3}[)）](?:[\s-]*\d){7}(?!\d)|\b\d{8,20}\b/g
];
function redact(value,privateValues) {
  let text = Array.from(value.normalize('NFC'),char=>/[！，。？；：（）]/u.test(char)?char:char.normalize('NFKC')).join('')
    .replace(/\p{Cf}/gu,'').replace(/\p{Cc}/gu,' ');
  for (const marker of privateValues) {
    text = text.replaceAll(marker,'[—]');
  }
  for (const pattern of privatePatterns) text = text.replace(pattern,'[—]');
  return text.replace(/\s+/gu,' ').trim();
}

export function identityMarkers(request,identity) {
  return [...new Set([request.attemptId,request.requestId,request.studentKey,identity.studentKey,identity.uid]
    .filter(value=>typeof value==='string' && value.length>0))];
}

export function providerFacts(request,privateValues=[]) {
  const clean = value => redact(value,privateValues);
  return {
    language:request.language,year:request.year,facts:request.facts,question:clean(request.question),
    gameContext:(request.gameContext??[]).map(clean).filter(Boolean),
    history:(request.history??[]).map(({question,answer})=>({question:clean(question),answer:clean(answer)}))
  };
}
