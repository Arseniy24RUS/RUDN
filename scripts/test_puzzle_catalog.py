#!/usr/bin/env python3
"""Data-driven complete-catalog puzzle browser regression suite.

Browser-plugin exploratory checks are run separately in the Codex task. This
repeatable matrix uses installed Playwright Chromium, Firefox and WebKit. It
serves the actual site and service worker under /RUDN/, with a loopback-only
synthetic identity and audited real geoBoundaries fixtures. No production writes.
The test-only engine getter exposes positions, never setters or completion APIs.
Every piece is placed through pointer events; representative flows additionally
use trusted browser mouse input. Missing maps and fixtures fail, never skip.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sys
import threading
import time
import traceback
from urllib.parse import urlsplit

from playwright.async_api import async_playwright
from prepare_puzzle_catalog import ROOT, build_catalog, read_json, write_json

VIEWPORTS = [(320, 568), (360, 800), (390, 844), (412, 915), (768, 1024), (1024, 1366), (1366, 768), (1920, 1080)]
LAYOUT_VIEWPORTS = VIEWPORTS + [(height, width) for width, height in VIEWPORTS[:4]]
LOCALES = ['ru', 'en', 'zh']
DIFFICULTIES = ['easy', 'medium', 'hard']
STUDENT = {'ticket': '990000001', 'studentKey': '990000001', 'email': '990000001@rudn.ru',
           'fullName': 'QA Puzzle Local', 'group': 'ГГУбд-01-26'}
LOCAL_FIXTURE = r"""
// Added only by the loopback regression HTTP server. Never published.
backend.init=async()=>{
 backend.authReady=true;backend.user=null;
 backend.profile=backend.migrateProfile(JSON.parse(localStorage.getItem('rudn.profile.v1')||'null'));
 backend.mode='local';backend.connected=false;backend.accessOverrides={};
 for(let year=2025;year<=2035;year++)backend.accessOverrides[year]={'topic-2':{state:'open'}};
 backend.emitStatus();return backend.status();
};
backend.getPuzzleLeaderboard=async()=>[];
"""
READ_ONLY_HOOK = r"""
  // Test-only, read-only geometry observation. No setters or solver exposed.
  window.__puzzleRead=()=>{
    const piece=currentPiece(),anchor=piece&&state.anchors[piece.index];
    const target=anchor?worldToScreen(anchor[0],anchor[1]):null;
    const source=piece?(piece.inTray?trayCenter():worldToScreen(anchor[0]+piece.dx,anchor[1]+piece.dy)):null;
    return {ready:state.ready,loading:state.loading,started:state.started,finished:state.finished,
      attemptId:state.attemptId,difficulty:state.difficulty,mode:state.mode,selection:state.selection,
      placed:state.placed,total:state.features.length,current:state.current,hints:state.hints,
      errors:state.errors,elapsedMs:elapsedMs(),source,target,view:{...state.view},
      inTray:piece?.inTray,featureIds:state.features.map(f=>f.properties._puzzleId),
      order:[...state.order],canvas:{width:state.cssWidth,height:state.cssHeight,mapBottom:state.mapBottom},
      tray:trayRect()};
  };
