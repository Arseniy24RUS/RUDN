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
import socket
import sys
import threading
import time
import traceback
from urllib.parse import parse_qs, urlsplit

from playwright.async_api import Error as PlaywrightError, async_playwright
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
    return {ready:state.ready,loading:state.loading,restoring:state.restoring,writable:writable(),started:state.started,finished:state.finished,
      attemptId:state.attemptId,difficulty:state.difficulty,mode:state.mode,selection:state.selection,
      placed:state.placed,total:state.features.length,current:state.current,hints:state.hints,
      hasErrorCounter:'errors' in state,elapsedMs:elapsedMs(),source,target,view:{...state.view},
      inTray:piece?.inTray,featureIds:state.features.map(f=>f.properties._puzzleId),
      order:[...state.order],canvas:{width:state.cssWidth,height:state.cssHeight,mapBottom:state.mapBottom},
      map:{...state.mapRect},sideTray:state.sideTray,tray:trayRect()};
  };
"""

DIAGNOSTIC_PREFIX = 'QA-PUZZLE-DIAGNOSTIC:'
DIAGNOSTIC_HOOK = r"""(() => {
  const selectors=()=>({
    mode:document.querySelector('#puzzleMode')?.value,
    difficulty:document.querySelector('#puzzleDifficulty')?.value,
    country:document.querySelector('#puzzleCountry')?.value,
    subject:document.querySelector('#puzzleSubject')?.value,
    countryVisible:Boolean(document.querySelector('#puzzleCountry')?.getClientRects().length),
    countryOptions:document.querySelector('#puzzleCountry')?.options.length
  });
  const emit=(kind,detail)=>console.debug('QA-PUZZLE-DIAGNOSTIC:'+JSON.stringify({kind,at:performance.now(),...detail,selectors:selectors()}));
  addEventListener('error',event=>emit('runtime-error',{event:'error',message:String(event.message)}));
  addEventListener('unhandledrejection',event=>emit('runtime-error',{event:'unhandledrejection',message:String(event.reason)}));
  document.addEventListener('puzzle:load-status',event=>{
    const {status,mode,selection,reason}=event.detail||{};
    emit('load-status',{status,mode,selection,reason});
  },true);
  for(const name of ['click','change'])document.addEventListener(name,event=>{
    const target=event.target?.closest?.('[data-puzzle-mode],[data-puzzle-difficulty],#puzzleMode,#puzzleCountry,#puzzleSubject,#puzzleDifficulty');
    if(!target)return;
    const requested={control:target.id||null,mode:target.dataset.puzzleMode||null,difficulty:target.dataset.puzzleDifficulty||null,value:target.value||null};
    // Read after the real handlers have processed the user's selection.
    setTimeout(()=>emit('requested-selector',{event:name,requested}),0);
  },true);
})();"""


def inject_fixture_fetch(source):
    """Redirect audited remote fixtures, preserving the release's real URL loader."""
    markers = (
        'const nativeFetch=previousFetch.bind(window);',
        'const nativeFetch=(input,init)=>previousFetch.call(window,input instanceof Request?new Request(resourceURL(input),input):resourceURL(input),init);',
    )
    matched = [marker for marker in markers if marker in source]
    assert len(matched) == 1 and source.count(matched[0]) == 1, 'Fixture transport marker changed'
    marker = matched[0]
    original = marker.replace('const nativeFetch=', 'const sourceNativeFetch=', 1)
    wrapper = r"""
const nativeFetch=(input,options)=>{
 const url=input instanceof URL?input.href:typeof input==='string'?input:input.url;
 const api=url.match(/geoboundaries\.org\/api\/current\/gbOpen\/([A-Z]{3})\/ADM1\//);
 const geometry=url.match(/\/gbOpen\/([A-Z]{3})\/ADM1\/.*\.(?:geojson|json)(?:\?|$)/);
 return sourceNativeFetch(api?`/RUDN/__qa/metadata/${api[1]}.json`:geometry?`/RUDN/__qa/geometry/${geometry[1]}.json`:input,options);
};"""
    return source.replace(marker, original + wrapper, 1)


