(function (root) {
  'use strict';
  const G = root.GovernorGame;
  const copy = value => structuredClone(value);
  const SAVE_VERSION = 1;
  const ASSIGNMENT = 'governor-v3';
  const DRAFT_MODE = 'governor-v3';
  const uiDefaults = {tab:'decisions', tutorialStep:1, motion:'auto', panel:null, started:false};
  const allowedUI = new Set(['tab','tutorialStep','eventOpen','measureOpen','panel','districtId','objectId','inspectedSiteId',
    'budgetYear','statsYear','motion','largeText','started','scroll','sourceTab','returnPanel','lesson','projectOpen','statsDistrict','mapYear']);
  const patchState = (to, patch, fields) => ({...to, ...Object.fromEntries(
    Object.entries(patch).filter(([key]) => fields.has(key))
  )});
  const draftFields = new Set(['eventChoice','measureId','siteId','districtId','taxMode','loan','reserveDraw','reserveContribution','sectorLimits','promise']);
  function lesson(record) {
    const {ui,state} = record;
    if(state.handover||ui.tutorialStep>=11)return record;
    const completed=[
      ui.panel==='event',
      ['a','b','base'].includes(state.draft.eventChoice),
      Boolean(state.draft.measureId),
      Boolean(state.draft.siteId)||ui.tab==='map'&&ui.panel==='object',
      ui.tab==='budget'&&ui.panel===null,
      ui.tab==='stats'&&ui.panel===null,
      ui.panel==='review',
      state.history.length>0,
      state.history.length>0&&ui.tab==='stats'&&ui.panel===null,
      state.history.length>0&&ui.tab==='map'&&ui.panel==='object'
    ];
    let step=ui.tutorialStep;
    while(step<=10&&completed[step-1])step++;
    return step===ui.tutorialStep?record:{...record,ui:{...ui,tutorialStep:step}};
  }
  function valid(record, owner, context) {
    return record?.schema === SAVE_VERSION && record.owner === owner && record.context === context &&
      record.assignment === ASSIGNMENT && typeof record.state?.attemptId === 'string' &&
      Array.isArray(record.state.history) && Array.isArray(record.draws);
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
  function envelope(owner, context, map) {
    const state = G.V3Rules.create({attemptId:crypto.randomUUID(), schoolMap:map});
    return {
      owner, context, schema:SAVE_VERSION, assignment:ASSIGNMENT, createdAt:new Date().toISOString(),
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
      schemaVersion:1,draftMode:DRAFT_MODE, recordGrade:isCourse, reviewStatus:isCourse?'auto-scored':'practice',
      points:assessment.points,maxPoints:5,createdAt:record.closedAt,startedAt:record.createdAt,durationMs:Math.max(0,millis),
      governor:{applicationVersion:'3.0.0',modelVersion:state.rulesVersion,campaignStatus:state.handover?'stopped':'completed',
        decisions:state.history.length,scenario:'Сбалансированный старт',assessment,final,territories,
        decisionRegister:state.history.map(turn => ({year:turn.year,
          mission:G.V3Events.card(turn.event).title,action:turn.measure ? G.I18n.local(turn.measure.labels,'ru') : 'Без нового проекта',
          cost:(turn.finance?.newMeasureCost || 0)/1000,delivery:turn.measure?.openingYear}))
      }
    };
  }

  async function mount(host, bridge, restored) {
    const scope = JSON.stringify([bridge.owner,bridge.context,ASSIGNMENT]);
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
      return bridge.backend.checkpoint({owner:bridge.owner,activitySlug:'seminar-7',mode:DRAFT_MODE,
        attemptId:record.state.attemptId,phase:record.state.completed?'completed':'answering',
        contentVersion:ASSIGNMENT,state:{governorV3:candidate}});
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
          const initial=envelope(bridge.owner,bridge.context,await loadSchoolMap());
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
      eventArt:G.V3EventArt,
      getUI:()=>record?.ui ?? ui,
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
        return {...before,state:{...before.state,draft:patchState(before.state.draft,patch,draftFields)}};
      }),
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
          referenceEffects:[...before.referenceEffects,...reference.outcomes],ui:{...before.ui,panel:'result'}};
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
          'tutorial-required':['Завершите подсказки Орлова о карте, бюджете и исходных показателях.','Follow Orlov’s prompts for the map, budget and starting indicators.','请按奥尔洛夫的提示查看地图、预算和初始指标。'],
          'event-recovery':['Ситуация ещё не показана. Повторите чтение сохранения.','The event is still hidden. Retry reading the saved attempt.','年度情境尚未显示。请重试读取已保存的进度。'],
          'save-error':['Запись не подтверждена. Проверьте сохранённый план перед повтором.','Saving was not confirmed. Review the saved plan before retrying.','尚未确认保存。重试前请检查已保存的计划。']
        };
        const key=error?.code==='tutorial-required'?error.code:code(error);
        return rows[key][{ru:0,en:1,zh:2}[locale]??0];
      },
      meta:{context:bridge.context,legacyURL:bridge.legacyURL,getStatus:()=>status,get status(){return status;},
        get canResume(){return Boolean(record);},get readOnly(){return !active();}}
    };

    if (record && !valid(record,bridge.owner,bridge.context)) throw Error('governor-v3/invalid-saved-record');
    if (!record && valid(restored,bridge.owner,bridge.context)) await replaceIfMissing(restored);
    if (bridge.context==='course' && !record) await replaceIfMissing(envelope(bridge.owner,bridge.context,await loadSchoolMap()));
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
    controller.advisor = G.V3Advisor?.create({
      state:controller.getState,language:controller.language,quote:controller.getQuote, credential:bridge.credential,
      studentKey:isCourse?bridge.owner.slice('student:'.length):undefined,
      messages:()=>record?.messages || [],save:messages=>change(before=>({...before,messages}),false),
      navigate:(tab,anchor)=>runtime.navigate(tab,anchor),enabled:bridge.advisorEnabled
    });
    repaint();
    runtime = G.V3UI.mount(host,controller);
    const motion=G.V3Motion?.attach(host,controller.getUI,controller.getState);
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
        runtime.destroy?.();
      },
      refresh(){
        if(!isCourse || !record?.localResult)return;
        const key=bridge.backend.status?.().saving==='synced'?'sent':navigator.onLine?'saved':'offline';
        if(status.key!==key){status={key};repaint();}
      },flush:()=>busy
    };
  }
  G.V3Runtime={mount,submission,draftMode:DRAFT_MODE};
})(globalThis);
