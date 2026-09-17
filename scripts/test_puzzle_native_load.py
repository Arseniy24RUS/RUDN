"""Native puzzle lazy-load recovery. Real shell/loader; isolated local backend."""
import argparse
import asyncio
import json
import re
import time
from pathlib import Path
from playwright.async_api import async_playwright
from test_puzzle_catalog import PuzzleServer,ready,initializer,trusted_drop,ROOT,STUDENT

BACKEND_MODULE='assets/js/'+re.search(r"from '\./(backend\.js[^']*)'",(ROOT/'site/assets/js/main.js').read_text('utf8')).group(1)

async def settled(page):
    await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')

async def edge_cases(browser,base,args):
    reports=[]
    for scenario in ['hung-back','hung-timeout','owner-change','access-revoked','partial-draft-recovery','first-cached-offline']:
        if args.only and scenario!=args.only:continue
        print(json.dumps({'browser':browser.browser_type.name,'starting':scenario}),flush=True)
        context=await browser.new_context(service_workers='allow' if scenario=='first-cached-offline' else 'block',viewport={'width':1366,'height':900})
        if scenario=='access-revoked':await context.add_init_script(initializer('ru'))
        page=await context.new_page();errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        release=asyncio.Event();held=asyncio.Event();delivered=asyncio.Event();requests=0
        async def intercept(route):
            nonlocal requests
            requests+=1
            if requests!=1:
                await route.continue_();return
            if scenario=='partial-draft-recovery':
                await route.abort('failed');return
            response=await route.fetch();body=await response.body();headers=response.headers;status=response.status
            held.set();await release.wait()
            try:await route.fulfill(body=body,headers=headers,status=status)
            except Exception as error:
                # A removed script may already have cancelled this exact request.
                if not any(term in str(error) for term in ['Target page, context or browser has been closed','Route is already handled','Invalid InterceptionId']):raise
            finally:delivered.set()
        try:
            await shell(page,base)
            if scenario=='first-cached-offline':
                await page.evaluate('navigator.serviceWorker.ready')
                await page.wait_for_function('navigator.serviceWorker.controller',timeout=45000)
                # Visit one real map online, then create a fresh catalog
                # document. Geometry is intentionally cached only when visited;
                # never-visited maps are not promised to work offline.
                await page.locator('[data-game="maps"] a').click();await ready(page)
                await page.locator('.puzzle-native-page > .page-actions a').click()
                await page.locator('[data-game="maps"] a').wait_for()
                await page.reload(wait_until='domcontentloaded')
                await page.locator('[data-game="maps"] a').wait_for()
                await page.wait_for_function('navigator.serviceWorker.controller',timeout=45000)
                assert not await page.evaluate('Boolean(window.mountRudnPuzzle)')
                await context.add_cookies([{'name':'qa-puzzle-offline','value':'1','url':base}])
                probe=await context.request.get(base+'__qa/connection-probe?nonce=native-loader-cached-offline')
                assert probe.status==503
                # A failed connection and offline OS indicator are independent:
                # cached assets must remain usable even when onLine is false.
                await page.evaluate("Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'))")
                await page.locator('[data-game="maps"] a').click();await ready(page)
                assert await page.locator('#geoPuzzleApp').count()==1
                assert await page.locator('#toastStack .rudn-notice').count()==0
                assert not errors,errors
                reports.append({'scenario':scenario,'passed':True,'transport':'site503','offlineIndicator':False,'runtimePreviouslyExecuted':False})
                continue
            if scenario=='partial-draft-recovery':
                await page.locator('[data-game="maps"] a').click();await ready(page)
                await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
                await trusted_drop(page)
                before=await page.evaluate('window.__puzzleRead()')
                await page.locator('.puzzle-native-page > .page-actions a').click()
                await page.locator('[data-game="maps"] a').wait_for()
                # Recreate the lazy-loading boundary; retain the same browser's
                # real durable draft without seeding or editing saved state.
                await page.reload(wait_until='domcontentloaded')
                await page.locator('[data-game="maps"] a').wait_for()
            await context.route('**/assets/js/puzzle-engine.js*',intercept)
            if scenario=='access-revoked':await page.evaluate("location.hash='activity/seminar-2'")
            else:await page.locator('[data-game="maps"] a').click()
            if scenario=='partial-draft-recovery':
                await page.locator('[data-puzzle-loading="waiting"]').wait_for()
                await page.evaluate("window.dispatchEvent(new Event('online'))")
                after=await ready(page)
                for key in ['attemptId','placed','order','featureIds','hints']:
                    assert after[key]==before[key],(key,before[key],after[key])
                assert after['placed']==1
            else:
                await asyncio.wait_for(held.wait(),10)
                if scenario=='hung-back':
                    start=time.monotonic()
                    await page.locator('.puzzle-native-page > .page-actions a').click()
                    await page.locator('[data-game="maps"] a').wait_for(timeout=2000)
                    back_ms=round((time.monotonic()-start)*1000)
                    assert await page.evaluate('location.hash')=='#games'
                elif scenario=='hung-timeout':
                    await page.locator('[data-puzzle-loading="waiting"]').wait_for(timeout=11000)
                    await ready(page)
                    assert requests>=2
                elif scenario=='owner-change':
                    next_profile={**STUDENT,'studentKey':'990000009','ticket':'990000009','fullName':'QA New Owner'}
                    await page.evaluate("""async ({module,profile})=>{const {backend}=await import(module);backend.profile=backend.migrateProfile(profile);localStorage.setItem('rudn.profile.v1',JSON.stringify(profile));window.dispatchEvent(new Event('rudn:identitychange'));}""",{'module':base+BACKEND_MODULE,'profile':next_profile})
                    await ready(page)
                    assert await page.locator('#geoPuzzleApp').get_attribute('data-user-name')=='QA New Owner'
                    assert requests>=2
                elif scenario=='access-revoked':
                    await page.evaluate("""async module=>{const {backend}=await import(module);for(const year of Object.keys(backend.accessOverrides))backend.accessOverrides[year]={'topic-2':{state:'closed'}};window.dispatchEvent(new Event('rudn:accesschange'));}""",base+BACKEND_MODULE)
                    await page.locator('.access-lock-panel').wait_for(timeout=2000)
                release.set();await asyncio.wait_for(delivered.wait(),10);await settled(page)
                expected_roots=0 if scenario in ['hung-back','access-revoked'] else 1
                assert await page.locator('#geoPuzzleApp').count()==expected_roots
                if scenario=='owner-change':assert await page.locator('#geoPuzzleApp').get_attribute('data-user-name')=='QA New Owner'
            assert not errors,errors
            assert await page.locator('#toastStack .rudn-notice').count()==0
            reports.append({'scenario':scenario,'passed':True,'requests':requests,**({'backMs':back_ms} if scenario=='hung-back' else {}),**({'placedRestored':1,'sameAttemptAndOrder':True} if scenario=='partial-draft-recovery' else {})})
        except Exception as error:
            diagnostic={'scenario':scenario,'error':str(error),'requests':requests,'pageErrors':errors,'dom':await page.evaluate("({hash:location.hash,visibility:document.visibilityState,engine:!!window.mountRudnPuzzle,status:document.querySelector('[data-puzzle-loading]')?.textContent,scripts:[...document.scripts].filter(s=>s.src.includes('puzzle')).map(s=>s.src),state:window.__puzzleRead?.()})")}
            (args.output/f'native-loader-failure-{browser.browser_type.name}-{scenario}.json').write_text(json.dumps(diagnostic,indent=2),encoding='utf8')
            await page.screenshot(path=str(args.output/f'native-loader-failure-{browser.browser_type.name}-{scenario}.png'),timeout=5000)
            raise
        finally:
            release.set()
            await context.close()
    return reports

