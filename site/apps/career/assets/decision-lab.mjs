import {getLanguage,translate} from './i18n.mjs';
import {checkedInputs,inputFingerprint,rankInput,explainAuthority,localSensitivity,promoteSector,changeCondition,comparePreview,governmentRanking} from './decision-model.mjs';
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L=(ru,en)=>getLanguage()==='en'?en:translate(ru);
const T=x=>E(translate(x));
const I=id=>`<svg aria-hidden="true"><use href="#i-${id}"></use></svg>`;
const F=x=>new Intl.NumberFormat(getLanguage()==='zh-Hans'?'zh-CN':getLanguage()==='en'?'en-GB':'ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1}).format(x);
const D=x=>`${x>0?'+':''}${F(x)}`;

export function createDecisionLab({data,state,routeTo,openAuthority,saveScenario,toast}) {
  const root=document.querySelector('#decision-root');
  let mode='explain',selected='',baseline=null,draft=null,fingerprint='',sensitivity=null,busy=false,title='';
  let stale=false,preview=null,result=null,epoch=0;
  const agency=id=>data.authorities.find(a=>a.id===id);
  const sname=id=>data.sectors.find(s=>s.id===id)?.title||id;
  function sync(){
    try {
      const fp=inputFingerprint(state,data);
      if(fp!==fingerprint){stale=Boolean(fingerprint);baseline=checkedInputs(state,data);draft=structuredClone(baseline);
        fingerprint=fp;sensitivity=null;busy=false;title='';epoch++;result=rankInput(baseline,data);preview=null;}
      selected=agency(selected)?selected:governmentRanking(result)[0].id;
      return true;
    }catch{return false;}
  }
  function entry(id){selected=id||selected;mode='explain';routeTo('lab');}
  const trackName=id=>data.tracks.find(t=>t.id===id)?.title||id;
  function explain(){
    const x=explainAuthority(selected,baseline,data,result);
    const labels=[L('Виды работы','Work interests'),L('Сферы политики','Policy areas'),L('Условия труда','Working conditions')];
    const max=[40,45,15];
    const near=x.neighbours.map(a=>`<button type="button" data-lab-agency="${a.id}"><span>${T(a.shortName)}</span><b>${F(a.score)}</b></button>`).join('');
    return `<div class="dl-grid"><article class="dl-main"><header class="dl-score-head"><div><p>${L('Разбор текущего результата','Your current result, explained')}</p><h2>${T(x.authority.shortName)}</h2><span>${x.adjacent?L('Смежный работодатель публичного сектора','Other public-sector employer'):L('Орган власти','Government body')} · ${L('место','rank')} ${x.rank} / ${x.categorySize}</span></div><div class="dl-index"><strong>${F(x.item.score)}</strong><span>${L('из 100 · не процент','out of 100 · not a percentage')}</span></div></header>
    <p class="dl-track">${L('Ближайший карьерный трек','Closest career track')}: <strong>${T(x.item.track?.title)}</strong></p>
    ${x.roleProfile.flat?`<div class="dl-notice">${L('Виды работы оценены сходно. Влияние относительного профиля плавно ослаблено. Первое место трека не означает выраженного предпочтения.','Work interests are similar across scales. The relative profile has a smoothly reduced influence. A track listed first is not evidence of a strong preference.')}</div>`:''}
    ${x.lowInterest?`<div class="dl-notice">${L('Интерес ко всем видам работы невысок. Названия органов здесь служат поводом для знакомства, а не подтверждением мотивации к государственной службе.','Interest in all work areas is low. Agency names are starting points for exploration, not evidence of motivation for public service.')}</div>`:''}
    <h3>${L('Из чего сложился индекс','How the index adds up')}</h3>
    <div class="dl-stacked" aria-hidden="true">${x.contributions.map((p,i)=>`<i class="dl-piece-${i}" style="width:${p}%"></i>`).join('')}</div>
    <div class="dl-contributions">${x.contributions.map((p,i)=>`<div><span><i class="dl-key dl-piece-${i}"></i>${labels[i]}</span><strong>${F(p)}</strong><small>${L('базовый вес','base weight')}: ${max[i]} / 100</small></div>`).join('')}</div>
    <p class="dl-formula">${x.contributions.map(F).join(' + ')} = ${F(x.item.score)} ${L('балла индекса','index points')}</p>
    <p class="dl-help">${L('Все три вклада уже учитывают коэффициент представленности трека. Десятые согласованы так, чтобы сумма совпадала с отображаемым индексом; ранжирование от этого не меняется.','All three contributions already include the track-representation factor. Displayed tenths are reconciled to add up to the index; rankings are not changed.')}</p>
    <details class="dl-details"><summary>${L('Сферы: Ваш выбор и профиль органа','Policy areas: your choices and the agency profile')}</summary><div class="dl-table-wrap" tabindex="0"><table><caption>${L('Показан наиболее подходящий предметный путь. Веса – авторские, не доли сотрудников','Only the best-fitting subject path contributes. Weights are authored, not workforce shares')}</caption><thead><tr><th>${L('Сфера','Area')}</th><th>${L('Ваш приоритет','Your priority')}</th><th>${L('Вес органа','Agency weight')}</th><th>${L('Вклад','Contribution')}</th></tr></thead><tbody>${x.sectorRows.map(s=>`<tr><th>${T(sname(s.id))}</th><td>${s.priority?`№ ${s.priority}`:s.lowPriority?L('Наименее интересно','Least interesting'):L('Не выбрана','Not selected')}<small>${F(s.preference)}</small></td><td>${F(s.weight)}</td><td>${F(s.points)}</td></tr>`).join('')}</tbody></table></div><p>${L('При замене сферы меняется только отраслевой компонент. Невыбранная сфера получает базовый вес 0,25, а не считается отвергнутой.','Changing an area affects only the area component. An unselected area receives a baseline weight of 0.25 and is not treated as rejected.')}</p></details>
    <details class="dl-details"><summary>${L('Условия: где есть расхождение','Conditions: where preferences differ')}</summary><p>${L('Диапазоны относятся к выбранному направлению работы. Это сценарные предположения, не требования вакансии. Неизвестное условие имеет нейтральный вклад. Более высокая готовность не штрафуется.','Ranges apply to the selected work path. They are scenario assumptions, not vacancy requirements. An unknown condition has a neutral contribution. Greater willingness is not penalised.')}</p><div class="dl-table-wrap" tabindex="0"><table><thead><tr><th>${L('Условие','Condition')}</th><th>${L('Ваш ответ','Your answer')}</th><th>${L('Модель органа','Agency model')}</th><th>${L('Вклад, баллы','Contribution, points')}</th></tr></thead><tbody>${x.conditionRows.map(c=>`<tr><th>${T(data.conditions.find(y=>y.id===c.id).title)}</th><td>${c.willingness} / 5</td><td>${T(c.requirementLabel)}${c.known?" / 5":""}</td><td>${F(15*x.factor*c.fit/4)}</td></tr>`).join('')}</tbody></table></div></details>
    <details class="dl-details"><summary>${L('Все карьерные треки этого органа','All career tracks in this agency')}</summary><p>${L('Выбирается максимальный индекс среди заданных треков. Коэффициент представленности: 3 → 1,00; 2 → 0,96; 1 → 0,91. Это авторская настройка.','The highest index among the defined tracks is selected. Representation factors: 3 → 1.00; 2 → 0.96; 1 → 0.91. These are authored settings.')}</p><div class="dl-tracks">${x.tracks.map(t=>`<div class="${t.selected?'selected':''}"><span>${T(trackName(t.id))}${t.selected?`<small>${L('Показан в результате','Shown in your result')}</small>`:''}</span><span>${t.importance} / 3</span><strong>${F(t.score)}</strong></div>`).join('')}</div></details>
    <details class="dl-details"><summary>${L('Как интересы сопоставлены с ролью','How interests are matched to a role')}</summary><p>${L('Ваши оценки 1–5 и авторская выраженность задачи в роли 0–1 – разные шкалы. Сравнивается форма девяти показателей, а не их абсолютные уровни. Это не измерение компетенций.','Your 1–5 ratings and authored 0–1 task relevance are different scales. The shapes of the nine-value profiles are compared, not their absolute levels. This does not measure skills.')}</p><div class="dl-table-wrap" tabindex="0"><table><thead><tr><th>${L('Вид работы','Work area')}</th><th>${L('Интерес 1–5','Interest 1–5')}</th><th>${L('Выраженность в роли 0–1','Role relevance 0–1')}</th></tr></thead><tbody>${x.roleRows.map(r=>`<tr><th>${T(data.scales.find(s=>s.id===r.id).short)}</th><td>${F(r.interest)}</td><td>${F(r.relevance)}</td></tr>`).join('')}</tbody></table></div></details>
    </article><aside class="dl-aside"><section class="dl-side-card"><h3>${L('Почему не стоит спорить о десятых','Why tenths should not decide a career')}</h3><p>${L('Эти органы находятся в пределах 2,5 балла от выбранного. Порог – правило интерфейса, не статистический доверительный интервал.','These agencies are within 2.5 points of the selected one. The threshold is an interface rule, not a statistical confidence interval.')}</p><div class="dl-neighbours">${near||`<p>${L('В этой группе соседей в пределах порога нет.','No other agency in this category is within the threshold.')}</p>`}</div><p class="dl-help">${L('Порядок определяется неокруглённым индексом; точные равенства разрешаются по идентификатору. Это технический порядок, не доказательство преимущества.','Ordering uses the unrounded index; exact ties are resolved by identifier. This technical order is not evidence of superiority.')}</p></section>
    <section class="dl-side-card"><h3>${L('Основание рекомендации','Evidence behind the recommendation')}</h3><p>${L('Функции органа и условные веса не одно и то же. Источники описывают функции; числовые профили являются учебным моделированием.','Official functions and authored weights are not the same. Sources describe functions; numerical profiles are educational modelling.')}</p><button type="button" class="button button-secondary" id="dl-sources">${L('Посмотреть источники','Review sources')}${I('source')}</button></section>
    ${sensitivityCard(x)}
    </aside></div>`;
  }
  function sensitivityCard(x){
    if(!sensitivity)return `<section class="dl-side-card"><h3>${L('Насколько результат чувствителен','How sensitive is this result?')}</h3><p>${L('Изменим по одному ответу на один балл в обе стороны. Сферы и условия останутся прежними; исходные ответы не сохраняются заново.','Change one answer at a time by one point in either direction. Areas and conditions stay fixed; your original answers remain untouched.')}</p><button type="button" id="dl-sensitivity" class="button button-primary" ${busy?'disabled':''}>${busy?L('Рассчитываем…','Calculating…'):L('Проверить небольшие изменения','Check small changes')}</button><p class="dl-help">${L('Это проверка алгоритма рядом с Вашим ответом, не прогноз и не оценка надёжности теста.','This is a local algorithm check, not a prediction or an estimate of test reliability.')}</p></section>`;
    const row=sensitivity.rows.find(r=>r.id===x.item.id);
    return `<section class="dl-side-card"><h3>${L('Проверка малых изменений','Small-change check')}</h3><dl class="dl-stability"><div><dt>${L('Вариантов ответов','Answer variants')}</dt><dd>${sensitivity.count}</dd></div>${row?`<div><dt>${L('Диапазон места','Rank range')}</dt><dd>${row.minRank}–${row.maxRank}</dd></div><div><dt>${L('Остался в ТОП-5','Appeared in the top 5')}</dt><dd>${row.topFive} / ${sensitivity.count}</dd></div><div><dt>${L('Диапазон индекса','Index range')}</dt><dd>${F(row.minScore)}–${F(row.maxScore)}</dd></div>`:`<div><dt>${L('Смежные работодатели в этой проверке не ранжируются','Other public-sector employers are not included in this check')}</dt></div>`}</dl><p class="dl-help">${L('Перебраны все допустимые изменения ровно одного из 27 ответов на ±1. Диапазоны включают исходный результат; счётчики учитывают только изменённые варианты. Это не доверительный интервал и не вероятность.','Every allowed ±1 change to one of 27 answers was tested. Ranges include the original result; counts include changed variants only. This is not a confidence interval or a probability.')}</p></section>`;
  }
  function topList(items,comparison=false){return `<ol class="dl-top-list">${items.slice(0,5).map(a=>{const delta=preview.rows.find(r=>r.id===a.id);return `<li><span class="dl-position">${a.rank}</span><div><strong>${T(a.shortName)}</strong><small>${T(a.track?.title)}</small>${comparison?`<span class="dl-delta">${L('Индекс','Index')} ${D(delta.scoreDelta)} · ${delta.rankDelta===0?L('место прежнее','same rank'):delta.rankDelta>0?L('выше на ','up ')+delta.rankDelta:L('ниже на ','down ')+Math.abs(delta.rankDelta)}</span>`:''}</div><b>${F(a.score)}</b></li>`;}).join('')}</ol>`;}
  function experiment(){
    preview=comparePreview(baseline,draft,data);
    const changed=preview.changes.priorityChanged||preview.changes.conditions.length>0;
    return `<div class="dl-notice dl-safe">${I('lock')}<p>${L('Вы работаете с копией. Исходные ответы, основной результат, групповой экспорт и записи мастерской не изменяются. Сохранить вариант можно только как отдельный сценарий.','You are working on a copy. Your original answers, main result, class export and workshop notes remain unchanged. You can only save the variant as a separate scenario.')}</p></div>
    <div class="dl-experiment-grid"><aside class="dl-controls"><h2>${L('Что изменим?','What shall we change?')}</h2><label for="dl-sector">${L('Первое место среди сфер','First-priority policy area')}</label><select id="dl-sector">${data.sectors.map(s=>`<option value="${s.id}" ${draft.prioritySectors[0]===s.id?'selected':''} ${draft.lowPrioritySectors.includes(s.id)?'disabled':''}>${T(s.title)}${draft.lowPrioritySectors.includes(s.id)?' · '+L('в наименее интересных','among least interesting'):''}</option>`).join('')}</select><p class="dl-help">${L('Сфера из первой четвёрки меняется местами с первой. Новая сфера заменяет первую; прежняя становится невыбранной. Отвергнутые сферы заблокированы.','An area already in your top four swaps places with the first. A new area replaces the first; the former first becomes unselected. Least-interest areas cannot be promoted here.')}</p>
    <h3>${L('Готовность к условиям работы','Willingness to accept working conditions')}</h3>${data.conditions.map(c=>`<label class="dl-condition" for="dl-${c.id}"><span>${T(c.title)}</span><select id="dl-${c.id}" data-dl-condition="${c.id}">${[1,2,3,4,5].map(v=>`<option value="${v}" ${draft.conditions[c.id]===v?'selected':''}>${v} / 5</option>`).join('')}</select></label>`).join('')}
    <p class="dl-help">${L('1 – низкая готовность; 5 – высокая. Оценки интереса к видам работы здесь не меняются.','1 means low willingness; 5 means high willingness. Work-interest answers are not changed here.')}</p><button type="button" id="dl-reset" class="button button-secondary" ${changed?'':'disabled'}>${I('reset')}${L('Вернуть исходный вариант','Reset to original')}</button>
    <form id="dl-save-form" class="dl-save"><label for="dl-title">${L('Название нового сценария','New scenario name')}</label><input id="dl-title" maxlength="60" value="${E(title)}" placeholder="${L('Например: больше выездной работы','For example: more field work')}"><button type="submit" class="button button-primary" ${changed?'':'disabled'}>${I('file')}${L('Сохранить как сценарий','Save as a scenario')}</button></form></aside>
    <div class="dl-preview"><div class="dl-preview-summary" role="status"><h2>${L('Две версии рядом','Two versions side by side')}</h2><p>${L('Общих органов в первых пятёрках','Agencies shared by the top fives')}: <b>${preview.overlap} / 5</b> · ${L('изменено условий','conditions changed')}: <b>${preview.changes.conditions.length}</b></p></div>
    <div class="dl-pair"><article><h3>${L('Исходный результат','Original result')}</h3><div class="dl-priorities">${baseline.prioritySectors.map((id,i)=>`<span>${i+1}. ${T(sname(id))}</span>`).join('')}</div>${topList(preview.left)}</article><article class="dl-modified"><h3>${L('Экспериментальный вариант','Experimental variant')}</h3><div class="dl-priorities">${draft.prioritySectors.map((id,i)=>`<span>${i+1}. ${T(sname(id))}</span>`).join('')}</div>${topList(preview.right,true)}</article></div>
    <p class="dl-help">${L('Показано следствие введённых изменений в текущей модели. Это не совет подбирать ответы под желаемое ведомство. Чтобы изменить интересы по существу, вернитесь к анкете или сохраните новый самостоятельный сценарий.','These are the model’s consequences of your changes, not an invitation to tailor answers to a target agency. To reconsider your actual interests, return to the questionnaire or save a separate scenario.')}</p></div></div>`;
  }
  function render(route){
    if(route!=='lab')return;
    if(!sync()){root.innerHTML=`<div data-no-i18n class="dl-empty"><h1>${L('Лаборатория выбора','Choice laboratory')}</h1><p>${L('Сначала завершите тест. Лаборатория объясняет Ваш результат и не подставляет вымышленные ответы.','Complete the test first. The laboratory explains your result; it does not insert fictional answers.')}</p><button type="button" class="button button-primary" id="dl-start">${L('Вернуться к тесту','Return to the test')}</button></div>`;root.querySelector('#dl-start').onclick=()=>routeTo('test');return;}
    root.innerHTML=`<div data-no-i18n><header class="section-heading"><div><h1>${L('Лаборатория выбора','Choice laboratory')}</h1><p>${L('Разберите рекомендацию и сравните варианты, не переписывая свой результат.','Understand a recommendation and explore variants without changing your result.')}</p></div><button type="button" class="button button-secondary" id="dl-back">${I('arrow-left')}${L('Мой результат','My result')}</button></header>
    ${stale?`<p class="dl-notice">${L('Основные ответы изменились. Эксперимент начат заново от актуального результата.','Your main answers changed. The experiment has been reset to the current result.')}</p>`:''}
    <div class="dl-tabs" role="tablist" aria-label="${L('Раздел лаборатории','Laboratory section')}">${[['explain','Почему этот орган?','Why this agency?'],['experiment','Что изменится, если…','What changes if…']].map(([id,ru,en])=>`<button type="button" role="tab" id="dl-tab-${id}" aria-controls="dl-content" aria-selected="${mode===id}" tabindex="${mode===id?0:-1}" data-dl-mode="${id}">${L(ru,en)}</button>`).join('')}</div>
    ${mode==='explain'?`<div class="dl-select"><label for="dl-authority">${L('Орган для разбора','Agency to explain')}</label><select id="dl-authority">${data.authorities.map(a=>`<option value="${a.id}" ${selected===a.id?'selected':''}>${T(a.shortName)}${['fund','corporation'].includes(a.entityType)?' · '+L('публичный сектор','public sector'):''}</option>`).join('')}</select></div>`:''}
    <div id="dl-content" role="tabpanel" aria-labelledby="dl-tab-${mode}">${mode==='explain'?explain():experiment()}</div></div>`;
    bind();
  }
  function rerender(focusId){render('lab');if(focusId)root.querySelector('#'+focusId)?.focus({preventScroll:true});}
  function bind(){
    root.querySelector('#dl-back').onclick=()=>routeTo('results');
    root.querySelectorAll('[data-dl-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.dlMode;rerender(b.id);});
    root.querySelector('.dl-tabs').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=[...root.querySelectorAll('[data-dl-mode]')];if(!tabs.includes(document.activeElement))return;e.preventDefault();tabs[e.key==='Home'?0:e.key==='End'?1:mode==='explain'?1:0].click();};
    root.querySelector('#dl-authority')?.addEventListener('change',e=>{selected=e.target.value;rerender('dl-authority');});
    root.querySelectorAll('[data-lab-agency]').forEach(b=>b.onclick=()=>{selected=b.dataset.labAgency;rerender('dl-authority');});
    root.querySelector('#dl-sources')?.addEventListener('click',()=>openAuthority(selected,'sources'));
    root.querySelector('#dl-sensitivity')?.addEventListener('click',async()=>{
      const generation=epoch,snapshot=structuredClone(baseline);busy=true;rerender();
      await new Promise(resolve=>setTimeout(resolve,40));
      try{const calculated=localSensitivity(snapshot,data);if(generation!==epoch)return;sensitivity=calculated;}
      catch{toast(L('Не удалось проверить чувствительность. Исходные ответы сохранены.','Sensitivity check failed. Your original answers are unchanged.'));}
      finally{if(generation===epoch){busy=false;if(!document.querySelector('#view-lab').hidden)rerender();}}
    });
    root.querySelector('#dl-sector')?.addEventListener('change',e=>{draft=promoteSector(draft,e.target.value,data);rerender('dl-sector');});
    root.querySelectorAll('[data-dl-condition]').forEach(el=>el.onchange=()=>{draft=changeCondition(draft,el.dataset.dlCondition,Number(el.value),data);rerender(el.id);});
    root.querySelector('#dl-reset')?.addEventListener('click',()=>{draft=structuredClone(baseline);title='';rerender('dl-tab-experiment');});
    root.querySelector('#dl-title')?.addEventListener('input',e=>{title=e.target.value;});
    root.querySelector('#dl-save-form')?.addEventListener('submit',e=>{
      e.preventDefault();
      const difference=comparePreview(baseline,draft,data).changes;
      if(!difference.priorityChanged&&!difference.conditions.length)return;
      if(!title.trim()){toast(L('Введите название отдельного сценария.','Enter a name for the separate scenario.'));root.querySelector('#dl-title').focus();return;}
      // Recheck base: no stale experiment should be saved after a change in the main test.
      if(inputFingerprint(state,data)!==fingerprint){rerender();return;}
      try{const saved=saveScenario(draft,title);if(saved){title='';if(saved.persisted)toast(L('Новый сценарий добавлен. Исходный результат не изменён.','New scenario added. Your original result is unchanged.'));routeTo('scenarios');}}
      catch{toast(L('Сценарий не добавлен. Проверьте название и лимит сохранений.','Scenario not added. Check the name and the saved-scenario limit.'));}
    });
  }
  document.addEventListener('app:language',()=>{if(!document.querySelector('#view-lab').hidden)render('lab');});
  return {render,open:entry};
}