class PuzzleServer:
    def __init__(self, output, port=0):
        self.output, self.port = output, port
        self.transport_probes = []
        self.map_fault_requests = []

    def __enter__(self):
        fixture_output = self.output
        transport_probes = self.transport_probes
        map_fault_requests = self.map_fault_requests
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
                cookie = self.headers.get('Cookie', '')
                connection_loss = bool(re.search(r'(?:^|;\s*)qa-puzzle-offline=connection-loss(?:;|$)', cookie))
                server_outage = bool(re.search(r'(?:^|;\s*)qa-puzzle-offline=1(?:;|$)', cookie))
                requested = urlsplit(self.path)
                if (re.search(r'(?:^|;\s*)qa-puzzle-russia-outage=1(?:;|$)', cookie)
                        and requested.path in ('/RUDN/assets/puzzle/data/russia_subjects_89.topojson',
                                               '/RUDN/assets/puzzle/data/russia_subjects_89.compact.json')):
                    # Explicit per-context HTTP fault; the engine is still read
                    # from the checkout and receives only READ_ONLY_HOOK below.
                    map_fault_requests.append({'path': requested.path, 'status': 503})
                    body = b'Isolated QA Russia geometry outage'
                    self.send_response(503)
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers();self.wfile.write(body)
                    return
                nonce = parse_qs(requested.query).get('nonce', [''])[0] if requested.path == '/RUDN/__qa/connection-probe' else ''
                if nonce and re.fullmatch(r'[A-Za-z0-9_-]{1,100}', nonce):
                    transport_probes.append({'nonce': nonce, 'state': 'connection-loss' if connection_loss else 'server-outage' if server_outage else 'online'})
                else:
                    nonce = ''
                if connection_loss:
                    # No HTTP response: the transport disappears before headers.
                    # Per-context cookie keeps independent matrix workers isolated.
                    self.close_connection = True
                    try:
                        self.connection.shutdown(socket.SHUT_RDWR)
                    except OSError:
                        pass
                    self.connection.close()
                    return
                if server_outage:
                    body = b'Isolated QA network outage'
                    self.send_response(503);self.send_header('Content-Length', str(len(body)))
                    self.end_headers();self.wfile.write(body)
                    return
                if nonce:
                    body = json.dumps({'nonce': nonce, 'transport': 'http'}).encode('utf-8')
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('Content-Length', str(len(body)))
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
                        try:
                            source = inject_fixture_fetch(source)
                        except AssertionError as error:
                            self.send_error(500, str(error))
                            return
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
    context._qa_server = server
    await context.add_init_script(initializer(locale))
    await context.add_init_script(DIAGNOSTIC_HOOK)

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


def diagnostic_url(value):
    """Keep the route, never query strings, fragments, credentials or headers."""
    parts = urlsplit(value)
    host = parts.hostname or ''
    if parts.port:
        host += ':' + str(parts.port)
    return f'{parts.scheme}://{host}{parts.path}' if parts.scheme else parts.path


def diagnostic_text(value):
    return re.sub(r'https?://[^\s<>"\']+', lambda match: diagnostic_url(match.group(0)), str(value))


