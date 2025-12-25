type AiPollTraceEntry = {
  ts: string;
  event: string;
  [key: string]: unknown;
};

declare global {
  interface Window {
    __AI_POLL_TRACE?: AiPollTraceEntry[];
    dumpAiPollTrace?: () => string;
  }
}
// Set up the trace globals immediately.
// (Exporter should exist even if debug is disabled.)
if (typeof window !== 'undefined') {
  window.__AI_POLL_TRACE = window.__AI_POLL_TRACE ?? [];
  window.dumpAiPollTrace =
    window.dumpAiPollTrace ??
    (() => JSON.stringify(window.__AI_POLL_TRACE ?? [], null, 2));
}

export function isAiPollDebugEnabled(): boolean {
  const envEnabled =
    typeof import.meta !== 'undefined' &&
    (import.meta as any).env &&
    (import.meta as any).env.VITE_DEBUG_AI_POLL === '1';

  if (envEnabled) return true;

  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage?.getItem('debug_ai_poll') === '1';
  } catch {
    return false;
  }
}

export function aiPollDebug(event: string, data?: Record<string, unknown>): void {
  if (!isAiPollDebugEnabled()) return;
  if (typeof window === 'undefined') return;

  const entry: AiPollTraceEntry = {
    ts: new Date().toISOString(),
    event,
    ...(data ?? {}),
  };

  try {
    // Console logging is intentionally shallow and secret-safe; callers must not pass secrets.
    // eslint-disable-next-line no-console
    console.log('[AI_POLL_TRACE]', entry);
  } catch {
    // ignore
  }

  try {
    if (!Array.isArray(window.__AI_POLL_TRACE)) window.__AI_POLL_TRACE = [];
    window.__AI_POLL_TRACE.push(entry);
  } catch {
    // ignore
  }
}
