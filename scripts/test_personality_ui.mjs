/** Real course personality UI with synthetic owners and an isolated localhost
 * backend. Answers use native radio controls; no production service is contacted.
 * Screenshots and reports are written outside the repository. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {MODEL_VERSION,QUESTIONNAIRE_VERSION,REGISTRY_VERSION} from '../site/apps/career/assets/versions.mjs';
import {PERSONALITY_ITEMS,PERSONALITY_DOMAINS,PERSONALITY_FACETS} from '../site/apps/career/assets/personality-model.mjs';
import {WORK_TRAITS,TEAM_ROLES} from '../site/apps/career/assets/personality-insights.mjs';

const require=createRequire(import.meta.url),args=process.argv.slice(2);
const argument=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),site=path.join(root,'site');
const engine=argument('--browser','chromium');
assert.ok(['chromium','firefox','webkit'].includes(engine),'Supported browser engine');
const output=path.resolve(argument('--output',process.env.PERSONALITY_QA_OUTPUT||path.join(root,'../personality-qa',engine)));
assert.ok(output!==root&&!output.startsWith(root+path.sep),'Keep browser evidence outside the repository');
const playwrightPath=process.env.PLAYWRIGHT_MODULE_PATH||process.env.PLAYWRIGHT_PATH;
const questions=JSON.parse(await readFile(path.join(site,'apps/career/data/questions.json'),'utf8'));
const careerLocales=Object.fromEntries(await Promise.all(['en','zh-Hans'].map(async language=>[language,JSON.parse(await readFile(path.join(site,'apps/career/locales',language+'.json'),'utf8'))])));
const OWNER_A='student:personality-qa-a',OWNER_B='student:personality-qa-b',OWNER_OLD='student:personality-qa-existing',OWNER_LOCALES='student:personality-qa-locales';
const LANGUAGES=['ru','en','zh-Hans'];
const LOCALE_COPY={
  ru:{title:'Личностный профиль',stage:'Личностный профиль',results:'Ваш стиль работы в команде',back:'Назад',next:'Далее',finish:'Мои результаты',edit:'К ответам',continue:'Перейти к профориентации',method:'Методика:',
    anchors:['Совершенно неверно','Скорее неверно','Ни верно, ни неверно','Скорее верно','Совершенно верно'],counter:(answered)=>`Ответов: ${answered} из 120`,page:(number)=>`Страница ${number} из 12`,decimal:'4,0 / 5'},
  en:{title:'Personality profile',stage:'Personality',results:'Your style of working in a team',back:'Back',next:'Next',finish:'My results',edit:'Back to answers',continue:'Continue to career interests',method:'Method:',
    anchors:['Very inaccurate','Moderately inaccurate','Neither accurate nor inaccurate','Moderately accurate','Very accurate'],counter:(answered)=>`Answered: ${answered} of 120`,page:(number)=>`Page ${number} of 12`,decimal:'4.0 / 5'},
  'zh-Hans':{title:'人格特征',stage:'人格特征',results:'你的团队工作风格',back:'上一步',next:'下一步',finish:'我的结果',edit:'返回答案',continue:'继续职业兴趣测试',method:'方法：',
    anchors:['完全不符合','比较不符合','介于符合与不符合之间','比较符合','完全符合'],counter:(answered)=>`已回答：${answered} / 120`,page:(number)=>`第${number}页，共12页`,decimal:'4.0 / 5'}
};
const normalize=text=>String(text).replace(/\s+/g,' ').trim();
const translated=(values,language)=>values[LANGUAGES.indexOf(language)];
const named=(record,language)=>language==='ru'?record.name:language==='en'?record.en:record.zh;
const displayFacet=(facet,language)=>language==='en'?({N3:'Low mood',O5:'Intellectual curiosity',A2:'Straightforwardness'}[facet.id]||facet.en):named(facet,language);

const backendSource=`import {durableStore} from '/assets/js/durable-store.js';
export const groupOptions=()=>[];
export const backend={generation:1,authReady:true,user:null,mode:'local',connected:false,serverTimeOffset:0,
getProfile:()=>window.qa?.owner?.startsWith('student:')?{studentKey:window.qa.owner.slice(8)}:null,
isAdmin:()=>false,init:async()=>{},onStatus:()=>()=>{},status:()=>({}),globalNow:()=>Date.now(),
getAccessOverrides:()=>({}),localGrades:()=>({}),localAttempts:()=>[],getAttempts:async()=>[],
loadDraft:scope=>durableStore.loadDraft(scope),
checkpoint:(input,options)=>{window.qa.checkpoints.push(structuredClone(input));return durableStore.checkpoint(input,{...options,queue:false});},
saveAttempt:async()=>{window.qa.unexpectedSubmissions++;throw Error('Personality QA forbids submissions');}};`;

const harness=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Personality course UI · isolated QA</title>
<style>body{margin:0;background:#f4f7fb;font:16px system-ui,sans-serif}#module{box-sizing:border-box;width:100%;max-width:1140px;margin:16px auto;padding:0 16px}#qa-error{white-space:pre-wrap;color:#900}</style></head><body><pre id="qa-error" hidden></pre><main id="module"></main>
<script type="module">
import {mountCareer} from '/apps/career/entry.mjs';
import {updateSnapshotStore} from '/assets/js/platform-update-state.js';
const query=new URLSearchParams(location.search);
window.qa={owner:query.get('owner')||'${OWNER_A}',lang:query.get('lang')||'ru',context:'course',route:'home',checkpoints:[],results:[],unexpectedSubmissions:0};
window.mount=async(options={})=>{
  if(window.handle)await window.handle.destroy();
  document.documentElement.removeAttribute('data-qa-ready');
  qa.owner=options.owner||qa.owner;qa.lang=options.lang||qa.lang;qa.context=options.context||'course';qa.route=options.route||'home';
  window.handle=await mountCareer(document.querySelector('#module'),{owner:qa.owner,context:qa.context,lang:qa.lang,initialRoute:qa.route,
    onResult:record=>qa.results.push(structuredClone(record)),onRouteChange:route=>{qa.route=route;}});
  document.documentElement.dataset.qaReady='true';return true;
};
window.captureUpdate=async()=>{
  const prepared=await handle.prepareForUpdate({targetRelease:{buildId:'synthetic-personality-next'},deadlineAt:Date.now()+5000});
  return {prepared,snapshot:prepared.resumeToken?await updateSnapshotStore().get(prepared.resumeToken):null};
};
window.restoreUpdate=async(token)=>{
  handle.commitPreparation();await mount();return handle.resumeAfterUpdate({resumeToken:token});
};
try{await mount({route:query.get('route')||'home'});}catch(error){document.querySelector('#qa-error').hidden=false;document.querySelector('#qa-error').textContent=error.stack;console.error(error);}
</script></body></html>`;

const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    res.setHeader('Cache-Control','no-store');
    if(pathname==='/__personality-qa'){
      res.setHeader('Content-Type',mime['.html']);
      res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'");
      return res.end(harness);
    }
    if(pathname==='/assets/js/backend.js'){res.setHeader('Content-Type',mime['.js']);return res.end(backendSource);}
    if(pathname==='/favicon.ico'){res.statusCode=204;return res.end();}
    const target=path.resolve(site,'.'+decodeURIComponent(pathname));
    if(!target.startsWith(site+path.sep))throw Error('Outside test site');
    const bytes=await readFile(target);res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.end(bytes);
  }catch{res.statusCode=404;res.end('Missing isolated QA resource');}
});
await new Promise(resolve=>server.listen(Number(argument('--port','0')),args.includes('--serve')?'0.0.0.0':'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
if(args.includes('--serve')){
  console.log('Isolated personality UI: '+base+'/__personality-qa');
  await new Promise(()=>{});
}
const pw=playwrightPath?await import(pathToFileURL(path.resolve(playwrightPath)).href):require('playwright');
const report={engine,status:'fail',checks:[],screenshots:[],errors:[],externalRequests:[],startedAt:new Date().toISOString()};
let browser,lastPage;
const check=(name,details={})=>{report.checks.push({name,status:'pass',...details});console.log('PASS '+name);};
const ready=page=>page.locator('html[data-qa-ready="true"]').waitFor();
const item=(page,index,value)=>page.locator(`input[data-personality-item="ipip-${String(index).padStart(3,'0')}"][value="${value}"]`);
const privateBytes=(page,owner)=>page.evaluate(owner=>{
  const suffix=':'+encodeURIComponent(owner)+':v1';
  const keys=Object.keys(localStorage).filter(key=>key.startsWith('rudn-personality:')&&key.includes(':course:')&&key.endsWith(suffix));
  if(keys.length!==1)return {count:keys.length};
  return {count:1,key:keys[0],value:localStorage.getItem(keys[0])};
},owner);
async function screenshot(page,name){
  await mkdir(output,{recursive:true});const target=path.join(output,name+'.png');
  await page.screenshot({path:target,fullPage:false});report.screenshots.push(target);
}
async function assertLayout(page,width,name){
  await page.setViewportSize({width,height:width<=390?844:900});
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  const overflow=await page.evaluate(()=>{
    const host=document.querySelector('#module'),surface=host.shadowRoot.querySelector('.career-surface');
    const active=surface.querySelector('.view:not([hidden])');
    return {viewport:innerWidth,document:document.documentElement.scrollWidth,host:host.scrollWidth,hostWidth:host.clientWidth,surface:surface.scrollWidth,surfaceWidth:surface.clientWidth,view:active.scrollWidth,viewWidth:active.clientWidth};
  });
  assert.ok(overflow.document<=overflow.viewport+1,`${name}: document overflow ${JSON.stringify(overflow)}`);
  assert.ok(overflow.host<=overflow.hostWidth+1,`${name}: host overflow ${JSON.stringify(overflow)}`);
  assert.ok(overflow.surface<=overflow.surfaceWidth+1,`${name}: surface overflow ${JSON.stringify(overflow)}`);
  assert.ok(overflow.view<=overflow.viewWidth+1,`${name}: active view overflow ${JSON.stringify(overflow)}`);
  await screenshot(page,name+'-'+width);check(name+' layout at '+width+'px');
}
async function finishQuestionnaire(page,{fill=true}={}){
  for(let pageNumber=0;pageNumber<12;pageNumber++){
    if(await page.locator('#view-personality-results').isVisible())return;
    const ids=await page.locator('#personality-root input[data-personality-item]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.personalityItem))]);
    assert.equal(ids.length,10,'Every questionnaire page has ten distinct items');
    if(fill)for(const id of ids){
      const selected=page.locator(`input[name="${id}"]:checked`);
      if(!await selected.count())await page.locator(`input[name="${id}"][value="3"]`).check();
    }
    assert.equal(await page.locator('#personality-next').isEnabled(),true,'Completed page permits continuation');
    await page.locator('#personality-next').click();
    if(ids.at(-1)==='ipip-120'){
      await page.locator('#view-personality-results:not([hidden])').waitFor();return;
    }
    const next=Number(ids.at(-1).slice(-3))+1;
    await item(page,next,3).waitFor();
  }
  assert.fail('The complete 120-item inventory must show results');
}
async function chooseCareerPreferences(page){
  await page.locator('#view-preferences:not([hidden])').waitFor();
  const next=page.locator('#journey-preferences-next');
  await next.waitFor();
  assert.equal(await page.locator('#view-test').isVisible(),false,'The career questions wait for explicit employer choices');
  assert.equal(await page.locator('#journey-desired-choices [data-remove-wish]').count(),0,'A new owner has no inherited employer choices');
  assert.equal(await next.isDisabled(),true,'Three preferred employers are required');
  for(let priority=0;priority<3;priority++){
    await page.locator('[data-add-wish][aria-pressed="false"]:not([disabled])').first().click();
    assert.equal(await page.locator('#journey-desired-choices [data-remove-wish]').count(),priority+1);
    assert.equal(await next.isDisabled(),priority<2,'Partial choices cannot skip the preference stage');
  }
  const desiredIds=await page.locator('#journey-desired-choices [data-remove-wish]').evaluateAll(nodes=>nodes.map(node=>node.dataset.removeWish));
  assert.equal(new Set(desiredIds).size,3,'All three ordered choices are distinct');
  await next.click();
  await page.locator('#view-test:not([hidden])').waitFor();
  return desiredIds;
}
function hasAnswerKeys(value){
  if(value===null||typeof value!=='object')return false;
  return Object.entries(value).some(([key,child])=>/^ipip-\d{3}$/.test(key)||hasAnswerKeys(child));
}
async function assertPrivatePayloads(page,snapshot){
  await page.evaluate(()=>handle.flush());
  const payloads=await page.evaluate(()=>({checkpoints:qa.checkpoints,results:qa.results,unexpectedSubmissions:qa.unexpectedSubmissions}));
  assert.equal(payloads.unexpectedSubmissions,0);
  assert.deepEqual(payloads.results,[],'Personality results never call the career result callback');
  assert.equal(/ipip-\d{3}/.test(JSON.stringify(payloads.checkpoints)),false,'No item responses enter synced career checkpoints');
  for(const checkpoint of payloads.checkpoints)assert.equal(Object.keys(checkpoint.state?.values||{}).some(key=>/personality|ipip/i.test(key)),false,'No private inventory entry in career values');
  if(snapshot){
    assert.equal(hasAnswerKeys(snapshot),false,'No private response map enters the update envelope');
    assert.equal(/ipip-\d{3}/.test(JSON.stringify(snapshot.state.runtime)),false,'No personality field values enter the runtime snapshot');
    assert.equal(snapshot.state.runtime.fields.some(field=>/personality|ipip/i.test(field.id)),false,'Personality form controls are excluded from generic update capture');
  }
}

async function setLocale(page,language){
  await page.evaluate(async language=>{await handle.setLocale(language);qa.lang=language;},language);
}
async function assertLocaleSurface(page,selector,language){
  const text=await page.locator(selector+', .seminar-progress').evaluateAll(nodes=>nodes.map(node=>[
    node.innerText,...[...node.querySelectorAll('[aria-label],[aria-valuetext],[title]')].flatMap(element=>
      ['aria-label','aria-valuetext','title'].map(attribute=>element.getAttribute(attribute)||''))
  ].join('\n')).join('\n'));
  if(language!=='ru')assert.equal(text.match(/\p{Script=Cyrillic}.{0,70}/u),null,`${language}: no Russian fallback in visible text or accessible labels`);
  assert.match(text,language==='zh-Hans'?/\p{Script=Han}/u:language==='ru'?/\p{Script=Cyrillic}/u:/[A-Za-z]/,`${language}: visible localized content`);
}
async function assertQuestionLocale(page,language,pageNumber,answers){
  const copy=LOCALE_COPY[language],expected=PERSONALITY_ITEMS.slice(pageNumber*10,pageNumber*10+10);
  const actual=await page.locator('#personality-root').evaluate(root=>({
    lang:root.lang,title:root.querySelector('h1').textContent,counter:root.querySelector('#personality-counter').textContent,
    page:root.querySelector('.personality-progress > div > span:last-child').textContent,
    anchors:[...root.querySelectorAll('.personality-scale > div > span')].map(node=>node.textContent),
    back:root.querySelector('#personality-back').textContent,backHidden:root.querySelector('#personality-back').hidden,
    next:root.querySelector('#personality-next').textContent,nextDisabled:root.querySelector('#personality-next').disabled,
    items:[...root.querySelectorAll('.personality-item')].map(field=>({
      text:field.querySelector('legend').textContent.replace(/^\s*\d+\.\s*/,''),
      selected:field.querySelector('.personality-selected').textContent,
      choices:[...field.querySelectorAll('input')].map(input=>({id:input.dataset.personalityItem,name:input.name,value:Number(input.value),checked:input.checked,
        title:input.closest('label').title,accessible:input.closest('label').querySelector('.personality-sr-only').textContent}))
    }))
  }));
  assert.equal(actual.lang,language);assert.equal(actual.title,copy.title);
  assert.equal(actual.counter,copy.counter(Object.keys(answers).length));assert.equal(actual.page,copy.page(pageNumber+1));
  assert.deepEqual(actual.anchors,copy.anchors);assert.equal(actual.back,copy.back);assert.equal(actual.backHidden,pageNumber===0);
  assert.equal(actual.next,pageNumber===11?copy.finish:copy.next);
  assert.equal(actual.nextDisabled,!expected.every(item=>answers[item.id]));
  assert.equal(actual.items.length,10);
  for(let index=0;index<expected.length;index++){
    const definition=expected[index],field=actual.items[index],wording=language==='ru'?definition.text:language==='en'?definition.en:definition.zh;
    assert.ok(typeof wording==='string'&&wording.trim(),`${language}: ${definition.id} has a translation`);
    assert.equal(normalize(field.text),normalize(wording),`${language}: exact translated item ${definition.id}`);
    assert.equal(field.choices.length,5);
    field.choices.forEach((choice,choiceIndex)=>{
      assert.equal(choice.id,definition.id);assert.equal(choice.name,definition.id);assert.equal(choice.value,choiceIndex+1);
      assert.equal(choice.title,copy.anchors[choiceIndex]);assert.equal(choice.accessible,copy.anchors[choiceIndex]);
      assert.equal(choice.checked,answers[definition.id]===choice.value,`${language}: selected answer for ${definition.id} survives`);
    });
    assert.equal(normalize(field.selected),answers[definition.id]?copy.anchors[answers[definition.id]-1]:'');
  }
  assert.equal(await page.locator('.seminar-step[aria-current="step"] strong').innerText(),copy.stage);
  await assertLocaleSurface(page,'#view-personality',language);
  return expected.map(item=>item.id);
}
async function resultIdentity(page){
  return page.locator('#personality-results-root').evaluate(root=>({
    scores:[...root.querySelectorAll('[data-personality-score]')].map(node=>({
      facet:node.dataset.personalityFacet,domain:node.dataset.personalityDomain,detail:node.dataset.personalityDetailFacet,score:Number(node.dataset.personalityScore)
    })),roles:[...root.querySelectorAll('[data-personality-role]')].map(node=>node.dataset.personalityRole)
  }));
}
async function assertResultsLocale(page,language){
  const copy=LOCALE_COPY[language];
  const actual=await page.locator('#personality-results-root').evaluate(root=>({
    lang:root.lang,title:root.querySelector('h1').textContent,edit:root.querySelector('#personality-edit').textContent,
    continue:root.querySelector('#personality-continue').textContent,method:root.querySelector('.personality-method').textContent,
    traits:[...root.querySelectorAll('[data-personality-facet]')].map(node=>({id:node.dataset.personalityFacet,title:node.querySelector('h3').textContent,description:node.querySelector('p').textContent,number:node.querySelector('strong').textContent})),
    domains:[...root.querySelectorAll('[data-personality-domain]')].map(node=>({id:node.dataset.personalityDomain,title:node.querySelector('h3').textContent,description:node.querySelector('p').textContent,number:node.querySelector('strong').textContent})),
    facets:[...root.querySelectorAll('[data-personality-detail-facet]')].map(node=>({id:node.dataset.personalityDetailFacet,title:node.querySelector('dt').textContent,number:node.querySelector('dd').textContent})),
    roles:[...root.querySelectorAll('[data-personality-role]')].map(node=>({id:node.dataset.personalityRole,title:node.querySelector('h3').textContent,description:node.querySelector('p').textContent,
      facets:[...node.querySelectorAll('dt')].map(label=>label.textContent),numbers:[...node.querySelectorAll('dd')].map(label=>label.textContent),action:node.querySelector('.personality-role-action').textContent})),
    meters:[...root.querySelectorAll('[role="meter"]')].map(node=>({value:Number(node.getAttribute('aria-valuenow')),label:node.getAttribute('aria-label'),description:node.getAttribute('aria-valuetext')}))
  }));
  assert.equal(actual.lang,language);assert.equal(actual.title,copy.results);assert.equal(actual.edit,copy.edit);assert.equal(actual.continue,copy.continue);
  assert.ok(actual.method.startsWith(copy.method));assert.match(actual.method,/IPIP-NEO-120/);
  assert.equal(actual.traits.length,6);assert.equal(actual.domains.length,5);assert.equal(actual.facets.length,30);assert.equal(actual.roles.length,6);assert.equal(actual.meters.length,11);
  for(const trait of actual.traits){
    const definition=WORK_TRAITS.find(item=>item.facet===trait.id);assert.ok(definition);
    assert.equal(trait.title,translated(definition.label,language));assert.equal(trait.description,translated(definition.high,language));assert.equal(normalize(trait.number),copy.decimal);
  }
  for(const domain of actual.domains){
    const definition=PERSONALITY_DOMAINS.find(item=>item.id===domain.id);assert.ok(definition);
    const title=domain.id==='N'?translated(['Эмоциональная чувствительность','Emotional sensitivity','情绪敏感性'],language):named(definition,language);
    assert.equal(domain.title,title);assert.ok(domain.description.length>10);assert.equal(normalize(domain.number),copy.decimal);
  }
  for(const facet of actual.facets){
    const definition=PERSONALITY_FACETS.find(item=>item.id===facet.id);assert.ok(definition);
    assert.equal(facet.title,displayFacet(definition,language));assert.equal(normalize(facet.number),copy.decimal);
  }
  for(const role of actual.roles){
    const definition=TEAM_ROLES.find(item=>item.id===role.id);assert.ok(definition);
    assert.equal(role.title,translated(definition.label,language));assert.equal(role.description,translated(definition.description,language));
    assert.deepEqual(role.facets,definition.facets.map(id=>displayFacet(PERSONALITY_FACETS.find(item=>item.id===id),language)));
    assert.ok(role.numbers.every(number=>normalize(number)===copy.decimal));
    assert.equal(normalize(role.action),normalize(translated(['Попробуйте:','Try:','可以尝试：'],language)+' '+translated(definition.action,language)));
  }
  for(const meter of actual.meters){assert.equal(meter.value,4);assert.ok(meter.label);assert.ok(meter.description.includes(language==='ru'?'из 5':language==='en'?'out of 5':'满分5分'));}
  const identity=await resultIdentity(page);assert.equal(identity.scores.length,41);assert.ok(identity.scores.every(item=>item.score===4));
  assert.deepEqual(identity.roles,TEAM_ROLES.map(role=>role.id));
  assert.equal(await page.locator('.seminar-step[aria-current="step"] strong').innerText(),copy.stage);
  await assertLocaleSurface(page,'#view-personality-results',language);
  return identity;
}
async function assertCareerQuestionLocale(page,language,index){
  const expected=language==='ru'?questions[index].text:careerLocales[language].entries[normalize(questions[index].text)];
  assert.ok(typeof expected==='string'&&expected.length>0,`${language}: existing career question has a translation`);
  await page.locator('#question-text').filter({hasText:expected}).waitFor();
  assert.equal(normalize(await page.locator('#question-text').innerText()),normalize(expected));
  const labels=['Совершенно неинтересно','Скорее неинтересно','Трудно сказать','Скорее интересно','Очень интересно'];
  assert.deepEqual(await page.locator('#answer-options .answer-option > span').allTextContents(),labels.map(label=>language==='ru'?label:careerLocales[language].entries[label]));
  assert.equal(await page.locator('.seminar-step[aria-current="step"] strong').innerText(),translated(['Профориентация','Career interests','职业兴趣'],language));
}
async function verifyAllLocales(page){
  await page.evaluate(owner=>mount({owner,lang:'en',route:'home'}),OWNER_LOCALES);await item(page,1,3).waitFor();
  await assertQuestionLocale(page,'en',0,{});
  for(const width of [320,390])await assertLayout(page,width,'questions-en');
  await setLocale(page,'zh-Hans');await assertQuestionLocale(page,'zh-Hans',0,{});
  for(const width of [320,390])await assertLayout(page,width,'questions-zh-Hans');
  await page.setViewportSize({width:1280,height:900});
  check('A fresh course mount accepts English; Chinese questions and controls switch through the public locale API');

  // Respond through native controls. Scored value 4 for every item gives six
  // equally supported roles, so every translated role card is exercised.
  const answers={},seen=Object.fromEntries(LANGUAGES.map(language=>[language,new Set()]));
  for(let pageNumber=0;pageNumber<12;pageNumber++){
    const definitions=PERSONALITY_ITEMS.slice(pageNumber*10,pageNumber*10+10),first=definitions[0];
    await item(page,first.order,first.reverse?2:4).check();answers[first.id]=first.reverse?2:4;
    for(const language of LANGUAGES){
      const before=await privateBytes(page,OWNER_LOCALES);
      await setLocale(page,language);
      for(const id of await assertQuestionLocale(page,language,pageNumber,answers))seen[language].add(id);
      assert.equal((await privateBytes(page,OWNER_LOCALES)).value,before.value,`${language}: changing language preserves exact answers and page`);
      if(pageNumber===1&&language!=='ru'){
        await page.locator('#personality-back').click();await assertQuestionLocale(page,language,0,answers);
        await page.locator('#personality-next').click();await assertQuestionLocale(page,language,1,answers);
        assert.equal((await privateBytes(page,OWNER_LOCALES)).value,before.value,`${language}: Back and Next restore the same incomplete page`);
      }
    }
    for(const definition of definitions.slice(1)){
      const value=definition.reverse?2:4;await item(page,definition.order,value).check();answers[definition.id]=value;
    }
    await page.locator('#personality-next').click();
  }
  await page.locator('#view-personality-results:not([hidden])').waitFor();
  for(const language of LANGUAGES)assert.equal(seen[language].size,120,`${language}: all 120 translated statements were visible and checked`);
  check('All 120 statements, five answer anchors and accessible labels are correct in Russian, English and Chinese');
  check('Mid-test language changes and English/Chinese Back preserve the exact page and selected answers');

  const original=await resultIdentity(page);let careerIndex=0;
  for(const language of LANGUAGES){
    const before=await privateBytes(page,OWNER_LOCALES);await setLocale(page,language);
    assert.deepEqual(await assertResultsLocale(page,language),original,`${language}: scores and role identities are language-independent`);
    assert.equal((await privateBytes(page,OWNER_LOCALES)).value,before.value,`${language}: completed answers and completion timestamp stay unchanged`);
    if(language!=='ru')for(const width of [320,390])await assertLayout(page,width,'results-'+language);
    await page.setViewportSize({width:1280,height:900});
    check(language+': six work traits, five domains, thirty facets and all six role cards are fully localized');
    await page.locator('#personality-edit').click();await assertQuestionLocale(page,language,0,answers);
    await page.locator('#personality-next').click();await assertQuestionLocale(page,language,1,answers);
    await page.locator('#personality-back').click();await assertQuestionLocale(page,language,0,answers);
    await page.evaluate(()=>handle.navigate('personality-results'));assert.deepEqual(await assertResultsLocale(page,language),original);
    await page.locator('#personality-continue').click();
    if(careerIndex===0)await chooseCareerPreferences(page);
    else await page.locator('#view-test:not([hidden])').waitFor();
    await assertCareerQuestionLocale(page,language,careerIndex);
    await page.locator('#answer-options [data-answer="'+(careerIndex+2)+'"]').click();await page.locator('#question-next').click();careerIndex++;
    await assertCareerQuestionLocale(page,language,careerIndex);
    await page.evaluate(()=>handle.navigate('personality-results'));
    check(language+': Back to answers and Continue retain results and open the existing career questionnaire in the same language');
  }
  await page.evaluate(owner=>mount({owner,lang:'zh-Hans',route:'home'}),OWNER_LOCALES);
  await page.locator('#view-personality-results:not([hidden])').waitFor();assert.deepEqual(await assertResultsLocale(page,'zh-Hans'),original);
  await page.locator('#personality-continue').click();await assertCareerQuestionLocale(page,'zh-Hans',careerIndex);
  await assertPrivatePayloads(page);
  report.locales=Object.fromEntries(LANGUAGES.map(language=>[language,{questions:seen[language].size,workTraits:6,domains:5,facets:30,roleIds:original.roles,scoresUnchanged:true}]));
  check('A Chinese remount restores completed localized results and the previous career question without losing answers');
}

