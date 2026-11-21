import {readActorWebM} from './actor-webm.js';
import {createActorRenderer} from './actor-renderer.js';

// This path presents the same VP9 colour and transparency packets as the video
// element, without depending on autoplay or the browser's alpha-video compositor.
export function createDecodedMotion(root, view, source, {onFrame, onFailure}) {
  const doc = root.ownerDocument;
  const request = new AbortController();
  let stage = null, visible = false, destroyed = false, announced = false, started = false;
  let clip, canvas, renderer, decoders = [], software, softwarePending = false, switching = false;
  let cursor = 0, queued = 0, generation = 0, raf = 0, origin = null, progressAt = 0;
  const ready = new Map();
  const alphaBuffers = [];
  const now = () => view.performance.now();
  const active = () => stage && visible && !destroyed;
  function resetPipeline() {
    generation++;
    for (const decoder of decoders) if(decoder.state!=='closed') decoder.close();
    decoders = [];
    software?.destroy();
    software = null;
    for (const item of ready.values()) release(item);
    ready.clear();
    renderer?.dispose();
    renderer=null;
    canvas?.remove();
    canvas=null;
    cursor=queued=0;
    origin=null;
    softwarePending=announced=false;
  }
  function stopFrame() {
    if(raf) view.cancelAnimationFrame(raf);
    raf=0;
  }
  function destroy() {
    if(destroyed) return;
    destroyed=true;
    request.abort();
    stopFrame();
    resetPipeline();
  }
  function failed() {
    if(destroyed) return;
    destroy();
    queueMicrotask(onFailure);
  }
  function release(item) {
    if(item.close) item.close();
    else { item.color?.close(); item.alpha?.close(); }
  }
  function newRenderer(planar) {
    canvas=doc.createElement('canvas');
    canvas.className='rxa-citizen-video';
    canvas.setAttribute('data-rxa-motion-decoded',planar?'software':'webcodecs');
    canvas.setAttribute('aria-hidden','true');
    renderer=createActorRenderer(canvas,clip.width,clip.height,planar);
  }
  async function trySoftware() {
    if(destroyed || switching) return;
    switching=true;
    stopFrame();
    resetPipeline();
    try {
      const {createSoftwareFrameDecoder}=await import('./software-motion.js');
      if(destroyed) return;
      const decoded=await createSoftwareFrameDecoder(view,source,failed);
      if(destroyed) { decoded.destroy(); return; }
      software=decoded;
      newRenderer(true);
      switching=false;
      progressAt=now();
      schedule();
    } catch { failed(); }
  }
  function enqueue() {
    const samples=clip.samples;
    if(software) {
      if(softwarePending || queued>=samples.length || queued-cursor>=3) return;
      const i=queued++, version=generation;
      softwarePending=true;
      software.decodePair(samples[i]).then(pair=>{
        if(destroyed || version!==generation) { pair.close(); return; }
        ready.set(samples[i].timestamp,pair);
        softwarePending=false;
        if(active()) enqueue();
      },()=>{ if(!destroyed && version===generation) failed(); });
      return;
    }
    while(queued<samples.length && queued-cursor<6) {
      const sample=samples[queued++];
      const chunk={type:sample.key?'key':'delta',timestamp:sample.timestamp,duration:Math.round(clip.interval*1000)};
      for(const [i,bytes] of [sample.color,sample.alpha].entries())
        decoders[i].decode(new view.EncodedVideoChunk({...chunk,data:bytes}));
    }
    // Flush the tail once, without imposing flush/keyframe boundaries during playback.
    if(queued===samples.length && !ready.has('end')) {
      ready.set('end',{});
      const version=generation;
      Promise.all(decoders.map(d=>d.flush())).catch(()=>{if(generation===version) void trySoftware();});
    }
  }
  function tick(at) {
    raf=0;
    if(!active() || !renderer || switching) return;
    try {
      enqueue();
      const samples=clip.samples;
      let show;
      while(cursor<queued) {
        const timestamp=samples[cursor].timestamp;
        const frame=ready.get(timestamp);
        if(!frame?.color || !frame.alpha) break;
        if(origin===null) origin=at-timestamp/1000;
        if(timestamp/1000>at-origin+1) break;
        if(show) release(show);
        show=frame;
        ready.delete(timestamp);
        cursor++;
      }
      if(show) {
        try { renderer.draw(show); } finally { release(show); }
        if(canvas.parentNode!==stage) stage.append(canvas);
        if(!announced) {announced=true; onFrame();}
        progressAt=at;
      }
      if(cursor===samples.length) {
        ready.delete('end');
        cursor=queued=0;
        origin=Math.max(origin+samples.at(-1).timestamp/1000+clip.interval,at);
      }
      if(at-progressAt>3500) throw Error('Decoder stopped presenting actor frames');
      schedule();
    } catch { if(software) failed(); else void trySoftware(); }
  }
  function schedule() {
    if(!raf && active() && renderer && !switching) raf=view.requestAnimationFrame(tick);
  }
  // The alpha bitstream carries a full-range opacity mask in its luma plane.
  // Sending it through an RGB video conversion would clip semitransparent edges.
  async function readOpacity(frame) {
    const rect={x:0,y:0,width:clip.width,height:clip.height};
    const options={rect};
    if(!['I420','I420A','I422','I444','NV12'].includes(frame.format))
      throw Error('No raw eight-bit opacity plane');
    const length=frame.allocationSize(options);
    const reusable=alphaBuffers.pop();
    const buffer=reusable?.length===length?reusable:new Uint8Array(length);
    const [plane]=await frame.copyTo(buffer,options);
    return {stride:plane.stride,bytes:buffer.subarray(plane.offset,plane.offset+plane.stride*clip.height),
      close(){if(!destroyed && alphaBuffers.length<6) alphaBuffers.push(buffer);}};
  }
  function storePlane(version, timestamp, name, data) {
    if(version!==generation || destroyed) {data.close(); return;}
    const item=ready.get(timestamp)||{};
    item[name]=data;
    ready.set(timestamp,item);
  }
  async function load() {
    const timeout=view.setTimeout(()=>request.abort(),20000);
    try {
      const response=await view.fetch(source,{signal:request.signal});
      if(!response.ok) throw Error('Missing actor video');
      clip=readActorWebM(await response.arrayBuffer());
    } catch { if(!destroyed) failed(); return; }
    finally { view.clearTimeout(timeout); }
    if(destroyed) return;
    try {
      const config={codec:'vp09.00.10.08',codedWidth:clip.width,codedHeight:clip.height,optimizeForLatency:true};
      if(!view.VideoDecoder || !(await view.VideoDecoder.isConfigSupported(config)).supported) throw Error('No VP9 decoder');
      if(destroyed) return;
      const version=generation;
      for(const plane of ['color','alpha']) {
        const decoder=new view.VideoDecoder({output:frame=>{
          if(version!==generation || destroyed) {frame.close();return;}
          const timestamp=frame.timestamp;
          if(plane==='color') {storePlane(version,timestamp,plane,frame); return;}
          readOpacity(frame).then(mask=>storePlane(version,timestamp,plane,mask),
            ()=>{if(version===generation) void trySoftware();}).finally(()=>frame.close());
        },error:()=>{if(version===generation) void trySoftware();}});
        decoders.push(decoder);
        decoder.configure(config);
      }
      newRenderer(false);
      progressAt=now();
      schedule();
    } catch { void trySoftware(); }
  }
  function refresh(next,inView) {
    if(destroyed) return;
    const changed=stage!==next || visible!==Boolean(inView);
    stage=next;
    visible=Boolean(inView);
    if(!active()) {
      stopFrame();
      announced=false;
      origin=null;
      if(!stage) canvas?.remove();
      return;
    }
    if(changed) { announced=false; progressAt=now(); origin=null; }
    if(!started) {started=true; void load();}
    else schedule();
  }
  return {refresh,destroy};
}
