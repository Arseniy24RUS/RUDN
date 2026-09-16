#!/usr/bin/env python3
"""Isolated puzzle input, lifecycle and accessibility interaction regressions.

Uses the same audited fixture server as the full-catalog suite. Production
connections are blocked. Geometry is observed read-only; progress is changed
only through the actual controls and canvas events. Chromium supports trusted
CDP touch drags/pinches; Firefox/WebKit use trusted taps plus explicitly labelled
synthetic pointer gesture coverage. No physical-device coverage is implied.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time
import traceback

from playwright.async_api import async_playwright
from test_puzzle_catalog import (
    PuzzleServer, ROOT, STUDENT, check_layout, context_for, flush,
    place_pieces, ready, trusted_drop, write_json,
)


async def state(page):
    return await page.evaluate('window.__puzzleRead()')


async def draft(page, mode='free'):
    await flush(page)
    return await page.evaluate("""async ({owner,mode})=>{
      const {durableStore}=await import(new URL('assets/js/durable-store.js',document.baseURI.includes('/apps/')?new URL('../',document.baseURI):document.baseURI));
      return durableStore.loadDraft({owner,activitySlug:mode==='seminar'?'seminar-2':'maps-freeplay',mode});
    }""", {'owner': 'student:' + STUDENT['studentKey'], 'mode': mode})


async def open_game(page, server, mode='free', locale='ru'):
    await page.goto(server.base + f'apps/puzzle.html?context={mode}&qaLocale={locale}', wait_until='domcontentloaded')
    await ready(page)
    await page.wait_for_function("document.querySelector('#geoPuzzleApp').puzzleProgress.canWrite()")
    await page.locator('#puzzleCanvas').scroll_into_view_if_needed()


def watch(page, record):
    page.set_default_timeout(20000)
    page.on('pageerror', lambda error: record.setdefault('pageErrors', []).append(str(error)))
    page.on('console', lambda message: record.setdefault('consoleErrors', []).append(message.text) if message.type == 'error' else None)


async def canvas_points(page, values):
    box = await page.locator('#puzzleCanvas').bounding_box()
    return [{'x': box['x'] + p['x'], 'y': box['y'] + p['y']} for p in values]


async def gesture(page, events):
    """Browser-independent cancellation and multitouch event-path coverage."""
    await page.evaluate("""events=>{
      const canvas=document.querySelector('#puzzleCanvas'),r=canvas.getBoundingClientRect();
      for(const e of events)canvas.dispatchEvent(new PointerEvent(e.type,{bubbles:true,cancelable:true,
        pointerType:'touch',pointerId:e.id,isPrimary:e.id===7,button:0,buttons:e.type==='pointerup'?0:1,
        clientX:r.left+e.x,clientY:r.top+e.y}));
    }""", events)


async def input_and_cancel(page, context, browser_name, server, record):
    await open_game(page, server)
    assert not (await state(page))['started'] or (await state(page))['elapsedMs'] < 100, 'Autoload started timing'
    dialogs = []

    async def reject_unexpected(dialog):
        dialogs.append(dialog.message)
        await dialog.dismiss()

    page.on('dialog', reject_unexpected)
    await page.locator('[data-puzzle-difficulty="easy"]').focus()
    await page.keyboard.press('End')
    await page.wait_for_function("window.__puzzleRead().difficulty==='hard'&&!window.__puzzleRead().loading")
    assert not dialogs, 'Difficulty change before first action requested confirmation'
    assert await page.locator('[data-puzzle-difficulty="hard"]').get_attribute('aria-pressed') == 'true'
    await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
    await page.locator('#puzzleCanvas').focus()
    await page.keyboard.press('Alt+ArrowUp')
    assert (await draft(page))['state']['timerStarted'], 'First keyboard pan did not start the timer'
    record['keyboardPanStartsTimer'] = True
    await trusted_drop(page)
    record['trustedMousePlacement'] = True

    for cancel_kind in ['pointercancel', 'lostpointercapture']:
        await page.locator('#puzzleReturn').click()
        before = await state(page)
        source, target = await canvas_points(page, [before['source'], before['target']])
        await page.evaluate("document.querySelector('#puzzleCanvas').addEventListener('pointerdown',e=>window.__qaPointer=e.pointerId,{once:true})")
        await page.mouse.move(**source)
        await page.mouse.down()
        await page.mouse.move(target['x'], min(target['y'], (await page.locator('#puzzleCanvas').bounding_box())['y'] + before['tray']['y'] - 12), steps=3)
        await page.mouse.move(**target)
        if cancel_kind == 'pointercancel':
            await page.evaluate("document.querySelector('#puzzleCanvas').dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.__qaPointer,bubbles:true,pointerType:'mouse'}))")
        else:
            await page.evaluate("document.querySelector('#puzzleCanvas').releasePointerCapture(window.__qaPointer)")
            await page.wait_for_timeout(60)
        await page.mouse.up()
        after = await state(page)
        assert (after['placed'], after['errors']) == (before['placed'], before['errors']), (cancel_kind, before, after)
    record['cancellation'] = ['synthetic pointercancel during trusted drag', 'native lostpointercapture during trusted drag']

    await page.locator('#puzzleReturn').click()
    await page.locator('#puzzleCanvas').focus()
    await page.keyboard.press('Enter')
    before = await state(page)
    assert not before['inTray'], 'Enter did not pick the tray piece'
    await page.keyboard.press('ArrowRight')
    after = await state(page)
    assert abs(after['source']['x'] - before['source']['x'] - 9) < .6, ('Keyboard movement', before, after)
    await page.keyboard.press('Alt+ArrowDown')
    panned = await state(page)
    assert abs(panned['view']['y'] - after['view']['y'] + 9) < .6, ('Keyboard pan', after, panned)
    await page.locator('#puzzleReturn').click()
    assert (await state(page))['inTray']
    record['trustedKeyboard'] = ['difficulty End', 'Enter lifts piece', 'ArrowRight moves piece', 'Alt+ArrowDown pans']

    await page.set_viewport_size({'width': 390, 'height': 844})
    await page.wait_for_timeout(200)
    await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
    if browser_name == 'chromium':
        cdp = await context.new_cdp_session(page)
        before = await state(page)
        source, target = await canvas_points(page, [before['source'], before['target']])
        async def touch(kind, points):
            await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [dict(p, id=i + 1, radiusX=5, radiusY=5, force=1) for i, p in enumerate(points)]})
        await touch('touchStart', [source])
        await touch('touchMove', [dict(target, y=min(target['y'], (await page.locator('#puzzleCanvas').bounding_box())['y'] + before['tray']['y'] - 12))])
        await touch('touchMove', [target])
        await touch('touchEnd', [])
        assert (await state(page))['placed'] == before['placed'] + 1, 'Trusted touch drag failed'
        before = await state(page)
        center = await canvas_points(page, [{'x': before['canvas']['width'] / 2, 'y': before['canvas']['mapBottom'] / 2}])
        x, y = center[0]['x'], center[0]['y']
        await touch('touchStart', [{'x': x - 30, 'y': y}, {'x': x + 30, 'y': y}])
        await touch('touchMove', [{'x': x - 60, 'y': y}, {'x': x + 60, 'y': y}])
        await touch('touchEnd', [])
        after = await state(page)
        assert after['view']['k'] > before['view']['k'] * 1.1, ('Trusted pinch did not zoom', before, after)
        assert (after['placed'], after['errors']) == (before['placed'], before['errors']), 'Pinch placed a piece'
        await cdp.detach()
        record['touch'] = 'Trusted Chromium CDP drag and two-finger pinch; emulated device'
    else:
        before = await state(page)
        await page.locator('#puzzleZoomIn').tap()
        assert (await state(page))['view']['k'] > before['view']['k'], 'Trusted touch tap did not zoom'
        before = await state(page)
        x, y = before['canvas']['width'] / 2, before['canvas']['mapBottom'] / 2
        await gesture(page, [
            {'type': 'pointerdown', 'id': 7, 'x': x - 25, 'y': y},
            {'type': 'pointerdown', 'id': 8, 'x': x + 25, 'y': y},
            {'type': 'pointermove', 'id': 7, 'x': x - 55, 'y': y},
            {'type': 'pointermove', 'id': 8, 'x': x + 55, 'y': y},
            {'type': 'pointerup', 'id': 7, 'x': x - 55, 'y': y},
            {'type': 'pointerup', 'id': 8, 'x': x + 55, 'y': y},
        ])
        after = await state(page)
        assert after['view']['k'] > before['view']['k'] * 1.1, 'Synthetic pinch did not zoom'
        assert (after['placed'], after['errors']) == (before['placed'], before['errors'])
        record['touch'] = 'Trusted touchscreen tap; synthetic two-pointer pinch (no physical-device claim)'
    await check_layout(page, record, 'after-mixed-input')


def almost_pair(actual, expected, message, tolerance=1e-5):
    assert actual is not None and expected is not None, (message, actual, expected)
    assert max(abs(a - b) for a, b in zip(actual, expected)) < tolerance, (message, actual, expected)


async def fullscreen_resize(page, context, browser_name, server, record):
    await page.add_init_script('Element.prototype.requestFullscreen=undefined;Element.prototype.webkitRequestFullscreen=undefined;')
    await open_game(page, server, locale='en')
    await page.locator('#puzzleCanvas').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Shift+ArrowRight')
    await page.locator('#puzzleZoomIn').tap()
    baseline = (await draft(page))['state']
    await page.locator('#puzzleFullscreen').evaluate("el=>el.addEventListener('click',()=>{window.__qaFullscreenFocus=document.activeElement?.id},{capture:true,once:true})")
    await page.locator('#puzzleFullscreen').tap()
    await page.locator('.is-puzzle-fullscreen').wait_for()
    for width, height in [(390,844), (844,390), (320,568), (568,320), (1024,768)]:
        await page.set_viewport_size({'width': width, 'height': height})
        await page.wait_for_timeout(200)
        await check_layout(page, record, f'fallback-{width}x{height}')
        saved = (await draft(page))['state']
        assert saved['attemptId'] == baseline['attemptId'] and saved['current'] == baseline['current']
        assert abs(saved['view']['zoom'] - baseline['view']['zoom']) < 1e-5, ('Relative zoom changed', baseline['view'], saved['view'])
        almost_pair(saved['view']['centre'], baseline['view']['centre'], 'Geographic center changed')
        almost_pair(saved['pieces'][saved['current']]['point'], baseline['pieces'][baseline['current']]['point'], 'Piece geographic position changed')
        assert await page.locator('#puzzleProgressTrack').is_visible()
    await page.keyboard.press('Escape')
    assert not await page.locator('.is-puzzle-fullscreen').count()
    assert not await page.locator('body.puzzle-fullscreen-active').count()
    assert await page.evaluate('document.activeElement?.id===window.__qaFullscreenFocus'), 'Fullscreen did not restore pre-entry focus'
    record['preserved'] = ['attempt', 'current piece geographic position', 'geographic view center', 'relative zoom', 'progress', 'focus']


async def native_fullscreen(page, context, browser_name, server, record):
    await open_game(page, server)
    await page.locator('#puzzleFullscreen').tap()
    await page.wait_for_timeout(200)
    record['implementation'] = await page.evaluate("document.fullscreenElement?'native':document.querySelector('.is-puzzle-fullscreen')?'fallback':'none'")
    assert record['implementation'] != 'none', 'Fullscreen button had no effect'
    await check_layout(page, record, 'fullscreen')
    await page.locator('#puzzleFullscreen').tap()
    assert await page.evaluate("!document.fullscreenElement&&!document.querySelector('.is-puzzle-fullscreen')"), 'Exit button failed'


async def hint_limit(page, context, browser_name, server, record):
    await open_game(page, server)
    await page.locator('#puzzleCanvas').focus()
    for used in range(1, 11):
        await page.keyboard.press('h')
        assert (await state(page))['hints'] == used, ('Hint count', used, await state(page))
        await page.keyboard.press('h')
        assert (await state(page))['hints'] == used, 'Repeated active hint was counted'
        if used != 10:
            await page.wait_for_timeout(2250)
    assert await page.locator('#puzzleHint').is_disabled()
    before = await state(page)
    await page.reload(wait_until='domcontentloaded')
    after = await ready(page)
    assert after['attemptId'] == before['attemptId'] and after['hints'] == 10
    await page.locator('#puzzleCanvas').focus()
    await page.keyboard.press('h')
    assert (await state(page))['hints'] == 10, 'Eleventh hint allowed after reload'
    record['hints'] = {'used': 10, 'activeRepeatsIgnored': True, 'reloadPreserved': True, 'eleventhBlocked': True}


async def confirmations(page, context, browser_name, server, record):
    await open_game(page, server, locale=record['locale'])
    await trusted_drop(page)
    original = await state(page)
    dialogs = []

    async def dismiss(dialog):
        dialogs.append(dialog.message)
        await dialog.dismiss()

    page.on('dialog', dismiss)
    for selector in ['[data-puzzle-difficulty="hard"]', '[data-puzzle-mode="world-countries"]', '#puzzleReset']:
        count = len(dialogs)
        await page.locator(selector).click()
        await page.wait_for_timeout(50)
        after = await state(page)
        assert len(dialogs) == count + 1, ('Expected exactly one confirmation', selector, dialogs)
        assert (after['attemptId'], after['placed'], after['difficulty'], after['mode']) == (original['attemptId'], original['placed'], original['difficulty'], original['mode']), ('Cancel lost state', selector)
    page.remove_listener('dialog', dismiss)
    accepted = []

    async def accept(dialog):
        accepted.append(dialog.message)
        await dialog.accept()

    page.on('dialog', accept)
    await page.locator('[data-puzzle-difficulty="hard"]').click()
    await page.wait_for_function("id=>{const s=window.__puzzleRead();return s.ready&&!s.loading&&s.attemptId!==id&&s.difficulty==='hard'}", arg=original['attemptId'])
    assert len(accepted) == 1 and (await state(page))['placed'] == 0
    assert await page.locator('#puzzleDifficulty').is_hidden()
    assert await page.locator('[data-puzzle-difficulty]').count() == 3
    assert await page.locator('#puzzleStart,[data-puzzle-start-duplicate],#puzzleSourceTitle,#puzzleResultErrors').count() == 0
    record['confirmationDialogs'] = {'cancelled': dialogs, 'accepted': accepted}
    await check_layout(page, record, 'localized-controls')


async def graded_rules(page, context, browser_name, server, record):
    await open_game(page, server, 'seminar', record['locale'])
    assert await page.locator('#puzzleHint').is_hidden()
    results = []
    for difficulty, expected in [('hard', 5), ('easy', 3), ('medium', 4)]:
        if results:
            await page.locator('#puzzlePlayAgain').click()
            await page.wait_for_function("window.__puzzleRead().ready&&!window.__puzzleRead().loading&&!window.__puzzleRead().finished")
        await page.locator(f'[data-puzzle-difficulty="{difficulty}"]').click()
        await page.wait_for_function("difficulty=>window.__puzzleRead().difficulty===difficulty&&!window.__puzzleRead().loading", arg=difficulty)
        await page.locator('#puzzleCanvas').focus()
        before = await state(page)
        await page.keyboard.press('h')
        assert (await state(page))['hints'] == 0, 'H key enabled graded hint'
        assert (await state(page))['inTray'], 'H key revealed the graded answer'
        # Every piece follows the actual pointer handlers. No completion setters.
        await place_pieces(page, before['total'])
        await page.locator('#puzzleResultDialog[open]').wait_for()
        saved = (await draft(page, 'seminar'))['state']
        assert saved['completionReceipt']['points'] == expected, saved['completionReceipt']
        assert saved['completionReceipt']['best_points'] == 5, ('Best grade decreased after expert completion', saved['completionReceipt'])
        assert saved['hints'] == 0
        assert await page.locator('#puzzleResultDialog .puzzle-result-metric').count() == 3
        assert not await page.locator('#puzzleResultErrors').count()
        results.append({'difficulty': difficulty, 'points': expected, 'attempt': saved['attemptId']})
        await page.reload(wait_until='domcontentloaded')
        restored = await ready(page)
        assert restored['finished'] and restored['attemptId'] == saved['attemptId'], 'Completed graded attempt restarted'
        await page.locator('#puzzleResultDialog[open]').wait_for()
    stored = await page.evaluate("""async()=>{const {durableStore}=await import('../assets/js/durable-store.js');return durableStore.listAttempts()}""")
    attempts = [entry for entry in stored if entry.get('activitySlug') == 'seminar-2']
    assert len(attempts) == 3 and len({entry['id'] for entry in attempts}) == 3, ('Duplicate graded attempts', attempts)
    assert max(entry['points'] for entry in attempts) == 5
    record['gradedResults'] = results
    record['bestRetained'] = 5
    await check_layout(page, record, 'graded-result')


async def rapid_and_route(page, context, browser_name, server, record):
    # Install before mount because the engine intentionally captures its own
    # fetch bridge to isolate a disposed route from the following route.
    await page.add_init_script("""(()=>{
      const wrap=fetcher=>function(input,options){const result=fetcher.call(this,input,options);const url=typeof input==='string'?input:input?.url||'';
        if(window.__qaDelayMetadata&&url.includes('/data/country-adm1/USA')){window.__qaDelayedMetadata=(window.__qaDelayedMetadata||0)+1;return Promise.resolve(result).then(response=>new Promise(resolve=>setTimeout(()=>resolve(response),6000)))}return result};
      let current=wrap(window.fetch);
      Object.defineProperty(window,'fetch',{configurable:true,get:()=>current,set:value=>{current=wrap(value)}});
    })()""")
    await page.goto(server.base + 'index.html#puzzle', wait_until='domcontentloaded')
    await ready(page)
    # Delay only a public persistence adapter's acknowledgment, never modify
    # engine state. A later selection must not be overtaken by the first save.
    await page.evaluate("""()=>{
      const p=document.querySelector('#geoPuzzleApp').puzzleProgress;
      window.__qaSave=p.save;window.__qaDelayedSaves=0;
      p.save=snapshot=>{const saved=window.__qaSave(snapshot);if(window.__qaDelayedSaves++===0)return new Promise(resolve=>setTimeout(resolve,650)).then(()=>saved);return saved};
    }""")
    await page.locator('[data-puzzle-difficulty="hard"]').click()
    await page.locator('[data-puzzle-difficulty="easy"]').click()
    await page.wait_for_function("window.__puzzleRead().difficulty==='easy'&&!window.__puzzleRead().loading")
    await page.wait_for_timeout(700)
    assert (await state(page))['difficulty'] == 'easy', 'Older slow checkpoint replaced latest difficulty'
    assert await page.evaluate('window.__qaDelayedSaves') >= 2
    await page.evaluate("()=>{document.querySelector('#geoPuzzleApp').puzzleProgress.save=window.__qaSave;}")
    record['delayedCheckpointLatestWins'] = True
    # A map selection immediately after a difficulty selection inherits the
    # pending difficulty, even while the previous checkpoint is still pending.
    await page.evaluate("""()=>{
      const p=document.querySelector('#geoPuzzleApp').puzzleProgress;
      window.__qaModeSave=p.save;window.__qaModeSaves=0;
      p.save=snapshot=>{const saved=window.__qaModeSave(snapshot);if(window.__qaModeSaves++===0)return new Promise(resolve=>setTimeout(resolve,650)).then(()=>saved);return saved};
    }""")
    await page.locator('[data-puzzle-difficulty="hard"]').click()
    await page.locator('[data-puzzle-mode="world-countries"]').click()
    inherited = await ready(page, {'mode': 'world-countries', 'selection': None})
    assert inherited['difficulty'] == 'hard', ('Immediate mode selection lost pending hard difficulty', inherited['difficulty'])
    await page.wait_for_timeout(700)
    assert (await state(page))['difficulty'] == 'hard' and (await state(page))['mode'] == 'world-countries'
    assert await page.evaluate('window.__qaModeSaves') >= 2
    await page.evaluate("()=>{document.querySelector('#geoPuzzleApp').puzzleProgress.save=window.__qaModeSave;}")
    await page.locator('[data-puzzle-mode="russia-subjects"]').click()
    await ready(page, {'mode': 'russia-subjects', 'selection': None})
    record['pendingDifficultyInheritedByMode'] = True
    # Delay the same public fetch bridge used by the game. This also exercises
    # latest-selection cancellation when a service worker has warm assets.
    await page.evaluate("()=>{window.__qaDelayMetadata=true;window.__qaDelayedMetadata=0;}")
    original = await state(page)
    await page.locator('[data-puzzle-mode="country-regions"]').click()
    await page.wait_for_function('window.__qaDelayedMetadata>0')
    assert (await state(page))['loading'], 'Delayed replacement already settled before cancellation'
    await page.locator('[data-puzzle-mode="russia-subjects"]').click()
    await page.wait_for_timeout(200)
    canceled = await ready(page)
    record['pendingMapRace'] = {'before': {'mode': original['mode'], 'attemptId': original['attemptId']}, 'after': {'mode': canceled['mode'], 'attemptId': canceled['attemptId']}, 'delayedMetadata': await page.evaluate('window.__qaDelayedMetadata')}
    assert canceled['mode'] == 'russia-subjects' and canceled['attemptId'] == original['attemptId'], 'Clicking current map did not cancel pending replacement'
    await page.wait_for_timeout(6100)
    assert (await state(page))['attemptId'] == original['attemptId'], 'Canceled response replaced the retained current map later'
    record['pendingMapCanceledByCurrentSelection'] = True
    continued = []
    for action in ['hint-key', 'trusted-drag']:
        if action == 'trusted-drag':
            await page.locator('#puzzleReturn').click()
            page.once('dialog', lambda dialog: asyncio.create_task(dialog.accept()))
        before = await state(page)
        await page.evaluate('()=>{window.__qaDelayedMetadata=0;}')
        await page.locator('[data-puzzle-mode="country-regions"]').click()
        await page.wait_for_function('window.__qaDelayedMetadata>0')
        assert (await state(page))['loading'], 'Replacement was not pending when continuing the old game'
        await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
        if action == 'hint-key':
            await page.locator('#puzzleCanvas').focus()
            await page.keyboard.press('h')
        else:
            await trusted_drop(page)
        after = await state(page)
        assert after['attemptId'] == before['attemptId'] and after['mode'] == 'russia-subjects' and not after['loading'], ('Continuing current game did not cancel pending replacement', action, before['attemptId'], after['attemptId'], after['mode'])
        assert after['hints'] == before['hints'] + (1 if action == 'hint-key' else 0)
        assert after['placed'] == before['placed'] + (1 if action == 'trusted-drag' else 0)
        await page.wait_for_timeout(6100)
        settled = await state(page)
        assert (settled['attemptId'], settled['hints'], settled['placed'], settled['mode']) == (after['attemptId'], after['hints'], after['placed'], after['mode']), ('Delayed response discarded the continued game', action)
        continued.append({'action': action, 'attemptUnchanged': True, 'hints': after['hints'], 'placed': after['placed']})
    await page.evaluate('()=>{window.__qaDelayMetadata=false;}')
    record['pendingMapCanceledByGameplay'] = continued
    page.once('dialog', lambda dialog: asyncio.create_task(dialog.accept()))
    await page.locator('[data-puzzle-mode="country-regions"]').click()
    await ready(page, {'mode': 'country-regions', 'selection': 'USA'})
    await page.locator('#puzzleCountry option[value="CAN"]').wait_for(state='attached')
    seen = []

    async def delayed(route):
        seen.append(route.request.url)
        await asyncio.sleep(.8)
        try:
            await route.continue_()
        except Exception:
            pass  # A canceled superseded request is the expected outcome.

    await context.route('**/adm1/CAN.geojson*', delayed)
    await page.locator('#puzzleCountry').select_option('CAN')
    await page.locator('#puzzleCountry').select_option('IND')
    await ready(page, {'mode': 'country-regions', 'selection': 'IND'})
    await page.wait_for_timeout(900)
    assert (await state(page))['selection'] == 'IND', 'An older map replaced the latest selection'
    await context.route('**/adm1/AUS.geojson*', delayed)
    await page.locator('#puzzleCountry').select_option('AUS')
    await page.evaluate("location.hash='#dashboard'")
    await page.wait_for_function("!document.querySelector('#geoPuzzleApp')")
    await page.wait_for_timeout(900)
    assert not await page.locator('#geoPuzzleApp').count(), 'Delayed load mounted after route disposal'
    await page.evaluate("location.hash='#puzzle'")
    restored = await ready(page)
    assert await page.locator('#geoPuzzleApp').count() == 1
    assert await page.locator('#puzzleResultDialog').count() == 1
    record['delayedRequests'] = seen
    record['latestWins'] = True
    record['routeRemount'] = {'mode': restored['mode'], 'selection': restored['selection']}
    # A warm service worker may satisfy the request itself. Do not report such a
    # run as injected latency coverage when the route callback was never invoked.
    record['latencyInjectionExercised'] = bool(seen)


async def two_tabs(page, context, browser_name, server, record):
    await open_game(page, server)
    await trusted_drop(page)
    baseline = await draft(page)
    second = await context.new_page()
    second._qa_base = server.base
    second._qa_locale = record['locale']
    watch(second, record)
    await second.goto(server.base + 'apps/puzzle.html?context=free', wait_until='domcontentloaded')
    await ready(second)
    writable_first = await page.evaluate("document.querySelector('#geoPuzzleApp').puzzleProgress.canWrite()")
    writable_second = await second.evaluate("document.querySelector('#geoPuzzleApp').puzzleProgress.canWrite()")
    assert writable_first != writable_second, ('Exactly one writer required', writable_first, writable_second)
    writer, reader = (page, second) if writable_first else (second, page)
    before = await state(reader)
    await reader.locator('#puzzleCanvas').focus()
    await reader.keyboard.press('h')
    assert (await state(reader))['hints'] == before['hints'], 'Passive tab accepted a mutation'
    # Read-only observation of the latest stored head, then real owner closure.
    record['writerBeforeClose'] = await writer.evaluate("({visible:document.visibilityState,writable:document.querySelector('#geoPuzzleApp').puzzleProgress.canWrite()})")
    record['readerBeforeClose'] = await reader.evaluate("({visible:document.visibilityState,writable:document.querySelector('#geoPuzzleApp').puzzleProgress.canWrite()})")
    await writer.close()
    await reader.bring_to_front()
    try:
        await reader.wait_for_function("document.querySelector('#geoPuzzleApp').puzzleProgress.canWrite()", timeout=10000)
    except Exception:
        record['readerAfterClose'] = await reader.evaluate("async()=>({visible:document.visibilityState,writable:document.querySelector('#geoPuzzleApp').puzzleProgress.canWrite(),locks:await navigator.locks?.query(),state:window.__puzzleRead()})")
        raise
    await reader.wait_for_function("id=>{const s=window.__puzzleRead();return s.ready&&!s.loading&&s.attemptId===id&&s.placed===1}", arg=baseline['attemptId'])
    await reader.locator('#puzzleCanvas').scroll_into_view_if_needed()
    await trusted_drop(reader)
    latest = await draft(reader)
    assert latest['state']['placed'] == 2 and latest['attemptId'] == baseline['attemptId'], 'Writer transfer lost the latest progress'
    record['writerTransfer'] = {'before': 1, 'after': 2, 'attemptUnchanged': True, 'passiveTabIgnored': True}


SCENARIOS = {
    'input': input_and_cancel,
    'fullscreen': fullscreen_resize,
    'native-fullscreen': native_fullscreen,
    'hints': hint_limit,
    'confirmations': confirmations,
    'graded': graded_rules,
    'rapid-route': rapid_and_route,
    'two-tabs': two_tabs,
}


async def run(args, server):
    results = []
    async with async_playwright() as playwright:
        for browser_name in args.browsers.split(','):
            options = {'headless': True}
            if browser_name == 'firefox':
                options['firefox_user_prefs'] = {'network.proxy.type': 0}
            browser = await getattr(playwright, browser_name).launch(**options)
            try:
                for scenario in args.scenarios.split(','):
                    locales = args.locales.split(',') if scenario in ('confirmations', 'graded') else ['en' if scenario == 'fullscreen' else 'ru']
                    for locale in locales:
                        record = {'browser': browser_name, 'scenario': scenario, 'locale': locale, 'status': 'failed'}
                        started = time.monotonic()
                        context = await context_for(browser, server, args.output, (390,844), locale, record)
                        page = await context.new_page()
                        page._qa_base = server.base
                        page._qa_locale = locale
                        watch(page, record)
                        try:
                            await SCENARIOS[scenario](page, context, browser_name, server, record)
                            assert not record.get('pageErrors'), record.get('pageErrors')
                            assert not record.get('unexpectedWrites'), record.get('unexpectedWrites')
                            record['status'] = 'passed'
                        except Exception as error:
                            record['error'] = str(error)
                            record['traceback'] = traceback.format_exc()
                            if not page.is_closed():
                                try:
                                    path = args.output / 'interactions-failures' / f'{browser_name}-{scenario}-{locale}.png'
                                    path.parent.mkdir(parents=True, exist_ok=True)
                                    await page.screenshot(path=str(path))
                                    record['screenshot'] = str(path)
                                    record['lastState'] = await page.evaluate('window.__puzzleRead?.()')
                                except Exception:
                                    pass
                        finally:
                            await context.close()
                        record['seconds'] = round(time.monotonic() - started, 2)
                        results.append(record)
                        with (args.output / 'interactions.jsonl').open('a', encoding='utf-8') as handle:
                            handle.write(json.dumps(record, ensure_ascii=False, separators=(',', ':')) + '\n')
                        print(f'{browser_name} {scenario} {locale}: {record["status"]} ({record["seconds"]}s) {record.get("error", "")[:200]}', flush=True)
            finally:
                await browser.close()
    report = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'expected': len(results),
              'passed': sum(item['status'] == 'passed' for item in results),
              'failed': sum(item['status'] != 'passed' for item in results), 'results': results,
              'physicalDevices': 'Not tested', 'productionWrites': 'Blocked by CSP and network routing',
              'requestedScenarios': args.scenarios.split(','), 'requestedBrowsers': args.browsers.split(','),
              'requestedLocales': args.locales.split(',')}
    write_json(args.output / 'interactions.json', report)
    return 1 if report['failed'] else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--browsers', default='chromium,firefox,webkit')
    parser.add_argument('--locales', default='ru,en,zh', help='Locales for localized confirmations and graded flows')
    parser.add_argument('--scenarios', default=','.join(SCENARIOS))
    parser.add_argument('--port', type=int, default=0)
    args = parser.parse_args()
    args.output = args.output.resolve()
    if args.output.is_relative_to(ROOT):
        parser.error('Artifacts must be outside repository')
    if not set(args.browsers.split(',')) <= {'chromium', 'firefox', 'webkit'}:
        parser.error('Unknown browser')
    if not set(args.scenarios.split(',')) <= set(SCENARIOS):
        parser.error('Unknown scenario')
    if not set(args.locales.split(',')) <= {'ru', 'en', 'zh'}:
        parser.error('Unknown locale')
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'interactions.jsonl').write_text('', encoding='utf-8')
    with PuzzleServer(args.output, args.port) as server:
        print('Isolated interaction server: ' + server.base, flush=True)
        return asyncio.run(run(args, server))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
