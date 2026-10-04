"""Training gates component regression, NOT a native engine/student/cloud playthrough.

Uses current entry/copy/CSS with explicit engine and persistence fixtures. The
engine fixture preserves the native checkpoint -> completion save queue and can
deliver restored completion before mount resolves. No dependency installation.
Browser plugin/browser skill unavailable; authorized installed Edge/Playwright.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
import argparse, hashlib, json, sys, traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/settlements-training-gates'
OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--channel',default='msedge');args=parser.parse_args()
FILES=['entry.mjs','copy.mjs','module.css']
def hashes():return {name:hashlib.sha256((ROOT/'site/apps/settlements'/name).read_bytes()).hexdigest() for name in FILES}
report={'kind':'host component with explicit engine/storage fixtures; NOT actual engine, Firebase or student evidence',
        'browserFallback':'Browser plugin not available; installed Edge through Playwright, no installation',
        'status':'running','hashesBefore':hashes(),'cases':[]}

STORE=r"""
const copy=x=>structuredClone(x);
export function createSettlementsPersistence({mode,onStatus,onConflict,onWriterChange}){
 const scenario=new URLSearchParams(location.search).get('scenario')||'fresh';
 const existing=scenario==='replay';
 const f=window.fixture={scenario,mode,writable:true,conflict:false,mounts:[],destroyed:0,checkpoints:[],tutorialSaves:[],completeCalls:0,grades:[],moves:0,errors:[],readOnlyChanges:[],
  session:existing?{attemptId:'synthetic-existing',regionId:'a',difficulty:'hard',mode:'assessment',status:'active',elapsedMs:5678,engineSave:{actions:[{type:'existing'}]}}:null,
  tutorial:{completed:['trained','replay'].includes(scenario),engineSave:scenario==='restored'?{actions:Array.from({length:6},(_,i)=>({type:'fixture',step:i})),ui:{terminalReason:'complete'}}:null}};
 f.loseWriter=()=>{f.writable=false;onWriterChange({writable:false})};
 f.raiseConflict=()=>{f.conflict=true;onConflict({scope:'tutorial',local:copy(f.tutorial),cloud:copy(f.tutorial)})};
 return {acquireWriter:async()=>f.writable,canWrite:()=>f.writable&&!f.conflict,loadSession:async()=>copy(f.session),loadTutorial:async()=>copy(f.tutorial),readLeaderboard:async()=>[],
  saveSession:async value=>{f.session=copy(value);return copy(value)},
  saveTutorial:async value=>{f.tutorial={...copy(value),completed:Boolean(f.tutorial.completed||value.completed)};f.tutorialSaves.push(copy(f.tutorial));return copy(f.tutorial)},
  completeSession:async(value,result)=>{f.completeCalls++;f.session={...copy(value),result:copy(result),status:'completed'};f.grades.push({mode,points:mode==='assessment'?5:0});onStatus({state:'saved',writable:true,session:copy(f.session)});return copy(f.session)},
  confirmOnline:async()=>true,flush:async()=>({session:copy(f.session)}),destroy:async()=>{}};
}
"""
GAME=r"""
export async function mountSettlementsGame(root,options){
 const f=window.fixture;f.mounts.push({mode:options.mode,regionId:options.regionId,difficulty:options.difficulty,initialSave:structuredClone(options.initialSave)});
 let save=structuredClone(options.initialSave)||{actions:[]},queue=Promise.resolve(),completionSent=false,readOnly=options.readOnly,disposed=false;
 root.innerHTML='<div class="puzzle-map" tabindex="0" role="application" aria-label="Synthetic map component" style="height:100%;padding:16px;background:#dce9dc"><p>COMPONENT FIXTURE · no actual game engine</p><button data-fixture="move" style="margin:12px;min-height:48px">Synthetic move</button><button data-fixture="finish" style="margin:12px;min-height:48px">Complete synthetic tutorial</button></div>';
 const snapshot=()=>({save:structuredClone(save),status:save.ui?.terminalReason||'playing',metrics:{spentMillionRub:12},evaluation:{spent:12,services:Object.fromEntries(['telecom','medical','school','culture'].map(k=>[k,{total:7,covered:save.ui?.terminalReason?7:2,population:700,people:save.ui?.terminalReason?700:200}]))}});
 const persist=()=>{const payload=snapshot();queue=queue.then(async()=>{if(disposed)return;f.checkpoints.push(structuredClone(payload.save));await options.onCheckpoint?.(payload);if(payload.save.ui?.terminalReason&&!completionSent){completionSent=true;try{await options.onComplete?.({...payload,reason:payload.save.ui.terminalReason})}catch(error){completionSent=false;throw error}}});return queue};
 root.querySelector('[data-fixture=move]').onclick=()=>{if(readOnly||disposed||save.ui?.terminalReason)return;f.moves++;save.actions.push({type:'fixture-move'});void persist().catch(error=>f.errors.push(error.message))};
 root.querySelector('[data-fixture=finish]').onclick=()=>{if(readOnly||disposed||save.ui?.terminalReason)return;save={actions:Array.from({length:6},(_,i)=>({type:'fixture',step:i})),ui:{terminalReason:'complete'}};void persist().catch(error=>f.errors.push(error.message))};
 // Force the permitted restored-completion callback timing before mount returns.
 if(save.ui?.terminalReason)await persist();else void persist().catch(error=>f.errors.push(error.message));
 return {snapshot,setLocale:async value=>{f.engineLocale=value},setReadOnly:value=>{readOnly=!!value;f.readOnlyChanges.push(readOnly)},flush:async()=>{await queue},destroy:()=>{disposed=true;f.destroyed++;root.replaceChildren()}};
}
"""
HTML=r"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Training gates component fixture</title>
<style>body{margin:0;background:#eef3f6}#mount[data-presentation=game]{height:100dvh;width:100vw;position:fixed;inset:0}</style><main id="mount"></main>
<script type="module">import {mountSettlements} from '/apps/settlements/entry.mjs';
const q=new URLSearchParams(location.search),container=document.querySelector('#mount');
window.host=await mountSettlements(container,{owner:q.get('owner')==='teacher'?'teacher:synthetic':'student:synthetic',mode:q.get('mode')||'assessment',locale:q.get('locale')||'ru',onViewChange:view=>{if(view==='lobby')delete container.dataset.presentation;else container.dataset.presentation='game';}});
document.documentElement.dataset.ready='true';</script>"""

