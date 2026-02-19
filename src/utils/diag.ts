/**
 * Lightweight diagnostic mode for auth + API connectivity issues.
 *
 * Enable by adding `?diag=1` to the page URL **or** setting
 * `localStorage.DIAG = '1'` in DevTools.
 *
 * Security: NEVER logs secrets, tokens, passwords, or full emails.
 */

let _enabled: boolean | null = null;
let _id: string | null = null;

/**
 * Returns true when diagnostic mode is active.
 * Checked once per page load and cached.
 */
export function isDiagEnabled(): boolean {
  if (_enabled !== null) return _enabled;
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('diag') === '1') {
        _enabled = true;
        return true;
      }
      if (typeof localStorage !== 'undefined' && localStorage.getItem('DIAG') === '1') {
        _enabled = true;
        return true;
      }
    }
  } catch {
    // SSR or restricted env
  }
  _enabled = false;
  return false;
}

/**
 * Stable random short id (8 hex chars) for the current page load.
 * Useful for correlating frontend logs with backend request logs.
 */
export function diagId(): string {
  if (_id) return _id;
  const arr = new Uint8Array(4);
  try {
    crypto.getRandomValues(arr);
  } catch {
    // Fallback for environments without crypto
    for (let i = 0; i < 4; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  _id = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  return _id;
}

/**
 * Console.info that only fires when diag mode is enabled.
 * All messages are prefixed with `[diag:<id>]`.
 */
export function diagLog(...args: unknown[]): void {
  if (!isDiagEnabled()) return;
  // eslint-disable-next-line no-console
  console.info(`[diag:${diagId()}]`, ...args);
}

// --- Test helpers (only for vitest) ---
export function __resetDiagForTests(): void {
  _enabled = null;
  _id = null;
}
