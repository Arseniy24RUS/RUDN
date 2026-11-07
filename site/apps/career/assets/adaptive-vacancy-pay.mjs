import {getLanguage} from './i18n.mjs';
import {L} from './journey-visuals.mjs';

export function vacancyStatusText(status) {
  return {
    'source-active':L('Актуальна по данным портала','Current according to the portal','门户显示正在招募'),
    archived:L('Архивная','Archived','历史招聘'),
    expired:L('Срок подачи истёк','Application deadline passed','申请截止'),
    unknown:L('Статус приёма не указан','Recruitment status not stated','未注明招聘状态')
  }[status];
}

export function vacancySalaryText(row) {
  const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
  const from=valid(row.salaryFrom)?row.salaryFrom:null,to=valid(row.salaryTo)?row.salaryTo:null;
  const format=value=>new Intl.NumberFormat(getLanguage()).format(value);
  if(from!==null&&to!==null)return (from===to?format(from):`${format(from)} – ${format(to)}`)+' ₽';
  if(from!==null)return L(`от ${format(from)} ₽`,`from ${format(from)} ₽`,`起薪 ${format(from)} ₽`);
  if(to!==null)return L(`до ${format(to)} ₽`,`up to ${format(to)} ₽`,`最高 ${format(to)} ₽`);
  return L('Не указана в объявлении','Not stated in the announcement','公告未注明');
}
