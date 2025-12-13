import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSessionFromUrl: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token', refresh_token: 'mock-refresh-token' } },
        error: null,
      }),
      setSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token', refresh_token: 'mock-refresh-token' } },
        error: null,
      }),
    },
  },
}));

import JoinPage from './JoinPage';

// Helper to mock window.location.hash
function setHash(hash: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hash },
    writable: true,
  });
}

describe('JoinPage', () => {
  afterEach(() => {
    setHash('');
  });

  it('shows verifying state initially', () => {
    setHash('#access_token=abc123');
    render(<JoinPage />);
    expect(screen.getByText(/verifying/i)).toBeInTheDocument();
  });

  it('shows welcome if access_token present', async () => {
    setHash('#access_token=abc123');
    render(<JoinPage />);
    await waitFor(() => expect(screen.getByText(/welcome/i)).toBeInTheDocument());
  });

  it('shows error if no access_token', async () => {
    setHash('');
    render(<JoinPage />);
    await waitFor(() => expect(screen.getByText(/invalid or expired/i)).toBeInTheDocument());
  });
});
