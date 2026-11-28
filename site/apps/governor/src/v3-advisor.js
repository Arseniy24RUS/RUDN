(function (root) {
  'use strict';
  const G=root.GovernorGame;
  const MODEL='gpt-6.1-terra';
  const VOICE_VERSION=1;
  const TARGETS={tax:['budget','budget.tax'],loan:['budget','budget.loan'],budget:['budget','budget.review'],
    route:['map','map.inspectOrPlace'],sites:['map','map.inspectOrPlace'],compare:['budget','budget.review'],event:['decisions','event.open']};
  const INTENTS=new Set([...Object.keys(TARGETS),'unknown']);
  const UNAVAILABLE={
    ru:'ИИ-советник сейчас недоступен. Повторите запрос.',
    en:'The AI advisor is unavailable right now. Try your question again.',
    zh:'AI 顾问暂时无法回答，请重试。'
  };
  const QUOTA={
    'daily-quota':{
      ru:'На сегодня лимит вопросов ИИ-советнику исчерпан. Попробуйте завтра.',
      en:'You’ve reached today’s limit for AI advisor questions. Try again tomorrow.',
      zh:'今天向 AI 顾问提问的次数已用完，请明天再试。'
    },
    'attempt-quota':{
      ru:'Лимит вопросов ИИ-советнику для этой кампании исчерпан.',
      en:'You’ve reached the limit for AI advisor questions in this campaign.',
      zh:'本次战役中向 AI 顾问提问的次数已用完。'
    }
  };
  const SCHOOL_SITES={
    yard:{ru:'Во дворах',en:'In the courtyards',zh:'居民院落'},
    bridge:{ru:'У моста',en:'By the bridge',zh:'桥边'},
    south:{ru:'Южная развилка',en:'Southern junction',zh:'南部路口'}
  };
  const GUIDES={
    year:{
      ru:'Сначала ответьте на ситуацию года. Затем решите, нужно ли отдельное улучшение.\nНа карте проверьте, где проект поможет людям. В бюджете посмотрите, сколько денег останется.\nКнопка ▶ открывает проверку плана. После подтверждения увидите итог года.',
      en:'First, respond to this year’s event. Then decide whether to start a separate project.\nUse the map to see where the project will help. Check how much money will be left in Budget.\nUse ▶ to review the plan. Confirm it to see the year’s results.',
      zh:'先回应年度事件，再决定是否另行启动项目。\n用地图查看项目能帮到哪个地区，再到“预算”查看还剩多少钱。\n点击▶核对计划，确认后就能看到本年的结果。'
    },
    choices:{
      ru:'Для ответа на ситуацию сравните, кому он поможет и как скоро.\nУ проектов сравните цену запуска, расходы каждый год и срок начала работы. Место тоже важно: на карте видно, где появится услуга.',
      en:'For each response to an event, check who it helps and how soon.\nFor projects, compare the upfront price, running costs and opening year. Use the map to see where the service will reach people.',
      zh:'比较事件的应对方案时，先看能帮助谁、何时见效。\n比较项目时，看启动成本、每年开支和启用年份。再用地图查看服务会覆盖哪里。'
    }
  };
  const CHOICES={
    tax:/налог|tax(?:es)?|税/iu,loan:/за[её]м|займ|кредит|долг|loan|debt|借|贷款|债/iu,
    sites:/участ|площадк|строи|site|plot|build|选址|地块|建校/iu,
    route:/мост|дорог|маршрут|переправ|bridge|road|route|桥|道路|路线/iu,
    budget:/бюджет|остаток|budget|treasury|现金|预算/u,
    event:/ситуаци|событи|event|事件/u
  };
  const ROLE=/^(?:кто (?:ты|вы)|жив[а-яё]* ли (?:ты|вы)|(?:ты|вы) (?:вообще )?(?:кто|жив[а-яё]*|настоящ[а-яё]*|человек|на связи|здесь|тут)|who are you|are you (?:alive|real|human|there)|你是(?:谁|真人吗|人吗|活人吗|活的吗)|你还?在吗|你还?活着吗)\s*[!?.？。]*$/iu;
  const TECHNOLOGY=/^(?:(?:ты|вы) (?:это )?(?:ИИ|бот|чат-бот|искусственный интеллект)|are you (?:an? )?(?:ai|(?:chat)?bot)|你是(?:人工智能|AI|机器人)吗)\s*[!?.？。]*$|(?:какая у тебя модель|какую модель ты используешь|what model (?:are you|do you use)|你用(?:的)?什么模型)/iu;
  const SCORE=/оценк[ауеи]|балл[а-яё]*|\b(?:grade|score|points?)\b|成绩|得分|分数|评分|计分/iu;
  const JOURNAL=/журнал|семинар|\b(?:gradebook|seminar)\b|成绩册|研讨课/iu;
  const PERFORMANCE=/как (?:получить|заработать|улучшить|рассчитыва[а-яё]*|счита[а-яё]*).{0,32}(?:оценк|балл)|(?:оценк[ауеи]|балл[а-яё]*) (?:за игру|за кампанию|губернатора)|^(?:как у меня дела|что важно губернатору|оценка|баллы)\s*[?!.\s]*$|\b(?:what(?:['’]s| is) my score|how (?:is|do).{0,24}(?:score|grad[ei])|(?:my|campaign|final|maximum) (?:score|grade)|(?:earn|get) (?:full|more|maximum|\d+) points)\b|怎么.{0,9}(?:评分|计分|拿高分)|如何.{0,9}(?:评分|计分|拿高分)|我的(?:得分|成绩)|满分|^评分[？?]?$/iu;
  function roleReply(question,state,lang) {
    const l=(ru,en,zh)=>({ru,en,zh})[lang]??ru;
    const text=question.replace(/\s+/gu,' ');
    const technology=TECHNOLOGY.test(text);
    if(technology||ROLE.test(text)){
      const introduction=l('Я Илья Орлов, ваш преданный советник.',
        'I’m Ilya Orlov, your trusted adviser.',
        '我是伊利亚·奥尔洛夫，您的忠实顾问。');
      return introduction+' '+(technology
        ?l('В гостевом режиме я отвечаю по встроенной справке.','In guest mode, my replies come from the built-in guide.','在访客模式下，我根据内置指南回答。')
        :l('Обращайтесь ко мне по любому вопросу, связанному с областью.',
          'Come to me with any question about the region.',
          '有关本州的事，您随时可以来问我。'));
    }
    const journal=JOURNAL.test(text)&&SCORE.test(text);
    if(!journal&&!PERFORMANCE.test(text))return null;
    const introduction=l('Губернатор, наша задача — выполнить целевые показатели и заручиться поддержкой жителей.',
      'Governor, we need to meet our targets and earn residents’ support.',
      '州长，我们既要完成任期目标，也要争取居民的支持。');
    if(state.rulesVersion!=='governor-v4.0')return introduction+' '+l(
      'Откройте «Статистику», чтобы проверить поддержку и доступность услуг в районах.',
      'Open Statistics to check public support and access to services across districts.',
      '打开“统计”，查看居民支持度和各区的服务覆盖情况。');
    return [introduction,l('В «Статистике» видны цели пятилетки и поддержка населения.',
      'Statistics shows the five-year targets and public support.',
      '在“统计”中可以查看五年目标和居民支持度。'),l(
      'Сравнивают продвижение по 12 целям и среднюю поддержку жителей по пятилеткам. В итог идёт более высокий результат, до 5 баллов.',
      'The campaign takes the higher of progress toward 12 targets and average public support over each term, up to 5 points.',
      '战役总分取两项中的较高值，最高5分：12项目标的完成进度，或各五年期的居民平均支持度。'),journal?l(
      'Если партия идёт в зачёт, итог для журнала округляется вверх до целого балла.',
      'For a graded campaign, the gradebook rounds that score up to a whole point.',
      '如果本局计入考核，成绩册分数向上取整。'):''].filter(Boolean).join(' ');
  }
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
  function limitText(value,n) {
    return Array.from(String(value??'').trim()).slice(0,n).join('').trim();
  }
  function planContext(state,quote,lang) {
    const {draft,year}=state, rules=G.V3Rules;
    const local=value=>value?.[lang]??value?.en??value?.ru??value;
    const district=id=>local(rules.DISTRICTS[id]?.labels);
    const event=G.V3Events.card(state.event,lang);
    const lines=[];
    const terms=G.V4Campaign&&state.rulesVersion==='governor-v4.0' ? G.V4Campaign.status(state) : null;
    if(terms){
      const plan=quote?.projects??[];
      lines.push('Current navigation: Decisions contains annual situations and regional programmes. In Map, “'+
        local({ru:'Выбрать стройку',en:'Choose what to build',zh:'选择建设项目'})+'” opens construction and site choices; “'+
        local({ru:'Местные меры',en:'Local measures',zh:'地方措施'})+'” opens district-level work. Budget sector cards open programmes in that sector. The annual review combines every cost.');
      lines.push('Four-term edition, term '+terms.chapter.number+' ('+terms.chapter.startYear+'–'+terms.chapter.endYear+
        '). The full package can include any different affordable measures; the current catalog changes every five years. '+
        'Current draft measures: '+(plan.map(row=>local(row.labels)+' ('+row.costNow+' million RUB now, opens '+row.openingYear+')').join('; ')||'none')+'.');
      lines.push('Verified term KPI, actual / target: '+terms.entries.map(row=>local(row.labels)+' '+(row.actual??'N/A')+
        ' / '+row.target+(row.inverse?' (lower is better)':'')).join('; ')+'. Satisfaction target '+terms.chapter.satisfactionTarget+'/100.');
    }
    if(event){
      lines.push('Current event — '+[event.title,event.situation,event.circumstance?.summary].filter(Boolean).join(' '));
      for(const option of event.options){
        const cost=option.effects?.treasury, outcome=option.effects?.localOutcome;
        lines.push('Event option'+(draft.eventChoice===option.id?' (selected)':'')+' — '+option.label+
          ' · one-off '+(cost?.oneOffMlnRub??0)+' million RUB, annual '+(cost?.operatingMlnRubPerYear??0)+' million RUB'+
          (outcome?.units?' · '+outcome.units+' '+event.localIndicator.unitLabel+' from '+(year+(outcome.firstYearOffset??0)):'')+
          ' · '+option.tradeoff);
      }
      if(!draft.eventChoice)lines.push('Event response: not selected.');
    }
    const measure=terms?null:rules.availableMeasures(state).find(row=>row.id===draft.measureId), project=terms?null:quote?.project;
    const siteId=project?.siteId??draft.siteId;
    const site=local(SCHOOL_SITES[siteId]??rules.SITES.find(row=>row.id===siteId)?.labels);
    const projectCaption=[local(measure?.labels),district(measure?.districtId),site].filter(Boolean).join(' · ');
    const siteComparison=measure?.siteIds?.length&&measure.id!=='school-campus'
      ?measure.siteIds.map(id=>{
        const label=local(rules.SITES.find(row=>row.id===id)?.labels);
        const candidate=rules.quote({...state,draft:{...draft,siteId:id}}).project;
        return candidate?
          label+' opens '+candidate.openingYear+', investment '+candidate.capex+', annual cost '+candidate.annualOpex:
          label+' unavailable';
      }).join('; ')
      :'';
    if(!terms)lines.push('Project draft — '+(projectCaption||'not selected')+
      (measure?.siteIds?.length&&!site?' · site not selected':'')+
      (project?' · planned opening '+project.openingYear+', payment now '+project.costNow+
        ' million RUB, running cost '+project.annualOpex+' million RUB/year':'')+
      (siteComparison?' · site comparison (million RUB): '+siteComparison:''));
    const finance=quote?.finance;
    if(finance){
      lines.push('Draft budget forecast for '+year+' (million RUB): tax level '+(terms?draft.taxRate+'% of baseline':draft.taxMode)+
        ', tax receipts '+finance.taxes+', closing cash '+finance.cashEnd+', closing reserve '+finance.reserveEnd+
        ', closing debt '+finance.debtEnd+(quote.ok?' · plan ready':' · plan needs work: '+quote.errors.map(error=>error.code).join(', ')));
      const loan=finance.loans.find(row=>row.issueYear===year);
      const firstPayment=loan?.schedule[0];
      const limits=Object.entries(draft.sectorLimits??{}).map(([id,amount])=>id+' '+amount).join(', ');
      lines.push('Draft financing (million RUB) — reserve draw '+draft.reserveDraw+', reserve contribution '+
        draft.reserveContribution+', room to borrow '+finance.loanHeadroom+'; '+(firstPayment?
          'new loan '+draft.loan.principal+' at '+finance.annualPercent+'% for '+draft.loan.termYears+
          ' years, first payment '+firstPayment.total+' in '+firstPayment.year:'no approved new loan in the draft')+
        (limits?'; sector ceilings: '+limits:'')+(terms?'; available to invest '+finance.investmentHeadroom+
          (finance.investmentDraft?', contribution '+finance.investmentDraft.principal+' pays '+finance.investmentDraft.payout+
            ' in '+finance.investmentDraft.maturityYear:''):''));
      const near=finance.futureRows.slice(0,3), end=finance.futureRows.at(-1);
      if(end)lines.push('Forecast if commitments and settings stay as planned (million RUB) — closing balances '+
        near.map(row=>row.year+' '+row.cash).join(', ')+
        (end.year!==near.at(-1)?.year?'; full schedule to '+end.year+', final closing cash '+end.cash:''));
    }
    const describeKpis=stats=>Object.entries(stats?.kpis??{}).map(([id,kpi])=>
      id+' '+(kpi.value===null?'no demand':Number(kpi.value.toFixed(1))+'% ('+kpi.served+'/'+kpi.demand+')')).join(', ');
    lines.push('Last measured region indicators: '+describeKpis(state.stats)+' · support '+state.stats.support+'/100');
    if(measure?.districtId)lines.push('Last measured indicators in '+district(measure.districtId)+': '+describeKpis(state.stats.districts[measure.districtId]));
    const last=state.history.at(-1);
    if(last){
      const previousEvent=G.V3Events.card(last.event,lang);
      const choice=previousEvent?.options.find(option=>option.id===last.event.choice);
      lines.push('Last committed year '+last.year+' — '+[
        previousEvent?.title,choice?.label,local(last.measure?.labels),'closing cash '+last.finance.cashEnd+' million RUB'
      ].filter(Boolean).join(' · '));
    }
    let room=3600;
    return lines.slice(0,12).map(line=>{
      const text=limitText(line.replace(/\s+/gu,' '),Math.min(600,room));
      room-=Array.from(text).length;
      return text;
    }).filter(Boolean);
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
        if(state.rulesVersion==='governor-v4.0'){
          const rate=state.draft.taxRate, impact=G.V3Rules.taxSupportEffects(rate);
          return years+l('В «Бюджете» налоговая нагрузка меняется от 88% до 112% базовой. Сейчас '+rate+'%.',
            'Use Budget to set the tax burden between 88% and 112% of baseline. It is now '+rate+'%.',
            '在“预算”可以把税负调整到基准的88%至112%。当前税负为'+rate+'%。')+' '+
            l('При этом ставка меняет поддержку бизнеса на '+n(impact.business)+' п. и семей на '+n(impact.families)+' п.',
              'This setting changes business support by '+n(impact.business)+' points and household support by '+n(impact.families)+' points.',
              '当前设置使企业支持度变化'+n(impact.business)+'点、家庭支持度变化'+n(impact.families)+'点。');
        }
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
        const label=row=>SCHOOL_SITES[row.id]?.[textLanguage]||row.id;
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
        return l('Справка подскажет про налоги, заём, площадки или бюджет. Для беседы с ИИ-советником войдите в профиль РУДН.',
          'Built-in help covers taxes, loans, sites and the budget. Sign in to your RUDN account to talk to the AI advisor.',
          '内置帮助可解答税收、贷款、选址和预算问题。登录俄罗斯人民友谊大学账号可与 AI 顾问交流。');
    }
  }
  function create(api) {
    let pending=null;
    const cloudAccount=api.studentKey!==undefined;
    function navigate(target) {
      const state=api.state();
      if(!state||state.attemptId!==target?.attemptId||state.revision!==target.revision||state.year!==target.year||
          api.quote()?.signature!==target.signature)return false;
      const allowed=Object.values(TARGETS).some(([tab,anchor])=>tab===target.tab&&anchor===target.anchor);
      if(!allowed)return false;
      return api.navigate(target.tab,target.anchor);
    }
    async function ask(raw,{retry=false,guide} = {}) {
      const state=api.state(), question=limitText(raw,1200);
      if (!state||state.completed||!question) return null;
      if(pending)return pending;
      const localGuide=Object.hasOwn(GUIDES,guide)?guide:undefined;
      const q=api.quote(),signature=q?.signature,l=api.language(),useCloud=cloudAccount&&!localGuide;
      const messages=api.messages();
      const isCloudAnswer=row=>row.mode==='cloud'&&row.model===MODEL&&row.status==='ok';
      const same=messages.findLast(row=>row.question===question&&row.year===state.year&&row.signature===signature&&
        row.voiceVersion===VOICE_VERSION&&row.guide===localGuide&&(!row.language||row.language===l)&&
        (useCloud?isCloudAnswer(row)||row.status==='unavailable':row.mode==='local'&&row.status==='ok'));
      if(same&&(!retry||same.status==='ok'))return same;
      pending=(async()=>{
        const requestId=(!same?.newRequest&&same?.id)||crypto.randomUUID(),mode=useCloud?'cloud':'local';
        let kind='unknown',status='ok',text,model,retryHistory,newRequest=false,failureCode;
        if(useCloud){
          retryHistory=same?.retryHistory??messages.filter(isCloudAnswer).slice(-3).map(row=>({
            question:limitText(row.question,600),answer:limitText(row.text,900)
          }));
          try{
            if(!api.enabled||!navigator.onLine)throw Error('advisor/offline');
            const credential=await api.credential();
            if(!credential)throw Error('advisor/auth');
            const endpoint=new URL(api.enabled,location.href);
            if(endpoint.protocol!=='https:'&&endpoint.hostname!=='127.0.0.1'&&endpoint.hostname!=='localhost')throw Error('advisor/endpoint');
            const forecast=factual(state,q);
            const facts={
              taxes:forecast.taxes.map(row=>({mode:row.id,annualMln:row.value})),
              sites:(!state.draft.measureId||['defer','school-campus'].includes(state.draft.measureId)?forecast.sites:[]).map(row=>({
                id:row.id,capex:row.capex,annualOpex:row.opex,openingYear:row.year,served:row.served,demand:row.demand
              })),
              budget:{cash:state.finance.cash,cashEnd:forecast.budget.cash,reserve:forecast.budget.reserve,debt:forecast.budget.debt,
                debtLimit:state.finance.debtLimit,shortfall:Math.max(0,-forecast.budget.cash)}
            };
            const res=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+credential,'content-type':'application/json'},
              signal:AbortSignal.timeout(26000),body:JSON.stringify({requestId,attemptId:state.attemptId,studentKey:api.studentKey,
                revision:state.revision,year:state.year,language:l,question,facts,gameContext:planContext(state,q,l),history:retryHistory})});
            const data=await res.json();
            if(!res.ok){
              failureCode=data?.error?.code;
              throw Error('advisor/unavailable');
            }
            if(data?.model!==MODEL||typeof data.answer!=='string'||!data.answer.trim())throw Error('advisor/unavailable');
            text=data.answer.trim();model=data.model;
            if(INTENTS.has(data.intent))kind=data.intent;
          }catch{
            const quota=Object.hasOwn(QUOTA,failureCode)?QUOTA[failureCode]:null;
            status=quota?'quota':'unavailable';
            text=quota?.[l]??UNAVAILABLE[l]??UNAVAILABLE.ru;
            newRequest=failureCode==='provider-unavailable'||failureCode==='provider-invalid';
          }
        }else{
          const roleAnswer=localGuide?null:roleReply(question,state,l);
          kind=localGuide?'event':roleAnswer?'unknown':intent(question);
          text=localGuide?(localGuide==='year'&&state.rulesVersion==='governor-v4.0'?{
            ru:'Ответьте на ситуацию года. В «Решениях» можно выбрать программы области. На «Карте» доступны стройки, участки и местные меры. Проверьте расходы в «Бюджете» и цели пятилетки в «Статистике». Кнопка ▶ открывает сводку года.',
            en:'Respond to the annual situation. Choose regional programmes in Decisions. Find construction, sites and local measures on the Map. Check spending in Budget and term targets in Statistics. ▶ opens the annual review.',
            zh:'先回应年度情境。可在“决策”中选择全州项目，在“地图”中查看建设项目、地块和地方措施。在“预算”核对支出，在“统计”查看五年目标。点击▶检查年度计划。'
          }[l]:(GUIDES[localGuide][l]||GUIDES[localGuide].ru)):roleAnswer??explain(kind,state,q,l);
        }
        if(api.state()?.attemptId!==state.attemptId||api.state()?.revision!==state.revision||
          api.state()?.year!==state.year||api.quote()?.signature!==signature)throw Error('advisor/context-changed');
        const [tab,anchor]=TARGETS[kind]||[];
        const target=tab?{tab,anchor,attemptId:state.attemptId,revision:state.revision,year:state.year,signature}:null;
        const row={id:requestId,question,text,target,year:state.year,signature,mode,status,language:l,voiceVersion:VOICE_VERSION};
        if(model)row.model=model;
        if(status==='unavailable')row.retryHistory=retryHistory;
        if(newRequest)row.newRequest=true;
        if(localGuide)row.guide=localGuide;
        await api.save([...api.messages().filter(message=>message.id!==row.id&&message.id!==same?.id),row].slice(-12));
        return row;
      })();
      try{return await pending;}finally{pending=null;}
    }
    return {messages:api.messages,ask,navigate,cloudAccount,isPending:()=>Boolean(pending)};
  }
  G.V3Advisor={create,intent,explain,factual};
})(globalThis);
