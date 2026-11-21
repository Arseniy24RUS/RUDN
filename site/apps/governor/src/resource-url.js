import {resourceURL} from '../../../assets/js/release-resources.js';

// Content paths are relative to the game, not to this src/ module. The shared
// release map selects either frozen canonical bytes or a versioned object.
const appBase = new URL('../', import.meta.url);
const G = globalThis.GovernorGame || (globalThis.GovernorGame = {});

export function resolveAsset(input, base = appBase) {
  const platformResolver = G.Platform?.resolveAsset;
  if (typeof platformResolver === 'function' && platformResolver !== resolveAsset) {
    return String(platformResolver(input));
  }
  return resourceURL(input, base).href;
}

G.resolveAsset = resolveAsset;
