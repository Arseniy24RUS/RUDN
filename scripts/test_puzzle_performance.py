#!/usr/bin/env python3
"""Real desktop Chrome/Edge smoke and drag latency; isolated loopback data only."""
import argparse
import asyncio
import json
import math
import statistics
import time
import traceback
from pathlib import Path
from playwright.async_api import async_playwright
import test_puzzle_catalog as catalog_module
from test_puzzle_catalog import (PuzzleServer, context_for, observe, start_map,
                                 ready, trusted_drop, offline_resume, build_catalog)


DRAW_TIMING_HOOK = r"""
  // Test-only instrumentation of actual Canvas render work; never changes game state.
  const qaOriginalDrawAll=drawAll;
  drawAll=function(...args){const start=performance.now();try{return qaOriginalDrawAll(...args)}finally{
    const metrics=window.__qaPerf;if(metrics?.measuring)metrics.draws.push(performance.now()-start);
  }};
  window.__qaHeaviestFeature=()=>{
    const count=coordinates=>!Array.isArray(coordinates)?0:typeof coordinates[0]==='number'?1:coordinates.reduce((sum,child)=>sum+count(child),0);
    return state.features.map((feature,index)=>({index,vertices:count(feature.geometry?.coordinates)}))
      .sort((a,b)=>b.vertices-a.vertices||a.index-b.index)[0];
  };
"""


async def drawing_metrics(page):
    values = sorted(await page.evaluate('window.__qaPerf.draws'))
    assert values, 'No Canvas drawing was measured'
    return {'samples':len(values), 'p50':round(statistics.median(values),2),
            'p95':round(values[min(len(values)-1,int(len(values)*.95))],2), 'max':round(max(values),2)}


async def begin_measurement(page):
    await page.evaluate("""() => {
      Object.assign(window.__qaPerf,{frames:[],longTasks:[],handlers:[],latencies:[],draws:[],measuring:true});
      let last=performance.now();
      const generation=window.__qaPerf.generation=(window.__qaPerf.generation||0)+1;
      function frame(t){
        if(!window.__qaPerf.measuring||window.__qaPerf.generation!==generation)return;
        window.__qaPerf.frames.push(t-last);last=t;requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }""")


async def end_measurement(page):
    # Canvas commands can defer rasterization until the next frame. Include the
    # following animation frames instead of reporting only handler duration.
    await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    frames = sorted(value for value in await page.evaluate('window.__qaPerf.measuring=false;window.__qaPerf.frames') if value > 0)
    assert frames, 'No animation frames were measured'
    return {'samples':len(frames), 'p50':round(statistics.median(frames),2),
            'p95':round(frames[min(len(frames)-1,int(len(frames)*.95))],2), 'max':round(max(frames),2)}


async def zoom_and_pan(page):
    result = {}
    await page.locator('#puzzleReturn').click()
    for phase in ['zoom','pan']:
        await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
        await begin_measurement(page)
        box = await page.locator('#puzzleCanvas').bounding_box()
        state = await page.evaluate('window.__puzzleRead()')
        area = state['map']
        if phase == 'zoom':
            await page.mouse.move(box['x']+area['x']+area['width']/2, box['y']+area['y']+area['height']/2)
            for delta in [-180]*8+[180]*8:
                await page.mouse.wheel(0,delta)
                await page.evaluate('new Promise(requestAnimationFrame)')
        else:
            x,y = box['x']+area['x']+area['width']/2,box['y']+area['y']+area['height']/2
            await page.mouse.move(x,y)
            await page.mouse.down()
            for step in range(24):
                await page.mouse.move(x+step*2,y+step)
            await page.mouse.up()
        frames = await end_measurement(page)
        assert await page.evaluate('window.__qaPerf.draws.length>0'), f'No Canvas draws in {phase}'
        result[phase]={'drawMs':await drawing_metrics(page), 'frameMs':frames, 'longTasksMs':await page.evaluate('window.__qaPerf.longTasks')}
        await page.locator('#puzzleCenter').click()
    return result


def write_progress(args, results):
    report={'method':'Trusted input; instrumented Canvas draw work, RAF intervals, long tasks and GC heap; desktop browser runtime',
            'physicalMobileDevices':False, 'cycles':args.cycles, 'cpuRates':args.cpu_rates, 'results':results}
    (args.output/'desktop-performance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')


