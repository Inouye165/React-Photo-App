const createPhotosStorage = require('../services/photosStorage');

describe('photosStorage service', () => {
  let storageClient, service;
  beforeEach(() => {
    storageClient = {
      move: jest.fn(),
      remove: jest.fn(),
      upload: jest.fn(),
      download: jest.fn()
    };
    service = createPhotosStorage({ storageClient });
  });

  it('movePhoto delegates to storageClient.move', async () => {
    storageClient.move.mockResolvedValue({ data: true });
    const result = await service.movePhoto('a', 'b');
    expect(storageClient.move).toHaveBeenCalledWith('a', 'b');
    expect(result).toHaveProperty('data');
  });

  it('deletePhotos delegates to storageClient.remove', async () => {
    storageClient.remove.mockResolvedValue({ data: true });
    const result = await service.deletePhotos(['a', 'b']);
    expect(storageClient.remove).toHaveBeenCalledWith(['a', 'b']);
    expect(result).toHaveProperty('data');
  });

  it('uploadPhoto delegates to storageClient.upload', async () => {
    storageClient.upload.mockResolvedValue({ data: true });
    const result = await service.uploadPhoto('a', Buffer.from('x'), { contentType: 'image/jpeg' });
    expect(storageClient.upload).toHaveBeenCalled();
    expect(result).toHaveProperty('data');
  });

  it('downloadPhoto delegates', async () => {
    storageClient.download.mockResolvedValue({ data: Buffer.from('123') });
    const result = await service.downloadPhoto('fileA');
    expect(storageClient.download).toHaveBeenCalledWith('fileA');
    expect(result).toHaveProperty('data');
  });
});
