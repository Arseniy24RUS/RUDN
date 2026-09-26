#!/usr/bin/env python3
"""Targeted render/rotation regression on isolated loopback data, never production.

Browser plugin is not available as a skill in the automated runner. Playwright
provides repeatable engine, viewport and input coverage; physical-phone checks
remain separate. The server adds read-only observations, never game setters.
"""
import argparse
import asyncio
import json
from pathlib import Path
import re
import time
import traceback

from playwright.async_api import async_playwright
import test_puzzle_catalog as catalog

RENDER_HOOK = r"""
  const rasterPixelDifference=(actual,expected,width)=>{
    let differences=0,maximumDifference=0,nonempty=0,maximumAlphaDifference=0,maximumPremultipliedDifference=0;
    const examples=[];
    for(let i=0;i<actual.length;i+=4){
      let changed=false;
      for(let c=0;c<4;c++){const difference=Math.abs(actual[i+c]-expected[i+c]);if(difference){differences++;changed=true;}maximumDifference=Math.max(maximumDifference,difference);}
      if(actual[i+3])nonempty++;
      maximumAlphaDifference=Math.max(maximumAlphaDifference,Math.abs(actual[i+3]-expected[i+3]));
      for(let c=0;c<3;c++)maximumPremultipliedDifference=Math.max(maximumPremultipliedDifference,Math.abs(actual[i+c]*actual[i+3]/255-expected[i+c]*expected[i+3]/255));
      if(changed&&examples.length<8)examples.push({x:(i/4)%width,y:Math.floor(i/4/width),actual:Array.from(actual.slice(i,i+4)),expected:Array.from(expected.slice(i,i+4))});
    }
    return {differences,maximumDifference,nonempty,maximumAlphaDifference,maximumPremultipliedDifference,examples};
  };
  window.__rasterOracleProbe=(actual,expected)=>rasterPixelDifference(actual,expected,1);
  const RASTER_POSITION_EPSILON=1e-4;
  const rasterPixelMatches=(a,b,i)=>Math.abs(a[i+3]-b[i+3])<=1&&[0,1,2].every(c=>Math.abs(a[i+c]*a[i+3]/255-b[i+c]*b[i+3]/255)<=1);
  const rasterRoundoffTracker=(actual,expected)=>{
    const critical=[],explained=new Set();for(let i=0;i<actual.length;i+=4)if(!rasterPixelMatches(actual,expected,i))critical.push(i);
    let validCandidates=0;
    return {addCandidate(pixels,dx,dy){
      if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)>RASTER_POSITION_EPSILON||pixels.length!==actual.length)return [];
      validCandidates++;
      const matched=critical.filter(i=>rasterPixelMatches(actual,pixels,i));matched.forEach(i=>explained.add(i));return matched;
    },summary(){return {criticalPixels:critical.length,explainedPixels:explained.size,unexplainedPixels:critical.length-explained.size,
      maximumPhysicalTranslation:RASTER_POSITION_EPSILON,validCandidates};}};
  };
  window.__rasterMembershipProbe=(actual,expected,candidates)=>{const tracker=rasterRoundoffTracker(actual,expected);
    for(const candidate of candidates)tracker.addCandidate(candidate.pixels,candidate.dx,candidate.dy);return tracker.summary();};
  const contextDetails=context=>({attributes:context.getContextAttributes?.(),transform:Array.from(context.getTransform().toFloat64Array()),
    alpha:context.globalAlpha,composite:context.globalCompositeOperation,fill:context.fillStyle,stroke:context.strokeStyle,
    width:context.lineWidth,join:context.lineJoin,cap:context.lineCap,miter:context.miterLimit,dash:context.getLineDash(),dashOffset:context.lineDashOffset,
    shadow:[context.shadowColor,context.shadowBlur,context.shadowOffsetX,context.shadowOffsetY],filter:context.filter,smoothing:context.imageSmoothingEnabled});
  const diagnoseRaster=async(source,actual,expected,paint,contextOptions={alpha:true})=>{
    const width=source.width,height=source.height,sourceContext=source.getContext('2d'),results=[],roundoff=rasterRoundoffTracker(actual,expected);
    const stamp=document.createElement('canvas');stamp.width=stamp.height=4;stamp.getContext('2d').fillRect(0,0,4,4);
    const bitmap=typeof createImageBitmap==='function'?await createImageBitmap(stamp):null;
    const sourceBefore=contextDetails(sourceContext);
    try{
      const kinds=['fresh-repeat-1','fresh-repeat-2','fresh-composited','fresh-context-before-size','fresh-cloned-path','fresh-cpu','reused-vector','reused-readback','reused-bitmap'];
      for(const epsilon of [1e-7,1e-6,1e-5,1e-4])for(const axis of ['x','y'])for(const sign of [-1,1])kinds.push(`jitter:${axis}:${epsilon*sign}`);
      for(const kind of kinds){
        const canvas=document.createElement('canvas');
        let context=kind==='fresh-context-before-size'?canvas.getContext('2d',contextOptions):null;
        canvas.width=width;canvas.height=height;
        context=context||canvas.getContext('2d',kind==='fresh-cpu'?{alpha:true,willReadFrequently:true}:contextOptions);
        if(kind.startsWith('reused-')){
          for(let n=0;n<5;n++){
            canvas.height=0;canvas.width=width+n+1;canvas.height=height+n+1;
            if(kind==='reused-bitmap'){context.drawImage(bitmap||stamp,0,0);}else paint(context,false);
            if(kind==='reused-readback')context.getImageData(0,0,canvas.width,canvas.height);
          }
          canvas.height=0;canvas.width=width;canvas.height=height;
        }
        const jitter=kind.startsWith('jitter:')?kind.split(':'):null;
        paint(context,kind==='fresh-cloned-path',jitter?.[1]==='x'?Number(jitter[2]):0,jitter?.[1]==='y'?Number(jitter[2]):0);
        if(kind==='fresh-composited'){
          const destination=document.createElement('canvas');destination.width=width;destination.height=height;
          const destinationContext=destination.getContext('2d');destinationContext.drawImage(canvas,0,0);
          destinationContext.getImageData(0,0,width,height);
        }
        const first=context.getImageData(0,0,width,height).data;
        const second=context.getImageData(0,0,width,height).data;
        const explainedPixels=jitter?roundoff.addCandidate(first,jitter[1]==='x'?Number(jitter[2]):0,jitter[1]==='y'?Number(jitter[2]):0):[];
        results.push({kind,context:contextDetails(context),versusActual:rasterPixelDifference(first,actual,width),
          versusReference:rasterPixelDifference(first,expected,width),repeatRead:rasterPixelDifference(second,first,width),
          explainedOriginalPixels:explainedPixels.map(i=>({x:(i/4)%width,y:Math.floor(i/4/width)}))});
      }
      return {sourceContext:sourceBefore,sourceRepeat:rasterPixelDifference(sourceContext.getImageData(0,0,width,height).data,actual,width),
        roundoffProbe:roundoff.summary(),cases:results};
    }finally{bitmap?.close();}
  };
  window.__backgroundPaints=0;
  const observedBackgroundFill=staticCtx.fill;
  staticCtx.fill=function(...args){window.__backgroundPaints++;return observedBackgroundFill.apply(this,args);};
  const observedDrawImage=ctx.drawImage;
  ctx.drawImage=function(...args){if(args[0]===staticCanvas)window.__backgroundDraw={x:args[1],y:args[2],width:args[3],height:args[4]};return observedDrawImage.apply(this,args);};
  const observedPieceRaster=drawPieceRaster;
  window.__spriteSurfaces={replacements:0,unreleased:0};
  window.__spritePaints={fill:0,stroke:0,bitmap:0};
  for(const [method,kind] of [['fill','fill'],['stroke','stroke'],['drawImage','bitmap']]){
    const original=CanvasRenderingContext2D.prototype[method];
    CanvasRenderingContext2D.prototype[method]=function(...args){
      if(this.canvas===activeSprite.canvas)window.__spritePaints[kind]++;
      return original.apply(this,args);
    };
  }
  drawPieceRaster=function(...args){const canvas=activeSprite.canvas,path=activeSprite.path,scale=activeSprite.scale,left=activeSprite.left,top=activeSprite.top,hits=rasterPreparation.hits;
    const result=observedPieceRaster(...args);
    if(canvas!==activeSprite.canvas){window.__spriteSurfaces.replacements++;if(canvas.width||canvas.height)window.__spriteSurfaces.unreleased++;}
    if(rasterPreparation.hits>hits)window.__spriteOrigin='worker';
    else if(path!==activeSprite.path||scale!==activeSprite.scale||left!==activeSprite.left||top!==activeSprite.top)window.__spriteOrigin='direct';
    return result;};
  window.__renderRead=()=>({snapshot:snapshotState(),map:{...state.mapRect},tray:trayRect(),side:state.sideTray,
    renderer:state.renderGeometry?.diagnostics(),baseViewK:state.baseViewK,
    features:state.features.map((feature,index)=>({id:feature.properties._puzzleId,name:feature.properties._puzzleName,
      russian:feature.properties.name_ru||feature.properties.name,point:worldToScreen(...state.anchors[index])}))});
  window.__spriteAudit=async()=>{
    const sprite={...activeSprite},piece={...currentPiece()},paths=highResolutionPaths(piece.index),expectedScale=state.view.k;
    const fillRule=state.mode==='russia-subjects'?'nonzero':'evenodd';
    // The worker requests a readback-optimized context; direct native paths keep
    // their ordinary context. Backend differences are not coordinate roundoff.
    const source=window.__spriteOrigin,referenceOptions=source==='worker'?{alpha:true,willReadFrequently:true}:{alpha:true};
    const canvas=document.createElement('canvas');canvas.width=sprite.canvas.width;canvas.height=sprite.canvas.height;
    const context=canvas.getContext('2d',referenceOptions);context.setTransform(sprite.dpr*sprite.scale,0,0,sprite.dpr*sprite.scale,-sprite.left*sprite.dpr,-sprite.top*sprite.dpr);
    context.fillStyle='#dc3f45';context.strokeStyle='#8e2028';context.lineWidth=1.2/sprite.scale;context.lineJoin=context.lineCap='round';
    context.fill(paths.path,fillRule);context.stroke(paths.strokePath);
    const actual=sprite.canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    const expected=context.getImageData(0,0,canvas.width,canvas.height).data;
    const difference=rasterPixelDifference(actual,expected,canvas.width);
    let nativeDiagnostic=null;
    if(difference.maximumAlphaDifference>1||difference.maximumPremultipliedDifference>1){
      nativeDiagnostic=await diagnoseRaster(sprite.canvas,actual,expected,(target,clone,dx=0,dy=0)=>{
        target.setTransform(sprite.dpr*sprite.scale,0,0,sprite.dpr*sprite.scale,-sprite.left*sprite.dpr+dx,-sprite.top*sprite.dpr+dy);
        target.fillStyle='#dc3f45';target.strokeStyle='#8e2028';target.lineWidth=1.2/sprite.scale;target.lineJoin=target.lineCap='round';
        target.fill(clone?new Path2D(paths.path):paths.path,fillRule);
        target.stroke(clone?new Path2D(paths.strokePath):paths.strokePath);
      },referenceOptions);
    }
    return {seed:state.seed,order:[...state.order],placed:state.placed,currentPath:sprite.path===paths.path,currentStrokePath:sprite.strokePath===paths.strokePath,
      currentFillRule:sprite.fillRule===fillRule,scale:sprite.scale,expectedScale,dpr:sprite.dpr,
      pixels:canvas.width*canvas.height,bytes:actual.length,...difference,nativeDiagnostic,referenceContext:contextDetails(context),
      surfaceLifecycle:{...window.__spriteSurfaces},
      rasterPaints:{...window.__spritePaints},
      featureId:state.features[piece.index].properties._puzzleId,featureName:state.features[piece.index].properties._puzzleName,
      source,workerStatus:rasterPreparation.status,workerHits:rasterPreparation.hits,
      preparedCacheKey:rasterPreparation.cache.has(`${state.current}:${sprite.scale}:${sprite.dpr}`)?`${state.current}:${sprite.scale}:${sprite.dpr}`:null,
      actualTransform:Array.from(sprite.canvas.getContext('2d').getTransform().toFloat64Array()),referenceTransform:Array.from(context.getTransform().toFloat64Array()),
      rectangle:{left:sprite.left,top:sprite.top,right:sprite.right,bottom:sprite.bottom}};
  };
  window.__backgroundAudit=()=>{
    const actual=document.createElement('canvas'),expected=document.createElement('canvas');
    actual.width=expected.width=els.canvas.width;actual.height=expected.height=els.canvas.height;
    const a=actual.getContext('2d'),b=expected.getContext('2d'),sprite=backgroundSprite;
    a.save();clipMap(a);
    if(sprite.direct){drawMap(a);drawLockedPieces(a);}else a.drawImage(staticCanvas,
      sprite.left+state.view.x-sprite.viewX,sprite.top+state.view.y-sprite.viewY,staticCanvas.width/state.dpr,staticCanvas.height/state.dpr);
    a.restore();drawMap(b);drawLockedPieces(b);
    const pixels=a.getImageData(0,0,actual.width,actual.height).data,reference=b.getImageData(0,0,actual.width,actual.height).data;
    let differences=0,maximumDifference=0,maximumPremultipliedDifference=0,outsidePixels=0;const examples=[];
    for(let i=0;i<pixels.length;i++){
      if(pixels[i]!==reference[i])differences++;maximumDifference=Math.max(maximumDifference,Math.abs(pixels[i]-reference[i]));
      const alpha=(i&~3)+3;
      maximumPremultipliedDifference=Math.max(maximumPremultipliedDifference,i%4===3?Math.abs(pixels[i]-reference[i]):Math.abs(pixels[i]*pixels[alpha]/255-reference[i]*reference[alpha]/255));
      if(i%4===3&&examples.length<12&&Math.abs(pixels[i]-reference[i])>5){const p=i>>2;examples.push({x:p%actual.width,y:Math.floor(p/actual.width),actual:Array.from(pixels.slice(i-3,i+1)),expected:Array.from(reference.slice(i-3,i+1)),map:{...state.mapRect}});}
      if(i%4===3&&pixels[i]){const p=i>>2,x=(p%actual.width+.5)/state.dpr,y=(Math.floor(p/actual.width)+.5)/state.dpr,m=state.mapRect;
        if(x<m.x||x>m.x+m.width||y<m.y||y>m.y+m.height)outsidePixels++;}
    }
    // Compare exact contours on an equal-size surface. Native raster backends
    // can choose different edge tessellation for a larger overscan surface;
    // that small antialias difference is recorded separately above.
    const fresh=document.createElement('canvas');fresh.width=staticCanvas.width;fresh.height=staticCanvas.height;
    let cacheDifference={differences:0,maximumDifference:0,maximumAlphaDifference:0,maximumPremultipliedDifference:0,examples:[]};
    let cacheActualTransform=null,cacheReferenceTransform=null,cacheRoundoffProbe=null;const cacheJitter=[];
    if(!sprite.direct){const context=fresh.getContext('2d'),view={x:sprite.viewX-sprite.left,y:sprite.viewY-sprite.top,k:state.view.k},map={x:0,y:0,width:fresh.width/state.dpr,height:fresh.height/state.dpr};
      drawMap(context,view,map);drawLockedPieces(context,view,map);
      const p=context.getImageData(0,0,fresh.width,fresh.height).data,q=staticCtx.getImageData(0,0,fresh.width,fresh.height).data;
      cacheActualTransform=Array.from(staticCtx.getTransform().toFloat64Array());cacheReferenceTransform=Array.from(context.getTransform().toFloat64Array());
      cacheDifference=rasterPixelDifference(q,p,fresh.width);
      if(cacheDifference.maximumAlphaDifference>1||cacheDifference.maximumPremultipliedDifference>1){
        const roundoff=rasterRoundoffTracker(q,p);
        for(const epsilon of [1e-7,1e-6,1e-5,1e-4])for(const axis of ['x','y'])for(const sign of [-1,1]){
          const target=document.createElement('canvas');target.width=fresh.width;target.height=fresh.height;
          const shifted={...view,[axis]:view[axis]+epsilon*sign/state.dpr},targetContext=target.getContext('2d');
          drawMap(targetContext,shifted,map);drawLockedPieces(targetContext,shifted,map);
          const pixels=targetContext.getImageData(0,0,target.width,target.height).data;
          const explainedPixels=roundoff.addCandidate(pixels,axis==='x'?epsilon*sign:0,axis==='y'?epsilon*sign:0);
          cacheJitter.push({axis,physicalPixels:epsilon*sign,versusActual:rasterPixelDifference(q,pixels,fresh.width),versusReference:rasterPixelDifference(p,pixels,fresh.width),
            explainedOriginalPixels:explainedPixels.map(i=>({x:(i/4)%fresh.width,y:Math.floor(i/4/fresh.width)}))});
        }
        cacheRoundoffProbe=roundoff.summary();
      }}
    const draw=window.__backgroundDraw,expectedDraw={x:sprite.left+state.view.x-sprite.viewX,y:sprite.top+state.view.y-sprite.viewY,width:staticCanvas.width/state.dpr,height:staticCanvas.height/state.dpr};
    return {seed:state.seed,order:[...state.order],current:state.current,differences,maximumDifference,maximumPremultipliedDifference,examples,
      cacheDifferences:cacheDifference.differences,cacheMaximumDifference:cacheDifference.maximumDifference,
      cacheMaximumAlphaDifference:cacheDifference.maximumAlphaDifference,cacheMaximumPremultipliedDifference:cacheDifference.maximumPremultipliedDifference,
      cacheExamples:cacheDifference.examples,cacheActualTransform,cacheReferenceTransform,cacheJitter,cacheRoundoffProbe,draw,expectedDraw,outsidePixels,bytes:staticCanvas.width*staticCanvas.height*4,
      currentProjection:sprite.projection===state.projection,currentPieces:sprite.pieces===state.pieces,
      placed:sprite.placed,expectedPlaced:state.placed,scale:sprite.scale,expectedScale:state.view.k,
      dpr:sprite.dpr,paints:window.__backgroundPaints,direct:sprite.direct};
  };
"""


