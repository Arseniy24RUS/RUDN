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


async def run(browser_name, args):
    report = {'browser': browser_name, 'platform': platform.platform(), 'passed': False,
              'startedAt': datetime.now(timezone.utc).isoformat(), 'readiness': 'visible DOM only',
              'transport': 'browser-offline; no HTTP routing', 'mainOverride': bool(args.main_source),
              'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'runtimeErrors': [], 'staticFailures': [], 'offlineResponses': [], 'blockedWrites': []}
    args.output.mkdir(parents=True, exist_ok=True)
    offline_phase = False
    with NativeServer(args.main_source) as server:
        report.update({'mainSha256': sha256(server.main_bytes),
                       'serviceWorkerSha256': sha256((SITE / 'service-worker.js').read_bytes())})
        async with async_playwright() as pw:
            options = {'firefox_user_prefs': {'network.proxy.type': 0}} if browser_name == 'firefox' else {}
            browser = await getattr(pw, browser_name).launch(**options)
            report['browserVersion'] = browser.version
            context = await browser.new_context(service_workers='allow', viewport={'width': 1366, 'height': 900})
            await context.expose_binding('__qaBlockedWrite', lambda _source, kind: report['blockedWrites'].append(kind))
            await context.add_init_script(GUARD)
            context.on('request', lambda request: report['blockedWrites'].append('observed-' + request.method)
                       if request.method not in READ_METHODS else None)
            context.on('response', lambda response: report['offlineResponses'].append({
                'path': urlsplit(response.url).path, 'status': response.status, 'fromServiceWorker': response.from_service_worker})
                if offline_phase and urlsplit(response.url).path.startswith('/RUDN/') else None)
            context.on('requestfailed', lambda request: report['staticFailures'].append({
                'path': urlsplit(request.url).path, 'error': request.failure})
                if urlsplit(request.url).path.startswith('/RUDN/') else None)
            page = await context.new_page()
            page.on('pageerror', lambda error: report['runtimeErrors'].append(str(error)))
            try:
                await page.goto(server.base + 'index.html#games', wait_until='domcontentloaded')
                await page.locator('[data-game="maps"] a').click()
                await ready(page, 240)
                assert await page.evaluate('location.hash') == '#puzzle'
                assert not await page.evaluate('Boolean(window.__puzzleRead)'), 'The test must serve an uninstrumented engine'
                await page.locator('[data-puzzle-mode="country-regions"]').click()
                await ready(page, 89)
                assert (await progress(page))['time'] == '00:00'
                await page.locator('#puzzleHint').click()
                await page.wait_for_function("document.querySelector('#puzzleHintLabel').textContent.includes('9/10')")
                await page.locator('#puzzleReturn').click()
                await asyncio.wait_for(page.evaluate('navigator.serviceWorker.ready'), timeout=90)
                await page.wait_for_function('navigator.serviceWorker.controller', timeout=45000)
                await page.reload(wait_until='domcontentloaded')
                await ready(page, 89)
                report['beforeOffline'] = await progress(page)
                assert report['beforeOffline']['guest'] and '9/10' in report['beforeOffline']['hints']
                print(json.dumps({'browser': browser_name, 'stage': 'online-draft-restored'}), flush=True)
                report['cacheCoverage'] = await page.evaluate(r"""async paths=>{
                  const names=(await caches.keys()).filter(name=>name.startsWith('rudn-gmu-pages:')&&!name.endsWith(':client-bindings'));
                  return Promise.all(paths.map(async path=>{
                    const url=new URL(path,location.href),matches=[];
                    for(const name of names){const response=await (await caches.open(name)).match(url);if(response)matches.push({name,status:response.status});}
                    return {path,matches};
                  }));
                }""", CACHED_PATHS)
                assert all(any(match['status'] == 200 for match in row['matches']) for row in report['cacheCoverage'])
                probe = server.origin + '/__qa/connection-probe?nonce=' + str(datetime.now(timezone.utc).timestamp())
                report['onlineControl'] = await page.evaluate("async url=>({status:(await fetch(url,{cache:'no-store'})).status,online:navigator.onLine})", probe)
                assert report['onlineControl'] == {'status': 200, 'online': True}
                await context.set_offline(True)
                report['offlineControl'] = await page.evaluate("async url=>{try{await fetch(url,{cache:'no-store'});return {rejected:false,online:navigator.onLine}}catch{return {rejected:true,online:navigator.onLine}}}", probe)
                assert report['offlineControl'] == {'rejected': True, 'online': False}
                print(json.dumps({'browser': browser_name, 'stage': 'offline-transport-verified'}), flush=True)
                offline_phase = True
                await page.reload(wait_until='domcontentloaded')
                await ready(page, 89)
                report['afterOffline'] = await progress(page)
                for key in ['mode', 'country', 'difficulty', 'placed', 'hints', 'territory', 'guest']:
                    assert report['afterOffline'][key] == report['beforeOffline'][key], key
                assert seconds(report['afterOffline']['time']) >= seconds(report['beforeOffline']['time'])
                for path in FETCH_PATHS | {'/RUDN/index.html'}:
                    assert any(row['path'] == path and row['status'] == 200 and row['fromServiceWorker']
                               for row in report['offlineResponses']), f'Expected cached SW response for {path}'
                assert not report['staticFailures'], report['staticFailures']
                assert not report['runtimeErrors'], report['runtimeErrors']
                assert not report['blockedWrites'] and not server.write_requests
                assert await page.locator('#toastStack .rudn-notice').count() == 0
                assert await page.locator('#puzzleResultDialog[open]').count() == 0
                await page.locator('.puzzle-stage-card').screenshot(path=str(args.output / f'native-offline-{browser_name}.png'))
                await context.set_offline(False)
                report['reconnectedControl'] = await page.evaluate("async url=>({status:(await fetch(url,{cache:'no-store'})).status,online:navigator.onLine})", probe)
                assert report['reconnectedControl'] == {'status': 200, 'online': True}
                report['passed'] = True
            except Exception as error:
                report['failure'] = str(error)
                report['dom'] = await page.evaluate("""() => ({hash:location.hash,visibility:document.visibilityState,focus:document.hasFocus(),controller:!!navigator.serviceWorker.controller,online:navigator.onLine,root:!!document.querySelector('#geoPuzzleApp'),appText:document.querySelector('#app')?.textContent.slice(0,1000)})""")
                await page.screenshot(path=str(args.output / f'native-offline-{browser_name}-failure.png'))
            finally:
                report['serverWriteRequests'] = server.write_requests
                report['finishedAt'] = datetime.now(timezone.utc).isoformat()
                await context.close()
                await browser.close()
    path = args.output / f'native-offline-{browser_name}.json'
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'browser': browser_name, 'passed': report['passed'], 'report': str(path)}), flush=True)
    return report['passed']


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browsers', default='firefox,chromium')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--main-source', type=Path, help='Frozen baseline main.js served by the local handler; never edits application files')
    args = parser.parse_args()
    names = args.browsers.split(',')
    if any(name not in {'firefox', 'chromium'} for name in names):
        parser.error('This browser-offline regression supports firefox,chromium; WebKit uses a separate verified transport-loss test')
    passed = [await run(name, args) for name in names]
    if not all(passed):
        raise SystemExit(1)


if __name__ == '__main__':
    asyncio.run(main())
