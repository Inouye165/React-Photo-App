import { Router, Request, Response } from 'express'
import { resolveBuildId } from '../utils/buildId'
import { getBootId } from '../utils/bootId'

function keyFingerprint(key: string | undefined): string {
  if (!key) return '(empty)';
  if (key.length < 20) return `len=${key.length}`;
  return `${key.slice(0, 8)}…${key.slice(-4)} (len=${key.length})`;
}

function createMetaRouter(): Router {
  const router = Router()

  router.get('/', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store')
    res.status(200).json({ buildId: resolveBuildId(), bootId: getBootId() })
  })

  /**
   * GET /api/meta/auth-diag
   * Unauthenticated diagnostic endpoint that reports:
   * - Which Supabase URL/key fingerprint the server is using
   * - Whether the server can reach the Supabase auth endpoint
   * DOES NOT log/return secrets. Safe for production.
   */
  router.get('/auth-diag', async (_req: Request, res: Response) => {
    const { getConfig } = require('../config/env');
    let config: { supabase: { url: string; anonKey: string } };
    try {
      config = getConfig();
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: 'Server config failed to load',
        details: err instanceof Error ? err.message : String(err),
      });
    }

    const supabaseUrl = config.supabase.url;
    let hostname = '(unknown)';
    try {
      hostname = new URL(supabaseUrl).hostname;
    } catch { /* invalid URL */ }

    // Probe Supabase auth endpoint reachability from the server
    let probe: { status: number; ok: boolean; body?: string } | { error: string };
    try {
      const resp = await fetch(`${supabaseUrl}/auth/v1/`, {
        method: 'GET',
        headers: { apikey: config.supabase.anonKey },
      });
      const body = await resp.text().catch(() => '(unreadable)');
      probe = { status: resp.status, ok: resp.ok, body: body.slice(0, 200) };
    } catch (err: unknown) {
      probe = { error: err instanceof Error ? err.message : String(err) };
    }

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      success: true,
      server: {
        supabaseUrl,
        supabaseHost: hostname,
        anonKeyFingerprint: keyFingerprint(config.supabase.anonKey),
        nodeEnv: process.env.NODE_ENV || '(unset)',
      },
      supabaseProbe: probe,
    });
  });

  return router
}

module.exports = createMetaRouter
