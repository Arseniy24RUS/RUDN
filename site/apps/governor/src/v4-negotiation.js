/* A view over the current portfolio quote and its existing per-project promises. */
(function (root) {
  'use strict';
  const G = root.GovernorGame ||= {};
  const LAST_YEAR = 2045;
  const copy = (ru, en, zh) => ({ru, en, zh});
  const actors = [
    {id:'municipality', type:'open', portrait:'anna-berezina-avatar',
      name:copy('Анна Березина','Anna Berezina','安娜·别列津娜'),
      title:copy('Муниципалитет','Municipality','市政团队'),
      remit:copy('Готовлю площадку и местное исполнение. Проверим год, когда услуга действительно начнёт работать.',
        'I coordinate the site and local delivery. We will check the year when the service actually starts.',
        '我负责地块和本地执行。我们将核查服务实际开始运行的年份。')},
    {id:'finance', type:'reserve', portrait:'viktor-avatar',
      name:copy('Виктор Соколов','Viktor Sokolov','维克托·索科洛夫'),
      title:copy('Финансы','Finance','财政部门'),
      remit:copy('Проверяю деньги на текущий год и будущие расходы. Обещание резерва проверяется в конце выбранного года.',
        'I check this year’s funds and future spending. A reserve promise is checked at the end of the chosen year.',
        '我核查本年资金和未来支出。储备承诺在所选年份年底核查。')},
    {id:'residents', type:'operate', portrait:'denis-kovalev-avatar',
      name:copy('Денис Ковалёв','Denis Kovalev','丹尼斯·科瓦廖夫'),
      title:copy('Жители','Residents','居民'),
      remit:copy('Представляю жителей, которым нужна услуга. Обещание работы проверяется по состоянию услуги в выбранном году.',
        'I represent residents who need the service. An operating promise checks whether it is running in the chosen year.',
        '我代表需要服务的居民。运营承诺核查服务在所选年份是否运行。')}
  ];
  const text = {
    title:copy('Обсудить условия','Discuss terms','商议条件'),
    back:copy('К проекту','Back to project','返回项目'),
    people:copy('Участники','Participants','参与方'),
    detail:copy('Разговор и полномочия','Conversation and remit','对话与职责'),
    selected:copy('Выбрано','Selected','已选择'),
    replace:copy('Заменит текущее обещание','Replaces this project’s promise','替换本项目承诺'),
    otherReserve:copy('Резерв уже обещан в другом проекте','Reserve already promised in another project','已在另一项目中承诺储备'),
    noReserve:copy('В резерве пока нет средств','There are no reserve funds yet','目前没有储备资金'),
    later:copy('Срок выходит за 2045 год','The deadline is after 2045','期限超过2045年'),
    promise:copy('Обещание','Promise','承诺'),
    noPromise:copy('Без дополнительных обещаний','No extra promises','无额外承诺'),
    remove:copy('Снять обещание','Remove promise','撤回承诺'),
    chosen:copy('В пакете','In the package','方案内'),
    now:copy('Из казны в этом году','Treasury this year','本年财政支出'),
    yearly:copy('В год после запуска','Per year once open','启用后的年支出'),
    allNow:copy('Все меры сейчас','All measures now','全部措施本期支出'),
    open:copy('Плановый запуск','Planned opening','计划启用'),
    operatingSince:copy('Работает с','Operating since','开始运行年份'),
    reserve:copy('Резерв на конец года','Year-end reserve','年末储备'),
    close:copy('Принять условия','Accept terms','接受条件'),
    saved:copy('Условия сохраняются в плане года','Terms are saved in the annual plan','条件保存在年度计划中'),
    noExtraCost:copy('Доплата 0 ₽ · в год +0 ₽','Extra 0 RUB · per year +0 RUB','附加费0卢布 · 每年+0卢布'),
    more:copy('Другие обещания пакета','Other package promises','方案中的其他承诺'),
    forecast:copy('Позиции по расчёту плана','Positions based on the plan','依据计划的立场'),
    ready:copy('Год обеспечен','Year funded','本年资金充足'),
    shortage:copy('Есть дефицит','Funding shortfall','资金不足'),
    funded:copy('Расходы учтены','Spending included','支出已计入'),
    mismatch:copy('Обещанный срок раньше запуска','Promised deadline precedes opening','承诺期限早于启用时间'),
    pastDue:copy('Обещанный год уже прошёл','The promised year has already passed','承诺年份已经过去'),
    expired:copy('Обещанный год вне срока работы проекта','The promised year is outside the service period','承诺年份不在项目服务期内'),
    reserveRisk:copy('Плановый резерв ниже обещанного','Projected reserve is below the promise','计划储备低于承诺'),
    error:copy('Не удалось сохранить. Проверьте план и повторите.','Could not save. Check the plan and retry.','保存失败。请检查计划后重试。'),
    due:copy('Год проверки','Year to check','核查年份'),
    amount:copy('Обещанный резерв, млн ₽','Promised reserve, m RUB','承诺储备，百万卢布'),
    revise:copy('Уточнить обещание','Adjust the promise','调整承诺')
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const samePromise = (a, b) => Boolean(a && b && a.type === b.type && a.dueYear === b.dueYear &&
    (a.type !== 'reserve' || a.amount === b.amount));

  function model({state, measure, project, quote}) {
    const entries = state?.draft?.measures || [];
    const current = entries.find(row => row.measureId === measure?.id);
    const promise = current?.promise || null;
    const opening = project?.openingYear;
    const finance = quote?.finance;
    const year = state?.year;
    const firstService = Math.max(year,opening);
    const renewal = project?.action === 'renew';
    const currentReserve = Number(finance?.reserveEnd ?? state?.finance?.reserve ?? 0);
    const otherReserve = entries.some(row => row !== current && row.promise?.type === 'reserve');
    const offers = {
      municipality: [0, 1].map(buffer => ({
        id:'open-' + buffer,
        promise:{type:'open', dueYear:firstService + buffer},
        title:buffer ? copy('Запас в один год','Allow one extra year','保留一年余量') :
          renewal ? copy('Подтвердить в этом году','Confirm this year','在本年确认') : copy('Срок по плану','The planned deadline','按计划期限'),
        disabled:firstService + buffer > LAST_YEAR ? 'later' : null
      })),
      finance: [0, 2].map(offset => ({
        id:'reserve-' + offset,
        promise:{type:'reserve', dueYear:year + offset, amount:currentReserve},
        title:offset ? copy('Резерв через два года','Reserve in two years','两年后的储备') : copy('Резерв в этом году','Reserve this year','本年的储备'),
        disabled:otherReserve ? 'otherReserve' : currentReserve <= 0 ? 'noReserve' : year + offset > LAST_YEAR ? 'later' : null
      })),
      residents: [0, Math.max(1,Math.min(2,(project?.endYear ?? firstService + 2)-firstService))].map(offset => ({
        id:'operate-' + offset,
        promise:{type:'operate', dueYear:firstService + offset},
        title:offset === 1 ? copy('Работа через год','Running one year later','一年后仍在运行') :
          offset ? copy('Работа через два года','Running two years later','两年后仍在运行') :
          renewal ? copy('Работа в этом году','Running this year','本年正常运行') : copy('Работа в год запуска','Running in the opening year','启用年正常运行'),
        disabled:firstService + offset > LAST_YEAR ? 'later' : firstService + offset > project?.endYear ? 'expired' : null
      }))
    };
    const risk = promise?.dueYear < year ? 'pastDue' :
      promise?.type === 'open' && promise.dueYear < opening ? 'mismatch' :
      promise?.type === 'operate' && (promise.dueYear < opening || promise.dueYear > project?.endYear) ? 'expired' :
      promise?.type === 'reserve' && promise.dueYear === year && promise.amount > finance?.reserveEnd ? 'reserveRisk' : null;
    const costFor = row => (finance?.operations || []).filter(operation => operation.direction === 'out' &&
      operation.id?.startsWith(row.id + ':')).reduce((total, operation) => total + operation.amount, 0);
    const costs = (quote?.projects || []).map(row => ({project:row, now:costFor(row)}));
    const currentCost = costs.find(row => row.project.draftMeasureId === measure?.id)?.now ?? project?.costNow ?? 0;
    return {entries, promise, opening, renewal, finance, offers, risk, costs, currentCost,
      totalNow:costs.reduce((total, row) => total + row.now, 0),
      ready:Boolean(project && current && Number.isInteger(opening))};
  }

  function create(api) {
    let actorId = 'municipality';
    let measureId = null;
    let host = null;
    let busy = false;
    let failure = false;
    const language = () => ['ru','en','zh'].includes(api.language()) ? api.language() : 'ru';
    const local = value => typeof value === 'object' ? value?.[language()] || value?.ru || '' : value;
    const tr = key => local(text[key]);
    const money = value => api.money(value);
    const data = () => model({state:api.state(), measure:api.measure(), project:api.project(), quote:api.quote()});
    const party = type => actors.find(actor => actor.type === type);
    function shortfall(view, full = false) {
      const row = view.finance?.cashEnd < 0 ? {year:api.state().year,amount:-view.finance.cashEnd} : view.finance?.firstShortfall;
      if (!row) return '';
      return full ? local(copy(`По прогнозу в ${row.year} не хватает ${money(row.amount)}.`,
        `The forecast is short by ${money(row.amount)} in ${row.year}.`,
        `预测${row.year}年资金缺口为${money(row.amount)}。`)) :
        local(copy(`Риск в ${row.year}`,`Risk in ${row.year}`,`${row.year}年有风险`));
    }
    function promiseText(promise, project) {
      const due = promise.dueYear;
      if (promise.type === 'open') return local(project?.action==='renew' ?
        copy(`Подтвердить работу к концу ${due}`,`Confirm service by the end of ${due}`,`${due}年底前确认服务已运行`) :
        copy(`Открыть к концу ${due}`,`Open by the end of ${due}`,`${due}年底前启用`));
      if (promise.type === 'operate') return local(copy(`Обеспечить работу в ${due}`,`Keep running in ${due}`,`确保${due}年运行`));
      return local(copy(`Резерв ≥ ${money(promise.amount)} в конце ${due}`,`Reserve ≥ ${money(promise.amount)} at the end of ${due}`,`${due}年底储备 ≥ ${money(promise.amount)}`));
    }
    function stance(actor, view) {
      if (actor.id === 'municipality') return view.risk === 'mismatch' ? tr('mismatch') :
        view.renewal ? local(copy('Продление','Renewal','延续服务')) :
          local(copy(`Запуск ${view.opening}`,`Opens ${view.opening}`,`${view.opening}年启用`));
      if (actor.id === 'finance') return shortfall(view) || tr('ready');
      return view.finance?.firstShortfall && view.finance.firstShortfall.year <= api.project().endYear ? tr('shortage') : tr('funded');
    }
    function line(actor, view) {
      const project = api.project();
      if (actor.id === 'municipality' && view.renewal) return local(copy(
        'Услуга уже действует. К какому году подтвердим работу?',
        'The service is running. By when shall we confirm it is operating?',
        '服务正在运行。最迟何时确认服务继续运行？'));
      if (actor.id === 'municipality') return local(project.siteId ? copy(
        `Объект откроется в ${view.opening} году. Какой срок назвать жителям?`,
        `The facility opens in ${view.opening}. What deadline shall we give residents?`,
        `设施计划于${view.opening}年启用。向居民承诺哪个期限？`) : copy(
        `Запуск меры в ${view.opening} году. Какой срок назвать жителям?`,
        `The measure starts in ${view.opening}. What deadline shall we give residents?`,
        `措施计划于${view.opening}年启动。向居民承诺哪个期限？`));
      if (actor.id === 'finance') return (shortfall(view,true) ? shortfall(view,true) + ' ' : '') + local(copy(
        `По плану в резерве ${money(view.finance?.reserveEnd || 0)}. Какой запас сохраним?`,
        `The plan leaves ${money(view.finance?.reserveEnd || 0)} in reserve. What cushion will we keep?`,
        `计划剩余储备为${money(view.finance?.reserveEnd || 0)}。承诺保留多少？`));
      return local(copy(`Для работы потребуется ${money(project.annualOpex)} в год. На какой год обещаете услугу?`,
        `Running costs ${money(project.annualOpex)} a year. In which year do you promise the service?`,
        `运营每年需要${money(project.annualOpex)}。承诺哪一年提供服务？`));
    }
    function pledge(row, project) {
      const actor = party(row.promise.type);
      const commitment=promiseText(row.promise,project||(row.measureId===measureId?api.project():null));
      return '<div class="v4-neg-pledge"><span><strong>' + esc(local(actor.title)) + '</strong> · ' +
        esc(commitment) + (project ? '<small>' + esc(local(project.labels)) + '</small>' : '') +
        '</span><button type="button" data-v4-neg-remove="' + esc(row.measureId) + '" aria-label="' +
        esc(tr('remove') + ' · ' + local(actor.title) + ' · ' + commitment) + '"' + (busy ? ' disabled' : '') + '>×</button></div>';
    }
    function summarize(selectedId) {
      const view = data();
      const promises = view.entries.filter(row => row.promise && (!selectedId || row.measureId === selectedId));
      if (!promises.length) return '<p class="v4-neg-empty">' + esc(tr('noPromise')) + '</p>';
      return '<ul class="v4-neg-summary">' + promises.map(row => {
        const actor = party(row.promise.type);
        const project = api.quote()?.projects?.find(item=>item.draftMeasureId===row.measureId);
        return '<li><strong>' + esc(local(actor?.title || row.promise.type)) + '</strong> · ' + esc(promiseText(row.promise,project)) +
          (project ? '<small>' + esc(local(project.labels)) + '</small>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    function render() {
      const view = data(), measure = api.measure();
      if (measureId !== measure?.id) {
        measureId = measure?.id;
        actorId = party(view.promise?.type)?.id || 'municipality';
      }
      if (!view.ready) return '<section data-v4-negotiation><button class="v3-button" data-v4-neg-back type="button">' + esc(tr('back')) + '</button></section>';
      const active = actors.find(actor => actor.id === actorId);
      const current = view.entries.find(row => row.measureId === measureId);
      const others = view.entries.filter(row => row !== current && row.promise);
      const disabled = busy ? ' disabled' : '';
      const offers = view.offers[actorId].map(offer => {
        const picked = samePromise(view.promise, offer.promise);
        const terms = offer.disabled ? tr(offer.disabled) :
          tr('noExtraCost') + (!picked && view.promise ? ' · ' + tr('replace') : '');
        return '<button type="button" class="v4-neg-offer" data-v4-neg-offer="' + offer.id + '" aria-pressed="' + picked + '"' +
          (offer.disabled || busy ? ' disabled' : '') + '><span class="v4-neg-choice" aria-hidden="true">' + (picked ? '✓' : '+') +
          '</span><span><strong>' + esc(local(offer.title)) + '</strong><span>' + esc(promiseText(offer.promise,api.project())) + '</span><small>' +
          esc(terms) + '</small></span></button>';
      }).join('');
      const fees = '<span>' + esc(tr('now')) + ' <b>' + esc(money(view.currentCost)) + '</b></span><span>' +
        esc(tr('yearly')) + ' <b>' + esc(money(api.project().annualOpex)) + '</b></span><span>' +
        esc(tr(view.renewal?'operatingSince':'open')) + ' <b>' + view.opening + '</b></span>';
      const fullPledges = others.map(row => pledge(row, api.quote().projects.find(project => project.draftMeasureId === row.measureId))).join('');
      return '<section class="v4-negotiation" data-v4-negotiation aria-busy="' + busy + '">' +
        '<header class="v4-neg-heading"><div><p>' + esc(tr('title')) + '</p><h1 id="v3-heading" tabindex="-1">' + esc(local(measure.labels)) +
        '</h1></div><button type="button" data-v4-neg-back aria-label="' + esc(tr('back')) + '"' + disabled + '>×</button></header>' +
        '<div class="v4-neg-participants" role="group" aria-label="' + esc(tr('people')) + '">' + actors.map(actor =>
          '<button type="button" data-v4-neg-actor="' + actor.id + '" aria-pressed="' + (actor.id === actorId) + '"' + disabled +
          '><img src="' + esc(api.asset('assets/characters/' + actor.portrait + '.webp')) + '" alt=""><span>' +
          esc(local(actor.title)) + '</span><small>' + esc(stance(actor, view)) + '</small></button>').join('') + '</div>' +
        '<div class="v4-neg-conversation"><p class="v4-neg-line"><strong>' + esc(local(active.name)) + '</strong> ' + esc(line(active, view)) + '</p>' +
        '<div class="v4-neg-offers" role="group" aria-label="' + esc(local(active.title)) + '">' + offers + '</div>' +
        '<details class="v4-neg-detail"><summary>' + esc(tr('detail')) + '</summary><p>' + esc(local(active.remit)) + '</p>' +
        '<p>' + esc(tr('forecast')) + '</p><ul>' + actors.map(actor => '<li><strong>' + esc(local(actor.title)) + '</strong> · ' + esc(stance(actor,view)) + '</li>').join('') +
        '</ul>' + (shortfall(view,true) ? '<p class="v4-neg-warning">' + esc(shortfall(view,true)) + '</p>' : '') +
        (view.costs.length > 1 ? '<ul class="v4-neg-costs">' + view.costs.map(row=>'<li><strong>' + esc(local(row.project.labels)) +
          '</strong><span>' + esc(tr('now')) + ': ' + esc(money(row.now)) + ' · ' + esc(tr('yearly')) + ': ' +
          esc(money(row.project.annualOpex)) + ' · ' + esc(tr(row.project.action==='renew'?'operatingSince':'open')) + ': ' + row.project.openingYear + '</span></li>').join('') + '</ul>' : '') +
        (view.promise ? '<fieldset class="v4-neg-adjust"><legend>' + esc(tr('revise')) + '</legend><label>' + esc(tr('due')) +
          '<input type="number" inputmode="numeric" data-v4-neg-year min="' + api.state().year + '" max="2045" value="' + view.promise.dueYear + '"' + disabled + '></label>' +
          (view.promise.type === 'reserve' ? '<label>' + esc(tr('amount')) + '<input type="number" inputmode="numeric" data-v4-neg-amount min="1" step="1" value="' + view.promise.amount + '"' + disabled + '></label>' : '') + '</fieldset>' : '') +
        '</details></div>' +
        '<footer class="v4-neg-contract">' + (failure ? '<p role="alert" class="v4-neg-warning">' + esc(tr('error')) + '</p>' : '') +
        (view.risk ? '<p class="v4-neg-warning" role="status">' + esc(tr(view.risk)) + '</p>' : '') +
        (view.promise ? pledge(current) : '<p class="v4-neg-empty">' + esc(tr('noPromise')) + '</p>') +
        (others.length ? '<details class="v4-neg-other"><summary>' + esc(tr('more')) + ' · ' + others.length + '</summary>' + fullPledges + '</details>' : '') +
        '<div class="v4-neg-price">' + fees + '</div>' +
        (view.costs.length > 1 ? '<p class="v4-neg-total">' + esc(tr('allNow')) + ': <b>' + esc(money(view.totalNow)) + '</b></p>' : '') +
        '<button type="button" class="v3-button primary full v4-neg-sign" data-v4-neg-confirm' + disabled + '>' + esc(tr('close')) + '</button>' +
        '</footer></section>';
    }
    function paint(focus) {
      const target = host?.querySelector('[data-v4-negotiation]');
      if (!target) return;
      const expanded = target.querySelector('.v4-neg-detail')?.open;
      const others = target.querySelector('.v4-neg-other')?.open;
      target.outerHTML = render();
      const panel = host.querySelector('[data-v4-negotiation]');
      if (expanded && panel.querySelector('.v4-neg-detail')) panel.querySelector('.v4-neg-detail').open = true;
      if (others && panel.querySelector('.v4-neg-other')) panel.querySelector('.v4-neg-other').open = true;
      if (focus) panel.querySelector(focus)?.focus({preventScroll:true});
    }
    async function run(action, focus) {
      if (busy) return;
      busy = true;
      failure = false;
      paint();
      try { await action(); }
      catch (error) { failure = true; api.onError?.(error); }
      finally { busy = false; paint(focus); }
    }
    function click(event) {
      const button = event.target.closest?.('button');
      if (!button?.closest('[data-v4-negotiation]')) return;
      event.stopPropagation();
      if (busy || button.disabled) return;
      const actor = button.dataset.v4NegActor;
      if (actor) {
        actorId = actor;
        paint('[data-v4-neg-actor="' + actor + '"]');
      } else if (button.hasAttribute('data-v4-neg-offer')) {
        const offer = data().offers[actorId].find(row => row.id === button.dataset.v4NegOffer);
        if (!offer || offer.disabled) return;
        const promise = samePromise(data().promise, offer.promise) ? null : offer.promise;
        void run(() => api.savePromise(promise, measureId), '[data-v4-neg-offer="' + offer.id + '"]');
      } else if (button.hasAttribute('data-v4-neg-remove')) {
        void run(() => api.savePromise(null, button.dataset.v4NegRemove), '[data-v4-neg-confirm]');
      } else if (button.hasAttribute('data-v4-neg-confirm')) {
        void run(() => api.confirm(), '[data-v4-neg-confirm]');
      } else if (button.hasAttribute('data-v4-neg-back')) {
        void run(() => api.back());
      }
    }
    function change(event) {
      const input = event.target;
      if (!input.closest?.('[data-v4-negotiation]') || !input.matches('[data-v4-neg-year],[data-v4-neg-amount]')) return;
      event.stopPropagation();
      if (busy || !input.reportValidity()) return;
      const value = Number(input.value);
      if (!Number.isInteger(value)) return;
      const field = input.hasAttribute('data-v4-neg-year') ? 'dueYear' : 'amount';
      const promise = data().promise;
      if (promise) void run(() => api.savePromise({...promise,[field]:value},measureId));
    }
    function attach(nextHost) {
      if (host === nextHost) return;
      destroy();
      host = nextHost;
      host.addEventListener('click',click);
      host.addEventListener('change',change);
    }
    function destroy() {
      host?.removeEventListener('click',click);
      host?.removeEventListener('change',change);
      host = null;
    }
    return {render,attach,destroy,summarize};
  }
  G.V4Negotiation = {create,model};
})(globalThis);
