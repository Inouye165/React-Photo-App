import type { Request, Response } from 'express';
import express from 'express';
import type { Knex } from 'knex';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { z } from 'zod';
import { validateRequest } from '../validation/validateRequest';

const gzipAsync = promisify(gzip);
const BOARD_ID_MAX_LENGTH = 64;
const MAX_HISTORY_EVENTS = 5000;

const BoardIdParamsSchema = z.object({
  boardId: z.string().uuid().max(BOARD_ID_MAX_LENGTH),
});

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
  };
  validated?: {
    params?: {
      boardId: string;
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

function normalizeSeq(value: number | string): number | null {
  const seq = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(seq) ? Number(seq) : null;
}

function normalizeNumber(value: number | string): number | null {
  const num = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(num) ? Number(num) : null;
}

async function isMember(db: Knex, boardId: string, userId: string): Promise<boolean> {
  const row = await db('room_members').where({ room_id: boardId, user_id: userId }).first();
  return Boolean(row);
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
