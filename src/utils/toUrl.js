export function toUrl(path = '', base = '', token = null) {
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

    // Append token if provided
    if (token) {
      url.searchParams.set('token', token);
    }

    return url.toString();
  } catch {
    // Fallback to original path if URL parsing fails to avoid breaking rendering
    return path;
  }
}
