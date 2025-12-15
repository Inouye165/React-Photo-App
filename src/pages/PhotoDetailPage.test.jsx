import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PhotoDetailPage from './PhotoDetailPage.jsx';
import { uploadPickerInitialState } from '../store/uploadPickerSlice.js';

// Import store after mock setup (matches repo testing pattern)
vi.mock('../store.js', async () => {
  const actual = await vi.importActual('../store.js');
  return actual;
});

import useStore from '../store.js';

vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    API_BASE_URL: 'http://localhost:3001',
    fetchProtectedBlobUrl: vi.fn().mockResolvedValue('blob:mock-image'),
    revokeBlobUrl: vi.fn(),
  };
});

vi.mock('../components/LocationMapPanel.jsx', () => ({
  default: function MockLocationMapPanel() {
    return <div data-testid="mock-location-map" />;
  },
}));

describe('PhotoDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      photos: [],
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

  const renderAt = (path) => {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/photos/:id" element={<PhotoDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('shows an Edit button that links to /photos/:id/edit', async () => {
    useStore.setState({
      photos: [
        {
          id: 1,
          caption: 'Test Photo',
          url: '/api/photos/1/blob',
          classification: 'scenery',
        },
      ],
    });

    renderAt('/photos/1');

    const editLink = await screen.findByTestId('photo-detail-edit');
    expect(editLink).toBeInTheDocument();
    expect(editLink).toHaveAttribute('href', '/photos/1/edit');
  });

  it('renders classification badge for collectible', async () => {
    useStore.setState({
      photos: [
        {
          id: 2,
          caption: 'Collectible Photo',
          url: '/api/photos/2/blob',
          classification: 'collectible',
        },
      ],
    });

    renderAt('/photos/2');

    const badge = await screen.findByTestId('photo-detail-classification-badge');
    expect(badge).toHaveTextContent('Collectible');
  });

  it('renders classification badge for scenery', async () => {
    useStore.setState({
      photos: [
        {
          id: 3,
          caption: 'Scenery Photo',
          url: '/api/photos/3/blob',
          classification: 'scenery',
        },
      ],
    });

    renderAt('/photos/3');

    const badge = await screen.findByTestId('photo-detail-classification-badge');
    expect(badge).toHaveTextContent('Scenery');
  });
});
