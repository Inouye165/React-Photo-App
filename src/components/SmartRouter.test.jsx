import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import SmartRouter from './SmartRouter.jsx';

// Track navigation
const mockNavigate = vi.fn();

// Mock react-router-dom's useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock AuthContext
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    loading: false,
    cookieReady: true,
  })),
}));

// Mock API - will be configured per test
const mockGetPhotoStatus = vi.fn();
vi.mock('../api', () => ({
  getPhotoStatus: () => mockGetPhotoStatus(),
  API_BASE_URL: 'http://localhost:3001',
}));

// Helper component to track current location
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

// Wrapper that provides routing context
function TestWrapper({ children, initialRoute = '/' }) {
  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/" element={children} />
        <Route path="/upload" element={<div>Upload Page</div>} />
        <Route path="/gallery" element={<div>Gallery Page</div>} />
      </Routes>
      <LocationDisplay />
    </MemoryRouter>
  );
}

describe('SmartRouter Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Smart Routing Logic', () => {
    it('Case A: redirects to /upload when user has no photos (total: 0)', async () => {
      // Mock API response: no photos
      mockGetPhotoStatus.mockResolvedValueOnce({
        success: true,
        working: 0,
        inprogress: 0,
        finished: 0,
        total: 0,
      });

      render(
        <TestWrapper>
          <SmartRouter />
        </TestWrapper>
      );

      // Should show loading initially
      expect(screen.getByRole('status')).toBeInTheDocument();

      // Wait for navigation
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/upload', { replace: true });
      });
    });

    it('Case B: redirects to /gallery when user has photos (including working)', async () => {
      // Mock API response: has working photos
      mockGetPhotoStatus.mockResolvedValueOnce({
        success: true,
        working: 5,
        inprogress: 2,
        finished: 0,
        total: 7,
      });

      render(
        <TestWrapper>
          <SmartRouter />
        </TestWrapper>
      );

      // Wait for navigation
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/gallery', { replace: true });
      });
    });

    it('Case C: redirects to /gallery when user has only inprogress photos', async () => {
      // Mock API response: no working, has inprogress
      mockGetPhotoStatus.mockResolvedValueOnce({
        success: true,
        working: 0,
        inprogress: 3,
        finished: 0,
        total: 3,
      });

      render(
        <TestWrapper>
          <SmartRouter />
        </TestWrapper>
      );

      // Wait for navigation
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/gallery', { replace: true });
      });
    });

    it('redirects to /gallery when user has only finished photos', async () => {
      // Mock API response: only finished photos
      mockGetPhotoStatus.mockResolvedValueOnce({
        success: true,
        working: 0,
        inprogress: 0,
        finished: 10,
        total: 10,
      });

      render(
        <TestWrapper>
          <SmartRouter />
        </TestWrapper>
      );

      // Wait for navigation
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/gallery', { replace: true });
      });
    });

    it('redirects to /gallery when photos exist (mixed states)', async () => {
      // Mock API response: has both working and inprogress
      mockGetPhotoStatus.mockResolvedValueOnce({
        success: true,
        working: 2,
        inprogress: 5,
        finished: 3,
        total: 10,
      });

      render(
        <TestWrapper>
          <SmartRouter />
        </TestWrapper>
      );

      // Should navigate to working, not inprogress
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/gallery', { replace: true });
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner while fetching photo status', async () => {
      // Mock API that takes time
      mockGetPhotoStatus.mockImplementation(() => 
        new Promise((resolve) => setTimeout(() => resolve({
          success: true,
          working: 0,
          inprogress: 0,
          finished: 0,
          total: 0,
        }), 100))
      );

      render(
        <TestWrapper>
          <SmartRouter />
        </TestWrapper>
      );

      // Should show loading state
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('redirects to /upload on API error as safe fallback', async () => {
      // Mock API error
      mockGetPhotoStatus.mockRejectedValueOnce(new Error('Network error'));

      render(
        <TestWrapper>
          <SmartRouter />
        </TestWrapper>
      );

      // Wait for error handling and fallback navigation
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/upload', { replace: true });
      }, { timeout: 3000 });
    });

    it('handles API returning success: false gracefully', async () => {
      // Mock API returning unsuccessful response
      mockGetPhotoStatus.mockResolvedValueOnce({
        success: false,
        working: 0,
        inprogress: 0,
        finished: 0,
        total: 0,
        error: 'Auth failed',
      });

      render(
        <TestWrapper>
          <SmartRouter />
        </TestWrapper>
      );

      // Should still navigate (to upload as fallback)
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/upload', { replace: true });
      });
    });
  });

  describe('Authentication States', () => {
    it('does not make API call while auth is still loading', async () => {
      // Override the auth mock for this test
      const { useAuth } = await import('../contexts/AuthContext');
      vi.mocked(useAuth).mockReturnValueOnce({
        user: null,
        loading: true,
        cookieReady: false,
      });

      render(
        <TestWrapper>
          <SmartRouter />
        </TestWrapper>
      );

      // API should not be called while auth is loading
      expect(mockGetPhotoStatus).not.toHaveBeenCalled();
    });

    it('does not make API call if cookie is not ready', async () => {
      const { useAuth } = await import('../contexts/AuthContext');
      vi.mocked(useAuth).mockReturnValueOnce({
        user: { id: 'test-user' },
        loading: false,
        cookieReady: false,
      });

      render(
        <TestWrapper>
          <SmartRouter />
        </TestWrapper>
      );

      // API should not be called until cookie is ready
      expect(mockGetPhotoStatus).not.toHaveBeenCalled();
    });
  });
});
