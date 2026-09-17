#!/usr/bin/env python3
"""Exact worker pixels, bounded memory, cancellation and fallback on isolated data.

Readiness waits below validate preparation; latency budgets are independently
measured by test_puzzle_performance.py without waiting for a warm worker.
"""
import argparse
import asyncio
import json
from pathlib import Path
import traceback
from playwright.async_api import async_playwright
import test_puzzle_catalog as qa

HOOK = r"""
window.__rasterRead=()=>({stats:rasterPreparationStats(),snapshot:snapshotState(),
  cache:[...rasterPreparation.cache.values()].map(p=>({index:p.index,scale:p.scale,bytes:p.bytes,currentProjection:p.projection===state.projection})),
  commands:[...rasterPreparation.commands.values()].map(p=>({bytes:p.bytes,currentProjection:p.projection===state.projection})),
  complex:state.features.map((feature,index)=>({index,complex:complexFeature(index),vertices:feature.geometry.type==='Polygon'?feature.geometry.coordinates.reduce((s,r)=>s+r.length,0):feature.geometry.coordinates.reduce((s,p)=>s+p.reduce((s,r)=>s+r.length,0),0)}))});
window.__rasterPixels=()=>[...rasterPreparation.cache.values()].map(item=>{
  const actual=document.createElement('canvas'),expected=document.createElement('canvas');
  actual.width=expected.width=item.width;actual.height=expected.height=item.height;
  actual.getContext('2d').drawImage(item.bitmap,0,0);
  const context=expected.getContext('2d'),paths=highResolutionPaths(item.index);
  context.setTransform(item.dpr*item.scale,0,0,item.dpr*item.scale,-item.x0,-item.y0);
  context.fillStyle='#dc3f45';context.strokeStyle='#8e2028';context.lineWidth=1.2/item.scale;context.lineJoin=context.lineCap='round';
  context.fill(paths.path,state.mode==='russia-subjects'?'nonzero':'evenodd');context.stroke(paths.strokePath);
  const a=actual.getContext('2d').getImageData(0,0,item.width,item.height).data,b=context.getImageData(0,0,item.width,item.height).data;
  let differences=0,maximumDifference=0,nonempty=0;for(let i=0;i<a.length;i++){if(a[i]!==b[i])differences++;maximumDifference=Math.max(maximumDifference,Math.abs(a[i]-b[i]));if(i%4===3&&a[i])nonempty++;}
  return {index:item.index,scale:item.scale,bytes:a.length,differences,maximumDifference,nonempty};
});
"""


def budget(record):
    stats = record['stats']
    assert stats['reservedRasterBytes'] <= stats['rasterBudgetBytes'], stats
    assert stats['peakReservedRasterBytes'] <= stats['rasterBudgetBytes'], stats
    assert stats['commandBytes'] <= stats['commandBudgetBytes'], stats
    assert stats['peakCommandBytes'] <= stats['commandBudgetBytes'], stats
    assert all(item['currentProjection'] for item in record['cache']), record
    assert all(item['currentProjection'] for item in record['commands']), record


async def seek_heaviest(page):
    observed = await page.evaluate('window.__rasterRead()')
    index = max(observed['complex'], key=lambda item: item['vertices'])['index']
    state = await page.evaluate('window.__puzzleRead()')
    for _ in range(state['order'].index(index)):
        await qa.trusted_drop(page)
    assert (await page.evaluate('window.__puzzleRead().current')) == index
    return index


async def pixels_case(browser, engine, country, server):
    record = {'browser': engine, 'country': country, 'scenario': 'pixels-invalidation', 'status': 'running'}
    context = await qa.context_for(browser, server, server.output, (1366, 768), 'ru', record)
    if engine == 'chromium':
        await context.add_init_script(r"""(()=>{window.__rasterJobs=[];window.__wheelTimes=[];
          const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(data,...args){
            if(data?.variants)window.__rasterJobs.push({at:performance.now(),scales:data.variants.map(p=>p.scale)});return send.call(this,data,...args)};
          document.addEventListener('wheel',()=>window.__wheelTimes.push(performance.now()),true);
        })();""")
    page = await context.new_page()
    page._qa_base, page._qa_locale = server.base, 'ru'
    qa.observe(page, record)
    try:
        entry = next(item for item in qa.build_catalog() if item['id'] == 'adm1-' + country)
        await qa.start_map(page, entry, 'medium')
        index = await seek_heaviest(page)
        await page.wait_for_function("['ready','unsupported','failed'].includes(window.__rasterRead().stats.status)")
        observed = await page.evaluate('window.__rasterRead()')
        record['capability'] = observed['stats']['status']
        if record['capability'] == 'ready':
            await page.wait_for_function('(index)=>window.__rasterRead().cache.some(p=>p.index===index)', arg=index, timeout=30000)
            record['pixels'] = await page.evaluate('window.__rasterPixels()')
            assert record['pixels'] and all(p['differences'] == 0 and p['nonempty'] for p in record['pixels']), record
        else:
            assert record['capability'] == 'unsupported', observed
        observed = await page.evaluate('window.__rasterRead()')
        budget(observed)
        record['prepared'] = observed['stats']
        before = await page.evaluate('window.__puzzleRead()')
        await page.locator('#puzzleCanvas').focus()
        await page.keyboard.press('Enter')
        await page.keyboard.press('ArrowLeft')
        await page.wait_for_function('!window.__puzzleRead().inTray')
        after = await page.evaluate('window.__rasterRead()')
        budget(after)
        assert after['snapshot']['attemptId'] == before['attemptId']
        assert after['snapshot']['placed'] == before['placed']
        if record['capability'] == 'ready':
            assert after['stats']['hits'] > observed['stats']['hits'], after['stats']
        record['afterLift'] = after['stats']
        await page.locator('#puzzleReturn').click()
        if engine == 'chromium':
            await page.wait_for_function('window.__rasterRead().stats.pendingJobs===0')
            await page.evaluate('window.__rasterJobs=[];window.__wheelTimes=[]')
            await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
            box = await page.locator('#puzzleCanvas').bounding_box()
            await page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 3)
            for _ in range(6):
                await page.mouse.wheel(0, -30)
                await page.wait_for_timeout(30)
            await page.wait_for_function('window.__rasterJobs.length>0', timeout=30000)
            observation = await page.evaluate('({jobs:window.__rasterJobs,wheels:window.__wheelTimes})')
            assert len(observation['wheels']) == 6, observation
            assert all(job['at'] - observation['wheels'][-1] >= 145 for job in observation['jobs']), observation
            record['zoomDebounce'] = observation
            await page.wait_for_function('window.__rasterRead().stats.pendingJobs===0')
            reuse = await page.evaluate('window.__rasterRead()')
            budget(reuse)
            assert any(p['index'] == index and p['reusedCommands'] for p in reuse['stats']['preparations']), reuse
            record['commandReuse'] = reuse['stats']
        await page.locator('#puzzleZoomIn').click()
        await page.set_viewport_size({'width': 844, 'height': 390})
        await page.wait_for_function('()=>{const c=document.querySelector("#puzzleCanvas");return Math.abs(c.getBoundingClientRect().width-window.__puzzleRead().canvas.width)<.5}')
        budget(await page.evaluate('window.__rasterRead()'))
        assert not (await page.evaluate('window.__puzzleRead().finished'))
        assert not record.get('pageErrors'), record
        record['status'] = 'passed'
    except Exception:
        record['status'], record['error'] = 'failed', traceback.format_exc()
        record['diagnostics'] = await page.evaluate('({jobs:window.__rasterJobs,wheels:window.__wheelTimes,scene:window.__rasterRead?.(),canvas:document.querySelector("#puzzleCanvas")?.getBoundingClientRect().toJSON()})')
    finally:
        await context.close()
    return record


