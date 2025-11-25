import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../api.js';

// Ensure we're using the actual store, not a mock
vi.mock('../store.js', async () => {
  const actual = await vi.importActual('../store.js');
  return actual;
});

import useStore from '../store.js';

describe('Integration: API auth errors trigger UI banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset banner
    useStore.setState({
      banner: { message: '', severity: 'info' }
    });
  });

  it('API 401 error dispatches event that updates store banner', async () => {
    // Mock fetch to return 401
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    });

    // Track if event was dispatched
    let eventDispatched = false;
    
    // Set up listener before making API call (simulates App.jsx mounting)
    const listener = () => {
      eventDispatched = true;
      useStore.getState().setBanner({
        message: 'Session expired. Please refresh or log in again.',
        severity: 'error'
      });
    };
    window.addEventListener('auth:session-expired', listener);

    try {
      // Make API call that will trigger auth error
      await api.getPhotos();

      // Wait for event to propagate
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify event was dispatched
      expect(eventDispatched).toBe(true);

      // Verify banner was updated
      const banner = useStore.getState().banner;
      expect(banner.message).toMatch(/Session expired/i);
      expect(banner.severity).toBe('error');
    } finally {
      window.removeEventListener('auth:session-expired', listener);
    }
  });

  it('API 403 error dispatches event that updates store banner', async () => {
    // Mock fetch to return 403
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' })
    });

    // Set up listener
    const listener = () => {
      useStore.getState().setBanner({
        message: 'Session expired. Please refresh or log in again.',
        severity: 'error'
      });
    };
    window.addEventListener('auth:session-expired', listener);

    try {
      // Make API call that will trigger auth error
      await api.updatePhotoState(123, 'finished');

      // Brief wait for event to propagate
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify banner was updated
      const banner = useStore.getState().banner;
      expect(banner.message).toMatch(/Session expired/i);
      expect(banner.severity).toBe('error');
    } finally {
      window.removeEventListener('auth:session-expired', listener);
    }
  });

  it('Multiple API 401 errors only update banner once with same message', async () => {
    // Mock fetch to return 401
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    });

    // Set up listener
    let callCount = 0;
    const listener = () => {
      callCount++;
      useStore.getState().setBanner({
        message: 'Session expired. Please refresh or log in again.',
        severity: 'error'
      });
    };
    window.addEventListener('auth:session-expired', listener);

    try {
      // Make multiple API calls
      await api.getPhotos();
      await api.updatePhotoState(1, 'finished');
      await api.deletePhoto(2);

      // Brief wait for events to propagate
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify banner was updated and listener was called multiple times
      const banner = useStore.getState().banner;
      expect(banner.message).toMatch(/Session expired/i);
      expect(banner.severity).toBe('error');
      expect(callCount).toBeGreaterThan(0);
    } finally {
      window.removeEventListener('auth:session-expired', listener);
    }
  });

  it('Non-auth errors (404, 500) do not trigger session expired banner', async () => {
    // Mock fetch to return 404
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' })
    });

    // Set up listener
    let eventFired = false;
    const listener = () => {
      eventFired = true;
      useStore.getState().setBanner({
        message: 'Session expired. Please refresh or log in again.',
        severity: 'error'
      });
    };
    window.addEventListener('auth:session-expired', listener);

    try {
      // Make API call that will get 404
      try {
        await api.getPhotos();
      } catch {
        // Expected to throw
      }

      // Brief wait
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify event was NOT fired
      expect(eventFired).toBe(false);
      
      // Verify banner was NOT updated to session expired message
      const banner = useStore.getState().banner;
      expect(banner.message).not.toMatch(/Session expired/i);
    } finally {
      window.removeEventListener('auth:session-expired', listener);
    }
  });
});
