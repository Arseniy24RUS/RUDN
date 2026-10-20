"""Evidence-only exact-seed static readback-policy candidate; run from repository root.

The DPR3 scenario and strict assertions remain; two explicitly pinned candidate
lines change startup static context and independent equal-size cache reference
to alpha:true,willReadFrequently:true. This is NOT the original 6f runtime.
Bounded JS-only paint-plan observers precede the original q/p comparison.
No additional native getters, canvas calls or readbacks precede its verdict.
Additional controls run only in context cleanup, after the original assertions.
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
CANDIDATE_RENDER_TEST_SHA256 = 'da75d987e3683da6768c6f115a5749e4682a1ea2e03994ff1cedda2b8b419a09'
BASELINE_ENGINE_SHA256 = '93d9366eeb2ae5881d3337d10c8e54a5608354b852fbe9e7c34990b9f0b7776a'
BASELINE_RENDER_TEST_SHA256 = '123f93a85875e96c087a979922e18bede9f6e55a1aff6758fdc9ac375c8689a1'
CANDIDATE_SOURCE_HASHES = {
    'puzzle-engine.js': 'dec35dd1898c791657377c0771aa745730e9ba9b67ddb014a9b8654dfcf939d1',
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
      staticEvidencePending={q,p,plans:{actual:lastStaticPlan,reference:lastReferencePlan},
        metadata:{seed:state.seed,order:[...state.order],current:state.current,
        featureId:state.features[state.current]?.properties._puzzleId,zoom,placed:state.placed,
        deviceDpr:devicePixelRatio,rasterDpr:state.dpr,width,height,scale:sprite.scale,
        cacheView:{...view},cacheMap:{...map},mapRect:{...state.mapRect},draw:{...window.__backgroundDraw},
        baselineDifference:cacheDifference,fillRule:state.mode==='russia-subjects'?'nonzero':'evenodd'}};
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
  window.__finishStaticEvidence=()=>{
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
    const paint=(context,plan)=>{
      for(const pass of plan.passes){
        context.save();context.setTransform(...pass.clipMatrix);context.beginPath();
        context.rect(pass.map.x,pass.map.y,pass.map.width,pass.map.height);context.clip();
        context.setTransform(...pass.sceneMatrix);
        context.fillStyle=pass.styles.fill;context.strokeStyle=pass.styles.stroke;
        context.lineWidth=pass.styles.lineWidth;context.lineJoin=pass.styles.lineJoin;context.lineCap=pass.styles.lineCap;
        for(const operation of pass.operations){
          context.fill(plan.paths.get(operation.pathId),pass.styles.fillRule);
          context.stroke(plan.paths.get(operation.strokePathId));
        }
        context.restore();
      }
    };
    for(const kind of ['actual','reference']){
      const canvas=document.createElement('canvas');canvas.width=m.width;canvas.height=m.height;
      try{
        const context=canvas.getContext('2d',{alpha:true,willReadFrequently:true});paint(context,plans[kind]);
        const pixels=context.getImageData(0,0,m.width,m.height).data;
        record.controls.push({kind:'exact-'+kind+'-plan',contextPolicy:{alpha:true,willReadFrequently:true},acceptanceRole:'post-verdict diagnostic only',
          versusActual:rasterPixelDifference(q,pixels,m.width),versusReference:rasterPixelDifference(p,pixels,m.width),
          sample:sample(pixels),png:staticEvidencePng(pixels,m.width,m.height)});
      }finally{canvas.width=canvas.height=0;}
    }
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
    oracle_file = repo / 'scripts/test_puzzle_render_browser.py'
    oracle_before = hashlib.sha256(oracle_file.read_bytes()).hexdigest()
    assert oracle_before == CANDIDATE_RENDER_TEST_SHA256, 'Exact two-line candidate oracle required; assertions/jitters unchanged'
    assert before_hashes == CANDIDATE_SOURCE_HASHES, 'Exact readback-policy candidate sources required; not the pristine 6f runtime'
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
                                        raw = base64.b64decode(control.pop('png').split(',', 1)[1])
                                        path = output / f'capture-{index}-{control["kind"]}.png'
                                        path.write_bytes(raw)
                                        control['png'] = {'file': path.name, 'sha256': hashlib.sha256(raw).hexdigest()}
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
                oracle_after = hashlib.sha256(oracle_file.read_bytes()).hexdigest()
                result['renderOracleHashes'] = {'before': oracle_before, 'after': oracle_after}
                result['renderOracleStable'] = oracle_before == oracle_after
                result['candidate'] = {'baseCommit': '6f7c4016299de7ed92bd6fdc2b63c36b12bd2cf1',
                    'sourcePolicyChanged': True, 'contextPolicy': {'alpha': True, 'willReadFrequently': True},
                    'runtimeChange': 'Policy on first staticCanvas.getContext only',
                    'oracleChange': 'Same declared policy on first equal-size cache-reference getContext only',
                    'unchangedPolicies': 'Full-visible-map reference and all16jitter canvases remain default',
                    'baselineEngineSHA256': BASELINE_ENGINE_SHA256, 'baselineOracleSHA256': BASELINE_RENDER_TEST_SHA256,
                    'baselineFailure': 'Retained separately; this candidate result does not rewrite the original6f failure',
                    'sourceStableMeaning': 'Candidate bytes did not change during this run, not equality to original6f',
                    'hintLimit': 'willReadFrequently does not guarantee CPU placement or backend stability'}
                result['probe'] = {'evidenceOnly': True, 'primaryCandidateVerdictUnchangedByCollector': True,
                    'captureCount': len(captures), 'captureErrors': capture_errors,
                    'captureTarget': {'seed': SEED, 'dpr': 3, 'rasterDpr': 2, 'current': 49, 'placed': 20, 'zoom': 4},
                    'newPaintObserversBeforeOriginalAudit': 'JS-only drawMap/drawLockedPieces/displayPaths wrappers',
                    'newObserverCanvasOperationsBeforeCandidateVerdict': False, 'newObserverNativeCanvasGettersBeforeCandidateVerdict': False,
                    'controlsAlterAcceptance': False, 'originalPaintHistoryAvailable': 'last-completed-static-and-cache-reference-plans',
                    'bounds': {'featuresPerPass': 512, 'passesPerPlan': 2, 'latestPlans': 2, 'errors': 16},
                    'limitation': 'Two explicitly pinned source/oracle lines change context policy from6f. All strict assertions, primary q/p and16jitter parameters remain; jitter canvases still use default policy, so any jitter explanation is cross-policy and requires separate interpretation. Additional JS observation/ref retention may affect timing/lifetime. Primary candidate verdict is not replaced by secondary results. Styles/matrices are derived from source arguments, not native state. Post-verdict exact-plan controls explicitly request the candidate policy; neither complete DOM-visible consumer nor native context history is reproduced. No warmup, UA condition, clone, threshold change or original-failure waiver is introduced.'}
                (output / 'report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
                print(json.dumps({'status': result['status'], 'captures': len(captures), 'captureErrors': capture_errors,
                    'sourceStable': result['sourceStable'], 'error': result.get('error', '')[:250]}, ensure_ascii=False), flush=True)
            finally:
                await browser.close()
    if result['status'] != 'passed' or not captures or capture_errors or any('controlError' in item for item in captures) or not result['sourceStable'] or not result['renderOracleStable']:
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
