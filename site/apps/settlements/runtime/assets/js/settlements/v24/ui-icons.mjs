/** Allowlisted, code-native interface icons. Map artwork is unchanged. */
export function uiIcon(kind) {
  const shapes={
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    undo:'<path d="m9 4-5 5 5 5M4 9h9a6 6 0 0 1 0 12h-3"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    focus:'<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
    plus:'<path d="M12 4v16M4 12h16"/>',minus:'<path d="M4 12h16"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"/>',
    population:'<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="4"/><circle cx="18" cy="8" r="3"/><path d="M1 22v-4a8 8 0 0 1 16 0v4zm17 0v-4a10 10 0 0 0-2-6 7 7 0 0 1 7 7v3z"/></g>',
    tools:'<path d="m14 3 7 7-3 3-7-7zM12 11 3 20l1 1 9-9M4 4l4 1 1 4-3-1zM13 15l6 6 2-2-6-6"/>',
    check:'<path d="m4 12 5 5L20 6"/>',
    export:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    import:'<path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
    overview:'<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>',
    settings:'<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2" fill="white"/><circle cx="16" cy="12" r="2" fill="white"/><circle cx="8" cy="19" r="2" fill="white"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${shapes[kind]||shapes.info}</svg>`;
}
