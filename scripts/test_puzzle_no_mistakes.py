"""Targeted old-release migration: real inputs, local student data, no cloud writes."""
import argparse
import asyncio
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright
import test_puzzle_catalog as catalog
from test_puzzle_release_upgrade import HistoricalServer, compare

OLD_RELEASE = '93698d66ca2f9f04143beba14db969d3f3927a6c'
catalog.READ_ONLY_HOOK += '\n  window.__upgradeRead=()=>snapshotState();\n'


async def stored(page, mode):
    await catalog.flush(page)
    return await page.evaluate("""async ({base,mode})=>{
      const {durableStore:store}=await import(base+'assets/js/durable-store.js?v=1.3.8');
      const {backend}=await import(base+'assets/js/backend.js?v=1.3.8');
      const owner='student:'+backend.getProfile().studentKey;
      return {draft:await store.loadDraft({owner,mode,activitySlug:mode==='seminar'?'seminar-2':'maps-freeplay'}),
        attempts:await store.listAttempts({owner}),pending:await store.listPending({owner,includeDeferred:true}),
        grades:backend.localGrades()};
    }""", {'base': page._qa_base, 'mode': mode})


async def miss(page):
    """Use real keyboard controls to leave a piece away from its destination."""
    state = await page.evaluate('window.__puzzleRead()')
    if state['inTray']:
        await page.locator('#puzzleCanvas').press('Enter')
    state = await page.evaluate('window.__puzzleRead()')
    direction = 'ArrowLeft' if state['source']['x'] < state['target']['x'] else 'ArrowRight'
    for _ in range(8):
        await page.locator('#puzzleCanvas').press(direction)
    await page.locator('#puzzleCanvas').press('Enter')
    after = await page.evaluate('window.__puzzleRead()')
    assert after['placed'] == state['placed'] and after['current'] == state['current']


async def finish(page):
    await page.locator('#puzzleReturn').click()
    await page.locator('#puzzleCenter').click()
    await catalog.place_pieces(page, 89)
    await page.locator('#puzzleResultDialog[open]').wait_for()
    # The real bridge saves the grade asynchronously after its durable completion.
    await page.evaluate("""async base=>{
      const {backend}=await import(base+'assets/js/backend.js?v=1.3.8');
      window.__qaNoMistakesAttemptReady=()=>backend.localAttempts().some(a=>a.id===window.__puzzleRead().attemptId);
    }""", page._qa_base)
    # Poll a Boolean; an async predicate's Promise is immediately truthy to
    # Playwright and can return before the attempt/grade mirror has been saved.
    await page.wait_for_function('window.__qaNoMistakesAttemptReady()')


async def assert_ui(page):
    assert await page.locator('#puzzleErrors,[data-static-i18n="errors"]').count() == 0
    assert await page.locator('.puzzle-stage-metrics > div').count() == 2
    assert await page.locator('.puzzle-leaderboard th').count() == 15
    snapshot = await page.evaluate('window.__upgradeRead()')
    assert 'errors' not in snapshot
    assert not (await page.evaluate('window.__puzzleRead()'))['hasErrorCounter']


async def metric_layouts(browser, output):
    for locale, labels in [('ru', ['Поставлено', 'Время']), ('en', ['Placed', 'Time']), ('zh', ['已放置', '用时'])]:
        record = {'case': 'metrics-' + locale}
        with catalog.PuzzleServer(output) as server:
            context = await catalog.context_for(browser, server, output, (1366, 768), locale, record)
            page = await context.new_page()
            page._qa_base = server.base
            try:
                await page.goto(server.base + 'apps/puzzle.html?context=free')
                await catalog.ready(page)
                for width, height in [(1366, 768), (320, 568), (844, 390)]:
                    await page.set_viewport_size({'width': width, 'height': height})
                    if width == 844:
                        await page.locator('#puzzleFullscreen').click()
                    await catalog.check_layout(page, record, str(width))
                    await assert_ui(page)
                    assert await page.locator('.puzzle-stage-metrics span').all_text_contents() == labels
                    boxes = await page.locator('.puzzle-stage-metrics > div').evaluate_all("els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top}})")
                    assert boxes[0]['right'] <= boxes[1]['left'] and boxes[1]['right'] <= width
                    assert abs(boxes[0]['top'] - boxes[1]['top']) < 1
                    await page.screenshot(path=str(output / f'metrics-{locale}-{width}.png'))
                print('PASS metrics ' + locale + ': desktop, 320px mobile, landscape fullscreen', flush=True)
            finally:
                await context.close()