class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'site')))
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/fixture.html'

def configure(context):
 context.route('**/fixture.html*',lambda r:r.fulfill(content_type='text/html',body=HTML))
 context.route('**/assets/js/settlements-storage.js',lambda r:r.fulfill(content_type='text/javascript',body=STORE))
 context.route('**/runtime/assets/js/settlements/v24/game.mjs',lambda r:r.fulfill(content_type='text/javascript',body=GAME))
 context.route('**/runtime/assets/css/settlements-v24.css',lambda r:r.fulfill(content_type='text/css',body=''))
 context.route('**/runtime/data/settlements/v1/manifest.json',lambda r:r.fulfill(content_type='application/json',body=json.dumps({'regions':[{'id':'a','name':'Территория A'},{'id':'b','name':'Территория B'}]})))
 context.route('**/favicon.ico',lambda r:r.fulfill(status=204,body=''))

def gate(page,kind):return page.locator(f'dialog.training-dialog[data-training-kind="{kind}"]')
def focused(page):return page.evaluate("()=>{let n=document.activeElement;while(n?.shadowRoot?.activeElement)n=n.shadowRoot.activeElement;return {tag:n?.tagName,action:n?.dataset?.action,map:n?.classList?.contains('puzzle-map'),inside:!!n?.closest?.('dialog.training-dialog')}}")
def verify_gate(page,kind,locale,row):
 dialog=gate(page,kind);dialog.wait_for(state='visible')
 assert dialog.evaluate('node=>node.open && node.matches(":modal")'),'gate must be a native blocking modal'
 assert dialog.get_attribute('aria-labelledby')=='training-gate-title'
 assert dialog.get_attribute('aria-describedby')=='training-gate-message'
 title=dialog.locator('#training-gate-title').inner_text();message=dialog.locator('#training-gate-message').inner_text()
 assert title and message
 if locale=='ru':assert title==('Добро пожаловать в обучение!' if kind=='welcome' else 'Обучение завершено!')
 elif locale=='en':assert any('a'<=c.lower()<='z' for c in title) and not any('а'<=c.lower()<='я' for c in title)
 else:assert any('\u3400'<=c<='\u9fff' for c in title)
 button=dialog.locator('[data-action="training-continue"]');assert button.is_visible()
 if locale=='ru':assert button.inner_text()=='К игре'
 box=dialog.bounding_box();viewport=page.viewport_size
 assert box['x']<=1 and box['y']<=1 and box['width']>=viewport['width']-2 and box['height']>=viewport['height']-2,'gate does not cover viewport'
 cta=button.bounding_box();assert cta['height']>=44 and cta['x']>=0 and cta['x']+cta['width']<=viewport['width']+1 and cta['y']>=0 and cta['y']+cta['height']<=viewport['height']+1,'CTA clipped or too small'
 assert focused(page)['inside'],'initial focus outside modal'
 page.keyboard.press('Escape');assert dialog.is_visible() and dialog.evaluate('n=>n.open'),'Escape bypassed gate'
 focus_path=[]
 for key in ['Tab','Shift+Tab','Tab','Tab']:
  page.keyboard.press(key);state=focused(page);focus_path.append(state)
  assert state['inside'] or state['tag']=='BODY','keyboard focus reached underlying game control'
 button.focus()
 before=page.evaluate('fixture.moves');move_box=page.locator('[data-fixture="move"]').bounding_box()
 page.touchscreen.tap(move_box['x']+8,move_box['y']+8)
 assert page.evaluate('fixture.moves')==before and dialog.is_visible(),'touch bypassed the blocking gate'
 button.focus();row['checks'].append(f'{kind}: translated modal, viewport coverage, 44px CTA, focus containment, Escape and touch blocked')
 row.setdefault('titles',{})[kind]=title;row.setdefault('focusPaths',{})[kind]=focus_path
 return button

