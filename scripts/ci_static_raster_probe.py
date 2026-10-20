"""Evidence-only exact-seed native pipeline probe; run from repository root.

The existing DPR3 scenario, input, assertions and verdict remain intact.
Bounded JS-only paint-plan observers precede the original q/p comparison.
No additional native getters, canvas calls or readbacks precede its verdict.
Five independent secondary controls run in cleanup, after original assertions.
"""
import argparse
import asyncio
import base64
import copy
import hashlib
import json
import platform
import sys
from pathlib import Path

SEED = 2277844156
ORIGINAL_SOURCE_HASHES = {
    'puzzle-engine.js': '93d9366eeb2ae5881d3337d10c8e54a5608354b852fbe9e7c34990b9f0b7776a',
    'puzzle-render-geometry.js': 'f6751e094fcbeefd510fb05f056dcd8e4a590005357c06e24539c6a4facd942e',
    'puzzle-raster-worker.js': '2c7bb6549e2bded941a6b96f37b43a695c517065d85a431c16c1cffdbb9ecd74',
}
CAPTURE_HOOK = r"""
  let staticEvidencePending=null,staticEvidenceCaptured=null,paintPlanFrozen=false,auditDepth=0;
  let lastStaticPlan=null,lastReferencePlan=null,activePaintPass=null,nextIdentity=1;
  const paintIdentities=new WeakMap(),MAX_PLAN_FEATURES=512,MAX_CAPTURE_ERRORS=16;
  window.__staticEvidenceErrors=[];
  const paintError=(stage,error)=>{if(window.__staticEvidenceErrors.length<MAX_CAPTURE_ERRORS)
    window.__staticEvidenceErrors.push({stage,name:error?.name||'Error'});};
  const identity=value=>{
    if(value===null||value===undefined)return null;
    if(typeof value!=='object'&&typeof value!=='function')return null;
    if(!paintIdentities.has(value))paintIdentities.set(value,nextIdentity++);
    return paintIdentities.get(value);
  };
  const boundedCopy=values=>{
    if(values.length>MAX_PLAN_FEATURES)throw new RangeError('paint-plan-bound');
    return [...values];
  };
  const numericView=view=>({x:view.x,y:view.y,k:view.k});
  const numericMap=map=>({x:map.x,y:map.y,width:map.width,height:map.height});
  const snapshotPass=(name,view,map)=>{
    const dpr=state.dpr,lodScale=state.view.k;
    // These are source-declared JS parameters, never reads of native context state.
    return {name,view:numericView(view),map:numericMap(map),dpr,lodScale,
      clipMatrix:[dpr,0,0,dpr,0,0],sceneMatrix:[dpr*view.k,0,0,dpr*view.k,dpr*view.x,dpr*view.y],
      styles:{fill:name==='map'?'#e7f1f7':'#0079c1',stroke:name==='map'?'#91b2c6':'#004f80',
        lineWidth:1/lodScale,lineJoin:'round',lineCap:'round',fillRule:state.mode==='russia-subjects'?'nonzero':'evenodd'},
      scene:{mode:state.mode,selection:state.selection??null,seed:state.seed,placed:state.placed,current:state.current,
        view:numericView(state.view),map:numericMap(state.mapRect),baseViewK:state.baseViewK,
        renderGeometryId:identity(state.renderGeometry),projectionId:identity(state.projection),
        featuresId:identity(state.features),piecesId:identity(state.pieces),boundsId:identity(state.bounds),
        pathsId:identity(state.paths),strokePathsId:identity(state.strokePaths),order:boundedCopy(state.order),
        pieces:boundedCopy(state.pieces).map(piece=>({index:piece.index,locked:piece.locked,inTray:piece.inTray}))},
      operations:[],completed:false};
  };
  const sourceDrawMap=drawMap,sourceDrawLockedPieces=drawLockedPieces,sourceDisplayPaths=displayPaths;
  const observePaintPass=(name,original,receiver,args)=>{
    const previousPass=activePaintPass;
    let pass=null,plan=null,successful=false;
    try{
      const context=args[0]===undefined?ctx:args[0];
      if(!paintPlanFrozen&&(context===staticCtx||auditDepth>0)){
        const role=context===staticCtx?'static':'reference';
        const view=args[1]===undefined?state.view:args[1],map=args[2]===undefined?state.mapRect:args[2];
        const previous=role==='static'?lastStaticPlan:lastReferencePlan;
        plan=name==='map'||!previous||previous.context!==context
          ?{role,context,contextId:identity(context),passes:[],paths:new Map(),orphan:name!=='map'}:previous;
        if(plan.passes.length>=2)throw new RangeError('paint-pass-bound');
        pass=snapshotPass(name,view,map);plan.passes.push(pass);
        if(role==='static')lastStaticPlan=plan;else lastReferencePlan=plan;
        activePaintPass={pass,plan};
      }
    }catch(error){paintError('observe-pass',error);pass=null;plan=null;activePaintPass=previousPass;}
    try{
      // Exactly one original call; observation cannot swallow a native failure.
      const result=Reflect.apply(original,receiver,args);successful=true;return result;
    }finally{
      if(pass)pass.completed=successful;
      activePaintPass=previousPass;
    }
  };
  drawMap=function(...args){return observePaintPass('map',sourceDrawMap,this,args);};
  drawLockedPieces=function(...args){return observePaintPass('locked',sourceDrawLockedPieces,this,args);};
  displayPaths=function(...args){
    const result=Reflect.apply(sourceDisplayPaths,this,args);
    try{
      if(activePaintPass&&!paintPlanFrozen){
        const {pass,plan}=activePaintPass,index=args[0];
        if(pass.operations.length>=MAX_PLAN_FEATURES)throw new RangeError('paint-operation-bound');
        const pathId=identity(result.path),strokePathId=identity(result.strokePath);
        // Source drawMap/drawLockedPieces immediately fill then stroke this pair.
        pass.operations.push({order:pass.operations.length,index,
          featureId:state.features[index]?.properties._puzzleId??null,pathId,strokePathId,kinds:['fill','stroke']});
        plan.paths.set(pathId,result.path);plan.paths.set(strokePathId,result.strokePath);
      }
    }catch(error){paintError('observe-returned-paths',error);}
    return result;
  };
  // The original audit invokes this after its existing getImageData/difference.
  // Retain its buffers and last observed plans, with no canvas/native calls.
  window.__captureStaticEvidence=({q,p,width,height,cacheDifference,sprite,view,map})=>{
    try{
      if(staticEvidencePending||staticEvidenceCaptured||state.seed!==2277844156||state.placed!==20||state.current!==49)return;
      const zoom=state.view.k/state.baseViewK;
      if(Math.abs(zoom-4)>1e-6)return;
      paintPlanFrozen=true;
      const indices=[...new Set([lastStaticPlan,lastReferencePlan].flatMap(plan=>
        (plan?.passes||[]).flatMap(pass=>pass.operations.map(operation=>operation.index))))];
      const featureBounds=Object.fromEntries(indices.map(index=>{
        const bounds=state.bounds[index];return [index,{x0:bounds.x0,y0:bounds.y0,x1:bounds.x1,y1:bounds.y1}];
      }));
      staticEvidencePending={q,p,plans:{actual:lastStaticPlan,reference:lastReferencePlan},
        metadata:{seed:state.seed,order:[...state.order],current:state.current,
        featureId:state.features[state.current]?.properties._puzzleId,zoom,placed:state.placed,
        deviceDpr:devicePixelRatio,rasterDpr:state.dpr,width,height,scale:sprite.scale,
        cacheView:{...view},cacheMap:{...map},mapRect:{...state.mapRect},draw:{...window.__backgroundDraw},
        baselineDifference:cacheDifference,fillRule:state.mode==='russia-subjects'?'nonzero':'evenodd',featureBounds,
        consumerCssSize:{width:state.cssWidth,height:state.cssHeight}}};
    }catch(error){paintError('retain-original-buffers',error);}
  };
  const observedStaticAudit=window.__backgroundAudit;
  window.__backgroundAudit=function(...args){
    let result;auditDepth++;
    try{result=Reflect.apply(observedStaticAudit,this,args);}finally{auditDepth--;}
    // All original sixteen jitter comparisons have completed. No re-selection
    // of display paths here: controls retain the actual objects observed earlier.
    if(staticEvidencePending){
      const capture=staticEvidencePending;staticEvidencePending=null;staticEvidenceCaptured=capture;
      try{
        for(const [kind,plan] of Object.entries(capture.plans))
          if(!plan||plan.orphan||plan.passes.length!==2||plan.passes.some(pass=>!pass.completed))
            throw new Error('incomplete-'+kind+'-paint-plan');
        capture.metadata.originalAudit=result;
        capture.metadata.originalPaintHistoryAvailable='last-completed-static-and-cache-reference-only';
      }catch(error){capture.controlError={stage:'validate-retained-plans',name:error?.name||'Error'};}
    }
    return result;
  };
  const staticEvidencePng=(pixels,width,height)=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
    const png=canvas.toDataURL('image/png');canvas.width=canvas.height=0;return png;
  };
  const pipelineMatrix=(pass,precision)=>pass.sceneMatrix.map((value,index)=>
    precision==='f32'&&[0,3,4,5].includes(index)?Math.fround(value):value);
  const pipelinePrecisionEvidence=(plan,bounds)=>({model:'Math.fround on physical scene CTM a,d,e,f only',
    passes:plan.passes.map(pass=>{
      const original=pass.sceneMatrix,rounded=pipelineMatrix(pass,'f32');
      const features=pass.operations.map(operation=>{
        const b=bounds[operation.index];let maximumPhysicalDelta=-1,maximumCorner=null;
        for(const [x,y] of [[b.x0,b.y0],[b.x0,b.y1],[b.x1,b.y0],[b.x1,b.y1]]){
          const dx=(rounded[0]-original[0])*x+(rounded[2]-original[2])*y+rounded[4]-original[4];
          const dy=(rounded[1]-original[1])*x+(rounded[3]-original[3])*y+rounded[5]-original[5];
          const distance=Math.hypot(dx,dy);
          if(distance>maximumPhysicalDelta){maximumPhysicalDelta=distance;maximumCorner={x,y,dx,dy};}
        }
        return {index:operation.index,maximumPhysicalDelta,maximumCorner};
      });
      return {name:pass.name,originalMatrix:original,f32Matrix:rounded,features,
        maximumPhysicalDelta:Math.max(0,...features.map(feature=>feature.maximumPhysicalDelta))};
    })});
  window.__finishStaticEvidence=async()=>{
    if(!staticEvidenceCaptured)return {records:[],errors:window.__staticEvidenceErrors};
    const {q,p,metadata:m,plans,controlError}=staticEvidenceCaptured;
    const sample=pixels=>Array.from(pixels.slice((1236*m.width+361)*4,(1236*m.width+361)*4+4));
    // These are the original q/p buffers, not a new read of the game's canvas.
    const record={...m,baselineActualSample:sample(q),baselineReferenceSample:sample(p),
      actualPng:staticEvidencePng(q,m.width,m.height),referencePng:staticEvidencePng(p,m.width,m.height),
      controlsStartedAfterOriginalScenario:true,controls:[],
      observedPlans:Object.fromEntries(Object.entries(plans).map(([kind,plan])=>[kind,plan?{
        contextId:plan.contextId,role:plan.role,orphan:plan.orphan,passes:plan.passes}:null]))};
    if(controlError){record.controlError=controlError;return {records:[record],errors:window.__staticEvidenceErrors};}
    const paint=(context,plan,precision='original')=>{
      for(const pass of plan.passes){
        context.save();context.setTransform(...pass.clipMatrix);context.beginPath();
        context.rect(pass.map.x,pass.map.y,pass.map.width,pass.map.height);context.clip();
        context.setTransform(...pipelineMatrix(pass,precision));
        context.fillStyle=pass.styles.fill;context.strokeStyle=pass.styles.stroke;
        context.lineWidth=pass.styles.lineWidth;context.lineJoin=pass.styles.lineJoin;context.lineCap=pass.styles.lineCap;
        for(const operation of pass.operations){
          context.fill(plan.paths.get(operation.pathId),pass.styles.fillRule);
          context.stroke(plan.paths.get(operation.strokePathId));
        }
        context.restore();
      }
    };
    // Only source-context options and the consumer change in the 2x2 matrix.
    // The fifth cell is a separate deterministic precision model, not acceptance.
    const cells=[
      {kind:'default-detached',frequent:false,consumer:'detached',precision:'original'},
      {kind:'default-visible',frequent:false,consumer:'visible-main',precision:'original'},
      {kind:'frequent-detached',frequent:true,consumer:'detached',precision:'original'},
      {kind:'frequent-visible',frequent:true,consumer:'visible-main',precision:'original'},
      {kind:'f32-default-detached',frequent:false,consumer:'detached',precision:'f32'}];
    const destinationSize={width:Math.floor(m.consumerCssSize.width*m.rasterDpr),
      height:Math.floor(m.consumerCssSize.height*m.rasterDpr)};
    const nativeObservation=()=>{
      const r=els.canvas.getBoundingClientRect(),style=getComputedStyle(els.canvas);
      const x=r.left+m.mapRect.x+m.mapRect.width/2,y=r.top+m.mapRect.y+m.mapRect.height/2;
      const inViewport=x>=0&&x<innerWidth&&y>=0&&y<innerHeight;
      const hit=inViewport?document.elementFromPoint(x,y):null;
      return {documentVisible:document.visibilityState==='visible',connected:els.canvas.isConnected,
        rectangle:{x:r.x,y:r.y,width:r.width,height:r.height},width:els.canvas.width,height:els.canvas.height,
        display:style.display,visibility:style.visibility,opacity:style.opacity,
        mapCenterInViewport:inViewport,mapCenterHitsCanvas:hit===els.canvas,
        stateView:numericView(state.view),stateMap:numericMap(state.mapRect),stateDpr:state.dpr};
    };
    const visible=info=>info.documentVisible&&info.connected&&info.display!=='none'&&info.visibility==='visible'
      &&Number(info.opacity)>0&&info.rectangle.width>0&&info.rectangle.height>0
      &&info.mapCenterInViewport&&info.mapCenterHitsCanvas;
    const twoFrames=()=>new Promise(resolve=>{
      const timestamps=[];let done=false,frame;
      const finish=status=>{if(done)return;done=true;clearTimeout(timer);cancelAnimationFrame(frame);resolve({status,timestamps});};
      const tick=time=>{timestamps.push(time);if(timestamps.length===2)finish('two-frames');else frame=requestAnimationFrame(tick);};
      // This bounds only post-verdict observation. It cannot turn an original FAIL into PASS.
      const timer=setTimeout(()=>finish('observation-timeout'),2000);frame=requestAnimationFrame(tick);
    });
    let activeControl=null,ownConsumerDraw=false;
    const originalMainMethods=[],observerFailures=[];
    for(const method of ['clearRect','drawImage','fill','stroke','fillRect','strokeRect','fillText','strokeText']){
      try{
        const descriptor=Object.getOwnPropertyDescriptor(ctx,method),original=ctx[method];
        const wrapper=function(...args){
          if(activeControl&&!ownConsumerDraw){
            const counts=activeControl.mainInterference;counts[method]=(counts[method]||0)+1;
          }
          return Reflect.apply(original,this,args);
        };
        ctx[method]=wrapper;
        if(ctx[method]!==wrapper)throw new Error('observer-unavailable');
        originalMainMethods.push({method,descriptor,wrapper});
      }catch(error){observerFailures.push({method,name:error?.name||'Error'});}
    }
    try{
      for(const cell of cells){
        const control={...cell,status:'running',mainInterference:{},observerFailures,
          sourceContextOptions:cell.frequent?{alpha:true,willReadFrequently:true}:{alpha:true},
          readOrder:['source','destination'],destinationSize,sourcePlan:'captured-actual',inconclusiveReasons:[]};
        let canvas=null,destination=null;
        try{
          activeControl=control;control.before=nativeObservation();
          if(cell.consumer==='visible-main'&&(!visible(control.before)
            ||control.before.width!==destinationSize.width||control.before.height!==destinationSize.height)){
            control.status='inconclusive';control.inconclusiveReasons.push('visible-main-precondition');
            record.controls.push(control);continue;
          }
          canvas=document.createElement('canvas');canvas.width=m.width;canvas.height=m.height;
          const context=canvas.getContext('2d',control.sourceContextOptions);
          paint(context,plans.actual,cell.precision);
          let consumer;
          if(cell.consumer==='visible-main'){destination=els.canvas;consumer=ctx;}
          else{destination=document.createElement('canvas');destination.width=destinationSize.width;
            destination.height=destinationSize.height;consumer=destination.getContext('2d',{alpha:true});}
          // No source read/PNG/bitmap transfer occurred before this consumer.
          ownConsumerDraw=true;
          try{
            consumer.save();
            try{
              consumer.setTransform(m.rasterDpr,0,0,m.rasterDpr,0,0);
              consumer.clearRect(0,0,m.consumerCssSize.width,m.consumerCssSize.height);
              consumer.beginPath();consumer.rect(m.mapRect.x,m.mapRect.y,m.mapRect.width,m.mapRect.height);consumer.clip();
              consumer.drawImage(canvas,m.draw.x,m.draw.y,m.draw.width,m.draw.height);
            }finally{consumer.restore();}
          }finally{ownConsumerDraw=false;}
          control.frames=await twoFrames();
          const pixels=context.getImageData(0,0,m.width,m.height).data;
          const destinationPixels=consumer.getImageData(0,0,destination.width,destination.height).data;
          control.after=nativeObservation();
          if(control.frames.status!=='two-frames')control.inconclusiveReasons.push('two-frame-observation-timeout');
          if(!control.after.documentVisible)control.inconclusiveReasons.push('document-not-visible');
          if(cell.consumer==='visible-main'){
            if(observerFailures.length)control.inconclusiveReasons.push('main-observer-unavailable');
            if(Object.values(control.mainInterference).some(count=>count>0))control.inconclusiveReasons.push('main-render-interference');
            if(!visible(control.after))control.inconclusiveReasons.push('main-not-visible-after-consumer');
            if(JSON.stringify(control.before)!==JSON.stringify(control.after))control.inconclusiveReasons.push('main-geometry-or-view-changed');
          }
          control.status=control.inconclusiveReasons.length?'inconclusive':'observed';
          control.versusActual=rasterPixelDifference(q,pixels,m.width);
          control.versusReference=rasterPixelDifference(p,pixels,m.width);
          control.sample=sample(pixels);control.png=staticEvidencePng(pixels,m.width,m.height);
          control.destinationPng=staticEvidencePng(destinationPixels,destination.width,destination.height);
          control.actualContextAttributes=context.getContextAttributes?.()??null;
          if(cell.precision==='f32')control.precisionEvidence=pipelinePrecisionEvidence(plans.actual,m.featureBounds);
          record.controls.push(control);
        }catch(error){
          control.status='inconclusive';control.inconclusiveReasons.push('secondary-control-error');
          control.error={name:error?.name||'Error'};record.controls.push(control);
        }finally{
          activeControl=null;ownConsumerDraw=false;
          if(canvas)canvas.width=canvas.height=0;
          if(destination&&destination!==els.canvas)destination.width=destination.height=0;
        }
      }
    }finally{
      activeControl=null;
      for(const {method,descriptor,wrapper} of originalMainMethods){
        try{if(ctx[method]===wrapper){if(descriptor)Object.defineProperty(ctx,method,descriptor);else delete ctx[method];}}
        catch(error){paintError('restore-post-verdict-main-observer',error);}
      }
    }
    record.mainRestored=false;record.mainRestorationReason='Test context closes immediately after collection; no extra product repaint';
    return {records:[record],errors:window.__staticEvidenceErrors};
  };
"""


