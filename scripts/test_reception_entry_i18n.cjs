// Actual platform entry point, synthetic teacher and deliberately delayed/failed
// Reception import. No Firebase, student records or external network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const base = process.env.QA_BASE || 'http://127.0.0.1:8765/';
const origin = new URL(base).origin;
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('Reception entry QA requires localhost');
}
const output = process.env.QA_OUT || path.join(os.tmpdir(), 'rudn-reception-entry-i18n');
fs.mkdirSync(output, { recursive: true });

const expected = {
  ru: ['Открываем приёмную…', 'Не удалось открыть приёмную', 'Сохранённые ответы остаются на устройстве.', 'Повторить загрузку'],
  en: ['Opening public reception…', 'Unable to open public reception', 'Your saved answers remain on this device.', 'Retry loading'],
  zh: ['正在打开公众接待室…', '无法打开公众接待室', '已保存的答案仍保留在本设备上。', '重新加载'],
};
const fakeBackend = `
export const groupOptions = () => Array.from({length:6}, (_, i) => 'ГГУбд-0'+(i+1)+'-26');
export const backend = {
  user: {uid:'entry-qa-teacher',displayName:'Synthetic Entry QA',email:'entry-qa@example.test'},
  authReady:true,connected:true,serverTimeOffset:0,
  isAdmin:()=>true,getProfile:()=>null,globalNow:()=>new Date('2026-09-13T09:00:00Z'),
  getAccessOverrides:()=>({}),init:async()=>{},onStatus:()=>()=>{},status:()=>({connected:true}),
  localGrades:()=>({}),localAttempts:()=>[],getGrades:async()=>({}),getAttempts:async()=>[],
};`;

(async () => {
  for (const engine of (process.env.DURABLE_TEST_BROWSERS || 'chromium,webkit').split(',')) {
    const browser = await playwright[engine].launch({ headless: true });
    try {
      for (const locale of ['ru', 'en', 'zh']) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        const page = await context.newPage();
        const errors = [], external = [];
        let releaseImport;
        const importGate = new Promise(resolve => { releaseImport = resolve; });
        let importRequests = 0;
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error' && !message.text().startsWith('Reception module:')) errors.push(message.text());
        });
        await context.addInitScript(locale => localStorage.setItem('rudn.locale', locale), locale);
        await context.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) {
            external.push(url.origin);
            return route.abort();
          }
          if (url.pathname.endsWith('/assets/js/backend.js')) {
            return route.fulfill({ contentType: 'application/javascript', body: fakeBackend });
          }
          if (url.pathname.endsWith('/apps/reception/js/app.js')) {
            importRequests++;
            await importGate;
            return route.fulfill({ contentType: 'application/javascript', body: "throw new Error('synthetic-reception-import-failure');" });
          }
          return route.continue();
        });
        try {
          await page.goto(base + '#activity/seminar-5', { waitUntil: 'domcontentloaded' });
          assert.equal(new URL(page.url()).hash, '#activity/seminar-5');
          await page.locator('#receptionMount[aria-busy="true"] [role="status"]').waitFor();
          assert.equal(await page.locator('#receptionMount [role="status"]').innerText(), expected[locale][0]);
          assert.equal(await page.locator('#topName').innerText(), 'Synthetic Entry QA');
          await page.screenshot({ path: path.join(output, `${engine}-${locale}-loading.png`) });
          releaseImport();
          await page.locator('#receptionMount[aria-busy="false"] #receptionRetry').waitFor();
          assert.deepEqual(await page.locator('#receptionMount [role="alert"]').evaluate(el => [
            el.querySelector('h2').textContent,
            el.querySelector('p').textContent,
            el.querySelector('button').textContent,
          ]), expected[locale].slice(1));
          assert.equal(await page.locator('#receptionRetry').isEnabled(), true);
          assert.equal(await page.locator('.rudn-notice').count(), 0);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
          assert.equal(await page.locator('vite-error-overlay,[data-nextjs-dialog],webpack-dev-server-client-overlay').count(), 0);
          assert.equal(importRequests, 1, 'One delayed import, no repeated background loads');
          assert.deepEqual(errors, [], 'No unexpected JavaScript errors');
          assert.deepEqual(external, [], 'No access to production or third-party services');
          await page.screenshot({ path: path.join(output, `${engine}-${locale}-failure.png`) });
          console.log(`PASS ${engine}/${locale}: real platform loading and import-error copy is localized.`);
        } finally {
          releaseImport();
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
