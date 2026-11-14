// Participant-visible facts only. This module must never read evaluator fields.
const EVENT_IDS = new Set(['sent', 'received', 'registered']);
const text = (value, locale) => typeof value === 'string' ? value :
  value && typeof value === 'object' && typeof (value[locale] || value.ru) === 'string' ? value[locale] || value.ru : undefined;
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const BACKGROUND = {
  ru: {
    service: 'получение выписки из ЕГРН о своей квартире',
    purpose: 'упорядочить личные документы на недвижимость',
    currentComplaint: 'Текущее обращение касается нового требования документов со стороны МФЦ, а не рассмотрения самой услуги Росреестра.',
    limits: 'Это необязательный бытовой фон, а не доказательство. Дата первоначального заявления на услугу неизвестна. Даты ниже относятся только к текущему обращению; не выводите из них другие даты или сроки.'
  },
  en: {
    service: 'obtaining an EGRN property-register extract for their own apartment',
    purpose: 'organizing personal property documents',
    currentComplaint: 'The current complaint concerns a new document demand by the MFC, rather than the substantive Rosreestr service.',
    limits: 'This is optional conversational background, not evidence. The original service application date is unknown. The dates below concern only the current appeal; do not infer other dates or deadlines.'
  },
  zh: {
    service: '获取本人公寓的不动产统一登记簿（EGRN）摘录',
    purpose: '整理个人房产文件',
    currentComplaint: '本次投诉针对多功能中心（MFC）新提出的材料要求，而非俄罗斯不动产登记局服务本身的办理。',
    limits: '这只是可选的生活背景，不是证据。最初申请该服务的日期未知。以下日期仅属于本次申诉，不得据此推断其他日期或期限。'
  }
};

export function buildParticipantContext(c, locale = 'ru') {
  const language = Object.hasOwn(BACKGROUND, locale) ? locale : 'ru';
  const source = c?.public?.assessment?.calendar?.events;
  const events = Array.isArray(source) ? source.flatMap(event => {
    if (!event || !EVENT_IDS.has(event.id) || !validDate(event.date)) return [];
    const label = text(event.label, language);
    return typeof label === 'string' && label.trim() ? [{id: event.id, label, date: event.date}] : [];
  }) : [];
  const result = {currentAppeal: {scope: 'current_appeal', events}};
  if (c?.id === 'mfc-second-demand') {
    result.conversationalBackground = {optional: true, evidentiary: false, ...BACKGROUND[language]};
  }
  return result;
}
