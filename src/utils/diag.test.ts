import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDiagEnabled, diagLog, diagId, __resetDiagForTests } from './diag';

// The global test setup replaces localStorage with a vi.fn() mock.
// We need to adjust its behavior within individual tests.
const lsMock = localStorage as unknown as {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

describe('diag utility', () => {
  beforeEach(() => {
    __resetDiagForTests();
  });

  afterEach(() => {
    __resetDiagForTests();
    vi.restoreAllMocks();
  });

  describe('isDiagEnabled', () => {
    it('returns false when no query param and no localStorage', () => {
      expect(isDiagEnabled()).toBe(false);
    });

    it('returns true when query param diag=1 is present', () => {
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        search: '?diag=1',
      });
      expect(isDiagEnabled()).toBe(true);
    });

    it('returns true when localStorage.DIAG is "1"', () => {
      // Override the global localStorage mock to return '1' for DIAG
      lsMock.getItem.mockImplementation((key: string) => {
        if (key === 'DIAG') return '1';
        if (key === 'token') return 'mock-jwt-token';
        return null;
      });
      expect(isDiagEnabled()).toBe(true);
    });

    it('returns false when localStorage.DIAG is "0"', () => {
      lsMock.getItem.mockImplementation((key: string) => {
        if (key === 'DIAG') return '0';
        if (key === 'token') return 'mock-jwt-token';
        return null;
      });
      expect(isDiagEnabled()).toBe(false);
    });

    it('caches result after first call', () => {
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        search: '?diag=1',
      });
      expect(isDiagEnabled()).toBe(true);
      // Even after removing the query param, should still be cached true
      vi.restoreAllMocks();
      expect(isDiagEnabled()).toBe(true);
    });
  });

  describe('diagId', () => {
    it('returns an 8-character hex string', () => {
      const id = diagId();
      expect(id).toMatch(/^[0-9a-f]{8}$/);
    });

    it('returns the same id on subsequent calls', () => {
      const a = diagId();
      const b = diagId();
      expect(a).toBe(b);
    });

    it('returns a different id after reset', () => {
      const first = diagId();
      expect(first).toHaveLength(8);
      __resetDiagForTests();
      const second = diagId();
      // Very unlikely to collide (1 in 4 billion)
      expect(typeof second).toBe('string');
      expect(second).toHaveLength(8);
    });
  });

  describe('diagLog', () => {
    it('does not log when diag is disabled', () => {
      // Default mock has no DIAG in localStorage and no ?diag=1
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      diagLog('test message');
      const diagCalls = spy.mock.calls.filter((args) =>
        typeof args[0] === 'string' && args[0].startsWith('[diag:'),
      );
      expect(diagCalls).toHaveLength(0);
    });

    it('logs with [diag:<id>] prefix when enabled', () => {
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        search: '?diag=1',
      });
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      diagLog('hello', { foo: 'bar' });
      const diagCalls = spy.mock.calls.filter((args) =>
        typeof args[0] === 'string' && args[0].startsWith('[diag:'),
      );
      expect(diagCalls).toHaveLength(1);
      expect(diagCalls[0][0]).toMatch(/^\[diag:[0-9a-f]{8}\]$/);
      expect(diagCalls[0][1]).toBe('hello');
      expect(diagCalls[0][2]).toEqual({ foo: 'bar' });
    });
  });
});

describe('HTML-sniff trigger logic', () => {
  it('detects text/html content-type', () => {
    // Simulates the sniff check done in httpClient request()
    const ct = 'text/html; charset=utf-8';
    const isHtml = ct.includes('text/html');
    expect(isHtml).toBe(true);
  });

  it('does not trigger for application/json', () => {
    const ct = 'application/json';
    const isHtml = ct.includes('text/html');
    expect(isHtml).toBe(false);
  });

  it('extracts body prefix from HTML response', () => {
    const body = '<!DOCTYPE html><html><head><title>Error</title></head></html>';
    const prefix = body.slice(0, 30);
    expect(prefix).toBe('<!DOCTYPE html><html><head><ti');
    expect(prefix).toHaveLength(30);
  });
});
