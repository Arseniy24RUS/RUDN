import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {characterMedia,createMessengerMedia,RECEPTION_ACTORS} from '../site/apps/reception/ai/media.js';
import {caseIllustrations,illustratedDocumentText,renderIllustrationThumbnails} from '../site/apps/reception/ai/illustrations.js';
import {visualCast} from '../site/apps/reception/js/characters.js';
import {GFX_EVIDENCE,GFX_PASSPORTS} from '../site/apps/reception/js/graphics-data.js';

test('all eight actors reuse the existing conflict-free cast, posters, avatars and WebM files',async()=>{
  assert.deepEqual(RECEPTION_ACTORS,visualCast(Object.keys(RECEPTION_ACTORS),'reception-ai-pilot-v1').actors);
  assert.equal(new Set(Object.values(RECEPTION_ACTORS)).size,8);
  for(const [caseId,actorId] of Object.entries(RECEPTION_ACTORS)){
    assert.ok(GFX_PASSPORTS[caseId].candidates.includes(actorId));
    const media=characterMedia(caseId,'https://untrusted.invalid/a.webm');assert.equal(media.actorId,actorId);
    const motion=await readFile(fileURLToPath(media.motion));assert.equal(motion.subarray(0,4).toString('hex'),'1a45dfa3');
    for(const kind of ['poster','avatar'])assert.ok((await readFile(fileURLToPath(media[kind]))).length>1000);
  }
});

test('external media, directory traversal and prototype names never become an asset URL',()=>{
  for(const unsafe of ['https://untrusted.invalid/x','javascript:alert(1)','assets/../../secret','assets/gfx1/avatars/C99.webp','__proto__','constructor']){
    const media=characterMedia('__proto__',unsafe);assert.equal(media.actorId,'C03');
    for(const key of ['motion','motionFallback','poster','avatar'])assert.ok(media[key].includes('/apps/reception/assets/gfx1/'));
  }
  assert.equal(characterMedia('new-case','assets/gfx1/avatars/C14.webp').actorId,'C14');
  assert.equal(characterMedia('new-case','assets/gfx1/characters/C08/C08__C-N__w512.webp').actorId,'C08');
  assert.equal(characterMedia('new-case','assets/maria.webp').actorId,'C01');
  assert.equal(characterMedia('budget','assets/gfx1/avatars/C14.webp').actorId,'C14','explicit full-bank metadata overrides pilot fallback');
});

test('all authored visual passports support their existing citizen or staff animation assets',async()=>{
  const checked=new Set();
  assert.equal(Object.keys(GFX_PASSPORTS).length,178);
  for(const [caseId,passport]of Object.entries(GFX_PASSPORTS)){
    for(const actor of passport.candidates){
      const media=characterMedia(caseId,`assets/gfx1/avatars/${actor}.webp`);assert.equal(media.actorId,actor);
      if(checked.has(actor))continue;checked.add(actor);
      for(const kind of ['poster','avatar','motion','motionFallback'])assert.ok((await readFile(fileURLToPath(media[kind]))).length>1000);
      const fallback=await readFile(fileURLToPath(media.motionFallback));
      assert.equal(fallback.subarray(0,4).toString(),'RIFF');assert.equal(fallback.subarray(8,12).toString(),'WEBP');
      assert.ok(fallback.includes(Buffer.from('ANIM'))&&fallback.includes(Buffer.from('ANMF')),'WebP contains an animation, not a single frame');
    }
  }
  assert.ok(checked.has('S03')&&checked.has('S04'));
});

test('every approved case illustration resolves from its document to existing thumbnail and full-size files',async()=>{
  const approved=GFX_EVIDENCE.filter(entry=>entry.approved);
  const caseIds=new Set(approved.map(entry=>entry.caseId));
  for(const caseId of caseIds){
    const file=new URL(`../site/apps/reception/content/cases/${caseId}.json`,import.meta.url);
    const {template}=JSON.parse(await readFile(file,'utf8'));
    const illustrations=caseIllustrations(caseId,template.documents);
    const expected=approved.filter(entry=>entry.caseId===caseId).map(entry=>entry.id).sort();
    assert.deepEqual(illustrations.map(entry=>entry.id).sort(),expected,caseId);
    for(const entry of illustrations){
      for(const [src,width] of [[entry.thumbnail,420],[entry.full,832]]){
        assert.ok(src.endsWith(`${entry.id}__w${width}.webp`));
        const image=await readFile(fileURLToPath(src));
        assert.equal(image.subarray(8,12).toString(),'WEBP');
      }
    }
  }
});

