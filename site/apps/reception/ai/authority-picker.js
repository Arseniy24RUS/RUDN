import {RECEPTION_AUTHORITIES, RECEPTION_TERRITORIES} from './authority-directory.js';
import {resourceURL} from '../../../assets/js/release-resources.js';

const labels = {
  ru:{origin:'Адрес для ответа',unknown:'Адрес для ответа не указан',site:'Место события',title:'Кто рассмотрит вопрос или подготовит ответ?',search:'Поиск органа или подразделения',territory:'Территория органа',all:'Все территории',selected:'Выбрано',empty:'Органы не найдены. Измените запрос или территорию.',more:'Уточните поиск или выберите территорию, чтобы увидеть другие органы.'},
  en:{origin:'Correspondence address',unknown:'No correspondence address given',site:'Location of the incident',title:'Who should review the matter or prepare the reply?',search:'Find an authority or office',territory:'Authority’s jurisdiction',all:'All regions',selected:'Selected',empty:'No matching authorities. Change the search or region.',more:'Refine the search or select a region to see more authorities.'},
  zh:{origin:'回复地址',unknown:'未提供回复地址',site:'事件地点',title:'哪个机构应处理事项或起草回复？',search:'查找机构或部门',territory:'机构管辖地区',all:'所有地区',selected:'已选择',empty:'未找到相关机构。请修改搜索条件或地区。',more:'请缩小搜索范围或选择地区以查看更多机构。'},
};
const MAX_VISIBLE_AUTHORITIES = 80;
const ruNames = new Intl.Collator('ru');
const siteRoot = new URL('../../../', import.meta.url);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const display = (value, locale) => typeof value === 'string' ? value : value?.[locale] || value?.ru || '';
const normalize = value => String(value ?? '').toLocaleLowerCase('ru').replaceAll('ё','е').trim();

export function routingOriginView(workflow, {locale='ru'} = {}) {
  if (!workflow?.origin) return '';
  const copy = labels[locale] || labels.ru;
  const {origin,site} = workflow;
  const address = [origin.territory,origin.city,origin.address].map(item=>display(item,locale)).filter(Boolean);
  const place = site ? [site.territory,site.city,site.detail].map(item=>display(item,locale)).filter(Boolean) : [];
  return `<dl class="rxa-routing-origin"><div><dt>${esc(copy.origin)}</dt><dd>${esc([...new Set(address)].join(', ') || copy.unknown)}</dd></div>${place.length ? `<div><dt>${esc(copy.site)}</dt><dd>${esc([...new Set(place)].join(', '))}</dd></div>` : ''}</dl>`;
}

export function filterAuthorities({search='',territoryId='',locale='ru',recipientIds=[]}={}) {
  const words = normalize(search).split(/\s+/).filter(Boolean);
  return RECEPTION_AUTHORITIES.filter(authority => {
    if (recipientIds.includes(authority.id)) return true;
    if (territoryId && authority.territoryIds.length && !authority.territoryIds.includes(territoryId)) return false;
    const regionNames = authority.territoryIds.map(id => RECEPTION_TERRITORIES[id]?.name);
    const text = normalize([authority.name,authority.shortName,...regionNames.flatMap(value=>[display(value,locale),display(value,'ru')])].join(' '));
    return words.every(word=>text.includes(word));
  }).sort((a,b) => {
    const firstSelected = Number(recipientIds.includes(b.id)) - Number(recipientIds.includes(a.id));
    const firstLocal = territoryId ? Number(b.territoryIds.includes(territoryId)) - Number(a.territoryIds.includes(territoryId)) : 0;
    return firstSelected || firstLocal || ruNames.compare(a.name,b.name);
  });
}

export function authorityPickerView(value, {locale='ru',workflow,search='',territoryId='',disabled=false} = {}) {
  if (!workflow) return '';
  const copy = labels[locale] || labels.ru;
  const recipientIds = Array.isArray(value?.recipientIds) ? value.recipientIds : [];
  const limit = workflow.recipientLimit === 2 ? 2 : 1;
  const offices = filterAuthorities({search,territoryId,locale,recipientIds});
  const regions = Object.entries(RECEPTION_TERRITORIES).sort(([,a],[,b])=>display(a.name,locale).localeCompare(display(b.name,locale),locale));
  const items = offices.slice(0,MAX_VISIBLE_AUTHORITIES).map(authority=>{
    const selected = recipientIds.includes(authority.id);
    const locked = disabled || (limit > 1 && recipientIds.length >= limit && !selected);
    const region = authority.territoryIds.map(id=>display(RECEPTION_TERRITORIES[id]?.name,locale)).filter(Boolean).join(' · ');
    const emblem = authority.emblem ? `<img width="30" height="30" loading="lazy" decoding="async" src="${esc(resourceURL(authority.emblem,siteRoot).href)}" alt="">` : '';
    const short = authority.shortName && authority.shortName !== authority.name ? ` <small>${esc(authority.shortName)}</small>` : '';
    const name = esc(display(authority.name,locale));
    return `<label class="rxa-routing-authority"><input type="checkbox" data-routing-recipient data-focus="routing-recipient-${esc(authority.id)}" value="${esc(authority.id)}" ${selected?'checked':''} ${locked?'disabled':''}>${emblem}<span>${name}${short}${region?`<small class="rxa-routing-jurisdiction">${esc(region)}</small>`:''}</span></label>`;
  }).join('');
  return `<fieldset class="rxa-fieldset rxa-routing-picker"><legend>${esc(copy.title)}</legend><div class="rxa-routing-filters"><label>${esc(copy.search)}<input type="search" data-routing-search data-focus="routing-search" autocomplete="off" maxlength="120" value="${esc(search)}" ${disabled?'disabled':''}></label><label>${esc(copy.territory)}<select data-routing-territory data-focus="routing-territory" ${disabled?'disabled':''}><option value="">${esc(copy.all)}</option>${regions.map(([id,row])=>`<option value="${esc(id)}" ${id===territoryId?'selected':''}>${esc(display(row.name,locale))}</option>`).join('')}</select></label></div><p class="rxa-routing-count" aria-live="polite">${esc(copy.selected)} ${recipientIds.length}/${limit}</p><div class="rxa-routing-options" data-routing-options>${items||`<p>${esc(copy.empty)}</p>`}</div>${offices.length>MAX_VISIBLE_AUTHORITIES?`<p class="rxa-routing-count">${esc(copy.more)}</p>`:''}</fieldset>`;
}

export function authoritySelectionLabel(value,{locale='ru'}={}){return (value?.recipientIds||[]).map(id=>RECEPTION_AUTHORITIES.find(row=>row.id===id||row.careerId===id)).filter(Boolean).map(row=>display(row.name,locale)).join('; ');}
