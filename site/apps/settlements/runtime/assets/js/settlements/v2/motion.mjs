/** Presentation only. No rules, persistence, clocks or DOM writes in this module. */
export const MOTION=Object.freeze({build:800,upgrade:600,route:600,coverage:700,number:320,label:1800,selection:120,maxParticles:24,maxLabels:3,maxVehicles:40});
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const services=['medical','school','culture'];

export function committedEvent(world,before,oldEvaluation,after,evaluation,action,sequence){
  const facility=action.type==='upgrade'?after.facilities.find(f=>f.id===action.id):action.type==='build'?after.facilities.find(f=>f.created===after.turn):null;
  const route=action.type==='route'?after.routes.find(r=>r.created===after.turn):null;
  const service=(facility?.type==='outreach'?'medical':facility?.type)||['medical','school','culture'][after.chapter]||'medical';
  const changes={},gains={},losses={},access={};
  for(const key of services){const old=oldEvaluation.services[key],next=evaluation.services[key];let gain=0,loss=0;changes[key]=[];
    for(const row of world.rows){const i=row.index,delta=next.served[i]-old.served[i];if(Math.abs(delta)<=.01)continue;
      const people=next.need[i]>0?delta/next.need[i]*row.population:0;
      changes[key].push({id:row.id,old:old.served[i],new:next.served[i],need:next.need[i],population:row.population,people});if(people>0)gain+=people;else loss-=people;
    }gains[key]=Math.round(gain);losses[key]=Math.round(loss);access[key]={before:old.accessible,after:next.accessible,net:next.accessible-old.accessible};
  }
  return {actionId:`${after.attemptId}:${sequence}:${after.actions.length}`,attemptId:after.attemptId,actionIndex:after.actions.length,action:JSON.stringify(after.actions.at(-1)),type:action.type,origin:facility?.at||route?.to||action.at,facilityId:facility?.id||null,routeId:route?.id||null,level:facility?.level||null,service,cost:Math.round((before.budget-after.budget)*100)/100,changes,gains,losses,access,people:access[service].net,oldProgress:oldEvaluation.progress,newProgress:evaluation.progress};
}
export const eventIsCurrent=(event,state)=>Boolean(state&&event.attemptId===state.attemptId&&state.actions.length>=event.actionIndex&&JSON.stringify(state.actions[event.actionIndex-1])===event.action);

/** Retarget from the currently displayed sample, including an undo mid-transition. */
export class NumberTransition{
  constructor(){this.from=0;this.target=0;this.started=0;this.duration=0;this.initialized=false;}
  value(now){const t=this.duration?clamp((now-this.started)/this.duration):1;return t===1?this.target:this.from+(this.target-this.from)*(1-(1-t)**3);}
  set(target,now,instant=false){if(this.initialized&&target===this.target&&!instant)return;this.from=this.initialized?this.value(now):target;this.target=target;this.started=now;this.duration=instant||!this.initialized?0:MOTION.number;this.initialized=true;}
  finish(){this.from=this.target;this.duration=0;}
  running(now){return this.duration>0&&now<this.started+this.duration;}
}

/** Lengths are computed once in a fixed map projection, never once per bus/frame. */
export function routeGeometry(points){
  const cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
  return {points,cumulative,total:cumulative.at(-1)||0};
}
export function routeSample(geometry,fraction){
  const {points,cumulative,total}=geometry;if(points.length<2||!total)return null;const distance=clamp(fraction)*total;
  let lo=0,hi=points.length-2;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(cumulative[mid+1]<distance)lo=mid+1;else hi=mid;}
  const a=points[lo],b=points[lo+1],length=cumulative[lo+1]-cumulative[lo],t=length?(distance-cumulative[lo])/length:0;
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,dx:b.x-a.x,dy:b.y-a.y,index:lo};
}
const directions=['e','se','s','sw','w','nw','n','ne'];
/** Retain the current octant across a 7-degree boundary band. */
export function stableDirection(dx,dy,previous){
  if(Math.hypot(dx,dy)<.001)return previous||'se';const angle=Math.atan2(dy,dx),old=directions.indexOf(previous);
  if(old>=0){const difference=Math.atan2(Math.sin(angle-old*Math.PI/4),Math.cos(angle-old*Math.PI/4));if(Math.abs(difference)<Math.PI/8+.1222)return previous;}
  return directions[(Math.round(angle/(Math.PI/4))+8)%8];
}
