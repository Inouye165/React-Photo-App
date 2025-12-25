import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';

// Make sure we're using the actual store, not a mock
vi.mock('./store', async () => {
  const actual = await vi.importActual('./store');
  return actual;
});

import useStore from './store';

// Lightweight test component that mimics App's session expiration listener
function SessionExpirationTestComponent() {
  const setBanner = useStore((state) => state.setBanner);

  useEffect(() => {
    const handleSessionExpired = () => {
      setBanner({ 
        message: 'Session expired. Please refresh or log in again.', 
        severity: 'error' 
      });
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);

    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
    };
  }, [setBanner]);

  return <div data-testid="session-test">Session Test Component</div>;
}

describe('App - Session Expiration Event Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear banner state using setState
    useStore.setState({
      banner: { message: '', severity: 'info' }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('displays session expired banner when global auth event fires', async () => {
    render(<SessionExpirationTestComponent />);

    // Get initial banner state
    const initialMessage = useStore.getState().banner?.message || '';

    // Dispatch the session expired event
    act(() => {
      window.dispatchEvent(new CustomEvent('auth:session-expired', {
        detail: { status: 401 }
      }));
    });

    // Check that the banner was set in the store
    await waitFor(() => {
      const banner = useStore.getState().banner;
      expect(banner).toBeDefined();
      expect(banner.message).toMatch(/Session expired/i);
      expect(banner.message).toContain('Please refresh or log in again');
      expect(banner.message).not.toBe(initialMessage);
      expect(banner.severity).toBe('error');
    });
  });

  it('cleans up event listener on unmount to prevent memory leaks', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<SessionExpirationTestComponent />);

    await waitFor(() => {
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'auth:session-expired',
        expect.any(Function)
      );
    });

    // Get the listener function that was registered
    const listenerCall = addEventListenerSpy.mock.calls.find(
      call => call[0] === 'auth:session-expired'
    );
    const listener = listenerCall?.[1];

    unmount();

    // Verify the same listener was removed
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'auth:session-expired',
      listener
    );

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it('handles multiple session expired events without errors', async () => {
    render(<SessionExpirationTestComponent />);

    // Dispatch multiple events
    act(() => {
      window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { status: 401 } }));
      window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { status: 403 } }));
    });

    // Verify the banner is set
    await waitFor(() => {
      const banner = useStore.getState().banner;
      expect(banner).toBeDefined();
      expect(banner.message).toMatch(/Session expired/i);
      expect(banner.severity).toBe('error');
    });
  });

  it('does not interfere with other custom events', async () => {
    render(<SessionExpirationTestComponent />);

    // Clear banner first using setState
    act(() => {
      useStore.setState({
        banner: { message: '', severity: 'info' }
      });
    });

    // Dispatch a different custom event
    act(() => {
      window.dispatchEvent(new CustomEvent('some:other:event', {
        detail: { data: 'test' }
      }));
    });

    // Banner should remain empty
    const banner = useStore.getState().banner;
    expect(banner.message).toBe('');
  });

  it('event listener works correctly with status 403', async () => {
    render(<SessionExpirationTestComponent />);

    // Dispatch 403 event
    act(() => {
      window.dispatchEvent(new CustomEvent('auth:session-expired', {
        detail: { status: 403 }
      }));
    });

    // Check that the banner was set
    await waitFor(() => {
      const banner = useStore.getState().banner;
      expect(banner).toBeDefined();
      expect(banner.message).toMatch(/Session expired/i);
      expect(banner.severity).toBe('error');
    });
  });
});
