/* eslint-env jest */

/// <reference path="./jest-globals.d.ts" />

export {};

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

function normalizedIssuerFromSupabaseUrl(supabaseUrl) {
  const normalized = String(supabaseUrl || '').trim().replace(/\/+$/, '');
  return `${normalized}/auth/v1`;
}

describe('auth v2 (issuer + env mapping)', () => {
  beforeEach(() => {
    jest.resetModules();

    process.env.NODE_ENV = 'test';

    // Keep SUPABASE_URL as the *base* project URL (no /auth/v1 suffix).
    process.env.SUPABASE_URL = 'https://test.supabase.co/'; // intentionally has trailing slash
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';

    // Use a deterministic secret for local JWT verification.
    process.env.SUPABASE_JWT_SECRET = 'test-supabase-jwt-secret';

    // Ensure Redis is not used in this test.
    delete process.env.REDIS_URL;

    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.VITE_GOOGLE_MAPS_API_KEY;
  });

  test('accepts a JWT with iss=<base>/auth/v1 against a base SUPABASE_URL config', async () => {
    const { authenticateToken } = require('../middleware/auth');

    const app = express();
    app.get('/me', authenticateToken, (req, res) => {
      res.json({ ok: true, userId: req.user && req.user.id });
    });

    const issuer = normalizedIssuerFromSupabaseUrl(process.env.SUPABASE_URL);

    const token = jwt.sign(
      { email: 'test@example.com' },
      process.env.SUPABASE_JWT_SECRET,
      {
        algorithm: 'HS256',
        issuer,
        audience: 'authenticated',
        subject: '00000000-0000-0000-0000-000000000123',
        expiresIn: '5m'
      }
    );

    const res = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.userId).toBeTruthy();
  });

  test("rejects a JWT when aud is not exactly 'authenticated' (even if it includes it)", async () => {
    const { authenticateToken } = require('../middleware/auth');

    const app = express();
    app.get('/me', authenticateToken, (_req, res) => {
      res.json({ ok: true });
    });

    const issuer = normalizedIssuerFromSupabaseUrl(process.env.SUPABASE_URL);

    const token = jwt.sign(
      { email: 'test@example.com', aud: ['authenticated', 'other-audience'] },
      process.env.SUPABASE_JWT_SECRET,
      {
        algorithm: 'HS256',
        issuer,
        // Note: we are overriding aud via payload on purpose.
        subject: '00000000-0000-0000-0000-000000000124',
        expiresIn: '5m'
      }
    );

    await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  test('getConfig uses VITE_GOOGLE_MAPS_API_KEY when GOOGLE_MAPS_API_KEY is missing', () => {
    process.env.VITE_GOOGLE_MAPS_API_KEY = 'vite-maps-key';

    const { getConfig, __resetForTests } = require('../config/env');
    __resetForTests();

    const cfg = getConfig();
    expect(cfg.google.mapsApiKey).toBe('vite-maps-key');
  });
});
