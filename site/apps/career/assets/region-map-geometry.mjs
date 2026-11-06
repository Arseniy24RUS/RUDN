/** View-only map maths. Coordinates and selected subject IDs stay unchanged. */
export const REGION_MAP_MAX_ZOOM=40;
export const clampMapZoom=value=>Math.max(1,Math.min(REGION_MAP_MAX_ZOOM,value));

/** Keep the geographic point beneath a wheel/pinch anchor beneath that anchor. */
export function zoomMapAt(view,value,point){
  const zoom=clampMapZoom(value),ratio=zoom/view.zoom;
  return {zoom,x:point.x-(point.x-view.x)*ratio,y:point.y-(point.y-view.y)*ratio};
}

/** Constrain the map canvas to the visible SVG rectangle, centring smaller axes. */
export function containMapView(view,{width,height,left=0,top=0,right=width,bottom=height}){
  const zoom=clampMapZoom(view.zoom);
  const axis=(offset,size,min,max)=>size<=max-min?(min+max-size)/2:Math.min(min,Math.max(max-size,offset));
  return {zoom,x:axis(view.x,width*zoom,left,right),y:axis(view.y,height*zoom,top,bottom)};
}
