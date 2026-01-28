import type { Knex } from 'knex';
import { z } from 'zod';

const BOARD_ID_MAX_LENGTH = 64;
const STROKE_ID_MAX_LENGTH = 64;
const SOURCE_ID_MAX_LENGTH = 64;
const MAX_PAYLOAD_BYTES = 2048;
const MAX_EVENTS_PER_WINDOW = 240;
const RATE_LIMIT_WINDOW_MS = 5000;

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

    if (type === 'whiteboard:join') {
      const parsed = z.object({ boardId: BoardIdSchema }).safeParse(message.payload);
      if (!parsed.success) {
        send('whiteboard:error', { code: 'invalid_request' });
        return true;
      }

      const { boardId } = parsed.data;
      const allowed = await isMember(db, boardId, record.userId);
      if (!allowed) {
        send('whiteboard:error', { code: 'forbidden' });
        return true;
      }

      const out = joinRoom(record, boardId);
      if (!out.ok) {
        send('whiteboard:error', { code: 'join_failed' });
        return true;
      }

      send('whiteboard:joined', { boardId });
      return true;
    }

    if (type === 'whiteboard:leave') {
      const parsed = z.object({ boardId: BoardIdSchema }).safeParse(message.payload);
      if (!parsed.success) {
        send('whiteboard:error', { code: 'invalid_request' });
        return true;
      }

      const { boardId } = parsed.data;
      leaveRoom(record, boardId);
      send('whiteboard:left', { boardId });
      return true;
    }

    if (!isStrokeEventType(type)) {
      return false;
    }

    if (payloadByteLength(message.payload) > MAX_PAYLOAD_BYTES) {
      send('whiteboard:error', { code: 'payload_too_large' });
      return true;
    }

    const parsed = StrokeEventSchema.safeParse({
      ...(typeof message.payload === 'object' && message.payload ? message.payload : {}),
    });

    if (!parsed.success) {
      send('whiteboard:error', { code: 'invalid_request' });
      return true;
    }

    const { boardId, strokeId, x, y, t, sourceId, color, width } = parsed.data;

    if (!record.rooms.has(boardId)) {
      send('whiteboard:error', { code: 'not_joined' });
      return true;
    }

    const now = Date.now();
    const currentState = rateStateByRecord.get(record);
    const rateDecision = shouldRateLimit(currentState, now);
    rateStateByRecord.set(record, rateDecision.next);
    if (rateDecision.limited) {
      send('whiteboard:error', { code: 'rate_limited' });
      return true;
    }

    publishToRoom(boardId, type, {
      boardId,
      strokeId,
      x,
      y,
      t,
      sourceId,
      color,
      width,
    });

    return true;
  };
}
