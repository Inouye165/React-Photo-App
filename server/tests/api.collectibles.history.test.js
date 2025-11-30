/**
 * Integration Tests: Sprint 3 - Collectibles History API
 * 
 * Tests the GET /api/collectibles/:id/history endpoint
 * that retrieves price history data for a collectible.
 */

'use strict';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Mock feature flags before requiring modules
jest.mock('../utils/featureFlags', () => ({
  assertCollectiblesDbEnabled: jest.fn(),
  isCollectiblesDbEnabled: jest.fn(() => true)
}));

const createCollectiblesRouter = require('../routes/collectibles');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

describe('Sprint 3: Collectibles History API', () => {
  let app;
  let mockDb;
  let authToken;
  const testUserId = 'test-user-uuid-123';

  beforeEach(() => {
    // Create fresh mock DB for each test
    mockDb = createMockDb();
    
    // Create auth token
    authToken = jwt.sign(
      { id: testUserId, username: 'testuser', role: 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create Express app with router
    app = express();
    app.use(express.json());
    
    // Mock auth middleware
    app.use((req, res, next) => {
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        try {
          req.user = jwt.verify(token, JWT_SECRET);
          next();
        } catch {
          res.status(401).json({ error: 'Invalid token' });
        }
      } else {
        res.status(401).json({ error: 'No token provided' });
      }
    });

    // Mount the collectibles router
    const collectiblesRouter = createCollectiblesRouter({ db: mockDb });
    app.use('/api', collectiblesRouter);
  });

  describe('GET /api/collectibles/:collectibleId/history', () => {
    test('should return 200 with price history for valid collectible', async () => {
      // Insert mock collectible
      const mockCollectible = {
        id: 1,
        user_id: testUserId,
        photo_id: 100,
        name: 'Test Collectible'
      };

      // Insert mock market data
      const mockMarketData = [
        {
          id: 1,
          collectible_id: 1,
          user_id: testUserId,
          price: 150.00,
          venue: 'eBay',
          url: 'https://ebay.com/item/123',
          date_seen: '2025-11-30T10:00:00Z'
        },
        {
          id: 2,
          collectible_id: 1,
          user_id: testUserId,
          price: 175.50,
          venue: 'Heritage Auctions',
          url: 'https://ha.com/item/456',
          date_seen: '2025-11-29T15:30:00Z'
        }
      ];

      // Setup mock DB responses
      mockDb._setCollectibleLookup(mockCollectible);
      mockDb._setMarketData(mockMarketData);

      const response = await request(app)
        .get('/api/collectibles/1/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.history).toBeInstanceOf(Array);
      expect(response.body.history).toHaveLength(2);
      expect(response.body.history[0].price).toBe(150.00);
      expect(response.body.history[0].venue).toBe('eBay');
      expect(response.body.history[1].price).toBe(175.50);
      expect(response.body.history[1].venue).toBe('Heritage Auctions');
    });

    test('should return 404 for non-existent collectible', async () => {
      // No collectible in mock DB
      mockDb._setCollectibleLookup(null);

      const response = await request(app)
        .get('/api/collectibles/999/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Collectible not found');
    });

    test('should return 404 for collectible owned by different user', async () => {
      // Collectible exists but belongs to different user
      // The join query will return null because user_id doesn't match
      mockDb._setCollectibleLookup(null);

      const response = await request(app)
        .get('/api/collectibles/2/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/collectibles/1/history');
      // No Authorization header

      expect(response.status).toBe(401);
    });

    test('should return empty array when collectible has no market data', async () => {
      const mockCollectible = {
        id: 3,
        user_id: testUserId,
        photo_id: 300,
        name: 'New Collectible'
      };

      mockDb._setCollectibleLookup(mockCollectible);
      mockDb._setMarketData([]); // Empty history

      const response = await request(app)
        .get('/api/collectibles/3/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.history).toBeInstanceOf(Array);
      expect(response.body.history).toHaveLength(0);
    });

    test('should handle database errors gracefully', async () => {
      // Make the query throw an error
      mockDb._setError(new Error('Database connection lost'));

      const response = await request(app)
        .get('/api/collectibles/1/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });
});

/**
 * Create a mock Knex-like database object
 */
function createMockDb() {
  let collectibleLookupResult = null;
  let marketDataResult = [];
  let errorToThrow = null;

  const chainable = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    first: jest.fn().mockImplementation(() => {
      if (errorToThrow) {
        return Promise.reject(errorToThrow);
      }
      return Promise.resolve(collectibleLookupResult);
    })
  };

  // Market data query chain
  const marketDataChain = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockImplementation(() => {
      if (errorToThrow) {
        return Promise.reject(errorToThrow);
      }
      return Promise.resolve(marketDataResult);
    })
  };

  const mockDb = jest.fn((tableName) => {
    if (tableName === 'collectible_market_data') {
      return marketDataChain;
    }
    return chainable;
  });

  // Helper methods to set mock data
  mockDb._setCollectibleLookup = (result) => {
    collectibleLookupResult = result;
  };

  mockDb._setMarketData = (data) => {
    marketDataResult = data;
  };

  mockDb._setError = (error) => {
    errorToThrow = error;
  };

  return mockDb;
}
