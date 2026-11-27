import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { G, E, fresh, defer } from './helpers/governor-gameplay.mjs';

const game = {...G, icon: () => '', DeliveryUI: {managementChoices: () => '', bindManagement() {}}};
const context = vm.createContext({GovernorGame: game});
for (const file of ['locales/zh-Hans', 'src/i18n', 'src/world-model', 'src/population-ui', 'src/agenda-ui']) {
  const source = await readFile(new URL('../site/apps/governor/' + file + '.js', import.meta.url), 'utf8');
  vm.runInContext(source, context, {filename: file});
}

test('the single-window resident preview leads with the calculated digital access change in every language', () => {
  const state = fresh();
  E.chooseAgenda(state, 'digital-services');
  const quote = E.previewAction(state, 'single-window', 'treasury');
  assert.equal(G.Agenda.metricFor(quote.mission), 'digitalAccess');
  const delta = quote.people.change.digitalAccess;
  assert.ok(delta > .005);
  for (const [lang, title] of Object.entries({ru:'Цифровая доступность', en:'Digital access', zh:'数字服务可及性'})) {
    const html = game.PopulationUI.preview(quote, state, lang);
    assert.ok(html.includes('<p>' + title + ' ↑ ' + Math.round(delta * 100) + ' '), lang);
  }
});

test('the youth-outflow topic shows the district’s current 18–34 cohort and last annual change', () => {
  const state = fresh();
  while (!G.Agenda.pending(state).some(t => t.id === 'youth-outflow')) {
    assert.ok(state.turnIndex < 20);
    defer(state);
  }
  const district = G.Agenda.byId('youth-outflow').districtId;
  const last = state.population.ledgers.at(-1).municipalities[district];
  const count = last.cohortsAfter[1];
  const delta = count - last.cohortsBefore[1];
  for (const [lang, labels] of Object.entries({
    ru:['Жителей 18–34 лет', 'за год'], en:['Residents aged 18–34:', 'annual change'], zh:['18至34岁居民', '年变化']
  })) {
    const format = new Intl.NumberFormat(game.I18n.intlLocale(lang));
    const host = {classList:{add() {}}, querySelectorAll:() => []};
    game.AgendaUI.init({state:() => state, language:() => lang});
    game.AgendaUI.render(host);
    const row = host.innerHTML.split('data-agenda-topic="youth-outflow"')[1].split('</button>')[0];
    assert.ok(row.includes(labels[0] + ' ' + format.format(count)), lang);
    assert.ok(row.includes(labels[1] + ' ' + (delta > 0 ? '+' : '') + format.format(delta)), lang);
  }
});
