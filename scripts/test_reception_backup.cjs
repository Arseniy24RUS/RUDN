// Student saving regression after removal of manual JSON backups.
// Synthetic preview work only, with all external requests blocked.
const assert = require('node:assert/strict');
const {chromium, webkit} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const base = process.env.MODULE_TEST_URL || 'http://127.0.0.1:8765/';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base)) throw Error('Localhost only');
const fixture = '<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reception autosave test</title><main id="module"></main></html>';
const backend = `export const backend = {
  user:null,isAdmin:()=>false,getProfile:()=>null,
  ensureDiagnosticIdentity:async()=>null,
  saveAttempt:()=>{throw Error('Preview never submits a grade');}
};`;
async function mount(page) {
  await page.evaluate(async () => {
    const {mountStandalone} = await import('/apps/reception/js/standalone.js');
    window.handle = await mountStandalone(document.querySelector('#module'));
  });
  await page.locator('.rx-nav').waitFor();
}
(async () => {
  const engine = await import(pathToFileURL(path.resolve('site/apps/reception/js/engine.js')));
  const period = engine.academicPeriod();
  const state = await engine.newShiftPrepared('preview', 'practice', {
    period, calendarYear:2026, seed:'standalone-autosave',
    id:'synthetic-standalone-autosave', templateId:'court-typo-not-merits'
  });
  state.cases[state.caseIds[0]].knowledge.lawNumber = 'Сохранённый исходный ввод';
  state.cases[state.caseIds[0]].phase = 'research';
  state.revision = 3;
  state.screen = 'work';
  const key = `rudn.reception.v16:preview:${period}:practice`;
  for (const name of (process.env.DURABLE_TEST_BROWSERS || 'chromium,webkit').split(',')) {
    const browser = await ({chromium, webkit}[name]).launch({headless:true});
    const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname.endsWith('/autosave-qa.html')) return route.fulfill({contentType:'text/html',body:fixture});
      if (url.pathname.endsWith('/assets/js/backend.js')) return route.fulfill({contentType:'text/javascript',body:backend});
      return route.continue();
    });
    try {
      await page.goto(base + 'autosave-qa.html');
      await page.evaluate(({key,state}) => {
        localStorage.setItem(key, JSON.stringify(state));
        localStorage.setItem('other-profile-progress','untouched');
      }, {key,state});
      await mount(page);
      assert.equal(await page.locator('[data-field="knowledge.lawNumber"]').inputValue(), 'Сохранённый исходный ввод');
      assert.equal(await page.locator('[data-action="export"],[data-action="legacy"],a[href*="art-library"]').count(), 0);
      await page.locator('[data-action="help"]').click();
      assert.equal(await page.locator('.rx-help-dialog[open]').count(), 1);
      assert.equal(await page.locator('[data-local-backup],[data-local-restore],.rx-help-dialog input[type="file"]').count(), 0);
      assert.match(await page.locator('.rx-help-dialog').innerText(), /Ответы сохраняются автоматически/);
      await page.locator('.rx-help-close').click();
      await page.locator('[data-field="knowledge.lawNumber"]').fill('Мой сохранённый ответ 59-ФЗ');
      await page.waitForFunction(({key}) => JSON.parse(localStorage.getItem(key)).cases[JSON.parse(localStorage.getItem(key)).caseIds[0]].knowledge.lawNumber === 'Мой сохранённый ответ 59-ФЗ', {key});
      await page.reload();
      await mount(page);
      assert.equal(await page.locator('[data-field="knowledge.lawNumber"]').inputValue(), 'Мой сохранённый ответ 59-ФЗ');
      const saved = await page.evaluate(({key}) => ({state:JSON.parse(localStorage.getItem(key)),other:localStorage.getItem('other-profile-progress')}), {key});
      assert.equal(saved.state.id, state.id);
      assert.deepEqual(saved.state.assignment, state.assignment);
      assert.equal(saved.other, 'untouched');
      await page.locator('[data-action="tab"][data-tab="history"]').click();
      assert.equal(await page.locator('[data-action="export"]').count(), 0);
      assert.deepEqual(errors, []);
      console.log(name + ': PASS automatic save, reload, assignment identity, clean history and help');
    } finally {
      await context.close();
      await browser.close();
    }
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
