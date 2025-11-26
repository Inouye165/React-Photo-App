const createPhotosState = require('../services/photosState');

describe('photosState service', () => {
  let db, storage, service;
  beforeEach(() => {
    db = jest.fn(() => ({ where: jest.fn().mockReturnThis(), update: jest.fn().mockResolvedValue(1) }));
    storage = {
      movePhoto: jest.fn(),
      deletePhotos: jest.fn().mockResolvedValue({}),
      downloadPhoto: jest.fn(),
      uploadPhoto: jest.fn()
    };
    service = createPhotosState({ db, storage });
  });
  it('handles success path for transition', async () => {
    storage.movePhoto.mockResolvedValue({});
    const result = await service.transitionState('id', 'user', 'working', 'finished', 'file.jpg');
    expect(result.success).toBe(true);
  });
  it('handles already exists error fallback', async () => {
    storage.movePhoto.mockResolvedValue({ error: { message: 'already exists' } });
    const result = await service.transitionState('id', 'user', 'a', 'b', 'file');
    expect(result.success).toBe(true);
  });
  it('handles not found fallback', async () => {
    storage.movePhoto.mockResolvedValue({ error: { message: 'not found' } });
    storage.downloadPhoto.mockResolvedValue({ data: { stream: () => Buffer.from('abc') }, error: undefined });
    storage.uploadPhoto.mockResolvedValue({});
    const result = await service.transitionState('id', 'user', 'a', 'b', 'file');
    expect(result.success).toBe(true);
  });
  it('handles upload error in not found fallback', async () => {
    storage.movePhoto.mockResolvedValue({ error: { message: 'not found' } });
    storage.downloadPhoto.mockResolvedValue({ data: { stream: jest.fn() }, error: undefined });
    storage.uploadPhoto.mockResolvedValue({ error: { message: 'upload failed' } });
    const result = await service.transitionState('id', 'user', 'a', 'b', 'file');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/upload/);
  });
  it('returns error for unhandled move error', async () => {
    storage.movePhoto.mockResolvedValue({ error: { message: 'bad error' } });
    const result = await service.transitionState('id', 'user', 'a', 'b', 'file');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/bad error/);
  });
});
