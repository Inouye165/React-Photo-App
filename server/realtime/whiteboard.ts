import type { Knex } from 'knex';
import { z } from 'zod';

const BOARD_ID_MAX_LENGTH = 64;
const STROKE_ID_MAX_LENGTH = 64;
const SOURCE_ID_MAX_LENGTH = 64;
const MAX_PAYLOAD_BYTES = 2048;
const MAX_EVENTS_PER_WINDOW = 240;
const RATE_LIMIT_WINDOW_MS = 5000;
const MAX_HISTORY_EVENTS = 5000;
const MAX_EVENTS_PER_BOARD = 20000;
const HISTORY_REPLAY_BATCH_SIZE = 50;
const HISTORY_REPLAY_DELAY_MS = 5;

const BoardIdSchema = z.string().uuid().max(BOARD_ID_MAX_LENGTH);

const StrokeEventSchema = z.object({
  boardId: BoardIdSchema,
  strokeId: z.string().min(1).max(STROKE_ID_MAX_LENGTH),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  t: z.number().int().nonnegative(),
  sourceId: z.string().min(1).max(SOURCE_ID_MAX_LENGTH).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  width: z.number().min(1).max(24).optional(),
});

type ClientMessage = {
  type: string;
  payload?: unknown;
};

type SocketRecord = {
  id: string;
  userId: string;
  rooms: Set<string>;
};

type HandlerArgs = {
  record: SocketRecord;
  message: ClientMessage;
  send: (type: string, payload?: unknown) => void;
  joinRoom: (record: SocketRecord, roomId: string) => { ok: boolean; reason?: string; roomId?: string };
  leaveRoom: (record: SocketRecord, roomId: string) => { ok: boolean; reason?: string; roomId?: string };
  publishToRoom: (roomId: string, eventName: string, payload?: Record<string, unknown>) => { delivered: number; eventId?: string };
};

type RateState = {
  windowStart: number;
  count: number;
};

type StoredWhiteboardEvent = {
  event_type: 'stroke:start' | 'stroke:move' | 'stroke:end';
  stroke_id: string;
  x: number;
  y: number;
  t: number;
  source_id: string | null;
  color: string | null;
  width: number | null;
};

function payloadByteLength(payload: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(payload));
  } catch {
    return MAX_PAYLOAD_BYTES + 1;
  }
}

function isStrokeEventType(value: string): value is 'stroke:start' | 'stroke:move' | 'stroke:end' {
  return value === 'stroke:start' || value === 'stroke:move' || value === 'stroke:end';
}

