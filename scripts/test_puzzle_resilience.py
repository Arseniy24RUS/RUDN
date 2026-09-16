#!/usr/bin/env python3
"""Fault-injection regressions on the real puzzle UI and isolated fixture server.

No production writes are possible: PuzzleServer injects a local identity and CSP.
Faults affect browser fetch/storage APIs only. Synthetic visibility and accelerated
request deadlines are labelled; neither is physical-device coverage.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import time
import traceback

from playwright.async_api import async_playwright
from test_puzzle_catalog import PuzzleServer, READ_ONLY_HOOK, ROOT, STUDENT, context_for, flush, ready, trusted_drop, write_json


FETCH_FAULT = r"""(() => {
 const original=window.fetch.bind(window);
 window.__qaFault={pattern:'',kind:'fail',enabled:false,calls:0,aborts:0};
 window.fetch=(input,options={})=>{
  const url=typeof input==='string'?input:input.url;
  const f=window.__qaFault;
  if(!f.enabled||!String(url).includes(f.pattern))return original(input,options);
  f.calls++;
  if(f.kind==='fail')return Promise.reject(new TypeError('QA injected connection failure'));
  return new Promise((resolve,reject)=>{
   const abort=()=>{f.aborts++;reject(new DOMException('QA aborted pending request','AbortError'))};
   if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
  });
 };
})();"""


async def state(page):
    return await page.evaluate('window.__puzzleRead()')


async def saved(page, owner=None):
    await flush(page)
    return await page.evaluate("""async ({base,owner})=>{
      const {durableStore}=await import(base+'assets/js/durable-store.js');
      return durableStore.loadDraft({owner,activitySlug:'maps-freeplay',mode:'free'});
    }""", {'base': page._qa_base, 'owner': owner or 'student:' + STUDENT['studentKey']})


async def open_game(page, server):
    await page.goto(server.base + 'apps/puzzle.html?context=free&qaLocale=ru', wait_until='domcontentloaded')
    await ready(page)
    await page.wait_for_function("document.querySelector('#geoPuzzleApp').puzzleProgress.canWrite()")
    await page.locator('#puzzleCanvas').scroll_into_view_if_needed()


async def quiet(page):
    assert not await page.locator('dialog[open]').count(), 'Network/storage failure opened a dialog'
    assert not await page.locator('.rudn-notices:not([hidden])').count(), 'Failure opened a global notification panel'


async def first_load(page, context, browser_name, server, record, hanging=False):
    await context.add_init_script(FETCH_FAULT + "window.__qaFault={pattern:'russia_subjects_89.topojson',kind:'%s',enabled:true,calls:0,aborts:0};" % ('hang' if hanging else 'fail'))
    if hanging:
        await page.clock.install()
    await page.goto(server.base + 'apps/puzzle.html?context=free&qaLocale=ru', wait_until='domcontentloaded')
    await page.wait_for_function('window.__qaFault.calls>0&&window.__puzzleRead')
    focus = page.locator('[data-puzzle-difficulty="easy"]')
    await focus.focus()
    if hanging:
        await page.clock.fast_forward(45100)
        await page.wait_for_function('window.__qaFault.aborts>0')
        record['deadlineSimulation'] = 'Playwright clock advanced 45,100 ms; AbortSignal reached hanging fetch'
    await page.wait_for_function('!window.__puzzleRead().loading')
    failed = await state(page)
    assert not failed['ready'] and failed['elapsedMs'] == 0, failed
    await quiet(page)
    assert not await page.locator('.puzzle-save-notice').count(), 'Connection failure was misreported as lost local storage'
    await page.evaluate("()=>{window.__qaFault.enabled=false;window.dispatchEvent(new Event('online'));}")
    recovered = await ready(page)
    assert recovered['mode'] == 'russia-subjects' and recovered['placed'] == 0
    assert recovered['elapsedMs'] == 0, 'Autoload/recovery started the timer'
    assert await focus.evaluate('(el)=>el===document.activeElement'), 'Recovery stole keyboard focus'
    await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
    await trusted_drop(page)
    record['recovery'] = {'placed': (await state(page))['placed'], 'focusPreserved': True, 'timerInitiallyZero': True}


async def initial_failure(*args):
    await first_load(*args)


async def initial_hang(*args):
    await first_load(*args, hanging=True)


async def replacement_failure(page, context, browser_name, server, record):
    await context.add_init_script(FETCH_FAULT)
    await open_game(page, server)
    await trusted_drop(page)
    before = await saved(page)
    await page.evaluate("()=>Object.assign(window.__qaFault,{pattern:'usa_states.geojson',enabled:true})")
    confirmations = []

    async def accept(dialog):
        confirmations.append(dialog.message)
        await dialog.accept()

    page.on('dialog', accept)
    await page.locator('[data-puzzle-mode="country-regions"]').click()
    await page.wait_for_function('window.__qaFault.calls>0&&!window.__puzzleRead().loading')
    after = await state(page)
    assert after['attemptId'] == before['attemptId'] and after['placed'] == 1 and after['mode'] == 'russia-subjects'
    assert len(confirmations) == 1, confirmations
    await quiet(page)
    assert not await page.locator('.puzzle-save-notice').count(), 'Failed map replacement was misreported as storage failure'
    await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
    await trusted_drop(page)
    latest = await saved(page)
    assert latest['attemptId'] == before['attemptId'] and latest['state']['placed'] == 2
    record['preserved'] = ['attempt', 'map', 'first placement', 'continued input', 'new checkpoint']
    record['failedRequests'] = await page.evaluate('window.__qaFault.calls')


async def storage_fault(page, context, browser_name, server, record, quota=False):
    # Identity seed reads remain available to the fixture adapter. Every durable
    # persistence write fails; this is not a claim that localStorage getters fail.
    code = """(() => {
      const name=%s,fail=()=>{throw new DOMException('QA storage fault',name)};
      const set=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){if(k==='rudn.profile.v1'||k==='rudn.locale'||k==='qa.puzzle.initialized')return set.call(this,k,v);return fail()};
      if(name==='QuotaExceededError')IDBObjectStore.prototype.put=fail;
      else Object.defineProperty(window,'indexedDB',{configurable:true,value:{open:fail}});
      Object.defineProperty(window,'caches',{configurable:true,value:{open:()=>Promise.reject(new DOMException('QA cache fault',name))}});
    })();""" % json.dumps('QuotaExceededError' if quota else 'SecurityError')
    await context.add_init_script(code)
    await open_game(page, server)
    await page.locator('.puzzle-save-notice').wait_for()
    before = await state(page)
    await trusted_drop(page)
    await trusted_drop(page)
    await page.locator('#puzzleHint').click()
    await page.locator('#puzzleReturn').click()
    after = await state(page)
    assert after['attemptId'] == before['attemptId'] and after['placed'] == 2 and after['hints'] == 1
    assert await page.locator('.puzzle-save-notice').count() == 1, 'Repeated failures duplicated the notice'
    await quiet(page)
    record['fault'] = 'QuotaExceededError on IDB/localStorage plus CacheStorage refusal' if quota else 'IndexedDB unavailable, localStorage writes denied, CacheStorage unavailable'
    record['continued'] = {'placed': after['placed'], 'hints': after['hints'], 'inlineNotices': 1}


async def storage_denied(*args):
    await storage_fault(*args)


async def storage_quota(*args):
    await storage_fault(*args, quota=True)


async def hidden_timer(page, context, browser_name, server, record):
    await open_game(page, server)
    await trusted_drop(page)
    await page.wait_for_timeout(200)
    await page.evaluate("""()=>{
      window.__qaHidden=true;
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__qaHidden});
      Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__qaHidden?'hidden':'visible'});
      document.dispatchEvent(new Event('visibilitychange'));
    }""")
    await page.wait_for_timeout(100)
    paused = (await saved(page))['state']['elapsedMs']
    await page.wait_for_timeout(400)
    still = (await state(page))['elapsedMs']
    assert abs(still - paused) < 80, ('Hidden time was counted', paused, still)
    await page.evaluate("()=>{window.__qaHidden=false;document.dispatchEvent(new Event('visibilitychange'));}")
    await page.wait_for_function("document.querySelector('#geoPuzzleApp').puzzleProgress.canWrite()&&!window.__puzzleRead().loading")
    await page.wait_for_timeout(250)
    resumed = (await state(page))['elapsedMs']
    assert resumed - paused >= 150, ('Visible timer did not resume', paused, resumed)
    record['simulation'] = 'Synthetic document visibility getters and visibilitychange; actual timers and persistence'
    record['milliseconds'] = {'paused': paused, 'afterHidden': still, 'afterVisible': resumed}


async def profile_isolation(page, context, browser_name, server, record):
    await open_game(page, server)
    await trusted_drop(page)
    original = await saved(page)
    other = {**STUDENT, 'ticket': '990000002', 'studentKey': '990000002', 'email': '990000002@rudn.ru', 'fullName': 'QA Second Profile'}
    changer = await context.new_page()
    await changer.goto(server.base + 'apps/puzzle.html?context=free', wait_until='domcontentloaded')
    await ready(changer)
    await changer.evaluate("profile=>localStorage.setItem('rudn.profile.v1',JSON.stringify(profile))", other)
    await page.wait_for_function("document.querySelector('#geoPuzzleApp').dataset.playAllowed==='false'")
    await changer.close()
    await page.reload(wait_until='domcontentloaded')
    second = await ready(page)
    assert second['attemptId'] != original['attemptId'] and second['placed'] == 0
    await page.wait_for_function("document.querySelector('#geoPuzzleApp').puzzleProgress.canWrite()")
    await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
    await trusted_drop(page)
    second_draft = await saved(page, 'student:' + other['studentKey'])
    assert second_draft['owner'] == 'student:' + other['studentKey'] and second_draft['state']['placed'] == 1
    await page.evaluate("profile=>localStorage.setItem('rudn.profile.v1',JSON.stringify(profile))", STUDENT)
    await page.reload(wait_until='domcontentloaded')
    restored = await ready(page)
    assert restored['attemptId'] == original['attemptId'] and restored['placed'] == 1
    record['profiles'] = {'firstAttempt': original['attemptId'], 'secondAttempt': second['attemptId'], 'firstRestored': True}


async def old_schema(page, context, browser_name, server, record):
    await open_game(page, server)
    await trusted_drop(page)
    original = await saved(page)
    await page.evaluate("""async ({base,owner})=>{
      const progress=document.querySelector('#geoPuzzleApp').puzzleProgress;
      progress.save=()=>Promise.resolve(); // Preserve deliberately seeded historical fixture on pagehide.
      const {durableStore}=await import(base+'assets/js/durable-store.js');
      const scope={owner,activitySlug:'maps-freeplay',mode:'free'};
      const current=await durableStore.loadDraft(scope),state={...current.state,version:2};
      delete state.geometryRef;delete state.finishedResult;delete state.selections;delete state.view.zoom;
      await durableStore.checkpoint({...scope,attemptId:current.attemptId,contentVersion:'puzzle-v2',state},{queue:false});
    }""", {'base': server.base, 'owner': original['owner']})
    await page.reload(wait_until='domcontentloaded')
    restored = await ready(page)
    assert restored['attemptId'] == original['attemptId'] and restored['placed'] == 1
    assert restored['order'] == original['state']['order']
    migrated = await saved(page)
    assert migrated['contentVersion'] == 'puzzle-v3' and migrated['state']['version'] == 3 and migrated['state']['geometryRef']
    record['migration'] = {'from': 'puzzle-v2 without geometryRef/relative zoom', 'to': 'puzzle-v3 with immutable geometry', 'placementsPreserved': 1}


async def legacy_world(page, context, browser_name, server, record):
    """Play the historical localized filter, then restore its v2 draft in RU/EN."""
    handler = server.httpd.RequestHandlerClass
    original_get = handler.do_GET
    source = (ROOT / 'site/assets/js/puzzle-engine.js').read_text(encoding='utf-8')
    current_filter = 'if (mode === "world-countries" && ["ATA", "ATF"].includes(countryCode) && !retained.has(featureId(feature, index))) return;'
    legacy_filter = 'if (mode === "world-countries" && (countryCode === "ATA" || /antarct|антаркт/i.test(name))) return;'
    assert source.count(current_filter) == 1, 'Historical world-filter insertion marker changed'
    source = source.replace(current_filter, legacy_filter, 1)
    marker = '  function checkpoint() {'
    assert source.count(marker) == 1
    source = 'window.__qaLegacyWorldEngine=true;\n' + source.replace(marker, READ_ONLY_HOOK + '\n' + marker, 1)
    old_requests = []

    def legacy_get(request):
        if request.path.startswith('/RUDN/assets/js/puzzle-engine.js?') and 'qaLegacyWorld=1' in request.path:
            old_requests.append(request.path)
            body = source.encode('utf-8')
            request.send_response(200)
            request.send_header('Content-Type', 'text/javascript; charset=utf-8')
            request.send_header('Cache-Control', 'no-store')
            request.send_header('Content-Length', str(len(body)))
            request.end_headers()
            request.wfile.write(body)
        else:
            original_get(request)

    # The legacy engine has its own URL, so a real worker can cache both versions
    # without a test deleting production caches or altering the stored geometry.
    await context.add_init_script("""(() => {
      const descriptor=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,'src');
      Object.defineProperty(HTMLScriptElement.prototype,'src',{...descriptor,set(value){
        const url=new URL(value,location.href);
        if(url.pathname.endsWith('/puzzle-engine.js')&&!sessionStorage.getItem('qa.world.current'))url.searchParams.set('qaLegacyWorld','1');
        descriptor.set.call(this,url.href);
      }});
    })();""")
    handler.do_GET = legacy_get
    try:
        await page.goto(server.base + 'apps/puzzle.html?context=free&qaLocale=zh', wait_until='domcontentloaded')
        await ready(page)
        assert await page.evaluate('window.__qaLegacyWorldEngine===true'), 'Historical engine was not loaded'
        await page.locator('[data-puzzle-mode="world-countries"]').click()
        historical = await ready(page, {'mode': 'world-countries', 'selection': None})
        assert historical['total'] == 241, ('Historical Chinese world set changed', historical['total'])
        await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
        await trusted_drop(page)
        await trusted_drop(page)
        original = await saved(page)
        assert original['state']['placed'] == 2 and len(original['state']['featureIds']) == 241
        restores = []
        for locale in ('ru', 'en'):
            await page.evaluate("""async ({base,draft})=>{
              document.querySelector('#geoPuzzleApp').puzzleProgress.save=()=>Promise.resolve();
              sessionStorage.setItem('qa.world.current','true');
              const {durableStore}=await import(base+'assets/js/durable-store.js');
              const state={...draft.state,version:2};
              delete state.geometryRef;delete state.finishedResult;delete state.selections;delete state.view.zoom;
              await durableStore.checkpoint({owner:draft.owner,activitySlug:'maps-freeplay',mode:'free',
                attemptId:draft.attemptId,contentVersion:'puzzle-v2',state},{queue:false});
            }""", {'base': server.base, 'draft': original})
            await page.goto(server.base + 'apps/puzzle.html?context=free&qaLocale=' + locale, wait_until='domcontentloaded')
            restored = await ready(page)
            assert not await page.evaluate('window.__qaLegacyWorldEngine===true'), 'Restore used the historical engine'
            assert await page.evaluate('window.RUDNI18N.locale') == locale
            assert restored['attemptId'] == original['attemptId'] and restored['placed'] == 2 and restored['total'] == 241
            assert restored['order'] == original['state']['order'] and restored['featureIds'] == original['state']['featureIds']
            migrated = await saved(page)
            assert migrated['contentVersion'] == 'puzzle-v3' and migrated['state']['version'] == 3 and migrated['state']['geometryRef']
            await quiet(page)
            restores.append({'locale': locale, 'total': restored['total'], 'placed': restored['placed'], 'sameAttemptOrderAndIds': True})
        assert old_requests, 'The fixture did not serve a historical engine'
        record['legacyWorld'] = {'method': 'Actual UI game using historical localized name filter; its played draft downgraded to v2 without geometryRef before each current-code RU/EN restore',
                                 'originalLocale': 'zh', 'originalTotal': 241, 'placements': 2, 'restores': restores}
    finally:
        handler.do_GET = original_get


async def service_worker_update(page, context, browser_name, server, record, offline=False):
    await open_game(page, server)
    await trusted_drop(page)
    before = await saved(page)
    await page.wait_for_function('navigator.serviceWorker.controller', timeout=45000)
    handler = server.httpd.RequestHandlerClass
    original_get = handler.do_GET
    token = str(time.time_ns())
    updated_path = '/RUDN/service-worker.js?qa-resilience=' + token
    source = (ROOT / 'site/service-worker.js').read_text(encoding='utf-8')
    source, replacements = re.subn(r'(const CACHE=`[^`]+)(`;)', r'\1-qa-resilience-' + token + r'\2', source, count=1)
    assert replacements == 1, 'Service worker cache declaration changed'

    def updated_get(request):
        if request.path == updated_path:
            body = source.encode('utf-8')
            request.send_response(200)
            request.send_header('Content-Type', 'text/javascript; charset=utf-8')
            request.send_header('Content-Length', str(len(body)))
            request.end_headers()
            request.wfile.write(body)
        else:
            original_get(request)

    handler.do_GET = updated_get
    try:
        await page.evaluate("""async path=>{
          await navigator.serviceWorker.register(path,{scope:'/RUDN/',updateViaCache:'none'});
        }""", updated_path)
        await page.wait_for_function("token=>navigator.serviceWorker.controller?.scriptURL.includes(token)", arg=token, timeout=60000)
        current = await state(page)
        assert current['attemptId'] == before['attemptId'] and current['placed'] == 1
        await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
        await trusted_drop(page)
        await flush(page)
        if offline:
            await context.add_cookies([{'name': 'qa-puzzle-offline', 'value': '1', 'url': server.base}])
            # The live page remains bound to its old release, which correctly
            # rejects uncached resources. Probe the same browser-context cookie
            # through its HTTP client so the worker cannot manufacture failure.
            probe = await context.request.get(server.base + '__qa/update-offline-probe?nonce=' + token)
            outage = {'status': probe.status, 'body': await probe.text(), 'transport': 'Browser-context HTTP client, bypassing SW'}
            assert outage['status'] == 503 and 'Isolated QA network outage' in outage['body'], outage
            record['outageProbe'] = outage
            record['offlineSimulation'] = 'Verified fixture-server 503 outage immediately after worker activation, before first reload'
        response = await page.reload(wait_until='domcontentloaded')
        assert response.status == 200, ('Prepared puzzle shell was unavailable after worker update', response.status)
        after = await ready(page)
        assert after['attemptId'] == before['attemptId'] and after['placed'] == 2 and after['order'] == before['state']['order']
        record['upgrade'] = {'kind': 'Actual worker activation and cache revision replacement; same application asset version', 'progressAfterReload': 2, 'attemptPreserved': True}
    finally:
        if offline:
            await context.add_cookies([{'name': 'qa-puzzle-offline', 'value': '0', 'url': server.base}])
        handler.do_GET = original_get


async def worker_update_offline(*args):
    await service_worker_update(*args, offline=True)


async def worker_version_skew(page, context, browser_name, server, record):
    """Old worker has never cached standalone HTML; deployment supplies newer HTML."""
    await open_game(page, server)
    await trusted_drop(page)
    before = await saved(page)
    handler = server.httpd.RequestHandlerClass
    original_get = handler.do_GET
    token = str(time.time_ns())
    old_path = '/RUDN/service-worker.js?qa-old-release=' + token
    landing_path = '/RUDN/__qa/upgrade-landing.html'
    current_source = (ROOT / 'site/service-worker.js').read_text(encoding='utf-8')
    current_version = re.search(r'const CACHE=`\$\{CACHE_PREFIX\}v(\d+\.\d+\.\d+)', current_source).group(1)
    old_version = '1.3.5' if current_version != '1.3.5' else '1.3.4'
    old_source = current_source.replace(current_version, old_version)
    # Preserve the previous worker's missing optional shell even after the new
    # worker fixes its install list. Otherwise this upgrade regression vanishes.
    old_source, old_installs = re.subn(r'prepareResources\(\[\.\.\.CORE_SHELL,\s*\.\.\.PUZZLE_SHELL\],\{required:true\}\)',
                                     'prepareResources(CORE_SHELL,{required:true})', old_source, count=1)
    assert old_installs == 1, 'Prior-release fixture must explicitly exclude the puzzle shell'

    def skew_get(request):
        if request.path == old_path or request.path == landing_path:
            body = old_source.encode('utf-8') if request.path == old_path else b'<!doctype html><title>Isolated upgrade landing</title>'
            request.send_response(200)
            request.send_header('Content-Type', 'text/javascript; charset=utf-8' if request.path == old_path else 'text/html; charset=utf-8')
            request.send_header('Content-Length', str(len(body)))
            request.end_headers()
            request.wfile.write(body)
        else:
            original_get(request)

    handler.do_GET = skew_get
    try:
        await page.evaluate("""async()=>{
          for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();
          for(const name of await caches.keys())if(name.startsWith('rudn-gmu-pages:'))await caches.delete(name);
        }""")
        await page.goto(server.origin + landing_path, wait_until='domcontentloaded')
        await page.evaluate("""async path=>{
          await navigator.serviceWorker.register(path,{scope:'/RUDN/',updateViaCache:'none'});
          await navigator.serviceWorker.ready;
        }""", old_path)
        await page.wait_for_function("token=>navigator.serviceWorker.controller?.scriptURL.includes(token)", arg=token, timeout=45000)
        record['oldCaches'] = await page.evaluate('caches.keys()')
        assert any('v' + old_version + '-' in name for name in record['oldCaches']), 'Prior-release cache was not installed'
        assert not any('v' + current_version + '-' in name for name in record['oldCaches']), 'New release was already cached; upgrade test would be inconclusive'
        record['standaloneWasCached'] = await page.evaluate("async()=>Boolean(await caches.match(new URL('/RUDN/apps/puzzle.html',location.href).href))")
        assert not record['standaloneWasCached'], 'Standalone HTML was already cached by the simulated previous release'
        # Navigation is served by the old worker, and standalone HTML was not
        # part of CORE_SHELL. Versioned imports must recover through an update.
        await page.goto(server.base + 'apps/puzzle.html?context=free&qaLocale=ru', wait_until='domcontentloaded')
        after = await ready(page)
        assert after['attemptId'] == before['attemptId'] and after['placed'] == 1
        await page.wait_for_function("document.querySelector('#geoPuzzleApp').dataset.playAllowed==='true'")
        record['upgrade'] = {'kind': 'Real prior-version cache binding with new standalone HTML/import URLs',
                             'oldCacheVersion': old_version, 'newAssetVersion': current_version,
                             'progressPreserved': 1, 'attemptPreserved': True}
    finally:
        handler.do_GET = original_get


SCENARIOS = {'initial-failure': initial_failure, 'initial-hang': initial_hang,
             'replacement-failure': replacement_failure, 'storage-denied': storage_denied,
             'storage-quota': storage_quota, 'hidden-timer': hidden_timer,
             'profile-isolation': profile_isolation, 'old-schema': old_schema, 'legacy-world': legacy_world,
             'worker-update': service_worker_update, 'worker-version-skew': worker_version_skew,
             'worker-update-offline': worker_update_offline}


async def run(args, server):
    results = []
    async with async_playwright() as playwright:
        for browser_name in args.browsers.split(','):
            options = {'headless': True}
            if browser_name == 'firefox':
                options['firefox_user_prefs'] = {'network.proxy.type': 0}
            browser = await getattr(playwright, browser_name).launch(**options)
            try:
                for name in args.scenarios.split(','):
                    record = {'browser': browser_name, 'scenario': name, 'status': 'failed'}
                    started = time.monotonic()
                    context = await context_for(browser, server, args.output, (390, 844), 'ru', record)
                    page = await context.new_page()
                    page._qa_base = server.base
                    page._qa_locale = 'ru'
                    page.set_default_timeout(20000)
                    page.on('pageerror', lambda error, r=record: r.setdefault('pageErrors', []).append(str(error)))
                    async def dialog_seen(dialog, r=record):
                        r.setdefault('dialogs', []).append(dialog.message)
                        if r['scenario'] != 'replacement-failure':
                            await dialog.dismiss()
                    page.on('dialog', dialog_seen)
                    try:
                        await SCENARIOS[name](page, context, browser_name, server, record)
                        assert not record.get('pageErrors'), record.get('pageErrors')
                        if name != 'replacement-failure':
                            assert not record.get('dialogs'), ('Unexpected browser dialog', record['dialogs'])
                        record['status'] = 'passed'
                    except Exception as error:
                        record['error'], record['traceback'] = str(error), traceback.format_exc()
                        try:
                            path = args.output / 'resilience-failures' / f'{browser_name}-{name}.png'
                            path.parent.mkdir(parents=True, exist_ok=True)
                            await page.screenshot(path=str(path))
                            record['screenshot'], record['lastState'] = str(path), await page.evaluate('window.__puzzleRead?.()')
                        except Exception:
                            pass
                    finally:
                        await context.close()
                    record['seconds'] = round(time.monotonic() - started, 2)
                    results.append(record)
                    with (args.output / f'{args.report_stem}.jsonl').open('a', encoding='utf-8') as handle:
                        handle.write(json.dumps(record, ensure_ascii=False) + '\n')
                    print(f'{browser_name} {name}: {record["status"]} ({record["seconds"]}s) {record.get("error", "")[:200]}', flush=True)
            finally:
                await browser.close()
    report = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'expected': len(results), 'passed': sum(r['status'] == 'passed' for r in results),
              'failed': sum(r['status'] != 'passed' for r in results), 'results': results, 'physicalDevices': 'Not tested',
              'networkSimulation': 'Isolated fetch rejection/hang with AbortSignal and explicit online event; no physical disconnection claim',
              'webkitOfflineLimit': 'Native WebKit offline navigation has observed limitations on Windows and Linux; this suite labels its controlled fetch/server faults separately.'}
    write_json(args.output / f'{args.report_stem}.json', report)
    return 1 if report['failed'] else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--browsers', default='chromium,firefox,webkit')
    parser.add_argument('--scenarios', default=','.join(SCENARIOS))
    parser.add_argument('--port', type=int, default=0)
    args = parser.parse_args()
    args.output = args.output.resolve()
    if args.output.is_relative_to(ROOT):
        parser.error('Artifacts must be outside repository')
    if not set(args.browsers.split(',')) <= {'chromium', 'firefox', 'webkit'} or not set(args.scenarios.split(',')) <= set(SCENARIOS):
        parser.error('Unknown browser/scenario')
    args.output.mkdir(parents=True, exist_ok=True)
    args.report_stem = 'resilience-' + args.browsers.replace(',', '-')
    if args.scenarios != ','.join(SCENARIOS):
        args.report_stem += '-' + args.scenarios.replace(',', '-')
    (args.output / f'{args.report_stem}.jsonl').write_text('', encoding='utf-8')
    with PuzzleServer(args.output, args.port) as server:
        print('Isolated resilience server: ' + server.base, flush=True)
        return asyncio.run(run(args, server))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