"""


class PuzzleServer:
    def __init__(self, output, port=0):
        self.output, self.port = output, port

    def __enter__(self):
        fixture_output = self.output
        class Handler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(ROOT / 'site'), **kwargs)

            def log_message(self, *_args):
                pass

            def end_headers(self):
                # Applies to both documents and service workers. No production
                # connection can escape Playwright routing through a worker.
                self.send_header('Content-Security-Policy', "connect-src 'self' data: blob:")
                super().end_headers()

            def copyfile(self, source, outputfile):
                try:
                    super().copyfile(source, outputfile)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass  # Browser intentionally cancelled during navigation.

            def do_GET(self):
                if re.search(r'(?:^|;\s*)qa-puzzle-offline=1(?:;|$)', self.headers.get('Cookie', '')):
                    body = b'Isolated QA network outage'
                    self.send_response(503);self.send_header('Content-Length', str(len(body)))
                    self.end_headers();self.wfile.write(body)
                    return
                if not self.path.startswith('/RUDN/'):
                    self.send_error(404)
                    return
                self.path = self.path[len('/RUDN'):]
                name = self.path.split('?')[0]
                fixture_match = re.fullmatch(r'/__qa/(metadata|geometry)/([A-Z]{3})\.json', name)
                if fixture_match:
                    kind, iso = fixture_match.groups()
                    path = fixture_output / 'fixtures' / f'{iso}.{"metadata.json" if kind == "metadata" else "geojson"}'
                    if not path.exists():
                        self.send_error(404, 'Missing audited fixture')
                        return
                    body = path.read_bytes()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers();self.wfile.write(body)
                elif name in ('/assets/js/backend.js', '/assets/js/puzzle-engine.js', '/assets/js/puzzle-bootstrap.js'):
                    source = (ROOT / 'site' / name.lstrip('/')).read_text(encoding='utf-8')
                    if name.endswith('/backend.js'):
                        source += LOCAL_FIXTURE
                    elif name.endswith('/puzzle-engine.js'):
                        marker = '  function checkpoint() {'
                        if source.count(marker) != 1:
                            self.send_error(500, 'Read-only test hook insertion marker changed')
                            return
                        source = source.replace(marker, READ_ONLY_HOOK + '\n' + marker, 1)
                    else:
                        marker = 'const nativeFetch=previousFetch.bind(window);'
                        replacement = r"""const nativeFetch=(input,options)=>{
 const url=typeof input==='string'?input:input.url;
 const api=url.match(/geoboundaries\.org\/api\/current\/gbOpen\/([A-Z]{3})\/ADM1\//);
 const geometry=url.match(/\/gbOpen\/([A-Z]{3})\/ADM1\/.*\.(?:geojson|json)(?:\?|$)/);
 return previousFetch.call(window,api?`/RUDN/__qa/metadata/${api[1]}.json`:geometry?`/RUDN/__qa/geometry/${geometry[1]}.json`:input,options);
};"""
                        if source.count(marker) != 1:
                            self.send_error(500, 'Fixture transport marker changed')
                            return
                        source = source.replace(marker, replacement, 1)
                    body = source.encode('utf-8')
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/javascript; charset=utf-8')
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                else:
                    super().do_GET()

        self.httpd = ThreadingHTTPServer(('127.0.0.1', self.port), Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f'http://127.0.0.1:{self.httpd.server_port}'
        self.base = self.origin + '/RUDN/'
        return self

    def __exit__(self, *_args):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)


def initializer(locale):
    return """(() => {
      if(location.hostname!=='127.0.0.1')return;
      if(!localStorage.getItem('qa.puzzle.initialized')) {
        localStorage.setItem('rudn.profile.v1',JSON.stringify(%s));
        localStorage.setItem('qa.puzzle.initialized','true');
      }
      localStorage.setItem('rudn.locale',new URL(location.href).searchParams.get('qaLocale')||localStorage.getItem('rudn.locale')||%s);
    })()""" % (json.dumps(STUDENT, ensure_ascii=False), json.dumps(locale))


async def context_for(browser, server, output, viewport, locale, record):
    context = await browser.new_context(viewport={'width': viewport[0], 'height': viewport[1]},
                                        locale={'ru': 'ru-RU', 'en': 'en-GB', 'zh': 'zh-CN'}[locale],
                                        service_workers='allow', reduced_motion='reduce', has_touch=viewport[0] <= 768)
    await context.add_init_script(initializer(locale))

    async def route(request_route):
        request = request_route.request
        url = request.url
        if url.startswith(server.origin + '/') or url.startswith(('data:', 'blob:')):
            await request_route.continue_()
            return
        if request.method != 'GET':
            record.setdefault('unexpectedWrites', []).append({'url': url, 'method': request.method})
            await request_route.abort('blockedbyclient')
            return
        api = re.search(r'geoboundaries\.org/api/current/gbOpen/([A-Z]{3})/ADM1/?', url)
        geometry = re.search(r'/gbOpen/([A-Z]{3})/ADM1/.*\.(?:geojson|json)(?:\?|$)', url)
        if api or geometry:
            iso = (api or geometry).group(1)
            fixture = output / 'fixtures' / f'{iso}.{"metadata.json" if api else "geojson"}'
            if fixture.exists():
                await request_route.fulfill(path=str(fixture), content_type='application/json',
                                            headers={'Access-Control-Allow-Origin': '*'})
                return
            record.setdefault('missingFixtures', []).append(str(fixture))
        record.setdefault('blockedRequests', []).append(url)
        await request_route.abort('blockedbyclient')

    # The fixture server rewrites only public catalog transport and applies CSP
    # to documents AND workers. Global Playwright request interception disables
    # reliable service-worker offline navigation in Firefox/WebKit; do not add it.
    return context


def observe(page, record):
    page.set_default_timeout(20000)
    for event, handler in getattr(page, '_qa_observers', []):
        page.remove_listener(event, handler)
    page._qa_observers = [
        ('pageerror', lambda error: record.setdefault('pageErrors', []).append(str(error))),
        ('console', lambda message: record.setdefault('consoleErrors', []).append(message.text) if message.type == 'error' else None),
        ('dialog', lambda dialog: asyncio.create_task(dialog.accept())),
    ]
    for event, handler in page._qa_observers:
        page.on(event, handler)


async def ready(page, entry=None):
    await page.wait_for_function('window.__puzzleRead && window.__puzzleRead().ready && !window.__puzzleRead().loading', timeout=45000)
    if entry:
        await page.wait_for_function("entry=>{const s=window.__puzzleRead();return s.ready&&!s.loading&&s.mode===entry.mode&&(s.selection??null)===(entry.selection??null)}", arg=entry, timeout=45000)
    return await page.evaluate('window.__puzzleRead()')


async def start_map(page, entry, difficulty):
    target_url = page._qa_base + 'apps/puzzle.html?context=free&qaLocale=' + page._qa_locale
    if page.url != target_url:
        await page.goto(target_url, wait_until='domcontentloaded')
    await page.locator('[data-puzzle-difficulty]').first.wait_for()
    await page.wait_for_function('window.__puzzleRead')
    initial = await ready(page)
    if initial['finished'] or initial['placed'] == initial['total']:
        await page.locator('#puzzleResultDialog[open]').wait_for()
        await page.locator('#puzzlePlayAgain').click()
        await page.wait_for_function("()=>{const s=window.__puzzleRead();return s.ready&&!s.loading&&!s.finished&&s.placed===0}")
    button = page.locator(f'[data-puzzle-difficulty="{difficulty}"]')
    if await button.count():
        await button.click()
    else:
        await page.locator('#puzzleDifficulty').select_option(difficulty, force=True)
    card = page.locator(f'[data-puzzle-mode="{entry["mode"]}"]')
    await card.first.click()
    if entry['selection'] is not None:
        selector = '#puzzleSubject' if entry['mode'] == 'russia-municipalities' else '#puzzleCountry'
        await page.wait_for_function("s=>[...document.querySelector(s.selector).options].some(o=>o.value===s.value)",
                                     arg={'selector': selector, 'value': entry['selection']})
        await page.locator(selector).select_option(entry['selection'])
    state = await ready(page, entry)
    assert state['difficulty'] == difficulty, (difficulty, state['difficulty'])
    await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
    return state


async def flush(page):
    await page.evaluate("async base=>{await document.querySelector('#geoPuzzleApp').puzzleProgress?.capture?.();await (await import(base+'assets/js/durable-store.js')).durableStore.flush()}", page._qa_base)


async def place_pieces(page, count, pointer_type='mouse'):
    return await page.evaluate(r"""async ({count,pointerType})=>{
      const c=document.querySelector('#puzzleCanvas');let actual=0,maxFrame=0;
      for(let i=0;i<count;i++){
        const s=window.__puzzleRead();if(s.finished)break;
        if(!s.ready||!s.source||!s.target)throw new Error('Map not playable');
        const r=c.getBoundingClientRect();
        const dispatch=(type,p,buttons)=>c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,
          pointerId:7,pointerType,isPrimary:true,button:0,buttons,clientX:r.left+p.x,clientY:r.top+p.y}));
        dispatch('pointerdown',s.source,1);
        dispatch('pointermove',{x:s.target.x,y:Math.min(s.target.y,s.tray.y-12)},1);
        dispatch('pointermove',s.target,1);
        dispatch('pointerup',s.target,0);
        const after=window.__puzzleRead();
        if(after.placed!==s.placed+1)throw new Error(`Piece ${s.current} failed: ${s.placed}->${after.placed} target=${JSON.stringify(s.target)} source=${JSON.stringify(s.source)}`);
        actual++;
        const t=performance.now();await new Promise(requestAnimationFrame);maxFrame=Math.max(maxFrame,performance.now()-t);
      }
      return {actual,maxFrame,state:window.__puzzleRead()};
    }""", {'count': count, 'pointerType': pointer_type})


async def trusted_drop(page):
    state = await page.evaluate('window.__puzzleRead()')
    box = await page.locator('#puzzleCanvas').bounding_box()
    source, target = state['source'], state['target']
    await page.mouse.move(box['x'] + source['x'], box['y'] + source['y'])
    await page.mouse.down()
    await page.mouse.move(box['x'] + target['x'], box['y'] + min(target['y'], state['tray']['y'] - 12), steps=3)
    await page.mouse.move(box['x'] + target['x'], box['y'] + target['y'])
    await page.mouse.up()
    after = await page.evaluate('window.__puzzleRead()')
    assert after['placed'] == state['placed'] + 1, ('Trusted mouse drop failed', state, after)


async def check_layout(page, record, label):
    # Wait for ResizeObserver + debounced projection rebuild, not an arbitrary
    # sleep that races Firefox/WebKit under a concurrent full-catalog workload.
    await page.wait_for_function("""()=>{const c=document.querySelector('#puzzleCanvas'),s=window.__puzzleRead?.();if(!c||!s)return false;
      const r=c.getBoundingClientRect();return Math.abs(r.width-s.canvas.width)<=2&&Math.abs(r.height-s.canvas.height)<=2;}""", timeout=8000)
    metrics = await page.evaluate("""()=>{
      const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,client:el.clientWidth,scroll:el.scrollWidth}};
      const c=document.querySelector('#puzzleCanvas'),stage=c.closest('.puzzle-stage-card');
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,canvas:box(c),stage:box(stage),
        difficulty:[...document.querySelectorAll('[data-puzzle-difficulty]')].map(box),
        fullscreen:Boolean(document.fullscreenElement||stage.classList.contains('is-puzzle-fullscreen')||document.body.classList.contains('puzzle-fullscreen-active')),
        dialogs:[...document.querySelectorAll('dialog[open]')].map(box),state:window.__puzzleRead()};
    }""")
    record.setdefault('layout', []).append({'label': label, **metrics})
    assert metrics['scrollWidth'] <= metrics['width'] + 1, ('Horizontal page overflow', label, metrics)
    assert metrics['canvas']['width'] > 100 and metrics['canvas']['height'] > 100, ('Canvas unusable', metrics)
    assert abs(metrics['canvas']['width'] - metrics['state']['canvas']['width']) <= 2, ('Canvas coordinate mismatch', metrics)
    assert abs(metrics['canvas']['height'] - metrics['state']['canvas']['height']) <= 2, ('Canvas coordinate mismatch', metrics)
    for box in metrics['difficulty']:
        assert box['width'] >= 44 and box['height'] >= 40, ('Difficulty touch target too small', box)
    for box in metrics['dialogs']:
        assert box['left'] >= -1 and box['right'] <= metrics['width'] + 1, ('Dialog clipped', box)
        assert box['top'] >= -1 and box['bottom'] <= metrics['height'] + 1, ('Dialog vertically clipped', box)
    if metrics['fullscreen']:
        assert metrics['stage']['top'] >= -1 and metrics['stage']['bottom'] <= metrics['height'] + 1, ('Fullscreen stage clipped', metrics)
        assert metrics['canvas']['bottom'] <= metrics['height'] + 1, ('Fullscreen canvas clipped', metrics)
    return metrics


async def offline_resume(page, context, before, record, mode='browser'):
    await flush(page)
    await page.wait_for_function("'serviceWorker' in navigator && navigator.serviceWorker.controller", timeout=25000)
    record['offlineCache'] = await page.evaluate("""async()=>({controller:navigator.serviceWorker.controller?.scriptURL,
      html:Boolean(await caches.match(new URL('puzzle.html',location.href).href)),
      cachedUrls:await Promise.all((await caches.keys()).map(async name=>({name,html:(await (await caches.open(name)).keys()).filter(request=>request.url.includes('puzzle.html')).map(request=>request.url)})))})""")
    record['offlineSimulation'] = mode
    if mode == 'server-outage':
        await context.add_cookies([{'name': 'qa-puzzle-offline', 'value': '1', 'url': page._qa_base}])
    else:
        await context.set_offline(True)
    await page.reload(wait_until='domcontentloaded')
    restored = await ready(page)
    assert restored['attemptId'] == before['attemptId'], ('Offline restore changed attempt', before, restored)
    assert restored['placed'] == before['placed'], ('Offline restore lost pieces', before, restored)
    assert restored['order'] == before['order'], 'Offline restore changed piece order'
    assert restored['hints'] == before['hints'], 'Offline restore reset hints'
    record['offlineResume'] = True
    return restored


async def completion_case(browser, server, args, entry, difficulty, index, shared_context=None):
    viewport = VIEWPORTS[index % len(VIEWPORTS)]
    locale = LOCALES[index % len(LOCALES)]
    record = {'suite': 'completion', 'id': entry['id'], 'difficulty': difficulty,
              'viewport': viewport, 'locale': locale, 'status': 'failed'}
    started = time.monotonic()
    context = shared_context or await context_for(browser, server, args.output, viewport, locale, record)
    await context.set_offline(False)
    await context.add_cookies([{'name': 'qa-puzzle-offline', 'value': '0', 'url': server.base}])
    page = context.pages[0] if context.pages else await context.new_page()
    page._qa_base = server.base;page._qa_locale = locale;observe(page, record)
    await page.set_viewport_size({'width': viewport[0], 'height': viewport[1]})
    try:
        state = await start_map(page, entry, difficulty)
        record['loadSeconds'] = round(time.monotonic() - started, 3)
        record['features'] = state['total']
        await page.locator('#puzzleHint').click()
        hinted = await page.evaluate('window.__puzzleRead()')
        assert hinted['hints'] == 1, ('Hint was not counted', hinted)
        await page.locator('#puzzleReturn').click()
        record['hintAndReturn'] = True
        first_count = max(0, min(state['total'] - 1, state['total'] // 2))
        first = await place_pieces(page, first_count, 'touch' if viewport[0] <= 768 else 'mouse')
        record['firstHalfSeconds'] = round(time.monotonic() - started - record['loadSeconds'], 3)
        before = first['state']
        if not args.no_offline:
            offline_mode = args.offline_mode
            if offline_mode == 'auto':
                offline_mode = 'server-outage' if sys.platform == 'win32' and args.browser_name == 'webkit' else 'browser'
            await offline_resume(page, context, before, record, offline_mode)
        record['resumeAtSeconds'] = round(time.monotonic() - started, 3)
        final = await place_pieces(page, state['total'] - first_count, 'touch' if viewport[0] <= 768 else 'mouse')
        record['inputDoneAtSeconds'] = round(time.monotonic() - started, 3)
        await page.locator('#puzzleResultDialog[open]').wait_for()
        await flush(page)
        record['inputPieces'] = first['actual'] + final['actual']
        assert record['inputPieces'] == state['total'], ('Not every piece placed', record)
        assert final['state']['placed'] == state['total'] and final['state']['finished']
        record['maxFrameWaitMs'] = round(max(first['maxFrame'], final['maxFrame']), 2)
        assert await page.locator('#puzzleResultErrors').count() == 0, 'Errors remain in result dialog'
        await check_layout(page, record, 'completed')
        assert not record.get('pageErrors'), record.get('pageErrors')
        assert not record.get('unexpectedWrites'), record.get('unexpectedWrites')
        assert not record.get('missingFixtures'), record.get('missingFixtures')
        record['status'] = 'passed'
        if args.screenshots == 'all' or entry['id'] in ('russia-subjects', 'world-countries', 'adm1-MCO'):
            path = args.output / 'screenshots' / f'{args.browser_name}-{entry["id"]}-{difficulty}-{locale}.png'
            path.parent.mkdir(parents=True, exist_ok=True)
            await page.screenshot(path=str(path))
            record['screenshot'] = str(path)
    except Exception as error:
        record['error'] = str(error)
        record['traceback'] = traceback.format_exc()
        path = args.output / 'failures' / f'{args.browser_name}-{entry["id"]}-{difficulty}.png'
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            await page.screenshot(path=str(path));record['screenshot'] = str(path)
            record['lastState'] = await page.evaluate('window.__puzzleRead?.()')
        except Exception:
            pass
    finally:
        record['seconds'] = round(time.monotonic() - started, 3)
        if not shared_context:
            await context.close()
    return record


async def layout_case(browser, server, args, entry, index, shared_context=None):
    record = {'suite': 'layout', 'id': entry['id'], 'status': 'failed'}
    context = shared_context or await context_for(browser, server, args.output, VIEWPORTS[0], 'ru', record)
    await context.set_offline(False)
    await context.add_cookies([{'name': 'qa-puzzle-offline', 'value': '0', 'url': server.base}])
    page = context.pages[0] if context.pages else await context.new_page()
    page._qa_base = server.base;page._qa_locale = 'ru';observe(page, record)
    started = time.monotonic()
    try:
        await start_map(page, entry, 'medium')
        for viewport_index, viewport in enumerate(LAYOUT_VIEWPORTS):
            await page.set_viewport_size({'width': viewport[0], 'height': viewport[1]})
            await page.wait_for_timeout(160)
            await check_layout(page, record, f'{viewport[0]}x{viewport[1]}')
        record['viewportCount'] = len(LAYOUT_VIEWPORTS)
        assert not record.get('pageErrors'), record.get('pageErrors')
        record['status'] = 'passed'
    except Exception as error:
        record['error'] = str(error);record['traceback'] = traceback.format_exc()
    finally:
        record['seconds'] = round(time.monotonic() - started, 3)
        if not shared_context:
            await context.close()
    return record


async def run(args, server):
    maps = build_catalog()
    if args.maps:
        selected = set(args.maps.split(','))
        missing = selected - {item['id'] for item in maps}
        if missing:
            raise ValueError(f'Unknown map IDs: {sorted(missing)}')
        maps = [entry for entry in maps if entry['id'] in selected]
    shard_index, shard_count = map(int, args.shard.split('/'))
    if not 1 <= shard_index <= shard_count:
        raise ValueError('--shard must be 1-based INDEX/COUNT')
    maps = [entry for index, entry in enumerate(maps) if index % shard_count == shard_index - 1]
    args.output.mkdir(parents=True, exist_ok=True)
    all_results = []
    async with async_playwright() as playwright:
        for browser_name in args.browsers.split(','):
            args.browser_name = browser_name
            launch_options = {'headless': True}
            if browser_name == 'firefox':
                launch_options['firefox_user_prefs'] = {'network.proxy.type': 0}
            browser = await getattr(playwright, browser_name).launch(**launch_options)
            prefix = f'{args.suite}-{browser_name}-{shard_index}-of-{shard_count}'
            jsonl = args.output / (prefix + '.jsonl')
            jsonl.write_text('', encoding='utf-8')
            tasks = []
            if args.suite in ('completion', 'all'):
                tasks.extend(('completion', entry, difficulty, index * 3 + DIFFICULTIES.index(difficulty))
                             for difficulty in args.difficulties.split(',') for index, entry in enumerate(maps))
            if args.suite in ('layout', 'all'):
                tasks.extend(('layout', entry, None, index) for index, entry in enumerate(maps))
            queue = asyncio.Queue()
            for task in tasks:
                queue.put_nowait(task)
            results = []

            async def worker():
                shared_record = {}
                context = await context_for(browser, server, args.output, VIEWPORTS[0], 'ru', shared_record)
                while not queue.empty():
                    suite, entry, difficulty, index = queue.get_nowait()
                    record = await (completion_case(browser, server, args, entry, difficulty, index, context) if suite == 'completion'
                                    else layout_case(browser, server, args, entry, index, context))
                    for key in ('unexpectedWrites', 'missingFixtures'):
                        if shared_record.get(key):
                            record[key] = shared_record.pop(key)
                            record['status'] = 'failed'
                    record['browser'] = browser_name
                    results.append(record)
                    with jsonl.open('a', encoding='utf-8') as handle:
                        handle.write(json.dumps(record, ensure_ascii=False, separators=(',', ':')) + '\n')
                    print(f'{browser_name} {len(results)}/{len(tasks)} {suite} {entry["id"]} {difficulty or ""} {record["status"]} {record["seconds"]}s {record.get("error", "")[:220]}', flush=True)
                    queue.task_done()
                    if record['status'] != 'passed':
                        # A failed map must not contaminate later coverage via a
                        # partially completed draft, modal, or offline context.
                        await context.close()
                        context = await context_for(browser, server, args.output, VIEWPORTS[0], 'ru', shared_record)
                await context.close()

            try:
                await asyncio.gather(*(worker() for _ in range(args.workers)))
            finally:
                await browser.close()
            report = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'browser': browser_name,
                      'suite': args.suite, 'shard': args.shard, 'partial': bool(args.maps) or shard_count > 1,
                      'expected': len(tasks), 'passed': sum(item['status'] == 'passed' for item in results),
                      'failed': sum(item['status'] != 'passed' for item in results), 'results': results,
                      'method': 'Read-only geometry getter; per-piece canvas PointerEvents, not state mutation',
                      'viewports': VIEWPORTS, 'layoutViewports': LAYOUT_VIEWPORTS,
                      'locales': LOCALES, 'offlineReload': not args.no_offline}
            write_json(args.output / (prefix + '.json'), report)
            all_results.extend(results)
    return 1 if any(record['status'] != 'passed' for record in all_results) else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--suite', choices=('completion', 'layout', 'all'), default='all')
    parser.add_argument('--browsers', default='chromium,firefox,webkit')
    parser.add_argument('--difficulties', default='easy,medium,hard')
    parser.add_argument('--maps', help='Comma-separated IDs; partial run is labelled explicitly')
    parser.add_argument('--shard', default='1/1')
    parser.add_argument('--workers', type=int, default=2)
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--serve', action='store_true', help='Only run the loopback fixture server')
    parser.add_argument('--no-offline', action='store_true', help='Development only; report marks absent offline coverage')
    parser.add_argument('--offline-mode', choices=('auto', 'browser', 'server-outage'), default='auto',
                        help='Windows WebKit cannot reload offline even a minimal SW; auto uses server outage there, native offline elsewhere')
    parser.add_argument('--screenshots', choices=('representative', 'all'), default='representative')
    args = parser.parse_args()
    args.output = args.output.resolve()
    if args.output.is_relative_to(ROOT):
        parser.error('Artifacts must be outside repository')
    if not set(args.browsers.split(',')) <= {'chromium', 'firefox', 'webkit'}:
        parser.error('Unknown browser')
    if not set(args.difficulties.split(',')) <= set(DIFFICULTIES):
        parser.error('Unknown difficulty')
    if not 1 <= args.workers <= 8:
        parser.error('Workers must be 1..8')
    with PuzzleServer(args.output, args.port) as server:
        print('Puzzle fixture server: ' + server.base, flush=True)
        if args.serve:
            try:
                while True:
                    time.sleep(30)
            except KeyboardInterrupt:
                return 0
        return asyncio.run(run(args, server))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
