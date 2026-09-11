const paths={
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
 talk:'<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/><path d="M8 10h8M8 14h5"/>',
 folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11H3Z"/><path d="M3 10h18"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
 plan:'<path d="M9 4H5v17h14V4h-4M9 2h6v5H9Z"/><path d="m8 13 2 2 6-6M8 18h8"/>',
 history:'<path d="M3 8a9 9 0 1 1-1 6M3 2v6h6"/><path d="M12 7v5l4 2"/>',
 book:'<path d="M3 4h5c2 0 4 1 4 3 0-2 2-3 4-3h5v16h-5c-2 0-4 1-4 2 0-1-2-2-4-2H3Z"/><path d="M12 7v15"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
 up:'<path d="m6 15 6-6 6 6"/>',down:'<path d="m6 9 6 6 6-6"/>',
 out:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
 user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',
 shield:'<path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6Z"/><path d="m8 12 3 3 5-6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8L21 9h-8Z"/>',
 doc:'<path d="M5 2h10l4 4v16H5Z"/><path d="M14 2v5h5M8 11h8M8 15h8M8 19h5"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
 pin:'<path d="M19 9c0 6-7 13-7 13S5 15 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',
 flag:'<path d="M5 22V3c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
 download:'<path d="M12 2v13m-5-5 5 5 5-5M3 16v5h18v-5"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 add:'<path d="M12 4v16M4 12h16"/>',
 lock:'<rect x="4" y="10" width="16" height="12" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',
 reset:'<path d="M3 3v6h6M3 9a9 9 0 1 1 0 7"/>',
 star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>'
};
Object.assign(paths,{"talk": "<title id=\"U01-title\">Диалог</title><path d=\"M4 4h16v12H9l-5 4V4\"/>", "folder": "<title id=\"U02-title\">Документы</title><path d=\"M8 3h9l3 3v14H8z M4 7v14 M15 3v5h5 M11 11h6 M11 15h6\"/>", "search": "<title id=\"U08-title\">Поиск</title><path d=\"M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0\"/>", "clock": "<title id=\"U04-title\">Календарь</title><path d=\"M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2\"/>", "plan": "<title id=\"U05-title\">План</title><path d=\"M5 5h2v2H5z M11 6h8 M5 11h2v2H5z M11 12h8 M5 17h2v2H5z M11 18h8\"/>", "history": "<title id=\"U06-title\">История</title><path d=\"M3 10a9 9 0 1 1 2 9 M3 4v6h6 M12 7v5l4 2\"/>", "book": "<title id=\"U03-title\">Источники</title><path d=\"M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3z M12 6v15\"/>", "out": "<title id=\"U14-title\">Открыть источник</title><path d=\"M14 3h7v7 M21 3l-11 11 M10 5H4v15h15v-6\"/>", "back": "<title id=\"U15-title\">Назад</title><path d=\"M14 5l-7 7 7 7 M7 12h14\"/>", "arrow": "<title id=\"U16-title\">Далее</title><path d=\"M10 5l7 7-7 7 M3 12h14\"/>", "download": "<title id=\"U24-title\">Экспорт</title><path d=\"M4 14v7h16v-7 M12 3v12 M8 7l4-4 4 4\"/>", "user": "<title id=\"U30-title\">Роль сотрудника</title><path d=\"M15 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 21v-5a7 5 0 0 1 14 0v5 M4 21h16 M10 15h4v4h-4z\"/>", "doc": "<title id=\"U33-title\">Черновик</title><path d=\"M5 3h10l4 4v4 M5 3v18h7 M14 18l5-5 3 3-5 5h-3z\"/>", "check": "<title id=\"U34-title\">Подтверждено без оценки правильности</title><path d=\"M6 11V8a6 6 0 0 1 12 0v3 M4 11h16v10H4z M12 15v2\"/>", "lock": "<title id=\"U18-title\">Сохранено локально</title><path d=\"M4 3h13l3 3v15H4z M8 3v6h8V3 M8 21v-8h8v8\"/>"});
export const icon=(name,cls='')=>`<svg class="rx-icon ${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.doc}</svg>`;
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
