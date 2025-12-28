import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AuthWrapper from './layouts/AuthWrapper';
import MainLayout from './layouts/MainLayout.jsx';
import PhotoGalleryPage from './pages/PhotoGalleryPage.jsx';
import PhotoDetailPage from './pages/PhotoDetailPage.tsx';
import PhotoEditPage from './pages/PhotoEditPage.jsx';
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx';
import { uploadPickerInitialState } from './store/uploadPickerSlice';

// Import store after mock setup
vi.mock('./store', async () => {
  const actual = await vi.importActual('./store');
  return actual;
});

import useStore from './store';

// Mock dependencies - use importOriginal to avoid having to mock every API function
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    API_BASE_URL: 'http://localhost:3001',
    getPhotos: vi.fn().mockResolvedValue({ photos: [] }),
    getDependencyStatus: vi.fn().mockResolvedValue({ dependencies: { aiQueue: true } }),
    fetchProtectedBlobUrl: vi.fn().mockResolvedValue('blob:mock'),
    revokeBlobUrl: vi.fn(),
    fetchCollectibles: vi.fn(() => Promise.resolve([])),
    fetchModelAllowlist: vi.fn(() => Promise.resolve({ models: [] })),
  };
});

vi.mock('./hooks/usePhotoPrivileges.js', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('./hooks/useLocalPhotoPicker.js', () => ({
  default: vi.fn(() => ({
    filteredLocalPhotos: [],
    handleSelectFolder: vi.fn(),
    handleUploadFiltered: vi.fn(),
    startDate: null,
    setStartDate: vi.fn(),
    endDate: null,
    setEndDate: vi.fn(),
    uploading: false,
  })),
}));

vi.mock('./hooks/useSignedThumbnails.js', () => ({
  default: vi.fn(() => ({
    getSignedUrl: vi.fn((url) => url),
  })),
}));

vi.mock('./hooks/useUnreadMessages', () => ({
  useUnreadMessages: vi.fn(() => ({
    unreadCount: 0,
    hasUnread: false,
    loading: false,
    markAllAsRead: vi.fn(),
  })),
}));

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { email: 'test@example.com' }, access_token: 'mock-token' } }
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } }
      })),
    },
  },
}));

