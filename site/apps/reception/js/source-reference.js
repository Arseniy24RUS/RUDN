/** Public document metadata only. Selecting a passage never grades its relevance. */
const MONTHS={января:'01',февраля:'02',марта:'03',апреля:'04',мая:'05',июня:'06',июля:'07',августа:'08',сентября:'09',октября:'10',ноября:'11',декабря:'12'};
const clean=value=>String(value||'').trim();
const unique=values=>[...new Set(values.filter(Boolean))];
function dateOnly(value){
  const match=value.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  const words=value.toLowerCase().match(/\b(\d{1,2})\s+([а-яё]+)\s+(\d{4})/u);
  const date=match?`${match[3]}-${match[2]}-${match[1]}`:words&&MONTHS[words[2]]?`${words[3]}-${MONTHS[words[2]]}-${words[1].padStart(2,'0')}`:'';
  if(!date)return '';
  const parsed=new Date(date+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:'';
}
function hash(value){let result=2166136261;for(const char of value)result=Math.imul(result^char.charCodeAt(0),16777619)>>>0;return result.toString(36);}
export function safeSourceURL(value){
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
/** A stable, serializable citation suitable for a student's local decision draft. */
export function createSourceReference(doc,{units=[],text,url}={}){
  const unitIds=unique(units.map(unit=>clean(unit.id)));
  const locators=unique(units.map(unit=>clean(unit.label||unit.locator||unit.context)));
  const rawText=clean(text===undefined?units.map(unit=>clean(unit.text)).join('\n\n'):text);
  if(!doc?.id||!unitIds.length||!rawText)return null;
  const documentNumber=clean(doc.number);
  const number=(documentNumber.match(/(?:№|\bN)\s*([\d]+[\p{L}\d]*(?:[./-][\p{L}\d]+)*)/u)||[])[1]||'';
  const date=dateOnly(documentNumber)||dateOnly(clean(doc.title));
  const articles=unique(locators.map(locator=>(locator.match(/(?:статья|статьи|ст\.)\s*(\d+(?:\.\d+)?)/iu)||[])[1]));
  // Multiple articles stay in the citation; an ambiguous article field remains blank.
  const article=articles.length===1?articles[0]:'';
  const selectedText=rawText.slice(0,12000);
  return {
    id:`${doc.id}:${hash(unitIds.join('|')+'|'+selectedText)}`,
    docId:clean(doc.id),title:clean(doc.title),documentNumber,number,date,article,
    locator:locators.join(' · '),unitIds,text:selectedText,
    url:safeSourceURL(doc.sourceUrl)||safeSourceURL(url),truncated:rawText.length>selectedText.length,
  };
}
/** Do not overwrite a student's written justification when attaching evidence. */
export function referenceDecisionPatch(reference){
  if(!reference)return {law:{},actDate:''};
  return {law:{...(reference.number?{number:reference.number}:{}),...(reference.article?{article:reference.article}:{})},actDate:reference.date||''};
}

/** Capture only document text, excluding reader buttons, search results and headings. */
export function sourceReferenceFromSelection(selection,paper,doc,resolveUnit,url){
  if(!selection||selection.isCollapsed||!selection.rangeCount||!paper?.contains(selection.anchorNode)||!paper.contains(selection.focusNode))return null;
  const range=selection.getRangeAt(0),units=[],fragments=[];
  for(const element of paper.querySelectorAll('[data-unit]')){
    const text=element.querySelector('.ll-paragraph-text');
    if(!text||!range.intersectsNode(text))continue;
    const part=paper.ownerDocument.createRange();part.selectNodeContents(text);
    if(range.compareBoundaryPoints(0,part)>0)part.setStart(range.startContainer,range.startOffset);
    if(range.compareBoundaryPoints(2,part)<0)part.setEnd(range.endContainer,range.endOffset);
    const value=part.toString().trim();if(!value)continue;
    units.push(resolveUnit(element));fragments.push(value);
  }
  return createSourceReference(doc,{units,text:fragments.join('\n\n'),url});
}
