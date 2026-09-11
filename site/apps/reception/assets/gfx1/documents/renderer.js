/* Load as a classic script; no network dependencies. */
(function(global){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);return n};
 function render(root,data){
  root.querySelectorAll('[data-field]').forEach(n=>{const k=n.dataset.field;if(Object.prototype.hasOwnProperty.call(data,k)){n.textContent=data[k]??'';n.classList.remove('placeholder')}});
  const rows=root.querySelector('[data-slot="rows"]');if(rows&&Array.isArray(data.rows)){rows.replaceChildren();for(const cells of data.rows){const tr=el('tr');for(const value of cells)tr.append(el('td',value));rows.append(tr)}}
  const events=root.querySelector('[data-slot="events"]');if(events&&Array.isArray(data.events)){events.replaceChildren();for(const v of data.events){const li=el('li');const t=el('time',v.date);if(v.iso)t.dateTime=v.iso;li.append(t,el('span',v.text));events.append(li)}}
  const messages=root.querySelector('[data-slot="messages"]');if(messages&&Array.isArray(data.messages)){messages.replaceChildren();for(const v of data.messages){const s=el('section');s.append(el('h2',v.sender),el('time',v.date),el('p',v.text));messages.append(s)}}
  for(const name of ['figures','plan']){const slot=root.querySelector('[data-slot="'+name+'"]');if(slot&&Array.isArray(data[name])){slot.replaceChildren();for(const v of data[name]){if(!v.src||/^(javascript|data|https?):/i.test(v.src))throw Error('Use a local verified image path');const f=el('figure'),im=el('img');im.src=v.src;im.alt=v.alt??'';f.append(im,el('figcaption',v.caption));slot.append(f)}}}
  return root;
 }
 global.ReceptionDocuments={render};
})(window);
