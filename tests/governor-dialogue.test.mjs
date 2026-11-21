import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = new URL('../site/apps/governor/', import.meta.url);
const sandbox = {console, Intl};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['src/i18n.js', 'locales/zh-Hans.js', ...[
  'game-data', 'stage3-data', 'stage4-data', 'consolidation-data', 'governance-data', 'governance'
].map(name => `src/${name}.js`)]) {
  vm.runInContext(await readFile(new URL(file, source), 'utf8'), sandbox, {filename: file});
}
const G = sandbox.GovernorGame, governance = G.Governance, local = G.I18n.local;
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

test('all fifteen negotiable measures have authored action-specific dialogue in RU, EN and ZH', () => {
  let count = 0;
  const before = JSON.stringify(governance.CONFIG);
  for (const scene of governance.CONFIG.scenes) {
    const mission = G.DATA.missions.find(item => item.id === scene.missionId);
    for (const action of mission.actions.filter(item => !item.deferred)) {
      const dialogue = scene.actionDialogue[action.id];
      assert.ok(dialogue, `${scene.missionId}/${action.id} has no conversation`);
      assert.equal(dialogue.speeches.length, governance.CONFIG.actors.length);
      for (const line of [...dialogue.speeches, ...Object.values(dialogue.questions || {})]) {
        for (const language of ['ru', 'en', 'zh']) assert.ok(line[language]?.trim(), `${action.id}/${language}`);
        assert.doesNotMatch(line.en, /[\u0400-\u04ff]/);
        assert.doesNotMatch(line.zh, /[\u0400-\u04ff]/);
        assert.match(line.zh, /[\u3400-\u9fff]/);
      }
      const selected = governance.sceneFor(scene.missionId, action.id);
      assert.equal(selected.positions, scene.positions, 'Dialogue must not alter negotiating positions');
      assert.equal(selected.title, scene.title, 'Archived meeting titles remain stable');
      for (const language of ['ru', 'en', 'zh']) {
        for (let actor = 0; actor < 3; actor++) {
          assert.equal(local(selected.speeches[actor], language), dialogue.speeches[actor][language]);
          assert.doesNotMatch(local(selected.questions[actor], 'zh'), /[\u0400-\u04ff]/);
        }
      }
      count++;
    }
    assert.equal(governance.sceneFor(scene.missionId), scene);
    assert.equal(governance.sceneFor(scene.missionId, 'unknown-action'), scene);
  }
  assert.equal(count, 15);
  assert.equal(JSON.stringify(governance.CONFIG), before, 'Reading dialogue never mutates content');
});

test('medical training and mobile care never inherit the three-clinic construction conversation', () => {
  for (const action of ['train-staff', 'mobile-units']) {
    const scene = governance.sceneFor('rural-healthcare', action);
    for (const language of ['ru', 'en', 'zh']) {
      const text = [...scene.speeches, ...scene.questions].map(line => local(line, language)).join('\n');
      assert.doesNotMatch(text, /три клиники|трёх клиник|после стройки|Three clinics|after construction|三所诊所|建成后/i);
    }
  }
  assert.match(governance.sceneFor('rural-healthcare', 'train-staff').speeches[0].ru, /подготовку местных медицинских кадров/);
  assert.match(governance.sceneFor('rural-healthcare', 'clinics').speeches[0].en, /Three clinics/);
  assert.match(governance.sceneFor('school-neighbourhood', 'school-bus').speeches[2].ru, /Автобус/);
  assert.match(governance.sceneFor('river-legacy', 'climate-insurance-pool').questions[0].en, /insurance programme/);
});

