// src/config/apiConfig.js
// Centralized API base URL configuration for the frontend.
// This module provides a single source of truth for the backend API URL.

/**
 * Get the API base URL from environment or fallback to localhost for dev.
 * Normalizes by stripping trailing slashes.
 * 
 * @returns {string} The API base URL without trailing slash
 */
export function getApiBaseUrl() {
  // Check Vite env variable (VITE_API_URL is the canonical name)
  let base = '';
  
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // Support both VITE_API_URL (canonical) and VITE_API_BASE_URL (legacy)
      base = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
    }
  } catch {
    // Fallback for test environments
  }

  // Default to localhost for development
  if (!base || base.trim() === '') {
    // Prefer a same-host fallback to avoid subtle cookie/CORS issues when the app
    // is accessed via 127.0.0.1 instead of localhost (or vice versa).
    // This is especially important for E2E flows that rely on httpOnly cookies.
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
      base = `${protocol}://${window.location.hostname}:3001`;
    } else {
      base = 'http://localhost:3001';
    }
  }

  // Normalize: strip trailing slash
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

/**
 * Build a full API URL from a path.
 * 
 * @param {string} path - The API path (e.g., '/api/auth/session' or 'api/auth/session')
 * @returns {string} The full API URL
 */
export function buildApiUrl(path) {
  const base = getApiBaseUrl();
  
  // Make sure the path starts with /
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  
  return `${base}${path}`;
}

// Export the resolved base URL for backwards compatibility
export const API_BASE_URL = getApiBaseUrl();