def observe(page, record, accept_dialogs=True):
    page.set_default_timeout(20000)
    page._qa_record = record
    for event, handler in getattr(page, '_qa_observers', []):
        page.remove_listener(event, handler)

    def console(message):
        if message.text.startswith(DIAGNOSTIC_PREFIX):
            event = json.loads(message.text[len(DIAGNOSTIC_PREFIX):])
            if event.get('reason'):
                event['reason'] = diagnostic_text(event['reason'])
            key = ('loadStatus' if event['kind'] == 'load-status' else
                   'runtimeExceptions' if event['kind'] == 'runtime-error' else 'requestedSelectors')
            record.setdefault(key, []).append(event)
        elif message.type == 'error':
            record.setdefault('consoleErrors', []).append(diagnostic_text(message.text))

    def page_error(error):
        message = str(error)
        errors = record.setdefault('pageErrors', [])
        record.setdefault('pageErrorEvents', []).append({
            'index': len(errors), 'message': message, 'atMs': time.monotonic() * 1000,
            'tcpPhase': record.get('offlineTcpPhase', {}).get('id'),
        })
        errors.append(message)

    def request_failed(request):
        record.setdefault('requestFailed', []).append({
            'url': diagnostic_url(request.url), 'resourceType': request.resource_type,
            'failure': diagnostic_text(request.failure), 'atMs': time.monotonic() * 1000,
            'tcpPhase': record.get('offlineTcpPhase', {}).get('id'),
        })

    page._qa_observers = [
        ('pageerror', page_error),
        ('console', console),
        ('requestfailed', request_failed),
        ('response', lambda response: record.setdefault('httpErrors', []).append({
            'url': diagnostic_url(response.url), 'status': response.status}) if response.status >= 400 else None),
    ]
    if accept_dialogs:
        page._qa_observers.append(('dialog', lambda dialog: asyncio.create_task(dialog.accept())))
    for event, handler in page._qa_observers:
        page.on(event, handler)


def unexpected_page_errors(record):
    """Keep raw events; correlate only WebKit's handled SW transport duplicate.

    A minimal real TCP-disconnect probe confirms WebKit emits this inspector
    event even when both the fetch and its catalog wrapper rejection are caught.
    No ordinary exception, online failure or unmatched event is classified.
    """
    errors = record.get('pageErrors', [])
    record['expectedOfflinePageErrors'] = []
    phase = record.get('offlineTcpPhase', {})
    proof = next((p for p in record.get('connectionLossProof', [])
                  if p.get('label') == 'outage-for-game'), {})
    controller = record.get('offlineCache', {}).get('controller')
    if not (record.get('browser') == 'webkit' and record.get('offlineSimulation') == 'connection-loss'
            and record.get('connectionLossVerified') and record.get('offlineResume') and controller
            and not record.get('runtimeExceptions')
            and phase.get('id') and proof.get('failed') and proof.get('serverHits', 0) > 0
            and proof.get('serverState') == 'connection-loss' and proof.get('status') is None):
        return errors
    message = 'Response served by service worker is an error'
    scope = urlsplit(controller)
    catalog_path = scope.path.rsplit('/', 1)[0] + '/assets/puzzle/data/world_countries_50m.geojson'
    end = phase.get('endedAtMs') or time.monotonic() * 1000

    def in_phase(event):
        return (event.get('tcpPhase') == phase['id']
                and phase['startedAtMs'] <= event.get('atMs', -1) <= end)

    matching = []
    for index, request in enumerate(record.get('requestFailed', [])):
        url = urlsplit(request['url'])
        if (in_phase(request) and request.get('resourceType') == 'fetch'
                and request.get('failure') == message and url.scheme == scope.scheme
                and url.netloc == scope.netloc and url.path == catalog_path):
            matching.append((index, request))
    used, expected = set(), set()
    for event in record.get('pageErrorEvents', []):
        index = event.get('index')
        if not (in_phase(event) and event.get('message') == message
                and isinstance(index, int) and index not in expected
                and 0 <= index < len(errors) and errors[index] == message):
            continue
        match = next(((i, request) for i, request in matching
                      if i not in used and abs(request['atMs'] - event['atMs']) <= 1000), None)
        if match:
            request_index, request = match
            used.add(request_index)
            expected.add(index)
            record['expectedOfflinePageErrors'].append({
                'pageErrorIndex': index, 'requestFailedIndex': request_index,
                'message': message, 'url': request['url'], 'tcpPhase': phase['id'],
            })
    return [message for index, message in enumerate(errors) if index not in expected]


