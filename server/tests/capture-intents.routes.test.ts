export {};

/* eslint-env jest */

const request = require('supertest');
const express = require('express');

const createCaptureIntentsRouter = require('../routes/captureIntents');

interface FilterWhere {
  type: 'where';
  criteria: Record<string, unknown>;
}

interface FilterAndWhere {
  type: 'andWhere';
  column: string;
  op: string;
  value: unknown;
}

type Filter = FilterWhere | FilterAndWhere;

interface MockData {
  capture_intents: Record<string, unknown>[];
  photos: Record<string, unknown>[];
  collectibles: Record<string, unknown>[];
}

const createMockDb = (): any => {
  const data: MockData = {
    capture_intents: [],
    photos: [],
    collectibles: [],
  };

  const applyFilters = (rows: Record<string, unknown>[], filters: Filter[]): Record<string, unknown>[] => {
    let out: Record<string, unknown>[] = [...rows];
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

  const createQuery = (tableName: keyof MockData) => {
    const table = data[tableName];
    const filters: Filter[] = [];
    let orderBy: { column: string; direction: string } | null = null;

    return {
      where(criteria: Record<string, unknown>) {
        filters.push({ type: 'where', criteria: criteria || {} });
        return this;
      },
      andWhere(column: string, op: string, value: unknown) {
        filters.push({ type: 'andWhere', column, op, value });
        return this;
      },
      orderBy(column: string, direction: string) {
        orderBy = { column, direction };
        return this;
      },
      first: async (): Promise<Record<string, unknown> | null> => {
        let rows = applyFilters(table, filters);
        if (orderBy) {
          const ob = orderBy;
          rows = rows.sort((a, b) => {
            const aVal = a[ob.column];
            const bVal = b[ob.column];
            if (aVal === bVal) return 0;
            if (ob.direction === 'desc') return String(bVal).localeCompare(String(aVal));
            return String(aVal).localeCompare(String(bVal));
          });
        }
        return rows[0] || null;
      },
      insert: async (row: Record<string, unknown>): Promise<unknown[]> => {
        table.push({ ...row });
        return [row.id];
      },
      update: async (updates: Record<string, unknown>): Promise<number> => {
        const rows = applyFilters(table, filters);
        rows.forEach((row) => Object.assign(row, updates));
        return rows.length;
      },
    };
  };

  const mockDb: any = (tableName: keyof MockData) => createQuery(tableName);
  mockDb._data = data;

  return mockDb;
};

describe('Capture Intents Routes', () => {
  let app: ReturnType<typeof express>;
  let db: any;
  const userId: string = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    db = createMockDb();
    db._data.photos.push({ id: 10, user_id: userId });
    db._data.collectibles.push({ id: 55, user_id: userId, photo_id: 10 });

    app = express();
    app.use(express.json());

    app.use('/api/v1/capture-intents', (req: any, _res: any, next: any) => {
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
