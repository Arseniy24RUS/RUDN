import {createEmployerVacancyBank, decodeGzip, vacancyBankStatus} from './employer-vacancies-bank.mjs';
import {E, L, date, icon, number, safeURL} from './journey-visuals.mjs';

const DIRECTORY = 'data/vacancies/employer-directory.json.gz';
const MAX_PACKED = 1024 * 1024;
const MAX_RAW = 4 * 1024 * 1024;
const EMPLOYERS_PER_VIEW = 20;
const VACANCIES_PER_VIEW = 10;
const EMPLOYER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,246}$/;
const HASH = /^[a-f0-9]{64}$/;
const validCount = value => Number.isSafeInteger(value) && value >= 0;
const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
let sequence = 0;

function validateDirectory(value) {
  if (value?.schemaVersion !== 1 || value.kind !== 'public-vacancy-employer-directory' ||
      !Array.isArray(value.employers) || value.employers.length > 15000 ||
      value.employers.length !== value.employerCount || !validCount(value.jobCount) ||
      !validCount(value.pageCount) || !validCount(value.aliasCount) ||
      !Number.isFinite(Date.parse(value.snapshotAt)) || !HASH.test(value.sourceDatasetSHA256 || '') ||
      !HASH.test(value.employerMapSHA256 || '')) throw new Error('Invalid employer directory');
  const knownIds = new Set();
  const nameCounts = new Map();
  let jobCount = 0, pageCount = 0, aliasCount = 0;
  const employers = value.employers.map(row => {
    if (!Array.isArray(row) || row.length !== 9) throw new Error('Invalid directory row');
    const [id, name, total, archived, notArchived, archiveUnknown, pages, identity, aliases] = row;
    if (typeof id !== 'string' || !EMPLOYER_ID.test(id) || typeof name !== 'string' || !name.trim() ||
        name.length > 4096 || ![total, archived, notArchived, archiveUnknown, pages].every(validCount) ||
        total === 0 || pages === 0 || total !== archived + notArchived + archiveUnknown ||
        (identity !== null && (typeof identity !== 'string' || identity.length > 128)) ||
        !Array.isArray(aliases) || aliases.some(alias => typeof alias !== 'string' || !EMPLOYER_ID.test(alias))) {
      throw new Error('Invalid directory employer');
    }
    for (const key of [id, ...aliases]) {
      if (knownIds.has(key)) throw new Error('Duplicate directory employer ID');
      knownIds.add(key);
    }
    jobCount += total;
    pageCount += pages;
    aliasCount += aliases.length;
    const nameKey = normalize(name);
    nameCounts.set(nameKey, (nameCounts.get(nameKey) || 0) + 1);
    return {id, name, total, archived, archiveUnknown, pages, identity, nameKey, search:normalize([name, id, ...aliases].join(' '))};
  });
  if (jobCount !== value.jobCount || pageCount !== value.pageCount || aliasCount !== value.aliasCount) {
    throw new Error('Directory totals differ');
  }
  return {jobCount, snapshotAt:value.snapshotAt, employers, nameCounts, byId:new Map(employers.map(item => [item.id, item]))};
}

function bankStatusLabel(status) {
  return {
    'source-active': L('Приём по данным портала', 'Accepting as listed by the portal', '门户显示正在招募'),
    archived: L('Архивное объявление', 'Archived announcement', '历史公告'),
    expired: L('Указанный срок истёк', 'Listed deadline has passed', '所列截止日期已过'),
    unknown: L('Статус приёма не указан', 'Recruitment status not stated', '未注明招聘状态'),
  }[status];
}

