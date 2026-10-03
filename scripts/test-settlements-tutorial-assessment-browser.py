"""Bounded tutorial/assessment component regression, not a real student game.

Real entry/copy/CSS; explicit network fixtures for engine, persistence, manifest.
Grade checks cover the fixture receipt only, NOT dashboard/Firebase integration.
No profile/storage injection, browser dependency installation or production write.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
import hashlib, json, traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/settlements-tutorial-assessment'
OUT.mkdir(parents=True,exist_ok=True)
def hashes():return {name:hashlib.sha256((ROOT/'site/apps/settlements'/name).read_bytes()).hexdigest() for name in ['entry.mjs','copy.mjs','module.css']}
report={'kind':'component fixtures; NOT real engine, student, dashboard or Firebase evidence','status':'running','viewport':[390,844],
        'browserFallback':'Browser plugin/browser skill absent; project-authorized bundled Playwright','hashesBefore':hashes(),'cases':[]}

STORE="""
const copy=x=>structuredClone(x);
export function createSettlementsPersistence({mode,onStatus}) {
 const f=window.fixture={mode,session:null,tutorial:{completed:false,engineSave:null},completeCalls:0,grades:[],mounts:[],tutorialSaves:0};
 return {acquireWriter:async()=>true,canWrite:()=>true,loadSession:async()=>copy(f.session),loadTutorial:async()=>copy(f.tutorial),readLeaderboard:async()=>[],
 saveSession:async value=>{f.session=copy(value);return copy(value)},
 saveTutorial:async value=>{f.tutorialSaves++;f.tutorial=copy(value);return copy(value)},
 completeSession:async(value,result)=>{f.completeCalls++;f.session={...copy(value),result:copy(result),status:'completed'};
  f.grades.push({activity:'seminar-3',mode,attemptId:value.attemptId,points:mode==='assessment'&&result.coverageNp>=90?{easy:3,normal:4,hard:5}[value.difficulty]:0});
  onStatus({state:'saved',writable:true,session:copy(f.session)});return copy(f.session)},
 confirmOnline:async()=>true,flush:async()=>({session:copy(f.session)}),destroy:async()=>{}};
}
"""
GAME="""
export async function mountSettlementsGame(root,options){
 const f=window.fixture;f.mounts.push({mode:options.mode,regionId:options.regionId,difficulty:options.difficulty});
 let save=options.initialSave||{actions:[]};
 root.innerHTML='<div style="height:100%;background:#dce9dc;padding:12px"><p>Component fixture · no game engine</p><button data-fixture="finish">Finish fixture</button><button data-fixture="invalid">Invalid fixture completion</button><button data-fixture="exit">Exit via host callback</button></div>';
 root.querySelector('[data-fixture=invalid]').onclick=async()=>{try{await options.onComplete({save,reason:'complete',evaluation:{services:Object.fromEntries(['telecom','medical','school','culture'].map(k=>[k,{total:0,covered:0,population:100,people:0}]))}})}catch(error){f.invalidError=error.message}};
 root.querySelector('[data-fixture=finish]').onclick=async()=>{save={actions:Array.from({length:options.mode==='intro'?6:1},(_,i)=>({type:'fixture',step:i+1}))};
  await options.onComplete({save,reason:'complete',metrics:{spentMillionRub:12},evaluation:{spent:12,services:Object.fromEntries(['telecom','medical','school','culture'].map(k=>[k,{total:10,covered:10,population:100,people:100}]))}});};
 root.querySelector('[data-fixture=exit]').onclick=()=>options.onExit();
 return {snapshot:()=>({save}),setReadOnly:()=>{},flush:async()=>{},destroy:()=>root.replaceChildren(),setLocale:async()=>{}};
}
"""
HTML="""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tutorial assessment component fixture</title>
<style>body{margin:0;background:#eef3f6}#mount[data-presentation=game]{height:100dvh;width:100vw;position:fixed;inset:0}</style><main id="mount"></main>
<script type="module">import {mountSettlements} from '/apps/settlements/entry.mjs';import {COPY} from '/apps/settlements/copy.mjs';
const container=document.querySelector('#mount'),locale=new URLSearchParams(location.search).get('locale')||'ru';window.fixtureCopy=COPY[locale];
window.host=await mountSettlements(container,{owner:'student:component-fixture',locale,onViewChange:view=>{if(view==='lobby')delete container.dataset.presentation;else container.dataset.presentation='game';}});document.documentElement.dataset.ready='true';</script>"""

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'site')))
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/fixture.html'
report['url']=base
try:
 with sync_playwright() as playwright:
  browser=playwright.chromium.launch(headless=True)
  for locale in ['ru','en','zh']:
   context=browser.new_context(viewport={'width':390,'height':844},locale='ru-RU',service_workers='block')
   context.route('**/fixture.html*',lambda r:r.fulfill(content_type='text/html',body=HTML))
   context.route('**/assets/js/settlements-storage.js',lambda r:r.fulfill(content_type='text/javascript',body=STORE))
   context.route('**/runtime/assets/js/settlements/v24/game.mjs',lambda r:r.fulfill(content_type='text/javascript',body=GAME))
   context.route('**/runtime/assets/css/settlements-v24.css',lambda r:r.fulfill(content_type='text/css',body=''))
   context.route('**/runtime/data/settlements/v1/manifest.json',lambda r:r.fulfill(content_type='application/json',body=json.dumps({'regions':[{'id':'a','name':'Территория A'},{'id':'b','name':'Территория B'}]})))
   context.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''))
   page=context.new_page();row={'locale':locale,'status':'running','checks':[],'errors':[],'consoleErrors':[]}
   page.on('pageerror',lambda error:row['errors'].append(str(error)))
   page.on('console',lambda msg:row['consoleErrors'].append(msg.text) if msg.type=='error' else None)
   try:
    page.goto(base+'?locale='+locale);page.wait_for_function("document.documentElement.dataset.ready==='true'")
    assert page.evaluate('fixture.session===null && fixture.tutorial.completed===false')
    assert not page.locator('[data-action="start"]').count()
    page.locator('[data-action="tutorial"]').click()
    page.locator('[data-fixture="finish"]').click()
    page.wait_for_function('fixture.tutorial.completed===true')
    assert page.evaluate('fixture.grades.length===0 && fixture.completeCalls===0 && fixture.session===null')
    assert not page.locator('.result').is_visible()
    row['checks'].append('new student tutorial completion writes only tutorial, no assessment attempt/grade/result')
    page.locator('[data-fixture="exit"]').click()
    page.locator('.lobby').wait_for(state='visible')
    copy=page.evaluate('({trainingNoPoints:fixtureCopy.trainingNoPoints,assessmentReady:fixtureCopy.assessmentReady,startAssessment:fixtureCopy.startAssessment})')
    assert copy.get('trainingNoPoints') and copy.get('assessmentReady')
    lobby=page.locator('.lobby');text=lobby.inner_text()
    assert copy['trainingNoPoints'] in text and copy['assessmentReady'] in text
    start=page.locator('[data-action="start"]');start.wait_for()
    expected_start={'ru':'Начать игру на оценку','en':'Start assessed game','zh':'开始计分游戏'}[locale]
    assert start.inner_text()==expected_start
    options=page.locator('[data-select="difficulty"] option').all_text_contents()
    assert len(options)==3 and all(f'{score}/5' in label for score,label in zip([3,4,5],options))
    assert not page.locator('.result').is_visible()
    row['tutorialExitCopy']=copy;row['difficultyOptions']=options
    row['checks'].append('tutorial exit clearly distinguishes no-points training and assessed start with 3/4/5 difficulty options')
    if locale=='ru':
     lobby.scroll_into_view_if_needed();page.screenshot(path=str(OUT/'tutorial-exit-ru.jpg'),type='jpeg',quality=40)
    page.locator('[data-select="difficulty"]').select_option('hard');start.click()
    page.locator('[data-fixture="finish"]').wait_for()
    assert page.evaluate("fixture.mode==='assessment' && fixture.session.status==='active' && fixture.session.difficulty==='hard'")
    page.locator('[data-fixture="invalid"]').click()
    page.wait_for_function("fixture.invalidError==='settlements/invalid-coverage'")
    assert page.evaluate("fixture.session.status==='active' && fixture.completeCalls===0 && fixture.grades.length===0")
    assert not page.locator('.result').is_visible()
    row['checks'].append('invalid coverage rejects completion without persisting an attempt result or grade')
    page.locator('[data-fixture="finish"]').click()
    page.get_by_text('5/5',exact=True).wait_for()
    page.wait_for_function('fixture.completeCalls===1 && fixture.grades.length===1')
    completed=page.evaluate('structuredClone(fixture.session)')
    row['gradeReceipt']=page.evaluate('structuredClone(fixture.grades[0])')
    assert row['gradeReceipt']['points']==5 and row['gradeReceipt']['activity']=='seminar-3'
    row['checks'].append('separate hard assessed party completion renders 5/5 and one fixture grade receipt')
    row['checks'].append('valid completion after the rejected invalid payload is not blocked by pendingCompletion')
    page.locator('[data-fixture="exit"]').click();lobby.wait_for(state='visible')
    assert page.get_by_text('5/5',exact=True).is_visible()
    assert page.evaluate('fixture.grades.length')==1
    row['checks'].append('assessment result and receipt remain after exit to lobby; dashboard integration not run')
    page.locator('[data-action="tutorial"]').click();page.locator('[data-fixture="finish"]').wait_for()
    assert not page.locator('.result').is_visible()
    page.locator('[data-fixture="finish"]').click()
    page.wait_for_function('fixture.tutorial.engineSave?.actions.length===6')
    page.locator('[data-fixture="exit"]').click();lobby.wait_for(state='visible')
    assert page.get_by_text('5/5',exact=True).is_visible()
    assert page.evaluate('fixture.completeCalls===1 && fixture.grades.length===1')
    assert page.evaluate('structuredClone(fixture.session)')==completed
    row['checks'].append('tutorial replay preserves the completed assessed result and does not issue another grade')
    expected='Settlements operation: settlements/invalid-coverage'
    row['expectedConsoleErrors']=[message for message in row['consoleErrors'] if message==expected]
    row['consoleErrors']=[message for message in row['consoleErrors'] if message!=expected]
    assert len(row['expectedConsoleErrors'])==1
    assert not row['errors'] and not row['consoleErrors']
    row['status']='pass'
   except Exception as error:
    row['status']='fail';row['failure']=str(error);row['traceback']=traceback.format_exc()
    if not (OUT/'failure.jpg').exists():page.screenshot(path=str(OUT/'failure.jpg'),type='jpeg',quality=35)
   finally:
    context.close();report['cases'].append(row)
    print(json.dumps({'locale':locale,'status':row['status'],'failure':row.get('failure')},ensure_ascii=False),flush=True)
  browser.close()
finally:
 server.shutdown();server.server_close()
 report['hashesAfter']=hashes();report['sourceUnchanged']=report['hashesBefore']==report['hashesAfter']
 report['status']='pass' if report['sourceUnchanged'] and report['cases'] and all(c['status']=='pass' for c in report['cases']) else 'fail'
 report['scriptSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'status':report['status'],'sourceUnchanged':report['sourceUnchanged'],'output':str(OUT)},ensure_ascii=False))
raise SystemExit(0 if report['status']=='pass' else 1)
