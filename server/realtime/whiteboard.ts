import { z } from 'zod';

const BOARD_ID_MAX_LENGTH = 64;
const STROKE_ID_MAX_LENGTH = 64;
const SOURCE_ID_MAX_LENGTH = 64;
const MAX_PAYLOAD_BYTES = 2048;
const MAX_EVENTS_PER_WINDOW = 240;
const RATE_LIMIT_WINDOW_MS = 5000;
const MAX_EVENTS_PER_BOARD = 20000;
const MAX_DELTA_EVENTS = 5000;
const WHITEBOARD_DEBUG = true;

function wbDebugLog(label: string, data?: Record<string, unknown>): void {
  if (!WHITEBOARD_DEBUG) return;
  if (data) {
    console.log('[WB-DEBUG]', label, data);
    return;
  }
  console.log('[WB-DEBUG]', label);
}

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

type WhiteboardQuery = {
  select: (...columns: string[]) => WhiteboardQuery;
  where: (columnOrConditions: string | Record<string, unknown>, value?: unknown, value2?: unknown) => WhiteboardQuery;
  orderBy: (column: string, direction?: 'asc' | 'desc') => WhiteboardQuery;
  limit: (value: number) => WhiteboardQuery;
  whereNotIn: (column: string, values: unknown) => WhiteboardQuery;
  insert: (data: Record<string, unknown>) => Promise<unknown> | WhiteboardQuery;
  del: () => Promise<unknown>;
  first: () => Promise<unknown>;
};

type WhiteboardDb = (tableName: string) => WhiteboardQuery;

function payloadByteLength(payload: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(payload));
  } catch {
    return MAX_PAYLOAD_BYTES + 1;
  }
}

function normalizeSeq(value: unknown): number | null {
  const seq = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : null;
  return seq !== null && Number.isFinite(seq) ? Number(seq) : null;
}

function normalizeNumber(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : null;
  return num !== null && Number.isFinite(num) ? Number(num) : null;
}

