/* Optional correspondence UI. Dialogue choices change the narrative lens only. */
(function(root){
  'use strict';
  const G=root.GovernorGame,S=G.Stories,I=G.icon;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tr=(l,r,e)=>globalThis.GovernorGame.I18n.choose(l,()=>(r),()=>(e)),loc=(v,l)=>globalThis.GovernorGame.I18n.local(v,l);
  const ARCHIVE_KEY='rudn-governor-stage7-correspondence';
  let hooks,dialog,current=null,origin=null,saveFailed=false;
  const lang=()=>hooks.language(),state=()=>hooks.state();
  const place=(id,l)=>loc(G.Population.MUNICIPALITIES.find(d=>d.id===id)?.name,l);
  const percent=(v,l)=>new Intl.NumberFormat(globalThis.GovernorGame.I18n.intlLocale(l),{maximumFractionDigits:1}).format(v*100)+'%';
  const phaseName=(p,l)=>[tr(l,'Первое письмо','First letter'),tr(l,'Спустя годы','Years later'),tr(l,'Развязка','Ending')][p];
  function getArchive(){try{const a=JSON.parse((window.GovernorGame.Platform?.storage||localStorage).getItem(ARCHIVE_KEY)||'[]');return Array.isArray(a)?a.filter(x=>x&&typeof x.id==='string'&&Array.isArray(x.endings)).slice(-12):[];}catch(_){return [];}}
  function remember(){
    const s=state();if(!s?.completed)return;
    const entry=S.archiveEntry(s,s.storiesRunId||`legacy:${s.sessionId}`);
    try{(window.GovernorGame.Platform?.storage||localStorage).setItem(ARCHIVE_KEY,JSON.stringify(S.remember(getArchive(),entry)));}catch(_){hooks.notice?.(tr(lang(),'Не удалось сохранить сравнение. Текущая история остаётся в партии.','Could not store the comparison. The current story remains in your campaign.'));}
  }
  function changed(){saveFailed=hooks.save()===false;remember();hooks.refreshBrief?.();}
  function close(){const id=current?.id;dialog.close();current=null;hooks.refreshList?.();requestAnimationFrame(()=>{const target=origin?.isConnected?origin:document.querySelector(`[data-open-letter="${id}"]`)||document.querySelector('#mission-title');if(target){if(!target.matches('button'))target.tabIndex=-1;target.focus({preventScroll:true});}});}
  function init(h){
    hooks=h;dialog=document.createElement('dialog');dialog.id='resident-letter';dialog.className='game-dialog resident-letter';dialog.setAttribute('aria-labelledby','letter-title');document.body.append(dialog);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('keydown',e=>{
      if(e.key!=='Tab')return;
      const targets=[...dialog.querySelectorAll('button:not([disabled]),summary,a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(x=>x.getClientRects().length>0);
      if(!targets.length){e.preventDefault();return;}
      const index=targets.indexOf(document.activeElement);
      if(index<0 || (e.shiftKey&&index===0) || (!e.shiftKey&&index===targets.length-1)){
        e.preventDefault();targets[e.shiftKey?targets.length-1:0].focus();
      }
    });
  }
  function portraitForPhase(arc, phase) {
    if (Array.isArray(arc?.portraits) && arc.portraits[phase]) return arc.portraits[phase];
    return arc?.portrait || `assets/characters/${arc.id}-resident.webp`;
  }
  function portraitLabel(phase, l) {
    return phase === 0 ? tr(l,'Портрет при знакомстве','Portrait at first meeting')
      : phase === 1 ? tr(l,'Портрет во втором письме','Portrait in the second letter')
      : tr(l,'Портрет в финальном письме','Portrait in the final letter');
  }

  function open(id,phase){
    const s=state(),p=phase===undefined?S.nextPhase(s,id):phase;
    if(p===null||!S.phaseAvailable(s,id,p))return;
    origin=document.activeElement;current={id,phase:p,selected:null};paint();
    if(!dialog.open)dialog.showModal();
    dialog.querySelector('#letter-title')?.focus({preventScroll:true});
  }
  function questionReceipt(model,l){
    if(!model.response)return '';
    if(model.phase===0)return loc(model.arc.routes.find(r=>r.id===model.response.choiceId).reply,l);
    return model.response.choiceId==='lasting'
      ?tr(l,'Вы договорились вернуться к трём последним годам срока. Развязка будет оценивать худший из этих годов: одна удачная дата не скроет перебои.','You agreed to revisit the final three years. The ending will use their lowest value, so one good date cannot hide interruptions.')
      :tr(l,'Вы договорились проверить условия к передаче полномочий. Развязка покажет состояние в конце срока; это не гарантия непрерывности работы.','You agreed to check conditions at the handover. The ending will show the final state, not a guarantee of uninterrupted operation.');
  }
  function evidence(model,l){
    const a=model.assessment,sn=model.snapshot;
    const records=sn.decisions.map(r=>{
      const m=G.Agenda.byId(r.missionId),act=m?.actions.find(x=>x.id===r.actionId);
      return `<li><span>${state().population.baseYear+r.turn-1}</span><b>${esc(loc(act?.title,l)||r.actionId)}</b></li>`;
    }).join('');
    if(model.phase===0&&!model.response)return `<details class="letter-evidence"><summary>${tr(l,'Какие решения уже приняты','Decisions already made')}</summary><div class="letter-evidence-body"><ul>${records}</ul><small>${tr(l,'Ваш ответ выберет, за какой стороной жизни следить дальше. Ни одно условие проекта этим разговором не меняется.','Your reply selects which aspect of life to follow. This conversation does not change any project condition.')}</small></div></details>`;
    return `<details class="letter-evidence"><summary>${tr(l,'На чём основан рассказ','What the story is based on')}</summary><div class="letter-evidence-body"><p>${esc(loc(a.label,l))} · ${sn.year}</p><div class="letter-facts"><div><small>${tr(l,'При первом письме','At the first letter')}</small><b>${percent(a.baseline,l)}</b></div><div><small>${a.follow==='lasting'?tr(l,'Худший из трёх лет','Lowest of three years'):tr(l,'В этом году','This year')}</small><b>${percent(a.value,l)}</b></div></div>${a.follow==='lasting'?`<p>${sn.recent.map(r=>`${r.year}: ${percent(r.metrics[a.metricKey],l)}`).join(' · ')}</p>`:''}<p>${tr(l,'Ориентир истории','Story benchmark')}: ${percent(a.benchmark,l)}. ${tr(l,'Это авторский игровой порог, а не государственный норматив.','This is an authored game threshold, not a public-service standard.')}</p><p>${tr(l,'Связанные решения, принятые к этой дате:','Related decisions made by this date:')}</p><ul>${records}</ul><small>${tr(l,'Числа взяты из годового регистра территории. Один житель не представляет всех жителей; личные переезды персонажей отдельно не симулируются.','Values come from the area’s annual ledger. One resident does not represent everyone; characters’ individual moves are not separately simulated.')}</small></div></details>`;
  }
  function paint(){
    if(!current)return;
    const s=state(),l=lang(),m=S.scene(s,current.id,current.phase);if(!m){close();return;}
    const a=m.arc,receipt=questionReceipt(m,l),ready=Boolean(m.response)||m.final;
    const prior=s.stories.answers[`${a.id}:0`];
    const priorQuestion=prior?loc(a.routes.find(r=>r.id===prior.choiceId).label,l):'';
    dialog.innerHTML=`<div class="letter-layout"><aside class="letter-place"><div class="letter-character"><img src="${esc(portraitForPhase(a,m.phase))}" alt="" class="letter-illustration" width="600" height="800"><small class="portrait-era">${portraitLabel(m.phase,l)} · ${m.snapshot.age} ${tr(l,'лет','years old')}</small></div><div class="letter-place-copy"><span class="letter-avatar" aria-hidden="true">${esc(loc(a.name,l).slice(0,1))}</span><p>${esc(place(a.districtId,l))}</p><h3>${esc(loc(a.name,l))}</h3><span>${m.snapshot.age} ${tr(l,'лет','years old')} · ${esc(loc(a.role,l))}</span><div class="letter-stages">${[0,1,2].map(i=>`<button type="button" data-letter-phase="${i}" ${S.phaseAvailable(s,a.id,i)?'':'disabled'} aria-current="${i===m.phase?'step':'false'}">${i+1}<span>${phaseName(i,l)}</span></button>`).join('')}</div><small>${tr(l,'Вымышленный персонаж. Реальные последствия вашей партии.','Fictional character. Actual outcomes from your campaign.')}</small></div></aside><section class="letter-paper"><div class="letter-top"><span>${phaseName(m.phase,l)} · ${m.snapshot.year}</span><button type="button" data-letter-close aria-label="${tr(l,'Закрыть письмо','Close letter')}">${I('close',{size:20})}</button></div><h2 id="letter-title" tabindex="-1">${esc(loc(m.title,l))}</h2><p class="letter-prose">${esc(loc(m.body,l))}</p>${m.phase>0?`<p class="letter-memory">${I('journal',{size:18})}<span>${tr(l,'Вы хотели проверить:','You wanted to check:')} <b>${esc(priorQuestion)}</b></span></p>`:''}${m.phase===1?`<p class="letter-observation">${m.assessment.value>=m.assessment.benchmark?tr(l,'По выбранному вами критерию ориентир сейчас достигнут. Сохранится ли результат до конца срока?','Your selected benchmark is met for now. Will the result last until the end of the term?'):tr(l,'По выбранному вами критерию ориентир ещё не достигнут. Следующая глава позволяет вернуться к устройству системы.','Your selected benchmark has not yet been met. The next chapter offers a chance to revisit the system.')}</p>`:''}${m.final?`<p class="letter-observation">${m.assessment.follow==='lasting'?tr(l,'Вы выбрали проверку трёх лет. Развязка учитывает худший год, а не только финальный снимок.','You chose a three-year check. The ending uses the lowest year, not just the final snapshot.'):tr(l,'Вы выбрали проверку на конец срока. Другой вопрос в следующей партии может открыть другую сторону этой истории.','You chose a check at the end of the term. A different question next time may reveal another side of this story.')}</p>`:''}${evidence(m,l)}${!ready?`<div class="letter-question"><h3>${tr(l,'О чём вы договоритесь поговорить дальше?','What will you agree to follow up?')}</h3><div class="letter-options" role="group" aria-label="${tr(l,'Ответ жителю','Reply to the resident')}">${m.options.map(o=>`<button type="button" data-letter-choice="${o.id}" aria-pressed="${current.selected===o.id}"><span>${esc(loc(o.label,l))}</span>${I(current.selected===o.id?'check':'arrow',{size:18})}</button>`).join('')}</div><p class="letter-hint">${tr(l,'Вы выбираете тему переписки, не выдаёте субсидию. Условия жизни меняются решениями основной кампании.','You are choosing a conversation topic, not a subsidy. Living conditions change through the main campaign decisions.')}</p></div>`:`${receipt?`<p class="letter-receipt" role="status">${esc(receipt)}</p>`:''}`}
      <footer class="letter-actions">${saveFailed?`<p class="letter-save-warning" role="alert">${tr(l,'Ответ остался только в памяти вкладки. Запись партии не удалась; скачайте файл сохранения перед выходом.','Your reply remains only in this tab’s memory. Saving failed; download a save file before leaving.')}</p>`:''}${!ready?`<button class="secondary-button" type="button" data-letter-close>${tr(l,'Вернуться позже','Come back later')}</button><button class="primary-button" type="button" data-letter-confirm ${current.selected?'':'disabled'}>${tr(l,'Ответить','Reply')} ${I('arrow',{size:18})}</button>`:m.final?`<button class="secondary-button" type="button" data-letter-region>${tr(l,'Посмотреть территорию','Visit the area')}</button><button class="primary-button" type="button" data-letter-finish>${tr(l,'Сохранить развязку','Keep this ending')} ${I('check',{size:18})}</button>`:`<button class="secondary-button" type="button" data-letter-region>${tr(l,'Посмотреть территорию','Visit the area')}</button><button class="primary-button" type="button" data-letter-next>${S.phaseAvailable(s,a.id,m.phase+1)?tr(l,'Следующее письмо','Next letter'):tr(l,'Вернуться к игре','Back to the game')} ${I('arrow',{size:18})}</button>`}</footer></section></div>`;
    dialog.querySelectorAll('[data-letter-close]').forEach(b=>b.onclick=close);
    dialog.querySelectorAll('[data-letter-choice]').forEach(b=>b.onclick=()=>{current.selected=b.dataset.letterChoice;paint();dialog.querySelector(`[data-letter-choice="${current.selected}"]`).focus({preventScroll:true});});
    dialog.querySelector('[data-letter-confirm]')?.addEventListener('click',()=>{try{S.answer(s,a.id,m.phase,current.selected);changed();paint();dialog.querySelector('.letter-receipt')?.setAttribute('tabindex','-1');dialog.querySelector('.letter-receipt')?.focus({preventScroll:false});}catch(e){hooks.notice?.(e.message);}});
    dialog.querySelector('[data-letter-next]')?.addEventListener('click',()=>{if(S.phaseAvailable(s,a.id,m.phase+1)){current.phase++;current.selected=null;paint();dialog.querySelector('#letter-title').focus({preventScroll:false});}else close();});
    dialog.querySelector('[data-letter-finish]')?.addEventListener('click',()=>{S.finish(s,a.id);changed();if(saveFailed)paint();else close();});
    dialog.querySelector('[data-letter-region]')?.addEventListener('click',()=>{s.residentSelection=a.districtId;close();hooks.navigate('residents');});
    dialog.querySelectorAll('[data-letter-phase]').forEach(b=>b.onclick=()=>{current.phase=Number(b.dataset.letterPhase);current.selected=null;paint();dialog.querySelector('#letter-title').focus({preventScroll:false});});
  }
  function briefHtml(s,l){
    const items=S.list(s),next=items.find(a=>a.tracked&&a.phase!==null)||items.find(a=>a.phase!==null),tracked=s.stories?.tracked&&S.find(s.stories.tracked);
    if(!next&&!tracked)return '';
    const a=next?S.find(next.id):tracked;
    return `<button class="story-brief-button" type="button" data-open-addresses>${I('journal',{size:18})}<span><b>${next?tr(l,`Письмо: ${loc(a.name,l)}`,`A letter: ${loc(a.name,l)}`):tr(l,'В вашей записной книжке','In your notebook')}</b><small>${next?tr(l,'Необязательная история · можно позже','Optional story · read it later'):esc(loc(a.routes.find(r=>r.id===s.stories.answers[a.id+':0'].choiceId)?.label,l))}</small></span>${I('arrow',{size:17})}</button>`;
  }
  function attachBrief(host){host?.querySelectorAll('[data-open-addresses]').forEach(b=>b.onclick=()=>hooks.navigate('stories'));}
  function teaser(host,districtId){
    const s=state(),l=lang(),arc=S.DATA.arcs.find(a=>a.districtId===districtId),item=S.list(s).find(a=>a.id===arc?.id);
    if(!arc||!item?.unlocked)return;
    const n=document.createElement('div');n.className='resident-story-link';n.innerHTML=`<button type="button" class="secondary-button">${I('journal',{size:18})}${tr(l,'Письма:','Letters:')} ${esc(loc(arc.name,l))} ${I('arrow',{size:17})}</button>`;
    n.querySelector('button').onclick=()=>{const p=S.nextPhase(s,arc.id);open(arc.id,p===null?item.finished?2:0:p);};host.append(n);
  }
  function card(item,s,l){
    const a=S.find(item.id),selected=s.stories.answers[a.id+':0'],route=a.routes.find(r=>r.id===selected?.choiceId);
    const lastPhase=item.finished?2:item.phase??(item.answered>0?item.answered-1:0);
    const sn=s.stories.snapshots[a.id+':'+lastPhase];
    const face=lastPhase>0?`assets/letters/${a.id}-letter-${lastPhase===1?'02':'03'}-avatar.webp`:`assets/characters/${a.id}-resident-avatar.webp`;
    return `<article class="address-card ${item.unlocked?'':'locked'}"><div class="address-art"><img class="address-scene" src="${esc(a.art)}" alt="" loading="lazy"><img class="address-face" src="${esc(face)}" alt="" loading="lazy" width="256" height="256"><span>${I(a.icon,{size:22})}</span></div><div class="address-copy"><small>${esc(place(a.districtId,l))}</small><h3>${esc(loc(a.name,l))}<span>${sn?sn.year+' · ':''}${sn?sn.age:a.age} ${tr(l,'лет','years old')}</span></h3><p>${esc(loc(a.title,l))}</p>${route?`<small class="address-focus">${tr(l,'Вопрос:','Following:')} ${esc(loc(route.label,l))}</small>`:`<small class="address-focus">${esc(loc(a.role,l))}</small>`}<div class="address-chapters" aria-label="${tr(l,'Прочитанные эпизоды','Read episodes')}">${[0,1,2].map(i=>`<i class="${(i<2?s.stories.answers[a.id+':'+i]:item.finished)?'done':S.phaseAvailable(s,a.id,i)?'ready':''}"></i>`).join('')}<span>${item.finished?tr(l,'История сохранена','Ending saved'):item.phase!==null?phaseName(item.phase,l):item.unlocked?tr(l,'Ждём следующего письма','Waiting for the next letter'):tr(l,`После решения ${a.turns[0]}`,`After decision ${a.turns[0]}`)}</span></div><div class="address-actions"><button type="button" class="${item.phase!==null?'primary':'secondary'}-button" data-open-letter="${a.id}" data-phase="${lastPhase}" ${item.unlocked?'':'disabled'}>${item.phase!==null?tr(l,'Читать письмо','Read letter'):item.unlocked?tr(l,'Перечитать','Read again'):tr(l,'Ещё не знакомы','Not met yet')} ${I('arrow',{size:16})}</button>${item.started?`<button class="address-pin ${item.tracked?'selected':''}" data-track-story="${item.tracked?'':a.id}" type="button" aria-label="${tr(l,item.tracked?'Убрать из записной книжки':'Следить за этой историей',item.tracked?'Unpin this story':'Pin this story')}" aria-pressed="${item.tracked}">${I('flag',{size:19})}</button>`:''}</div></div></article>`;
  }
  function comparisonHtml(s,l){
    const now=S.archiveEntry(s,s.storiesRunId||`legacy:${s.sessionId}`),past=getArchive().filter(x=>x.id!==now?.id&&x.endings.length);
    if(!s.completed||!now.endings.length)return `<p class="letters-archive-note">${tr(l,'Когда завершите срок и прочитаете развязки, они останутся здесь для сравнения со следующей партией. Непрочитанные финалы не раскрываются.','After finishing the term and reading the endings, keep them here to compare with the next campaign. Unread endings stay hidden.')}</p>`;
    return `<details class="letters-comparison"><summary>${tr(l,'Сравнить с прошлой партией','Compare with a previous campaign')}</summary>${past.length?`<label for="letters-past">${tr(l,'Сохранённая партия','Saved campaign')}</label><select id="letters-past">${past.map((p,i)=>`<option value="${esc(p.id)}">${tr(l,'Партия','Run')} ${i+1} · ${esc(p.seed)} · ${esc(loc(G.DATA.scenarios.find(x=>x.id===p.scenarioId)?.name,l)||p.scenarioId)} · ${esc(G.DATA.ui[l][G.DATA.challenges.find(x=>x.id===p.challengeId)?.nameKey]||p.challengeId)}</option>`).join('')}</select><div id="letters-comparison-result"></div>`:`<p>${tr(l,'Это первая сохранённая подборка. Повторите кампанию: другие решения смогут привести к другой развязке.','This is your first saved set. Replay the campaign: different decisions can lead to a different ending.')}</p>`}</details>`;
  }
  function renderComparison(host){
    const s=state(),l=lang(),select=host.querySelector('#letters-past');if(!select)return;
    const before=getArchive().find(a=>a.id===select.value),now=S.archiveEntry(s,s.storiesRunId||`legacy:${s.sessionId}`);if(!before)return;
    const differences=(now.decisions||[]).filter((r,i)=>{const old=(before.decisions||[])[i];return !old||['missionId','actionId','fundingMode','placementId'].some(k=>old[k]!==r[k]);});
    const describe=r=>{if(!r)return tr(l,'Не записано','Not recorded');const mission=G.Agenda.byId(r.missionId),a=mission?.actions.find(x=>x.id===r.actionId);const funding={treasury:tr(l,'свои средства','own funds'),cofinance:tr(l,'софинансирование','cofinancing'),debt:tr(l,'долг','debt'),reserve:tr(l,'резерв','reserve')}[r.fundingMode]||r.fundingMode;const placement=mission?.placements?.find(p=>p.id===r.placementId);return esc((loc(a?.title,l)||r.actionId)+' · '+funding+(placement?' · '+(loc(placement.title||placement.name,l)||placement.id):''));};
    const choicesDiff=`<details class="letters-choice-diff"><summary>${tr(l,'Порядок, меры, финансирование и размещение','Order, measures, funding and placement')}: ${differences.length} / 20</summary><p>${tr(l,'Дополнительные условия переговоров и продления здесь не сопоставляются. Совпадение этих полей не означает тождество всей стратегии.','Negotiation terms and programme renewals are not compared here. Matching these fields does not mean the entire strategies are identical.')}</p><ul>${differences.map(r=>{const old=(before.decisions||[])[(r.turn||now.decisions.indexOf(r)+1)-1];return `<li><small>${r.turn||now.decisions.indexOf(r)+1}</small><span>${describe(old)}</span><b>${I('arrow',{size:16})} ${describe(r)}</b></li>`;}).join('')}</ul></details>`;
    host.querySelector('#letters-comparison-result').innerHTML=`<p class="letter-compare-caution">${S.comparable(before,now)?tr(l,'Сценарий, маршрут, режим, seed и версии совпадают. Можно сопоставить разные стратегии; это не оценка знаний студента.','Scenario, route, mode, seed and versions match. Strategies can be compared; this is not a student knowledge assessment.'):tr(l,'Условия партий различаются. Это сопоставление историй, а не честный рейтинг эффективности.','Campaign conditions differ. This compares stories, not performance on equal terms.')}</p>${choicesDiff}${now.endings.map(e=>{
      const old=before.endings.find(x=>x.arcId===e.arcId),a=S.find(e.arcId);
      return `<article class="letter-comparison-row"><h4>${esc(loc(a.name,l))}</h4><div><small>${tr(l,'Прошлая партия','Previous campaign')}</small><p>${old?esc(loc(a.endings[old.grade]?.title,l)):tr(l,'Развязка не прочитана','Ending not read')}</p></div><div><small>${tr(l,'Эта партия','This campaign')}</small><p>${esc(loc(a.endings[e.grade].title,l))}</p></div>${old&&(old.routeId!==e.routeId||old.follow!==e.follow)?`<small class="comparison-question-change">${tr(l,'Вы изменили вопрос или период проверки: эти развязки оценивают разные стороны жизни.','You changed the question or time horizon: these endings assess different aspects of life.')}</small>`:''}</article>`;
    }).join('')}`;
  }
  function render(host){
    const s=state(),l=lang();
    host.innerHTML=`<header class="letters-header"><div><p>${tr(l,'Истории Новой области','Stories from Novaya Oblast')}</p><h2>${loc(S.DATA.title,l)}</h2><p class="letters-lead">${tr(l,'Люди, к которым можно вернуться спустя годы. Их письма меняются вместе с вашей областью.','People you can return to years later. Their letters change with your region.')}</p></div><button class="secondary-button" type="button" data-letters-back>${I('arrowLeft',{size:17})}${tr(l,'К миссии','Back to mission')}</button></header><div class="letters-disclaimer">${I('info',{size:18})}<span>${tr(l,'Необязательные истории без очков и штрафа за пропуск. Вы выбираете вопрос; решения кампании определяют, что изменится.','Optional stories, with no points and no penalty for skipping. You choose the question; campaign decisions determine what changes.')}</span></div><div class="address-grid">${S.list(s).map(a=>card(a,s,l)).join('')}</div>${comparisonHtml(s,l)}<p class="letters-method">${tr(l,'Персонажи вымышлены. Числа и связанные решения взяты из сохранённых годовых регистров. Письма датированы состоянием на начало следующего года.','The characters are fictional. Values and related decisions come from saved annual ledgers. Letters are dated at the start of the following year.')}</p>`;
    host.querySelectorAll('[data-open-letter]').forEach(b=>b.onclick=()=>open(b.dataset.openLetter,Number(b.dataset.phase)));
    host.querySelectorAll('[data-track-story]').forEach(b=>b.onclick=()=>{S.track(s,b.dataset.trackStory||null);changed();render(host);host.querySelector(`[data-track-story="${s.stories.tracked?'':b.dataset.trackStory}"]`)?.focus({preventScroll:true});});
    host.querySelector('[data-letters-back]').onclick=()=>hooks.navigate('mission');
    const select=host.querySelector('#letters-past');if(select){renderComparison(host);select.onchange=()=>renderComparison(host);}
  }
  function endingButton(host){const l=lang(),n=document.createElement('div');n.className='letters-ending-link';n.innerHTML=`<h3>${tr(l,'Чем закончились их истории?','How did their stories end?')}</h3><p>${tr(l,'Пять адресов сохранили письма о вашем сроке. Развязки открываются только при чтении.','Five addresses have kept letters about your term. Their endings are revealed only when you read them.')}</p><button type="button" class="primary-button">${I('journal',{size:18})}${tr(l,'Вернуться к жителям','Return to the residents')}</button>`;n.querySelector('button').onclick=()=>{host.closest('dialog')?.close();hooks.navigate('stories');};host.prepend(n);}
  G.StoriesUI={init,open,close,render,briefHtml,attachBrief,teaser,endingButton,remember,getArchive,build:'0.14.0-stage14'};
})(typeof window!=='undefined'?window:globalThis);
