import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UploadPage from './UploadPage';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../utils/isProbablyMobile', () => ({
  isProbablyMobile: vi.fn(),
}));

import { isProbablyMobile } from '../utils/isProbablyMobile';

// Mock dependencies
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useOutletContext: () => ({ setToolbarMessage: vi.fn() }),
  };
});

vi.mock('../hooks/useLocalPhotoPicker', () => ({
  default: () => ({
    filteredLocalPhotos: [],
    handleSelectFolder: vi.fn(),
    handleNativeSelection: vi.fn(),
    handleUploadFiltered: vi.fn(),
    startDate: new Date(),
    setStartDate: vi.fn(),
    endDate: new Date(),
    setEndDate: vi.fn(),
    uploading: false,
  }),
}));

vi.mock('../hooks/useThumbnailQueue.js', () => ({
  useThumbnailQueue: () => ({}),
}));

vi.mock('../PhotoUploadForm.jsx', () => ({
  default: () => <div>PhotoUploadForm</div>,
}));

describe('UploadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isProbablyMobile.mockReturnValue(false);
  });

  it('renders the hidden gallery + camera inputs with correct attributes', () => {
    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    const galleryInput = screen.getByTestId('gallery-input');
    const cameraInput = screen.getByTestId('camera-input');

    expect(galleryInput).toBeInTheDocument();
    expect(cameraInput).toBeInTheDocument();

    expect(galleryInput).toHaveAttribute('accept', 'image/*,.heic,.heif,.png,.jpg,.jpeg');
    expect(galleryInput).toHaveAttribute('multiple');
    expect(galleryInput).not.toHaveAttribute('capture');

    expect(cameraInput).toHaveAttribute('accept', 'image/*,.heic,.heif,.png,.jpg,.jpeg');
    expect(cameraInput).toHaveAttribute('multiple');
    expect(cameraInput).toHaveAttribute('capture', 'environment');
  });

  it('shows two explicit buttons on mobile and wires them to the correct inputs', async () => {
    isProbablyMobile.mockReturnValue(true);

    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    const galleryInput = screen.getByTestId('gallery-input');
    const cameraInput = screen.getByTestId('camera-input');
    galleryInput.click = vi.fn();
    cameraInput.click = vi.fn();

    await user.click(screen.getByRole('button', { name: /choose from gallery/i }));
    expect(galleryInput.click).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /take photo/i }));
    expect(cameraInput.click).toHaveBeenCalled();
  });

  it('displays the correct button text for file selection', () => {
    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    // Verify the main action button text matches the new behavior
    // It should be "Select Photos"
    const button = screen.getByRole('button', { name: /select photos/i });
    expect(button).toBeInTheDocument();
  });
});
