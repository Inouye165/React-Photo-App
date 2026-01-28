import type { IncomingMessage } from 'http';

const { randomUUID } = require('crypto');
const { WebSocketServer } = require('ws');
const { authenticateToken: defaultAuthenticateToken } = require('../middleware/auth');
const { getAllowedOrigins } = require('../config/allowedOrigins');
const logger = require('../logger');

const STATUS_TEXT: Record<number, string> = {
  401: 'Unauthorized',
  403: 'Forbidden',
  426: 'Upgrade Required',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

function defaultGenerateId(): string {
  if (typeof randomUUID === 'function') return randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRealtimeDisabled(): boolean {
  const v = String(process.env.REALTIME_EVENTS_DISABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function normalizeRoomId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) return null;
  return trimmed;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

type Metrics = {
  incRealtimeConnect?: () => void;
  incRealtimeDisconnect?: () => void;
  incRealtimeDisconnectReason?: (reason: string) => void;
  setRealtimeActiveConnections?: (value: number) => void;
  incRealtimeEventsPublished?: () => void;
};

type PhotoEventHistory = {
  getCatchupEvents?: (args: { userId: string; since?: string | number }) => Promise<{ ok: boolean; events?: Array<Record<string, unknown>> }>;
};

type SocketMessage = {
  type: string;
  payload?: unknown;
  eventId?: string;
};

type ClientMessage = {
  type: string;
  roomId?: string;
  payload?: unknown;
};

type SocketRecord = {
  ws: any;
  userId: string;
  rooms: Set<string>;
  isAlive: boolean;
  closed: boolean;
};

type ClientMessageHandler = (args: {
  record: SocketRecord;
  message: ClientMessage;
  send: (type: string, payload?: unknown) => void;
  joinRoom: (record: SocketRecord, roomId: string) => { ok: boolean; reason?: string; roomId?: string };
  leaveRoom: (record: SocketRecord, roomId: string) => { ok: boolean; reason?: string; roomId?: string };
  publishToRoom: (roomId: string, eventName: string, payload?: Record<string, unknown>) => { delivered: number; eventId?: string };
}) => boolean | Promise<boolean>;

function writeHttpResponse(socket: any, statusCode: number, message: string) {
  const statusText = STATUS_TEXT[statusCode] || 'Error';
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

export function createSocketManager(options: {
  heartbeatMs?: number;
  maxConnectionsPerUser?: number;
  maxBufferedBytes?: number;
  generateId?: () => string;
  metrics?: Metrics | null;
  logger?: typeof logger;
  authenticateToken?: typeof defaultAuthenticateToken;
  photoEventHistory?: PhotoEventHistory | null;
  clientMessageHandler?: ClientMessageHandler | null;
} = {}) {
  const heartbeatMs = Number.isFinite(options.heartbeatMs) ? Number(options.heartbeatMs) : 25_000;
  const maxConnectionsPerUser = Number.isFinite(options.maxConnectionsPerUser) ? Number(options.maxConnectionsPerUser) : 3;
  const maxBufferedBytes = Number.isFinite(options.maxBufferedBytes) ? Number(options.maxBufferedBytes) : 64 * 1024;
  const generateId = typeof options.generateId === 'function' ? options.generateId : defaultGenerateId;
  const metrics = options.metrics || null;
  const log = options.logger || logger;
  const authenticateToken = options.authenticateToken || defaultAuthenticateToken;
  const photoEventHistory = options.photoEventHistory || null;
  const clientMessageHandler = options.clientMessageHandler || null;

  const wss = new WebSocketServer({ noServer: true });
  const clientsByUserId = new Map<string, Set<SocketRecord>>();
  const rooms = new Map<string, Set<SocketRecord>>();

  let heartbeatTimer: NodeJS.Timeout | null = null;

  function totalClientCount() {
    let n = 0;
    for (const set of clientsByUserId.values()) n += set.size;
    return n;
  }

  function recordMetricsConnect() {
    try {
      metrics?.incRealtimeConnect?.();
    } catch {
      // ignore
    }
    try {
      metrics?.setRealtimeActiveConnections?.(totalClientCount());
    } catch {
      // ignore
    }
  }

  function recordMetricsDisconnect(reason?: string) {
    try {
      metrics?.incRealtimeDisconnect?.();
    } catch {
      // ignore
    }
    if (reason) {
      try {
        metrics?.incRealtimeDisconnectReason?.(reason || 'client_close');
      } catch {
        // ignore
      }
    }
    try {
      metrics?.setRealtimeActiveConnections?.(totalClientCount());
    } catch {
      // ignore
    }
  }

  function getUserClientCount(userId: string) {
    const set = clientsByUserId.get(String(userId));
    return set ? set.size : 0;
  }

  function canAcceptClient(userId: string) {
    return getUserClientCount(userId) < maxConnectionsPerUser;
  }

  function ensureHeartbeat() {
    if (!heartbeatMs || heartbeatMs <= 0) return;
    if (heartbeatTimer) return;

    heartbeatTimer = setInterval(() => {
      for (const set of clientsByUserId.values()) {
        for (const record of set) {
          if (record.closed) continue;
          if (!record.isAlive) {
            removeClient(record.userId, record.ws, 'heartbeat_timeout');
            try {
              record.ws.terminate?.();
            } catch {
              // ignore
            }
            continue;
          }
          record.isAlive = false;
          try {
            record.ws.ping?.();
          } catch {
            // ignore
          }
        }
      }
    }, heartbeatMs);

    if (heartbeatTimer && typeof heartbeatTimer.unref === 'function') {
      heartbeatTimer.unref();
    }
  }

  function removeFromRooms(record: SocketRecord) {
    for (const roomId of record.rooms) {
      const set = rooms.get(roomId);
      if (!set) continue;
      set.delete(record);
      if (set.size === 0) rooms.delete(roomId);
    }
    record.rooms.clear();
  }

  function addClient(userId: string, ws: any) {
    const key = String(userId);
    const record: SocketRecord = { ws, userId: key, rooms: new Set(), isAlive: true, closed: false };

    if (!clientsByUserId.has(key)) {
      clientsByUserId.set(key, new Set());
    }
    clientsByUserId.get(key)!.add(record);

    ensureHeartbeat();
    recordMetricsConnect();

    ws.on('pong', () => {
      record.isAlive = true;
    });

    ws.on('close', () => {
      removeClient(key, ws, 'client_close');
    });

    ws.on('error', () => {
      removeClient(key, ws, 'error');
    });

    ws.on('message', (data: unknown) => {
      void handleIncomingMessage(record, data);
    });

    return record;
  }

  function removeClient(userId: string, ws: any, reason?: string) {
    const key = String(userId);
    const set = clientsByUserId.get(key);
    if (!set || set.size === 0) return;

    for (const record of set) {
      if (record.ws === ws) {
        if (record.closed) return;
        record.closed = true;
        set.delete(record);
        removeFromRooms(record);
        recordMetricsDisconnect(reason || 'client_close');
        break;
      }
    }

    if (set.size === 0) clientsByUserId.delete(key);
  }

  function sendToRecord(record: SocketRecord, message: SocketMessage) {
    if (!record || record.closed) return { ok: false, reason: 'closed' };
    if (!record.ws || record.ws.readyState !== 1) return { ok: false, reason: 'not_open' };

    try {
      const buffered = typeof record.ws.bufferedAmount === 'number' ? record.ws.bufferedAmount : 0;
      if (buffered > maxBufferedBytes) {
        removeClient(record.userId, record.ws, 'backpressure_drop');
        try {
          record.ws.close?.();
        } catch {
          // ignore
        }
        return { ok: false, reason: 'backpressure_drop' };
      }

      record.ws.send(JSON.stringify(message));
      return { ok: true };
    } catch {
      removeClient(record.userId, record.ws, 'error');
      return { ok: false, reason: 'error' };
    }
  }

  function publishToUser(userId: string, eventName: string, payload?: Record<string, unknown>) {
    const key = String(userId);
    const set = clientsByUserId.get(key);
    if (!set || set.size === 0) return { delivered: 0 };

    const upstreamEventId = payload && typeof payload === 'object' ? payload.eventId : null;
    const eventId = (typeof upstreamEventId === 'string' && upstreamEventId.trim()) ? upstreamEventId : generateId();
    const data = payload && typeof payload === 'object' ? { ...payload, eventId } : { eventId, payload };
    const message: SocketMessage = { type: eventName, payload: data, eventId };

    let delivered = 0;
    for (const record of Array.from(set)) {
      const out = sendToRecord(record, message);
      if (!out.ok) continue;
      delivered += 1;
    }

    return { delivered, eventId };
  }

  function publishToRoom(roomId: string, eventName: string, payload?: Record<string, unknown>) {
    const key = String(roomId);
    const set = rooms.get(key);
    if (!set || set.size === 0) return { delivered: 0 };

    const upstreamEventId = payload && typeof payload === 'object' ? payload.eventId : null;
    const eventId = (typeof upstreamEventId === 'string' && upstreamEventId.trim()) ? upstreamEventId : generateId();
    const data = payload && typeof payload === 'object' ? { ...payload, eventId } : { eventId, payload };
    const message: SocketMessage = { type: eventName, payload: data, eventId };

    let delivered = 0;
    for (const record of Array.from(set)) {
      const out = sendToRecord(record, message);
      if (!out.ok) continue;
      delivered += 1;
    }

    return { delivered, eventId };
  }

  function joinRoom(record: SocketRecord, roomId: string) {
    const normalized = normalizeRoomId(roomId);
    if (!normalized) return { ok: false, reason: 'invalid_room' };

    if (!rooms.has(normalized)) rooms.set(normalized, new Set());
    rooms.get(normalized)!.add(record);
    record.rooms.add(normalized);

    return { ok: true, roomId: normalized };
  }

  function leaveRoom(record: SocketRecord, roomId: string) {
    const normalized = normalizeRoomId(roomId);
    if (!normalized) return { ok: false, reason: 'invalid_room' };

    const set = rooms.get(normalized);
    if (!set) return { ok: false, reason: 'not_joined' };
    set.delete(record);
    record.rooms.delete(normalized);
    if (set.size === 0) rooms.delete(normalized);

    return { ok: true, roomId: normalized };
  }

  async function handleIncomingMessage(record: SocketRecord, data: unknown) {
    let payload: ClientMessage | null = null;

    if (typeof data === 'string') {
      if (data === 'PING') {
        sendToRecord(record, { type: 'PONG', payload: { ts: Date.now() } });
        return;
      }
      try {
        payload = JSON.parse(data);
      } catch {
        return;
      }
    } else if (data instanceof Buffer || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      try {
        let text = '';
        if (data instanceof Buffer) {
          text = data.toString('utf-8');
        } else if (data instanceof ArrayBuffer) {
          text = Buffer.from(new Uint8Array(data)).toString('utf-8');
        } else if (ArrayBuffer.isView(data)) {
          const view = data as ArrayBufferView;
          text = Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('utf-8');
        }
        payload = JSON.parse(text);
      } catch {
        return;
      }
    } else if (data && typeof data === 'object' && 'toString' in data) {
      try {
        payload = JSON.parse(String(data));
      } catch {
        return;
      }
    }

    if (!payload || typeof payload !== 'object') return;
    const type = typeof payload.type === 'string' ? payload.type : '';

    if (type === 'PING') {
      sendToRecord(record, { type: 'PONG', payload: { ts: Date.now() } });
      return;
    }

    if (clientMessageHandler) {
      try {
        const handled = await clientMessageHandler({
          record,
          message: payload,
          send: (messageType, messagePayload) => {
            sendToRecord(record, { type: messageType, payload: messagePayload });
          },
          joinRoom,
          leaveRoom,
          publishToRoom,
        });

        if (handled) return;
      } catch {
        return;
      }
    }

    if (type === 'JOIN_ROOM') {
      const out = joinRoom(record, payload.roomId || '');
      if (out.ok) sendToRecord(record, { type: 'ROOM_JOINED', payload: { roomId: out.roomId } });
      return;
    }

    if (type === 'LEAVE_ROOM') {
      const out = leaveRoom(record, payload.roomId || '');
      if (out.ok) sendToRecord(record, { type: 'ROOM_LEFT', payload: { roomId: out.roomId } });
      return;
    }
  }

  async function authenticateUpgrade(req: IncomingMessage) {
    const url = new URL(req.url || '/', 'http://localhost');
    const tokenRaw = url.searchParams.get('token') || url.searchParams.get('access_token') || '';
    const token = tokenRaw.trim();

    if (!token) {
      return { ok: false, status: 401, error: 'Authorization header with Bearer token required' };
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
  }

  function isOriginAllowed(origin: string | undefined | null) {
    if (!origin || origin === 'null') return false;
    const allowed = getAllowedOrigins();
    return allowed.includes(origin);
  }

  async function handleUpgrade(req: IncomingMessage, socket: any, head: Buffer) {
    if (isRealtimeDisabled()) {
      writeHttpResponse(socket, 503, 'Real-time events disabled');
      return;
    }

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

    if (!canAcceptClient(auth.userId)) {
      try {
        metrics?.incRealtimeDisconnectReason?.('connection_cap');
      } catch {
        // ignore
      }
      writeHttpResponse(socket, 429, 'Too many concurrent event streams');
      return;
    }

    const url = new URL(req.url || '/', 'http://localhost');
    const since = url.searchParams.get('since') || undefined;
    (req as any).realtimeContext = { userId: auth.userId, since };

    wss.handleUpgrade(req, socket, head, (ws: any) => {
      wss.emit('connection', ws, req);
    });
  }

  async function sendCatchup(record: SocketRecord, since?: string | number) {
    if (!photoEventHistory || typeof photoEventHistory.getCatchupEvents !== 'function') return;

    try {
      const out = await photoEventHistory.getCatchupEvents({ userId: record.userId, since });
      if (!out || !out.ok || !Array.isArray(out.events) || out.events.length === 0) return;
      for (const evt of out.events) {
        const eventId = evt && typeof evt === 'object' && isNonEmptyString((evt as any).eventId)
          ? String((evt as any).eventId)
          : generateId();
        const payload = { ...evt, eventId };
        const ok = sendToRecord(record, { type: 'photo.processing', payload, eventId });
        if (!ok.ok) return;
      }
    } catch (err) {
      try {
        log?.warn?.('[realtime] Catch-up replay failed', { error: err?.message || String(err) });
      } catch {
        // ignore
      }
    }
  }

  wss.on('connection', async (ws: any, req: IncomingMessage) => {
    const ctx = (req as any).realtimeContext || {};
    const userId = String(ctx.userId || '');
    const since = ctx.since;

    if (!userId) {
      try {
        ws.close?.();
      } catch {
        // ignore
      }
      return;
    }

    const tempRecord: SocketRecord = { ws, userId, rooms: new Set(), isAlive: true, closed: false };
    await sendCatchup(tempRecord, since);

    const record = addClient(userId, ws);
    sendToRecord(record, {
      type: 'connected',
      payload: { eventId: generateId(), connected: true, updatedAt: new Date().toISOString() },
    });

    try {
      log?.info?.('[realtime] WebSocket client connected');
    } catch {
      // ignore
    }
  });

  function closeAll(reason = 'server_shutdown') {
    for (const set of clientsByUserId.values()) {
      for (const record of set) {
        try {
          record.ws.close?.();
        } catch {
          // ignore
        }
        record.closed = true;
        removeFromRooms(record);
        recordMetricsDisconnect(reason);
      }
    }
    clientsByUserId.clear();
  }

  return {
    handleUpgrade,
    publishToUser,
    publishToRoom,
    joinRoom,
    leaveRoom,
    canAcceptClient,
    getUserClientCount,
    addClient,
    removeClient,
    closeAll,
    _getAllUserIds: () => Array.from(clientsByUserId.keys()),
  };
}
