/**
 * Preferences Snapshot Tests - Sprint 3
 * 
 * Tests the "snapshotting" behavior where the condition definition
 * is captured from user preferences at the time of saving a collectible.
 * 
 * @module server/tests/preferences.snapshot.test.js
 */

'use strict';

// Set feature flags for tests
process.env.ENABLE_COLLECTIBLES_DB = 'true';
process.env.ENABLE_COLLECTIBLES_AI = 'true';

const createCollectiblesService = require('../services/collectiblesService');
const createUserPreferencesService = require('../services/userPreferences');

describe('Preferences Snapshot Tests - Sprint 3', () => {
  let db;
  let collectiblesService;
  let preferencesService;
  let store;
  
  // Test user ID
  const testUserId = '33333333-3333-3333-3333-333333333333';
  const testPhotoId = 1001;

  // Create a mock database for unit tests
  const createMockDb = () => {
    store = {
      collectibles: [],
      users: [
        {
          id: testUserId,
          email: 'test@example.com',
          preferences: JSON.stringify({ gradingScales: {} }),
          updated_at: new Date().toISOString()
        }
      ],
      nextId: 1
    };
    
    const createQueryBuilder = (tableName) => {
      let conditions = {};
      let selectFields = null;
      let pendingInsertData = null;
      
      const applyFilter = (items) => {
        return items.filter(item => {
          for (const [key, value] of Object.entries(conditions)) {
            if (item[key] !== value) return false;
          }
          return true;
        });
      };
      
      const builder = {
        select: jest.fn((fields) => {
          selectFields = fields;
          return builder;
        }),
        where: jest.fn((cond) => {
          if (typeof cond === 'object') {
            Object.assign(conditions, cond);
          }
          return builder;
        }),
        first: jest.fn(async () => {
          const items = store[tableName] || [];
          const filtered = applyFilter(items);
          if (filtered.length === 0) return null;
          const item = filtered[0];
          if (selectFields && typeof selectFields === 'string') {
            return { [selectFields]: item[selectFields] };
          }
          return item;
        }),
        update: jest.fn(async (data) => {
          const items = store[tableName] || [];
          const filtered = applyFilter(items);
          if (filtered.length > 0) {
            Object.assign(filtered[0], data);
          }
          return 1;
        }),
        insert: jest.fn((data) => {
          pendingInsertData = data;
          return builder;
        }),
        onConflict: jest.fn(() => {
          // Return builder to continue chain
          return builder;
        }),
        merge: jest.fn(async (mergeData) => {
          // Upsert: update if exists, insert if not
          const items = store[tableName] || [];
          const existing = applyFilter(items)[0];
          if (existing) {
            Object.assign(existing, mergeData || pendingInsertData);
          } else {
            const newItem = {
              id: pendingInsertData.id || store.nextId++,
              ...pendingInsertData
            };
            items.push(newItem);
            store[tableName] = items;
          }
          return 1;
        }),
        returning: jest.fn(async () => {
          const items = store[tableName] || [];
          const newItem = {
            id: store.nextId++,
            ...pendingInsertData
          };
          items.push(newItem);
          store[tableName] = items;
          return [{ id: newItem.id }];
        })
      };
      
      return builder;
    };
    
    return jest.fn((tableName) => createQueryBuilder(tableName));
  };

  beforeEach(() => {
    db = createMockDb();
    collectiblesService = createCollectiblesService({ db });
    preferencesService = createUserPreferencesService({ db });
    
    // Reset store with fresh user
    store.users = [
      {
        id: testUserId,
        email: 'test@example.com',
        preferences: JSON.stringify({ gradingScales: {} }),
        updated_at: new Date().toISOString()
      }
    ];
    store.collectibles = [];
  });

  describe('Snapshotting Behavior', () => {
    test('should snapshot condition definition from user preferences', async () => {
      // 1. Create a user with a custom preference: Pyrex -> "DWD" = "Dishwasher Damage"
      const customPrefs = {
        gradingScales: {
          Pyrex: [
            { label: 'Mint', rank: 5, definition: 'Perfect condition' },
            { label: 'DWD', rank: 1, definition: 'Dishwasher Damage' }
          ]
        }
      };
      
      store.users[0].preferences = JSON.stringify(customPrefs);
      
      // 2. Call collectiblesService.upsertCollectible with category: "Pyrex", condition_label: "DWD"
      const result = await collectiblesService.upsertCollectible(testUserId, testPhotoId, {
        formState: {
          category: 'Pyrex',
          conditionLabel: 'DWD',
          conditionRank: 1,
          name: 'Test Pyrex Bowl'
        }
      });
      
      // 3. Assert: The saved row has condition_def equal to "Dishwasher Damage"
      expect(result.condition_def).toBe('Dishwasher Damage');
    });

    test('should use provided conditionDef if already set (no override)', async () => {
      // If the caller provides conditionDef, don't look it up
      const customPrefs = {
        gradingScales: {
          Pyrex: [
            { label: 'DWD', rank: 1, definition: 'User definition from prefs' }
          ]
        }
      };
      
      store.users[0].preferences = JSON.stringify(customPrefs);
      
      const result = await collectiblesService.upsertCollectible(testUserId, testPhotoId, {
        formState: {
          category: 'Pyrex',
          conditionLabel: 'DWD',
          conditionRank: 1,
          conditionDef: 'Explicit definition passed in',
          name: 'Test Pyrex Bowl'
        }
      });
      
      // Should use the explicitly passed definition, not look it up
      expect(result.condition_def).toBe('Explicit definition passed in');
    });

    test('should fall back to default scales if user has no custom preference', async () => {
      // User has no custom preferences for Pyrex
      store.users[0].preferences = JSON.stringify({ gradingScales: {} });
      
      const result = await collectiblesService.upsertCollectible(testUserId, testPhotoId, {
        formState: {
          category: 'Pyrex',
          conditionLabel: 'DWD',
          conditionRank: 1,
          name: 'Test Pyrex Bowl'
        }
      });
      
      // Should fall back to default DWD definition
      expect(result.condition_def).toBe('Dishwasher Damage - significant fading, scratches, or pattern loss from dishwasher use');
    });

    test('should return null condition_def if label not found anywhere', async () => {
      store.users[0].preferences = JSON.stringify({ gradingScales: {} });
      
      const result = await collectiblesService.upsertCollectible(testUserId, testPhotoId, {
        formState: {
          category: 'UnknownCategory',
          conditionLabel: 'NonExistentLabel',
          conditionRank: 1,
          name: 'Mystery Item'
        }
      });
      
      // Should be null since no definition exists
      expect(result.condition_def).toBeNull();
    });

    test('should snapshot definition even on update (re-snapshot)', async () => {
      // First, create with initial definition
      const initialPrefs = {
        gradingScales: {
          Comics: [
            { label: 'Mint', rank: 5, definition: 'Perfect - Version 1' }
          ]
        }
      };
      store.users[0].preferences = JSON.stringify(initialPrefs);
      
      await collectiblesService.upsertCollectible(testUserId, testPhotoId, {
        formState: {
          category: 'Comics',
          conditionLabel: 'Mint',
          conditionRank: 5,
          name: 'Amazing Spider-Man #1'
        }
      });
      
      // User updates their definition
      const updatedPrefs = {
        gradingScales: {
          Comics: [
            { label: 'Mint', rank: 5, definition: 'Perfect - Version 2 (updated)' }
          ]
        }
      };
      store.users[0].preferences = JSON.stringify(updatedPrefs);
      
      // Update the collectible (should re-snapshot the new definition)
      const result = await collectiblesService.upsertCollectible(testUserId, testPhotoId, {
        formState: {
          category: 'Comics',
          conditionLabel: 'Mint',
          conditionRank: 5,
          name: 'Amazing Spider-Man #1'
        }
      });
      
      // Should have the updated definition
      expect(result.condition_def).toBe('Perfect - Version 2 (updated)');
    });
  });

  describe('User Preferences Service', () => {
    test('should get user preferences', async () => {
      const customPrefs = {
        gradingScales: {
          Pyrex: [
            { label: 'Mint', rank: 5, definition: 'Perfect' }
          ]
        }
      };
      store.users[0].preferences = JSON.stringify(customPrefs);
      
      const prefs = await preferencesService.getPreferences(testUserId);
      
      expect(prefs.gradingScales.Pyrex).toHaveLength(1);
      expect(prefs.gradingScales.Pyrex[0].label).toBe('Mint');
    });

    test('should update user preferences', async () => {
      const newPrefs = {
        gradingScales: {
          Coins: [
            { label: 'MS-70', rank: 5, definition: 'Perfect uncirculated' }
          ]
        }
      };
      
      const result = await preferencesService.updatePreferences(testUserId, newPrefs);
      
      expect(result.gradingScales.Coins).toHaveLength(1);
      expect(result.gradingScales.Coins[0].label).toBe('MS-70');
    });

    test('should validate rank range (1-5)', async () => {
      const invalidPrefs = {
        gradingScales: {
          Test: [
            { label: 'Invalid', rank: 10, definition: 'Bad rank' }
          ]
        }
      };
      
      await expect(preferencesService.updatePreferences(testUserId, invalidPrefs))
        .rejects.toThrow('Invalid rank 10');
    });

    test('should get specific definition', async () => {
      const customPrefs = {
        gradingScales: {
          Pyrex: [
            { label: 'DWD', rank: 1, definition: 'Custom DWD meaning' }
          ]
        }
      };
      store.users[0].preferences = JSON.stringify(customPrefs);
      
      const def = await preferencesService.getDefinition(testUserId, 'Pyrex', 'DWD');
      
      expect(def).toBe('Custom DWD meaning');
    });

    test('should load defaults without overwriting existing', async () => {
      const existingPrefs = {
        gradingScales: {
          Pyrex: [
            { label: 'Custom', rank: 3, definition: 'My custom grade' }
          ]
        }
      };
      store.users[0].preferences = JSON.stringify(existingPrefs);
      
      // Load defaults - should add Comics but not overwrite Pyrex
      const result = await preferencesService.loadDefaults(testUserId, ['Comics', 'Pyrex']);
      
      // Existing Pyrex should be preserved
      expect(result.gradingScales.Pyrex[0].label).toBe('Custom');
      // Comics should be added from defaults
      expect(result.gradingScales.Comics).toBeDefined();
      expect(result.gradingScales.Comics.length).toBeGreaterThan(0);
    });

    test('should return available default categories', () => {
      const categories = preferencesService.getAvailableDefaults();
      
      expect(categories).toContain('Comics');
      expect(categories).toContain('Pyrex');
      expect(categories).toContain('Trading Cards');
      expect(categories).toContain('Coins');
      expect(categories).toContain('Toys');
    });
  });
});
