import { Router, Request } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';

const { validateRequest } = require('../validation/validateRequest');
const supabase = require('../lib/supabaseClient');

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

const SendMessageBodySchema = z.object({
  content: z.string().optional(),
  photoId: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).nullable().optional(),
});

export default function createChatRouter({ db }: { db: Knex }) {
  const router = Router();

  router.post(
    '/rooms/:roomId/messages',
    validateRequest({ params: PatchRoomParamsSchema, body: SendMessageBodySchema }),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const { roomId } = req.params as { roomId: string };
        const userId = req.user?.id;
        const { content, photoId } = req.body as {
          content?: string;
          photoId?: number | string | null;
        };

        if (!userId) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const { data: membership, error: membershipError } = await supabase
          .from('room_members')
          .select('room_id, user_id')
          .eq('room_id', roomId)
          .eq('user_id', userId)
          .maybeSingle();

        if (membershipError) {
          return res.status(500).json({ error: 'Failed to verify room membership' });
        }

        if (!membership) {
          return res.status(403).json({ error: 'You are not a member of this room.' });
        }

        const trimmedContent = typeof content === 'string' ? content.trim() : '';
        const normalizedPhotoId = photoId == null
          ? null
          : typeof photoId === 'string'
            ? Number(photoId)
            : photoId;

        if (!trimmedContent && normalizedPhotoId == null) {
          return res.status(400).json({ error: 'Message content is empty' });
        }

        const { data: insertedMessage, error: insertError } = await supabase
          .from('messages')
          .insert({
            room_id: roomId,
            sender_id: userId,
            content: trimmedContent,
            photo_id: normalizedPhotoId,
          })
          .select('id, room_id, sender_id, content, photo_id, created_at')
          .single();

        if (insertError || !insertedMessage) {
          return res.status(500).json({ error: 'Failed to send message' });
        }

        return res.status(201).json(insertedMessage);
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
