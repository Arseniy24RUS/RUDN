/** Authored regional telecom tasks. Only the selected region is imported. */
import {haversine} from '../v2/engine.mjs';
import * as policy from './telecom-policy.mjs';
import {TELECOM_PLAN_INDEX} from './telecom-plans-regions/index.mjs';

export const TELECOM_PLAN_VERSION = 'telecom-plan-v1';
const loaded = new WeakMap(), pending = new WeakMap(), failures = new WeakMap();
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const valid = row => Number.isFinite(row.lat) && Number.isFinite(row.lon) && Math.abs(row.lat) <= 90 && Math.abs(row.lon) <= 180;
const positive = row => Number.isFinite(row.population) && row.population > 0;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort(cmp).filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])) : value;
export function canonicalTelecomPlanJSON(plan) { const {fingerprint, ...payload} = plan; return JSON.stringify(canonical(payload)); }
export async function telecomPlanFingerprint(plan) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalTelecomPlanJSON(plan)));
  return `sha256:${[...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Conservative 3D chord cells; the final membership test is exact haversine. */
export function telecomSpatialIndex(rows, range = 5.5) {
  const size = 2 * 6371 * Math.sin((range + 1e-8) / (2 * 6371)), cells = new Map();
  const key = row => { const lat = row.lat * Math.PI / 180, lon = row.lon * Math.PI / 180; return [6371 * Math.cos(lat) * Math.cos(lon), 6371 * Math.cos(lat) * Math.sin(lon), 6371 * Math.sin(lat)].map(v => Math.floor(v / size)); };
  rows.forEach((row, i) => { const cell = key(row).join(','); if (!cells.has(cell)) cells.set(cell, []); cells.get(cell).push(i); });
  return {find(row) {
    const k = key(row), found = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++)
      for (const i of cells.get(`${k[0] + x},${k[1] + y},${k[2] + z}`) || []) if (haversine(row, rows[i]) <= range + 1e-9) found.push(i);
    return found;
  }};
}

/** Shared exact assignment for offline generation and once-per-world validation. */
export function telecomPlanAssignments(world, centerIds, thresholdPopulation) {
  const rows = world.rows.filter(row => positive(row) && valid(row)).sort((a, b) => cmp(a.id, b.id));
  check(world.rows.filter(positive).length === rows.length, 'Положительная численность без координат не может войти в географический план');
  const byId = new Map(world.rows.map(row => [row.id, row])), index = telecomSpatialIndex(rows), initial = new Set(), assigned = new Map(), byCenter = new Map();
  for (const row of world.rows) if (valid(row) && Number.isFinite(row.population) && row.population >= thresholdPopulation) for (const i of index.find(row)) initial.add(rows[i].id);
  for (const id of centerIds) {
    const row = byId.get(id); check(row && valid(row), 'Неизвестный центр плана связи');
    const ids = index.find(row).map(i => rows[i].id).filter(at => !initial.has(at) && !assigned.has(at)).sort(cmp);
    for (const at of ids) assigned.set(at, id); byCenter.set(id, ids);
  }
  const uncovered = rows.filter(row => !initial.has(row.id));
  check(uncovered.every(row => assigned.has(row.id)), 'План связи оставляет положительные поселения без географического охвата');
  return {byId, initial, uncovered, assigned, byCenter};
}

export function validateTelecomPlanGeometry(world, plan) {
  check(plan && plan.version === TELECOM_PLAN_VERSION && plan.regionId === world?.region?.id && plan.radiusKm === policy.TOWER_RADIUS_KM &&
    ([500, 8000].includes(plan.thresholdPopulation) || plan.thresholdPopulation === 5 && plan.regionId === 'respublika_sakha_yakutiya') && /^[0-9a-f]{64}$/.test(plan.sourcePackSha256 || '') &&
    Array.isArray(plan.centerIds) && Array.isArray(plan.groups) && new Set(plan.centerIds).size === plan.centerIds.length, 'Некорректный региональный план связи');
  const assignment = telecomPlanAssignments(world, plan.centerIds, plan.thresholdPopulation), seen = new Set(), usedCenters = new Set();
  for (const [i, group] of plan.groups.entries()) {
    check(group.id === `telecom-area:${i + 1}` && group.service === 'telecom' && plan.centerIds.includes(group.anchorId) && Array.isArray(group.ids) && group.ids.length > 0,
      'Некорректная локальная задача связи');
    const anchor = assignment.byId.get(group.anchorId), centres = new Set();
    check(group.title === `Связь: ${anchor.name} и окрестности`, 'Название задачи связи не соответствует исходному поселению');
    for (const id of group.ids) {
      check(assignment.assigned.has(id) && !seen.has(id), 'Поселение отсутствует в плане связи или повторяется');
      seen.add(id); centres.add(assignment.assigned.get(id));
    }
    check(centres.has(group.anchorId) && centres.size <= 10 && (group.ids.length <= 160 || centres.size === 1), 'Локальная задача связи превышает ограничение размера');
    for (const id of centres) {
      check(!usedCenters.has(id) && haversine(anchor, assignment.byId.get(id)) <= 20 + 1e-9 && assignment.byCenter.get(id).every(at => group.ids.includes(at)), 'Локальная задача связи объединяет удалённые центры или делит один центр');
      usedCenters.add(id);
    }
  }
  check(seen.size === assignment.uncovered.length, 'План связи не содержит все исходно необслуженные поселения');
  return assignment;
}

export async function validateTelecomPlan(world, plan) {
  const identity = TELECOM_PLAN_INDEX[world?.region?.id];
  check(identity && plan?.fingerprint === identity.fingerprint && plan?.sourcePackSha256 === identity.sourcePackSha256 &&
    plan?.thresholdPopulation === identity.thresholdPopulation && plan?.thresholdPopulation === policy.initialTowerThresholdFor(world), 'План связи не соответствует фиксированным условиям региона');
  check(await telecomPlanFingerprint(plan) === plan.fingerprint, 'Контрольная сумма плана связи не совпадает');
  validateTelecomPlanGeometry(world, plan);
  for (const group of plan.groups) { Object.freeze(group.ids); Object.freeze(group); }
  Object.freeze(plan.centerIds); Object.freeze(plan.groups); return Object.freeze(plan);
}

export async function loadTelecomPlan(world, {retry = false} = {}) {
  if (loaded.has(world)) return loaded.get(world);
  if (pending.has(world)) return pending.get(world);
  const id = world?.region?.id; check(Object.hasOwn(TELECOM_PLAN_INDEX, id), 'Для региона отсутствует план связи');
  const failure = failures.get(world);
  if (failure && (!retry || !failure.importFailed || failure.retried)) throw failure.error;
  const retried = Boolean(failure && retry), loading = (async () => {
    let module;
    try { module = await import(`./telecom-plans-regions/${id}.mjs${retried ? '?retry=1' : ''}`); }
    catch { const error = new Error('Не удалось загрузить план связи. Повторите загрузку региона.'); failures.set(world, {error, importFailed: true, retried}); throw error; }
    try { const plan = await validateTelecomPlan(world, module.default); loaded.set(world, plan); failures.delete(world); return plan; }
    catch (error) { failures.set(world, {error, importFailed: false, retried}); throw error; }
  })();
  pending.set(world, loading);
  try { return await loading; } finally { pending.delete(world); }
}

export function telecomPlanFor(world) {
  if (!loaded.has(world)) throw new Error('Сначала загрузите региональный план связи');
  return loaded.get(world);
}
