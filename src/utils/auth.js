/**
 * Authentication utilities for the photo app
 */

// createAuthenticatedImageUrl removed: frontend now uses signed URLs from backend/supabase storage

/**
 * Gets the auth token from localStorage
 * @returns {string|null} The auth token or null if not found
 */
export function getAuthToken() {
  return localStorage.getItem('authToken');
}

/**
 * Sets the auth token in localStorage
 * @param {string} token - The auth token to store
 */
export function setAuthToken(token) {
  localStorage.setItem('authToken', token);
}

/**
 * Removes the auth token from localStorage
 */
export function removeAuthToken() {
  localStorage.removeItem('authToken');
}

/**
 * Checks if user is authenticated (has a valid token)
 * @returns {boolean} True if user has a token
 */
export function isAuthenticated() {
  const token = getAuthToken();
  return token !== null && token.trim() !== '';
}