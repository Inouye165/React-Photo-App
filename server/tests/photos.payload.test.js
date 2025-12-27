/**
 * @fileoverview Tests for API payload optimization
 * Verifies that listPhotos requests only lite columns (no heavy fields)
 * while getPhotoById requests the complete payload.
 */

const createPhotosDb = require('../services/photosDb');

describe('photos payload optimization', () => {
  let db, photosDb;
  let queryMock;

  beforeEach(() => {
    // Create a chainable mock object
    queryMock = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      timeout: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      then: jest.fn((cb) => Promise.resolve([]).then(cb)),
      catch: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
    };

    // Mock the db function to return the chainable mock
    db = jest.fn(() => queryMock);
    
    // Initialize the service with the mocked db
    photosDb = createPhotosDb({ db });
  });

  describe('listPhotos - Heavy Fields Excluded', () => {
    const LITE_COLUMNS = [
      'id', 'filename', 'state', 'metadata', 'hash', 'file_size',
      'caption', 'description', 'keywords', 'classification', 'created_at'
    ];

    it('should explicitly select only lite columns', async () => {
      await photosDb.listPhotos('user123', 'working');
      
      expect(queryMock.select).toHaveBeenCalledTimes(1);
      const selectedColumns = queryMock.select.mock.calls[0];
      
      // Verify all lite columns are requested
      LITE_COLUMNS.forEach(col => {
        expect(selectedColumns).toContain(col);
      });

      // Verify heavy columns are NOT requested
      const HEAVY_COLUMNS = ['poi_analysis', 'ai_model_history', 'text_style', 'storage_path', 'edited_filename'];
      HEAVY_COLUMNS.forEach(col => {
        expect(selectedColumns).not.toContain(col);
      });
    });
  });

  describe('getPhotoById - Full Payload', () => {
    it('should NOT restrict columns (implying SELECT *)', async () => {
      await photosDb.getPhotoById(1, 'user123');
      
      // Should not call select(), implying all columns are returned
      expect(queryMock.select).not.toHaveBeenCalled();
      expect(queryMock.where).toHaveBeenCalledWith({ id: 1, user_id: 'user123' });
      expect(queryMock.first).toHaveBeenCalled();
    });
  });
});
