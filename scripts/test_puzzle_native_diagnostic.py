"""CI-only native-canvas diagnostics on deterministic, isolated puzzle attempts.

Records rather than accepts pixel differences. Every piece still moves through
the normal game handlers; the fixed fixture random source only sets attempt seed.
"""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path

import test_puzzle_catalog as qa
import test_puzzle_render_browser as render
from playwright.async_api import async_playwright

TRACE_HOOK=r"""
  window.__nativePhases=[];
  const pendingPhase=new WeakMap();
  const traceHash=[];
  const replayNative=commands=>{
    const path=new Path2D();let ring=new Path2D();
    for(let i=0;i<commands.length;i+=3){
      if(commands[i]===0)ring.moveTo(commands[i+1],commands[i+2]);
      else if(commands[i]===1)ring.lineTo(commands[i+1],commands[i+2]);
      else if(commands[i]===2)ring.closePath();
      else {path.addPath(ring);ring=new Path2D();}
    }
    path.addPath(ring);return path;
  };
  const rawTraceStroke=CanvasRenderingContext2D.prototype.stroke;
  CanvasRenderingContext2D.prototype.stroke=function(...args){
    const result=rawTraceStroke.apply(this,args);
    const piece=currentPiece();
    if(this.canvas!==activeSprite.canvas||!piece||piece.inTray||state.features[piece.index]?.properties._puzzleId!=='115100'
      ||state.view.k<2||state.view.k>3||window.__nativePhases.length>=8)return result;
    const source=this.canvas,width=source.width,height=source.height,matrix=this.getTransform();
    const immediate=this.getImageData(0,0,width,height).data;
    const paths=highResolutionPaths(piece.index),commands=state.renderGeometry.getFullCommands(piece.index);
    const record={seed:state.seed,order:[...state.order],placed:state.placed,
      scale:state.view.k,sourceContext:contextDetails(this),sameStroke:args[0]===paths.strokePath,
      immediatePixel:Array.from(immediate.slice((33*width+117)*4,(33*width+117)*4+4)),references:[]};
    const joined=new Float64Array(commands.fill.length+commands.stroke.length);
    joined.set(commands.fill);joined.set(commands.stroke,commands.fill.length);
    traceHash.push(crypto.subtle.digest('SHA-256',joined.buffer).then(value=>{
      record.commandHash=Array.from(new Uint8Array(value),n=>n.toString(16).padStart(2,'0')).join('');
      record.commandLengths=[commands.fill.length,commands.stroke.length];
    }));
    const variants=['original','clone','replayed'];
    for(const epsilon of [1e-7,1e-6,1e-5,1e-4])for(const axis of ['x','y'])for(const sign of [-1,1])variants.push(`jitter:${axis}:${epsilon*sign}`);
    for(const kind of variants){
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d'),jitter=kind.startsWith('jitter:')?kind.split(':'):null;
      context.setTransform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e+(jitter?.[1]==='x'?Number(jitter[2]):0),matrix.f+(jitter?.[1]==='y'?Number(jitter[2]):0));
      context.fillStyle=this.fillStyle;context.strokeStyle=this.strokeStyle;context.lineWidth=this.lineWidth;
      context.lineJoin=this.lineJoin;context.lineCap=this.lineCap;
      const fill=kind==='replayed'?replayNative(commands.fill):kind==='clone'?new Path2D(paths.path):paths.path;
      const stroke=kind==='replayed'?replayNative(commands.stroke):kind==='clone'?new Path2D(paths.strokePath):paths.strokePath;
      context.fill(fill,'nonzero');rawTraceStroke.call(context,stroke);
      const reference=context.getImageData(0,0,width,height).data;
      record.references.push({kind,versusImmediate:rasterPixelDifference(immediate,reference,width),pixel:Array.from(reference.slice((33*width+117)*4,(33*width+117)*4+4))});
    }
    window.__nativePhases.push(record);pendingPhase.set(source,{record,immediate,width,height});
    return result;
  };
  const traceDrawImage=ctx.drawImage;
  ctx.drawImage=function(source,...args){
    const result=traceDrawImage.call(this,source,...args),entry=pendingPhase.get(source);
    if(entry){
      entry.record.consumer={args,context:contextDetails(this),canvas:[els.canvas.width,els.canvas.height]};
      const consumed=source.getContext('2d').getImageData(0,0,entry.width,entry.height).data;
      entry.record.afterConsumption=rasterPixelDifference(consumed,entry.immediate,entry.width);
      pendingPhase.delete(source);
    }
    return result;
  };
  const basePhaseAudit=window.__spriteAudit;
  window.__spriteAudit=async()=>{const result=await basePhaseAudit();await Promise.all(traceHash);return {...result,nativePhases:window.__nativePhases};};
"""

async def run_seed(args, seed):
    output=Path(args.output)/('native-phases-'+str(seed));output.mkdir(parents=True,exist_ok=True)
    with qa.PuzzleServer(Path(args.fixtures)) as server:
        async with async_playwright() as p:
            browser=await p.webkit.launch()
            create_context=browser.new_context
            async def deterministic_context(*args,**kwargs):
                context=await create_context(*args,**kwargs)
                await context.add_init_script('Math.random=()=>'+repr((seed+0.25)/0xffffffff)+';')
                return context
            browser.new_context=deterministic_context
            try:
                record=await render.run_dpr_case(browser,'webkit',3,server,output)
                record['fixtureSeed']=seed
                record['sourceHashes']={name:hashlib.sha256((qa.ROOT/'site/assets/js'/name).read_bytes()).hexdigest()
                    for name in ['puzzle-engine.js','puzzle-render-geometry.js','puzzle-raster-worker.js']}
                (output/'native-phases.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
                print(json.dumps({'seed':seed,'status':record['status'],'error':record.get('error')},ensure_ascii=False),flush=True)
                return record
            finally:await browser.close()


async def main(args):
    qa.READ_ONLY_HOOK+=render.RENDER_HOOK+TRACE_HOOK
    records=[]
    for seed in args.seeds:
        records.append(await run_seed(args,seed))
    if any(record['status']!='passed' for record in records):
        raise SystemExit(1)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--fixtures',required=True)
    parser.add_argument('--output',required=True)
    parser.add_argument('--seeds',nargs='+',type=int,default=[123456789,987654321])
    asyncio.run(main(parser.parse_args()))
