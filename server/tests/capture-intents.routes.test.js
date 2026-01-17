/* eslint-env jest */

const request = require('supertest');
const express = require('express');

const createCaptureIntentsRouter = require('../routes/captureIntents');

const createMockDb = () => {
  const data = {
    capture_intents: [],
    photos: [],
    collectibles: [],
  };

  const applyFilters = (rows, filters) => {
    let out = [...rows];
    for (const filter of filters) {
      if (filter.type === 'where') {
        out = out.filter((row) => {
          return Object.entries(filter.criteria).every(([key, value]) => String(row[key]) === String(value));
        });
      }
      if (filter.type === 'andWhere') {
        const { column, op, value } = filter;
        out = out.filter((row) => {
          const rowValue = row[column];
          if (op === '<=') return String(rowValue) <= String(value);
          if (op === '>=') return String(rowValue) >= String(value);
          if (op === '<') return String(rowValue) < String(value);
          if (op === '>') return String(rowValue) > String(value);
          return false;
        });
      }
    }
    return out;
  };

  const createQuery = (tableName) => {
    const table = data[tableName];
    const filters = [];
    let orderBy = null;

    return {
      where(criteria) {
        filters.push({ type: 'where', criteria: criteria || {} });
        return this;
      },
      andWhere(column, op, value) {
        filters.push({ type: 'andWhere', column, op, value });
        return this;
      },
      orderBy(column, direction) {
        orderBy = { column, direction };
        return this;
      },
      first: async () => {
        let rows = applyFilters(table, filters);
        if (orderBy) {
          rows = rows.sort((a, b) => {
            const aVal = a[orderBy.column];
            const bVal = b[orderBy.column];
            if (aVal === bVal) return 0;
            if (orderBy.direction === 'desc') return String(bVal).localeCompare(String(aVal));
            return String(aVal).localeCompare(String(bVal));
          });
        }
        return rows[0] || null;
      },
      insert: async (row) => {
        table.push({ ...row });
        return [row.id];
      },
      update: async (updates) => {
        const rows = applyFilters(table, filters);
        rows.forEach((row) => Object.assign(row, updates));
        return rows.length;
      },
    };
  };

  const mockDb = (tableName) => createQuery(tableName);
  mockDb._data = data;

  return mockDb;
};

describe('Capture Intents Routes', () => {
  let app;
  let db;
  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    db = createMockDb();
    db._data.photos.push({ id: 10, user_id: userId });
    db._data.collectibles.push({ id: 55, user_id: userId, photo_id: 10 });

    app = express();
    app.use(express.json());

    app.use('/api/v1/capture-intents', (req, _res, next) => {
      req.user = { id: userId };
      next();
    });

    app.use('/api/v1/capture-intents', createCaptureIntentsRouter({ db }));
  });

  test('opens and returns an intent scoped to user', async () => {
    const response = await request(app)
      .post('/api/v1/capture-intents/open')
      .send({ photoId: 10, collectibleId: 55 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.intent).toEqual(
      expect.objectContaining({
        photoId: 10,
        collectibleId: 55,
        state: 'open',
      })
    );

    expect(db._data.capture_intents).toHaveLength(1);
    expect(db._data.capture_intents[0].user_id).toBe(userId);
  });

  test('get open returns null when intent is expired', async () => {
    db._data.capture_intents.push({
      id: 'intent-expired',
      user_id: userId,
      photo_id: 10,
      collectible_id: 55,
      state: 'open',
      created_at: new Date(Date.now() - 60_000).toISOString(),
      expires_at: new Date(Date.now() - 5_000).toISOString(),
    });

    const response = await request(app).get('/api/v1/capture-intents/open');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.intent).toBeNull();

    expect(db._data.capture_intents[0].state).toBe('expired');
  });

  test('consume marks intent as consumed and is idempotent', async () => {
    db._data.capture_intents.push({
      id: 'intent-open',
      user_id: userId,
      photo_id: 10,
      collectible_id: 55,
      state: 'open',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const consumeResponse = await request(app)
      .post('/api/v1/capture-intents/intent-open/consume');

    expect(consumeResponse.status).toBe(200);
    expect(consumeResponse.body.success).toBe(true);
    expect(consumeResponse.body.intent.state).toBe('consumed');

    const secondResponse = await request(app)
      .post('/api/v1/capture-intents/intent-open/consume');

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.intent.state).toBe('consumed');
  });
});
