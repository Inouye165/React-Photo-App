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
      formDataArg = opts.body;
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });
    await api.uploadPhotoToServer(dummyFile, '/upload');
    expect(formDataArg instanceof FormData).toBe(true);
    const keys = Array.from(formDataArg.keys());
    expect(keys).toContain('photo');
    expect(keys).not.toContain('thumbnail');
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from './api';

/**
 * Tests for httpOnly cookie-based authentication
 * 
 * SECURITY: This test suite verifies that:
 * 1. getAuthHeaders() does NOT include Bearer tokens (cookies handle auth)
 * 2. All API calls include credentials: 'include' for cookie transmission
 * 3. No token leakage via Authorization headers
 */
describe('api.js - Cookie-Based Authentication Security', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAuthHeaders - No Bearer Token Injection', () => {
    it('should NOT include Authorization header', () => {
      const headers = api.getAuthHeaders();
      
      // CRITICAL SECURITY CHECK: No Bearer token should be present
      expect(headers['Authorization']).toBeUndefined();
      expect(headers['authorization']).toBeUndefined();
    });

    it('should only include Content-Type header', () => {
      const headers = api.getAuthHeaders();
      
      // Should only have Content-Type
      expect(Object.keys(headers)).toEqual(['Content-Type']);
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should return consistent headers without side effects', () => {
      const headers1 = api.getAuthHeaders();
      const headers2 = api.getAuthHeaders();
      
      expect(headers1).toEqual(headers2);
      expect(headers1['Authorization']).toBeUndefined();
      expect(headers2['Authorization']).toBeUndefined();
    });
  });

  describe('Fetch calls include credentials', () => {
    it('updatePhotoState should include credentials: include', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });
      global.fetch = fetchSpy;

      await api.updatePhotoState(1, 'finished');

      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls[0];
      expect(fetchCall[1].credentials).toBe('include');
      
      // Also verify no Authorization header
      expect(fetchCall[1].headers['Authorization']).toBeUndefined();
    });

    it('getPhotos should include credentials: include', async () => {
      // Clear cache to ensure fresh fetch
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
    });

    it('deletePhoto should include credentials: include', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });
      global.fetch = fetchSpy;

      await api.deletePhoto(123);

      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls[0];
      expect(fetchCall[1].credentials).toBe('include');
    });

    it('uploadPhotoToServer should include credentials: include', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });
      global.fetch = fetchSpy;

      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      await api.uploadPhotoToServer(mockFile);

      expect(fetchSpy).toHaveBeenCalled();
      const fetchCall = fetchSpy.mock.calls[0];
      expect(fetchCall[1].credentials).toBe('include');
    });

    it('fetchProtectedBlobUrl should include credentials: include', async () => {
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
      expect(fetchCall[1].credentials).toBe('include');
    });
  });
});

describe('api.js - handleAuthError', () => {
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

describe('api.js - API functions with auth error handling', () => {
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