def assert_raster_quantization(metrics, cached=False):
    # Compare alpha and all premultiplied channels against one actual native
    # reference per pixel. CI demonstrated a native sample threshold at a
    # 0.0001-physical-pixel translation, with unchanged full commands/geometry.
    # This coordinate bound is separate from the 0.35 CSS-pixel display LOD.
    alpha = 'cacheMaximumAlphaDifference' if cached else 'maximumAlphaDifference'
    color = 'cacheMaximumPremultipliedDifference' if cached else 'maximumPremultipliedDifference'
    if metrics[alpha] <= 1 and metrics[color] <= 1:
        return
    evidence = metrics.get('cacheRoundoffProbe') if cached else (metrics.get('nativeDiagnostic') or {}).get('roundoffProbe')
    assert evidence and evidence['maximumPhysicalTranslation'] <= 1e-4, metrics
    assert evidence['validCandidates'] > 0 and evidence['criticalPixels'] > 0, metrics
    assert evidence['unexplainedPixels'] == 0 and evidence['explainedPixels'] == evidence['criticalPixels'], metrics


async def check_raster_oracle(page):
    cases = [
        ([100, 150, 200, 255], [100, 150, 200, 255], True),
        ([101, 150, 200, 255], [100, 150, 200, 255], True),
        ([128, 0, 0, 2], [255, 0, 0, 1], True),
        ([128, 0, 0, 9], [128, 0, 0, 1], False),
        ([108, 150, 200, 255], [100, 150, 200, 255], False),
        ([0, 0, 0, 0], [142, 32, 40, 255], False),
    ]
    for actual, expected, accepted in cases:
        metrics = await page.evaluate('args=>window.__rasterOracleProbe(...args)', [actual, expected])
        try:
            assert_raster_quantization(metrics)
        except AssertionError:
            assert not accepted, metrics
        else:
            assert accepted, ('Pixel oracle accepted a corrupt pixel', metrics)
    opaque=[100,150,200,255]
    edge=[143,32,40,64]
    transparent=[0,0,0,0]
    candidate=lambda pixels,dx=1e-4,dy=0: {'pixels':pixels,'dx':dx,'dy':dy}
    membership_cases=[
        ('bounded native sample',transparent,edge,[candidate(transparent)],True),
        ('changed opaque color',[108,150,200,255],opaque,[candidate(opaque)],False),
        ('eight alpha levels',[143,32,40,8],edge,[candidate(transparent),candidate(edge,-1e-4)],False),
        ('deleted opaque interior',transparent,opaque,[candidate(opaque)],False),
        ('out-of-bound exact match',transparent,edge,[candidate(transparent,0.001)],False),
        ('diagonal exceeds bound',transparent,edge,[candidate(transparent,1e-4,1e-4)],False),
        ('non-numeric shift',transparent,edge,[candidate(transparent,None)],False),
        # Different references may not independently donate different channels.
        ('mixed channel membership',[100,150,200,255],opaque,
         [candidate([100,160,200,255]),candidate([110,150,200,255])],False),
    ]
    results=[]
    for name,actual,expected,candidates,accepted in membership_cases:
        if name=='mixed channel membership': expected=[110,160,200,255]
        evidence=await page.evaluate('args=>window.__rasterMembershipProbe(...args)',[actual,expected,candidates])
        assert (evidence['unexplainedPixels']==0)==accepted,(name,evidence)
        results.append({'name':name,'accepted':accepted,**evidence})
    native_shift=await page.evaluate(r"""()=>{
      const paint=(dx,dy)=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=16;
        const context=canvas.getContext('2d');context.fillStyle='#648fc8';context.fillRect(4+dx,4+dy,8,8);
        return context.getImageData(0,0,16,16).data;};
      const expected=paint(0,0),actual=paint(1,0),candidates=[];
      for(const [dx,dy] of [[1e-4,0],[-1e-4,0],[0,1e-4],[0,-1e-4]])candidates.push({dx,dy,pixels:paint(dx,dy)});
      return window.__rasterMembershipProbe(actual,expected,candidates);
    }""")
    assert native_shift['unexplainedPixels'] > 0, ('Oracle accepted a one-physical-pixel contour shift',native_shift)
    return {'quantizationCases':len(cases),'membershipCases':results,'onePhysicalPixelContour':native_shift}


