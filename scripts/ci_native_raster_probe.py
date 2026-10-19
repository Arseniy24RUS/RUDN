"""Evidence-only exact-seed raster diagnostic; no product/test files are edited.

Runs the existing real-input DPR1 scenario with its original assertions.
Captures the actual native surface and the independent reference before any
assertion, plus bounded diagonal probes. A probe never alters acceptance.
"""
import argparse
import asyncio
import base64
import hashlib
import json
import platform
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import test_puzzle_catalog as catalog
import test_puzzle_render_browser as render
from playwright.async_api import async_playwright

CAPTURE_HOOK = r"""
  window.__nativeEvidenceHistory=[];
  window.__nativeEvidenceRecords=[];
  const nativeReplayOps=[],nativePhases=[];
  const nativeProbePhase=window.__nativeProbePhase||'both';
  let nativePendingPhase=null;
  const savePixels=context=>({width:context.canvas.width,height:context.canvas.height,
    pixels:context.getImageData(0,0,context.canvas.width,context.canvas.height).data,context:contextDetails(context)});
  const pixelsPng=entry=>{const canvas=document.createElement('canvas');canvas.width=entry.width;canvas.height=entry.height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(entry.pixels),entry.width,entry.height),0,0);
    const png=canvas.toDataURL('image/png');canvas.width=canvas.height=0;return png;};
  const replayNativeCommands=commands=>{const path=new Path2D();let ring=new Path2D();
    for(let i=0;i<commands.length;i+=3){
      if(commands[i]===0)ring.moveTo(commands[i+1],commands[i+2]);
      else if(commands[i]===1)ring.lineTo(commands[i+1],commands[i+2]);
      else if(commands[i]===2)ring.closePath();
      else {path.addPath(ring);ring=new Path2D();}
    }path.addPath(ring);return path;};
  const restoreNativeContext=(context,s)=>{const m=s.transform;context.setTransform(m[0],m[1],m[4],m[5],m[12],m[13]);
    context.globalAlpha=s.alpha;context.globalCompositeOperation=s.composite;context.fillStyle=s.fill;context.strokeStyle=s.stroke;
    context.lineWidth=s.width;context.lineJoin=s.join;context.lineCap=s.cap;context.miterLimit=s.miter;
    context.setLineDash(s.dash);context.lineDashOffset=s.dashOffset;context.shadowColor=s.shadow[0];
    context.shadowBlur=s.shadow[1];context.shadowOffsetX=s.shadow[2];context.shadowOffsetY=s.shadow[3];
    if(s.filter!=null)context.filter=s.filter;context.imageSmoothingEnabled=s.smoothing;};
  const captureHistory=(kind,fields={})=>{
    const history=window.__nativeEvidenceHistory;
    if(history.length>=256)history.shift();
    history.push({kind,at:performance.now(),size:[activeSprite.canvas.width,activeSprite.canvas.height],
      current:state.current,featureId:state.features[state.current]?.properties._puzzleId,
      viewScale:state.view?.k,...fields});
  };
  const observedResize=resizeActiveRaster;
  resizeActiveRaster=function(width,height){
    captureHistory('resize-before',{requested:[width,height]});
    nativeReplayOps.push({kind:'resize',width,height});
    const result=observedResize(width,height);captureHistory('resize-after');return result;
  };
  for(const name of ['fill','stroke','drawImage']){
    const original=CanvasRenderingContext2D.prototype[name];
    CanvasRenderingContext2D.prototype[name]=function(...args){
      let immediate=null;
      if(this.canvas===activeSprite.canvas){
        const paths=currentPiece()&&highResolutionPaths(currentPiece().index);
        captureHistory(name,{context:contextDetails(this),fillRule:name==='fill'?args[1]:null,
          originalFill:name==='fill'?args[0]===paths?.path:null,
          originalStroke:name==='stroke'?args[0]===paths?.strokePath:null,
          bitmap:name==='drawImage'?{type:args[0]?.constructor?.name,width:args[0]?.width,height:args[0]?.height,coordinates:args.slice(1)}:null});
        nativeReplayOps.push({kind:name,args:args.slice(),context:contextDetails(this)});
        if(nativeProbePhase!=='none'&&name==='stroke'&&!currentPiece()?.inTray&&state.features[state.current]?.properties._puzzleId==='151223'
            &&state.view.k>2&&state.view.k<3&&nativePhases.length<4){
          immediate={width:this.canvas.width,height:this.canvas.height,
            beforeStroke:['before','both'].includes(nativeProbePhase)?savePixels(this):null,afterStroke:null,afterConsumption:null};
        }
      }
      const result=original.apply(this,args);
      if(immediate){
        if(['after','both'].includes(nativeProbePhase))immediate.afterStroke=savePixels(this);
        nativePhases.push(immediate);if(nativeProbePhase==='both')nativePendingPhase=immediate;
      }
      return result;
    };
  }
  const nativeConsumer=ctx.drawImage;
  ctx.drawImage=function(source,...args){
    if(source===activeSprite.canvas){const consumer={kind:'consume',args:args.slice(),context:contextDetails(this),
      width:this.canvas.width,height:this.canvas.height};nativeReplayOps.push(consumer);
      captureHistory('consume',{consumer:{...consumer}});}
    const result=nativeConsumer.call(this,source,...args);
    if(source===activeSprite.canvas&&nativePendingPhase){
      nativePendingPhase.afterConsumption=savePixels(source.getContext('2d'));nativePendingPhase=null;
    }return result;};
  window.__captureNativeEvidence=({sprite,paths,canvas,actual,expected,difference,source})=>{
    const width=canvas.width,height=canvas.height;
    const commands=state.renderGeometry?.getFullCommands(currentPiece().index);
    const record={seed:state.seed,featureId:state.features[currentPiece().index].properties._puzzleId,
      zoom:state.view.k/state.baseViewK,scale:sprite.scale,dpr:sprite.dpr,source,width,height,
      context:contextDetails(sprite.canvas.getContext('2d')),referenceContext:contextDetails(canvas.getContext('2d')),
      difference,history:window.__nativeEvidenceHistory.slice(),
      commands:commands?{fill:Array.from(commands.fill),stroke:Array.from(commands.stroke)}:null,
      actualPng:sprite.canvas.toDataURL('image/png'),referencePng:canvas.toDataURL('image/png'),diagonalProbes:[],
      phaseMode:nativeProbePhase,
      readbackIntervention:'Diagnostic stroke readbacks can change native batching; none/before/after modes isolate them. Baseline v1 retained separately.',
      consumerReferenceLimit:'Replicates target size, transform and paint state/arguments on an initially transparent destination, not prior background contents.',
      phaseImages:[],renderProbes:[]};
    const roundoff=rasterRoundoffTracker(actual,expected);
    const pointSamples=pixels=>[{x:18,y:102},{x:21,y:184}].filter(p=>p.x<width&&p.y<height).map(p=>({...p,rgba:Array.from(pixels.slice((p.y*width+p.x)*4,(p.y*width+p.x)*4+4))}));
    record.actualSamples=pointSamples(actual);record.referenceSamples=pointSamples(expected);
    for(const phase of nativePhases){
      if(phase.width!==width||phase.height!==height)continue;
      for(const name of ['beforeStroke','afterStroke','afterConsumption']){
        const entry=phase[name];if(!entry)continue;
        record.phaseImages.push({phase:name,png:pixelsPng(entry),context:entry.context,samples:pointSamples(entry.pixels),
          versusAudit:rasterPixelDifference(entry.pixels,actual,width),
          versusImmediate:phase.afterStroke?rasterPixelDifference(entry.pixels,phase.afterStroke.pixels,width):null});
      }
    }
    const materializeConsumer=(surface,op)=>{const destination=document.createElement('canvas');
      destination.width=op.width;destination.height=op.height;const consumer=destination.getContext('2d');
      restoreNativeContext(consumer,op.context);consumer.drawImage(surface,...op.args);
      consumer.getImageData(0,0,op.width,op.height);destination.width=destination.height=0;};
    const lastConsumer=nativeReplayOps.filter(op=>op.kind==='consume').at(-1);
    for(const kind of (sprite.scale>2&&sprite.scale<3&&record.featureId==='151223'
      ?['fresh-final-original','fresh-final-composited','fresh-final-clone','fresh-final-command-replay','fresh-exact-history']:[])){
      const surface=document.createElement('canvas');surface.width=width;surface.height=height;
      const context=surface.getContext('2d',source==='worker'?{alpha:true,willReadFrequently:true}:{alpha:true});
      try{
        if(kind==='fresh-exact-history'){
          for(const op of nativeReplayOps){
            if(op.kind==='resize'){surface.height=0;surface.width=op.width;surface.height=op.height;}
            else if(op.kind==='consume'){materializeConsumer(surface,op);}
            else {restoreNativeContext(context,op.context);context[op.kind](...op.args);}
          }
        }else{
          restoreNativeContext(context,record.context);
          const fill=kind==='fresh-final-clone'?new Path2D(paths.path):kind==='fresh-final-command-replay'?replayNativeCommands(commands.fill):paths.path;
          const stroke=kind==='fresh-final-clone'?new Path2D(paths.strokePath):kind==='fresh-final-command-replay'?replayNativeCommands(commands.stroke):paths.strokePath;
          context.fill(fill,state.mode==='russia-subjects'?'nonzero':'evenodd');context.stroke(stroke);
          if(kind==='fresh-final-composited')materializeConsumer(surface,lastConsumer);
        }
        const pixels=context.getImageData(0,0,width,height).data;
        record.renderProbes.push({kind,png:surface.toDataURL('image/png'),samples:pointSamples(pixels),context:contextDetails(context),
          versusActual:rasterPixelDifference(actual,pixels,width),versusReference:rasterPixelDifference(expected,pixels,width)});
      }catch(error){record.renderProbes.push({kind,error:String(error)});}
      surface.width=surface.height=0;
    }
    for(const radius of [1e-7,1e-6,1e-5,1e-4])for(const sx of [-1,1])for(const sy of [-1,1]){
      const offset=radius/Math.SQRT2,dx=sx*offset,dy=sy*offset;
      const probe=document.createElement('canvas');probe.width=width;probe.height=height;
      const context=probe.getContext('2d',source==='worker'?{alpha:true,willReadFrequently:true}:{alpha:true});
      context.setTransform(sprite.dpr*sprite.scale,0,0,sprite.dpr*sprite.scale,-sprite.left*sprite.dpr+dx,-sprite.top*sprite.dpr+dy);
      context.fillStyle='#dc3f45';context.strokeStyle='#8e2028';context.lineWidth=1.2/sprite.scale;
      context.lineJoin=context.lineCap='round';
      context.fill(paths.path,state.mode==='russia-subjects'?'nonzero':'evenodd');context.stroke(paths.strokePath);
      const pixels=context.getImageData(0,0,width,height).data;
      const explained=roundoff.addCandidate(pixels,dx,dy);
      record.diagonalProbes.push({radius,dx,dy,actualRadius:Math.hypot(dx,dy),
        difference:rasterPixelDifference(actual,pixels,width),samples:pointSamples(pixels),
        explainedPixels:explained.map(i=>({x:i/4%width,y:Math.floor(i/4/width)}))});
      probe.width=probe.height=0;
    }
    record.diagonalSummary=roundoff.summary();
    record.sourceAfterCapture=rasterPixelDifference(sprite.canvas.getContext('2d').getImageData(0,0,width,height).data,actual,width);
    window.__nativeEvidenceRecords.push(record);
  };
"""