async def fault_case(browser, scenario, server):
    record = {'browser': 'chromium', 'scenario': scenario, 'status': 'running'}
    context = await qa.context_for(browser, server, server.output, (1366, 768), 'ru', record)
    if scenario == 'worker-error':
        await context.route('**/puzzle-raster-worker.js*', lambda route: route.fulfill(status=200, content_type='text/javascript', body="throw new Error('Isolated worker failure')"))
    else:
        await context.add_init_script(r"""(()=>{const Native=Worker;window.__heldRasters=0;window.Worker=class extends Native{
          constructor(...args){super(...args);let callback=null;Object.defineProperty(this,'onmessage',{set(value){callback=value},get(){return callback}});
          this.addEventListener('message',event=>{if(event.data.type==='ready'){window.__heldRasters++;setTimeout(()=>callback?.(event),1500)}else callback?.(event)})}
        };})();""")
    page = await context.new_page()
    page._qa_base, page._qa_locale = server.base, 'ru'
    qa.observe(page, record)
    try:
        entries = {item['id']: item for item in qa.build_catalog()}
        await qa.start_map(page, entries['adm1-CAN'], 'medium')
        if scenario == 'worker-error':
            await page.wait_for_function("window.__rasterRead().stats.status==='failed'")
            before = await page.evaluate('window.__puzzleRead()')
            await qa.trusted_drop(page)
            after = await page.evaluate('window.__puzzleRead()')
            assert after['attemptId'] == before['attemptId'] and after['placed'] == before['placed'] + 1
        else:
            await page.wait_for_function('window.__heldRasters>0', timeout=30000)
            before = await page.evaluate('window.__puzzleRead()')
            await page.locator('#puzzleCountry').select_option('CHL')
            await qa.ready(page, entries['adm1-CHL'])
            await page.wait_for_timeout(1700)  # Deliberately deliver the stale response after replacement.
            after = await page.evaluate('window.__puzzleRead()')
            assert after['attemptId'] != before['attemptId'] and after['placed'] == 0
        record['observed'] = await page.evaluate('window.__rasterRead()')
        budget(record['observed'])
        assert not record.get('pageErrors'), record
        record['status'] = 'passed'
    except Exception:
        record['status'], record['error'] = 'failed', traceback.format_exc()
    finally:
        await context.close()
    return record


async def main(args):
    qa.READ_ONLY_HOOK += HOOK
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    records = []
    with qa.PuzzleServer(Path(args.fixtures)) as server:
        async with async_playwright() as playwright:
            for engine in args.browsers:
                browser = await getattr(playwright, engine).launch(**({'firefox_user_prefs': {'network.proxy.type': 0}} if engine == 'firefox' else {}))
                try:
                    for country in ['CAN', 'CHL']:
                        record = await pixels_case(browser, engine, country, server)
                        records.append(record)
                        print(json.dumps({k: record.get(k) for k in ['browser', 'country', 'scenario', 'capability', 'status', 'error']}), flush=True)
                    if engine == 'chromium':
                        for scenario in ['worker-error', 'stale-response']:
                            record = await fault_case(browser, scenario, server)
                            records.append(record)
                            print(json.dumps({k: record.get(k) for k in ['scenario', 'status', 'error']}), flush=True)
                finally:
                    await browser.close()
                (output / 'raster-worker.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    if len(records) != len(args.browsers) * 2 + (2 if 'chromium' in args.browsers else 0) or any(item['status'] != 'passed' for item in records):
        raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixtures', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--browsers', nargs='+', default=['chromium', 'firefox', 'webkit'])
    asyncio.run(main(parser.parse_args()))
