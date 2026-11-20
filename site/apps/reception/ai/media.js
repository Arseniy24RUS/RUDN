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

// The 120 authored frames are grouped in small still images. Keep only the
// current and next sheet so a phone does not need to decode a 31 MiB atlas.
const C03_FRAMES = Object.freeze({
  width:224, height:305, columns:4, rows:5, sheets:6, interval:1000 / 12
});
const C03_SHEET_TIMEOUT_MS = 15000;
const C03_LOOP_TIMEOUT_MS = 30000;
const MOTION_COPY = Object.freeze({
  ru:['Пауза', 'Включить анимацию', 'Анимация персонажа', 'Повторить анимацию'],
  en:['Pause', 'Play animation', 'Character motion', 'Retry animation'],
  zh:['暂停', '播放动画', '角色动画', '重试动画']
});

function createSergeyMotion(root, view, reducedMotion) {
  const document = root.ownerDocument;
  const {width, height, columns, rows, sheets, interval} = C03_FRAMES;
  const framesPerSheet = columns * rows;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('data-rxa-motion-canvas', '');

  // The same cropped frames can be presented by the browser's image renderer
  // if a 2D drawing context is unavailable or is lost under memory pressure.
  const svg = 'http://www.w3.org/2000/svg';
  const sprite = document.createElementNS(svg, 'svg');
  sprite.setAttribute('width', width);
  sprite.setAttribute('height', height);
  sprite.setAttribute('data-rxa-motion-sprite', '');
  sprite.setAttribute('overflow', 'hidden');
  const spriteImage = document.createElementNS(svg, 'image');
  spriteImage.setAttribute('width', columns * width);
  spriteImage.setAttribute('height', rows * height);
  sprite.append(spriteImage);
  const image = document.createElement('img');
  image.alt = '';
  image.setAttribute('data-rxa-motion-image', '');
  for (const layer of [canvas, sprite, image]) {
    layer.setAttribute('class', 'rxa-citizen-video');
    layer.setAttribute('aria-hidden', 'true');
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'rxa-motion-toggle';
  toggle.dataset.focus = 'citizen-motion';
  const connection = view.navigator.connection;
  const reducedData = view.matchMedia?.('(prefers-reduced-data: reduce)');
  const assets = new Map();
  let stage = null, visible = false, enabled = null;
  let layer = canvas, context;
  let usingImage = false, failed = false, imageLoaded = false, spriteLoaded = false;
  let checkedCanvas = false, canvasUnavailable = false;
  let timer = null, imageTimeout = null, frame = 0, nextFrameAt = 0;

  function canPlay() { return enabled ?? !(reducedMotion.matches || reducedData?.matches || connection?.saveData); }
  function shouldDraw() { return stage && visible && canPlay() && !failed; }
  function clearReady() { stage?.removeAttribute('data-rxa-motion-ready'); }
  function showFrame() {
    // These callbacks can complete after the user pauses or leaves the slide.
    if (shouldDraw()) stage.setAttribute('data-rxa-motion-ready', '');
  }
  function clearImage() {
    view.clearTimeout(imageTimeout);
    imageTimeout = null;
    imageLoaded = false;
    image.removeAttribute('src');
  }
  function stop() {
    view.clearTimeout(timer);
    timer = null;
    clearReady();
    if (usingImage) clearImage();
  }
  function discardSheet(index, sheet) {
    view.clearTimeout(sheet.timeout);
    sheet.element.onload = sheet.element.onerror = null;
    if (!sheet.ready) sheet.element.removeAttribute('src');
    assets.delete(index);
  }
  function resetSheets() {
    for (const [index, sheet] of assets) discardSheet(index, sheet);
    spriteLoaded = false;
    spriteImage.removeAttribute('href');
  }
  function setLayer(next) {
    if (layer === next) return;
    clearReady();
    layer.remove();
    layer = next;
    stage?.append(layer);
  }
  function fallbackImage() {
    stop();
    resetSheets();
    usingImage = true;
    setLayer(image);
    sync();
  }
  function imageFailed() {
    if (!image.hasAttribute('src')) return;
    clearImage();
    failed = true;
    clearReady();
    sync();
  }
  function startImage() {
    if (imageLoaded) showFrame();
    if (image.hasAttribute('src')) return;
    image.src = url('assets/gfx1/motion/C03.webp');
    imageTimeout = view.setTimeout(imageFailed, C03_LOOP_TIMEOUT_MS);
  }
  function startSheet(index) {
    if (assets.has(index)) return assets.get(index);
    const element = new view.Image();
    const sheet = {element, ready:false, failed:false, timeout:null};
    assets.set(index, sheet);
    const fail = () => {
      if (assets.get(index) !== sheet) return;
      sheet.failed = true;
      if (shouldDraw() && index === Math.floor(frame / framesPerSheet)) fallbackImage();
    };
    element.onload = () => {
      if (assets.get(index) !== sheet) return;
      view.clearTimeout(sheet.timeout);
      if (element.naturalWidth !== columns * width || element.naturalHeight !== rows * height) {
        fail();
        return;
      }
      // load already means the image is drawable. Some WebKit versions reject
      // decode() for a loaded image on which drawImage() succeeds.
      sheet.ready = true;
      if (index === Math.floor(frame / framesPerSheet)) sync();
    };
    element.onerror = fail;
    sheet.timeout = view.setTimeout(fail, C03_SHEET_TIMEOUT_MS);
    element.src = url(`assets/gfx1/motion/C03-frames-${index + 1}.webp`);
    return sheet;
  }
  function drawStill(sheet, x, y) {
    if (layer === canvas) {
      try {
        context ??= canvas.getContext('2d');
        if (!context || context.isContextLost?.()) throw new Error('canvas unavailable');
        context.clearRect(0, 0, width, height);
        context.drawImage(sheet.element, x, y, width, height, 0, 0, width, height);
        if (!checkedCanvas) {
          // Every authored C03 frame has an opaque torso at this interior point.
          if (!context.getImageData(width / 2, height / 2, 1, 1).data[3]) throw new Error('canvas rendered no frame');
          checkedCanvas = true;
        }
        return true;
      } catch {
        context = null;
        canvasUnavailable = true;
        setLayer(sprite);
      }
    }
    sprite.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    if (spriteImage.getAttribute('href') !== sheet.element.src) {
      spriteLoaded = false;
      spriteImage.setAttribute('href', sheet.element.src);
    }
    return spriteLoaded;
  }
  function tick() {
    timer = null;
    if (!shouldDraw()) return;
    const at = view.performance.now();
    if (at + 1 >= nextFrameAt) {
      const index = Math.floor(frame / framesPerSheet);
      const nextIndex = (index + 1) % sheets;
      for (const [oldIndex, sheet] of assets) {
        if (oldIndex !== index && oldIndex !== nextIndex) discardSheet(oldIndex, sheet);
      }
      const sheet = startSheet(index);
      if (sheet.failed) { fallbackImage(); return; }
      if (!sheet.ready) return;
      startSheet(nextIndex);
      const localFrame = frame % framesPerSheet;
      const drawn = drawStill(sheet, (localFrame % columns) * width, Math.floor(localFrame / columns) * height);
      if (!drawn) return;
      showFrame();
      frame = (frame + 1) % (framesPerSheet * sheets);
      nextFrameAt = Math.max(nextFrameAt + interval, at + interval / 2);
    }
    timer = view.setTimeout(tick, Math.max(0, nextFrameAt - view.performance.now()));
  }
  function sync() {
    if (!stage) return;
    const lang = (root.lang || document.documentElement.lang).slice(0, 2);
    const [pauseLabel, playLabel, accessibleName, retryLabel] = MOTION_COPY[lang] || MOTION_COPY.ru;
    toggle.textContent = failed ? retryLabel : canPlay() ? pauseLabel : playLabel;
    toggle.setAttribute('aria-label', failed ? retryLabel : accessibleName);
    toggle.setAttribute('aria-pressed', String(canPlay() && !failed));
    stage.toggleAttribute('data-rxa-motion-manual', enabled === true);
    if (!shouldDraw()) { stop(); return; }
    if (usingImage) { startImage(); return; }
    if (timer === null) {
      nextFrameAt = view.performance.now();
      tick();
    }
  }
  function refresh(next, inView = false) {
    if (next !== stage) {
      stop();
      stage?.removeAttribute('data-rxa-motion-manual');
      stage = next;
      if (stage) stage.append(layer, toggle);
      else {
        layer.remove();
        toggle.remove();
        resetSheets();
      }
    }
    visible = inView;
    sync();
  }
  function retry() {
    if (!failed) return;
    resetSheets();
    failed = usingImage = false;
    setLayer(canvasUnavailable ? sprite : canvas);
    sync();
  }
  function chooseMotion() {
    if (failed) {
      enabled = true;
      retry();
      return;
    }
    enabled = !canPlay();
    if (!enabled) resetSheets();
    sync();
  }
  function lostContext() {
    if (layer !== canvas) return;
    context = null;
    canvasUnavailable = true;
    setLayer(sprite);
    sync();
  }
  toggle.addEventListener('click', chooseMotion);
  canvas.addEventListener('contextlost', lostContext);
  spriteImage.addEventListener('load', () => {
    spriteLoaded = true;
    if (layer === sprite) sync();
  });
  spriteImage.addEventListener('error', () => {
    if (layer === sprite && shouldDraw() && spriteImage.hasAttribute('href')) fallbackImage();
  });
  image.addEventListener('load', () => {
    if (!image.hasAttribute('src')) return;
    view.clearTimeout(imageTimeout);
    imageLoaded = true;
    showFrame();
  });
  image.addEventListener('error', imageFailed);
  connection?.addEventListener?.('change', sync);
  reducedData?.addEventListener?.('change', sync);
  return {
    refresh, retry,
    destroy() {
      refresh(null);
      clearImage();
      toggle.removeEventListener('click', chooseMotion);
      canvas.removeEventListener('contextlost', lostContext);
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
 * atlas so playback also works when browser autoplay is unavailable.
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
  const sergeyMotion = lessonFrames
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
    const candidate = root.querySelector(sergeyMotion
      ? '[data-rxa-actor], [data-rxa-chat-actor="C03"]'
      : '[data-rxa-actor]');
    const nextActor = candidate?.dataset.rxaActor || candidate?.dataset.rxaChatActor || '';
    const next = ACTOR.test(nextActor) && (!reduce.matches || nextActor === 'C03' && sergeyMotion) ? candidate : null;
    if (next === stage) { playback(); return; }
    const returning = !stage;
    if (stage) { cancelFrame(); observer?.unobserve(stage); stage.removeAttribute('data-rxa-motion-ready'); }
    stage = next;
    if (!stage) {
      if (reduce.matches) clearSource(); else pause();
      clearImage(); video.remove(); sergeyMotion?.refresh(null); return;
    }
    if (nextActor !== actor) {
      clearSource(); clearImage(); actor = nextActor;
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
