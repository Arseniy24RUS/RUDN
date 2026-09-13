// Only authored report fields pass through this adapter. Student reflection and
// identity fields are rendered verbatim by the caller; saved attempts stay intact.
let pending = null;
export async function prepareGovernorReportLocale() {
  if (!pending) pending = Promise.all([
    import('../../apps/governor/locales/zh-Hans.js'),
    import('../../apps/governor/src/i18n.js'),
  ]).catch(error => { pending = null; throw error; });
  await pending;
}
export function governorReportValue(value, locale = 'ru') {
  const selected = value && typeof value === 'object'
    ? value[locale] ?? value.ru ?? value.en ?? '—'
    : value ?? '—';
  return globalThis.GovernorGame?.I18n?.authored?.(selected, locale) ?? selected;
}
export function governorReceiptState(status, legacyPending) {
  if (status?.state && status.state !== 'empty') {
    if (status.state === 'saved') return 'submitted';
    if (status.state === 'unsafe') return 'unsafe';
    if (status.state === 'conflict') return 'conflict';
    return 'pending';
  }
  return legacyPending === true ? 'pending' : legacyPending === false ? 'submitted' : 'saved';
}