async def settled(page):
    await page.wait_for_function("""()=>{const c=document.querySelector('#puzzleCanvas'),s=window.__puzzleRead?.();
      if(!c||!s||s.loading)return false;const r=c.getBoundingClientRect();
      return Math.abs(r.width-s.canvas.width)<.5&&Math.abs(r.height-s.canvas.height)<.5;}""", polling=50, timeout=30000)
    return await page.evaluate('window.__renderRead()')


async def check_localized_ui(page, locale):
    copy = {
        'ru': {'hint': 'Подсказка', 'metrics': ['Поставлено', 'Время'],
               'title': 'Субъекты Российской Федерации', 'stage': 'Игровая карта', 'canvas': 'Интерактивная карта',
               'controls': ['Вернуть деталь', 'Центрировать', 'Уменьшить', 'Увеличить']},
        'en': {'hint': 'Hint', 'metrics': ['Placed', 'Time'],
               'title': 'Constituent Entities of the Russian Federation', 'stage': 'Game map', 'canvas': 'Interactive map',
               'controls': ['Return piece', 'Centre map', 'Zoom out', 'Zoom in']},
        'zh': {'hint': '提示', 'metrics': ['已放置', '用时'],
               'title': '俄罗斯联邦主体', 'stage': '游戏地图', 'canvas': '互动地图',
               'controls': ['退回拼块', '居中', '缩小', '放大']},
    }[locale]
    state = await page.evaluate('window.__puzzleRead()')
    ui = await page.evaluate("""()=>{const stage=document.querySelector('.puzzle-stage-card'),canvas=document.querySelector('#puzzleCanvas'),p=document.querySelector('#puzzleProgressTrack');
      return {hint:document.querySelector('#puzzleHintLabel').textContent.trim(),title:document.querySelector('#puzzleDatasetTitle').textContent.trim(),
        metrics:[...document.querySelectorAll('.puzzle-stage-metrics > div > span')].map(e=>e.textContent.trim()),
        placed:document.querySelector('#puzzlePlaced').textContent.trim(),stage:stage.getAttribute('aria-label'),canvas:canvas.getAttribute('aria-label'),
        controls:['puzzleReturn','puzzleCenter','puzzleZoomOut','puzzleZoomIn'].map(id=>document.getElementById(id).getAttribute('aria-label')),
        description:canvas.getAttribute('aria-describedby').split(/\\s+/).map(id=>document.getElementById(id).textContent.trim()).join(' '),
        progress:{role:p.getAttribute('role'),name:document.getElementById(p.getAttribute('aria-labelledby')).textContent.trim(),now:p.getAttribute('aria-valuenow'),max:p.getAttribute('aria-valuemax')},
        difficulty:document.querySelector('#puzzleDifficultyLabel').textContent.trim(),
        controlText:document.querySelector('.puzzle-stage-footer').innerText};}""")
    assert ui['hint'] == f"{copy['hint']} · {10-state['hints']}/10", ui
    assert await page.get_by_role('button', name=f"? {ui['hint']}", exact=True).count() == 1
    for key in ['title', 'metrics', 'stage', 'canvas', 'controls']:
        assert ui[key] == copy[key], (locale, key, ui[key])
    assert await page.locator('#puzzleErrors,[data-static-i18n="errors"]').count() == 0
    assert not state['hasErrorCounter']
    assert ui['placed'] == f"{state['placed']} / {state['total']}", ui
    assert ui['progress'] == {'role': 'progressbar', 'name': copy['metrics'][0], 'now': str(state['placed']), 'max': str(state['total'])}, ui
    if locale != 'ru':
        # Territory names are proper nouns; restrict this guard to UI controls.
        assert not re.search('[А-Яа-яЁё]', ui['controlText'] + ui['difficulty'] + ' '.join(ui['controls'] + ui['metrics'])), ui
    return ui


