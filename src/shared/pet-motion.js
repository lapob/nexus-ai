/** @module shared/pet-motion
 * Small, interruptible gestures around the user's chosen position.
 */
function createPetMotion(root, { random = Math.random } = {}) {
  const body = root.querySelector('.pet-life');
  const gaze = root.querySelector('.pet-gaze');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let timer = null, gesture = null, disposed = false, hovered = false;
  const reduced = () => root.dataset.motion === 'reduced'
    || (root.dataset.motion !== 'full' && media.matches);
  const resting = () => !document.hidden && !reduced()
    && root.dataset.state === 'idle' && root.dataset.menuOpen !== 'true';
  const stop = () => {
    clearTimeout(timer); timer = null;
    gesture?.cancel(); gesture = null;
  };
  const schedule = () => {
    if (disposed || !resting() || hovered) return;
    timer = setTimeout(perform, 3200 + random() * 5400);
  };
  const perform = () => {
    if (!resting() || hovered || disposed) return;
    const direction = random() < .5 ? -1 : 1;
    const kind = Math.floor(random() * 3);
    // Return to the same anchor after every gesture: never wander over controls.
    const frames = kind === 0 ? [
      { transform: 'none', offset: 0 },
      { transform: `translate(${direction * 4}px,-1px) rotate(${direction * 5}deg)`, offset: .25 },
      { transform: `translate(${direction * 4}px,-1px) rotate(${direction * 5}deg)`, offset: .65 },
      { transform: 'none', offset: 1 }
    ] : kind === 1 ? [
      { transform: 'none', offset: 0 },
      { transform: 'scale(1.025,.965) translateY(2px)', offset: .2 },
      { transform: `translate(${direction * 5}px,-7px) rotate(${direction * 2}deg)`, offset: .4 },
      { transform: `translateX(${direction * 6}px) scale(1.025,.98)`, offset: .6 },
      { transform: 'none', offset: 1 }
    ] : [
      { transform: 'none', offset: 0 },
      { transform: 'translateY(-3px) scale(.985,1.035)', offset: .35 },
      { transform: 'translateY(-3px) scale(.985,1.035)', offset: .55 },
      { transform: 'none', offset: 1 }
    ];
    gesture = body.animate(frames, { duration: kind === 1 ? 1400 : 2400, easing: 'cubic-bezier(.4,0,.2,1)' });
    gesture.onfinish = () => { gesture = null; schedule(); };
  };
  const reset = () => {
    stop();
    gaze.style.transform = '';
    if (resting()) schedule();
  };
  const pointer = event => {
    if (reduced() || root.dataset.menuOpen === 'true') return;
    const box = root.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1));
    hovered = true; stop();
    gaze.style.transform = `translate(${x * 2.5}px,${y * 1.5}px) rotate(${x * 3}deg)`;
  };
  const leave = () => { hovered = false; reset(); };
  const observer = new MutationObserver(reset);
  observer.observe(root, { attributes: true, attributeFilter: ['data-state', 'data-motion', 'data-menu-open', 'data-pet'] });
  root.addEventListener('pointermove', pointer, { passive: true });
  root.addEventListener('pointerleave', leave);
  document.addEventListener('visibilitychange', reset);
  media.addEventListener('change', reset);
  schedule();
  return { dispose() {
    disposed = true; stop(); observer.disconnect();
    root.removeEventListener('pointermove', pointer); root.removeEventListener('pointerleave', leave);
    document.removeEventListener('visibilitychange', reset); media.removeEventListener('change', reset);
  } };
}
module.exports = { createPetMotion };
