// Centralized API base URL configuration for the frontend.

export function getApiBaseUrl(): string {
  let base = '';

  try {
    // Support both VITE_API_URL (canonical) and VITE_API_BASE_URL (legacy)
    base = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
  } catch {
    // Fallback for unusual test environments
  }

  const normalized = base.trim();
  if (!normalized) {
    if (typeof window !== 'undefined') {
      // Intentionally prefer same-origin relative API calls when env vars are unset.
      // This avoids accidental production fallback to hostname:3001 and works with
      // Vite dev proxy when VITE_API_URL is intentionally left blank.
      return '';
    }

    // Non-browser fallback for tests/SSR-style execution.
    return 'http://localhost:3001';
  }

  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export const API_BASE_URL = getApiBaseUrl();