async def main(args):
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    marker='    const difference=rasterPixelDifference(actual,expected,canvas.width);'
    assert render.RENDER_HOOK.count(marker)==1
    capture='\n    window.__captureNativeEvidence({sprite,paths,canvas,actual,expected,difference,source});'
    catalog.READ_ONLY_HOOK += render.RENDER_HOOK.replace(marker,marker+capture,1)+CAPTURE_HOOK
    records=[]
    with catalog.PuzzleServer(Path(args.fixtures) if args.fixtures else output) as server:
        async with async_playwright() as playwright:
            browser=await playwright.webkit.launch(**({'executable_path':args.executable} if args.executable else {}))
            new_context=browser.new_context
            async def context_with_seed(*cargs,**kwargs):
                context=await new_context(*cargs,**kwargs)
                await context.add_init_script('Math.random=()=>'+repr((args.seed+0.25)/0xffffffff)+';')
                await context.add_init_script('window.__nativeProbePhase='+json.dumps(args.phase)+';')
                original_close=context.close
                async def save_before_close(*close_args,**close_kwargs):
                    for page in context.pages:
                        if page.is_closed():continue
                        try:
                            values=await page.evaluate('window.__nativeEvidenceRecords||[]')
                            for index,item in enumerate(values):
                                for name in ['actual','reference']:
                                    data=item.pop(name+'Png')
                                    path=output/f'capture-{index}-{name}.png'
                                    path.write_bytes(base64.b64decode(data.split(',',1)[1]))
                                    item[name+'Png']={'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
                                for group in ['phaseImages','renderProbes']:
                                    for probe in item.get(group,[]):
                                        if 'png' not in probe:continue
                                        data=probe.pop('png');label=probe.get('phase',probe.get('kind'))
                                        path=output/f'capture-{index}-{label}.png'
                                        path.write_bytes(base64.b64decode(data.split(',',1)[1]))
                                        probe['png']={'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
                                commands=item.pop('commands')
                                path=output/f'capture-{index}-commands.json'
                                path.write_text(json.dumps(commands,separators=(',',':')),encoding='utf-8')
                                item['commands']={'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
                                records.append(item)
                            await page.screenshot(path=str(output/'last-page.png'),full_page=False)
                        except Exception as error:
                            records.append({'captureFailure':repr(error)})
                    (output/'captures.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
                    await original_close(*close_args,**close_kwargs)
                context.close=save_before_close
                return context
            browser.new_context=context_with_seed
            try:
                result=await render.run_dpr_case(browser,'webkit',1,server,output)
                result['environment']={'system':platform.platform(),'browserVersion':browser.version,'port':server.httpd.server_port,'executable':args.executable,
                    'base':server.base,'seed':args.seed,'physicalDevice':False,
                    'browserPath':'Playwright WebKit; Browser skill is absent; exact engine required for CI diagnosis'}
                result['sourceHashes']={name:hashlib.sha256((ROOT/'site/assets/js'/name).read_bytes()).hexdigest()
                    for name in ['puzzle-engine.js','puzzle-render-geometry.js','puzzle-raster-worker.js']}
                result['evidenceOnly']=True
                result['phaseMode']=args.phase
                (output/'report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
                print(json.dumps({'status':result['status'],'captures':len(records),'error':result.get('error','')[:300]},ensure_ascii=False),flush=True)
            finally:await browser.close()
    if result['status']!='passed':raise SystemExit(1)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True)
    parser.add_argument('--seed',type=int,default=1655163107)
    parser.add_argument('--executable')
    parser.add_argument('--fixtures')
    parser.add_argument('--phase',choices=['none','before','after','both'],default='both')
    asyncio.run(main(parser.parse_args()))
