import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from './api';

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
    // Mock fetch to return 401
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    });

    // Call an API function that uses handleAuthError
    const result = await api.getPhotos();

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
