"""Evidence-only exact-seed static-layer consumer matrix; run from repository root.

The existing DPR3 scenario, input, assertions and verdict remain intact.
No new paint observer or canvas operation precedes its original q/p comparison.
Additional controls run only in context cleanup, after the original assertions.
"""
import argparse
import asyncio
import base64
import hashlib
import json
import platform
import sys
from pathlib import Path

SEED = 2277844156
CAPTURE_HOOK = r"""
  let staticEvidencePending=null,staticEvidenceCaptured=null;
  window.__staticEvidenceErrors=[];
  // The original audit invokes this after its existing getImageData/difference.
  // Retain its buffers without canvas calls or an extra readback.
  window.__captureStaticEvidence=({q,p,width,height,cacheDifference,sprite,view,map})=>{
    try{
      if(staticEvidencePending||staticEvidenceCaptured||state.seed!==2277844156||state.placed!==20||state.current!==49)return;
      const zoom=state.view.k/state.baseViewK;
      if(Math.abs(zoom-4)>1e-6)return;
      staticEvidencePending={q,p,metadata:{seed:state.seed,order:[...state.order],current:state.current,
        featureId:state.features[state.current]?.properties._puzzleId,zoom,placed:state.placed,
        deviceDpr:devicePixelRatio,rasterDpr:state.dpr,width,height,scale:sprite.scale,
        cacheView:{...view},cacheMap:{...map},mapRect:{...state.mapRect},draw:{...window.__backgroundDraw},
        destinationSize:[els.canvas.width,els.canvas.height],
        baselineDifference:cacheDifference,fillRule:state.mode==='russia-subjects'?'nonzero':'evenodd'}};
    }catch(error){window.__staticEvidenceErrors.push({stage:'retain-original-buffers',name:error?.name||'Error'});}
  };
  const observedStaticAudit=window.__backgroundAudit;
  window.__backgroundAudit=function(...args){
    const result=observedStaticAudit.apply(this,args);
    // The original sixteen jitter comparisons have completed before this.
    // Preserve the exact current native paths for later, independent controls.
    // This is a reconstructed paint plan, NOT observed original paint history.
    if(staticEvidencePending){
      const capture=staticEvidencePending;staticEvidencePending=null;staticEvidenceCaptured=capture;
      try{
        const {cacheView:view,cacheMap:map}=capture.metadata;
        const mapIndices=state.features.map((_,index)=>index).filter(index=>visibleFeature(index,view,map));
        const lockedIndices=state.pieces.filter(piece=>piece.locked&&visibleFeature(piece.index,view,map)).map(piece=>piece.index);
        capture.paths=new Map([...new Set([...mapIndices,...lockedIndices])].map(index=>[index,displayPaths(index)]));
        capture.metadata.passes=[{name:'map',fill:'#e7f1f7',stroke:'#91b2c6',indices:mapIndices},
          {name:'locked',fill:'#0079c1',stroke:'#004f80',indices:lockedIndices}];
        capture.metadata.originalAudit=result;
        capture.metadata.originalPaintHistoryAvailable=false;
      }catch(error){capture.controlError={stage:'retain-replay-plan',name:error?.name||'Error'};}
    }
    return result;
  };
  const staticEvidencePng=(pixels,width,height)=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
    const png=canvas.toDataURL('image/png');canvas.width=canvas.height=0;return png;
  };
  const staticEvidenceContext=context=>({attributes:context.getContextAttributes?.(),
    transform:Array.from(context.getTransform().toFloat64Array()),alpha:context.globalAlpha,
    composite:context.globalCompositeOperation,fill:context.fillStyle,stroke:context.strokeStyle,
    width:context.lineWidth,join:context.lineJoin,cap:context.lineCap,miter:context.miterLimit,
    dash:context.getLineDash(),dashOffset:context.lineDashOffset,
    shadow:[context.shadowColor,context.shadowBlur,context.shadowOffsetX,context.shadowOffsetY],
    filter:context.filter??null,smoothing:context.imageSmoothingEnabled});
  window.__finishStaticEvidence=()=>{
    if(!staticEvidenceCaptured)return {records:[],errors:window.__staticEvidenceErrors};
    const {q,p,metadata:m,paths,controlError}=staticEvidenceCaptured;
    const sample=pixels=>Array.from(pixels.slice((1236*m.width+361)*4,(1236*m.width+361)*4+4));
    // These are the original q/p buffers, not a new read of the game's canvas.
    const record={...m,baselineActualSample:sample(q),baselineReferenceSample:sample(p),
      actualPng:staticEvidencePng(q,m.width,m.height),referencePng:staticEvidencePng(p,m.width,m.height),
      controlsStartedAfterOriginalScenario:true,controls:[]};
    if(controlError){record.controlError=controlError;return {records:[record],errors:window.__staticEvidenceErrors};}
    const paint=(context,history)=>{
      for(const pass of m.passes){
        context.save();context.setTransform(m.rasterDpr,0,0,m.rasterDpr,0,0);context.beginPath();
        context.rect(m.cacheMap.x,m.cacheMap.y,m.cacheMap.width,m.cacheMap.height);context.clip();
        context.setTransform(m.rasterDpr*m.cacheView.k,0,0,m.rasterDpr*m.cacheView.k,
          m.rasterDpr*m.cacheView.x,m.rasterDpr*m.cacheView.y);
        context.fillStyle=pass.fill;context.strokeStyle=pass.stroke;context.lineWidth=1/m.scale;
        context.lineJoin=context.lineCap='round';
        const operations=[];
        for(const index of pass.indices){
          const pair=paths.get(index);
          operations.push({kind:'fill',index,fillRule:m.fillRule});context.fill(pair.path,m.fillRule);
          operations.push({kind:'stroke',index});context.stroke(pair.strokePath);
        }
        // No getters/readback between the map and locked native passes.
        history.push({pass:pass.name,operations,fill:pass.fill,stroke:pass.stroke,
          width:1/m.scale,fillRule:m.fillRule,join:'round',cap:'round',
          transform:[m.rasterDpr*m.cacheView.k,0,0,m.rasterDpr*m.cacheView.k,
            m.rasterDpr*m.cacheView.x,m.rasterDpr*m.cacheView.y]});context.restore();
      }
    };
    for(const [surface,consumed] of [['fresh',false],['fresh',true],['reused',false],['reused',true]]){
      const kind=surface+(consumed?'-audit-consumer':'-no-consumer');
      const canvas=document.createElement('canvas');let context;const history=[];
      if(surface==='reused'){
        context=canvas.getContext('2d',{alpha:true});canvas.width=m.width;canvas.height=m.height;
        paint(context,history);canvas.width=m.width;canvas.height=m.height;
        history.push({operation:'resize-reset-to-same-dimensions',width:m.width,height:m.height});
      }else{canvas.width=m.width;canvas.height=m.height;context=canvas.getContext('2d',{alpha:true});}
      paint(context,history);
      let destination=null,destinationPixels=null,consumer=null;
      if(consumed){
        destination=document.createElement('canvas');destination.width=m.destinationSize[0];destination.height=m.destinationSize[1];
        const target=destination.getContext('2d');
        // The exact actual-canvas branch of the original background audit:
        // a.save(); clipMap(a); a.drawImage(source,...); a.restore(); read(a).
        target.save();target.setTransform(m.rasterDpr,0,0,m.rasterDpr,0,0);target.beginPath();
        target.rect(m.mapRect.x,m.mapRect.y,m.mapRect.width,m.mapRect.height);target.clip();
        target.drawImage(canvas,m.draw.x,m.draw.y,m.draw.width,m.draw.height);target.restore();
        destinationPixels=target.getImageData(0,0,destination.width,destination.height).data;
        consumer={kind:'original-audit-consumer',width:destination.width,height:destination.height,
          draw:{...m.draw},clip:{...m.mapRect},transform:[m.rasterDpr,0,0,m.rasterDpr,0,0],
          readOrder:['destination','source'],readbackBytes:destinationPixels.length};
      }
      const pixels=context.getImageData(0,0,m.width,m.height).data;
      const control={kind,surface,consumed,history,consumer,contextAfterRead:staticEvidenceContext(context),
        versusActual:rasterPixelDifference(q,pixels,m.width),versusReference:rasterPixelDifference(p,pixels,m.width),
        sample:sample(pixels),png:staticEvidencePng(pixels,m.width,m.height)};
      if(destination){control.consumerPng=staticEvidencePng(destinationPixels,destination.width,destination.height);destination.width=destination.height=0;}
      record.controls.push(control);canvas.width=canvas.height=0;
    }
    return {records:[record],errors:window.__staticEvidenceErrors};
  };
"""


