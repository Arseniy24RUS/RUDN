"""Bounded component fixture: real entry/copy/CSS; stub persistence and engine.

This is not an engine playthrough, Firebase acceptance or real student evidence.
Browser plugin/skill absent; project-authorized ordinary Playwright fallback.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
import hashlib, json, sys, traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/settlements-grade-hotfix'
OUT.mkdir(parents=True,exist_ok=True)
FILES=['entry.mjs','copy.mjs','module.css']
def hashes():return {name:hashlib.sha256((ROOT/'site/apps/settlements'/name).read_bytes()).hexdigest() for name in FILES}
report={'kind':'component fixture, NOT actual engine/student/cloud evidence','status':'running','viewport':[390,844],
        'browserFallback':'Browser plugin/browser skill absent; authorized bundled Playwright','hashesBefore':hashes(),'checks':[],'errors':[],'consoleErrors':[]}

STORE="""
const copy=x=>structuredClone(x);
export function createSettlementsPersistence({onStatus}) {
 const f=window.fixture={online:false,completeCalls:0,flushCalls:0,saves:[],mounts:[],
 session:{attemptId:'fixture-attempt-a',regionId:'a',difficulty:'hard',mode:'assessment',status:'active',engineSave:{actions:[]},elapsedMs:10}};
 const ack=()=>{f.online=true;f.session={...f.session,status:'completed'};onStatus({state:'saved',writable:true,session:copy(f.session)});f.resolve?.(copy(f.session));};f.ack=ack;
 return {acquireWriter:async()=>true,canWrite:()=>true,loadSession:async()=>copy(f.session),loadTutorial:async()=>({completed:true}),readLeaderboard:async()=>[],
 saveSession:async value=>{f.session=copy(value);f.saves.push(copy(value));return copy(value)},saveTutorial:async value=>value,
 completeSession:async(value,result)=>{f.completeCalls++;f.session={...copy(value),result:copy(result),status:'completion-pending'};return new Promise(resolve=>{f.resolve=resolve})},
 confirmOnline:async()=>true,flush:async()=>{f.flushCalls++;return {session:copy(f.session)}},destroy:async()=>{}};
}
"""
GAME="""
export async function mountSettlementsGame(root,options){
 window.fixture.mounts.push({regionId:options.regionId,difficulty:options.difficulty});
 let save=options.initialSave||{actions:[]};
 root.innerHTML='<div style="height:100%;background:#dce9dc;padding:16px"><p>Component fixture · no game engine</p><button data-fixture="finish">Finish fixture</button></div>';
 root.querySelector('button').onclick=()=>{save={actions:[{type:'fixture'}]};void options.onComplete({save,reason:'complete',metrics:{spentMillionRub:12},evaluation:{spent:12,services:Object.fromEntries(['telecom','medical','school','culture'].map(k=>[k,{total:10,covered:10,population:100,people:100}]))}})};
 return {snapshot:()=>({save}),setReadOnly:()=>{},flush:async()=>{},destroy:()=>root.replaceChildren(),setLocale:async()=>{}};
}
"""
HTML="""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Settlements result component fixture</title>
<style>body{margin:0;background:#eef3f6}#mount[data-presentation=game]{height:100dvh;width:100vw;position:fixed;inset:0}</style><main id="mount"></main>
<script type="module">import {mountSettlements} from '/apps/settlements/entry.mjs';const container=document.querySelector('#mount');
window.host=await mountSettlements(container,{owner:'student:component-fixture',...(new URLSearchParams(location.search).get('mode')==='free'?{mode:'free'}:{}),locale:'ru',onViewChange:view=>{if(view==='lobby')delete container.dataset.presentation;else container.dataset.presentation='game';}});document.documentElement.dataset.ready='true';</script>"""

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'site')))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/fixture.html'
report['url']=url
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  context=browser.new_context(viewport={'width':390,'height':844},locale='ru-RU',service_workers='block')
  context.route('**/fixture.html*',lambda route:route.fulfill(content_type='text/html',body=HTML))
  context.route('**/assets/js/settlements-storage.js',lambda route:route.fulfill(content_type='text/javascript',body=STORE))
  context.route('**/runtime/assets/js/settlements/v24/game.mjs',lambda route:route.fulfill(content_type='text/javascript',body=GAME))
  context.route('**/runtime/assets/css/settlements-v24.css',lambda route:route.fulfill(content_type='text/css',body=''))
  context.route('**/runtime/data/settlements/v1/manifest.json',lambda route:route.fulfill(content_type='application/json',body=json.dumps({'regions':[{'id':'a','name':'Территория A'},{'id':'b','name':'Территория B'}]})))
  context.route('**/favicon.ico',lambda route:route.fulfill(status=204,body=''))
  page=context.new_page();page.on('pageerror',lambda error:report['errors'].append(str(error)));page.on('console',lambda msg:report['consoleErrors'].append(msg.text) if msg.type=='error' else None)
  try:
   page.goto(url);page.wait_for_function("document.documentElement.dataset.ready==='true'")
   assert page.locator('[data-rank-mode]').count()==0 and page.locator('[data-select="region"]').count()==0
   report['checks'].append('default assessed entry has no ranking mode switch or territory selector')
   page.locator('[data-action="resume"]').click();page.locator('[data-fixture="finish"]').click()
   result=page.locator('.result');result.wait_for(state='visible')
   page.get_by_text('5/5',exact=True).wait_for()
   assert page.locator('[data-action="new-game"]').is_visible()
   assert page.evaluate('fixture.completeCalls')==1 and not page.evaluate('fixture.online')
   report['checks'].append('result and 5/5 appear before pending completeSession resolves')
   report['labels']={}
   for locale,label in [('ru','Повторная попытка'),('en','New attempt'),('zh','再次尝试')]:
    page.locator('[data-select="locale"]').select_option(locale)
    button=page.locator('[data-action="new-game"]');assert button.inner_text()==label
    box=button.bounding_box();assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=391 and box['y']+box['height']<=845
    points=page.get_by_text('5/5',exact=True);points_box=points.bounding_box();panel=result.bounding_box()
    assert points_box['y']>=panel['y'] and points_box['y']+points_box['height']<=panel['y']+panel['height'], 'points clipped inside result panel'
    report['labels'][locale]={'button':label,'buttonBox':box,'pointsBox':points_box,'panel':panel}
    page.screenshot(path=str(OUT/f'pending-{locale}.png'))
   page.locator('[data-select="locale"]').select_option('ru')
   before=page.evaluate('fixture.saves.length')
   page.locator('[data-action="new-game"]').click()
   page.locator('.lobby').wait_for(state='visible')
   page.wait_for_function('fixture.flushCalls>0')
   assert page.evaluate('fixture.session.attemptId')=='fixture-attempt-a' and page.evaluate('fixture.saves.length')==before
   assert page.evaluate('fixture.mounts.length')==1
   report['checks'].append('retry before ACK returns to lobby but cannot overwrite pending attempt')
   page.evaluate('fixture.ack()')
   page.get_by_text('Результат подтверждён базой.',exact=True).wait_for()
   report['checks'].append('ACK updates visible receipt without reopening the result')
   page.locator('[data-action="new-game"]').click()
   page.locator('[data-fixture="finish"]').wait_for()
   page.wait_for_function('fixture.mounts.length===2')
   new_session=page.evaluate('({attemptId:fixture.session.attemptId,regionId:fixture.session.regionId,status:fixture.session.status})')
   assert new_session['attemptId']!='fixture-attempt-a' and new_session['regionId']=='b' and new_session['status']=='active'
   report['checks'].append('retry after ACK creates one new attempt through existing start flow and excludes previous territory')
   report['newAttempt']=new_session
   page.goto(url+'?mode=free');page.wait_for_function("document.documentElement.dataset.ready==='true'")
   assert page.locator('[data-select="region"]').is_visible() and page.locator('[data-rank-mode]').count()==0
   report['checks'].append('explicit free entry shows territory selector without a mode toggle')
   assert not report['errors'] and not report['consoleErrors']
   report['status']='pass'
  except Exception as error:
   report['status']='fail';report['failure']=str(error);report['traceback']=traceback.format_exc();page.screenshot(path=str(OUT/'failure.png'))
  finally:
   context.close();browser.close()
finally:
 server.shutdown();server.server_close()
 report['hashesAfter']=hashes();report['sourceUnchanged']=report['hashesBefore']==report['hashesAfter']
 if not report['sourceUnchanged']:report['status']='fail'
 report['scriptSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False))
raise SystemExit(0 if report['status']=='pass' else 1)
