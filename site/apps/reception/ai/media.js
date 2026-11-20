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
const FRAME_TIMEOUT_MS = 3000;
const LOADING_TIMEOUT_MS = 6500;
const IMAGE_RETRY_DELAY_MS = 750;
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

// 120 authored 12 fps frames decoded from C03.webp, sampled at 224 × 305.
const C03_FRAMES = Object.freeze({width:224, height:305, columns:12, count:120, interval:1000/12});
const MOTION_COPY = Object.freeze({
  ru:['Анимация', 'Анимация персонажа'],
  en:['Motion', 'Character motion'],
  zh:['动画', '角色动画']
});

function createSergeyMotion(root, view, reducedMotion) {
  const document = root.ownerDocument;
  const canvas = document.createElement('canvas');
  let context;
  const {width,height,columns,count,interval} = C03_FRAMES;
  canvas.width = width;
  canvas.height = height;
  canvas.className = 'rxa-citizen-video';
  canvas.setAttribute('data-rxa-motion-canvas', '');
  canvas.setAttribute('aria-hidden', 'true');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'rxa-motion-toggle';
  toggle.dataset.focus = 'citizen-motion';
  const connection = view.navigator.connection;
  const reducedData = view.matchMedia?.('(prefers-reduced-data: reduce)');
  let stage = null, visible = false, enabled = null, atlas = null, loading = null, failed = false;
  let timer = null, frame = -1, nextFrameAt = 0;

  function canPlay() { return enabled ?? !(reducedMotion.matches || reducedData?.matches || connection?.saveData); }
  function shouldDraw() { return stage && visible && canPlay(); }

  function stop() {
    if (timer !== null) view.clearTimeout(timer);
    timer = null;
    stage?.removeAttribute('data-rxa-motion-ready');
  }

  function tick() {
    timer = null;
    if (!shouldDraw() || !atlas) return;
    const at = view.performance.now();
    if (at >= nextFrameAt) {
      const advance = 1 + Math.floor((at-nextFrameAt)/interval);
      frame = (frame+advance)%count;
      const x = frame%columns*width, y = Math.floor(frame/columns)*height;
      context.clearRect(0,0,width,height);
      context.drawImage(atlas,x,y,width,height,0,0,width,height);
      stage.setAttribute('data-rxa-motion-ready', '');
      nextFrameAt += advance*interval;
    }
    timer = view.setTimeout(tick,Math.max(0,nextFrameAt-view.performance.now()));
  }

  function loadFrames() {
    if (loading || failed) return;
    const source = new view.Image();
    loading = source;
    source.decoding = 'async';
    source.onload = async () => {
      try {
        await source.decode?.();
        if (loading !== source) return;
        if (source.naturalWidth !== columns*width || source.naturalHeight !== count/columns*height) {
          throw new Error('Unexpected C03 frame atlas dimensions');
        }
        atlas = source;
        loading = null;
        sync();
      } catch { loadFailed(); }
    };
    function loadFailed() {
      if (loading !== source) return;
      loading = null;
      failed = true;
    }
    source.onerror = loadFailed;
    source.src = url('assets/gfx1/motion/C03-frames.webp');
  }

  function sync() {
    if (!stage) return;
    const lang = (root.lang || document.documentElement.lang).slice(0,2);
    const [label, accessibleName] = MOTION_COPY[lang] || MOTION_COPY.ru;
    toggle.textContent = label;
    toggle.setAttribute('aria-label', accessibleName);
    toggle.setAttribute('aria-pressed', String(canPlay()));
    stage.toggleAttribute('data-rxa-motion-manual', enabled===true);
    if (!shouldDraw()) { stop(); return; }
    context ??= canvas.getContext('2d');
    if (!context) { toggle.disabled = true; return; }
    if (!atlas) { loadFrames(); return; }
    if (timer === null) {
      nextFrameAt = view.performance.now();
      tick();
    }
  }

  function refresh(next, inView = false) {
    if (next !== stage) {
      stop();
      stage?.removeAttribute('data-rxa-motion-manual');
      if (next && !stage) failed = false;
      stage = next;
      if (stage) stage.append(canvas,toggle);
      else { canvas.remove(); toggle.remove(); }
    }
    visible = inView;
    sync();
  }

  function retry() { failed = false; sync(); }
  function chooseMotion() {
    enabled = !canPlay();
    retry();
  }
  toggle.addEventListener('click', chooseMotion);
  connection?.addEventListener?.('change', sync);
  reducedData?.addEventListener?.('change', sync);
  return {
    refresh, retry,
    destroy() {
      refresh(null);
      if (loading) {
        loading.onload = loading.onerror = null;
        loading.removeAttribute('src');
        loading = null;
      }
      atlas = null;
      toggle.removeEventListener('click', chooseMotion);
      connection?.removeEventListener?.('change', sync);
      reducedData?.removeEventListener?.('change', sync);
    }
  };
}

