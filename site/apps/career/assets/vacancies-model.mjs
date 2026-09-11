/** Public, read-only vacancy data. Never contributes to the career score. */
export const PORTAL = 'https://gossluzhba.gov.ru';
export const FEED_SCHEMA = 1;
export const FRESH_MS = 24 * 60 * 60 * 1000;
const GUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const ID = /^[\w.-]{1,120}$/;
export const plain = (s, max = 500) => typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
export function normalizeName(s) {
  return plain(s, 1000).normalize('NFKC').toLowerCase().replace(/ё/g, 'е').replace(/российской федерации/g, 'россии').replace(/[«»"“”'()\[\],.;:–—-]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function officialUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && ['gossluzhba.gov.ru', 'www.gossluzhba.gov.ru'].includes(u.hostname) && !u.username && !u.password && (!u.port || u.port === '443') ? u : null; } catch { return null; }
}
export function vacancyUrl(id) { return typeof id === 'string' && GUID.test(id) ? `${PORTAL}/vacancy/${id.toLowerCase()}` : null; }
export function isoDate(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  // A date without a timezone is a calendar date, not local browser time.
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) { const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s); if (ru) m = ['', ru[3], ru[2], ru[1]]; }
  if (m) { const t = `${m[1]}-${m[2]}-${m[3]}`; const d = new Date(`${t}T00:00:00Z`); return Number.isFinite(+d) && d.toISOString().slice(0, 10) === t ? t : null; }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
  return Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null;
}
export function deadlineTime(s) { const d = isoDate(s); return d ? Date.parse(d.length === 10 ? `${d}T23:59:59.999+03:00` : d) : null; }
export function matchOrganizations(organizations, institutions, overrides = []) {
  const names = new Map();
  for (const a of institutions) {
    const full = typeof a.name === 'object' ? a.name.ru : a.name;
    const values = [full, a.shortName, full&&a.shortName?`${full} (${a.shortName})`:null, ...(a.matchAliases || [])].filter(Boolean);
    for (const value of values) {
      const key = normalizeName(value); if (!key) continue;
      if (!names.has(key)) names.set(key, new Set()); names.get(key).add(a.id);
    }
  }
  const knownIds = new Set(institutions.map(a => a.id));
  return organizations.map(o => {
    const manual = overrides.filter(x => x.sourceId === o.id && x.sourceName === o.name && knownIds.has(x.authorityId) && ['exact', 'territorial', 'subordinate'].includes(x.relation) && /^https:\/\//.test(x.evidenceUrl || ''));
    if (manual.length === 1) return {...o, authorityId: manual[0].authorityId, relation: manual[0].relation, matchMethod: 'reviewed', evidenceUrl: manual[0].evidenceUrl};
    if (manual.length > 1) return {...o, authorityId: null, relation: 'unmapped', matchMethod: 'ambiguous'};
    // NO substring, fuzzy or acronym-in-text matching: an inspectorate is not a ministry.
    const ids = new Set(names.get(normalizeName(o.name)) || []);
    if (ids.size === 1) return {...o, authorityId: [...ids][0], relation: 'exact', matchMethod: 'exact-name'};
    return {...o, authorityId: null, relation: 'unmapped', matchMethod: ids.size > 1 ? 'ambiguous' : 'unmatched'};
  });
}
export function currentStatus(v, now = Date.now()) {
  const s = (v.sourceStatus || '').toLowerCase().replace(/ё/g, 'е');
  if (/закрыт|заверш|отмен|архив|closed|cancel|expired|filled/.test(s)) return 'closed';
  if(/не\s+открыт|не\s+ведется|приостанов|suspend|not\s+open/.test(s))return 'verify';
  const until = deadlineTime(v.deadline);
  if (until !== null && until < now) return 'expired';
  const seen = Date.parse(v.lastSeenAt);
  if (!Number.isFinite(seen) || now - seen > FRESH_MS || seen > now + 300000) return 'stale';
  const from = isoDate(v.acceptFrom);
  if (from && Date.parse(from.length === 10 ? `${from}T00:00:00+03:00` : from) > now) return 'upcoming';
  // Numeric status codes are never interpreted without an observed label.
  if (until !== null && (from || /^(?:прием (?:документов|заявок)(?: открыт| ведется)?|открыт(?:а|о)?|accepting|open)$/.test(s.trim()))) return 'accepting';
  return 'verify';
}
export function validateFeed(feed) {
  const errors = [];
  if (!feed || feed.schemaVersion !== FEED_SCHEMA || feed.source !== PORTAL || !Array.isArray(feed.organizations) || !Array.isArray(feed.vacancies)) return ['invalid-feed-envelope'];
  if (feed.organizations.length > 50000 || feed.vacancies.length > 100000) return ['feed-too-large'];
  if (!['unavailable', 'not_connected', 'ready', 'partial'].includes(feed.state)) errors.push('invalid-feed-state');
  if (feed.vacancies.length && !isoDate(feed.lastSuccessAt)) errors.push('missing-observation-time');
  const orgs = new Map();
  for (const o of feed.organizations) {
    if (!o || typeof o.id !== 'string' || !ID.test(o.id) || !plain(o.name) || orgs.has(o.id)) errors.push('invalid-or-duplicate-organization');
    else orgs.set(o.id, o);
    if (o?.authorityId && !['exact', 'territorial', 'subordinate'].includes(o.relation)) errors.push('invalid-relationship');
  }
  const ids = new Set();
  for (const v of feed.vacancies) {
    if (!v || !vacancyUrl(v.id) || !plain(v.title) || !orgs.has(v.organizationId) || ids.has(v.id)) errors.push('invalid-or-duplicate-vacancy');
    ids.add(v?.id);
    if (v?.url !== vacancyUrl(v?.id) || !isoDate(v?.lastSeenAt)) errors.push('invalid-vacancy-provenance');
    for (const key of ['deadline', 'acceptFrom', 'publishedAt']) if (v?.[key] && !isoDate(v[key])) errors.push(`invalid-${key}`);
  }
  return [...new Set(errors)];
}
export function selectVacancies(feed, {authorityIds = [], includeTerritorial = false, query = '', now = Date.now(), includeClosed = false} = {}) {
  if (validateFeed(feed).length) return [];
  const wanted = new Set(authorityIds), orgs = new Map(feed.organizations.map(o => [o.id, o]));
  const order = new Map(authorityIds.map((id, i) => [id, i]));
  return feed.vacancies.flatMap(v => {
    const org = orgs.get(v.organizationId);
    if (!org.authorityId || !wanted.has(org.authorityId) || (org.relation !== 'exact' && !(includeTerritorial && org.relation === 'territorial'))) return [];
    const status = currentStatus(v, now);
    if (!includeClosed && ['closed', 'expired'].includes(status)) return [];
    if (query && !normalizeName([v.title, org.name, v.location, v.department].join(' ')).includes(normalizeName(query))) return [];
    return [{...v, organization: org, status}];
  }).sort((a, b) => (order.get(a.organization.authorityId) - order.get(b.organization.authorityId)) || ((a.status === 'accepting' ? 0 : 1) - (b.status === 'accepting' ? 0 : 1)) || a.title.localeCompare(b.title, 'ru'));
}
