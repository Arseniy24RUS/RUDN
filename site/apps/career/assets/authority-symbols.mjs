import catalog from '../data/authority-symbols.json';
import {getLanguage} from './i18n.mjs';
const escape = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

/** Real institutional symbols, bundled with their source attribution. */
export function authorityEmblem(authority, className = '') {
  const symbol = catalog.symbols[authority.id];
  if (!symbol) return '';
  const src = __careerHost.assetURL ? __careerHost.assetURL(symbol.src) : new URL(symbol.src, location.href).href;
  return `<span class="authority-symbol ${escape(className)}"><img src="${escape(src)}" width="64" height="64" alt="" loading="lazy" decoding="async"></span>`;
}

export function authoritySymbolSource(authority) {
  return catalog.symbols[authority.id] || null;
}

export function authoritySymbolCredit(authority) {
  const symbol=authoritySymbolSource(authority);
  if(!symbol)return '';
  const label=getLanguage()==='en'?'Symbol source':getLanguage()==='zh-Hans'?'标识来源':'Источник символа';
  return `<p class="authority-symbol-credit" data-no-i18n><a href="${escape(symbol.source)}" target="_blank" rel="noopener noreferrer">${label}</a> · ${escape(symbol.credit)} · ${escape(symbol.license)}</p>`;
}
