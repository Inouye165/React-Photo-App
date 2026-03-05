import type { Request, Response } from 'express';
import express from 'express';
import type { Knex } from 'knex';
import { createHash, randomBytes } from 'crypto';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { z } from 'zod';
import * as Y from 'yjs';
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
  created_by: string;
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

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const dbError = error as { code?: string; message?: string };
  if (dbError.code !== '42703') return false;
  const message = String(dbError.message || '').toLowerCase();
  return message.includes(`\"${columnName.toLowerCase()}\"`) || message.includes(` ${columnName.toLowerCase()} `);
}

function isInviteRoomForeignKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const dbError = error as {
    code?: string;
    constraint?: string;
    message?: string;
  };

  if (dbError.code === '23503' && dbError.constraint === 'whiteboard_invites_room_id_foreign') {
    return true;
  }

  return typeof dbError.message === 'string' && dbError.message.includes('whiteboard_invites_room_id_foreign');
}

function isRoomMemberUserForeignKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const dbError = error as {
    code?: string;
    constraint?: string;
    message?: string;
  };

  if (dbError.code === '23503' && dbError.constraint === 'room_members_user_id_foreign') {
    return true;
  }

  return typeof dbError.message === 'string' && dbError.message.includes('room_members_user_id_foreign');
}

