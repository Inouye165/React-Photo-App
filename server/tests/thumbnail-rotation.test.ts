const backgroundProcessor = require('../media/backgroundProcessor');
const image = require('../media/image');
const sharp = require('sharp');

// Mock dependencies
jest.mock('sharp');
jest.mock('../lib/supabaseClient', () => ({
  storage: {
    from: jest.fn(() => ({
      list: jest.fn().mockResolvedValue({ data: [] }),
      upload: jest.fn().mockResolvedValue({ error: null }),
      download: jest.fn().mockResolvedValue({ data: { arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('')) } })
    }))
  }
}));
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('Thumbnail Generation Fixes', () => {
  let mockSharpInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup sharp mock chain
    mockSharpInstance = {
      resize: jest.fn().mockReturnThis(),
      rotate: jest.fn().mockReturnThis(),
      webp: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumbnail-data')),
      metadata: jest.fn().mockResolvedValue({ format: 'jpeg' }),
      withMetadata: jest.fn().mockReturnThis()
    };

    sharp.mockReturnValue(mockSharpInstance);
    sharp.concurrency = jest.fn();
    sharp.cache = jest.fn();
  });

  describe('backgroundProcessor.generateAndUploadThumbnail', () => {
    it('should apply rotation and use high quality settings', async () => {
      const buffer = Buffer.from('fake-image');
      const filename = 'test.jpg';
      const hash = 'abc123hash';

      await backgroundProcessor.generateAndUploadThumbnail(buffer, filename, hash);

      // Verify sharp was called with buffer
      expect(sharp).toHaveBeenCalledWith(buffer);

      // Verify rotation is applied (this will fail before fix)
      expect(mockSharpInstance.rotate).toHaveBeenCalled();

      // Verify resize dimensions - 800x800 for high-DPI display support
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(800, 800, { fit: 'inside' });

      // Verify webp quality for thumbnails
      expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 80 });
    });
  });

  describe('image.generateThumbnail', () => {
    it('should apply rotation before resizing', async () => {
      const buffer = Buffer.from('fake-image');
      const filename = 'test.jpg';
      const hash = 'abc123hash';

      // We need to mock fs.promises if image.js uses it, but here we pass buffer
      // image.generateThumbnail takes (input, filename, hash)
      
      await image.generateThumbnail(buffer, filename, hash);

      // Verify sharp was called
      // Note: image.js might call sharp multiple times (metadata, etc)
      // We want to check the one that generates the thumbnail
      
      // Verify rotation is applied (this will fail before fix)
      expect(mockSharpInstance.rotate).toHaveBeenCalled();
      
      // Verify resize is called with 800x800 for high-DPI display support
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(800, 800, { fit: 'inside' });

      // Verify webp output is requested
      expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 80 });
    });
  });
});
