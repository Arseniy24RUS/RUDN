"""Real native UI with isolated auth/RTDB emulators. No injected game API/state."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import argparse, hashlib, json, sys, threading, time, traceback, urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/settlements-cloud-browser'
LOCK_OBSERVER = """(()=>{
  const events=[];window.__qaLockEvents=events;
  const emit=(type,data={})=>{const value={type,at:performance.now(),wall:Date.now(),hidden:document.hidden,...data};events.push(value);console.debug('QA_LOCK '+JSON.stringify(value))};
  emit('init');document.addEventListener('visibilitychange',()=>emit('visibilitychange'),true);
  const locks=navigator.locks;if(!locks?.request)return;
  const original=locks.request.bind(locks);let next=0;
  locks.request=(name,options,callback)=>{
    if(typeof options==='function'){callback=options;options={}}
    const id=++next;emit('request',{id,name,options});
    return original(name,options,async lock=>{
      emit('callback-start',{id,name,granted:!!lock});
      try{const result=await callback(lock);emit('callback-settled',{id,name});return result}
      catch(error){emit('callback-rejected',{id,name,error:String(error?.code||error?.message)});throw error}
    }).then(value=>{emit('request-settled',{id,name});return value},error=>{emit('request-rejected',{id,name,error:String(error?.code||error?.message)});throw error});
  };
})()"""

def cloud(path):
    req=urllib.request.Request('http://127.0.0.1:9000/rudn-platform/v1/'+path+'.json?ns=demo-rudn-default-rtdb',headers={'Authorization':'Bearer owner'})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=10) as response:return json.load(response)

def checkpoint(ticket,slug='settlements-tutorial'):
    values=cloud(f'checkpoints/{ticket}/{slug}') or {}
    if not values:return None
    value=max(values.values(),key=lambda v:v.get('updatedAt',0))
    state=value['current']['state'].copy()
    if isinstance(state.get('engineSave'),str):state['engineSave']=json.loads(state['engineSave'])
    return {'revision':value['revision'],'state':state}

def wait_turns(page,ticket,turns,slug='settlements-tutorial',timeout=20):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        value=checkpoint(ticket,slug)
        if value and len((value['state'].get('engineSave') or {}).get('actions',[]))==turns:return value
        page.wait_for_timeout(200)
    raise AssertionError(f'Cloud turns expected {turns}: {value}')

def act(page,name):page.locator(f'[data-act="{name}"]').click()
def ready(page):
    page.locator('.puzzle-map').wait_for(timeout=60000)
    page.locator('.puzzle-loading').wait_for(state='hidden',timeout=60000)
def choose(page,tool):
    if not page.locator(f'[data-tool="{tool}"]').count():act(page,'tools')
    page.locator(f'[data-tool="{tool}"]').click()
def find(page,name):
    act(page,'search');page.locator('#settlement-search').fill(name)
    page.locator('[data-search-result]').filter(has=page.get_by_text(name,exact=True)).first.click()

def login(page,ticket,name):
    page.locator('#profileButton').click();page.locator('#authIdentifier').fill(ticket)
    page.locator('#authSubmit').click()
    page.locator('#authFullName').wait_for(state='visible',timeout=30000)
    page.locator('#authFullName').fill(name)
    page.locator('#authGroupOptions button').first.click()
    page.locator('#authSubmit').click()
    page.locator('#authDialog').wait_for(state='hidden',timeout=30000)
    page.locator('#topName').filter(has_text=name).wait_for(timeout=30000)

def build_hash():
    h=hashlib.sha256()
    for p in sorted((ROOT/'site').rglob('*')):
        if p.is_file():h.update(p.relative_to(ROOT/'site').as_posix().encode()+b'\0'+hashlib.sha256(p.read_bytes()).digest())
    return h.hexdigest()

def run_party(base,ticket,assessment=False):
    """Informed reference-driven UI walkthrough; source plan never injected."""
    global OUT
    OUT=OUT/time.strftime(('assessment' if assessment else 'party')+'-%Y%m%d-%H%M%S');OUT.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright
    region='nenetskiy_avtonomnyy_okrug'
    planpath=ROOT/f'site/apps/settlements/runtime/assets/js/settlements/v24/social-plans-regions/{region}-easy.mjs'
    plan=json.loads(planpath.read_text('utf-8').split('export default ')[1].rstrip(';\n'))
    pack=json.loads((ROOT/f'site/apps/settlements/runtime/data/settlements/v1/regions/{region}.json').read_text('utf-8'))
    rows=pack['settlements'];by_id={r['id']:r for r in rows}
    report={'evaluationType':'informed-reference-sequence-ui','base':base,'ticket':ticket,'buildHashStart':build_hash(),'planSha256':hashlib.sha256(planpath.read_bytes()).hexdigest(),'checks':[],'pageErrors':[],'consoleErrors':[],'steps':[]}
    entry='#activity/seminar-3' if assessment else '#games/settlements'
    def check(name,details=None):report['checks'].append({'name':name,'status':'pass','details':details});print(json.dumps(report['checks'][-1],ensure_ascii=False),flush=True)
    def execute(page,a):
        if a['type']=='build':choose(page,a['service']);find(page,by_id[a['settlementId']]['name'])
        elif a['type']=='connect':choose(page,'connect');find(page,by_id[a['from']]['name']);find(page,by_id[a['to']]['name'])
        elif a['type']=='tower':
            r=next(r for r in rows if abs(r['lat']-a['lat'])<1e-10 and abs(r['lon']-a['lon'])<1e-10)
            choose(page,'tower');find(page,r['name'])
        elif a['type']=='upgrade':
            f=next(f for f in plan['initialFacilities'] if f['id']==a['facilityId'])
            if page.locator('[data-act="clear-tool"]').count():act(page,'clear-tool')
            find(page,by_id[f['settlementId']]['name']);page.locator('[data-upgrade="'+a['facilityId']+'"]').click()
        else:raise AssertionError('Unsupported UI reference action '+str(a))
        page.locator('[data-act="confirm"]').wait_for()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True);report['browserVersion']=browser.version
        ctx=browser.new_context(viewport={'width':1365,'height':950},service_workers='block');page=ctx.new_page()
        page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
        page.on('console',lambda m:report['consoleErrors'].append(m.text) if m.type=='error' and not 'net::ERR_INTERNET_DISCONNECTED' in m.text else None)
        try:
            page.goto(base+'#games/settlements');page.locator('[data-action="tutorial"]').wait_for(timeout=60000)
            login(page,ticket,'QA Local Synthetic Student Renamed')
            if assessment:page.goto(base+entry);page.locator('[data-action="start"]').wait_for(timeout=30000)
            else:page.locator('[data-select="region"]').select_option(region)
            page.locator('[data-select="difficulty"]').select_option('easy')
            page.locator('[data-action="start"]').click();page.locator('.host-dialog[open], .puzzle-map').wait_for(timeout=60000)
            if page.locator('.host-dialog[open]').count():page.locator('[data-dialog="confirm"]').click()
            page.locator('.puzzle-map').wait_for(timeout=60000)
            slug='seminar-3' if assessment else 'settlements-freeplay'
            value=wait_turns(page,ticket,0,slug);attempt=value['state']['attemptId'];report['attemptId']=attempt
            if assessment:
                region=value['state']['regionId']
                planpath=ROOT/f'site/apps/settlements/runtime/assets/js/settlements/v24/social-plans-regions/{region}-easy.mjs'
                plan=json.loads(planpath.read_text('utf-8').split('export default ')[1].rstrip(';\n'))
                pack=json.loads((ROOT/f'site/apps/settlements/runtime/data/settlements/v1/regions/{region}.json').read_text('utf-8'))
                rows=pack['settlements'];by_id={r['id']:r for r in rows};report['planSha256']=hashlib.sha256(planpath.read_bytes()).hexdigest()
            report['regionId']=region
            check('new party cloud checkpoint',{'attemptId':attempt,'regionId':value['state']['regionId'],'difficulty':value['state']['difficulty'],'mode':'assessment' if assessment else 'free'})
            for i,a in enumerate(plan['referenceActions'],1):
                execute(page,a)
                if i==len(plan['referenceActions']):ctx.set_offline(True)
                act(page,'confirm')
                if i==len(plan['referenceActions']):
                    page.locator('.result').wait_for(state='visible',timeout=30000)
                    assert page.locator('[data-act="undo"]').is_disabled()
                    assert len(checkpoint(ticket,slug)['state']['engineSave']['actions'])==i-1
                    page.screenshot(path=str(OUT/'completion-offline-pending.png'),full_page=True)
                    check('terminal offline result pending and immutable')
                    ctx.set_offline(False)
                value=wait_turns(page,ticket,i,slug,timeout=40)
                report['steps'].append({'action':a,'turns':i,'cloudRevision':value['revision']})
                print(f'PARTY MOVE {i}/{len(plan["referenceActions"])} cloud revision {value["revision"]}',flush=True)
                if i==1:
                    act(page,'undo');value=wait_turns(page,ticket,0,slug)
                    check('regular party undo checkpoint',{'revision':value['revision'],'turns':0})
                    execute(page,a);act(page,'confirm');wait_turns(page,ticket,1,slug)
                if i in (1,20):page.screenshot(path=str(OUT/f'party-move-{i}.png'))
                if assessment and i==10:
                    other=ctx.new_page();other.goto(base+entry);other.locator('[data-action="resume"]').click();other.locator('.puzzle-map').wait_for(timeout=60000)
                    other.locator('[data-action="takeover"]').wait_for(state='visible');assert other.locator('[data-act="undo"]').is_disabled()
                    check('regular party second tab read-only')
                if assessment and i==11:
                    page.close();page=other;page.locator('[data-action="takeover"]').click()
                    act(page,'undo');wait_turns(page,ticket,10,slug)
                    execute(page,a);act(page,'confirm');wait_turns(page,ticket,11,slug)
                    check('regular party immediate writer handover restores latest turn')
                if assessment and i==20:
                    budget=page.locator('.budget').inner_text();ctx.close();ctx=browser.new_context(viewport={'width':1365,'height':950},service_workers='block');page=ctx.new_page()
                    page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
                    page.goto(base+'#games/settlements');page.locator('[data-action="tutorial"]').wait_for(timeout=60000);login(page,ticket,'QA Local Synthetic Student Renamed')
                    page.goto(base+entry);page.locator('[data-action="resume"]').click();ready(page)
                    assert page.locator('.budget').inner_text()==budget
                    act(page,'undo');wait_turns(page,ticket,19,slug);execute(page,a);act(page,'confirm');wait_turns(page,ticket,20,slug)
                    check('regular party restored in independent context with same budget and replay')
            page.get_by_text('Результат подтверждён базой.',exact=True).wait_for(timeout=60000)
            value=checkpoint(ticket,slug);assert value['state']['status']=='completed'
            result=value['state']['result'];assert result['coverageNp']>=90 and result['turns']==len(plan['referenceActions'])
            check('completed party acknowledged',result)
            attempts=cloud(f'attempts/{ticket}') or {};assert attempts[attempt]['recordGrade'] is assessment
            assert cloud(f'grades/{ticket}/settlements-freeplay') is None
            grade=cloud(f'grades/{ticket}/seminar-3')
            if assessment:assert grade['points']==3 and grade['sourceAttemptId']==attempt
            else:assert grade is None
            leaders=cloud('settlementsLeaderboard/'+('assessment' if assessment else 'free')+'/easy') or {};assert attempt in leaders
            check('completion public row and expected course grade',{'attemptId':attempt,'leaderRows':len(leaders),'grade':grade})
            page.locator('[data-select="rank-difficulty"]').select_option('easy');page.locator('[data-action="rank-refresh"]').click()
            page.locator('.leaderboard tbody').filter(has_text='QA Local Synthetic Student Renamed').wait_for(timeout=30000)
            page.screenshot(path=str(OUT/'free-result-leaderboard.png'),full_page=True)
            page.reload();page.locator('[data-action="resume"]').wait_for(timeout=60000)
            assert checkpoint(ticket,slug)['state']['attemptId']==attempt
            assert len(cloud(f'attempts/{ticket}') or {})==len(attempts)
            check('reload completed receipt is idempotent')
            page.locator('[data-action="start"]').click();page.locator('.puzzle-map').wait_for(timeout=60000)
            value=wait_turns(page,ticket,0,slug)
            assert value['state']['attemptId']!=attempt
            if assessment:assert value['state']['regionId']!=region
            check('retry creates new independent attempt',{'newAttemptId':value['state']['attemptId'],'regionId':value['state']['regionId']})
            report['status']='pass'
        except Exception as error:
            report['status']='fail';report['failure']=str(error);report['traceback']=traceback.format_exc()
            page.screenshot(path=str(OUT/'failure.png'),full_page=True)
            (OUT/'failure-dom.txt').write_text(page.locator('body').aria_snapshot(),encoding='utf-8');print(traceback.format_exc(),flush=True)
        finally:
            report['buildHashEnd']=build_hash();(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
    return 0 if report['status']=='pass' else 1

def run_identity(base,ticket):
    global OUT
    OUT=OUT/time.strftime('identity-%Y%m%d-%H%M%S');OUT.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright
    other_ticket=str(int(time.time()*1000));report={'evaluationType':'informed-technical-browser-test','buildHashStart':build_hash(),'checks':[],'ticketA':ticket,'ticketB':other_ticket,'pageErrors':[]}
    def check(name,details=None):report['checks'].append({'name':name,'status':'pass','details':details});print(json.dumps(report['checks'][-1],ensure_ascii=False),flush=True)
    def logout(page):page.locator('#profileButton').click();page.locator('#accountLogout').click();page.locator('#accountDialog').wait_for(state='hidden')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True);report['browserVersion']=browser.version
        ctx=browser.new_context(viewport={'width':1365,'height':950},service_workers='block');page=ctx.new_page();page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
        try:
            page.goto(base+'#games/settlements');page.locator('[data-action="tutorial"]').wait_for(timeout=60000);login(page,ticket,'QA Local Synthetic Student Renamed')
            page.locator('[data-action="resume"]').click();ready(page)
            a=checkpoint(ticket,'settlements-freeplay');budget=page.locator('.budget').inner_text();turns=len(a['state']['engineSave']['actions']);attempt=a['state']['attemptId']
            logout(page);login(page,other_ticket,'QA Second Synthetic Student');page.goto(base+'#games/settlements')
            page.get_by_role('button',name='Начать обучение',exact=True).wait_for(timeout=60000)
            assert page.locator('[data-action="resume"]').count()==0
            assert checkpoint(other_ticket,'settlements-freeplay') is None
            check('new owner cannot resume previous owner party')
            page.locator('[data-action="tutorial"]').click();page.locator('[data-act="guide-position"]').wait_for(timeout=60000)
            act(page,'guide-position');act(page,'confirm');wait_turns(page,other_ticket,1)
            assert checkpoint(ticket,'settlements-freeplay')['state']['attemptId']==attempt
            assert len(checkpoint(ticket,'settlements-freeplay')['state']['engineSave']['actions'])==turns
            assert checkpoint(ticket)['state']['completed'] is True
            page.screenshot(path=str(OUT/'second-owner-tutorial.png'))
            check('second owner tutorial does not alter first owner party or tutorial')
            logout(page);login(page,ticket,'QA Local Synthetic Student Renamed');page.goto(base+'#games/settlements')
            page.locator('[data-action="resume"]').click();ready(page)
            assert page.locator('.budget').inner_text()==budget
            assert checkpoint(ticket,'settlements-freeplay')['state']['attemptId']==attempt
            assert len(checkpoint(ticket,'settlements-freeplay')['state']['engineSave']['actions'])==turns
            page.screenshot(path=str(OUT/'first-owner-restored.png'))
            check('original owner resumes exact attempt, moves and budget after switching back',{'attemptId':attempt,'turns':turns,'budget':budget})
            report['status']='pass'
        except Exception as error:
            report['status']='fail';report['failure']=str(error);report['traceback']=traceback.format_exc();page.screenshot(path=str(OUT/'failure.png'),full_page=True)
            (OUT/'failure-dom.txt').write_text(page.locator('body').aria_snapshot(),encoding='utf-8');print(traceback.format_exc(),flush=True)
        finally:
            report['buildHashEnd']=build_hash();(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
    return 0 if report['status']=='pass' else 1

def run(base,writer_only=False):
    global OUT
    OUT=OUT/time.strftime('run-%Y%m%d-%H%M%S');OUT.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright
    ticket=str(int(time.time()*1000));name='QA Local Synthetic Student'
    report={'evaluationType':'informed-technical-browser-test','base':base,'ticket':ticket,'profile':'synthetic, emulator-only','buildHashStart':build_hash(),'checks':[],'errors':[], 'browserTool':'invocation failed: chrome distribution missing; bundled Playwright fallback authorized','externalRequests':[],'lockEvents':[]}
    def check(label,details=None):
        item={'name':label,'status':'pass','details':details};report['checks'].append(item);print(json.dumps(item,ensure_ascii=False),flush=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        report['browserVersion']=browser.version
        ctx=browser.new_context(viewport={'width':1365,'height':950},service_workers='block')
        ctx.add_init_script(LOCK_OBSERVER)
        ctx.on('page',lambda p:p.on('console',lambda m:report['lockEvents'].append({'page':p.url,'event':json.loads(m.text[8:])}) if m.text.startswith('QA_LOCK ') else None))
        page=ctx.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('request',lambda r:report['externalRequests'].append(urlsplit(r.url).netloc) if urlsplit(r.url).scheme in ('http','https') and urlsplit(r.url).hostname!='127.0.0.1' else None)
        try:
            page.goto(base+'#games/settlements');page.locator('[data-action="tutorial"]').wait_for(timeout=60000)
            login(page,ticket,name)
            page.locator('[data-action="tutorial"]').click();page.locator('[data-act="guide-position"]').wait_for(timeout=60000)
            check('native entry and student login',{'title':page.title(),'url':page.url,'iframes':page.locator('iframe').count()})
            act(page,'guide-position');act(page,'confirm');value=wait_turns(page,ticket,1)
            check('tutorial first move cloud checkpoint',{'revision':value['revision'],'turns':1})
            page.screenshot(path=str(OUT/'tutorial-first.png'))
            choose(page,'medical');find(page,'Большая Казакбаева');act(page,'confirm');value=wait_turns(page,ticket,2)
            check('tutorial second move cloud checkpoint',{'revision':value['revision'],'turns':2})
            act(page,'undo');value=wait_turns(page,ticket,1)
            check('tutorial undo cloud checkpoint',{'revision':value['revision'],'turns':1})
            page.screenshot(path=str(OUT/'tutorial-undo.png'))
            # A second tab starts with a stale tutorial and no game session.
            other=ctx.new_page();other.goto(base+'#games/settlements');other.locator('[data-action="tutorial"]').click()
            other.locator('.puzzle-map').wait_for(timeout=60000)
            other.locator('[data-action="takeover"]').wait_for(state='visible')
            assert other.locator('[data-act="undo"]').is_disabled()
            check('second tab is read-only before handover')
            choose(page,'medical');find(page,'Большая Казакбаева');act(page,'confirm');value=wait_turns(page,ticket,2)
            assert checkpoint(ticket,'settlements-freeplay') is None
            other.evaluate("""()=>{window.__qaInputEvents=[];for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>{const node=event.composedPath().find(n=>n?.dataset?.action==='takeover');if(node)window.__qaInputEvents.push({type,at:performance.now(),label:node.textContent})},true)}""")
            page.close();page=other
            page.locator('[data-action="takeover"]').click()
            report['writerTimeline']=[]
            for _ in range(20):
                observation=page.evaluate("async()=>({at:performance.now(),locks:await navigator.locks.query(),readonly:document.querySelector('#settlementsMount')?.shadowRoot.querySelector('.game-host')?.shadowRoot.querySelector('[data-readonly]')!==null})")
                report['writerTimeline'].append(observation)
                if page.locator('[data-act="undo"]').is_enabled():break
                page.wait_for_timeout(100)
            try:
                act(page,'undo');value=wait_turns(page,ticket,1)
                check('writer handover restores tutorial without session',{'cloudTurnsAfterUndo':1,'revision':value['revision']})
            except Exception as error:
                report['checks'].append({'name':'writer handover restores tutorial without session','status':'fail','details':str(error)})
                (OUT/'writer-failure-dom.txt').write_text(page.locator('body').aria_snapshot(),encoding='utf-8')
                diagnostic=page.evaluate("async()=>{const {backend}=await import('/assets/js/backend.js?v=1.3.8');return {locks:await navigator.locks.query(),generation:backend.generation,studentKey:backend.getProfile()?.studentKey,visibility:document.visibilityState}}")
                report['writerDiagnostic']=diagnostic
                report['writerFailureStatus']=page.locator('[data-status]').inner_text()
                report['checkpointResourceTimings']=page.evaluate("()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/checkpoints/')).map(e=>({path:new URL(e.name).pathname,start:e.startTime,duration:e.duration,transferSize:e.transferSize}))")
                page.locator('[data-action="takeover"]').click();page.wait_for_timeout(2000)
                report['writerSecondClick']={'undoEnabled':page.locator('[data-act="undo"]').is_enabled(),'locks':page.evaluate('()=>navigator.locks.query()')}
                print('WRITER '+json.dumps({'diagnostic':diagnostic,'retry':report['writerSecondClick']},ensure_ascii=False),flush=True)
                if page.locator('[data-act="undo"]').is_enabled():act(page,'undo');wait_turns(page,ticket,1)
            page.screenshot(path=str(OUT/'tutorial-writer-handover.png'))
            report['writerInputEvents']=page.evaluate('window.__qaInputEvents')
            if writer_only:
                report['scope']='writer-only regression'
                report['status']='fail' if any(c['status']=='fail' for c in report['checks']) else 'pass'
                return 0 if report['status']=='pass' else 1
            # End context A, then log the same synthetic student into independent B.
            ctx.close();ctx=browser.new_context(viewport={'width':1365,'height':950},service_workers='block');page=ctx.new_page()
            page.on('pageerror',lambda e:report['errors'].append(str(e)))
            page.goto(base+'#games/settlements');page.locator('[data-action="tutorial"]').wait_for(timeout=60000);login(page,ticket,name)
            page.locator('[data-action="tutorial"]').click();page.locator('.puzzle-map').wait_for(timeout=60000)
            assert page.locator('[data-act="undo"]').is_enabled()
            check('tutorial restored in independent context',{'cloudTurns':len(checkpoint(ticket)['state']['engineSave']['actions'])})
            if len(checkpoint(ticket)['state']['engineSave']['actions'])==2:act(page,'undo');wait_turns(page,ticket,1)
            choose(page,'medical');find(page,'Большая Казакбаева');act(page,'confirm');wait_turns(page,ticket,2)
            choose(page,'connect');find(page,'Большая Казакбаева');find(page,'Мансурова');act(page,'confirm');wait_turns(page,ticket,3)
            check('tutorial restored state accepts next moves')
            page.screenshot(path=str(OUT/'tutorial-step4.png'))
            (OUT/'tutorial-step4-dom.txt').write_text(page.locator('body').aria_snapshot(),encoding='utf-8')
            choose(page,'tower');act(page,'focus');page.locator('.puzzle-map').focus();page.keyboard.press('Enter')
            page.locator('[data-act="confirm"]').wait_for()
            page.screenshot(path=str(OUT/'tutorial-tower-preview.png'))
            before=checkpoint(ticket)
            ctx.set_offline(True);act(page,'confirm');page.wait_for_timeout(1200)
            assert len(checkpoint(ticket)['state']['engineSave']['actions'])==3
            assert page.locator('[data-act="undo"]').is_enabled()
            page.screenshot(path=str(OUT/'tutorial-offline.png'))
            ctx.set_offline(False);value=wait_turns(page,ticket,4,timeout=30)
            check('offline move stays local then reconnect syncs',{'beforeRevision':before['revision'],'afterRevision':value['revision'],'turns':4})
            choose(page,'connect');find(page,'Султанаева');find(page,'Большая Казакбаева');act(page,'confirm');wait_turns(page,ticket,5)
            choose(page,'culture');find(page,'Большая Тюлякова');act(page,'confirm');value=wait_turns(page,ticket,6)
            page.screenshot(path=str(OUT/'tutorial-completion.png'))
            (OUT/'tutorial-completion-dom.txt').write_text(page.locator('body').aria_snapshot(),encoding='utf-8')
            assert value['state'].get('completed'),value['state']
            check('tutorial completed via six actual UI moves')
            assert page.locator('[data-act="undo"]').is_disabled()
            page.locator('.game-heading [data-action="lobby"]').click()
            page.locator('[data-action="start"]').wait_for()
            page.goto(base+'#profile');page.locator('#profileEdit [name="fullName"]').fill(name+' Renamed')
            page.locator('#profileEdit [type="submit"]').click();page.locator('#topName').filter(has_text='Renamed').wait_for()
            page.goto(base+'#games/settlements');page.locator('[data-action="start"]').wait_for(timeout=60000)
            check('profile edit preserves completed tutorial')
            print('BUTTONS '+json.dumps(page.get_by_role('button').all_text_contents(),ensure_ascii=False),flush=True)
            report['status']='fail' if any(c['status']=='fail' for c in report['checks']) else 'pass'
        except Exception as error:
            report['status']='fail';report['failure']=str(error);report['traceback']=traceback.format_exc()
            page.screenshot(path=str(OUT/'failure.png'),full_page=True)
            (OUT/'failure-dom.txt').write_text(page.locator('body').aria_snapshot(),encoding='utf-8')
            print(traceback.format_exc(),flush=True)
        finally:
            report['buildHashEnd']=build_hash();(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
    return 0 if report['status']=='pass' else 1

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=str(ROOT/'site'), **kw)
    def log_message(self, *_): pass
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy', "connect-src 'self' http://127.0.0.1:9000 http://127.0.0.1:9099 ws://127.0.0.1:9000; frame-src 'none'")
        super().end_headers()
    def do_GET(self):
        if urlsplit(self.path).path == '/assets/js/config.js':
            source=(ROOT/'site/assets/js/config.js').read_text('utf-8')
            source += "\nCONFIG.firebase={apiKey:'demo-rudn',authDomain:'demo-rudn.firebaseapp.com',projectId:'demo-rudn',databaseURL:'https://demo-rudn-default-rtdb.firebaseio.com'};CONFIG.emulators={host:'127.0.0.1',databasePort:9000,auth:'http://127.0.0.1:9099'};\n"
            body=source.encode('utf-8'); self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        else: super().do_GET()

def main():
    args=argparse.ArgumentParser();args.add_argument('--serve',action='store_true');args.add_argument('--port',type=int,default=4198);args.add_argument('--external-server',action='store_true');args.add_argument('--party-ticket');args.add_argument('--assessment',action='store_true');args.add_argument('--writer-only',action='store_true');args.add_argument('--identity-ticket');opts=args.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    if opts.identity_ticket:return run_identity(f'http://127.0.0.1:{opts.port}/',opts.identity_ticket)
    if opts.party_ticket:return run_party(f'http://127.0.0.1:{opts.port}/',opts.party_ticket,opts.assessment)
    if opts.external_server:return run(f'http://127.0.0.1:{opts.port}/',opts.writer_only)
    server=ThreadingHTTPServer(('127.0.0.1',opts.port),Handler)
    if opts.serve:
        print(f'Isolated demo-rudn config only: http://127.0.0.1:{opts.port}/',flush=True)
        server.serve_forever()

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
