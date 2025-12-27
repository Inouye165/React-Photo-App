/**
 * Tests for Public API Routes
 * 
 * Tests the /api/public/* endpoints which are accessible without authentication.
 * Covers validation, rate limiting, and database integration.
 * 
 * This test creates an isolated Express app to avoid conflicts with the main
 * server's middleware and mocking setup.
 */

/* eslint-env jest */

const request = require('supertest');
const express = require('express');

// Create mock functions at module scope so they can be referenced in tests
const mockInsert = jest.fn();
const mockReturning = jest.fn();

// Create a mock database function
const createMockDb = () => {
  const mockDb = jest.fn((_tableName) => ({
    insert: mockInsert.mockReturnValue({
      returning: mockReturning
    }),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn()
  }));
  
  mockDb.raw = jest.fn().mockResolvedValue(true);
  mockDb.fn = {
    now: jest.fn().mockReturnValue('NOW()')
  };
  mockDb.schema = {
    hasTable: jest.fn().mockResolvedValue(true),
    createTable: jest.fn().mockResolvedValue(true),
    dropTableIfExists: jest.fn().mockResolvedValue(true)
  };
  
  return mockDb;
};

// Mock the logger to prevent console spam
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn()
}));

// Create an isolated test app with just the public router
function createTestApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  
  // Import and mount the public router with mock db
  const createPublicRouter = require('../routes/public');
  const mockDb = createMockDb();
  app.use('/api/public', createPublicRouter({ db: mockDb }));
  
  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });
  
  return app;
}

describe('Public API Routes', () => {
  let app;
  
  beforeAll(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();
    
    // Setup default successful insert mock
    mockReturning.mockResolvedValue([{
      id: '123e4567-e89b-12d3-a456-426614174000',
      created_at: new Date().toISOString()
    }]);
  });

  describe('POST /api/public/contact', () => {
    const validPayload = {
      name: 'John Doe',
      email: 'john@example.com',
      subject: 'Test Subject',
      message: 'This is a test message for the contact form.'
    };

    describe('Valid Submissions', () => {
      it('should accept valid contact form submission', async () => {
        const response = await request(app)
          .post('/api/public/contact')
          .send(validPayload)
          .expect('Content-Type', /json/)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('Thank you');
        expect(response.body.id).toBeDefined();
        
        // Verify database insert was called
        expect(mockInsert).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'John Doe',
            email: 'john@example.com',
            subject: 'Test Subject',
            message: 'This is a test message for the contact form.',
            status: 'new'
          })
        );
      });

      it('should use default subject when not provided', async () => {
        const payloadWithoutSubject = {
          name: 'Jane Doe',
          email: 'jane@example.com',
          message: 'A message without subject.'
        };

        await request(app)
          .post('/api/public/contact')
          .send(payloadWithoutSubject)
          .expect(200);

        expect(mockInsert).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'General Inquiry'
          })
        );
      });

      it('should normalize email addresses', async () => {
        const payloadWithVariantEmail = {
          name: 'Test User',
          email: 'TEST@EXAMPLE.COM',
          message: 'Testing email normalization.'
        };

        await request(app)
          .post('/api/public/contact')
          .send(payloadWithVariantEmail)
          .expect(200);

        expect(mockInsert).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'test@example.com'
          })
        );
      });

      it('should trim whitespace from inputs', async () => {
        const payloadWithWhitespace = {
          name: '  Trimmed Name  ',
          email: 'trim@example.com',
          message: '  Trimmed message  '
        };

        await request(app)
          .post('/api/public/contact')
          .send(payloadWithWhitespace)
          .expect(200);

        expect(mockInsert).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Trimmed Name',
            message: 'Trimmed message'
          })
        );
      });
    });

    describe('Validation Errors', () => {
      it('should reject missing name', async () => {
        const response = await request(app)
          .post('/api/public/contact')
          .send({ email: 'test@example.com', message: 'Hello' })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'name' })
          ])
        );
      });

      it('should reject missing email', async () => {
        const response = await request(app)
          .post('/api/public/contact')
          .send({ name: 'Test', message: 'Hello' })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'email' })
          ])
        );
      });

      it('should reject invalid email format', async () => {
        const response = await request(app)
          .post('/api/public/contact')
          .send({ name: 'Test', email: 'not-an-email', message: 'Hello' })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ 
              field: 'email',
              message: expect.stringContaining('email')
            })
          ])
        );
      });

      it('should reject missing message', async () => {
        const response = await request(app)
          .post('/api/public/contact')
          .send({ name: 'Test', email: 'test@example.com' })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'message' })
          ])
        );
      });

      it('should reject empty message', async () => {
        const response = await request(app)
          .post('/api/public/contact')
          .send({ name: 'Test', email: 'test@example.com', message: '   ' })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('Length Limits', () => {
      it('should reject name exceeding 100 characters', async () => {
        const response = await request(app)
          .post('/api/public/contact')
          .send({
            name: 'A'.repeat(101),
            email: 'test@example.com',
            message: 'Test message'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: 'name',
              message: expect.stringContaining('100')
            })
          ])
        );
      });

      it('should reject subject exceeding 150 characters', async () => {
        const response = await request(app)
          .post('/api/public/contact')
          .send({
            name: 'Test',
            email: 'test@example.com',
            subject: 'S'.repeat(151),
            message: 'Test message'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: 'subject',
              message: expect.stringContaining('150')
            })
          ])
        );
      });

      it('should reject message exceeding 4000 characters', async () => {
        const response = await request(app)
          .post('/api/public/contact')
          .send({
            name: 'Test',
            email: 'test@example.com',
            message: 'M'.repeat(4001)
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: 'message',
              message: expect.stringContaining('4000')
            })
          ])
        );
      });

      it('should accept message exactly at 4000 characters', async () => {
        await request(app)
          .post('/api/public/contact')
          .send({
            name: 'Test',
            email: 'test@example.com',
            message: 'M'.repeat(4000)
          })
          .expect(200);
      });
    });

    describe('Database Errors', () => {
      it('should handle database insertion errors gracefully', async () => {
        mockReturning.mockRejectedValueOnce(new Error('Database connection failed'));

        const response = await request(app)
          .post('/api/public/contact')
          .send(validPayload)
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('error occurred');
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers in response', async () => {
      const response = await request(app)
        .post('/api/public/contact')
        .send({
          name: 'Test',
          email: 'rate@example.com',
          message: 'Rate limit test'
        })
        .expect(200);

      // Standard rate limit headers
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
    });

    // Note: Full rate limit exhaustion testing requires more requests than practical
    // in unit tests. Integration tests should cover actual rate limit enforcement.
    it('should allow requests within rate limit (test mode uses 100 limit)', async () => {
      // In test mode, limit is 100. We just verify a few requests work.
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/public/contact')
          .send({
            name: 'Test ' + i,
            email: `test${i}@example.com`,
            message: 'Rate limit test ' + i
          })
          .expect(200);
      }
    });
  });
});

