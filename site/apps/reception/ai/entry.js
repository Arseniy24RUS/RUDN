import {RECEPTION_AI_CONFIG} from './config.js';
export async function mountReception(root, options = {}, config = RECEPTION_AI_CONFIG) {
  if (!config.enabled) {
    const {mountReception: mountLegacy} = await import('../js/app.js?v=1.0.1');
    return mountLegacy(root, options);
  }
  const {mountReceptionAI} = await import('./app.js');
  return mountReceptionAI(root, options, config);
}
