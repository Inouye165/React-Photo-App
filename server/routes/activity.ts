// server/routes/activity.ts
//
// Activity-logging API.
// POST /api/v1/activity  – log a user action
// GET  /api/v1/activity  – fetch recent activity (admin or own)

import { Router, Request, Response } from 'express';
import type { Knex } from 'knex';

const logger = require('../logger');

/**
 * Allowed activity action types.
 * Only these values are accepted from the client.
 */
const ALLOWED_ACTIONS = new Set([
  'sign_in',
  'sign_out',
  'password_change',
  'username_set',
  'page_view',
  'game_played',
  'message_sent',
  'auto_logout_inactive',
]);

type AuthenticatedRequest = Request & {
  user?: { id: string; role?: string; email?: string; username?: string };
};

export default function createActivityRouter({ db }: { db: Knex }) {
  const router = Router();

  /**
   * POST /
   * Log an activity event for the authenticated user.
   *
   * Body: { action: string, metadata?: Record<string, unknown> }
   */
  router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { action, metadata } = req.body || {};

      if (!action || typeof action !== 'string') {
        return res.status(400).json({ success: false, error: 'action is required' });
      }

      if (!ALLOWED_ACTIONS.has(action)) {
        return res.status(400).json({
          success: false,
          error: `Invalid action. Allowed: ${[...ALLOWED_ACTIONS].join(', ')}`,
        });
      }

      const clientMetadata =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};

      const safeMetadata = {
        ...clientMetadata,
        actor_email: typeof req.user?.email === 'string' ? req.user.email : undefined,
        actor_username: typeof req.user?.username === 'string' ? req.user.username : undefined,
      };

      const ipRaw = req.ip || req.socket?.remoteAddress || null;
      const ipAddress = ipRaw ? String(ipRaw).slice(0, 45) : null;
      const userAgent = req.headers['user-agent']
        ? String(req.headers['user-agent']).slice(0, 500)
        : null;

      const [row] = await db('user_activity_log')
        .insert({
          user_id: userId,
          action,
          metadata: JSON.stringify(safeMetadata),
          ip_address: ipAddress,
          user_agent: userAgent,
        })
        .returning(['id', 'action', 'created_at']);

      logger.info('[activity] logged', { userId, action });

      return res.status(201).json({ success: true, data: row });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[activity] Failed to log activity', { error: message });
      return res.status(500).json({ success: false, error: 'Failed to log activity' });
    }
  });

  /**
   * GET /
   * Retrieve activity log entries for the authenticated user.
   * Query params: limit (default 50, max 200), offset (default 0)
   */
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const rawLimit = Number(req.query.limit) || 50;
      const limit = Math.min(Math.max(rawLimit, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const rows = await db('user_activity_log')
        .where({ user_id: userId })
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .select('id', 'action', 'metadata', 'created_at');

      return res.json({ success: true, data: rows });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[activity] Failed to fetch activity', { error: message });
      return res.status(500).json({ success: false, error: 'Failed to fetch activity' });
    }
  });

  return router;
}

module.exports = createActivityRouter;