function delay(ms: number) {
  if (!ms) return Promise.resolve();
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function shouldRateLimit(state: RateState | undefined, now: number) {
  if (!state || now - state.windowStart >= RATE_LIMIT_WINDOW_MS) {
    return { limited: false, next: { windowStart: now, count: 1 } as RateState };
  }

  const nextCount = state.count + 1;
  const limited = nextCount > MAX_EVENTS_PER_WINDOW;
  return {
    limited,
    next: { windowStart: state.windowStart, count: nextCount } as RateState,
  };
}

async function isMember(db: Knex, boardId: string, userId: string): Promise<boolean> {
  const row = await db('room_members').where({ room_id: boardId, user_id: userId }).first();
  return Boolean(row);
}

async function fetchHistory(db: Knex, boardId: string): Promise<StoredWhiteboardEvent[]> {
  const rows = await db('whiteboard_events')
    .select('event_type', 'stroke_id', 'x', 'y', 't', 'source_id', 'color', 'width')
    .where({ board_id: boardId })
    .orderBy('id', 'desc')
    .limit(MAX_HISTORY_EVENTS);

  return rows.reverse() as StoredWhiteboardEvent[];
}

async function persistEvent(db: Knex, event: {
  boardId: string;
  type: 'stroke:start' | 'stroke:move' | 'stroke:end';
  strokeId: string;
  x: number;
  y: number;
  t: number;
  sourceId?: string;
  color?: string;
  width?: number;
}) {
  await db('whiteboard_events').insert({
    board_id: event.boardId,
    event_type: event.type,
    stroke_id: event.strokeId,
    x: event.x,
    y: event.y,
    t: event.t,
    source_id: event.sourceId ?? null,
    color: event.color ?? null,
    width: event.width ?? null,
  });
}

async function pruneEvents(db: Knex, boardId: string) {
  await db('whiteboard_events')
    .where('board_id', boardId)
    .whereNotIn(
      'id',
      db('whiteboard_events')
        .select('id')
        .where('board_id', boardId)
        .orderBy('id', 'desc')
        .limit(MAX_EVENTS_PER_BOARD),
    )
    .del();
}

async function clearHistory(db: Knex, boardId: string) {
  await db('whiteboard_events').where({ board_id: boardId }).del();
}

export function createWhiteboardMessageHandler({
  db,
}: {
  db: Knex;
}) {
  const rateStateByRecord = new WeakMap<SocketRecord, RateState>();

  return async function handleWhiteboardMessage({
    record,
    message,
    send,
    joinRoom,
    leaveRoom,
    publishToRoom,
  }: HandlerArgs): Promise<boolean> {
    const type = typeof message.type === 'string' ? message.type : '';

    if (type !== 'ping') {
      console.log('[WB-SERVER] Msg:', { type, userId: record.userId, boardId: (message.payload as any)?.boardId });
    }

    if (type === 'ping') {
      const boardId = (message.payload as { boardId?: string })?.boardId;
      send('pong', { payload: { boardId, t: Date.now() } });
      return true;
    }

    if (type === 'whiteboard:join') {
      const parsed = z.object({ boardId: BoardIdSchema }).safeParse(message.payload);
      if (!parsed.success) {
        send('whiteboard:error', { payload: { code: 'invalid_request' } });
        return true;
      }

      const { boardId } = parsed.data;
      
      const allowed = await isMember(db, boardId, record.userId);
      console.log('[WB-SERVER] Join Authorization:', { userId: record.userId, boardId, allowed });

      if (!allowed) {
        console.warn('[whiteboard] join forbidden', { boardId, userId: record.userId });
        send('whiteboard:error', { payload: { code: 'forbidden' } });
        return true;
      }

      const out = joinRoom(record, boardId);
      if (!out.ok) {
        console.warn('[whiteboard] join failed', { boardId, reason: out.reason });
        send('whiteboard:error', { payload: { code: 'join_failed' } });
        return true;
      }

      console.log('[whiteboard] user joined', { 
        boardId, 
        userId: record.userId, 
        socketId: record.id,
        roomCount: record.rooms.size 
      });
      
      send('whiteboard:joined', { payload: { boardId } });

      try {
        const history = await fetchHistory(db, boardId);
        console.log('[whiteboard] history replay', { boardId, count: history.length });
        for (let i = 0; i < history.length; i += HISTORY_REPLAY_BATCH_SIZE) {
          const batch = history.slice(i, i + HISTORY_REPLAY_BATCH_SIZE);
          for (const evt of batch) {
            send(evt.event_type, {
              payload: {
                boardId,
                strokeId: evt.stroke_id,
                x: evt.x,
                y: evt.y,
                t: evt.t,
                color: evt.color ?? undefined,
                width: evt.width ?? undefined,
              }
            });
          }
          if (i + HISTORY_REPLAY_BATCH_SIZE < history.length) {
            await delay(HISTORY_REPLAY_DELAY_MS);
          }
        }
      } catch {
        // ignore history failures
      }

      return true;
    }

    if (type === 'whiteboard:clear') {
      const parsed = z.object({ boardId: BoardIdSchema }).safeParse(message.payload);
      if (!parsed.success) {
        send('whiteboard:error', { payload: { code: 'invalid_request' } });
        return true;
      }

      const { boardId } = parsed.data;
      const allowed = await isMember(db, boardId, record.userId);
      if (!allowed) {
        console.warn('[whiteboard] clear forbidden', { boardId, userId: record.userId });
        send('whiteboard:error', { payload: { code: 'forbidden' } });
        return true;
      }

      try {
        await clearHistory(db, boardId);
      } catch (err) {
        console.error('[whiteboard] clearHistory failed:', err);
      }

      publishToRoom(boardId, 'whiteboard:clear', {
        boardId,
        t: Date.now(),
        sourceId: record.userId,
      });

      return true;
    }

    if (type === 'whiteboard:leave') {
      const parsed = z.object({ boardId: BoardIdSchema }).safeParse(message.payload);
      if (!parsed.success) {
        send('whiteboard:error', { payload: { code: 'invalid_request' } });
        return true;
      }

      const { boardId } = parsed.data;
      leaveRoom(record, boardId);
      send('whiteboard:left', { payload: { boardId } });
      return true;
    }

    if (!isStrokeEventType(type)) {
      return false;
    }

    if (payloadByteLength(message.payload) > MAX_PAYLOAD_BYTES) {
      send('whiteboard:error', { payload: { code: 'payload_too_large' } });
      return true;
    }

    const parsed = StrokeEventSchema.safeParse({
      ...(typeof message.payload === 'object' && message.payload ? message.payload : {}),
    });

    if (!parsed.success) {
      console.error('[WB-SERVER] Stroke Invalid', parsed.error);
      send('whiteboard:error', { payload: { code: 'invalid_request' } });
      return true;
    }

    const { boardId, strokeId, x, y, t, sourceId, color, width } = parsed.data;

    if (!record.rooms.has(boardId)) {
      console.log('[WB-SERVER] User sent stroke but not in room. Attempting recovery.', { userId: record.userId, boardId });
      
      const allowed = await isMember(db, boardId, record.userId);
      if (allowed) {
        const out = joinRoom(record, boardId);
        if (out.ok) {
          console.log('[whiteboard] auto-rejoined user', { userId: record.userId, boardId });
        } else {
          console.error('[WB-SERVER] Auto-rejoin failed', { reason: out.reason });
          send('whiteboard:error', { payload: { code: 'not_joined' } });
          return true;
        }
      } else {
        console.error('[WB-SERVER] Stroke rejected: User not allowed in room', { userId: record.userId, boardId });
        send('whiteboard:error', { payload: { code: 'forbidden' } });
        return true;
      }
    }

    const now = Date.now();
    const currentState = rateStateByRecord.get(record);
    const rateDecision = shouldRateLimit(currentState, now);
    rateStateByRecord.set(record, rateDecision.next);
    if (rateDecision.limited) {
      send('whiteboard:error', { payload: { code: 'rate_limited' } });
      return true;
    }

    try {
      await persistEvent(db, { boardId, type, strokeId, x, y, t, sourceId, color, width });
      if (type === 'stroke:end') {
        await pruneEvents(db, boardId);
      }
    } catch (err) {
      console.error('[whiteboard] persistEvent failed:', err);
    }

    // --- REVERTED TO ORIGINAL (FLAT) ---
    // The "Smart Client" will handle this whether SocketManager wraps it or not.
    const result = publishToRoom(boardId, type, {
        boardId,
        strokeId,
        x,
        y,
        t,
        sourceId,
        color,
        width,
    });

    if (result.delivered === 0) {
      // console.warn('[whiteboard] publishToRoom delivered to 0 clients', { boardId });
    }

    return true;
  };
}