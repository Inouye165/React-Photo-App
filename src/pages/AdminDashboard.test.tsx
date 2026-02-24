// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let mockAuthState: any = {
  user: { app_metadata: { role: 'admin' } },
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

const requestMock = vi.fn();
vi.mock('../api/httpClient', () => ({
  request: (args: any) => requestMock(args),
}));

vi.mock('../api/auth', () => ({
  getAuthHeadersAsync: vi.fn(async () => ({ Authorization: 'Bearer test' })),
}));

import AdminDashboard from './AdminDashboard';

describe('AdminDashboard - Feedback tab', () => {
  beforeEach(() => {
    requestMock.mockReset();
    mockAuthState = { user: { app_metadata: { role: 'admin' } } };
  });

  it('shows Feedback tab and fetches when clicked', async () => {
    requestMock.mockResolvedValue({ success: true, data: [], total: 0, limit: 50, offset: 0 });

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    expect(screen.getByText('Feedback')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Feedback'));

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalled();
    });

    const call = requestMock.mock.calls.find(Boolean)?.[0];
    expect(call.path).toBe('/api/admin/feedback');
    expect(call.method).toBe('GET');
  });

  it('opens game suggestions quick link and fetches feedback', async () => {
    requestMock.mockResolvedValue({ success: true, data: [], total: 0, limit: 50, offset: 0 });

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'View Game Suggestions' }));

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalled();
    });

    const call = requestMock.mock.calls.find(Boolean)?.[0];
    expect(call.path).toBe('/api/admin/feedback');
    expect(call.method).toBe('GET');
  });
});

describe('AdminDashboard - Access requests tab', () => {
  beforeEach(() => {
    requestMock.mockReset();
    mockAuthState = { user: { app_metadata: { role: 'admin' } } };
  });

  it('fetches access requests when clicked', async () => {
    requestMock.mockResolvedValue({ success: true, data: [], total: 0, limit: 50, offset: 0 });

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Access Requests'));

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalled();
    });

    const call = requestMock.mock.calls.find(Boolean)?.[0];
    expect(call.path).toBe('/api/admin/access-requests');
    expect(call.method).toBe('GET');
  });
});

describe('AdminDashboard - Activity tab', () => {
  beforeEach(() => {
    requestMock.mockReset();
    mockAuthState = { user: { app_metadata: { role: 'admin' } } };
  });

  it('fetches activity logs when clicked', async () => {
    requestMock.mockResolvedValue({ success: true, data: [], total: 0, limit: 50, offset: 0 });

    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Activity Log'));

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalled();
    });

    const call = requestMock.mock.calls.find(Boolean)?.[0];
    expect(call.path).toBe('/api/admin/activity');
    expect(call.method).toBe('GET');
  });
});
