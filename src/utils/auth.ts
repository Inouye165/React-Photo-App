/**
 * Authentication utilities for the photo app
 */

/**
 * Deprecated client-side helper.
 * The application now uses httpOnly cookies and server-signed image URLs.
 * For backward compatibility keep a no-op implementation.
 */
export function createAuthenticatedImageUrl(baseUrl: string): string {
  return baseUrl;
}

/**
 * Gets the auth token from localStorage
 * @returns {string|null} The auth token or null if not found
 */
export function getAuthToken(): string | null {
  // Token is not stored client-side anymore; return null.
  return null;
}

/**
 * Sets the auth token in localStorage
 * @param {string} token - The auth token to store
 */
export function setAuthToken(_token: string): void {
  // no-op: token should be handled by server-set httpOnly cookie
}

/**
 * Removes the auth token from localStorage
 */
export function removeAuthToken(): void {
  // no-op: token is stored in httpOnly cookie; call logout endpoint server-side instead
}

/**
 * Checks if user is authenticated (has a valid token)
 * @returns {boolean} True if user has a token
 */
export function isAuthenticated(): boolean {
  // Client cannot check httpOnly cookie from JS; rely on server for auth status
  return false;
}