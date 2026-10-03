const paths={
 more:'M5 12h.01M12 12h.01M19 12h.01',
 menu:'M4 6h16M4 12h16M4 18h16',close:'m6 6 12 12M18 6 6 18',plus:'M12 5v14M5 12h14',minus:'M5 12h14',
 back:'m9 5-7 7 7 7M2 12h13a6 6 0 0 1 6 6',home:'m3 11 9-8 9 8M5 10v11h14V10M9 21v-8h6v8',
 focus:'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
 map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16M15 5v16',
 info:'M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 check:'m5 12 4 4L19 6',arrow:'M4 12h16m-6-6 6 6-6 6',
 people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 sound:'m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
 search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 star:'m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6',
 expand:'M5 19 19 5M5 5h14v14',save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8',
 pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 trophy:'M8 3h8v5a4 4 0 0 1-8 0V3Zm4 9v6M8 21h8M12 18l-4 3M12 18l4 3M8 5H3v2a4 4 0 0 0 5 4M16 5h5v2a4 4 0 0 1-5 4',
};
export const icon=(name,cls='')=>`<svg class="sg-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.info}"/></svg>`;
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const num=value=>Math.round(value).toLocaleString('ru-RU');
export const money=value=>`${Number(value).toLocaleString('ru-RU',{maximumFractionDigits:1})} млн ₽`;
