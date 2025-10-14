import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

// Mock ImageCanvasEditor to avoid react-konva issues
vi.mock('./ImageCanvasEditor', () => ({
  default: ({ onSave }) => React.createElement('div', { 'data-testid': 'image-canvas-editor' }, React.createElement('button', { onClick: () => onSave({ textStyle: {} }) }, 'Save'))
}))

// We need to mock the api module BEFORE importing App so App imports the mocked functions.
const photosStore = [];

// Provide a dynamic mock for ./api.js that the App will import.
// The closure captures `photosStore` so upload mock can push and getPhotos reads the array.
vi.mock('./api.js', () => {
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
      return { photos: [...photosStore] };
    }),
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
  };
});

// Now import App (which will use the mocked api module)
import App from './App.jsx';

describe('App E2E - upload flow', () => {
  // Keep a reference to the original showDirectoryPicker so we can restore it
  const originalShowDirectoryPicker = window.showDirectoryPicker;

  beforeEach(() => {
    // Clear photosStore before each test run
    photosStore.length = 0;
  });

  afterEach(() => {
    // Restore any replaced browser APIs
    if (originalShowDirectoryPicker === undefined) {
      delete window.showDirectoryPicker;
    } else {
      window.showDirectoryPicker = originalShowDirectoryPicker;
    }
    // Reset all mocks between tests
    vi.clearAllMocks();
  });

  it('allows a user to select a folder, upload a photo, and see it in the gallery', async () => {
    // Create a mock File (user-selected image)
    const fileContent = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
    const mockFile = new File([fileContent], 'test1.jpg', { type: 'image/jpeg', lastModified: Date.now() });

    // Create a fake file handle (like File System Access API provides)
    const fileHandle = {
      kind: 'file',
      getFile: async () => mockFile,
    };

    // Create a fake directory handle with entries() async iterator
    const dirHandle = {
      async *entries() {
        // yield a single file
        yield ['test1.jpg', fileHandle];
      },
      // minimal API surface used by app (not all methods are required)
      name: 'mock-dir',
      // optional for permission checks, App ensures ensurePermission handles absence gracefully
    };

    // Mock window.showDirectoryPicker to return our fake directory handle
    window.showDirectoryPicker = vi.fn().mockResolvedValue(dirHandle);

    // Render the App
    render(<App />);

    // Wait for initial load to settle - App will call getPhotos() on mount.
    // Because our mock getPhotos returns an empty array initially, the app shows "No photos found in backend."
    await waitFor(() => {
      expect(screen.getByText(/No photos found in backend\./i)).toBeInTheDocument();
    });

    // Click the toolbar button "Select Folder for Upload"
    const selectFolderBtn = screen.getByText(/Select Folder for Upload/i);
    await userEvent.click(selectFolderBtn);

    // The PhotoUploadForm modal should appear with heading "Select Photos to Upload"
    await waitFor(() => {
      expect(screen.getByText(/Select Photos to Upload/i)).toBeInTheDocument();
    });

    // The mock file name should be rendered in the modal list
    expect(screen.getByText('test1.jpg')).toBeInTheDocument();

    // Find and click the upload button - should read "Upload 1 Photos"
    const uploadButton = screen.getByRole('button', { name: /Upload\s*1\s*Photos/i });
    await userEvent.click(uploadButton);

    // After upload, the modal is closed and the gallery is refreshed.
    // Wait for the gallery to display the uploaded filename.
    await waitFor(() => {
      // the gallery contains the filename as a visible element
      expect(screen.getAllByText('test1.jpg').length).toBeGreaterThan(0);
    });

    // Final assertion: the filename is visible in the gallery list
    expect(screen.getByText('test1.jpg')).toBeInTheDocument();
  });
});
