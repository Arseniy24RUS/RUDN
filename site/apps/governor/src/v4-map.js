(function (root) {
  'use strict';
  const G = root.GovernorGame ||= {};
  const MAX_ZOOM = 4;
  const MIN_ZOOM = 1;
  const MAX_CARS = 12;
  const DRAG_THRESHOLD = 6;
  const worlds = new Map();
  const vehicleAngles = new Map();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[char]);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const fraction = (value, fallback = .5) => Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
  const initialCamera = () => ({x:.5,y:.5,zoom:MIN_ZOOM});
  const normal = ({x,y} = {}) => [fraction(x),fraction(y)];
  const stringsDefault = {
    zoomIn:'Приблизить', zoomOut:'Отдалить', reset:'Общий вид', objects:'Точки на карте',
    controls:'Управление картой', closedRoad:'Дорога закрыта'
  };

  // The school graph gives access and duration. The registered interior waypoints
  // keep the pictured road and its traffic on the same geometry at every scale.
  const schoolWaypoints = {
    'bridge-crossing':[[.54,.497],[.60,.468],[.659,.439]],
    'j-s':[[.257,.69],[.207,.738],[.158,.811]],
    'old-gate':[[.251,.48]],
    'yard-gate':[[.405,.56],[.49,.52],[.72,.41],[.801,.232]],
    'bridge-gate':[[.55,.51],[.704,.419]],
    'south-gate':[[.29,.692]]
  };
  // These drivable centre lines are registered to the existing New Bank plate.
  // Other graph edges, such as pedestrian access to a school gate, stay static.
  const paintedSchoolRoads = {
    'w-c':[[.017,.731],[.09,.716],[.158,.681],[.202,.631],[.229,.62],[.265,.600],[.308,.578],[.353,.562],[.402,.542]],
    'c-b':[[.402,.542],[.428,.532],[.456,.521],[.49,.507]],
    'east-gate':[[.722,.407],[.759,.429],[.799,.44],[.836,.472],[.899,.496],[.972,.529]],
    'c-j':[[.227,.622],[.216,.638],[.201,.655],[.162,.67],[.116,.686],[.059,.708]]
  };
  // Visual registration on the terrain plates. Site IDs and model effects stay fixed.
  const districtSites = {
    suburb:{
      'suburb-school-reserve':[.244,.538], 'suburb-station-fields':[.802,.418]
    },
    north:{
      'remote-cluster':[.262,.288], 'district-centre':[.754,.471], 'transport-junction':[.488,.565],
      'north-road-paddock':[.35,.68], 'north-service-village':[.886,.470]
    },
    river:{
      upstream:[.246,.106], 'river-towns':[.430,.603], 'delta-corridor':[.536,.897],
      'river-high-terrace':[.174,.773], 'river-reclaimed-quay':[.853,.521]
    },
    industrial:{
      'old-industrial-city':[.24,.548], 'small-town-belt':[.605,.214], 'logistics-corridor':[.722,.852],
      'industrial-recovery-yard':[.482,.327], 'industrial-rail-siding':[.604,.959]
    },
    capital:{
      'central-hub':[.581,.378], 'outer-district':[.916,.572], 'split-counters':[.205,.582],
      'capital-redevelopment-block':[.33,.34], 'capital-ring-station':[.590,.956]
    }
  };
  // Registered against the cropped 768×512 territory plates. River traffic on
  // each bank is kept independent because the artwork shows no crossing.
  const paintedDistrictRoads = {
    north:[
      [[208,158],[230,170],[249,183],[243,193],[230,211],[256,229],[292,242],[329,252],[361,260],[380,269],[363,287],[339,312],[305,337],[278,350],[249,367],[216,379],[177,394],[140,407]],
      [[380,269],[405,258],[429,250],[450,260],[474,271],[505,269],[537,262],[562,256],[574,248]],
      [[216,379],[239,383],[260,393],[277,406],[291,417]]
    ],
    river:[
      [[245,400],[231,383],[229,370],[235,357],[259,348],[284,338],[311,325],[333,312],[345,295],[354,279],[351,263]],
      [[2,341],[45,330],[81,322],[116,312],[139,303],[170,299],[191,297],[210,306],[225,326],[241,347],[235,357]],
      [[384,134],[405,143],[419,153],[429,167],[434,181],[450,190],[471,201],[506,217],[538,235],[563,249],[588,263],[610,278],[632,300],[654,319],[678,339],[702,348],[734,354],[765,365]]
    ],
    industrial:[
      [[5,316],[34,307],[65,297],[93,293],[121,299],[157,314],[197,326],[229,330],[270,324],[315,316],[359,309],[401,298],[449,282],[494,269],[542,254],[583,245],[624,233],[677,232],[724,226],[765,212]],
      [[332,338],[357,332],[389,345],[432,357],[471,376],[512,396],[552,410],[595,422],[639,430],[679,427]],
      [[374,181],[408,177],[455,174],[493,176],[522,187],[550,201],[585,210],[623,220],[657,223],[677,232]]
    ],
    capital:[
      [[194,99],[217,124],[241,150],[268,181],[292,214],[316,245],[338,272],[366,301],[395,335],[423,371],[451,405],[476,442],[510,480]],
      [[119,309],[155,304],[210,295],[260,286],[309,278],[339,270],[392,259],[447,251],[505,240],[553,234],[581,242],[631,250],[670,258]],
      [[459,140],[478,157],[502,179],[527,203],[553,225],[573,243],[595,271],[620,294],[649,323],[676,353]]
    ]
  };
  const regionRoads = [
    [[.072,.342],[.171,.36],[.275,.38],[.348,.411],[.453,.454],[.539,.495],[.623,.445],[.718,.4],[.826,.416],[.923,.404]],
    [[.539,.495],[.505,.562],[.473,.62],[.44,.691],[.426,.745]],
    [[.623,.445],[.689,.394],[.756,.35],[.836,.321],[.899,.347],[.926,.398],[.887,.423]]
  ];
  // Fractions along the painted road hidden under the illustrated tree crowns.
  const treeCanopy = {'industrial-road-1':[.539,.588], 'north-road-1':[.534,.623]};

  function sitePoint(district, id, fallback) {
    const point = districtSites[district]?.[id];
    return point ? {x:point[0],y:point[1]} : {x:fraction(fallback?.x),y:fraction(fallback?.y)};
  }

  function schoolRoads({roads = [], closedRoads = [], projectPoint, vehicle}) {
    const closures = new Set(closedRoads);
    return roads.map(road => ({
      id:road.id,
      points:paintedSchoolRoads[road.id] ||
        [normal(projectPoint(road.from)), ...(schoolWaypoints[road.id] || []), normal(projectPoint(road.to))],
      closed:closures.has(road.id),
      traffic:road.id === 'bridge-crossing' ? 2 : paintedSchoolRoads[road.id] ? 1 : 0,
      vehicle:road.id==='w-c'?vehicle:undefined,
      kind:road.id.includes('-gate') ? 'access' : 'local',
      label:road.label || road.name || ''
    }));
  }

  function ambientRoads(district,vehicle) {
    const paths=district==='region' ? regionRoads :
      (paintedDistrictRoads[district] || []).map(points=>points.map(([x,y])=>[x/768,y/512]));
    return paths.map((points,index) => ({
      id:district+'-road-'+(index+1), points, kind:'ambient', traffic:index===0 ? 2 : 1,
      vehicle:index===0?vehicle:undefined
    }));
  }

  function pinMarkup(pin, list = false, historical = false) {
    const {kind,id,label,selected,disabled} = pin;
    if (!['site','object','district','event'].includes(kind) || typeof id !== 'string' || (historical && kind === 'site')) return '';
    const inspectable = !historical || kind === 'district';
    const attributes = inspectable ? 'type="button" data-v3-'+kind+'="'+escape(id)+'"'+(disabled?' disabled':'') : list?'':'role="img"';
    const tag = inspectable ? 'button' : 'span';
    const state = ['foundation','frame','finishing','open','closed','restoring','planned','occupied'].includes(pin.status) ? ' is-'+pin.status : '';
    const marker = pin.icon ? '<img src="'+escape(pin.icon)+'" alt="" draggable="false">' :
      kind === 'site' || pin.marker ? '<span class="v4-map-site-letter">'+escape(pin.marker || '+')+'</span>' : '';
    const content = '<span class="v4-map-pin-symbol" aria-hidden="true">'+marker+'</span>'+
      (list ? '<span>'+escape(label)+'</span>' : '');
    const shared = ' class="v4-map-'+(list?'entry':'pin')+' v4-map-'+kind+state+(selected?' is-selected':'')+(pin.recent?' is-recent':'')+'"'+
      (inspectable&&typeof selected==='boolean'?' aria-pressed="'+selected+'"':'');
    const coords = ' style="--map-x:'+fraction(pin.x)+';--map-y:'+fraction(pin.y)+'"';
    const description = list ? '' : ' aria-label="'+escape(label)+'" title="'+escape(label)+'"';
    return '<'+tag+' '+attributes+shared+(list?'':coords)+description+'>'+content+'</'+tag+'>';
  }

  function activityMarkup(animation, ambient = false) {
    if (!animation?.src) return '';
    return '<span class="v4-map-activity'+(ambient?' v4-map-ambient':'')+'" aria-hidden="true"'+
      ' style="left:'+fraction(animation.offsetX,0)*100+'%;top:'+fraction(animation.offsetY,.60)*100+
      '%;width:'+fraction(animation.width,1)*100+'%;height:'+fraction(animation.height,.40)*100+'%">'+
      '<img data-v4-gif-src="'+escape(animation.src)+'" alt="" decoding="async" draggable="false"></span>';
  }

  function buildingMarkup(building, historical) {
    const {id,src,animation} = building;
    if (!src && !animation?.src) return '';
    const phase = ['foundation','frame','finishing','open','closed','restoring','planned'].includes(building.status) ? building.status : '';
    return '<span class="v4-map-building is-'+phase+(building.groundwork?' v4-map-groundwork':'')+'" data-v4-build="'+escape(id)+'"'+
      ' style="--map-x:'+fraction(building.x)+';--map-y:'+fraction(building.y)+';--map-size:'+clamp(fraction(building.width,.20),.03,.75)+'" aria-hidden="true">'+
      (src?'<img class="v4-map-structure" src="'+escape(src)+'" loading="lazy" decoding="async" alt="" draggable="false">':'')+
      (!historical?activityMarkup(animation):'')+'</span>';
  }

  function carMarkup(index,vehicle) {
    const type=index===0&&['bus','medical','freight'].includes(vehicle)?vehicle:'car';
    return '<g class="v4-map-car v4-map-car-'+(index%3)+' v4-map-vehicle-'+type+'" data-v4-car aria-hidden="true">'+
      '<g data-v4-vehicle="'+type+'"/></g>';
  }

  function projectedVehicle(type,heading) {
    const key=type+':'+heading;
    if (vehicleAngles.has(key)) return vehicleAngles.get(key);
    // Align the ground plane with the painted terrain. Elevation always rises
    // vertically on screen, including when a vehicle turns or changes lanes.
    const pitch=.56, angle=heading*Math.PI/180;
    const yaw=Math.atan2(Math.sin(angle)/pitch,Math.cos(angle));
    const along=[Math.cos(yaw),pitch*Math.sin(yaw)];
    const across=[-Math.sin(yaw),pitch*Math.cos(yaw)];
    const side=across[1]>=0?1:-1;
    const nose=along[1]>=0;
    const bus=type==='bus', freight=type==='freight', medical=type==='medical';
    const length=bus||freight?14:medical?10.5:9;
    const width=bus||freight||medical?5.1:4.4;
    const panel=(kind,vertices)=>'<polygon class="v4-map-car-'+kind+'" points="'+vertices.map(([x,y,z])=>
      (x*along[0]+y*across[0]).toFixed(1)+','+(x*along[1]+y*across[1]-z).toFixed(1)
    ).join(' ')+'"/>';
    const deck=(back,front,half,z)=>[[back,-half,z],[front,-half,z],[front,half,z],[back,half,z]];
    const block=(back,front,half,bottom,top,palette='')=>{
      const near=side*half, end=nose?front:back;
      return panel('side'+palette,[[back,near,bottom],[front,near,bottom],[front,near,top],[back,near,top]])+
        panel('end'+palette,[[end,-half,bottom],[end,half,bottom],[end,half,top],[end,-half,top]])+
        panel('roof'+palette,deck(back,front,half,top));
    };
    const strip=(kind,back,front,half,bottom,top)=>panel(kind,
      [[back,side*half,bottom],[front,side*half,bottom],[front,side*half,top],[back,side*half,top]]);
    const wheel=x=>strip('wheel',x-1.65,x+1.65,width+.12,.05,2.75);
    const windshield=(start,finish,half,bottom,top)=>panel('glass',
      [[start,-half,bottom],[start,half,bottom],[finish,half,top],[finish,-half,top]]);
    let svg=panel('shadow',deck(-length-.7,length+.7,width+.8,-.2))+wheel(-length+4)+wheel(length-3.7);
    svg+=block(-length,length,width,1.3,bus||medical?7.1:3.2);
    if (bus||medical) {
      const windows=bus?[-10,-5,0,5,10]:[5.4];
      for (const x of windows) svg+=strip('glass',x-1.65,x+1.65,width,4.7,6.65);
      if (nose) svg+=windshield(length,length,width-.7,4.9,6.7);
      if (medical) svg+=strip('stripe',-10.3,10.3,width,2.8,3.65);
    } else {
      if (freight) svg+=block(-length+.45,3.4,width-.22,3.2,8.1,'-cargo');
      const back=freight?4.1:-4.8, front=freight?12.7:4.2, half=width-.7;
      svg+=block(back,front,half,3.2,6.1)+strip('glass',back+.7,front-.6,half,3.9,5.6);
      if (nose) svg+=windshield(front,front,half-.35,3.9,5.6);
    }
    const end=nose?length:-length;
    for (const lamp of [-width+.9,width-.9]) svg+=panel(nose?'headlamp':'tail-lamp',
      [[end,lamp-.46,1.98],[end,lamp+.46,1.98],[end,lamp+.46,2.85],[end,lamp-.46,2.85]]);
    vehicleAngles.set(key,svg);
    return svg;
  }

  function roadPath(points, height) {
    const positions = points.map(([x,y])=>[fraction(x)*1000,fraction(y)*height]);
    const coords = pair => pair.map(value=>Number(value.toFixed(2))).join(' ');
    const towards = (a,b) => {
      const length=Math.hypot(a[0]-b[0],a[1]-b[1]);
      const rate=length>0 ? Math.min(.27,24/length) : 0;
      return [a[0]+(b[0]-a[0])*rate,a[1]+(b[1]-a[1])*rate];
    };
    let path='M'+coords(positions[0]);
    for (let index=1;index<positions.length-1;index++) {
      const corner=positions[index];
      path+=' L'+coords(towards(corner,positions[index-1]))+
        ' Q'+coords(corner)+' '+coords(towards(corner,positions[index+1]));
    }
    return path+' L'+coords(positions.at(-1));
  }

  function routeMarkup(routes, aspect, historical) {
    let remaining = MAX_CARS;
    const height = Math.round(1000/aspect);
    const outlines=[];
    const groups = routes.map(route => {
      const {id,points,closed} = route;
      if (!Array.isArray(points) || points.length < 2) return '';
      const kind = ['local','ambient','service','access'].includes(route.kind) ? route.kind : 'local';
      const path = roadPath(points,height);
      const count = closed || historical ? 0 : Math.min(remaining, clamp(Math.round(route.traffic || 0),0,3));
      remaining -= count;
      const classes='v4-map-road v4-map-road-'+kind+(closed?' is-closed':'');
      outlines.push('<g class="'+classes+'"><path class="v4-map-road-edge" d="'+path+'"/></g>');
      return '<g data-v4-road="'+escape(id)+'" class="'+classes+'"'+
        (closed?' data-v4-closed':'')+'><path class="v4-map-road-centre" d="'+path+
        '" data-v4-path/>'+Array.from({length:count},(_,index)=>carMarkup(index,route.vehicle)).join('')+'</g>';
    }).join('');
    return '<svg class="v4-map-roads" viewBox="0 0 1000 '+height+'" preserveAspectRatio="none" aria-hidden="true">'+outlines.join('')+groups+'</svg>';
  }

  function render({
    key, district, image, overlayImage, aspect = 1.5, pins = [], buildings = [], routes = [], ambient = [],
    historical = false, label = '', strings = {}, fit = 'cover'
  }) {
    const landscape = Number.isFinite(aspect) ? clamp(aspect,.65,3) : 1.5;
    const copy = {...stringsDefault,...strings};
    const messages = routes.filter(road=>road.closed).map(road=>road.label).filter(Boolean);
    const list = pins.map(pin=>pinMarkup(pin,true,historical)).join('');
    return '<div class="v4-map" data-v4-district="'+escape(district)+'">'+
      '<div class="v4-map-viewport" data-v4-map-key="'+escape(key || district || 'region')+'" data-v4-aspect="'+landscape+
      '" data-v4-fit="'+(fit==='contain'?'contain':'cover')+'" style="--map-aspect:'+landscape+'" role="region" aria-label="'+escape(label)+'" tabindex="0">'+
      '<div class="v4-map-world">'+
      (image?'<img class="v4-map-terrain" src="'+escape(image)+'" alt="" decoding="async" draggable="false">':'')+
      (historical?'':ambient.map(layer=>activityMarkup(layer,true)).join(''))+
      routeMarkup(routes,landscape,historical)+
      (overlayImage?'<img class="v4-map-terrain v4-map-foreground" src="'+escape(overlayImage)+'" alt="" decoding="async" draggable="false">':'')+
      buildings.map(building=>buildingMarkup(building,historical)).join('')+
      pins.map(pin=>pinMarkup(pin,false,historical)).join('')+'</div>'+
      (copy.dragHint?'<p class="v4-map-hint">'+escape(copy.dragHint)+'</p>':'')+
      (routes.some(road=>road.closed)?'<p class="v4-map-closure" role="status">'+escape(copy.closedRoad+(messages.length?' · '+messages.join(', '):''))+'</p>':'')+
      '</div><div class="v4-map-dock">'+
      (list?'<details class="v4-map-index"><summary>'+escape(copy.objects)+'</summary><div>'+list+'</div></details>':'')+
      '<div class="v4-map-controls" role="group" aria-label="'+escape(copy.controls)+'">'+
      '<button type="button" data-v4-camera="in" aria-label="'+escape(copy.zoomIn)+'">+</button>'+
      '<button type="button" data-v4-camera="out" aria-label="'+escape(copy.zoomOut)+'">−</button>'+
      '<button type="button" data-v4-camera="reset" aria-label="'+escape(copy.reset)+'"><span aria-hidden="true">⌂</span></button>'+
      '</div></div></div>';
  }

  function transform(camera, bounds) {
    const {viewW,viewH,worldW,worldH} = bounds, z = camera.zoom;
    const width = worldW*z, height = worldH*z;
    const offset = (middle, span, viewport) => span <= viewport ? (viewport-span)/2 :
      clamp(viewport/2-middle*span, viewport-span, 0);
    return {left:offset(camera.x,width,viewW),top:offset(camera.y,height,viewH),width,height};
  }

  function anchorAt(point, camera, bounds) {
    const {left,top,width,height} = transform(camera,bounds);
    return {x:(point.x-left)/width,y:(point.y-top)/height};
  }

  function cameraAt(anchor, point, zoom, bounds) {
    const {viewW,viewH,worldW,worldH} = bounds;
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    return {
      x:fraction(anchor.x+(viewW/2-point.x)/(worldW*z)),
      y:fraction(anchor.y+(viewH/2-point.y)/(worldH*z)),
      zoom:z
    };
  }

  function mapBounds(node) {
    const viewW = node.clientWidth, viewH = node.clientHeight;
    if (!viewW || !viewH) return null;
    const aspect = Number(node.dataset.v4Aspect) || 1.5;
    const ratio = node.dataset.v4Fit === 'contain' ? Math.min(viewW/aspect,viewH) : Math.max(viewW/aspect,viewH);
    return {viewW,viewH,worldW:aspect*ratio,worldH:ratio};
  }

  function animateCars(cars, elapsed) {
    for (const item of cars) {
      const progress = ((item.offset+elapsed*item.speed)%item.length+item.length)%item.length;
      const at = item.path.getPointAtLength(progress);
      const ahead = item.path.getPointAtLength(clamp(progress+item.direction*2,0,item.length));
      const radians = Math.atan2(ahead.y-at.y,ahead.x-at.x);
      const heading=(Math.round(radians*36/Math.PI)*5+360)%360;
      if (item.heading!==heading) {
        item.shape.innerHTML=projectedVehicle(item.type,heading);
        item.heading=heading;
      }
      const clear=item.canopy?Math.max(item.canopy[0]*item.length-progress,progress-item.canopy[1]*item.length,0):16;
      item.node.setAttribute('opacity',clamp(Math.min(clear,progress,item.length-progress)/16,0,1).toFixed(2));
      item.node.setAttribute('transform','translate('+
        (at.x-Math.sin(radians)*3.3).toFixed(2)+' '+(at.y+Math.cos(radians)*3.3).toFixed(2)+')');
    }
  }

  function stageCars(node) {
    const cars = [];
    for (const group of node.querySelectorAll('[data-v4-road]:not([data-v4-closed])')) {
      const vehicles = group.querySelectorAll('[data-v4-car]');
      if (!vehicles.length) continue;
      const path = group.querySelector('[data-v4-path]'), length = path.getTotalLength();
      if (!length) continue;
      vehicles.forEach((node,index) => {
        const direction = index%2 ? -1 : 1;
        const shape=node.querySelector('[data-v4-vehicle]');
        cars.push({node,shape,type:shape.dataset.v4Vehicle,path,length,direction,canopy:treeCanopy[group.dataset.v4Road],
          offset:length*(index+.23)/vehicles.length,speed:direction*(28+7*index)});
      });
    }
    return cars;
  }

  function attach(host) {
    if (worlds.has(host)) return worlds.get(host);
    const stages = new Map(), activities = new Map(), cameras = new Map(), pointers = new Map();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const connection = navigator.connection;
    let frame = 0, previous = 0, sequence = null, suppressedUntil = 0, suppressedKey = '';
    const visible = () => !document.hidden && !reduce.matches && !connection?.saveData && !host.closest('.v3-motion-paused');
    const settings = {passive:false};
    const camera = slot => cameras.get(slot.key);

    function paint(slot) {
      const bounds = slot.bounds;
      if (!bounds) return;
      const view = camera(slot), {left,top,width,height} = transform(view,bounds);
      cameras.set(slot.key,{x:(bounds.viewW/2-left)/width,y:(bounds.viewH/2-top)/height,zoom:view.zoom});
      slot.world.style.width = bounds.worldW+'px';
      slot.world.style.height = bounds.worldH+'px';
      slot.world.style.transform = 'translate3d('+left+'px,'+top+'px,0) scale('+view.zoom+')';
      slot.world.style.setProperty('--map-pixel-scale',1/view.zoom);
      const map = slot.node.closest('.v4-map');
      const zoomIn = map.querySelector('[data-v4-camera="in"]');
      const zoomOut = map.querySelector('[data-v4-camera="out"]');
      zoomIn.disabled = view.zoom >= MAX_ZOOM-1e-5;
      zoomOut.disabled = view.zoom <= MIN_ZOOM+1e-5;
    }

    function frameTick(now) {
      frame = 0;
      if (!visible()) { previous = 0; return; }
      const delta = previous ? Math.min(.05,(now-previous)/1000) : 0;
      previous = now;
      for (const slot of stages.values()) {
        if (!slot.animating) continue;
        slot.elapsed += delta;
        animateCars(slot.cars,slot.elapsed);
      }
      frame = requestAnimationFrame(frameTick);
    }

    function motion() {
      let running = false;
      const allowed = visible();
      for (const slot of stages.values()) {
        slot.animating = allowed && slot.visible && slot.cars.length>0;
        slot.node.classList.toggle('v4-map-animated',slot.animating);
        if(slot.animating) running = true;
      }
      for (const activity of activities.values()) {
        const play=allowed && activity.slot.visible && activity.visible;
        const loaded=activity.image.hasAttribute('src');
        if(play&&!loaded)activity.image.src=activity.image.dataset.v4GifSrc;
        else if(!play&&loaded)activity.image.removeAttribute('src');
      }
      if (running && !frame) frame = requestAnimationFrame(frameTick);
      if (!running && frame) { cancelAnimationFrame(frame); frame=0; previous=0; }
    }

    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
      for (const {target} of entries) {
        const slot=stages.get(target);
        if (slot) { slot.bounds=mapBounds(target); paint(slot); }
      }
    }) : null;
    const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        const slot=stages.get(entry.target);
        if (slot) slot.visible = entry.isIntersecting && entry.intersectionRatio>.08;
        const activity=activities.get(entry.target);
        if (activity) activity.visible = entry.isIntersecting && entry.intersectionRatio>0;
      }
      motion();
    },{threshold:[0,.09]}) : null;

    function update() {
      const nodes = new Set(host.querySelectorAll('[data-v4-map-key]'));
      for (const [node] of stages) {
        if (nodes.has(node)) continue;
        resize?.unobserve(node);
        intersection?.unobserve(node);
        stages.delete(node);
        if (sequence?.slot.node===node) clearGesture();
      }
      for (const [node,activity] of activities) {
        if (nodes.has(activity.slot.node)) continue;
        intersection?.unobserve(node);
        activity.image.removeAttribute('src');
        activities.delete(node);
      }
      for (const node of nodes) {
        if (stages.has(node)) continue;
        const key = node.dataset.v4MapKey;
        const slot = {key,node,world:node.querySelector('.v4-map-world'),bounds:mapBounds(node),
          visible:!intersection,animating:false,elapsed:0,cars:stageCars(node)};
        if (!cameras.has(key)) cameras.set(key,initialCamera());
        stages.set(node,slot);
        resize?.observe(node);
        intersection?.observe(node);
        for (const image of node.querySelectorAll('[data-v4-gif-src]')) {
          const area=image.parentElement;
          activities.set(area,{slot,image,visible:!intersection});
          intersection?.observe(area);
        }
        paint(slot);
      }
      motion();
    }

    function slotFor(event) {
      const target=event.target;
      const viewport=target.closest?.('[data-v4-map-key]') || (target.closest?.('[data-v4-camera]') ?
        target.closest('.v4-map')?.querySelector('[data-v4-map-key]') : null);
      return stages.get(viewport);
    }

    function local(event, node) {
      const {left,top} = node.getBoundingClientRect();
      return {x:event.clientX-left,y:event.clientY-top};
    }

    function clearGesture() {
      sequence?.slot.node.classList.remove('v4-map-dragging');
      pointers.clear();
      sequence = null;
    }

    function midpoint([a,b]) {
      return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    }

    function distance(a,b) {
      return Math.hypot(b.x-a.x,b.y-a.y);
    }

    function capture(node, pointerId) {
      if (node.hasPointerCapture(pointerId)) return;
      try { node.setPointerCapture(pointerId); }
      catch (_) { /* Pointer ended before the delegated handler. */ }
    }

    function begin(event) {
      const slot=slotFor(event);
      if (!slot?.bounds || event.target.closest('[data-v4-camera]') || (event.pointerType==='mouse'&&event.button!==0)) return;
      if (pointers.size>=2 || (sequence && sequence.slot!==slot)) return;
      if (!pointers.size) suppressedUntil=0;
      const point=local(event,slot.node);
      pointers.set(event.pointerId,point);
      if (pointers.size === 1) {
        sequence={slot,point,anchor:anchorAt(point,camera(slot),slot.bounds),zoom:camera(slot).zoom,dragging:false,pinch:false};
      } else if (pointers.size === 2) {
        const pair=[...pointers.values()], centre=midpoint(pair);
        sequence={slot,point:centre,anchor:anchorAt(centre,camera(slot),slot.bounds),zoom:camera(slot).zoom,
          distance:Math.max(1,distance(...pair)),dragging:true,pinch:true};
        slot.node.classList.add('v4-map-dragging');
        for (const id of pointers.keys()) capture(slot.node,id);
      }
    }

    function apply(slot,next) {
      cameras.set(slot.key,next);
      paint(slot);
    }

    function move(event) {
      if (!sequence || !pointers.has(event.pointerId)) return;
      const {slot,anchor,zoom} = sequence, point=local(event,slot.node);
      pointers.set(event.pointerId,point);
      if (!sequence.dragging && distance(sequence.point,point)<DRAG_THRESHOLD) return;
      sequence.dragging=true;
      capture(slot.node,event.pointerId);
      slot.node.classList.add('v4-map-dragging');
      if (event.cancelable) event.preventDefault();
      const pair=[...pointers.values()].slice(0,2);
      if (sequence.pinch && pair.length===2) {
        apply(slot,cameraAt(anchor,midpoint(pair),zoom*distance(...pair)/sequence.distance,slot.bounds));
      } else {
        apply(slot,cameraAt(anchor,point,zoom,slot.bounds));
      }
    }

    function end(event) {
      if (!sequence || !pointers.has(event.pointerId)) return;
      const {slot,dragging} = sequence;
      if (dragging) {
        suppressedKey=slot.key;
        suppressedUntil=performance.now()+400;
      }
      pointers.delete(event.pointerId);
      if (pointers.size!==1) {
        if (!pointers.size) clearGesture();
        return;
      }
      const point=[...pointers.values()][0];
      sequence={slot,point,anchor:anchorAt(point,camera(slot),slot.bounds),zoom:camera(slot).zoom,dragging,pinch:false};
    }

    function zoom(slot,factor,point) {
      const {viewW,viewH} = slot.bounds, view=camera(slot);
      const at=point || {x:viewW/2,y:viewH/2};
      apply(slot,cameraAt(anchorAt(at,view,slot.bounds),at,view.zoom*factor,slot.bounds));
    }

    function click(event) {
      const slot=slotFor(event);
      if (!slot?.bounds) return;
      const action=event.target.closest('[data-v4-camera]')?.dataset.v4Camera;
      if (!action) {
        if (event.detail && suppressedKey===slot.key && performance.now()<suppressedUntil) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (action==='reset') apply(slot,initialCamera());
      else zoom(slot,action==='in'?1.32:1/1.32);
    }

    function wheel(event) {
      const slot=slotFor(event);
      if (!slot?.bounds || event.ctrlKey || event.metaKey || event.target.closest('[data-v4-camera]')) return;
      if (event.cancelable) event.preventDefault();
      const units=event.deltaMode===1?16:event.deltaMode===2?200:1;
      zoom(slot,Math.exp(clamp(-event.deltaY*units*.0023,-.36,.36)),local(event,slot.node));
    }

    function keyboard(event) {
      const slot=stages.get(event.target);
      if (!slot?.bounds || event.ctrlKey || event.metaKey || event.altKey) return;
      const view=camera(slot);
      if (event.key==='+' || event.key==='=') zoom(slot,1.32);
      else if (event.key==='-' || event.key==='−') zoom(slot,1/1.32);
      else if (event.key==='Home' || event.key==='0') apply(slot,initialCamera());
      else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
        const shift=(event.shiftKey ? .16 : .07)/view.zoom;
        apply(slot,{...view,
          x:fraction(view.x+(event.key==='ArrowRight'?shift:event.key==='ArrowLeft'?-shift:0)),
          y:fraction(view.y+(event.key==='ArrowDown'?shift:event.key==='ArrowUp'?-shift:0))});
      } else return;
      event.preventDefault();
    }

    function focusPin(event) {
      const target=event.target;
      if (!target.matches('.v4-map-pin') || !target.matches(':focus-visible')) return;
      const slot=slotFor(event);
      if (!slot?.bounds) return;
      const pinBox=target.getBoundingClientRect(), viewBox=slot.node.getBoundingClientRect();
      if (pinBox.left>=viewBox.left && pinBox.right<=viewBox.right &&
          pinBox.top>=viewBox.top && pinBox.bottom<=viewBox.bottom) return;
      apply(slot,{...camera(slot),x:Number(target.style.getPropertyValue('--map-x')),
        y:Number(target.style.getPropertyValue('--map-y'))});
    }

    function focus(key,{x=.5,y=.5,zoom=MIN_ZOOM}={}) {
      const next={x:fraction(x),y:fraction(y),zoom:clamp(zoom,MIN_ZOOM,MAX_ZOOM)};
      cameras.set(key,next);
      for (const slot of stages.values()) if(slot.key===key) paint(slot);
    }

    const events=[['pointerdown',begin,false],['pointermove',move,settings],['click',click,true],
      ['wheel',wheel,settings],['keydown',keyboard,false],['focusin',focusPin,false]];
    for (const [event,callback,options] of events) host.addEventListener(event,callback,options);
    root.addEventListener('pointerup',end,true);
    root.addEventListener('pointercancel',end,true);
    const observer = new MutationObserver(records => {
      const changes=records.filter(record=>!record.target.closest?.('[data-v4-vehicle],[data-v3-coach-holes]'));
      if (changes.some(record=>record.type==='childList')) update();
      else if (changes.length) motion();
    });
    observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    const onWindowResize=()=>{
      for (const slot of stages.values()) { slot.bounds=mapBounds(slot.node); paint(slot); }
    };
    if (!resize) root.addEventListener('resize',onWindowResize);
    reduce.addEventListener('change',motion);
    connection?.addEventListener?.('change',motion);
    document.addEventListener('visibilitychange',motion);
    const controls={update,focus,destroy(){
      observer.disconnect();
      intersection?.disconnect();
      resize?.disconnect();
      for (const [event,callback,options] of events) host.removeEventListener(event,callback,options);
      root.removeEventListener('pointerup',end,true);
      root.removeEventListener('pointercancel',end,true);
      if (!resize) root.removeEventListener('resize',onWindowResize);
      reduce.removeEventListener('change',motion);
      connection?.removeEventListener?.('change',motion);
      document.removeEventListener('visibilitychange',motion);
      if (frame) cancelAnimationFrame(frame);
      clearGesture();
      for (const activity of activities.values()) activity.image.removeAttribute('src');
      activities.clear();
      stages.clear();
      cameras.clear();
      worlds.delete(host);
    }};
    worlds.set(host,controls);
    update();
    return controls;
  }

  const map = {render,attach,schoolRoads,ambientRoads,sitePoint,transform,anchorAt,cameraAt};
  G.V4Map = map;
  if(typeof module!=='undefined'&&module.exports) module.exports=map;
})(globalThis);
