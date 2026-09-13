// Real rendered shell; cloud requests are redirected to local emulators only.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.QA_BASE || 'http://127.0.0.1:8765/';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base)) throw Error('Localhost only');
const out = process.env.QA_OUT || path.join(require('node:os').tmpdir(), 'rudn-platform-i18n');
fs.mkdirSync(out, { recursive: true });
const config = fs.readFileSync('site/assets/js/config.js', 'utf8').replace(/export const CONFIG\s*=\s*\{/, 'export const CONFIG = {emulators:{auth:"http://127.0.0.1:9099",host:"127.0.0.1",databasePort:9000},');
const source = fs.readFileSync('site/assets/js/main.js', 'utf8');
const i18nUrl = '/assets/js/' + source.match(/from '\.\/(i18n\.js[^']*)'/)[1];
const expected = {
  ru: ['Главная страница курса', 'Выбор языка интерфейса', 'Мобильная навигация', 'Закрыть', 'Учебная группа', '1234567890 или 1234567890@rudn.ru'],
  en: ['Course home', 'Interface language', 'Mobile navigation', 'Close', 'Study group', '1234567890 or 1234567890@rudn.ru'],
  zh: ['课程首页', '界面语言', '移动端导航', '关闭', '班级', '1234567890 或 1234567890@rudn.ru'],
};
(async () => {
  for (const engine of (process.env.DURABLE_TEST_BROWSERS || 'chromium,webkit').split(',')) {
    const browser = await playwright[engine].launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'ru-RU' });
    const errors = [];
    await context.route('**/assets/js/config.js*', route => route.fulfill({ contentType: 'application/javascript', body: config }));
    await context.route(/https:\/\/.*(?:googleapis\.com|firebaseio\.com|firebasedatabase\.app|firebaseapp\.com)\//, route => {
      errors.push('Unexpected production request: ' + new URL(route.request().url()).hostname);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base + '#dashboard');
      await page.locator('#app[aria-busy="false"]').waitFor();
      await page.locator('#profileButton').click();
      await page.locator('#authIdentifier').fill('123');
      await page.locator('#authIdentifier').evaluate(el => el.setSelectionRange(1, 2));
      for (const locale of ['en', 'zh', 'ru']) {
        await page.evaluate(async ({ url, locale }) => (await import(url)).setLocale(locale), { url: i18nUrl, locale });
        assert.deepEqual(await page.evaluate(() => [
          document.querySelector('.brand').getAttribute('aria-label'),
          document.querySelector('.language-switcher').getAttribute('aria-label'),
          document.querySelector('.mobile-nav').getAttribute('aria-label'),
          document.querySelector('#authForm .modal-close').getAttribute('aria-label'),
          document.querySelector('#authGroupOptions').getAttribute('aria-label'),
          document.querySelector('#authIdentifier').getAttribute('placeholder'),
        ]), expected[locale]);
        assert.deepEqual(await page.locator('#authIdentifier').evaluate(el => [el.value, el.selectionStart, el.selectionEnd, document.activeElement === el]), ['123', 1, 2, true]);
        assert.equal(await page.locator('#authStudentDetails').isVisible(), false);
        assert.equal(await page.locator('.rudn-notice').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.screenshot({ path: path.join(out, `${engine}-${locale}-390.png`) });
      }
      assert.deepEqual(errors, []);
      console.log('PASS ' + engine + ': localized navigation/accessibility/login hints; input, selection, focus unchanged.');
    } finally {
      await browser.close();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
