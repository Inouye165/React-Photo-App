import { Router, Request } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';

const { validateRequest } = require('../validation/validateRequest');

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
  };
};

const PatchRoomBodySchema = z.object({
  type: z.enum(['general', 'potluck', 'collaboration']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const PatchRoomParamsSchema = z.object({
  roomId: z.string().uuid(),
});

const DirectRoomBodySchema = z.object({
  otherUserId: z.string().uuid(),
});

export default function createChatRouter({ db }: { db: Knex }) {
  const router = Router();

  // POST /api/v1/chat/rooms/direct
  router.post(
    '/rooms/direct',
    validateRequest({ body: DirectRoomBodySchema }),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const userId = req.user?.id;
        const { otherUserId } = req.body as { otherUserId: string };

        if (!userId) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        if (otherUserId === userId) {
          return res.status(400).json({ error: 'Cannot create a direct message room with yourself' });
        }

        const existingRoom = await db('rooms as r')
          .join('room_members as me', function joinMe() {
            this.on('me.room_id', '=', 'r.id').andOnVal('me.user_id', '=', userId);
          })
          .join('room_members as other', function joinOther() {
            this.on('other.room_id', '=', 'r.id').andOnVal('other.user_id', '=', otherUserId);
          })
          .where('r.is_group', false)
          .orderBy('r.created_at', 'desc')
          .select('r.id', 'r.name', 'r.is_group', 'r.created_at', 'r.type', 'r.metadata')
          .first();

        if (existingRoom) {
          return res.json({ success: true, room: existingRoom });
        }

        const room = await db.transaction(async (trx) => {
          const insertedRows = await trx('rooms')
            .insert({ name: null, is_group: false, created_by: userId })
            .returning(['id', 'name', 'is_group', 'created_at', 'type', 'metadata']);

          const insertedRoom = insertedRows[0];
          if (!insertedRoom) {
            throw new Error('Failed to create room');
          }

          await trx('room_members').insert([
            { room_id: insertedRoom.id, user_id: userId, is_owner: true },
            { room_id: insertedRoom.id, user_id: otherUserId, is_owner: false },
          ]);

          return insertedRoom;
        });

        return res.status(201).json({ success: true, room });
      } catch (err) {
        return next(err);
      }
    },
  );

  // PATCH /api/v1/chat/rooms/:roomId
  router.patch(
    '/rooms/:roomId',
    validateRequest({ params: PatchRoomParamsSchema, body: PatchRoomBodySchema }),
    async (req: AuthenticatedRequest, res, next) => {
    try {
      const { roomId } = req.params as { roomId: string };
      const { type, metadata } = req.body as {
        type?: 'general' | 'potluck' | 'collaboration';
        metadata?: Record<string, unknown>;
      };
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Security: Ensure user is a member of the room
      const membership = await db('room_members')
        .where({ room_id: roomId, user_id: userId })
        .first();

      if (!membership) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updatePayload: Record<string, unknown> = {};
      if (type) updatePayload.type = type;

      if (metadata) {
        const currentRoom = await db('rooms').select('metadata').where('id', roomId).first();
        const currentMeta = (currentRoom && typeof currentRoom.metadata === 'object' && currentRoom.metadata) || {};
        updatePayload.metadata = { ...(currentMeta as Record<string, unknown>), ...metadata };
      }

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      const [updatedRoom] = await db('rooms')
        .where({ id: roomId })
        .update(updatePayload)
        .returning(['id', 'type', 'metadata']);

      return res.json({ success: true, room: updatedRoom });
    } catch (err) {
      return next(err);
    }
    },
  );

  return router;
}

module.exports = createChatRouter;
