#!/usr/bin/env python3
"""Real old-code -> current-code puzzle migration on an isolated HTTP origin.

Old drafts are made by the actual historical UI, not fabricated snapshots. No
graded attempts, completed games or production requests are used. The original
ADM1 Russia variant is retained only to verify existing saved-game compatibility.
"""
import argparse
import asyncio
import json
import mimetypes
from pathlib import Path
import re
import subprocess
import threading
import traceback
from urllib.parse import urlsplit

from playwright.async_api import async_playwright
import test_puzzle_catalog as catalog

OLD_HOOK = r"""
  window.__puzzleRead=()=>{const piece=currentPiece(),anchor=piece&&state.anchors[piece.index];
    return {ready:state.ready,loading:state.loading,started:state.started,finished:state.finished,
      attemptId:state.attemptId,difficulty:state.difficulty,mode:state.mode,selection:state.selection,
      placed:state.placed,total:state.features.length,current:state.current,hints:state.hints,
      errors:state.errors,source:piece?(piece.inTray?trayCenter():worldToScreen(anchor[0]+piece.dx,anchor[1]+piece.dy)):null,
      target:anchor?worldToScreen(...anchor):null,inTray:piece?.inTray,view:{...state.view},
      featureIds:state.features.map(f=>f.properties._puzzleId),order:[...state.order],
      canvas:{width:state.cssWidth,height:state.cssHeight,mapBottom:state.mapBottom},map:{x:0,y:0,width:state.cssWidth,height:state.mapBottom},tray:trayRect()};};
  window.__upgradeRead=()=>snapshotState();
"""
FIXTURE_FETCH = r"""const nativeFetch=(input,options)=>{
 const url=input instanceof URL?input.href:typeof input==='string'?input:input.url;
 const api=url.match(/geoboundaries\.org\/api\/current\/gbOpen\/([A-Z]{3})\/ADM1\//);
 const geometry=url.match(/\/gbOpen\/([A-Z]{3})\/ADM1\/.*\.(?:geojson|json)(?:\?|$)/);
 return previousFetch.call(window,api?`/RUDN/__qa/metadata/${api[1]}.json`:geometry?`/RUDN/__qa/geometry/${geometry[1]}.json`:input,options);
};"""


class HistoricalServer(catalog.PuzzleServer):
    def __init__(self, output, commit):
        super().__init__(output)
        self.commit, self.current, self.originals = commit, False, {}
        self.source_lock = threading.Lock()

    def original(self, name):
        with self.source_lock:
            if name not in self.originals:
                result = subprocess.run(['git', 'show', self.commit + ':site' + name], cwd=catalog.ROOT, capture_output=True)
                if result.returncode:
                    return None
                self.originals[name] = result.stdout
            return self.originals[name]

    def __enter__(self):
        super().__enter__()
        owner = self
        BaseHandler = self.httpd.RequestHandlerClass

        class Handler(BaseHandler):
            def do_GET(self):
                name = urlsplit(self.path).path.removeprefix('/RUDN')
                historical = name.endswith(('.js', '.mjs', '.html', '.css')) or name == '/version.json'
                if owner.current or not historical:
                    return super().do_GET()
                body = owner.original(name)
                if body is None:
                    self.send_error(404, 'Resource absent from historical release')
                    return
                source = body.decode('utf-8')
                if name == '/assets/js/backend.js':
                    source += catalog.LOCAL_FIXTURE
                elif name == '/assets/js/puzzle-engine.js':
                    marker = '  function checkpoint() {'
                    assert source.count(marker) == 1
                    source = source.replace(marker, OLD_HOOK + '\n' + marker, 1)
                elif name == '/assets/js/puzzle-bootstrap.js':
                    marker = 'const nativeFetch=previousFetch.bind(window);'
                    assert source.count(marker) == 1
                    source = source.replace(marker, FIXTURE_FETCH, 1)
                body = source.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/javascript; charset=utf-8' if name.endswith(('.js', '.mjs')) else (mimetypes.guess_type(name)[0] or 'application/octet-stream'))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass
        self.httpd.RequestHandlerClass = Handler
        return self


def compare(before, after):
    for key in ['attemptId', 'seed', 'mode', 'selection', 'difficulty', 'order', 'featureIds', 'placed', 'hints', 'current', 'geometryRef']:
        assert before[key] == after[key], (key, before[key], after[key])
    for old, new in zip(before['pieces'], after['pieces']):
        assert old['locked'] == new['locked'] and old['inTray'] == new['inTray']
        if old.get('point'):
            assert max(abs(a-b) for a,b in zip(old['point'], new['point'])) < 1e-6
    assert abs(before['view']['zoom'] - after['view']['zoom']) < 1e-6
    assert max(abs(a-b) for a,b in zip(before['view']['centre'], after['view']['centre'])) < 1e-6
    assert after['elapsedMs'] >= before['elapsedMs'] - 1, ('Elapsed time reset', before['elapsedMs'], after['elapsedMs'])
    assert not before['finished'] and not after['finished']
    assert 'errors' not in after, 'Retired mistake counter must not enter new snapshots'