def first_difference(actual, reference, path='$'):
    if isinstance(actual, dict) and isinstance(reference, dict):
        if set(actual) != set(reference):
            return {'path': path + '.keys', 'actual': sorted(actual), 'reference': sorted(reference)}
        for key in sorted(actual):
            difference = first_difference(actual[key], reference[key], path + '.' + key)
            if difference is not None:
                return difference
        return None
    if isinstance(actual, list) and isinstance(reference, list):
        if len(actual) != len(reference):
            return {'path': path + '.length', 'actual': len(actual), 'reference': len(reference)}
        for index, (left, right) in enumerate(zip(actual, reference)):
            difference = first_difference(left, right, f'{path}[{index}]')
            if difference is not None:
                return difference
        return None
    if actual != reference or (type(actual) is bool) != (type(reference) is bool):
        return {'path': path, 'actual': actual, 'reference': reference}
    return None


def plan_categories(plan):
    passes = plan['passes']
    return {
        'numericParameters': [{key: item[key] for key in
            ('view', 'map', 'dpr', 'lodScale', 'clipMatrix', 'sceneMatrix')} |
            {'lineWidth': item['styles']['lineWidth']} for item in passes],
        'ordering': [{'pass': item['name'], 'operations': [{key: operation[key] for key in
            ('order', 'index', 'featureId', 'kinds')} for operation in item['operations']]} for item in passes],
        'nativePathIdentity': [[{key: operation[key] for key in ('index', 'pathId', 'strokePathId')}
            for operation in item['operations']] for item in passes],
        'declaredStyles': [{key: value for key, value in item['styles'].items() if key != 'lineWidth'} for item in passes],
        'semanticState': [item['scene'] for item in passes],
    }


