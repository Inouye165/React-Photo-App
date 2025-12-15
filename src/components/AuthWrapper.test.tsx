import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthWrapper from './AuthWrapper';

const mockUseAuth = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    ...mockUseAuth(),
    login: vi.fn(async () => ({ success: false, error: 'not used in AuthWrapper tests' })),
    resetPassword: vi.fn(async () => ({ success: false, error: 'not used in AuthWrapper tests' })),
  }),
}));

describe('AuthWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
  });

  it('Unauthenticated: renders LandingPage text', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });

    render(
      <AuthWrapper>
        <div>Protected Content</div>
      </AuthWrapper>
    );

    expect(screen.getByRole('heading', { name: 'Lumina' })).toBeInTheDocument();
  });

  it('Authenticated: renders children', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' }, loading: false });

    render(
      <AuthWrapper>
        <div>Protected Content</div>
      </AuthWrapper>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('Loading: renders Loading... spinner', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });

    render(
      <AuthWrapper>
        <div>Protected Content</div>
      </AuthWrapper>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