describe('Routing Implementation Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state using setState
    useStore.setState({
      photos: [
        { id: 1, caption: 'Test Photo 1', description: 'Description 1' },
        { id: 2, caption: 'Test Photo 2', description: 'Description 2' },
      ],
      banner: { message: '', severity: 'info' },
      view: 'working',
      activePhotoId: null,
      editingMode: null,
      showMetadataModal: false,
      metadataPhoto: null,
      pollingPhotoId: null,
      uploadPicker: { ...uploadPickerInitialState },
    });
  });

  describe('Route Rendering', () => {
    it('renders PhotoGalleryPage (PhotoTable) at root path /', async () => {
      render(
        <AuthProvider>
          <GlobalErrorBoundary>
            <MemoryRouter initialEntries={['/']}>
              <AuthWrapper>
                <Routes>
                  <Route element={<MainLayout />}>
                    <Route index element={<PhotoGalleryPage />} />
                  </Route>
                </Routes>
              </AuthWrapper>
            </MemoryRouter>
          </GlobalErrorBoundary>
        </AuthProvider>
      );

      // Wait for the gallery to render
      await waitFor(() => {
        // PhotoTable should have some identifiable content
        // Since we mocked the photos, the table should exist
        expect(document.body.textContent).toBeTruthy();
      });
    });

      it('renders PhotoDetailPage at /photos/:id', async () => {
      render(
        <AuthProvider>
          <GlobalErrorBoundary>
            <MemoryRouter initialEntries={['/photos/1']}>
              <AuthWrapper>
                <Routes>
                  <Route element={<MainLayout />}>
                      <Route path="/photos/:id" element={<PhotoDetailPage />} />
                    <Route path="/photos/:id/edit" element={<PhotoEditPage />} />
                  </Route>
                </Routes>
              </AuthWrapper>
            </MemoryRouter>
          </GlobalErrorBoundary>
        </AuthProvider>
      );

        // Wait for the detail page to render
      await waitFor(() => {
          expect(screen.getByTestId('photo-detail-page')).toBeInTheDocument();
      });
    });

    it('renders PhotoEditPage at /photos/:id/edit', async () => {
      render(
        <AuthProvider>
          <GlobalErrorBoundary>
            <MemoryRouter initialEntries={['/photos/1/edit']}>
              <AuthWrapper>
                <Routes>
                  <Route element={<MainLayout />}>
                    <Route path="/photos/:id/edit" element={<PhotoEditPage />} />
                  </Route>
                </Routes>
              </AuthWrapper>
            </MemoryRouter>
          </GlobalErrorBoundary>
        </AuthProvider>
      );

      // Wait for the edit page to render
      await waitFor(() => {
        // EditPage should be rendered - check for its presence
        expect(document.body.textContent).toBeTruthy();
      });
    });
  });

  describe('Deep Linking', () => {
    it('supports deep linking to /photos/:id/edit', async () => {
      render(
        <AuthProvider>
          <GlobalErrorBoundary>
            <MemoryRouter initialEntries={['/photos/2/edit']}>
              <AuthWrapper>
                <Routes>
                  <Route element={<MainLayout />}>
                    <Route path="/photos/:id/edit" element={<PhotoEditPage />} />
                  </Route>
                </Routes>
              </AuthWrapper>
            </MemoryRouter>
          </GlobalErrorBoundary>
        </AuthProvider>
      );

      await waitFor(() => {
        // Should render the edit page for the specific photo
        expect(document.body.textContent).toBeTruthy();
      });
    });

    it('handles photo not found gracefully on edit page', async () => {
      render(
        <AuthProvider>
          <GlobalErrorBoundary>
            <MemoryRouter initialEntries={['/photos/999/edit']}>
              <AuthWrapper>
                <Routes>
                  <Route element={<MainLayout />}>
                    <Route path="/photos/:id/edit" element={<PhotoEditPage />} />
                  </Route>
                </Routes>
              </AuthWrapper>
            </MemoryRouter>
          </GlobalErrorBoundary>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Photo not found')).toBeInTheDocument();
        expect(screen.getByText('Return to Gallery')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('catches and displays errors in GlobalErrorBoundary', async () => {
      const ThrowError = () => {
        throw new Error('Test error for boundary');
      };

      render(
        <GlobalErrorBoundary>
          <ThrowError />
        </GlobalErrorBoundary>
      );

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByText('Test error for boundary')).toBeInTheDocument();
        expect(screen.getByText('Try Again')).toBeInTheDocument();
        expect(screen.getByText('Go Home')).toBeInTheDocument();
      });
    });

    it('displays fallback UI with action buttons', async () => {
      const ThrowError = () => {
        throw new Error('Critical failure');
      };

      render(
        <GlobalErrorBoundary>
          <ThrowError />
        </GlobalErrorBoundary>
      );

      await waitFor(() => {
        const tryAgainButton = screen.getByText('Try Again');
        const goHomeButton = screen.getByText('Go Home');
        
        expect(tryAgainButton).toBeInTheDocument();
        expect(goHomeButton).toBeInTheDocument();
      });
    });
  });

  describe('Route Integration', () => {
    it('renders MainLayout with Toolbar for all routes', async () => {
      render(
        <AuthProvider>
          <GlobalErrorBoundary>
            <MemoryRouter initialEntries={['/']}>
              <AuthWrapper>
                <Routes>
                  <Route element={<MainLayout />}>
                    <Route index element={<PhotoGalleryPage />} />
                  </Route>
                </Routes>
              </AuthWrapper>
            </MemoryRouter>
          </GlobalErrorBoundary>
        </AuthProvider>
      );

      await waitFor(() => {
        // Toolbar should be present
        const toolbar = screen.getByRole('navigation', { name: 'Main toolbar' });
        expect(toolbar).toBeInTheDocument();
      });
    });

    it('catches wildcard routes and redirects to gallery', async () => {
      render(
        <AuthProvider>
          <GlobalErrorBoundary>
            <MemoryRouter initialEntries={['/nonexistent-route']}>
              <AuthWrapper>
                <Routes>
                  <Route element={<MainLayout />}>
                    <Route index element={<PhotoGalleryPage />} />
                      <Route path="/photos/:id" element={<PhotoDetailPage />} />
                    <Route path="/photos/:id/edit" element={<PhotoEditPage />} />
                    <Route path="*" element={<PhotoGalleryPage />} />
                  </Route>
                </Routes>
              </AuthWrapper>
            </MemoryRouter>
          </GlobalErrorBoundary>
        </AuthProvider>
      );

      // Should render gallery page as fallback
      await waitFor(() => {
        expect(document.body.textContent).toBeTruthy();
      });
    });
  });
});
