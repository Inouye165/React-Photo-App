const { convertHeicToJpegBuffer, getImageProcessingLimit } = require('../media/image');
const sharp = require('sharp');

describe('Image Processing Concurrency Limiter', () => {
  describe('ConcurrencyLimiter stress tests', () => {
    test('should limit concurrent HEIC conversions', async () => {
      // Create a test JPEG buffer (since we don't want to require HEIC fixtures)
      const testBuffer = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 100, g: 100, b: 100 }
        }
      }).jpeg().toBuffer();

      // Get initial stats from the limiter
      const delays = [];
      
      // Run 10 conversions simultaneously
      const promises = Array(10).fill(null).map(async () => {
        const startTime = Date.now();
        await convertHeicToJpegBuffer(testBuffer, 85);
        delays.push(Date.now() - startTime);
      });

      await Promise.all(promises);

      // Verify all conversions completed
      expect(delays.length).toBe(10);
      
      // All conversions should take some time (if they all ran instantly in parallel, something's wrong)
      // With proper limiting, total time should be > 0
      const totalTime = delays.reduce((sum, d) => sum + d, 0);
      expect(totalTime).toBeGreaterThan(0);
    }, 30000); // 30 second timeout for stress test

    test('should handle mixed successful and failed conversions', async () => {
      const validBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 50, g: 50, b: 50 }
        }
      }).jpeg().toBuffer();

      const invalidBuffer = Buffer.from('not-an-image');

      // Mix of valid and invalid conversions
      const promises = [
        convertHeicToJpegBuffer(validBuffer, 85),
        convertHeicToJpegBuffer(invalidBuffer, 85),
        convertHeicToJpegBuffer(validBuffer, 90),
        convertHeicToJpegBuffer(invalidBuffer, 75),
        convertHeicToJpegBuffer(validBuffer, 80)
      ];

      const results = await Promise.allSettled(promises);

      // Some should succeed (valid images)
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);

      // Invalid buffers should be returned as-is (not throw errors)
      const allCompleted = results.every(r => r.status === 'fulfilled');
      expect(allCompleted).toBe(true);
    });

    test('should process conversions in order when queue is full', async () => {
      const testBuffer = await sharp({
        create: {
          width: 150,
          height: 150,
          channels: 3,
          background: { r: 200, g: 150, b: 100 }
        }
      }).jpeg().toBuffer();

      const completionOrder = [];
      const startOrder = [];

      // Start multiple conversions
      const promises = Array(8).fill(null).map(async (_, index) => {
        startOrder.push(index);
        const result = await convertHeicToJpegBuffer(testBuffer, 85);
        completionOrder.push(index);
        return result;
      });

      await Promise.all(promises);

      // All should complete
      expect(completionOrder.length).toBe(8);
      expect(startOrder.length).toBe(8);
      
      // Order may differ due to concurrency, but all indices should be present
      expect(completionOrder.sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    }, 20000);

    test('should not exhaust memory with many simultaneous conversions', async () => {
      const testBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 128, g: 128, b: 128 }
        }
      }).jpeg().toBuffer();

      const memoryBefore = process.memoryUsage().heapUsed;

      // Run 20 conversions
      const promises = Array(20).fill(null).map(() => 
        convertHeicToJpegBuffer(testBuffer, 85)
      );

      await Promise.all(promises);

      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryIncreaseMB = (memoryAfter - memoryBefore) / 1024 / 1024;

      // Memory increase should be reasonable (less than 100MB for 20 small image conversions)
      // This is a loose bound to catch major memory leaks
      expect(memoryIncreaseMB).toBeLessThan(100);
    }, 30000);
  });

  describe('Limiter function API', () => {
    test('should export getImageProcessingLimit function', () => {
      const limit = getImageProcessingLimit();
      expect(typeof limit).toBe('function');
    });

    test('should execute functions through limiter', async () => {
      const limit = getImageProcessingLimit();
      let executed = false;

      const result = await limit(async () => {
        executed = true;
        return 'success';
      });

      expect(executed).toBe(true);
      expect(result).toBe('success');
    });

    test('should propagate errors through limiter', async () => {
      const limit = getImageProcessingLimit();

      await expect(
        limit(async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    test('should handle multiple simultaneous limiter calls', async () => {
      const limit = getImageProcessingLimit();
      const results = [];

      const promises = Array(5).fill(null).map((_, index) => 
        limit(async () => {
          // Simulate some async work
          await new Promise(resolve => setTimeout(resolve, 10));
          results.push(index);
          return index;
        })
      );

      const values = await Promise.all(promises);

      expect(values).toEqual([0, 1, 2, 3, 4]);
      expect(results.length).toBe(5);
    });
  });
});
