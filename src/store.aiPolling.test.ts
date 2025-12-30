import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  updatePhotoState: vi.fn().mockResolvedValue(undefined),
  getPhoto: vi.fn(),
}));

const flushPromises = async () => {
  // A couple of microtask turns to let awaited promises resolve
  await Promise.resolve();
  await Promise.resolve();
};

describe('store AI polling (single poller)', () => {
  let useStore: typeof import('./store').default;
  let api: typeof import('./api');

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();

    api = await import('./api');
    ({ default: useStore } = await vi.importActual('./store'));

    useStore.setState({
      photos: [{ id: 1, url: '/photos/1.jpg', state: 'inprogress', caption: 'Processing...' }],
      pollingPhotoId: null,
      pollingPhotoIds: new Set(),
    });
  });

  afterEach(() => {
    try {
      useStore.getState().stopAiPolling(1);
    } catch {
      // ignore
    }
    vi.useRealTimers();
  });

  it('continues polling until API returns terminal state and then clears spinner flags', async () => {
    const getPhoto = vi.mocked(api.getPhoto);
    getPhoto
      .mockResolvedValueOnce({ photo: { id: 1, url: '/photos/1.jpg', state: 'inprogress', caption: 'Processing...' } })
      .mockResolvedValueOnce({ photo: { id: 1, url: '/photos/1.jpg', state: 'finished', caption: 'Done' } });

    useStore.getState().startAiPolling(1, { intervalMs: 10, softTimeoutMs: 1000, hardTimeoutMs: 10000 });

    await flushPromises();
    expect(getPhoto).toHaveBeenCalledTimes(1);
    expect(useStore.getState().pollingPhotoIds.has(1)).toBe(true);

    await vi.advanceTimersByTimeAsync(10);
    await flushPromises();

    expect(getPhoto).toHaveBeenCalledTimes(2);
    const photos = useStore.getState().photos as Array<{ id: number | string; state?: string }>;
    const stored = photos.find((p) => String(p.id) === '1');
    expect(stored?.state).toBe('finished');
    expect(useStore.getState().pollingPhotoIds.has(1)).toBe(false);
    expect(useStore.getState().pollingPhotoId).toBeNull();
  });

  it('does not stop early on a transient error and still reaches terminal state', async () => {
    const getPhoto = vi.mocked(api.getPhoto);
    getPhoto
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ photo: { id: 1, url: '/photos/1.jpg', state: 'finished', caption: 'Done' } });

    useStore.getState().startAiPolling(1, { intervalMs: 10, maxIntervalMs: 50, softTimeoutMs: 1000, hardTimeoutMs: 10000 });

    await flushPromises();
    expect(getPhoto).toHaveBeenCalledTimes(1);
    expect(useStore.getState().pollingPhotoIds.has(1)).toBe(true);

    // After the first error, backoff should schedule a future attempt (>= 20ms with intervalMs=10)
    await vi.advanceTimersByTimeAsync(20);
    await flushPromises();

    expect(getPhoto).toHaveBeenCalledTimes(2);
    const photos = useStore.getState().photos as Array<{ id: number | string; state?: string }>;
    const stored = photos.find((p) => String(p.id) === '1');
    expect(stored?.state).toBe('finished');
    expect(useStore.getState().pollingPhotoIds.has(1)).toBe(false);
    expect(useStore.getState().pollingPhotoId).toBeNull();
  });

  it('hard-timeout is explicit (does not silently stop while state stays inprogress)', async () => {
    const getPhoto = vi.mocked(api.getPhoto);
    getPhoto.mockResolvedValue({ photo: { id: 1, url: '/photos/1.jpg', state: 'inprogress', caption: 'Processing...' } });

    useStore.getState().startAiPolling(1, { intervalMs: 1, softTimeoutMs: 1, hardTimeoutMs: 5, maxIntervalMs: 5 });

    await flushPromises();
    expect(useStore.getState().pollingPhotoIds.has(1)).toBe(true);

    await vi.advanceTimersByTimeAsync(10);
    await flushPromises();

    const photos = useStore.getState().photos as Array<{ id: number | string; state?: string }>;
    const stored = photos.find((p) => String(p.id) === '1');
    expect(stored?.state).toBe('error');
    expect(useStore.getState().pollingPhotoIds.has(1)).toBe(false);
    expect(useStore.getState().pollingPhotoId).toBeNull();
  });

  it('stops after 5 consecutive errors (but not before)', async () => {
    const getPhoto = vi.mocked(api.getPhoto);
    getPhoto.mockRejectedValue(new Error('network down'));

    useStore.getState().startAiPolling(1, {
      intervalMs: 10,
      maxIntervalMs: 10,
      softTimeoutMs: 1000,
      hardTimeoutMs: 10000,
    });

    await flushPromises();
    expect(getPhoto).toHaveBeenCalledTimes(1);
    expect(useStore.getState().pollingPhotoIds.has(1)).toBe(true);

    // Advance enough for 4 more attempts.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(10);
      await flushPromises();
    }

    expect(getPhoto).toHaveBeenCalledTimes(5);
    expect(useStore.getState().pollingPhotoIds.has(1)).toBe(false);
    expect(useStore.getState().pollingPhotoId).toBeNull();
  });

  it('does not issue polling requests while streaming is active', async () => {
    const getPhoto = vi.mocked(api.getPhoto)
    useStore.setState({ photoEventsStreamingActive: true } as any)

    useStore.getState().startAiPolling(1, { intervalMs: 10, softTimeoutMs: 1000, hardTimeoutMs: 10000 })

    await flushPromises()
    await vi.advanceTimersByTimeAsync(50)
    await flushPromises()

    expect(getPhoto).not.toHaveBeenCalled()
    // Spinner flags remain set while streaming is responsible for completion.
    expect(useStore.getState().pollingPhotoIds.has(1)).toBe(true)
  })
});
