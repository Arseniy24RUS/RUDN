// Isolated rendering-contract checks. No Firebase, real profiles, or source-data writes.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const files = Object.fromEntries(await Promise.all(['runtime.js', 'ui.js', 'catalog-loader.js', 'validation.js'].map(async name => [`/${name}`, await readFile(new URL(name, import.meta.url))])));
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (files[request.url]) { response.setHeader('Content-Type', 'text/javascript'); response.end(files[request.url]); }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Reception localization contract tests</title><main id="fixture"></main>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  for (const engine of (process.env.DURABLE_TEST_BROWSERS || 'chromium,webkit').split(',')) {
    const browser = await playwright[engine].launch({headless: true});
    try {
      const page = await browser.newPage({viewport: {width: 390, height: 844}});
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const result = await page.evaluate(async () => {
        const {createReceptionTranslator, loadReceptionTranslator} = await import('/runtime.js');
        const check = (value, message) => { if (!value) throw Error(message); };
        const root = document.querySelector('#fixture');
        const state = {id: 'unchanged-attempt', seed: 'unchanged-order', active: 3, cases: {'case-3': {fact: 'a', text: 'Приёмная'}}, startedAt: 1, completed: false};
        const before = JSON.stringify(state);
        const source = '<h1>Приёмная</h1><p data-case>Получено {{received}}, зарегистрировано {{registered}}.</p><p data-counter>Выбрано 1 из 2</p><p data-user-name data-rx-user-content>Приёмная</p><input name="answer" value="Приёмная" placeholder="Найдите правовое основание"><textarea>Приёмная</textarea><select><option value="original-id">Документы</option><option>Источники</option></select><button data-action="Документы" aria-label="Документы">Документы</button>';
        const languageText = {en: 'Received {{received}}, registered {{registered}}.', zh: '收到日期{{received}}，登记日期{{registered}}。'};
        for (const locale of ['ru', 'en', 'zh', 'ru']) {
          root.innerHTML = source.replace('{{received}}', '05.09.2026').replace('{{registered}}', '08.09.2026');
          const translator = createReceptionTranslator({locale, catalog: {'Получено {{received}}, зарегистрировано {{registered}}.': languageText[locale]}});
          translator.apply(root);
          check(root.lang === (locale === 'zh' ? 'zh-Hans' : locale), 'accessibility language not restored');
          check(root.querySelector('input').value === 'Приёмная', 'typed answer was translated');
          check(root.querySelector('textarea').value === 'Приёмная', 'textarea was translated');
          check(root.querySelector('[data-user-name]').textContent === 'Приёмная', 'profile text was translated');
          check(root.querySelector('button').dataset.action === 'Документы', 'action ID was translated');
          check(root.querySelector('select').options[0].value === 'original-id', 'explicit option ID changed');
          check(root.querySelector('select').options[1].value === 'Источники', 'implicit option value changed');
          check(JSON.stringify(state) === before, 'state, order or attempt changed');
          if (locale !== 'ru') {
            check(!/[А-Яа-яЁё]/.test(root.querySelector('h1').textContent), 'heading fallback');
            check(!/[А-Яа-яЁё]/.test(root.querySelector('[data-case]').textContent), 'dated paragraph fallback');
            check(!/[А-Яа-яЁё]/.test(root.querySelector('[data-counter]').textContent), 'counter fallback');
            check(root.querySelector('[data-case]').textContent.includes('05.09.2026'), 'first date lost');
            check(root.querySelector('[data-case]').textContent.includes('08.09.2026'), 'second date lost');
            check(translator.missing().length === 0, 'unexpected missing fixture translation');
          } else check(root.querySelector('h1').textContent === 'Приёмная', 'Russian not restored');
        }
        // A mixed assignment may load the generic date paragraph before the
        // specific one. Its final date slot must never consume an extra sentence.
        const generic='Получено {{received}}, зарегистрировано {{registered}}.';
        const specific=generic+' Пристав получил ходатайство {{officialReceived}}.';
        for(const locale of ['en','zh'])for(const reverse of [false,true]){
          const entries=[[generic,languageText[locale]],[specific,languageText[locale]+(locale==='en'?' The bailiff received the motion on {{officialReceived}}.':' 执行员于{{officialReceived}}收到申请。')]];
          const translator=createReceptionTranslator({locale,catalog:Object.fromEntries(reverse?entries.reverse():entries)});
          const dates={received:'11.11.2026',registered:'12.11.2026',officialReceived:'13.11.2026'};
          const fill=text=>text.replace(/\{\{(\w+)\}\}/g,(_,key)=>dates[key]);
          root.replaceChildren();
          for(const [source,target] of entries){
            const p=document.createElement('p');p.textContent=fill(source);p.dataset.expected=fill(target);root.append(p);
          }
          translator.apply(root);
          for(const p of root.children)check(p.textContent===p.dataset.expected,'Mixed-pack date paragraph used a generic translation');
          const rendered=root.innerHTML;translator.apply(root);
          check(root.innerHTML===rendered&&translator.missing().length===0,'Mixed-pack date localization must be complete and idempotent');
        }
        // Full WebKit shift regression: this evidence caption is not a level
        // badge, despite ending in the same Russian word.
        for(const locale of ['en','zh']){
          const catalog=locale==='en'?{'Муниципальный округ Нижегородский':'Nizhegorodsky Municipal District','Наименование и уровень':'Name and level'}:{'Муниципальный округ Нижегородский':'下诺夫哥罗德市镇区','Наименование и уровень':'名称与层级'};
          const translator=createReceptionTranslator({locale,catalog});
          check(translator.translate('Муниципальный округ Нижегородский · Наименование и уровень')===catalog['Муниципальный округ Нижегородский']+' · '+catalog['Наименование и уровень'],'Evidence caption mistaken for difficulty template');
          for(const level of ['Базовый','Средний','Сложный'])check(!/[А-Яа-яЁё]/.test(translator.translate('Документы · '+level+' уровень')),'Known difficulty label no longer translates');
          check(translator.missing().length===0,'False missing caption or level translation');
        }
        // CI full-shift regression: a month in a document title is not a
        // numeric calendar counter. Check both label composition and the real
        // DOM accessibility attribute as comparison is selected/unselected.
        const documentTitle='График на будущий месяц';
        for(const locale of ['ru','en','zh','ru']){
          const title=locale==='zh'?'下月计划':locale==='en'?'Schedule for the coming month':documentTitle;
          const translator=createReceptionTranslator({locale,catalog:{[documentTitle]:title}});
          root.innerHTML='<button data-action="compare-document" data-id="d2" aria-pressed="false" aria-label="Сопоставить: '+documentTitle+'">Сопоставить</button><input value="'+documentTitle+'">';
          const control=root.querySelector('button');
          translator.apply(root);
          check(control.getAttribute('aria-label')===translator.translate('Сопоставить:')+' '+title,'Month title misread as a count in comparison aria-label');
          control.onclick=()=>{control.setAttribute('aria-pressed','true');control.setAttribute('aria-label','Убрать из сравнения: '+documentTitle);translator.apply(root);};
          control.click();
          check(control.getAttribute('aria-label')===translator.translate('Убрать из сравнения:')+' '+title,'Selected comparison label lost full document title');
          check(control.dataset.id==='d2'&&control.getAttribute('aria-pressed')==='true','Comparison identity or selected state changed');
          check(root.querySelector('input').value===documentTitle,'Typed text was altered by caption repair');
          for(const count of ['0','1','2','12','1000'])for(const suffix of ['месяц','месяца','месяцев','рабочий день','рабочих дня','рабочих дней','календарный день','календарных дня','календарных дней']){
            const rendered=translator.translate(count+' '+suffix);
            check(rendered.includes(count),'Numeric calendar counter lost');
            if(locale!=='ru')check(!/[А-Яа-яЁё]/.test(rendered),'Numeric calendar counter translation regressed');
          }
          check(translator.missing().length===0,'Unexpected missing document-label or counter translation');
        }
        // The bank contains deliberately distinct title/sentence-case copies.
        // Composed labels must use the exact same authored translation as the
        // standalone title, including the Cyrillic document identifier.
        for(const locale of ['ru','en','zh']){
          const catalog=locale==='zh'?{'Акт вручения МПО-93':'投递记录МПО-93','акт вручения МПО-93':'MPO-93 交付记录','Обращение и предложенный график':'来函与所提履行计划','обращение и предложенный график':'来函及拟议时间表'}:{'Акт вручения МПО-93':'Delivery report МПО-93','акт вручения МПО-93':'delivery report MPO-93','Обращение и предложенный график':'Submission and proposed schedule','обращение и предложенный график':'submission and proposed schedule'};
          const translator=createReceptionTranslator({locale,catalog});
          for(const title of Object.keys(catalog))for(const prefix of ['Сопоставить:','Убрать из сравнения:']){
            const expected=translator.translate(prefix)+' '+translator.translate(title);
            check(translator.translate(prefix+' '+title)===expected,'Composed document title lost exact source case or identifier');
          }
          check(translator.missing().length===0,'Exact document identifier was rejected as Russian fallback');
        }
        let missingCalls = 0;
        const unknown = createReceptionTranslator({locale: 'en', onMissing: () => missingCalls++});
        check(unknown.translate('Неизвестный авторский абзац') === 'Неизвестный авторский абзац', 'unknown content silently fabricated');
        unknown.translate('Неизвестный авторский абзац'); check(missingCalls === 1, 'missing diagnostics not deduplicated');
        let rejected = false;
        try { await loadReceptionTranslator('en', {fetch: async () => ({ok: true, json: async () => ({locale: 'en', complete: false, strings: {}})})}); } catch { rejected = true; }
        check(rejected, 'incomplete catalog accepted as complete');
        const pack={schema:2,locale:'en',id:'common',complete:true,contentVersion:'fixture',sourceVersion:'a'.repeat(64),count:1,strings:{'Полный абзац':'Full paragraph'}};
        const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(pack))))].map(v=>v.toString(16).padStart(2,'0')).join('');
        const entry={path:'en/common.'+checksum.slice(0,16)+'.json',sha256:checksum,count:1};
        const manifest={schema:2,locale:'en',complete:true,contentVersion:'fixture',sourceVersion:'a'.repeat(64),templates:[],entries:{common:entry,catalog:{},'source-index':{}}};
        const loaded = await loadReceptionTranslator('en', {fetch: async url => ({ok: true, json: async () => String(url).includes('.manifest.json')?manifest:pack})});
        check(loaded.translate('Полный абзац') === 'Full paragraph', 'catalog failed after incomplete load retry');
        return {languages: 4, immutableState: true, userContentPreserved: true, datesPreserved: true, mixedPackDateTemplates: true, documentComparisonLabels: true, numericCounters: true, incompleteCatalogRejected: true};
      });
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(`${engine}: ${JSON.stringify(result)}`);
    } finally { await browser.close(); }
  }
} finally { server.close(); }
