export function toUrl(path = '', base = '') {
  try {
    if (!path) return base || '';
    
    let url;
    if (/^https?:\/\//i.test(path)) {
      url = new URL(path);
    } else if (base) {
      url = new URL(path, base);
    } else {
      return path;
    }

    // Security: Authentication now handled via httpOnly cookies
    // Query parameter tokens are deprecated due to security risks

    return url.toString();
  } catch {
    // Fallback to original path if URL parsing fails to avoid breaking rendering
    return path;
  }
}