def performance_budget(row):
    # Reference-runner regression guardrails, not a physical-device FPS claim.
    # Keep first-raster/long-task spikes visible as well as the steady-state P95.
    rate = max(1, row['cpuThrottle'])
    frame_scale = math.sqrt(rate)
    checks = {'loadLongTaskMs':(max(row.get('loadLongTasksMs',[]),default=0),3000*rate)}
    if 'dragFrameP95Ms' in row:
        checks['dragP95Ms'] = (row['dragFrameP95Ms'],50*frame_scale)
        checks['dragMaxMs'] = (row['dragFrameMaxMs'],250*frame_scale)
    for phase, values in row.get('zoomAndPan',{}).items():
        checks[phase+'P95Ms'] = (values['frameMs']['p95'],(100 if phase=='zoom' else 50)*frame_scale)
        if phase=='pan':checks[phase+'MaxMs'] = (values['frameMs']['max'],250*frame_scale)
    return {'passed':all(actual<=limit for actual,limit in checks.values()),
            'checks':{name:{'actual':actual,'limit':round(limit,2),'passed':actual<=limit} for name,(actual,limit) in checks.items()}}


async def run(args, server):
    catalog = {m['id']: m for m in build_catalog()}
    ids = args.maps.split(',') if args.maps else ['russia-subjects', 'adm1-CHL', 'adm1-CAN', 'adm1-IDN', 'world-countries', 'adm1-MCO']
    assert ids and all(identifier in catalog for identifier in ids), 'Unknown or empty performance map selection'
    results = []
    async with async_playwright() as playwright:
        for channel in args.channels.split(','):
            options = {'executable_path': str(args.chrome)} if channel == 'chrome' and args.chrome else {} if channel == 'chromium' else {'channel': channel}
            browser = await playwright.chromium.launch(headless=True, **options)
            record = {'browser': channel, 'version': browser.version, 'status': 'running', 'maps': []}
            context = await context_for(browser, server, args.output, (1366, 768), 'ru', record)
            page = await context.new_page()
            page._qa_base, page._qa_locale = server.base, 'ru'
            observe(page, record)
            await page.add_init_script("""window.__qaPerf={longTasks:[]};
              new PerformanceObserver(list=>window.__qaPerf.longTasks.push(...list.getEntries().map(e=>e.duration)))
                .observe({type:'longtask',buffered:true});
              document.addEventListener('pointermove',()=>window.__qaPerf.eventStart=performance.now(),true);
              document.addEventListener('pointermove',()=>{if(window.__qaPerf.measuring){
                window.__qaPerf.handlers.push(performance.now()-window.__qaPerf.eventStart);
                const start=performance.now();requestAnimationFrame(()=>window.__qaPerf.latencies.push(performance.now()-start));
              }});""")
            cdp = await context.new_cdp_session(page)
            heaps = []
            try:
                for cycle in range(args.cycles):
                    rate = args.cpu_rates[cycle % len(args.cpu_rates)]
                    await cdp.send('Emulation.setCPUThrottlingRate', {'rate':rate})
                    for map_id in ids:
                        if cycle or map_id != ids[0]:
                            await page.evaluate('window.__qaPerf.longTasks=[]')
                        started = time.monotonic()
                        state = await start_map(page, catalog[map_id], 'medium')
                        row = {'id': map_id, 'cycle': cycle, 'cpuThrottle':rate, 'loadSeconds': round(time.monotonic()-started, 3)}
                        row['includesInitialWorldBootstrap'] = cycle == 0 and map_id == ids[0]
                        row['loadLongTasksMs'] = await page.evaluate('window.__qaPerf.longTasks')
                        if map_id != 'adm1-MCO':
                            # Reach the most detailed territory through actual
                            # input. Random shuffle must not make a light island
                            # stand in for the expensive active contour.
                            heavy = await page.evaluate('window.__qaHeaviestFeature()')
                            while state['current'] != heavy['index']:
                                await trusted_drop(page)
                                state = await page.evaluate('window.__puzzleRead()')
                                assert not state['finished'], 'Heaviest territory was not reached'
                            row['activeFeature'] = heavy
                            row['preparationPlacements'] = state['placed']
                            # Include the very first lift out of the tray: warming a
                            # sprite with Enter before timing would hide its first-raster cost.
                            await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
                            state = await page.evaluate('window.__puzzleRead()')
                            box = await page.locator('#puzzleCanvas').bounding_box()
                            x, y = box['x'] + state['source']['x'], box['y'] + state['source']['y']
                            area = state['map']
                            corners = [(area['x']+area['width']*cx,area['y']+area['height']*cy) for cx in (.15,.85) for cy in (.15,.85)]
                            destination = max(corners,key=lambda point:(point[0]-state['target']['x'])**2+(point[1]-state['target']['y'])**2)
                            destination_x, destination_y = box['x']+destination[0],box['y']+destination[1]
                            await page.mouse.move(x, y)
                            await page.mouse.down()
                            await begin_measurement(page)
                            for step in range(36):
                                progress = min(1,(step+1)/18)
                                await page.mouse.move(x+(destination_x-x)*progress+(step%9)*2,
                                                      y+(destination_y-y)*progress-(step%7)*2)
                            await page.mouse.up()
                            frames = await end_measurement(page)
                            row['dragFrames'] = frames['samples']
                            row['dragFrameP50Ms'] = frames['p50']
                            row['dragFrameP95Ms'] = frames['p95']
                            row['dragFrameMaxMs'] = frames['max']
                            for key in ('handlers', 'latencies'):
                                values = sorted(await page.evaluate(f'window.__qaPerf.{key}'))
                                row[key+'P95Ms'] = round(values[min(len(values)-1, int(len(values)*.95))], 2) if values else None
                            row['dragLongTasksMs'] = await page.evaluate('window.__qaPerf.longTasks')
                            row['dragDrawMs'] = await drawing_metrics(page)
                            row['zoomAndPan'] = await zoom_and_pan(page)
                            await page.locator('#puzzleReturn').click()
                        await trusted_drop(page)
                        if cycle == 0:
                            await offline_resume(page, context, await page.evaluate('window.__puzzleRead()'), row)
                            await context.set_offline(False)
                        await cdp.send('HeapProfiler.collectGarbage')
                        heap = (await cdp.send('Runtime.getHeapUsage'))['usedSize']
                        heaps.append(heap)
                        row['retainedHeapMiB'] = round(heap/1024/1024, 2)
                        row['performanceBudget'] = performance_budget(row)
                        row['status'] = 'passed'
                        record['maps'].append(row)
                        write_progress(args,results+[record])
                        print(channel, cycle, map_id, row['dragFrameP95Ms'] if 'dragFrameP95Ms' in row else '-', row['retainedHeapMiB'], flush=True)
                assert not record.get('pageErrors'), record.get('pageErrors')
                assert not record.get('unexpectedWrites'), record.get('unexpectedWrites')
                if args.enforce_budgets:
                    failed = [{key:row[key] for key in ('id','cpuThrottle','performanceBudget')} for row in record['maps'] if not row['performanceBudget']['passed']]
                    assert not failed, f'Performance guardrails exceeded: {json.dumps(failed)}'
                record['status'] = 'passed'
                record['retainedHeapAfterCyclesMiB'] = [round(heaps[(i+1)*len(ids)-1]/1024/1024,2) for i in range(args.cycles)]
            except Exception as error:
                record['status']='failed'
                record['error'] = str(error)
                record['lastState']=await page.evaluate('window.__puzzleRead?.()')
                record['traceback'] = traceback.format_exc()
                print(record['traceback'],flush=True)
                await page.screenshot(path=str(args.output / f'performance-{channel}-failure.png'))
            finally:
                await context.close()
                await browser.close()
                results.append(record)
                write_progress(args,results)
    report = {'method':'Reported desktop browser runtime; trusted input; actual Canvas work, animation-frame intervals, long tasks and GC heap measurement',
              'physicalMobileDevices': False, 'cycles':args.cycles, 'cpuRates':args.cpu_rates, 'results':results}
    (args.output / 'desktop-performance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return int(any(r['status'] != 'passed' for r in results))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--channels',default='msedge,chrome')
    parser.add_argument('--chrome',type=Path)
    parser.add_argument('--cycles',type=int,default=3)
    parser.add_argument('--maps',help='Optional comma-separated map IDs for a targeted desktop smoke; default covers all six performance maps')
    parser.add_argument('--enforce-budgets',action='store_true',help='Fail on reference-runner frame and long-task regression guardrails')
    parser.add_argument('--cpu-rates',default='1,4,6')
    args = parser.parse_args()
    args.cpu_rates = [float(value) for value in args.cpu_rates.split(',')]
    catalog_module.READ_ONLY_HOOK += DRAW_TIMING_HOOK
    with PuzzleServer(args.output) as server:
        raise SystemExit(asyncio.run(run(args,server)))
