/** Group original text tasks without changing question IDs or classroom indices. */
export function documentTaskGroups(bank,catalog){
  const documents=new Map((catalog?.documents||[]).map(doc=>[doc.id,doc])),groups=new Map();
  for(const [index,task] of (bank?.classroom||[]).entries()){
    if(task.kind!=='text')continue;
    if(!groups.has(task.docId)){
      const doc=documents.get(task.docId);
      groups.set(task.docId,{docId:task.docId,title:doc?.shortTitle||doc?.title||task.docId,tasks:[]});
    }
    groups.get(task.docId).tasks.push({task,index});
  }
  return [...groups.values()];
}

// The same printed "1." denotes different structural units in these acts.
// Policies follow their own references to "часть" / "пункт", not DOM order.
const articleParts=new Set(['constitution','civil79','corruption273','koap','local33','moscow3','moscow50','municipal25','procurement44','realty218']);
const articlePoints=new Set(['system58','archive122','ekb']);
const standalonePoints=new Set(['goals309','spatial','moscow35']);
const compact=value=>String(value||'').replace(/\s+/gu,' ').trim();
function articleNumber(value){
  const match=compact(value).match(/^(?:КоАП РФ\s+)?Статья\s+(\d+(?:\.\d+)*)(.*)$/iu);
  if(!match||/^\s*[-–—]\s*\d/u.test(match[2])||/[,;]\s*(?:стать[яи]\s*)?\d/iu.test(match[2])||/^\s+(?:и|по)\s+(?:стать[яи]\s*)?\d/iu.test(match[2]))return '';
  return match[1];
}
const topNumber=value=>value.match(/^(\d+(?:[.\-]\d+)*)\.\s/u)?.[1];
const pointNumber=value=>value.match(/^(\d+(?:[.\-]\d+)*)\)\s/u)?.[1];
const letterNumber=value=>value.match(/^([а-яёa-z])\)\s/iu)?.[1];
const note=value=>/^(?:Примечани[ея](?:\s|[.:]|$)|<(?:\d+|\*)>)/iu.test(value);
const otherHeading=value=>/^(?:(?:Глава|Раздел|Подраздел)\s+[\dIVXLCDM]+(?:\s|[.\-]|$)|Приложени[ея](?:\s|$)|§\s*\d+)/iu.test(value);
function quote(value){
  const characters=Array.from(compact(value));
  if(characters.length<=64)return '«'+characters.join('')+'»';
  let shortened=characters.slice(0,64).join('');const space=shortened.lastIndexOf(' ');
  if(space>=32)shortened=shortened.slice(0,space);
  return '«'+shortened+'…»';
}
function articleHeading(unit,title,number){
  const text=compact(unit.text);
  return text===compact(title)||Boolean(number&&articleNumber(text)===number);
}

function sectionLabels(doc,section,units,fallbackLocator=''){
  const labels=new Map();
  const ordered=(section.unitIds||[]).map(id=>units.get(id)).filter(Boolean),number=articleNumber(section.title);
  const article=number?'Ст.'+number:'',base=article||compact(section.title)||compact(fallbackLocator);
  const bodies=ordered.filter(unit=>compact(unit.text)&&!articleHeading(unit,section.title,number));
  let top=null,point=null,subpoint=null,letter=null,notes=false,activeBase=base,articleActive=Boolean(article);
  const parent=()=>[letter,subpoint,point,top?.label,activeBase===article?article:''].filter(Boolean).join(' ');
  for(const unit of ordered){
    const text=compact(unit.text);let label;
    if(articleHeading(unit,section.title,number)){
      top=point=subpoint=letter=null;notes=false;activeBase=base;articleActive=Boolean(article);label=base;
    }else if(unit.tableRow||note(text)||otherHeading(text)){
      top=point=subpoint=letter=null;
      if(note(text))notes=true;
      if(otherHeading(text)){activeBase=text;articleActive=false;notes=false;label=text;}
      else label=[activeBase,quote(text)].filter(Boolean).join(' · ');
    }else{
      const n=topNumber(text),p=pointNumber(text),l=letterNumber(text);
      const topKind=articleActive?(articleParts.has(doc.id)?'Ч.':articlePoints.has(doc.id)?'П.':null):standalonePoints.has(doc.id)?'П.':null;
      if(!notes&&n&&topKind){
        top={kind:topKind,label:topKind+n};point=subpoint=letter=null;label=parent();
      }else if(!notes&&p&&(articleActive||standalonePoints.has(doc.id))){
        point=subpoint=letter=null;
        if(top?.kind==='П.')subpoint='Подп.'+p;else point='П.'+p;
        label=parent();
      }else if(!notes&&l&&(articleActive||standalonePoints.has(doc.id))&&!subpoint){
        letter=(doc.id==='constitution'&&!point?'П.':'Подп.')+'«'+l+'»';label=parent();
      }else if(articleActive&&bodies.length===1&&!notes&&!n&&!p&&!l){label=article+' · текст';}
      else label=[parent()||activeBase,quote(text)].filter(Boolean).join(' · ');
    }
    labels.set(unit.id,label);
  }
  return labels;
}

// Corpus objects are verified once and kept immutable by Corpus.load. Cache
// only derived indices/labels, so rendering N units does not rebuild N maps.
const labelCache=new WeakMap();
function documentLabels(doc){
  const cached=labelCache.get(doc);
  if(cached&&cached.unitsRef===doc.units&&cached.sectionsRef===doc.sections&&cached.unitCount===doc.units.length&&cached.sectionCount===doc.sections.length&&cached.version===doc.version&&cached.sha256===doc.sha256)return cached;
  const units=new Map((doc.units||[]).map(unit=>[unit.id,unit])),sections=new Map(),membership=new Map();
  for(const section of doc.sections||[]){if(!sections.has(section.id))sections.set(section.id,section);for(const id of section.unitIds||[])if(!membership.has(id))membership.set(id,section);}
  const result={unitsRef:doc.units,sectionsRef:doc.sections,unitCount:doc.units.length,sectionCount:doc.sections.length,version:doc.version,sha256:doc.sha256,units,sections,membership,labels:new WeakMap()};labelCache.set(doc,result);return result;
}
/** A source-based chip label. UTF text and legal numbering are never rewritten. */
export function labelForUnit(doc,unitId){
  if(!doc||!Array.isArray(doc.units)||!Array.isArray(doc.sections))return '';
  if(doc.structural){const descriptor=doc.readerSource?.peekReaderDocument(doc.id,'ru');return descriptor?.labels[unitId]||doc.readerSource?.peekUnit(doc.id,'ru',unitId)?.label||doc.sections.find(section=>section.unitIds.includes(unitId))?.title||'';}
  const cached=documentLabels(doc),target=cached.units.get(unitId);if(!target)return '';
  const section=cached.sections.get(target.sectionId)||cached.membership.get(unitId);
  if(!section)return [compact(target.locator),quote(target.text)].filter(Boolean).join(' · ');
  const cacheable=Boolean(compact(section.title));let labels=cacheable?cached.labels.get(section):null;if(!labels){labels=sectionLabels(doc,section,cached.units,target.locator);if(cacheable)cached.labels.set(section,labels);}
  return labels.get(unitId)||[compact(target.locator)||compact(section.title),quote(target.text)].filter(Boolean).join(' · ');
}