async def run_case(browser, output, mode, difficulty, completed=False):
    label = f'{mode}-{difficulty}-' + ('completed' if completed else 'in-progress')
    report = {'case': label}
    with HistoricalServer(output, OLD_RELEASE) as server:
        context = await catalog.context_for(browser, server, output, (390, 844), 'ru', report)
        page = await context.new_page()
        page._qa_base = server.base
        catalog.observe(page, report)
        try:
            await page.goto(server.base + 'apps/puzzle.html?context=' + mode)
            await catalog.ready(page)
            if mode == 'free':
                await page.locator('[data-puzzle-mode="country-regions"]').click()
                await catalog.ready(page, {'mode': 'russia-subjects', 'selection': None})
            await page.locator(f'[data-puzzle-difficulty="{difficulty}"]').click()
            await page.wait_for_function('level=>window.__puzzleRead().difficulty===level&&!window.__puzzleRead().loading', arg=difficulty)
            await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
            await catalog.trusted_drop(page)
            await catalog.trusted_drop(page)
            await page.locator('#puzzleHint').click()
            await miss(page)
            assert (await page.evaluate('window.__puzzleRead()'))['errors'] > 0
            if completed:
                await finish(page)
            else:
                await page.locator('#puzzleZoomIn').click()
            before = await stored(page, mode)
            old = await page.evaluate('window.__upgradeRead()')
            assert old['errors'] > 0 and old['hints'] == 1
            if completed:
                assert before['attempts'][0]['errors'] > 0
            # Activate the new SW in the SAME browser, preserving all stored data.
            await page.wait_for_function('navigator.serviceWorker.controller')
            server.current = True
            await page.evaluate("""async()=>{
              window.__changed=false;
              navigator.serviceWorker.addEventListener('controllerchange',()=>window.__changed=true);
              await (await navigator.serviceWorker.getRegistration()).update();
            }""")
            await page.wait_for_function('window.__changed', timeout=120000)
            await page.reload()
            await catalog.ready(page)
            await assert_ui(page)
            after = await stored(page, mode)
            if completed:
                await page.locator('#puzzleResultDialog[open]').wait_for()
                assert after == before, 'Old completed result, grade, draft or queued delivery changed'
            else:
                current = await page.evaluate('window.__upgradeRead()')
                compare(old, current)
                assert 'errors' not in after['draft']['state']
                old_deliveries = {p['id']: p for p in before['pending']}
                for delivery in after['pending']:
                    old_delivery = old_deliveries.get(delivery['id'])
                    if old_delivery and delivery['revision'] == old_delivery['revision']:
                        assert delivery['payload'] == old_delivery['payload'], 'Existing payload was rewritten'
                    else:
                        assert 'errors' not in delivery.get('payload', {}).get('state', {})
                await miss(page)
                await assert_ui(page)
                # A missed placement still preserves position and can be continued offline.
                before_offline = await stored(page, mode)
                await context.set_offline(True)
                await page.reload()
                await catalog.ready(page)
                compare(before_offline['draft']['state'], await page.evaluate('window.__upgradeRead()'))
                await finish(page)
                final = await stored(page, mode)
                assert len(final['attempts']) == 1
                attempt = final['attempts'][0]
                assert attempt['id'] == old['attemptId'] and attempt['placed'] == 89
                assert 'errors' not in attempt and 'errors' not in final['draft']['state']
                if mode == 'seminar':
                    assert attempt['points'] == {'easy': 3, 'medium': 4, 'hard': 5}[difficulty]
                    assert final['grades']['seminar-2']['points'] == attempt['points']
                else:
                    assert attempt['recordGrade'] is False and final['grades'] == {}
                await page.reload()
                await catalog.ready(page)
                assert await stored(page, mode) == final, 'Reopening created a duplicate or changed a result'
            # The local completed row is still visible, without a mistakes column.
            await page.locator(f'#leader_{difficulty} tbody').get_by_text(catalog.STUDENT['fullName']).wait_for()
            assert not report.get('pageErrors'), report.get('pageErrors')
            assert not report.get('unexpectedWrites'), report.get('unexpectedWrites')
            report.update(status='passed', preservedAttemptId=old['attemptId'])
            print('PASS ' + label, flush=True)
        except Exception:
            report['lastState'] = await page.evaluate('window.__puzzleRead?.()')
            (output / (label + '-failure.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')
            await page.screenshot(path=str(output / (label + '-failure.png')))
            raise
        finally:
            await context.close()
    return report


async def main(args):
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    records = []
    if args.serve:
        with catalog.PuzzleServer(output, port=8879) as server:
            print(server.base + 'apps/puzzle.html?context=free', flush=True)
            await asyncio.Event().wait()
    async with async_playwright() as playwright:
        options = {'headless': True}
        if os.environ.get('CHROMIUM_EXECUTABLE'):
            options['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
        browser = await playwright.chromium.launch(**options)
        try:
            await metric_layouts(browser, output)
            for mode in ['seminar', 'free']:
                for difficulty in ['easy', 'medium', 'hard']:
                    records.append(await run_case(browser, output, mode, difficulty))
                records.append(await run_case(browser, output, mode, 'hard', completed=True))
        finally:
            await browser.close()
            (output / 'no-mistakes.json').write_text(json.dumps(records, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--serve', action='store_true')
    asyncio.run(main(parser.parse_args()))