async def layout_evidence(page, fullscreen):
    scene = await settled(page)
    metrics = await page.evaluate("""()=>{const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
      stage:box(document.querySelector('.puzzle-stage-card')),canvas:box(document.querySelector('#puzzleCanvas')),
      footer:box(document.querySelector('.puzzle-stage-footer')),buttons:[...document.querySelectorAll('.puzzle-stage-footer button')].map(box)};}""")
    assert metrics['scrollWidth'] <= metrics['width'] + 1, metrics
    if fullscreen:
        assert metrics['stage']['top'] >= -1 and metrics['stage']['bottom'] <= metrics['height'] + 1, metrics
        assert metrics['canvas']['bottom'] <= metrics['footer']['top'] + 1, metrics
        assert metrics['footer']['bottom'] <= metrics['height'] + 1, metrics
    for button in metrics['buttons']:
        assert button['width'] >= 43.5 and button['height'] >= 43.5, metrics
        assert button['left'] >= -1 and button['right'] <= metrics['width'] + 1, metrics
    return {'metrics': metrics, 'map': scene['map'], 'tray': scene['tray'], 'side': scene['side']}


async def run_case(browser, engine, locale, server, fixtures, output):
    record = {'browser': engine, 'locale': locale, 'status': 'running', 'input': 'trusted mouse and keyboard; synthetic pointer only while seeking the small reference piece'}
    context = await catalog.context_for(browser, server, fixtures, (390, 844), locale, record)
    await context.add_init_script("Object.defineProperty(HTMLElement.prototype,'requestFullscreen',{configurable:true,value(){return Promise.reject(new Error('Isolated fallback capability test'))}})")
    page = await context.new_page()
    page._qa_base, page._qa_locale = server.base, locale
    catalog.observe(page, record)
    try:
        await page.goto(server.base + 'apps/puzzle.html?context=free&qaLocale=' + locale, wait_until='domcontentloaded')
        await page.bring_to_front()
        state = await catalog.ready(page)
        assert state['mode'] == 'world-countries'
        assert not (await page.evaluate('window.__renderRead().snapshot.timerStarted'))
        assert await page.locator('[data-puzzle-mode]').count() == 3
        await page.evaluate("""()=>{const original=window.RudnPuzzleGeometry;window.__geometryTimings=[];
          window.RudnPuzzleGeometry={...original,createTopologyRenderer(...args){const start=performance.now();
          const result=original.createTopologyRenderer(...args);window.__geometryTimings.push(performance.now()-start);return result;}}}""")
        await page.locator('[data-puzzle-mode="country-regions"]').click()
        state = await catalog.ready(page, {'mode': 'russia-subjects', 'selection': None})
        assert state['total'] == 89
        await page.wait_for_function("document.querySelector('#puzzleCountry').options.length>1")
        countries = await page.locator('#puzzleCountry option').evaluate_all('options=>options.map(o=>o.value)')
        assert countries[0] == 'RUS' and countries.count('RUS') == 1
        assert await page.locator('#puzzleCountry').input_value() == 'RUS'
        await page.locator('[data-puzzle-difficulty="hard"]').click()
        await page.wait_for_function("window.__puzzleRead().difficulty==='hard'&&!window.__puzzleRead().loading")
        record['localizedUi'] = await check_localized_ui(page, locale)
        await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
        await settled(page)
        labels = await page.locator('#puzzleReturn .puzzle-action-label,#puzzleCenter .puzzle-action-label').evaluate_all('els=>els.map(e=>getComputedStyle(e).display)')
        assert labels == ['none', 'none'], labels
        assert await page.locator('#puzzleReturn').get_attribute('aria-label')
        record['normalLayout'] = await page.evaluate('window.__renderRead()')
        await page.locator('.puzzle-stage-card').screenshot(path=str(output / f'{engine}-{locale}-portrait.png'))
        record['layouts'] = []
        for width, height in [(320, 568), (360, 800), (412, 915), (390, 844)]:
            await page.set_viewport_size({'width': width, 'height': height})
            record['layouts'].append(await layout_evidence(page, False))

        # Exercise every preceding piece normally; stop on Ingushetia without
        # completing the attempt. Its full silhouette used to collapse to 1–3 points.
        state = await page.evaluate('window.__puzzleRead()')
        names = (await page.evaluate('window.__renderRead()'))['features']
        tiny = next(i for i, item in enumerate(names) if 'Ингуш' in (item['russian'] or ''))
        count = state['order'].index(tiny)
        if count:
            await catalog.place_pieces(page, count)
        assert (await page.evaluate('window.__puzzleRead().current')) == tiny
        assert not (await page.evaluate('window.__puzzleRead().finished'))
        await page.locator('#puzzleFullscreen').click()
        await page.set_viewport_size({'width': 844, 'height': 390})
        current = await settled(page)
        assert current['side'] and current['map']['height'] == current['tray']['height']
        assert current['map']['x'] + current['map']['width'] + 12 <= current['tray']['x'] + 1e-6
        labels = await page.locator('#puzzleReturn .puzzle-action-label,#puzzleCenter .puzzle-action-label').evaluate_all('els=>els.map(e=>getComputedStyle(e).display)')
        assert all(value != 'none' for value in labels), labels
        await page.locator('.puzzle-stage-card').screenshot(path=str(output / f'{engine}-{locale}-landscape-tray.png'))
        for width, height in [(568, 320), (800, 360), (915, 412), (844, 390)]:
            await page.set_viewport_size({'width': width, 'height': height})
            record['layouts'].append(await layout_evidence(page, True))
        current = await settled(page)

        # Leftward exit from the side tray, using trusted pointer input.
        box = await page.locator('#puzzleCanvas').bounding_box()
        source = (await page.evaluate('window.__puzzleRead()'))['source']
        destination = {'x': current['map']['x'] + current['map']['width'] * .6, 'y': current['map']['y'] + current['map']['height'] * .3}
        await page.mouse.move(box['x'] + source['x'], box['y'] + source['y'])
        await page.mouse.down()
        await page.mouse.move(box['x'] + destination['x'], box['y'] + destination['y'], steps=5)
        await page.mouse.up()
        moved = await page.evaluate('window.__puzzleRead()')
        assert not moved['inTray'] and moved['current'] == tiny, moved

        # The scene's geographic centre, relative zoom and loose-piece point
        # survive both responsive projection changes and page restoration.
        for _ in range(9):
            await page.locator('#puzzleZoomIn').click()
        before = (await page.evaluate('window.__renderRead()'))['snapshot']
        await page.set_viewport_size({'width': 390, 'height': 844})
        after = (await settled(page))['snapshot']
        assert abs(before['view']['zoom'] - after['view']['zoom']) < 1e-6
        assert max(abs(a-b) for a,b in zip(before['view']['centre'], after['view']['centre'])) < 1e-6
        assert max(abs(a-b) for a,b in zip(before['pieces'][tiny]['point'], after['pieces'][tiny]['point'])) < 1e-6
        await page.set_viewport_size({'width': 844, 'height': 390})
        await settled(page)

        # Return the active piece and centre the Caucasus through trusted panning;
        # no private setters or synthetic completion state are involved.
        await page.locator('#puzzleReturn').click()
        current = await page.evaluate('window.__renderRead()')
        target = current['features'][tiny]['point']
        center = {'x': current['map']['x'] + current['map']['width']/2, 'y': current['map']['y'] + current['map']['height']/2}
        box = await page.locator('#puzzleCanvas').bounding_box()
        await page.mouse.move(box['x'] + center['x'], box['y'] + center['y'])
        await page.mouse.down()
        await page.mouse.move(box['x'] + center['x'] + center['x'] - target['x'], box['y'] + center['y'] + center['y'] - target['y'], steps=6)
        await page.mouse.up()
        await page.locator('.puzzle-stage-card').screenshot(path=str(output / f'{engine}-{locale}-caucasus-zoom.png'))
        record['zoomState'] = await page.evaluate('window.__renderRead()')
        record['geometrySetupMs'] = await page.evaluate('window.__geometryTimings||[]')
        assert len(record['zoomState']['renderer']['levels']) <= 3
        assert record['zoomState']['renderer']['fullPaths'] <= 3
        await catalog.flush(page)
        saved = (await page.evaluate('window.__renderRead()'))['snapshot']
        await page.keyboard.press('Escape')
        await page.reload(wait_until='domcontentloaded')
        restored = await catalog.ready(page)
        restored_snapshot = (await settled(page))['snapshot']
        assert restored['attemptId'] == saved['attemptId']
        assert restored['placed'] == saved['placed'] and restored['hints'] == saved['hints']
        assert abs(restored_snapshot['view']['zoom'] - saved['view']['zoom']) < 1e-6
        assert max(abs(a-b) for a,b in zip(restored_snapshot['view']['centre'], saved['view']['centre'])) < 1e-6
        next_locale = {'ru': 'en', 'en': 'zh', 'zh': 'ru'}[locale]
        page._qa_locale = next_locale
        await page.goto(server.base + f'apps/puzzle.html?context=free&qaLocale={next_locale}', wait_until='domcontentloaded')
        switched = await catalog.ready(page)
        assert (switched['attemptId'], switched['placed'], switched['hints']) == (saved['attemptId'], saved['placed'], saved['hints'])
        record['languageSwitch'] = {'from': locale, 'to': next_locale, 'beforeHint': await check_localized_ui(page, next_locale)}
        await page.locator('#puzzleCanvas').focus()
        await page.keyboard.press('h')
        assert (await page.evaluate('window.__puzzleRead().hints')) == switched['hints'] + 1
        record['languageSwitch']['afterHint'] = await check_localized_ui(page, next_locale)
        assert not record.get('pageErrors'), record.get('pageErrors')
        assert not record.get('unexpectedWrites'), record.get('unexpectedWrites')
        record['status'] = 'passed'
    except Exception as error:
        record['status'], record['error'] = 'failed', repr(error)
        record['traceback'] = traceback.format_exc()
        try:
            record['lastState'] = await page.evaluate('window.__renderRead?.()')
            await page.screenshot(path=str(output / f'{engine}-{locale}-failure.png'), timeout=10000)
        except Exception:
            pass
    finally:
        await context.close()
    return record


