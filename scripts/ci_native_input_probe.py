"""Evidence-only native-input comparison against an unchanged, exact checkout.

The observer forwards every wrapped call unchanged. Geometry reads and wrappers
can affect timing, so a negative reproduction is not proof that the race is gone.
The comparison replaces only the helper's one Locator.click with one native
Mouse.click at its freshly measured centre. It is not a retry or a product fix.
"""
import argparse
import asyncio
import hashlib
from importlib.metadata import version
import inspect
import json
from pathlib import Path
import platform
import subprocess
import sys
import traceback


OBSERVER = r"""(() => {
  const events=[], ids=new WeakMap(); let nextId=1, dropped=0, frames=0, stopped=false, previous='';
  const nodeId=node=>{if(!node||typeof node!=='object')return null;if(!ids.has(node))ids.set(node,nextId++);return ids.get(node)};
  const node=node=>node?{nodeId:nodeId(node),tag:node.tagName||node.nodeName,id:node.id||null,
    mode:node.dataset?.puzzleMode||null,difficulty:node.dataset?.puzzleDifficulty||null,
    connected:node.isConnected===true}:null;
  const rect=el=>{const r=el?.getBoundingClientRect();return r&&{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  const view=()=>{const v=visualViewport;return{scrollX,scrollY,innerWidth,innerHeight,
    visualViewport:v&&{offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,pageLeft:v.pageLeft,pageTop:v.pageTop,width:v.width,height:v.height,scale:v.scale}}};
  const target=()=>document.querySelector('[data-puzzle-mode="russia-municipalities"]');
  const element=el=>{if(!el)return null;const r=rect(el),s=getComputedStyle(el);return{...node(el),rect:r,
    transform:s.transform,transition:s.transition,animation:s.animation,hover:el.matches(':hover'),focus:el.matches(':focus'),
    centreHit:r?node(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)):null}};
  const state=()=>{const s=window.__puzzleRead?.();return s&&{mode:s.mode,selection:s.selection,difficulty:s.difficulty,
    ready:s.ready,loading:s.loading,restoring:s.restoring,writable:s.writable,started:s.started}};
  const snapshot=()=>({view:view(),target:element(target()),activeElement:node(document.activeElement),
    state:state(),guard:window.__qaPuzzleInputStability?{sample:window.__qaPuzzleInputStability.sample,at:window.__qaPuzzleInputStability.at}:null,
    inputProbe:window.__qaPuzzleModeInput?{category:window.__qaPuzzleModeInput.category,delivered:window.__qaPuzzleModeInput.delivered}:null});
  const record=(kind,fields={})=>{if(stopped)return;if(events.length>=700){dropped++;return;}events.push({kind,at:performance.now(),...fields})};
  const stack=()=>String(new Error().stack||'').split('\n').slice(1,9).map(line=>line.replace(/(https?:\/\/[^\s?#]+)[?#][^\s)]*/g,'$1'));
  const argsSafe=args=>args.map(value=>{if(value==null||typeof value==='boolean'||typeof value==='number'||typeof value==='string')return value;
    if(typeof value==='object'){const out={};for(const key of ['behavior','block','inline','top','left','preventScroll','focusVisible'])if(key in value)out[key]=value[key];return out;}return typeof value});
  const wrap=(owner,name,label)=>{const original=owner[name];if(typeof original!=='function')return;
    owner[name]=function(...args){record('call-before',{method:label,args:argsSafe(args),receiver:node(this),stack:stack(),...snapshot()});
      try{return Reflect.apply(original,this,args);}finally{record('call-after',{method:label,...snapshot()})}}};
  for(const name of ['scrollIntoView','scroll','scrollTo','scrollBy'])wrap(Element.prototype,name,'Element.'+name);
  for(const name of ['scroll','scrollTo','scrollBy'])wrap(window,name,'window.'+name);
  wrap(HTMLElement.prototype,'focus','HTMLElement.focus');
  for(const type of ['scroll','scrollend','focus','blur','focusin','focusout','mousemove','mousedown','mouseup','pointermove','pointerdown','pointerup','pointercancel','click']){
    addEventListener(type,event=>{const coordinates=Number.isFinite(event.clientX)?{clientX:event.clientX,clientY:event.clientY,
      screenX:event.screenX,screenY:event.screenY,pageX:event.pageX,pageY:event.pageY,movementX:event.movementX,movementY:event.movementY,
      pointerId:event.pointerId,pointerType:event.pointerType,isPrimary:event.isPrimary,button:event.button,buttons:event.buttons,detail:event.detail,
      hit:node(document.elementFromPoint(event.clientX,event.clientY))}:{};
      record('event',{type,trusted:event.isTrusted,eventTimestamp:event.timeStamp,target:node(event.target),
        relatedTarget:node(event.relatedTarget),path:event.composedPath().slice(0,6).map(node),...coordinates,...snapshot()});},true);
  }
  const raf=()=>{if(stopped||frames++>=900)return;const current=snapshot(),encoded=JSON.stringify(current);
    if(encoded!==previous){record('raf-changed',current);previous=encoded;}requestAnimationFrame(raf)};
  requestAnimationFrame(raf);
  window.__nativeInputEvidence={read:()=>({events,dropped,frames,limitations:['Observation adds forwarding wrappers and geometry reads; timing may differ.']}),
    mark:label=>record('phase',{label,...snapshot()}),stop:()=>{stopped=true;return{events,dropped,frames}}};
})();"""


