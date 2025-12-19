export function isAndroid() {
  if (typeof navigator === 'undefined') return false;

  // Prefer UA-CH when available, fall back to userAgent.
  const platform = navigator.userAgentData?.platform;
  if (typeof platform === 'string' && /android/i.test(platform)) return true;

  const ua = navigator.userAgent || '';
  return /android/i.test(ua);
}