async def run_dpr_case(browser, engine, dpr, server, output):
    record = {'browser': engine, 'dpr': dpr, 'status': 'running', 'input': 'synthetic multi-pointer pinch through real canvas handlers; no state setters'}
    record['pixelOracle'] = {'maxAlphaLevelsAgainstMatchedReference': 1, 'maxPremultipliedChannelLevelsAgainstMatchedReference': 1,
                             'maxReferenceTranslationPhysicalPixels': 1e-4, 'requiresZeroUnexplainedPixels': True, 'rawDifferencesRetained': True}
    context = await browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=dpr, locale='ru-RU', has_touch=True, reduced_motion='reduce')
    await context.add_init_script(catalog.initializer('ru'))
    await context.add_init_script("""(()=>{window.__strokeMetrics=[];const original=CanvasRenderingContext2D.prototype.stroke;
      CanvasRenderingContext2D.prototype.stroke=function(...args){const m=this.getTransform();
        if(['#91b2c6','#004f80','#8e2028','#b97900'].includes(this.strokeStyle))window.__strokeMetrics.push({color:this.strokeStyle,width:this.lineWidth*Math.hypot(m.a,m.b)/Math.min(devicePixelRatio,2)});
        return original.apply(this,args);};})()""")
    page = await context.new_page(); page._qa_base, page._qa_locale = server.base, 'ru'
    catalog.observe(page, record)
    try:
        await page.goto(server.base + 'apps/puzzle.html?context=free&qaLocale=ru', wait_until='domcontentloaded')
        await page.bring_to_front(); await catalog.ready(page)
        record['oracleControls']=await check_raster_oracle(page)
        await page.locator('[data-puzzle-mode="country-regions"]').click()
        await catalog.ready(page, {'mode': 'russia-subjects', 'selection': None})
        await page.locator('#puzzleCanvas').scroll_into_view_if_needed()
        await settled(page)
        if dpr == 3:
            # The Linux WebKit regression occurred on Kirov at the capped DPR2
            # raster scale. Reach that real contour through the existing input
            # handlers so the reference does not depend on a random first piece.
            scene = await page.evaluate('window.__renderRead()')
            index = next(i for i, feature in enumerate(scene['features']) if str(feature['id']) == '115100')
            state = await page.evaluate('window.__puzzleRead()')
            await catalog.place_pieces(page, state['order'].index(index))
            assert (await page.evaluate('window.__puzzleRead().current')) == index
            assert not (await page.evaluate('window.__puzzleRead().finished'))
            record['referenceFeature'] = '115100'
        await page.locator('#puzzleCanvas').focus()
        await page.keyboard.press('h')
        records = []
        for zoom in [1, 2, 4, 8, 16]:
            if zoom > 1:
                await page.evaluate("""()=>{window.__strokeMetrics=[];const c=document.querySelector('#puzzleCanvas'),r=c.getBoundingClientRect(),m=window.__renderRead().map;
                  const x=m.x+m.width/2,y=m.y+m.height/2;
                  const emit=(type,id,dx,buttons)=>c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:id===71,button:0,buttons,clientX:r.left+x+dx,clientY:r.top+y}));
                  emit('pointerdown',71,-20,1);emit('pointerdown',72,20,1);emit('pointermove',72,60,1);emit('pointerup',72,60,0);emit('pointerup',71,-20,0);}""")
                await page.evaluate('new Promise(requestAnimationFrame)')
                await page.keyboard.press('h')
            state = await page.evaluate("""()=>{const c=document.querySelector('#puzzleCanvas');return {zoom:window.__renderRead().snapshot.view.zoom,metrics:window.__strokeMetrics,css:c.getBoundingClientRect().toJSON(),width:c.width,height:c.height,dpr:devicePixelRatio}}""")
            assert abs(state['zoom'] - zoom) < 1e-6, state['zoom']
            assert state['dpr'] == dpr
            assert state['width'] == int(state['css']['width'] * min(dpr, 2))
            assert state['height'] == int(state['css']['height'] * min(dpr, 2))
            colors = {metric['color'] for metric in state['metrics']}
            assert {'#91b2c6', '#8e2028', '#b97900'} <= colors, colors
            for metric in state['metrics']:
                expected = {'#91b2c6': 1, '#004f80': 1, '#8e2028': 1.2, '#b97900': 2.2}[metric['color']]
                assert abs(metric['width'] - expected) < 1e-5, metric
            sprite = await page.evaluate('window.__spriteAudit()')
            assert sprite['currentPath'] and sprite['currentStrokePath'] and sprite['currentFillRule'] and abs(sprite['scale']-sprite['expectedScale']) < 1e-9, sprite
            assert sprite['dpr'] == min(dpr, 2), sprite
            assert 0 < sprite['bytes'] <= 16*1024*1024, sprite
            assert sprite['surfaceLifecycle']['unreleased'] == 0 and sum(sprite['rasterPaints'].values()) > 0, sprite
            assert_raster_quantization(sprite)
            background = await page.evaluate('window.__backgroundAudit()')
            assert background['currentProjection'] and background['currentPieces'], background
            assert background['placed'] == background['expectedPlaced'], background
            assert abs(background['scale']-background['expectedScale']) < 1e-9 and background['dpr']==min(dpr,2), background
            assert background['bytes'] <= 16*1024*1024 and background['outsidePixels']==0, background
            assert_raster_quantization(background, cached=True)
            assert background['draw'] == background['expectedDraw'], background
            await page.keyboard.press('Alt+ArrowRight')
            translated = await page.evaluate('window.__backgroundAudit()')
            assert (await page.evaluate('window.__spritePaints')) == sprite['rasterPaints'], 'Translation rerasterized the active contour'
            assert translated['paints'] == background['paints'], translated
            assert_raster_quantization(translated, cached=True)
            assert translated['outsidePixels']==0 and translated['draw']==translated['expectedDraw'], translated
            await page.keyboard.press('Alt+ArrowLeft')
            records.append({'zoom': zoom, 'canvas': [state['width'], state['height']], 'colors': sorted(colors), 'samples': len(state['metrics']), 'sprite':sprite,'background':background,'translated':translated})
        await page.locator('.puzzle-stage-card').screenshot(path=str(output / f'{engine}-dpr{dpr}-zoom16.png'))
        record['backgroundInvalidation'] = await check_background_invalidation(page)
        record['zooms'], record['status'] = records, 'passed'
        assert not record.get('pageErrors'), record.get('pageErrors')
    except Exception as error:
        record['status'], record['error'], record['traceback'] = 'failed', repr(error), traceback.format_exc()
    finally:
        await context.close()
    return record


