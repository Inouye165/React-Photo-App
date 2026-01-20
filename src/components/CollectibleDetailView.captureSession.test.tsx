import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import CollectibleDetailView from './CollectibleDetailView';
import type { Photo } from '../types/photo';
import type { CollectibleRecord } from '../types/collectibles';
import { startBackgroundUpload } from '../utils/uploadPipeline';
import { request } from '../api/httpClient';
import { openCaptureIntent } from '../api/captureIntents';

vi.mock('../hooks/useLocalPhotoPicker', () => ({
  default: () => ({
    handleNativeSelection: vi.fn(),
    handleUploadFilteredOptimistic: vi.fn(),
    fileInputRef: { current: null },
  }),
}));

vi.mock('../api/httpClient', () => ({
  API_BASE_URL: '',
  request: vi.fn().mockResolvedValue({ success: true, photos: [] }),
}));

vi.mock('../api/auth', () => ({
  getHeadersForGetRequestAsync: vi.fn().mockResolvedValue({}),
}));

vi.mock('../api/photos', () => ({
  deletePhoto: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/captureIntents', () => ({
  openCaptureIntent: vi.fn(),
}));

vi.mock('../utils/uploadPipeline', () => ({
  convertToJpegIfHeic: vi.fn(async (file: File) => file),
  createThumbnailGenerator: vi.fn(() => vi.fn(async () => null)),
  startBackgroundUpload: vi.fn(),
}));

vi.mock('./PriceRangeVisual', () => ({
  default: () => React.createElement('div', { 'data-testid': 'price-range' }),
}));

vi.mock('./PriceHistoryList', () => ({
  default: () => React.createElement('div', { 'data-testid': 'price-history' }),
}));

vi.mock('./AuthenticatedImage', () => ({
  default: () => React.createElement('div', { 'data-testid': 'auth-image' }),
}));

const mockPhoto: Photo = {
  id: 1,
  url: '/photos/1.jpg',
  filename: 'test.jpg',
  description: 'Test',
};

const mockCollectible: CollectibleRecord = {
  id: 123,
  photo_id: 1,
  category: 'Card',
  name: 'Test Collectible',
};

describe('CollectibleDetailView capture session', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
      },
      configurable: true,
    });

    vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue();
    global.URL.createObjectURL = vi.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('opens capture session from collectible detail view', async () => {
    render(<CollectibleDetailView photo={mockPhoto} collectibleData={mockCollectible} />);

    fireEvent.click(screen.getByRole('button', { name: /Add Reference Photo/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Use Webcam/i }));
    expect(screen.getByRole('dialog', { name: /Lumina capture session/i })).toBeInTheDocument();

    await waitFor(() =>
      expect(global.navigator.mediaDevices.getUserMedia).toHaveBeenCalled()
    );
  });

  test('upload action calls upload pipeline with collectible id', async () => {
    render(<CollectibleDetailView photo={mockPhoto} collectibleData={mockCollectible} />);

    fireEvent.click(screen.getByRole('button', { name: /Add Reference Photo/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Use Webcam/i }));

    const input = await screen.findByTestId('lumina-library-input');
    const file = new File(['test'], 'ref.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Upload captured photos/i }));

    expect(startBackgroundUpload).toHaveBeenCalledWith(
      expect.objectContaining({ collectibleId: 123 })
    );
  });

  test('refetches reference photos on collectible-photos-changed event', async () => {
    const requestMock = vi.mocked(request);

    render(<CollectibleDetailView photo={mockPhoto} collectibleData={mockCollectible} />);

    // Initial fetch on mount
    await waitFor(() => expect(requestMock).toHaveBeenCalled());
    const callsAfterMount = requestMock.mock.calls.length;

    window.dispatchEvent(
      new CustomEvent('collectible-photos-changed', {
        detail: { collectibleId: '123', photoId: '999' },
      })
    );

    await waitFor(() => expect(requestMock.mock.calls.length).toBeGreaterThan(callsAfterMount));
  });

  test('polls for new reference photos after Capture on Phone starts', async () => {
    vi.useFakeTimers();
    try {
      const requestMock = vi.mocked(request);
      const openMock = vi.mocked(openCaptureIntent);

      openMock.mockResolvedValue({
        id: 'intent-1',
        photoId: 1,
        collectibleId: 123,
        state: 'open',
      } as any);

      render(<CollectibleDetailView photo={mockPhoto} collectibleData={mockCollectible} />);

      // Initial fetch on mount (flush microtasks; no timers involved).
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(requestMock).toHaveBeenCalled();
      const callsAfterMount = requestMock.mock.calls.length;

      fireEvent.click(screen.getByRole('button', { name: /Add Reference Photo/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /Connect to Phone/i }));

      // openCaptureIntent resolves immediately (flush microtasks).
      await Promise.resolve();
      await Promise.resolve();
      expect(openMock).toHaveBeenCalledTimes(1);

      // startCollectiblePhotoWatch triggers an immediate poll.
      await Promise.resolve();
      await Promise.resolve();
      expect(requestMock.mock.calls.length).toBeGreaterThan(callsAfterMount);

      const callsAfterImmediate = requestMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(2600);
      await Promise.resolve();
      await Promise.resolve();
      expect(requestMock.mock.calls.length).toBeGreaterThan(callsAfterImmediate);
    } finally {
      vi.useRealTimers();
    }
  });
});
