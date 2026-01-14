let sharp;

// Mock HEIC conversion so we can simulate decoder/plugin errors deterministically.
jest.mock('../media/image', () => ({
  convertHeicToJpegBuffer: jest.fn(),
}));

// Mock sharp + supabase client before requiring backgroundProcessor
jest.mock('sharp');

jest.mock('../lib/supabaseClient', () => {
  const upload = jest.fn().mockResolvedValue({ error: null });
  const list = jest.fn().mockResolvedValue({ data: [] });
  const download = jest.fn().mockResolvedValue({
    data: {
      arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-image-bytes')),
    },
    error: null,
  });

  return {
    storage: {
      from: jest.fn(() => ({ upload, list, download })),
    },
    __mocks: { upload, list, download },
  };
});

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('processUploadedPhoto tiered thumbnails', () => {
  let backgroundProcessor;
  let supabase;
  let image;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // After resetModules(), re-require mocked modules so we're configuring
    // the same instances that production code will use.
    sharp = require('sharp');

    // Re-require modules after resetModules so mocks apply.
    supabase = require('../lib/supabaseClient');
    backgroundProcessor = require('../media/backgroundProcessor');
    image = require('../media/image');

    const mockSharpInstance = {
      resize: jest.fn().mockReturnThis(),
      rotate: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumb-bytes')),
    };

    sharp.mockReturnValue(mockSharpInstance);
    sharp.concurrency = jest.fn();
    sharp.cache = jest.fn();
  });

  function createDbMock(photoRow) {
    const state = { updated: null };

    function builder() {
      return {
        where: () => ({
          first: async () => photoRow,
          update: async (updates) => {
            state.updated = updates;
            return 1;
          },
        }),
      };
    }

    builder.__state = state;
    return builder;
  }

  test('processUploadedPhoto uploads both thumbnails/<hash>.jpg and thumbnails/<hash>-sm.jpg and sets thumb_small_path', async () => {
    const photoRow = {
      id: 1,
      user_id: 'u1',
      filename: 'test.jpg',
      storage_path: 'working/test.jpg',
      hash: 'abc123',
      metadata: '{}',
    };

    const db = createDbMock(photoRow);

    await backgroundProcessor.processUploadedPhoto(db, 1, {
      processMetadata: false,
      generateThumbnail: true,
      generateDisplay: false,
    });

    // Ensure we checked for existing objects for both sizes.
    expect(supabase.storage.from).toHaveBeenCalledWith('photos');
    expect(supabase.__mocks.list).toHaveBeenCalledWith('thumbnails', expect.objectContaining({ search: 'abc123.jpg' }));
    expect(supabase.__mocks.list).toHaveBeenCalledWith('thumbnails', expect.objectContaining({ search: 'abc123-sm.jpg' }));

    expect(db.__state.updated).toEqual(expect.objectContaining({
      thumb_path: 'thumbnails/abc123.jpg',
      thumb_small_path: 'thumbnails/abc123-sm.jpg',
    }));
  });

  test('processUploadedPhoto marks derivatives failed when HEIC decoder is missing', async () => {
    const photoRow = {
      id: 1,
      user_id: 'u1',
      filename: 'test.heic',
      storage_path: 'working/test.heic',
      hash: 'abc123',
      metadata: '{}',
    };

    const db = createDbMock(photoRow);

    // Force the direct sharp() thumbnail path to fail so code tries HEIC fallback.
    let call = 0;
    const mockSharpInstance = {
      resize: jest.fn().mockReturnThis(),
      rotate: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockImplementation(async () => {
        call += 1;
        throw new Error(call === 1 ? 'Input buffer contains unsupported image format' : 'unsupported');
      }),
    };
    sharp.mockReturnValue(mockSharpInstance);

    // Simulate missing HEIF/HEIC decoder/plugin on the server.
    image.convertHeicToJpegBuffer.mockRejectedValue(new Error('heif: No decoding plugin installed'));

    await backgroundProcessor.processUploadedPhoto(db, 1, {
      processMetadata: false,
      generateThumbnail: true,
      generateDisplay: false,
    });

    expect(db.__state.updated).toEqual(
      expect.objectContaining({
        derivatives_status: 'failed',
        derivatives_error: 'heif_decoder_missing',
      }),
    );

    const logger = require('../logger');
    expect(logger.error).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('heic_thumbnail_fallback_failed'),
      expect.objectContaining({ code: 'heif_decoder_missing' }),
    );
  });
});
