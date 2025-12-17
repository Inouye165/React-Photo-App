import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api.js', () => ({
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
  let useStore: any;
  let updatePhotoState: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Ensure module-level state in store (like polling timer registries) is reset per test.
    vi.resetModules();

    // Import the mocked API module and the real store after mocks are set up.
    ({ updatePhotoState } = await import('./api.js'));
    // NOTE: src/test/setup.js globally mocks the store module for most tests.
    // For this unit test we explicitly import the real store implementation.
    ({ default: useStore } = await vi.importActual('./store.js'));

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

    const photo = useStore.getState().photos.find((p: any) => p.id === 1);
    expect(photo).toBeTruthy();
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
