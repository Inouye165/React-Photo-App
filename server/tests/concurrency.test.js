/**
 * Concurrency Limiting Tests for Image Processing
 * 
 * These tests verify that the concurrency limiting mechanism works correctly
 * to prevent DoS attacks through resource exhaustion.
 */

// Mock sharp before importing the module under test
jest.mock('sharp', () => {
  const mockSharp = jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({ format: 'jpeg' }),
    rotate: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    withMetadata: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-thumbnail'))
  }));
  mockSharp.concurrency = jest.fn();
  mockSharp.cache = jest.fn();
  return mockSharp;
});

jest.mock('heic-convert');
jest.mock('../lib/supabaseClient', () => ({
  storage: {
    from: jest.fn().mockReturnValue({
      list: jest.fn().mockResolvedValue({ data: [], error: null }),
      upload: jest.fn().mockResolvedValue({ data: { path: 'test' }, error: null })
    })
  }
}));

describe('Image Processing Concurrency Limiting', () => {
  let imageModule;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the module cache to get fresh limiter instance
    jest.resetModules();
  });

  describe('getImageProcessingLimit', () => {
    test('should return a limiter function', () => {
      imageModule = require('../media/image');
      const limit = imageModule.getImageProcessingLimit();
      
      expect(typeof limit).toBe('function');
    });

    test('should use the same underlying limiter instance on subsequent calls', async () => {
      imageModule = require('../media/image');
      
      // The limiter instance should be the same
      const limiter = imageModule.imageProcessingLimiter;
      
      // Execute two tasks and verify they use the same limiter
      let activeCount = 0;
      let maxConcurrent = 0;
      
      const limit = imageModule.getImageProcessingLimit();
      const promises = [1, 2, 3].map(() => 
        limit(async () => {
          activeCount++;
          maxConcurrent = Math.max(maxConcurrent, activeCount);
          await new Promise(resolve => setTimeout(resolve, 10));
          activeCount--;
          return 'done';
        })
      );
      
      await Promise.all(promises);
      
      // Verify the limiter instance stats
      expect(limiter.getStats().active).toBe(0);
      expect(maxConcurrent).toBeLessThanOrEqual(limiter.getStats().maxConcurrency);
    });
  });

  describe('ConcurrencyLimiter class', () => {
    test('should expose the ConcurrencyLimiter class', () => {
      imageModule = require('../media/image');
      expect(imageModule.ConcurrencyLimiter).toBeDefined();
    });

    test('should create a limiter with specified concurrency', () => {
      imageModule = require('../media/image');
      const limiter = new imageModule.ConcurrencyLimiter(3);
      const stats = limiter.getStats();
      
      expect(stats.maxConcurrency).toBe(3);
      expect(stats.active).toBe(0);
      expect(stats.pending).toBe(0);
    });

    test('should reject when queue is full', async () => {
      imageModule = require('../media/image');
      const limiter = new imageModule.ConcurrencyLimiter(1, { maxQueue: 1, queueTimeoutMs: 1000 });

      const slow = () => new Promise(resolve => setTimeout(resolve, 50));

      const first = limiter.limit(slow);
      const second = limiter.limit(slow);
      const third = limiter.limit(slow).catch(err => err);

      const error = await third;
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('IMAGE_PROCESSING_QUEUE_FULL');

      await Promise.all([first, second]);
    });

    test('should reject when queued too long', async () => {
      imageModule = require('../media/image');
      const limiter = new imageModule.ConcurrencyLimiter(1, { maxQueue: 1, queueTimeoutMs: 20 });

      const slow = () => new Promise(resolve => setTimeout(resolve, 80));

      const first = limiter.limit(slow);
      const timed = limiter.limit(slow).catch(err => err);

      const error = await timed;
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('IMAGE_PROCESSING_QUEUE_TIMEOUT');

      await first;
    });
  });

  describe('Concurrency Queue Behavior', () => {
    test('should process all concurrent requests successfully', async () => {
      imageModule = require('../media/image');
      const limit = imageModule.getImageProcessingLimit();
      
      // Track execution
      const executionOrder = [];
      let activeCount = 0;
      let maxConcurrent = 0;
      
      // Create a mock "heavy" work function
      const mockHeavyWork = async (id) => {
        activeCount++;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        executionOrder.push(`start-${id}`);
        
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 10));
        
        executionOrder.push(`end-${id}`);
        activeCount--;
        return `result-${id}`;
      };
      
      // Fire 5 concurrent requests through the limiter
      const promises = [1, 2, 3, 4, 5].map(id => 
        limit(() => mockHeavyWork(id))
      );
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      expect(results).toEqual([
        'result-1',
        'result-2',
        'result-3',
        'result-4',
        'result-5'
      ]);
      
      // Verify concurrency was limited (max should be <= 2 based on our config)
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    test('should queue requests when limit is reached', async () => {
      imageModule = require('../media/image');
      const limit = imageModule.getImageProcessingLimit();
      
      const startTimes = [];
      const endTimes = [];
      
      const mockSlowWork = async (id) => {
        startTimes.push({ id, time: Date.now() });
        await new Promise(resolve => setTimeout(resolve, 50));
        endTimes.push({ id, time: Date.now() });
        return id;
      };
      
      // Fire 4 concurrent requests
      const startTime = Date.now();
      const promises = [1, 2, 3, 4].map(id => limit(() => mockSlowWork(id)));
      
      await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // With limit of 2 and 50ms work each, 4 tasks should take ~100ms minimum
      // (2 batches of 2 concurrent tasks)
      expect(totalTime).toBeGreaterThanOrEqual(90); // Allow some margin
    });

    test('should handle errors without blocking the queue', async () => {
      imageModule = require('../media/image');
      const limit = imageModule.getImageProcessingLimit();
      
      const results = [];
      
      const mockWork = async (id, shouldFail) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        if (shouldFail) {
          throw new Error(`Task ${id} failed`);
        }
        return `success-${id}`;
      };
      
      // Mix of successful and failing tasks
      const promises = [
        limit(() => mockWork(1, false)).then(r => results.push(r)).catch(() => results.push('error-1')),
        limit(() => mockWork(2, true)).then(r => results.push(r)).catch(() => results.push('error-2')),
        limit(() => mockWork(3, false)).then(r => results.push(r)).catch(() => results.push('error-3')),
        limit(() => mockWork(4, true)).then(r => results.push(r)).catch(() => results.push('error-4')),
        limit(() => mockWork(5, false)).then(r => results.push(r)).catch(() => results.push('error-5'))
      ];
      
      await Promise.all(promises);
      
      // All tasks should complete (success or error)
      expect(results).toHaveLength(5);
      expect(results).toContain('success-1');
      expect(results).toContain('error-2');
      expect(results).toContain('success-3');
      expect(results).toContain('error-4');
      expect(results).toContain('success-5');
    });
  });

  describe('Sharp Configuration', () => {
    test('should configure sharp concurrency on module load', () => {
      // Re-require the module to trigger configuration
      jest.resetModules();
      jest.mock('sharp', () => {
        const mockSharp = jest.fn(() => ({
          metadata: jest.fn().mockResolvedValue({ format: 'jpeg' }),
          rotate: jest.fn().mockReturnThis(),
          resize: jest.fn().mockReturnThis(),
          withMetadata: jest.fn().mockReturnThis(),
          jpeg: jest.fn().mockReturnThis(),
          webp: jest.fn().mockReturnThis(),
          toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock'))
        }));
        mockSharp.concurrency = jest.fn();
        mockSharp.cache = jest.fn();
        return mockSharp;
      });
      
      require('../media/image');
      const sharpMock = require('sharp');
      
      expect(sharpMock.concurrency).toHaveBeenCalledWith(1);
      expect(sharpMock.cache).toHaveBeenCalledWith({ memory: 50, files: 10, items: 100 });
    });
  });

  describe('generateThumbnail with Concurrency', () => {
    test('should complete multiple thumbnail generations', async () => {
      imageModule = require('../media/image');
      
      const testBuffers = [
        Buffer.from('image-1'),
        Buffer.from('image-2'),
        Buffer.from('image-3')
      ];
      
      const hashes = ['hash1', 'hash2', 'hash3'];
      
      // Fire concurrent thumbnail generations
      const promises = testBuffers.map((buf, i) => 
        imageModule.generateThumbnail(buf, hashes[i])
      );
      
      const results = await Promise.all(promises);
      
      // All should return thumbnail paths
      expect(results).toEqual([
        'thumbnails/hash1.webp',
        'thumbnails/hash2.webp',
        'thumbnails/hash3.webp'
      ]);
    });
  });

  describe('convertHeicToJpegBuffer with Concurrency', () => {
    test('should process multiple conversions through the limiter', async () => {
      imageModule = require('../media/image');
      
      // For non-HEIF files, should return original buffer
      const testBuffers = [
        Buffer.from('jpeg-1'),
        Buffer.from('jpeg-2'),
        Buffer.from('jpeg-3'),
        Buffer.from('jpeg-4'),
        Buffer.from('jpeg-5')
      ];
      
      const promises = testBuffers.map(buf => 
        imageModule.convertHeicToJpegBuffer(buf, 85)
      );
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result).toEqual(testBuffers[i]);
      });
    });
  });

  describe('Stress Test', () => {
    test('should handle 10 concurrent requests without blocking', async () => {
      imageModule = require('../media/image');
      const limit = imageModule.getImageProcessingLimit();
      
      const CONCURRENT_REQUESTS = 10;
      let completedCount = 0;
      
      const mockWork = async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        completedCount++;
        return 'done';
      };
      
      const startTime = Date.now();
      const promises = Array(CONCURRENT_REQUESTS).fill(null).map(() => 
        limit(mockWork)
      );
      
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      // All should complete
      expect(completedCount).toBe(CONCURRENT_REQUESTS);
      
      // With limit=2 and 20ms work, 10 tasks should complete in ~100ms (5 batches)
      // Give generous margin for test environment variability
      expect(duration).toBeLessThan(1000);
    }, 10000); // Increase timeout for stress test
  });

  describe('Limiter Stats', () => {
    test('should track active and pending counts correctly', async () => {
      imageModule = require('../media/image');
      const limiter = imageModule.imageProcessingLimiter;
      
      // Initially everything should be 0
      let stats = limiter.getStats();
      expect(stats.active).toBe(0);
      expect(stats.pending).toBe(0);
      
      // Start a slow task
      const slowTask = limiter.limit(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'done';
      });
      
      // Give a moment for the task to start
      await new Promise(resolve => setTimeout(resolve, 5));
      
      stats = limiter.getStats();
      expect(stats.active).toBeGreaterThanOrEqual(1);
      
      // Wait for completion
      await slowTask;
      
      stats = limiter.getStats();
      expect(stats.active).toBe(0);
      expect(stats.pending).toBe(0);
    });
  });
});
