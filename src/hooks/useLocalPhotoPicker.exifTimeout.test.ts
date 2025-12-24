import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

let useLocalPhotoPicker: typeof import('./useLocalPhotoPicker').default;
let parse: ReturnType<typeof vi.fn>;

describe('useLocalPhotoPicker - EXIF timeout', () => {
  beforeAll(async () => {
    vi.doMock('exifr', () => ({
      parse: vi.fn(),
    }));

    // Minimal Zustand-like mock for `../store`
    const mockState: any = {
      uploadPicker: {
        filters: { startDate: '', endDate: '' },
        status: 'open',
        localPhotos: [],
      },
      pickerCommand: {
        openPicker: vi.fn(),
      },
    };

    const useStoreMock: any = (selector: any) => selector(mockState);
    useStoreMock.getState = () => mockState;

    vi.doMock('../store', () => ({
      default: useStoreMock,
    }));

    // These are imported by the hook module; keep them inert for this test.
    vi.doMock('../api', () => ({
      uploadPhotoToServer: vi.fn(),
    }));

    vi.doMock('../utils/clientImageProcessing', () => ({
      generateClientThumbnail: vi.fn(),
    }));

    const exifr = await import('exifr');
    parse = exifr.parse as any;

    const hookModule = await import('./useLocalPhotoPicker');
    useLocalPhotoPicker = hookModule.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not hang when EXIF parse stalls (times out and continues)', async () => {
    // Simulate EXIF parsing that never resolves (real-world: library hang / very large file)
    parse.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useLocalPhotoPicker({}));

    const file = new File(['hello'], 'test.jpg', { type: 'image/jpeg' });

    const event: any = {
      target: {
        files: [file],
      },
    };

    const promise = result.current.handleNativeSelection(event);

    // Default timeout in code is 1500ms.
    await vi.advanceTimersByTimeAsync(1500);
    await promise;

    expect(parse).toHaveBeenCalledTimes(1);

    // We can't directly access the mocked state here, so assert by behavior:
    // openPicker should be called with exifDate null.
    const storeModule: any = await import('../store');
    const openPicker = storeModule.default.getState().pickerCommand.openPicker;

    expect(openPicker).toHaveBeenCalledTimes(1);
    expect(openPicker).toHaveBeenCalledWith({
      dirHandle: null,
      files: [
        {
          name: 'test.jpg',
          file,
          exifDate: null,
          handle: null,
        },
      ],
    });
  });
});
