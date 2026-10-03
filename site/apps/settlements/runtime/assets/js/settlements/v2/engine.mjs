/**
 * Система расселения 2.0 — pure, deterministic teaching game.
 * Census values are never mutated. All prices, capacities and effects below
 * are scenario parameters, not construction estimates or demographic forecasts.
 * Transport is the supplied teaching-neighbors graph, NOT a navigation graph.
 */
export const VERSION = 'settlements-2.0.0';
export const SERVICES = ['medical', 'school', 'culture'];
export const CATALOG = Object.freeze({
  medical: {name:'Клиника', verb:'Построить клинику', art:'O-01-ready', upgradeArt:'O-02-ready', cost:32, capacity:2000, walk:35, time:60, staff:18},
  school: {name:'Школа', verb:'Построить школу', art:'O-03-ready', upgradeArt:'O-04-ready', cost:48, capacity:260, walk:30, time:55, staff:24},
  culture: {name:'Общественный центр', verb:'Построить центр', art:'O-05-ready', upgradeArt:'O-06-ready', cost:22, capacity:1800, walk:35, time:60, staff:8},
  bus: {name:'Автобус', verb:'Запустить маршрут', art:'O-09', cost:5},
  outreach: {name:'Выездной врач', verb:'Организовать выезды', art:'O-10', cost:9, capacity:500, staff:3},
});
export const CHAPTERS = [
  {service:'medical',title:'Врач рядом',task:'Дайте жителям доступ к медицине',threshold:.72,settlementThreshold:.65,reward:175,art:'R-01-after',insight:'Один центр может обслуживать несколько поселений.'},
  {service:'school',title:'Дорога к знаниям',task:'Сделайте образование доступным',threshold:.72,settlementThreshold:.65,reward:100,art:'R-02-after',insight:'Подвоз помогает использовать уже построенную школу.'},
  {service:'culture',title:'Место для жизни',task:'Завершите сеть повседневных услуг',threshold:.70,settlementThreshold:.65,reward:0,art:'F-03',insight:'Удобное положение может сделать небольшой посёлок межпоселенческим центром.'},
];
const clone = value => structuredClone(value);
const round = x => Math.round(x*10)/10;
const finite = (x, fallback=0) => Number.isFinite(x)?x:fallback;
export function haversine(a,b){
  const rad=Math.PI/180, dlat=(b.lat-a.lat)*rad,dlon=((b.lon-a.lon+540)%360-180)*rad;
  return 6371.0088*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2)));
}
export function change(row){
  if(row.territoryComparable===false || !Number.isFinite(row.population2010)||row.population2010<=0||!Number.isFinite(row.population)) return null;
  return (row.population-row.population2010)/row.population2010*100;
}
export function trend(row){const x=change(row);return x===null?'unknown':x>3?'grow':x< -3?'decline':'stable';}
export function demand(row,service){return Math.max(0,finite(row.population))*(service==='school'?.16:1);}
export function hash(text){let h=2166136261;for(const c of String(text))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
class Heap {
  constructor(){this.a=[];}
  push(item){let i=this.a.length;this.a.push(item);while(i){const p=(i-1)>>1;if(this.a[p][0]<=item[0])break;this.a[i]=this.a[p];i=p;}this.a[i]=item;}
  pop(){const top=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1][0]<this.a[j][0])j++;if(this.a[j][0]>=last[0])break;this.a[i]=this.a[j];i=j;}this.a[i]=last;}return top;}
  get size(){return this.a.length;}
}
export class World {
  constructor(pack,network){
    if(!pack?.region?.id||!Array.isArray(pack.settlements)||!pack.settlements.length)throw new Error('Некорректный региональный набор');
    this.region=clone(pack.region);this.rows=pack.settlements.map((r,index)=>({...r,index}));
    this.ids=new Map(this.rows.map((r,i)=>[r.id,i]));this.walk=this.rows.map(()=>[]);this.drive=this.rows.map(()=>[]);this.routeCache=new Map();
    this.networkStatus=network?.status||'unavailable';this.networkVersion=network?.networkVersion||'none';
    this.valid=this.rows.filter(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lon)&&Math.abs(r.lat)<=90&&Math.abs(r.lon)<=180);
    const sourceNodes=network?.nodes||[],map=sourceNodes.map(n=>this.ids.get(n[0]));
    for(const edge of network?.edges||[]){const [a,b,minutes,mode]=edge,ai=map[a],bi=map[b];if(ai===undefined||bi===undefined||!Number.isFinite(minutes)||minutes<=0)continue;
      (mode===1?this.drive:this.walk)[ai].push([bi,minutes]);}
    // Missing network remains explicit: local facilities still work; routes do not
    // silently cross water or invent geographic links.
    this.focusCache=pack.mission?.ids?.every(id=>this.ids.has(id)) ? clone(pack.mission) : null;
  }
  row(id){const i=this.ids.get(id);return i===undefined?null:this.rows[i];}
  shortest(start,adj,limit=Infinity,stop=-1){
    const n=this.rows.length,dist=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),heap=new Heap();dist[start]=0;heap.push([0,start]);
    while(heap.size){const [d,i]=heap.pop();if(d!==dist[i]||d>limit)continue;if(i===stop)break;
      for(const [j,w] of adj[i]||[]){const nd=d+w;if(nd<dist[j]&&nd<=limit){dist[j]=nd;prev[j]=i;heap.push([nd,j]);}}
    }return {dist,prev};
  }
  access(start,adj,totalLimit,walkLimit){
    const stride=walkLimit+1,n=this.rows.length,labels=new Float64Array(n*stride).fill(Infinity),dist=new Float64Array(n).fill(Infinity),heap=new Heap();
    labels[start*stride]=0;dist[start]=0;heap.push([0,start,0]);
    while(heap.size){const [d,i,w]=heap.pop();if(d!==labels[i*stride+w])continue;
      for(const [j,t,mode] of adj[i]){const nw=w+(mode===1?0:Math.ceil(t)),nd=d+t;if(nw>walkLimit||nd>totalLimit)continue;
        const key=j*stride+nw;if(nd>=labels[key])continue;
        // Discard labels dominated by a path that uses no more walking or time.
        let dominated=false;for(let k=0;k<=nw;k++)if(labels[j*stride+k]<=nd){dominated=true;break;}if(dominated)continue;
        labels[key]=nd;if(nd<dist[j])dist[j]=nd;heap.push([nd,j,nw]);
      }
    }return dist;
  }
  route(from,to){
    if(from===to)return null;const key=`${from}>${to}`;if(this.routeCache.has(key))return this.routeCache.get(key);
    const a=this.ids.get(from),b=this.ids.get(to);if(a===undefined||b===undefined)return null;
    const {dist,prev}=this.shortest(a,this.drive,240,b);if(!Number.isFinite(dist[b])){this.routeCache.set(key,null);return null;}
    const indices=[];let i=b;while(i>=0){indices.push(i);if(i===a)break;i=prev[i];}indices.reverse();
    const path=indices.map(i=>this.rows[i].id);let km=0;for(let k=1;k<indices.length;k++)km+=haversine(this.rows[indices[k-1]],this.rows[indices[k]])*1.33;
    const route={from,to,path,minutes:dist[b],km:round(km),cost:round(5+dist[b]*.18),status:'teaching'};
    this.routeCache.set(key,route);return route;
  }
  focus(){
    if(this.focusCache)return clone(this.focusCache);
    const inhabited=this.valid.filter(r=>r.population>0),n=Math.min(14,Math.max(9,8+(this.region.difficulty||1)*2),inhabited.length);
    const candidates=inhabited.filter(r=>r.population>=500&&r.population<=2300);
    const base=candidates.length?candidates:inhabited.filter(r=>r.population<=5000);
    const sampled=(base.length?base:inhabited).filter((_,i)=>i%Math.max(1,Math.ceil(base.length/180))===0);
    let best=null;
    for(const center of sampled){
      const near=inhabited.filter(r=>r.id===center.id||r.population<=1800).map(r=>({r,d:haversine(r,center)})).sort((a,b)=>a.d-b.d||a.r.id.localeCompare(b.r.id)).filter(x=>x.d<=25||x.r.id===center.id).slice(0,n);
      if(!near.length)continue;
      const maxD=near.at(-1).d,pop=near.reduce((s,x)=>s+x.r.population,0),micro=near.filter(x=>x.r.population<500).length;
      const alternative=near.filter(x=>x.r.id!==center.id&&x.r.population>=500).length;
      const score=Math.max(0,Math.min(6,n)-near.length)*1.5+Math.abs(pop-4400)/1300+Math.max(0,maxD-14)*.6+Math.max(0,4-maxD)+Math.max(0,4-micro)*.8+(alternative?0:2)+hash(center.id)%100/1000;
      if(!best||score<best.score)best={score,center:center.id,ids:near.map(x=>x.r.id)};
    }
    this.focusCache=best||{center:inhabited[0]?.id||this.rows[0].id,ids:inhabited.slice(0,n).map(r=>r.id)};
    return clone(this.focusCache);
  }
}
export function createState(world,{owner='guest:settlements-v2',attemptId=`v2-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}={}){
  const focus=world.focus();return {version:VERSION,owner,attemptId,regionId:world.region.id,chapter:0,budget:150,spent:0,turn:0,
    focus:focus.ids,focusCenter:focus.center,facilities:[],routes:[],actions:[],milestones:[],status:'playing'};
}
export function facilityCost(row,type){
  const spec=CATALOG[type];if(!spec)throw new Error('Неизвестный объект');
  const p=Math.max(0,finite(row.population)),staffPenalty=Math.max(0,(500-p)/500)*.85;
  const declinePenalty=Math.min(.12,Math.max(0,-finite(change(row))-3)/150);
  return round(spec.cost*(1+staffPenalty+declinePenalty));
}
export function staffNote(row){return row.population<500?'Нужен привлечённый персонал':trend(row)==='decline'?'Заложена поддержка персонала':'Персонал учтён в стоимости';}
function capacity(f){return CATALOG[f.type].capacity*(1+.8*(f.level-1));}
export function evaluate(world,state){
  const n=world.rows.length,adj=world.walk.map(a=>a.map(([j,t])=>[j,t,0]));
  for(const route of state.routes)for(let k=1;k<route.path.length;k++){
    const a=world.ids.get(route.path[k-1]),b=world.ids.get(route.path[k]);if(a===undefined||b===undefined)continue;
    const ab=world.drive[a].find(([j])=>j===b)?.[1];const ba=world.drive[b].find(([j])=>j===a)?.[1];
    if(ab!==undefined)adj[a].push([b,ab,1]);if(ba!==undefined)adj[b].push([a,ba,1]);
  }
  const services={},facilityUsage={},facilityReach={},assignments={};
  for(const service of SERVICES){
    const served=new Float64Array(n),need=world.rows.map(r=>demand(r,service)),offers=[];
    const facilities=state.facilities.filter(f=>f.type===service||service==='medical'&&f.type==='outreach');
    for(const f of facilities){
      const index=world.ids.get(f.at),available=capacity(f);if(index===undefined)continue;
      facilityUsage[f.id]={used:0,capacity:available,service};
      const time=f.type==='outreach'?0:CATALOG[service].time;
      const ds=world.access(index,adj,time,f.type==='outreach'?0:CATALOG[service].walk);facilityReach[f.id]=ds;
      for(let i=0;i<n;i++)if(need[i]>0&&Number.isFinite(ds[i])){
        // Walking and total trip limits are independently enforced, even when
        // an unrelated bus exists elsewhere on the map.
        offers.push([ds[i],i,f.id]);
      }
    }
    offers.sort((a,b)=>a[0]-b[0]||world.rows[a[1]].id.localeCompare(world.rows[b[1]].id)||a[2].localeCompare(b[2]));
    const assignment=world.rows.map(()=>[]);
    for(const [time,i,id] of offers){const f=facilityUsage[id],take=Math.min(need[i]-served[i],f.capacity-f.used);if(take>.000001){served[i]+=take;f.used+=take;assignment[i].push({id,units:take,time});}}
    let population=0,accessible=0,settlements=0,fullyServed=0;
    for(let i=0;i<n;i++){const p=Math.max(0,finite(world.rows[i].population));population+=p;accessible+=need[i]?served[i]/need[i]*p:0;if(p>0){settlements++;if(need[i]>0&&served[i]>=need[i]*.8)fullyServed++;}}
    services[service]={served,need,population,accessible:Math.round(accessible),settlements,fullyServed};assignments[service]=assignment;
  }
  const focusRows=state.focus.map(id=>world.row(id)).filter(r=>r&&r.population>0),focus={};
  for(const service of SERVICES){let population=0,accessible=0,covered=0;
    for(const row of focusRows){const i=row.index,s=services[service],share=s.need[i]>0?Math.min(1,s.served[i]/s.need[i]):0;population+=row.population;accessible+=share*row.population;if(share>=.8)covered++;}
    focus[service]={population,accessible:Math.round(accessible),ratio:population?accessible/population:1,covered,total:focusRows.length,settlementRatio:focusRows.length?covered/focusRows.length:1};
  }
  const chapter=CHAPTERS[state.chapter]||CHAPTERS[2],active=focus[chapter.service];
  let progress=Math.min(1,active.ratio/chapter.threshold,active.settlementRatio/chapter.settlementThreshold);
  if(state.chapter===2)for(const s of SERVICES)progress=Math.min(progress,focus[s].ratio/.7,focus[s].settlementRatio/.65);
  return {services,focus,facilityUsage,facilityReach,assignments,progress:Math.max(0,progress),complete:progress>=.999999};
}
export function quote(world,state,action){
  if(state.status==='completed')return {ok:false,reason:'Поручение завершено. Продолжите в свободном режиме.'};
  if(!action||typeof action.type!=='string')return {ok:false,reason:'Выберите действие'};
  if(action.type==='build'){
    const row=world.row(action.at),kind=action.kind;if(!row||!CATALOG[kind]||kind==='bus')return {ok:false,reason:'Выберите населённый пункт'};
    if(state.facilities.some(f=>f.at===action.at&&f.type===kind))return {ok:false,reason:'Объект уже есть. Его можно расширить.'};
    const cost=facilityCost(row,kind);return {ok:cost<=state.budget,reason:cost>state.budget?'Не хватает бюджета':null,cost,staff:CATALOG[kind].staff,note:staffNote(row)};
  }
  if(action.type==='upgrade'){
    const f=state.facilities.find(f=>f.id===action.id);if(!f)return {ok:false,reason:'Сначала выберите свой объект'};
    if(f.level>=3)return {ok:false,reason:'Достигнута максимальная мощность'};
    const cost=round(CATALOG[f.type].cost*.52);return {ok:cost<=state.budget,reason:cost>state.budget?'Не хватает бюджета':null,cost};
  }
  if(action.type==='route'){
    const route=world.route(action.from,action.to);if(!route)return {ok:false,reason:action.from===action.to?'Выберите второе поселение':'Связь отсутствует в учебной транспортной сети'};
    if(state.routes.some(r=>(r.from===route.from&&r.to===route.to)||(r.from===route.to&&r.to===route.from)))return {ok:false,reason:'Маршрут уже работает'};
    return {...route,ok:route.cost<=state.budget,reason:route.cost>state.budget?'Не хватает бюджета':null};
  }
  return {ok:false,reason:'Неизвестное действие'};
}
export function apply(world,input,action,{record=true}={}){
  const q=quote(world,input,action);if(!q.ok)throw new Error(q.reason||'Действие недоступно');
  const state=clone(input);state.turn++;state.budget=round(state.budget-q.cost);state.spent=round(state.spent+q.cost);
  if(action.type==='build')state.facilities.push({id:`f${state.turn}`,at:action.at,type:action.kind,level:1,created:state.turn});
  if(action.type==='upgrade')state.facilities.find(f=>f.id===action.id).level++;
  if(action.type==='route')state.routes.push({id:`r${state.turn}`,from:action.from,to:action.to,path:q.path,minutes:q.minutes,km:q.km,cost:q.cost,created:state.turn,status:'teaching'});
  if(record)state.actions.push(clone(action));return state;
}
export function preview(world,state,action,before){
  const q=quote(world,state,action);if(q.cost===undefined)return {...q};
  // Preview remains available even when the budget is insufficient.
  let proposed;try{proposed=apply(world,{...state,budget:Math.max(state.budget,q.cost)},action,{record:false});}catch{return q;}
  const a=before||evaluate(world,state),b=evaluate(world,proposed),service=action.kind==='outreach'?'medical':SERVICES.includes(action.kind)?action.kind:((state.facilities.find(f=>f.id===action.id)?.type==='outreach'?'medical':state.facilities.find(f=>f.id===action.id)?.type))||CHAPTERS[state.chapter]?.service||'medical';
  const gains={},losses={};const affected=new Set();let gained=0,lost=0;
  for(const s of SERVICES){const ids=[],x=a.services[s],y=b.services[s];let people=0;
    for(let i=0;i<world.rows.length;i++)if(y.served[i]>x.served[i]+.01){ids.push(world.rows[i].id);affected.add(world.rows[i].id);people+=(y.served[i]-x.served[i])/y.need[i]*world.rows[i].population;}
    gains[s]={people:Math.round(people),ids};let loss=0;const lossIds=[];for(let i=0;i<world.rows.length;i++)if(y.served[i]<x.served[i]-.01){loss+=(x.served[i]-y.served[i])/y.need[i]*world.rows[i].population;lossIds.push(world.rows[i].id);}losses[s]={people:Math.round(loss),ids:lossIds};if(s===service){gained=Math.round(people);lost=Math.round(loss);}
  }
  return {...q,service,gains,losses,people:gained,lost,affected:[...affected],evaluation:b,proposed,
    focusGain:Math.max(0,b.focus[service]?.accessible-a.focus[service]?.accessible)};
}
export function advance(world,input){
  if(input.status!=='playing')throw new Error('Поручение уже завершено');
  const e=evaluate(world,input);if(!e.complete)throw new Error('Поручение пока не выполнено');
  const state=clone(input);state.milestones.push({chapter:state.chapter,turn:state.turn});
  state.actions.push({type:'advance'});
  if(state.chapter>=2){state.status='completed';return state;}
  state.budget=round(state.budget+CHAPTERS[state.chapter].reward);state.chapter++;return state;
}
export function restore(world,snapshot,{owner}={}){
  if(!snapshot||snapshot.version!==VERSION||snapshot.regionId!==world.region.id||!Array.isArray(snapshot.actions))throw new Error('Сохранение относится к другой версии или территории');
  if(owner&&snapshot.owner!==owner)throw new Error('Сохранение принадлежит другому профилю');
  if(snapshot.actions.length>1000)throw new Error('Слишком большое сохранение');
  let state=createState(world,{owner:snapshot.owner,attemptId:snapshot.attemptId});
  for(const a of snapshot.actions){if(a.type==='advance')state=advance(world,state);else if(a.type==='continue'){if(state.status!=='completed')throw new Error('Некорректное продолжение');state=continueFree(state);}else state=apply(world,state,a);}
  return state;
}
export function undo(world,state){
  if(!state.actions.length)return state;
  const actions=state.actions.slice();while(actions.at(-1)?.type==='advance'||actions.at(-1)?.type==='continue')actions.pop();actions.pop();
  return restore(world,{...state,actions},{owner:state.owner});
}
export function continueFree(input){if(input.status!=='completed')throw new Error('Сначала завершите поручение');const state=clone(input);state.status='free';state.budget=round(state.budget+200);state.actions.push({type:'continue'});return state;}
export function scenarioTrend(row,evaluation,index){
  const historical=change(row);if(historical===null)return {historical:null,scenario:null,improvement:0};
  const annual= Math.max(-8,Math.min(8,((Math.max(.01,row.population/row.population2010))**(1/11)-1)*100));
  let access=0;for(const s of SERVICES){const e=evaluation.services[s];access+=e.need[index]>0?Math.min(1,e.served[index]/e.need[index]):0;}
  const improvement=.18*access;return {historical:annual,scenario:annual+improvement,improvement};
}
export function result(world,state){
  const e=evaluate(world,state);const finished=state.status==='completed'||state.status==='free';const mean=SERVICES.reduce((s,k)=>s+Math.min(1,e.focus[k].ratio),0)/3;
  return {version:VERSION,attemptId:state.attemptId,regionId:world.region.id,region:world.region.name,complete:finished,
    scope:'teaching-local-mission',maxPoints:world.region.maxPoints||3,points:finished?(world.region.maxPoints||3):0,
    coverage:mean,focusSettlementCount:state.focus.length,regionSettlementCount:world.rows.length,spentMillion:state.spent,
    facilities:state.facilities.length,routes:state.routes.length,turns:state.turn,verification:'local-deterministic-replay',
    focus:clone(e.focus),actions:clone(state.actions)};
}
