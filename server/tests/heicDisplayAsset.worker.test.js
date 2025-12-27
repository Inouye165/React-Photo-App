process.env.NODE_ENV = 'test';

jest.mock('../media/image', () => ({
  convertHeicToJpegBuffer: jest.fn(),
}));

const { ensureHeicDisplayAsset } = require('../media/heicDisplayAsset');
const { convertHeicToJpegBuffer } = require('../media/image');

describe('ensureHeicDisplayAsset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('HEIC: downloads once, converts once, uploads once, updates display_path', async () => {
    const storageClient = {
      download: jest.fn().mockResolvedValue({
        data: new Blob([Buffer.from('fake-heic-bytes')]),
        error: null,
      }),
      upload: jest.fn().mockResolvedValue({
        data: { path: 'display/u1/123.jpg' },
        error: null,
      }),
    };

    const update = jest.fn().mockResolvedValue(1);
    const where = jest.fn(() => ({ update }));
    const db = jest.fn(() => ({ where }));

    convertHeicToJpegBuffer.mockResolvedValue(Buffer.from('fake-jpeg'));

    const photo = {
      id: 123,
      user_id: 'u1',
      filename: 'photo.heic',
      state: 'working',
      storage_path: 'working/photo.heic',
      display_path: null,
    };

    const result = await ensureHeicDisplayAsset({ db, storageClient, photo });

    expect(result.ok).toBe(true);
    expect(result.displayPath).toBe('display/u1/123.jpg');

    expect(storageClient.download).toHaveBeenCalledTimes(1);
    expect(storageClient.download).toHaveBeenCalledWith('working/photo.heic');

    expect(convertHeicToJpegBuffer).toHaveBeenCalledTimes(1);

    expect(storageClient.upload).toHaveBeenCalledTimes(1);
    expect(storageClient.upload).toHaveBeenCalledWith(
      'display/u1/123.jpg',
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true })
    );

    expect(db).toHaveBeenCalledWith('photos');
    expect(where).toHaveBeenCalledWith({ id: 123 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ display_path: 'display/u1/123.jpg' }));
  });

  test('idempotent: if display_path exists, does nothing', async () => {
    const storageClient = {
      download: jest.fn(),
      upload: jest.fn(),
    };

    const db = jest.fn();

    const photo = {
      id: 123,
      user_id: 'u1',
      filename: 'photo.heic',
      state: 'working',
      storage_path: 'working/photo.heic',
      display_path: 'display/u1/123.jpg',
    };

    const result = await ensureHeicDisplayAsset({ db, storageClient, photo });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already_has_display_path');

    expect(storageClient.download).not.toHaveBeenCalled();
    expect(storageClient.upload).not.toHaveBeenCalled();
    expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();
  });
});
