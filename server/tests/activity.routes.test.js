/**
 * Tests for Activity Logging API Routes
 *
 * Verifies:
 * 1. POST /api/v1/activity requires authentication
 * 2. POST /api/v1/activity validates the action field
 * 3. POST /api/v1/activity inserts a row for valid actions
 * 4. GET  /api/v1/activity returns the user's activity log
 * 5. GET  /api/v1/activity respects limit/offset query params
 */

const request = require('supertest');
const express = require('express');

const TEST_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// --- Mock DB ---
const mockReturning = jest.fn();
const mockInsert = jest.fn().mockReturnValue({ returning: mockReturning });
const mockSelect = jest.fn();
const mockOffset = jest.fn().mockReturnValue({ select: mockSelect });
const mockLimit = jest.fn().mockReturnValue({ offset: mockOffset });
const mockOrderBy = jest.fn().mockReturnValue({ limit: mockLimit });
const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });

const mockDb = jest.fn(() => ({
  insert: mockInsert,
  where: mockWhere,
}));

// --- Mock auth middleware ---
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    if (req.headers.authorization === 'Bearer valid') {
      req.user = { id: TEST_USER_ID };
    }
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
}));

// --- Mock logger ---
jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const createActivityRouter = require('../routes/activity');

function buildApp() {
  const app = express();
  app.use(express.json());

  // Attach auth middleware the same way the real bootstrap does
  const { authenticateToken } = require('../middleware/auth');
  const router = createActivityRouter({ db: mockDb });
  app.use('/api/v1/activity', authenticateToken, router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/v1/activity', () => {
  it('returns 401 when not authenticated', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/activity')
      .send({ action: 'sign_in' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when action is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/activity')
      .set('Authorization', 'Bearer valid')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/action is required/i);
  });

  it('returns 400 for an invalid action', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/activity')
      .set('Authorization', 'Bearer valid')
      .send({ action: 'hack_the_planet' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid action/);
  });

  it('inserts and returns 201 for a valid action', async () => {
    const insertedRow = { id: 'row-1', action: 'sign_in', created_at: new Date().toISOString() };
    mockReturning.mockResolvedValueOnce([insertedRow]);

    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/activity')
      .set('Authorization', 'Bearer valid')
      .send({ action: 'sign_in' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ id: 'row-1', action: 'sign_in' });
    expect(mockDb).toHaveBeenCalledWith('user_activity_log');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: TEST_USER_ID, action: 'sign_in' }),
    );
  });

  it.each([
    'sign_in',
    'sign_out',
    'password_change',
    'username_set',
    'page_view',
    'game_played',
    'message_sent',
    'auto_logout_inactive',
  ])('accepts action "%s"', async (action) => {
    const insertedRow = { id: 'row-x', action, created_at: new Date().toISOString() };
    mockReturning.mockResolvedValueOnce([insertedRow]);

    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/activity')
      .set('Authorization', 'Bearer valid')
      .send({ action });
    expect(res.status).toBe(201);
  });

  it('stores metadata when provided', async () => {
    const insertedRow = { id: 'row-m', action: 'page_view', created_at: new Date().toISOString() };
    mockReturning.mockResolvedValueOnce([insertedRow]);

    const app = buildApp();
    await request(app)
      .post('/api/v1/activity')
      .set('Authorization', 'Bearer valid')
      .send({ action: 'page_view', metadata: { page: 'gallery' } });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: JSON.stringify({ page: 'gallery' }),
      }),
    );
  });

  it('returns 500 when the DB insert fails', async () => {
    mockReturning.mockRejectedValueOnce(new Error('DB down'));

    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/activity')
      .set('Authorization', 'Bearer valid')
      .send({ action: 'sign_in' });
    expect(res.status).toBe(500);
  });
});

describe('GET /api/v1/activity', () => {
  it('returns 401 when not authenticated', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/activity');
    expect(res.status).toBe(401);
  });

  it('returns the user activity log', async () => {
    const rows = [
      { id: '1', action: 'sign_in', metadata: {}, created_at: '2026-02-16T00:00:00Z' },
    ];
    mockSelect.mockResolvedValueOnce(rows);

    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/activity')
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(rows);
    expect(mockWhere).toHaveBeenCalledWith({ user_id: TEST_USER_ID });
  });

  it('respects limit and offset query params', async () => {
    mockSelect.mockResolvedValueOnce([]);

    const app = buildApp();
    await request(app)
      .get('/api/v1/activity?limit=10&offset=5')
      .set('Authorization', 'Bearer valid');

    expect(mockLimit).toHaveBeenCalledWith(10);
    expect(mockOffset).toHaveBeenCalledWith(5);
  });

  it('caps limit at 200', async () => {
    mockSelect.mockResolvedValueOnce([]);

    const app = buildApp();
    await request(app)
      .get('/api/v1/activity?limit=999')
      .set('Authorization', 'Bearer valid');

    expect(mockLimit).toHaveBeenCalledWith(200);
  });
});