async def shell(page,base,locale='ru'):
    await page.add_init_script("localStorage.setItem('rudn.locale',"+json.dumps(locale)+")")
    await page.goto(base+'index.html#games',wait_until='domcontentloaded')
    await page.locator('[data-game="maps"] a').wait_for()

async def run(browser_name,args):
    reports=[]
    with PuzzleServer(args.fixtures) as server:
        base=server.base if hasattr(server,'base') else f'http://127.0.0.1:{server.httpd.server_port}/RUDN/'
        async with async_playwright() as playwright:
            browser=await getattr(playwright,browser_name).launch(**({'firefox_user_prefs':{'network.proxy.type':0}} if browser_name=='firefox' else {}))
            try:
                for locale,target,wake in [('ru','runtime','online'),('en','fragment','timer'),('zh','runtime','online')]:
                    if args.only:continue
                    if args.baseline and locale!='ru':continue
                    context=await browser.new_context(service_workers='block',viewport={'width':1366,'height':900})
                    page=await context.new_page();errors=[]
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    if args.baseline:
                        await context.route('**/assets/js/main.js*',lambda route:route.fulfill(body=args.baseline.read_text('utf8'),content_type='text/javascript'))
                    blocked=0
                    pattern='**/assets/js/puzzle-engine.js*' if target=='runtime' else '**/apps/puzzle.html'
                    async def fail_once(route):
                        nonlocal blocked
                        blocked+=1
                        if blocked==1:await route.abort('failed')
                        else:await route.continue_()
                    await context.route(pattern,fail_once)
                    try:
                        await shell(page,base,locale)
                        await page.locator('[data-game="maps"] a').click()
                        if args.baseline:
                            await page.locator('#toastStack .rudn-notice').first.wait_for()
                            assert await page.locator('#geoPuzzleApp').count()==0
                            reports.append({'scenario':'baseline-runtime-failure','genericErrorAndNotice':True})
                            await page.screenshot(path=str(args.output/f'native-loader-baseline-{browser_name}.png'))
                            continue
                        status=page.locator('[data-puzzle-loading="waiting"]')
                        await status.wait_for()
                        copy=await status.inner_text()
                        assert {'ru':'автоматически','en':'automatically','zh':'自动'}[locale] in copy
                        await page.locator('#profileButton').focus()
                        if wake=='online':await page.evaluate("window.dispatchEvent(new Event('online'))")
                        await ready(page)
                        assert await page.evaluate('document.activeElement.id')=='profileButton'
                        assert await page.locator('#toastStack .rudn-notice').count()==0
                        assert await page.evaluate('location.hash')=='#puzzle'
                        assert blocked>=2
                        assert not errors,errors
                        reports.append({'scenario':target+'-failure-'+wake,'locale':locale,'requests':blocked,'focusRetained':True,'passed':True})
                    finally:await context.close()
                if not args.baseline:reports.extend(await edge_cases(browser,base,args))
            finally:await browser.close()
    path=args.output/f'native-loader-{browser_name}{"-baseline" if args.baseline else ""}.json'
    path.write_text(json.dumps({'browser':browser_name,'reports':reports},indent=2),encoding='utf8')
    return reports

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--browsers',default='chromium')
    parser.add_argument('--fixtures',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--baseline',type=Path)
    parser.add_argument('--only',choices=['hung-back','hung-timeout','owner-change','access-revoked','partial-draft-recovery','first-cached-offline'])
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    for browser in args.browsers.split(','):print(json.dumps({'browser':browser,'reports':await run(browser,args)}),flush=True)

if __name__=='__main__':asyncio.run(main())
