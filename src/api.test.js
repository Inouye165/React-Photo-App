describe('uploadPhotoToServer FormData construction', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should append thumbnail if provided', async () => {
    const dummyFile = new File(['main'], 'main.jpg', { type: 'image/jpeg' });
    const dummyThumb = new Blob(['thumb'], { type: 'image/jpeg' });
    let formDataArg;
    global.fetch = vi.fn((url, opts) => {
      if (String(url).endsWith('/csrf')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ csrfToken: 'test-csrf-token' }) });
      }
      formDataArg = opts.body;
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });
    await api.uploadPhotoToServer(dummyFile, '/upload', dummyThumb);
    expect(formDataArg instanceof FormData).toBe(true);
    // Check keys
    const keys = Array.from(formDataArg.keys());
    expect(keys).toContain('photo');
    expect(keys).toContain('thumbnail');
    // Check values
    const photoVal = formDataArg.get('photo');
    const thumbVal = formDataArg.get('thumbnail');
    expect(photoVal).toStrictEqual(dummyFile);
    // For thumbnail, FormData returns a File (with name) even if you append a Blob. Check type and content.
    expect(thumbVal).toBeInstanceOf(File);
    expect(thumbVal.type).toBe(dummyThumb.type);
    // Optionally check content
    const thumbArray = await thumbVal.arrayBuffer();
    const dummyArray = await dummyThumb.arrayBuffer();
    expect(new Uint8Array(thumbArray)).toStrictEqual(new Uint8Array(dummyArray));
  });

  it('should not append thumbnail if not provided', async () => {
    const dummyFile = new File(['main'], 'main.jpg', { type: 'image/jpeg' });
    let formDataArg;
    global.fetch = vi.fn((url, opts) => {
      if (String(url).endsWith('/csrf')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ csrfToken: 'test-csrf-token' }) });
      }
      formDataArg = opts.body;
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });
    await api.uploadPhotoToServer(dummyFile, '/upload');
    expect(formDataArg instanceof FormData).toBe(true);
    const keys = Array.from(formDataArg.keys());
    expect(keys).toContain('photo');
    expect(keys).not.toContain('thumbnail');
  });

  it('should infer photo MIME type from extension when File.type is empty', async () => {
    const dummyFile = new File(['main'], 'main.HEIC', { type: '' });
    let formDataArg;
    global.fetch = vi.fn((url, opts) => {
      if (String(url).endsWith('/csrf')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ csrfToken: 'test-csrf-token' }) });
      }
      formDataArg = opts.body;
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });

    await api.uploadPhotoToServer(dummyFile, '/upload');

    const photoVal = formDataArg.get('photo');
    expect(photoVal).toBeInstanceOf(File);
    expect(photoVal.name).toBe('main.HEIC');
    expect(photoVal.type).toBe('image/heic');

    const photoArray = await photoVal.arrayBuffer();
    const dummyArray = await dummyFile.arrayBuffer();
    expect(new Uint8Array(photoArray)).toStrictEqual(new Uint8Array(dummyArray));
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from './api';

/**
 * Tests for Bearer Token Authentication
 * 
 * SECURITY: This test suite verifies that:
 * 1. getAuthHeaders() correctly includes Bearer tokens when authenticated
 * 2. getAuthHeaders() does NOT include tokens when logged out
 * 3. Tokens are NEVER logged or included in error messages
 * 4. fetchProtectedBlobUrl sends Authorization header for images
 */
