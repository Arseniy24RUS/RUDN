// Source-present reference codes are identifiers, not Russian prose fallbacks.
// This never permits arbitrary Russian names/words or a code invented by a translator.
export function sourceReferenceCodes(source) {
  return [...String(source).matchAll(/(?:^|[^A-Za-zА-Яа-яЁё0-9_])((?:[А-ЯЁ]{1,3}(?:-| ?)[0-9]+(?:[./-][\dА-ЯЁ]+)*)|(?:\d+(?:-\d+)?-ФЗ))(?=$|[^A-Za-zА-Яа-яЁё0-9_])/gu)].map(match=>match[1]);
}
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const typoEvidence = new Map([
  ['9d4b35f1aca75fc1','cases:CASE_TEMPLATES[court-typo-not-merits].documents[d1].text'],
  ['aabde23667e2c654','evidence-catalog:EVIDENCE_RECORDS[v14-court-typo-not-merits].fragments[material].text'],
]);
/** The one omitted-letter exercise must show the actual two different spellings. */
export function approvedEvidenceLiterals(entry) {
  const context=typoEvidence.get(entry.id);
  if(context&&entry.contexts?.includes(context)&&entry.ru.includes('«Соловёв»')&&entry.ru.includes('«Соловьёв»'))return ['Соловёв','Соловьёв'];
  // This exercise compares the actual А/Б labels on two different plots.
  // Keep those source labels consistent across the diagram, document and reply.
  if(entry.contexts?.some(value=>value.startsWith('cases:CASE_TEMPLATES[trees-other-site].')))
    return [...new Set([...entry.ru.matchAll(/(?<![\p{L}\p{N}_])[АБ](?![\p{L}\p{N}_])/gu)].map(match=>match[0]))];
  if(['1d15dbf70d129544','c236f030c4521c9a'].includes(entry.id)&&entry.contexts?.some(value=>value.startsWith('evidence-catalog:EVIDENCE_TASKS.v16-several-minimum-attachments.extracted.accepted[')))return ['А'];
  return [];
}
export function unapprovedCyrillic(source,translated,{literals=[]}={}) {
  let checked=String(translated).replace(/https?:\/\/\S+/g,'');
  const allowed=[...sourceReferenceCodes(source),...literals.filter(value=>String(source).includes(value))];
  // Chinese normally joins labels/codes without spaces. Latin/Cyrillic letters
  // still delimit the exact identifier; a translated extra code is not allowed.
  for(const literal of allowed)checked=checked.replace(new RegExp('(?<![A-Za-zА-Яа-яЁё0-9_])'+escapeRegExp(literal)+'(?![A-Za-zА-Яа-яЁё0-9_])','gu'),'');
  return /[А-Яа-яЁё]/.test(checked);
}
