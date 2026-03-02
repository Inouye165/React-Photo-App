import type { Request, Response } from 'express';
import express from 'express';
import type { Knex } from 'knex';
import { createHash, randomBytes } from 'crypto';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { z } from 'zod';
import { validateRequest } from '../validation/validateRequest';
import { createWhiteboardWsToken } from '../realtime/whiteboardWsTokens';
const supabase = require('../lib/supabaseClient');

const gzipAsync = promisify(gzip);
const BOARD_ID_MAX_LENGTH = 64;
const MAX_HISTORY_EVENTS = 5000;
const JOIN_INVITE_EXPIRY_DAYS = 7;
const JOIN_INVITE_DEFAULT_MAX_USES = 1;
const JOIN_INVITE_TOKEN_BYTES = 32;

const BoardIdParamsSchema = z.object({
  boardId: z.string().uuid().max(BOARD_ID_MAX_LENGTH),
});

const JoinInviteBodySchema = z.object({
  token: z.string().min(1).max(2048),
});

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
  };
  validated?: {
    params?: {
      boardId: string;
    };
    body?: {
      token: string;
    };
  };
};

type WhiteboardEventRow = {
  id: number | string;
  event_type: 'stroke:start' | 'stroke:move' | 'stroke:end';
  stroke_id: string;
  x: number | string;
  y: number | string;
  t: number | string;
  segment_index: number | null;
  source_id: string | null;
  color: string | null;
  width: number | null;
};

type HistoryCursor = {
  lastSeq: number;
  lastTs: string | null;
};

type WhiteboardInviteRow = {
  id: string;
  room_id: string;
  token_hash: string;
  expires_at: string | Date;
  max_uses: number | string;
  uses: number | string;
  revoked_at: string | Date | null;
};

function normalizeSeq(value: number | string): number | null {
  const seq = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(seq) ? Number(seq) : null;
}

function normalizeNumber(value: number | string): number | null {
  const num = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(num) ? Number(num) : null;
}

function hashInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function makeInviteToken(): string {
  return randomBytes(JOIN_INVITE_TOKEN_BYTES).toString('base64url');
}

function toAffectedRows(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.length;
  return 0;
}

function getJoinInviteFailureReason(invite: WhiteboardInviteRow | null):
  | 'invalid_token'
  | 'revoked'
  | 'expired'
  | 'used_up'
  | null {
  if (!invite) return 'invalid_token';
  if (invite.revoked_at) return 'revoked';

  const expiresAt = new Date(invite.expires_at);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return 'expired';

  const uses = normalizeNumber(invite.uses);
  const maxUses = normalizeNumber(invite.max_uses);
  if (uses === null || maxUses === null || uses >= maxUses) return 'used_up';

  return null;
}

async function isBoardOwner(db: Knex, boardId: string, userId: string): Promise<boolean> {
  const ownerMembership = await db('room_members')
    .where({ room_id: boardId, user_id: userId, is_owner: true })
    .first();
  if (ownerMembership) return true;

  const room = await db('rooms').select('created_by').where({ id: boardId }).first();
  return Boolean(room && String((room as { created_by?: unknown }).created_by ?? '') === userId);
}

async function isMember(db: Knex, boardId: string, userId: string): Promise<boolean> {
  const row = await db('room_members').where({ room_id: boardId, user_id: userId }).first();
  if (row) return true;

  if (process.env.NODE_ENV === 'test') return false;

  try {
    const { data, error } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('room_id', boardId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[WB-HTTP] membership-fallback query failed', {
        boardId,
        userId,
        code: error.code,
        message: error.message,
      });
      return false;
    }

    const matched = Boolean(data?.room_id);
    if (matched) {
      console.log('[WB-HTTP] membership-fallback matched', { boardId, userId });
    }
    return matched;
  } catch {
    return false;
  }
}

