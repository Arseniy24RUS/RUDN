#!/usr/bin/env python3
"""Real desktop Chrome/Edge smoke and drag latency; isolated loopback data only."""
import argparse
import asyncio
import json
import statistics
import time
from pathlib import Path
from playwright.async_api import async_playwright
from test_puzzle_catalog import (PuzzleServer, context_for, observe, start_map,
                                 ready, trusted_drop, offline_resume, build_catalog)


async def run(args, server):
    catalog = {m['id']: m for m in build_catalog()}
    ids = ['russia-subjects', 'adm1-RUS', 'adm1-CHL', 'adm1-CAN', 'adm1-IDN', 'world-countries', 'adm1-MCO']
    results = []
    async with async_playwright() as playwright:
        for channel in args.channels.split(','):
            options = {'executable_path': str(args.chrome)} if channel == 'chrome' else {'channel': channel}
            browser = await playwright.chromium.launch(headless=True, **options)
            record = {'browser': channel, 'version': browser.version, 'status': 'failed', 'maps': []}
            context = await context_for(browser, server, args.output, (1366, 768), 'ru', record)
            page = await context.new_page()
            page._qa_base, page._qa_locale = server.base, 'ru'
            observe(page, record)
            await page.add_init_script("""window.__qaPerf={longTasks:[]};
              new PerformanceObserver(list=>window.__qaPerf.longTasks.push(...list.getEntries().map(e=>e.duration)))
                .observe({type:'longtask',buffered:true});""")
            cdp = await context.new_cdp_session(page)
            heaps = []
            try:
                for cycle in range(args.cycles):
                    for map_id in ids:
                        started = time.monotonic()
                        state = await start_map(page, catalog[map_id], 'medium')
                        row = {'id': map_id, 'cycle': cycle, 'loadSeconds': round(time.monotonic()-started, 3)}
                        if map_id != 'adm1-MCO':
                            # Enter lifts the piece; arrows and a real mouse drag then place it.
                            await page.locator('#puzzleCanvas').press('Enter')
                            await page.locator('#puzzleCanvas').press('ArrowRight')
                            state = await page.evaluate('window.__puzzleRead()')
                            box = await page.locator('#puzzleCanvas').bounding_box()
                            x, y = box['x'] + state['source']['x'], box['y'] + state['source']['y']
                            await page.mouse.move(x, y)
                            await page.mouse.down()
                            await page.evaluate("window.__qaPerf.frames=[];window.__qaPerf.measuring=true;let last=performance.now();function frame(t){if(!window.__qaPerf.measuring)return;window.__qaPerf.frames.push(t-last);last=t;requestAnimationFrame(frame)}requestAnimationFrame(frame)")
                            for step in range(36):
                                await page.mouse.move(x + (step % 9) * 2, y - (step % 7) * 2)
                            await page.mouse.up()
                            frames = await page.evaluate("window.__qaPerf.measuring=false;window.__qaPerf.frames")
                            frames = sorted(n for n in frames if n > 0)
                            row['dragFrames'] = len(frames)
                            row['dragFrameP50Ms'] = round(statistics.median(frames), 2) if frames else None
                            row['dragFrameP95Ms'] = round(frames[min(len(frames)-1, int(len(frames)*.95))], 2) if frames else None
                            await page.locator('#puzzleReturn').click()
                        await trusted_drop(page)
                        if cycle == 0:
                            await offline_resume(page, context, await page.evaluate('window.__puzzleRead()'), row)
                            await context.set_offline(False)
                        await cdp.send('HeapProfiler.collectGarbage')
                        heap = (await cdp.send('Runtime.getHeapUsage'))['usedSize']
                        heaps.append(heap)
                        row['retainedHeapMiB'] = round(heap/1024/1024, 2)
                        row['longTasksMs'] = await page.evaluate('window.__qaPerf.longTasks')
                        row['status'] = 'passed'
                        record['maps'].append(row)
                        print(channel, cycle, map_id, row['dragFrameP95Ms'] if 'dragFrameP95Ms' in row else '-', row['retainedHeapMiB'], flush=True)
                assert not record.get('pageErrors'), record.get('pageErrors')
                assert not record.get('unexpectedWrites'), record.get('unexpectedWrites')
                record['status'] = 'passed'
                record['retainedHeapAfterCyclesMiB'] = [round(heaps[(i+1)*len(ids)-1]/1024/1024,2) for i in range(args.cycles)]
            except Exception as error:
                record['error'] = str(error)
                await page.screenshot(path=str(args.output / f'performance-{channel}-failure.png'))
            finally:
                await context.close()
                await browser.close()
                results.append(record)
    report = {'method':'Installed Edge / official Chrome for Testing; trusted keyboard and mouse; GC heap measurement; desktop only',
              'physicalMobileDevices': False, 'cycles':args.cycles, 'results':results}
    (args.output / 'desktop-performance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return int(any(r['status'] != 'passed' for r in results))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--channels',default='msedge,chrome')
    parser.add_argument('--chrome',type=Path)
    parser.add_argument('--cycles',type=int,default=3)
    args = parser.parse_args()
    with PuzzleServer(args.output) as server:
        raise SystemExit(asyncio.run(run(args,server)))
