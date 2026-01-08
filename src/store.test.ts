import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  updatePhotoState: vi.fn().mockResolvedValue(undefined),
  getPhoto: vi.fn().mockImplementation(async (id: number | string) => ({
    photo: {
      id,
      caption: 'Processing...',
      description: 'Processing...',
    },
  })),
}));

describe('store moveToInprogress', () => {
  let useStore: typeof import('./store').default;
  let updatePhotoState: typeof import('./api').updatePhotoState;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module-level state in store (like polling timer registries) per test.
    vi.resetModules();

    // Import the mocked API module and the real store after mocks are set up.
    ({ updatePhotoState } = await import('./api'));
    // NOTE: src/test/setup.js globally mocks the store module for most tests.
    // For this unit test we explicitly import the real store implementation.
    ({ default: useStore } = await vi.importActual('./store'));

    useStore.setState({
      photos: [
        { id: 1, url: '/api/photos/1/blob', state: 'working' },
        { id: 2, url: '/api/photos/2/blob', state: 'working' },
      ],
      pollingPhotoId: null,
      pollingPhotoIds: new Set(),
    });
  });

  const stopAllPolling = () => {
    try { useStore.getState().stopAiPolling(1); } catch { /* ignore */ }
    try { useStore.getState().stopAiPolling(2); } catch { /* ignore */ }
  };

  it('updates the photo state to inprogress', async () => {
    await useStore.getState().moveToInprogress(1);

    const photos = useStore.getState().photos as Array<{ id: number | string; state?: string }>;
    const photo = photos.find((p) => p.id === 1);
    expect(photo).toBeTruthy();
    if (!photo) throw new Error('Expected photo to be present in store state');
    expect(photo.state).toBe('inprogress');

    stopAllPolling();
  });

  it('does not remove the photo from the photos array', async () => {
    const before = useStore.getState().photos.length;

    await useStore.getState().moveToInprogress(1);

    const after = useStore.getState().photos.length;
    expect(after).toBe(before);

    stopAllPolling();
  });

  it('adds the id to pollingPhotoIds and sets pollingPhotoId', async () => {
    await useStore.getState().moveToInprogress(1);

    const state = useStore.getState();
    expect(state.pollingPhotoId).toBe(1);
    expect(state.pollingPhotoIds).toBeInstanceOf(Set);
    expect(state.pollingPhotoIds.has(1)).toBe(true);

    stopAllPolling();
  });

  it('calls updatePhotoState(id, "inprogress")', async () => {
    await useStore.getState().moveToInprogress(1);

    expect(updatePhotoState).toHaveBeenCalledWith(1, 'inprogress');

    stopAllPolling();
  });
});

describe('store stale state protection', () => {
  let useStore: typeof import('./store').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ default: useStore } = await vi.importActual('./store'));
  });

  describe('setPhotos', () => {
    it('keeps terminal state when incoming photo has pending state', () => {
      // Setup: Photo in finished state
      useStore.setState({
        photos: [
          { 
            id: 1, 
            url: '/api/photos/1/blob', 
            state: 'finished',
            caption: 'Analysis complete',
            description: 'Detailed analysis'
          },
        ],
      });

      // Act: Call setPhotos with same photo in inprogress state (stale cache)
      useStore.getState().setPhotos([
        { 
          id: 1, 
          url: '/api/photos/1/blob', 
          state: 'inprogress',
          caption: 'Processing...',
          description: 'Processing...'
        },
      ]);

      // Assert: Photo should remain in finished state
      const photos = useStore.getState().photos;
      const photo = photos.find((p) => p.id === 1);
      expect(photo).toBeTruthy();
      expect(photo?.state).toBe('finished');
      expect(photo?.caption).toBe('Analysis complete');
    });

    it('keeps error state when incoming photo has working state', () => {
      useStore.setState({
        photos: [
          { id: 2, url: '/api/photos/2/blob', state: 'error' },
        ],
      });

      useStore.getState().setPhotos([
        { id: 2, url: '/api/photos/2/blob', state: 'working' },
      ]);

      const photo = useStore.getState().photos.find((p) => p.id === 2);
      expect(photo?.state).toBe('error');
    });

    it('allows progression from pending to terminal state', () => {
      useStore.setState({
        photos: [
          { id: 3, url: '/api/photos/3/blob', state: 'inprogress' },
        ],
      });

      useStore.getState().setPhotos([
        { id: 3, url: '/api/photos/3/blob', state: 'finished' },
      ]);

      const photo = useStore.getState().photos.find((p) => p.id === 3);
      expect(photo?.state).toBe('finished');
    });

    it('allows normal updates between non-terminal states', () => {
      useStore.setState({
        photos: [
          { id: 4, url: '/api/photos/4/blob', state: 'working' },
        ],
      });

      useStore.getState().setPhotos([
        { id: 4, url: '/api/photos/4/blob', state: 'inprogress' },
      ]);

      const photo = useStore.getState().photos.find((p) => p.id === 4);
      expect(photo?.state).toBe('inprogress');
    });

    it('handles new photos correctly', () => {
      useStore.setState({ photos: [] });

      useStore.getState().setPhotos([
        { id: 5, url: '/api/photos/5/blob', state: 'working' },
      ]);

      const photos = useStore.getState().photos;
      expect(photos).toHaveLength(1);
      expect(photos[0].state).toBe('working');
    });
  });

  describe('appendPhotos', () => {
    it('applies stale protection when appending', () => {
      useStore.setState({
        photos: [
          { id: 1, url: '/api/photos/1/blob', state: 'finished' },
        ],
      });

      // Try to append the same photo with stale state
      useStore.getState().appendPhotos(
        [{ id: 1, url: '/api/photos/1/blob', state: 'inprogress' }],
        null,
        false
      );

      const photos = useStore.getState().photos;
      expect(photos).toHaveLength(1);
      const photo = photos.find((p) => p.id === 1);
      expect(photo?.state).toBe('finished');
    });

    it('appends new photos normally', () => {
      useStore.setState({
        photos: [
          { id: 1, url: '/api/photos/1/blob', state: 'finished' },
        ],
      });

      useStore.getState().appendPhotos(
        [{ id: 2, url: '/api/photos/2/blob', state: 'working' }],
        'cursor-123',
        true
      );

      const photos = useStore.getState().photos;
      expect(photos).toHaveLength(2);
      expect(useStore.getState().photosCursor).toBe('cursor-123');
      expect(useStore.getState().photosHasMore).toBe(true);
    });
  });
});
