/** Task-specific legal identifiers. Parsing never substitutes the type of instrument. */
const refText=value=>String(value??'').normalize('NFKC').toLowerCase().trim();
export function referenceFields(knowledge={}){
 const order=knowledge.actType==='order',rf=knowledge.actType==='rfLaw',code=knowledge.actType==='code',clause=knowledge.unitKind==='clause',resolution=knowledge.actType==='resolution';
 return {number:resolution?'Номер постановления':order?'Номер приказа':rf?'Номер Закона РФ':code?(knowledge.codePart?'Часть кодекса или номер закона о её принятии':'Кодекс или номер закона о его принятии'):'Номер федерального закона',
 date:resolution?'Дата постановления':order?'Дата приказа':rf?'Дата Закона РФ':code?(knowledge.codePart?'Дата принятия части кодекса':'Дата принятия кодекса'):'Дата принятия закона',
 unit:clause?'Пункт':'Статья',numberHint:resolution?'Номер без суффикса ФЗ':order?'Номер без суффикса ФЗ':rf?'Например: 2300-1':code?(knowledge.codePart?'Название и часть кодекса либо номер закона':'Название кодекса либо номер закона о его принятии'):'Например: 59-ФЗ',unitHint:clause?'Например: 99.2':'Номер статьи'};
}
export function referenceNumber(value,knowledge={}){
 const raw=refText(value);
 if(knowledge.actType==='rfLaw'){
  // The Russian Federation Law No.2300-1 predates the modern -ФЗ naming form.
  // Historical Roman I is accepted, but a fabricated -ФЗ suffix is not.
  if(/фз|федеральн|приказ|кодекс|\bот\b/i.test(raw))return '';
  const s=raw.replace(/^закон(?:\s+(?:рф|российской\s+федерации))?\s*/,'').replace(/^(?:№|no\.?|n°|номер)\s*/,'').replace(/\s/g,'').replace(/[–—−]/g,'-').replace(/-[iі]$/,'-1');
  return /^\d+-\d+$/.test(s)?s.replace(/^0+(?=\d)/,''):'';
 }
 if(knowledge.actType==='resolution'){
  if(/фз|федеральн|закон|приказ|\bот\b/i.test(raw))return '';
  const s=raw.replace(/^постановление(?:\s+правительства(?:\s+(?:рф|российской\s+федерации|россии))?)?\s*/,'').replace(/^(?:№|no\.?|n°|номер)\s*/,'').replace(/\s/g,'');
  return /^\d+$/.test(s)?s.replace(/^0+(?=\d)/,''):'';
 }
 if(knowledge.actType==='code'){
  if(!knowledge.codePart){
   const aliases=[knowledge.codeName,...(knowledge.codeAliases||[])].filter(Boolean).map(refText);
   if(aliases.includes(raw))return String(knowledge.number);
   if(/кодекс|\bгпк\b|\bнк\b|\bкаc\b|\bкас\b|\bапк\b|част|ч\.|приказ|постановлен/.test(raw))return '';
   const s=raw.replace(/^федеральный\s+закон\s*/,'').replace(/^(?:№|no\.?|n°|номер)\s*/,'').replace(/\s/g,'').replace(/[-–—]?фз$/,'');
   return /^\d+$/.test(s)?s.replace(/^0+(?=\d)/,''):'';
  }

  if(/приказ|постановлен|закон\s+рф|2300/.test(raw))return '';
  // A named code is unambiguous only when its part is identified.
  const named=raw.match(/^(?:налоговый\s+кодекс(?:\s+(?:рф|российской\s+федерации))?|нк(?:\s+рф)?)\s*[,;(]?\s*(?:часть|ч\.)\s*(первая|первой|вторая|второй|1|2|i|ii)\s*\)?$/);
  const reversed=raw.match(/^(?:часть|ч\.)\s*(первая|первой|вторая|второй|1|2|i|ii)\s+(?:налогового\s+кодекса(?:\s+(?:рф|российской\s+федерации))?|нк(?:\s+рф)?)$/);
  const marker=(named||reversed)?.[1];
  if(marker){const part=/^(?:первая|первой|1|i)$/.test(marker)?1:2;return part===Number(knowledge.codePart)?String(knowledge.number):'';}
  if(/кодекс|\bнк\b|част|ч\./.test(raw))return '';
  const number=raw.replace(/^федеральный\s+закон\s*/,'').replace(/^(?:№|no\.?|n°|номер)\s*/,'').replace(/\s/g,'').replace(/[-–—]?фз$/,'');
  return /^\d+$/.test(number)?number.replace(/^0+(?=\d)/,''):'';
 }
 if(knowledge.actType==='order'){
  if(/фз|федеральн|закон|\bот\b/i.test(raw))return '';
  const s=raw.replace(/^приказ(?:\s+минтранса(?:\s+(?:россии|рф))?)?\s*/,'').replace(/^(?:№|no\.?|n°|номер)\s*/,'').replace(/\s/g,'');
  return /^\d+$/.test(s)?s.replace(/^0+(?=\d)/,''):'';
 }
 return raw.replace(/[\s№]/g,'').replace(/^(?:no\.?|n°|номер)/,'').replace(/[-–—]?фз$/,'').replace(/^0+(?=\d)/,'');
}
export function referenceUnit(value,knowledge={}){
 let s=refText(value).replace(',', '.');
 if(knowledge.unitKind==='clause'){
  s=s.replace(/^(?:пункт|пункта|п\.)\s*/,'').replace(/^(\d+)\s*\(\s*(\d+)\s*\)$/,'$1.$2');
  return /^\d+(?:\.\d+)*$/.test(s)?s:'';
 }
 const explicit=s.match(/(?:статья|статьи|ст\.)\s*(\d+(?:\.\d+)?)/);
 return explicit?explicit[1]:/^\d+(?:\.\d+)?$/.test(s)?s:'';
}
export function formatReference(knowledge={}){
 const date=/^\d{4}-\d{2}-\d{2}$/.test(knowledge.actDate||'')?knowledge.actDate.split('-').reverse().join('.'):String(knowledge.actDate||'');
 let instrument;
 if(knowledge.actType==='resolution')instrument=`постановление ${(knowledge.issuer||'Правительство РФ').replace(/^Правительство/, 'Правительства')} от ${date} № ${knowledge.number}`;
 else if(knowledge.actType==='order')instrument=`приказ № ${knowledge.number} от ${date}${knowledge.issuer?` (${knowledge.issuer})`:''}`;
 else if(knowledge.actType==='rfLaw')instrument=`Закон РФ от ${date} № ${knowledge.number}`;
 else if(knowledge.actType==='code')instrument=`${knowledge.codeName||'Кодекс'}${knowledge.codePart?', часть '+(Number(knowledge.codePart)===2?'вторая':'первая'):''} (от ${date} № ${knowledge.number}-ФЗ)`;
 else instrument=`федеральный закон № ${knowledge.number}-ФЗ от ${date}`;
 return `${instrument}, ${knowledge.unitKind==='clause'?'пункт':'статья'} ${(knowledge.articles||[]).join(' или ')}`;
}
