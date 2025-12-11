import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UploadPage from './UploadPage';
import { BrowserRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useOutletContext: () => ({ setToolbarMessage: vi.fn() }),
  };
});

vi.mock('../hooks/useLocalPhotoPicker.js', () => ({
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
  });

  it('renders the file input with correct attributes for mobile support', () => {
    render(
      <BrowserRouter>
        <UploadPage />
      </BrowserRouter>
    );

    // Find the hidden file input by test id
    const fileInput = screen.getByTestId('file-input');

    expect(fileInput).toBeInTheDocument();

    // 1. Assert webkitdirectory attribute is absent
    expect(fileInput).not.toHaveAttribute('webkitdirectory');

    // 2. Assert accept attribute contains image/*
    expect(fileInput).toHaveAttribute('accept', 'image/*,.heic,.heif,.png,.jpg,.jpeg');

    // 3. Assert multiple is present
    expect(fileInput).toHaveAttribute('multiple');
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