try{
  browser=await pw[engine].launch({headless:true,...(engine==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{}),...(engine==='chromium'&&process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  report.browserVersion=browser.version();
  const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ru-RU',serviceWorkers:'block'});
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin===base)return route.continue();
    report.externalRequests.push(route.request().url());return route.abort();
  });
  const page=await context.newPage();lastPage=page;page.setDefaultTimeout(15000);
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(base+'/__personality-qa');await ready(page);
  await item(page,1,3).waitFor();
  assert.equal(await page.locator('#view-personality').isVisible(),true);
  assert.equal(await page.locator('#view-test').isVisible(),false);
  assert.equal(await page.locator('#personality-root input[type="radio"]').count(),50);
  assert.equal(await page.locator('#personality-root input:checked').count(),0);
  assert.equal(await page.locator('#personality-next').isDisabled(),true);
  assert.equal(await page.locator('.seminar-step').count(),6);
  assert.match(await page.locator('.seminar-step[aria-current="step"]').innerText(),/Личностный профиль/);
  check('New course session begins with the independent personality inventory');

  for(const width of [320,390,1280])await assertLayout(page,width,'questions');
  await item(page,1,4).check();
  assert.equal(await page.locator('#personality-next').isDisabled(),true,'One answer cannot skip nine unanswered items');
  for(let index=2;index<=10;index++)await item(page,index,3).check();
  assert.equal(await page.locator('#personality-next').isEnabled(),true);
  await page.locator('#personality-next').click();await item(page,11,2).check();
  assert.equal(await page.locator('#personality-next').isDisabled(),true);
  await page.reload();await ready(page);await item(page,11,2).waitFor();
  assert.equal(await item(page,11,2).isChecked(),true,'Reload restores the in-progress page and selected response');
  await page.locator('#personality-back').click();
  assert.equal(await item(page,1,4).isChecked(),true,'Back preserves first-page answers');
  await item(page,1,3).check();await page.locator('#personality-next').click();
  assert.equal(await item(page,11,2).isChecked(),true);
  check('Incomplete pages are blocked; reload and Back retain exact answers');

  // Exercise the public update adapter while private form controls are present.
  const capture=await page.evaluate(()=>captureUpdate());
  assert.equal(capture.prepared.status,'ready',JSON.stringify(capture.prepared));
  assert.equal(capture.snapshot.module,'career');
  await assertPrivatePayloads(page,capture.snapshot);
  const restored=await page.evaluate(token=>restoreUpdate(token),capture.prepared.resumeToken);
  assert.equal(restored.status,'restored',JSON.stringify(restored));
  assert.equal(await item(page,11,2).isChecked(),true,'Private browser state survives the public update roundtrip');
  check('Update restores the same page without copying personality answers to its envelope');

  await item(page,11,3).check();await finishQuestionnaire(page);
  assert.equal(await page.locator('[data-personality-facet]').count(),6);
  assert.equal(await page.locator('[data-personality-domain]').count(),5);
  assert.equal(await page.locator('[data-personality-detail-facet]').count(),30);
  const initialScores=await page.locator('#personality-results-root [data-personality-score]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.personalityScore)));
  assert.equal(initialScores.length,41);
  assert.ok(initialScores.every(score=>score===3),'All-neutral responses give exactly 3 on every original scale');
  const privateA=await privateBytes(page,OWNER_A);assert.equal(privateA.count,1);
  assert.equal(Object.keys(JSON.parse(privateA.value).answers).length,120);
  await assertPrivatePayloads(page);
  check('All 120 answers produce six focal traits, five domains and thirty facets on the 1–5 scale');
  for(const width of [320,390,1280])await assertLayout(page,width,'results');

  await page.locator('#personality-edit').click();await item(page,1,5).check();
  await page.evaluate(()=>handle.navigate('personality-results'));
  assert.equal(await page.locator('#view-personality').isVisible(),true,'Edited answers invalidate the previous result');
  await finishQuestionnaire(page,{fill:false});
  assert.equal(Number(await page.locator('[data-personality-detail-facet="N1"]').getAttribute('data-personality-score')),3.5,'One direct-keyed answer changed 3→5 adds 2/4 to the facet mean');
  const revisedScores=await page.locator('#personality-results-root [data-personality-score]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.personalityScore)));
  assert.ok(revisedScores.every(score=>Number.isFinite(score)&&score>=1&&score<=5));
  await page.reload();await ready(page);await page.locator('#view-personality-results:not([hidden])').waitFor();
  assert.equal(Number(await page.locator('[data-personality-detail-facet="N1"]').getAttribute('data-personality-score')),3.5);
  check('Editing re-scores the inventory; incomplete recalculation is guarded; completed results survive reload');

  await page.locator('#personality-continue').click();await chooseCareerPreferences(page);
  assert.equal(await page.locator('#question-text').innerText(),questions[0].text);
  await page.locator('#answer-options [data-answer="3"]').click();await page.locator('#question-next').click();
  await page.locator('#answer-options [data-answer="4"]').click();await page.locator('#question-next').click();
  assert.equal(await page.locator('#question-text').innerText(),questions[2].text);
  await page.evaluate(()=>handle.navigate('personality-results'));await page.locator('#personality-continue').click();
  assert.equal(await page.locator('#question-text').innerText(),questions[2].text,'Returning from personality results resumes previous career answers');
  await assertPrivatePayloads(page);
  check('Continue requires three employer choices before the existing career questionnaire and preserves both stages');

  await page.evaluate(owner=>mount({owner,route:'personality-results'}),OWNER_B);
  await item(page,1,2).waitFor();
  assert.equal(await page.locator('#view-personality-results').isVisible(),false,'Direct result URL cannot bypass the inventory');
  assert.equal(await page.locator('#personality-root input:checked').count(),0,'A different owner starts with no inherited responses');
  await item(page,1,2).check();
  const privateB=await privateBytes(page,OWNER_B);assert.equal(privateB.count,1);
  assert.equal(Object.keys(JSON.parse(privateB.value).answers).length,1);
  await page.evaluate(owner=>mount({owner,route:'home'}),OWNER_A);
  await page.locator('#view-personality-results:not([hidden])').waitFor();
  assert.equal(Number(await page.locator('[data-personality-detail-facet="N1"]').getAttribute('data-personality-score')),3.5);
  assert.equal((await privateBytes(page,OWNER_B)).value,privateB.value,'Returning to A leaves B untouched');
  check('Owner A → B → A isolates responses and results; incomplete direct results are guarded');

  // This explicit pre-existing career fixture contains no personality responses.
  const oldState={schema:4,modelVersion:MODEL_VERSION,questionnaireVersion:QUESTIONNAIRE_VERSION,registryVersion:REGISTRY_VERSION,
    answers:{[questions[0].id]:2,[questions[1].id]:5},questionIndex:2,prioritySectors:['EDU','SOC'],lowPrioritySectors:[],
    conditions:{FIELD:3},focusAreas:{},compareIds:[],lastRoute:'test',completedAt:null,resultRecordId:null,updatedAt:'2026-11-01T12:00:00.000Z'};
  const oldKey='rudn-career:embedded:'+encodeURIComponent('/apps/career/')+':'+encodeURIComponent(OWNER_OLD)+':answers-v8.1';
  await page.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:oldKey,state:oldState});
  await page.evaluate(owner=>mount({owner,route:'home'}),OWNER_OLD);await item(page,1,3).waitFor();
  assert.equal(await page.locator('#personality-root input:checked').count(),0);
  assert.equal(await page.locator('#view-test').isVisible(),false);
  const preserved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),oldKey);
  for(const key of ['modelVersion','questionnaireVersion','registryVersion','answers','questionIndex','prioritySectors','lowPrioritySectors','conditions','focusAreas'])assert.deepEqual(preserved[key],oldState[key],`Existing ${key} remains unchanged`);
  check('An existing career draft also opens the new first stage without losing its data');

  await page.evaluate(()=>mount({context:'free',route:'personality'}));
  assert.equal(await page.locator('#view-home').isVisible(),true,'Independent free career app ignores course-only personality routes');
  await page.evaluate(()=>handle.navigate('test'));await page.locator('#view-test:not([hidden])').waitFor();
  check('The independent career app retains its original questionnaire');
  await assertPrivatePayloads(page);
  await verifyAllLocales(page);
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
  await context.close();report.status='pass';
}catch(error){
  report.failure={message:error.message,stack:error.stack};process.exitCode=1;
  if(lastPage&&!lastPage.isClosed())await screenshot(lastPage,'failure').catch(()=>{});
}finally{
  await browser?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));
  await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
