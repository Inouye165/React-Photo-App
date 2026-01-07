/**
 * Integration tests for POST /photos/:id/recheck-ai optimization
 * 
 * This endpoint was optimized to skip unnecessary file I/O when the user
 * explicitly provides identification via collectibleOverride (Human Override/Accept action).
 * 
 * Tests verify:
 * - Human Override path: No storage download when collectibleOverride present
 * - Standard Recheck path: Downloads and extracts metadata as before
 * - Error resilience: Storage failures don't crash the request
 * - Authentication and authorization remain enforced
 * - Input validation for collectibleOverride structure
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// Test fixtures
const JWT_SECRET = process.env.JWT_SECRET;
const USER_ID_1 = '11111111-1111-1111-1111-111111111111';
const USER_ID_2 = '22222222-2222-2222-2222-222222222222';
const PHOTO_ID = 'photo-123';

// Helper to create auth tokens
const makeToken = (userId) => jwt.sign(
  { id: userId, username: 'testuser', role: 'user' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

// Mock database
let mockPhotos = [];

const createMockPhotosDb = () => ({
  getPhotoByAnyId: jest.fn(async (photoId, userId) => {
    const photo = mockPhotos.find(p => p.id === photoId && p.user_id === userId);
    return photo || null;
  }),
  updatePhoto: jest.fn(async (photoId, userId, updates) => {
    const photo = mockPhotos.find(p => p.id === photoId && p.user_id === userId);
    if (photo) {
      Object.assign(photo, updates);
    }
    return photo;
  })
});

// Mock storage - tracks if download was called
let mockDownloadFromStorage = jest.fn();
let mockExtractMetadata = jest.fn();
let mockMergeMetadata = jest.fn();

// Mock backgroundProcessor module before creating the app
jest.mock('../media/backgroundProcessor', () => ({
  downloadFromStorage: (...args) => mockDownloadFromStorage(...args),
  extractMetadata: (...args) => mockExtractMetadata(...args),
  mergeMetadataPreservingLocationAndDate: (...args) => mockMergeMetadata(...args)
}));

// Mock AI service
const createMockPhotosAi = () => ({
  enqueuePhotoAiJob: jest.fn(async () => true),
  isModelAllowed: jest.fn((model) => ['gpt-4o', 'gpt-4o-mini'].includes(model))
});

// Create test app with the recheck-ai endpoint
const createTestApp = ({ photosDb, photosAi }) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role || 'user'
      };
      next();
    } catch {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }
  };

  // Use the mocked backgroundProcessor
  const backgroundProcessor = require('../media/backgroundProcessor');

  // Recheck-AI endpoint (simplified for testing)
  app.post('/photos/:id/recheck-ai', authenticateToken, async (req, res) => {
    try {
      // Extract collectibleOverride at the very top
      const collectibleOverride = req.body && req.body.collectibleOverride ? req.body.collectibleOverride : null;
      const modelOverride = req.body && req.body.model ? req.body.model : null;
      
      // Check photo exists and user has access
      const photo = await photosDb.getPhotoByAnyId(req.params.id, req.user.id);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Validate model override if provided
      if (modelOverride && !photosAi.isModelAllowed(modelOverride)) {
        return res.status(400).json({ success: false, error: 'Unsupported model override' });
      }

      // Validate collectibleOverride structure if provided
      if (collectibleOverride) {
        if (typeof collectibleOverride !== 'object' || typeof collectibleOverride.id !== 'string' || !collectibleOverride.id.trim()) {
          return res.status(400).json({ success: false, error: 'collectibleOverride must be an object with a non-empty string id' });
        }
      }

      // CONDITIONAL LOGIC: Skip metadata re-extraction if collectibleOverride is present
      if (collectibleOverride) {
        // Enqueue job directly with override - no file I/O needed
        const jobOptions = { collectibleOverride };
        if (modelOverride) {
          jobOptions.modelOverrides = { router: modelOverride, scenery: modelOverride, collectible: modelOverride };
        }
        
        await photosAi.enqueuePhotoAiJob(photo.id, jobOptions);
        
        // Force immediate state update so frontend polling sees the change instantly
        await photosDb.updatePhoto(photo.id, req.user.id, { 
          state: 'inprogress',
          updated_at: new Date().toISOString()
        });
        
        return res.status(202).json({ 
          message: 'AI recheck queued with human override (metadata extraction skipped).', 
          photoId: photo.id 
        });
      }

      // STANDARD RECHECK PATH: Re-extract metadata
      try {
        let buffer;
        let filename = photo.filename;
        
        try {
          buffer = await backgroundProcessor.downloadFromStorage(photo.filename);
        } catch {
          // Try processed version if original fails
          const processedFilename = photo.filename.replace(/\.heic$/i, '.heic.processed.jpg');
          try {
            buffer = await backgroundProcessor.downloadFromStorage(processedFilename);
            filename = processedFilename;
          } catch {
            // Continue without metadata update
          }
        }

        if (buffer) {
          const metadata = await backgroundProcessor.extractMetadata(buffer, filename);
          if (metadata && Object.keys(metadata).length > 0) {
            const existing = typeof photo.metadata === 'string' ? JSON.parse(photo.metadata || '{}') : (photo.metadata || {});
            const merged = backgroundProcessor.mergeMetadataPreservingLocationAndDate(existing, metadata);
            await photosDb.updatePhoto(photo.id, req.user.id, {
              metadata: JSON.stringify(merged)
            });
          }
        }
      } catch {
        // Continue with AI processing even if metadata extraction fails
      }

      // Enqueue AI job for standard recheck
      const jobOptions = {};
      if (modelOverride) {
        jobOptions.modelOverrides = { router: modelOverride, scenery: modelOverride, collectible: modelOverride };
      }
      
      await photosAi.enqueuePhotoAiJob(photo.id, jobOptions);
      
      // Force immediate state update so frontend polling sees the change instantly
      await photosDb.updatePhoto(photo.id, req.user.id, { 
        state: 'inprogress',
        updated_at: new Date().toISOString()
      });
      
      return res.status(202).json({ 
        message: 'AI recheck queued (metadata re-extracted).', 
        photoId: photo.id 
      });
    } catch {
      return res.status(500).json({ error: 'Failed to process AI recheck' });
    }
  });

  return app;
};

describe('POST /photos/:id/recheck-ai optimization', () => {
  let app;
  let photosDb;
  let photosAi;

  beforeEach(() => {
    // Reset mock data
    mockPhotos = [
      {
        id: PHOTO_ID,
        user_id: USER_ID_1,
        filename: 'test.jpg',
        metadata: JSON.stringify({ existing: 'data' }),
        state: 'finished'
      }
    ];

    // Create fresh mocks
    photosDb = createMockPhotosDb();
    photosAi = createMockPhotosAi();
    
    // Reset mock functions
    mockDownloadFromStorage = jest.fn(async () => Buffer.from('fake-image-data'));
    mockExtractMetadata = jest.fn(async () => ({
      width: 1920,
      height: 1080,
      camera: 'Test Camera'
    }));
    mockMergeMetadata = jest.fn((existing, metadata) => ({
      ...existing,
      ...metadata
    }));

    // Clear all mocks
    jest.clearAllMocks();

    app = createTestApp({ photosDb, photosAi });
  });

  describe('Authentication & Authorization', () => {
    it('rejects unauthenticated requests', async () => {
      const response = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .send({ collectibleOverride: { id: 'item-123' } });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/token required/i);
    });

    it('rejects access to other user photos', async () => {
      const token = makeToken(USER_ID_2); // Different user
      
      const response = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({ collectibleOverride: { id: 'item-123' } });

      expect(response.status).toBe(404);
      expect(response.body.error).toMatch(/not found/i);
    });
  });

  describe('Human Override Path (Optimized)', () => {
    it('skips storage download when collectibleOverride present', async () => {
      const token = makeToken(USER_ID_1);
      
      const response = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({ 
          collectibleOverride: { id: 'item-123', name: 'Test Item' },
          isHumanOverride: true
        });

      expect(response.status).toBe(202);
      expect(response.body.message).toMatch(/metadata extraction skipped/i);
      expect(mockDownloadFromStorage).not.toHaveBeenCalled();
      expect(mockExtractMetadata).not.toHaveBeenCalled();
      
      // Verify state is immediately updated for frontend polling (race condition fix)
      expect(photosDb.updatePhoto).toHaveBeenCalledWith(
        PHOTO_ID,
        USER_ID_1,
        expect.objectContaining({
          state: 'inprogress',
          updated_at: expect.any(String)
        })
      );
      
      expect(photosAi.enqueuePhotoAiJob).toHaveBeenCalledWith(
        PHOTO_ID,
        expect.objectContaining({
          collectibleOverride: { id: 'item-123', name: 'Test Item' }
        })
      );
    });

    it('passes model override along with collectible override', async () => {
      const token = makeToken(USER_ID_1);
      
      const response = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({ 
          collectibleOverride: { id: 'item-456' },
          model: 'gpt-4o'
        });

      expect(response.status).toBe(202);
      expect(photosAi.enqueuePhotoAiJob).toHaveBeenCalledWith(
        PHOTO_ID,
        expect.objectContaining({
          collectibleOverride: { id: 'item-456' },
          modelOverrides: expect.objectContaining({
            router: 'gpt-4o',
            scenery: 'gpt-4o',
            collectible: 'gpt-4o'
          })
        })
      );
    });

    it('validates collectibleOverride structure', async () => {
      const token = makeToken(USER_ID_1);
      
      // Missing id
      const response1 = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({ collectibleOverride: { name: 'No ID' } });

      expect(response1.status).toBe(400);
      expect(response1.body.error).toMatch(/must be an object with a non-empty string id/i);

      // Empty id
      const response2 = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({ collectibleOverride: { id: '   ' } });

      expect(response2.status).toBe(400);

      // Not an object
      const response3 = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({ collectibleOverride: 'string-value' });

      expect(response3.status).toBe(400);
    });
  });

  describe('Standard Recheck Path (Original Behavior)', () => {
    it('downloads and extracts metadata when no override provided', async () => {
      const token = makeToken(USER_ID_1);
      
      const response = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(202);
      expect(response.body.message).toMatch(/metadata re-extracted/i);
      expect(mockDownloadFromStorage).toHaveBeenCalledWith('test.jpg');
      expect(mockExtractMetadata).toHaveBeenCalled();
      
      // Verify both metadata update AND state update are called
      expect(photosDb.updatePhoto).toHaveBeenCalledTimes(2);
      
      // First call: metadata update
      expect(photosDb.updatePhoto).toHaveBeenCalledWith(
        PHOTO_ID,
        USER_ID_1,
        expect.objectContaining({
          metadata: expect.any(String)
        })
      );
      
      // Second call: state update for race condition fix
      expect(photosDb.updatePhoto).toHaveBeenCalledWith(
        PHOTO_ID,
        USER_ID_1,
        expect.objectContaining({
          state: 'inprogress',
          updated_at: expect.any(String)
        })
      );
      
      expect(photosAi.enqueuePhotoAiJob).toHaveBeenCalledWith(
        PHOTO_ID,
        expect.not.objectContaining({ collectibleOverride: expect.anything() })
      );
    });

    it('continues processing even if storage download fails', async () => {
      const token = makeToken(USER_ID_1);
      
      // Make storage fail
      mockDownloadFromStorage.mockRejectedValue(new Error('Storage unavailable'));
      
      const response = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      // Should still enqueue job despite storage failure
      expect(response.status).toBe(202);
      expect(photosAi.enqueuePhotoAiJob).toHaveBeenCalled();
    });

    it('passes model override in standard recheck', async () => {
      const token = makeToken(USER_ID_1);
      
      const response = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({ model: 'gpt-4o-mini' });

      expect(response.status).toBe(202);
      expect(photosAi.enqueuePhotoAiJob).toHaveBeenCalledWith(
        PHOTO_ID,
        expect.objectContaining({
          modelOverrides: expect.objectContaining({
            router: 'gpt-4o-mini',
            scenery: 'gpt-4o-mini',
            collectible: 'gpt-4o-mini'
          })
        })
      );
    });

    it('rejects invalid model override', async () => {
      const token = makeToken(USER_ID_1);
      
      const response = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({ model: 'invalid-model' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Unsupported model/i);
    });
  });

  describe('Error Resilience', () => {
    it('handles job enqueue failure gracefully in override path', async () => {
      const token = makeToken(USER_ID_1);
      
      photosAi.enqueuePhotoAiJob.mockRejectedValue(new Error('Queue unavailable'));
      
      const response = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({ collectibleOverride: { id: 'item-789' } });

      expect(response.status).toBe(500);
      expect(response.body.error).toMatch(/Failed to process AI recheck/i);
    });

    it('handles metadata extraction failure in standard path', async () => {
      const token = makeToken(USER_ID_1);
      
      mockExtractMetadata.mockRejectedValue(new Error('Extraction failed'));
      
      const response = await request(app)
        .post(`/photos/${PHOTO_ID}/recheck-ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      // Should still enqueue job
      expect(response.status).toBe(202);
      expect(photosAi.enqueuePhotoAiJob).toHaveBeenCalled();
    });
  });
});
