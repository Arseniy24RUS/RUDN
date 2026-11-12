import {resourceURL} from '../../../assets/js/release-resources.js';

// Stable, conflict-free cast from the platform's existing GFX passports and
// visualCast([...pilot case IDs], 'reception-ai-pilot-v1'). These are the user's
// original characters and WebM loops; no new illustration or animation is used.
export const RECEPTION_ACTORS = Object.freeze({
  'authority-contact': 'C23',
  budget: 'C05',
  'complaint-routing': 'C03',
  'gas-smell': 'C15',
  'mfc-extra-paper': 'C11',
  'mfc-refusal': 'C08',
  'privacy-consent-scope': 'C14',
  'proposal-bench': 'C24',
});
const ACTOR = /^(?:C(?:0[1-9]|1[0-9]|2[0-4])|S0[34])$/;
const LEGACY_ACTORS = Object.freeze({'assets/ilya.webp':'C05','assets/maria.webp':'C01','assets/sergey.webp':'C03'});
const url = relative => resourceURL('../' + relative, import.meta.url).href;

/** Public visual metadata only. Arbitrary URLs and directory traversal never enter media src. */
export function characterMedia(caseId, portrait) {
  const supplied = typeof portrait === 'string' && portrait.match(/^assets\/gfx1\/(?:avatars\/((?:C\d{2}|S\d{2}))\.webp|characters\/((?:C\d{2}|S\d{2}))\/\2__(?:C|S)-N__w(?:320|512)\.webp)$/);
  const fromPortrait = supplied && (supplied[1] || supplied[2]);
  const actorId = ACTOR.test(fromPortrait || '') ? fromPortrait
    : Object.hasOwn(RECEPTION_ACTORS, caseId) ? RECEPTION_ACTORS[caseId]
      : Object.hasOwn(LEGACY_ACTORS, portrait) ? LEGACY_ACTORS[portrait] : 'C03';
  const state = actorId.startsWith('S') ? 'S-N' : 'C-N';
  return Object.freeze({actorId,
    poster: url(`assets/gfx1/characters/${actorId}/${actorId}__${state}__w512.webp`),
    avatar: url(`assets/gfx1/avatars/${actorId}.webp`),
    motion: url(`assets/gfx1/motion/${actorId}.webm`),
    motionFallback: url(`assets/gfx1/motion/${actorId}.webp`),
  });
}

/** Retained media nodes survive rerenders without restarting their sources.
 * Animated WebP, converted from the same authored loop, covers browsers without
 * transparent VP9 or video autoplay. An image animation has no pause API: leaving
 * the visible reception clears its src, restores the poster and releases the loop;
 * returning begins the loop again. Reduced motion never fetches either format.
 */
