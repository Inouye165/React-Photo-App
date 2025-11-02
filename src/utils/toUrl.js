export function toUrl(path = '', base = '') {
  try {
    if (!path) return base || '';
    if (/^https?:\/\//i.test(path)) return path;
    if (!base) return path;
    return new URL(path, base).toString();
  } catch {
    // Fallback to original path if URL parsing fails to avoid breaking rendering
    return path;
  }
}
