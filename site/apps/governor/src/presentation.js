/* Presentation-only journey: neither viewing a chapter nor taking a picture
 * changes money, population, random draws, simulation time, or achievements. */
(function(root){
'use strict';const G=root.GovernorGame,M=G.WorldModel;
const KEY='rudn-governor-stage7-journey';let hooks,journey;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt=(l,r,e)=>globalThis.GovernorGame.I18n.choose(l,()=>(r),()=>(e));
function load(state){let saved;try{saved=JSON.parse((window.GovernorGame.Platform?.storage||localStorage).getItem(KEY)||(window.GovernorGame.Platform?.storage||localStorage).getItem('rudn-governor-stage6-journey')||'null');}catch(_){}journey=M.initialiseJourney(state,saved);return journey;}
function save(){try{(window.GovernorGame.Platform?.storage||localStorage).setItem(KEY,JSON.stringify(journey));}catch(_){} }
function init(h){hooks=h;
 const el=document.createElement('dialog');el.id='chapter-dialog';el.className='game-dialog chapter-dialog';el.setAttribute('aria-labelledby','chapter-heading');document.body.append(el);
 el.addEventListener('cancel',e=>{e.preventDefault();acknowledge();});
}
function acknowledge(){const state=hooks.state();if(!state)return;const chapter=M.chapterCard(state).id;if(!journey.seenChapters.includes(chapter))journey.seenChapters.push(chapter);save();document.getElementById('chapter-dialog').close();hooks.onClose?.();}
function maybeChapter(force=false){const state=hooks.state();if(!state||(!force&&(state.completed||state.awaitingContinue)))return false;
 if(!journey||journey.campaignId!==state.sessionId+':'+state.startedAt)load(state);
 const card=M.chapterCard(state);if(!force&&(journey.skipChapters||journey.seenChapters.includes(card.id)))return false;
 const lang=hooks.language(),advisor=G.DATA.advisors.find(a=>a.id===card.advisor),dialog=document.getElementById('chapter-dialog');
 dialog.innerHTML=`<div class="chapter-landscape"><img src="assets/illustrated/region.webp" alt=""><span class="chapter-numeral">${['I','II','III','IV'][card.id-1]}</span><button type="button" data-chapter-skip aria-label="${txt(lang,'Перейти к игре','Return to the game')}">${G.icon('close',{size:21})}</button><p>${card.year} · ${txt(lang,'Глава','Chapter')} ${card.id} / 4</p></div><div class="chapter-copy"><h2 id="chapter-heading">${esc(globalThis.GovernorGame.I18n.choose(lang,()=>(card.ru),()=>(card.en)))}</h2><p class="chapter-lead">${esc(M.local(card.lead,lang))}</p>${card.id>1?`<div class="chapter-recap">${G.icon('construction',{size:19})}<span>${txt(lang,'В регионе сейчас:','In the region now:')} <b>${card.operating}</b> ${txt(lang,'программ работают','programmes are operating')}, <b>${card.building}</b> ${txt(lang,'ещё в реализации.','are still in delivery.')}</span></div>`:''}<div class="chapter-voice"><img src="${advisor.image}" alt=""><div><strong>${esc(M.local(advisor.name,lang))}</strong><p>${esc(M.local(card.question,lang))}</p></div></div><div class="chapter-actions"><label><input type="checkbox" id="skip-chapter-intros" ${journey.skipChapters?'checked':''}>${txt(lang,'В дальнейшем без вступлений','Skip future chapter introductions')}</label><button type="button" class="primary-button" data-enter-chapter>${txt(lang,card.id===1?'Приступить к работе':'Продолжить срок',card.id===1?'Take office':'Continue your term')} ${G.icon('arrow',{size:18})}</button></div></div>`;
 dialog.querySelector('[data-enter-chapter]').addEventListener('click',acknowledge);dialog.querySelector('[data-chapter-skip]').addEventListener('click',acknowledge);
 dialog.querySelector('#skip-chapter-intros').addEventListener('change',e=>{journey.skipChapters=e.target.checked;save();});
 if(!dialog.open)dialog.showModal();return true;
}
function visit(id){const state=hooks.state();if(!state)return;if(!journey||journey.campaignId!==state.sessionId+':'+state.startedAt)load(state);if(!journey.visited.includes(id)){journey.visited.push(id);save();}}
function decorateResolution(record,state){
 const host=document.getElementById('resolution-content'),lang=hooks.language();
 if(!host||host.querySelector('.result-short-story'))return;
 const old=document.createElement('details');old.className='result-deep-dive';const summary=document.createElement('summary');summary.textContent=txt(lang,'Разобрать результат: финансы, люди и обязательства','Explore the outcome: finances, people and commitments');old.append(summary);
 const body=document.createElement('div');while(host.firstChild)body.append(host.firstChild);old.append(body);
 const p=record.project,kind=p?M.kind(p):'service';
 const status=record.deferred?txt(lang,'Новая мера не запущена','No new measure started'):p?.status==='delivery'?txt(lang,'Работы начаты','Delivery started'):p?.status==='active'?txt(lang,'Программа работает','The programme is operating'):txt(lang,'Решение принято','Decision enacted');
 const timing=p?.status==='delivery'?txt(lang,`До запуска по текущему плану: ${p.startsIn} г. Услуга ещё не открыта.`,`Current plan: ${p.startsIn} years to launch. The service is not open yet.`):p?.status==='active'?txt(lang,`Содержание принято в бюджет. Плановых лет работы осталось: ${p.yearsRemaining}.`,`Operation is included in the budget. Planned operating years remaining: ${p.yearsRemaining}.`):txt(lang,'Результат и связанные обязательства записаны в историю.','The result and related commitments are recorded in your journal.');
 const risk=record.delivery?.id==='overrun'?txt(lang,'Фактическая стоимость выше плана. Разница учтена в казне.','Actual cost is above the plan. The difference is included in the treasury.'):record.delivery?.id==='delayed'?txt(lang,'Срок реализации увеличен. Проверьте дату, которую обещали жителям.','Delivery has been delayed. Check the date you promised residents.'):record.delivery?.id==='partial'?txt(lang,'Исполнение неполное: достигнут меньший эффект, чем планировалось.','Delivery is partial: the effect is smaller than planned.'):'';
 const name=G.WorldModel.PLACES.find(d=>d.id===record.districtId||d.id===p?.districtId)?.name;
 host.innerHTML=`<section class="result-short-story">${p?G.IllustratedAssets.tag(G.IllustratedAssets.image(p,{thumb:true}),{lazy:false}):'<img src="assets/illustrated/region.webp" alt="">'}<div><small>${esc(M.local(name,lang)||txt(lang,'Новая область','Novaya Oblast'))}</small><h3>${status}</h3><p>${timing}</p>${risk?`<p class="result-alert">${risk}</p>`:''}</div></section><div class="result-now-values">${[['coins',txt(lang,'Казна','Treasury'),record.effects.budget],['people',txt(lang,'Поддержка','Support'),record.effects.support],['development',txt(lang,'Развитие','Development'),record.effects.development]].map(([i,label,v])=>`<div>${G.icon(i,{size:19})}<span>${label}</span><b>${Number(v)>0?'+':''}${new Intl.NumberFormat(globalThis.GovernorGame.I18n.intlLocale(lang),{maximumFractionDigits:1}).format(Number(v)||0)}</b></div>`).join('')}</div><p class="result-year-note">${txt(lang,'После решения выполнен годовой пересчёт. Здесь также учтена работа прежних программ; кризис при входе в год показан отдельно.','The annual update includes earlier programmes as well as this decision. The crisis on entering the year is shown separately.')}</p>`;
 host.append(old);
}
function yearNote(state,events){const host=document.getElementById('year-world-note');if(!host)return;
 const lang=hooks.language(),e=(events||state.finance.lastLifecycleEvents||[]).filter(e=>['activated','completed'].includes(e.type));
 if(!e.length){
 const d=G.DeliveryDesk.snapshot(state),due=d.attention.filter(x=>x.reason==='ending');
 if(!due.length){host.innerHTML='';host.classList.add('hidden');return;}
 host.classList.remove('hidden');host.innerHTML=`${G.icon('clock',{size:16})}<span><b>${txt(lang,'Проверьте действующие программы','Check existing programmes')}</b> · ${due.length} ${txt(lang,'договоров завершаются в этом году','contracts end this year')}</span><button type="button" aria-label="${txt(lang,'Открыть повестку исполнения','Open delivery agenda')}">${G.icon('arrow',{size:16})}</button>`;
 host.querySelector('button').onclick=()=>hooks.delivery?.();return;
 }
 const first=e[0],title=M.local(first.title,lang);host.classList.remove('hidden');host.innerHTML=`${G.icon(first.type==='activated'?'check':'clock',{size:16})}<span><b>${txt(lang,'В этом году','This year')}</b> · ${esc(title)}: ${txt(lang,first.type==='activated'?'началась работа':'финансирование завершено',first.type==='activated'?'now operating':'funding ended')}${e.length>1?` · +${e.length-1}`:''}</span><button type="button" aria-label="${txt(lang,'Посмотреть изменения на карте','Inspect changes on the map')}">${G.icon('arrow',{size:16})}</button>`;
 host.querySelector('button').addEventListener('click',()=>hooks.delivery?hooks.delivery():hooks.map());
}
G.Presentation={init,load,visit,maybeChapter,decorateResolution,yearNote,build:'1.0.0'};
})(typeof window!=='undefined'?window:globalThis);