export function createMessengerMedia(root, {signal} = {}) {
  const document = root.ownerDocument, view = document?.defaultView;
  const empty = {refresh() {}, destroy() {}};
  if (!view || signal?.aborted) return empty;
  const video = document.createElement('video');
  const supportsVideo = Boolean(video.canPlayType?.('video/webm; codecs="vp9"'));
  video.className = 'rxa-citizen-video';
  video.setAttribute('data-rxa-motion', '');
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('tabindex', '-1');
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.setAttribute('loop', '');
  video.setAttribute('autoplay', '');
  video.muted = video.defaultMuted = video.loop = video.playsInline = video.autoplay = true;
  video.preload = 'none';
  const motionImage = document.createElement('img');
  // Reuse the actor layer's size/opacity rules. This is the existing animation,
  // not a second portrait or a background decorative image.
  motionImage.className = 'rxa-citizen-video rxa-citizen-motion-image';
  motionImage.setAttribute('data-rxa-motion-image', '');
  motionImage.setAttribute('aria-hidden', 'true');
  motionImage.alt = '';
  motionImage.decoding = 'async';
  const reduce = view.matchMedia?.('(prefers-reduced-motion: reduce)') || {matches:false};
  const failedVideo = new Set(), failedImage = new Set();
  let stage = null, actor = '', visible = false, ready = false, supportsAlpha, frame, destroyed = false, imageReady = false;

  function portrait() { ready = false; stage?.removeAttribute('data-rxa-motion-ready'); }
  function pause() { video.pause(); }
  function clearSource() {
    pause();
    if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
    frame = undefined; portrait();
    if (video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
  }
  function clearImage() {
    imageReady = false;
    if (motionImage.hasAttribute('src')) motionImage.removeAttribute('src');
    motionImage.remove();
  }
  const shouldPlay = () => !destroyed && stage && visible && !document.hidden && !reduce.matches;
  const useImage = () => !supportsVideo || supportsAlpha === false || failedVideo.has(actor);
  function imagePlayback() {
    if (!shouldPlay() || failedImage.has(actor)) { clearImage(); portrait(); return; }
    pause(); video.remove();
    if (motionImage.parentNode !== stage) stage.append(motionImage);
    if (!motionImage.hasAttribute('src')) {
      imageReady = false; portrait();
      motionImage.src = url(`assets/gfx1/motion/${actor}.webp`);
    } else if (imageReady) stage.setAttribute('data-rxa-motion-ready', '');
  }
  function imageLoaded() {
    if (!shouldPlay() || !useImage() || !motionImage.hasAttribute('src')) return;
    if (motionImage.naturalWidth > 0) { imageReady = true; stage.setAttribute('data-rxa-motion-ready', ''); }
  }
  function imageError() {
    if (actor) failedImage.add(actor);
    clearImage(); portrait();
  }
  function presentFrame() {
    frame = undefined;
    if (!stage || video.paused || !video.videoWidth || destroyed) return;
    if (supportsAlpha === undefined) {
      // VP9 decoding support alone does not guarantee transparent WebM support.
      const sample = document.createElement('canvas'); sample.width = sample.height = 1;
      try {
        const context = sample.getContext('2d', {willReadFrequently:true});
        context?.drawImage(video, 0, 0, 1, 1, 0, 0, 1, 1);
        supportsAlpha = (context?.getImageData(0, 0, 1, 1).data[3] ?? 255) < 32;
      } catch { supportsAlpha = false; }
    }
    if (!supportsAlpha) { clearSource(); video.remove(); imagePlayback(); return; }
    ready = true; stage.setAttribute('data-rxa-motion-ready', '');
  }
  function playing() {
    if (ready || frame !== undefined) return;
    if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(presentFrame);
    else presentFrame();
  }
  function error() { if (actor) failedVideo.add(actor); clearSource(); video.remove(); imagePlayback(); }
  function playback() {
    if (!shouldPlay()) {
      pause();
      if (motionImage.hasAttribute('src')) { clearImage(); portrait(); }
      return;
    }
    if (useImage()) { imagePlayback(); return; }
    if (video.parentNode !== stage) stage.append(video);
    if (!video.hasAttribute('src')) video.src = url(`assets/gfx1/motion/${actor}.webm`);
    if (video.paused) {
      const requestedActor = actor;
      const attempt = video.play();
      attempt?.catch(problem => {
        if (!destroyed && problem?.name !== 'AbortError' && actor === requestedActor) {
          failedVideo.add(actor); clearSource(); video.remove(); imagePlayback();
        }
      });
    }
  }
  const observer = typeof view.IntersectionObserver === 'function' ? new view.IntersectionObserver(entries => {
    for (const item of entries) if (item.target === stage) { visible = item.isIntersecting; playback(); }
  }) : null;

  function refresh() {
    if (destroyed) return;
    const candidate = reduce.matches ? null : root.querySelector('[data-rxa-actor]');
    const next = ACTOR.test(candidate?.dataset.rxaActor || '') ? candidate : null;
    if (next === stage) { playback(); return; }
    if (stage) { observer?.unobserve(stage); stage.removeAttribute('data-rxa-motion-ready'); }
    stage = next;
    if (!stage) {
      if (reduce.matches) clearSource(); else pause();
      clearImage(); video.remove(); return;
    }
    if (stage.dataset.rxaActor !== actor) {
      clearSource(); clearImage(); actor = stage.dataset.rxaActor;
      const state = actor.startsWith('S') ? 'S-N' : 'C-N';
      video.poster = url(`assets/gfx1/characters/${actor}/${actor}__${state}__w512.webp`);
    }
    if ((ready && !useImage()) || (imageReady && useImage())) stage.setAttribute('data-rxa-motion-ready', '');
    const bounds = stage.getBoundingClientRect();
    visible = !observer || bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < view.innerHeight;
    observer?.observe(stage); playback();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; observer?.disconnect();
    document.removeEventListener('visibilitychange', playback);
    reduce.removeEventListener?.('change', refresh);
    signal?.removeEventListener('abort', destroy);
    video.removeEventListener('playing', playing); video.removeEventListener('error', error);
    motionImage.removeEventListener('load', imageLoaded); motionImage.removeEventListener('error', imageError);
    clearSource(); clearImage(); video.remove(); stage = null;
  }
  document.addEventListener('visibilitychange', playback);
  reduce.addEventListener?.('change', refresh);
  signal?.addEventListener('abort', destroy, {once:true});
  video.addEventListener('playing', playing); video.addEventListener('error', error);
  motionImage.addEventListener('load', imageLoaded); motionImage.addEventListener('error', imageError);
  return {refresh, destroy};
}
