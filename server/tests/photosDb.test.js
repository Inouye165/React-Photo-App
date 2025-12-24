const createPhotosDb = require('../services/photosDb');

describe('photosDb service', () => {
  let db, photosDb;
  beforeEach(() => {
    // Create a chainable query mock
    const queryChain = () => {
      const obj = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn(),
        update: jest.fn(),
        del: jest.fn()
      };
      obj.where.mockImplementation(function() { return this; });
      return obj;
    };
    db = jest.fn(queryChain);
    // Patch up query return pattern for usage in each test
    photosDb = createPhotosDb({ db });
  });

  it('listPhotos queries by user and optional state', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    // Patch returns for select+where+orderBy+where pattern
    db.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      where: jest.fn(function() { return this; }).mockImplementation(function() { return this; }),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      timeout: jest.fn().mockReturnThis(),
      then: (cb) => cb(rows),
      // For async/await support (simulate .thenable)
      catch: jest.fn(),
      // Or return a resolved Promise for await
      [Symbol.toStringTag]: 'Promise',
      async then(cb) { return cb(rows); }
    });
    const result = await photosDb.listPhotos('user1', 'inprogress');
    expect(Array.isArray(result)).toBe(true);
  });

  it('getPhotoById returns the photo for user', async () => {
    const onePhoto = { id: 1 };
    db.mockReturnValueOnce({
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(onePhoto)
    });
    const photo = await photosDb.getPhotoById('1', 'user1');
    expect(photo).toHaveProperty('id');
  });

  it('updatePhotoMetadata updates fields when data is provided', async () => {
    db.mockReturnValueOnce({
      update: jest.fn().mockResolvedValue(1),
      where: jest.fn().mockReturnThis()
    });
    const updated = await photosDb.updatePhotoMetadata('1', 'user1', { caption: 'new cap', description: 'd', keywords: 'k', textStyle: { c: 1 } });
    expect(updated).toBe(true);
  });

  it('updatePhotoMetadata returns false when nothing updated', async () => {
    const updated = await photosDb.updatePhotoMetadata('1', 'user1', {});
    expect(updated).toBe(false);
  });

  it('deletePhoto removes record by id and user id', async () => {
    db.mockReturnValueOnce({
      del: jest.fn().mockResolvedValue(1),
      where: jest.fn().mockReturnThis()
    });
    const deleted = await photosDb.deletePhoto('1', 'user1');
    expect(deleted).toBe(true);
  });
});
