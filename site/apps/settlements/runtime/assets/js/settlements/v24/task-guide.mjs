/** Optional regional guidance. It never changes state, prices or victory. */
export const TASK_SERVICES=Object.freeze(['telecom','medical','school','culture']);

function pending(world,evaluation){
  return TASK_SERVICES.map(service=>[...new Set(evaluation.services[service]?.missingIds||[])]
    .filter(id=>{const row=world.row(id),status=evaluation.byId[id]?.[service];return row?.population>0&&Number.isFinite(row.population)&&status?.demand>0&&!status.full;})
    .sort((a,b)=>world.row(b).population-world.row(a).population||(a<b?-1:a>b?1:0))
    .map(id=>Object.freeze({key:`${service}/${id}`,service,id,population:world.row(id).population})));
}

function interleave(lists){
  const result=[],length=Math.max(0,...lists.map(list=>list.length));
  for(let rank=0;rank<length;rank++)for(const list of lists)if(list[rank])result.push(list[rank]);
  return result;
}

/** The cursor is navigation only. Engine state remains authoritative for every
 * deficit. One cursor per action revision makes undo and UI save replay exact. */
export function createTaskGuide(world,initialEvaluation,{saved=null,revision=0}={}){
  const queue=Object.freeze(interleave(pending(world,initialEvaluation)));
  const valid=saved?.version===1&&Array.isArray(saved.history)&&saved.history.length===revision+1&&saved.history[0]===0&&saved.history.every(n=>Number.isInteger(n)&&n>=0&&n<TASK_SERVICES.length);
  const history=valid?saved.history.slice():Array.from({length:revision+1},()=>0);
  let lastEvaluation=null,lastResult=null;
  return Object.freeze({
    queue,
    read(evaluation){
      if(evaluation===lastEvaluation)return lastResult;
      const lists=pending(world,evaluation),start=history.at(-1);
      const remaining=interleave([...lists.slice(start),...lists.slice(0,start)]);
      lastEvaluation=evaluation;
      lastResult=Object.freeze({current:remaining[0]||null,remaining:remaining.length,
        total:Math.max(queue.length,remaining.length),
        next:Object.freeze(remaining.slice(0,4))});
      return lastResult;
    },
    advance(before,after){
      const task=this.read(before).current,status=task&&after.byId[task.id]?.[task.service];
      history.push(task&&status?.full?(TASK_SERVICES.indexOf(task.service)+1)%TASK_SERVICES.length:history.at(-1));
      lastEvaluation=null;lastResult=null;
    },
    undo(){if(history.length>1)history.pop();lastEvaluation=null;lastResult=null;},
    export(){return {version:1,history:history.slice()};}
  });
}
