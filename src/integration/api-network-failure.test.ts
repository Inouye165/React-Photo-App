// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from '../api';

// Make sure we're using the actual store, not a mock
vi.mock('../store', async () => {
  const actual = await vi.importActual('../store');
  return actual;
});

import useStore from '../store';

describe('Integration: Network failure handling', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset network state
    api.__resetNetworkState();
    
    // Clear getPhotos cache
    if (globalThis.__getPhotosInflight) {
      globalThis.__getPhotosInflight.clear();
    }
    
    // Reset banner
    useStore.setState({
      banner: { message: '', severity: 'info' }
    });

    // Spy on console.error to verify logging
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (consoleErrorSpy) {
      consoleErrorSpy.mockRestore();
    }
  });

  it('should log and throw network errors when backend is unreachable', async () => {
    // Mock fetch to throw (simulates ECONNREFUSED, DNS failure, etc.)
    const networkError = new TypeError('fetch failed');
    global.fetch = vi.fn().mockRejectedValue(networkError);

    try {
      await api.getPhotos();
      expect.fail('Should have thrown network error');
    } catch (err) {
      // Verify error is thrown (not silently swallowed)
      expect(err).toBeDefined();
      expect(err.message).toMatch(/network error|fetch failed/i);
      expect(err.isNetworkError).toBe(true);
      
      // Verify error is logged with context
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Network] Backend request failed',
        expect.objectContaining({
          url: expect.any(String),
          error: expect.any(String)
        })
      );
    }
  });

  it('should dispatch network:unavailable event when backend is down', async () => {
    // Verify test environment supports events
    if (typeof window === 'undefined' || !window.addEventListener) {
      console.warn('Test environment does not support window.addEventListener');
      return;
    }
    
    let eventDetail = null;
    
    // Use a promise to wait for the event
    const eventPromise = new Promise((resolve) => {
      const listener = (event) => {
        eventDetail = event.detail;
        
        // Simulate what MainLayout does - update banner
        useStore.getState().setBanner({
          message: "We're having trouble connecting to the server right now. Please try again in a moment.",
          severity: 'error'
        });
        
        window.removeEventListener('network:unavailable', listener);
        resolve(true);
      };
      
      // Add listener BEFORE mocking fetch
      window.addEventListener('network:unavailable', listener);
    });
    
    // Mock fetch to throw AFTER listener is added
    global.fetch = vi.fn().mockRejectedValue(new TypeError('ECONNREFUSED'));

    try {
      await api.getPhotos();
    } catch {
      // Expected to throw
    }

    // Wait for event (with timeout)
    const eventFired = await Promise.race([
      eventPromise,
      new Promise(resolve => setTimeout(() => resolve(false), 200))
    ]);

    // Verify event was dispatched
    expect(eventFired).toBe(true);
    expect(eventDetail).toBeDefined();
    expect(eventDetail.error).toBeDefined();

    // Verify banner was updated
    const banner = useStore.getState().banner;
    expect(banner.message).toMatch(/trouble connecting/i);
    expect(banner.severity).toBe('error');
  });

  it('should not dispatch network:unavailable for HTTP errors (4xx, 5xx)', async () => {
    // Mock fetch to return HTTP error (not network error)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' })
    });

    let eventFired = false;
    const listener = () => {
      eventFired = true;
    };
    window.addEventListener('network:unavailable', listener);

    try {
      await api.getPhotos();
    } catch {
      // Expected to throw due to !res.ok check
    }

    // Wait briefly
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify network:unavailable event was NOT fired (this is an HTTP error, not network error)
    expect(eventFired).toBe(false);

    window.removeEventListener('network:unavailable', listener);
  });

  it('should dispatch network:recovered when connection is restored', async () => {
    let networkUnavailableFired = false;

    const unavailablePromise = new Promise((resolve) => {
      const unavailableListener = () => {
        networkUnavailableFired = true;
        window.removeEventListener('network:unavailable', unavailableListener);
        resolve();
      };
      window.addEventListener('network:unavailable', unavailableListener);
    });

    const recoveredPromise = new Promise((resolve) => {
      const recoveredListener = () => {
        useStore.getState().setBanner({
          message: 'Connection restored.',
          severity: 'success'
        });
        window.removeEventListener('network:recovered', recoveredListener);
        resolve(true);
      };
      window.addEventListener('network:recovered', recoveredListener);
    });

    // First call fails (network down)
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Network failure'));
    
    try {
      await api.getPhotos();
    } catch {
      // Expected
    }

    await Promise.race([
      unavailablePromise,
      new Promise(resolve => setTimeout(() => resolve(false), 200))
    ]);
    expect(networkUnavailableFired).toBe(true);

    // Clear cache before second call
    if (globalThis.__getPhotosInflight) {
      globalThis.__getPhotosInflight.clear();
    }

    // Second call succeeds (network recovered)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, photos: [] })
    });

    try {
      await api.getPhotos();
    } catch {
      // Should not throw
    }

    const networkRecoveredFired = await Promise.race([
      recoveredPromise,
      new Promise(resolve => setTimeout(() => resolve(false), 200))
    ]);
    
    // Verify recovery event was dispatched
    expect(networkRecoveredFired).toBe(true);

    // Verify banner shows recovery message
    const banner = useStore.getState().banner;
    expect(banner.message).toMatch(/connection restored/i);
    expect(banner.severity).toBe('success');
  });

  it('should handle multiple concurrent network failures gracefully', async () => {
    // Mock fetch to throw
    global.fetch = vi.fn().mockRejectedValue(new TypeError('ECONNREFUSED'));

    let eventCount = 0;
    const listener = () => {
      eventCount++;
    };
    window.addEventListener('network:unavailable', listener);

    // Make multiple concurrent API calls
    const promises = [
      api.getPhotos().catch(() => {}),
      api.getDependencyStatus().catch(() => {}),
      api.recheckPhotoAI(1).catch(() => {})
    ];

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Event should only be fired once (not for each failure)
    // This prevents banner spam
    expect(eventCount).toBe(1);

    window.removeEventListener('network:unavailable', listener);
  });

  it('should preserve auth error handling when network is down', async () => {
    // Even if network errors exist, auth errors should still be handled properly
    // This test verifies network error handling doesn't break existing auth error flow
    
    let authEventFired = false;
    const authListener = () => {
      authEventFired = true;
    };
    window.addEventListener('auth:session-expired', authListener);

    // Mock fetch to return 401 (not a network error, HTTP error)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    });

    try {
      await api.getPhotos();
    } catch {
      // Expected
    }

    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify auth event was dispatched (auth handling still works)
    expect(authEventFired).toBe(true);

    window.removeEventListener('auth:session-expired', authListener);
  });
});
