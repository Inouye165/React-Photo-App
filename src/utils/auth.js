/**
 * Authentication utilities for the photo app
 */

/**
 * Creates an authenticated image URL by adding the auth token as a query parameter
 * @param {string} baseUrl - The base URL for the image
 * @returns {string} The URL with authentication token added
 */
export function createAuthenticatedImageUrl(baseUrl) {
  let token;
  try {
    token = localStorage.getItem('authToken');
  } catch (error) {
    console.warn('Failed to access localStorage:', error);
    return baseUrl;
  }
  
  if (!token || token.trim() === '') {
    return baseUrl;
  }
  
  try {
    let url;
    // Handle relative URLs by creating a URL relative to current location
    if (baseUrl.startsWith('/')) {
      url = new URL(baseUrl, window.location.origin);
    } else {
      url = new URL(baseUrl);
    }
    
    url.searchParams.set('token', token);
    return url.toString();
  } catch (error) {
    // If URL parsing fails, return original URL
    console.warn('Failed to parse URL for authentication:', baseUrl, error);
    return baseUrl;
  }
}

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