test('chat gallery needs a matching image and does not duplicate legacy art or show document content',()=>{
  const documents=[
    {id:'photo',title:{en:'Photo <b>title</b>'},text:'Document body',image:'assets/hatch.webp'},
    {id:'unillustrated',title:'Appeal text',text:'A separate document'},
  ];
  const illustrations=caseIllustrations('hatch',documents);
  assert.deepEqual(illustrations.map(entry=>entry.id),['E01__1']);
  assert.equal(caseIllustrations('different-case',documents)[0].id,'document-photo');
  assert.deepEqual(caseIllustrations('hatch',[documents[1]]),[]);
  assert.equal(renderIllustrationThumbnails([], {locale:'ru'}),'');
  assert.deepEqual(caseIllustrations('unmapped',['https://invalid.example/photo.webp','assets/../hatch.webp','assets//hatch.webp'].map(image=>({id:'test',image}))),[]);
  const markup=renderIllustrationThumbnails(illustrations,{locale:'en'});
  assert.match(markup,/aria-haspopup="dialog"/);
  assert.match(markup,/Enlarge image · An open circular manhole/);
  assert.doesNotMatch(markup,/Document body|Appeal text|w832/);
  assert.match(renderIllustrationThumbnails(caseIllustrations('different-case',documents),{locale:'en'}),/Enlarge image · Photo &lt;b&gt;title&lt;\/b&gt;/);
});

test('illustrated document text retains evidentiary details and date variants',()=>{
  const text='Учебная фотография от 31.05.2026: у выпуска трубы видна вода тёмного цвета. Владелец выпуска в материалах не указан; результатов отбора проб нет.';
  const document={id:'observation',text};
  assert.equal(illustratedDocumentText('river-observation',document,'ru'),'Дата снимка 31.05.2026. Владелец выпуска в материалах не указан; результатов отбора проб нет.');
  assert.equal(illustratedDocumentText('river-old-photo',document,'ru'),text);
  assert.equal(illustratedDocumentText('river-observation',{id:'observation',text:'A previously unseen document.'},'en'),'A previously unseen document.');
});

function fixture({reduced=false,supported=true,alpha=0,observer=true,autoplay=true,offscreen=false,hidden=false,frameCallbacks=false}={}){
  let clock=0,nextTimer=0,nextFrame=0;const timers=new Map(),frames=new Map();
  function tick(ms){const end=clock+ms;for(let count=0;count<1000;count++){const entry=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>end)break;clock=entry[1].at;timers.delete(entry[0]);entry[1].fn();}clock=end;}
  class Element extends EventTarget{
    constructor(){super();this.attributes=new Map();this.children=[];this.dataset={};}
    setAttribute(key,value){this.attributes.set(key,String(value));}
    removeAttribute(key){this.attributes.delete(key);}
    hasAttribute(key){return this.attributes.has(key);}
    getAttribute(key){return this.attributes.get(key)??null;}
    append(child){child.remove();this.children.push(child);child.parent=child.parentNode=this;}
    remove(){if(this.parent){this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=this.parentNode=null;}}
    getBoundingClientRect(){return {width:110,height:132,top:offscreen?1000:50,bottom:offscreen?1132:182};}
  }
  class Video extends Element{
    constructor(){super();this.paused=true;this.currentTime=0;this.videoWidth=512;this.playCalls=0;this.pauseCalls=0;this.loadCalls=0;this.srcWrites=0;}
    canPlayType(){return supported?'probably':'';}
    set src(value){this.srcWrites++;this.setAttribute('src',value);}
    get src(){return this.getAttribute('src');}
    play(){this.playCalls++;if(!autoplay)return Promise.reject(Object.assign(new Error('Autoplay blocked'),{name:'NotAllowedError'}));this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;this.pauseCalls++;}
    load(){this.loadCalls++;this.currentTime=0;}
  }
  class Image extends Element{
    constructor(){super();this.srcWrites=0;this.naturalWidth=360;}
    set src(value){this.srcWrites++;this.setAttribute('src',value);}
    get src(){return this.getAttribute('src');}
  }
  const document=new EventTarget(),reduce=new EventTarget();reduce.matches=reduced;
  document.hidden=hidden;let video,image,io;
  document.createElement=kind=>kind==='video'?(video=new Video()):kind==='img'?(image=new Image()):{getContext:()=>({drawImage(){},getImageData:()=>({data:[0,0,0,alpha]})})};
  document.defaultView={innerHeight:900,matchMedia:()=>reduce,performance:{now:()=>clock},setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout:id=>timers.delete(id),...(observer?{IntersectionObserver:class{
    constructor(callback){this.callback=callback;this.disconnected=false;io=this;}
    observe(target){this.target=target;}unobserve(){}disconnect(){this.disconnected=true;}
    visible(value){this.callback([{target:this.target,isIntersecting:value}]);}
  }}:{})};
  if(frameCallbacks){Video.prototype.requestVideoFrameCallback=callback=>{const id=++nextFrame;frames.set(id,callback);return id;};Video.prototype.cancelVideoFrameCallback=id=>frames.delete(id);}
  const stage=id=>{const node=new Element();node.dataset.rxaActor=id;return node;};
  const root={ownerDocument:document,stage:stage('C05'),querySelector(){return this.stage;}};
  return {root,document,reduce,stage,tick,timers,frames,get video(){return video;},get image(){return image;},get observer(){return io;}};
}

