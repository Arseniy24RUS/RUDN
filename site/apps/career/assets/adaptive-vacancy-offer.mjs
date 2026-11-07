import {vacancySalaryText, vacancyStatusText} from './adaptive-vacancy-pay.mjs';
import {createEmployerVacancyBank, platformEmployerId, vacancyBankStatus} from './employer-vacancies-bank.mjs';
import {E, L} from './journey-visuals.mjs';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const DETAIL_PAGE = /^career-vacancy-details\/(pages\/[a-f0-9]{2}\/[a-f0-9]{24}\/p(\d{4})-[a-f0-9]{16})(?:\.part\d{4})?\.json\.gz$/;
const cacheKey = row => [row.id, row.employerId, row.sourcePath, row.sourceURL].join('|');

function candidatePage(row) {
  if (row.sourceType !== 'bank' || row.archive === true || !UUID.test(row.id || '')) return null;
  const match = DETAIL_PAGE.exec(row.sourcePath || '');
  if (!match) return null;
  try {
    return {employerId:platformEmployerId(row.employerId), path:match[1] + '.json.gz', index:Number(match[2])};
  } catch {return null;}
}

function offerContent(candidate, source) {
  const status = source ? vacancyBankStatus(source)
    : candidate.archive === true || candidate.status === 'archived' ? 'archived'
    : candidate.status === 'profile' ? 'profile' : 'unknown';
  const label = status === 'profile' ? L('Профиль должности', 'Role profile', '职位资料') : vacancyStatusText(status);
  const pay = status === 'source-active' ? `<span class="adaptive-vacancy-salary" data-adaptive-vacancy-salary><span>${L('Зарплата:', 'Salary:', '薪资：')}</span> <strong>${E(vacancySalaryText(source))}</strong></span>` : '';
  return `<span class="adaptive-vacancy-status" data-adaptive-vacancy-status="${status}">${E(label)}</span>${pay}`;
}

/** Fetch only the base pages identified by visible cards. Requests for different
 * pages of one employer are serialized because the bank has one active page per head. */
export function createAdaptiveVacancyOffers() {
  const bank = createEmployerVacancyBank({maxEmployers:8, maxPages:12, maxConcurrent:2});
  const cache = new Map(), active = new Map();
  let target = null, visible = new Map(), queued = new Map();

  function markup(row) {
    return `<div class="adaptive-vacancy-offer" data-adaptive-vacancy-offer="${E(row.id)}">${offerContent(row, cache.get(cacheKey(row)))}</div>`;
  }

  function hasVisibleCards() {
    return !__careerHost.destroyed && target?.isConnected && !target.closest('[hidden]') &&
      target.querySelector('[data-adaptive-vacancy-offer]');
  }

  function refresh() {
    if (!hasVisibleCards()) return;
    for (const slot of target.querySelectorAll('[data-adaptive-vacancy-offer]')) {
      const row = visible.get(slot.dataset.adaptiveVacancyOffer);
      if (row) slot.innerHTML = offerContent(row, cache.get(cacheKey(row)));
    }
  }

  function remember(row, source) {
    const key = cacheKey(row);
    cache.delete(key);
    cache.set(key, source ? {
      archive:source.archive, state:source.state, expiresAt:source.expiresAt,
      salaryFrom:source.salaryFrom, salaryTo:source.salaryTo
    } : null);
    while (cache.size > 128) cache.delete(cache.keys().next().value);
  }

  async function load(job) {
    try {
      const view = await bank.loadPage(job.employerId, job.index);
      if (job.cancelled || __careerHost.destroyed) return;
      const matchingPage = view?.status === 'ready' && view.pageIndex === job.index &&
        view.descriptor?.authorityId === job.employerId && view.descriptor.pages[job.index]?.path === job.path;
      const candidates = [...job.rows, ...(queued.get(job.key)?.rows || [])];
      queued.delete(job.key);
      for (const row of candidates) {
        const source = matchingPage && view.descriptor.employerId === row.employerId
          ? view.rows.find(item => item.id === row.id && item.sourceURL === row.sourceURL) : null;
        remember(row, source);
      }
      refresh();
    } finally {
      active.delete(job.employerId);
      pump();
    }
  }

  function pump() {
    if (!hasVisibleCards()) return;
    while (active.size < 2) {
      const job = [...queued.values()].find(item => !active.has(item.employerId));
      if (!job) return;
      queued.delete(job.key);
      active.set(job.employerId, job);
      void load(job);
    }
  }

  function enrich(root, rows) {
    target = root;
    visible = new Map(rows.map(row => [row.id, row]));
    queued = new Map();
    for (const row of visible.values()) {
      if (cache.has(cacheKey(row))) continue;
      const page = candidatePage(row);
      if (!page) continue;
      const key = page.employerId + '|' + page.path;
      if (!queued.has(key)) queued.set(key, {...page, key, rows:[]});
      queued.get(key).rows.push(row);
    }
    for (const job of active.values()) {
      if (queued.has(job.key)) continue;
      job.cancelled = true;
      bank.cancel(job.employerId);
    }
    refresh();
    pump();
  }

  return {markup, enrich};
}