def open_page(browser,locale='ru',viewport=(390,844),query=''):
 context=browser.new_context(viewport={'width':viewport[0],'height':viewport[1]},has_touch=True,service_workers='block')
 configure(context);page=context.new_page();page.set_default_timeout(5000)
 row={'locale':locale,'viewport':list(viewport),'query':query,'status':'running','checks':[],'errors':[]}
 page.on('pageerror',lambda error:row['errors'].append(str(error)))
 page.on('console',lambda msg:row['errors'].append(msg.text) if msg.type=='error' else None)
 page.goto(base+'?locale='+locale+query);page.wait_for_function("document.documentElement.dataset.ready==='true'")
 assert page.title()=='Training gates component fixture'
 return context,page,row

def finish_row(context,page,row,error=None):
 if error:
  row['status']='fail';row['failure']=str(error);row['traceback']=traceback.format_exc()
  try:page.screenshot(path=str(OUT/f'failure-{len(report["cases"])}.jpg'),type='jpeg',quality=55)
  except Exception:pass
 else:
  assert not row['errors'],row['errors'];assert not page.evaluate('fixture.errors'),page.evaluate('fixture.errors');row['status']='pass'
 report['cases'].append(row);context.close()
 print(json.dumps({'case':len(report['cases']),'status':row['status'],'failure':row.get('failure')},ensure_ascii=True),flush=True)

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--disable-component-update','--disable-background-networking'],**({'channel':args.channel} if args.channel else {}));report['browserVersion']=browser.version
  for locale,viewport in [('ru',(390,844)),('en',(390,844)),('zh',(390,844)),('ru',(320,568)),('ru',(844,390))]:
   context,page,row=open_page(browser,locale,viewport)
   try:
    assert page.evaluate("fixture.mounts.length===1&&fixture.mounts[0].mode==='intro'&&fixture.mounts[0].regionId==='chelyabinskaya_oblast'&&fixture.session===null")
    assert not page.locator('[data-select="difficulty"]').count(),'difficulty appeared before first tutorial'
    button=verify_gate(page,'welcome',locale,row)
    if locale=='ru' and viewport==(390,844):
     mounts=page.evaluate('fixture.mounts.length');await_before=page.evaluate('fixture.tutorial.engineSave')
     for next_locale in ['en','zh','ru']:
      page.evaluate('locale=>host.setLocale(locale)',next_locale)
      assert gate(page,'welcome').is_visible() and focused(page)['inside']
      assert page.evaluate('fixture.mounts.length')==mounts
      assert page.evaluate('fixture.tutorial.engineSave')==await_before
     row['checks'].append('live locale changes keep welcome open, focus contained and scene/replay unchanged')
    page.screenshot(path=str(OUT/f'welcome-{locale}-{viewport[0]}x{viewport[1]}.jpg'),type='jpeg',quality=60)
    button.tap();assert not page.locator('dialog.training-dialog[open]').count();assert focused(page)['map'],'welcome did not return focus to map'
    page.locator('[data-fixture="move"]').tap();page.wait_for_function('fixture.moves===1')
    page.locator('[data-fixture="finish"]').tap();button=verify_gate(page,'complete',locale,row)
    assert page.evaluate('fixture.tutorial.completed&&fixture.completeCalls===0&&fixture.grades.length===0&&fixture.session===null')
    page.screenshot(path=str(OUT/f'complete-{locale}-{viewport[0]}x{viewport[1]}.jpg'),type='jpeg',quality=60)
    button.tap();page.locator('.lobby').wait_for(state='visible');page.locator('[data-select="difficulty"]').wait_for()
    assert not page.locator('dialog.training-dialog[open]').count()
    assert page.evaluate('fixture.destroyed===1&&fixture.mounts.length===1&&fixture.session===null&&fixture.grades.length===0')
    options=page.locator('[data-select="difficulty"] option').all_text_contents();assert len(options)==3 and all(f'{score}/5' in text for score,text in zip([3,4,5],options))
    row['checks'].append('auto first tutorial completes without assessed attempt/grade; CTA destroys scene and reveals difficulty 3/4/5')
    finish_row(context,page,row)
   except Exception as error:finish_row(context,page,row,error)
  context,page,row=open_page(browser,query='&scenario=replay')
  try:
   assert not page.locator('dialog.training-dialog[open]').count() and page.evaluate('fixture.mounts.length===0')
   original=page.evaluate('structuredClone(fixture.session)');page.locator('[data-action="tutorial"]').tap()
   verify_gate(page,'welcome','ru',row).tap();assert page.evaluate('fixture.mounts[0].initialSave===null')
   page.locator('[data-fixture="finish"]').tap();verify_gate(page,'complete','ru',row).tap();page.locator('.lobby').wait_for(state='visible')
   assert page.evaluate('structuredClone(fixture.session)')==original
   assert page.evaluate('fixture.tutorial.completed&&fixture.completeCalls===0&&fixture.grades.length===0')
   row['checks'].append('explicit replay shows both gates and preserves assessed session, elapsed time and result history')
   finish_row(context,page,row)
  except Exception as error:finish_row(context,page,row,error)
  context,page,row=open_page(browser,query='&scenario=restored')
  try:
   button=verify_gate(page,'complete','ru',row);assert not gate(page,'welcome').is_visible()
   assert page.evaluate('fixture.tutorial.completed&&fixture.session===null&&fixture.completeCalls===0')
   button.tap();page.locator('[data-select="difficulty"]').wait_for()
   row['checks'].append('terminal restored tutorial completion delivered before mount resolves is not overwritten by welcome')
   finish_row(context,page,row)
  except Exception as error:finish_row(context,page,row,error)
  for query in ['&scenario=trained','&mode=free','&owner=teacher']:
   context,page,row=open_page(browser,query=query)
   try:
    assert not page.locator('dialog.training-dialog[open]').count() and page.evaluate('fixture.mounts.length===0')
    assert page.locator('.lobby').is_visible();row['checks'].append('completed profile/free mode/teacher does not auto-start tutorial')
    finish_row(context,page,row)
   except Exception as error:finish_row(context,page,row,error)
  for interruption in ['writer','conflict']:
   context,page,row=open_page(browser)
   try:
    gate(page,'welcome').wait_for(state='visible')
    before=page.evaluate('structuredClone(fixture.tutorial.engineSave)')
    page.evaluate('fixture.loseWriter()' if interruption=='writer' else 'fixture.raiseConflict()')
    page.wait_for_function("!document.querySelector('#mount').shadowRoot.querySelector('.training-dialog').open")
    selectors=['[data-action="takeover"]'] if interruption=='writer' else ['[data-action="cloud"]','[data-action="local"]']
    for selector in selectors:
     choice=page.locator(selector);assert choice.is_visible();choice.scroll_into_view_if_needed();choice.focus()
     assert focused(page)['action'] in ['takeover','cloud','local']
     box=choice.bounding_box();assert box['x']>=0 and box['x']+box['width']<=391 and box['y']>=0 and box['y']+box['height']<=845
    page.locator('[data-fixture="move"]').tap()
    assert page.evaluate('fixture.moves===0 && fixture.completeCalls===0')
    assert page.evaluate('structuredClone(fixture.tutorial.engineSave)')==before
    page.evaluate("host.setLocale('en')")
    assert not page.locator('dialog.training-dialog[open]').count(),'locale change reopened gate over recovery choices'
    row['checks'].append(f'{interruption} during welcome: modal closes, recovery choices reachable, map stays read-only, locale cannot hide recovery')
    finish_row(context,page,row)
   except Exception as error:finish_row(context,page,row,error)
  browser.close()
except Exception:
 report['fatal']=traceback.format_exc()
finally:
 server.shutdown();server.server_close();report['hashesAfter']=hashes();report['sourceStable']=report['hashesBefore']==report['hashesAfter']
 report['status']='pass' if not report.get('fatal') and report['sourceStable'] and len(report['cases'])==12 and all(row['status']=='pass' for row in report['cases']) else 'fail'
 report['scriptSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(report,ensure_ascii=True,indent=2))
sys.exit(0 if report['status']=='pass' else 1)