test('rerender retains the video and playhead; hiding, leaving view and destroying pause it',()=>{
  const f=fixture(),media=createMessengerMedia(f.root);media.refresh();const video=f.video;
  assert.ok(video.muted&&video.loop&&video.playsInline&&video.autoplay);assert.equal(video.preload,'none');
  assert.ok(video.src.endsWith('/C05.webm'));video.currentTime=1.75;
  video.dispatchEvent(new Event('playing'));assert.equal(f.root.stage.hasAttribute('data-rxa-motion-ready'),true);
  const firstSourceWrites=video.srcWrites;f.root.stage=f.stage('C05');media.refresh();
  assert.equal(f.root.stage.children[0],video);assert.equal(video.currentTime,1.75);assert.equal(video.srcWrites,firstSourceWrites);
  assert.equal(f.root.stage.hasAttribute('data-rxa-motion-ready'),true);
  f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(video.paused,true);
  f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(video.paused,false);
  f.observer.visible(false);assert.equal(video.paused,true);f.observer.visible(true);assert.equal(video.paused,false);
  media.destroy();assert.equal(video.paused,true);assert.equal(video.hasAttribute('src'),false);assert.equal(video.parent,null);assert.equal(f.observer.disconnected,true);
});

test('reduced motion never fetches a loop; changing actor uses the new existing resource',()=>{
  const f=fixture({reduced:true}),media=createMessengerMedia(f.root);media.refresh();assert.equal(f.video.hasAttribute('src'),false);
  f.reduce.matches=false;f.reduce.dispatchEvent(new Event('change'));assert.ok(f.video.src.endsWith('/C05.webm'));
  f.video.currentTime=1.25;f.root.stage=f.stage('C14');media.refresh();assert.ok(f.video.src.endsWith('/C14.webm'));assert.equal(f.video.currentTime,0);
  f.reduce.matches=true;f.reduce.dispatchEvent(new Event('change'));assert.equal(f.video.hasAttribute('src'),false);assert.equal(f.video.parent,null);
  media.destroy();
});

test('unsupported alpha and playback errors select the animated fallback; unsafe IDs never load either format',()=>{
  const opaque=fixture({alpha:255}),media=createMessengerMedia(opaque.root);media.refresh();opaque.video.dispatchEvent(new Event('playing'));
  assert.equal(opaque.root.stage.hasAttribute('data-rxa-motion-ready'),false);assert.equal(opaque.video.hasAttribute('src'),false);assert.equal(opaque.video.parent,null);
  assert.ok(opaque.image.src.endsWith('/C05.webp'));opaque.image.dispatchEvent(new Event('load'));assert.equal(opaque.root.stage.hasAttribute('data-rxa-motion-ready'),true);media.destroy();
  const failed=fixture(),other=createMessengerMedia(failed.root);other.refresh();failed.video.dispatchEvent(new Event('error'));other.refresh();assert.equal(failed.video.hasAttribute('src'),false);assert.ok(failed.image.src.endsWith('/C05.webp'));other.destroy();
  const unsafe=fixture();unsafe.root.stage=unsafe.stage('../../secret');const guard=createMessengerMedia(unsafe.root);guard.refresh();assert.equal(unsafe.video.hasAttribute('src'),false);assert.equal(unsafe.image.hasAttribute('src'),false);guard.destroy();
});

test('fallback image is retained on rerender and loads only in the visible reception',()=>{
  const f=fixture({supported:false,offscreen:true}),media=createMessengerMedia(f.root);media.refresh();
  assert.equal(f.video.hasAttribute('src'),false);assert.equal(f.image.hasAttribute('src'),false);
  f.observer.visible(true);assert.ok(f.image.src.endsWith('/C05.webp'));
  f.image.dispatchEvent(new Event('load'));assert.equal(f.root.stage.hasAttribute('data-rxa-motion-ready'),true);
  const image=f.image,writes=image.srcWrites;
  // A regular rerender keeps the same source and decoded animation node.
  f.root.stage=f.stage('C05');f.root.stage.getBoundingClientRect=()=>({width:110,height:132,top:50,bottom:182});media.refresh();
  assert.equal(f.root.stage.children[0],image);assert.equal(image.srcWrites,writes);
  assert.equal(f.root.stage.hasAttribute('data-rxa-motion-ready'),true);
  f.observer.visible(false);assert.equal(image.hasAttribute('src'),false);assert.equal(image.parent,null);
  f.observer.visible(true);assert.equal(image.srcWrites,writes+1);
  f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(image.hasAttribute('src'),false);
  f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));assert.ok(image.hasAttribute('src'));
  f.root.stage=null;media.refresh();assert.equal(image.hasAttribute('src'),false);assert.equal(image.parent,null);
  media.destroy();assert.equal(f.observer.disconnected,true);
});

