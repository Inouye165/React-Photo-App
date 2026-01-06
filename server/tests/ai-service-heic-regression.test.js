const { updatePhotoAIMetadata } = require('../ai/service');
const { convertHeicToJpegBuffer } = require('../media/image');
const sharp = require('sharp');
const supabase = require('../lib/supabaseClient');

jest.mock('../media/image', () => ({
  convertHeicToJpegBuffer: jest.fn()
}));

jest.mock('sharp', () => {
  const mSharp = {
    resize: jest.fn().mockReturnThis(),
    withMetadata: jest.fn().mockReturnThis(),
    toFormat: jest.fn().mockReturnThis(),
    toBuffer: jest.fn()
  };
  const fn = jest.fn(() => mSharp);
  fn.resize = mSharp.resize;
  return fn;
});

jest.mock('../lib/supabaseClient', () => ({
  storage: {
    from: jest.fn().mockReturnValue({
      createSignedUrl: jest.fn()
    })
  }
}));

jest.mock('../ai/langgraph/graph', () => ({
  app: {
    invoke: jest.fn().mockResolvedValue({
      finalResult: { caption: 'test', description: 'test', keywords: 'test' },
      classification: null
    })
  }
}));

jest.mock('../logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

global.fetch = jest.fn();

describe('updatePhotoAIMetadata HEIC regression', () => {
  let mockDb;
  let mockTrx;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTrx = {
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
      insert: jest.fn().mockResolvedValue(1)
    };
    mockDb = jest.fn(() => mockTrx);
    mockDb.transaction = jest.fn((cb) => cb(mockTrx));
    mockDb.where = jest.fn().mockReturnThis();
    mockDb.first = jest.fn().mockResolvedValue({});
    mockDb.update = jest.fn().mockResolvedValue(1);
  });

  it('should always use convertHeicToJpegBuffer for HEIC/HEIF files', async () => {
    const photoRow = {
      id: 1,
      filename: 'photo.HEIC',
      metadata: '{}',
      ai_retry_count: 0
    };
    const storagePath = 'inprogress/photo.HEIC';
    // Use a Supabase-like URL that matches the expected origin in tests
    const mockSignedUrl = process.env.SUPABASE_URL 
      ? `${process.env.SUPABASE_URL}/storage/v1/object/sign/photos/${storagePath}`
      : 'http://example.com/photo.HEIC';
    supabase.storage.from().createSignedUrl.mockResolvedValue({
      data: { signedUrl: mockSignedUrl },
      error: null
    });
    const mockArrayBuffer = new ArrayBuffer(8);
    global.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
      body: { getReader: jest.fn() }
    });
    const mockJpegBuffer = Buffer.from('jpeg');
    convertHeicToJpegBuffer.mockResolvedValue(mockJpegBuffer);
    const mockSharpInstance = sharp();
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('resized'));
    await updatePhotoAIMetadata(mockDb, photoRow, storagePath);
    expect(convertHeicToJpegBuffer).toHaveBeenCalled();
  });

  it('should not use convertHeicToJpegBuffer for non-HEIC files', async () => {
    const photoRow = {
      id: 2,
      filename: 'photo.jpg',
      metadata: '{}',
      ai_retry_count: 0
    };
    const storagePath = 'inprogress/photo.jpg';
    // Use a Supabase-like URL that matches the expected origin in tests
    const mockSignedUrl = process.env.SUPABASE_URL 
      ? `${process.env.SUPABASE_URL}/storage/v1/object/sign/photos/${storagePath}`
      : 'http://example.com/photo.jpg';
    supabase.storage.from().createSignedUrl.mockResolvedValue({
      data: { signedUrl: mockSignedUrl },
      error: null
    });
    const { Readable } = require('stream');
    const mockStream = Readable.from(['data']);
    global.fetch.mockResolvedValue({
      ok: true,
      body: mockStream
    });
    const mockSharpInstance = sharp();
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('resized'));
    await updatePhotoAIMetadata(mockDb, photoRow, storagePath);
    expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();
  });
});