async def check_background_invalidation(page):
    await page.locator('#puzzleCenter').click()
    await page.locator('#puzzleReturn').click()
    await page.locator('#puzzleCanvas').focus()
    before = await page.evaluate('window.__backgroundAudit()')
    # Move beyond the overscan: a newly rendered exact-scale tile must replace it.
    for _ in range(10):
        await page.keyboard.press('Alt+Shift+ArrowRight')
    beyond = await page.evaluate('window.__backgroundAudit()')
    assert beyond['paints'] > before['paints'], beyond
    assert_raster_quantization(beyond, cached=True)
    assert beyond['draw'] == beyond['expectedDraw'] and beyond['outsidePixels'] == 0, beyond
    await page.locator('#puzzleCenter').click()
    before_drop = await page.evaluate('window.__backgroundAudit()')
    await catalog.trusted_drop(page)
    locked = await page.evaluate('window.__backgroundAudit()')
    assert locked['placed'] == before_drop['placed'] + 1 and locked['expectedPlaced'] == locked['placed'], locked
    assert locked['paints'] > before_drop['paints'], locked
    assert_raster_quantization(locked, cached=True)
    await page.set_viewport_size({'width': 844, 'height': 390})
    await settled(page)
    resized = await page.evaluate('window.__backgroundAudit()')
    assert resized['currentProjection'] and resized['currentPieces'], resized
    assert_raster_quantization(resized, cached=True)
    assert resized['bytes'] <= 16 * 1024 * 1024 and resized['outsidePixels'] == 0, resized
    return {'beyondOverscan':beyond,'locked':locked,'resized':resized}


