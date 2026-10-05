"""Native tower QA, real regional data/engine; synthetic memory-only host.

The Browser tool was attempted first: configured Chrome was not installed.
AGENTS.md permits the installed Playwright/Edge localhost fallback. No Firebase
calls, replaced engine responses, test weakening, or real student fixtures.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from datetime import datetime, timezone
from urllib.parse import urlparse
import argparse, hashlib, json, math, platform, statistics, time, traceback
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'site/apps/settlements/runtime'
JS = RUNTIME / 'assets/js/settlements/v24'
parser = argparse.ArgumentParser()
parser.add_argument('--channel', default='msedge')
parser.add_argument('--quick', action='store_true')
parser.add_argument('--serve-only', action='store_true')
args = parser.parse_args()
OUT = ROOT / 'artifacts/tower-spacing/browser' / datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
OUT.mkdir(parents=True, exist_ok=True)
FILES = ['assets/js/settlements/v24/' + name for name in ['game.mjs', 'engine.mjs', 'scenarios.mjs', 'telecom-policy.mjs', 'initial-tower-spacing.mjs', 'map.mjs', 'tower-lod.mjs', 'i18n.mjs']] + ['assets/css/settlements-v24.css']
def hashes():
    manifest=json.loads((ROOT/'site/apps/settlements/source-manifest.json').read_text('utf-8'))
    paths=sorted(set(FILES+[item['path'] for item in manifest['files'] if item['path'].startswith(('assets/js/','assets/css/'))]))
    result={name:hashlib.sha256((RUNTIME/name).read_bytes()).hexdigest() for name in paths}
    for name in ['site/apps/settlements/entry.mjs','site/assets/js/settlements-storage.js']:
        result['platform:'+name]=hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
    return result
def source_identity():
    raw=(ROOT/'site/apps/settlements/source-manifest.json').read_bytes();manifest=json.loads(raw)
    return {'sourceHash':manifest['sourceHash'],'fileCount':len(manifest['files']),'manifestSha256':hashlib.sha256(raw).hexdigest()}
def rows(region): return json.loads((RUNTIME / 'data/settlements/v1/regions' / (region + '.json')).read_text('utf-8'))['settlements']

HTML = r'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native Settlements tower QA</title>
<style>html,body{margin:0;overflow:hidden;font:12px sans-serif}#qa-controls{height:32px;display:flex;gap:4px;align-items:center;white-space:nowrap;background:#fff}#qa-controls button,#qa-controls select{height:28px;font-size:11px}#mount{height:calc(100dvh - 32px);width:100vw}</style>
<nav id="qa-controls" aria-label="Explicit QA host controls"><span>QA</span><select id="locale"><option>ru</option><option>en</option><option>zh</option></select><button id="restore">Restore</button><button id="destroy">Destroy</button></nav><main id="mount"></main>
<script type="module">
import {mountSettlementsGame} from '/apps/settlements/runtime/assets/js/settlements/v24/game.mjs';
import {GameMap} from '/apps/settlements/runtime/assets/js/settlements/v24/map.mjs';
import {World} from '/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {loadRegion,DATA,json} from '/apps/settlements/runtime/assets/js/settlements/v2/data.mjs';
import {loadDistanceTransportPolicy} from '/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {loadSocialPlan} from '/apps/settlements/runtime/assets/js/settlements/v24/social-plans.mjs';
import {createRegionalScenario} from '/apps/settlements/runtime/assets/js/settlements/v24/scenarios.mjs';
import {createState,exportSave} from '/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
const query=new URLSearchParams(location.search),host=document.querySelector('#mount'),shadow=host.attachShadow({mode:'open'});
const qa=window.qa={ready:false,generation:0,checkpoints:[],retired:[],destroyedScenes:[],region:query.get('region')||'respublika_bashkortostan',difficulty:query.get('difficulty')||'hard',locale:'ru'};
// Observe real cleanup after the original destroy method; never substitute it.
const originalDestroy=GameMap.prototype.destroy;
GameMap.prototype.destroy=function(...args){const result=originalDestroy.apply(this,args);qa.destroyedScenes.push({destroyed:this.destroyed,worldIsNull:this.world===null,points:this.points.size,towers:this.towerGeometry.length,towerCache:this.towerCache.evidence(),towerSymbols:this.towerSymbolCache.evidence(),motion:this.motionEvidence()});return result;};
async function legacyFixture(){
 const [{pack,network},boundary]=await Promise.all([loadRegion(qa.region,{includeMissions:false}),json(new URL(`boundaries/${qa.region}.geojson`,DATA))]);
 const world=new World(pack,network);await loadDistanceTransportPolicy(world);await loadSocialPlan(world,{difficulty:qa.difficulty});
 const scenario=createRegionalScenario(world,boundary,{mode:'free',version:5,difficulty:qa.difficulty,initialTowerPolicyVersion:null});
 const state=createState(world,scenario),save=exportSave(state);
 qa.legacyFixture={kind:'synthetic current engine with explicit legacy initial-network option; NOT a real student save',count:state.towers.length,save:structuredClone(save)};return save;
}
async function mount(initialSave=null){
 qa.ready=false;if(qa.game){await qa.game.flush();const old=qa.game;old.destroy();qa.retired.push({state:old.inspect().state,ready:old.inspect().ready,canvasAfterDestroy:shadow.querySelectorAll('canvas').length});qa.game=null;}
 shadow.innerHTML='<link rel="stylesheet" href="/apps/settlements/runtime/assets/css/settlements-v24.css"><div id="game" style="height:100%"></div>';
 qa.generation++;qa.game=await mountSettlementsGame(shadow.querySelector('#game'),{locale:qa.locale,regionId:qa.region,mode:'free',difficulty:qa.difficulty,owner:'guest:native-tower-qa',initialSave,
 onCheckpoint:async payload=>qa.checkpoints.push({generation:qa.generation,save:structuredClone(payload.save),metrics:structuredClone(payload.metrics)})});
 await qa.game.flush();qa.ready=qa.game.inspect().ready;
}
document.querySelector('#locale').onchange=e=>{qa.locale=e.target.value;qa.game.setLocale(qa.locale)};
document.querySelector('#restore').onclick=async()=>{const save=qa.game.snapshot().save;await mount(structuredClone(save))};
document.querySelector('#destroy').onclick=async()=>{await qa.game.flush();const old=qa.game;old.destroy();qa.retired.push({state:old.inspect().state,ready:old.inspect().ready,canvasAfterDestroy:shadow.querySelectorAll('canvas').length});qa.ready=false;qa.game=null;};
try{await mount(query.get('legacy')==='1'?await legacyFixture():null)}catch(error){qa.error={message:error.message,stack:error.stack};throw error;}
</script>'''

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        if self.path.startswith('/tower-qa.html'):
            data=HTML.encode(); self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
        elif self.path == '/favicon.ico': self.send_response(204); self.end_headers()
        else: super().do_GET()
class HTTPServer(ThreadingHTTPServer): request_queue_size = 128
server=HTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'site')))
Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}/tower-qa.html'
report={'kind':'informed native UI QA; actual game/region data; memory-only save host; no cloud or physical-phone evidence','flow':'new or legacy regional party → telecom layer, resize/language/pan → separated symbols and unchanged replay → player tower, restore, undo','fallback':'mcp__playwright browser_tabs failed: Chromium distribution chrome not found at C:\\Users\\arsen\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe. AGENTS.md permits installed Playwright/Edge localhost fallback. No dependency installed.','environment':platform.platform(),'url':BASE,'startedAt':datetime.now(timezone.utc).isoformat(),'hashesBefore':hashes(),'cases':[]}

report['scriptSha256Before']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
report['sourceIdentityBefore']=source_identity()

def tap(page, selector): page.locator(selector).tap()
def flush(page): page.evaluate('qa.game.flush()')
def ready(page): page.wait_for_function('window.qa?.ready===true || window.qa?.error',timeout=180000); assert not page.evaluate('qa.error||null'),page.evaluate('qa.error')
def state(page): return page.evaluate('qa.game.inspect().state')
def engine_save(page): return page.evaluate('(()=>{const {ui,...save}=qa.game.snapshot().save;return save})()')
def scene(page): return page.evaluate('qa.game.sceneEvidence()')
def settle(page): page.wait_for_timeout(220); page.wait_for_function('!qa.game.sceneEvidence().camera.moving',timeout=10000)
def overview(page): tap(page,'[data-act="menu"]'); tap(page,'[data-act="overview"]'); settle(page)
def choose(page, item):
    tap(page,'.puzzle-camera [data-act="search"]'); page.locator('#settlement-search').fill(item['name']); tap(page,f'[data-select="{item["id"]}"][data-search-result]')
def screenshot(page,label):
    file=OUT/(label+'.png'); page.screenshot(path=str(file)); return str(file.relative_to(ROOT))
def spacing(towers):
    smallest=math.inf
    for i,a in enumerate(towers):
        lat1=math.radians(a['lat'])
        for b in towers[i+1:]:
            lat2=math.radians(b['lat']);dl=math.radians(b['lon']-a['lon']);dp=lat2-lat1
            km=6371.0088*2*math.asin(min(1,math.sqrt(math.sin(dp/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dl/2)**2)))
            smallest=min(smallest,km)
    return smallest if math.isfinite(smallest) else None
def render_check(page,row,label):
    settle(page); evidence=scene(page); symbols=[t for t in evidence['towerSymbols'] if not t['ghost']]
    selected=evidence['selectedId']; source_towers={t['id']:t for t in state(page)['towers']}
    passive=[t for t in symbols if t['id'].startswith('initial-tower:') and source_towers[t['id']]['settlementId']!=selected]
    worst=math.inf
    for i,a in enumerate(passive):
        for b in passive[i+1:]:
            distance=math.hypot(a['x']-b['x'],a['y']-b['y']);required=max(a['size']+16,a['size']*math.sqrt(2)+4)
            worst=min(worst,distance-required); assert distance>=required-.01,('passive tower symbol overlap',a,b,distance,required)
    display=evidence['towerDisplay'];assert display['initialCoverageFills']==1,display
    assert display['zoneMode']=='cached-union',display
    assert display['initialCoverageOutlines']<=1,display
    assert len(symbols)<=180,('unbounded overview symbols',len(symbols))
    assert page.locator('.sg24-map-scene').count()==1 and page.locator('.sg24-map-effects').count()==1
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'horizontal document overflow'
    assert page.locator('.puzzle-header').is_visible() and not page.locator('.puzzle-loading').is_visible()
    costs=evidence['frameCostsMs']
    result={'label':label,'viewport':page.viewport_size,'display':display,'engineTowers':len(source_towers),'drawnSymbols':len(symbols),'passiveMinimumGapPx':round(worst,3) if math.isfinite(worst) else None,'region':evidence['region'],'paintMs':{'count':len(costs),'median':statistics.median(costs) if costs else None,'max':max(costs) if costs else None},'screenshot':screenshot(page,label)}
    result['basemap']={'sourceStatus':evidence['basemap']['sourceStatus'],'texture':evidence['basemap']['texture']}
    row['renders'].append(result);return evidence

def cleanup_check(page,row):
    tap(page,'#destroy');page.wait_for_function('qa.game===null')
    retirement=page.evaluate('({retired:qa.retired,destroyedScenes:qa.destroyedScenes})')
    assert retirement['retired'] and retirement['destroyedScenes']
    for r in retirement['retired']: assert r=={'state':None,'ready':False,'canvasAfterDestroy':0},r
    for e in retirement['destroyedScenes']:
        assert e['destroyed'] and e['worldIsNull'] and e['points']==0 and e['towers']==0,e
        assert e['towerCache']['activeCount']==0 and e['towerCache']['initialCoverageCount']==0,e
        assert e['towerSymbols']['sourceCount']==0 and e['towerSymbols']['representativeCount']==0,e
        assert e['motion']['ownSubscriptions']==0 and not e['motion']['observerActive'] and not e['motion']['raf'],e
    row['cleanup']=retirement

def run_case(browser,region,difficulty,legacy=False,expanded=False):
    row={'region':region,'difficulty':difficulty,'legacy':legacy,'status':'running','renders':[],'errors':[],'httpFailures':[],'requestFailures':[],'requests':[]}
    context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,service_workers='block',reduced_motion='reduce')
    page=context.new_page();page.set_default_timeout(12000)
    page.on('pageerror',lambda e:row['errors'].append(str(e)))
    page.on('console',lambda m:row['errors'].append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:row['requests'].append(urlparse(r.url).path))
    page.on('requestfailed',lambda r:row['requestFailures'].append({'url':r.url,'error':r.failure}))
    page.on('response',lambda r:row['httpFailures'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    label=f'{region}-{difficulty}-'+('legacy' if legacy else 'new')
    try:
        started=time.perf_counter();page.goto(BASE+f'?region={region}&difficulty={difficulty}&legacy={int(legacy)}');ready(page)
        row['mountMs']=round((time.perf_counter()-started)*1000,1)
        assert page.title()=='Native Settlements tower QA'
        baseline=state(page);base_save=engine_save(page);row['initial']={'towerCount':len(baseline['towers']),'budget':baseline['budget'],'actions':len(baseline['actions']),'wire':base_save['rulesVersion'],'policy':base_save.get('initialTowerPolicyVersion')}
        if legacy:
            fixture=page.evaluate('qa.legacyFixture');assert fixture['save']==base_save,(fixture['save'],base_save)
            if region=='respublika_bashkortostan': assert len(baseline['towers'])=={'hard':458,'easy':3313}[difficulty],row['initial']
            row['legacyFixture']= {'kind':fixture['kind'],'count':fixture['count'],'originalSaveSha256':hashlib.sha256(json.dumps(fixture['save'],sort_keys=True).encode()).hexdigest()}
        else:
            assert base_save['rulesVersion']=='settlements-3.4.2' and base_save['initialTowerPolicyVersion']=='spaced-18km-v1',row['initial']
            minimum=spacing(baseline['towers']); assert minimum is None or minimum>=18-1e-7,minimum
            row['initial']['minimumSeparationKm']=minimum
        tap(page,'[data-layer="telecom"]');overview(page)
        render_check(page,row,label+'-390x844-ru')
        if expanded:
            for width,height in [(320,568),(430,932),(844,390),(1365,900)]:
                page.set_viewport_size({'width':width,'height':height});overview(page);render_check(page,row,label+f'-{width}x{height}-ru')
            page.set_viewport_size({'width':390,'height':844});overview(page)
            for locale,expected in [('en','Telecom'),('zh','通信'),('ru','Связь')]:
                page.locator('#locale').select_option(locale)
                assert engine_save(page)==base_save,'locale changed engine save'
                assert page.locator('[data-layer="telecom"] .layer-label').inner_text()==expected
                render_check(page,row,label+f'-390x844-{locale}')
            before=scene(page);page.locator('.puzzle-map').focus();started=time.perf_counter()
            for key in ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp']:page.keyboard.press(key)
            settle(page);after=scene(page);row['pan']={'fourKeyWallMs':round((time.perf_counter()-started)*1000,1),'cacheBefore':before['towerDisplay']['symbolCache'],'cacheAfter':after['towerDisplay']['symbolCache'],'paintMs':after['frameCostsMs'][-20:]}
            assert before['towerDisplay']['symbolCache']['computations']==after['towerDisplay']['symbolCache']['computations'],'pan recomputed tower representatives'
        assert engine_save(page)==base_save,'render/layout changed engine save'
        for _ in range(3):tap(page,'[data-act="zoom-in"]')
        render_check(page,row,label+'-390x844-zoomed')
        overview(page)
        if expanded or (legacy and difficulty=='hard'):
            # Choose an actual omitted seed/settlement via native search, never mutate state.
            initial_ids={t['settlementId'] for t in baseline['towers']}
            candidates=[r for r in rows(region) if r['id'] not in initial_ids and (r.get('population') or 0)>0 and r.get('quality',{}).get('position')=='inside']
            item=max(candidates,key=lambda r:r['population'])
            tap(page,'[data-act="tools"]');tap(page,'[data-tool="tower"]');choose(page,item)
            preview=page.evaluate('qa.game.inspect().preview');assert preview['ok'],preview
            assert page.locator('[data-act="confirm"]').is_enabled()
            row['playerPreviewScreenshot']=screenshot(page,label+'-player-preview')
            count_before=page.evaluate('qa.checkpoints.length');tap(page,'[data-act="confirm"]');flush(page);settle(page)
            played=state(page);assert len(played['actions'])==1 and len(played['towers'])==len(baseline['towers'])+1
            assert abs(played['spent']-preview['cost'])<1e-8
            player=played['towers'][-1];evidence=scene(page)
            assert player['id'] in [t['id'] for t in evidence['towerSymbols'] if not t['ghost']], 'new player tower concealed'
            played_save=engine_save(page);row['player']={'towerId':player['id'],'spent':played['spent'],'checkpointsAdded':page.evaluate('qa.checkpoints.length')-count_before,'wire':played_save['rulesVersion'],'screenshot':screenshot(page,label+'-player-built')}
            generation=page.evaluate('qa.generation');tap(page,'#restore');page.wait_for_function('(g)=>qa.ready && qa.generation>g',arg=generation,timeout=180000)
            assert engine_save(page)==played_save,'restore changed replay payload'
            restored=state(page)
            for key in ['towers','actions','spent','budget','facilities','routes']:assert restored[key]==played[key],('restore changed',key)
            row['player']['restoredExactly']=True
            tap(page,'[data-act="undo"]');flush(page);undone=state(page)
            for key in ['towers','actions','spent','budget','facilities','routes']:assert undone[key]==baseline[key],('undo changed baseline',key)
            row['player']['undoExactly']=True
        cleanup_check(page,row)
        for path in set(row['requests']):
            if any(p in path for p in ['/regions/','/transport/','/boundaries/','/roads/','/basemaps/','/social-plans-regions/','/transport-policy-v2-regions/']):
                assert region in path or path.endswith('/index.mjs'),('foreign-region fetch',path)
        assert not row['errors'] and not row['httpFailures'] and not row['requestFailures'],(row['errors'],row['httpFailures'],row['requestFailures'])
        row['status']='pass'
    except Exception as error:
        row['status']='fail';row['failure']=str(error);row['traceback']=traceback.format_exc()
        try:row['failureScreenshot']=screenshot(page,label+'-failure');row['lastScene']=scene(page)
        except Exception:pass
    finally:
        row['requests']=sorted(set(row['requests']));report['cases'].append(row);context.close()
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'case':label,'status':row['status'],'failure':row.get('failure'),'mountMs':row.get('mountMs')},ensure_ascii=False),flush=True)

try:
    if args.serve_only:
        print(BASE,flush=True)
        while True:time.sleep(1)
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True,channel=args.channel,args=['--disable-component-update','--disable-background-networking']);report['browserVersion']=browser.version
        run_case(browser,'respublika_bashkortostan','hard',expanded=True)
        if not args.quick:
            for difficulty in ['easy','normal']:run_case(browser,'respublika_bashkortostan',difficulty)
            for difficulty in ['hard','easy']:run_case(browser,'respublika_bashkortostan',difficulty,legacy=True)
            for difficulty in ['easy','normal','hard']:run_case(browser,'altayskiy_kray',difficulty)
        browser.close()
finally:
    server.shutdown();report['hashesAfter']=hashes();report['sourceStable']=report['hashesBefore']==report['hashesAfter'];report['finishedAt']=datetime.now(timezone.utc).isoformat();report['scriptSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    report['scriptStable']=report['scriptSha256Before']==report['scriptSha256']
    report['sourceIdentityAfter']=source_identity()
    report['manifestStable']=report['sourceIdentityBefore']==report['sourceIdentityAfter']
    report['status']='pass' if report['sourceStable'] and report['scriptStable'] and report['manifestStable'] and report['cases'] and all(c['status']=='pass' for c in report['cases']) else 'fail'
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':report['status'],'report':str(OUT/'report.json'),'sourceStable':report['sourceStable']},ensure_ascii=False),flush=True)
raise SystemExit(0 if report['status']=='pass' else 1)
