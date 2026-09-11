import {MODEL_VERSION, QUESTIONNAIRE_VERSION, REGISTRY_VERSION} from './versions.mjs';
import {profileFromMeans,rankFromProfile} from './scoring.mjs';
import {validateFocusAreas} from './topics.mjs';
export {MODEL_VERSION};
let validationRegistry=null;
export function configureValidationRegistry(registry) { validationRegistry=registry; }
const RECORD_SCHEMA = "rudn-career-result";
export const RECORD_SCHEMA_VERSION = 2;

export const SCALE_IDS = ["N","K","A","M","C","E","D","T","I"];
export const CONDITION_IDS = ["FIELD","SCHEDULE","FORMAL","SECURITY"];
export const SECTOR_IDS = ["SEC","EMR","HEA","SOC","EDU","FIN","ECO","IND","INF","AGR","ENV","DIG","INT","ADM"];

export function createAnonymousRecord({ recordId, createdAt, roleProfile, prioritySectors, lowPrioritySectors, conditions, ranked, focusAreas = {} }) {
  const all = (ranked || []).filter(item=>!["corporation","fund"].includes(item.entityType));
  const leadingTieIds=all.filter(item=>Math.abs(item.rawScore-all[0]?.rawScore)<1e-8).map(item=>item.id);
  const government=all.slice(0,10);
  return {
    schema: RECORD_SCHEMA,
    schemaVersion: RECORD_SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    registryVersion: REGISTRY_VERSION,
    focusAreas: structuredClone(focusAreas),
    leadingTieIds,
    recordId,
    createdAt,
    roleProfile: {
      raw: Object.fromEntries(SCALE_IDS.map((id) => [id, Number(roleProfile?.raw?.[id] ?? 3)])),
      dispersion: Number(roleProfile?.dispersion ?? 0),
      flat: Boolean(roleProfile?.flat)
    },
    prioritySectors: (prioritySectors || []).slice(0, 4),
    lowPrioritySectors: (lowPrioritySectors || []).slice(0, 2),
    conditions: Object.fromEntries(CONDITION_IDS.map((id) => [id, Number(conditions?.[id] ?? 3)])),
    ranking: government.map((item, index) => ({
      rank: index + 1,
      authorityId: item.id,
      score: Number(item.score),
      trackId: item.track?.id || null
    }))
  };
}

const plainObject = value => !!value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => plainObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const TRACK_IDS = ["POLICY","LEGAL","INSPECT","PROGRAM","FINANCE","DIGITAL","SERVICE","TERRITORIAL","INTERNATIONAL"];

