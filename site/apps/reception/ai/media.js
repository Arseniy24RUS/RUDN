import {resourceURL} from '../../../assets/js/release-resources.js';
import {createDecodedMotion} from './decoded-motion.js';

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
const ACTOR_FRAMES = Object.freeze({
  width:224, height:305, columns:4, rows:5, sheets:6, interval:1000 / 12
});
const SHEET_TIMEOUT_MS = 15000;
const LOOP_TIMEOUT_MS = 30000;

function createActorMotion(root, view, actorId, onFrame) {
  const document = root.ownerDocument;
  const {width, height, columns, rows, sheets, interval} = ACTOR_FRAMES;
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

  const assets = new Map();
  let stage = null, visible = false;
  let layer = canvas, context;
  let usingImage = false, failed = false, imageLoaded = false, spriteLoaded = false;
  let checkedCanvas = false, canvasUnavailable = false;
  let timer = null, imageTimeout = null, frame = 0, nextFrameAt = 0;
  let retryTimer = null, retryDelay = IMAGE_RETRY_DELAY_MS;

  function shouldDraw() { return stage && visible && !failed; }
  function clearReady() { stage?.removeAttribute('data-rxa-motion-ready'); }
  function showFrame() {
    if (!shouldDraw()) return;
    retryDelay = IMAGE_RETRY_DELAY_MS;
    if (!stage.hasAttribute('data-rxa-motion-ready')) {
      stage.setAttribute('data-rxa-motion-ready', '');
      onFrame();
    }
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
    view.clearTimeout(retryTimer);
    retryTimer = null;
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
    image.src = url(`assets/gfx1/motion/${actorId}.webp`);
    imageTimeout = view.setTimeout(imageFailed, LOOP_TIMEOUT_MS);
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
    sheet.timeout = view.setTimeout(fail, SHEET_TIMEOUT_MS);
    element.src = url(`assets/gfx1/motion/${actorId}-frames-${index + 1}.webp`);
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
          // Every authored actor frame has an opaque torso at this interior point.
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
    if (!stage || !visible) { stop(); return; }
    if (failed) {
      if (retryTimer === null && view.navigator.onLine !== false) {
        retryTimer = view.setTimeout(retry, retryDelay);
        retryDelay = Math.min(retryDelay * 2, LOOP_TIMEOUT_MS);
      }
      return;
    }
    if (usingImage) { startImage(); return; }
    if (timer === null) {
      nextFrameAt = view.performance.now();
      tick();
    }
  }
  function refresh(next, inView = false) {
    if (next !== stage) {
      stop();
      stage = next;
      if (stage) stage.append(layer);
      else {
        layer.remove();
        resetSheets();
      }
    }
    visible = inView;
    sync();
  }
  function retry() {
    view.clearTimeout(retryTimer);
    retryTimer = null;
    if (!failed || !stage || !visible) return;
    resetSheets();
    failed = usingImage = false;
    setLayer(canvasUnavailable ? sprite : canvas);
    sync();
  }
  function lostContext() {
    if (layer !== canvas) return;
    context = null;
    canvasUnavailable = true;
    setLayer(sprite);
    sync();
  }
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
  return {
    refresh, retry,
    destroy() {
      refresh(null);
      clearImage();
      canvas.removeEventListener('contextlost', lostContext);
    }
  };
}