async def main(args):
    output, fixtures = Path(args.output), Path(args.fixtures)
    output.mkdir(parents=True, exist_ok=True)
    catalog.READ_ONLY_HOOK += RENDER_HOOK
    records = []
    with catalog.PuzzleServer(fixtures) as server:
        async with async_playwright() as playwright:
            for engine in args.browsers:
                # Firefox otherwise inherits the host proxy, which can reject
                # the isolated loopback origin before any app code is loaded.
                options = {'firefox_user_prefs': {'network.proxy.type': 0}} if engine == 'firefox' else {}
                browser = await getattr(playwright, engine).launch(**options)
                try:
                    for locale in args.locales:
                        started = time.monotonic()
                        record = await run_case(browser, engine, locale, server, fixtures, output)
                        record['elapsedSeconds'] = time.monotonic() - started
                        records.append(record)
                        (output / 'render-browser.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
                        print(json.dumps({key: record[key] for key in ['browser', 'locale', 'status', 'elapsedSeconds']}, ensure_ascii=False), flush=True)
                        if record['status'] != 'passed': print(record.get('error'), flush=True)
                    if args.dpr_checks:
                        for dpr in [1, 2, 3]:
                            record = await run_dpr_case(browser, engine, dpr, server, output)
                            records.append(record)
                            (output / 'render-browser.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
                            print(json.dumps({'browser': engine, 'dpr': dpr, 'status': record['status'], 'error': record.get('error')}, ensure_ascii=False), flush=True)
                finally:
                    await browser.close()
    if len(records) != len(args.browsers) * (len(args.locales) + (3 if args.dpr_checks else 0)) or any(record['status'] != 'passed' for record in records):
        raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixtures', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--browsers', nargs='+', default=['chromium', 'firefox', 'webkit'])
    parser.add_argument('--locales', nargs='+', default=['ru', 'en', 'zh'])
    parser.add_argument('--dpr-checks', action='store_true')
    asyncio.run(main(parser.parse_args()))
