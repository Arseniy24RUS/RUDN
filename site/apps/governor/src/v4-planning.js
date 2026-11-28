/* Player-facing planners for the four-term campaign. The controller calculates every quote. */
(function (root) {
  'use strict';
  const G=root.GovernorGame;
  const copy={
    plan:['План года','Annual plan','年度计划'],
    pick:['Выбрать программы','Choose programmes','选择项目'],
    programmes:['Областные программы','Regional programmes','全区项目'],
    programmePlan:['Программы года','This year’s programmes','本年度项目'],
    programmeEmpty:['Областные программы не добавлены в план','No regional programmes in the plan','计划中尚无全区项目'],
    districtServices:['Местные услуги','Local services','地方服务'],
    districtHelp:['Выберите услугу для конкретного района.','Choose a service for a specific district.','为具体地区选择服务。'],
    mapPlan:['План на карте','Map projects in the plan','计划中的地图项目'],
    programmeSector:['Отрасль бюджета','Budget sector','预算领域'],
    allSectors:['Все отрасли','All sectors','全部领域'],
    programmeHelp:['Выберите, какие отрасли поддержать. Расходы войдут в их разделы бюджета.','Choose which sectors to support. Spending goes into their budget categories.','选择支持的领域，支出计入相应预算分类。'],
    constructionHelp:['Выберите объект, затем свободную площадку на карте.','Choose a facility, then an available site on the map.','先选择设施，再在地图上选择可用地块。'],
    districtLocation:['Район: {names}','District: {names}','地区：{names}'],
    districtsLocation:['Районы: {names}','Districts: {names}','地区：{names}'],
    allDistrictsLocation:['Все пять районов','All five districts','全部五个地区'],
    noProgrammes:['Новых программ в этой отрасли сейчас нет.','No new programmes are currently available in this sector.','该领域目前没有可用的新项目。'],
    noConstruction:['Новых строек в этом районе сейчас нет.','No new construction is currently available in this district.','该地区目前没有可用的新建设项目。'],
    noDistrictServices:['Новых местных услуг в этом районе сейчас нет.','No new local services are currently available in this district.','该地区目前没有可用的新地方服务。'],
    continuity:['Продолжить работу','Keep services running','延续服务'],
    continuityHelp:['Продлите финансирование или восстановите работу объектов и программ.','Renew funding or restart facilities and programmes.','续拨资金，或恢复设施及项目的运行。'],
    selected:['В плане','In the plan','已列入计划'],
    remove:['Убрать из плана','Remove from plan','移出计划'],
    add:['Добавить в план','Add to plan','加入计划'],
    empty:['Новые проекты не добавлены','No new projects on the plan','计划中无新增项目'],
    continueEmpty:['Оставить план без новых мер','Leave the plan without new measures','本年暂不启动新措施'],
    portfolioFilter:['Район','District','地区'],
    all:['Вся область','Whole region','全地区'],
    construction:['Строительство','Construction','建设'],
    service:['Программа или услуга','Programme or service','项目或服务'],
    chapterRange:['Пятилетка {n} · {start}–{end}','Term {n} · {start}–{end}','第{n}个五年期 · {start}–{end}'],
    yearCash:['Остаток по плану','Projected cash balance','计划余额'],
    yearSpending:['Из казны в этом году','From the treasury this year','本年国库支出'],
    baseBuildCost:['Базовая смета','Base construction cost','基础建设预算'],
    fundingCost:['На продолжение','Continuation funding','续期投入'],
    renewalFee:['На продление','Renewal cost','续期费用'],
    restorationFee:['На восстановление','Restoration cost','恢复费用'],
    shortage:['Прогнозный дефицит в {year} году','Projected shortfall in {year}','{year}年预计赤字'],
    invalidPlan:['Проверьте условия плана','Check the plan requirements','请检查计划条件'],
    upperTax:['Налоговая нагрузка, % от базовой','Tax burden, % of baseline','税负，基准的百分比'],
    taxRevenue:['Налоговые поступления','Tax receipts','税收收入'],
    taxChoiceDelta:['Эффект выбранной нагрузки','Effect of the selected tax burden','所选税负的影响'],
    taxBaseDelta:['Влияние занятости на налоговую базу','Employment effect on the tax base','就业对税基的影响'],
    businessDelta:['Изменение поддержки бизнеса от налога','Tax effect on business satisfaction','税负对企业满意度的影响'],
    familyDelta:['Изменение поддержки семей от налога','Tax effect on household satisfaction','税负对家庭满意度的影响'],
    baseLoad:['100% — базовая нагрузка','100% is the baseline','100%为基准税负'],
    fund:['Инвестиционный фонд','Regional investment fund','地区投资基金'],
    fundIntro:['Свободные средства можно вложить под 4% годовых. Вклад и простой доход вернутся одной выплатой.','Invest available funds at 4% per year. The principal and simple interest return in one payment.','可将可用资金按年利率4%投入基金，本金和单利到期一次支付。'],
    fundAvailable:['Доступно для взноса','Available to invest','可投资金额'],
    fundAmount:['Взнос, млн ₽','Contribution, m RUB','投入，百万卢布'],
    fundContribution:['Взнос в фонд','Contribution to the fund','基金投入'],
    fundLimit:['Взнос возможен из свободного остатка. Он недоступен вместе с новым займом или изъятием резерва.','Use cash left after all spending. A new loan or reserve withdrawal rules out a contribution.','只能使用支出后结余。新增贷款或提取储备时不可投入。'],
    fundLate:['До конца кампании осталось меньше двух лет для нового вклада.','A new contribution cannot mature before the campaign ends.','新投入无法在任期结束前到期。'],
    fundNoTerm:['Выберите сумму и срок, чтобы увидеть выплату.','Enter an amount and term to see the payout.','输入金额和期限即可查看支付额。'],
    fundEdit:['Рассчитать вклад','Calculate a contribution','测算投入'],
    fundSave:['Добавить вклад в план','Add contribution to the plan','将投入加入计划'],
    fundRemove:['Убрать вклад','Remove contribution','移除投入'],
    fundPayout:['Выплата','Payout','支付'],
    fundPrincipal:['Возврат капитала','Principal returned','收回本金'],
    fundIncome:['Доход фонда','Fund income','基金收益'],
    fundMaturity:['Год выплаты','Maturity year','到期年份'],
    fundPending:['Вклады к получению','Outstanding contributions','未到期投入'],
    goals:['Цели пятилетки','Term targets','五年目标'],
    checkpoint:['Итоги пятилетки','Term results','五年结果'],
    nextChapter:['Открыт следующий каталог мер','The next set of measures is available','下一期措施已开放'],
    goalsMore:['Все 12 показателей','All 12 indicators','全部12项指标'],
    from:['На начало пятилетки','At term start','五年期初'],
    actual:['Последний факт','Latest actual','最近实际值'],
    target:['Цель к {year} году','Target by {year}','{year}年目标'],
    met:['Достигнута','Met','已达成'],
    above:['Не ниже','At least','至少'],
    below:['Не выше','At most','不超过'],
    calculation:['Как считается','How it is calculated','计算说明'],
    referenceWithoutPolicies:['При стандартных решениях с начала кампании','With baseline decisions since the start','自开局采用基准决策的结果'],
    mapProgress:['Что изменилось на карте','What changed on the map','地图上的变化'],
    satisfaction:['Удовлетворённость граждан','Residents’ satisfaction','居民满意度'],
    reportKpi:['Результат по KPI','KPI score','指标成绩'],
    reportSatisfaction:['Результат по удовлетворённости','Satisfaction score','满意度成绩'],
    scoreChoice:['Засчитывается лучший из двух результатов','The higher of the two scores counts','按两项成绩中的较高者计分'],
    ratings:['Как рассчитывается результат','How the score is calculated','成绩如何计算'],
    scoreHelp:['Путь KPI учитывает продвижение по 12 целям. Путь удовлетворённости учитывает среднюю поддержку жителей за каждый период. У каждого пути максимум 5 баллов. Веса пятилеток — 10%, 20%, 30% и 40%.','The KPI path measures progress on 12 goals. The satisfaction path uses average resident support over each term. Either path can earn 5 points. Term weights are 10%, 20%, 30%, and 40%.','指标成绩按12项目标的进度计算。满意度成绩按各期居民平均支持度计算。两种途径均可得5分。四期权重为10%、20%、30%和40%。'],
    journalScore:['Балл для журнала','Score for the gradebook','本次计入成绩册的分数'],
    journalRounding:['Балл в журнале округляется вверх до целого.','The gradebook score is rounded up to a whole point.','成绩册分数向上取整。'],
    replay:['Начать новый срок','Begin another campaign','开始新的任期'],
    replayHint:['Новая область начнёт с 2026 года.','Start a fresh region in 2026.','新区将从2026年开始。'],
    noValue:['Нет данных','No data','无数据'],
    noSite:['Выберите свободный участок','Choose an available site','选择可用地块'],
    occupied:['Участок уже занят или зарезервирован другой мерой','This site is occupied or reserved by another measure','地块已被其他措施占用或预留'],
    shortageNow:['В этом году не хватит средств','This year’s funds fall short','本年度资金不足'],
    effect:['Эффект для жителей','Effect for residents','对居民的影响'],
    already:['Уже включено в план','Already in the plan','已加入计划'],
    tutorialPortfolio:['Добавьте ещё одну меру, чтобы проверить общий бюджет, или продолжите с выбранным планом.','Add another measure to check the combined budget, or continue with your current plan.','再添加一项措施核对总预算，或继续使用当前计划。'],
    tutorialFund:['Откройте расчёт вклада и проверьте год выплаты. Включать вклад в план необязательно.','Open the fund forecast and find the payout year. Investing is optional.','打开基金预测并核对支付年份。投入是自愿的。'],
    tutorialContinue:['Продолжить обучение','Continue the tutorial','继续教程'],
    tutorialShort:['Урок','Tutorial','教程'],
    tutorialBeforeClose:['Для закрытия первого года завершите практику с советником.','Complete the advisor’s exercises to close your first year.','请先完成顾问安排的练习，再结算首年。'],
    recent:['Изменилось за год','Changed this year','本年度有变化'],
    districtMeasures:['Выбрать меры для района','Choose measures for this district','为本区选择措施'],
    population:['Жители','Residents','居民'],
    coverage:['Доступность услуг','Service access','服务可及性'],
    expiring:['Финансирование заканчивается в этом году','Funding ends this year','资助将在本年结束'],
    renewHelp:['Продлите работу сейчас, если услуга нужна району дальше.','Renew now if the district still needs the service.','如果本区仍需要这项服务，请现在续期。']
  };

  function create(api) {
    const {state,quote,ui,t,local,esc,label,button,money,number,language,measures}=api;
    const tr=(key,values={})=>{
      const row=copy[key];
      if(!row)return t(key,values);
      return Object.entries(values).reduce((line,[name,value])=>line.replaceAll('{'+name+'}',value),row[{ru:0,en:1,zh:2}[language()]]);
    };
    const drafted=id=>state().draft.measures.find(row=>row.measureId===id);
    const projectFor=id=>quote()?.projects?.find(row=>row.draftMeasureId===id);
    const picked=()=>state().draft.measures;
    const chapter=()=>G.V4Campaign.chapter(state().year);
    const period=c=>tr('chapterRange',{n:c.number,start:c.startYear,end:c.endYear});
    const siteLabels=id=>api.siteLabel(id);
    function spendingNow(project, finance=quote()?.finance) {
      if(!finance?.operations)return project.costNow;
      return finance.operations.reduce((total,operation)=>total+
        (operation.direction==='out'&&operation.id.startsWith(project.id+':')?operation.amount:0),0);
    }
    function list(projects,{editable=false,finance}={}) {
      if(!projects.length)return '<p class="v3-muted">'+esc(tr('empty'))+'</p>';
      return '<ul class="v4-plan-list">'+projects.map(row=>{
        const id=row.draftMeasureId||row.measureId;
        const calculated=editable?projectFor(id):row;
        const measure=editable?measures().find(item=>item.id===id):null;
        const name=local(row.labels||calculated?.labels||measure?.labels)||id;
        const site=siteLabels(row.siteId);
        const title=editable?'<button type="button" class="v4-plan-name" data-v3-measure="'+esc(id)+'">'+esc(name)+'</button>':'<strong>'+esc(name)+'</strong>';
        return '<li><div>'+title+
          (site?'<small>'+esc(site)+'</small>':'')+
          (calculated?'<small>'+esc(tr('yearSpending')+' '+money(spendingNow(calculated,finance))+' · '+t('plannedOpen')+' '+calculated.openingYear+
            (calculated.annualOpex?' · '+money(calculated.annualOpex)+' '+t('annual'):''))+'</small>':'')+
          (editable&&calculated?'<button type="button" class="v4-plan-negotiate" data-v3-action="negotiate" data-measure-id="'+
            esc(id)+'" aria-label="'+esc(t('negotiationOpen')+' · '+name)+'">'+esc(t('negotiationOpen'))+'</button>':'')+
          '</div>'+(editable?button('×','v4-remove','secondary','data-measure-id="'+esc(id)+'" aria-label="'+esc(tr('remove')+' · '+name)+'"'):'')+'</li>';
      }).join('')+'</ul>';
    }
    function summary() {
      const finance=quote()?.finance;
      const continuing=measures().filter(row=>isContinuing(row)&&scope(row)==='programmes');
      const programmes=picked().filter(row=>scope(row)==='programmes');
      return '<section class="v3-project-summary"><h2>'+esc(tr('programmePlan'))+'</h2><div class="v3-card v3-card-body">'+
        (programmes.length?list(programmes,{editable:true}):'<p class="v3-muted">'+esc(tr('programmeEmpty'))+'</p>')+
        (finance?label(tr('yearCash'),money(finance.cashEnd))+warning(finance):'')+
        button(esc(tr('pick')),'measures','secondary full','data-anchor="measure.select"')+'</div>'+
        continuity(continuing)+'</section>';
    }
    function warning(finance) {
      const year=finance.futureRows.find(row=>row.cash<0);
      return year?'<p class="v4-money-warning">'+esc(tr('shortage',{year:year.year})+' · '+money(-year.cash))+'</p>':'';
    }
    const isContinuing=row=>row.kind==='renew'||row.kind==='restore';
    const sourceFor=row=>!row.kind&&row.measureId?measures().find(item=>item.id===row.measureId)||row:row;
    const existingFor=row=>row.projectId?state().projects.find(item=>item.id===row.projectId):null;
    function locations(row) {
      const source=sourceFor(row),project=existingFor(source);
      const targets=project?.targets||source.targets||source.serviceEffect?.targets||project?.serviceEffect?.targets||{[source.districtId]:1};
      return Object.keys(targets).filter(id=>G.V3Rules.DISTRICTS[id]);
    }
    function scope(row) {
      const source=sourceFor(row),project=existingFor(source);
      if(row.siteId||source.kind==='capital'||source.siteIds?.length||project?.siteId||project?.kind==='capital')return 'construction';
      return locations(source).length>1?'programmes':'district';
    }
    function mapPlan(district='all') {
      const rows=picked().filter(row=>scope(row)!=='programmes'&&(district==='all'||locations(row).includes(district)));
      if(!rows.length)return '';
      return '<details class="v4-map-plan" data-v4-map-plan><summary><span>'+esc(tr('mapPlan'))+'</span><strong>'+rows.length+
        '</strong></summary>'+list(rows,{editable:true})+'</details>';
    }
    function catalogueRow(row,{geography=true}={}) {
      const selected=Boolean(drafted(row.id)),calculated=selected?projectFor(row.id):null;
      const thumb=G.V4DecisionMedia?.thumbnail(row.id);
      const preview=thumb?'<img class="v4-catalog-thumb" width="46" height="46" src="'+esc(api.asset(thumb))+'" alt="" loading="lazy" decoding="async">':'';
      const districts=locations(row),annualOpex=calculated?.annualOpex??row.annualOpex;
      const priceLabel=calculated?tr('yearSpending'):isContinuing(row)?tr('fundingCost'):
        scope(row)==='construction'?tr('baseBuildCost'):t('launchCost');
      const location=geography&&districts.length?'<small class="v4-catalog-location">'+esc(districts.length===Object.keys(G.V3Rules.DISTRICTS).length?
        tr('allDistrictsLocation'):tr(districts.length===1?'districtLocation':'districtsLocation',{
          names:districts.map(id=>api.districtLabel(id)).join(', ')}))+'</small>':'';
      return '<button type="button" class="v3-measure" data-v3-measure="'+esc(row.id)+'" aria-pressed="'+selected+'">'+preview+
        '<span class="v4-catalog-copy"><strong>'+esc(local(row.labels))+'</strong>'+location+'<small class="v4-catalog-cost">'+
        esc(priceLabel+' '+money(calculated?spendingNow(calculated):row.cost)+(annualOpex?' · '+money(annualOpex)+' '+t('annual'):''))+'</small>'+
        (selected?'<small class="v4-catalog-selected">'+esc(tr('selected'))+'</small>':'')+
        '</span><span aria-hidden="true">'+(selected?'✓':'›')+'</span></button>';
    }
    function continuity(rows) {
      if(!rows.length)return '';
      return '<section class="v4-continuity" data-v4-continuity data-v4-expiring><h2>'+esc(tr('continuity'))+'</h2>'+
        '<p class="v3-muted">'+esc(tr('continuityHelp'))+'</p><div class="v3-card">'+rows.map(row=>catalogueRow(row)).join('')+'</div></section>';
    }
    function catalogue() {
      const current=chapter(),view=ui(),mode=['construction','district'].includes(view.catalogueMode)?view.catalogueMode:'programmes',onMap=mode!=='programmes';
      const groups=onMap?Object.entries(G.V3Rules.DISTRICTS).map(([id,d])=>[id,local(d.labels)]):
        Object.keys(G.V3Rules.SECTOR_SHARES).map(id=>[id,t(id)]);
      const requested=onMap?view.constructionDistrict:view.programmeSector;
      const filter=groups.some(([id])=>id===requested)?requested:'all';
      const matches=row=>filter==='all'||(onMap?locations(row).includes(filter):row.sector===filter);
      const available=measures(),options=available.filter(row=>!isContinuing(row)&&row.kind!=='defer'&&
        scope(row)===mode&&matches(row));
      const returning=onMap?'nav.map':view.catalogueOrigin==='budget'?'nav.budget':'nav.decisions';
      return api.back('back',t(returning))+api.heading(tr(mode==='district'?'districtServices':mode))+
        '<p class="v3-muted v4-catalog-period">'+esc(period(current)+' · '+local(current.labels))+'</p>'+
        (view.tutorialStep===3&&!onMap?'':'<p class="v4-catalog-help">'+esc(tr(mode==='construction'?'constructionHelp':mode==='district'?'districtHelp':'programmeHelp'))+'</p>')+
        '<label class="v3-field v4-catalog-filter"><span>'+esc(tr(onMap?'portfolioFilter':'programmeSector'))+
        '</span><select name="'+(onMap?'construction-district':'programme-sector')+'">'+
        [['all',tr(onMap?'all':'allSectors')],...groups].map(([id,name])=>
          '<option value="'+esc(id)+'" '+(id===filter?'selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>'+
        (view.tutorialStep===3&&!onMap?button(esc(tr('continueEmpty')),'defer','secondary full'):'')+
        '<div class="v3-measures v4-catalog" data-v4-catalogue-mode="'+mode+'">'+groups.map(([id,name])=>{
          const rows=options.filter(row=>(onMap?row.districtId:row.sector)===id);
          if(!rows.length)return '';
          return '<section data-v4-'+(onMap?'district':'sector')+'="'+esc(id)+'"><h2>'+esc(name)+
            '</h2><div class="v3-card">'+rows.map(row=>catalogueRow(row,{geography:!onMap})).join('')+'</div></section>';
        }).join('')+'</div>'+(options.length?'':'<p class="v3-muted">'+esc(tr(mode==='construction'?'noConstruction':mode==='district'?'noDistrictServices':'noProgrammes'))+'</p>')+
        continuity(available.filter(row=>isContinuing(row)&&scope(row)===mode&&matches(row)));
    }
    function taxMetrics(finance,rate) {
      const effects=G.V3Rules.taxSupportEffects(rate);
      const delta=value=> (value>0?'+':'')+number(value,2);
      return label(tr('taxRevenue'),money(finance.taxes))+label(tr('yearCash'),money(finance.cashEnd))+
        label(tr('taxChoiceDelta'),money(finance.taxDelta))+label(tr('taxBaseDelta'),money(finance.employmentTaxDelta))+
        label(tr('businessDelta'),delta(effects.business))+label(tr('familyDelta'),delta(effects.families));
    }
    function taxes(finance,current) {
      const rate=state().draft.taxRate,trial=current.taxPractice;
      return '<section class="v3-card v3-card-body" data-anchor="budget.tax"><label class="v3-field"><span>'+esc(tr('upperTax'))+
        '</span><strong id="v4-tax-value">'+rate+'%</strong><input aria-describedby="v4-tax-baseline" id="v4-tax-rate" name="tax-rate" type="range" min="88" max="112" step="1" value="'+rate+'"></label>'+
        '<div id="v4-tax-baseline" class="v4-tax-ticks"><span>88%</span><span>'+esc(tr('baseLoad'))+'</span><span>112%</span></div>'+
        '<div id="v4-tax-readout">'+taxMetrics(finance,rate)+'</div>'+
        (trial&&!state().history.length?'<div class="v3-tax-practice" id="v3-tax-practice"><h3>'+esc(t('taxPractice'))+'</h3>'+
          '<p>'+trial.from+'% → '+trial.to+'%</p>'+label(tr('taxRevenue'),money(trial.taxesBefore)+' → '+money(trial.taxesAfter))+
          label(tr('yearCash'),money(trial.cashBefore)+' → '+money(trial.cashAfter))+
          (rate===trial.from?'<p>'+esc(t('taxRestored'))+'</p>':button(esc(t('restoreTax')),'restore-tutorial-tax','secondary'))+
          (current.tutorialStep===6?button(esc(t('toStats')),'tutorial-next','secondary'):'')+'</div>':'')+'</section>';
    }
    function updateTax(host,rate) {
      const out=host.querySelector('#v4-tax-readout');
      if(!out)return;
      const preview=api.controller.previewDraft({taxRate:rate});
      host.querySelector('#v4-tax-value').textContent=rate+'%';
      out.innerHTML=taxMetrics(preview.finance,rate);
    }
    function funding(finance) {
      const draft=finance.investmentDraft;
      const outstanding=(state().finance.investments||[]).filter(row=>row.maturityYear>=state().year);
      const buttonText=draft?tr('change'):tr('fundEdit');
      return '<section class="v3-card v3-card-body" data-anchor="budget.investment"><h2>'+esc(tr('fund'))+'</h2>'+
        (draft?payout(draft):'<p class="v3-muted">'+esc(tr('fundIntro'))+'</p>')+
        (state().year<=2043?button(esc(buttonText),'v4-fund','secondary full'):'<p>'+esc(tr('fundLate'))+'</p>')+
        (outstanding.length?'<details><summary>'+esc(tr('fundPending'))+'</summary>'+
          outstanding.map(row=>label(String(row.maturityYear),money(row.payout))).join('')+'</details>':'')+'</section>';
    }
    function payout(row) {
      return label(tr('fundMaturity'),row.maturityYear)+label(tr('fundPrincipal'),money(row.principal))+
        label(tr('fundIncome'),money(row.income))+label(tr('fundPayout'),money(row.payout));
    }
    function investmentPreview(values,visible) {
      const row=G.V3Rules.investmentQuote(values.principal,values.termYears,state().year);
      return row?payout(row)+(visible&&!investable(values)?'<p class="v4-money-warning">'+esc(tr('fundLimit'))+'</p>':''):
        '<p>'+esc(tr('fundNoTerm'))+'</p>';
    }
    const investable=values=>{
      const current=quote()?.finance;
      return Boolean(current&&G.V3Rules.investmentQuote(values.principal,values.termYears,state().year)&&
        values.principal<=current.investmentHeadroom);
    };
    function investment(values) {
      const room=quote()?.finance.investmentHeadroom??0;
      return api.back('back',t('nav.budget'))+api.heading(tr('fund'))+'<form id="v4-fund-form" class="v3-card v3-card-body">'+
        '<p>'+esc(tr('fundIntro'))+'</p>'+label(tr('fundAvailable'),money(room))+
        '<label class="v3-field"><span>'+esc(tr('fundAmount'))+'</span><input type="number" min="1" step="1" inputmode="numeric" name="investment-principal" value="'+esc(values.principal||'')+'"></label>'+
        '<label class="v3-field"><span>'+esc(t('loanTerm'))+'</span><select name="investment-term">'+[2,3,4,5].filter(n=>state().year+n<=2045).map(n=>
          '<option '+(n===values.termYears?'selected':'')+' value="'+n+'">'+n+'</option>').join('')+'</select></label>'+
        '<div id="v4-investment-preview">'+investmentPreview(values,true)+'</div>'+
        button(esc(tr('fundSave')),'v4-save-fund','primary full',investable(values)?'':'disabled')+
        (state().draft.investment?button(esc(tr('fundRemove')),'v4-remove-fund','secondary full'):'')+'</form>';
    }
    function kpiValue(value,unit) {
      if(value===null||value===undefined||!Number.isFinite(value))return tr('noValue');
      const translated={percent:'%',pct:'%',years:language()==='ru'?' лет':language()==='zh'?'年':' yr',rub:' ₽',people:''};
      const digits=unit==='people'?0:2;
      return number(value,digits)+(translated[unit]??'');
    }
    function goals(status,closed=false) {
      if(!status)return '';
      const {chapter:ch,entries}=status;
      const goalRow=row=>'<li><strong>'+esc(local(row.labels))+'</strong><small>'+
        esc(tr('from')+' '+kpiValue(row.start,row.unit))+'</small><div><b>'+esc(kpiValue(row.actual,row.unit))+'</b><span>'+
        esc((row.inverse?'≤ ':'≥ ')+kpiValue(row.target,row.unit))+'</span></div>'+
        '<meter min="0" max="100" value="'+(row.progress??0)+'" aria-label="'+esc(local(row.labels))+'"></meter>'+
        (row.met?'<small class="positive">'+esc(tr('met'))+'</small>':'')+
        '<details><summary>'+esc(tr('calculation'))+'</summary><small>'+esc(local(row.description))+'</small>'+
        (row.reference==null?'':label(tr('referenceWithoutPolicies'),kpiValue(row.reference,row.unit)))+'</details></li>';
      const all=entries||[];
      const priority=Array.isArray(ch.priority)?all.filter(row=>ch.priority.includes(row.id)):all.slice(0,4);
      const rest=all.filter(row=>!priority.includes(row));
      const group=rows=>'<ul class="v4-kpi-list">'+rows.map(goalRow).join('')+'</ul>';
      return '<section class="v3-card v3-card-body v4-goals"'+(closed?'':' id="v4-goals"')+' aria-label="'+esc(tr(closed?'checkpoint':'goals'))+'">'+
        '<h2>'+esc(tr(closed?'checkpoint':'goals'))+'</h2><p>'+esc(period(ch)+' · '+local(ch.labels))+'</p>'+
        '<p class="v3-muted">'+esc(tr('actual')+' / '+tr('target',{year:ch.endYear}))+'</p>'+group(priority)+
        (rest.length?'<details><summary>'+esc(tr('goalsMore'))+'</summary>'+group(rest)+'</details>':'')+
        label(tr('satisfaction'),kpiValue(status.supportAverage??state().stats.support,'index')+' / '+kpiValue(ch.satisfactionTarget,'index'))+
        (closed?label(tr('reportKpi'),number(status.kpi,1)+'%')+label(tr('reportSatisfaction'),number(status.satisfaction,1)+'%'):
          '<details><summary>'+esc(tr('ratings'))+'</summary><p>'+esc(tr('scoreHelp'))+'</p></details>')+'</section>';
    }
    function archive() {
      const previous=[1,2,3,4].map(n=>G.V4Campaign.status(state(),n)).filter(row=>row.closed);
      return previous.map(row=>'<details class="v3-card v3-card-body"><summary>'+esc(tr('checkpoint')+' · '+period(row.chapter))+'</summary>'+
        goals(row,true)+'</details>').join('');
    }
    return {tr,picked,drafted,projectFor,spendingNow,period,list,scope,mapPlan,summary,catalogue,warning,taxes,updateTax,funding,investment,investmentPreview,investable,goals,archive};
  }

  G.V4Planning={create};
})(globalThis);