async def case(browser, fixtures, output, commit, mode, selection, version, context_mode='free'):
    record = {'mode': mode, 'context':context_mode, 'selection': selection, 'oldCommit': commit, 'oldVersion': '1.3.6', 'newVersion': version, 'status': 'running', 'fixture': 'actual historical UI and source geometry, no draft injection'}
    image_prefix = context_mode + '-' + mode
    with HistoricalServer(fixtures, commit) as server:
        context = await catalog.context_for(browser, server, fixtures, (390, 844), 'ru', record)
        page = await context.new_page()
        page._qa_base, page._qa_locale = server.base, 'ru'
        catalog.observe(page, record)
        writes = []
        context.on('request', lambda request: writes.append({'method': request.method, 'url': request.url}) if request.method not in ['GET', 'HEAD', 'OPTIONS'] else None)
        try:
            await page.goto(server.base + 'apps/puzzle.html?context=' + context_mode + '&qaLocale=ru', wait_until='domcontentloaded')
            await page.bring_to_front()
            await catalog.ready(page)
            await page.locator('[data-puzzle-difficulty="hard"]').click()
            await page.wait_for_function("window.__puzzleRead().difficulty==='hard'&&!window.__puzzleRead().loading")
            if selection:
                await page.locator('[data-puzzle-mode="country-regions"]').click()
                await page.wait_for_function("[...document.querySelector('#puzzleCountry').options].some(option=>option.value==='RUS')")
                await page.locator('#puzzleCountry').select_option('RUS')
            await catalog.ready(page, {'mode': mode, 'selection': selection})
            await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
            await catalog.trusted_drop(page)
            await catalog.trusted_drop(page)
            if context_mode == 'free':
                await page.locator('#puzzleHint').click()
                await page.wait_for_function('window.__puzzleRead().hints===1')
            else:
                await page.locator('#puzzleCanvas').press('Enter')
            await page.locator('#puzzleCanvas').press('ArrowLeft')
            await page.locator('#puzzleCanvas').press('ArrowUp')
            await page.locator('#puzzleZoomIn').click()
            await page.locator('#puzzleZoomIn').click()
            await catalog.flush(page)
            old = await page.evaluate('window.__upgradeRead()')
            assert old['placed'] == 2 and old['hints'] == (1 if context_mode == 'free' else 0)
            assert old['pieces'][old['current']]['point'] and not old['pieces'][old['current']]['inTray']
            await page.wait_for_function('navigator.serviceWorker.controller')
            await page.evaluate('navigator.serviceWorker.ready')
            record['before'] = old
            record['oldCaches'] = await page.evaluate('caches.keys()')
            assert any('1.3.6' in name for name in record['oldCaches'])
            await page.screenshot(path=str(output / (image_prefix + '-old.png')))

            server.current = True
            await page.evaluate("async()=>{window.__upgradeControllerChanges=0;navigator.serviceWorker.addEventListener('controllerchange',()=>window.__upgradeControllerChanges++);const registration=await navigator.serviceWorker.getRegistration();await registration.update()}")
            await page.wait_for_function('window.__upgradeControllerChanges>0', timeout=120000, polling=100)
            record['controllerChanges'] = await page.evaluate('window.__upgradeControllerChanges')
            # Reopen the same browser's durable game after new worker activation.
            await page.reload(wait_until='domcontentloaded')
            await catalog.ready(page, {'mode': mode, 'selection': selection})
            await page.wait_for_function('window.__upgradeRead')
            current = await page.evaluate('window.__upgradeRead()')
            compare(old, current)
            assert await page.locator('[data-puzzle-mode]').count() == 3
            await catalog.flush(page)
            await page.wait_for_function("version=>caches.keys().then(keys=>keys.some(key=>key.includes(version)))", arg=version, timeout=45000)
            await context.set_offline(True)
            await page.reload(wait_until='domcontentloaded')
            await catalog.ready(page, {'mode': mode, 'selection': selection})
            offline = await page.evaluate('window.__upgradeRead()')
            compare(old, offline)
            await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
            await page.locator('.puzzle-stage-card').screenshot(path=str(output / (image_prefix + '-new-offline.png')))
            record['after'], record['offline'], record['writes'] = current, offline, writes
            assert not writes, writes
            assert not record.get('pageErrors'), record.get('pageErrors')
            record['status'] = 'passed'
        except Exception as error:
            record['status'], record['error'], record['traceback'] = 'failed', repr(error), traceback.format_exc()
            try:
                record['lastState'] = await page.evaluate('window.__puzzleRead?.()')
                await page.screenshot(path=str(output / (image_prefix + '-failure.png')), timeout=10000)
            except Exception:
                pass
        finally:
            await context.close()
    return record


async def main(args):
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    configuration = (catalog.ROOT / 'site/assets/js/config.js').read_text(encoding='utf-8')
    version = re.search(r'\bversion\s*:\s*[\'"](\d+\.\d+\.\d+)', configuration).group(1)
    assert version != '1.3.6', 'Bump the current release before testing an actual 1.3.6 -> new worker migration'
    catalog.READ_ONLY_HOOK += '\n  window.__upgradeRead=()=>snapshotState();\n'
    records = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            for mode, selection, context_mode in [('russia-subjects', None, 'free'), ('country-regions', 'RUS', 'free'), ('russia-subjects', None, 'seminar')]:
                record = await case(browser, Path(args.fixtures), output, args.old_commit, mode, selection, version, context_mode)
                records.append(record)
                (output / 'release-upgrade.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
                print(json.dumps({'mode': mode, 'status': record['status'], 'error': record.get('error')}, ensure_ascii=False), flush=True)
        finally:
            await browser.close()
    if any(record['status'] != 'passed' for record in records): raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixtures', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--old-commit', default='780d787')
    asyncio.run(main(parser.parse_args()))
