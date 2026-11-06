/** Full IPIP-NEO-120 scoring. Item and translation provenance: ../docs/IPIP-NEO-120.md. */
import {PERSONALITY_ITEMS} from './personality-items.mjs';

export {PERSONALITY_ITEMS};

export const PERSONALITY_METHOD = Object.freeze({
  id: 'ipip-neo-120',
  name: 'IPIP-NEO-120',
  author: 'John A. Johnson',
  year: 2014,
  version: '2026-11-06-edited',
  itemCount: 120,
  facetCount: 30,
  domainCount: 5,
  minResponse: 1,
  maxResponse: 5,
  doi: 'https://doi.org/10.1016/j.jrp.2014.05.003',
  keyUrl: 'https://ipip.ori.org/30FacetNEO-PI-RItems.htm',
  permissionUrl: 'https://ipip.ori.org/newPermission.htm',
  sourceCommit: 'e8f3caca49edafb9bc6b927eff7fbc1264312c24',
  translation: 'Edited open translations; no national norms or translation validation claimed',
});

export const PERSONALITY_DOMAINS = Object.freeze([
  {id: 'N', name: 'Нейротизм', en: 'Neuroticism', zh: '神经质'},
  {id: 'E', name: 'Экстраверсия', en: 'Extraversion', zh: '外向性'},
  {id: 'O', name: 'Открытость опыту', en: 'Openness to experience', zh: '经验开放性'},
  {id: 'A', name: 'Доброжелательность', en: 'Agreeableness', zh: '宜人性'},
  {id: 'C', name: 'Добросовестность', en: 'Conscientiousness', zh: '尽责性'},
].map(domain => Object.freeze({
  ...domain,
  facets: Object.freeze(Array.from({length: 6}, (_, index) => domain.id + (index + 1))),
})));

export const PERSONALITY_FACETS = Object.freeze([
  {id: 'N1', name: 'Тревожность', en: 'Anxiety', zh: '焦虑'},
  {id: 'N2', name: 'Раздражительность', en: 'Anger', zh: '愤怒'},
  {id: 'N3', name: 'Склонность к унынию', en: 'Depression', zh: '低落倾向'},
  {id: 'N4', name: 'Социальная скованность', en: 'Self-consciousness', zh: '社交不自在'},
  {id: 'N5', name: 'Несдержанность', en: 'Immoderation', zh: '过度放纵'},
  {id: 'N6', name: 'Уязвимость к стрессу', en: 'Vulnerability', zh: '压力脆弱性'},
  {id: 'E1', name: 'Дружелюбие', en: 'Friendliness', zh: '友善'},
  {id: 'E2', name: 'Общительность', en: 'Gregariousness', zh: '合群性'},
  {id: 'E3', name: 'Лидерская инициативность', en: 'Assertiveness', zh: '领导主动性'},
  {id: 'E4', name: 'Активность', en: 'Activity level', zh: '活动水平'},
  {id: 'E5', name: 'Поиск острых ощущений', en: 'Excitement-seeking', zh: '寻求刺激'},
  {id: 'E6', name: 'Жизнерадостность', en: 'Cheerfulness', zh: '乐观愉快'},
  {id: 'O1', name: 'Воображение', en: 'Imagination', zh: '想象力'},
  {id: 'O2', name: 'Интерес к искусству', en: 'Artistic interests', zh: '艺术兴趣'},
  {id: 'O3', name: 'Эмоциональная восприимчивость', en: 'Emotionality', zh: '情感感受力'},
  {id: 'O4', name: 'Готовность к новому', en: 'Adventurousness', zh: '尝试新事物'},
  {id: 'O5', name: 'Интеллектуальная любознательность', en: 'Intellect', zh: '求知兴趣'},
  {id: 'O6', name: 'Либерализм взглядов', en: 'Liberalism', zh: '观念自由倾向'},
  {id: 'A1', name: 'Доверие', en: 'Trust', zh: '信任'},
  {id: 'A2', name: 'Прямота', en: 'Morality', zh: '真诚'},
  {id: 'A3', name: 'Готовность помогать', en: 'Altruism', zh: '助人意愿'},
  {id: 'A4', name: 'Сотрудничество', en: 'Cooperation', zh: '合作'},
  {id: 'A5', name: 'Скромность', en: 'Modesty', zh: '谦逊'},
  {id: 'A6', name: 'Сочувствие', en: 'Sympathy', zh: '同情心'},
  {id: 'C1', name: 'Самоэффективность', en: 'Self-efficacy', zh: '自我效能'},
  {id: 'C2', name: 'Организованность', en: 'Orderliness', zh: '条理性'},
  {id: 'C3', name: 'Ответственность', en: 'Dutifulness', zh: '责任感'},
  {id: 'C4', name: 'Стремление к достижениям', en: 'Achievement-striving', zh: '成就追求'},
  {id: 'C5', name: 'Самодисциплина', en: 'Self-discipline', zh: '自律'},
  {id: 'C6', name: 'Осмотрительность', en: 'Cautiousness', zh: '审慎'},
].map(facet => Object.freeze({...facet, domain: facet.id[0]})));

const itemIds = new Set(PERSONALITY_ITEMS.map(item => item.id));

/**
 * Score a complete response array in published order, or an object keyed by item.id.
 * Responses must be integer numbers 1–5; missing responses are never imputed.
 * Sum is the original IPIP score; mean is sum/count, with no norms or percentiles.
 */
export function scorePersonality(answers) {
  let values;
  if (Array.isArray(answers)) {
    if (answers.length !== PERSONALITY_ITEMS.length) {
      throw new RangeError('IPIP-NEO-120 requires exactly 120 answers.');
    }
    values = answers;
  } else if (answers !== null && typeof answers === 'object') {
    const keys = Object.keys(answers);
    if (keys.length !== PERSONALITY_ITEMS.length || keys.some(key => !itemIds.has(key))) {
      throw new RangeError('IPIP-NEO-120 requires an answer for every item and no unknown keys.');
    }
    values = PERSONALITY_ITEMS.map(item => answers[item.id]);
  } else {
    throw new TypeError('IPIP-NEO-120 answers must be an array or an item-keyed object.');
  }

  const facets = Object.fromEntries(PERSONALITY_FACETS.map(facet => [facet.id, {sum: 0, count: 0}]));
  const domains = Object.fromEntries(PERSONALITY_DOMAINS.map(domain => [domain.id, {sum: 0, count: 0}]));
  for (let index = 0; index < PERSONALITY_ITEMS.length; index += 1) {
    const response = values[index];
    const item = PERSONALITY_ITEMS[index];
    if (typeof response !== 'number' || !Number.isInteger(response) || response < 1 || response > 5) {
      throw new RangeError('Invalid IPIP-NEO-120 answer for ' + item.id + ': expected an integer from 1 to 5.');
    }
    const score = item.reverse ? 6 - response : response;
    facets[item.facet].sum += score;
    facets[item.facet].count += 1;
    domains[item.domain].sum += score;
    domains[item.domain].count += 1;
  }
  for (const scale of [...Object.values(facets), ...Object.values(domains)]) {
    scale.mean = scale.sum / scale.count;
  }
  return {methodId: PERSONALITY_METHOD.id, answered: PERSONALITY_ITEMS.length, facets, domains};
}
