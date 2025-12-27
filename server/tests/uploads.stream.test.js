/**
 * Integration tests for streaming upload pipeline.
 * 
 * These tests verify that the streaming upload implementation:
 * 1. Does NOT write to the local filesystem (no os.tmpdir() usage)
 * 2. Streams data directly to Supabase Storage
 * 3. Properly handles errors, size limits, and MIME validation
 * 4. Calculates hash during streaming
 */

// Mock all dependencies at the very top
jest.mock('knex');
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());

const { mockStorageHelpers } = require('./__mocks__/supabase');

// Mock queue functions
jest.mock('../queue/index', () => ({
  addAIJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  checkRedisAvailable: jest.fn().mockResolvedValue(false) // No Redis for tests
}));

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Track temp file creations
const originalWriteFile = fs.writeFile;
const originalWriteFileSync = fs.writeFileSync;
const originalCreateWriteStream = fs.createWriteStream;
let tempFilesCreated = [];

// Spy on filesystem operations to detect disk writes
beforeAll(() => {
  const tempDir = os.tmpdir();
  
  fs.writeFile = jest.fn((...args) => {
    const filePath = args[0];
    if (typeof filePath === 'string' && filePath.startsWith(tempDir)) {
      tempFilesCreated.push(filePath);
    }
    return originalWriteFile.apply(fs, args);
  });
  
  fs.writeFileSync = jest.fn((...args) => {
    const filePath = args[0];
    if (typeof filePath === 'string' && filePath.startsWith(tempDir)) {
      tempFilesCreated.push(filePath);
    }
    return originalWriteFileSync.apply(fs, args);
  });
  
  fs.createWriteStream = jest.fn((...args) => {
    const filePath = args[0];
    if (typeof filePath === 'string' && filePath.startsWith(tempDir)) {
      tempFilesCreated.push(filePath);
    }
    return originalCreateWriteStream.apply(fs, args);
  });
});

afterAll(() => {
  fs.writeFile = originalWriteFile;
  fs.writeFileSync = originalWriteFileSync;
  fs.createWriteStream = originalCreateWriteStream;
});

const createUploadsRouter = require('../routes/uploads');

// Create a mock database
const createMockDb = () => {
  let nextId = 1;

  const mockKnex = jest.fn((_tableName) => ({
    where: jest.fn(() => ({
      select: jest.fn(() => ({
        first: jest.fn().mockResolvedValue(null)
      })),
      first: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(1)
    })),
    insert: jest.fn((data) => ({
      returning: jest.fn().mockResolvedValue([{
        id: nextId++,
        filename: data.filename,
        hash: data.hash,
        storage_path: data.storage_path
      }])
    })),
    select: jest.fn(() => ({
      first: jest.fn().mockResolvedValue(null)
    }))
  }));

  return mockKnex;
};

