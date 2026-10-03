/** Versioned teaching parameters. No mutation or migration of earlier playthroughs. */
export const TELECOM_RULES_VERSION = 'settlements-3.3.0';
export const TOWER_RADIUS_KM = 5.5;
export const INITIAL_TOWER_POPULATION = 8000;
export const TELECOM_TOWER_COST = .2;
// Scenario content is fixed before release; it never adapts to player actions.
export const SPARSE_TELECOM_REGIONS = Object.freeze([
  "amurskaya_oblast",
  "arkhangelskaya_oblast",
  "chukotskiy_avtonomnyy_okrug",
  "evreyskaya_avtonomnaya_oblast",
  "irkutskaya_oblast",
  "kamchatskiy_kray",
  "khabarovskiy_kray",
  "khanty_mansiyskiy_avtonomnyy_okrug_yugra",
  "krasnoyarskiy_kray",
  "magadanskaya_oblast",
  "murmanskaya_oblast",
  "nenetskiy_avtonomnyy_okrug",
  "respublika_altay",
  "respublika_buryatiya",
  "respublika_kalmykiya",
  "respublika_kareliya",
  "respublika_komi",
  "respublika_sakha_yakutiya",
  "respublika_tyva",
  "sakhalinskaya_oblast",
  "tomskaya_oblast",
  "yamalo_nenetskiy_avtonomnyy_okrug",
  "zabaykalskiy_kray"
]);
export const TELECOM_INITIAL_THRESHOLD_OVERRIDES = Object.freeze({respublika_sakha_yakutiya: 5});
export function initialTowerThresholdFor(world) {
  if (Object.hasOwn(TELECOM_INITIAL_THRESHOLD_OVERRIDES, world.region.id)) return TELECOM_INITIAL_THRESHOLD_OVERRIDES[world.region.id];
  return SPARSE_TELECOM_REGIONS.includes(world.region.id) ? 500 : INITIAL_TOWER_POPULATION;
}

const legacyTower = Object.freeze({name: 'Вышка связи', cost: 12, radiusKm: TOWER_RADIUS_KM});
const newTower = Object.freeze({...legacyTower, cost: TELECOM_TOWER_COST});
const populationTower = Object.freeze({...newTower, radiusKm:10});
export function towerSpec(value) {
  const version = typeof value === 'string' ? value : value?.rulesVersion;
  return version==='settlements-3.4.0'?populationTower:version===TELECOM_RULES_VERSION?newTower:legacyTower;
}

export function initialTowersFor(world,scenario) {
  const current=scenario?.rulesVersion==='settlements-3.4.0';
  const threshold=current?scenario.telecomInitialPopulationThreshold:initialTowerThresholdFor(world);
  if(!Number.isSafeInteger(threshold)||threshold<1)throw new Error('Не задан порог исходных вышек');
  const radiusKm=current?towerSpec(scenario).radiusKm:TOWER_RADIUS_KM;
  const eligible=world.rows.filter(row=>Number.isFinite(row.population)&&row.population>0&&Number.isFinite(row.lat)&&Number.isFinite(row.lon)&&Math.abs(row.lat)<=90&&Math.abs(row.lon)<=180);
  let rows;
  if(current&&scenario.telecomInitialSeedIds!==undefined){
    const ids=scenario.telecomInitialSeedIds,ranked=eligible.slice().sort((a,b)=>b.population-a.population||(a.id<b.id?-1:a.id>b.id?1:0));
    if(!Array.isArray(ids)||ids.length>ranked.length||ids.some((id,i)=>id!==ranked[i].id)||ids.some(id=>world.row(id).population<threshold))throw new Error('Некорректный состав исходных вышек');
    rows=ranked.slice(0,ids.length);
  }else rows=world.rows.filter(row => Number.isFinite(row.population) && row.population >= threshold &&
    Number.isFinite(row.lat) && Number.isFinite(row.lon) && Math.abs(row.lat) <= 90 && Math.abs(row.lon) <= 180)
    .slice();
  return rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map(row => ({id: `initial-tower:${row.id}`, settlementId: row.id, lat: row.lat, lon: row.lon, radiusKm}));
}