/** Retained media nodes survive rerenders without restarting their sources.
 * Animated WebP, converted from the same authored loop, covers browsers without
 * transparent VP9 or video autoplay. An image animation has no pause API: leaving
 * the visible reception clears its src, restores the poster and releases the loop;
 * returning begins the loop again. C03 uses the same frames drawn from a static
 * atlas so mobile autoplay and animated-image policies cannot freeze the loop.
 */
export function createMessengerMedia(root, {signal, lessonFrames = false} = {}) {
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
  const sergeyMotion = lessonFrames && view.CanvasRenderingContext2D
    ? createSergeyMotion(root, view, reduce)
    : null;
  const failedVideo = new Set(), imageFailures = new Map();
  let stage = null, actor = '', visible = false, ready = false, supportsAlpha, frame, destroyed = false, imageReady = false;
  let watchdog, imageRetry, lastVideoTime = 0, lastProgressAt = 0, sourceVersion = 0;
  const schedule = view.setTimeout?.bind(view) || globalThis.setTimeout;
  const unschedule = view.clearTimeout?.bind(view) || globalThis.clearTimeout;
  const now = () => view.performance?.now?.() ?? Date.now();
  function cancelFrame() {
    if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
    frame = undefined;
  }
  function stopWatchdog() {
    if (watchdog !== undefined) unschedule(watchdog);
    watchdog = undefined;
  }
  // Some mobile browsers accept play() but never present a frame, or leave its
  // promise pending. A poster must not be the final result of either failure.
  // Measure progress only while visible; the original animated WebP is the
  // recovery path, without changing the animation or its quality.
  function checkProgress() {
    watchdog = undefined;
    if (!shouldPlay() || useImage() || !video.hasAttribute('src')) return;
    const at = now();
    if (ready && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime; lastProgressAt = at;
    }
    // Give the smaller video time to arrive before launching the larger image.
    // Once data is available, a decoder that cannot draw still falls back quickly.
    const loading = !ready && video.networkState === video.NETWORK_LOADING && video.readyState < video.HAVE_CURRENT_DATA;
    if (at - lastProgressAt >= (loading ? LOADING_TIMEOUT_MS : FRAME_TIMEOUT_MS)) { error(); return; }
    watchdog = schedule(checkProgress, 750);
  }
  function watchPlayback() {
    if (watchdog !== undefined) return;
    lastVideoTime = video.currentTime; lastProgressAt = now();
    watchdog = schedule(checkProgress, 750);
  }

  function portrait() { ready = false; stage?.removeAttribute('data-rxa-motion-ready'); }
  function pause() { stopWatchdog(); cancelFrame(); video.pause(); }
  function clearSource() {
    pause();
    sourceVersion++; portrait();
    if (video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
  }
  function clearImage() {
    if (imageRetry !== undefined) unschedule(imageRetry);
    imageRetry = undefined;
    imageReady = false;
    if (motionImage.hasAttribute('src')) motionImage.removeAttribute('src');
    motionImage.remove();
  }
  const shouldPlay = () => !destroyed && stage && visible && !document.hidden && !reduce.matches;
  const useImage = () => !supportsVideo || supportsAlpha === false || failedVideo.has(actor);
  function imagePlayback(retrying = false) {
    if (!shouldPlay()) { clearImage(); portrait(); return; }
    pause(); video.remove();
    if (motionImage.hasAttribute('src')) {
      if (motionImage.parentNode !== stage) stage.append(motionImage);
      if (imageReady) stage.setAttribute('data-rxa-motion-ready', '');
      return;
    }
    const failures = imageFailures.get(actor) || 0;
    if (failures > 1) return;
    if (failures === 1 && !retrying) {
      if (imageRetry === undefined) imageRetry = schedule(() => {
        imageRetry = undefined;
        imagePlayback(true);
      }, IMAGE_RETRY_DELAY_MS);
      return;
    }
    if (motionImage.parentNode !== stage) stage.append(motionImage);
    imageReady = false; portrait();
    motionImage.src = url(`assets/gfx1/motion/${actor}.webp`);
  }
  function imageLoaded() {
    if (!shouldPlay() || !useImage() || !motionImage.hasAttribute('src')) return;
    if (motionImage.naturalWidth > 0) {
      imageFailures.delete(actor);
      imageReady = true; stage.setAttribute('data-rxa-motion-ready', '');
    }
  }
  function imageError() {
    if (!motionImage.hasAttribute('src')) return;
    imageFailures.set(actor, (imageFailures.get(actor) || 0) + 1);
    clearImage(); portrait();
    imagePlayback();
  }
  function networkRestored() {
    sergeyMotion?.retry();
    if (!imageFailures.delete(actor)) return;
    clearImage(); playback();
  }
  function presentFrame() {
    frame = undefined;
    if (!shouldPlay() || video.paused || !video.videoWidth) return;
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
    if (actor === 'C03' && sergeyMotion) {
      sergeyMotion.refresh(stage, visible && !document.hidden);
      return;
    }
    sergeyMotion?.refresh(null);
    if (!shouldPlay()) {
      pause();
      if (motionImage.hasAttribute('src') || imageRetry !== undefined) { clearImage(); portrait(); }
      return;
    }
    if (useImage()) { imagePlayback(); return; }
    if (video.parentNode !== stage) stage.append(video);
    if (!video.hasAttribute('src')) video.src = url(`assets/gfx1/motion/${actor}.webm`);
    if (video.paused) {
      const requestedActor = actor, requestedVersion = sourceVersion;
      const attempt = video.play();
      attempt?.catch(problem => {
        if (!destroyed && problem?.name !== 'AbortError' && actor === requestedActor && sourceVersion === requestedVersion) {
          failedVideo.add(actor); clearSource(); video.remove(); imagePlayback();
        }
      });
    }
    // Reacquire a frame callback after a rerender moves the retained video.
    if (!ready && !video.paused && video.videoWidth) playing();
    watchPlayback();
  }
  const observer = typeof view.IntersectionObserver === 'function' ? new view.IntersectionObserver(entries => {
    for (const item of entries) if (item.target === stage) { visible = item.isIntersecting; playback(); }
  }) : null;

  function refresh() {
    if (destroyed) return;
    const candidate = root.querySelector('[data-rxa-actor]');
    const nextActor = candidate?.dataset.rxaActor || '';
    const next = ACTOR.test(nextActor) && (!reduce.matches || nextActor === 'C03' && sergeyMotion) ? candidate : null;
    if (next === stage) { playback(); return; }
    const returning = !stage;
    if (stage) { cancelFrame(); observer?.unobserve(stage); stage.removeAttribute('data-rxa-motion-ready'); }
    stage = next;
    if (!stage) {
      if (reduce.matches) clearSource(); else pause();
      clearImage(); video.remove(); sergeyMotion?.refresh(null); return;
    }
    if (stage.dataset.rxaActor !== actor) {
      clearSource(); clearImage(); actor = stage.dataset.rxaActor;
      const state = actor.startsWith('S') ? 'S-N' : 'C-N';
      video.poster = url(`assets/gfx1/characters/${actor}/${actor}__${state}__w512.webp`);
    }
    // Reopening the scene is an explicit way to retry after a lasting outage.
    if (returning) imageFailures.delete(actor);
    if ((ready && !useImage()) || (imageReady && useImage())) stage.setAttribute('data-rxa-motion-ready', '');
    const bounds = stage.getBoundingClientRect();
    visible = !observer || bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < view.innerHeight;
    observer?.observe(stage); playback();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; observer?.disconnect();
    document.removeEventListener('visibilitychange', playback);
    view.removeEventListener?.('online', networkRestored);
    reduce.removeEventListener?.('change', refresh);
    signal?.removeEventListener('abort', destroy);
    video.removeEventListener('playing', playing); video.removeEventListener('error', error);
    motionImage.removeEventListener('load', imageLoaded); motionImage.removeEventListener('error', imageError);
    clearSource(); clearImage(); video.remove(); sergeyMotion?.destroy(); stage = null;
  }
  document.addEventListener('visibilitychange', playback);
  view.addEventListener?.('online', networkRestored);
  reduce.addEventListener?.('change', refresh);
  signal?.addEventListener('abort', destroy, {once:true});
  video.addEventListener('playing', playing); video.addEventListener('error', error);
  motionImage.addEventListener('load', imageLoaded); motionImage.addEventListener('error', imageError);
  return {refresh, destroy};
}
