(function (root) {
  'use strict';

  const paths = {
    town: '<path d="m3 9 9-6 9 6M4 10h16M5 20h14M3 22h18M6 10v9m6-9v9m6-9v9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    flag: '<path d="M6 21V5m0 0c4-3 8 3 12 0v9c-4 3-8-3-12 0"/>',
    map: '<path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15m8-12v15"/>',
    quest: '<path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9Z"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.83 2.83-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21h-4v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06-2.83-2.83.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3v-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06L7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4a1.65 1.65 0 0 0 1-1.51V2h4v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06 2.83 2.83-.06.06A1.65 1.65 0 0 0 19.4 9c.12.6.65 1.02 1.26 1.02H21v4h-.34A1.3 1.3 0 0 0 19.4 15Z"/>',
    coins: '<circle cx="8" cy="8" r="5"/><path d="M11 3.3A7 7 0 1 1 5 14.7M8 5v6m-2-4h4m-4 2h4"/>',
    budget: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12m-3-9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.5-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5"/>',
    support: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
    development: '<path d="M3 20h18"/><path d="m5 17 4-5 4 3 6-9"/><path d="M15 6h4v4"/>',
    hourglass: '<path d="M6 2h12M6 22h12M8 2v4c0 2 4 4 4 6s-4 4-4 6v4m8-20v4c0 2-4 4-4 6s4 4 4 6v4"/>',
    health: '<path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5Z"/>',
    clinic: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-5h6v5M9 9h6m-3-3v6"/>',
    ambulance: '<path d="M3 17V7h11v10H3Zm11-6h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8.5 10h-3m1.5-1.5v3"/>',
    training: '<path d="m2 9 10-5 10 5-10 5Z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
    factory: '<path d="M3 21V10l6 3V9l6 3V5h6v16Z"/><path d="M7 17h2m3 0h2m3 0h2"/>',
    jobs: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2m-13 5h18M9 12v2h6v-2"/>',
    graduation: '<path d="m2 9 10-5 10 5-10 5Z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2m-13 5h18"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.5-1.5 4-1.5 4s2.5 0 4-1.5l2-2-2.5-2.5Z"/><path d="M13 14 8 9c2.5-5 7-6 12-6 0 5-1 9.5-6 12Z"/><circle cx="15" cy="8" r="1.5"/><path d="M9 17c2 0 4 2 4 4-2 0-4-2-4-4Z"/>',
    school: '<path d="M3 21V9l9-6 9 6v12H3Z"/><path d="M9 21v-6h6v6M7 11h.01M17 11h.01M12 7v3M10.5 8.5h3"/>',
    house: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/>',
    flood: '<path d="M3 15c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M3 20c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M12 3s4 4.5 4 7a4 4 0 0 1-8 0c0-2.5 4-7 4-7Z"/>',
    community: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="m18 8 1.2 2.4 2.8.4-2 2 .5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-2 2.8-.4Z"/>',
    'shield-water': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 7s3 3.2 3 5a3 3 0 1 1-6 0c0-1.8 3-5 3-5Z"/>',
    bridge: '<path d="M3 19h18M5 19v-7m14 7v-7M5 13c4-5 10-5 14 0M9 19v-8m6 8v-8"/>',
    digital: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8m-4-4v4M7 9h3v4H7Zm7-2h3v6h-3Z"/>',
    portal: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 6h6m-7 4h8m-8 4h5m-1 4h.01"/>',
    cyber: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M9 12h6m-3-3v6"/>',
    dialogue: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-7a4 4 0 0 1-1-3V7a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4Z"/><path d="M7 9h10M7 13h6"/>',
    'medical-box': '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3h8v3m-4 4v7m-3.5-3.5h7"/>',
    telemedicine: '<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 22h8m-4-4v4M9 8h6m-3-3v6"/>',
    handshake: '<path d="m8 11 3-3a2 2 0 0 1 3 0l2 2a2 2 0 0 0 3 0l1-1"/><path d="m3 12 4-4 4 4 5 5a2 2 0 0 1-3 3l-6-6-2 2-3-3Z"/><path d="m16 17 2-2m-5 5 2-2"/>',
    bus: '<rect x="3" y="4" width="18" height="14" rx="3"/><path d="M7 18v2m10-2v2M6 8h12M6 13h.01M18 13h.01"/>',
    'service-desk': '<path d="M3 20h18M5 20v-8h14v8M8 12V7h8v5M9 7V4h6v3"/><path d="M8 16h8"/>',
    megaphone: '<path d="m3 11 14-6v14L3 13Z"/><path d="M11.6 16.7 13 21H8l-1.6-6"/><path d="M21 9v6"/>',
    balance: '<path d="M12 3v18M5 6h14M4 6l-3 6h6Zm13 0-3 6h6ZM7 21h10"/>',
    sound: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a9 9 0 0 1 0 12"/>',
    mute: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="m22 9-6 6m0-6 6 6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 21h14"/>',
    refresh: '<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 9A7 7 0 0 1 18 6l2 5M4 13l2 5a7 7 0 0 0 11.9-3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    trophy: '<path d="M8 3h8v5a4 4 0 0 1-8 0Z"/><path d="M8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v5m-4 4h8m-6-4h4"/>',
    warning: '<path d="M10.3 3.7 1.8 18.5A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.5L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
    sparkles: '<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2ZM5 15l.7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7Zm13-2 .9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9Z"/>',
    vault: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4V2h10v2M7 9h10M8 14h8M12 9v5m-2-2h4"/>',
    federal: '<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6M8 10h8"/><path d="M12 2v3"/>',
    bank: '<path d="m3 9 9-6 9 6M4 10h16M5 19h14M3 22h18M7 10v9m5-9v9m5-9v9"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    capacity: '<path d="M4 21V10m5 11V6m5 15V3m5 18v-8"/><path d="M2 21h20"/>',
    construction: '<path d="M4 21V8h11v13M15 11h4l2 3v7h-6M8 8V4h4v4M8 13h3M8 17h3"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>',
    income: '<path d="M4 20h16M6 17V9m6 8V5m6 12v-4"/><path d="m4 8 5-4 4 3 7-5M16 2h4v4"/>',
    portfolio: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6V4h8v2M3 11h18M9 11v2h6v-2"/>',
    journal: '<path d="M4 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4Z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h6Z"/><path d="M7 8h3M7 12h3m4-4h3m-3 4h3"/>',
    location: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
    conflict: '<path d="m4 4 16 16M20 4 4 20"/><circle cx="12" cy="12" r="9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    route: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h4a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
  };

  function icon(name, options) {
    const opts = options || {};
    const size = opts.size || 24;
    const className = opts.className ? ` ${opts.className}` : '';
    const title = opts.title ? `<title>${String(opts.title).replace(/[&<>]/g, '')}</title>` : '';
    const body = paths[name] || paths.info;
    return `<svg class="gg-icon${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${title}${body}</svg>`;
  }

  root.GovernorGame = root.GovernorGame || {};
  root.GovernorGame.icon = icon;
  if (typeof module !== 'undefined' && module.exports) module.exports = icon;
})(typeof window !== 'undefined' ? window : globalThis);
