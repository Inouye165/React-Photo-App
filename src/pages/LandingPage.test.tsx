import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LandingPage from './LandingPage';

// Mock LoginForm since we don't need to test its internals here
vi.mock('../components/LoginForm', () => ({
  default: () => <div data-testid="login-form">Login Form</div>
}));

describe('LandingPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the landing page correctly', () => {
    render(<LandingPage />);
    expect(screen.getByText(/Crafting the future/i)).toBeInTheDocument();
    expect(screen.getByText('I have an account')).toBeInTheDocument();
    expect(screen.getByText('Request Access')).toBeInTheDocument();
  });

  it('switches to contact form when "Request Access" is clicked', () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByText('Request Access'));
    expect(screen.getByText('Contact Us')).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
  });

  it('switches to login form when "I have an account" is clicked', () => {
    render(<LandingPage />);
    fireEvent.click(screen.getByText('I have an account'));
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('handles successful form submission', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<LandingPage />);
    fireEvent.click(screen.getByText('Request Access'));

    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'Hello!' } });

    fireEvent.click(screen.getByText('Send Message'));

    expect(screen.getByText('Sending...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText(/Message sent successfully/i)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/public/contact'), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        name: 'John Doe',
        email: 'john@example.com',
        interest: 'general',
        message: 'Hello!'
      })
    }));
  });

  it('handles API errors correctly', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    render(<LandingPage />);
    fireEvent.click(screen.getByText('Request Access'));

    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'Hello!' } });

    fireEvent.click(screen.getByText('Send Message'));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('handles rate limit errors correctly', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 429,
    });

    render(<LandingPage />);
    fireEvent.click(screen.getByText('Request Access'));

    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/Message/i), { target: { value: 'Hello!' } });

    fireEvent.click(screen.getByText('Send Message'));

    await waitFor(() => {
      expect(screen.getByText(/Too many requests/i)).toBeInTheDocument();
    });
  });
});
