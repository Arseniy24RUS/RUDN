/** Presentation only: these helpers never score answers or persist a profile. */
const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// Original, decorative line drawings. The accompanying text carries their meaning.
const drawings={
  check:'<path d="M8 4h8m-7-1h6v4H9zM7 5H5v16h14V5h-2M8 13l3 3 5-6"/>',
  people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
  heart:'<path d="M12 20 4.5 12.5a5 5 0 0 1 7-7l.5.5.5-.5a5 5 0 0 1 7 7Z"/>',
  spark:'<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z"/>',
  wave:'<path d="M3 12h3l2.5-7 5 14 2.5-7h5"/>',
  flag:'<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 11l2 2 4-5"/>',
  plan:'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4m8-4v4M4 9h16M8 13h2m4 0h2m-8 4h2m4 0h2"/>',
  light:'<path d="M9 18h6m-5 3h4m-5-6a6 6 0 1 1 6 0v3H9zM12 2V1M3 5 2 4m19 1 1-1"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
};
const iconNames={C:'check',E:'people',A:'heart',O:'spark',N:'wave',E3:'flag',C3:'check',C4:'target',C5:'clock',C6:'search',A4:'people',coordinator:'flag',organizer:'plan',analyst:'search',supporter:'heart',ideas:'light',implementer:'check'};

export function personalityIcon(name){
  return `<span class="personality-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">${drawings[iconNames[name]||name]||drawings.spark}</svg></span>`;
}

export const PERSONALITY_RADAR_ORDER=Object.freeze(['C','E','A','O','N']);
const center={x:160,y:145},radius=94;
const point=(index,distance)=>{
  const angle=-Math.PI/2+index*Math.PI*2/5;
  return {x:center.x+Math.cos(angle)*distance,y:center.y+Math.sin(angle)*distance};
};
const pair=({x,y})=>`${x.toFixed(3)},${y.toFixed(3)}`;

/** A fixed response scale: 1 is the centre, 5 the outer ring, for every domain.
 * Emotional sensitivity (N) has the same direction; it is never inverted.
 * Missing/invalid scores must not silently turn into a low or neutral score.
 */
export function personalityRadarGeometry(domains){
  return PERSONALITY_RADAR_ORDER.map((id,index)=>{
    const value=domains?.[id]?.mean;
    if(typeof value!=='number'||!Number.isFinite(value)||value<1||value>5)throw new RangeError(`Invalid personality radar value: ${id}`);
    return {id,value,...point(index,(value-1)/4*radius)};
  });
}

/** One noninteractive chart, with its values repeated in ordinary HTML.
 * The fixed five-letter key keeps labels legible at narrow container widths.
 */
export function renderPersonalityRadar(domains,{labels,title,description,scale,caption,formatValue}){
  const vertices=personalityRadarGeometry(domains);
  const values=vertices.map(({id,value})=>`${labels[id]}: ${formatValue(value)} / 5`).join('; ');
  const rings=[2,3,4,5].map(value=>`<polygon class="personality-radar-grid" points="${PERSONALITY_RADAR_ORDER.map((_,index)=>pair(point(index,(value-1)/4*radius))).join(' ')}"/>`).join('');
  const axes=vertices.map((_,index)=>{const edge=point(index,radius);return `<line class="personality-radar-axis" x1="${center.x}" y1="${center.y}" x2="${edge.x.toFixed(3)}" y2="${edge.y.toFixed(3)}"/>`;}).join('');
  const ticks=[1,2,3,4,5].map(value=>`<text class="personality-radar-tick" x="170" y="${(center.y-(value-1)/4*radius+5).toFixed(3)}">${value}</text>`).join('');
  const keyPositions=[{x:50,y:5},{x:92,y:34},{x:77,y:88},{x:23,y:88},{x:8,y:34}];
  return `<section class="personality-overview" aria-labelledby="personality-overview-title">
    <div class="personality-overview-heading"><h2 id="personality-overview-title">${E(title)}</h2><p>${E(description)}</p></div>
    <figure class="personality-overview-figure">
      <div class="personality-radar-plot">
        <svg class="personality-radar" viewBox="0 0 320 290" role="img" aria-labelledby="personality-radar-title personality-radar-desc" focusable="false">
          <title id="personality-radar-title">${E(title)}</title><desc id="personality-radar-desc">${E(scale+' '+values)}</desc>
          <g aria-hidden="true">${rings}${axes}<polygon class="personality-radar-shape" points="${vertices.map(pair).join(' ')}"/>${vertices.map(({id,value,x,y})=>`<circle class="personality-radar-point" data-personality-radar-domain="${id}" data-radar-value="${value}" cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="4"/>`).join('')}${ticks}</g>
        </svg>
        ${vertices.map(({id},index)=>`<span class="personality-radar-key" aria-hidden="true" style="left:${keyPositions[index].x}%;top:${keyPositions[index].y}%">${id}</span>`).join('')}
      </div>
      <figcaption class="personality-radar-summary"><dl class="personality-radar-values">${vertices.map(({id,value})=>`<div><dt><span class="personality-domain-key" aria-hidden="true">${id}</span><span>${E(labels[id])}</span></dt><dd>${E(formatValue(value))}<small> / 5</small></dd></div>`).join('')}</dl><p class="personality-radar-scale">${E(scale)}</p></figcaption>
    </figure>
    <p class="personality-overview-note">${E(caption)}</p>
  </section>`;
}
