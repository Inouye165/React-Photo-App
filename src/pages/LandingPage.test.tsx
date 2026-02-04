import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from './LandingPage';

// Mock LoginForm since we don't need to test its internals here
vi.mock('../components/LoginForm.tsx', () => ({
  default: () => <div data-testid="login-form">Login Form</div>
}));

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithRouter = (ui: React.ReactElement, { route = '/' } = {}) => {
    return render(
      <MemoryRouter initialEntries={[route]}>
        {ui}
      </MemoryRouter>
    );
  };

  it('renders the landing page correctly', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByRole('heading', { name: 'Lumina' })).toBeInTheDocument();
    expect(
      screen.getByText(/Upload a photo, and I'll tell you what it is, where it was, or what it's worth\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Beta Access/i)).toBeInTheDocument();
    
    // Value props
    expect(screen.getByText('Scenery')).toBeInTheDocument();
    expect(screen.getByText(/Discover the exact location/i)).toBeInTheDocument();
    expect(screen.getByText('Collectibles')).toBeInTheDocument();
    expect(screen.getByText(/Get instant valuations/i)).toBeInTheDocument();
    expect(screen.getByText('Secure')).toBeInTheDocument();
    expect(screen.getByText(/Your memories are private/i)).toBeInTheDocument();

    expect(screen.getByText('I have an account')).toBeInTheDocument();
    expect(screen.getByText('Request Access')).toBeInTheDocument();
  });

  it('switches to contact form when "Request Access" is clicked', () => {
    renderWithRouter(<LandingPage />);
    fireEvent.click(screen.getByText('Request Access'));
    expect(screen.getByText('Contact Us')).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
  });

  it('switches to login form when "I have an account" is clicked', () => {
    renderWithRouter(<LandingPage />);
    fireEvent.click(screen.getByText('I have an account'));
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('handles successful form submission', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    renderWithRouter(<LandingPage />);
    fireEvent.click(screen.getByText('Request Access'));

    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/Access request/i), { target: { value: 'Hello!' } });

    fireEvent.click(screen.getByText('Send Message'));

    expect(screen.getByText('Sending...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText(/Message sent successfully/i)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/public/contact'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          name: 'John Doe',
          email: 'john@example.com',
          subject: 'Access Request: General Inquiry',
          message: 'Hello!'
        })
      })
    );
  });

  it('handles API errors correctly', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    renderWithRouter(<LandingPage />);
    fireEvent.click(screen.getByText('Request Access'));

    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/Access request/i), { target: { value: 'Hello!' } });

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

    renderWithRouter(<LandingPage />);
    fireEvent.click(screen.getByText('Request Access'));

    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByLabelText(/Access request/i), { target: { value: 'Hello!' } });

    fireEvent.click(screen.getByText('Send Message'));

    await waitFor(() => {
      expect(screen.getByText(/Too many requests/i)).toBeInTheDocument();
    });
  });

  it('displays error message from URL hash', () => {
    renderWithRouter(<LandingPage />, { route: '/#error=access_denied&error_description=Test+Error' });
    expect(screen.getByText('Test Error')).toBeInTheDocument();
  });

  it('displays friendly message for otp_expired error', () => {
    renderWithRouter(<LandingPage />, { route: '/#error=access_denied&error_code=otp_expired' });
    expect(screen.getByText(/Your invite link has expired/i)).toBeInTheDocument();
  });
});