async def ready(page, entry=None):
    await page.wait_for_function('window.__puzzleRead && window.__puzzleRead().ready && !window.__puzzleRead().loading', timeout=45000)
    if entry:
        await page.wait_for_function("entry=>{const s=window.__puzzleRead();return s.ready&&!s.loading&&s.mode===entry.mode&&(s.selection??null)===(entry.selection??null)}", arg=entry, timeout=45000)
    return await page.evaluate('window.__puzzleRead()')


async def select_map(page, entry):
    mode = entry['mode']
    category = 'country-regions' if mode == 'russia-subjects' else mode
    getattr(page, '_qa_record', {}).setdefault('requestedMaps', []).append(dict(entry))
    # A rendered previous scene can remain visible while its write lease and
    # saved state are restored. A mode click during that interval is ignored.
    # Pending replacement loads must stay selectable so users can cancel them.
    await page.wait_for_function("""()=>{
      const s=window.__puzzleRead();
      return s.ready&&!s.restoring&&s.writable;
    }""")
    selector = f'[data-puzzle-mode="{category}"]'
    button = page.locator(selector).first
    # The page uses smooth scrolling, so settle the viewport before targeting
    # the next control. Firefox CI once returned from click without a mode click
    # in document capture; its precise cause was not locally reproduced.
    # Finish the normal scroll first, then make exactly one native click. Do not
    # retry the choice or bypass handlers: distinguish failed input delivery
    # from a delivered choice that the application failed to apply.
    # An "if needed" check can finish while an older smooth scroll is still
    # moving; explicitly centre the target using the page's normal behaviour.
    await button.evaluate("button=>button.scrollIntoView({block:'center',inline:'nearest'})")
    await page.evaluate("""()=>{delete window.__qaPuzzleInputStability}""")
    await page.wait_for_function("""selector=>{
      const button=document.querySelector(selector),r=button?.getBoundingClientRect();
      if(!r||!button.isConnected||button.disabled)return false;
      const x=r.left+r.width/2,y=r.top+r.height/2;
      const hit=document.elementFromPoint(x,y);
      const clear=r.width>0&&r.height>0&&r.left>=0&&r.top>=0
        &&r.right<=innerWidth&&r.bottom<=innerHeight&&hit&&button.contains(hit);
      const sample=[r.left,r.top,r.width,r.height,scrollX,scrollY],now=performance.now();
      const previous=window.__qaPuzzleInputStability;
      if(!clear||!previous||sample.some((v,i)=>Math.abs(v-previous.sample[i])>.5)){
        window.__qaPuzzleInputStability={sample,at:now};return false;
      }
      return now-previous.at>=120;
    }""", arg=selector, timeout=20000)
    await page.evaluate("""category=>{
      const probe={category,delivered:false,events:[]};
      probe.capture=event=>{
        const target=event.target?.closest?.('[data-puzzle-mode]');
        const button=document.querySelector(`[data-puzzle-mode="${category}"]`);
        const r=button?.getBoundingClientRect();
        if(probe.events.length<12)probe.events.push({type:event.type,trusted:event.isTrusted,
          mode:target?.dataset.puzzleMode||null,targetId:event.target?.id||null,
          x:event.clientX,y:event.clientY,scrollY,
          rect:r&&{left:r.left,top:r.top,width:r.width,height:r.height}});
        if(event.type==='click'&&event.isTrusted&&target?.dataset.puzzleMode===category)probe.delivered=true;
      };
      for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,probe.capture,true);
      window.__qaPuzzleModeInput=probe;
    }""", category)
    try:
        await button.click()
        delivery = await page.evaluate("""()=>{
          const probe=window.__qaPuzzleModeInput,s=window.__puzzleRead?.();
          return {category:probe?.category,delivered:Boolean(probe?.delivered),events:probe?.events||[],
            state:s&&{mode:s.mode,selection:s.selection,difficulty:s.difficulty,ready:s.ready,
              loading:s.loading,restoring:s.restoring,writable:s.writable}};
        }""")
        getattr(page, '_qa_record', {}).setdefault('modeInputDelivery', []).append(delivery)
        assert delivery['delivered'], ('Native mode click was not delivered to the requested control', delivery)
    finally:
        try:
            await page.evaluate("""()=>{
              const probe=window.__qaPuzzleModeInput;
              if(probe)for(const type of ['pointerdown','pointerup','click'])document.removeEventListener(type,probe.capture,true);
              delete window.__qaPuzzleModeInput;delete window.__qaPuzzleInputStability;
            }""")
        except PlaywrightError as cleanup_error:
            # A closed/crashed page must retain the original interaction error.
            getattr(page, '_qa_record', {}).setdefault('inputCleanupErrors', []).append(diagnostic_text(cleanup_error))
    selection = 'RUS' if mode == 'russia-subjects' else entry.get('selection')
    if selection is not None:
        selector = '#puzzleSubject' if mode == 'russia-municipalities' else '#puzzleCountry'
        await page.wait_for_function("s=>[...document.querySelector(s.selector).options].some(o=>o.value===s.value)",
                                     arg={'selector': selector, 'value': selection})
        await page.locator(selector).select_option(selection)


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
    # Catalog coverage uses a completed choice. Rapid combinations are exercised
    # separately by the interaction suite, with an explicit expected final choice.
    await page.wait_for_function("difficulty=>{const s=window.__puzzleRead();return s.ready&&!s.loading&&s.difficulty===difficulty}", arg=difficulty)
    await select_map(page, entry)
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
        if(![s.source.x,s.source.y,s.target.x,s.target.y].every(Number.isFinite))throw new Error(`Non-finite pointer coordinates for piece ${s.current}`);
        if(s.target.x<s.map.x||s.target.x>s.map.x+s.map.width||s.target.y<s.map.y||s.target.y>s.map.y+s.map.height)
          throw new Error(`Piece ${s.current} target is outside the visible map: ${JSON.stringify(s.target)}`);
        const r=c.getBoundingClientRect();
        const dispatch=(type,p,buttons)=>c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,
          pointerId:7,pointerType,isPrimary:true,button:0,buttons,clientX:r.left+p.x,clientY:r.top+p.y}));
        dispatch('pointerdown',s.source,1);
        dispatch('pointermove',{x:s.map.x+s.map.width/2,y:s.map.y+s.map.height/2},1);
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
    await page.mouse.move(box['x'] + state['map']['x'] + state['map']['width'] / 2, box['y'] + state['map']['y'] + state['map']['height'] / 2, steps=3)
    await page.mouse.move(box['x'] + target['x'], box['y'] + target['y'])
    await page.mouse.up()
    after = await page.evaluate('window.__puzzleRead()')
    assert after['placed'] == state['placed'] + 1, ('Trusted mouse drop failed', state, after)


