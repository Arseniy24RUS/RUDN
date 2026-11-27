(function (root) {
  'use strict';
  const G = root.GovernorGame;
  const copy = value => structuredClone(value);
  const SAVE_VERSION = 1;
  const ASSIGNMENT = 'governor-v3';
  const V4_ASSIGNMENT = 'governor-v4';
  const isV4 = state => state?.rulesVersion === 'governor-v4.0';
  const DRAFT_MODE = 'governor-v3';
  const uiDefaults = {tab:'decisions', tutorialStep:1, welcomeStep:1, motion:'auto', panel:null, started:false};
  const allowedUI = new Set(['tab','tutorialStep','eventOpen','measureOpen','panel','districtId','objectId','inspectedSiteId',
    'budgetYear','statsYear','motion','largeText','started','scroll','sourceTab','returnPanel','lesson','projectOpen','statsDistrict','mapYear','welcomeStep',
    'selectedMeasureId','portfolioFilter','chapterArchive','investmentViewed','portfolioPracticed','mapPracticed','locationScope','statsGoalsSeen']);
  const patchState = (to, patch, fields) => ({...to, ...Object.fromEntries(
    Object.entries(patch).filter(([key]) => fields.has(key))
  )});
  const draftFields = new Set(['eventChoice','measureId','siteId','districtId','taxMode','loan','reserveDraw','reserveContribution','sectorLimits','promise',
    'measures','taxRate','investment']);
  function lesson(record) {
    const {ui,state} = record;
    if(state.handover||ui.tutorialStep>=11)return record;
    const measureId=isV4(state)?ui.selectedMeasureId:state.draft.measureId;
    const measure=measureId&&G.V3Rules.availableMeasures(state).find(row=>row.id===measureId);
    const requiredSites=measure?.siteIds||[];
    const practicedMap=isV4(state)?ui.mapPracticed:
      requiredSites.length?requiredSites.includes(state.draft.siteId):ui.tab==='map'&&ui.panel==='object';
    const completed=[
      ui.panel==='event',
      ['a','b','base'].includes(state.draft.eventChoice),
      Boolean(isV4(state)?ui.selectedMeasureId||ui.portfolioPracticed:state.draft.measureId),
      practicedMap,
      Boolean(ui.taxPractice),
      false,
      ui.panel==='review',
      state.history.length>0,
      false,
      state.history.length>0&&ui.tab==='map'&&ui.panel==='object'
    ];
    let step=ui.tutorialStep;
    while(step<=10&&completed[step-1])step++;
    return step===ui.tutorialStep?record:{...record,ui:{...ui,tutorialStep:step}};
  }
  function valid(record, owner, context, assignment) {
    return record?.schema === SAVE_VERSION && record.owner === owner && record.context === context &&
      record.assignment === assignment && isV4(record.state)===(assignment===V4_ASSIGNMENT) && typeof record.state?.attemptId === 'string' &&
      Array.isArray(record.state.history) && Array.isArray(record.draws);
  }
  function viewUI({ui,state}) {
    if (ui.welcomeStep !== undefined) return ui;
    // Earlier attempts may have opened the event card without making a choice.
    const draft = state.draft;
    const fresh = !state.completed && !state.history.length && ui.tutorialStep <= 2 &&
      !draft.eventChoice && !draft.measureId && !draft.loan && !draft.promise &&
      draft.taxMode === 'moderate' && !draft.reserveDraw && !draft.reserveContribution && !Object.keys(draft.sectorLimits || {}).length;
    return {...ui,welcomeStep:fresh?1:4};
  }
  function schoolCoverage(stats) {
    const value=stats?.kpis?.school?.value;
    return Number.isFinite(value)?Number(value.toFixed(1)):null;
  }
  function schoolPractice({state,ui}) {
    const row=state.history.at(-1),step=ui.tutorialStep;
    const initial=schoolCoverage(state.initialStats),recent=schoolCoverage(row?.stats);
    const whole=(ui.statsDistrict||'all')==='all';
    const initialPeriod=ui.statsYear==='initial'||!row;
    const recentPeriod=row&&ui.statsYear!=='initial'&&(!ui.statsYear||Number(ui.statsYear)===row.year);
    const visible=whole&&ui.tab==='stats'&&ui.panel===null&&(step===6?initialPeriod:step===9&&recentPeriod);
    return {initial,recent,visible};
  }
  async function loadSchoolMap() {
    const response = await fetch(G.resolveAsset('data/v3-school-map.json'));
    if (!response.ok) throw Error('governor-v3/map-unavailable');
    return response.json();
  }
  function settlementPlan(record, state, reference = false) {
    const prior = reference ? record.referenceEffects : record.effects;
    const ledger = record.draws;
    const picks = reference ? Object.fromEntries(ledger.map(draw => [draw.year,'base'])) :
      {...Object.fromEntries(state.history.map(row => [row.year,row.event.choice])),[state.year]:state.draft.eventChoice};
    const params = {attemptId:state.attemptId,year:state.year,ledger,picks,executionHistory:prior};
    const plan = G.V3Events.year(params);
    // Cash quotes exclude reimbursement. Only the locked year transaction can record the receipt.
    return {params,plan};
  }
  function envelope(owner, context, map, assignment) {
    const state = G.V3Rules.create({attemptId:crypto.randomUUID(),schoolMap:map,
      ...(assignment===V4_ASSIGNMENT?{rulesVersion:G.V3Rules.V4_RULES_VERSION}:{})});
    return {
      owner, context, schema:SAVE_VERSION, assignment, createdAt:new Date().toISOString(),
      drawKey:G.V3Events.createDrawKey(), contentVersion:G.V3Events.contentVersion, algorithmVersion:G.V3Events.algorithmVersion,
      draws:[], effects:[], referenceEffects:[], ui:{...uiDefaults,started:context==='course'}, state,
      messages:[], submission:null, localResult:false
    };
  }
  async function pinnedEvent(record) {
    if (record.state.completed) return record;
    const state = record.state;
    const event = await G.V3Events.open({
      attemptId:state.attemptId,year:state.year,drawKey:record.drawKey,
      contentVersion:record.contentVersion,algorithmVersion:record.algorithmVersion,
      snapshot:{revision:state.revision,tags:Object.fromEntries(Object.entries(G.V3Events.baselineTags)
        .filter(([district])=>Object.hasOwn(state.stats?.districts||{},district)))},ledger:record.draws
    });
    if (state.event && state.event.eventId === event.eventId) return record;
    return {...record, draws:record.draws.some(draw=>draw.year===event.year)?record.draws:[...record.draws,event],
      state:{...state,event}};
  }
  function submission(record, isCourse) {
    const state = record.state;
    const assessment = G.V3Rules.assess(state);
    const millis = Date.parse(record.closedAt)-Date.parse(record.createdAt);
    const {cash,debt,reserve} = state.finance;
    const final = {support:state.stats.support, development:state.stats.development, fiscalSpace:cash/1000, reserve:reserve/1000, debt:debt/1000,
      population:state.stats.population ?? state.population?.derived?.population};
    const territories = Object.entries(state.stats.districts).map(([id,district])=>({
      id,name:G.I18n.local(G.V3Rules.DISTRICTS?.[id]?.labels || id,'ru'),
      population:district.population,
      healthAccess:Number(district.kpis?.health?.value || 0)/100,
      schoolAccess:Number(district.kpis?.school?.value || 0)/100,
      employment:Number(district.kpis?.employment?.value || 0)/100
    }));
    return {
      id:state.attemptId, ...(isCourse?{studentKey:record.owner.slice('student:'.length)}:{}),
      source:'native-v1',type:'governor-simulator',activitySlug:isCourse?'seminar-7':'governor-freeplay',
      schemaVersion:1,draftMode:isV4(state)?V4_ASSIGNMENT:DRAFT_MODE, recordGrade:isCourse, reviewStatus:isCourse?'auto-scored':'practice',
      points:assessment.points,maxPoints:5,createdAt:record.closedAt,startedAt:record.createdAt,durationMs:Math.max(0,millis),
      governor:{applicationVersion:isV4(state)?'4.0.0':'3.0.0',modelVersion:state.rulesVersion,campaignStatus:state.handover?'stopped':'completed',
        decisions:state.history.length,scenario:'Сбалансированный старт',assessment,final,territories,
        decisionRegister:state.history.map(turn => {
          const projects=turn.measures??(turn.measure?[turn.measure]:[]);
          const action=projects.map(project=>G.I18n.local(project.labels,'ru'));
          return {year:turn.year,mission:G.V3Events.card(turn.event).title,action:action.join(' · ')||(isV4(state)?'Без новых мер':'Без нового проекта'),
            cost:(turn.finance?.newMeasureCost||0)/1000,delivery:projects[0]?.openingYear,...(isV4(state)?{
              measures:projects.map(({id,measureId,districtId,siteId,openingYear,annualOpex,action},index)=>({
                id,measureId,districtId,siteId,openingYear,annualOpex,action,title:projects[index].labels
              })),
              investments:{contribution:turn.finance.investmentContribution||0,principal:turn.finance.investmentPrincipal||0,
                income:turn.finance.investmentIncome||0}
            }:{})};
        }),
        ...(isV4(state)?{chapterResults:[1,2,3,4].map(number=>G.V4Campaign.status(state,number)).filter(row=>row.closed),
          promises:state.promises.map(({id,type,dueYear,projectId,status})=>({id,type,dueYear,projectId,status}))}:{})
      }
    };
  }

  async function mount(host, bridge, restored) {
    const assignment = bridge.edition==='v3'?ASSIGNMENT:V4_ASSIGNMENT;
    const stateKey = assignment===V4_ASSIGNMENT?'governorV4':'governorV3';
    const scope = JSON.stringify([bridge.owner,bridge.context,assignment]);
    const save = G.V3Store;
    const isCourse = bridge.context==='course' && bridge.owner.startsWith('student:') && !bridge.preview;
    let record = await save.read(scope);
    let ui;
    let status = {key:bridge.preview?'preview':'saved'};
    let busy = Promise.resolve();
    let runtime, channel;
    let language = bridge.language;
    let quote = null;
    let frozen = false;
    const active = () => !frozen && bridge.canWrite();
    function repaint() {
      const state = record?.state;
      quote = state?.event && !state.completed ? G.V3Rules.quote(state,{eventPlan:settlementPlan(record,state).plan}) : null;
      runtime?.render();
    }
    function code(error) {
      const reason = error?.code || String(error?.message || '');
      if (reason.includes('stale') || reason.includes('concurrent')) return 'concurrent-change';
      if (reason.includes('candidates') || reason.includes('snapshot')) return 'event-recovery';
      return 'save-error';
    }
    function run(job) {
      const next = busy.then(job);
      busy = next.catch(() => {});
      return next;
    }
    async function write(expected, next, notify = true) {
      record = await save.put(scope,expected,lesson(next),active);
      if (notify) channel?.postMessage('changed');
      repaint();
      return record;
    }
    async function replaceIfMissing(snapshot) {
      try { return await write(null,snapshot); }
      catch (error) {
        if (error.code !== 'concurrent-change') throw error;
        record = error.current;
        repaint();
        return record;
      }
    }
    async function assureEvent() {
      if (!record || record.state.completed) return;
      const before = record;
      const proposed = await pinnedEvent(before);
      if (proposed === before) return;
      try { await write(before,proposed); }
      catch (error) {
        if (error.code !== 'concurrent-change') throw error;
        record=error.current;
        repaint();
      }
    }
    function cloudCheckpoint() {
      if (!isCourse || !record || record.localResult || !active()) return Promise.resolve();
      const candidate = {...copy(record),messages:[]};
      return bridge.backend.checkpoint({owner:bridge.owner,activitySlug:'seminar-7',mode:assignment,
        attemptId:record.state.attemptId,phase:record.state.completed?'completed':'answering',
        contentVersion:assignment,state:{[stateKey]:candidate}});
    }
    function mirror() {
      if (!isCourse || !record || !active()) return;
      const candidate = record;
      cloudCheckpoint().then(receipt => {
        if (record !== candidate || receipt?.saveStatus?.state!=='conflict') return;
        status = {key:'conflict'};
        repaint();
      }).catch(() => {});
    }
    async function settle() {
      if (!isCourse || !active() || !record?.state.completed) return;
      const before = record;
      if (record.localResult || bridge.backend.localAttempts().some(a=>a.id===record.state.attemptId)) {
        status={key:bridge.backend.status?.().saving==='synced'?'sent':navigator.onLine?'saved':'offline'};
        if (!record.localResult) await write(before,{...before,localResult:true});
        else repaint();
        return;
      }
      status={key:navigator.onLine?'sending':'offline'};
      repaint();
      try {
        await cloudCheckpoint();
        if (!active()) return;
        await bridge.backend.saveAttempt(record.submission);
        if (!active() || record !== before) return;
        status={key:navigator.onLine?'saved':'offline'};
        await write(before,{...before,localResult:true});
      } catch {
        status={key:'error'};
        repaint();
      }
    }
    async function change(makeNext, sync = true) {
      const opened = record;
      return run(async () => {
        if (!active() || !opened || opened !== record) throw Object.assign(Error('governor-v3/concurrent-change'),{code:'concurrent-change'});
        try {
          const next = await makeNext(opened);
          await write(opened,next);
          if (sync) mirror();
          return record.state;
        } catch (error) {
          if (error.current && active()) record = error.current;
          status={key:code(error)};
          repaint();
          throw error;
        }
      });
    }
    async function startOrResume() {
      return run(async () => {
        if (!active()) throw Error('governor-v3/profile-changed');
        if (!record) {
          const initial=envelope(bridge.owner,bridge.context,await loadSchoolMap(),assignment);
          await replaceIfMissing({...initial,ui:{...initial.ui,...ui,started:true}});
        }
        if (!record.ui.started) await write(record,{...record,ui:{...record.ui,started:true}});
        await assureEvent();
        mirror();
        return record.state;
      });
    }
    const controller = {
      getState:()=>record?.state ?? null,
      getQuote:()=>quote,
      previewDraft:patch=>{
        const state={...record.state,draft:patchState(record.state.draft,patch,draftFields)};
        return G.V3Rules.quote(state,{eventPlan:settlementPlan(record,state).plan});
      },
      previewMeasure:(measureId,siteId)=>G.V3Rules.previewMeasure(record.state,measureId,siteId,
        {eventPlan:settlementPlan(record,record.state).plan}),
      eventArt:G.V3EventArt,
      getUI:()=>record?viewUI(record):ui,
      schoolCoverage,schoolPractice:()=>record?schoolPractice(record):null,
      language:()=>language,
      async setLanguage(next) {
        if (G.I18n.normalize(next)==='zh') await G.I18n.ensureCatalog();
        language = G.I18n.normalize(next);
        bridge.setLanguage(language);
        repaint();
        return language;
      },
      start:startOrResume,resume:startOrResume,
      exit:async () => {await busy;if (active()) bridge.exit();},
      patchDraft:patch => change(before => {
        if (before.state.completed) throw Error('governor-v3/stale-year');
        const draft=patchState(before.state.draft,patch,draftFields),state={...before.state,draft};
        const from=isV4(state)?before.state.draft.taxRate:before.state.draft.taxMode;
        const to=isV4(state)?draft.taxRate:draft.taxMode;
        const ui=before.ui;
        const validRate=isV4(state)?Number.isInteger(to)&&to>=88&&to<=112:Object.hasOwn(G.V3Rules.TAX_MODES,to);
        if (ui.tutorialStep!==5||ui.tab!=='budget'||ui.panel!==null||from===to||!validRate) return {...before,state};
        const eventPlan=settlementPlan(before,before.state).plan;
        const after=G.V3Rules.quote(state,{eventPlan}).finance;
        const taxPractice={from,to,taxesBefore:quote.finance.taxes,taxesAfter:after.taxes,cashBefore:quote.finance.cashEnd,cashAfter:after.cashEnd};
        return {...before,state,ui:{...ui,taxPractice}};
      }),
      async answerSchoolPractice(answer) {
        if (!record) return false;
        const {initial,recent,visible}=schoolPractice(record),step=record.ui.tutorialStep;
        if (!visible) return false;
        const direction=initial===null||recent===null?'unknown':recent>initial?'higher':recent<initial?'lower':'same';
        const expected=step===6?String(initial??'no-demand'):direction;
        if (answer!==expected) return false;
        await change(before=>({...before,ui:{...before.ui,tutorialStep:step+1}}),false);
        return true;
      },
      restart:async()=> {
        await run(settle);
        await change(async before=>{
          if(!before.state.completed||(isCourse&&!before.localResult))throw Error('governor-v3/restart-unavailable');
          const next=envelope(bridge.owner,bridge.context,before.state.schoolMap,assignment);
          return {...next,ui:{...next.ui,welcomeStep:4,tutorialStep:11,started:true,motion:before.ui.motion,largeText:before.ui.largeText}};
        },false);
        await run(assureEvent);
        mirror();
      },
      saveUI:patch => {
        if (!record) {
          ui=patchState(ui,patch,allowedUI);
          return Promise.resolve(ui);
        }
        return change(before=>({...before,ui:patchState(before.ui,patch,allowedUI)}),false);
      },
      handoverStatus:()=>record?.state?.event ? G.V3Rules.handoverStatus(record.state) : {available:false},
      handover:({revision})=>change(before=>{
        const state=G.V3Rules.handover(before.state,{expectedRevision:revision});
        const next={...before,state,closedAt:new Date().toISOString(),ui:{...before.ui,panel:'result'}};
        next.submission=submission(next,isCourse);
        return next;
      },false).then(state=>{void run(settle);return state;}),
      commitYear:({signature,revision}) => change(async before => {
        const state=before.state;
        if (!state.history.length && before.ui.tutorialStep<8) {
          throw Object.assign(Error('governor-v3/tutorial-required'),{code:'tutorial-required'});
        }
        const {params,plan}=settlementPlan(before,state);
        const {plan:reference}=settlementPlan(before,state,true);
        const settledSpend=Object.fromEntries(plan.rows.filter(row=>row.direction==='out').map(row=>[row.id,row.amount]));
        const nowSettled=G.V3Events.year({...params,settledSpend});
        const closed=G.V3Rules.commit(state,{expectedRevision:revision,signature,eventPlan:plan,settledEventPlan:nowSettled,baselineEventPlan:reference});
        const next={...before,state:closed,effects:[...before.effects,...plan.outcomes],
          referenceEffects:[...before.referenceEffects,...reference.outcomes],ui:{...before.ui,panel:'result',selectedMeasureId:null,
            inspectedSiteId:null,chapterArchive:null}};
        if (closed.completed) {
          next.closedAt=new Date().toISOString();
          next.submission=submission(next,isCourse);
        }
        return next;
      },false).then(async state=>{
        if (state.completed) {void run(settle);return state;}
        // A failure here can never reapply the settled year. The first opening is retried from its saved snapshot.
        await run(assureEvent).catch(error => {status={key:code(error)};repaint();});
        mirror();
        return record.state;
      }),
      retry:()=>run(async()=>{await assureEvent();await settle();}),
      errorMessage(error,locale){
        const rows={
          'concurrent-change':['В другой вкладке появились изменения. Открыта свежая версия года. Проверьте свой план.','Another tab saved changes. Review the latest annual plan.','另一标签页保存了更改。请检查最新年度计划。'],
          'tutorial-required':['Выполните задания Орлова по карте, бюджету и статистике.','Complete Orlov’s exercises on the map, budget and statistics.','请完成奥尔洛夫安排的地图、预算和统计练习。'],
          'event-recovery':['Ситуация ещё не показана. Повторите чтение сохранения.','The event is still hidden. Retry reading the saved attempt.','年度情境尚未显示。请重试读取已保存的进度。'],
          'save-error':['Запись не подтверждена. Проверьте сохранённый план перед повтором.','Saving was not confirmed. Review the saved plan before retrying.','尚未确认保存。重试前请检查已保存的计划。']
        };
        const key=error?.code==='tutorial-required'?error.code:code(error);
        return rows[key][{ru:0,en:1,zh:2}[locale]??0];
      },
      meta:{context:bridge.context,edition:assignment===V4_ASSIGNMENT?'v4':'v3',legacyURL:bridge.legacyURL,getStatus:()=>status,get status(){return status;},
        get canResume(){return Boolean(record);},get readOnly(){return !active();}}
    };

    if (record && !valid(record,bridge.owner,bridge.context,assignment)) throw Error('governor-v3/invalid-saved-record');
    if (!record && valid(restored,bridge.owner,bridge.context,assignment)) await replaceIfMissing(restored);
    if (bridge.context==='course' && !record) await replaceIfMissing(envelope(bridge.owner,bridge.context,await loadSchoolMap(),assignment));
    if (record && !record.state.completed) {
      await assureEvent();
      const reconciled=lesson(record);
      if (reconciled!==record) {
        try {await write(record,reconciled);}
        catch (error) {if(error?.code!=='concurrent-change')throw error;record=error.current;repaint();}
      }
    }
    if (!active()) throw Error('governor-v3/profile-changed');
    ui = {...uiDefaults};
    try {
      channel = new BroadcastChannel('rudn-governor-v3');
      channel.onmessage=()=>void run(async()=>{
        if (!active()) return;
        const loaded=await save.read(scope);
        if (loaded && loaded.recordRevision>(record?.recordRevision??-1)) {
          record=loaded;
          status={key:'concurrent-change'};
          repaint();
        }
      });
    } catch {}
    const advisorStudentKey=bridge.owner.startsWith('teacher:')?null:
      bridge.owner.startsWith('student:')?bridge.owner.slice('student:'.length):undefined;
    controller.advisor = G.V3Advisor?.create({
      state:controller.getState,language:controller.language,quote:controller.getQuote, credential:bridge.credential,
      studentKey:advisorStudentKey,
      messages:()=>record?.messages || [],save:messages=>change(before=>({...before,messages}),false),
      navigate:(tab,anchor)=>runtime.navigate(tab,anchor),enabled:bridge.advisorEnabled
    });
    repaint();
    runtime = G.V3UI.mount(host,controller);
    const motion=G.V3Motion?.attach(host,controller.getUI,controller.getState);
    const mapControls=G.V4Map?.attach(host);
    mirror();
    if (record?.state.completed) void run(settle);
    const connected=()=>{if (active()) void run(settle);};
    root.addEventListener('online',connected);
    return {
      state:controller.getState,
      freeze(){
        frozen=true;
        channel?.close();
        root.removeEventListener('online',connected);
        motion?.destroy();
        mapControls?.destroy();
        runtime.destroy?.();
      },
      refresh(){
        if(!isCourse || !record?.localResult)return;
        const key=bridge.backend.status?.().saving==='synced'?'sent':navigator.onLine?'saved':'offline';
        if(status.key!==key){status={key};repaint();}
      },flush:()=>busy
    };
  }
  G.V3Runtime={mount,submission,draftMode:DRAFT_MODE,v4DraftMode:V4_ASSIGNMENT};
})(globalThis);
