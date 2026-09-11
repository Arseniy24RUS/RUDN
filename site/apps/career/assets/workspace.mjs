import {createProtectedStore,renderRecovery} from './recovery.mjs';
import {readLocal,writeLocal} from './storage.mjs';
import {createScenario,compatibleScenario,scenarioBundle,importScenarios,compareScenarioResults,SCENARIO_STORAGE_KEY,SCENARIO_LIMIT} from './scenarios.mjs';
import {childrenOf,ancestorsOf,hierarchySearch} from './hierarchy.mjs';
import {resourcesForAuthority,resourceStatus} from './resources.mjs';
import {translate as t,translateDOM,getLanguage,numberLocale} from './i18n.mjs';
const esc = x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const glyph = id=>`<svg aria-hidden="true"><use href="#i-${id}"></use></svg>`;
const external = (url,label)=>`<a class="text-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}${glyph('external')}</a>`;
const uid=()=>globalThis.crypto?.randomUUID?.()||`scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const authorityCore=a=>!['corporation','fund'].includes(a.entityType);
const date=value=>new Intl.DateTimeFormat(numberLocale(),{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value));
export function resourceCards(resources){
  const labels={closed:'Приём завершён',directory:'Кадровая страница',indirect:'Адрес подтверждён косвенно',recheck:'Нужно перепроверить', 'check-deadline':'Проверьте срок приёма'};
  return resources.map(r=>{const status=resourceStatus(r);return `<article class="resource-card ${status==='closed'?'archived':''}">
    <div class="resource-top"><span class="status-tag">${labels[status]}</span><span>Источник на русском языке</span></div>
    <h3>${esc(r.title)}</h3><p>${esc(r.note)}</p>
    <div class="resource-meta"><span>Проверено: ${r.checkedAt}</span>${r.deadline?`<span>Срок регистрации: ${r.deadline}</span>`:''}</div>
    ${external(r.url,status==='closed'?'Открыть архивное сообщение':'Перейти к источнику')}
  </article>`;}).join('');
}
export function createWorkspace({data,state,modelVersion,rank,route,openAuthority,restore,toast,download,isComplete}){
  let scenarios=[],selection=[],focus='government',storageAvailable=true,sourceAuthority='',scenarioResults=new Map();
  const protectedStore=createProtectedStore(SCENARIO_STORAGE_KEY,raw=>importScenarios(raw,[],data.questions,data.sectors).items);
  scenarios=protectedStore.value||[];storageAvailable=!protectedStore.protected;
  const byId=new Map(data.authorities.map(a=>[a.id,a]));
  const roots=new Map(data.hierarchy.roots.map(r=>[r.id,r]));
  const name=id=>roots.get(id)?.title||byId.get(id)?.shortName||id;
  const persist=()=>{
    try {protectedStore.save(scenarioBundle(scenarios));storageAvailable=true;return true;}
    catch{storageAvailable=false;toast(t('Автосохранение недоступно. Экспортируйте файл, чтобы не потерять сценарии.'));return false;}
  };
  const resultFor=item=>{
    if(!compatibleScenario(item,modelVersion))return null;
    if(!scenarioResults.has(item.id))scenarioResults.set(item.id,rank(item.inputs));
    return scenarioResults.get(item.id);
  };
  function structure(){
    const panel=$('#structure-root'), search=$('#structure-search');
    const matches=hierarchySearch(search.value,data.authorities,t);
    $('#structure-search-results').innerHTML=search.value.trim()?matches.map(a=>`<button type="button" data-focus="${a.id}">${esc(a.shortName)}<small>${esc(a.entityTypeLabel)}</small></button>`).join('')||'<p>Ничего не найдено.</p>':'';
    const current=byId.get(focus), ancestors=ancestorsOf(focus,data.hierarchy), children=childrenOf(focus,data.hierarchy);
    const examples=data.hierarchy.territorialExamples.filter(n=>n.parent===focus);
    const relation=data.hierarchy.links.find(l=>l.child===focus);
    const sources=relation?.sourceIds.map(id=>data.hierarchy.sources.find(s=>s.id===id)).filter(Boolean)||[data.hierarchy.sources[0]];
    panel.innerHTML=`<div class="structure-roots" aria-label="Ветви схемы">${data.hierarchy.roots.map(r=>`<button class="${focus===r.id||ancestors.includes(r.id)?'selected':''}" data-focus="${r.id}" type="button">${glyph(r.id==='president'?'shield':'landmark')}<span>${esc(r.title)}</span></button>`).join('')}</div>
    <nav class="structure-breadcrumbs" aria-label="Путь подчинённости">${ancestors.map(id=>`<button data-focus="${id}" type="button">${esc(name(id))}</button><span aria-hidden="true">/</span>`).join('')}<strong>${esc(name(focus))}</strong></nav>
    <section class="structure-focus"><div class="focus-symbol">${glyph(current?.entityType==='service'?'shield':'landmark')}</div><div><p class="step-kicker">${current?(relation.relation==='direct-leadership'?'Прямое руководство деятельностью':'В ведении министерства'):'Руководство деятельностью федеральных органов'}</p><h2>${esc(name(focus))}</h2><p>${esc(current?.mission||'Выберите орган, чтобы проследить его положение в системе и изучить связанные карьерные направления.')}</p>${current?`<button type="button" class="button button-primary" data-dossier="${focus}">Карьерное досье${glyph('arrow-right')}</button>`:''}</div></section>
    <section class="structure-branches"><div class="branch-heading"><h3>${children.length?'Органы в этой ветви':'Нижестоящие ФОИВ в реестре не указаны'}</h3><span>${children.length}</span></div><div class="branch-grid">${children.map(id=>{const a=byId.get(id);return `<button type="button" class="branch-node" data-focus="${id}"><span class="branch-icon">${glyph(a.entityType==='service'?'shield':'landmark')}</span><strong>${esc(a.shortName)}</strong><small>${esc(a.entityTypeLabel)}</small><span class="branch-count">${childrenOf(id,data.hierarchy).length?`${childrenOf(id,data.hierarchy).length} · `:''}${glyph('chevron')}</span></button>`;}).join('')}</div></section>
    ${current?`<section class="regional-examples"><h3>Территориальный уровень</h3><p>${examples.length?'Подтверждённые примеры подразделений. Это не полный перечень территориальной сети.':'Региональные подразделения не добавляются автоматически. Проверенный пример для этого органа пока не внесён.'}</p>${examples.map(n=>`<article>${glyph('route')}<div><strong>${esc(n.title)}</strong>${external(n.url,'Официальная страница подразделения')}</div></article>`).join('')}</section>`:''}
    <details class="structure-evidence"><summary>Основания и границы схемы</summary><p>Схема показывает руководство деятельностью и ведомственную подчинённость, а не все связи координации. Президент и Правительство не обозначены как ФОИВ. Корпорации и фонды находятся вне дерева.</p><p>Каталог Правительства дополнен более поздними официальными сведениями о ФМБА. Схема не заменяет правовую экспертизу действующих положений.</p>${sources.map(s=>external(s.url,esc(s.title))).join('')}<p>Дата сверки: ${data.hierarchy.checkedAt}</p></details>
    <div class="outside-tree"><h3>Вне дерева федеральных органов</h3><div class="tag-row">${data.authorities.filter(a=>!authorityCore(a)).map(a=>`<button class="button button-secondary" data-dossier="${a.id}">${esc(a.shortName)}</button>`).join('')}</div></div>`;
    $$('[data-focus]',$('#view-structure')).forEach(b=>b.addEventListener('click',()=>{focus=b.dataset.focus;search.value='';structure();$('#structure-root').scrollIntoView({block:'start',behavior:'smooth'});}));
    $$('[data-dossier]',panel).forEach(b=>b.addEventListener('click',()=>openAuthority(b.dataset.dossier)));
    translateDOM($('#view-structure'));
  }
  function saveScenario(){
    if(!isComplete())return toast(t('Сначала завершите тест, чтобы сохранить сценарий.'));
    if(scenarios.length>=SCENARIO_LIMIT)return toast(t('Достигнут предел: 12 сценариев. Экспортируйте и удалите ненужный.'));
    const title=$('#scenario-title').value.trim();
    if(!title)return toast(t('Введите название сценария.'));
    try {
      scenarios.push(createScenario(state,{id:uid(),title,modelVersion},data.questions,data.sectors));
      const saved=persist();$('#scenario-title').value='';renderScenarios();
      if(saved)toast(t('Сценарий сохранён на этом устройстве.'));
    }catch{toast(t('Не удалось сохранить сценарий. Проверьте ответы и название.'));}
  }
  function renderScenarios(){
    const root=$('#scenarios-root');
    $('#scenario-save').disabled=!isComplete()||scenarios.length>=SCENARIO_LIMIT;
    $('#scenario-export').disabled=!scenarios.length;
    $('#scenario-count').textContent=`${scenarios.length} / ${SCENARIO_LIMIT}`;
    $('#scenario-storage-warning').hidden=storageAvailable;
    root.innerHTML=scenarios.length?scenarios.map(item=>{
      const result=resultFor(item), top=result?.ranked.filter(authorityCore).slice(0,3)||[],checked=selection.includes(item.id);
      return `<article class="saved-scenario ${checked?'selected':''}" data-scenario-card="${item.id}"><div class="saved-scenario-heading"><div><p data-no-i18n>${date(item.createdAt)}</p><h2 data-no-i18n>${esc(item.title)}</h2></div><label class="scenario-check"><input type="checkbox" data-scenario-pick="${item.id}" ${checked?'checked':''} ${result?'':'disabled'}><span>Сравнить</span></label></div>
      <div class="tag-row">${item.inputs.prioritySectors.map(id=>`<span class="tag">${esc(data.sectors.find(s=>s.id===id)?.title||id)}</span>`).join('')}</div>
      <div class="scenario-top">${top.map((a,i)=>`<span><b>${i+1}</b>${esc(a.shortName)}<strong>${a.score.toFixed(1)}</strong></span>`).join('')}</div>
      ${!result?'<p class="scenario-warning">Сценарий другой версии модели. Сравнение отключено. Можно перенести копию ответов, заново ответив на три изменённых вопроса. Исходный сценарий останется в экспорте.</p>':''}
      <div class="scenario-actions"><button class="button button-primary" data-restore="${item.id}" ${!result?'data-legacy="true"':''}>${result?"Восстановить":"Перенести и перепроверить"}</button><button class="button button-secondary" data-rename="${item.id}">Переименовать</button><button class="icon-button" data-delete="${item.id}" aria-label="Удалить сценарий">${glyph('trash')}</button></div>
      </article>`;
    }).join(''):`<div class="workspace-empty">${glyph('route')}<h2>Ваш первый карьерный сценарий</h2><p>Завершите тест и сохраните результат. Затем измените интересы или условия работы и сравните два варианта без потери предыдущих ответов.</p><button class="button button-primary" data-go-test>Пройти тест${glyph('arrow-right')}</button></div>`;
    $('[data-go-test]',root)?.addEventListener('click',()=>route('test'));
    $$('[data-scenario-pick]',root).forEach(input=>input.addEventListener('change',()=>{const id=input.dataset.scenarioPick;if(input.checked&&selection.length>=2){input.checked=false;return toast(t('Выберите не более двух сценариев.'));}selection=input.checked?[...selection,id]:selection.filter(x=>x!==id);renderScenarios();}));
    $$('[data-restore]',root).forEach(b=>b.addEventListener('click',()=>{
      const item=scenarios.find(x=>x.id===b.dataset.restore);if(!item)return;
      if(!confirm(t('Заменить текущие ответы выбранным сценарием? Несохранённые изменения будут потеряны.')))return;
      const input=structuredClone(item.inputs);input.focusAreas||={};
      if(!compatibleScenario(item,modelVersion)){
        for(const id of ['K3','T3','I3'])delete input.answers[id];
        restore(input);route('test');toast(t('Исходный сценарий сохранён. Подтвердите три изменённых вопроса и сохраните новый вариант.'));
      }else{restore(input);route('results');toast(t('Сценарий восстановлен. Результат пересчитан.'));}
    }));
    $$('[data-rename]',root).forEach(b=>b.addEventListener('click',()=>{const item=scenarios.find(x=>x.id===b.dataset.rename),newTitle=prompt(t('Новое название сценария (до 60 символов)'),item.title);if(newTitle===null)return;const title=newTitle.trim();if(!title||title.length>60||/[\x00-\x1f]/.test(title))return toast(t('Название должно содержать от 1 до 60 символов.'));item.title=title;persist();renderScenarios();}));
    $$('[data-delete]',root).forEach(b=>b.addEventListener('click',()=>{if(!confirm(t('Удалить этот сценарий с устройства?')))return;scenarios=scenarios.filter(x=>x.id!==b.dataset.delete);selection=selection.filter(x=>x!==b.dataset.delete);scenarioResults.delete(b.dataset.delete);persist();renderScenarios();}));
    renderRecovery(root,protectedStore,{snapshot:()=>scenarioBundle(scenarios),download,translate:t,onReplace:()=>{storageAvailable=true;renderScenarios();},onError:()=>toast(t('Автосохранение недоступно. Экспортируйте файл, чтобы не потерять сценарии.'))});
    renderScenarioComparison();translateDOM($('#view-scenarios'));
  }
  function renderScenarioComparison(){
    const root=$('#scenario-comparison');
    if(selection.length!==2){root.innerHTML='<p class="comparison-hint">Отметьте два сохранённых сценария, чтобы увидеть, что изменилось в рекомендациях.</p>';return;}
    const [a,b]=selection.map(id=>scenarios.find(x=>x.id===id));
    const ra=resultFor(a),rb=resultFor(b);if(!ra||!rb){root.innerHTML='';return;}
    const comparison=compareScenarioResults(a,b,ra,rb);
    const list=[...new Set([...ra.ranked.filter(authorityCore).slice(0,5),...rb.ranked.filter(authorityCore).slice(0,5)].map(x=>x.id))];
    const rows=comparison.rows.filter(x=>list.includes(x.id));
    root.innerHTML=`<div class="comparison-heading"><h2>Два сценария рядом</h2><p>Разность индексов: второй сценарий минус первый. Это изменение условного соответствия, не прогноз карьерного успеха.</p></div>
    <div class="scenario-summary"><span><b>${comparison.topOverlap} / 5</b>Общих органов в ТОП-5</span><span><b>${comparison.changedAnswers.length}</b>Изменённых ответов</span><span><b>${comparison.changedConditions.length}</b>Изменённых условий</span></div>
    <div class="scenario-table-scroll" tabindex="0" aria-label="Таблица сравнения сценариев"><table class="scenario-table"><caption>Органы из двух первых пятёрок</caption><thead><tr><th>Орган</th><th data-no-i18n>${esc(a.title)}</th><th data-no-i18n>${esc(b.title)}</th><th>Разность</th></tr></thead><tbody>${rows.map(row=>`<tr><th><button class="text-link" data-dossier="${row.id}">${esc(name(row.id))}</button></th><td>${row.scoreA.toFixed(1)}<small>Место: ${row.rankA}</small></td><td>${row.scoreB.toFixed(1)}<small>Место: ${row.rankB}</small></td><td class="${row.delta>0?'delta-up':''}">${row.delta>0?'+':''}${row.delta.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`;
    $$('[data-dossier]',root).forEach(b=>b.addEventListener('click',()=>openAuthority(b.dataset.dossier)));
  }
  function opportunities(){
    const query=$('#opportunity-authority');
    if(query.options.length===1)data.authorities.forEach(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=a.shortName;query.append(o);});
    query.value=sourceAuthority;
    const kind=$('#opportunity-kind').value;
    const auth=byId.get(sourceAuthority);
    let resources=auth?resourcesForAuthority(auth,data.resources):data.resources;
    if(kind)resources=resources.filter(r=>kind==='archive'?r.kind==='announcement':kind==='regional'?r.kind==='territorial-directory':r.kind==='directory');
    const specific=auth?data.resources.some(r=>r.authorityIds.includes(auth.id)&&r.kind==='directory'):true;
    $('#opportunities-root').innerHTML=`${auth&&!specific?`<div class="source-fallback"><h2>${esc(auth.shortName)}</h2><p>Отдельная кадровая страница этого органа пока не подтверждена. Начните с официальной карточки и перейдите на сайт ведомства.</p>${external(auth.governmentUrl,'Официальная карточка органа')}</div>`:''}<div class="resource-grid">${resourceCards(resources)}</div>${!resources.length?'<p>В этой категории проверенные ссылки пока не добавлены.</p>':''}`;
    $('#opportunity-count').textContent=String(resources.length);translateDOM($('#view-opportunities'));
  }
  function bind(){
    $('#structure-search').addEventListener('input',structure);
    $('#structure-home').addEventListener('click',()=>{focus='government';$('#structure-search').value='';structure();});
    $('#scenario-save').addEventListener('click',saveScenario);
    $('#scenario-form').addEventListener('submit',e=>{e.preventDefault();saveScenario();});
    $('#scenario-export').addEventListener('click',()=>download('rudn-career-scenarios.json',JSON.stringify(scenarioBundle(scenarios),null,2)));
    $('#scenario-import').addEventListener('change',async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{if(file.size>512*1024)throw Error('size');const result=importScenarios(await file.text(),scenarios,data.questions,data.sectors);scenarios=result.items;persist();renderScenarios();toast(t(`Добавлено сценариев: ${result.added}. Повторов: ${result.duplicates}.`));}
      catch{toast(t('Файл не принят. Проверьте формат, версию, лимит и отсутствие конфликтующих записей.'));}
      event.target.value='';
    });
    $('#opportunity-authority').addEventListener('change',e=>{sourceAuthority=e.target.value;opportunities();});
    $('#opportunity-kind').addEventListener('change',opportunities);
    document.addEventListener('app:language',()=>{
      if(!$('#view-structure').hidden)structure();
      if(!$('#view-scenarios').hidden)renderScenarios();
      if(!$('#view-opportunities').hidden)opportunities();
    });
  }
  function saveDetached(inputs,title){
    if(scenarios.length>=SCENARIO_LIMIT)throw new Error('scenario-limit');
    const item=createScenario(inputs,{id:uid(),title,modelVersion},data.questions,data.sectors);
    scenarios.push(item);
    const persisted=persist();
    return {id:item.id,persisted};
  }
  return {bind,saveDetached,render(routeName){if(routeName==='structure')structure();if(routeName==='scenarios')renderScenarios();if(routeName==='opportunities')opportunities();},focusAuthority(id){focus=byId.has(id)&&authorityCore(byId.get(id))?id:'government';route('structure');},showResources(id){sourceAuthority=byId.has(id)?id:'';route('opportunities');},resourceCardsFor(id){return resourceCards(resourcesForAuthority(byId.get(id),data.resources));}};
}
