import { z } from 'zod';
import type { IncomingMessage } from 'http';
import type { Knex } from 'knex';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';

const BOARD_ID_MAX_LENGTH = 64;
const STROKE_ID_MAX_LENGTH = 64;
const SOURCE_ID_MAX_LENGTH = 64;
const MAX_PAYLOAD_BYTES = 2048;
const MAX_EVENTS_PER_WINDOW = 240;
const RATE_LIMIT_WINDOW_MS = 5000;
const MAX_EVENTS_PER_BOARD = 20000;
const MAX_DELTA_EVENTS = 5000;
const WHITEBOARD_DEBUG = true;
const { authenticateToken } = require('../middleware/auth');
const { getAllowedOrigins } = require('../config/allowedOrigins');

type SetupWSConnection = (conn: import('ws').WebSocket, req: IncomingMessage, opts?: { docName?: string; gc?: boolean }) => void;
type GetYDoc = (docName: string, gc?: boolean) => Y.Doc;
const yws = require('y-websocket/bin/utils') as { setupWSConnection: SetupWSConnection; getYDoc: GetYDoc };

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
  segmentIndex: z.number().int().nonnegative().optional(),
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
  segmentIndex?: number;
  sourceId?: string;
  color?: string;
  width?: number;
}): Promise<{ seq: number | null; inserted: boolean }> {
  const insertRow = {
    board_id: event.boardId,
    event_type: event.type,
    stroke_id: event.strokeId,
    x: event.x,
    y: event.y,
    t: event.t,
    segment_index: typeof event.segmentIndex === 'number' ? event.segmentIndex : null,
    source_id: event.sourceId ?? null,
    color: event.color ?? null,
    width: event.width ?? null,
  };

  const insertQuery = (db('whiteboard_events') as any).insert(insertRow, ['id']);
  if (typeof event.segmentIndex === 'number' && typeof insertQuery.onConflict === 'function') {
    insertQuery.onConflict(['board_id', 'stroke_id', 'segment_index']).ignore();
  }

  const inserted = await insertQuery;
  if (Array.isArray(inserted) && inserted.length) {
    const row = inserted[0] as { id?: unknown } | number | string;
    const id = typeof row === 'object' && row !== null && 'id' in row ? (row as { id?: unknown }).id : row;
    const seq = normalizeSeq(id);
    if (seq !== null) return { seq, inserted: true };
    return { seq: null, inserted: true };
  }

  if (typeof event.segmentIndex === 'number') {
    const existing = await db('whiteboard_events')
      .select('id')
      .where({
        board_id: event.boardId,
        stroke_id: event.strokeId,
        segment_index: event.segmentIndex,
      })
      .first();
    const existingId = typeof existing === 'object' && existing !== null && 'id' in existing ? (existing as { id?: unknown }).id : null;
    return { seq: normalizeSeq(existingId), inserted: false };
  }

  const fallback = await db('whiteboard_events')
    .select('id')
    .where({ board_id: event.boardId })
    .orderBy('id', 'desc')
    .first();
  const fallbackId = typeof fallback === 'object' && fallback !== null && 'id' in fallback ? (fallback as { id?: unknown }).id : null;
  return { seq: normalizeSeq(fallbackId), inserted: false };
}

async function fetchEventsAfterSeq(db: WhiteboardDb, boardId: string, lastSeq: number): Promise<Array<Record<string, unknown>>> {
  const rows = await (db('whiteboard_events') as any)
    .select('id', 'event_type', 'stroke_id', 'x', 'y', 't', 'segment_index', 'source_id', 'color', 'width')
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
        segmentIndex: typeof evt.segment_index === 'number' ? evt.segment_index : undefined,
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

    const { boardId, strokeId, x, y, t, sourceId, color, width, segmentIndex } = parsed.data;

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
      const result = await persistEvent(db, { boardId, type, strokeId, x, y, t, segmentIndex, sourceId, color, width });
      wbDebugLog('stroke:persisted', { boardId, type, strokeId, seq: result.seq ?? undefined });

      if (typeof segmentIndex === 'number') {
        send('whiteboard:ack', {
          payload: {
            boardId,
            strokeId,
            segmentIndex,
            type,
            seq: result.seq ?? undefined,
          },
        });
      }

      if (result.inserted) {
        if (type === 'stroke:end') {
          await pruneEvents(db, boardId);
        }
        const publishResult = publishToRoom(boardId, type, {
          boardId,
          strokeId,
          x,
          y,
          t,
          seq: result.seq ?? undefined,
          segmentIndex,
          sourceId,
          color,
          width,
        });

        if (publishResult.delivered === 0) {
          // console.warn('[whiteboard] publishToRoom delivered to 0 clients', { boardId });
        }
      }
      return true;
    } catch (err) {
      console.error('[whiteboard] persistEvent failed:', err);
      wbDebugLog('stroke:persisted:error', { boardId, type, strokeId });
    }
    return true;
  };
}

