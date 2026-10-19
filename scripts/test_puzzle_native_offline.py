#!/usr/bin/env python3
"""Actual platform #puzzle offline reload, with DOM-only game observations.

This loopback server serves the real application and service worker. Only the
backend's remote account/leaderboard initialization is replaced by the existing
local guest fixture. CSP and read-only browser/server guards prevent external
writes. No engine hooks, synthetic geometry or browser HTTP routing are used.

The Browser plugin covers exploratory UI separately; this repeatable regression
uses Playwright's actual browser-offline switch. Firefox rejects no-store fetches
in that state even when a controlling service worker has cached their responses.
--main-source serves a frozen pre-fix main.js for an honest failing baseline.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import platform
import subprocess
import threading
import traceback
from urllib.parse import urlsplit

from playwright.async_api import async_playwright
from test_puzzle_catalog import LOCAL_FIXTURE

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
READ_METHODS = {'GET', 'HEAD', 'OPTIONS'}
CACHED_PATHS = [
    'index.html', 'apps/puzzle.html', 'data/course.json', 'data/questions.json',
    'data/seminar5_variants.json', 'data/exam_questions.json',
    'data/question_media.json', 'data/symbol_manifest.json',
]
FETCH_PATHS = {'/RUDN/' + path for path in CACHED_PATHS if path != 'index.html'}
REQUIRED_PATHS = FETCH_PATHS | {'/RUDN/index.html'}
GUARD = r"""(() => {
  const allowed = new Set(['GET', 'HEAD', 'OPTIONS']);
  const record = kind => { void window.__qaBlockedWrite(kind); };
  const originalFetch = window.fetch;
  window.fetch = function(input, options) {
    const method=String(options?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if(!allowed.has(method)) { record('fetch'); return Promise.reject(new DOMException('Read-only QA','SecurityError')); }
    return originalFetch.apply(this,arguments);
  };
  const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
  const methods=new WeakMap();
  XMLHttpRequest.prototype.open=function(method){methods.set(this,String(method).toUpperCase());return open.apply(this,arguments);};
  XMLHttpRequest.prototype.send=function(){if(!allowed.has(methods.get(this)||'GET')){record('xhr');throw new DOMException('Read-only QA','SecurityError');}return send.apply(this,arguments);};
  navigator.sendBeacon=function(){record('beacon');return false;};
  document.addEventListener('submit',event=>{if(!allowed.has(String(event.target.method||'GET').toUpperCase())){event.preventDefault();event.stopImmediatePropagation();record('form');}},true);
  localStorage.setItem('rudn.locale','ru');
})();"""
MAPS_SELECTOR = '[data-game="maps"] a'
INPUT_TRACE_LIMIT = 128
INPUT_OBSERVER = r"""(() => {
  const selector='[data-game="maps"] a',events=[],errors=[];
  window.__qaNativeInput={events,errors,dropped:0};
  const describe=node=>node instanceof Element?{tag:node.tagName,id:node.id.slice(0,80),
    classes:String(node.className||'').slice(0,120)}:null;
  const record=event=>{
    try{
      const anchor=document.querySelector(selector),pointer=['pointerdown','pointerup','click'].includes(event.type);
      if(pointer&&!anchor)return;
      if(events.length>=64){window.__qaNativeInput.dropped++;return;}
      const r=anchor?.getBoundingClientRect(),x=r&&r.left+r.width/2,y=r&&r.top+r.height/2;
      const row={type:event.type,trusted:event.isTrusted,at:performance.now(),timeOrigin:performance.timeOrigin,
        url:location.href.slice(0,512),hash:location.hash,readyState:document.readyState,
        visibility:document.visibilityState,appBusy:document.querySelector('#app')?.getAttribute('aria-busy'),
        target:describe(event.target),matchesAnchor:event.target instanceof Node&&!!anchor?.contains(event.target),
        scroll:{x:scrollX,y:scrollY},rect:r&&{left:r.left,top:r.top,width:r.width,height:r.height},
        centerHit:r?describe(document.elementFromPoint(x,y)):null,
        pointer:pointer?{x:event.clientX,y:event.clientY,button:event.button,pointerType:event.pointerType||null}:null,
        persisted:typeof event.persisted==='boolean'?event.persisted:null};
      events.push(row);
      Promise.resolve(window.__qaNativeInputEvent(row)).catch(error=>{
        if(errors.length<8)errors.push({type:event.type,name:error?.name||'Error'});
      });
    }catch(error){if(errors.length<8)errors.push({type:event.type,name:error?.name||'Error'});}
  };
  for(const type of ['pointerdown','pointerup','click','DOMContentLoaded','visibilitychange'])
    document.addEventListener(type,record,{capture:true,passive:true});
  for(const type of ['hashchange','pageshow','pagehide','beforeunload'])
    window.addEventListener(type,record,{capture:true,passive:true});
})();"""
FAILURE_STATE = r"""() => {
  const anchor=document.querySelector('[data-game="maps"] a'),r=anchor?.getBoundingClientRect();
  const hit=r&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  const describe=node=>node instanceof Element?{tag:node.tagName,id:node.id.slice(0,80),
    classes:String(node.className||'').slice(0,120)}:null;
  return {url:location.href,hash:location.hash,visibility:document.visibilityState,focus:document.hasFocus(),
    readyState:document.readyState,controller:!!navigator.serviceWorker.controller,online:navigator.onLine,
    root:!!document.querySelector('#geoPuzzleApp'),appBusy:document.querySelector('#app')?.getAttribute('aria-busy'),
    appText:document.querySelector('#app')?.textContent.slice(0,1000),scroll:{x:scrollX,y:scrollY},
    activeNav:[...document.querySelectorAll('[data-route].active,[data-route][aria-current]')].slice(0,12)
      .map(node=>({route:node.dataset.route,href:node.getAttribute('href'),current:node.getAttribute('aria-current')})),
    anchor:anchor?{href:anchor.getAttribute('href'),connected:anchor.isConnected,inert:!!anchor.closest('[inert]'),
      rect:{left:r.left,top:r.top,width:r.width,height:r.height},centerHit:describe(hit),centerClear:!!hit&&anchor.contains(hit)}:null,
    inputObserver:window.__qaNativeInput||null};
}"""


def append_input_trace(report, row, phase, generation):
    trace = report.setdefault('inputTrace', [])
    if len(trace) < INPUT_TRACE_LIMIT:
        trace.append({**row, 'observedPhase': phase, 'observedGeneration': generation,
                      'observedStage': report.get('stage')})
    else:
        report['inputTraceDropped'] = report.get('inputTraceDropped', 0) + 1


async def prepare_maps_click(page, timeout=20000):
    """Settle normal scrolling before the existing single native click."""
    deadline = asyncio.get_running_loop().time() + timeout / 1000

    def remaining():
        milliseconds = int((deadline - asyncio.get_running_loop().time()) * 1000)
        if milliseconds <= 0:
            raise TimeoutError('Maps input precondition deadline exceeded')
        return milliseconds

    await page.wait_for_function("""selector=>{
      const app=document.querySelector('#app'),anchor=document.querySelector(selector);
      return app?.getAttribute('aria-busy')==='false'&&anchor?.isConnected&&!anchor.closest('[inert]')
        &&anchor.getAttribute('aria-disabled')!=='true';
    }""", arg=MAPS_SELECTOR, timeout=remaining())
    # Preserve the page's scrolling behaviour; no forced CSS, focus or synthetic input.
    await asyncio.wait_for(page.locator(MAPS_SELECTOR).evaluate("""anchor=>{
      delete window.__qaNativeInputStability;
      anchor.scrollIntoView({block:'center',inline:'nearest'});
    }"""), timeout=remaining() / 1000)
    await page.wait_for_function("""selector=>{
      const anchor=document.querySelector(selector),r=anchor?.getBoundingClientRect();
      if(!r||!anchor.isConnected)return false;
      const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
      const clear=document.querySelector('#app')?.getAttribute('aria-busy')==='false'
        &&!anchor.closest('[inert]')&&anchor.getAttribute('aria-disabled')!=='true'
        &&r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight
        &&hit&&anchor.contains(hit);
      const sample=[r.left,r.top,r.width,r.height,scrollX,scrollY],now=performance.now();
      const previous=window.__qaNativeInputStability;
      if(!clear||!previous||previous.anchor!==anchor||sample.some((v,i)=>Math.abs(v-previous.sample[i])>.5)){
        window.__qaNativeInputStability={anchor,sample,at:now};return false;
      }
      return now-previous.at>=120;
    }""", arg=MAPS_SELECTOR, timeout=remaining(), polling='raf')


async def capture_failure(page, report, error, screenshot, timeout=2):
    """A crashed page/observer must never replace the original scenario error."""
    report['failure'] = str(error)
    report['failureType'] = type(error).__name__
    report['traceback'] = ''.join(traceback.format_exception(type(error), error, error.__traceback__))
    report['failedStage'] = report.get('stage')
    for name, operation in [('dom', lambda: page.evaluate(FAILURE_STATE)),
                            ('screenshot', lambda: page.screenshot(path=str(screenshot), timeout=timeout * 1000))]:
        try:
            result = await asyncio.wait_for(operation(), timeout=timeout)
            if name == 'dom':
                report['dom'] = result
            else:
                report['failureScreenshot'] = str(screenshot)
        except Exception as capture_error:
            report.setdefault('captureErrors', []).append({'operation': name, 'type': type(capture_error).__name__,
                                                           'error': str(capture_error)[:500]})


async def check_observer_failures():
    """Pure controls: no browser, server, screenshots or filesystem writes."""
    class FakePage:
        def __init__(self, failure=None):
            self.failure, self.calls = failure, []

        async def operation(self, name):
            self.calls.append(name)
            if self.failure == 'pending':
                await asyncio.Future()
            if self.failure == 'throw':
                raise RuntimeError('Observer unavailable')
            return {'hash': '#games'} if name == 'dom' else b''

        async def evaluate(self, _script):
            return await self.operation('dom')

        async def screenshot(self, **_options):
            return await self.operation('screenshot')

    for failure in [None, 'throw', 'pending']:
        page, report = FakePage(failure), {'stage': 'world-ready'}
        try:
            raise AssertionError('Original readiness failure')
        except AssertionError as error:
            await capture_failure(page, report, error, 'unused.png', timeout=.02)
        assert report['failure'] == 'Original readiness failure'
        assert 'AssertionError: Original readiness failure' in report['traceback']
        assert report['failedStage'] == 'world-ready' and page.calls == ['dom', 'screenshot']
        if failure:
            assert len(report['captureErrors']) == 2 and 'failureScreenshot' not in report and 'dom' not in report
        else:
            assert report['dom'] == {'hash': '#games'} and report['failureScreenshot'] == 'unused.png'
    report = {'stage': 'maps-native-click'}
    for index in range(INPUT_TRACE_LIMIT + 3):
        append_input_trace(report, {'index': index, 'trusted': True}, 'online-initial-document', 1)
    assert len(report['inputTrace']) == INPUT_TRACE_LIMIT and report['inputTraceDropped'] == 3
    assert report['inputTrace'][0]['observedStage'] == 'maps-native-click'
    assert report['inputTrace'][0]['index'] == 0 and report['inputTrace'][-1]['index'] == INPUT_TRACE_LIMIT - 1
    return {'failureCaptureCases': 3, 'boundedTraceCases': 1}


def sha256(value):
    return hashlib.sha256(value).hexdigest()


class NativeServer:
    def __init__(self, main_source=None):
        self.main_bytes = (main_source or SITE / 'assets/js/main.js').read_bytes()
        self.write_requests = []

    def __enter__(self):
        owner = self

        class Handler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(SITE), **kwargs)

            def log_message(self, *_args):
                pass

            def end_headers(self):
                # Applies to the document and service workers. Remote account
                # transports cannot escape through an unobserved worker.
                self.send_header('Content-Security-Policy', "connect-src 'self' data: blob:; form-action 'none'")
                super().end_headers()

            def copyfile(self, source, outputfile):
                try:
                    super().copyfile(source, outputfile)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass

            def send_bytes(self, body, content_type):
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass

            def reject_write(self):
                owner.write_requests.append({'method': self.command, 'path': urlsplit(self.path).path})
                self.send_error(405, 'Read-only local QA')

            do_POST = do_PUT = do_PATCH = do_DELETE = reject_write

            def do_GET(self):
                path = urlsplit(self.path).path
                if path == '/__qa/connection-probe':
                    # Outside /RUDN/ service-worker scope: a new nonce proves
                    # actual online transport, rejection proves browser offline.
                    self.send_bytes(json.dumps({'nonce': urlsplit(self.path).query}).encode(), 'application/json')
                    return
                if not path.startswith('/RUDN/'):
                    self.send_error(404)
                    return
                self.path = self.path[len('/RUDN'):]
                if path == '/RUDN/assets/js/main.js':
                    self.send_bytes(owner.main_bytes, 'text/javascript; charset=utf-8')
                elif path == '/RUDN/assets/js/backend.js':
                    source = (SITE / 'assets/js/backend.js').read_text('utf8') + LOCAL_FIXTURE
                    self.send_bytes(source.encode(), 'text/javascript; charset=utf-8')
                else:
                    super().do_GET()

        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f'http://127.0.0.1:{self.httpd.server_port}'
        self.base = self.origin + '/RUDN/'
        return self

    def __exit__(self, *_args):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)


async def ready(page, total, timeout=30000):
    await page.wait_for_function(r"""total => {
      const root=document.querySelector('#geoPuzzleApp');
      return root?.dataset.playAllowed==='true' && document.querySelector('#puzzleLoading')?.hidden &&
        document.querySelector('#puzzlePlaced')?.textContent.replace(/\s/g,'')===`0/${total}` &&
        !document.querySelector('#puzzleHint')?.disabled && document.querySelector('#puzzleCanvas')?.width>10;
    }""", arg=total, timeout=timeout, polling=50)


async def progress(page):
    return await page.evaluate(r"""() => ({
      mode:document.querySelector('#puzzleMode').value,country:document.querySelector('#puzzleCountry').value,
      difficulty:document.querySelector('#puzzleDifficulty').value,
      placed:document.querySelector('#puzzlePlaced').textContent.replace(/\s/g,''),
      hints:document.querySelector('#puzzleHintLabel').textContent,
      territory:document.querySelector('#puzzleCurrentName').textContent,
      time:document.querySelector('#puzzleTime').textContent,
      guest:!localStorage.getItem('rudn.profile.v1')&&document.querySelector('#geoPuzzleApp').dataset.userName===''
    })""")


def seconds(value):
    return sum(int(part) * 60 ** index for index, part in enumerate(reversed(value.split(':'))))


def previous_document_cancellation(failure, responses, offline_generation):
    """Keep lifecycle cancellation evidence without hiding offline failures."""
    return (failure['error'] == 'NS_BINDING_ABORTED'
            and failure['path'] not in REQUIRED_PATHS
            and isinstance(failure.get('generation'), int)
            and failure['generation'] < offline_generation
            and any(row['url'] == failure['url'] and row['status'] == 200
                    and row['responsePhase'] == 'offline-reload'
                    and row['fromServiceWorker'] and row['generation'] == offline_generation
                    for row in responses))


def check_cancellation_classifier():
    # The CI failure is an old world-label fetch cancelled by a reload, then
    # successfully fetched through SW in the next document. These controls keep
    # the exception narrower than "ignore aborts" or "ignore all online errors".
    old = {'path': '/RUDN/assets/puzzle/data/world_countries_50m.geojson',
           'error': 'NS_BINDING_ABORTED', 'generation': 1}
    old['url'] = 'http://127.0.0.1:12345' + old['path']
    replacement = {'path': old['path'], 'url': old['url'], 'status': 200,
                   'fromServiceWorker': True, 'generation': 3, 'responsePhase': 'offline-reload'}
    assert previous_document_cancellation(old, [replacement], 3)
    assert not previous_document_cancellation({**old, 'generation': 3}, [replacement], 3)
    assert not previous_document_cancellation({**old, 'error': 'NS_ERROR_OFFLINE'}, [replacement], 3)
    assert not previous_document_cancellation(old, [], 3)
    assert not previous_document_cancellation(old, [{**replacement, 'fromServiceWorker': False}], 3)
    assert not previous_document_cancellation(old, [{**replacement, 'generation': 1}], 3)
    assert not previous_document_cancellation({**old, 'generation': None}, [replacement], 3)
    assert not previous_document_cancellation(old, [{**replacement, 'url': old['url'] + '?different=1'}], 3)
    assert not previous_document_cancellation(old, [{**replacement, 'url': old['url'].replace(':12345', ':12346')}], 3)
    assert not previous_document_cancellation(old, [{**replacement, 'responsePhase': 'reconnected'}], 3)
    for path in REQUIRED_PATHS:
        url = 'http://127.0.0.1:12345' + path
        assert not previous_document_cancellation({**old, 'path': path, 'url': url},
                                                   [{**replacement, 'path': path, 'url': url}], 3)


async def run(browser_name, args):
    report = {'browser': browser_name, 'platform': platform.platform(), 'passed': False,
              'startedAt': datetime.now(timezone.utc).isoformat(), 'readiness': 'visible DOM only',
              'transport': 'browser-offline; no HTTP routing', 'mainOverride': bool(args.main_source),
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'runtimeErrors': [], 'staticFailures': [], 'offlineResponses': [], 'blockedWrites': [],
              'teardownDiagnostics': [], 'inputTrace': [], 'stages': []}
    args.output.mkdir(parents=True, exist_ok=True)
    offline_phase = False
    generation, phase = 0, 'initialization'
    request_meta = {}

    def stage(name):
        report['stage'] = name
        report['stages'].append({'stage': name, 'phase': phase, 'generation': generation,
                                 'at': datetime.now(timezone.utc).isoformat()})

    with NativeServer(args.main_source) as server:
        report.update({'mainSha256': sha256(server.main_bytes),
                       'serviceWorkerSha256': sha256((SITE / 'service-worker.js').read_bytes())})
        async with async_playwright() as pw:
            options = {'firefox_user_prefs': {'network.proxy.type': 0}} if browser_name == 'firefox' else {}
            browser = await getattr(pw, browser_name).launch(**options)
            report['browserVersion'] = browser.version
            context = await browser.new_context(service_workers='allow', viewport={'width': 1366, 'height': 900})
            await context.expose_binding('__qaBlockedWrite', lambda _source, kind: report['blockedWrites'].append(kind))
            await context.expose_binding('__qaNativeInputEvent',
                lambda _source, row: append_input_trace(report, row, phase, generation))
            await context.add_init_script(GUARD)
            await context.add_init_script(INPUT_OBSERVER)
            def observe_request(request):
                request_meta[request] = {'generation': generation, 'startedPhase': phase}
                if request.method not in READ_METHODS:
                    report['blockedWrites'].append('observed-' + request.method)

            def metadata(request):
                # Unknown ownership must fail conservatively, never qualify as
                # a previous-document cancellation merely because it is absent.
                return request_meta.get(request, {'generation': None, 'startedPhase': 'unknown'})

            def observe_response(response):
                if not urlsplit(response.url).path.startswith('/RUDN/'):
                    return
                row = {'path': urlsplit(response.url).path, 'url': response.url, 'status': response.status,
                       'fromServiceWorker': response.from_service_worker, 'responsePhase': phase,
                       **metadata(response.request)}
                if phase == 'teardown':
                    report['teardownDiagnostics'].append({'event': 'response', **row})
                elif offline_phase:
                    report['offlineResponses'].append(row)

            def observe_failure(request):
                if not urlsplit(request.url).path.startswith('/RUDN/'):
                    return
                row = {'path': urlsplit(request.url).path, 'url': request.url, 'error': request.failure,
                       'failedPhase': phase, 'failedGeneration': generation, **metadata(request)}
                if phase == 'teardown':
                    report['teardownDiagnostics'].append({'event': 'requestfailed', **row})
                else:
                    report['staticFailures'].append(row)

            def observe_error(error):
                if phase == 'teardown':
                    report['teardownDiagnostics'].append({'event': 'pageerror', 'error': str(error)})
                else:
                    report['runtimeErrors'].append(str(error))

            context.on('request', observe_request)
            context.on('response', observe_response)
            context.on('requestfailed', observe_failure)
            page = await context.new_page()
            page.on('pageerror', observe_error)
            try:
                generation += 1
                phase = 'online-initial-document'
                stage('open-games')
                await page.goto(server.base + 'index.html#games', wait_until='domcontentloaded')
                stage('maps-precondition')
                await prepare_maps_click(page)
                stage('maps-native-click')
                await page.locator('[data-game="maps"] a').click()
                stage('world-ready')
                await ready(page, 240)
                assert await page.evaluate('location.hash') == '#puzzle'
                assert not await page.evaluate('Boolean(window.__puzzleRead)'), 'The test must serve an uninstrumented engine'
                stage('country-mode-click')
                await page.locator('[data-puzzle-mode="country-regions"]').click()
                stage('russia-ready')
                await ready(page, 89)
                assert (await progress(page))['time'] == '00:00'
                stage('hint-and-return')
                await page.locator('#puzzleHint').click()
                await page.wait_for_function("document.querySelector('#puzzleHintLabel').textContent.includes('9/10')")
                await page.locator('#puzzleReturn').click()
                stage('service-worker-control')
                await asyncio.wait_for(page.evaluate('navigator.serviceWorker.ready'), timeout=90)
                await page.wait_for_function('navigator.serviceWorker.controller', timeout=45000)
                generation += 1
                phase = 'online-reload'
                stage('online-reload')
                await page.reload(wait_until='domcontentloaded')
                stage('online-restored-ready')
                await ready(page, 89)
                report['beforeOffline'] = await progress(page)
                assert report['beforeOffline']['guest'] and '9/10' in report['beforeOffline']['hints']
                print(json.dumps({'browser': browser_name, 'stage': 'online-draft-restored'}), flush=True)
                stage('cache-coverage')
                report['cacheCoverage'] = await page.evaluate(r"""async paths=>{
                  const names=(await caches.keys()).filter(name=>name.startsWith('rudn-gmu-pages:')&&!name.endsWith(':client-bindings'));
                  return Promise.all(paths.map(async path=>{
                    const url=new URL(path,location.href),matches=[];
                    for(const name of names){const response=await (await caches.open(name)).match(url);if(response)matches.push({name,status:response.status});}
                    return {path,matches};
                  }));
                }""", CACHED_PATHS)
                assert all(any(match['status'] == 200 for match in row['matches']) for row in report['cacheCoverage'])
                stage('online-transport-control')
                probe = server.origin + '/__qa/connection-probe?nonce=' + str(datetime.now(timezone.utc).timestamp())
                report['onlineControl'] = await page.evaluate("async url=>({status:(await fetch(url,{cache:'no-store'})).status,online:navigator.onLine})", probe)
                assert report['onlineControl'] == {'status': 200, 'online': True}
                phase = 'offline-transport-probe'
                stage('offline-transport-control')
                await context.set_offline(True)
                report['offlineControl'] = await page.evaluate("async url=>{try{await fetch(url,{cache:'no-store'});return {rejected:false,online:navigator.onLine}}catch{return {rejected:true,online:navigator.onLine}}}", probe)
                assert report['offlineControl'] == {'rejected': True, 'online': False}
                print(json.dumps({'browser': browser_name, 'stage': 'offline-transport-verified'}), flush=True)
                offline_phase = True
                generation += 1
                phase = 'offline-reload'
                stage('offline-reload')
                report['offlineDocumentGeneration'] = generation
                await page.reload(wait_until='domcontentloaded')
                stage('offline-restored-ready')
                await ready(page, 89)
                # Russia itself restores before the background country labels.
                # Wait for their visible completion before deciding whether an
                # older cancelled label request has a successful replacement.
                stage('offline-country-labels')
                await page.wait_for_function("document.querySelectorAll('#puzzleCountry option').length===198",
                                             timeout=30000, polling=50)
                countries = await page.locator('#puzzleCountry option').evaluate_all('nodes=>nodes.map(node=>node.value)')
                report['countryCount'] = len(countries)
                report['uniqueCountryCount'] = len(set(countries))
                report['russiaFirst'] = countries[0] == 'RUS'
                stage('offline-state-assertions')
                assert report['countryCount'] == 198 and report['uniqueCountryCount'] == 198 and report['russiaFirst']
                report['afterOffline'] = await progress(page)
                for key in ['mode', 'country', 'difficulty', 'placed', 'hints', 'territory', 'guest']:
                    assert report['afterOffline'][key] == report['beforeOffline'][key], key
                assert seconds(report['afterOffline']['time']) >= seconds(report['beforeOffline']['time'])
                assert await page.locator('#toastStack .rudn-notice').count() == 0
                assert await page.locator('#puzzleResultDialog[open]').count() == 0
                await page.locator('.puzzle-stage-card').screenshot(path=str(args.output / f'native-offline-{browser_name}.png'))
                phase = 'reconnected'
                stage('reconnected-transport-control')
                await context.set_offline(False)
                report['reconnectedControl'] = await page.evaluate("async url=>({status:(await fetch(url,{cache:'no-store'})).status,online:navigator.onLine})", probe)
                assert report['reconnectedControl'] == {'status': 200, 'online': True}
                # Evaluate the complete observed operation, including reconnect.
                # An online replacement can never stand in for offline proof.
                stage('response-and-error-assertions')
                for path in REQUIRED_PATHS:
                    assert any(row['path'] == path and row['status'] == 200 and row['fromServiceWorker']
                               and row['generation'] == generation and row['responsePhase'] == 'offline-reload'
                               for row in report['offlineResponses']), f'Expected cached SW response for {path}'
                report['previousDocumentCancellations'] = [row for row in report['staticFailures']
                    if previous_document_cancellation(row, report['offlineResponses'], generation)]
                report['unexpectedStaticFailures'] = [row for row in report['staticFailures']
                    if not previous_document_cancellation(row, report['offlineResponses'], generation)]
                assert not report['unexpectedStaticFailures'], report['unexpectedStaticFailures']
                assert not report['runtimeErrors'], report['runtimeErrors']
                assert not report['blockedWrites'] and not server.write_requests
                report['passed'] = True
            except Exception as error:
                await capture_failure(page, report, error, args.output / f'native-offline-{browser_name}-failure.png')
            finally:
                # Close-triggered request cancellation remains visible, but
                # cannot mutate the operation whose assertions just ran.
                phase = 'teardown'
                stage('teardown')
                report['frozenObservationCounts'] = {key: len(report[key]) for key in
                    ['offlineResponses', 'staticFailures', 'runtimeErrors']}
                await context.close()
                await browser.close()
                assert all(len(report[key]) == count for key, count in report['frozenObservationCounts'].items())
                report['serverWriteRequests'] = server.write_requests
                if report['blockedWrites'] or server.write_requests:
                    report['passed'] = False
                    report.setdefault('failure', 'Read-only guard observed a write, including teardown')
                    report['teardownFailure'] = 'Read-only guard observed a write, including teardown'
                report['finishedAt'] = datetime.now(timezone.utc).isoformat()
    path = args.output / f'native-offline-{browser_name}.json'
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'browser': browser_name, 'passed': report['passed'], 'report': str(path)}), flush=True)
    return report['passed']


async def main():
    check_cancellation_classifier()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browsers', default='firefox,chromium')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--observer-only', action='store_true', help='Run pure failure-capture controls without a browser')
    parser.add_argument('--main-source', type=Path, help='Frozen baseline main.js served by the local handler; never edits application files')
    args = parser.parse_args()
    if args.observer_only:
        print(json.dumps({'passed': True, **await check_observer_failures()}))
        return
    if args.output is None:
        parser.error('--output is required for browser runs')
    names = args.browsers.split(',')
    if any(name not in {'firefox', 'chromium'} for name in names):
        parser.error('This browser-offline regression supports firefox,chromium; WebKit uses a separate verified transport-loss test')
    passed = [await run(name, args) for name in names]
    if not all(passed):
        raise SystemExit(1)


if __name__ == '__main__':
    asyncio.run(main())