/** The active case owns one player. Moving between reception and chat reuses it. */
export function createMessengerMedia(root, {signal} = {}) {
  const document = root.ownerDocument, view = document?.defaultView;
  if (!view || signal?.aborted) return {refresh() {}, destroy() {}};
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
  const hasAtlas = typeof view.Image === 'function' && typeof document.createElementNS === 'function';
  const reduce = view.matchMedia?.('(prefers-reduced-motion: reduce)') || {matches:false};
  const failedVideo = new Set(), imageFailures = new Map();
  let stage = null, actor = '', visible = false, ready = false, verifiedAlpha = false, frame, destroyed = false, imageReady = false;
  let watchdog, imageRetry, lastVideoTime, decodedFrames = 0, lastProgressAt = 0, sourceVersion = 0;
  let sampleContext, lastSample;
  let attempt = null, decoded = null, decodedFailed = false, atlas = null, heldPoster = null;
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
  function legacyFrameChanged() {
    try {
      if (!sampleContext) {
        const sample = document.createElement('canvas');
        sample.width = sample.height = 16;
        sampleContext = sample.getContext('2d', {willReadFrequently:true});
      }
      if (!sampleContext) return false;
      sampleContext.clearRect(0, 0, 16, 16);
      sampleContext.drawImage(video, 0, 0, 16, 16);
      const pixels = sampleContext.getImageData(0, 0, 16, 16).data;
      const changed = !lastSample || pixels.some((value, index) => value !== lastSample[index]);
      lastSample = pixels;
      return changed;
    } catch { return false; }
  }
  // A successful play() or a moving playhead does not prove compositing.
  function checkProgress() {
    watchdog = undefined;
    if (!shouldPlay() || useFallback() || !video.hasAttribute('src')) return;
    const at = now();
    if (!video.requestVideoFrameCallback && !video.paused && video.videoWidth) {
      const quality = video.getVideoPlaybackQuality?.();
      const shown = quality && quality.totalVideoFrames - quality.droppedVideoFrames;
      if (quality ? shown > decodedFrames : legacyFrameChanged()) {
        decodedFrames = shown ?? 0;
        recordFrame(video.currentTime);
      }
    }
    if (useFallback()) return;
    // Give an active network transfer time to reach the decoder.
    const loading = !ready && video.networkState === video.NETWORK_LOADING && video.readyState < video.HAVE_CURRENT_DATA;
    if (at - lastProgressAt >= (loading ? LOADING_TIMEOUT_MS : FRAME_TIMEOUT_MS)) { fallbackVideo(); return; }
    watchdog = schedule(checkProgress, 750);
  }
  function watchPlayback() {
    if (watchdog !== undefined) return;
    lastProgressAt = now();
    watchdog = schedule(checkProgress, 750);
  }

  function portrait() { ready = false; stage?.removeAttribute('data-rxa-motion-ready'); }
  function pause() {
    stopWatchdog(); cancelFrame();
    if (attempt || !video.paused) video.pause();
    attempt = null;
  }
  function clearVideo() {
    pause();
    sourceVersion++;
    verifiedAlpha = false;
    decodedFrames = 0;
    lastVideoTime = undefined;
    lastSample = undefined;
    if (video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
    if (heldPoster) {
      heldPoster.style.removeProperty('opacity');
      video.style.removeProperty('opacity');
      heldPoster = null;
    }
    video.remove();
  }
  function clearImage() {
    if (imageRetry !== undefined) unschedule(imageRetry);
    imageRetry = undefined;
    imageReady = false;
    if (motionImage.hasAttribute('src')) motionImage.removeAttribute('src');
    motionImage.remove();
  }
  // Keep the authored character movement in the full player, including in
  // case chat. Legacy embeds retain their reduced-motion behavior.
  const motionAllowed = () => hasAtlas || !reduce.matches;
  const shouldPlay = () => !destroyed && stage && visible && !document.hidden && motionAllowed();
  const useFallback = () => !supportsVideo || failedVideo.has(actor);
  const videoURL = () => url(`assets/gfx1/motion/${actor}.webm`);
  function imagePlayback(retrying = false) {
    if (!shouldPlay()) { clearImage(); portrait(); return; }
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
    if (!shouldPlay() || !useFallback() || !motionImage.hasAttribute('src')) return;
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
    if (decodedFailed && actor) {
      // A temporary network error can take both readers of the same WebM
      // offline. Give the full-resolution source first choice on reconnection.
      decodedFailed = false;
      failedVideo.delete(actor);
      atlas?.destroy();
      atlas = null;
      clearVideo();
      portrait();
      playback();
      return;
    }
    if (imageFailures.delete(actor)) { clearImage(); playback(); }
  }
  function hasVideoAlpha() {
    // Some engines advertise VP9 but render its transparent pixels as black.
    const sample = document.createElement('canvas');
    sample.width = sample.height = 1;
    try {
      const context = sample.getContext('2d', {willReadFrequently:true});
      if (!context) return false;
      context.drawImage(video, 0, 0, 1, 1, 0, 0, 1, 1);
      if (context.getImageData(0, 0, 1, 1).data[3] > 32) return false;
      // A blank frame is transparent too. Verify the authored figure exists.
      const x = Math.floor(video.videoWidth / 2), y = Math.floor(video.videoHeight / 2);
      context.clearRect(0, 0, 1, 1);
      context.drawImage(video, x, y, 1, 1, 0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3] >= 224;
    } catch { return false; }
  }
  function recordFrame(time) {
    if (!Number.isFinite(time) || time === lastVideoTime) return;
    if (!verifiedAlpha) {
      verifiedAlpha = hasVideoAlpha();
      if (!verifiedAlpha) { fallbackVideo(); return; }
    }
    if (!ready && lastVideoTime !== undefined) {
      ready = true;
      stage.setAttribute('data-rxa-motion-ready', '');
    }
    lastVideoTime = time;
    lastProgressAt = now();
  }
  function presentFrame(_time, metadata) {
    frame = undefined;
    if (!shouldPlay() || useFallback() || video.paused || !video.videoWidth) return;
    recordFrame(metadata?.mediaTime ?? video.currentTime);
    if (!useFallback()) watchFrame();
  }
  function watchFrame() {
    if (frame === undefined && video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(presentFrame);
  }
  function playing() {
    if (shouldPlay() && !useFallback()) watchFrame();
  }
  function fallbackVideo(holdFrame = true) {
    if (!video.hasAttribute('src') || useFallback()) return;
    failedVideo.add(actor);
    // Keep the last verified frame visible while the other decoder warms up.
    const canHoldFrame = holdFrame && video.readyState >= video.HAVE_CURRENT_DATA;
    const poster = canHoldFrame && hasAtlas && ready && shouldPlay() && stage.querySelector('.rxa-citizen-poster');
    if (poster) {
      heldPoster = poster;
      poster.style.opacity = '0';
      video.style.opacity = '1';
      pause();
    } else clearVideo();
    portrait();
    playback();
  }
  const error = () => fallbackVideo();
  function fallbackFrame() {
    if (!shouldPlay() || !useFallback()) return;
    stage.setAttribute('data-rxa-motion-ready', '');
    if (heldPoster) clearVideo();
  }
  function disposeDecoded() {
    const player = decoded;
    decoded = null;
    player?.destroy();
  }
  function playFallback() {
    if (!hasAtlas) { imagePlayback(); return; }
    if (!decodedFailed) {
      if (!decoded) {
        const player = createDecodedMotion(root, view, videoURL(), {
          onFrame() { if (decoded === player) fallbackFrame(); },
          onFailure() {
            if (decoded !== player) return;
            decodedFailed = true;
            disposeDecoded();
            portrait();
            playback();
          }
        });
        decoded = player;
      }
      decoded.refresh(stage, true);
      return;
    }
    atlas ??= createActorMotion(root, view, actor, fallbackFrame);
    atlas.refresh(stage, true);
  }
  function playback() {
    if (!shouldPlay()) {
      pause();
      if (ready) stage?.removeAttribute('data-rxa-motion-ready');
      if (decoded) {
        decoded.refresh(stage, false);
        portrait();
      }
      atlas?.refresh(stage, false);
      if (heldPoster) clearVideo();
      if (motionImage.hasAttribute('src') || imageRetry !== undefined) { clearImage(); portrait(); }
      return;
    }
    if (useFallback()) { playFallback(); return; }
    if (video.parentNode !== stage) stage.append(video);
    if (!video.hasAttribute('src')) video.src = videoURL();
    if (ready) stage.setAttribute('data-rxa-motion-ready', '');
    if (video.paused && !attempt) {
      const version = sourceVersion;
      const requested = video.play();
      attempt = requested;
      requested?.then(() => { if (attempt === requested) attempt = null; }, problem => {
        if (attempt !== requested || version !== sourceVersion || !shouldPlay()) return;
        attempt = null;
        if (problem?.name !== 'AbortError') fallbackVideo(false);
      });
    }
    // Reacquire a frame callback after a rerender moves the retained video.
    watchFrame();
    watchPlayback();
  }
  const observer = typeof view.IntersectionObserver === 'function' ? new view.IntersectionObserver(entries => {
    for (const item of entries) if (item.target === stage) { visible = item.isIntersecting; playback(); }
  }) : null;

  function refresh() {
    if (destroyed) return;
    const candidate = root.querySelector('[data-rxa-actor]') || root.querySelector('[data-rxa-chat-actor]');
    const nextActor = candidate?.dataset.rxaActor || candidate?.dataset.rxaChatActor || '';
    const next = ACTOR.test(nextActor) && motionAllowed() ? candidate : null;
    if (next === stage) { playback(); return; }
    const returning = !stage;
    if (stage) {
      cancelFrame(); observer?.unobserve(stage);
      stage.removeAttribute('data-rxa-motion-ready');
      if (heldPoster) clearVideo();
    }
    stage = next;
    if (!stage) {
      if (!motionAllowed()) { clearVideo(); portrait(); }
      else pause();
      decoded?.refresh(null, false);
      atlas?.refresh(null);
      clearImage(); video.remove(); return;
    }
    if (nextActor !== actor) {
      clearVideo(); clearImage(); portrait();
      disposeDecoded(); decodedFailed = false;
      atlas?.destroy(); atlas = null;
      actor = nextActor;
    }
    // Reopening the scene is an explicit way to retry after a lasting outage.
    if (returning) imageFailures.delete(actor);
    if ((ready && !useFallback()) || (imageReady && useFallback())) stage.setAttribute('data-rxa-motion-ready', '');
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
    clearVideo(); clearImage(); disposeDecoded(); atlas?.destroy(); portrait(); stage = null;
  }
  document.addEventListener('visibilitychange', playback);
  view.addEventListener?.('online', networkRestored);
  reduce.addEventListener?.('change', refresh);
  signal?.addEventListener('abort', destroy, {once:true});
  video.addEventListener('playing', playing); video.addEventListener('error', error);
  motionImage.addEventListener('load', imageLoaded); motionImage.addEventListener('error', imageError);
  return {refresh, destroy};
}
