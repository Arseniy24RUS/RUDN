const CHARACTER_SELECTOR = '.rx-gfx-stage .rx-character, .rx-hero-person';

/** Ambient presentation only. Animation time never enters a saved shift. */
export function createCharacterMotion(root, {signal} = {}) {
  const document = root.ownerDocument;
  const view = document.defaultView;
  if (signal?.aborted || !view || typeof root.animate !== 'function') {
    return {refresh() {}, destroy() {}};
  }

  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const characters = new Map();
  const phases = new Map();
  let destroyed = false;

  function updatePlayback(character) {
    const playing = !document.hidden && character.visible;
    for (const animation of character.animations) {
      if (playing) animation.play();
      else animation.pause();
    }
  }

  const observer = typeof view.IntersectionObserver === 'function'
    ? new view.IntersectionObserver(entries => {
      for (const entry of entries) {
        const character = characters.get(entry.target);
        if (!character) continue;
        character.visible = entry.isIntersecting;
        updatePlayback(character);
      }
    })
    : null;

  function release(element, character) {
    phases.set(character.key, character.animations.map(animation => animation.currentTime || 0));
    for (const animation of character.animations) animation.cancel();
    element.style.transformOrigin = character.originalOrigin;
    observer?.unobserve(element);
    characters.delete(element);
  }

  function animateCharacter(element) {
    const stage = element.closest('[data-scene-actor]');
    const actor = stage?.dataset.sceneActor || 'C01';
    const key = stage ? actor : 'welcome';
    const rhythm = Number(actor.slice(1)) || 1;
    const restrained = element.closest('.rx-compact-scene') || ['C09', 'C21'].includes(actor);
    const originalOrigin = element.style.transformOrigin;
    element.style.transformOrigin = '50% 100%';

    // Independent transform properties preserve the existing scene placement.
    const breath = element.animate([
      {scale: '1 1', offset: 0},
      {scale: restrained ? '1.002 1.006' : '1.004 1.012', offset: 0.42},
      {scale: '1 1', offset: 1}
    ], {duration: 4100 + (rhythm % 5) * 170, iterations: Infinity, easing: 'ease-in-out'});
    breath.id = 'reception-breath';

    const sway = element.animate([
      {rotate: '0deg', translate: '0 0', offset: 0},
      {rotate: restrained ? '0.07deg' : '0.28deg', translate: '0 0', offset: 0.26},
      {rotate: restrained ? '-0.06deg' : '-0.22deg', translate: restrained ? '0 0' : '-0.7px 0', offset: 0.64},
      {rotate: '0deg', translate: '0 0', offset: 1}
    ], {duration: 11200 + (rhythm % 4) * 370, iterations: Infinity, easing: 'ease-in-out'});
    sway.id = 'reception-weight-shift';

    const animations = [breath, sway];
    const previousPhases = phases.get(key);
    for (const [index, animation] of animations.entries()) {
      animation.pause();
      animation.currentTime = previousPhases?.[index] ?? (rhythm % 7) * 300;
    }
    const bounds = element.getBoundingClientRect();
    const visible = bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < view.innerHeight;
    const character = {key, animations, originalOrigin, visible};
    characters.set(element, character);
    observer?.observe(element);
    updatePlayback(character);
  }

  function refresh() {
    if (destroyed) return;
    for (const [element, character] of characters) {
      if (reducedMotion.matches || !root.contains(element)) release(element, character);
    }
    if (reducedMotion.matches) return;
    for (const element of root.querySelectorAll(CHARACTER_SELECTOR)) {
      if (!characters.has(element)) animateCharacter(element);
    }
  }

  function onVisibilityChange() {
    for (const character of characters.values()) updatePlayback(character);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    observer?.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.removeEventListener('change', refresh);
    signal?.removeEventListener('abort', destroy);
    for (const [element, character] of characters) release(element, character);
    phases.clear();
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotion.addEventListener('change', refresh);
  signal?.addEventListener('abort', destroy, {once: true});
  return {refresh, destroy};
}
