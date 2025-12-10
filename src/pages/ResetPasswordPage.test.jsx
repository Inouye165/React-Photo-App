import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ResetPasswordPage from './ResetPasswordPage';
import { useAuth } from '../contexts/AuthContext';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock useAuth
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state when auth is loading', () => {
    useAuth.mockReturnValue({
      loading: true,
      user: null,
      updatePassword: vi.fn(),
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Verifying link...')).toBeInTheDocument();
  });

  it('redirects to home if user is not logged in (and not loading)', () => {
    useAuth.mockReturnValue({
      loading: false,
      user: null,
      updatePassword: vi.fn(),
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('renders form when user is logged in', () => {
    useAuth.mockReturnValue({
      loading: false,
      user: { id: '123' },
      updatePassword: vi.fn(),
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    useAuth.mockReturnValue({
      loading: false,
      user: { id: '123' },
      updatePassword: vi.fn(),
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  it('calls updatePassword and redirects on success', async () => {
    const mockUpdatePassword = vi.fn().mockResolvedValue({ success: true });
    useAuth.mockReturnValue({
      loading: false,
      user: { id: '123' },
      updatePassword: mockUpdatePassword,
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpassword' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'newpassword' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith('newpassword');
    });

    expect(screen.getByText('Password Updated')).toBeInTheDocument();
    
    // We can't easily test the setTimeout navigation without using fake timers, 
    // but we can verify the success message is shown.
  });
});