function announcementCard(row, onReview, pending) {
  const status = vacancyBankStatus(row);
  const source = safeURL(row.sourceURL);
  const location = [row.region, row.locality].filter(value => typeof value === 'string' && value.trim()).join(', ');
  const missing = L('Не указано', 'Not stated', '未注明');
  const scope = row.scope === 'group-or-reserve-context'
    ? L('Группа должностей / кадровый резерв', 'Position group / talent reserve', '职位组／人才储备')
    : row.scope === 'unknown' ? L('Тип объявления не уточнён', 'Announcement type unspecified', '未注明公告类型') : '';
  const review = onReview && row.scope === 'individual-role';
  return `<article class="adaptive-bank-vacancy" data-adaptive-bank-vacancy="${E(row.id)}">
    <div class="adaptive-bank-badges"><span data-adaptive-bank-status="${status}">${bankStatusLabel(status)}</span>${scope ? `<span>${scope}</span>` : ''}</div>
    <h4 lang="ru">${E(row.title || L('Название должности не указано', 'Role title not stated', '未注明职位名称'))}</h4>
    ${location ? `<p class="adaptive-bank-location" lang="ru">${E(location)}</p>` : ''}
    <dl><div><dt>${L('Опубликовано', 'Published', '发布日期')}</dt><dd>${E(date(row.announcedAt) || missing)}</dd></div>
    <div><dt>${L('Приём до', 'Apply by', '申请截止')}</dt><dd>${E(date(row.expiresAt) || missing)}</dd></div></dl>
    <div class="adaptive-bank-actions">
      ${review ? `<button class="button button-secondary" type="button" data-adaptive-bank-review="${E(row.id)}" ${pending ? 'disabled' : ''}>${pending?.id === row.id ? L('Загрузка…', 'Loading…', '加载中……') : L('Разобрать требования', 'Assess these requirements', '评估这些要求')}</button>` : ''}
      ${source ? `<a class="adaptive-source" href="${source}" target="_blank" rel="noopener noreferrer">${L('Открыть объявление', 'Open announcement', '打开公告')}${icon('external')}</a>` : ''}
    </div>
  </article>`;
}

function pager(kind, label, previous, next) {
  if (!previous && !next) return '';
  const employers = kind === 'employer';
  const name = employers ? L('Страницы работодателей', 'Employer pages', '雇主分页') : L('Страницы объявлений', 'Announcement pages', '公告分页');
  return `<nav class="adaptive-bank-pager" aria-label="${name}">
    <button class="button button-secondary" type="button" data-adaptive-bank-${kind}-prev ${previous ? '' : 'disabled'}>${L('Назад', 'Previous', '上一页')}</button>
    <span>${E(label)}</span>
    <button class="button button-secondary" type="button" data-adaptive-bank-${kind}-next ${next ? '' : 'disabled'}>${L('Далее', 'Next', '下一页')}</button>
  </nav>`;
}

