"""Native boundary regression: real module, engine, source rows, memory-only host.

Browser tool attempted first on 2026-10-10: configured Chrome missing. Project
AGENTS permits installed Playwright/Edge against ordinary localhost; no install.
Synthetic replay fixtures are generated with the real unscoped scenario/engine.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from datetime import datetime, timezone
from urllib.parse import urlparse
import argparse, hashlib, json, platform, time, traceback
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'site/apps/settlements/runtime'
parser = argparse.ArgumentParser()
parser.add_argument('--channel', default='msedge')
parser.add_argument('--serve-only', action='store_true')
args = parser.parse_args()
OUT = ROOT/'artifacts/boundaries-20261010/browser'/datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
OUT.mkdir(parents=True, exist_ok=True)
REGION = 'khanty_mansiyskiy_avtonomnyy_okrug_yugra'
OUTSIDE = REGION+':5801'

def hashes():
    result={}
    for folder in ['assets/js','assets/css']:
        for file in (RUNTIME/folder).rglob('*'):
            if file.is_file():result[str(file.relative_to(RUNTIME)).replace('\\','/')]=hashlib.sha256(file.read_bytes()).hexdigest()
    return result

def source_identity():
    path=ROOT/'site/apps/settlements/source-manifest.json'; raw=path.read_bytes();m=json.loads(raw)
    return {'sourceHash':m['sourceHash'],'manifestSha256':hashlib.sha256(raw).hexdigest()}

HTML = r'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native Settlements boundary QA</title>
<style>html,body{margin:0;overflow:hidden;font:12px sans-serif}#qa-controls{height:32px;display:flex;gap:4px;align-items:center;background:#fff}#qa-controls button,#qa-controls select{height:28px;font-size:11px}#mount{height:calc(100dvh - 32px);width:100vw}</style>
<nav id="qa-controls" aria-label="Explicit memory-only QA host"><span>QA</span><select id="locale"><option>ru</option><option>en</option><option>zh</option></select><button id="restore">Restore</button><button id="destroy">Destroy</button></nav><main id="mount"></main>
<script type="module">
import {mountSettlementsGame} from '/apps/settlements/runtime/assets/js/settlements/v24/game.mjs';
import {World} from '/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {loadRegion,DATA,json} from '/apps/settlements/runtime/assets/js/settlements/v2/data.mjs';
import {loadDistanceTransportPolicy} from '/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {loadSocialPlan} from '/apps/settlements/runtime/assets/js/settlements/v24/social-plans.mjs';
import {createRegionalScenario} from '/apps/settlements/runtime/assets/js/settlements/v24/scenarios.mjs';
import {createState,exportSave,apply,restore,evaluate,pointInBoundary} from '/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
const query=new URLSearchParams(location.search),shadow=document.querySelector('#mount').attachShadow({mode:'open'});
const qa=window.qa={ready:false,generation:0,checkpoints:[],completions:[],retired:[],region:'khanty_mansiyskiy_avtonomnyy_okrug_yugra',difficulty:'hard',locale:'ru',fixtureKind:query.get('fixture')||'new',readOnly:query.get('readonly')==='1'};
async function fixture(){
 const [{pack,network},boundary]=await Promise.all([loadRegion(qa.region,{includeMissions:false}),json(new URL(`boundaries/${qa.region}.geojson`,DATA))]);
 const world=new World(pack,network);await loadDistanceTransportPolicy(world);const plan=await loadSocialPlan(world,{difficulty:qa.difficulty});
 const scenario=createRegionalScenario(world,boundary,{mode:'free',version:5,difficulty:qa.difficulty});
 let state=createState(world,scenario);const outside=world.row(qa.region+':5801');
 if(qa.fixtureKind==='nearly-complete'){
   // Remove the genuinely outside source tower and preserve all build-upgrade
   // identities by remapping action-derived facility IDs after this omission.
   const facilityIds=new Map(),legacyActions=[];
   for(const [index,source] of plan.referenceActions.entries()){
     if(source.type==='tower'&&source.lat===outside.lat&&source.lon===outside.lon)continue;
     const action=structuredClone(source);
     if(action.type==='upgrade')action.facilityId=facilityIds.get(action.facilityId)||action.facilityId;
     if(action.type==='build')facilityIds.set(`facility:${index+1}`,`facility:${legacyActions.length+1}`);
     legacyActions.push(action);
   }
   // These frozen reference actions include historical unmarked outreach.
   // Use the same public replay API as old saves; new actions still use apply.
   state=restore(world,scenario,{...exportSave(state),actions:legacyActions});
   // The old reference predates spaced initial towers. Restore only missing
   // in-polygon telecom coverage with legal source-coordinate tower actions.
   for(const id of evaluate(world,scenario,state).services.telecom.missingIds){
     const row=world.row(id);if(id===outside.id||!pointInBoundary(boundary,row.lat,row.lon))continue;
     if(evaluate(world,scenario,state).byId[id].telecom.full)continue;
     state=apply(world,scenario,state,{type:'tower',lat:row.lat,lon:row.lon});
   }
 }
 const evaluation=evaluate(world,scenario,state),save=exportSave(state);
 qa.fixture={kind:'synthetic unscoped actual engine replay, no cloud/student data',save:structuredClone(save),state:structuredClone(state),evaluation:structuredClone(evaluation),outside,sourceCount:world.rows.length,insideCount:world.rows.filter(r=>pointInBoundary(boundary,r.lat,r.lon)).length};
 if(qa.readOnly)save.ui={terminalReason:'complete'};
 return save;
}
async function mount(initialSave=null){
 qa.ready=false;if(qa.game){await qa.game.flush();const old=qa.game;old.destroy();qa.retired.push({state:old.inspect().state,ready:old.inspect().ready,canvases:shadow.querySelectorAll('canvas').length});qa.game=null;}
 shadow.innerHTML='<link rel="stylesheet" href="/apps/settlements/runtime/assets/css/settlements-v24.css"><div id="game" style="height:100%"></div>';
 qa.generation++;qa.game=await mountSettlementsGame(shadow.querySelector('#game'),{locale:qa.locale,regionId:qa.region,mode:'free',difficulty:qa.difficulty,owner:'guest:native-boundary-qa',readOnly:qa.readOnly,initialSave,
 onCheckpoint:async payload=>qa.checkpoints.push({generation:qa.generation,...structuredClone(payload)}),onComplete:async payload=>qa.completions.push({generation:qa.generation,...structuredClone(payload)})});
 await qa.game.flush();qa.ready=qa.game.inspect().ready;
}
document.querySelector('#locale').onchange=e=>{qa.locale=e.target.value;qa.game.setLocale(qa.locale)};
document.querySelector('#restore').onclick=async()=>{const save=qa.game.snapshot().save;await mount(structuredClone(save))};
document.querySelector('#destroy').onclick=async()=>{await qa.game.flush();const old=qa.game;old.destroy();qa.retired.push({state:old.inspect().state,ready:old.inspect().ready,canvases:shadow.querySelectorAll('canvas').length});qa.ready=false;qa.game=null};
try{await mount(qa.fixtureKind==='new'?null:await fixture())}catch(error){qa.error={message:error.message,stack:error.stack};throw error;}
</script>'''

class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path.startswith('/boundary-qa.html'):
            data=HTML.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        elif self.path=='/favicon.ico':self.send_response(204);self.end_headers()
        else:super().do_GET()
class Server(ThreadingHTTPServer):request_queue_size=128
server=Server(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'site')))
Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}/boundary-qa.html'
report={'kind':'informed native UI QA, real regional data/engine and memory-only host','flow':'HMAO new/legacy → outside settlement absent from search/map/goals → real build/restore/undo → nearly-complete old replay automatically completes once; read-only sends nothing','fallback':'Browser tool failed: Chrome missing at C:\\Users\\arsen\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe. Installed Playwright/Edge localhost fallback explicitly allowed by AGENTS.md.','environment':platform.platform(),'url':BASE,'startedAt':datetime.now(timezone.utc).isoformat(),'hashesBefore':hashes(),'sourceIdentityBefore':source_identity(),'scriptSha256Before':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'cases':[]}

def tap(page,selector):page.locator(selector).tap()
def ready(page):
    page.wait_for_function('window.qa?.ready===true || window.qa?.error',timeout=240000)
    assert not page.evaluate('qa.error||null'),page.evaluate('qa.error')
def state(page):return page.evaluate('qa.game.inspect().state')
def snapshot(page):return page.evaluate('qa.game.snapshot()')
def engine_save(page):return page.evaluate('(()=>{const {ui,...save}=qa.game.snapshot().save;return save})()')
def settle(page):page.wait_for_timeout(220);page.wait_for_function('!qa.game.sceneEvidence().camera.moving',timeout=10000)
def screenshot(page,label):
    file=OUT/(label+'.png');page.screenshot(path=str(file));return str(file.relative_to(ROOT))
def verify_scope(page):
    evidence=page.evaluate('qa.game.sceneEvidence()');evaluation=page.evaluate('qa.game.inspect().evaluation')
    assert evidence['region']['rowCount']==196,evidence['region']
    assert evidence['region']['indexCount']==195,evidence['region']
    assert not any(r.get('id')==OUTSIDE for r in evidence['points']),evidence['points']
    assert OUTSIDE not in evidence['focusIds']
    for service,values in evaluation['services'].items():assert OUTSIDE not in values['missingIds'],(service,values)
    return {'region':evidence['region'],'serviceTotals':{k:v['total'] for k,v in evaluation['services'].items()},'focusIds':evidence['focusIds'],'complete':evaluation['complete']}
def search_outside(page,label):
    tap(page,'.puzzle-camera [data-act="search"]');page.locator('#settlement-search').fill('Соснина')
    assert page.locator('[data-search-result]').count()==0,'outside settlement remains searchable'
    shot=screenshot(page,label+'-outside-no-results');page.locator('dialog [data-act="close"]').tap();return shot
def render_check(page,label):
    settle(page);assert page.locator('.puzzle-header').is_visible() and not page.locator('.puzzle-loading').is_visible()
    assert page.locator('.sg24-map-scene').count()==1 and page.locator('.sg24-map-effects').count()==1
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'horizontal overflow'
    return {'viewport':page.viewport_size,'screenshot':screenshot(page,label),'scope':verify_scope(page)}
def choose_inside(page):
    tap(page,'.puzzle-camera [data-act="search"]');page.locator('#settlement-search').fill('Сургут')
    result=page.locator('[data-search-result]').first
    assert result.is_visible(),'inside settlement missing from search'
    selected=result.get_attribute('data-select');result.tap();return selected

def run_case(browser,kind,readonly=False,expanded=False):
    label=kind+('-readonly' if readonly else '')
    row={'case':label,'status':'running','errors':[],'httpFailures':[],'requestFailures':[],'requests':[],'renders':[]}
    context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,reduced_motion='reduce',service_workers='block')
    page=context.new_page();page.set_default_timeout(15000)
    page.on('pageerror',lambda e:row['errors'].append(str(e)))
    page.on('console',lambda m:row['errors'].append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:row['requests'].append(urlparse(r.url).path))
    page.on('requestfailed',lambda r:row['requestFailures'].append({'url':r.url,'error':r.failure}))
    page.on('response',lambda r:row['httpFailures'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    try:
        started=time.perf_counter();page.goto(BASE+f'?fixture={kind}&readonly={int(readonly)}');ready(page)
        row['mountMs']=round((time.perf_counter()-started)*1000,1)
        assert page.title()=='Native Settlements boundary QA'
        baseline=state(page);base_save=engine_save(page);assert base_save['rulesVersion']=='settlements-3.4.2'
        row['outsideSearchScreenshot']=search_outside(page,label)
        row['renders'].append(render_check(page,label+'-390x844-ru'))
        if expanded:
            for width,height in [(320,568),(430,932),(844,390),(1365,900)]:
                page.set_viewport_size({'width':width,'height':height});row['renders'].append(render_check(page,label+f'-{width}x{height}-ru'))
            page.set_viewport_size({'width':390,'height':844})
            for locale,expected in [('en','Telecom'),('zh','通信'),('ru','Связь')]:
                page.locator('#locale').select_option(locale);assert engine_save(page)==base_save,'locale changed replay'
                assert page.locator('[data-layer="telecom"] .layer-label').inner_text()==expected
                row['renders'].append(render_check(page,label+'-390x844-'+locale))
        selected=choose_inside(page);assert page.evaluate('qa.game.inspect().selectedId')==selected
        row['insideSelected']=selected
        if kind=='nearly-complete':
            fixture=page.evaluate('qa.fixture');old=fixture['evaluation'];current=snapshot(page)
            assert old['complete'] is False and old['services']['telecom']['missingIds']==[OUTSIDE],old['services']
            for service in ['medical','school','culture']:assert old['services'][service]['missingIds']==[],old['services'][service]
            assert current['evaluation']['complete'] is True and current['status']=='complete',current['status']
            for key in ['actions','spent','budget','facilities','routes','towers']:assert baseline[key]==fixture['state'][key],('restored state changed',key)
            assert engine_save(page)==fixture['save'],'restored replay changed'
            counts=page.evaluate('({checkpoints:qa.checkpoints.length,completions:qa.completions.length})')
            assert counts==({'checkpoints':0,'completions':0} if readonly else {'checkpoints':1,'completions':1}),counts
            if not readonly:
                completion=page.evaluate('qa.completions[0]');assert completion['reason']=='complete' and completion['save']['ui']['terminalReason']=='complete'
            for _ in range(3):page.evaluate('qa.game.flush()')
            assert page.evaluate('({checkpoints:qa.checkpoints.length,completions:qa.completions.length})')==counts,'duplicate completion without another mount'
            row['completion']={'oldMissingTelecom':old['services']['telecom']['missingIds'],'oldComplete':old['complete'],'newComplete':current['evaluation']['complete'],'calls':counts,'actions':len(baseline['actions']),'spent':baseline['spent'],'budget':baseline['budget'],'stateExact':True,'saveExact':True,'screenshot':screenshot(page,label+'-auto-complete')}
        else:
            if kind=='legacy':
                fixture=page.evaluate('qa.fixture');assert engine_save(page)==fixture['save']
                for key in ['actions','spent','budget','facilities','routes','towers']:assert baseline[key]==fixture['state'][key],key
            # Native search picks an uncovered inside point, the UI confirms one
            # paid tower; only public game inspection observes the outcome.
            missing=page.evaluate('qa.game.inspect().evaluation.services.telecom.missingIds[0]')
            rows=json.loads((RUNTIME/'data/settlements/v1/regions'/f'{REGION}.json').read_text('utf-8'))['settlements']
            item=next(r for r in rows if r['id']==missing)
            tap(page,'.puzzle-build [data-act="tools"]');tap(page,'[data-tool="tower"]');tap(page,'.puzzle-camera [data-act="search"]');page.locator('#settlement-search').fill(item['name']);tap(page,f'[data-select="{missing}"][data-search-result]')
            preview=page.evaluate('qa.game.inspect().preview');assert preview['ok'],preview
            count_before=page.evaluate('qa.checkpoints.length');tap(page,'[data-act="confirm"]');page.evaluate('qa.game.flush()');settle(page)
            played=state(page);played_save=engine_save(page)
            assert len(played['actions'])==1 and abs(played['spent']-preview['cost'])<1e-9
            assert page.evaluate('qa.checkpoints.length')==count_before+1,'not exactly one checkpoint for one confirmation'
            generation=page.evaluate('qa.generation');tap(page,'#restore');page.wait_for_function('(g)=>qa.ready&&qa.generation>g',arg=generation,timeout=180000)
            assert engine_save(page)==played_save,'restore changed replay'
            restored=state(page)
            for key in ['actions','spent','budget','facilities','routes','towers']:assert restored[key]==played[key],('restore',key)
            tap(page,'[data-act="undo"]');page.evaluate('qa.game.flush()');undone=state(page)
            for key in ['actions','spent','budget','facilities','routes','towers']:assert undone[key]==baseline[key],('undo',key)
            row['player']={'spent':played['spent'],'checkpointCountAdded':1,'restoredExactly':True,'undoExactly':True,'wire':played_save['rulesVersion'],'screenshot':screenshot(page,label+'-restored-undone')}
            verify_scope(page)
        tap(page,'#destroy');page.wait_for_function('qa.game===null');retired=page.evaluate('qa.retired')
        assert retired and all(r=={'state':None,'ready':False,'canvases':0} for r in retired),retired
        row['cleanup']=retired
        for path in set(row['requests']):
            if any(p in path for p in ['/regions/','/transport/','/boundaries/','/roads/','/basemaps/','/social-plans-regions/','/transport-policy-v2-regions/']):assert REGION in path or path.endswith('/index.mjs'),('foreign region',path)
        assert not row['errors'] and not row['httpFailures'] and not row['requestFailures'],(row['errors'],row['httpFailures'],row['requestFailures'])
        row['status']='pass'
    except Exception as error:
        row['status']='fail';row['failure']=str(error);row['traceback']=traceback.format_exc()
        try:row['failureScreenshot']=screenshot(page,label+'-failure')
        except Exception:pass
    finally:
        row['requests']=sorted(set(row['requests']));report['cases'].append(row);context.close()
        (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'case':label,'status':row['status'],'failure':row.get('failure'),'mountMs':row.get('mountMs')},ensure_ascii=True),flush=True)

try:
    if args.serve_only:
        print(BASE,flush=True)
        while True:time.sleep(1)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,channel=args.channel,args=['--disable-component-update','--disable-background-networking']);report['browserVersion']=browser.version
        run_case(browser,'new',expanded=True)
        run_case(browser,'legacy')
        run_case(browser,'nearly-complete')
        run_case(browser,'nearly-complete',readonly=True)
        browser.close()
finally:
    server.shutdown();report['hashesAfter']=hashes();report['sourceStable']=report['hashesBefore']==report['hashesAfter'];report['finishedAt']=datetime.now(timezone.utc).isoformat()
    report['scriptSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();report['scriptStable']=report['scriptSha256']==report['scriptSha256Before']
    report['sourceIdentityAfter']=source_identity();report['manifestStable']=report['sourceIdentityBefore']==report['sourceIdentityAfter']
    report['status']='pass' if report['sourceStable'] and report['scriptStable'] and report['manifestStable'] and len(report['cases'])==4 and all(r['status']=='pass' for r in report['cases']) else 'fail'
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':report['status'],'report':str(OUT/'report.json'),'sourceStable':report['sourceStable']},ensure_ascii=False),flush=True)
raise SystemExit(0 if report['status']=='pass' else 1)
