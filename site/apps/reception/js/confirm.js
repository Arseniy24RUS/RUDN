/** Accessible, non-blocking confirmation for standalone and embedded use. */
export function confirmAction(message,{title='Подтвердите действие',accept='Подтвердить',cancel:cancelLabel='Отмена',signal}={}){
 if(signal?.aborted)return Promise.resolve(false);
 return new Promise((resolve,reject)=>{
  const previous=document.activeElement;
  const dialog=document.createElement('dialog');
  dialog.className='rx-help-dialog rx-confirm-dialog';
  const heading=document.createElement('h2');heading.textContent=title;heading.id='rxConfirmTitle';
  const text=document.createElement('p');text.textContent=message;text.id='rxConfirmText';
  dialog.setAttribute('aria-labelledby',heading.id);dialog.setAttribute('aria-describedby',text.id);
  const form=document.createElement('form');form.method='dialog';form.className='rx-help-actions';
  const cancel=document.createElement('button');cancel.type='submit';cancel.value='cancel';cancel.textContent=cancelLabel;cancel.autofocus=true;
  const ok=document.createElement('button');ok.type='submit';ok.value='accept';ok.textContent=accept;
  form.append(cancel,ok);dialog.append(heading,text,form);document.body.append(dialog);
  let settled=false;
  const detach=()=>{signal?.removeEventListener('abort',abort);dialog.remove();};
  const finish=accepted=>{if(settled)return;settled=true;detach();if(!signal?.aborted&&previous?.isConnected)previous.focus({preventScroll:true});resolve(accepted);};
  const abort=()=>{if(dialog.open)dialog.close('cancel');finish(false);};
  dialog.addEventListener('close',()=>finish(dialog.returnValue==='accept'),{once:true});
  signal?.addEventListener('abort',abort,{once:true});
  try{dialog.showModal();}catch(error){settled=true;detach();reject(error);}
 });
}
