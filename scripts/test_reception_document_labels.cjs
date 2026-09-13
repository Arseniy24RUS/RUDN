// Exhaustive browser DOM localization of compound document/action/evidence
// labels. Uses one assigned locale pack at a time, never an all-bank dictionary
// that could conceal a missing case dependency. Canonical data is read-only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.MODULE_TEST_URL || 'http://127.0.0.1:8765/';
const origin = new URL(base).origin;
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Localhost QA only');
const output = process.env.QA_OUT || path.join(os.tmpdir(), 'rudn-reception-document-labels');
fs.mkdirSync(output, {recursive:true});

(async () => {
  for (const engine of (process.env.DURABLE_TEST_BROWSERS || 'chromium,webkit').split(',')) {
    const browser = await playwright[engine].launch({headless:true});
    const context = await browser.newContext({serviceWorkers:'block'});
    const errors = [], external = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {external.push(url.origin);return route.abort();}
      if (url.pathname.endsWith('/reception-document-labels-qa.html')) {
        return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Reception compound label QA</title><main id="fixture"></main>'});
      }
      return route.continue();
    });
    try {
      await page.goto(base + 'reception-document-labels-qa.html');
      const result = await page.evaluate(async () => {
        const library = await import('/apps/reception/js/content-library.js');
        const {loadReceptionTranslator} = await import('/apps/reception/localization/runtime.js');
        const {evidenceTask,evidenceRecord} = await import('/apps/reception/js/evidence.js');
        const root = document.querySelector('#fixture');
        const ids = library.CASE_TEMPLATES.map(template => template.id);
        const failures = [], totals = {templates:ids.length,variants:0,documentLabels:0,actionLabels:0,evidenceCaptions:0};
        const languages = {};
        const compact = text => String(text).replace(/\s+/g,'');
        for (const locale of ['en','zh']) {
          const counts = {variants:0,documentLabels:0,actionLabels:0,evidenceCaptions:0};
          for (const templateId of ids) {
            await library.hydrateTemplates([templateId]);
            const template = library.requireTemplate(templateId);
            const before = JSON.stringify(template);
            const missing = [];
            const translator = await loadReceptionTranslator(locale,{
              templateIds:[templateId],contentVersion:library.CONTENT_VERSION,
              onMissing:source => missing.push(source),
            });
            for (const datePack of template.datePacks) {
              const c = library.instantiateCase(template,datePack.id);
              const rows = [];
              root.replaceChildren();
              const paragraph = text => {const p=document.createElement('p');p.textContent=text;root.append(p);return p;};
              const compound = (prefix,text,id,kind) => {
                const button=document.createElement('button');
                const source=prefix+' '+text;
                button.type='button';button.dataset.id=id;button.dataset.action=kind;
                button.setAttribute('aria-label',source);button.setAttribute('title',source);
                button.textContent=text;root.append(button);
                const expected=translator.translate(prefix)+' '+translator.translate(text);
                rows.push({button,id,kind,source,expected});
              };
              for (const d of c.documents) {
                paragraph(d.type);paragraph(d.title);paragraph(d.text);
                compound('Сопоставить:',d.title,d.id,'compare-document');
                compound('Убрать из сравнения:',d.title,d.id,'compare-document');
                counts.documentLabels+=2;
                const input=document.createElement('input');input.type='checkbox';input.dataset.docEvidence=d.id;input.value=d.id;input.checked=true;root.append(input);
              }
              for (const action of c.actions) {
                for (const prefix of ['Поднять:','Опустить:','Убрать:']) compound(prefix,action.title,action.id,'order-action');
                counts.actionLabels+=3;
              }
              for (const recordId of evidenceTask(c).recordIds) {
                const record=evidenceRecord(recordId,c);
                const scope=/^Только дело /.test(record.scope||'')?'Материалы текущего дела':record.scope;
                paragraph(record.kind+' · '+scope);
                for (const fragment of record.fragments) {
                  // Practice uses the full title; assessment uses a neutral
                  // caption for fictional/author-created case materials.
                  const titles=[record.title];
                  if(/Учебный материал|Авторский пакет/.test(record.kind+' '+record.publisher))titles.push('Материалы обращения');
                  for (const title of titles) {paragraph(title+' · '+fragment.label);counts.evidenceCaptions++;}
                }
              }
              for (const level of ['Базовый','Средний','Сложный']) paragraph(c.topic+' · '+level+' уровень');
              const protectedInput=document.createElement('input');protectedInput.value='Сопоставить: ответ студента';protectedInput.name='canonical-answer';root.append(protectedInput);
              translator.apply(root);
              for (const row of rows) {
                const actual=row.button.getAttribute('aria-label');
                if (compact(actual)!==compact(row.expected)) failures.push({locale,templateId,variant:c.id,kind:'compound-mismatch',source:row.source,actual,expected:row.expected});
                if (row.button.dataset.id!==row.id||row.button.dataset.action!==row.kind||row.button.getAttribute('title')!==actual) throw Error('Canonical control attributes changed');
              }
              const once=root.innerHTML;translator.apply(root);
              if(root.innerHTML!==once)throw Error('Repeated DOM localization changed rendered labels');
              if(protectedInput.value!=='Сопоставить: ответ студента')throw Error('Typed answer was translated');
              for(const input of root.querySelectorAll('[data-doc-evidence]'))if(input.value!==input.dataset.docEvidence||!input.checked)throw Error('Documentary answer changed');
              counts.variants++;
            }
            for (const source of missing) failures.push({locale,templateId,kind:'missing',source});
            if (JSON.stringify(template)!==before) throw Error('Canonical case content changed');
          }
          languages[locale]=counts;
          for (const [key,value] of Object.entries(counts)) totals[key]+=value;
        }
        return {totals,languages,expectedVariants:library.BANK_INFO.instances,failures};
      });
      fs.writeFileSync(path.join(output,`${engine}.json`),JSON.stringify(result,null,2));
      assert.deepEqual(errors,[],'No browser errors');
      assert.deepEqual(external,[],'No external or production requests');
      assert.equal(result.totals.templates,178,'The complete current template bank is included');
      for(const counts of Object.values(result.languages)) assert.equal(counts.variants,result.expectedVariants,'Every dated variant is checked');
      assert.equal(result.failures.length,0,JSON.stringify(result.failures.slice(0,12),null,2));
      console.log(`PASS ${engine}: ${JSON.stringify(result.totals)}; EN/ZH, zero missing or mismatched labels.`);
    } finally {
      await browser.close();
    }
  }
})().catch(error => {console.error(error);process.exitCode=1;});
