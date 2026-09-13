import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// The test invokes presentation code only. It never initializes Firebase or
// changes the questionnaire, scoring inputs, identities, or saved results.
globalThis.__careerHost = {storageKey: value => `test:${value}`};
const {configureTranslations, textForLanguage} = await import('../site/apps/career/assets/i18n.mjs');
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const questions = await read('../site/apps/career/data/questions.json');
const sectors = await read('../site/apps/career/data/sectors.json');
const hasRussian = value => /[А-Яа-яЁё]/.test(value);
const dictionaries = {};

for (const language of ['en', 'zh-Hans']) {
  const catalog = await read(`../site/apps/career/locales/${language}.json`);
  dictionaries[language] = catalog;
  configureTranslations(catalog.entries, catalog.templates, language);
  assert.equal(questions.length, 27);
  for (const question of questions) {
    const translated = textForLanguage(question.text, language);
    assert.equal(hasRussian(translated), false, `${language}: question ${question.id}`);
  }
  assert.equal(hasRussian(textForLanguage('Инструменты профориентации', language)), false);
  assert.equal(hasRussian(textForLanguage('Разделы профориентационного теста', language)), false);

  // A generic colon template must not shadow the specific result explanation.
  // Exercise every sector pair, including punctuation inside sector titles.
  let combinations = 0;
  for (const first of sectors) for (const second of sectors) {
    const source = `Содержательная область выбранного направления: ${first.title.toLowerCase()}; ${second.title.toLowerCase()}.`;
    const translated = textForLanguage(source, language);
    assert.equal(hasRussian(translated), false, `${language}: ${source}`);
    assert.match(translated, language === 'en' ? /^Policy area of the selected path: / : /^所选职业方向的政策领域：/);
    combinations++;
  }
  console.log(`PASS ${language}: 27 questions, toolbar label, ${combinations} result explanations`);
}
assert.deepEqual(Object.keys(dictionaries.en.entries).sort(), Object.keys(dictionaries['zh-Hans'].entries).sort());
assert.deepEqual(dictionaries.en.templates.map(pair => pair[0]), dictionaries['zh-Hans'].templates.map(pair => pair[0]));
console.log('PASS EN/ZH dictionary and template coverage parity');
