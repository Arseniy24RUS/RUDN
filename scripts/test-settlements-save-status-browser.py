"""Deterministic local Playwright regression with real auth/RTDB emulators.

Only network timing is controlled. Gameplay and profile entry use the UI;
there is no injected game state or game API. Emulators must already be running.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer
import argparse, importlib.util, json, sys, threading, time, traceback

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cloud_browser', ROOT/'scripts/test-settlements-cloud-browser.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def run(base, browser_name):
    from playwright.sync_api import sync_playwright, expect
    out = ROOT/'artifacts/settlements-save-status'/time.strftime(browser_name+'-%Y%m%d-%H%M%S')
    out.mkdir(parents=True, exist_ok=True)
    ticket = str(time.time_ns()//1000000)
    name = 'QA Local Save Status'
    report = {'evaluationType': 'deterministic-informed-ui-regression', 'base': base,
              'browser': browser_name, 'ticket': ticket, 'buildHashStart': helper.build_hash(),
              'checks': [], 'requests': [], 'pageErrors': [], 'consoleErrors': [], 'expectedConsoleDiagnostics': []}
    held, released = {}, set()

    def check(name, details=None):
        value = {'name': name, 'status': 'pass', 'details': details}
        report['checks'].append(value)
        print(json.dumps(value, ensure_ascii=False), flush=True)

    def attach(page):
        page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
        def console(message):
            if message.type != 'error': return
            # The existing emulator-only Handler intentionally denies frames.
            # RTDB may try its long-poll iframe after the offline transition;
            # checkpoint delivery here uses authenticated REST, checked below.
            frame_denial = 'Framing \'http://127.0.0.1:9000/\' violates the following Content Security Policy directive: "frame-src \'none\'". The request has been blocked.'
            if 'ERR_INTERNET_DISCONNECTED' in message.text or message.text.strip() == frame_denial:
                report['expectedConsoleDiagnostics'].append(message.text)
            else: report['consoleErrors'].append(message.text)
        page.on('console', console)

    def await_gate(page, turns):
        deadline = time.monotonic()+15
        while turns not in held:
            assert time.monotonic() < deadline, f'Expected delayed checkpoint for {turns} turns'
            page.wait_for_timeout(30)

    def intercept(route):
        request = route.request
        if request.method == 'PUT' and f'/checkpoints/{ticket}/settlements-tutorial/' in request.url:
            data = json.loads(request.post_data or '{}')
            save = data.get('current', {}).get('state', {}).get('engineSave')
            if isinstance(save, str): save = json.loads(save)
            turns = len((save or {}).get('actions', []))
            report['requests'].append({'turns': turns, 'at': time.time()})
            if turns in (1, 2, 3) and turns not in released and turns not in held:
                held[turns] = route
                return
        route.continue_()

    with sync_playwright() as pw:
        browser = getattr(pw, browser_name).launch(headless=True)
        report['browserVersion'] = browser.version
        context = browser.new_context(viewport={'width': 1365, 'height': 950}, service_workers='block')
        page = context.new_page(); attach(page)
        try:
            page.goto(base+'#games/settlements')
            page.locator('[data-action="tutorial"]').wait_for(timeout=60000)
            helper.login(page, ticket, name)
            page.locator('[data-action="tutorial"]').click(); helper.ready(page)
            expect(page.locator('[data-game-status]')).to_have_attribute('data-state', 'saved', timeout=30000)
            page.locator('[data-game-status]').evaluate('''node=>{
              window.__qaSaveTransitions=[];
              new MutationObserver(records=>{
                records.forEach((record,i)=>window.__qaSaveTransitions.push({
                  from:record.oldValue,to:i+1<records.length?records[i+1].oldValue:node.dataset.state,
                  at:performance.now()}));
              }).observe(node,{attributes:true,attributeFilter:['data-state'],attributeOldValue:true});
            }''')
            context.route('http://127.0.0.1:9000/**', intercept)
            helper.act(page, 'guide-position'); helper.act(page, 'confirm')
            await_gate(page, 1)
            helper.choose(page, 'medical'); helper.find(page, 'Большая Казакбаева'); helper.act(page, 'confirm')
            helper.choose(page, 'connect'); helper.find(page, 'Большая Казакбаева'); helper.find(page, 'Мансурова'); helper.act(page, 'confirm')
            helper.ready(page)
            budget = page.locator('.budget').inner_text()
            assert '56,7' in budget, budget
            expect(page.locator('[data-game-status]')).to_have_attribute('data-state', 'pending')
            assert len(helper.checkpoint(ticket)['state']['engineSave']['actions']) == 0
            assert page.locator('[data-act="undo"]').is_enabled(), 'pending sync must not freeze gameplay'
            page.screenshot(path=str(out/'three-moves-pending.png'))
            check('three rapid real tutorial moves remain pending while the first network ACK is held', {'budget': budget})
            for turns in (1, 2):
                released.add(turns); held.pop(turns).continue_()
                await_gate(page, turns+1)
                expect(page.locator('[data-game-status]')).to_have_attribute('data-state', 'pending')
                assert len(helper.checkpoint(ticket)['state']['engineSave']['actions']) == turns
                transitions = page.evaluate('window.__qaSaveTransitions')
                assert not any(event['to'] == 'saved' for event in transitions), transitions
                check('older ACK cannot show saved for later native callbacks', {'acknowledgedTurns': turns})
            released.add(3); held.pop(3).continue_()
            expect(page.locator('[data-game-status]')).to_have_attribute('data-state', 'saved', timeout=30000)
            latest = helper.checkpoint(ticket)
            assert len(latest['state']['engineSave']['actions']) == 3
            report['saveTransitions'] = page.evaluate('window.__qaSaveTransitions')
            page.screenshot(path=str(out/'latest-online.png'))
            check('saved status acknowledges the current three-move replay', {'revision': latest['revision'], 'budget': budget})
            page.locator('.game-heading [data-action="lobby"]').click()
            page.locator('.game-stage').wait_for(state='hidden'); page.locator('.lobby').wait_for(state='visible')
            context.close()
            context = browser.new_context(viewport={'width': 1365, 'height': 950}, service_workers='block')
            page = context.new_page(); attach(page)
            page.goto(base+'#games/settlements'); page.locator('[data-action="tutorial"]').wait_for(timeout=60000)
            helper.login(page, ticket, name)
            page.locator('[data-action="tutorial"]').click(); helper.ready(page)
            expect(page.locator('.budget')).to_have_text(budget)
            guide = page.locator('.puzzle-mission').inner_text()
            assert '4/6' in guide.replace(' ', ''), guide
            expect(page.locator('[data-game-status]')).to_have_attribute('data-state', 'saved', timeout=30000)
            # A restored game has no native boot checkpoint. A later status emit
            # must still use its restored replay as the comparison baseline.
            page.evaluate("window.dispatchEvent(new Event('online'))")
            page.wait_for_timeout(500)
            expect(page.locator('[data-game-status]')).to_have_attribute('data-state', 'saved')
            page.screenshot(path=str(out/'independent-context-restored.png'))
            check('independent context restores exact latest budget and guide, including a later status refresh', {'budget': budget, 'guide': guide})
            helper.choose(page, 'tower')
            page.evaluate("window.dispatchEvent(new Event('online'))")
            page.wait_for_timeout(500)
            expect(page.locator('[data-game-status]')).to_have_attribute('data-state', 'saved')
            check('changing an unsaved tool preview does not strand an acknowledged replay in pending')
            context.set_offline(True)
            helper.act(page, 'undo')
            expect(page.locator('.budget')).not_to_have_text(budget)
            expect(page.locator('[data-game-status]')).to_have_attribute('data-state', 'pending')
            assert page.locator('[data-act="undo"]').is_enabled()
            page.locator('.game-heading [data-action="lobby"]').click()
            page.locator('.game-stage').wait_for(state='hidden', timeout=10000)
            page.locator('.lobby').wait_for(state='visible')
            check('offline undo remains writable and lobby exit settles without waiting for cloud')
            # This harness blocks service workers, so it cannot test offline
            # cold asset loading. Reconnect before remounting the native map.
            context.set_offline(False)
            page.locator('[data-action="tutorial"]').click(); helper.ready(page)
            assert '57,8' in page.locator('.budget').inner_text()
            assert page.locator('[data-act="undo"]').is_enabled()
            expect(page.locator('[data-game-status]')).to_have_attribute('data-state', 'saved', timeout=30000)
            assert len(helper.checkpoint(ticket)['state']['engineSave']['actions']) == 2
            check('offline queue survives lobby exit and reconnects with the current replay')
            assert not report['pageErrors'], report['pageErrors']
            assert not report['consoleErrors'], report['consoleErrors']
            report['status'] = 'pass'
        except Exception as error:
            report.update(status='fail', failure=str(error), traceback=traceback.format_exc())
            page.screenshot(path=str(out/'failure.png'), full_page=True)
            (out/'failure-dom.txt').write_text(page.locator('body').aria_snapshot(), encoding='utf-8')
            print(traceback.format_exc(), flush=True)
        finally:
            report['buildHashEnd'] = helper.build_hash()
            if report['buildHashStart'] != report['buildHashEnd']:
                report.update(status='fail', buildChangedDuringTest=True)
            (out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            print(str(out/'report.json'), flush=True)
            context.close(); browser.close()
    return 0 if report['status'] == 'pass' else 1


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--port', type=int, default=4198)
    args.add_argument('--external-server', action='store_true')
    args.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
    opts = args.parse_args()
    server = None
    if not opts.external_server:
        server = ThreadingHTTPServer(('127.0.0.1', opts.port), helper.Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
    try: return run(f'http://127.0.0.1:{opts.port}/', opts.browser)
    finally:
        if server: server.shutdown(); server.server_close()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
