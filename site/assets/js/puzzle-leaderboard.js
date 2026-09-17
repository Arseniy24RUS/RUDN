/** Shared ranking and export rules for the Russia 89-piece leaderboard. */
export const PUZZLE_LEVELS = ['hard', 'medium', 'easy'];
export const PUZZLE_PAGE_SIZE = 100;
const DAY_MS = 86400000;
const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const duration = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 1000;

export function normalizePuzzleResult(row) {
  if (!row || !PUZZLE_LEVELS.includes(row.difficulty) || Number(row.placed) !== 89 || Number(row.total) !== 89) return null;
  const elapsed = duration(row.elapsed_ms) ? row.elapsed_ms : Number(row.time_ms);
  const timestamp = Number(row.timestamp), fio = clean(row.fio), group = clean(row.group);
  if (!duration(elapsed) || !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > 8640000000000000 || !fio || !group) return null;
  return {id: clean(row.id), fio, group, difficulty: row.difficulty, elapsed_ms: elapsed,
    time_ms: Number(row.time_ms), timestamp, placed: 89, total: 89,
    participant_id: /^[a-f0-9]{64}$/.test(row.participant_id || '') ? row.participant_id : '',
    pending: row.pending === true};
}

export function comparePuzzleResults(a, b) {
  return a.elapsed_ms - b.elapsed_ms || a.timestamp - b.timestamp ||
    String(a.id).localeCompare(String(b.id), 'en') || a.fio.localeCompare(b.fio);
}

export function bestPuzzleResults(remote = [], local = []) {
  // The same immutable attempt may be in the local outbox and on the server.
  // Prefer the server copy, but never coalesce two different attempt IDs here.
  const attempts = new Map();
  for (const raw of [...local, ...remote]) {
    const row = normalizePuzzleResult(raw);
    if (row) attempts.set(row.id || JSON.stringify([row.fio, row.group, row.difficulty, row.elapsed_ms, row.timestamp]), row);
  }
  // Link an older name/group row only when that label identifies exactly one
  // known participant. Never merge two identified students with matching names.
  const label = row => JSON.stringify([row.fio.toLowerCase(), row.group.toLowerCase()]);
  const identities = new Map();
  for (const row of attempts.values()) if (row.participant_id) {
    const known = identities.get(label(row)) || new Set();
    known.add(row.participant_id); identities.set(label(row), known);
  }
  const best = new Map();
  for (const row of attempts.values()) {
    const known = identities.get(label(row));
    const participant = row.participant_id || (known?.size === 1 ? [...known][0] : '');
    const person = participant ? `id:${participant}` : `legacy:${label(row)}`;
    const key = `${person}|${row.difficulty}`, previous = best.get(key);
    if (!previous || comparePuzzleResults(row, previous) < 0) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => PUZZLE_LEVELS.indexOf(a.difficulty) - PUZZLE_LEVELS.indexOf(b.difficulty) || comparePuzzleResults(a, b));
}

export function puzzleGroups(rows, defaults = []) {
  return [...new Set([...defaults, ...rows.map(row => row.group)].map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru', {numeric: true}));
}

export function filterPuzzleResults(rows, groups = new Set()) {
  return groups.size ? rows.filter(row => groups.has(row.group)) : rows;
}

export function puzzleResultPage(rows, difficulty, page = 0) {
  const matching = rows.filter(row => row.difficulty === difficulty), pages = Math.max(1, Math.ceil(matching.length / PUZZLE_PAGE_SIZE));
  const current = Math.max(0, Math.min(pages - 1, Math.floor(Number(page) || 0)));
  return {rows: matching.slice(current * PUZZLE_PAGE_SIZE, (current + 1) * PUZZLE_PAGE_SIZE), page: current, pages, total: matching.length, offset: current * PUZZLE_PAGE_SIZE};
}

export function formatPuzzleTime(value) {
  const seconds = Math.floor(Math.max(0, Number(value) || 0) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Typed cells preserve Unicode, durations over 24h, and literal formula-like names. */
export function puzzleLeaderboardWorkbook(XLSX, rows, copy) {
  const book = XLSX.utils.book_new();
  for (const level of PUZZLE_LEVELS) {
    const selected = rows.filter(row => row.difficulty === level);
    const data = [[copy.rank, copy.fullName, copy.group, copy.time, copy.dateUTC], ...selected.map((row, index) => [
      {t: 'n', v: index + 1}, {t: 's', v: row.fio}, {t: 's', v: row.group},
      {t: 'n', v: row.elapsed_ms / DAY_MS, z: '[m]:ss.000'},
      {t: 'n', v: row.timestamp / DAY_MS + 25569, z: 'yyyy-mm-dd hh:mm:ss'}
    ])];
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!cols'] = [{wch: 8}, {wch: 42}, {wch: 22}, {wch: 18}, {wch: 24}];
    sheet['!autofilter'] = {ref: sheet['!ref']};
    XLSX.utils.book_append_sheet(book, sheet, copy[level]);
  }
  return book;
}

let library;
export function loadPuzzleXlsx() {
  if (globalThis.XLSX?.version === '0.20.3') return Promise.resolve(globalThis.XLSX);
  if (!library) library = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/xlsx/xlsx-0.20.3.full.min.js', import.meta.url).href;
    script.onload = () => globalThis.XLSX?.version === '0.20.3' ? resolve(globalThis.XLSX) : reject(new Error('Unexpected XLSX version'));
    script.onerror = () => {script.remove(); reject(new Error('Local XLSX library unavailable'));};
    document.head.append(script);
  }).catch(error => {library = null; throw error;});
  return library;
}
