import {getLanguage,translate} from './i18n.mjs';

/** Official full name first; abbreviations remain available for recognition. */
export function authorityName(authority) {
  if (!authority) return '';
  const language=getLanguage();
  const localized=value=>typeof value==='object'&&value?value[language]||value.ru||'':translate(value||'');
  const full=localized(authority.localizedName||authority.name)||localized(authority.shortName);
  const short=localized(authority.shortName);
  return short&&short!==full&&!full.endsWith(`(${short})`)?`${full} (${short})`:full;
}