function isStrokeEventType(value: string): value is 'stroke:start' | 'stroke:move' | 'stroke:end' {
  return value === 'stroke:start' || value === 'stroke:move' || value === 'stroke:end';
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

async function isMember(db: WhiteboardDb, boardId: string, userId: string): Promise<boolean> {
  const row = await db('room_members').where({ room_id: boardId, user_id: userId }).first();
  return Boolean(row);
}


async function persistEvent(db: WhiteboardDb, event: {
  boardId: string;
  type: 'stroke:start' | 'stroke:move' | 'stroke:end';
  strokeId: string;
  x: number;
  y: number;
  t: number;
  sourceId?: string;
  color?: string;
  width?: number;
}): Promise<number | null> {
  const inserted = await (db('whiteboard_events') as any).insert({
    board_id: event.boardId,
    event_type: event.type,
    stroke_id: event.strokeId,
    x: event.x,
    y: event.y,
    t: event.t,
    source_id: event.sourceId ?? null,
    color: event.color ?? null,
    width: event.width ?? null,
  }, ['id']);
  console.log('[WB-DB] persisted event', {
    boardId: event.boardId,
    type: event.type,
    strokeId: event.strokeId,
  });
  if (Array.isArray(inserted) && inserted.length) {
    const row = inserted[0] as { id?: unknown } | number | string;
    const id = typeof row === 'object' && row !== null && 'id' in row ? (row as { id?: unknown }).id : row;
    const seq = normalizeSeq(id);
    if (seq !== null) return seq;
  }
  const fallback = await db('whiteboard_events')
    .select('id')
    .where({ board_id: event.boardId })
    .orderBy('id', 'desc')
    .first();
  const fallbackId = typeof fallback === 'object' && fallback !== null && 'id' in fallback ? (fallback as { id?: unknown }).id : null;
  return normalizeSeq(fallbackId);
}

async function fetchEventsAfterSeq(db: WhiteboardDb, boardId: string, lastSeq: number): Promise<Array<Record<string, unknown>>> {
  const rows = await (db('whiteboard_events') as any)
    .select('id', 'event_type', 'stroke_id', 'x', 'y', 't', 'source_id', 'color', 'width')
    .where('board_id', boardId)
    .where('id', '>', lastSeq)
    .orderBy('id', 'asc')
    .limit(MAX_DELTA_EVENTS);

  return rows
    .map((evt: any) => {
      const x = normalizeNumber(evt.x);
      const y = normalizeNumber(evt.y);
      const t = normalizeNumber(evt.t);
      const seq = normalizeSeq(evt.id);
      if (x === null || y === null || t === null || seq === null) return null;
      return {
        type: evt.event_type,
        boardId,
        strokeId: evt.stroke_id,
        x,
        y,
        t,
        seq,
        sourceId: evt.source_id ?? undefined,
        color: evt.color ?? undefined,
        width: evt.width ?? undefined,
      };
    })
    .filter((evt): evt is Record<string, unknown> => Boolean(evt));
}

async function pruneEvents(db: WhiteboardDb, boardId: string) {
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
  wbDebugLog('history:prune', { boardId, maxEvents: MAX_EVENTS_PER_BOARD });
}

async function clearHistory(db: WhiteboardDb, boardId: string) {
  await db('whiteboard_events').where({ board_id: boardId }).del();
  console.log('[WB-DB] cleared history', { boardId });
  wbDebugLog('history:clear', { boardId });
}

export function createWhiteboardMessageHandler({
  db,
}: {
  db: WhiteboardDb;
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

    if (type !== 'ping' && !isStrokeEventType(type)) {
      console.log('[WB-SERVER] Msg:', { type, userId: record.userId, boardId: (message.payload as any)?.boardId });
    }

    if (type === 'ping') {
      const boardId = (message.payload as { boardId?: string })?.boardId;
      send('pong', { payload: { boardId, t: Date.now() } });
      return true;
    }

    if (type === 'whiteboard:join') {
      const parsed = z.object({
        boardId: BoardIdSchema,
        cursor: z
          .object({
            lastSeq: z.number().int().nonnegative().optional(),
            lastTs: z.string().datetime().nullable().optional(),
          })
          .optional(),
      }).safeParse(message.payload);
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
      const lastSeq = parsed.data.cursor?.lastSeq;
      if (typeof lastSeq === 'number' && Number.isFinite(lastSeq) && lastSeq > 0) {
        try {
          const missing = await fetchEventsAfterSeq(db, boardId, lastSeq);
          for (const evt of missing) {
            send((evt as { type: string }).type, evt);
          }
          wbDebugLog('history:delta', { boardId, fromSeq: lastSeq, count: missing.length });
        } catch (err) {
          wbDebugLog('history:delta:error', { boardId, fromSeq: lastSeq });
        }
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
      wbDebugLog('stroke:rejected:payload_too_large', { boardId: (message.payload as any)?.boardId });
      return true;
    }

    const parsed = StrokeEventSchema.safeParse({
      ...(typeof message.payload === 'object' && message.payload ? message.payload : {}),
    });

    if (!parsed.success) {
      console.error('[WB-SERVER] Stroke Invalid', parsed.error);
      send('whiteboard:error', { payload: { code: 'invalid_request' } });
      wbDebugLog('stroke:rejected:invalid_request');
      return true;
    }

    const { boardId, strokeId, x, y, t, sourceId, color, width } = parsed.data;

    if (!record.rooms.has(boardId)) {
      console.log('[WB-SERVER] User sent stroke but not in room. Attempting recovery.', { userId: record.userId, boardId });
      wbDebugLog('stroke:not_in_room', { userId: record.userId, boardId });
      
      const allowed = await isMember(db, boardId, record.userId);
      if (allowed) {
        const out = joinRoom(record, boardId);
        if (out.ok) {
          console.log('[whiteboard] auto-rejoined user', { userId: record.userId, boardId });
          wbDebugLog('stroke:auto_rejoin', { userId: record.userId, boardId });
        } else {
          console.error('[WB-SERVER] Auto-rejoin failed', { reason: out.reason });
          send('whiteboard:error', { payload: { code: 'not_joined' } });
          wbDebugLog('stroke:rejected:auto_rejoin_failed', { userId: record.userId, boardId, reason: out.reason });
          return true;
        }
      } else {
        console.error('[WB-SERVER] Stroke rejected: User not allowed in room', { userId: record.userId, boardId });
        send('whiteboard:error', { payload: { code: 'forbidden' } });
        wbDebugLog('stroke:rejected:forbidden', { userId: record.userId, boardId });
        return true;
      }
    }

    const now = Date.now();
    const currentState = rateStateByRecord.get(record);
    const rateDecision = shouldRateLimit(currentState, now);
    rateStateByRecord.set(record, rateDecision.next);
    if (rateDecision.limited) {
      send('whiteboard:error', { payload: { code: 'rate_limited' } });
      wbDebugLog('stroke:rejected:rate_limited', { userId: record.userId, boardId });
      return true;
    }

    try {
      const seq = await persistEvent(db, { boardId, type, strokeId, x, y, t, sourceId, color, width });
      wbDebugLog('stroke:persisted', { boardId, type, strokeId, seq: seq ?? undefined });
      if (type === 'stroke:end') {
        await pruneEvents(db, boardId);
      }
      const result = publishToRoom(boardId, type, {
          boardId,
          strokeId,
          x,
          y,
          t,
          seq: seq ?? undefined,
          sourceId,
          color,
          width,
      });

      if (result.delivered === 0) {
        // console.warn('[whiteboard] publishToRoom delivered to 0 clients', { boardId });
      }
      return true;
    } catch (err) {
      console.error('[whiteboard] persistEvent failed:', err);
      wbDebugLog('stroke:persisted:error', { boardId, type, strokeId });
    }
    return true;
  };
}