async def check_layout(page, record, label):
    # Wait for ResizeObserver + debounced projection rebuild, not an arbitrary
    # sleep that races Firefox/WebKit under a concurrent full-catalog workload.
    await page.wait_for_function("""()=>{const c=document.querySelector('#puzzleCanvas'),s=window.__puzzleRead?.();if(!c||!s)return false;
      const r=c.getBoundingClientRect();return Math.abs(r.width-s.canvas.width)<=2&&Math.abs(r.height-s.canvas.height)<=2;}""", timeout=8000, polling=50)
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


async def transport_probe(context, base, label, expect_failure=False):
    """Require a server-observed request, not merely a rejected JS expression."""
    server = context._qa_server
    nonce = str(time.time_ns())
    response, failure = None, None
    try:
        response = await context.request.get(base + '__qa/connection-probe?nonce=' + nonce, timeout=10000)
    except PlaywrightError as error:
        failure = str(error).splitlines()[0]
    hits = [event for event in server.transport_probes if event['nonce'] == nonce]
    expected_state = 'connection-loss' if expect_failure else 'online'
    assert hits and all(hit['state'] == expected_state for hit in hits), ('Probe did not reach the expected server transport', label, hits, failure)
    if expect_failure:
        assert failure and any(word in failure.lower() for word in ('socket', 'connection', 'reset', 'closed')), ('Expected actual TCP failure', label, failure)
        assert response is None
    else:
        assert failure is None and response.status == 200, ('Transport recovery failed', label, failure)
        assert await response.json() == {'nonce': nonce, 'transport': 'http'}
    return {'label': label, 'nonce': nonce, 'serverHits': len(hits), 'serverState': expected_state,
            'failed': bool(failure), 'error': failure, 'status': response.status if response else None}