def sha(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


async def main(args):
    source = args.source.resolve()
    sys.path.insert(0, str(source / 'scripts'))
    import test_puzzle_catalog as catalog
    import playwright
    from playwright.async_api import async_playwright

    head = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    assert head == '9507cb80844154129895a9e0dc84832a3a96f01a', head
    assert catalog.VIEWPORTS[3] == (412, 915) and catalog.LOCALES[3 % 3] == 'ru'
    entry = next(item for item in catalog.build_catalog() if item['id'] == 'municipal-112819')
    assert entry['mode'] == 'russia-municipalities'
    original = catalog.select_map
    original_source = inspect.getsource(original)
    needle = '        await button.click()'
    assert original_source.count(needle) == 1
    comparison_source = original_source.replace(needle, '        await _native_input_centre_click(page, button)', 1)

    async def centre_click(page, button):
        bounds = await button.bounding_box()
        assert bounds and bounds['width'] > 0 and bounds['height'] > 0
        # Exactly one native click. No retry, focus, scroll or state setter.
        await page.mouse.click(bounds['x'] + bounds['width'] / 2, bounds['y'] + bounds['height'] / 2)

    namespace = dict(catalog.__dict__)
    namespace['_native_input_centre_click'] = centre_click
    exec(compile(comparison_source, '<single-native-centre-comparison>', 'exec'), namespace)
    comparison = namespace['select_map']
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'original-select-map.py.txt').write_text(original_source, encoding='utf-8')
    (args.output / 'comparison-select-map.py.txt').write_text(comparison_source, encoding='utf-8')
    driver_root = Path(playwright.__file__).resolve().parent / 'driver' / 'package'
    driver_package = json.loads((driver_root / 'package.json').read_text())
    core_bundle = driver_root / 'lib' / 'coreBundle.js'
    versions = {'pythonPlaywright': version('playwright'), 'driverPackage': driver_package['version'],
                'coreBundleSHA256': sha(core_bundle.read_bytes()), 'python': platform.python_version()}
    (args.output / 'versions.json').write_text(json.dumps(versions, indent=2) + '\n')
    results = []
    with catalog.PuzzleServer(args.fixtures) as server:
        async with async_playwright() as pw:
            browser = await pw.firefox.launch(headless=True, firefox_user_prefs={'network.proxy.type': 0})
            assert browser.version == '151.0', browser.version
            for branch in ('original-locator', 'fresh-centre-mouse'):
                for repeat in range(3):
                    record = {'branch': branch, 'repeat': repeat + 1, 'id': entry['id'], 'difficulty': 'easy',
                              'viewport': [412, 915], 'locale': 'ru', 'context': 'fresh', 'status': 'failed'}
                    context = await catalog.context_for(browser, server, args.fixtures, (412, 915), 'ru', record)
                    await context.add_init_script(OBSERVER)
                    page = await context.new_page()
                    page._qa_base = server.base
                    page._qa_locale = 'ru'
                    catalog.observe(page, record)
                    selected = original if branch == 'original-locator' else comparison

                    async def observed_select(page, entry, selected=selected):
                        await page.evaluate("window.__nativeInputEvidence.mark('before-original-select-map')")
                        try:
                            return await selected(page, entry)
                        finally:
                            try:
                                await page.evaluate("window.__nativeInputEvidence.mark('after-original-select-map')")
                            except Exception:
                                pass

                    catalog.select_map = observed_select
                    try:
                        await catalog.start_map(page, entry, 'easy')
                        record['status'] = 'passed'
                    except Exception as error:
                        record['error'] = str(error)
                        record['traceback'] = traceback.format_exc()
                        record['expectedDiagnosticNegative'] = isinstance(error, AssertionError) and 'Native mode click was not delivered to the requested control' in str(error)
                    finally:
                        catalog.select_map = original
                        try:
                            record['observer'] = await page.evaluate('window.__nativeInputEvidence.stop()')
                            record['lastState'] = await page.evaluate("()=>{const s=window.__puzzleRead?.();return s&&{mode:s.mode,selection:s.selection,difficulty:s.difficulty,ready:s.ready,loading:s.loading,restoring:s.restoring,writable:s.writable}}")
                            png = args.output / f'{branch}-{repeat+1}.png'
                            await page.screenshot(path=str(png))
                            record['screenshot'] = png.name
                        except Exception as capture_error:
                            record['captureError'] = str(capture_error)
                        await context.close()
                    results.append(record)
                    (args.output / f'{branch}-{repeat+1}.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            await browser.close()

    versions['firefoxBinaryVersion'] = browser.version
    report = {'sourceHead': head, 'browser': 'firefox', 'browserVersion': browser.version, 'platform': platform.platform(), 'versions': versions,
              'fixture': 'Original synthetic localhost backend; no production/student sessions',
              'method': '3 original Locator.click and 3 separate fresh-centre Mouse.click contexts; original guard and all original assertions preserved',
              'limitations': ['Forwarding wrappers and geometry reads can affect timing.', 'No real phone testing.',
                              'The comparison is a test-driver intervention, not a retry or product fix.', 'Only first mode selection, no map completion.'],
              'originalSelectMapSHA': sha(original_source), 'comparisonSelectMapSHA': sha(comparison_source),
              'observerSHA': sha(OBSERVER), 'comparisonDiff': {'remove': needle, 'add': '        await _native_input_centre_click(page, button)'},
              'results': results}
    (args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    excerpts = []
    for result in results:
        events = result.get('observer', {}).get('events', [])
        phase = next((event['at'] for event in events if event.get('label') == 'before-original-select-map'), 0)
        relevant = [event for event in events if event['at'] >= phase]
        excerpts.append({key: result.get(key) for key in ('branch', 'repeat', 'status', 'expectedDiagnosticNegative', 'error', 'modeInputDelivery', 'lastState', 'captureError')}
                        | {'observerDropped': result.get('observer', {}).get('dropped'), 'events': relevant})
    # Bound logs without cutting a JSON object; full observations stay in artifacts.
    payload = {'sourceHead': head, 'versions': versions, 'results': excerpts}
    text = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    if len(text.encode()) > 128 * 1024:
        for excerpt in excerpts:
            excerpt['events'] = [event for event in excerpt['events'] if event.get('type') in ('pointerdown', 'pointerup', 'click', 'focus', 'focusin', 'focusout', 'blur') or event['kind'].startswith('call-')]
        text = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    if len(text.encode()) > 128 * 1024:
        for excerpt in excerpts:
            excerpt['events'] = [event for event in excerpt['events'] if event.get('type') in ('pointerdown', 'pointerup', 'click')]
        text = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    assert len(text.encode()) <= 128 * 1024, 'Bounded inline excerpt exceeded limit; raw report preserved'
    (args.output / 'inline-excerpt.json').write_text(text + '\n', encoding='utf-8')
    print(text)
    return 1 if any(result.get('captureError') or (result['status'] != 'passed' and not result.get('expectedDiagnosticNegative')) for result in results) else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--fixtures', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    raise SystemExit(asyncio.run(main(parser.parse_args())))
