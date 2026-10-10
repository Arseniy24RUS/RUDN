"""Independent native route-limits QA, real geography, memory-only host callbacks.

Browser MCP navigation was attempted first and failed: configured Chrome absent.
Uses installed Edge + bundled Playwright over regular localhost, no cloud writes.
Original browser tests and fixtures remain unchanged. Fixture replay is generated
with the actual pre-change Git engine blob; UI purchases use visible controls.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from datetime import datetime, timezone
from urllib.parse import urlparse, urljoin
import argparse, hashlib, json, platform, re, subprocess, time, traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RUNTIME=ROOT/'site/apps/settlements/runtime'
REGION='respublika_adygeya'
OLD='0d2a786d1a71ce52bf6902fff658f9b24836c555'
parser=argparse.ArgumentParser();parser.add_argument('--channel',default='msedge');parser.add_argument('--serve-only',action='store_true');args=parser.parse_args()
OUT=ROOT/'artifacts/route-limits-20261010'/datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S');OUT.mkdir(parents=True,exist_ok=True)
OLD_ENGINE=subprocess.check_output(['git','show',OLD+':site/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs'],cwd=ROOT).decode()
FROZEN=re.sub(r"from '(\.\.?/[^']+)'",lambda m:"from '"+urljoin('/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs',m[1])+"'",OLD_ENGINE)
def identity():
    paths=sorted([p for folder in ['assets/js','assets/css'] for p in (RUNTIME/folder).rglob('*') if p.is_file()])
    manifest=ROOT/'site/apps/settlements/source-manifest.json'
    return {'files':{str(p.relative_to(RUNTIME)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'manifestSha':hashlib.sha256(manifest.read_bytes()).hexdigest(),'sourceHash':json.loads(manifest.read_bytes())['sourceHash']}
HTML=r'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native Settlements route limits QA</title>
<style>html,body{margin:0;overflow:hidden;font:12px sans-serif}#qa-controls{height:32px;display:flex;gap:4px;align-items:center;background:#fff}#qa-controls button,#qa-controls select{height:28px;font-size:11px}#mount{height:calc(100dvh - 32px);width:100vw}</style>
<nav id="qa-controls" aria-label="Memory-only QA host"><span>QA</span><select id="locale"><option>ru</option><option>en</option><option>zh</option></select><button id="restore">Restore</button><button id="destroy">Destroy</button></nav><main id="mount"></main>
<script type="module">
import {mountSettlementsGame} from '/apps/settlements/runtime/assets/js/settlements/v24/game.mjs';
import {World,haversine} from '/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {loadRegion,DATA,json} from '/apps/settlements/runtime/assets/js/settlements/v2/data.mjs';
import {loadDistanceTransportPolicy} from '/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {loadSocialPlan} from '/apps/settlements/runtime/assets/js/settlements/v24/social-plans.mjs';
import {createRegionalScenario} from '/apps/settlements/runtime/assets/js/settlements/v24/scenarios.mjs';
import {withPlayableRegionScope,playableRows} from '/apps/settlements/runtime/assets/js/settlements/v24/region-playability.mjs';
import * as current from '/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
import * as old from '/qa-frozen-engine.mjs';
const query=new URLSearchParams(location.search),shadow=document.querySelector('#mount').attachShadow({mode:'open'}),kind=query.get('case')||'limits';
const qa=window.qa={ready:false,generation:0,checkpoints:[],completions:[],retired:[],region:kind==='intro'?'chelyabinskaya_oblast':'respublika_adygeya',difficulty:'hard',locale:'ru',kind};
async function fixtures(){
 const [{pack,network},boundary]=await Promise.all([loadRegion(qa.region,{includeMissions:false}),json(new URL(`boundaries/${qa.region}.geojson`,DATA))]);
 const world=new World(pack,network);await loadDistanceTransportPolicy(world);await loadSocialPlan(world,{difficulty:qa.difficulty});
 const scenario=withPlayableRegionScope(world,createRegionalScenario(world,boundary,{mode:'free',version:5,difficulty:qa.difficulty}));
 const state=current.createState(world,scenario),rows=playableRows(world,scenario).filter(r=>r.population>0),ids=new Set(rows.map(r=>r.id));
 const adjacency=new Map(rows.map(r=>[r.id,[]]));
 for(const [a,b,m,kind] of network.edges)if(kind===1){const x=network.nodes[a][0],y=network.nodes[b][0];if(ids.has(x)&&ids.has(y))adjacency.get(x).push([m,y]);}
 let best=null;
 for(const row of rows){let stops=[row.id],minutes=0;while(stops.length<6){const choices=adjacency.get(stops.at(-1)).filter(e=>!stops.includes(e[1])).sort((a,b)=>a[0]-b[0]||a[1].localeCompare(b[1]));if(!choices.length)break;minutes+=choices[0][0];stops.push(choices[0][1]);}
   if(stops.length===6&&(!best||minutes<best.minutes)&&current.preview(world,scenario,state,{type:'connect',stopIds:stops.slice(0,5)}).ok&&old.preview(world,scenario,state,{type:'connect',stopIds:stops}).ok)best={stops,minutes};}
 if(!best)throw new Error('No real local chain fixture');
 let far=null;const first=best.stops.slice(0,2),origin=world.row(first[1]);
 for(const row of [...rows].sort((a,b)=>haversine(origin,b)-haversine(origin,a))){if(first.includes(row.id))continue;const action={type:'connect',stopIds:[...first,row.id]},q=current.preview(world,scenario,state,action),previous=old.preview(world,scenario,state,action);if(previous.ok&&!q.ok&&q.error.includes('100')){far={id:row.id,error:q.error,action,oldCost:previous.cost};break;}}
 if(!far)throw new Error('No real overlength fixture');
 const legacyState=old.apply(world,scenario,state,{type:'connect',stopIds:best.stops}),legacySave=old.exportSave(legacyState);
 qa.fixture={kind:'real regional rows; frozen pre-change engine replay, no edited state or student record',stops:best.stops,rows:Object.fromEntries(rows.map(r=>[r.id,{id:r.id,name:r.name,lat:r.lat,lon:r.lon}])),far,legacyState,legacySave};
 return kind==='legacy'?legacySave:null;
}
async function mount(initialSave=null){
 qa.ready=false;if(qa.game){await qa.game.flush();const old=qa.game;old.destroy();qa.retired.push({state:old.inspect().state,ready:old.inspect().ready,canvases:shadow.querySelectorAll('canvas').length});qa.game=null;}
 shadow.innerHTML='<link rel="stylesheet" href="/apps/settlements/runtime/assets/css/settlements-v24.css"><div id="game" style="height:100%"></div>';
 qa.generation++;qa.game=await mountSettlementsGame(shadow.querySelector('#game'),{locale:qa.locale,regionId:qa.region,mode:kind==='intro'?'intro':'free',difficulty:qa.difficulty,owner:'guest:native-route-limits-qa',initialSave,
 onCheckpoint:async payload=>qa.checkpoints.push({generation:qa.generation,...structuredClone(payload)}),onComplete:async payload=>qa.completions.push({generation:qa.generation,...structuredClone(payload)})});
 await qa.game.flush();qa.ready=qa.game.inspect().ready;
}
document.querySelector('#locale').onchange=e=>{qa.locale=e.target.value;qa.game.setLocale(qa.locale)};
document.querySelector('#restore').onclick=async()=>{const save=qa.game.snapshot().save;await mount(structuredClone(save))};
document.querySelector('#destroy').onclick=async()=>{await qa.game.flush();const old=qa.game;old.destroy();qa.retired.push({state:old.inspect().state,ready:old.inspect().ready,canvases:shadow.querySelectorAll('canvas').length});qa.game=null;qa.ready=false};
try{await mount(kind==='intro'?null:await fixtures())}catch(e){qa.error={message:e.message,stack:e.stack};throw e;}
</script>'''
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path.startswith('/route-limits-qa.html'):b=HTML.encode();kind='text/html; charset=utf-8'
        elif self.path=='/qa-frozen-engine.mjs':b=FROZEN.encode();kind='text/javascript; charset=utf-8'
        elif self.path=='/favicon.ico':self.send_response(204);self.end_headers();return
        else:super().do_GET();return
        self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
class Server(ThreadingHTTPServer):request_queue_size=128
server=Server(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'site')));Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}/route-limits-qa.html'
report={'kind':'informed native UI QA; real source data; memory-only host; not cloud or physical phone proof','flow':'5 local stops accepted → sixth rejected → one confirm/restore/undo; over-100km route disabled; RU/EN/ZH, 5 sizes; old unmarked replay; tutorial','fallback':'Browser MCP browser_navigate failed: Chrome missing at C:\\Users\\arsen\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe; AGENTS-authorized Playwright/Edge localhost fallback; no install','environment':platform.platform(),'url':BASE,'startedAt':datetime.now(timezone.utc).isoformat(),'before':identity(),'scriptShaBefore':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'frozenEngine':{'commit':OLD,'sha256':hashlib.sha256(OLD_ENGINE.encode()).hexdigest()},'cases':[]}
def tap(p,s):p.locator(s).tap()
def inspect(p):return p.evaluate('qa.game.inspect()')
def state(p):return inspect(p)['state']
def signature(s):return {k:s[k] for k in ['actions','revision','budget','spent','towers','facilities','routes']}
def save(p):return p.evaluate('(()=>{const{ui,...s}=qa.game.snapshot().save;return s})()')
def count(p):return p.evaluate('qa.checkpoints.length')
def flush(p):p.evaluate('qa.game.flush()')
def settle(p):p.wait_for_timeout(120);p.wait_for_function('!qa.game.sceneEvidence().camera.moving',timeout=10000)
def shot(p,label):
    f=OUT/(label+'.png');p.screenshot(path=str(f));return str(f.relative_to(ROOT))
def ready(p):
    p.wait_for_function('qa?.ready||qa?.error',timeout=180000);assert not p.evaluate('qa.error||null'),p.evaluate('qa.error')
def controls(p):
    assert p.evaluate('document.documentElement.scrollWidth<=innerWidth'),'horizontal overflow'
    assert p.locator('.puzzle-header').is_visible() and not p.locator('.puzzle-loading').is_visible()
    for selector in ['[data-act="confirm"]','[data-act="cancel"]','[data-act="route-remove-last"]']:
        # The route list uses an intentional scroll body with a fixed purchase
        # row. Verify the remove control is reachable through that scroll, not
        # permanently occluded; purchase/cancel must fit without scrolling.
        if selector=='[data-act="route-remove-last"]':p.locator(selector).scroll_into_view_if_needed()
        b=p.locator(selector);r=b.bounding_box();assert b.is_visible() and r and r['x']>=-.5 and r['y']>=31.5 and r['x']+r['width']<=p.viewport_size['width']+.5 and r['y']+r['height']<=p.viewport_size['height']+.5,(selector,r,p.viewport_size)
        assert b.evaluate('e=>{const r=e.getBoundingClientRect(),n=e.getRootNode().elementFromPoint(r.x+r.width/2,r.y+r.height/2);return n===e||e.contains(n)}'),(selector,'clipped')
    p.locator('[data-act="cancel"]').scroll_into_view_if_needed()
def render(p,row,label):
    settle(p);controls(p)
    if label.startswith('overlength'):
        error=p.locator('.preview-result.error');assert error.is_visible()
        assert error.evaluate('e=>{const r=e.getBoundingClientRect(),root=e.getRootNode(),n=root.elementFromPoint(r.x+Math.min(30,r.width/2),r.y+9),stops=root.querySelector(".route-stops");return (n===e||e.contains(n))&&r.top<stops.getBoundingClientRect().top}'),'overlength reason is below fold or below stop list'
    row['renders'].append({'label':label,'viewport':p.viewport_size,'screenshot':shot(p,label),'preview':inspect(p)['preview']})
def choose(p,item):
    tap(p,'.puzzle-camera [data-act="search"]');p.locator('#settlement-search').fill(item['name']);tap(p,f'[data-search-result][data-select="{item["id"]}"]');settle(p)
def tool(p,name):tap(p,'.puzzle-build [data-act="tools"]');tap(p,f'[data-tool="{name}"]')
def unchanged(p,baseline,checkpoint):assert signature(state(p))==signature(baseline),'draft mutated state';assert count(p)==checkpoint,'draft checkpointed'
def restore(p):
    generation=p.evaluate('qa.generation');tap(p,'#restore');p.wait_for_function('(g)=>qa.ready&&qa.generation>g',arg=generation,timeout=180000)
def run_case(browser,kind):
    row={'case':kind,'status':'running','renders':[],'errors':[],'httpFailures':[],'requestFailures':[],'requests':[]}
    context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,reduced_motion='reduce',service_workers='block');p=context.new_page();p.set_default_timeout(15000)
    p.on('pageerror',lambda e:row['errors'].append(str(e)));p.on('console',lambda m:row['errors'].append(m.text) if m.type=='error' else None)
    p.on('request',lambda r:row['requests'].append(urlparse(r.url).path));p.on('requestfailed',lambda r:row['requestFailures'].append(str(r.failure)))
    p.on('response',lambda r:row['httpFailures'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    try:
        started=time.perf_counter();p.goto(BASE+'?case='+kind);ready(p);row['mountMs']=round((time.perf_counter()-started)*1000,1)
        assert p.title()=='Native Settlements route limits QA';baseline=state(p);checkpoint=count(p)
        if kind=='intro':
            assert inspect(p)['tutorial']['locked'];tap(p,'[data-act="guide-position"]');tap(p,'[data-act="confirm"]');flush(p)
            source=json.loads((RUNTIME/'data/settlements/v1/regions/chelyabinskaya_oblast.json').read_text('utf-8'));rows={r['id']:r for r in source['settlements']}
            inst=inspect(p)['tutorial'];tool(p,'medical');choose(p,rows[inst['settlementId']]);tap(p,'[data-act="confirm"]');flush(p)
            inst=inspect(p)['tutorial'];tool(p,'connect');choose(p,rows[inst['from']]);choose(p,rows[inst['to']]);q=inspect(p)['preview'];assert q['ok'] and not q['action'].get('stopIds'),q
            row['preview']=shot(p,'tutorial-two-stop-preview');before=count(p);tap(p,'[data-act="confirm"]');flush(p);s=state(p)
            assert len(s['actions'])==3 and s['actions'][-1]['type']=='connect' and count(p)==before+1
            row['checks']={'guidedFirstThreeActions':True,'oneTransportCallback':True,'actions':s['actions']}
        else:
            fixture=p.evaluate('qa.fixture');stops=fixture['stops'];rows=fixture['rows'];row['fixture']={k:fixture[k] for k in ['stops','far']}
            if kind=='legacy':
                assert signature(baseline)==signature(fixture['legacyState']),'frozen legacy state changed'
                assert save(p)==fixture['legacySave'],'legacy save export changed'
                assert len(baseline['actions'][0]['stopIds'])==6 and 'routePolicyVersion' not in baseline['actions'][0]
                before_save=save(p);restore(p);assert save(p)==before_save
                tool(p,'tower');choose(p,rows[stops[0]]);assert inspect(p)['preview']['ok'];before=count(p);tap(p,'[data-act="confirm"]');flush(p)
                assert state(p)['actions'][:-1]==baseline['actions'] and state(p)['actions'][-1]['type']=='tower' and count(p)==before+1
                tap(p,'[data-act="undo"]');flush(p);assert signature(state(p))==signature(baseline)
                row['checks']={'sixStopUnmarkedLegacyStateExact':True,'legacyExportExact':True,'reloadExact':True,'legalContinuationAndUndo':True};row['screenshot']=shot(p,'legacy-six-stop-restored')
            else:
                tool(p,'connect')
                for id in stops[:5]:choose(p,rows[id])
                q=inspect(p)['preview'];assert q['ok'] and q['action']['stopIds']==stops[:5],q;unchanged(p,baseline,checkpoint)
                choose(p,rows[stops[5]]);after_six=inspect(p)['preview'];assert after_six==q,'sixth altered valid preview';assert p.locator('.route-stops li').all_text_contents()==[rows[id]['name'] for id in stops[:5]];unchanged(p,baseline,checkpoint)
                row['sixthRejectedText']=p.locator('.puzzle-message').inner_text();assert '5' in row['sixthRejectedText']
                for locale in ['ru','en','zh']:
                    p.locator('#locale').select_option(locale);assert inspect(p)['preview']['action']['stopIds']==stops[:5];unchanged(p,baseline,checkpoint);render(p,row,'five-stop-'+locale)
                p.locator('#locale').select_option('ru');expected=q['cost'];before=count(p);tap(p,'[data-act="confirm"]');flush(p);played=state(p);wire=save(p)
                assert len(played['actions'])==1 and played['revision']==baseline['revision']+1 and count(p)==before+1
                assert played['actions'][0]['stopIds']==stops[:5] and played['actions'][0].get('routePolicyVersion')=='local-route-v1'
                assert wire['rulesVersion']=='settlements-3.4.3',wire['rulesVersion']
                assert abs(baseline['budget']-played['budget']-expected)<1e-8;restore(p);assert save(p)==wire and signature(state(p))==signature(played)
                before=count(p);tap(p,'[data-act="undo"]');flush(p);assert signature(state(p))==signature(baseline) and count(p)==before+1
                checkpoint=count(p);tool(p,'connect')
                for id in stops[:2]:choose(p,rows[id])
                short=inspect(p)['preview'];assert short['ok'],short
                choose(p,rows[fixture['far']['id']]);long=inspect(p)['preview'];assert not long['ok'] and '100' in long['error'] and p.locator('[data-act="confirm"]').is_disabled(),long;unchanged(p,baseline,checkpoint)
                row['errorTexts']={}
                for locale in ['ru','en','zh']:
                    p.locator('#locale').select_option(locale);assert inspect(p)['preview']['action']==long['action'];unchanged(p,baseline,checkpoint)
                    text=p.locator('.preview-body').inner_text();row['errorTexts'][locale]=text;assert '100' in text
                    if locale!='ru':assert 'Длина маршрута' not in text and 'Соедините более близкие' not in text
                    for width,height in [(320,568),(390,844),(430,932),(844,390),(1365,900)]:p.set_viewport_size({'width':width,'height':height});render(p,row,f'overlength-{locale}-{width}x{height}')
                p.set_viewport_size({'width':390,'height':844});p.locator('#locale').select_option('ru');tap(p,'[data-act="route-remove-last"]');assert inspect(p)['preview']['ok'] and inspect(p)['preview']['action']['stopIds']==stops[:2];unchanged(p,baseline,checkpoint)
                tap(p,'[data-act="cancel"]');unchanged(p,baseline,checkpoint)
                row['checks']={'fiveStopsAcceptedSixthRetainsFive':True,'draftNoChargeNoCallback':True,'oneConfirmOneActionOneCheckpoint':True,'spent':expected,'restoreExact':True,'undoExactOneCheckpoint':True,'over100Disabled':True,'removeLastReenables':True,'localesPreserveDraft':True,'wire':wire['rulesVersion']}
        tap(p,'#destroy');p.wait_for_function('qa.game===null');row['cleanup']=p.evaluate('qa.retired');assert all(r=={'state':None,'ready':False,'canvases':0} for r in row['cleanup'])
        assert not row['errors'] and not row['httpFailures'] and not row['requestFailures'],(row['errors'],row['httpFailures'],row['requestFailures'])
        region='chelyabinskaya_oblast' if kind=='intro' else REGION
        for path in row['requests']:
            if any(x in path for x in ['/regions/','/transport/','/boundaries/','/roads/','/social-plans-regions/','/transport-policy-v2-regions/']):assert region in path or path.endswith('/index.mjs'),path
        row['status']='pass'
    except Exception as e:
        row['status']='fail';row['failure']=str(e);row['traceback']=traceback.format_exc()
        try:row['screenshot']=shot(p,kind+'-failure');row['inspect']=inspect(p)
        except Exception:pass
    finally:
        row['requests']=sorted(set(row['requests']));report['cases'].append(row);context.close();(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'case':kind,'status':row['status'],'failure':row.get('failure'),'mountMs':row.get('mountMs')},ensure_ascii=True),flush=True)
try:
    if args.serve_only:
        print(BASE,flush=True)
        while True:time.sleep(1)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,channel=args.channel,args=['--disable-component-update','--disable-background-networking']);report['browserVersion']=browser.version
        for kind in ['limits','legacy','intro']:run_case(browser,kind)
        browser.close()
finally:
    server.shutdown();report['after']=identity();report['sourceStable']=report['before']==report['after'];report['scriptSha']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();report['scriptStable']=report['scriptShaBefore']==report['scriptSha'];report['finishedAt']=datetime.now(timezone.utc).isoformat();report['status']='pass' if report['sourceStable'] and report['scriptStable'] and len(report['cases'])==3 and all(c['status']=='pass' for c in report['cases']) else 'fail'
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'status':report['status'],'report':str(OUT/'report.json'),'sourceStable':report['sourceStable']},ensure_ascii=True),flush=True)
raise SystemExit(0 if report['status']=='pass' else 1)
