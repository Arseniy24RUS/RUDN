/** A small sortable for the three chosen employers. Preview never writes state. */
export function moveWishId(ids,from,to){
  if(!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id))throw new TypeError('Expected up to three unique employer IDs.');
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=ids.length||to>=ids.length)throw new RangeError('Invalid employer position.');
  const next=[...ids];next.splice(to,0,next.splice(from,1)[0]);return next;
}

/** Only filled rows participate; an empty slot cannot become a drop target. */
export function wishTargetIndex(boxes,from,clientY){
  return boxes.reduce((target,box,index)=>index!==from&&clientY>box.top+box.height/2?target+1:target,0);
}

export function createWishSortable({list,status,labels,onCommit}){
  let drag=null,destroyed=false;
  const listeners=[];
  const listen=(node,type,listener,options)=>{node.addEventListener(type,listener,options);listeners.push(()=>node.removeEventListener(type,listener,options));};
  const announce=message=>{if(!destroyed&&status?.isConnected)status.textContent=message;};
  const handleFor=id=>[...list.querySelectorAll('[data-wish-drag-handle]')].find(node=>node.dataset.wishDragHandle===id);
  const rows=()=>[...list.querySelectorAll(':scope > [data-wish-id]')];

  function suppressClickAfterPointer(){
    // A drop may rebuild the list before the browser dispatches its click.
    // Consume that one click at the scoped document, including a retargeted one.
    let timer;
    const release=()=>{document.removeEventListener('click',block,true);clearTimeout(timer);};
    const block=event=>{event.preventDefault();event.stopImmediatePropagation();release();};
    document.addEventListener('click',block,true);
    timer=setTimeout(release,350);
  }

  function clearPreview(session){
    session.rows.forEach((row,index)=>{
      row.style.removeProperty('transform');row.classList.remove('is-wish-dragging');
      row.removeAttribute('data-wish-preview-position');
      row.querySelector('.journey-priority').textContent=String(index+1);
    });
    session.placeholder.remove();list.classList.remove('is-wish-sorting');
    session.handle.setAttribute('aria-pressed','false');
  }

  function finish(commit,{focus=true,announceResult=true}={}){
    const session=drag;if(!session)return;
    drag=null;clearPreview(session);
    if(session.pointerId!==undefined&&session.handle.hasPointerCapture?.(session.pointerId))session.handle.releasePointerCapture(session.pointerId);
    const changed=commit&&session.target!==session.from;
    if(changed){
      const next=moveWishId(session.ids,session.from,session.target);
      const empty=list.querySelector(':scope > li:not([data-wish-id])');
      next.forEach((id,index)=>{const row=session.rows[session.ids.indexOf(id)];list.insertBefore(row,empty);row.querySelector('.journey-priority').textContent=String(index+1);});
      onCommit(next);
    }
    if(focus&&!destroyed)(handleFor(session.id)||session.handle).focus({preventScroll:true});
    if(announceResult)announce(commit?labels.dropped(session.name,session.target+1):labels.cancelled(session.name,session.from+1));
  }

  function preview(){
    const session=drag;if(!session)return;
    // Measure original layout, independent of the previous visual preview.
    session.rows.forEach(row=>row.style.removeProperty('transform'));
    const boxes=session.rows.map(row=>row.getBoundingClientRect());
    if(session.mode==='pointer')session.target=wishTargetIndex(boxes,session.from,session.clientY);
    const order=moveWishId(session.ids,session.from,session.target);
    const gap=boxes.length>1?boxes[1].top-boxes[0].bottom:0;
    const listTop=list.getBoundingClientRect().top;
    let top=boxes[0].top,placeholderTop=top;
    for(let position=0;position<order.length;position++){
      const index=session.ids.indexOf(order[position]),row=session.rows[index];
      const offset=session.mode==='pointer'&&index===session.from?session.clientY-session.grabOffset-boxes[index].top:top-boxes[index].top;
      row.style.transform=`translateY(${offset}px)`;
      row.querySelector('.journey-priority').textContent=String(position+1);
      if(index===session.from){placeholderTop=top;row.dataset.wishPreviewPosition=String(position+1);}
      top+=boxes[index].height+gap;
    }
    session.placeholder.style.top=`${placeholderTop-listTop}px`;
    session.placeholder.style.height=`${boxes[session.from].height}px`;
  }

  function begin(handle,mode,event){
    finish(false,{focus:false,announceResult:false});
    const filled=rows(),row=handle.closest('[data-wish-id]'),from=filled.indexOf(row);
    if(filled.length<2||from<0)return;
    const box=row.getBoundingClientRect(),placeholder=document.createElement('li');
    placeholder.className='journey-wish-placeholder';placeholder.setAttribute('aria-hidden','true');
    const session={handle,row,rows:filled,ids:filled.map(item=>item.dataset.wishId),id:row.dataset.wishId,from,target:from,mode,
      name:row.querySelector('strong').textContent,pointerId:event?.pointerId,startX:event?.clientX,startY:event?.clientY,
      clientY:event?.clientY,grabOffset:event?event.clientY-box.top:0,moved:false,placeholder};
    drag=session;list.append(placeholder);list.classList.add('is-wish-sorting');row.classList.add('is-wish-dragging');
    handle.setAttribute('aria-pressed','true');handle.focus({preventScroll:true});
    preview();announce(labels.grabbed(session.name,from+1));
    if(mode==='pointer'){
      const tick=()=>{
        if(destroyed||drag!==session)return;
        if(!list.isConnected){finish(false,{focus:false,announceResult:false});return;}
        if(session.moved){
          const height=window.innerHeight,edge=56;
          const speed=session.clientY<edge?-Math.min(12,(edge-session.clientY)/4):session.clientY>height-edge?Math.min(12,(session.clientY-height+edge)/4):0;
          if(speed)window.scrollBy({top:speed,behavior:'instant'});
          preview();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  listen(list,'pointerdown',event=>{
    const handle=event.target.closest('[data-wish-drag-handle]');
    if(!handle||handle.disabled||event.button!==0||event.isPrimary===false)return;
    event.preventDefault();begin(handle,'pointer',event);
    if(drag)handle.setPointerCapture(event.pointerId);
  });
  listen(list,'pointermove',event=>{
    if(drag?.mode!=='pointer'||drag.pointerId!==event.pointerId)return;
    event.preventDefault();drag.clientY=event.clientY;
    if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>6)drag.moved=true;
    if(drag.moved)preview();
  });
  listen(list,'pointerup',event=>{
    if(drag?.mode!=='pointer'||drag.pointerId!==event.pointerId)return;
    event.preventDefault();drag.clientY=event.clientY;
    const moved=drag.moved;if(moved)preview();
    if(moved)suppressClickAfterPointer();finish(moved,{announceResult:moved});
  });
  const cancelPointer=event=>{if(drag?.mode==='pointer'&&drag.pointerId===event.pointerId)finish(false);};
  listen(list,'pointercancel',cancelPointer);listen(list,'lostpointercapture',cancelPointer);
  listen(list,'contextmenu',event=>{if(drag||event.target.closest('[data-wish-drag-handle]'))event.preventDefault();});
  listen(list,'dragstart',event=>event.preventDefault());
  listen(list,'click',event=>{
    const handle=event.target.closest('[data-wish-drag-handle]');if(!handle)return;
    event.preventDefault();
    // Screen-reader activation without a pointer has the same grab/drop action.
    if(event.detail===0){if(drag?.handle===handle)finish(true);else begin(handle,'keyboard');}
  });
  listen(list,'keydown',event=>{
    const handle=event.target.closest('[data-wish-drag-handle]');if(!handle||handle.disabled)return;
    const grabbed=drag?.mode==='keyboard'&&drag.handle===handle;
    if(event.key===' '||event.key==='Enter'){
      event.preventDefault();if(event.repeat)return;
      if(grabbed)finish(true);else begin(handle,'keyboard');
    }else if(grabbed&&['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
      event.preventDefault();
      drag.target=event.key==='Home'?0:event.key==='End'?drag.rows.length-1:Math.max(0,Math.min(drag.rows.length-1,drag.target+(event.key==='ArrowUp'?-1:1)));
      preview();handle.scrollIntoView({block:'nearest',behavior:'instant'});
      announce(labels.moved(drag.name,drag.target+1));
    }else if(grabbed&&event.key==='Tab')finish(false,{focus:false});
  });
  listen(list,'focusout',event=>{
    if(drag?.mode==='keyboard'&&event.target===drag.handle)finish(false,{focus:false});
  });
  listen(document,'keydown',event=>{
    if(drag&&event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(false);}
  },true);
  listen(document,'pointerdown',event=>{
    if(drag?.mode==='pointer'&&event.pointerId!==drag.pointerId)finish(false,{focus:false});
    else if(drag?.mode==='keyboard'&&!drag.handle.contains(event.target))finish(false,{focus:false});
  },true);
  return {
    isBusy:()=>Boolean(drag),
    cancel:options=>finish(false,options),
    destroy(){if(destroyed)return;finish(false,{focus:false,announceResult:false});destroyed=true;listeners.splice(0).forEach(remove=>remove());}
  };
}
