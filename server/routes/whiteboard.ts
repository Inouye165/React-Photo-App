import type { Request, Response } from 'express';
import express from 'express';
import type { Knex } from 'knex';
import { gzipSync } from 'zlib';
import { z } from 'zod';
import { validateRequest } from '../validation/validateRequest';

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
  x: number;
  y: number;
  t: number;
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

async function isMember(db: Knex, boardId: string, userId: string): Promise<boolean> {
  const row = await db('room_members').where({ room_id: boardId, user_id: userId }).first();
  return Boolean(row);
}

async function fetchHistory(db: Knex, boardId: string): Promise<{ events: WhiteboardEventRow[]; cursor: HistoryCursor }> {
  const rows = await db<WhiteboardEventRow>('whiteboard_events')
    .select('id', 'event_type', 'stroke_id', 'x', 'y', 't', 'source_id', 'color', 'width')
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

function wantsGzip(acceptEncoding: string | undefined): boolean {
  if (!acceptEncoding) return false;
  return acceptEncoding.toLowerCase().includes('gzip');
}

module.exports = function createWhiteboardRouter({ db }: { db: Knex }) {
  if (!db) throw new Error('db is required');

  const router = express.Router();

  router.get(
    '/:boardId/history',
    validateRequest({ params: BoardIdParamsSchema }),
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user?.id ? String(req.user.id) : null;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const boardId = req.validated?.params?.boardId;
      if (!boardId) {
        return res.status(400).json({ success: false, error: 'Invalid request' });
      }

      const allowed = await isMember(db, boardId, userId);
      if (!allowed) {
        return res.status(404).json({ success: false, error: 'Not found' });
      }

      try {
        const { events, cursor } = await fetchHistory(db, boardId);
        const mapped = events.map((evt) => ({
          type: evt.event_type,
          boardId,
          strokeId: evt.stroke_id,
          x: evt.x,
          y: evt.y,
          t: evt.t,
          seq: normalizeSeq(evt.id) ?? undefined,
          color: evt.color ?? undefined,
          width: evt.width ?? undefined,
          sourceId: evt.source_id ?? undefined,
        }));

        const payload = { boardId, events: mapped, cursor };
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vary', 'Accept-Encoding');

        if (wantsGzip(req.headers['accept-encoding'])) {
          const body = Buffer.from(JSON.stringify(payload));
          const zipped = gzipSync(body);
          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          return res.status(200).send(zipped);
        }

        return res.json(payload);
      } catch {
        return res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  );

  return router;
};