async def verify_connection_loss(context, base, record):
    # Direct HTTP uses the same context cookies and bypasses both SW caches and
    # WebKit inspector pageerrors emitted even for caught failed fetch promises.
    proof = []
    for label, loss in (('before-outage', False), ('outage', True), ('recovered', False), ('outage-for-game', True)):
        await context.add_cookies([{'name': 'qa-puzzle-offline', 'value': 'connection-loss' if loss else '0', 'url': base}])
        proof.append(await transport_probe(context, base, label, expect_failure=loss))
    record['connectionLossProof'] = proof
    record['connectionLossVerified'] = True


async def offline_resume(page, context, before, record, mode='browser'):
    await flush(page)
    await page.wait_for_function("'serviceWorker' in navigator && navigator.serviceWorker.controller", timeout=25000)
    record['offlineCache'] = await page.evaluate("""async()=>({controller:navigator.serviceWorker.controller?.scriptURL,
      html:Boolean(await caches.match(new URL('puzzle.html',location.href).href)),
      cachedUrls:await Promise.all((await caches.keys()).map(async name=>({name,html:(await (await caches.open(name)).keys()).filter(request=>request.url.includes('puzzle.html')).map(request=>request.url)})))})""")
    record['offlineSimulation'] = mode
    if mode == 'connection-loss':
        await verify_connection_loss(context, page._qa_base, record)
        record['offlineTcpPhase'] = {'id': 'outage-for-game', 'startedAtMs': time.monotonic() * 1000,
                                     'endedAtMs': None}
    elif mode == 'server-outage':
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
    record = {'suite': 'completion', 'id': entry['id'], 'difficulty': difficulty, 'browser': args.browser_name,
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
                offline_mode = 'connection-loss' if args.browser_name == 'webkit' else 'browser'
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
        unexpected = unexpected_page_errors(record)
        assert not unexpected, unexpected
        assert not record.get('runtimeExceptions'), record.get('runtimeExceptions')
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
        if record.get('offlineTcpPhase'):
            record['offlineTcpPhase']['endedAtMs'] = time.monotonic() * 1000
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
            if args.label:
                prefix += '-' + args.label
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
                      'browserVersion': browser.version, 'platform': sys.platform,
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
    parser.add_argument('--label', default='', help='Optional report suffix to preserve evidence from another run')
    parser.add_argument('--serve', action='store_true', help='Only run the loopback fixture server')
    parser.add_argument('--no-offline', action='store_true', help='Development only; report marks absent offline coverage')
    parser.add_argument('--offline-mode', choices=('auto', 'browser', 'server-outage', 'connection-loss'), default='auto',
                        help='Auto uses browser offline in Chromium/Firefox and verified socket connection loss in WebKit; the independent offline probe reports driver limitations')
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
    if args.label and not re.fullmatch(r'[A-Za-z0-9_-]+', args.label):
        parser.error('Label must contain only letters, digits, underscores and hyphens')
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