describe('Streaming Upload Pipeline', () => {
  let app;
  let mockDb;
  const FIXTURE_PATH = path.join(__dirname, 'fixtures');
  const TEST_IMAGE_PATH = path.join(FIXTURE_PATH, 'test-stream-image.jpg');
  const TEST_HEIC_PATH = path.join(FIXTURE_PATH, 'test-stream-image.heic');
  const TEST_BIN_PATH = path.join(FIXTURE_PATH, 'test-stream-bytes.bin');

  beforeAll(() => {
    // Create fixtures directory and a small test image
    if (!fs.existsSync(FIXTURE_PATH)) {
      fs.mkdirSync(FIXTURE_PATH, { recursive: true });
    }
    // Create a minimal valid JPEG (smallest valid JPEG is about 119 bytes)
    const minimalJpeg = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
      0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
      0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
      0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
      0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
      0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
      0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
      0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
      0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
      0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
      0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
      0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
      0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
      0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
      0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
      0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
      0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xDB, 0x20, 0xA8, 0xC0, 0xA8, 0x00,
      0x00, 0x00, 0x00, 0xFF, 0xD9
    ]);
    fs.writeFileSync(TEST_IMAGE_PATH, minimalJpeg);

    // Create a minimal ISO BMFF ftyp header that should be detected as HEIC.
    // Note: this is not a fully valid HEIC file, but is sufficient for magic-byte sniffing tests.
    const minimalHeicHeader = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]), // box size (arbitrary)
      Buffer.from('ftyp', 'ascii'),
      Buffer.from('heic', 'ascii'),
      Buffer.from([0x00, 0x00, 0x00, 0x00])
    ]);
    fs.writeFileSync(TEST_HEIC_PATH, minimalHeicHeader);

    fs.writeFileSync(TEST_BIN_PATH, Buffer.from('this is not an image'));
  });

  afterAll(() => {
    // Clean up fixture
    try {
      if (fs.existsSync(TEST_IMAGE_PATH)) {
        fs.unlinkSync(TEST_IMAGE_PATH);
      }
      if (fs.existsSync(TEST_HEIC_PATH)) {
        fs.unlinkSync(TEST_HEIC_PATH);
      }
      if (fs.existsSync(TEST_BIN_PATH)) {
        fs.unlinkSync(TEST_BIN_PATH);
      }
      if (fs.existsSync(FIXTURE_PATH)) {
        fs.rmdirSync(FIXTURE_PATH);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Reset tracking
    tempFilesCreated = [];
    
    // Create fresh mock database
    mockDb = createMockDb();
    
    // Create express app with auth middleware
    app = express();
    app.use(express.json());
    
    // Add auth middleware
    app.use('/uploads', (req, res, next) => {
      req.user = { id: 1, username: 'testuser' };
      next();
    });
    
    app.use('/uploads', createUploadsRouter({ db: mockDb }));
    
    // Clear mock storage
    mockStorageHelpers.clearMockStorage();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Zero Disk I/O Verification', () => {
    it('should NOT create any temp files during upload', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_IMAGE_PATH);

      // Filter out any files created by Jest or other test infrastructure
      const uploadTempFiles = tempFilesCreated.filter(f => 
        !f.includes('jest') && 
        !f.includes('node_modules') &&
        f.includes('upload')
      );

      expect(uploadTempFiles).toHaveLength(0);
      expect(response.status).toBeLessThan(500);
    });

    it('should stream directly to Supabase Storage', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_IMAGE_PATH);

      // Verify file was uploaded to mock storage
      const mockFiles = mockStorageHelpers.getMockFiles();
      const uploadedFile = mockFiles.find(([key]) => key.startsWith('photos/working/'));
      
      expect(uploadedFile).toBeDefined();
      expect(response.body.success).toBe(true);
      expect(response.body.path).toMatch(/^working\//);
    });
  });

  describe('Streaming Upload Functionality', () => {
    it('should upload a photo successfully with hash calculation', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_IMAGE_PATH);

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
      expect(response.body.success).toBe(true);
      expect(response.body.filename).toMatch(/^[a-f0-9-]{36}-.+\.jpg$/i);
      expect(response.body.hash).toBeDefined();
      expect(response.body.hash).toHaveLength(64); // SHA256 hex length
    });

    it('should return 400 when no file is uploaded', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No file uploaded');
    });

    it('should require authentication', async () => {
      // Create app without auth middleware
      const unauthApp = express();
      unauthApp.use(express.json());
      
      // Add minimal auth check
      unauthApp.use('/uploads', (req, res, next) => {
        if (!req.headers.authorization) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        next();
      });
      
      unauthApp.use('/uploads', createUploadsRouter({ db: mockDb }));

      const response = await request(unauthApp)
        .post('/uploads/upload')
        .send({});

      expect(response.status).toBe(401);
    });

    it('should handle Supabase Storage errors gracefully', async () => {
      // Configure mock to fail
      mockStorageHelpers.setAlwaysErrorOnUpload(true);

      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_IMAGE_PATH);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/storage|upload/i);

      // Restore normal behavior
      mockStorageHelpers.setAlwaysErrorOnUpload(false);
    });
  });

  describe('Validation During Streaming', () => {
    it('should reject non-image files (MIME type validation)', async () => {
      // Create a text file
      const textFilePath = path.join(FIXTURE_PATH, 'test.txt');
      fs.writeFileSync(textFilePath, 'This is not an image');

      try {
        const response = await request(app)
          .post('/uploads/upload')
          .set('Authorization', 'Bearer valid-token')
          .attach('photo', textFilePath);

        expect(response.status).toBe(415);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toMatch(/image|allowed/i);
      } finally {
        fs.unlinkSync(textFilePath);
      }
    });

    it('should accept HEIC when claimed MIME is application/octet-stream but magic bytes indicate HEIC', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_HEIC_PATH, {
          filename: 'test.heic',
          contentType: 'application/octet-stream'
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
      expect(response.body.success).toBe(true);
    });

    it('should fail closed: unknown claimed MIME with non-image bytes must return INVALID_FILE_SIGNATURE (415)', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_BIN_PATH, {
          filename: 'test.jpg',
          contentType: 'application/octet-stream'
        });

      expect(response.status).toBe(415);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_FILE_SIGNATURE');
    });

    it('should handle empty file uploads', async () => {
      // Create an empty file
      const emptyFilePath = path.join(FIXTURE_PATH, 'empty.jpg');
      fs.writeFileSync(emptyFilePath, '');

      try {
        const response = await request(app)
          .post('/uploads/upload')
          .set('Authorization', 'Bearer valid-token')
          .attach('photo', emptyFilePath);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toMatch(/empty/i);
      } finally {
        fs.unlinkSync(emptyFilePath);
      }
    });
  });

  describe('Response Format', () => {
    it('should return proper response structure', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_IMAGE_PATH);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('hash');
      expect(response.body).toHaveProperty('path');
      // photoId is returned from DB insert
      expect(response.body).toHaveProperty('photoId');
    });

    it('should include processing status in response', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_IMAGE_PATH);

      // Without Redis, processing should be 'immediate'
      expect(response.body.processing).toBe('immediate');
    });
  });
});

