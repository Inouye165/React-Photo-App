import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import LuminaCaptureSession from './LuminaCaptureSession';

const createMockStream = () => {
  const stop = vi.fn();
  return {
    stream: {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream,
    stop,
  };
};

describe('LuminaCaptureSession', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });

    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(),
      },
      configurable: true,
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['test'], { type: 'image/jpeg' }));
    });

    vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue();

    global.URL.createObjectURL = vi.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows fallback when permission is denied', async () => {
    const getUserMedia = vi.fn().mockRejectedValue({ name: 'NotAllowedError' });
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    render(
      <LuminaCaptureSession
        open
        collectibleId="1"
        onClose={vi.fn()}
        onFallbackToLibrary={vi.fn()}
      />
    );

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(screen.getByText(/Camera access was denied/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Add from library/i }).length).toBeGreaterThan(0);
  });

  test('capture adds a thumbnail', async () => {
    const { stream } = createMockStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    render(<LuminaCaptureSession open collectibleId="1" onClose={vi.fn()} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    const video = screen.getByTestId('lumina-capture-video');
    Object.defineProperty(video, 'videoWidth', { value: 800, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 600, configurable: true });

    fireEvent.click(screen.getByRole('button', { name: /Capture photo/i }));
    expect(screen.getAllByTestId('capture-thumbnail')).toHaveLength(1);
  });

  test('delete removes a thumbnail', async () => {
    const { stream } = createMockStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    render(<LuminaCaptureSession open collectibleId="1" onClose={vi.fn()} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    const video = screen.getByTestId('lumina-capture-video');
    Object.defineProperty(video, 'videoWidth', { value: 800, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 600, configurable: true });

    fireEvent.click(screen.getByRole('button', { name: /Capture photo/i }));
    expect(screen.getAllByTestId('capture-thumbnail')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Delete captured photo/i }));
    expect(screen.queryByTestId('capture-thumbnail')).not.toBeInTheDocument();
  });

  test('cleanup stops tracks on close', async () => {
    const { stream, stop } = createMockStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    const { rerender } = render(<LuminaCaptureSession open collectibleId="1" onClose={vi.fn()} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    rerender(<LuminaCaptureSession open={false} collectibleId="1" onClose={vi.fn()} />);
    expect(stop).toHaveBeenCalled();
  });

  test('single capture calls onCaptureSingle and closes', async () => {
    const { stream } = createMockStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    const onCaptureSingle = vi.fn();
    const onClose = vi.fn();

    render(
      <LuminaCaptureSession
        open
        collectibleId="1"
        onClose={onClose}
        onCaptureSingle={onCaptureSingle}
      />
    );

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    const video = screen.getByTestId('lumina-capture-video');
    Object.defineProperty(video, 'videoWidth', { value: 800, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 600, configurable: true });

    fireEvent.click(screen.getByRole('button', { name: /Capture photo/i }));

    await waitFor(() => expect(onCaptureSingle).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
