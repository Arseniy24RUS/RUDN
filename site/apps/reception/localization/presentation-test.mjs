// Real DOM contract fixture with genuine small translations, not production packs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
const playwright=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const site=new URL('../../../',import.meta.url);
const inventory=JSON.parse(await readFile(new URL('source/inventory.json',import.meta.url),'utf8'));
const typo=inventory.entries.find(entry=>entry.id==='9d4b35f1aca75fc1');
const server=createServer(async(request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  if(pathname==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reception presentation contract</title><main id="fixture"></main>');return;}
  const file=new URL('.'+pathname,site);
  if(!file.href.startsWith(site.href)||!pathname.endsWith('.js')){response.statusCode=404;response.end();return;}
  try{response.setHeader('Content-Type','text/javascript');response.end(await readFile(file));}catch{response.statusCode=404;response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
  for(const engine of (process.env.DURABLE_TEST_BROWSERS||'chromium,webkit').split(',')){
    const browser=await playwright[engine].launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const results=await page.evaluate(async({typo})=>{
        const {createReceptionPresentation,filterLocalizedCaseCatalog,localizedCatalogTopics,localizedMonthLabel,localizedReplyParts}=await import('/apps/reception/localization/presentation.js');
        const {createReceptionTranslator}=await import('/apps/reception/localization/runtime.js');
        const check=(condition,label)=>{if(!condition)throw Error(label);},root=document.querySelector('#fixture');
        const catalogs={
          en:{'Доступность':'Accessibility','Получено {{received}}, зарегистрировано {{registered}}.':'Received {{received}}, registered {{registered}}.','Правовая помощь':'Legal assistance',[typo.ru]:'The district court ordered payment of a specified amount. The debtor’s surname appears once as “Соловёв” instead of “Соловьёв”. The passport details, date of birth and other parts of the document agree; the amount contains no arithmetic discrepancy.'},
          zh:{'Доступность':'无障碍服务','Получено {{received}}, зарегистрировано {{registered}}.':'收到日期{{received}}，登记日期{{registered}}。','Правовая помощь':'法律援助',[typo.ru]:'地区法院判令支付特定金额。债务人的姓氏有一处写为“Соловёв”，而不是“Соловьёв”。护照信息、出生日期与文书其他部分一致；金额不存在算术差错。'},
        };
        let owner='student:synthetic-a',flushes=0,renders=0,hold=false,reject=false,pendingResolve;
        const statuses=[],missing=[];
        const state={id:'same-attempt',seed:'same-order',contentVersion:'fixture',assignment:{manifest:[{templateId:'court-typo-not-merits'}]},caseIds:['case'],active:0,startedAt:12345,completed:false,cases:{case:{phase:'history',fact:'a',knowledge:{lawNumber:'Приёмная'},calendar:{answer:'Доступность'}}}};
        const html=()=>`<header class="rx-profile"><span>Доступность</span></header><h1>Дело 4 из 8 · Обращение: Доступность</h1><p data-dates>Получено 05.09.2026, зарегистрировано 08.09.2026.</p><p data-month>сентябрь 2026 г.</p><p data-weekday>Пн</p><p data-legal>Доступность · 59-ФЗ · Ж-84</p><p data-typo></p><p data-rx-user-content>Приёмная</p><section class="rx-panel"><p>Введённая дата: <strong>${state.cases.case.calendar.answer}</strong>.</p></section><input data-field="knowledge.lawNumber" type="text" value="${state.cases.case.knowledge.lawNumber}" placeholder="Найдите правовое основание"><label><input type="radio" name="fact" data-field="fact" value="a" checked>Документы</label><select data-bank-topic><option value="Доступность">Доступность</option></select><button data-action="Источники">Источники</button>`;
        const render=()=>{renders++;root.innerHTML=html();root.querySelector('[data-typo]').textContent=typo.ru;};
        const load=async(locale)=>{
          if(hold){hold=false;await new Promise(resolve=>pendingResolve=resolve);}
          if(reject){reject=false;throw Object.assign(Error('Synthetic unavailable'),{code:'locale/unavailable'});}
          return createReceptionTranslator({locale,catalog:catalogs[locale]||{},literals:{[typo.ru]:['Соловёв','Соловьёв']},onMissing:text=>missing.push(text)});
        };
        const presentation=createReceptionPresentation({root,getState:()=>state,getOwner:()=>owner,renderCanonical:render,load,
          flush:async()=>{flushes++;},profileIsUserContent:()=>true,onStatus:value=>statuses.push(value)});
        render();presentation.afterRender();const original=JSON.stringify(state);
        for(const locale of ['en','zh','ru']){
          const input=root.querySelector('input[type=text]');input.focus();input.setSelectionRange(2,5);
          const result=await presentation.setLocale(locale);check(result.applied,'Language applied');
          check(root.querySelector('input[type=text]').value==='Приёмная','Typed text unchanged');
          check(document.activeElement===root.querySelector('input[type=text]')&&document.activeElement.selectionStart===2&&document.activeElement.selectionEnd===5,'Focus and selection preserved');
          check(root.querySelector('.rx-profile > span').textContent==='Доступность','Profile name not translated');
          check(root.querySelector('.rx-panel strong').textContent==='Доступность','Rendered entered value not translated');
          check(root.querySelector('[data-rx-user-content]').textContent==='Доступность','Explicit user boundary preserved');
          check(root.querySelector('select').value==='Доступность','Selected topic ID unchanged');
          check(root.querySelector('input[type=radio]').checked&&root.querySelector('input[type=radio]').value==='a','Selected answer unchanged');
          check(root.querySelector('button').dataset.action==='Источники','Action ID unchanged');
          check(JSON.stringify(state)===original,'State, order, duration and attempt identity unchanged');
          presentation.afterRender();presentation.afterRender();
          if(locale!=='ru'){
            check(root.querySelector('h1').textContent===(locale==='en'?'Case 4 of 8 · Appeal: Accessibility':'案件 4 / 8 · 来件：无障碍服务'),'Nested title composition');
            check(!/[А-Яа-яЁё]/.test(root.querySelector('[data-dates]').textContent),'Interpolated dated paragraph translated');
            check(root.querySelector('[data-dates]').textContent.includes('05.09.2026'),'Numeric date not changed');
            check(root.querySelector('[data-month]').textContent===localizedMonthLabel('2026-09',locale),'Localized month and year');
            check(!/[А-Яа-яЁё]/.test(root.querySelector('[data-weekday]').textContent),'Weekday translated');
            check(root.querySelector('[data-legal]').textContent.includes('Ж-84'),'Document code retained');
            check(root.querySelector('[data-typo]').textContent.includes('Соловёв')&&root.querySelector('[data-typo]').textContent.includes('Соловьёв'),'Actual typo evidence retained');
          }else check(root.querySelector('h1').textContent==='Дело 4 из 8 · Обращение: Доступность','Russian restored canonically');
        }
        check(missing.length===0,'No authored fixture fallback: '+missing.join(' | '));
        const templates=[{id:'a',title:'Доступность',topic:'Доступность',level:1,role:{title:'Доступность'}},{id:'b',title:'Правовая помощь',topic:'Правовая помощь',level:2,role:{title:'Правовая помощь'}}];
        const zh=createReceptionTranslator({locale:'zh',catalog:catalogs.zh});
        check(filterLocalizedCaseCatalog(templates,{query:'无障碍',translator:zh})[0]===templates[0],'Chinese substring searches translated text, preserves object identity');
        check(filterLocalizedCaseCatalog(templates,{query:'法律 援助',translator:zh})[0]===templates[1],'Chinese spaced terms');
        check(filterLocalizedCaseCatalog(templates,{query:'无障碍',level:'2',translator:zh}).length===0,'Original difficulty filter still applies');
        check(localizedCatalogTopics(templates,zh).every(row=>templates.some(t=>t.topic===row.value)),'Topic keys never translated');
        const reply=localizedReplyParts({title:'Доступность',procedures:[],routes:[],actions:[]},{procedure:'Мой текст',route:'',actions:[],calendar:{answer:'05.09.2026'}},zh);
        check(reply.flat().some(part=>part.userContent&&part.text==='Мой текст'),'Unknown saved reply answer remains literal');
        check(reply.flat().some(part=>part.userContent&&part.text==='05.09.2026'),'Reply date stays user-derived, not recalculated');
        hold=true;const oldRequest=presentation.setLocale('en');await new Promise(resolve=>setTimeout(resolve,0));
        await presentation.setLocale('zh');pendingResolve();check((await oldRequest).reason==='stale'&&presentation.getLocale()==='zh','Late language response ignored');
        reject=true;const failed=await presentation.setLocale('en');check(failed.reason==='unavailable'&&presentation.getLocale()==='zh','Failed locale load keeps the prior language');
        hold=true;const ownerRequest=presentation.setLocale('en');await new Promise(resolve=>setTimeout(resolve,0));owner='student:synthetic-b';pendingResolve();check((await ownerRequest).reason==='stale'&&presentation.getLocale()==='zh','Late prior-owner response ignored');
        presentation.destroy();check((await presentation.setLocale('en')).reason==='disposed','Disposed presenter cannot apply');
        check(JSON.stringify(state)===original,'All async race checks preserve exact work');
        return {languages:4,nestedLabels:true,dates:true,cjkSearch:true,spellingEvidence:true,immutableWork:true,focusAndSelection:true,staleLanguage:true,staleOwner:true,failedLoad:true,renders,flushes};
      },{typo});
      assert.deepEqual(errors,[]);console.log(engine+': '+JSON.stringify(results));
    }finally{await browser.close();}
  }
}finally{server.close();}