test('blocked autoplay uses the WebP fallback and reduced motion releases it',async()=>{
  const f=fixture({autoplay:false}),media=createMessengerMedia(f.root);media.refresh();await Promise.resolve();
  assert.equal(f.video.hasAttribute('src'),false);assert.ok(f.image.src.endsWith('/C05.webp'));
  f.reduce.matches=true;f.reduce.dispatchEvent(new Event('change'));assert.equal(f.image.hasAttribute('src'),false);assert.equal(f.image.parent,null);
  f.reduce.matches=false;f.reduce.dispatchEvent(new Event('change'));assert.ok(f.image.hasAttribute('src'));
  f.image.dispatchEvent(new Event('error'));media.refresh();assert.equal(f.image.hasAttribute('src'),false);assert.equal(f.root.stage.hasAttribute('data-rxa-motion-ready'),false);
  media.destroy();f.image.dispatchEvent(new Event('load'));assert.equal(f.image.parent,null);
});

test('a reduced-motion or initially hidden page does not request an animated image',()=>{
  for(const settings of [{reduced:true},{hidden:true}]){
    const f=fixture({supported:false,...settings}),media=createMessengerMedia(f.root);media.refresh();
    assert.equal(f.image.hasAttribute('src'),false);assert.equal(f.video.hasAttribute('src'),false);media.destroy();
  }
});


test('a decoder that accepts playback without presenting a first frame recovers to animated WebP',()=>{
  const f=fixture({frameCallbacks:true}),media=createMessengerMedia(f.root);media.refresh();
  f.video.dispatchEvent(new Event('playing'));assert.equal(f.frames.size,1);
  // Time can advance in a decoder while requestVideoFrameCallback never fires.
  for(let i=0;i<4;i++){f.video.currentTime+=.75;f.tick(750);}
  assert.equal(f.video.hasAttribute('src'),false);assert.equal(f.frames.size,0);
  assert.ok(f.image.src.endsWith('/C05.webp'));
  f.image.dispatchEvent(new Event('load'));assert.ok(f.root.stage.hasAttribute('data-rxa-motion-ready'));
  assert.equal(f.timers.size,0);media.destroy();
});

test('a pending play request and a frozen visible loop both recover without a media error event',()=>{
  for(const pending of [true,false]){
    const f=fixture(),media=createMessengerMedia(f.root);
    // The controller creates its own retained node; override play before refresh.
    if(pending)f.video.play=()=>new Promise(()=>{});
    media.refresh();
    if(!pending){f.video.dispatchEvent(new Event('playing'));f.video.currentTime=1;f.tick(750);}
    f.tick(3000);assert.ok(f.image.src?.endsWith('/C05.webp'));
    assert.equal(f.timers.size,0);media.destroy();
  }
});

test('progress recovery is inactive offscreen, in a hidden tab, with reduced motion or after destroy',()=>{
  for(const hide of [f=>f.observer.visible(false),f=>{f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));},f=>{f.reduce.matches=true;f.reduce.dispatchEvent(new Event('change'));}]){
    const f=fixture({frameCallbacks:true}),media=createMessengerMedia(f.root);media.refresh();hide(f);
    f.tick(6000);assert.equal(f.image.hasAttribute('src'),false);assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);media.destroy();
  }
  const f=fixture(),media=createMessengerMedia(f.root);media.refresh();media.destroy();f.tick(6000);
  assert.equal(f.image.hasAttribute('src'),false);assert.equal(f.timers.size,0);
});

test('rerender reacquires a suspended frame callback without restarting the retained video',()=>{
  const f=fixture({frameCallbacks:true}),media=createMessengerMedia(f.root);media.refresh();
  const oldId=[...f.frames.keys()][0],writes=f.video.srcWrites;
  f.root.stage=f.stage('C05');media.refresh();assert.equal(f.frames.has(oldId),false);assert.equal(f.frames.size,1);
  const callback=[...f.frames.values()][0];f.frames.clear();callback();
  assert.ok(f.root.stage.hasAttribute('data-rxa-motion-ready'));assert.equal(f.video.srcWrites,writes);
  for(let i=0;i<8;i++){f.video.currentTime+=.75;f.tick(750);}
  assert.equal(f.image.hasAttribute('src'),false);media.destroy();assert.equal(f.timers.size,0);
});