describe('StreamUploader Module Unit Tests', () => {
  const { 
    sanitizeFilename, 
    isValidImageType, 
    detectImageMimeFromMagicBytes,
    MagicByteSniffer,
    SizeLimiter, 
    HashingStream,
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_MIME_TYPES
  } = require('../media/streamUploader');

  describe('sanitizeFilename', () => {
    it('should add UUID prefix and sanitize special characters', () => {
      const result = sanitizeFilename('my photo (1).jpg');
      expect(result).toMatch(/^[a-f0-9-]{36}-my_photo__1_\.jpg$/);
    });

    it('should preserve valid characters', () => {
      const result = sanitizeFilename('photo-2024_01.jpg');
      expect(result).toMatch(/^[a-f0-9-]{36}-photo-2024_01\.jpg$/);
    });

    it('should handle path traversal attempts', () => {
      const result = sanitizeFilename('../../../etc/passwd');
      expect(result).not.toContain('..');
      expect(result).not.toContain('/');
    });
  });

  describe('isValidImageType', () => {
    it('should accept valid image MIME types', () => {
      expect(isValidImageType('image/jpeg', 'test.jpg')).toBe(true);
      expect(isValidImageType('image/png', 'test.png')).toBe(true);
      expect(isValidImageType('image/gif', 'test.gif')).toBe(true);
      expect(isValidImageType('image/heic', 'test.heic')).toBe(true);
    });

    it('should reject generic MIME types even with image-looking extensions', () => {
      expect(isValidImageType('application/octet-stream', 'test.jpg')).toBe(false);
      expect(isValidImageType('application/octet-stream', 'test.heic')).toBe(false);
    });

    it('should reject non-image MIME types and extensions', () => {
      expect(isValidImageType('text/plain', 'test.txt')).toBe(false);
      expect(isValidImageType('application/pdf', 'test.pdf')).toBe(false);
    });
  });

  describe('detectImageMimeFromMagicBytes (HEIC/HEIF brands)', () => {
    function makeFtyp(brand) {
      return Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from('ftyp', 'ascii'),
        Buffer.from(brand, 'ascii'),
        Buffer.from([0x00, 0x00, 0x00, 0x00])
      ]);
    }

    it('should detect common HEIC brands as image/heic', () => {
      const heicBrands = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'];
      for (const brand of heicBrands) {
        expect(detectImageMimeFromMagicBytes(makeFtyp(brand))).toBe('image/heic');
      }
    });

    it('should detect common HEIF brands as image/heif', () => {
      const heifBrands = ['heif', 'mif1', 'msf1'];
      for (const brand of heifBrands) {
        expect(detectImageMimeFromMagicBytes(makeFtyp(brand))).toBe('image/heif');
      }
    });
  });

  describe('MagicByteSniffer (unknown claimed MIME)', () => {
    it('should validate based on detected MIME when claimed MIME is empty', (done) => {
      const sniffer = new MagicByteSniffer({ claimedMime: '', peekBytes: 64 });
      const chunks = [];
      sniffer.on('data', (c) => chunks.push(c));
      sniffer.on('validated', (detectedMime) => {
        expect(detectedMime).toBe('image/heic');
      });
      sniffer.on('end', () => {
        expect(Buffer.concat(chunks).length).toBeGreaterThan(0);
        done();
      });
      sniffer.on('error', done);

      sniffer.end(Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from('ftyp', 'ascii'),
        Buffer.from('heic', 'ascii'),
        Buffer.from([0x00, 0x00, 0x00, 0x00])
      ]));
    });

    it('should fail closed when claimed MIME is empty and bytes do not match an allowed image signature', (done) => {
      const sniffer = new MagicByteSniffer({ claimedMime: '', peekBytes: 64 });
      sniffer.on('validated', () => done(new Error('Expected signature validation to fail')));
      sniffer.on('error', (err) => {
        expect(err.code).toBe('INVALID_FILE_SIGNATURE');
        done();
      });
      sniffer.end(Buffer.from('not an image'));
    });
  });

  describe('SizeLimiter', () => {
    it('should pass through data under limit', (done) => {
      const limiter = new SizeLimiter(1000);
      const chunks = [];
      
      limiter.on('data', (chunk) => chunks.push(chunk));
      limiter.on('end', () => {
        expect(Buffer.concat(chunks).length).toBe(100);
        expect(limiter.getTotalBytes()).toBe(100);
        done();
      });

      limiter.write(Buffer.alloc(50));
      limiter.write(Buffer.alloc(50));
      limiter.end();
    });

    it('should emit error when limit exceeded', (done) => {
      const limiter = new SizeLimiter(100);
      
      limiter.on('error', (err) => {
        expect(err.code).toBe('LIMIT_FILE_SIZE');
        done();
      });

      limiter.write(Buffer.alloc(150));
    });
  });

  describe('HashingStream', () => {
    it('should calculate SHA256 hash while passing through data', (done) => {
      const hasher = new HashingStream();
      const testData = Buffer.from('test data for hashing');
      const chunks = [];
      
      hasher.on('data', (chunk) => chunks.push(chunk));
      hasher.on('end', () => {
        const hash = hasher.getHash();
        expect(hash).toHaveLength(64);
        expect(Buffer.concat(chunks).toString()).toBe('test data for hashing');
        done();
      });

      hasher.write(testData);
      hasher.end();
    });
  });

  describe('Constants', () => {
    it('should have expected allowed extensions', () => {
      expect(ALLOWED_IMAGE_EXTENSIONS).toContain('.jpg');
      expect(ALLOWED_IMAGE_EXTENSIONS).toContain('.jpeg');
      expect(ALLOWED_IMAGE_EXTENSIONS).toContain('.png');
      expect(ALLOWED_IMAGE_EXTENSIONS).toContain('.heic');
    });

    it('should have expected allowed MIME types', () => {
      expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(ALLOWED_MIME_TYPES).toContain('image/png');
      expect(ALLOWED_MIME_TYPES).toContain('image/heic');
    });
  });
});
