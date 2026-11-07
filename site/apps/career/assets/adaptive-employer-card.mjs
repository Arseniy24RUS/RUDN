import {authorityName} from './authority-names.mjs';
import {authorityEmblem} from './authority-symbols.mjs';
import {getLanguage, translate} from './i18n.mjs';
import {E, L, icon, safeURL} from './journey-visuals.mjs';
import {loadJSON} from './loader.mjs';
import {createAdaptiveVacancyOffers} from './adaptive-vacancy-offer.mjs';

const exactName = value => typeof value === 'string'
  ? value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
  : '';
const sourceLanguage = value => getLanguage() !== 'ru' && /[А-Яа-яЁё]/.test(value) ? ' lang="ru"' : '';
const regionalPath = id => /^ru-\d{2}$/.test(id || '')
  ? `data/territorial-authorities/${id}.json`
  : 'data/territorial-authorities/national.json';

function authorityIndex(authorities) {
  const ids = new Map();
  const names = new Map();
  for (const authority of authorities) {
    if (!authority?.id || !authority.name) continue;
    ids.set(authority.id, authority);
    const aliases = Array.isArray(authority.matchAliases) ? authority.matchAliases : [];
    const fullAndShort = authority.shortName ? `${authority.name} (${authority.shortName})` : '';
    for (const value of [authority.name, authority.shortName, fullAndShort, ...aliases]) {
      const key = exactName(value);
      if (!key) continue;
      if (!names.has(key)) names.set(key, authority);
      else if (names.get(key)?.id !== authority.id) names.set(key, null);
    }
  }
  return {ids, names};
}

function publicServiceAuthorities(records) {
  return records.map(record => ({
    id:record.id,
    name:record.name?.ru,
    localizedName:record.name,
    mission:record.mission,
    descriptionSources:record.sources
  }));
}

function briefMarkup(authority) {
  if (!authority) return '';
  const mission = typeof authority.mission === 'string' ? authority.mission
    : authority.mission?.[getLanguage()] || authority.mission?.ru;
  const paragraphs = [...new Set([mission, ...(authority.descriptionParagraphs || [])]
    .filter(value => typeof value === 'string' && value.trim()))].slice(0, 2);
  if (!paragraphs.length) return '';
  const sources = (authority.descriptionSources || []).filter(source => safeURL(source?.url)).slice(0, 2);
  return `<details class="adaptive-employer-brief"><summary>${L('Об органе и его задачах', 'About the employer and its work', '机构与职责')}</summary>
    <div>${paragraphs.map(paragraph => {
      const text = translate(paragraph);
      return `<p${sourceLanguage(text)}>${E(text)}</p>`;
    }).join('')}${sources.map(source => `<a href="${safeURL(source.url)}" target="_blank" rel="noopener noreferrer">${L('Источник описания', 'Description source', '描述来源')}${icon('external')}</a>`).join('')}</div></details>`;
}

export function createAdaptiveEmployerCards(authorities = []) {
  const federal = authorityIndex(authorities);
  const offers = createAdaptiveVacancyOffers();
  const paths = new Map();
  const supplementary = new Map();
  const publicServicePath = 'data/public-service.json';
  const loading = [Promise.resolve(), Promise.resolve()];
  let nextLoader = 0;

  function resolve(row) {
    const regional = supplementary.get(regionalPath(row.regionId));
    const publicService = supplementary.get(publicServicePath);
    const indexes = [federal, regional, publicService].filter(Boolean);
    for (const index of indexes) {
      const exact = index.ids.get(row.employerId);
      if (exact) return exact;
    }
    const name = exactName(row.employerName);
    if (indexes.some(index => index.names.get(name) === null)) return null;
    const known = new Map(indexes.map(index => index.names.get(name)).filter(Boolean).map(authority => [authority.id, authority]));
    return known.size === 1 ? known.values().next().value : null;
  }

  function nameMarkup(row, authority, compact) {
    const title = authorityName(authority) || row.employerName || L('Орган не указан', 'Employer not specified', '未注明用人单位');
    const tag = compact ? 'h3' : 'h2';
    return `${authority ? authorityEmblem(authority, 'compact') : ''}<${tag} class="adaptive-employer-name"${sourceLanguage(title)}>${E(title)}</${tag}>`;
  }

  function markup(row, compact = false) {
    const authority = resolve(row);
    return {
      heading:`<div class="adaptive-employer-heading" data-adaptive-employer-heading="${E(row.id)}" data-adaptive-employer-compact="${compact}"${authority ? ' data-adaptive-employer-resolved' : ''}>${nameMarkup(row, authority, compact)}</div>`,
      brief:`<div data-adaptive-employer-brief-slot="${E(row.id)}"${authority ? ' data-adaptive-employer-resolved' : ''}>${briefMarkup(authority)}</div>`,
      offer:offers.markup(row)
    };
  }

  function load(path) {
    if (!paths.has(path)) {
      const isPublicService = path === publicServicePath;
      const loader = nextLoader++ % loading.length;
      const request = loading[loader].then(() => loadJSON(path, {
        validate:payload => Array.isArray(isPublicService ? payload?.records : payload?.authorities)
      })).then(payload => {
        const records = isPublicService ? publicServiceAuthorities(payload.records) : payload.authorities;
        supplementary.set(path, authorityIndex(records));
      }).catch(() => {});
      loading[loader] = request;
      paths.set(path, request);
    }
    return paths.get(path);
  }

  async function enrich(root, rows) {
    offers.enrich(root, rows);
    const unresolved = new Map(rows.filter(row => !resolve(row)).map(row => [row.id, row]));
    if (!unresolved.size) return;
    const needed = new Set([publicServicePath, ...[...unresolved.values()].map(row => regionalPath(row.regionId))]);
    await Promise.all([...needed].map(load));
    if (__careerHost.destroyed || !root.isConnected) return;
    for (const heading of root.querySelectorAll('[data-adaptive-employer-heading]:not([data-adaptive-employer-resolved])')) {
      const row = unresolved.get(heading.dataset.adaptiveEmployerHeading);
      const authority = row && resolve(row);
      if (!authority) continue;
      heading.innerHTML = nameMarkup(row, authority, heading.dataset.adaptiveEmployerCompact === 'true');
      heading.setAttribute('data-adaptive-employer-resolved', '');
    }
    for (const slot of root.querySelectorAll('[data-adaptive-employer-brief-slot]:not([data-adaptive-employer-resolved])')) {
      const row = unresolved.get(slot.dataset.adaptiveEmployerBriefSlot);
      const authority = row && resolve(row);
      if (!authority) continue;
      slot.innerHTML = briefMarkup(authority);
      slot.setAttribute('data-adaptive-employer-resolved', '');
    }
  }

  return {markup, enrich};
}
