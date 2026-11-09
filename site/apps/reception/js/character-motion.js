import {resourceURL} from '../../../assets/js/release-resources.js';

const RECEPTION_SCENE = '.rx-scene:not(.rx-compact-scene) .rx-gfx-stage[data-scene-actor]';
const IDLE_ACTOR = /^(?:C(?:0[1-9]|1[0-9]|2[0-4])|S0[34])$/;
const READY = 'data-idle-motion-ready';

/** One optional portrait loop. Its playback position is never written to a shift. */
export function createCharacterMotion(root, {signal} = {}) {
  const document = root.ownerDocument;
  const view = document.defaultView;
  if (signal?.aborted || !view) return {refresh() {}, destroy() {}};

  const video = document.createElement('video');
  if (!video.canPlayType('video/webm; codecs="vp9"')) return {refresh() {}, destroy() {}};
  video.className = 'rx-character rx-character-video';
  video.muted = video.defaultMuted = video.playsInline = video.loop = true;
  video.preload = 'none';
  video.setAttribute('aria-hidden', 'true');

  const reduce = view.matchMedia('(prefers-reduced-motion: reduce)');
  const failedActors = new Set();
  let stage = null;
  let actor = '';
  let visible = false;
  let ready = false;
  let supportsAlpha;
  let frame;
  let destroyed = false;

  function usePortrait() {
    ready = false;
    stage?.removeAttribute(READY);
  }

  function clearSource() {
    video.pause();
    if (frame !== undefined) video.cancelVideoFrameCallback(frame);
    frame = undefined;
    usePortrait();
    if (video.hasAttribute('src')) {
      video.removeAttribute('src');
      video.load();
    }
  }

  function presentFrame() {
    frame = undefined;
    if (!stage || video.paused || !video.videoWidth) return;
    if (supportsAlpha === undefined) {
      // A browser can decode VP9 and still discard its alpha channel.
      const sample = document.createElement('canvas');
      sample.width = sample.height = 1;
      const context = sample.getContext('2d', {willReadFrequently: true});
      try {
        context?.drawImage(video, 0, 0, 1, 1, 0, 0, 1, 1);
        supportsAlpha = (context?.getImageData(0, 0, 1, 1).data[3] ?? 255) < 32;
      } catch {
        supportsAlpha = false;
      }
    }
    if (!supportsAlpha) {
      clearSource();
      video.remove();
      return;
    }
    ready = true;
    stage.setAttribute(READY, '');
  }

  function onPlaying() {
    if (ready || frame !== undefined) return;
    if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(presentFrame);
    else presentFrame();
  }

  function onError() {
    if (actor) failedActors.add(actor);
    clearSource();
  }

  function updatePlayback() {
    if (!stage || !visible || document.hidden || supportsAlpha === false || failedActors.has(actor)) {
      video.pause();
      return;
    }
    if (!video.hasAttribute('src')) {
      video.src = resourceURL(`../assets/gfx1/motion/${actor}.webm`, import.meta.url).href;
    }
    if (video.paused) {
      const requestedActor = actor;
      video.play().catch(error => {
        if (error.name !== 'AbortError' && actor === requestedActor) usePortrait();
      });
    }
  }

  const observer = typeof view.IntersectionObserver === 'function'
    ? new view.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target !== stage) continue;
        visible = entry.isIntersecting;
        updatePlayback();
      }
    })
    : null;

  function refresh() {
    if (destroyed) return;
    const candidate = reduce.matches || supportsAlpha === false ? null : root.querySelector(RECEPTION_SCENE);
    const next = IDLE_ACTOR.test(candidate?.dataset.sceneActor || '') ? candidate : null;
    if (next === stage) return;
    if (stage) {
      observer?.unobserve(stage);
      stage.removeAttribute(READY);
    }
    stage = next;
    if (!stage) {
      if (reduce.matches) clearSource();
      else video.pause();
      video.remove();
      return;
    }

    const nextActor = stage.dataset.sceneActor;
    if (nextActor !== actor) {
      clearSource();
      actor = nextActor;
    }
    stage.querySelector('picture').after(video);
    if (ready) stage.setAttribute(READY, '');

    const bounds = stage.getBoundingClientRect();
    visible = !observer || (bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < view.innerHeight);
    observer?.observe(stage);
    updatePlayback();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    observer?.disconnect();
    document.removeEventListener('visibilitychange', updatePlayback);
    reduce.removeEventListener('change', refresh);
    signal?.removeEventListener('abort', destroy);
    video.removeEventListener('playing', onPlaying);
    video.removeEventListener('error', onError);
    clearSource();
    video.remove();
    stage = null;
  }

  document.addEventListener('visibilitychange', updatePlayback);
  reduce.addEventListener('change', refresh);
  signal?.addEventListener('abort', destroy, {once: true});
  video.addEventListener('playing', onPlaying);
  video.addEventListener('error', onError);
  return {refresh, destroy};
}
