/* Presentation-only views for the shared Stage 8 outcome and finance model. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=(n,lang,d=2)=>new Intl.NumberFormat(lang==='ru'?'ru-RU':'en-US',{maximumFractionDigits:d}).format(n);
 function treasury(state,lang){
  const F=root.GovernorGame.Finance,E=root.GovernorGame.Engine,r=lang==='ru';
  const future=F.projectObligations(state,3);
  return `<section class="fiscal-tools"><h3>${r?'Следующий бюджет тоже ваш':'The next budget is yours too'}</h3>
  <p>${r?'Сохраняйте резерв или гасите основной долг. Это перевод средств, а не покупка очков. Проценты текущего года уже оплачены.':'Build reserves or repay principal. These are transfers, not purchases of points. This year’s interest has already been paid.'}</p>
  ${!state.completed&&!state.awaitingContinue?`<div class="treasury-ops"><label>${r?'Сумма, млрд ₽':'Amount, bn RUB'}<input id="fiscal-amount" type="number" min="0.01" max="${state.finance.treasury}" step="0.1" value="0.5"></label><button type="button" class="secondary-button" data-treasury-op="reserve">${r?'Пополнить резерв':'Build reserve'}</button><button type="button" class="secondary-button" data-treasury-op="repay">${r?'Погасить долг':'Repay principal'}</button></div><p class="fiscal-quote" aria-live="polite"></p>`:''}
  ${state.finance.totalEmergencyTransfers>0?`<div class="aid-warning">${r?'Получена экстренная учебная поддержка':'Emergency classroom support used'}: <strong>${num(state.finance.totalEmergencyTransfers,lang)} ${r?'млрд ₽':'bn RUB'}</strong>. ${r?'Это признак нехватки собственных ресурсов, а не успешного бюджетного баланса. Помощь остаётся в истории и итоговом заключении.':'This signals a lack of own resources, not a successful fiscal balance. Support remains visible in the history and final assessment.'}</div>`:''}
  <details class="future-budget" ${future.unfunded?'open':''}><summary>${future.unfunded?(r?'Есть риск непокрытых обязательств':'Future commitments have a funding gap'):(r?'Расходы трёх следующих лет':'Costs of the next three years')}</summary>
  <p>${r?'Условный расчёт: численность и структура населения зафиксированы, новых решений и автоматической помощи нет. Резерв отдельно; его использование не предполагается.':'Conditional calculation: population and age structure are frozen, with no new decisions or automatic rescue. Reserves are separate and are not assumed to be spent.'}</p>
  <div class="future-years">${future.rows.map(row=>`<article><b>${row.year}</b><span>${r?'Содержание программ':'Programme operation'} <strong>${num(row.programmeOpex,lang)}</strong></span>${row.reviewPrincipal?`<span>${r?'Погашение бюджетного займа':'Budget-review loan principal'} <strong>${num(row.reviewPrincipal,lang)}</strong></span>`:''}${row.recoveryPrincipal?`<span>${r?'Погашение займа кейса':'Case-loan principal'} <strong>${num(row.recoveryPrincipal,lang)}</strong></span>`:''}<span>${r?'Баланс года':'Annual balance'} <strong>${num(row.net,lang)}</strong></span><span class="${row.cash<0?'negative':''}">${r?'Казна к концу года':'Year-end cash'} <strong>${num(row.cash,lang)}</strong></span></article>`).join('')}</div>
  </details></section>`;
 }
 function attachTreasury(node,state,lang,refresh,save){
  const E=root.GovernorGame.Engine,r=lang==='ru',input=node.querySelector('#fiscal-amount'),out=node.querySelector('.fiscal-quote');
  if(!input)return;
  const check=()=>{for(const b of node.querySelectorAll('[data-treasury-op]'))b.disabled=!E.treasuryOperationQuote(state,b.dataset.treasuryOp,Number(input.value)).available;};
  input.addEventListener('input',check);check();
  node.querySelectorAll('[data-treasury-op]').forEach(b=>b.addEventListener('click',()=>{
    const amount=Number(input.value),q=E.treasuryOperationQuote(state,b.dataset.treasuryOp,amount);
    if(!q.available){out.textContent=r?'Операция оставит текущую миссию без доступного решения или превышает остаток.':'This would exceed available cash or leave no playable mission response.';return;}
    const prompt=r?`${b.dataset.treasuryOp==='reserve'?'Перевести в резерв':'Погасить основной долг'} ${num(amount,lang)} млрд ₽? В казне останется ${num(q.treasuryAfter,lang)} млрд ₽.`:`${b.dataset.treasuryOp==='reserve'?'Transfer to reserves':'Repay principal'} ${num(amount,lang)} bn RUB? Cash left: ${num(q.treasuryAfter,lang)}.`;
    if(!window.confirm(prompt))return;E.treasuryOperation(state,b.dataset.treasuryOp,amount);save();refresh();
  }));
 }
 function results(state,record,lang){
  const r=lang==='ru',e=record.execution,feedback=record.serviceResponse;
  return `<section class="execution-note"><h4>${r?'Что произошло на самом деле':'What actually happened'}</h4>
   <p>${record.deferred?(r?'В этом году новая программа не начата. Звёзды исполнения не начисляются.':'No new programme this year. No execution marks awarded.'):e?.pending?(r?'Пока только обязательство: объект не открыт, отметки исполнения ещё не начислены.':'Still a commitment: the facility is not open and execution marks have not been awarded.'):(r?'Отметки отражают ввод и оплаченные годы работы, а не правильность выбранной политики.':'Marks reflect delivery and paid operating years, not whether the policy is the “right” one.')}</p>
   ${feedback?`<details><summary>${r?'Почему изменилась поддержка':'Why support changed'}</summary><p>${r?'Изменение услуг за весь переход':'Service changes across the entire transition'}: <b>${num(feedback.changeEffect,lang)}</b>. ${r?'Сохраняющиеся дефициты':'Persistent shortfalls'}: <b>${num(feedback.levelEffect,lang)}</b>. ${r?'Всего от услуг':'Total service effect'}: <b>${num(feedback.effects,lang)}</b>.</p><p>${r?'Учтены медицина, школа, уход за детьми, жильё, занятость и цифровые услуги. Начало и завершение прежних программ входят в этот расчёт. Другие изменения отражают кризис, реализацию и исполнение обещаний.':'Includes health, schools, childcare, housing, employment and digital services, including past programme opening and expiry. Other changes reflect crises, delivery and promises.'}</p></details>`:''}</section>`;
 }
 const api={treasury,attachTreasury,results};root.GovernorGame=root.GovernorGame||{};root.GovernorGame.ConsolidationUI=api;
})(typeof window!=='undefined'?window:globalThis);
