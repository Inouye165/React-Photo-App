// Centralized API base URL configuration for the frontend.

export function getApiBaseUrl(): string {
  let base = '';

  try {
    // Support both VITE_API_URL (canonical) and VITE_API_BASE_URL (legacy)
    base = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
  } catch {
    // Fallback for unusual test environments
  }

  if (!base || base.trim() === '') {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
      base = `${protocol}://${window.location.hostname}:3001`;
    } else {
      base = 'http://localhost:3001';
    }
  }

  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export const API_BASE_URL = getApiBaseUrl();
