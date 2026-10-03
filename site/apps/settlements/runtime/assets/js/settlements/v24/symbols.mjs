/** Code-native prototype symbols. Six distinct functions; not raster-art approval. */
export const SERVICE_COLORS = Object.freeze({telecom: '#7755b5', medical: '#087f78', school: '#287bb5', culture: '#b27a22', outreach: '#087f78', bus: '#335f86'});
export const SYMBOL_WORLD_SIZE = 28;
export function drawSymbol(ctx, kind, x, y, size, {color = SERVICE_COLORS[kind] || '#335f86', ghost = false, level = 1, compact = false} = {}) {
  if (kind === 'connect') kind = 'bus';
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 32, size / 32); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color; ctx.fillStyle = '#fff'; ctx.globalAlpha *= ghost ? .75 : 1;
  const line = (...p) => { ctx.beginPath(); for (let i = 0; i < p.length; i += 2) i ? ctx.lineTo(p[i], p[i + 1]) : ctx.moveTo(p[i], p[i + 1]); ctx.stroke(); };
  const rect = (a, b, w, h) => { ctx.beginPath(); ctx.roundRect(a, b, w, h, 2); ctx.fill(); ctx.stroke(); };
  if (kind === 'tower' || kind === 'telecom') {
    line(-8, 13, 0, -7, 8, 13); line(-5, 7, 5, 7); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -9, 2.6, 0, Math.PI * 2); ctx.fill();
    for (const r of [7, 12]) { ctx.beginPath(); ctx.arc(0, -9, r, -.65, .65); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -9, r, Math.PI - .65, Math.PI + .65); ctx.stroke(); }
  } else if (kind === 'school') {
    rect(-12, -4, 24, 18); ctx.beginPath(); ctx.moveTo(-15, -4); ctx.lineTo(0, -14); ctx.lineTo(15, -4); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -5, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = color; ctx.fillRect(-2, 5, 4, 9); ctx.fillRect(-9, 3, 4, 4); ctx.fillRect(5, 3, 4, 4);
  } else if (kind === 'culture') {
    ctx.beginPath(); ctx.moveTo(-15, -7); ctx.lineTo(0, -15); ctx.lineTo(15, -7); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = '#fff'; rect(-12, -5, 24, 17); ctx.fillStyle = color; for (const q of [-8, -1, 6]) ctx.fillRect(q, -3, 3, 14); line(-15, 14, 15, 14);
  } else if (kind === 'bus' || kind === 'outreach') {
    rect(-14, -9, 28, 19); ctx.fillStyle = color; ctx.fillRect(-10, -5, kind === 'outreach' ? 8 : 20, 7); ctx.beginPath(); ctx.arc(-8, 12, 3, 0, Math.PI * 2); ctx.arc(8, 12, 3, 0, Math.PI * 2); ctx.fill();
    if (kind === 'outreach') { ctx.fillRect(4, -5, 3, 11); ctx.fillRect(0, -1, 11, 3); }
  } else {
    rect(-12, -11, 24, 25); ctx.fillStyle = color; ctx.fillRect(-2.5, -7, 5, 13); ctx.fillRect(-6.5, -3, 13, 5); ctx.fillRect(-3, 9, 6, 5);
  }
  if (level > 1 && !compact) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(12, -12, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(level), 12, -11.5); }
  ctx.restore();
}

/** Static allowlisted SVG, shared with tool buttons; no caller string is interpolated. */
export function symbolSvg(kind) {
  if (kind === 'connect') kind = 'bus';
  if (kind === 'telecom') kind = 'tower';
  const shapes = {
    tower: '<path d="M8 29 16 9 24 29M11 23h10"/><circle cx="16" cy="7" r="2.6" fill="currentColor"/><path d="M21.6 2.8a7 7 0 0 1 0 8.4M25.6 0a12 12 0 0 1 0 14M10.4 2.8a7 7 0 0 0 0 8.4M6.4 0a12 12 0 0 0 0 14"/>',
    medical: '<rect x="4" y="5" width="24" height="25" rx="2" fill="white"/><path d="M13.5 9h5v4h4v5h-4v4h-5v-4h-4v-5h4zM13 25h6v5h-6z" fill="currentColor" stroke="none"/>',
    school: '<rect x="4" y="12" width="24" height="18" rx="2" fill="white"/><path d="m1 12 15-10 15 10z" fill="currentColor"/><circle cx="16" cy="11" r="3.5" fill="white" stroke="none"/><path d="M14 21h4v9h-4zM7 19h4v4H7zM21 19h4v4h-4z" fill="currentColor" stroke="none"/>',
    culture: '<path d="m1 9 15-8 15 8z" fill="currentColor"/><rect x="4" y="11" width="24" height="17" rx="2" fill="white"/><path d="M8 13v14m7-14v14m7-14v14M1 30h30" stroke-width="3"/>',
    bus: '<rect x="2" y="7" width="28" height="19" rx="2" fill="white"/><path d="M6 11h20v7H6z" fill="currentColor" stroke="none"/><circle cx="8" cy="28" r="3" fill="currentColor"/><circle cx="24" cy="28" r="3" fill="currentColor"/>',
    outreach: '<rect x="2" y="7" width="28" height="19" rx="2" fill="white"/><path d="M6 11h8v7H6zM20 11h3v4h4v3h-4v4h-3v-4h-4v-3h4z" fill="currentColor" stroke="none"/><circle cx="8" cy="28" r="3" fill="currentColor"/><circle cx="24" cy="28" r="3" fill="currentColor"/>'
  };
  return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes[kind] || shapes.medical}</svg>`;
}