test('the negotiation UI follows the selected action and actor in all three languages', async () => {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {focus() {}, classList: {add() {}, remove() {}}});
    return nodes.get(selector);
  };
  const participants = governance.CONFIG.actors.map(actor => ({dataset: {participant: actor.id}, focus() {}}));
  const dialog = {innerHTML: '', showModal() {}, close() {}, setAttribute() {},
    querySelector: node, querySelectorAll: selector => selector === '[data-participant]' ? participants : []};
  sandbox.document = {activeElement: null, getElementById: id => id === 'negotiation-dialog' ? dialog : null};
  let currentMission, language = 'ru';
  const state = {turnIndex: 0, population: {baseYear: 2026}, governance: {trust: {municipality: 0, finance: 0, residents: 0}}};
  G.icon = () => '';
  G.resolveAsset = input => 'https://example.test/RUDN/' + input;
  G.Engine = {
    localise: local, setAgreementTerms() {},
    previewAction(_state, actionId) {
      return {mission: currentMission, action: currentMission.actions.find(action => action.id === actionId),
        agreement: {termIds: [], promises: [], status: 'open', positions: governance.CONFIG.actors.map(actor => ({actorId: actor.id, stance: 'cautious'}))},
        plan: {id: 'treasury', treasuryCost: 1, firstYearOpex: 0}, project: {startsIn: 1}, affordable: true};
    }
  };
  vm.runInContext(await readFile(new URL('src/governance-ui.js', source), 'utf8'), sandbox, {filename: 'governance-ui.js'});
  G.GovernanceUI.init({getState: () => state, getLanguage: () => language, save() {}, refresh() {}, commit() {}});
  const original = JSON.stringify(governance.CONFIG);
  for (const scene of governance.CONFIG.scenes) {
    currentMission = G.DATA.missions.find(mission => mission.id === scene.missionId);
    for (const action of currentMission.actions.filter(item => !item.deferred)) {
      for (language of ['ru', 'en', 'zh']) {
        G.GovernanceUI.openMeeting(action.id, 'treasury');
        const selected = governance.sceneFor(scene.missionId, action.id);
        for (let actor = 0; actor < participants.length; actor++) {
          participants[actor].onclick();
          assert.ok(dialog.innerHTML.includes(`<blockquote aria-live="polite">${esc(local(selected.speeches[actor], language))}</blockquote>`), `${action.id}/${language}/${actor}`);
          node('[data-inquiry]').onclick();
          assert.ok(dialog.innerHTML.includes(`<blockquote aria-live="polite">${esc(local(selected.questions[actor], language))}</blockquote>`), `${action.id}/${language}/${actor}/inquiry`);
          for (const match of dialog.innerHTML.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
            assert.ok(match[1].startsWith('https://example.test/RUDN/'), 'A portrait or meeting image bypassed the resolver');
          }
          if (language !== 'ru') assert.doesNotMatch(dialog.innerHTML, /[\u0400-\u04ff]/);
        }
      }
    }
  }
  assert.equal(JSON.stringify(governance.CONFIG), original);
});

test('persistent agenda chapters follow elapsed years while legacy campaigns retain mission chapters', async () => {
  vm.runInContext(await readFile(new URL('src/world-model.js', source), 'utf8'), sandbox, {filename: 'world-model.js'});
  let persistent = true, missionChapter = 1;
  G.Agenda = {persistent: () => persistent, mission: () => ({chapter: missionChapter}), mode: () => 'agenda', byId: () => null};
  const state = {turnIndex: 0, population: {baseYear: 2026}, finance: {portfolio: []}, history: []};
  for (const [turnIndex, chapter] of [[0, 1], [4, 1], [5, 2], [9, 2], [10, 3], [14, 3], [15, 4], [19, 4]]) {
    state.turnIndex = turnIndex;
    const card = G.WorldModel.chapterCard(state);
    assert.equal(card.id, chapter, 'An old pending question must not rewind the chronological chapter');
    assert.equal(card.year, 2026 + turnIndex);
    for (const language of ['ru', 'en', 'zh']) {
      for (const value of [card, card.lead, card.question]) {
        const rendered = G.WorldModel.local(value, language);
        assert.ok(rendered.trim());
        if (language !== 'ru') assert.doesNotMatch(rendered, /[\u0400-\u04ff]/);
      }
    }
  }
  persistent = false; missionChapter = 2;
  assert.equal(G.WorldModel.chapterCard(state).id, 2, 'Historical campaigns keep their mission-based presentation');
  state.completed = true;
  assert.equal(G.WorldModel.chapterCard(state).id, 4);
});
