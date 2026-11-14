import backgrounds from './participant-backgrounds.json' with {type:'json'};
// Participant-visible facts only. This module must never read evaluator fields.
const EVENT_IDS = new Set(['sent', 'received', 'registered']);
const text = (value, locale) => typeof value === 'string' ? value :
  value && typeof value === 'object' && typeof (value[locale] || value.ru) === 'string' ? value[locale] || value.ru : undefined;
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const LANGUAGES = ['ru','en','zh'];
const LIMITS = {
  ru: 'Бытовой фон помогает объяснить личную цель и последовательность событий. Он не является новым доказательством, правовым выводом, сроком или требованием к работе студента. Сохраняйте исходные факты. Если точная дата прежнего обращения не установлена, расскажите известную последовательность событий, не подставляя дату текущей жалобы. Не придумывайте адреса организаций, согласия, поданные заявления или ответы органов.',
  en: 'Personal background explains everyday purpose and event sequence. It is not new evidence, a legal finding, a deadline or a grading requirement. Preserve canonical facts. If the exact date of an earlier contact is not established, explain the known sequence without substituting the current complaint date. Do not invent organization addresses, consents, submitted applications or authority replies.',
  zh: '生活背景用于说明个人目的和事件顺序，不构成新证据、法律结论、期限或评分要求。须保留原有事实。若先前联系的确切日期未确定，应说明已知顺序，不得套用本次投诉的日期。不得编造机构地址、同意、已提交的申请或机关答复。'
};
const MFC_LOCATION = {ru:'МФЦ в Красногорске, Московская область',en:'an MFC in Krasnogorsk, Moscow Oblast',zh:'莫斯科州克拉斯诺戈尔斯克的多功能中心（MFC）'};

export function buildParticipantContext(c, locale = 'ru') {
  const language = LANGUAGES.includes(locale) ? locale : 'ru';
  const source = c?.public?.assessment?.calendar?.events;
  const events = Array.isArray(source) ? source.flatMap(event => {
    if (!event || !EVENT_IDS.has(event.id) || !validDate(event.date)) return [];
    const label = text(event.label, language);
    return typeof label === 'string' && label.trim() ? [{id: event.id, label, date: event.date}] : [];
  }) : [];
  const result = {currentAppeal: {scope: 'current_appeal', events}};
  const background = Object.hasOwn(backgrounds.cases,c?.id) ? backgrounds.cases[c.id] : undefined;
  const sourceMatches = !c?.provenance?.sourceSHA256 || c.provenance.sourceSHA256 === background?.sourceSHA256;
  if (background && sourceMatches) {
    result.conversationalBackground = {version: backgrounds.version, optional: true, evidentiary: false,
      ...Object.fromEntries(['service','purpose','priorContact'].map(field => [field,text(background[field],language)])),
      limits: LIMITS[language]};
    // Preserve the previously agreed scene without treating a postal address as
    // the MFC branch address. Other locations come from the existing workbook.
    if(c.id === 'mfc-second-demand') Object.assign(result.conversationalBackground,
      {location:MFC_LOCATION[language],branchAddressKnown:false});
  }
  return result;
}