const WHITEBOARD_DOC_TABLE = 'whiteboard_documents';
const PERSIST_DEBOUNCE_MS = 1500;

type WhiteboardDocRow = {
  board_id: string;
  ydoc: Buffer | Uint8Array | string | null;
  updated_at?: Date | string | null;
};

type WhiteboardLogger = {
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
};

type WhiteboardMetrics = {
  incRealtimeDisconnectReason?: (reason: string) => void;
};

function isRealtimeDisabled(): boolean {
  const v = String(process.env.REALTIME_EVENTS_DISABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function writeHttpResponse(socket: any, statusCode: number, message: string) {
  const statusText = statusCode === 401
    ? 'Unauthorized'
    : statusCode === 403
      ? 'Forbidden'
      : statusCode === 426
        ? 'Upgrade Required'
        : statusCode === 429
          ? 'Too Many Requests'
          : statusCode === 503
            ? 'Service Unavailable'
            : 'Error';
  const body = JSON.stringify({ success: false, error: message });
  try {
    socket.write(
      `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
        'Content-Type: application/json\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        '\r\n' +
        body,
    );
  } catch {
    // ignore
  }
  try {
    socket.destroy();
  } catch {
    // ignore
  }
}

function isOriginAllowed(origin: string | undefined | null) {
  if (!origin || origin === 'null') return false;
  const allowed = getAllowedOrigins();
  return allowed.includes(origin);
}

function extractBoardIdFromPath(pathname: string): string | null {
  const cleaned = pathname.replace(/\/+$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length < 3) return null;
  if (parts[0] === 'events' && parts[1] === 'whiteboard') {
    return parts[2] ?? null;
  }
  if (parts[0] === 'api' && parts[1] === 'v1' && parts[2] === 'events' && parts[3] === 'whiteboard') {
    return parts[4] ?? null;
  }
  return null;
}

function toUpdateBuffer(value: Buffer | Uint8Array | string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new Uint8Array(Buffer.from(value, 'base64'));
  return new Uint8Array(value);
}

export function createWhiteboardYjsServer({
  db,
  logger,
  metrics,
}: {
  db: Knex;
  logger?: WhiteboardLogger | null;
  metrics?: WhiteboardMetrics | null;
}) {
  const wss = new WebSocketServer({ noServer: true });
  const docStates = new Map<string, { loaded: boolean; listenerAttached: boolean; persistTimer: NodeJS.Timeout | null }>();

  const loadDocFromDb = async (boardId: string, doc: Y.Doc) => {
    const row = await db<WhiteboardDocRow>(WHITEBOARD_DOC_TABLE)
      .select('ydoc')
      .where({ board_id: boardId })
      .first();
    if (!row || !row.ydoc) return;
    try {
      const update = toUpdateBuffer(row.ydoc);
      Y.applyUpdate(doc, update);
    } catch (err) {
      logger?.warn?.('[whiteboard] Failed to hydrate Yjs doc', { boardId });
    }
  };

  const persistDocToDb = async (boardId: string, doc: Y.Doc) => {
    const update = Y.encodeStateAsUpdate(doc);
    await db(WHITEBOARD_DOC_TABLE)
      .insert({
        board_id: boardId,
        ydoc: Buffer.from(update),
        updated_at: new Date(),
      })
      .onConflict('board_id')
      .merge({
        ydoc: Buffer.from(update),
        updated_at: new Date(),
      });
  };

  const schedulePersist = (boardId: string, doc: Y.Doc) => {
    const state = docStates.get(boardId) || { loaded: false, listenerAttached: false, persistTimer: null };
    if (state.persistTimer) return;
    state.persistTimer = setTimeout(() => {
      state.persistTimer = null;
      void persistDocToDb(boardId, doc).catch(() => {
        logger?.warn?.('[whiteboard] Failed to persist Yjs doc', { boardId });
      });
    }, PERSIST_DEBOUNCE_MS);
    docStates.set(boardId, state);
  };

  const ensureDocReady = async (boardId: string) => {
    const doc = yws.getYDoc(boardId, true);
    const state = docStates.get(boardId) || { loaded: false, listenerAttached: false, persistTimer: null };
    if (!state.loaded) {
      await loadDocFromDb(boardId, doc);
      state.loaded = true;
    }
    if (!state.listenerAttached) {
      doc.on('update', () => schedulePersist(boardId, doc));
      state.listenerAttached = true;
    }
    docStates.set(boardId, state);
  };

  const authenticateUpgrade = async (req: IncomingMessage) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const tokenRaw = url.searchParams.get('token') || url.searchParams.get('access_token') || '';
    const token = tokenRaw.trim();

    if (!token) {
      return { ok: false, status: 401, error: 'Authorization header with Bearer token required' } as const;
    }

    req.headers.authorization = `Bearer ${token}`;

    return new Promise<{ ok: boolean; status?: number; error?: string; userId?: string }>((resolve) => {
      const res: any = {
        statusCode: 200,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(body: any) {
          resolve({ ok: false, status: this.statusCode || 401, error: body?.error || 'Unauthorized' });
        },
        end() {
          resolve({ ok: false, status: this.statusCode || 401, error: 'Unauthorized' });
        },
      };

      authenticateToken(req as any, res, () => {
        const userId = req && (req as any).user && (req as any).user.id ? String((req as any).user.id) : '';
        if (!userId) {
          resolve({ ok: false, status: 401, error: 'Unauthorized' });
          return;
        }
        resolve({ ok: true, userId });
      });
    });
  };

  const handleUpgrade = async (req: IncomingMessage, socket: any, head: Buffer) => {
    if (isRealtimeDisabled()) {
      writeHttpResponse(socket, 503, 'Real-time events disabled');
      return;
    }

    const url = new URL(req.url || '/', 'http://localhost');
    const origin = req.headers.origin ? String(req.headers.origin) : '';
    if (origin && !isOriginAllowed(origin)) {
      try {
        metrics?.incRealtimeDisconnectReason?.('origin_reject');
      } catch {
        // ignore
      }
      writeHttpResponse(socket, 403, 'Origin not allowed');
      return;
    }

    const boardIdRaw = extractBoardIdFromPath(url.pathname);
    const parsed = BoardIdSchema.safeParse(boardIdRaw);
    if (!parsed.success) {
      writeHttpResponse(socket, 404, 'Whiteboard room not found');
      return;
    }
    const boardId = parsed.data;

    const auth = await authenticateUpgrade(req);
    if (!auth.ok || !auth.userId) {
      try {
        metrics?.incRealtimeDisconnectReason?.('auth_fail');
      } catch {
        // ignore
      }
      writeHttpResponse(socket, auth.status || 401, auth.error || 'Unauthorized');
      return;
    }

    const allowed = await isMember(db as unknown as WhiteboardDb, boardId, auth.userId);
    if (!allowed) {
      writeHttpResponse(socket, 403, 'Forbidden');
      return;
    }

    await ensureDocReady(boardId);
    (req as any).whiteboardContext = { boardId, userId: auth.userId };

    wss.handleUpgrade(req, socket, head, (ws: any) => {
      wss.emit('connection', ws, req);
    });
  };

  wss.on('connection', (conn: any, req: IncomingMessage) => {
    const ctx = (req as any).whiteboardContext || {};
    const boardId = typeof ctx.boardId === 'string' ? ctx.boardId : '';
    if (!boardId) {
      try {
        conn.close?.();
      } catch {
        // ignore
      }
      return;
    }

    yws.setupWSConnection(conn, req, { docName: boardId, gc: true });
  });

  const closeAll = () => {
    try {
      wss.clients.forEach((client: any) => {
        try {
          client.close?.();
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
    try {
      wss.close();
    } catch {
      // ignore
    }
  };

  return {
    handleUpgrade,
    closeAll,
  };
}
