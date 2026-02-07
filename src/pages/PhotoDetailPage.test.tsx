import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PhotoDetailPage from './PhotoDetailPage.tsx';
import { uploadPickerInitialState } from '../store/uploadPickerSlice';

// Import store after mock setup (matches repo testing pattern)
vi.mock('../store', async () => {
  const actual = await vi.importActual('../store');
  return actual;
});

import useStore from '../store';

vi.mock('../api', async (importOriginal: () => Promise<unknown>) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    API_BASE_URL: 'http://localhost:3001',
    fetchProtectedBlobUrl: vi.fn().mockResolvedValue('blob:mock-image'),
    revokeBlobUrl: vi.fn(),
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('../components/LocationMapPanel', () => ({
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

  const renderAt = (path: string) => {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/photos/:id" element={<PhotoDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('shows "Analyzing..." for inprogress state', async () => {
    useStore.setState({
      photos: [
        {
          id: 10,
          caption: 'In Progress Photo',
          url: '/api/photos/10/blob',
          classification: 'scenery',
          state: 'inprogress',
        },
      ],
    });

    const { container } = renderAt('/photos/10');
    const scope = within(container);

    const state = await scope.findByTestId('photo-detail-state');
    expect(state).toHaveTextContent('Analyzing...');
  });

  it('shows "Analyzing..." for a photo while polling is active', async () => {
    useStore.setState({
      pollingPhotoId: 10,
      photos: [
        {
          id: 10,
          caption: 'In Progress Photo',
          url: '/api/photos/10/blob',
          classification: 'scenery',
          state: 'inprogress',
        },
      ],
    });

    const { container } = renderAt('/photos/10');
    const scope = within(container);

    const state = await scope.findByTestId('photo-detail-state');
    expect(state).toHaveTextContent('Analyzing...');
  });

  it('shows "Queue" for working state', async () => {
    useStore.setState({
      photos: [
        {
          id: 11,
          caption: 'Working Photo',
          url: '/api/photos/11/blob',
          classification: 'scenery',
          state: 'working',
        },
      ],
    });

    const { container } = renderAt('/photos/11');
    const scope = within(container);

    const state = await scope.findByTestId('photo-detail-state');
    expect(state).toHaveTextContent('Queue');
  });

  it('shows "Done" for finished state', async () => {
    useStore.setState({
      photos: [
        {
          id: 12,
          caption: 'Finished Photo',
          url: '/api/photos/12/blob',
          classification: 'scenery',
          state: 'finished',
        },
      ],
    });

    const { container } = renderAt('/photos/12');
    const scope = within(container);

    const state = await scope.findByTestId('photo-detail-state');
    expect(state).toHaveTextContent('Done');
  });

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

    const { container } = renderAt('/photos/1');
    const scope = within(container);

    const editLink = await scope.findByTestId('photo-detail-edit');
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

    const { container } = renderAt('/photos/2');
    const scope = within(container);

    const badge = await scope.findByTestId('photo-detail-classification-badge');
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

    const { container } = renderAt('/photos/3');
    const scope = within(container);

    const badge = await scope.findByTestId('photo-detail-classification-badge');
    expect(badge).toHaveTextContent('Scenery');
  });
});
