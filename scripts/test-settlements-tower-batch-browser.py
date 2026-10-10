"""Informed native tower-batch QA. Real runtime/rows; memory-only synthetic host.

Browser MCP attempted first; configured Chrome missing. AGENTS permits ordinary
Playwright with installed Edge. No dependency install, cloud calls or grades.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from datetime import datetime, timezone
from urllib.parse import urlparse
import argparse, hashlib, json, platform, time, traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
RUNTIME=ROOT/'site/apps/settlements/runtime'
REGION='khanty_mansiyskiy_avtonomnyy_okrug_yugra'
parser=argparse.ArgumentParser();parser.add_argument('--channel',default='msedge');parser.add_argument('--serve-only',action='store_true');args=parser.parse_args()
OUT=ROOT/'artifacts/tower-batch-20261010'/datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S');OUT.mkdir(parents=True,exist_ok=True)
def identity():
    paths=sorted([p for folder in ['assets/js','assets/css'] for p in (RUNTIME/folder).rglob('*') if p.is_file()])
    return {'files':{str(p.relative_to(RUNTIME)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'manifestSha':hashlib.sha256((ROOT/'site/apps/settlements/source-manifest.json').read_bytes()).hexdigest(),'sourceHash':json.loads((ROOT/'site/apps/settlements/source-manifest.json').read_bytes())['sourceHash']}
HTML=r'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native Settlements tower batch QA</title>
<style>html,body{margin:0;overflow:hidden;font:12px sans-serif}#qa-controls{height:32px;display:flex;gap:4px;align-items:center;background:#fff}#qa-controls button,#qa-controls select{height:28px;font-size:11px}#mount{height:calc(100dvh - 32px);width:100vw}</style>
<nav id="qa-controls" aria-label="Memory-only QA host"><span>QA</span><select id="locale"><option>ru</option><option>en</option><option>zh</option></select><button id="restore">Restore</button><button id="destroy">Destroy</button></nav><main id="mount"></main>
<script type="module">
import {mountSettlementsGame} from '/apps/settlements/runtime/assets/js/settlements/v24/game.mjs';
import {World} from '/apps/settlements/runtime/assets/js/settlements/v2/engine.mjs';
import {loadRegion,DATA,json} from '/apps/settlements/runtime/assets/js/settlements/v2/data.mjs';
import {loadDistanceTransportPolicy} from '/apps/settlements/runtime/assets/js/settlements/v24/transport-policy-v2.mjs';
import {loadSocialPlan} from '/apps/settlements/runtime/assets/js/settlements/v24/social-plans.mjs';
import {createRegionalScenario} from '/apps/settlements/runtime/assets/js/settlements/v24/scenarios.mjs';
import {withPlayableRegionScope,playableRows} from '/apps/settlements/runtime/assets/js/settlements/v24/region-playability.mjs';
import {createState,exportSave,apply,preview} from '/apps/settlements/runtime/assets/js/settlements/v24/engine.mjs';
const query=new URLSearchParams(location.search),shadow=document.querySelector('#mount').attachShadow({mode:'open'}),kind=query.get('case')||'batch';
const qa=window.qa={ready:false,generation:0,checkpoints:[],completions:[],retired:[],region:kind==='intro'?'chelyabinskaya_oblast':'khanty_mansiyskiy_avtonomnyy_okrug_yugra',difficulty:'hard',locale:'ru',kind};
async function lowBudgetFixture(){
 const [{pack,network},boundary]=await Promise.all([loadRegion(qa.region,{includeMissions:false}),json(new URL(`boundaries/${qa.region}.geojson`,DATA))]);
 const world=new World(pack,network);await loadDistanceTransportPolicy(world);await loadSocialPlan(world,{difficulty:qa.difficulty});
 const scenario=withPlayableRegionScope(world,createRegionalScenario(world,boundary,{mode:'free',version:5,difficulty:qa.difficulty}));
 let state=createState(world,scenario);const rows=playableRows(world,scenario).filter(r=>r.population>0);
 // Reach 0.4 million through valid paid engine actions, never editing budget.
 for(const service of ['school','medical','culture'])for(const row of rows){
   const q=preview(world,scenario,state,{type:'build',service,settlementId:row.id});
   if(q.ok&&q.cost<=state.budget-.4+1e-9)state=apply(world,scenario,state,q.action);
 }
 let index=0;while(state.budget>.4+1e-9){const row=rows[index++%rows.length];state=apply(world,scenario,state,{type:'tower',lat:row.lat,lon:row.lon});if(index>500)throw new Error('Synthetic budget preparation exceeded limit');}
 if(Math.abs(state.budget-.4)>1e-8)throw new Error('Synthetic fixture budget was not 0.4');
 qa.fixture={kind:'synthetic legal paid replay, no student record and no budget mutation',actions:state.actions.length,budget:state.budget,spent:state.spent};return exportSave(state);
}
async function mount(initialSave=null){
 qa.ready=false;if(qa.game){await qa.game.flush();const old=qa.game;old.destroy();qa.retired.push({state:old.inspect().state,ready:old.inspect().ready,canvases:shadow.querySelectorAll('canvas').length});qa.game=null;}
 shadow.innerHTML='<link rel="stylesheet" href="/apps/settlements/runtime/assets/css/settlements-v24.css"><div id="game" style="height:100%"></div>';
 qa.generation++;qa.game=await mountSettlementsGame(shadow.querySelector('#game'),{locale:qa.locale,regionId:qa.region,mode:kind==='intro'?'intro':'free',difficulty:qa.difficulty,owner:'guest:native-tower-batch-qa',initialSave,
 onCheckpoint:async payload=>qa.checkpoints.push({generation:qa.generation,...structuredClone(payload)}),onComplete:async payload=>qa.completions.push({generation:qa.generation,...structuredClone(payload)})});
 await qa.game.flush();qa.ready=qa.game.inspect().ready;
}
document.querySelector('#locale').onchange=e=>{qa.locale=e.target.value;qa.game.setLocale(qa.locale)};
document.querySelector('#restore').onclick=async()=>{const save=qa.game.snapshot().save;await mount(structuredClone(save))};
document.querySelector('#destroy').onclick=async()=>{await qa.game.flush();const old=qa.game;old.destroy();qa.retired.push({state:old.inspect().state,ready:old.inspect().ready,canvases:shadow.querySelectorAll('canvas').length});qa.game=null;qa.ready=false};
try{await mount(kind==='budget'?await lowBudgetFixture():null)}catch(e){qa.error={message:e.message,stack:e.stack};throw e;}
</script>'''
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path.startswith('/tower-batch-qa.html'):
            b=HTML.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
        elif self.path=='/favicon.ico':self.send_response(204);self.end_headers()
        else:super().do_GET()
class Server(ThreadingHTTPServer):request_queue_size=128
server=Server(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'site')));Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}/tower-batch-qa.html'
report={'kind':'informed native UI QA; real game/runtime; memory-only host; no cloud/physical phone','flow':'select 5 tower places → remove/cancel no spending → confirm 3 in one action → restore/undo; languages, 5 viewports, insufficient budget and locked tutorial','fallback':'Browser MCP browser_tabs attempted first: Chrome missing at C:\\Users\\arsen\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe; project-authorized Playwright/Edge localhost fallback, no install','environment':platform.platform(),'url':BASE,'startedAt':datetime.now(timezone.utc).isoformat(),'before':identity(),'scriptShaBefore':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'cases':[]}
def tap(p,s):p.locator(s).tap()
def inspect(p):return p.evaluate('qa.game.inspect()')
def state(p):return inspect(p)['state']
def save(p):return p.evaluate('(()=>{const{ui,...s}=qa.game.snapshot().save;return s})()')
def count(p):return p.evaluate('qa.checkpoints.length')
def flush(p):p.evaluate('qa.game.flush()')
def settle(p):p.wait_for_timeout(180);p.wait_for_function('!qa.game.sceneEvidence().camera.moving',timeout=10000)
def shot(p,label):
    f=OUT/(label+'.png');p.screenshot(path=str(f));return str(f.relative_to(ROOT))
def ready(p):
    p.wait_for_function('qa?.ready||qa?.error',timeout=240000);assert not p.evaluate('qa.error||null'),p.evaluate('qa.error')
def assert_controls(p,draft=False):
    assert p.evaluate('document.documentElement.scrollWidth<=innerWidth'),'horizontal overflow'
    assert p.locator('.puzzle-header').is_visible() and not p.locator('.puzzle-loading').is_visible()
    selectors=['.puzzle-camera [data-act="search"]']+(['[data-act="confirm"]','[data-act="cancel"]','[data-act="tower-remove-last"]'] if draft else [])
    for selector in selectors:
        r=p.locator(selector).bounding_box();assert r and r['x']>=-.5 and r['y']>=31.5 and r['x']+r['width']<=p.viewport_size['width']+.5 and r['y']+r['height']<=p.viewport_size['height']+.5,(selector,r,p.viewport_size)
def render(p,row,label,draft=False):
    settle(p);assert_controls(p,draft);s=p.evaluate('qa.game.sceneEvidence()');row['renders'].append({'label':label,'viewport':p.viewport_size,'previewCount':s['towerCache']['previewCount'],'ghosts':[g for g in s['towerSymbols'] if g['ghost']],'screenshot':shot(p,label)})
def select_places(p,items):
    for item in items:
        tap(p,'.puzzle-camera [data-act="search"]');p.locator('#settlement-search').fill(item['name']);tap(p,f'[data-search-result][data-select="{item["id"]}"]');settle(p)
def tap_map_places(p,items,n):
    selected=[]
    for item in items:
        at=p.evaluate('(r)=>qa.game.mapPoint(r)',item)
        box=p.locator('.puzzle-map').bounding_box()
        if not at or not box:continue
        x,y=box['x']+at['x'],box['y']+at['y']
        if not (0<x<p.viewport_size['width'] and 32<y<p.viewport_size['height']):continue
        clear=p.evaluate('([x,y])=>!!document.querySelector("#mount").shadowRoot.elementFromPoint(x,y)?.closest(".puzzle-map")',[x,y])
        if not clear:continue
        p.touchscreen.tap(x,y);settle(p)
        i=inspect(p);assert len(i['towerPositions'])==len(selected)+1,('native map tap failed',item,at,i['preview'])
        assert i['preview']['ok'],i['preview'];selected.append({'sourceId':item['id'],'screen':{'x':x,'y':y},'placed':i['towerPositions'][-1]})
        if len(selected)==n:return selected
    raise AssertionError(('not enough unobscured map places',len(selected),n))
def draft(p,n,cost,ok=True):
    i=inspect(p);assert len(i['towerPositions'])==n,i['towerPositions'];assert i['preview']['ok'] is ok,i['preview']
    if ok:assert abs(i['preview']['cost']-cost)<1e-9,i['preview']
    visible_price=p.locator('.preview-price span').inner_text().replace(',','.').replace('\u00a0','').replace('\u202f','')
    assert abs(float(visible_price)-cost)<1e-9,visible_price
    assert p.locator('[data-act="confirm"]').is_enabled() is ok
    e=p.evaluate('qa.game.sceneEvidence()');assert e['towerCache']['previewCount']==n,e['towerCache']
    return i['towerPositions']
def unchanged(p,baseline,checkpoints):
    s=state(p)
    for k in ['actions','revision','budget','spent','towers','facilities','routes']:assert s[k]==baseline[k],k
    assert count(p)==checkpoints,'draft altered durable checkpoint'

def run_case(browser,kind):
    row={'case':kind,'status':'running','renders':[],'errors':[],'httpFailures':[],'requestFailures':[],'requests':[]}
    context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,reduced_motion='reduce',service_workers='block');p=context.new_page();p.set_default_timeout(12000)
    p.on('pageerror',lambda e:row['errors'].append(str(e)));p.on('console',lambda m:row['errors'].append(m.text) if m.type=='error' else None)
    p.on('request',lambda r:row['requests'].append(urlparse(r.url).path));p.on('requestfailed',lambda r:row['requestFailures'].append(str(r.failure)))
    p.on('response',lambda r:row['httpFailures'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    try:
        started=time.perf_counter();p.goto(BASE+'?case='+kind);ready(p);row['mountMs']=round((time.perf_counter()-started)*1000,1)
        assert p.title()=='Native Settlements tower batch QA';baseline=state(p);checkpoint=count(p)
        if kind=='intro':
            assert inspect(p)['tutorial']['locked'] is True
            tap(p,'[data-act="guide-position"]');settle(p)
            i=inspect(p);assert i['preview']['action']['type']=='tower' and len(i['towerPositions'])==1,i
            assert p.locator('[data-act="tower-remove-last"]').count()==0
            assert p.locator('[data-act="confirm"]').inner_text()=='Подтвердить'
            unchanged(p,baseline,checkpoint);row['singlePreview']=shot(p,'intro-single-preview')
            tap(p,'[data-act="confirm"]');flush(p);s=state(p)
            assert len(s['actions'])==1 and s['actions'][0]['type']=='tower' and count(p)==checkpoint+1
            assert abs(s['spent']-.2)<1e-9;row['tutorial']={'actions':s['actions'],'spent':s['spent'],'lockedNextStep':inspect(p)['tutorial']['locked']}
        else:
            s=p.evaluate('qa.game.sceneEvidence()');assert s['region']['rowCount']==196 and s['region']['indexCount']==195,s['region']
            for service,values in inspect(p)['evaluation']['services'].items():assert values['total']==191 and REGION+':5801' not in values['missingIds'],(service,values)
            tap(p,'.puzzle-camera [data-act="search"]');p.locator('#settlement-search').fill('Соснина');assert p.locator('[data-search-result]').count()==0;tap(p,'dialog [data-act="close"]')
            rows=json.loads((RUNTIME/'data/settlements/v1/regions'/f'{REGION}.json').read_text('utf-8'))['settlements']
            candidates=[r for r in rows if r['population'] and r.get('quality',{}).get('position')=='inside']
            items=sorted(candidates,key=lambda r:r['population'],reverse=True)[:5]
            tap(p,'.puzzle-build [data-act="tools"]');tap(p,'[data-tool="tower"]')
            select_places(p,items[:3] if kind=='budget' else items)
            if kind=='budget':
                assert abs(baseline['budget']-.4)<1e-9
                draft(p,3,.6,False);unchanged(p,baseline,checkpoint);render(p,row,'budget-disabled',True)
                tap(p,'[data-act="tower-remove-last"]');draft(p,2,.4,True);unchanged(p,baseline,checkpoint)
                tap(p,'[data-act="cancel"]');unchanged(p,baseline,checkpoint);assert inspect(p)['towerPositions']==[]
                row['budget']={**p.evaluate('qa.fixture'),'disabledAt':.6,'enabledAfterRemoveAt':.4,'cancelNoCharge':True}
            else:
                positions=draft(p,5,1);unchanged(p,baseline,checkpoint)
                for locale,expected in [('en','Telecom'),('zh','通信'),('ru','Связь')]:
                    p.locator('#locale').select_option(locale);assert draft(p,5,1)==positions;unchanged(p,baseline,checkpoint)
                    assert p.locator('[data-layer="telecom"] .layer-label').inner_text()==expected
                    render(p,row,'draft-390x844-'+locale,True)
                for width,height in [(320,568),(390,844),(430,932),(844,390),(1365,900)]:
                    p.set_viewport_size({'width':width,'height':height});render(p,row,f'draft-{width}x{height}',True);assert draft(p,5,1)==positions
                p.set_viewport_size({'width':390,'height':844});tap(p,'[data-act="tower-remove-last"]');assert draft(p,4,.8)==positions[:4];unchanged(p,baseline,checkpoint)
                tap(p,'[data-act="cancel"]');unchanged(p,baseline,checkpoint);assert inspect(p)['towerPositions']==[]
                assert p.evaluate('qa.game.sceneEvidence().towerCache.previewCount')==0
                row['nativeMapTaps']=tap_map_places(p,sorted(candidates,key=lambda r:r['population'],reverse=True),3)
                draft(p,3,.6);tap(p,'[data-act="confirm"]');flush(p);settle(p)
                played=state(p);played_save=save(p)
                assert len(played['actions'])==1 and played['actions'][0]['type']=='tower-batch' and len(played['actions'][0]['positions'])==3
                assert played['revision']==baseline['revision']+1 and count(p)==checkpoint+1
                assert abs(played['spent']-.6)<1e-9 and abs(played['budget']-(baseline['budget']-.6))<1e-9
                assert len(played['towers'])==len(baseline['towers'])+3
                for width,height in [(320,568),(390,844),(430,932),(844,390),(1365,900)]:
                    p.set_viewport_size({'width':width,'height':height});render(p,row,f'confirmed-{width}x{height}');assert save(p)==played_save
                p.set_viewport_size({'width':390,'height':844});generation=p.evaluate('qa.generation');tap(p,'#restore');p.wait_for_function('(g)=>qa.ready&&qa.generation>g',arg=generation,timeout=180000)
                assert save(p)==played_save,'restore payload differs';restored=state(p)
                for k in ['actions','revision','budget','spent','towers','facilities','routes']:assert restored[k]==played[k],('restore',k)
                before_undo=count(p);tap(p,'[data-act="undo"]');flush(p);s=state(p)
                for k in ['actions','revision','budget','spent','towers','facilities','routes']:assert s[k]==baseline[k],('undo',k)
                assert count(p)==before_undo+1
                row['batch']={'draftPlaces':5,'draftNoCharge':True,'cancelNoCharge':True,'confirmedTowers':3,'confirmedActions':1,'confirmedRevisionDelta':1,'checkpointDelta':1,'spent':.6,'restoreExact':True,'undoExact':True,'undoCheckpointDelta':1,'wire':played_save['rulesVersion']}
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
        row['requests']=sorted(set(row['requests']));report['cases'].append(row);context.close();(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'case':kind,'status':row['status'],'failure':row.get('failure'),'mountMs':row.get('mountMs')},ensure_ascii=True),flush=True)
try:
    if args.serve_only:
        print(BASE,flush=True)
        while True:time.sleep(1)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,channel=args.channel,args=['--disable-component-update','--disable-background-networking']);report['browserVersion']=browser.version
        for kind in ['batch','budget','intro']:run_case(browser,kind)
        browser.close()
finally:
    server.shutdown();report['after']=identity();report['sourceStable']=report['before']==report['after'];report['scriptSha']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();report['scriptStable']=report['scriptShaBefore']==report['scriptSha'];report['finishedAt']=datetime.now(timezone.utc).isoformat()
    report['status']='pass' if report['sourceStable'] and report['scriptStable'] and len(report['cases'])==3 and all(c['status']=='pass' for c in report['cases']) else 'fail'
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'status':report['status'],'report':str(OUT/'report.json'),'sourceStable':report['sourceStable']},ensure_ascii=True),flush=True)
raise SystemExit(0 if report['status']=='pass' else 1)
