/* eslint-env jest */

/// <reference path="./jest-globals.d.ts" />

export {};

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

function normalizedIssuerFromSupabaseUrl(url) {
  const normalized = String(url || '').trim().replace(/\/+$/, '');
  return `${normalized}/auth/v1`;
}

describe('auth middleware integration (Supabase JWT)', () => {
  beforeEach(() => {
    jest.resetModules();

    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://test.supabase.co/'; // intentionally has trailing slash
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';

    // Use a deterministic secret for local JWT verification.
    process.env.SUPABASE_JWT_SECRET = 'test-supabase-jwt-secret';

    // Ensure Redis is not used in this test.
    delete process.env.REDIS_URL;
  });

  test('accepts a valid HS256 Supabase token with aud=authenticated and robust iss handling', async () => {
    const { authenticateToken } = require('../middleware/auth');

    const app = express();
    app.get('/me', authenticateToken, (req, res) => {
      res.json({ ok: true, userId: req.user && req.user.id });
    });

    const supabaseUrl = process.env.SUPABASE_URL;
    const issuer = normalizedIssuerFromSupabaseUrl(supabaseUrl);
    const subject = '00000000-0000-0000-0000-000000000123';

    const token = jwt.sign(
      { email: 'test@example.com' },
      process.env.SUPABASE_JWT_SECRET,
      {
        algorithm: 'HS256',
        issuer,
        audience: 'authenticated',
        subject,
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
});
