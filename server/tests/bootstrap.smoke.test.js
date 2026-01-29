const request = require('supertest');

jest.setTimeout(40_000);

function createKnexStub() {
  const target = jest.fn(() => target);
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      // Many routes treat knex as a chainable builder.
      return jest.fn(() => obj);
    },
    apply(obj, thisArg, args) {
      return obj(...args);
    },
  });
}

function createSupabaseStub() {
  return {
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(),
        download: jest.fn(),
        remove: jest.fn(),
        createSignedUrl: jest.fn(),
      })),
      listBuckets: jest.fn(async () => ({ data: [], error: null })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ data: [], error: null })),
    })),
  };
}

describe('bootstrap/createApp (smoke)', () => {
  test('creates app, installs core middleware, and mounts /health', async () => {
    const { createApp } = require('../bootstrap/createApp.ts');

    const db = createKnexStub();
    const supabase = createSupabaseStub();

    const { app } = createApp({ db, supabase, logger: console });

    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
    expect(app.get('trust proxy')).toBe(1);

    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/i);
    expect(res.body).toHaveProperty('status', 'ok');

    // CORS middleware (critical ordering: CORS before security/validation)
    expect(res.headers).toHaveProperty('access-control-allow-origin', 'http://localhost:5173');

    // Helmet baseline security header (installed by configureSecurity)
    expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
  });
});
