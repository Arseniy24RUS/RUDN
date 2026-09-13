/* A bounded optional opening case, using the same campaign and ledger. */
(function(root){
  'use strict';
  const G=root.GovernorGame,R=G.Recovery,E=G.Engine,I=G.icon;
  const tr=(l,ru,en)=>globalThis.GovernorGame.I18n.choose(l,()=>(ru),()=>(en));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=(v,l)=>new Intl.NumberFormat(globalThis.GovernorGame.I18n.intlLocale(l),{maximumFractionDigits:2}).format(v);
  let hooks,dialog,origin=null,selected=null,operation=null;
  const names={reserves:['Расчёт своими силами','Use your own resources'],grant:['Помощь с паузой','Support with a pause'],loan:['Заём с возвратом','A loan to repay']};
  function title(id,l){return names[id]?tr(l,...names[id]):'';}
  function label(s,l){
    const t=R.status(s),end=s.population.baseYear+1;
    return({pending:tr(l,'Сначала закроем старый счёт','Settle the inherited bill first'),settled:tr(l,'Счёт закрыт за счёт собственных средств','The bill was settled using own resources'),pause:tr(l,`Новые запуски отложены до конца ${end} года`,`New starts paused through ${end}`),returned:tr(l,'Помощь возвращена: пауза снята','Grant returned: the pause is lifted'),'conditions-met':tr(l,'Условия помощи выполнены','Support conditions fulfilled'),repayment:tr(l,'Продолжается погашение займа','Loan repayment in progress'),repaid:tr(l,'Заём погашен','Loan repaid'),arrears:tr(l,'Сначала просроченный платёж','An overdue payment comes first')})[t]||'';
  }
  function brief(s,l){
    if(!R.active(s))return'';
    return `<button type="button" class="recovery-brief" data-recovery-open><span class="recovery-brief-icon">${I('vault',{size:21})}</span><span><small>${tr(l,'Учебный кейс · Счёт из прошлого','Classroom case · An inherited bill')}</small><strong>${esc(label(s,l))}</strong></span>${I('arrow',{size:18})}</button>`;
  }
  function attach(host){host.querySelectorAll('[data-recovery-open]').forEach(b=>b.onclick=()=>open());}
  function init(h){
    hooks=h;dialog=document.createElement('dialog');dialog.id='recovery-dialog';dialog.className='recovery-dialog';dialog.setAttribute('aria-labelledby','recovery-title');document.body.append(dialog);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('keydown',e=>{
      if(e.key!=='Tab')return;
      const n=[...dialog.querySelectorAll('button:not([disabled]),summary,a[href],[tabindex="0"]')].filter(x=>x.getClientRects().length),i=n.indexOf(document.activeElement);
      if(n.length&&(i<0||(e.shiftKey&&i===0)||(!e.shiftKey&&i===n.length-1))){e.preventDefault();n[e.shiftKey?n.length-1:0].focus();}
    });
  }
  function open(){
    if(!R.active(hooks.state()))return;
    origin=document.activeElement;selected=null;operation=null;paint();dialog.showModal();dialog.querySelector('h2').focus({preventScroll:true});
  }
  function close(){
    dialog.close();selected=null;operation=null;
    if(origin?.isConnected)origin.focus({preventScroll:true});
  }
  function reason(code,l){return({
    'recovery-pending':tr(l,'Сначала выберите способ оплаты старого счёта.','First choose how to settle the inherited bill.'),
    'recovery-pause':tr(l,'Условие помощи: два первых бюджета без новых запусков. Действующие услуги и их продление не запрещены.','Support condition: no new starts in the first two budgets. Existing services and renewals are permitted.'),
    'recovery-arrears':tr(l,'Есть просрочка по займу восстановления. Сначала платёж, затем новые программы.','The recovery loan has an overdue payment. Repay it before starting a new programme.'),
    'recovery-credit':tr(l,'Новый проектный долг недоступен до погашения займа восстановления.','New project borrowing is unavailable until the recovery loan has been repaid.')
  })[code]||'';}
  function choiceCard(q,l){
    const copy={reserves:tr(l,'Без новых условий и нового долга. Но страховой запас станет меньше.','No new conditions or debt, but a thinner reserve cushion.'),grant:tr(l,'Сохранить резерв. Два первых года не запускать новые меры; затем вернуться к повестке.','Keep your reserves. No new measures in the first two years, then resume your agenda.'),loan:tr(l,'Сохранить резерв и право на новые меры. Вернуть основной долг за три следующих бюджета.','Keep your reserves and new-policy choices. Repay the principal over the next three budgets.')};
    const extra=q.id==='reserves'?tr(l,`Из резерва: ${money(q.reserve,l)} млрд ₽`,`From reserves: ${money(q.reserve,l)} bn RUB`):q.id==='grant'?tr(l,'Целевая помощь: 3 млрд ₽','Earmarked support: 3 bn RUB'):tr(l,'Новый долг: 3 млрд ₽','New debt: 3 bn RUB');
    return `<button type="button" data-recovery-choice="${q.id}" class="recovery-choice ${selected===q.id?'selected':''}" aria-pressed="${selected===q.id}" ${q.available?'':'disabled'}><span class="recovery-choice-mark">${I(q.id==='reserves'?'vault':q.id==='grant'?'handshake':'bank',{size:24})}</span><strong>${title(q.id,l)}</strong><span>${esc(copy[q.id])}</span><b>${esc(extra)}</b></button>`;
  }
  function consequences(s,q,l){
    return `<section class="recovery-consequences" aria-live="polite"><h3>${tr(l,'После подтверждения','After confirmation')}</h3><div class="recovery-values"><span>${tr(l,'Свободная казна','Cash remaining')}<b>${money(q.treasuryAfter,l)}</b></span><span>${tr(l,'Резерв','Reserve')}<b>${money(q.reserveAfter,l)}</b></span><span>${tr(l,'Общий долг','Total debt')}<b>${money(q.debtAfter,l)}</b></span></div><small>${tr(l,'Все суммы – млрд игровых рублей.','All amounts are in billions of game rubles.')}</small><p>${tr(l,`Старый счёт ${money(q.bill,l)} будет оплачен: ${money(q.own,l)} из казны${q.reserve?' + '+money(q.reserve,l)+' из резерва':''}${q.grant?' + '+money(q.grant,l)+' целевой помощи':''}${q.loan?' + '+money(q.loan,l)+' заёмных средств':''}.`,`The ${money(q.bill,l)} bill will be paid with ${money(q.own,l)} cash${q.reserve?' + '+money(q.reserve,l)+' reserves':''}${q.grant?' + '+money(q.grant,l)+' grant':''}${q.loan?' + '+money(q.loan,l)+' borrowing':''}.`)}</p>${q.id==='loan'?`<p>${tr(l,`Основной долг: по 1 млрд ₽ в ${s.population.baseYear+1}, ${s.population.baseYear+2} и ${s.population.baseYear+3} годах. При своевременном погашении дополнительные проценты составят ${money(q.plannedAdditionalInterest,l)} млрд ₽. До погашения этого займа новый проектный долг закрыт.`,`Principal: 1 bn RUB in each of ${s.population.baseYear+1}, ${s.population.baseYear+2} and ${s.population.baseYear+3}. Additional interest with on-time payments: ${money(q.plannedAdditionalInterest,l)} bn RUB. New project borrowing is locked until this loan is repaid.`)}</p>`:''}${q.id==='grant'?`<p>${tr(l,`Условие: не начинать новые меры в ${s.population.baseYear}–${s.population.baseYear+1} годах. Работы по действующим договорам не останавливаются. Для досрочного выхода потребуется вернуть все 3 млрд ₽ из свободной казны.`,`Condition: no new starts in ${s.population.baseYear}–${s.population.baseYear+1}. Existing contracts keep running. Early exit requires returning the full 3 bn RUB from available cash.`)}</p>`:''}</section>`;
  }
  function ongoing(s,l){
    const r=R.report(s),loan=r.choice==='loan',grant=r.choice==='grant';
    const returnQ=R.grantReturnQuote(s),due=R.due(s),pay=Math.min(due,s.finance.treasury);
    const plans=loan?[2,3,4].map(t=>{
      const paid=r.payments.filter(p=>p.turn<=t).reduce((sum,p)=>sum+p.amount,0),target=t-1;
      const actual=t<=s.turnIndex+1;
      return `<div><strong>${s.population.baseYear+t-1}</strong><span>${tr(l,`Накопленное погашение: ${target} млрд ₽`,`Cumulative principal target: ${target} bn RUB`)}</span><b>${actual?tr(l,`Оплачено к этой дате: ${money(paid,l)}`,`Paid by this date: ${money(paid,l)}`):tr(l,'По графику','Scheduled')}</b></div>`;
    }).join(''):'';
    return `<div class="recovery-outcome"><span class="recovery-outcome-icon">${I(['repaid','settled','conditions-met','returned'].includes(r.status)?'check':'calendar',{size:28})}</span><h3>${esc(label(s,l))}</h3><p>${title(r.choice,l)}. ${tr(l,'Старый счёт оплачен один раз. Это не новый проект и не новая награда.','The inherited bill was paid once. This is not a new project or a new reward.')}</p></div>
      ${loan?`<section class="recovery-consequences"><h3>${tr(l,'Возврат основного долга','Repaying the principal')}</h3><div class="recovery-values"><span>${tr(l,'Взято','Borrowed')}<b>3</b></span><span>${tr(l,'Погашено','Repaid')}<b>${money(r.principalRepaid,l)}</b></span><span>${tr(l,'Осталось','Outstanding')}<b>${money(r.principalOutstanding,l)}</b></span></div><div class="recovery-schedule">${plans}</div><p>${tr(l,'Платёж проводится из свободной казны в начале года после обязательных расходов. Недостаток денег не считается погашением: непокрытая часть остаётся просрочкой. Досрочное погашение в казначействе сначала уменьшает этот заём.','Payments use available cash at the start of a year, after mandatory costs. A cash shortfall is not counted as repayment: the uncovered part stays overdue. Voluntary repayments in the treasury reduce this loan first.')}</p>${due>0?`<p class="recovery-warning">${tr(l,'Просрочено','Overdue')}: ${money(due,l)}. ${reason('recovery-arrears',l)}</p><button class="secondary-button" type="button" data-recovery-pay ${pay>0&&!s.awaitingContinue&&!s.completed?'':'disabled'}>${tr(l,`Рассмотреть платёж ${money(pay,l)}`,`Review a ${money(pay,l)} payment`)}</button>`:''}</section>`:''}
      ${grant?`<section class="recovery-consequences"><h3>${tr(l,'Условия целевой помощи','Conditions of earmarked support')}</h3><p>${tr(l,`Получено 3 млрд ₽. Новые запуски отложены на ${s.population.baseYear}–${s.population.baseYear+1} годы. Правительство может выбирать год исполнения или возвращать в повестку вопросы позже.`,`3 bn RUB received. New starts are paused in ${s.population.baseYear}–${s.population.baseYear+1}. Government can focus on delivery and revisit issues later.`)}</p>${r.grantReturned?`<p>${tr(l,'Помощь возвращена полностью. Ограничение новых запусков больше не действует.','The grant has been returned in full. The pause no longer applies.')}</p>`:returnQ.eligible?`<button class="secondary-button" type="button" data-recovery-return ${returnQ.available?'':'disabled'}>${tr(l,'Рассмотреть возврат 3 млрд ₽','Review returning 3 bn RUB')}</button>${!returnQ.available?`<small>${tr(l,'Для выхода из соглашения сейчас не хватает свободной казны.','There is not enough available cash to exit the agreement now.')}</small>`:''}`:''}</section>`:''}
      <details class="recovery-method"><summary>${tr(l,'Где это отражено','Where this is recorded')}</summary><p>${tr(l,'Оплата старого счёта и возврат помощи находятся в реестре управленческих расходов казначейства. Целевая помощь проведена отдельной записью в составе целевых трансфертов; заём и его возврат – в общем долговом регистре. У этого кейса нет отдельного кошелька.','The bill and any grant return appear under governance spending in the treasury ledger. Support is recorded as an earmarked transfer; borrowing and repayments are in the main debt ledger. This case has no separate wallet.')}</p></details>`;
  }
  function paint(){
    const s=hooks.state(),l=hooks.language();if(!R.active(s))return;
    const pending=R.pending(s),quotes=R.quotes(s),q=quotes.find(q=>q.id===selected);
    const confirm=operation==='return'?R.grantReturnQuote(s):operation==='pay'?{available:!s.completed&&!s.awaitingContinue&&Math.min(R.due(s),s.finance.treasury)>0,amount:Math.min(R.due(s),s.finance.treasury)}:null;
    dialog.innerHTML=`<header class="recovery-header"><div><small>${tr(l,'ПЕРВОЕ ДЕЛО НОВОЙ КОМАНДЫ','THE NEW TEAM’S FIRST CASE')}</small><h2 id="recovery-title" tabindex="-1">${tr(l,'Счёт из прошлого','An inherited bill')}</h2></div><button class="recovery-close" type="button" data-recovery-close aria-label="${tr(l,'Закрыть','Close')}">${I('close',{size:21})}</button></header><div class="recovery-body"><div class="recovery-intro"><img src="assets/characters/viktor-avatar.webp" width="72" height="72" alt=""><div><strong>${tr(l,'Виктор Соколов · Финансовый блок','Viktor Sokolov · Finance team')}</strong><p>${tr(l,'«До новых обещаний нужно оплатить старый счёт. Условия трёх способов разные. Выберите, чем мы готовы поступиться».','“Before new promises, an inherited bill has to be paid. The three options have different conditions. Decide what we are prepared to give up.”')}</p></div></div>
      ${pending?`<p class="recovery-lead">${tr(l,'Унаследован платёж 11,3 млрд ₽ по завершённому старому контракту. После обычных годовых обязательств в казне 9,3 млрд ₽, резерв – 2,5 млрд ₽. Старый счёт ещё не оплачен; новая мера невозможна до выбора источника.','An 11.3 bn RUB payment on a completed inherited contract is due. After ordinary annual costs, there is 9.3 bn RUB in cash and a 2.5 bn RUB reserve. The bill is not yet paid; choose its funding before launching a new measure.')}</p><div class="recovery-choices" role="group" aria-label="${tr(l,'Способ расчёта','Settlement option')}">${quotes.map(q=>choiceCard(q,l)).join('')}</div>${q?consequences(s,q,l):`<p class="recovery-select-hint">${tr(l,'Сравните условия. Просмотр вариантов ничего не списывает.','Compare the terms. Viewing an option spends nothing.')}</p>`}`:ongoing(s,l)}
      ${confirm?`<section class="recovery-confirmation" role="status"><h3>${tr(l,'Подтвердить отдельную операцию?','Confirm this separate operation?')}</h3><p>${operation==='return'?tr(l,'Вернуть 3 млрд ₽ из свободной казны и снять паузу на новые запуски. Повторно получить помощь в этом кейсе нельзя.','Return 3 bn RUB from available cash and lift the pause. This grant cannot be received again.'):tr(l,`Погасить ${money(confirm.amount,l)} млрд ₽ основного долга. Текущие проценты уже начислены; повторно их не возвращаем.`,`Repay ${money(confirm.amount,l)} bn RUB principal. This year’s interest is already charged; it is not refunded retroactively.`)}</p><button class="secondary-button" data-recovery-cancel-operation type="button">${tr(l,'Отмена','Cancel')}</button></section>`:''}
      <p class="recovery-footnote">${tr(l,'Ограниченный учебный кейс с авторскими суммами и условиями, не описание действующего законодательства. Общая аварийная помощь при последующих дефицитах пока остаётся в модели.','A bounded classroom case with authored amounts and conditions, not current law. The general emergency backstop for later deficits remains in the model.')}</p></div><footer class="recovery-footer"><span id="recovery-status" role="status">${pending?tr(l,'Год и проекты не изменятся при просмотре.','Viewing leaves the year and projects unchanged.'):tr(l,'Все операции сохраняются в текущей партии.','All operations are recorded in this campaign.')}</span><button type="button" class="primary-button" data-recovery-confirm ${pending?(!q?.available?'disabled':''):confirm?(!confirm.available?'disabled':''):''}>${pending?tr(l,'Подтвердить способ расчёта','Confirm the settlement'):confirm?tr(l,'Подтвердить операцию','Confirm the operation'):tr(l,'Вернуться в область','Return to the region')}</button></footer>`;
    dialog.querySelectorAll('[data-recovery-close]').forEach(b=>b.onclick=close);
    dialog.querySelectorAll('[data-recovery-choice]').forEach(b=>b.onclick=()=>{selected=b.dataset.recoveryChoice;const scroll=dialog.querySelector('.recovery-body').scrollTop;paint();dialog.querySelector(`[data-recovery-choice="${selected}"]`).focus({preventScroll:true});dialog.querySelector('.recovery-body').scrollTop=scroll;if(innerWidth<=700)dialog.querySelector('.recovery-consequences')?.scrollIntoView({block:'start'});});
    const review=(kind)=>{operation=kind;paint();dialog.querySelector('.recovery-confirmation').scrollIntoView({block:'nearest'});dialog.querySelector('[data-recovery-confirm]').focus({preventScroll:true});};
    dialog.querySelector('[data-recovery-return]')?.addEventListener('click',()=>review('return'));
    dialog.querySelector('[data-recovery-pay]')?.addEventListener('click',()=>review('pay'));
    dialog.querySelector('[data-recovery-cancel-operation]')?.addEventListener('click',()=>{operation=null;paint();dialog.querySelector('h2').focus({preventScroll:true});});
    dialog.querySelector('[data-recovery-confirm]').onclick=()=>{
      if(!pending&&!operation){close();return;}
      if(!hooks.canWrite())return;
      try{
        if(pending)E.settleRecovery(s,selected);
        else if(operation==='return')E.returnRecoveryGrant(s);
        else E.treasuryOperation(s,'repay',Math.min(R.due(s),s.finance.treasury));
        const saved=hooks.save();operation=null;selected=null;hooks.refresh();paint();
        dialog.querySelector('#recovery-status').textContent=saved?tr(l,'Операция проведена и сохранена.','Operation completed and saved.'):tr(l,'Операция в памяти вкладки; запись не удалась. Сохраните файл партии перед выходом.','Operation is in tab memory; storage failed. Export a save file before leaving.');
        dialog.querySelector('[data-recovery-confirm]').focus({preventScroll:true});
      }catch(e){dialog.querySelector('#recovery-status').textContent=reason(e.message,l)||tr(l,'Условия изменились. Операция не проведена.','Conditions changed. The operation was not performed.');}
    };
  }
  G.RecoveryUI={init,open,brief,attach,reason,label};
})(typeof window!=='undefined'?window:globalThis);
