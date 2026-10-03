/** Offline preparation: half a source-graph forest as existing scenario transport. */
import {canonicalTransportEdge} from './transport-policy-v1.mjs';
import {isRemoteSocialRegion} from './social-policy.mjs';
const cmp=(a,b)=>a<b?-1:a>b?1:0;
export function buildInitialSocialNetwork(world,policy){
  const threshold=isRemoteSocialRegion(world)?500:5000;
  const hubs=world.rows.filter(row=>Number.isFinite(row.population)&&row.population>=threshold).sort((a,b)=>cmp(a.id,b.id));
  const candidates=new Map();
  for(const hub of hubs){
    const {dist,prev}=world.shortest(hub.index,world.drive,Infinity);
    const closest=hubs.filter(row=>row.id!==hub.id&&Number.isFinite(dist[row.index])).sort((a,b)=>dist[a.index]-dist[b.index]||cmp(a.id,b.id)).slice(0,3);
    for(const other of closest){const key=canonicalTransportEdge(hub.id,other.id),path=[];let at=other.index;
      while(at>=0){path.push(world.rows[at].id);if(at===hub.index)break;at=prev[at];}path.reverse();
      if(path[0]!==hub.id)continue;
      const keys=path.slice(1).map((id,i)=>canonicalTransportEdge(path[i],id));
      const metres=keys.reduce((sum,key)=>sum+policy.distanceMeters[key],0);
      const requiresRoad=keys.some(key=>policy.roadRequired[key]);
      const price=keys.reduce((sum,key)=>sum+Math.floor((policy.distanceMeters[key]+250)/500)+(policy.roadRequired[key]?Math.floor((6*policy.distanceMeters[key]+250)/500):0),0);
      const candidate={from:hub.id,to:other.id,path,metres,requiresRoad,price};
      const old=candidates.get(key);if(!old||candidate.metres<old.metres||candidate.metres===old.metres&&cmp(candidate.from,old.from)<0)candidates.set(key,candidate);
    }
  }
  const parent=new Map(hubs.map(row=>[row.id,row.id]));
  const find=id=>{let root=id;while(parent.get(root)!==root)root=parent.get(root);while(parent.get(id)!==id){const next=parent.get(id);parent.set(id,root);id=next;}return root;};
  const routes=[];
  for(const route of [...candidates.values()].sort((a,b)=>Number(a.requiresRoad)-Number(b.requiresRoad)||a.price-b.price||cmp(a.from,b.from)||cmp(a.to,b.to))){const a=find(route.from),b=find(route.to);if(a===b)continue;parent.set(a,b);routes.push({from:route.from,to:route.to,path:route.path});}
  return routes.filter((_,i)=>i%2===0);
}
