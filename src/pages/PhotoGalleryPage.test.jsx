// @vitest-environment jsdom

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import PhotoGalleryPage from './PhotoGalleryPage';

// Mock the PhotoGallery component to avoid deep rendering.
// Note: vi.mock is hoisted; avoid referencing top-level variables inside the factory.
vi.mock('../PhotoGallery.jsx', async () => {
  const React = await import('react');
  const GalleryMock = () => React.createElement('div', { 'data-testid': 'gallery-mock' });
  GalleryMock.displayName = 'GalleryMock';
  return { default: GalleryMock };
});

// Mock Zustand and hooks
vi.mock('../hooks/usePhotoManagement', () => ({
  default: () => ({
    photos: [{ id: 1, url: 'test.jpg' }],
    loading: true,
    pollingPhotoId: null,
    pollingPhotoIds: [],
    refreshPhotos: vi.fn(),
    handleDeletePhoto: vi.fn(),
  })
}));

vi.mock('../hooks/useSignedThumbnails', () => ({
  default: () => ({ getSignedUrl: vi.fn() })
}));

vi.mock('../hooks/usePhotoPrivileges', () => ({
  default: () => ({})
}));

// Mock useLocalPhotoPicker to avoid upload logic
vi.mock('../hooks/useLocalPhotoPicker', () => ({
  default: () => ({
    filteredLocalPhotos: [],
    handleSelectFolder: vi.fn(),
    handleUploadFilteredOptimistic: vi.fn(),
    startDate: null,
    setStartDate: vi.fn(),
    endDate: null,
    setEndDate: vi.fn(),
    uploading: false,
  })
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'test-token' } })
}));

vi.mock('../store', () => {
  const mockState = {
    setBanner: vi.fn(),
    showMetadataModal: false,
    metadataPhoto: null,
    setShowMetadataModal: vi.fn(),
    setMetadataPhoto: vi.fn(),
    uploadPicker: { status: 'closed' },
    pendingUploads: [],
    pickerCommand: null,
    moveToInprogress: vi.fn(async () => ({ success: true })),
  };

  const useStore = (selector) => selector(mockState);
  useStore.getState = () => mockState;
  return { default: useStore };
});

describe('PhotoGalleryPage', () => {
  it('renders cached gallery while refresh is in progress', () => {
    const setToolbarMessage = vi.fn();

    function OutletWrapper() {
      return <Outlet context={{ setToolbarMessage }} />;
    }

    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Routes>
          <Route element={<OutletWrapper />}>
            <Route path="/gallery" element={<PhotoGalleryPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // Should render the gallery, not the blocking loading
    expect(screen.getByTestId('gallery-mock')).toBeInTheDocument();
    expect(screen.queryByText(/Loading photos/i)).not.toBeInTheDocument();
    // Optionally, check for the Refreshing indicator
    expect(screen.getByText(/Refreshing/i)).toBeInTheDocument();
  });
});
