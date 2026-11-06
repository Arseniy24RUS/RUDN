import {getLanguage, translate} from './i18n.mjs';

export const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const L=(ru,en,zh)=>getLanguage()==='ru'?ru:getLanguage()==='en'?en:zh;
export const display=value=>E(translate(typeof value==='string'?value:''));
export const icon=id=>`<svg aria-hidden="true"><use href="#i-${E(id)}"></use></svg>`;
export const number=(value,digits=0)=>Number(value).toLocaleString(getLanguage()==='zh-Hans'?'zh-CN':getLanguage(),{minimumFractionDigits:digits,maximumFractionDigits:digits});
export function date(value){
  if(!value||!Number.isFinite(Date.parse(value)))return '';
  return new Intl.DateTimeFormat(getLanguage()==='zh-Hans'?'zh-CN':getLanguage(),{dateStyle:'medium',timeZone:'Europe/Moscow'}).format(new Date(value));
}
export function safeURL(value){
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?E(url.href):'';}catch{return '';}
}
export function regionName(region){return getLanguage()==='en'?(region?.name_en||region?.name||''):getLanguage()==='zh-Hans'?(region?.name_zh||region?.name||''):(region?.name||'');}
export function groupLabel(id){
  return ({education:L('Образование','Education','学历'),experience:L('Стаж и опыт','Experience','工作经历'),knowledge:L('Знания','Knowledge','知识'),skills:L('Умения и навыки','Skills','能力与技能'),skill:L('Умения и навыки','Skills','能力与技能'),eligibility:L('Условия допуска','Eligibility','资格条件'),other:L('Другие и составные требования','Other and combined requirements','其他及综合要求'),unclassified:L('Без предметной группы','Without a subject group','未分类'),
    'finance-economy':L('Финансы и экономика','Finance and economics','财政与经济'),
    'law-regulation':L('Право и регулирование','Law and regulation','法律与监管'),
    communication:L('Коммуникация','Communication','沟通'),
    'organization-projects':L('Организация и проекты','Organisation and projects','组织与项目'),
    'data-digital':L('Данные и цифровые инструменты','Data and digital tools','数据与数字工具'),
    'documents-records':L('Документы и делопроизводство','Documents and records','文件与文书工作'),
    'sector-knowledge':L('Знание предметной области','Subject knowledge','专业领域知识'),
    'analytical-work':L('Аналитическая работа','Analytical work','分析工作')})[id]||E(id);
}
export function levelLabel(authority){
  if(['corporation','fund'].includes(authority?.entityType)||authority?.level==='national-corporation')return L('Публичный сектор','Public-sector employer','公共部门雇主');
  if(authority?.level==='municipal')return L('Муниципальный уровень','Municipal level','市政层级');
  if(authority?.regionId)return L('Региональный уровень','Regional level','地区层级');
  return L('Федеральный уровень','Federal level','联邦层级');
}

/** Both polygons use the same denominator: the listed requirements in each group.
 * Unknown self-assessments are drawn separately in the adjacent count table.
 * A group without source requirements must be omitted, never converted to zero.
 */
export function requirementRadar(rows){
  const valid=rows.filter(row=>row.total>0).slice(0,9);
  if(valid.length<3)return '';
  const center=160,radius=112,count=valid.length;
  const point=(index,ratio)=>{const angle=-Math.PI/2+index*Math.PI*2/count;return [center+Math.cos(angle)*radius*ratio,center+Math.sin(angle)*radius*ratio];};
  const polygon=ratio=>valid.map((_,i)=>point(i,ratio).join(',')).join(' ');
  const values=valid.map(row=>Math.max(0,Math.min(1,row.met/row.total)));
  const description=valid.map((row,i)=>`${i+1}. ${groupLabel(row.id)}: ${row.met}/${row.total}`).join('; ');
  return `<svg class="journey-target-radar" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="${E(L('Выполнение требований по самооценке:','Self-assessed requirements met:','自评已符合的要求：')+' '+description)}">
    <title>${L('Моя самооценка и требования выбранной должности','My self-assessment and the selected role requirements','我的自评与所选职位要求')}</title>
    <g fill="none" stroke="#d7e2ec" stroke-width="1">${[.25,.5,.75,1].map(value=>`<polygon points="${polygon(value)}"/>`).join('')}${valid.map((_,i)=>{const [x,y]=point(i,1);return `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}"/>`;}).join('')}</g>
    <polygon points="${polygon(1)}" fill="#b76a15" fill-opacity=".04" stroke="#9b5914" stroke-width="2.5" stroke-dasharray="7 5"/>
    <polygon points="${values.map((v,i)=>point(i,v).join(',')).join(' ')}" fill="#087bb5" fill-opacity=".18" stroke="#0874aa" stroke-width="2.5"/>
    ${values.map((v,i)=>{const [x,y]=point(i,v);return `<circle cx="${x}" cy="${y}" r="4" fill="#0874aa" stroke="#fff" stroke-width="1.5"/>`;}).join('')}
    <g fill="#294663" font-size="14" font-weight="650" text-anchor="middle" dominant-baseline="middle">${valid.map((_,i)=>{const [x,y]=point(i,1.23);return `<text x="${x}" y="${y}">${i+1}</text>`;}).join('')}</g>
    <g fill="#5d7184" font-size="10" text-anchor="end">${[25,50,75,100].map(v=>`<text x="${center-7}" y="${center-radius*v/100+3}">${v}%</text>`).join('')}</g>
  </svg>`;
}

export function requirementBars(rows){
  const valid=rows.filter(row=>row.total>0);
  return `<div class="journey-coverage-bars">${valid.map(row=>{
    const width=value=>Math.max(0,Math.min(100,100*value/row.total));
    return `<div class="journey-coverage-row"><div class="journey-coverage-label"><strong>${groupLabel(row.id)}</strong><span>${number(row.met)} / ${number(row.total)}</span></div><div class="journey-coverage-track" role="img" aria-label="${E(groupLabel(row.id)+': '+L('соответствую','met','已符合')+' '+row.met+', '+L('пока не выполнено','not yet met','尚未符合')+' '+row.gap+', '+L('не оценено','unassessed','未评估')+' '+row.unassessed)}"><span class="is-met" style="width:${width(row.met)}%"></span><span class="is-gap" style="width:${width(row.gap)}%"></span><span class="is-unassessed" style="width:${width(row.unassessed)}%"></span></div><p>${L('Соответствую','Met','已符合')}: ${row.met} · ${L('Пока не выполнено','Not yet met','尚未符合')}: ${row.gap} · ${L('Не оценено','Unassessed','未评估')}: ${row.unassessed}</p></div>`;
  }).join('')}</div>`;
}