export function validateAnonymousRecord(record, registry = validationRegistry) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return { valid: false, errors: ["Файл не содержит объект результата."] };
  if(record.schemaVersion===1)return {valid:false,errors:["Результат прежней модели. Его нельзя смешивать с новой группой. Импортируйте личный сценарий и заново подтвердите изменённые вопросы."]};
  // A closed schema rejects arbitrary nested payloads, not just a blacklist of names.
  const schemaOK = exactKeys(record, ["schema","schemaVersion","modelVersion","questionnaireVersion","registryVersion","focusAreas","leadingTieIds","recordId","createdAt","roleProfile","prioritySectors","lowPrioritySectors","conditions","ranking"])
    && exactKeys(record.roleProfile,["raw","dispersion","flat"])
    && exactKeys(record.roleProfile.raw,SCALE_IDS)
    && exactKeys(record.conditions,CONDITION_IDS)
    && Array.isArray(record.ranking) && record.ranking.length >= 5 && record.ranking.length <= 10
    && record.ranking.every(item => exactKeys(item,["rank","authorityId","score","trackId"]));
  if (!schemaOK) return {valid:false,errors:["Структура файла не соответствует закрытой схеме. Посторонние, в том числе персональные поля, не допускаются."]};
  if(!Array.isArray(record.leadingTieIds)||!record.leadingTieIds.length||record.leadingTieIds.length>69||new Set(record.leadingTieIds).size!==record.leadingTieIds.length)errors.push("Некорректная группа равных лидеров.");
  if (record.schema !== RECORD_SCHEMA) errors.push("Неизвестная схема файла.");
  if (record.schemaVersion !== RECORD_SCHEMA_VERSION) errors.push("Неподдерживаемая версия схемы.");
  if(record.questionnaireVersion!==QUESTIONNAIRE_VERSION || record.registryVersion!==REGISTRY_VERSION)errors.push("Версия анкеты или реестра не соответствует текущей модели.");
  if(!validateFocusAreas(record.focusAreas,record.prioritySectors))errors.push("Некорректны отраслевые уточнения.");
  if (record.modelVersion !== MODEL_VERSION) errors.push("Результат создан несовместимой версией модели.");
  if (typeof record.recordId !== "string" || !/^[\w-]{8,80}$/u.test(record.recordId)) errors.push("Отсутствует корректный анонимный идентификатор.");
  if (typeof record.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(record.createdAt) || Number.isNaN(Date.parse(record.createdAt))) errors.push("Некорректна дата формирования результата.");
  if (!record.roleProfile || typeof record.roleProfile.raw !== "object") errors.push("Отсутствует профиль профессиональных интересов.");
  for (const id of SCALE_IDS) {
    const value = record.roleProfile?.raw?.[id];
    if (!Number.isFinite(value) || value < 1 || value > 5) errors.push(`Некорректное значение шкалы ${id}.`);
  }
  const dispersion = record.roleProfile?.dispersion;
  if (!Number.isFinite(dispersion) || dispersion < 0 || dispersion > 2) errors.push("Некорректна дисперсия профиля.");
  if (typeof record.roleProfile?.flat !== "boolean") errors.push("Не указан признак широкого профиля.");
  const values = SCALE_IDS.map(id=>record.roleProfile.raw[id]);
  if(values.every(v=>typeof v === "number" && Number.isFinite(v))) {
    const mean=values.reduce((a,b)=>a+b,0)/values.length;
    const sd=Math.sqrt(values.reduce((sum,v)=>sum+(v-mean)**2,0)/values.length);
    if(Math.abs(sd-dispersion)>1e-6 || record.roleProfile.flat !== (sd < 0.26)) errors.push("Признак широкого профиля или разброс не согласован со шкалами.");
  }

  if (!Array.isArray(record.prioritySectors) || record.prioritySectors.length !== 4) errors.push("Нужно четыре приоритетные сферы.");
  if (!Array.isArray(record.lowPrioritySectors) || record.lowPrioritySectors.length !== 2) errors.push("Нужно две менее приоритетные сферы.");
  const priority = Array.isArray(record.prioritySectors) ? record.prioritySectors : [];
  const low = Array.isArray(record.lowPrioritySectors) ? record.lowPrioritySectors : [];
  if (new Set(priority).size !== priority.length || new Set(low).size !== low.length) errors.push("Сферы внутри списка не должны повторяться.");
  if (priority.some((id) => !SECTOR_IDS.includes(id)) || low.some((id) => !SECTOR_IDS.includes(id))) errors.push("Файл содержит неизвестную сферу государственной политики.");
  if (priority.some((id) => low.includes(id))) errors.push("Приоритетные и менее приоритетные сферы пересекаются.");

  if (!record.conditions || typeof record.conditions !== "object") errors.push("Отсутствуют условия труда.");
  for (const id of CONDITION_IDS) {
    const value = record.conditions?.[id];
    if (!Number.isInteger(value) || value < 1 || value > 5) errors.push(`Некорректное значение условия ${id}.`);
  }

  if (!Array.isArray(record.ranking) || record.ranking.length < 5 || record.ranking.length > 10) {
    errors.push("Рейтинг должен содержать от пяти до десяти органов.");
  } else {
    const authorityIds = new Set();
    record.ranking.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        errors.push(`Некорректна строка рейтинга ${index + 1}.`);
        return;
      }
      if (item.rank !== index + 1) errors.push(`Нарушена последовательность мест в строке ${index + 1}.`);
      if (typeof item.authorityId !== "string" || !/^[a-z][a-z0-9_-]{0,79}$/.test(item.authorityId)) errors.push(`Не указан орган в строке ${index + 1}.`);
      if (authorityIds.has(item.authorityId)) errors.push("Один орган повторяется в рейтинге.");
      authorityIds.add(item.authorityId);
      if (typeof item.score !== "number" || !Number.isFinite(item.score) || item.score < 0 || item.score > 100) errors.push(`Некорректный индекс в строке ${index + 1}.`);
      if(index && item.score > record.ranking[index-1].score) errors.push("Индексы рейтинга расположены не по убыванию.");
      if(Array.isArray(registry?.authorities)) {
        const authority=registry.authorities.find(a=>a.id===item.authorityId);
        if(!authority || ["corporation","fund"].includes(authority.entityType)) errors.push("В рейтинге указан неизвестный орган или работодатель вне основного рейтинга.");
        else if(item.trackId && !authority.tracks.some(t=>t.id===item.trackId)) errors.push("Трек отсутствует в профиле органа.");
      }
      if (item.trackId !== null && !TRACK_IDS.includes(item.trackId)) errors.push(`Некорректный карьерный трек в строке ${index + 1}.`);
    });
  }


  if(!registry?.authorities?.length || !registry?.tracks?.length || !registry?.sectors?.length) {
    errors.push("Нет полного реестра для проверки расчёта. Файл не принят без пересчёта.");
  } else if(!errors.length) {
    const expected=rankFromProfile({authorities:registry.authorities,tracks:registry.tracks,sectors:registry.sectors,
      roleProfile:profileFromMeans(record.roleProfile.raw),prioritySectors:priority,lowPrioritySectors:low,
      conditions:record.conditions,focusAreas:record.focusAreas}).ranked
      .filter(item=>!["corporation","fund"].includes(item.entityType));
    const expectedTies=expected.filter(x=>Math.abs(x.rawScore-expected[0].rawScore)<1e-8).map(x=>x.id);
    if(JSON.stringify(expectedTies)!==JSON.stringify(record.leadingTieIds))errors.push("Группа лидеров не соответствует пересчёту.");
    expected.splice(record.ranking.length);
    if(expected.length!==record.ranking.length || expected.some((item,i)=>item.id!==record.ranking[i].authorityId ||
      Math.abs(item.score-record.ranking[i].score)>1e-8 || (item.track?.id||null)!==record.ranking[i].trackId)) {
      errors.push("Рейтинг не соответствует приложенным ответам и версии модели. Пересчёт обнаружил расхождение.");
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export function aggregateAnonymousRecords(records = [], registry = validationRegistry) {
  const validRecords = records.filter((record) => validateAnonymousRecord(record,registry).valid);
  const authorityTopOne = new Map();
  const authorityTopFive = new Map();
  const tracks = new Map();
  const sectors = new Map();
  const scaleSums = Object.fromEntries(SCALE_IDS.map((id) => [id, 0]));
  let flatCount = 0;

  for (const record of validRecords) {
    if (record.roleProfile.flat) flatCount += 1;
    for (const id of SCALE_IDS) scaleSums[id] += Number(record.roleProfile.raw[id] || 0);
    for (const id of record.prioritySectors || []) sectors.set(id, (sectors.get(id) || 0) + 1);
    for(const id of record.leadingTieIds)authorityTopOne.set(id,(authorityTopOne.get(id)||0)+1/record.leadingTieIds.length);
    for (const item of (record.ranking || []).slice(0, 5)) {
      authorityTopFive.set(item.authorityId, (authorityTopFive.get(item.authorityId) || 0) + 1);
      if (item.trackId) tracks.set(item.trackId, (tracks.get(item.trackId) || 0) + 1);
    }
  }

  const rows = (map, denominator = validRecords.length) => [...map.entries()]
    .map(([id, count]) => ({ id, count, share: denominator ? count / denominator : 0 }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return {
    count: validRecords.length,
    rejected: records.length - validRecords.length,
    flatCount,
    flatShare: validRecords.length ? flatCount / validRecords.length : 0,
    averageScales: Object.fromEntries(SCALE_IDS.map((id) => [id, validRecords.length ? scaleSums[id] / validRecords.length : 0])),
    topOneAuthorities: rows(authorityTopOne),
    topFiveAuthorities: rows(authorityTopFive),
    tracks: rows(tracks, validRecords.length * 5),
    trackDenominator: validRecords.length * 5,
    prioritySectors: rows(sectors)
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function recordsToCsv(records = [], registry = validationRegistry) {
  const header = ["record_id","created_at",...SCALE_IDS.map((id) => `scale_${id}`),"dispersion","flat","priority_sectors","low_priority_sectors",...CONDITION_IDS.map((id) => `condition_${id}`),"first_displayed_authority","top1_score","top1_track","equal_leading_authorities"];
  const lines = [header.join(";")];
  for (const record of records.filter((item) => validateAnonymousRecord(item,registry).valid)) {
    const top = record.ranking[0] || {};
    const row = [
      record.recordId,record.createdAt,
      ...SCALE_IDS.map((id) => Number(record.roleProfile.raw[id]).toFixed(2)),
      Number(record.roleProfile.dispersion || 0).toFixed(3),record.roleProfile.flat ? 1 : 0,
      record.prioritySectors.join("|"),record.lowPrioritySectors.join("|"),
      ...CONDITION_IDS.map((id) => record.conditions[id]),
      top.authorityId || "",top.score ?? "",top.trackId || "",record.leadingTieIds.join("|")
    ];
    lines.push(row.map(csvCell).join(";"));
  }
  return `\uFEFF${lines.join("\n")}`;
}

export function summaryToCsv(summary) {
  const lines = ["section;id;count;share"];
  for (const [section, rows] of [
    ["leading_authority_fractional", summary.topOneAuthorities || []],
    ["top5_authority", summary.topFiveAuthorities || []],
    ["track", summary.tracks || []],
    ["priority_sector", summary.prioritySectors || []]
  ]) {
    for (const row of rows) lines.push([section, row.id, row.count, Number(row.share).toFixed(4)].join(";"));
  }
  lines.push(`meta;records;${summary.count};1`);
  lines.push(`meta;flat_profiles;${summary.flatCount};${Number(summary.flatShare).toFixed(4)}`);
  return `\uFEFF${lines.join("\n")}`;
}
