(function (root) {
  'use strict';
  const G = root.GovernorGame ||= {};
  const sources = {
    all: 'region-water',
    suburb: 'suburb-water',
    north: 'north-breeze',
    river: 'river-water',
    industrial: 'industrial-steam',
    capital: 'capital-breeze'
  };
  const layers = Object.freeze(Object.fromEntries(
    Object.entries(sources).map(([district, file]) => [district, Object.freeze([
      Object.freeze({
        src: 'assets/v4/media/terrain/' + file + '.gif',
        offsetX: 0,
        offsetY: 0,
        width: 1,
        height: 1
      })
    ])])
  ));
  const empty = Object.freeze([]);
  // Plates use the exact map image coordinates. The map controller handles
  // offscreen, hidden-tab and reduced-motion suspension before loading a GIF.
  G.V4TerrainMedia = {
    layers: district => {
      const key = district === 'region' ? 'all' : district;
      return Object.hasOwn(layers, key) ? layers[key] : empty;
    }
  };
})(globalThis);