async def main(args):
    repo, output = Path(args.repo).resolve(), Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(repo / 'scripts'))
    import test_puzzle_catalog as catalog
    import test_puzzle_render_browser as render
    from playwright.async_api import async_playwright
    names = ['puzzle-engine.js', 'puzzle-render-geometry.js', 'puzzle-raster-worker.js']
    hashes = lambda: {name: hashlib.sha256((repo / 'site/assets/js' / name).read_bytes()).hexdigest() for name in names}
    before_hashes = hashes()
    old_observer = """  const observedBackgroundFill=staticCtx.fill;
  staticCtx.fill=function(...args){window.__backgroundPaints++;return observedBackgroundFill.apply(this,args);};"""
    live_observer = """  const observedBackgroundFill=CanvasRenderingContext2D.prototype.fill;
  CanvasRenderingContext2D.prototype.fill=function(...args){if(this===staticCtx)window.__backgroundPaints++;return observedBackgroundFill.apply(this,args);};"""
    assert render.RENDER_HOOK.count(old_observer) == 1, 'Exact original static paint observer required'
    render.RENDER_HOOK = render.RENDER_HOOK.replace(old_observer, live_observer, 1)
    marker = '      cacheDifference=rasterPixelDifference(q,p,fresh.width);'
    assert render.RENDER_HOOK.count(marker) == 1, 'Exact original cache audit marker required'
    injected = marker + '\n      window.__captureStaticEvidence({q,p,width:fresh.width,height:fresh.height,cacheDifference,sprite,view,map});'
    catalog.READ_ONLY_HOOK += render.RENDER_HOOK.replace(marker, injected, 1) + CAPTURE_HOOK
    captures, capture_errors = [], []
    with catalog.PuzzleServer(Path(args.fixtures).resolve() if args.fixtures else output) as server:
        async with async_playwright() as playwright:
            browser = await playwright.webkit.launch(**({'executable_path': args.executable} if args.executable else {}))
            new_context = browser.new_context

            async def context_with_seed(*cargs, **kwargs):
                context = await new_context(*cargs, **kwargs)
                await context.add_init_script('Math.random=()=>'+repr((SEED+.25)/0xffffffff)+';')
                original_close = context.close

                async def save_before_close(*close_args, **close_kwargs):
                    try:
                        for page in context.pages:
                            if page.is_closed():
                                continue
                            try:
                                collected = await page.evaluate('window.__finishStaticEvidence?.()||{records:[],errors:[]}')
                                capture_errors.extend(collected['errors'])
                                for index, record in enumerate(collected['records']):
                                    for key in ('actual', 'reference'):
                                        raw = base64.b64decode(record.pop(key+'Png').split(',', 1)[1])
                                        path = output / f'capture-{index}-{key}.png'
                                        path.write_bytes(raw)
                                        record[key+'Png'] = {'file': path.name, 'sha256': hashlib.sha256(raw).hexdigest()}
                                    for control in record['controls']:
                                        raw = base64.b64decode(control.pop('png').split(',', 1)[1])
                                        path = output / f'capture-{index}-{control["kind"]}.png'
                                        path.write_bytes(raw)
                                        control['png'] = {'file': path.name, 'sha256': hashlib.sha256(raw).hexdigest()}
                                        if control.get('consumerPng'):
                                            raw = base64.b64decode(control.pop('consumerPng').split(',', 1)[1])
                                            path = output / f'capture-{index}-{control["kind"]}-destination.png'
                                            path.write_bytes(raw)
                                            control['consumerPng'] = {'file': path.name, 'sha256': hashlib.sha256(raw).hexdigest()}
                                    captures.append(record)
                            except Exception as error:
                                capture_errors.append({'stage': 'collect-after-original-scenario', 'name': type(error).__name__})
                        try:
                            (output / 'captures.json').write_text(json.dumps({'records': captures, 'errors': capture_errors}, ensure_ascii=False, indent=2), encoding='utf-8')
                        except Exception as error:
                            capture_errors.append({'stage': 'write-capture', 'name': type(error).__name__})
                    finally:
                        await original_close(*close_args, **close_kwargs)

                context.close = save_before_close
                return context

            browser.new_context = context_with_seed
            try:
                result = await render.run_dpr_case(browser, 'webkit', 3, server, output)
                result['environment'] = {'system': platform.platform(), 'browserVersion': browser.version,
                    'seed': SEED, 'physicalDevice': False, 'executable': args.executable}
                result['sourceHashesBefore'], result['sourceHashesAfter'] = before_hashes, hashes()
                result['sourceStable'] = result['sourceHashesBefore'] == result['sourceHashesAfter']
                result['probe'] = {'evidenceOnly': True, 'originalVerdictUnchanged': True,
                    'captureCount': len(captures), 'captureErrors': capture_errors,
                    'captureTarget': {'seed': SEED, 'dpr': 3, 'rasterDpr': 2, 'current': 49, 'placed': 20, 'zoom': 4},
                    'newPaintObserversBeforeOriginalAudit': False, 'newCanvasOperationsBeforeOriginalVerdict': False,
                    'controlsAlterAcceptance': False, 'originalPaintHistoryAvailable': False,
                    'matrix':'fresh/reused context x no consumer/original audit consumer',
                    'limitation': 'Original test instrumentation remains. New hook retains the original buffers and exact native paths after its audit; secondary controls run after its full scenario verdict. Control history is reconstructed, not the historical actual paint stream. Consumer matches the original audit canvas, not the complete displayed main-canvas lifetime. Fresh uses a new context after sizing; reuse creates a context, paints once, resets the same dimensions and repaints. Native platform must be read from environment.'}
                (output / 'report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
                print(json.dumps({'status': result['status'], 'captures': len(captures), 'captureErrors': capture_errors,
                    'sourceStable': result['sourceStable'], 'error': result.get('error', '')[:250]}, ensure_ascii=False), flush=True)
            finally:
                await browser.close()
    if result['status'] != 'passed' or not captures or capture_errors or any('controlError' in item for item in captures) or not result['sourceStable']:
        raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default='.')
    parser.add_argument('--output', required=True)
    parser.add_argument('--fixtures')
    parser.add_argument('--executable')
    asyncio.run(main(parser.parse_args()))
