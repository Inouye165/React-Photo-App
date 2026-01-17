/**
 * Detects if the current device is likely a mobile device.
 * 
 * Uses capability-based detection (touch + coarse pointer OR small viewport)
 * rather than unreliable user-agent sniffing.
 * 
 * @returns {boolean} True if mobile characteristics detected, false otherwise
 * 
 * @security Safe for SSR: returns false when window is undefined
 * @testing Compatible with jsdom/happy-dom: handles missing APIs gracefully
 */
export function isProbablyMobile(): boolean {
  // SSR safety: return false if window is not available
  if (typeof window === 'undefined') return false;

  // Heuristics: touch + coarse pointer OR touch + small-ish viewport.
  // Avoid UA sniffing; keep this lightweight and reliable in tests.
  const hasTouch =
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints || 0) > 0);

  const coarsePointer =
    typeof window.matchMedia === 'function' &&
    Boolean(window.matchMedia('(pointer: coarse)')?.matches);

  const smallViewport = typeof window.innerWidth === 'number' && window.innerWidth <= 900;

  return Boolean(hasTouch && (coarsePointer || smallViewport));
}
