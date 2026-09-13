(function(root){
  'use strict';
  const P=root.GovernorGame.Population,icon=root.GovernorGame.icon;
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const local=(v,lang)=>globalThis.GovernorGame.I18n.local(v,lang);
  const text=(lang,ru,en)=>globalThis.GovernorGame.I18n.choose(lang,()=>(ru),()=>(en));
  const num=(n,lang)=>new Intl.NumberFormat(globalThis.GovernorGame.I18n.intlLocale(lang),{maximumFractionDigits:0}).format(n);
  const sign=(n,lang)=>(n>0?'+':n<0?'−':'')+num(Math.abs(n),lang);
  const labels={healthAccess:['Медицина','Healthcare'],schoolAccess:['Школа','School'],childcareAccess:['Уход за детьми','Childcare'],employment:['Работа','Employment'],housingAccess:['Жильё','Housing']};
  const label=(k,lang)=>globalThis.GovernorGame.I18n.choose(lang,()=>labels[k][0],()=>labels[k][1]);
  const statuses=(v,lang)=>v<.6?text(lang,'Не хватает','Shortage'):v<.85?text(lang,'Есть трудности','Under pressure'):text(lang,'Доступно','Accessible');
  function tabs(lang,active){return `<div class="world-tabs" role="group" aria-label="${text(lang,'Слои карты','Map views')}"><button type="button" data-world-view="map" aria-pressed="${active==='map'}">${icon('construction',{size:17})}${text(lang,'Проекты','Projects')}</button><button type="button" data-world-view="residents" aria-pressed="${active==='residents'}">${icon('people',{size:17})}${text(lang,'Жители','Residents')}</button><button type="button" data-world-view="stories" aria-pressed="${active==='stories'}">${icon('journal',{size:17})}${text(lang,'Письма','Letters')}</button></div>`;}
  function briefing(state,id,lang){
    if(!state.population)return'';const issue=P.insight(state,id),config=P.MUNICIPALITIES.find(c=>c.id===id);
    return `<button class="resident-brief" type="button" data-resident-open="${id}"><span>${icon(config.icon,{size:18})}</span><span><b>${escape(local(config.name,lang))}</b> · ${escape(label(issue.issue,lang))}: ${escape(statuses(issue.value,lang).toLowerCase())}</span>${icon('arrow',{size:15})}</button>`;
  }
  function preview(preview,state,lang){
    const p=preview.people;if(!p)return'';
    const config=P.MUNICIPALITIES.find(c=>c.id===p.municipalityId);
    const changes=Object.entries(p.change).filter(([k,v])=>Math.abs(v)>.006).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,2);
    const display=changes.length?changes.map(([k,v])=>`${label(k,lang)} ${v>0?'↑':'↓'}${state.rules.hideExactPreview?'':` ${Math.abs(Math.round(v*100))} ${text(lang,'п. п.','pp')}`}`).join(' · '):text(lang,'Эффект зависит от кадров, спроса и доступности смежных услуг.','Impact depends on staff, demand and other services.');
    return `<aside class="people-preview"><span class="people-preview-icon">${icon('people',{size:22})}</span><div><strong>${text(lang,'Для жителей','For residents')} · ${escape(local(config.name,lang))}</strong><p>${escape(display)}</p><small>${p.lag?text(lang,`После запуска через ${p.lag} г.`, `After opening in ${p.lag} year(s)`):text(lang,'С текущего года','From this year')}. ${text(lang,'При нынешнем населении и полном исполнении. Не прогноз рождаемости.','At today’s population and full delivery. Not a fertility forecast.')}</small></div></aside>`;
  }
  function year(record,lang){
    const y=record.population;if(!y)return'';
    const net=y.closing-y.opening;const most=y.transfers.slice().sort((a,b)=>b.count-a.count)[0];
    const internal=most?`${local(P.MUNICIPALITIES.find(c=>c.id===most.from).name,lang)} → ${local(P.MUNICIPALITIES.find(c=>c.id===most.to).name,lang)}: ${num(most.count,lang)}`:text(lang,'Крупных внутренних переездов нет.','No major internal moves.');
    return `<section class="year-people"><div class="year-people-heading"><span>${icon('people',{size:24})}</span><div><small>${text(lang,'Год в жизни людей','A year in people’s lives')} · ${y.year}</small><h3>${num(y.closing,lang)} ${text(lang,'жителей','residents')}</h3></div><b>${sign(net,lang)}</b></div><p>${text(lang,'Изменение за весь год, с учётом прежних программ и возрастной структуры. Оно не равно эффекту одной карточки.','Change over the whole year, including previous programmes and age structure. It is not the effect of a single card.')}</p><div class="people-flow-summary"><span>${text(lang,'Рождения','Births')} <b>${num(y.births,lang)}</b></span><span>${text(lang,'Смерти','Deaths')} <b>${num(y.deaths,lang)}</b></span><span>${text(lang,'Внешняя миграция, сальдо','External net migration')} <b>${sign(y.externalIn-y.externalOut,lang)}</b></span></div><p class="year-route">${icon('route',{size:16})}${escape(internal)}</p></section>`;
  }
  function finalSummary(state,lang){
    const p=state.population;if(!p)return'';const now=p.derived;
    const healthChange=(now.municipalities.north.healthAccess-p.initial.access.north.healthAccess)*100;
    const schoolChange=(now.municipalities.suburb.schoolAccess-p.initial.access.suburb.schoolAccess)*100;
    return `<section class="people-ending"><h3>${text(lang,'Наследие для людей','A legacy for people')}</h3><p>${text(lang,'Рост населения сам по себе не доказывает качество управления. Сравните доступность услуг с началом срока.','Population growth alone does not prove good governance. Compare access to services with the start.')}</p><div class="people-flow-summary"><span>${text(lang,'Население','Population')}<b>${num(now.population,lang)}</b></span><span>${text(lang,'Медицина севера','Northern healthcare')}<b>${sign(healthChange,lang)} ${text(lang,'п. п.','pp')}</b></span><span>${text(lang,'Школы пригорода','Suburban schools')}<b>${sign(schoolChange,lang)} ${text(lang,'п. п.','pp')}</b></span></div><small>${text(lang,'Синтетическая модель. Новые проекты последних лет ещё могут находиться в строительстве.','Synthetic model. Projects from the final years may still be under construction.')}</small></section>`;
  }
  function render(stage,state,lang,selection,callbacks){
    const selected=P.MUNICIPALITIES.find(m=>m.id===selection)||P.MUNICIPALITIES[0];
    const d=state.population.derived.municipalities[selected.id],issue=P.insight(state,selected.id),last=state.population.lastYear;
    const yr=state.population.year,initial=state.population.initial;
    const routes=last?last.transfers.slice().sort((a,b)=>b.count-a.count).slice(0,4):[];
    const paths=routes.map((r,i)=>{
      const a=P.MUNICIPALITIES.find(c=>c.id===r.from).position,b=P.MUNICIPALITIES.find(c=>c.id===r.to).position;
      return `<path d="M${a.x},${a.y} Q${(a.x+b.x)/2+7},${(a.y+b.y)/2-9} ${b.x},${b.y}" class="migration-route" marker-end="url(#flow-arrow)" style="stroke-width:${Math.min(.5,.18+r.count/4000)}"><title>${escape(local(P.MUNICIPALITIES.find(c=>c.id===r.from).name,lang))} → ${escape(local(P.MUNICIPALITIES.find(c=>c.id===r.to).name,lang))}: ${r.count}</title></path>`;
    }).join('');
    const pins=P.MUNICIPALITIES.map(m=>{
      const ins=P.insight(state,m.id);return `<button class="resident-pin ${selection===m.id?'selected':''} ${ins.severity}" style="left:${m.position.x}%;top:${m.position.y}%" type="button" data-resident-id="${m.id}" aria-pressed="${selected.id===m.id}"><span>${icon(m.icon,{size:21})}</span><b>${escape(local(m.name,lang))}</b></button>`;
    }).join('');
    const ranked=Object.keys(labels).sort((a,b)=>d[a]-d[b]).slice(0,3);
    const services=ranked.map(key=>`<div class="resident-service"><span>${escape(label(key,lang))}</span><b class="${d[key]<.6?'critical':d[key]<.85?'watch':'stable'}">${escape(statuses(d[key],lang))}</b></div>`).join('');
    const projects=state.finance.portfolio.filter(p=>p.people?.targets[selected.id]&&p.status!=='completed');
    const expiring=projects.filter(p=>p.status==='active'&&p.yearsRemaining<=2);
    const positions=d.cohorts.map((n,i)=>`<span class="cohort-block c${i}" style="width:${n/d.population*100}%" title="${escape(local(P.COHORTS[i],lang))}: ${num(n,lang)}"></span>`).join('');
    const cohortLegend=d.cohorts.map((n,i)=>`<div><span class="cohort-key c${i}"></span>${escape(local(P.COHORTS[i],lang))}<b>${num(n,lang)}</b></div>`).join('');
    const ledger=last?.municipalities[selected.id];
    stage.classList.add('residents-stage');
    stage.innerHTML=`<header class="residents-header"><div><p>${text(lang,'Новая область','Novaya Oblast')} · ${yr}</p><h2>${text(lang,'За каждым решением – люди','Every decision touches lives')}</h2></div><button class="secondary-button" type="button" data-residents-back>${icon('arrowLeft',{size:16})}${text(lang,'К миссии','Back to mission')}</button></header>
      ${tabs(lang,'residents')}
      <section class="residents-board">
        <div class="residents-world"><img src="assets/world/atlas.webp" alt="${text(lang,'Схематическая карта пяти территорий','Schematic map of five places')}"><div class="residents-world-shade"></div><svg class="migration-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="${text(lang,'Крупнейшие внутренние перемещения за год','Largest internal moves this year')}"><defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>${paths}</svg>${pins}<div class="resident-map-caption"><strong>${num(state.population.derived.population,lang)}</strong><span>${text(lang,'жителей области','regional residents')} · ${sign(state.population.derived.population-initial.population,lang)} ${text(lang,'со старта','since start')}</span><small>${text(lang,'Стрелки – крупнейшие переезды внутри области, не новые жители.','Arrows are the largest within-region moves, not new residents.')}</small></div></div>
        <article class="resident-story"><div class="resident-place"><span>${icon(selected.icon,{size:24})}</span><div><small>${escape(local(selected.type,lang))}</small><h3>${escape(local(selected.name,lang))}</h3></div></div>
          <div class="resident-voice"><div class="resident-avatar" aria-hidden="true">${escape(local(selected.persona,lang).slice(0,1))}</div><div><b>${escape(local(issue.persona,lang))}</b><small>${text(lang,'Персонаж учебной истории','A fictional resident')}</small></div></div>
          <blockquote>${escape(local(issue.text,lang))}</blockquote><div class="resident-service-list">${services}</div>
          <p class="resident-workline">${icon('bus',{size:18})}<span>${num(d.commuters,lang)} ${text(lang,'жителей ездят на работу в другую территорию. Это не миграция.','residents commute to another place. This is not migration.')}</span></p>
          ${expiring.length?`<div class="resident-warning">${icon('clock',{size:17})}<span>${text(lang,'Заканчивается финансирование:','Funding is ending:')} ${escape(local(expiring[0].title,lang))}.<button type="button" data-resident-treasury>${text(lang,'Открыть казну','Open treasury')}</button></span></div>`:''}
          <details class="resident-numbers"><summary>${text(lang,'Числа и возрастная структура','Numbers and age structure')}</summary><div class="cohort-bar" role="img" aria-label="${d.cohorts.map((n,i)=>`${local(P.COHORTS[i],lang)}: ${n}`).join('; ')}">${positions}</div><div class="cohort-legend">${cohortLegend}</div><p>${text(lang,'Женщины 15–49 лет (в составе населения, не дополнительная группа)','Women aged 15–49 (part of the population, not an extra group)')}: <b>${num(d.women1549,lang)}</b>.</p>${Object.keys(labels).map(k=>`<p>${escape(label(k,lang))}: <b>${num(d[k]*100,lang)}%</b></p>`).join('')}<p>${text(lang,'Ученики, использующие свободные места соседних территорий','Pupils using spare places in another area')}: ${num(d.schoolTravel,lang)}</p></details>
        </article>
      </section>
      <section class="resident-year-note"><div>${icon('journal',{size:23})}<h3>${text(lang,'Год этой территории','This place over the year')}</h3></div>${ledger?`<p>${num(ledger.opening,lang)} + ${num(ledger.births,lang)} − ${num(ledger.deaths,lang)} ${ledger.externalIn-ledger.externalOut>=0?'+':'−'} ${num(Math.abs(ledger.externalIn-ledger.externalOut),lang)} ${ledger.internalIn-ledger.internalOut>=0?'+':'−'} ${num(Math.abs(ledger.internalIn-ledger.internalOut),lang)} = <strong>${num(ledger.closing,lang)}</strong></p><small>${text(lang,'Начало года + рождения − смерти + внешнее сальдо + внутреннее сальдо. Внутренние переезды не увеличивают население всей области.','Opening population + births − deaths + external net migration + internal net migration. Internal moves do not increase regional population.')}</small>`:`<p>${text(lang,'Первый год ещё не завершён. Начните с решения, а затем вернитесь к истории жителей.','The first year is not over. Make a decision, then return to residents’ stories.')}</p>`}</section>
      <details class="resident-detail journey-detail"><summary>${text(lang,'Условное время в пути','Stylised journey times')}</summary><p>${text(lang,'Школьные поездки доступны до 60 минут в одну сторону; поездки на работу – до 90. Это игровая матрица, не замер видимых дорог атласа.','School trips are eligible up to 60 minutes one way; work trips up to 90. These are game assumptions, not measured routes on the atlas.')}</p>${P.MUNICIPALITIES.filter(x=>x.id!==selected.id).sort((a,b)=>P.travelMinutes(selected.id,a.id)-P.travelMinutes(selected.id,b.id)).map(x=>`<p>${escape(local(selected.name,lang))} → ${escape(local(x.name,lang))}: <b>${P.travelMinutes(selected.id,x.id)} ${text(lang,'мин','min')}</b></p>`).join('')}</details>
      <p class="population-method-note">${icon('info',{size:16})}${text(lang,'Учебный мир. Численность, география и коэффициенты синтетические; это не прогноз для реального региона. Один ход – один год.','Fictional educational world. Population, geography and parameters are synthetic, not forecasts for a real region. One turn is one year.')}</p>`;
    stage.querySelectorAll('[data-resident-id]').forEach(b=>b.addEventListener('click',()=>callbacks.select(b.dataset.residentId)));
    stage.querySelectorAll('[data-world-view]').forEach(b=>b.addEventListener('click',()=>callbacks.navigate(b.dataset.worldView)));
    stage.querySelector('[data-resident-treasury]')?.addEventListener('click',()=>callbacks.navigate('treasury'));
    stage.querySelector('[data-residents-back]').addEventListener('click',()=>callbacks.navigate('mission'));
  }
  root.GovernorGame.PopulationUI={render,tabs,briefing,preview,year,finalSummary};
})(typeof window!=='undefined'?window:globalThis);
