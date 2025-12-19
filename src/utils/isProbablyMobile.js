export function isProbablyMobile() {
  if (typeof window === 'undefined') return false;

  // Heuristics: touch + coarse pointer OR touch + small-ish viewport.
  // Avoid UA sniffing; keep this lightweight and robust in tests.
  const hasTouch =
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints || 0) > 0);

  const coarsePointer =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  const smallViewport = typeof window.innerWidth === 'number' && window.innerWidth <= 900;

  return Boolean(hasTouch && (coarsePointer || smallViewport));
}