def semantic_digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
        separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()


def compare_observed_plans(record):
    observed = record['observedPlans']
    if not observed['actual'] or not observed['reference']:
        return {'status': 'incomplete', 'equal': False}
    actual, reference = plan_categories(observed['actual']), plan_categories(observed['reference'])
    categories = {}
    for category in actual:
        difference = first_difference(actual[category], reference[category])
        categories[category] = {'equal': difference is None,
            'actualSHA256': semantic_digest(actual[category]),
            'referenceSHA256': semantic_digest(reference[category]), 'firstDifference': difference}
    return {'status': 'compared', 'equal': all(item['equal'] for item in categories.values()),
        'actualSemanticSHA256': semantic_digest(actual), 'referenceSemanticSHA256': semantic_digest(reference),
        'categories': categories,
        'contextIdentityExcluded': True,
        'limits': 'WeakMap IDs establish object identity within this run only. Styles/matrices are source-declared JS parameters, not native context getters. Equal input plans do not prove equal native raster pipelines.'}


def self_test():
    item = {'name': 'map', 'view': {'x': 1, 'y': 2, 'k': 3},
        'map': {'x': 0, 'y': 0, 'width': 20, 'height': 30}, 'dpr': 2, 'lodScale': 3,
        'clipMatrix': [2, 0, 0, 2, 0, 0], 'sceneMatrix': [6, 0, 0, 6, 2, 4],
        'styles': {'lineWidth': 1 / 3, 'fill': '#e7f1f7', 'stroke': '#91b2c6',
            'lineJoin': 'round', 'lineCap': 'round', 'fillRule': 'nonzero'},
        'scene': {'renderGeometryId': 4, 'placed': 20},
        'operations': [{'order': 0, 'index': 8, 'featureId': 115100,
            'kinds': ['fill', 'stroke'], 'pathId': 20, 'strokePathId': 21}]}
    plan = {'contextId': 1, 'passes': [item]}
    records = []
    for name, category, change in [
        ('equal-inputs-different-contexts', None, lambda other: other.update(contextId=2)),
        ('numeric-matrix', 'numericParameters', lambda other: other['passes'][0]['sceneMatrix'].__setitem__(4, 2.1)),
        ('path-order', 'ordering', lambda other: other['passes'][0]['operations'][0].update(order=1)),
        ('native-path-identity', 'nativePathIdentity', lambda other: other['passes'][0]['operations'][0].update(pathId=22)),
        ('declared-style', 'declaredStyles', lambda other: other['passes'][0]['styles'].update(fill='#000000')),
        ('semantic-renderer', 'semanticState', lambda other: other['passes'][0]['scene'].update(renderGeometryId=7)),
    ]:
        reference = copy.deepcopy(plan)
        change(reference)
        result = compare_observed_plans({'observedPlans': {'actual': plan, 'reference': reference}})
        if category is None:
            assert result['equal'] and result['actualSemanticSHA256'] == result['referenceSemanticSHA256']
        else:
            assert not result['equal'] and result['categories'][category]['firstDifference'] is not None
            assert all(value['equal'] for key, value in result['categories'].items() if key != category)
        records.append({'name': name, 'status': 'pass'})
    print(json.dumps({'status': 'passed', 'cases': records}, ensure_ascii=False))


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
    assert before_hashes == ORIGINAL_SOURCE_HASHES, 'This evidence probe requires the exact original 6f render sources, without fresh-surface/JSON patches'
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
                                    record['planComparison'] = compare_observed_plans(record)
                                    for key in ('actual', 'reference'):
                                        raw = base64.b64decode(record.pop(key+'Png').split(',', 1)[1])
                                        path = output / f'capture-{index}-{key}.png'
                                        path.write_bytes(raw)
                                        record[key+'Png'] = {'file': path.name, 'sha256': hashlib.sha256(raw).hexdigest()}
                                    for control in record['controls']:
                                        for key, suffix in [('png', ''), ('destinationPng', '-destination')]:
                                            if not control.get(key):
                                                continue
                                            raw = base64.b64decode(control.pop(key).split(',', 1)[1])
                                            path = output / f'capture-{index}-{control["kind"]}{suffix}.png'
                                            path.write_bytes(raw)
                                            control[key] = {'file': path.name, 'sha256': hashlib.sha256(raw).hexdigest()}
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
                    'newPaintObserversBeforeOriginalAudit': 'JS-only drawMap/drawLockedPieces/displayPaths wrappers',
                    'newCanvasOperationsBeforeOriginalVerdict': False, 'newNativeCanvasGettersBeforeOriginalVerdict': False,
                    'controlsAlterAcceptance': False, 'originalPaintHistoryAvailable': 'last-completed-static-and-cache-reference-plans',
                    'bounds': {'featuresPerPass': 512, 'passesPerPlan': 2, 'latestPlans': 2, 'errors': 16},
                    'secondaryMatrix': 'Default/willReadFrequently source context x detached/existing-visible-main consumer; fifth default-detached cell Math.fround physical CTM a,d,e,f only',
                    'secondaryReadOrder': ['two requestAnimationFrame callbacks after consumer', 'source', 'destination'],
                    'secondaryStatus': 'complete' if captures and all(len(item['controls']) == 5 and
                        all(control['status'] == 'observed' for control in item['controls']) for item in captures) else 'inconclusive',
                    'limitation': 'Original test instrumentation and assertions remain. Additional JS observation overhead and retaining native paths may affect timing/lifetime. Primary q/p, 16 jitters and verdict are not replaced. Native paths are already warmed by the audit/jitters. Two animation frames are not a GPU completion guarantee. willReadFrequently is a context hint; DOM visibility does not identify a backend. F32 is one deterministic matrix precision model, not an inferred native implementation. Secondary controls use the existing visible main context without stopping normal RAF; interference/visibility changes are inconclusive. Neither full original context history nor a production fix is established.'}
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
    parser.add_argument('--output')
    parser.add_argument('--fixtures')
    parser.add_argument('--executable')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        if not args.output:
            parser.error('--output is required for the native probe')
        asyncio.run(main(args))