describe('Migration Integrity', () => {
  it('should have up and down functions defined', () => {
    const migration = require('../db/migrations/20251212000001_create_contact_messages');
    
    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');
  });

  it('should execute up migration without errors', async () => {
    const migration = require('../db/migrations/20251212000001_create_contact_messages');
    
    // Create a complete mock knex object
    const mockKnex = {
      client: {
        config: {
          // Migrations branch on knex.client.config.client (pg vs sqlite)
          client: 'sqlite3'
        }
      },
      raw: jest.fn().mockResolvedValue(true),
      fn: {
        now: jest.fn().mockReturnValue('NOW()')
      },
      schema: {
        createTable: jest.fn().mockImplementation((_tableName, callback) => {
          // Create a mock table builder to verify column definitions
          const tableBuilder = {
            uuid: jest.fn().mockReturnValue({
              primary: jest.fn().mockReturnValue({
                defaultTo: jest.fn()
              })
            }),
            string: jest.fn().mockReturnValue({
              notNullable: jest.fn().mockReturnThis(),
              defaultTo: jest.fn().mockReturnThis()
            }),
            text: jest.fn().mockReturnValue({
              notNullable: jest.fn().mockReturnThis()
            }),
            timestamp: jest.fn().mockReturnValue({
              defaultTo: jest.fn()
            }),
            index: jest.fn()
          };
          
          // Call the callback with our mock builder
          callback(tableBuilder);
          
          return Promise.resolve();
        }),
        dropTableIfExists: jest.fn().mockResolvedValue(true)
      }
    };
    
    // Should not throw
    await expect(migration.up(mockKnex)).resolves.not.toThrow();
    
    // Verify createTable was called with correct table name
    expect(mockKnex.schema.createTable).toHaveBeenCalledWith(
      'contact_messages',
      expect.any(Function)
    );
  });

  it('should execute down migration without errors', async () => {
    const migration = require('../db/migrations/20251212000001_create_contact_messages');
    
    const mockKnex = {
      schema: {
        dropTableIfExists: jest.fn().mockResolvedValue(true)
      }
    };
    
    await expect(migration.down(mockKnex)).resolves.not.toThrow();
    
    expect(mockKnex.schema.dropTableIfExists).toHaveBeenCalledWith('contact_messages');
  });
});
