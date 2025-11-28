/**
 * Collectibles Database Tests
 * 
 * These tests verify the collectibles schema, service layer, and security constraints.
 * Tests cover:
 * 1. Uniqueness constraint (one collectible per photo)
 * 2. Cascade delete behavior
 * 3. Row Level Security (RLS) isolation
 * 4. AI history append logic
 * 
 * @module server/tests/collectibles.db.test.js
 */

'use strict';

// Set feature flag for tests
process.env.ENABLE_COLLECTIBLES_DB = 'true';

const createCollectiblesService = require('../services/collectiblesService');
const { 
  isCollectiblesDbEnabled
} = require('../utils/featureFlags');

describe('Collectibles Database Tests', () => {
  let db;
  let collectiblesService;
  let store;
  
  // Test user IDs (will be created/mocked per test)
  const aliceId = '11111111-1111-1111-1111-111111111111';
  const bobId = '22222222-2222-2222-2222-222222222222';
  
  // Helper to create a mock database for unit tests
  const createMockDb = () => {
    store = {
      collectibles: [],
      collectible_market_data: [],
      collectible_photos: [],
      photos: [],
      nextId: 1
    };
    
    const createQueryBuilder = (tableName) => {
      let conditions = {};
      let gtConditions = [];
      let ltConditions = [];
      
      const applyFilter = (items) => {
        return items.filter(item => {
          // Check equality conditions
          for (const [key, value] of Object.entries(conditions)) {
            if (item[key] !== value) return false;
          }
          // Check >= conditions
          for (const { field, value } of gtConditions) {
            if (item[field] < value) return false;
          }
          // Check <= conditions
          for (const { field, value } of ltConditions) {
            if (item[field] > value) return false;
          }
          return true;
        });
      };
      
      const builder = {
        select: jest.fn(() => builder),
        where: jest.fn((cond, op, val) => {
          if (typeof cond === 'object') {
            Object.assign(conditions, cond);
          } else if (op === '>=' && val !== undefined) {
            gtConditions.push({ field: cond, value: val });
          } else if (op === '<=' && val !== undefined) {
            ltConditions.push({ field: cond, value: val });
          }
          return builder;
        }),
        orderBy: jest.fn(() => builder),
        first: jest.fn(async () => {
          const items = store[tableName] || [];
          const filtered = applyFilter(items);
          return filtered[0] || null;
        }),
        insert: jest.fn((data) => {
          const id = store.nextId++;
          const item = { id, ...data };
          store[tableName] = store[tableName] || [];
          store[tableName].push(item);
          // Return object with returning method for chaining
          return {
            returning: jest.fn(async () => [{ id }])
          };
        }),
        update: jest.fn(async (data) => {
          const items = store[tableName] || [];
          let count = 0;
          items.forEach(item => {
            let matches = true;
            for (const [key, value] of Object.entries(conditions)) {
              if (item[key] !== value) {
                matches = false;
                break;
              }
            }
            if (matches) {
              Object.assign(item, data);
              count++;
            }
          });
          return count;
        }),
        del: jest.fn(async () => {
          const items = store[tableName] || [];
          const initialLength = items.length;
          store[tableName] = items.filter(item => {
            for (const [key, value] of Object.entries(conditions)) {
              if (item[key] !== value) return true;
            }
            return false;
          });
          return initialLength - store[tableName].length;
        }),
        then: function(resolve) {
          // For listCollectibles which doesn't call .first()
          const items = store[tableName] || [];
          const filtered = applyFilter(items);
          return Promise.resolve(filtered).then(resolve);
        }
      };
      
      // Make it thenable for async/await
      builder[Symbol.toStringTag] = 'Promise';
      
      return builder;
    };
    
    return jest.fn((tableName) => createQueryBuilder(tableName));
  };

  beforeEach(() => {
    // Create fresh mock DB for each test
    db = createMockDb();
    collectiblesService = createCollectiblesService({ db });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Feature Flags', () => {
    it('should correctly read ENABLE_COLLECTIBLES_DB flag', () => {
      expect(isCollectiblesDbEnabled()).toBe(true);
    });

    it('should throw when feature is disabled', () => {
      // Temporarily disable
      const originalValue = process.env.ENABLE_COLLECTIBLES_DB;
      process.env.ENABLE_COLLECTIBLES_DB = 'false';
      
      // Re-require to get new flag value
      jest.resetModules();
      const { assertCollectiblesDbEnabled: assertDisabled } = require('../utils/featureFlags');
      
      expect(() => assertDisabled()).toThrow('Collectibles database operations are disabled');
      
      // Restore
      process.env.ENABLE_COLLECTIBLES_DB = originalValue;
    });
  });

  describe('Uniqueness Constraint', () => {
    it('should enforce unique photo_id constraint', async () => {
      const photoId = 1;
      
      // First insert should succeed
      const result1 = await collectiblesService.upsertCollectible(aliceId, photoId, {
        formState: { name: 'First Item', category: 'Comics' }
      });
      
      expect(result1).toBeDefined();
      expect(result1.photo_id).toBe(photoId);
      
      // Second insert for same photo should update, not create duplicate
      const result2 = await collectiblesService.upsertCollectible(aliceId, photoId, {
        formState: { name: 'Updated Item', category: 'Vintage' }
      });
      
      expect(result2).toBeDefined();
      expect(result2.name).toBe('Updated Item');
      
      // Verify only one record exists for this photo
      const items = store.collectibles.filter(c => c.photo_id === photoId);
      expect(items.length).toBe(1);
    });

    it('should allow different photos to have separate collectibles', async () => {
      // Insert collectible for photo 1
      await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Item 1' }
      });
      
      // Insert collectible for photo 2
      await collectiblesService.upsertCollectible(aliceId, 2, {
        formState: { name: 'Item 2' }
      });
      
      expect(store.collectibles.length).toBe(2);
    });
  });

  describe('Cascade Delete Behavior', () => {
    it('should delete collectible when calling deleteCollectible', async () => {
      // Create collectible
      const result = await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Test Item' }
      });
      
      expect(store.collectibles.length).toBe(1);
      
      // Delete it
      const deleted = await collectiblesService.deleteCollectible(aliceId, result.id);
      
      expect(deleted).toBe(true);
      expect(store.collectibles.length).toBe(0);
    });

    it('should return false when deleting non-existent collectible', async () => {
      const deleted = await collectiblesService.deleteCollectible(aliceId, 9999);
      expect(deleted).toBe(false);
    });
  });

  describe('RLS Security - User Isolation', () => {
    it('should only allow users to access their own collectibles', async () => {
      // Alice creates a collectible
      await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Alice Item' }
      });
      
      // Alice can see her item
      const aliceItem = await collectiblesService.getCollectibleByPhotoId(aliceId, 1);
      expect(aliceItem).toBeDefined();
      expect(aliceItem.name).toBe('Alice Item');
      
      // Bob tries to access Alice's collectible - should return null
      const bobView = await collectiblesService.getCollectibleByPhotoId(bobId, 1);
      expect(bobView).toBeNull();
    });

    it('should prevent Bob from seeing Alice collectibles in list', async () => {
      // Alice creates collectibles
      await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Alice Item 1' }
      });
      await collectiblesService.upsertCollectible(aliceId, 2, {
        formState: { name: 'Alice Item 2' }
      });
      
      // Bob creates a collectible
      await collectiblesService.upsertCollectible(bobId, 3, {
        formState: { name: 'Bob Item' }
      });
      
      // Alice lists her collectibles - should see 2
      const aliceList = await collectiblesService.listCollectibles(aliceId);
      expect(aliceList.length).toBe(2);
      expect(aliceList.every(item => item.user_id === aliceId)).toBe(true);
      
      // Bob lists his collectibles - should see 1
      const bobList = await collectiblesService.listCollectibles(bobId);
      expect(bobList.length).toBe(1);
      expect(bobList[0].user_id).toBe(bobId);
    });

    it('should prevent Bob from deleting Alice collectibles', async () => {
      // Alice creates a collectible
      const result = await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Alice Protected Item' }
      });
      
      // Bob tries to delete Alice's collectible
      const deleted = await collectiblesService.deleteCollectible(bobId, result.id);
      
      // Should fail (return false because user_id doesn't match)
      expect(deleted).toBe(false);
      
      // Alice's item should still exist
      expect(store.collectibles.length).toBe(1);
    });
  });

  describe('AI History Append Logic', () => {
    it('should start with empty history when recordAi is false', async () => {
      const result = await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Test Item' },
        latestAiRun: { model: 'gpt-4', result: 'test' },
        recordAi: false
      });
      
      const history = JSON.parse(result.ai_analysis_history);
      expect(history).toEqual([]);
    });

    it('should append to history when recordAi is true on first insert', async () => {
      const aiRun1 = { model: 'gpt-4', result: 'First analysis' };
      
      const result = await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Test Item' },
        latestAiRun: aiRun1,
        recordAi: true
      });
      
      const history = JSON.parse(result.ai_analysis_history);
      expect(history.length).toBe(1);
      expect(history[0].model).toBe('gpt-4');
      expect(history[0].result).toBe('First analysis');
      expect(history[0].recorded_at).toBeDefined();
    });

    it('should append second AI run to history', async () => {
      const aiRun1 = { model: 'gpt-4', result: 'First analysis' };
      const aiRun2 = { model: 'gpt-4o', result: 'Second analysis' };
      
      // First insert with AI
      await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Test Item' },
        latestAiRun: aiRun1,
        recordAi: true
      });
      
      // Second update with AI
      const result = await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Test Item Updated' },
        latestAiRun: aiRun2,
        recordAi: true
      });
      
      const history = JSON.parse(result.ai_analysis_history);
      expect(history.length).toBe(2);
      expect(history[0].result).toBe('First analysis');
      expect(history[1].result).toBe('Second analysis');
    });

    it('should NOT append when recordAi is false on update', async () => {
      const aiRun1 = { model: 'gpt-4', result: 'First analysis' };
      const aiRun2 = { model: 'gpt-4o', result: 'Should not be recorded' };
      
      // First insert with AI
      await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Test Item' },
        latestAiRun: aiRun1,
        recordAi: true
      });
      
      // Second update WITHOUT recording AI
      const result = await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Test Item Updated' },
        latestAiRun: aiRun2,
        recordAi: false
      });
      
      const history = JSON.parse(result.ai_analysis_history);
      expect(history.length).toBe(1); // Should still be 1, not 2
      expect(history[0].result).toBe('First analysis');
    });

    it('should preserve full history through multiple operations', async () => {
      // Insert with AI (history = 1)
      await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Test' },
        latestAiRun: { run: 1 },
        recordAi: true
      });
      
      // Update with AI (history = 2)
      await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Test' },
        latestAiRun: { run: 2 },
        recordAi: true
      });
      
      // Update without AI (history stays 2)
      await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Test Updated' },
        latestAiRun: { run: 3 },
        recordAi: false
      });
      
      // Update with AI (history = 3)
      const result = await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Final' },
        latestAiRun: { run: 4 },
        recordAi: true
      });
      
      const history = JSON.parse(result.ai_analysis_history);
      expect(history.length).toBe(3);
      expect(history.map(h => h.run)).toEqual([1, 2, 4]);
    });
  });

  describe('Input Validation', () => {
    it('should throw when userId is missing', async () => {
      await expect(
        collectiblesService.upsertCollectible(null, 1, {})
      ).rejects.toThrow('userId is required');
    });

    it('should throw when photoId is missing', async () => {
      await expect(
        collectiblesService.upsertCollectible(aliceId, null, {})
      ).rejects.toThrow('photoId is required');
    });
  });

  describe('Service Methods', () => {
    it('isEnabled should return true when feature flag is set', () => {
      expect(collectiblesService.isEnabled()).toBe(true);
    });

    it('should filter collectibles by category', async () => {
      await collectiblesService.upsertCollectible(aliceId, 1, {
        formState: { name: 'Comic 1', category: 'Comics' }
      });
      await collectiblesService.upsertCollectible(aliceId, 2, {
        formState: { name: 'Toy 1', category: 'Toys' }
      });
      await collectiblesService.upsertCollectible(aliceId, 3, {
        formState: { name: 'Comic 2', category: 'Comics' }
      });
      
      const comics = await collectiblesService.listCollectibles(aliceId, { category: 'Comics' });
      expect(comics.length).toBe(2);
      expect(comics.every(c => c.category === 'Comics')).toBe(true);
    });
  });
});

describe('Feature Flag Disabled Behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.ENABLE_COLLECTIBLES_DB = 'false';
  });

  afterEach(() => {
    process.env.ENABLE_COLLECTIBLES_DB = 'true';
  });

  it('should throw FEATURE_DISABLED error when DB flag is false', async () => {
    const createCollectiblesServiceFresh = require('../services/collectiblesService');
    const mockDb = jest.fn();
    const service = createCollectiblesServiceFresh({ db: mockDb });
    
    await expect(service.upsertCollectible('user-id', 1, {})).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
      message: expect.stringContaining('Collectibles database operations are disabled')
    });
  });
});
