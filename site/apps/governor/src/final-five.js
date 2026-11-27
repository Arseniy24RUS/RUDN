// Local optional replay of the exact state on entering the final five years.
// The supplied storage is already scoped by both platform owner and play context.
const checkpointKey = 'governor-last-five-origin';
const finishedKey = 'governor-last-five-result';
const practicePrefix = 'governor-last-five-local:';
const practiced = state => typeof state?.practiceOf === 'string';
// The engine updates delivery, paid years and awards in earlier records as
// projects open. Compare only choices already fixed at the end of year 15.
function choices(state) {
  return state.history.slice(0,15).map(r=>[r.turn,r.missionId,r.actionId,r.fundingMode,
    r.placement?.id,r.restoration?.projectId,r.agreement?.termIds||[]]);
}
function sameFirstFifteen(a,b) {
  return a.seed===b.seed && a.sessionId===b.sessionId && a.startedAt===b.startedAt &&
    a.scenarioId===b.scenarioId && a.challengeId===b.challengeId &&
    a.campaignStrategy?.id===b.campaignStrategy?.id && a.agenda?.mode===b.agenda?.mode &&
    JSON.stringify(choices(a))===JSON.stringify(choices(b));
}

export function finalFive(scoped, G, allowed, slots=scoped) {
  const primary = () => new G.Saves.Store(scoped).inspect().state;
  const read = key => allowed() ? slots.getItem(key) : null;
  const write = (key, value) => {
    if (!allowed()) throw new Error('auth/profile-changed');
    slots.setItem(key, value);
  };
  const local = {
    getItem: key => read(practicePrefix + key),
    setItem: (key, value) => write(practicePrefix + key, value),
    removeItem(key) {
      if (!allowed()) throw new Error('auth/profile-changed');
      slots.removeItem(practicePrefix + key);
    }
  };
  function capture(state) {
    if (!state?.storiesRunId || practiced(state) || state.completed || state.awaitingContinue ||
        state.turnIndex !== 15 || state.history.length !== 15 || G.BudgetReview.locked(state)) return;
    try {
      if (!G.Engine.validateState(state)) return;
      write(checkpointKey, JSON.stringify(state));
    } catch { /* The main game remains available if an optional checkpoint does not fit. */ }
  }
  function origin(finished) {
    if (!allowed() || !finished?.completed || !finished.storiesRunId || practiced(finished)) return null;
    try {
      const candidate = G.Engine.restoreState(JSON.parse(read(checkpointKey)));
      return candidate && !candidate.awaitingContinue && candidate.turnIndex === 15 &&
        candidate.history.length === 15 && candidate.storiesRunId === finished.storiesRunId &&
        !G.BudgetReview.locked(candidate) && !practiced(candidate) && sameFirstFifteen(finished,candidate) ? candidate : null;
    } catch { return null; }
  }
  function matches(practice, finished) {
    return finished?.completed && practice?.practiceOf === finished.storiesRunId &&
      practice?.history?.length >= 15 && sameFirstFifteen(finished,practice);
  }
  function getPractice() { return new G.Saves.Store(local).inspect().state; }
  function ownsRun(token){
    if (!allowed() || !token) return false;
    let run;
    try { run=JSON.parse(scoped.getItem('platform-run')); } catch {}
    return (run?.campaignToken || primary()?.storiesRunId)===token;
  }
  function begin(finished, prediction) {
    const source = origin(finished);
    if (!source || !ownsRun(finished.storiesRunId) || !G.Engine.validateState(finished)) return false;
    const previous = getPractice();
    if (matches(previous, finished) && !previous.completed && !G.BudgetReview.stopped(previous)) return true;
    source.practiceOf = source.storiesRunId;
    source.storiesRunId = 'practice-' + source.practiceOf;
    // An optional replay owns one local slot. Never rotate it into a course backup.
    const data = {format:'rudn-autosave',schema:G.Saves.SCHEMA,model:source.version,revision:1,
      savedAt:new Date().toISOString(),state:source};
    const intention = String(prediction || '').trim().slice(0, 500);
    // Store the intention with the initial position atomically. Ordinary saves
    // carry the field forward with the campaign.
    if (intention) source.practiceIntention = intention;
    // localStorage can lag behind the verified campaign in the platform's
    // IndexedDB when its mirror is full. Keep the real final with the replay.
    write(finishedKey,JSON.stringify(finished));
    write(practicePrefix + G.Saves.Key, JSON.stringify(data));
    return true;
  }
  function open() {
    const practice = getPractice();
    if (!practice || !ownsRun(practice.practiceOf)) return null;
    let finished=primary();
    if (!matches(practice,finished)){
      try { finished=G.Engine.restoreState(JSON.parse(read(finishedKey))); } catch { return null; }
    }
    if (!matches(practice,finished) || !origin(finished)) return null;
    return {finished, practice, storage:local, lockName:scoped.lockName + ':last-five',
      storageKey:scoped.keyFor(practicePrefix + G.Saves.Key)};
  }
  return {capture, origin, begin, open, getPractice, matches};
}

export function replayURL(practice, address) {
  const url = new URL(address);
  url.searchParams.delete('returnTo');
  url.searchParams.delete('practice');
  if (practice) url.searchParams.set('practice','last-five');
  else url.searchParams.set('returnTo','term');
  url.hash = '';
  return url.href;
}

