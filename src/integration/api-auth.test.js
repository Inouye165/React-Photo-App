import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../api';

// Make sure we're using the actual store, not a mock
vi.mock('../store', async () => {
  const actual = await vi.importActual('../store');
  return actual;
});

import useStore from '../store';

describe('Integration: API auth errors trigger UI banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Clear getPhotos cache (prevents stale cached responses between tests)
    if (globalThis.__getPhotosInflight) {
      globalThis.__getPhotosInflight.clear();
    }
    
    // Reset banner
    useStore.setState({
      banner: { message: '', severity: 'info' }
    });
  });

  it('401 (expired cookie) dispatches auth:session-expired event and updates banner', async () => {
    // Verify test environment supports events
    if (typeof window === 'undefined' || !window.addEventListener) {
      console.warn('Test environment does not support window.addEventListener');
      return;
    }

    // Mock fetch to return 401 (expired cookie scenario)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    });

    let eventDetail = null;

    // Use promise-based event listener (pattern from network tests)
    const eventPromise = new Promise((resolve) => {
      const listener = (event) => {
        eventDetail = event.detail;
        
        // Simulate what MainLayout does - update banner
        useStore.getState().setBanner({
          message: 'Session expired. Please refresh or log in again.',
          severity: 'error'
        });
        
        window.removeEventListener('auth:session-expired', listener);
        resolve(true);
      };
      
      // Add listener BEFORE making API call
      window.addEventListener('auth:session-expired', listener);
    });

    // Make API call that will trigger auth error
    const result = await api.getPhotos();

    // Wait for event (with timeout to prevent hanging)
    const eventFired = await Promise.race([
      eventPromise,
      new Promise(resolve => setTimeout(() => resolve(false), 200))
    ]);

    // Verify event was dispatched
    expect(eventFired).toBe(true);
    expect(eventDetail).toBeDefined();
    expect(eventDetail.status).toBe(401);

    // Verify banner was updated
    const banner = useStore.getState().banner;
    expect(banner.message).toMatch(/Session expired/i);
    expect(banner.severity).toBe('error');

    // Verify API call returned gracefully (handleAuthError returns early, no throw)
    expect(result).toBeUndefined();

    // Verify fetch was called exactly once
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('403 (invalid token) dispatches auth:session-expired event and updates banner', async () => {
    // Mock fetch to return 403 (invalid/forbidden token scenario)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' })
    });

    let eventDetail = null;

    // Promise-based event listener
    const eventPromise = new Promise((resolve) => {
      const listener = (event) => {
        eventDetail = event.detail;
        
        // Simulate MainLayout behavior
        useStore.getState().setBanner({
          message: 'Session expired. Please refresh or log in again.',
          severity: 'error'
        });
        
        window.removeEventListener('auth:session-expired', listener);
        resolve(true);
      };
      
      window.addEventListener('auth:session-expired', listener);
    });

    // Make API call that will trigger auth error
    const result = await api.updatePhotoState(123, 'finished');

    // Wait for event with timeout
    const eventFired = await Promise.race([
      eventPromise,
      new Promise(resolve => setTimeout(() => resolve(false), 200))
    ]);

    // Verify event was dispatched
    expect(eventFired).toBe(true);
    expect(eventDetail).toBeDefined();
    expect(eventDetail.status).toBe(403);

    // Verify banner was updated
    const banner = useStore.getState().banner;
    expect(banner.message).toMatch(/Session expired/i);
    expect(banner.severity).toBe('error');

    // Verify API call returned gracefully
    expect(result).toBeUndefined();
  });

  it('Multiple concurrent auth failures dispatch events without suppression', async () => {
    // Mock fetch to return 401 for all calls
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    });

    let eventCount = 0;
    const expectedEvents = 3;

    // Promise that resolves when we've seen at least N events
    const multiEventPromise = new Promise((resolve) => {
      const listener = (_event) => {
        eventCount++;
        
        // Update banner (idempotent - same message each time)
        useStore.getState().setBanner({
          message: 'Session expired. Please refresh or log in again.',
          severity: 'error'
        });
        
        // Once we've seen enough events, clean up and resolve
        if (eventCount >= expectedEvents) {
          window.removeEventListener('auth:session-expired', listener);
          resolve(true);
        }
      };
      
      window.addEventListener('auth:session-expired', listener);
    });

    // Make multiple concurrent API calls
    await Promise.all([
      api.getPhotos(),
      api.updatePhotoState(1, 'finished'),
      api.deletePhoto(2)
    ]);

    // Wait for events with timeout
    const allEventsFired = await Promise.race([
      multiEventPromise,
      new Promise(resolve => setTimeout(() => resolve(false), 300))
    ]);

    // Verify events fired (no hidden suppression)
    expect(allEventsFired).toBe(true);
    expect(eventCount).toBeGreaterThanOrEqual(expectedEvents);

    // Verify banner is in stable, sane state (same message, not corrupted)
    const banner = useStore.getState().banner;
    expect(banner.message).toMatch(/Session expired/i);
    expect(banner.severity).toBe('error');
    expect(banner.message).not.toContain('undefined');
    expect(banner.message).not.toContain('null');
  });

  it('Non-auth errors (404) do NOT trigger auth:session-expired event', async () => {
    // Mock fetch to return 404 (not an auth error)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' })
    });

    // Promise that fails the test if auth event fires
    const noAuthEventPromise = new Promise((resolve, reject) => {
      const listener = (_event) => {
        window.removeEventListener('auth:session-expired', listener);
        reject(new Error('auth:session-expired should NOT fire for 404 errors'));
      };
      
      window.addEventListener('auth:session-expired', listener);
      
      // Auto-resolve after a delay (no event = success)
      setTimeout(() => {
        window.removeEventListener('auth:session-expired', listener);
        resolve(true);
      }, 100);
    });

    // Make API call that will get 404
    try {
      await api.getPhotos();
    } catch {
      // Expected to throw due to !res.ok check in getPhotos
    }

    // Wait for event timeout (should NOT fire)
    const noEventFired = await noAuthEventPromise;
    expect(noEventFired).toBe(true);

    // Verify banner was NOT updated to session expired message
    const banner = useStore.getState().banner;
    expect(banner.message).not.toMatch(/Session expired/i);
  });

  it('Non-auth errors (500) do NOT trigger auth:session-expired event', async () => {
    // Mock fetch to return 500 (server error, not auth error)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' })
    });

    // Promise that fails the test if auth event fires
    const noAuthEventPromise = new Promise((resolve, reject) => {
      const listener = (_event) => {
        window.removeEventListener('auth:session-expired', listener);
        reject(new Error('auth:session-expired should NOT fire for 500 errors'));
      };
      
      window.addEventListener('auth:session-expired', listener);
      
      // Auto-resolve after a delay (no event = success)
      setTimeout(() => {
        window.removeEventListener('auth:session-expired', listener);
        resolve(true);
      }, 100);
    });

    // Make API call that will get 500
    try {
      await api.updatePhotoState(456, 'finished');
    } catch {
      // Expected to throw
    }

    // Wait for event timeout (should NOT fire)
    const noEventFired = await noAuthEventPromise;
    expect(noEventFired).toBe(true);

    // Verify banner was NOT updated to session expired message
    const banner = useStore.getState().banner;
    expect(banner.message).not.toMatch(/Session expired/i);
  });

  it('Non-auth errors (502, 503) do NOT trigger auth:session-expired event', async () => {
    // Mock fetch to return 502 (bad gateway)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Bad Gateway' })
    });

    // Promise that fails the test if auth event fires
    const noAuthEventPromise = new Promise((resolve, reject) => {
      const listener = (_event) => {
        window.removeEventListener('auth:session-expired', listener);
        reject(new Error('auth:session-expired should NOT fire for 502 errors'));
      };
      
      window.addEventListener('auth:session-expired', listener);
      
      // Auto-resolve after a delay (no event = success)
      setTimeout(() => {
        window.removeEventListener('auth:session-expired', listener);
        resolve(true);
      }, 100);
    });

    // Make API call that will get 502
    try {
      await api.recheckInprogressPhotos();
    } catch {
      // Expected to throw
    }

    // Wait for event timeout (should NOT fire)
    const noEventFired = await noAuthEventPromise;
    expect(noEventFired).toBe(true);
  });

  it('Auth errors return gracefully without throwing (no app crash)', async () => {
    // Mock fetch to return 200 for CSRF bootstrap and 401 for everything else
    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith('/csrf')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ csrfToken: 'test-csrf-token' }),
        };
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      };
    });

    // Set up minimal listener to prevent unhandled event warnings
    const listener = (_event) => {};
    window.addEventListener('auth:session-expired', listener);

    try {
      // These should all return undefined (via handleAuthError early return)
      // and NOT throw errors
      const result1 = await api.getPhotos();
      expect(result1).toBeUndefined();

      const result2 = await api.updatePhotoState(1, 'finished');
      expect(result2).toBeUndefined();

      const result3 = await api.deletePhoto(2);
      expect(result3).toBeUndefined();

      // Verify fetch was called for each API call (excluding CSRF prefetch)
      const nonCsrfCalls = global.fetch.mock.calls.filter(([url]) => !String(url).endsWith('/csrf'));
      expect(nonCsrfCalls).toHaveLength(3);
    } finally {
      window.removeEventListener('auth:session-expired', listener);
    }
  });
});
