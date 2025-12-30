import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ConfirmInvitePage from './ConfirmInvitePage';

describe('ConfirmInvitePage', () => {
  const originalAssign = window.location.assign;

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');

    // JSDOM allows spying on location.assign in most setups.
    // We still patch it defensively in case it is non-configurable.
    try {
      window.location.assign = vi.fn();
    } catch {
      // noop
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();

    try {
      window.location.assign = originalAssign;
    } catch {
      // noop
    }
  });

  it('renders and continues to the confirmation URL on click', () => {
    const encoded = encodeURIComponent(
      'https://project.supabase.co/auth/v1/verify?token=abc&type=invite&redirect_to=https://example.com'
    );

    render(
      <MemoryRouter initialEntries={[`/confirm-invite?confirmation_url=${encoded}`]}>
        <Routes>
          <Route path="/confirm-invite" element={<ConfirmInvitePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Accept your invite')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const expected = new URL('https://project.supabase.co/auth/v1/verify?token=abc&type=invite&redirect_to=https://example.com');
    expected.searchParams.set('redirect_to', `${window.location.origin}/reset-password`);

    expect(window.location.assign).toHaveBeenCalledWith(expected.toString());
  });

  it('disables continue when confirmation_url is missing', () => {
    render(
      <MemoryRouter initialEntries={[`/confirm-invite`]}>
        <Routes>
          <Route path="/confirm-invite" element={<ConfirmInvitePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});
