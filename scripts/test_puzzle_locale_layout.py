#!/usr/bin/env python3
"""CI-only supplement: every selected map x EN/ZH x twelve viewport sizes.

Place under scripts/ in the isolated QA checkout. Uses the audited fixture
directory and existing production-code helpers. No application changes or writes
to production services. Every missing, duplicated or failing row fails the run.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from playwright.async_api import async_playwright
from test_puzzle_catalog import (PuzzleServer, LAYOUT_VIEWPORTS, context_for,
    observe, start_map, check_layout, build_catalog, write_json)


async def run_browser(playwright, server, args, browser_name):
    shard_index, shard_count = map(int, args.shard.split('/'))
    catalog = build_catalog()
    entries = [entry for index,entry in enumerate(catalog) if index%shard_count==shard_index-1]
    tasks = [(entry,locale) for locale in ('en','zh') for entry in entries]
    expected = {(entry['id'],locale,width,height) for entry,locale in tasks for width,height in LAYOUT_VIEWPORTS}
    stem = f'supplemental-locale-layout-{browser_name}-{shard_index}-of-{shard_count}'
    report_path, rows_path = args.output/(stem+'.json'), args.output/(stem+'.jsonl')
    rows_path.write_text('',encoding='utf-8')
    hashes = {name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in
        ['site/assets/js/puzzle-engine.js','site/assets/css/puzzle.css','site/apps/puzzle.html']}
    revision = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    queue = asyncio.Queue()
    for task in tasks:
        queue.put_nowait(task)
    launch = {'headless':True}
    if browser_name=='firefox':
        launch['firefox_user_prefs']={'network.proxy.type':0}
    browser = await getattr(playwright,browser_name).launch(**launch)
    rows, cases = [], []
    started = time.monotonic()

    def checkpoint():
        actual = {(row['map'],row['locale'],row['width'],row['height']) for row in rows}
        failed = [row for row in rows if row['status']!='passed']
        missing, extra = sorted(expected-actual), sorted(actual-expected)
        duplicates = len(rows)-len(actual)
        report = {'schemaVersion':1,'generatedAt':datetime.now(timezone.utc).isoformat(),
            'browser':browser_name,'browserVersion':browser.version,'platform':sys.platform,
            'gitHead':revision,'sourceHashes':hashes,'shard':args.shard,
            'catalogMaps':len(catalog),'maps':len(entries),'mapIds':[entry['id'] for entry in entries],
            'scope':'EN/ZH; medium; every map in shard; twelve sizes/orientations; layout only',
            'locales':['en','zh'],'viewports':LAYOUT_VIEWPORTS,
            'expected':len(expected),'observed':len(rows),'passed':len(rows)-len(failed),'failed':len(failed),
            'missingCount':len(missing),'missing':missing,'extra':extra,'duplicateRows':duplicates,
            'success':not missing and not extra and not duplicates and not failed and all(case['status']=='passed' for case in cases),
            'completedMapLocales':len(cases),'expectedMapLocales':len(tasks),
            'seconds':round(time.monotonic()-started,2),'cases':cases,'rows':rows,
            'method':'Existing check_layout assertions; isolated backend; audited fixture transport; viewport emulation'}
        write_json(report_path,report)
        return report

    async def worker(worker_id):
        record = {}
        context = await context_for(browser,server,args.output,(1366,768),'en',record)
        page = await context.new_page()
        page._qa_base = server.base
        observe(page,record)
        try:
            while not queue.empty():
                entry,locale = queue.get_nowait()
                case_start = time.monotonic()
                case = {'map':entry['id'],'locale':locale,'status':'passed','worker':worker_id}
                page._qa_locale = locale
                record.clear()
                try:
                    await context.set_offline(False)
                    await page.bring_to_front()
                    await page.set_viewport_size({'width':1366,'height':768})
                    if page.url!='about:blank':
                        await page.evaluate("window.scrollTo({left:0,top:0,behavior:'instant'})")
                    await start_map(page,entry,'medium')
                    actual_locale = await page.evaluate('window.RUDNI18N.locale')
                    assert actual_locale==locale,('Wrong app language',locale,actual_locale)
                    for width,height in LAYOUT_VIEWPORTS:
                        row = {'browser':browser_name,'map':entry['id'],'locale':locale,'difficulty':'medium',
                            'width':width,'height':height,'status':'failed'}
                        scratch = {}
                        try:
                            await page.bring_to_front()
                            await page.set_viewport_size({'width':width,'height':height})
                            metrics = await check_layout(page,scratch,f'{locale}-{width}x{height}')
                            assert not record.get('pageErrors'),record.get('pageErrors')
                            assert not record.get('unexpectedWrites'),record.get('unexpectedWrites')
                            assert not record.get('missingFixtures'),record.get('missingFixtures')
                            row.update(status='passed',scrollWidth=metrics['scrollWidth'],canvas=metrics['canvas'],
                                stage=metrics['stage'],difficultyButtons=metrics['difficulty'],features=metrics['state']['total'])
                        except Exception as error:
                            row.update(error=str(error),traceback=traceback.format_exc())
                            case['status']='failed'
                            try:
                                row['diagnostic'] = await page.evaluate("""()=>{
                                  const c=document.querySelector('#puzzleCanvas'),wrap=c?.parentElement,
                                    rect=e=>{const r=e?.getBoundingClientRect();return r?{width:r.width,height:r.height,x:r.x,y:r.y}:null},s=window.__puzzleRead?.();
                                  return {visibility:document.visibilityState,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
                                    canvas:rect(c),wrapper:rect(wrap),internal:s?.canvas,ready:s?.ready,loading:s?.loading,
                                    canvasStyle:c?{width:c.style.width,height:c.style.height}:null,
                                    wrapperStyle:wrap?{height:getComputedStyle(wrap).height,minHeight:getComputedStyle(wrap).minHeight}:null};
                                }""")
                            except Exception as diagnostic_error:
                                row['diagnosticError']=str(diagnostic_error)
                            if scratch.get('layout'):
                                row['metrics']={key:value for key,value in scratch['layout'][-1].items() if key!='state'}
                        rows.append(row)
                        with rows_path.open('a',encoding='utf-8') as output:
                            output.write(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n')
                    if case['status']!='passed':
                        path=args.output/f'{stem}-{entry["id"]}-{locale}-failure.png'
                        await page.screenshot(path=str(path))
                        case['screenshot']=str(path)
                except Exception as error:
                    case.update(status='failed',error=str(error),traceback=traceback.format_exc())
                    # Unreached rows remain missing and prevent a successful report.
                finally:
                    case['seconds']=round(time.monotonic()-case_start,2)
                    cases.append(case)
                    queue.task_done()
                    elapsed=time.monotonic()-started
                    eta=elapsed/max(1,len(cases))*(len(tasks)-len(cases))
                    print(f'{browser_name} {args.shard} {len(cases)}/{len(tasks)} {entry["id"]} {locale} {case["status"]} {case["seconds"]}s ETA {eta/60:.1f}min',flush=True)
                    if len(cases)%5==0 or queue.empty():
                        checkpoint()
                if case['status']!='passed':
                    await context.close()
                    record={}
                    context=await context_for(browser,server,args.output,(1366,768),locale,record)
                    page=await context.new_page()
                    page._qa_base=server.base
                    observe(page,record)
        finally:
            await context.close()
    try:
        await asyncio.gather(*(worker(i) for i in range(args.workers)))
        report=checkpoint()
    finally:
        await browser.close()
    return report


async def main(args,server):
    async with async_playwright() as playwright:
        reports=[]
        for browser in args.browsers.split(','):
            reports.append(await run_browser(playwright,server,args,browser))
    return int(any(not report['success'] for report in reports))


if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True,help='Existing audited fixture directory; reports are saved here')
    parser.add_argument('--browsers',default='chromium')
    parser.add_argument('--workers',type=int,default=1)
    parser.add_argument('--shard',default='1/1')
    args=parser.parse_args()
    args.output=args.output.resolve()
    if args.output.is_relative_to(ROOT):
        parser.error('Artifacts must stay outside repository')
    if not set(args.browsers.split(',')) <= {'chromium','firefox','webkit'}:
        parser.error('Unknown browser')
    try:
        index,count=map(int,args.shard.split('/'))
        assert 1<=index<=count
    except (ValueError,AssertionError):
        parser.error('Shard must be one-based INDEX/COUNT')
    if not 1<=args.workers<=4:
        parser.error('Workers must be between1 and4')
    args.output.mkdir(parents=True,exist_ok=True)
    with PuzzleServer(args.output,0) as server:
        print('Isolated supplement server '+server.base,flush=True)
        raise SystemExit(asyncio.run(main(args,server)))
