/**
 * @fileoverview Tests for API payload optimization
 * Verifies that listPhotos returns a lite payload (no heavy fields)
 * while getPhotoById returns the complete payload.
 */

const createPhotosDb = require('../services/photosDb');

describe('photos payload optimization', () => {
  let db, photosDb;

  // Mock row with ALL fields (simulating full DB row)
  const fullDbRow = {
    id: 1,
    filename: 'test.jpg',
    state: 'working',
    metadata: '{"width":800,"height":600}',
    hash: 'abc123hash',
    file_size: 1024,
    caption: 'Test caption',
    description: 'Test description',
    keywords: 'nature,landscape',
    classification: 'scenery',
    created_at: '2024-01-01T00:00:00Z',
    // Heavy fields (should NOT be in listPhotos)
    poi_analysis: '{"name":"Test POI","confidence":0.95}',
    ai_model_history: '{"models":["gpt-4o"],"timestamps":["2024-01-01"]}',
    text_style: '{"font":"Arial","size":12}',
    storage_path: 'photos/user123/test.jpg',
    edited_filename: 'test_edited.jpg',
    updated_at: '2024-01-02T00:00:00Z'
  };

  // Lite columns expected for list view
  const LITE_COLUMNS = [
    'id', 'filename', 'state', 'metadata', 'hash', 'file_size',
    'caption', 'description', 'keywords', 'classification', 'created_at'
  ];

  // Heavy columns that should be excluded from list view
  const EXCLUDED_COLUMNS = [
    'poi_analysis', 'ai_model_history', 'text_style', 
    'storage_path', 'edited_filename'
  ];

  beforeEach(() => {
    // Track which columns are selected
    let selectedColumns = null;

    const createQueryChain = () => ({
      select: jest.fn(function(...cols) {
        selectedColumns = cols.flat();
        return this;
      }),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(fullDbRow),
      then: function(cb) { 
        // Filter row to only selected columns if select was called
        if (selectedColumns && selectedColumns.length > 0 && !selectedColumns.includes('*')) {
          const filteredRow = {};
          selectedColumns.forEach(col => {
            if (fullDbRow.hasOwnProperty(col)) {
              filteredRow[col] = fullDbRow[col];
            }
          });
          return Promise.resolve([filteredRow]).then(cb);
        }
        return Promise.resolve([fullDbRow]).then(cb); 
      },
      catch: jest.fn().mockReturnThis()
    });

    db = jest.fn(createQueryChain);
    photosDb = createPhotosDb({ db });
  });

  describe('listPhotos - Heavy Fields Excluded', () => {
    it('should NOT include poi_analysis in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].poi_analysis).toBeUndefined();
    });

    it('should NOT include ai_model_history in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].ai_model_history).toBeUndefined();
    });

    it('should NOT include text_style in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].text_style).toBeUndefined();
    });

    it('should NOT include storage_path in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].storage_path).toBeUndefined();
    });

    it('should NOT include edited_filename in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].edited_filename).toBeUndefined();
    });
  });

  describe('listPhotos - Core Fields Present', () => {
    it('should include id in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].id).toBeDefined();
      expect(rows[0].id).toBe(1);
    });

    it('should include hash in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].hash).toBeDefined();
      expect(rows[0].hash).toBe('abc123hash');
    });

    it('should include caption in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].caption).toBeDefined();
      expect(rows[0].caption).toBe('Test caption');
    });

    it('should include filename in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].filename).toBeDefined();
    });

    it('should include state in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].state).toBeDefined();
    });

    it('should include metadata in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].metadata).toBeDefined();
    });

    it('should include file_size in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].file_size).toBeDefined();
    });

    it('should include classification in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].classification).toBeDefined();
    });

    it('should include created_at in list results', async () => {
      const rows = await photosDb.listPhotos('user123', 'working');
      expect(rows[0].created_at).toBeDefined();
    });
  });

  describe('getPhotoById - Detail View Unchanged', () => {
    it('should include poi_analysis in detail view', async () => {
      const photo = await photosDb.getPhotoById('1', 'user123');
      expect(photo.poi_analysis).toBeDefined();
      expect(photo.poi_analysis).toBe('{"name":"Test POI","confidence":0.95}');
    });

    it('should include ai_model_history in detail view', async () => {
      const photo = await photosDb.getPhotoById('1', 'user123');
      expect(photo.ai_model_history).toBeDefined();
    });

    it('should include text_style in detail view', async () => {
      const photo = await photosDb.getPhotoById('1', 'user123');
      expect(photo.text_style).toBeDefined();
    });

    it('should include storage_path in detail view', async () => {
      const photo = await photosDb.getPhotoById('1', 'user123');
      expect(photo.storage_path).toBeDefined();
    });

    it('should include all core fields in detail view', async () => {
      const photo = await photosDb.getPhotoById('1', 'user123');
      expect(photo.id).toBeDefined();
      expect(photo.hash).toBeDefined();
      expect(photo.caption).toBeDefined();
      expect(photo.filename).toBeDefined();
    });
  });

  describe('Column Selection Verification', () => {
    it('listPhotos should select exactly the lite columns', async () => {
      // Capture the actual select call
      let capturedColumns = null;
      const selectMock = jest.fn(function(...cols) {
        capturedColumns = cols.flat();
        return this;
      });

      db.mockImplementation(() => ({
        select: selectMock,
        where: jest.fn().mockReturnThis(),
        then: (cb) => Promise.resolve([]).then(cb),
        catch: jest.fn().mockReturnThis()
      }));

      await photosDb.listPhotos('user123', 'working');

      // Verify select was called with the lite columns
      expect(selectMock).toHaveBeenCalled();
      expect(capturedColumns).toEqual(expect.arrayContaining(LITE_COLUMNS));
      
      // Verify heavy columns are NOT included
      EXCLUDED_COLUMNS.forEach(col => {
        expect(capturedColumns).not.toContain(col);
      });
    });
  });
});