async function hydrateMissingRoomForInvite(db: Knex, boardId: string, userId: string): Promise<boolean> {
  try {
    const { data: roomData, error: roomErr } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', boardId)
      .maybeSingle();

    if (roomErr) {
      console.warn('[WB-JOIN] invite-room-hydrate:supabase-query-failed', {
        boardId,
        userId,
        code: roomErr.code,
        message: roomErr.message,
      });
      return false;
    }

    const roomId = String((roomData as { id?: unknown } | null)?.id ?? '');
    if (!roomId) {
      console.warn('[WB-JOIN] invite-room-hydrate:supabase-room-missing', { boardId, userId });
      return false;
    }

    await db('rooms')
      .insert({ id: roomId })
      .onConflict('id')
      .ignore();

    await db('room_members')
      .insert({ room_id: roomId, user_id: userId, is_owner: true })
      .onConflict(['room_id', 'user_id'])
      .ignore();

    console.info('[WB-JOIN] invite-room-hydrate:success', { boardId, userId });
    return true;
  } catch (error) {
    console.warn('[WB-JOIN] invite-room-hydrate:error', {
      boardId,
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function hydrateMissingRoomForJoin(db: Knex, boardId: string, inviteCreatedBy: string | null): Promise<boolean> {
  try {
    const { data: roomData, error: roomErr } = await supabase
      .from('rooms')
      .select('id,created_by')
      .eq('id', boardId)
      .maybeSingle();

    if (roomErr) {
      console.warn('[WB-JOIN] join-room-hydrate:supabase-query-failed', {
        boardId,
        code: roomErr.code,
        message: roomErr.message,
      });
      return false;
    }

    const roomId = String((roomData as { id?: unknown } | null)?.id ?? '');
    if (!roomId) {
      console.warn('[WB-JOIN] join-room-hydrate:supabase-room-missing', { boardId });
      return false;
    }

    const createdByFromRoom = String((roomData as { created_by?: unknown } | null)?.created_by ?? '');
    const createdBy = createdByFromRoom || (inviteCreatedBy ?? '');

    const roomInsert: { id: string; created_by?: string } = { id: roomId };
    if (createdBy) roomInsert.created_by = createdBy;

    await db('rooms').insert(roomInsert).onConflict('id').ignore();

    if (createdBy) {
      await db('room_members')
        .insert({ room_id: roomId, user_id: createdBy, is_owner: true })
        .onConflict(['room_id', 'user_id'])
        .ignore();
    }

    console.info('[WB-JOIN] join-room-hydrate:success', { boardId });
    return true;
  } catch (error) {
    console.warn('[WB-JOIN] join-room-hydrate:error', {
      boardId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
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
  if (room && String((room as { created_by?: unknown }).created_by ?? '') === userId) return true;

  // If we reach here, Knex didn't confirm ownership. In non-test env, fall back to Supabase
  // to tolerate eventual consistency between databases.
  if (process.env.NODE_ENV === 'test') return false;

  try {
    const { data: memberData, error: memberErr } = await supabase
      .from('room_members')
      .select('is_owner')
      .eq('room_id', boardId)
      .eq('user_id', userId)
      .maybeSingle();

    if (memberErr) {
      console.warn('[WB-HTTP] owner-check:fallback:member-query-failed', { boardId, userId, code: memberErr.code, message: memberErr.message });
    } else if (memberData && (memberData as { is_owner?: unknown }).is_owner === true) {
      console.log('[WB-HTTP] owner-check:fallback', { boardId, userId, matched: true, reason: 'member_owner' });
      return true;
    }

    const { data: roomData, error: roomErr } = await supabase
      .from('rooms')
      .select('created_by')
      .eq('id', boardId)
      .maybeSingle();

    if (roomErr) {
      console.warn('[WB-HTTP] owner-check:fallback:room-query-failed', { boardId, userId, code: roomErr.code, message: roomErr.message });
    } else if (roomData && String((roomData as { created_by?: unknown }).created_by ?? '') === userId) {
      console.log('[WB-HTTP] owner-check:fallback', { boardId, userId, matched: true, reason: 'created_by' });
      return true;
    }

    console.log('[WB-HTTP] owner-check:fallback', { boardId, userId, matched: false, reason: 'none' });
    return false;
  } catch (e) {
    console.warn('[WB-HTTP] owner-check:fallback:error', { boardId, userId });
    return false;
  }
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
  let rows: WhiteboardEventRow[] = [];
  try {
    rows = await db<WhiteboardEventRow>('whiteboard_events')
      .select('id', 'event_type', 'stroke_id', 'x', 'y', 't', 'segment_index', 'source_id', 'color', 'width')
      .where('board_id', boardId)
      .orderBy('id', 'asc')
      .limit(MAX_HISTORY_EVENTS);
  } catch (error) {
    if (!isMissingColumnError(error, 'segment_index')) throw error;

    rows = (await db('whiteboard_events')
      .select('id', 'event_type', 'stroke_id', 'x', 'y', 't', db.raw('NULL::integer as segment_index'), 'source_id', 'color', 'width')
      .where('board_id', boardId)
      .orderBy('id', 'asc')
      .limit(MAX_HISTORY_EVENTS)) as WhiteboardEventRow[];
  }

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

const WHITEBOARD_DOC_TABLE = 'whiteboard_documents';

type ExcalidrawSnapshotElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  fillStyle?: string;
  opacity?: number;
  points?: number[][];
  isDeleted?: boolean;
  customData?: Record<string, unknown>;
  // Text-related fields
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
};

function toUpdateBuffer(value: Buffer | Uint8Array | string | null): Uint8Array {
  if (!value) return new Uint8Array(0);
  if (value instanceof Uint8Array) return value;
  if (Buffer.isBuffer(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  // base64 string fallback
  const buf = Buffer.from(value, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

async function fetchExcalidrawElements(db: Knex, boardId: string): Promise<ExcalidrawSnapshotElement[] | null> {
  try {
    const hasTable = await db.schema.hasTable(WHITEBOARD_DOC_TABLE);
    if (!hasTable) return null;

    const row = await db(WHITEBOARD_DOC_TABLE)
      .select('ydoc')
      .where({ board_id: boardId })
      .first();
    if (!row || !row.ydoc) return null;

    const update = toUpdateBuffer(row.ydoc);
    if (update.length === 0) return null;

    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);
    const map = doc.getMap('excalidraw');
    const rawElements = map.get('elements');
    doc.destroy();

    if (!Array.isArray(rawElements)) return null;

    // Filter to visible, non-deleted elements with valid coordinates
    return rawElements
      .filter((el: any) => {
        if (!el || typeof el !== 'object') return false;
        if (el.isDeleted) return false;
        if (typeof el.type !== 'string') return false;
        if (typeof el.x !== 'number' || typeof el.y !== 'number') return false;
        return true;
      })
        .map((el: any): ExcalidrawSnapshotElement => ({
        id: String(el.id || ''),
        type: el.type,
        x: el.x,
        y: el.y,
        width: typeof el.width === 'number' ? el.width : 0,
        height: typeof el.height === 'number' ? el.height : 0,
        angle: typeof el.angle === 'number' ? el.angle : undefined,
        strokeColor: typeof el.strokeColor === 'string' ? el.strokeColor : undefined,
        strokeWidth: typeof el.strokeWidth === 'number' ? el.strokeWidth : undefined,
        backgroundColor: typeof el.backgroundColor === 'string' ? el.backgroundColor : undefined,
        fillStyle: typeof el.fillStyle === 'string' ? el.fillStyle : undefined,
        opacity: typeof el.opacity === 'number' ? el.opacity : undefined,
        points: Array.isArray(el.points) ? el.points : undefined,
        isDeleted: false,
        customData: typeof el.customData === 'object' && el.customData ? el.customData : undefined,
        // Capture text and font fields explicitly so thumbnails can render textual elements
        text: typeof el.text === 'string' ? el.text : undefined,
        fontSize: typeof el.fontSize === 'number' ? el.fontSize : undefined,
        fontFamily: typeof el.fontFamily === 'string' ? el.fontFamily : undefined,
        // Prefer strokeColor for text color if available
        textColor: typeof el.strokeColor === 'string' ? el.strokeColor : undefined,
      }));
  } catch (err) {
    console.warn('[WB-HTTP] fetchExcalidrawElements error', { boardId, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
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

    // If no legacy stroke events, try to read from the Yjs document
    let excalidrawElements: ExcalidrawSnapshotElement[] | undefined;
    if (mapped.length === 0) {
      const elements = await fetchExcalidrawElements(db, boardId);
      if (elements && elements.length > 0) {
        excalidrawElements = elements;
        console.log('[WB-HTTP] excalidraw elements from ydoc', { boardId, count: elements.length });
      }
    }

    return { boardId, events: mapped, cursor, excalidrawElements };
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

        let room = await db('rooms').select('id').where({ id: boardId }).first();
        if (!room) {
          console.warn('[WB-JOIN] invite-create-room-missing', { boardId, userId, source: 'primary_db' });

          const hydrated = await hydrateMissingRoomForInvite(db, boardId, userId);
          if (!hydrated) {
            return res.status(404).json({ success: false, error: 'Not found', reason: 'room_not_found' });
          }

          room = await db('rooms').select('id').where({ id: boardId }).first();
          if (!room) {
            console.warn('[WB-JOIN] invite-create-room-missing-after-hydrate', { boardId, userId });
            return res.status(404).json({ success: false, error: 'Not found', reason: 'room_not_found' });
          }
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

        // Construct a frontend URL so opening the link in a browser navigates
        // to the React app which will attach the user's auth token and call
        // the backend API properly. Prefer `Origin` header, then env override,
        // then fall back to request host.
        const frontendOrigin = req.get('origin') || process.env.FRONTEND_URL || (req.get('host') ? `${req.protocol}://${req.get('host')}` : '');
        const joinPath = `/whiteboards/${boardId}/join`;
        const joinUrl = frontendOrigin
          ? `${frontendOrigin}${joinPath}?token=${encodeURIComponent(rawToken)}`
          : `${joinPath}?token=${encodeURIComponent(rawToken)}`;

        console.info('[WB-JOIN] invite-created', {
          boardId,
          userId,
          expiresAt: expiresAt.toISOString(),
        });

        return res.status(201).json({ joinUrl, expiresAt: expiresAt.toISOString() });
      } catch (error) {
        if (isInviteRoomForeignKeyError(error)) {
          console.warn('[WB-JOIN] invite-create-fk-room-missing', { boardId: req.validated?.params?.boardId, userId: req.user?.id });
          return res.status(404).json({ success: false, error: 'Not found', reason: 'room_not_found' });
        }

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
          if (validationReason === 'used_up' && invite) {
            const alreadyMember = await isMember(db, invite.room_id, userId);
            if (alreadyMember) {
              console.info('[WB-JOIN] join-attempt', {
                ok: true,
                reason: 'already_joined',
                roomId: invite.room_id,
                userId,
                tokenLength: token.length,
              });
              return res.status(200).json({ roomId: invite.room_id });
            }
          }

          console.info('[WB-JOIN] join-attempt', {
            ok: false,
            reason: validationReason,
            userId,
            tokenLength: token.length,
          });
          return res.status(400).json({ success: false, error: 'Join link is not valid', reason: validationReason });
        }

        let room = await db('rooms').select('id').where({ id: invite.room_id }).first();
        if (!room) {
          console.warn('[WB-JOIN] join-room-missing', { roomId: invite.room_id, userId });
          const hydrated = await hydrateMissingRoomForJoin(db, invite.room_id, invite.created_by ?? null);
          if (!hydrated) {
            return res.status(404).json({ success: false, error: 'Not found', reason: 'room_not_found' });
          }

          room = await db('rooms').select('id').where({ id: invite.room_id }).first();
          if (!room) {
            return res.status(404).json({ success: false, error: 'Not found', reason: 'room_not_found' });
          }
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

        try {
          await db('room_members')
            .insert({ room_id: invite.room_id, user_id: userId, is_owner: false })
            .onConflict(['room_id', 'user_id'])
            .ignore();
        } catch (membershipError) {
          if (!isRoomMemberUserForeignKeyError(membershipError)) {
            throw membershipError;
          }

          console.warn('[WB-JOIN] join-membership-local-fk-user-missing', {
            roomId: invite.room_id,
            userId,
          });

          const { error: supabaseMembershipError } = await supabase
            .from('room_members')
            .insert({ room_id: invite.room_id, user_id: userId, is_owner: false });

          if (supabaseMembershipError && supabaseMembershipError.code !== '23505') {
            console.warn('[WB-JOIN] join-membership-supabase-fallback-failed', {
              roomId: invite.room_id,
              userId,
              code: supabaseMembershipError.code,
              message: supabaseMembershipError.message,
            });
            throw membershipError;
          }

          console.info('[WB-JOIN] join-membership-supabase-fallback-success', {
            roomId: invite.room_id,
            userId,
          });
        }

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

  // Hub list: return rooms the authenticated user is a member of, including owner details and participants
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log('[WB-HUB] GET /api/whiteboards called', { path: req.path, user: req.user && typeof req.user.id === 'string' ? req.user.id : null });
      const userId = req.user?.id ? String(req.user.id) : null;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const memberRows = await db('room_members').select('room_id').where({ user_id: userId });
      const roomIds = Array.from(new Set((memberRows ?? []).map((r: any) => String((r as Record<string, unknown>).room_id)).filter(Boolean)));
      if (!roomIds.length) return res.json([]);

      // Fetch rooms in one query
      let rooms: Array<any> = [];
      try {
        rooms = await db('rooms')
          .select('id', 'name', 'is_group', 'created_at', 'updated_at', 'type', 'metadata', 'created_by')
          .whereIn('id', roomIds as string[]);
      } catch (error) {
        if (!isMissingColumnError(error, 'updated_at')) throw error;

        rooms = await db('rooms')
          .select('id', 'name', 'is_group', 'created_at', db.raw('created_at as updated_at'), 'type', 'metadata', 'created_by')
          .whereIn('id', roomIds as string[]);
      }

      // Fetch all members for these rooms in one query to avoid N+1
      const allMembers = await db('room_members').select('room_id', 'user_id', 'is_owner').whereIn('room_id', roomIds as string[]);
      const userIds = Array.from(new Set(allMembers.map((m: any) => String(m.user_id))));

      // Fetch user profiles for participants
      const users = userIds.length
        ? await db('users').select('id', 'username', 'avatar_url').whereIn('id', userIds as string[])
        : [];

      const usersById = new Map<string, { id: string; username: string | null; avatar_url: string | null }>();
      for (const u of users as Array<{ id?: unknown; username?: unknown; avatar_url?: unknown }>) {
        if (typeof u.id !== 'string') continue;
        usersById.set(u.id, { id: u.id, username: typeof u.username === 'string' ? u.username : null, avatar_url: typeof u.avatar_url === 'string' ? u.avatar_url : null });
      }

      const membersByRoom = new Map<string, Array<{ user_id: string; is_owner: boolean }>>();
      for (const m of allMembers as Array<{ room_id?: unknown; user_id?: unknown; is_owner?: unknown }>) {
        if (typeof m.room_id !== 'string' || typeof m.user_id !== 'string') continue;
        const list = membersByRoom.get(m.room_id) ?? [];
        list.push({ user_id: m.user_id, is_owner: Boolean(m.is_owner) });
        membersByRoom.set(m.room_id, list);
      }

      const hubItems = (rooms as Array<any>)
        .map((r) => {
          const roomId = String(r.id);
          const members = membersByRoom.get(roomId) ?? [];
          // Determine owner: prefer explicit is_owner flag, fall back to created_by
          const ownerMember = members.find((m) => m.is_owner) ?? null;
          const ownerId = ownerMember ? ownerMember.user_id : (typeof r.created_by === 'string' ? r.created_by : null);
          const ownerProfile = ownerId ? usersById.get(ownerId) ?? { id: ownerId, username: null, avatar_url: null } : null;

          const participants = members
            .map((m) => {
              const profile = usersById.get(m.user_id) ?? { id: m.user_id, username: null, avatar_url: null };
              return { id: m.user_id, username: profile.username, avatar_url: profile.avatar_url };
            })
            .filter(Boolean);

          return {
            id: roomId,
            name: typeof r.name === 'string' ? r.name : null,
            created_at: r.created_at,
            updated_at: r.updated_at ?? r.created_at,
            type: r.type,
            metadata: r.metadata ?? null,
            owner: ownerProfile ? { id: ownerProfile.id, username: ownerProfile.username, avatar_url: ownerProfile.avatar_url } : null,
            participants,
          };
        })
        // newest first
        .sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at));

      return res.json(hubItems);
    } catch (err) {
      console.error('[WB-HUB] list failed', { error: err });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // PUT: update whiteboard name (owner only)
  router.put('/:boardId', validateRequest({ params: BoardIdParamsSchema }), async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log('[WB-HTTP] PUT /api/whiteboards/:boardId called', { path: req.path, user: req.user && typeof req.user.id === 'string' ? req.user.id : null });
      const userId = req.user?.id ? String(req.user.id) : null;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const boardId = req.validated?.params?.boardId;
      if (!boardId) return res.status(400).json({ success: false, error: 'Invalid request' });

      const { name } = req.body || {};
      if (!name || typeof name !== 'string') return res.status(400).json({ success: false, error: 'Name is required' });
      
      const trimmedName = name.trim();
      if (!trimmedName) return res.status(400).json({ success: false, error: 'Name cannot be empty' });
      if (trimmedName.length > 100) return res.status(400).json({ success: false, error: 'Name too long' });

      const owner = await isBoardOwner(db, boardId, userId);
      if (!owner) return res.status(403).json({ success: false, error: 'Forbidden' });

      const updatedAt = new Date().toISOString();

      let updated: unknown;
      try {
        updated = await db('rooms').where({ id: boardId }).update({
          name: trimmedName,
          updated_at: updatedAt,
        });
      } catch (error) {
        if (!isMissingColumnError(error, 'updated_at')) throw error;
        updated = await db('rooms').where({ id: boardId }).update({ name: trimmedName });
      }

      if (toAffectedRows(updated) === 0) {
        // Local dev can run with a split data plane where API DB and Supabase aren't the same.
        // In that case, persist rename directly to Supabase instead of returning false success.
        const { data: fallbackRow, error: fallbackError } = await supabase
          .from('rooms')
          .update({ name: trimmedName })
          .eq('id', boardId)
          .select('id')
          .maybeSingle();

        if (fallbackError) {
          console.warn('[WB-HTTP] update fallback failed', {
            boardId,
            userId,
            code: fallbackError.code,
            message: fallbackError.message,
          });
          return res.status(500).json({ success: false, error: 'Unable to persist whiteboard name' });
        }

        if (!fallbackRow?.id) {
          return res.status(404).json({ success: false, error: 'Whiteboard not found' });
        }

        console.log('[WB-HTTP] update fallback applied', { boardId, userId });
      }

      return res.status(200).json({ success: true, name: trimmedName });
    } catch (err) {
      console.error('[WB-HTTP] update failed', { error: err });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // DELETE: delete a whiteboard (owner only)
  router.delete('/:boardId', validateRequest({ params: BoardIdParamsSchema }), async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log('[WB-HTTP] DELETE /api/whiteboards/:boardId called', { path: req.path, user: req.user && typeof req.user.id === 'string' ? req.user.id : null });
      const userId = req.user?.id ? String(req.user.id) : null;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const boardId = req.validated?.params?.boardId;
      if (!boardId) return res.status(400).json({ success: false, error: 'Invalid request' });

      const owner = await isBoardOwner(db, boardId, userId);
      if (!owner) return res.status(403).json({ success: false, error: 'Forbidden' });

      // perform clean delete in transaction
      await db.transaction(async (trx) => {
        await trx('whiteboard_events').where({ board_id: boardId }).del();
        await trx('whiteboard_invites').where({ room_id: boardId }).del();
        await trx('room_members').where({ room_id: boardId }).del();
        await trx('rooms').where({ id: boardId }).del();
      });

      return res.status(204).send();
    } catch (err) {
      console.error('[WB-HTTP] delete failed', { error: err });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // DELETE: leave a whiteboard (remove own membership)
  router.delete('/:boardId/leave', validateRequest({ params: BoardIdParamsSchema }), async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log('[WB-HTTP] DELETE /api/whiteboards/:boardId/leave called', { path: req.path, user: req.user && typeof req.user.id === 'string' ? req.user.id : null });
      const userId = req.user?.id ? String(req.user.id) : null;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const boardId = req.validated?.params?.boardId;
      if (!boardId) return res.status(400).json({ success: false, error: 'Invalid request' });

      const existing = await db('room_members').where({ room_id: boardId, user_id: userId }).first();
      if (!existing) {
        // If membership isn't in primary DB, attempt Supabase fallback to support eventual-consistency dev setups.
        if (process.env.NODE_ENV === 'test') {
          return res.status(404).json({ success: false, error: 'Not found' });
        }

        try {
          const { data: deleted, error: delErr } = await supabase
            .from('room_members')
            .delete()
            .eq('room_id', boardId)
            .eq('user_id', userId);

          if (delErr) {
            console.warn('[WB-HTTP] leave:supabase-delete-failed', { boardId, userId, code: delErr.code, message: delErr.message });
            return res.status(404).json({ success: false, error: 'Not found' });
          }

          // Treat as idempotent: whether Supabase deleted rows or not,
          // respond success to make leave safe to call repeatedly.
          if (Array.isArray(deleted) && deleted.length > 0) {
            console.log('[WB-HTTP] leave:supabase-deleted', { boardId, userId, count: deleted.length });
          } else {
            console.log('[WB-HTTP] leave:supabase-no-op', { boardId, userId });
          }
          return res.status(200).json({ success: true });
        } catch (e) {
          console.error('[WB-HTTP] leave:supabase-fallback-error', { boardId, userId, error: e });
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }
      }

      await db('room_members').where({ room_id: boardId, user_id: userId }).del();
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[WB-HTTP] leave failed', { error: err });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  return router;
};

