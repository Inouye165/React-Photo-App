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
      session: null,
      profile: null,
      updatePassword: vi.fn(),
      updateProfile: vi.fn(),
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Loading profile...')).toBeInTheDocument();
  });

  it('redirects to home if accessed without an active session', () => {
    useAuth.mockReturnValue({
      loading: false,
      user: null,
      session: null,
      profile: null,
      updatePassword: vi.fn(),
      updateProfile: vi.fn(),
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('renders reset password form for existing user (has username)', () => {
    useAuth.mockReturnValue({
      loading: false,
      user: { id: '123' },
      session: { access_token: 'token', user: { id: '123' } },
      profile: { has_set_username: true },
      updatePassword: vi.fn(),
      updateProfile: vi.fn(),
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  });

  it('renders create account form for new user (no username)', () => {
    useAuth.mockReturnValue({
      loading: false,
      user: { id: '123' },
      session: { access_token: 'token', user: { id: '123' } },
      profile: { has_set_username: false },
      updatePassword: vi.fn(),
      updateProfile: vi.fn(),
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Create Account')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    useAuth.mockReturnValue({
      loading: false,
      user: { id: '123' },
      session: { access_token: 'token', user: { id: '123' } },
      profile: { has_set_username: true },
      updatePassword: vi.fn(),
      updateProfile: vi.fn(),
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

  it('calls updatePassword and redirects on success (existing user)', async () => {
    const mockUpdatePassword = vi.fn().mockResolvedValue({ success: true });
    useAuth.mockReturnValue({
      loading: false,
      user: { id: '123' },
      session: { access_token: 'token', user: { id: '123' } },
      profile: { has_set_username: true },
      updatePassword: mockUpdatePassword,
      updateProfile: vi.fn(),
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith('password123');
      expect(screen.getByText('Password Updated')).toBeInTheDocument();
    });
  });

  it('calls updatePassword AND updateProfile on success (new user)', async () => {
    const mockUpdatePassword = vi.fn().mockResolvedValue({ success: true });
    const mockUpdateProfile = vi.fn().mockResolvedValue({ success: true });
    
    useAuth.mockReturnValue({
      loading: false,
      user: { id: '123' },
      session: { access_token: 'token', user: { id: '123' } },
      profile: { has_set_username: false },
      updatePassword: mockUpdatePassword,
      updateProfile: mockUpdateProfile,
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith('password123');
      expect(mockUpdateProfile).toHaveBeenCalledWith('newuser');
      expect(screen.getByText('Account Created')).toBeInTheDocument();
    });
  });

  it('rejects passwords shorter than 6 characters', async () => {
    const mockUpdatePassword = vi.fn();
    useAuth.mockReturnValue({
      loading: false,
      user: { id: '123' },
      session: { access_token: 'token', user: { id: '123' } },
      profile: { has_set_username: true },
      updatePassword: mockUpdatePassword,
      updateProfile: vi.fn(),
    });

    render(
      <BrowserRouter>
        <ResetPasswordPage />
      </BrowserRouter>
    );

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('shows Supabase errors returned by updatePassword', async () => {
    const mockUpdatePassword = vi.fn().mockResolvedValue({ success: false, error: 'Server error' });
    useAuth.mockReturnValue({
      loading: false,
      user: { id: '123' },
      session: { access_token: 'token', user: { id: '123' } },
      profile: { has_set_username: true },
      updatePassword: mockUpdatePassword,
      updateProfile: vi.fn(),
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

    expect(screen.getByText('Server error')).toBeInTheDocument();
  });
});