async function fetchHistory(db: Knex, boardId: string): Promise<{ events: WhiteboardEventRow[]; cursor: HistoryCursor }> {
  const rows = await db<WhiteboardEventRow>('whiteboard_events')
    .select('id', 'event_type', 'stroke_id', 'x', 'y', 't', 'segment_index', 'source_id', 'color', 'width')
    .where('board_id', boardId)
    .orderBy('id', 'asc')
    .limit(MAX_HISTORY_EVENTS);

  const lastRow = rows.length ? rows[rows.length - 1] : null;
  const lastSeq = lastRow ? normalizeSeq(lastRow.id) : null;

  return {
    events: rows,
    cursor: {
      lastSeq: lastSeq ?? 0,
      lastTs: null,
    },
  };
}

function shouldGzip(req: Request): boolean {
  const header = req.headers['accept-encoding'];
  if (!header || typeof header !== 'string') return false;
  return header.includes('gzip');
}
module.exports = function createWhiteboardRouter({ db }: { db: Knex }) {
  if (!db) throw new Error('db is required');

  const router = express.Router();

  const buildPayload = async (boardId: string) => {
    const { events, cursor } = await fetchHistory(db, boardId);
    console.log('[WB-HTTP] history rows', { boardId, count: events.length, lastSeq: cursor.lastSeq });
    const mapped = events
      .map((evt) => {
        const x = normalizeNumber(evt.x);
        const y = normalizeNumber(evt.y);
        const t = normalizeNumber(evt.t);
        if (x === null || y === null || t === null) return null;
        return {
          type: evt.event_type,
          boardId,
          strokeId: evt.stroke_id,
          x,
          y,
          t,
          seq: normalizeSeq(evt.id) ?? undefined,
          segmentIndex: typeof evt.segment_index === 'number' ? evt.segment_index : undefined,
          color: evt.color ?? undefined,
          width: evt.width ?? undefined,
          sourceId: evt.source_id ?? undefined,
        };
      })
      .filter((evt): evt is NonNullable<typeof evt> => Boolean(evt));
    return { boardId, events: mapped, cursor };
  };

  const handleRequest = async (req: AuthenticatedRequest, res: Response): Promise<string | null> => {
    const userId = req.user?.id ? String(req.user.id) : null;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return null;
    }

    const boardId = req.validated?.params?.boardId;
    if (!boardId) {
      res.status(400).json({ success: false, error: 'Invalid request' });
      return null;
    }

    const allowed = await isMember(db, boardId, userId);
    if (!allowed) {
      console.warn('[WB-HTTP] not-member', { boardId, userId });
      res.status(404).json({ success: false, error: 'Not found' });
      return null;
    }

    return boardId;
  };

  router.get(
    '/:boardId/history',
    validateRequest({ params: BoardIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const boardId = await handleRequest(req, res);
        if (!boardId) return undefined;
        console.log('[WB-HTTP] history request', { boardId, userId: req.user?.id });
        const payload = await buildPayload(boardId);
        console.log('[WB-HTTP] history response', { boardId, count: payload.events.length, lastSeq: payload.cursor.lastSeq });

        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vary', 'Accept-Encoding');

        if (shouldGzip(req)) {
          try {
            const json = JSON.stringify(payload);
            const compressed = await gzipAsync(json);
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.status(200).send(compressed);
          } catch {
            // Fall back to uncompressed JSON if gzip fails.
          }
        }

        return res.json(payload);
      } catch {
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  router.post(
    '/:boardId/invites',
    validateRequest({ params: BoardIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user?.id ? String(req.user.id) : null;
        if (!userId) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const boardId = req.validated?.params?.boardId;
        if (!boardId) {
          return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        const owner = await isBoardOwner(db, boardId, userId);
        if (!owner) {
          return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const rawToken = makeInviteToken();
        const tokenHash = hashInviteToken(rawToken);
        const expiresAt = new Date(Date.now() + JOIN_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

        await db('whiteboard_invites').insert({
          room_id: boardId,
          token_hash: tokenHash,
          created_by: userId,
          expires_at: expiresAt,
          max_uses: JOIN_INVITE_DEFAULT_MAX_USES,
          uses: 0,
        });

        const host = req.get('host');
        const origin = host ? `${req.protocol}://${host}` : '';
        const joinPath = `/whiteboards/join/${rawToken}`;
        const joinUrl = origin ? `${origin}${joinPath}` : joinPath;

        console.info('[WB-JOIN] invite-created', {
          boardId,
          userId,
          expiresAt: expiresAt.toISOString(),
        });

        return res.status(201).json({ joinUrl, expiresAt: expiresAt.toISOString() });
      } catch {
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  router.post(
    '/join',
    validateRequest({ body: JoinInviteBodySchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user?.id ? String(req.user.id) : null;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const token = req.validated?.body?.token;
      if (!token) {
        return res.status(400).json({ success: false, error: 'Invalid request', reason: 'invalid_token' });
      }

      try {
        const tokenHash = hashInviteToken(token);
        const invite = (await db<WhiteboardInviteRow>('whiteboard_invites')
          .where({ token_hash: tokenHash })
          .first()) ?? null;

        const validationReason = getJoinInviteFailureReason(invite);
        if (validationReason) {
          console.info('[WB-JOIN] join-attempt', {
            ok: false,
            reason: validationReason,
            userId,
            tokenLength: token.length,
          });
          return res.status(400).json({ success: false, error: 'Join link is not valid', reason: validationReason });
        }

        const updateResult = await db('whiteboard_invites')
          .where({ id: invite.id })
          .whereNull('revoked_at')
          .andWhere('expires_at', '>', db.fn.now())
          .andWhereRaw('uses < max_uses')
          .increment('uses', 1);

        if (toAffectedRows(updateResult) < 1) {
          console.info('[WB-JOIN] join-attempt', {
            ok: false,
            reason: 'used_up',
            userId,
            roomId: invite.room_id,
            tokenLength: token.length,
          });
          return res.status(400).json({ success: false, error: 'Join link is no longer usable', reason: 'used_up' });
        }

        await db('room_members')
          .insert({ room_id: invite.room_id, user_id: userId, is_owner: false })
          .onConflict(['room_id', 'user_id'])
          .ignore();

        console.info('[WB-JOIN] join-attempt', {
          ok: true,
          reason: null,
          roomId: invite.room_id,
          userId,
          tokenLength: token.length,
        });

        return res.status(200).json({ roomId: invite.room_id });
      } catch {
        console.info('[WB-JOIN] join-attempt', {
          ok: false,
          reason: 'unknown',
          userId,
          tokenLength: token.length,
        });
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  router.post(
    '/:boardId/ws-token',
    validateRequest({ params: BoardIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        console.log('[WB-HTTP] ws-token request', {
          boardId: req.validated?.params?.boardId,
          userId: req.user?.id,
          path: req.originalUrl,
        });
        const boardId = await handleRequest(req, res);
        if (!boardId) return undefined;
        const userId = req.user?.id ? String(req.user.id) : '';
        const ticket = createWhiteboardWsToken({ boardId, userId });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ success: true, token: ticket.token, expiresInMs: ticket.expiresInMs });
      } catch {
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    },
  );

  router.get(
    '/:boardId/snapshot',
    validateRequest({ params: BoardIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const boardId = await handleRequest(req, res);
        if (!boardId) return undefined;
        console.log('[WB-HTTP] snapshot request', { boardId, userId: req.user?.id });
        const payload = await buildPayload(boardId);
        console.log('[WB-HTTP] snapshot response', { boardId, count: payload.events.length, lastSeq: payload.cursor.lastSeq });

        if (shouldGzip(req)) {
          try {
            // perf: gzip large snapshot responses when the client accepts it.
            const json = JSON.stringify(payload);
            const compressed = await gzipAsync(json);
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Vary', 'Accept-Encoding');
            return res.status(200).send(compressed);
          } catch {
            // Fall back to uncompressed JSON if gzip fails.
          }
        }

        res.setHeader('Cache-Control', 'no-store');
        return res.json(payload);
      } catch {
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  return router;
};
