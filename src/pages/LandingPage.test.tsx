import { render, fireEvent, waitFor, within } from '@testing-library/react';
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
    const { container } = renderWithRouter(<LandingPage />);
    const scope = within(container);
    expect(scope.getByRole('heading', { name: 'Lumina' })).toBeInTheDocument();
    expect(
      scope.getByText(/Upload a photo, and I'll tell you what it is, where it was, or what it's worth\./i)
    ).toBeInTheDocument();
    expect(scope.getByText(/Beta Access/i)).toBeInTheDocument();
    
    // Value props
    expect(scope.getByText('Scenery')).toBeInTheDocument();
    expect(scope.getByText(/Discover the exact location/i)).toBeInTheDocument();
    expect(scope.getByText('Collectibles')).toBeInTheDocument();
    expect(scope.getByText(/Get instant valuations/i)).toBeInTheDocument();
    expect(scope.getByText('Secure')).toBeInTheDocument();
    expect(scope.getByText(/Your memories are private/i)).toBeInTheDocument();

    expect(scope.getByText('I have an account')).toBeInTheDocument();
    expect(scope.getByText('Request Access')).toBeInTheDocument();
  });

  it('switches to contact form when "Request Access" is clicked', () => {
    const { container } = renderWithRouter(<LandingPage />);
    const scope = within(container);
    fireEvent.click(scope.getByText('Request Access'));
    expect(scope.getByText('Contact Us')).toBeInTheDocument();
    expect(scope.getByLabelText(/Name/i)).toBeInTheDocument();
  });

  it('switches to login form when "I have an account" is clicked', () => {
    const { container } = renderWithRouter(<LandingPage />);
    const scope = within(container);
    fireEvent.click(scope.getByText('I have an account'));
    expect(scope.getByTestId('login-form')).toBeInTheDocument();
  });

  it('handles successful form submission', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { container } = renderWithRouter(<LandingPage />);
    const scope = within(container);
    fireEvent.click(scope.getByText('Request Access'));

    fireEvent.change(scope.getByLabelText(/Name/i), { target: { value: 'John Doe' } });
    fireEvent.change(scope.getByLabelText(/Email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(scope.getByLabelText(/Access request/i), { target: { value: 'Hello!' } });

    fireEvent.click(scope.getByText('Send Message'));

    expect(scope.getByText('Sending...')).toBeInTheDocument();
    expect(scope.getByRole('button', { name: /sending/i })).toBeDisabled();

    await waitFor(() => {
      expect(scope.getByText(/Message sent successfully/i)).toBeInTheDocument();
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

    const { container } = renderWithRouter(<LandingPage />);
    const scope = within(container);
    fireEvent.click(scope.getByText('Request Access'));

    fireEvent.change(scope.getByLabelText(/Name/i), { target: { value: 'John Doe' } });
    fireEvent.change(scope.getByLabelText(/Email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(scope.getByLabelText(/Access request/i), { target: { value: 'Hello!' } });

    fireEvent.click(scope.getByText('Send Message'));

    await waitFor(() => {
      expect(scope.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('handles rate limit errors correctly', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 429,
    });

    const { container } = renderWithRouter(<LandingPage />);
    const scope = within(container);
    fireEvent.click(scope.getByText('Request Access'));

    fireEvent.change(scope.getByLabelText(/Name/i), { target: { value: 'John Doe' } });
    fireEvent.change(scope.getByLabelText(/Email/i), { target: { value: 'john@example.com' } });
    fireEvent.change(scope.getByLabelText(/Access request/i), { target: { value: 'Hello!' } });

    fireEvent.click(scope.getByText('Send Message'));

    await waitFor(() => {
      expect(scope.getByText(/Too many requests/i)).toBeInTheDocument();
    });
  });

  it('displays error message from URL hash', () => {
    const { container } = renderWithRouter(<LandingPage />, { route: '/#error=access_denied&error_description=Test+Error' });
    const scope = within(container);
    expect(scope.getByText('Test Error')).toBeInTheDocument();
  });

  it('displays friendly message for otp_expired error', () => {
    const { container } = renderWithRouter(<LandingPage />, { route: '/#error=access_denied&error_code=otp_expired' });
    const scope = within(container);
    expect(scope.getByText(/Your invite link has expired/i)).toBeInTheDocument();
  });
});
