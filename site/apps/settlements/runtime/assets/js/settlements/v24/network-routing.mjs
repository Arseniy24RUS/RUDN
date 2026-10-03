/** 3.4 routing on the unchanged directed teaching graph. No display geometry. */
const cmp=(a,b)=>a<b?-1:a>b?1:0;
export const canonicalNetworkEdge=(a,b)=>cmp(a,b)<0?`${a}|${b}`:`${b}|${a}`;
export const activeNetworkEdges=routes=>new Set(routes.flatMap(route=>route.path.slice(1).map((id,i)=>canonicalNetworkEdge(route.path[i],id))));
const compareLabel=(a,b)=>a.price-b.price||a.metres-b.metres||a.minutes-b.minutes||cmp(a.key,b.key);
class Heap {
  constructor(){this.items=[];}
  push(value){let i=this.items.length;this.items.push(value);while(i){const parent=(i-1)>>1;if(compareLabel(this.items[parent],value)<=0)break;this.items[i]=this.items[parent];i=parent;}this.items[i]=value;}
  pop(){const first=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(i*2+1<this.items.length){let next=i*2+1;if(next+1<this.items.length&&compareLabel(this.items[next+1],this.items[next])<0)next++;if(compareLabel(last,this.items[next])<=0)break;this.items[i]=this.items[next];i=next;}this.items[i]=last;}return first;}
  get size(){return this.items.length;}
}

function edgeTerms(policy,key,active){
  const metres=policy?.distanceMeters?.[key],required=policy?.roadRequired?.[key];
  if(!Number.isSafeInteger(metres)||metres<0||typeof required!=='boolean')throw new Error('Для участка не заданы транспортные условия');
  return {metres,price:active.has(key)?0:Math.floor((metres+250)/500)+(required?Math.floor((6*metres+250)/500):0)};
}

export function validateInitialNetworkRoute(world,route){
  const path=route?.path;
  if(!Array.isArray(path)||path.length<2||path.some(id=>typeof id!=='string'||!world.ids.has(id))||route.from!==path[0]||route.to!==path.at(-1))
    throw new Error('Некорректный исходный маршрут');
  for(let i=1;i<path.length;i++){
    const from=world.ids.get(path[i-1]),to=world.ids.get(path[i]);
    if(!world.drive[from].some(([id])=>id===to))throw new Error('Исходный маршрут отсутствует в направленной учебной сети');
  }
  return {from:route.from,to:route.to,path:[...path]};
}

function targetNodes(world,active,action){
  let targets;
  if(action.type==='connect-network'){
    const pair=action.targetEdge;
    if(!Array.isArray(pair)||pair.length!==2||pair[0]===pair[1]||pair.some(id=>typeof id!=='string'||!world.ids.has(id)))
      throw new Error('Выберите действующий участок сети');
    const [u,v]=pair.map(id=>world.ids.get(id));
    if(!active.has(canonicalNetworkEdge(...pair))||!world.drive[u].some(([to])=>to===v)&&!world.drive[v].some(([to])=>to===u))
      throw new Error('Выбранный участок сети ещё не работает');
    targets=[u,v];
  }else{
    if(typeof action.to!=='string'||!world.ids.has(action.to))throw new Error('Поселение отсутствует в регионе');
    if(action.from===action.to)throw new Error('Выберите второе поселение');
    targets=[world.ids.get(action.to)];
  }
  // Only predecessors with a real active directed path can be valid joins.
  // An arbitrary member of the same undirected component would create access.
  const reverse=world.rows.map(()=>[]);
  for(let from=0;from<world.rows.length;from++)for(const [to] of world.drive[from])
    if(active.has(canonicalNetworkEdge(world.rows[from].id,world.rows[to].id)))reverse[to].push(from);
  const reachable=new Set(targets),queue=[...targets];
  for(let i=0;i<queue.length;i++)for(const from of reverse[queue[i]])if(!reachable.has(from)){reachable.add(from);queue.push(from);}
  return reachable;
}

export function networkRoute(world,policy,routes,action){
  if(!action||!['connect','connect-network'].includes(action.type)||typeof action.from!=='string'||!world.ids.has(action.from))
    throw new Error('Поселение отсутствует в регионе');
  const active=activeNetworkEdges(routes),targets=targetNodes(world,active,action),start=world.ids.get(action.from);
  const best=new Array(world.rows.length),heap=new Heap(),first={node:start,price:0,metres:0,minutes:0,key:action.from,path:[action.from]};
  best[start]=first;heap.push(first);
  while(heap.size){
    const current=heap.pop();if(best[current.node]!==current)continue;
    if(targets.has(current.node)){
      const edgeKeys=current.path.slice(1).map((id,i)=>canonicalNetworkEdge(current.path[i],id));
      const freshEdgeKeys=[...new Set(edgeKeys.filter(key=>!active.has(key)))],freshPath=[];
      let run=null;
      for(let i=0;i<edgeKeys.length;i++){
        if(active.has(edgeKeys[i])){run=null;continue;}
        if(!run){run=[current.path[i]];freshPath.push(run);}run.push(current.path[i+1]);
      }
      return {from:action.from,to:current.path.at(-1),joinId:current.path.at(-1),path:current.path,
        requestedTo:action.type==='connect'?action.to:null,
        ...(action.type==='connect-network'?{targetEdge:[...action.targetEdge].sort(cmp)}:{}),
        edgeKeys,freshEdgeKeys,freshPath,minutes:current.minutes,distanceKm:current.metres/1000,cost:current.price/10};
    }
    for(const [to,minutes] of world.drive[current.node]){
      const id=world.rows[to].id,key=canonicalNetworkEdge(world.rows[current.node].id,id),terms=edgeTerms(policy,key,active);
      const candidate={node:to,price:current.price+terms.price,metres:current.metres+terms.metres,minutes:current.minutes+minutes,
        key:`${current.key}\0${id}`,path:[...current.path,id]};
      if(!best[to]||compareLabel(candidate,best[to])<0){best[to]=candidate;heap.push(candidate);}
    }
  }
  return null;
}