describe('api - Bearer Token Authentication Security', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear token cache before each test
    api.setAuthToken(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    api.setAuthToken(null);
  });

  describe('getAuthHeaders - Bearer Token Injection', () => {
    it('should include Authorization header when token is set', () => {
      const testToken = 'test-jwt-token-12345';
      api.setAuthToken(testToken);
      
      const headers = api.getAuthHeaders();
      
      // CRITICAL SECURITY CHECK: Bearer token should be present
      expect(headers['Authorization']).toBe(`Bearer ${testToken}`);
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should NOT include Authorization header when logged out', () => {
      api.setAuthToken(null);
      
      const headers = api.getAuthHeaders();
      
      // No Bearer token should be present when logged out
      expect(headers['Authorization']).toBeUndefined();
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should return only Content-Type when no token (for public endpoints)', () => {
      api.setAuthToken(null);
      
      const headers = api.getAuthHeaders();
      
      expect(Object.keys(headers)).toEqual(['Content-Type']);
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should allow excluding Content-Type header', () => {
      const testToken = 'test-jwt-token';
      api.setAuthToken(testToken);
      
      const headers = api.getAuthHeaders(false);
      
      expect(headers['Authorization']).toBe(`Bearer ${testToken}`);
      expect(headers['Content-Type']).toBeUndefined();
    });

    it('should return consistent headers without side effects', () => {
      const testToken = 'consistent-token';
      api.setAuthToken(testToken);
      
      const headers1 = api.getAuthHeaders();
      const headers2 = api.getAuthHeaders();
      
      expect(headers1).toEqual(headers2);
      expect(headers1['Authorization']).toBe(`Bearer ${testToken}`);
      expect(headers2['Authorization']).toBe(`Bearer ${testToken}`);
    });

    it('should update token when setAuthToken is called', () => {
      api.setAuthToken('token-1');
      expect(api.getAuthHeaders()['Authorization']).toBe('Bearer token-1');
      
      api.setAuthToken('token-2');
      expect(api.getAuthHeaders()['Authorization']).toBe('Bearer token-2');
      
      api.setAuthToken(null);
      expect(api.getAuthHeaders()['Authorization']).toBeUndefined();
    });
  });

  describe('getAuthHeadersAsync - Logout Safety', () => {
    it('should NOT re-attach Authorization after explicit logout', async () => {
      // In tests, supabase.auth.getSession is globally mocked to return a token.
      // This makes sure explicit logout overrides the session.
      api.setAuthToken(null);

      const headers = await api.getAuthHeadersAsync(false);

      expect(headers['Authorization']).toBeUndefined();
      expect(headers['Content-Type']).toBeUndefined();
    });
  });

  describe('getAccessToken - Token Retrieval', () => {
    it('should return cached token when set', () => {
      const testToken = 'cached-token';
      api.setAuthToken(testToken);
      
      expect(api.getAccessToken()).toBe(testToken);
    });

    it('should return null when no token is set', () => {
      api.setAuthToken(null);
      
      expect(api.getAccessToken()).toBeNull();
    });
  });

  describe('Token Security - No Leakage', () => {
    it('should NOT log token to console on setAuthToken', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const consoleDebugSpy = vi.spyOn(console, 'debug');
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      
      const sensitiveToken = 'super-secret-jwt-token';
      api.setAuthToken(sensitiveToken);
      
      // Check no console output contains the token
      const allCalls = [
        ...consoleSpy.mock.calls,
        ...consoleDebugSpy.mock.calls,
        ...consoleWarnSpy.mock.calls
      ];
      
      for (const call of allCalls) {
        const stringified = JSON.stringify(call);
        expect(stringified).not.toContain(sensitiveToken);
      }
    });
  });

  describe('Fetch calls include Authorization header', () => {
    it('updatePhotoState should include Authorization header when authenticated', async () => {
      const testToken = 'test-bearer-token';
      api.setAuthToken(testToken);
      
      const fetchSpy = vi.fn().mockImplementation(async (url) => {
        if (String(url).endsWith('/csrf')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ csrfToken: 'test-csrf-token' }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      });
      global.fetch = fetchSpy;

      await api.updatePhotoState(1, 'finished');

      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls.find(([url, init]) => !String(url).endsWith('/csrf') && init && init.method === 'PATCH');
      expect(fetchCall).toBeTruthy();
      expect(fetchCall[1].headers['Authorization']).toBe(`Bearer ${testToken}`);
    });

    it('getPhotos should include Authorization header when authenticated', async () => {
      const testToken = 'photos-token';
      api.setAuthToken(testToken);
      
      // Clear cache to force a fresh fetch
      if (globalThis.__getPhotosInflight) {
        globalThis.__getPhotosInflight.clear();
      }
      
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, photos: [] })
      });
      global.fetch = fetchSpy;

      await api.getPhotos();

      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls[0];
      expect(fetchCall[1].headers['Authorization']).toBe(`Bearer ${testToken}`);
    });

    it('getPhotos should always include Authorization header with Bearer token', async () => {
      api.setAuthToken('photos-token');

      // Clear cache to force a fresh fetch
      if (globalThis.__getPhotosInflight) {
        globalThis.__getPhotosInflight.clear();
      }

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, photos: [] })
      });
      global.fetch = fetchSpy;

      await api.getPhotos();

      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls[0];
      expect(fetchCall[1].credentials).toBe('include');
      const headers = fetchCall[1].headers || {};
      expect(headers['Authorization']).toBe('Bearer photos-token');
    });

    it('deletePhoto should include Authorization header when authenticated', async () => {
      const testToken = 'delete-token';
      api.setAuthToken(testToken);
      
      const fetchSpy = vi.fn().mockImplementation(async (url) => {
        if (String(url).endsWith('/csrf')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ csrfToken: 'test-csrf-token' }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      });
      global.fetch = fetchSpy;

      await api.deletePhoto(123);

      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls.find(([url, init]) => !String(url).endsWith('/csrf') && init && init.method === 'DELETE');
      expect(fetchCall).toBeTruthy();
      expect(fetchCall[1].headers['Authorization']).toBe(`Bearer ${testToken}`);
    });

    it('uploadPhotoToServer should include Authorization header when authenticated', async () => {
      const testToken = 'upload-token';
      api.setAuthToken(testToken);
      
      const fetchSpy = vi.fn().mockImplementation(async (url) => {
        if (String(url).endsWith('/csrf')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ csrfToken: 'test-csrf-token' }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      });
      global.fetch = fetchSpy;

      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      await api.uploadPhotoToServer(mockFile);

      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls.find(([url, init]) => !String(url).endsWith('/csrf') && init && init.method === 'POST');
      expect(fetchCall).toBeTruthy();
      expect(fetchCall[1].headers['Authorization']).toBe(`Bearer ${testToken}`);
    });
  });

  describe('fetchProtectedBlobUrl - Bearer Token for Images', () => {
    it('should include Authorization header for image requests', async () => {
      const testToken = 'image-bearer-token';
      api.setAuthToken(testToken);
      
      const mockBlob = new Blob(['test'], { type: 'image/jpeg' });
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => mockBlob
      });
      global.fetch = fetchSpy;

      await api.fetchProtectedBlobUrl('http://example.com/image.jpg');

      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls[0];
      expect(fetchCall[1].headers['Authorization']).toBe(`Bearer ${testToken}`);
    });

    it('should NOT include Content-Type header for blob requests', async () => {
      const testToken = 'blob-token';
      api.setAuthToken(testToken);
      
      const mockBlob = new Blob(['test'], { type: 'image/jpeg' });
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => mockBlob
      });
      global.fetch = fetchSpy;

      await api.fetchProtectedBlobUrl('http://example.com/image.jpg');

      const fetchCall = fetchSpy.mock.calls[0];
      // Content-Type should NOT be set for blob requests (browser handles it)
      expect(fetchCall[1].headers['Content-Type']).toBeUndefined();
    });

    it('should handle 401 gracefully for image requests', async () => {
      const testToken = 'expired-token';
      api.setAuthToken(testToken);
      
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        blob: async () => { throw new Error('401'); }
      });
      global.fetch = fetchSpy;

      // fetchProtectedBlobUrl should throw on 401
      await expect(api.fetchProtectedBlobUrl('http://example.com/image.jpg'))
        .rejects.toThrow();
      
      dispatchEventSpy.mockRestore();
    });

    it('should return blob URL as-is if already a blob URL', async () => {
      const blobUrl = 'blob:http://example.com/12345';
      
      const result = await api.fetchProtectedBlobUrl(blobUrl);
      
      expect(result).toBe(blobUrl);
    });

    it('should omit credentials for all image fetches to avoid CORS failures', async () => {
      api.setAuthToken('test-token');
      
      const mockBlob = new Blob(['test'], { type: 'image/jpeg' });
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => mockBlob
      });
      global.fetch = fetchSpy;

      await api.fetchProtectedBlobUrl('http://example.com/image.jpg');

      const fetchCall = fetchSpy.mock.calls[0];
      // credentials: 'omit' prevents wildcard-origin vs credentialed-request CORS conflicts
      expect(fetchCall[1].credentials).toBe('omit');
    });

    it('should omit credentials for Supabase Storage signed URLs (no cookies needed)', async () => {
      api.setAuthToken('test-token');

      const mockBlob = new Blob(['test'], { type: 'image/jpeg' });
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => mockBlob
      });
      global.fetch = fetchSpy;

      await api.fetchProtectedBlobUrl(
        'https://project.supabase.co/storage/v1/object/sign/photos/test.jpg?token=abc.def.ghi'
      );

      const fetchCall = fetchSpy.mock.calls[0];
      expect(fetchCall[1].credentials).toBe('omit');
      // Signed URLs are fetched via the backend image proxy; the request is to our API,
      // so it SHOULD include Authorization (but still omit cookies/credentials).
      expect(fetchCall[1].headers?.Authorization).toBeDefined();
    });
  });
});

