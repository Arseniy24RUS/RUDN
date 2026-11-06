/** Canonical scoring fixtures are independently transcribed from the official IPIP key.
 * https://ipip.ori.org/30FacetNEO-PI-RItems.htm
 * Only synthetic responses are used; no student records or network calls.
 */
import assert from 'node:assert/strict';
import {PERSONALITY_ITEMS, PERSONALITY_DOMAINS, PERSONALITY_FACETS, PERSONALITY_METHOD, scorePersonality} from '../site/apps/career/assets/personality-model.mjs';

const reverseOrders = new Set([
  9, 19, 24, 30, 39, 40, 48, 49, 51, 53, 54, 60, 62, 67, 68, 69, 70,
  73, 74, 75, 78, 79, 80, 81, 83, 84, 85, 88, 89, 90, 92, 94, 96,
  97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
  111, 113, 114, 115, 116, 118, 119, 120,
]);

assert.equal(PERSONALITY_METHOD.id, 'ipip-neo-120');
assert.equal(PERSONALITY_ITEMS.length, 120);
assert.equal(PERSONALITY_DOMAINS.length, 5);
assert.equal(PERSONALITY_FACETS.length, 30);
assert.equal(new Set(PERSONALITY_ITEMS.map(item => item.id)).size, 120);
assert.equal(new Set(PERSONALITY_ITEMS.map(item => item.originalId)).size, 120);
const orderDomains = ['N', 'E', 'O', 'A', 'C'];
PERSONALITY_ITEMS.forEach((item, index) => {
  assert.equal(item.order, index + 1);
  assert.equal(item.id, 'ipip-' + String(index + 1).padStart(3, '0'));
  assert.equal(item.domain, orderDomains[index % 5]);
  assert.equal(item.facet, orderDomains[index % 5] + (Math.floor(index / 5) % 6 + 1));
  assert.equal(item.reverse, reverseOrders.has(index + 1), 'Published key direction: item ' + (index + 1));
  for (const key of ['text', 'en', 'zh']) assert(item[key].trim(), 'All item languages are available.');
});
for (const facet of PERSONALITY_FACETS) assert.equal(PERSONALITY_ITEMS.filter(item => item.facet === facet.id).length, 4);
for (const domain of PERSONALITY_DOMAINS) assert.equal(PERSONALITY_ITEMS.filter(item => item.domain === domain.id).length, 24);

const neutral = scorePersonality(Array(120).fill(3));
assert.equal(neutral.answered, 120);
for (const facet of Object.values(neutral.facets)) assert.deepEqual(facet, {sum: 12, count: 4, mean: 3});
for (const domain of Object.values(neutral.domains)) assert.deepEqual(domain, {sum: 72, count: 24, mean: 3});

// Fixed canonical reverse positions, not model flags, produce the two endpoints.
for (const [target, direct, reverse] of [[1, 1, 5], [5, 5, 1]]) {
  const result = scorePersonality(Array.from({length: 120}, (_, index) => reverseOrders.has(index + 1) ? reverse : direct));
  for (const facet of Object.values(result.facets)) assert.deepEqual(facet, {sum: target * 4, count: 4, mean: target});
  for (const domain of Object.values(result.domains)) assert.deepEqual(domain, {sum: target * 24, count: 24, mean: target});
}

const agree = scorePersonality(Array(120).fill(5));
assert.deepEqual(Object.fromEntries(Object.entries(agree.domains).map(([key, score]) => [key, score.sum])), {N: 92, E: 96, O: 72, A: 52, C: 68});
assert.equal(agree.facets.E3.sum, 16); // 12+, 42+, 72+, 102−.
assert.equal(agree.facets.C3.sum, 12); // 15+, 45+, 75−, 105−.
assert.equal(agree.facets.C6.sum, 4); // Four reversed cautiousness items.

const mixed = Array(120).fill(3);
mixed[11] = 5;
mixed[101] = 1;
mixed[14] = 5;
mixed[104] = 1;
const mixedResult = scorePersonality(mixed);
assert.deepEqual(mixedResult.facets.E3, {sum: 16, count: 4, mean: 4});
assert.deepEqual(mixedResult.facets.C3, {sum: 16, count: 4, mean: 4});
assert.equal(mixedResult.domains.E.sum, 76);
assert.equal(mixedResult.domains.C.sum, 76);
const keyed = Object.fromEntries(PERSONALITY_ITEMS.map((item, index) => [item.id, mixed[index]]));
assert.deepEqual(scorePersonality(keyed), mixedResult);

for (const invalid of [null, undefined, false, '3', [], Array(119).fill(3), Array(121).fill(3), Array(120), {}]) {
  assert.throws(() => scorePersonality(invalid), undefined, 'Reject incomplete/non-response input.');
}
for (const invalid of [0, 6, -1, 2.5, NaN, Infinity, -Infinity, '3', true, null, undefined]) {
  const answers = Array(120).fill(3);
  answers[17] = invalid;
  assert.throws(() => scorePersonality(answers), /integer from 1 to 5/);
}
const missing = {...keyed};
delete missing['ipip-001'];
assert.throws(() => scorePersonality(missing));
assert.throws(() => scorePersonality({...keyed, extra: 3}));
assert.throws(() => scorePersonality({...missing, unknown: 3}));

assert.equal(PERSONALITY_ITEMS[11].text, 'Беру руководство на себя');
assert.equal(PERSONALITY_ITEMS[106].text, 'Люблю не торопиться и отдыхать');
assert.equal(PERSONALITY_ITEMS[27].en, 'Tend to vote for liberal political candidates');
assert.equal(PERSONALITY_ITEMS[87].en, 'Tend to vote for conservative political candidates');
console.log('PASS IPIP-NEO-120: 120 items, published key, 30 facets, 5 domains, endpoints, mixed answers, input validation, three languages.');
