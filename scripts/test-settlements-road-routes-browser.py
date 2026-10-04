"""Informed native-engine UI QA; no engine/data/storage fixtures or cloud writes.

Browser plugin/browser skill not available. Uses project-authorized Playwright.
All game actions go through visible controls/search/map; inspect is read-only.
The tiny host records real onCheckpoint callbacks in memory, not Firebase.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from datetime import datetime, timezone
from urllib.parse import urlparse
import argparse, base64, hashlib, json, re, struct, time, traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RUNTIME=ROOT/'site/apps/settlements/runtime'
DATA=RUNTIME/'data/settlements/v1'
JS=RUNTIME/'assets/js/settlements/v24'
parser=argparse.ArgumentParser()
parser.add_argument('--quick',action='store_true')
parser.add_argument('--channel',default='msedge')
parser.add_argument('--matrix-from',type=int,default=1,help='One-based first case, to resume after an honestly recorded partial run')
parser.add_argument('--matrix-to',type=int,default=15)
parser.add_argument('--tutorial-only',action='store_true')
args=parser.parse_args()
OUT=ROOT/'artifacts/settlements-road-routes'/datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
OUT.mkdir(parents=True,exist_ok=True)
FILES=['assets/js/settlements/v24/'+name for name in ['game.mjs','engine.mjs','network-routing.mjs','map.mjs','i18n.mjs']]+['assets/css/settlements-v24.css']
def hashes():return {name:hashlib.sha256((RUNTIME/name).read_bytes()).hexdigest() for name in FILES}
def build_identity():return json.loads((ROOT/'site/apps/settlements/source-manifest.json').read_text('utf-8'))['sourceHash']
def edge(a,b):return '|'.join(sorted([a,b]))
def source(region):
 pack=json.loads((DATA/'regions'/f'{region}.json').read_text('utf-8'))
 network=json.loads((DATA/'transport'/f'{region}.json').read_text('utf-8'))
 rows={row['id']:row for row in pack['settlements']};nodes=[n[0] for n in network['nodes']]
 adjacency={id:[] for id in rows};incoming={id:[] for id in rows}
 for a,b,minutes,kind in network['edges']:
  if kind==1 and nodes[a] in rows and nodes[b] in rows:
   adjacency[nodes[a]].append((minutes,nodes[b]));incoming[nodes[b]].append(nodes[a])
 keys=sorted({edge(a,b) for a,neighbors in adjacency.items() for _,b in neighbors})
 text=(JS/'transport-policy-v2-regions'/f'{region}.mjs').read_text('utf-8')
 record=json.loads(text.split('Object.freeze(',1)[1].rsplit(');',1)[0])
 roads=base64.b64decode(record[4]);metres=base64.b64decode(record[5])
 assert len(keys)==record[3]
 policy={key:{'required':bool(roads[i>>3]&(1<<(i%8))),'metres':struct.unpack_from('<I',metres,i*4)[0]} for i,key in enumerate(keys)}
 return rows,adjacency,incoming,policy

REGION='respublika_adygeya'
ROWS,ADJ,INCOMING,POLICY=source(REGION)
# Deterministic short connected real graph chain; no coordinates are fabricated.
def chain():
 best=None
 for id in sorted(ROWS):
  path=[id];cost=0
  while len(path)<5:
   choices=[(m,j) for m,j in ADJ[path[-1]] if j not in path and (ROWS[j]['population'] or 0)>0 and ROWS[j].get('quality',{}).get('position')=='inside']
   if not choices:break
   m,j=min(choices);path.append(j);cost+=m
  if len(path)==5 and (best is None or cost<best[0]):best=(cost,path)
 assert best
 return best[1]
STOPS=chain()
HTML=r'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native Settlements route QA</title>
<style>html,body{margin:0;overflow:hidden;font:12px sans-serif}#qa-controls{height:32px;display:flex;gap:4px;align-items:center;white-space:nowrap;background:#fff}#qa-controls button,#qa-controls select{height:28px;font-size:11px}#mount{height:calc(100dvh - 32px);width:100vw}</style>
<nav id="qa-controls" aria-label="Explicit QA host controls"><span>QA</span><select id="locale"><option>ru</option><option>en</option><option>zh</option></select><button id="restore">Restore</button><button id="switch">Other region</button><button id="readonly">Read only</button></nav><main id="mount"></main>
<script type="module">
import {mountSettlementsGame} from '/apps/settlements/runtime/assets/js/settlements/v24/game.mjs';
const q=new URLSearchParams(location.search),host=document.querySelector('#mount'),shadow=host.attachShadow({mode:'open'});
const qa=window.qa={checkpoints:[],completions:[],retired:[],ready:false,generation:0,region:q.get('region')||'respublika_adygeya',mode:q.get('mode')||'free',locale:q.get('locale')||'ru',readOnly:false};
document.querySelector('#locale').value=qa.locale;
async function mount(initialSave=null){
 qa.ready=false;if(qa.game){await qa.game.flush();const old=qa.game;old.destroy();qa.retired.push({state:old.inspect().state,ready:old.inspect().ready,canvasAfterDestroy:shadow.querySelectorAll('canvas').length});qa.game=null;}
 shadow.innerHTML='<link rel="stylesheet" href="/apps/settlements/runtime/assets/css/settlements-v24.css"><div id="game" style="height:100%"></div>';
 qa.generation++;qa.game=await mountSettlementsGame(shadow.querySelector('#game'),{locale:qa.locale,regionId:qa.region,mode:qa.mode,difficulty:'hard',owner:'guest:native-road-qa',initialSave,
  onCheckpoint:async payload=>{qa.checkpoints.push({hostRevision:qa.checkpoints.length+1,generation:qa.generation,save:structuredClone(payload.save),metrics:structuredClone(payload.metrics)});},
  onComplete:async payload=>qa.completions.push(structuredClone(payload)),onExit:async()=>{await qa.game.flush();qa.exited=true;}});
 await qa.game.flush();qa.ready=qa.game.inspect().ready;
}
document.querySelector('#locale').onchange=event=>{qa.locale=event.target.value;qa.game.setLocale(qa.locale)};
document.querySelector('#restore').onclick=async()=>{const save=qa.game.snapshot().save;await mount(structuredClone(save))};
document.querySelector('#switch').onclick=async()=>{qa.region='kaliningradskaya_oblast';qa.mode='free';await mount()};
document.querySelector('#readonly').onclick=()=>{qa.readOnly=!qa.readOnly;qa.game.setReadOnly(qa.readOnly)};
await mount();
</script>'''

class Server(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.startswith('/road-qa.html'):
   data=HTML.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
  elif self.path=='/favicon.ico':self.send_response(204);self.end_headers()
  else:super().do_GET()
class LocalHTTPServer(ThreadingHTTPServer):
 # A page requests the real ES-module graph concurrently. Keep this local test
 # server's accept queue above the standard five slots; no machine setting.
 request_queue_size=128
server=LocalHTTPServer(('127.0.0.1',0),partial(Server,directory=str(ROOT/'site')))
Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}/road-qa.html'
report={'kind':'informed native engine/UI walkthrough, real supplied regional data; memory host checkpoints, NOT cloud/profile/student evidence','browserFallback':'Browser plugin not available; project-authorized installed Playwright/Edge','url':BASE,'hashesBefore':hashes(),'sourceHashBefore':build_identity(),'startedAt':datetime.now(timezone.utc).isoformat(),'stopIds':STOPS,'stopNames':[ROWS[id]['name'] for id in STOPS],'cases':[]}
def read(page):return page.evaluate('qa.game.inspect()')
def flush(page):page.evaluate('qa.game.flush()')
def tap(page,selector):page.locator(selector).tap()
def choose(page,id,rows=ROWS):
 tap(page,'[data-act="search"]');page.locator('#settlement-search').fill(rows[id]['name'])
 tap(page,f'[data-select="{id}"][data-search-result]')
def tool(page,name):
 tap(page,'[data-act="tools"]');tap(page,f'[data-tool="{name}"]')
def shot(page,label):page.screenshot(path=str(OUT/(label+'.jpg')),type='jpeg',quality=55)
def visible_button(page,selector):
 button=page.locator(selector);assert button.is_visible() and button.is_enabled(),selector
 box=button.bounding_box();vp=page.viewport_size
 assert box['x']>=-1 and box['y']>=0 and box['x']+box['width']<=vp['width']+1 and box['y']+box['height']<=vp['height']+1,(selector,box,vp)
 assert box['height']>=40,(selector,'height',box)
 # DOM visibility alone does not prove the CTA is not under a scroll clip.
 assert button.evaluate('e=>{const r=e.getBoundingClientRect(),root=e.getRootNode(),n=root.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return n===e||e.contains(n)}'),f'{selector} obscured/clipped'
def wait_ready(page):page.wait_for_function('window.qa?.ready===true',timeout=90000)
def open_page(browser,viewport,locale,mode='free'):
 context=browser.new_context(viewport={'width':viewport[0],'height':viewport[1]},has_touch=True,service_workers='block',reduced_motion='reduce')
 page=context.new_page();page.set_default_timeout(7000)
 row={'viewport':list(viewport),'locale':locale,'mode':mode,'checks':[],'errors':[],'httpFailures':[],'requestFailures':[],'requests':[],'status':'running'}
 page.on('pageerror',lambda error:row['errors'].append(str(error)))
 page.on('console',lambda msg:row['errors'].append(msg.text) if msg.type=='error' else None)
 page.on('response',lambda response:row['httpFailures'].append({'url':response.url,'status':response.status}) if response.status>=400 else None)
 page.on('request',lambda request:row['requests'].append(urlparse(request.url).path))
 page.on('requestfailed',lambda request:row['requestFailures'].append({'url':request.url,'error':request.failure}))
 try:
  page.goto(BASE+f'?locale={locale}&mode={mode}&region={REGION}');wait_ready(page)
 except Exception as error:
  row['startupError']=str(error)
  try:row['startupText']=page.locator('#mount').inner_text();row['qaState']=page.evaluate('({ready:qa.ready,generation:qa.generation,game:!!qa.game})')
  except Exception:pass
  done(context,page,row,error);raise
 assert page.title()=='Native Settlements route QA' and page.locator('.puzzle-map canvas').count()>0
 assert page.locator('.puzzle-header').is_visible() and not page.locator('.puzzle-loading').is_visible()
 row['checks'].append('expected localhost page, native canvas/header rendered, loading hidden, no framework overlay')
 return context,page,row
def done(context,page,row,error=None):
 if error:
  row['status']='fail';row['failure']=str(error);row['traceback']=traceback.format_exc()
  try:shot(page,'failure-'+str(len(report['cases'])));row['lastInspect']=read(page)
  except Exception:pass
 else:row['status']='pass'
 row['requests']=sorted(set(row['requests']));report['cases'].append(row);context.close()
 print(json.dumps({'case':len(report['cases']),'status':row['status'],'viewport':row['viewport'],'failure':row.get('failure')},ensure_ascii=False),flush=True)

def verify_region_requests(requests,allowed):
 for url in requests:
  if any(part in url for part in ['/regions/','/transport/','/boundaries/','/basemaps/','/social-plans-regions/','/transport-policy-v2-regions/','/telecom-plans-regions/']):
   if url.endswith('/index.mjs'):continue
   assert any(region in url for region in allowed),f'foreign regional data request {url}'
def state_signature(state):return {k:state[k] for k in ['budget','spent','revision','actions','routes','facilities','towers']}
def doctor_candidate(state):
 active={edge(a,b) for route in state['routes'] for a,b in zip(route['path'],route['path'][1:])}
 existing={f['settlementId'] for f in state['facilities'] if f['type']=='outreach'}
 for id in sorted(ROWS):
  if id in existing or not INCOMING[id] or (ROWS[id]['population'] or 0)<=0:continue
  reached={id};queue=[id];has_road=False
  for to in queue:
   for frm in INCOMING[to]:
    key=edge(frm,to);p=POLICY[key]
    if p['metres']>0 and (not p['required'] or key in active):has_road=True;break
    if p['metres']==0 and ROWS[frm]['lat']==ROWS[to]['lat'] and ROWS[frm]['lon']==ROWS[to]['lon'] and frm not in reached:reached.add(frm);queue.append(frm)
   if has_road:break
  if not has_road:return id
 raise AssertionError('No no-road outreach candidate in this real regional scenario')

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--disable-component-update','--disable-background-networking'],**({'channel':args.channel} if args.channel else {}));report['browserVersion']=browser.version
  matrix=[((390,844),'ru')] if args.quick else [(size,lang) for size in [(390,844),(320,568),(430,932),(844,390),(1365,900)] for lang in ['ru','en','zh']]
  matrix=[] if args.tutorial_only else matrix[args.matrix_from-1:args.matrix_to]
  for viewport,locale in matrix:
   context,page,row=open_page(browser,viewport,locale)
   try:
    baseline=read(page)['state'];row['initial']={'budget':baseline['budget'],'routes':len(baseline['routes']),'actions':len(baseline['actions'])}
    for lang,label in [('ru','Культура'),('en','Culture'),('zh','文化')]:
     page.locator('#locale').select_option(lang);assert page.locator('[data-layer="culture"] .layer-label').inner_text()==label
     tap(page,'[data-layer="culture"]');assert read(page)['activeLayer']=='culture'
    page.locator('#locale').select_option(locale);flush(page)
    tool(page,'connect')
    row['searchSelectLatencyMs']=[]
    for id in STOPS[:3]:
     started=time.perf_counter();choose(page,id);row['searchSelectLatencyMs'].append(round((time.perf_counter()-started)*1000,1))
    first=read(page)['preview'];assert first['ok'],first
    for lang in ['ru','en','zh',locale]:
     page.locator('#locale').select_option(lang);assert read(page)['preview']['action']['stopIds']==STOPS[:3]
    for id in STOPS[3:]:
     started=time.perf_counter();choose(page,id);row['searchSelectLatencyMs'].append(round((time.perf_counter()-started)*1000,1))
    assert page.locator('.route-stops li').all_text_contents()==[ROWS[id]['name'] for id in STOPS]
    assert not read(page)['state']['actions'],'preview charged/committed early'
    tap(page,'[data-act="route-remove-last"]');assert read(page)['preview']['action']['stopIds']==STOPS[:4]
    choose(page,STOPS[-1]);preview=read(page)['preview'];assert preview['ok'],preview
    assert preview['action']['stopIds']==STOPS and preview['action']['from']==STOPS[0] and preview['action']['to']==STOPS[-1]
    expected=sum((POLICY[key]['metres']+250)//500+(6*POLICY[key]['metres']+250)//500*int(POLICY[key]['required']) for key in preview['freshEdgeKeys'])/10
    assert abs(preview['cost']-expected)<1e-8,(preview['cost'],expected)
    if locale=='en':
     labels=page.locator('.layer-option').evaluate_all('buttons=>buttons.map(button=>{const label=button.querySelector(".layer-label"),range=document.createRange();range.selectNodeContents(label);const a=range.getBoundingClientRect(),b=button.getBoundingClientRect();return {text:label.textContent,aria:button.getAttribute("aria-label"),left:a.left,right:a.right,buttonLeft:b.left,buttonRight:b.right}})')
     assert [label['text'] for label in labels]==['People','Telecom','Health','School','Culture']
     assert all(label['left']>=label['buttonLeft']-1 and label['right']<=label['buttonRight']+1 for label in labels),labels
     assert all(word in labels[i]['aria'] for i,word in enumerate(['Population','Connectivity','Healthcare']))
     row['englishLayerLabels']=labels;row['checks'].append('compact English labels fit inside their buttons without overlap; full Population/Connectivity/Healthcare aria labels retained')
    visible_button(page,'[data-act="confirm"]');shot(page,f'five-stop-preview-{locale}-{viewport[0]}x{viewport[1]}')
    row['preview']={'cost':preview['cost'],'freshEdgeKeys':preview['freshEdgeKeys'],'transportCost':preview['transportCost']}
    row['checks'].append('5 source settlements selected through visible search; ordered list, remove/re-add, locale preserves selection; independent exact per-edge price; confirm fully visible')
    before=page.evaluate('qa.checkpoints.length');started=time.perf_counter();tap(page,'[data-act="confirm"]');flush(page);row['confirmThroughCheckpointMs']=round((time.perf_counter()-started)*1000,1);after=read(page)['state']
    assert page.evaluate('qa.checkpoints.length')==before+1
    assert after['revision']==baseline['revision']+1 and len(after['actions'])==len(baseline['actions'])+1
    assert after['actions'][-1]['stopIds']==STOPS and abs(baseline['budget']-after['budget']-expected)<1e-7
    route=after['routes'][-1];cursor=0
    for id in STOPS:cursor=route['path'].index(id,cursor)+1
    assert route['stopIds']==STOPS and len(after['routes'])==len(baseline['routes'])+1
    row['committed']={'budget':after['budget'],'revision':after['revision'],'action':after['actions'][-1],'path':route['path']}
    wire=page.evaluate('qa.game.snapshot().save')
    assert wire['rulesVersion']=='settlements-3.4.1' and wire['engineRulesVersion']=='settlements-3.4.0',wire
    assert wire['actions'][-1]['stopIds']==STOPS
    assert page.evaluate('qa.checkpoints.at(-1).save.rulesVersion')=='settlements-3.4.1'
    row['wire']={key:wire[key] for key in ['rulesVersion','engineRulesVersion','scenarioVersion','scenarioId']}
    row['checks'].append('one confirm = one real onCheckpoint callback, one engine revision/action/route; path visits all five stops in order; charged all fresh edges once')
    generation=page.evaluate('qa.generation');tap(page,'#restore');page.wait_for_function('g=>qa.ready&&qa.generation===g+1',arg=generation,timeout=90000)
    assert state_signature(read(page)['state'])==state_signature(after)
    assert page.evaluate('qa.game.snapshot().save')==wire,'wire save changed during exact replay'
    assert page.evaluate('qa.retired.at(-1).state===null&&!qa.retired.at(-1).ready&&qa.retired.at(-1).canvasAfterDestroy===0')
    row['checks'].append('wire settlements-3.4.1 with engineRulesVersion 3.4.0 checkpoint and exact re-export; replay restores exact budget/routes/action/revision; old native scene destroys canvas and state before remount')
    before=page.evaluate('qa.checkpoints.length');tap(page,'[data-act="undo"]');flush(page)
    assert state_signature(read(page)['state'])==state_signature(baseline)
    assert page.evaluate('qa.checkpoints.length')==before+1
    row['checks'].append('single UI undo removes entire five-stop route and restores original money/infrastructure; one further host checkpoint')
    id=doctor_candidate(read(page)['state']);tool(page,'outreach');choose(page,id)
    assert not read(page)['preview']['ok'] and page.locator('[data-act="confirm"]').is_disabled()
    row['doctorNoRoad']={'id':id,'name':ROWS[id]['name'],'error':read(page)['preview']['error']}
    assert len(read(page)['state']['actions'])==0
    row['checks'].append('real no-road settlement blocks doctor outreach preview/confirm without spending')
    tap(page,'#readonly');assert page.locator('[data-act="tools"]').is_disabled() and page.locator('[data-act="undo"]').is_disabled()
    choose(page,STOPS[0]);assert read(page)['preview'] is None and len(read(page)['state']['actions'])==0
    tap(page,'#readonly');verify_region_requests(row['requests'],[REGION])
    row['checks'].append('native readOnly disables mutation controls; search stays readable and creates no action; no foreign region downloads')
    if viewport==(390,844) and locale=='ru':
     request_mark=len(row['requests']);generation=page.evaluate('qa.generation');tap(page,'#switch');page.wait_for_function('g=>qa.ready&&qa.generation===g+1',arg=generation,timeout=90000)
     assert read(page)['regionId']=='kaliningradskaya_oblast' and not read(page)['state']['actions']
     assert page.locator('.puzzle-map .sg24-map-scene').count()==1 and page.locator('.puzzle-map .sg24-map-effects').count()==1 and page.evaluate('qa.retired.every(x=>x.state===null&&!x.ready&&x.canvasAfterDestroy===0)')
     verify_region_requests(row['requests'][request_mark:],['kaliningradskaya_oblast'])
     row['checks'].append('host flush/destroy then second real region mounts with one scene + one effects canvas and no previous-region fetches')
    assert not row['errors'] and not row['httpFailures'],(row['errors'],row['httpFailures'])
    done(context,page,row)
   except Exception as error:done(context,page,row,error)
  # A genuine guided two-point connect still works; no direct engine actions.
  if args.tutorial_only or not args.quick and args.matrix_to==15:
   context,page,row=open_page(browser,(390,844),'ru','intro')
   try:
    intro_rows,_,_,_=source('chelyabinskaya_oblast')
    tap(page,'[data-act="guide-position"]');tap(page,'[data-act="confirm"]');flush(page)
    inst=read(page)['tutorial'];tool(page,'medical');choose(page,inst['settlementId'],intro_rows);tap(page,'[data-act="confirm"]');flush(page)
    inst=read(page)['tutorial'];tool(page,'connect');choose(page,inst['from'],intro_rows);choose(page,inst['to'],intro_rows)
    assert read(page)['preview']['ok'];assert not read(page)['preview']['action'].get('stopIds')
    visible_button(page,'[data-act="confirm"]');shot(page,'tutorial-two-point-preview')
    before=page.evaluate('qa.checkpoints.length');tap(page,'[data-act="confirm"]');flush(page)
    state=read(page)['state'];assert len(state['actions'])==3 and state['actions'][-1]['type']=='connect' and page.evaluate('qa.checkpoints.length')==before+1
    row['checks'].append('real guided tower/medical/two-point transport through UI remains valid, one confirm and callback')
    # Finish the existing independent three steps through the visible map/search.
    tool(page,'tower');tap(page,'[data-act="focus"]')
    point=page.evaluate('qa.game.mapPoint({lat:55.89335,lon:61.4931})');box=page.locator('.puzzle-map').bounding_box()
    assert 0<point['x']<box['width'] and 0<point['y']<box['height'],point
    page.touchscreen.tap(box['x']+point['x'],box['y']+point['y']);assert read(page)['preview']['ok'];tap(page,'[data-act="confirm"]');flush(page)
    tool(page,'connect');choose(page,'chelyabinskaya_oblast:93651',intro_rows);choose(page,'chelyabinskaya_oblast:44286',intro_rows)
    assert read(page)['preview']['ok'];tap(page,'[data-act="confirm"]');flush(page)
    tool(page,'culture');choose(page,'chelyabinskaya_oblast:149471',intro_rows);assert read(page)['preview']['ok'];tap(page,'[data-act="confirm"]');flush(page)
    assert page.evaluate("qa.game.snapshot().status==='complete' && qa.completions.length===1")
    terminal=state_signature(read(page)['state'])
    assert page.locator('[data-act="tools"]').is_disabled() and page.locator('[data-act="undo"]').is_disabled()
    for lang,label in [('ru','Культура'),('en','Culture'),('zh','文化')]:
     page.locator('#locale').select_option(lang);assert page.locator('[data-layer="culture"] .layer-label').inner_text()==label
     assert state_signature(read(page)['state'])==terminal
    shot(page,'tutorial-terminal-zh')
    row['checks'].append('genuine six-action tutorial reaches complete; terminal tools/undo disabled; RU/EN/ZH Culture and exact terminal state preserved')
    assert not row['errors'] and not row['httpFailures']
    done(context,page,row)
   except Exception as error:done(context,page,row,error)
  browser.close()
except Exception:
 report['fatal']=traceback.format_exc()
finally:
 server.shutdown();server.server_close();report['hashesAfter']=hashes();report['sourceHashAfter']=build_identity();report['sourceStable']=report['hashesBefore']==report['hashesAfter'] and report['sourceHashBefore']==report['sourceHashAfter']
 report['status']='pass' if not report.get('fatal') and report['sourceStable'] and report['cases'] and all(c['status']=='pass' for c in report['cases']) else 'fail'
 report['scriptSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();report['finishedAt']=datetime.now(timezone.utc).isoformat()
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'status':report['status'],'sourceStable':report['sourceStable'],'output':str(OUT),'fatal':report.get('fatal')},ensure_ascii=False))
raise SystemExit(0 if report['status']=='pass' else 1)