describe('api - handleAuthError', () => {
  let reloadSpy;
  let dispatchEventSpy;
  let originalLocation;

  beforeEach(() => {
    // Save original location
    originalLocation = window.location;
    
    // Mock window.location.reload
    delete window.location;
    window.location = { ...originalLocation, reload: vi.fn() };
    reloadSpy = vi.spyOn(window.location, 'reload');
    
    // Spy on window.dispatchEvent
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    // Restore original location
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  it('should NOT reload page on 401 error', async () => {
    // Clear any caches that might interfere
    if (globalThis.__getPhotosInflight) {
      globalThis.__getPhotosInflight.clear();
    }
    
    // Mock fetch to return 401
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    });

    // Use updatePhotoState which doesn't have caching
    const result = await api.updatePhotoState(1, 'finished');

    // CRITICAL: Verify reload was NOT called
    expect(reloadSpy).not.toHaveBeenCalled();
    
    // Verify custom event was dispatched instead
    expect(dispatchEventSpy).toHaveBeenCalled();
    
    const eventCalls = dispatchEventSpy.mock.calls;
    const authEvent = eventCalls.find(call => 
      call[0] instanceof CustomEvent && call[0].type === 'auth:session-expired'
    );
    
    expect(authEvent).toBeDefined();
    expect(authEvent[0].detail).toEqual({ status: 401 });
    
    // Function should return undefined (handled by handleAuthError)
    expect(result).toBeUndefined();
  });

  it('should NOT reload page on 403 error', async () => {
    // Mock fetch to return 403
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' })
    });

    // Call an API function that uses handleAuthError
    await api.updatePhotoState(1, 'finished');

    // CRITICAL: Verify reload was NOT called
    expect(reloadSpy).not.toHaveBeenCalled();
    
    // Verify custom event was dispatched instead
    expect(dispatchEventSpy).toHaveBeenCalled();
    
    const eventCalls = dispatchEventSpy.mock.calls;
    const authEvent = eventCalls.find(call => 
      call[0] instanceof CustomEvent && call[0].type === 'auth:session-expired'
    );
    
    expect(authEvent).toBeDefined();
    expect(authEvent[0].detail).toEqual({ status: 403 });
  });

  it('should allow normal operations on 200 success', async () => {
    // Mock fetch to return success
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 1 } })
    });

    // Use updatePhotoState which doesn't have caching
    const result = await api.updatePhotoState(1, 'finished');

    // Verify reload was NOT called for successful requests
    expect(reloadSpy).not.toHaveBeenCalled();
    
    // Verify NO auth event was dispatched for successful requests
    const eventCalls = dispatchEventSpy.mock.calls;
    const authEvent = eventCalls.find(call => 
      call[0] instanceof CustomEvent && call[0].type === 'auth:session-expired'
    );
    expect(authEvent).toBeUndefined();
    
    // Function should return the data
    expect(result).toEqual({ success: true, data: { id: 1 } });
  });

  it('should dispatch event with correct status code', async () => {
    // Mock fetch to return 401
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Token expired' })
    });

    await api.deletePhoto(123);

    // Verify the event contains the status code
    const eventCalls = dispatchEventSpy.mock.calls;
    const authEvent = eventCalls.find(call => 
      call[0] instanceof CustomEvent && call[0].type === 'auth:session-expired'
    );
    
    expect(authEvent).toBeDefined();
    expect(authEvent[0].detail.status).toBe(401);
  });

  it('should handle multiple auth errors without reloading', async () => {
    // Clear dispatch spy before this test
    dispatchEventSpy.mockClear();
    
    // Mock fetch to return 401
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    });

    // Make multiple API calls
    await api.updatePhotoState(1, 'finished');
    await api.updatePhotoState(2, 'finished');
    await api.updatePhotoCaption(3, 'test');

    // Verify reload was NEVER called despite multiple auth errors
    expect(reloadSpy).not.toHaveBeenCalled();
    
    // Verify event was dispatched for errors (at least 2 since limiters may batch)
    const eventCalls = dispatchEventSpy.mock.calls;
    const authEvents = eventCalls.filter(call => 
      call[0] instanceof CustomEvent && call[0].type === 'auth:session-expired'
    );
    
    expect(authEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('should not dispatch event on 404 or other non-auth errors', async () => {
    // Mock fetch to return 404
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' })
    });

    try {
      await api.getPhotos();
    } catch {
      // Expected to throw
    }

    // Verify NO auth event was dispatched for non-auth errors
    const eventCalls = dispatchEventSpy.mock.calls;
    const authEvent = eventCalls.find(call => 
      call[0] instanceof CustomEvent && call[0].type === 'auth:session-expired'
    );
    expect(authEvent).toBeUndefined();
    
    // Verify reload was NOT called
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

describe('api - API functions with auth error handling', () => {
  let dispatchEventSpy;

  beforeEach(() => {
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploadPhotoToServer should handle 401 gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401
    });

    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const result = await api.uploadPhotoToServer(mockFile);

    // Should return undefined when auth error is handled
    expect(result).toBeUndefined();
    
    // Should dispatch auth event
    const eventCalls = dispatchEventSpy.mock.calls;
    const authEvent = eventCalls.find(call => 
      call[0] instanceof CustomEvent && call[0].type === 'auth:session-expired'
    );
    expect(authEvent).toBeDefined();
  });

  it('checkPrivilege should handle 403 gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403
    });

    const result = await api.checkPrivilege('/test/path');

    // Should return undefined when auth error is handled
    expect(result).toBeUndefined();
    
    // Should dispatch auth event
    const eventCalls = dispatchEventSpy.mock.calls;
    const authEvent = eventCalls.find(call => 
      call[0] instanceof CustomEvent && call[0].type === 'auth:session-expired'
    );
    expect(authEvent).toBeDefined();
  });

  it('fetchCollectibles should handle 401 gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401
    });

    const result = await api.fetchCollectibles(123);

    // Should return undefined when auth error is handled
    expect(result).toBeUndefined();
    
    // Should dispatch auth event
    const eventCalls = dispatchEventSpy.mock.calls;
    const authEvent = eventCalls.find(call => 
      call[0] instanceof CustomEvent && call[0].type === 'auth:session-expired'
    );
    expect(authEvent).toBeDefined();
  });
});
