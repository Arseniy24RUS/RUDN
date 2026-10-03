import {ART_BOUNDS} from './art-bounds.mjs';
/** Render-only art catalog. Source data, engine state and replay never enter this module. */
const RUNTIME_ART=new URL('../../../img/settlements/v3/',import.meta.url);
export const DIRECTIONS=Object.freeze(['e','se','s','sw','w','nw','n','ne']);
export const TERRAIN_THEMES=Object.freeze({grass:'Зелёная',dry:'Песочная',snow:'Светлая'});
export const VEGETATION=Object.freeze(['pine_01','pine_02','pine_03','broadleaf_01','broadleaf_02','broadleaf_03','shrub_01','shrub_02']);
const catalog={},aliases={};
function define(id,family,fallback,anchor=[.5,.9],extra={}){catalog[id]=Object.freeze({id,family,fallback,anchor:Object.freeze(anchor),...extra});}
for(const theme of Object.keys(TERRAIN_THEMES))define(`terrain_${theme}`,'terrain','ground',[.5,.5],{theme});
for(const id of VEGETATION)define(id,'vegetation',id.startsWith('pine')?'tree-pine':'tree-broadleaf');
for(const [kind,fallback] of [['small','village'],['medium','town'],['large','city']])for(let i=1;i<=2;i++)define(`settlement_${kind}_0${i}`,'residential',fallback);
for(const [kind,base] of [['medical',1],['school',3],['culture',5]])for(const level of [1,2])for(const state of ['ready','build']){
  const id=`${kind}_l${level}_${state}`,alias=`O-0${base+level-1}-${state}`;define(id,'building',alias,[.5,.9],{kind,level,state});aliases[alias]=id;
}
for(const kind of ['bus','mobile_med'])for(const direction of DIRECTIONS)define(`${kind}_${direction}`,'transport',kind==='bus'?'O-09':'O-10',[.5,.5],{direction,kind});
define('victory_network','victory','F-03',[.5,.5]);
Object.assign(aliases,{ground:'terrain_grass','tree-pine':'pine_01','tree-broadleaf':'broadleaf_01',village:'settlement_small_01',town:'settlement_medium_01',city:'settlement_large_01','O-09':'bus_se','O-10':'mobile_med_se','F-03':'victory_network'});
export const ART_ASSETS=Object.freeze(catalog);
export const ART_ALIASES=Object.freeze(aliases);
export const assetSpec=id=>ART_ASSETS[ART_ALIASES[id]||id]||null;
export const assetKey=id=>assetSpec(id)?.id||id;
export const legacySpriteId=id=>id.startsWith('legacy:')?id.slice(7):assetSpec(id)?.fallback||id;
const seedIds=new Set(['medical_l1_ready','pine_01','settlement_small_01','bus_se']);
export const P02_ASSETS=Object.freeze(Object.fromEntries(['O-01-ready','tree-pine','village','bus_se'].map(id=>[id,assetSpec(id)])));
// Only exact bytes independently reviewed and copied by art_pipeline.py belong here.
export const APPROVED_ART=Object.freeze({
  culture_l2_build:'4d946fcb7319c3080e8a85b281b719555136f5488e52d8c04f076cb276109f7f',
  school_l2_build:'9957b819c3bef22e60c0e558907c757cf9e188c2f7424b7de61e997b91412610',
  mobile_med_e:'c94dbf834c599ce5d54bed3975ea38d1432433b06dcc4c3f4473836f949b9e67',
  mobile_med_n:'e06f36a78214902f8cf624d488eb56409eb2af3aacba2fd34ea93ff290f50eb2',
  mobile_med_nw:'be5811bf66ab314b5d3aa9b761b27d309b457df454e2ce2ecf3427ff2cd700a0',
  mobile_med_s:'46c48041b2fdc6d2726f536b2d11f2f960c9e3d8c3cefc9f80531247519a4f4b',
  mobile_med_sw:'fce2fadac4c238e1e3b419430ffbc934663b1851d6b2ca7949d22312adfd2ec7',
  mobile_med_w:'973548175aba229cd94cfaff4287920e18f111fb1755259f91152cdbecb4f0eb',
  victory_network:'6cf7802e5a9285a81ba1bad2676f44acdcdf116eb240931c732181904c15ce52',
  mobile_med_ne:'4aef97beecc751fa7ae0aa8f402556546214aa6c08848239274c0312a66ca52b',
  school_l2_ready:'42694b24bb8b79c3c73cc11b80fc93b41829deba58f289c0316aa2ac9e6f0037',
  culture_l2_ready:'17ac3a7513966f13c3881cda3da779b334dd3eb8c7ccb8feaf6ba882df669aa8',
  school_l1_build:'81dd5f3c04a1b4b6d285175142e01a3b7511ad584e4a3628706073c3aceb25c7',
  culture_l1_build:'6ee46fbfb4875169e4d80a504ab6fcea5efe71dca74e76739735c305485d98e7',
  medical_l2_build:'c553c78f3350e870e553320675a23d6c437681b1174007e41e154c994bf5e936',
  school_l1_ready:'6fe59f3edaa4f550b325b71825acf28723464c2281cb2c92dc5fa1e5019d6b02',
  culture_l1_ready:'aa4343f196d3be10876925f188fdfc7521d66c01aaea99d07b2fc03517eec27a',

  medical_l2_ready:'9c755011196975501426d3de18628b0b5b310685340ad9e65b887ffb5b5e9f29',
  mobile_med_se:'8d9370149d153a38005295eaf431601984a3626581b8e799b009bc85dfdb69e1',
  bus_e:'fcc172726f3674544bbb8b5cb827c00fa185cbae78aed47cc504ecd074dadc6e',
  bus_s:'4b202e0d4e7cda6caed76bd7398ff7d13470085b532ecb7c42e84b5166be763b',
  bus_sw:'7756d3f83815a83e7369f1df739f201ddc8ea3d59d3ea1f8e2716a29036f5d07',
  bus_w:'a5ddb14e3e7e3c8602ac43d97ff9e7f09680109dcb3e7580874cb6490c8bc315',
  bus_nw:'c74c9e89a2615efed3badf8d4d823270c10928b197cc48f847912e71dc2579e1',
  bus_n:'d5eb3491a1f3b22ac3e59ac3ac30a5da299297186e8848fef527ffbb8732cc5f',
  bus_ne:'d5330dea9da3279b4c20d35bf9ab37b56ff49668dfc8a57db1d487228b2d12a5',

  medical_l1_ready:'4537addd12fa7b9daa617b4924742205e24e60c8c0a909f613770143229bd277',
  pine_01:'ee2475ba03d0d035bcdfecc4256794a74621997723df6b62b307a778865f471f',
  bus_se:'c8d515cbb09ddb0e56252b65ee42fbf23d7c75be2a2feeedc9a165c8b9b0290d',
  settlement_small_01:'33826998417b42ce3729ba7f5e9bbc266dd956faa508b3f76c95485be0f698e7',
  terrain_grass:'4979c0cf6beaa1a7237752bd08fedc1b99e7b3a3f2a15d48b0df61e14f76a70c',
  terrain_dry:'76f868a7f536834c63c50e16157c245cfd7d2290f1177171fec4a065f6a7c934',
  terrain_snow:'94a0694db5d81280d425c09d87b8073c05ab81edad9fef710916dbd55da6f903',
  pine_02:'b284888161dcf6817fe0024d030a3ab0eb96c2f545c2e25d63a898aad5acc371',
  pine_03:'4c78d159a9b9fe9f38f5b0a48970b67d806ecf9a224590989c17791f0c33503b',
  broadleaf_01:'645f8a696b286d01baf68c19cc78b56cb7498ceb92d30590b3e243ab27f9a5f2',
  broadleaf_02:'df7cfa6c223f0034fd8afa3a1e35ce473eb45e2317bd2a080f1024dd117c4cc0',
  broadleaf_03:'2e5a821accbf69fc7bfea6fa7e32bada9acdb19ef786f3fa23c04e8658fa8205',
  shrub_01:'22b4ad02371f04b7444c08be9912c9967023bd99f464a4e8bc83b2eeb42d296d',
  shrub_02:'c1efd60db1909d8ac064874e371f2c00054e7fb1fef6e5367df534b9d2dacb71',
  medical_l1_build:'dbc2bcaee27e73ee4c54b7ba52f3281c45be60b37a1be84658f02d83228b27f4',
  settlement_small_02:'6db2109ea16dba791a83ae8a4a4babb24f9d330fdc0146c8ddcb0a5b75aff4c6',
  settlement_medium_01:'50501a7b241f0075dcc2d5686cd72d108edf39690d503825f6ba58329b0e4e7b',
  settlement_medium_02:'92cd9dc67b6fdacfb98aa2ce4323082799ad32b86233798c02dd6d312d29f5a3',
  settlement_large_01:'f4bd5e03086d7c796440453106daf86a239dfef27c402e6d816b243f53f88426',
  settlement_large_02:'e0ed44bde19612403a1a0ad3d7f87a00a5a2c5598d6bfe7ab8610f77d931aaf9',
});
// Uniform profile accepted with medical_l2_ready c1; byte approval remains asset-specific.
// The candidate export name is retained for existing diagnostics. Manifest anchors stay unchanged.
export const MEDICAL_L2_CANDIDATE_PROFILE=Object.freeze({id:'medical-l2-uniform-c1',referenceSize:512,scale:1.2728175398288406,translation:Object.freeze([12.060998904651228,-46.722740954467326]),status:'accepted-profile'});
// Independently accepted in the live scene. Geometry and camera limits also apply in ordinary mode;
// artworkTransform still requires decoded approved bytes, keeping legacy fallbacks unchanged.
const acceptedLevel2Profiles=Object.freeze({
  school:Object.freeze({id:'school-l2-uniform-c1',preferredMaxLiftCss:20,referenceSize:512,scale:.9977353659723452,translation:Object.freeze([.8107936741638468,-36.51407462769748]),status:'accepted-profile'}),
  culture:Object.freeze({id:'culture-l2-uniform-c1',preferredMaxLiftCss:20,referenceSize:512,scale:1.0420582352527314,translation:Object.freeze([-2.3073231282603217,-39.793534888551676]),status:'accepted-profile'}),
});
// Shared clearance is promoted only for actual approved medical/outreach art, never legacy fallbacks.
export const MEDICAL_CANDIDATE_FAMILY=Object.freeze({id:'medical-shared-clearance-c1',additionalLiftCss:20,maxLiftCss:96,pointGapCss:3,assets:Object.freeze(['medical_l1_ready','medical_l1_build','medical_l2_ready','medical_l2_build'])});
const candidateFamilies=Object.freeze(Object.fromEntries(['school','culture'].map(kind=>[kind,Object.freeze({id:`${kind}-shared-clearance-c1`,additionalLiftCss:0,maxLiftCss:96,pointGapCss:3,assets:Object.freeze([`${kind}_l1_ready`,`${kind}_l1_build`,`${kind}_l2_ready`,`${kind}_l2_build`])})])));
const page=typeof location==='undefined'?null:new URL(location.href);
const requested=page?.searchParams.get('artPreview');
export const ART_PREVIEW=page&&page.protocol==='http:'&&['127.0.0.1','localhost'].includes(page.hostname)&&page.searchParams.getAll('artPreview').length===1&&['p02','p03'].includes(requested)?requested:null;
export const CANDIDATE_ART=Boolean(ART_PREVIEW);
const isCandidate=spec=>ART_PREVIEW==='p03'||ART_PREVIEW==='p02'&&seedIds.has(spec.id);
export const artworkAvailable=id=>{const spec=assetSpec(id);return Boolean(spec&&(isCandidate(spec)||APPROVED_ART[spec.id]));};
export function artworkVariant(ids,index=0){const available=ids.filter(artworkAvailable),pool=available.length?available:ids.slice(0,1);return pool[Math.abs(index)%pool.length];}
export function headingDirection(dx,dy){return Math.abs(dx)+Math.abs(dy)<.001?'se':DIRECTIONS[(Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8];}
const sources=new Map(),fallbacks=new Map(),sourceIds=new Map(),unavailable=new Set(),loaded=new Map(),draws=new Map();
let diagnosticDraws=false;
export function setArtworkDiagnostics(value){diagnosticDraws=Boolean(value);}

export function artwork(id,fallback){
  const spec=assetSpec(id);if(!spec||!artworkAvailable(id))return fallback;
  const url=isCandidate(spec)?new URL(`/__art-preview/${ART_PREVIEW}/${spec.id}.webp`,page.origin).href:new URL(`${spec.id}.webp`,RUNTIME_ART).href;
  sources.set(spec.id,url);sourceIds.set(url,spec.id);fallbacks.set(url,fallback);return unavailable.has(url)?fallback:url;
}
/** Exactly one fallback request per failed image; unavailable candidates stay absent until reload. */
export function fallbackArtwork(image){
  const source=image.currentSrc||image.src,fallback=fallbacks.get(source);
  if(!fallback||image.src===fallback)return false;
  unavailable.add(source);console.warn('[art-fallback]',source,'→',fallback);
  image.dataset.artFallback='true';image.src=fallback;return true;
}
export function artworkProfile(id,image){
  const spec=assetSpec(id);return spec&&image?.complete&&image.naturalWidth&&(image.currentSrc||image.src)===sources.get(spec.id)?spec:null;
}
export const artworkLevel2Profile=kind=>kind==='medical'?MEDICAL_L2_CANDIDATE_PROFILE:acceptedLevel2Profiles[kind]||null;
export function artworkTransform(id,image){const spec=artworkProfile(id,image);return spec?.level===2&&(ART_PREVIEW==='p03'||APPROVED_ART[spec.id])&&image.naturalWidth===512&&image.naturalHeight===512?artworkLevel2Profile(spec.kind):null;}
export function artworkFamilyPlacement(id,image){
  const spec=assetSpec(id);if(!spec||ART_PREVIEW!=='p03'&&!(APPROVED_ART[spec.id]&&['medical','school','culture','mobile_med'].includes(spec.kind)))return null;
  // Metadata-only calls may prefetch/frame the family; actual placement requires decoded primary art.
  if(image&&!artworkProfile(id,image))return null;
  if(spec.kind==='mobile_med')return{id:'outreach-clearance-c1',additionalLiftCss:0,maxLiftCss:96,pointGapCss:3,assets:[spec.id]};
  return spec.family==='building'?(spec.kind==='medical'?MEDICAL_CANDIDATE_FAMILY:candidateFamilies[spec.kind]):null;
}
/** Prepared from exact approved bytes; no canvas readback on the interaction path. */
export function artworkBounds(image){
  const id=sourceIds.get(image.currentSrc||image.src),record=ART_BOUNDS[id];
  return record&&record.sha256===APPROVED_ART[id]&&record.size[0]===image.naturalWidth&&record.size[1]===image.naturalHeight?record.bounds:[0,0,1,1];
}
export function recordArtworkLoad(id,image){
  const spec=assetSpec(id);if(!spec)return;const profile=artworkProfile(id,image);
  loaded.set(spec.id,{alias:id,assetId:spec.id,src:image.currentSrc||image.src,loaded:Boolean(image.naturalWidth),status:profile?(isCandidate(spec)?'candidate':'approved'):'legacy-fallback',anchor:profile?[...profile.anchor]:null,placement:profile?'manifest-anchor':'legacy-placement',sha256:profile&&!isCandidate(spec)?APPROVED_ART[spec.id]:null});
}
export function recordArtworkDraw(id,image,box,details={}){
  const spec=artworkProfile(id,image);if(!spec||!box.every(Number.isFinite)||box[2]<=0||box[3]<=0||details.opacity===0)return;
  const viewport=details.viewport||[Infinity,Infinity],left=Math.max(0,box[0]),top=Math.max(0,box[1]),right=Math.min(viewport[0],box[0]+box[2]),bottom=Math.min(viewport[1],box[1]+box[3]);
  if(right<=left||bottom<=top)return;
  const old=draws.get(spec.id),time=performance.now(),sample={box:[...box],visibleBox:[left,top,right-left,bottom-top],time,...details};
  draws.set(spec.id,{assetId:spec.id,src:image.currentSrc||image.src,status:isCandidate(spec)?'candidate':'approved',count:(old?.count||0)+1,last:sample,recent:diagnosticDraws?[...(old?.recent||[]).slice(-11),sample]:[sample]});
}
export const artworkEvidence=()=>Array.from(loaded.values(),record=>({...record,anchor:record.anchor?[...record.anchor]:null}));
export const artworkDrawEvidence=()=>structuredClone(Array.from(draws.values()));

/** Small decode queue. get() starts only requested art; prefetch() prioritizes ready/build pairs. */
export class ArtworkLoader{
  constructor(resolve,onChange){this.resolve=resolve;this.onChange=onChange;this.entries=new Map();this.queue=[];this.active=0;this.destroyed=false;this.limit=64;this.rasters=new Map();this.rasterPixels=0;this.rasterPixelLimit=2097152;}
  raster(image,width){
    if(!image.naturalWidth)return image;const size=Math.min(image.naturalWidth,2**Math.ceil(Math.log2(Math.max(16,width*Math.min(2,globalThis.devicePixelRatio||1)))));
    if(size>=image.naturalWidth)return image;const key=`${image.currentSrc||image.src}:${size}`,old=this.rasters.get(key);if(old){this.rasters.delete(key);this.rasters.set(key,old);return old;}
    const c=document.createElement('canvas');c.width=size;c.height=Math.max(1,Math.round(size*image.naturalHeight/image.naturalWidth));c.getContext('2d').drawImage(image,0,0,c.width,c.height);this.rasters.set(key,c);this.rasterPixels+=c.width*c.height;
    while(this.rasterPixels>this.rasterPixelLimit&&this.rasters.size>1){const [k,canvas]=this.rasters.entries().next().value;this.rasterPixels-=canvas.width*canvas.height;this.rasters.delete(k);canvas.width=canvas.height=1;}return c;
  }
  get(id){
    const key=assetKey(id);if(this.entries.has(key))return this.entries.get(key).image;
    const image=new Image();image.decoding='async';let done;const promise=new Promise(resolve=>{done=resolve;});
    if(this.entries.size>=this.limit){for(const [old,e] of this.entries)if(e.settled){this.entries.delete(old);e.image.src='';break;}}
    const entry={id:key,image,promise,done,started:false};this.entries.set(key,entry);this.queue.push(entry);this.pump();return image;
  }
  prefetch(ids){const keys=new Set(ids.filter(Boolean).map(assetKey));for(const id of keys)this.get(id);this.queue.sort((a,b)=>Number(keys.has(b.id))-Number(keys.has(a.id)));this.pump();return Promise.all([...keys].map(id=>this.entries.get(id).promise));}
  pump(){
    while(!this.destroyed&&this.active<4&&this.queue.length){const entry=this.queue.shift(),image=entry.image;entry.started=true;this.active++;let settled=false;
      const finish=()=>{if(settled)return;settled=true;entry.settled=true;if(this.destroyed){entry.done(image);return;}this.active--;recordArtworkLoad(entry.id,image);entry.done(image);this.onChange?.(entry.id);this.pump();};
      image.onload=()=>{Promise.resolve(image.decode?.()).catch(()=>{}).then(finish);};
      image.onerror=()=>{if(!fallbackArtwork(image))finish();};image.src=this.resolve(entry.id);
    }
  }
  destroy(){this.destroyed=true;for(const entry of this.entries.values()){entry.image.onload=null;entry.image.onerror=null;entry.done(entry.image);entry.image.src='';}this.queue=[];this.active=0;this.entries.clear();for(const c of this.rasters.values())c.width=c.height=1;this.rasters.clear();this.rasterPixels=0;}
}

if(typeof document!=='undefined'){
  document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement)fallbackArtwork(event.target);},true);
  document.addEventListener('load',event=>{const img=event.target;if(!(img instanceof HTMLImageElement))return;const id=sourceIds.get(img.currentSrc||img.src);if(!id)return;recordArtworkLoad(id,img);requestAnimationFrame(()=>{const r=img.getBoundingClientRect();if(r.width&&r.height&&r.bottom>0&&r.top<innerHeight)recordArtworkDraw(id,img,[r.x,r.y,r.width,r.height],{layer:'dom',viewport:[innerWidth,innerHeight]});});},true);
  if(ART_PREVIEW){document.documentElement.dataset.artPreview=`${ART_PREVIEW}-candidate`;console.info(`[art-preview] ${ART_PREVIEW} candidates; unapproved review resources, not production artwork.`);}
}
