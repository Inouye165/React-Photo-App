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
  type: z.enum(['general', 'potluck']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const PatchRoomParamsSchema = z.object({
  roomId: z.string().uuid(),
});

export default function createChatRouter({ db }: { db: Knex }) {
  const router = Router();

  // PATCH /api/v1/chat/rooms/:roomId
  router.patch(
    '/rooms/:roomId',
    validateRequest({ params: PatchRoomParamsSchema, body: PatchRoomBodySchema }),
    async (req: AuthenticatedRequest, res, next) => {
    try {
      const { roomId } = req.params as { roomId: string };
      const { type, metadata } = req.body as { type?: 'general' | 'potluck'; metadata?: Record<string, unknown> };
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