/** An independent source catalogue. Creating and mounting it performs no reads. */
export function createAdaptiveBankBrowse({onReview} = {}) {
  const id = `adaptive-bank-${++sequence}`;
  const review = typeof onReview === 'function' ? onReview : null;
  const bank = createEmployerVacancyBank({maxEmployers:4, maxPages:8});
  let host = null, binding = null, disposed = false, open = false;
  let directory = null, directoryRequest = null, directoryError = false;
  let query = '', employerPage = 0, selected = null, vacancyOffset = 0, pendingPage = null;
  let pendingReview = null, reviewError = false, focusVacancies = false;

  function content() {
    return open && host?.isConnected ? host.querySelector('[data-adaptive-bank-content]') : null;
  }

  async function loadDirectory() {
    if (disposed || !open || directory || directoryRequest) return;
    const request = new AbortController();
    directoryRequest = request;
    directoryError = false;
    renderContent();
    const timer = setTimeout(() => request.abort(), 20000);
    try {
      const response = await fetch(DIRECTORY, {signal:request.signal});
      if (!response.ok || Number(response.headers.get('content-length')) > MAX_PACKED) throw new Error('Directory unavailable');
      const packed = new Uint8Array(await response.arrayBuffer());
      if (packed.length > MAX_PACKED) throw new Error('Directory exceeds size limit');
      const raw = await decodeGzip(packed, {maxBytes:MAX_RAW});
      const loaded = validateDirectory(JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(raw)));
      if (request === directoryRequest && !request.signal.aborted) directory = loaded;
    } catch {
      if (request === directoryRequest) directoryError = true;
    } finally {
      clearTimeout(timer);
      if (request === directoryRequest) {
        if (!directory) directoryError = true;
        directoryRequest = null;
        renderContent();
      }
    }
  }

  function renderEmployers({focus = false} = {}) {
    const area = content()?.querySelector('[data-adaptive-bank-employers]');
    if (!area || !directory) return;
    const words = normalize(query).split(' ').filter(Boolean);
    const employers = words.length ? directory.employers.filter(item => words.every(word => item.search.includes(word))) : directory.employers;
    const pageCount = Math.max(1, Math.ceil(employers.length / EMPLOYERS_PER_VIEW));
    employerPage = Math.max(0, Math.min(employerPage, pageCount - 1));
    const first = employerPage * EMPLOYERS_PER_VIEW;
    area.innerHTML = `<p class="adaptive-bank-note" tabindex="-1" role="status" data-adaptive-bank-employer-count>${L('Работодателей в списке: ', 'Employers in the list: ', '列表中的雇主数：')}${number(employers.length)}</p>
      ${employers.length ? `<ul class="adaptive-bank-employers">${employers.slice(first, first + EMPLOYERS_PER_VIEW).map(item => {
        const duplicateName = directory.nameCounts.get(item.nameKey) > 1;
        return `<li><button type="button" class="adaptive-bank-employer" data-adaptive-bank-employer="${E(item.id)}"><strong lang="ru">${E(item.name)}</strong>
          ${duplicateName ? `<span class="adaptive-bank-identifier" lang="en">${E(item.id)}</span>` : ''}
          <span>${L('Объявлений: ', 'Announcements: ', '公告数：')}${number(item.total)}</span></button></li>`;
      }).join('')}</ul>` : `<p class="adaptive-bank-note">${L('По этому запросу ничего не найдено.', 'No employers match this search.', '没有匹配的雇主。')}</p>`}
      ${pager('employer', `${number(employerPage + 1)} / ${number(pageCount)}`, employerPage > 0, employerPage + 1 < pageCount)}`;
    if (focus) area.querySelector('[data-adaptive-bank-employer-count]').focus();
  }

  function renderVacancies() {
    const area = content()?.querySelector('[data-adaptive-bank-announcements]');
    if (!area || !selected) return;
    const view = bank.get(selected.id);
    area.setAttribute('aria-busy', String(view.loading));
    if (view.loading || view.status === 'idle') {
      area.innerHTML = `<p class="adaptive-bank-note" role="status">${L('Загружаем объявления…', 'Loading announcements…', '正在加载公告……')}</p>`;
      return;
    }
    if (view.error) {
      area.innerHTML = `<p class="adaptive-bank-note" role="alert">${L('Не удалось загрузить объявления.', 'Announcements could not be loaded.', '公告加载失败。')}</p>
        <button class="button button-secondary" type="button" data-adaptive-bank-vacancy-retry>${L('Повторить загрузку', 'Retry loading', '重新加载')}</button>`;
      return;
    }
    const descriptor = view.descriptor;
    if (descriptor.employerId !== selected.id || descriptor.jobCount !== selected.total || descriptor.pages.length !== selected.pages) {
      area.innerHTML = `<p class="adaptive-bank-note" role="alert">${L('Данные работодателя изменились. Обновите страницу.', 'The employer data changed. Reload this page.', '雇主数据已变更，请刷新页面。')}</p>`;
      return;
    }
    if (pendingPage?.index === view.pageIndex) {
      vacancyOffset = pendingPage.offset;
      pendingPage = null;
    }
    const first = descriptor.pages.slice(0, view.pageIndex).reduce((sum, page) => sum + page.count, 0) + vacancyOffset;
    const cards = view.rows.slice(vacancyOffset, vacancyOffset + VACANCIES_PER_VIEW);
    const range = `${number(first + 1)}–${number(first + cards.length)} / ${number(selected.total)}`;
    const previous = vacancyOffset > 0 || view.pageIndex > 0;
    const next = vacancyOffset + VACANCIES_PER_VIEW < view.rows.length || view.pageIndex + 1 < descriptor.pages.length;
    area.innerHTML = `<p class="adaptive-bank-note" tabindex="-1" role="status" data-adaptive-bank-vacancy-range>${L('Объявления ', 'Announcements ', '公告 ')}${range}</p>
      <div class="adaptive-bank-vacancies">${cards.map(row => announcementCard(row, review, pendingReview)).join('')}</div>
      ${reviewError ? `<p class="adaptive-bank-note" role="alert">${L('Не удалось открыть требования. Попробуйте ещё раз.', 'The requirements could not be opened. Please try again.', '无法打开要求，请重试。')}</p>` : ''}
      ${pager('vacancy', range, previous, next)}`;
    if (focusVacancies) {
      focusVacancies = false;
      area.querySelector('[data-adaptive-bank-vacancy-range]').focus();
    }
  }

  function renderContent() {
    const area = content();
    if (!area) return;
    if (!directory) {
      area.innerHTML = directoryError
        ? `<p class="adaptive-bank-note" role="alert">${L('Не удалось загрузить список работодателей.', 'The employer list could not be loaded.', '雇主列表加载失败。')}</p><button class="button button-secondary" type="button" data-adaptive-bank-directory-retry>${L('Повторить загрузку', 'Retry loading', '重新加载')}</button>`
        : `<p class="adaptive-bank-note" role="status">${L('Загружаем список работодателей…', 'Loading the employer list…', '正在加载雇主列表……')}</p>`;
      return;
    }
    if (selected) {
      const unknownIdentity = selected.identity?.startsWith('unresolved-');
      area.innerHTML = `<div data-adaptive-bank-selected="${E(selected.id)}">
        <button class="adaptive-back" type="button" data-adaptive-bank-back>${icon('arrow-left')}${L('К списку работодателей', 'Back to employers', '返回雇主列表')}</button>
        <h3 tabindex="-1" lang="ru">${E(selected.name)}</h3>
        ${unknownIdentity ? `<p class="adaptive-bank-note">${L('Работодатель не установлен однозначно.', 'Employer identity is unresolved.', '尚未确认雇主身份。')}</p>` : ''}
        <p class="adaptive-bank-note">${L('Всего: ', 'Total: ', '总计：')}${number(selected.total)} · ${L('Архивных по источнику: ', 'Archived as published: ', '来源标为历史：')}${number(selected.archived)}
          ${selected.archiveUnknown ? ` · ${L('Статус архива не указан: ', 'Archive status unspecified: ', '未注明归档状态：')}${number(selected.archiveUnknown)}` : ''}</p>
        <div data-adaptive-bank-announcements></div>
      </div>`;
      renderVacancies();
      return;
    }
    area.innerHTML = `<p class="adaptive-bank-note">${L('Копия данных от ', 'Snapshot dated ', '数据副本日期：')}${E(date(directory.snapshotAt))} · ${L('объявлений: ', 'announcements: ', '公告数：')}${number(directory.jobCount)}.</p>
      <label class="adaptive-bank-search">${L('Найти работодателя', 'Find an employer', '查找雇主')}<input type="search" maxlength="512" data-adaptive-bank-search autocomplete="off" value="${E(query)}" aria-describedby="${id}-search-hint"></label>
      <p class="adaptive-bank-note" id="${id}-search-hint">${L('Введите название из источника или идентификатор работодателя.', 'Enter the employer’s source name or identifier.', '请输入来源中的雇主名称或标识。')}</p>
      <div data-adaptive-bank-employers></div>`;
    renderEmployers();
  }

  function toggle() {
    open = !open;
    host.querySelector('[data-adaptive-bank-toggle]').setAttribute('aria-expanded', String(open));
    host.querySelector('[data-adaptive-bank-content]').hidden = !open;
    if (!open) {
      cancelLoads();
      return;
    }
    renderContent();
    if (!directory) void loadDirectory();
    else if (selected) void bank.ensure(selected.id);
  }

  function cancelLoads() {
    const request = directoryRequest;
    directoryRequest = null;
    request?.abort();
    pendingPage = null;
    focusVacancies = false;
    if (selected) bank.cancel(selected.id);
    pendingReview = null;
  }

  function selectEmployer(employer) {
    const item = directory?.byId.get(employer);
    if (!item) return;
    selected = item;
    vacancyOffset = 0;
    pendingReview = null;
    reviewError = false;
    renderContent();
    content()?.querySelector('[data-adaptive-bank-selected] h3').focus();
    void bank.loadPage(item.id, 0);
  }

  function turnVacancies(direction) {
    if (!selected || pendingReview) return;
    const view = bank.get(selected.id);
    if (view.loading || view.error || !view.descriptor) return;
    const offset = vacancyOffset + direction * VACANCIES_PER_VIEW;
    if (offset >= 0 && offset < view.rows.length) {
      vacancyOffset = offset;
      focusVacancies = true;
      renderVacancies();
      return;
    }
    const index = view.pageIndex + direction;
    const target = view.descriptor.pages[index];
    if (!target) return;
    pendingPage = {index, offset:direction > 0 ? 0 : Math.floor((target.count - 1) / VACANCIES_PER_VIEW) * VACANCIES_PER_VIEW};
    focusVacancies = true;
    void bank.loadPage(selected.id, index);
  }

  async function openReview(vacancyId) {
    if (!review || pendingReview || !selected) return;
    const view = bank.get(selected.id);
    const row = view.rows.find(item => item.id === vacancyId);
    const pageRef = view.descriptor?.pages[view.pageIndex];
    if (view.loading || view.error || !pageRef || row?.scope !== 'individual-role') return;
    const request = {id:vacancyId};
    pendingReview = request;
    reviewError = false;
    renderVacancies();
    try {
      if (await review(row, view.descriptor, pageRef, view.rows) === false) throw new Error('Review unavailable');
    } catch {
      if (pendingReview === request) reviewError = true;
    } finally {
      if (pendingReview === request) {
        pendingReview = null;
        renderVacancies();
      }
    }
  }

  function click(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled || !host?.contains(button)) return;
    if (button.hasAttribute('data-adaptive-bank-toggle')) {toggle(); return;}
    if (!open) return;
    if (button.hasAttribute('data-adaptive-bank-directory-retry')) {void loadDirectory(); return;}
    if (button.hasAttribute('data-adaptive-bank-employer')) {selectEmployer(button.dataset.adaptiveBankEmployer); return;}
    if (button.hasAttribute('data-adaptive-bank-back')) {
      cancelLoads();
      selected = null;
      renderContent();
      content()?.querySelector('[data-adaptive-bank-search]').focus();
      return;
    }
    if (button.hasAttribute('data-adaptive-bank-review')) {void openReview(button.dataset.adaptiveBankReview); return;}
    if (button.hasAttribute('data-adaptive-bank-vacancy-retry') && selected) {void bank.retry(selected.id); return;}
    if (button.hasAttribute('data-adaptive-bank-vacancy-prev')) {turnVacancies(-1); return;}
    if (button.hasAttribute('data-adaptive-bank-vacancy-next')) {turnVacancies(1); return;}
    if (button.hasAttribute('data-adaptive-bank-employer-prev')) {employerPage--; renderEmployers({focus:true}); return;}
    if (button.hasAttribute('data-adaptive-bank-employer-next')) {employerPage++; renderEmployers({focus:true});}
  }

  const unsubscribe = bank.subscribe(employer => {
    if (open && selected?.id === employer) renderVacancies();
  });

  function mount(container) {
    if (disposed) return;
    binding?.abort();
    host = container || null;
    if (!host) return;
    binding = new AbortController();
    host.innerHTML = `<section class="adaptive-bank" data-adaptive-bank aria-labelledby="${id}-toggle">
      <h2><button class="adaptive-bank-toggle" id="${id}-toggle" type="button" data-adaptive-bank-toggle aria-controls="${id}-content" aria-expanded="${open}">${L('Все объявления Госслужбы', 'All civil service announcements', '全部公务招聘公告')}</button></h2>
      <p class="adaptive-bank-intro">${L('Каталог по работодателям включает архивные объявления, группы должностей и кадровый резерв. Сроки и статус приёма указаны по источнику.', 'Browse by employer, including archived announcements, position groups and talent reserves. Dates and recruitment status follow the source.', '可按雇主浏览历史公告、职位组和人才储备。日期及招聘状态以来源为准。')}</p>
      <div id="${id}-content" data-adaptive-bank-content ${open ? '' : 'hidden'}></div>
    </section>`;
    host.addEventListener('click', click, {signal:binding.signal});
    host.addEventListener('input', event => {
      if (!event.target.matches('[data-adaptive-bank-search]')) return;
      query = event.target.value;
      employerPage = 0;
      renderEmployers();
    }, {signal:binding.signal});
    renderContent();
  }

  return {
    mount,
    reset() {
      open = false;
      cancelLoads();
      selected = null;
      query = '';
      employerPage = 0;
      vacancyOffset = 0;
      reviewError = false;
      focusVacancies = false;
      if (host?.isConnected) mount(host);
    },
    dispose() {
      disposed = true;
      open = false;
      cancelLoads();
      binding?.abort();
      unsubscribe();
      bank.dispose();
      host = null;
    },
  };
}