export function addReplayChoice(host, session, finished, tr, address) {
  if (host.querySelector('[data-replay-last-five]') || !session.origin(finished)) return;
  const previous = session.getPractice();
  const resume = session.matches(previous, finished) && !previous.completed && previous.budgetReview?.status !== 'supervised';
  const section = document.createElement('section');
  section.className = 'result-section governor-replay';
  const title = document.createElement('h3');
  title.textContent = tr('Последние пять лет','The final five years','最后五年');
  section.append(title);
  const description = document.createElement('p');
  description.textContent = tr('Вернитесь к началу 16-го года. Пробная партия сохраняется на этом устройстве отдельно от оценки.',
    'Return to the start of year 16. This practice campaign is saved separately on this device and carries no grade.',
    '回到第16年年初。练习进度单独保存在本设备上，不计入成绩。');
  section.append(description);
  let input;
  if (!resume) {
    const label = document.createElement('label');
    label.textContent = tr('Какое решение вы измените и чего ожидаете? (По желанию)',
      'Which decision will you change and what do you expect? (Optional)','想改变哪个决定？预期结果是什么？（选填）');
    input = document.createElement('textarea');input.rows = 2;input.maxLength = 500;
    label.append(input);section.append(label);
  }
  const button = document.createElement('button');button.type = 'button';
  button.className = 'secondary-button';button.dataset.replayLastFive = '';
  button.textContent = resume ? tr('Продолжить пробную пятилетку','Resume the five-year replay','继续五年练习') :
    tr('Переиграть последнюю пятилетку','Replay the final five years','重玩最后五年');
  button.addEventListener('click',()=>{
    try { if (session.begin(finished, input?.value)) { location.assign(replayURL(true, address)); return; } } catch {}
    description.setAttribute('role','status');
    description.textContent = tr('Не удалось открыть локальную копию. Проверьте свободное место и повторите.',
      'Could not open the local replay. Check free storage and retry.','无法打开本地练习。请检查剩余存储空间后重试。');
  });
  section.append(button);
  const summary=host.querySelector('.end-stat-row');
  if (summary) summary.after(section); else host.append(section);
}

export function addReplayOutcome(host, practice, original, tr, leave) {
  if (host.querySelector('[data-practice-return]')) return;
  const section = document.createElement('section');section.className = 'result-section governor-replay';
  const title = document.createElement('h3');title.textContent = tr('Что изменилось за пять лет','What changed over five years','五年间的变化');
  const note = document.createElement('p');
  const year = original.population.baseYear + 19;
  const values = s => [s.finance.treasury, s.finance.reserve, s.finance.debt];
  const a = values(original), b = values(practice);
  const labels = [tr('Казна','Treasury','财政金库'),tr('Резерв','Reserve','储备金'),tr('Долг','Debt','债务')];
  const format = new Intl.NumberFormat(practice.language || 'ru', {maximumFractionDigits:2});
  const actualYear = practice.population.baseYear + Math.max(0, practice.history.length - 1);
  note.textContent = tr(`Исходный итог (${year}) → пробный итог (${actualYear}), млрд ₽.`,
    `Original outcome (${year}) → practice outcome (${actualYear}), billion RUB.`,`原结果（${year}）→ 练习结果（${actualYear}），单位：十亿卢布。`);
  section.append(title, note);
  for (let i=0; i<labels.length; i++) {
    const line = document.createElement('p');
    line.textContent = labels[i] + ' ' + format.format(a[i]) + ' → ' + format.format(b[i]);section.append(line);
  }
  const originalReview=original.campaignStrategy?.reviews?.find(review=>review.year===20);
  const practiceReview=practice.campaignStrategy?.reviews?.find(review=>review.year===20);
  const pct=new Intl.NumberFormat(practice.language||'ru',{style:'percent',maximumFractionDigits:1});
  for (const goal of practiceReview?.goals||[]) {
    const prior=originalReview?.goals?.find(item=>item.key===goal.key);
    if (!prior) continue;
    const line=document.createElement('p');
    line.textContent=tr(goal.label.ru,goal.label.en,goal.label.zh)+' '+pct.format(prior.value)+' → '+pct.format(goal.value);
    section.append(line);
  }
  if (practice.practiceIntention) {
    const intention = document.createElement('p');
    intention.textContent = tr('Ваш прогноз','Your prediction','你的预期') + ' — ' + practice.practiceIntention;
    section.append(intention);
  }
  const button = document.createElement('button');button.type = 'button';button.className = 'secondary-button';button.dataset.practiceReturn='';
  button.textContent = tr('К исходным итогам','Return to original results','返回原始结果');button.addEventListener('click',leave);
  section.append(button);
  const summary=host.querySelector('.end-stat-row');
  if (summary) summary.after(section); else host.append(section);
}

export function practiceAdapter(session, {language, tr, canWrite, onLanguage, onError, reveal}) {
  const data = session.open();
  if (!data) return null;
  const leave = () => location.assign(replayURL(false, location.href));
  return {
    practice:true, resumeOnEntry:true, freePlay:true, offlineEnabled:false,
    lockName:data.lockName, storageKey:data.storageKey, storage:data.storage,
    language, profile:data.practice.profile, canWrite, onError, onLanguage,
    onEnd(host) {
      const current = session.getPractice();
      if (current && canWrite()) addReplayOutcome(host,current,data.finished,tr,leave);
    },
    attach:() => {if (canWrite()) reveal();},
    leave
  };
}
