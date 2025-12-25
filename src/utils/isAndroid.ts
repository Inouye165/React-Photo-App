export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;

  // Prefer UA-CH when available, fall back to userAgent.
  const nav = navigator as any;
  const platform = nav.userAgentData?.platform;
  if (typeof platform === 'string' && /android/i.test(platform)) return true;

  const ua = navigator.userAgent || '';
  return /android/i.test(ua);
}
