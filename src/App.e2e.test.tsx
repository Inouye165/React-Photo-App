// @ts-nocheck
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

// TanStack Virtual relies on ResizeObserver; the test DOM environment can provide a partial implementation.
// Provide a minimal, stable polyfill so PhotoUploadForm can mount.
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = TestResizeObserver;

// Keep UploadPage deterministic in JSDOM.
vi.mock('exifr', () => ({
  parse: vi.fn(async () => ({})),
}));

vi.mock('./utils/clientImageProcessing', () => ({
  generateClientThumbnail: vi.fn(async () => null),
}));

vi.mock('./utils/isProbablyMobile', () => ({
  isProbablyMobile: () => false,
}));

// Avoid exercising File System Access API + EXIF parsing in this E2E-ish test.
// We only need the app routing + upload page wiring to be deterministic.
vi.mock('./hooks/useLocalPhotoPicker', () => {
  const fileContent = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
  const file = new File([fileContent], 'test1.jpg', { type: 'image/jpeg', lastModified: Date.now() });

  return {
    default: () => ({
      filteredLocalPhotos: [
        {
          id: 'local-1',
          name: 'test1.jpg',
          file,
          exifDate: null,
          handle: null,
        },
      ],
      handleSelectFolder: vi.fn(async () => {}),
      handleNativeSelection: vi.fn(async () => {}),
      startDate: '',
      setStartDate: vi.fn(),
      endDate: '',
      setEndDate: vi.fn(),
      uploading: false,
    }),
  };
});

// Bypass auth/identity bootstrapping for this test.
// This keeps the test focused on the upload flow, not Supabase/session init.
vi.mock('./contexts/AuthContext', () => {
  return {
    useAuth: () => ({
      user: { id: 'test-user' },
      loading: false,
      cookieReady: true,
      profile: { has_set_username: true },
      profileLoading: false,
    }),
  };
});

vi.mock('./components/AuthWrapper', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('./components/IdentityGate.tsx', async () => {
  const { Outlet } = await import('react-router-dom');
  return {
    default: () => React.createElement(Outlet, null),
  };
});

vi.mock('./hooks/useUnreadMessages', () => ({
  useUnreadMessages: vi.fn(() => ({
    unreadCount: 0,
    unreadByRoom: {},
    hasUnread: false,
    loading: false,
    markAllAsRead: vi.fn(),
  })),
}));

// PhotoUploadForm uses virtualization that relies on DOM measurements.
// For this App wiring test, mock it to a simple deterministic renderer.
vi.mock('./PhotoUploadForm', () => ({
  default: ({ filteredLocalPhotos }) =>
    React.createElement(
      'div',
      { 'data-testid': 'mock-photo-upload-form' },
      React.createElement('h2', null, 'Select Photos to Upload'),
      Array.isArray(filteredLocalPhotos)
        ? filteredLocalPhotos.map((p) => React.createElement('div', { key: p.id }, p.name))
        : null,
    ),
}));

// Mock ImageCanvasEditor to avoid react-konva issues
vi.mock('./ImageCanvasEditor', () => ({
  default: ({ onSave }) => React.createElement('div', { 'data-testid': 'image-canvas-editor' }, React.createElement('button', { onClick: () => onSave({ textStyle: {} }) }, 'Save'))
}));

// We need to mock the api module BEFORE importing App so App imports the mocked functions.
const photosStore = [];

// Provide a dynamic mock for ./api that the App will import.
// The closure captures `photosStore` so upload mock can push and getPhotos reads the array.
vi.mock('./api', () => {
  return {
    uploadPhotoToServer: vi.fn(async (file) => {
      // Simulate server storing the uploaded file and returning success
      const id = String(photosStore.length + 1);
      photosStore.push({
        id,
        filename: file.name,
        state: 'working',
        file_size: file.size || 0,
        metadata: {}
      });
      return { success: true };
    }),
    getPhotos: vi.fn(async () => {
      // Return current store snapshot as backend would
      return { success: true, photos: [...photosStore], nextCursor: null };
    }),
    // Used by SmartRouter in some flows; keep deterministic.
    getPhotoStatus: vi.fn(async () => ({ total: photosStore.length })),
    checkPrivilegesBatch: vi.fn(async (filenames) => {
      // Return simple privileges so App doesn't fall back to individual checks
      const map = {};
      filenames.forEach((f) => (map[f] = 'RWX'));
      return map;
    }),
    // Stubs for other functions imported by App
    checkPrivilege: vi.fn(async () => ({ privileges: { read: true } })),
    updatePhotoState: vi.fn(),
    recheckInprogressPhotos: vi.fn(async () => ({ message: 'ok' })),
    updatePhotoCaption: vi.fn(),
    fetchModelAllowlist: vi.fn().mockResolvedValue({ models: ['gpt-4o-mini'], source: 'test', updatedAt: null }),
    API_BASE_URL: ''
  };
});

// Now import App (which will use the mocked api module)
import App from './App.tsx';

describe('App E2E - upload flow', () => {
  beforeEach(() => {
    // Clear photosStore before each test run
    photosStore.length = 0;
  });

  afterEach(() => {
    // Reset all mocks between tests
    vi.clearAllMocks();
  });

  it('allows a user to select a folder and see the upload form populated', async () => {
    // Start on the upload route to avoid SmartRouter timing/redirects.
    window.history.pushState({}, 'Test', '/upload');

    // Render the App
    render(<App />);

    // The PhotoUploadForm should appear with heading "Select Photos to Upload"
    await waitFor(() => {
      expect(screen.getByText(/Select Photos to Upload/i)).toBeInTheDocument();
    });

    // The mock file name should be rendered in the upload list
    expect(screen.getByText('test1.jpg')).toBeInTheDocument();
  });
});
