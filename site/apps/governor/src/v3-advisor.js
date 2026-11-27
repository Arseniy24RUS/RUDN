(function (root) {
  'use strict';
  const G=root.GovernorGame;
  const TARGETS={tax:['budget','budget.tax'],loan:['budget','budget.loan'],budget:['budget','budget.review'],
    route:['map','map.inspectOrPlace'],sites:['map','map.inspectOrPlace'],compare:['budget','budget.review'],event:['decisions','event.open']};
  const INTENTS=new Set([...Object.keys(TARGETS),'unknown']);
  const CHOICES={
    tax:/налог|tax(?:es)?|税/iu,loan:/за[её]м|займ|кредит|долг|loan|debt|借|贷款|债/iu,
    sites:/участ|площадк|строи|site|plot|build|选址|地块|建校/iu,
    route:/мост|дорог|маршрут|переправ|bridge|road|route|桥|道路|路线/iu,
    budget:/бюджет|остаток|budget|treasury|现金|预算/u,
    event:/ситуаци|событи|event|事件/u
  };
  function intent(question) {
    if (CHOICES.tax.test(question)&&CHOICES.loan.test(question)) return 'compare';
    if (CHOICES.route.test(question)) return 'route';
    return Object.keys(CHOICES).find(key=>CHOICES[key].test(question)) || 'unknown';
  }
  function factual(state,quote) {
    const rules=G.V3Rules;
    const finance=quote?.finance;
    const taxes=Object.entries(rules.TAX_MODES).map(([id,factor])=>({
      id,value:Math.round((finance?.taxBase||0)*factor/100)
    }));
    const sites=(state.schoolMap?.sites||[]).map(site=>rules.schoolQuote(state,site.id)).filter(Boolean).map(site=>({
      id:site.id,year:site.firstServiceYear,capex:site.capexMillion,opex:site.annualOpexMillion,
      served:site.served,demand:site.demand,south:site.servedByZone?.southern??0,bridgeClosed:site.servedWithBridgeClosed
    }));
    return {taxes,sites,budget:{cash:finance?.cashEnd??state.finance.cash,debt:finance?.debtEnd??state.finance.debt,
      reserve:finance?.reserveEnd??state.finance.reserve,principal:finance?.principalDue??0,interest:finance?.interest??0,
      annualPercent:finance?.annualPercent??state.finance.annualPercent}};
  }
  function explain(kind,state,quote,textLanguage){
    const l=(r,e,z)=>({ru:r,en:e,zh:z}[textLanguage]||r);
    const n=value=>new Intl.NumberFormat(l('ru-RU','en-GB','zh-CN'),{maximumFractionDigits:2}).format(value);
    const unit=l('млн ₽','million RUB','百万卢布'), facts=factual(state,quote);
    const fmt=value=>n(value)+' '+unit;
    const years=l('Прогноз на ','Forecast for ','预测年份 ')+state.year+'. ';
    const labels={low:l('Низкая','Low','低'),moderate:l('Умеренная','Moderate','中'),high:l('Высокая','High','高')};
    switch(kind){
      case 'tax': {
        const effect=G.V3Rules.taxSupportEffects('high');
        const scores=Object.entries(effect).map(([key,value])=>[key,n(value)]);
        const declines=Object.fromEntries(scores);
        return years+facts.taxes.map(row=>labels[row.id]+' — '+fmt(row.value)).join(' · ')+'. '+
          l('При высокой нагрузке, если остальные решения те же, налоговый вклад в индекс поддержки бизнеса составляет '+declines.business+' пункта, у семей '+declines.families+'. Команда «Налоги» находится в бюджете.',
            'Other choices equal, the high-tax contribution to support is '+declines.business+' points for business and '+declines.families+' for families. Open Budget and Taxes.',
            '其他决策不变时，高税率对企业支持指数的贡献为 '+declines.business+' 点，对家庭为 '+declines.families+' 点。打开“预算”中的“税收”。');
      }
      case 'loan': {
        const draft=state.draft.loan, rate=facts.budget.annualPercent;
        const schedule=draft?.principal&&draft?.termYears?G.V3Rules.loanSchedule(draft.principal,rate,draft.termYears,state.year):[];
        const first=schedule[0];
        return years+l('Конечный долг ','Closing debt ','期末债务 ')+fmt(facts.budget.debt)+'. '+
          (first?l('Первый платёж по проекту займа ','The first proposed loan payment is ','拟议贷款的首笔还款为 ')+first.year+' · '+fmt(first.principal+first.interest)+'. ':'')+
          l('В «Бюджете» можно проверить срок, основной долг и проценты.','Budget shows term, principal and interest separately.','在“预算”中可分别核对期限、本金和利息。');
      }
      case 'sites': case 'route': {
        if(!facts.sites.length)return l('Площадок пока нет в реестре.','No candidate sites are in the register.','登记册中暂无可选地块。');
        const fastest=[...facts.sites].sort((a,b)=>a.year-b.year||a.capex-b.capex)[0];
        const reach=[...facts.sites].sort((a,b)=>b.served-a.served||a.capex-b.capex)[0];
        const equity=[...facts.sites].sort((a,b)=>b.south-a.south||a.capex-b.capex)[0];
        const siteNames={yard:l('Во дворах','In the courtyards','居民院落'),bridge:l('У моста','By the bridge','桥边'),
          south:l('Южная развилка','Southern junction','南部路口')};
        const label=row=>siteNames[row.id]||row.id;
        const line=(caption,row)=>caption+' '+label(row)+' · '+row.year+' · '+n(row.served)+'/'+n(row.demand)+' · '+fmt(row.capex);
        return years+[line(l('Быстрее','Soonest','最早投入使用'),fastest),line(l('Больше мест','Widest coverage','覆盖最多'),reach),
          l('Южный квартал','Southern quarter','南部街区')+' · '+label(equity)+' · '+n(equity.south),l('Для площадки наибольшего охвата при закрытом мосте расчёт даёт','With the bridge closed the highest-reach site would serve','假设桥梁关闭，最高覆盖地块预计服务')+' '+n(reach.bridgeClosed)].join('\n');
      }
      case 'budget': case 'compare':
        return years+l('Остаток ','Cash left ','结余 ')+fmt(facts.budget.cash)+' · '+l('резерв ','reserve ','储备 ')+fmt(facts.budget.reserve)+'. '+
          l('Заём приносит деньги сейчас, но добавляет проценты и возврат основного долга. Налог меняет ежегодные доходы и отклик групп. Сначала проверьте, оплатите ли услуги после открытия.',
            'A loan raises cash now and adds repayment and interest. Taxes change recurring receipts and group responses. Check that services can be funded after opening.',
            '贷款增加当前资金，也带来本金和利息。税收影响经常性收入和群体反应。请先核对服务启用后的资金。');
      case 'event':
        return l('Откройте ситуацию на вкладке «Решения» и сравните действие сейчас со сроком результата.','Open the event under Decisions and compare each immediate action with the timing of its result.','在“决策”打开年度情境，比较当下行动和结果出现的时间。');
      default:
        return l('Уточните цель — где найти команду, сравнить две площадки, оценить заём или проверить остаток.','Ask where to find a control, compare two sites, review a loan or check cash.','可询问如何找到操作、比较两个地块、评估贷款或核对结余。');
    }
  }
  function create(api) {
    let pending=null;
    function navigate(target) {
      const state=api.state();
      if(!state||state.attemptId!==target?.attemptId||state.revision!==target.revision||state.year!==target.year||
          api.quote()?.signature!==target.signature)return false;
      const allowed=Object.values(TARGETS).some(([tab,anchor])=>tab===target.tab&&anchor===target.anchor);
      if(!allowed)return false;
      return api.navigate(target.tab,target.anchor);
    }
    async function ask(raw,{retry=false} = {}) {
      const state=api.state(), question=String(raw).trim().slice(0,480);
      if (!state||state.completed||!question) return null;
      if(pending)return pending;
      const signature=api.quote()?.signature;
      const same=api.messages().findLast(row=>row.question===question&&row.year===state.year&&row.signature===signature);
      if(same&&(!retry||same.status==='ok'))return same;
      pending=(async()=>{
        const requestId=same?.id??crypto.randomUUID(), l=api.language(), q=api.quote();
        let kind=intent(question), mode='local', status='ok';
        const localNavigation=/^(где|как (открыть|найти)|where|how (do i find|to open)|怎么打开|在哪里)/iu.test(question);
        if(api.enabled&&api.studentKey&&!localNavigation&&navigator.onLine){
          try{
            const credential=await api.credential();
            if(!credential)throw Error('advisor/auth');
            const endpoint=new URL(api.enabled,location.href);
            if(endpoint.protocol!=='https:'&&endpoint.hostname!=='127.0.0.1'&&endpoint.hostname!=='localhost')throw Error('advisor/endpoint');
            const model=factual(state,q);
            const facts={
              taxes:model.taxes.map(row=>({mode:row.id,annualMln:row.value})),
              sites:model.sites.map(row=>({id:row.id,capex:row.capex,annualOpex:row.opex,openingYear:row.year,served:row.served,demand:row.demand})),
              budget:{cash:state.finance.cash,cashEnd:model.budget.cash,reserve:model.budget.reserve,debt:model.budget.debt,
                debtLimit:state.finance.debtLimit,shortfall:Math.max(0,-model.budget.cash)}
            };
            const res=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+credential,'content-type':'application/json'},
              signal:AbortSignal.timeout(9000),body:JSON.stringify({requestId,attemptId:state.attemptId,studentKey:api.studentKey,
                revision:state.revision,year:state.year,language:l,question,facts})});
            const data=res.ok?await res.json():null;
            if(!INTENTS.has(data?.intent))throw Error('advisor/unavailable');
            kind=data.intent;mode='cloud';
          }catch{status='unavailable';}
        }
        if(api.state()?.attemptId!==state.attemptId||api.state()?.year!==state.year||api.quote()?.signature!==signature)return null;
        const [tab,anchor]=TARGETS[kind]||[];
        const target=tab?{tab,anchor,attemptId:state.attemptId,revision:state.revision,year:state.year,signature}:null;
        const row={id:requestId,question,text:explain(kind,state,q,l),target,year:state.year,signature,mode,status};
        await api.save([...api.messages().filter(message=>message.id!==row.id),row].slice(-12));
        return row;
      })();
      try{return await pending;}finally{pending=null;}
    }
    return {messages:api.messages,ask,navigate,isPending:()=>Boolean(pending)};
  }
  G.V3Advisor={create,intent,explain,factual};
})(globalThis);
